export type PermitType = 'personal' | 'official' | 'field_visit' | 'training' | 'medical' | 'customer_visit' | 'emergency' | 'delegation';

export type PermitStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'active' | 'completed' | 'expired' | 'cancelled';

export interface EmployeeMovementPermitRecord {
  id: string;
  tenant_id: string;
  permit_number?: string;
  employee_id: string;
  employee_name?: string;
  department?: string;
  permit_type: PermitType;
  destination_id?: string;
  destination_name: string;
  purpose: string;
  valid_from: string;
  valid_until: string;
  max_duration_minutes: number;
  is_paid_time?: boolean;
  deduct_from_leave?: boolean;
  qr_token: string;
  status: PermitStatus;
  approved_by?: string;
  created_by?: string;
  movement_id?: string;
  used_at?: string;
  cancel_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeMovementApprovalRecord {
  id: string;
  tenant_id: string;
  permit_id: string;
  step_order: number;
  approver_id?: string;
  decision: 'pending' | 'approved' | 'rejected' | 'delegated';
  decided_at?: string;
  comments?: string;
  created_at: string;
}

export interface EmployeeMovementTemplateRecord {
  id: string;
  tenant_id: string;
  template_name: string;
  permit_type: PermitType;
  destination_id?: string;
  destination_name: string;
  purpose: string;
  max_duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeMovementLogRecord {
  id: string;
  tenant_id: string;
  employee_id: string;
  permit_id?: string;
  destination_name: string;
  purpose?: string;
  departure_at: string;
  expected_return_at: string;
  returned_at?: string;
  departure_gate_id?: string;
  return_gate_id?: string;
  actual_return_location?: string;
  route_violation: boolean;
  status: 'out' | 'returned' | 'overdue' | 'violated';
  logged_by_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
