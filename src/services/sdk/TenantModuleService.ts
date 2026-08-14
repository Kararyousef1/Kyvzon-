/**
 * TenantModuleService — SaaS Control Plane
 * إدارة تفعيل/تعطيل البوابات والموديلات لكل شركة Tenant من بوابة المطور.
 */

import { supabase } from '../supabase/supabase';
import { getErrorMessage } from '../errors';

import { MODULE_CATALOG, PLAN_ALLOWED_MODULES, PLAN_LIMITS, isModuleAllowedForPlan, modulesForPlan, planLimitsForPlan } from './TenantModuleCatalog';
import type { ModuleCatalogItem, ModuleKey, PlanLimits } from './TenantModuleCatalog';

export { MODULE_CATALOG, PLAN_ALLOWED_MODULES, PLAN_LIMITS, isModuleAllowedForPlan, modulesForPlan, planLimitsForPlan };
export type { ModuleCatalogItem, ModuleKey, PlanLimits };

export interface TenantModuleRecord {
  id: string;
  tenant_id: string;
  module_key: ModuleKey | string;
  module_label?: string;
  is_enabled: boolean;
  source_plan?: string;
  enabled_by?: string;
  enabled_at?: string;
  disabled_at?: string;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TenantAccessState {
  status: string;
  subscription_plan: string;
  features: string[];
}

export interface TenantLatestSubscription {
  status: string;
  end_date: string | null;
  start_date: string;
  created_at: string;
}

export const tenantModuleService = {
  getCatalog(): ModuleCatalogItem[] {
    return MODULE_CATALOG;
  },

  getAllowedForPlan(plan?: string): ModuleKey[] {
    return modulesForPlan(plan);
  },

  async getTenantModules(tenantId: string): Promise<TenantModuleRecord[]> {
    const { data, error } = await supabase
      .from('tenant_modules')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('module_key', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data || []) as TenantModuleRecord[];
  },

  async getTenantAccessState(tenantId: string): Promise<TenantAccessState | null> {
    const { data, error } = await supabase.from('tenants')
      .select('status,subscription_plan,features')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return data as TenantAccessState | null;
  },

  async getLatestSubscription(tenantId: string): Promise<TenantLatestSubscription | null> {
    const { data, error } = await supabase.from('tenant_subscriptions')
      .select('status,end_date,start_date,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return data as TenantLatestSubscription | null;
  },

  async ensureTenantModules(tenantId: string, plan = 'basic', actorId?: string): Promise<TenantModuleRecord[]> {
    const current = await this.getTenantModules(tenantId).catch(() => []);
    const existing = new Set(current.map(m => m.module_key));
    const allowed = modulesForPlan(plan);
    const rows = MODULE_CATALOG
      .filter(item => !existing.has(item.key))
      .map(item => ({
        tenant_id: tenantId,
        module_key: item.key,
        module_label: item.label,
        is_enabled: allowed.includes(item.key),
        source_plan: plan,
        enabled_by: allowed.includes(item.key) ? actorId : null,
        enabled_at: allowed.includes(item.key) ? new Date().toISOString() : null,
        disabled_at: allowed.includes(item.key) ? null : new Date().toISOString(),
        settings: {},
      }));

    if (rows.length) {
      const { error } = await supabase.from('tenant_modules').insert(rows);
      if (error) throw new Error(getErrorMessage(error));
    }
    return this.getTenantModules(tenantId);
  },

  async setModuleEnabled(input: {
    tenantId: string;
    moduleKey: ModuleKey | string;
    enabled: boolean;
    plan?: string;
    actorId?: string;
    force?: boolean;
  }): Promise<TenantModuleRecord> {
    const item = MODULE_CATALOG.find(m => m.key === input.moduleKey);
    if (!item) throw new Error(`الموديل غير معروف: ${input.moduleKey}`);
    if (input.enabled && !input.force && !isModuleAllowedForPlan(input.moduleKey, input.plan)) {
      throw new Error(`البوابة "${item.label}" غير متاحة ضمن خطة ${input.plan || 'basic'}`);
    }

    const now = new Date().toISOString();
    const payload = {
      tenant_id: input.tenantId,
      module_key: input.moduleKey,
      module_label: item.label,
      is_enabled: input.enabled,
      source_plan: input.plan,
      enabled_by: input.enabled ? input.actorId : null,
      enabled_at: input.enabled ? now : null,
      disabled_at: input.enabled ? null : now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('tenant_modules')
      .upsert(payload, { onConflict: 'tenant_id,module_key' })
      .select()
      .single();
    if (error) throw new Error(getErrorMessage(error));

    await this.syncTenantEnabledModulesArray(input.tenantId);
    await this.logModuleAction(input.tenantId, input.moduleKey, input.enabled, input.actorId, input.plan);
    return data as TenantModuleRecord;
  },

  async syncWithPlan(tenantId: string, plan: string, actorId?: string): Promise<TenantModuleRecord[]> {
    const allowed = modulesForPlan(plan);
    const now = new Date().toISOString();
    const rows = MODULE_CATALOG.map(item => ({
      tenant_id: tenantId,
      module_key: item.key,
      module_label: item.label,
      is_enabled: allowed.includes(item.key),
      source_plan: plan,
      enabled_by: allowed.includes(item.key) ? actorId : null,
      enabled_at: allowed.includes(item.key) ? now : null,
      disabled_at: allowed.includes(item.key) ? null : now,
      updated_at: now,
      settings: {},
    }));

    const { error } = await supabase
      .from('tenant_modules')
      .upsert(rows, { onConflict: 'tenant_id,module_key' });
    if (error) throw new Error(getErrorMessage(error));

    await this.syncTenantEnabledModulesArray(tenantId);
    return this.getTenantModules(tenantId);
  },

  async syncTenantEnabledModulesArray(tenantId: string): Promise<void> {
    const modules = await this.getTenantModules(tenantId);
    const enabled = modules.filter(m => m.is_enabled).map(m => m.module_key);
    const { error } = await supabase
      .from('tenants')
      .update({ enabled_modules: enabled, updated_at: new Date().toISOString() })
      .eq('id', tenantId);
    if (error) throw new Error(getErrorMessage(error));
  },

  async logModuleAction(tenantId: string, moduleKey: string, enabled: boolean, actorId?: string, plan?: string): Promise<void> {
    try {
      await supabase.from('platform_audit_log').insert({
        action: enabled ? 'module_enabled' : 'module_disabled',
        category: 'subscription',
        actor_id: actorId,
        actor_role: 'developer',
        target_type: 'tenant_module',
        target_id: tenantId,
        target_name: moduleKey,
        details: { tenant_id: tenantId, module_key: moduleKey, enabled, plan },
        description: `${enabled ? 'تم تفعيل' : 'تم تعطيل'} بوابة ${moduleKey}`,
      });
    } catch {
      // audit logging is non-blocking
    }
  },
};

export default tenantModuleService;
