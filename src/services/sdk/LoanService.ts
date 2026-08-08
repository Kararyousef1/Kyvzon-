/**
 * ════════════════════════════════════════════════════════════════
 *  LoanService — دورة حياة السلف والقروض (migration 0355)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسابر: tools/dev/_probe_0355*.sql):
 *
 *  ① **مفردتان مختلَقتان** — `LoansPage` تُرشِّح بـ`'active'` وتعدّ
 *     `'completed'`، والقيد `employee_loans_status_chk` يقبل خمساً
 *     فقط: pending · approved · rejected · paid · cancelled.
 *       PROBE_1A: INSERT status='active'    ⇒ violates check constraint
 *       PROBE_1B: INSERT status='completed' ⇒ violates check constraint
 *     ⇒ «المتبقي النشط» صفر أبداً · «مكتملة» صفر أبداً · شريط التقدّم
 *       (المشروط بـactive) لا يظهر لأيّ سلفة · زرّا الفلترة «ساري»
 *       و«مكتمل» يعرضان فراغاً دائماً. وبالمقابل `paid` و`cancelled`
 *       الحقيقيتان بلا تسمية ⇒ `LOAN_STATUS_LABELS[status]` = undefined.
 *
 *  ② ★★★ **لا شيء في المنظومة كلّها كان يُسدّد قسطاً.** مسحُ pg_proc:
 *       دوال تكتب months_paid → صفر
 *     PROBE_2: سلفة 1,200,000/12 شهراً بقسط 100,000. شُغّلت الرواتب
 *     لفبراير ومارس 2026 واعتُمدتا:
 *       فبراير | total_deductions = 100000.00
 *       مارس   | total_deductions = 100000.00
 *       القرض  | remaining_amount = 1200000.00 · months_paid = 0
 *     ⇒ **سلفة أبدية**: تُخصم كل شهر ولا تُسدَّد أبداً. و«المدفوع:
 *       0/12 شهر» بعد سنتين من الخصم.
 *
 *  ③ `setMonth` يتخطّى الشهر (مقيس بـnode):
 *       JS  31 يناير 2026 + 1 شهر → 2026-03-03
 *       PG  31 يناير 2026 + 1 شهر → 2026-02-28
 *
 *  ④ زرّ «موافقة» يرمي لكل سلفة أنشأها موظف:
 *       PROBE_7E ⇒ APPROVAL_CHAIN_BYPASS (خطوة واحدة مفتوحة)
 *
 *  ⑤ `handleCreate` لا يبني سلسلة اعتماد (صفر مطابقة لـcreateApproval)
 *     ⇒ سلفة HR بأيّ مبلغ تمرّ بلا اعتماد، وسلفة الموظف بسلسلة كاملة.
 *
 *  ⑥ `formData.start_date` يُهيّأ ولا يُمرَّر ⇒ كل سلفة تبدأ اليوم.
 *  ⑦ `amount / months_count` بلا حارس ⇒ `Infinity` (مقيس) ⇒ قسط 0.
 *  ⑧ `getTotalOutstanding` تجلب كل الصفوف للمتصفّح لتجمعها.
 *  ⑨ لا سجلّ تدقيق لأي تسديد.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/**
 * ★★★ مفردات الحالة الخمس — **مطابِقة نصّاً** لـ
 *     `employee_loans_status_chk` كما هي في القاعدة.
 *   لا `'active'` ولا `'completed'`: كلتاهما مُختلَقتان في الواجهة
 *   وترفضهما القاعدة (مُثبَت). «الساري» ليس حالةً بل **اشتقاق**:
 *   `approved` بمتبقٍّ موجب. و«المكتمل» اسمه في القاعدة `paid`.
 */
export const LOAN_STATUSES = [
  'pending', 'approved', 'rejected', 'paid', 'cancelled',
] as const;
export type LoanDbStatus = (typeof LOAN_STATUSES)[number];

export const LOAN_STATUS_AR: Record<LoanDbStatus, string> = {
  pending:   'بانتظار الاعتماد',
  approved:  'معتمَدة',
  rejected:  'مرفوضة',
  paid:      'مسدَّدة',
  cancelled: 'ملغاة',
};

