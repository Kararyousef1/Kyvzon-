import { BaseService } from './BaseService';
import type { LogisticsCarrierRecord, LogisticsTripCostRecord } from '../../shared/types/logistics-carriers-costs';

class LogisticsCarrierService extends BaseService<LogisticsCarrierRecord> {
  constructor() {
    super('logistics_carriers');
  }

  async findActiveCarriers(): Promise<LogisticsCarrierRecord[]> {
    return this.findWhere([{ column: 'status', value: 'active' }], { orderBy: 'carrier_name_ar', ascending: true });
  }
}

class LogisticsTripCostService extends BaseService<LogisticsTripCostRecord> {
  constructor() {
    super('logistics_trip_costs');
  }

  async findRecentCosts(): Promise<LogisticsTripCostRecord[]> {
    return this.findWhere([], { orderBy: 'created_at', ascending: false });
  }
}

export const logisticsCarrierService = new LogisticsCarrierService();
export const logisticsTripCostService = new LogisticsTripCostService();
