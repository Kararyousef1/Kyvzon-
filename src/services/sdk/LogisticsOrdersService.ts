import { BaseService } from './BaseService';
import type { LogisticsShipmentOrderRecord, LogisticsDispatchRecord } from '../../shared/types/logistics-orders';

class LogisticsShipmentOrderService extends BaseService<LogisticsShipmentOrderRecord> {
  constructor() {
    super('logistics_shipment_orders');
  }

  async findActiveOrders(): Promise<LogisticsShipmentOrderRecord[]> {
    return this.findWhere([{ column: 'status', operator: 'in', value: ['draft', 'scheduled', 'dispatched', 'in_transit'] }], { orderBy: 'created_at', ascending: false });
  }
}

class LogisticsDispatchService extends BaseService<LogisticsDispatchRecord> {
  constructor() {
    super('logistics_dispatches');
  }

  async findActiveDispatches(): Promise<LogisticsDispatchRecord[]> {
    return this.findWhere([{ column: 'status', operator: 'in', value: ['dispatched', 'en_route', 'arrived'] }], { orderBy: 'dispatched_at', ascending: false });
  }
}

export const logisticsShipmentOrderService = new LogisticsShipmentOrderService();
export const logisticsDispatchService = new LogisticsDispatchService();
