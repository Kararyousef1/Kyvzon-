/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0345 — لوحة الموارد البشرية
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج: لا نقارن الدالة بنفسها (درس 0344).
 *   الأعطال ①②③ كلها **أسماء أعمدة خاطئة**، فالحارس الحقيقي هو
 *   مقارنة ما تكتبه الشيفرة بما يُصرّح به **المايجريشن الذي أنشأ
 *   الجدول** — مصدران مستقلّان.
 *
 *   السلوك نفسه مُختبَر على Postgres في
 *   `tools/dev/verify-hr-dashboard-0345.sql` (72 تأكيداً)
 *   وعبر RLS في `-rls.sh` (21 تأكيداً).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG = read('supabase/migrations/0345_hr_dashboard_summary.sql');
const SCHEMA = read('supabase/migrations/0003_hr_platform_modules.sql');
const FIX0008 = read('supabase/migrations/0008_incident_contract_fixes.sql');
const SERVICE = read('src/services/sdk/HrDashboardService.ts');
const PAGE = read('src/pages/hr/HRDashboard.tsx');

/** يزيل التعليقات — نحرس الشيفرة لا الشرح (درس 0344) */
function codeOnlyTs(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
function codeOnlySql(src: string): string {
  return src.replace(/^\s*--.*$/gm, '');
}

/**
 * ★★★ يزيل تعليقات SQL **ونصوص السلاسل** معاً.
 *
 *   نصّ `COMMENT ON FUNCTION` يشرح العطل ويقتبسه حرفياً
 *   (`'… كان يجمع w.mood_score '`). فحصُ الاستعمال الفعلي يجب أن
 *   يتجاهله، وإلا لَما أمكن توثيق العطل دون إسقاط الحارس.
 *   ★ نستبدل السلسلة بمسافة لا بفراغ كي لا تلتحم الرموز المجاورة.
 */
function sqlStatementsOnly(src: string): string {
  return codeOnlySql(src).replace(/'(?:[^']|'')*'/g, " '' ");
}

describe('★★ المُجرِّدان يعملان فعلاً', () => {
  it('codeOnlyTs', () => {
    expect(codeOnlyTs('/* mood_score */ const x=1;')).not.toMatch(/mood_score/);
    expect(codeOnlyTs('// mood_score\nconst y=2;')).not.toMatch(/mood_score/);
    expect(codeOnlyTs('const z = a.mood_score;')).toMatch(/mood_score/);
  });
  it('codeOnlySql', () => {
    expect(codeOnlySql("-- i.archived\nSELECT 1;")).not.toMatch(/archived/);
    expect(codeOnlySql("SELECT i.archived_at;")).toMatch(/archived_at/);
  });
  it('sqlStatementsOnly يزيل السلاسل ويُبقي الاستعلام', () => {
    expect(sqlStatementsOnly("COMMENT ON X IS 'w.mood_score خطأ';"))
      .not.toMatch(/mood_score/);
    expect(sqlStatementsOnly("SELECT w.mood_score FROM w;")).toMatch(/mood_score/);
    // ★ ولا يبتلع سلسلةً تحوي علامة اقتباس مضاعفة
    expect(sqlStatementsOnly("SELECT 'it''s' , w.score;")).toMatch(/w\.score/);
  });
});

