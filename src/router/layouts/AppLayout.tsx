/**
 * ═════════════════════════════════════════════════════════════════════════
 *  AppLayout — الطبقة الرئيسية لكل الصفحات المصادَق عليها
 *
 *  تحتوي:
 *   - Sidebar (يظهر أو يختفي حسب حجم الشاشة)
 *   - Header
 *   - Outlet (المسار الفرعي الحالي)
 *   - AppErrorBoundary + Suspense
 *   - إغلاق تلقائي للـ Sidebar على الموبايل
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useUIStore, useAuthStore } from '../../core/stores';
import Sidebar from '../../shared/components/dashboard/Sidebar';
import HybridSidebar from '../../pages/hybridportal/HybridSidebar';
import Header from '../../shared/components/dashboard/Header';
import SplashScreen from '../../shared/components/ui/SplashScreen';
import AppErrorBoundary from '../../shared/components/dashboard/developer/ErrorBoundary';
import { useTenantModules } from '../../shared/hooks/useTenantModules';

export function AppLayout() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const location = useLocation();
  const { user } = useAuthStore();
  const { subscriptionPlan } = useTenantModules();

  // الشركات ذات الاشتراك الهجين ترى شريطاً جانبياً مخصّصاً (لا بوابات كاملة).
  // الأدوار المنصّية (developer/it_admin) تبقى على الشريط العادي.
  const isPlatformRole = user?.role === 'developer' || user?.role === 'it_admin';
  const useHybridNav = subscriptionPlan === 'hybrid' && !isPlatformRole;

  // إغلاق الـ Sidebar تلقائياً على الموبايل عند تغيير المسار
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname, setSidebarOpen]);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Backdrop لإغلاق Sidebar على الموبايل */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {useHybridNav ? <HybridSidebar /> : <Sidebar />}
      <Header />

      <main
        className={`${sidebarOpen ? 'lg:mr-64' : 'lg:mr-16'} pt-16 min-h-screen transition-all duration-300 overflow-x-hidden`}
      >
        {/* overflow-x-hidden يمنع أي تمرير أفقي ناتج عن هوامش/عناصر عريضة داخل الصفحات */}
        <div className="p-4 sm:p-6">
          <AppErrorBoundary componentName="AppLayout">
            <Suspense fallback={<SplashScreen mini />}>
              <Outlet />
            </Suspense>
          </AppErrorBoundary>
        </div>
      </main>
    </div>
  );
}

export default AppLayout;
