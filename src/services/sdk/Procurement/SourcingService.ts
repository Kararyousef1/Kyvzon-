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

/** نتيجة تسجيل عرض — أُضيف auction_closed و rule_applied في 0269 */
export interface AuctionBidOutcome {
  is_new_best: boolean;
  current_best: number;
  extended: boolean;
  /** true في المزاد الهولندي عند أول قبول — المزاد انتهى */
  auction_closed: boolean;
  rule_applied: 'british' | 'japanese' | 'dutch';
}

/** حالة المزاد الحية (من auction_live_status) */
export interface AuctionLiveStatusRecord {
  auction_id: string;
  tenant_id: string;
  auction_number: string;
  item_description: string;
  auction_type: 'british' | 'japanese' | 'dutch';
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  starting_price: number;
  current_best_price: number | null;
  current_best_supplier_id: string | null;
  current_best_supplier_name: string | null;
  start_time: string;
  end_time: string;
  savings_amount: number;
  savings_percent: number;
  total_bids: number;
  active_participants: number;
  withdrawn_participants: number;
}

export interface AuctionBidRecord {
  id: string;
  tenant_id: string;
  auction_id: string;
  supplier_id: string;
  bid_price: number;
  created_at: string;
}

export interface RfxInvitationRecord {
  id: string;
  tenant_id: string;
  event_id: string;
  supplier_id: string;
  email: string;
  status: 'invited' | 'viewed' | 'responded' | 'declined' | 'expired' | 'cancelled';
  bid_id?: string | null;
  invited_at: string;
  responded_at?: string | null;
  expires_at: string;
}

export interface RfxQuestionRecord {
  id: string;
  tenant_id: string;
  event_id: string;
  supplier_id?: string | null;
  question: string;
  answer?: string | null;
  visibility: 'all_suppliers' | 'private';
  status: 'open' | 'answered' | 'closed';
  created_at: string;
  answered_at?: string | null;
}

export interface RfxTemplateRecord {
  id: string;
  tenant_id: string;
  template_name: string;
  type: 'RFI' | 'RFQ' | 'RFP' | 'auction';
  sections: Array<Record<string, unknown>>;
  default_criteria: Array<Record<string, unknown>>;
  is_active: boolean;
}

export interface RfxDocumentRecord {
  id: string;
  tenant_id: string;
  event_id: string;
  section: 'intro' | 'company' | 'scope' | 'requirements' | 'criteria' | 'timeline' | 'legal';
  title: string;
  content: string;
  weight_percent?: number | null;
}

export interface RfxEvaluationCriterionRecord {
  id: string;
  tenant_id: string;
  event_id: string;
  criterion_key: string;
  label_ar: string;
  label_en?: string | null;
  weight_percent: number;
  max_score: number;
  sort_order: number;
}

export interface RfxBidScorecardRecord {
  id: string;
  tenant_id: string;
  event_id: string;
  bid_id: string;
  evaluator_id?: string | null;
  scores: Record<string, number>;
  weighted_total: number;
  notes?: string | null;
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

