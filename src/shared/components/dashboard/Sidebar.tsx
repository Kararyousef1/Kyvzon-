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
  ArrowRightLeft, TrendingUp, Fingerprint, ScrollText, HeartPulse,
  FolderKanban, CalendarClock, Megaphone, ClipboardCheck,
  Receipt, CreditCard, DollarSign, ShieldAlert, FileText,
  Briefcase, UserPlus, Plus, Cpu, Target, RefreshCw, Server, Shield,
  ShoppingCart, Package, Map, Lightbulb, Truck, Factory, Boxes, Route,
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
import { useTenantModules } from '../../hooks/useTenantModules';

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

function splitInventorySection(section: NavSection): NavSection[] {
  if (section.key === 'inventory-main') {
    const mainIds = [
      'inventory-dashboard',
      'inventory-foundation',
      'inventory-receiving',
      'inventory-storage',
      'inventory-picking',
      'inventory-shipping',
      'inventory-counting',
      'inventory-returns',
      'inventory-labor',
      'inventory-analytics',
    ];
    return [{ ...section, items: section.items.filter((item) => mainIds.includes(item.id)) }];
  }
  if (section.key === 'mrp-main') {
    const mainIds = [
      'mrp-dashboard',
      'mrp-foundation',
      'mrp-bom',
      'mrp-forecasting',
      'mrp-mps',
      'mrp-planning',
      'mrp-inventory',
      'mrp-procurement',
      'mrp-quality',
      'mrp-shopfloor',
      'mrp-maintenance',
      'mrp-costing',
      'mrp-analytics',
    ];
    return [{ ...section, items: section.items.filter((item) => mainIds.includes(item.id)) }];
  }
  if (section.key === 'procurement-main') {
    // الشريط الجانبي يعرض الوحدات الرئيسية فقط.
    // صفحات كل وحدة تظهر داخلها عبر ProcurementUnitNav (بطاقات أفقية).
    const mainIds = [
      'procurement-dashboard',
      'procurement-foundation',
      'procurement-pr',
      'procurement-suppliers',
      'procurement-sourcing',
      'procurement-orders',
      'procurement-invoices',
      'procurement-contracts',
      'procurement-analytics',
    ];
    return [{ ...section, items: section.items.filter((item) => mainIds.includes(item.id)) }];
  }
  if (section.key === 'finance-main') {
    // الشريط الجانبي يعرض الوحدات الرئيسية فقط.
    // صفحات كل وحدة تظهر داخلها عبر FinanceUnitNav (بطاقات أفقية).
    const mainIds = [
      'finance-dashboard',
      'finance-foundation',
      'finance-coa',
      'finance-journal',
      'finance-periods',
      'finance-payable',
      'finance-receivable',
      'finance-cash',
      'finance-tax',
      'finance-budget',
      'finance-fixed-assets',
      'finance-revenue',
      'finance-intercompany',
      'finance-project-accounting',
      'finance-reports',
      'finance-integrations',
    ];
    return [{ ...section, items: section.items.filter((item) => mainIds.includes(item.id)) }];
  }
  return [section];
}

// ════════════════════════════════════════════════════════════════
//  Navigation Structure
// ════════════════════════════════════════════════════════════════

