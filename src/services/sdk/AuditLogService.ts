/**
 * ════════════════════════════════════════════════════════════════
 *  AuditLogService - خدمة سجل العمليات (نسخة SDK جديدة)
 *  مسؤولة عن: CRUD لسجل العمليات (audit_logs)
 * ════════════════════════════════════════════════════════════════
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

  /**
   * جلب جميع سجلات العمليات مع معلومات المستخدم (مع join)
   */
  async findAllWithProfiles(options?: {
    limit?: number;
    offset?: number;
  }): Promise<AuditLogRecord[]> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*, profiles:actor_id(full_name, email)');

      const tenantId = getCurrentTenantId();
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      query = query.order('timestamp', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AuditLogRecord[];
    } catch (error) {
      console.error('AuditLogService.findAllWithProfiles error:', error);
      return [];
    }
  }

  /**
   * جلب جميع سجلات العمليات
   */
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

  /**
   * جلب سجل عملية واحد
   */
  async findLogById(id: string): Promise<AuditLogRecord | null> {
    return this.findById(id);
  }

  /**
   * إنشاء سجل عملية جديد.
   * يستخدم injectTenantIdOptional — لأن بعض العمليات (تصدير بيانات dev,
   * أحداث ما قبل التسجيل) قد لا يكون لها tenant.
   * لا يرمي أخطاء — التسجيل fire-and-forget.
   */
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

  /**
   * عدد العمليات في يوم محدد
   */
  async countTodayActions(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allLogs = await this.findAll({
      orderBy: 'timestamp',
      ascending: false,
    });

    return allLogs.filter((l) => new Date(l.timestamp).getTime() >= today.getTime()).length;
  }

  /**
   * جلب آخر سجلات العمليات مع معلومات المستخدم
   */
  async findRecentLogs(limit: number = 5): Promise<AuditLogRecord[]> {
    return this.findAllWithProfiles({ limit });
  }
}

export const auditLogService = new AuditLogService();
