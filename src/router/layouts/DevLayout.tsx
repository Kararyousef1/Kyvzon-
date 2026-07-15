/**
 * ═════════════════════════════════════════════════════════════════════════
 *  DevLayout — طبقة خاصة لبوابة المطور (KyvzonDevPortal)
 *
 *  الفرق عن AppLayout: لا Sidebar/Header عام، لأن الـ portal يملك
 *  shell خاصاً به.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import SplashScreen from '../../shared/components/ui/SplashScreen';
import AppErrorBoundary from '../../shared/components/dashboard/developer/ErrorBoundary';

export function DevLayout() {
  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <AppErrorBoundary componentName="DevLayout">
        <Suspense fallback={<SplashScreen mini />}>
          <Outlet />
        </Suspense>
      </AppErrorBoundary>
    </div>
  );
}

export default DevLayout;
