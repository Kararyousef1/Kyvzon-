/**
 * ════════════════════════════════════════════════════════════════
 *  TenantService — خدمة إدارة الشركات (SDK)
 *  جزء من بوابة Kyvzon للمطور
 * ════════════════════════════════════════════════════════════════
 *
 *  توفر هذه الخدمة:
 *  - CRUD للشركات (tenants)
 *  - إدارة الاشتراكات
 *  - إحصاءات الشركات
 *  - سجل العمليات
 */

import { supabase } from '../supabase/supabase';
import { getErrorMessage } from '../errors';

// ════════════════════════════════════════════════════════════════
//  الأنواع
// ════════════════════════════════════════════════════════════════

export interface TenantCompany {
  id: string;
  slug: string;
  name_ar: string;
  name_en?: string;
  logo_url?: string;
  status: 'trial' | 'active' | 'suspended' | 'expired' | 'deleted';
  domain?: string;
  settings?: Record<string, unknown>;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  max_employees: number;
  subscription_plan: 'basic' | 'professional' | 'enterprise' | 'custom';
  subscription_status: 'trial' | 'active' | 'grace_period' | 'expired' | 'cancelled';
  subscription_start_date?: string;
  subscription_end_date?: string;
  features?: string[];
  enabled_modules?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan: string;
  status: string;
  start_date: string;
  end_date?: string;
  amount?: number;
  currency?: string;
  payment_method?: string;
  payment_reference?: string;
  max_employees: number;
  features?: string[];
  notes?: string;
  created_at: string;
  created_by?: string;
}

export interface TenantStats {
  total_users: number;
  active_users: number;
  total_incidents: number;
  open_incidents: number;
}

export interface PlatformAuditEntry {
  id: string;
  action: string;
  category: string;
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  target_type?: string;
  target_id?: string;
  target_name?: string;
  details?: Record<string, unknown>;
  description?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface PlatformStats {
  total_companies: number;
  active_companies: number;
  trial_companies: number;
  suspended_companies: number;
  total_users: number;
  total_revenue_estimated: number;
  recent_signups: number;
  companies_by_plan: Record<string, number>;
}

export interface CreateTenantInput {
  name_ar: string;
  name_en?: string;
  slug: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  subscription_plan?: string;
  subscription_status?: string;
  max_employees?: number;
  enabled_modules?: string[];
  notes?: string;
}

export interface UpdateTenantInput extends Partial<CreateTenantInput> {
  id: string;
  status?: string;
  subscription_end_date?: string;
  features?: string[];
}

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const PLAN_PRICES: Record<string, number> = {
  basic: 250,         // $250/month
  professional: 750,  // $750/month
  enterprise: 2000,   // $2,000/month
  custom: 5000,       // $5,000/month (estimated)
};

// ════════════════════════════════════════════════════════════════
//  Tenant Service
// ════════════════════════════════════════════════════════════════

export const tenantService = {
  // ── جلب جميع الشركات ───────────────────────────────────────
  async getAllCompanies(): Promise<TenantCompany[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(getErrorMessage(error));
    return (data as TenantCompany[]) ?? [];
  },

  // ── جلب شركة واحدة ─────────────────────────────────────────
  async getCompany(id: string): Promise<TenantCompany | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(getErrorMessage(error));
    return data as TenantCompany | null;
  },

