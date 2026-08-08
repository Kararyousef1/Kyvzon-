/**
 * ════════════════════════════════════════════════════════════════
 *  hrReportsContract.test.ts — عقد تقارير الموارد البشرية (0370)
 *
 *  ★★★ فحصٌ **ثابت** على النصّ: لا Postgres ولا متصفّح.
 *      السلوك يُثبته `verify-hr-reports-0370.sql` (72 تأكيداً)
 *      و`-rls.sh` (24 فحصاً بدور `authenticated` حقيقيّ)
 *      و`_invert_0370.py` (18/18 عكساً · صفر ناجٍ).
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG   = read('supabase/migrations/0370_hr_reports_integrity.sql');
const SDK   = read('src/services/sdk/HrReportService.ts');
const PAGE  = read('src/pages/hr/ReportsPage.tsx');
const INDEX = read('src/services/sdk/index.ts');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');

const migBody = MIG.replace(/^\s*--.*$/gm, '');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageBody = strip(PAGE);
const sdkBody  = strip(SDK);

/** ★ النهاية `$$;` لا `\n$$;` (درس 0365 — أسقط 14 تأكيداً) */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`, 'm',
  );
  const m = migBody.match(re);
  expect(m, `الدالة ${name} غير موجودة`).toBeTruthy();
  const body = (m as RegExpMatchArray)[0];
  expect(body.length, `جسم ${name} قصيرٌ مريب`).toBeGreaterThan(200);
  return body;
}

// ════════════════════════════════════════════════════════════════
describe('0370 — ★★★★ العطل ①: لا تقريرَ وهميّ', () => {
  it('★★★★ عبارة «بيانات تجريبية» اختفت من الصفحة تماماً', () => {
    expect(pageBody).not.toContain('بيانات تجريبية');
  });

  it('★★★★ ولا فرعَ else يُخرج صفّاً مصطنعاً في المنفّذ', () => {
    const body = fnBody('hr_report_execute');
    expect(body).toContain('HR_REPORT_NOT_IMPLEMENTED');
  });

  it('★★★ الكتالوج يبذر ثمانية تقارير', () => {
    const seed = migBody.match(
      /INSERT INTO public\.hr_report_definitions[\s\S]*?ON CONFLICT/,
    );
    expect(seed).toBeTruthy();
    const body = (seed as RegExpMatchArray)[0];
    for (const c of ['workforce_kpi', 'headcount_by_department',
                     'attendance_detail', 'leaves_detail',
                     'performance_summary', 'incidents_detail',
                     'wellness_aggregate', 'contracts_expiry']) {
      expect(body, `التقرير ${c} غير مبذور`).toContain(`'${c}'`);
    }
  });

  it('★★★★ كلُّ رمزٍ مبذورٍ له فرعُ تنفيذٍ في المنفّذ', () => {
    const body = fnBody('hr_report_execute');
    for (const c of ['workforce_kpi', 'headcount_by_department',
                     'attendance_detail', 'leaves_detail',
                     'performance_summary', 'incidents_detail',
                     'wellness_aggregate', 'contracts_expiry']) {
      expect(body, `الرمز ${c} مبذورٌ بلا تنفيذ`).toContain(`p_code = '${c}'`);
    }
  });

  it('★ التقارير الوهمية الثلاثة لم تعُد مذكورةً في الصفحة', () => {
    for (const t of ['satisfaction', 'sentiment']) {
      expect(pageBody, `${t} ما زال في الصفحة`).not.toContain(`'${t}'`);
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — ★★★★ العطل ②: المُبلِّغ المجهول', () => {
  it('★★★★ الإخفاء في القاعدة لا في الواجهة', () => {
    const body = fnBody('hr_report_execute');
    expect(body).toContain('i.is_anonymous');
    expect(body).toContain('مُبلِّغ مجهول');
  });

  it('★★★ الصفحة لا تقرأ employee_name إطلاقاً', () => {
    expect(pageBody).not.toContain('employee_name');
    expect(sdkBody).not.toContain('employee_name');
  });

  it('★★★ ولا تستعمل incidentService المكشوف', () => {
    expect(pageBody).not.toContain('incidentService');
    expect(pageBody).not.toContain('IncidentService');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — ★★★★ العطل ③: الصحة النفسية', () => {
  it('★★★★ التجميع بالقسم مع حدٍّ أدنى k = 3', () => {
    const body = fnBody('hr_report_execute');
    expect(body).toContain('cnt.n >= 3');
    expect(body).toContain('أقسام أخرى');
  });

  it('★★★★ التقرير لا يحمل عمود اسمٍ ولا ملاحظات', () => {
    const seed = migBody.match(/'wellness_aggregate'[\s\S]*?\d+\),/);
    expect(seed).toBeTruthy();
    // ★ تصحيحُ تأكيدٍ كتبتُه أوسع من قصده: كان يفحص الكتلة كاملةً
    //   فأمسك كلمة «ملاحظات» في نصّ **الوصف** («لا أسماء ولا ملاحظات»)
    //   وهو نفيٌ لا إثبات. محلُّ الخطر قائمةُ الأعمدة وحدها.
    const cols = (seed as RegExpMatchArray)[0].match(/ARRAY\[[^\]]*\]/);
    expect(cols, 'قائمة أعمدة wellness_aggregate غير موجودة').toBeTruthy();
    const body = (cols as RegExpMatchArray)[0];
    expect(body).toContain('القسم');
    expect(body).not.toContain('الموظف');
    expect(body).not.toContain('ملاحظات');
    expect(body).not.toContain('الاسم');
  });

  it('★★★ الصفحة لا تستعمل wellnessEntryService المكشوف', () => {
    expect(pageBody).not.toContain('wellnessEntryService');
    expect(pageBody).not.toContain('findAllEntries');
  });

  it('★ ولا تقرأ `notes` من إدخالات الصحة النفسية', () => {
    const body = fnBody('hr_report_execute');
    const wellness = body.slice(body.indexOf("p_code = 'wellness_aggregate'"));
    const upTo = wellness.slice(0, wellness.indexOf('ELSIF'));
    expect(upTo).not.toContain('w.notes');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — ★★★ العطل ④: الأثر التدقيقيّ', () => {
  it('★★★ جدول hr_report_runs موجود', () => {
    expect(migBody).toContain('CREATE TABLE IF NOT EXISTS public.hr_report_runs');
  });

  it('★★★ المنفّذ يكتب سجلَّ تشغيلٍ في كلّ مرة', () => {
    const body = fnBody('hr_report_execute');
    expect(body).toContain('INSERT INTO public.hr_report_runs');
    expect(body).toContain('auth.uid()');
  });

  it('★★★ لا سياسة UPDATE ولا DELETE على السجلّ', () => {
    expect(migBody).not.toMatch(/CREATE POLICY \w*hr_report_runs\w*\s+FOR UPDATE/);
    expect(migBody).not.toMatch(/CREATE POLICY \w*hr_report_runs\w*\s+FOR DELETE/);
  });

  it('★★★ ومحفّزٌ يمنع التعديل والحذف', () => {
    expect(migBody).toContain('trg_block_hr_report_run_change');
    expect(migBody).toContain('BEFORE UPDATE OR DELETE ON public.hr_report_runs');
    expect(migBody).toContain('HR_REPORT_RUN_IMMUTABLE');
  });

  it('★★ authenticated محرومٌ من UPDATE/DELETE', () => {
    expect(migBody).toContain(
      'REVOKE UPDATE, DELETE ON public.hr_report_runs FROM authenticated');
  });

  it('★ والصفحة تعرض السجلّ في تبويبٍ مستقلّ', () => {
    expect(pageBody).toContain('hrReportSdk.runs(');
    expect(pageBody).toContain('سجلّ التصديرات');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — ★★★ العطل ⑤: حارس الدور', () => {
  it('★★★ المنفّذ يرفض غير الموارد البشرية بصوتٍ مسموع', () => {
    const body = fnBody('hr_report_execute');
    expect(body).toContain('current_user_is_staff()');
    expect(body).toContain('HR_REPORT_FORBIDDEN');
  });

  it('★★★ والكتالوج واللوح كذلك', () => {
    expect(fnBody('hr_report_catalog')).toContain('HR_REPORT_FORBIDDEN');
    expect(fnBody('hr_report_run_board')).toContain('HR_REPORT_FORBIDDEN');
  });

  it('★★★★ manager رُفع من أدوار hr-reports في الكتالوج', () => {
    const line = CATALOG.split('\n').find((l) => l.includes("id: 'hr-reports'"));
    expect(line, 'سطر hr-reports غير موجود').toBeTruthy();
    expect(line as string).not.toContain("'manager'");
    expect(line as string).toContain("'hr'");
    expect(line as string).toContain("'admin'");
  });

  it('★★★ والصفحة تعرض حالة الحرمان صراحةً', () => {
    expect(pageBody).toContain('HR_REPORT_FORBIDDEN');
    expect(pageBody).toContain('setForbidden');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — ★★★ العطل ⑦: النطاق والاقتطاع', () => {
  it('★★★ نطاقٌ معكوسٌ مرفوض', () => {
    expect(fnBody('hr_report_execute')).toContain('HR_REPORT_BAD_RANGE');
  });

  it('★★★ ونطاقٌ يتجاوز سنةً مرفوض', () => {
    expect(fnBody('hr_report_execute')).toContain('HR_REPORT_RANGE_TOO_WIDE');
  });

  it('★★★★ الاقتطاع مكشوفٌ في كلّ صفّ عبر total_rows', () => {
    const body = fnBody('hr_report_execute');
    expect(body).toContain('total_rows INTEGER');
    expect(body).toContain('v_total > v_rows');
  });

  it('★★★ والقيد يفرض اتّساق was_truncated — IS NOT DISTINCT FROM', () => {
    const chk = migBody.match(/chk_hr_report_run_counts[\s\S]*?END \$\$;/);
    expect(chk).toBeTruthy();
    const body = (chk as RegExpMatchArray)[0];
    // ★★★★ الثغرة الثلاثية (درس 0365): `=` تُعطي NULL و CHECK يقبله
    expect(body).toContain('IS NOT DISTINCT FROM');
    expect(body).toContain('total_rows > row_count');
  });

  it('★★ والصفحة تُعلن الاقتطاع بدل إخفائه', () => {
    expect(pageBody).toContain('wasTruncated');
    expect(pageBody).toContain('مقتطع');
  });

  it('★ والحدّ محصورٌ بين 1 و5000', () => {
    expect(fnBody('hr_report_execute'))
      .toContain('LEAST(GREATEST(COALESCE(p_limit, 2000), 1), 5000)');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — الجدار', () => {
  it('★★★ البوّابة الهجينة RESTRICTIVE على وحدة hr', () => {
    const pol = migBody.match(
      /CREATE POLICY hybrid_gate_hr_report_runs[\s\S]*?WITH CHECK[^;]*;/);
    expect(pol).toBeTruthy();
    const body = (pol as RegExpMatchArray)[0];
    expect(body).toContain('AS RESTRICTIVE');
    expect(body).toContain("hybrid_allows_module('hr')");
  });

  it('★★★ الإدراج باسم النفس فقط', () => {
    const pol = migBody.match(
      /CREATE POLICY kyvzon_hr_report_runs_insert[\s\S]*?\);/);
    expect(pol).toBeTruthy();
    expect((pol as RegExpMatchArray)[0]).toContain('executed_by = auth.uid()');
  });

  it('★★★ REVOKE … FROM anon على الدوال الثلاث', () => {
    for (const fn of ['hr_report_catalog', 'hr_report_execute',
                      'hr_report_run_board', 'hr_report_employee_label']) {
      expect(migBody, `${fn} بلا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\b[^;]*FROM anon;`));
    }
  });

  it('★★★ وعلى الجدولين', () => {
    expect(migBody).toContain('REVOKE ALL ON public.hr_report_definitions FROM anon');
    expect(migBody).toContain('REVOKE ALL ON public.hr_report_runs        FROM anon');
  });

  it('★★★★ الدوال الثلاث SECURITY INVOKER — لولاها لتجاوزت RLS', () => {
    for (const fn of ['hr_report_catalog', 'hr_report_execute',
                      'hr_report_run_board']) {
      expect(fnBody(fn), `${fn} ليست INVOKER`).toContain('SECURITY INVOKER');
      expect(fnBody(fn), `${fn} صارت DEFINER`).not.toContain('SECURITY DEFINER');
    }
  });

  it('★★★ FK مركَّب (executed_by, tenant_id) يمنع العبور', () => {
    expect(migBody).toContain('FOREIGN KEY (executed_by, tenant_id)');
    expect(migBody).toContain('REFERENCES public.profiles (id, tenant_id)');
  });

  it('★★★ توقيت بغداد صريحٌ — الخادم Etc/UTC', () => {
    expect(fnBody('hr_report_execute')).toContain("AT TIME ZONE 'Asia/Baghdad'");
  });

  it('★★★ الترتيب مذيَّلٌ بمُميِّزٍ فريد', () => {
    expect(fnBody('hr_report_catalog')).toContain('ORDER BY d.sort_order, d.code');
    expect(fnBody('hr_report_run_board')).toContain('ORDER BY r.executed_at DESC, r.id');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — طبقة SDK', () => {
  it('★★★ الصفحة لا تلمس Supabase', () => {
    expect(pageBody).not.toContain('supabase');
    expect(pageBody).not.toContain('from(');
  });

  it('★★★ ولا نوعَ any', () => {
    expect(pageBody).not.toMatch(/\bas any\b/);
    expect(pageBody).not.toMatch(/:\s*any\b/);
    expect(pageBody).not.toMatch(/any\[\]/);
    expect(sdkBody).not.toMatch(/\bas any\b/);
    expect(sdkBody).not.toMatch(/:\s*any\b/);
    expect(sdkBody).not.toMatch(/any\[\]/);
  });

  it('★★★ ولا confirm/prompt/alert', () => {
    for (const f of ['confirm(', 'prompt(', 'alert(']) {
      expect(pageBody, `${f} ممنوع`).not.toContain(f);
    }
  });

  it('★★ الخدمة مُصدَّرةٌ من index', () => {
    expect(INDEX).toContain('hrReportSdk');
    expect(INDEX).toContain("from './HrReportService'");
  });

  it('★★ والصفحة تستوردها من الحزمة لا من الملفّ', () => {
    expect(pageBody).toContain("from '../../services/sdk'");
    expect(pageBody).not.toContain('HrReportService');
  });

  it('★ CSV بـBOM وتهريبٍ صحيح', () => {
    expect(sdkBody).toContain('\\ufeff');
    expect(sdkBody).toContain('replace(/"/g, \'""\')');
  });

  it('★ واسمُ الملفّ يحمل الرمز والتاريخ لا اسماً عاماً', () => {
    expect(sdkBody).toContain('hrReportFileName');
    expect(pageBody).toContain('hrReportFileName(result)');
    expect(pageBody).not.toContain('تقرير_');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0370 — العطل ⑥: التواريخ المسمَّرة', () => {
  it('★★ لا سنةَ 2024 في الصفحة', () => {
    expect(pageBody).not.toContain('2024');
  });

  it('★★ ولا كتالوجَ مسمَّرٌ فيها — يأتي من القاعدة', () => {
    expect(pageBody).toContain('hrReportSdk.catalog()');
    expect(pageBody).not.toMatch(/const reports\s*=\s*\[/);
  });

  it('★★★ والصفحة تحسب اليوم بتوقيت بغداد', () => {
    expect(pageBody).toContain("timeZone: 'Asia/Baghdad'");
  });
});
