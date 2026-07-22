/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MarketingEmailService — خدمة وحدة البريد الإلكتروني (التقرير 2)
 *
 *  يغلّف جداول ودوال migration 0156:
 *    • email_sender_domains       → البنية التقنية (SPF/DKIM/DMARC/BIMI + تدفئة)
 *    • email_lists / subscribers / list_members → إدارة القوائم (Double Opt-in)
 *    • email_segments             → الشرائح الديناميكية
 *    • email_templates            → القوالب (محرّر RTL + تخصيص)
 *    • email_campaigns / variants → الحملات + A/B + جدولة
 *    • email_events               → التحليلات + ربط الأتمتة (الوحدة 1)
 *    • email_unsubscribe_log      → الامتثال (سجل Audit)
 *
 *  الإرسال الخارجي (SendGrid/SES) hook: يُسجَّل الحدث delivery_mode='simulated'
 *  ويُصبح 'live' فور إضافة مفتاح المزوّد — دون إعادة بناء.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

// ════════════════════════════════════════════════════════════════════════════
//  الأنواع
// ════════════════════════════════════════════════════════════════════════════

export type AuthStatus = 'pending' | 'verified' | 'failed';
export type DmarcPolicy = 'none' | 'quarantine' | 'reject';
export type EmailProvider = 'simulation' | 'sendgrid' | 'amazon_ses' | 'mailgun' | 'postmark';

export interface SenderDomain {
  id: string;
  tenant_id: string;
  domain: string;
  from_name: string | null;
  from_email: string | null;
  spf_status: AuthStatus;
  dkim_status: AuthStatus;
  dmarc_status: AuthStatus;
  dmarc_policy: DmarcPolicy;
  bimi_status: 'not_configured' | 'pending' | 'verified';
  warmup_enabled: boolean;
  warmup_started_at: string | null;
  daily_send_limit: number;
  provider: EmailProvider;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
export interface SenderDomainInput {
  domain: string;
  from_name?: string | null;
  from_email?: string | null;
  provider?: EmailProvider;
}

export type OptInType = 'single' | 'double';
export interface EmailList {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  opt_in_type: OptInType;
  created_at: string;
  updated_at: string;
}
export interface EmailListInput { name: string; description?: string | null; opt_in_type?: OptInType; }

export type SubscriberStatus = 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained' | 'cleaned';
export interface EmailSubscriber {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  lead_id: string | null;
  status: SubscriberStatus;
  country: string | null;
  city: string | null;
  language: string | null;
  job_title: string | null;
  company_size: string | null;
  industry: string | null;
  tags: string[];
  confirm_token: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  bounce_type: 'hard' | 'soft' | null;
  soft_bounce_count: number;
  last_engaged_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface EmailSubscriberInput {
  email: string;
  full_name?: string | null;
  country?: string | null;
  job_title?: string | null;
  industry?: string | null;
  company_size?: string | null;
  tags?: string[];
  status?: SubscriberStatus;
  confirm_token?: string | null;
}

export type SegmentType = 'demographic' | 'behavioral' | 'lifecycle' | 'microsegment';
export interface EmailSegment {
  id: string;
  tenant_id: string;
  name: string;
  segment_type: SegmentType;
  filters: Array<{ field: string; op: string; value: unknown }>;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  name: string;
  subject: string;
  preheader: string | null;
  blocks: unknown[];
  html: string | null;
  category: string;
  is_rtl: boolean;
  created_at: string;
  updated_at: string;
}
export interface EmailTemplateInput {
  name: string;
  subject?: string;
  preheader?: string | null;
  blocks?: unknown[];
  html?: string | null;
  category?: string;
  is_rtl?: boolean;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
export interface EmailCampaign {
  id: string;
  tenant_id: string;
  name: string;
  list_id: string | null;
  segment_id: string | null;
  sender_domain_id: string | null;
  status: CampaignStatus;
  is_ab_test: boolean;
  ab_winner_metric: 'open_rate' | 'click_rate' | null;
  ab_winner_variant: string | null;
  scheduled_at: string | null;
  timezone: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface EmailCampaignInput {
  name: string;
  list_id?: string | null;
  segment_id?: string | null;
  sender_domain_id?: string | null;
  status?: CampaignStatus;
  is_ab_test?: boolean;
  ab_winner_metric?: 'open_rate' | 'click_rate' | null;
  scheduled_at?: string | null;
  timezone?: string | null;
}

export interface CampaignVariant {
  id: string;
  tenant_id: string;
  campaign_id: string;
  variant_label: string;
  template_id: string | null;
  subject: string;
  preheader: string | null;
  html: string | null;
  sample_pct: number;
  created_at: string;
}
export interface CampaignVariantInput {
  campaign_id: string;
  variant_label?: string;
  template_id?: string | null;
  subject?: string;
  preheader?: string | null;
  html?: string | null;
  sample_pct?: number;
}

export type EmailEventType =
  | 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked'
  | 'bounced' | 'complained' | 'unsubscribed' | 'failed';

export interface EmailKpis {
  sent: number; delivered: number; opened: number; clicked: number;
  bounced: number; unsubscribed: number; complained: number;
  // معدلات محسوبة (معادلات التقرير)
  openRate: number;        // opened/delivered
  ctor: number;            // clicked/opened (Click-to-Open)
  ctr: number;             // clicked/sent
  unsubscribeRate: number; // unsubscribed/delivered
  spamRate: number;        // complained/sent
  bounceRate: number;      // bounced/sent
}

export interface WarmupWeek { week_no: number; daily_limit_min: number; daily_limit_max: number; }

// ════════════════════════════════════════════════════════════════════════════
//  الخدمات (BaseService لحقن tenant_id + RLS)
// ════════════════════════════════════════════════════════════════════════════

class SenderDomainService extends BaseService<SenderDomain> {
  constructor() { super('email_sender_domains'); }
  listDomains() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createDomain(input: SenderDomainInput) { return this.create(input as Partial<SenderDomain>); }
  /** محاكاة فحص DNS: يعلّم SPF/DKIM/DMARC verified (في الإنتاج يُستبدل بفحص DNS فعلي) */
  async verify(id: string) {
    return this.update(id, {
      spf_status: 'verified', dkim_status: 'verified', dmarc_status: 'verified', dmarc_policy: 'quarantine',
    } as Partial<SenderDomain>);
  }
  async warmupSchedule(): Promise<WarmupWeek[]> {
    const { data, error } = await supabase.rpc('email_warmup_schedule');
    if (error) throw new Error(error.message);
    return (data || []) as WarmupWeek[];
  }
}

class EmailListService extends BaseService<EmailList> {
  constructor() { super('email_lists'); }
  listAll() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createList(input: EmailListInput) { return this.create(input as Partial<EmailList>); }
}

class EmailSubscriberService extends BaseService<EmailSubscriber> {
  constructor() { super('email_subscribers'); }
  listAll() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  listByStatus(status: SubscriberStatus) { return this.findAll({ filters: { status } }); }

