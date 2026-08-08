/**
 * ════════════════════════════════════════════════════════════════
 *  HrDashboardService — لوحة الموارد البشرية (migration 0345)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres:
 *
 *  ① «الموظفون النشطون» = صفر دائماً
 *     `HRDashboard.tsx:277` كان يرشّح `e.status === 'active'`
 *     و`employees` **لا يحوي عمود `status`** (مُثبَت: 0 في
 *     information_schema.columns · العمود الصحيح `is_active`).
 *
 *  ② الصحة النفسية لكل قسم = NaN
 *     `:253` كان يجمع `w.mood_score` — عمودٌ **غير موجود في المخطط
 *     كلّه** (مُثبَت: 0 صفوف). الصحيح `wellness_entries.score`.
 *     `undefined` في الجمع ⇒ NaN يُعرض حرفياً ويكسر
 *     `width: ${dept.wellnessAvg}%`.
 *
 *  ③ كل البلاغات تُنسب إلى قسم «عام»
 *     `:246` كان يربط `incidents.reported_by` بـ`employees.id`
 *     بينما هو **`profiles.id`** منذ `0008`
 *     (incidents_reported_by_profiles_fkey). مُثبَت: صفر مطابقة.
 *
 *  ④ بطاقة «مُصعَّدة لـ HR» ميّتة
 *     `:194` يعدّ `status === 'escalated'` وقيد CHECK يسمح بـ
 *     pending·in_progress·resolved·closed فقط ⇒ صفر أبداً.
 *     استُبدلت بـ`unassigned` — حالة حقيقية تحتاج تدخّلاً.
 *
 *  ⑤ الاتجاه الشهري يخلط السنوات
 *     كان يرشّح بـ`getMonth()` وحده ⇒ بلاغ مارس 2024 يُحتسب في
 *     مارس 2026.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

export interface HrDashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  departments: number;
  /** متوسط العافية على آخر 30 يوماً */
  wellnessScore: number;
  /**
   * ★ عدد الإدخالات خلف المتوسط. متوسط 82 من ثلاث عيّنات ليس كمتوسط
   *   82 من 300 — الواجهة تحتاج أن تُفرّق بدل عرض رقم بلا سياق.
   */
  wellnessSamples: number;
  pending: number;
  inProgress: number;
  resolved: number;
  closed: number;
  /** الحرجة **المفتوحة** وحدها — مؤشّر إنذار لا عدّاد تراكمي */
  criticalOpen: number;
  /** مفتوحة بلا مُسنَد — بديل بطاقة escalated الميّتة */
  unassigned: number;
  resolvedThisMonth: number;
  incidentsTotal: number;
}

export interface HrDepartmentStat {
  departmentId: string;
  name: string;
  employeeCount: number;
  activeCount: number;
  problemCount: number;
  openProblems: number;
  /** صفر حين لا بيانات — لا 75 مُختلَقة كما كانت الصفحة تكتب */
  wellnessAvg: number;
  wellnessCount: number;
}

export interface HrMonthlyPoint {
  year: number;
  month: number;
  problems: number;
  resolved: number;
  critical: number;
}

export interface HrWellnessPoint {
  date: string;
  /** `null` = لا بيانات ذلك اليوم (لا «صفر» الذي يعني أسوأ حالة) */
  score: number | null;
  samples: number;
}

const EMPTY_SUMMARY: HrDashboardSummary = {
  totalEmployees: 0, activeEmployees: 0, departments: 0,
  wellnessScore: 0, wellnessSamples: 0,
  pending: 0, inProgress: 0, resolved: 0, closed: 0,
  criticalOpen: 0, unassigned: 0, resolvedThisMonth: 0, incidentsTotal: 0,
};

