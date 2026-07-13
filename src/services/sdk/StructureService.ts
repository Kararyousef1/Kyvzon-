/**
 * ════════════════════════════════════════════════════════════════
 *  StructureService - خدمة الهيكل التنظيمي (نسخة SDK جديدة)
 *  Domain: Structure
 *  تشمل: structure_departments, structure_positions, structure_ranks, structure_roles, structure_shifts
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { StructureDepartmentRecord } from '../../shared/types/sdk';

class StructureDepartmentService extends BaseService<StructureDepartmentRecord> {
  constructor() { super('structure_departments'); }
  async findAllDepts(): Promise<any[]> {
    return this.findAll({ orderBy: 'sort_order', ascending: true });
  }
  async upsertItem(data: Record<string, unknown>): Promise<any> {
    if (data.id) return this.update(data.id as string, data);
    return this.create(data);
  }
  async deleteItem(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

class StructurePositionService extends BaseService {
  constructor() { super('structure_positions'); }
  async findAllPositions(): Promise<any[]> {
    return this.findAll({ orderBy: 'name_ar', ascending: true });
  }
  async upsertItem(data: Record<string, unknown>): Promise<any> {
    if (data.id) return this.update(data.id as string, data);
    return this.create(data);
  }
  async deleteItem(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

class StructureRankService extends BaseService {
  constructor() { super('structure_ranks'); }
  async findAllRanks(): Promise<any[]> {
    return this.findAll({ orderBy: 'level', ascending: true });
  }
  async upsertItem(data: Record<string, unknown>): Promise<any> {
    if (data.id) return this.update(data.id as string, data);
    return this.create(data);
  }
  async deleteItem(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

class StructureShiftService extends BaseService {
  constructor() { super('structure_shifts'); }
  async findAllShifts(): Promise<any[]> {
    return this.findAll({ orderBy: 'code', ascending: true });
  }
  async upsertItem(data: Record<string, unknown>): Promise<any> {
    if (data.id) return this.update(data.id as string, data);
    return this.create(data);
  }
  async deleteItem(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

class StructureRoleService extends BaseService {
  constructor() { super('structure_roles'); }
  async findAllRoles(): Promise<any[]> {
    return this.findAll({ orderBy: 'code', ascending: true });
  }
  async upsertItem(data: Record<string, unknown>): Promise<any> {
    if (data.id) return this.update(data.id as string, data);
    return this.create(data);
  }
  async deleteItem(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

export const structureDepartmentService = new StructureDepartmentService();
export const structurePositionService = new StructurePositionService();
export const structureRankService = new StructureRankService();
export const structureShiftService = new StructureShiftService();
export const structureRoleService = new StructureRoleService();