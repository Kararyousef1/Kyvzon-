/**
 * ════════════════════════════════════════════════════════════════
 *  FinanceService - خدمة المجال المالي (Expenses, Loans, Bonuses)
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { ExpenseRequestRecord, EmployeeLoanRecord, BonusRecord } from '../../shared/types/sdk';

class ExpenseRequestService extends BaseService<ExpenseRequestRecord> {
  constructor() { super('expense_requests'); }

  async findByEmployee(employeeId: string): Promise<ExpenseRequestRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'created_at', ascending: false });
  }

  async createExpense(data: Partial<ExpenseRequestRecord>): Promise<ExpenseRequestRecord> {
    return this.create(data);
  }

  /** @deprecated استخدم createExpense */
  async createRequest(data: Partial<ExpenseRequestRecord>): Promise<ExpenseRequestRecord> {
    return this.create(data);
  }

  /**
   * اعتماد إداري مباشر — **يتجاوز سلسلة الاعتماد**.
   *
   * ⚠️ المسار الطبيعي: `financialRequestService.decide()` الذي يُحرّك
   *    السلسلة ويُزامن الجدول في القاعدة. حارس 0324/0325 يرفض هذه
   *    الدالة ما دامت هناك سلسلة مفتوحة (`APPROVAL_CHAIN_BYPASS`).
   *    تبقى هنا لتصحيح سجل قديم بلا سلسلة.
   *
   * ★ أُصلح في 0325: كانت تكتب `status: 'موافق'` (عربي لا تقرؤه فلاتر
   *   الواجهة) و`reviewed_at` (عمود غير موجود — العمود `approved_at`).
   */
  async approveExpense(id: string, approvedBy: string): Promise<ExpenseRequestRecord> {
    return this.update(id, {
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    } as unknown as Partial<ExpenseRequestRecord>);
  }

  /**
   * رفض إداري مباشر مع سبب.
   *
   * ★ أُصلح في 0325: التوقيع السابق `rejectExpense(id, approvedBy)`
   *   كانت الصفحة تمرّر له **سبب الرفض النصّي**، فيُكتب في عمود
   *   `approved_by UUID` ويفشل الرفض دائماً:
   *      invalid input syntax for type uuid: "المبلغ مرتفع"
   *   الآن السبب يذهب لعمود `rejection_reason` الصحيح.
   */
  async rejectExpense(id: string, reason: string, rejectedBy?: string): Promise<ExpenseRequestRecord> {
    return this.update(id, {
      status: 'rejected',
      rejection_reason: reason,
      ...(rejectedBy ? { approved_by: rejectedBy } : {}),
    } as unknown as Partial<ExpenseRequestRecord>);
  }

  /** @deprecated استخدم approveExpense */
  async approveRequest(id: string, approvedBy: string): Promise<ExpenseRequestRecord> {
    return this.approveExpense(id, approvedBy);
  }

  /** @deprecated استخدم rejectExpense — لاحظ أن الوسيط الثاني هو **السبب** */
  async rejectRequest(id: string, reason: string, rejectedBy?: string): Promise<ExpenseRequestRecord> {
    return this.rejectExpense(id, reason, rejectedBy);
  }
}

class EmployeeLoanService extends BaseService<EmployeeLoanRecord> {
  constructor() { super('employee_loans'); }

