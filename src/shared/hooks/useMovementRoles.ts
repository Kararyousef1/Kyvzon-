/**
 * useMovementRoles — أدوار المستخدم في بوابة الحركة واللوجستيات
 *
 * يُستخدم في:
 *   - RequireMovementRole  (حارس المسارات)
 *   - MovementUnitNav      (عرض وحدات الدور النشط فقط)
 *   - Sidebar              (فلترة عناصر البوابة)
 *
 * الدور النشط يُحفظ في localStorage ليبقى بين الجلسات.
 * من يملك الدورين يرى مبدّلاً؛ من يملك واحداً لا يراه.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../core/stores';
import {
  movementRoleService,
  type MovementViewRole,
} from '../../services/sdk/MovementRoleService';

const ACTIVE_ROLE_KEY = 'kyvzon.movement.activeRole';

export const MOVEMENT_ROLE_LABELS: Record<MovementViewRole, string> = {
  employee_movement: 'حركة الموظفين',
  logistics: 'الحركة واللوجستيات',
};

/** أدوار المنصة التي ترى البوابة كاملةً بلا إسناد صريح */
const PLATFORM_ROLES = ['admin', 'developer', 'it_admin'];

export function useMovementRoles() {
  const { user } = useAuthStore();
  const [roles, setRoles] = useState<MovementViewRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [activeRole, setActiveRoleState] = useState<MovementViewRole | null>(null);

  const isPlatformAdmin = useMemo(
    () => PLATFORM_ROLES.includes(String(user?.role ?? '')),
    [user?.role],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id) {
        if (!cancelled) {
          setRoles([]);
          setLoading(false);
          setLoaded(true);
        }
        return;
      }

      setLoading(true);
      try {
        // أدوار المنصة ترى الدورين دون إسناد صريح (تشخيص ودعم)
        const result: MovementViewRole[] = isPlatformAdmin
          ? ['employee_movement', 'logistics']
          : await movementRoleService.findMyViewRoles(user.id);

        if (cancelled) return;
        setRoles(result);

        // استعادة الدور المحفوظ إن كان ما زال متاحاً
        const saved = localStorage.getItem(ACTIVE_ROLE_KEY) as MovementViewRole | null;
        setActiveRoleState(
          saved && result.includes(saved) ? saved : (result[0] ?? null),
        );
      } catch {
        // فشل القراءة لا يمنح صلاحيات — نغلق الوصول بأمان
        if (!cancelled) {
          setRoles([]);
          setActiveRoleState(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isPlatformAdmin]);

  const setActiveRole = useCallback(
    (role: MovementViewRole) => {
      if (!roles.includes(role)) return;
      localStorage.setItem(ACTIVE_ROLE_KEY, role);
      setActiveRoleState(role);
    },
    [roles],
  );

  const hasRole = useCallback(
    (role: MovementViewRole) => roles.includes(role),
    [roles],
  );

  return {
    roles,
    activeRole,
    setActiveRole,
    hasRole,
    /** المبدّل يظهر فقط لمن يملك الدورين */
    canSwitch: roles.length > 1,
    loading,
    loaded,
  };
}
