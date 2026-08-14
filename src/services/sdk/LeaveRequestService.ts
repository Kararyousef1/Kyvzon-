/**
 * ════════════════════════════════════════════════════════════════
 *  LeaveRequestService — بوّابة طلبات الإجازات (migration 0339)
 *
 *  لماذا خدمة جديدة بجانب `LeaveService`؟
 *  ─────────────────────────────────────────────────────────────
 *  `LeaveService` تغلّف جدول `leaves` بـCRUD خام (`BaseService`).
 *  هذه الخدمة تغلّف **دوال القاعدة** التي تفرض النزاهة. كل ما كانت
 *  `LeaveRequestPage` تفعله في المتصفح انتقل إلى القاعدة:
 *
 *   ★ `approveLeave(id, realEmployeeId)` — كانت تمرّر `employees.id`
 *     في عمود FK يشير إلى `profiles`. مُقاس بجلسة RLS حقيقية:
 *       insert or update on table "leaves" violates foreign key
 *       constraint "leaves_approved_by_fkey"
 *     ⇒ زرّ «موافقة» كان يفشل كلما كان للمُعتمِد سجلّ موظف.
 *     الآن القرار عبر `unifiedApprovalService.decideHrAny()` وحده.
 *
 *   ★ `canApprove = viewMode === 'hr' | 'supervisor' | 'manager'`
 *     مشتقّ من **مسار URL**. الآن `canDecide` يأتي من القاعدة:
 *     من له خطوة `active` في السلسلة، لا من فتح مساراً معيناً.
 *
 *   ★ حساب المدة والرصيد والتداخل: كلها في `submit_leave_request`
 *     ذرّياً. قبلها: طلب 30 يوماً على رصيد 5 كان يُقبل، وطلبان على
 *     نفس المدى حرفياً كانا يُقبلان.
 *
 *   ★ الحذف النهائي ممنوع ⇒ `cancel()` تكتب 'ملغى' وتحرّر الحجز
 *     وتُغلق السلسلة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

/** نطاق القراءة — يقابل `p_scope` في `leave_requests_view` */
export type LeaveScope = 'mine' | 'inbox' | 'all';

/** الحالات الأربع المسموح بها بعد قيد `leaves_status_check` (0339) */
export type LeaveStatusValue = 'انتظار' | 'موافق' | 'مرفوض' | 'ملغى';

export interface LeaveRequestRow {
  id: string;
  employeeId: string;
  /** يُحلّ في القاعدة من `employees` ثم `profiles` — لا وجود له في `leaves` */
  employeeName: string;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  workingDays: number;
  status: LeaveStatusValue;
  reason: string | null;
  createdAt: string;
  /** ★ من السلسلة لا من مسار URL */
  canDecide: boolean;
  canCancel: boolean;
}

export interface SubmitLeaveResult {
  leaveId: string;
  requestId: string | null;
  /** المدة كما حسبتها القاعدة (تستثني الجمعة وعطل المستأجر) */
  workingDays: number;
}

/**
 * رسائل الأخطاء المُعرَّفة في `submit_leave_request` / `cancel_leave_request`.
 * تُرجَع بصيغة `CODE: نصّ عربي` — نعرض النصّ ونستعمل الرمز للتفريع.
 */
const ERROR_LABELS: Record<string, string> = {
  LEAVE_NO_TENANT: 'لا سياق شركة لحسابك — راجع مدير النظام',
  LEAVE_NO_EMPLOYEE: 'لا يوجد سجلّ موظف مرتبط بحسابك — راجع الموارد البشرية',
  LEAVE_BAD_RANGE: 'مدى التواريخ غير صالح',
  LEAVE_TOO_OLD: 'لا يمكن طلب إجازة بدأت قبل أكثر من أسبوع',
  LEAVE_BAD_TYPE: 'نوع الإجازة غير معروف',
  LEAVE_NO_WORKDAYS: 'المدى المختار لا يحتوي أيام عمل فعلية',
  LEAVE_OVERLAP: 'لديك طلب إجازة يتداخل مع هذا المدى',
  LEAVE_INSUFFICIENT_BALANCE: 'رصيدك لا يكفي لهذه المدة',
  LEAVE_HAJJ_USED: 'إجازة الحج تُمنح مرّة واحدة في الخدمة',
  LEAVE_NOT_FOUND: 'الطلب غير موجود',
  LEAVE_NOT_OWNER: 'لا تملك هذا الطلب',
  LEAVE_NOT_CANCELLABLE: 'لا يمكن إلغاء طلب بهذه الحالة',
  PERMISSION_DAILY_CAP: 'تجاوزت الحدّ الأقصى لطلبات الزمنية في اليوم',
};

/** يستخرج رسالة عربية مفهومة من خطأ القاعدة */
export function leaveErrorMessage(raw: string): string {
  const code = Object.keys(ERROR_LABELS).find((k) => raw.includes(k));
  if (!code) return raw;
  // نصّ القاعدة يحمل تفاصيل (الرصيد المتبقّي، عدد الطلبات المتداخلة)
  const detail = raw.split(`${code}:`)[1]?.trim();
  return detail && detail.length > 0 ? detail : ERROR_LABELS[code];
}

interface RawLeaveRow {
  out_id: string;
  out_employee_id: string;
  out_employee_name: string | null;
  out_leave_type: string;
  out_date_from: string;
  out_date_to: string;
  out_working_days: number;
  out_status: string;
  out_reason: string | null;
  out_created_at: string;
  out_can_decide: boolean;
  out_can_cancel: boolean;
}

