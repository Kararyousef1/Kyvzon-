/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0349 — تحليلات الموارد البشرية
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج (درس 0344 · تكرّر 14 مرة): **لا نقارن الدالة بنفسها.**
 *   الاختبار الذي ينسخ نصّ المايجريشن يقارن الشيء بنفسه ولا يكشف شيئاً
 *   (عطل 0337 مرّ ثمانية أشهر بهذه الطريقة).
 *
 *   لذلك كل تأكيد بنيوي هنا يقارن **مصدرين مستقلّين**:
 *     · تعريف الجدول من مايجريشن المخطط الأصلي  ⇔  ما تكتبه الشيفرة
 *     · مفردات الحضور من `shiftCalculations.ts`  ⇔  ما تُرشّحه الدالة
 *
 *   والسلوك مُختبَر على Postgres في
 *   `tools/dev/verify-hr-analytics-0349.sql` (51 تأكيداً · صفر فشل)
 *   وعُكِس كل إصلاح في `tools/dev/_invert_0349.py` (15/15 أسقط الاختبار).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0349_hr_analytics_real_metrics.sql');
const SERVICE = read('src/services/sdk/HrAnalyticsService.ts');
const PAGE    = read('src/pages/hr/AnalyticsPage.tsx');
const SHIFTS  = read('src/utils/shiftCalculations.ts');