class HrDashboardService {
  /** المؤشّرات الرئيسية — استدعاء واحد بدل خمسة جلبات كاملة */
  async summary(): Promise<HrDashboardSummary> {
    const { data, error } = await supabase.rpc('hr_dashboard_summary');
    if (error) {
      logger.error('hr_dashboard_summary فشل: ' + error.message, {
        component: 'HrDashboardService', action: 'summary',
      });
      return EMPTY_SUMMARY;
    }
    type Raw = {
      out_total_employees: number; out_active_employees: number;
      out_departments: number; out_wellness_score: number;
      out_wellness_samples: number; out_pending: number;
      out_in_progress: number; out_resolved: number; out_closed: number;
      out_critical_open: number; out_unassigned: number;
      out_resolved_month: number; out_incidents_total: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY_SUMMARY;
    const r = rows[0];
    return {
      totalEmployees:    Number(r.out_total_employees ?? 0),
      activeEmployees:   Number(r.out_active_employees ?? 0),
      departments:       Number(r.out_departments ?? 0),
      wellnessScore:     Number(r.out_wellness_score ?? 0),
      wellnessSamples:   Number(r.out_wellness_samples ?? 0),
      pending:           Number(r.out_pending ?? 0),
      inProgress:        Number(r.out_in_progress ?? 0),
      resolved:          Number(r.out_resolved ?? 0),
      closed:            Number(r.out_closed ?? 0),
      criticalOpen:      Number(r.out_critical_open ?? 0),
      unassigned:        Number(r.out_unassigned ?? 0),
      resolvedThisMonth: Number(r.out_resolved_month ?? 0),
      incidentsTotal:    Number(r.out_incidents_total ?? 0),
    };
  }

  /** إحصاءات الأقسام — بالمعرّف الصحيح (العطل ③) */
  async departments(limit = 20): Promise<HrDepartmentStat[]> {
    const { data, error } = await supabase.rpc('hr_dashboard_departments', {
      p_limit: limit,
    });
    if (error) {
      logger.error('hr_dashboard_departments فشل: ' + error.message, {
        component: 'HrDashboardService', action: 'departments',
      });
      return [];
    }
    type Raw = {
      out_department_id: string; out_name: string;
      out_employee_count: number; out_active_count: number;
      out_problem_count: number; out_open_problems: number;
      out_wellness_avg: number; out_wellness_count: number;
    };
    return ((data ?? []) as Raw[]).map((d) => ({
      departmentId:  d.out_department_id,
      name:          d.out_name,
      employeeCount: Number(d.out_employee_count ?? 0),
      activeCount:   Number(d.out_active_count ?? 0),
      problemCount:  Number(d.out_problem_count ?? 0),
      openProblems:  Number(d.out_open_problems ?? 0),
      wellnessAvg:   Number(d.out_wellness_avg ?? 0),
      wellnessCount: Number(d.out_wellness_count ?? 0),
    }));
  }

  /** الاتجاه الشهري — بحدود زمنية حقيقية (العطل ⑤) */
  async monthlyTrend(months = 6): Promise<HrMonthlyPoint[]> {
    const { data, error } = await supabase.rpc('hr_dashboard_monthly_trend', {
      p_months: months,
    });
    if (error) {
      logger.error('hr_dashboard_monthly_trend فشل: ' + error.message, {
        component: 'HrDashboardService', action: 'monthlyTrend',
      });
      return [];
    }
    type Raw = {
      out_year: number; out_month: number; out_problems: number;
      out_resolved: number; out_critical: number;
    };
    return ((data ?? []) as Raw[]).map((m) => ({
      year:     Number(m.out_year),
      month:    Number(m.out_month),
      problems: Number(m.out_problems ?? 0),
      resolved: Number(m.out_resolved ?? 0),
      critical: Number(m.out_critical ?? 0),
    }));
  }

  /** اتجاه العافية — الأيام الفارغة `null` لا صفر */
  async wellnessTrend(days = 7): Promise<HrWellnessPoint[]> {
    const { data, error } = await supabase.rpc('hr_dashboard_wellness_trend', {
      p_days: days,
    });
    if (error) {
      logger.error('hr_dashboard_wellness_trend فشل: ' + error.message, {
        component: 'HrDashboardService', action: 'wellnessTrend',
      });
      return [];
    }
    type Raw = { out_date: string; out_score: number | null; out_samples: number };
    return ((data ?? []) as Raw[]).map((w) => ({
      date:    w.out_date,
      // ★ لا نحوّل null إلى 0 — التمييز هو جوهر الإصلاح
      score:   w.out_score === null ? null : Number(w.out_score),
      samples: Number(w.out_samples ?? 0),
    }));
  }
}

export const hrDashboardService = new HrDashboardService();
