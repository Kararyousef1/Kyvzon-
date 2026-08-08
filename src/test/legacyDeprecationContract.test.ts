/**
 * ════════════════════════════════════════════════════════════════
 *  legacyDeprecationContract.test.ts
 *
 *  عقد الإيقاف التدريجي للبوابة القديمة (migration 0329).
 *
 *  ★ فحص ثابت على النص. الإثبات السلوكي في:
 *      tools/dev/verify-legacy-deprecation-0329.sql       34 تأكيداً
 *      tools/dev/verify-legacy-deprecation-0329-rls.sh    10 عبر RLS
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0329 = read('supabase/migrations/0329_legacy_view_deprecation.sql');
const VERIFY = read('tools/dev/verify-legacy-deprecation-0329.sql');
const RLS = read('tools/dev/verify-legacy-deprecation-0329-rls.sh');
const LEGACY = read('src/router/legacyRedirect.ts');
const ROUTER = read('src/router/AppRouter.tsx');
const SVC = read('src/services/sdk/LegacyRouteService.ts');
const HEALTH = read('src/pages/techportal/pages/SystemHealthPage.tsx');

/** يُجرّد التعليقات — الفحص على الكود المُنفَّذ لا على شرحه */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

/** يمشي على ملفات المصدر عدا الاختبارات */
function walkSrc(): string[] {
  const out: string[] = [];
  const stack = [resolve(root, 'src')];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of readdirSync(cur)) {
      const p = join(cur, e);
      if (statSync(p).isDirectory()) {
        if (e === 'test' || e === '__tests__') continue;
        stack.push(p);
      } else if (/\.(ts|tsx)$/.test(e) && !/\.(test|spec)\./.test(e)) {
        out.push(p);
      }
    }
  }
  return out;
}

describe('0329 — جدول القياس', () => {
  it('يُنشأ بـIF NOT EXISTS (قابل لإعادة التشغيل)', () => {
    expect(M0329).toMatch(/CREATE TABLE IF NOT EXISTS public\.legacy_route_usage/);
  });

  it('★ فهرسان جزئيان لا فهرس واحد — UNIQUE يعامل NULL كقيمة مميّزة', () => {
    expect(M0329).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS legacy_route_usage_uniq_tenant[\s\S]{0,200}WHERE tenant_id IS NOT NULL/,
    );
    expect(M0329).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS legacy_route_usage_uniq_anon[\s\S]{0,200}WHERE tenant_id IS NULL/,
    );
  });

  it('RLS مُفعَّل مع حارس RESTRICTIVE', () => {
    expect(M0329).toMatch(/ALTER TABLE public\.legacy_route_usage ENABLE ROW LEVEL SECURITY/);
    expect(M0329).toMatch(/CREATE POLICY legacy_route_usage_guard[\s\S]{0,120}AS RESTRICTIVE/);
  });

  it('★ السياسات تُسقَط أولاً (قابلية إعادة التشغيل — درس 0328)', () => {
    const dropAt = M0329.indexOf('DROP POLICY IF EXISTS legacy_route_usage_select');
    const createAt = M0329.indexOf('CREATE POLICY legacy_route_usage_select');
    expect(dropAt).toBeGreaterThan(-1);
    expect(dropAt).toBeLessThan(createAt);
  });

  it('anon محجوب عن الجدول', () => {
    expect(M0329).toMatch(/REVOKE ALL ON public\.legacy_route_usage FROM anon/);
    expect(M0329).toMatch(/GRANT SELECT ON public\.legacy_route_usage TO authenticated/);
  });
});

describe('0329 — دالة التسجيل', () => {
  const body = (() => {
    const s = M0329.indexOf('CREATE FUNCTION public.record_legacy_route_hit');
    const e = M0329.indexOf('COMMENT ON FUNCTION public.record_legacy_route_hit');
    return M0329.slice(s, e);
  })();

  it('VOLATILE — الكتابة مستحيلة في STABLE (درس 0320)', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
  });

  it('★ لا تُسقط التوجيه عند الفشل', () => {
    expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(body).toMatch(/RETURN FALSE;/);
  });

  it('★ تحدّ طول المدخل (يأتي من عنوان URL)', () => {
    expect(body).toMatch(/length\(p_view_id\) > 120/);
  });

  it('★ فرعان لـON CONFLICT حسب وجود المستأجر', () => {
    expect(body).toMatch(/ON CONFLICT \(tenant_id, view_id, usage_date\) WHERE tenant_id IS NOT NULL/);
    expect(body).toMatch(/ON CONFLICT \(view_id, usage_date\) WHERE tenant_id IS NULL/);
  });

  it('ترفض المدخل الفارغ', () => {
    expect(body).toMatch(/p_view_id IS NULL OR btrim\(p_view_id\) = ''/);
  });
});

