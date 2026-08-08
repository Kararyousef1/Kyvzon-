/**
 * ════════════════════════════════════════════════════════════════
 *  ExpenseLifecycleService — دورة حياة النفقات (migration 0363)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0363.sql):
 *
 *  ① ★★★ **طلب اعتمادٍ مجمَّدٌ إلى الأبد — والحارس صامت.**
 *     مستأجرٌ بلا `approval_rules` وموظفٌ بلا قسم ⇒
 *     `create_financial_request_approval` تُنشئ `hr_approval_requests`
 *     بحالة `pending` و**صفر خطوة** (لا من القواعد ولا من المسار
 *     الاحتياطيّ `resolve_department_chain`).
 *     PROBE_1ب: خطوات = 0 · صندوق الموافقات = 0 عنصر
 *     ثم `tg_guard_request_status_bypass` يعدّ **الخطوات**:
 *        IF v_open = 0 THEN RETURN NEW;   ← الثقب
 *     ⇒ الطلب لا يُعتمد من أيّ صندوق، ولا يحرسه شيء من الكتابة الخام.
 *     ★ العلاج **كشفٌ لا منع**: `expense_chain_state.out_is_stalled`
 *       + عدّاد في الملخّص + راية في اللوح.
 *
 *  ② `tenant_id` يقبل NULL (PROBE_3) ⇒ نفقةٌ لا يراها أحد.
 *  ③/④ ★★★ **`employee_id` بلا FK** — معدومٌ (PROBE_4) أو من
 *     **مستأجرٍ آخر** (PROBE_5) ⇒ قُبِلا.
 *  ⑤ `amount` يقبل صفراً وسالباً (PROBE_6: صفّان).
 *  ⑥ `expense_date` بعد **400 يوم** ⇒ قُبِل (PROBE_7).
 *  ⑦ `category` نصٌّ حرّ (PROBE_8) — والصفحة لا تعرضه ولا تضبطه.
 *  ⑧ ★★★ **رفضٌ بلا سبب مسموح في القاعدة** (PROBE_9).
 *  ⑨ ★★★ **`approved_at`/`approved_by` لا يُملآن** (PROBE_10) ⇒
 *     معتمَدةٌ بلا معتمِد: لا يُعرف مَن وافق على صرف المال ولا متى.
 *  ⑩ ★★★ **`paid_at` عمودٌ ميت** — PROBE_11: صفر مدفوعة، والصفحة
 *     **بلا زرّ دفع**. «مدفوع» فلترٌ لا يمتلئ أبداً.
 *  ⑪ `cancelled` مفردةٌ بلا زرّ — وشريط الترشيح خمسة بلا `cancelled`.
 *  ⑫ ★★★ **الحذف النهائيّ مسموح** (PROBE_13) ولا محفّز يمنع.
 *  ⑬ `receipt_url` بلا رفع ولا عرض (PROBE_14: سبع نفقات بلا إيصال).
 *  ⑭ جلب كل الموظفين و`Map` يدويّ و`orderBy:'full_name_ar'` على عمودٍ
 *     NULL لكل موظف (PROBE_15).
 *  ⑮ `findAll` بلا حدّ أعلى (PROBE_16) · ⑯ صفر دالة (PROBE_17).
 *  ⑰ ★★★ **الموظف لا يستطيع إنشاء نفقته** — PROBE_18: سياسة INSERT
 *     تشترط `current_user_is_staff()`. والصفحة **بلا زرّ إنشاء**:
 *     لوحةُ مراجعةٍ لطلباتٍ لا سبيل لتقديمها.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** ★ حالات النفقة الخمس — مطابِقة لـ`expense_requests_status_chk` */
export const EXPENSE_STATES = [
  'pending', 'approved', 'paid', 'rejected', 'cancelled',
] as const;
export type ExpenseState = (typeof EXPENSE_STATES)[number];

