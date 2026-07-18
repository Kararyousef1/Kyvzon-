import { BaseService } from './BaseService';
class CashManagementService extends BaseService<any> {
  constructor() { super('bank_accounts'); }
  async getBalance() { const all = await this.findAll(); return all.reduce((s,a:any)=>s+(a.balance||0),0); }
}
export const cashManagementService = new CashManagementService();
