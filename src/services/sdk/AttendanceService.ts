/**
 * ════════════════════════════════════════════════════════════════
 *  AttendanceService - خدمة الحضور والانصراف
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { logger } from '../utils/logger';
import type { AttendanceLogRecord, AttendanceSummaryRecord } from '../../shared/types/sdk';

class AttendanceService extends BaseService<AttendanceLogRecord> {
  constructor() {
    super('attendance_logs');
  }

  async findLogsByEmployee(employeeId: string, options?: {
    fromDate?: string; toDate?: string; limit?: number;
  }): Promise<AttendanceLogRecord[]> {
    logger.debug('AttendanceService.findLogsByEmployee', {
      component: 'AttendanceService',
      action: 'findLogsByEmployee',
      employeeId,
    });

    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'punch_time',
      ascending: false,
      limit: options?.limit || 100,
    });
  }

  async findLastPunch(employeeId: string): Promise<AttendanceLogRecord | null> {
    logger.debug('AttendanceService.findLastPunch', {
      component: 'AttendanceService',
      action: 'findLastPunch',
      employeeId,
    });

    const logs = await this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'punch_time',
      ascending: false,
      limit: 1,
    });
    return logs.length > 0 ? logs[0] : null;
  }

  async recordPunch(data: Partial<AttendanceLogRecord>): Promise<AttendanceLogRecord> {
    logger.info('AttendanceService.recordPunch', {
      component: 'AttendanceService',
      action: 'recordPunch',
    });
    return this.create(data);
  }

  async countPunchesSince(fromIso: string): Promise<number> {
    return this.findWhere([
      { column: 'punch_time', operator: 'gte', value: fromIso },
    ], { limit: 1000 }).then(rows => rows.length);
  }
}

// ─── Attendance Summary ──────────────────────────

class AttendanceSummaryService extends BaseService<AttendanceSummaryRecord> {
  constructor() {
    super('attendance_summary');
  }

  async findSummaryByEmployee(employeeId: string, options?: {
    fromDate?: string; toDate?: string;
  }): Promise<AttendanceSummaryRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'shift_date',
      ascending: false,
    });
  }

  async getDailyStats(date: string): Promise<{
    date: string; total: number; present: number; late: number; absent: number;
  }> {
    const records = await this.findAll({ filters: { shift_date: date } });
    return {
      date,
      total: records.length,
      present: records.filter((r) => r.status === 'حضور_بوقت').length,
      late: records.filter((r) => r.status === 'متأخر').length,
      absent: records.filter((r) => r.status === 'غائب').length,
    };
  }

  async updateSummary(employeeId: string, shiftDate: string, data: Partial<AttendanceSummaryRecord>): Promise<AttendanceSummaryRecord> {
    const records = await this.findAll({
      filters: { employee_id: employeeId, shift_date: shiftDate },
      limit: 1,
    });
    if (records.length > 0) {
      return this.update(records[0].id, data);
    }
    return this.create({
      employee_id: employeeId,
      shift_date: shiftDate,
      ...data,
    } as unknown as Partial<AttendanceSummaryRecord>);
  }
}

export const attendanceService = new AttendanceService();
export const attendanceSummaryService = new AttendanceSummaryService();
