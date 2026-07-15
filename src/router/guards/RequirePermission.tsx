/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RequirePermission — يمنع الوصول بدون صلاحية محددة
 *
 *  الاستخدام:
 *    <Route element={<RequirePermission perm="hr-payroll" />}>
 *      <Route path="/app/hr/payroll" element={<HRPayrollPage />} />
 *    </Route>
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../core/stores';
import { hasPermission, PermissionKey } from '../../core/constants/permissions';
import { getDefaultPathForRole } from '../constants';

interface RequirePermissionProps {
  perm: PermissionKey;
  children?: React.ReactNode;
}

export function RequirePermission({ perm, children }: RequirePermissionProps) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;

  if (!hasPermission(user.permissions, perm)) {
    return <Navigate to={getDefaultPathForRole(user.role)} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default RequirePermission;
