/**
 * enforcementConsoleContract.test.ts — عقد 0321 وواجهة إقفال الاشتراك
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الخلفية: 0320 أقفل الاشتراك على 308 جداول بوضع off لكل المستأجرين.
 * هذه الشاشة هي أداة التشغيل اليدوي الواعي — وأخطاؤها تعني تعطيل عميل.
 *
 * لذلك يحرس هذا الملف ثلاثة مبادئ لا حالات فقط:
 *   ① الشركات النظيفة تظهر (وإلا لا يمكن اختيارها)
 *   ② التوصية من القاعدة لا من منطق واجهة قد ينحرف
 *   ③ زرّ الإقفال معطّل قبل المراقبة — حارس ثانٍ فوق حارس القاعدة
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const MIG = read('supabase/migrations/0321_enforcement_console_overview.sql');
const VERIFY = read('tools/dev/verify-enforcement-console-0321.sql');
const SVC = read('src/services/sdk/PlatformService.ts');
const PAGE = read('src/pages/devportal/pages/EnforcementConsolePage.tsx');
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
describe('0321 — دوال وحدة التحكّم', () => {
  const fns = ['enforcement_console_overview', 'enforcement_tenant_detail'];

  it.each(fns)('%s معرَّفة ومُسقَطة صراحةً', (fn) => {
    expect(CODE).toContain(`CREATE FUNCTION public.${fn}`);
    expect(CODE).toContain(`DROP FUNCTION IF EXISTS public.${fn}`);
  });

  it.each(fns)('%s تثبّت search_path و SECURITY DEFINER', (fn) => {
    const s = fnScope(CODE, fn);
    expect(s).toContain('SET search_path = public');
    expect(s).toContain('SECURITY DEFINER');
  });

  it.each(fns)('anon محروم من %s', (fn) => {
    expect(CODE).toMatch(
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]{0,30}FROM anon`),
    );
  });

  it('★ الحارس داخل الاستعلام — صفر صفوف لا خطأ', () => {
    for (const fn of fns) {
      expect(fnScope(CODE, fn), fn).toContain('public.current_user_is_platform_admin()');
    }
  });
});

describe('0321 — ★ الشركات النظيفة تظهر', () => {
  const scope = fnScope(CODE, 'enforcement_console_overview');

  it('يبدأ من tenants لا من السجل', () => {
    // FROM subscription_access_log يعني اختفاء الشركات بلا محاولات
    expect(scope).toContain('FROM public.tenants t');
    expect(scope).toContain('LEFT JOIN public.subscription_access_log');
    expect(scope).not.toMatch(/FROM public\.subscription_access_log l\s*\n\s*JOIN public\.tenants/);
  });

  it('يستعمل COALESCE فلا تُعاد NULL للعدّادات', () => {
    expect(scope).toContain("COALESCE(count(*) FILTER (WHERE l.outcome = 'would_block'), 0)");
  });

  it('يستبعد الشركات غير النشطة', () => {
    expect(scope).toContain('COALESCE(t.is_active, TRUE)');
  });
});

describe('0321 — ★ توصية الجاهزية من القاعدة', () => {
  const scope = fnScope(CODE, 'enforcement_console_overview');

  it('تغطي الحالات الأربع', () => {
    expect(scope).toContain("'مُقفَل'");
    expect(scope).toContain("'ابدأ بوضع audit'");
    expect(scope).toContain("'جاهز للإقفال — لا محاولات'");
    expect(scope).toContain("'راجع '");
  });

  it('★ audit بلا محاولات ⇒ جاهز · وبمحاولات ⇒ راجع', () => {
    expect(scope).toMatch(/count\(\*\) FILTER \(WHERE l\.outcome = 'would_block'\) = 0\s*\n\s*THEN 'جاهز/);
  });

  it('الترتيب يُقدّم من يحتاج مراجعة', () => {
    expect(scope).toContain("WHEN 'audit' THEN 1");
  });
});

describe('0321 — التفاصيل', () => {
  const scope = fnScope(CODE, 'enforcement_tenant_detail');

  it('★ يعدّ المستخدمين المميّزين لا المحاولات', () => {
    expect(scope).toContain('count(DISTINCT l.user_id)');
  });

  it('يفصل would_block عن blocked', () => {
    expect(scope).toContain("FILTER (WHERE l.outcome = 'would_block')");
    expect(scope).toContain("FILTER (WHERE l.outcome = 'blocked')");
  });

  it('يفلتر بالمستأجر المطلوب', () => {
    expect(scope).toContain('l.tenant_id = p_tenant_id');
  });
});

describe('0321 — الاختبار السلوكي', () => {
  it('يغطي ظهور الشركة النظيفة', () => {
    expect(VERIFY).toContain('شركة بلا سجل غائبة عن الوحدة');
  });

  it('يغطي التوصيات الأربع', () => {
    for (const t of ['توصية off', 'توصية audit نظيف', 'توصية audit بمحاولات', 'توصية enforce']) {
      expect(VERIFY, t).toContain(t);
    }
  });

  it('يغطي عزل السجل بين الشركات', () => {
    expect(VERIFY).toContain('تسرّب سجل من شركة أخرى');
  });

  it('يغطي حصر الوصول بالمنصة', () => {
    expect(VERIFY).toContain('مدير شركة يرى');
    expect(VERIFY).toContain('مدير شركة بدّل وضع الإقفال');
  });

  it('يغطي عدّ المستخدمين المميّزين', () => {
    expect(VERIFY).toContain('مستخدمون مميّزون');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('PlatformService — دوال الإقفال', () => {
  it('يغلّف الدوال الأربع', () => {
    for (const rpc of [
      'enforcement_console_overview',
      'enforcement_tenant_detail',
      'preview_enforcement_impact',
      'set_module_enforcement',
    ]) {
      expect(SVC, rpc).toContain(`'${rpc}'`);
    }
  });

  it('يترجم رسالة منع القفز للعربية', () => {
    expect(SVC).toContain('MUST_AUDIT_BEFORE_ENFORCE');
    expect(SVC).toContain('شغّل وضع «مراقبة» أولاً');
  });

  it('EnforcementMode محصور في الثلاثة', () => {
    expect(SVC).toContain("export type EnforcementMode = 'off' | 'audit' | 'enforce'");
  });

  it('★ ما زال لا يقرأ بيانات عملاء', () => {
    for (const t of ['employees', 'legal_entities', 'leaves', 'payroll']) {
      expect(SVC, t).not.toContain(`from('${t}')`);
    }
  });
});

describe('EnforcementConsolePage — الشاشة', () => {
  it('★ لا تلمس Supabase مباشرة', () => {
    expect(PAGE).not.toContain('supabase.rpc(');
    expect(PAGE).not.toContain('supabase.from(');
    expect(PAGE).toContain('platformService.findEnforcementOverview');
  });

  it('★ زرّ الإقفال معطّل قبل المراقبة — حارس ثانٍ فوق القاعدة', () => {
    expect(PAGE).toContain("const readyToLock = r.mode === 'audit'");
    expect(PAGE).toContain('disabled={busy || !readyToLock}');
  });

  it('★ التوصية تُعرض من القاعدة لا تُحسب في الواجهة', () => {
    expect(PAGE).toContain('{r.readiness}');
    // لا منطق يعيد اشتقاق التوصية فينحرف عن القاعدة
    expect(PAGE).not.toContain("'جاهز للإقفال'");
  });

  it('تأكيد الإقفال داخل Modal يعرض الأثر', () => {
    expect(PAGE).toContain('confirmRow');
    expect(PAGE).toContain('تأكيد الإقفال');
    expect(PAGE).toContain('محاولة وصول على');
  });

  it('★ تُنبّه حين توجد محاولات وتطمئن حين لا توجد', () => {
    expect(PAGE).toContain('أضِفها إلى بواباتها المفعّلة');
    expect(PAGE).toContain('الإقفال آمن على الأرجح');
  });

  it('توضّح أن التراجع فوري', () => {
    expect(PAGE).toContain('التراجع فوري');
  });

  it('تشرح المسار الآمن للمشغّل', () => {
    expect(PAGE).toContain('معطّل ← مراقبة ← مُقفَل');
  });

  it('التحميل الكسول للتفاصيل — لا طلب لكل شركة', () => {
    expect(PAGE).toContain('const openDetail');
    expect(PAGE).toMatch(/if \(openId === tenantId\)/);
  });

  it('لا confirm() ولا as any', () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/(?<![\w.])confirm\s*\(/);
    expect(code).not.toMatch(/\bas any\b/);
  });
});

describe('تسجيل الشاشة في بوابة المطوّرين', () => {
  it('① النوع DevPortalPage', () => {
    expect(TYPES).toContain("| 'enforcement-console'");
  });

  it('② PAGE_META', () => {
    expect(TYPES).toContain("'enforcement-console': { title: 'إقفال الاشتراك'");
  });

  it('③ التوجيه', () => {
    expect(PORTAL).toContain("case 'enforcement-console':");
    expect(PORTAL).toContain('EnforcementConsolePage');
  });

  it('④ عنصر التنقل', () => {
    expect(LAYOUT).toContain("id: 'enforcement-console'");
    expect(LAYOUT).toContain('إقفال الاشتراك');
  });

  it('★ محمية بدور المطوّر عبر /dev', () => {
    const router = read('src/router/AppRouter.tsx');
    expect(router).toMatch(/path="\/dev"[\s\S]{0,120}roles=\{\['developer', 'it_admin'\]\}/);
  });
});
