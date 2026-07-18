import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface BudgetRecord {
  id: string;
  tenant_id: string;
  budget_name: string;
  fiscal_year: number;
  start_date?: string | null;
  end_date?: string | null;
  status: 'draft' | 'approved' | 'closed';
  created_at: string;
}

export interface BudgetLineRecord {
  id: string;
  budget_id: string;
  account_id: string;
  budget_amount: number;
  created_at: string;
}

class BudgetService extends BaseService<BudgetRecord> {
  constructor() { super('budgets'); }

  async findWithLines(budgetId: string): Promise<{ budget: BudgetRecord, lines: BudgetLineRecord[] }> {
    const { data: budget, error } = await supabase.from('budgets').select('*').eq('id', budgetId).single();
    if (error) throw new Error(error.message);
    const { data: lines } = await supabase.from('budget_lines').select('*').eq('budget_id', budgetId);
    return { budget: budget as BudgetRecord, lines: (lines as BudgetLineRecord[]) || [] };
  }

  async calculateVariance(budgetId: string): Promise<Array<{ account_id: string, budget_amount: number, actual_amount: number, variance: number }>> {
    // Try RPC, fallback to 0 actual
    const { data, error } = await supabase.rpc('calculate_budget_variance' as any, { p_budget_id: budgetId });
    if (!error && data) return data as any;
    const { data: lines } = await supabase.from('budget_lines').select('*').eq('budget_id', budgetId);
    return ((lines as BudgetLineRecord[]) || []).map(l => ({
      account_id: l.account_id,
      budget_amount: Number(l.budget_amount),
      actual_amount: 0,
      variance: -Number(l.budget_amount),
    }));
  }
}

export const budgetService = new BudgetService();
