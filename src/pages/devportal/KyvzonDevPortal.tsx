/**
 * ════════════════════════════════════════════════════════════════
 *  KyvzonDevPortal — بوابة إدارة منصة Kyvzon
 *  المكون الرئيسي الذي يدير التوجيه بين صفحات البوابة
 *
 *  هذه البوابة خاصة بشركة Kyvzon فقط (Platform Owner)
 *  لإدارة جميع الشركات المشتركة في المنصة.
 *
 *  الأمان:
 *  ✅ الوصول يعتمد على Supabase Auth + profile role
 *  ✅ الصلاحيات الفعلية تفرضها RLS وEdge Functions
 *  ✅ جميع العمليات الإدارية تسجل في audit log
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, Suspense, lazy, type FC } from 'react';
import { PortalLayout } from './components/Layout';
import type { DevPortalPage } from './types';
import { Shield } from 'lucide-react';
import { useAuthStore } from '../../core/stores';

// ════════════════════════════════════════════════════════════════
//  Lazy Pages — تحميل عند الطلب للأداء
// ════════════════════════════════════════════════════════════════

const DashboardPage     = lazy(() => import('./pages/DashboardPage'));
const CompaniesPage     = lazy(() => import('./pages/CompaniesPage'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'));
const AuditLogPage      = lazy(() => import('./pages/AuditLogPage'));
const SettingsPage      = lazy(() => import('./pages/SettingsPage'));
const LandingCMSPage    = lazy(() => import('../../pages/admin/AdminLandingPageCMS'));
const PermissionsPage   = lazy(() => import('../../pages/admin/AdminPermissionsTree'));

// ════════════════════════════════════════════════════════════════
//  Page Loader
// ════════════════════════════════════════════════════════════════

const PageLoader: FC = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-10 h-10 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin" />
  </div>
);

// ════════════════════════════════════════════════════════════════
//  Page Renderer
// ════════════════════════════════════════════════════════════════

const PageRenderer: FC<{
  page: DevPortalPage;
  onNavigate: (page: DevPortalPage) => void;
}> = ({ page, onNavigate }) => {
  switch (page) {
    case 'dashboard':
      return <DashboardPage onNavigate={(p) => onNavigate(p as DevPortalPage)} />;
    case 'companies':
      return <CompaniesPage />;
    case 'subscriptions':
      return <SubscriptionsPage />;
    case 'audit-log':
      return <AuditLogPage />;
    case 'settings':
      return <SettingsPage />;
    case 'landing-cms':
      return <LandingCMSPage />;
    case 'permissions':
      return <PermissionsPage />;
    default:
      return <DashboardPage onNavigate={(p) => onNavigate(p as DevPortalPage)} />;
  }
};

// ════════════════════════════════════════════════════════════════
//  KyvzonDevPortal — المكون الرئيسي
// ════════════════════════════════════════════════════════════════

export default function KyvzonDevPortal() {
  const { user, isAuthenticated } = useAuthStore();
  const [activePage, setActivePage] = useState<DevPortalPage>('dashboard');
  const isDeveloper = isAuthenticated && (user?.role === 'developer' || user?.role === 'it_admin');

  // الوصول يبدأ من Supabase Auth + profile role. لا نعتمد على PIN في المتصفح
  // كحد صلاحيات؛ RLS/Edge Functions هي طبقة الحماية الحقيقية.
  if (!isDeveloper) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md text-center bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <Shield size={42} className="mx-auto mb-4 text-rose-400" />
          <h1 className="text-xl font-black text-white mb-2">غير مصرح</h1>
          <p className="text-sm text-slate-400">تحتاج إلى حساب developer أو it_admin في Supabase للوصول إلى بوابة المطور.</p>
        </div>
      </div>
    );
  }

  return (
    <PortalLayout activePage={activePage} onNavigate={setActivePage}>
      <Suspense fallback={<PageLoader />}>
        <PageRenderer page={activePage} onNavigate={(p) => setActivePage(p as DevPortalPage)} />
      </Suspense>
    </PortalLayout>
  );
}
