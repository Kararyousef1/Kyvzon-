/**
 * ═════════════════════════════════════════════════════════════════════════
 *  crmCatalog.ts — كتالوج وحدات بوابة CRM
 *
 *  بوابة CRM تتكوّن من 6 وحدات (حسب التقارير في src/pages/CRM/*.md):
 *    1) جهات الاتصال والحسابات   2) خط الأنابيب والصفقات
 *    3) الأنشطة والأتمتة          4) العروض والعقود (CPQ)
 *    5) الدعم والتذاكر            6) التحليلات والتنبؤ
 *
 *  تُبنى الوحدات تدريجياً حسب ترتيب التقارير — نميّز الجاهز عن القادم.
 * ═════════════════════════════════════════════════════════════════════════
 */

import {
  Contact, GitBranch, ListTodo, FileText, Headphones, BarChart3,
  LayoutDashboard, type LucideIcon,
} from 'lucide-react';

export type CrmModuleStatus = 'available' | 'coming_soon';

export interface CrmModuleMeta {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  path: string;
  /** رقم التقرير المرجعي في src/pages/CRM/ */
  report: number;
  status: CrmModuleStatus;
}

export const CRM_BASE = '/app/crm';

/** لوحة البوابة الرئيسية */
export const CRM_DASHBOARD: CrmModuleMeta = {
  id: 'crm-dashboard',
  label: 'لوحة CRM',
  description: 'نظرة عامة على المبيعات عبر كل الوحدات',
  icon: LayoutDashboard,
  path: `${CRM_BASE}`,
  report: 0,
  status: 'available',
};

/** الوحدات الست بترتيب التقارير */
export const CRM_MODULES: CrmModuleMeta[] = [
  {
    id: 'crm-contacts',
    label: 'جهات الاتصال والحسابات',
    description: 'سجل 360° للأشخاص والشركات مع الجدول الزمني الموحّد',
    icon: Contact,
    path: `${CRM_BASE}/contacts`,
    report: 1,
    status: 'available',
  },
  {
    id: 'crm-pipeline',
    label: 'خط الأنابيب والصفقات',
    description: 'مراحل البيع، Kanban، وسرعة الصفقة (Deal Velocity)',
    icon: GitBranch,
    path: `${CRM_BASE}/pipeline`,
    report: 2,
    status: 'available',
  },
  {
    id: 'crm-activities',
    label: 'الأنشطة والأتمتة',
    description: 'المهام، المكالمات، سلاسل المتابعة، وقواعد الأتمتة',
    icon: ListTodo,
    path: `${CRM_BASE}/activities`,
    report: 3,
    status: 'available',
  },
  {
    id: 'crm-quotes',
    label: 'العروض والعقود',
    description: 'CPQ، توليد PDF، التوقيع الإلكتروني، وإدارة العقود',
    icon: FileText,
    path: `${CRM_BASE}/quotes`,
    report: 4,
    status: 'available',
  },
  {
    id: 'crm-support',
    label: 'الدعم والتذاكر',
    description: 'التذاكر، SLA، قاعدة المعرفة، وتنبيهات خطر المغادرة',
    icon: Headphones,
    path: `${CRM_BASE}/support`,
    report: 5,
    status: 'available',
  },
  {
    id: 'crm-analytics',
    label: 'التحليلات والتنبؤ',
    description: 'لوحات مخصّصة، التنبؤ بالإيراد، وصحة الحسابات',
    icon: BarChart3,
    path: `${CRM_BASE}/analytics`,
    report: 6,
    status: 'available',
  },
];

/** كل عناصر التنقل (اللوحة + الوحدات) */
export const CRM_NAV: CrmModuleMeta[] = [CRM_DASHBOARD, ...CRM_MODULES];
