/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0362 — سلامة التوظيف
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-recruitment-0362.sql`
 *     — **139** تأكيداً بأرقام محسوبة يدوياً
 *   · العزل مُثبَت في `…-0362-rls.sh` بدور `authenticated` حقيقيّ
 *     — **47** فحصاً
 *   · التغطية مُثبتة في `_invert_0362.py` — **56/56** عكساً أسقط
 *     الاختبار (+4 تكافؤات مُثبتة)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: عمودٌ معدوم يُقرأ
 *   في استعلام · مفردتان لا تلتقيان · مفتاحٌ أجنبيّ يُبيد بالتتالي ·
 *   «تم التوظيف» بلا موظف · نصٌّ إنجليزيّ خام في واجهةٍ عربية.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0362_recruitment_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/RecruitmentPipelineService.ts');
const PAGE    = read('src/pages/hr/RecruitmentPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة (درس 0355) ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs("/* applied_at */ const x=1;")).not.toMatch(/applied_at/);
    expect(codeTs("// job_id\nconst y=1;")).not.toMatch(/job_id/);
    expect(codeTs("const s = app.stage;")).toMatch(/stage/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'submitted مذكور';")).not.toMatch(/submitted/);
    expect(stmtSql("  AND a.status = 'applied'")).toMatch(/a\.status/);
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

const NEW_FNS = [
  'recruitment_board', 'recruitment_applications', 'recruitment_summary',
  'job_posting_upsert', 'application_submit', 'application_set_status',
  'application_hire',
];

const APP_STAGES = ['applied', 'screening', 'interview', 'test', 'offer',
                    'hired', 'rejected', 'withdrawn'];
const POST_STATUSES = ['draft', 'open', 'closed', 'filled', 'cancelled'];
const EMP_TYPES = ['full_time', 'part_time', 'contract', 'temporary'];

/** ★★★ الأعمدة المعدومة التي كانت الصفحة تقرؤها (العطل ①) */
const PHANTOM_COLUMNS = ['job_id', 'applicant_email', 'cv_url', 'applied_at'];

// ═══════════════════════════════════════════════════════════════
describe('0362 — بنية المايجريشن', () => {
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
    //   ⇒ REVOKE عن anon هو الحارس الحقيقيّ لا GRANT.
    const i = MIG_CODE.indexOf(`REVOKE ALL ON FUNCTION public.${fn}(`);
    expect(i, `REVOKE مفقود لـ${fn}`).toBeGreaterThan(-1);
    expect(MIG_CODE.slice(i, i + 700)).toMatch(/FROM anon;/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ①: الأعمدة المعدومة اختفت من الشيفرة', () => {
  it.each(PHANTOM_COLUMNS)('العمود المعدوم %s لم يعد في الصفحة', (col) => {
    expect(PAGE_CODE, `${col} عاد للصفحة`).not.toContain(col);
  });

  it.each(PHANTOM_COLUMNS)('ولا في طبقة SDK: %s', (col) => {
    expect(SVC_CODE, `${col} عاد للخدمة`).not.toContain(col);
  });

  it('★★★ ولا نداء findByJob بعد اليوم', () => {
    expect(PAGE_CODE, 'findByJob عاد').not.toMatch(/findByJob/);
    expect(PAGE_CODE, 'jobApplicationService عاد')
      .not.toMatch(/jobApplicationService|jobPostingService/);
    expect(PAGE_CODE).toMatch(/recruitmentSdk\.applications\(/);
  });

  it('★★ والأعمدة الناقصة أُضيفت في القاعدة', () => {
    for (const col of ['cover_letter', 'reviewed_by', 'reviewed_at',
                       'hired_employee_id', 'rejection_reason', 'rating']) {
      expect(MIG_CODE, `${col} لم يُضَف`)
        .toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`));
    }
  });

  it('★ والقائمة تقرأ الأعمدة الحقيقية', () => {
    const b = fnBody('recruitment_applications');
    expect(b).toMatch(/a\.posting_id/);
    expect(b).toMatch(/a\.email/);
    expect(b).toMatch(/a\.resume_url/);
    expect(b).toMatch(/a\.submitted_at/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ②: مفردةٌ واحدة لحالة الطلب', () => {
  it('CHECK بالمفردات الثماني', () => {
    expect(MIG_CODE).toMatch(/job_applications_status_chk/);
    for (const s of APP_STAGES) {
      expect(MIG_CODE, `المفردة ${s} غائبة`).toContain(`'${s}'`);
    }
  });

  it('★★★ وDEFAULT صار applied لا submitted', () => {
    expect(MIG_CODE).toMatch(
      /ALTER TABLE public\.job_applications ALTER COLUMN status SET DEFAULT 'applied'/);
  });

  it('★★ والمفردة القديمة تُرحَّل لا تبقى', () => {
    expect(MIG_CODE).toMatch(/UPDATE public\.job_applications SET status = 'applied'/);
  });

  it('★ والمفردات نفسها في الخدمة — ثمانية بالضبط', () => {
    const m = SVC_CODE.match(/APPLICATION_STATUSES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const items = (m as RegExpMatchArray)[1].split(',').filter((x) => x.trim());
    expect(items.length).toBe(8);
    for (const s of APP_STAGES) {
      expect(SVC_CODE, `${s} غائب`).toContain(`'${s}'`);
    }
  });

  it('★★ والصفحة تشتقّ القائمة من المصدر لا تكتبها', () => {
    expect(PAGE_CODE).toMatch(/MOVABLE_STAGES\.map/);
    expect(PAGE_CODE).toMatch(/APPLICATION_STATUSES\.filter/);
    expect(PAGE_CODE, 'submitted عاد').not.toContain("'submitted'");
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ③: حالة الإعلان بمفرداتها الخمس', () => {
  it('CHECK في القاعدة', () => {
    expect(MIG_CODE).toMatch(/job_postings_status_chk/);
    for (const s of POST_STATUSES) {
      expect(MIG_CODE, `${s} غائبة`).toContain(`'${s}'`);
    }
  });

  it('★★ والصفحة تعرض الخمس (كانت statusColors أربعة)', () => {
    const m = SVC_CODE.match(/POSTING_STATUSES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    expect((m as RegExpMatchArray)[1].split(',').filter((x) => x.trim()).length).toBe(5);
    expect(PAGE_CODE).toMatch(/POSTING_STATUSES\.map/);
    // العطل: خريطة ألوان يدوية بأربع مفاتيح
    expect(PAGE_CODE, 'statusColors عادت').not.toMatch(/statusColors/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ④–⑦: قيود الإعلان', () => {
  it('tenant_id صار NOT NULL', () => {
    expect(MIG_CODE).toMatch(
      /ALTER TABLE public\.job_postings ALTER COLUMN tenant_id SET NOT NULL/);
  });

  it('★ والصفوف اليتيمة عولجت قبل فرضه', () => {
    const heal = MIG_CODE.indexOf('DELETE FROM public.job_postings WHERE tenant_id IS NULL');
    const force = MIG_CODE.indexOf('ALTER COLUMN tenant_id SET NOT NULL');
    expect(heal).toBeGreaterThan(-1);
    expect(force, 'القيد فُرض قبل العلاج').toBeGreaterThan(heal);
  });

  it('قيد مدى الراتب', () => {
    expect(MIG_CODE).toMatch(/job_postings_salary_range_chk/);
    expect(MIG_CODE).toMatch(/salary_min <= salary_max/);
    expect(fnBody('job_posting_upsert')).toMatch(/RECRUITMENT_SALARY_RANGE/);
  });

  it('قيد الشواغر الموجبة', () => {
    expect(MIG_CODE).toMatch(/job_postings_vacancy_chk/);
    expect(MIG_CODE).toMatch(/vacancy_count > 0/);
    expect(fnBody('job_posting_upsert')).toMatch(/RECRUITMENT_VACANCY_INVALID/);
  });

  it('قيد التواريخ', () => {
    expect(MIG_CODE).toMatch(/job_postings_dates_chk/);
    expect(MIG_CODE).toMatch(/closing_date >= posted_date/);
    expect(fnBody('job_posting_upsert')).toMatch(/RECRUITMENT_CLOSING_IN_PAST/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑧: نوع التوظيف بالعربية لا خاماً', () => {
  it('CHECK بالمفردات الأربع', () => {
    expect(MIG_CODE).toMatch(/job_postings_employment_type_chk/);
    for (const t of EMP_TYPES) {
      expect(MIG_CODE, `${t} غائب`).toContain(`'${t}'`);
    }
    expect(fnBody('job_posting_upsert')).toMatch(/RECRUITMENT_TYPE_INVALID/);
  });

  it('★★★ والصفحة تترجمه — كانت تعرض full_time خاماً', () => {
    expect(SVC_CODE).toMatch(/EMPLOYMENT_TYPE_AR/);
    expect(SVC_CODE).toMatch(/full_time: 'دوام كامل'/);
    expect(PAGE_CODE).toMatch(/employmentTypeLabel\(job\.employmentType\)/);
    // العطل: {job.employment_type} خاماً في البطاقة
    expect(PAGE_CODE, 'العرض الخام عاد').not.toMatch(/\{job\.employmentType\}/);
  });

  it('★ والنموذج يشتقّ القائمة من المصدر', () => {
    expect(PAGE_CODE).toMatch(/EMPLOYMENT_TYPES\.map/);
    expect(PAGE_CODE, 'قائمة يدوية عادت')
      .not.toMatch(/value="full_time">دوام كامل/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ⑨/⑩: FK مركَّب و RESTRICT', () => {
  it('FK الإعلان مركَّب (posting_id, tenant_id)', () => {
    expect(MIG_CODE).toMatch(/job_applications_posting_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(posting_id, tenant_id\)/);
    expect(MIG_CODE).toMatch(/REFERENCES public\.job_postings \(id, tenant_id\)/);
  });

  it('★★★ والقيد القديم (CASCADE) أُسقط صراحةً', () => {
    expect(MIG_CODE).toMatch(
      /DROP CONSTRAINT IF EXISTS job_applications_posting_id_fkey/);
    const i = MIG_CODE.lastIndexOf('job_applications_posting_tenant_fkey');
    const def = MIG_CODE.slice(i, i + 400);
    expect(def).toMatch(/ON DELETE RESTRICT/);
    expect(def).not.toMatch(/ON DELETE CASCADE/);
  });

  it('★ وFK القسم مركَّب كذلك (العطل ⑮)', () => {
    expect(MIG_CODE).toMatch(/job_postings_department_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(department_id, tenant_id\)/);
    expect(fnBody('job_posting_upsert')).toMatch(/RECRUITMENT_DEPARTMENT_NOT_FOUND/);
  });

  it('★ والفهرس الفريد الذي يجعله ممكناً', () => {
    expect(MIG_CODE).toMatch(/uq_job_postings_id_tenant/);
  });

  it('★★ ومحفّزا منع الحذف', () => {
    expect(MIG_CODE).toMatch(/tg_block_recruitment_delete/);
    expect(MIG_CODE).toMatch(/RECRUITMENT_DELETE_BLOCKED/);
    expect(MIG_CODE).toMatch(/trg_block_job_application_delete/);
    expect(MIG_CODE).toMatch(/trg_block_job_posting_delete/);
  });

  it('★ ولا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE, 'delete عاد').not.toMatch(/\.delete\(/);
    expect(PAGE_CODE, 'delete عاد').not.toMatch(/\.delete\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑪/⑫: الفرادة والبريد', () => {
  it('فهرسٌ فريد على البريد المُطبَّع', () => {
    expect(MIG_CODE).toMatch(/uq_job_applications_posting_email/);
    expect(MIG_CODE).toMatch(/lower\(btrim\(email\)\)/);
    // ★ المسحوب خارج الفرادة (يمكن إعادة التقديم بعد السحب)
    expect(MIG_CODE).toMatch(/WHERE status <> 'withdrawn'/);
  });

  it('والدالة ترمي رمزاً مفهوماً قبل الفهرس', () => {
    expect(fnBody('application_submit')).toMatch(/RECRUITMENT_DUPLICATE_APPLICATION/);
  });

  it('★★★ والمحفّز يُطبِّع البريد (لا التفافَ بحرفٍ كبير)', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_job_application_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.email := lower\(btrim\(NEW\.email\)\)/);
  });

  it('قيد شكل البريد', () => {
    expect(MIG_CODE).toMatch(/job_applications_email_chk/);
    expect(fnBody('application_submit')).toMatch(/RECRUITMENT_EMAIL_INVALID/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑬: التوظيف يُنشئ موظفاً — الحلقة المفقودة', () => {
  it('application_hire تُدرج في employees', () => {
    const b = fnBody('application_hire');
    expect(b).toMatch(/INSERT INTO public\.employees/);
    expect(b).toMatch(/employee_code/);
    expect(b).toMatch(/first_name/);
  });

  it('★★ وتنقل البريد والهاتف (employees.email كان NULL دائماً)', () => {
    const b = fnBody('application_hire');
    expect(b).toMatch(/v_app\.email/);
    expect(b).toMatch(/v_app\.phone/);
  });

  it('★★★ وتربط الطلب بالموظف', () => {
    expect(fnBody('application_hire'))
      .toMatch(/SET status = 'hired', hired_employee_id = v_emp/);
  });

  it('★★★ وتُغلق الإعلان عند امتلاء الشواغر', () => {
    const b = fnBody('application_hire');
    expect(b).toMatch(/UPDATE public\.job_postings SET status = 'filled'/);
    expect(b).toMatch(/RECRUITMENT_NO_VACANCY_LEFT/);
  });

  it('★★★ و`hired` لا يمرّ من application_set_status', () => {
    expect(fnBody('application_set_status')).toMatch(/RECRUITMENT_USE_HIRE_FUNCTION/);
    expect(fnBody('application_set_status')).toMatch(/RECRUITMENT_ALREADY_HIRED/);
  });

  it('★ والمرفوض/المسحوب لا يُوظَّف', () => {
    expect(fnBody('application_hire')).toMatch(/RECRUITMENT_CANNOT_HIRE/);
  });

  it('★★ ورمز الموظف المُولَّد أطول من ثمانية (درس 0355)', () => {
    // employee_code = 'EMP-' || substr(id,1,8) في المحفّز القديم كان يتصادم
    expect(fnBody('application_hire')).toMatch(/substr\(replace\(gen_random_uuid\(\)::TEXT,'-',''\), 1, 10\)/);
    expect(fnBody('application_hire')).toMatch(/RECRUITMENT_EMPLOYEE_CODE_TAKEN/);
  });

  it('★ والخدمة تُصدِّرها بنوعٍ صريح', () => {
    expect(SVC_CODE).toMatch(/async hire\(/);
    expect(SVC_CODE).toMatch(/Promise<HireResult>/);
    expect(SVC_CODE).toMatch(/vacanciesLeft/);
  });

  it('★★ والصفحة تُفرد لها زرّاً ونافذة تحذير', () => {
    expect(PAGE_CODE).toMatch(/recruitmentSdk\.hire\(/);
    expect(PAGE_CODE).toMatch(/hireTarget/);
    expect(PAGE_CODE).toMatch(/سيُنشأ/);
    // ★ و`hired` غير موجود في قائمة النقل
    expect(PAGE_CODE).toMatch(/APPLICATION_STATUSES\.filter\(\(s\) => s !== 'hired'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑭: عدّادات المتقدمين', () => {
  it('اللوح يُعيد أربعة عدّادات', () => {
    const b = fnBody('recruitment_board');
    for (const c of ['out_apps_total', 'out_apps_new',
                     'out_apps_progress', 'out_apps_hired']) {
      expect(b, `${c} غائب`).toContain(c);
    }
  });

  it('★ والصفحة تعرضها', () => {
    expect(PAGE_CODE).toMatch(/job\.appsTotal/);
    expect(PAGE_CODE).toMatch(/job\.appsNew/);
    expect(PAGE_CODE).toMatch(/job\.appsHired/);
  });

  it('★ و`applications_count` الوهميّ لم يعد مذكوراً', () => {
    expect(PAGE_CODE, 'العمود الوهميّ عاد').not.toMatch(/applications_count/);
    expect(SVC_CODE).not.toMatch(/applications_count/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑮ والتوقيت والترتيب', () => {
  it('المحفّز يملأ created_by ويُجمّده', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_job_posting_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.created_by := COALESCE\(auth\.uid\(\)/);
    expect(b).toMatch(/NEW\.created_by := OLD\.created_by/);
  });

  it('★ ويسجّل تاريخ النشر بتوقيت بغداد', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_job_posting_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.posted_date := \(now\(\) AT TIME ZONE 'Asia\/Baghdad'\)::DATE/);
  });

  it('★★ والمحفّز يسجّل المراجع عند تغيّر الحالة', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_job_application_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.reviewed_by := COALESCE\(auth\.uid\(\)/);
    expect(b).toMatch(/NEW\.reviewed_at := now\(\)/);
  });

  it('★★★ توقيت بغداد في كل دالةٍ تحسب تاريخاً', () => {
    for (const fn of ['recruitment_board', 'recruitment_summary',
                      'job_posting_upsert', 'application_submit']) {
      expect(fnBody(fn), `${fn} بلا منطقة بغداد`)
        .toMatch(/now\(\) AT TIME ZONE 'Asia\/Baghdad'/);
    }
  });

  it('★ ولا CURRENT_DATE عارية في الدوال الجديدة', () => {
    for (const fn of NEW_FNS) {
      expect(fnBody(fn), `${fn} تستعمل CURRENT_DATE`).not.toMatch(/\bCURRENT_DATE\b/);
    }
  });

  it('★★★ ORDER BY حتميّ بمفاتيح متعددة (درس 0357)', () => {
    expect(fnBody('recruitment_board'))
      .toMatch(/ORDER BY \(b\.status = 'open'\) DESC, b\.created_at DESC, b\.id DESC/);
    // ★ والمتقدمون بالأجدر لا أبجدياً
    const b = fnBody('recruitment_applications');
    expect(b).toMatch(/WHEN 'hired' THEN 1 WHEN 'offer' THEN 2/);
    expect(b).toMatch(/a\.submitted_at DESC, a\.id DESC/);
  });

  it('★ والحدّ الأعلى محصور', () => {
    expect(fnBody('recruitment_board'))
      .toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 200\), 1\), 500\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العزل والحرّاس', () => {
  it('لا سياسة PERMISSIVE جديدة على الجدولين (درس 0355)', () => {
    expect(MIG_STMT).not.toMatch(/CREATE POLICY hybrid_gate_job_postings/);
    expect(MIG_STMT).not.toMatch(/CREATE POLICY hybrid_gate_job_applications/);
  });

  it.each(NEW_FNS)('%s تُرشِّح المستأجر', (fn) => {
    expect(fnBody(fn)).toMatch(/current_user_tenant_id\(\)/);
  });

  it.each(NEW_FNS)('%s تحرس الدور', (fn) => {
    expect(fnBody(fn)).toMatch(/current_user_is_staff\(\)/);
  });

  it('★★ والكتابة تحتاج auth.uid() صريحاً', () => {
    for (const fn of ['job_posting_upsert', 'application_submit',
                      'application_set_status', 'application_hire']) {
      expect(fnBody(fn), `${fn} بلا حارس auth`).toMatch(/auth\.uid\(\) IS NULL/);
    }
  });

  it('★ ولا تقديمَ على إعلانٍ غير مفتوح أو منتهٍ', () => {
    const b = fnBody('application_submit');
    expect(b).toMatch(/RECRUITMENT_POSTING_NOT_OPEN/);
    expect(b).toMatch(/RECRUITMENT_POSTING_EXPIRED/);
  });

  it('★ والرفض يحتاج سبباً', () => {
    expect(fnBody('application_set_status'))
      .toMatch(/RECRUITMENT_REJECTION_REASON_REQUIRED/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ نظافة الطبقة والصفحة', () => {
  it('الخدمة مُصدَّرة من index', () => {
    expect(INDEX).toMatch(/recruitmentSdk/);
    expect(INDEX).toMatch(/from '\.\/RecruitmentPipelineService'/);
  });

  it('الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★★ ولا any في الطبقة ولا في الصفحة', () => {
    for (const [name, code] of [['الخدمة', SVC_CODE], ['الصفحة', PAGE_CODE]] as const) {
      expect(code, `as any في ${name}`).not.toMatch(/\bas any\b/);
      expect(code, `: any في ${name}`).not.toMatch(/:\s*any\b/);
      expect(code, `any[] في ${name}`).not.toMatch(/any\[\]/);
    }
    // العطل: as unknown as Record<string, unknown> في createPosting
    expect(PAGE_CODE, 'as unknown as عاد').not.toMatch(/as unknown as Record/);
  });

  it('★★ ولا confirm/alert/prompt (سياسة المنصة)', () => {
    for (const banned of ['confirm(', 'alert(', 'prompt(']) {
      expect(PAGE_CODE, `${banned} عاد`).not.toContain(banned);
    }
    // ★ سبب الرفض عبر Modal لا prompt
    expect(PAGE_CODE).toMatch(/rejectTarget/);
  });

  it('★ numOrNull يحفظ التمييز بين صفر وغير مُقاس (درس 0353)', () => {
    expect(SVC_CODE).toMatch(/const numOrNull/);
    expect(SVC_CODE).toMatch(/daysLeft:\s*numOrNull/);
    expect(SVC_CODE).toMatch(/rating:\s*numOrNull/);
    expect(PAGE_CODE).toMatch(/daysLeft != null/);
    expect(PAGE_CODE).toMatch(/rating != null/);
  });

  it('★ أزرار العمل مُعطَّلة أثناء التنفيذ', () => {
    expect(PAGE_CODE).toMatch(/disabled=\{busyId === app\.id/);
    expect(PAGE_CODE).toMatch(/setSaving\(true\)/);
    expect(PAGE_CODE).toMatch(/if \(!saving\)/);
  });

  it('★ والبحث مُهدَّأ (لا نداءٌ لكل حرف)', () => {
    expect(PAGE_CODE).toMatch(/setTimeout\(\(\) => \{ void load\(\); \}, 250\)/);
    expect(PAGE_CODE).toMatch(/clearTimeout/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ أدوات التحقّق موجودة ومربوطة', () => {
  it.each([
    'tools/dev/verify-recruitment-0362.sql',
    'tools/dev/verify-recruitment-0362-rls.sh',
    'tools/dev/_invert_0362.py',
  ])('%s موجود', (p) => {
    expect(existsSync(resolve(root, p))).toBe(true);
  });

  it('★ سكربت العكس يشير إلى مايجريشن 0362 نفسه', () => {
    const inv = read('tools/dev/_invert_0362.py');
    expect(inv).toContain('0362_recruitment_integrity.sql');
    expect(inv).toContain('verify-recruitment-0362.sql');
    expect(inv).toContain('verify-recruitment-0362-rls.sh');
  });

  it('★★ والمسبار حُذف قبل الكوميت', () => {
    expect(existsSync(resolve(root, 'tools/dev/_probe_0362.sql'))).toBe(false);
  });
});
