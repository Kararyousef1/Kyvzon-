/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Platform - نظام الصلاحيات الموحد
 *  ⚠️ هذا هو المصدر الوحيد للصلاحيات في النظام بأكمله!
 *  تم تحديثه ليطابق جميع مسارات App.tsx والشريط الجانبي
 * ════════════════════════════════════════════════════════════════
 */

import type { UserRole } from '../../shared/types';

/** قائمة جميع مفاتيح الصلاحيات المتاحة - محدثة ومطابقة للتطبيق */
export const PERMISSION_KEYS = [
  // ═══════════════ العام ═══════════════
  'dashboard',
  'profile', 
  'notifications',
  'my-notifications',
  
  // ═══════════════ المشاكل ═══════════════
  'problems',           // للموظفين العاديين
  'hr-problems',        // لقسم الموارد البشرية
  'new-problem',        // إنشاء مشكلة جديدة
  
  // ═══════════════ الصحة والعافية ═══════════════
  'wellness',
  'ai-chat',
  'survey',
  'contact',
  
  // ═══════════════ التدريب والتطوير ═══════════════
  'training',
  'employee-goals',     // أهداف ومهارات الموظف
  'manage-training',    // إدارة الدورات (HR/Admin)
  'training-reports',   // تقارير التدريب
  'sops',              // إجراءات العمل للموظفين
  'admin-sops',        // إدارة إجراءات العمل
  'sops-reports',      // تقارير إجراءات العمل
  
  // ═══════════════ الحضور والإجازات ═══════════════
  'my-attendance',         // حضور الموظف الشخصي
  'attendance',            // إدارة حضور جميع الموظفين
  'admin-attendance',      // حضور مستوى إداري متقدم
  'manager-attendance',    // حضور فريق المدير
  'developer-attendance',  // أدوات المطور للحضور
  
  'my-leave-requests',     // طلبات إجازة الموظف
  'leave-requests',        // إدارة طلبات الإجازات
  'employee-permissions',  // زمنيات الموظفين
  'employee-leaves',       // إجازات الموظفين
  
  // ═══════════════ الموارد البشرية ═══════════════
  'movement-analysis',     // تحليل حركة الموظفين
  'analytics',            // التحليلات العامة
  'hr-analytics',         // تحليلات HR متخصصة
  'hr-sentiment',         // تحليل المشاعر
  'hr-predictions',       // التنبؤات
  'team',                 // إدارة الفريق
  'talent-market',        // سجل المؤهلات
  'communication',        // التواصل مع الموظفين
  'hr-communication',     // صندوق بريد HR
  'reports',              // التقارير العامة
  'hr-reports',           // تقارير HR
  'hr-movement-analysis', // تحليل حركة HR
  'hr-ai-insights',       // رؤى الذكاء الاصطناعي
  'hr-contracts',         // عقود الموظفين
  'hr-succession',        // تخطيط التعاقب
  'hr-service-center',    // مركز خدمات HR
  'hr-health-safety',     // الصحة والسلامة المهنية
  // ★ إصلاح 0365: 'hr-disciplinary' كان في الشريط الجانبي
  //   (Sidebar.tsx:398) وفي التوجيه (AppRouter.tsx:1310) وفي
  //   الكتالوج و VIEW_TO_PATH و PORTAL_PAGES — **وغائباً تماماً**
  //   عن PERMISSION_KEYS. الموضع الخامس من السبعة، وهو الذي يُغفَل.
  'hr-disciplinary',      // الإجراءات التأديبية
  
  // ═══════════════ الإشراف ═══════════════
  'supervisor-dashboard',
  'supervisor-breaks',    // إدارة استراحات الفريق
  'supervisor-shift',
  'supervisor-tasks',
  'supervisor-checklists',
  
  // ═══════════════ الإدارة ═══════════════
  'admin-approval-rules',
  'admin-mrp-roles',
  'manager-dashboard',    // لوحة تحكم المدير
  'manager-approvals',
  'manager-performance',
  'manager-workload',
  // وحدات بوابة المدير (0302/0303)
  'manager-unit-movement-approvals',
  'manager-unit-movement-team',
  'supervisor-unit-movement-shift',
  'manager-unit-hr-approvals',
  'manager-unit-finance-approvals',
  'manager-unit-procurement-approvals',
  'manager-unit-inventory-approvals',
  'manager-unit-mrp-approvals',
  'manager-unit-contracts-approvals',
  'manager-unit-crm-approvals',
  'manager-unit-health-safety-approvals',
  'supervisor-unit-hr-approvals',
  'supervisor-unit-inventory-approvals',
  'supervisor-unit-mrp-approvals',
  'supervisor-unit-health-safety-approvals',
  
  // ═══════════════ الحراسة ═══════════════
  'gatekeeper-portal',    // بوابة الحراسة الرئيسية
  'gatekeeper-movements', // بوابة الحركة
  'kiosk-mode',          // وضع الكشك
  'movements',           // حركة الزوار والموظفين
  'hr-movements',        // إدارة الحركة من HR
  'employee-movements',   // حركة الموظفين
  'gatekeeper-page',     // صفحة الحارس
  
  // ═══════════════ الإدارة العليا ═══════════════
  'cms',                     // إدارة المحتوى
  'admin-cms',              // إدارة صفحة الزوار
  'employees',              // إدارة الموظفين
  'admin-employees',        // إدارة متقدمة للموظفين
  'permissions',            // إدارة الصلاحيات
  'admin-permissions',      // شجرة الصلاحيات
  'gatekeeper-permissions', // صلاحيات الحراس
  'admin-gatekeeper-permissions', // إدارة صلاحيات الحراس
  'ai-config',             // إعداد الذكاء الاصطناعي
  'admin-ai-config',       // إدارة إعدادات AI
  'settings',              // إعدادات النظام
  'admin-settings',        // إعدادات إدارية
  'admin-company-profile', // ملف الشركة
  'admin-branches',        // الفروع
  'admin-org-structure',   // الهيكل التنظيمي
  'admin-compliance',      // مركز الامتثال
  'audit-log',             // سجل العمليات
  'admin-audit-log',       // سجل العمليات المتقدم
  'ai-insights-dashboard', // لوحة رؤى AI
  'admin-ai-insights',     // رؤى AI للإدارة
  'admin-reports',         // تقارير إدارية
  'permissions-management', // إدارة صلاحيات متقدمة
  'admin-permissions-management', // إدارة صلاحيات النظام
  
  // ═══════════════ المطور ═══════════════
  'developer-dashboard',   // لوحة تحكم المطور
  'developer-logs',        // سجل أخطاء النظام
  'developer-db',          // إدارة قاعدة البيانات
  'developer-structure',   // هيكلية النظام
  'biometric-settings',    // إعدادات البصمة
  'tech-portal',           // البوابة التقنية
  'tech-audit-trail',      // سجلّ التدقيق الموحّد (0330)
  'tech-error-logs',       // الأخطاء والمهام المجدولة (0330)
  'tech-integrations',     // التكاملات والصادرات (0331)
  'tech-data-exports',     // الصادرات وأحداث الناقلين (0332)
  'tawathul-portal',       // بوابة التواصل
  'tawathul-admin',        // إدارة إعدادات التواصل

  // ═══════════════ التبليغات ═══════════════
  'announcements',          // عرض التبليغات
  'publish-announcements',  // نشر تبليغات

  // ═══════════════ بوابة الحركة واللوجستيات ═══════════════
  // الدور «أ» — حركة الموظفين
  'movement-emp-foundation',
  'movement-emp-permits',
  'movement-emp-execution',
  'movement-emp-visits',
  'movement-emp-missions',
  'movement-emp-compliance',
  'movement-emp-analytics',
  // الدور «ب» — الحركة واللوجستيات
  'movement-log-dashboard',
  'movement-log-fleet',
  'movement-log-drivers',
  'movement-log-maintenance',
  'movement-log-fuel',
  'movement-log-orders',
  'movement-log-routes',
  'movement-log-dispatch',
  'movement-log-tracking',
  'movement-log-track-replay',
  'movement-log-safety',
  'movement-driver-trips',
  'movement-log-epod',
  'movement-log-carriers',
  'movement-log-costs',

] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

