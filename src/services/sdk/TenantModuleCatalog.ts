export type ModuleKey = 'finance' | 'employee' | 'hr' | 'admin' | 'manager' | 'supervisor' | 'gatekeeper' | 'movement' | 'tawathul' | 'tech_portal' | 'ai' | 'reports' | 'health_safety' | 'succession' | 'contracts' | 'marketing' | 'crm';

export type ModuleStatus = 'planned' | 'in_build' | 'beta' | 'production';
export type ModuleCategory = 'core' | 'people' | 'operations' | 'platform' | 'advanced';

export interface ModuleCatalogItem {
  key: ModuleKey;
  label: string;
  description: string;
  category: ModuleCategory;
  minPlan: 'basic' | 'professional' | 'enterprise' | 'custom';
  status: ModuleStatus;
  wave?: number;
  docsUrl?: string;
  doD?: string[];
}

export interface PlanLimits {
  maxEmployees: number;
  maxBranches: number;
  maxBiometricDevices: number;
  storageGb: number;
  supportLevel: 'standard' | 'priority' | 'dedicated';
}

// Definition of Done reference for finance
const FINANCE_DOD = [
  'typed SDK',
  'migration + RLS + cross-tenant tests',
  'CRUD حقيقي (لا mock)',
  'RPC ذرية للتحويلات المالية',
  'audit immutable',
  'unit + integration + E2E',
  'idempotency + concurrency',
  'تقرير reconciliation',
];

export const MODULE_CATALOG: ModuleCatalogItem[] = [
  // core — production ready
  { key: 'employee', label: 'بوابة الموظف', description: 'الخدمة الذاتية، الحضور، الطلبات، الرواتب الشخصية', category: 'core', minPlan: 'basic', status: 'production', wave: 1 },
  { key: 'hr', label: 'بوابة الموارد البشرية', description: 'إدارة الموظفين، الحضور، الرواتب، التوظيف والتدريب', category: 'people', minPlan: 'basic', status: 'production', wave: 1 },
  { key: 'admin', label: 'بوابة الإدارة', description: 'الإعدادات، الصلاحيات، الحوكمة، الفروع والامتثال', category: 'platform', minPlan: 'professional', status: 'production', wave: 1 },
  { key: 'manager', label: 'بوابة المدير', description: 'الموافقات، أداء الفريق، عبء العمل', category: 'people', minPlan: 'professional', status: 'production', wave: 1 },
  { key: 'supervisor', label: 'بوابة المشرف', description: 'الوردية، مهام الفريق، قوائم الفحص، الاستراحات', category: 'operations', minPlan: 'professional', status: 'production', wave: 1 },
  { key: 'gatekeeper', label: 'بوابة الحراسة', description: 'الزوار، جلسات الحراسة، الدخول والخروج', category: 'operations', minPlan: 'professional', status: 'beta', wave: 2 },
  { key: 'movement', label: 'بوابة الحركة', description: 'حركة الموظفين، التصاريح، مخالفات المسار', category: 'operations', minPlan: 'professional', status: 'beta', wave: 2 },
  { key: 'tawathul', label: 'بوابة التواصل', description: 'المحادثات، القنوات، التعاون المؤسسي', category: 'people', minPlan: 'professional', status: 'beta', wave: 2 },
  { key: 'tech_portal', label: 'البوابة التقنية', description: 'أجهزة البصمة، المزامنة، الصحة التقنية', category: 'platform', minPlan: 'enterprise', status: 'beta', wave: 2 },
  { key: 'ai', label: 'الذكاء الاصطناعي', description: 'المساعد الذكي، التحليلات والرؤى — عبر Edge Function ai-chat', category: 'advanced', minPlan: 'enterprise', status: 'beta', wave: 2 },
  { key: 'reports', label: 'التقارير المتقدمة', description: 'تصدير وتحليلات وتقارير تنفيذية', category: 'advanced', minPlan: 'professional', status: 'production', wave: 1 },
  { key: 'health_safety', label: 'الصحة والسلامة', description: 'حوادث السلامة والإجراءات التصحيحية', category: 'advanced', minPlan: 'enterprise', status: 'beta', wave: 2 },
  { key: 'succession', label: 'تخطيط التعاقب', description: 'المناصب الحرجة والمرشحون والخطط التطويرية', category: 'advanced', minPlan: 'enterprise', status: 'beta', wave: 2 },
  { key: 'contracts', label: 'عقود الموظفين', description: 'عقود العمل والتنبيهات والتجديد', category: 'advanced', minPlan: 'professional', status: 'production', wave: 1 },
  { key: 'marketing', label: 'بوابة التسويق', description: 'أتمتة التسويق، البريد، وسائل التواصل، SMS/واتساب، الفعاليات، الاستبيانات، ونظام المناعة العلائقية', category: 'advanced', minPlan: 'professional', status: 'beta', wave: 2 },
  { key: 'crm', label: 'بوابة CRM', description: 'إدارة جهات الاتصال والحسابات، خط الأنابيب والصفقات، الأنشطة والأتمتة، العروض والعقود، الدعم والتذاكر، والتحليلات والتنبؤ', category: 'advanced', minPlan: 'professional', status: 'beta', wave: 2 },
  // finance — wave breakdown per FINANCE_REMEDIATION_EXECUTION_PLAN
  { 
    key: 'finance', 
    label: 'بوابة المالية', 
    description: 'IFRS-ready: دليل حسابات، GL ذري، AP/AR، بنوك، موازنات، ضرائب config، أصول، توحيد. بعض الوحدات beta/planned حسب Wave.', 
    category: 'core', 
    minPlan: 'basic', 
    status: 'beta', 
    wave: 1,
    doD: FINANCE_DOD,
    docsUrl: '/docs/finance/FINANCE_MODULE_SPEC.md'
  },
];

