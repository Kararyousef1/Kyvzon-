/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RequirePage — حارس على مستوى الصفحة للاشتراك الهجين
 *
 *  المشكلة التي يحلّها:
 *   في الاشتراك الهجين تُخصَّص صفحات مُنتقاة (tenants.features). قبل هذا الحارس،
 *   الحماية كانت على مستوى الوحدة (RequireModule) فقط — فتخصيص صفحة واحدة من
 *   بوابة كان يفتح الوصول لكل صفحات تلك البوابة (ثغرة).
 *
 *  السلوك:
 *   - إن لم يكن الاشتراك "hybrid" → يمرّر دون تدخّل (لا يؤثر على باقي الاشتراكات).
 *   - إن كان "hybrid":
 *       • يحوّل المسار الحالي إلى page-id.
 *       • يسمح فقط إذا كانت الصفحة ضمن features + دور المستخدم مسموح.
 *       • غير ذلك → يعرض شاشة "غير متاح" واضحة (بدون تسريب وجود الصفحة).
 *
 *  ملاحظة: هذا الحارس لا يستبدل RequireModule/RequireRole، بل يضيف طبقة أدق.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { useTenantModules } from '../../shared/hooks/useTenantModules';
import { useAuthStore } from '../../core/stores';
import { isPathAllowedForHybrid } from '../../pages/hybridportal/hybridPagesCatalog';
import Button from '../../shared/components/ui/Button';

export function RequirePage({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { subscriptionPlan, enabledPages, loaded, loading } = useTenantModules();

  // الأدوار المنصّية (developer/it_admin) لا تخضع لقيود الاشتراك الهجين
  const isPlatformRole = user?.role === 'developer' || user?.role === 'it_admin';

  if (!loaded || loading) return null;

  // غير هجين أو دور منصّي → لا تدخّل
  if (subscriptionPlan !== 'hybrid' || isPlatformRole) {
    return children ? <>{children}</> : <Outlet />;
  }

  const check = isPathAllowedForHybrid(location.pathname, enabledPages ?? [], user?.role ?? null);

  if (check.allowed) {
    return children ? <>{children}</> : <Outlet />;
  }

  // محجوب — شاشة موحّدة (لا نميّز بين "غير مخصّصة" و"دورك لا يسمح" لتقليل التسريب)
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mb-4">
          <Lock size={30} />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 mb-2">هذه الصفحة غير متاحة لك</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          حسابك يعمل ضمن اشتراك مخصّص (Hybrid)، وهذه الصفحة ليست ضمن الصفحات المتاحة لدورك.
          تواصل مع إدارة شركتك أو منصة Kyvzon لتعديل الصلاحيات.
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

export default RequirePage;
