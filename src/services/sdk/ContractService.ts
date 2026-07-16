/**
 * ════════════════════════════════════════════════════════════════
 *  ContractService - إدارة عقود الموظفين داخل بوابة HR
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { EmployeeContractRecord } from '../../shared/types/sdk';

class EmployeeContractService extends BaseService<EmployeeContractRecord> {
  constructor() { super('employee_contracts'); }

  async findByEmployee(employeeId: string): Promise<EmployeeContractRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'end_date', ascending: true });
  }

  async findActive(): Promise<EmployeeContractRecord[]> {
    return this.findAll({ filters: { status: 'active' }, orderBy: 'end_date', ascending: true });
  }

  async createContract(data: Partial<EmployeeContractRecord>): Promise<EmployeeContractRecord> {
    return this.create({
      ...data,
      status: data.status || 'active',
      renewal_notice_days: data.renewal_notice_days ?? 30,
    });
  }

  async renewContract(id: string, endDate: string, updatedBy?: string): Promise<EmployeeContractRecord> {
    return this.update(id, {
      end_date: endDate,
      status: 'active',
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    } as Partial<EmployeeContractRecord>);
  }

  async terminateContract(id: string, updatedBy?: string): Promise<EmployeeContractRecord> {
    return this.update(id, {
      status: 'terminated',
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    } as Partial<EmployeeContractRecord>);
  }
}

export const employeeContractService = new EmployeeContractService();
