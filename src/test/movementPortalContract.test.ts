/**
 * عقد بوابة الحركة واللوجستيات — مراجعة 0270–0282
 *
 * يغطي الأعطال الحرجة التي كشفتها المراجعة:
 *   ① 11 جدولاً بـ RLS مفعَّل بلا سياسات = حجب كامل (مُثبَت بالتشغيل)
 *   ② movement_require_role() مفقودة
 *   ③ RequireMovementRole غير موجود = لا فصل بين الدورين
 *   ④ الصفحات غير مسجَّلة في 3 من المواضع الأربعة
 *   ⑤ أدوار logistics/movement_manager غير معرَّفة في UserRole
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p: string) => existsSync(join(ROOT, p));

const FIX = read('supabase/migrations/0282_movement_rls_and_role_guard_fixes.sql');
const CORE = read('supabase/migrations/0270_movement_core_schema.sql');
const RBAC = read('supabase/migrations/0271_movement_rbac_functions.sql');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const HYBRID = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const REDIRECT = read('src/router/legacyRedirect.ts');
const TYPES = read('src/shared/types/index.ts');
const PERMS = read('src/core/constants/permissions.ts');
const NAV = read('src/pages/app/movement/shared/MovementUnitNav.tsx');

/** الجداول الأحد عشر التي كانت محجوبة تماماً */
const BLOCKED_TABLES = [
  'employee_movement_approvals',
  'field_visit_checkins',
  'fleet_driver_hos_logs',
  'fleet_vehicle_documents',
  'logistics_carrier_rates',
  'logistics_kpi_snapshots',
  'logistics_shipments',
  'logistics_trip_stops',
  'movement_geofences',
  'movement_permit_attachments',
];

const EMP_IDS = [
  'movement-emp-foundation', 'movement-emp-permits', 'movement-emp-execution',
  'movement-emp-visits', 'movement-emp-missions', 'movement-emp-compliance',
  'movement-emp-analytics',
];

const LOG_IDS = [
  'movement-log-dashboard', 'movement-log-fleet', 'movement-log-drivers',
  'movement-log-maintenance', 'movement-log-fuel', 'movement-log-orders',
  'movement-log-routes', 'movement-log-dispatch', 'movement-log-tracking',
  'movement-log-epod', 'movement-log-carriers', 'movement-log-costs',
];

describe('0282 — إصلاح RLS المحجوب', () => {
  it('يعالج الجداول العشرة المحجوبة', () => {
    for (const t of BLOCKED_TABLES) {
      expect(FIX).toContain(`'${t}'`);
    }
  });

  it('ينشئ سياسات معزولة بالمستأجر', () => {
    expect(FIX).toContain('FOR ALL TO authenticated');
    expect(FIX).toContain('tenant_id = public.current_user_tenant_id()');
    expect(FIX).toContain('WITH CHECK');
  });

  it('يتحقق من وجود tenant_id قبل بناء السياسة', () => {
    expect(FIX).toContain("column_name = 'tenant_id'");
    expect(FIX).toContain('has no tenant_id column');
  });

  it('يفشل المايجريشن إن بقي جدول بلا سياسة', () => {
    expect(FIX).toContain('RLS enabled without policies on');
  });
});

describe('0282 — الحارس المفقود movement_require_role', () => {
  it('الدالة مُنشأة', () => {
    expect(FIX).toContain('CREATE OR REPLACE FUNCTION public.movement_require_role');
  });

  it('ترفع استثناءً بدل إرجاع BOOLEAN', () => {
    expect(FIX).toContain("RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MOVEMENT_ROLE");
    expect(FIX).toContain("RAISE EXCEPTION 'NO_AUTH'");
    expect(FIX).toContain("RAISE EXCEPTION 'NO_TENANT'");
  });

  it('تتبع مخطط 0270 الفعلي (is_active) لا access_level', () => {
    expect(CORE).toContain('is_active');
    expect(FIX).toContain('a.is_active = TRUE');
    expect(FIX).not.toContain('a.access_level');
  });

  it('movement_manager يمنح الدورين', () => {
    expect(FIX).toContain("a.portal_role IN (p_role, 'movement_manager')");
  });

  it('ترفض الأدوار غير المعروفة', () => {
    expect(FIX).toContain('INVALID_MOVEMENT_ROLE');
  });
});