  async findByEmployee(employeeId: string): Promise<EmployeeLoanRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'created_at', ascending: false });
  }

  async createLoan(data: Partial<EmployeeLoanRecord>): Promise<EmployeeLoanRecord> {
    const amount = Number((data as any).amount ?? data.loan_amount ?? 0);
    const months = Number((data as any).months_count ?? data.total_installments ?? 1) || 1;
    const installment = Number((data as any).monthly_installment ?? data.installment_amount ?? (amount / months));

    // توحيد عقد الخدمة مع جدول employee_loans الحالي: amount/months_count/monthly_installment.
    // نقبل كذلك أسماء الحقول القديمة loan_amount/total_installments/installment_amount للتوافق العكسي.
    return this.create({
      employee_id: data.employee_id,
      amount,
      remaining_amount: (data as any).remaining_amount ?? amount,
      monthly_installment: installment,
      months_count: months,
      months_paid: (data as any).months_paid ?? 0,
      start_date: (data as any).start_date ?? new Date().toISOString().slice(0, 10),
      end_date: (data as any).end_date,
      purpose: data.purpose,
      status: data.status ?? 'pending',
      approved_by: data.approved_by,
      rejection_reason: (data as any).rejection_reason,
    } as unknown as Partial<EmployeeLoanRecord>);
  }

  /**
   * اعتماد إداري مباشر للسلفة — يتجاوز السلسلة (انظر approveExpense).
   *
   * ★ أُصلح في 0325: الصفحة كانت تستدعي `approveLoan(loan.id, '')`
   *   فتُكتب سلسلة فارغة في عمود `approved_by UUID`:
   *      invalid input syntax for type uuid: ""
   *   الاعتماد كان يفشل دائماً بينما تُظهر الواجهة رسالة نجاح.
   *   الآن `approvedBy` اختياري: نمرّره فقط إن كان معرّفاً حقيقياً.
   *
   *   كذلك تُحسب `end_date` و`remaining_amount` — كانت الصفحة تحسب
   *   `end` ثم تُهمله، و`remaining_amount` يبقى 0 رغم المبلغ.
   */
  async approveLoan(
    id: string,
    approvedBy?: string,
    opts?: { startDate?: string; monthsCount?: number; amount?: number },
  ): Promise<EmployeeLoanRecord> {
    const patch: Record<string, unknown> = { status: 'approved' };
    if (approvedBy && approvedBy.trim() !== '') patch.approved_by = approvedBy;

    if (opts?.startDate && opts.monthsCount) {
      const end = new Date(opts.startDate);
      end.setMonth(end.getMonth() + opts.monthsCount);
      patch.end_date = end.toISOString().slice(0, 10);
    }
    if (typeof opts?.amount === 'number') patch.remaining_amount = opts.amount;

    return this.update(id, patch as unknown as Partial<EmployeeLoanRecord>);
  }

  /** رفض السلفة مع سبب */
  async rejectLoan(id: string, reason: string): Promise<EmployeeLoanRecord> {
    return this.update(id, {
      status: 'rejected',
      rejection_reason: reason,
    } as unknown as Partial<EmployeeLoanRecord>);
  }

  /**
   * إجمالي السلف القائمة.
   *
   * ★ أُصلح في 0325: كان يفلتر `status: 'موافق'` (عربي) بينما
   *   `employee_loans` يُخزّن `'approved'` — فيعيد **صفراً دائماً**.
   *   ويجمع `loan_amount` وهو عمود غير موجود؛ العمود `remaining_amount`
   *   وهو المطلوب فعلاً للسلف القائمة.
   */
  async getTotalOutstanding(): Promise<number> {
    const loans = await this.findAll({ filters: { status: 'approved' } });
    return loans.reduce(
      (sum, l) => sum + Number((l as unknown as { remaining_amount?: number }).remaining_amount ?? 0),
      0,
    );
  }
}

class BonusService extends BaseService<BonusRecord> {
  constructor() { super('bonuses'); }

  async findByEmployee(employeeId: string): Promise<BonusRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'bonus_date', ascending: false });
  }

  async createBonus(data: Partial<BonusRecord>): Promise<BonusRecord> {
    return this.create(data);
  }

  /** @deprecated استخدم createBonus مع status */
  async approveBonus(id: string, approvedBy: string): Promise<BonusRecord> {
    return this.update(id, { status: 'موافق', approved_by: approvedBy } as unknown as Partial<BonusRecord>);
  }

  /** @deprecated استخدم update */
  async cancelBonus(id: string): Promise<BonusRecord> {
    return this.update(id, { status: 'ملغي' } as unknown as Partial<BonusRecord>);
  }

  /** @deprecated استخدم createBonus أو findByEmployee */
  async findAllBonuses(): Promise<BonusRecord[]> {
    return this.findAll({ orderBy: 'bonus_date', ascending: false });
  }

  async getTotalBonusesThisMonth(): Promise<number> {
    const all = await this.findAll();
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    return all
      .filter(b => new Date(b.bonus_date).getMonth() === thisMonth && new Date(b.bonus_date).getFullYear() === thisYear)
      .reduce((sum, b) => sum + (b.bonus_amount || 0), 0);
  }
}

export const expenseRequestService = new ExpenseRequestService();
export const employeeLoanService = new EmployeeLoanService();
export const bonusService = new BonusService();
