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
import { useUIStore } from '../../core/stores';
import Sidebar from '../../shared/components/dashboard/Sidebar';
import Header from '../../shared/components/dashboard/Header';
import SplashScreen from '../../shared/components/ui/SplashScreen';
import AppErrorBoundary from '../../shared/components/dashboard/developer/ErrorBoundary';

export function AppLayout() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const location = useLocation();

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

      <Sidebar />
      <Header />

      <main className="lg:mr-72 pt-16 min-h-screen">
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
