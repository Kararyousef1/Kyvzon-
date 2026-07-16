/**
 * SupervisorService - خدمات بوابة المشرف: المهام، ملاحظات الوردية، قوائم الفحص
 */
import { BaseService } from './BaseService';
import type { OperationalChecklistRecord, ShiftNoteRecord, TeamTaskRecord } from '../../shared/types/sdk';

class TeamTaskService extends BaseService<TeamTaskRecord> {
  constructor() { super('team_tasks'); }
  async findBySupervisor(supervisorId: string): Promise<TeamTaskRecord[]> {
    return this.findAll({ filters: { supervisor_id: supervisorId }, orderBy: 'created_at', ascending: false });
  }
  async createTask(data: Partial<TeamTaskRecord>): Promise<TeamTaskRecord> {
    return this.create({ ...data, status: data.status || 'open', priority: data.priority || 'medium' });
  }
  async completeTask(id: string): Promise<TeamTaskRecord> {
    return this.update(id, { status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Partial<TeamTaskRecord>);
  }
}

class ShiftNoteService extends BaseService<ShiftNoteRecord> {
  constructor() { super('shift_notes'); }
  async findBySupervisor(supervisorId: string): Promise<ShiftNoteRecord[]> {
    return this.findAll({ filters: { supervisor_id: supervisorId }, orderBy: 'created_at', ascending: false });
  }
  async createNote(data: Partial<ShiftNoteRecord>): Promise<ShiftNoteRecord> {
    return this.create(data);
  }
}

class OperationalChecklistService extends BaseService<OperationalChecklistRecord> {
  constructor() { super('operational_checklists'); }
  async findBySupervisor(supervisorId: string): Promise<OperationalChecklistRecord[]> {
    return this.findAll({ filters: { supervisor_id: supervisorId }, orderBy: 'created_at', ascending: false });
  }
  async createChecklist(data: Partial<OperationalChecklistRecord>): Promise<OperationalChecklistRecord> {
    return this.create({ ...data, status: data.status || 'submitted' });
  }
}

export const teamTaskService = new TeamTaskService();
export const shiftNoteService = new ShiftNoteService();
export const operationalChecklistService = new OperationalChecklistService();
