/**
 * ════════════════════════════════════════════════════════════════
 *  ShiftScheduleService — جدولة الورديات (migration 0368)
 *
 *  ★★★★ **العطل الأول: زرُّ «تعيين وردية» لم يعمل يوماً.**
 *
 *     `shift_assignments.schedule_id` هو **NOT NULL بلا افتراضيّ**،
 *     والصفحة القديمة لا ترسله إطلاقاً:
 *        upsertAssignment({ employee_id, shift_type, shift_date, notes })
 *
 *     PROBE_1 بمحاكاةٍ حرفية لهذا النداء:
 *        رُفض: null value in column "schedule_id" of relation
 *              "shift_assignments" violates not-null constraint
 *
 *     ⇒ كلُّ ضغطةٍ على «تعيين» كانت تُخرج رسالة خطأ. والصفحة لوحةُ
 *       عرضٍ لجدولٍ لا سبيل إلى ملئه.
 *     ★★ والعمود يشير إلى **جدولٍ غير موجود**: جداول باسم
 *       shift_schedules/schedules/work_schedules = **صفر**.
 *
 *  ★★★★ **العطل الثاني: مفردات الصفحة غير موجودة في المنظومة.**
 *     الصفحة تُبرمج 'صباحي'·'مسائي'·'ليلي' بالنصّ، و`structure_shifts`
 *     تعرّف أربعاً بأسماء **مختلفة**:
 *        morning=الوردية الصباحية 08:00–16:00
 *        evening=الوردية المسائية 16:00–00:00
 *        night  =الوردية الليلية  00:00–08:00
 *        flexible=وردية مرنة
 *     PROBE_8: صفوفٌ باسم 'صباحي'/'مسائي'/'ليلي' = **صفر·صفر·صفر**.
 *     ⇒ أوقاتُ الدوام مكتوبةٌ في نصّ الواجهة لا مقروءةٌ من القاعدة،
 *       و«وردية مرنة» لا سبيل إلى إسنادها. ودالة `shift_catalog()`
 *       موجودةٌ منذ 0318 ولا تستعملها الصفحة.
 *
 *  ③/④/⑤ **صفر FK** — وردية لموظفٍ معدوم · لموظف مستأجرٍ آخر ·
 *     و`tenant_id` قابلٌ للعدم (صفٌّ يفلت من كل RLS).
 *  ⑥ **`shift_type` بلا CHECK** ⇒ `shiftConfig[shift]` = undefined.
 *  ⑦ **`assigned_by` بلا FK ولا ملء** — 4 من 4 بلا مُسنِد.
 *  ⑧ **وردياتٌ في 2018 و2034** ⇒ قُبِلتا.
 *  ⑨ ★★★★ **الجدولة تتجاهل الإجازات المعتمدة**: إجازةٌ «موافق»
 *     8→13 آب ثم وردية يوم 10 آب ⇒ **قُبِلت**. الحضور سيسجّله
 *     غائباً والراتب سيُخصم.
 *  ⑩ ★★★ **لا حدَّ أدنى للراحة**: ليلي (00:00–08:00) ثم صباحي
 *     (08:00) في اليوم التالي ⇒ صفر ساعة راحة.
 *  ⑪ **الحذف النهائيّ مسموح** (أُثبت بدور `authenticated`).
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/**
 * ★★★★ أكواد الورديات الأربعة — مطابِقة لـ`structure_shifts.code`
 *   ولـ`chk_shift_type_vocab`. الصفحة القديمة كانت تكتب أسماءً
 *   عربيةً لا وجود لها في أيّ جدول.
 */
export const SHIFT_CODES = ['morning', 'evening', 'night', 'flexible'] as const;
export type ShiftCode = (typeof SHIFT_CODES)[number];

/** ★ حالتا الإسناد — مطابِقتان لـ`chk_shift_status` */
export const SHIFT_STATES = ['scheduled', 'cancelled'] as const;
export type ShiftState = (typeof SHIFT_STATES)[number];

