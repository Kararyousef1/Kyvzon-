/**
 * ════════════════════════════════════════════════════════════════
 *  incidentAnonymityContract.test.ts
 *
 *  عقد البلاغات: حماية هوية المُبلِّغ المجهول (migration 0338).
 *  المرحلة 3 — الجولة الأولى.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-incident-anonymity-0338.sql   52 تأكيداً
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0338_incident_anonymity_and_inbox.sql');
const VERIFY = read('tools/dev/verify-incident-anonymity-0338.sql');
const SVC = read('src/services/sdk/IncidentService.ts');
// ★ 0341: ProblemsList انقسمت إلى شاشتين. عقد 0338 يبقى ساريَ المفعول
//   على كلتيهما — نفحصهما معاً فلا يضيع الحارس بالتقسيم.
const MY_PAGE = read('src/pages/employee/MyProblemsPage.tsx');
const HR_PAGE = read('src/pages/hr/HrProblemsInboxPage.tsx');
const PAGE = MY_PAGE + '\n' + HR_PAGE;

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

describe('0338 — ★★★ إخفاء هوية المُبلِّغ المجهول', () => {
  const body = fnBody('hr_incidents_inbox');

  /**
   * ★★★ جوهر العطل: `ProblemsList` كانت تبني
   *     employeeName: isHR ? d.employee_name : user.full_name
   *   **بلا فحص `is_anonymous`** — فالبلاغ «المجهول» يكشف صاحبه.
   */
  it('★★★ الاسم يُستبدل بـ«مُبلِّغ مجهول»', () => {
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN 'مُبلِّغ مجهول'/);
  });

  /** ★★ لا يكفي حجب الاسم: من يملك قائمة الموظفين يربط المعرّف به */
  it('★★★ والمعرّف يُخفى أيضاً', () => {
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN NULL ELSE i\.employee_id END/);
  });

  /** ★★ في شركة صغيرة القسم يكشف الشخص */
  it('★★ والقسم كذلك', () => {
    expect(body).toMatch(/CASE WHEN i\.is_anonymous THEN '—'/);
  });

  /**
   * ★★★ لو شمل البحث بالاسم البلاغات المجهولة لأمكن كشفها: يكتب
   *   اسماً فتظهر «بلاغاته المجهولة».
   */
  it('★★★ البحث بالاسم لا يشمل المجهول', () => {
    expect(body).toMatch(
      /OR \(NOT i\.is_anonymous AND i\.employee_name ILIKE '%' \|\| v_q \|\| '%'\)/,
    );
  });

  it('★ لكن محتوى البلاغ يبقى مرئياً — الحماية للهوية لا المضمون', () => {
    expect(body).toMatch(/i\.title::TEXT/);
    expect(body).toMatch(/i\.description/);
  });

  it('★ و`is_anonymous` يصل الواجهة (لعرض الشارة)', () => {
    expect(body).toMatch(/i\.is_anonymous,/);
  });

  it('★★ الصندوق لـstaff وحدهم', () => {
    expect(body).toMatch(/IF NOT public\.current_user_is_staff\(\) THEN RETURN; END IF;/);
  });

  it('★★ مقيّد بالمستأجر', () => {
    expect(body).toMatch(/i\.tenant_id = v_tenant/);
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN; END IF;/);
  });

  it('★ الحرج أولاً ثم الأقدم', () => {
    expect(body).toMatch(/CASE i\.severity WHEN 'critical' THEN 1/);
    expect(body).toMatch(/i\.created_at ASC/);
  });

  it('★ SECURITY INVOKER', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });
});

describe('0338 — شاشة الموظف', () => {
  const body = fnBody('my_incidents');

  /**
   * ★ الترشيح بـ`user_id` لا `employee_id`: هذا ما تفعله سياسة
   *   `kyvzon_incidents_select`، والبلاغات القديمة سُجّلت به.
   *   الترشيح بـ`employee_id` كان سيُخفي بلاغات الموظف عن نفسه.
   */
  it('★★ يُرشّح بـuser_id لا employee_id', () => {
    expect(body).toMatch(/i\.user_id = v_uid/);
    expect(body).not.toMatch(/i\.employee_id = /);
  });

  it('★ مقيّد بالمستأجر', () => {
    expect(body).toMatch(/i\.tenant_id = v_tenant/);
  });

  it('★ SECURITY INVOKER', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });
});

