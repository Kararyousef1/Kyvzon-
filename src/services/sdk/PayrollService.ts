/**
 * ════════════════════════════════════════════════════════════════
 *  PayrollService - خدمة الرواتب (نسخة SDK جديدة)
 *  مسؤولة عن: إدارة الرواتب, البدلات, الاستقطاعات, التقارير
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { PayrollRecord } from '../../shared/types/sdk';

class PayrollService extends BaseService<PayrollRecord> {
  constructor() {
    super('payroll');
  }

  /**
   * جلب كشوف الرواتب
   */
  async findAllPayrolls(options?: {
    employeeId?: string;
    month?: number;
    year?: number;
  }): Promise<any[]> {
    const filters: Record<string, unknown> = {};
    if (options?.employeeId) filters.employee_id = options.employeeId;
    if (options?.month) filters.month = options.month;
    if (options?.year) filters.year = options.year;

    return this.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /**
   * جلب راتب موظف معين
   */
  async findPayrollByEmployee(employeeId: string): Promise<any[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'month',
      ascending: false,
    });
  }

  /**
   * إنشاء سجل راتب جديد
   */
  async createPayroll(data: {
    employee_id: string;
    month: number;
    year: number;
    basic_salary: number;
    allowances?: Record<string, unknown>;
    deductions?: Record<string, unknown>;
    total_salary: number;
    status?: string;
  }): Promise<any> {
    return this.create(data as unknown as Record<string, unknown>);
  }

  /**
   * تحديث حالة راتب
   */
  async updatePayrollStatus(id: string, status: string): Promise<any> {
    return this.update(id, { status } as unknown as Record<string, unknown>);
  }
}

// ─────────────────────────────────────────────────
//  Payroll Periods
// ─────────────────────────────────────────────────

class PayrollPeriodService extends BaseService {
  constructor() { super('payroll_periods'); }

  async findAllPeriods(): Promise<any[]> {
    return this.findAll({ orderBy: 'start_date', ascending: false });
  }

  async createPeriod(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }

  async updatePeriodStatus(id: string, status: string): Promise<any> {
    return this.update(id, { status } as unknown as Record<string, unknown>);
  }
}

// ─────────────────────────────────────────────────
//  Payroll Records
// ─────────────────────────────────────────────────

class PayrollRecordService extends BaseService {
  constructor() { super('payroll_records'); }

  async findByPeriod(periodId: string): Promise<any[]> {
    return this.findAll({ filters: { period_id: periodId }, orderBy: 'net_salary', ascending: false });
  }

  async upsertRecords(records: Record<string, unknown>[]): Promise<void> {
    for (const record of records) {
      await this.create(record);
    }
  }

  async updateStatusByPeriod(periodId: string, status: string): Promise<void> {
    const records = await this.findByPeriod(periodId);
    for (const record of records) {
      await this.update(record.id, { status } as unknown as Record<string, unknown>);
    }
  }
}

// ─────────────────────────────────────────────────
//  Payroll Settings
// ─────────────────────────────────────────────────

class PayrollSettingService extends BaseService {
  constructor() { super('payroll_settings'); }

  async findSettings(): Promise<any | null> {
    return this.findById('1');
  }

  async updateSettings(id: string, data: Record<string, unknown>): Promise<any> {
    return this.update(id, data);
  }
}

export const payrollService = new PayrollService();
export const payrollPeriodService = new PayrollPeriodService();
export const payrollRecordService = new PayrollRecordService();
export const payrollSettingService = new PayrollSettingService();
