/**
 * RequireDynamicPortalUnit — حارس وحدة تُقرأ من المسار
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RequirePortalUnit يأخذ unitKey ثابتاً — مناسب للمسارات المخصّصة
 * (وحدة الحركة). لكن الوحدات الثماني تتشارك صفحة واحدة على مسار
 * ديناميكي: /app/manager/units/:unitKey/approvals
 *
 * هذا الحارس يقرأ المعامل ويتحقق منه، ويرفض المفاتيح غير المعروفة
 * قبل أن تصل للقاعدة.
 */
import { Outlet, useParams } from 'react-router-dom';
import RequirePortalUnit from './RequirePortalUnit';
import {
  findUnit,
  type PortalUnitBaseRole,
  type PortalUnitKey,
} from '../../shared/constants/portalUnits';
import Card from '../../shared/components/ui/Card';

export function RequireDynamicPortalUnit({
  baseRole,
}: {
  baseRole: PortalUnitBaseRole;
}) {
  const { unitKey } = useParams<{ unitKey: string }>();
  const unit = unitKey ? findUnit(unitKey) : undefined;

  // مفتاح غير معروف أو وحدة غير متاحة لهذا الدور ⇒ لا نمرّره للقاعدة
  if (!unit || !unit.baseRoles.includes(baseRole)) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-6" dir="rtl">
        <Card className="max-w-md w-full p-8 text-center">
          <p className="font-black text-slate-800 mb-1">وحدة غير معروفة</p>
          <p className="text-sm text-slate-500">
            {unitKey
              ? `لا توجد وحدة «${unitKey}» متاحة لبوابة ${baseRole === 'manager' ? 'المدير' : 'المشرف'}.`
              : 'لم تُحدَّد وحدة في المسار.'}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <RequirePortalUnit baseRole={baseRole} unitKey={unit.unitKey as PortalUnitKey}>
      <Outlet />
    </RequirePortalUnit>
  );
}

export default RequireDynamicPortalUnit;
