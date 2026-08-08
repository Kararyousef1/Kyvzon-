/**
 * supervisorUnitAndBridgesContract.test.ts
 *
 * عقد وحدة المشرف (0307) وربط جسور الموافقات بالواجهات.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *   ① منح المشرف صلاحية اعتماد — خرق للنموذج التنظيمي
 *   ② فشل الجسر يُفشل العملية الأصلية (القيد قُدِّم فعلاً)
 *   ③ فقدان استدعاء الجسر ⇒ عودة الأنظمة لحالة «ميتة»
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PORTAL_UNITS, pagesForUnit, findUnit } from '../shared/constants/portalUnits';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const M0307 = read('supabase/migrations/0307_supervisor_movement_unit.sql');
const SUP_SERVICE = read('src/services/sdk/SupervisorMovementUnitService.ts');
const SUP_PAGE = read('src/pages/supervisor/units/movement/SupervisorMovementShiftPage.tsx');
const GL_SERVICE = read('src/services/sdk/GeneralLedgerService.ts');
const BOM_SERVICE = read('src/services/sdk/MrpBomService.ts');
const BOM_PAGE = read('src/pages/app/mrp/bom/MrpBomShared.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const HYBRID = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const PERMS = read('src/core/constants/permissions.ts');
const VERIFY = read('tools/dev/verify-supervisor-unit-0307.sql');

describe('0307 — المشرف يتابع ولا يعتمد', () => {
  it('لا دالة قرار في المايجريشن إطلاقاً', () => {
    expect(M0307).not.toMatch(/decide|approve_permit/i);
  });

  it('لا تعديل على التصاريح', () => {
    expect(M0307).not.toMatch(/UPDATE\s+public\.employee_movement_permits/i);
  });

  it('لا إنشاء موافقات', () => {
    expect(M0307).not.toMatch(/INSERT\s+INTO\s+public\.employee_movement_approvals/i);
  });

  it('يحوي حارساً بنيوياً يفحص تعريف الدوال نفسها', () => {
    // الحارس يقرأ pg_get_functiondef — فلا يكفي غياب النص من المايجريشن
    expect(M0307).toMatch(/pg_get_functiondef\(p\.oid\) INTO v_def/);
    expect(M0307).toMatch(/must not modify permits \(supervisor cannot approve\)/);
    expect(M0307).toMatch(/must not create approvals/);
  });

  it('كل دالة تستدعي حارس وحدة المشرف', () => {
    for (const fn of ['supervisor_movement_shift', 'supervisor_movement_shift_kpis']) {
      const start = M0307.indexOf(`FUNCTION public.${fn}`);
      const end = M0307.indexOf(`COMMENT ON FUNCTION public.${fn}`);
      expect(start).toBeGreaterThan(-1);
      const body = M0307.slice(start, end);
      expect(body).toMatch(/PERFORM public\.require_portal_unit\('supervisor', 'movement'\)/);
    }
  });

  it('كل استعلام يفلتر بالفريق', () => {
    const fn = M0307.slice(
      M0307.indexOf('FUNCTION public.supervisor_movement_shift('),
      M0307.indexOf('COMMENT ON FUNCTION public.supervisor_movement_shift('),
    );
    expect(fn).toMatch(
      /WHERE m\.tenant_id = public\.current_user_tenant_id\(\)[\s\S]{0,220}AND public\.is_in_my_team\(m\.employee_id\)/,
    );
  });

  it('المتأخر الخارج يظهر أولاً', () => {
    expect(M0307).toMatch(/ORDER BY \(m\.returned_at IS NULL\) DESC/);
  });

  it('anon محروم', () => {
    expect(M0307).toMatch(/FROM anon/);
    expect(M0307).toMatch(/anon can execute %s/);
  });
});

describe('SupervisorMovementUnitService — بلا قرار', () => {
  it('لا دالة اعتماد في الخدمة', () => {
    // نُجرّد التعليقات: الملف يشرح **لماذا** لا يعتمد المشرف، فذكر
    // الكلمة في التوثيق ليس دالة. نفحص الشيفرة وحدها.
    const code = SUP_SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/async\s+(decide|approve)\w*\s*\(/i);
    expect(code).not.toMatch(/rpc\('[a-z_]*(decide|approve)[a-z_]*'/i);
  });

  it('يستدعي دالتَي 0307', () => {
    expect(SUP_SERVICE).toMatch(/rpc\('supervisor_movement_shift'/);
    expect(SUP_SERVICE).toMatch(/rpc\('supervisor_movement_shift_kpis'/);
  });

  it('يترجم الأخطاء للعربية', () => {
    expect(SUP_SERVICE).toContain('NOT_ASSIGNED_TO_UNIT:');
  });
});

describe('SupervisorMovementShiftPage', () => {
  it('لا أزرار اعتماد', () => {
    expect(SUP_PAGE).not.toMatch(/موافقة|اعتماد التصريح/);
  });

  it('يوضّح للمستخدم حدود صلاحيته', () => {
    expect(SUP_PAGE).toContain('الاعتماد على تصاريح الخروج صلاحية المدير');
  });

  it('يُبرز المتأخرين بصرياً', () => {
    expect(SUP_PAGE).toMatch(/overdueMinutes > 0/);
    expect(SUP_PAGE).toContain('تأخّر');
  });

  it('لا يلمس Supabase مباشرة', () => {
    expect(SUP_PAGE).not.toMatch(/from '.*services\/supabase/);
    expect(SUP_PAGE).not.toMatch(/supabase\./);
  });

  it('لا prompt أو confirm', () => {
    const code = SUP_PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/(?<![.\w])prompt\(/);
    expect(code).not.toMatch(/(?<![.\w])confirm\(/);
  });
});

describe('تسجيل وحدة المشرف في المواضع الأربعة', () => {
  const ID = 'supervisor-unit-movement-shift';

  it.each([
    ['Sidebar', () => SIDEBAR],
    ['hybridPagesCatalog', () => HYBRID],
    ['AdminEmployeesPage', () => ADMIN],
    ['legacyRedirect', () => LEGACY],
    ['permissions', () => PERMS],
  ])('مُسجَّلة في %s', (_name, getSrc) => {
    expect(getSrc()).toContain(ID);
  });

  it('المسار تحت /app/supervisor/units/movement', () => {
    expect(LEGACY).toContain('/app/supervisor/units/movement/shift');
  });

  it('الحارس يفحص دور المشرف لا المدير', () => {
    expect(SIDEBAR).toMatch(/UNIT_PAGE_BASE_ROLE/);
    expect(SIDEBAR).toMatch(/'supervisor-unit-movement-shift': 'supervisor'/);
    expect(SIDEBAR).toMatch(/hasPortalUnit\(unitBase, unitKey as PortalUnitKey\)/);
  });

  it('الصفحة داخل كتلة RequirePortalUnit للمشرف', () => {
    const start = ROUTER.indexOf('<RequirePortalUnit baseRole="supervisor" unitKey="movement" />');
    expect(start).toBeGreaterThan(-1);
    const end = ROUTER.indexOf('</Route>', start);
    expect(ROUTER.slice(start, end)).toContain('path="shift"');
  });

  it('الكتالوج يعرّف صفحة المشرف', () => {
    const unit = findUnit('movement');
    expect(pagesForUnit(unit!, 'supervisor')).toHaveLength(1);
    expect(pagesForUnit(unit!, 'supervisor')[0].id).toBe(ID);
  });
});

describe('ربط الجسور بالواجهات', () => {
  it('submitEntry يستدعي جسر المالية', () => {
    const fn = GL_SERVICE.slice(
      GL_SERVICE.indexOf('async submitEntry'),
      GL_SERVICE.indexOf('async approveEntry'),
    );
    expect(fn).toMatch(/rpc\('create_financial_approval'/);
    expect(fn).toMatch(/p_request_type: 'journal_entry'/);
  });

  it('فشل الجسر لا يُفشل تقديم القيد', () => {
    const fn = GL_SERVICE.slice(
      GL_SERVICE.indexOf('async submitEntry'),
      GL_SERVICE.indexOf('async approveEntry'),
    );
    // لا throw بعد استدعاء الجسر — تحذير فقط
    expect(fn).toMatch(/if \(bridgeError\)[\s\S]{0,120}logger\.warn/);
    const afterBridge = fn.slice(fn.indexOf('create_financial_approval'));
    expect(afterBridge).not.toMatch(/throw new Error\(bridgeError/);
  });

  it('submitForApproval يستدعي جسر التصنيع', () => {
    expect(BOM_SERVICE).toMatch(/rpc\('create_mrp_bom_approval'/);
    expect(BOM_SERVICE).toMatch(/async submitForApproval/);
  });

  it('submitForApproval ينقل الحالة إلى in_review', () => {
    expect(BOM_SERVICE).toMatch(/status:'in_review'/);
  });

  it('فشل نقل الحالة لا يُلغي الطلب', () => {
    expect(BOM_SERVICE).toMatch(/statusError.*logger\.warn/s);
  });

  it('واجهة BOM تعرض زر التقديم', () => {
    expect(BOM_PAGE).toMatch(/submitForApproval/);
    expect(BOM_PAGE).toContain('تقديم للاعتماد');
  });

  it('approve القديمة لم تُحذف (توافق خلفي)', () => {
    expect(BOM_SERVICE).toMatch(/async approve\(id:string,effectiveFrom\?:string\)/);
    expect(BOM_PAGE).toContain('Approve Effective');
  });
});

describe('الكتالوج — نطاق المشرف أضيق', () => {
  it('وحدة الحركة نشطة للدورين', () => {
    const unit = findUnit('movement');
    expect(unit?.baseRoles).toContain('manager');
    expect(unit?.baseRoles).toContain('supervisor');
  });

  it('المدير له صفحتان والمشرف واحدة', () => {
    const unit = findUnit('movement')!;
    expect(pagesForUnit(unit, 'manager')).toHaveLength(2);
    expect(pagesForUnit(unit, 'supervisor')).toHaveLength(1);
  });

  it('لا وحدة مالية أو مشتريات للمشرف', () => {
    const supUnits = PORTAL_UNITS.filter((u) => u.baseRoles.includes('supervisor'));
    for (const k of ['finance', 'procurement', 'contracts', 'crm']) {
      expect(supUnits.map((u) => u.unitKey)).not.toContain(k);
    }
  });
});

describe('الاختبار السلوكي 0307', () => {
  it('يثبت الفصل بين الدورين', () => {
    expect(VERIFY).toContain('المشرف لا يعتمد تصريحاً');
    expect(VERIFY).toContain('المشرف لا يرى شاشة اعتماد المدير');
    expect(VERIFY).toContain('المدير يعاين شاشة المشرف');
    expect(VERIFY).toContain('لا دالة مشرف تعدّل التصاريح (حارس بنيوي)');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});
