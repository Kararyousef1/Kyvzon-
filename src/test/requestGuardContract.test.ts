/**
 * ════════════════════════════════════════════════════════════════
 *  requestGuardContract.test.ts
 *
 *  عقد حارس تجاوز سلسلة الاعتماد والأرشفة بدل الحذف (migration 0324).
 *
 *  ★ فحص ثابت على النص — لا يُثبت السلوك. الإثبات السلوكي في:
 *      tools/dev/verify-request-guard-0324.sql      28 تأكيداً
 *      tools/dev/verify-request-guard-0324-rls.sh    5 عبر RLS حقيقي
 *    هذه الاختبارات تمنع **الانحدار** بالحذف السهو.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0324 = read('supabase/migrations/0324_request_status_guard_and_soft_delete.sql');
const VERIFY = read('tools/dev/verify-request-guard-0324.sql');
const RLS = read('tools/dev/verify-request-guard-0324-rls.sh');
const SHIM = read('tools/dev/pgtest-supabase-shim.sql');
const ARCHIVE_SVC = read('src/services/sdk/ArchiveService.ts');
const SOPS_PAGE = read('src/pages/admin/AdminSOPsPage.tsx');
const ORG_PAGE = read('src/pages/admin/OrgStructurePage.tsx');
const PERM_TREE = read('src/pages/admin/AdminPermissionsTree.tsx');
const CMS_PAGE = read('src/pages/admin/AdminLandingPageCMS.tsx');

/** يُجرّد التعليقات — الفحص يقع على الكود المُنفَّذ لا على شرحه */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0324 — حارس تجاوز السلسلة', () => {
  const body = (() => {
    const s = M0324.indexOf('CREATE OR REPLACE FUNCTION public.tg_guard_request_status_bypass');
    const e = M0324.indexOf('COMMENT ON FUNCTION public.tg_guard_request_status_bypass');
    return M0324.slice(s, e);
  })();

  it('★ المحفّز BEFORE UPDATE — الرفض يمنع الكتابة لا يتبعها', () => {
    const hits = M0324.match(/BEFORE UPDATE OF status ON public\.\w+/g);
    expect(hits).toHaveLength(2);
    expect(M0324).toContain('BEFORE UPDATE OF status ON public.leaves');
    expect(M0324).toContain('BEFORE UPDATE OF status ON public.permissions_request');
  });

  it('★ يفحص وجود خطوات مفتوحة لا مجرّد الدور', () => {
    expect(body).toMatch(/status IN \('pending','active'\)/);
    expect(body).toMatch(/FROM public\.hr_approval_steps/);
  });

  it("★ دور hr لم يعد كافياً — الاستثناء لـ'admin' وحده", () => {
    expect(body).toMatch(/v_role = 'admin'/);
    // الثغرة الأصلية: current_user_is_staff() تشمل hr
    expect(body).not.toMatch(/current_user_is_staff\(\)/);
  });

  it('طلب بلا سلسلة يمرّ (سجلات قديمة)', () => {
    expect(body).toMatch(/IF v_open = 0 THEN/);
  });

  it('الرسالة تشرح البديل لا تكتفي بالمنع', () => {
    expect(body).toContain('صندوق الموافقات');
    expect(body).toMatch(/ERRCODE = 'check_violation'/);
  });

  it('لا تغيير في الحالة ⇒ الحارس لا يتدخّل', () => {
    expect(body).toMatch(/IS NOT DISTINCT FROM COALESCE\(OLD\.status/);
  });
});

