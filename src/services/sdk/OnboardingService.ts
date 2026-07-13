/**
 * ════════════════════════════════════════════════════════════════
 *  OnboardingService - خدمة دورة الموظف (نسخة SDK جديدة)
 *  Domain: Onboarding
 *  تشمل: onboarding_tasks, employee_onboarding, offboarding_records
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { OnboardingTaskRecord } from '../../shared/types/sdk';

class OnboardingTaskService extends BaseService<OnboardingTaskRecord> {
  constructor() { super('onboarding_tasks'); }
  async findActiveTasks(): Promise<any[]> {
    return this.findAll({ filters: { is_active: true }, orderBy: 'sort_order', ascending: true });
  }
}

class EmployeeOnboardingService extends BaseService {
  constructor() { super('employee_onboarding'); }
  async findByEmployee(employeeId: string): Promise<any[]> {
    return this.findAll({ filters: { employee_id: employeeId } });
  }
  async upsert(records: any[]): Promise<void> {
    for (const record of records) {
      await this.create(record as Record<string, unknown>);
    }
  }
  async updateStatus(id: string, status: string): Promise<any> {
    return this.update(id, { status, completed_at: status === 'completed' ? new Date().toISOString() : null } as unknown as Record<string, unknown>);
  }
}

class OffboardingRecordService extends BaseService {
  constructor() { super('offboarding_records'); }
  async createRecord(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }
}

export const onboardingTaskService = new OnboardingTaskService();
export const employeeOnboardingService = new EmployeeOnboardingService();
export const offboardingRecordService = new OffboardingRecordService();