export interface EmployeeViolationRecord {
  id: string;
  tenant_id: string;
  employee_id: string;
  movement_id?: string;
  violation_type: 'late_return' | 'route_deviation' | 'unauthorized_exit' | 'missing_check_in';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  penalty_action?: string;
  status: 'open' | 'under_review' | 'resolved' | 'dismissed';
  recorded_at: string;
  created_at: string;
  updated_at: string;
}