describe('0329 — لوحات القرار', () => {
  it('★ SECURITY INVOKER — تقيس تحت RLS لا تتجاوزه', () => {
    for (const fn of ['legacy_route_readiness', 'legacy_route_summary']) {
      const s = M0329.indexOf(`CREATE FUNCTION public.${fn}`);
      const e = M0329.indexOf(`COMMENT ON FUNCTION public.${fn}`);
      const body = M0329.slice(s, e);
      expect(body).toMatch(/SECURITY INVOKER/);
      expect(body).not.toMatch(/SECURITY DEFINER/);
    }
  });

  it('★ التوصية صريحة في الاتجاهين', () => {
    const s = M0329.indexOf('CREATE FUNCTION public.legacy_route_summary');
    const e = M0329.indexOf('COMMENT ON FUNCTION public.legacy_route_summary');
    const body = M0329.slice(s, e);
    expect(body).toMatch(/يُؤمَن الحذف/);
    expect(body).toMatch(/لا تحذف بعد/);
    expect(body).toMatch(/لا استعمال مُسجَّل بعد/);
  });

  it('النافذة مقصوصة بحدّين', () => {
    expect(M0329).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_window_days, 90\), 730\)\)/);
  });
});

describe('0329 — توثيق الطبقة كمهجورة', () => {
  it('★ legacyRedirect.ts مُعلَّم deprecated', () => {
    expect(LEGACY).toMatch(/مهجورة/);
    expect(LEGACY).toMatch(/الإيقاف التدريجي/);
  });

  it('★ يُحذّر من إضافة تعيينات جديدة', () => {
    expect(LEGACY).toMatch(/لا تُضِف تعييناً جديداً/);
  });

  it('★ يشرح متى تُحذف الطبقة', () => {
    expect(LEGACY).toMatch(/legacy_route_summary/);
  });

  it('LegacyViewHandler مُعلَّم ويُسجّل الاستعمال', () => {
    const s = ROUTER.indexOf('function LegacyViewHandler');
    const before = ROUTER.slice(Math.max(0, s - 1200), s);
    expect(before).toMatch(/مهجورة/);
    const body = ROUTER.slice(s, s + 900);
    expect(body).toMatch(/legacyRouteService\.recordHit/);
  });

  it('★ التسجيل لا يُؤخّر التوجيه (بلا await)', () => {
    const s = ROUTER.indexOf('function LegacyViewHandler');
    const body = ROUTER.slice(s, s + 900);
    expect(body).toMatch(/void legacyRouteService\.recordHit/);
    expect(body).not.toMatch(/await legacyRouteService\.recordHit/);
  });
});

