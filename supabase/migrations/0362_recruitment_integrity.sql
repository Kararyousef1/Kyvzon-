-- ════════════════════════════════════════════════════════════════════════
--  0362 — سلامة التوظيف
--  المرحلة 4 — بوابة الموارد البشرية · hr/RecruitmentPage.tsx (222 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0362.sql — على قاعدة نظيفة، 290 م.)  │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★ **قائمة المتقدمين لا تعمل إطلاقاً — أربعة أعمدة معدومة.**
--
--     الموجود فعلاً في `job_applications` (من `information_schema`):
--        id · tenant_id · posting_id · applicant_name · email · phone
--        · resume_url · status · notes · submitted_at · created_at
--        · updated_at
--
--     والمعدوم الذي تقرؤه الصفحة والنوع:
--        job_id · applicant_email · cv_url · applied_at
--        · cover_letter · reviewed_by · hired_employee_id
--
--     PROBE_2:  column "job_id" does not exist
--     PROBE_3:  column "applied_at" does not exist
--     PROBE_1:  column "applicant_email" does not exist
--     PROBE_1:  column "cv_url" does not exist
--
--     `jobApplicationService.findByJob` تنفّذ:
--        findAll({ filters: { job_id }, orderBy: 'applied_at' })
--     ⇒ **عمودان معدومان في استعلامٍ واحد**. زرّ «المتقدمون» يرمي
--       دائماً، ولم يُقرأ طلبُ توظيفٍ واحد منذ كُتبت الصفحة.
--     ★ وحتى لو نجح الاستعلام، العرض يقرأ `app.applicant_email`
--       و`app.cv_url` و`app.applied_at` — ثلاثتها `undefined`،
--       و`format(new Date(undefined))` يرمي `Invalid time value`.
--
--  ② ★★★ **مفردتان لحالة الطلب لا تلتقيان أبداً.**
--     PROBE_4: DEFAULT في القاعدة = `'submitted'`
--              ومفردات الواجهة الثماني:
--              applied · screening · interview · test · offer · hired
--              · rejected · withdrawn
--              وقيود CHECK على `status` = **0**
--     ⇒ كل طلبٍ يُنشأ بحالة `'submitted'` **غير موجودة** في
--       `APPLICATION_STATUS_LABELS` ⇒ `<select value="submitted">`
--       بلا `<option>` مطابق ⇒ المتصفّح يعرض **أول خيار** («تم
--       التقديم») فيبدو أن الحالة `applied` وهي ليست كذلك. وأول
--       تغييرٍ يكتب مفردةً من عائلةٍ أخرى.
--
--  ③ ★★ **`job_postings.status` بلا CHECK** — PROBE_5:
--     `'ThIsIsGaRbAgE'` دخل. و`JOB_STATUS_LABELS[status]` يعطي
--     `undefined` فتظهر شارةٌ فارغة.
--     ★ ولاحظ: النوع في TS خمسة (`draft·open·closed·filled·cancelled`)
--       و`statusColors` في الصفحة **أربعة** — `cancelled` مفقود
--       فيسقط إلى الرماديّ صامتاً.
--
--  ④ ★★ **`tenant_id` في `job_postings` يقبل NULL** (PROBE_6)
--     ⇒ إعلانٌ لا يراه أحد ولا يُغلَق.
--
--  ⑤ ★★ **`salary_min > salary_max` بلا رادع.**
--     PROBE_7: «من 9,000,000 إلى 1,000» ⇒ قُبِل.
--
--  ⑥ ★★ **`vacancy_count` يقبل صفراً وسالباً** (PROBE_8: صفّان)
--     ⇒ «‎-5 شاغر» في البطاقة.
--
--  ⑦ ★★ **`closing_date` قبل `posted_date`** (PROBE_9) ⇒ قُبِل.
--
--  ⑧ ★★ **`employment_type` نصٌّ حرّ** (PROBE_10: «مخترع تماماً»).
--     ★★★ وأسوأ: **الصفحة تعرضه خاماً** — PROBE_11 يُظهر ما يصل
--       البطاقة حرفياً: `full_time`. فالنموذج يعرض «دوام كامل»
--       بالعربية والبطاقة تعرض `full_time` بالإنجليزية.
--
--  ⑨ ★★★ **متقدّمٌ في مستأجرك على إعلانٍ في مستأجرٍ آخر.**
--     PROBE_12: `tenant_id = ألف` مع `posting_id` من **باء** ⇒ قُبِل.
--     `job_applications_posting_id_fkey` يحرس وجود الإعلان ولا يحرس
--     انتماءه.
--
--  ⑩ ★★★ **حذف الإعلان يُبيد كل متقدميه.**
--     `job_applications_posting_id_fkey … ON DELETE CASCADE`
--     PROBE_13: إعلانٌ بمتقدمَين ⇒ حُذف ⇒ **صفر متقدّم** بلا تحذير.
--     سيرٌ ذاتية وتقييماتُ مقابلاتٍ تذهب بضغطة. ولا محفّز يمنع الحذف
--     في أيٍّ من الجدولين.
--
--  ⑪ ★★ **لا فرادة على المتقدّم.** PROBE_14: البريد نفسه على الإعلان
--     نفسه **مرّتين** ⇒ قُبِل. المتقدّم الذي يضغط «إرسال» مرّتين يصير
--     متقدّمَين، ويُقيَّم مرّتين، ويُرفض مرّةً ويُقبل أخرى.
--
--  ⑫ ★★ **البريد نصٌّ حرّ** (PROBE_15: «ليس بريداً إطلاقاً») ⇒ لا سبيل
--     لمراسلة المتقدّم.
--
--  ⑬ ★★★ **«تم التوظيف» لا يُنشئ موظفاً ولا يُغلق الإعلان.**
--     PROBE_16: دوال `recruit`/`job_post`/`job_appl`/`vacanc` = **0**.
--     الحالة تتغيّر إلى `hired` ثم… لا شيء. لا صفّ في `employees`،
--     ولا `vacancy_count` ينقص، ولا الإعلان يصير `filled`.
--     هذه هي **الحلقة المفقودة** بين التوظيف والتعريف (0359).
--
--  ⑭ ★★ **`applications_count` عمودٌ وهميّ في النوع** — PROBE_17: غير
--     موجود في القاعدة. والصفحة **لا تعرض عدد المتقدمين إطلاقاً**
--     (PROBE_18): خمسة إعلانات وخمس بطاقات بلا رقمٍ واحد. لمعرفة إن
--     كان لإعلانٍ متقدّمون يجب فتح النافذة — التي ترمي (العطل ①).
--
--  ⑮ ★★ **`created_by` لا يُكتب أبداً** (PROBE_19: سبعة إعلانات بلا
--     منشئ) ولا `department_id` له FK (PROBE_20 = 0).
--
--  ────────────────────────────────────────────────────────────────────
--  العلاج:
--    · أعمدة `job_applications` الناقصة تُضاف بأسمائها المتوقَّعة
--      **كمرادفاتٍ مُدارة** — لا إعادة تسمية تكسر ما يقرأ الحاليّ
--    · مفردةٌ واحدة لحالة الطلب (`submitted` تُرحَّل إلى `applied`)
--    · CHECK على الحالتين والنوع · FK مركَّب للإعلان والقسم
--    · فرادةٌ على (tenant, posting, lower(email))
--    · محفّزا منع الحذف · و`ON DELETE RESTRICT`
--    · `recruitment_board()` · `recruitment_summary()`
--      `job_posting_upsert()` · `application_submit()`
--      `application_set_status()` · **`application_hire()`** ★
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف البيانات القائمة قبل فرض القيود
-- ═══════════════════════════════════════════════════════════════════

