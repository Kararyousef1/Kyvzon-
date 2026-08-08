/**
 * ════════════════════════════════════════════════════════════════
 *  LeaveService - خدمة الإجازات (نسخة SDK معممة)
 *  Domain: Leave Management
 *  تشمل: طلبات الإجازات, الرصيد, الإعدادات, العطل
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type {
  LeaveRecord,
  LeaveBalanceRecord,
  LeaveSettingsRecord,
  HolidayRecord,
} from '../../shared/types/sdk';

// ─────────────────────────────────────────────────
//  Leave Requests
// ─────────────────────────────────────────────────

class LeaveService extends BaseService<LeaveRecord> {
  constructor() {
    super('leaves');
  }

  /** جلب إجازات موظف معين */
  async findLeavesByEmployee(employeeId: string): Promise<LeaveRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /** إنشاء طلب إجازة جديد */
  async createLeave(data: {
    employee_id: string;
    leave_type: string;
    date_from: string;
    date_to: string;
    working_days_count?: number;
    reason?: string;
    attachment_url?: string;
  }): Promise<LeaveRecord> {
    return this.create(data as unknown as Partial<LeaveRecord>);
  }

  /**
   * الموافقة على إجازة — **مسار إداري مباشر**.
   *
   * ⚠️ هذا يتجاوز سلسلة الموافقات (مشرف → مدير → مدير مباشر).
   *    المسار الطبيعي: `hrApprovalService.decide()` الذي يُحرّك السلسلة،
   *    ويُزامن `leaves.status` في القاعدة عبر `sync_hr_source_status`
   *    (محفّز migration 0323) — لا من المتصفح.
   *
   *    يبقى هنا لصلاحية HR في تصحيح سجل قديم بلا سلسلة اعتماد.
   *    القيمة 'موافق' هي ما تقرؤه شاشات الموظف (LeaveRequestPage)
   *    وهي ما تكتبه القاعدة — لا 'موافق عليه'.
   */
  async approveLeave(id: string, approvedBy: string): Promise<LeaveRecord> {
    return this.update(id, {
      status: 'موافق',
      approved_by: approvedBy,
    } as unknown as Partial<LeaveRecord>);
  }

  /** رفض إجازة — مسار إداري مباشر (انظر ملاحظة approveLeave) */
  async rejectLeave(id: string, approvedBy: string, reason?: string): Promise<LeaveRecord> {
    return this.update(id, {
      status: 'مرفوض',
      approved_by: approvedBy,
      rejection_reason: reason || null,
    } as unknown as Partial<LeaveRecord>);
  }
}

// ─────────────────────────────────────────────────
//  Leave Balance
// ─────────────────────────────────────────────────

class LeaveBalanceService extends BaseService<LeaveBalanceRecord> {
  constructor() {
    super('leave_balance');
  }

  /** جلب رصيد إجازات موظف */
  async findBalanceByEmployee(employeeId: string, year?: number): Promise<LeaveBalanceRecord | null> {
    const yearValue = year || new Date().getFullYear();
    const records = await this.findAll({
      filters: { employee_id: employeeId, year: yearValue },
      limit: 1,
    });
    return records.length > 0 ? records[0] : null;
  }

  /** ملخص رصيد الإجازات */
  async getBalanceSummary(employeeId: string): Promise<{
    employee_id: string;
    year: number;
    annual: { total: number; used: number; pending: number; remaining: number };
    sick: { total: number; used: number; pending: number; remaining: number };
  }> {
    const currentYear = new Date().getFullYear();
    const balance = await this.findBalanceByEmployee(employeeId, currentYear);

    const annual = balance ? {
      total: balance.annual_total || 0,
      used: balance.annual_used || 0,
      pending: balance.annual_pending || 0,
      remaining: (balance.annual_total || 0) - (balance.annual_used || 0) - (balance.annual_pending || 0),
    } : { total: 0, used: 0, pending: 0, remaining: 0 };

    const sick = balance ? {
      total: balance.sick_total || 30,
      used: balance.sick_used || 0,
      pending: balance.sick_pending || 0,
      remaining: (balance.sick_total || 30) - (balance.sick_used || 0) - (balance.sick_pending || 0),
    } : { total: 30, used: 0, pending: 0, remaining: 30 };

    return { employee_id: employeeId, year: currentYear, annual, sick };
  }
}

// ─────────────────────────────────────────────────
//  Leave Settings
// ─────────────────────────────────────────────────

class LeaveSettingsService extends BaseService<LeaveSettingsRecord> {
  constructor() {
    super('leave_settings');
  }

  /** جلب إعدادات نوع إجازة */
  async findSettingsByType(leaveType: string): Promise<LeaveSettingsRecord | null> {
    const records = await this.findAll({
      filters: { leave_type: leaveType },
      limit: 1,
    });
    return records.length > 0 ? records[0] : null;
  }

  /** جلب جميع إعدادات الإجازات */
  async findAllSettings(): Promise<LeaveSettingsRecord[]> {
    return this.findAll({ orderBy: 'leave_type', ascending: true });
  }
}

// ─────────────────────────────────────────────────
//  Holidays
// ─────────────────────────────────────────────────

class HolidayService extends BaseService<HolidayRecord> {
  constructor() {
    super('holidays');
  }

  /** جلب العطل في نطاق تاريخ */
  async findHolidaysInRange(fromDate: string, toDate: string): Promise<HolidayRecord[]> {
    const all = await this.findAll({ orderBy: 'date', ascending: true });
    return all.filter((h) => h.date >= fromDate && h.date <= toDate);
  }

  /** هل اليوم عطلة؟ */
  async isHoliday(date: string): Promise<boolean> {
    const count = await this.count({ date });
    return count > 0;
  }
}

export const leaveService = new LeaveService();
export const leaveBalanceService = new LeaveBalanceService();
export const leaveSettingsService = new LeaveSettingsService();
export const holidayService = new HolidayService();
