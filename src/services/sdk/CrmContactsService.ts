/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CrmContactsService — بوابة CRM، الوحدة 1: جهات الاتصال والحسابات (التقرير 01)
 *
 *  يغلّف جداول ودوال migration 0165:
 *    • crm_accounts            → الحسابات (الشركات) + Hierarchy + Firmographic + LTV
 *    • crm_contacts            → جهات الاتصال (الأشخاص) 360° + سياق تجاري + GDPR
 *    • crm_activities_timeline → الجدول الزمني الموحّد (تلقائي/يدوي)
 *    • crm_merge_log / crm_audit_log → سجل الدمج + التدقيق (GDPR)
 *
 *  الدوال (RPC):
 *    crm_account_360 · crm_find_duplicate_contacts · crm_merge_contacts ·
 *    crm_convert_lead · crm_enrich_account · crm_gdpr_erase_contact.
 *
 *  الإثراء الخارجي (Clearbit/Apollo) hook — محاكاة (simulated) حتى إدخال المفاتيح.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────────────────

export type AccountType = 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor';
export type AccountTier = 'smb' | 'mid_market' | 'enterprise' | 'strategic';
export type EnrichmentStatus = 'none' | 'pending' | 'simulated' | 'enriched' | 'failed';

export interface CrmAccount {
  id: string; tenant_id: string;
  name: string; legal_name: string | null; registration_number: string | null;
  industry: string | null; employee_count: number | null; annual_revenue: number | null;
  website: string | null; linkedin_url: string | null; phone: string | null;
  country: string | null; city: string | null; address: string | null; timezone: string | null;
  account_type: AccountType; account_tier: AccountTier;
  owner_id: string | null; parent_account_id: string | null;
  lifetime_value: number; first_deal_at: string | null; last_deal_at: string | null;
  renewal_date: string | null; health_score: number;
  enrichment_status: EnrichmentStatus; enrichment_provider: string | null; enriched_at: string | null;
  tags: string[]; notes: string | null;
  is_merged: boolean; merged_into_id: string | null;
  created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null;
}
export interface CrmAccountInput {
  name: string; legal_name?: string | null; registration_number?: string | null;
  industry?: string | null; employee_count?: number | null; annual_revenue?: number | null;
  website?: string | null; linkedin_url?: string | null; phone?: string | null;
  country?: string | null; city?: string | null; address?: string | null;
  account_type?: AccountType; account_tier?: AccountTier;
  owner_id?: string | null; parent_account_id?: string | null;
  renewal_date?: string | null; tags?: string[]; notes?: string | null;
}

export type DecisionRole = 'decision_maker' | 'influencer' | 'user' | 'gatekeeper';
export type ContactTemperature = 'cold' | 'warm' | 'hot';

export interface CrmContact {
  id: string; tenant_id: string; account_id: string | null;
  first_name: string; last_name: string | null; full_name: string;
  job_title: string | null; department: string | null;
  email: string | null; phone: string | null; mobile: string | null;
  linkedin_url: string | null; country: string | null; city: string | null;
  timezone: string | null; preferred_language: string | null;
  decision_role: DecisionRole; estimated_budget: number | null; source: string | null;
  first_contacted_at: string | null; last_activity_at: string | null;
  tags: string[]; temperature: ContactTemperature; owner_id: string | null;
  enrichment_status: EnrichmentStatus; enrichment_provider: string | null; enriched_at: string | null;
  consent_source: string | null; consent_at: string | null; gdpr_erased: boolean;
  lead_id: string | null; is_merged: boolean; merged_into_id: string | null;
  notes: string | null; created_by: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface CrmContactInput {
  account_id?: string | null;
  first_name: string; last_name?: string | null; job_title?: string | null; department?: string | null;
  email?: string | null; phone?: string | null; mobile?: string | null; linkedin_url?: string | null;
  country?: string | null; city?: string | null; preferred_language?: string | null;
  decision_role?: DecisionRole; estimated_budget?: number | null; source?: string | null;
  tags?: string[]; temperature?: ContactTemperature; owner_id?: string | null;
  consent_source?: string | null; notes?: string | null;
}

export type ActivityType =
  | 'email' | 'call' | 'meeting' | 'note' | 'task'
  | 'marketing_email' | 'web_visit' | 'support_ticket' | 'deal' | 'system';
export type ActivityDirection = 'inbound' | 'outbound' | 'internal';
export type LoggedVia = 'manual' | 'auto' | 'simulated' | 'import';

export interface CrmActivity {
  id: string; tenant_id: string; contact_id: string | null; account_id: string | null;
  activity_type: ActivityType; direction: ActivityDirection | null;
  title: string; body: string | null; duration_minutes: number | null;
  occurred_at: string; logged_via: LoggedVia; metadata: Record<string, unknown>;
  created_by: string | null; created_at: string;
}
export interface CrmActivityInput {
  contact_id?: string | null; account_id?: string | null;
  activity_type: ActivityType; direction?: ActivityDirection | null;
  title: string; body?: string | null; duration_minutes?: number | null;
  occurred_at?: string | null;
}

export interface Account360 {
  contactsCount: number; activitiesCount: number;
  lastActivityAt: string | null; healthScore: number; lifetimeValue: number; openTickets: number;
}
export interface DuplicateCandidate {
  candidateId: string; fullName: string; email: string | null; phone: string | null; matchReason: string;
}
export interface CrmMergeLogEntry {
  id: string; tenant_id: string; entity_type: 'contact' | 'account';
  survivor_id: string; merged_id: string; merged_snapshot: Record<string, unknown>;
  merged_by: string | null; merged_at: string;
}
export interface CrmAuditEntry {
  id: string; tenant_id: string; entity_type: string; entity_id: string;
  action: 'view' | 'create' | 'update' | 'delete' | 'merge' | 'enrich' | 'gdpr_erase';
  actor_id: string | null; details: Record<string, unknown>; created_at: string;
}

// ─── الخدمات ────────────────────────────────────────────────────────────────

class CrmAccountService extends BaseService<CrmAccount> {
  constructor() { super('crm_accounts'); }