class LeaveRequestService {
  /**
   * قراءة الطلبات حسب النطاق.
   *
   * `mine`  — طلباتي أنا (يُشتقّ الموظف من الجلسة).
   * `inbox` — ما لي فيه **خطوة نشطة**: صندوق القرار الحقيقي.
   * `all`   — كل ما يسمح به RLS (الموارد البشرية ترى مستأجرها).
   */
  async list(
    scope: LeaveScope = 'mine',
    status?: LeaveStatusValue | null,
    limit = 100,
    offset = 0,
  ): Promise<LeaveRequestRow[]> {
    const { data, error } = await supabase.rpc('leave_requests_view', {
      p_scope: scope,
      p_status: status ?? null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      logger.error('leave_requests_view فشل: ' + error.message, {
        component: 'LeaveRequestService', action: 'list',
      });
      throw new Error(leaveErrorMessage(error.message));
    }
    return ((data ?? []) as RawLeaveRow[]).map((r) => ({
      id: r.out_id,
      employeeId: r.out_employee_id,
      employeeName: r.out_employee_name ?? '—',
      leaveType: r.out_leave_type,
      dateFrom: r.out_date_from,
      dateTo: r.out_date_to,
      workingDays: Number(r.out_working_days ?? 0),
      status: r.out_status as LeaveStatusValue,
      reason: r.out_reason,
      createdAt: r.out_created_at,
      canDecide: Boolean(r.out_can_decide),
      canCancel: Boolean(r.out_can_cancel),
    }));
  }

  /**
   * إنشاء طلب إجازة.
   *
   * ★ لا يستقبل `employee_id` عمداً — تشتقّه القاعدة من الجلسة.
   *   هذا ما يمنع تكرار عطل 0335 (تمرير `profiles.id` مكان `employees.id`).
   * ★ لا يستقبل `working_days_count` — تحسبه القاعدة.
   */
  async submit(input: {
    leaveType: string;
    dateFrom: string;
    dateTo: string;
    reason?: string;
    attachmentUrl?: string;
  }): Promise<SubmitLeaveResult> {
    const { data, error } = await supabase.rpc('submit_leave_request', {
      p_leave_type: input.leaveType,
      p_date_from: input.dateFrom,
      p_date_to: input.dateTo,
      p_reason: input.reason ?? null,
      p_attachment_url: input.attachmentUrl ?? null,
    });
    if (error) {
      logger.error('submit_leave_request فشل: ' + error.message, {
        component: 'LeaveRequestService', action: 'submit',
      });
      throw new Error(leaveErrorMessage(error.message));
    }
    type Raw = {
      out_leave_id: string;
      out_request_id: string | null;
      out_working_days: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw new Error('لم تُعِد القاعدة نتيجة للطلب');
    return {
      leaveId: rows[0].out_leave_id,
      requestId: rows[0].out_request_id,
      workingDays: Number(rows[0].out_working_days ?? 0),
    };
  }

  /**
   * إلغاء طلب — بديل الحذف النهائي.
   * الطلب يبقى بحالة 'ملغى' للتدقيق، والحجز يُحرَّر، والسلسلة تُغلق.
   */
  async cancel(leaveId: string, reason?: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('cancel_leave_request', {
      p_leave_id: leaveId,
      p_reason: reason ?? null,
    });
    if (error) {
      logger.error('cancel_leave_request فشل: ' + error.message, {
        component: 'LeaveRequestService', action: 'cancel',
      });
      throw new Error(leaveErrorMessage(error.message));
    }
    return Boolean(data);
  }

  /**
   * أيام العمل الفعلية لمدى — للمعاينة الحيّة في النموذج.
   *
   * ★ نستدعي القاعدة بدل `calculateWorkingDays` في المتصفح لأن الأخيرة
   *   تستثني الجمعة فقط ولا تعرف `holidays` إطلاقاً (المُعامل الثالث
   *   لم يكن يُمرَّر). العدد المعروض كان يخالف المخزَّن.
   */
  async workingDays(dateFrom: string, dateTo: string): Promise<number> {
    const { data, error } = await supabase.rpc('leave_preview_working_days', {
      p_from: dateFrom,
      p_to: dateTo,
    });
    if (error) {
      logger.error('leave_preview_working_days فشل: ' + error.message, {
        component: 'LeaveRequestService', action: 'workingDays',
      });
      return 0;
    }
    return Number(data ?? 0);
  }
  /**
   * ★★★★ هل يحقّ للمستخدم الحاليّ هذا النطاق؟ (0372)
   *   بلاغ المستخدم: التبويبات الثلاثة كانت تُعرض للجميع فأوهمت
   *   الموظفَ أنّه يطالع سجلّ الشركة. الحارسُ في القاعدة
   *   (`can_use_request_scope`) وهذه تسأله قبل رسم أيّ تبويب.
   *   ★ عند أيّ خطأ نُعيد `false` — الأصلُ المنعُ لا السماح.
   */
  async canUseScope(scope: LeaveScope): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_use_request_scope', {
      p_scope: scope,
      p_request_type: 'leave',
    });
    if (error) {
      logger.error('can_use_request_scope فشل: ' + error.message, {
        component: 'LeaveRequestService', action: 'canUseScope',
      });
      return false;
    }
    return data === true;
  }
}

export const leaveRequestService = new LeaveRequestService();
