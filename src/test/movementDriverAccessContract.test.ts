/**
 * movementDriverAccessContract.test.ts
 *
 * عقد الجولة ١ — فصل وصول السائق عن دور مدير الأسطول (0301).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * العطل الذي يحرس ضده (تشخيص 2026-08-05):
 *
 *   AppRouter كان يضع صفحات السائق الثلاث داخل:
 *     <Route element={<RequireMovementRole role="logistics" />}>
 *
 *   أي أن السائق يحتاج دور مدير الأسطول — الذي يفتح التكاليف
 *   والناقلين والربحية — ليرى رحلاته. تصعيد امتياز.
 *
 *   طبقة القاعدة كانت صحيحة: السائق يُعرَّف بـ logistics_drivers.user_id
 *   لا بدور بوابة (movement_require_driver في 0291).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const MIGRATION = read('supabase/migrations/0301_movement_driver_guard_and_fks.sql');
const ROUTER = read('src/router/AppRouter.tsx');
const GUARD = read('src/router/guards/RequireDriver.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const SERVICE = read('src/services/sdk/DriverAppService.ts');
const VERIFY = read('tools/dev/verify-movement-0301.sql');

const DRIVER_ROUTES = [
  'driver/trips',
  'driver/delivery/:dispatchId',
  'driver/inspection/:dispatchId',
];

describe('0301 — دالة حارس السائق', () => {
  it('تُعرّف is_current_user_driver كدالة STABLE', () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.is_current_user_driver\(\)[\s\S]{0,120}STABLE/,
    );
  });

  it('تعتمد current_driver_id لا دور بوابة', () => {
    expect(MIGRATION).toMatch(/SELECT public\.current_driver_id\(\) IS NOT NULL/);
    // لا تفحص أدوار البوابة إطلاقاً
    const fnBody = MIGRATION.slice(
      MIGRATION.indexOf('is_current_user_driver()'),
      MIGRATION.indexOf('COMMENT ON FUNCTION public.is_current_user_driver'),
    );
    expect(fnBody).not.toMatch(/movement_role_assignments|portal_role/);
  });

  it('anon محروم و authenticated ممنوح', () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.is_current_user_driver\(\) FROM anon/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.is_current_user_driver\(\) TO authenticated, service_role/,
    );
  });

  it('حارس overloads يمنع الحِمل الزائد', () => {
    expect(MIGRATION).toMatch(/is_current_user_driver overloads = %s \(must be 1\)/);
  });
});

describe('0301 — نوع السائق: موظف أو متعاقد', () => {
  it('يضيف driver_type بقيد يقتصر على employee/contractor', () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS driver_type VARCHAR\(20\)/);
    expect(MIGRATION).toMatch(/CHECK \(driver_type IN \('employee', 'contractor'\)\)/);
  });

  it('يفرض تماسك النوع مع employee_id', () => {
    expect(MIGRATION).toMatch(/logistics_drivers_type_employee_coherence/);
    expect(MIGRATION).toMatch(
      /driver_type = 'employee'\s+AND employee_id IS NOT NULL/,
    );
    expect(MIGRATION).toMatch(
      /driver_type = 'contractor' AND employee_id IS NULL/,
    );
  });

  it('يُصحّح الصفوف القائمة قبل تثبيت القيد', () => {
    expect(MIGRATION).toMatch(
      /UPDATE public\.logistics_drivers[\s\S]{0,120}SET driver_type = 'contractor'/,
    );
  });
});

describe('0301 — المفاتيح الأجنبية على employee_id', () => {
  const TABLES = [
    'employee_movement_permits',
    'employee_movements_log',
    'employee_field_visits',
    'employee_missions',
    'employee_movement_violations',
  ];

  it.each(TABLES)('يشمل جدول %s', (t) => {
    expect(MIGRATION).toContain(`'${t}'`);
  });

  it('يشير إلى profiles لا employees (اتساقاً مع movements_log)', () => {
    expect(MIGRATION).toMatch(/REFERENCES public\.profiles\(id\) ON DELETE CASCADE/);
    expect(MIGRATION).not.toMatch(/REFERENCES public\.employees\(id\)/);
  });

  it('يتوقف عند وجود يتامى بدل حذف بيانات تلقائياً', () => {
    expect(MIGRATION).toMatch(/0301 متوقف: % صفاً يتيماً/);
    // لا حذف تلقائي للصفوف اليتيمة
    const orphanBlock = MIGRATION.slice(
      MIGRATION.indexOf('خطوة ١: تنظيف اليتامى'),
      MIGRATION.indexOf('خطوة ٢'),
    );
    expect(orphanBlock).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('يحوي حارساً يتأكد من وجود الخمسة', () => {
    expect(MIGRATION).toMatch(/0301 failed: missing FKs on: %s/);
  });
});

describe('AppRouter — صفحات السائق خارج حارس اللوجستيات', () => {
  it('يستورد RequireDriver', () => {
    expect(ROUTER).toMatch(
      /import \{ RequireDriver \} from '\.\/guards\/RequireDriver'/,
    );
  });

  it('يلفّ صفحات السائق بـ RequireDriver', () => {
    expect(ROUTER).toMatch(/<Route element=\{<RequireDriver \/>\}>/);
  });

  it.each(DRIVER_ROUTES)('المسار %s داخل كتلة RequireDriver', (path) => {
    const start = ROUTER.indexOf('<Route element={<RequireDriver />}>');
    expect(start).toBeGreaterThan(-1);
    const end = ROUTER.indexOf('</Route>', start);
    const block = ROUTER.slice(start, end);
    expect(block).toContain(`path="${path}"`);
  });

  it.each(DRIVER_ROUTES)(
    'المسار %s ليس داخل كتلة RequireMovementRole role="logistics"',
    (path) => {
      const start = ROUTER.indexOf('<Route element={<RequireMovementRole role="logistics" />}>');
      expect(start).toBeGreaterThan(-1);
      const end = ROUTER.indexOf('</Route>', start);
      const block = ROUTER.slice(start, end);
      expect(block).not.toContain(`path="${path}"`);
    },
  );
});

describe('RequireDriver — سلوك الحارس', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(ROOT, 'src/router/guards/RequireDriver.tsx'))).toBe(true);
  });

  it('يستدعي driverAppService.isDriver', () => {
    expect(GUARD).toMatch(/driverAppService\s*\.\s*isDriver\(\)/);
  });

  it('فشل الفحص لا يمنح وصولاً', () => {
    expect(GUARD).toMatch(/catch[\s\S]{0,120}setIsDriver\(false\)/);
  });

  it('يسمح لمدير الأسطول بالمعاينة للدعم', () => {
    expect(GUARD).toMatch(/hasRole\('logistics'\)/);
    expect(GUARD).toMatch(/isDriver \|\| canSupervise/);
  });

  it('يعرض مؤشر تحميل قبل اكتمال الفحص', () => {
    expect(GUARD).toMatch(/if \(!checked \|\| !rolesLoaded\)/);
  });

  it('يشرح للمستخدم كيف يُربط حسابه', () => {
    expect(GUARD).toContain('غير مربوط بسجل السائق');
  });
});

describe('DriverAppService — يستخدم الدالة الجديدة', () => {
  it('isDriver يستدعي is_current_user_driver', () => {
    expect(SERVICE).toMatch(/supabase\.rpc\('is_current_user_driver'\)/);
  });

  it('لا يعتمد current_driver_id مباشرة في isDriver', () => {
    const fn = SERVICE.slice(
      SERVICE.indexOf('async isDriver()'),
      SERVICE.indexOf('async findMyTrips'),
    );
    expect(fn).not.toMatch(/rpc\('current_driver_id'\)/);
  });
});

describe('Sidebar — السائق يرى صفحته بلا دور بوابة', () => {
  it('يستورد driverAppService', () => {
    expect(SIDEBAR).toMatch(
      /import \{ driverAppService \} from '\.\.\/\.\.\/\.\.\/services\/sdk\/DriverAppService'/,
    );
  });

  it('يمرّر isDriver إلى دالة الفلترة', () => {
    expect(SIDEBAR).toMatch(/isDriver: isFleetDriver/);
  });

  it('السائق بلا دور بوابة يرى صفحة السائق وحدها', () => {
    expect(SIDEBAR).toMatch(/if \(!movement\.isDriver\) return \[\];/);
    expect(SIDEBAR).toMatch(/DRIVER_ONLY_IDS/);
  });

  it('قسم الحركة يمر للسائق ولو كان دوره employee', () => {
    expect(SIDEBAR).toMatch(
      /section\.key === 'movement-main' && isFleetDriver/,
    );
  });

  it('السائق صاحب دور بوابة يرى الاثنين معاً', () => {
    expect(SIDEBAR).toMatch(/movement\.isDriver[\s\S]{0,80}\.\.\.DRIVER_ONLY_IDS/);
  });
});

describe('0301 — الاختبار السلوكي', () => {
  it('يغطي الحالات الحرجة', () => {
    expect(VERIFY).toContain('السائق لا يُمنح دور مدير الأسطول');
    expect(VERIFY).toContain('السائق بلا دور بوابة يبقى سائقاً');
    expect(VERIFY).toContain('السائق الموقوف يفقد الوصول');
    expect(VERIFY).toContain('مدير الأسطول ليس سائقاً تلقائياً');
    expect(VERIFY).toContain('حذف الملف يُنظّف سجلات حركته (CASCADE)');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ 0301 verify: % اختباراً فشل'/);
  });
});
