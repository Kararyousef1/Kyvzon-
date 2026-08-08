/**
 * SupervisorMovementUnitService — وحدة «الحركة» في بوابة المشرف (0307)
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الفرق الجوهري عن ManagerMovementUnitService:
 *   المدير  → يعتمد التصاريح (decidePermit)
 *   المشرف  → يتابع الوردية **ولا يعتمد** — لا دالة قرار هنا إطلاقاً
 *
 * هذا انعكاس للواقع التنظيمي لا تقييد تقني: الإذن بالخروج قرار إداري
 * يخصّ المدير، والمشرف مسؤول عمّن هو خارج الموقع الآن ومن تأخّر.
 *
 * مايجريشن 0307 يحوي حارساً يمنع أي دالة مشرف من تعديل التصاريح.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export interface SupervisorShiftMovement {
  logId: string;
  employeeId: string;
  employeeName: string;
  destination: string;
  departureAt: string;
  expectedReturn: string | null;
  actualReturn: string | null;
  status: string;
  overdueMinutes: number;
  isOutNow: boolean;
}

export interface SupervisorShiftKpis {
  teamSize: number;
  outNow: number;
  overdueNow: number;
  returnedShift: number;
  totalShift: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  NOT_ASSIGNED_TO_UNIT: 'لم تُسنَد إليك وحدة الحركة في بوابة المشرف.',
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class SupervisorMovementUnitService {
  /** حركة الوردية — المتأخرون أولاً */
  async findShiftMovements(hours = 12): Promise<SupervisorShiftMovement[]> {
    const { data, error } = await supabase.rpc('supervisor_movement_shift', {
      p_hours: hours,
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
      isOutNow: r.out_is_out_now === true,
    }));
  }

  /** مؤشرات الوردية */
  async getShiftKpis(hours = 12): Promise<SupervisorShiftKpis> {
    const { data, error } = await supabase.rpc('supervisor_movement_shift_kpis', {
      p_hours: hours,
    });
    if (error) throw new Error(translateError(error.message));

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    return {
      teamSize: Number(row?.out_team_size ?? 0),
      outNow: Number(row?.out_out_now ?? 0),
      overdueNow: Number(row?.out_overdue_now ?? 0),
      returnedShift: Number(row?.out_returned_shift ?? 0),
      totalShift: Number(row?.out_total_shift ?? 0),
    };
  }
}

export const supervisorMovementUnitService = new SupervisorMovementUnitService();
export default supervisorMovementUnitService;
