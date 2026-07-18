import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface VendorPaymentRecord {
  id: string; tenant_id: string; legal_entity_id: string; vendor_id: string;
  payment_number: string; payment_date: string; amount: number; currency_code: string;
  reference?: string | null; status: 'draft' | 'posted' | 'voided'; created_at: string;
}
export interface VendorPaymentAllocationInput { ap_invoice_id: string; allocated_amount: number; }

class VendorPaymentService extends BaseService<VendorPaymentRecord> {
  constructor() { super('vendor_payments'); }
  async findForEntity(legalEntityId: string) { return this.findAll({ filters: { legal_entity_id: legalEntityId }, orderBy: 'payment_date', ascending: false }); }
  async createWithAllocations(input: Omit<VendorPaymentRecord, 'id'|'tenant_id'|'created_at'|'status'> & { allocations: VendorPaymentAllocationInput[] }) {
    const { data, error } = await supabase.rpc('create_vendor_payment_draft', {
      p_legal_entity_id: input.legal_entity_id, p_vendor_id: input.vendor_id,
      p_payment_number: input.payment_number, p_payment_date: input.payment_date,
      p_amount: input.amount, p_currency_code: input.currency_code,
      p_reference: input.reference || null, p_allocations: input.allocations,
    });
    if (error) throw new Error(error.message);
    return data as VendorPaymentRecord;
  }
  async post(id: string) { const { data, error } = await supabase.rpc('post_vendor_payment', { p_payment_id: id }); if (error) throw new Error(error.message); return data as VendorPaymentRecord; }
}
export const vendorPaymentService = new VendorPaymentService();
