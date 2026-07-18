import { describe, expect, it } from 'vitest';
import { MODULE_CATALOG, isModuleAllowedForPlan, modulesForPlan, planLimitsForPlan } from '../services/sdk/TenantModuleCatalog';
import { getModuleForPath } from '../router/moduleMap';

describe('SaaS tenant modules control plane', () => {
  it('basic plan exposes only core employee and hr modules', () => {
    expect(modulesForPlan('basic')).toEqual(['employee', 'hr', 'finance']);
    expect(isModuleAllowedForPlan('employee', 'basic')).toBe(true);
    expect(isModuleAllowedForPlan('manager', 'basic')).toBe(false);
  });

  it('professional plan includes operational and collaboration portals', () => {
    const modules = modulesForPlan('professional');
    expect(modules).toContain('manager');
    expect(modules).toContain('supervisor');
    expect(modules).toContain('movement');
    expect(modules).toContain('tawathul');
    expect(modules).not.toContain('ai');
  });

  it('enterprise plan covers the full current module catalog', () => {
    const enterprise = modulesForPlan('enterprise');
    for (const item of MODULE_CATALOG) {
      expect(enterprise).toContain(item.key);
    }
  });

  it('plan limits are deterministic', () => {
    expect(planLimitsForPlan('basic').maxEmployees).toBe(50);
    expect(planLimitsForPlan('professional').maxBranches).toBe(5);
    expect(planLimitsForPlan('enterprise').supportLevel).toBe('dedicated');
  });

  it('maps protected routes to module keys', () => {
    expect(getModuleForPath('/app/employee')?.moduleKey).toBe('employee');
    expect(getModuleForPath('/app/hr/contracts')?.moduleKey).toBe('contracts');
    expect(getModuleForPath('/app/gatekeeper/movements')?.moduleKey).toBe('movement');
    expect(getModuleForPath('/app/tawathul/admin')?.moduleKey).toBe('tawathul');
    expect(getModuleForPath('/app/notifications')).toBeNull();
  });
});
