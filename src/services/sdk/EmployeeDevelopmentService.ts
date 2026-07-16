/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeDevelopmentService
 *  مجال: أهداف الموظف، تحديثات الأهداف، المهارات والكفاءات
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type {
  EmployeeGoalRecord,
  GoalUpdateRecord,
  EmployeeSkillRecord,
} from '../../shared/types/sdk';

class EmployeeGoalService extends BaseService<EmployeeGoalRecord> {
  constructor() { super('employee_goals'); }

  async findByEmployee(employeeId: string): Promise<EmployeeGoalRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  async createGoal(data: Partial<EmployeeGoalRecord>): Promise<EmployeeGoalRecord> {
    const progress = Math.min(Math.max(Number(data.progress_percent ?? 0), 0), 100);
    return this.create({
      ...data,
      progress_percent: progress,
      status: data.status || 'active',
    });
  }

  async updateProgress(id: string, progressPercent: number, note?: string): Promise<EmployeeGoalRecord> {
    const progress = Math.min(Math.max(Number(progressPercent), 0), 100);
    const status = progress >= 100 ? 'completed' : 'active';
    return this.update(id, {
      progress_percent: progress,
      status,
      last_update_note: note,
      updated_at: new Date().toISOString(),
    } as Partial<EmployeeGoalRecord>);
  }

  async closeGoal(id: string, status: 'completed' | 'cancelled'): Promise<EmployeeGoalRecord> {
    return this.update(id, {
      status,
      progress_percent: status === 'completed' ? 100 : undefined,
      updated_at: new Date().toISOString(),
    } as Partial<EmployeeGoalRecord>);
  }
}

class GoalUpdateService extends BaseService<GoalUpdateRecord> {
  constructor() { super('goal_updates'); }

  async findByGoal(goalId: string): Promise<GoalUpdateRecord[]> {
    return this.findAll({ filters: { goal_id: goalId }, orderBy: 'created_at', ascending: false });
  }

  async addUpdate(data: Partial<GoalUpdateRecord>): Promise<GoalUpdateRecord> {
    return this.create(data);
  }
}

class EmployeeSkillService extends BaseService<EmployeeSkillRecord> {
  constructor() { super('employee_skills'); }

  async findByEmployee(employeeId: string): Promise<EmployeeSkillRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'updated_at', ascending: false });
  }

  async upsertSkill(data: Partial<EmployeeSkillRecord>): Promise<EmployeeSkillRecord> {
    return this.create({
      ...data,
      source: data.source || 'employee_self_assessment',
      status: data.status || 'active',
    });
  }

  async updateLevel(id: string, level: EmployeeSkillRecord['level']): Promise<EmployeeSkillRecord> {
    return this.update(id, { level, updated_at: new Date().toISOString() } as Partial<EmployeeSkillRecord>);
  }
}

export const employeeGoalService = new EmployeeGoalService();
export const goalUpdateService = new GoalUpdateService();
export const employeeSkillService = new EmployeeSkillService();
