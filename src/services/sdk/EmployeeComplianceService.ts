import { BaseService } from './BaseService';
import type { EmployeeViolationRecord } from '../../shared/types/employee-compliance';

class EmployeeViolationService extends BaseService<EmployeeViolationRecord> {
  constructor() {
    super('employee_movement_violations');
  }

  async findOpenViolations(): Promise<EmployeeViolationRecord[]> {
    return this.findWhere([{ column: 'status', operator: 'in', value: ['open', 'under_review'] }], { orderBy: 'recorded_at', ascending: false });
  }
}

export const employeeViolationService = new EmployeeViolationService();
