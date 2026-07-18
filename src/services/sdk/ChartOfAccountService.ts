import { BaseService } from './BaseService';
import type { ChartOfAccountRecord } from '../../shared/types/sdk';
class ChartOfAccountService extends BaseService<ChartOfAccountRecord> {
  constructor() { super('chart_of_accounts'); }
  async findByType(type: string): Promise<ChartOfAccountRecord[]> {
    return this.findAll({ filters: { account_type: type as any, is_active: true }, orderBy: 'code' });
  }
  async findActive(): Promise<ChartOfAccountRecord[]> {
    return this.findAll({ filters: { is_active: true }, orderBy: 'code' });
  }
}
export const chartOfAccountService = new ChartOfAccountService();
