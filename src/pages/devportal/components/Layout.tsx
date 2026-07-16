/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Sidebar & Layout
 *  شريط جانبي احترافي خاص ببوابة إدارة منصة Kyvzon
 * ════════════════════════════════════════════════════════════════
 */

import { type FC, useState, useEffect } from 'react';
import {
  LayoutDashboard, Building2, CreditCard, ScrollText, SlidersHorizontal,
  Settings, Shield, ChevronLeft, LogOut, Bell,
  Globe, Palette, ShieldCheck, Activity, Terminal, UserPlus, FileText,
} from 'lucide-react';
import type { DevPortalPage, IconType } from '../types';
import { PAGE_META } from '../types';
import { useAuthStore } from '../../../core/stores';
import { useUIStore } from '../../../core/stores';
import { useNotificationSubscription } from '../../../shared/hooks/useNotificationSubscription';
import { getUserDisplayName } from '../../../utils/userUtils';

// ════════════════════════════════════════════════════════════════
//  Navigation Items
// ════════════════════════════════════════════════════════════════

interface NavItem {
  id: DevPortalPage;
  icon: IconType;
  label: string;
  description: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    label: 'الرئيسية',
    description: 'نظرة عامة وإحصاءات',
  },
  {
    id: 'companies',
    icon: Building2,
    label: 'الشركات',
    description: 'إدارة الشركات المشتركة',
  },
  {
    id: 'subscriptions',
    icon: CreditCard,
    label: 'الاشتراكات',
    description: 'خطط الأسعار والمدفوعات',
  },
  {
    id: 'modules',
    icon: SlidersHorizontal,
    label: 'البوابات',
    description: 'تفعيل بوابات الشركات',
  },
  {
    id: 'platform-health',
    icon: Activity,
    label: 'صحة المنصة',
    description: 'فحوصات هندسية وتشغيلية',
  },
  {
    id: 'engineering-console',
    icon: Terminal,
    label: 'الهندسة',
    description: 'جاهزية الإطلاق والفحوصات',
  },
  {
    id: 'landing-cms',
    icon: Palette,
    label: 'صفحة الزوار',
    description: 'تخصيص الصفحة الرئيسية',
  },
  {
    id: 'public-site',
    icon: FileText,
    label: 'الموقع العام',
    description: 'صفحات الفوتر وCTA',
  },
  {
    id: 'visitor-leads',
    icon: UserPlus,
    label: 'طلبات الزوار',
    description: 'طلبات التسجيل والتقييمات',
  },
  {
    id: 'permissions',
    icon: ShieldCheck,
    label: 'الصلاحيات',
    description: 'إدارة أدوار وصلاحيات النظام',
  },
  {
    id: 'audit-log',
    icon: ScrollText,
    label: 'سجل العمليات',
    description: 'مراقبة وتدقيق النشاطات',
  },
  {
    id: 'settings',
    icon: Settings,
    label: 'الإعدادات',
    description: 'تكوين المنصة',
  },
];

// ════════════════════════════════════════════════════════════════
//  Sidebar
// ════════════════════════════════════════════════════════════════

export const PortalSidebar: FC<{
  activePage: DevPortalPage;
  onNavigate: (page: DevPortalPage) => void;
  collapsed: boolean;
  onToggle: () => void;
}> = ({ activePage, onNavigate, collapsed, onToggle }) => {
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationSubscription(user?.id ?? null, {
    limit: 20,
    realtime: true,
    refetchOnFocus: false,
  });

  // Close sidebar on mobile
  const handleNav = (page: DevPortalPage) => {
    onNavigate(page);
    if (window.innerWidth < 1024) onToggle();
  };

  return (
    <aside
      className={`fixed right-0 top-0 h-full z-40 flex flex-col bg-slate-900 border-l border-slate-800 transition-all duration-300 ${
        collapsed ? 'w-0 lg:w-[72px] overflow-hidden' : 'w-64'
      }`}
    >
      {/* ── Brand ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/20">
          <Shield size={18} className="text-white" />
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <h1
                className="text-lg font-black tracking-tight truncate"
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  background: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                KYVZON
              </h1>
              <p className="text-xs text-slate-500 -mt-0.5">Developer Portal</p>
            </div>
            <button
              onClick={onToggle}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          </>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${
                active
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon
                size={20}
                className={`flex-shrink-0 transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}
              />
              {!collapsed && (
                <>
                  <div className="flex-1 text-right min-w-0">
                    <span className="text-sm font-bold block truncate">{item.label}</span>
                    {active && <span className="text-[10px] opacity-70 block truncate">{item.description}</span>}
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && active && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-cyan-400 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div className="p-3 border-t border-slate-800 flex-shrink-0 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">
                {getUserDisplayName(user).charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-200 truncate">{getUserDisplayName(user)}</p>
              <p className="text-[10px] text-slate-500">Platform Owner</p>
            </div>
            <Bell size={16} className="text-slate-500 flex-shrink-0" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white font-bold" />
            )}
          </div>
        )}
        <button
          onClick={logout}
          title={collapsed ? 'تسجيل الخروج' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm font-bold">تسجيل الخروج</span>}
        </button>
      </div>
    </aside>
  );
};

// ════════════════════════════════════════════════════════════════
//  PortalLayout — تخطيط البوابة الرئيسي
// ════════════════════════════════════════════════════════════════

export const PortalLayout: FC<{
  activePage: DevPortalPage;
  onNavigate: (page: DevPortalPage) => void;
  children: React.ReactNode;
}> = ({ activePage, onNavigate, children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { addToast } = useUIStore();
  const meta = PAGE_META[activePage];

  // Responsive: collapse on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setCollapsed(true);
      else setCollapsed(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <PortalSidebar
        activePage={activePage}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {/* Backdrop for mobile */}
      {!collapsed && window.innerWidth < 1024 && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Main Content */}
      <div className={`transition-all duration-300 ${collapsed ? 'lg:mr-[72px]' : 'lg:mr-64'}`}>
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-lg border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ChevronLeft size={18} className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{meta.title}</h2>
              <p className="text-xs text-gray-500 hidden sm:block">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              متصل بـ Supabase
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 pb-20">
          {children}
        </main>
      </div>
    </div>
  );
};
