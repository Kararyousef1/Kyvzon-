/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MarketingMessagingService — خدمة وحدة الرسائل النصية والواتساب (التقرير 4)
 *
 *  يغلّف جداول ودوال migration 0159/0160:
 *    • messaging_gateways      → بوابات المراسلة (Twilio/MessageBird/Meta) — adapter
 *    • messaging_contacts      → جهات الاتصال + الموافقة + Opt-out
 *    • messaging_consent_log   → سجل الموافقات (إثبات قانوني)
 *    • whatsapp_templates      → قوالب واتساب المعتمدة (حالة Meta)
 *    • sms_templates           → قوالب SMS
 *    • messaging_campaigns     → الحملات
 *    • messaging_messages      → الرسائل (سجل محادثات + تحليلات + ربط الأتمتة)
 *
 *  الدوال (RPC): send_messaging · process_stop_reply · messaging_kpis · whatsapp_warmup_schedule.
 *  الإرسال الخارجي (Twilio/Meta) hook — محاكاة حتى إدخال مفتاح المزوّد.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export type MessagingChannel = 'sms' | 'whatsapp';
export type MessagingProvider = 'simulation' | 'twilio' | 'messagebird' | 'meta_cloud';

export interface MessagingGateway {
  id: string; tenant_id: string; channel: MessagingChannel; provider: MessagingProvider;
  sender_id: string | null; is_connected: boolean; daily_limit: number;
  warmup_started_at: string | null; created_at: string; updated_at: string;
}
export interface MessagingGatewayInput {
  channel: MessagingChannel; provider?: MessagingProvider; sender_id?: string | null; daily_limit?: number;
}

export interface MessagingContact {
  id: string; tenant_id: string; phone: string; full_name: string | null; lead_id: string | null;
  sms_consent: boolean; sms_consent_at: string | null;
  wa_consent: boolean; wa_consent_at: string | null;
  sms_opted_out: boolean; wa_opted_out: boolean; opted_out_at: string | null;
  country: string | null; timezone: string | null; tags: string[];
  created_at: string; updated_at: string;
}
export interface MessagingContactInput {
  phone: string; full_name?: string | null; country?: string | null;
  sms_consent?: boolean; wa_consent?: boolean; tags?: string[];
}

export type WaCategory = 'utility' | 'marketing' | 'authentication';
export type WaApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export interface WhatsappTemplate {
  id: string; tenant_id: string; name: string; category: WaCategory; language: string;
  body: string; approval_status: WaApprovalStatus; rejection_reason: string | null;
  created_at: string; updated_at: string;
}
export interface WhatsappTemplateInput {
  name: string; category?: WaCategory; language?: string; body: string;
}

export type SmsType = 'promotional' | 'transactional' | 'reminder' | 'survey';
export interface SmsTemplate {
  id: string; tenant_id: string; name: string; sms_type: SmsType; body: string; created_at: string; updated_at: string;
}

export type MessagingCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
export interface MessagingCampaign {
  id: string; tenant_id: string; name: string; channel: MessagingChannel;
  sms_type: SmsType | null; wa_template_id: string | null; body: string;
  status: MessagingCampaignStatus; scheduled_at: string | null; sent_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface MessagingCampaignInput {
  name: string; channel: MessagingChannel; sms_type?: SmsType | null;
  wa_template_id?: string | null; body?: string; scheduled_at?: string | null;
}

export type MessageStatus = 'simulated' | 'queued' | 'sent' | 'delivered' | 'read' | 'clicked' | 'failed' | 'opted_out';
export interface MessagingMessage {
  id: string; tenant_id: string; contact_id: string | null; campaign_id: string | null;
  channel: MessagingChannel; direction: 'outbound' | 'inbound'; body: string;
  source: 'campaign' | 'automation' | 'transactional' | 'reply';
  workflow_id: string | null; status: MessageStatus; delivery_mode: 'simulated' | 'live';
  error_message: string | null; created_at: string;
}

export interface MessagingKpis {
  sent: number; delivered: number; read: number; clicked: number; optedOut: number; failed: number;
  deliveryRate: number; optOutRate: number; clickRate: number;
}
export interface WaWarmupWeek { week_label: string; daily_limit: number; }

// ════════════════════════════════════════════════════════════════════════════
//  الخدمات
// ════════════════════════════════════════════════════════════════════════════

class MessagingGatewayService extends BaseService<MessagingGateway> {
  constructor() { super('messaging_gateways'); }
  listGateways() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createGateway(input: MessagingGatewayInput) {
    return this.create({ ...input, provider: input.provider ?? 'simulation', is_connected: false } as Partial<MessagingGateway>);
  }
  connect(id: string) { return this.update(id, { is_connected: true, warmup_started_at: new Date().toISOString() } as Partial<MessagingGateway>); }
  async warmupSchedule(): Promise<WaWarmupWeek[]> {
    const { data, error } = await supabase.rpc('whatsapp_warmup_schedule');
    if (error) throw new Error(error.message);
    return (data || []) as WaWarmupWeek[];
  }
}

class MessagingContactService extends BaseService<MessagingContact> {
  constructor() { super('messaging_contacts'); }
  listContacts() { return this.findAll({ orderBy: 'created_at', ascending: false }); }

