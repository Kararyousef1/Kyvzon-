/**
 * ════════════════════════════════════════════════════════════════
 *  techIsolationContract.test.ts
 *
 *  عقد عزل بوابة التقنية (migration 0328).
 *
 *  ★ السياق: بوابة التقنية **خاصة بالشركة المستأجِرة**، لا نافذة على
 *    داخل المنصة. مسؤول تقنية شركة عميلة يجب ألّا يعلم بوجود شركات
 *    أخرى أصلاً.
 *
 *  ★ فحص ثابت على النص — لا يُثبت السلوك. الإثبات السلوكي في:
 *      tools/dev/verify-tech-isolation-0328.sql       24 تأكيداً
 *      tools/dev/verify-tech-isolation-0328-rls.sh    17 عبر RLS حقيقي
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0328 = read('supabase/migrations/0328_tech_portal_tenant_isolation.sql');
const VERIFY = read('tools/dev/verify-tech-isolation-0328.sql');
const RLS = read('tools/dev/verify-tech-isolation-0328-rls.sh');
const SVC = read('src/services/sdk/TechMetricsService.ts');
const HEALTH = read('src/pages/techportal/pages/SystemHealthPage.tsx');

/** يُجرّد التعليقات — الفحص على الكود المُنفَّذ لا على شرحه */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0328 — فصل مالك المنصة عن تقنية الشركة', () => {
  const body = (() => {
    const s = M0328.indexOf('CREATE OR REPLACE FUNCTION public.current_user_is_platform_owner');
    const e = M0328.indexOf('COMMENT ON FUNCTION public.current_user_is_platform_owner');
    return M0328.slice(s, e);
  })();

  it("★★ it_admin لم يعد مالكاً للمنصة", () => {
    expect(codeOnly(body)).not.toMatch(/'it_admin'/);
  });

  it('★ مالك المنصة = مطوّر ينتمي لمستأجر المنصة', () => {
    expect(body).toMatch(/current_user_role\(\) = 'developer'/);
    expect(body).toMatch(/is_platform_tenant\(public\.current_user_tenant_id\(\)\)/);
  });

  it('★ is_platform_tenant يُعرَّف قبل استعماله', () => {
    const defAt = M0328.indexOf('CREATE FUNCTION public.is_platform_tenant');
    const useAt = M0328.indexOf('is_platform_tenant(public.current_user_tenant_id())');
    expect(defAt).toBeGreaterThan(-1);
    expect(defAt).toBeLessThan(useAt);
  });

  it('is_platform_tenant يميّز بـslug لا بالدور', () => {
    const s = M0328.indexOf('CREATE FUNCTION public.is_platform_tenant');
    const e = M0328.indexOf('COMMENT ON FUNCTION public.is_platform_tenant');
    expect(M0328.slice(s, e)).toMatch(/t\.slug = 'kyvzon'/);
  });

  it('current_user_is_tenant_tech يحصر الصلاحية داخل المستأجر', () => {
    const s = M0328.indexOf('CREATE FUNCTION public.current_user_is_tenant_tech');
    const e = M0328.indexOf('COMMENT ON FUNCTION public.current_user_is_tenant_tech');
    const b = M0328.slice(s, e);
    expect(b).toMatch(/'admin','it_admin','developer'/);
    expect(b).toMatch(/current_user_tenant_id\(\) IS NOT NULL/);
  });
});