/** ★ الفئات السبع — مطابِقة لـ`expense_requests_category_chk` */
export const EXPENSE_CATEGORIES = [
  'general', 'travel', 'meals', 'supplies',
  'training', 'medical', 'transport',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATE_AR: Record<ExpenseState, string> = {
  pending:   'بانتظار الموافقة',
  approved:  'موافق عليه',
  paid:      'مدفوع',
  rejected:  'مرفوض',
  cancelled: 'ملغى',
};

export const EXPENSE_STATE_TONE: Record<ExpenseState, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid:      'bg-indigo-50 text-indigo-700 border-indigo-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

/** ★ العطل ⑦: الفئة عمودٌ `NOT NULL` بلا واجهة — هذه ترجمتها */
export const EXPENSE_CATEGORY_AR: Record<ExpenseCategory, string> = {
  general:   'عام',
  travel:    'سفر وانتقال',
  meals:     'وجبات وضيافة',
  supplies:  'قرطاسية ولوازم',
  training:  'تدريب',
  medical:   'علاج',
  transport: 'نقل',
};

/** ★★ القرارات الثلاثة التي تمرّ من `expense_decide` */
export const EXPENSE_DECISIONS = ['approved', 'rejected', 'cancelled'] as const;
export type ExpenseDecision = (typeof EXPENSE_DECISIONS)[number];

export const expenseStateLabel = (s: string): string =>
  EXPENSE_STATE_AR[s as ExpenseState] ?? s;
export const expenseStateTone = (s: string): string =>
  EXPENSE_STATE_TONE[s as ExpenseState]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';
export const expenseCategoryLabel = (c: string): string =>
  EXPENSE_CATEGORY_AR[c as ExpenseCategory] ?? c;

export interface ExpenseRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  title: string;
  description: string;
  amount: number;
  category: ExpenseCategory | string;
  expenseDate: string | null;
  /** عمر النفقة بالأيام منذ تاريخها (بتوقيت بغداد) */
  ageDays: number;
  receiptUrl: string | null;
  status: ExpenseState | string;
  approverName: string;
  approvedAt: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  /** ★★★ العطل ①: طلبٌ معلَّق بصفر خطوة — مجمَّدٌ إلى الأبد */
  isStalled: boolean;
  openSteps: number;
  createdAt: string | null;
}

export interface ExpenseSummary {
  total: number;
  pending: number;
  amtPending: number;
  approved: number;
  amtApproved: number;
  paid: number;
  amtPaid: number;
  rejected: number;
  cancelled: number;
  /** ★★★ الطلبات المجمَّدة — الرقم الذي يكشف العطل ① */
  stalled: number;
  awaitingPay: number;
  noReceipt: number;
}

export interface ChainState {
  hasRequest: boolean;
  openSteps: number;
  totalSteps: number;
  isStalled: boolean;
}

