import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface VendorPaymentRecord {
  id: string; tenant_id: string; legal_entity_id: string; vendor_id: string;
  payment_number: string; payment_date: string; amount: number; currency_code: string;
  reference?: string | null; status: 'draft' | 'posted' | 'voided'; created_at: string;
  posted_at?: string | null; posted_by?: string | null; voided_at?: string | null; voided_by?: string | null; void_reason?: string | null;
}
export interface VendorPaymentBoardRecord extends VendorPaymentRecord { entity_code?: string; entity_name?: string; vendor_code?: string; vendor_name?: string; allocation_count: number; allocated_total: number; }
export interface VendorPaymentAllocationInput { ap_invoice_id: string; allocated_amount: number; }
export interface VendorPaymentAllocationBoardRecord { id:string; tenant_id:string; legal_entity_id:string; payment_id:string; ap_invoice_id:string; allocated_amount:number; payment_number:string; invoice_number:string; vendor_name?:string; invoice_amount:number; invoice_paid:number; }

class VendorPaymentService extends BaseService<VendorPaymentRecord> {
  constructor() { super('vendor_payments'); }
  async findForEntity(legalEntityId: string) { return this.findAll({ filters: { legal_entity_id: legalEntityId }, orderBy: 'payment_date', ascending: false }); }
  async findBoard(legalEntityId: string): Promise<VendorPaymentBoardRecord[]> {
    const { data, error } = await supabase.from('finance_vendor_payment_board').select('*').eq('legal_entity_id', legalEntityId).order('payment_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as VendorPaymentBoardRecord[];
  }
  async findAllocations(paymentId: string): Promise<VendorPaymentAllocationBoardRecord[]> {
    const { data, error } = await supabase.from('finance_vendor_payment_allocation_board').select('*').eq('payment_id', paymentId).order('invoice_number');
    if (error) throw new Error(error.message);
    return (data || []) as VendorPaymentAllocationBoardRecord[];
  }
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
  async post(id: string, reason = 'ترحيل دفعة مورد'): Promise<VendorPaymentRecord> {
    return this.postWithReason(id, reason);
  }
  async postWithReason(id: string, reason: string): Promise<VendorPaymentRecord> {
    const { data, error } = await supabase.rpc('post_vendor_payment_with_reason', { p_payment_id: id, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as VendorPaymentRecord;
  }
  async void(id: string, reason: string): Promise<VendorPaymentRecord> {
    const { data, error } = await supabase.rpc('void_vendor_payment', { p_payment_id: id, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as VendorPaymentRecord;
  }
}
export const vendorPaymentService = new VendorPaymentService();