/** الصلاحيات الافتراضية لكل دور - محدثة ومطابقة للتطبيق */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  
  // ═══════════════ الموظف العادي ═══════════════
  employee: [
    'dashboard',
    // تطبيق السائق: السائق موظف عادي بلا دور خاص — الحماية في الخادم
    // عبر movement_require_driver الذي يتحقق من ارتباط الحساب بسجل سائق.
    'movement-driver-trips',
    'problems',
    'new-problem',
    'wellness',
    'survey',
    'training',
    'employee-goals',
    'sops',
    'ai-chat',
    'contact',
    'profile',
    'notifications',
    'my-notifications',
    'my-attendance',
    'my-leave-requests',
    'employee-permissions',
    'employee-leaves',
    'tawathul-portal',
    'announcements',
  ],
  
  // ═══════════════ المشرف ═══════════════
  supervisor: [
    // كل صلاحيات الموظف
    'dashboard',
    'problems',
    'new-problem',
    'wellness',
    'survey',
    'training',
    'employee-goals',
    'sops',
    'ai-chat',
    'contact',
    'profile',
    'notifications',
    'my-notifications',
    'my-attendance',
    'my-leave-requests',
    'employee-permissions',
    'employee-leaves',
    
    // صلاحيات إضافية للمشرف
    'supervisor-dashboard',
    'supervisor-breaks',
    'supervisor-shift',
    'supervisor-tasks',
    'supervisor-checklists',
    'supervisor-unit-movement-shift',
    'supervisor-unit-hr-approvals',
    'supervisor-unit-inventory-approvals',
    'supervisor-unit-mrp-approvals',
    'supervisor-unit-health-safety-approvals',
    'team',
    'reports',
    'attendance',
    'leave-requests',
  ],
  
  // ═══════════════ المدير ═══════════════
  manager: [
    // كل صلاحيات المشرف
    'dashboard',
    'problems',
    'new-problem',
    'wellness',
    'survey',
    'training',
    'employee-goals',
    'sops',
    'ai-chat',
    'contact',
    'profile',
    'notifications',
    'my-notifications',
    'my-attendance',
    'my-leave-requests',
    'employee-permissions',
    'employee-leaves',
    'supervisor-dashboard',
    'supervisor-breaks',
    'supervisor-shift',
    'supervisor-tasks',
    'supervisor-checklists',
    'team',
    'reports',
    'attendance',
    'leave-requests',
    
    // صلاحيات إضافية للمدير
    'manager-dashboard',
    'manager-approvals',
    'manager-performance',
    'manager-workload',
    'analytics',
    'manager-attendance',
    'manager-unit-movement-approvals',
    'manager-unit-movement-team',
    'supervisor-unit-movement-shift',
    'manager-unit-hr-approvals',
    'manager-unit-finance-approvals',
    'manager-unit-procurement-approvals',
    'manager-unit-inventory-approvals',
    'manager-unit-mrp-approvals',
    'manager-unit-contracts-approvals',
    'manager-unit-crm-approvals',
    'manager-unit-health-safety-approvals',
    'supervisor-unit-hr-approvals',
    'supervisor-unit-inventory-approvals',
    'supervisor-unit-mrp-approvals',
    'supervisor-unit-health-safety-approvals',
  ],
  
  // ═══════════════ الموارد البشرية ═══════════════
  hr: [
    'dashboard',
    'hr-problems',
    'problems',
    'new-problem',
    'movement-analysis',
    'hr-movement-analysis',
    'analytics',
    'hr-analytics',
    'hr-sentiment',
    'hr-predictions',
    'team',
    'talent-market',
    'communication',
    'hr-communication',
    'reports',
    'hr-reports',
    'notifications',
    'my-notifications',
    'attendance',
    'my-attendance',
    'leave-requests',
    'my-leave-requests',
    'manage-training',
    'training-reports',
    'employee-permissions',
    'employee-leaves',
    'hr-ai-insights',
    'hr-contracts',
    'hr-succession',
    'hr-disciplinary',
    'hr-service-center',
    'hr-health-safety',
    'movements',
    'hr-movements',
    'profile',
    'tawathul-portal',
    'tawathul-admin',
  ],
  
  // ═══════════════ الحارس ═══════════════
  gatekeeper: [
    'gatekeeper-portal',
    'gatekeeper-movements',
    'gatekeeper-page',
    'kiosk-mode',
    'movements',
    'employee-movements',
    'notifications',
    'profile',
  ],
  
  // ═══════════════ مدير النظام ═══════════════
  admin: [
    // صلاحيات HR كاملة
    'dashboard',
    'hr-problems',
    'problems',
    'new-problem',
    'movement-analysis',
    'hr-movement-analysis',
    'analytics',
    'hr-analytics',
    'hr-sentiment',
    'hr-predictions',
    'team',
    'talent-market',
    'communication',
    'hr-communication',
    'reports',
    'hr-reports',
    'admin-reports',
    // ★ إصلاح 2026-08-05: 'admin-approval-rules' كان في PERMISSION_KEYS
    // وفي الشريط الجانبي، لكنه غائب عن كتلة admin — فحجبه
    // hasPermission() وصار عنصر «قواعد الاعتماد» غير مرئي للمدير
    // منذ جولة 0308. أُثبت باستدعاء getEffectivePermissions('admin').
    'admin-approval-rules',
    'admin-mrp-roles',
    'notifications',
    'my-notifications',
    'attendance',
    'admin-attendance',
    'my-attendance',
    'leave-requests',
    'my-leave-requests',
    'manage-training',
    'training-reports',
    'employee-permissions',
    'employee-leaves',
    'hr-ai-insights',
    'hr-contracts',
    'hr-succession',
    'hr-disciplinary',
    'hr-service-center',
    'hr-health-safety',
    'movements',
    'hr-movements',
    
    // صلاحيات إدارية متقدمة
    'cms',
    'admin-cms',
    'employees',
    'admin-employees',
    'permissions',
    'admin-permissions',
    'permissions-management',
    'admin-permissions-management',
    'gatekeeper-permissions',
    'admin-gatekeeper-permissions',
    'settings',
    'admin-settings',
    'admin-company-profile',
    'admin-branches',
    'admin-org-structure',
    'admin-compliance',
    'audit-log',
    'admin-audit-log',
    'sops',
    'admin-sops',
    'sops-reports',
    'ai-config',
    'admin-ai-config',
    'ai-insights-dashboard',
    'admin-ai-insights',
    'developer-db',
    'profile',
  ],
  
  // ═══════════════ المطور ═══════════════
  developer: [
    'developer-dashboard',
    'developer-attendance',
    'developer-logs',
    'developer-structure',
    'developer-db',
    'biometric-settings',
    'notifications',
    'dashboard',
    'attendance',
    'admin-attendance',
    'leave-requests',
    'ai-insights-dashboard',
    'profile',
  ],

  // ═══════════════ تقنية المعلومات ═══════════════
  it_admin: [
    'tech-portal',
    'tech-audit-trail',
    'tech-error-logs',
    'tech-integrations',
    'tech-data-exports',
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
    'attendance',
  ],

  // ═══════════════ تقنية ═══════════════
  tech: [
    'tech-portal',
    'tech-audit-trail',
    'tech-error-logs',
    'tech-integrations',
    'tech-data-exports',
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
  ],

  // ═══════════════ المالية ═══════════════
  finance: [
    'dashboard',
    'reports',
    'notifications',
    'profile',
  ],
  marketing: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
  ],
  sales: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
  ],
  procurement: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
    'reports',
    'team',
    'analytics',
  ],
  inventory: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
    'reports',
    'analytics',
  ],
  manufacturing: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
    'reports',
    'analytics',
  ],

  employee_movement: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
    'movement-emp-foundation',
    'movement-emp-permits',
    'movement-emp-execution',
    'movement-emp-visits',
    'movement-emp-missions',
    'movement-emp-compliance',
    'movement-emp-analytics',
  ],
  logistics: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
    'movement-log-dashboard',
    'movement-log-fleet',
    'movement-log-drivers',
    'movement-log-maintenance',
    'movement-log-fuel',
    'movement-log-orders',
    'movement-log-routes',
    'movement-log-dispatch',
    'movement-log-tracking',
    'movement-log-track-replay',
    'movement-log-safety',
    'movement-driver-trips',
    'movement-log-epod',
    'movement-log-carriers',
    'movement-log-costs',
  ],
  movement_manager: [
    'dashboard',
    'notifications',
    'my-notifications',
    'profile',
    'movement-emp-foundation',
    'movement-emp-permits',
    'movement-emp-execution',
    'movement-emp-visits',
    'movement-emp-missions',
    'movement-emp-compliance',
    'movement-emp-analytics',
    'movement-log-dashboard',
    'movement-log-fleet',
    'movement-log-drivers',
    'movement-log-maintenance',
    'movement-log-fuel',
    'movement-log-orders',
    'movement-log-routes',
    'movement-log-dispatch',
    'movement-log-tracking',
    'movement-log-track-replay',
    'movement-log-safety',
    'movement-driver-trips',
    'movement-log-epod',
    'movement-log-carriers',
    'movement-log-costs',
    'reports',
    'analytics',
  ],
};

