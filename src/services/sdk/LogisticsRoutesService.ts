import { BaseService } from './BaseService';
import type { LogisticsRouteRecord, LogisticsTelemetryRecord } from '../../shared/types/logistics-routes';

class LogisticsRouteService extends BaseService<LogisticsRouteRecord> {
  constructor() {
    super('logistics_routes');
  }

  async findActiveRoutes(): Promise<LogisticsRouteRecord[]> {
    return this.findWhere([{ column: 'status', operator: 'in', value: ['planned', 'optimized', 'in_progress'] }], { orderBy: 'created_at', ascending: false });
  }
}

class LogisticsTelemetryService extends BaseService<LogisticsTelemetryRecord> {
  constructor() {
    super('logistics_telemetry');
  }

  async findLatestByVehicle(vehicleId: string): Promise<LogisticsTelemetryRecord | null> {
    const rows = await this.findWhere([{ column: 'vehicle_id', value: vehicleId }], { orderBy: 'recorded_at', ascending: false });
    return rows && rows.length > 0 ? rows[0] : null;
  }
}

export const logisticsRouteService = new LogisticsRouteService();
export const logisticsTelemetryService = new LogisticsTelemetryService();