const MIG_CODE = codeOnlySql(MIG);
const PAGE_CODE = codeOnlyTs(PAGE);
const SERVICE_CODE = codeOnlyTs(SERVICE);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في 0345`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

// ═══════════════════════════════════════════════════════════════════
describe('0345 — الأعمدة مُشتقّة من المخطط لا من التخمين', () => {
  /**
   * ★★★ العطل ①: الصفحة رشّحت `e.status === 'active'` وجدول employees
   *   لا يحوي `status`. الحارس يستخرج أعمدة الجدول من المايجريشن
   *   المُنشئ ويطالب بغياب `status` ووجود `is_active`.
   */
  it('★★★ employees: is_active موجود و status غائب', () => {
    // ★ employees يُنشأ في 0001_core_schema.sql — و**بلا بادئة public.**
    //   (`CREATE TABLE IF NOT EXISTS employees (`). النسخة الأولى من هذا
    //   الاختبار بحثت عن `public.employees` في ملف باسم مختلف فسقطت —
    //   خطأ في الاختبار لا في الشيفرة.
    const all = read('supabase/migrations/0001_core_schema.sql');
    const m = all.match(/CREATE TABLE IF NOT EXISTS (?:public\.)?employees\s*\(([\s\S]*?)\n\);/);
    expect(m, 'تعريف employees غير موجود في 0001_core_schema').toBeTruthy();
    const body = m![1];
    expect(body, 'employees يحوي is_active').toMatch(/\bis_active\b/);
    // ★ تأكيد موجب على الغياب: لا سطر يبدأ بـstatus
    expect(
      /^\s*status\s+/m.test(body),
      'employees صار يحوي عمود status — راجع منطق activeEmployees',
    ).toBe(false);
  });

  /**
   * ★★★ العطل ②: `w.mood_score` — عمود غير موجود في المخطط كلّه.
   */
  it('★★★ wellness_entries: score موجود و mood_score غائب', () => {
    const m = SCHEMA.match(/CREATE TABLE IF NOT EXISTS public\.wellness_entries\s*\(([\s\S]*?)\n\);/);
    expect(m, 'تعريف wellness_entries غير موجود').toBeTruthy();
    const body = m![1];
    expect(body).toMatch(/\bscore\s+INTEGER\b/);
    expect(body).toMatch(/\bmood\s+VARCHAR\b/);
    expect(body.includes('mood_score'), 'mood_score صار موجوداً').toBe(false);
  });

  it('★★★ ولا ذكر لـmood_score في الشيفرة كلها', () => {
    expect(PAGE_CODE.includes('mood_score'), 'الصفحة تستعمل mood_score').toBe(false);
    expect(SERVICE_CODE.includes('mood_score'), 'الخدمة تستعمل mood_score').toBe(false);
    /**
     * ★ في المايجريشن، `mood_score` يظهر داخل نصّ COMMENT الذي **يشرح
     *   العطل** — وهذا مطلوب لا ممنوع (درس 0344: حظر ذكر العطل يمنع
     *   توثيقه). نحرس الاستعمال الفعلي: لا `w.mood_score` كمرجع عمود.
     */
    expect(
      sqlStatementsOnly(MIG).includes('mood_score'),
      'المايجريشن يقرأ mood_score في استعلام فعليّ',
    ).toBe(false);
    expect(MIG.includes('mood_score'), 'التوثيق يجب أن يشرح العمود الخاطئ').toBe(true);
  });

  /**
   * ★★★ العطل ③: reported_by → profiles منذ 0008 لا employees.
   */
  it('★★★ incidents.reported_by يشير إلى profiles', () => {
    expect(FIX0008).toMatch(
      /incidents_reported_by_profiles_fkey[\s\S]*?REFERENCES public\.profiles\(id\)/,
    );
    // والتعريف الأصلي في 0003 كان employees — نثبت أن 0008 أسقطه
    expect(SCHEMA).toMatch(/reported_by UUID REFERENCES public\.employees\(id\)/);
    expect(FIX0008).toMatch(/DROP CONSTRAINT IF EXISTS incidents_reported_by_fkey/);
  });

  it('★★★ والمايجريشن يربطه بـuser_id لا id', () => {
    const b = fnBody('hr_dashboard_departments');
    expect(b).toMatch(/e3\.user_id = i\.reported_by/);
    expect(b).not.toMatch(/e3\.id = i\.reported_by/);
  });

  /**
   * ★★★ العطل ④: 'escalated' يمنعها قيد CHECK.
   */
  it("★★★ 'escalated' ليست حالة مشروعة", () => {
    const m = SCHEMA.match(/status VARCHAR\(20\) NOT NULL DEFAULT 'pending'\s*\n\s*CHECK \(status IN \(([^)]*)\)\)/);
    expect(m, 'قيد حالة incidents غير موجود').toBeTruthy();
    expect(m![1]).not.toMatch(/escalated/);
    expect(m![1]).toMatch(/pending/);
    expect(m![1]).toMatch(/closed/);
  });

  it('★★★ ولا ذكر لـescalated في الشيفرة', () => {
    expect(PAGE_CODE.includes('escalated'), 'الصفحة ما زالت تعدّ escalated').toBe(false);
    expect(SERVICE_CODE.includes('escalated')).toBe(false);
  });

  /**
   * ★★★ درس هذه الجولة: كتبتُ `i.archived` والعمود `archived_at`،
   *   و**المايجريشن طُبِّق بنجاح** لأن PL/pgSQL لا يفحص أجسام
   *   الاستعلامات عند الإنشاء.
   */
  it('★★★ عمود الأرشفة هو archived_at لا archived', () => {
    expect(MIG_CODE).toMatch(/i\.archived_at IS NULL/);
    // تأكيد موجب: لا `i.archived` مجرّداً (بلا _at)
    expect(/i\.archived(?!_at)\b/.test(MIG_CODE), 'المايجريشن يستعمل i.archived').toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0345 — الصفحة لم تعد تُجمّع في المتصفح', () => {
  it('★★★ تمرّ عبر hrDashboardService', () => {
    expect(PAGE_CODE).toMatch(/hrDashboardService\.summary\(\)/);
    expect(PAGE_CODE).toMatch(/hrDashboardService\.departments\(/);
    expect(PAGE_CODE).toMatch(/hrDashboardService\.monthlyTrend\(/);
    expect(PAGE_CODE).toMatch(/hrDashboardService\.wellnessTrend\(/);
  });

  it('★★★ ولم تعد تجلب كل الموظفين والعافية', () => {
    expect(PAGE_CODE).not.toMatch(/employeeService\.findAll/);
    expect(PAGE_CODE).not.toMatch(/wellnessEntryService\.findAllEntries/);
    expect(PAGE_CODE).not.toMatch(/departmentService\.findAll/);
  });

  it('★★★ ولا جلب بلاغات بلا حدّ', () => {
    // كان incidentService.findAll() عارياً — الآن بحدّ صريح
    expect(/incidentService\.findAll\(\s*\)/.test(PAGE_CODE)).toBe(false);
  });

  it("★★★ «معدل الرضا 85%» المُختلَق أُزيل", () => {
    expect(PAGE_CODE.includes('satisfactionRate')).toBe(false);
    expect(PAGE_CODE).toMatch(/wellnessSamples/);
  });

  it('★★★ واتجاهات KPI المُختلَقة أُزيلت', () => {
    // كانت trend="+2" · "-1" · "+5" · "-2" ثوابت مكتوبة يدوياً
    expect(/trend="[+-]\d+"/.test(PAGE_CODE), 'ما زال ثمة اتجاه ثابت').toBe(false);
  });

  it('★★ ولا 75 مُختلَقة للأقسام الفارغة', () => {
    expect(PAGE_CODE).not.toMatch(/wellnessCount > 0 \? .* : 75/);
  });

  it('★ لا confirm/alert/prompt · لا as any', () => {
    expect(PAGE_CODE).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
  });

  it('★★ ولا تلمس Supabase مباشرة', () => {
    expect(PAGE_CODE).not.toMatch(/\.from\('[a-z_]+'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0345 — المؤشّرات', () => {
  const b = fnBody('hr_dashboard_summary');

  it('★★★ active يرشّح is_active', () => {
    expect(b).toMatch(/count\(\*\) FILTER \(WHERE is_active\)/);
  });

  it('★★★ العافية من العمود score', () => {
    expect(b).toMatch(/SELECT w\.score/);
    expect(b).toMatch(/round\(avg\(score\)\)/);
  });

  it('★★ وبنافذة 30 يوماً لا كل التاريخ', () => {
    expect(b).toMatch(/w\.date >= current_date - INTERVAL '30 days'/);
  });

  it('★★ وعدد العيّنات مُعاد (سياق المتوسط)', () => {
    expect(b).toMatch(/\(SELECT count\(\*\)::INTEGER FROM well\)/);
  });

  it('★★★ الحرجة المفتوحة وحدها', () => {
    expect(b).toMatch(
      /WHERE severity = 'critical' AND status IN \('pending','in_progress'\)/,
    );
  });

  it('★★★ وغير المُسنَدة المفتوحة وحدها', () => {
    expect(b).toMatch(
      /WHERE assigned_to IS NULL AND status IN \('pending','in_progress'\)/,
    );
  });

  it('★★ resolved_month بحدّ الشهر', () => {
    expect(b).toMatch(/updated_at >= date_trunc\('month', current_date\)/);
  });

  it('★★ المؤرشَف مُستبعَد', () => {
    expect(b).toMatch(/i\.archived_at IS NULL/);
  });

  it('★★ مقيّد بالمستأجر', () => {
    expect(b).toMatch(/e\.tenant_id = v_tenant/);
    expect(b).toMatch(/i\.tenant_id = v_tenant/);
  });

  it('★★ صفّ أصفار بلا مستأجر (لا NaN)', () => {
    expect(b).toMatch(/RETURN QUERY SELECT 0,0,0,0,0,0,0,0,0,0,0,0,0;/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0345 — الأقسام', () => {
  const b = fnBody('hr_dashboard_departments');

  it('★★★ ثلاثة مسارات لنسبة البلاغ إلى قسم', () => {
    expect(b).toMatch(/i\.department_id,/);
    expect(b).toMatch(/e2\.id = i\.employee_id/);
    expect(b).toMatch(/e3\.user_id = i\.reported_by/);
  });

  it('★★★ العافية تُجمَّع لكل موظف أولاً', () => {
    expect(b).toMatch(/GROUP BY e\.department_id, e\.id\b/);
    expect(b).toMatch(/avg\(emp_avg\)/);
  });

  it('★★★ القسم الفارغ يعود صفراً لا 75', () => {
    expect(b).toMatch(/COALESCE\(round\(avg\(emp_avg\)\)::INTEGER, 0\)/);
    expect(b).not.toMatch(/COALESCE\(round\(avg\(emp_avg\)\)::INTEGER, 75\)/);
  });

  it('★★ name_ar لا name', () => {
    expect(b).toMatch(/d\.name_ar/);
  });

  it('★★ الحدّ يُقصّ', () => {
    expect(b).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 20\), 1\), 200\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0345 — الاتجاه الشهري', () => {
  const b = fnBody('hr_dashboard_monthly_trend');

  it('★★★ حدود زمنية حقيقية لا getMonth', () => {
    expect(b).toMatch(/i\.created_at >= m\.m_start/);
    expect(b).toMatch(/i\.created_at <\s+\(m\.m_start \+ INTERVAL '1 month'\)/);
    // ★ لا ترشيح بالشهر مجرّداً عن السنة
    expect(b).not.toMatch(/EXTRACT\(MONTH FROM i\.created_at\)/);
  });

  it('★★ الأشهر الفارغة تظهر (generate_series)', () => {
    expect(b).toMatch(/generate_series\(/);
  });

  it('★★ والترتيب تصاعدي', () => {
    expect(b).toMatch(/ORDER BY m\.m_start;/);
  });

  it('★ الحدّ يُقصّ', () => {
    expect(b).toMatch(/LEAST\(GREATEST\(COALESCE\(p_months, 6\), 1\), 36\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0345 — اتجاه العافية', () => {
  const b = fnBody('hr_dashboard_wellness_trend');

  it('★★★ اليوم الفارغ يعود NULL لا صفر', () => {
    // لا COALESCE على درجة اليوم
    expect(b).not.toMatch(/COALESCE\(round\(avg\(w\.score\)\)::INTEGER, 0\)/);
    expect(b).toMatch(/\(SELECT round\(avg\(w\.score\)\)::INTEGER/);
  });

  it('★★ والخدمة لا تحوّل null إلى 0', () => {
    expect(SERVICE_CODE).toMatch(/w\.out_score === null \? null : Number\(w\.out_score\)/);
  });

  it('★★ مقيّد بالمستأجر', () => {
    expect(b).toMatch(/e\.tenant_id = v_tenant/);
  });

  it('★ الحدّ يُقصّ', () => {
    expect(b).toMatch(/LEAST\(GREATEST\(COALESCE\(p_days, 7\), 1\), 90\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0345 — الأمان', () => {
  const FNS = [
    'hr_dashboard_summary()',
    'hr_dashboard_departments(INTEGER)',
    'hr_dashboard_monthly_trend(INTEGER)',
    'hr_dashboard_wellness_trend(INTEGER)',
  ];

  it.each(FNS)('★★ anon محروم من %s', (sig) => {
    expect(MIG).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM anon;`);
  });

  it.each(FNS)('★ authenticated ممنوح %s', (sig) => {
    expect(MIG).toContain(`GRANT EXECUTE ON FUNCTION public.${sig}`);
  });

  it('★★★ كلها INVOKER — RLS هو الحارس', () => {
    const defCount = (MIG_CODE.match(/SECURITY DEFINER/g) || []).length;
    expect(defCount, 'دالة لوحة تعمل DEFINER تتجاوز RLS').toBe(0);
    const invCount = (MIG_CODE.match(/SECURITY INVOKER/g) || []).length;
    expect(invCount).toBe(4);
  });

  it('★★ search_path مثبَّت على الأربع', () => {
    expect((MIG_CODE.match(/SET search_path = public/g) || []).length).toBe(4);
  });

  it('★ الفهارس الأربعة', () => {
    for (const ix of [
      'idx_incidents_tenant_created',
      'idx_incidents_tenant_status_sev',
      'idx_wellness_emp_date',
      'idx_employees_tenant_dept',
    ]) {
      expect(MIG).toContain(ix);
    }
  });
});