  /** إضافة مشترك مع Double Opt-in: يولّد رمز تأكيد ويضعه pending */
  async subscribe(input: EmailSubscriberInput, doubleOptIn = true): Promise<EmailSubscriber> {
    const token = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : undefined;
    return this.create({
      ...input,
      status: doubleOptIn ? 'pending' : 'confirmed',
      confirm_token: doubleOptIn ? token ?? null : null,
    } as Partial<EmailSubscriber>);
  }

  /** تأكيد الاشتراك عبر الرمز (Double Opt-in) */
  async confirm(token: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('confirm_email_subscription', { p_token: token });
    if (error) throw new Error(error.message);
    return data as boolean;
  }

  /** نظافة القائمة: حذف/تعليم الخاملين (لم يتفاعلوا منذ N يوماً) */
  async findStale(days = 180): Promise<EmailSubscriber[]> {
    const tenantId = getCurrentTenantId();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    let q = supabase.from('email_subscribers').select('*')
      .eq('status', 'confirmed')
      .or(`last_engaged_at.is.null,last_engaged_at.lt.${cutoff}`);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as EmailSubscriber[];
  }

  async addToList(listId: string, subscriberId: string): Promise<void> {
    const tenantId = getCurrentTenantId();
    const { error } = await supabase.from('email_list_members').insert({
      tenant_id: tenantId, list_id: listId, subscriber_id: subscriberId,
    });
    if (error && !error.message.includes('duplicate')) throw new Error(error.message);
  }
}

class EmailSegmentService extends BaseService<EmailSegment> {
  constructor() { super('email_segments'); }
  listAll() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
}

class EmailTemplateService extends BaseService<EmailTemplate> {
  constructor() { super('email_templates'); }
  listAll() { return this.findAll({ orderBy: 'updated_at', ascending: false }); }
  createTemplate(input: EmailTemplateInput) { return this.create(input as Partial<EmailTemplate>); }
}

class EmailCampaignService extends BaseService<EmailCampaign> {
  constructor() { super('email_campaigns'); }
  listAll() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createCampaign(input: EmailCampaignInput) { return this.create(input as Partial<EmailCampaign>); }
  setStatus(id: string, status: CampaignStatus) {
    const patch: Partial<EmailCampaign> = { status };
    if (status === 'sent') patch.sent_at = new Date().toISOString();
    return this.update(id, patch);
  }
}

class CampaignVariantService extends BaseService<CampaignVariant> {
  constructor() { super('email_campaign_variants'); }
  listForCampaign(campaignId: string) {
    return this.findAll({ filters: { campaign_id: campaignId }, orderBy: 'variant_label', ascending: true });
  }
  createVariant(input: CampaignVariantInput) { return this.create(input as Partial<CampaignVariant>); }
}

// ════════════════════════════════════════════════════════════════════════════
//  خدمة الإرسال + التحليلات (المحرك المنطقي: يمرّ عبره كل بريد)
// ════════════════════════════════════════════════════════════════════════════

class EmailDeliveryService {
  /** نقطة الدخول الموحّدة: تسجيل حدث بريد (تُستدعى من الحملات والأتمتة) */
  async recordEvent(params: {
    subscriberId: string;
    eventType: EmailEventType;
    campaignId?: string | null;
    variantId?: string | null;
    source?: 'campaign' | 'automation' | 'transactional';
    workflowId?: string | null;
    bounceType?: 'hard' | 'soft' | null;
    deliveryMode?: 'simulated' | 'live';
  }): Promise<string> {
    const { data, error } = await supabase.rpc('record_email_event', {
      p_subscriber_id: params.subscriberId,
      p_event_type: params.eventType,
      p_campaign_id: params.campaignId ?? null,
      p_variant_id: params.variantId ?? null,
      p_source: params.source ?? 'campaign',
      p_workflow_id: params.workflowId ?? null,
      p_bounce_type: params.bounceType ?? null,
      p_delivery_mode: params.deliveryMode ?? 'simulated',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * إرسال بريد فعلي عبر المزوّد (Resend) — عبر Edge Function marketing-send-email.
   *
   * السلوك:
   *   - إن كان المفتاح مضبوطاً على Supabase (RESEND_API_KEY) → إرسال حقيقي (mode='live').
   *   - إن لم يُضبط → تُرجع الدالة mode='simulated' دون فشل (توافق عكسي).
   *
   * تُرجع: { mode, ok?, id?, message? } — استخدم `mode === 'live' && ok` للتأكد من الإرسال الفعلي.
   */
  async sendEmailLive(params: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    from?: string;
    campaignId?: string | null;
    subscriberId?: string | null;
  }): Promise<{ mode: 'live' | 'simulated'; ok?: boolean; id?: string | null; message?: string; error?: string }> {
    const { data, error } = await supabase.functions.invoke('marketing-send-email', {
      body: {
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        from: params.from,
        campaign_id: params.campaignId ?? null,
        subscriber_id: params.subscriberId ?? null,
      },
    });
    if (error) throw new Error(error.message);
    return data as { mode: 'live' | 'simulated'; ok?: boolean; id?: string | null; message?: string; error?: string };
  }

  /**
   * إرسال حملة (محاكاة): يسجّل sent+delivered لكل مشترك مؤكّد في القائمة.
   * الإرسال الفعلي عبر المزوّد يُضاف كطبقة في نفس الدالة عند توفر المفتاح.
   */
  async sendCampaign(campaignId: string, subscriberIds: string[], variantId?: string): Promise<number> {
    let count = 0;
    for (const sid of subscriberIds) {
      await this.recordEvent({ subscriberId: sid, eventType: 'sent', campaignId, variantId, source: 'campaign' });
      await this.recordEvent({ subscriberId: sid, eventType: 'delivered', campaignId, variantId, source: 'campaign' });
      count++;
    }
    return count;
  }

  async campaignKpis(campaignId: string): Promise<EmailKpis> {
    const { data, error } = await supabase.rpc('email_campaign_kpis', { p_campaign_id: campaignId });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    return this.computeRates({
      sent: Number(row.sent || 0), delivered: Number(row.delivered || 0),
      opened: Number(row.opened || 0), clicked: Number(row.clicked || 0),
      bounced: Number(row.bounced || 0), unsubscribed: Number(row.unsubscribed || 0),
      complained: Number(row.complained || 0),
    });
  }

  /** KPIs إجمالية للمستأجر (كل مصادر البريد) — للوحة التحليلات */
  async overallKpis(): Promise<EmailKpis> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('email_events').select('event_type');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data || []) as Array<{ event_type: EmailEventType }>;
    const c = (t: EmailEventType) => rows.filter((r) => r.event_type === t).length;
    return this.computeRates({
      sent: c('sent'), delivered: c('delivered'), opened: c('opened'), clicked: c('clicked'),
      bounced: c('bounced'), unsubscribed: c('unsubscribed'), complained: c('complained'),
    });
  }

