/**
 * portalUnits.ts — كتالوج وحدات بوابتَي المدير والمشرف
 *
 * ═════════════════════════════════════════════════════════════════════════
 * لماذا هذا الملف؟
 *
 *   النظام كان يسير نحو «انفجار الأدوار» (role explosion):
 *   18 دوراً حالياً، ومع 19 وحدة في كتالوج المستأجر فالوجهة ~38 دوراً
 *   (دور تشغيلي + دور «مدير هذه البوابة» لكل وحدة).
 *
 *   والدليل أن النهج انكسر فعلاً: جدول departments اضطُر لحمل عمود
 *   procurement_manager_id بجانب manager_id و supervisor_id
 *   و direct_manager_id. ولو تابعنا لصار فيه movement_manager_id
 *   و inventory_manager_id و mrp_manager_id …
 *
 *   البديل المعياري: Scoped Roles — دور خشن مرتبط بوظيفة (manager /
 *   supervisor) + نطاق صريح (الوحدة + القسم). هذا ما يوصي به NIST
 *   وممارسات RBAC الحديثة لتفادي تكاثر الأدوار.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * المبدأ الحاكم: الوحدة **منظور** لا نسخة.
 *
 *   ❌ خطأ: نسخ 22 صفحة حركة داخل بوابة المدير
 *   ✅ صواب: صفحتان تعرضان ما يخصّ فريقه فقط
 *
 *   الوحدة تجيب سؤالاً واحداً: «ما الذي يخصّ فريقي في هذا المجال؟»
 *   مصدر البيانات واحد؛ الفلترة وحدها تختلف (is_in_my_team).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * مصدر حقيقة واحد:
 *   • unitKey يطابق ModuleKey في TenantModuleCatalog.ts
 *   • ويطابق قيد unit_key في مايجريشن 0302
 *   اختبار العقد يتحقق من التطابق الثلاثي فلا تنحرف المصادر.
 *   (درس مستفاد من انحراف TARGET_ROLES عبر أربع نسخ يدوية.)
 * ═════════════════════════════════════════════════════════════════════════
 */

/** الدور الأساس — خشن ولا يتكاثر مع البوابات */
export type PortalUnitBaseRole = 'manager' | 'supervisor';

/** مفتاح الوحدة — يطابق ModuleKey و قيد 0302 */
export type PortalUnitKey =
  | 'movement'
  | 'hr'
  | 'finance'
  | 'procurement'
  | 'inventory'
  | 'mrp'
  | 'contracts'
  | 'crm'
  | 'health_safety';

/** نطاق الإسناد */
export type PortalUnitScopeType = 'department' | 'branch' | 'tenant';

export interface PortalUnitPage {
  /** معرّف الصفحة — يُسجَّل في المواضع الأربعة */
  id: string;
  label: string;
  /** المسار تحت /app/manager أو /app/supervisor */
  path: string;
}

export interface PortalUnitDefinition {
  unitKey: PortalUnitKey;
  label: string;
  /** وصف قصير يظهر في بطاقة الاختيار بالمعالج */
  description: string;
  /** الأدوار التي تُتاح لها هذه الوحدة */
  baseRoles: readonly PortalUnitBaseRole[];
  /**
   * جاهزة للاستخدام؟
   * نُسجّل الوحدات الأربع عشرة كلها من البداية ليُختبر الهيكل كاملاً،
   * ونُفعّل واحدة تلو الأخرى بعد بناء صفحاتها والتحقق منها في المتصفح.
   */
  status: 'active' | 'planned';
  /** صفحات المدير في هذه الوحدة */
  managerPages: readonly PortalUnitPage[];
  /** صفحات المشرف في هذه الوحدة */
  supervisorPages: readonly PortalUnitPage[];
}

/**
 * الكتالوج الكامل — 9 وحدات مدير · 5 منها تُتاح للمشرف أيضاً.
 *
 * المشرف أضيق نطاقاً عمداً: يتابع التنفيذ اليومي ولا يعتمد نهائياً.
 * لا وحدة مالية ولا مشتريات ولا عقود ولا CRM للمشرف — خارج نطاقه.
 */
