export interface EmployeeFieldVisitRecord {
  id: string;
  tenant_id: string;
  employee_id: string;
  client_name: string;
  location_address: string;
  purpose: string;
  scheduled_at: string;
  check_in_at?: string;
  check_out_at?: string;
  status: 'planned' | 'checked_in' | 'completed' | 'cancelled' | 'missed';
  report_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeMissionRecord {
  id: string;
  tenant_id: string;
  employee_id: string;
  mission_title: string;
  destination: string;
  mission_type: 'official_mission' | 'training' | 'conference' | 'client_support';
  start_date: string;
  end_date: string;
  allowance_amount: number;
  status: 'pending' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
}
