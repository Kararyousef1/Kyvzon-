import { BaseService } from './BaseService';
import type { LogisticsVehicleRecord, LogisticsDriverRecord, LogisticsMaintenanceRecord } from '../../shared/types/logistics-fleet';

class LogisticsVehicleService extends BaseService<LogisticsVehicleRecord> {
  constructor() {
    super('logistics_vehicles');
  }

  async findAvailableVehicles(): Promise<LogisticsVehicleRecord[]> {
    return this.findWhere([{ column: 'status', value: 'available' }], { orderBy: 'vehicle_code', ascending: true });
  }
}

class LogisticsDriverService extends BaseService<LogisticsDriverRecord> {
  constructor() {
    super('logistics_drivers');
  }

  async findActiveDrivers(): Promise<LogisticsDriverRecord[]> {
    return this.findWhere([{ column: 'status', value: 'active' }], { orderBy: 'driver_name_ar', ascending: true });
  }
}

class LogisticsMaintenanceService extends BaseService<LogisticsMaintenanceRecord> {
  constructor() {
    super('logistics_maintenance');
  }

  async findPendingMaintenance(): Promise<LogisticsMaintenanceRecord[]> {
    return this.findWhere([{ column: 'status', operator: 'in', value: ['scheduled', 'in_progress'] }], { orderBy: 'scheduled_date', ascending: true });
  }
}

export const logisticsVehicleService = new LogisticsVehicleService();
export const logisticsDriverService = new LogisticsDriverService();
export const logisticsMaintenanceService = new LogisticsMaintenanceService();
