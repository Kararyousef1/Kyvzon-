/**
 * ════════════════════════════════════════════════════════════════
 *  KioskService — بوابة الحارس (migration 0347)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres:
 *
 *  ① `KioskPage.tsx:233` — الكاتب الوحيد لـattendance_logs — كان
 *     يُدرج بلا `punch_type` ولا `shift_type`. والعمود
 *     `DEFAULT 'check-in'` ⇒ **بصمة الانصراف تُسجَّل «دخولاً»**.
 *     مُثبَت: بصمات الخروج في القاعدة = 0 · بصمات بلا shift_type = 2.
 *
 *  ② **لا شيء في المنصّة يكتب `attendance_summary` من البصمات**:
 *     محفّزات على attendance_logs = 0 · دالة refresh = 0.
 *     والكشك يحسب إحصائياته من ذلك الجدول وحده ⇒ «حاضر: 0» و
 *     «غائب: الجميع» مهما بصم الحارس طوال اليوم.
 *
 *  ③ النوع كان يُستنتج من **عدّ** المصفوفة:
 *       empLogs.length % 2 === 0 ? 'check_in' : 'check_out'
 *     منطق تناوب ينقلب كلّه لو ضاعت بصمة واحدة.
 *
 *  ④ `.filter((s: any , EmployeeStatus) => …)` — معاملٌ ثانٍ اسمه
 *     `EmployeeStatus` يُظلّل النوع المستورد ويستقبل الفهرس.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** نوع البصمة — القيم المسموحة في القيد (بشرطة لا شرطة سفلية) */
export type PunchType = 'check-in' | 'check-out';

export interface KioskPunchResult {
  punchType: PunchType;
  punchTime: string;
  shiftType: string;
  shiftDate: string;
  punchCount: number;
  /** لمسة مكرّرة خلال 60 ثانية — لم تُدرَج بصمة جديدة */
  debounced: boolean;
}

export type KioskStatus = 'مداوم' | 'منصرف' | 'غائب';

export interface KioskBoardRow {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  department: string;
  userId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  shiftType: string;
  punchCount: number;
  /** الإجراء التالي — من **نوع** آخر بصمة لا من عدّها */
  nextAction: PunchType;
  status: KioskStatus;
}

export interface KioskStats {
  total: number;
  present: number;
  left: number;
  onLeave: number;
  absent: number;
}

const EMPTY_STATS: KioskStats = {
  total: 0, present: 0, left: 0, onLeave: 0, absent: 0,
};

class KioskService {
  /**
   * تسجيل بصمة — ذرّية وتعرف نوعها.
   *
   * ★★ RPC لا BaseService: سياسة INSERT على attendance_logs تشترط
   *   `current_user_is_staff()` = admin·hr·developer·it_admin فقط.
   *   والحارس قد يحمل دور supervisor أو gatekeeper — مُثبَت بـRLS أن
   *   الإدراج المباشر يُصدّ. الدالة DEFINER تفحص الصلاحية بنفسها.
   */
  async punch(
    employeeId: string,
    verification = 'finger',
    deviceId: string | null = null,
  ): Promise<KioskPunchResult> {
    const { data, error } = await supabase.rpc('kiosk_punch', {
      p_employee_id: employeeId,
      p_verification: verification,
      p_device_id: deviceId,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = {
      out_punch_type: PunchType; out_punch_time: string;
      out_shift_type: string; out_shift_date: string;
      out_punch_count: number; out_debounced: boolean;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) {
      throw new Error('لم تُسجَّل البصمة — لا استجابة من القاعدة');
    }
    const r = rows[0];
    return {
      punchType:  r.out_punch_type,
      punchTime:  r.out_punch_time,
      shiftType:  r.out_shift_type,
      shiftDate:  r.out_shift_date,
      punchCount: Number(r.out_punch_count ?? 0),
      debounced:  Boolean(r.out_debounced),
    };
  }

  /** لوحة الكشك — الموظفون وحالاتهم اليوم */
  async board(search: string | null = null, limit = 300): Promise<KioskBoardRow[]> {
    const { data, error } = await supabase.rpc('kiosk_board', {
      p_search: search,
      p_limit: limit,
    });
    if (error) {
      logger.error('kiosk_board فشل: ' + error.message, {
        component: 'KioskService', action: 'board',
      });
      return [];
    }
    type Raw = {
      out_employee_id: string; out_full_name: string;
      out_employee_code: string; out_department: string;
      out_user_id: string | null; out_check_in: string | null;
      out_check_out: string | null; out_shift_type: string;
      out_punch_count: number; out_next_action: PunchType;
      out_status: KioskStatus;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      employeeId:   r.out_employee_id,
      fullName:     r.out_full_name,
      employeeCode: r.out_employee_code,
      department:   r.out_department,
      userId:       r.out_user_id,
      checkIn:      r.out_check_in,
      checkOut:     r.out_check_out,
      shiftType:    r.out_shift_type,
      punchCount:   Number(r.out_punch_count ?? 0),
      nextAction:   r.out_next_action,
      status:       r.out_status,
    }));
  }

  /** الإحصائيات — من البصمات لا من ملخّص فارغ */
  async stats(): Promise<KioskStats> {
    const { data, error } = await supabase.rpc('kiosk_stats');
    if (error) {
      logger.error('kiosk_stats فشل: ' + error.message, {
        component: 'KioskService', action: 'stats',
      });
      return EMPTY_STATS;
    }
    type Raw = {
      out_total: number; out_present: number; out_left: number;
      out_on_leave: number; out_absent: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY_STATS;
    const r = rows[0];
    return {
      total:   Number(r.out_total ?? 0),
      present: Number(r.out_present ?? 0),
      left:    Number(r.out_left ?? 0),
      onLeave: Number(r.out_on_leave ?? 0),
      absent:  Number(r.out_absent ?? 0),
    };
  }
}

export const kioskService = new KioskService();
