/**
 * ════════════════════════════════════════════════════════════════
 *  leavePolicyScopeContract.test.ts — عقد 0372
 *
 *  إصلاحُ أعطالٍ بلّغ عنها المستخدم بعد تطبيق المايجريشنات (2026-08-08):
 *    ① «أمورٌ لا تُحفظ»    ⇒ رصيدُ الإجازات صفرٌ أبداً
 *    ② «يظهر للموظف كما يظهر للموارد البشرية» ⇒ تبويباتٌ بلا حارس
 *    ③ «incList.forEach is not a function»    ⇒ شكلُ الناتج
 *
 *  ★★★ فحصٌ **ثابت** على النصّ: لا Postgres ولا متصفّح.
 *      السلوك يُثبته `verify-leave-policy-0372.sql` (40 تأكيداً)
 *      و`-rls.sh` (20 فحصاً بدور `authenticated`)
 *      و`_invert_0372.py` (19/19 عكساً · صفر ناجٍ).
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG       = read('supabase/migrations/0372_leave_policy_and_scope_guard.sql');
const DASH      = read('src/pages/hr/HRDashboard.tsx');
const LEAVE     = read('src/pages/employee/LeaveRequestPage.tsx');
const PERMS     = read('src/pages/employee/PermissionsPage.tsx');
const LEAVE_SVC = read('src/services/sdk/LeaveRequestService.ts');
const PERM_SVC  = read('src/services/sdk/PermissionRequestGatewayService.ts');
const ARCHIVED  = read('src/pages/_archived/ProblemsList.tsx');

const migBody = MIG.replace(/^\s*--.*$/gm, '');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** ★ النهاية `$$;` لا `\n$$;` (درس 0365) */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`, 'm');
  const m = migBody.match(re);
  expect(m, `الدالة ${name} غير موجودة`).toBeTruthy();
  return (m as RegExpMatchArray)[0];
}

// ════════════════════════════════════════════════════════════════
describe('0372 — ★★★★ العطل ①: «أمورٌ لا تُحفظ»', () => {
  it('★★★★ جدول سياسة الإجازات موجودٌ بافتراضيٍّ غير صفر', () => {
    expect(migBody).toContain('CREATE TABLE IF NOT EXISTS public.leave_policies');
    expect(migBody).toMatch(/annual_days\s+NUMERIC\(6,3\) NOT NULL DEFAULT 21/);
    expect(migBody).toMatch(/sick_days\s+NUMERIC\(6,3\) NOT NULL DEFAULT 30/);
  });

  it('★★★★ ومحفّزٌ يفتح رصيد كلّ موظفٍ جديد', () => {
    expect(migBody).toContain('trg_seed_leave_balance');
    expect(migBody).toContain('AFTER INSERT ON public.employees');
  });

  it('★★★★ ومحفّزٌ يبذر سياسة كلّ منشأةٍ جديدة', () => {
    // ★ عبارةُ INSERT وحدها تعمل مرّةً وقتَ المايجريشن؛ المنشأةُ
    //   التي تُنشأ بعده كانت تُولد بلا سياسة فيعود العطل كاملاً.
    expect(migBody).toContain('trg_seed_leave_policy');
    expect(migBody).toContain('AFTER INSERT ON public.tenants');
  });

  it('★★★ وأرصدةُ الموظفين القائمين مُلئت في المايجريشن', () => {
    expect(migBody).toMatch(/FOR r IN SELECT id FROM public\.employees LOOP/);
    expect(migBody).toContain('PERFORM public.ensure_leave_balance(r.id, v_year)');
  });

  it('★★★★ وضمانُ الرصيد محقونٌ في submit_leave_request', () => {
    expect(migBody).toContain('ensure_leave_balance(v_emp, v_year)');
    // ★ ويُتحقَّق من مطابقة نصّ الاستبدال — لا استبدالٌ صامت
    expect(migBody).toContain('فشل حقنُ ضمان الرصيد — لم يطابق نصُّ الإدراج');
  });

  it('★★★ الاستحقاق يحسب الأقدميّة والتناسب', () => {
    const body = fnBody('leave_entitlement');
    expect(body).toContain('seniority_step_years');
    expect(body).toContain('prorate_first_year');
    expect(body).toContain('LEAST(');
  });

  it('★★★★ ومنشأةٌ بلا سياسةٍ تأخذ الأساس لا صفراً', () => {
    const body = fnBody('leave_entitlement');
    expect(body).toContain('v_pol.annual_days          := 21;');
  });

  it('★★★★ وإعادةُ الحساب لا تهبط برصيدٍ مُنِح يدوياً', () => {
    const body = fnBody('ensure_leave_balance');
    expect(body).toContain('GREATEST(public.leave_balance.annual_total');
  });

  it('★★★ وقيدٌ يمنع خطوةَ أقدميّةٍ صفراً (قسمةٌ على صفر)', () => {
    const chk = migBody.match(/chk_leave_policy_sane[\s\S]*?END \$\$;/);
    expect(chk).toBeTruthy();
    const body = (chk as RegExpMatchArray)[0];
    expect(body).toContain('seniority_step_years BETWEEN 1 AND 40');
    expect(body).toContain('annual_days_max  >= annual_days');
  });

  it('★★★ توقيت بغداد صريحٌ — الخادم Etc/UTC', () => {
    expect(fnBody('leave_entitlement')).toContain("AT TIME ZONE 'Asia/Baghdad'");
  });
});

// ════════════════════════════════════════════════════════════════
describe('0372 — ★★★★ العطل ②: «يظهر للموظف كما يظهر للموارد»', () => {
  it('★★★★ حارسُ النطاق موجودٌ في القاعدة', () => {
    const body = fnBody('can_use_request_scope');
    expect(body).toContain('current_user_is_staff()');
    expect(body).toContain('hr_approval_steps');
  });

  it('★★★★ ومحقونٌ في الدالتين مع تحقُّقٍ من المطابقة', () => {
    expect(migBody).toContain('LEAVE_SCOPE_FORBIDDEN');
    expect(migBody).toContain('PERM_SCOPE_FORBIDDEN');
    // ★ لا استبدالٌ صامت: المايجريشن يرمي إن لم يطابق النمط
    expect(migBody).toContain('فشل حقنُ الحارس في leave_requests_view');
    expect(migBody).toContain('فشل حقنُ الحارس في permission_requests_view');
  });

  it('★★★ والصندوق يميّز نوع الطلب', () => {
    expect(fnBody('can_use_request_scope'))
      .toContain('r.request_type = p_request_type');
  });

  it('★★★★ والصفحتان تسألان القاعدة قبل رسم أيّ تبويب', () => {
    for (const [name, code] of [['الإجازات', LEAVE], ['الزمنيات', PERMS]] as const) {
      const body = strip(code);
      expect(body, `${name}: لا فحصَ صلاحية`).toContain('canUseScope(');
      expect(body, `${name}: لا حالةَ canSeeAll`).toContain('setCanSeeAll');
      expect(body, `${name}: لا حالةَ canSeeInbox`).toContain('setCanSeeInbox');
    }
  });

  it('★★★★ والتبويبات مُرشَّحةٌ بـshow لا معروضةٌ للجميع', () => {
    for (const [name, code] of [['الإجازات', LEAVE], ['الزمنيات', PERMS]] as const) {
      const body = strip(code);
      expect(body, `${name}: التبويبات بلا ترشيح`).toContain('.filter((t) => t.show)');
      expect(body, `${name}: سجلّ الشركة بلا شرط`).toMatch(/سجلّ الشركة[^}]*show: canSeeAll/);
      expect(body, `${name}: الصندوق بلا شرط`).toMatch(/بانتظار قراري[^}]*show: canSeeInbox/);
    }
  });

  it('★★★ والشريط كلُّه يختفي حين لا تبويبَ سوى «طلباتي»', () => {
    for (const code of [LEAVE, PERMS]) {
      expect(strip(code)).toContain('hidden={!canSeeAll && !canSeeInbox}');
    }
  });

  it('★★★ والخدمتان تُصدِّران canUseScope', () => {
    for (const [name, code] of [['leave', LEAVE_SVC], ['perm', PERM_SVC]] as const) {
      const body = strip(code);
      expect(body, `${name}: canUseScope غائبة`).toContain('async canUseScope(');
      expect(body, `${name}: لا تستدعي الحارس`).toContain("rpc('can_use_request_scope'");
      // ★ الأصلُ المنعُ لا السماح عند الخطأ
      expect(body, `${name}: تسمح عند الخطأ`).toMatch(/if \(error\)[\s\S]{0,220}return false;/);
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0372 — ★★★★ العطل ③: incList.forEach is not a function', () => {
  it('★★★★ HRDashboard تستخرج rows صراحةً', () => {
    const body = strip(DASH);
    expect(body).toContain('.then((p) => p.rows)');
  });

  it('★★★★ ولا فحصَ شرطيٍّ لوجود الدالة بدل شكل ناتجها', () => {
    const body = strip(DASH);
    // ★ `incidentService.hrInbox ? … : …` كان يفحص وجودَ الدالة
    //   لا شكلَ ناتجها، فمرّ الكائنُ إلى forEach فانفجرت اللوحة.
    expect(body).not.toMatch(/incidentService\.hrInbox\s*\n?\s*\?/);
  });

  it('★★★ وحارسُ Array.isArray يمنع انهياراً مستقبلياً', () => {
    expect(strip(DASH)).toContain('Array.isArray(incs)');
  });

  it('★★★ والملفّ المؤرشف صُحِّح كذلك (موضعان)', () => {
    const body = strip(ARCHIVED);
    expect(body).toContain('.hrInbox({ limit: 200 })).rows.map');
    expect(body).toContain('.myIncidents({ limit: 200 })).rows.map');
  });

  it('★★★★ ولا مستدعٍ يُعامل صفحةً كمصفوفة', () => {
    // ★ الدوال الثلاث التي تُعيد `{rows,total}` — كلُّ مستدعٍ يجب أن
    //   يستخرج `rows` أو يُسند إلى متغيّرٍ ثمّ يقرأ `.rows`.
    const pages = [DASH, ARCHIVED, LEAVE, PERMS];
    for (const code of pages) {
      const body = strip(code);
      for (const fn of ['hrInbox', 'myIncidents', 'myCatalog']) {
        const bad = new RegExp(`\\.${fn}\\([^)]*\\)\\)\\.(map|forEach|filter)\\(`);
        expect(body, `${fn} يُعامَل كمصفوفة`).not.toMatch(bad);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0372 — الجدار', () => {
  it('★★★ البوّابة الهجينة RESTRICTIVE على وحدة hr', () => {
    const pol = migBody.match(
      /CREATE POLICY hybrid_gate_leave_policies[\s\S]*?WITH CHECK[^;]*;/);
    expect(pol).toBeTruthy();
    const body = (pol as RegExpMatchArray)[0];
    expect(body).toContain('AS RESTRICTIVE');
    expect(body).toContain("hybrid_allows_module('hr')");
  });

  it('★★★ لا سياسة DELETE على السياسة', () => {
    expect(migBody).not.toMatch(/CREATE POLICY \w*leave_policies\w*\s+FOR DELETE/);
    expect(migBody).toContain('REVOKE DELETE ON public.leave_policies FROM authenticated');
  });

  it('★★★ REVOKE … FROM anon على الدوال الخمس', () => {
    for (const fn of ['leave_entitlement', 'ensure_leave_balance',
                      'can_use_request_scope', 'leave_policy_board',
                      'leave_policy_update']) {
      expect(migBody, `${fn} بلا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\b[^;]*FROM anon;`));
    }
  });

  it('★★★ وعلى الجدول', () => {
    expect(migBody).toContain('REVOKE ALL ON public.leave_policies FROM anon');
  });

  it('★★★ حارسُ الدور في دالّتَي السياسة', () => {
    expect(fnBody('leave_policy_board')).toContain('LEAVE_POLICY_FORBIDDEN');
    expect(fnBody('leave_policy_update')).toContain('LEAVE_POLICY_FORBIDDEN');
  });

  it('★★★ والتحديث يمسّ مستأجرَ المستخدم وحده', () => {
    expect(fnBody('leave_policy_update')).toContain('WHERE e.tenant_id = v_tenant');
  });

  it('★★ لا any في الصفحات والخدمات المعدَّلة', () => {
    for (const [name, code] of [
      ['LeaveRequestPage', LEAVE], ['PermissionsPage', PERMS],
      ['LeaveRequestService', LEAVE_SVC], ['PermissionGateway', PERM_SVC],
    ] as const) {
      const body = strip(code);
      expect(body, `as any في ${name}`).not.toMatch(/\bas any\b/);
      expect(body, `: any في ${name}`).not.toMatch(/:\s*any\b/);
    }
  });
});