-- ★ العطل ④: إعلانٌ بلا مستأجر لا يراه أحد ولا يمكن إسناده
DELETE FROM public.job_applications a
 WHERE EXISTS (SELECT 1 FROM public.job_postings p
                WHERE p.id = a.posting_id AND p.tenant_id IS NULL);
DELETE FROM public.job_postings WHERE tenant_id IS NULL;

-- ★ العطل ③: حالات خارج المفردات الخمس
UPDATE public.job_postings SET status = 'draft'
 WHERE status NOT IN ('draft','open','closed','filled','cancelled');

-- ★ العطل ⑧: أنواع توظيف خارج المفردات الأربع
UPDATE public.job_postings SET employment_type = 'full_time'
 WHERE employment_type IS NULL
    OR employment_type NOT IN ('full_time','part_time','contract','temporary');

-- ★ العطل ⑤: الراتب المقلوب يُصحَّح بالتبديل لا بالمحو
UPDATE public.job_postings
   SET salary_min = salary_max, salary_max = salary_min
 WHERE salary_min IS NOT NULL AND salary_max IS NOT NULL
   AND salary_min > salary_max;

-- ★ العطل ⑥: شواغر ≤ 0
UPDATE public.job_postings SET vacancy_count = 1 WHERE vacancy_count <= 0;

