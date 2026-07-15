/**
 * ════════════════════════════════════════════════════════════════
 *  SecurityEventService - خدمة تسجيل الأحداث الأمنية
 *
 *  الفارق عن BaseService العادي:
 *  ────────────────────────────────────────────────────────────
 *  - يستخدم injectTenantIdOptional (لا يرمي خطأ إن لم يوجد tenant)
 *  - يُستدعى من سياقات ما قبل تسجيل الدخول (محاولات الدخول الفاشلة)
 *  - RLS في Migration 0015 يسمح بـ INSERT من anon أو authenticated
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, SdkError } from './BaseService';
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

export interface SecurityEventRecord {
  id: string;
  tenant_id: string | null;
  type: string;
  threat_level: string;
  user_id: string | null;
  user_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SecurityEventInput {
  type: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  userId?: string | null;
  userName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: string | null;
  metadata?: Record<string, unknown>;
}

class SecurityEventService extends BaseService<SecurityEventRecord> {
  constructor() {
    super('security_events');
  }

  /**
   * تسجيل حدث أمني.
   * لا يرمي خطأ عند الفشل — التسجيل الأمني لا يجب أن يوقف التطبيق.
   */
  async recordEvent(event: SecurityEventInput): Promise<void> {
    try {
      const payload = this.injectTenantIdOptional({
        type: event.type,
        threat_level: event.threatLevel,
        user_id: event.userId ?? null,
        user_name: event.userName ?? null,
        ip_address: event.ipAddress ?? null,
        user_agent: event.userAgent ?? null,
        details: event.details ?? null,
        metadata: event.metadata ?? {},
      } as Partial<SecurityEventRecord>);

      const { error } = await supabase.from(this.tableName).insert(payload);
      if (error) {
        logger.warn('SecurityEventService.recordEvent failed', {
          component: 'SecurityEventService',
          action: 'recordEvent',
          error: error.message,
          eventType: event.type,
        });
      }
    } catch (err) {
      // fire-and-forget — لا نرمي أخطاء لطبقة الاستدعاء
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('SecurityEventService.recordEvent exception', {
        component: 'SecurityEventService',
        action: 'recordEvent',
        error: msg,
      });
    }
  }
}

export const securityEventService = new SecurityEventService();