describe('0329 — لا مُنتِج داخلي لـ?view=', () => {
  it('★★ صفر ملف مصدر يولّد ?view= (الأساس الذي بُني عليه القرار)', () => {
    const offenders: string[] = [];
    for (const f of walkSrc()) {
      const rel = f.replace(root + '/', '');
      // الطبقة نفسها ومستهلكوها المعروفون مستثنون
      if (rel.includes('router/legacyRedirect') || rel.includes('router/AppRouter')) continue;
      const code = codeOnly(readFileSync(f, 'utf8'));
      // ★ نستثني النصوص المعروضة للمستخدم: لوحة الإيقاف نفسها تشرح
      //   الصيغة `?view=` للمسؤول التقني. المقصود هنا **توليد** رابط
      //   لا ذكره في نصّ. المُنتِج الحقيقي يبني URL أو يضبط بارامتراً.
      const producer =
        /(navigate|assign|href\s*=|window\.location|searchParams\.set)\s*[^;\n]{0,80}[?&]view=/.test(code) ||
        /['"`][^'"`\n]{0,60}\?view=\$\{/.test(code);
      if (producer) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('★ لا تعيينات «قديمة» جديدة تُضاف للطبقة المهجورة', () => {
    const count = (LEGACY.match(/^\s*'[^']+':\s*'[^']+'/gm) ?? []).length;

    // ★ تصحيح المرجع (0330): كان الحدّ 435 على أساس أن أي زيادة =
    //   تعيين قديم جديد. لكن `Sidebar.tsx:1351` يعتمد VIEW_TO_PATH
    //   لتحويل معرّف عنصر التنقل إلى مسار، فكل **صفحة جديدة** تحتاج
    //   إدخالاً هنا رغم هجران طبقة `?view=`.
    //
    //   ★ الحدّ الرقمي الثابت كان يُسقط الاختبار مع كل صفحة جديدة
    //     مشروعة (0330 ثم 0331). استُبدل بقاعدة تُميّز النوعين:
    //       · 435 تعييناً «قديماً» أصلياً — لا يجوز أن يزيد
    //       · تعيينات الصفحات الجديدة — مسموحة لكن **بشرط التعليل**
    //     فيبقى الحارس فعّالاً بلا صيانة يدوية كل جولة.
    //   القائمة صريحة: `tech-portal` و`tech-dashboard` و`tech-settings`
    //   تعيينات **قديمة** أصلية، لا تخلطها بالجديدة.
    const LEGACY_BASELINE = 435;
    const NEW_PAGE_IDS = ['tech-audit-trail', 'tech-error-logs', 'tech-integrations',
                          'tech-data-exports'];
    const newEntries = NEW_PAGE_IDS.filter((id) => LEGACY.includes(`'${id}':`));
    expect(count - newEntries.length).toBeLessThanOrEqual(LEGACY_BASELINE);

    // وكل إدخال جديد مُعلَّل صراحةً (لا يمرّ صامتاً)
    expect(newEntries.length).toBeGreaterThan(0);
    for (const id of newEntries) {
      const i = LEGACY.indexOf(`'${id}':`);
      const before = LEGACY.slice(Math.max(0, i - 600), i);
      expect(before, `الإدخال '${id}' بلا تعليل`).toMatch(/Sidebar|الشريط الجانبي/);
    }
  });
});

describe('0329 — طبقة SDK والواجهة', () => {
  it('LegacyRouteService يمرّ عبر RPC', () => {
    expect(SVC).toMatch(/rpc\('record_legacy_route_hit'/);
    expect(SVC).toMatch(/rpc\('legacy_route_summary'/);
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it('★ recordHit لا يرمي أبداً (التوجيه أولاً)', () => {
    const s = SVC.indexOf('async recordHit');
    const body = SVC.slice(s, s + 600);
    expect(body).toMatch(/try \{/);
    expect(body).toMatch(/catch \{/);
    expect(body).not.toMatch(/throw/);
  });

  it('★ SystemHealthPage يعرض جاهزية الإيقاف', () => {
    const code = codeOnly(HEALTH);
    expect(code).toMatch(/legacyRouteService\.summary\(/);
    expect(code).toMatch(/legacy/);
  });
});

describe('0329 — اختبارات الإثبات', () => {
  it('verify-0329 يوثّق العدد الحقيقي ولا تأكيدات ميتة', () => {
    expect(VERIFY).toMatch(/verify-0329: %\/34 تأكيداً ناجحاً/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*>=\s*0[^0-9]\s*,\s*'[1-5]/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يفحص فخّ NULL في المستأجر', () => {
    expect(VERIFY).toMatch(/فخّ NULL/);
    expect(VERIFY).toMatch(/زائر بلا مستأجر أنشأ/);
  });

  it('★ يفحص انقلاب التوصية في الاتجاهين', () => {
    expect(VERIFY).toMatch(/التوصية مع وجود استعمال نشط/);
    expect(VERIFY).toMatch(/صفر استعمال ولم تُوصِ بالحذف/);
  });

  it('★ سكربت RLS يفحص التسريب السلوكي والكتابة المزوّرة', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-legacy-deprecation-0329-rls.sh'))).toBe(true);
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/تسريب سلوكي/);
    expect(RLS).toMatch(/كتب صفاً مزوّراً/);
  });

  it('★ ويفحص أن مطوّر المنصة يرى الكل (لإدارة الإيقاف)', () => {
    expect(RLS).toMatch(/مطوّر المنصة يرى الكل/);
  });
});
