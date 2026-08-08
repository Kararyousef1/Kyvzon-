/**
 * ════════════════════════════════════════════════════════════════
 *  financialApprovalContract.test.ts
 *
 *  عقد سلسلة اعتماد الطلبات المالية للموظف (migration 0325).
 *
 *  ★ فحص ثابت على النص — لا يُثبت السلوك. الإثبات السلوكي في
 *    tools/dev/verify-financial-approvals-0325.sql (46 تأكيداً على
 *    Postgres محلي). هذه الاختبارات تمنع **الانحدار** بالحذف السهو.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0325 = read('supabase/migrations/0325_financial_request_approvals.sql');
const VERIFY = read('tools/dev/verify-financial-approvals-0325.sql');
const SVC = read('src/services/sdk/FinancialRequestService.ts');
const FIN = read('src/services/sdk/FinanceService.ts');
const EXP_HR = read('src/pages/hr/ExpensesPage.tsx');
const LOAN_HR = read('src/pages/hr/LoansPage.tsx');
const EXP_EMP = read('src/pages/employee/MyExpensesPage.tsx');
const LOAN_EMP = read('src/pages/employee/MyLoansPage.tsx');
const SDK_INDEX = read('src/services/sdk/index.ts');

/** يُجرّد التعليقات — الفحص على الكود المُنفَّذ لا على شرحه */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0325 — بنية سلسلة الاعتماد المالية', () => {
  it('create_financial_request_approval تُنشأ بـDROP صريح وVOLATILE', () => {
    expect(M0325).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_financial_request_approval\(TEXT, UUID, UUID, NUMERIC\);/,
    );
    const s = M0325.indexOf('CREATE FUNCTION public.create_financial_request_approval');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.create_financial_request_approval');
    expect(M0325.slice(s, e)).toMatch(/\bVOLATILE\b/);
  });

  it('★ تمرّر المبلغ لسلسلة القواعد (جوهر تدرّج min/max)', () => {
    const s = M0325.indexOf('CREATE FUNCTION public.create_financial_request_approval');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.create_financial_request_approval');
    const body = M0325.slice(s, e);
    expect(body).toMatch(/resolve_approval_chain\('finance', v_dept, COALESCE\(p_amount,0\)\)/);
  });

  it('سلسلة القسم احتياطي عند غياب القواعد', () => {
    const s = M0325.indexOf('CREATE FUNCTION public.create_financial_request_approval');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.create_financial_request_approval');
    const body = M0325.slice(s, e);
    expect(body).toMatch(/resolve_department_chain\(v_dept\)/);
    expect(body).toMatch(/'supervisor','manager','direct_manager'/);
  });

  it('★ لا اعتماد تلقائي بلا معتمِد — هذا مالٌ يُصرَف', () => {
    const s = M0325.indexOf('CREATE FUNCTION public.create_financial_request_approval');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.create_financial_request_approval');
    const body = codeOnly(M0325.slice(s, e));
    // نظير HR يعتمد تلقائياً عند v_order=0؛ هنا ممنوع
    expect(body).not.toMatch(/SET status\s*=\s*'approved'/);
  });

  it('مستوى بلا شاغل يُتخطّى (وإلا تجمّد الطلب أبداً)', () => {
    const s = M0325.indexOf('CREATE FUNCTION public.create_financial_request_approval');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.create_financial_request_approval');
    expect(M0325.slice(s, e)).toMatch(/IF v_rule\.out_approver_id IS NULL THEN CONTINUE;/);
  });

  it('★ قيد request_type يقبل expense و loan', () => {
    expect(M0325).toMatch(/CHECK \(request_type IN \('leave','permission','expense','loan'\)\)/);
  });

  it('عمود amount مُضاف للطلب', () => {
    expect(M0325).toMatch(/ADD COLUMN IF NOT EXISTS amount NUMERIC/);
  });
});

describe('0325 — توحيد مفردات الحالة', () => {
  it('★ القيم العربية تُرحَّل للإنجليزية قبل فرض القيد', () => {
    expect(M0325).toMatch(/UPDATE public\.expense_requests[\s\S]{0,400}'approved'/);
    expect(M0325).toMatch(/UPDATE public\.employee_loans[\s\S]{0,400}'approved'/);
  });

  it('قيدا CHECK يمنعان عودة التعارض', () => {
    expect(M0325).toMatch(/expense_requests_status_chk/);
    expect(M0325).toMatch(/employee_loans_status_chk/);
    expect(M0325).toMatch(
      /CHECK \(status IN \('pending','approved','rejected','paid','cancelled'\)\)/,
    );
  });
});

