/**
 * ════════════════════════════════════════════════════════════════════════
 *  TechIntegrationsService — صحّة التكاملات وسجلّ الصادرات
 *
 *  ═══ الفجوات التي يسدّها (فُحصت على القاعدة) ══════════════════════════
 *
 *  ① التكاملات كانت بلا واجهة إطلاقاً:
 *     `finance_integration_connectors` · `finance_integration_events`
 *     مقيس: صفر صفحة. فحين يتوقّف تكامل لا يعلم أحد إلا حين تختفي
 *     البيانات. و`error_message` جاهز في الجدول ولا شيء يقرؤه.
 *
 *  ② الصادرات بلا واجهة: `export_logs` وأربعة جداول أخرى.
 *     تصدير البيانات حدث أمني (من صدّر ماذا ومتى) وبلا عرض لا يُدقَّق.
 *
 *  ★ الدوال `SECURITY INVOKER` في القاعدة: الجداول المالية محميّة بـ
 *    `current_user_can_access_legal_entity` فنحترم RLS لا نتجاوزه.
 * ════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

/** صحّة موصّل تكامل واحد */
export interface IntegrationHealth {
  connectorId: string;
  code: string;
  name: string;
  sourceSystem: string;
  direction: string;
  status: string;
  events24h: number;
  failed24h: number;
  pendingReview: number;
  lastEventAt: string | null;
  /** الموصّل الموقوف لا يُعدّ معطوباً — وإلا صار تنبيهاً دائماً */
  isHealthy: boolean;
}

/** حدث تكامل واحد */
export interface IntegrationEvent {
  id: string;
  connector: string;
  source: string;
  eventType: string;
  status: string;
  amount: number | null;
  error: string | null;
  createdAt: string | null;
}

/**
 * سطر في سجلّ الصادرات الموحّد (0332).
 *
 * ★ النسخة السابقة قرأت `export_logs` وحده فأعادت 0 صفاً بينما خمس
 *   صادرات حقيقية موجودة في finance_report_exports · inventory_report_exports
 *   · mrp_bom_export_requests · mrp_manufacturing_export_requests.
 *   أُثبت العطل تشغيلياً على Postgres قبل الإصلاح.
 */
export interface ExportRecord {
  id: string;
  /** finance · inventory · mrp_bom · mrp_mfg · legacy */
  source: ExportSource;
  sourceAr: string;
  /** اسم التقرير أو رقم الطلب — لا UUID خام */
  reference: string;
  format: string;
  status: string;
  statusAr: string;
  /** المصدر القديم وحده يحمل عدّاداً */
  records: number | null;
  fileUrl: string | null;
  error: string | null;
  userId: string | null;
  userName: string;
  requestedAt: string | null;
  completedAt: string | null;
}

/** مصادر الصادرات الخمسة */
export type ExportSource = 'finance' | 'inventory' | 'mrp_bom' | 'mrp_mfg' | 'legacy';

/** ملخّص الصادرات لكل مصدر مع تفصيل الحالات */
export interface ExportSummaryRow {
  source: ExportSource;
  sourceAr: string;
  total: number;
  ready: number;
  pending: number;
  failed: number;
  lastAt: string | null;
}

/** صادرة متعثّرة: فاشلة أو عالقة في حالة انتقالية */
export interface ExportFailure {
  id: string;
  source: ExportSource;
  sourceAr: string;
  reference: string;
  status: string;
  /** failed = سقطت · stuck = عالقة تبدو «قيد المعالجة» إلى الأبد */
  kind: 'failed' | 'stuck';
  kindAr: string;
  ageHours: number;
  error: string | null;
  userName: string;
  requestedAt: string | null;
}

/** حدث وارد من ناقل شحن */
export interface CarrierWebhookEvent {
  id: string;
  carrierId: string | null;
  carrier: string;
  provider: string;
  tracking: string;
  event: string;
  processed: boolean;
  ageHours: number;
  payloadKeys: number;
  receivedAt: string | null;
}

