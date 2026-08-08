/**
 * RequireDriver — حارس صفحات تطبيق السائق
 *
 * ─────────────────────────────────────────────────────────────────────────
 * العطل الذي يُصلحه (تشخيص 2026-08-05):
 *
 *   كانت صفحات السائق الثلاث داخل حارس دور اللوجستيات:
 *     <Route element={<RequireMovementRole role="logistics" />}>
 *       <Route path="driver/trips" ... />
 *
 *   أي أن السائق يحتاج دور logistics ليرى رحلاته — وهو دور مدير
 *   الأسطول الذي يفتح التكاليف والناقلين والربحية. تصعيد امتياز:
 *   إمّا يُحرم السائق من تطبيقه، أو يُمنح صلاحيات إدارية كاملة.
 *
 *   طبقة القاعدة كانت صحيحة أصلاً: السائق يُعرَّف بـ
 *   logistics_drivers.user_id = auth.uid() لا بدور بوابة (0291).
 *   الواجهة وحدها هي التي أخطأت.
 *
 * كيف يعمل:
 *   يستدعي is_current_user_driver() (0301) — نظير هادئ يعيد BOOLEAN.
 *   السائق الموقوف (status='suspended') يُعامَل كغير سائق.
 *
 * الأمان: هذا الحارس للعرض (UX). الحماية الحقيقية في
 *   movement_require_driver() داخل كل دالة سائق + RLS.
 *
 * ملاحظة: مدير الحركة/اللوجستيات يمر أيضاً — لأنه يحتاج معاينة
 *   شاشات السائق للدعم والتشخيص، تماماً كما تمر أدوار المنصة في
 *   movement_require_role.
 */
import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, TruckIcon } from 'lucide-react';
import { driverAppService } from '../../services/sdk/DriverAppService';
import { useMovementRoles } from '../../shared/hooks/useMovementRoles';
import Button from '../../shared/components/ui/Button';

export function RequireDriver({ children }: { children?: React.ReactNode }) {
  const navigate = useNavigate();
  const { hasRole, loaded: rolesLoaded } = useMovementRoles();
  const [isDriver, setIsDriver] = useState(false);
  const [checked, setChecked] = useState(false);

  // مدير الأسطول يعاين شاشات السائق للدعم
  const canSupervise = rolesLoaded && hasRole('logistics');

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const result = await driverAppService.isDriver();
        if (!cancelled) setIsDriver(result);
      } catch {
        // فشل الفحص لا يمنح وصولاً
        if (!cancelled) setIsDriver(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || !rolesLoaded) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" dir="rtl">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  if (isDriver || canSupervise) {
    return children ? <>{children}</> : <Outlet />;
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-4">
          <TruckIcon size={30} />
        </div>

        <h1 className="text-xl font-black text-slate-900 mb-2">
          هذه الشاشة للسائقين
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          تطبيق السائق يُعرض لمن له سجل سائق نشط في الأسطول.
        </p>

        <p className="text-sm text-sky-700 bg-sky-50 border border-sky-200 rounded-xl p-3 mb-4">
          إن كنت سائقاً ولا ترى رحلاتك، فحسابك غير مربوط بسجل السائق بعد.
          يربطه مدير الأسطول من صفحة «السائقون والامتثال».
        </p>

        <Button
          variant="secondary"
          onClick={() => navigate('/app')}
          icon={<ArrowRight size={14} />}
          iconPosition="left"
        >
          العودة للرئيسية
        </Button>
      </div>
    </div>
  );
}

export default RequireDriver;
