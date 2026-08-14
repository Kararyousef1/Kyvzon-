/**
 * ════════════════════════════════════════════════════════════════
 *  PermissionRequestGatewayService — بوّابة طلبات الزمنيات (migration 0340)
 *
 *  لماذا خدمة جديدة بجانب `PermissionService`؟
 *  ─────────────────────────────────────────────────────────────
 *  `permissionRequestService` تغلّف جدول `permissions_request` بـCRUD خام.
 *  هذه الخدمة تغلّف **دوال القاعدة** التي تفرض النزاهة.
 *
 *   ★★★ `approveRequest(id, employeeId || user?.id)` كان يفشل في **كل**
 *     الحالات المشروعة. مُقاس بجلسة RLS حقيقية بدور hr:
 *       أ) سجلّ موظف + سلسلة  ⇒ APPROVAL_CHAIN_BYPASS
 *       ب) بلا سجلّ + سلسلة   ⇒ APPROVAL_CHAIN_BYPASS
 *       ج) بلا سلسلة          ⇒ نجح لكن بلا رقابة
 *     ولعزل الـFK عن الحارس (BEFORE trigger يسبق فحص FK):
 *       بلا سلسلة + approved_by = employees.id ⇒
 *       violates foreign key constraint "permissions_request_approved_by_fkey"
 *     الآن القرار عبر `unifiedApprovalService.decideHrAny()` وحده.
 *
 *   ★★★ `canApprove = viewMode === 'hr' | 'manager'` مشتقّ من مسار URL،
 *     وكلا المسارين (`/app/hr/…` و`/app/manager/…`) **غير مسجَّل** في
 *     AppRouter لهذه الصفحة. الآن `canDecide` من السلسلة.
 *
 *   ★★ اكتمال السلسلة كان يترك `approved_by` و`reviewed_at` فارغَين،
 *     وجدول `permissions` (التنفيذ) فارغاً دائماً. 0340 يملؤها.
 *
 *   ★ الاسم لم يعد نصّاً يُرسله المتصفح — يُحلّ من `profiles` الحيّ.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

/** نطاق القراءة — يقابل `p_scope` في `permission_requests_view` */
export type PermissionScope = 'mine' | 'inbox' | 'all';

/** الحالات الأربع بعد قيد 0339/0340 */
export type PermissionStatusValue = 'انتظار' | 'موافق' | 'مرفوض' | 'ملغى';

/** الأنواع الأربعة بعد قيد `permissions_request_type_check` (0340) */
export type PermissionKind = 'عادية' | 'مغادرة' | 'تعويضية' | 'بدون_راتب';

export interface PermissionRequestRow {
  id: string;
  employeeId: string;
  /** من `profiles` الحيّ — لا من العمود النصّي المخزَّن */
  employeeName: string;
  department: string;
  permissionType: PermissionKind;
  date: string;
  outTime: string;
  returnTime: string | null;
  status: PermissionStatusValue;
  reason: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** ★ من السلسلة لا من مسار URL */
  canDecide: boolean;
  canCancel: boolean;
  /** ★ هل نُقلت فعلاً إلى جدول `permissions` المنفَّذ؟ */
  executed: boolean;
  executionId: string | null;
  actualOut: string | null;
  actualReturn: string | null;
  executionNote: string | null;
  canRecordExecution: boolean;
}

export interface SubmitPermissionResult {
  permissionId: string;
  requestId: string | null;
}

const ERROR_LABELS: Record<string, string> = {
  PERM_NO_TENANT: 'لا سياق شركة لحسابك — راجع مدير النظام',
  PERM_NO_EMPLOYEE: 'لا يوجد سجلّ موظف مرتبط بحسابك — راجع الموارد البشرية',
  PERM_BAD_TYPE: 'نوع الزمنية غير معروف',
  PERM_BAD_INPUT: 'التاريخ ووقت الخروج مطلوبان',
  PERM_TOO_OLD: 'لا يمكن طلب زمنية لتاريخ مضى عليه أكثر من أسبوع',
  PERM_BAD_TIMES: 'وقت العودة يجب أن يكون بعد وقت الخروج',
  PERM_NOT_FOUND: 'الطلب غير موجود',
  PERM_NOT_OWNER: 'لا تملك هذا الطلب',
  PERM_NOT_CANCELLABLE: 'لا يمكن إلغاء طلب بهذه الحالة',
  PERMISSION_DAILY_CAP: 'تجاوزت الحدّ الأقصى لطلبات الزمنية في اليوم (3)',
  APPROVAL_CHAIN_BYPASS: 'للطلب سلسلة اعتماد مفتوحة — استعمل صندوق الموافقات',
};

/** يستخرج رسالة عربية مفهومة من خطأ القاعدة */
export function permissionErrorMessage(raw: string): string {
  const code = Object.keys(ERROR_LABELS).find((k) => raw.includes(k));
  if (!code) return raw;
  const detail = raw.split(`${code}:`)[1]?.trim();
  return detail && detail.length > 0 ? detail : ERROR_LABELS[code];
}

interface RawPermissionRow {
  out_id: string;
  out_employee_id: string;
  out_employee_name: string | null;
  out_department: string | null;
  out_permission_type: string;
  out_date: string;
  out_out_time: string;
  out_return_time: string | null;
  out_status: string;
  out_reason: string | null;
  out_rejection: string | null;
  out_reviewed_at: string | null;
  out_created_at: string;
  out_can_decide: boolean;
  out_can_cancel: boolean;
  out_executed: boolean;
  out_execution_id: string | null;
  out_actual_out: string | null;
  out_actual_return: string | null;
  out_execution_note: string | null;
  out_can_record_execution: boolean;
}