describe('0338 — التحليلات', () => {
  const body = fnBody('hr_incident_stats');

  /** ★★ بلاغ محلول بلا مُسنَد ليس مشكلة تحتاج تنبيهاً */
  it('★★ «غير مُسنَد» يعدّ المفتوح وحده', () => {
    expect(body).toMatch(
      /FILTER \(WHERE assigned_to IS NULL\s*\n?\s*AND status NOT IN \('resolved','closed'\)\)/,
    );
  });

  it('★ وأقدم مفتوح كذلك', () => {
    expect(body).toMatch(
      /min\(created_at\) FILTER \(WHERE status NOT IN \('resolved','closed'\)\)/,
    );
  });

  it('★★ صفّ أصفار لا «لا شيء» (الواجهة تعرض بطاقات)', () => {
    expect(body).toMatch(/RETURN QUERY SELECT 0,0,0,0,0,0,0, 0::NUMERIC;/);
  });

  it('★ محجوب عن غير staff', () => {
    expect(body).toMatch(/NOT public\.current_user_is_staff\(\)/);
  });
});

describe('0338 — الإسناد', () => {
  const body = fnBody('assign_incident');

  it('★★ يرفض المُسنَد إليه من مستأجر آخر', () => {
    expect(body).toMatch(/ASSIGNEE_NOT_IN_TENANT/);
    expect(body).toMatch(/e\.tenant_id = v_tenant/);
  });

  it('★★ ويرفض غير staff', () => {
    expect(body).toMatch(/NOT_AUTHORIZED_TO_ASSIGN/);
  });

  it('★ يقبل NULL لإلغاء الإسناد', () => {
    expect(body).toMatch(/p_employee_id UUID DEFAULT NULL/);
    expect(body).toMatch(/IF p_employee_id IS NOT NULL AND NOT EXISTS/);
  });

  it('★ VOLATILE — تكتب (درس 0320)', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
    expect(body).not.toMatch(/\bSTABLE\b/);
  });

  it('★ مقيّد بالمستأجر في التحديث', () => {
    expect(body).toMatch(/WHERE id = p_incident_id\s*\n\s*AND tenant_id = v_tenant/);
  });
});

describe('0338 — الصلاحيات والفهارس', () => {
  it.each([
    'my_incidents(TEXT,INTEGER,INTEGER)',
    'hr_incidents_inbox(TEXT,TEXT,TEXT,INTEGER,INTEGER)',
    'hr_incident_stats(INTEGER)',
    'assign_incident(UUID,UUID)',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC`));
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it.each([
    'idx_incidents_user_created',
    'idx_incidents_tenant_status',
    'idx_incidents_unassigned_open',
  ])('%s موجود وقابل لإعادة التشغيل', (idx) => {
    expect(M).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
  });

  it('★ فهرس غير المُسنَد جزئي', () => {
    const i = M.indexOf('idx_incidents_unassigned_open');
    expect(M.slice(i, i + 220)).toMatch(/WHERE assigned_to IS NULL/);
  });

  it('★ DROP قبل CREATE (درس 0320)', () => {
    for (const fn of ['my_incidents', 'hr_incidents_inbox',
                      'hr_incident_stats', 'assign_incident']) {
      const d = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}`);
      const c = M.indexOf(`CREATE FUNCTION public.${fn}`);
      expect(d, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(d, `${fn}: DROP بعد CREATE`).toBeLessThan(c);
    }
  });
});

describe('0338 — طبقة SDK', () => {
  it.each(['my_incidents', 'hr_incidents_inbox', 'hr_incident_stats', 'assign_incident'])(
    'تستدعي %s عبر RPC',
    (fn) => {
      expect(SVC).toContain(`rpc('${fn}'`);
    },
  );

  it('★ الأنواع الثلاثة مُصدَّرة', () => {
    for (const t of ['MyIncident', 'HrIncident', 'HrIncidentStats']) {
      expect(SVC).toMatch(new RegExp(`export interface ${t}`));
      expect(read('src/services/sdk/index.ts')).toContain(t);
    }
  });

  it('★★ employeeId يقبل null (المجهول)', () => {
    expect(SVC).toMatch(/employeeId: string \| null/);
  });

  it('★ بلا as any', () => {
    expect(codeOnly(SVC)).not.toMatch(/\bas any\b/);
  });
});