/**
 * الحصول على الصلاحيات الافتراضية لدور معيّن (نسخة مرجعية)
 * @param role دور المستخدم
 * @returns مصفوفة الصلاحيات الافتراضية للدور
 */
export function getDefaultPermissions(role: UserRole): PermissionKey[] {
  return DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.employee;
}

/**
 * الحصول على الصلاحيات الفعالة لمستخدم
 * @param role دور المستخدم
 * @param dbPermissions صلاحيات مخصصة من قاعدة البيانات (إن وجدت)
 * @returns الصلاحيات الفعّالة = الصلاحيات الافتراضية + المخصصة (بدون تكرار)
 */
export function getEffectivePermissions(
  role: UserRole,
  dbPermissions?: string[] | null
): string[] {
  const defaults = getDefaultPermissions(role);

  // إذا لم توجد صلاحيات مخصصة، استخدم الافتراضية
  if (!dbPermissions || !Array.isArray(dbPermissions) || dbPermissions.length === 0) {
    return defaults;
  }

  const custom = dbPermissions.filter((perm) => typeof perm === 'string');

  // دمج الافتراضية مع المخصصة مع إزالة التكرار (الافتراضية أولاً)
  const merged: string[] = [...defaults];
  const seen = new Set<string>(defaults);
  for (const perm of custom) {
    if (!seen.has(perm)) {
      merged.push(perm);
      seen.add(perm);
    }
  }

  return merged;
}

