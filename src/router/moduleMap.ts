/**
 * خريطة ربط مسارات التطبيق بمفاتيح البوابات/الموديلات في tenant_modules.
 */

export const ROUTE_MODULE_MAP: Array<{ pathPrefix: string; moduleKey: string; label: string }> = [
  { pathPrefix: '/app/finance', moduleKey: 'finance', label: 'البوابة المالية' },
  { pathPrefix: '/app/employee', moduleKey: 'employee', label: 'بوابة الموظف' },
  { pathPrefix: '/app/hr/contracts', moduleKey: 'contracts', label: 'عقود الموظفين' },
  { pathPrefix: '/app/hr/succession', moduleKey: 'succession', label: 'تخطيط التعاقب' },
  { pathPrefix: '/app/hr/health-safety', moduleKey: 'health_safety', label: 'الصحة والسلامة' },
  { pathPrefix: '/app/hr', moduleKey: 'hr', label: 'بوابة الموارد البشرية' },
  { pathPrefix: '/app/admin', moduleKey: 'admin', label: 'بوابة الإدارة' },
  { pathPrefix: '/app/manager', moduleKey: 'manager', label: 'بوابة المدير' },
  { pathPrefix: '/app/supervisor', moduleKey: 'supervisor', label: 'بوابة المشرف' },
  { pathPrefix: '/app/gatekeeper/movements', moduleKey: 'movement', label: 'بوابة الحركة' },
  { pathPrefix: '/app/gatekeeper', moduleKey: 'gatekeeper', label: 'بوابة الحراسة' },
  { pathPrefix: '/app/tawathul', moduleKey: 'tawathul', label: 'بوابة التواصل' },
  { pathPrefix: '/app/tech-portal', moduleKey: 'tech_portal', label: 'البوابة التقنية' },
  { pathPrefix: '/app/marketing', moduleKey: 'marketing', label: 'بوابة التسويق' },
  { pathPrefix: '/app/crm', moduleKey: 'crm', label: 'بوابة CRM' },
  { pathPrefix: '/app/procurement', moduleKey: 'procurement', label: 'بوابة المشتريات' },
  { pathPrefix: '/app/inventory', moduleKey: 'inventory', label: 'بوابة المخزون والمستودعات' },
  { pathPrefix: '/app/mrp', moduleKey: 'mrp', label: 'بوابة التصنيع MRP' },
  { pathPrefix: '/app/insights', moduleKey: 'ai', label: 'رؤى الذكاء الاصطناعي' },
];

export function getModuleForPath(pathname: string): { moduleKey: string; label: string } | null {
  const match = ROUTE_MODULE_MAP
    .filter(item => pathname === item.pathPrefix || pathname.startsWith(item.pathPrefix + '/'))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)[0];
  return match ? { moduleKey: match.moduleKey, label: match.label } : null;
}
