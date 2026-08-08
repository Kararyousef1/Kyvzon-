/**
 * ════════════════════════════════════════════════════════════════
 *  GatekeeperAnalyticsService — تحليلات البوابة والحركة (migration 0350)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres محلي:
 *
 *  ① **تسريب بين المستأجرين.** `NoTenantBaseService` كان يحذف
 *     `tenant_id` عند الإدراج بناءً على تعليق خاطئ («هذا الجدول بدون
 *     tenant_id»)، والسياسة كانت
 *       ((tenant_id IS NULL) OR (tenant_id = current_user_tenant_id()))
 *     مُثبَت بدور `authenticated`: مدير الشركة (ب) قرأ زوّار الشركة (أ).
 *
 *  ② `findVisitorLogs({ fromDate })` تُعلن المُعامل ولا تستعمله.
 *     مُثبَت: 3 صفوف بدل 1 ⇒ مُرشِّح المدة بلا أثر على تبويب الزوّار.
 *
 *  ③ التصدير يقرأ `v.visitor?.name/company/purpose/location` ولا
 *     استعلام يجلب كائن `visitor`، والجدول مسطّح. مُثبَت: العمودان
 *     `company` و`location` غير موجودين في المخطط (⇒ 0).
 *     ⇒ أربعة أعمدة من سبعة **فارغة أبداً** — ومنها اسم الزائر.
 *
 *  ④ أرشيف الوردية يُمرّر `fromDate: session.started_at` بلا حدّ أعلى
 *     و`ended_at` مُهمَل. مُثبَت: 2 حركة بدل 1.
 *
 *  ⑤ المخالفة تُشتقّ من `notes.includes('[مخالفة مسار 🚨]')` بينما
 *     العمود المنطقي `route_violation` موجود ويكتبه `recordReturn`.
 *
 *  ⑥ `customer_email` عمود غير موجود ⇒ عمود فارغ في تصدير المراجعات.
 *
 *  ⑦ الصفحة تفتح قناة Realtime مباشرة على Supabase باسم عالميّ ثابت
 *     بلا تمييز مستأجر.
 *
 *  ⑧ `archiveSearch` يُقرأ من الحقل ولا يُرشِّح شيئاً.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { getCurrentTenantId } from './BaseService';

export interface MovementAnalyticsRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  destination: string;
  departureAt: string;
  returnedAt: string | null;
  durationSecs: number | null;
  routeViolation: boolean;
  notes: string | null;
}

export interface VisitorAnalyticsRow {
  id: string;
  sessionId: string | null;
  visitorName: string;
  visitorPhone: string;
  idNumber: string;
  purpose: string;
  hostName: string;
  checkInTime: string;
  checkOutTime: string | null;
  durationSecs: number | null;
  status: string;
}

export interface SessionArchiveRow {
  id: string;
  gatekeeperName: string;
  startedAt: string;
  endedAt: string | null;
  durationSecs: number | null;
  visitorCount: number;
  movementCount: number;
  handoverStatus: string;
}

export interface ShiftMovementRow {
  id: string;
  employeeName: string;
  department: string;
  destination: string;
  departureAt: string;
  returnedAt: string | null;
  durationSecs: number | null;
  routeViolation: boolean;
}

const num = (v: unknown): number => Number(v ?? 0);
const nullableNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

class GatekeeperAnalyticsService {
  /** حركة الموظفين ضمن نطاق زمني — المخالفة من العمود المنطقي. */
  async movements(from: string, to: string): Promise<MovementAnalyticsRow[]> {
    const { data, error } = await supabase.rpc('gatekeeper_movement_analytics', {
      p_from: from,
      p_to: to,
    });
    if (error) {
      logger.error('gatekeeper_movement_analytics فشل: ' + error.message, {
        component: 'GatekeeperAnalyticsService', action: 'movements',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      id:             String(r.out_id ?? ''),
      employeeId:     String(r.out_employee_id ?? ''),
      employeeName:   String(r.out_employee_name ?? 'غير معروف'),
      department:     String(r.out_department ?? '—'),
      destination:    String(r.out_destination ?? '—'),
      departureAt:    String(r.out_departure_at ?? ''),
      returnedAt:     r.out_returned_at ? String(r.out_returned_at) : null,
      durationSecs:   nullableNum(r.out_duration_secs),
      routeViolation: Boolean(r.out_route_violation),
      notes:          r.out_notes ? String(r.out_notes) : null,
    }));
  }

  /** سجلّ الزوّار — أعمدة مسطّحة حقيقية والنطاق يُطبَّق فعلاً. */
  async visitors(from: string, to: string): Promise<VisitorAnalyticsRow[]> {
    const { data, error } = await supabase.rpc('gatekeeper_visitor_analytics', {
      p_from: from,
      p_to: to,
    });
    if (error) {
      logger.error('gatekeeper_visitor_analytics فشل: ' + error.message, {
        component: 'GatekeeperAnalyticsService', action: 'visitors',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      id:            String(r.out_id ?? ''),
      sessionId:     r.out_session_id ? String(r.out_session_id) : null,
      visitorName:   String(r.out_visitor_name ?? 'زائر بلا اسم'),
      visitorPhone:  String(r.out_visitor_phone ?? '—'),
      idNumber:      String(r.out_id_number ?? '—'),
      purpose:       String(r.out_purpose ?? '—'),
      hostName:      String(r.out_host_name ?? '—'),
      checkInTime:   String(r.out_check_in_time ?? ''),
      checkOutTime:  r.out_check_out_time ? String(r.out_check_out_time) : null,
      durationSecs:  nullableNum(r.out_duration_secs),
      status:        String(r.out_status ?? '—'),
    }));
  }

  /** أرشيف الورديات — البحث يُنفَّذ في القاعدة (العطل ⑧). */
  async sessionArchive(search?: string): Promise<SessionArchiveRow[]> {
    const { data, error } = await supabase.rpc('gatekeeper_session_archive', {
      p_search: search && search.trim() ? search.trim() : null,
    });
    if (error) {
      logger.error('gatekeeper_session_archive فشل: ' + error.message, {
        component: 'GatekeeperAnalyticsService', action: 'sessionArchive',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      id:             String(r.out_id ?? ''),
      gatekeeperName: String(r.out_gatekeeper_name ?? 'حارس غير معروف'),
      startedAt:      String(r.out_started_at ?? ''),
      endedAt:        r.out_ended_at ? String(r.out_ended_at) : null,
      durationSecs:   nullableNum(r.out_duration_secs),
      visitorCount:   num(r.out_visitor_count),
      movementCount:  num(r.out_movement_count),
      handoverStatus: String(r.out_handover_status ?? '—'),
    }));
  }

  /**
   * حركات وردية بعينها — محصورة بين بدايتها ونهايتها (العطل ④).
   * ★ ترفع خطأً إن كانت الوردية لمستأجر آخر بدل إرجاع فراغ صامت.
   */
  async shiftMovements(sessionId: string): Promise<ShiftMovementRow[]> {
    const { data, error } = await supabase.rpc('gatekeeper_shift_movements', {
      p_session_id: sessionId,
    });
    if (error) {
      logger.error('gatekeeper_shift_movements فشل: ' + error.message, {
        component: 'GatekeeperAnalyticsService', action: 'shiftMovements',
      });
      throw new Error(error.message);
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      id:             String(r.out_id ?? ''),
      employeeName:   String(r.out_employee_name ?? 'غير معروف'),
      department:     String(r.out_department ?? '—'),
      destination:    String(r.out_destination ?? '—'),
      departureAt:    String(r.out_departure_at ?? ''),
      returnedAt:     r.out_returned_at ? String(r.out_returned_at) : null,
      durationSecs:   nullableNum(r.out_duration_secs),
      routeViolation: Boolean(r.out_route_violation),
    }));
  }
}

