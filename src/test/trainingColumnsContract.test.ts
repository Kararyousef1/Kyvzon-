/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0353 — الأعمدة الناقصة في منظومة التدريب
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المبدأ الحاكم الذي يحرسه هذا الملف:
 *
 *   **«لم يُختبَر» ≠ «حصل صفراً».**
 *
 *   إضافة عمود `score` بـ`DEFAULT 0` أو تحويل `NULL` إلى `0` في أي
 *   طبقة يُعيد بالضبط العطل الذي أصلحناه في 0351: متوسط درجات محسوب
 *   على من لم يخضعوا لاختبار أصلاً. لذلك أكثر التأكيدات هنا تحرس
 *   بقاء `NULL` حيّة من القاعدة إلى الشاشة.
 *
 *   السلوك مُختبَر في `tools/dev/verify-training-columns-0353.sql`
 *   (51 تأكيداً) وعُكِس في `_invert_0353.py`
 *   (23/23 + 2 EQUIVALENT مُثبَتان).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0353_training_missing_columns.sql');
const SERVICE = read('src/services/sdk/TrainingReportsService.ts');
const PAGE    = read('src/pages/hr/TrainingReportsPage.tsx');

const codeTs  = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* COALESCE(score,0) */ const x=1;')).not.toMatch(/COALESCE/);
    expect(codeTs('const y = COALESCE(score,0);')).toMatch(/COALESCE/);
  });
  it('stmtSql', () => {
    expect(stmtSql("COMMENT ON X IS 'DEFAULT 0 مذكور';")).not.toMatch(/DEFAULT 0/);
    expect(stmtSql('ALTER TABLE t ALTER COLUMN c SET DEFAULT 0;')).toMatch(/DEFAULT 0/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT توثيقي`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

// ═══════════════════════════════════════════════════════════════════
describe('0353 — الأعمدة أُضيفت', () => {
  it('course_progress: score · time_spent · last_access_at', () => {
    expect(MIG_CODE).toMatch(/ADD COLUMN IF NOT EXISTS score\s+NUMERIC/);
    expect(MIG_CODE).toMatch(/ADD COLUMN IF NOT EXISTS time_spent\s+INTEGER/);
    expect(MIG_CODE).toMatch(/ADD COLUMN IF NOT EXISTS last_access_at\s+TIMESTAMPTZ/);
  });

  it('courses.rich_content بشكل محروس', () => {
    expect(MIG_CODE).toMatch(/ADD COLUMN IF NOT EXISTS rich_content\s+JSONB/);
    expect(MIG_CODE).toMatch(/jsonb_typeof\(rich_content -> 'blocks'\) = 'array'/);
  });

  it('جدول quiz_attempts أُنشئ', () => {
    expect(MIG_CODE).toMatch(/CREATE TABLE IF NOT EXISTS public\.quiz_attempts/);
    expect(MIG_CODE).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('★★★ progress_percent لم يُضَف — لا مصدرَي حقيقة', () => {
    // إضافته تُنشئ عمودين لنفس المعنى وهذا أسوأ من العطل الأصلي
    expect(MIG_STMT).not.toMatch(/ADD COLUMN[^;]*progress_percent/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0353 — ★★★ «لم يُختبَر» ≠ «صفر»', () => {
  it('★★★ score يبقى NULL-able بلا DEFAULT', () => {
    const add = MIG_CODE.slice(MIG_CODE.indexOf('ALTER TABLE public.course_progress'),
                               MIG_CODE.indexOf('COMMENT ON COLUMN'));
    expect(add, 'score صار NOT NULL').not.toMatch(/score\s+NUMERIC\(5,2\)\s+NOT NULL/);
    expect(add, 'score له DEFAULT').not.toMatch(/score\s+NUMERIC\(5,2\)[^,]*DEFAULT/);
  });

  it('★★★ المتوسط لا يُدخل غير المُختبَرين', () => {
    const body = stmtSql(fnBody('training_course_stats'));
    expect(body, 'avg على المُختبَرين وحدهم').toMatch(/round\(avg\(score\), 1\)/);
    // COALESCE(score,0) داخل avg هو العطل نفسه بثوب جديد
    expect(body, '★ COALESCE(score,0) يُفسد المتوسط')
      .not.toMatch(/avg\(COALESCE\(score/);
  });

  it('★★★ count(score) لا count(*) لعدّ المُختبَرين', () => {
    const body = stmtSql(fnBody('training_course_stats'));
    expect(body).toMatch(/count\(score\)::INTEGER\s+AS scored_count/);
  });

  it('★★★ avg_score تعود NULL حين لا عيّنة', () => {
    const body = stmtSql(fnBody('training_course_stats'));
    // COALESCE على avg_score يُحوّل «لا قياس» إلى «صفر»
    expect(body).not.toMatch(/COALESCE\(agg\.avg_score, 0\)/);
  });

  it('★★★ المشاركون: score تصل كما هي', () => {
    const body = stmtSql(fnBody('training_participants'));
    expect(body).not.toMatch(/COALESCE\(cp\.score, 0\)/);
  });

  it('★★★ الخدمة تحفظ NULL ولا تحوّلها صفراً', () => {
    expect(SVC_CODE).toMatch(/nullableNum/);
    expect(SVC_CODE).toMatch(/avgScore:\s+nullableNum\(r\.out_avg_score\)/);
    expect(SVC_CODE).toMatch(/score:\s+nullableNum\(r\.out_score\)/);
    expect(SVC_CODE).not.toMatch(/avgScore:\s+num\(/);
    expect(SVC_CODE).not.toMatch(/score:\s+num\(r\.out_score\)/);
  });

  it('★★★ الصفحة تعرض «—»/«لم يُختبَر» لا صفراً', () => {
    expect(PAGE_CODE).toMatch(/avgScore === null/);
    expect(PAGE_CODE).toMatch(/score === null/);
    expect(PAGE_CODE).toMatch(/لم يُختبَر/);
  });

  it('★★★ التصدير يكتب «لم يُختبَر» لا 0', () => {
    // الصفر في ملف Excel يُقرأ رسوباً
    expect(PAGE_CODE).toMatch(/p\.score === null \? 'لم يُختبَر'/);
    expect(PAGE_CODE).toMatch(/c\.avgScore === null \? 'لم يُختبَر أحد'/);
  });

  it('★★★ المتوسط الكلّي موزون بعدد المُختبَرين', () => {
    // متوسط المتوسطات يظلم الدورة كثيرة المُختبَرين
    expect(PAGE_CODE).toMatch(/c\.avgScore \?\? 0\) \* c\.scoredCount/);
    expect(PAGE_CODE).toMatch(/totalScored/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0353 — القيود تحرس المستحيل', () => {
  it('مدى الدرجة والوقت والتقدّم', () => {
    expect(MIG_CODE).toMatch(/course_progress_score_range/);
    expect(MIG_CODE).toMatch(/score >= 0 AND score <= 100/);
    expect(MIG_CODE).toMatch(/course_progress_time_spent_nonneg/);
    expect(MIG_CODE).toMatch(/course_progress_progress_range/);
  });

  it('قيود محاولات الاختبار', () => {
    expect(MIG_CODE).toMatch(/quiz_attempts_score_range/);
    expect(MIG_CODE).toMatch(/quiz_attempts_duration_nonneg/);
    expect(MIG_CODE).toMatch(/quiz_attempts_number_positive/);
    // محاولة مُسلَّمة بلا درجة سجلّ بلا معنى
    expect(MIG_CODE).toMatch(/quiz_attempts_submitted_has_score/);
    // التسليم لا يسبق البدء
    expect(MIG_CODE).toMatch(/quiz_attempts_time_order/);
    // رقم فريد يمنع التكرار الصامت
    expect(MIG_CODE).toMatch(/quiz_attempts_unique_number/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0353 — الكاتب الفعليّ (لا عمود يتيم)', () => {
  it('★★★ نبضة الوقت تُراكم ولا تستبدل', () => {
    const body = stmtSql(fnBody('training_progress_touch'));
    expect(body).toMatch(/time_spent\s+= cp\.time_spent \+ EXCLUDED\.time_spent/);
  });

  it('★★★ التقدّم لا يتراجع بنبضة متأخّرة', () => {
    const body = stmtSql(fnBody('training_progress_touch'));
    expect(body).toMatch(/GREATEST\(cp\.progress/);
  });

  it('حدّ النبضة يمنع إفساد المتوسطات', () => {
    const body = codeSql(fnBody('training_progress_touch'));
    expect(body).toMatch(/p_seconds > 3600/);
  });

  it('last_access_at يُكتب فعلاً', () => {
    const body = stmtSql(fnBody('training_progress_touch'));
    expect(body).toMatch(/last_access_at = NOW\(\)/);
  });

  it('★★★ أفضل درجة لا آخرها', () => {
    const body = stmtSql(fnBody('training_quiz_submit'));
    expect(body).toMatch(/max\(a\.score\) INTO v_best/);
    expect(body).toMatch(/SET score\s+= v_best/);
  });

  it('★★★ رقم المحاولة يُحسب في القاعدة لا في المتصفح', () => {
    // الحساب في العميل يسبّب سباق تزامن ويكسر القيد الفريد
    const body = stmtSql(fnBody('training_quiz_submit'));
    expect(body).toMatch(/max\(a\.attempt_number\), 0\) \+ 1/);
  });

  it('النجاح يُقاس بـpassing_score', () => {
    const body = stmtSql(fnBody('training_quiz_submit'));
    expect(body).toMatch(/v_passed := p_score >= v_pass/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0353 — التوصيلات الثلاث (لا عمود يتيم في الواجهة)', () => {
  const MYSVC = codeTs(read('src/services/sdk/MyTrainingService.ts'));
  const EMPPAGE = codeTs(read('src/pages/employee/TrainingPage.tsx'));
  const MGMT = codeTs(read('src/pages/hr/TrainingManagementPage.tsx'));

  it('★★★ صفحة الموظف لم تعد تقرأ الأعمدة المعدومة', () => {
    // progress_percent غير موجود · courses.progress غير موجود
    expect(EMPPAGE, 'progress_percent ما زال يُقرأ')
      .not.toMatch(/progress_percent/);
    // course_progress.status غير موجود — الموجود completed
    expect(EMPPAGE).not.toMatch(/progress\?\.status/);
    expect(EMPPAGE, 'raw.status كان يُقارَن بـcompleted')
      .not.toMatch(/raw\.status === 'completed'/);
  });

  it('★★★ الحالة من completed لا من عمود معدوم', () => {
    expect(EMPPAGE).toMatch(/progress\?\.completed/);
    expect(EMPPAGE).toMatch(/progress\?\.progress \?\? 0/);
  });

  it('صفحة الموظف تستعمل خدمة SDK الجديدة', () => {
    expect(EMPPAGE).toMatch(/myTrainingService\.myProgress/);
    expect(EMPPAGE).not.toMatch(/courseProgressService/);
  });

  it('★★★ خدمة الموظف تحفظ NULL للدرجة', () => {
    expect(MYSVC).toMatch(/nullableNum/);
    expect(MYSVC).toMatch(/score:\s+nullableNum/);
  });

  it('الخدمة تستدعي دوال 0353', () => {
    expect(MYSVC).toContain("'training_progress_touch'");
    expect(MYSVC).toContain("'training_quiz_submit'");
    expect(MYSVC).toContain("'training_quiz_attempts'");
  });

  it('★★★ rich_content يُمرَّر ويُقرأ من مصدره', () => {
    expect(MGMT, 'التبويب ما زال يحفظ في الفراغ').toMatch(/richContent:/);
    expect(MGMT, 'القراءة ما زالت من الفراغ').toMatch(/c\.rich_content \?\?/);
    const svc = codeTs(read('src/services/sdk/TrainingManagementService.ts'));
    expect(svc).toMatch(/p_rich_content:\s*input\.richContent \?\? null/);
  });

  it('★★★ الدالة تكتب rich_content و NULL تعني «لا تُغيّر»', () => {
    const body = stmtSql(fnBody('training_course_upsert'));
    expect(body, 'الإنشاء لا يكتب المحتوى').toMatch(/v_rich, NOW\(\), NOW\(\)/);
    expect(body, 'التعديل بـNULL يمحو المحتوى')
      .toMatch(/rich_content\s+= COALESCE\(p_rich_content, c\.rich_content\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0353 — الأمان والخصوصية', () => {
  const FNS = ['training_progress_touch', 'training_quiz_submit',
               'training_quiz_attempts', 'training_course_stats',
               'training_participants'];

  it('كل الدوال DEFINER · search_path', () => {
    for (const fn of FNS) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(body, `${fn}: بلا search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('كل الدوال تُرشّح بالمستأجر', () => {
    for (const fn of FNS) {
      const body = codeSql(fnBody(fn));
      // ★ محاذاة الإعلان تختلف بين الدوال (v_tenant / v_tenant  )
      expect(body, `${fn}: لا يقرأ المستأجر`)
        .toMatch(/v_tenant\s+UUID := public\.current_user_tenant_id\(\)/);
      expect(body, `${fn}: لا يُرشّح بالمستأجر`).toMatch(/tenant_id\s*=\s*v_tenant/);
    }
  });

  it('★★★ موظف لا يقرأ محاولات زميله', () => {
    const body = codeSql(fnBody('training_quiz_attempts'));
    expect(body).toMatch(/p_employee_id <> v_self/);
    expect(body).toMatch(/v_staff OR a\.employee_id = v_self/);
  });

  it('★★★ لا سياسة تعديل ولا حذف للمحاولات', () => {
    // سجلّ اختبار قابل للتعديل بلا قيمة تدقيقية
    expect(MIG_CODE).not.toMatch(/CREATE POLICY[^;]*quiz_attempts[^;]*FOR UPDATE/);
    expect(MIG_CODE).not.toMatch(/CREATE POLICY[^;]*quiz_attempts[^;]*FOR DELETE/);
  });

  it('★★★ لا فرع tenant_id IS NULL (درس 0350)', () => {
    const pol = MIG_CODE.slice(MIG_CODE.indexOf('CREATE POLICY kyvzon_quiz_attempts_select'));
    expect(pol.slice(0, 800)).not.toMatch(/tenant_id IS NULL/);
  });

  it('★★★ لا حذف نهائي في المايجريشن', () => {
    expect(MIG_STMT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(MIG_STMT).not.toMatch(/\bTRUNCATE\b/i);
    expect(MIG_STMT).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0353 — أدوات التحقق', () => {
  it('الملفات موجودة', () => {
    for (const f of [
      'tools/dev/verify-training-columns-0353.sql',
      'tools/dev/verify-training-columns-0353-rls.sh',
      'tools/dev/_invert_0353.py',
    ]) {
      expect(existsSync(resolve(root, f)), `${f} مفقود`).toBe(true);
    }
  });

  it('★★★ الاختبار يحرس المحكّ الأهمّ: 80 لا 40', () => {
    const v = read('tools/dev/verify-training-columns-0353.sql');
    // موظف بـ80 وآخر NULL ⇒ المتوسط 80 لا 40
    expect(v).toContain('SENTINEL_B1');
    expect(v).toContain('SENTINEL_B2');
    expect(v).toMatch(/المتوقَّع 80\.0/);
    expect(v).toMatch(/أُدخل غير المُختبَرين بصفر/);
  });

  it('★★★ العكوس البنيوية منفصلة (DDL لا يُعكَس بإعادة التطبيق)', () => {
    const inv = read('tools/dev/_invert_0353.py');
    expect(inv).toMatch(/DDL_INVERSIONS/);
    expect(inv).toMatch(/if old not in original/);
    expect(inv).toMatch(/assert broken != original/);
    expect(inv).toMatch(/SURVIVED/);
  });

  it('★★★ العكوس المُكافئة مُوثَّقة بإثباتها', () => {
    const inv = read('tools/dev/_invert_0353.py');
    expect(inv).toMatch(/EQUIVALENT_INVERSIONS/);
    expect(inv).toMatch(/course_progress_time_spent_nonneg/);
    expect(inv).toMatch(/quiz_attempts_score_range/);
    expect(inv).toMatch(/courses_rich_content_shape/);
    expect(inv).toMatch(/الفارق رسالة الخطأ فقط/);
  });
});
