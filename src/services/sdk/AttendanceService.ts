/**
 * ════════════════════════════════════════════════════════════════
 *  AttendanceService - خدمة الحضور والانصراف
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, SdkError } from './BaseService';
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import type { AttendanceLogRecord, AttendanceSummaryRecord } from '../../shared/types/sdk';

/** يوم في سجلّ حضوري الشهري (0337) */
export interface MyAttendanceDay {
  shiftDate: string;
  shiftType: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  totalHours: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtime: number;
}

/** إحصاءات الشهر — محسوبة في القاعدة */
export interface MyAttendanceStats {
  total: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  totalHours: number;
  /** المتوسط على **أيام الحضور** لا كل الأيام */
  avgHours: number;
  lateMinutes: number;
  overtime: number;
  /**
   * ★★ أيامٌ بحالة خارج المفردات الثماني (0344).
   *   صفر يعني أن ما في القاعدة يطابق ما تكتبه المنصّة. أي رقم أكبر
   *   يعني بياناتٍ لا نعرف دلالتها — تُعرض للموظف بدل ابتلاعها.
   */
  unknown: number;
}

/** طلب تصحيح حضور (0344) */
export interface MyAttendanceCorrection {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** تتابع الحضور */
export interface MyAttendanceStreak {
  current: number;
  longest: number;
  lastAbsence: string | null;
}

/** دلو ساعي واحد في التوزيع الحقيقي للبصمات (migration 0327) */
export interface HourlyPunchBucket {
  /** بداية الساعة بصيغة ISO */
  bucket: string;
  /** رقم الساعة 0-23 */
  hour: number;
  punchIn: number;
  punchOut: number;
  total: number;
}

class AttendanceService extends BaseService<AttendanceLogRecord> {
  constructor() {
    super('attendance_logs');
  }

