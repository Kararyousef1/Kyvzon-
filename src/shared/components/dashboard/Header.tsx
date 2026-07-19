/**
 * ════════════════════════════════════════════════════════════════
 *  Header - Kyvzon Platform
 * ════════════════════════════════════════════════════════════════
 *
 *  ✅ إصلاح #1: حذف Realtime المكرر — لا يفتح أي channel هنا
 *  ✅ إصلاح #2: يستخدم <NotificationBell> بدل state الإشعارات المحلي
 *  ✅ إصلاح #3: حذف interface Notification المحلي (is_read مقابل read)
 *  ✅ إصلاح #4: P0 Mobile — lg:mr-64 بدل mr-64
 *
 * ════════════════════════════════════════════════════════════════
 */

import {
  Menu, Search, Sun, Moon, Sunset, ChevronDown,
  LogOut, User, Settings, X, FileText, AlertCircle,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { getUserDisplayName } from '../../../utils/userUtils';

// ✅ NotificationBell هو المصدر الوحيد لعرض الإشعارات
import NotificationBell from './NotificationBell';

import type { LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VIEW_TO_PATH } from '../../../router/legacyRedirect';

export const viewTitles: Record<string, string> = {
  // Employee
  'employee-dashboard': 'الرئيسية',
  'employee-problems': 'البلاغات',
  'employee-wellness': 'الصحة النفسية',
  'employee-survey': 'الاستبيانات',
  'employee-training': 'التدريب',
  'employee-sops': 'دليل الإجراءات',
  'employee-ai-chat': 'المساعد الذكي',
  'employee-contact': 'اتصل بـ HR',
  'employee-profile': 'حسابي',
  'employee-attendance': 'سجل الحضور',
  'employee-requests': 'طلباتي',
  'employee-leave-requests': 'طلب إجازة أو زمنية',
  'employee-permissions': 'طلب زمنية',
  'employee-payroll': 'رواتبي',
  'employee-loans': 'سلفي',
  'employee-expenses': 'نفقاتي',
  'employee-ai-insights': 'رؤى الذكاء الاصطناعي',
  'insights': 'رؤى وتحليلات',
  'new-problem': 'رفع بلاغ جديد',
  'problem-detail': 'تفاصيل البلاغ',
  // Supervisor
  'supervisor-breaks': 'تسجيل الخروج',
  'supervisor-leave-requests': 'إجازات الفريق',
  // Manager
  'manager-dashboard': 'الرئيسية',
  'manager-attendance': 'حضور الفريق',
  'manager-leave-requests': 'طلبات الإجازات',
  // HR
  'hr-dashboard': 'الرئيسية',
  'hr-problems': 'البلاغات',
  'hr-analytics': 'التحليلات',
  'hr-team': 'إدارة الموظفين',
  'hr-talent-market': 'سجل المؤهلات',
  'hr-communication': 'صندوق الرسائل',
  'hr-movement-analysis': 'تحليل الحركة',
  'hr-reports': 'التقارير',
  'hr-attendance': 'سجلات الحضور',
  'hr-leave-requests': 'طلبات الإجازات',
  'hr-manage-training': 'إدارة التدريب',
  'hr-training-reports': 'تقارير التدريب',
  'hr-ai-insights': 'رؤى الذكاء الاصطناعي',
  'hr-payroll': 'الرواتب',
  'hr-loans': 'السلف والقروض',
  'hr-bonuses': 'الجوائز والمكافآت',
  'hr-expenses': 'طلبات النفقات',
  'hr-recruitment': 'التوظيف',
  'hr-onboarding': 'التعريف وإنهاء الخدمة',
  'hr-documents': 'مستندات الموظفين',
  'hr-performance': 'تقييم الأداء',
  'hr-disciplinary': 'الإجراءات التأديبية',
  'hr-shifts': 'جدولة الورديات',
  // Admin
  'admin-dashboard': 'الرئيسية',
  'admin-cms': 'إدارة صفحة الزوار',
  'admin-employees': 'إدارة الموظفين',
  'admin-reports': 'تقارير النظام',
  'admin-settings': 'إعدادات النظام',
  'admin-audit-log': 'سجل العمليات',
  'admin-sops': 'إدارة إجراءات SOP',
  'admin-sops-reports': 'تقارير SOP',
  'admin-ai-config': 'إعدادات AI',
  'admin-ai-insights': 'رؤى الذكاء الاصطناعي',
  'admin-attendance': 'سجلات الحضور',
  'admin-permissions': 'شجرة الصلاحيات',
  'admin-gatekeeper-permissions': 'صلاحيات الحراس',
  // Gatekeeper
  'gatekeeper-portal': 'تسجيل الدخول والخروج',
  'kiosk-mode': 'محطة التسجيل الذاتي',
  // Tech Portal
  'tech-portal': 'البوابة التقنية',
  // Finance Portal
  'finance-dashboard': 'ملخص الدفتر العام',
  'finance-coa': 'دليل الحسابات',
  'finance-journal': 'قيود اليومية',
  'finance-trial-balance': 'ميزان المراجعة',
  'finance-ledger': 'دفتر الأستاذ العام',
  'finance-reports': 'التقارير المالية',
  'finance-periods': 'الفترات المحاسبية',
  'finance-vendors': 'إدارة الموردين',
  'finance-payable': 'الحسابات الدائنة (AP)',
  'finance-setup': 'إعدادات النظام المالي',
  // Developer
  'developer-dashboard': 'لوحة التحكم',
  'developer-attendance': 'نظام البصمة',
  'developer-logs': 'سجل الأخطاء',
  'developer-db': 'قاعدة البيانات',
  'developer-structure': 'بنية النظام',
  // General
  'my-notifications': 'الإشعارات',
  'notifications': 'التبليغات',
};

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

interface QuickSearchItem {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  category: 'page' | 'action';
  action: () => void;
}

// ════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════

export default function Header() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * تحويل مسار URL الحالي إلى view id مقارَن بـ VIEW_TO_PATH.
   * (نعكس الـ mapping لأن viewTitles يستخدم view IDs كمفاتيح).
   */
  const currentViewId = (() => {
    for (const [view, path] of Object.entries(VIEW_TO_PATH)) {
      if (location.pathname === path) return view;
    }
    return '';
  })();

  /** Navigate helper: يتلقى view id قديم ويحوّله لمسار جديد */
  const goToView = (viewId: string) => {
    const path = VIEW_TO_PATH[viewId];
    if (path) navigate(path);
  };
  const { toggleSidebar, sidebarOpen } = useUIStore();

  // ✅ لا state للإشعارات هنا — NotificationBell يديرها بالكامل
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const displayName = getUserDisplayName(user);

  // ─── إغلاق القوائم عند النقر خارجها ─────────────────────────
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── التحية حسب الوقت ────────────────────────────────────────
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return {
      text: 'صباح الخير', icon: Sun,
      gradient: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-50', border: 'border-amber-200', textColor: 'text-amber-700',
    };
    if (hour >= 12 && hour < 17) return {
      text: 'مساء الخير', icon: Sun,
      gradient: 'from-orange-500 to-red-500',
      bg: 'bg-orange-50', border: 'border-orange-200', textColor: 'text-orange-700',
    };
    if (hour >= 17 && hour < 21) return {
      text: 'مساء النور', icon: Sunset,
      gradient: 'from-purple-500 to-pink-500',
      bg: 'bg-purple-50', border: 'border-purple-200', textColor: 'text-purple-700',
    };
    return {
      text: 'ليلة طيبة', icon: Moon,
      gradient: 'from-indigo-500 to-purple-500',
      bg: 'bg-indigo-50', border: 'border-indigo-200', textColor: 'text-indigo-700',
    };
  };

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;
  const today = format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar });

  // ─── عناصر البحث السريع ──────────────────────────────────────
  const getQuickSearchItems = (): QuickSearchItem[] => {
    const items: QuickSearchItem[] = [];
    Object.entries(viewTitles).forEach(([id, title]) => {
      items.push({
        id, title, subtitle: 'صفحة', icon: FileText, category: 'page',
        action: () => { goToView(id); setShowSearch(false); setSearchQuery(''); },
      });
    });
    if (
      user?.role === 'employee' ||
      user?.role === 'supervisor' ||
      user?.role === 'manager'
    ) {
      items.push({
        id: 'quick-problem', title: 'رفع بلاغ جديد', subtitle: 'إجراء سريع',
        icon: AlertCircle, category: 'action',
        action: () => { navigate('/app/employee/problems/new'); setShowSearch(false); },
      });
    }
    return items;
  };

  const searchItems = getQuickSearchItems();
  const filteredItems = searchQuery.trim()
    ? searchItems
        .filter((item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 5)
    : [];

  // ─── عنوان الصفحة (يعتمد على مسار URL الحالي) ────────────────
  const getPageTitle = () => {
    // مسارات التفاصيل الديناميكية (e.g. /app/employee/problems/:id)
    if (/\/(employee|hr)\/problems\/[^/]+/.test(location.pathname)) {
      return 'تفاصيل البلاغ';
    }
    return viewTitles[currentViewId] || 'لوحة التحكم';
  };

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-30',
        'bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm',
        'transition-all duration-300',
        sidebarOpen ? 'lg:mr-64' : 'lg:mr-16',
      ].join(' ')}
    >
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">

        {/* ── Left: Menu + Title ── */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
            aria-label="قائمة التنقل"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
              {getPageTitle()}
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block truncate">{today}</p>
          </div>
        </div>

        {/* ── Right: Actions ── */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Search */}
          <div className="relative" ref={searchRef}>
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              aria-label="بحث"
            >
              <Search size={18} />
            </button>

            {showSearch && (
              <div className="absolute left-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
                <div className="p-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    <Search size={16} className="text-slate-400 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="بحث في الصفحات..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400 flex-1"
                      autoFocus
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        <X size={14} className="text-slate-400" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={item.action}
                          className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-right"
                        >
                          <div className="p-2 bg-indigo-50 rounded-lg flex-shrink-0">
                            <Icon size={16} className="text-indigo-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
                          </div>
                        </button>
                      );
                    })
                  ) : searchQuery ? (
                    <p className="text-sm text-slate-400 text-center py-8">لا توجد نتائج</p>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">ابدأ الكتابة للبحث...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Greeting Badge */}
          <div
            className={`hidden lg:flex items-center gap-2 ${greeting.bg} border ${greeting.border} rounded-xl px-3 py-2`}
          >
            <GreetingIcon
              size={16}
              className={`bg-gradient-to-br ${greeting.gradient} bg-clip-text text-transparent`}
            />
            <span className={`text-sm font-medium ${greeting.textColor}`}>
              {greeting.text}
            </span>
          </div>

          {/* ✅ NotificationBell — يفتح channel واحد فقط ويدير كل شيء */}
          <NotificationBell userId={user?.id} size="md" />

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 hover:bg-slate-50 rounded-xl px-2 py-1.5 transition-colors"
            >
              {(user?.profile_image || user?.avatar) ? (
                <img
                  src={(user.profile_image ?? user.avatar ?? '') || ''}
                  alt={displayName}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover ring-2 ring-white shadow-sm"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  {displayName.charAt(0)}
                </div>
              )}
              <div className="hidden md:block text-right">
                <p className="text-sm font-semibold text-slate-700 leading-tight truncate max-w-[120px]">
                  {displayName}
                </p>
                <p className="text-xs text-slate-400 truncate max-w-[120px]">
                  {user?.position || user?.role}
                </p>
              </div>
              <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
            </button>

            {showUserMenu && (
              <div className="absolute left-0 top-12 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    {user?.profile_image || user?.avatar ? (
                      <img
                        src={(user.profile_image ?? user.avatar ?? '')}
                        alt={displayName}
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-white shadow"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {displayName.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {user?.email || user?.position || user?.role}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => { navigate('/app/employee/profile'); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-colors"
                  >
                    <User size={16} />
                    <span className="text-sm font-medium">حسابي</span>
                  </button>
                  <button
                    onClick={() => { navigate('/app/admin/settings'); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-colors"
                  >
                    <Settings size={16} />
                    <span className="text-sm font-medium">الإعدادات</span>
                  </button>
                  <div className="border-t border-slate-100 my-2" />
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors"
                  >
                    <LogOut size={16} />
                    <span className="text-sm font-medium">تسجيل الخروج</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}