// التفصيل الدقيق للوحدات المالية الداخلية — للشفافية ومنع التضليل
export type FinanceSubModuleKey = 
  | 'finance_setup'
  | 'chart_of_accounts'
  | 'journal_entries'
  | 'general_ledger'
  | 'trial_balance'
  | 'financial_reports'
  | 'ap_aging'
  | 'accounts_payable'
  | 'vendors'
  | 'vendor_payments'
  | 'accounts_receivable'
  | 'budget'
  | 'cash_management'
  | 'tax_management'
  | 'bank_import'
  | 'cash_forecast'
  | 'fixed_assets'
  | 'intercompany'
  | 'multi_entity'
  | 'project_accounting'
  | 'variance'
  | 'revenue_recognition'
  | 'system_notes'
  | 'approvals';

export const FINANCE_SUBMODULES: Record<FinanceSubModuleKey, { label: string, status: ModuleStatus, wave: number, description: string }> = {
  finance_setup: { label: 'إعداد المالية', status: 'production', wave: 1, description: 'legal_entities, fiscal_years, accounting_periods, currencies — مكتمل مع RLS' },
  chart_of_accounts: { label: 'دليل الحسابات', status: 'production', wave: 2, description: 'IFRS tree، archive، hierarchy — مكتمل' },
  journal_entries: { label: 'قيود اليومية', status: 'production', wave: 2, description: 'draft → post via RPC ذرية، reversal' },
  general_ledger: { label: 'دفتر الأستاذ', status: 'production', wave: 2, description: 'GL من قيود مرحلة فقط' },
  trial_balance: { label: 'ميزان المراجعة', status: 'production', wave: 2, description: 'محسوب من GL' },
  financial_reports: { label: 'التقارير المالية', status: 'beta', wave: 2, description: 'P&L و BS أساسية، تحتاج AP/AR' },
  ap_aging: { label: 'أعمار الذمم', status: 'beta', wave: 4, description: 'AP aging RPC حقيقي' },
  accounts_payable: { label: 'الذمم الدائنة', status: 'beta', wave: 4, description: 'AP invoices + posting' },
  vendors: { label: 'الموردون', status: 'beta', wave: 4, description: 'Vendors master' },
  vendor_payments: { label: 'دفعات الموردين', status: 'beta', wave: 4, description: 'Payments + allocations + post' },
  accounts_receivable: { label: 'حسابات العملاء', status: 'beta', wave: 4, description: 'AR + customers — تم تحويله من planned إلى beta حقيقي — Wave 4' },
  budget: { label: 'الموازنات', status: 'beta', wave: 6, description: 'Budget versions — تم تحويله إلى beta حقيقي — Wave 6' },
  cash_management: { label: 'إدارة النقد', status: 'beta', wave: 5, description: 'Bank accounts + reconciliation — تم تحويله إلى beta — Wave 5' },
  tax_management: { label: 'الضرائب', status: 'beta', wave: 6, description: 'Tax config عراقي — لا حساب مفترض — تم تحويله إلى beta — Wave 6' },
  bank_import: { label: 'استيراد بنكي', status: 'beta', wave: 5, description: 'CSV import idempotent — تم تحويله إلى beta — Wave 5' },
  cash_forecast: { label: 'التنبؤ النقدي', status: 'beta', wave: 5, description: 'من AP/AR حقيقي فقط — تم تحويله من planned إلى beta — Wave 5' },
  fixed_assets: { label: 'الأصول الثابتة', status: 'beta', wave: 6, description: 'Depreciation — تم تحويله من planned إلى beta — Wave 6' },
  intercompany: { label: 'المعاملات البينية', status: 'beta', wave: 3, description: 'Due-to/due-from + eliminations — تم تحويله من planned إلى beta — Wave 3' },
  multi_entity: { label: 'الكيانات المتعددة', status: 'beta', wave: 3, description: 'Consolidation — تم تحويله من planned إلى beta — Wave 3' },
  project_accounting: { label: 'محاسبة المشاريع', status: 'beta', wave: 3, description: 'Cost centers + projects — تم تحويله من planned إلى beta — Wave 3' },
  variance: { label: 'تحليل التباين المتقدم', status: 'beta', wave: 6, description: 'Advanced variance — تم تحويله من planned إلى beta — Wave 6' },
  revenue_recognition: { label: 'الاعتراف بالإيرادات', status: 'beta', wave: 3, description: 'IFRS 15 — تم تحويله من in_build إلى beta — Wave 3' },
  system_notes: { label: 'ملاحظات النظام المالية', status: 'beta', wave: 2, description: 'Immutable notes — تم تحويله من in_build إلى beta — Wave 2' },
  approvals: { label: 'اعتمادات مالية', status: 'beta', wave: 2, description: 'مصفوفة منفصلة عن HR — beta' },
};

