/**
 * ════════════════════════════════════════════════════════════════
 *  PayrollService - خدمة الرواتب (نسخة SDK جديدة)
 *  مسؤولة عن: إدارة الرواتب, البدلات, الاستقطاعات, التقارير
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';
import { BaseService, getCurrentTenantId, SdkError } from './BaseService';
import type { PayrollRecord as LegacyPayrollRecord } from '../../shared/types/sdk';
import type { PayrollPeriod, PayrollRecord, PayrollSettings } from '../../shared/types/payroll';
import type { EmployeeSummary } from '../../shared/types/sdk';

export type PayrollRecordView = PayrollRecord & {
  employees: EmployeeSummary | null;
};

export type PayrollSettingsRecord = Omit<PayrollSettings, 'id'> & { id: string };

class PayrollService extends BaseService<LegacyPayrollRecord> {
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

class PayrollPeriodService extends BaseService<PayrollPeriod> {
  constructor() { super('payroll_periods'); }

  async findAllPeriods(): Promise<PayrollPeriod[]> {
    return this.findAll({ orderBy: 'start_date', ascending: false, limit: 120 });
  }

  async createPeriod(data: Partial<PayrollPeriod>): Promise<PayrollPeriod> {
    return this.create(data);
  }

  async updatePeriodStatus(id: string, status: PayrollPeriod['status']): Promise<PayrollPeriod> {
    return this.update(id, { status });
  }
}

// ─────────────────────────────────────────────────
//  Payroll Records
// ─────────────────────────────────────────────────

class PayrollRecordService extends BaseService<PayrollRecord> {
  constructor() { super('payroll_records'); }

  async findByPeriod(periodId: string): Promise<PayrollRecord[]> {
    return this.findAll({
      filters: { period_id: periodId },
      orderBy: 'net_salary',
      ascending: false,
      limit: 500,
    });
  }

  /** لوح السجلات بعلاقة الموظف من PostgREST؛ لا جلب لكل الموظفين وربط في المتصفح. */
  async findPeriodBoard(periodId: string): Promise<PayrollRecordView[]> {
    let query = supabase.from('payroll_records')
      .select('*,employees(id,employee_code,full_name_ar,first_name,last_name,department_id,position)')
      .eq('period_id', periodId)
      .order('net_salary', { ascending: false })
      .limit(500);
    const tenantId = getCurrentTenantId();
    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data, error } = await query;
    if (error) throw SdkError.fromSupabaseError(error);
    return (data ?? []) as unknown as PayrollRecordView[];
  }

  async upsertRecords(records: Partial<PayrollRecord>[]): Promise<void> {
    for (const record of records) await this.create(record);
  }

  async updateStatusByPeriod(periodId: string, status: PayrollRecord['status']): Promise<void> {
    const records = await this.findByPeriod(periodId);
    for (const record of records) await this.update(record.id, { status });
  }
}

// ─────────────────────────────────────────────────
//  Payroll Settings
// ─────────────────────────────────────────────────

class PayrollSettingService extends BaseService<PayrollSettingsRecord> {
  constructor() { super('payroll_settings'); }

  async findSettings(): Promise<PayrollSettingsRecord | null> {
    return this.findById('1');
  }

  async updateSettings(id: string, data: Partial<PayrollSettingsRecord>): Promise<PayrollSettingsRecord> {
    return this.update(id, data);
  }
}

export const payrollService = new PayrollService();
export const payrollPeriodService = new PayrollPeriodService();
export const payrollRecordService = new PayrollRecordService();
export const payrollSettingService = new PayrollSettingService();