export interface HandoverAlert {
  sessionId: string;
  handoverStatus: string;
}

/**
 * ★★★ إصلاح العطل ⑦ — الاشتراك اللحظي انتقل من الصفحة إلى طبقة SDK.
 *
 *   الصفحة كانت تستورد `supabase` مباشرة وتفتح:
 *     supabase.channel('gatekeeper_alerts')      ← اسم عالميّ ثابت
 *       .on('postgres_changes', { table: 'gatekeeper_sessions',
 *                                 filter: 'handover_status=eq.pending' }, …)
 *
 *   مشكلتان:
 *     ① خرق «الصفحات لا تلمس Supabase مباشرة».
 *     ② الاسم `gatekeeper_alerts` عالميّ بلا تمييز مستأجر، والمُرشِّح
 *        لا يذكر `tenant_id` ⇒ حدث مستأجرٍ يُنبّه مديري غيره.
 *
 *   الآن: اسم القناة يحمل معرّف المستأجر، والمُرشِّح يُرشّح به —
 *   ومع ذلك يُعاد التحقّق في المُستقبِل (دفاع في العمق) لأن مُرشِّح
 *   Realtime يعتمد على RLS للنشر ولا يجوز الاتّكال عليه وحده.
 */
export function subscribeHandoverAlerts(
  onAlert: (alert: HandoverAlert) => void,
): () => void {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    logger.warn('تعذّر الاشتراك في تنبيهات البوابة: لا مستأجر حالي', {
      component: 'GatekeeperAnalyticsService', action: 'subscribeHandoverAlerts',
    });
    return () => { /* لا اشتراك */ };
  }

  const channel = supabase
    .channel(`gatekeeper-alerts-${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'gatekeeper_sessions',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload: { new?: Record<string, unknown> }) => {
        const row = payload.new;
        if (!row) return;
        // دفاع في العمق: لا نثق بمُرشِّح القناة وحده
        if (String(row.tenant_id ?? '') !== tenantId) return;
        const status = String(row.handover_status ?? '');
        if (status !== 'pending' && status !== 'pending_end') return;
        onAlert({ sessionId: String(row.id ?? ''), handoverStatus: status });
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export const gatekeeperAnalyticsService = new GatekeeperAnalyticsService();
