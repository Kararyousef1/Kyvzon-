/**
 * ════════════════════════════════════════════════════════════════
 *  DepartmentService - خدمة الأقسام
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { DepartmentRecord } from '../../shared/types/sdk';
import { supabase } from '../supabase/supabase';

class DepartmentService extends BaseService<DepartmentRecord> {
  constructor() { super('departments'); }

  async findActive(): Promise<DepartmentRecord[]> {
    try {
      const tenantId = localStorage.getItem('tenant_id');
      if (!tenantId) return [];

      // 1. جلب الأقسام الخاصة بالشركة
      let depts = await this.findAll({ filters: { is_active: true }, orderBy: 'name_ar', ascending: true });

      // 2. إذا لم يكن هناك أي أقسام للشركة، نقوم بنسخ الأقسام الافتراضية من structure_departments تلقائياً!
      if (depts.length === 0) {
        const { data: defaultDepts, error } = await supabase
          .from('structure_departments')
          .select('name_ar, name_en')
          .eq('is_active', true);

        if (!error && defaultDepts && defaultDepts.length > 0) {
          const payload = defaultDepts.map(d => ({
            tenant_id: tenantId,
            name_ar: d.name_ar,
            name_en: d.name_en,
            is_active: true
          }));

          const { data: inserted, error: insertError } = await supabase
            .from('departments')
            .insert(payload)
            .select();

          if (!insertError && inserted) {
            depts = inserted as unknown as DepartmentRecord[];
          }
        }
      }

      return depts;
    } catch (err) {
      console.warn('DepartmentService.findActive auto-seed failed:', err);
      return [];
    }
  }

  async findTree(): Promise<(DepartmentRecord & { children?: DepartmentRecord[] })[]> {
    const all = await this.findActive();
    const topLevel = all.filter(d => !d.parent_department_id);
    return topLevel.map(dept => ({
      ...dept,
      children: all.filter(d => d.parent_department_id === dept.id),
    }));
  }

  async findDepartmentsWithManager(): Promise<DepartmentRecord[]> {
    return this.findAll({ filters: { is_active: true, manager_id: undefined }, orderBy: 'name_ar', ascending: true });
  }

  /** تعيين أدوار القسم (مشرف/مدير/مدير مباشر/مسؤول مشتريات). null يزيل التعيين. */
  async assignRoles(
    departmentId: string,
    roles: { supervisor_id?: string | null; manager_id?: string | null; direct_manager_id?: string | null; procurement_manager_id?: string | null },
  ): Promise<DepartmentRecord> {
    const payload: Record<string, unknown> = {};
    if ('supervisor_id' in roles) payload.supervisor_id = roles.supervisor_id || null;
    if ('manager_id' in roles) payload.manager_id = roles.manager_id || null;
    if ('direct_manager_id' in roles) payload.direct_manager_id = roles.direct_manager_id || null;
    if ('procurement_manager_id' in roles) payload.procurement_manager_id = roles.procurement_manager_id || null;
    return this.update(departmentId, payload);
  }

  /**
   * يحسب الأدوار الفعّالة لقسم مع الوراثة من الأقسام الأب:
   *  - supervisor: خاص بالقسم فقط (لا يُورَث).
   *  - manager / direct_manager / procurement_manager: يُورَثان من أقرب قسم أب يملكهما إن كانا فارغين.
   * يعيد أيضاً مصدر كل قيمة (own | inherited) للعرض.
   */
  async resolveEffectiveRoles(departmentId: string): Promise<{
    supervisor_id: string | null;
    manager_id: string | null;
    manager_inherited: boolean;
    direct_manager_id: string | null;
    direct_manager_inherited: boolean;
    procurement_manager_id: string | null;
    procurement_manager_inherited: boolean;
  }> {
    const all = await this.findActive();
    const byId = new Map(all.map((d) => [d.id, d]));

    const self = byId.get(departmentId);
    const supervisor_id = (self as any)?.supervisor_id || null;

    // يمشي لأعلى السلسلة لإيجاد أول قيمة غير فارغة لحقل معيّن
    const walkUp = (field: 'manager_id' | 'direct_manager_id' | 'procurement_manager_id'): { id: string | null; inherited: boolean } => {
      let node = self;
      let depth = 0;
      let inherited = false;
      while (node && depth < 20) {
        const val = (node as any)[field];
        if (val) return { id: val, inherited };
        node = (node as any).parent_department_id ? byId.get((node as any).parent_department_id) : undefined;
        inherited = true;
        depth++;
      }
      return { id: null, inherited: false };
    };

    const mgr = walkUp('manager_id');
    const dm = walkUp('direct_manager_id');
    const pm = walkUp('procurement_manager_id');

    return {
      supervisor_id,
      manager_id: mgr.id,
      manager_inherited: mgr.inherited,
      direct_manager_id: dm.id,
      direct_manager_inherited: dm.inherited,
      procurement_manager_id: pm.id,
      procurement_manager_inherited: pm.inherited,
    };
  }

  /** موظفو قسم معيّن (من جدول employees عبر department_id) */
  async findEmployeesByDepartment(departmentId: string): Promise<Array<{ id: string; first_name?: string; last_name?: string; user_id?: string; position?: string }>> {
    const tenantId = localStorage.getItem('tenant_id');
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, user_id, position')
      .eq('department_id', departmentId)
      .eq('tenant_id', tenantId)
      .order('first_name', { ascending: true });
    if (error) return [];
    return (data as any[]) || [];
  }
}

class SpecialtyService extends BaseService {
  constructor() { super('specialties'); }

  async findAllSpecialties(): Promise<any[]> {
    return this.findAll({ orderBy: 'name', ascending: true });
  }

  async createSpecialty(data: { name: string; name_en?: string; description?: string; department?: string; role_level?: string }): Promise<any> {
    return this.create(data as unknown as Record<string, unknown>);
  }

  async deleteSpecialty(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

export const departmentService = new DepartmentService();
export const specialtyService = new SpecialtyService();
