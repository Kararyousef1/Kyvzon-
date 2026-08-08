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
  manufacturing: '/app/mrp',

  // بوابة الحركة واللوجستيات (0270–0311).
  //
  // ★ إصلاح حلقة إعادة توجيه لا نهائية (اكتُشفت 2026-08-05):
  //   قبل هذه الأسطر كانت الأدوار الثلاثة غائبة عن الجدول، فيقع:
  //     1. getDefaultPathForRole('movement_manager') → لا مفتاح → '/app/employee'
  //     2. AppRouter: <Route path="employee" roles={['employee','supervisor','manager']}>
  //     3. RequireRole: الدور ليس في القائمة → Navigate(getDefaultPathForRole(...))
  //     4. → '/app/employee' → عُد إلى 2 … حلقة لا تنتهي.
  //   ويقع المسار نفسه من RoleRedirect عند فتح /app، ومن LoginPage بعد
  //   تسجيل الدخول بلا ?redirect=.
  //
  //   لم يكشفه اختبار constants.test.ts لأنه كان يفحص ثمانية أدوار مكتوبة
  //   يدوياً بدل اشتقاق القائمة من UserRole — وقد صُحّح ليشتقّها.
  //
  //   الوجهة /app/movement وليست صفحة بعينها: MovementRoleRedirect يوزّع
  //   حسب الدور النشط فعلياً (employee/permits أو logistics/dashboard).
  employee_movement: '/app/movement',
  logistics: '/app/movement',
  movement_manager: '/app/movement',
};

/** الحصول على المسار الافتراضي لدور */
export function getDefaultPathForRole(role: string | undefined): string {
  if (!role) return '/app/employee';
  return ROLE_DEFAULT_PATH[role] ?? '/app/employee';
}