describe('0324 — علَم المزامنة', () => {
  const body = (() => {
    const s = M0324.indexOf('CREATE FUNCTION public.sync_hr_source_status');
    const e = M0324.indexOf('COMMENT ON FUNCTION public.sync_hr_source_status');
    return M0324.slice(s, e);
  })();

  it('★ يُرفع قبل الكتابة ويُخفض بعدها (وإلا عُطّل الحارس للأبد)', () => {
    expect(body).toMatch(/set_config\('kyvzon\.approval_sync', 'true', TRUE\)/);
    expect(body).toMatch(/set_config\('kyvzon\.approval_sync', 'false', TRUE\)/);
  });

  it('★ محلّي للمعاملة (is_local = TRUE) فلا يتسرّب', () => {
    const calls = body.match(/set_config\('kyvzon\.approval_sync',[^)]*\)/g) ?? [];
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c).toMatch(/TRUE\s*\)$/);
  });

  it('الحارس يقرأ العلَم بأمان عند غيابه', () => {
    const g = M0324.slice(
      M0324.indexOf('CREATE OR REPLACE FUNCTION public.tg_guard_request_status_bypass'),
      M0324.indexOf('COMMENT ON FUNCTION public.tg_guard_request_status_bypass'),
    );
    expect(g).toMatch(/current_setting\('kyvzon\.approval_sync', TRUE\)/);
    expect(g).toMatch(/NULLIF\(/);
  });
});

