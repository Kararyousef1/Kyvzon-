/**
 * ════════════════════════════════════════════════════════════════
 *  KyvzonDevPortal — بوابة إدارة منصة Kyvzon
 *  المكون الرئيسي الذي يدير التوجيه بين صفحات البوابة
 *
 *  هذه البوابة خاصة بشركة Kyvzon فقط (Platform Owner)
 *  لإدارة جميع الشركات المشتركة في المنصة.
 *
 *  الأمان:
 *  ✅ PIN مطلوب للدخول
 *  ✅ قفل بعد 5 محاولات فاشلة
 *  ✅ جميع العمليات مسجلة في audit log
 *  ✅ جلسة موقوتة 60 دقيقة
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, Suspense, lazy, type FC } from 'react';
import { PortalLayout } from './components/Layout';
import type { DevPortalPage } from './types';
import { useUIStore } from '../../core/stores';

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
//  PIN Gate — شاشة دخول البوابة
// ════════════════════════════════════════════════════════════════

import {
  checkDevPin,
  isDevSessionActive,
  clearDevSession,
} from '../../services/security/devPinService';
import { Lock, Shield, AlertCircle, KeyRound } from 'lucide-react';

const PinGate: FC<{ onVerified: () => void }> = ({ onVerified }) => {
  const { addToast } = useUIStore();
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [locked, setLocked] = useState(false);
  const [lockMins, setLockMins] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem('dev_pin_state');
    if (raw) {
      const state = JSON.parse(raw);
      if (state.lockedUntil > Date.now()) {
        setLocked(true);
        setLockMins(Math.ceil((state.lockedUntil - Date.now()) / 60_000));
      }
    }
  }, []);

  useEffect(() => {
    if (!locked) return;
    const i = setInterval(() => {
      const raw = localStorage.getItem('dev_pin_state');
      if (!raw) { setLocked(false); clearInterval(i); return; }
      const state = JSON.parse(raw);
      if (state.lockedUntil <= Date.now()) {
        setLocked(false);
        setError('');
        clearInterval(i);
      } else {
        setLockMins(Math.ceil((state.lockedUntil - Date.now()) / 60_000));
      }
    }, 30_000);
    return () => clearInterval(i);
  }, [locked]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || !pin.trim()) return;
    const result = checkDevPin(pin);
    if (result.success) {
      addToast('تم التحقق من الهوية', 'success');
      onVerified();
      return;
    }
    if (result.locked) {
      setLocked(true);
      setLockMins(result.remaining);
    }
    setError(result.message);
    setPin('');
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
        <div className="p-8 text-center">
          <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center shadow-2xl ${
            locked ? 'bg-gradient-to-br from-red-700 to-red-900' : 'bg-gradient-to-br from-cyan-500 to-blue-700'
          }`}>
            {locked ? <AlertCircle size={36} className="text-white" /> : <Lock size={36} className="text-white" />}
          </div>

          <h2 className="text-xl font-black text-white mb-1">بوابة Kyvzon</h2>
          <p className="text-sm text-slate-400 mb-6">إدارة منصة Kyvzon — دخول آمن</p>

          {locked ? (
            <div className="bg-red-900/40 border border-red-800 rounded-xl p-4 mb-6">
              <p className="text-red-300 text-sm font-bold">🔒 البوابة مقفلة مؤقتاً</p>
              <p className="text-red-400 text-xs mt-1">تجاوزت الحد المسموح. حاول بعد {lockMins} دقيقة.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600" size={20} />
                <input
                  type="password"
                  maxLength={20}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setError(''); }}
                  placeholder="••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-12 pl-4 py-4 text-center text-3xl font-mono text-white tracking-[0.5em] outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                  autoFocus
                />
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={!pin.trim()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-lg shadow-lg shadow-cyan-500/25 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                دخول البوابة
              </button>
            </form>
          )}

          <p className="text-[10px] text-slate-600 mt-6 flex items-center justify-center gap-1.5">
            <Shield size={10} /> جميع محاولات الدخول مُراقبة
          </p>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  KyvzonDevPortal — المكون الرئيسي
// ════════════════════════════════════════════════════════════════

export default function KyvzonDevPortal() {
  const [isVerified, setIsVerified] = useState(() => isDevSessionActive());
  const [activePage, setActivePage] = useState<DevPortalPage>('dashboard');

  if (!isVerified) {
    return <PinGate onVerified={() => setIsVerified(true)} />;
  }

  return (
    <PortalLayout activePage={activePage} onNavigate={setActivePage}>
      <Suspense fallback={<PageLoader />}>
        <PageRenderer page={activePage} onNavigate={(p) => setActivePage(p as DevPortalPage)} />
      </Suspense>
    </PortalLayout>
  );
}
