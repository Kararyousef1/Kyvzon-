import { BaseService } from './BaseService';
class ApprovalService extends BaseService<any> {
  constructor() { super('approval_requests'); }
  async createRequest(data: Partial<any>) { return this.create(data); }
  async approve(id: string, approverId: string, comments?: string) { return this.update(id, { status: 'approved', updated_at: new Date().toISOString() } as any); }
  async reject(id: string, approverId: string, comments?: string) { return this.update(id, { status: 'rejected', updated_at: new Date().toISOString() } as any); }
  async findPending(tenantId: string) { return this.findAll({ filters: { tenant_id: tenantId, status: 'pending' }, orderBy: 'created_at', ascending: false }); }
}
export const approvalRequestService = new ApprovalService();
export const approvalService = approvalRequestService;
export const approvalActionService = new ApprovalService();