  // ── إنشاء شركة جديدة ──────────────────────────────────────
  async createCompany(input: CreateTenantInput): Promise<TenantCompany> {
    // التحقق من slug الفريد
    const { data: existing, error: checkError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', input.slug)
      .maybeSingle();

    if (checkError) throw new Error(getErrorMessage(checkError));
    if (existing) throw new Error(`المعرف "${input.slug}" مستخدم مسبقاً`);

    const newTenant = {
      name_ar: input.name_ar,
      name_en: input.name_en || '',
      slug: input.slug,
      status: 'trial' as const,
      contact_name: input.contact_name || '',
      contact_email: input.contact_email || '',
      contact_phone: input.contact_phone || '',
      subscription_plan: (input.subscription_plan || 'basic') as TenantCompany['subscription_plan'],
      subscription_status: 'trial' as const,
      subscription_start_date: new Date().toISOString().split('T')[0],
      subscription_end_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      max_employees: input.max_employees || 50,
      enabled_modules: input.enabled_modules || ['employee'],
      notes: input.notes || '',
      features: [] as string[],
    };

    const { data, error } = await supabase
      .from('tenants')
      .insert(newTenant)
      .select()
      .single();

    if (error) throw new Error(getErrorMessage(error));
    return data as TenantCompany;
  },

  // ── تحديث شركة ──────────────────────────────────────────────
  async updateCompany(id: string, updates: Partial<UpdateTenantInput>): Promise<TenantCompany> {
    const updateData: Record<string, unknown> = {};
    
    if (updates.name_ar !== undefined) updateData.name_ar = updates.name_ar;
    if (updates.name_en !== undefined) updateData.name_en = updates.name_en;
    if (updates.slug !== undefined) updateData.slug = updates.slug;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.contact_name !== undefined) updateData.contact_name = updates.contact_name;
    if (updates.contact_email !== undefined) updateData.contact_email = updates.contact_email;
    if (updates.contact_phone !== undefined) updateData.contact_phone = updates.contact_phone;
    if (updates.subscription_plan !== undefined) updateData.subscription_plan = updates.subscription_plan;
    if (updates.subscription_status !== undefined) updateData.subscription_status = updates.subscription_status;
    if (updates.subscription_end_date !== undefined) updateData.subscription_end_date = updates.subscription_end_date;
    if (updates.max_employees !== undefined) updateData.max_employees = updates.max_employees;
    if (updates.features !== undefined) updateData.features = updates.features;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('tenants')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(getErrorMessage(error));
    return data as TenantCompany;
  },

  // ── حذف شركة (Soft Delete) ──────────────────────────────────
  async deleteCompany(id: string): Promise<void> {
    const { error } = await supabase
      .from('tenants')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(getErrorMessage(error));
  },

  // ── تعليق شركة ──────────────────────────────────────────────
  async suspendCompany(id: string): Promise<TenantCompany> {
    return this.updateCompany(id, { status: 'suspended' } as UpdateTenantInput);
  },

  // ── تفعيل شركة ──────────────────────────────────────────────
  async activateCompany(id: string): Promise<TenantCompany> {
    return this.updateCompany(id, { status: 'active' } as UpdateTenantInput);
  },

  // ── جلب إحصاءات شركة ───────────────────────────────────────
  async getCompanyStats(tenantId: string): Promise<TenantStats> {
    const { data, error } = await supabase
      .rpc('get_tenant_stats', { p_tenant_id: tenantId });

    if (error) {
      console.warn('RPC get_tenant_stats failed, falling back to manual count:', error);
      // Fallback: manual counting
      const [usersResult, activeResult, incidentsResult, openIncidentsResult] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
        supabase.from('incidents').select('id', { count: 'exact', head: true }),
        supabase.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
      ]);

