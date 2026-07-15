/**
 * ════════════════════════════════════════════════════════════════
 *  ErrorLogService - خدمة سجل أخطاء التطبيق
 *
 *  خاصية مهمة:
 *  ────────────────────────────────────────────────────────────
 *  - يستخدم injectTenantIdOptional (لا يفشل إذا لم يوجد tenant)
 *  - يُستدعى غالباً من ErrorBoundary — قد يحدث قبل تسجيل الدخول
 *  - RLS في Migration 0015 يسمح بـ INSERT من anon أيضاً
 *  - fire-and-forget: لا يرمي أخطاء (خشية أن يسبب حلقة أخطاء)
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';
import type { ErrorLogRecord } from '../../shared/types/sdk';

export interface ErrorLogInput {
  message: string;
  source?: string;
  stack_trace?: string;
  /** يقبل قيماً واسعة (low/medium/high/critical/info/warning/error) للتوافق مع أنظمة تسجيل مختلفة */
  severity?: string;
  category?: string;
  file_name?: string;
  line_number?: number;
  user_agent?: string;
  route?: string;
  environment?: string;
  user_id?: string | null;
  metadata?: Record<string, unknown>;
}

class ErrorLogService extends BaseService<ErrorLogRecord> {
  constructor() {
    super('error_logs');
  }

  /**
   * تسجيل خطأ. لا يرمي أخطاء (fire-and-forget).
   * أُعيد التسمية إلى logError لكن يبقى create مدعوماً للتوافق.
   */
  async logError(data: ErrorLogInput): Promise<void> {
    try {
      const payload = this.injectTenantIdOptional(
        data as unknown as Partial<ErrorLogRecord>,
      );

      const { error } = await supabase.from(this.tableName).insert(payload);
      if (error) {
        // لا نستخدم logger هنا كي لا نُغرق console بحلقة errors
        console.warn('ErrorLogService.logError failed:', error.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('ErrorLogService.logError exception:', msg);
    }
  }
}

export const errorLogService = new ErrorLogService();
