import { BaseService } from './BaseService';
class AccountsPayableService extends BaseService<any> {
  constructor() { super('accounts_payable'); }
}
export const accountsPayableService = new AccountsPayableService();