export const PLAN_ALLOWED_MODULES: Record<string, ModuleKey[]> = {
  basic: ['employee', 'hr', 'finance'],
  professional: ['employee', 'hr', 'admin', 'finance', 'manager', 'supervisor', 'gatekeeper', 'movement', 'tawathul', 'reports', 'contracts', 'marketing', 'crm'],
  enterprise: ['employee', 'hr', 'finance', ...MODULE_CATALOG.map(m => m.key)],
  custom: MODULE_CATALOG.map(m => m.key),
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  basic: { maxEmployees: 50, maxBranches: 1, maxBiometricDevices: 1, storageGb: 5, supportLevel: 'standard' },
  professional: { maxEmployees: 250, maxBranches: 5, maxBiometricDevices: 5, storageGb: 50, supportLevel: 'priority' },
  enterprise: { maxEmployees: 2000, maxBranches: 50, maxBiometricDevices: 50, storageGb: 500, supportLevel: 'dedicated' },
  custom: { maxEmployees: 999999, maxBranches: 999999, maxBiometricDevices: 999999, storageGb: 999999, supportLevel: 'dedicated' },
};

export function modulesForPlan(plan?: string): ModuleKey[] {
  return PLAN_ALLOWED_MODULES[plan || 'basic'] || PLAN_ALLOWED_MODULES.basic;
}

export function isModuleAllowedForPlan(moduleKey: string, plan?: string): boolean {
  return modulesForPlan(plan).includes(moduleKey as ModuleKey);
}

export function planLimitsForPlan(plan?: string): PlanLimits {
  return PLAN_LIMITS[plan || 'basic'] || PLAN_LIMITS.basic;
}

export function getModuleStatus(key: ModuleKey): ModuleStatus {
  return MODULE_CATALOG.find(m => m.key === key)?.status || 'planned';
}

export function isModuleProductionReady(key: ModuleKey): boolean {
  const status = getModuleStatus(key);
  return status === 'production' || status === 'beta';
}

export function financeSubModuleStatus(subKey: FinanceSubModuleKey): { status: ModuleStatus, wave: number } {
  const sub = FINANCE_SUBMODULES[subKey];
  return sub ? { status: sub.status, wave: sub.wave } : { status: 'planned', wave: 6 };
}
