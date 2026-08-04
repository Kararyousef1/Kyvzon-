export interface LogisticsRouteRecord {
  id: string;
  tenant_id: string;
  route_code: string;
  route_name: string;
  dispatch_id?: string;
  waypoints_json: any[];
  total_distance_km: number;
  estimated_duration_min: number;
  status: 'planned' | 'optimized' | 'in_progress' | 'completed' | 'deviated';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LogisticsTelemetryRecord {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  dispatch_id?: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading?: number;
  recorded_at: string;
  created_at: string;
}
