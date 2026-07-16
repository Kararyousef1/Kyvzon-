export type ModuleKey =
  | 'employee'
  | 'hr'
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'gatekeeper'
  | 'movement'
  | 'tawathul'
  | 'tech_portal'
  | 'ai'
  | 'reports'
  | 'health_safety'
  | 'succession'
  | 'contracts';

export interface ModuleCatalogItem {
  key: ModuleKey;
  label: string;
  description: string;
  category: 'core' | 'people' | 'operations' | 'platform' | 'advanced';
  minPlan: 'basic' | 'professional' | 'enterprise' | 'custom';
}

export interface PlanLimits {
  maxEmployees: number;
  maxBranches: number;
  maxBiometricDevices: number;
  storageGb: number;
  supportLevel: 'standard' | 'priority' | 'dedicated';
}

export const MODULE_CATALOG: ModuleCatalogItem[] = [
  { key: 'employee', label: 'بوابة الموظف', description: 'الخدمة الذاتية، الحضور، الطلبات، الرواتب الشخصية', category: 'core', minPlan: 'basic' },
  { key: 'hr', label: 'بوابة الموارد البشرية', description: 'إدارة الموظفين، الحضور، الرواتب، التوظيف والتدريب', category: 'people', minPlan: 'basic' },
  { key: 'admin', label: 'بوابة الإدارة', description: 'الإعدادات، الصلاحيات، الحوكمة، الفروع والامتثال', category: 'platform', minPlan: 'professional' },
  { key: 'manager', label: 'بوابة المدير', description: 'الموافقات، أداء الفريق، عبء العمل', category: 'people', minPlan: 'professional' },
  { key: 'supervisor', label: 'بوابة المشرف', description: 'الوردية، مهام الفريق، قوائم الفحص، الاستراحات', category: 'operations', minPlan: 'professional' },
  { key: 'gatekeeper', label: 'بوابة الحراسة', description: 'الزوار، جلسات الحراسة، الدخول والخروج', category: 'operations', minPlan: 'professional' },
  { key: 'movement', label: 'بوابة الحركة', description: 'حركة الموظفين، التصاريح، مخالفات المسار', category: 'operations', minPlan: 'professional' },
  { key: 'tawathul', label: 'بوابة التواصل', description: 'المحادثات، القنوات، التعاون المؤسسي', category: 'people', minPlan: 'professional' },
  { key: 'tech_portal', label: 'البوابة التقنية', description: 'أجهزة البصمة، المزامنة، الصحة التقنية', category: 'platform', minPlan: 'enterprise' },
  { key: 'ai', label: 'الذكاء الاصطناعي', description: 'المساعد الذكي، التحليلات والرؤى', category: 'advanced', minPlan: 'enterprise' },
  { key: 'reports', label: 'التقارير المتقدمة', description: 'تصدير وتحليلات وتقارير تنفيذية', category: 'advanced', minPlan: 'professional' },
  { key: 'health_safety', label: 'الصحة والسلامة', description: 'حوادث السلامة والإجراءات التصحيحية', category: 'advanced', minPlan: 'enterprise' },
  { key: 'succession', label: 'تخطيط التعاقب', description: 'المناصب الحرجة والمرشحون والخطط التطويرية', category: 'advanced', minPlan: 'enterprise' },
  { key: 'contracts', label: 'عقود الموظفين', description: 'عقود العمل والتنبيهات والتجديد', category: 'advanced', minPlan: 'professional' },
];

export const PLAN_ALLOWED_MODULES: Record<string, ModuleKey[]> = {
  basic: ['employee', 'hr'],
  professional: ['employee', 'hr', 'admin', 'manager', 'supervisor', 'gatekeeper', 'movement', 'tawathul', 'reports', 'contracts'],
  enterprise: MODULE_CATALOG.map(m => m.key),
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