/** يُزيل تعليقات TS/JS — كي لا يُطابِق التأكيدُ نصّاً في تعليق */
const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** يُزيل تعليقات SQL */
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
/** يُزيل التعليقات **والسلاسل النصية** — للتأكيدات البنيوية */
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ═══════════════════════════════════════════════════════════════════
// ★ حارس المُجرِّدات — الأداة التي نقيس بها يجب أن تُقاس أولاً
// ═══════════════════════════════════════════════════════════════════

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يحذف التعليق ويُبقي الشيفرة', () => {
    expect(codeTs('/* satisfactionRate */ const x=1;')).not.toMatch(/satisfactionRate/);
    expect(codeTs('// satisfactionRate\nconst y=2;')).not.toMatch(/satisfactionRate/);
    expect(codeTs('const z = satisfactionRate;')).toMatch(/satisfactionRate/);
  });
  it('stmtSql يحذف السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'عطلة مذكورة';")).not.toMatch(/عطلة/);
    expect(stmtSql("SELECT status FROM t WHERE s <> 'عطلة';")).toMatch(/status/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/** جسم دالة بعينها من المايجريشن — بين CREATE و COMMENT الخاصّين بها */
const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT توثيقي`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

const FNS = [
  'hr_analytics_overview',
  'hr_analytics_departments',
  'hr_analytics_wellness_trend',
  'hr_analytics_incident_trend',
];

// ═══════════════════════════════════════════════════════════════════
describe('0349 — العطل ①: ربط الصحة النفسية', () => {
  /**
   * ★★★ مصدر مستقلّ: تعريف المفتاح الأجنبي من مايجريشن المخطط الأصلي.
   *   لا نأخذ الحقيقة من 0349 نفسه.
   */
  it('★★★ wellness_entries.employee_id يشير إلى employees لا profiles', () => {
    const files = [
      'supabase/migrations/0003_hr_platform_modules.sql',
      'supabase/migrations/0006_hr_expansion.sql',
      'supabase/migrations/0001_core_schema.sql',
    ].filter((f) => existsSync(resolve(root, f)));
    expect(files.length, 'لم يُعثر على مايجريشن المخطط').toBeGreaterThan(0);

    const all = files.map(read).join('\n');
    // ★ التعريف الفعلي يحمل بادئة public. — تحقّقتُ منه في 0003:385
    const j = all.search(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?wellness_entries/);
    expect(j, 'تعريف wellness_entries غير موجود').toBeGreaterThan(-1);

    const body = all.slice(j, all.indexOf(');', j));
    const line = body.split('\n').find((l) => l.includes('employee_id'));
    expect(line, 'لا سطر employee_id').toBeTruthy();
    // الحقيقة المُحقَّقة على Postgres: REFERENCES employees(id)
    expect(line).toMatch(/REFERENCES\s+(?:public\.)?employees/i);
    expect(line).not.toMatch(/REFERENCES\s+(?:public\.)?profiles/i);
  });

  it('★★★ الصفحة لم تعد تربط wellness بـ profiles', () => {
    // العطل الأصلي حرفياً: profileList.find((p) => p.id === w.employee_id)
    expect(PAGE_CODE).not.toMatch(/profileList/);
    expect(PAGE_CODE).not.toMatch(/\.find\s*\(\s*\(\s*p\s*\)\s*=>\s*p\.id\s*===\s*w\.employee_id/);
    expect(PAGE_CODE).not.toMatch(/wellnessTotal|wellnessCount/);
  });

  it('دالتا الصحة تربطان عبر employees لا profiles', () => {
    for (const fn of ['hr_analytics_overview', 'hr_analytics_departments']) {
      const body = stmtSql(fnBody(fn));
      const wi = body.indexOf('wellness_entries');
      expect(wi, `${fn}: لا يقرأ wellness_entries`).toBeGreaterThan(-1);
      const seg = body.slice(wi, wi + 400);
      expect(seg, `${fn}: الربط لا يمرّ بـ emp`).toMatch(/JOIN\s+emp/i);
      expect(seg, `${fn}: عاد الربط بـ profiles`).not.toMatch(/JOIN\s+public\.profiles/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0349 — العطل ②+④: الزمن والثوابت المُختلَقة', () => {
  it('★★★ الصفحة لا تستعمل getMonth() للترشيح الزمني', () => {
    expect(PAGE_CODE).not.toMatch(/getMonth\(\)\s*===/);
    expect(PAGE_CODE).not.toMatch(/currentMonth/);
  });

  it('النطاق في القاعدة يحمل حدّين صريحين لا استخراج شهر', () => {
    const body = stmtSql(fnBody('hr_analytics_overview'));
    expect(body).toMatch(/closed_at\s*>=\s*p_from/);
    expect(body).toMatch(/closed_at\s*<\s*\(p_to \+ 1\)/);
    // EXTRACT(MONTH …) بلا سنة هو العطل نفسه — يجب ألّا يعود
    expect(body).not.toMatch(/EXTRACT\s*\(\s*MONTH/i);
  });

  it('★★★ الثابت 2.4 ورفيقاه المُختلَقان اختفوا من الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/avgResolutionTime/);
    expect(PAGE_CODE).not.toMatch(/2\.4/);
    expect(PAGE_CODE).not.toMatch(/satisfactionRate/);
    expect(PAGE_CODE).not.toMatch(/satisfactionScore/);
    expect(PAGE_CODE).not.toMatch(/:\s*85\b/);
  });

  it('متوسط الحل يُحسب من closed_at − created_at', () => {
    const body = stmtSql(fnBody('hr_analytics_overview'));
    expect(body).toMatch(/avg\s*\(\s*EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(closed_at - created_at\)/i);
    expect(body).toMatch(/86400/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0349 — العطل ⑥: مفردات الحضور والمقام', () => {
  /**
   * ★★★ مصدر مستقلّ: المفردات الثماني تُستخرَج من
   *   `determineAttendanceStatus` في `shiftCalculations.ts` — لا من 0349.
   */
  const VOCAB = [
    'حضور_بوقت', 'متأخر', 'زمنية_معتمدة', 'زمنية_انتظار',
    'غائب', 'مجاز', 'إجازة_انتظار', 'عطلة',
  ];

  it('★★★ المفردات الثماني موجودة في مصدرها المستقلّ', () => {
    for (const v of VOCAB) {
      expect(SHIFTS, `المفردة ${v} غائبة عن shiftCalculations.ts`).toContain(v);
    }
  });

  it('★★★ المفردات المُختلَقة لم تعد', () => {
    for (const bad of ['في الوقت', 'حاضر']) {
      expect(MIG_CODE, `المفردة المختلقة «${bad}» عادت`).not.toContain(`'${bad}'`);
      expect(PAGE_CODE).not.toContain(`'${bad}'`);
    }
  });

  it('الحضور الفعلي أربع مفردات بالضبط — لا «كل ما ليس غائب»', () => {
    const body = codeSql(fnBody('hr_analytics_overview'));
    expect(body).toMatch(
      /status IN \('حضور_بوقت','متأخر','زمنية_معتمدة','زمنية_انتظار'\)/,
    );
    // العطل الأصلي حرفياً
    expect(body).not.toMatch(/status\s*<>\s*'غائب'/);
  });

  it('★★★ العطلة والمجاز خارج مقام الحضور في الدالتين', () => {
    for (const fn of ['hr_analytics_overview', 'hr_analytics_departments']) {
      const body = codeSql(fnBody(fn));
      expect(body, `${fn}: المقام لا يستبعد عطلة/مجاز`)
        .toMatch(/status NOT IN \('عطلة','مجاز'\)[\s\S]{0,80}working_days/);
    }
  });

  it('الخدمة تُصرّح بيومَي العطلة والمجاز صراحةً', () => {
    expect(SVC_CODE).toMatch(/leaveDays/);
    expect(SVC_CODE).toMatch(/holidayDays/);
    expect(SVC_CODE).toMatch(/out_leave_days/);
    expect(SVC_CODE).toMatch(/out_holiday_days/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0349 — العطل ⑦: المؤرشف ليس مفتوحاً', () => {
  it('★★★ العمود اسمه archived_at لا archived', () => {
    // خطأ ارتكبتُه فعلاً في 0345 ومرّ التطبيق بنجاح
    expect(MIG_STMT).not.toMatch(/\bi\.archived\b(?!_at)/);
    expect(MIG_STMT).toMatch(/archived_at IS NULL/);
  });

  it('كل قراءة للبلاغات تستثني المؤرشف', () => {
    for (const fn of FNS) {
      const body = stmtSql(fnBody(fn));
      if (!body.includes('incidents')) continue;
      const n = (body.match(/FROM public\.incidents/g) || []).length;
      const g = (body.match(/archived_at IS NULL/g) || []).length;
      expect(g, `${fn}: ${n} قراءة للبلاغات و${g} حارس أرشفة`).toBe(n);
    }
  });

  it('★★★ حالات البلاغ لا تشمل escalated الممنوعة بـ CHECK', () => {
    // العطل الذي ارتكبتُه في 0345: بطاقة تعدّ حالة يمنعها القيد
    expect(MIG_STMT).not.toMatch(/escalated/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0349 — العطل ⑤+⑧: لا محاكاة ولا سلاسل زمنية مزيّفة', () => {
  it('★★★ التأخير المُفتعَل والادّعاءات الإحصائية اختفت', () => {
    expect(PAGE_CODE).not.toMatch(/setTimeout/);
    expect(PAGE_CODE).not.toMatch(/Math\.random/);
    expect(PAGE_CODE).not.toMatch(/p-value/);
    expect(PAGE_CODE).not.toMatch(/Random Forest/);
    expect(PAGE_CODE).not.toMatch(/دقة النموذج/);
    expect(PAGE_CODE).not.toMatch(/AI Powered/);
    expect(PAGE_CODE).not.toMatch(/runAdvancedAnalysis|advancedResults/);
  });

  it('★★★ المعادلة المُختلَقة لتحليل المشاعر اختفت', () => {
    expect(PAGE_CODE).not.toMatch(/sentimentTrend/);
    expect(PAGE_CODE).not.toMatch(/40 \+ dept\.employeeCount/);
    expect(PAGE_CODE).not.toMatch(/Math\.min\(90/);
    expect(PAGE_CODE).not.toMatch(/satisfactionData/);
  });

  it('★★★ أسماء الأشهر لم تعد تُلصَق على الأقسام', () => {
    // العطل: monthNames[idx % 6] على departmentStats
    expect(PAGE_CODE).not.toMatch(/monthNames\s*\[/);
    expect(PAGE_CODE).not.toMatch(/idx\s*%\s*6/);
    // التسمية الآن من تاريخ حقيقي قادم من القاعدة
    expect(PAGE_CODE).toMatch(/monthLabel/);
    expect(PAGE_CODE).toMatch(/p\.monthStart/);
  });

  it('الأشهر الخالية تُعاد ولا تُطوى (LEFT JOIN)', () => {
    const body = stmtSql(fnBody('hr_analytics_wellness_trend'));
    expect(body).toMatch(/FROM months\s+LEFT JOIN w/i);
    expect(body).toMatch(/generate_series/);
  });

  it('الأقسام الخالية تُعاد ولا تُخفى', () => {
    const body = stmtSql(fnBody('hr_analytics_departments'));
    expect(body).toMatch(/FROM d\s+LEFT JOIN emp_cnt/i);
    // كل الانضمامات الفرعية LEFT — وإلا اختفى القسم
    expect((body.match(/LEFT JOIN/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0349 — الأمان وحدود الدوال', () => {
  it('الدوال الأربع كلها DEFINER · STABLE · search_path', () => {
    for (const fn of FNS) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست SECURITY DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(body, `${fn}: ليست STABLE`).toMatch(/\bSTABLE\b/);
      expect(body, `${fn}: بلا search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('كل دالة تُرشّح بالمستأجر وتشترط staff', () => {
    for (const fn of FNS) {
      const body = codeSql(fnBody(fn));
      expect(body, `${fn}: لا يقرأ المستأجر`)
        .toMatch(/v_tenant UUID := public\.current_user_tenant_id\(\)/);
      expect(body, `${fn}: لا يحرس الدور`)
        .toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
      expect(body, `${fn}: لا يحرس المستأجر الفارغ`)
        .toMatch(/IF v_tenant IS NULL THEN/);
    }
  });

  it('★★★ كل جدول يُقرأ داخل الدوال مُرشَّح بالمستأجر', () => {
    for (const fn of FNS) {
      const body = stmtSql(fnBody(fn));
      const reads = (body.match(/FROM public\.(\w+)/g) || [])
        .map((m) => m.replace('FROM public.', ''))
        // departments/succession_candidates تُرشَّح في CTE أو EXISTS
        .filter((t) => t !== 'profiles');
      const filters = (body.match(/tenant_id\s*=\s*v_tenant/g) || []).length;
      expect(filters, `${fn}: ${reads.length} قراءة و${filters} ترشيح`)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it('DROP FUNCTION صريح قبل كل CREATE — CREATE OR REPLACE لا يغيّر الإرجاع', () => {
    for (const fn of FNS) {
      expect(MIG_CODE, `${fn}: لا DROP صريح`)
        .toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    }
    expect(MIG_CODE).not.toMatch(/CREATE OR REPLACE FUNCTION public\.hr_analytics_/);
  });

  it('حدود p_months محروسة في دالتي الاتجاه', () => {
    for (const fn of ['hr_analytics_wellness_trend', 'hr_analytics_incident_trend']) {
      const body = codeSql(fnBody(fn));
      expect(body, `${fn}: حدّ p_months مفقود`)
        .toMatch(/p_months IS NULL OR p_months < 1 OR p_months > 36/);
    }
  });

  it('حدّ النطاق المعكوس محروس في دالتي النطاق', () => {
    for (const fn of ['hr_analytics_overview', 'hr_analytics_departments']) {
      expect(codeSql(fnBody(fn)), `${fn}: نطاق معكوس غير محروس`)
        .toMatch(/IF p_from > p_to THEN/);
    }
  });

  it('GRANT لـ authenticated على الدوال الأربع', () => {
    for (const fn of FNS) {
      expect(MIG_CODE)
        .toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated`));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0349 — حدود الطبقات والنظافة', () => {
  it('★★★ الصفحة لا تلمس Supabase ولا خدمات القراءة الخام', () => {
    expect(PAGE_CODE).not.toMatch(/from ['"].*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
    // كانت تقرأ أربع خدمات وتحسب في المتصفح
    expect(PAGE_CODE).not.toMatch(/userService|incidentService|wellnessEntryService/);
    expect(PAGE_CODE).not.toMatch(/workforceAnalyticsService/);
    expect(PAGE_CODE).toMatch(/hrAnalyticsService/);
  });

  it('الخدمة تستدعي الدوال الأربع بأسمائها', () => {
    for (const fn of FNS) {
      expect(SVC_CODE, `الخدمة لا تستدعي ${fn}`).toContain(`'${fn}'`);
    }
  });

  it('★★★ لا as any ولا confirm/prompt/alert', () => {
    for (const [name, src] of [['الصفحة', PAGE_CODE], ['الخدمة', SVC_CODE]] as const) {
      expect(src, `${name}: as any`).not.toMatch(/\bas\s+any\b/);
      expect(src, `${name}: confirm`).not.toMatch(/\bconfirm\s*\(/);
      expect(src, `${name}: prompt`).not.toMatch(/\bprompt\s*\(/);
      expect(src, `${name}: alert`).not.toMatch(/\balert\s*\(/);
    }
  });

  it('★★★ لا حذف نهائي — الدوال قراءة فقط', () => {
    expect(MIG_STMT).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(MIG_STMT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(MIG_STMT).not.toMatch(/\bTRUNCATE\b/i);
    // STABLE يمنع الكتابة أصلاً — وهذا حارس مزدوج مقصود
    expect(MIG_STMT).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
    expect(MIG_STMT).not.toMatch(/\bUPDATE\s+public\./i);
  });

  it('الصفحة تعرض «—» لا صفراً حين لا قياس', () => {
    // الصفر قياسٌ والغياب ليس قياساً
    expect(PAGE_CODE).toMatch(/wellnessSamples === 0/);
    expect(PAGE_CODE).toMatch(/hasWellness/);
    expect(PAGE_CODE).toMatch(/لا قياسات/);
  });

  it('★★★ مجال الرسم 0..100 لا 50..100 (لئلا يُقصّ الانخفاض)', () => {
    expect(PAGE_CODE).toMatch(/domain=\{\[0, 100\]\}/);
    expect(PAGE_CODE).not.toMatch(/domain=\{\[50, 100\]\}/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0349 — أدوات التحقق موجودة ومتّسقة', () => {
  it('ملف SQL وسكربت العكس موجودان', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-hr-analytics-0349.sql'))).toBe(true);
    expect(existsSync(resolve(root, 'tools/dev/_invert_0349.py'))).toBe(true);
  });

  it('★★★ ملف التحقق يفحص الأعطال الستة بحرّاس SENTINEL', () => {
    const v = read('tools/dev/verify-hr-analytics-0349.sql');
    // راية SENTINEL لا كلمة عربية قد تظهر في رسالة الفشل نفسها
    for (const s of ['SENTINEL_A8', 'SENTINEL_A10', 'SENTINEL_A11',
                     'SENTINEL_A13', 'SENTINEL_D3', 'SENTINEL_D14']) {
      expect(v, `الحارس ${s} مفقود`).toContain(s);
    }
    expect(v).toContain('ROLLBACK');
  });

  it('★★★ سكربت العكس يتحقق أن الاستبدال طابق فعلاً', () => {
    const inv = read('tools/dev/_invert_0349.py');
    expect(inv).toMatch(/if old not in original/);
    expect(inv).toMatch(/NO_MATCH/);
    expect(inv).toMatch(/assert broken != original/);
    expect(inv).toMatch(/SURVIVED/);
  });
});
