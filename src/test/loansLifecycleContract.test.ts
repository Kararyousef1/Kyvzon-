/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0355 — دورة حياة السلف والقروض
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-loans-lifecycle-0355.sql`
 *   · العزل مُثبَت في `…-0355-rls.sh` بدور `authenticated` حقيقيّ
 *   · التغطية مُثبتة في `_invert_0355.py` — **37/37** عكساً أسقط
 *     الاختبار (+ تكافؤان مُثبتان)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية** إلى الشيفرة:
 *   مفردةٌ مختلَقة · حساب تاريخ في المتصفّح · UPDATE مباشر على
 *   الحالة · قسمة بلا حارس · Supabase من الصفحة.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0355_employee_loans_lifecycle.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/LoanService.ts');
const PAGE    = read('src/pages/hr/LoansPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

/** يُسقط تعليقات TS — التوثيق يذكر الأعطال بأسمائها فلا يُخلط بالشيفرة */
const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** يُسقط تعليقات SQL */
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
/** يُسقط التعليقات **والسلاسل النصّية** — للحرّاس التي تخصّ الشيفرة وحدها */
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة: مُجرِّدٌ معطوب = حارسٌ كاذب ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs("/* status === 'active' */ const x=1;")).not.toMatch(/active/);
    expect(codeTs("// l.status === 'active'\nconst y=1;")).not.toMatch(/active/);
    expect(codeTs("const s = l.status === 'active';")).toMatch(/active/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'setMonth مذكور';")).not.toMatch(/setMonth/);
    expect(stmtSql("  AND l.status = 'approved'")).toMatch(/l\.status/);
    expect(stmtSql("SELECT 'it''s ok' AS x;")).not.toMatch(/ok/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/**
 * ★ عيبٌ في حارسي كشفه التشغيل: `fnBody` كان يعمل على `MIG` الخام
 *   فيلتقط التعليقات. التأكيد «لا ON CONFLICT» سقط لأن التعليق
 *   نفسه يقول «لا ON CONFLICT». المُجرَّد هو المرجع.
 */
const fnBody = (name: string): string => {
  const i = MIG_CODE.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في ${MIG_PATH}`).toBeGreaterThan(-1);
  const j = MIG_CODE.indexOf('$$;', i);
  expect(j, `نهاية ${name} غير موجودة`).toBeGreaterThan(i);
  return MIG_CODE.slice(i, j);
};

const NEW_FNS = [
  'loan_apply_repayment', 'loan_create', 'loan_summary',
  'loan_board', 'loan_decide', 'loan_repayment_history',
  'payroll_approve',
];

