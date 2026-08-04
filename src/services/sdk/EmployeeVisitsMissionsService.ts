import { BaseService } from './BaseService';
import type { EmployeeFieldVisitRecord, EmployeeMissionRecord } from '../../shared/types/employee-visits-missions';

class EmployeeFieldVisitService extends BaseService<EmployeeFieldVisitRecord> {
  constructor() {
    super('employee_field_visits');
  }

  async findActiveVisits(): Promise<EmployeeFieldVisitRecord[]> {
    return this.findWhere([{ column: 'status', operator: 'in', value: ['planned', 'checked_in'] }], { orderBy: 'scheduled_at', ascending: true });
  }
}

class EmployeeMissionService extends BaseService<EmployeeMissionRecord> {
  constructor() {
    super('employee_missions');
  }

  async findActiveMissions(): Promise<EmployeeMissionRecord[]> {
    return this.findWhere([{ column: 'status', operator: 'in', value: ['approved', 'in_progress'] }], { orderBy: 'start_date', ascending: true });
  }
}

export const employeeFieldVisitService = new EmployeeFieldVisitService();
export const employeeMissionService = new EmployeeMissionService();
