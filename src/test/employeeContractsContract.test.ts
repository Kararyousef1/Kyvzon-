/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0364 — سلامة عقود الموظفين
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-employee-contracts-0364.sql`
 *     — **123** تأكيداً بأرقام محسوبة يدوياً
 *   · العزل مُثبَت في `…-0364-rls.sh` بدور `authenticated` حقيقيّ
 *     — **48** فحصاً
 *   · التغطية مُثبتة في `_invert_0364.py` — **54/54** عكساً أسقط
 *     الاختبار (+2 تكافؤ مُثبت)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: شرطٌ ميّتٌ في جدارٍ
 *   أمنيّ · عقودٌ نشطةٌ متداخلة · حالةٌ لا تتحرّك · تجديدٌ يمحو تاريخه ·
 *   حسابٌ بتوقيت المتصفّح · حذفٌ نهائيّ لوثيقةٍ قانونية.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0364_employee_contracts_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/EmployeeContractService.ts');
const PAGE    = read('src/pages/hr/EmployeeContractsPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة (درس 0355) ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs("/* differenceInCalendarDays */ const x=1;"))
      .not.toMatch(/differenceInCalendarDays/);
    expect(codeTs("// auth.uid()\nconst y=1;")).not.toMatch(/auth\.uid/);
    expect(codeTs("const s = c.renewalCount;")).toMatch(/renewalCount/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'renewed مذكور';")).not.toMatch(/renewed/);
    expect(stmtSql("  AND c.status = 'active'")).toMatch(/c\.status/);
    expect(stmtSql("SELECT 'it''s ok' AS x;")).not.toMatch(/ok/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/** ★ درس 0355: على النصّ المُجرَّد من التعليقات */
const fnBody = (name: string): string => {
  const i = MIG_CODE.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في ${MIG_PATH}`).toBeGreaterThan(-1);
  const j = MIG_CODE.indexOf('$$;', i);
  expect(j, `نهاية ${name} غير موجودة`).toBeGreaterThan(i);
  return MIG_CODE.slice(i, j);
};

const NEW_FNS = ['contract_expire_due', 'contract_board', 'contract_summary',
                 'contract_upsert', 'contract_renew', 'contract_terminate'];

const TYPES = ['permanent', 'fixed_term', 'probation',
               'part_time', 'consultant', 'other'];
const STATES = ['draft', 'active', 'expired', 'terminated', 'renewed'];

