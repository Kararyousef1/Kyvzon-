export interface LogisticsEpodRecord {
  id: string;
  tenant_id: string;
  dispatch_id: string;
  order_id: string;
  recipient_name: string;
  signature_url?: string;
  photo_proof_url?: string;
  delivery_notes?: string;
  delivered_at: string;
  status: 'delivered' | 'partially_delivered' | 'rejected' | 'disputed';
  created_at: string;
  updated_at: string;
}

export interface LogisticsFuelLogRecord {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  driver_id?: string;
  liters: number;
  cost: number;
  odometer_reading: number;
  station_name?: string;
  logged_at: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
