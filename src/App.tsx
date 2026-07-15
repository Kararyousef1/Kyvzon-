/**
 * ════════════════════════════════════════════════════════════════
 *  App.tsx — الجذر النظيف بعد Router migration
 *
 *  التحسينات:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ استبدال switch(activeView) الكبير بـ AppRouter الحقيقي
 *  ✅ deep-linking كامل، browser back/forward يعمل تلقائياً
 *  ✅ Route Guards موحّدة: RequireAuth / RequireRole
 *  ✅ Refresh يبقيك على الصفحة الحالية
 *  ✅ Legacy ?view=xxx redirects عبر LegacyViewHandler
 *  ✅ حجم الملف من 467 → ~90 سطر
 * ════════════════════════════════════════════════════════════════
 */

import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from './core/stores';
import { TenantProvider } from './core/tenant/TenantContext';
import ToastContainer from './shared/components/ui/Toast';
import SplashScreen from './shared/components/ui/SplashScreen';
import WelcomeModal from './shared/components/dashboard/WelcomeModal';
import AppRouter from './router/AppRouter';

const AUTH_INIT_TIMEOUT_MS = 10_000;

export default function App() {
  const { loading, initialize } = useAuthStore();

  const initRef = useRef(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);

  // ═══════════════════════════════════════════════
  //  Init auth session (مرة واحدة فقط)
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const timeoutId = window.setTimeout(() => {
      // إذا استغرقت المصادقة أكثر من الحد، نُظهر رسالة للمستخدم
      // (App يعرض splash طيلة loading — هذا فقط علامة على "شيء ما بطيء")
      setAuthTimedOut(true);
    }, AUTH_INIT_TIMEOUT_MS);

    initialize().finally(() => {
      window.clearTimeout(timeoutId);
    });
  }, [initialize]);

  // ═══════════════════════════════════════════════
  //  Preview mode: ?preview=1 → عرض LandingPage فقط
  //  للاستخدام في CMS الوسائط والاختبار البصري
  // ═══════════════════════════════════════════════
  const isPreviewMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1';

  if (isPreviewMode) {
    return (
      <TenantProvider>
        <AppRouter />
        <ToastContainer />
      </TenantProvider>
    );
  }

  // شاشة تحميل أثناء تهيئة المصادقة
  if (loading) {
    return <SplashScreen timedOut={authTimedOut} message={!authTimedOut ? 'جاري التحقق من الجلسة...' : undefined} />;
  }

  return (
    <TenantProvider>
      <AppRouter />
      <WelcomeModal />
      <ToastContainer />
    </TenantProvider>
  );
}
