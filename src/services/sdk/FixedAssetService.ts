import { BaseService } from './BaseService';
class FixedAssetService extends BaseService<any> {
  constructor() { super('fixed_assets'); }
  async findActive() { return this.findAll({ filters: { status: 'active' }, orderBy: 'asset_name' }); }
  async calculateDepreciation(assetId: string) { return this.update(assetId, { last_depreciation_run: new Date().toISOString() } as any); }
}
export const fixedAssetService = new FixedAssetService();