  listAccounts() {
    return this.findWhere(
      [{ column: 'is_merged', value: false }, { column: 'deleted_at', operator: 'is', value: null }],
      { orderBy: 'created_at', ascending: false },
    );
  }
  createAccount(input: CrmAccountInput) { return this.create(input as Partial<CrmAccount>); }
  updateAccount(id: string, input: Partial<CrmAccountInput>) { return this.update(id, input as Partial<CrmAccount>); }

  /** الحسابات الفرعية لحساب أم (Hierarchy) */
  childAccounts(parentId: string) {
    return this.findWhere([{ column: 'parent_account_id', value: parentId }], { orderBy: 'name' });
  }

  /** الرؤية 360° عبر دالة DB */
  async account360(accountId: string): Promise<Account360> {
    const { data, error } = await supabase.rpc('crm_account_360', { p_account_id: accountId });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      contactsCount: Number(r.contacts_count || 0),
      activitiesCount: Number(r.activities_count || 0),
      lastActivityAt: r.last_activity_at ?? null,
      healthScore: Number(r.health_score || 0),
      lifetimeValue: Number(r.lifetime_value || 0),
      openTickets: Number(r.open_tickets || 0),
    };
  }

  /** إثراء البيانات (محاكاة حتى إدخال مفاتيح Clearbit/Apollo) */
  /**
   * إثراء بيانات الحساب عبر الوسيط (Clearbit) — Edge Function crm-enrich-account.
   *   - مع مفتاح CLEARBIT_API_KEY → إثراء فعلي (يملأ الفراغات: قطاع/موظفون/إيراد/موقع...).
   *   - بلا مفتاح → mode='simulated' (لا يفشل، يعلّم الحساب simulated).
   * تُرجع وضع التشغيل لإخبار المستخدم.
   */
  async enrich(accountId: string): Promise<{ mode: 'live' | 'simulated'; ok?: boolean; message?: string; error?: string }> {
    const { data, error } = await supabase.functions.invoke('crm-enrich-account', {
      body: { account_id: accountId },
    });
    if (error) throw new Error(error.message);
    return data as { mode: 'live' | 'simulated'; ok?: boolean; message?: string; error?: string };
  }
}

class CrmContactService extends BaseService<CrmContact> {
  constructor() { super('crm_contacts'); }

  listContacts() {
    return this.findWhere(
      [{ column: 'is_merged', value: false }, { column: 'deleted_at', operator: 'is', value: null }],
      { orderBy: 'created_at', ascending: false },
    );
  }
  listForAccount(accountId: string) {
    return this.findWhere(
      [{ column: 'account_id', value: accountId }, { column: 'is_merged', value: false }],
      { orderBy: 'created_at', ascending: false },
    );
  }
  createContact(input: CrmContactInput) { return this.create(input as Partial<CrmContact>); }
  updateContact(id: string, input: Partial<CrmContactInput>) { return this.update(id, input as Partial<CrmContact>); }

