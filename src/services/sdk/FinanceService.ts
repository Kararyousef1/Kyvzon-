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

  async approveExpense(id: string, approvedBy: string): Promise<ExpenseRequestRecord> {
    return this.update(id, { status: 'موافق', approved_by: approvedBy, reviewed_at: new Date().toISOString() } as unknown as Partial<ExpenseRequestRecord>);
  }

  async rejectExpense(id: string, approvedBy: string): Promise<ExpenseRequestRecord> {
    return this.update(id, { status: 'مرفوض', approved_by: approvedBy, reviewed_at: new Date().toISOString() } as unknown as Partial<ExpenseRequestRecord>);
  }

  /** @deprecated استخدم approveExpense */
  async approveRequest(id: string, approvedBy: string): Promise<ExpenseRequestRecord> {
    return this.approveExpense(id, approvedBy);
  }

  /** @deprecated استخدم rejectExpense */
  async rejectRequest(id: string, approvedBy: string): Promise<ExpenseRequestRecord> {
    return this.rejectExpense(id, approvedBy);
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

  async approveLoan(id: string, approvedBy: string): Promise<EmployeeLoanRecord> {
    return this.update(id, { status: 'approved', approved_by: approvedBy } as unknown as Partial<EmployeeLoanRecord>);
  }

  /** @deprecated استخدم approveLoan */
  async rejectLoan(id: string, reasonOrApprovedBy: string): Promise<EmployeeLoanRecord> {
    return this.update(id, { status: 'rejected', rejection_reason: reasonOrApprovedBy } as unknown as Partial<EmployeeLoanRecord>);
  }

  async getTotalOutstanding(): Promise<number> {
    const loans = await this.findAll({ filters: { status: 'موافق' } });
    return loans.reduce((sum, l) => sum + (l.loan_amount || 0), 0);
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
