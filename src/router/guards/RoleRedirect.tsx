/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RoleRedirect — يوجِّه المستخدم لصفحته الافتراضية
 *
 *  الاستخدام: يوضع في <Route index> لـ /app للتعامل مع "/app"
 *  بدون تحديد صفحة معينة.
 *
 *  منطق التوجيه:
 *   - اشتراك هجين (hybrid): يوجّه لأول صفحة متاحة ضمن (features ∩ الدور)،
 *     لأن الصفحة الافتراضية للدور قد لا تكون مخصّصة للشركة.
 *   - غير ذلك: الصفحة الافتراضية حسب الدور.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../core/stores';
import { useTenantModules } from '../../shared/hooks/useTenantModules';
import { getDefaultPathForRole } from '../constants';
import { getHybridLandingPath } from '../../pages/hybridportal/hybridPagesCatalog';

export function RoleRedirect() {
  const { user } = useAuthStore();
  const { subscriptionPlan, enabledPages, loaded, loading } = useTenantModules();

  const isPlatformRole = user?.role === 'developer' || user?.role === 'it_admin';

  // ننتظر تحميل بيانات الاشتراك قبل اتخاذ قرار التوجيه للهجين
  if (subscriptionPlan === 'hybrid' && !isPlatformRole) {
    if (!loaded || loading) return null;
    const landing = getHybridLandingPath(enabledPages ?? [], user?.role ?? null);
    // إن لم تتوفّر صفحة مخصّصة، نوجّه للملف الشخصي (متاح دائماً)
    return <Navigate to={landing ?? '/app/employee/profile'} replace />;
  }

  return <Navigate to={getDefaultPathForRole(user?.role)} replace />;
}

export default RoleRedirect;
