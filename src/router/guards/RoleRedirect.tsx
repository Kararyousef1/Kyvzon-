/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RoleRedirect — يوجِّه المستخدم لصفحته الافتراضية حسب دوره
 *
 *  الاستخدام: يوضع في <Route index> لـ /app للتعامل مع "/app"
 *  بدون تحديد صفحة معينة.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../core/stores';
import { getDefaultPathForRole } from '../constants';

export function RoleRedirect() {
  const { user } = useAuthStore();
  return <Navigate to={getDefaultPathForRole(user?.role)} replace />;
}

export default RoleRedirect;