// ═══════════════════════════════════════════════════════════════
describe('0364 — بنية المايجريشن', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, MIG_PATH))).toBe(true);
  });

  it('معاملة واحدة BEGIN/COMMIT', () => {
    expect(MIG_CODE).toMatch(/^\s*BEGIN;/m);
    expect(MIG_CODE).toMatch(/^\s*COMMIT;\s*$/m);
  });

  it.each(NEW_FNS)('%s مُعرَّفة بـDROP صريح قبلها', (fn) => {
    expect(MIG_CODE).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    expect(MIG_CODE).toMatch(new RegExp(`CREATE FUNCTION public\\.${fn}\\(`));
  });

  it.each(NEW_FNS)('%s تُثبّت search_path', (fn) => {
    expect(fnBody(fn)).toMatch(/SET search_path = public/);
  });

  it.each(NEW_FNS)('%s: REVOKE عن anon موجود', (fn) => {
    // ★★★ 0268 يمنح authenticated EXECUTE تلقائياً (pg_default_acl)
    const i = MIG_CODE.indexOf(`REVOKE ALL ON FUNCTION public.${fn}(`);
    expect(i, `REVOKE مفقود لـ${fn}`).toBeGreaterThan(-1);
    expect(MIG_CODE.slice(i, i + 700)).toMatch(/FROM anon;/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ①: الشرط الميّت أُسقط من السياسة', () => {
  it('السياسة أُعيد إنشاؤها', () => {
    const drop = MIG_CODE.indexOf('DROP POLICY IF EXISTS kyvzon_employee_contracts_select');
    const create = MIG_CODE.indexOf('CREATE POLICY kyvzon_employee_contracts_select');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
  });

  it('★★★ وauth.uid() اختفى من جسمها', () => {
    const i = MIG_CODE.indexOf('CREATE POLICY kyvzon_employee_contracts_select');
    const body = MIG_CODE.slice(i, i + 600);
    // employees.id ≠ auth.users.id ⇒ الشرط لا يُطابق صفّاً أبداً
    expect(body, 'الشرط الميّت عاد').not.toMatch(/employee_id = auth\.uid\(\)/);
    expect(body).toMatch(/current_user_employee_id\(\)/);
    expect(body).toMatch(/current_user_is_staff\(\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ②/③: FK مركَّب للموظف', () => {
  it('FK على (employee_id, tenant_id)', () => {
    expect(MIG_CODE).toMatch(/employee_contracts_employee_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(employee_id, tenant_id\)/);
    expect(MIG_CODE).toMatch(/REFERENCES public\.employees \(id, tenant_id\)/);
  });

  it('★★ ON DELETE RESTRICT لا CASCADE', () => {
    const i = MIG_CODE.lastIndexOf('employee_contracts_employee_tenant_fkey');
    const def = MIG_CODE.slice(i, i + 400);
    expect(def).toMatch(/ON DELETE RESTRICT/);
    expect(def).not.toMatch(/ON DELETE CASCADE/);
  });

  it('والدالة تحرس المستأجر برمزٍ صريح', () => {
    expect(fnBody('contract_upsert')).toMatch(/CONTRACT_EMPLOYEE_NOT_FOUND/);
    expect(fnBody('contract_upsert')).toMatch(/e\.tenant_id = v_tenant/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ④/⑥: التواريخ ومحدد المدة', () => {
  it('قيد النهاية بعد البداية', () => {
    expect(MIG_CODE).toMatch(/employee_contracts_dates_chk/);
    expect(MIG_CODE).toMatch(/end_date IS NULL OR end_date >= start_date/);
    expect(fnBody('contract_upsert')).toMatch(/CONTRACT_END_BEFORE_START/);
  });

  it('★★★ قيد محدد المدة يُلزم بنهاية', () => {
    expect(MIG_CODE).toMatch(/employee_contracts_term_chk/);
    expect(MIG_CODE).toMatch(/contract_type NOT IN \('fixed_term','probation'\)/);
    expect(fnBody('contract_upsert')).toMatch(/CONTRACT_TERM_NEEDS_END/);
  });

  it('★★ والخدمة تُصدِّر TERM_TYPES و needsEndDate', () => {
    expect(SVC_CODE).toMatch(/TERM_TYPES/);
    expect(SVC_CODE).toMatch(/export const needsEndDate/);
    expect(SVC_CODE).toMatch(/'fixed_term', 'probation'/);
  });

  it('★★ والصفحة تُخبر قبل أن ترفض القاعدة', () => {
    expect(PAGE_CODE).toMatch(/needsEndDate\(form\.contractType\)/);
    expect(PAGE_CODE).toMatch(/يحتاج تاريخ نهاية/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑤: عقدٌ نشطٌ واحد لكل موظف', () => {
  it('فهرسٌ فريد جزئيّ', () => {
    expect(MIG_CODE).toMatch(/uq_employee_contracts_one_active/);
    expect(MIG_CODE).toMatch(/ON public\.employee_contracts \(tenant_id, employee_id\)/);
    expect(MIG_CODE).toMatch(/WHERE status = 'active'/);
  });

  it('والدالة ترمي رمزاً مفهوماً قبله', () => {
    expect(fnBody('contract_upsert')).toMatch(/CONTRACT_ACTIVE_EXISTS/);
  });

  it('★ والصفوف المتداخلة عولجت قبل الفهرس', () => {
    const heal = MIG_CODE.indexOf("SET status = 'renewed'");
    const idx = MIG_CODE.indexOf('uq_employee_contracts_one_active');
    expect(heal).toBeGreaterThan(-1);
    expect(idx, 'الفهرس أُنشئ قبل العلاج').toBeGreaterThan(heal);
  });

  it('★ والصفحة تُنبّه إليه', () => {
    expect(PAGE_CODE).toMatch(/عقدٌ نشطٌ واحد/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑦: الحالة تتحرّك', () => {
  it('contract_expire_due موجودة', () => {
    const b = fnBody('contract_expire_due');
    expect(b).toMatch(/SET status = 'expired'/);
    expect(b).toMatch(/end_date < v_today/);
    expect(b).toMatch(/GET DIAGNOSTICS v_n = ROW_COUNT/);
  });

  it('★★ والملخّص يكشف التناقض القائم', () => {
    expect(fnBody('contract_summary')).toMatch(/out_stale/);
    expect(fnBody('contract_summary'))
      .toMatch(/status = 'active' AND end_date IS NOT NULL AND end_date < v_today/);
  });

  it('★★★ والصفحة فيها زرّ ترحيل وتنبيه', () => {
    expect(PAGE_CODE).toMatch(/contractSdk\.expireDue\(/);
    expect(PAGE_CODE).toMatch(/ترحيل المنتهية/);
    expect(PAGE_CODE).toMatch(/summary\.stale/);
  });

  it('★ والصفوف القائمة رُحّلت في المايجريشن', () => {
    expect(MIG_CODE).toMatch(/SET status = 'expired'\s*\n\s*WHERE status = 'active'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑧/⑨: المدّة والراتب والعملة', () => {
  it('قيد مدّة التنبيه 1..365', () => {
    expect(MIG_CODE).toMatch(/employee_contracts_notice_chk/);
    expect(MIG_CODE).toMatch(/renewal_notice_days > 0 AND renewal_notice_days <= 365/);
    expect(fnBody('contract_upsert')).toMatch(/CONTRACT_NOTICE_INVALID/);
  });

  it('قيد الراتب الموجب', () => {
    expect(MIG_CODE).toMatch(/employee_contracts_salary_chk/);
    expect(fnBody('contract_upsert')).toMatch(/CONTRACT_SALARY_INVALID/);
  });

  it('قيد العملة بمفردات خمس', () => {
    expect(MIG_CODE).toMatch(/employee_contracts_currency_chk/);
    for (const c of ['IQD', 'USD', 'EUR', 'SAR', 'AED']) {
      expect(MIG_CODE, `العملة ${c} غائبة`).toContain(`'${c}'`);
    }
    expect(fnBody('contract_upsert')).toMatch(/CONTRACT_CURRENCY_INVALID/);
  });

  it('★ والمفردات نفسها في الخدمة', () => {
    expect(SVC_CODE).toMatch(/CONTRACT_CURRENCIES = \['IQD', 'USD', 'EUR', 'SAR', 'AED'\]/);
    expect(PAGE_CODE).toMatch(/CONTRACT_CURRENCIES\.map/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑩: الحذف ممنوع', () => {
  it('محفّز BEFORE DELETE برمز صريح', () => {
    expect(MIG_CODE).toMatch(/tg_block_employee_contract_delete/);
    expect(MIG_CODE).toMatch(/CONTRACT_DELETE_BLOCKED/);
    expect(MIG_CODE).toMatch(/BEFORE DELETE ON public\.employee_contracts/);
  });

  it('★ لا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE, 'delete عاد').not.toMatch(/\.delete\(/);
    expect(PAGE_CODE, 'delete عاد').not.toMatch(/\.delete\(/);
  });

  it('★★ ولا confirm/alert/prompt (سياسة المنصة)', () => {
    for (const banned of ['confirm(', 'alert(', 'prompt(']) {
      expect(PAGE_CODE, `${banned} عاد`).not.toContain(banned);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑪: التجديد يحفظ السلسلة', () => {
  it('الأعمدة الثلاثة أُضيفت', () => {
    for (const col of ['renewed_from', 'previous_end_date', 'renewal_count']) {
      expect(MIG_CODE, `${col} لم يُضَف`)
        .toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`));
    }
  });

  it('★★★ والتجديد يُنشئ عقداً جديداً لا يكتب فوق القديم', () => {
    const b = fnBody('contract_renew');
    expect(b).toMatch(/SET status = 'renewed'/);
    expect(b).toMatch(/INSERT INTO public\.employee_contracts/);
    expect(b).toMatch(/p_id, v_old\.end_date, v_old\.renewal_count \+ 1/);
    // العطل: UPDATE … SET end_date = p_new_end
    expect(b, 'الكتابة فوق القديم عادت')
      .not.toMatch(/SET end_date = p_new_end/);
  });

  it('★★ وحرّاس التجديد', () => {
    const b = fnBody('contract_renew');
    expect(b).toMatch(/CONTRACT_RENEW_NEEDS_END/);
    expect(b).toMatch(/CONTRACT_RENEW_NOT_LATER/);
    expect(b).toMatch(/CONTRACT_RENEW_IN_PAST/);
    expect(b).toMatch(/CONTRACT_NOT_RENEWABLE/);
  });

  it('★ والخدمة تُصدِّرها بنوعٍ صريح', () => {
    expect(SVC_CODE).toMatch(/async renew\(/);
    expect(SVC_CODE).toMatch(/renewalCount/);
    expect(SVC_CODE).toMatch(/previousEnd/);
  });

  it('★★ والصفحة تعرض السلسلة وتُفرد نافذة للتجديد', () => {
    expect(PAGE_CODE).toMatch(/contractSdk\.renew\(/);
    expect(PAGE_CODE).toMatch(/c\.renewalCount > 0/);
    expect(PAGE_CODE).toMatch(/يُنشئ عقداً جديداً/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑫/⑬: الإنهاء والربط', () => {
  it('أعمدة الإنهاء والربط أُضيفت', () => {
    for (const col of ['terminated_at', 'termination_reason',
                       'job_application_id', 'offboarding_id']) {
      expect(MIG_CODE, `${col} لم يُضَف`)
        .toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`));
    }
  });

  it('★★★ وقيدٌ يجعل الإنهاء بلا سببٍ مستحيلاً', () => {
    expect(MIG_CODE).toMatch(/employee_contracts_termination_chk/);
    expect(MIG_CODE).toMatch(/status <> 'terminated'/);
    expect(fnBody('contract_terminate')).toMatch(/CONTRACT_TERMINATION_REASON_REQUIRED/);
  });

  it('★★ والمحفّز يملأ terminated_at', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_employee_contract_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.terminated_at := COALESCE\(NEW\.terminated_at, now\(\)\)/);
  });

  it('★ وحرّاس الإنهاء', () => {
    const b = fnBody('contract_terminate');
    expect(b).toMatch(/CONTRACT_ALREADY_TERMINATED/);
    expect(b).toMatch(/CONTRACT_TERMINATION_BEFORE_START/);
  });

  it('★ والصفحة تعرض السبب والتاريخ', () => {
    expect(PAGE_CODE).toMatch(/detail\.terminationReason/);
    expect(PAGE_CODE).toMatch(/detail\.terminatedAt/);
    expect(PAGE_CODE).toMatch(/contractSdk\.terminate\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑮: الحساب بتوقيت بغداد لا بالمتصفّح', () => {
  it('اللوح يُعيد days_left و expiry_state', () => {
    const b = fnBody('contract_board');
    expect(b).toMatch(/out_days_left/);
    expect(b).toMatch(/out_expiry_state/);
    for (const s of ['open_ended', 'expired', 'expiring', 'valid']) {
      expect(b, `الحالة ${s} غائبة`).toContain(`'${s}'`);
    }
  });

  it('★★★ وكل دالةٍ تحسب تاريخاً تستعمل توقيت بغداد', () => {
    for (const fn of ['contract_expire_due', 'contract_board', 'contract_summary',
                      'contract_upsert', 'contract_renew', 'contract_terminate']) {
      expect(fnBody(fn), `${fn} بلا منطقة بغداد`)
        .toMatch(/now\(\) AT TIME ZONE 'Asia\/Baghdad'/);
    }
  });

  it('★ ولا CURRENT_DATE عارية في الدوال الجديدة', () => {
    for (const fn of NEW_FNS) {
      expect(fnBody(fn), `${fn} تستعمل CURRENT_DATE`).not.toMatch(/\bCURRENT_DATE\b/);
    }
  });

  it('★★★ والصفحة لا تحسب بنفسها', () => {
    // العطل: differenceInCalendarDays(new Date(end_date), new Date())
    expect(PAGE_CODE, 'الحساب في المتصفّح عاد')
      .not.toMatch(/differenceInCalendarDays/);
    expect(PAGE_CODE).toMatch(/c\.daysLeft/);
    expect(PAGE_CODE).toMatch(/contractExpiryLabel/);
  });

  it('★ ونافذة التنبيه من العمود لا رقماً ثابتاً', () => {
    expect(fnBody('contract_board'))
      .toMatch(/v_today \+ c\.renewal_notice_days/);
    expect(fnBody('contract_summary'))
      .toMatch(/v_today \+ renewal_notice_days/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑯/⑰/⑱: الاستعلام الواحد والمنشئ والرقم', () => {
  it('الصفحة لا تجلب كل الموظفين', () => {
    expect(PAGE_CODE, 'employeeService.findAll عاد')
      .not.toMatch(/employeeService\.findAll/);
    expect(PAGE_CODE).not.toMatch(/new Map\(employees\.map/);
    expect(PAGE_CODE).not.toMatch(/employeeMap/);
    expect(PAGE_CODE, 'orderBy full_name_ar عاد')
      .not.toMatch(/orderBy:\s*'full_name_ar'/);
    expect(PAGE_CODE).toMatch(/contractSdk\.board\(/);
  });

  it('★ ولا employeeContractService القديمة', () => {
    expect(PAGE_CODE).not.toMatch(/employeeContractService/);
    expect(PAGE_CODE).not.toMatch(/renewContract|terminateContract|createContract/);
  });

  it('★ والاسم من الاحتياطيّ (full_name_ar فارغ لكل موظف)', () => {
    const b = fnBody('contract_board');
    expect(b).toMatch(/NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/e\.first_name \|\| ' ' \|\| e\.last_name/);
    expect(b).toMatch(/e\.employee_code/);
  });

  it('★★ والمحفّز يملأ created_by ويُجمّده', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_employee_contract_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.created_by := COALESCE\(auth\.uid\(\)/);
    // ★ المسافتان في المايجريشن للمحاذاة — `{2}` بدل تكرارهما (no-regex-spaces)
    expect(b).toMatch(/NEW\.created_by {2}:= OLD\.created_by/);
    expect(b).toMatch(/NEW\.employee_id := OLD\.employee_id/);
  });

  it('★ ويُطبّع رقم العقد', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_employee_contract_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.contract_number := NULLIF\(btrim/);
    expect(MIG_CODE).toMatch(/employee_contracts_number_chk/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ المفردات والترتيب والحدود', () => {
  it.each(TYPES)('النوع %s في الخدمة', (t) => {
    expect(SVC_CODE, `${t} غائب`).toContain(`'${t}'`);
  });

  it.each(STATES)('الحالة %s في الخدمة', (s) => {
    expect(SVC_CODE, `${s} غائبة`).toContain(`'${s}'`);
  });

  it('★ والصفحة تشتقّ القوائم من المصدر', () => {
    expect(PAGE_CODE).toMatch(/CONTRACT_TYPES\.map/);
    expect(PAGE_CODE).toMatch(/CONTRACT_STATES\.map/);
    // العطل: خريطتان يدويّتان في أعلى الصفحة
    expect(PAGE_CODE, 'خريطة يدوية عادت').not.toMatch(/const contractTypeLabels/);
    expect(PAGE_CODE, 'خريطة يدوية عادت').not.toMatch(/const statusLabels/);
  });

  it('★★★ ORDER BY حتميّ بثلاثة مفاتيح (درس 0357)', () => {
    expect(fnBody('contract_board'))
      .toMatch(/ORDER BY \(c\.status = 'active'\) DESC,\s*\n?\s*c\.end_date ASC NULLS LAST, c\.id DESC/);
  });

  it('★ والحدّ الأعلى محصور', () => {
    expect(fnBody('contract_board'))
      .toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 200\), 1\), 500\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العزل والحرّاس', () => {
  it('لا سياسة PERMISSIVE جديدة على hybrid_gate (درس 0355)', () => {
    expect(MIG_STMT).not.toMatch(/CREATE POLICY hybrid_gate_employee_contracts/);
  });

  it.each(NEW_FNS)('%s تُرشِّح المستأجر', (fn) => {
    expect(fnBody(fn)).toMatch(/current_user_tenant_id\(\)/);
  });

  it.each(['contract_expire_due', 'contract_summary', 'contract_upsert',
           'contract_renew', 'contract_terminate'])('%s تحرس الدور', (fn) => {
    expect(fnBody(fn)).toMatch(/current_user_is_staff\(\)/);
  });

  it('★ واللوح يُضيّق على الموظف بدل حجبه', () => {
    const b = fnBody('contract_board');
    expect(b).toMatch(/v_staff OR c\.employee_id = v_me/);
    expect(b).not.toMatch(/RAISE EXCEPTION 'غير مصرَّح بلوح/);
  });

  it('★★ والكتابة تحتاج auth.uid() صريحاً', () => {
    for (const fn of ['contract_upsert', 'contract_renew', 'contract_terminate']) {
      expect(fnBody(fn), `${fn} بلا حارس auth`).toMatch(/auth\.uid\(\) IS NULL/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ نظافة الطبقة والصفحة', () => {
  it('الخدمة مُصدَّرة من index', () => {
    expect(INDEX).toMatch(/contractSdk/);
    expect(INDEX).toMatch(/from '\.\/EmployeeContractService'/);
  });

  it('الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★★★ ولا any في الطبقة ولا في الصفحة (كان any[] في الصفحة)', () => {
    for (const [name, code] of [['الخدمة', SVC_CODE], ['الصفحة', PAGE_CODE]] as const) {
      expect(code, `as any في ${name}`).not.toMatch(/\bas any\b/);
      expect(code, `: any في ${name}`).not.toMatch(/:\s*any\b/);
      expect(code, `any[] في ${name}`).not.toMatch(/any\[\]/);
    }
  });

  it('★ numOrNull يحفظ التمييز بين صفر وغير مُقاس (درس 0353)', () => {
    expect(SVC_CODE).toMatch(/const numOrNull/);
    expect(SVC_CODE).toMatch(/daysLeft:\s*numOrNull/);
    expect(SVC_CODE).toMatch(/salaryAmount:\s*numOrNull/);
    expect(PAGE_CODE).toMatch(/c\.daysLeft != null/);
  });

  it('★ أزرار العمل مُعطَّلة أثناء التنفيذ', () => {
    expect(PAGE_CODE).toMatch(/disabled=\{busyId === 'expire'/);
    expect(PAGE_CODE).toMatch(/setSaving\(true\)/);
    expect(PAGE_CODE).toMatch(/if \(!saving\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ أدوات التحقّق موجودة ومربوطة', () => {
  it.each([
    'tools/dev/verify-employee-contracts-0364.sql',
    'tools/dev/verify-employee-contracts-0364-rls.sh',
    'tools/dev/_invert_0364.py',
  ])('%s موجود', (p) => {
    expect(existsSync(resolve(root, p))).toBe(true);
  });

  it('★ سكربت العكس يشير إلى مايجريشن 0364 نفسه', () => {
    const inv = read('tools/dev/_invert_0364.py');
    expect(inv).toContain('0364_employee_contracts_integrity.sql');
    expect(inv).toContain('verify-employee-contracts-0364.sql');
    expect(inv).toContain('verify-employee-contracts-0364-rls.sh');
  });

  it('★★ والمسبار حُذف قبل الكوميت', () => {
    expect(existsSync(resolve(root, 'tools/dev/_probe_0364.sql'))).toBe(false);
  });
});
