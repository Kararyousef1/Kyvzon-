/**
 * portalUnitsArchitectureContract.test.ts
 *
 * عقد معمارية الوحدات (0302/0303) — Scoped Roles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *
 *   ① انحراف مصادر الحقيقة الثلاثة (كتالوج TS · قيد القاعدة · ModuleKey).
 *      درس مستفاد: TARGET_ROLES انحرفت عبر أربع نسخ يدوية دون أن
 *      يلاحظ أي اختبار، لأن كل اختبار كان يختبر نسخته الخاصة.
 *
 *   ② «الوحدة نسخة لا منظور» — أي نسخ صفحات البوابة داخل بوابة المدير.
 *
 *   ③ شريط جانبي يَعِد بصفحات يمنعها الحارس (عطل سبق إصلاحه مرتين).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PORTAL_UNITS,
  unitsForBaseRole,
  pagesForUnit,
  allUnitPageIds,
  findUnit,
  type PortalUnitKey,
} from '../shared/constants/portalUnits';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const M0302 = read('supabase/migrations/0302_portal_unit_assignments.sql');
const M0303 = read('supabase/migrations/0303_manager_movement_unit_functions.sql');
const CATALOG_TS = read('src/services/sdk/TenantModuleCatalog.ts');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const HYBRID = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const GUARD = read('src/router/guards/RequirePortalUnit.tsx');
const VERIFY = read('tools/dev/verify-portal-units-0302-0303.sql');
const SERVICE = read('src/services/sdk/ManagerMovementUnitService.ts');

/** يستخرج قيم CHECK (col IN (...)) من مايجريشن */
function checkValues(sql: string, column: string): Set<string> {
  const re = new RegExp(`${column}\\s+VARCHAR\\(\\d+\\)[^,]*?CHECK \\(${column} IN \\(([\\s\\S]*?)\\)\\)`, 'i');
  const m = re.exec(sql);
  if (!m) throw new Error(`تعذّر استخراج قيم ${column}`);
  return new Set(Array.from(m[1].matchAll(/'([^']+)'/g)).map((x) => x[1]));
}

describe('تطابق مصادر الحقيقة الثلاثة', () => {
  it('كل unit_key في الكتالوج مسموح في قيد 0302', () => {
    const dbUnits = checkValues(M0302, 'unit_key');
    const missing = PORTAL_UNITS.map((u) => u.unitKey).filter((k) => !dbUnits.has(k));
    expect(missing).toEqual([]);
  });

  it('كل unit_key في قيد 0302 موجود في الكتالوج', () => {
    const dbUnits = checkValues(M0302, 'unit_key');
    const tsUnits = new Set(PORTAL_UNITS.map((u) => u.unitKey));
    const orphans = [...dbUnits].filter((k) => !tsUnits.has(k as PortalUnitKey));
    expect(orphans).toEqual([]);
  });

  it('كل unit_key هو ModuleKey صالح في TenantModuleCatalog', () => {
    const missing = PORTAL_UNITS
      .map((u) => u.unitKey)
      .filter((k) => !CATALOG_TS.includes(`key: '${k}'`));
    expect(missing).toEqual([]);
  });

  it('base_role يقتصر على manager/supervisor في القاعدة', () => {
    const roles = checkValues(M0302, 'base_role');
    expect([...roles].sort()).toEqual(['manager', 'supervisor']);
  });

  it('scope_type يقتصر على department/branch/tenant', () => {
    const scopes = checkValues(M0302, 'scope_type');
    expect([...scopes].sort()).toEqual(['branch', 'department', 'tenant']);
  });
});

describe('كتالوج الوحدات', () => {
  it('يحوي تسع وحدات', () => {
    expect(PORTAL_UNITS).toHaveLength(9);
  });

  it('المشرف أضيق نطاقاً من المدير', () => {
    const mgr = unitsForBaseRole('manager');
    const sup = unitsForBaseRole('supervisor');
    expect(mgr.length).toBeGreaterThan(sup.length);
  });

  it('لا وحدة مالية أو مشتريات أو عقود للمشرف', () => {
    const supKeys = unitsForBaseRole('supervisor').map((u) => u.unitKey);
    for (const k of ['finance', 'procurement', 'contracts', 'crm']) {
      expect(supKeys).not.toContain(k);
    }
  });

  it('وحدة الحركة نشطة ولها صفحتان للمدير', () => {
    const unit = findUnit('movement');
    expect(unit?.status).toBe('active');
    expect(pagesForUnit(unit!, 'manager')).toHaveLength(2);
  });

  it('الوحدات المخطَّطة بلا صفحات (لا وعد كاذب)', () => {
    for (const u of PORTAL_UNITS.filter((x) => x.status === 'planned')) {
      expect(u.managerPages).toHaveLength(0);
      expect(u.supervisorPages).toHaveLength(0);
    }
  });

  it('كل معرّفات الصفحات فريدة', () => {
    const ids = allUnitPageIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('كل وحدة لها وصف يظهر في بطاقة الاختيار', () => {
    for (const u of PORTAL_UNITS) {
      expect(u.description.length).toBeGreaterThan(10);
    }
  });
});

describe('0302 — الأساس', () => {
  it('يُنشئ portal_unit_assignments مع RLS', () => {
    expect(M0302).toMatch(/CREATE TABLE IF NOT EXISTS public\.portal_unit_assignments/);
    expect(M0302).toMatch(/ALTER TABLE public\.portal_unit_assignments ENABLE ROW LEVEL SECURITY/);
    expect(M0302).toMatch(/CREATE POLICY kyvzon_portal_unit_assignments_all/);
  });

  it('يفرض تماسك النطاق', () => {
    expect(M0302).toMatch(/portal_unit_scope_coherence/);
    expect(M0302).toMatch(/scope_type = 'tenant'\s+AND scope_id IS NULL/);
  });

  it('يستخدم فهرسين جزئيين للتفرّد (NULL لا يُعامل كقيمة مميزة)', () => {
    expect(M0302).toMatch(/uq_portal_unit_scoped[\s\S]{0,200}WHERE scope_id IS NOT NULL/);
    expect(M0302).toMatch(/uq_portal_unit_tenant_wide[\s\S]{0,200}WHERE scope_id IS NULL/);
  });

  it('is_in_my_team يجسر profiles.department النصّي مع employees.department_id', () => {
    // فجوة بنيوية حقيقية: profiles.department نصّ حر لا مفتاح أجنبي
    expect(M0302).toMatch(/FROM public\.employees e[\s\S]{0,200}e\.user_id = p_user_id/);
    expect(M0302).toMatch(/lower\(btrim\(d\.name_ar\)\) = lower\(btrim\(p\.department\)\)/);
  });

  it('is_in_my_team يصعد شجرة الأقسام بحد أقصى', () => {
    expect(M0302).toMatch(/v_depth < 20/);
    expect(M0302).toMatch(/parent_department_id/);
  });

  it('anon محروم من الدوال الثلاث', () => {
    expect(M0302).toMatch(/REVOKE ALL ON FUNCTION %s FROM anon/);
    expect(M0302).toMatch(/0302 failed: anon can execute/);
  });

  it('يحوي حارس overloads', () => {
    expect(M0302).toMatch(/0302 failed: %s overloads = %s \(must be 1\)/);
  });
});

describe('0303 — منظور الفريق لا نسخة البوابة', () => {
  it('كل دالة تستدعي حارس الوحدة', () => {
    for (const fn of [
      'manager_movement_pending_permits',
      'manager_movement_decide_permit',
      'manager_movement_team_log',
      'manager_movement_team_kpis',
    ]) {
      const start = M0303.indexOf(`FUNCTION public.${fn}`);
      expect(start).toBeGreaterThan(-1);
      const body = M0303.slice(start, start + 2500);
      expect(body).toMatch(/PERFORM public\.require_portal_unit\('manager', 'movement'\)/);
    }
  });

  it('كل استعلام يفلتر بـ is_in_my_team داخل جملة WHERE', () => {
    // ⚠️ تصحيح 2026-08-05: كان هذا التأكيد فضفاضاً — يبحث عن
    // is_in_my_team في أي موضع من جسم الدالة. أثبت اختبار الانحدار
    // أنه لا يكشف حذف الفلترة من WHERE لأن الاسم يرد في تعليق أو
    // استعلام آخر. الآن نتحقق من وجودها في شرط WHERE تحديداً.
    const cases: Array<[string, RegExp]> = [
      [
        'manager_movement_pending_permits',
        /WHERE p\.tenant_id = public\.current_user_tenant_id\(\)[\s\S]{0,200}AND public\.is_in_my_team\(p\.employee_id\)/,
      ],
      [
        'manager_movement_team_log',
        /WHERE m\.tenant_id = public\.current_user_tenant_id\(\)[\s\S]{0,250}AND public\.is_in_my_team\(m\.employee_id\)/,
      ],
    ];

    for (const [fn, pattern] of cases) {
      const start = M0303.indexOf(`FUNCTION public.${fn}`);
      expect(start, `${fn} غير موجودة`).toBeGreaterThan(-1);
      const body = M0303.slice(start, start + 2500);
      expect(body, `${fn} لا تفلتر بالفريق في WHERE`).toMatch(pattern);
    }
  });

  it('كل استعلام فرعي في team_kpis يفلتر بالفريق', () => {
    const start = M0303.indexOf('FUNCTION public.manager_movement_team_kpis');
    const body = M0303.slice(start, M0303.indexOf('COMMENT ON FUNCTION public.manager_movement_team_kpis'));
    // ستة استعلامات فرعية، كلها يجب أن تفلتر
    const subqueries = body.match(/SELECT count\(\*\)::INTEGER/g) ?? [];
    const filters = body.match(/public\.is_in_my_team\(/g) ?? [];
    expect(subqueries.length).toBe(6);
    expect(filters.length).toBe(6);
  });

  it('القرار يتحقق من الفريق قبل التعديل', () => {
    const start = M0303.indexOf('FUNCTION public.manager_movement_decide_permit');
    const body = M0303.slice(start, start + 2500);
    const teamCheck = body.indexOf('EMPLOYEE_NOT_IN_MY_TEAM');
    const update = body.indexOf('UPDATE public.employee_movement_permits');
    expect(teamCheck).toBeGreaterThan(-1);
    expect(teamCheck).toBeLessThan(update);
  });

  it('يسجّل الأثر في جدول الموافقات القائم لا جدول جديد', () => {
    expect(M0303).toMatch(/INSERT INTO public\.employee_movement_approvals/);
    expect(M0303).not.toMatch(/CREATE TABLE/);
  });

  it('يمنع الاعتماد المكرر', () => {
    expect(M0303).toMatch(/PERMIT_NOT_PENDING/);
  });

  it('يقصر القرار على approved/rejected', () => {
    expect(M0303).toMatch(/p_decision NOT IN \('approved', 'rejected'\)/);
  });

  it('أسماء الإخراج ببادئة out_ (تفادي التباس الأعمدة)', () => {
    expect(M0303).toMatch(/out_permit_id/);
    expect(M0303).toMatch(/out_employee_id/);
  });
});

describe('التسجيل في المواضع الأربعة', () => {
  const UNIT_PAGES = ['manager-unit-movement-approvals', 'manager-unit-movement-team'];

  it.each(UNIT_PAGES)('%s مُسجَّلة في Sidebar', (id) => {
    expect(SIDEBAR).toContain(`'${id}'`);
  });

  it.each(UNIT_PAGES)('%s مُسجَّلة في hybridPagesCatalog', (id) => {
    expect(HYBRID).toContain(`'${id}'`);
  });

  it.each(UNIT_PAGES)('%s مُسجَّلة في AdminEmployeesPage', (id) => {
    expect(ADMIN).toContain(`'${id}'`);
  });

  it.each(UNIT_PAGES)('%s مُسجَّلة في legacyRedirect', (id) => {
    expect(LEGACY).toContain(`'${id}'`);
  });

  it('المسارات تحت /app/manager/units/movement', () => {
    expect(LEGACY).toContain('/app/manager/units/movement/approvals');
    expect(LEGACY).toContain('/app/manager/units/movement/team');
  });
});

describe('AppRouter — الحارس يلفّ صفحات الوحدة', () => {
  it('يستورد RequirePortalUnit', () => {
    expect(ROUTER).toMatch(/import \{ RequirePortalUnit \} from '\.\/guards\/RequirePortalUnit'/);
  });

  it('صفحتا الوحدة داخل كتلة RequirePortalUnit', () => {
    const start = ROUTER.indexOf('<RequirePortalUnit baseRole="manager" unitKey="movement" />');
    expect(start).toBeGreaterThan(-1);
    const end = ROUTER.indexOf('</Route>', start);
    const block = ROUTER.slice(start, end);
    expect(block).toContain('path="approvals"');
    expect(block).toContain('path="team"');
  });
});

describe('Sidebar — لا يَعِد بما يمنعه الحارس', () => {
  it('يستورد usePortalUnits — نفس مصدر الحارس', () => {
    expect(SIDEBAR).toMatch(/import \{ usePortalUnits \} from '\.\.\/\.\.\/hooks\/usePortalUnits'/);
  });

  it('يُخفي صفحات الوحدة قبل اكتمال القراءة', () => {
    expect(SIDEBAR).toMatch(/if \(!portalUnitsLoaded\) return false;/);
  });

  it('يُخفي صفحات الوحدة غير المُسنَدة', () => {
    // تحديث 2026-08-05: صار الحارس يفحص الدور الأساس الصحيح لكل صفحة
    // بعد إضافة وحدة المشرف (0307) — فصفحة المشرف تُفحص بـ'supervisor'
    // لا 'manager'. الفحص بالمدير وحده كان سيُخفيها عن المشرف.
    expect(SIDEBAR).toMatch(/UNIT_PAGE_BASE_ROLE\[item\.id\] \?\? 'manager'/);
    expect(SIDEBAR).toMatch(/hasPortalUnit\(unitBase, unitKey as PortalUnitKey\)/);
  });

  it('خريطة صفحات الوحدات معرَّفة', () => {
    expect(SIDEBAR).toMatch(/UNIT_PAGE_UNIT_KEY/);
  });
});

describe('RequirePortalUnit — سلوك الحارس', () => {
  it('يعرض مؤشر تحميل قبل اكتمال القراءة', () => {
    expect(GUARD).toMatch(/if \(loading \|\| !loaded\)/);
  });

  it('يشرح للمستخدم كيف تُسنَد الوحدة', () => {
    expect(GUARD).toContain('إدارة المستخدمين');
  });
});

describe('طبقة SDK', () => {
  it('الصفحات لا تلمس Supabase مباشرة — الخدمة وحدها', () => {
    expect(SERVICE).toMatch(/supabase\.rpc\('manager_movement_pending_permits'\)/);
    const page = read('src/pages/manager/units/movement/ManagerMovementApprovalsPage.tsx');
    expect(page).not.toMatch(/from '.*services\/supabase/);
    expect(page).not.toMatch(/supabase\./);
  });

  it('يترجم أخطاء القاعدة لرسائل عربية', () => {
    expect(SERVICE).toMatch(/NOT_ASSIGNED_TO_UNIT:/);
    expect(SERVICE).toMatch(/EMPLOYEE_NOT_IN_MY_TEAM:/);
  });

  it('لا يستخدم prompt أو confirm المحظورين', () => {
    // نُجرّد التعليقات أولاً: ذكر «بديل prompt() المحظور» في تعليق
    // توثيقي ليس استخداماً، وحجبه يدفع لحذف توثيق مفيد.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    for (const file of [
      'src/pages/manager/units/movement/ManagerMovementApprovalsPage.tsx',
      'src/pages/manager/units/movement/ManagerMovementTeamPage.tsx',
    ]) {
      const code = stripComments(read(file));
      expect(code).not.toMatch(/\bwindow\.prompt\(|(?<![.\w])prompt\(/);
      expect(code).not.toMatch(/\bwindow\.confirm\(|(?<![.\w])confirm\(/);
    }
  });
});

describe('الاختبار السلوكي', () => {
  it('يغطي الحالات الحرجة', () => {
    expect(VERIFY).toContain('يرفض الاعتماد خارج الفريق');
    expect(VERIFY).toContain('الفريق يشمل حفيد القسم (وراثة الشجرة)');
    expect(VERIFY).toContain('الفريق لا يشمل قسماً آخر');
    expect(VERIFY).toContain('حارس الوحدة يرفض غير المُسنَد');
    expect(VERIFY).toContain('لا إسناد يعبر حدود المستأجر');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});
