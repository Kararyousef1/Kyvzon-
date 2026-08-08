/**
 * autoBuildStepsContract.test.ts
 *
 * عقد البناء التلقائي لسلسلة المستويات (0310).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *   ① جسر لا يبني الخطوات ⇒ المستويات تعود ديكوراً
 *   ② فشل البناء يُفشل إنشاء الطلب (الطلب أُنشئ فعلاً)
 *   ③ حِمل زائد على الجسور ⇒ PostgREST يرفض بـ«function is not unique»
 *   ④ تكرار منطق حلّ القسم بدل الدالة الموحّدة
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const M0310 = read('supabase/migrations/0310_auto_build_approval_steps.sql');
const GL = read('src/services/sdk/GeneralLedgerService.ts');
const VERIFY = read('tools/dev/verify-auto-steps-0310.sql');

const BRIDGES = [
  'create_financial_approval',
  'create_mrp_bom_approval',
  'create_general_approval',
] as const;

/** يستخرج جسم دالة بين تعريفها وتعليقها */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`FUNCTION public.${name}(`);
  const end = src.indexOf(`COMMENT ON FUNCTION public.${name}(`);
  if (start < 0 || end < 0) throw new Error(`${name} غير موجودة`);
  return src.slice(start, end);
}

describe('0310 — كل جسر يبني السلسلة', () => {
  it.each(BRIDGES)('%s يستدعي build_approval_steps', (fn) => {
    expect(fnBody(M0310, fn)).toMatch(/PERFORM public\.build_approval_steps\(/);
  });

  it.each(BRIDGES)('%s 🔴 فشل البناء لا يُفشل الإنشاء', (fn) => {
    const body = fnBody(M0310, fn);
    // البناء داخل BEGIN…EXCEPTION مع تحذير لا استثناء
    expect(body).toMatch(/BEGIN\s+PERFORM public\.build_approval_steps\([\s\S]{0,400}?EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    // ولا RAISE EXCEPTION داخل معالج الاستثناء
    const handler = body.slice(body.indexOf('EXCEPTION WHEN OTHERS THEN'));
    expect(handler.slice(0, 300)).not.toMatch(/RAISE EXCEPTION/);
  });

  it.each(BRIDGES)('%s يبني بعد الإدراج لا قبله', (fn) => {
    const body = fnBody(M0310, fn);
    const insert = body.search(/INSERT INTO public\.\w+/);
    const build = body.indexOf('build_approval_steps');
    expect(insert).toBeGreaterThan(-1);
    expect(insert).toBeLessThan(build);
  });

  it.each(BRIDGES)('%s يتخطّى البناء بلا قسم', (fn) => {
    expect(fnBody(M0310, fn)).toMatch(/IF v_dept IS NOT NULL THEN/);
  });

  it('حارس يتحقق من البناء في الجسور الثلاثة', () => {
    expect(M0310).toMatch(/0310 failed: %s does not build steps/);
    expect(M0310).toMatch(/0310 failed: %s must not fail creation on step-build error/);
  });
});

describe('0310 — حلّ القسم موحَّد', () => {
  it('دالة واحدة resolve_requester_department', () => {
    expect(M0310).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_requester_department/);
  });

  it('تُفضّل employees.department_id على النصّ', () => {
    const body = fnBody(M0310, 'resolve_requester_department');
    const empIdx = body.indexOf('FROM public.employees e');
    const txtIdx = body.indexOf('lower(btrim(d.name_ar))');
    expect(empIdx).toBeGreaterThan(-1);
    expect(txtIdx).toBeGreaterThan(-1);
    expect(empIdx).toBeLessThan(txtIdx);
  });

  it('كل جسر يستعملها بدل تكرار المنطق', () => {
    for (const fn of BRIDGES) {
      expect(fnBody(M0310, fn)).toMatch(/public\.resolve_requester_department\(auth\.uid\(\)\)/);
    }
  });

  it('لا تكرار لمنطق مطابقة الاسم داخل الجسور', () => {
    for (const fn of BRIDGES) {
      const body = fnBody(M0310, fn);
      expect(body, `${fn} يكرّر منطق حلّ القسم`).not.toMatch(/lower\(btrim\(d\.name_ar\)\)/);
    }
  });
});

describe('0310 — المبلغ', () => {
  it('المالية تستخرج المبلغ من سطور القيد', () => {
    const body = fnBody(M0310, 'create_financial_approval');
    expect(body).toMatch(/FROM public\.journal_entry_lines l/);
    expect(body).toMatch(/l\.entry_id = p_reference_id/);
  });

  it('المُمرَّر يسبق المُستخرَج', () => {
    const body = fnBody(M0310, 'create_financial_approval');
    expect(body).toMatch(/v_amount := p_amount;/);
    expect(body).toMatch(/IF v_amount IS NULL AND p_request_type = 'journal_entry'/);
  });

  it('صفر افتراضي لا تخمين', () => {
    expect(M0310).toMatch(/COALESCE\(v_amount, 0\)/);
  });
});

describe('0310 — لا حِمل زائد (PostgREST)', () => {
  it('يُسقط التواقيع القديمة عند الازدواج', () => {
    expect(M0310).toMatch(/DROP FUNCTION IF EXISTS public\.create_financial_approval\(TEXT, UUID\)/);
    expect(M0310).toMatch(/DROP FUNCTION IF EXISTS public\.create_general_approval\(TEXT,TEXT,TEXT,UUID,TEXT,TEXT\)/);
  });

  it('حارس يمنع الحِمل الزائد', () => {
    expect(M0310).toMatch(/0310 failed: %s overloads = %s \(must be 1\)/);
  });
});

describe('0310 — الجسر العام يقبل الوحدة', () => {
  it('p_unit_key يحدّد قواعد أي وحدة تُطبَّق', () => {
    const body = fnBody(M0310, 'create_general_approval');
    expect(body).toMatch(/p_unit_key\s+TEXT DEFAULT 'hr'/);
    expect(body).toMatch(/build_approval_steps\('general', v_id, p_unit_key/);
  });

  it('يرفض وحدة غير معروفة', () => {
    expect(M0310).toMatch(/INVALID_UNIT_KEY/);
  });
});

describe('GeneralLedgerService — يمرّر المبلغ', () => {
  it('يُمرّر p_amount: null ليستخرجه الجسر', () => {
    expect(GL).toMatch(/p_amount: null/);
  });

  it('ما زال لا يُفشل التقديم عند فشل الجسر', () => {
    const fn = GL.slice(GL.indexOf('async submitEntry'), GL.indexOf('async approveEntry'));
    expect(fn).toMatch(/if \(bridgeError\)[\s\S]{0,140}logger\.warn/);
    const after = fn.slice(fn.indexOf('create_financial_approval'));
    expect(after).not.toMatch(/throw new Error\(bridgeError/);
  });
});

describe('الاختبار السلوكي 0310', () => {
  it('يثبت البناء التلقائي', () => {
    expect(VERIFY).toContain('المالية تبني خطوتين بلا استدعاء يدوي');
    expect(VERIFY).toContain('التصنيع يبني خطوة تلقائياً');
    expect(VERIFY).toContain('الجسر العام يبني بقواعد الوحدة المحدَّدة');
  });

  it('يثبت الحالات الحدّية', () => {
    expect(VERIFY).toContain('موظف بلا قسم: الطلب يُنشأ');
    expect(VERIFY).toContain('موظف بلا قسم: بلا خطوات (مسار قديم)');
    expect(VERIFY).toContain('وحدة بلا قواعد: بلا خطوات');
    expect(VERIFY).toContain('الاستدعاء المكرر لا يُضاعف الخطوات');
  });

  it('يثبت الدورة من طرف لطرف', () => {
    expect(VERIFY).toContain('المستوى الأول يُرجع pending');
    expect(VERIFY).toContain('المستوى الثاني يُنهي الاعتماد');
  });

  it('يفحص الحِمل الزائد', () => {
    expect(VERIFY).toContain('لا حِمل زائد على');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});