/**
 * التحقق من صلاحية محددة لمستخدم
 */
export function hasPermission(
  userPermissions: string[] | undefined | null,
  permissionKey: string
): boolean {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }
  return userPermissions.includes(permissionKey);
}

/**
 * التحقق من تطابق الصلاحيات مع مسارات التطبيق (للتطوير)
 */
export function validatePermissionsSync(): {
  missingInPermissions: string[];
  unusedPermissions: string[];
  isValid: boolean;
} {
  // مسارات App.tsx الفعلية
  const appRoutes = [
    'employee-dashboard', 'hr-dashboard', 'admin-dashboard', 'manager-dashboard', 'developer-dashboard',
    'employee-problems', 'hr-problems', 'new-problem',
    'employee-wellness', 'employee-ai-chat', 'employee-survey', 'employee-training', 'employee-sops',
    'employee-profile', 'employee-contact', 'employee-attendance', 'employee-leave-requests', 'employee-permissions',
    'hr-analytics', 'hr-sentiment', 'hr-predictions', 'hr-team', 'hr-talent-market', 'hr-communication',
    'hr-reports', 'hr-attendance', 'hr-attendance', 'hr-leave-requests', 'hr-movement-analysis', 'hr-manage-training', 'hr-training-reports',
    'gatekeeper-portal', 'kiosk-mode', 'movements', 'hr-movements', 'employee-movements',
    'admin-dashboard', 'admin-cms', 'admin-employees', 'admin-permissions', 'admin-gatekeeper-permissions',
    'admin-reports', 'admin-settings', 'admin-audit-log', 'admin-sops', 'admin-sops-reports',
    'admin-ai-config', 'manager-dashboard', 'manager-attendance', 'supervisor-breaks',
    'developer-dashboard', 'developer-attendance', 'developer-structure',
    'my-notifications', 'notifications'
  ];
  
  // نستخدم Set لتجنب تضارب الأنواع الحرفية من `as const`
  const pkSet = new Set<string>(PERMISSION_KEYS);
  
  const missingInPermissions = appRoutes.filter(route => !pkSet.has(route));
  
  const unusedPermissions: string[] = [];
  for (const perm of PERMISSION_KEYS) {
    if (!(appRoutes as string[]).includes(perm as string)) {
      unusedPermissions.push(perm);
    }
  }
  
  if (process.env.NODE_ENV === 'development') {
    if (missingInPermissions.length > 0) {
      console.warn('❌ Routes missing in PERMISSION_KEYS:', missingInPermissions);
    }
    
    if (unusedPermissions.length > 0) {
      console.warn('⚠️ Unused permissions:', unusedPermissions);
    }
  }
  
  return {
    missingInPermissions,
    unusedPermissions,
    isValid: missingInPermissions.length === 0
  };
}

