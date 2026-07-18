import { BaseService } from './BaseService';

export type PayableStatus = 'draft' | 'submitted' | 'approved' | 'partially_paid' | 'paid' | 'overdue' | 'voided';

export interface VendorRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  vendor_code: string;
  name_ar: string;
  name_en?: string | null;
  tax_number?: string | null;
  registration_number?: string | null;
  email?: string | null;
  phone?: string | null;
  payment_terms_days: number;
  currency_code: string;
  is_active: boolean;
}

export interface AccountsPayableRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  vendor_id?: string | null;
  invoice_number: string;
  vendor_name?: string | null;
  invoice_date: string;
  due_date?: string | null;
  amount: number;
  amount_paid: number;
  currency_code: string;
  exchange_rate: number;
  status: PayableStatus;
  approved_at?: string | null;
  approved_by?: string | null;
  posted_journal_entry_id?: string | null;
  notes?: string | null;
  created_at: string;
}

class VendorService extends BaseService<VendorRecord> {
  constructor() { super('vendors'); }
  async findActiveForEntity(legalEntityId: string) {
    return this.findAll({ filters: { legal_entity_id: legalEntityId, is_active: true }, orderBy: 'name_ar' });
  }
}

class AccountsPayableService extends BaseService<AccountsPayableRecord> {
  constructor() { super('accounts_payable'); }
  async findForEntity(legalEntityId: string) {
    return this.findAll({ filters: { legal_entity_id: legalEntityId }, orderBy: 'invoice_date', ascending: false });
  }
  async setStatus(id: string, status: 'submitted' | 'approved' | 'voided', reason?: string): Promise<AccountsPayableRecord> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('set_ap_invoice_status', { p_invoice_id: id, p_status: status, p_reason: reason || null });
    if (error) throw new Error(error.message);
    return data as AccountsPayableRecord;
  }
  async submit(id: string) { return this.setStatus(id, 'submitted'); }
  async approve(id: string) { return this.setStatus(id, 'approved'); }
  async void(id: string, reason: string) { return this.setStatus(id, 'voided', reason); }
  async getAging(legalEntityId: string, asOfDate: string) {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('get_ap_aging', { p_legal_entity_id: legalEntityId, p_as_of_date: asOfDate });
    if (error) throw new Error(error.message);
    return data || [];
  }
  async createInvoice(input: { legalEntityId: string; vendorId: string; invoiceNumber: string; invoiceDate: string; dueDate?: string; amount: number; currencyCode: string; exchangeRate?: number; notes?: string; }): Promise<AccountsPayableRecord> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('create_ap_invoice', {
      p_legal_entity_id: input.legalEntityId, p_vendor_id: input.vendorId, p_invoice_number: input.invoiceNumber,
      p_invoice_date: input.invoiceDate, p_due_date: input.dueDate || null, p_amount: input.amount,
      p_currency_code: input.currencyCode, p_exchange_rate: input.exchangeRate ?? 1, p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return data as AccountsPayableRecord;
  }
}

export const vendorService = new VendorService();
export const accountsPayableService = new AccountsPayableService();
