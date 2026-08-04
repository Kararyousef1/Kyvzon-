export interface LogisticsVehicleRecord {
  id: string;
  tenant_id: string;
  plate_number: string;
  vehicle_code: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: 'truck' | 'van' | 'pickup' | 'heavy_transport' | 'forklift' | 'car';
  fuel_type: 'diesel' | 'gasoline' | 'electric' | 'hybrid';
  max_weight_kg: number;
  max_volume_cbm: number;
  current_mileage_km: number;
  status: 'available' | 'on_trip' | 'maintenance' | 'out_of_service';
  branch_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LogisticsDriverRecord {
  id: string;
  tenant_id: string;
  employee_id?: string;
  driver_name_ar: string;
  license_number: string;
  license_class: string;
  license_expiry_date: string;
  phone?: string;
  status: 'active' | 'on_trip' | 'suspended' | 'off_duty';
  safety_score: number;
  created_at: string;
  updated_at: string;
}

export interface LogisticsMaintenanceRecord {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  maintenance_type: 'routine' | 'repair' | 'emergency' | 'inspection';
  description: string;
  cost: number;
  odometer_reading?: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduled_date: string;
  completed_date?: string;
  technician_notes?: string;
  created_at: string;
  updated_at: string;
}