/**
 * ★★ الأسماء الاحتياطية. المصدر الحقيقيّ `structure_shifts` عبر
 *   `shift_week_board`، وهذه تُستعمل في القوائم المنسدلة قبل التحميل
 *   وحين لا يجد الانضمام قالباً.
 */
export const SHIFT_CODE_AR: Record<ShiftCode, string> = {
  morning:  'الوردية الصباحية',
  evening:  'الوردية المسائية',
  night:    'الوردية الليلية',
  flexible: 'وردية مرنة',
};

export const SHIFT_STATE_AR: Record<ShiftState, string> = {
  scheduled: 'مجدولة',
  cancelled: 'ملغاة',
};

export const SHIFT_CODE_TONE: Record<ShiftCode, string> = {
  morning:  'bg-amber-50 text-amber-700 border-amber-200',
  evening:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  night:    'bg-slate-800 text-slate-100 border-slate-700',
  flexible: 'bg-teal-50 text-teal-700 border-teal-200',
};

export const SHIFT_STATE_TONE: Record<ShiftState, string> = {
  scheduled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const NEUTRAL_TONE = 'bg-slate-100 text-slate-600 border-slate-200';

/** ★★ تُعيد النصّ الخامّ لا `undefined` عند مفردةٍ مجهولة */
export const shiftCodeLabel = (v: string): string =>
  SHIFT_CODE_AR[v as ShiftCode] ?? v;
export const shiftStateLabel = (v: string): string =>
  SHIFT_STATE_AR[v as ShiftState] ?? v;
export const shiftCodeTone = (v: string): string =>
  SHIFT_CODE_TONE[v as ShiftCode] ?? NEUTRAL_TONE;
export const shiftStateTone = (v: string): string =>
  SHIFT_STATE_TONE[v as ShiftState] ?? NEUTRAL_TONE;

export const isShiftCancelled = (v: string): boolean => v === 'cancelled';

export interface ShiftRow {
  id: string;
  employeeId: string;
  /** ★ مُركَّبٌ في القاعدة — `full_name_ar` فارغٌ بنيوياً */
  employeeName: string;
  employeeCode: string;
  shiftDate: string;
  shiftType: ShiftCode | string;
  /** ★★★★ من `structure_shifts` لا من نصّ الواجهة */
  shiftNameAr: string;
  startTime: string | null;
  endTime: string | null;
  status: ShiftState | string;
  notes: string | null;
  assignedBy: string | null;
  assignerName: string | null;
  isPast: boolean;
  /** ★★★★ العطل ⑨: تعارضٌ مع إجازةٍ معتمدة (لصفوفٍ سابقةٍ للقيد) */
  onLeave: boolean;
  createdAt: string | null;
}

export interface ShiftSummary {
  total: number;
  scheduled: number;
  cancelled: number;
  morning: number;
  evening: number;
  night: number;
  flexible: number;
  coveredDays: number;
  staffed: number;
  /** موظفون نشطون بلا أيّ وردية في النافذة */
  unstaffed: number;
  /** ★★★★ ورديات تتعارض مع إجازاتٍ معتمدة */
  leaveConflict: number;
}

export interface ShiftConflict {
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  shiftDate: string;
  shiftType: ShiftCode | string;
  leaveFrom: string;
  leaveTo: string;
}

export interface ShiftAssignInput {
  employeeId: string;
  shiftType: ShiftCode;
  shiftDate: string;
  notes?: string | null;
  /** ★ معرّف الدفعة: ورديات أسبوعٍ تُسنَد معاً تحمله جميعاً */
  batchId?: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 't';

class ShiftScheduleSdk {
  /**
   * لوح النافذة — استعلامٌ واحد بحدود التاريخ.
   *
   * ★ العطل ⑭ في الصفحة القديمة: جلبت **كل** الورديات ثم رشّحتها
   *   في المتصفّح بـ`.filter((a: any) => a.shift_date >= startStr …)`.
   * ★★★★ `shiftNameAr` و`startTime` و`endTime` من `structure_shifts`.
   */
  async board(weekStart?: string | null, days = 7): Promise<ShiftRow[]> {
    const { data, error } = await supabase.rpc('shift_week_board', {
      p_week_start: weekStart ?? null,
      p_days: days,
    });
    if (error) {
      logger.error('shift_week_board فشل: ' + error.message, {
        component: 'ShiftScheduleSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:            str(r.id),
      employeeId:    str(r.employee_id),
      employeeName:  str(r.employee_name),
      employeeCode:  str(r.employee_code),
      shiftDate:     str(r.shift_date),
      shiftType:     str(r.shift_type),
      shiftNameAr:   str(r.shift_name_ar),
      startTime:     strOrNull(r.start_time),
      endTime:       strOrNull(r.end_time),
      status:        str(r.status),
      notes:         strOrNull(r.notes),
      assignedBy:    strOrNull(r.assigned_by),
      assignerName:  strOrNull(r.assigner_name),
      isPast:        bool(r.is_past),
      onLeave:       bool(r.on_leave),
      createdAt:     strOrNull(r.created_at),
    }));
  }

  /** ملخّص النافذة — أحد عشر عدّاداً مُرشَّحةً بـRLS */
  async summary(weekStart?: string | null, days = 7): Promise<ShiftSummary> {
    const { data, error } = await supabase.rpc('shift_week_summary', {
      p_week_start: weekStart ?? null,
      p_days: days,
    });
    if (error) {
      logger.error('shift_week_summary فشل: ' + error.message, {
        component: 'ShiftScheduleSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:         num(r.total),
      scheduled:     num(r.scheduled),
      cancelled:     num(r.cancelled),
      morning:       num(r.morning),
      evening:       num(r.evening),
      night:         num(r.night),
      flexible:      num(r.flexible),
      coveredDays:   num(r.covered_days),
      staffed:       num(r.staffed),
      unstaffed:     num(r.unstaffed),
      leaveConflict: num(r.leave_conflict),
    };
  }

  /**
   * ★★★★ العطل ①: إسناد وردية — المسار الذي لم يعمل يوماً.
   *
   * ★ `schedule_id` يُملأ في القاعدة صراحةً (أو من `batchId`).
   * ★ الحرّاس: `SHIFT_NOT_STAFF` · `SHIFT_BAD_TYPE` ·
   *   `SHIFT_DATE_REQUIRED` · ومحفّزُ `SHIFT_ON_APPROVED_LEAVE` (⑨)
   *   و`SHIFT_NO_REST` (⑩) و`SHIFT_DATE_TOO_OLD/_TOO_FAR` (⑧).
   * ★ إعادة الإسناد لليوم نفسه **تُحدّث** بدل أن ترمي، وتُحيي الملغاة.
   */
  async assign(input: ShiftAssignInput): Promise<string> {
    const { data, error } = await supabase.rpc('shift_assign', {
      p_employee_id: input.employeeId,
      p_shift_type:  input.shiftType,
      p_shift_date:  input.shiftDate,
      p_notes:       input.notes ?? null,
      p_batch:       input.batchId ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ★★ العطل ⑪: الإلغاء — **بديل الحذف**.
   *   قبل 0368 كانت HR تحذف الإسناد نهائياً بدور `authenticated`.
   */
  async cancel(id: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('shift_cancel', {
      p_id: id, p_reason: reason,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * ★★★★ العطل ⑨: كشفُ الورديات المتعارضة مع إجازاتٍ معتمدة.
   *   للصفوف السابقة لسريان القيد — المحفّز يمنع الجديد.
   */
  async leaveConflicts(from?: string | null, days = 30): Promise<ShiftConflict[]> {
    const { data, error } = await supabase.rpc('shift_leave_conflicts', {
      p_from: from ?? null, p_days: days,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return ((data ?? []) as Raw[]).map((r) => ({
      assignmentId: str(r.assignment_id),
      employeeId:   str(r.employee_id),
      employeeName: str(r.employee_name),
      shiftDate:    str(r.shift_date),
      shiftType:    str(r.shift_type),
      leaveFrom:    str(r.leave_from),
      leaveTo:      str(r.leave_to),
    }));
  }
}

export const shiftScheduleSdk = new ShiftScheduleSdk();