  /** كشف المكررات المرشّحة لجهة اتصال */
  async findDuplicates(contactId: string): Promise<DuplicateCandidate[]> {
    const { data, error } = await supabase.rpc('crm_find_duplicate_contacts', { p_contact_id: contactId });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      candidateId: String(r.candidate_id),
      fullName: String(r.full_name ?? ''),
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      matchReason: String(r.match_reason ?? ''),
    }));
  }

  /** الدمج الذكي — يحتفظ بالسجل الباقي ويحوّل الأنشطة ويسجّل */
  async merge(survivorId: string, mergedId: string): Promise<string> {
    const { data, error } = await supabase.rpc('crm_merge_contacts', {
      p_survivor_id: survivorId, p_merged_id: mergedId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** تحويل عميل تسويقي (marketing_leads) إلى جهة اتصال CRM */
  async convertLead(leadId: string): Promise<string> {
    const { data, error } = await supabase.rpc('crm_convert_lead', { p_lead_id: leadId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** حذف بيانات جهة اتصال (GDPR — حذف فعلي كامل) */
  async gdprErase(contactId: string): Promise<void> {
    const { error } = await supabase.rpc('crm_gdpr_erase_contact', { p_contact_id: contactId });
    if (error) throw new Error(error.message);
  }
}

class CrmActivityService extends BaseService<CrmActivity> {
  constructor() { super('crm_activities_timeline'); }

  /** الجدول الزمني الموحّد لجهة اتصال (الأحدث أولاً) */
  timelineForContact(contactId: string) {
    return this.findWhere([{ column: 'contact_id', value: contactId }], { orderBy: 'occurred_at', ascending: false });
  }
  timelineForAccount(accountId: string) {
    return this.findWhere([{ column: 'account_id', value: accountId }], { orderBy: 'occurred_at', ascending: false });
  }
  logActivity(input: CrmActivityInput) {
    const payload: Partial<CrmActivity> = {
      ...input,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      logged_via: 'manual',
    };
    return this.create(payload);
  }
}

class CrmAuditService extends BaseService<CrmAuditEntry> {
  constructor() { super('crm_audit_log'); }
  recent(limit = 50) { return this.findAll({ orderBy: 'created_at', ascending: false, limit }); }
  forEntity(entityType: string, entityId: string) {
    return this.findWhere(
      [{ column: 'entity_type', value: entityType }, { column: 'entity_id', value: entityId }],
      { orderBy: 'created_at', ascending: false },
    );
  }
}

/** جلب العملاء التسويقيين غير المحوّلين بعد (للربط في واجهة التحويل) */
export async function listConvertibleLeads(): Promise<Array<{ id: string; full_name: string; company: string | null; email: string | null; temperature: string }>> {
  const tenantId = getCurrentTenantId();
  let q = supabase
    .from('marketing_leads')
    .select('id, full_name, company, email, temperature')
    .order('created_at', { ascending: false })
    .limit(100);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as Array<{ id: string; full_name: string; company: string | null; email: string | null; temperature: string }>;
}

// ─── ثوابت مرجعية من التقرير ─────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  prospect: 'عميل محتمل', customer: 'عميل فعلي', partner: 'شريك', vendor: 'مورّد', competitor: 'منافس',
};
export const ACCOUNT_TYPE_COLOR: Record<AccountType, string> = {
  prospect: 'bg-sky-50 text-sky-600 border-sky-200',
  customer: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  partner: 'bg-violet-50 text-violet-600 border-violet-200',
  vendor: 'bg-amber-50 text-amber-600 border-amber-200',
  competitor: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const ACCOUNT_TIER_LABEL: Record<AccountTier, string> = {
  smb: 'شركة صغيرة (SMB)', mid_market: 'سوق متوسط', enterprise: 'مؤسسة كبيرة', strategic: 'استراتيجي',
};
export const DECISION_ROLE_LABEL: Record<DecisionRole, string> = {
  decision_maker: 'صاحب قرار', influencer: 'مؤثّر', user: 'مستخدم', gatekeeper: 'حارس بوابة',
};
export const DECISION_ROLE_COLOR: Record<DecisionRole, string> = {
  decision_maker: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  influencer: 'bg-sky-50 text-sky-600 border-sky-200',
  user: 'bg-slate-100 text-slate-500 border-slate-200',
  gatekeeper: 'bg-amber-50 text-amber-600 border-amber-200',
};
export const TEMPERATURE_LABEL: Record<ContactTemperature, string> = {
  cold: 'بارد', warm: 'دافئ', hot: 'ساخن',
};
export const TEMPERATURE_COLOR: Record<ContactTemperature, string> = {
  cold: 'bg-slate-100 text-slate-500 border-slate-200',
  warm: 'bg-amber-50 text-amber-600 border-amber-200',
  hot: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  email: 'بريد', call: 'مكالمة', meeting: 'اجتماع', note: 'ملاحظة', task: 'مهمة',
  marketing_email: 'بريد تسويقي', web_visit: 'زيارة موقع', support_ticket: 'تذكرة دعم',
  deal: 'صفقة', system: 'نظام',
};
export const ACTIVITY_TYPE_ICON: Record<ActivityType, string> = {
  email: '📧', call: '📞', meeting: '📅', note: '📝', task: '✅',
  marketing_email: '📩', web_visit: '🔗', support_ticket: '🎧', deal: '💼', system: '⚙️',
};
export const ENRICHMENT_PROVIDERS = ['clearbit', 'apollo', 'zoominfo'] as const;

// ─── Singletons ──────────────────────────────────────────────────────────────
export const crmAccountService = new CrmAccountService();
export const crmContactService = new CrmContactService();
export const crmActivityService = new CrmActivityService();
export const crmAuditService = new CrmAuditService();
