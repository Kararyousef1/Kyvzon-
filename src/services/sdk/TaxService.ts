import { BaseService } from './BaseService';
class TaxService extends BaseService<any> { constructor() { super('tax_codes'); } }
export const taxService = new TaxService();
