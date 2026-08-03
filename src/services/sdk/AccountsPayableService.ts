import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

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

export interface ApInvoiceLineInput {
  account_id: string;
  description?: string;
  quantity: number;
  unit_price: number;
  line_amount: number;
  tax_amount?: number;
  total_amount: number;
  cost_center_id?: string;
  project_id?: string;
}

export interface ApInvoiceBoardRecord extends AccountsPayableRecord {
  entity_code?: string;
  entity_name?: string;
  vendor_code?: string | null;
  vendor_display_name?: string | null;
  line_count: number;
  lines_total: number;
  outstanding_amount: number;
  days_past_due: number;
}
export interface ApInvoiceLineBoardRecord {
  id: string; tenant_id: string; legal_entity_id: string; ap_invoice_id: string; line_number: number;
  account_id: string; account_code: string; account_name: string; description?: string | null;
  quantity: number; unit_price: number; line_amount: number; tax_amount: number; total_amount: number;
  cost_center_id?: string | null; cost_center_code?: string | null; cost_center_name?: string | null;
  project_id?: string | null; project_code?: string | null; project_name?: string | null;
}
export interface ApDashboardRecord { tenant_id:string; legal_entity_id:string; entity_code:string; entity_name:string; draft_invoices:number; submitted_invoices:number; approved_invoices:number; payment_progress_invoices:number; voided_invoices:number; total_outstanding:number; overdue_outstanding:number; active_vendors:number; }

class VendorService extends BaseService<VendorRecord> {
  constructor() { super('vendors'); }
  async findActiveForEntity(legalEntityId: string) {
    return this.findAll({ filters: { legal_entity_id: legalEntityId, is_active: true }, orderBy: 'name_ar' });
  }
  async findForEntity(legalEntityId: string): Promise<VendorRecord[]> {
    const { data, error } = await supabase.from('finance_vendor_lookup').select('*').eq('legal_entity_id', legalEntityId).order('vendor_code');
    if (error) throw new Error(error.message);
    return (data || []) as VendorRecord[];
  }
  async upsert(input: { legalEntityId:string; vendorCode:string; nameAr:string; nameEn?:string; taxNumber?:string; registrationNumber?:string; email?:string; phone?:string; paymentTermsDays?:number; currencyCode?:string }): Promise<VendorRecord> {
    const { data, error } = await supabase.rpc('upsert_finance_vendor', {
      p_legal_entity_id: input.legalEntityId,
      p_vendor_code: input.vendorCode,
      p_name_ar: input.nameAr,
      p_name_en: input.nameEn || null,
      p_tax_number: input.taxNumber || null,
      p_registration_number: input.registrationNumber || null,
      p_email: input.email || null,
      p_phone: input.phone || null,
      p_payment_terms_days: input.paymentTermsDays ?? 30,
      p_currency_code: input.currencyCode || 'IQD',
    });
    if (error) throw new Error(error.message);
    return data as VendorRecord;
  }
  async updateStatus(vendorId: string, isActive: boolean, reason: string): Promise<VendorRecord> {
    const { data, error } = await supabase.rpc('update_finance_vendor_status', { p_vendor_id: vendorId, p_is_active: isActive, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as VendorRecord;
  }
}

class AccountsPayableService extends BaseService<AccountsPayableRecord> {
  constructor() { super('accounts_payable'); }
  async findForEntity(legalEntityId: string) {
    return this.findAll({ filters: { legal_entity_id: legalEntityId }, orderBy: 'invoice_date', ascending: false });
  }
  async findBoard(legalEntityId: string): Promise<ApInvoiceBoardRecord[]> {
    const { data, error } = await supabase.from('finance_ap_invoice_board').select('*').eq('legal_entity_id', legalEntityId).order('invoice_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as ApInvoiceBoardRecord[];
  }
  async findLines(invoiceId: string): Promise<ApInvoiceLineBoardRecord[]> {
    const { data, error } = await supabase.from('finance_ap_invoice_line_board').select('*').eq('ap_invoice_id', invoiceId).order('line_number');
    if (error) throw new Error(error.message);
    return (data || []) as ApInvoiceLineBoardRecord[];
  }
  async findDashboard(legalEntityId?: string): Promise<ApDashboardRecord[]> {
    let query = supabase.from('finance_ap_dashboard').select('*').order('entity_code');
    if (legalEntityId) query = query.eq('legal_entity_id', legalEntityId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as ApDashboardRecord[];
  }
  async setStatus(id: string, status: 'submitted' | 'approved' | 'voided', reason: string): Promise<AccountsPayableRecord> {
    const { data, error } = await supabase.rpc('set_ap_invoice_lifecycle_status', { p_invoice_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as AccountsPayableRecord;
  }
  async submit(id: string, reason: string) { return this.setStatus(id, 'submitted', reason); }
  async approve(id: string, reason: string) { return this.setStatus(id, 'approved', reason); }
  async void(id: string, reason: string) { return this.setStatus(id, 'voided', reason); }
  async getAging(legalEntityId: string, asOfDate: string) {
    const { data, error } = await supabase.rpc('get_ap_aging', { p_legal_entity_id: legalEntityId, p_as_of_date: asOfDate });
    if (error) throw new Error(error.message);
    return data || [];
  }
  async createInvoice(input: { legalEntityId: string; vendorId: string; invoiceNumber: string; invoiceDate: string; dueDate?: string; amount: number; currencyCode: string; exchangeRate?: number; notes?: string; }): Promise<AccountsPayableRecord> {
    const { data, error } = await supabase.rpc('create_ap_invoice', {
      p_legal_entity_id: input.legalEntityId, p_vendor_id: input.vendorId, p_invoice_number: input.invoiceNumber,
      p_invoice_date: input.invoiceDate, p_due_date: input.dueDate || null, p_amount: input.amount,
      p_currency_code: input.currencyCode, p_exchange_rate: input.exchangeRate ?? 1, p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return data as AccountsPayableRecord;
  }
  async createInvoiceWithLines(input: { legalEntityId:string; vendorId:string; invoiceNumber:string; invoiceDate:string; dueDate?:string; currencyCode:string; exchangeRate?:number; notes?:string; lines:ApInvoiceLineInput[] }): Promise<AccountsPayableRecord> {
    const { data, error } = await supabase.rpc('create_ap_invoice_with_lines', {
      p_legal_entity_id: input.legalEntityId,
      p_vendor_id: input.vendorId,
      p_invoice_number: input.invoiceNumber,
      p_invoice_date: input.invoiceDate,
      p_due_date: input.dueDate || null,
      p_currency_code: input.currencyCode,
      p_exchange_rate: input.exchangeRate ?? 1,
      p_notes: input.notes || null,
      p_lines: input.lines,
    });
    if (error) throw new Error(error.message);
    return data as AccountsPayableRecord;
  }
}

export const vendorService = new VendorService();
export const accountsPayableService = new AccountsPayableService();