  /**
   * سجلّات موظف بعينه.
   *
   * ★★ حارس مُضاف (0333): استدعاء بمعرّف فارغ كان يبني
   *    `employee_id=eq.` فيردّ Postgres 400 بنصّ:
   *      invalid input syntax for type uuid: ""
   *    وقع فعلاً في `AttendanceAnalytics.tsx:157` حيث مُرّر `''` ليعني
   *    «كل الموظفين». لا يوجد استعمال مشروع لمعرّف فارغ هنا — من يريد
   *    كل الموظفين يستعمل `todayByHour()` أو `todayShiftSplit()`.
   */
  async findLogsByEmployee(employeeId: string, options?: {
    fromDate?: string; toDate?: string; limit?: number;
  }): Promise<AttendanceLogRecord[]> {
    if (!employeeId || employeeId.trim() === '') {
      logger.warn('findLogsByEmployee استُدعيت بمعرّف فارغ — أُعيدت قائمة فارغة', {
        component: 'AttendanceService',
        action: 'findLogsByEmployee',
      });
      return [];
    }

    logger.debug('AttendanceService.findLogsByEmployee', {
      component: 'AttendanceService',
      action: 'findLogsByEmployee',
      employeeId,
    });

    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'punch_time',
      ascending: false,
      limit: options?.limit || 100,
    });
  }

  /**
   * توزيع بصمات اليوم على 24 ساعة — بنطاق المستأجر بلا معرّف موظف.
   *
   * ★ يستبدل `findLogsByEmployee('', { limit: 1000 })` الذي أسقط
   *   صفحة تحليلات الحضور. التجميع في القاعدة لا في المتصفح: النسخة
   *   السابقة كانت ستجلب ألف صفّ كامل لتعدّها محلياً.
   *   الساعات الصفرية مُضمَّنة — حذفها يُزيح الرسم (درس 0327).
   */
  async todayByHour(): Promise<Array<{
    hour: number; total: number; punchIn: number; punchOut: number;
  }>> {
    const { data, error } = await supabase.rpc('attendance_today_by_hour');
    if (error) {
      logger.error('todayByHour فشل: ' + error.message, {
        component: 'AttendanceService',
        action: 'todayByHour',
      });
      return [];
    }
    type Raw = {
      out_hour: number; out_total: number;
      out_punch_in: number; out_punch_out: number;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      hour: Number(r.out_hour ?? 0),
      total: Number(r.out_total ?? 0),
      punchIn: Number(r.out_punch_in ?? 0),
      punchOut: Number(r.out_punch_out ?? 0),
    }));
  }

  /**
   * بصمات آخر سبعة أيام — للرسم الأسبوعي.
   *
   * ★ الرسم كان يُحسب من نفس المصفوفة المعطوبة التي أعادها
   *   `findLogsByEmployee('')`؛ ولمّا كان الاستدعاء يسقط بقي أصفاراً.
   */
  async last7Days(): Promise<Array<{ day: string; total: number; present: number }>> {
    const { data, error } = await supabase.rpc('attendance_last_7_days');
    if (error) {
      logger.error('last7Days فشل: ' + error.message, {
        component: 'AttendanceService',
        action: 'last7Days',
      });
      return [];
    }
    type Raw = { out_day: string; out_total: number; out_present: number };
    return ((data ?? []) as Raw[]).map((r) => ({
      day: r.out_day,
      total: Number(r.out_total ?? 0),
      present: Number(r.out_present ?? 0),
    }));
  }

  /**
   * سجلّات حضوري لشهر بعينه (migration 0337).
   *
   * ★★ العطل: `MyAttendancePage` كانت تحسب `startDate`/`endDate` ثم
   *   **لا تُمرّرهما لأي استعلام** — فجلبت كل تاريخ الموظف وعرضته
   *   كأنه الشهر المختار. مُثبَت: 23 سجلاً بدل 3 · 175 ساعة بدل 15.
   *   وأزرار التنقّل بين الشهور لم تكن تغيّر شيئاً.
   *
   * ★ الحدود تُحسب في القاعدة لا تُمرَّر نصّاً: تمرير تاريخين من
   *   المتصفح يعني الوثوق بمنطقته الزمنية.
   */
  async myMonth(year?: number, month?: number): Promise<MyAttendanceDay[]> {
    const { data, error } = await supabase.rpc('my_attendance_month', {
      p_year: year ?? null,
      p_month: month ?? null,
    });
    if (error) {
      logger.error('myMonth فشل: ' + error.message, {
        component: 'AttendanceService', action: 'myMonth',
      });
      return [];
    }
    type Raw = {
      out_shift_date: string; out_shift_type: string;
      out_check_in: string | null; out_check_out: string | null;
      out_status: string; out_total_hours: number;
      out_late_minutes: number; out_early_minutes: number; out_overtime: number;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      shiftDate: r.out_shift_date,
      shiftType: r.out_shift_type,
      checkIn: r.out_check_in,
      checkOut: r.out_check_out,
      status: r.out_status,
      totalHours: Number(r.out_total_hours ?? 0),
      lateMinutes: Number(r.out_late_minutes ?? 0),
      earlyMinutes: Number(r.out_early_minutes ?? 0),
      overtime: Number(r.out_overtime ?? 0),
    }));
  }

  /** إحصاءات الشهر — محسوبة في القاعدة */
  async myMonthStats(year?: number, month?: number): Promise<MyAttendanceStats> {
    const EMPTY: MyAttendanceStats = {
      total: 0, present: 0, late: 0, absent: 0, leave: 0,
      totalHours: 0, avgHours: 0, lateMinutes: 0, overtime: 0, unknown: 0,
    };
    const { data, error } = await supabase.rpc('my_attendance_month_stats', {
      p_year: year ?? null,
      p_month: month ?? null,
    });
    if (error) {
      logger.error('myMonthStats فشل: ' + error.message, {
        component: 'AttendanceService', action: 'myMonthStats',
      });
      return EMPTY;
    }
    type Raw = {
      out_total: number; out_present: number; out_late: number;
      out_absent: number; out_leave: number; out_total_hours: number;
      out_avg_hours: number; out_late_minutes: number; out_overtime: number;
      out_unknown: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY;
    const r = rows[0];
    return {
      total: Number(r.out_total ?? 0),
      present: Number(r.out_present ?? 0),
      late: Number(r.out_late ?? 0),
      absent: Number(r.out_absent ?? 0),
      leave: Number(r.out_leave ?? 0),
      totalHours: Number(r.out_total_hours ?? 0),
      avgHours: Number(r.out_avg_hours ?? 0),
      lateMinutes: Number(r.out_late_minutes ?? 0),
      overtime: Number(r.out_overtime ?? 0),
      unknown: Number(r.out_unknown ?? 0),
    };
  }

  /**
   * سجلّ طلبات تصحيح الحضور (0344).
   *
   * ★★ الصفحة كانت تُنشئ hr_case بـcase_type='attendance_correction'
   *   ثم **لا تعرضه أبداً**: الموظف يضغط «أرسل» ويرى رسالة نجاح ولا
   *   يعرف بعدها شيئاً عن مصير طلبه.
   */
  async myCorrections(limit = 20): Promise<MyAttendanceCorrection[]> {
    const { data, error } = await supabase.rpc('my_attendance_corrections', {
      p_limit: limit,
    });
    if (error) {
      logger.error('myCorrections فشل: ' + error.message, {
        component: 'AttendanceService', action: 'myCorrections',
      });
      return [];
    }
    type Raw = {
      out_id: string; out_subject: string; out_description: string;
      out_status: string; out_priority: string; out_resolution: string | null;
      out_created_at: string; out_resolved_at: string | null;
    };
    return ((data ?? []) as Raw[]).map((c) => ({
      id: c.out_id,
      subject: c.out_subject,
      description: c.out_description,
      status: c.out_status,
      priority: c.out_priority,
      resolution: c.out_resolution,
      createdAt: c.out_created_at,
      resolvedAt: c.out_resolved_at,
    }));
  }

  /**
   * تطبيق إجازة معتمَدة على سجلّ الحضور (0344).
   *
   * ★★★ `leaveAttendanceLink.ts:52` كان يلمس Supabase مباشرة ويُدرج
   *   **بلا tenant_id** (NOT NULL بلا default ولا محفّز) ⇒ فشل مُثبَت:
   *     null value in column "tenant_id" ... violates not-null constraint
   *   ويعلن `onConflict: 'employee_id, shift_date'` بينما القيد الحقيقي
   *   ثلاثيّ ⇒ فشل مُثبَت:
   *     there is no unique or exclusion constraint matching the
   *     ON CONFLICT specification
   *
   * ★ ولماذا RPC لا BaseService؟ لأن سياسة INSERT على
   *   attendance_summary تشترط current_user_is_staff() —
   *   وهي admin·hr·developer·it_admin فقط. **المدير الذي يعتمد
   *   الإجازة ليس staff** فكان الإدراج يُصدّ حتى بـtenant_id صحيح
   *   (مُثبَت بـRLS: new row violates row-level security policy).
   *   الدالة DEFINER تفحص الصلاحية بنفسها.
   */
  async applyLeaveToAttendance(
    employeeId: string, dateFrom: string, dateTo: string,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('apply_leave_to_attendance', {
      p_employee_id: employeeId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return Number(data ?? 0);
  }

  /**
   * التراجع عن إجازة مرفوضة/ملغاة (0344).
   *
   * ★★★ بلا حذف نهائي. الكود القديم (`leaveAttendanceLink.ts:171`) كان
   *   يحذف الصفوف نهائياً ثم يستدعي `refresh_attendance_summary`
   *   لإعادة بنائها — وهي دالة **غير موجودة في القاعدة إطلاقاً**
   *   (مُثبَت: SELECT count(*) FROM pg_proc ⇒ 0 · وصفر مطابقة في
   *   `grep -rln refresh_attendance_summary supabase/`). ⇒ فقدان صافٍ.
   */
  async revertLeaveFromAttendance(
    employeeId: string, dateFrom: string, dateTo: string,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('revert_leave_from_attendance', {
      p_employee_id: employeeId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return Number(data ?? 0);
  }

  /**
   * تتابع الحضور الحقيقي.
   *
   * ★ الصفحة كانت تحسبه `Math.min(عدد غير الغائب, 7)` — عدٌّ لا تتابع.
   *   من حضر يوماً وغاب يوماً شهراً كاملاً كان يحصل على 7.
   */
  async myStreak(): Promise<MyAttendanceStreak> {
    const { data, error } = await supabase.rpc('my_attendance_streak');
    if (error) {
      logger.error('myStreak فشل: ' + error.message, {
        component: 'AttendanceService', action: 'myStreak',
      });
      return { current: 0, longest: 0, lastAbsence: null };
    }
    type Raw = {
      out_current_streak: number; out_longest_streak: number;
      out_last_absence: string | null;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return { current: 0, longest: 0, lastAbsence: null };
    return {
      current: Number(rows[0].out_current_streak ?? 0),
      longest: Number(rows[0].out_longest_streak ?? 0),
      lastAbsence: rows[0].out_last_absence,
    };
  }

  /** توزيع بصمات اليوم على الورديات الثلاث — الفارغة مُضمَّنة بصفر */
  async todayShiftSplit(): Promise<Array<{
    shift: string; label: string; count: number;
  }>> {
    const { data, error } = await supabase.rpc('attendance_today_shift_split');
    if (error) {
      logger.error('todayShiftSplit فشل: ' + error.message, {
        component: 'AttendanceService',
        action: 'todayShiftSplit',
      });
      return [];
    }
    type Raw = { out_shift: string; out_label: string; out_count: number };
    return ((data ?? []) as Raw[]).map((r) => ({
      shift: r.out_shift,
      label: r.out_label,
      count: Number(r.out_count ?? 0),
    }));
  }

  async findLastPunch(employeeId: string): Promise<AttendanceLogRecord | null> {
    logger.debug('AttendanceService.findLastPunch', {
      component: 'AttendanceService',
      action: 'findLastPunch',
      employeeId,
    });

    const logs = await this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'punch_time',
      ascending: false,
      limit: 1,
    });
    return logs.length > 0 ? logs[0] : null;
  }

  async recordPunch(data: Partial<AttendanceLogRecord>): Promise<AttendanceLogRecord> {
    logger.info('AttendanceService.recordPunch', {
      component: 'AttendanceService',
      action: 'recordPunch',
    });
    return this.create(data);
  }

  /**
   * عدد البصمات منذ لحظة — يُحسب في القاعدة.
   *
   * ★ أُصلح في 0327: النسخة السابقة كانت
   *     findWhere([...], { limit: 1000 }).then(rows => rows.length)
   *   أي تجلب حتى **1000 صفّ كامل** لتعدّها في المتصفح. شركة فيها
   *   1200 بصمة ترى «1000» صامتةً، والرقم كان يُغذّي الرسم الساعي
   *   فيتضاعف الخطأ.
   */
  async countPunchesSince(fromIso: string): Promise<number> {
    const hours = Math.max(
      1,
      Math.ceil((Date.now() - new Date(fromIso).getTime()) / 3_600_000),
    );
    const { data, error } = await supabase.rpc('attendance_punch_count', {
      p_hours: hours,
    });
    if (error) {
      console.error('countPunchesSince فشل:', error.message);
      return 0;
    }
    return typeof data === 'number' ? data : 0;
  }

  /**
   * التوزيع الساعي الحقيقي للبصمات (migration 0327).
   *
   * ★ لوحة التقنية كانت تقسم الإجمالي على 12 وتضيف `Math.random()*3`:
   *     const avg = Math.floor(logs2 / 12);
   *     punchBuckets[i] = avg + Math.floor(Math.random() * 3);
   *   مقيس: ذروة 20 بصمة في ساعة تظهر 12 عموداً بقيمة ~1 ⇒ الذروة
   *   تختفي ومسؤول التقنية لا يكتشف ازدحام البوابة.
   *
   *   الساعات الصفرية مُضمَّنة — حذفها يزيح الرسم.
   */
  async punchesHourly(hours = 12): Promise<HourlyPunchBucket[]> {
    const { data, error } = await supabase.rpc('attendance_punches_hourly', {
      p_hours: hours,
    });
    if (error) {
      console.error('punchesHourly فشل:', error.message);
      return [];
    }
    type RawBucket = {
      out_bucket: string;
      out_hour: number;
      out_punch_in: number;
      out_punch_out: number;
      out_total: number;
    };
    return ((data ?? []) as RawBucket[]).map((b) => ({
      bucket: b.out_bucket,
      hour: b.out_hour,
      punchIn: b.out_punch_in,
      punchOut: b.out_punch_out,
      total: b.out_total,
    }));
  }
}

// ─── Attendance Summary ──────────────────────────

class AttendanceSummaryService extends BaseService<AttendanceSummaryRecord> {
  constructor() {
    super('attendance_summary');
  }

  async findSummaryByEmployee(employeeId: string, options?: {
    fromDate?: string; toDate?: string;
  }): Promise<AttendanceSummaryRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'shift_date',
      ascending: false,
    });
  }

  async getDailyStats(date: string): Promise<{
    date: string; total: number; present: number; late: number; absent: number;
  }> {
    const records = await this.findAll({ filters: { shift_date: date } });
    return {
      date,
      total: records.length,
      present: records.filter((r) => r.status === 'حضور_بوقت').length,
      late: records.filter((r) => r.status === 'متأخر').length,
      absent: records.filter((r) => r.status === 'غائب').length,
    };
  }

  async updateSummary(employeeId: string, shiftDate: string, data: Partial<AttendanceSummaryRecord>): Promise<AttendanceSummaryRecord> {
    const records = await this.findAll({
      filters: { employee_id: employeeId, shift_date: shiftDate },
      limit: 1,
    });
    if (records.length > 0) {
      return this.update(records[0].id, data);
    }
    return this.create({
      employee_id: employeeId,
      shift_date: shiftDate,
      ...data,
    } as unknown as Partial<AttendanceSummaryRecord>);
  }
}

export const attendanceService = new AttendanceService();
export const attendanceSummaryService = new AttendanceSummaryService();
