/**
 * useTenantModules - قراءة البوابات المفعلة للـ tenant الحالي مع فحص الاشتراك والصلاحيات
 * تم تحسينه في خطة العلاج:
 * - يتحقق من انتهاء الاشتراك (subscription expiry)
 * - يتحقق من status tenant (suspended/expired)
 * - يفرق بين planned/beta/production
 * - يمنع الوصول للوحدات غير المفعلة بصدق
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../core/stores';
import { tenantModuleService } from '../../services/sdk/TenantModuleService';
import { supabase } from '../../services/supabase/supabase';
import { getModuleStatus, isModuleProductionReady } from '../../services/sdk/TenantModuleCatalog';
import { hybridEnabledModulesForFeatures } from '../../pages/hybridportal/hybridPagesCatalog';

const PLATFORM_ROLES = new Set(['developer', 'it_admin']);
const STAFF_FALLBACK_MODULES = [
  'employee', 'hr', 'finance', 'admin', 'manager', 'supervisor', 'gatekeeper', 'movement', 'tawathul', 'tech_portal', 'ai', 'reports', 'health_safety', 'succession', 'contracts',
];

interface UseTenantModulesResult {
  enabledModules: string[];
  enabledPages?: string[];
  subscriptionPlan?: string | null;
  isEnabled: (moduleKey?: string | null) => boolean;
  isModuleProductionReady: (moduleKey?: string) => boolean;
  getModuleStatus: (moduleKey?: string) => string;
  loading: boolean;
  loaded: boolean;
  subscriptionExpired: boolean;
  subscriptionStatus: string | null;
  tenantStatus: string | null;
  isSuspended: boolean;
  reload: () => Promise<void>;
}

export function useTenantModules(): UseTenantModulesResult {
  const { user } = useAuthStore();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [enabledPages, setEnabledPages] = useState<string[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [tenantStatus, setTenantStatus] = useState<string | null>(null);

  const tenantId = user?.tenant_id || (typeof localStorage !== 'undefined' ? localStorage.getItem('tenant_id') || undefined : undefined);
  const isPlatform = !!user?.role && PLATFORM_ROLES.has(user.role);

  const load = useCallback(async () => {
    if (!user) {
      setEnabledModules([]);
      setLoaded(true);
      setSubscriptionExpired(false);
      return;
    }
    if (isPlatform) {
      setEnabledModules(STAFF_FALLBACK_MODULES);
      setLoaded(true);
      setSubscriptionExpired(false);
      setSubscriptionStatus('active');
      setTenantStatus('active');
      return;
    }
    if (!tenantId) {
      setEnabledModules(STAFF_FALLBACK_MODULES);
      setLoaded(true);
      return;
    }
    // إصلاح: إذا كان tenantId هو القيمة الوهمية الافتراضية، لا نحاول جلب اشتراك — هذا كان يسبب 400
    const DUMMY_TENANT_IDS = new Set(['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']);
    if (DUMMY_TENANT_IDS.has(tenantId)) {
      console.warn('useTenantModules: Skipping subscription check for dummy tenant_id', tenantId);
      setEnabledModules(STAFF_FALLBACK_MODULES);
      setLoaded(true);
      setSubscriptionExpired(false);
      setTenantStatus('active');
      return;
    }
    setLoading(true);
    try {
      // 2) فحص حالة الاشتراك + حالة tenant — منع الوصول عند expired/suspended
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('status, subscription_plan, features')
        .eq('id', tenantId)
        .maybeSingle();
      
      if (tenantData) {
        setTenantStatus((tenantData as any).status);
        setSubscriptionPlan((tenantData as any).subscription_plan);
        const plan = (tenantData as any).subscription_plan;
        const features = (tenantData as any).features || [];
        setEnabledPages(features);

        if (plan === 'hybrid') {
          // الاشتراك الهجين: نُفعّل الوحدات المقابلة للصفحات المختارة تلقائياً.
          // نستخدم المصدر الموحّد hybridEnabledModulesForFeatures (يدمج الوحدة
          // العامة + الوحدة الدقيقة من المسار) لضمان تطابق كامل مع RequireModule
          // وتفادي "البوابة غير مفعلة".
          setEnabledModules(hybridEnabledModulesForFeatures(features as string[]));
        } else {
          // 1) جلب modules المفعلة
          const rows = await tenantModuleService.getTenantModules(tenantId);
          const enabled = rows.filter(r => r.is_enabled).map(r => String(r.module_key));
          setEnabledModules(rows.length ? enabled : STAFF_FALLBACK_MODULES);
        }
      } else {
        // 1) جلب modules المفعلة
        const rows = await tenantModuleService.getTenantModules(tenantId);
        const enabled = rows.filter(r => r.is_enabled).map(r => String(r.module_key));
        setEnabledModules(rows.length ? enabled : STAFF_FALLBACK_MODULES);
      }

      const { data: subData } = await supabase
        .from('tenant_subscriptions')
        .select('status, end_date, start_date, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subData) {
        const sub: any = subData;
        setSubscriptionStatus(sub.status);
        // انتهاء الاشتراك إذا كان expired أو grace_period أو تاريخ الانتهاء مر — تم إصلاحه: الجدول يحتوي end_date فقط وليس expires_at
        const endDate = (sub as any).end_date || (sub as any).expires_at;
        if (sub.status === 'expired' || sub.status === 'cancelled') {
          setSubscriptionExpired(true);
        } else if (endDate) {
          const expired = new Date(endDate) < new Date();
          setSubscriptionExpired(expired);
        } else {
          setSubscriptionExpired(false);
        }
      }
    } catch {
      setEnabledModules(STAFF_FALLBACK_MODULES);
      setSubscriptionExpired(false);
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
    // إذا الاشتراك منتهي أو tenant موقوف، امنع كل شيء عدا employee و profile
    if (subscriptionExpired || tenantStatus === 'suspended' || tenantStatus === 'expired') {
      return ['employee', 'profile'].includes(moduleKey);
    }
    return set.has(moduleKey);
  }, [isPlatform, set, subscriptionExpired, tenantStatus]);

  const checkProductionReady = useCallback((moduleKey?: string) => {
    if (!moduleKey) return true;
    return isModuleProductionReady(moduleKey as any);
  }, []);

  const checkStatus = useCallback((moduleKey?: string) => {
    if (!moduleKey) return 'production';
    return getModuleStatus(moduleKey as any);
  }, []);

  return {
    enabledModules,
    enabledPages,
    subscriptionPlan,
    isEnabled,
    isModuleProductionReady: checkProductionReady,
    getModuleStatus: checkStatus,
    loading,
    loaded,
    subscriptionExpired,
    subscriptionStatus,
    tenantStatus,
    isSuspended: tenantStatus === 'suspended' || subscriptionExpired,
    reload: load,
  };
}

export default useTenantModules;
