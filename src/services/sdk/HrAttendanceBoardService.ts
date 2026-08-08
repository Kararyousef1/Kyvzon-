/**
 * ════════════════════════════════════════════════════════════════
 *  HrAttendanceBoardService — لوحة الحضور اليومي (migration 0346)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres:
 *
 *  ① `hr/AttendancePage.tsx:44` بحث عن `punch_type === 'check_in'`
 *     بشرطة سفلية، والقيد يسمح بـ`'check-in'` بشرطة:
 *       CHECK (punch_type IN ('in','out','check-in','check-out'))
 *     إدراج `'check_in'` **مرفوض** ⇒ لا صفّ يمكن أن يطابق ⇒ الحالة
 *     `'غائب'` للجميع أبداً حتى لو بصم الجميع.
 *
 *  ② `KioskPage.tsx:233` — الكاتب الوحيد — **لا يمرّر `punch_type`**
 *     فيُطبَّق `DEFAULT 'check-in'` على كل بصمة. مُثبَت: بصمات الخروج
 *     في القاعدة = **0**. لذلك الدخول/الخروج يُشتقّان من **ترتيب
 *     البصمات** لا من النوع.
 *
 *  ③ `:29` `filters: { punch_time: todayStart }` و`BaseService` يحوّلها
 *     إلى `.eq()` ⇒ مساواة تامّة للحظة 00:00:00.000. مُثبَت: صفوف
 *     مطابقة = 0 بينما بصمات اليوم = 2. و`todayEnd` مُحتسب ولا يُستعمل.
 *
 *  ④ عمودا «مدة الاستراحات» و«موقع الاستراحة» كانا `0` و`''` ثابتين
 *     رغم وجود جدول `employee_breaks` يملؤه الحارس والمشرف.
 *
 *  ⑤ لا منتقي تاريخ · لا بحث · لا ترشيح · لا ملخّص.
 *
 *  ⑥ `:56` `emp.full_name_ar || 'بدون اسم'` — ومحفّز 0317 يملأ
 *     `first_name`/`last_name` فقط. مُثبَت: موظفون لهم `full_name_ar`
 *     في القاعدة = **0** ⇒ «بدون اسم» في كل صفّ.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

/** حالات الحضور اليومي — تُشتقّ في القاعدة */
export type DailyAttendanceStatus = 'مداوم' | 'في استراحة' | 'منصرف' | 'غائب';

export interface DailyAttendanceRow {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  departmentId: string | null;
  department: string;
  checkIn: string | null;
  /** `null` = لم ينصرف بعد (لا نختلق خروجاً من بصمة واحدة) */
  checkOut: string | null;
  punchCount: number;
  workedMinutes: number;
  breakMinutes: number;
  breakCount: number;
  onBreak: boolean;
  /** وجهة الاستراحة **النشطة** وحدها — `null` إن رجع */
  destination: string | null;
  status: DailyAttendanceStatus;
}

export interface DailyAttendanceSummary {
  total: number;
  /** يشمل من في استراحة — هو في العمل لا خارجه */
  present: number;
  onBreak: number;
  left: number;
  absent: number;
  /** المتوسط على الحاضرين وحدهم لا على الجميع */
  avgMinutes: number;
  firstIn: string | null;
  lastOut: string | null;
}

export interface DailyAttendanceFilters {
  date?: string;
  departmentId?: string | null;
  status?: DailyAttendanceStatus | null;
  search?: string | null;
  limit?: number;
}

const EMPTY_SUMMARY: DailyAttendanceSummary = {
  total: 0, present: 0, onBreak: 0, left: 0, absent: 0,
  avgMinutes: 0, firstIn: null, lastOut: null,
};

class HrAttendanceBoardService {
  /** لوحة اليوم — مع الاستراحات والترشيحات */
  async board(f: DailyAttendanceFilters = {}): Promise<DailyAttendanceRow[]> {
    const { data, error } = await supabase.rpc('hr_daily_attendance', {
      p_date: f.date ?? null,
      p_department_id: f.departmentId ?? null,
      p_status: f.status ?? null,
      p_search: f.search ?? null,
      p_limit: f.limit ?? 200,
    });
    if (error) {
      logger.error('hr_daily_attendance فشل: ' + error.message, {
        component: 'HrAttendanceBoardService', action: 'board',
      });
      return [];
    }
    type Raw = {
      out_employee_id: string; out_full_name: string; out_employee_code: string;
      out_department_id: string | null; out_department: string;
      out_check_in: string | null; out_check_out: string | null;
      out_punch_count: number; out_worked_minutes: number;
      out_break_minutes: number; out_break_count: number;
      out_on_break: boolean; out_destination: string | null;
      out_status: DailyAttendanceStatus;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      employeeId:    r.out_employee_id,
      fullName:      r.out_full_name,
      employeeCode:  r.out_employee_code,
      departmentId:  r.out_department_id,
      department:    r.out_department,
      checkIn:       r.out_check_in,
      checkOut:      r.out_check_out,
      punchCount:    Number(r.out_punch_count ?? 0),
      workedMinutes: Number(r.out_worked_minutes ?? 0),
      breakMinutes:  Number(r.out_break_minutes ?? 0),
      breakCount:    Number(r.out_break_count ?? 0),
      onBreak:       Boolean(r.out_on_break),
      destination:   r.out_destination,
      status:        r.out_status,
    }));
  }

  /** ملخّص اليوم — لم يكن للصفحة ملخّص إطلاقاً */
  async summary(
    date?: string, departmentId?: string | null,
  ): Promise<DailyAttendanceSummary> {
    const { data, error } = await supabase.rpc('hr_daily_attendance_summary', {
      p_date: date ?? null,
      p_department_id: departmentId ?? null,
    });
    if (error) {
      logger.error('hr_daily_attendance_summary فشل: ' + error.message, {
        component: 'HrAttendanceBoardService', action: 'summary',
      });
      return EMPTY_SUMMARY;
    }
    type Raw = {
      out_total: number; out_present: number; out_on_break: number;
      out_left: number; out_absent: number; out_avg_minutes: number;
      out_first_in: string | null; out_last_out: string | null;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY_SUMMARY;
    const r = rows[0];
    return {
      total:      Number(r.out_total ?? 0),
      present:    Number(r.out_present ?? 0),
      onBreak:    Number(r.out_on_break ?? 0),
      left:       Number(r.out_left ?? 0),
      absent:     Number(r.out_absent ?? 0),
      avgMinutes: Number(r.out_avg_minutes ?? 0),
      firstIn:    r.out_first_in,
      lastOut:    r.out_last_out,
    };
  }
}

export const hrAttendanceBoardService = new HrAttendanceBoardService();