describe('0328 — إغلاق تسريب system_settings', () => {
  it('★★ سياسة القراءة تفلتر بالمستأجر', () => {
    expect(M0328).toMatch(
      /CREATE POLICY system_settings_tenant_select[\s\S]{0,300}tenant_id = public\.current_user_tenant_id\(\)/,
    );
  });

  it('★★ الكتابة محروسة بـUSING **و**WITH CHECK', () => {
    const s = M0328.indexOf('CREATE POLICY system_settings_tenant_write');
    const body = M0328.slice(s, s + 500);
    expect(body).toMatch(/USING \([\s\S]{0,120}tenant_id = public\.current_user_tenant_id\(\)/);
    expect(body).toMatch(/WITH CHECK \([\s\S]{0,120}tenant_id = public\.current_user_tenant_id\(\)/);
  });

  it('★ حارس RESTRICTIVE يمنع أي توسيع لاحق', () => {
    expect(M0328).toMatch(
      /CREATE POLICY system_settings_tenant_guard[\s\S]{0,120}AS RESTRICTIVE/,
    );
  });

  it('★ tenant_modules محروس كذلك', () => {
    expect(M0328).toMatch(
      /CREATE POLICY tenant_modules_tenant_guard[\s\S]{0,120}AS RESTRICTIVE/,
    );
  });
});

describe('0328 — قابلية إعادة التشغيل', () => {
  it('★ السياسات تُسقَط في المقدّمة قبل DROP FUNCTION', () => {
    const dropPolicyAt = M0328.indexOf('DROP POLICY IF EXISTS system_settings_tenant_guard');
    const dropFnAt = M0328.indexOf('DROP FUNCTION IF EXISTS public.current_user_is_tenant_tech');
    expect(dropPolicyAt).toBeGreaterThan(-1);
    expect(dropPolicyAt).toBeLessThan(dropFnAt);
  });

  it('★ الأسماء الجديدة تُسقَط أيضاً (وإلا لم يكن قابلاً لإعادة التشغيل)', () => {
    for (const n of [
      'system_settings_tenant_select',
      'system_settings_tenant_write',
      'system_settings_tenant_guard',
      'tenant_modules_tenant_guard',
    ]) {
      expect(M0328).toMatch(new RegExp(`DROP POLICY IF EXISTS ${n}`));
    }
  });
});

describe('0328 — تقرير العزل', () => {
  it('★★ SECURITY INVOKER عمداً — يقيس RLS ولا يتجاوزه', () => {
    const s = M0328.indexOf('CREATE FUNCTION public.my_isolation_report');
    const e = M0328.indexOf('COMMENT ON FUNCTION public.my_isolation_report');
    const body = M0328.slice(s, e);
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('يغطّي مجالات بوابة التقنية', () => {
    const s = M0328.indexOf('CREATE FUNCTION public.my_isolation_report');
    const e = M0328.indexOf('COMMENT ON FUNCTION public.my_isolation_report');
    const body = M0328.slice(s, e);
    for (const t of ['system_settings', 'tenant_modules', 'biometric_devices',
                     'security_events', 'sync_log', 'error_logs']) {
      expect(body).toContain(t);
    }
  });
});

describe('0328 — الصلاحيات', () => {
  it.each([
    'is_platform_tenant(UUID)',
    'current_user_is_tenant_tech()',
    'my_isolation_report()',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M0328).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M0328).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO authenticated`),
    );
  });
});

describe('0328 — طبقة SDK والواجهة', () => {
  it('isolationReport يمرّ عبر RPC', () => {
    expect(SVC).toMatch(/rpc\('my_isolation_report'\)/);
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it('★ SystemHealthPage يعرض تقرير العزل', () => {
    const code = codeOnly(HEALTH);
    expect(code).toMatch(/techMetricsService\.isolationReport\(\)/);
    expect(code).toMatch(/isolation/);
  });

  it('★ لا إيحاء بأن البوابة تخصّ المنصة', () => {
    const pages = readdirSync(resolve(root, 'src/pages/techportal/pages'))
      .filter((f) => f.endsWith('.tsx'));
    const bad: string[] = [];
    for (const f of pages) {
      const code = codeOnly(read(`src/pages/techportal/pages/${f}`));
      // نصوص واجهة تُوحي بنطاق المنصة كله
      if (/الأمنية للمنصة|كل الشركات|جميع الشركات|إدارة المنصة/.test(code)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it('★ لا جدول من جداول المنصة في بوابة التقنية', () => {
    const pages = readdirSync(resolve(root, 'src/pages/techportal/pages'))
      .filter((f) => f.endsWith('.tsx'));
    const bad: string[] = [];
    for (const f of pages) {
      const code = codeOnly(read(`src/pages/techportal/pages/${f}`));
      if (/tenant_subscriptions|platform_audit_log|public_signup_requests|from\('tenants'\)/.test(code)) {
        bad.push(f);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('0328 — اختبارات الإثبات', () => {
  it('verify-0328 يوثّق العدد الحقيقي ولا تأكيدات ميتة', () => {
    expect(VERIFY).toMatch(/verify-0328: %\/24 تأكيداً ناجحاً/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*>=\s*0[^0-9]/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يفحص أن مطوّر المنصة لم يُكسَر بالإصلاح', () => {
    expect(VERIFY).toMatch(/كُسر مطوّر المنصة/);
    expect(RLS).toMatch(/مطوّر المنصة ما زال مالكاً/);
  });

  it('★ يفحص مطوّراً يعمل لدى شركة عميلة', () => {
    expect(VERIFY).toMatch(/مطوّر لدى شركة عميلة صار مالكاً للمنصة/);
  });

  it('★ سكربت RLS يفحص القراءة **والكتابة** عبر المستأجرين', () => {
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/قرأ مفتاحاً سرّياً/);
    expect(RLS).toMatch(/كتب على إعدادات شركة أخرى/);
  });

  it('★ ويفحص الحالة الإيجابية (لا المنع وحده)', () => {
    expect(RLS).toMatch(/يرى إعدادات شركته/);
    expect(RLS).toMatch(/يعدّل إعدادات شركته/);
  });

  it('سكربت RLS موجود وقابل للتنفيذ', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-tech-isolation-0328-rls.sh'))).toBe(true);
  });
});
