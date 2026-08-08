/**
 * ════════════════════════════════════════════════════════════════
 *  HrAnalyticsService — تحليلات الموارد البشرية (migration 0349)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres محلي:
 *
 *  ① `AnalyticsPage.tsx:207` كان يربط الصحة النفسية بالأقسام هكذا:
 *       profileList.find((p) => p.id === w.employee_id)
 *     و`wellness_entries.employee_id` مفتاح أجنبي على **`employees(id)`**
 *     و`employees.id` ≠ `profiles.id`. مُثبَت بموظفين ودرجتين 30 و40:
 *       PAGE-LOGIC  join profiles.id = wellness.employee_id => 0
 *       CORRECT     join via employees                      => 2
 *     ⇒ عمود «متوسط الصحة» **صفر لكل قسم أبداً** والشريط أحمر دائماً،
 *       بينما بطاقة «مؤشر الصحة» تعرض 35 — رقمان متناقضان في شاشة واحدة.
 *
 *  ② `:180` `new Date(i.updated_at).getMonth() === currentMonth`
 *     بلا سنة ⇒ يوليو 2025 = يوليو 2026. مُثبَت: 2 بدل 1.
 *     وعلى `updated_at` الذي يضربه محفّز عند كل تعديل — لا `closed_at`.
 *
 *  ③ `:121` و`:224` `satisfactionRate: 85` و`:190` `satisfactionScore: 85`
 *     ثابت مكتوب يدوياً يظهر في ثلاثة عناصر بصرية بوصفه قياساً.
 *
 *  ④ `:225` `avgResolutionTime: 2.4` ثابت — والبيانات موجودة كاملةً
 *     في `incidents.created_at` و`incidents.closed_at`.
 *
 *  ⑤ `:131` «تحليل المشاعر الشهري» معادلة مُختلَقة
 *       positive = min(90, 40 + employeeCount*2 + resolvedCount)
 *     ومحورها السيني يُسمّى «شهر» ويحمل يوليو…ديسمبر بينما الصفوف
 *     **أقسام**. ونفسه في `wellnessTrend` الموسوم «6 أشهر».
 *
 *  ⑥ `WorkforceAnalyticsService.ts:50` معدل الحضور = كل ما ليس «غائب»
 *     ⇒ `عطلة` و`مجاز` تُحتسب حضوراً. مُثبَت: 80% بدل 33% — انحراف 47 نقطة.
 *
 *  ⑦ `WorkforceAnalyticsService.ts:58` البلاغات المفتوحة تعدّ المؤرشف.
 *     مُثبَت: 1 بدل 0.
 *
 *  ⑧ `:250` `await new Promise(r => setTimeout(r, 2500))` تأخير مُفتعَل
 *     ثم ثوابت («دقة النموذج 91%» · «p-value < 0.05» · «Random Forest»)
 *     تحت وسم «AI Powered» — ولا شيء منها يمسّ القاعدة.
 *
 *  ★ الحساب كله انتقل إلى القاعدة: أربع دوال STABLE · SECURITY DEFINER
 *    ترشّح بـ`current_user_tenant_id()` وتشترط `current_user_is_staff()`.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

export interface HrAnalyticsOverview {
  totalEmployees: number;
  activeEmployees: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  holidayDays: number;
  attendanceRate: number;
  absenteeismRate: number;
  lateRate: number;
  wellnessScore: number;
  wellnessSamples: number;
  avgResolutionDays: number;
  resolvedInRange: number;
  openIncidents: number;
  contractsExpiring: number;
  criticalPositions: number;
  successionCoverage: number;
}

export interface HrDepartmentStat {
  departmentId: string;
  departmentName: string;
  employeeCount: number;
  incidentCount: number;
  resolvedCount: number;
  openCount: number;
  wellnessAvg: number;
  wellnessSamples: number;
  attendanceRate: number;
  absentDays: number;
}

export interface HrWellnessPoint {
  monthStart: string;
  avgScore: number;
  samples: number;
  employees: number;
}

export interface HrIncidentPoint {
  monthStart: string;
  opened: number;
  closed: number;
  avgDays: number;
}

export const EMPTY_OVERVIEW: HrAnalyticsOverview = {
  totalEmployees: 0, activeEmployees: 0, workingDays: 0, presentDays: 0,
  absentDays: 0, lateDays: 0, leaveDays: 0, holidayDays: 0,
  attendanceRate: 0, absenteeismRate: 0, lateRate: 0,
  wellnessScore: 0, wellnessSamples: 0, avgResolutionDays: 0,
  resolvedInRange: 0, openIncidents: 0, contractsExpiring: 0,
  criticalPositions: 0, successionCoverage: 0,
};

const n = (v: unknown): number => Number(v ?? 0);

class HrAnalyticsService {
  /**
   * البطاقات العليا — كل رقم محسوب من مصدره في القاعدة.
   *
   * ★ RPC لا BaseService: `BaseService.findAll` يحوّل كل مُرشِّح إلى
   *   `.eq(key, value)` فلا يدعم النطاقات الزمنية أصلاً، ولا يجمع.
   */
  async overview(from: string, to: string): Promise<HrAnalyticsOverview> {
    const { data, error } = await supabase.rpc('hr_analytics_overview', {
      p_from: from,
      p_to: to,
    });
    if (error) {
      logger.error('hr_analytics_overview فشل: ' + error.message, {
        component: 'HrAnalyticsService', action: 'overview',
      });
      return EMPTY_OVERVIEW;
    }
    type Raw = Record<string, unknown>;
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY_OVERVIEW;
    const r = rows[0];
    return {
      totalEmployees:     n(r.out_total_employees),
      activeEmployees:    n(r.out_active_employees),
      workingDays:        n(r.out_working_days),
      presentDays:        n(r.out_present_days),
      absentDays:         n(r.out_absent_days),
      lateDays:           n(r.out_late_days),
      leaveDays:          n(r.out_leave_days),
      holidayDays:        n(r.out_holiday_days),
      attendanceRate:     n(r.out_attendance_rate),
      absenteeismRate:    n(r.out_absenteeism_rate),
      lateRate:           n(r.out_late_rate),
      wellnessScore:      n(r.out_wellness_score),
      wellnessSamples:    n(r.out_wellness_samples),
      avgResolutionDays:  n(r.out_avg_resolution_days),
      resolvedInRange:    n(r.out_resolved_in_range),
      openIncidents:      n(r.out_open_incidents),
      contractsExpiring:  n(r.out_contracts_expiring),
      criticalPositions:  n(r.out_critical_positions),
      successionCoverage: n(r.out_succession_coverage),
    };
  }

  /** إحصاءات الأقسام — من `departments` عبر `employees.department_id`. */
  async departments(from: string, to: string): Promise<HrDepartmentStat[]> {
    const { data, error } = await supabase.rpc('hr_analytics_departments', {
      p_from: from,
      p_to: to,
    });
    if (error) {
      logger.error('hr_analytics_departments فشل: ' + error.message, {
        component: 'HrAnalyticsService', action: 'departments',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      departmentId:    String(r.out_department_id ?? ''),
      departmentName:  String(r.out_department_name ?? '—'),
      employeeCount:   n(r.out_employee_count),
      incidentCount:   n(r.out_incident_count),
      resolvedCount:   n(r.out_resolved_count),
      openCount:       n(r.out_open_count),
      wellnessAvg:     n(r.out_wellness_avg),
      wellnessSamples: n(r.out_wellness_samples),
      attendanceRate:  n(r.out_attendance_rate),
      absentDays:      n(r.out_absent_days),
    }));
  }

  /** اتجاه الصحة النفسية — أشهر حقيقية، والفجوات تظهر ولا تُطوى. */
  async wellnessTrend(months = 6): Promise<HrWellnessPoint[]> {
    const { data, error } = await supabase.rpc('hr_analytics_wellness_trend', {
      p_months: months,
    });
    if (error) {
      logger.error('hr_analytics_wellness_trend فشل: ' + error.message, {
        component: 'HrAnalyticsService', action: 'wellnessTrend',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      monthStart: String(r.out_month_start ?? ''),
      avgScore:   n(r.out_avg_score),
      samples:    n(r.out_samples),
      employees:  n(r.out_employees),
    }));
  }

  /** الوارد مقابل المُغلق بالشهر — بديل «تحليل المشاعر» المُصنَّع. */
  async incidentTrend(months = 6): Promise<HrIncidentPoint[]> {
    const { data, error } = await supabase.rpc('hr_analytics_incident_trend', {
      p_months: months,
    });
    if (error) {
      logger.error('hr_analytics_incident_trend فشل: ' + error.message, {
        component: 'HrAnalyticsService', action: 'incidentTrend',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      monthStart: String(r.out_month_start ?? ''),
      opened:     n(r.out_opened),
      closed:     n(r.out_closed),
      avgDays:    n(r.out_avg_days),
    }));
  }
}

export const hrAnalyticsService = new HrAnalyticsService();