describe('0282 — الأمان: صلاحية anon', () => {
  it('يسحب EXECUTE من anon صراحةً', () => {
    // REVOKE FROM PUBLIC لا يسحب منحة Supabase التلقائية لـ anon
    expect(FIX).toContain('FROM anon');
    expect(FIX).toContain('REVOKE ALL ON FUNCTION public.movement_require_role(TEXT) FROM anon');
  });

  it('يضع حارساً يفشل إن استطاع anon التنفيذ', () => {
    expect(FIX).toContain("has_function_privilege('anon'");
    expect(FIX).toContain('anon can execute');
  });

  it('يعيد ضبط صلاحيات دوال 0271 القائمة', () => {
    for (const fn of [
      'movement_has_role',
      'current_user_movement_roles',
      'movement_haversine_km',
      'movement_point_in_geofence',
      'movement_point_in_polygon',
    ]) {
      expect(FIX).toContain(`'${fn}'`);
    }
  });
});

describe('0282 — سجل التدقيق append-only', () => {
  it('يوفّر SELECT و INSERT فقط', () => {
    expect(FIX).toContain('kyvzon_movement_audit_events_select');
    expect(FIX).toContain('kyvzon_movement_audit_events_insert');
  });

  it('لا سياسة UPDATE أو DELETE', () => {
    expect(FIX).not.toContain('kyvzon_movement_audit_events_update');
    expect(FIX).not.toContain('kyvzon_movement_audit_events_delete');
    expect(FIX).toContain('audit log must be append-only');
  });
});

describe('فصل الدورين — طبقة الواجهة', () => {
  it('الحارس RequireMovementRole موجود', () => {
    expect(exists('src/router/guards/RequireMovementRole.tsx')).toBe(true);
  });

  it('خدمة الأدوار والهوك موجودان', () => {
    expect(exists('src/services/sdk/MovementRoleService.ts')).toBe(true);
    expect(exists('src/shared/hooks/useMovementRoles.ts')).toBe(true);
  });

  it('الراوتر يغلّف مسارات كل دور بحارسه', () => {
    expect(ROUTER).toContain('<RequireMovementRole role="employee_movement" />');
    expect(ROUTER).toContain('<RequireMovementRole role="logistics" />');
  });

  it('المسار الجذر يحوّل حسب الدور لا لوجهة ثابتة', () => {
    expect(ROUTER).toContain('<MovementRoleRedirect />');
    expect(ROUTER).not.toContain('<Route index element={<Navigate to="logistics/dashboard" replace />} />');
  });

  it('movement_manager يوسَّع إلى الدورين', () => {
    const svc = read('src/services/sdk/MovementRoleService.ts');
    expect(svc).toContain('expandRoles');
    expect(svc).toContain("role === 'movement_manager'");
  });

  it('فشل قراءة الأدوار لا يمنح صلاحيات', () => {
    const hook = read('src/shared/hooks/useMovementRoles.ts');
    expect(hook).toContain('setRoles([])');
  });
});

