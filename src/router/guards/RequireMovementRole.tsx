/**
 * RequireMovementRole — يفصل دورَي بوابة الحركة
 *
 * ─────────────────────────────────────────────────────────────────────────
 * المتطلب: «كل دور يعرض وحداته وصفحاته الخاصة فقط».
 *
 * قبل هذا الحارس كانت كل مسارات /app/movement محمية بـ RequireRole
 * و RequireModule فقط — أي أن صاحب دور اللوجستيات يصل لصفحات تصاريح
 * الموظفين والعكس. الفصل كان معدوماً في الواجهة.
 *
 * الحماية الحقيقية تبقى في قاعدة البيانات:
 *   public.movement_require_role() + RLS على كل جدول.
 * هذا الحارس يمنع الوصول للصفحة أصلاً بدل تركها تفشل باستعلامات فارغة.
 */
import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Loader2 } from 'lucide-react';
import {
  useMovementRoles,
  MOVEMENT_ROLE_LABELS,
} from '../../shared/hooks/useMovementRoles';
import type { MovementViewRole } from '../../services/sdk/MovementRoleService';
import Button from '../../shared/components/ui/Button';

export function RequireMovementRole({
  role,
  children,
}: {
  role: MovementViewRole;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { hasRole, roles, setActiveRole, loading, loaded } = useMovementRoles();

  if (loading || !loaded) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" dir="rtl">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  if (hasRole(role)) {
    return children ? <>{children}</> : <Outlet />;
  }

  // الدور الآخر المتاح — نعرض تحويلاً مباشراً بدل شاشة رفض صمّاء
  const alternative = roles.find((r) => r !== role);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
          <Lock size={30} />
        </div>

        <h1 className="text-xl font-black text-slate-900 mb-2">
          هذا القسم يخص دوراً آخر
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          الصفحة المطلوبة ضمن دور «{MOVEMENT_ROLE_LABELS[role]}»، وهو غير مُسنَد
          إليك في بوابة الحركة.
        </p>

        {alternative ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              دورك المتاح: <span className="font-bold">{MOVEMENT_ROLE_LABELS[alternative]}</span>
            </p>
            <Button
              variant="primary"
              onClick={() => {
                setActiveRole(alternative);
                navigate(
                  alternative === 'logistics'
                    ? '/app/movement/logistics/dashboard'
                    : '/app/movement/employee/permits',
                  { replace: true },
                );
              }}
            >
              الانتقال إلى {MOVEMENT_ROLE_LABELS[alternative]}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              لم يُسنَد إليك أي دور في بوابة الحركة. تواصل مع مدير النظام لإسناد
              الدور المناسب.
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
        )}
      </div>
    </div>
  );
}

export default RequireMovementRole;
