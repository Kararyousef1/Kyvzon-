/**
 * PurchaseOrderService + GoodsReceiptService + RTV — Unit 04 — 100% حقيقي
 */

import { BaseService } from '../BaseService';

export interface PurchaseOrderRecord {
  id: string;
  tenant_id: string;
  po_number: string;
  supplier_id: string;
  pr_id?: string | null;
  po_type: 'standard' | 'blanket' | 'consolidated' | 'open' | 'emergency';
  status: 'draft' | 'approved' | 'sent' | 'acknowledged' | 'shipped' | 'partially_received' | 'received' | 'closed' | 'cancelled';
  total_before_tax: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency_code: string;
  delivery_date?: string | null;
  delivery_location?: string | null;
  incoterms: string;
  payment_terms: string;
  early_discount_percent?: number | null;
  early_discount_days?: number | null;
  late_penalty_percent_per_week?: number | null;
  tracking_number?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoLineItemRecord {
  id: string;
  tenant_id: string;
  po_id: string;
  pr_line_item_id?: string | null;
  item_code?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  received_quantity: number;
  pending_quantity: number;
}

export interface GoodsReceiptRecord {
  id: string;
  tenant_id: string;
  gr_number: string;
  po_id: string;
  received_at: string;
  received_by?: string | null;
  delivery_note_number?: string | null;
  total_packages?: number | null;
  has_damage: boolean;
  status: 'draft' | 'quality_hold' | 'posted' | 'cancelled';
  created_at: string;
}

export interface GrLineItemRecord {
  id: string;
  tenant_id: string;
  gr_id: string;
  po_line_item_id: string;
  ordered_qty: number;
  received_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  lot_number?: string | null;
  expiry_date?: string | null;
  location?: string | null;
}

class PurchaseOrderService extends BaseService<PurchaseOrderRecord> {
  constructor() { super('purchase_orders'); }

  async createFromPr(prId: string, supplierId: string, poType: string = 'standard'): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('create_po_from_pr', {
      p_pr_id: prId,
      p_supplier_id: supplierId,
      p_po_type: poType,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async createManual(input: { supplier_id: string; po_type: string; currency_code?: string; delivery_date?: string; delivery_location?: string; incoterms?: string; payment_terms?: string; lines: Array<{ item_code?: string; description: string; quantity: number; unit?: string; unit_price: number; specification?: Record<string, unknown> }> }): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('create_purchase_order_manual', {
      p_supplier_id: input.supplier_id,
      p_po_type: input.po_type,
      p_currency_code: input.currency_code || 'SAR',
      p_delivery_date: input.delivery_date || null,
      p_delivery_location: input.delivery_location || null,
      p_incoterms: input.incoterms || 'DDP',
      p_payment_terms: input.payment_terms || 'Net45',
      p_lines: input.lines as any,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async send(poId: string, trackingNumber?: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('mark_po_sent', { p_po_id: poId, p_tracking_number: trackingNumber || null });
    if (error) throw new Error(error.message);
  }

  async acknowledge(poId: string, trackingNumber?: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('acknowledge_po', { p_po_id: poId, p_tracking_number: trackingNumber || null });
    if (error) throw new Error(error.message);
  }

  async updateTracking(poId: string, status: string, trackingNumber?: string, deliveryDate?: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('update_po_tracking', { p_po_id: poId, p_status: status, p_tracking_number: trackingNumber || null, p_delivery_date: deliveryDate || null });
    if (error) throw new Error(error.message);
  }

  async findByStatus(status: string): Promise<PurchaseOrderRecord[]> {
    return this.findAll({ filters: { status }, orderBy: 'delivery_date', limit: 100 });
  }
}

class PoLineItemService extends BaseService<PoLineItemRecord> {
  constructor() { super('po_line_items'); }
  async findByPo(poId: string): Promise<PoLineItemRecord[]> {
    return this.findAll({ filters: { po_id: poId }, limit: 100 });
  }
}

class GoodsReceiptService extends BaseService<GoodsReceiptRecord> {
  constructor() { super('goods_receipts'); }

  async receive(poId: string, deliveryNote: string, totalPackages: number, hasDamage: boolean, damageNotes: string, items: Array<{ po_line_item_id: string; received_qty: number; accepted_qty?: number; lot_number?: string; expiry_date?: string; location?: string }>): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('receive_goods', {
      p_po_id: poId,
      p_delivery_note_number: deliveryNote,
      p_total_packages: totalPackages,
      p_has_damage: hasDamage,
      p_damage_notes: damageNotes,
      p_items: items as any,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async post(grId: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('post_goods_receipt', { p_gr_id: grId });
    if (error) throw new Error(error.message);
  }

  async decideIqc(grId: string, status: 'approved' | 'rejected' | 'partial', notes?: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('decide_iqc_inspection', { p_gr_id: grId, p_status: status, p_notes: notes || null });
    if (error) throw new Error(error.message);
  }
}

class IqcInspectionService extends BaseService<any> {
  constructor() { super('iqc_inspections'); }
  async findByGr(grId: string): Promise<any | null> {
    return this.findOne('gr_id', grId);
  }
}

class InventoryTransactionService extends BaseService<any> {
  constructor() { super('inventory_transactions'); }
  async findRecent(limit = 100): Promise<any[]> {
    return this.findAll({ orderBy: 'created_at', ascending: false, limit });
  }
}

class PoOtifAlertService extends BaseService<any> {
  constructor() { super('po_otif_alerts'); }
  async detectLate(): Promise<number> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('detect_late_po_alerts');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

class GrLineItemService extends BaseService<GrLineItemRecord> {
  constructor() { super('gr_line_items'); }
  async findByGr(grId: string): Promise<GrLineItemRecord[]> {
    return this.findAll({ filters: { gr_id: grId }, limit: 100 });
  }
}

class RtvService extends BaseService<any> {
  constructor() { super('return_to_vendor'); }
  async createRtv(grId: string, poId: string, qty: number, reason: string, details: string, lot?: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('create_rtv', {
      p_gr_id: grId,
      p_po_id: poId,
      p_quantity: qty,
      p_reason: reason,
      p_details: details,
      p_lot_number: lot || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export const purchaseOrderService = new PurchaseOrderService();
export const poLineItemService = new PoLineItemService();
export const goodsReceiptService = new GoodsReceiptService();
export const grLineItemService = new GrLineItemService();
export const iqcInspectionService = new IqcInspectionService();
export const inventoryTransactionService = new InventoryTransactionService();
export const poOtifAlertService = new PoOtifAlertService();
export const rtvService = new RtvService();
