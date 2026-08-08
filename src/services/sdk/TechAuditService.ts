/**
 * ════════════════════════════════════════════════════════════════════════
 *  TechAuditService — سجلّ التدقيق الموحّد وسجلّ الأخطاء والمهام المجدولة
 *
 *  ═══ الفجوات التي يسدّها (فُحصت على القاعدة) ══════════════════════════
 *
 *  ① سجلّ التدقيق كان مُبعثَراً على **16 جدولاً** بلا عرض موحّد:
 *     `audit_logs` · `audit_vault` · `contract_audit_log` · `crm_audit_log`
 *     · `finance_audit_events` · `inventory_audit_log` · `invoice_audit_log`
 *     · `movement_audit_events` · `mrp_audit_log` · `permission_audit_logs`
 *     · `po_audit_log` · `pr_audit_log` · `procurement_audit_events`
 *     · `rfx_event_audit_log` · `supplier_audit_log` · `platform_audit_log`
 *
 *     مقيس: **صفر** دالة تجميع. فمسؤول التقنية الذي يسأل «من غيّر هذا؟»
 *     عليه أن يعرف الوحدة أولاً ثم يفتح جدولها.
 *
 *  ② `error_logs` بلا واجهة رغم احتوائه `stack_trace` و`route`
 *     و`severity` — أي كل ما يلزم للتشخيص.
 *
 *  ③ `scheduled_job_runs` بلا واجهة، وبلا `tenant_id` أصلاً.
 *
 *  ★ قرارا عزل صريحان (امتداد لـ0328):
 *    · `platform_audit_log` **مُستثنى** من السجلّ الموحّد: بيانات منصة.
 *    · المهام المجدولة تُعرض **مُجمَّعة** بلا `tenants_processed` ولا
 *      `details` — هذان يكشفان حجم العملاء الآخرين ونشاطهم.
 * ════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

/** حدث تدقيق واحد بعد التوحيد */
export interface AuditEvent {
  module: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  occurredAt: string | null;
}

/** وحدة لها أحداث تدقيق — لبناء المرشّحات */
export interface AuditModule {
  module: string;
  events: number;
  last: string | null;
}

/** خطأ مُسجَّل */
export interface TechError {
  id: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string | null;
  source: string | null;
  route: string | null;
  file: string | null;
  line: number | null;
  stack: string | null;
  createdAt: string | null;
}

/** عدّاد خطورة — كل مستوى يظهر ولو بصفر */
export interface ErrorSeverityCount {
  severity: string;
  count: number;
  last: string | null;
}

/** حالة مهمة مجدولة (مُجمَّعة) */
export interface ScheduledJob {
  jobName: string;
  lastRun: string | null;
  lastStatus: string | null;
  durationMs: number | null;
  runs24h: number;
  failures24h: number;
  isHealthy: boolean;
}

class TechAuditService {
  /** السجلّ الموحّد بترشيح وترقيم */
  async auditTrail(opts?: {
    module?: string | null;
    search?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    const { data, error } = await supabase.rpc('tech_audit_trail', {
      p_module: opts?.module ?? null,
      p_search: opts?.search ?? null,
      p_limit: opts?.limit ?? 100,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      console.error('auditTrail فشل:', error.message);
      return [];
    }
    type Raw = {
      out_module: string; out_actor_id: string | null; out_actor_name: string;
      out_action: string; out_entity: string | null; out_entity_id: string | null;
      out_occurred_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      module: r.out_module,
      actorId: r.out_actor_id,
      actorName: r.out_actor_name,
      action: r.out_action,
      entity: r.out_entity,
      entityId: r.out_entity_id,
      occurredAt: r.out_occurred_at,
    }));
  }

  /** الوحدات التي لها أحداث في هذه الشركة */
  async auditModules(): Promise<AuditModule[]> {
    const { data, error } = await supabase.rpc('tech_audit_modules');
    if (error) {
      console.error('auditModules فشل:', error.message);
      return [];
    }
    type Raw = { out_module: string; out_events: number; out_last: string | null };
    return ((data ?? []) as Raw[]).map((r) => ({
      module: r.out_module,
      events: Number(r.out_events ?? 0),
      last: r.out_last,
    }));
  }

  /** سجلّ الأخطاء مع ترشيح بالخطورة */
  async errorLog(opts?: {
    severity?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<TechError[]> {
    const { data, error } = await supabase.rpc('tech_error_log', {
      p_severity: opts?.severity ?? null,
      p_limit: opts?.limit ?? 100,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      console.error('errorLog فشل:', error.message);
      return [];
    }
    type Raw = {
      out_id: string; out_message: string; out_severity: TechError['severity'];
      out_category: string | null; out_source: string | null; out_route: string | null;
      out_file: string | null; out_line: number | null; out_stack: string | null;
      out_created_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      id: r.out_id,
      message: r.out_message,
      severity: r.out_severity,
      category: r.out_category,
      source: r.out_source,
      route: r.out_route,
      file: r.out_file,
      line: r.out_line,
      stack: r.out_stack,
      createdAt: r.out_created_at,
    }));
  }

  /**
   * ملخّص الأخطاء حسب الخطورة.
   *
   * ★ كل مستوى يعود ولو بصفر — البطاقة المفقودة تُقرأ «لا مشكلة» خطأً.
   */
  async errorSummary(hours = 24): Promise<ErrorSeverityCount[]> {
    const { data, error } = await supabase.rpc('tech_error_summary', { p_hours: hours });
    if (error) {
      console.error('errorSummary فشل:', error.message);
      return [];
    }
    type Raw = { out_severity: string; out_count: number; out_last: string | null };
    return ((data ?? []) as Raw[]).map((r) => ({
      severity: r.out_severity,
      count: Number(r.out_count ?? 0),
      last: r.out_last,
    }));
  }

  /** حالة المهام المجدولة (مُجمَّعة بلا كشف بقية العملاء) */
  async scheduledJobs(): Promise<ScheduledJob[]> {
    const { data, error } = await supabase.rpc('tech_scheduled_jobs');
    if (error) {
      console.error('scheduledJobs فشل:', error.message);
      return [];
    }
    type Raw = {
      out_job_name: string; out_last_run: string | null; out_last_status: string | null;
      out_duration_ms: number | null; out_runs_24h: number;
      out_failures_24h: number; out_is_healthy: boolean;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      jobName: r.out_job_name,
      lastRun: r.out_last_run,
      lastStatus: r.out_last_status,
      durationMs: r.out_duration_ms,
      runs24h: Number(r.out_runs_24h ?? 0),
      failures24h: Number(r.out_failures_24h ?? 0),
      isHealthy: r.out_is_healthy,
    }));
  }
}

export const techAuditService = new TechAuditService();
export default techAuditService;
