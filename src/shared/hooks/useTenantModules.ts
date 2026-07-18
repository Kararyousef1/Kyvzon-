/**
 * useTenantModules - قراءة البوابات المفعلة للـ tenant الحالي.
 * المرحلة الأولى: تستخدم tenant_modules إن وجدت، مع fallback آمن يسمح بالبوابات الأساسية عند عدم وجود بيانات.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../core/stores';
import { tenantModuleService } from '../../services/sdk/TenantModuleService';

const PLATFORM_ROLES = new Set(['developer', 'it_admin']);
const STAFF_FALLBACK_MODULES = [
  'employee', 'hr', 'finance', 'admin', 'manager', 'supervisor', 'gatekeeper', 'movement', 'tawathul', 'tech_portal', 'ai', 'reports', 'health_safety', 'succession', 'contracts',
];

export function useTenantModules() {
  const { user } = useAuthStore();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const tenantId = user?.tenant_id || (typeof localStorage !== 'undefined' ? localStorage.getItem('tenant_id') || undefined : undefined);
  const isPlatform = !!user?.role && PLATFORM_ROLES.has(user.role);

  const load = useCallback(async () => {
    if (!user) {
      setEnabledModules([]);
      setLoaded(true);
      return;
    }
    if (isPlatform) {
      setEnabledModules(STAFF_FALLBACK_MODULES);
      setLoaded(true);
      return;
    }
    if (!tenantId) {
      // fallback آمن حتى لا نكسر مستخدمين قدامى قبل تطبيق tenant_modules
      setEnabledModules(STAFF_FALLBACK_MODULES);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const rows = await tenantModuleService.getTenantModules(tenantId);
      const enabled = rows.filter(r => r.is_enabled).map(r => String(r.module_key));
      setEnabledModules(enabled.length ? enabled : STAFF_FALLBACK_MODULES);
    } catch {
      setEnabledModules(STAFF_FALLBACK_MODULES);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [isPlatform, tenantId, user]);

  useEffect(() => { void load(); }, [load]);

  const set = useMemo(() => new Set(enabledModules), [enabledModules]);
  const isEnabled = useCallback((moduleKey?: string | null) => {
    if (!moduleKey) return true;
    if (isPlatform) return true;
    return set.has(moduleKey);
  }, [isPlatform, set]);

  return { enabledModules, isEnabled, loading, loaded, reload: load };
}

export default useTenantModules;
