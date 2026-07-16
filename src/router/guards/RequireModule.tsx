/**
 * RequireModule - يمنع الوصول إلى بوابة غير مفعلة في اشتراك الشركة.
 */
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { useTenantModules } from '../../shared/hooks/useTenantModules';
import { getModuleForPath } from '../moduleMap';
import Button from '../../shared/components/ui/Button';

export function RequireModule({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isEnabled, loaded, loading } = useTenantModules();
  const moduleInfo = getModuleForPath(location.pathname);

  if (!moduleInfo) return children ? <>{children}</> : <Outlet />;
  if (!loaded || loading) return null;
  if (isEnabled(moduleInfo.moduleKey)) return children ? <>{children}</> : <Outlet />;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
          <Lock size={30} />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 mb-2">البوابة غير مفعلة</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          {moduleInfo.label} غير مفعلة في اشتراك شركتك. يرجى التواصل مع إدارة منصة Kyvzon لتفعيلها.
        </p>
        <Button variant="secondary" onClick={() => navigate('/app')} icon={<ArrowRight size={14} />} iconPosition="left">
          العودة للرئيسية
        </Button>
      </div>
    </div>
  );
}

export default RequireModule;
