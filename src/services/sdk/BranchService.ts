/**
 * BranchService - إدارة فروع الشركة داخل بوابة الإدارة
 */
import { BaseService } from './BaseService';
import type { BranchRecord } from '../../shared/types/sdk';

class BranchService extends BaseService<BranchRecord> {
  constructor() { super('branches'); }

  async findActive(): Promise<BranchRecord[]> {
    return this.findAll({ filters: { status: 'active' }, orderBy: 'name_ar', ascending: true });
  }

  async createBranch(data: Partial<BranchRecord>): Promise<BranchRecord> {
    return this.create({ ...data, status: data.status || 'active' });
  }
}

export const branchService = new BranchService();
