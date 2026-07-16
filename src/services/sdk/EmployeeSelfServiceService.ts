/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeSelfServiceService
 *  مجال: مركز خدمات HR للموظف + طلبات الخطابات
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type {
  HRCaseRecord,
  HRCaseCommentRecord,
  EmployeeLetterRequestRecord,
} from '../../shared/types/sdk';

class HRCaseService extends BaseService<HRCaseRecord> {
  constructor() { super('hr_cases'); }

  async findByEmployee(employeeId: string): Promise<HRCaseRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'created_at', ascending: false });
  }

  async createCase(data: Partial<HRCaseRecord>): Promise<HRCaseRecord> {
    return this.create({
      ...data,
      status: data.status || 'open',
      priority: data.priority || 'normal',
      channel: data.channel || 'employee_portal',
    });
  }
}

class HRCaseCommentService extends BaseService<HRCaseCommentRecord> {
  constructor() { super('hr_case_comments'); }

  async findByCase(caseId: string): Promise<HRCaseCommentRecord[]> {
    return this.findAll({ filters: { case_id: caseId }, orderBy: 'created_at', ascending: true });
  }

  async addComment(data: Partial<HRCaseCommentRecord>): Promise<HRCaseCommentRecord> {
    return this.create(data);
  }
}

class EmployeeLetterRequestService extends BaseService<EmployeeLetterRequestRecord> {
  constructor() { super('employee_letter_requests'); }

  async findByEmployee(employeeId: string): Promise<EmployeeLetterRequestRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'created_at', ascending: false });
  }

  async createLetterRequest(data: Partial<EmployeeLetterRequestRecord>): Promise<EmployeeLetterRequestRecord> {
    return this.create({
      ...data,
      status: data.status || 'submitted',
      delivery_method: data.delivery_method || 'portal',
    });
  }
}

export const hrCaseService = new HRCaseService();
export const hrCaseCommentService = new HRCaseCommentService();
export const employeeLetterRequestService = new EmployeeLetterRequestService();
