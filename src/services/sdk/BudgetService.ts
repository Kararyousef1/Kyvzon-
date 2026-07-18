import { BaseService } from './BaseService';
class BudgetService extends BaseService<any> { constructor() { super('budgets'); } }
export const budgetService = new BudgetService();
