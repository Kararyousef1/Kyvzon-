import { BaseService } from './BaseService';
import type { EmployeeMovementPermitRecord, EmployeeMovementApprovalRecord, EmployeeMovementTemplateRecord, EmployeeMovementLogRecord } from '../../shared/types/employee-permits';

class EmployeeMovementPermitService extends BaseService<EmployeeMovementPermitRecord> {
  constructor() {
    super('employee_movement_permits');
  }

  async findActivePermits(): Promise<EmployeeMovementPermitRecord[]> {
    return this.findWhere([
      { column: 'status', operator: 'in', value: ['approved', 'active'] },
      { column: 'valid_until', operator: 'gte', value: new Date().toISOString() },
    ], { orderBy: 'valid_until', ascending: true });
  }

  async findPendingApprovals(): Promise<EmployeeMovementPermitRecord[]> {
    return this.findWhere([{ column: 'status', value: 'pending_approval' }], { orderBy: 'created_at', ascending: false });
  }

  async findByQrToken(qrToken: string): Promise<EmployeeMovementPermitRecord | null> {
    const rows = await this.findWhere([{ column: 'qr_token', value: qrToken }]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async cancelPermit(id: string, reason: string): Promise<EmployeeMovementPermitRecord> {
    return this.update(id, {
      status: 'cancelled',
      cancel_reason: reason,
      updated_at: new Date().toISOString(),
    } as Partial<EmployeeMovementPermitRecord>);
  }

  async extendPermit(id: string, additionalMinutes: number, reason: string): Promise<EmployeeMovementPermitRecord> {
    const record = await this.findById(id);
    if (!record) throw new Error('التصريح غير موجود');
    const currentUntil = new Date(record.valid_until);
    const newUntil = new Date(currentUntil.getTime() + additionalMinutes * 60000);
    return this.update(id, {
      valid_until: newUntil.toISOString(),
      max_duration_minutes: record.max_duration_minutes + additionalMinutes,
      notes: `${record.notes || ''} | [تمديد +${additionalMinutes}د]: ${reason}`,
      updated_at: new Date().toISOString(),
    } as Partial<EmployeeMovementPermitRecord>);
  }
}

class EmployeeMovementApprovalService extends BaseService<EmployeeMovementApprovalRecord> {
  constructor() {
    super('employee_movement_approvals');
  }
}

class EmployeeMovementTemplateService extends BaseService<EmployeeMovementTemplateRecord> {
  constructor() {
    super('employee_movement_templates');
  }

  async findActiveTemplates(): Promise<EmployeeMovementTemplateRecord[]> {
    return this.findWhere([{ column: 'is_active', value: true }], { orderBy: 'template_name', ascending: true });
  }
}

class EmployeeMovementLogService extends BaseService<EmployeeMovementLogRecord> {
  constructor() {
    super('employee_movements_log');
  }

  async findActiveMovements(): Promise<EmployeeMovementLogRecord[]> {
    return this.findWhere([{ column: 'status', value: 'out' }], { orderBy: 'departure_at', ascending: false });
  }
}

export const employeeMovementPermitService = new EmployeeMovementPermitService();
export const employeeMovementApprovalService = new EmployeeMovementApprovalService();
export const employeeMovementTemplateService = new EmployeeMovementTemplateService();
export const employeeMovementLogService = new EmployeeMovementLogService();
