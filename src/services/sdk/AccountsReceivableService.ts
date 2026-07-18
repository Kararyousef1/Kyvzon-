import { BaseService } from './BaseService';
class AccountsReceivableService extends BaseService<any> {
  constructor() { super('accounts_receivable'); }
}
export const accountsReceivableService = new AccountsReceivableService();
