/**
 * usePortalUnits — وحدات المستخدم في بوابتَي المدير والمشرف
 *
 * يُستخدم في:
 *   - RequirePortalUnit  (حارس المسارات)
 *   - Sidebar            (عرض الوحدات المُسنَدة)
 *   - ManagerUnitNav     (التنقل بين صفحات الوحدة)
 *
 * الأمان: هذا للعرض (UX). الحماية الحقيقية في require_portal_unit()
 * و is_in_my_team() داخل القاعدة.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../core/stores';
import {
  portalUnitService,
  type MyPortalUnit,
} from '../../services/sdk/PortalUnitService';
import type {
  PortalUnitBaseRole,
  PortalUnitKey,
} from '../constants/portalUnits';

/** أدوار المنصة ترى كل الوحدات للتشخيص والدعم */
const PLATFORM_ROLES = ['admin', 'developer', 'it_admin'];

export function usePortalUnits() {
  const { user } = useAuthStore();
  const [units, setUnits] = useState<MyPortalUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const isPlatformAdmin = useMemo(
    () => PLATFORM_ROLES.includes(String(user?.role ?? '')),
    [user?.role],
  );

  const load = useCallback(async () => {
    if (!user?.id) {
      setUnits([]);
      setLoading(false);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const result = await portalUnitService.findMyUnits();
      setUnits(result);
    } catch {
      // فشل القراءة لا يمنح صلاحيات
      setUnits([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /**
   * هل للمستخدم هذه الوحدة؟
   * المدير يشمل صلاحية المشرف في الوحدة نفسها — مطابقةً لـ has_portal_unit.
   */
  const hasUnit = useCallback(
    (baseRole: PortalUnitBaseRole, unitKey: PortalUnitKey) => {
      if (isPlatformAdmin) return true;
      return units.some(
        (u) =>
          u.unitKey === unitKey &&
          (u.baseRole === baseRole || u.baseRole === 'manager'),
      );
    },
    [units, isPlatformAdmin],
  );

  /** مفاتيح الوحدات لدور أساس معيّن */
  const unitKeysFor = useCallback(
    (baseRole: PortalUnitBaseRole): PortalUnitKey[] => {
      const keys = units
        .filter((u) => u.baseRole === baseRole || u.baseRole === 'manager')
        .map((u) => u.unitKey);
      return [...new Set(keys)];
    },
    [units],
  );

  return {
    units,
    hasUnit,
    unitKeysFor,
    isPlatformAdmin,
    loading,
    loaded,
    reload: load,
  };
}
