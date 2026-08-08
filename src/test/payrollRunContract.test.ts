/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0348 — نظام الرواتب
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج (درس 0344): لا نقارن الدالة بنفسها. الأعطال ①②③ تعارضٌ
 *   بين ما تكتبه الشيفرة وما يُصرّح به المخطط — فالحارس مقارنة
 *   مصدرين مستقلّين.
 *
 *   السلوك مُختبَر على Postgres في `tools/dev/verify-payroll-run-0348.sql`
 *   (73 تأكيداً) وعبر RLS في `-rls.sh`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0348_payroll_run_integrity.sql');
const S0003   = read('supabase/migrations/0003_hr_platform_modules.sql');
const S0006   = read('supabase/migrations/0006_hr_expansion.sql');
const SERVICE = read('src/services/sdk/PayrollRunService.ts');
const PAGE    = read('src/pages/hr/PayrollPage.tsx');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* base_salary */ const x=1;')).not.toMatch(/base_salary/);
    expect(codeTs('const y = e.base_salary;')).toMatch(/base_salary/);
  });
  it('stmtSql', () => {
    expect(stmtSql("COMMENT ON X IS 'base_salary خطأ';")).not.toMatch(/base_salary/);
    expect(stmtSql('SELECT c.salary_amount FROM x;')).toMatch(/salary_amount/);
  });
});

const MIG_CODE  = codeSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

