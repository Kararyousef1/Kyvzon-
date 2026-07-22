/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MarketingSocialService — خدمة وحدة وسائل التواصل الاجتماعي (التقرير 3)
 *
 *  يغلّف جداول ودوال migration 0158:
 *    • social_accounts        → إدارة الحسابات (OAuth hook + محاكاة)
 *    • social_posts / targets → المنشورات + النشر الموحّد لكل منصة
 *    • social_interactions    → مركز التفاعل الموحّد (Inbox)
 *    • social_utm_links       → توليد UTM + الإسناد (Attribution/ROI)
 *    • social_listening_*     → الاستماع الاجتماعي
 *
 *  الدوال (RPC): build_utm_url · convert_interaction_to_lead · social_kpis.
 *  الربط الفعلي بالمنصات (OAuth/API) hook — محاكاة حتى إدخال بيانات تطبيق.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok';

export interface SocialAccount {
  id: string;
  tenant_id: string;
  platform: SocialPlatform;
  account_name: string;
  account_handle: string | null;
  is_connected: boolean;
  connection_mode: 'simulation' | 'oauth';
  external_id: string | null;
  followers: number;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SocialAccountInput {
  platform: SocialPlatform;
  account_name: string;
  account_handle?: string | null;
  followers?: number;
}

export type ContentType = 'post' | 'reel' | 'story' | 'case_study' | 'educational' | 'infographic' | 'poll';
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';
export interface SocialPost {
  id: string;
  tenant_id: string;
  content: string;
  media_urls: string[];
  link_url: string | null;
  content_type: ContentType;
  campaign_name: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface SocialPostInput {
  content: string;
  media_urls?: string[];
  link_url?: string | null;
  content_type?: ContentType;
  campaign_name?: string | null;
  status?: PostStatus;
  scheduled_at?: string | null;
}

export interface PostTarget {
  id: string;
  tenant_id: string;
  post_id: string;
  account_id: string;
  platform: string;
  status: 'scheduled' | 'published' | 'failed';
  external_post_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  error_message: string | null;
  reach: number; impressions: number; likes: number;
  comments_count: number; shares: number; saves: number; clicks: number;
  created_at: string;
}
export interface PostTargetInput {
  post_id: string; account_id: string; platform: string;
  status?: 'scheduled' | 'published' | 'failed'; scheduled_at?: string | null;
}

export type InteractionType = 'comment' | 'dm' | 'mention' | 'ad_comment';
export type InteractionStatus = 'pending' | 'replied' | 'assigned' | 'closed';
export interface SocialInteraction {
  id: string;
  tenant_id: string;
  account_id: string | null;
  post_id: string | null;
  platform: string;
  interaction_type: InteractionType;
  author_name: string | null;
  author_handle: string | null;
  message: string;
  status: InteractionStatus;
  assigned_to: string | null;
  reply_text: string | null;
  replied_at: string | null;
  converted_lead_id: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface SocialInteractionInput {
  account_id?: string | null;
  post_id?: string | null;
  platform: string;
  interaction_type: InteractionType;
  author_name?: string | null;
  author_handle?: string | null;
  message: string;
  status?: InteractionStatus;
}

export interface UtmLink {
  id: string;
  tenant_id: string;
  post_id: string | null;
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  full_url: string;
  clicks: number;
  conversions: number;
  attributed_revenue: number;
  created_at: string;
}

export type TermType = 'brand' | 'keyword' | 'competitor';
export interface ListeningTerm {
  id: string; tenant_id: string; term: string; term_type: TermType; is_active: boolean; created_at: string;
}
export interface ListeningMention {
  id: string; tenant_id: string; term_id: string | null; platform: string;
  author_name: string | null; content: string;
  sentiment: 'positive' | 'neutral' | 'negative'; is_opportunity: boolean;
  converted_lead_id: string | null; created_at: string;
}

export interface SocialKpis {
  totalReach: number; totalImpressions: number; totalEngagements: number;
  totalClicks: number; attributedRevenue: number; publishedPosts: number;
  engagementRate: number; // engagements/reach
  clickThroughRate: number; // clicks/impressions
}

// ════════════════════════════════════════════════════════════════════════════
//  الخدمات
// ════════════════════════════════════════════════════════════════════════════

class SocialAccountService extends BaseService<SocialAccount> {
  constructor() { super('social_accounts'); }
  listAccounts() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createAccount(input: SocialAccountInput) {
    return this.create({ ...input, is_connected: false, connection_mode: 'simulation' } as Partial<SocialAccount>);
  }
  /** محاكاة إتمام OAuth (يُستبدل بتدفق OAuth فعلي عند توفر بيانات التطبيق) */
  connect(id: string) {
    return this.update(id, { is_connected: true, connected_at: new Date().toISOString() } as Partial<SocialAccount>);
  }
  disconnect(id: string) { return this.update(id, { is_connected: false } as Partial<SocialAccount>); }

