/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0352 — إدارة الدورات والشهادات
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج: **لا نقارن الدالة بنفسها.** الأعطال هنا تعارضٌ بين ما
 *   تكتبه/تقرؤه الشيفرة وما يُصرّح به المخطط — فالحارس مقارنة مصدرين
 *   مستقلّين: تعريف الجدول من مايجريشن المخطط ⇔ الحقول المستعملة.
 *
 *   السلوك مُختبَر في `tools/dev/verify-training-management-0352.sql`
 *   (53 تأكيداً) وعُكِس في `_invert_0352.py` (21/21 + 2 EQUIVALENT مُثبَتان).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0352_training_management_integrity.sql');
const SERVICE = read('src/services/sdk/TrainingManagementService.ts');
const PAGE    = read('src/pages/hr/TrainingManagementPage.tsx');

const codeTs  = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* rich_content */ const x=1;')).not.toMatch(/rich_content/);
    expect(codeTs('const y = c.rich_content;')).toMatch(/rich_content/);
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

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT توثيقي`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

const FNS = [
  'training_course_upsert',
  'training_certifications',
  'training_certification_upsert',
  'training_management_summary',
];

/** نصّ كل المايجريشنات السابقة — مصدر مستقلّ عن 0352 */
const priorMigrations = (): string =>
  readdirSync(resolve(root, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql') && f < '0352')
    .map((f) => read(`supabase/migrations/${f}`))
    .join('\n');

// ═══════════════════════════════════════════════════════════════════
describe('0352 — العطل ①: أعمدة الكتابة المعدومة', () => {
  it('★★★ courses لا يحوي active ولا rich_content', () => {
    const files = priorMigrations();
    const i = files.search(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?courses\s*\(/);
    expect(i, 'تعريف courses غير موجود').toBeGreaterThan(-1);
    const body = files.slice(i, files.indexOf(');', i));
    expect(body, 'العمود status مفقود').toMatch(/\bstatus\s+VARCHAR/i);
    expect(body, 'العمود active صار موجوداً').not.toMatch(/^\s*active\s+BOOLEAN/im);
    expect(body, 'العمود rich_content صار موجوداً').not.toMatch(/\brich_content\b/);
  });

  /**
   * ★★ تحديث 0353 — تصحيح معلن:
   *   كان هذا التأكيد يمنع `rich_content` لأنه **عمود معدوم** حينها.
   *   وقد أُضيف فعلياً في 0353 (`courses.rich_content JSONB` بقيد شكل)
   *   ووُصِّل عبر `p_rich_content` ⇒ التبويب لم يعد يحفظ في الفراغ.
   *   فالمنع صار يمنع قراءة عمود حقيقي.
   *
   *   يبقى المنع على `active` — لم يُضَف عمداً، الموجود `status`.
   */
  it('★★★ الصفحة لم تعد تكتب active (العمود المعدوم الباقي)', () => {
    // النصّ الأصلي حرفياً: active: data.active ?? true,
    expect(PAGE_CODE).not.toMatch(/active:\s*data\.active/);
    expect(PAGE_CODE).not.toMatch(/\bc\.active\b/);
  });

  it('★★★ rich_content صار يُكتب ويُقرأ من مصدره (0353)', () => {
    expect(PAGE_CODE, 'القراءة ما زالت من الفراغ').toMatch(/c\.rich_content \?\?/);
    expect(PAGE_CODE, 'التبويب ما زال يحفظ في الفراغ').toMatch(/richContent:/);
  });

  it('★★★ الصفحة لم تعد تستعمل مسارات الكتابة المكسورة', () => {
    expect(PAGE_CODE).not.toMatch(/courseService\.createCourse/);
    expect(PAGE_CODE).not.toMatch(/courseService\.updateCourse/);
    expect(PAGE_CODE).not.toMatch(/courseService\.toggleActive/);
    expect(PAGE_CODE).not.toMatch(/courseService\.deleteCourse/);
    expect(PAGE_CODE).toMatch(/trainingManagementService\.upsertCourse/);
  });

  it('الدالة تكتب أعمدة موجودة فقط', () => {
    const body = stmtSql(fnBody('training_course_upsert'));
    const insert = body.slice(body.indexOf('INSERT INTO public.courses'),
                              body.indexOf('RETURNING id INTO v_id'));
    expect(insert).toMatch(/\bstatus\b/);
    expect(insert, 'ما زال يكتب active').not.toMatch(/[(,]\s*active\s*[,)]/);
    // ★★ هذا الملف يقرأ مايجريشن **0352** حيث لم يكن العمود موجوداً
    //   بعد. النسخة التي تكتب rich_content مُعرَّفة في 0353 (تُسقط
    //   هذه وتُنشئها بتوقيع أوسع)، ويحرسها
    //   `trainingColumnsContract.test.ts`.
    //   ★ الدرس المُتكرّر: حارسُ جولةٍ يفحص ملفَّ جولته وحده.
    expect(insert, '0352 لم يكن يعرف العمود').not.toMatch(/rich_content/);
  });

  it('التعديل محصور بمستأجر المستدعي', () => {
    const body = stmtSql(fnBody('training_course_upsert'));
    expect(body).toMatch(/WHERE c\.id = p_id AND c\.tenant_id = v_tenant/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0352 — العطل ②: أعمدة الشهادات', () => {
  it('★★★ الجدول فيه certification_name/issued_by لا title/issuer', () => {
    const files = priorMigrations();
    const i = files.search(
      /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?employee_certifications/);
    expect(i, 'تعريف employee_certifications غير موجود').toBeGreaterThan(-1);
    const body = files.slice(i, files.indexOf(');', i));
    expect(body).toMatch(/certification_name/);
    expect(body).toMatch(/issued_by/);
    expect(body).toMatch(/expiry_date/);
    // ولا عمود اعتماد إطلاقاً
    expect(body, 'العمود approved صار موجوداً').not.toMatch(/\bapproved\b/);
  });

  it('★★★ الصفحة لم تعد تقرأ الأعمدة الخاطئة', () => {
    expect(PAGE_CODE).not.toMatch(/cert\.title/);
    expect(PAGE_CODE).not.toMatch(/cert\.issuer/);
    expect(PAGE_CODE).not.toMatch(/employee_email/);
    expect(PAGE_CODE).not.toMatch(/convertRowToCert/);
    expect(PAGE_CODE).toMatch(/cert\.certification_name/);
    expect(PAGE_CODE).toMatch(/cert\.issued_by/);
  });

  it('الدالة تقرأ الأعمدة الحقيقية', () => {
    const body = stmtSql(fnBody('training_certifications'));
    expect(body).toMatch(/ec\.certification_name/);
    expect(body).toMatch(/ec\.issued_by/);
    expect(body).toMatch(/ec\.expiry_date/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0352 — العطل ③: لا «معتمدة» ثابتة', () => {
  it('★★★ approved:true اختفى من الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/approved:\s*true/);
    expect(PAGE_CODE).not.toMatch(/c\.approved/);
    expect(PAGE_CODE).not.toMatch(/approval_date/);
  });

  it('★★★ «معتمدة» الثابتة استُبدلت بحالة محسوبة', () => {
    // كان: <CheckCircle/> معتمدة  — لكل صفّ بلا استثناء
    expect(PAGE_CODE).toMatch(/cert\.validity/);
    expect(PAGE_CODE).toMatch(/منتهية/);
    expect(PAGE_CODE).toMatch(/تنتهي قريباً/);
  });

  it('المؤشّر يحسب الصلاحية لا يعدّ الكلّ', () => {
    const body = stmtSql(fnBody('training_management_summary'));
    expect(body).toMatch(/expiry_date IS NULL OR ec\.expiry_date > CURRENT_DATE \+ 30/);
    expect(body).toMatch(/ec\.expiry_date < CURRENT_DATE/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0352 — العطل ④: انتهاء الصلاحية', () => {
  it('★★★ التصنيف الرباعي موجود', () => {
    const body = codeSql(fnBody('training_certifications'));
    for (const v of ['بلا انتهاء', 'منتهية', 'تنتهي قريباً', 'سارية']) {
      expect(body, `التصنيف «${v}» مفقود`).toContain(v);
    }
  });

  it('أيام الانتهاء محسوبة من الفرق لا ثابتة', () => {
    const body = stmtSql(fnBody('training_certifications'));
    expect(body).toMatch(/ec\.expiry_date - CURRENT_DATE/);
  });

  it('★★★ الترتيب يضع المنتهية أولاً', () => {
    const body = stmtSql(fnBody('training_certifications'));
    const order = body.slice(body.indexOf('ORDER BY'));
    expect(order).toMatch(/expiry_date < CURRENT_DATE THEN 0/);
  });

  it('الصفحة تعرض عدّاد الشهادات المنتهية', () => {
    expect(PAGE_CODE).toMatch(/expiredCerts/);
    expect(PAGE_CODE).toMatch(/شهادات منتهية/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0352 — العطل ⑤: اسم الموظف', () => {
  it('★★★ سلسلة احتياطية — full_name_ar و email فارغان', () => {
    const body = codeSql(fnBody('training_certifications'));
    expect(body).toMatch(/full_name_ar/);
    expect(body).toMatch(/concat_ws\(' ', e\.first_name, e\.last_name\)/);
    expect(body).toMatch(/p\.full_name/);
  });

  it('الصفحة لم تعد تبني empMap يدوياً من أعمدة NULL', () => {
    expect(PAGE_CODE).not.toMatch(/empMap/);
    expect(PAGE_CODE).not.toMatch(/full_name_ar/);
    expect(PAGE_CODE).not.toMatch(/orderBy:\s*'full_name_ar'/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0352 — الأمان والحدود', () => {
  it('الدوال الأربع DEFINER · search_path', () => {
    for (const fn of FNS) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(body, `${fn}: بلا search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('★★★ القارئة STABLE والكاتبة VOLATILE', () => {
    for (const fn of ['training_certifications', 'training_management_summary']) {
      expect(fnBody(fn), `${fn}: ليست STABLE`).toMatch(/\bSTABLE\b/);
    }
    for (const fn of ['training_course_upsert', 'training_certification_upsert']) {
      expect(fnBody(fn), `${fn}: ليست VOLATILE`).toMatch(/\bVOLATILE\b/);
    }
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

  it('★★★ الشهادة لا تُنسب لموظف أجنبي', () => {
    const body = stmtSql(fnBody('training_certification_upsert'));
    expect(body).toMatch(/FROM public\.employees e\s+WHERE e\.id = p_employee_id AND e\.tenant_id = v_tenant/);
  });

  it('★★★ النطاق المعكوس محروس (انتهاء قبل إصدار)', () => {
    const body = codeSql(fnBody('training_certification_upsert'));
    expect(body).toMatch(/p_expiry_date < p_issue_date/);
  });

  it('حدود الإنشاء محروسة', () => {
    const body = codeSql(fnBody('training_course_upsert'));
    expect(body, 'عنوان فارغ').toMatch(/عنوان الدورة مطلوب/);
    expect(body, 'نقاط سالبة').toMatch(/p_points, 0\) < 0/);
    expect(body, 'حالة غير مسموحة').toMatch(/'active','inactive','archived'/);
    expect(body, 'مستوى غير مسموح').toMatch(/'مبتدئ','متوسط','متقدم','خبير'/);
  });

  it('DROP صريح قبل كل CREATE', () => {
    for (const fn of FNS) {
      expect(MIG_CODE).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    }
    expect(MIG_CODE).not.toMatch(/CREATE OR REPLACE FUNCTION public\.training_/);
  });

  it('GRANT لـ authenticated على الأربع', () => {
    for (const fn of FNS) {
      expect(MIG_CODE, `${fn}: لا GRANT`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\)\\s*\\n?\\s*TO authenticated`));
    }
  });

  it('★★★ لا حذف نهائي في المايجريشن', () => {
    expect(MIG_STMT).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(MIG_STMT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(MIG_STMT).not.toMatch(/\bTRUNCATE\b/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0352 — حدود الطبقات والنظافة', () => {
  it('★★★ الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('الخدمة تستدعي الدوال الأربع', () => {
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
describe('0352 — أدوات التحقق', () => {
  it('الملفات موجودة', () => {
    for (const f of [
      'tools/dev/verify-training-management-0352.sql',
      'tools/dev/verify-training-management-0352-rls.sh',
      'tools/dev/_invert_0352.py',
    ]) {
      expect(existsSync(resolve(root, f)), `${f} مفقود`).toBe(true);
    }
  });

  it('ملف التحقق يحمل حرّاس SENTINEL للأعطال', () => {
    const v = read('tools/dev/verify-training-management-0352.sql');
    for (const s of ['SENTINEL_U1', 'SENTINEL_T2', 'SENTINEL_T4',
                     'SENTINEL_S2', 'SENTINEL_S3', 'SENTINEL_C4', 'SENTINEL_T11']) {
      expect(v, `الحارس ${s} مفقود`).toContain(s);
    }
    expect(v).toContain('ROLLBACK');
  });

  it('★★★ العيّنة تتحقّق من فرضيتها قبل القياس', () => {
    // full_name_ar و email فارغان — لو امتلآ لبطل اختبار العطل ⑤
    const v = read('tools/dev/verify-training-management-0352.sql');
    expect(v).toMatch(/SENTINEL_PRE1/);
    expect(v).toMatch(/SENTINEL_PRE2/);
  });

  it('★★★ سكربت العكس يتحقق أن الاستبدال طابق', () => {
    const inv = read('tools/dev/_invert_0352.py');
    expect(inv).toMatch(/if old not in original/);
    expect(inv).toMatch(/NO_MATCH/);
    expect(inv).toMatch(/assert broken != original/);
    expect(inv).toMatch(/SURVIVED/);
  });

  it('★★★ العكوس المُكافئة مُوثَّقة بإثباتها', () => {
    const inv = read('tools/dev/_invert_0352.py');
    expect(inv).toMatch(/EQUIVALENT_INVERSIONS/);
    expect(inv).toMatch(/الفارق رسالة الخطأ فقط/);
  });
});
