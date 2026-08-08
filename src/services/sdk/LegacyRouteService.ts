/**
 * ════════════════════════════════════════════════════════════════════════
 *  LegacyRouteService — قياس البوابة القديمة قبل حذفها
 *
 *  ═══ لماذا؟ ═══════════════════════════════════════════════════════════
 *
 *  قرار «الإيقاف التدريجي» لطبقة `?view=` اتُّخذ ولم يُنفَّذ. السبب أن
 *  الطبقة تُحوّل **صامتةً**: لا أحد يعرف هل ما زال أحد يستعملها، ولا
 *  أي `view` تحديداً، ولا متى يُؤمَن حذفها. فتبقى 435 سطراً + مكوّن
 *  توجيه إلى الأبد «تحسّباً».
 *
 *  ★ إيقاف تدريجي بلا قياس = إيقاف لا يحدث أبداً.
 *
 *  ═══ ما فُحص قبل بناء هذا (لا تخمين) ══════════════════════════════════
 *    · **صفر** موضع في `src` يولّد `?view=` (grep كامل)
 *    · **صفر** دالة في القاعدة تكتبه في `action_url`
 *      (الكاتبتان: `notify_user` · `create_notification_safe` — كلتاهما
 *       تكتبان مسارات `/app/...`)
 *    · 435 تعييناً كلها لمسارات قائمة
 *
 *  فالطبقة تخدم الروابط الخارجية القديمة وحدها.
 * ════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

/** جاهزية حذف مسار قديم واحد */
export interface LegacyRouteReadiness {
  viewId: string;
  resolvedTo: string | null;
  totalHits: number;
  lastSeen: string | null;
  daysSince: number | null;
  safeToDrop: boolean;
}

/** ملخّص القرار: هل نحذف الطبقة؟ */
export interface LegacyRouteSummary {
  distinctViews: number;
  totalHits: number;
  /** مسارات استُعملت داخل النافذة — أي رقم > 0 يعني «لا تحذف» */
  activeViews: number;
  lastSeen: string | null;
  recommendation: string;
}

class LegacyRouteService {
  /**
   * يُسجّل استعمال مسار قديم (تجميع يومي في القاعدة).
   *
   * ★ لا يرمي أبداً ولا يُعيد وعداً مرفوضاً: فشل القياس **لا يجوز**
   *   أن يمنع مستخدماً عنده إشارة مرجعية قديمة من الوصول لوجهته.
   */
  async recordHit(viewId: string, resolvedTo?: string | null): Promise<void> {
    try {
      await supabase.rpc('record_legacy_route_hit', {
        p_view_id: viewId,
        p_resolved_to: resolvedTo ?? null,
      });
    } catch {
      /* القياس ثانوي — التوجيه أولاً */
    }
  }

  /** جاهزية كل مسار قديم على حدة */
  async readiness(windowDays = 90): Promise<LegacyRouteReadiness[]> {
    const { data, error } = await supabase.rpc('legacy_route_readiness', {
      p_window_days: windowDays,
    });
    if (error) {
      console.error('legacy readiness فشل:', error.message);
      return [];
    }
    type Raw = {
      out_view_id: string;
      out_resolved_to: string | null;
      out_total_hits: number;
      out_last_seen: string | null;
      out_days_since: number | null;
      out_safe_to_drop: boolean;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      viewId: r.out_view_id,
      resolvedTo: r.out_resolved_to,
      totalHits: Number(r.out_total_hits ?? 0),
      lastSeen: r.out_last_seen,
      daysSince: r.out_days_since,
      safeToDrop: r.out_safe_to_drop,
    }));
  }

  /** ملخّص بتوصية صريحة: احذف أو لا تحذف */
  async summary(windowDays = 90): Promise<LegacyRouteSummary | null> {
    const { data, error } = await supabase.rpc('legacy_route_summary', {
      p_window_days: windowDays,
    });
    if (error) {
      console.error('legacy summary فشل:', error.message);
      return null;
    }
    type Raw = {
      out_distinct_views: number;
      out_total_hits: number;
      out_active_views: number;
      out_last_seen: string | null;
      out_recommendation: string;
    };
    const row = (data as Raw[] | null)?.[0];
    if (!row) return null;
    return {
      distinctViews: row.out_distinct_views,
      totalHits: Number(row.out_total_hits ?? 0),
      activeViews: row.out_active_views,
      lastSeen: row.out_last_seen,
      recommendation: row.out_recommendation,
    };
  }
}

export const legacyRouteService = new LegacyRouteService();
export default legacyRouteService;
