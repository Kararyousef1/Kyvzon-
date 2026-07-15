/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RequireRole — يمنع الوصول لمسارات مخصصة لدور معين
 *
 *  الاستخدام:
 *    <Route element={<RequireRole roles={['hr','admin']} />}>
 *      <Route path="/app/hr/*" element={<HRRoutes />} />
 *    </Route>
 *
 *  إذا لم يكن دور المستخدم مطابقاً:
 *   - يُوجَّه للـ default-path لدوره (لا نتركه على 403 مبهم)
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../core/stores';
import { getDefaultPathForRole } from '../constants';

interface RequireRoleProps {
  /** قائمة الأدوار المسموح لها بالوصول */
  roles: string[];
  /** children بديلة عن Outlet */
  children?: React.ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user } = useAuthStore();

  if (!user) {
    // نادراً — RequireAuth يجب أن يمسك هذا قبلنا
    return <Navigate to="/login" replace />;
  }

  const userRole = user.role || 'employee';
  if (!roles.includes(userRole)) {
    // إعادة التوجيه للـ default الخاص بدور المستخدم
    return <Navigate to={getDefaultPathForRole(userRole)} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default RequireRole;
