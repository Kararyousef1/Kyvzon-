/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeDashboardService — ملخّص لوحة الموظف (migration 0335)
 *
 *  ★ العطل: اللوحة أطلقت سبعة استعلامات متوازية بـ`user.id` — وهو
 *    `profiles.id` لا `employees.id` — فعرضت أصفاراً بينما البيانات
 *    موجودة. الآن استدعاء واحد محسوب في القاعدة بالمعرّف الصحيح.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

export interface DashboardSummary {
  /** `null` = لا سجلّ موظف مرتبط بالمستخدم */
  employeeId: string | null;
  totalProblems: number;
  resolvedProblems: number;
  pendingProblems: number;
  wellnessScore: number;
  attendanceRate: number;
  presentDays: number;
  trackedDays: number;
  activeGoals: number;
  avgGoalProgress: number;
  pendingExpenses: number;
  outstandingLoans: number;
}

export interface LeaveBalanceSummary {
  year: number;
  annualTotal: number;
  annualUsed: number;
  annualPending: number;
  /** المتبقّي **يطرح المعلّق** — الطلب قيد الاعتماد يحجز الرصيد */
  annualLeft: number;
  sickTotal: number;
  sickUsed: number;
  sickPending: number;
  sickLeft: number;
  hajjTaken: boolean;
}

const EMPTY: DashboardSummary = {
  employeeId: null,
  totalProblems: 0, resolvedProblems: 0, pendingProblems: 0,
  wellnessScore: 0, attendanceRate: 0, presentDays: 0, trackedDays: 0,
  activeGoals: 0, avgGoalProgress: 0, pendingExpenses: 0, outstandingLoans: 0,
};

class EmployeeDashboardService {
  /** معرّف سجلّ الموظف للمستخدم الحالي — `null` إن لم يكن مرتبطاً */
  async myEmployeeId(): Promise<string | null> {
    const { data, error } = await supabase.rpc('my_employee_id');
    if (error) {
      logger.error('myEmployeeId فشل: ' + error.message, {
        component: 'EmployeeDashboardService', action: 'myEmployeeId',
      });
      return null;
    }
    return typeof data === 'string' ? data : null;
  }

  /** ملخّص اللوحة — صفّ واحد بدل سبعة استعلامات */
  async summary(): Promise<DashboardSummary> {
    const { data, error } = await supabase.rpc('my_dashboard_summary');
    if (error) {
      logger.error('dashboard summary فشل: ' + error.message, {
        component: 'EmployeeDashboardService', action: 'summary',
      });
      return EMPTY;
    }
    type Raw = {
      out_employee_id: string | null;
      out_total_problems: number; out_resolved_problems: number;
      out_pending_problems: number; out_wellness_score: number;
      out_attendance_rate: number; out_present_days: number;
      out_tracked_days: number; out_active_goals: number;
      out_avg_goal_progress: number; out_pending_expenses: number;
      out_outstanding_loans: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY;
    const r = rows[0];
    return {
      employeeId: r.out_employee_id,
      totalProblems: Number(r.out_total_problems ?? 0),
      resolvedProblems: Number(r.out_resolved_problems ?? 0),
      pendingProblems: Number(r.out_pending_problems ?? 0),
      wellnessScore: Number(r.out_wellness_score ?? 0),
      attendanceRate: Number(r.out_attendance_rate ?? 0),
      presentDays: Number(r.out_present_days ?? 0),
      trackedDays: Number(r.out_tracked_days ?? 0),
      activeGoals: Number(r.out_active_goals ?? 0),
      avgGoalProgress: Number(r.out_avg_goal_progress ?? 0),
      pendingExpenses: Number(r.out_pending_expenses ?? 0),
      outstandingLoans: Number(r.out_outstanding_loans ?? 0),
    };
  }

  /** رصيد الإجازات — `null` إن لا سجلّ للسنة */
  async leaveBalance(year?: number): Promise<LeaveBalanceSummary | null> {
    const { data, error } = await supabase.rpc('my_leave_balance', {
      p_year: year ?? null,
    });
    if (error) {
      logger.error('leaveBalance فشل: ' + error.message, {
        component: 'EmployeeDashboardService', action: 'leaveBalance',
      });
      return null;
    }
    type Raw = {
      out_year: number; out_annual_total: number; out_annual_used: number;
      out_annual_pending: number; out_annual_left: number;
      out_sick_total: number; out_sick_used: number;
      out_sick_pending: number; out_sick_left: number; out_hajj_taken: boolean;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      year: Number(r.out_year),
      annualTotal: Number(r.out_annual_total ?? 0),
      annualUsed: Number(r.out_annual_used ?? 0),
      annualPending: Number(r.out_annual_pending ?? 0),
      annualLeft: Number(r.out_annual_left ?? 0),
      sickTotal: Number(r.out_sick_total ?? 0),
      sickUsed: Number(r.out_sick_used ?? 0),
      sickPending: Number(r.out_sick_pending ?? 0),
      sickLeft: Number(r.out_sick_left ?? 0),
      hajjTaken: Boolean(r.out_hajj_taken),
    };
  }
}

export const employeeDashboardService = new EmployeeDashboardService();
export default employeeDashboardService;