const NAV_SECTIONS: NavSection[] = [
  // ─── 👤 EMPLOYEE PORTAL ───
  {
    key: 'main', label: 'الرئيسية', roles: ['employee'],
    items: [{ id: 'employee-dashboard', label: 'الرئيسية', icon: LayoutDashboard, roles: ['employee', 'supervisor', 'manager'], section: 'main', permKey: 'dashboard' }],
  },
  {
    key: 'work', label: 'العمل', roles: ['employee'],
    items: [
      { id: 'employee-problems', label: 'البلاغات', icon: FolderKanban, roles: ['employee', 'supervisor', 'manager'], section: 'work', permKey: 'problems' },
      { id: 'employee-attendance', label: 'سجل الحضور', icon: Clock, roles: ['employee', 'supervisor', 'manager'], section: 'work', permKey: 'my-attendance' },
      { id: 'employee-requests', label: 'طلباتي وإجازاتي', icon: CalendarClock, roles: ['employee', 'supervisor', 'manager'], section: 'work', permKey: 'my-leave-requests' },
    ],
  },
  {
    key: 'growth', label: 'التطوير', roles: ['employee'],
    items: [
      { id: 'employee-training', label: 'التدريب', icon: BookOpen, roles: ['employee', 'supervisor', 'manager'], section: 'growth', permKey: 'training' },
      { id: 'employee-goals', label: 'أهدافي ومهاراتي', icon: Target, roles: ['employee', 'supervisor', 'manager'], section: 'growth', permKey: 'employee-goals' },
      { id: 'employee-sops', label: 'دليل الإجراءات', icon: ScrollText, roles: ['employee', 'supervisor', 'manager'], section: 'growth', permKey: 'sops' },
      { id: 'employee-ai-chat', label: 'المساعد الذكي', icon: Bot, roles: ['employee', 'supervisor', 'manager'], section: 'growth', permKey: 'ai-chat' },
    ],
  },
  {
    key: 'personal', label: 'الشخصي', roles: ['employee'],
    items: [
      { id: 'employee-wellness', label: 'الصحة النفسية', icon: Heart, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'wellness' },
      { id: 'employee-survey', label: 'الاستبيانات', icon: ClipboardList, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'survey' },
      { id: 'employee-contact', label: 'مركز خدمات HR', icon: MessageSquare, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'contact' },
      { id: 'employee-profile', label: 'حسابي', icon: User, roles: ['employee', 'supervisor', 'manager'], section: 'personal', permKey: 'profile' },
    ],
  },
  {
    key: 'employee-finance', label: 'المالية والرواتب', roles: ['employee'],
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
      { id: 'supervisor-dashboard', label: 'لوحة المشرف', icon: LayoutDashboard, roles: ['supervisor'], section: 'supervisor', permKey: 'supervisor-dashboard' },
      { id: 'supervisor-shift', label: 'إدارة الوردية', icon: CalendarClock, roles: ['supervisor', 'manager'], section: 'supervisor', permKey: 'supervisor-shift' },
      { id: 'supervisor-tasks', label: 'مهام الفريق', icon: ClipboardList, roles: ['supervisor', 'manager'], section: 'supervisor', permKey: 'supervisor-tasks' },
      { id: 'supervisor-checklists', label: 'قوائم الفحص', icon: ClipboardCheck, roles: ['supervisor', 'manager'], section: 'supervisor', permKey: 'supervisor-checklists' },
      { id: 'supervisor-breaks', label: 'تصاريح الاستراحة', icon: ArrowRightLeft, roles: ['supervisor', 'manager'], section: 'supervisor', permKey: 'supervisor-breaks' },
      { id: 'manager-dashboard', label: 'لوحة المدير', icon: LayoutDashboard, roles: ['manager'], section: 'supervisor', permKey: 'manager-dashboard' },
      { id: 'manager-approvals', label: 'مركز الموافقات', icon: ClipboardCheck, roles: ['manager'], section: 'supervisor', permKey: 'manager-approvals' },
      { id: 'manager-performance', label: 'أداء الفريق', icon: TrendingUp, roles: ['manager'], section: 'supervisor', permKey: 'manager-performance' },
      { id: 'manager-workload', label: 'عبء العمل', icon: BarChart3, roles: ['manager'], section: 'supervisor', permKey: 'manager-workload' },
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
      { id: 'hr-contracts', label: 'عقود الموظفين', icon: FileText, roles: ['hr'], section: 'hr-people', permKey: 'hr-contracts' },
      { id: 'hr-communication', label: 'صندوق الرسائل', icon: MessageSquare, roles: ['hr'], section: 'hr-people', permKey: 'communication', badge: 0 },
      { id: 'hr-service-center', label: 'مركز خدمات HR', icon: ClipboardCheck, roles: ['hr'], section: 'hr-people', permKey: 'hr-service-center' },
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
      { id: 'hr-succession', label: 'تخطيط التعاقب', icon: Award, roles: ['hr'], section: 'hr-performance', permKey: 'hr-succession' },
      { id: 'hr-disciplinary', label: 'الإجراءات التأديبية', icon: ShieldAlert, roles: ['hr'], section: 'hr-performance' },
      { id: 'hr-shifts', label: 'جدولة الورديات', icon: CalendarClock, roles: ['hr'], section: 'hr-performance' },
      { id: 'hr-health-safety', label: 'الصحة والسلامة', icon: HeartPulse, roles: ['hr'], section: 'hr-performance', permKey: 'hr-health-safety' },
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
      { id: 'admin-company-profile', label: 'ملف الشركة', icon: Building2, roles: ['admin'], section: 'admin-management', permKey: 'admin-company-profile' },
      { id: 'admin-branches', label: 'الفروع', icon: Building2, roles: ['admin'], section: 'admin-management', permKey: 'admin-branches' },
      { id: 'admin-org-structure', label: 'الهيكل التنظيمي', icon: Layers, roles: ['admin'], section: 'admin-management', permKey: 'admin-org-structure' },
      { id: 'admin-compliance', label: 'مركز الامتثال', icon: ShieldCheck, roles: ['admin'], section: 'admin-management', permKey: 'admin-compliance' },
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
      { id: 'gatekeeper-movements', label: 'بوابة الحركة', icon: ArrowRightLeft, roles: ['gatekeeper'], section: 'gatekeeper-main', permKey: 'gatekeeper-movements' },
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
    key: 'tech-main', label: 'تقنية المعلومات', roles: ['it_admin', 'tech'],
    items: [
      { id: 'tech-dashboard', label: 'لوحة التحكم التقنية', icon: LayoutDashboard, roles: ['it_admin', 'tech'], section: 'tech-main' },
      { id: 'biometric-devices', label: 'إدارة أجهزة البصمة', icon: Fingerprint, roles: ['it_admin', 'tech'], section: 'tech-main' },
      { id: 'sync-logs', label: 'سجل المزامنة', icon: RefreshCw, roles: ['it_admin', 'tech'], section: 'tech-main' },
      { id: 'attendance-analytics', label: 'تحليلات الحضور التقنية', icon: BarChart3, roles: ['it_admin', 'tech'], section: 'tech-main' },
      { id: 'system-health', label: 'صحة النظام', icon: Server, roles: ['it_admin', 'tech'], section: 'tech-main' },
      { id: 'security-events', label: 'الأحداث الأمنية', icon: Shield, roles: ['it_admin', 'tech'], section: 'tech-main' },
      { id: 'tech-settings', label: 'الإعدادات التقنية', icon: Settings, roles: ['it_admin', 'tech'], section: 'tech-main' },
    ],
  },

  // ─── � PROCUREMENT PORTAL ───
  {
    key: 'procurement-main', label: 'بوابة المشتريات', roles: ['procurement', 'admin'],
    items: [
      { id: 'procurement-dashboard', label: 'لوحة المشتريات', icon: LayoutDashboard, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-foundation', label: 'الأساس والتحكم', icon: Settings, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-pr', label: 'طلبات الشراء', icon: ClipboardList, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-suppliers', label: 'الموردون', icon: Users, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-sourcing', label: 'المناقصات والعروض', icon: TrendingUp, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-orders', label: 'أوامر الشراء', icon: ShoppingCart, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-gr', label: 'استلام البضائع', icon: Package, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-invoices', label: 'فواتير المشتريات', icon: Receipt, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-contracts', label: 'العقود', icon: FileText, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-analytics', label: 'تحليلات المشتريات', icon: BarChart2, roles: ['procurement', 'admin'], section: 'procurement-main' },

      // ── صفحات فرعية: مسجَّلة للتوجيه، تظهر داخل وحداتها عبر ProcurementUnitNav ──
      { id: 'procurement-categories', label: 'فئات الإنفاق', icon: Layers, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-approval-rules', label: 'قواعد الموافقة', icon: ShieldCheck, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-policies', label: 'سياسات المشتريات', icon: FileText, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-audit', label: 'سجل تدقيق المشتريات', icon: ClipboardList, roles: ['procurement', 'admin'], section: 'procurement-main' },
      { id: 'procurement-integration', label: 'صحة التكامل', icon: RefreshCw, roles: ['procurement', 'admin'], section: 'procurement-main' },
    ],
  },

  // ─── 📦 INVENTORY / WAREHOUSE PORTAL ───
  {
    key: 'inventory-main', label: 'بوابة المخزون والمستودعات', roles: ['inventory', 'admin'],
    items: [
      { id: 'inventory-dashboard', label: 'لوحة المخزون', icon: LayoutDashboard, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-foundation', label: 'الأساس التقني', icon: Boxes, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-items', label: 'الأصناف والمواد', icon: Package, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-warehouses', label: 'المستودعات والمواقع', icon: Building2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-stock', label: 'الأرصدة الحالية', icon: Database, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-movements', label: 'الكارت المخزني', icon: RefreshCw, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-receiving', label: 'الاستلام والعمليات الواردة', icon: ClipboardCheck, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-asn', label: 'ASN إشعارات الشحن', icon: FileText, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-dock-schedule', label: 'جدولة الأرصفة', icon: CalendarClock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-receiving-sessions', label: 'جلسات الاستلام', icon: ClipboardList, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-osd', label: 'OS&D الانحرافات', icon: AlertOctagon, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-quarantine', label: 'الحجر الصحي', icon: ShieldAlert, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-mobile-scan', label: 'المسح المحمول', icon: Radio, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-lpn-labels', label: 'ملصقات LPN', icon: FileText, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-receiving-reports', label: 'تقارير الاستلام', icon: FileBarChart, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-storage', label: 'التخزين و Slotting', icon: Layers, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-location-map', label: 'خريطة المواقع', icon: Database, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-visual-map', label: 'الخريطة التفاعلية', icon: Globe, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-storage-heatmap', label: 'Heatmap النشاط', icon: BarChart3, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-slotting', label: 'محرك Slotting', icon: Layers, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-abc', label: 'ABC Classification', icon: BarChart2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-replenishment', label: 'إدارة التجديد', icon: RefreshCw, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-capacity', label: 'السعة والمساحة', icon: Building2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-slow-moving', label: 'المخزون الراكد', icon: Clock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-location-labels', label: 'تسمية الخانات', icon: FileText, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-affinity', label: 'Affinity Slotting', icon: Target, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-seasonal-slotting', label: 'Seasonal Slotting', icon: CalendarClock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-task-interleaving', label: 'Task Interleaving', icon: ArrowRightLeft, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-slow-moving-reports', label: 'تقارير الراكد', icon: FileBarChart, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-picking', label: 'السحب والتنفيذ', icon: Target, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-orders', label: 'أوامر السحب', icon: ClipboardList, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-tasks', label: 'مهام السحب', icon: CheckCircle2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-waves', label: 'موجات السحب', icon: CalendarClock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-exceptions', label: 'استثناءات السحب', icon: AlertOctagon, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-scans', label: 'Scan-to-Confirm', icon: Radio, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-picking-productivity', label: 'إنتاجية السحب', icon: BarChart3, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-picking-kpis', label: 'KPIs السحب', icon: BarChart2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-route-map', label: 'خريطة مسار السحب', icon: Map, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-voice-picking', label: 'Voice Picking', icon: Radio, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-to-light', label: 'Pick-to-Light', icon: Lightbulb, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-rfid-picking', label: 'RFID Picking', icon: Radio, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-pick-sorting', label: 'Batch/Cluster Sorting', icon: Layers, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-zone-handoffs', label: 'Zone Handoffs', icon: ArrowRightLeft, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-shipping', label: 'الشحن والعمليات الصادرة', icon: ArrowRightLeft, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-shipping-packages', label: 'التعبئة والطرود', icon: Package, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-shipments', label: 'الشحنات', icon: Truck, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-carriers', label: 'شركات الشحن', icon: Briefcase, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-shipping-documents', label: 'وثائق الشحن', icon: FileText, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-manifests', label: 'Manifest والتحميل', icon: ClipboardList, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-manifest-completion', label: 'اكتمال Manifest', icon: CheckCircle2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-rate-quotes', label: 'Rate Shopping', icon: DollarSign, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-rate-rules', label: 'قواعد اختيار الناقل', icon: Settings, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-shipment-tracking', label: 'تتبع الشحنات', icon: Globe, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-carrier-webhooks', label: 'Carrier Webhooks', icon: Server, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-shipping-kpis', label: 'KPIs الشحن', icon: BarChart2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-counting', label: 'الجرد ودقة المخزون', icon: ShieldCheck, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-count-plans', label: 'خطط الجرد', icon: CalendarClock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-count-tasks', label: 'مهام العد', icon: ClipboardList, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-count-variances', label: 'فروق الجرد', icon: AlertOctagon, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-adjustment-approvals', label: 'اعتماد التسويات', icon: CheckCircle2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-count-completion', label: 'اكتمال الجرد', icon: BarChart2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-expiry-count-report', label: 'تقرير الصلاحية', icon: Clock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-mobile-count', label: 'واجهة العد المحمولة', icon: Radio, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-recount', label: 'العد الثاني/الثالث', icon: RefreshCw, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-count-freeze', label: 'تجميد الجرد', icon: ShieldAlert, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-annual-count', label: 'الجرد السنوي', icon: CalendarClock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-returns', label: 'المرتجعات واللوجستيات العكسية', icon: RefreshCw, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-rma', label: 'إدارة RMA', icon: FileText, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-receiving', label: 'استلام المرتجعات', icon: ClipboardCheck, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-grading', label: 'تقييم A/B/C/D', icon: ShieldCheck, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-disposition', label: 'مسارات Disposition', icon: ArrowRightLeft, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-production-returns', label: 'مرتجعات الإنتاج', icon: Factory, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-rtv', label: 'RTV للموردين', icon: Truck, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-notifications', label: 'إشعارات المرتجعات', icon: Bell, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-supplier-rtv-reports', label: 'تقارير RTV للمورد', icon: FileBarChart, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-analytics', label: 'تحليلات المرتجعات', icon: BarChart2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-quality', label: 'جودة المرتجعات', icon: ShieldAlert, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-value-recovery', label: 'استرداد القيمة', icon: DollarSign, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-return-capa', label: 'CAPA المرتجعات', icon: CheckCircle2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor', label: 'العمالة والإنتاجية', icon: Users, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-standards', label: 'معايير الإنتاجية', icon: ClipboardList, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-workforce-planning', label: 'تخطيط العمالة', icon: CalendarClock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-worker-availability', label: 'توفر العمال', icon: Users, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-dispatch', label: 'التوزيع الذكي', icon: Target, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-interleaving', label: 'Task Interleaving', icon: ArrowRightLeft, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-time-tracking', label: 'تتبع الوقت', icon: Clock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-employee-performance', label: 'أداء الموظف', icon: BarChart3, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-manager-dashboard', label: 'لوحة مدير الوردية', icon: LayoutDashboard, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-non-productive-time', label: 'الوقت غير المنتج', icon: ShieldAlert, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-skills-training', label: 'المهارات والتدريب', icon: Award, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-incentives', label: 'الحوافز', icon: DollarSign, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-reports', label: 'تقارير الإنتاجية', icon: FileBarChart, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-safety-kpis', label: 'سلامة وKPIs العمالة', icon: ShieldCheck, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-labor-leaderboard', label: 'ترتيب الوردية', icon: Award, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-analytics', label: 'تحليلات المستودع', icon: BarChart2, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-analytics-executive', label: 'لوحة تنفيذية', icon: LayoutDashboard, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-analytics-operations', label: 'لوحة مدير المستودع', icon: ClipboardList, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-analytics-supervisor', label: 'لوحة مشرف الوردية', icon: Users, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-kpi-scorecard', label: 'KPI Scorecard', icon: BarChart3, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-kpi-trends', label: 'اتجاهات KPI', icon: TrendingUp, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-analytics-heatmap', label: 'Heatmap التحليلي', icon: Map, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-seasonal-patterns', label: 'الأنماط الموسمية', icon: CalendarClock, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-root-cause', label: 'Root Cause', icon: ShieldAlert, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-predictive-alerts', label: 'تنبيهات استباقية', icon: Bell, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-periodic-reports', label: 'تقارير دورية', icon: FileBarChart, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-report-exports', label: 'تصدير التقارير', icon: FileText, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-operating-costs', label: 'تكاليف التشغيل', icon: DollarSign, roles: ['inventory', 'admin'], section: 'inventory-main' },
      { id: 'inventory-kpi-targets', label: 'أهداف KPI', icon: Target, roles: ['inventory', 'admin'], section: 'inventory-main' },
    ],
  },

  // ─── 🏭 MRP / MANUFACTURING PORTAL ───
  {
    key: 'mrp-main', label: 'بوابة التصنيع MRP', roles: ['manufacturing', 'admin'],
    items: [
      { id: 'mrp-dashboard', label: 'لوحة التصنيع', icon: LayoutDashboard, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-foundation', label: 'الأساس التقني', icon: Factory, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-bom', label: 'BOM والتغييرات الهندسية', icon: Layers, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-forecasting', label: 'التنبؤ بالطلب', icon: TrendingUp, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-mps', label: 'MPS الجدول الرئيسي', icon: CalendarClock, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-planning', label: 'تخطيط الإنتاج وأوامر العمل', icon: ClipboardCheck, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-inventory', label: 'المخزون التصنيعي وWIP', icon: Package, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-procurement', label: 'تكامل المشتريات', icon: ShoppingCart, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-quality', label: 'إدارة الجودة', icon: ShieldCheck, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-shopfloor', label: 'أرضية المصنع MES/SFC', icon: Radio, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-maintenance', label: 'الصيانة CMMS', icon: Settings, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-costing', label: 'تكاليف التصنيع', icon: DollarSign, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-analytics', label: 'تحليلات التصنيع', icon: BarChart3, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-plants', label: 'المصانع', icon: Building2, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-work-centers', label: 'مراكز العمل', icon: Settings, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-operations', label: 'العمليات', icon: ClipboardList, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-routings', label: 'Routing', icon: Route, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-capacity', label: 'الطاقة', icon: BarChart3, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
      { id: 'mrp-integrations', label: 'التكاملات', icon: Server, roles: ['manufacturing', 'admin'], section: 'mrp-main' },
    ],
  },

  // ─── �💰 FINANCE PORTAL ───
  {
    key: 'finance-main', label: 'البوابة المالية', roles: ['finance', 'admin'],
    items: [
      // ── الوحدات الرئيسية (تظهر في الشريط الجانبي) ──
      { id: 'finance-dashboard', label: 'لوحة المالية', icon: LayoutDashboard, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-foundation', label: 'الأساس المالي', icon: Building2, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-coa', label: 'دليل الحسابات', icon: BookOpen, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-journal', label: 'القيود والدفتر العام', icon: ClipboardList, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-periods', label: 'الفترات والإغلاق', icon: Clock, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-payable', label: 'الذمم الدائنة', icon: Receipt, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-receivable', label: 'الذمم المدينة والتحصيل', icon: CreditCard, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-cash', label: 'النقد والبنوك', icon: DollarSign, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-tax', label: 'الضرائب والتقديم', icon: FileText, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-budget', label: 'الموازنات والتنبؤات', icon: BarChart3, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-fixed-assets', label: 'الأصول الثابتة', icon: Boxes, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-revenue', label: 'الاعتراف بالإيرادات', icon: TrendingUp, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-intercompany', label: 'المعاملات البينية والتوحيد', icon: ArrowRightLeft, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-project-accounting', label: 'محاسبة المشاريع', icon: FolderKanban, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-reports', label: 'التقارير والتحليلات', icon: FileBarChart, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-integrations', label: 'التكاملات المالية', icon: Layers, roles: ['finance', 'admin'], section: 'finance-main' },

      // ── صفحات فرعية: مسجَّلة للتوجيه، وتظهر داخل وحداتها عبر FinanceUnitNav ──
      { id: 'finance-setup', label: 'إعداد المالية', icon: Settings, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-multi-entity', label: 'الكيانات المتعددة', icon: Building2, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-entity-memberships', label: 'عضويات الكيان', icon: ShieldCheck, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-cost-centers', label: 'مراكز التكلفة', icon: Layers, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-projects', label: 'المشاريع', icon: FolderKanban, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-exchange-rates', label: 'أسعار الصرف', icon: RefreshCw, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-trial-balance', label: 'ميزان المراجعة', icon: BarChart2, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-ledger', label: 'دفتر الأستاذ', icon: ScrollText, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-vendors', label: 'الموردين', icon: Users, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-bank-import', label: 'استيراد كشوف البنك', icon: FileText, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-forecast', label: 'التنبؤ النقدي', icon: TrendingUp, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-budget-variance', label: 'تحليل التباين', icon: BarChart2, roles: ['finance', 'admin'], section: 'finance-main' },
      { id: 'finance-system-notes', label: 'التدقيق المالي', icon: ShieldCheck, roles: ['finance', 'admin'], section: 'finance-main' },
    ],
  },

  // ─── 💬 TAWATHUL (للجميع) ───
  {
    key: 'tawathul', label: 'التواصل', roles: ['employee', 'supervisor', 'manager', 'hr', 'admin', 'finance'],
    items: [
      { id: 'tawathul-portal', label: 'بوابة التواصل', icon: MessageSquare, roles: ['employee', 'supervisor', 'manager', 'hr', 'admin', 'finance'], section: 'tawathul' },
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
    roles: ['employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager', 'it_admin', 'finance'],
    items: [
      { id: 'my-notifications', label: 'الإشعارات', icon: Bell, roles: ['employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager', 'it_admin', 'finance'], section: 'notifications', permKey: 'notifications' },
      { id: 'notifications', label: 'التبليغات', icon: Megaphone, roles: ['employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager', 'it_admin', 'finance'], section: 'notifications', permKey: 'notifications' },
    ],
  },
];

// ════════════════════════════════════════════════════════════════
//  Module Gate Mapping
// ════════════════════════════════════════════════════════════════

/**
 * توافق خلفي لوحدات المالية بعد إعادة الهيكلة.
 * المفتاح = معرّف الوحدة الجديد، القيمة = المعرّفات القديمة/الفرعية التي
 * إن وُجد أحدها في allowed_pages تُعتبر الوحدة مسموحة.
 */
/**
 * توافق خلفي لوحدات المشتريات: من يملك صفحة فرعية يرى وحدتها.
 */
const PROCUREMENT_UNIT_FALLBACK: Record<string, string[]> = {
  'procurement-foundation': ['procurement-categories', 'procurement-approval-rules', 'procurement-policies', 'procurement-audit', 'procurement-integration'],
  'procurement-orders': ['procurement-gr'],
};

const FINANCE_UNIT_FALLBACK: Record<string, string[]> = {
  'finance-foundation': ['finance-setup', 'finance-multi-entity', 'finance-entity-memberships', 'finance-cost-centers', 'finance-projects', 'finance-exchange-rates'],
  'finance-journal': ['finance-ledger', 'finance-trial-balance'],
  'finance-periods': ['finance-system-notes'],
  'finance-payable': ['finance-vendors'],
  'finance-cash': ['finance-bank', 'finance-bank-import', 'finance-forecast'],
  'finance-receivable': ['finance-collections'],
  'finance-budget': ['finance-budget-variance', 'finance-forecast'],
  'finance-fixed-assets': ['finance-assets'],
  'finance-revenue': ['finance-revenue-recognition'],
  'finance-intercompany': ['finance-consolidation'],
  'finance-tax': ['finance-tax-management'],
  'finance-reports': ['finance-trial-balance', 'finance-ledger'],
  'finance-integrations': ['finance-integration'],
};

const ITEM_MODULE_MAP: Record<string, string> = {
  'employee-dashboard': 'employee',
  'employee-problems': 'employee',
  'new-problem': 'employee',
  'employee-attendance': 'employee',
  'employee-requests': 'employee',
  'employee-training': 'employee',
  'employee-goals': 'employee',
  'employee-sops': 'employee',
  'employee-wellness': 'employee',
  'employee-survey': 'employee',
  'employee-contact': 'employee',
  'employee-profile': 'employee',
  'employee-payroll': 'employee',
  'employee-loans': 'employee',
  'employee-expenses': 'employee',

  'manager-dashboard': 'manager',
  'manager-approvals': 'manager',
  'manager-performance': 'manager',
  'manager-workload': 'manager',
  'manager-attendance': 'manager',

  'supervisor-dashboard': 'supervisor',
  'supervisor-shift': 'supervisor',
  'supervisor-tasks': 'supervisor',
  'supervisor-checklists': 'supervisor',
  'supervisor-breaks': 'supervisor',

  'hr-dashboard': 'hr',
  'hr-problems': 'hr',
  'hr-analytics': 'hr',
  'hr-team': 'hr',
  'hr-reports': 'reports',
  'hr-attendance': 'hr',
  'hr-talent-market': 'hr',
  'hr-movement-analysis': 'movement',
  'hr-manage-training': 'hr',
  'hr-training-reports': 'reports',
  'hr-payroll': 'hr',
  'hr-loans': 'hr',
  'hr-bonuses': 'hr',
  'hr-expenses': 'hr',
  'hr-recruitment': 'hr',
  'hr-onboarding': 'hr',
  'hr-documents': 'hr',
  'hr-contracts': 'contracts',
  'hr-succession': 'succession',
  'hr-performance': 'hr',
  'hr-disciplinary': 'hr',
  'hr-shifts': 'hr',
  'hr-health-safety': 'health_safety',
  'hr-communication': 'hr',
  'hr-service-center': 'hr',
  'hr-sops': 'hr',

  'admin-dashboard': 'admin',
  'admin-employees': 'admin',
  'admin-settings': 'admin',
  'admin-company-profile': 'admin',
  'admin-branches': 'admin',
  'admin-org-structure': 'admin',
  'admin-compliance': 'admin',
  'admin-ai-config': 'ai',
  'admin-reports': 'reports',
  'admin-audit-log': 'admin',
  'admin-cms': 'admin',
  'admin-sops': 'admin',
  'admin-sops-reports': 'reports',

  'gatekeeper-portal': 'gatekeeper',
  'gatekeeper-movements': 'movement',
  'kiosk-mode': 'gatekeeper',

  'tech-portal': 'tech_portal',
  'tech-dashboard': 'tech_portal',
  'biometric-devices': 'tech_portal',
  'sync-logs': 'tech_portal',
  'attendance-analytics': 'tech_portal',
  'system-health': 'tech_portal',
  'security-events': 'tech_portal',
  'tech-settings': 'tech_portal',
  'tawathul-portal': 'tawathul',
  'tawathul-admin': 'tawathul',
  'admin-ai-insights': 'ai',
  'employee-ai-chat': 'ai',

  'procurement-dashboard': 'procurement',
  'procurement-pr': 'procurement',
  'procurement-suppliers': 'procurement',
  'procurement-sourcing': 'procurement',
  'procurement-orders': 'procurement',
  'procurement-gr': 'procurement',
  'procurement-invoices': 'procurement',
  'procurement-contracts': 'procurement',
  'procurement-analytics': 'procurement',

  'inventory-dashboard': 'inventory',
  'inventory-foundation': 'inventory',
  'inventory-items': 'inventory',
  'inventory-warehouses': 'inventory',
  'inventory-stock': 'inventory',
  'inventory-movements': 'inventory',
  'inventory-numbering': 'inventory',
  'inventory-receiving': 'inventory',
  'inventory-asn': 'inventory',
  'inventory-dock-schedule': 'inventory',
  'inventory-receiving-sessions': 'inventory',
  'inventory-osd': 'inventory',
  'inventory-quarantine': 'inventory',
  'inventory-putaway': 'inventory',
  'inventory-cross-dock': 'inventory',
  'inventory-mobile-scan': 'inventory',
  'inventory-lpn-labels': 'inventory',
  'inventory-receiving-reports': 'inventory',
  'inventory-inbound-notifications': 'inventory',
  'inventory-storage': 'inventory',
  'inventory-location-map': 'inventory',
  'inventory-visual-map': 'inventory',
  'inventory-storage-heatmap': 'inventory',
  'inventory-slotting': 'inventory',
  'inventory-abc': 'inventory',
  'inventory-replenishment': 'inventory',
  'inventory-capacity': 'inventory',
  'inventory-slow-moving': 'inventory',
  'inventory-location-labels': 'inventory',
  'inventory-affinity': 'inventory',
  'inventory-seasonal-slotting': 'inventory',
  'inventory-task-interleaving': 'inventory',
  'inventory-slow-moving-reports': 'inventory',
  'inventory-picking': 'inventory',
  'inventory-pick-orders': 'inventory',
  'inventory-pick-tasks': 'inventory',
  'inventory-pick-waves': 'inventory',
  'inventory-pick-exceptions': 'inventory',
  'inventory-pick-scans': 'inventory',
  'inventory-picking-productivity': 'inventory',
  'inventory-picking-kpis': 'inventory',
  'inventory-pick-route-map': 'inventory',
  'inventory-voice-picking': 'inventory',
  'inventory-pick-to-light': 'inventory',
  'inventory-rfid-picking': 'inventory',
  'inventory-pick-sorting': 'inventory',
  'inventory-zone-handoffs': 'inventory',
  'inventory-shipping': 'inventory',
  'inventory-shipping-packages': 'inventory',
  'inventory-shipments': 'inventory',
  'inventory-carriers': 'inventory',
  'inventory-shipping-documents': 'inventory',
  'inventory-manifests': 'inventory',
  'inventory-manifest-completion': 'inventory',
  'inventory-rate-quotes': 'inventory',
  'inventory-rate-rules': 'inventory',
  'inventory-shipment-tracking': 'inventory',
  'inventory-carrier-webhooks': 'inventory',
  'inventory-shipping-kpis': 'inventory',
  'inventory-counting': 'inventory',
  'inventory-count-plans': 'inventory',
  'inventory-count-tasks': 'inventory',
  'inventory-count-variances': 'inventory',
  'inventory-adjustment-approvals': 'inventory',
  'inventory-count-completion': 'inventory',
  'inventory-expiry-count-report': 'inventory',
  'inventory-mobile-count': 'inventory',
  'inventory-recount': 'inventory',
  'inventory-count-freeze': 'inventory',
  'inventory-annual-count': 'inventory',
  'inventory-returns': 'inventory',
  'inventory-rma': 'inventory',
  'inventory-return-receiving': 'inventory',
  'inventory-return-grading': 'inventory',
  'inventory-return-disposition': 'inventory',
  'inventory-production-returns': 'inventory',
  'inventory-return-rtv': 'inventory',
  'inventory-return-notifications': 'inventory',
  'inventory-supplier-rtv-reports': 'inventory',
  'inventory-return-analytics': 'inventory',
  'inventory-return-quality': 'inventory',
  'inventory-return-value-recovery': 'inventory',
  'inventory-return-capa': 'inventory',
  'inventory-labor': 'inventory',
  'inventory-labor-standards': 'inventory',
  'inventory-workforce-planning': 'inventory',
  'inventory-worker-availability': 'inventory',
  'inventory-labor-dispatch': 'inventory',
  'inventory-labor-interleaving': 'inventory',
  'inventory-labor-time-tracking': 'inventory',
  'inventory-employee-performance': 'inventory',
  'inventory-labor-manager-dashboard': 'inventory',
  'inventory-non-productive-time': 'inventory',
  'inventory-skills-training': 'inventory',
  'inventory-labor-incentives': 'inventory',
  'inventory-labor-reports': 'inventory',
  'inventory-labor-safety-kpis': 'inventory',
  'inventory-labor-leaderboard': 'inventory',
  'inventory-analytics': 'inventory',
  'inventory-analytics-executive': 'inventory',
  'inventory-analytics-operations': 'inventory',
  'inventory-analytics-supervisor': 'inventory',
  'inventory-kpi-scorecard': 'inventory',
  'inventory-kpi-trends': 'inventory',
  'inventory-analytics-heatmap': 'inventory',
  'inventory-seasonal-patterns': 'inventory',
  'inventory-root-cause': 'inventory',
  'inventory-predictive-alerts': 'inventory',
  'inventory-periodic-reports': 'inventory',
  'inventory-report-exports': 'inventory',
  'inventory-operating-costs': 'inventory',
  'inventory-kpi-targets': 'inventory',

  'mrp-dashboard': 'mrp',
  'mrp-foundation': 'mrp',
  'mrp-bom': 'mrp',
  'mrp-bom-builder': 'mrp',
  'mrp-bom-headers': 'mrp',
  'mrp-bom-versions': 'mrp',
  'mrp-bom-lines': 'mrp',
  'mrp-bom-explosion': 'mrp',
  'mrp-bom-availability': 'mrp',
  'mrp-ecr': 'mrp',
  'mrp-eco': 'mrp',
  'mrp-bom-import-export': 'mrp',
  'mrp-bom-reports': 'mrp',
  'mrp-forecasting': 'mrp',
  'mrp-demand-history': 'mrp',
  'mrp-forecast-models': 'mrp',
  'mrp-forecast-runs': 'mrp',
  'mrp-forecast-accuracy': 'mrp',
  'mrp-planning-policies': 'mrp',
  'mrp-mps': 'mrp',
  'mrp-mps-board': 'mrp',
  'mrp-mps-plans': 'mrp',
  'mrp-mps-lines': 'mrp',
  'mrp-rccp': 'mrp',
  'mrp-mps-alerts': 'mrp',
  'mrp-mps-reports': 'mrp',
  'mrp-planning': 'mrp',
  'mrp-runs': 'mrp',
  'mrp-planned-orders': 'mrp',
  'mrp-work-orders': 'mrp',
  'mrp-wo-materials': 'mrp',
  'mrp-wo-operations': 'mrp',
  'mrp-production-scheduling': 'mrp',
  'mrp-dispatch': 'mrp',
  'mrp-wo-alerts': 'mrp',
  'mrp-planning-reports': 'mrp',
  'mrp-inventory': 'mrp',
  'mrp-raw-materials': 'mrp',
  'mrp-wip': 'mrp',
  'mrp-finished-goods': 'mrp',
  'mrp-valuation': 'mrp',
  'mrp-lots-traceability': 'mrp',
  'mrp-safety-stock': 'mrp',
  'mrp-material-issues': 'mrp',
  'mrp-reconciliation': 'mrp',
  'mrp-inventory-reports': 'mrp',
  'mrp-procurement': 'mrp',
  'mrp-proc-recommendations': 'mrp',
  'mrp-proc-pr': 'mrp',
  'mrp-proc-rfq': 'mrp',
  'mrp-proc-po': 'mrp',
  'mrp-proc-gr': 'mrp',
  'mrp-proc-invoices': 'mrp',
  'mrp-proc-suppliers': 'mrp',
  'mrp-proc-contracts': 'mrp',
  'mrp-proc-alerts': 'mrp',
  'mrp-proc-reports': 'mrp',
  'mrp-quality': 'mrp',
  'mrp-quality-plans': 'mrp',
  'mrp-quality-checklists': 'mrp',
  'mrp-quality-inspections': 'mrp',
  'mrp-quality-aql': 'mrp',
  'mrp-quality-ncr': 'mrp',
  'mrp-quality-capa': 'mrp',
  'mrp-quality-calibration': 'mrp',
  'mrp-quality-spc': 'mrp',
  'mrp-quality-quarantine': 'mrp',
  'mrp-quality-reports': 'mrp',
  'mrp-shopfloor': 'mrp',
  'mrp-shopfloor-workstations': 'mrp',
  'mrp-shopfloor-terminals': 'mrp',
  'mrp-shopfloor-tracking': 'mrp',
  'mrp-shopfloor-consumption': 'mrp',
  'mrp-shopfloor-oee': 'mrp',
  'mrp-shopfloor-downtime': 'mrp',
  'mrp-shopfloor-pareto': 'mrp',
  'mrp-shopfloor-progress': 'mrp',
  'mrp-shopfloor-labor': 'mrp',
  'mrp-shopfloor-andon': 'mrp',
  'mrp-shopfloor-supervisor': 'mrp',
  'mrp-shopfloor-manager': 'mrp',
  'mrp-shopfloor-maintenance': 'mrp',
  'mrp-shopfloor-reports': 'mrp',
  'mrp-maintenance': 'mrp',
  'mrp-maintenance-assets': 'mrp',
  'mrp-maintenance-criticality': 'mrp',
  'mrp-maintenance-pm-plans': 'mrp',
  'mrp-maintenance-pm-calendar': 'mrp',
  'mrp-maintenance-work-orders': 'mrp',
  'mrp-maintenance-spare-parts': 'mrp',
  'mrp-maintenance-condition': 'mrp',
  'mrp-maintenance-breakdowns': 'mrp',
  'mrp-maintenance-shutdowns': 'mrp',
  'mrp-maintenance-reports': 'mrp',
  'mrp-costing': 'mrp',
  'mrp-cost-elements': 'mrp',
  'mrp-costing-profiles': 'mrp',
  'mrp-standard-costs': 'mrp',
  'mrp-cost-rollup': 'mrp',
  'mrp-work-order-costs': 'mrp',
  'mrp-cost-variances': 'mrp',
  'mrp-wip-valuation': 'mrp',
  'mrp-fg-valuation': 'mrp',
  'mrp-cost-postings': 'mrp',
  'mrp-costing-reports': 'mrp',
  'mrp-analytics': 'mrp',
  'mrp-analytics-executive': 'mrp',
  'mrp-analytics-operations': 'mrp',
  'mrp-analytics-scorecard': 'mrp',
  'mrp-analytics-oee': 'mrp',
  'mrp-analytics-schedule': 'mrp',
  'mrp-analytics-bottlenecks': 'mrp',
  'mrp-analytics-quality-cost': 'mrp',
  'mrp-analytics-cost-variance': 'mrp',
  'mrp-analytics-maintenance': 'mrp',
  'mrp-analytics-alerts': 'mrp',
  'mrp-analytics-root-cause': 'mrp',
  'mrp-analytics-reports': 'mrp',
  'mrp-analytics-exports': 'mrp',
  'mrp-analytics-kpi-targets': 'mrp',
  'mrp-plants': 'mrp',
  'mrp-areas': 'mrp',
  'mrp-lines': 'mrp',
  'mrp-work-centers': 'mrp',
  'mrp-resources': 'mrp',
  'mrp-assets': 'mrp',
  'mrp-calendars': 'mrp',
  'mrp-shifts': 'mrp',
  'mrp-capacity': 'mrp',
  'mrp-operations': 'mrp',
  'mrp-routings': 'mrp',
  'mrp-numbering': 'mrp',
  'mrp-audit': 'mrp',
  'mrp-integrations': 'mrp',
};

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
  tech:        { label: 'تقني',          portalName: 'البوابة التقنية', gradient: 'from-cyan-600 to-teal-700',   bg: 'from-cyan-50 to-teal-50',   text: 'text-cyan-600' },
  finance:     { label: 'مالية',        portalName: 'بوابة المالية', gradient: 'from-emerald-600 to-emerald-800', bg: 'from-emerald-50 to-emerald-100', text: 'text-emerald-600' },
  marketing:   { label: 'تسويق',        portalName: 'بوابة التسويق', gradient: 'from-fuchsia-600 to-purple-700', bg: 'from-fuchsia-50 to-purple-50', text: 'text-fuchsia-600' },
  sales:       { label: 'مبيعات',       portalName: 'بوابة CRM',     gradient: 'from-cyan-600 to-blue-700',    bg: 'from-cyan-50 to-blue-50',      text: 'text-cyan-600' },
  procurement: { label: 'مشتريات',      portalName: 'بوابة المشتريات', gradient: 'from-amber-600 to-orange-700', bg: 'from-amber-50 to-orange-50', text: 'text-amber-600' },
  inventory:   { label: 'مخزون',        portalName: 'بوابة المخزون والمستودعات', gradient: 'from-indigo-600 to-blue-700', bg: 'from-indigo-50 to-blue-50', text: 'text-indigo-600' },
  manufacturing:{ label: 'تصنيع',      portalName: 'بوابة التصنيع MRP', gradient: 'from-orange-600 to-red-700', bg: 'from-orange-50 to-red-50', text: 'text-orange-600' },
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
  const { isEnabled: isModuleEnabled } = useTenantModules();

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
  const hasCustomPages = Array.isArray(user.custom_permissions?.allowed_pages);

  const canView = (item: NavItem): boolean => {
    // 1) فحص تفعيل الموديل للشركة ككل
    const moduleKey = ITEM_MODULE_MAP[item.id];
    if (moduleKey && !isModuleEnabled(moduleKey)) return false;

    // 2) فحص الصلاحيات المخصصة للصفحات (allowed_pages)
    const allowedPages = user.custom_permissions?.allowed_pages;
    if (Array.isArray(allowedPages)) {
      // إذا كانت مصفوفة الصلاحيات المخصصة موجودة، نتحقق من وجود الصفحة فيها مباشرة.
      // توافق للمستخدمين الذين مُنحوا صفحات الأساس قبل إضافة مدخل inventory-foundation.
      if (item.id === 'inventory-foundation') {
        return allowedPages.includes('inventory-foundation') || ['inventory-items', 'inventory-warehouses', 'inventory-stock', 'inventory-movements'].some(id => allowedPages.includes(id));
      }
      // توافق خلفي للمالية: المستخدمون الذين مُنحوا صفحات المالية قبل إعادة
      // هيكلتها إلى وحدات لا تحتوي allowed_pages لديهم المعرّفات الجديدة.
      // نمنحهم الوحدة إذا كان لديهم أي صفحة تابعة لها.
      const financeFallback = FINANCE_UNIT_FALLBACK[item.id];
      if (financeFallback) {
        return allowedPages.includes(item.id) || financeFallback.some(id => allowedPages.includes(id));
      }
      const procurementFallback = PROCUREMENT_UNIT_FALLBACK[item.id];
      if (procurementFallback) {
        return allowedPages.includes(item.id) || procurementFallback.some(id => allowedPages.includes(id));
      }
      return allowedPages.includes(item.id);
    }

    // 3) Fallback: الفحص الافتراضي المبني على الأدوار والصلاحيات العامة
    if (!item.roles.includes(role)) return false;
    if (item.permKey) {
      const effective = getEffectivePermissions(role, user.permissions);
      return hasPermission(effective, item.permKey);
    }
    return true;
  };

  const visibleSections = NAV_SECTIONS
    .filter((section) => hasCustomPages || section.roles.includes(role))
    .map((section) => ({
      ...section,
      items: section.items.filter(canView).map((item) => {
        if (item.id === 'hr-problems') return { ...item, badge: dynamicBadges.problems || undefined };
        if (item.id === 'hr-communication') return { ...item, badge: dynamicBadges.messages || undefined };
        if (item.id === 'my-notifications') return { ...item, badge: unreadCount || undefined };
        return item;
      }),
    }))
    .filter((section) => section.items.length > 0)
    .flatMap(splitInventorySection);

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