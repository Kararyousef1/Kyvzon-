/**
 * ComplianceService - مركز الامتثال الإداري
 */
import { BaseService } from './BaseService';
import type { ComplianceCheckRecord, PolicyAcknowledgementRecord } from '../../shared/types/sdk';

class ComplianceCheckService extends BaseService<ComplianceCheckRecord> {
  constructor() { super('compliance_checks'); }

  async createCheck(data: Partial<ComplianceCheckRecord>): Promise<ComplianceCheckRecord> {
    return this.create({ ...data, status: data.status || 'open', risk_level: data.risk_level || 'medium' });
  }

  async closeCheck(id: string, reviewedBy?: string): Promise<ComplianceCheckRecord> {
    return this.update(id, {
      status: 'closed',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Partial<ComplianceCheckRecord>);
  }
}

class PolicyAcknowledgementService extends BaseService<PolicyAcknowledgementRecord> {
  constructor() { super('policy_acknowledgements'); }

  async findByEmployee(employeeId: string): Promise<PolicyAcknowledgementRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'acknowledged_at', ascending: false });
  }
}

export const complianceCheckService = new ComplianceCheckService();
export const policyAcknowledgementService = new PolicyAcknowledgementService();
