/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CrmSupportService — بوابة CRM، الوحدة 5: الدعم والتذاكر (التقرير 05)
 *
 *  يغلّف جداول ودوال migration 0169:
 *    • crm_tickets / crm_ticket_replies → التذاكر + الردود (عامة/داخلية)
 *    • crm_sla_policies → سياسات SLA (P1-P4 + حسب الباقة)
 *    • crm_canned_responses → الردود الجاهزة
 *    • crm_kb_articles → قاعدة المعرفة + Deflection
 *    • crm_routing_rules → التوزيع الذكي
 *
 *  الدوال (RPC): crm_create_ticket · crm_add_ticket_reply · crm_set_ticket_status ·
 *    crm_submit_csat · crm_support_churn_risk · crm_support_kpis · crm_seed_default_sla.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────────────────

export type TicketType = 'technical' | 'feature_request' | 'billing' | 'critical_incident';
export type TicketPriority = 'p1' | 'p2' | 'p3' | 'p4';
export type TicketChannel = 'email' | 'live_chat' | 'self_service' | 'phone' | 'whatsapp';
export type TicketStatus = 'new' | 'open' | 'pending_customer' | 'pending_internal' | 'resolved' | 'closed';

export interface CrmTicket {
  id: string; tenant_id: string; ticket_number: string; subject: string; description: string | null;
  account_id: string | null; contact_id: string | null;
  ticket_type: TicketType; priority: TicketPriority; channel: TicketChannel; status: TicketStatus;
  assignee_id: string | null; required_skill: string | null;
  sla_first_response_due: string | null; sla_resolution_due: string | null;
  first_response_at: string | null; resolved_at: string | null; closed_at: string | null; sla_breached: boolean;
  csat_score: number | null; csat_comment: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmTicketReply {
  id: string; tenant_id: string; ticket_id: string; body: string;
  is_internal: boolean; author_id: string | null; author_type: 'agent' | 'customer' | 'system'; created_at: string;
}

export interface CrmSlaPolicy {
  id: string; tenant_id: string; priority: TicketPriority; plan_tier: string;
  first_response_minutes: number; resolution_minutes: number; created_at: string;
}

export interface CrmCannedResponse {
  id: string; tenant_id: string; title: string; body: string; category: string | null;
  usage_count: number; is_active: boolean; created_by: string | null; created_at: string;
}
export interface CrmCannedResponseInput { title: string; body: string; category?: string | null; }

export type KbArticleType = 'how_to' | 'troubleshooting' | 'faq' | 'release_notes';
export interface CrmKbArticle {
  id: string; tenant_id: string; title: string; body: string; article_type: KbArticleType;
  is_published: boolean; view_count: number; helpful_count: number; unhelpful_count: number;
  deflection_count: number; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmKbArticleInput { title: string; body: string; article_type?: KbArticleType; is_published?: boolean; }

export type RoutingStrategy = 'rule_based' | 'round_robin' | 'skills_based';
export type RoutingMatchType = 'ticket_type' | 'priority' | 'required_skill' | 'plan_tier';
export interface CrmRoutingRule {
  id: string; tenant_id: string; name: string; strategy: RoutingStrategy;
  match_type: RoutingMatchType | null; match_value: string | null; assign_to: string | null;
  priority: number; is_active: boolean; created_at: string;
}
export interface CrmRoutingRuleInput {
  name: string; strategy?: RoutingStrategy; match_type?: RoutingMatchType | null;
  match_value?: string | null; assign_to?: string | null; priority?: number;
}

export interface SupportKpis {
  openTickets: number; breached: number; slaCompliance: number;
  avgCsat: number; resolved30d: number; avgTtrHours: number;
}
export interface ChurnRiskAccount {
  accountId: string; accountName: string; tickets30d: number;
  avgRecentCsat: number; breachedP1: number; riskReason: string;
}

// ─── الخدمات ────────────────────────────────────────────────────────────────

class CrmTicketService extends BaseService<CrmTicket> {
  constructor() { super('crm_tickets'); }
  listTickets() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  listForAccount(accountId: string) {
    return this.findWhere([{ column: 'account_id', value: accountId }], { orderBy: 'created_at', ascending: false });
  }

