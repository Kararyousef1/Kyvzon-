/**
 * RequireModule - يمنع الوصول إلى بوابة غير مفعلة أو منتهية الاشتراك أو planned
 * تم تحسينه في خطة العلاج: فحص اشتراك + فحص حالة الوحدة (production/beta/planned)
 */
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, AlertTriangle, Clock, Construction } from 'lucide-react';
import { useTenantModules } from '../../shared/hooks/useTenantModules';
import { getModuleForPath } from '../moduleMap';
import { FINANCE_SUBMODULES } from '../../services/sdk/TenantModuleCatalog';
import Button from '../../shared/components/ui/Button';

export function RequireModule({
  children,
  moduleKey,
}: {
  children?: React.ReactNode;
  moduleKey?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isEnabled, loaded, loading, subscriptionExpired, subscriptionStatus, tenantStatus, isSuspended, getModuleStatus } = useTenantModules();
  const moduleInfo = getModuleForPath(location.pathname);
  const effectiveModule = moduleKey ?? moduleInfo?.moduleKey;

  if (!effectiveModule) return children ? <>{children}</> : <Outlet />;
  if (!loaded || loading) return null;

  // 1) فحص انتهاء الاشتراك / الإيقاف
  if (isSuspended || subscriptionExpired) {
    if (['/app', '/app/employee', '/app/profile', '/billing'].some(p => location.pathname.startsWith(p))) {
      // السماح بصفحات الحساب والفوترة
    } else {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-2xl border border-amber-200 shadow-sm p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4"><Clock size={30} /></div>
            <h1 className="text-xl font-black text-slate-900 mb-2">الاشتراك منتهي أو موقوف</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-2">حالة الاشتراك: {subscriptionStatus || 'منتهي'} — حالة الشركة: {tenantStatus || 'غير معروفة'}</p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">لا يمكن الوصول لـ {moduleInfo?.label ?? 'هذه البوابة'} حتى تجديد الاشتراك.</p>
            <div className="flex gap-2 justify-center">
              <Button variant="primary" onClick={() => navigate('/billing')}>الذهاب للفوترة</Button>
              <Button variant="secondary" onClick={() => navigate('/app')}>الرئيسية</Button>
            </div>
          </div>
        </div>
      );
    }
  }

  // 2) فحص تفعيل الوحدة
  if (!isEnabled(effectiveModule)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4"><Lock size={30} /></div>
          <h1 className="text-xl font-extrabold text-slate-900 mb-2">البوابة غير مفعلة</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-5">{moduleInfo?.label ?? 'هذه البوابة'} غير مفعلة في اشتراك شركتك. تواصل مع إدارة منصة Kyvzon لتفعيلها.</p>
          <Button variant="secondary" onClick={() => navigate('/app')} icon={<ArrowRight size={14} />} iconPosition="left">العودة للرئيسية</Button>
        </div>
      </div>
    );
  }

  // 3) فحص حالة finance submodules - إذا كانت planned، اعرض PlannedFeature بدلاً من منع كامل
  // هذا الفحص يتم داخل الصفحة نفسها عبر PlannedFeature، لكن نضيف تنبيه هنا للمطور
  const moduleStatus = getModuleStatus(effectiveModule);
  if (moduleStatus === 'planned') {
    console.warn(`[RequireModule] Module ${effectiveModule} is planned, should be behind PlannedFeature`);
    // لا نمنع، بل نسمح للصفحة أن تعرض PlannedFeature داخليًا (الصدق مع المستخدم)
  }

  return children ? <>{children}</> : <Outlet />;
}

export default RequireModule;