-- ★ العطل ⑦: زمنٌ مقلوب ⇒ يُمحى تاريخ الإغلاق (النشر أوثق)
UPDATE public.job_postings SET closing_date = NULL
 WHERE closing_date IS NOT NULL AND posted_date IS NOT NULL
   AND closing_date < posted_date;

-- ★★★ العطل ② — المفردة الواحدة. `submitted` من القاعدة تُرحَّل إلى
--   `applied` من الواجهة، وأيّ مفردةٍ أخرى إلى `applied` كذلك.
UPDATE public.job_applications SET status = 'applied'
 WHERE status NOT IN ('applied','screening','interview','test','offer',
                      'hired','rejected','withdrawn');

-- ★ العطل ⑨: طلبٌ على إعلانٍ في مستأجرٍ آخر ⇒ يُسحَب لا يُحذف
UPDATE public.job_applications a
   SET status = 'withdrawn'
 WHERE NOT EXISTS (SELECT 1 FROM public.job_postings p
                    WHERE p.id = a.posting_id AND p.tenant_id = a.tenant_id);
DELETE FROM public.job_applications a
 WHERE NOT EXISTS (SELECT 1 FROM public.job_postings p
                    WHERE p.id = a.posting_id AND p.tenant_id = a.tenant_id);

-- ★ العطل ⑪: التكرار — يُبقى الأقدم ويُسحَب ما بعده
UPDATE public.job_applications SET status = 'withdrawn'
 WHERE id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (
       PARTITION BY tenant_id, posting_id, lower(btrim(email))
       ORDER BY submitted_at, id) AS rn
       FROM public.job_applications) z
    WHERE z.rn > 1);

-- ═══════════════════════════════════════════════════════════════════
--  ① الأعمدة الناقصة (العطل ①)
--  ★ تُضاف بأسمائها الحقيقية الناقصة — لا إعادة تسمية للقائم
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS cover_letter TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hired_employee_id UUID,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rating INTEGER;

COMMENT ON COLUMN public.job_applications.hired_employee_id IS
  'الموظف الناتج عن التوظيف — الحلقة المفقودة بين التوظيف والتعريف (0359).';

