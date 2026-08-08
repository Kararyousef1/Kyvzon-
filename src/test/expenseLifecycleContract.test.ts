/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0363 — سلامة دورة حياة النفقات
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-expense-lifecycle-0363.sql`
 *     — **129** تأكيداً بأرقام محسوبة يدوياً
 *   · العزل مُثبَت في `…-0363-rls.sh` بدور `authenticated` حقيقيّ
 *     — **50** فحصاً
 *   · التغطية مُثبتة في `_invert_0363.py` — **45/45** عكساً أسقط
 *     الاختبار (+3 تكافؤات مُثبتة)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: طلبٌ مجمَّد بلا كشف ·
 *   معتمَدٌ بلا معتمِد · رفضٌ بلا سبب · عمودُ صرفٍ ميت · حذفٌ نهائيّ ·
 *   صفحةُ مراجعةٍ بلا زرّ تقديم.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0363_expense_lifecycle_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/ExpenseLifecycleService.ts');
const PAGE    = read('src/pages/hr/ExpensesPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة (درس 0355) ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs("/* approveRequest */ const x=1;")).not.toMatch(/approveRequest/);
    expect(codeTs("// paid_at\nconst y=1;")).not.toMatch(/paid_at/);
    expect(codeTs("const s = row.isStalled;")).toMatch(/isStalled/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'paid مذكور';")).not.toMatch(/paid/);
    expect(stmtSql("  AND x.status = 'pending'")).toMatch(/x\.status/);
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

const NEW_FNS = ['expense_chain_state', 'expense_board', 'expense_summary',
                 'expense_submit', 'expense_decide', 'expense_mark_paid'];

const STATES = ['pending', 'approved', 'paid', 'rejected', 'cancelled'];
const CATEGORIES = ['general', 'travel', 'meals', 'supplies',
                    'training', 'medical', 'transport'];

// ═══════════════════════════════════════════════════════════════
describe('0363 — بنية المايجريشن', () => {
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
    expect(MIG_CODE.slice(i, i + 500)).toMatch(/FROM anon;/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ①: كشف الطلب المجمَّد', () => {
  it('expense_chain_state تُعيد is_stalled', () => {
    const b = fnBody('expense_chain_state');
    expect(b).toMatch(/out_is_stalled/);
    // ★★★ معلَّقٌ + صفر خطوة = مجمَّد
    expect(b).toMatch(/EXISTS \(SELECT 1 FROM req WHERE status = 'pending'\)/);
    expect(b).toMatch(/COALESCE\(\(SELECT total FROM st\), 0\) = 0/);
  });

  it('★★ واللوح يُصدِّر الراية', () => {
    const b = fnBody('expense_board');
    expect(b).toMatch(/out_is_stalled/);
    expect(b).toMatch(/out_open_steps/);
    expect(b).toMatch(/COALESCE\(c\.total, 0\) = 0/);
  });

  it('★★ والملخّص يعدّ المجمَّد', () => {
    const b = fnBody('expense_summary');
    expect(b).toMatch(/out_stalled/);
    expect(b).toMatch(/c\.req_pending AND c\.total = 0/);
  });

  it('★★★ والصفحة تعرض الراية والتنبيه', () => {
    expect(PAGE_CODE).toMatch(/row\.isStalled/);
    expect(PAGE_CODE).toMatch(/summary\.stalled/);
    expect(PAGE_CODE).toMatch(/مجمَّد/);
  });

  it('★★ وexpense_decide تمنع القرار مع سلسلةٍ مفتوحة', () => {
    const b = fnBody('expense_decide');
    expect(b).toMatch(/EXPENSE_CHAIN_OPEN/);
    expect(b).toMatch(/s\.status IN \('pending','active'\)/);
  });

  it('★★★ والحارس القديم لم يُمَسّ (لم نُسقطه ولم نُعدّله)', () => {
    // العطل ليس في الحارس بل في أنّ طلباً بلا خطوات يُنشأ أصلاً
    expect(MIG_STMT).not.toMatch(/DROP TRIGGER IF EXISTS trg_guard_status_bypass/);
    expect(MIG_STMT).not.toMatch(/CREATE OR REPLACE FUNCTION public\.tg_guard_request_status_bypass/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ③/④: FK مركَّب للموظف', () => {
  it('FK على (employee_id, tenant_id)', () => {
    expect(MIG_CODE).toMatch(/expense_requests_employee_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(employee_id, tenant_id\)/);
    expect(MIG_CODE).toMatch(/REFERENCES public\.employees \(id, tenant_id\)/);
  });

  it('★★ ON DELETE RESTRICT لا CASCADE', () => {
    const i = MIG_CODE.lastIndexOf('expense_requests_employee_tenant_fkey');
    const def = MIG_CODE.slice(i, i + 400);
    expect(def).toMatch(/ON DELETE RESTRICT/);
    expect(def).not.toMatch(/ON DELETE CASCADE/);
  });

  it('والدالة تحرس المستأجر برمزٍ صريح', () => {
    expect(fnBody('expense_submit')).toMatch(/EXPENSE_EMPLOYEE_NOT_FOUND/);
    expect(fnBody('expense_submit')).toMatch(/e\.tenant_id = v_tenant/);
  });

  it('★ وtenant_id صار NOT NULL بعد علاج اليتامى', () => {
    const heal = MIG_CODE.indexOf('DELETE FROM public.expense_requests WHERE tenant_id IS NULL');
    const force = MIG_CODE.indexOf('ALTER COLUMN tenant_id SET NOT NULL');
    expect(heal).toBeGreaterThan(-1);
    expect(force, 'القيد فُرض قبل العلاج').toBeGreaterThan(heal);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑤/⑥/⑦: المبلغ والتاريخ والفئة', () => {
  it('قيد المبلغ الموجب', () => {
    expect(MIG_CODE).toMatch(/expense_requests_amount_chk/);
    expect(MIG_CODE).toMatch(/CHECK \(amount > 0\)/);
    expect(fnBody('expense_submit')).toMatch(/EXPENSE_AMOUNT_INVALID/);
  });

  it('★★ والمحفّز يمنع تاريخاً مستقبلياً', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_expense_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.expense_date > v_today/);
    expect(fnBody('expense_submit')).toMatch(/EXPENSE_DATE_IN_FUTURE/);
  });

  it('قيد الفئة بالمفردات السبع', () => {
    expect(MIG_CODE).toMatch(/expense_requests_category_chk/);
    for (const c of CATEGORIES) {
      expect(MIG_CODE, `الفئة ${c} غائبة`).toContain(`'${c}'`);
    }
    expect(fnBody('expense_submit')).toMatch(/EXPENSE_CATEGORY_INVALID/);
  });

  it('★★★ والفئة صارت مرئيّة في الواجهة (كانت عموداً بلا واجهة)', () => {
    expect(SVC_CODE).toMatch(/EXPENSE_CATEGORY_AR/);
    expect(SVC_CODE).toMatch(/travel:\s*'سفر وانتقال'/);
    expect(PAGE_CODE).toMatch(/expenseCategoryLabel/);
    expect(PAGE_CODE).toMatch(/EXPENSE_CATEGORIES\.map/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑧: الرفض بلا سبب مستحيل', () => {
  it('قيد في القاعدة', () => {
    expect(MIG_CODE).toMatch(/expense_requests_rejection_chk/);
    expect(MIG_CODE).toMatch(/status <> 'rejected'\s*\n?\s*OR \(rejection_reason IS NOT NULL/);
  });

  it('والدالة ترمي رمزاً مفهوماً قبل القيد', () => {
    expect(fnBody('expense_decide')).toMatch(/EXPENSE_REJECTION_REASON_REQUIRED/);
  });

  it('★ والصفوف القائمة عولجت بسببٍ صريح لا بفراغ', () => {
    expect(MIG_CODE).toMatch(/SET rejection_reason = 'رُفض قبل إلزام السبب/);
  });

  it('★★ والصفحة تُلزم به كذلك', () => {
    expect(PAGE_CODE).toMatch(/rejectReason\.trim\(\) === ''/);
    expect(PAGE_CODE).toMatch(/سبب الرفض مطلوب/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ⑨/⑩: المعتمِد والصرف', () => {
  it('المحفّز يملأ approved_by/at', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_expense_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.approved_by := COALESCE\(NEW\.approved_by, auth\.uid\(\)/);
    expect(b).toMatch(/NEW\.approved_at := COALESCE\(NEW\.approved_at, now\(\)\)/);
  });

  it('★★★ ويملأ paid_at (كان عموداً ميتاً)', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_expense_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.paid_at := COALESCE\(NEW\.paid_at, now\(\)\)/);
  });

  it('★★ وقيدان يمنعان المعتمَد بلا معتمِد والمدفوع بلا وقت', () => {
    expect(MIG_CODE).toMatch(/expense_requests_approved_chk/);
    expect(MIG_CODE).toMatch(/expense_requests_paid_chk/);
  });

  it('★★★ expense_mark_paid موجودة — لم يكن أيُّ مسارٍ يدفع', () => {
    const b = fnBody('expense_mark_paid');
    expect(b).toMatch(/SET status = 'paid'/);
    expect(b).toMatch(/EXPENSE_NOT_APPROVED/);
  });

  it('★★ والمدفوع لا يُنقَض', () => {
    expect(fnBody('expense_decide')).toMatch(/EXPENSE_ALREADY_PAID/);
  });

  it('★★★ والصفحة فيها زرّ صرف (لم يكن موجوداً)', () => {
    expect(PAGE_CODE).toMatch(/expenseSdk\.markPaid\(/);
    expect(PAGE_CODE).toMatch(/handlePay/);
    expect(PAGE_CODE).toMatch(/summary\.awaitingPay/);
  });

  it('★ وتعرض المعتمِد ووقته', () => {
    expect(PAGE_CODE).toMatch(/detail\.approverName/);
    expect(PAGE_CODE).toMatch(/detail\.approvedAt/);
    expect(PAGE_CODE).toMatch(/detail\.paidAt/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑪/⑫: الإلغاء والحذف', () => {
  it('محفّز منع الحذف', () => {
    expect(MIG_CODE).toMatch(/tg_block_expense_delete/);
    expect(MIG_CODE).toMatch(/EXPENSE_DELETE_BLOCKED/);
    expect(MIG_CODE).toMatch(/BEFORE DELETE ON public\.expense_requests/);
  });

  it('★ لا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE, 'delete عاد').not.toMatch(/\.delete\(/);
    expect(PAGE_CODE, 'delete عاد').not.toMatch(/\.delete\(/);
  });

  it('★★★ والمفردات الخمس كاملة (cancelled كان مفقوداً من الشريط)', () => {
    const m = SVC_CODE.match(/EXPENSE_STATES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    expect((m as RegExpMatchArray)[1].split(',').filter((x) => x.trim()).length).toBe(5);
    for (const s of STATES) {
      expect(SVC_CODE, `${s} غائبة`).toContain(`'${s}'`);
    }
    expect(PAGE_CODE).toMatch(/EXPENSE_STATES\.map/);
    // العطل: شريطٌ يدويّ بخمسة عناصر بلا cancelled
    expect(PAGE_CODE, 'شريط يدويّ عاد')
      .not.toMatch(/'all', 'pending', 'approved', 'rejected', 'paid'/);
  });

  it('★ وزرّ الإلغاء موجود', () => {
    expect(PAGE_CODE).toMatch(/handleCancel/);
    expect(PAGE_CODE).toMatch(/cancelling/);
  });

  it('★★ ولا confirm/alert/prompt (سياسة المنصة)', () => {
    for (const banned of ['confirm(', 'alert(', 'prompt(']) {
      expect(PAGE_CODE, `${banned} عاد`).not.toContain(banned);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑰: الموظف يُقدّم نفقته', () => {
  it('expense_submit موجودة و SECURITY DEFINER', () => {
    expect(MIG_CODE).toMatch(/CREATE FUNCTION public\.expense_submit/);
    expect(fnBody('expense_submit')).toMatch(/SECURITY DEFINER/);
  });

  it('★★ ولا يُقدّم باسم غيره', () => {
    expect(fnBody('expense_submit'))
      .toMatch(/v_emp IS DISTINCT FROM v_me AND NOT public\.current_user_is_staff\(\)/);
    expect(fnBody('expense_submit')).toMatch(/لا تُقدّم نفقةً باسم غيرك/);
  });

  it('★★★ والصفحة فيها زرّ إنشاء (لم يكن موجوداً)', () => {
    expect(PAGE_CODE).toMatch(/expenseSdk\.submit\(/);
    expect(PAGE_CODE).toMatch(/طلب نفقة/);
    expect(PAGE_CODE).toMatch(/setShowCreate\(true\)/);
  });

  it('★ واللوح يُضيّق على الموظف بدل حجبه', () => {
    const b = fnBody('expense_board');
    expect(b).toMatch(/v_staff OR x\.employee_id = v_me/);
    expect(b).not.toMatch(/RAISE EXCEPTION 'غير مصرَّح بلوح/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑬/⑭: الإيصال والاستعلام الواحد', () => {
  it('اللوح يُعيد الإيصال وعمر النفقة', () => {
    const b = fnBody('expense_board');
    expect(b).toMatch(/out_receipt_url/);
    expect(b).toMatch(/out_age_days/);
    expect(b).toMatch(/v_today - b\.expense_date/);
  });

  it('★ والملخّص يعدّ ما بلا إيصال (ويستثني الملغى)', () => {
    expect(fnBody('expense_summary'))
      .toMatch(/status <> 'cancelled' AND receipt_url IS NULL/);
    expect(PAGE_CODE).toMatch(/summary\.noReceipt/);
  });

  it('★★★ والصفحة لا تجلب كل الموظفين', () => {
    expect(PAGE_CODE, 'employeeService.findAll عاد')
      .not.toMatch(/employeeService\.findAll/);
    expect(PAGE_CODE).not.toMatch(/new Map<string,\s*EmployeeSummary>/);
    expect(PAGE_CODE).not.toMatch(/employees:\s*empMap/);
    expect(PAGE_CODE, 'orderBy full_name_ar عاد')
      .not.toMatch(/orderBy:\s*'full_name_ar'/);
    expect(PAGE_CODE).toMatch(/expenseSdk\.board\(/);
  });

  it('★ والاسم من الاحتياطيّ (full_name_ar فارغ لكل موظف)', () => {
    const b = fnBody('expense_board');
    expect(b).toMatch(/NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/e\.first_name \|\| ' ' \|\| e\.last_name/);
    expect(b).toMatch(/e\.employee_code/);
  });

  it('★ ولا expenseRequestService القديمة', () => {
    expect(PAGE_CODE).not.toMatch(/expenseRequestService/);
    expect(PAGE_CODE).not.toMatch(/approveRequest|rejectRequest|rejectExpense/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ التوقيت والترتيب والحدود', () => {
  it('★★★ توقيت بغداد في كل دالةٍ تحسب تاريخاً', () => {
    for (const fn of ['expense_board', 'expense_submit']) {
      expect(fnBody(fn), `${fn} بلا منطقة بغداد`)
        .toMatch(/now\(\) AT TIME ZONE 'Asia\/Baghdad'/);
    }
  });

  it('★ ولا CURRENT_DATE عارية في الدوال الجديدة', () => {
    for (const fn of NEW_FNS) {
      expect(fnBody(fn), `${fn} تستعمل CURRENT_DATE`).not.toMatch(/\bCURRENT_DATE\b/);
    }
  });

  it('★★★ ORDER BY حتميّ بثلاثة مفاتيح (درس 0357)', () => {
    expect(fnBody('expense_board'))
      .toMatch(/ORDER BY \(b\.status = 'pending'\) DESC, b\.expense_date ASC, b\.id DESC/);
  });

  it('★ والحدّ الأعلى محصور', () => {
    expect(fnBody('expense_board'))
      .toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 200\), 1\), 500\)/);
  });

  it('★★ وCOALESCE داخل round لا خارجه (درس 0355)', () => {
    const b = fnBody('expense_summary');
    expect(b).toMatch(/round\(COALESCE\(sum\(amount\)/);
    expect(b, 'COALESCE خارج round عاد').not.toMatch(/COALESCE\(round\(sum/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العزل والحرّاس', () => {
  it('لا سياسة PERMISSIVE جديدة (درس 0355)', () => {
    expect(MIG_STMT).not.toMatch(/CREATE POLICY hybrid_gate_expense_requests/);
  });

  it.each(NEW_FNS)('%s تُرشِّح المستأجر', (fn) => {
    expect(fnBody(fn)).toMatch(/current_user_tenant_id\(\)/);
  });

  it.each(['expense_summary', 'expense_decide', 'expense_mark_paid'])(
    '%s تحرس الدور', (fn) => {
      expect(fnBody(fn)).toMatch(/current_user_is_staff\(\)/);
    });

  it('★★ والكتابة تحتاج auth.uid() صريحاً', () => {
    for (const fn of ['expense_submit', 'expense_decide', 'expense_mark_paid']) {
      expect(fnBody(fn), `${fn} بلا حارس auth`).toMatch(/auth\.uid\(\) IS NULL/);
    }
  });

  it('★ والمعلَّق وحده يُبتّ', () => {
    expect(fnBody('expense_decide')).toMatch(/EXPENSE_NOT_PENDING/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ نظافة الطبقة والصفحة', () => {
  it('الخدمة مُصدَّرة من index', () => {
    expect(INDEX).toMatch(/expenseSdk/);
    expect(INDEX).toMatch(/from '\.\/ExpenseLifecycleService'/);
  });

  it('الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★★ ولا any في الطبقة ولا في الصفحة', () => {
    for (const [name, code] of [['الخدمة', SVC_CODE], ['الصفحة', PAGE_CODE]] as const) {
      expect(code, `as any في ${name}`).not.toMatch(/\bas any\b/);
      expect(code, `: any في ${name}`).not.toMatch(/:\s*any\b/);
      expect(code, `as unknown as في ${name}`).not.toMatch(/as unknown as/);
    }
  });

  it('★ numOrNull يحفظ التمييز بين صفر وغير مُقاس (درس 0353)', () => {
    expect(SVC_CODE).toMatch(/const numOrNull/);
  });

  it('★ أزرار العمل مُعطَّلة أثناء التنفيذ', () => {
    expect(PAGE_CODE).toMatch(/disabled=\{busyId === row\.id/);
    expect(PAGE_CODE).toMatch(/setSaving\(true\)/);
    expect(PAGE_CODE).toMatch(/if \(!saving\)/);
  });

  it('★★ وزرّ الموافقة مُعطَّل مع سلسلةٍ مفتوحة', () => {
    expect(PAGE_CODE).toMatch(/row\.openSteps > 0/);
    expect(PAGE_CODE).toMatch(/استعمل صندوق الموافقات/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ أدوات التحقّق موجودة ومربوطة', () => {
  it.each([
    'tools/dev/verify-expense-lifecycle-0363.sql',
    'tools/dev/verify-expense-lifecycle-0363-rls.sh',
    'tools/dev/_invert_0363.py',
  ])('%s موجود', (p) => {
    expect(existsSync(resolve(root, p))).toBe(true);
  });

  it('★ سكربت العكس يشير إلى مايجريشن 0363 نفسه', () => {
    const inv = read('tools/dev/_invert_0363.py');
    expect(inv).toContain('0363_expense_lifecycle_integrity.sql');
    expect(inv).toContain('verify-expense-lifecycle-0363.sql');
    expect(inv).toContain('verify-expense-lifecycle-0363-rls.sh');
  });

  it('★★ والمسبار حُذف قبل الكوميت', () => {
    expect(existsSync(resolve(root, 'tools/dev/_probe_0363.sql'))).toBe(false);
  });
});
