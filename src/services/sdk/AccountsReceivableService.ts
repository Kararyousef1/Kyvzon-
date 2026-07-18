import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface CustomerRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  customer_code: string;
  name_ar: string;
  name_en?: string | null;
  tax_number?: string | null;
  email?: string | null;
  phone?: string | null;
  payment_terms_days: number;
  currency_code: string;
  is_active: boolean;
  created_at: string;
}

export interface AccountsReceivableRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  currency_code: string;
  exchange_rate: number;
  total_amount: number;
  amount_received: number;
  status: 'draft' | 'submitted' | 'approved' | 'partially_received' | 'paid' | 'overdue' | 'voided';
  notes?: string | null;
  created_at: string;
}

class CustomerService extends BaseService<CustomerRecord> {
  constructor() { super('customers'); }

  async findActiveForEntity(legalEntityId: string): Promise<CustomerRecord[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('legal_entity_id', legalEntityId)
      .eq('is_active', true)
      .order('customer_code');
    if (error) throw new Error(error.message);
    return (data as CustomerRecord[]) || [];
  }
}

class AccountsReceivableService extends BaseService<AccountsReceivableRecord> {
  constructor() { super('accounts_receivable'); }

  async findForEntity(legalEntityId: string): Promise<AccountsReceivableRecord[]> {
    const { data, error } = await supabase
      .from('accounts_receivable')
      .select('*')
      .eq('legal_entity_id', legalEntityId)
      .order('invoice_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as AccountsReceivableRecord[]) || [];
  }

  async getAging(legalEntityId: string, asOfDate: string): Promise<Array<{
    customer_id: string;
    customer_name: string;
    current_amount: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_over_90: number;
    total_outstanding: number;
  }>> {
    const { data, error } = await supabase.rpc('get_ar_aging', {
      p_legal_entity_id: legalEntityId,
      p_as_of_date: asOfDate,
    });
    if (error) {
      // Fallback to client-side calc if RPC not exists yet
      const invoices = await this.findForEntity(legalEntityId);
      const map = new Map<string, any>();
      for (const inv of invoices) {
        const outstanding = Number(inv.total_amount) - Number(inv.amount_received);
        if (outstanding <= 0) continue;
        const existing = map.get(inv.customer_id) || {
          customer_id: inv.customer_id,
          customer_name: inv.customer_id.slice(0,8),
          current_amount: 0,
          days_1_30: 0,
          days_31_60: 0,
          days_61_90: 0,
          days_over_90: 0,
          total_outstanding: 0,
        };
        existing.total_outstanding += outstanding;
        existing.current_amount += outstanding;
        map.set(inv.customer_id, existing);
      }
      return Array.from(map.values());
    }
    return data as any;
  }
}

export const customerService = new CustomerService();
export const accountsReceivableService = new AccountsReceivableService();
