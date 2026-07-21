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
  LayoutDashboard, FolderKanban, Plus, Clock, CalendarClock, BookOpen, Target,
  ScrollText, Bot, Heart, ClipboardList, MessageSquare, User, TrendingUp,
  ArrowRightLeft, Receipt, ClipboardCheck, Users, Award, Briefcase, UserPlus,
  FileText, DollarSign, CreditCard, ShieldAlert, HeartPulse, BarChart2,
  BarChart3, FileBarChart, Settings, Building2, Layers, ShieldCheck, Fingerprint,
  Radio, RefreshCw, Server, Shield, type LucideIcon,
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
  { id: 'supervisor-breaks',     label: 'تصاريح الاستراحة', icon: ArrowRightLeft,  module: 'supervisor', group: 'team', roles: ['supervisor', 'manager'] },

  // ─── بوابة المدير ───────────────────────────────────────────────
  { id: 'manager-dashboard',   label: 'لوحة المدير',   icon: LayoutDashboard, module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-approvals',   label: 'مركز الموافقات', icon: ClipboardCheck,  module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-performance', label: 'أداء الفريق',    icon: TrendingUp,      module: 'manager', group: 'team', roles: ['manager'] },
  { id: 'manager-workload',    label: 'عبء العمل',      icon: BarChart3,       module: 'manager', group: 'team', roles: ['manager'] },
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
  { id: 'hr-reports',           label: 'التقارير',            icon: FileBarChart,    module: 'hr', group: 'operations', roles: ['hr', 'admin', 'manager'] },

  // ─── بوابة الإدارة (Admin) ──────────────────────────────────────
  { id: 'admin-dashboard',       label: 'لوحة الإدارة',       icon: LayoutDashboard, module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-employees',       label: 'إدارة المستخدمين',    icon: Users,           module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-settings',        label: 'إعدادات النظام',      icon: Settings,        module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-company-profile', label: 'ملف الشركة',         icon: Building2,       module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-branches',        label: 'الفروع',             icon: Building2,       module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-org-structure',   label: 'الهيكل التنظيمي',     icon: Layers,          module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-compliance',      label: 'مركز الامتثال',       icon: ShieldCheck,     module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-ai-config',       label: 'إعدادات AI',         icon: Bot,             module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-reports',         label: 'تقارير النظام',       icon: FileBarChart,    module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-sops-reports',    label: 'تقارير SOP',         icon: ScrollText,      module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-audit-log',       label: 'سجل العمليات',        icon: ShieldCheck,     module: 'admin', group: 'admin', roles: ['admin'] },
  { id: 'admin-permissions',     label: 'الصلاحيات',          icon: ShieldCheck,     module: 'admin', group: 'admin', roles: ['admin'] },

  // ─── بوابة الأمن والحراسة (Gatekeeper) ──────────────────────────
  { id: 'gatekeeper-portal',    label: 'تسجيل الدخول والخروج', icon: Fingerprint,    module: 'gatekeeper', group: 'operations', roles: ['gatekeeper', 'admin'] },
  { id: 'gatekeeper-movements', label: 'بوابة الحركة',        icon: ArrowRightLeft,  module: 'gatekeeper', group: 'operations', roles: ['gatekeeper', 'admin'] },
  { id: 'kiosk-mode',           label: 'محطة التسجيل الذاتي',   icon: Radio,          module: 'gatekeeper', group: 'operations', roles: ['gatekeeper', 'admin'] },

  // ─── البوابة التقنية (IT) ───────────────────────────────────────
  { id: 'tech-dashboard',       label: 'لوحة التحكم التقنية',  icon: LayoutDashboard, module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'biometric-devices',    label: 'إدارة أجهزة البصمة',   icon: Fingerprint,     module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'sync-logs',            label: 'سجل المزامنة',        icon: RefreshCw,       module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'attendance-analytics', label: 'تحليلات الحضور',       icon: BarChart3,       module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'system-health',        label: 'صحة النظام',          icon: Server,          module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'security-events',      label: 'الأحداث الأمنية',      icon: Shield,          module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
  { id: 'tech-settings',        label: 'الإعدادات التقنية',    icon: Settings,        module: 'tech_portal', group: 'tech', roles: ['it_admin', 'tech', 'admin'] },
];

/**
 * الصفحات الأساسية المتاحة دائماً لكل مستخدم في البوابة الهجينة
 * (بغض النظر عن features) — الملف الشخصي.
 *
 * ملاحظة: "الإشعارات" لا تُدرَج هنا لأنها تُعرَض بتصميم خاص في الـ footer
 * (مع عدّاد unreadCount)؛ إدراجها هنا كان يُظهرها مرتين.
 */
const ALL_ROLES: UserRole[] = ['employee','supervisor','manager','hr','admin','gatekeeper','it_admin','tech','finance'];
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
    ['biometric-devices', 'sync-logs', 'attendance-analytics', 'system-health', 'security-events'].includes(pageId)
  ) return 'tech_portal';
  if (pageId.startsWith('finance-')) return 'finance';
  if (pageId.startsWith('tawathul-')) return 'tawathul';
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
