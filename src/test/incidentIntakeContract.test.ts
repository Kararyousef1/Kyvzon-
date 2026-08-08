/**
 * ════════════════════════════════════════════════════════════════
 *  incidentIntakeContract.test.ts
 *
 *  عقد «رفع البلاغ ومحادثته» (migration 0342).
 *  المرحلة 3 — الجولة الخامسة (إتمام دورة البلاغات).
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-incident-intake-0342.sql       52 تأكيداً
 *      tools/dev/verify-incident-intake-0342-rls.sh    33 تأكيداً (RLS حقيقي)
 *      عكس 27 إصلاحاً ⇒ 26 أسقطت ملف SQL · والأخيرة (حجب الداخلي)
 *      أسقطت سكربت RLS — وهو الموضع الوحيد الذي تُقاس فيه.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0342_incident_intake_and_thread.sql');
const VERIFY = read('tools/dev/verify-incident-intake-0342.sql');
const RLS = read('tools/dev/verify-incident-intake-0342-rls.sh');
const SVC = read('src/services/sdk/IncidentService.ts');
const CSVC = read('src/services/sdk/IncidentCommentService.ts');
const NEW_PAGE = read('src/pages/employee/NewProblemPage.tsx');
const DETAIL = read('src/pages/employee/ProblemDetail.tsx');
const BOUNDARY = read('scripts/check-sdk-boundary.mjs');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

function fnBody(name: string): string {
  const s = M.indexOf(`CREATE FUNCTION public.${name}(`);
  const e = M.indexOf(`COMMENT ON FUNCTION public.${name}(`);
  expect(s, `${name}: لا تعريف`).toBeGreaterThan(-1);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(s);
  return M.slice(s, e);
}

const NEW_CODE = codeOnly(NEW_PAGE);
const DETAIL_CODE = codeOnly(DETAIL);
const SVC_CODE = codeOnly(SVC);
const CSVC_CODE = codeOnly(CSVC);

// ════════════════════════════════════════════════════════════════
describe('0342 — بنية المايجريشن', () => {
  it('كل دالة تُسبَق بـDROP صريح', () => {
    for (const fn of ['submit_incident', 'add_incident_comment',
      'incident_thread', 'hr_incidents_inbox']) {
      const drop = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}(`);
      const create = M.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(drop, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(create, `${fn}: DROP بعد CREATE`).toBeGreaterThan(drop);
    }
  });

  it('★ anon لا يُمنح EXECUTE على أي دالة', () => {
    for (const fn of ['submit_incident', 'add_incident_comment', 'incident_thread']) {
      expect(M, `${fn}: لا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
      expect(codeOnly(M), `${fn}: مُنح لـanon`)
        .not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO anon`));
    }
  });

  it('★★ الكاتبتان VOLATILE — الكتابة مستحيلة في STABLE', () => {
    expect(fnBody('submit_incident')).toMatch(/\nVOLATILE\n/);
    expect(fnBody('add_incident_comment')).toMatch(/\nVOLATILE\n/);
  });

  it('★★★ incident_thread تبقى SECURITY INVOKER — الرؤية من RLS', () => {
    const body = fnBody('incident_thread');
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0342 ① — بوّابة رفع البلاغ', () => {
  const body = fnBody('submit_incident');

  it('★★★ لا تستقبل tenant_id ولا user_id ولا employee_id', () => {
    const sig = M.slice(M.indexOf('CREATE FUNCTION public.submit_incident('),
      M.indexOf('RETURNS TABLE ('));
    expect(sig).not.toMatch(/p_tenant/);
    expect(sig).not.toMatch(/p_user_id/);
    expect(sig).not.toMatch(/p_employee_id/);
  });

  it('★★ تشتقّها كلّها من الجلسة', () => {
    expect(body).toMatch(/v_tenant UUID := public\.current_user_tenant_id\(\)/);
    expect(body).toMatch(/v_uid\s+UUID := auth\.uid\(\)/);
    expect(body).toMatch(/v_emp\s+UUID := public\.current_user_employee_id\(\)/);
    expect(body).toMatch(/INCIDENT_NO_CONTEXT/);
  });

  /**
   * ★★★ جوهر العطل: الصفحة كانت تُفرّغ user_id للمجهول فتُصدّ بالسياسة،
   *   ولو مرّت لفقد صاحبُ البلاغ بلاغَه (my_incidents ترشّح بـuser_id).
   */
  it('★★★ user_id يُخزَّن دائماً — حتى للمجهول', () => {
    const ins = body.slice(body.indexOf('INSERT INTO public.incidents ('), body.length);
    // القيمة الأولى بعد tenant هي v_uid المجرَّد لا شرطاً
    expect(ins).toMatch(/v_tenant,\s*\n(?:\s*--[^\n]*\n)*\s*v_uid,/);
  });

  it('★ لكن reported_by يبقى NULL للمجهول (حقل عرض إداري)', () => {
    expect(body).toMatch(/CASE WHEN COALESCE\(p_anonymous, FALSE\) THEN NULL ELSE v_uid END/);
  });

  /**
   * ★★★ profiles أوّلاً: محفّز 0317 ينسخ الاسم مرّة بـON CONFLICT DO
   *   NOTHING فيتجمّد — نفس درس 0340 و0341.
   */
  it('★★★ الاسم من profiles قبل employees المتجمّد', () => {
    const pick = body.slice(body.indexOf('SELECT e.department_id'),
      body.indexOf('INTO v_dept'));
    expect(pick.indexOf('p.full_name')).toBeLessThan(pick.indexOf('e.first_name'));
  });

  it('★★ employee_id و department_id يُمرَّران للإدراج', () => {
    expect(body).toMatch(/v_emp, v_dept,/);
  });

  it('★ الفحوص المسبقة الثلاثة', () => {
    expect(body).toMatch(/INCIDENT_EMPTY/);
    expect(body).toMatch(/INCIDENT_BAD_CATEGORY/);
    expect(body).toMatch(/INCIDENT_BAD_SEVERITY/);
  });

  it('★ القيم المسموحة تطابق قيود الجدول القائمة', () => {
    expect(body).toMatch(/'technical','hr','management','workplace','salary','safety','other'/);
    expect(body).toMatch(/'low','medium','high','critical'/);
  });

  it('★ ai_analysis الفارغ يُطبَّع إلى {}', () => {
    expect(body).toMatch(/COALESCE\(p_ai_analysis, '\{\}'::JSONB\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0342 ② — خيط التعليقات', () => {
  it('★★★ سياسة رؤية صاحب البلاغ — قراءة فقط وبلا الداخلي', () => {
    expect(M).toMatch(/CREATE POLICY kyvzon_incident_comments_select_owner/);
    const pol = M.slice(M.indexOf('CREATE POLICY kyvzon_incident_comments_select_owner'),
      M.indexOf('COMMENT ON POLICY kyvzon_incident_comments_select_owner'));
    expect(pol).toMatch(/FOR SELECT/);
    expect(pol).not.toMatch(/FOR ALL/);
    expect(pol).not.toMatch(/WITH CHECK/);
    // ★★★ حجب الداخلي — بدونه تنكشف الملاحظات الإدارية
    expect(pol).toMatch(/COALESCE\(is_internal, FALSE\) = FALSE/);
    // ★ والشرط على **صاحب البلاغ** لا كاتب التعليق
    expect(pol).toMatch(/i\.user_id = auth\.uid\(\)/);
    expect(pol).toMatch(/tenant_id = public\.current_user_tenant_id\(\)/);
  });

  it('★★ بوّابة التعليق تشتقّ tenant_id من الجلسة', () => {
    const body = fnBody('add_incident_comment');
    expect(body).toMatch(/v_tenant UUID := public\.current_user_tenant_id\(\)/);
    expect(body).toMatch(/VALUES \(v_tenant,/);
  });

  it('★★★ الطرفية: غير الموظف الإداري يعلّق على بلاغه وحده', () => {
    const body = fnBody('add_incident_comment');
    expect(body).toMatch(/IF NOT v_staff AND v_row\.user_id IS DISTINCT FROM v_uid THEN[\s\S]*?COMMENT_NOT_PARTY/);
  });

  it('★★★ الملاحظة الداخلية لفريق الموارد وحده', () => {
    expect(fnBody('add_incident_comment'))
      .toMatch(/IF COALESCE\(p_internal, FALSE\) AND NOT v_staff THEN[\s\S]*?COMMENT_INTERNAL_STAFF_ONLY/);
  });

  it('★ لا تعليق على مؤرشف ولا نصّ فارغ', () => {
    const body = fnBody('add_incident_comment');
    expect(body).toMatch(/COMMENT_EMPTY/);
    expect(body).toMatch(/v_row\.archived_at IS NOT NULL[\s\S]*?INCIDENT_ARCHIVED/);
  });

  /**
   * ★★★ البلاغ المجهول لا يُفيد إخفاؤه إن كشف اسمُ كاتب التعليق صاحبَه.
   */
  it('★★★ الخيط يُخفي هوية صاحب البلاغ المجهول في تعليقاته', () => {
    const body = fnBody('incident_thread');
    expect(body).toMatch(/CASE WHEN i\.is_anonymous AND c\.user_id = i\.user_id\s*\n\s*THEN NULL ELSE c\.user_id END/);
    expect(body).toMatch(/THEN 'مُبلِّغ مجهول'/);
  });

  it('★ لكن اسم غيره يظهر (إخفاء بقدر الحاجة)', () => {
    expect(fnBody('incident_thread'))
      .toMatch(/ELSE COALESCE\(NULLIF\(btrim\(p\.full_name\), ''\), '—'\)/);
  });

  it('★ الترتيب زمني تصاعدي و out_is_mine من الجلسة', () => {
    const body = fnBody('incident_thread');
    expect(body).toMatch(/ORDER BY c\.created_at ASC/);
    expect(body).toMatch(/\(c\.user_id = auth\.uid\(\)\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0342 ③ — الصندوق: ai_analysis وعدّ التعليقات', () => {
  const body = fnBody('hr_incidents_inbox');

  it('★★ ai_analysis يُعرض (كان يُخزَّن ولا يُقرأ)', () => {
    expect(body).toMatch(/COALESCE\(i\.ai_analysis, '\{\}'::JSONB\)\s+AS f_ai/);
    expect(M).toMatch(/out_ai_analysis JSONB/);
  });

  it('★ عدّ التعليقات', () => {
    expect(body).toMatch(/SELECT count\(\*\) FROM public\.incident_comments c\s*\n\s*WHERE c\.incident_id = i\.id/);
    expect(M).toMatch(/out_comment_count BIGINT/);
  });

  it('★★★ إصلاحات 0341 و0338 منقولة حرفياً (لا انحدار)', () => {
    // 0341: profiles أوّلاً
    const pick = body.slice(body.indexOf("ELSE COALESCE(\n                       NULLIF(btrim(pr.full_name)"),
      body.indexOf('AS f_reporter'));
    expect(pick.indexOf('pr.full_name')).toBeLessThan(pick.indexOf('i.employee_name'));
    // 0341: out_total واستبعاد المؤرشف
    expect(body).toMatch(/count\(\*\) OVER \(\)\s+AS out_total/);
    expect(body).toMatch(/COALESCE\(p_include_archived, FALSE\) OR i\.archived_at IS NULL/);
    // 0338: إخفاء الهوية الثلاثي
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN NULL ELSE i\.employee_id END/);
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN 'مُبلِّغ مجهول'/);
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN '—'/);
    expect(body).toMatch(/NOT i\.is_anonymous AND i\.employee_name ILIKE/);
  });

  it('★ الإثراء الأثري لا يحذف شيئاً', () => {
    const blk = M.slice(M.indexOf('-- ⑥ إثراء البلاغات القائمة'), M.indexOf('-- ⑦ فهرس'));
    expect(blk).toMatch(/SET employee_id\s+= e\.id/);
    expect(blk).not.toMatch(/DELETE FROM/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0342 ④ — طبقة SDK', () => {
  it('★★★ submit عبر RPC ولا تقبل معرّفات من المتصفح', () => {
    expect(SVC).toMatch(/supabase\.rpc\('submit_incident'/);
    const sig = SVC.slice(SVC.indexOf('async submit(input: {'),
      SVC.indexOf('}): Promise<{ id: string; isAnonymous: boolean }>'));
    expect(sig).not.toMatch(/tenantId/);
    expect(sig).not.toMatch(/userId/);
    expect(sig).not.toMatch(/employeeId/);
  });

  it('★★★ خدمة التعليقات لا تلمس الجدول — RPC فقط', () => {
    expect(CSVC).toMatch(/supabase\.rpc\('incident_thread'/);
    expect(CSVC).toMatch(/supabase\.rpc\('add_incident_comment'/);
    expect(CSVC_CODE).not.toMatch(/\.from\(this\.tableName\)/);
    expect(CSVC_CODE).not.toMatch(/\.from\('incident_comments'\)/);
    // ★ الدالتان القديمتان اختفتا
    expect(CSVC_CODE).not.toMatch(/async findCommentsByIncident\(/);
    expect(CSVC_CODE).not.toMatch(/async addComment\(/);
  });

  it('★★ add لا تستقبل user_id — تشتقّه القاعدة', () => {
    expect(CSVC).toMatch(/async add\(incidentId: string, text: string, isInternal = false\)/);
  });

  it('★ user_id في CommentDetail nullable (المجهول)', () => {
    expect(CSVC).toMatch(/user_id: string \| null;/);
  });

  it('★ HrIncident يحمل الحقلين الجديدين', () => {
    expect(SVC).toMatch(/aiAnalysis: Record<string, unknown>;/);
    expect(SVC).toMatch(/commentCount: number;/);
  });

  it('★ لا as any ولا confirm/prompt/alert', () => {
    for (const [n, c] of [['IncidentService', SVC_CODE], ['IncidentCommentService', CSVC_CODE]] as const) {
      expect(c, `${n}: as any`).not.toMatch(/\bas any\b/);
      expect(c, `${n}: confirm`).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0342 ⑤ — الصفحتان', () => {
  it('★★★ NewProblemPage لا تلمس Supabase', () => {
    expect(NEW_CODE).not.toMatch(/services\/supabase\/supabase/);
    expect(NEW_CODE).not.toMatch(/\.from\('incidents'\)/);
    expect(NEW_CODE).toMatch(/incidentService\.submit\(/);
  });

  it('★★★ ولا تمرّر معرّفات ولا تُفرّغ user_id للمجهول', () => {
    expect(NEW_CODE).not.toMatch(/user_id:/);
    expect(NEW_CODE).not.toMatch(/reported_by:/);
    expect(NEW_CODE).not.toMatch(/tenant_id/);
    expect(NEW_CODE).toMatch(/isAnonymous: form\.isAnonymous/);
  });

  it('★★★ ProblemDetail لا تلمس Supabase (كان اشتراكاً لحظياً)', () => {
    expect(DETAIL_CODE).not.toMatch(/services\/supabase\/supabase/);
    expect(DETAIL_CODE).not.toMatch(/supabase\.channel/);
    expect(DETAIL_CODE).not.toMatch(/removeChannel/);
    expect(DETAIL_CODE).not.toMatch(/postgres_changes/);
  });

  it('★★ وتستعمل الخيط والبوّابة', () => {
    expect(DETAIL_CODE).toMatch(/incidentCommentService\.thread\(/);
    expect(DETAIL_CODE).toMatch(/incidentCommentService\.add\(/);
    expect(DETAIL_CODE).toMatch(/incidentService\.setStatus\(/);
    expect(DETAIL_CODE).not.toMatch(/findCommentsByIncident/);
    expect(DETAIL_CODE).not.toMatch(/addComment\(/);
  });

  it('★ رسائل الأخطاء عربية في الصفحتين', () => {
    expect(NEW_CODE).toMatch(/incidentErrorMessage\(/);
    expect(DETAIL_CODE).toMatch(/incidentErrorMessage\(/);
  });

  it('★ الممنوعات', () => {
    for (const [n, c] of [['NewProblemPage', NEW_CODE], ['ProblemDetail', DETAIL_CODE]] as const) {
      expect(c, `${n}: as any`).not.toMatch(/\bas any\b/);
      expect(c, `${n}: confirm`).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
      expect(c, `${n}: حذف`).not.toMatch(/\.delete\(/);
    }
  });

  /**
   * ★ القائمة البيضاء لحدود SDK: مدخلان صارا ميّتين بعد 0341/0342.
   *   تركُهما يعني السماح بعودة اللمس المباشر صامتاً.
   */
  it('★★ مدخلا البلاغات أُزيلا من allowlist حدود SDK', () => {
    expect(BOUNDARY).not.toMatch(/employee\/NewProblemPage\.tsx'/);
    expect(BOUNDARY).not.toMatch(/employee\/ProblemsList\.tsx'/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0342 ⑥ — الاختبارات نفسها', () => {
  it('اختبار السلوك يرجع كل شيء', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION 'ROLLBACK_VERIFY_0342'/);
    expect(VERIFY).toMatch(/IF SQLERRM <> 'ROLLBACK_VERIFY_0342' THEN RAISE/);
  });

  it('★★ يلتقط سجلّ الموظف من محفّز 0317 ولا يُدرج ثانياً', () => {
    expect(VERIFY).toMatch(/SELECT id INTO v_eEmp FROM public\.employees WHERE user_id=v_uEmp/);
    expect(VERIFY).not.toMatch(/INSERT INTO public\.employees/);
  });

  /**
   * ★★★ ثلاث ثغرات تغطية أُصلحت — كلها من عائلة «المقارنة بقيمة من
   *   نفس المصدر» و«التأكيد الفضفاض».
   */
  it('★★★ يفحص الاسم بقيمة مميِّزة لا بقيمة تطابق كلا المصدرين', () => {
    expect(VERIFY).toMatch(/سعد المُحدَّث كريم/);
    expect(VERIFY).toMatch(/تجهيز باطل: employees تبع profiles/);
  });

  it('★★★ ويفحص ترتيب الخيط بتسلسل كامل بعد مباعدة الطوابع', () => {
    expect(VERIFY).toMatch(/NOW\(\) - INTERVAL '3 hour'/);
    expect(VERIFY).toMatch(/تعليق الموظف نفسه → ردّ الموارد العلني → ملاحظة داخلية سرّية/);
  });

  it('★★ ويوثّق أن العزل ورؤية الخيط تُقاسان في RLS لا هنا', () => {
    expect(VERIFY).toMatch(/تُقاسان في\s*\n--\s*verify-incident-intake-0342-rls\.sh/);
  });

  it('★★★ سكربت RLS يقيس حجب التعليق الداخلي — وهو ما لا يُقاس بـpostgres', () => {
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/الملاحظة الداخلية محجوبة عنه/);
    expect(RLS).toMatch(/ردّ الموارد وصله/);
    expect(RLS).toMatch(/SET ROLE anon/);
  });

  it('★★ ويقيس أن الإدراج الخام (ما تفعله الصفحة القديمة) مصدود', () => {
    expect(RLS).toMatch(/row-level security/);
    expect(RLS).toMatch(/الصفحة كانت معطّلة/);
  });

  it('الملفات موجودة', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-incident-intake-0342.sql'))).toBe(true);
    expect(existsSync(resolve(root, 'tools/dev/verify-incident-intake-0342-rls.sh'))).toBe(true);
  });
});
