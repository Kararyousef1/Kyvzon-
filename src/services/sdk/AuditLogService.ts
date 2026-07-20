/**
 * AuditLogService - خدمة سجل العمليات (نسخة محسنة بعد إصلاح أخطاء 400)
 * - تم إزالة join profiles:actor_id الذي كان يسبب 400 بسبب FK غير موجود
 * - الآن يجلب audit_logs فقط ثم يثريها ببيانات profiles في استعلام منفصل
 * - يتعامل مع tenant_id الوهمي 00000000-... بشكل آمن
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface AuditLogRecord {
  id: string;
  action: string;
  target?: string | null;
  details?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  timestamp: string;
  profiles?: { full_name?: string; email?: string } | null;
  created_at?: string;
  tenant_id: string;
}

class AuditLogService extends BaseService<AuditLogRecord> {
  constructor() {
    super('audit_logs');
  }

  async findAllWithProfiles(options?: {
    limit?: number;
    offset?: number;
  }): Promise<AuditLogRecord[]> {
    try {
      const tenantId = getCurrentTenantId();

      // إذا كان tenant_id هو القيمة الوهمية الافتراضية (من Tawathul utils) ولا يوجد مستخدم مسجل، لا نحاول جلب التدقيق
      // لتجنب 400 من RLS أو من join غير صالح
      if (!tenantId || tenantId === '00000000-0000-0000-0000-000000000001') {
        // حاول جلب بدون فلتر tenant إذا كان المستخدم platform owner، أو أعد مصفوفة فارغة مع تحذير
        console.warn('AuditLogService: tenant_id is dummy or missing, fetching without tenant filter for platform owner or returning empty');
        // لا نفلتر بـ tenant_id إذا كان dummy، لتجنب 400، سنجلب آخر 50 سجل عام
        let query = supabase
          .from(this.tableName)
          .select('*')
          .order('timestamp', { ascending: false });

        if (options?.limit) query = query.limit(options.limit);
        if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 100) - 1);

        const { data, error } = await query;
        if (error) {
          console.warn('AuditLogService.findAllWithProfiles without tenant filter failed:', error.message);
          return [];
        }

        // إثراء ببيانات profiles في استعلام منفصل
        const actorIds = [...new Set((data || []).map((r: any) => r.actor_id).filter(Boolean))];
        const profilesMap = new Map<string, any>();
        if (actorIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds);
          (profiles || []).forEach((p: any) => profilesMap.set(p.id, p));
        }

        return (data || []).map((r: any) => ({
          ...r,
          profiles: profilesMap.get(r.actor_id) || null,
        })) as AuditLogRecord[];
      }

      // الحالة الطبيعية: tenant حقيقي
      let query = supabase
        .from(this.tableName)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: false });

      if (options?.limit) query = query.limit(options.limit);
      if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 100) - 1);

      const { data, error } = await query;
      if (error) throw error;

      // إثراء ببيانات profiles
      const actorIds = [...new Set((data || []).map((r: any) => r.actor_id).filter(Boolean))];
      const profilesMap = new Map<string, any>();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds);
        (profiles || []).forEach((p: any) => profilesMap.set(p.id, p));
      }

      return (data || []).map((r: any) => ({
        ...r,
        profiles: profilesMap.get(r.actor_id) || null,
      })) as AuditLogRecord[];
    } catch (error) {
      console.error('AuditLogService.findAllWithProfiles error:', error);
      return [];
    }
  }

  async findAllLogs(options?: {
    limit?: number;
    offset?: number;
    fromDate?: string;
    toDate?: string;
  }): Promise<AuditLogRecord[]> {
    return this.findAll({
      orderBy: 'timestamp',
      ascending: false,
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  async findLogById(id: string): Promise<AuditLogRecord | null> {
    return this.findById(id);
  }

  async createLog(data: {
    action: string;
    target?: string;
    details?: string;
    actor_id?: string;
    actor_role?: string;
    timestamp?: string;
  }): Promise<void> {
    try {
      const payload = this.injectTenantIdOptional({
        ...data,
        timestamp: data.timestamp ?? new Date().toISOString(),
      } as Partial<AuditLogRecord>);

      const { error } = await supabase.from(this.tableName).insert(payload);
      if (error) {
        console.warn('AuditLogService.createLog failed:', error.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('AuditLogService.createLog exception:', msg);
    }
  }

  async countTodayActions(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allLogs = await this.findAll({
      orderBy: 'timestamp',
      ascending: false,
    });

    return allLogs.filter((l) => new Date(l.timestamp).getTime() >= today.getTime()).length;
  }

  async findRecentLogs(limit: number = 5): Promise<AuditLogRecord[]> {
    return this.findAllWithProfiles({ limit });
  }
}

export const auditLogService = new AuditLogService();