  async award(bidId: string, reason?: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('award_supplier_bid', {
      p_bid_id: bidId,
      p_reason: reason || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async archiveAwardedPrice(bidId: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('archive_awarded_bid_price', { p_bid_id: bidId });
    if (error) throw new Error(error.message);
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

class RfxInvitationService extends BaseService<RfxInvitationRecord> {
  constructor() { super('rfx_supplier_invitations'); }
  async findByEvent(eventId: string): Promise<RfxInvitationRecord[]> {
    return this.findAll({ filters: { event_id: eventId }, orderBy: 'invited_at', ascending: false, limit: 200 });
  }
  async invite(eventId: string, supplierIds: string[]): Promise<number> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('invite_suppliers_to_rfx', { p_event_id: eventId, p_supplier_ids: supplierIds });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

class RfxQuestionService extends BaseService<RfxQuestionRecord> {
  constructor() { super('rfx_questions'); }
  async findByEvent(eventId: string): Promise<RfxQuestionRecord[]> {
    return this.findAll({ filters: { event_id: eventId }, orderBy: 'created_at', ascending: false, limit: 100 });
  }
  async answer(questionId: string, answer: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('answer_rfx_question', { p_question_id: questionId, p_answer: answer });
    if (error) throw new Error(error.message);
  }
}

class RfxTemplateService extends BaseService<RfxTemplateRecord> {
  constructor() { super('rfx_templates'); }
  async findActive(): Promise<RfxTemplateRecord[]> {
    return this.findAll({ filters: { is_active: true }, orderBy: 'type', limit: 100 });
  }
  async seedDefaults(): Promise<number> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('seed_default_rfx_templates');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async apply(eventId: string, templateId: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('apply_rfx_template', { p_event_id: eventId, p_template_id: templateId });
    if (error) throw new Error(error.message);
  }
}

class RfxDocumentService extends BaseService<RfxDocumentRecord> {
  constructor() { super('rfx_documents'); }
  async findByEvent(eventId: string): Promise<RfxDocumentRecord[]> {
    return this.findAll({ filters: { event_id: eventId }, orderBy: 'created_at', ascending: true, limit: 100 });
  }
}

class RfxEvaluationCriteriaService extends BaseService<RfxEvaluationCriterionRecord> {
  constructor() { super('rfx_evaluation_criteria'); }
  async findByEvent(eventId: string): Promise<RfxEvaluationCriterionRecord[]> {
    return this.findAll({ filters: { event_id: eventId }, orderBy: 'sort_order', ascending: true, limit: 50 });
  }
}

class RfxBidScorecardService extends BaseService<RfxBidScorecardRecord> {
  constructor() { super('rfx_bid_scorecards'); }
  async findByEvent(eventId: string): Promise<RfxBidScorecardRecord[]> {
    return this.findAll({ filters: { event_id: eventId }, orderBy: 'weighted_total', ascending: false, limit: 100 });
  }
  async score(bidId: string, scores: Record<string, number>, notes?: string): Promise<number> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('score_bid_mecca', { p_bid_id: bidId, p_scores: scores, p_notes: notes || null });
    if (error) throw new Error(error.message);
    return Number(data || 0);
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

  async startFromEvent(eventId: string, auctionType: 'british' | 'japanese' | 'dutch' = 'british', durationMin = 45): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('start_procurement_auction_from_event', {
      p_event_id: eventId,
      p_auction_type: auctionType,
      p_duration_minutes: durationMin,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async close(auctionId: string): Promise<string | null> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('close_procurement_auction', { p_auction_id: auctionId });
    if (error) throw new Error(error.message);
    return data as string | null;
  }

  async findLive(): Promise<AuctionRecord[]> {
    return this.findAll({ filters: { status: 'live' }, orderBy: 'end_time', limit: 20 });
  }

  /**
   * تسجيل عرض. المنطق يختلف حسب auction_type منذ المايجريشن 0269:
   *   british  — يجب أن يكون أقل من الأفضل الحالي، وضمن سقف starting_price.
   *   japanese — قبول مستوى سعري؛ نفس السعر مسموح، الأعلى مرفوض.
   *   dutch    — أول قبول يفوز ويُنهي المزاد (auction_closed = true).
   *
   * أخطاء متوقعة تظهر للمستخدم كما هي:
   *   BID_ABOVE_CEILING · BID_MUST_BE_LOWER_THAN_CURRENT ·
   *   JAPANESE_CANNOT_ACCEPT_HIGHER_LEVEL · DUTCH_AUCTION_ALREADY_ACCEPTED ·
   *   SUPPLIER_WITHDRAWN_FROM_AUCTION
   */
  async placeBid(
    auctionId: string,
    supplierId: string,
    bidPrice: number,
  ): Promise<AuctionBidOutcome> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('place_auction_bid', {
      p_auction_id: auctionId,
      p_supplier_id: supplierId,
      p_bid_price: bidPrice,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as Partial<AuctionBidOutcome> | null;
    return {
      is_new_best: row?.is_new_best ?? true,
      current_best: row?.current_best ?? bidPrice,
      extended: row?.extended ?? false,
      auction_closed: row?.auction_closed ?? false,
      rule_applied: row?.rule_applied ?? 'british',
    };
  }

  /**
   * انسحاب مورد من المزاد (ركن أساسي في المزاد الياباني).
   * السبب إلزامي (5 أحرف على الأقل) ويُسجَّل للتدقيق.
   * @returns true إذا أدى الانسحاب إلى إغلاق المزاد (بقي مورد واحد).
   */
  async withdrawSupplier(
    auctionId: string,
    supplierId: string,
    reason: string,
  ): Promise<boolean> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('withdraw_from_auction', {
      p_auction_id: auctionId,
      p_supplier_id: supplierId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  /** حالة المزاد الحية مع الوفورات وعدد المشاركين النشطين/المنسحبين */
  async findLiveStatus(): Promise<AuctionLiveStatusRecord[]> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.from('auction_live_status').select('*');
    if (error) throw new Error(error.message);
    return (data || []) as AuctionLiveStatusRecord[];
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
export const rfxInvitationService = new RfxInvitationService();
export const rfxQuestionService = new RfxQuestionService();
export const rfxTemplateService = new RfxTemplateService();
export const rfxDocumentService = new RfxDocumentService();
export const rfxEvaluationCriteriaService = new RfxEvaluationCriteriaService();
export const rfxBidScorecardService = new RfxBidScorecardService();
export const auctionService = new AuctionService();
export const auctionBidService = new AuctionBidService();
