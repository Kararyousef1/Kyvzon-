/**
 * ════════════════════════════════════════════════════════════════════════
 *  FinancialRequestService — سلسلة اعتماد الطلبات المالية للموظف
 *
 *  ═══ الفجوة التي تسدّها (كلها مُقاسة على Postgres حقيقي) ═════════════
 *
 *  ① ★ رفض المصروف **يفشل دائماً**.
 *     `hr/ExpensesPage.tsx:52` يستدعي `rejectRequest(expense.id, reason)`
 *     والتوقيع `rejectExpense(id, approvedBy)` يكتب الوسيط في
 *     `approved_by` — وهو عمود **UUID**.
 *        invalid input syntax for type uuid: "المبلغ مرتفع"
 *     الرفض لم ينجح مرة واحدة منذ كُتب.
 *
 *  ② ★ اعتماد السلفة **يفشل دائماً**.
 *     `hr/LoansPage.tsx:77` يستدعي `approveLoan(loan.id, '')` — سلسلة
 *     فارغة في عمود UUID.
 *        invalid input syntax for type uuid: ""
 *     الواجهة تُظهر «تمت الموافقة على السلفة» ثم تُعيد التحميل فتجد
 *     الحالة `pending`. رسالة نجاح كاذبة.
 *
 *  ③ ★ عمود غير موجود: الخدمة القديمة تكتب `reviewed_at` والعمود
 *     الحقيقي `approved_at`.
 *        column "reviewed_at" of relation "expense_requests" does not exist
 *
 *  ④ ★ تعارض مفردات: `expense_requests` يُكتب بالعربية
 *     (`'موافق'`) و`employee_loans` بالإنجليزية (`'approved'`)،
 *     بينما `normalizeStatus` في الواجهة تتوقّع الإنجليزية.
 *     وحّدها migration 0325 على الإنجليزية بقيد CHECK.
 *
 *  ⑤ ★ لا سلسلة اعتماد إطلاقاً: موظف الموارد البشرية يعتمد أي مبلغ
 *     منفرداً — لا مشرف ولا مدير ولا حدّ مالي.
 *
 *  ★ المبدأ: القرار يمرّ بمحرّك الموافقات (`unified_approval_decide`)
 *    لا بكتابة مباشرة. حارس القاعدة (0324/0325) يرفض الكتابة المباشرة
 *    ما دامت هناك سلسلة مفتوحة.
 * ════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export type FinancialRequestType = 'expense' | 'loan';
export type ApprovalDecision = 'approved' | 'rejected';
/** نتيجة القرار: `pending` تعني بقاء مستويات أعلى في السلسلة */
export type DecisionOutcome = 'pending' | 'approved' | 'rejected';

export interface FinancialApprovalStep {
  stepOrder: number;
  approverRole: string;
  approverId: string | null;
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'skipped';
  comments: string | null;
  decidedAt: string | null;
}

class FinancialRequestService {
  /**
   * ينشئ سلسلة اعتماد لطلب مالي. يُستدعى فور إنشاء المصروف/السلفة.
   *
   * السلسلة تُبنى من `approval_rules` لوحدة `finance` بحسب **المبلغ**
   * (`min_amount`/`max_amount`)، وإلا من سلسلة القسم كاحتياطي.
   *
   * ★ إن لم يوجد معتمِد إطلاقاً يبقى الطلب `pending` ولا يُعتمد تلقائياً:
   *   هذا مالٌ يُصرَف، والاعتماد الصامت أسوأ من الانتظار.
   *
   * @returns معرّف طلب الاعتماد، أو null عند الفشل
   */
  async createApproval(
    requestType: FinancialRequestType,
    relatedId: string,
    employeeId: string,
    amount: number,
  ): Promise<string | null> {
    const { data, error } = await supabase.rpc('create_financial_request_approval', {
      p_request_type: requestType,
      p_related_id: relatedId,
      p_employee_id: employeeId,
      p_amount: amount,
    });
    if (error) {
      console.error('createApproval فشل:', error.message);
      return null;
    }
    return data as string;
  }

  /**
   * قرار على الخطوة النشطة — يُحرّك السلسلة للمستوى التالي.
   *
   * @returns `'pending'` إن بقيت مستويات · `'approved'`/`'rejected'` عند الاكتمال
   * @throws رسالة القاعدة كما هي (مثل `NOT_YOUR_STEP`) — لا ابتلاع صامت
   */
  async decide(
    approvalRequestId: string,
    decision: ApprovalDecision,
    comments?: string,
  ): Promise<DecisionOutcome> {
    const { data, error } = await supabase.rpc('unified_approval_decide', {
      p_source_module: 'employee_finance',
      p_source_id: approvalRequestId,
      p_decision: decision,
      p_comments: comments ?? null,
    });
    if (error) throw new Error(error.message);

    // ★ سبب الرفض يُكتب في rejection_reason — لا في approved_by (عطل ①)
    if (decision === 'rejected' && comments && comments.trim() !== '') {
      const { error: reasonErr } = await supabase.rpc(
        'record_financial_rejection_reason',
        { p_request_id: approvalRequestId, p_reason: comments },
      );
      // القرار نفسه نجح؛ فشل تسجيل السبب لا يُبطله لكنه لا يُبتلع صامتاً
      if (reasonErr) console.error('تعذّر تسجيل سبب الرفض:', reasonErr.message);
    }

    return data as DecisionOutcome;
  }

  /** خطوات سلسلة طلب مالي — للعرض في مسار الاعتماد */
  async findSteps(approvalRequestId: string): Promise<FinancialApprovalStep[]> {
    const { data, error } = await supabase.rpc('approval_steps_for', {
      p_source_module: 'employee_finance',
      p_source_id: approvalRequestId,
    });
    if (error) {
      console.error('findSteps فشل:', error.message);
      return [];
    }
    type RawStep = {
      out_step_order: number;
      out_required_role: string;
      out_approver_id: string | null;
      out_status: FinancialApprovalStep['status'];
      out_comments: string | null;
      out_decided_at: string | null;
    };
    return ((data ?? []) as RawStep[]).map((s) => ({
      stepOrder: s.out_step_order,
      approverRole: s.out_required_role,
      approverId: s.out_approver_id,
      status: s.out_status,
      comments: s.out_comments,
      decidedAt: s.out_decided_at,
    }));
  }
}

export const financialRequestService = new FinancialRequestService();
export default financialRequestService;
