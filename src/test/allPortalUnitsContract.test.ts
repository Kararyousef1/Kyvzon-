/**
 * allPortalUnitsContract.test.ts
 *
 * عقد تفعيل الوحدات التسع كاملةً — بصفحة عامة واحدة.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * القرار المعماري الذي يحرسه:
 *   9 وحدات × دورين = 16 صفحة موافقات محتملة. نسخها يعني 16 نسخة من
 *   نفس المنطق و16 فرصة للتباعد. لكن المحرك الموحّد (0305) يخدمها كلها
 *   عبر my_approval_inbox(unitKey) — فالاختلاف **معامل** لا صفحة.
 *
 *   الاستثناء المتعمّد: وحدة الحركة لها صفحتان مخصّصتان لأن منظورها
 *   أغنى من قائمة موافقات — مبرَّر بالوظيفة لا بالنسخ.
 *
 * ما يحرس ضده:
 *   ① منح المشرف صلاحية اعتماد في الصفحة العامة
 *   ② وحدة نشطة بلا صفحات (وعد كاذب)
 *   ③ صفحة غير مُسجَّلة في المواضع الأربعة
 *   ④ انحراف unit_key بين الكتالوج والخرائط والقاعدة
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
} from '../shared/constants/portalUnits';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const PAGE = read('src/pages/manager/units/UnitApprovalsPage.tsx');
const GUARD = read('src/router/guards/RequireDynamicPortalUnit.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const HYBRID = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const PERMS = read('src/core/constants/permissions.ts');
const M0302 = read('supabase/migrations/0302_portal_unit_assignments.sql');

describe('الكتالوج — التسع كلها نشطة', () => {
  it('تسع وحدات', () => {
    expect(PORTAL_UNITS).toHaveLength(9);
  });

  it('لا وحدة مخطَّطة متبقية', () => {
    const planned = PORTAL_UNITS.filter((u) => u.status === 'planned');
    expect(planned.map((u) => u.unitKey)).toEqual([]);
  });

  it('كل وحدة نشطة لها صفحة مدير على الأقل', () => {
    for (const u of PORTAL_UNITS) {
      expect(u.managerPages.length, `${u.unitKey} بلا صفحات مدير`).toBeGreaterThan(0);
    }
  });

  it('كل وحدة متاحة للمشرف لها صفحة مشرف', () => {
    for (const u of PORTAL_UNITS.filter((x) => x.baseRoles.includes('supervisor'))) {
      expect(u.supervisorPages.length, `${u.unitKey} بلا صفحات مشرف`).toBeGreaterThan(0);
    }
  });

  it('المشرف خمس وحدات · المدير تسع', () => {
    expect(unitsForBaseRole('manager')).toHaveLength(9);
    expect(unitsForBaseRole('supervisor')).toHaveLength(5);
  });

  it('لا وحدة مالية أو مشتريات أو عقود أو CRM للمشرف', () => {
    const supKeys = unitsForBaseRole('supervisor').map((u) => u.unitKey);
    for (const k of ['finance', 'procurement', 'contracts', 'crm']) {
      expect(supKeys).not.toContain(k);
    }
  });

  it('كل المعرّفات فريدة', () => {
    const ids = allUnitPageIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('وحدة الحركة وحدها لها صفحتان للمدير (استثناء مبرَّر)', () => {
    const richer = PORTAL_UNITS.filter((u) => u.managerPages.length > 1);
    expect(richer.map((u) => u.unitKey)).toEqual(['movement']);
  });
});

describe('تطابق unit_key مع قيد القاعدة', () => {
  it('كل مفتاح في الكتالوج مسموح في 0302', () => {
    const m = /unit_key\s+VARCHAR\(\d+\) NOT NULL[\s\S]{0,200}?CHECK \(unit_key IN \(([\s\S]*?)\)\)/.exec(M0302);
    expect(m).not.toBeNull();
    const dbKeys = new Set(Array.from(m![1].matchAll(/'([^']+)'/g)).map((x) => x[1]));
    const missing = PORTAL_UNITS.map((u) => u.unitKey).filter((k) => !dbKeys.has(k));
    expect(missing).toEqual([]);
  });
});

describe('UnitApprovalsPage — صفحة واحدة لكل الوحدات', () => {
  it('تقرأ unitKey من المسار', () => {
    expect(PAGE).toMatch(/useParams<\{ unitKey\?: string \}>/);
    expect(PAGE).toMatch(/fixedUnitKey \?\? params\.unitKey/);
  });

  it('تستخدم المحرك الموحّد بمعامل الوحدة', () => {
    expect(PAGE).toMatch(/unifiedApprovalService\.findMyInbox\(unitKey\)/);
  });

  it('🔴 المشرف لا يرى أزرار الاعتماد', () => {
    expect(PAGE).toMatch(/const canDecide = baseRole === 'manager'/);
    expect(PAGE).toMatch(/\{canDecide && \(/);
  });

  it('توضّح للمشرف حدود صلاحيته', () => {
    expect(PAGE).toMatch(/\{!canDecide && \(/);
    expect(PAGE).toContain('الاعتماد صلاحية المدير');
  });

  it('تُلزم بسبب عند الرفض', () => {
    expect(PAGE).toMatch(/decision === 'rejected' && !comments\.trim\(\)/);
  });

  it('تتعامل مع وحدة غير معروفة', () => {
    expect(PAGE).toMatch(/if \(!unitKey \|\| !unit\)/);
  });

  it('لا تلمس Supabase مباشرة', () => {
    expect(PAGE).not.toMatch(/from '.*services\/supabase/);
    expect(PAGE).not.toMatch(/supabase\./);
  });

  it('لا prompt أو confirm', () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/(?<![.\w])prompt\(/);
    expect(code).not.toMatch(/(?<![.\w])confirm\(/);
  });
});

describe('RequireDynamicPortalUnit — حارس المسار الديناميكي', () => {
  it('يرفض مفتاحاً غير معروف قبل القاعدة', () => {
    expect(GUARD).toMatch(/const unit = unitKey \? findUnit\(unitKey\) : undefined/);
    expect(GUARD).toMatch(/if \(!unit \|\| !unit\.baseRoles\.includes\(baseRole\)\)/);
  });

  it('يمنع وحدة غير متاحة للدور (المشرف والمالية مثلاً)', () => {
    expect(GUARD).toMatch(/!unit\.baseRoles\.includes\(baseRole\)/);
  });

  it('يفوّض الفحص الفعلي إلى RequirePortalUnit', () => {
    expect(GUARD).toMatch(/<RequirePortalUnit baseRole=\{baseRole\}/);
  });
});

describe('AppRouter — المسار الديناميكي للدورين', () => {
  it('يستورد الحارس والصفحة', () => {
    expect(ROUTER).toMatch(/import \{ RequireDynamicPortalUnit \}/);
    expect(ROUTER).toMatch(/const UnitApprovalsPage/);
  });

  it('مسار المدير محروس بـ baseRole="manager"', () => {
    expect(ROUTER).toMatch(
      /<Route path="units\/:unitKey" element=\{<RequireDynamicPortalUnit baseRole="manager" \/>\}>/,
    );
  });

  it('مسار المشرف محروس بـ baseRole="supervisor"', () => {
    expect(ROUTER).toMatch(
      /<Route path="units\/:unitKey" element=\{<RequireDynamicPortalUnit baseRole="supervisor" \/>\}>/,
    );
  });

  it('الصفحة تتلقى الدور الصحيح في كل مسار', () => {
    expect(ROUTER).toMatch(/<UnitApprovalsPage baseRole="manager" \/>/);
    expect(ROUTER).toMatch(/<UnitApprovalsPage baseRole="supervisor" \/>/);
  });
});

describe('التسجيل في المواضع الأربعة — كل الصفحات', () => {
  const ALL_IDS = allUnitPageIds();

  it.each(ALL_IDS)('%s مُسجَّلة في Sidebar', (id) => {
    expect(SIDEBAR).toContain(`'${id}'`);
  });

  it.each(ALL_IDS)('%s مُسجَّلة في hybridPagesCatalog', (id) => {
    expect(HYBRID).toContain(`'${id}'`);
  });

  it.each(ALL_IDS)('%s مُسجَّلة في AdminEmployeesPage', (id) => {
    expect(ADMIN).toContain(`'${id}'`);
  });

  it.each(ALL_IDS)('%s مُسجَّلة في legacyRedirect', (id) => {
    expect(LEGACY).toContain(`'${id}'`);
  });

  it.each(ALL_IDS)('%s مُسجَّلة في permissions', (id) => {
    expect(PERMS).toContain(`'${id}'`);
  });
});

describe('Sidebar — خرائط الوحدات كاملة', () => {
  const ALL_IDS = allUnitPageIds();

  it('كل صفحة وحدة لها مفتاح وحدة في UNIT_PAGE_UNIT_KEY', () => {
    const block = SIDEBAR.slice(
      SIDEBAR.indexOf('const UNIT_PAGE_UNIT_KEY'),
      SIDEBAR.indexOf('const UNIT_PAGE_BASE_ROLE'),
    );
    for (const id of ALL_IDS) {
      expect(block, `${id} مفقودة من UNIT_PAGE_UNIT_KEY`).toContain(`'${id}'`);
    }
  });

  it('كل صفحة وحدة لها دور أساس في UNIT_PAGE_BASE_ROLE', () => {
    const start = SIDEBAR.indexOf('const UNIT_PAGE_BASE_ROLE');
    const block = SIDEBAR.slice(start, SIDEBAR.indexOf('};', start));
    for (const id of ALL_IDS) {
      expect(block, `${id} مفقودة من UNIT_PAGE_BASE_ROLE`).toContain(`'${id}'`);
    }
  });

  it('مفاتيح الوحدات في الخريطة تطابق الكتالوج', () => {
    const block = SIDEBAR.slice(
      SIDEBAR.indexOf('const UNIT_PAGE_UNIT_KEY'),
      SIDEBAR.indexOf('const UNIT_PAGE_BASE_ROLE'),
    );
    for (const u of PORTAL_UNITS) {
      for (const p of [...u.managerPages, ...u.supervisorPages]) {
        expect(block, `${p.id} → ${u.unitKey}`).toMatch(
          new RegExp(`'${p.id}':\\s*'${u.unitKey}'`),
        );
      }
    }
  });

  it('صفحات المشرف موسومة supervisor لا manager', () => {
    const start = SIDEBAR.indexOf('const UNIT_PAGE_BASE_ROLE');
    const block = SIDEBAR.slice(start, SIDEBAR.indexOf('};', start));
    for (const u of PORTAL_UNITS) {
      for (const p of u.supervisorPages) {
        expect(block).toMatch(new RegExp(`'${p.id}':\\s*'supervisor'`));
      }
    }
  });
});

describe('المسارات متسقة مع الكتالوج', () => {
  it('كل مسار في legacyRedirect يطابق path في الكتالوج', () => {
    for (const u of PORTAL_UNITS) {
      for (const p of u.managerPages) {
        expect(LEGACY).toContain(`/app/manager/${p.path}`);
      }
      for (const p of u.supervisorPages) {
        expect(LEGACY).toContain(`/app/supervisor/${p.path}`);
      }
    }
  });
});