/** ملخّص أحداث ناقل واحد */
export interface CarrierWebhookSummary {
  carrierId: string | null;
  carrier: string;
  provider: string;
  isActive: boolean | null;
  total: number;
  processed: number;
  pending: number;
  /** عمر أقدم حدث عالق بالساعات — 0 إن لا عالق */
  oldestHours: number;
  lastAt: string | null;
}

class TechIntegrationsService {
  /** صحّة كل موصّلات التكامل */
  async integrationsHealth(): Promise<IntegrationHealth[]> {
    const { data, error } = await supabase.rpc('tech_integrations_health');
    if (error) {
      console.error('integrationsHealth فشل:', error.message);
      return [];
    }
    type Raw = {
      out_connector_id: string; out_code: string; out_name: string;
      out_source_system: string; out_direction: string; out_status: string;
      out_events_24h: number; out_failed_24h: number; out_pending_review: number;
      out_last_event_at: string | null; out_is_healthy: boolean;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      connectorId: r.out_connector_id,
      code: r.out_code,
      name: r.out_name,
      sourceSystem: r.out_source_system,
      direction: r.out_direction,
      status: r.out_status,
      events24h: Number(r.out_events_24h ?? 0),
      failed24h: Number(r.out_failed_24h ?? 0),
      pendingReview: Number(r.out_pending_review ?? 0),
      lastEventAt: r.out_last_event_at,
      isHealthy: r.out_is_healthy,
    }));
  }

  /** أحداث التكامل مع ترشيح الحالة — لتشخيص الفشل */
  async integrationEvents(opts?: {
    status?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<IntegrationEvent[]> {
    const { data, error } = await supabase.rpc('tech_integration_events', {
      p_status: opts?.status ?? null,
      p_limit: opts?.limit ?? 100,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      console.error('integrationEvents فشل:', error.message);
      return [];
    }
    type Raw = {
      out_id: string; out_connector: string; out_source: string;
      out_event_type: string; out_status: string; out_amount: number | null;
      out_error: string | null; out_created_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      id: r.out_id,
      connector: r.out_connector,
      source: r.out_source,
      eventType: r.out_event_type,
      status: r.out_status,
      amount: r.out_amount,
      error: r.out_error,
      createdAt: r.out_created_at,
    }));
  }

  /**
   * سجلّ الصادرات الموحّد فوق خمسة مصادر (0332).
   *
   * ★ التوقيع تغيّر: أُضيف `source` و`status` قبل الترقيم. النسخة
   *   القديمة `tech_export_log(int,int)` أُسقطت في القاعدة عمداً حتى لا
   *   تبقى حمولة زائدة غامضة تُستدعى خطأً.
   */
  async exportLog(opts?: {
    source?: ExportSource | null;
    status?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ExportRecord[]> {
    const { data, error } = await supabase.rpc('tech_export_log', {
      p_source: opts?.source ?? null,
      p_status: opts?.status ?? null,
      p_limit: opts?.limit ?? 100,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      console.error('exportLog فشل:', error.message);
      return [];
    }
    type Raw = {
      out_id: string; out_source: string; out_source_ar: string;
      out_reference: string; out_format: string; out_status: string;
      out_status_ar: string; out_records: number | null; out_file_url: string | null;
      out_error: string | null; out_user_id: string | null; out_user_name: string;
      out_requested_at: string | null; out_completed_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      id: r.out_id,
      source: r.out_source as ExportSource,
      sourceAr: r.out_source_ar,
      reference: r.out_reference,
      format: r.out_format,
      status: r.out_status,
      statusAr: r.out_status_ar,
      records: r.out_records === null ? null : Number(r.out_records),
      fileUrl: r.out_file_url,
      error: r.out_error,
      userId: r.out_user_id,
      userName: r.out_user_name,
      requestedAt: r.out_requested_at,
      completedAt: r.out_completed_at,
    }));
  }

  /** ملخّص الصادرات لكل مصدر — مرتّب بالفشل أولاً */
  async exportSummary(days = 30): Promise<ExportSummaryRow[]> {
    const { data, error } = await supabase.rpc('tech_export_summary', { p_days: days });
    if (error) {
      console.error('exportSummary فشل:', error.message);
      return [];
    }
    type Raw = {
      out_source: string; out_source_ar: string; out_total: number;
      out_ready: number; out_pending: number; out_failed: number;
      out_last_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      source: r.out_source as ExportSource,
      sourceAr: r.out_source_ar,
      total: Number(r.out_total ?? 0),
      ready: Number(r.out_ready ?? 0),
      pending: Number(r.out_pending ?? 0),
      failed: Number(r.out_failed ?? 0),
      lastAt: r.out_last_at,
    }));
  }

  /**
   * الصادرات المتعثّرة: فاشلة أو عالقة أطول من العتبة.
   *
   * ★ العالق أخطر من الفاشل: الفاشل معروف، والعالق يبدو «قيد المعالجة»
   *   إلى الأبد فلا ينتبه له أحد.
   */
  async exportFailures(stuckHours = 6): Promise<ExportFailure[]> {
    const { data, error } = await supabase.rpc('tech_export_failures', {
      p_stuck_hours: stuckHours,
    });
    if (error) {
      console.error('exportFailures فشل:', error.message);
      return [];
    }
    type Raw = {
      out_id: string; out_source: string; out_source_ar: string;
      out_reference: string; out_status: string; out_kind: string;
      out_kind_ar: string; out_age_hours: number; out_error: string | null;
      out_user_name: string; out_requested_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      id: r.out_id,
      source: r.out_source as ExportSource,
      sourceAr: r.out_source_ar,
      reference: r.out_reference,
      status: r.out_status,
      kind: r.out_kind === 'failed' ? 'failed' : 'stuck',
      kindAr: r.out_kind_ar,
      ageHours: Number(r.out_age_hours ?? 0),
      error: r.out_error,
      userName: r.out_user_name,
      requestedAt: r.out_requested_at,
    }));
  }

  /**
   * أحداث ناقلي الشحن الواردة — غير المعالَجة أولاً.
   *
   * ★ الجدول يستعمل `received_at` لا `created_at` و`processed BOOLEAN`
   *   لا `status`، فبنيته تختلف عن موصّلات المالية ولذلك سطح منفصل.
   */
  async carrierWebhooks(opts?: {
    processed?: boolean | null;
    limit?: number;
    offset?: number;
  }): Promise<CarrierWebhookEvent[]> {
    const { data, error } = await supabase.rpc('tech_carrier_webhooks', {
      p_processed: opts?.processed ?? null,
      p_limit: opts?.limit ?? 100,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      console.error('carrierWebhooks فشل:', error.message);
      return [];
    }
    type Raw = {
      out_id: string; out_carrier_id: string | null; out_carrier: string;
      out_provider: string; out_tracking: string; out_event: string;
      out_processed: boolean; out_age_hours: number; out_payload_keys: number;
      out_received_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      id: r.out_id,
      carrierId: r.out_carrier_id,
      carrier: r.out_carrier,
      provider: r.out_provider,
      tracking: r.out_tracking,
      event: r.out_event,
      processed: Boolean(r.out_processed),
      ageHours: Number(r.out_age_hours ?? 0),
      payloadKeys: Number(r.out_payload_keys ?? 0),
      receivedAt: r.out_received_at,
    }));
  }

  /** ملخّص أحداث الناقلين — الأكثر تعليقاً أولاً */
  async webhookSummary(days = 7): Promise<CarrierWebhookSummary[]> {
    const { data, error } = await supabase.rpc('tech_webhook_summary', { p_days: days });
    if (error) {
      console.error('webhookSummary فشل:', error.message);
      return [];
    }
    type Raw = {
      out_carrier_id: string | null; out_carrier: string; out_provider: string;
      out_is_active: boolean | null; out_total: number; out_processed: number;
      out_pending: number; out_oldest_hours: number; out_last_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      carrierId: r.out_carrier_id,
      carrier: r.out_carrier,
      provider: r.out_provider,
      isActive: r.out_is_active,
      total: Number(r.out_total ?? 0),
      processed: Number(r.out_processed ?? 0),
      pending: Number(r.out_pending ?? 0),
      oldestHours: Number(r.out_oldest_hours ?? 0),
      lastAt: r.out_last_at,
    }));
  }
}

export const techIntegrationsService = new TechIntegrationsService();
export default techIntegrationsService;