class PermissionRequestGatewayService {
  /**
   * قراءة الطلبات حسب النطاق.
   *
   * `mine`  — طلباتي (الموظف يُشتقّ من الجلسة).
   * `inbox` — ما لي فيه **خطوة نشطة**: صندوق القرار الحقيقي.
   * `all`   — كل ما يسمح به RLS.
   */
  async list(
    scope: PermissionScope = 'mine',
    status?: PermissionStatusValue | null,
    limit = 200,
    offset = 0,
  ): Promise<PermissionRequestRow[]> {
    const { data, error } = await supabase.rpc('permission_requests_view', {
      p_scope: scope,
      p_status: status ?? null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      logger.error('permission_requests_view فشل: ' + error.message, {
        component: 'PermissionRequestGatewayService', action: 'list',
      });
      throw new Error(permissionErrorMessage(error.message));
    }
    return ((data ?? []) as RawPermissionRow[]).map((r) => ({
      id: r.out_id,
      employeeId: r.out_employee_id,
      employeeName: r.out_employee_name ?? '—',
      department: r.out_department ?? '—',
      permissionType: r.out_permission_type as PermissionKind,
      date: r.out_date,
      outTime: r.out_out_time,
      returnTime: r.out_return_time,
      status: r.out_status as PermissionStatusValue,
      reason: r.out_reason,
      rejectionReason: r.out_rejection,
      reviewedAt: r.out_reviewed_at,
      createdAt: r.out_created_at,
      canDecide: Boolean(r.out_can_decide),
      canCancel: Boolean(r.out_can_cancel),
      executed: Boolean(r.out_executed),
      executionId: r.out_execution_id,
      actualOut: r.out_actual_out,
      actualReturn: r.out_actual_return,
      executionNote: r.out_execution_note,
      canRecordExecution: Boolean(r.out_can_record_execution),
    }));
  }

  /**
   * إنشاء طلب زمنية.
   *
   * ★ لا يستقبل `employee_id` ولا `employee_name` — تشتقّهما القاعدة
   *   من الجلسة. هذا يمنع تكرار عطل 0335 ويُبقي الاسم متّبعاً لمصدره.
   * ★ السلسلة تُنشأ في **نفس المعاملة** — لا طلب بلا رقابة.
   */
  async submit(input: {
    permissionType: PermissionKind;
    date: string;
    outTime: string;
    returnTime?: string | null;
    reason?: string;
  }): Promise<SubmitPermissionResult> {
    const { data, error } = await supabase.rpc('submit_permission_request', {
      p_permission_type: input.permissionType,
      p_date: input.date,
      p_out_time: input.outTime,
      // 'مغادرة' = خروج بلا رجوع — القاعدة تُهمله على أي حال
      p_return_time: input.permissionType === 'مغادرة'
        ? null : (input.returnTime || null),
      p_reason: input.reason ?? null,
    });
    if (error) {
      logger.error('submit_permission_request فشل: ' + error.message, {
        component: 'PermissionRequestGatewayService', action: 'submit',
      });
      throw new Error(permissionErrorMessage(error.message));
    }
    type Raw = { out_permission_id: string; out_request_id: string | null };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw new Error('لم تُعِد القاعدة نتيجة للطلب');
    return {
      permissionId: rows[0].out_permission_id,
      requestId: rows[0].out_request_id,
    };
  }

  /**
   * إلغاء طلب — بديل الحذف النهائي.
   * الطلب يبقى بحالة 'ملغى'، والسلسلة تُغلق، والتنفيذ (إن وُجد) يُلغى.
   */
  async cancel(permissionId: string, reason?: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('cancel_permission_request', {
      p_permission_id: permissionId,
      p_reason: reason ?? null,
    });
    if (error) {
      logger.error('cancel_permission_request فشل: ' + error.message, {
        component: 'PermissionRequestGatewayService', action: 'cancel',
      });
      throw new Error(permissionErrorMessage(error.message));
    }
    return Boolean(data);
  }
  /** تسجيل الخروج/العودة الفعليين للزمنية المعتمدة (0378). */
  async recordExecution(input: {
    requestId: string;
    actualOut: string;
    actualReturn?: string | null;
    note?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('permission_execution_record', {
      p_request_id: input.requestId,
      p_actual_out: input.actualOut,
      p_actual_return: input.actualReturn ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw new Error(permissionErrorMessage(error.message));
    return String(data ?? '');
  }

  /**
   * ★★★★ هل يحقّ للمستخدم الحاليّ هذا النطاق؟ (0372)
   *   بلاغ المستخدم: التبويبات الثلاثة كانت تُعرض للجميع فأوهمت
   *   الموظفَ أنّه يطالع سجلّ الشركة. الحارسُ في القاعدة
   *   (`can_use_request_scope`) وهذه تسأله قبل رسم أيّ تبويب.
   *   ★ عند أيّ خطأ نُعيد `false` — الأصلُ المنعُ لا السماح.
   */
  async canUseScope(scope: PermissionScope): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_use_request_scope', {
      p_scope: scope,
      p_request_type: 'permission',
    });
    if (error) {
      logger.error('can_use_request_scope فشل: ' + error.message, {
        component: 'PermissionRequestGatewayService', action: 'canUseScope',
      });
      return false;
    }
    return data === true;
  }
}

export const permissionRequestGateway = new PermissionRequestGatewayService();
