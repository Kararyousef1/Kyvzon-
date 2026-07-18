import { BaseService } from './BaseService';
class IntercompanyService extends BaseService<any> {
  constructor() { super('intercompany_transactions'); }
  async findPending() { return this.findAll({ filters: { status: 'pending' }, orderBy: 'created_at', ascending: false }); }
}
export const intercompanyService = new IntercompanyService();
