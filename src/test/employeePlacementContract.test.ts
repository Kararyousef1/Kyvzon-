/**
 * employeePlacementContract.test.ts — عقد 0319 وإصلاحات الواجهة
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الأعطال التي يحرسها (مُثبَتة على قاعدة حقيقية في تدقيق 0318):
 *
 *   ① مسار تعديل الموظف لا يحفظ branch_id ولا shift_code
 *   ② القراءة تستعمل emp.branch_id — عمود غير موجود على profiles
 *   ③ قائمة الورديات أربع قيم ثابتة في JSX
 *   ④ detect_subscription_conflicts بلا واجهة
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const MIG = read('supabase/migrations/0319_employee_placement_and_shift_catalog.sql');
const SVC = read('src/services/sdk/EmployeePlacementService.ts');
const PLAT = read('src/services/sdk/PlatformService.ts');
const PAGE = read('src/pages/admin/AdminEmployeesPage.tsx');
const CONF = read('src/pages/devportal/pages/SubscriptionConflictsPage.tsx');
const TYPES = read('src/pages/devportal/types/index.ts');
const PORTAL = read('src/pages/devportal/KyvzonDevPortal.tsx');
const LAYOUT = read('src/pages/devportal/components/Layout.tsx');

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((l) => {
      const i = l.indexOf('--');
      return i === -1 ? l : l.slice(0, i);
    })
    .join('\n');
}

function fnScope(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  if (start === -1) throw new Error(`${name} غير موجودة`);
  const c = sql.indexOf(`COMMENT ON FUNCTION public.${name}`, start);
  return sql.slice(start, c === -1 ? sql.length : c);
}

const CODE = stripSqlComments(MIG);

// ═══════════════════════════════════════════════════════════════════════
describe('0319 — دوال التنسيب', () => {
  const fns = ['shift_catalog', 'set_employee_placement', 'employee_placement'];

  it.each(fns)('%s معرَّفة ومُسقَطة صراحةً', (fn) => {
    expect(CODE).toContain(`CREATE FUNCTION public.${fn}`);
    expect(CODE).toContain(`DROP FUNCTION IF EXISTS public.${fn}`);
  });

  it.each(fns)('%s تثبّت search_path', (fn) => {
    expect(fnScope(CODE, fn)).toContain('SET search_path = public');
  });

  it('anon محروم من كل دالة', () => {
    for (const fn of fns) {
      expect(CODE, fn).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]{0,30}FROM anon`),
      );
    }
  });
});

describe('0319 — ★ NULL يعني «لا تغيير» لا «امسح»', () => {
  const scope = fnScope(CODE, 'set_employee_placement');

  it('يستعمل COALESCE للقسم والفرع', () => {
    expect(scope).toContain('COALESCE(p_department_id, e.department_id)');
    expect(scope).toContain('COALESCE(p_branch_id,     e.branch_id)');
  });

  it('السلسلة الفارغة وحدها تمسح الوردية', () => {
    expect(scope).toContain("WHEN btrim(p_shift_code) = '' THEN NULL");
    expect(scope).toContain('WHEN p_shift_code IS NULL THEN e.shift_code');
  });

  it('★ لا تعيين مباشر يمحو حقلاً لم يُلمَس', () => {
    // هذا بعينه العطل الأصلي: تحديث لا يخصّ الفرع محاه
    expect(scope).not.toMatch(/SET[\s\S]*branch_id\s*=\s*p_branch_id\s*,/);
  });
});

describe('0319 — تحقق الانتماء للمستأجر', () => {
  const scope = fnScope(CODE, 'set_employee_placement');

  it.each([
    ['TARGET_USER_NOT_IN_TENANT', 'المستخدم'],
    ['DEPARTMENT_NOT_IN_TENANT', 'القسم'],
    ['BRANCH_NOT_IN_TENANT', 'الفرع'],
    ['SHIFT_NOT_FOUND', 'الوردية'],
  ])('يرفض %s', (code) => {
    expect(scope).toContain(code);
  });

  it('الامتياز إداري لا لأي مستخدم', () => {
    expect(scope).toContain('NOT_AUTHORIZED_TO_PLACE_EMPLOYEE');
    expect(scope).toContain("'admin','hr','developer','it_admin'");
  });

  it('الوردية تُقبل من الكتالوج المُستأجَر أو القوالب العامة', () => {
    expect(scope).toContain('s.tenant_id IS NULL OR s.tenant_id = v_tenant');
  });
});

describe('0319 — كتالوج الورديات', () => {
  const scope = fnScope(CODE, 'shift_catalog');

  it('يقرأ من structure_shifts لا من قائمة ثابتة', () => {
    expect(scope).toContain('FROM public.structure_shifts');
    expect(scope).not.toMatch(/VALUES\s*\(\s*'morning'/);
  });

  it('يفلتر بالمستأجر مع القوالب العامة', () => {
    expect(scope).toContain('s.tenant_id IS NULL OR s.tenant_id = public.current_user_tenant_id()');
  });

  it('يستبعد غير النشط', () => {
    expect(scope).toContain('COALESCE(s.is_active, TRUE)');
  });

  it('القوالب الأربعة تُضاف بلا تكرار', () => {
    expect(CODE).toContain("('morning',  'الوردية الصباحية'");
    expect(CODE).toContain('WHERE NOT EXISTS');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('EmployeePlacementService — طبقة SDK', () => {
  it('يغلّف الدوال الثلاث', () => {
    for (const rpc of ['shift_catalog', 'employee_placement', 'set_employee_placement']) {
      expect(SVC, rpc).toContain(`'${rpc}'`);
    }
  });

  it('★ undefined ⇒ null (لا تغيير) و "" يمرّ كما هو (مسح)', () => {
    expect(SVC).toContain("p_shift_code: input.shiftCode === undefined ? null : input.shiftCode");
  });

  it('يترجم أخطاء القاعدة للعربية', () => {
    expect(SVC).toContain('BRANCH_NOT_IN_TENANT');
    expect(SVC).toContain('SHIFT_NOT_FOUND');
    expect(SVC).toContain('translateError');
  });

  it('يوثّق دلالة «لا تغيير»', () => {
    expect(SVC).toContain('لا تغيير');
  });
});

describe('PlatformService — حدود بوابة المطوّرين', () => {
  it('يُعرّض كشف التعارضات', () => {
    expect(PLAT).toContain("supabase.rpc('detect_subscription_conflicts')");
  });

  it('★ لا يقرأ بيانات عملاء', () => {
    for (const t of ['employees', 'legal_entities', 'leaves', 'profiles', 'payroll']) {
      expect(PLAT, t).not.toContain(`from('${t}')`);
    }
  });

  it('يوثّق حدوده صراحةً', () => {
    expect(PLAT).toContain('لا لبيانات العملاء');
    expect(PLAT).toContain('576');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('AdminEmployeesPage — الأعطال الثلاثة', () => {
  it('★ ① التعديل يحفظ التنسيب', () => {
    expect(PAGE).toContain('employeePlacementService.savePlacement');
    expect(PAGE).toContain('branchId:     form.branch_id || null');
  });

  it('★ ② فتح التعديل يقرأ التنسيب الحقيقي', () => {
    expect(PAGE).toContain('employeePlacementService\n      .findPlacement(emp.id)');
    expect(PAGE).toContain('branch_id:     pl.branchId ?? \'\'');
    expect(PAGE).toContain('shift_code:    pl.shiftCode ?? \'\'');
  });

  it('★ ③ قائمة الورديات من القاعدة', () => {
    expect(PAGE).toContain('shiftOptions.map');
    expect(PAGE).toContain('employeePlacementService.findShifts()');
  });

  it('★ لا قيم ورديات ثابتة في JSX', () => {
    expect(PAGE).not.toContain('<option value="morning">');
    expect(PAGE).not.toContain('<option value="flexible">');
  });

  it('فشل تحميل الورديات لا يُسقط الشاشة', () => {
    expect(PAGE).toMatch(/findShifts\(\)\.catch\(\(\) => \[\]\)/);
  });

  it('يوثّق العطل الأصلي في الشيفرة', () => {
    expect(PAGE).toContain('يُهمَل صامتاً');
  });
});

describe('SubscriptionConflictsPage — شاشة التعارضات', () => {
  it('★ لا تلمس Supabase مباشرة', () => {
    expect(CONF).not.toContain('supabase.rpc(');
    expect(CONF).not.toContain('supabase.from(');
    expect(CONF).toContain('platformService.findSubscriptionConflicts');
  });

  it('تشرح كل نوع تعارض عملياً', () => {
    for (const issue of [
      'هجين بلا صفحات',
      'صفحات مخصّصة بلا خطة هجينة',
      'اشتراك منتهٍ وما زال نشطاً',
      'وحدة بلا تفعيل',
    ]) {
      expect(CONF, issue).toContain(issue);
    }
  });

  it('تميّز الحرج عن التحذيري', () => {
    expect(CONF).toContain('ISSUE_TONE');
    expect(CONF).toContain('criticalCount');
  });

  it('تعرض حالة «لا تعارضات» بوضوح', () => {
    expect(CONF).toContain('لا تعارضات');
  });

  it('لا confirm() ولا as any', () => {
    const code = CONF.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/(?<![\w.])confirm\s*\(/);
    expect(code).not.toMatch(/\bas any\b/);
  });
});

describe('تسجيل صفحة التعارضات في بوابة المطوّرين', () => {
  it('① النوع DevPortalPage', () => {
    expect(TYPES).toContain("| 'subscription-conflicts'");
  });

  it('② PAGE_META', () => {
    expect(TYPES).toContain("'subscription-conflicts': { title: 'تعارضات الاشتراك'");
  });

  it('③ التوجيه', () => {
    expect(PORTAL).toContain("case 'subscription-conflicts':");
    expect(PORTAL).toContain('SubscriptionConflictsPage');
  });

  it('④ عنصر التنقل', () => {
    expect(LAYOUT).toContain("id: 'subscription-conflicts'");
    expect(LAYOUT).toContain('تعارضات الاشتراك');
  });

  it('★ الصفحة داخل /dev المحمي بدور المطوّر', () => {
    const router = read('src/router/AppRouter.tsx');
    expect(router).toMatch(/path="\/dev"[\s\S]{0,120}roles=\{\['developer', 'it_admin'\]\}/);
  });
});
