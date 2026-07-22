/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CrmQuotesService — بوابة CRM، الوحدة 4: العروض والعقود CPQ (التقرير 04)
 *
 *  يغلّف جداول ودوال migration 0168:
 *    • crm_products / crm_pricing_rules → الكتالوج + التسعير الديناميكي
 *    • crm_quotes / crm_quote_line_items → العروض وبنودها (حساب صافٍ تلقائي)
 *    • crm_discount_approvals → سير موافقة الخصم (10/20/35/ممنوع)
 *    • crm_quote_events → التتبّع (فتح/قراءة/مشاركة/توقيع)
 *    • crm_contracts → دورة العقود + تنبيهات التجديد
 *
 *  الدوال (RPC): crm_recalc_quote · crm_submit_quote · crm_decide_approval ·
 *    crm_send_quote · crm_track_quote_event · crm_sign_quote ·
 *    crm_contract_renewal_alerts · crm_quote_analytics · crm_seed_default_products.
 *
 *  توليد PDF: hook — المستند يُبنى في الواجهة من بيانات العرض (client-side).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────────────────

export type ProductType = 'package' | 'addon' | 'service';
export type BillingCycle = 'monthly' | 'annual' | 'one_time' | 'per_unit';

export interface CrmProduct {
  id: string; tenant_id: string; name: string; sku: string | null; product_type: ProductType;
  description: string | null; unit_price: number; currency: string; billing_cycle: BillingCycle;
  unit_label: string | null; is_active: boolean; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmProductInput {
  name: string; sku?: string | null; product_type?: ProductType; description?: string | null;
  unit_price?: number; billing_cycle?: BillingCycle; unit_label?: string | null;
}

export type QuoteStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';

export interface CrmQuote {
  id: string; tenant_id: string; quote_number: string;
  deal_id: string | null; account_id: string | null; contact_id: string | null;
  title: string; executive_summary: string | null; currency: string;
  subtotal: number; discount_amount: number; discount_pct: number;
  tax_pct: number; tax_amount: number; total: number;
  status: QuoteStatus; valid_until: string | null; terms: string | null; payment_terms: string | null;
  signed_at: string | null; signer_name: string | null; signer_email: string | null; signer_ip: string | null;
  sent_at: string | null; first_opened_at: string | null; open_count: number;
  owner_id: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmQuoteInput {
  quote_number: string; deal_id?: string | null; account_id?: string | null; contact_id?: string | null;
  title: string; executive_summary?: string | null; discount_pct?: number; tax_pct?: number;
  valid_until?: string | null; terms?: string | null; payment_terms?: string | null;
}
export interface CrmQuoteLineItem {
  id: string; tenant_id: string; quote_id: string; product_id: string | null;
  description: string; quantity: number; unit_price: number; discount_pct: number;
  line_total: number; sort_order: number; created_at: string;
}
export interface CrmQuoteLineItemInput {
  quote_id: string; product_id?: string | null; description: string;
  quantity?: number; unit_price?: number; discount_pct?: number; sort_order?: number;
}

export type ApprovalLevel = 'none' | 'sales_manager' | 'commercial_ceo' | 'forbidden';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export interface CrmDiscountApproval {
  id: string; tenant_id: string; quote_id: string; discount_pct: number;
  required_level: ApprovalLevel; reason: string | null; deal_value: number | null;
  status: ApprovalStatus; requested_by: string | null; decided_by: string | null;
  decided_at: string | null; decision_note: string | null; created_at: string;
}

export type QuoteEventType = 'sent' | 'opened' | 'viewed_pricing' | 'viewed_terms' | 'shared' | 'signed' | 'declined';
export interface CrmQuoteEvent {
  id: string; tenant_id: string; quote_id: string; event_type: QuoteEventType;
  detail: Record<string, unknown>; actor_email: string | null; actor_ip: string | null; created_at: string;
}

export type ContractStatus = 'draft' | 'sent' | 'under_review' | 'signed' | 'active' | 'renewal' | 'renewed' | 'expired' | 'cancelled';
export interface CrmContract {
  id: string; tenant_id: string; contract_number: string; quote_id: string | null; account_id: string | null;
  title: string; status: ContractStatus; annual_value: number; total_value: number;
  start_date: string | null; end_date: string | null; signed_at: string | null;
  owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string;
}

export interface QuoteAnalytics {
  totalQuotes: number; signedQuotes: number; closeRate: number;
  avgValue: number; avgDiscount: number; avgSignDays: number;
}
export interface ContractRenewalAlert {
  contractId: string; contractNumber: string; title: string;
  endDate: string; daysToEnd: number; alertLevel: 'expired' | 'escalate' | 'renewal' | 'ok';
}

// ─── الخدمات ────────────────────────────────────────────────────────────────

class CrmProductService extends BaseService<CrmProduct> {
  constructor() { super('crm_products'); }
  listProducts() { return this.findAll({ orderBy: 'product_type', ascending: true }); }
  createProduct(input: CrmProductInput) { return this.create(input as Partial<CrmProduct>); }
  async seedDefault(): Promise<number> {
    const { data, error } = await supabase.rpc('crm_seed_default_products');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

class CrmQuoteLineItemService extends BaseService<CrmQuoteLineItem> {
  constructor() { super('crm_quote_line_items'); }
  listForQuote(quoteId: string) {
    return this.findWhere([{ column: 'quote_id', value: quoteId }], { orderBy: 'sort_order', ascending: true });
  }
  createItem(input: CrmQuoteLineItemInput) { return this.create(input as Partial<CrmQuoteLineItem>); }
}

class CrmQuoteService extends BaseService<CrmQuote> {
  constructor() { super('crm_quotes'); }
  listQuotes() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  listForDeal(dealId: string) {
    return this.findWhere([{ column: 'deal_id', value: dealId }], { orderBy: 'created_at', ascending: false });
  }
  createQuote(input: CrmQuoteInput) { return this.create(input as Partial<CrmQuote>); }
  updateQuote(id: string, input: Partial<CrmQuoteInput>) { return this.update(id, input as Partial<CrmQuote>); }

  lineItems(quoteId: string) { return new CrmQuoteLineItemService().listForQuote(quoteId); }
  addLineItem(input: CrmQuoteLineItemInput) { return new CrmQuoteLineItemService().createItem(input); }
  removeLineItem(id: string) { return new CrmQuoteLineItemService().delete(id); }
  events(quoteId: string) { return new CrmQuoteEventService().listForQuote(quoteId); }

  async recalc(quoteId: string): Promise<void> {
    const { error } = await supabase.rpc('crm_recalc_quote', { p_quote_id: quoteId });
    if (error) throw new Error(error.message);
  }
  /** إرسال للاعتماد (يفرض الحوكمة): يعيد 'approved' أو 'pending_approval' */
  async submit(quoteId: string, reason?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('crm_submit_quote', { p_quote_id: quoteId, p_reason: reason ?? null });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async send(quoteId: string): Promise<void> {
    const { error } = await supabase.rpc('crm_send_quote', { p_quote_id: quoteId });
    if (error) throw new Error(error.message);
  }
  async trackEvent(quoteId: string, event: QuoteEventType, detail: Record<string, unknown> = {}, email?: string | null, ip?: string | null): Promise<void> {
    const { error } = await supabase.rpc('crm_track_quote_event', {
      p_quote_id: quoteId, p_event: event, p_detail: detail, p_email: email ?? null, p_ip: ip ?? null,
    });
    if (error) throw new Error(error.message);
  }
  /** التوقيع الإلكتروني — يعيد معرّف العقد المُنشأ */
  async sign(params: { quoteId: string; signerName: string; signerEmail: string; signerIp?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_sign_quote', {
      p_quote_id: params.quoteId, p_signer_name: params.signerName,
      p_signer_email: params.signerEmail, p_signer_ip: params.signerIp ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * إرسال العرض للتوقيع عن بُعد عبر DocuSign — Edge Function crm-send-signature.
   *   - مع مفاتيح DOCUSIGN_* → يُنشئ ظرفاً ويُرسل للعميل ليوقّع عن بُعد.
   *   - بلا مفاتيح → mode='simulated' (استخدم sign() الداخلي).
   */
  async sendForSignature(params: { quoteId: string; signerEmail: string; signerName: string }): Promise<{ mode: 'live' | 'simulated'; ok?: boolean; envelopeId?: string; message?: string; error?: string }> {
    const { data, error } = await supabase.functions.invoke('crm-send-signature', {
      body: { quote_id: params.quoteId, signer_email: params.signerEmail, signer_name: params.signerName },
    });
    if (error) throw new Error(error.message);
    return data as { mode: 'live' | 'simulated'; ok?: boolean; envelopeId?: string; message?: string; error?: string };
  }

  async analytics(): Promise<QuoteAnalytics> {
    const { data, error } = await supabase.rpc('crm_quote_analytics');
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      totalQuotes: Number(r.total_quotes || 0), signedQuotes: Number(r.signed_quotes || 0),
      closeRate: Number(r.close_rate || 0), avgValue: Number(r.avg_value || 0),
      avgDiscount: Number(r.avg_discount || 0), avgSignDays: Number(r.avg_sign_days || 0),
    };
  }

  /** مستوى موافقة الخصم (منطق محلي مطابق لدالة DB) */
  discountLevel(pct: number): ApprovalLevel {
    if (pct <= 10) return 'none';
    if (pct <= 20) return 'sales_manager';
    if (pct <= 35) return 'commercial_ceo';
    return 'forbidden';
  }
}

class CrmQuoteEventService extends BaseService<CrmQuoteEvent> {
  constructor() { super('crm_quote_events'); }
  listForQuote(quoteId: string) {
    return this.findWhere([{ column: 'quote_id', value: quoteId }], { orderBy: 'created_at', ascending: false });
  }
}

class CrmApprovalService extends BaseService<CrmDiscountApproval> {
  constructor() { super('crm_discount_approvals'); }
  listPending() { return this.findWhere([{ column: 'status', value: 'pending' }], { orderBy: 'created_at', ascending: false }); }
  listAll() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  async decide(approvalId: string, approve: boolean, note?: string | null): Promise<void> {
    const { error } = await supabase.rpc('crm_decide_approval', { p_approval_id: approvalId, p_approve: approve, p_note: note ?? null });
    if (error) throw new Error(error.message);
  }
}

class CrmContractService extends BaseService<CrmContract> {
  constructor() { super('crm_contracts'); }
  listContracts() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  listForAccount(accountId: string) {
    return this.findWhere([{ column: 'account_id', value: accountId }], { orderBy: 'created_at', ascending: false });
  }
  updateContract(id: string, input: Partial<CrmContract>) { return this.update(id, input); }
  async renewalAlerts(): Promise<ContractRenewalAlert[]> {
    const { data, error } = await supabase.rpc('crm_contract_renewal_alerts');
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      contractId: String(r.contract_id), contractNumber: String(r.contract_number ?? ''),
      title: String(r.title ?? ''), endDate: String(r.end_date ?? ''),
      daysToEnd: Number(r.days_to_end || 0), alertLevel: (r.alert_level as ContractRenewalAlert['alertLevel']) ?? 'ok',
    }));
  }
}

// ─── ثوابت مرجعية من التقرير ─────────────────────────────────────────────────

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = { package: 'باقة', addon: 'إضافة', service: 'خدمة' };
export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: 'شهري', annual: 'سنوي', one_time: 'لمرة واحدة', per_unit: 'حسب الوحدة',
};
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'مسودة', pending_approval: 'بانتظار الموافقة', approved: 'معتمد', sent: 'مُرسَل',
  viewed: 'شوهد', signed: 'موقّع', declined: 'مرفوض', expired: 'منتهٍ',
};
export const QUOTE_STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
  pending_approval: 'bg-amber-50 text-amber-600 border-amber-200',
  approved: 'bg-sky-50 text-sky-600 border-sky-200',
  sent: 'bg-violet-50 text-violet-600 border-violet-200',
  viewed: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  signed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  declined: 'bg-rose-50 text-rose-600 border-rose-200',
  expired: 'bg-slate-100 text-slate-400 border-slate-200',
};
export const APPROVAL_LEVEL_LABEL: Record<ApprovalLevel, string> = {
  none: 'بلا موافقة (≤10%)', sales_manager: 'مدير المبيعات (≤20%)', commercial_ceo: 'المدير التجاري + CEO (≤35%)', forbidden: 'ممنوع (>35%)',
};
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'مسودة', sent: 'مُرسَل', under_review: 'قيد المراجعة', signed: 'موقّع', active: 'نشط',
  renewal: 'قيد التجديد', renewed: 'مجدَّد', expired: 'منتهٍ', cancelled: 'ملغى',
};
export const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
  sent: 'bg-violet-50 text-violet-600 border-violet-200',
  under_review: 'bg-amber-50 text-amber-600 border-amber-200',
  signed: 'bg-sky-50 text-sky-600 border-sky-200',
  active: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  renewal: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  renewed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  expired: 'bg-rose-50 text-rose-600 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
};
export const RENEWAL_ALERT_LABEL: Record<ContractRenewalAlert['alertLevel'], string> = {
  expired: 'منتهٍ', escalate: 'تصعيد (≤30 يوم)', renewal: 'تجديد (≤90 يوم)', ok: 'سليم',
};

// ─── Singletons ──────────────────────────────────────────────────────────────
export const crmProductService = new CrmProductService();
export const crmQuoteService = new CrmQuoteService();
export const crmQuoteLineItemService = new CrmQuoteLineItemService();
export const crmApprovalService = new CrmApprovalService();
export const crmContractService = new CrmContractService();