describe('0324 — الأرشفة بدل الحذف', () => {
  it('archive_sop تُحدّث الحالة ولا تحذف', () => {
    const s = M0324.indexOf('CREATE FUNCTION public.archive_sop');
    const e = M0324.indexOf('COMMENT ON FUNCTION public.archive_sop');
    const body = M0324.slice(s, e);
    expect(body).toMatch(/SET status = 'archived'/);
    expect(codeOnly(body)).not.toMatch(/DELETE FROM/);
  });

  it('★ archive_department تُعيد أسباباً مفهومة لا رسائل قيود خام', () => {
    const s = M0324.indexOf('CREATE FUNCTION public.archive_department');
    const e = M0324.indexOf('COMMENT ON FUNCTION public.archive_department');
    const body = M0324.slice(s, e);
    expect(body).toMatch(/HAS_ACTIVE_CHILDREN/);
    expect(body).toMatch(/HAS_EMPLOYEES/);
    expect(body).toMatch(/SET is_active = FALSE/);
    expect(codeOnly(body)).not.toMatch(/DELETE FROM public\.departments/);
  });

  it('كلتاهما تحرسان الدور والمستأجر', () => {
    for (const fn of ['archive_sop', 'archive_department']) {
      const s = M0324.indexOf(`CREATE FUNCTION public.${fn}`);
      const e = M0324.indexOf(`COMMENT ON FUNCTION public.${fn}`);
      const body = M0324.slice(s, e);
      expect(body).toMatch(/NOT_AUTHORIZED/);
      expect(body).toMatch(/current_user_tenant_id\(\)/);
      expect(body).toMatch(/tenant_id = v_tenant/);
    }
  });

  it.each(['archive_sop(UUID, TEXT)', 'archive_department(UUID)'])(
    '%s محجوبة عن anon وممنوحة لـauthenticated',
    (sig) => {
      const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
      expect(M0324).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
      expect(M0324).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO authenticated`));
    },
  );
});

describe('0324 — سياسة المنصة في بوابتي الموظف والإدارة', () => {
  const pages = [
    ...readdirSync(resolve(root, 'src/pages/employee')).filter((f) => f.endsWith('.tsx'))
      .map((f) => `src/pages/employee/${f}`),
    ...readdirSync(resolve(root, 'src/pages/admin')).filter((f) => f.endsWith('.tsx'))
      .map((f) => `src/pages/admin/${f}`),
  ];

  it('★ صفر confirm()/alert()/prompt() تنفيذي', () => {
    const bad: string[] = [];
    for (const p of pages) {
      const code = codeOnly(read(p));
      if (/(?<![.\w])(confirm|alert|prompt)\s*\(/.test(code)) bad.push(p);
    }
    expect(bad).toEqual([]);
  });

  it('★ صفر حذف نهائي تنفيذي', () => {
    const bad: string[] = [];
    for (const p of pages) {
      const code = codeOnly(read(p));
      if (/\.delete\(\)|Service\.delete\(/.test(code)) bad.push(p);
    }
    expect(bad).toEqual([]);
  });

  it('★ AdminEmployeesPageV2 أُخرج من نطاق البناء (كود ميت)', () => {
    expect(existsSync(resolve(root, 'src/pages/admin/AdminEmployeesPageV2.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'src/pages/admin/_archive/AdminEmployeesPageV2.tsx.bak'))).toBe(true);
    expect(existsSync(resolve(root, 'src/pages/admin/_archive/README.md'))).toBe(true);
  });
});

describe('0324 — طبقة SDK والصفحات', () => {
  it('ArchiveService يمرّ عبر RPC لا Supabase مباشرة', () => {
    expect(ARCHIVE_SVC).toMatch(/rpc\('archive_sop'/);
    expect(ARCHIVE_SVC).toMatch(/rpc\('archive_department'/);
    // ★ الفحص على الكود لا التعليق: التوثيق يقتبس النسخة المُزالة
    expect(codeOnly(ARCHIVE_SVC)).not.toMatch(/\.from\(/);
  });

  it('★ يترجم أسباب المنع لرسائل عربية مفهومة', () => {
    expect(ARCHIVE_SVC).toContain('HAS_EMPLOYEES');
    expect(ARCHIVE_SVC).toContain('HAS_ACTIVE_CHILDREN');
    expect(ARCHIVE_SVC).toMatch(/انقلهم أولاً/);
  });

  it('AdminSOPsPage يستعمل الخدمة ونافذة تأكيد', () => {
    const code = codeOnly(SOPS_PAGE);
    expect(code).toMatch(/archiveService\.archiveSop/);
    expect(code).toMatch(/archiveTarget/);
    expect(code).not.toMatch(/from\('sops'\)[\s\S]{0,40}\.delete\(\)/);
  });

  it('OrgStructurePage يؤرشف ويعرض السبب الحقيقي', () => {
    const code = codeOnly(ORG_PAGE);
    expect(code).toMatch(/archiveService\.archiveDepartment/);
    // ★ السبب الحقيقي لا «حدث خطأ أثناء الحذف»
    expect(code).toMatch(/err instanceof Error \? err\.message/);
  });

  it('AdminPermissionsTree يعرض الخطأ داخل الصفحة', () => {
    const code = codeOnly(PERM_TREE);
    expect(code).toMatch(/setSaveError/);
    expect(code).not.toMatch(/(?<![.\w])alert\s*\(/);
  });

  it('AdminLandingPageCMS يؤكّد التراجع بنافذة', () => {
    const code = codeOnly(CMS_PAGE);
    expect(code).toMatch(/confirmReset/);
    expect(code).not.toMatch(/(?<![.\w])confirm\s*\(/);
  });
});

describe('0324 — الشيم واختبارات الإثبات', () => {
  it('★ الشيم يمنح authenticated صلاحيات الجداول (وإلا قِيس القيد لا السياسة)', () => {
    expect(SHIM).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated/);
  });

  it('★ ولا يمنح anon — المشروع يسحبها صراحةً', () => {
    expect(SHIM).not.toMatch(/GRANT SELECT ON TABLES TO anon/);
  });

  it('سكربت RLS يستعمل جلسة واحدة بـSET ROLE', () => {
    expect(RLS).toMatch(/SET request\.jwt\.claim\.sub/);
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/heredoc|<<SQL/);
  });

  it('يفحص المسار الشرعي لا المنع وحده', () => {
    expect(RLS).toMatch(/unified_approval_decide/);
    expect(RLS).toMatch(/الحارس منع المحرّك الشرعي/);
  });

  it('verify-0324 يوثّق العدد الحقيقي ولا تأكيدات ميتة', () => {
    expect(VERIFY).toMatch(/verify-0324: %\/29 تأكيداً ناجحاً/);  // 0325 أضاف تأكيد 1.2b
    expect(VERIFY).not.toMatch(/ASSERT[^;]*>=\s*0[^0-9]/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يفحص أن الحارس لم يكسر المحرّك الشرعي', () => {
    expect(VERIFY).toMatch(/الحارس منع المحرّك الشرعي/);
    expect(VERIFY).toMatch(/علَم المزامنة بقي مرفوعاً/);
  });
});