export const LOAN_STATUS_TONE: Record<LoanDbStatus, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  paid:      'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
};

export type LoanDecision = 'approved' | 'rejected' | 'cancelled';
export type RepaymentSource = 'payroll' | 'manual' | 'settlement';

export interface LoanSummary {
  total: number;
  pending: number;
  /** approved بمتبقٍّ موجب — لا حالة `active` في القاعدة */
  active: number;
  paid: number;
  rejected: number;
  cancelled: number;
  outstanding: number;
  monthly: number;
  disbursed: number;
  repaid: number;
}

export interface LoanRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  amount: number;
  remaining: number;
  installment: number;
  monthsCount: number;
  monthsPaid: number;
  startDate: string | null;
  endDate: string | null;
  purpose: string;
  status: LoanDbStatus;
  rejectionReason: string | null;
  /** نسبة المسدَّد من المبلغ — صفر لغير المصروفة (approved/paid) */
  progress: number;
  /** خطوات اعتماد مفتوحة: > 0 ⇒ القرار عبر صندوق الموافقات */
  chainOpen: number;
  createdAt: string | null;
}

export interface RepaymentRow {
  id: string;
  no: number;
  amount: number;
  remainingAfter: number;
  periodName: string;
  source: RepaymentSource | string;
  createdAt: string | null;
}

