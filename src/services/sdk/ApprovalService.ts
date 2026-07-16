/**
 * ApprovalService - مركز موافقات المدير
 */
import { BaseService } from './BaseService';
import type { ApprovalActionRecord, ApprovalRequestRecord } from '../../shared/types/sdk';

class ApprovalRequestService extends BaseService<ApprovalRequestRecord> {
  constructor() { super('approval_requests'); }
  async findForApprover(approverId: string): Promise<ApprovalRequestRecord[]> {
    return this.findAll({ filters: { current_approver_id: approverId }, orderBy: 'created_at', ascending: false });
  }
  async createRequest(data: Partial<ApprovalRequestRecord>): Promise<ApprovalRequestRecord> {
    return this.create({ ...data, status: data.status || 'pending', priority: data.priority || 'normal' });
  }
  async decide(id: string, status: 'approved' | 'rejected', approverId?: string, note?: string): Promise<ApprovalRequestRecord> {
    return this.update(id, { status, decided_by: approverId, decided_at: new Date().toISOString(), decision_note: note, updated_at: new Date().toISOString() } as Partial<ApprovalRequestRecord>);
  }
}

class ApprovalActionService extends BaseService<ApprovalActionRecord> {
  constructor() { super('approval_actions'); }
  async addAction(data: Partial<ApprovalActionRecord>): Promise<ApprovalActionRecord> { return this.create(data); }
}

export const approvalRequestService = new ApprovalRequestService();
export const approvalActionService = new ApprovalActionService();