export const PORTAL_UNITS: readonly PortalUnitDefinition[] = [
  {
    unitKey: 'movement',
    label: 'الحركة واللوجستيات',
    description: 'اعتماد تصاريح خروج الفريق ومتابعة حركتهم ومخالفاتهم',
    baseRoles: ['manager', 'supervisor'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-movement-approvals', label: 'اعتماد تصاريح الفريق', path: 'units/movement/approvals' },
      { id: 'manager-unit-movement-team', label: 'حركة الفريق', path: 'units/movement/team' },
    ],
    supervisorPages: [
      { id: 'supervisor-unit-movement-shift', label: 'حركة الوردية', path: 'units/movement/shift' },
    ],
  },
  {
    unitKey: 'hr',
    label: 'الموارد البشرية',
    description: 'اعتماد الإجازات والطلبات ومتابعة أداء الفريق',
    baseRoles: ['manager', 'supervisor'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-hr-approvals', label: 'اعتماد طلبات الفريق', path: 'units/hr/approvals' },
    ],
    supervisorPages: [
      { id: 'supervisor-unit-hr-approvals', label: 'متابعة الموارد البشرية', path: 'units/hr/approvals' },
    ],
  },
  {
    unitKey: 'finance',
    label: 'المالية',
    description: 'اعتماد المصروفات ضمن السقف ومتابعة مراكز تكلفة القسم',
    baseRoles: ['manager'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-finance-approvals', label: 'اعتماد المصروفات والقيود', path: 'units/finance/approvals' },
    ],
    supervisorPages: [],
  },
  {
    unitKey: 'procurement',
    label: 'المشتريات',
    description: 'اعتماد طلبات شراء القسم ومتابعة أوامر الشراء',
    baseRoles: ['manager'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-procurement-approvals', label: 'اعتماد طلبات الشراء', path: 'units/procurement/approvals' },
    ],
    supervisorPages: [],
  },
  {
    unitKey: 'inventory',
    label: 'المخزون والمستودعات',
    description: 'اعتماد التسويات وطلبات الصرف ومتابعة مهام الوردية',
    baseRoles: ['manager', 'supervisor'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-inventory-approvals', label: 'اعتماد التسويات', path: 'units/inventory/approvals' },
    ],
    supervisorPages: [
      { id: 'supervisor-unit-inventory-approvals', label: 'متابعة المخزون', path: 'units/inventory/approvals' },
    ],
  },
  {
    unitKey: 'mrp',
    label: 'التصنيع',
    description: 'اعتماد قوائم المواد وخطط الإنتاج ومتابعة أرضية المصنع',
    baseRoles: ['manager', 'supervisor'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-mrp-approvals', label: 'اعتماد قوائم المواد', path: 'units/mrp/approvals' },
    ],
    supervisorPages: [
      { id: 'supervisor-unit-mrp-approvals', label: 'متابعة التصنيع', path: 'units/mrp/approvals' },
    ],
  },
  {
    unitKey: 'contracts',
    label: 'العقود',
    description: 'اعتماد عقود الفريق ومتابعة تجديدها',
    baseRoles: ['manager'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-contracts-approvals', label: 'اعتماد العقود', path: 'units/contracts/approvals' },
    ],
    supervisorPages: [],
  },
  {
    unitKey: 'crm',
    label: 'المبيعات وCRM',
    description: 'اعتماد الخصومات ومتابعة أداء المبيعات',
    baseRoles: ['manager'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-crm-approvals', label: 'اعتماد الخصومات', path: 'units/crm/approvals' },
    ],
    supervisorPages: [],
  },
  {
    unitKey: 'health_safety',
    label: 'الصحة والسلامة',
    description: 'اعتماد البلاغات والإجراءات التصحيحية ومتابعة الفحوصات',
    baseRoles: ['manager', 'supervisor'],
    status: 'active',
    managerPages: [
      { id: 'manager-unit-health-safety-approvals', label: 'اعتماد البلاغات', path: 'units/health_safety/approvals' },
    ],
    supervisorPages: [
      { id: 'supervisor-unit-health-safety-approvals', label: 'متابعة الصحة والسلامة', path: 'units/health_safety/approvals' },
    ],
  },
] as const;

/** الوحدات المتاحة لدور أساس معيّن */
export function unitsForBaseRole(
  baseRole: PortalUnitBaseRole,
  options: { activeOnly?: boolean } = {},
): PortalUnitDefinition[] {
  return PORTAL_UNITS.filter(
    (u) =>
      u.baseRoles.includes(baseRole) &&
      (!options.activeOnly || u.status === 'active'),
  );
}

/** صفحات وحدة معيّنة لدور أساس معيّن */
export function pagesForUnit(
  unit: PortalUnitDefinition,
  baseRole: PortalUnitBaseRole,
): readonly PortalUnitPage[] {
  return baseRole === 'manager' ? unit.managerPages : unit.supervisorPages;
}

/** كل معرّفات الصفحات عبر كل الوحدات — للتسجيل والتحقق */
export function allUnitPageIds(): string[] {
  return PORTAL_UNITS.flatMap((u) => [
    ...u.managerPages.map((p) => p.id),
    ...u.supervisorPages.map((p) => p.id),
  ]);
}

/** بحث سريع بالمفتاح */
export function findUnit(unitKey: string): PortalUnitDefinition | undefined {
  return PORTAL_UNITS.find((u) => u.unitKey === unitKey);
}

export const PORTAL_UNIT_BASE_ROLE_LABELS: Record<PortalUnitBaseRole, string> = {
  manager: 'مدير',
  supervisor: 'مشرف',
};

export const PORTAL_UNIT_SCOPE_LABELS: Record<PortalUnitScopeType, string> = {
  department: 'قسم',
  branch: 'فرع',
  tenant: 'الشركة كاملة',
};
