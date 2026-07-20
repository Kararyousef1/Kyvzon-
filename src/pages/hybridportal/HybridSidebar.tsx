/**
 * ═════════════════════════════════════════════════════════════════════════
 *  HybridSidebar — الشريط الجانبي الديناميكي للبوابة الهجينة
 *
 *  يعرض فقط:
 *    (صفحات الشركة المخصّصة من tenants.features) ∩ (ما يسمح به دور المستخدم)
 *    + الصفحات الأساسية الدائمة (الحساب/الإشعارات).
 *
 *  يُعيد استخدام مسارات النظام الموجودة (VIEW_TO_PATH) عبر الكتالوج الموحّد،
 *  فلا تكرار لمكوّنات الصفحات.
 *
 *  التصميم: بنفس نمط Sidebar الرئيسي، بهوية "الاشتراك الهجين" المميّزة (cyan).
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, LogOut, Bell, CheckCircle2, Boxes } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { useTenantModules } from '../../shared/hooks/useTenantModules';
import { useNotificationSubscription } from '../../shared/hooks/useNotificationSubscription';
import { getUserDisplayName } from '../../utils/userUtils';
import { buildHybridPagesForUser, groupHybridPages } from './hybridPagesCatalog';

export default function HybridSidebar() {
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { enabledPages } = useTenantModules();
  const navigate = useNavigate();
  const location = useLocation();
  // realtime:false — NotificationBell في الـ Header يملك قناة realtime الوحيدة.
  // فتح قناة ثانية بنفس الاسم يسبب: "cannot add postgres_changes after subscribe()".
  const { unreadCount } = useNotificationSubscription(user?.id ?? null, {
    limit: 20,
    realtime: false,
    refetchOnFocus: false,
  });

  // بناء الصفحات المرئية لهذا المستخدم (features ∩ role) + الأساسيات
  const groupedPages = useMemo(() => {
    const pages = buildHybridPagesForUser(enabledPages ?? [], user?.role ?? null);
    return groupHybridPages(pages);
  }, [enabledPages, user?.role]);

  if (!user) return null;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const go = (path: string) => {
    if (!path) return;
    navigate(path);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <aside
      className={`
        fixed right-0 top-0 h-full z-50 flex flex-col
        transition-all duration-300 ease-in-out
        bg-white border-l border-slate-100 shadow-xl
        ${sidebarOpen ? 'w-64' : 'w-0 lg:w-16 overflow-hidden'}
      `}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between p-4 flex-shrink-0 bg-gradient-to-br from-cyan-600 to-blue-700">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 p-1">
            <Boxes size={20} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  lineHeight: 1.2,
                  letterSpacing: '0.05em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #a5f3fc 70%, #67e8f9 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
                className="truncate"
              >
                KYVZON
              </div>
              <p className="text-white/70 text-xs truncate">بوابة مخصّصة (Hybrid)</p>
            </div>
          )}
        </div>
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
            aria-label="إغلاق القائمة"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {/* ── User Info ── */}
      {sidebarOpen && (
        <div className="p-4 flex-shrink-0 border-b border-slate-100 bg-gradient-to-br from-cyan-50 to-white">
          <div className="flex items-center gap-3">
            {(user.profile_image ?? user.avatar ?? '') ? (
              <img
                src={user.profile_image ?? user.avatar ?? ''}
                alt={getUserDisplayName(user)}
                className="w-10 h-10 rounded-xl object-cover flex-shrink-0 ring-2 ring-white shadow"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 bg-gradient-to-br from-cyan-600 to-blue-700">
                {getUserDisplayName(user).charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-slate-800 font-semibold text-sm truncate">{getUserDisplayName(user)}</p>
                <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
              </div>
              <p className="text-slate-500 text-xs truncate mt-0.5">{user?.position || user?.department || 'مستخدم'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation (ديناميكي حسب features + الدور) ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groupedPages.length === 0 && sidebarOpen && (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-slate-400 leading-relaxed">
              لا توجد صفحات مخصّصة لحسابك حالياً.
              <br />
              تواصل مع إدارة منصة Kyvzon.
            </p>
          </div>
        )}

        {groupedPages.map(({ group, pages }) => (
          <div key={group.key}>
            {sidebarOpen && (
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {pages.map((page) => {
                const Icon = page.icon;
                const active = isActive(page.path ?? '');
                return (
                  <button
                    key={page.id}
                    onClick={() => go(page.path ?? '')}
                    title={!sidebarOpen ? page.label : undefined}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                      transition-all duration-150 group relative
                      ${active
                        ? 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                    `}
                  >
                    <Icon
                      size={18}
                      className={`flex-shrink-0 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'}`}
                    />
                    {sidebarOpen && (
                      <span className="text-sm font-medium flex-1 text-right truncate">{page.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="p-3 border-t border-slate-100 flex-shrink-0 space-y-1">
        {sidebarOpen && (
          <button
            onClick={() => go('/app/my-notifications')}
            className="w-full relative flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Bell size={18} className="flex-shrink-0" />
            <span className="text-sm font-medium flex-1 text-right">الإشعارات</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={logout}
          title={!sidebarOpen ? 'تسجيل الخروج' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {sidebarOpen && <span className="text-sm font-medium">تسجيل الخروج</span>}
        </button>
      </div>
    </aside>
  );
}