  private computeRates(k: Omit<EmailKpis, 'openRate' | 'ctor' | 'ctr' | 'unsubscribeRate' | 'spamRate' | 'bounceRate'>): EmailKpis {
    const pct = (part: number, total: number) => (total <= 0 ? 0 : Math.round((part / total) * 1000) / 10);
    return {
      ...k,
      openRate: pct(k.opened, k.delivered),
      ctor: pct(k.clicked, k.opened),
      ctr: pct(k.clicked, k.sent),
      unsubscribeRate: pct(k.unsubscribed, k.delivered),
      spamRate: pct(k.complained, k.sent),
      bounceRate: pct(k.bounced, k.sent),
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ثوابت مرجعية من التقرير
// ════════════════════════════════════════════════════════════════════════════

/** أفضل أيام/أوقات الإرسال (التوقيت الأمثل) */
export const BEST_SEND_TIMES = {
  days: [
    { day: 'الثلاثاء', note: 'الأعلى عالمياً في معدل الفتح', rank: 1 },
    { day: 'الأربعاء', note: 'ثاني أفضل يوم', rank: 2 },
    { day: 'الخميس', note: 'قوي للعروض والنشرات', rank: 3 },
    { day: 'الجمعة/السبت', note: 'معدلات أقل عموماً', rank: 4 },
  ],
  windows: [
    { audience: 'B2B', time: '9–11 صباحاً', note: 'بتوقيت المستلم' },
    { audience: 'B2C', time: '8–10 مساءً', note: 'تصفح ما قبل النوم' },
    { audience: 'عروض/خصومات', time: 'الخميس والجمعة', note: '' },
  ],
};

/** جدول تأثير المصادقة على الوصول (من التقرير) */
export const AUTH_DELIVERABILITY = [
  { scenario: 'بدون SPF/DKIM/DMARC', rate: '< 40%' },
  { scenario: 'SPF فقط', rate: '60-70%' },
  { scenario: 'SPF + DKIM', rate: '80-85%' },
  { scenario: 'SPF + DKIM + DMARC (reject)', rate: '98.16%' },
];

/** حدود KPIs الصحية (للتنبيهات) */
export const KPI_TARGETS = {
  openRate: '20-35%', ctor: '15-25%', ctr: '2-5%',
  unsubscribeRate: '< 0.5%', spamRate: '< 0.1%', bounceRate: '< 2%',
};

// ════════════════════════════════════════════════════════════════════════════
//  Singletons
// ════════════════════════════════════════════════════════════════════════════
export const senderDomainService = new SenderDomainService();
export const emailListService = new EmailListService();
export const emailSubscriberService = new EmailSubscriberService();
export const emailSegmentService = new EmailSegmentService();
export const emailTemplateService = new EmailTemplateService();
export const emailCampaignService = new EmailCampaignService();
export const campaignVariantService = new CampaignVariantService();
export const emailDeliveryService = new EmailDeliveryService();
