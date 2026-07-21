/**
 * ═════════════════════════════════════════════════════════════════════════
 *  usePagePermission — فحص صلاحية صفحة/إجراء للمستخدم الحالي
 *
 *  يطابق منطق الشريط الجانبي (Sidebar.canView) تماماً:
 *   1) إن كان للمستخدم صلاحيات مخصّصة (custom_permissions.allowed_pages)
 *      المُدارة من بوابة الإدارة → تُعتمَد هي المرجع (وجود المفتاح فيها).
 *   2) وإلا → الصلاحيات الافتراضية حسب الدور.
 *
 *  الاستخدام:
 *    const canCreateProblem = usePagePermission('new-problem');
 *    {canCreateProblem && <Button>رفع بلاغ</Button>}
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useMemo } from 'react';
import { useAuthStore } from '../../core/stores';
import { getEffectivePermissions, hasPermission } from '../../core/constants/permissions';
import type { UserRole } from '../types';

export function usePagePermission(permissionKey: string): boolean {
  const { user } = useAuthStore();

  return useMemo(() => {
    if (!user) return false;

    // (1) الصلاحيات المخصّصة (allowed_pages) — يتحكّم بها الـ admin من بوابة الإدارة
    const allowedPages = user.custom_permissions?.allowed_pages;
    if (Array.isArray(allowedPages)) {
      return allowedPages.includes(permissionKey);
    }

    // (2) الافتراضي حسب الدور
    const effective = getEffectivePermissions((user.role as UserRole) ?? 'employee', user.permissions);
    return hasPermission(effective, permissionKey);
  }, [user, permissionKey]);
}

export default usePagePermission;