// ═══════════════════════════════════════════════════════════════
describe('0355 — بنية المايجريشن', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, MIG_PATH))).toBe(true);
  });

  it('جدول loan_repayments يُنشأ', () => {
    expect(MIG_CODE).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.loan_repayments/);
  });

  it('الفهرس الفريد يمنع الخصم المزدوج للفترة الواحدة', () => {
    expect(MIG_CODE).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_repay_per_period/);
    expect(MIG_CODE).toMatch(/\(loan_id, payroll_period_id\)/);
    // ★ جزئيّ: التسديد اليدويّ (period = NULL) قد يتكرّر بمشروعية
    expect(MIG_CODE).toMatch(/WHERE payroll_period_id IS NOT NULL/);
  });

  it('كل دالة جديدة تُسقَط قبل إنشائها (نوع الإرجاع لا يتغيّر بـOR REPLACE)', () => {
    for (const f of NEW_FNS) {
      expect(MIG_CODE, f).toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\(`));
    }
  });

  it('كل دالة SECURITY DEFINER مع search_path مثبَّت', () => {
    for (const f of NEW_FNS) {
      const b = fnBody(f);
      expect(b, `${f}: SECURITY DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(b, `${f}: search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('كل دالة تُنزع من PUBLIC و anon وتُمنح لـauthenticated', () => {
    for (const f of NEW_FNS) {
      expect(MIG_CODE, `${f}: PUBLIC`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*FROM PUBLIC`));
      expect(MIG_CODE, `${f}: anon`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*FROM anon`));
      expect(MIG_CODE, `${f}: authenticated`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*TO authenticated`));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ① — لا مفردة مختلَقة في أي طبقة', () => {
  const FAKE = ['active', 'completed'];

  it('المايجريشن لا يكتب مفردةً مختلَقة في CHECK أو مقارنة', () => {
    // نبحث في الشيفرة (لا التعليقات) عن مقارنة status بالمفردتين
    for (const w of FAKE) {
      expect(MIG_CODE, `status = '${w}'`).not.toMatch(
        new RegExp(`status\\s*=\\s*'${w}'`));
      // ★ تضييق كشفه التشغيل: `s.status IN ('pending','active')` في
      //   loan_decide يخصّ **خطوات الاعتماد** لا حالة السلفة —
      //   و'active' مفردة مشروعة هناك (hr_approval_steps_status_check).
      //   نقصر الحارس على `l.status` و`employee_loans`.
      expect(MIG_CODE, `l.status IN … '${w}'`).not.toMatch(
        new RegExp(`l\\.status\\s+IN\\s*\\([^)]*'${w}'`));
      expect(MIG_CODE, `NEW.status = '${w}'`).not.toMatch(
        new RegExp(`(NEW|OLD|l)\\.status\\s*=\\s*'${w}'`));
    }
  });

  it('حارس loan_board يذكر المفردات الخمس الحقيقية بالضبط', () => {
    const b = fnBody('loan_board');
    const m = b.match(/p_status NOT IN \(([^)]*)\)/);
    expect(m, 'حارس p_status غير موجود').toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(listed.sort()).toEqual(
      ['approved', 'cancelled', 'paid', 'pending', 'rejected']);
  });

  it('الخدمة تُصدّر المفردات الخمس ولا سادسة', () => {
    const m = SVC_CODE.match(/export const LOAN_STATUSES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/['\s]/g, '')).filter(Boolean);
    expect(listed.sort()).toEqual(
      ['approved', 'cancelled', 'paid', 'pending', 'rejected']);
  });

  it('لكل مفردة تسمية عربية ولون — لا undefined في الشارة', () => {
    for (const s of ['pending', 'approved', 'rejected', 'paid', 'cancelled']) {
      expect(SVC_CODE, `LOAN_STATUS_AR.${s}`).toMatch(
        new RegExp(`${s}:\\s*'[^']+'`));
    }
    const tone = SVC_CODE.slice(SVC_CODE.indexOf('LOAN_STATUS_TONE'));
    for (const s of ['pending', 'approved', 'rejected', 'paid', 'cancelled']) {
      expect(tone, `LOAN_STATUS_TONE.${s}`).toMatch(new RegExp(`${s}:`));
    }
  });

  it('★★★ الصفحة لا تُقارن الحالة بمفردة مختلَقة', () => {
    for (const w of FAKE) {
      expect(PAGE_CODE, `status === '${w}'`).not.toMatch(
        new RegExp(`status\\s*===\\s*'${w}'`));
      expect(PAGE_CODE, `'${w}' كحالة`).not.toMatch(
        new RegExp(`status\\s*:\\s*'${w}'`));
    }
  });

  it('«الساري» اشتقاق (approved بمتبقٍّ موجب) لا حالة', () => {
    expect(PAGE_CODE).toMatch(
      /status\s*===\s*'approved'\s*&&\s*\w+\.remaining\s*>\s*0/);
    const s = fnBody('loan_summary');
    expect(s).toMatch(/l\.status = 'approved'[\s\S]{0,120}remaining_amount,0\) > 0/);
  });

  it('الصفحة تشتقّ أزرار الفلترة من LOAN_STATUSES لا من قائمة مكتوبة', () => {
    expect(PAGE_CODE).toMatch(/LOAN_STATUSES\.map/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ② — التسديد موجود ومربوط', () => {
  it('loan_apply_repayment تُنقص المتبقّي وتزيد months_paid', () => {
    const b = fnBody('loan_apply_repayment');
    expect(b).toMatch(/remaining_amount = v_rem - v_pay/);
    expect(b).toMatch(/months_paid\s*=\s*v_no/);
  });

  it('تُغلق السلفة بـpaid عند بلوغ الصفر', () => {
    expect(fnBody('loan_apply_repayment'))
      .toMatch(/v_rem - v_pay <= 0 THEN 'paid'/);
  });

  it('آخر قسط يُقصّ عند المتبقّي — LEAST لا الجمع ثم القصّ (درس 0348)', () => {
    expect(fnBody('loan_apply_repayment')).toMatch(/v_pay := LEAST\(/);
  });

  it('★★ payroll_approve يستدعي التسديد', () => {
    expect(fnBody('payroll_approve'))
      .toMatch(/PERFORM public\.loan_apply_repayment\(v_loan\.id, p_period_id/);
  });

  it('★★ التسديد عند الاعتماد لا عند التشغيل (payroll_run قابل للإعادة)', () => {
    const run = MIG.indexOf('CREATE FUNCTION public.payroll_run');
    expect(run, 'payroll_run لا يُعاد تعريفه هنا — والتسديد ليس فيه').toBe(-1);
  });

  it('التسديد مشروط بأن الموظف مشمول في كشف هذه الفترة', () => {
    expect(fnBody('payroll_approve'))
      .toMatch(/EXISTS \(SELECT 1 FROM public\.payroll_records r/);
  });

  it('لا ON CONFLICT على إدراج التسديد — التكرار يجب أن يرمي', () => {
    const b = fnBody('loan_apply_repayment');
    const ins = b.slice(b.indexOf('INSERT INTO public.loan_repayments'));
    expect(ins.slice(0, 600)).not.toMatch(/ON CONFLICT/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ③ — لا حساب تاريخ في المتصفّح', () => {
  it('setMonth لا يظهر في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE).not.toMatch(/setMonth/);
    expect(PAGE_CODE).not.toMatch(/setMonth/);
  });

  it('end_date تُحسب بشهور تقويمية في القاعدة', () => {
    expect(fnBody('loan_create'))
      .toMatch(/v_start \+ \(p_months \|\| ' months'\)::INTERVAL/);
    expect(fnBody('loan_decide'))
      .toMatch(/months_count,1\) \|\| ' months'\)::INTERVAL/);
  });

  it('★ ولا إضافة أيام بديلاً عن الشهور', () => {
    expect(MIG_STMT).not.toMatch(/p_months \* 31/);
    expect(MIG_STMT).not.toMatch(/months_count \* 30/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ④/⑤ — سلسلة الاعتماد', () => {
  it('loan_create يبني السلسلة', () => {
    expect(fnBody('loan_create'))
      .toMatch(/PERFORM public\.create_financial_request_approval\(/);
  });

  it('loan_decide يفحص الخطوات المفتوحة', () => {
    const b = fnBody('loan_decide');
    expect(b).toMatch(/hr_approval_steps/);
    expect(b).toMatch(/s\.status IN \('pending','active'\)/);
    expect(b).toMatch(/LOAN_CHAIN_OPEN/);
  });

  it('admin وحده يتجاوز سلسلة قائمة', () => {
    expect(fnBody('loan_decide')).toMatch(/v_open > 0 AND v_role <> 'admin'/);
  });

  it('★★ التجاوز يُغلق الخطوات بـskipped — لا خطوة معلَّقة أبداً', () => {
    const b = fnBody('loan_decide');
    expect(b).toMatch(/UPDATE public\.hr_approval_steps s[\s\S]{0,200}status\s*=\s*'skipped'/);
    expect(b).toMatch(/UPDATE public\.hr_approval_requests r/);
  });

  it('★★★ الصفحة لا تستدعي UPDATE على الحالة — القرار عبر loan_decide', () => {
    expect(PAGE_CODE).not.toMatch(/approveLoan|rejectLoan/);
    expect(PAGE_CODE).toMatch(/loanService\.decide\(/);
  });

  it('الصفحة تمنع الضغط حين تكون السلسلة مفتوحة', () => {
    expect(PAGE_CODE).toMatch(/chainOpen\s*>\s*0/);
    expect(PAGE_CODE).toMatch(/disabled=\{[^}]*chainOpen > 0/);
  });

  it('★ لا يُبَتّ مرّتين في السلفة نفسها', () => {
    expect(fnBody('loan_decide')).toMatch(/LOAN_ALREADY_DECIDED/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑥/⑦ — تاريخ البداية والقسمة على صفر', () => {
  it('loan_create يقبل p_start_date ويستعمله', () => {
    expect(MIG_CODE).toMatch(/p_start_date\s+DATE\s+DEFAULT NULL/);
    expect(fnBody('loan_create'))
      .toMatch(/v_start := COALESCE\(p_start_date,/);
  });

  it('اليوم الاحتياطيّ بتوقيت بغداد لا بتوقيت الخادم', () => {
    expect(fnBody('loan_create')).toMatch(/AT TIME ZONE 'Asia\/Baghdad'/);
  });

  it('★ الصفحة تُمرّر startDate — وفيها حقل إدخال له', () => {
    expect(PAGE_CODE).toMatch(/startDate:\s*form\.start_date/);
    expect(PAGE_CODE).toMatch(/type="date"/);
  });

  it('★ اليوم في الصفحة يُحسب بتوقيت بغداد', () => {
    expect(PAGE_CODE).toMatch(/timeZone:\s*'Asia\/Baghdad'/);
  });

  it('حارس عدد الأشهر في القاعدة', () => {
    expect(fnBody('loan_create')).toMatch(/LOAN_BAD_MONTHS/);
    expect(fnBody('loan_create')).toMatch(/p_months < 1 OR p_months > 60/);
  });

  it('حارس المبلغ والقسط', () => {
    expect(fnBody('loan_create')).toMatch(/LOAN_BAD_AMOUNT/);
    expect(fnBody('loan_create')).toMatch(/LOAN_BAD_INSTALLMENT/);
    expect(fnBody('loan_create')).toMatch(/LOAN_NO_PURPOSE/);
  });

  it('★★ الصفحة لا تقسم بلا حارس Number.isFinite', () => {
    // القسمة الوحيدة المسموحة هي داخل useMemo المحروس
    const div = PAGE_CODE.match(/\ba\s*\/\s*m\b/);
    expect(div, 'القسمة المُعاينة غير موجودة').toBeTruthy();
    expect(PAGE_CODE).toMatch(/Number\.isFinite\(a\)/);
    expect(PAGE_CODE).toMatch(/Number\.isInteger\(m\)/);
  });

  it('★ لا تُرسَل قيمة قسط محسوبة في المتصفّح عند الإنشاء', () => {
    const call = PAGE_CODE.slice(PAGE_CODE.indexOf('loanService.create('));
    expect(call.slice(0, 400)).not.toMatch(/installment/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑧ — لا نقل جدول إلى المتصفّح', () => {
  it('loan_board له حدّ أعلى دائماً', () => {
    expect(fnBody('loan_board')).toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 200\), 1\)/);
  });

  it('الصفحة تمرّر حدّاً صريحاً', () => {
    expect(PAGE_CODE).toMatch(/loanService\.board\(null,\s*\d+\)/);
  });

  it('★ الصفحة لا تجلب كل الموظفين لتربطهم في الذاكرة', () => {
    expect(PAGE_CODE).not.toMatch(/new Map<string, EmployeeSummary>/);
    // EmployeePicker وحده يستعمل employeeService (قائمة اختيار)
    const picker = PAGE_CODE.slice(PAGE_CODE.indexOf('export function EmployeePicker'));
    const outside = PAGE_CODE.slice(0, PAGE_CODE.indexOf('export function EmployeePicker'));
    expect(outside).not.toMatch(/employeeService\.findAll/);
    expect(picker).toMatch(/employeeService\.findAll/);
  });

  it('البطاقات محسوبة في القاعدة لا بـreduce في الصفحة', () => {
    expect(PAGE_CODE).toMatch(/loanService\.summary\(\)/);
    expect(PAGE_CODE).not.toMatch(/\.reduce\(\s*\(s,\s*l\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العزل والأدوار — مُعلَنة في كل دالة', () => {
  it('كل دالة تفحص المستأجر', () => {
    for (const f of NEW_FNS) {
      expect(fnBody(f), `${f}: v_tenant`)
        .toMatch(/v_tenant\s+UUID\s*:=\s*public\.current_user_tenant_id\(\)/);
      expect(fnBody(f), `${f}: حارس NULL`).toMatch(/IF v_tenant IS NULL THEN/);
    }
  });

  it('القراءة العامّة محصورة بالطاقم', () => {
    for (const f of ['loan_summary', 'loan_board']) {
      expect(fnBody(f), f).toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
    }
  });

  it('الكتابة محصورة بـadmin و hr', () => {
    for (const f of ['loan_create', 'loan_decide']) {
      expect(fnBody(f), f).toMatch(/v_role NOT IN \('admin','hr'\)/);
    }
  });

  it('كل استعلام على employee_loans يُرشِّح بالمستأجر', () => {
    for (const f of ['loan_apply_repayment', 'loan_decide',
                     'loan_summary', 'loan_board', 'loan_repayment_history']) {
      expect(fnBody(f), `${f}: ترشيح`).toMatch(/tenant_id = v_tenant/);
    }
  });

  it('loan_create يتحقّق أن الموظف من المستأجر نفسه', () => {
    expect(fnBody('loan_create'))
      .toMatch(/FROM public\.employees e[\s\S]{0,120}e\.tenant_id = v_tenant/);
  });

  it('سجلّ سلفة واحدة محروس بالملكية', () => {
    expect(fnBody('loan_repayment_history'))
      .toMatch(/NOT public\.current_user_is_staff\(\)[\s\S]{0,120}v_emp <> v_owner/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ loan_repayments — RLS والصلاحيات', () => {
  it('RLS مفعّلة', () => {
    expect(MIG_CODE).toMatch(
      /ALTER TABLE public\.loan_repayments ENABLE ROW LEVEL SECURITY/);
  });

  it('سياسة SELECT تُرشِّح بالمستأجر وبالملكية', () => {
    expect(MIG_CODE).toMatch(/kyvzon_loan_repayments_select[\s\S]{0,300}FOR SELECT/);
    const pol = MIG_CODE.slice(MIG_CODE.indexOf('CREATE POLICY kyvzon_loan_repayments_select'));
    expect(pol.slice(0, 400)).toMatch(/tenant_id = public\.current_user_tenant_id\(\)/);
    expect(pol.slice(0, 400)).toMatch(/employee_id = public\.current_user_employee_id\(\)/);
  });

  it('★★★ بوابة الوحدة RESTRICTIVE — PERMISSIVE تُدمَج بـOR فتُلغي العزل', () => {
    const pol = MIG_CODE.slice(MIG_CODE.indexOf('CREATE POLICY hybrid_gate_loan_repayments'));
    expect(pol.slice(0, 300)).toMatch(/AS RESTRICTIVE FOR ALL TO authenticated/);
  });

  it('لا سياسة INSERT/UPDATE/DELETE — الكتابة عبر SECURITY DEFINER وحدها', () => {
    expect(MIG_CODE).not.toMatch(/CREATE POLICY \w*loan_repayments\w* ON[\s\S]{0,80}FOR (INSERT|UPDATE|DELETE)/);
  });

  it('★★★ REVOKE من authenticated قبل GRANT — 0268 يمنح كل شيء ضمنياً', () => {
    const rev = MIG_CODE.indexOf('REVOKE ALL ON public.loan_repayments FROM authenticated');
    const grant = MIG_CODE.indexOf('GRANT SELECT ON public.loan_repayments TO authenticated');
    expect(rev, 'REVOKE من authenticated غير موجود').toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(rev);
  });

  it('anon محروم', () => {
    expect(MIG_CODE).toMatch(/REVOKE ALL ON public\.loan_repayments FROM anon/);
  });

  it('الحذف النهائي ممنوع بمحفّز', () => {
    expect(MIG_CODE).toMatch(/CREATE TRIGGER trg_block_loan_repayment_delete/);
    expect(MIG_CODE).toMatch(/BEFORE DELETE ON public\.loan_repayments/);
    expect(MIG_CODE).toMatch(/LOAN_REPAYMENT_IMMUTABLE/);
  });

  it('قيود السلامة على الصفّ', () => {
    for (const c of ['loan_repayments_amount_pos', 'loan_repayments_inst_pos',
                     'loan_repayments_remain_nonneg', 'loan_repayments_source_chk']) {
      expect(MIG_CODE, c).toMatch(new RegExp(c));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ سياسة المنصة — محظورات', () => {
  it('لا confirm/prompt/alert في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
  });

  it('لا as any في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
  });

  it('★★ الصفحة لا تلمس Supabase مباشرةً', () => {
    expect(PAGE_CODE).not.toMatch(/from ['"].*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('لا حذف نهائي — الإلغاء بحالة cancelled', () => {
    expect(SVC_CODE).not.toMatch(/\.delete\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\(/);
    expect(SVC_CODE).toMatch(/'cancelled'/);
  });

  it('سبب الرفض/الإلغاء إلزاميّ في الطبقتين', () => {
    expect(fnBody('loan_decide')).toMatch(/LOAN_NO_REASON/);
    expect(PAGE_CODE).toMatch(/reason\.trim\(\) === ''/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ التسجيل والترابط', () => {
  it('الخدمة مُصدَّرة من فهرس SDK', () => {
    expect(INDEX).toMatch(/export \{[^}]*loanService[^}]*\} from '\.\/LoanService'/);
    expect(INDEX).toMatch(/LOAN_STATUSES/);
  });

  it('الصفحة تستورد من الفهرس لا من الملف مباشرةً', () => {
    expect(PAGE_CODE).toMatch(/from '\.\.\/\.\.\/services\/sdk'/);
    expect(PAGE_CODE).not.toMatch(/from '.*sdk\/LoanService'/);
  });

  it('★★ المكوّنات المشتركة الخمسة تبقى مُصدَّرة — تسع صفحات تستوردها', () => {
    for (const c of ['Modal', 'FormField', 'ModalActions',
                     'EmployeePicker', 'DetailRow']) {
      expect(PAGE_CODE, c).toMatch(new RegExp(`export function ${c}\\b`));
    }
  });

  it('★ ولا مستورِد فقد مكوّناً', () => {
    const pagesDir = resolve(root, 'src/pages');
    const wanted = new Set<string>();
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = resolve(d, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.tsx')) continue;
        if (p.endsWith('hr/LoansPage.tsx')) continue;
        const src = readFileSync(p, 'utf8');
        const m = src.match(/import \{([^}]+)\} from ['"][^'"]*LoansPage['"]/);
        if (m) m[1].split(',').forEach((x) => wanted.add(x.trim()));
      }
    };
    walk(pagesDir);
    expect(wanted.size, 'لا مستورِد — الحارس بلا معنى').toBeGreaterThan(0);
    for (const c of wanted) {
      expect(PAGE_CODE, `${c} مطلوب من صفحة أخرى`)
        .toMatch(new RegExp(`export function ${c}\\b`));
    }
  });

  it('أدوات التحقق الثلاث موجودة', () => {
    for (const p of [
      'tools/dev/verify-loans-lifecycle-0355.sql',
      'tools/dev/verify-loans-lifecycle-0355-rls.sh',
      'tools/dev/_invert_0355.py',
    ]) {
      expect(existsSync(resolve(root, p)), p).toBe(true);
    }
  });
});
