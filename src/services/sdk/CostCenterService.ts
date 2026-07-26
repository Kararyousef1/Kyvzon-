import { BaseService } from './BaseService';

export interface CostCenterRecord {
  id: string;
  tenant_id: string;
  legal_entity_id?: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  parent_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

class CostCenterService extends BaseService<CostCenterRecord> {
  constructor() { super('cost_centers'); }

  async findActive(): Promise<CostCenterRecord[]> {
    return this.findAll({ filters: { is_active: true }, orderBy: 'code', ascending: true, limit: 200 });
  }
}

export const costCenterService = new CostCenterService();
