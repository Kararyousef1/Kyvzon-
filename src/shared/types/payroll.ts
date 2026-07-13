/**
 * ════════════════════════════════════════════════════════════════
 *  أنواع بيانات نظام الرواتب - Kyvzon Platform
 * ════════════════════════════════════════════════════════════════
 */

// ═══════════════════ أنواع عامة ═══════════════════

export type PayrollStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';
export type PayrollFrequency = 'monthly' | 'semi_monthly' | 'weekly' | 'bi_weekly';

export type AllowanceType = 'housing' | 'transportation' | 'seniority' | 'danger' | 'food' | 'phone' | 'representation' | 'other';
export type DeductionType = 'social_security' | 'tax' | 'absence' | 'late' | 'permission_penalty' | 'loan' | 'advance' | 'other';
export type LoanStatus = 'pending' | 'approved' | 'active' | 'completed' | 'rejected';
export type BonusType = 'performance' | 'overtime' | 'annual' | 'spot' | 'referral' | 'other';

// ═══════════════════ واجهات الرواتب ═══════════════════

export interface PayrollPeriod {
  id: string;
  name: string;
  frequency: PayrollFrequency;
  start_date: string;
  end_date: string;
  payment_date: string;
  status: PayrollStatus;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollRecord {
  id: string;
  period_id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  department?: string;
  basic_salary: number;
  total_allowances: number;
  total_deductions: number;
  overtime_pay: number;
  bonus_amount: number;
  net_salary: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  overtime_hours: number;
  status: PayrollStatus;
  paid_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollAllowance {
  id: string;
  record_id: string;
  employee_id: string;
  allowance_type: AllowanceType;
  amount: number;
  is_percentage: boolean;
  percentage_of?: number;
  description?: string;
  created_at: string;
}

export interface PayrollDeduction {
  id: string;
  record_id: string;
  employee_id: string;
  deduction_type: DeductionType;
  amount: number;
  is_percentage: boolean;
  percentage_of?: number;
  description?: string;
  reference_id?: string;
  created_at: string;
}

// ═══════════════════ السلف والقروض ═══════════════════

export interface EmployeeLoan {
  id: string;
  employee_id: string;
  employee_name?: string;
  amount: number;
  remaining_amount: number;
  monthly_installment: number;
  months_count: number;
  months_paid: number;
  start_date: string;
  end_date?: string;
  purpose: string;
  status: LoanStatus;
  approved_by?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  employee_id: string;
  amount: number;
  payroll_period_id?: string;
  payment_date?: string;
  status: PayrollStatus;
  notes?: string;
  created_at: string;
}

// ═══════════════════ الجوائز ═══════════════════

export interface Bonus {
  id: string;
  employee_id: string;
  employee_name?: string;
  bonus_type: BonusType;
  amount: number;
  reason: string;
  period_start?: string;
  period_end?: string;
  approved_by?: string;
  status: PayrollStatus;
  created_at: string;
  updated_at: string;
}

// ═══════════════════ إعدادات الرواتب ═══════════════════

export interface PayrollSettings {
  id: number;
  default_currency: string;
  tax_rate: number;
  social_security_rate: number;
  overtime_rate: number;
  late_penalty_per_minute: number;
  absence_penalty_per_day: number;
  max_overtime_hours_per_month: number;
  max_loan_amount: number;
  max_loan_months: number;
  default_basic_salary: number;
  working_days_per_month: number;
  updated_at: string;
}

// ═══════════════════ دوال مساعدة ═══════════════════

export const ALLOWANCE_TYPE_LABELS: Record<AllowanceType, string> = {
  housing: 'بدل سكن',
  transportation: 'بدل نقل',
  seniority: 'بدل أقدمية',
  danger: 'بدل خطورة',
  food: 'بدل طعام',
  phone: 'بدل هاتف',
  representation: 'بدل تمثيل',
  other: 'بدل آخر',
};

export const DEDUCTION_TYPE_LABELS: Record<DeductionType, string> = {
  social_security: 'تأمينات اجتماعية',
  tax: 'ضريبة دخل',
  absence: 'خصم غياب',
  late: 'خصم تأخير',
  permission_penalty: 'خصم زمنية',
  loan: 'قسط سلفة',
  advance: 'سلفة',
  other: 'استقطاع آخر',
};

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'موافق عليه',
  active: 'ساري',
  completed: 'مكتمل',
  rejected: 'مرفوض',
};

export const BONUS_TYPE_LABELS: Record<BonusType, string> = {
  performance: 'مكافأة أداء',
  overtime: 'مكافأة وقت إضافي',
  annual: 'مكافأة سنوية',
  spot: 'مكافأة فورية',
  referral: 'مكافأة إحالة',
  other: 'مكافأة أخرى',
};

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الاعتماد',
  approved: 'معتمد',
  paid: 'مدفوع',
  cancelled: 'ملغى',
};

export const PAYROLL_FREQUENCY_LABELS: Record<PayrollFrequency, string> = {
  monthly: 'شهري',
  semi_monthly: 'نصف شهري',
  weekly: 'أسبوعي',
  bi_weekly: 'نصف شهري (بيأسبوعي)',
};