  /** إنشاء تذكرة (يحسب الـ SLA + توزيع rule-based + ربط بالجدول الزمني) */
  async createTicket(params: {
    subject: string; description?: string | null; accountId?: string | null; contactId?: string | null;
    type?: TicketType; priority?: TicketPriority; channel?: TicketChannel; requiredSkill?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_create_ticket', {
      p_subject: params.subject, p_description: params.description ?? null,
      p_account_id: params.accountId ?? null, p_contact_id: params.contactId ?? null,
      p_type: params.type ?? 'technical', p_priority: params.priority ?? 'p3',
      p_channel: params.channel ?? 'email', p_required_skill: params.requiredSkill ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  replies(ticketId: string) { return new CrmTicketReplyService().listForTicket(ticketId); }

  async addReply(ticketId: string, body: string, isInternal = false, authorType: 'agent' | 'customer' | 'system' = 'agent'): Promise<string> {
    const { data, error } = await supabase.rpc('crm_add_ticket_reply', {
      p_ticket_id: ticketId, p_body: body, p_is_internal: isInternal, p_author_type: authorType,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async setStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const { error } = await supabase.rpc('crm_set_ticket_status', { p_ticket_id: ticketId, p_status: status });
    if (error) throw new Error(error.message);
  }
  async submitCsat(ticketId: string, score: number, comment?: string | null): Promise<void> {
    const { error } = await supabase.rpc('crm_submit_csat', { p_ticket_id: ticketId, p_score: score, p_comment: comment ?? null });
    if (error) throw new Error(error.message);
  }
  assign(ticketId: string, assigneeId: string | null) { return this.update(ticketId, { assignee_id: assigneeId } as Partial<CrmTicket>); }

  async kpis(): Promise<SupportKpis> {
    const { data, error } = await supabase.rpc('crm_support_kpis');
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      openTickets: Number(r.open_tickets || 0), breached: Number(r.breached || 0),
      slaCompliance: Number(r.sla_compliance || 0), avgCsat: Number(r.avg_csat || 0),
      resolved30d: Number(r.resolved_30d || 0), avgTtrHours: Number(r.avg_ttr_hours || 0),
    };
  }
  async churnRisk(): Promise<ChurnRiskAccount[]> {
    const { data, error } = await supabase.rpc('crm_support_churn_risk');
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      accountId: String(r.account_id), accountName: String(r.account_name ?? ''),
      tickets30d: Number(r.tickets_30d || 0), avgRecentCsat: Number(r.avg_recent_csat || 0),
      breachedP1: Number(r.breached_p1 || 0), riskReason: String(r.risk_reason ?? ''),
    }));
  }
}

class CrmTicketReplyService extends BaseService<CrmTicketReply> {
  constructor() { super('crm_ticket_replies'); }
  listForTicket(ticketId: string) {
    return this.findWhere([{ column: 'ticket_id', value: ticketId }], { orderBy: 'created_at', ascending: true });
  }
}

class CrmSlaService extends BaseService<CrmSlaPolicy> {
  constructor() { super('crm_sla_policies'); }
  listPolicies() { return this.findAll({ orderBy: 'priority', ascending: true }); }
  async seedDefault(): Promise<number> {
    const { data, error } = await supabase.rpc('crm_seed_default_sla');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

class CrmCannedService extends BaseService<CrmCannedResponse> {
  constructor() { super('crm_canned_responses'); }
  listResponses() { return this.findWhere([{ column: 'is_active', value: true }], { orderBy: 'created_at', ascending: false }); }
  createResponse(input: CrmCannedResponseInput) { return this.create(input as Partial<CrmCannedResponse>); }
}

class CrmKbService extends BaseService<CrmKbArticle> {
  constructor() { super('crm_kb_articles'); }
  listArticles() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createArticle(input: CrmKbArticleInput) { return this.create(input as Partial<CrmKbArticle>); }
}

class CrmRoutingService extends BaseService<CrmRoutingRule> {
  constructor() { super('crm_routing_rules'); }
  listRules() { return this.findAll({ orderBy: 'priority', ascending: false }); }
  createRule(input: CrmRoutingRuleInput) { return this.create(input as Partial<CrmRoutingRule>); }
}

// ─── ثوابت مرجعية من التقرير ─────────────────────────────────────────────────

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  technical: 'دعم فني', feature_request: 'طلب تحسين', billing: 'فواتير وحسابات', critical_incident: 'حادث حرج',
};
export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  p1: 'حرجة (P1)', p2: 'عالية (P2)', p3: 'متوسطة (P3)', p4: 'منخفضة (P4)',
};
export const TICKET_PRIORITY_COLOR: Record<TicketPriority, string> = {
  p1: 'bg-rose-50 text-rose-600 border-rose-200',
  p2: 'bg-amber-50 text-amber-600 border-amber-200',
  p3: 'bg-sky-50 text-sky-600 border-sky-200',
  p4: 'bg-emerald-50 text-emerald-600 border-emerald-200',
};
export const TICKET_CHANNEL_LABEL: Record<TicketChannel, string> = {
  email: 'بريد إلكتروني', live_chat: 'محادثة فورية', self_service: 'بوابة ذاتية', phone: 'هاتف', whatsapp: 'واتساب',
};
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'جديدة', open: 'قيد العمل', pending_customer: 'بانتظار العميل', pending_internal: 'بانتظار فريق داخلي',
  resolved: 'تم الحل', closed: 'مغلقة',
};
export const TICKET_STATUS_COLOR: Record<TicketStatus, string> = {
  new: 'bg-violet-50 text-violet-600 border-violet-200',
  open: 'bg-sky-50 text-sky-600 border-sky-200',
  pending_customer: 'bg-amber-50 text-amber-600 border-amber-200',
  pending_internal: 'bg-amber-50 text-amber-600 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
};
export const KB_ARTICLE_TYPE_LABEL: Record<KbArticleType, string> = {
  how_to: 'كيف تفعل', troubleshooting: 'استكشاف الأخطاء', faq: 'أسئلة شائعة', release_notes: 'ملاحظات الإصدار',
};
export const ROUTING_STRATEGY_LABEL: Record<RoutingStrategy, string> = {
  rule_based: 'قائم على القواعد', round_robin: 'توزيع دوري', skills_based: 'حسب المهارة',
};
/** الـ SLA المرجعي من التقرير (دقائق) */
export const SLA_REFERENCE: Record<TicketPriority, { frt: number; ttr: number }> = {
  p1: { frt: 30, ttr: 240 }, p2: { frt: 120, ttr: 480 }, p3: { frt: 240, ttr: 1440 }, p4: { frt: 480, ttr: 4320 },
};

// ─── Singletons ──────────────────────────────────────────────────────────────
export const crmTicketService = new CrmTicketService();
export const crmTicketReplyService = new CrmTicketReplyService();
export const crmSlaService = new CrmSlaService();
export const crmCannedService = new CrmCannedService();
export const crmKbService = new CrmKbService();
export const crmRoutingService = new CrmRoutingService();
