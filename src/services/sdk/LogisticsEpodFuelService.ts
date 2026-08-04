import { BaseService } from './BaseService';
import type { LogisticsEpodRecord, LogisticsFuelLogRecord } from '../../shared/types/logistics-epod-fuel';

class LogisticsEpodService extends BaseService<LogisticsEpodRecord> {
  constructor() {
    super('logistics_epod');
  }

  async findRecentDeliveries(): Promise<LogisticsEpodRecord[]> {
    return this.findWhere([], { orderBy: 'delivered_at', ascending: false });
  }
}

class LogisticsFuelService extends BaseService<LogisticsFuelLogRecord> {
  constructor() {
    super('logistics_fuel_logs');
  }

  async findRecentFuelLogs(): Promise<LogisticsFuelLogRecord[]> {
    return this.findWhere([], { orderBy: 'logged_at', ascending: false });
  }
}

export const logisticsEpodService = new LogisticsEpodService();
export const logisticsFuelService = new LogisticsFuelService();