export interface ExpenseInput {
  title: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  expenseDate?: string | null;
  receiptUrl?: string | null;
  /** يُترك فارغاً ⇒ النفقة لمُقدّمها. staff وحده يُقدّم نيابةً */
  employeeId?: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر» و«غير مُقاس» (درس 0353) */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

class ExpenseLifecycleSdk {
  /** ملخّص النفقات — محسوب في القاعدة (staff فقط) */
  async summary(): Promise<ExpenseSummary> {
    const { data, error } = await supabase.rpc('expense_summary');
    if (error) {
      logger.error('expense_summary فشل: ' + error.message, {
        component: 'ExpenseLifecycleSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:       num(r.out_total),
      pending:     num(r.out_pending),
      amtPending:  num(r.out_amt_pending),
      approved:    num(r.out_approved),
      amtApproved: num(r.out_amt_approved),
      paid:        num(r.out_paid),
      amtPaid:     num(r.out_amt_paid),
      rejected:    num(r.out_rejected),
      cancelled:   num(r.out_cancelled),
      stalled:     num(r.out_stalled),
      awaitingPay: num(r.out_awaiting_pay),
      noReceipt:   num(r.out_no_receipt),
    };
  }

  /**
   * لوح النفقات — استعلامٌ واحد.
   *
   * ★ العطل ⑭: النسخة السابقة جلبت **كل** الموظفين وبنت `Map` يدوياً.
   * ★ العطل ⑰: الموظف يرى نفقاته هو — و staff يرى الجميع.
   * ★★★ العطل ①: `isStalled` يكشف الطلب المجمَّد.
   */
  async board(
    status?: ExpenseState | null,
    category?: ExpenseCategory | null,
    limit = 200,
  ): Promise<ExpenseRow[]> {
    const { data, error } = await supabase.rpc('expense_board', {
      p_status:   status ?? null,
      p_category: category ?? null,
      p_limit:    limit,
    });
    if (error) {
      logger.error('expense_board فشل: ' + error.message, {
        component: 'ExpenseLifecycleSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:              str(r.out_id),
      employeeId:      str(r.out_employee_id),
      employeeName:    str(r.out_employee_name),
      employeeCode:    str(r.out_employee_code),
      department:      str(r.out_department),
      title:           str(r.out_title),
      description:     str(r.out_description),
      amount:          num(r.out_amount),
      category:        str(r.out_category),
      expenseDate:     strOrNull(r.out_expense_date),
      ageDays:         num(r.out_age_days),
      receiptUrl:      strOrNull(r.out_receipt_url),
      status:          str(r.out_status),
      approverName:    str(r.out_approver_name),
      approvedAt:      strOrNull(r.out_approved_at),
      paidAt:          strOrNull(r.out_paid_at),
      rejectionReason: strOrNull(r.out_rejection_reason),
      isStalled:       Boolean(r.out_is_stalled),
      openSteps:       num(r.out_open_steps),
      createdAt:       strOrNull(r.out_created_at),
    }));
  }

  /**
   * ★★★ العطل ①: حالة سلسلة الاعتماد.
   *
   *   `isStalled = true` تعني: طلب اعتمادٍ قائمٌ معلَّق **بصفر خطوة**
   *   — لا يظهر في أيّ صندوق موافقات ولا أحد يستطيع اعتماده.
   */
  async chainState(expenseId: string): Promise<ChainState> {
    const { data, error } = await supabase.rpc('expense_chain_state', {
      p_expense: expenseId,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      hasRequest: Boolean(r.out_has_request),
      openSteps:  num(r.out_open_steps),
      totalSteps: num(r.out_total_steps),
      isStalled:  Boolean(r.out_is_stalled),
    };
  }

  /**
   * تقديم نفقة.
   *
   * ★★★ العطل ⑰: سياسة `INSERT` تشترط `current_user_is_staff()` —
   *   والدالة `SECURITY DEFINER` تتجاوزها ليُقدّم الموظف نفقته بنفسه.
   *   وهو **لا يُقدّم باسم غيره**: `EXPENSE_NOT_AUTHORIZED`.
   */
  async submit(input: ExpenseInput): Promise<string> {
    const { data, error } = await supabase.rpc('expense_submit', {
      p_title:       input.title,
      p_description: input.description,
      p_amount:      input.amount,
      p_category:    input.category,
      p_date:        input.expenseDate ?? null,
      p_receipt:     input.receiptUrl ?? null,
      p_employee:    input.employeeId ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * قرار على نفقة معلَّقة.
   *
   * ★★★ العطل ⑨: `approved_by`/`approved_at` يُملآن في المحفّز.
   * ★★★ العطل ⑧: الرفض بلا سبب مرفوض — `EXPENSE_REJECTION_REASON_REQUIRED`.
   * ★★ وسلسلةٌ مفتوحة تمنع القرار المباشر — `EXPENSE_CHAIN_OPEN`.
   */
  async decide(
    id: string, decision: ExpenseDecision, reason?: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('expense_decide', {
      p_id: id, p_decision: decision, p_reason: reason ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ★★★ العطل ⑩: صرف النفقة المعتمَدة.
   *
   *   لم يكن في المنظومة أيُّ مسارٍ يكتب `paid_at` — «مدفوع» فلترٌ
   *   في الشريط لا يمتلئ أبداً. ولا صرفَ لغير المعتمَد
   *   (`EXPENSE_NOT_APPROVED`) ولا مرّتين.
   */
  async markPaid(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('expense_mark_paid', {
      p_id: id,
    });
    if (error) {
      logger.error('expense_mark_paid فشل: ' + error.message, {
        component: 'ExpenseLifecycleSdk', action: 'markPaid',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return str(data);
  }
}

export const expenseSdk = new ExpenseLifecycleSdk();
export default expenseSdk;