/**
 * دالة مساعدة للتحقق من الصلاحيات المتقدمة
 */
export function checkAdvancedPermission(
  userRole: UserRole,
  userPermissions: string[],
  requiredPermission: string,
  fallbackRoles?: UserRole[]
): boolean {
  // التحقق من الصلاحية المباشرة
  if (hasPermission(userPermissions, requiredPermission)) {
    return true;
  }
  
  // التحقق من الأدوار البديلة
  if (fallbackRoles && fallbackRoles.includes(userRole)) {
    return true;
  }
  
  return false;
}

/**
 * الحصول على تسمية الصلاحية بالعربية
 */
export function getPermissionLabel(permissionKey: string): string {
  const labels: Record<string, string> = {
    'dashboard': 'لوحة التحكم',
    'problems': 'المشاكل',
    'hr-problems': 'مشاكل الموارد البشرية',
    'wellness': 'الصحة النفسية',
    'ai-chat': 'محادثة الذكاء الاصطناعي',
    'survey': 'الاستبيانات',
    'training': 'التدريب',
    'employee-goals': 'أهدافي ومهاراتي',
    'sops': 'إجراءات العمل',
    'contact': 'التواصل',
    'profile': 'الملف الشخصي',
    'my-attendance': 'حضوري',
    'attendance': 'الحضور',
    'analytics': 'التحليلات',
    'team': 'الفريق',
    'reports': 'التقارير',
    'hr-contracts': 'عقود الموظفين',
    'hr-succession': 'تخطيط التعاقب',
    'hr-disciplinary': 'الإجراءات التأديبية',
    'hr-service-center': 'مركز خدمات HR',
    'hr-health-safety': 'الصحة والسلامة المهنية',
    'admin-approval-rules': 'قواعد الاعتماد',
    'admin-mrp-roles': 'أدوار التصنيع الدقيقة',
    'manager-dashboard': 'لوحة المدير',
    'manager-approvals': 'مركز موافقات المدير',
    'manager-performance': 'أداء الفريق',
    'manager-workload': 'عبء العمل',
    'manager-unit-movement-approvals': 'وحدة الحركة — اعتماد التصاريح',
    'manager-unit-movement-team': 'وحدة الحركة — حركة الفريق',
    'supervisor-unit-movement-shift': 'وحدة الحركة — حركة الوردية',
    'manager-unit-hr-approvals': 'وحدة الموارد البشرية — الاعتماد',
    'manager-unit-finance-approvals': 'وحدة المالية — الاعتماد',
    'manager-unit-procurement-approvals': 'وحدة المشتريات — الاعتماد',
    'manager-unit-inventory-approvals': 'وحدة المخزون — الاعتماد',
    'manager-unit-mrp-approvals': 'وحدة التصنيع — الاعتماد',
    'manager-unit-contracts-approvals': 'وحدة العقود — الاعتماد',
    'manager-unit-crm-approvals': 'وحدة المبيعات — الاعتماد',
    'manager-unit-health-safety-approvals': 'وحدة الصحة والسلامة — الاعتماد',
    'supervisor-unit-hr-approvals': 'وحدة الموارد البشرية — المتابعة',
    'supervisor-unit-inventory-approvals': 'وحدة المخزون — المتابعة',
    'supervisor-unit-mrp-approvals': 'وحدة التصنيع — المتابعة',
    'supervisor-unit-health-safety-approvals': 'وحدة الصحة والسلامة — المتابعة',
    'supervisor-dashboard': 'لوحة المشرف',
    'supervisor-breaks': 'تصاريح الاستراحة',
    'supervisor-shift': 'إدارة الوردية',
    'supervisor-tasks': 'مهام الفريق',
    'supervisor-checklists': 'قوائم الفحص',
    'gatekeeper-portal': 'بوابة الحراسة',
    'gatekeeper-movements': 'بوابة الحركة',
    'admin-employees': 'إدارة الموظفين',
    'settings': 'الإعدادات',
    'admin-company-profile': 'ملف الشركة',
    'admin-branches': 'الفروع',
    'admin-org-structure': 'الهيكل التنظيمي',
    'admin-compliance': 'مركز الامتثال',
    // يمكن إضافة المزيد حسب الحاجة
  };
  
  return labels[permissionKey] || permissionKey;
}

/**
 * تجميع الصلاحيات حسب الفئة
 */
export function groupPermissionsByCategory(permissions: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    'عام': [],
    'الموظف': [],
    'الموارد البشرية': [],
    'الإدارة': [],
    'الحراسة': [],
    'المطور': [],
    'أخرى': []
  };
  
  permissions.forEach(perm => {
    if (perm.startsWith('hr-')) {
      categories['الموارد البشرية'].push(perm);
    } else if (perm.startsWith('admin-')) {
      categories['الإدارة'].push(perm);
    } else if (perm.startsWith('developer-')) {
      categories['المطور'].push(perm);
    } else if (perm.startsWith('gatekeeper-') || perm.includes('movement')) {
      categories['الحراسة'].push(perm);
    } else if (['dashboard', 'profile', 'notifications'].includes(perm)) {
      categories['عام'].push(perm);
    } else if (perm.startsWith('employee-') || perm.startsWith('my-')) {
      categories['الموظف'].push(perm);
    } else {
      categories['أخرى'].push(perm);
    }
  });
  
  // إزالة الفئات الفارغة
  Object.keys(categories).forEach(key => {
    if (categories[key].length === 0) {
      delete categories[key];
    }
  });
  
  return categories;
}