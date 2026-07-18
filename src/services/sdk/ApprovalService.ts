import { BaseService } from './BaseService';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalRequestRecord {
  id: string;
  tenant_id: string;
  requester_id?: string | null;
  requester_name?: string | null;
  current_approver_id?: string | null;
  request_type: string;
  title: string;
  description?: string | null;
  priority: 'low' | 'normal' | 'urgent';
  status: ApprovalStatus;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
}

export interface ApprovalActionInput {
  approval_request_id: string;
  actor_id?: string;
  action: 'created' | 'approved' | 'rejected' | 'commented' | 'reassigned';
  note?: string;
}

class ApprovalRequestService extends BaseService<ApprovalRequestRecord> {
  constructor() {
    super('approval_requests');
  }

  async createRequest(data: Partial<ApprovalRequestRecord>) {
    return this.create(data);
  }

  async findForApprover(approverId: string) {
    return this.findAll({
      filters: { current_approver_id: approverId },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  async decide(id: string, status: Extract<ApprovalStatus, 'approved' | 'rejected'>, approverId?: string, note?: string) {
    return this.update(id, {
      status,
      decided_by: approverId ?? null,
      decided_at: new Date().toISOString(),
      decision_note: note ?? null,
    });
  }

  async approve(id: string, approverId: string, comments?: string) {
    return this.decide(id, 'approved', approverId, comments);
  }

  async reject(id: string, approverId: string, comments?: string) {
    return this.decide(id, 'rejected', approverId, comments);
  }

  async findPending(tenantId: string) {
    return this.findAll({ filters: { tenant_id: tenantId, status: 'pending' }, orderBy: 'created_at', ascending: false });
  }
}

class ApprovalActionService extends BaseService<ApprovalActionInput> {
  constructor() {
    super('approval_actions');
  }

  async addAction(data: ApprovalActionInput) {
    return this.create(data);
  }
}

export const approvalRequestService = new ApprovalRequestService();
export const approvalActionService = new ApprovalActionService();
export const approvalService = approvalRequestService;