describe('0325 — المزامنة والحارس', () => {
  const body = (() => {
    const s = M0325.indexOf('CREATE FUNCTION public.sync_hr_source_status');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.sync_hr_source_status');
    return M0325.slice(s, e);
  })();

  it('★ الإجازات تبقى بالعربية والمالية بالإنجليزية', () => {
    expect(body).toMatch(/UPDATE public\.leaves SET status = v_label/);
    expect(body).toMatch(/UPDATE public\.expense_requests[\s\S]{0,200}status\s*=\s*p_final/);
  });

  it('★ end_date و remaining_amount تُحسبان للسلفة (عطل ⑥)', () => {
    expect(body).toMatch(/end_date\s*=\s*CASE/);
    expect(body).toMatch(/months_count[\s\S]{0,60}months'\)::INTERVAL/);
    expect(body).toMatch(/remaining_amount\s*=\s*CASE[\s\S]{0,80}THEN amount/);
  });

  it('approved_at يُضبَط للمصروف (لا reviewed_at غير الموجود)', () => {
    expect(body).toMatch(/approved_at\s*=\s*CASE/);
    expect(codeOnly(body)).not.toMatch(/reviewed_at/);
  });

  it('علَم المزامنة يُرفع ويُخفض محلّياً للمعاملة', () => {
    expect(body).toMatch(/set_config\('kyvzon\.approval_sync', 'true', TRUE\)/);
    expect(body).toMatch(/set_config\('kyvzon\.approval_sync', 'false', TRUE\)/);
  });

  it('★ حارس التجاوز مُعلَّق على الجدولين الماليين', () => {
    expect(M0325).toMatch(/BEFORE UPDATE OF status ON public\.expense_requests/);
    expect(M0325).toMatch(/BEFORE UPDATE OF status ON public\.employee_loans/);
  });
});

describe('0325 — الرفض يُنهي السلسلة (عطل ⑧ السابق)', () => {
  const body = (() => {
    const s = M0325.indexOf('CREATE OR REPLACE FUNCTION public.decide_hr_approval_step');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.decide_hr_approval_step');
    return M0325.slice(s, e);
  })();

  it('★ الرفض يتخطّى كل خطوة لم تُبتّ', () => {
    expect(body).toMatch(/SET status = 'skipped'/);
    expect(body).toMatch(/AND status IN \('pending','active'\)/);
  });

  it('يبقى فحص ملكية الخطوة', () => {
    expect(body).toMatch(/not authorized for this step/);
  });
});

describe('0325 — العرض والصندوق', () => {
  it('★ unified_approvals فيه فرع employee_finance بالمبلغ', () => {
    expect(M0325).toMatch(/'employee_finance'::TEXT/);
    const s = M0325.indexOf("SELECT 'employee_finance'::TEXT");
    expect(M0325.slice(s, s + 500)).toMatch(/r\.amount/);
  });

  it('العرض محجوب عن anon وممنوح لـauthenticated', () => {
    expect(M0325).toMatch(/REVOKE ALL ON public\.unified_approvals FROM anon/);
    expect(M0325).toMatch(/GRANT SELECT ON public\.unified_approvals TO authenticated/);
  });

  it('★ my_approval_inbox تشتقّ الوحدة من request_type (عطل ⑦)', () => {
    const s = M0325.indexOf('CREATE FUNCTION public.my_approval_inbox');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.my_approval_inbox');
    const body = M0325.slice(s, e);
    expect(body).toMatch(/CASE WHEN r\.request_type IN \('expense','loan'\)/);
    expect(body).toMatch(/JOIN public\.hr_approval_requests r ON r\.id = s\.request_id/);
  });

  it('★ المحفّز يشتقّ الوحدة كذلك', () => {
    const s = M0325.indexOf('CREATE OR REPLACE FUNCTION public.tg_notify_approval_step');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.tg_notify_approval_step');
    const body = M0325.slice(s, e);
    expect(body).toMatch(/'employee_finance' ELSE 'hr' END/);
    expect(body).toMatch(/v_module IN \('hr','employee_finance'\)/);
  });

  it('unified_approval_decide يُفوّض employee_finance لسلسلة HR', () => {
    const s = M0325.indexOf('CREATE OR REPLACE FUNCTION public.unified_approval_decide');
    const e = M0325.indexOf('COMMENT ON FUNCTION public.unified_approval_decide');
    expect(M0325.slice(s, e)).toMatch(
      /p_source_module IN \('hr','employee_finance'\)[\s\S]{0,300}decide_hr_approval_step/,
    );
  });
});

describe('0325 — الصلاحيات', () => {
  it.each([
    'create_financial_request_approval(TEXT,UUID,UUID,NUMERIC)',
    'record_financial_rejection_reason(UUID, TEXT)',
    'my_approval_inbox(TEXT)',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M0325).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M0325).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });
});

