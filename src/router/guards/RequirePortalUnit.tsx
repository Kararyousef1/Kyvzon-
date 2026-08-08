/**
 * RequirePortalUnit — حارس وحدات بوابتَي المدير والمشرف
 *
 * ─────────────────────────────────────────────────────────────────────────
 * معمارية الوحدات (0302/0303): بدل دور جديد لكل بوابة، المدير يحمل
 * دور manager ووحدات مُسنَدة بنطاق. هذا الحارس يمنع الوصول لصفحة
 * وحدة لم تُسنَد للمستخدم.
 *
 * الأمان: هذا للعرض (UX). الحماية الحقيقية في require_portal_unit()
 * داخل كل دالة قاعدة + is_in_my_team() لفلترة الصفوف.
 */
import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, LayoutGrid } from 'lucide-react';
import { usePortalUnits } from '../../shared/hooks/usePortalUnits';
import {
  findUnit,
  PORTAL_UNIT_BASE_ROLE_LABELS,
  type PortalUnitBaseRole,
  type PortalUnitKey,
} from '../../shared/constants/portalUnits';
import Button from '../../shared/components/ui/Button';

export function RequirePortalUnit({
  baseRole,
  unitKey,
  children,
}: {
  baseRole: PortalUnitBaseRole;
  unitKey: PortalUnitKey;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { hasUnit, loading, loaded } = usePortalUnits();

  if (loading || !loaded) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" dir="rtl">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  if (hasUnit(baseRole, unitKey)) {
    return children ? <>{children}</> : <Outlet />;
  }

  const unit = findUnit(unitKey);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
          <LayoutGrid size={30} />
        </div>

        <h1 className="text-xl font-black text-slate-900 mb-2">
          هذه الوحدة غير مُسنَدة إليك
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          وحدة «{unit?.label ?? unitKey}» ضمن بوابة{' '}
          {PORTAL_UNIT_BASE_ROLE_LABELS[baseRole]} لم تُسنَد لحسابك.
        </p>

        <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-4">
          يُسنِدها مدير النظام من «إدارة المستخدمين ← الخطوة الثالثة ← وحدات
          البوابة».
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

export default RequirePortalUnit;