      return {
        total_users: usersResult.count ?? 0,
        active_users: activeResult.count ?? 0,
        total_incidents: incidentsResult.count ?? 0,
        open_incidents: openIncidentsResult.count ?? 0,
      };
    }

    return data as TenantStats;
  },

  // ── جلب اشتراكات شركة ──────────────────────────────────────
  async getCompanySubscriptions(tenantId: string): Promise<TenantSubscription[]> {
    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(getErrorMessage(error));
    return (data as TenantSubscription[]) ?? [];
  },

  // ── إضافة اشتراك جديد ──────────────────────────────────────
  async addSubscription(
    tenantId: string,
    subscription: Partial<TenantSubscription>,
    actorId?: string,
  ): Promise<TenantSubscription> {
    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .insert({
        tenant_id: tenantId,
        plan: subscription.plan || 'basic',
        status: subscription.status || 'active',
        start_date: subscription.start_date || new Date().toISOString().split('T')[0],
        end_date: subscription.end_date,
        amount: subscription.amount,
        currency: subscription.currency || 'IQD',
        payment_method: subscription.payment_method,
        payment_reference: subscription.payment_reference,
        max_employees: subscription.max_employees || 50,
        features: subscription.features || [],
        notes: subscription.notes,
        created_by: actorId,
      })
      .select()
      .single();

    if (error) throw new Error(getErrorMessage(error));
    return data as TenantSubscription;
  },

  // ── إحصاءات المنصة العامة ──────────────────────────────────
  async getPlatformStats(): Promise<PlatformStats> {
    const { data: companies, error } = await supabase
      .from('tenants')
      .select('id,status,subscription_plan,subscription_status,max_employees,subscription_end_date')
      .neq('status', 'deleted');

    if (error) throw new Error(getErrorMessage(error));

    const all = companies ?? [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const activeCompanies = all.filter(c => c.status === 'active');
    const trialCompanies = all.filter(c => c.status === 'trial');
    const suspendedCompanies = all.filter(c => c.status === 'suspended' || c.status === 'expired');

    // تقدير الإيرادات الشهرية
    let estimatedRevenue = 0;
    const companiesByPlan: Record<string, number> = {};
    
    for (const c of activeCompanies) {
      const plan = c.subscription_plan || 'basic';
      companiesByPlan[plan] = (companiesByPlan[plan] || 0) + 1;
      const price = PLAN_PRICES[plan] ?? PLAN_PRICES.basic;
      estimatedRevenue += price;
    }

    // إجمالي المستخدمين عبر المنصة
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    return {
      total_companies: all.length,
      active_companies: activeCompanies.length,
      trial_companies: trialCompanies.length,
      suspended_companies: suspendedCompanies.length,
      total_users: totalUsers ?? 0,
      total_revenue_estimated: estimatedRevenue,
      recent_signups: all.filter(c => {
        // استخدام أي حقل زمني متاح للتحقق من التسجيلات الحديثة
        return c.subscription_end_date && new Date(c.subscription_end_date) > thirtyDaysAgo;
      }).length,
      companies_by_plan: companiesByPlan,
    };
  },

  // ── سجل عمليات المنصة ──────────────────────────────────────
  async getPlatformAuditLogs(limit = 100): Promise<PlatformAuditEntry[]> {
    const { data, error } = await supabase
      .from('platform_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(getErrorMessage(error));
    return (data as PlatformAuditEntry[]) ?? [];
  },

  // ── تسجيل عملية في سجل المنصة ──────────────────────────────
  async logPlatformAction(entry: {
    action: string;
    category?: string;
    actor_id?: string;
    actor_name?: string;
    actor_role?: string;
    target_type?: string;
    target_id?: string;
    target_name?: string;
    details?: Record<string, unknown>;
    description?: string;
  }): Promise<void> {
    try {
      await supabase.from('platform_audit_log').insert({
        action: entry.action,
        category: entry.category || 'general',
        actor_id: entry.actor_id,
        actor_name: entry.actor_name,
        actor_role: entry.actor_role,
        target_type: entry.target_type,
        target_id: entry.target_id,
        target_name: entry.target_name,
        details: entry.details || {},
        description: entry.description,
        ip_address: typeof window !== 'undefined' ? 'client' : 'server',
      });
    } catch (err) {
      console.warn('Failed to log platform action:', err);
    }
  },

  // ── البحث عن شركات ──────────────────────────────────────────
  async searchCompanies(query: string): Promise<TenantCompany[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .or(`name_ar.ilike.%${query}%,name_en.ilike.%${query}%,slug.ilike.%${query}%,contact_email.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(getErrorMessage(error));
    return (data as TenantCompany[]) ?? [];
  },

  // ── التحقق من slug متاح ─────────────────────────────────────
  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('is_slug_available', { p_slug: slug, p_exclude_id: excludeId || null });

    if (error) throw new Error(getErrorMessage(error));
    return data as boolean;
  },
};

export default tenantService;