  /**
   * بدء تدفّق OAuth الحقيقي لربط منصة — Edge Function social-oauth-start.
   *   - مع مفاتيح تطبيق المنصة → يعيد authorize_url لتوجيه المستخدم إليه.
   *   - بلا مفاتيح → mode='simulated' (استخدم connect() للمحاكاة).
   */
  async startOAuth(provider: SocialPlatform): Promise<{ mode: 'live' | 'simulated'; ok?: boolean; authorizeUrl?: string; message?: string }> {
    const { data, error } = await supabase.functions.invoke('social-oauth-start', { body: { provider } });
    if (error) throw new Error(error.message);
    const r = data as { mode: 'live' | 'simulated'; ok?: boolean; authorize_url?: string; message?: string };
    return { mode: r.mode, ok: r.ok, authorizeUrl: r.authorize_url, message: r.message };
  }

  /** فكّ ربط حساب اجتماعي (يحذف الرمز السرّي عبر دالة DB) */
  async disconnectOAuth(accountId: string): Promise<void> {
    const { error } = await supabase.rpc('disconnect_social_account', { p_account_id: accountId });
    if (error) throw new Error(error.message);
  }
}

class SocialPostService extends BaseService<SocialPost> {
  constructor() { super('social_posts'); }
  listPosts() { return this.findAll({ orderBy: 'scheduled_at', ascending: false }); }
  createPost(input: SocialPostInput) { return this.create(input as Partial<SocialPost>); }
  publish(id: string) {
    return this.update(id, { status: 'published', published_at: new Date().toISOString() } as Partial<SocialPost>);
  }

