/**
 * ════════════════════════════════════════════════════════════════
 *  Tenant Context - سياق الشركة الحالية
 *  جزء من بنية Multi-Tenant SaaS
 * ════════════════════════════════════════════════════════════════
 *
 *  هذا الملف يوفر:
 *  1. TenantContext - سياق React للشركة الحالية
 *  2. TenantProvider - مزود السياق للتطبيق
 *  3. useTenant - خطاف للوصول إلى معلومات الشركة
 *  4. TenantResolver - حلّال الـ Tenant من الـ URL
 * ════════════════════════════════════════════════════════════════
 */

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { tenantService } from '../../services/sdk/TenantService';

// ════════════════════════════════════════════════════════════════
//  الأنواع
// ════════════════════════════════════════════════════════════════

export interface TenantInfo {
  id: string;
  slug: string;
  name_ar: string;
  name_en?: string;
  logo_url?: string;
  status: 'trial' | 'active' | 'suspended' | 'expired' | 'deleted';
}

interface TenantContextValue {
  /** معلومات الشركة الحالية */
  tenant: TenantInfo | null;
  /** هل يتم تحميل معلومات الشركة؟ */
  loading: boolean;
  /** خطأ إن وجد */
  error: string | null;
  /** إعادة تحميل معلومات الشركة */
  refresh: () => Promise<void>;
}

// ════════════════════════════════════════════════════════════════
//  إنشاء السياق
// ════════════════════════════════════════════════════════════════

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

// ════════════════════════════════════════════════════════════════
//  خطاف useTenant
// ════════════════════════════════════════════════════════════════

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

// ════════════════════════════════════════════════════════════════
//  Tenant Resolver - يستخرج slug الشركة من الـ URL
// ════════════════════════════════════════════════════════════════

/**
 * يستخرج slug الـ Tenant من الـ URL بناءً على الاستراتيجية:
 * - Subdomain: company.platform.com → company
 * - Custom Domain: custom.com → lookup in DB
 * - Path: platform.com/company → company
 *
 * في الإصدار الأول (v1.0) نستخدم Subdomain فقط.
 */
function resolveTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;

  // 1. إذا كان localhost أو IP → نبحث عن tenant من الـ path أو localStorage
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // للتطوير: يمكن تعيين tenant_id يدوياً
    const params = new URLSearchParams(window.location.search);
    return params.get('tenant');
  }

  // 2. Subdomain: company.platform.com
  // نتحقق من وجود subdomain (أكثر من جزئين في الـ hostname)
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    // أول جزء هو الـ subdomain
    const subdomain = parts[0];
    // نتأكد أنه ليس www
    if (subdomain !== 'www') {
      return subdomain;
    }
  }

  // 3. Path-based: platform.com/company-slug
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tenant')) {
      return params.get('tenant');
    }
    return pathParts[0];
  }

  return null;
}

// ════════════════════════════════════════════════════════════════
//  API لحلّ الـ Tenant (سيتم استبدالها بخدمة لاحقاً)
// ════════════════════════════════════════════════════════════════

/**
 * دالة مؤقتة لحل الـ Tenant من الـ slug
 * في الإصدارات القادمة ستستخدم services/sdk/tenants
 */
async function fetchTenantBySlug(slug: string): Promise<TenantInfo | null> {
  try {
    const tenant = await tenantService.getCompanyBySlug(slug);
    if (!tenant) return null;
    return tenant as TenantInfo;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  TenantProvider
// ════════════════════════════════════════════════════════════════

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  const resolveTenant = async () => {
    setLoading(true);
    setError(null);

    try {
      const slug = resolveTenantSlug();

      if (!slug) {
        // لا يوجد Tenant - هذا يعني أننا في وضع الإعداد
        setTenant(null);
        setLoading(false);
        return;
      }

      const tenantInfo = await fetchTenantBySlug(slug);

      if (!tenantInfo) {
        setError(`لم يتم العثور على شركة بهذا المعرف: ${slug}`);
        setTenant(null);
        setLoading(false);
        return;
      }

      // التحقق من حالة الشركة
      if (tenantInfo.status === 'suspended') {
        setError('هذه الشركة موقوفة. يرجى التواصل مع إدارة المنصة.');
        setTenant(null);
        setLoading(false);
        return;
      }

      if (tenantInfo.status === 'deleted') {
        setError('هذه الشركة غير موجودة.');
        setTenant(null);
        setLoading(false);
        return;
      }

      setTenant(tenantInfo);

      // حفظ tenant_id في localStorage للاستخدام في التطبيق
      localStorage.setItem('tenant_id', tenantInfo.id);
      localStorage.setItem('tenant_slug', tenantInfo.slug);
    } catch (err) {
      setError('حدث خطأ أثناء تحميل معلومات الشركة');
      console.error('Tenant resolution error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    resolveTenant();
  }, []);

  return (
    <TenantContext.Provider
      value={{
        tenant,
        loading,
        error,
        refresh: resolveTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

// ════════════════════════════════════════════════════════════════
//  التصدير
// ════════════════════════════════════════════════════════════════

export { TenantContext };
export default TenantProvider;