import { BaseService } from './BaseService';
class RevenueRecognitionService extends BaseService<any> {
  constructor() { super('revenue_contracts'); }
  async findActive() { return this.findAll({ filters: { status: 'active' }, orderBy: 'contract_start', ascending: false }); }
  async createContract(data: Partial<any>) { return this.create(data); }
  async completeContract(id: string) { return this.update(id, { status: 'completed' }); }
}
export const revenueRecognitionService = new RevenueRecognitionService();
