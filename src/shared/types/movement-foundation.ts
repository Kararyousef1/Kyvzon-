export interface MovementRoleAssignmentRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  portal_role: 'employee_movement' | 'logistics' | 'movement_manager';
  is_active: boolean;
  assigned_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MovementLocationRecord {
  id: string;
  tenant_id: string;
  code: string;
  name_ar: string;
  name_en?: string;
  location_type: 'gate' | 'warehouse' | 'office' | 'checkpoint' | 'parking' | 'hub' | 'client_site';
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  is_active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface MovementPolicyRecord {
  id: string;
  tenant_id: string;
  policy_code: string;
  title_ar: string;
  destination_type: string;
  max_duration_minutes: number;
  requires_approval: boolean;
  auto_notify_overdue: boolean;
  is_active: boolean;
  rules_json?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LogisticsSettingRecord {
  id: string;
  tenant_id: string;
  setting_key: string;
  setting_value: string;
  description?: string;
  created_at: string;
  updated_at: string;
}
