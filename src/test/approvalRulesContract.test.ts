/**
 * approvalRulesContract.test.ts
 *
 * عقد إدارة قواعد الاعتماد (0308).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *   ① فقدان صلاحية إدارية ⇒ أي موظف يعبث بقواعد الاعتماد
 *   ② حذف قاعدة بدل تعطيلها (سياسة archive)
 *   ③ فقدان كاشف الفجوات ⇒ طلبات تقع في فراغ صامت
 *   ④ انحراف قائمة الأدوار بين الواجهة وقيد القاعدة
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PORTAL_UNITS } from '../shared/constants/portalUnits';

/**
 * ⚠️ لا نستورد ApprovalRulesService: استيراده يُهيّئ عميل Supabase
 * فيفشل في بيئة الاختبار بلا متغيّرات بيئة. نستخرج التسميات نصّياً —
 * وهذا أصحّ أيضاً لأنه يفحص الملف الحقيقي لا نسخة مستوردة.
 */
type ApprovalRuleRole = 'supervisor' | 'manager' | 'direct_manager' | 'unit_manager' | 'admin';

function parseRoleLabels(src: string): Record<string, string> {
  const m = /APPROVAL_RULE_ROLE_LABELS: Record<ApprovalRuleRole, string> = \{([\s\S]*?)\};/.exec(src);
  if (!m) throw new Error('تعذّر استخراج APPROVAL_RULE_ROLE_LABELS');
  const out: Record<string, string> = {};
  for (const e of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) out[e[1]] = e[2];
  return out;
}

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const M0305 = read('supabase/migrations/0305_unified_approvals_engine.sql');
const M0308 = read('supabase/migrations/0308_approval_rules_management.sql');
const SERVICE = read('src/services/sdk/ApprovalRulesService.ts');
const PAGE = read('src/pages/admin/ApprovalRulesAdminPage.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const HYBRID = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const PERMS = read('src/core/constants/permissions.ts');
const VERIFY = read('tools/dev/verify-approval-rules-0308.sql');

describe('0308 — دوال الإدارة', () => {
  it.each([
    'upsert_approval_rule',
    'set_approval_rule_active',
    'approval_rules_board',
    'detect_approval_rule_gaps',
  ])('%s معرَّفة', (fn) => {
    expect(M0308).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
  });

  it('الكتابة تحتاج صلاحية إدارية', () => {
    for (const fn of ['upsert_approval_rule', 'set_approval_rule_active']) {
      const start = M0308.indexOf(`FUNCTION public.${fn}`);
      const end = M0308.indexOf(`COMMENT ON FUNCTION public.${fn}`);
      const body = M0308.slice(start, end);
      expect(body, `${fn} بلا فحص صلاحية`).toMatch(/NOT_AUTHORIZED_TO_MANAGE_RULES/);
    }
  });

  it('فحص الصلاحية يسبق أي كتابة', () => {
    const start = M0308.indexOf('FUNCTION public.upsert_approval_rule');
    const end = M0308.indexOf('COMMENT ON FUNCTION public.upsert_approval_rule');
    const body = M0308.slice(start, end);
    const auth = body.indexOf('NOT_AUTHORIZED_TO_MANAGE_RULES');
    const write = body.indexOf('INSERT INTO public.approval_rules');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(write);
  });

  it('لا حذف — تعطيل فقط (سياسة archive)', () => {
    expect(M0308).not.toMatch(/DELETE\s+FROM\s+public\.approval_rules/i);
    expect(M0308).toMatch(/must not delete rules \(archive policy\)/);
  });

  it('يتحقق من صحة المبالغ والاسم', () => {
    expect(M0308).toMatch(/INVALID_AMOUNT_RANGE/);
    expect(M0308).toMatch(/NEGATIVE_AMOUNT/);
    expect(M0308).toMatch(/RULE_NAME_REQUIRED/);
  });

  it('يتحقق من انتماء القسم للمستأجر', () => {
    expect(M0308).toMatch(/DEPARTMENT_NOT_FOUND/);
    expect(M0308).toMatch(/FROM public\.departments[\s\S]{0,120}tenant_id = v_tenant/);
  });

  it('anon محروم من الأربع', () => {
    expect(M0308).toMatch(/FROM anon/);
    expect(M0308).toMatch(/anon can execute %s/);
  });
});

describe('0308 — كاشف الفجوات', () => {
  const FN = (() => {
    const start = M0308.indexOf('FUNCTION public.detect_approval_rule_gaps');
    const end = M0308.indexOf('COMMENT ON FUNCTION public.detect_approval_rule_gaps');
    return M0308.slice(start, end);
  })();

  it('يكشف تداخل النطاقات', () => {
    expect(FN).toMatch(/a\.min_amount <= b\.max_amount/);
    expect(FN).toMatch(/b\.min_amount <= a\.max_amount/);
    expect(FN).toContain('نطاقان متداخلان');
  });

  it('يكشف الفجوات بين النطاقات', () => {
    expect(FN).toMatch(/LEAD\(ar\.min_amount\)/);
    expect(FN).toMatch(/next_min > max_amount \+ 0\.01/);
    expect(FN).toContain('فجوة بين نطاقين');
  });

  it('يكشف الأدوار بلا شاغل', () => {
    expect(FN).toMatch(/FROM public\.org_role_assignments o/);
    expect(FN).toContain('دور بلا شاغل');
  });

  it('ينبّه على الوحدات بلا قواعد', () => {
    expect(FN).toContain('وحدة بلا قواعد');
  });

  it('يميّز ثلاث درجات خطورة', () => {
    expect(FN).toMatch(/out_severity := 'error'/);
    expect(FN).toMatch(/out_severity := 'warning'/);
    expect(FN).toMatch(/out_severity := 'info'/);
  });

  it('يقارن التداخل داخل نفس القسم فقط', () => {
    expect(FN).toMatch(/b\.department_id IS NOT DISTINCT FROM a\.department_id/);
  });
});

describe('تطابق الأدوار مع قيد القاعدة', () => {
  it('كل دور في الواجهة مسموح في قيد 0305', () => {
    const m = /required_role VARCHAR\(\d+\) NOT NULL[\s\S]{0,220}?CHECK \(required_role IN \(([\s\S]*?)\)\)/.exec(M0305);
    expect(m).not.toBeNull();
    const dbRoles = new Set(Array.from(m![1].matchAll(/'([^']+)'/g)).map((x) => x[1]));
    const uiRoles = Object.keys(parseRoleLabels(SERVICE)) as ApprovalRuleRole[];
    const missing = uiRoles.filter((r) => !dbRoles.has(r));
    expect(missing).toEqual([]);
  });

  it('كل دور في القاعدة له تسمية عربية', () => {
    const m = /required_role VARCHAR\(\d+\) NOT NULL[\s\S]{0,220}?CHECK \(required_role IN \(([\s\S]*?)\)\)/.exec(M0305);
    const dbRoles = Array.from(m![1].matchAll(/'([^']+)'/g)).map((x) => x[1]);
    for (const r of dbRoles) {
      expect(parseRoleLabels(SERVICE)[r], `${r} بلا تسمية`).toBeTruthy();
    }
  });
});

describe('ApprovalRulesService — طبقة SDK', () => {
  it('يستدعي الدوال الأربع', () => {
    expect(SERVICE).toMatch(/rpc\('approval_rules_board'/);
    expect(SERVICE).toMatch(/rpc\('upsert_approval_rule'/);
    expect(SERVICE).toMatch(/rpc\('set_approval_rule_active'/);
    expect(SERVICE).toMatch(/rpc\('detect_approval_rule_gaps'/);
  });

  it('يترجم أخطاء القاعدة والقيود للعربية', () => {
    for (const code of [
      'NOT_AUTHORIZED_TO_MANAGE_RULES',
      'INVALID_AMOUNT_RANGE',
      'RULE_NAME_REQUIRED',
      'approval_rules_level_check',
    ]) {
      expect(SERVICE).toContain(`${code}:`);
    }
  });

  it('لا دالة حذف', () => {
    const code = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/async\s+delete\w*\s*\(/i);
    expect(code).not.toMatch(/rpc\('delete_approval_rule'/);
  });
});

describe('ApprovalRulesAdminPage', () => {
  it('يعرض الفجوات قبل القائمة', () => {
    const gapsIdx = PAGE.indexOf('gaps.map');
    const tableIdx = PAGE.indexOf('<table');
    expect(gapsIdx).toBeGreaterThan(-1);
    expect(gapsIdx).toBeLessThan(tableIdx);
  });

  it('يُبرز عدد الأخطاء المانعة', () => {
    expect(PAGE).toMatch(/errorCount/);
    expect(PAGE).toContain('مشكلة تمنع سير الاعتماد');
  });

  it('يؤكد للمستخدم سلامة القواعد عند غياب الفجوات', () => {
    expect(PAGE).toContain('لا فجوات ولا تعارضات');
  });

  it('يوضّح سياسة عدم الحذف', () => {
    expect(PAGE).toContain('القواعد المعطَّلة تبقى للتدقيق');
  });

  it('يتحقق من المدخلات قبل الإرسال', () => {
    expect(PAGE).toMatch(/if \(max < min\)/);
    expect(PAGE).toMatch(/Number\.isNaN\(min\) \|\| Number\.isNaN\(max\)/);
  });

  it('يعرض كل الوحدات في التصفية والنموذج', () => {
    expect(PAGE).toMatch(/PORTAL_UNITS\.map/);
  });

  it('لا يلمس Supabase مباشرة', () => {
    expect(PAGE).not.toMatch(/from '.*services\/supabase/);
    expect(PAGE).not.toMatch(/supabase\./);
  });

  it('لا prompt أو confirm', () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/(?<![.\w])prompt\(/);
    expect(code).not.toMatch(/(?<![.\w])confirm\(/);
  });
});

describe('التسجيل في المواضع', () => {
  const ID = 'admin-approval-rules';

  it.each([
    ['legacyRedirect', () => LEGACY],
    ['hybridPagesCatalog', () => HYBRID],
    ['Sidebar', () => SIDEBAR],
    ['AdminEmployeesPage', () => ADMIN],
    ['permissions', () => PERMS],
  ])('مُسجَّلة في %s', (_n, get) => {
    expect(get()).toContain(ID);
  });

  it('المسار مُسجَّل في الراوتر', () => {
    expect(ROUTER).toMatch(/<Route path="approval-rules" element=\{<ApprovalRulesAdminPage \/>\}/);
  });

  it('المسار يطابق legacyRedirect', () => {
    expect(LEGACY).toContain('/app/admin/approval-rules');
  });

  it('محصورة بدور admin', () => {
    const start = ROUTER.indexOf('<Route path="admin" element={<RequireRole roles={[\'admin\']}');
    expect(start).toBeGreaterThan(-1);
    const end = ROUTER.indexOf('</Route>', ROUTER.indexOf('approval-rules', start));
    expect(ROUTER.slice(start, end)).toContain('approval-rules');
  });
});

describe('الاختبار السلوكي 0308', () => {
  it('يغطي الحمايات', () => {
    expect(VERIFY).toContain('موظف عادي لا يُنشئ قواعد');
    expect(VERIFY).toContain('مدير عادي لا يُعطّل قواعد');
    expect(VERIFY).toContain('لا حذف — الصف باقٍ للتدقيق');
  });

  it('يغطي كاشف الفجوات', () => {
    expect(VERIFY).toContain('يكشف تداخل نطاقين');
    expect(VERIFY).toContain('يكشف الفجوة بين نطاقين');
    expect(VERIFY).toContain('يكشف دوراً مطلوباً بلا شاغل');
    expect(VERIFY).toContain('الإنذار يختفي بعد إسناد الدور');
    expect(VERIFY).toContain('القواعد المتتالية السليمة بلا إنذار');
  });

  it('يثبت التكامل مع سلسلة الاعتماد', () => {
    expect(VERIFY).toContain('السلسلة تستخدم القاعدة الجديدة');
    expect(VERIFY).toContain('السلسلة تحلّ المعتمِد من الهيكل');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});

describe('كل الوحدات قابلة للتكوين', () => {
  it('قيد unit_key في 0305 يغطي الوحدات التسع', () => {
    const m = /unit_key\s+VARCHAR\(\d+\) NOT NULL[\s\S]{0,200}?CHECK \(unit_key IN \(([\s\S]*?)\)\)/.exec(M0305);
    expect(m).not.toBeNull();
    const dbUnits = new Set(Array.from(m![1].matchAll(/'([^']+)'/g)).map((x) => x[1]));
    for (const u of PORTAL_UNITS) {
      expect(dbUnits.has(u.unitKey), `${u.unitKey} غير مسموح في approval_rules`).toBe(true);
    }
  });

  it('كاشف الفجوات يفحص الوحدات التسع', () => {
    const FN = M0308.slice(
      M0308.indexOf('FUNCTION public.detect_approval_rule_gaps'),
      M0308.indexOf('COMMENT ON FUNCTION public.detect_approval_rule_gaps'),
    );
    for (const u of PORTAL_UNITS) {
      expect(FN, `${u.unitKey} مفقودة من الكاشف`).toContain(`'${u.unitKey}'`);
    }
  });
});