// ═══════════════════════════════════════════════════════════════════
describe('0348 — العطل ①: أعمدة الفترة الناقصة', () => {
  /**
   * ★★★ التعريف الأصلي يُستخرَج من المخطط — مصدر مستقلّ.
   */
  it('★★★ payroll_periods الأصلي لا يحوي frequency/payment_date', () => {
    const m = S0003.match(/CREATE TABLE IF NOT EXISTS payroll_periods\s*\(([\s\S]*?)\n\);/);
    expect(m, 'تعريف payroll_periods غير موجود في 0003').toBeTruthy();
    expect(m![1].includes('frequency')).toBe(false);
    expect(m![1].includes('payment_date')).toBe(false);
    expect(m![1].includes('updated_at')).toBe(false);
  });

  it('★★★ و0348 يُضيفها', () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS frequency\s+TEXT/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS payment_date DATE/);
  });

  /**
   * ★★★ العطل ⑨: المحفّز يُسند updated_at والعمود غير موجود.
   */
  it('★★★★ عمود updated_at أُضيف (المحفّز يُسنده)', () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  });

  it('★★ وأعمدة أثر التدقيق', () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS approved_by\s+UUID REFERENCES public\.profiles\(id\)/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS approved_at\s+TIMESTAMPTZ/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS locked_at\s+TIMESTAMPTZ/);
  });

  it('★★ والصفحة ما زالت ترسل frequency (فالعمود لازم)', () => {
    expect(PAGE_CODE).toMatch(/frequency:/);
    expect(PAGE_CODE).toMatch(/payment_date:/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0348 — العطل ②: كشف رواتب بأصفار', () => {
  /**
   * ★★★ الراتب ليس في employees — نُثبته من المخطط.
   */
  it('★★★ employees لا يحوي base_salary ولا salary', () => {
    const core = read('supabase/migrations/0001_core_schema.sql');
    const m = core.match(/CREATE TABLE IF NOT EXISTS (?:public\.)?employees\s*\(([\s\S]*?)\n\);/);
    expect(m, 'تعريف employees غير موجود').toBeTruthy();
    expect(/^\s*base_salary\s+/m.test(m![1])).toBe(false);
    expect(/^\s*salary\s+/m.test(m![1])).toBe(false);
  });

  it('★★★ والراتب في العقد والملف والافتراضي', () => {
    // ★ employee_contracts يُعرَّف في 0017 لا 0006 — تحقّقتُ بالبحث
    //   بدل الافتراض حين سقط التأكيد.
    const S0017 = read('supabase/migrations/0017_hr_maturity_contracts_succession.sql');
    expect(S0017).toMatch(/salary_amount\s+NUMERIC/);
    // payroll_settings.default_basic_salary في 0006
    expect(S0006).toMatch(/default_basic_salary NUMERIC\(12,2\)/);
  });

  it('★★★ والصفحة لم تعد تقرأ emp.base_salary', () => {
    expect(PAGE_CODE).not.toMatch(/base_salary/);
    expect(PAGE_CODE).not.toMatch(/emp\.salary/);
  });

  it('★★★ والدالة تشتقّ بأولوية: عقد ← ملف ← افتراضي', () => {
    const b = fnBody('employee_monthly_salary');
    const contract = b.indexOf('employee_contracts');
    const profile  = b.indexOf('pr.salary');
    const fallback = b.indexOf('default_basic_salary');
    expect(contract).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(contract);
    expect(fallback).toBeGreaterThan(profile);
  });

  it('★★★ والعقد يُقيَّد بالتاريخ والحالة', () => {
    const b = fnBody('employee_monthly_salary');
    expect(b).toMatch(/c\.start_date <= v_day/);
    expect(b).toMatch(/c\.end_date IS NULL OR c\.end_date >= v_day/);
    expect(b).toMatch(/COALESCE\(c\.status,'active'\) IN/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0348 — العطل ③: لا غياب لأحد أبداً', () => {
  const b = fnBody('payroll_run');

  it('★★★ الحضور من attendance_summary لا أرقام يدوية', () => {
    expect(b).toMatch(/FROM public\.attendance_summary a/);
    expect(b).toMatch(/attendance_status_bucket\(a\.status\) = 'absent'/);
    expect(b).toMatch(/attendance_status_bucket\(a\.status\) = 'present'/);
  });

  it('★★★ ومقيّد بنطاق الفترة', () => {
    expect(b).toMatch(/a\.shift_date >= v_start/);
    expect(b).toMatch(/a\.shift_date <= v_end/);
  });

  it('★★ وأيام العمل من الإعدادات', () => {
    expect(b).toMatch(/COALESCE\(s\.working_days_per_month, 26\)/);
  });

  it('★★★ والصفحة لم تعد تكتب 26 يدوياً', () => {
    expect(PAGE_CODE).not.toMatch(/working_days:\s*26/);
    expect(PAGE_CODE).not.toMatch(/present_days:\s*26/);
    expect(PAGE_CODE).not.toMatch(/absent_days:\s*0/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0348 — العطل ④⑤: الإعدادات والقروض', () => {
  const b = fnBody('payroll_run');

  it('★★★ الضريبة والضمان من الإعدادات', () => {
    expect(b).toMatch(/e\.basic \* v_tax \/ 100\.0/);
    expect(b).toMatch(/e\.basic \* v_ss\s+\/ 100\.0/);
  });

  it('★★★ والأوفرتايم بمعدّله', () => {
    expect(b).toMatch(/\* v_otr/);
    expect(b).toMatch(/NULLIF\(v_wdays \* 8, 0\)/);
  });

  it('★★ وخصم الغياب', () => {
    expect(b).toMatch(/COALESCE\(a\.absent, 0\) \* v_pen/);
  });

  it('★★★ وأقساط القروض تُخصم', () => {
    expect(b).toMatch(/FROM public\.employee_loans l/);
    expect(b).toMatch(/monthly_installment/);
  });

  it('★★★★ والقصّ **لكل قرض على حدة** لا بالمجموع', () => {
    // عيب اكتشفته جولة العكس: جمعُ الأقساط قبل LEAST يجعل فائض
    // المتبقّي في قرضٍ يُعوّض عجز قرضٍ آخر
    expect(b).toMatch(/SUM\(LEAST\(\s*\n\s*COALESCE\(l\.monthly_installment, 0\),\s*\n\s*COALESCE\(l\.remaining_amount, 0\)\s*\n\s*\)\)/);
    expect(b).not.toMatch(/LEAST\(\s*\n\s*COALESCE\(sum\(l\.monthly_installment\)/);
  });

  it('★★ والقرض المُسدَّد وغير المعتمَد مُقصيان', () => {
    expect(b).toMatch(/l\.status = 'approved'/);
    expect(b).toMatch(/COALESCE\(l\.remaining_amount, 0\) > 0/);
  });

  it('★★★ والخصم لا يتجاوز المستحقّ (لا صافي سالب)', () => {
    expect(b).toMatch(/LEAST\(f\.deduct_raw, f\.basic \+ f\.ot_pay\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0348 — العطل ⑥⑦: القيود والحراسة', () => {
  it('★★★ قيد فريد يمنع التضاعف', () => {
    expect(MIG).toMatch(/ADD CONSTRAINT payroll_records_unique_run\s*\n\s*UNIQUE \(period_id, employee_id\)/);
  });

  it('★★★ وON CONFLICT يُحدّث لا يُكرّر', () => {
    expect(fnBody('payroll_run')).toMatch(/ON CONFLICT \(period_id, employee_id\) DO UPDATE/);
  });

  it('★★ ولا يكتب فوق سجلّ معتمَد', () => {
    expect(fnBody('payroll_run')).toMatch(/WHERE public\.payroll_records\.status NOT IN \('approved','paid'\)/);
  });

  it('★★★ قيد معادلة الصافي', () => {
    expect(MIG).toMatch(/round\(net_salary, 2\) = round\(\s*\n\s*basic_salary \+ total_allowances \+ overtime_pay/);
  });

  it('★★★ وقيد عدم السالب', () => {
    expect(MIG).toMatch(/CHECK \(net_salary >= 0\)/);
  });

  it('★★★ وقيد حالة الفترة', () => {
    expect(MIG).toMatch(/CHECK \(status IN \('draft','pending_approval','approved','paid','cancelled'\)\)/);
  });

  it('★★★ التشغيل يرفض فترة معتمَدة', () => {
    expect(fnBody('payroll_run')).toMatch(/IF v_status IN \('approved','paid','cancelled'\) THEN/);
  });

  it('★★★ والاعتماد يشترط pending_approval', () => {
    expect(fnBody('payroll_approve')).toMatch(/IF v_status <> 'pending_approval' THEN/);
  });

  it('★★★ ويُسجّل من وافق ومتى', () => {
    expect(fnBody('payroll_approve')).toMatch(/approved_by = v_uid/);
    expect(fnBody('payroll_approve')).toMatch(/approved_at = NOW\(\), locked_at = NOW\(\)/);
  });

  it('★★ ويرفض فترة بلا سجلّات', () => {
    expect(fnBody('payroll_approve')).toMatch(/IF v_n = 0 THEN/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0348 — الصفحة', () => {
  it('★★★ تمرّ عبر payrollRunService', () => {
    expect(PAGE_CODE).toMatch(/payrollRunService\.run\(/);
    expect(PAGE_CODE).toMatch(/payrollRunService\.approve\(/);
    expect(PAGE_CODE).toMatch(/payrollRunService\.summary\(/);
  });

  it('★★★ ولم تعد تبني السجلّات في المتصفح', () => {
    expect(PAGE_CODE).not.toMatch(/recordsToInsert/);
    expect(PAGE_CODE).not.toMatch(/upsertRecords/);
    expect(PAGE_CODE).not.toMatch(/updateStatusByPeriod/);
  });

  it('★★★ ولا تستدعي updatePeriodStatus مباشرةً للاعتماد', () => {
    expect(PAGE_CODE).not.toMatch(/updatePeriodStatus\([^)]*'approved'/);
  });

  it('★★ والملخّص من القاعدة لا من reduce', () => {
    expect(PAGE_CODE).toMatch(/summary\?\.net/);
    expect(PAGE_CODE).toMatch(/summary\?\.deductions/);
    expect(PAGE_CODE).not.toMatch(/records\.reduce\(/);
  });

  it('★ لا confirm/alert/prompt · ولا لمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\.from\('[a-z_]+'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0348 — الأمان', () => {
  it('★★★ التشغيل والاعتماد DEFINER ويفحصان الدور', () => {
    const run = fnBody('payroll_run');
    const app = fnBody('payroll_approve');
    expect(run).toMatch(/SECURITY DEFINER/);
    expect(app).toMatch(/SECURITY DEFINER/);
    expect(run).toMatch(/NOT IN \('admin','hr','developer','it_admin'\)/);
    // ★ الاعتماد أضيق
    expect(app).toMatch(/NOT IN \('admin','hr'\)/);
  });

  it('★★★ ويفحصان المستأجر', () => {
    expect(fnBody('payroll_run')).toMatch(/p\.tenant_id = v_tenant/);
    expect(fnBody('payroll_approve')).toMatch(/p\.tenant_id = v_tenant/);
  });

  it('★★★ والملخّص INVOKER — RLS يحرسه', () => {
    expect(fnBody('payroll_period_summary')).toMatch(/SECURITY INVOKER/);
  });

  it.each([
    'payroll_run(UUID)',
    'payroll_approve(UUID)',
    'payroll_period_summary(UUID)',
    'employee_monthly_salary(UUID,DATE)',
  ])('★★ anon محروم من %s', (sig) => {
    expect(MIG).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM anon;`);
  });

  it('★★ search_path مثبَّت على الأربع', () => {
    expect((MIG_CODE.match(/SET search_path = public/g) || []).length).toBe(4);
  });

  it('★★ والخدمة ترمي عند الفشل لا تبتلعه', () => {
    expect(SVC_CODE).toMatch(/throw SdkError\.fromSupabaseError\(error\)/);
  });

  it('★ الفهارس الأربعة', () => {
    for (const ix of [
      'idx_payroll_records_tenant_period',
      'idx_payroll_periods_tenant_status',
      'idx_emp_contracts_emp_dates',
      'idx_emp_loans_tenant_status',
    ]) {
      expect(MIG).toContain(ix);
    }
  });
});
