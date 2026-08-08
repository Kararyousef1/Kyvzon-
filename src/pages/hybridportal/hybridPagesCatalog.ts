/**
 * ═════════════════════════════════════════════════════════════════════════
 *  hybridPagesCatalog.ts — الكتالوج الموحّد لصفحات الاشتراك الهجين
 *
 *  الغرض:
 *   مصدر واحد للحقيقة (Single Source of Truth) يربط كل page-id بـ:
 *     - label   : الاسم المعروض
 *     - icon    : الأيقونة (lucide-react)
 *     - path    : المسار في الراوتر (مُشتق من VIEW_TO_PATH الموجود)
 *     - module  : الوحدة المنطقية (employee/hr/admin/…)
 *     - roles   : الأدوار المسموح لها برؤية الصفحة (فلترة داخل البوابة)
 *     - group   : مجموعة التصنيف في الـ Sidebar
 *
 *  يُستخدم في:
 *   - HybridSidebar : لبناء قائمة تنقّل تعرض فقط ما خُصّص للشركة (features)
 *                     وما يسمح به دور المستخدم.
 *   - RequirePage   : حارس الصفحات — يحوّل المسار الحالي إلى page-id ويفحص
 *                     الصلاحية (features + الدور) للاشتراك الهجين.
 *
 *  ملاحظة معمارية:
 *   - لا نكرّر مكوّنات الصفحات. البوابة الهجينة تُعيد استخدام نفس صفحات النظام
 *     عبر مساراتها (path) الموجودة في VIEW_TO_PATH.
 *   - إذا لم يُوجد page-id هنا، لا يظهر في البوابة الهجينة (آمن افتراضياً).
 * ═════════════════════════════════════════════════════════════════════════
 */

import {
  LayoutDashboard, FolderKanban, Plus, Clock, CalendarClock, BookOpen, Target, CheckCircle2,
  ScrollText, Bug, Plug, Bot, Heart, ClipboardList, MessageSquare, User, TrendingUp,
  ArrowRightLeft, Receipt, ClipboardCheck, Users, Award, Briefcase, UserPlus,
  FileText, DollarSign, CreditCard, ShieldAlert, HeartPulse, BarChart2,
  BarChart3, FileBarChart, Settings, Building2, Layers, ShieldCheck, Fingerprint,
  Radio, RefreshCw, Server, Shield, Package, Database, Globe, Map as MapIcon, Lightbulb, Truck, type LucideIcon,
  Download,
} from 'lucide-react';
import type { UserRole } from '../../shared/types';
import { VIEW_TO_PATH } from '../../router/legacyRedirect';
import { getModuleForPath } from '../../router/moduleMap';

/** مجموعة تصنيف في الشريط الجانبي للبوابة الهجينة */
export type HybridGroupKey =
  | 'overview' | 'work' | 'growth' | 'personal' | 'finance'
  | 'team' | 'people' | 'operations' | 'admin' | 'tech' | 'other';

export interface HybridGroupMeta {
  key: HybridGroupKey;
  label: string;
  order: number;
}

export const HYBRID_GROUPS: HybridGroupMeta[] = [
  { key: 'overview',   label: 'نظرة عامة',        order: 1 },
  { key: 'work',       label: 'العمل والطلبات',    order: 2 },
  { key: 'people',     label: 'شؤون الموظفين',     order: 3 },
  { key: 'team',       label: 'إدارة الفريق',      order: 4 },
  { key: 'finance',    label: 'المالية والرواتب',  order: 5 },
  { key: 'operations', label: 'العمليات',          order: 6 },
  { key: 'growth',     label: 'التطوير',           order: 7 },
  { key: 'admin',      label: 'الإدارة',           order: 8 },
  { key: 'tech',       label: 'التقنية',           order: 9 },
  { key: 'personal',   label: 'الحساب الشخصي',     order: 10 },
  { key: 'other',      label: 'أخرى',              order: 11 },
];

export interface HybridPageMeta {
  id: string;
  label: string;
  icon: LucideIcon;
  module: string;
  roles: UserRole[];
  group: HybridGroupKey;
  /** المسار الفعلي — يُشتق تلقائياً من VIEW_TO_PATH إن لم يُحدَّد */
  path?: string;
}

/**
 * الكتالوج الكامل. المفتاح = page-id (نفس المخزَّن في tenants.features).
 * roles = من يرى الصفحة داخل البوابة الهجينة (تحقيق "المدير يرى أكثر من الموظف").
 */
