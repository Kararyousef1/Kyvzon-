/**
 * MovementPermitService - تصاريح حركة الموظفين المسبقة
 */
import { BaseService } from './BaseService';
import type { MovementPermitRecord } from '../../shared/types/sdk';

class MovementPermitService extends BaseService<MovementPermitRecord> {
  constructor() { super('movement_permits'); }

  async findActivePermits(): Promise<MovementPermitRecord[]> {
    return this.findWhere([
      { column: 'status', value: 'approved' },
      { column: 'valid_until', operator: 'gte', value: new Date().toISOString() },
    ], { orderBy: 'valid_until', ascending: true });
  }

  async findByEmployee(employeeId: string): Promise<MovementPermitRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'created_at', ascending: false });
  }

  async createPermit(data: Partial<MovementPermitRecord>): Promise<MovementPermitRecord> {
    return this.create({
      ...data,
      status: data.status || 'approved',
      max_duration_minutes: data.max_duration_minutes || 30,
    });
  }

  async markUsed(id: string, movementId?: string): Promise<MovementPermitRecord> {
    return this.update(id, {
      status: 'used',
      movement_id: movementId,
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Partial<MovementPermitRecord>);
  }

  async cancelPermit(id: string): Promise<MovementPermitRecord> {
    return this.update(id, { status: 'cancelled', updated_at: new Date().toISOString() } as Partial<MovementPermitRecord>);
  }
}

export const movementPermitService = new MovementPermitService();
