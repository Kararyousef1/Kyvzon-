import { BaseService } from './BaseService';
import type { MovementPolicyRecord, MovementLocationRecord } from '../../shared/types/movement-foundation';

class MovementPolicyService extends BaseService<MovementPolicyRecord> {
  constructor() {
    super('movement_policies');
  }

  async findActivePolicies(): Promise<MovementPolicyRecord[]> {
    return this.findWhere([{ column: 'is_active', value: true }], { orderBy: 'title_ar', ascending: true });
  }
}

class MovementLocationService extends BaseService<MovementLocationRecord> {
  constructor() {
    super('movement_locations');
  }

  async findActiveLocations(): Promise<MovementLocationRecord[]> {
    return this.findWhere([{ column: 'is_active', value: true }], { orderBy: 'name_ar', ascending: true });
  }
}

class LogisticsSettingsService extends BaseService<any> {
  constructor() {
    super('logistics_settings');
  }
}

export const movementPolicyService = new MovementPolicyService();
export const movementLocationService = new MovementLocationService();
export const logisticsSettingsService = new LogisticsSettingsService();