const RAW_CATALOG: HybridPageMeta[] = [
  // ─── بوابة الموظف ───────────────────────────────────────────────
  { id: 'employee-dashboard', label: 'الرئيسية',          icon: LayoutDashboard, module: 'employee', group: 'overview', roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-problems',  label: 'البلاغات',           icon: FolderKanban,    module: 'employee', group: 'work',     roles: ['employee', 'supervisor', 'manager'] },
  { id: 'new-problem',        label: 'بلاغ جديد',          icon: Plus,            module: 'employee', group: 'work',     roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-attendance',label: 'سجل الحضور',         icon: Clock,           module: 'employee', group: 'work',     roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-requests',  label: 'طلباتي',             icon: CalendarClock,   module: 'employee', group: 'work',     roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-training',  label: 'التدريب',            icon: BookOpen,        module: 'employee', group: 'growth',   roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-goals',     label: 'أهدافي ومهاراتي',    icon: Target,          module: 'employee', group: 'growth',   roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-sops',      label: 'دليل الإجراءات',      icon: ScrollText,      module: 'employee', group: 'growth',   roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-ai-chat',   label: 'المساعد الذكي',       icon: Bot,             module: 'employee', group: 'growth',   roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-wellness',  label: 'الصحة النفسية',       icon: Heart,           module: 'employee', group: 'personal', roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-survey',    label: 'الاستبيانات',        icon: ClipboardList,   module: 'employee', group: 'personal', roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-contact',   label: 'مركز خدمات HR',      icon: MessageSquare,   module: 'employee', group: 'personal', roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-profile',   label: 'حسابي',              icon: User,            module: 'employee', group: 'personal', roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-payroll',   label: 'رواتبي',             icon: TrendingUp,      module: 'employee', group: 'finance',  roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-loans',     label: 'سلفي',               icon: ArrowRightLeft,  module: 'employee', group: 'finance',  roles: ['employee', 'supervisor', 'manager'] },
  { id: 'employee-expenses',  label: 'نفقاتي',             icon: Receipt,         module: 'employee', group: 'finance',  roles: ['employee', 'supervisor', 'manager'] },

  // ─── بوابة المشرف ───────────────────────────────────────────────
  { id: 'supervisor-dashboard',  label: 'لوحة المشرف',     icon: LayoutDashboard, module: 'supervisor', group: 'team', roles: ['supervisor'] },
  { id: 'supervisor-shift',      label: 'إدارة الوردية',    icon: CalendarClock,   module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  { id: 'supervisor-tasks',      label: 'مهام الفريق',      icon: ClipboardList,   module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  { id: 'supervisor-checklists', label: 'قوائم الفحص',      icon: ClipboardCheck,  module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  // وحدات بوابة المشرف (0307) — الوصول بإسناد الوحدة لا بالدور
  { id: 'supervisor-unit-movement-shift', label: 'وحدة الحركة — حركة الوردية', icon: ArrowRightLeft, module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  { id: 'supervisor-unit-hr-approvals', label: 'وحدة الموارد البشرية — المتابعة', icon: ClipboardCheck, module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  { id: 'supervisor-unit-inventory-approvals', label: 'وحدة المخزون — المتابعة', icon: ClipboardCheck, module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  { id: 'supervisor-unit-mrp-approvals', label: 'وحدة التصنيع — المتابعة', icon: ClipboardCheck, module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  { id: 'supervisor-unit-health-safety-approvals', label: 'وحدة الصحة والسلامة — المتابعة', icon: ClipboardCheck, module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },
  { id: 'supervisor-breaks',     label: 'تصاريح الاستراحة', icon: ArrowRightLeft,  module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },

  // ─── بوابة المدير ───────────────────────────────────────────────
  { id: 'manager-dashboard',   label: 'لوحة المدير',   icon: LayoutDashboard, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-approvals',   label: 'مركز الموافقات', icon: ClipboardCheck,  module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-performance', label: 'أداء الفريق',    icon: TrendingUp,      module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-workload',    label: 'عبء العمل',      icon: BarChart3,       module: 'manager', group: 'team', roles: ['manager'] },
  // وحدات بوابة المدير (0302/0303) — الوصول يُحسم بإسناد الوحدة لا بالدور
  { id: 'manager-unit-movement-approvals', label: 'وحدة الحركة — اعتماد التصاريح', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-movement-team',      label: 'وحدة الحركة — حركة الفريق',    icon: ArrowRightLeft, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-hr-approvals', label: 'وحدة الموارد البشرية — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-finance-approvals', label: 'وحدة المالية — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-procurement-approvals', label: 'وحدة المشتريات — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-inventory-approvals', label: 'وحدة المخزون — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-mrp-approvals', label: 'وحدة التصنيع — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-contracts-approvals', label: 'وحدة العقود — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-crm-approvals', label: 'وحدة المبيعات — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-unit-health-safety-approvals', label: 'وحدة الصحة والسلامة — الاعتماد', icon: ClipboardCheck, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-attendance',  label: 'حضور الفريق',    icon: Users,           module: 'manager', group: 'team', roles: ['manager'] },

  // ─── بوابة الموارد البشرية (HR) ─────────────────────────────────
  { id: 'hr-dashboard',         label: 'لوحة HR',            icon: LayoutDashboard, module: 'hr', group: 'overview',   roles: ['hr', 'admin', 'manager'] },
  { id: 'hr-problems',          label: 'بلاغات HR',           icon: FolderKanban,    module: 'hr', group: 'operations', roles: ['hr', 'admin'] },
  { id: 'hr-attendance',        label: 'سجلات الحضور',        icon: Clock,           module: 'hr', group: 'people',     roles: ['hr', 'admin', 'manager'] },
  { id: 'hr-leave-requests',    label: 'طلبات الإجازات',      icon: CalendarClock,   module: 'hr', group: 'people',     roles: ['hr', 'admin', 'manager'] },
  { id: 'hr-movement-analysis', label: 'تحليل الحركة',        icon: TrendingUp,      module: 'hr', group: 'operations', roles: ['hr', 'admin'] },
  { id: 'hr-team',              label: 'إدارة الموظفين',       icon: Users,           module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-talent-market',     label: 'سجل المؤهلات',        icon: Award,           module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-recruitment',       label: 'التوظيف',             icon: Briefcase,       module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-onboarding',        label: 'التعريف وإنهاء الخدمة', icon: UserPlus,      module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-documents',         label: 'مستندات الموظفين',     icon: FileText,        module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-contracts',         label: 'عقود الموظفين',        icon: FileText,        module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-communication',     label: 'صندوق الرسائل',        icon: MessageSquare,   module: 'hr', group: 'operations', roles: ['hr', 'admin'] },
  { id: 'hr-service-center',    label: 'مركز خدمات HR',       icon: ClipboardCheck,  module: 'hr', group: 'operations', roles: ['hr', 'admin'] },
  { id: 'hr-payroll',           label: 'الرواتب',             icon: DollarSign,      module: 'hr', group: 'finance',    roles: ['hr', 'admin'] },
  { id: 'hr-loans',             label: 'السلف والقروض',        icon: CreditCard,      module: 'hr', group: 'finance',    roles: ['hr', 'admin'] },
  { id: 'hr-bonuses',           label: 'الجوائز والمكافآت',     icon: Award,           module: 'hr', group: 'finance',    roles: ['hr', 'admin'] },
  { id: 'hr-expenses',          label: 'طلبات النفقات',        icon: Receipt,         module: 'hr', group: 'finance',    roles: ['hr', 'admin'] },
  { id: 'hr-performance',       label: 'تقييم الأداء',         icon: TrendingUp,      module: 'hr', group: 'people',     roles: ['hr', 'admin', 'manager'] },
  { id: 'hr-succession',        label: 'تخطيط التعاقب',        icon: Award,           module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-disciplinary',      label: 'الإجراءات التأديبية',   icon: ShieldAlert,     module: 'hr', group: 'people',     roles: ['hr', 'admin'] },
  { id: 'hr-shifts',            label: 'جدولة الورديات',       icon: CalendarClock,   module: 'hr', group: 'operations', roles: ['hr', 'admin', 'manager'] },
  { id: 'hr-health-safety',     label: 'الصحة والسلامة',       icon: HeartPulse,      module: 'hr', group: 'operations', roles: ['hr', 'admin'] },
  { id: 'hr-manage-training',   label: 'إدارة التدريب',        icon: BookOpen,        module: 'hr', group: 'growth',    roles: ['hr', 'admin'] },
  { id: 'hr-training-reports',  label: 'تقارير التدريب',       icon: BookOpen,        module: 'hr', group: 'growth',    roles: ['hr', 'admin'] },
  { id: 'hr-sops',              label: 'إدارة SOP',           icon: ScrollText,      module: 'hr', group: 'operations', roles: ['hr', 'admin'] },
  { id: 'hr-analytics',         label: 'التحليلات',           icon: BarChart2,       module: 'hr', group: 'operations', roles: ['hr', 'admin', 'manager'] },
  // ★★★ 0370: `manager` رُفع. `current_user_is_staff()` = admin·hr·developer·it_admin
  //   ولا تشمل manager ⇒ كان المدير يضغط «تحميل» فينزل ملفٌّ بترويسةٍ
  //   بلا صفوف ثمّ يقرأ «✅ تم بنجاح» (PROBE_7: incidents=0 · wellness=0).
  //   حقٌّ لا يُمارَس ليس حقاً، والصمت أخطر من المنع.
  { id: 'hr-reports',           label: 'التقارير',            icon: FileBarChart,    module: 'hr', group: 'operations', roles: ['hr', 'admin'] },

  // ─── بوابة الإدارة (Admin) ──────────────────────────────────────
  { id: 'admin-dashboard',       label: 'لوحة الإدارة',       icon: LayoutDashboard, module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-employees',       label: 'إدارة المستخدمين',    icon: Users,           module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-settings',        label: 'إعدادات النظام',      icon: Settings,        module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-company-profile', label: 'ملف الشركة',         icon: Building2,       module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-branches',        label: 'الفروع',             icon: Building2,       module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-org-structure',   label: 'الهيكل التنظيمي',     icon: Layers,          module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-compliance',      label: 'مركز الامتثال',       icon: ShieldCheck,     module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-ai-config',       label: 'إعدادات AI',         icon: Bot,             module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-approval-rules', label: 'قواعد الاعتماد', icon: ShieldCheck, module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-mrp-roles', label: 'أدوار التصنيع الدقيقة', icon: ShieldCheck, module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-reports',         label: 'تقارير النظام',       icon: FileBarChart,    module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-sops-reports',    label: 'تقارير SOP',         icon: ScrollText,      module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-audit-log',       label: 'سجل العمليات',        icon: ShieldCheck,     module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-permissions',     label: 'الصلاحيات',          icon: ShieldCheck,     module: 'admin', group: 'admin', roles: ['admin'] },

  // ─── بوابة الأمن والحراسة (Gatekeeper) ──────────────────────────
  { id: 'gatekeeper-portal',    label: 'تسجيل الدخول والخروج', icon: Fingerprint,    module: 'gatekeeper', group: 'operations', roles: ['gatekeeper', 'admin'] },
  { id: 'gatekeeper-movements', label: 'بوابة الحركة',        icon: ArrowRightLeft,  module: 'gatekeeper', group: 'operations', roles: ['gatekeeper', 'admin'] },
  // ── بوابة الحركة واللوجستيات — الدور «أ»: حركة الموظفين ──
  { id: 'movement-emp-foundation', label: 'الأساس والسياسات', icon: ArrowRightLeft, module: 'movement', group: 'operations', roles: ['employee_movement', 'movement_manager', 'admin', 'hr'] },
  { id: 'movement-emp-permits', label: 'تصاريح الخروج', icon: ArrowRightLeft, module: 'movement', group: 'operations', roles: ['employee_movement', 'movement_manager', 'admin', 'hr'] },
  { id: 'movement-emp-execution', label: 'تنفيذ البوابة', icon: ArrowRightLeft, module: 'movement', group: 'operations', roles: ['employee_movement', 'movement_manager', 'admin', 'hr'] },
  { id: 'movement-emp-visits', label: 'الزيارات الميدانية', icon: ArrowRightLeft, module: 'movement', group: 'operations', roles: ['employee_movement', 'movement_manager', 'admin', 'hr'] },
  { id: 'movement-emp-missions', label: 'المهام والانتدابات', icon: ArrowRightLeft, module: 'movement', group: 'operations', roles: ['employee_movement', 'movement_manager', 'admin', 'hr'] },
  { id: 'movement-emp-compliance', label: 'الامتثال والمخالفات', icon: ArrowRightLeft, module: 'movement', group: 'operations', roles: ['employee_movement', 'movement_manager', 'admin', 'hr'] },
  { id: 'movement-emp-analytics', label: 'تحليلات الحركة', icon: ArrowRightLeft, module: 'movement', group: 'operations', roles: ['employee_movement', 'movement_manager', 'admin', 'hr'] },
  // ── الدور «ب»: الحركة واللوجستيات ──
  { id: 'movement-log-dashboard', label: 'برج المراقبة', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-fleet', label: 'الأسطول والمركبات', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-drivers', label: 'السائقون والامتثال', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-maintenance', label: 'الصيانة والإصلاح', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-fuel', label: 'الوقود والطاقة', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-orders', label: 'أوامر النقل والشحنات', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-routes', label: 'تخطيط المسارات', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-dispatch', label: 'الإرسال والتنفيذ', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-tracking', label: 'التتبع الحي', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-track-replay', label: 'إعادة تشغيل المسار', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-safety', label: 'امتثال السلامة HOS/DVIR', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  // تطبيق السائق: الوصول يُحسم بسجل logistics_drivers لا بالدور (RequireDriver + 0301).
  // نُبقي 'employee' لأن السائق الموظف دوره غالباً employee، لكن الحارس
  // يفلتر من ليس سائقاً فعلياً — فلا يُعرض وعد تكسره الصفحة.
  { id: 'movement-driver-trips', label: 'تطبيق السائق — رحلاتي', icon: Truck, module: 'movement', group: 'operations', roles: ['employee', 'logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-epod', label: 'التسليم وإثباته', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-carriers', label: 'الناقلون والتعاقد', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },
  { id: 'movement-log-costs', label: 'التكاليف والتحليلات', icon: Truck, module: 'movement', group: 'operations', roles: ['logistics', 'movement_manager', 'admin'] },

  { id: 'kiosk-mode',           label: 'محطة التسجيل الذاتي',   icon: Radio,          module: 'gatekeeper', group: 'operations', roles: ['gatekeeper', 'admin'] },

  // ─── البوابة التقنية (IT) ───────────────────────────────────────
  { id: 'tech-dashboard',       label: 'لوحة التحكم التقنية',  icon: LayoutDashboard, module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'biometric-devices',    label: 'إدارة أجهزة البصمة',   icon: Fingerprint,     module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'sync-logs',            label: 'سجل المزامنة',        icon: RefreshCw,       module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'attendance-analytics', label: 'تحليلات الحضور',       icon: BarChart3,       module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'system-health',        label: 'صحة النظام',          icon: Server,          module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'security-events',      label: 'الأحداث الأمنية',      icon: Shield,          module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'tech-audit-trail',     label: 'سجل التدقيق الموحّد',  icon: ScrollText,      module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'tech-error-logs',      label: 'الأخطاء والمهام',      icon: Bug,             module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'tech-integrations',    label: 'التكاملات والصادرات',  icon: Plug,            module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'tech-data-exports',    label: 'الصادرات والناقلون',   icon: Download,        module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'tech-settings',        label: 'الإعدادات التقنية',    icon: Settings,        module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },

  // ─── بوابة المشتريات ───────────────────────────────────────────
  // الوحدات الرئيسية (تظهر في الشريط الجانبي)
  { id: 'procurement-dashboard',      label: 'لوحة المشتريات',      icon: LayoutDashboard, module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-foundation',     label: 'الأساس والتحكم',       icon: Settings,        module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-pr',             label: 'طلبات الشراء',         icon: ClipboardList,   module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-suppliers',      label: 'الموردون',             icon: Users,           module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-sourcing',       label: 'المناقصات والعروض',    icon: TrendingUp,      module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-orders',         label: 'أوامر الشراء',         icon: Package,         module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-invoices',       label: 'فواتير المشتريات',     icon: Receipt,         module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-contracts',      label: 'العقود',               icon: FileText,        module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-analytics',      label: 'تحليلات المشتريات',    icon: BarChart2,       module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  // صفحات فرعية (تُفتح من داخل الوحدات عبر ProcurementUnitNav)
  { id: 'procurement-gr',             label: 'استلام البضائع',       icon: ClipboardCheck,  module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-categories',     label: 'فئات الإنفاق',         icon: Layers,          module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-approval-rules', label: 'قواعد الموافقة',       icon: ShieldCheck,     module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-policies',       label: 'سياسات المشتريات',     icon: FileText,        module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-audit',          label: 'سجل تدقيق المشتريات',  icon: ClipboardList,   module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },
  { id: 'procurement-integration',    label: 'صحة التكامل',          icon: RefreshCw,       module: 'procurement', group: 'operations', roles: ['procurement', 'admin'] },

  // ─── البوابة المالية ───────────────────────────────────────────
  // الوحدات الرئيسية (تظهر في الشريط الجانبي)
  { id: 'finance-dashboard',          label: 'لوحة المالية',            icon: LayoutDashboard, module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-foundation',         label: 'الأساس المالي',           icon: Building2,       module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-coa',                label: 'دليل الحسابات',           icon: BookOpen,        module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-journal',            label: 'القيود والدفتر العام',     icon: ClipboardList,   module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-periods',            label: 'الفترات والإغلاق',        icon: Clock,           module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-payable',            label: 'الذمم الدائنة',           icon: Receipt,         module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-receivable',         label: 'الذمم المدينة والتحصيل',   icon: CreditCard,      module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-cash',               label: 'النقد والبنوك',           icon: DollarSign,      module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-tax',                label: 'الضرائب والتقديم',        icon: FileText,        module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-budget',             label: 'الموازنات والتنبؤات',      icon: BarChart3,       module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-fixed-assets',       label: 'الأصول الثابتة',          icon: Package,         module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-revenue',            label: 'الاعتراف بالإيرادات',      icon: TrendingUp,      module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-intercompany',       label: 'المعاملات البينية والتوحيد', icon: ArrowRightLeft, module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-project-accounting', label: 'محاسبة المشاريع',         icon: FolderKanban,    module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-reports',            label: 'التقارير والتحليلات',      icon: FileBarChart,    module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-integrations',       label: 'التكاملات المالية',        icon: Layers,          module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  // صفحات فرعية (تُفتح من داخل الوحدات عبر FinanceUnitNav)
  { id: 'finance-setup',              label: 'إعداد المالية',           icon: Settings,        module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-multi-entity',       label: 'الكيانات المتعددة',        icon: Building2,       module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-entity-memberships', label: 'عضويات الكيان',           icon: ShieldCheck,     module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-cost-centers',       label: 'مراكز التكلفة',           icon: Layers,          module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-projects',           label: 'المشاريع',                icon: FolderKanban,    module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-exchange-rates',     label: 'أسعار الصرف',             icon: RefreshCw,       module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-trial-balance',      label: 'ميزان المراجعة',          icon: BarChart2,       module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-ledger',             label: 'دفتر الأستاذ',            icon: ScrollText,      module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-vendors',            label: 'الموردين',                icon: Users,           module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-bank-import',        label: 'استيراد كشوف البنك',      icon: FileText,        module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-forecast',           label: 'التنبؤ النقدي',           icon: TrendingUp,      module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-budget-variance',    label: 'تحليل التباين',           icon: BarChart2,       module: 'finance', group: 'finance', roles: ['finance', 'admin'] },
  { id: 'finance-system-notes',       label: 'التدقيق المالي',          icon: ShieldCheck,     module: 'finance', group: 'finance', roles: ['finance', 'admin'] },

  // ─── بوابة المخزون والمستودعات ─────────────────────────────────
  { id: 'inventory-dashboard',  label: 'لوحة المخزون',        icon: LayoutDashboard, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-foundation', label: 'الأساس التقني',        icon: Database,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-items',      label: 'الأصناف والمواد',      icon: Package,         module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-warehouses', label: 'المستودعات والمواقع',  icon: Building2,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-stock',      label: 'الأرصدة الحالية',      icon: Database,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-movements',  label: 'الكارت المخزني',       icon: RefreshCw,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-numbering',  label: 'الترميز والباركود',     icon: FileText,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-receiving',  label: 'الاستلام',             icon: ClipboardCheck,  module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-asn',        label: 'ASN',                  icon: FileText,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-dock-schedule', label: 'جدولة الأرصفة',      icon: CalendarClock,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-receiving-sessions', label: 'جلسات الاستلام', icon: ClipboardList, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-osd',        label: 'OS&D',                 icon: ShieldAlert,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-quarantine', label: 'الحجر الصحي',          icon: ShieldCheck,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-mobile-scan', label: 'المسح المحمول',        icon: Radio,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-lpn-labels', label: 'ملصقات LPN',           icon: FileText,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-receiving-reports', label: 'تقارير الاستلام', icon: FileBarChart, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-storage',    label: 'التخزين و Slotting',   icon: Layers,          module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-location-map', label: 'خريطة المواقع',       icon: Database,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-visual-map', label: 'الخريطة التفاعلية',      icon: Globe,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-storage-heatmap', label: 'Heatmap النشاط',   icon: BarChart3,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-slotting',   label: 'محرك Slotting',        icon: Layers,          module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-abc',        label: 'ABC Classification',   icon: BarChart2,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-replenishment', label: 'إدارة التجديد',     icon: RefreshCw,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-capacity',   label: 'السعة والمساحة',       icon: Building2,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-slow-moving', label: 'المخزون الراكد',      icon: Clock,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-location-labels', label: 'تسمية الخانات',   icon: FileText,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-affinity',   label: 'Affinity Slotting',    icon: Target,          module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-seasonal-slotting', label: 'Seasonal Slotting', icon: CalendarClock, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-task-interleaving', label: 'Task Interleaving', icon: ArrowRightLeft, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-slow-moving-reports', label: 'تقارير الراكد', icon: FileBarChart, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-picking',    label: 'السحب والتنفيذ',       icon: Target,          module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-orders', label: 'أوامر السحب',          icon: ClipboardList,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-tasks', label: 'مهام السحب',            icon: CheckCircle2,    module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-waves', label: 'موجات السحب',           icon: CalendarClock,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-exceptions', label: 'استثناءات السحب',  icon: ShieldAlert,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-scans', label: 'Scan-to-Confirm',       icon: Radio,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-picking-productivity', label: 'إنتاجية السحب', icon: BarChart3,    module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-picking-kpis', label: 'KPIs السحب',           icon: BarChart2,      module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-route-map', label: 'خريطة مسار السحب',   icon: MapIcon,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-voice-picking', label: 'Voice Picking',       icon: Radio,          module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-to-light', label: 'Pick-to-Light',       icon: Lightbulb,      module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-rfid-picking', label: 'RFID Picking',         icon: Radio,          module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-pick-sorting', label: 'Batch/Cluster Sorting', icon: Layers,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-zone-handoffs', label: 'Zone Handoffs',       icon: ArrowRightLeft, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-shipping',   label: 'الشحن',                icon: ArrowRightLeft,  module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-shipping-packages', label: 'التعبئة والطرود', icon: Package,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-shipments',  label: 'الشحنات',              icon: Truck,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-carriers',   label: 'شركات الشحن',          icon: Briefcase,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-shipping-documents', label: 'وثائق الشحن',  icon: FileText,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-manifests',  label: 'Manifest والتحميل',    icon: ClipboardList,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-manifest-completion', label: 'اكتمال Manifest', icon: CheckCircle2, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-rate-quotes', label: 'Rate Shopping',        icon: DollarSign,      module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-rate-rules', label: 'قواعد اختيار الناقل',   icon: Settings,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-shipment-tracking', label: 'تتبع الشحنات',  icon: Globe,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-carrier-webhooks', label: 'Carrier Webhooks', icon: Server,         module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-shipping-kpis', label: 'KPIs الشحن',        icon: BarChart2,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-counting',   label: 'الجرد',                icon: ShieldCheck,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-count-plans', label: 'خطط الجرد',            icon: CalendarClock,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-count-tasks', label: 'مهام العد',            icon: ClipboardList,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-count-variances', label: 'فروق الجرد',       icon: ShieldAlert,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-adjustment-approvals', label: 'اعتماد التسويات', icon: CheckCircle2, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-count-completion', label: 'اكتمال الجرد',    icon: BarChart2,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-expiry-count-report', label: 'تقرير الصلاحية', icon: Clock,         module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-mobile-count', label: 'واجهة العد المحمولة', icon: Radio,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-recount',    label: 'العد الثاني/الثالث',   icon: RefreshCw,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-count-freeze', label: 'تجميد الجرد',        icon: ShieldAlert,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-annual-count', label: 'الجرد السنوي',       icon: CalendarClock,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-returns',    label: 'المرتجعات',            icon: RefreshCw,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-rma',        label: 'إدارة RMA',            icon: FileText,        module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-receiving', label: 'استلام المرتجعات', icon: ClipboardCheck, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-grading', label: 'تقييم A/B/C/D',     icon: ShieldCheck,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-disposition', label: 'مسارات Disposition', icon: ArrowRightLeft, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-production-returns', label: 'مرتجعات الإنتاج', icon: Building2,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-rtv', label: 'RTV للموردين',          icon: Truck,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-notifications', label: 'إشعارات المرتجعات', icon: MessageSquare, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-supplier-rtv-reports', label: 'تقارير RTV',  icon: FileBarChart,    module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-analytics', label: 'تحليلات المرتجعات', icon: BarChart2,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-quality', label: 'جودة المرتجعات',    icon: ShieldAlert,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-value-recovery', label: 'استرداد القيمة', icon: DollarSign,  module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-return-capa', label: 'CAPA المرتجعات',       icon: CheckCircle2,    module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor',      label: 'العمالة والإنتاجية',   icon: Users,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-standards', label: 'معايير الإنتاجية', icon: ClipboardList,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-workforce-planning', label: 'تخطيط العمالة', icon: CalendarClock,   module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-worker-availability', label: 'توفر العمال', icon: Users,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-dispatch', label: 'التوزيع الذكي',    icon: Target,          module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-interleaving', label: 'Task Interleaving', icon: ArrowRightLeft, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-time-tracking', label: 'تتبع الوقت',  icon: Clock,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-employee-performance', label: 'أداء الموظف', icon: BarChart3,      module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-manager-dashboard', label: 'لوحة المدير', icon: LayoutDashboard, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-non-productive-time', label: 'الوقت غير المنتج', icon: ShieldAlert, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-skills-training', label: 'المهارات والتدريب', icon: Award,         module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-incentives', label: 'الحوافز',        icon: DollarSign,      module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-reports', label: 'تقارير الإنتاجية',  icon: FileBarChart,    module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-safety-kpis', label: 'سلامة وKPIs',   icon: ShieldCheck,     module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-labor-leaderboard', label: 'ترتيب الوردية', icon: Award,           module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-analytics',  label: 'تحليلات المستودع',     icon: BarChart2,       module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-analytics-executive', label: 'لوحة تنفيذية', icon: LayoutDashboard, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-analytics-operations', label: 'لوحة مدير المستودع', icon: ClipboardList, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-analytics-supervisor', label: 'لوحة مشرف الوردية', icon: Users, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-kpi-scorecard', label: 'KPI Scorecard', icon: BarChart3, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-kpi-trends', label: 'اتجاهات KPI', icon: TrendingUp, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-analytics-heatmap', label: 'Heatmap التحليلي', icon: MapIcon, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-seasonal-patterns', label: 'الأنماط الموسمية', icon: CalendarClock, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-root-cause', label: 'Root Cause', icon: ShieldAlert, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-predictive-alerts', label: 'تنبيهات استباقية', icon: Shield, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-periodic-reports', label: 'تقارير دورية', icon: FileBarChart, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-report-exports', label: 'تصدير التقارير', icon: FileText, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-operating-costs', label: 'تكاليف التشغيل', icon: DollarSign, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },
  { id: 'inventory-kpi-targets', label: 'أهداف KPI', icon: Target, module: 'inventory', group: 'operations', roles: ['inventory', 'admin'] },

  // ─── بوابة التصنيع MRP ────────────────────────────────────────
  { id: 'mrp-dashboard', label: 'لوحة التصنيع', icon: LayoutDashboard, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-foundation', label: 'الأساس التقني للتصنيع', icon: Building2, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },

  { id: 'mrp-bom', label: 'BOM والتغييرات الهندسية', icon: Layers, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-bom-builder', label: 'منشئ BOM', icon: Layers, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-bom-headers', label: 'BOM Headers', icon: FileText, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-bom-versions', label: 'BOM Versions', icon: FileText, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-bom-explosion', label: 'BOM Explosion', icon: ArrowRightLeft, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-bom-availability', label: 'Availability Check', icon: ShieldCheck, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-ecr', label: 'ECR', icon: ClipboardList, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-eco', label: 'ECO', icon: ClipboardCheck, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },

  { id: 'mrp-forecasting', label: 'التنبؤ بالطلب', icon: TrendingUp, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-demand-history', label: 'تاريخ الطلب', icon: Clock, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-forecast-models', label: 'نماذج التنبؤ', icon: BarChart2, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-forecast-runs', label: 'تشغيلات التنبؤ', icon: RefreshCw, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-forecast-accuracy', label: 'دقة التنبؤ', icon: Target, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-mps', label: 'MPS', icon: CalendarClock, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-mps-board', label: 'لوحة MPS', icon: LayoutDashboard, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-rccp', label: 'RCCP', icon: BarChart3, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-mps-alerts', label: 'تنبيهات MPS', icon: ShieldAlert, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },


  { id: 'mrp-plants', label: 'المصانع', icon: Building2, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-work-centers', label: 'مراكز العمل', icon: Settings, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-operations', label: 'العمليات', icon: ClipboardList, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-routings', label: 'Routing', icon: ArrowRightLeft, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-capacity', label: 'الطاقة', icon: BarChart3, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-integrations', label: 'التكاملات', icon: Server, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },

  { id: 'mrp-shopfloor', label: 'أرضية المصنع MES/SFC', icon: Radio, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-workstations', label: 'محطات العمل الرقمية', icon: Radio, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-terminals', label: 'جلسات الطرفيات', icon: Clock, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-tracking', label: 'تتبع الإنتاج اللحظي', icon: RefreshCw, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-consumption', label: 'الاستهلاك الفعلي', icon: Package, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-oee', label: 'OEE', icon: BarChart3, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-downtime', label: 'إدارة التوقفات', icon: ShieldAlert, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-pareto', label: 'Downtime Pareto', icon: BarChart2, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-progress', label: 'تقدم أوامر العمل', icon: ClipboardCheck, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-labor', label: 'العمالة والورديات', icon: Users, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-andon', label: 'Andon الرقمي', icon: ShieldAlert, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-supervisor', label: 'لوحة المشرف', icon: LayoutDashboard, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-manager', label: 'لوحة مدير الإنتاج', icon: FileBarChart, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-maintenance', label: 'جسر الصيانة', icon: Settings, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-shopfloor-reports', label: 'تقارير أرضية المصنع', icon: FileText, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },

  { id: 'mrp-maintenance', label: 'الصيانة CMMS', icon: Settings, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-assets', label: 'سجل الأصول', icon: Database, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-criticality', label: 'تصنيف الأهمية', icon: ShieldAlert, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-pm-plans', label: 'خطط PM', icon: CalendarClock, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-pm-calendar', label: 'تقويم الصيانة', icon: CalendarClock, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-work-orders', label: 'أوامر الصيانة', icon: ClipboardCheck, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-spare-parts', label: 'قطع الغيار', icon: Package, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-condition', label: 'قراءات الحالة', icon: BarChart3, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-breakdowns', label: 'بلاغات الأعطال', icon: ShieldAlert, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-shutdowns', label: 'التوقف السنوي', icon: Clock, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-maintenance-reports', label: 'تقارير الصيانة', icon: FileText, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },

  { id: 'mrp-costing', label: 'تكاليف التصنيع', icon: DollarSign, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-cost-elements', label: 'عناصر التكلفة', icon: DollarSign, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-costing-profiles', label: 'Costing Profiles', icon: Settings, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-standard-costs', label: 'التكاليف القياسية', icon: FileText, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-cost-rollup', label: 'BOM/Routing Cost Rollup', icon: RefreshCw, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-work-order-costs', label: 'تكلفة أوامر العمل', icon: ClipboardCheck, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-cost-variances', label: 'فروقات التكلفة', icon: BarChart2, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-wip-valuation', label: 'تقييم WIP', icon: Package, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-fg-valuation', label: 'تقييم Finished Goods', icon: Package, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-cost-postings', label: 'قيود التكلفة المسودة', icon: Receipt, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-costing-reports', label: 'تقارير تكلفة التصنيع', icon: FileBarChart, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },

  { id: 'mrp-analytics', label: 'تحليلات التصنيع', icon: BarChart3, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-executive', label: 'لوحة تنفيذية', icon: LayoutDashboard, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-operations', label: 'لوحة تشغيلية', icon: LayoutDashboard, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-scorecard', label: 'KPI Scorecard', icon: Target, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-oee', label: 'OEE Trends', icon: BarChart3, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-schedule', label: 'Schedule Attainment', icon: CalendarClock, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-bottlenecks', label: 'Bottlenecks', icon: ShieldAlert, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-quality-cost', label: 'Quality Cost', icon: ShieldCheck, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-cost-variance', label: 'Cost Variance', icon: DollarSign, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-maintenance', label: 'Maintenance Reliability', icon: Settings, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-alerts', label: 'Analytics Alerts', icon: ShieldAlert, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-root-cause', label: 'Root Cause', icon: ClipboardList, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-reports', label: 'Analytics Reports', icon: FileBarChart, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-exports', label: 'Exports', icon: FileText, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },
  { id: 'mrp-analytics-kpi-targets', label: 'KPI Targets', icon: Target, module: 'mrp', group: 'operations', roles: ['manufacturing', 'admin'] },

];

/**
 * الصفحات الأساسية المتاحة دائماً لكل مستخدم في البوابة الهجينة
 * (بغض النظر عن features) — الملف الشخصي.
 *
 * ملاحظة: "الإشعارات" لا تُدرَج هنا لأنها تُعرَض بتصميم خاص في الـ footer
 * (مع عدّاد unreadCount)؛ إدراجها هنا كان يُظهرها مرتين.
 */
const ALL_ROLES: UserRole[] = ['employee','supervisor','manager','hr','admin','gatekeeper','it_admin','tech','finance','marketing','sales','procurement','inventory','manufacturing'];
export const HYBRID_ALWAYS_ON: HybridPageMeta[] = [
  { id: 'employee-problems', label: 'البلاغات', icon: FolderKanban, module: 'employee', group: 'work',     roles: ALL_ROLES },
  { id: 'employee-profile',  label: 'حسابي',    icon: User,         module: 'employee', group: 'personal', roles: ALL_ROLES },

];

/** الكتالوج النهائي مع حقن المسار (path) تلقائياً من VIEW_TO_PATH */
// دمج الكتالوج الأساسي مع الصفحات الدائمة، مع إزالة التكرار حسب id
// (الأولوية للنسخة الدائمة ALWAYS_ON لأنها بأدوار أوسع).
export const HYBRID_CATALOG: HybridPageMeta[] = (() => {
  const byId = new Map<string, HybridPageMeta>();
  for (const p of RAW_CATALOG) byId.set(p.id, p);
  for (const p of HYBRID_ALWAYS_ON) byId.set(p.id, p); // يتجاوز أي تكرار
  return [...byId.values()].map((p) => ({
    ...p,
    path: p.path ?? VIEW_TO_PATH[p.id] ?? '',
  }));
})();

/** خريطة سريعة id → meta */
export const HYBRID_CATALOG_MAP: Record<string, HybridPageMeta> =
  Object.fromEntries(HYBRID_CATALOG.map((p) => [p.id, p]));

/** بادئة page-id → الوحدة العامة (مطابقة لـ getModuleForPage في useTenantModules) */
function moduleByPrefix(pageId: string): string {
  if (pageId.startsWith('employee-') || pageId === 'new-problem') return 'employee';
  if (pageId.startsWith('hr-')) return 'hr';
  if (pageId.startsWith('admin-')) return 'admin';
  if (pageId.startsWith('supervisor-')) return 'supervisor';
  if (pageId.startsWith('manager-')) return 'manager';
  if (pageId.startsWith('gatekeeper-') || pageId === 'kiosk-mode') return 'gatekeeper';
  if (
    pageId === 'tech-portal' || pageId.startsWith('tech-') ||
    ['biometric-devices', 'sync-logs', 'attendance-analytics', 'system-health', 'security-events', 'tech-audit-trail', 'tech-error-logs', 'tech-integrations', 'tech-data-exports'].includes(pageId)
  ) return 'tech_portal';
  if (pageId.startsWith('finance-')) return 'finance';
  if (pageId.startsWith('tawathul-')) return 'tawathul';
  if (pageId.startsWith('inventory-')) return 'inventory';
  if (pageId.startsWith('mrp-')) return 'mrp';
  return '';
}

/**
 * الوحدات التي يجب تفعيلها لشركة هجينة بناءً على صفحاتها (features).
 * تدمج: الوحدة العامة (بادئة) + الوحدة الدقيقة (من مسار الصفحة عبر moduleMap)
 * + employee و tawathul الدائمتين. هذا هو نفس منطق useTenantModules — مُصدَّر
 * هنا ليكون قابلاً للاختبار ولضمان تطابقه مع ما يفحصه RequireModule.
 */
export function hybridEnabledModulesForFeatures(features: string[]): string[] {
  const byPrefix = (features || []).map(moduleByPrefix).filter(Boolean);
  const byPath = (features || [])
    .map((id) => VIEW_TO_PATH[id])
    .filter(Boolean)
    .map((path) => getModuleForPath(path)?.moduleKey)
    .filter(Boolean) as string[];
  return [...new Set([...byPrefix, ...byPath, 'employee', 'tawathul'])];
}

/**
 * خريطة عكسية: path → page-id.
 * تُستخدم في RequirePage لتحويل المسار الحالي إلى page-id لفحص الصلاحية.
 * تُرتّب المسارات الأطول أولاً لضمان أدق مطابقة.
 */
const PATH_TO_PAGE_ENTRIES = HYBRID_CATALOG
  .filter((p) => !!p.path)
  .map((p) => [p.path as string, p] as const)
  .sort((a, b) => b[0].length - a[0].length);

/**
 * يجد page-id (meta) المطابق لمسار معيّن (تطابق تام أو بادئة مسار فرعي).
 * مثال: /app/hr/payroll/123 → hr-payroll
 */
export function resolvePageForPath(pathname: string): HybridPageMeta | null {
  const hit = PATH_TO_PAGE_ENTRIES.find(
    ([path]) => pathname === path || pathname.startsWith(path + '/'),
  );
  return hit ? hit[1] : null;
}

/**
 * مسارات أساسية مسموحة دائماً لأي مستخدم هجين (لا تُدرَج في الكتالوج/الشريط
 * الجانبي، لكنها متاحة عبر الـ Header/footer): الإشعارات والحساب والفوترة.
 */
export const HYBRID_ALWAYS_ALLOWED_PATHS: string[] = [
  '/app/notifications',
  '/app/my-notifications',
  '/app/employee/profile',
  '/app/employee/problems',
  '/billing',

];

/**
 * يتحقّق هل يُسمح لمستخدم (بدوره) بالوصول لمسار معيّن ضمن الاشتراك الهجين.
 * القاعدة: page-id موجود في features + دور المستخدم مسموح له.
 * الصفحات الأساسية الدائمة (always-on) والمسارات الأساسية مسموحة دائماً.
 */
export function isPathAllowedForHybrid(
  pathname: string,
  featurePages: string[],
  role: UserRole | null | undefined,
): { allowed: boolean; reason?: 'unknown' | 'not-in-features' | 'role-denied'; page?: HybridPageMeta } {
  // مسارات أساسية دائمة (إشعارات/حساب/فوترة) — مسموحة بلا شروط
  if (HYBRID_ALWAYS_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return { allowed: true };
  }

  const page = resolvePageForPath(pathname);
  if (!page) return { allowed: false, reason: 'unknown' };

  const alwaysOnIds = new Set(HYBRID_ALWAYS_ON.map((p) => p.id));
  const inFeatures = new Set(featurePages || []).has(page.id) || alwaysOnIds.has(page.id);
  if (!inFeatures) return { allowed: false, reason: 'not-in-features', page };

  if (!role || !page.roles.includes(role)) {
    return { allowed: false, reason: 'role-denied', page };
  }
  return { allowed: true, page };
}

/**
 * يبني قائمة صفحات البوابة الهجينة لمستخدم معيّن:
 *   featurePages ∩ (roles تسمح للمستخدم) + الصفحات الأساسية الدائمة.
 *
 * @param featurePages الصفحات المخصّصة للشركة (tenants.features)
 * @param role         دور المستخدم الحالي
 */
export function buildHybridPagesForUser(
  featurePages: string[],
  role: UserRole | null | undefined,
): HybridPageMeta[] {
  const featureSet = new Set(featurePages || []);
  const alwaysOnIds = new Set(HYBRID_ALWAYS_ON.map((p) => p.id));

  return HYBRID_CATALOG.filter((page) => {
    // الصفحة إمّا مخصّصة للشركة، أو أساسية دائمة
    const included = featureSet.has(page.id) || alwaysOnIds.has(page.id);
    if (!included) return false;
    // فلترة حسب الدور: الصفحة تظهر فقط لمن يسمح دوره
    if (!role) return false;
    return page.roles.includes(role);
  }).filter((p) => !!p.path); // استبعاد ما لا مسار له (أمان)
}

/** يجمّع الصفحات في مجموعات مرتّبة للعرض في الـ Sidebar */
export function groupHybridPages(pages: HybridPageMeta[]): { group: HybridGroupMeta; pages: HybridPageMeta[] }[] {
  const byGroup = new Map<HybridGroupKey, HybridPageMeta[]>();
  for (const p of pages) {
    const arr = byGroup.get(p.group) ?? [];
    arr.push(p);
    byGroup.set(p.group, arr);
  }
  return HYBRID_GROUPS
    .filter((g) => byGroup.has(g.key))
    .map((g) => ({ group: g, pages: byGroup.get(g.key)! }));
}

/**
 * يُرجع مسار أول صفحة متاحة لمستخدم هجين (للتوجيه بعد الدخول).
 * الأولوية للصفحات المخصّصة الحقيقية قبل الأساسية (الحساب/الإشعارات)،
 * حتى لا يهبط المستخدم دائماً على "الإشعارات".
 * يُرجع null إن لم تتوفّر أي صفحة (نتركها للمُستدعي ليقرّر الرجوع).
 */
export function getHybridLandingPath(
  featurePages: string[],
  role: UserRole | null | undefined,
): string | null {
  const pages = buildHybridPagesForUser(featurePages, role);
  if (pages.length === 0) return null;

  const alwaysOnIds = new Set(HYBRID_ALWAYS_ON.map((p) => p.id));
  // فضّل صفحة مخصّصة (ليست من الأساسيات) إن وُجدت
  const preferred = pages.find((p) => !alwaysOnIds.has(p.id)) ?? pages[0];
  return preferred.path ?? null;
}
