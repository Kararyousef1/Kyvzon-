#!/usr/bin/env python3
"""
عكس إصلاحات 0362 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (pg_constraint)` و`ADD COLUMN IF NOT EXISTS`
   و`CREATE UNIQUE INDEX IF NOT EXISTS` يمنع إعادة الإنشاء ⇒ عكسُها
   بـDDL صريح (DDL_INVERSIONS).

الاستعمال:
    PGPORT=5492 python3 tools/dev/_invert_0362.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0362_recruitment_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-recruitment-0362.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-recruitment-0362-rls.sh')

PGPORT = os.environ.get('PGPORT', '5492')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   السبب مُثبَت لا مُفترَض (دروس 0360/0361):
#   · حرّاس الدور: ملف SQL يستدعي الدوال بسياق **هدى (hr)** وهي staff
#     فعلاً، والموظف والمدير لا يظهران إلا في سكربت RLS.
#   · REVOKE عن anon: الأثر على anon وحده و`postgres` لا يمرّ منه.
RLS_CHECK = {'INV24', 'INV25', 'INV26', 'INV27', 'INV28'}
DDL_RLS_CHECK: set = set()


def psql(path):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, errors='replace', env=ENV, timeout=240)


def psql_c(sql):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-c', sql],
        capture_output=True, text=True, errors='replace', env=ENV, timeout=120)


def run_rls():
    return subprocess.run(['bash', VERIFY_RLS], capture_output=True,
                          text=True, errors='replace', env=ENV, timeout=400)


INVERSIONS = [
    (
        'INV01',
        '★★★ DEFAULT حالة الطلب يعود submitted (العطل ②)',
        """ALTER TABLE public.job_applications ALTER COLUMN status SET DEFAULT 'applied';""",
        """ALTER TABLE public.job_applications ALTER COLUMN status SET DEFAULT 'submitted';""",
    ),
    (
        'INV02',
        '★★★ قائمة المتقدمين تعود ترتّب أبجدياً (العطل ①)',
        """   ORDER BY CASE a.status
              WHEN 'hired' THEN 1 WHEN 'offer' THEN 2 WHEN 'test' THEN 3
              WHEN 'interview' THEN 4 WHEN 'screening' THEN 5
              WHEN 'applied' THEN 6 WHEN 'rejected' THEN 7 ELSE 8 END,
            a.submitted_at DESC, a.id DESC;""",
        """   ORDER BY a.status;""",
    ),
    (
        'INV03',
        '★★★ ترشيح المستأجر في قائمة المتقدمين يسقط',
        """   WHERE a.tenant_id = v_tenant
     AND (p_posting IS NULL OR a.posting_id = p_posting)""",
        """   WHERE (a.tenant_id = v_tenant OR TRUE)
     AND (p_posting IS NULL OR a.posting_id = p_posting)""",
    ),
    (
        'INV04',
        '★★ ترشيح الحالة في قائمة المتقدمين يصير بلا أثر',
        """     AND (p_status IS NULL OR a.status = p_status)""",
        """     AND (p_status IS NULL OR TRUE)""",
    ),
    (
        'INV05',
        '★★★ application_hire يتوقّف عن إنشاء الموظف (العطل ⑬)',
        """  INSERT INTO public.employees
    (tenant_id, employee_code, first_name, last_name, email,
     phone, department_id, is_active)
  VALUES
    (v_tenant, v_code, v_first, COALESCE(v_last, '—'), v_app.email,
     v_app.phone, COALESCE(p_department, v_app.pdept), TRUE)
  RETURNING id INTO v_emp;""",
        """  v_emp := NULL;""",
    ),
    (
        'INV06',
        '★★★ التوظيف لا يُغلق الإعلان عند امتلاء الشواغر',
        """  IF v_hired >= v_vac THEN
    UPDATE public.job_postings SET status = 'filled', updated_at = now()
     WHERE id = v_app.posting_id AND tenant_id = v_tenant;
    v_pstatus := 'filled';
  ELSE""",
        """  IF FALSE THEN
    v_pstatus := 'filled';
  ELSE""",
    ),
    (
        'INV07',
        '★★★ حارس عدد الشواغر يسقط (توظيفٌ بلا حدّ)',
        """  IF v_hired >= v_vac THEN
    RAISE EXCEPTION 'RECRUITMENT_NO_VACANCY_LEFT: % من %', v_hired, v_vac;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV08',
        '★★ التوظيف لا يربط hired_employee_id بالطلب',
        """     SET status = 'hired', hired_employee_id = v_emp, updated_at = now()""",
        """     SET status = 'hired', updated_at = now()""",
    ),
    (
        'INV09',
        '★★ المرفوض/المسحوب يصير قابلاً للتوظيف',
        """  IF v_app.status IN ('rejected','withdrawn') THEN
    RAISE EXCEPTION 'RECRUITMENT_CANNOT_HIRE: %', v_app.status;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV10',
        '★★★ `hired` يعود يمرّ من application_set_status بلا إنشاء موظف',
        """  IF p_status = 'hired' THEN
    RAISE EXCEPTION 'RECRUITMENT_USE_HIRE_FUNCTION: استخدم application_hire';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV11',
        '★★ الموظَّف يعود متقدّماً',
        """  IF v_old = 'hired' THEN
    RAISE EXCEPTION 'RECRUITMENT_ALREADY_HIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV12',
        '★★ الرفض بلا سبب يمرّ',
        """  IF p_status = 'rejected' AND btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'RECRUITMENT_REJECTION_REASON_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV13',
        '★★★ حارس المستأجر في application_submit يسقط (العطل ⑨)',
        """  SELECT p.status, p.closing_date INTO v_status, v_close
    FROM public.job_postings p
   WHERE p.id = p_posting AND p.tenant_id = v_tenant;""",
        """  SELECT p.status, p.closing_date INTO v_status, v_close
    FROM public.job_postings p
   WHERE p.id = p_posting;""",
    ),
    (
        'INV14',
        '★★ التقديم على مسودة يمرّ',
        """  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'RECRUITMENT_POSTING_NOT_OPEN: %', v_status;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV15',
        '★★★ حارس التكرار في application_submit يسقط (العطل ⑪)',
        """  IF EXISTS (SELECT 1 FROM public.job_applications a
              WHERE a.tenant_id = v_tenant AND a.posting_id = p_posting
                AND lower(btrim(a.email)) = lower(btrim(p_email))
                AND a.status <> 'withdrawn') THEN
    RAISE EXCEPTION 'RECRUITMENT_DUPLICATE_APPLICATION';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV16',
        '★★ حارس البريد في الدالة يسقط (العطل ⑫)',
        """  IF lower(btrim(COALESCE(p_email,'')))
       !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'RECRUITMENT_EMAIL_INVALID';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV17',
        '★★ حارس اسم المتقدّم يسقط',
        """  IF btrim(COALESCE(p_name,'')) = '' THEN
    RAISE EXCEPTION 'RECRUITMENT_NAME_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV18',
        '★★★ المحفّز يتوقّف عن تطبيع البريد (التفافٌ على الفرادة)',
        """  NEW.email := lower(btrim(NEW.email));""",
        """  NEW.email := NEW.email;""",
    ),
    (
        'INV19',
        '★★ المحفّز يتوقّف عن تسجيل المراجع',
        """    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.reviewed_by := COALESCE(auth.uid(), NEW.reviewed_by);
      NEW.reviewed_at := now();
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV20',
        '★★ محفّز الإعلان يتوقّف عن ملء created_by (العطل ⑮)',
        """    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);""",
        """    NEW.created_by := NEW.created_by;""",
    ),
    (
        'INV21',
        '★★ النشر لا يُسجَّل تاريخه',
        """    IF NEW.status = 'open' AND NEW.posted_date IS NULL THEN
      NEW.posted_date := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV22',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطل ⑩)',
        """  RAISE EXCEPTION
    'RECRUITMENT_DELETE_BLOCKED: سجلّات التوظيف لا تُحذف — استخدم الإلغاء أو السحب';""",
        """  RETURN OLD;""",
    ),
    (
        'INV23',
        '★★★ اللوح يتوقّف عن عدّ المتقدمين (العطل ⑭)',
        """    COALESCE(ap.total, 0), COALESCE(ap.fresh, 0),
    COALESCE(ap.progress, 0), COALESCE(ap.hired, 0),""",
        """    0, 0, 0, 0,""",
    ),
    (
        'INV24',
        '★★★ حارس الدور في اللوح يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بلوح التوظيف';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV25',
        '★★★ حارس الدور في قائمة المتقدمين يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بقائمة المتقدمين';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV26',
        '★★★ حارس الدور في الملخّص يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص التوظيف';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV27',
        '★★★ حارس الدور في job_posting_upsert يسقط (المدير يُنشئ إعلانات)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_AUTHORIZED';
  END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN""",
        """  NULL;
  IF btrim(COALESCE(p_title,'')) = '' THEN""",
    ),
    (
        'INV28',
        '★★★ REVOKE عن anon يسقط عن قائمة المتقدمين',
        """REVOKE ALL ON FUNCTION public.recruitment_applications(UUID, TEXT) FROM anon;""",
        """GRANT EXECUTE ON FUNCTION public.recruitment_applications(UUID, TEXT) TO anon;""",
    ),
    (
        'INV29',
        '★★★ ترشيح المستأجر في اللوح يسقط',
        """    SELECT p.* FROM public.job_postings p
     WHERE p.tenant_id = v_tenant""",
        """    SELECT p.* FROM public.job_postings p
     WHERE (p.tenant_id = v_tenant OR TRUE)""",
    ),
    (
        'INV30',
        '★★★ ترشيح المستأجر في الملخّص يسقط',
        """  WITH p AS (SELECT * FROM public.job_postings WHERE tenant_id = v_tenant),
       a AS (SELECT * FROM public.job_applications WHERE tenant_id = v_tenant)""",
        """  WITH p AS (SELECT * FROM public.job_postings),
       a AS (SELECT * FROM public.job_applications)""",
    ),
    (
        'INV31',
        '★★ ترشيح المستأجر في job_posting_upsert يسقط',
        """     WHERE id = p_id AND tenant_id = v_tenant
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_POSTING_NOT_FOUND'; END IF;""",
        """     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_POSTING_NOT_FOUND'; END IF;""",
    ),
    (
        'INV32',
        '★★ حارس القسم في upsert يسقط',
        """  IF p_department IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.departments d
                      WHERE d.id = p_department AND d.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'RECRUITMENT_DEPARTMENT_NOT_FOUND';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV33',
        '★★ حرّاس النوع/الحالة/الشواغر/الراتب/التاريخ في upsert تسقط',
        """  IF p_status NOT IN ('draft','open','closed','filled','cancelled') THEN
    RAISE EXCEPTION 'RECRUITMENT_STATUS_INVALID: %', p_status;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV34',
        '★★ حارس نوع التوظيف يسقط',
        """  IF p_type NOT IN ('full_time','part_time','contract','temporary') THEN
    RAISE EXCEPTION 'RECRUITMENT_TYPE_INVALID: %', p_type;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV35',
        '★★ حارس عدد الشواغر في upsert يسقط',
        """  IF COALESCE(p_vacancies, 0) <= 0 THEN
    RAISE EXCEPTION 'RECRUITMENT_VACANCY_INVALID';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV36',
        '★★ حارس مدى الراتب في upsert يسقط',
        """  IF p_salary_min IS NOT NULL AND p_salary_max IS NOT NULL
     AND p_salary_min > p_salary_max THEN
    RAISE EXCEPTION 'RECRUITMENT_SALARY_RANGE';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV37',
        '★★ حارس تاريخ الإغلاق الماضي يسقط',
        """  IF p_closing IS NOT NULL AND p_closing < v_today THEN
    RAISE EXCEPTION 'RECRUITMENT_CLOSING_IN_PAST';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV38',
        '★★★ توقيت بغداد يسقط من اللوح — يُزاح v_today يوماً كاملاً',
        """  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);""",
        """  v_today  DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1);
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);""",
    ),
    (
        'INV39',
        '★★ الترتيب الحتميّ في اللوح يسقط (درس 0357)',
        """ ORDER BY (b.status = 'open') DESC, b.created_at DESC, b.id DESC""",
        """ ORDER BY b.title""",
    ),
    (
        'INV40',
        '★★ الحدّ الأعلى في اللوح يصير بلا أثر',
        """  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بلوح التوظيف';""",
        """  v_lim    INTEGER := 500;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بلوح التوظيف';""",
    ),
    (
        'INV41',
        '★★ الملخّص يخلط «المفتوح بلا متقدّم» بالمفتوح كلّه',
        """    (SELECT count(*)::INTEGER FROM p
      WHERE p.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM a WHERE a.posting_id = p.id
                          AND a.status <> 'withdrawn'));""",
        """    (SELECT count(*)::INTEGER FROM p WHERE p.status = 'open');""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط FK الإعلان المركَّب (يعود العطلان ⑨ و⑩)',
        'ALTER TABLE public.job_applications '
        'DROP CONSTRAINT IF EXISTS job_applications_posting_tenant_fkey;',
        'ALTER TABLE public.job_applications ADD CONSTRAINT '
        'job_applications_posting_tenant_fkey FOREIGN KEY '
        '(posting_id, tenant_id) REFERENCES '
        'public.job_postings (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL02',
        '★★★ إسقاط قيد حالة الطلب (العطل ②)',
        'ALTER TABLE public.job_applications '
        'DROP CONSTRAINT IF EXISTS job_applications_status_chk;',
        "ALTER TABLE public.job_applications ADD CONSTRAINT "
        "job_applications_status_chk CHECK (status IN ('applied','screening',"
        "'interview','test','offer','hired','rejected','withdrawn'));",
    ),
    (
        'DDL03',
        '★★ إسقاط قيد حالة الإعلان (العطل ③)',
        'ALTER TABLE public.job_postings '
        'DROP CONSTRAINT IF EXISTS job_postings_status_chk;',
        "ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_status_chk "
        "CHECK (status IN ('draft','open','closed','filled','cancelled'));",
    ),
    (
        'DDL04',
        '★★ إسقاط قيد نوع التوظيف (العطل ⑧)',
        'ALTER TABLE public.job_postings '
        'DROP CONSTRAINT IF EXISTS job_postings_employment_type_chk;',
        "ALTER TABLE public.job_postings ADD CONSTRAINT "
        "job_postings_employment_type_chk CHECK (employment_type IN "
        "('full_time','part_time','contract','temporary'));",
    ),
    (
        'DDL05',
        '★★ إسقاط قيد مدى الراتب (العطل ⑤)',
        'ALTER TABLE public.job_postings '
        'DROP CONSTRAINT IF EXISTS job_postings_salary_range_chk;',
        'ALTER TABLE public.job_postings ADD CONSTRAINT '
        'job_postings_salary_range_chk CHECK (salary_min IS NULL OR '
        'salary_max IS NULL OR salary_min <= salary_max);',
    ),
    (
        'DDL06',
        '★★ إسقاط قيد الشواغر (العطل ⑥)',
        'ALTER TABLE public.job_postings '
        'DROP CONSTRAINT IF EXISTS job_postings_vacancy_chk;',
        'ALTER TABLE public.job_postings ADD CONSTRAINT '
        'job_postings_vacancy_chk CHECK (vacancy_count > 0);',
    ),
    (
        'DDL07',
        '★★ إسقاط قيد التواريخ (العطل ⑦)',
        'ALTER TABLE public.job_postings '
        'DROP CONSTRAINT IF EXISTS job_postings_dates_chk;',
        'ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_dates_chk '
        'CHECK (closing_date IS NULL OR posted_date IS NULL '
        'OR closing_date >= posted_date);',
    ),
    (
        'DDL08',
        '★★ إسقاط قيد العنوان/الوصف غير الفارغين',
        'ALTER TABLE public.job_postings '
        'DROP CONSTRAINT IF EXISTS job_postings_title_chk;',
        "ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_title_chk "
        "CHECK (btrim(title) <> '' AND btrim(description) <> '');",
    ),
    (
        'DDL09',
        '★★ إسقاط قيد البريد (العطل ⑫)',
        'ALTER TABLE public.job_applications '
        'DROP CONSTRAINT IF EXISTS job_applications_email_chk;',
        "ALTER TABLE public.job_applications ADD CONSTRAINT "
        "job_applications_email_chk CHECK (email ~ "
        "'^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$');",
    ),
    (
        'DDL10',
        '★★★ إسقاط فهرس الفرادة على البريد المُطبَّع (العطل ⑪)',
        'DROP INDEX IF EXISTS public.uq_job_applications_posting_email;',
        'CREATE UNIQUE INDEX uq_job_applications_posting_email '
        'ON public.job_applications (tenant_id, posting_id, lower(btrim(email))) '
        "WHERE status <> 'withdrawn';",
    ),
    (
        'DDL11',
        '★★ إعادة tenant_id في الإعلانات إلى NULLABLE (العطل ④)',
        'ALTER TABLE public.job_postings ALTER COLUMN tenant_id DROP NOT NULL;',
        'ALTER TABLE public.job_postings ALTER COLUMN tenant_id SET NOT NULL;',
    ),
    (
        'DDL12',
        '★★★ إسقاط الأعمدة الناقصة التي أُضيفت (العطل ①)',
        'ALTER TABLE public.job_applications '
        'DROP COLUMN IF EXISTS cover_letter CASCADE, '
        'DROP COLUMN IF EXISTS hired_employee_id CASCADE;',
        'ALTER TABLE public.job_applications '
        'ADD COLUMN IF NOT EXISTS cover_letter TEXT, '
        'ADD COLUMN IF NOT EXISTS hired_employee_id UUID;',
    ),
    (
        'DDL13',
        '★★ إسقاط عمودَي المراجعة',
        'ALTER TABLE public.job_applications '
        'DROP COLUMN IF EXISTS reviewed_by CASCADE, '
        'DROP COLUMN IF EXISTS reviewed_at CASCADE;',
        'ALTER TABLE public.job_applications '
        'ADD COLUMN IF NOT EXISTS reviewed_by UUID, '
        'ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;',
    ),
    (
        'DDL14',
        '★★ إسقاط عمودَي التقييم وسبب الرفض',
        'ALTER TABLE public.job_applications '
        'DROP COLUMN IF EXISTS rating CASCADE, '
        'DROP COLUMN IF EXISTS rejection_reason CASCADE;',
        'ALTER TABLE public.job_applications '
        'ADD COLUMN IF NOT EXISTS rating INTEGER, '
        'ADD COLUMN IF NOT EXISTS rejection_reason TEXT;',
    ),
    (
        'DDL15',
        '★★ إسقاط FK القسم المركَّب (العطل ⑮)',
        'ALTER TABLE public.job_postings '
        'DROP CONSTRAINT IF EXISTS job_postings_department_tenant_fkey;',
        'ALTER TABLE public.job_postings ADD CONSTRAINT '
        'job_postings_department_tenant_fkey FOREIGN KEY '
        '(department_id, tenant_id) REFERENCES '
        'public.departments (id, tenant_id) ON DELETE SET NULL;',
    ),
]

# ★ عكسٌ لا يُسقط الاختبار لسببٍ **مُثبَت** لا لأنّ الشرط غير مختبَر.
EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        'إسقاط `uq_job_postings_id_tenant` وحده',
        'الفهرس الفريد ليس إصلاحاً في ذاته — هو **شرطُ وجودٍ** لـDDL01. '
        'إسقاطه بلا إسقاط FK مستحيل: Postgres يرفض `DROP INDEX` بـ'
        '«cannot drop index … because constraint '
        'job_applications_posting_tenant_fkey requires it» (النمط نفسه '
        'مُثبَت تشغيلياً في 0360/EQ01). أثرُه مغطًّى كاملاً بـDDL01.'
    ),
    (
        'EQ02',
        'إسقاط `GRANT EXECUTE … TO authenticated` عن أيٍّ من الدوال الستّ',
        '★★★ `0268` نفّذ `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON '
        'FUNCTIONS`، و`pg_default_acl` يُظهر حرفياً: '
        '`f | postgres | anon=X/postgres authenticated=X/postgres '
        'service_role=X/postgres` ⇒ **كل دالة جديدة تُولَد ومعها EXECUTE '
        'لـauthenticated تلقائياً** (أُثبت بمسبار في 0360/EQ04). فالمنحة '
        'الصريحة تحصيل حاصل لا يمكن لاختبارٍ أن يُسقطه — وتبقى في الشيفرة '
        'إن أُلغيت الصلاحية الافتراضية يوماً. ★ أمّا `REVOKE … FROM anon` '
        'فليس كذلك: عكسه (INV28) أسقط سكربت RLS فعلاً.'
    ),
    (
        'EQ03',
        'إسقاط `idx_job_postings_open`',
        'فهرس أداءٍ محض لا يغيّر نتيجة أيّ استعلام — الخطة تسقط إلى '
        'Seq Scan على عيّنة من ثلاثة صفوف. ★ ولا يوجد في اللوح `LIMIT` '
        'بلا `ORDER BY` (درس 0357): `ORDER BY (b.status = \'open\') DESC, '
        'b.created_at DESC, b.id DESC` حتميّ ⇒ لا قلبَ للنتيجة. '
        'عكسُه مغطًّى ضمنياً بالتأكيدين 14.11 و14.15.'
    ),
    (
        'EQ04',
        'إسقاط قيد `job_applications_rating_chk` أو `_name_chk`',
        'مغطّيان بحارسَي الدالة (`RECRUITMENT_RATING_RANGE` في INV؟ و'
        '`RECRUITMENT_NAME_REQUIRED` في INV17) — والقيدان طبقةُ دفاعٍ '
        'ثانية على الكتابة المباشرة، مُختبَران في سكربت RLS ضمن فحص '
        '«القيود تحرس الكتابة المباشرة». لا يُضاف لهما عكسٌ منفصل لأن '
        'الدالة تمنع القيمة قبل وصولها إلى الجدول في كل مسارٍ مُختبَر.'
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0362 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    psql(MIG)
    base = psql(VERIFY)
    base_rls = run_rls()
    if base.returncode != 0 or base_rls.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف كل شيء')
        print((base.stdout + base.stderr)[-2000:])
        print((base_rls.stdout + base_rls.stderr)[-2000:])
        return 1
    print('✔ خطّ الأساس: SQL و RLS ينجحان قبل أي عكس\n')

    for ident, desc, old, new in INVERSIONS:
        if old not in original:
            print(f'✖ {ident}: النصّ الأصلي لم يُطابَق — العكس وهمي!')
            print(f'   {desc}')
            results.append((ident, desc, 'NO_MATCH'))
            continue
        cnt = original.count(old)
        if cnt != 1:
            print(f'⚠ {ident}: النصّ تكرّر {cnt} مرة — العكس يصيب الأول فقط')

        broken = original.replace(old, new, 1)
        assert broken != original, f'{ident}: الاستبدال لم يُغيّر شيئاً'

        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False,
                                         encoding='utf-8') as fh:
            fh.write(broken)
            tmp = fh.name
        try:
            ap = psql(tmp)
            if ap.returncode != 0:
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
                print(f'✔ {ident}  FAILED_AS_EXPECTED (رفضته القاعدة عند التطبيق)')
                print(f'   {desc}')
                continue

            if ident in RLS_CHECK:
                ver = run_rls()
                tag = 'RLS'
            else:
                ver = psql(VERIFY)
                m = re.search(r'FAIL \[[^\]]+\]', ver.stdout + ver.stderr)
                tag = m.group(0) if m else '؟'

            if ver.returncode != 0:
                print(f'✔ {ident}  FAILED_AS_EXPECTED  ⇒ {tag}')
                print(f'   {desc}')
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
            else:
                print(f'✖ {ident}  SURVIVED — الاختبار نجح رغم العكس!')
                print(f'   {desc}')
                results.append((ident, desc, 'SURVIVED'))
        finally:
            os.unlink(tmp)
            psql(MIG)

    print()
    for ident, desc, break_sql, restore_sql in DDL_INVERSIONS:
        br = psql_c(break_sql)
        if br.returncode != 0:
            print(f'✖ {ident}: عبارة الكسر نفسها فشلت — {br.stderr[:140]}')
            results.append((ident, desc, 'BREAK_FAILED'))
            continue
        try:
            if ident in DDL_RLS_CHECK:
                ver = run_rls()
                tag = 'RLS'
            else:
                ver = psql(VERIFY)
                m = re.search(r'FAIL \[[^\]]+\]', ver.stdout + ver.stderr)
                tag = m.group(0) if m else '؟'
            if ver.returncode != 0:
                print(f'✔ {ident}  FAILED_AS_EXPECTED  ⇒ {tag}')
                print(f'   {desc}')
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
            else:
                print(f'✖ {ident}  SURVIVED — الاختبار نجح رغم العكس!')
                print(f'   {desc}')
                results.append((ident, desc, 'SURVIVED'))
        finally:
            rs = psql_c(restore_sql)
            if rs.returncode != 0:
                print(f'  ⚠ الاسترجاع فشل: {rs.stderr[:180]}')
            psql(MIG)

    open(MIG, 'w', encoding='utf-8').write(original)
    psql(MIG)
    final = psql(VERIFY)
    final_rls = run_rls()

    print()
    for ident, desc, why in EQUIVALENT_INVERSIONS:
        print(f'◈ {ident}  EQUIVALENT — {desc}')
        print(f'   السبب المُثبَت: {why}')

    print('\n' + '═' * 74)
    ok = sum(1 for _, _, s in results if s == 'FAILED_AS_EXPECTED')
    bad = [r for r in results if r[2] != 'FAILED_AS_EXPECTED']
    print(f'  النتيجة: {ok}/{len(results)} عكساً أسقط الاختبار')
    for ident, desc, st in bad:
        print(f'    ✖ {ident} [{st}] {desc}')
    good = final.returncode == 0 and final_rls.returncode == 0
    print(f'  الاسترجاع: {"✔ SQL و RLS ينجحان" if good else "✖ فشل"}')
    print('═' * 74)
    return 0 if (not bad and good) else 1


if __name__ == '__main__':
    sys.exit(main())
