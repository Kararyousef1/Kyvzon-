/**
 * PortalUnitService — طبقة SDK لوحدات بوابتَي المدير والمشرف
 *
 * ═════════════════════════════════════════════════════════════════════════
 * معمارية الوحدات (0302): بدل دور جديد لكل بوابة، نُبقي دورين خشنين
 * (manager / supervisor) ونُسند لكل منهما وحدات بنطاق صريح.
 *
 * الأمان: هذه الطبقة للعرض (UX). الحماية الحقيقية في:
 *   • RLS على portal_unit_assignments (فلترة بالمستأجر)
 *   • has_portal_unit() و is_in_my_team() داخل دوال القاعدة
 * ═════════════════════════════════════════════════════════════════════════
 */
import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';
import type {
  PortalUnitBaseRole,
  PortalUnitKey,
  PortalUnitScopeType,
} from '../../shared/constants/portalUnits';

export interface PortalUnitAssignmentRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  base_role: PortalUnitBaseRole;
  unit_key: PortalUnitKey;
  scope_type: PortalUnitScopeType;
  scope_id: string | null;
  is_active: boolean;
  origin: 'manual' | 'org_sync';
  assigned_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** صف مُعاد من my_portal_units() — أسماء ببادئة out_ لتفادي الالتباس */
export interface MyPortalUnitRow {
  out_base_role: PortalUnitBaseRole;
  out_unit_key: PortalUnitKey;
  out_scope_type: PortalUnitScopeType;
  out_scope_id: string | null;
}

/** شكل مُبسَّط للاستهلاك في الواجهة */
export interface MyPortalUnit {
  baseRole: PortalUnitBaseRole;
  unitKey: PortalUnitKey;
  scopeType: PortalUnitScopeType;
  scopeId: string | null;
}

export interface AssignUnitInput {
  userId: string;
  baseRole: PortalUnitBaseRole;
  unitKey: PortalUnitKey;
  scopeType: PortalUnitScopeType;
  /** إلزامي مع department/branch · يجب أن يكون null مع tenant */
  scopeId?: string | null;
  notes?: string;
}

class PortalUnitService extends BaseService<PortalUnitAssignmentRecord> {
  constructor() {
    super('portal_unit_assignments');
  }

  /**
   * وحدات المستخدم الحالي.
   * تُستدعى من الشريط الجانبي وحرّاس المسارات.
   */
  async findMyUnits(): Promise<MyPortalUnit[]> {
    const { data, error } = await supabase.rpc('my_portal_units');
    if (error) throw new Error(error.message);

    return ((data ?? []) as MyPortalUnitRow[]).map((row) => ({
      baseRole: row.out_base_role,
      unitKey: row.out_unit_key,
      scopeType: row.out_scope_type,
      scopeId: row.out_scope_id,
    }));
  }

  /** هل للمستخدم الحالي هذه الوحدة؟ المدير يشمل صلاحية المشرف. */
  async hasUnit(baseRole: PortalUnitBaseRole, unitKey: PortalUnitKey): Promise<boolean> {
    const { data, error } = await supabase.rpc('has_portal_unit', {
      p_base_role: baseRole,
      p_unit_key: unitKey,
    });
    if (error) return false;
    return data === true;
  }

  /** إسنادات مستخدم بعينه — لشاشة إدارة المستخدمين */
  async findForUser(userId: string): Promise<PortalUnitAssignmentRecord[]> {
    if (!userId) return [];
    return this.findWhere(
      [
        { column: 'user_id', value: userId },
        { column: 'is_active', value: true },
      ],
      { orderBy: 'unit_key', ascending: true },
    );
  }

  /**
   * مزامنة وحدات مستخدم مع القائمة المطلوبة.
   *
   * لا حذف نهائي — ما يخرج من القائمة يُعطَّل (is_active=false)
   * التزاماً بسياسة archive/cancel/void.
   */
  async syncUserUnits(
    userId: string,
    tenantId: string,
    desired: AssignUnitInput[],
  ): Promise<void> {
    const existing = await this.findForUser(userId);

    const keyOf = (u: { baseRole: string; unitKey: string; scopeType: string; scopeId?: string | null }) =>
      `${u.baseRole}|${u.unitKey}|${u.scopeType}|${u.scopeId ?? ''}`;
    const keyOfRow = (r: PortalUnitAssignmentRecord) =>
      `${r.base_role}|${r.unit_key}|${r.scope_type}|${r.scope_id ?? ''}`;

    const desiredKeys = new Set(desired.map(keyOf));
    const existingKeys = new Set(existing.map(keyOfRow));

    // تعطيل ما لم يعد مطلوباً
    const toDeactivate = existing.filter((r) => !desiredKeys.has(keyOfRow(r)));
    for (const row of toDeactivate) {
      await this.update(row.id, { is_active: false } as Partial<PortalUnitAssignmentRecord>);
    }

    // إضافة الجديد
    const toInsert = desired.filter((d) => !existingKeys.has(keyOf(d)));
    if (toInsert.length > 0) {
      const { error } = await supabase.from('portal_unit_assignments').insert(
        toInsert.map((d) => ({
          tenant_id: tenantId,
          user_id: userId,
          base_role: d.baseRole,
          unit_key: d.unitKey,
          scope_type: d.scopeType,
          scope_id: d.scopeType === 'tenant' ? null : (d.scopeId ?? null),
          is_active: true,
          origin: 'manual',
          notes: d.notes ?? null,
        })),
      );
      if (error) throw new Error(error.message);
    }

    // إعادة تفعيل ما كان معطَّلاً وعاد مطلوباً
    const toReactivate = existing.filter(
      (r) => desiredKeys.has(keyOfRow(r)) && !r.is_active,
    );
    for (const row of toReactivate) {
      await this.update(row.id, { is_active: true } as Partial<PortalUnitAssignmentRecord>);
    }
  }
}

export const portalUnitService = new PortalUnitService();
export default portalUnitService;
