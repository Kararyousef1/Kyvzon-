/**
 * ════════════════════════════════════════════════════════════════
 *  incidentLifecycleContract.test.ts
 *
 *  عقد «دورة حياة البلاغ» (migration 0341).
 *  المرحلة 3 — الجولة الرابعة.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-incident-lifecycle-0341.sql       68 تأكيداً
 *      tools/dev/verify-incident-lifecycle-0341-rls.sh    31 تأكيداً (RLS حقيقي)
 *      عكس 32 إصلاحاً ⇒ 32/32 أسقطت الاختبار
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0341_incident_lifecycle_and_inbox.sql');
const VERIFY = read('tools/dev/verify-incident-lifecycle-0341.sql');
const RLS = read('tools/dev/verify-incident-lifecycle-0341-rls.sh');
const SVC = read('src/services/sdk/IncidentService.ts');
const MY_PAGE = read('src/pages/employee/MyProblemsPage.tsx');
const HR_PAGE = read('src/pages/hr/HrProblemsInboxPage.tsx');
const META = read('src/pages/employee/problemsMeta.ts');
const ROUTER = read('src/router/AppRouter.tsx');
const DETAIL = read('src/pages/employee/ProblemDetail.tsx');

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

const MY_CODE = codeOnly(MY_PAGE);
const HR_CODE = codeOnly(HR_PAGE);
const SVC_CODE = codeOnly(SVC);

// ════════════════════════════════════════════════════════════════
describe('0341 — بنية المايجريشن', () => {
  it('كل دالة تُسبَق بـDROP صريح', () => {
    for (const fn of ['set_incident_status', 'archive_incident',
      'hr_incidents_inbox', 'my_incidents', 'hr_incident_stats']) {
      const drop = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}(`);
      const create = M.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(drop, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(create, `${fn}: DROP بعد CREATE`).toBeGreaterThan(drop);
    }
  });

  /**
   * ★★ توقيع hr_incidents_inbox و my_incidents تغيّر (معاملات جديدة).
   *   DROP على التوقيع القديم **إضافةً** إلى الجديد، وإلا بقيت نسخة
   *   قديمة محمَّلة وصار الاستدعاء ملتبساً.
   */
  it('★★ التوقيعات القديمة تُسقَط أيضاً (تغيّر عدد المعاملات)', () => {
    expect(M).toMatch(/DROP FUNCTION IF EXISTS public\.hr_incidents_inbox\(TEXT, TEXT, TEXT, INTEGER, INTEGER\)/);
    expect(M).toMatch(/DROP FUNCTION IF EXISTS public\.my_incidents\(TEXT, INTEGER, INTEGER\)/);
  });

  it('★ anon لا يُمنح EXECUTE على أي دالة', () => {
    for (const fn of ['set_incident_status', 'archive_incident',
      'hr_incidents_inbox', 'my_incidents', 'hr_incident_stats']) {
      expect(M, `${fn}: لا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
      expect(codeOnly(M), `${fn}: مُنح لـanon`)
        .not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO anon`));
    }
  });

  it('★★ الكاتبتان VOLATILE — الكتابة مستحيلة في STABLE', () => {
    expect(fnBody('set_incident_status')).toMatch(/\nVOLATILE\n/);
    expect(fnBody('archive_incident')).toMatch(/\nVOLATILE\n/);
  });

  it('★★★ الدوال القارئة الثلاث SECURITY INVOKER — تحترم RLS', () => {
    for (const fn of ['hr_incidents_inbox', 'my_incidents', 'hr_incident_stats']) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست INVOKER`).toMatch(/SECURITY INVOKER/);
      expect(body, `${fn}: صارت DEFINER`).not.toMatch(/SECURITY DEFINER/);
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ① — منع الحذف النهائي', () => {
  it('★★★ سياسة الحذف أُسقطت ولم يُعَد إنشاؤها', () => {
    expect(M).toMatch(/DROP POLICY IF EXISTS kyvzon_incidents_delete ON public\.incidents;/);
    expect(codeOnly(M)).not.toMatch(/CREATE POLICY kyvzon_incidents_delete/);
  });

  it('★★★ محفّز BEFORE DELETE يرفع استثناءً', () => {
    expect(M).toMatch(/BEFORE DELETE ON public\.incidents\s*\n\s*FOR EACH ROW EXECUTE FUNCTION public\.tg_block_incident_delete/);
    const trg = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.tg_block_incident_delete()'),
      M.indexOf('COMMENT ON FUNCTION public.tg_block_incident_delete()'));
    expect(trg).toMatch(/RAISE EXCEPTION\s*\n\s*'INCIDENT_DELETE_FORBIDDEN/);
    // ★ لا مسار عودة قبل الاستثناء
    expect(trg).not.toMatch(/RETURN OLD;[\s\S]*RAISE EXCEPTION/);
  });

  it('★★ الأرشفة بديل: عمود مستقلّ لا قيمة في status', () => {
    expect(M).toMatch(/ADD COLUMN IF NOT EXISTS archived_at\s+TIMESTAMPTZ/);
    expect(M).toMatch(/ADD COLUMN IF NOT EXISTS archived_by/);
    expect(M).toMatch(/ADD COLUMN IF NOT EXISTS archive_reason/);
    // ★ قيد status القائم لم يُمسّ (varchar(20) و CHECK بأربع قيم)
    expect(codeOnly(M)).not.toMatch(/incidents_status_check/);
  });

  it('★ الأرشفة تتطلّب سبباً وتُعيد FALSE للمؤرشف', () => {
    const body = fnBody('archive_incident');
    expect(body).toMatch(/INCIDENT_ARCHIVE_NEEDS_REASON/);
    expect(body).toMatch(/IF v_row\.archived_at IS NOT NULL THEN RETURN FALSE; END IF;/);
    expect(body).toMatch(/INCIDENT_NOT_AUTHORIZED_TO_ARCHIVE/);
  });

  it('★★ الأرشفة لا تحذف ولا تمسّ التعليقات', () => {
    const body = fnBody('archive_incident');
    expect(body).not.toMatch(/DELETE FROM/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ② — انتقالات الحالة', () => {
  const body = fnBody('set_incident_status');

  it('★★ جدول الانتقالات صريح لكل حالة', () => {
    expect(body).toMatch(/WHEN 'pending'\s+THEN ARRAY\['in_progress','resolved','closed'\]/);
    expect(body).toMatch(/WHEN 'in_progress' THEN ARRAY\['resolved','closed','pending'\]/);
    expect(body).toMatch(/WHEN 'resolved'\s+THEN ARRAY\['closed','in_progress'\]/);
    expect(body).toMatch(/WHEN 'closed'\s+THEN ARRAY\['in_progress'\]/);
    expect(body).toMatch(/INCIDENT_BAD_TRANSITION/);
  });

  /**
   * ★★★ الواجهة تعرض الأزرار من نسخة الجدول في problemsMeta.
   *   أي اختلاف بينهما = زرّ يفشل. نقارنهما نصّياً.
   */
  it('★★★ نسخة الواجهة مطابقة لجدول القاعدة حرفياً', () => {
    const pairs: Array<[string, string[]]> = [
      ['pending', ['in_progress', 'resolved', 'closed']],
      ['in_progress', ['resolved', 'closed', 'pending']],
      ['resolved', ['closed', 'in_progress']],
      ['closed', ['in_progress']],
    ];
    for (const [from, tos] of pairs) {
      const re = new RegExp(`${from}:\\s*\\[${tos.map((t) => `'${t}'`).join(', ')}\\]`);
      expect(META, `problemsMeta: ${from} لا يطابق القاعدة`).toMatch(re);
    }
  });

  it('★★★ صاحب البلاغ يسحب المعلّق فقط', () => {
    expect(body).toMatch(/IF v_row\.user_id IS DISTINCT FROM v_uid THEN[\s\S]*?INCIDENT_NOT_OWNER/);
    expect(body).toMatch(/IF v_row\.status <> 'pending' OR p_status <> 'closed' THEN[\s\S]*?INCIDENT_OWNER_LIMIT/);
  });

  it('★★ المؤرشف لا تتغيّر حالته', () => {
    expect(body).toMatch(/IF v_row\.archived_at IS NOT NULL THEN[\s\S]*?INCIDENT_ARCHIVED/);
  });

  it('★ closed_at/closed_by يُملآن ويُفرَّغان عند إعادة الفتح', () => {
    expect(body).toMatch(/closed_at = CASE WHEN p_status = 'closed' THEN NOW\(\)/);
    expect(body).toMatch(/WHEN p_status = 'in_progress' THEN NULL/);
  });

  it('★ الملاحظة تُسجَّل في incident_comments — أثر لا يُمحى', () => {
    expect(body).toMatch(/INSERT INTO public\.incident_comments/);
    expect(body).toMatch(/format\('\[%s ← %s\] %s'/);
  });

  it('★ تكرار نفس الحالة ليس خطأً', () => {
    expect(body).toMatch(/IF v_row\.status = p_status THEN\s*\n\s*RETURN v_row\.status;/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ③ — الصندوق: الاسم والإجمالي والأرشفة', () => {
  const body = fnBody('hr_incidents_inbox');

  /**
   * ★★★ profiles أوّلاً: `incidents.employee_name` نصّ يُملأ وقت الرفع
   *   ولا يتبع profiles. مُقاس: تغيير full_name والصندوق يعرض القديم.
   *   نفس عطل ⑤ في 0340.
   */
  it('★★★ الاسم من profiles قبل العمود النصّي', () => {
    const pick = body.slice(body.indexOf("ELSE COALESCE(\n                       NULLIF(btrim(pr.full_name)"),
      body.indexOf('AS f_reporter'));
    const pIdx = pick.indexOf('pr.full_name');
    const eIdx = pick.indexOf('i.employee_name');
    expect(pIdx, 'profiles غائب').toBeGreaterThan(-1);
    expect(eIdx, 'العمود النصّي احتياطاً غائب').toBeGreaterThan(-1);
    expect(pIdx, '★★★ العمود النصّي يسبق profiles').toBeLessThan(eIdx);
  });

  it('★★ والقسم من departments قبل العمود النصّي', () => {
    const pick = body.slice(body.indexOf("ELSE COALESCE(\n                       NULLIF(btrim(d.name_ar)"),
      body.indexOf('AS f_dept'));
    expect(pick.indexOf('d.name_ar')).toBeLessThan(pick.indexOf('i.department'));
  });

  it('★★★ إخفاء الهوية من 0338 منقول حرفياً', () => {
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN NULL ELSE i\.employee_id END/);
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN 'مُبلِّغ مجهول'/);
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN '—'/);
    // ★ البحث بالاسم لا يشمل المجهول — بكلا مصدري الاسم
    expect(body).toMatch(/NOT i\.is_anonymous AND i\.employee_name ILIKE/);
    expect(body).toMatch(/NOT i\.is_anonymous AND pr\.full_name\s+ILIKE/);
  });

  it('★★ out_total من نافذة count — الإجمالي بعد الترشيح', () => {
    expect(body).toMatch(/count\(\*\) OVER \(\)\s+AS out_total/);
    expect(body).toMatch(/LIMIT v_lim OFFSET v_off/);
  });

  it('★★ المؤرشف مستبعَد افتراضياً بمعامل صريح', () => {
    expect(body).toMatch(/COALESCE\(p_include_archived, FALSE\) OR i\.archived_at IS NULL/);
  });

  it('★ الترتيب يُقدّم المفتوح ثم الأشدّ خطورةً', () => {
    expect(body).toMatch(/CASE f\.f_status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1/);
    expect(body).toMatch(/CASE f\.f_sev WHEN 'critical' THEN 0 WHEN 'high' THEN 1/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ④ — بلاغاتي والإحصاءات', () => {
  const my = fnBody('my_incidents');

  it('★★★ الترشيح بـuser_id (ما تفعله السياسة)', () => {
    expect(my).toMatch(/WHERE i\.user_id = auth\.uid\(\)/);
  });

  it('★★ out_total والبحث في القاعدة', () => {
    expect(my).toMatch(/count\(\*\) OVER \(\) AS out_total/);
    expect(my).toMatch(/i\.title\s+ILIKE '%' \|\| v_q \|\| '%'/);
  });

  /**
   * ★★★ can_withdraw يجب أن يطابق شرط set_incident_status حرفياً،
   *   وإلا ظهر زرّ يفشل عند الضغط.
   */
  it('★★★ can_withdraw يطابق شرط set_incident_status', () => {
    expect(my).toMatch(/\(i\.status = 'pending' AND i\.archived_at IS NULL\) AS f_withdraw/);
    const setter = fnBody('set_incident_status');
    expect(setter).toMatch(/v_row\.status <> 'pending' OR p_status <> 'closed'/);
    expect(setter).toMatch(/v_row\.archived_at IS NOT NULL/);
  });

  it('★★ الإحصاءات تستبعد المؤرشف وتُضيف out_archived', () => {
    const st = fnBody('hr_incident_stats');
    expect(st).toMatch(/count\(\*\) FILTER \(WHERE i\.archived_at IS NULL\)/);
    expect(st).toMatch(/count\(\*\) FILTER \(WHERE i\.archived_at IS NOT NULL\)/);
  });

  it('★ unassigned يحسب المفتوح فقط — المحلول ليس مشكلة', () => {
    expect(fnBody('hr_incident_stats'))
      .toMatch(/i\.assigned_to IS NULL\s*\n\s*AND i\.status IN \('pending','in_progress'\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ⑤ — البلاغ اليتيم', () => {
  it('★★ البلاغات بلا مستأجر تُربط بصاحبها قبل فرض NOT NULL', () => {
    expect(M).toMatch(/UPDATE public\.incidents i\s*\n\s*SET tenant_id = p\.tenant_id/);
    const fix = M.indexOf('SET tenant_id = p.tenant_id');
    const notnull = M.indexOf('ALTER COLUMN tenant_id SET NOT NULL');
    expect(notnull).toBeGreaterThan(fix);
  });

  it('★★ لا حذف للبقايا — تحذير لا فشل ولا إبادة', () => {
    const blk = M.slice(M.indexOf('DO $$\nDECLARE v_fixed INT'), M.indexOf('-- ② الأرشفة'));
    expect(blk).toMatch(/RAISE WARNING/);
    expect(blk).not.toMatch(/DELETE FROM/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ⑥ — طبقة SDK', () => {
  it('★★★ setStatus و archive عبر RPC لا BaseService', () => {
    expect(SVC).toMatch(/supabase\.rpc\('set_incident_status'/);
    expect(SVC).toMatch(/supabase\.rpc\('archive_incident'/);
    // ★ updateStatus القديمة اختفت
    expect(SVC_CODE).not.toMatch(/async updateStatus\(/);
  });

  it('★★ hrInbox و myIncidents تُعيدان صفحةً بإجمالي', () => {
    expect(SVC).toMatch(/Promise<HrIncidentPage>/);
    expect(SVC).toMatch(/Promise<MyIncidentPage>/);
    expect(SVC).toMatch(/total: raw\.length > 0 \? Number\(raw\[0\]\.out_total \?\? 0\) : 0/);
  });

  it('★ الحدّ الافتراضي صار صفحةً لا 200 صفّاً', () => {
    expect(SVC).toMatch(/p_limit: opts\?\.limit \?\? 50/);
  });

  it('★ خريطة أخطاء عربية', () => {
    expect(SVC).toMatch(/export function incidentErrorMessage/);
    for (const code of ['INCIDENT_NOT_OWNER', 'INCIDENT_OWNER_LIMIT',
      'INCIDENT_DELETE_FORBIDDEN', 'ASSIGNEE_NOT_IN_TENANT']) {
      expect(SVC, `${code} غير مُترجَم`).toContain(code);
    }
  });

  it('★ لا as any ولا confirm/prompt/alert', () => {
    expect(SVC_CODE).not.toMatch(/\bas any\b/);
    expect(SVC_CODE).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ⑦ — تقسيم الشاشة', () => {
  it('★★★ الشاشتان موجودتان والقديمة أُرشفت', () => {
    expect(existsSync(resolve(root, 'src/pages/employee/MyProblemsPage.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'src/pages/hr/HrProblemsInboxPage.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'src/pages/employee/ProblemsList.tsx'))).toBe(false);
    // ★ أُرشفت لا حُذفت (القاعدة الذهبية)
    expect(existsSync(resolve(root, 'src/pages/_archived/ProblemsList.tsx'))).toBe(true);
  });

  it('★★★ لا isHR ولا تبديل دور داخل مكوّن', () => {
    expect(MY_CODE).not.toMatch(/isHR/);
    expect(HR_CODE).not.toMatch(/isHR/);
    expect(ROUTER).not.toMatch(/<ProblemsList/);
  });

  it('★★ المُوجّه يربط كل مسار بشاشته', () => {
    expect(ROUTER).toMatch(/path="employee\/problems" element=\{<MyProblemsPage \/>\}/);
    expect(ROUTER).toMatch(/path="problems" element=\{<HrProblemsInboxPage \/>\}/);
  });

  it('★★★ شاشة الموظف لا تلمس أدوات الموارد', () => {
    expect(MY_CODE).not.toMatch(/hrInbox/);
    expect(MY_CODE).not.toMatch(/hrStats/);
    expect(MY_CODE).not.toMatch(/incidentService\.archive\(/);
    expect(MY_CODE).not.toMatch(/incidentService\.assign\(/);
  });

  it('★★ وصندوق الموارد يملك أدواته الأربع', () => {
    expect(HR_CODE).toMatch(/incidentService\.hrInbox\(/);
    expect(HR_CODE).toMatch(/incidentService\.hrStats\(/);
    expect(HR_CODE).toMatch(/incidentService\.assign\(/);
    expect(HR_CODE).toMatch(/incidentService\.archive\(/);
    expect(HR_CODE).toMatch(/incidentService\.setStatus\(/);
  });

  it('★★★ الترقيم والبحث في القاعدة لا في المتصفح', () => {
    for (const [name, code] of [['MyProblemsPage', MY_CODE], ['HrInbox', HR_CODE]] as const) {
      expect(code, `${name}: يرشّح محلياً`).not.toMatch(/\.filter\(\([a-z]\) => [a-z]\.title/);
      expect(code, `${name}: بلا ترقيم`).toMatch(/offset: page \* PAGE_SIZE/);
      expect(code, `${name}: لا يمرّر البحث`).toMatch(/search: search\.trim\(\) \|\| null/);
    }
  });

  it('★★ الحدّ صفحة لا 200 صفّاً', () => {
    expect(MY_PAGE).toMatch(/const PAGE_SIZE = 20;/);
    expect(HR_PAGE).toMatch(/const PAGE_SIZE = 20;/);
    expect(MY_CODE).not.toMatch(/limit: 200/);
    expect(HR_CODE).not.toMatch(/limit: 200/);
  });

  it('★★★ زرّ السحب من القاعدة لا من تخمين الواجهة', () => {
    expect(MY_CODE).toMatch(/row\.canWithdraw &&/);
  });

  it('★ تغيير المرشّح يُعيد للصفحة الأولى (وإلا ظهرت صفحة فارغة)', () => {
    expect(MY_CODE).toMatch(/setPage\(0\)/);
    expect(HR_CODE).toMatch(/setPage\(0\)/);
  });

  it('★ الممنوعات في الشاشتين', () => {
    for (const [name, code] of [['MyProblemsPage', MY_CODE], ['HrInbox', HR_CODE]] as const) {
      expect(code, `${name}: as any`).not.toMatch(/\bas any\b/);
      expect(code, `${name}: confirm/alert`).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
      expect(code, `${name}: supabase`).not.toMatch(/services\/supabase\/supabase/);
      expect(code, `${name}: حذف`).not.toMatch(/\.delete\(/);
    }
  });

  it('★★ بيانات العرض مشتركة لا مكرّرة', () => {
    expect(MY_PAGE).toMatch(/from '\.\/problemsMeta'/);
    expect(HR_PAGE).toMatch(/from '\.\.\/employee\/problemsMeta'/);
    // ★ لا نسخة ثانية من الخرائط داخل الشاشتين
    expect(MY_CODE).not.toMatch(/const STATUS_CONFIG/);
    expect(HR_CODE).not.toMatch(/const STATUS_CONFIG/);
  });

  it('★★ ProblemDetail انتقلت إلى البوّابة', () => {
    expect(codeOnly(DETAIL)).not.toMatch(/incidentService\.updateStatus/);
    expect(DETAIL).toMatch(/incidentService\.setStatus\(/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0341 ⑧ — الاختبارات نفسها', () => {
  it('اختبار السلوك يرجع كل شيء', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION 'ROLLBACK_VERIFY_0341'/);
    expect(VERIFY).toMatch(/IF SQLERRM <> 'ROLLBACK_VERIFY_0341' THEN RAISE/);
  });

  it('★★ يلتقط سجلّ الموظف من محفّز 0317 ولا يُدرج ثانياً', () => {
    expect(VERIFY).toMatch(/SELECT id INTO v_eEmp FROM public\.employees WHERE user_id=v_uEmp/);
    expect(VERIFY).not.toMatch(/INSERT INTO public\.employees/);
  });

  /**
   * ★★★ ثغرتا تغطية أُصلحتا: مقارنة قيمتين متطابقتين لا تكشف الترتيب،
   *   و`IN ('pending','in_progress')` يقبل نصف الحالات فيمرّ صدفةً.
   */
  it('★★★ يفحص الاسم والقسم بقيمة مميِّزة لا بمجرد «غير فارغ»', () => {
    expect(VERIFY).toMatch(/ASSERT v_txt = 'سعد الاسم الجديد'/);
    expect(VERIFY).toMatch(/قسم الإنتاج المُعاد تسميته/);
    expect(VERIFY).toMatch(/تجهيز باطل: العمود النصّي تبع departments/);
  });

  it('★★★ يفحص الترتيب بتسلسل كامل لا بعضوية فضفاضة', () => {
    expect(VERIFY).toMatch(/pending\/critical → pending\/low → resolved\/low/);
    expect(VERIFY).not.toMatch(/v_txt IN \('pending','in_progress'\)/);
  });

  it('★★ يفحص عدم انحدار إخفاء الهوية (0338)', () => {
    expect(VERIFY).toMatch(/انحدار 0338: البلاغ المجهول يكشف/);
    expect(VERIFY).toMatch(/انحدار 0338: معرّف المُبلِّغ المجهول ظاهر/);
    expect(VERIFY).toMatch(/انحدار 0338: قسم المجهول ظاهر/);
  });

  it('★★ يوثّق أن القيود الثلاثة كانت موجودة (تصحيح ادّعاء أوّلي)', () => {
    expect(VERIFY).toMatch(/القيود الثلاثة \*\*موجودة\*\*|قيود CHECK القائمة/);
    expect(VERIFY).toMatch(/incidents_status_check/);
  });

  it('★ اختبار RLS يستعمل SET ROLE authenticated و anon', () => {
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/SET ROLE anon/);
    expect(RLS).toMatch(/permission denied/);
  });

  it('★★★ اختبار RLS يقيس العزل الذي لا يقيسه ملف SQL', () => {
    expect(RLS).toMatch(/عزل المستأجرين عبر RLS/);
    expect(RLS).toMatch(/out_total = 3 يحترم RLS/);
  });
});
