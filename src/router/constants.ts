/**
 * ═════════════════════════════════════════════════════════════════════════
 *  Router Constants — مصدر الحقيقة للأدوار والمسارات الافتراضية
 * ═════════════════════════════════════════════════════════════════════════
 */

/** المسار الافتراضي لكل دور — يُستخدم في RoleRedirect و بعد Login */
export const ROLE_DEFAULT_PATH: Record<string, string> = {
  developer:  '/dev',
  hr:         '/app/hr',
  admin:      '/app/admin',
  employee:   '/app/employee',
  gatekeeper: '/app/gatekeeper',
  supervisor: '/app/supervisor',
  manager:    '/app/manager',
  it_admin:   '/app/tech-portal',
  tech:       '/app/tech-portal',
  finance:    '/app/finance',
  marketing:  '/app/marketing',
  sales:      '/app/crm',
  procurement: '/app/procurement',
  inventory: '/app/inventory',
};

/** الحصول على المسار الافتراضي لدور */
export function getDefaultPathForRole(role: string | undefined): string {
  if (!role) return '/app/employee';
  return ROLE_DEFAULT_PATH[role] ?? '/app/employee';
}
