/**
 * MovementRoleRedirect — التحويل الافتراضي داخل بوابة الحركة
 *
 * كان المسار الجذر /app/movement يحوّل دائماً إلى logistics/dashboard.
 * هذا يكسر تجربة من يملك دور حركة الموظفين فقط: يُحوَّل لصفحة يُرفض
 * وصوله إليها فيرى شاشة رفض بدل عمله.
 *
 * الحل: التحويل حسب الدور النشط فعلياً.
 */
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useMovementRoles } from '../../shared/hooks/useMovementRoles';

export function MovementRoleRedirect() {
  const { activeRole, roles, loading, loaded } = useMovementRoles();

  if (loading || !loaded) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" dir="rtl">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  const target = activeRole ?? roles[0] ?? null;

  if (target === 'employee_movement') {
    return <Navigate to="employee/permits" replace />;
  }
  if (target === 'logistics') {
    return <Navigate to="logistics/dashboard" replace />;
  }

  // بلا أي دور: نعرض شاشة الرفض الموحَّدة عبر الحارس
  return <Navigate to="logistics/dashboard" replace />;
}

export default MovementRoleRedirect;
