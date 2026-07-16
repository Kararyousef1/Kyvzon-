/** ManagerService - عبء العمل وتوزيع الموارد */
import { BaseService } from './BaseService';
import type { ManagerWorkloadItemRecord } from '../../shared/types/sdk';

class ManagerWorkloadItemService extends BaseService<ManagerWorkloadItemRecord> {
  constructor() { super('manager_workload_items'); }
  async findByManager(managerId: string): Promise<ManagerWorkloadItemRecord[]> {
    return this.findAll({ filters: { manager_id: managerId }, orderBy: 'created_at', ascending: false });
  }
  async createItem(data: Partial<ManagerWorkloadItemRecord>): Promise<ManagerWorkloadItemRecord> {
    return this.create({ ...data, status: data.status || 'open', priority: data.priority || 'medium' });
  }
  async complete(id: string): Promise<ManagerWorkloadItemRecord> {
    return this.update(id, { status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Partial<ManagerWorkloadItemRecord>);
  }
}

export const managerWorkloadItemService = new ManagerWorkloadItemService();