  /** إضافة جهة اتصال مع تسجيل الموافقة في سجل audit */
  async addContact(input: MessagingContactInput): Promise<MessagingContact> {
    const now = new Date().toISOString();
    const contact = await this.create({
      ...input,
      sms_consent_at: input.sms_consent ? now : null,
      wa_consent_at: input.wa_consent ? now : null,
    } as Partial<MessagingContact>);
    const tenantId = getCurrentTenantId();
    const logs: Array<Record<string, unknown>> = [];
    if (input.sms_consent) logs.push({ tenant_id: tenantId, contact_id: contact.id, phone: input.phone, channel: 'sms', action: 'opt_in', method: 'manual' });
    if (input.wa_consent) logs.push({ tenant_id: tenantId, contact_id: contact.id, phone: input.phone, channel: 'whatsapp', action: 'opt_in', method: 'manual' });
    if (logs.length) await supabase.from('messaging_consent_log').insert(logs);
    return contact;
  }

  /** معالجة رد STOP → Opt-out فوري عبر دالة DB */
  async processStop(contactId: string, channel: MessagingChannel): Promise<void> {
    const { error } = await supabase.rpc('process_stop_reply', { p_contact_id: contactId, p_channel: channel });
    if (error) throw new Error(error.message);
  }
}

class WhatsappTemplateService extends BaseService<WhatsappTemplate> {
  constructor() { super('whatsapp_templates'); }
  listTemplates() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createTemplate(input: WhatsappTemplateInput) {
    return this.create({ ...input, category: input.category ?? 'utility', approval_status: 'draft' } as Partial<WhatsappTemplate>);
  }
  /** محاكاة تقديم للموافقة (يُستبدل بطلب Meta فعلي) */
  submitForApproval(id: string) { return this.update(id, { approval_status: 'pending' } as Partial<WhatsappTemplate>); }
  /** محاكاة موافقة Meta */
  approve(id: string) { return this.update(id, { approval_status: 'approved' } as Partial<WhatsappTemplate>); }
}

class SmsTemplateService extends BaseService<SmsTemplate> {
  constructor() { super('sms_templates'); }
  listTemplates() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createTemplate(input: { name: string; sms_type: SmsType; body: string }) { return this.create(input as Partial<SmsTemplate>); }
}

class MessagingCampaignService extends BaseService<MessagingCampaign> {
  constructor() { super('messaging_campaigns'); }
  listCampaigns() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createCampaign(input: MessagingCampaignInput) { return this.create(input as Partial<MessagingCampaign>); }
  setStatus(id: string, status: MessagingCampaignStatus) {
    const patch: Partial<MessagingCampaign> = { status };
    if (status === 'sent') patch.sent_at = new Date().toISOString();
    return this.update(id, patch);
  }
}

class MessagingDeliveryService {
  /** إرسال رسالة عبر دالة DB (تفرض الموافقة و opt-out) */
  async send(params: {
    contactId: string; channel: MessagingChannel; body: string;
    campaignId?: string | null; source?: 'campaign' | 'automation' | 'transactional' | 'reply'; workflowId?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('send_messaging', {
      p_contact_id: params.contactId, p_channel: params.channel, p_body: params.body,
      p_campaign_id: params.campaignId ?? null, p_source: params.source ?? 'campaign', p_workflow_id: params.workflowId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** إرسال حملة لجهات الاتصال الموافقة */
  async sendCampaign(campaignId: string, channel: MessagingChannel, body: string, contactIds: string[]): Promise<number> {
    let n = 0;
    for (const cid of contactIds) {
      try { await this.send({ contactId: cid, channel, body, campaignId, source: 'campaign' }); n++; }
      catch { /* skip no-consent */ }
    }
    return n;
  }

  /**
   * إرسال فعلي عبر المزوّد (Twilio) — عبر Edge Function marketing-send-sms.
   *   - يتحقق من الموافقة/opt-out أولاً عبر send_messaging (يسجّل الرسالة).
   *   - ثم يحاول الإرسال الفعلي عبر Twilio؛ إن غاب المفتاح → mode='simulated'.
   *
   * تُرجع: { mode, ok?, sid?, messageId } — استخدم mode==='live' && ok للتأكد من الإرسال الفعلي.
   */
  async sendLive(params: {
    contactId: string; phone: string; channel: MessagingChannel; body: string;
    campaignId?: string | null; source?: 'campaign' | 'automation' | 'transactional' | 'reply'; workflowId?: string | null;
  }): Promise<{ mode: 'live' | 'simulated'; ok?: boolean; sid?: string | null; messageId: string; message?: string }> {
    // 1) تسجيل الرسالة (يفرض الموافقة و opt-out) — يعيد معرّف الرسالة
    const messageId = await this.send({
      contactId: params.contactId, channel: params.channel, body: params.body,
      campaignId: params.campaignId ?? null, source: params.source ?? 'campaign', workflowId: params.workflowId ?? null,
    });
    // 2) محاولة الإرسال الفعلي عبر المزوّد
    const { data, error } = await supabase.functions.invoke('marketing-send-sms', {
      body: { to: params.phone, body: params.body, channel: params.channel, message_id: messageId },
    });
    if (error) throw new Error(error.message);
    const res = data as { mode: 'live' | 'simulated'; ok?: boolean; sid?: string | null; message?: string };
    return { ...res, messageId };
  }

  /** سجل محادثة لجهة اتصال (كل الرسائل) */
  async conversation(contactId: string): Promise<MessagingMessage[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('messaging_messages').select('*').eq('contact_id', contactId).order('created_at', { ascending: true });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as MessagingMessage[];
  }

  async kpis(channel: MessagingChannel): Promise<MessagingKpis> {
    const { data, error } = await supabase.rpc('messaging_kpis', { p_channel: channel });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    const sent = Number(row.sent || 0), delivered = Number(row.delivered || 0);
    const read = Number(row.read_count || 0), clicked = Number(row.clicked || 0);
    const optedOut = Number(row.opted_out || 0), failed = Number(row.failed || 0);
    const pct = (p: number, t: number) => (t <= 0 ? 0 : Math.round((p / t) * 1000) / 10);
    return { sent, delivered, read, clicked, optedOut, failed,
      deliveryRate: pct(delivered, sent), optOutRate: pct(optedOut, sent), clickRate: pct(clicked, sent) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ثوابت مرجعية من التقرير
// ════════════════════════════════════════════════════════════════════════════

export const SMS_MAX_CHARS = 160;

export const SMS_TYPE_META: Record<SmsType, { label: string; desc: string }> = {
  promotional: { label: 'ترويجي', desc: 'عروض وخصومات — الإرسال 8ص-9م فقط' },
  transactional: { label: 'تشغيلي', desc: 'تأكيدات و OTP — معدل فتح 99%' },
  reminder: { label: 'تذكير', desc: 'يقلّل الغياب 30-40%' },
  survey: { label: 'استطلاع', desc: 'استجابة أعلى بـ45% من البريد' },
};

/** مقارنة SMS مقابل WhatsApp (من التقرير) */
export const SMS_VS_WA = [
  { metric: 'معدل الفتح', sms: '95-98%', wa: '95-98%' },
  { metric: 'معدل الرد', sms: '5-10%', wa: '40-60%' },
  { metric: 'وسائط غنية', sms: '❌ نص فقط', wa: '✅ صور/فيديو/أزرار' },
  { metric: 'محادثة ثنائية', sms: 'محدودة', wa: '✅ كاملة' },
  { metric: 'التكلفة', sms: 'منخفضة', wa: 'متوسطة' },
];

/** حدود KPIs الصحية */
export const MESSAGING_KPI_TARGETS = {
  deliveryRate: '> 95%', openRate: '90-98%', clickRate: '20-35%', optOutRate: '< 2%', conversionRate: '5-15%',
};

// ════════════════════════════════════════════════════════════════════════════
//  Singletons
// ════════════════════════════════════════════════════════════════════════════
export const messagingGatewayService = new MessagingGatewayService();
export const messagingContactService = new MessagingContactService();
export const whatsappTemplateService = new WhatsappTemplateService();
export const smsTemplateService = new SmsTemplateService();
export const messagingCampaignService = new MessagingCampaignService();
export const messagingDeliveryService = new MessagingDeliveryService();