-- ═══════════════════════════════════════════════════════════════════
--  ② القيود البنيوية
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.job_postings ALTER COLUMN tenant_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_postings_id_tenant
  ON public.job_postings (id, tenant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_postings_status_chk') THEN
    ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_status_chk
      CHECK (status IN ('draft','open','closed','filled','cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_postings_employment_type_chk') THEN
    ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_employment_type_chk
      CHECK (employment_type IN ('full_time','part_time','contract','temporary'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_postings_salary_range_chk') THEN
    ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_salary_range_chk
      CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_postings_vacancy_chk') THEN
    ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_vacancy_chk
      CHECK (vacancy_count > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_postings_dates_chk') THEN
    ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_dates_chk
      CHECK (closing_date IS NULL OR posted_date IS NULL
             OR closing_date >= posted_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_postings_title_chk') THEN
    ALTER TABLE public.job_postings ADD CONSTRAINT job_postings_title_chk
      CHECK (btrim(title) <> '' AND btrim(description) <> '');
  END IF;
END $$;

-- ★ العطل ⑮: القسم من المستأجر نفسه (uq_departments_id_tenant من 0361)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_postings_department_tenant_fkey') THEN
    ALTER TABLE public.job_postings
      ADD CONSTRAINT job_postings_department_tenant_fkey
      FOREIGN KEY (department_id, tenant_id)
      REFERENCES public.departments (id, tenant_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ★★★ العطلان ⑨/⑩: الإعلان من المستأجر نفسه — و RESTRICT لا CASCADE
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_posting_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_applications_posting_tenant_fkey') THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_posting_tenant_fkey
      FOREIGN KEY (posting_id, tenant_id)
      REFERENCES public.job_postings (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ★★★ العطل ②: المفردة الواحدة
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_applications_status_chk') THEN
    ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_status_chk
      CHECK (status IN ('applied','screening','interview','test','offer',
                        'hired','rejected','withdrawn'));
  END IF;
END $$;

ALTER TABLE public.job_applications ALTER COLUMN status SET DEFAULT 'applied';

-- ★ العطل ⑫: بريدٌ ذو شكلٍ معقول
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_applications_email_chk') THEN
    ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_email_chk
      CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_applications_name_chk') THEN
    ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_name_chk
      CHECK (btrim(applicant_name) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'job_applications_rating_chk') THEN
    ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_rating_chk
      CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));
  END IF;
END $$;

-- ★★ العطل ⑪: الفرادة على البريد المُطبَّع — للطلبات غير المسحوبة
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_applications_posting_email
  ON public.job_applications (tenant_id, posting_id, lower(btrim(email)))
  WHERE status <> 'withdrawn';

CREATE INDEX IF NOT EXISTS idx_job_postings_open
  ON public.job_postings (tenant_id, status) WHERE status = 'open';

-- ═══════════════════════════════════════════════════════════════════
--  ③ المحفّزات
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_job_posting_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- ★ العطل ⑮: المنشئ يُستنتج ولا يُؤخذ من العميل
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := public.current_user_tenant_id();
    END IF;
    -- ★ النشر يُسجَّل لحظته لا يُترك فارغاً
    IF NEW.status = 'open' AND NEW.posted_date IS NULL THEN
      NEW.posted_date := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.tenant_id  := OLD.tenant_id;
    IF NEW.status = 'open' AND OLD.status <> 'open' AND NEW.posted_date IS NULL THEN
      NEW.posted_date := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_job_posting_stamp ON public.job_postings;
CREATE TRIGGER trg_job_posting_stamp
  BEFORE INSERT OR UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.tg_job_posting_stamp();

-- ★ البريد يُطبَّع دائماً (وإلا التفّ المتقدّم على الفرادة بحرفٍ كبير)
CREATE OR REPLACE FUNCTION public.tg_job_application_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.applicant_name := btrim(NEW.applicant_name);
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id  := OLD.tenant_id;
    NEW.posting_id := OLD.posting_id;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.reviewed_by := COALESCE(auth.uid(), NEW.reviewed_by);
      NEW.reviewed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_job_application_stamp ON public.job_applications;
CREATE TRIGGER trg_job_application_stamp
  BEFORE INSERT OR UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_job_application_stamp();

-- ★ العطل ⑩: منع الحذف النهائيّ في الجدولين
CREATE OR REPLACE FUNCTION public.tg_block_recruitment_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'RECRUITMENT_DELETE_BLOCKED: سجلّات التوظيف لا تُحذف — استخدم الإلغاء أو السحب';
END $$;

DROP TRIGGER IF EXISTS trg_block_job_application_delete ON public.job_applications;
CREATE TRIGGER trg_block_job_application_delete
  BEFORE DELETE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_recruitment_delete();

DROP TRIGGER IF EXISTS trg_block_job_posting_delete ON public.job_postings;
CREATE TRIGGER trg_block_job_posting_delete
  BEFORE DELETE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_recruitment_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ④ الدوال
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.recruitment_board(TEXT, TEXT, INTEGER);
CREATE FUNCTION public.recruitment_board(
  p_search TEXT    DEFAULT NULL,
  p_status TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id            UUID,
  out_title         TEXT,
  out_position      TEXT,
  out_department    TEXT,
  out_employment_type TEXT,
  out_status        TEXT,
  out_vacancies     INTEGER,
  out_salary_min    NUMERIC,
  out_salary_max    NUMERIC,
  out_description   TEXT,
  out_requirements  TEXT[],
  out_posted_date   DATE,
  out_closing_date  DATE,
  out_days_left     INTEGER,
  out_is_expired    BOOLEAN,
  out_creator_name  TEXT,
  -- ★★ العطل ⑭: العدّاد الذي لم يكن موجوداً
  out_apps_total    INTEGER,
  out_apps_new      INTEGER,
  out_apps_progress INTEGER,
  out_apps_hired    INTEGER,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  -- ★★★ بغداد UTC+3 والخادم Etc/UTC (درس 0344)
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بلوح التوظيف';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.* FROM public.job_postings p
     WHERE p.tenant_id = v_tenant
       AND (p_status IS NULL OR p.status = p_status)
  ),
  apps AS (
    SELECT a.posting_id AS pid,
           count(*)::INTEGER AS total,
           count(*) FILTER (WHERE a.status = 'applied')::INTEGER AS fresh,
           count(*) FILTER (WHERE a.status IN
             ('screening','interview','test','offer'))::INTEGER AS progress,
           count(*) FILTER (WHERE a.status = 'hired')::INTEGER AS hired
      FROM public.job_applications a
      JOIN base b ON b.id = a.posting_id
     WHERE a.tenant_id = v_tenant
     GROUP BY a.posting_id
  )
  SELECT
    b.id, b.title::TEXT, COALESCE(b.position, '—')::TEXT,
    COALESCE(d.name_ar, '—')::TEXT,
    b.employment_type::TEXT, b.status::TEXT, b.vacancy_count,
    b.salary_min, b.salary_max, b.description,
    COALESCE(b.requirements, ARRAY[]::TEXT[]),
    b.posted_date, b.closing_date,
    -- ★ NULL = «بلا موعد إغلاق» لا «انتهى» (درس 0353)
    CASE WHEN b.closing_date IS NULL THEN NULL
         ELSE (b.closing_date - v_today)::INTEGER END,
    (b.closing_date IS NOT NULL AND b.closing_date < v_today),
    COALESCE(NULLIF(btrim(pr.full_name), ''), '—')::TEXT,
    COALESCE(ap.total, 0), COALESCE(ap.fresh, 0),
    COALESCE(ap.progress, 0), COALESCE(ap.hired, 0),
    b.created_at
  FROM base b
  LEFT JOIN apps ap ON ap.pid = b.id
  LEFT JOIN public.departments d
    ON d.id = b.department_id AND d.tenant_id = b.tenant_id
  LEFT JOIN public.profiles pr ON pr.id = b.created_by
 WHERE p_search IS NULL OR btrim(p_search) = ''
    OR b.title ILIKE '%' || btrim(p_search) || '%'
    OR COALESCE(b.position,'') ILIKE '%' || btrim(p_search) || '%'
    OR COALESCE(d.name_ar,'') ILIKE '%' || btrim(p_search) || '%'
 -- ★★★ المفتوح أولاً ثم الأحدث ثم id فاصلاً (درس 0357)
 ORDER BY (b.status = 'open') DESC, b.created_at DESC, b.id DESC
 LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.recruitment_board(TEXT, TEXT, INTEGER) IS
  'لوح التوظيف: استعلامٌ واحد مع عدّادات المتقدمين (العطل ⑭) وحالة '
  'الانتهاء بتوقيت بغداد.';

-- ─────────────────────────────────────────────────────────────────
--  ★★★ العطل ①: قائمة المتقدمين — كانت ترمي دائماً
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.recruitment_applications(UUID, TEXT);
CREATE FUNCTION public.recruitment_applications(
  p_posting UUID,
  p_status  TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_id          UUID,
  out_posting_id  UUID,
  out_name        TEXT,
  out_email       TEXT,
  out_phone       TEXT,
  out_resume_url  TEXT,
  out_cover_letter TEXT,
  out_status      TEXT,
  out_rating      INTEGER,
  out_notes       TEXT,
  out_rejection_reason TEXT,
  out_reviewer_name TEXT,
  out_reviewed_at TIMESTAMPTZ,
  out_hired_employee_id UUID,
  out_submitted_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بقائمة المتقدمين';
  END IF;

  RETURN QUERY
  SELECT a.id, a.posting_id, a.applicant_name::TEXT, a.email::TEXT,
         a.phone::TEXT, a.resume_url, a.cover_letter, a.status::TEXT,
         a.rating, a.notes, a.rejection_reason,
         COALESCE(NULLIF(btrim(pr.full_name), ''), '—')::TEXT,
         a.reviewed_at, a.hired_employee_id, a.submitted_at
    FROM public.job_applications a
    LEFT JOIN public.profiles pr ON pr.id = a.reviewed_by
   WHERE a.tenant_id = v_tenant
     AND (p_posting IS NULL OR a.posting_id = p_posting)
     AND (p_status IS NULL OR a.status = p_status)
   -- ★★★ الأجدر أوّلاً: hired ثم offer ثم… ثم الأحدث (لا ترتيبٌ أبجديّ)
   ORDER BY CASE a.status
              WHEN 'hired' THEN 1 WHEN 'offer' THEN 2 WHEN 'test' THEN 3
              WHEN 'interview' THEN 4 WHEN 'screening' THEN 5
              WHEN 'applied' THEN 6 WHEN 'rejected' THEN 7 ELSE 8 END,
            a.submitted_at DESC, a.id DESC;
END $$;

COMMENT ON FUNCTION public.recruitment_applications(UUID, TEXT) IS
  'قائمة المتقدمين. كانت findByJob تفلتر بـjob_id وترتّب بـapplied_at '
  'وكلاهما عمودٌ معدوم ⇒ الزرّ يرمي دائماً (العطل ①).';

DROP FUNCTION IF EXISTS public.recruitment_summary();
CREATE FUNCTION public.recruitment_summary()
RETURNS TABLE (
  out_open       INTEGER,
  out_draft      INTEGER,
  out_closed     INTEGER,
  out_vacancies  INTEGER,
  out_expired    INTEGER,
  out_apps_total INTEGER,
  out_apps_new   INTEGER,
  out_apps_hired INTEGER,
  out_no_apps    INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص التوظيف';
  END IF;

  RETURN QUERY
  WITH p AS (SELECT * FROM public.job_postings WHERE tenant_id = v_tenant),
       a AS (SELECT * FROM public.job_applications WHERE tenant_id = v_tenant)
  SELECT
    (SELECT count(*)::INTEGER FROM p WHERE status = 'open'),
    (SELECT count(*)::INTEGER FROM p WHERE status = 'draft'),
    (SELECT count(*)::INTEGER FROM p WHERE status IN ('closed','filled','cancelled')),
    (SELECT COALESCE(sum(vacancy_count),0)::INTEGER FROM p WHERE status = 'open'),
    -- ★ المفتوح الذي فات موعد إغلاقه — تناقضٌ يستحق الإبراز
    (SELECT count(*)::INTEGER FROM p
      WHERE status = 'open' AND closing_date IS NOT NULL AND closing_date < v_today),
    (SELECT count(*)::INTEGER FROM a WHERE status <> 'withdrawn'),
    (SELECT count(*)::INTEGER FROM a WHERE status = 'applied'),
    (SELECT count(*)::INTEGER FROM a WHERE status = 'hired'),
    -- ★★ إعلانٌ مفتوحٌ بلا متقدّم واحد
    (SELECT count(*)::INTEGER FROM p
      WHERE p.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM a WHERE a.posting_id = p.id
                          AND a.status <> 'withdrawn'));
END $$;

-- ─────────────────────────────────────────────────────────────────
--  الكتابة
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.job_posting_upsert(UUID, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC, INTEGER, DATE, TEXT[], TEXT);
CREATE FUNCTION public.job_posting_upsert(
  p_id         UUID,
  p_title      TEXT,
  p_description TEXT,
  p_position   TEXT    DEFAULT NULL,
  p_department UUID    DEFAULT NULL,
  p_type       TEXT    DEFAULT 'full_time',
  p_salary_min NUMERIC DEFAULT NULL,
  p_salary_max NUMERIC DEFAULT NULL,
  p_vacancies  INTEGER DEFAULT 1,
  p_closing    DATE    DEFAULT NULL,
  p_requirements TEXT[] DEFAULT NULL,
  p_status     TEXT    DEFAULT 'draft'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_AUTHORIZED';
  END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'RECRUITMENT_TITLE_REQUIRED';
  END IF;
  IF btrim(COALESCE(p_description,'')) = '' THEN
    RAISE EXCEPTION 'RECRUITMENT_DESCRIPTION_REQUIRED';
  END IF;
  IF p_status NOT IN ('draft','open','closed','filled','cancelled') THEN
    RAISE EXCEPTION 'RECRUITMENT_STATUS_INVALID: %', p_status;
  END IF;
  IF p_type NOT IN ('full_time','part_time','contract','temporary') THEN
    RAISE EXCEPTION 'RECRUITMENT_TYPE_INVALID: %', p_type;
  END IF;
  IF COALESCE(p_vacancies, 0) <= 0 THEN
    RAISE EXCEPTION 'RECRUITMENT_VACANCY_INVALID';
  END IF;
  IF p_salary_min IS NOT NULL AND p_salary_max IS NOT NULL
     AND p_salary_min > p_salary_max THEN
    RAISE EXCEPTION 'RECRUITMENT_SALARY_RANGE';
  END IF;
  IF p_closing IS NOT NULL AND p_closing < v_today THEN
    RAISE EXCEPTION 'RECRUITMENT_CLOSING_IN_PAST';
  END IF;
  IF p_department IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.departments d
                      WHERE d.id = p_department AND d.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'RECRUITMENT_DEPARTMENT_NOT_FOUND';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.job_postings
      (tenant_id, title, description, position, department_id, employment_type,
       salary_min, salary_max, vacancy_count, closing_date, requirements, status)
    VALUES
      (v_tenant, btrim(p_title), btrim(p_description),
       NULLIF(btrim(COALESCE(p_position,'')),''), p_department, p_type,
       p_salary_min, p_salary_max, p_vacancies, p_closing,
       COALESCE(p_requirements, ARRAY[]::TEXT[]), p_status)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.job_postings
       SET title = btrim(p_title), description = btrim(p_description),
           position = NULLIF(btrim(COALESCE(p_position,'')),''),
           department_id = p_department, employment_type = p_type,
           salary_min = p_salary_min, salary_max = p_salary_max,
           vacancy_count = p_vacancies, closing_date = p_closing,
           requirements = COALESCE(p_requirements, requirements),
           status = p_status, updated_at = now()
     WHERE id = p_id AND tenant_id = v_tenant
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_POSTING_NOT_FOUND'; END IF;
  END IF;

  RETURN v_id;
END $$;

DROP FUNCTION IF EXISTS public.application_submit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.application_submit(
  p_posting UUID,
  p_name    TEXT,
  p_email   TEXT,
  p_phone   TEXT DEFAULT NULL,
  p_resume  TEXT DEFAULT NULL,
  p_cover   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_status TEXT;
  v_close  DATE;
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_AUTHORIZED';
  END IF;

  -- ★★★ العطل ⑨: الإعلان من المستأجر نفسه
  SELECT p.status, p.closing_date INTO v_status, v_close
    FROM public.job_postings p
   WHERE p.id = p_posting AND p.tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_POSTING_NOT_FOUND'; END IF;
  -- ★★ لا تقديمَ على إعلانٍ غير مفتوح
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'RECRUITMENT_POSTING_NOT_OPEN: %', v_status;
  END IF;
  IF v_close IS NOT NULL AND v_close < v_today THEN
    RAISE EXCEPTION 'RECRUITMENT_POSTING_EXPIRED';
  END IF;
  IF btrim(COALESCE(p_name,'')) = '' THEN
    RAISE EXCEPTION 'RECRUITMENT_NAME_REQUIRED';
  END IF;
  IF lower(btrim(COALESCE(p_email,'')))
       !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'RECRUITMENT_EMAIL_INVALID';
  END IF;
  -- ★★ العطل ⑪: التكرار يُرفَض برمزٍ مفهوم قبل أن يرميه الفهرس
  IF EXISTS (SELECT 1 FROM public.job_applications a
              WHERE a.tenant_id = v_tenant AND a.posting_id = p_posting
                AND lower(btrim(a.email)) = lower(btrim(p_email))
                AND a.status <> 'withdrawn') THEN
    RAISE EXCEPTION 'RECRUITMENT_DUPLICATE_APPLICATION';
  END IF;

  INSERT INTO public.job_applications
    (tenant_id, posting_id, applicant_name, email, phone,
     resume_url, cover_letter, status)
  VALUES
    (v_tenant, p_posting, p_name, p_email,
     NULLIF(btrim(COALESCE(p_phone,'')),''),
     NULLIF(btrim(COALESCE(p_resume,'')),''),
     NULLIF(btrim(COALESCE(p_cover,'')),''), 'applied')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ★★ العطل ②: انتقالاتٌ محكومة بمفردةٍ واحدة
DROP FUNCTION IF EXISTS public.application_set_status(UUID, TEXT, TEXT, INTEGER);
CREATE FUNCTION public.application_set_status(
  p_id     UUID,
  p_status TEXT,
  p_reason TEXT    DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_AUTHORIZED';
  END IF;
  IF p_status NOT IN ('applied','screening','interview','test','offer',
                      'hired','rejected','withdrawn') THEN
    RAISE EXCEPTION 'RECRUITMENT_APP_STATUS_INVALID: %', p_status;
  END IF;
  -- ★★★ التوظيف لا يمرّ من هنا — له دالته التي تُنشئ الموظف
  IF p_status = 'hired' THEN
    RAISE EXCEPTION 'RECRUITMENT_USE_HIRE_FUNCTION: استخدم application_hire';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'RECRUITMENT_RATING_RANGE';
  END IF;

  SELECT a.status INTO v_old FROM public.job_applications a
   WHERE a.id = p_id AND a.tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_APPLICATION_NOT_FOUND'; END IF;
  -- ★★ الموظَّف لا يعود متقدّماً
  IF v_old = 'hired' THEN
    RAISE EXCEPTION 'RECRUITMENT_ALREADY_HIRED';
  END IF;
  IF p_status = 'rejected' AND btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'RECRUITMENT_REJECTION_REASON_REQUIRED';
  END IF;

  UPDATE public.job_applications
     SET status = p_status,
         rejection_reason = CASE WHEN p_status = 'rejected'
                                 THEN btrim(p_reason) ELSE rejection_reason END,
         rating = COALESCE(p_rating, rating),
         updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN p_status;
END $$;

-- ─────────────────────────────────────────────────────────────────
--  ★★★ العطل ⑬: الحلقة المفقودة — التوظيف يُنشئ موظفاً فعلاً
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.application_hire(UUID, TEXT, UUID);
CREATE FUNCTION public.application_hire(
  p_id       UUID,
  p_code     TEXT DEFAULT NULL,
  p_department UUID DEFAULT NULL
)
RETURNS TABLE (out_employee_id UUID, out_posting_status TEXT, out_left INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_app     RECORD;
  v_emp     UUID;
  v_code    TEXT;
  v_hired   INTEGER;
  v_vac     INTEGER;
  v_pstatus TEXT;
  v_first   TEXT;
  v_last    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_AUTHORIZED';
  END IF;

  SELECT a.*, p.vacancy_count, p.department_id AS pdept
    INTO v_app
    FROM public.job_applications a
    JOIN public.job_postings p
      ON p.id = a.posting_id AND p.tenant_id = a.tenant_id
   WHERE a.id = p_id AND a.tenant_id = v_tenant;
  IF v_app IS NULL THEN RAISE EXCEPTION 'RECRUITMENT_APPLICATION_NOT_FOUND'; END IF;
  IF v_app.status = 'hired' THEN RAISE EXCEPTION 'RECRUITMENT_ALREADY_HIRED'; END IF;
  IF v_app.status IN ('rejected','withdrawn') THEN
    RAISE EXCEPTION 'RECRUITMENT_CANNOT_HIRE: %', v_app.status;
  END IF;

  -- ★★ لا توظيفَ فوق عدد الشواغر
  SELECT count(*)::INTEGER INTO v_hired
    FROM public.job_applications
   WHERE tenant_id = v_tenant AND posting_id = v_app.posting_id
     AND status = 'hired';
  v_vac := v_app.vacancy_count;
  IF v_hired >= v_vac THEN
    RAISE EXCEPTION 'RECRUITMENT_NO_VACANCY_LEFT: % من %', v_hired, v_vac;
  END IF;

  -- ★ رمز الموظف: من العميل أو مُولَّد فريداً (لا 8 حروف — درس 0355)
  v_code := NULLIF(btrim(COALESCE(p_code,'')),'');
  IF v_code IS NULL THEN
    v_code := 'EMP-' || upper(substr(replace(gen_random_uuid()::TEXT,'-',''), 1, 10));
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees e
              WHERE e.tenant_id = v_tenant AND e.employee_code = v_code) THEN
    RAISE EXCEPTION 'RECRUITMENT_EMPLOYEE_CODE_TAKEN: %', v_code;
  END IF;

  v_first := COALESCE(NULLIF(split_part(btrim(v_app.applicant_name),' ',1),''), 'موظف');
  v_last  := NULLIF(btrim(substr(btrim(v_app.applicant_name),
                                 length(split_part(btrim(v_app.applicant_name),' ',1)) + 1)), '');

  INSERT INTO public.employees
    (tenant_id, employee_code, first_name, last_name, email,
     phone, department_id, is_active)
  VALUES
    (v_tenant, v_code, v_first, COALESCE(v_last, '—'), v_app.email,
     v_app.phone, COALESCE(p_department, v_app.pdept), TRUE)
  RETURNING id INTO v_emp;

  UPDATE public.job_applications
     SET status = 'hired', hired_employee_id = v_emp, updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  -- ★★★ والإعلان يُغلق تلقائياً حين تمتلئ الشواغر
  v_hired := v_hired + 1;
  IF v_hired >= v_vac THEN
    UPDATE public.job_postings SET status = 'filled', updated_at = now()
     WHERE id = v_app.posting_id AND tenant_id = v_tenant;
    v_pstatus := 'filled';
  ELSE
    SELECT status INTO v_pstatus FROM public.job_postings
     WHERE id = v_app.posting_id;
  END IF;

  RETURN QUERY SELECT v_emp, v_pstatus, (v_vac - v_hired);
END $$;

COMMENT ON FUNCTION public.application_hire(UUID, TEXT, UUID) IS
  'التوظيف: يُنشئ صفّ employees ويربطه بالطلب ويُغلق الإعلان عند '
  'امتلاء الشواغر — كل ذلك في معاملةٍ واحدة. كان تغيير الحالة إلى '
  'hired لا يفعل شيئاً (العطل ⑬).';

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE على كل دالة جديدة تلقائياً
--    (pg_default_acl) ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.recruitment_board(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recruitment_board(TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.recruitment_board(TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.recruitment_applications(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recruitment_applications(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.recruitment_applications(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.recruitment_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recruitment_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.recruitment_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.job_posting_upsert(UUID, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC, INTEGER, DATE, TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.job_posting_upsert(UUID, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC, INTEGER, DATE, TEXT[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.job_posting_upsert(UUID, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC, INTEGER, DATE, TEXT[], TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.application_submit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.application_submit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.application_submit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.application_set_status(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.application_set_status(UUID, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.application_set_status(UUID, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.application_hire(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.application_hire(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.application_hire(UUID, TEXT, UUID) TO authenticated;

COMMIT;
