/**
 * ═════════════════════════════════════════════════════════════════════════
 *  MarketingSidebar — الشريط الجانبي لبوابة التسويق
 *
 *  يعرض لوحة البوابة + الوحدات السبع. الوحدات غير الجاهزة بعد تُعرَض
 *  بشارة "قريباً" (تُبنى تدريجياً حسب ترتيب التقارير).
 *
 *  التصميم: بنفس نمط الأشرطة الأخرى، بهوية بوابة التسويق (fuchsia/بنفسجي).
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, LogOut, Megaphone, CheckCircle2 } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { getUserDisplayName } from '../../utils/userUtils';
import { MARKETING_NAV } from './marketingCatalog';

export default function MarketingSidebar() {
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/app/marketing' && location.pathname.startsWith(path + '/'));

  const go = (path: string, disabled: boolean) => {
    if (disabled) return;
    navigate(path);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false);
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
      {/* Header */}
      <div className="flex items-center justify-between p-4 flex-shrink-0 bg-gradient-to-br from-fuchsia-600 to-purple-700">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Megaphone size={20} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.05em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f5d0fe 70%, #e879f9 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}
                className="truncate"
              >
                KYVZON
              </div>
              <p className="text-white/70 text-xs truncate">بوابة التسويق</p>
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

      {/* User */}
      {sidebarOpen && (
        <div className="p-4 flex-shrink-0 border-b border-slate-100 bg-gradient-to-br from-fuchsia-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 bg-gradient-to-br from-fuchsia-600 to-purple-700">
              {getUserDisplayName(user).charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-slate-800 font-semibold text-sm truncate">{getUserDisplayName(user)}</p>
                <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
              </div>
              <p className="text-slate-500 text-xs truncate mt-0.5">{user?.position || 'فريق التسويق'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {MARKETING_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const disabled = item.status === 'coming_soon';
          return (
            <button
              key={item.id}
              onClick={() => go(item.path, disabled)}
              title={!sidebarOpen ? item.label : undefined}
              disabled={disabled}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative
                ${active
                  ? 'bg-gradient-to-br from-fuchsia-600 to-purple-700 text-white shadow-md'
                  : disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
              `}
            >
              <Icon size={18} className={`flex-shrink-0 ${active ? 'text-white' : disabled ? 'text-slate-300' : 'text-slate-400 group-hover:text-slate-700'}`} />
              {sidebarOpen && (
                <>
                  <span className="text-sm font-medium flex-1 text-right truncate">{item.label}</span>
                  {disabled && (
                    <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0">قريباً</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-100 flex-shrink-0">
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
