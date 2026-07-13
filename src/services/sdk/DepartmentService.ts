/**
 * ════════════════════════════════════════════════════════════════
 *  DepartmentService - خدمة الأقسام
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { DepartmentRecord } from '../../shared/types/sdk';

class DepartmentService extends BaseService<DepartmentRecord> {
  constructor() { super('departments'); }

  async findActive(): Promise<DepartmentRecord[]> {
    return this.findAll({ filters: { is_active: true }, orderBy: 'name_ar', ascending: true });
  }

  async findTree(): Promise<(DepartmentRecord & { children?: DepartmentRecord[] })[]> {
    const all = await this.findActive();
    const topLevel = all.filter(d => !d.parent_department_id);
    return topLevel.map(dept => ({
      ...dept,
      children: all.filter(d => d.parent_department_id === dept.id),
    }));
  }

  async findDepartmentsWithManager(): Promise<DepartmentRecord[]> {
    return this.findAll({ filters: { is_active: true, manager_id: undefined }, orderBy: 'name_ar', ascending: true });
  }
}

class SpecialtyService extends BaseService {
  constructor() { super('specialties'); }

  async findAllSpecialties(): Promise<any[]> {
    return this.findAll({ orderBy: 'name', ascending: true });
  }

  async createSpecialty(data: { name: string; name_en?: string; description?: string; department?: string; role_level?: string }): Promise<any> {
    return this.create(data as unknown as Record<string, unknown>);
  }

  async deleteSpecialty(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

export const departmentService = new DepartmentService();
export const specialtyService = new SpecialtyService();
