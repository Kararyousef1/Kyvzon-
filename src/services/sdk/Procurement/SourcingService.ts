/**
 * SourcingService — التوريد الاستراتيجي RFx + مزادات (Unit 02) — 100% حقيقي
 */

import { BaseService } from '../BaseService';

export interface SourcingEventRecord {
  id: string;
  tenant_id: string;
  event_number: string;
  title: string;
  description?: string | null;
  type: 'RFI' | 'RFQ' | 'RFP' | 'auction';
  status: 'draft' | 'open' | 'closed' | 'awarded' | 'cancelled';
  related_pr_id?: string | null;
  close_date?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierBidRecord {
  id: string;
  tenant_id: string;
  event_id: string;
  supplier_id: string;
  bid_number: string;
  total_price: number;
  currency_code: string;
  lead_time_days?: number | null;
  discount_percent: number;
  effective_price: number;
  has_iso_certificate: boolean;
  delivery_performance?: number | null;
  status: 'submitted' | 'under_evaluation' | 'shortlisted' | 'awarded' | 'rejected';
  submitted_at: string;
}

export interface AuctionRecord {
  id: string;
  tenant_id: string;
  sourcing_event_id?: string | null;
  auction_number: string;
  item_description: string;
  annual_quantity: number;
  unit: string;
  auction_type: 'british' | 'japanese' | 'dutch';
  starting_price: number;
  current_best_price?: number | null;
  current_best_supplier_id?: string | null;
  start_time: string;
  end_time: string;
  extension_minutes: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  created_at: string;
}

export interface AuctionBidRecord {
  id: string;
  tenant_id: string;
  auction_id: string;
  supplier_id: string;
  bid_price: number;
  created_at: string;
}

class SourcingEventService extends BaseService<SourcingEventRecord> {
  constructor() { super('sourcing_events'); }

  async createFromPr(prId: string, type: 'RFI'|'RFQ'|'RFP'|'auction', closeDays = 7): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('create_sourcing_event_from_pr', {
      p_pr_id: prId,
      p_type: type,
      p_close_days: closeDays,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async findOpen(): Promise<SourcingEventRecord[]> {
    return this.findAll({ filters: { status: 'open' }, orderBy: 'close_date', limit: 100 });
  }
}

class SupplierBidService extends BaseService<SupplierBidRecord> {
  constructor() { super('supplier_bids'); }

  async findByEvent(eventId: string): Promise<SupplierBidRecord[]> {
    return this.findAll({ filters: { event_id: eventId }, orderBy: 'effective_price', ascending: true, limit: 100 });
  }

  async submit(eventId: string, supplierId: string, totalPrice: number, currency = 'SAR', leadTime?: number, discount = 0): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('submit_supplier_bid', {
      p_event_id: eventId,
      p_supplier_id: supplierId,
      p_total_price: totalPrice,
      p_currency_code: currency,
      p_lead_time_days: leadTime || null,
      p_discount_percent: discount,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class AuctionService extends BaseService<AuctionRecord> {
  constructor() { super('procurement_auctions'); }

  async start(sourcingEventId: string, itemDesc: string, annualQty: number, startingPrice: number, durationMin = 45): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('start_procurement_auction', {
      p_sourcing_event_id: sourcingEventId,
      p_item_description: itemDesc,
      p_annual_quantity: annualQty,
      p_starting_price: startingPrice,
      p_duration_minutes: durationMin,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async findLive(): Promise<AuctionRecord[]> {
    return this.findAll({ filters: { status: 'live' }, orderBy: 'end_time', limit: 20 });
  }

  async placeBid(auctionId: string, supplierId: string, bidPrice: number): Promise<{ is_new_best: boolean; current_best: number; extended: boolean }> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('place_auction_bid', {
      p_auction_id: auctionId,
      p_supplier_id: supplierId,
      p_bid_price: bidPrice,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      is_new_best: (row as any)?.is_new_best ?? true,
      current_best: (row as any)?.current_best ?? bidPrice,
      extended: (row as any)?.extended ?? false,
    };
  }
}

class AuctionBidService extends BaseService<AuctionBidRecord> {
  constructor() { super('auction_bids'); }
  async findByAuction(auctionId: string): Promise<AuctionBidRecord[]> {
    return this.findAll({ filters: { auction_id: auctionId }, orderBy: 'bid_price', ascending: true, limit: 200 });
  }
}

export const sourcingEventService = new SourcingEventService();
export const supplierBidService = new SupplierBidService();
export const auctionService = new AuctionService();
export const auctionBidService = new AuctionBidService();
