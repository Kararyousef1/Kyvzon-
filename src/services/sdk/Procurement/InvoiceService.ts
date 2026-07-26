/**
 * InvoiceService — Unit 05 — الفواتير والمطابقة الثلاثية — 100% حقيقي
 */

import { BaseService } from '../BaseService';

export interface SupplierInvoiceRecord {
  id: string;
  tenant_id: string;
  invoice_number: string;
  supplier_id: string;
  po_id?: string | null;
  invoice_date: string;
  amount_before_tax: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency_code?: string | null;
  payment_due_date?: string | null;
  payment_terms: string;
  bank_account?: string | null;
  source: 'email' | 'supplier_portal' | 'edi' | 'manual' | 'ocr';
  ocr_confidence?: number | null;
  status: 'pending_match' | 'matched' | 'tolerance' | 'exception' | 'disputed' | 'approved' | 'paid' | 'cancelled';
  duplicate_status: 'clean' | 'suspected_duplicate' | 'confirmed_duplicate';
  created_at: string;
  updated_at: string;
}

export interface MatchingResultRecord {
  id: string;
  tenant_id: string;
  invoice_id: string;
  po_id?: string | null;
  gr_id?: string | null;
  match_type: '2way' | '3way' | '4way';
  status: 'matched' | 'tolerance' | 'exception';
  price_variance: number;
  price_variance_percent: number;
  qty_variance: number;
  qty_variance_percent: number;
  tolerance_applied: boolean;
  auto_approved: boolean;
  exception_reason?: string | null;
}

export interface CreateInvoiceLineInput {
  po_line_item_id?: string;
  gr_line_item_id?: string;
  item_code?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface CreateInvoiceInput {
  supplier_id: string;
  po_id?: string | null;
  invoice_number: string;
  invoice_date: string;
  amount_before_tax: number;
  tax_rate?: number;
  currency_code?: string;
  payment_due_date?: string | null;
  payment_terms?: string;
  bank_account?: string;
  source?: 'email' | 'supplier_portal' | 'edi' | 'manual' | 'ocr';
  lines: CreateInvoiceLineInput[];
}

class SupplierInvoiceService extends BaseService<SupplierInvoiceRecord> {
  constructor() { super('supplier_invoices'); }

  async createWithLines(input: CreateInvoiceInput): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('create_supplier_invoice_full', {
      p_supplier_id: input.supplier_id,
      p_po_id: input.po_id || null,
      p_invoice_number: input.invoice_number,
      p_invoice_date: input.invoice_date,
      p_amount_before_tax: input.amount_before_tax,
      p_tax_rate: input.tax_rate ?? 15,
      p_currency_code: input.currency_code || 'SAR',
      p_payment_due_date: input.payment_due_date || null,
      p_payment_terms: input.payment_terms || 'Net45',
      p_bank_account: input.bank_account || null,
      p_source: input.source || 'manual',
      p_lines: input.lines as any,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async match(invoiceId: string): Promise<MatchingResultRecord[]> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('match_invoice', { p_invoice_id: invoiceId });
    if (error) throw new Error(error.message);
    return data as any;
  }

  async detectDuplicate(supplierId: string, invoiceNumber: string, totalAmount: number, invoiceDate: string): Promise<Array<{ duplicate_id: string; reason: string; similarity: number }>> {
    const { supabase } = await import('../../supabase/supabase');
    // P0 security: لا نمرر tenant_id من العميل. RPC تستخدم current_user_tenant_id() داخلياً.
    const { data, error } = await supabase.rpc('detect_duplicate_invoice', {
      p_supplier_id: supplierId,
      p_invoice_number: invoiceNumber,
      p_total_amount: totalAmount,
      p_invoice_date: invoiceDate,
    });
    if (error) throw new Error(error.message);
    return data as any;
  }

  async findExceptions(): Promise<SupplierInvoiceRecord[]> {
    return this.findAll({ filters: { status: 'exception' }, orderBy: 'invoice_date', ascending: false, limit: 100 });
  }

  async resolveException(invoiceId: string, action: 'approve_tolerance' | 'request_credit_note' | 'request_revised_invoice' | 'dispute' | 'resolve' | 'cancel', notes?: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('resolve_invoice_exception', { p_invoice_id: invoiceId, p_action: action, p_notes: notes || null });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async approveForPayment(invoiceId: string, notes?: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('approve_invoice_for_payment', { p_invoice_id: invoiceId, p_notes: notes || null });
    if (error) throw new Error(error.message);
  }

  async recordPayment(invoiceId: string, reference: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('record_invoice_payment', { p_invoice_id: invoiceId, p_payment_reference: reference });
    if (error) throw new Error(error.message);
  }

  async dynamicDiscountOptions(invoiceId: string): Promise<Array<{ option_label: string; pay_date: string; discount_percent: number; pay_amount: number; saving: number }>> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('invoice_dynamic_discount_options', { p_invoice_id: invoiceId });
    if (error) throw new Error(error.message);
    return data as any;
  }
}

class MatchingResultService extends BaseService<MatchingResultRecord> {
  constructor() { super('procurement_matching_results'); }
  async findByInvoice(invoiceId: string): Promise<MatchingResultRecord[]> {
    return this.findAll({ filters: { invoice_id: invoiceId }, limit: 100 });
  }
}

export const supplierInvoiceService = new SupplierInvoiceService();
export const matchingResultService = new MatchingResultService();
