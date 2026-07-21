/**
 * ═════════════════════════════════════════════════════════════════════════
 *  marketingCatalog.ts — كتالوج وحدات بوابة التسويق
 *
 *  بوابة التسويق تتكوّن من 7 وحدات (حسب التقارير في src/pages/marketing/*.md):
 *    1) أتمتة التسويق      2) البريد الإلكتروني   3) وسائل التواصل
 *    4) SMS/واتساب         5) الفعاليات           6) الاستبيانات
 *    7) نظام المناعة العلائقية
 *
 *  كل وحدة لها: id, label, وصف, أيقونة, مسار, حالة (متاحة الآن / قريباً).
 *  تُبنى الوحدات تدريجياً حسب ترتيب التقارير — لذا نميّز الجاهز عن القادم.
 * ═════════════════════════════════════════════════════════════════════════
 */

import {
  Workflow, Mail, Share2, MessageSquare, CalendarDays, ClipboardList, ShieldCheck,
  LayoutDashboard, type LucideIcon,
} from 'lucide-react';

export type MarketingModuleStatus = 'available' | 'coming_soon';

export interface MarketingModuleMeta {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  path: string;
  /** رقم التقرير المرجعي في src/pages/marketing/ */
  report: number;
  status: MarketingModuleStatus;
}

export const MARKETING_BASE = '/app/marketing';

/** لوحة البوابة الرئيسية */
export const MARKETING_DASHBOARD: MarketingModuleMeta = {
  id: 'marketing-dashboard',
  label: 'لوحة التسويق',
  description: 'نظرة عامة على أداء التسويق عبر كل الوحدات',
  icon: LayoutDashboard,
  path: `${MARKETING_BASE}`,
  report: 0,
  status: 'available',
};

/** الوحدات السبع بترتيب التقارير */
export const MARKETING_MODULES: MarketingModuleMeta[] = [
  {
    id: 'marketing-automation',
    label: 'أتمتة التسويق',
    description: 'رحلات العميل، المحفزات، وتقييم العملاء (Lead Scoring)',
    icon: Workflow,
    path: `${MARKETING_BASE}/automation`,
    report: 1,
    status: 'available',
  },
  {
    id: 'marketing-email',
    label: 'البريد الإلكتروني',
    description: 'الحملات، القوائم، التخصيص، واختبارات A/B',
    icon: Mail,
    path: `${MARKETING_BASE}/email`,
    report: 2,
    status: 'available',
  },
  {
    id: 'marketing-social',
    label: 'وسائل التواصل',
    description: 'إدارة الحسابات، الجدولة، والاستماع الاجتماعي',
    icon: Share2,
    path: `${MARKETING_BASE}/social`,
    report: 3,
    status: 'available',
  },
  {
    id: 'marketing-messaging',
    label: 'SMS / واتساب',
    description: 'الرسائل النصية وقوالب واتساب المعتمدة',
    icon: MessageSquare,
    path: `${MARKETING_BASE}/messaging`,
    report: 4,
    status: 'available',
  },
  {
    id: 'marketing-events',
    label: 'الفعاليات',
    description: 'التسجيل، التذاكر، QR، وتسجيل الحضور',
    icon: CalendarDays,
    path: `${MARKETING_BASE}/events`,
    report: 5,
    status: 'available',
  },
  {
    id: 'marketing-surveys',
    label: 'الاستبيانات',
    description: 'NPS/CSAT/CES، القوالب، وإغلاق الحلقة',
    icon: ClipboardList,
    path: `${MARKETING_BASE}/surveys`,
    report: 6,
    status: 'available',
  },
  {
    id: 'marketing-immune',
    label: 'المناعة العلائقية',
    description: 'رصيد العلاقة، الحوكمة اللحظية، والوعي الثقافي',
    icon: ShieldCheck,
    path: `${MARKETING_BASE}/immune-system`,
    report: 7,
    status: 'available',
  },
];

/** كل عناصر التنقل (اللوحة + الوحدات) */
export const MARKETING_NAV: MarketingModuleMeta[] = [MARKETING_DASHBOARD, ...MARKETING_MODULES];
