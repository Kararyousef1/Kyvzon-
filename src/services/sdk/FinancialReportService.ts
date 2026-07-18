import { supabase } from '../supabase/supabase';

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_name_ar?: string | null;
  account_type: string;
  debit_balance: number;
  credit_balance: number;
}

export interface GeneralLedgerRow {
  entry_id: string;
  entry_number: string;
  entry_date: string;
  description?: string | null;
  reference?: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

export class FinancialReportService {
  async getGeneralLedger(legalEntityId: string, accountId: string, fromDate?: string, toDate?: string): Promise<GeneralLedgerRow[]> {
    const { data, error } = await supabase.rpc('get_general_ledger', { p_legal_entity_id: legalEntityId, p_account_id: accountId, p_from_date: fromDate || null, p_to_date: toDate || null });
    if (error) throw new Error(error.message);
    return (data || []) as GeneralLedgerRow[];
  }

  async getTrialBalance(legalEntityId: string, fromDate?: string, toDate?: string): Promise<TrialBalanceRow[]> {
    const { data, error } = await supabase.rpc('get_trial_balance', {
      p_legal_entity_id: legalEntityId,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
    });
    if (error) throw new Error(error.message);
    return (data || []) as TrialBalanceRow[];
  }
}

export const financialReportService = new FinancialReportService();
