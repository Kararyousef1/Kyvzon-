/**
 * ManagerMovementUnitService — وحدة «الحركة» داخل بوابة المدير
 *
 * ═════════════════════════════════════════════════════════════════════════
 * المبدأ: الوحدة **منظور** لا نسخة.
 *   لا تُكرّر خدمات بوابة الحركة الـ18. تستدعي دوال 0303 التي تُرجع
 *   ما يخصّ فريق المدير وحده عبر is_in_my_team().
 *
 * الحماية بطبقتين في القاعدة:
 *   ① require_portal_unit('manager','movement') — هل له الوحدة؟
 *   ② is_in_my_team(employee_id)                — هل هذا من فريقه؟
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export interface ManagerPendingPermit {
  permitId: string;
  employeeId: string;
  employeeName: string;
  destinationName: string;
  purpose: string;
  validFrom: string;
  validUntil: string;
  maxMinutes: number;
  status: string;
  createdAt: string;
}

export interface ManagerTeamMovement {
  logId: string;
  employeeId: string;
  employeeName: string;
  destination: string;
  departureAt: string;
  expectedReturn: string | null;
  actualReturn: string | null;
  status: string;
  overdueMinutes: number;
}

export interface ManagerTeamKpis {
  teamSize: number;
  pendingPermits: number;
  currentlyOut: number;
  overdueNow: number;
  movementsPeriod: number;
  violationsPeriod: number;
}

export type PermitDecision = 'approved' | 'rejected';

/** رسائل عربية لأخطاء القاعدة — لا نعرض رموزاً خاماً للمستخدم */
const ERROR_MESSAGES: Record<string, string> = {
  NOT_ASSIGNED_TO_UNIT: 'لم تُسنَد إليك وحدة الحركة في بوابة المدير.',
  EMPLOYEE_NOT_IN_MY_TEAM: 'هذا الموظف ليس ضمن فريقك — لا يمكنك البتّ في تصريحه.',
  PERMIT_NOT_PENDING: 'هذا التصريح لم يعد معلَّقاً — رُبما بُتَّ فيه بالفعل.',
  PERMIT_NOT_FOUND: 'التصريح غير موجود.',
  INVALID_DECISION: 'قرار غير صالح.',
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class ManagerMovementUnitService {
  /** تصاريح الفريق المعلَّقة */
  async findPendingPermits(): Promise<ManagerPendingPermit[]> {
    const { data, error } = await supabase.rpc('manager_movement_pending_permits');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      permitId: String(r.out_permit_id),
      employeeId: String(r.out_employee_id),
      employeeName: String(r.out_employee_name ?? 'موظف'),
      destinationName: String(r.out_destination_name ?? ''),
      purpose: String(r.out_purpose ?? ''),
      validFrom: String(r.out_valid_from ?? ''),
      validUntil: String(r.out_valid_until ?? ''),
      maxMinutes: Number(r.out_max_minutes ?? 0),
      status: String(r.out_status ?? ''),
      createdAt: String(r.out_created_at ?? ''),
    }));
  }

  /** اعتماد أو رفض تصريح */
  async decidePermit(
    permitId: string,
    decision: PermitDecision,
    comments?: string,
  ): Promise<void> {
    const { error } = await supabase.rpc('manager_movement_decide_permit', {
      p_permit_id: permitId,
      p_decision: decision,
      p_comments: comments ?? null,
    });
    if (error) throw new Error(translateError(error.message));
  }

  /** حركة الفريق خلال مدة */
  async findTeamLog(days = 30): Promise<ManagerTeamMovement[]> {
    const { data, error } = await supabase.rpc('manager_movement_team_log', {
      p_days: days,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      logId: String(r.out_log_id),
      employeeId: String(r.out_employee_id),
      employeeName: String(r.out_employee_name ?? 'موظف'),
      destination: String(r.out_destination ?? ''),
      departureAt: String(r.out_departure_at ?? ''),
      expectedReturn: r.out_expected_return ? String(r.out_expected_return) : null,
      actualReturn: r.out_actual_return ? String(r.out_actual_return) : null,
      status: String(r.out_status ?? ''),
      overdueMinutes: Number(r.out_overdue_minutes ?? 0),
    }));
  }

  /** مؤشرات الفريق */
  async getTeamKpis(days = 30): Promise<ManagerTeamKpis> {
    const { data, error } = await supabase.rpc('manager_movement_team_kpis', {
      p_days: days,
    });
    if (error) throw new Error(translateError(error.message));

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    return {
      teamSize: Number(row?.out_team_size ?? 0),
      pendingPermits: Number(row?.out_pending_permits ?? 0),
      currentlyOut: Number(row?.out_currently_out ?? 0),
      overdueNow: Number(row?.out_overdue_now ?? 0),
      movementsPeriod: Number(row?.out_movements_period ?? 0),
      violationsPeriod: Number(row?.out_violations_period ?? 0),
    };
  }
}

export const managerMovementUnitService = new ManagerMovementUnitService();
export default managerMovementUnitService;
