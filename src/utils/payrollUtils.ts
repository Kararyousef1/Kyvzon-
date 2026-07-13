/**
 * ════════════════════════════════════════════════════════════════
 *  دوال حساب الرواتب - Kyvzon Platform
 * ════════════════════════════════════════════════════════════════
 */

import type {
  PayrollRecord, PayrollAllowance, PayrollDeduction,
  PayrollSettings,
} from '../shared/types/payroll';

// ═══════════════════ إعادة تصدير التسميات والأنواع ═══════════════════
export {
  ALLOWANCE_TYPE_LABELS,
  DEDUCTION_TYPE_LABELS,
  LOAN_STATUS_LABELS,
  BONUS_TYPE_LABELS,
  PAYROLL_STATUS_LABELS,
  PAYROLL_FREQUENCY_LABELS,
} from '../shared/types/payroll';

// ═══════════════════ حساب صافي الراتب ═══════════════════

export function calculateNetSalary(record: Partial<PayrollRecord>): number {
  const basic = record.basic_salary || 0;
  const allowances = record.total_allowances || 0;
  const deductions = record.total_deductions || 0;
  const overtime = record.overtime_pay || 0;
  const bonus = record.bonus_amount || 0;

  return basic + allowances - deductions + overtime + bonus;
}

// ═══════════════════ مجموع البدلات ═══════════════════

export function sumAllowances(allowances: PayrollAllowance[]): number {
  return allowances.reduce((sum, a) => sum + (a.amount || 0), 0);
}

// ═══════════════════ مجموع الاستقطاعات ═══════════════════

export function sumDeductions(deductions: PayrollDeduction[]): number {
  return deductions.reduce((sum, d) => sum + (d.amount || 0), 0);
}

// ═══════════════════ حساب الوقت الإضافي ═══════════════════

export function calculateOvertimePay(
  overtimeHours: number,
  hourlyRate: number,
  overtimeMultiplier: number = 1.5
): number {
  return overtimeHours * hourlyRate * overtimeMultiplier;
}

// حساب معدل الساعة من الراتب الأساسي
export function calculateHourlyRate(
  basicSalary: number,
  workingDaysPerMonth: number = 26,
  hoursPerDay: number = 8
): number {
  if (workingDaysPerMonth <= 0 || hoursPerDay <= 0) return 0;
  return basicSalary / (workingDaysPerMonth * hoursPerDay);
}

// ═══════════════════ خصم الغياب ═══════════════════

export function calculateAbsenceDeduction(
  absentDays: number,
  basicSalary: number,
  workingDaysPerMonth: number = 26
): number {
  if (workingDaysPerMonth <= 0) return 0;
  const dailyRate = basicSalary / workingDaysPerMonth;
  return absentDays * dailyRate;
}

// ═══════════════════ خصم التأخير ═══════════════════

export function calculateLateDeduction(
  lateMinutes: number,
  penaltyPerMinute: number
): number {
  return lateMinutes * penaltyPerMinute;
}

// ═══════════════════ حساب السلفة الشهرية ═══════════════════

export function calculateMonthlyInstallment(
  loanAmount: number,
  monthsCount: number
): number {
  if (monthsCount <= 0) return 0;
  return loanAmount / monthsCount;
}

// ═══════════════════ تنسيق العملة ═══════════════════

export function formatCurrency(amount: number, currency: string = 'IQD'): string {
  const formatted = new Intl.NumberFormat('ar-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);

  const currencySymbols: Record<string, string> = {
    IQD: 'د.ع',
    USD: '$',
    SAR: 'ر.س',
    AED: 'د.إ',
    EGP: 'ج.م',
  };

  return `${formatted} ${currencySymbols[currency] || currency}`;
}

// ═══════════════════ ألوان الحالات ═══════════════════

export const PAYROLL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#64748b22', text: '#64748b' },
  pending_approval: { bg: '#f59e0b22', text: '#f59e0b' },
  approved: { bg: '#6366f122', text: '#6366f1' },
  paid: { bg: '#10b98122', text: '#10b981' },
  cancelled: { bg: '#ef444422', text: '#ef4444' },
};

export const LOAN_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#f59e0b22', text: '#f59e0b' },
  approved: { bg: '#6366f122', text: '#6366f1' },
  active: { bg: '#10b98122', text: '#10b981' },
  completed: { bg: '#64748b22', text: '#64748b' },
  rejected: { bg: '#ef444422', text: '#ef4444' },
};

// ═══════════════════ حساب كامل لسجل الرواتب ═══════════════════

export interface PayrollCalculationInput {
  basicSalary: number;
  allowances: PayrollAllowance[];
  deductions: PayrollDeduction[];
  overtimeHours: number;
  overtimeMultiplier: number;
  absentDays: number;
  lateMinutes: number;
  workingDaysPerMonth: number;
  bonusAmount: number;
  settings: PayrollSettings;
}

export interface PayrollCalculationResult {
  totalAllowances: number;
  totalDeductions: number;
  overtimePay: number;
  netSalary: number;
  hourlyRate: number;
  dailyRate: number;
}

export function calculateFullPayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const totalAllowances = sumAllowances(input.allowances);

  // حساب معدلات الوقت
  const hourlyRate = calculateHourlyRate(
    input.basicSalary,
    input.workingDaysPerMonth
  );
  const dailyRate = input.basicSalary / Math.max(input.workingDaysPerMonth, 1);

  // حساب الوقت الإضافي
  const overtimePay = calculateOvertimePay(
    input.overtimeHours,
    hourlyRate,
    input.overtimeMultiplier
  );

  // حساب الاستقطاعات (موجودة + خصم الغياب + خصم التأخير)
  const baseDeductions = sumDeductions(input.deductions);
  const absenceDeduction = calculateAbsenceDeduction(
    input.absentDays,
    input.basicSalary,
    input.workingDaysPerMonth
  );
  const lateDeduction = calculateLateDeduction(
    input.lateMinutes,
    input.settings?.late_penalty_per_minute || 0
  );

  const totalDeductions = baseDeductions + absenceDeduction + lateDeduction;

  // حساب صافي الراتب
  const netSalary =
    input.basicSalary + totalAllowances + overtimePay + input.bonusAmount - totalDeductions;

  return {
    totalAllowances,
    totalDeductions,
    overtimePay,
    netSalary: Math.max(0, netSalary),
    hourlyRate,
    dailyRate,
  };
}
