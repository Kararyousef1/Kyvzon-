/**
 * ════════════════════════════════════════════════════════════════
 *  PermissionService - خدمة الزمنيات (إذنيات الدخول/الخروج)
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { PermissionRecord, PermissionRequestRecord } from '../../shared/types/sdk';

class PermissionService extends BaseService<PermissionRecord> {
  constructor() {
    super('permissions');
  }

  async findPermissionsByEmployee(employeeId: string): Promise<PermissionRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'date',
      ascending: false,
    });
  }

  async createPermission(data: Partial<PermissionRecord>): Promise<PermissionRecord> {
    return this.create(data);
  }

  async approvePermission(id: string, approvedBy: string): Promise<PermissionRecord> {
    return this.update(id, {
      status: 'موافق',
      approved_by: approvedBy,
    } as unknown as Partial<PermissionRecord>);
  }

  async rejectPermission(id: string, approvedBy: string): Promise<PermissionRecord> {
    return this.update(id, {
      status: 'مرفوض',
      approved_by: approvedBy,
    } as unknown as Partial<PermissionRecord>);
  }
}

class PermissionRequestService extends BaseService<PermissionRequestRecord> {
  constructor() {
    super('permissions_request');
  }

  async findByEmployee(employeeId: string): Promise<PermissionRequestRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  async createRequest(data: Partial<PermissionRequestRecord>): Promise<PermissionRequestRecord> {
    return this.create(data);
  }

  async approveRequest(id: string, approvedBy: string): Promise<PermissionRequestRecord> {
    return this.update(id, {
      status: 'موافق',
      approved_by: approvedBy,
      reviewed_at: new Date().toISOString(),
    } as unknown as Partial<PermissionRequestRecord>);
  }

  async rejectRequest(id: string, approvedBy: string, reason?: string): Promise<PermissionRequestRecord> {
    return this.update(id, {
      status: 'مرفوض',
      approved_by: approvedBy,
      rejection_reason: reason || null,
      reviewed_at: new Date().toISOString(),
    } as unknown as Partial<PermissionRequestRecord>);
  }

  async getPendingCount(): Promise<number> {
    return this.count({ status: 'انتظار' });
  }
}

export const permissionService = new PermissionService();
export const permissionRequestService = new PermissionRequestService();