describe('المواضع الأربعة — تسجيل الصفحات', () => {
  const ALL = [...EMP_IDS, ...LOG_IDS];

  it('Sidebar يسجّل الوحدات التسع عشرة', () => {
    for (const id of ALL) expect(SIDEBAR).toContain(`'${id}'`);
  });

  it('Sidebar يفلتر حسب الدور النشط', () => {
    expect(SIDEBAR).toContain("section.key === 'movement-main'");
    // تصحيح 2026-08-04: كان هذا يؤكد قراءة localStorage مباشرة، وهي نفسها
    // سبب العطل — الشريط كان يعرض 22 صفحة يمنعها RequireMovementRole لأنه
    // يقرأ movement_role_assignments. صار الشريط يقرأ نفس مصدر الحارس
    // عبر useMovementRoles، فالتأكيد الصحيح هو على المصدر الموحّد.
    expect(SIDEBAR).toContain('useMovementRoles');
    expect(SIDEBAR).toMatch(/movement\.activeRole/);
  });

  it('hybridPagesCatalog يسجّلها', () => {
    for (const id of ALL) expect(HYBRID).toContain(`'${id}'`);
  });

  it('AdminEmployeesPage يسجّلها', () => {
    for (const id of ALL) expect(ADMIN).toContain(`'${id}'`);
  });

  it('legacyRedirect يربط كل معرّف بمسار', () => {
    for (const id of ALL) expect(REDIRECT).toContain(`'${id}'`);
  });

  it('كل معرّف مرتبط بوحدة movement في بوابة الوحدات', () => {
    for (const id of ALL) expect(SIDEBAR).toContain(`'${id}': 'movement'`);
  });
});

describe('الأدوار ومفاتيح الصلاحيات', () => {
  it('UserRole يعرّف أدوار الحركة الثلاثة', () => {
    expect(TYPES).toContain("'employee_movement'");
    expect(TYPES).toContain("'logistics'");
    expect(TYPES).toContain("'movement_manager'");
  });

  it('مفاتيح الصلاحيات معرَّفة', () => {
    for (const id of [...EMP_IDS, ...LOG_IDS]) expect(PERMS).toContain(`'${id}'`);
  });

  it('الأدوار الافتراضية معرَّفة ومفصولة', () => {
    expect(PERMS).toContain('employee_movement: [');
    expect(PERMS).toContain('logistics: [');
    expect(PERMS).toContain('movement_manager: [');
  });
});

describe('الوحدات — MovementUnitNav', () => {
  it('يعرّف وحدات الدور «أ» السبع (E00–E06)', () => {
    for (const u of ['E00', 'E01', 'E02', 'E03', 'E04', 'E05', 'E06']) {
      expect(NAV).toContain(u);
    }
  });

  it('يعرّف وحدات الدور «ب» الاثنتي عشرة (L00–L11)', () => {
    for (const u of ['L00', 'L01', 'L02', 'L03', 'L04', 'L05',
                     'L06', 'L07', 'L08', 'L09', 'L10', 'L11']) {
      expect(NAV).toContain(u);
    }
  });
});

describe('الممنوعات في صفحات الحركة', () => {
  const PAGES = [
    'src/pages/app/movement/shared/MovementUnitNav.tsx',
    'src/router/guards/RequireMovementRole.tsx',
    'src/router/guards/MovementRoleRedirect.tsx',
    'src/services/sdk/MovementRoleService.ts',
    'src/shared/hooks/useMovementRoles.ts',
  ];

  it('لا confirm() ولا prompt()', () => {
    for (const f of PAGES) {
      const src = read(f);
      expect(src).not.toMatch(/\bwindow\.confirm\(|(?<![a-zA-Z])confirm\(|(?<![a-zA-Z])prompt\(/);
    }
  });

  it('لا as any في الطبقة الجديدة', () => {
    for (const f of PAGES) expect(read(f)).not.toContain('as any');
  });

  it('لا استدعاء مباشر لـ supabase من الحُرّاس والهوك', () => {
    for (const f of PAGES.slice(1)) {
      const src = read(f);
      expect(src).not.toMatch(/supabase\.(from|rpc)\(/);
    }
  });
});

describe('RBAC الأساسي (0271)', () => {
  it('movement_has_role تحترم is_active', () => {
    expect(RBAC).toContain('is_active = TRUE');
  });

  it('معزولة بالمستأجر', () => {
    expect(RBAC).toContain('current_user_tenant_id()');
  });
});
