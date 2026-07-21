/**
 * ════════════════════════════════════════════════════════════════════════════
 *  RelationshipImmuneService — نظام المناعة العلائقية (التقرير 7، الابتكار الأصلي)
 *
 *  الطبقة الحاكمة العليا فوق الوحدات الست. يغلّف migration 0163:
 *    • relationship_balances / relationship_ledger → رصيد العلاقة وحركاته
 *    • governance_log                              → سجل قرارات الحوكمة
 *    • cultural_calendar                           → التقويم الثقافي/الزمني
 *    • immune_incidents / immune_settings          → المناعة الذاتية
 *
 *  الدوال (RPC): apply_relationship_event · governance_check · marketing_debt
 *                · raise_immune_incident · resolve_immune_incident · relationship_status.
 *
 *  الاستخدام العكسي: أي نظام (بريد/SMS/...) يستدعي governanceCheck قبل الإرسال،
 *  ويستدعي applyEvent بعد كل تفاعل لتغذية الرصيد.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export type RelationshipStatus = 'healthy' | 'good' | 'warning' | 'danger' | 'critical';
export type PacePreference = 'conservative' | 'balanced' | 'open';
export type GovernanceDecision = 'allow' | 'defer' | 'block';

export interface RelationshipBalance {
  id: string; tenant_id: string; lead_id: string; balance: number;
  pace_preference: PacePreference; last_contact_at: string | null; last_recharge_at: string | null;
  no_open_streak: number; created_at: string; updated_at: string;
}
export interface LedgerEntry {
  id: string; tenant_id: string; lead_id: string; event_key: string;
  direction: 'debit' | 'credit'; points: number; balance_after: number;
  source_system: string | null; reason: string | null; created_at: string;
}
export interface GovernanceLogEntry {
  id: string; tenant_id: string; lead_id: string | null; source_system: string; channel: string | null;
  decision: GovernanceDecision; reason: string; balance_at_time: number | null; suggested_channel: string | null; created_at: string;
}
export type OccasionType = 'ramadan' | 'prayer_window' | 'national_day' | 'weekend' | 'mourning' | 'custom';
export type OccasionEffect = 'reduce' | 'defer' | 'suspend_promotional' | 'suspend_all';
export interface CulturalOccasion {
  id: string; tenant_id: string; name: string; occasion_type: OccasionType; country: string | null;
  starts_at: string | null; ends_at: string | null; effect: OccasionEffect; is_active: boolean; created_at: string;
}
export interface CulturalOccasionInput {
  name: string; occasion_type: OccasionType; country?: string | null;
  starts_at?: string | null; ends_at?: string | null; effect?: OccasionEffect;
}
export type IncidentType = 'unsubscribe_spike' | 'complaint_spike' | 'bounce_spike' | 'broken_link' | 'manual';
export interface ImmuneIncident {
  id: string; tenant_id: string; incident_type: IncidentType; severity: 'warning' | 'critical';
  description: string; campaign_ref: string | null; status: 'open' | 'suspended' | 'resolved';
  auto_suspended: boolean; recovery_draft: string | null; created_at: string; resolved_at: string | null;
}
export interface ImmuneSettings { tenant_id: string; global_promotional_paused: boolean; pause_reason: string | null; updated_at: string; }
export interface GovernanceResult { decision: GovernanceDecision; reason: string; balance: number; suggestedChannel: string | null; }
export interface MarketingDebt { totalDebit: number; totalCredit: number; netDebt: number; }

// ════════════════════════════════════════════════════════════════════════════
//  الخدمات
// ════════════════════════════════════════════════════════════════════════════

class RelationshipBalanceService extends BaseService<RelationshipBalance> {
  constructor() { super('relationship_balances'); }
  listBalances() { return this.findAll({ orderBy: 'balance', ascending: true }); }

  /** ضمان وجود رصيد للعميل */
  async ensure(leadId: string): Promise<void> {
    const { error } = await supabase.rpc('ensure_relationship_balance', { p_lead_id: leadId });
    if (error) throw new Error(error.message);
  }

  /** تطبيق حدث (خصم/شحن) على الرصيد */
  async applyEvent(leadId: string, eventKey: string, source?: string, reason?: string): Promise<number> {
    const { data, error } = await supabase.rpc('apply_relationship_event', {
      p_lead_id: leadId, p_event_key: eventKey, p_source: source ?? null, p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
    return data as number;
  }

  async ledger(leadId: string): Promise<LedgerEntry[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('relationship_ledger').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as LedgerEntry[];
  }

  setPace(id: string, pace: PacePreference) { return this.update(id, { pace_preference: pace } as Partial<RelationshipBalance>); }
}

class GovernanceService {
  /** نقطة التفتيش المركزية — تُستدعى قبل أي إرسال */
  async check(leadId: string, source: string, channel: string, isPromotional = true): Promise<GovernanceResult> {
    const { data, error } = await supabase.rpc('governance_check', {
      p_lead_id: leadId, p_source: source, p_channel: channel, p_is_promotional: isPromotional,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    return { decision: row.decision, reason: row.reason, balance: Number(row.out_balance ?? 0), suggestedChannel: row.suggested_channel ?? null };
  }

  async recentLog(limit = 50): Promise<GovernanceLogEntry[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('governance_log').select('*').order('created_at', { ascending: false }).limit(limit);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as GovernanceLogEntry[];
  }

  async marketingDebt(days = 90): Promise<MarketingDebt> {
    const { data, error } = await supabase.rpc('marketing_debt', { p_days: days });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    return { totalDebit: Number(row.total_debit || 0), totalCredit: Number(row.total_credit || 0), netDebt: Number(row.net_debt || 0) };
  }
}

class CulturalCalendarService extends BaseService<CulturalOccasion> {
  constructor() { super('cultural_calendar'); }
  listOccasions() { return this.findAll({ orderBy: 'starts_at', ascending: false }); }
  createOccasion(input: CulturalOccasionInput) {
    return this.create({ ...input, is_active: true, effect: input.effect ?? 'reduce' } as Partial<CulturalOccasion>);
  }
  toggle(id: string, active: boolean) { return this.update(id, { is_active: active } as Partial<CulturalOccasion>); }
}

class ImmuneService {
  private incidents = new (class extends BaseService<ImmuneIncident> { constructor() { super('immune_incidents'); } })();
  private settings = new (class extends BaseService<ImmuneSettings> { constructor() { super('immune_settings'); } })();

  listIncidents() { return this.incidents.findAll({ orderBy: 'created_at', ascending: false }); }

  async raise(type: IncidentType, severity: 'warning' | 'critical', description: string, campaignRef?: string): Promise<string> {
    const { data, error } = await supabase.rpc('raise_immune_incident', {
      p_type: type, p_severity: severity, p_description: description, p_campaign_ref: campaignRef ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async resolve(incidentId: string): Promise<void> {
    const { error } = await supabase.rpc('resolve_immune_incident', { p_incident_id: incidentId });
    if (error) throw new Error(error.message);
  }
  async getSettings(): Promise<ImmuneSettings | null> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('immune_settings').select('*');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return (data as ImmuneSettings) || null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ثوابت مرجعية من التقرير
// ════════════════════════════════════════════════════════════════════════════

export const STATUS_LABEL: Record<RelationshipStatus, string> = {
  healthy: 'صحية ممتازة', good: 'جيدة', warning: 'إنذار', danger: 'خطر جسيم', critical: 'حرجة',
};
export const STATUS_COLOR: Record<RelationshipStatus, string> = {
  healthy: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  good: 'bg-sky-50 text-sky-600 border-sky-200',
  warning: 'bg-amber-50 text-amber-600 border-amber-200',
  danger: 'bg-orange-50 text-orange-600 border-orange-200',
  critical: 'bg-rose-50 text-rose-600 border-rose-200',
};
/** حالة العميل بلغة بسيطة (صفحة "علاقتك معنا") */
export function customerFacingStatus(balance: number): { label: string; message: string } {
  if (balance >= 700) return { label: 'ممتازة', message: 'علاقتنا معك في أفضل حالاتها' };
  if (balance >= 300) return { label: 'متوازنة', message: 'نحرص ألا نُثقل عليك — سنخفف قليلاً هذا الأسبوع' };
  return { label: 'هادئة', message: 'لاحظنا أنك تحتاج مساحة، سنتواصل فقط للأمور الضرورية' };
}
export function statusFromBalance(balance: number): RelationshipStatus {
  if (balance >= 800) return 'healthy';
  if (balance >= 500) return 'good';
  if (balance >= 300) return 'warning';
  if (balance >= 150) return 'danger';
  return 'critical';
}

/** جدول الخصم/الشحن (للعرض المرجعي) */
export const POINTS_TABLE = {
  debits: [
    { key: 'email_sent', label: 'بريد تسويقي', pts: 15 },
    { key: 'sms_sent', label: 'SMS ترويجية', pts: 25 },
    { key: 'whatsapp_sent', label: 'واتساب ترويجية', pts: 20 },
    { key: 'retargeting_ad', label: 'إعلان Retargeting', pts: 5 },
    { key: 'event_invite', label: 'دعوة لحدث', pts: 30 },
    { key: 'survey_sent', label: 'إرسال استبيان', pts: 40 },
    { key: 'negative_sentiment', label: 'رد بنبرة سلبية', pts: 100 },
    { key: 'channel_unsubscribe', label: 'إلغاء اشتراك', pts: 150 },
    { key: 'spam_complaint', label: 'شكوى إسبام', pts: 300 },
  ],
  credits: [
    { key: 'idle_24h', label: '24 ساعة دون تواصل', pts: 10 },
    { key: 'email_opened', label: 'فتح رسالة', pts: 15 },
    { key: 'link_clicked', label: 'الضغط على رابط', pts: 25 },
    { key: 'survey_completed', label: 'إكمال استبيان', pts: 20 },
    { key: 'event_attended', label: 'حضور حدث', pts: 50 },
    { key: 'high_csat', label: 'CSAT مرتفع', pts: 40 },
    { key: 'nps_positive', label: 'NPS إيجابي (9-10)', pts: 80 },
    { key: 'purchase', label: 'شراء أو ترقية', pts: 100 },
  ],
};

/** الطبقة الثقافية (للعرض المرجعي) */
export const CULTURAL_RULES = [
  { trigger: 'رمضان (تقويم أم القرى)', action: 'خفض الترويجي + تأجيل غير الملحّ لما بعد المغرب' },
  { trigger: 'أوقات الصلوات الخمس', action: 'إيقاف SMS/واتساب/الإشعارات 15-20 دقيقة حول كل أذان' },
  { trigger: 'الأيام الوطنية الخليجية', action: 'إيقاف الترويجي أو تحويل نبرة المحتوى' },
  { trigger: 'عطلة نهاية الأسبوع (جمعة-سبت)', action: 'ضبط اليوم الأمثل حسب بلد كل عميل' },
  { trigger: 'حداد وطني', action: 'تعليق فوري لكل الترويجي على مستوى المنصة' },
];

// ════════════════════════════════════════════════════════════════════════════
//  Singletons
// ════════════════════════════════════════════════════════════════════════════
export const relationshipBalanceService = new RelationshipBalanceService();
export const governanceService = new GovernanceService();
export const culturalCalendarService = new CulturalCalendarService();
export const immuneService = new ImmuneService();
