/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0351 — تقارير التدريب
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج: **لا نقارن الدالة بنفسها.** الأعطال هنا تعارضٌ بين ما
 *   تقرؤه الشيفرة وما يُصرّح به المخطط — فالحارس مقارنة مصدرين
 *   مستقلّين: تعريف الجدول من مايجريشن المخطط ⇔ الحقول المقروءة.
 *
 *   السلوك مُختبَر في `tools/dev/verify-training-reports-0351.sql`
 *   (57 تأكيداً) وعُكِس في `_invert_0351.py` (20/20 + 1 EQUIVALENT مُثبَت).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0351_training_reports_real_metrics.sql');
const SERVICE = read('src/services/sdk/TrainingReportsService.ts');
const TRSVC   = read('src/services/sdk/TrainingService.ts');
const PAGE    = read('src/pages/hr/TrainingReportsPage.tsx');
const MGMT    = read('src/pages/hr/TrainingManagementPage.tsx');

const codeTs  = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* progress_percent */ const x=1;')).not.toMatch(/progress_percent/);
    expect(codeTs('const y = p.progress_percent;')).toMatch(/progress_percent/);
  });
  it('stmtSql', () => {
    expect(stmtSql("COMMENT ON X IS 'active مذكور';")).not.toMatch(/active/);
    expect(stmtSql('SELECT c.status FROM courses;')).toMatch(/status/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);
const TR_CODE   = codeTs(TRSVC);
const MGMT_CODE = codeTs(MGMT);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT توثيقي`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

const FNS = [
  'training_course_stats',
  'training_monthly_trend',
  'training_department_stats',
  'training_participants',
  'training_course_set_status',
];

// ═══════════════════════════════════════════════════════════════════
describe('0351 — العطل ①: الأعمدة الوهمية', () => {
  /**
   * ★★★ مصدر مستقلّ: تعريف الجدولين من مايجريشن المخطط الأصلي.
   */
  it('★★★ course_progress لا يحوي progress_percent/score/time_spent', () => {
    const files = readdirSync(resolve(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f < '0351')
      .map((f) => read(`supabase/migrations/${f}`))
      .join('\n');

    const i = files.search(
      /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?course_progress/);
    expect(i, 'تعريف course_progress غير موجود').toBeGreaterThan(-1);
    const body = files.slice(i, files.indexOf(');', i));

    // العمود الموجود
    expect(body, 'العمود progress مفقود').toMatch(/\bprogress\s+(NUMERIC|DECIMAL|INTEGER)/i);
    // والأعمدة المعدومة
    for (const ghost of ['progress_percent', 'score', 'time_spent', 'last_access_at']) {
      expect(body, `العمود ${ghost} صار موجوداً — راجع الادعاء`)
        .not.toMatch(new RegExp(`\\b${ghost}\\b`));
    }
  });

  it('★★★ courses يحوي status لا active', () => {
    const files = readdirSync(resolve(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f < '0351')
      .map((f) => read(`supabase/migrations/${f}`))
      .join('\n');
    const i = files.search(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?courses\s*\(/);
    expect(i).toBeGreaterThan(-1);
    const body = files.slice(i, files.indexOf(');', i));
    expect(body).toMatch(/\bstatus\s+VARCHAR/i);
    expect(body, 'العمود active صار موجوداً').not.toMatch(/^\s*active\s+BOOLEAN/im);
  });

  /**
   * ★★ تحديث 0353 — تصحيح معلن:
   *   كان هذا التأكيد يمنع `.score` و`avgScore` و`time_spent` لأنها
   *   **أعمدة معدومة** حينها. وقد أُضيفت فعلياً في مايجريشن 0353
   *   بقرار المستخدم «اضف الاعمده التي نحتاجها».
   *   فالمنع لم يعد صحيحاً — بل صار يمنع قراءة عمود حقيقي.
   *
   *   يبقى المنع على ما لم يُضَف عمداً:
   *     `progress_percent` — اسم مكرّر لعمود `progress` القائم،
   *       إضافته تُنشئ مصدرَي حقيقة متعارضين.
   *     `courses.active`   — الموجود `status`.
   *
   *   ★ والحارس الأهمّ انتقل إلى `trainingColumnsContract.test.ts`:
   *     أن تبقى `NULL` حيّة ولا تُحوَّل صفراً.
   */
  it('★★★ الأعمدة التي لم تُضَف ما زالت ممنوعة', () => {
    expect(PAGE_CODE, 'progress_percent ما زال يُقرأ')
      .not.toMatch(/\bprogress_percent\b/);
    expect(PAGE_CODE).not.toMatch(/\bcourse\.active\b/);
    expect(PAGE_CODE).not.toMatch(/\bc\.active\b/);
  });

  it('★★★ أعمدة 0353 تُقرأ من مصدرها مع حفظ تمييز «لم يُختبَر»', () => {
    expect(PAGE_CODE, 'الدرجة لا تُعرض').toMatch(/\bscore\b/);
    expect(PAGE_CODE, 'وقت الدراسة لا يُعرض').toMatch(/timeSpent/);
    expect(PAGE_CODE, 'آخر وصول لا يُعرض').toMatch(/lastAccessAt/);
    expect(PAGE_CODE).toMatch(/score === null/);
    expect(PAGE_CODE).toMatch(/لم يُختبَر/);
  });

  it('الدالة تقرأ progress و status الحقيقيين', () => {
    const body = stmtSql(fnBody('training_course_stats'));
    expect(body).toMatch(/avg\(progress\)/);
    expect(body).toMatch(/c\.status::TEXT/);
    expect(body).not.toMatch(/progress_percent/);
    expect(body).not.toMatch(/c\.active/);
  });

  it('الصفحة تستعمل avgProgress من الخدمة', () => {
    expect(PAGE_CODE).toMatch(/avgProgress/);
    expect(SVC_CODE).toMatch(/out_avg_progress/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — العطل ②: التصدير يُصدِّر فعلاً', () => {
  it('★★★ لا رسالة كاذبة بلا ملف', () => {
    // النصّ الأصلي حرفياً: addToast('تم تحميل التقرير بصيغة PDF', 'success')
    expect(PAGE_CODE).not.toMatch(/تم تحميل التقرير بصيغة PDF/);
  });

  it('التصدير يستدعي مولّد ملف حقيقياً', () => {
    expect(PAGE_CODE).toMatch(/exportToStyledExcel/);
    expect(PAGE_CODE).toMatch(/from '\.\.\/\.\.\/utils\/exportToExcel'/);
  });

  it('التصدير يحرس الحالة الفارغة', () => {
    expect(PAGE_CODE).toMatch(/لا بيانات لتصديرها/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — العطل ③: مُرشِّح المدة يعمل', () => {
  it('★★★ timeRange يُقرأ لا يُضبَط فقط', () => {
    // كان موضعان فقط: useState و onChange
    const uses = (PAGE_CODE.match(/timeRange/g) || []).length;
    expect(uses, 'timeRange يُستعمل في موضعين فقط — أي أنه زينة')
      .toBeGreaterThan(3);
    expect(PAGE_CODE).toMatch(/RANGES\[timeRange\]/);
  });

  it('النطاق يُمرَّر إلى الخدمة', () => {
    expect(PAGE_CODE).toMatch(/courseStats\(range\.from, range\.to\)/);
    expect(PAGE_CODE).toMatch(/departmentStats\(range\.from, range\.to\)/);
  });

  it('الدالة تُرشّح بالنطاق فعلاً', () => {
    const body = stmtSql(fnBody('training_course_stats'));
    expect(body).toMatch(/p_from IS NULL OR cp\.started_at >= p_from/);
    expect(body).toMatch(/p_to\s+IS NULL OR cp\.started_at <= p_to/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — العطل ④+⑤: لا حذف نهائي ولا عمود معدوم', () => {
  it('★★★ deleteCourse لم يعد يحذف', () => {
    const i = TR_CODE.indexOf('deleteCourse');
    expect(i).toBeGreaterThan(-1);
    const seg = TR_CODE.slice(i, i + 400);
    expect(seg, 'ما زال ينادي this.delete').not.toMatch(/this\.delete\(/);
    expect(seg).toMatch(/throw new Error/);
  });

  it('★★★ toggleActive يكتب status لا active', () => {
    const i = TR_CODE.indexOf('async toggleActive');
    expect(i).toBeGreaterThan(-1);
    const seg = TR_CODE.slice(i, i + 300);
    expect(seg).toMatch(/status:/);
    expect(seg, 'ما زال يكتب { active }').not.toMatch(/\{\s*active\s*\}/);
  });

  it('★★★ صفحة الإدارة تُؤرشف لا تحذف', () => {
    expect(MGMT_CODE).not.toMatch(/courseService\.deleteCourse/);
    expect(MGMT_CODE).toMatch(/setCourseStatus\(courseId, 'archived'\)/);
    expect(MGMT_CODE).not.toMatch(/handleDeleteCourse/);
  });

  it('دالة الحالة تكتب status ولا تحذف شيئاً', () => {
    const body = stmtSql(fnBody('training_course_set_status'));
    expect(body).toMatch(/UPDATE public\.courses/);
    expect(body).toMatch(/SET status = p_status/);
    expect(body, '★★★ حذف داخل دالة الأرشفة').not.toMatch(/DELETE\s+FROM/i);
  });

  it('★★★ لا حذف نهائي في المايجريشن كلّه', () => {
    expect(MIG_STMT).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(MIG_STMT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(MIG_STMT).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('الحالات المسموحة ثلاث فقط', () => {
    const body = codeSql(fnBody('training_course_set_status'));
    expect(body).toMatch(/'active','inactive','archived'/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — العطل ⑥: لا تحليل AI مُصنَّع', () => {
  it('★★★ زرّ «توليد تحليل بالذكاء الاصطناعي» أُزيل', () => {
    expect(PAGE_CODE).not.toMatch(/aiAnalysis/);
    expect(PAGE_CODE).not.toMatch(/handleGenerateAIAnalysis/);
    expect(PAGE_CODE).not.toMatch(/الذكاء الاصطناعي/);
    expect(PAGE_CODE).not.toMatch(/تحليل AI/);
  });

  it('لا سرعة غير طبيعية مشتقّة من عمود معدوم', () => {
    expect(PAGE_CODE).not.toMatch(/avgSecondsPerModule/);
    expect(PAGE_CODE).not.toMatch(/سرعة غير طبيعية/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — العطل ⑦: الأقسام ومن لم يلتحق', () => {
  it('الأقسام من جدول departments لا من نصّ حرّ', () => {
    const body = stmtSql(fnBody('training_department_stats'));
    expect(body).toMatch(/FROM public\.departments d/);
    // القسم يُشتقّ من employees.department_id داخل CTE اسمه emp
    expect(body).toMatch(/SELECT e\.id, e\.department_id/);
    expect(body).toMatch(/JOIN emp e ON e\.id = cp\.employee_id/);
    expect(body).toMatch(/LEFT JOIN emp_cnt/);
  });

  it('★★★ من لم يلتحق بأي دورة يظهر (LEFT JOIN)', () => {
    const body = stmtSql(fnBody('training_participants'));
    expect(body, 'INNER JOIN يُخفي من لم يلتحق')
      .toMatch(/LEFT JOIN public\.course_progress cp/);
    expect(body).toMatch(/WHEN cp\.id IS NULL\s+THEN/);
  });

  it('★★★ سلسلة احتياطية للاسم — full_name_ar فارغ لكل موظف', () => {
    const body = codeSql(fnBody('training_participants'));
    expect(body).toMatch(/full_name_ar/);
    expect(body).toMatch(/concat_ws\(' ', e\.first_name, e\.last_name\)/);
    expect(body).toMatch(/p\.full_name/);
  });

  it('الصفحة تُبرز من لم يلتحق', () => {
    expect(PAGE_CODE).toMatch(/notEnrolled/);
    expect(PAGE_CODE).toMatch(/لم يلتحق بأي دورة/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — الأمان والخصائص', () => {
  it('الدوال الخمس DEFINER · search_path', () => {
    for (const fn of FNS) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(body, `${fn}: بلا search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('★★★ القارئة STABLE والكاتبة VOLATILE', () => {
    for (const fn of FNS.filter((f) => f !== 'training_course_set_status')) {
      expect(fnBody(fn), `${fn}: ليست STABLE`).toMatch(/\bSTABLE\b/);
    }
    expect(fnBody('training_course_set_status')).toMatch(/\bVOLATILE\b/);
  });

  it('كل دالة تُرشّح بالمستأجر وتشترط staff', () => {
    for (const fn of FNS) {
      const body = codeSql(fnBody(fn));
      expect(body, `${fn}: لا يقرأ المستأجر`)
        .toMatch(/v_tenant UUID := public\.current_user_tenant_id\(\)/);
      expect(body, `${fn}: لا يحرس الدور`)
        .toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
      expect(body, `${fn}: لا يحرس المستأجر الفارغ`).toMatch(/IF v_tenant IS NULL THEN/);
      expect(body, `${fn}: لا يُرشّح بالمستأجر`).toMatch(/tenant_id\s*=\s*v_tenant/);
    }
  });

  it('DROP صريح قبل كل CREATE', () => {
    for (const fn of FNS) {
      expect(MIG_CODE).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    }
    expect(MIG_CODE).not.toMatch(/CREATE OR REPLACE FUNCTION public\.training_/);
  });

  it('GRANT لـ authenticated على الخمس', () => {
    for (const fn of FNS) {
      expect(MIG_CODE, `${fn}: لا GRANT`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*TO authenticated`));
    }
  });

  it('★★★ التوقيت Asia/Baghdad صريح في الاتجاه الشهري', () => {
    const body = codeSql(fnBody('training_monthly_trend'));
    expect(body).toMatch(/AT TIME ZONE 'Asia\/Baghdad'/);
    // date_trunc على العمود الخام بلا منطقة = توقيت الخادم (UTC)
    expect(body).not.toMatch(/date_trunc\('month', cp\.started_at\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — حدود الطبقات والنظافة', () => {
  it('★★★ الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
    expect(PAGE_CODE).toMatch(/trainingReportsService/);
  });

  it('الخدمة تستدعي الدوال الخمس', () => {
    for (const fn of FNS) {
      expect(SVC_CODE, `الخدمة لا تستدعي ${fn}`).toContain(`'${fn}'`);
    }
  });

  it('★★★ لا as any ولا confirm/prompt/alert', () => {
    for (const [name, src] of [['الصفحة', PAGE_CODE], ['الخدمة', SVC_CODE]] as const) {
      expect(src, `${name}: as any`).not.toMatch(/\bas\s+any\b/);
      expect(src, `${name}: confirm`).not.toMatch(/\bconfirm\s*\(/);
      expect(src, `${name}: prompt`).not.toMatch(/\bprompt\s*\(/);
      expect(src, `${name}: alert(`).not.toMatch(/(?<![\w.])alert\s*\(/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0351 — أدوات التحقق', () => {
  it('الملفان موجودان', () => {
    for (const f of [
      'tools/dev/verify-training-reports-0351.sql',
      'tools/dev/_invert_0351.py',
    ]) {
      expect(existsSync(resolve(root, f)), `${f} مفقود`).toBe(true);
    }
  });

  it('ملف التحقق يحمل حرّاس SENTINEL للأعطال', () => {
    const v = read('tools/dev/verify-training-reports-0351.sql');
    for (const s of ['SENTINEL_C5', 'SENTINEL_C9', 'SENTINEL_C14',
                     'SENTINEL_P1', 'SENTINEL_P4', 'SENTINEL_A2', 'SENTINEL_D7']) {
      expect(v, `الحارس ${s} مفقود`).toContain(s);
    }
    expect(v).toContain('ROLLBACK');
  });

  it('★★★ سكربت العكس يتحقق أن الاستبدال طابق', () => {
    const inv = read('tools/dev/_invert_0351.py');
    expect(inv).toMatch(/if old not in original/);
    expect(inv).toMatch(/NO_MATCH/);
    expect(inv).toMatch(/assert broken != original/);
    expect(inv).toMatch(/SURVIVED/);
  });

  it('★★★ العكس المُكافئ مُوثَّق بإثباته لا مُخفى', () => {
    // حراسة مزدوجة: تصنيفها EQUIVALENT مشروط بإثبات انعدام الأثر
    const inv = read('tools/dev/_invert_0351.py');
    expect(inv).toMatch(/EQUIVALENT_INVERSIONS/);
    expect(inv).toMatch(/courses_status_check/);
    expect(inv).toMatch(/الفارق رسالة الخطأ فقط/);
  });
});
