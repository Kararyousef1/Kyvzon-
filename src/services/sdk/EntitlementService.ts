/**
 * EntitlementService - فرض حدود الاشتراك على العمليات الفعلية
 * المرحلة الأولى: الموظفون، الفروع، أجهزة البصمة.
 */
import { supabase } from '../supabase/supabase';
import { getCurrentTenantId } from './BaseService';
import { planLimitsForPlan } from './TenantModuleCatalog';

export interface TenantUsageSnapshot {
  tenantId: string;
  plan: string;
  employees: number;
  branches: number;
  biometricDevices: number;
  limits: ReturnType<typeof planLimitsForPlan>;
}

async function countTable(table: string, tenantId: string, extra?: Record<string, unknown>): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) query = query.eq(key, value);
  }
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

export const entitlementService = {
  async getUsage(tenantId = getCurrentTenantId()): Promise<TenantUsageSnapshot> {
    if (!tenantId) throw new Error('لا يوجد Tenant ID في سياق الجلسة');
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, subscription_plan')
      .eq('id', tenantId)
      .maybeSingle();
    const plan = (tenant?.subscription_plan as string) || 'basic';
    const limits = planLimitsForPlan(plan);
    const [employees, branches, biometricDevices] = await Promise.all([
      countTable('profiles', tenantId, { status: 'active' }),
      countTable('branches', tenantId, { status: 'active' }),
      countTable('biometric_devices', tenantId, { is_active: true }),
    ]);
    return { tenantId, plan, employees, branches, biometricDevices, limits };
  },

  async assertCanAddEmployee(tenantId = getCurrentTenantId()): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.employees >= usage.limits.maxEmployees) {
      throw new Error(`وصلت الشركة إلى حد الموظفين في خطة ${usage.plan}: ${usage.employees}/${usage.limits.maxEmployees}`);
    }
  },

  async assertCanAddBranch(tenantId = getCurrentTenantId()): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.branches >= usage.limits.maxBranches) {
      throw new Error(`وصلت الشركة إلى حد الفروع في خطة ${usage.plan}: ${usage.branches}/${usage.limits.maxBranches}`);
    }
  },

  async assertCanAddBiometricDevice(tenantId = getCurrentTenantId()): Promise<void> {
    const usage = await this.getUsage(tenantId);
    if (usage.biometricDevices >= usage.limits.maxBiometricDevices) {
      throw new Error(`وصلت الشركة إلى حد أجهزة البصمة في خطة ${usage.plan}: ${usage.biometricDevices}/${usage.limits.maxBiometricDevices}`);
    }
  },
};

export default entitlementService;
