/**
 * ════════════════════════════════════════════════════════════════
 *  Sidebar - Kyvzon Platform HR (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ Mobile/Tablet P0: z-50 (يظهر فوق Header) + إغلاق عند التنقل
 *  ✅ تنظيف جميع markdown artifacts (15+ موضع)
 *  ✅ إصلاح خطأ: .eq('read') → .eq('is_read') (العمود الصحيح)
 *  ✅ عداد الإشعارات يستخدم النظام الجديد (fetchNotificationsFromServer + Realtime)
 *  ✅ دمج useEffect المكرر
 *  ✅ إصلاح جميع template literals المكسورة
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Heart, ClipboardList, BookOpen,
  Bot, MessageSquare, User, Clock, Bell, LogOut, Building2,
  ChevronRight, CheckCircle2, Star, Users, BarChart2, Award,
  FileBarChart, Settings, ShieldCheck, Globe, Database,
  Terminal, AlertOctagon, Layers, BarChart3, Radio,
  ArrowRightLeft, TrendingUp, Fingerprint, ScrollText,
  FolderKanban, CalendarClock, Megaphone, ClipboardCheck,
  Receipt, CreditCard, DollarSign, ShieldAlert, FileText,
  Briefcase, UserPlus, Plus, Cpu,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { VIEW_TO_PATH } from '../../../router/legacyRedirect';
import { UserRole } from '../../types';
import {
  getEffectivePermissions,
  hasPermission,
  PermissionKey,
} from '../../../core/constants/permissions';
import { incidentService } from '../../../services/sdk/IncidentService';
import { notificationService } from '../../../services/sdk/NotificationService';
import { getUserDisplayName } from '../../../utils/userUtils';

// ─── نظام الإشعارات الجديد (Supabase = مصدر الحقيقة) ────────────
// ✅ إصلاح: عداد الإشعارات يُقرأ عبر Hook الموحد بدل فتح channel جديد هنا
import { useNotificationSubscription } from '../../hooks/useNotificationSubscription';

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  roles: UserRole[];
  badge?: number;
  section: string;
  permKey?: PermissionKey;
}

interface NavSection {
  key: string;
  label: string;
  roles: UserRole[];
  items: NavItem[];
}

// ════════════════════════════════════════════════════════════════
//  Navigation Structure
// ════════════════════════════════════════════════════════════════

const NAV_SECTIONS: NavSection[] = [
  // ─── 👤 EMPLOYEE PORTAL ───
  {
    key: 'main', label: 'الرئيسية', roles: ['employee', 'supervisor', 'manager'],
    items: [{ id: 'employee-dashboard', label: 'الرئيسية', icon: LayoutDashboard, roles: ['employee', 'supervisor', 'manager'], section: 'main', permKey: 'dashboard' }],
  },
  {
    key: 'work', label: 'العمل', roles: ['employee', 'supervisor', 'manager'],
    items: [
      { id: 'employee-problems', label: 'البلاغات', icon: FolderKanban, roles: ['employee', 'supervisor', 'manager'], section: 'work', permKey: 'problems' },
      { id: 'new-problem', label: 'بلاغ جديد', icon: Plus, roles: ['employee', 'supervisor', 'manager'], section: 'work', permKey: 'new-problem' },
      { id: 'employee-attendance', label: 'سجل الحضور', icon: Clock, roles: ['employee', 'supervisor', 'manager'], section: 'work', permKey: 'my-attendance' },
      { id: 'employee-requests', label: 'طلباتي', icon: CalendarClock, roles: ['employee', 'supervisor', 'manager'], section: 'work', permKey: 'my-leave-requests' },
    ],
  },
  {
    key: 'growth', label: 'التطوير', roles: ['employee', 'supervisor', 'manager'],
    items: [
      { id: 'employee-training', label: 'التدريب', icon: BookOpen, roles: ['employee', 'supervisor', 'manager'], section: 'growth', permKey: 'training' },
      { id: 'employee-sops', label: 'دليل الإجراءات', icon: ScrollText, roles: ['employee', 'supervisor', 'manager'], section: 'growth', permKey: 'sops' },
      { id: 'employee-ai-chat', label: 'المساعد الذكي', icon: Bot, roles: ['employee', 'supervisor', 'manager'], section: 'growth', permKey: 'ai-chat' },
    ],
  },
  {
    key: 'personal', label: 'الشخصي', roles: ['employee', 'supervisor', 'manager'],
    items: [
      { id: 'employee-wellness', label: 'الصحة النفسية', icon: Heart, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'wellness' },
      { id: 'employee-survey', label: 'الاستبيانات', icon: ClipboardList, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'survey' },
      { id: 'employee-contact', label: 'اتصل بـ HR', icon: MessageSquare, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'contact' },
      { id: 'employee-profile', label: 'حسابي', icon: User, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'profile' },
    ],
  },
  {
    key: 'employee-finance', label: 'المالية والرواتب', roles: ['employee', 'supervisor', 'manager'],
    items: [
      { id: 'employee-payroll', label: 'رواتبي', icon: TrendingUp, roles: ['employee', 'supervisor', 'manager'], section: 'employee-finance' },
      { id: 'employee-loans', label: 'سلفي', icon: ArrowRightLeft, roles: ['employee', 'supervisor', 'manager'], section: 'employee-finance' },
      { id: 'employee-expenses', label: 'نفقاتي', icon: Receipt, roles: ['employee', 'supervisor', 'manager'], section: 'employee-finance' },
    ],
  },

  // ─── 👨‍💼 SUPERVISOR / MANAGER ───
  {
    key: 'supervisor', label: 'إدارة الفريق', roles: ['supervisor', 'manager'],
    items: [
      { id: 'supervisor-breaks', label: 'تسجيل الخروج', icon: ArrowRightLeft, roles: ['supervisor', 'manager'], section: 'supervisor', permKey: 'supervisor-breaks' },
      { id: 'manager-attendance', label: 'حضور الفريق', icon: Users, roles: ['manager'], section: 'supervisor', permKey: 'manager-attendance' },
    ],
  },

  // ─── 🏢 HR PORTAL ───
  {
    key: 'hr-main', label: 'الرئيسية', roles: ['hr'],
    items: [{ id: 'hr-dashboard', label: 'الرئيسية', icon: LayoutDashboard, roles: ['hr'], section: 'hr-main', permKey: 'dashboard' }],
  },
  {
    key: 'hr-operations', label: 'العمليات', roles: ['hr'],
    items: [
      { id: 'hr-problems', label: 'البلاغات', icon: FolderKanban, roles: ['hr'], section: 'hr-operations', permKey: 'hr-problems', badge: 0 },
      { id: 'hr-attendance', label: 'سجلات الحضور', icon: Clock, roles: ['hr'], section: 'hr-operations', permKey: 'attendance' },
      { id: 'hr-leave-requests', label: 'طلبات الإجازات', icon: CalendarClock, roles: ['hr'], section: 'hr-operations', permKey: 'leave-requests' },
      { id: 'hr-movement-analysis', label: 'تحليل الحركة', icon: TrendingUp, roles: ['hr'], section: 'hr-operations', permKey: 'movement-analysis' },
    ],
  },
  {
    key: 'hr-people', label: 'الموارد البشرية', roles: ['hr'],
    items: [
      { id: 'hr-team', label: 'إدارة الموظفين', icon: Users, roles: ['hr'], section: 'hr-people', permKey: 'team' },
      { id: 'hr-talent-market', label: 'سجل المؤهلات', icon: Award, roles: ['hr'], section: 'hr-people', permKey: 'talent-market' },
      { id: 'hr-recruitment', label: 'التوظيف', icon: Briefcase, roles: ['hr'], section: 'hr-people' },
      { id: 'hr-onboarding', label: 'التعريف وإنهاء الخدمة', icon: UserPlus, roles: ['hr'], section: 'hr-people' },
      { id: 'hr-documents', label: 'مستندات الموظفين', icon: FileText, roles: ['hr'], section: 'hr-people' },
      { id: 'hr-communication', label: 'صندوق الرسائل', icon: MessageSquare, roles: ['hr'], section: 'hr-people', permKey: 'communication', badge: 0 },
    ],
  },
  {
    key: 'hr-finance', label: 'الرواتب والمالية', roles: ['hr'],
    items: [
      { id: 'hr-payroll', label: 'الرواتب', icon: DollarSign, roles: ['hr'], section: 'hr-finance' },
      { id: 'hr-loans', label: 'السلف والقروض', icon: CreditCard, roles: ['hr'], section: 'hr-finance' },
      { id: 'hr-bonuses', label: 'الجوائز والمكافآت', icon: Award, roles: ['hr'], section: 'hr-finance' },
      { id: 'hr-expenses', label: 'طلبات النفقات', icon: Receipt, roles: ['hr'], section: 'hr-finance' },
    ],
  },
  {
    key: 'hr-performance', label: 'الأداء والتأديب', roles: ['hr'],
    items: [
      { id: 'hr-performance', label: 'تقييم الأداء', icon: TrendingUp, roles: ['hr'], section: 'hr-performance' },
      { id: 'hr-disciplinary', label: 'الإجراءات التأديبية', icon: ShieldAlert, roles: ['hr'], section: 'hr-performance' },
      { id: 'hr-shifts', label: 'جدولة الورديات', icon: CalendarClock, roles: ['hr'], section: 'hr-performance' },
    ],
  },
  {
    key: 'hr-development', label: 'التطوير والتدريب', roles: ['hr'],
    items: [
      { id: 'hr-manage-training', label: 'إدارة التدريب', icon: BookOpen, roles: ['hr'], section: 'hr-development', permKey: 'manage-training' },
      { id: 'hr-manage-surveys', label: 'إدارة الاستبيانات', icon: ClipboardCheck, roles: ['hr'], section: 'hr-development', permKey: 'survey' },
      { id: 'hr-sops', label: 'إدارة SOP', icon: ScrollText, roles: ['hr'], section: 'hr-development', permKey: 'sops' },
    ],
  },
  {
    key: 'hr-insights', label: 'التقارير والتحليل', roles: ['hr'],
    items: [
      { id: 'hr-analytics', label: 'التحليلات', icon: BarChart2, roles: ['hr'], section: 'hr-insights', permKey: 'analytics' },
      { id: 'hr-reports', label: 'التقارير', icon: FileBarChart, roles: ['hr'], section: 'hr-insights', permKey: 'reports' },
      { id: 'admin-ai-insights', label: 'رؤى الذكاء الاصطناعي', icon: BarChart3, roles: ['hr'], section: 'hr-insights', permKey: 'ai-insights-dashboard' },
    ],
  },

  // ─── 🔧 ADMIN PORTAL ───
  {
    key: 'admin-main', label: 'الرئيسية', roles: ['admin'],
    items: [{ id: 'admin-dashboard', label: 'الرئيسية', icon: LayoutDashboard, roles: ['admin'], section: 'admin-main' }],
  },
  {
    key: 'admin-management', label: 'الإدارة', roles: ['admin'],
    items: [
      { id: 'admin-employees', label: 'إدارة الموظفين', icon: Users, roles: ['admin'], section: 'admin-management', permKey: 'employees' },
      { id: 'admin-settings', label: 'إعدادات النظام', icon: Settings, roles: ['admin'], section: 'admin-management', permKey: 'settings' },
      { id: 'admin-ai-config', label: 'إعدادات AI', icon: Bot, roles: ['admin'], section: 'admin-management', permKey: 'ai-config' },
    ],
  },
  {
    key: 'admin-reports', label: 'التقارير', roles: ['admin'],
    items: [
      { id: 'admin-reports', label: 'تقارير النظام', icon: FileBarChart, roles: ['admin'], section: 'admin-reports', permKey: 'reports' },
      { id: 'hr-training-reports', label: 'تقارير التدريب', icon: BookOpen, roles: ['admin'], section: 'admin-reports', permKey: 'training-reports' },
      { id: 'admin-sops-reports', label: 'تقارير SOP', icon: ScrollText, roles: ['admin'], section: 'admin-reports', permKey: 'sops-reports' },
      { id: 'admin-audit-log', label: 'سجل العمليات', icon: ShieldCheck, roles: ['admin'], section: 'admin-reports', permKey: 'audit-log' },
    ],
  },

  // ─── 🚪 GATEKEEPER PORTAL ───
  {
    key: 'gatekeeper-main', label: 'لوحة التحكم', roles: ['gatekeeper'],
    items: [
      { id: 'gatekeeper-portal', label: 'تسجيل الدخول والخروج', icon: Fingerprint, roles: ['gatekeeper'], section: 'gatekeeper-main', permKey: 'gatekeeper-portal' },
      { id: 'kiosk-mode', label: 'محطة التسجيل الذاتي', icon: Radio, roles: ['gatekeeper'], section: 'gatekeeper-main', permKey: 'kiosk-mode' },
    ],
  },

  // ─── 💻 DEVELOPER PORTAL ───
  {
    key: 'dev-main', label: 'المنصة', roles: ['developer'],
    items: [
      { id: 'developer-dashboard', label: 'بوابة Kyvzon', icon: Terminal, roles: ['developer'], section: 'dev-main', permKey: 'developer-dashboard' },
    ],
  },

  // ─── 🖥️ IT/TECH PORTAL ───
  {
    key: 'tech-main', label: 'تقنية المعلومات', roles: ['it_admin'],
    items: [
      { id: 'tech-portal', label: 'البوابة التقنية', icon: Cpu, roles: ['it_admin'], section: 'tech-main' },
    ],
  },

  // ─── 💬 TAWATHUL (للجميع) ───
  {
    key: 'tawathul', label: 'التواصل', roles: ['employee', 'supervisor', 'manager', 'hr', 'admin'],
    items: [
      { id: 'tawathul-portal', label: 'بوابة التواصل', icon: MessageSquare, roles: ['employee', 'supervisor', 'manager', 'hr', 'admin'], section: 'tawathul' },
    ],
  },
  {
    key: 'tawathul-admin', label: 'إدارة التواصل', roles: ['hr', 'admin'],
    items: [
      { id: 'tawathul-admin', label: 'إعدادات التواصل', icon: Settings, roles: ['hr', 'admin'], section: 'tawathul-admin' },
    ],
  },

  // ─── 🔔 NOTIFICATIONS (للجميع) ───
  {
    key: 'notifications', label: 'الإشعارات',
    roles: ['employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager'],
    items: [
      { id: 'my-notifications', label: 'الإشعارات', icon: Bell, roles: ['employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager'], section: 'notifications', permKey: 'notifications' },
      { id: 'notifications', label: 'التبليغات', icon: Megaphone, roles: ['employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager'], section: 'notifications', permKey: 'notifications' },
    ],
  },
];

// ════════════════════════════════════════════════════════════════
//  Role Config
// ════════════════════════════════════════════════════════════════

const ROLE_CONFIG: Record<UserRole, { label: string; portalName: string; gradient: string; bg: string; text: string }> = {
  employee:    { label: 'موظف',         portalName: 'بوابة الموظف',  gradient: 'from-indigo-600 to-purple-700',  bg: 'from-indigo-50 to-purple-50',  text: 'text-indigo-600' },
  supervisor:  { label: 'مشرف',         portalName: 'بوابة المشرف', gradient: 'from-blue-600 to-blue-800',      bg: 'from-blue-50 to-blue-100',     text: 'text-blue-600' },
  manager:     { label: 'مدير',         portalName: 'بوابة المدير', gradient: 'from-amber-500 to-orange-600',   bg: 'from-amber-50 to-orange-50',   text: 'text-amber-600' },
  hr:          { label: 'موارد بشرية',  portalName: 'بوابة HR',     gradient: 'from-emerald-600 to-teal-700',   bg: 'from-emerald-50 to-teal-50',   text: 'text-emerald-600' },
  admin:       { label: 'مسؤول',        portalName: 'لوحة الإدارة', gradient: 'from-rose-600 to-red-700',       bg: 'from-rose-50 to-red-50',       text: 'text-rose-600' },
  gatekeeper:  { label: 'حارس',         portalName: 'بوابة الأمن',  gradient: 'from-cyan-600 to-blue-700',      bg: 'from-cyan-50 to-blue-50',      text: 'text-cyan-600' },
  developer:   { label: 'مطور',         portalName: 'بيئة التطوير', gradient: 'from-slate-700 to-slate-900',    bg: 'from-slate-100 to-slate-200',  text: 'text-slate-700' },
  it_admin:    { label: 'تقنية معلومات', portalName: 'البوابة التقنية', gradient: 'from-cyan-600 to-blue-700',    bg: 'from-cyan-50 to-blue-50',      text: 'text-cyan-600' },
};

// ════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const refreshUser = useAuthStore.getState().refreshUser;
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();

  // نستخدم location.pathname بدل activeView من Zustand
  const currentPath = location.pathname;
  const [dynamicBadges, setDynamicBadges] = useState({ problems: 0, messages: 0 });

  // ✅ إصلاح: عداد الإشعارات عبر Hook الموحد — لا channel مستقل هنا
  const { unreadCount } = useNotificationSubscription(user?.id ?? null, {
    limit: 50,
    realtime: true,
    refetchOnFocus: false,
  });

  const role = (user?.role as UserRole) || 'employee';
  const config = ROLE_CONFIG[role];

  // ─── تحديث الصلاحيات ───
  // ملاحظة فنية:
  // كنا نستخدم setInterval(refreshUser, 30000) هنا — وهذا كان خطأ أدائياً.
  // Realtime subscription في useAuthStore.initialize() و login() هو المسؤول
  // عن تحديث بيانات المستخدم فور تغييرها في قاعدة البيانات.
  // نحتاج فقط تحديثاً واحداً عند تحميل المكون للتأكد من آخر البيانات.
  useEffect(() => {
    refreshUser();
    // لا حاجة لـ setInterval — Realtime subscription يقوم بالمهمة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── شارات HR الديناميكية ────────────────────────────────────
  useEffect(() => {
    if (role !== 'hr' || !user?.id) return;

    let cancelled = false;

    const fetchBadges = async () => {
      try {
        const [problemsCount, unreadCount] = await Promise.all([
          incidentService.count({ status: 'pending' }),
          notificationService.countUnread(user.id),
        ]);
        if (!cancelled) {
          setDynamicBadges({
            problems: problemsCount,
            messages: unreadCount,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Badges fetch skipped:', err);
        }
      }
    };

    fetchBadges();

    return () => { cancelled = true; };
  }, [role, user?.id]);

  if (!user) return null;

  // ─── تصفية الأقسام والعناصر ──────────────────────────────────
  const canView = (item: NavItem): boolean => {
    if (!item.roles.includes(role)) return false;
    if (item.permKey) {
      const effective = getEffectivePermissions(role, user.permissions);
      return hasPermission(effective, item.permKey);
    }
    return true;
  };

  const visibleSections = NAV_SECTIONS
    .filter((section) => section.roles.includes(role))
    .map((section) => ({
      ...section,
      items: section.items.filter(canView).map((item) => {
        if (item.id === 'hr-problems') return { ...item, badge: dynamicBadges.problems || undefined };
        if (item.id === 'hr-communication') return { ...item, badge: dynamicBadges.messages || undefined };
        if (item.id === 'my-notifications') return { ...item, badge: unreadCount || undefined };
        return item;
      }),
    }))
    .filter((section) => section.items.length > 0);

  // ─── فحص العنصر النشط ────────────────────────────────────────
  const isActive = (itemId: string): boolean => {
    const targetPath = VIEW_TO_PATH[itemId];
    if (!targetPath) return false;
    // مطابقة تامة أو parent path (لـ /app/employee/problems يشمل /app/employee/problems/new)
    if (currentPath === targetPath) return true;
    if (itemId === 'employee-problems' && currentPath.startsWith('/app/employee/problems')) return true;
    if (itemId === 'hr-problems' && currentPath.startsWith('/app/hr/problems')) return true;
    return false;
  };

  // ─── معالج التنقل (يغلق الـ sidebar على الموبايل + يستخدم Router) ────
  const handleNavigate = (itemId: string) => {
    const targetPath = VIEW_TO_PATH[itemId];
    if (targetPath) {
      navigate(targetPath);
    } else {
      // fallback للأزرار غير المعروفة — لا نُوقف التطبيق
      console.warn(`Sidebar: no route for id "${itemId}"`);
    }
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <aside className={`
      fixed right-0 top-0 h-full z-50 flex flex-col
      transition-all duration-300 ease-in-out
      bg-white border-l border-slate-100 shadow-xl
      ${sidebarOpen ? 'w-64' : 'w-0 lg:w-16 overflow-hidden'}
    `}>
      {/* ── Header ── */}
      <div className={`flex items-center justify-between p-4 flex-shrink-0 bg-gradient-to-br ${config.gradient}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 p-1">
            <img src="/icons/icon-512.png" alt="KYVZON Logo" className="w-full h-full object-contain" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '1.2rem', // 19.2px
                  fontWeight: 900,
                  lineHeight: 1.2,
                  letterSpacing: '0.05em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #d8b4fe 70%, #a78bfa 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: '0 0 10px rgba(255,255,255,0.15)',
                }}
                className="truncate"
              >
                KYVZON
              </div>
              <p className="text-white/70 text-xs truncate">{config.portalName}</p>
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
        <div className={`p-4 flex-shrink-0 border-b border-slate-100 bg-gradient-to-br ${config.bg}`}>
          <div className="flex items-center gap-3">
            {(user.profile_image ?? user.avatar ?? '') ? (
              <img
                src={(user.profile_image ?? user.avatar ?? '')}
                alt={getUserDisplayName(user)}
                className="w-10 h-10 rounded-xl object-cover flex-shrink-0 ring-2 ring-white shadow"
              />
            ) : (
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 bg-gradient-to-br ${config.gradient}`}>
                {getUserDisplayName(user).charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-slate-800 font-semibold text-sm truncate">{getUserDisplayName(user)}</p>
                <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
              </div>
              <p className="text-slate-500 text-xs truncate mt-0.5">{user?.position || user?.department || config.label}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {visibleSections.map((section) => (
          <div key={section.key}>
            {sidebarOpen && (
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">{section.label}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    title={!sidebarOpen ? item.label : undefined}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                      transition-all duration-150 group relative
                      ${active
                        ? `bg-gradient-to-br ${config.gradient} text-white shadow-md`
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                    `}
                  >
                    <Icon
                      size={18}
                      className={`flex-shrink-0 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'}`}
                    />
                    {sidebarOpen && (
                      <>
                        <span className="text-sm font-medium flex-1 text-right truncate">{item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${active ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'}`}>
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </>
                    )}
                    {!sidebarOpen && item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
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
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2 flex items-center gap-2">
              <Star size={14} className="text-amber-500 flex-shrink-0" />
              <span className="text-xs text-slate-600 font-medium truncate">الصحة: {user.wellnessScore || 0}%</span>
            </div>
            <button
              onClick={() => handleNavigate('my-notifications')}
              className="relative p-2.5 rounded-xl hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors"
              aria-label="الإشعارات"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-xs w-4 h-4 flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
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