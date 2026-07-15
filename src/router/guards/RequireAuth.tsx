/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RequireAuth — يمنع الدخول للمسارات المحمية بدون تسجيل دخول
 *
 *  السلوك:
 *   - إذا كان المستخدم مصادَق عليه → يعرض children (عبر Outlet)
 *   - إذا لم يكن → redirect إلى /login مع حفظ الـ URL الحالي كـ redirect
 *   - إذا كانت الجلسة قيد التحقق → يعرض null (App.tsx يعرض SplashScreen)
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../core/stores';

interface RequireAuthProps {
  /** children بديلة عن Outlet — للاستخدام دون nested route */
  children?: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, loading } = useAuthStore();
  const location = useLocation();

  // أثناء التحقق من الجلسة، لا نعرض شيئاً — App.tsx يتولى SplashScreen
  if (loading) return null;

  if (!isAuthenticated) {
    // نحفظ المسار الحالي كـ redirect param حتى يعود المستخدم إليه بعد login
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default RequireAuth;
