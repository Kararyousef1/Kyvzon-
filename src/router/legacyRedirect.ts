/**
 * ═════════════════════════════════════════════════════════════════════════
 *  Legacy view → URL path mapping
 *
 *  الغرض: التوافق العكسي — أي مستخدم عنده bookmark لـ ?view=xxx القديم
 *  يجب أن يُوجَّه للمسار الجديد بدون كسر تجربته.
 * ═════════════════════════════════════════════════════════════════════════
 */

export const VIEW_TO_PATH: Record<string, string> = {
  // Notifications
  'notifications':                '/app/notifications',
  'my-notifications':             '/app/my-notifications',

  // Employee
  'employee-dashboard':           '/app/employee',
  'employee-problems':            '/app/employee/problems',
  'new-problem':                  '/app/employee/problems/new',
  'employee-wellness':            '/app/employee/wellness',
  'employee-ai-chat':             '/app/employee/ai-chat',
  'employee-survey':              '/app/employee/survey',
  'employee-training':            '/app/employee/training',
  'employee-goals':               '/app/employee/goals',
  'employee-sops':                '/app/employee/sops',
  'employee-profile':             '/app/employee/profile',
  'employee-contact':             '/app/employee/contact',
  'employee-attendance':          '/app/employee/attendance',
  'employee-requests':            '/app/employee/leave-requests',
  'employee-leave-requests':      '/app/employee/leave-requests',
  'employee-permissions':         '/app/employee/permissions',
  'employee-payroll':             '/app/employee/payroll',
  'employee-loans':               '/app/employee/loans',
  'employee-expenses':            '/app/employee/expenses',
  'employee-ai-insights':         '/app/employee/insights',
  'insights':                     '/app/insights',

  // Kiosk
  'kiosk-mode':                   '/app/kiosk',

  // Manager
  'manager-dashboard':            '/app/manager',
  'manager-attendance':           '/app/manager/attendance',
  'manager-approvals':            '/app/manager/approvals',
  'manager-performance':          '/app/manager/performance',
  'manager-workload':             '/app/manager/workload',
  'manager-leave-requests':       '/app/employee/leave-requests',

  // Supervisor
  'supervisor-dashboard':         '/app/supervisor',
  'supervisor-breaks':            '/app/supervisor/breaks',
  'supervisor-shift':             '/app/supervisor/shift',
  'supervisor-tasks':             '/app/supervisor/tasks',
  'supervisor-checklists':        '/app/supervisor/checklists',
  'supervisor-leave-requests':    '/app/employee/leave-requests',

  // HR
  'hr-dashboard':                 '/app/hr',
  'hr-problems':                  '/app/hr/problems',
  'hr-analytics':                 '/app/hr/analytics',
  'hr-sentiment':                 '/app/hr/analytics',
  'hr-predictions':               '/app/hr/analytics',
  'hr-team':                      '/app/hr/team',
  'hr-reports':                   '/app/hr/reports',
  'hr-attendance':                '/app/hr/attendance',
  'hr-talent-market':             '/app/hr/talent-market',
  'hr-movement-analysis':         '/app/hr/movement-analysis',
  'hr-manage-training':           '/app/hr/training/manage',
  'hr-training-reports':          '/app/hr/training/reports',
  'hr-payroll':                   '/app/hr/payroll',
  'hr-loans':                     '/app/hr/loans',
  'hr-bonuses':                   '/app/hr/bonuses',
  'hr-expenses':                  '/app/hr/expenses',
  'hr-recruitment':               '/app/hr/recruitment',
  'hr-onboarding':                '/app/hr/onboarding',
  'hr-documents':                 '/app/hr/documents',
  'hr-contracts':                 '/app/hr/contracts',
  'hr-succession':                '/app/hr/succession',
  'hr-performance':               '/app/hr/performance',
  'hr-disciplinary':              '/app/hr/disciplinary',
  'hr-shifts':                    '/app/hr/shifts',
  'hr-communication':             '/app/hr/communication',
  'hr-service-center':            '/app/hr/service-center',
  'hr-health-safety':             '/app/hr/health-safety',
  'hr-leave-requests':            '/app/hr/leave-requests',
  'hr-sops':                      '/app/hr/sops',
  'hr-manage-surveys':            '/app/employee/survey',
  'hr-ai-insights':               '/app/insights',

  // Admin
  'admin-dashboard':              '/app/admin',
  'admin-employees':              '/app/admin/employees',
  'admin-permissions':            '/app/admin/permissions',
  'admin-permissions-management': '/app/admin/permissions-management',
  'admin-audit-log':              '/app/admin/audit-log',
  'admin-settings':               '/app/admin/settings',
  'admin-company-profile':       '/app/admin/company-profile',
  'admin-branches':              '/app/admin/branches',
  'admin-org-structure':         '/app/admin/org-structure',
  'admin-compliance':            '/app/admin/compliance',
  'admin-ai-config':              '/app/admin/ai-config',
  'admin-cms':                    '/app/admin/cms',
  'admin-gatekeeper-permissions': '/app/admin/gatekeeper-permissions',
  'admin-sops':                   '/app/admin/sops',
  'admin-sops-reports':           '/app/admin/sops-reports',
  'admin-attendance':             '/app/hr/attendance',
  'admin-reports':                '/app/hr/reports',

  // Other portals
  'gatekeeper-portal':            '/app/gatekeeper',
  'gatekeeper-movements':         '/app/gatekeeper/movements',
  'movement-portal':              '/app/gatekeeper/movements',
  'tech-portal':                  '/app/tech-portal',
  'tech-dashboard':               '/app/tech-portal/dashboard',
  'biometric-devices':            '/app/tech-portal/biometric',
  'sync-logs':                    '/app/tech-portal/sync-logs',
  'attendance-analytics':         '/app/tech-portal/attendance-analytics',
  'system-health':                '/app/tech-portal/system-health',
  'security-events':              '/app/tech-portal/security-events',
  'tech-settings':                '/app/tech-portal/settings',
  'tawathul-portal':              '/app/tawathul',
  'tawathul-admin':               '/app/tawathul/admin',
  'developer-dashboard':          '/dev',

  // Finance Portal
  'finance-dashboard':            '/app/finance',
  'finance-coa':                  '/app/finance/chart-of-accounts',
  'finance-journal':              '/app/finance/journal-entries',
  'finance-trial-balance':        '/app/finance/trial-balance',
  'finance-ledger':               '/app/finance/general-ledger',
  'finance-reports':              '/app/finance/financial-reports',
  'finance-periods':              '/app/finance/accounting-periods',
  'finance-vendors':              '/app/finance/vendors',
  'finance-payable':              '/app/finance/accounts-payable',
  'finance-setup':                '/app/finance/setup',

  // Procurement Portal
  'procurement-dashboard':        '/app/procurement',
  'procurement-pr':               '/app/procurement/requisitions',
  'procurement-suppliers':        '/app/procurement/suppliers',
  'procurement-sourcing':         '/app/procurement/sourcing',
  'procurement-orders':           '/app/procurement/orders',
  'procurement-gr':               '/app/procurement/orders/goods-receipts',
  'procurement-invoices':         '/app/procurement/invoices',
  'procurement-contracts':        '/app/procurement/contracts',
  'procurement-analytics':        '/app/procurement/analytics',
};

/**
 * محاولة تحويل view قديم إلى المسار الجديد.
 * يعيد null إن كان view غير معروف.
 */
export function legacyViewToPath(view: string | null | undefined): string | null {
  if (!view) return null;
  return VIEW_TO_PATH[view] ?? null;
}