export interface LoanCreateInput {
  employeeId: string;
  amount: number;
  months: number;
  purpose: string;
  /** YYYY-MM-DD — يُحترم فعلاً (كان يُهمَل: العطل ⑥) */
  startDate?: string | null;
  installment?: number | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

class LoanService {
  /**
   * بطاقات الصفحة — محسوبة في القاعدة.
   *
   * ★ العطل ⑧: النسخة السابقة كانت تجلب كل صفوف السلف إلى المتصفّح
   *   ثم تُرشِّح وتجمع في JS. مع آلاف السلف = نقل الجدول كلّه لأجل
   *   أربعة أرقام. وثلاثة من الأربعة كانت أصفاراً أبدية (العطل ①).
   */
  async summary(): Promise<LoanSummary> {
    const { data, error } = await supabase.rpc('loan_summary');
    if (error) {
      logger.error('loan_summary فشل: ' + error.message, {
        component: 'LoanService', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:       num(r.out_total),
      pending:     num(r.out_pending),
      active:      num(r.out_active),
      paid:        num(r.out_paid),
      rejected:    num(r.out_rejected),
      cancelled:   num(r.out_cancelled),
      outstanding: num(r.out_outstanding),
      monthly:     num(r.out_monthly),
      disbursed:   num(r.out_disbursed),
      repaid:      num(r.out_repaid),
    };
  }

  /**
   * لوحة السلف — الاسم والقسم وحالة السلسلة في استعلام واحد.
   *
   * ★ النسخة السابقة كانت تنفّذ استعلامين (كل السلف + كل الموظفين)
   *   وتبني `Map` في المتصفّح لتربطهما، بلا حدّ أعلى على أيّهما.
   *
   * ★★ `status` هنا مفردة قاعدة حقيقية. تمرير `'active'` يرمي
   *   `LOAN_BAD_STATUS` من القاعدة — وهو المقصود: خطأ صريح خيرٌ من
   *   قائمة فارغة صامتة كانت تُوهم المستخدم بعدم وجود سلف.
   */
  async board(status?: LoanDbStatus | null, limit = 200): Promise<LoanRow[]> {
    const { data, error } = await supabase.rpc('loan_board', {
      p_status: status ?? null,
      p_limit:  limit,
    });
    if (error) {
      logger.error('loan_board فشل: ' + error.message, {
        component: 'LoanService', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:              str(r.out_id),
      employeeId:      str(r.out_employee_id),
      employeeName:    str(r.out_employee_name),
      employeeCode:    str(r.out_employee_code),
      department:      str(r.out_department),
      amount:          num(r.out_amount),
      remaining:       num(r.out_remaining),
      installment:     num(r.out_installment),
      monthsCount:     num(r.out_months_count),
      monthsPaid:      num(r.out_months_paid),
      startDate:       strOrNull(r.out_start_date),
      endDate:         strOrNull(r.out_end_date),
      purpose:         str(r.out_purpose),
      status:          str(r.out_status) as LoanDbStatus,
      rejectionReason: strOrNull(r.out_rejection),
      progress:        num(r.out_progress),
      chainOpen:       num(r.out_chain_open),
      createdAt:       strOrNull(r.out_created_at),
    }));
  }

  /**
   * إنشاء سلفة.
   *
   * ★ القاعدة تتولّى: حارس المبلغ/الأشهر/القسط · تاريخ البداية
   *   الحقيقيّ · `end_date` بحساب تقويميّ · **وبناء سلسلة الاعتماد**
   *   (العطل ⑤: لم تكن الصفحة تبنيها إطلاقاً).
   *
   * ★ لا حساب قسط في المتصفّح: `amount / 0` = Infinity (مقيس) وكان
   *   يُرسَل فيصير 0 في القاعدة.
   */
  async create(input: LoanCreateInput): Promise<string> {
    const { data, error } = await supabase.rpc('loan_create', {
      p_employee_id: input.employeeId,
      p_amount:      input.amount,
      p_months:      input.months,
      p_purpose:     input.purpose,
      p_start_date:  input.startDate ?? null,
      p_installment: input.installment ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? '');
  }

  /**
   * بتّ في السلفة.
   *
   * ★★★ العطل ④: النسخة السابقة كانت `UPDATE` مباشراً عبر
   *   `employeeLoanService.approveLoan`، فيرمي محفّز
   *   `trg_guard_status_bypass` لكل سلفة لها سلسلة مفتوحة — أي لكل
   *   سلفة أنشأها موظف من بوابته. الآن `loan_decide` يفحص السلسلة
   *   ويُعيد رسالة `LOAN_CHAIN_OPEN` صريحة توجّه إلى صندوق الموافقات.
   */
  async decide(
    loanId: string,
    decision: LoanDecision,
    reason?: string | null,
  ): Promise<LoanDecision> {
    const { data, error } = await supabase.rpc('loan_decide', {
      p_loan_id:  loanId,
      p_decision: decision,
      p_reason:   reason ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? decision) as LoanDecision;
  }

  /**
   * تسديد يدويّ (تسوية خارج الرواتب).
   *
   * ★ التسديد التلقائيّ يقع داخل `payroll_approve` — لا من هنا.
   *   هذه للحالات الاستثنائية: سداد نقديّ أو تسوية نهاية خدمة.
   *
   * @returns المبلغ المُسدَّد فعلاً — قد يقلّ عن القسط إن كان
   *          المتبقّي أصغر (القصّ في القاعدة).
   */
  async repayManually(
    loanId: string,
    amount?: number | null,
    source: RepaymentSource = 'manual',
  ): Promise<number> {
    const { data, error } = await supabase.rpc('loan_apply_repayment', {
      p_loan_id:   loanId,
      p_period_id: null,
      p_amount:    amount ?? null,
      p_source:    source,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return num(data);
  }

  /**
   * سجلّ تسديدات سلفة واحدة (العطل ⑨).
   *
   * ★ الموظف يرى سجلّ سلفته هو، والطاقم يرى الجميع — محروس في
   *   القاعدة لا في الواجهة.
   */
  async repayments(loanId: string): Promise<RepaymentRow[]> {
    const { data, error } = await supabase.rpc('loan_repayment_history', {
      p_loan_id: loanId,
    });
    if (error) {
      logger.error('loan_repayment_history فشل: ' + error.message, {
        component: 'LoanService', action: 'repayments',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:             str(r.out_id),
      no:             num(r.out_no),
      amount:         num(r.out_amount),
      remainingAfter: num(r.out_remaining),
      periodName:     str(r.out_period_name),
      source:         str(r.out_source),
      createdAt:      strOrNull(r.out_created_at),
    }));
  }
}

export const loanService = new LoanService();
