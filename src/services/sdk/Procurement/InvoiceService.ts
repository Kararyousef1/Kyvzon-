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

class SupplierInvoiceService extends BaseService<SupplierInvoiceRecord> {
  constructor() { super('supplier_invoices'); }

  async match(invoiceId: string): Promise<MatchingResultRecord[]> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('match_invoice', { p_invoice_id: invoiceId });
    if (error) throw new Error(error.message);
    return data as any;
  }

  async detectDuplicate(supplierId: string, invoiceNumber: string, totalAmount: number, invoiceDate: string): Promise<Array<{ duplicate_id: string; reason: string; similarity: number }>> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('detect_duplicate_invoice', {
      p_tenant_id: (await import('../BaseService').then(m=>m.getCurrentTenantId())) || null,
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
}

class MatchingResultService extends BaseService<MatchingResultRecord> {
  constructor() { super('procurement_matching_results'); }
  async findByInvoice(invoiceId: string): Promise<MatchingResultRecord[]> {
    return this.findAll({ filters: { invoice_id: invoiceId }, limit: 100 });
  }
}

export const supplierInvoiceService = new SupplierInvoiceService();
export const matchingResultService = new MatchingResultService();