describe('0325 — طبقة SDK', () => {
  it('FinancialRequestService يمرّ عبر RPC لا Supabase مباشرة', () => {
    expect(SVC).toMatch(/rpc\('create_financial_request_approval'/);
    expect(SVC).toMatch(/rpc\('unified_approval_decide'/);
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it("★ يستعمل الوحدة employee_finance", () => {
    expect(SVC).toMatch(/p_source_module: 'employee_finance'/);
  });

  it('★ سبب الرفض يذهب لدالته لا لعمود UUID', () => {
    expect(SVC).toMatch(/rpc\(\s*'record_financial_rejection_reason'/);
  });

  it('القرار لا يُبتلع صامتاً', () => {
    const s = SVC.indexOf('async decide(');
    expect(SVC.slice(s, s + 900)).toMatch(/throw new Error\(error\.message\)/);
  });

  it('مُسجَّل في فهرس SDK', () => {
    expect(SDK_INDEX).toMatch(/export \{ financialRequestService \} from '\.\/FinancialRequestService'/);
  });
});

describe('0325 — إصلاح FinanceService المعطوب', () => {
  const code = codeOnly(FIN);

  it("★ approveExpense يكتب 'approved' لا 'موافق'", () => {
    const s = code.indexOf('async approveExpense');
    const body = code.slice(s, s + 400);
    expect(body).toMatch(/status: 'approved'/);
    expect(body).not.toMatch(/'موافق'/);
  });

  it('★ approved_at بدل reviewed_at غير الموجود', () => {
    expect(code).not.toMatch(/reviewed_at/);
    expect(code).toMatch(/approved_at: new Date\(\)\.toISOString\(\)/);
  });

  it('★ rejectExpense يكتب السبب في rejection_reason لا approved_by', () => {
    const s = code.indexOf('async rejectExpense');
    const body = code.slice(s, s + 400);
    expect(body).toMatch(/rejection_reason: reason/);
    expect(body).toMatch(/reason: string/);
  });

  it("★ approveLoan لا يمرّر سلسلة فارغة لعمود UUID", () => {
    const s = code.indexOf('async approveLoan');
    const body = code.slice(s, s + 700);
    expect(body).toMatch(/approvedBy\?: string/);
    expect(body).toMatch(/approvedBy && approvedBy\.trim\(\) !== ''/);
  });

  it('★ approveLoan يحسب end_date و remaining_amount', () => {
    const s = code.indexOf('async approveLoan');
    const body = code.slice(s, s + 700);
    expect(body).toMatch(/end_date/);
    expect(body).toMatch(/remaining_amount/);
  });

  it("★ getTotalOutstanding يفلتر 'approved' لا 'موافق'", () => {
    const s = code.indexOf('async getTotalOutstanding');
    const body = code.slice(s, s + 400);
    expect(body).toMatch(/status: 'approved'/);
    expect(body).not.toMatch(/'موافق'/);
    expect(body).not.toMatch(/loan_amount/);
  });
});

describe('0325 — الصفحات', () => {
  it('★ صفر prompt() تنفيذي في صفحتي HR', () => {
    for (const src of [EXP_HR, LOAN_HR]) {
      expect(codeOnly(src)).not.toMatch(/(?<![.\w])prompt\s*\(/);
    }
  });

  it('نافذة رفض بسبب إلزامي في الصفحتين', () => {
    // ★ تحديث 0355: كان الحارس يُلزم اسم المتغيّر `rejectReason` حرفياً.
    //   أُعيدت كتابة LoansPage فصار الاسم `reason` (وتشمل النافذة
    //   الإلغاء أيضاً لا الرفض وحده). الاسم شكل — **النيّة** هي أن
    //   يُمنع الإرسال بسبب فارغ. نحرس النيّة.
    for (const src of [EXP_HR, LOAN_HR]) {
      const code = codeOnly(src);
      expect(code, 'حالة نصّية للسبب').toMatch(/(rejectReason|\breason\b)/);
      expect(code, 'حارس السبب الفارغ')
        .toMatch(/(rejectReason|reason)\.trim\(\)\s*===\s*''/);
      // ★ ولا يُرسَل القرار بسبب فارغ: الزرّ معطَّل أو الدالة ترجع مبكراً
      expect(code, 'منع الإرسال بسبب فارغ')
        .toMatch(/(disabled=\{[^}]*\.trim\(\) === ''|\.trim\(\) === ''\)\s*\{[\s\S]{0,160}return)/);
    }
  });

  it('★ LoansPage لا يحسب end_date ولا remaining في المتصفّح', () => {
    // ★★ تحديث 0355: عطل 0325/⑥ كان «الصفحة تحسب end وتُهمله». عالجته
    //   0325 بتمرير التفاصيل إلى `approveLoan` — أي بإبقاء الحساب في
    //   المتصفّح. و0355 أثبتت أن الحساب نفسه خاطئ:
    //      JS  31 يناير + 1 شهر → 2026-03-03
    //      PG  31 يناير + 1 شهر → 2026-02-28   ← الصحيح
    //   فنُقل الحساب كلّه إلى `loan_decide` في القاعدة، وسقط
    //   `approveLoan(loan.id, user?.id, {…})` من الصفحة.
    //
    //   الحارس القديم كان يُلزم البنية الوسيطة. الآن يحرس **النتيجة**:
    //   لا حساب تاريخ في المتصفّح، والقرار عبر دالة قاعدة واحدة.
    const code = codeOnly(LOAN_HR);
    expect(code, 'setMonth عاد إلى الصفحة').not.toMatch(/setMonth/);
    expect(code, 'حساب متبقٍّ في الصفحة').not.toMatch(/remaining_amount\s*[:=]/);
    expect(code, 'القرار عبر دالة القاعدة').toMatch(/loanService\.decide\(/);
    // ★ ولا التفاف على سلسلة الاعتماد بـUPDATE مباشر
    expect(code, 'approveLoan المباشر عاد').not.toMatch(/approveLoan\s*\(/);
    expect(code, 'وعي الصفحة بالسلسلة').toMatch(/chainOpen/);
  });

  it('★ صفحتا الموظف تُنشئان سلسلة اعتماد عند الإرسال', () => {
    for (const [src, kind] of [[EXP_EMP, 'expense'], [LOAN_EMP, 'loan']] as const) {
      const code = codeOnly(src);
      expect(code).toMatch(/financialRequestService\.createApproval\(/);
      expect(code).toContain(`'${kind}'`);
    }
  });

  it('★ السلفة لا تحجز remaining_amount قبل الاعتماد', () => {
    const code = codeOnly(LOAN_EMP);
    expect(code).toMatch(/remaining_amount: 0/);
  });
});

describe('0325 — سياسة المنصة عبر بوابتي الموظف والموارد البشرية', () => {
  const pages = [
    ...readdirSync(resolve(root, 'src/pages/employee')).filter((f) => f.endsWith('.tsx'))
      .map((f) => `src/pages/employee/${f}`),
    ...readdirSync(resolve(root, 'src/pages/hr')).filter((f) => f.endsWith('.tsx'))
      .map((f) => `src/pages/hr/${f}`),
  ];

  it('★ صفر confirm()/alert()/prompt() تنفيذي', () => {
    const bad: string[] = [];
    for (const p of pages) {
      if (/(?<![.\w])(confirm|alert|prompt)\s*\(/.test(codeOnly(read(p)))) bad.push(p);
    }
    expect(bad).toEqual([]);
  });
});

describe('0325 — الاختبار السلوكي نفسه', () => {
  it('يوثّق العدد الحقيقي للتأكيدات', () => {
    expect(VERIFY).toMatch(/verify-0325: %\/46 تأكيداً ناجحاً/);
  });

  it('★ لا تأكيدات ميتة', () => {
    expect(VERIFY).not.toMatch(/ASSERT[^;]*>=\s*0[^0-9]/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يفحص تدرّج المبلغ بمبلغين مختلفين', () => {
    expect(VERIFY).toMatch(/مبلغ 500 بنى/);
    expect(VERIFY).toMatch(/مبلغ 5000 بنى/);
  });

  it('★ يفحص أخطر حالة: صرف بلا رقابة', () => {
    expect(VERIFY).toMatch(/صرف بلا رقابة/);
  });

  it('يفحص end_date و remaining_amount بقيم صريحة', () => {
    expect(VERIFY).toMatch(/DATE '2027-03-01'/);
    expect(VERIFY).toMatch(/v_num = 3000/);
  });
});