  async addTarget(input: PostTargetInput): Promise<PostTarget> {
    const tenantId = getCurrentTenantId();
    const { data, error } = await supabase.from('social_post_targets')
      .insert({ ...input, tenant_id: tenantId }).select().single();
    if (error) throw new Error(error.message);
    return data as PostTarget;
  }
  async listTargets(postId: string): Promise<PostTarget[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('social_post_targets').select('*').eq('post_id', postId);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as PostTarget[];
  }
}

class SocialInteractionService extends BaseService<SocialInteraction> {
  constructor() { super('social_interactions'); }
  listInbox(status?: InteractionStatus) {
    return this.findAll(status ? { filters: { status }, orderBy: 'created_at', ascending: false } : { orderBy: 'created_at', ascending: false });
  }
  createInteraction(input: SocialInteractionInput) { return this.create(input as Partial<SocialInteraction>); }
  reply(id: string, text: string) {
    return this.update(id, { reply_text: text, status: 'replied', replied_at: new Date().toISOString() } as Partial<SocialInteraction>);
  }
  assign(id: string, userId: string) {
    return this.update(id, { assigned_to: userId, status: 'assigned' } as Partial<SocialInteraction>);
  }
  /** تحويل التفاعل إلى عميل محتمل (الوحدة 1) عبر دالة DB */
  async convertToLead(interactionId: string, ownerId?: string): Promise<string> {
    const { data, error } = await supabase.rpc('convert_interaction_to_lead', {
      p_interaction_id: interactionId, p_owner_id: ownerId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class SocialUtmService extends BaseService<UtmLink> {
  constructor() { super('social_utm_links'); }
  listAll() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  /** توليد رابط UTM كامل عبر دالة DB */
  async buildUrl(params: {
    base: string; source: string; medium?: string; campaign?: string; content?: string; term?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('build_utm_url', {
      p_base: params.base, p_source: params.source, p_medium: params.medium ?? 'social',
      p_campaign: params.campaign ?? null, p_content: params.content ?? null, p_term: params.term ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async createLink(input: Partial<UtmLink>): Promise<UtmLink> { return this.create(input); }
}

class SocialListeningService {
  private termsBase = new (class extends BaseService<ListeningTerm> { constructor() { super('social_listening_terms'); } })();
  private mentionsBase = new (class extends BaseService<ListeningMention> { constructor() { super('social_listening_mentions'); } })();

  listTerms() { return this.termsBase.findAll({ orderBy: 'created_at', ascending: false }); }
  createTerm(term: string, type: TermType) {
    return this.termsBase.create({ term, term_type: type, is_active: true } as Partial<ListeningTerm>);
  }
  listMentions() { return this.mentionsBase.findAll({ orderBy: 'created_at', ascending: false }); }
  async convertMentionToLead(mentionId: string): Promise<void> {
    // تحويل مباشر بسيط: يعلّم الفرصة (التحويل الكامل عبر الـ interaction أو يدوي)
    await this.mentionsBase.update(mentionId, { is_opportunity: true } as Partial<ListeningMention>);
  }
}

class SocialAnalyticsService {
  async kpis(): Promise<SocialKpis> {
    const { data, error } = await supabase.rpc('social_kpis');
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    const reach = Number(row.total_reach || 0);
    const impressions = Number(row.total_impressions || 0);
    const engagements = Number(row.total_engagements || 0);
    const clicks = Number(row.total_clicks || 0);
    const pct = (p: number, t: number) => (t <= 0 ? 0 : Math.round((p / t) * 1000) / 10);
    return {
      totalReach: reach, totalImpressions: impressions, totalEngagements: engagements,
      totalClicks: clicks, attributedRevenue: Number(row.attributed_revenue || 0),
      publishedPosts: Number(row.published_posts || 0),
      engagementRate: pct(engagements, reach),
      clickThroughRate: pct(clicks, impressions),
    };
  }

  /** ROI مُنسب لكل منصة (تجميع من روابط UTM) */
  async revenueByPlatform(): Promise<Array<{ platform: string; revenue: number; clicks: number; conversions: number }>> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('social_utm_links').select('utm_source, attributed_revenue, clicks, conversions');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const map = new Map<string, { platform: string; revenue: number; clicks: number; conversions: number }>();
    for (const r of (data || []) as Array<{ utm_source: string; attributed_revenue: number; clicks: number; conversions: number }>) {
      const cur = map.get(r.utm_source) || { platform: r.utm_source, revenue: 0, clicks: 0, conversions: 0 };
      cur.revenue += Number(r.attributed_revenue || 0);
      cur.clicks += Number(r.clicks || 0);
      cur.conversions += Number(r.conversions || 0);
      map.set(r.utm_source, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ثوابت مرجعية من التقرير
// ════════════════════════════════════════════════════════════════════════════

export const PLATFORM_META: Record<SocialPlatform, { label: string; audience: string; bestContent: string }> = {
  facebook: { label: 'Facebook', audience: '25-55 · متنوع', bestContent: 'فيديو قصير، مجتمعي، إعلانات' },
  instagram: { label: 'Instagram', audience: '18-34 · قوي بالشرق الأوسط', bestContent: 'Reels، Stories، صور' },
  linkedin: { label: 'LinkedIn', audience: 'محترفون وصانعو قرار', bestContent: 'دراسات حالة، مقالات — الأهم لـ B2B' },
  x: { label: 'X', audience: 'تقنيون وصحفيون', bestContent: 'أفكار قصيرة، تحديثات، محادثات' },
  tiktok: { label: 'TikTok', audience: '18-30 · ناشئ بالـ SaaS', bestContent: 'فيديو تعليمي/ترفيهي' },
};

/** جدول تردد النشر الموصى به (من التقرير) */
export const POSTING_FREQUENCY = [
  { platform: 'LinkedIn', frequency: '3-5 مرات أسبوعياً', bestTime: 'الثلاثاء-الخميس 8-10ص' },
  { platform: 'Instagram', frequency: 'يومياً', bestTime: '6-9 مساءً' },
  { platform: 'Facebook', frequency: '3-4 مرات أسبوعياً', bestTime: 'الأربعاء-الجمعة' },
  { platform: 'X', frequency: '1-3 تغريدات يومياً', bestTime: '8-10ص و7-9م' },
];

// ════════════════════════════════════════════════════════════════════════════
//  Singletons
// ════════════════════════════════════════════════════════════════════════════
export const socialAccountService = new SocialAccountService();
export const socialPostService = new SocialPostService();
export const socialInteractionService = new SocialInteractionService();
export const socialUtmService = new SocialUtmService();
export const socialListeningService = new SocialListeningService();
export const socialAnalyticsService = new SocialAnalyticsService();
