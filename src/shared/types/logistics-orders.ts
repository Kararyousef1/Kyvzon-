export interface LogisticsShipmentOrderRecord {
  id: string;
  tenant_id: string;
  order_code: string;
  origin_location_id?: string;
  destination_location_id?: string;
  origin_address: string;
  destination_address: string;
  cargo_description: string;
  cargo_weight_kg: number;
  cargo_volume_cbm: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'draft' | 'scheduled' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';
  scheduled_departure?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LogisticsDispatchRecord {
  id: string;
  tenant_id: string;
  dispatch_code: string;
  order_id: string;
  vehicle_id: string;
  driver_id: string;
  status: 'dispatched' | 'en_route' | 'arrived' | 'completed' | 'failed';
  dispatched_at: string;
  estimated_arrival?: string;
  actual_arrival?: string;
  dispatch_notes?: string;
  created_at: string;
  updated_at: string;
}