describe('★★★ الصفحة — لا لمس مباشر ولا كشف هوية', () => {
  it('★★★ لا تستعلم عن incidents مباشرةً', () => {
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/\.from\('incidents'\)/);
    expect(code).not.toMatch(/from '.*services\/supabase\/supabase'/);
  });

  it('★★★ لا تقرأ employee_name خاماً', () => {
    expect(codeOnly(PAGE)).not.toMatch(/d\.employee_name/);
  });

  it('★★ كل شاشة لدالتها — لا خلط بعد التقسيم (0341)', () => {
    expect(HR_PAGE).toMatch(/incidentService\.hrInbox\(/);
    expect(MY_PAGE).toMatch(/incidentService\.myIncidents\(/);
    // ★★★ شاشة الموظف لا تلمس صندوق الموارد ولا العكس
    expect(MY_PAGE).not.toMatch(/incidentService\.hrInbox\(/);
    expect(MY_PAGE).not.toMatch(/hrStats\(/);
  });

  it('★ الاسم يأتي من reporter (المُخفى في القاعدة)', () => {
    // ★ 0341: صار `row.reporter` مباشرةً بلا تسطيح إلى نوع Problem وسيط
    expect(HR_PAGE).toMatch(/row\.reporter/);
    // ★★★ ولا تبني الشاشة الاسم من حقل خام
    expect(codeOnly(HR_PAGE)).not.toMatch(/employee_name/);
  });

  it('★ بلا as any ولا confirm', () => {
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/\bas any\b/);
    expect(code).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
  });
});

describe('0338 — الاختبار السلوكي', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-incident-anonymity-0338.sql'))).toBe(true);
  });

  it('★★★ يفحص إخفاء الاسم والمعرّف والقسم', () => {
    expect(VERIFY).toMatch(/الهوية مكشوفة/);
    expect(VERIFY).toMatch(/الحجب صوري/);
    expect(VERIFY).toMatch(/يكشفه في فريق صغير/);
  });

  it('★★★ ويفحص الكشف بالاستنتاج عبر البحث', () => {
    expect(VERIFY).toMatch(/الهوية تُكشَف بالاستنتاج/);
  });

  it('★ ويتحقق أن المحتوى يبقى مرئياً', () => {
    expect(VERIFY).toMatch(/الحماية للهوية لا المضمون/);
  });

  it('★★ ويفحص أن الموظف يرى بلاغه المجهول (هو صاحبه)', () => {
    expect(VERIFY).toMatch(/الموظف لا يرى بلاغه المجهول/);
  });

  /**
   * ★★★ تصحيح 0341: التأكيد الأصلي في ملف SQL كان **لا يقيس شيئاً**.
   *   `set_config('request.jwt.claim.sub', …)` يغيّر `auth.uid()` لكن
   *   الدور يبقى `postgres` (BYPASSRLS)، و`hr_incidents_inbox` INVOKER
   *   تعتمد على RLS وحده — فلا حجب مهما كان المستخدم. مروره سابقاً كان
   *   لأن الصندوق كان فارغاً في تلك اللحظة لا لأن الحجب يعمل.
   *   الحجب الحقيقي انتقل إلى سكربت RLS بـ`SET ROLE authenticated`،
   *   وهذا العقد يحرس وجوده هناك بدل حراسة تأكيد أجوف.
   */
  it('★★★ حجب الصندوق يُقاس في سكربت RLS لا في ملف SQL', () => {
    const rls = read('tools/dev/verify-incident-lifecycle-0341-rls.sh');
    expect(rls).toMatch(/SET ROLE authenticated/);
    expect(rls).toMatch(/موظف عادي عبر صندوق الموارد/);
    // ★ وملف SQL يوثّق سبب النقل صراحةً
    expect(VERIFY).toMatch(/تصحيح 0341[\s\S]{0,400}?لا يقيس شيئاً/);
  });

  it('★★ ويفحص رفض الإسناد عبر المستأجرين', () => {
    expect(VERIFY).toMatch(/أُسنِد بلاغ لموظف شركة أخرى/);
  });
});
