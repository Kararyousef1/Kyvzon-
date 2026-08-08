-- ============================================================================
-- 0353_training_missing_columns.sql
--
-- الأعمدة الناقصة في منظومة التدريب — بقرار المستخدم:
--   «تابع العمل واضف الاعمده التي نحتاجها»
--
-- ═══════════════════════════════════════════════════════════════════════════
-- لماذا هذا المايجريشن؟
-- ═══════════════════════════════════════════════════════════════════════════
--
-- جولتا 0351 و0352 كشفتا **ثمانية حقول تقرؤها الشيفرة ولا وجود لها**.
-- عالجناها حينها بإسقاط عرضها (لأن عرض رقم بلا مصدر تضليل). وبقيت
-- ثلاثة أسئلة معلّقة طرحتُها عليك، وهذا المايجريشن يُجيبها بإضافة
-- الأعمدة فعلياً بدل إسقاط المؤشّرات.
--
-- ═══ ① درجة الاختبار ووقت الدراسة — `course_progress` ═════════════════════
--
--   الحالة المُحقَّقة قبل هذا المايجريشن (أحد عشر عموداً):
--     id · course_id · employee_id · progress · completed · approved
--     · started_at · completed_at · created_at · updated_at · tenant_id
--
--   والشيفرة كانت تقرأ (مُثبَت أن كلاً منها = 0 في information_schema):
--     score            ⇒ «متوسط الدرجات» صفر لكل دورة أبداً
--     time_spent       ⇒ «الوقت المستغرق» = «0ث» لكل مشارك
--     last_access_at   ⇒ «آخر وصول» لا يظهر في الجدول الزمني
--     progress_percent ⇒ **لا يُضاف** — الموجود `progress` وهو الصحيح
--
--   ⇒ نضيف الثلاثة الأولى. أما `progress_percent` فاسمٌ مكرّر لعمود
--     قائم — إضافته تُنشئ مصدرَي حقيقة متعارضين، وهذا أسوأ من العطل.
--
-- ═══ ② محتوى الوسائط — `courses.rich_content` ═════════════════════════════
--
--   تبويب «الصور والملفات» في `TrainingManagementPage` كان يجمع
--   `richContent` ويُرسله في الإدراج فيرفضه Postgres:
--     ERROR: column "rich_content" of relation "courses" does not exist
--   ⇒ التبويب كان يحفظ في الفراغ. نضيف العمود `JSONB`.
--
-- ═══ ③ محاولات الاختبار — جدول `quiz_attempts` مفقود بالكامل ══════════════
--
--   ★★★ اكتشاف هذه الجولة: `src/services/ai/quizAiService.ts` فيه منظومة
--   تحليل كاملة للمحاولات — `detectSuspiciousBehavior` و
--   `analyzePerformance` تقرأ `attempts[].score` و`suspiciousFlags` —
--   **ولا جدول لحفظ المحاولات إطلاقاً.**
--
--   مُثبَت: `quizzes` موجود (12 عموداً) و`quiz_attempts` ⇒ **0 صفوف في
--   information_schema.tables**.
--
--   ⇒ كل ذلك المنطق ميّت: لا شيء يُغذّيه. نُنشئ الجدول.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- مبدأ حاكم في هذا المايجريشن
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ **العمود المُضاف بلا كاتب يبقى صفراً — والصفر يُعرَض كأنه قياس.**
--   لذلك كل عمود هنا يُرافقه:
--     · قيد CHECK يمنع القيم المستحيلة (درجة سالبة · وقت سالب)
--     · دالة كتابة فعلية تملؤه (لا نترك عموداً يتيماً)
--     · وتحديث دوال 0351/0352 لتقرأه
--
-- ★ ولا يُعرَض أي مؤشّر جديد ما لم توجد عيّنة فعلية — تمييز
--   «لا قياس» عن «القياس صفر» محفوظ عبر NULL لا 0.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① أعمدة course_progress الناقصة
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.course_progress
  ADD COLUMN IF NOT EXISTS score          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS time_spent     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_access_at TIMESTAMPTZ;

-- ★ `score` يبقى NULL-able عمداً: «لم يُختبَر» ≠ «حصل صفراً».
--   لو جعلناه DEFAULT 0 لعاد العطل نفسه بثوب جديد — متوسط درجات
--   محسوب على من لم يخضعوا لاختبار أصلاً.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.course_progress'::regclass
       AND conname = 'course_progress_score_range'
  ) THEN
    ALTER TABLE public.course_progress
      ADD CONSTRAINT course_progress_score_range
      CHECK (score IS NULL OR (score >= 0 AND score <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.course_progress'::regclass
       AND conname = 'course_progress_time_spent_nonneg'
  ) THEN
    ALTER TABLE public.course_progress
      ADD CONSTRAINT course_progress_time_spent_nonneg
      CHECK (time_spent >= 0);
  END IF;

  -- ★ حارس منطقي: `progress` نسبة مئوية — والمخطط الأصلي لم يحرسها
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.course_progress'::regclass
       AND conname = 'course_progress_progress_range'
  ) THEN
    ALTER TABLE public.course_progress
      ADD CONSTRAINT course_progress_progress_range
      CHECK (progress >= 0 AND progress <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.course_progress.score IS
  'درجة الاختبار 0..100. NULL تعني «لم يُختبَر» — لا صفراً. التمييز '
  'مقصود: متوسطٌ يشمل غير المُختبَرين رقمٌ مضلِّل.';
COMMENT ON COLUMN public.course_progress.time_spent IS
  'الوقت المستغرق بالثواني. يُراكَم عبر training_progress_touch().';
COMMENT ON COLUMN public.course_progress.last_access_at IS
  'آخر وصول للمحتوى. NULL تعني «لم يُفتَح بعد».';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② محتوى الوسائط
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS rich_content JSONB NOT NULL DEFAULT '{"blocks":[]}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.courses'::regclass
       AND conname = 'courses_rich_content_shape'
  ) THEN
    -- ★ الشكل محروس: كائن يحوي مصفوفة blocks — وإلا انهارت الواجهة
    --   على `richContent.blocks.length` بقيمة غير متوقَّعة.
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_rich_content_shape
      CHECK (
        jsonb_typeof(rich_content) = 'object'
        AND jsonb_typeof(rich_content -> 'blocks') = 'array'
      );
  END IF;
END $$;

COMMENT ON COLUMN public.courses.rich_content IS
  'محتوى الوسائط {"blocks":[…]}. أُضيف في 0353 — كان تبويب «الصور '
  'والملفات» يُرسله فيرفضه Postgres (العمود غير موجود).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ جدول محاولات الاختبار — كان مفقوداً بالكامل
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
                   DEFAULT public.current_user_tenant_id(),
  quiz_id        UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  course_id      UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  score          NUMERIC(5,2),
  passed         BOOLEAN,
  answers        JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_secs  INTEGER NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT quiz_attempts_score_range
    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT quiz_attempts_duration_nonneg CHECK (duration_secs >= 0),
  CONSTRAINT quiz_attempts_number_positive CHECK (attempt_number >= 1),
  -- ★ محاولة مُسلَّمة يجب أن تحمل درجة — وإلا صارت سجلّاً بلا معنى
  CONSTRAINT quiz_attempts_submitted_has_score
    CHECK (submitted_at IS NULL OR score IS NOT NULL),
  -- ★ التسليم لا يسبق البدء
  CONSTRAINT quiz_attempts_time_order
    CHECK (submitted_at IS NULL OR submitted_at >= started_at),
  -- ★ رقم المحاولة فريد لكل موظف/اختبار — يمنع التكرار الصامت
  CONSTRAINT quiz_attempts_unique_number
    UNIQUE (tenant_id, quiz_id, employee_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_tenant_quiz
  ON public.quiz_attempts(tenant_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_employee
  ON public.quiz_attempts(tenant_id, employee_id);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- ★ الموظف يرى محاولاته وحده · والموظّفون (staff) يرون الكل.
--   لا فرع `tenant_id IS NULL` — درسُ 0350.
DROP POLICY IF EXISTS kyvzon_quiz_attempts_select ON public.quiz_attempts;
CREATE POLICY kyvzon_quiz_attempts_select ON public.quiz_attempts
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_quiz_attempts_insert ON public.quiz_attempts;
CREATE POLICY kyvzon_quiz_attempts_insert ON public.quiz_attempts
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

-- ★★★ لا تعديل ولا حذف للمحاولات: سجلّ اختبار يُعدَّل = سجلّ بلا قيمة.
--   (غياب سياسة UPDATE/DELETE يمنعهما لغير المالك تحت RLS.)

COMMENT ON TABLE public.quiz_attempts IS
  'محاولات الاختبارات. أُنشئ في 0353 — كان quizAiService يحلّل '
  'attempts[].score ولا جدول يحفظها إطلاقاً. لا UPDATE ولا DELETE: '
  'سجلّ اختبار قابل للتعديل بلا قيمة تدقيقية.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ كاتب فعليّ للأعمدة الجديدة — لا نترك عموداً يتيماً
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★★★ المبدأ: عمودٌ بلا كاتب يبقى صفراً، والصفر يُعرَض كأنه قياس.
--   هذه الدالة هي الكاتب الوحيد لـ`time_spent` و`last_access_at`.

DROP FUNCTION IF EXISTS public.training_progress_touch(UUID, INTEGER, NUMERIC);

CREATE FUNCTION public.training_progress_touch(
  p_course_id     UUID,
  p_seconds       INTEGER DEFAULT 0,
  p_progress      NUMERIC DEFAULT NULL
)
RETURNS TABLE(
  out_progress    NUMERIC,
  out_time_spent  INTEGER,
  out_completed   BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد الموظف الحالي';
  END IF;
  IF p_seconds IS NULL OR p_seconds < 0 THEN
    RAISE EXCEPTION 'الثواني لا تكون سالبة: %', p_seconds;
  END IF;
  -- ★ حدّ أعلى معقول لكل نبضة: 3600 ثانية.
  --   بلا هذا الحدّ يستطيع عميلٌ مُعطَّل إرسال رقم ضخم فيُفسد كل متوسط.
  IF p_seconds > 3600 THEN
    RAISE EXCEPTION 'نبضة وقت غير معقولة (% ثانية) — الحدّ 3600', p_seconds;
  END IF;
  IF p_progress IS NOT NULL AND (p_progress < 0 OR p_progress > 100) THEN
    RAISE EXCEPTION 'نسبة التقدّم خارج 0..100: %', p_progress;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courses c
     WHERE c.id = p_course_id AND c.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'الدورة غير موجودة أو لا تخصّ مستأجرك';
  END IF;

  INSERT INTO public.course_progress AS cp
    (tenant_id, course_id, employee_id, progress, time_spent, last_access_at)
  VALUES
    (v_tenant, p_course_id, v_emp, COALESCE(p_progress, 0), p_seconds, NOW())
  ON CONFLICT (employee_id, course_id) DO UPDATE
    SET time_spent     = cp.time_spent + EXCLUDED.time_spent,
        -- ★ التقدّم لا يتراجع: نبضة متأخّرة لا تمحو إنجازاً سابقاً
        progress       = GREATEST(cp.progress, COALESCE(p_progress, cp.progress)),
        last_access_at = NOW(),
        updated_at     = NOW();

  RETURN QUERY
  SELECT cp2.progress, cp2.time_spent, cp2.completed
    FROM public.course_progress cp2
   WHERE cp2.employee_id = v_emp AND cp2.course_id = p_course_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_progress_touch(UUID,INTEGER,NUMERIC)
  TO authenticated;

COMMENT ON FUNCTION public.training_progress_touch(UUID,INTEGER,NUMERIC) IS
  'الكاتب الوحيد لـtime_spent و last_access_at. يُراكم الثواني ولا '
  'يُنقص التقدّم. حدّ النبضة 3600 ثانية يمنع إفساد المتوسطات.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ تسجيل محاولة اختبار — الكاتب الوحيد لـscore
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_quiz_submit(UUID, NUMERIC, JSONB, INTEGER);

CREATE FUNCTION public.training_quiz_submit(
  p_quiz_id  UUID,
  p_score    NUMERIC,
  p_answers  JSONB   DEFAULT '[]'::jsonb,
  p_duration INTEGER DEFAULT 0
)
RETURNS TABLE(
  out_attempt_id     UUID,
  out_attempt_number INTEGER,
  out_score          NUMERIC,
  out_passed         BOOLEAN,
  out_best_score     NUMERIC
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_emp     UUID := public.current_user_employee_id();
  v_course  UUID;
  v_pass    INTEGER;
  v_n       INTEGER;
  v_id      UUID;
  v_passed  BOOLEAN;
  v_best    NUMERIC;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد الموظف الحالي';
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'الدرجة خارج 0..100: %', p_score;
  END IF;
  IF p_duration IS NULL OR p_duration < 0 THEN
    RAISE EXCEPTION 'المدة لا تكون سالبة: %', p_duration;
  END IF;

  SELECT q.course_id, COALESCE(q.passing_score, 60)
    INTO v_course, v_pass
    FROM public.quizzes q
   WHERE q.id = p_quiz_id AND q.tenant_id = v_tenant;

  IF v_course IS NULL AND NOT FOUND THEN
    RAISE EXCEPTION 'الاختبار غير موجود أو لا يخصّ مستأجرك';
  END IF;

  SELECT COALESCE(max(a.attempt_number), 0) + 1 INTO v_n
    FROM public.quiz_attempts a
   WHERE a.tenant_id = v_tenant AND a.quiz_id = p_quiz_id
     AND a.employee_id = v_emp;

  v_passed := p_score >= v_pass;

  INSERT INTO public.quiz_attempts(
    tenant_id, quiz_id, employee_id, course_id, attempt_number,
    score, passed, answers, duration_secs, submitted_at)
  VALUES (
    v_tenant, p_quiz_id, v_emp, v_course, v_n,
    p_score, v_passed, COALESCE(p_answers, '[]'::jsonb), p_duration, NOW())
  RETURNING id INTO v_id;

  -- ★ أفضل درجة عبر المحاولات — لا آخر درجة.
  --   من رسب ثم نجح يستحقّ نجاحه؛ ومن نجح ثم جرّب ثانيةً لا يُعاقَب.
  SELECT max(a.score) INTO v_best
    FROM public.quiz_attempts a
   WHERE a.tenant_id = v_tenant AND a.quiz_id = p_quiz_id
     AND a.employee_id = v_emp;

  -- تحديث سجلّ التقدّم بأفضل درجة
  IF v_course IS NOT NULL THEN
    UPDATE public.course_progress cp
       SET score      = v_best,
           completed  = cp.completed OR v_passed,
           completed_at = CASE
             WHEN cp.completed_at IS NULL AND v_passed THEN NOW()
             ELSE cp.completed_at END,
           updated_at = NOW()
     WHERE cp.tenant_id = v_tenant
       AND cp.course_id = v_course
       AND cp.employee_id = v_emp;
  END IF;

  RETURN QUERY SELECT v_id, v_n, p_score, v_passed, v_best;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_quiz_submit(UUID,NUMERIC,JSONB,INTEGER)
  TO authenticated;

COMMENT ON FUNCTION public.training_quiz_submit(UUID,NUMERIC,JSONB,INTEGER) IS
  'تسجيل محاولة اختبار — الكاتب الوحيد لـcourse_progress.score. '
  'يُسند **أفضل** درجة لا آخرها، ورقم المحاولة يُحسب في القاعدة '
  'لا في المتصفح (سباق التزامن).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ تحديث دوال 0351 لتقرأ الأعمدة الجديدة
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ العمود المُضاف بلا قارئ لا قيمة له. `training_course_stats` كانت
--   تُرجع `avg_progress` وحده — نضيف الدرجة والوقت **مع تمييز
--   «لا قياس» عن «القياس صفر»** عبر عدّ العيّنات.

DROP FUNCTION IF EXISTS public.training_course_stats(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION public.training_course_stats(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  out_id              UUID,
  out_title           TEXT,
  out_category        TEXT,
  out_level           TEXT,
  out_status          TEXT,
  out_mandatory       BOOLEAN,
  out_enrolled        INTEGER,
  out_completed       INTEGER,
  out_in_progress     INTEGER,
  out_not_started     INTEGER,
  out_avg_progress    NUMERIC,
  out_completion_rate NUMERIC,
  out_approved        INTEGER,
  out_avg_score       NUMERIC,
  out_scored_count    INTEGER,
  out_total_time      BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض تقارير التدريب';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH prog AS (
    SELECT cp.course_id, cp.progress, cp.completed, cp.approved,
           cp.score, cp.time_spent
      FROM public.course_progress cp
     WHERE cp.tenant_id = v_tenant
       AND (p_from IS NULL OR cp.started_at >= p_from)
       AND (p_to   IS NULL OR cp.started_at <= p_to)
  ),
  agg AS (
    SELECT
      course_id,
      count(*)::INTEGER                                        AS enrolled,
      count(*) FILTER (WHERE completed)::INTEGER               AS completed,
      count(*) FILTER (WHERE NOT completed AND progress > 0)::INTEGER AS in_prog,
      count(*) FILTER (WHERE NOT completed AND progress = 0)::INTEGER AS not_started,
      round(avg(progress), 1)                                  AS avg_progress,
      count(*) FILTER (WHERE approved)::INTEGER                AS approved,
      -- ★★★ `avg` يتجاهل NULL تلقائياً ⇒ المتوسط على من اختُبروا وحدهم.
      --   ولا نستعمل COALESCE(score,0) — ذلك يُدخل غير المُختبَرين
      --   في المتوسط ويُعيد العطل نفسه بثوب جديد.
      round(avg(score), 1)                                     AS avg_score,
      count(score)::INTEGER                                    AS scored_count,
      sum(time_spent)::BIGINT                                  AS total_time
      FROM prog GROUP BY course_id
  )
  SELECT
    c.id,
    c.title::TEXT,
    c.category::TEXT,
    c.level::TEXT,
    c.status::TEXT,
    c.mandatory,
    COALESCE(agg.enrolled, 0),
    COALESCE(agg.completed, 0),
    COALESCE(agg.in_prog, 0),
    COALESCE(agg.not_started, 0),
    COALESCE(agg.avg_progress, 0),
    CASE WHEN COALESCE(agg.enrolled,0) > 0
         THEN round(agg.completed * 100.0 / agg.enrolled, 1) ELSE 0 END,
    COALESCE(agg.approved, 0),
    -- ★ NULL لا صفر حين لا عيّنة — «لم يُختبَر أحد» ≠ «متوسطهم صفر»
    agg.avg_score,
    COALESCE(agg.scored_count, 0),
    COALESCE(agg.total_time, 0)
    FROM public.courses c
    LEFT JOIN agg ON agg.course_id = c.id
   WHERE c.tenant_id = v_tenant
   ORDER BY COALESCE(agg.enrolled,0) DESC, c.title;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_course_stats(TIMESTAMPTZ,TIMESTAMPTZ)
  TO authenticated;

COMMENT ON FUNCTION public.training_course_stats(TIMESTAMPTZ,TIMESTAMPTZ) IS
  'إحصاءات الدورات. منذ 0353 تُرجع avg_score و scored_count و total_time. '
  'المتوسط على المُختبَرين وحدهم (avg يتجاهل NULL) و NULL حين لا عيّنة — '
  'تمييز «لا قياس» عن «القياس صفر».';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑦ المشاركون — الدرجة والوقت
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_participants(UUID, TEXT);

CREATE FUNCTION public.training_participants(
  p_course_id UUID DEFAULT NULL,
  p_search    TEXT DEFAULT NULL
)
RETURNS TABLE(
  out_employee_id    UUID,
  out_employee_name  TEXT,
  out_department     TEXT,
  out_course_id      UUID,
  out_course_title   TEXT,
  out_progress       NUMERIC,
  out_completed      BOOLEAN,
  out_approved       BOOLEAN,
  out_started_at     TIMESTAMPTZ,
  out_completed_at   TIMESTAMPTZ,
  out_status_label   TEXT,
  out_score          NUMERIC,
  out_time_spent     INTEGER,
  out_last_access_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض المشاركين';
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.department_id, e.user_id,
           COALESCE(
             NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
             NULLIF(btrim(p.full_name), ''),
             'موظف بلا اسم'
           ) AS display_name
      FROM public.employees e
      LEFT JOIN public.profiles p ON p.id = e.user_id
     WHERE e.tenant_id = v_tenant
       AND e.is_active IS NOT FALSE
  )
  SELECT
    emp.id,
    emp.display_name::TEXT,
    COALESCE(d.name_ar, '—')::TEXT,
    cp.course_id,
    COALESCE(c.title, '—')::TEXT,
    COALESCE(cp.progress, 0),
    COALESCE(cp.completed, false),
    COALESCE(cp.approved, false),
    cp.started_at,
    cp.completed_at,
    CASE
      WHEN cp.id IS NULL           THEN 'لم يلتحق'
      WHEN cp.completed            THEN 'مكتمل'
      WHEN cp.progress > 0         THEN 'قيد التنفيذ'
      ELSE                              'لم يبدأ'
    END::TEXT,
    -- ★ NULL محفوظة: «لم يُختبَر» ≠ «صفر»
    cp.score,
    COALESCE(cp.time_spent, 0),
    cp.last_access_at
    FROM emp
    LEFT JOIN public.departments d ON d.id = emp.department_id
    LEFT JOIN public.course_progress cp
           ON cp.employee_id = emp.id
          AND cp.tenant_id   = v_tenant
          AND (p_course_id IS NULL OR cp.course_id = p_course_id)
    LEFT JOIN public.courses c
           ON c.id = cp.course_id AND c.tenant_id = v_tenant
   WHERE (
     v_q IS NULL
     OR emp.display_name ILIKE '%' || v_q || '%'
     OR COALESCE(d.name_ar,'') ILIKE '%' || v_q || '%'
     OR COALESCE(c.title,'')   ILIKE '%' || v_q || '%'
   )
   ORDER BY emp.display_name, c.title NULLS FIRST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_participants(UUID,TEXT) TO authenticated;

COMMENT ON FUNCTION public.training_participants(UUID,TEXT) IS
  'المشاركون مع الدرجة والوقت وآخر وصول (أُضيفت في 0353). '
  'score تبقى NULL لمن لم يُختبَر — لا تُحوَّل صفراً.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑧ تحليل محاولات موظف — يُغذّي quizAiService الميّت
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_quiz_attempts(UUID, UUID);

CREATE FUNCTION public.training_quiz_attempts(
  p_quiz_id     UUID DEFAULT NULL,
  p_employee_id UUID DEFAULT NULL
)
RETURNS TABLE(
  out_id             UUID,
  out_employee_id    UUID,
  out_employee_name  TEXT,
  out_quiz_id        UUID,
  out_attempt_number INTEGER,
  out_score          NUMERIC,
  out_passed         BOOLEAN,
  out_duration_secs  INTEGER,
  out_submitted_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_self   UUID := public.current_user_employee_id();
  v_staff  BOOLEAN := public.current_user_is_staff();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  -- ★ الموظف يرى محاولاته وحده — ولا يستطيع تمرير معرّف زميله
  IF NOT v_staff AND p_employee_id IS NOT NULL AND p_employee_id <> v_self THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض محاولات موظف آخر';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.employee_id,
    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
      NULLIF(btrim(p.full_name), ''),
      'موظف بلا اسم'
    )::TEXT,
    a.quiz_id,
    a.attempt_number,
    a.score,
    a.passed,
    a.duration_secs,
    a.submitted_at
    FROM public.quiz_attempts a
    LEFT JOIN public.employees e ON e.id = a.employee_id
    LEFT JOIN public.profiles  p ON p.id = e.user_id
   WHERE a.tenant_id = v_tenant
     AND (p_quiz_id IS NULL OR a.quiz_id = p_quiz_id)
     AND (p_employee_id IS NULL OR a.employee_id = p_employee_id)
     AND (v_staff OR a.employee_id = v_self)
   ORDER BY a.employee_id, a.attempt_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_quiz_attempts(UUID,UUID) TO authenticated;

COMMENT ON FUNCTION public.training_quiz_attempts(UUID,UUID) IS
  'محاولات الاختبار — تُغذّي quizAiService الذي كان يحلّل جدولاً '
  'غير موجود. غير الموظّفين يرون محاولاتهم وحدها.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑨ توصيل rich_content بدالة الإنشاء/التعديل
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ العمود أُضيف أعلاه، لكن `training_course_upsert` (من 0352) لا تعرفه
--   ⇒ تبويب «الصور والملفات» يبقى يحفظ في الفراغ رغم وجود العمود.
--   **عمودٌ بلا كاتب = عمود يتيم** — وهذا ما يمنعه مبدأ هذا المايجريشن.

DROP FUNCTION IF EXISTS public.training_course_upsert(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT,
  TEXT[], TEXT[], TEXT);
DROP FUNCTION IF EXISTS public.training_course_upsert(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT,
  TEXT[], TEXT[], TEXT, JSONB);

CREATE FUNCTION public.training_course_upsert(
  p_id          UUID    DEFAULT NULL,
  p_title       TEXT    DEFAULT NULL,
  p_title_en    TEXT    DEFAULT NULL,
  p_description TEXT    DEFAULT NULL,
  p_description_en TEXT DEFAULT NULL,
  p_category    TEXT    DEFAULT NULL,
  p_level       TEXT    DEFAULT NULL,
  p_duration    TEXT    DEFAULT NULL,
  p_points      INTEGER DEFAULT 0,
  p_mandatory   BOOLEAN DEFAULT FALSE,
  p_instructor  TEXT    DEFAULT NULL,
  p_tags        TEXT[]  DEFAULT '{}',
  p_objectives  TEXT[]  DEFAULT '{}',
  p_status      TEXT    DEFAULT 'active',
  p_rich_content JSONB  DEFAULT NULL
)
RETURNS TABLE(
  out_id      UUID,
  out_title   TEXT,
  out_status  TEXT,
  out_created BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
  v_new    BOOLEAN := FALSE;
  v_rich   JSONB;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية إدارة الدورات';
  END IF;
  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'عنوان الدورة مطلوب';
  END IF;
  IF p_status NOT IN ('active','inactive','archived') THEN
    RAISE EXCEPTION 'حالة غير مسموحة: % — المسموح active·inactive·archived', p_status;
  END IF;
  IF p_level IS NOT NULL AND p_level NOT IN ('مبتدئ','متوسط','متقدم','خبير') THEN
    RAISE EXCEPTION 'مستوى غير مسموح: % — المسموح مبتدئ·متوسط·متقدم·خبير', p_level;
  END IF;
  IF COALESCE(p_points, 0) < 0 THEN
    RAISE EXCEPTION 'النقاط لا تكون سالبة: %', p_points;
  END IF;

  -- ★ الشكل محروس هنا برسالة مفهومة قبل أن يرفضه CHECK برسالة Postgres
  IF p_rich_content IS NOT NULL
     AND (jsonb_typeof(p_rich_content) <> 'object'
          OR jsonb_typeof(p_rich_content -> 'blocks') <> 'array') THEN
    RAISE EXCEPTION 'محتوى الوسائط يجب أن يكون كائناً يحوي مصفوفة blocks';
  END IF;
  v_rich := COALESCE(p_rich_content, '{"blocks":[]}'::jsonb);

  IF p_id IS NULL THEN
    INSERT INTO public.courses(
      tenant_id, title, title_en, description, description_en,
      category, level, duration, points, mandatory, instructor,
      tags, objectives, status, rich_content, created_at, updated_at)
    VALUES (
      v_tenant, btrim(p_title), NULLIF(btrim(COALESCE(p_title_en,'')),''),
      COALESCE(NULLIF(btrim(COALESCE(p_description,'')),''), '—'),
      NULLIF(btrim(COALESCE(p_description_en,'')),''),
      COALESCE(NULLIF(btrim(COALESCE(p_category,'')),''), 'عام'),
      COALESCE(p_level, 'مبتدئ'),
      COALESCE(NULLIF(btrim(COALESCE(p_duration,'')),''), 'ساعة'),
      COALESCE(p_points, 0), COALESCE(p_mandatory, FALSE),
      NULLIF(btrim(COALESCE(p_instructor,'')),''),
      COALESCE(p_tags,'{}'), COALESCE(p_objectives,'{}'),
      p_status, v_rich, NOW(), NOW())
    RETURNING id INTO v_id;
    v_new := TRUE;
  ELSE
    UPDATE public.courses c
       SET title          = btrim(p_title),
           title_en       = NULLIF(btrim(COALESCE(p_title_en,'')),''),
           description    = COALESCE(NULLIF(btrim(COALESCE(p_description,'')),''), c.description),
           description_en = NULLIF(btrim(COALESCE(p_description_en,'')),''),
           category       = COALESCE(NULLIF(btrim(COALESCE(p_category,'')),''), c.category),
           level          = COALESCE(p_level, c.level),
           duration       = COALESCE(NULLIF(btrim(COALESCE(p_duration,'')),''), c.duration),
           points         = COALESCE(p_points, c.points),
           mandatory      = COALESCE(p_mandatory, c.mandatory),
           instructor     = NULLIF(btrim(COALESCE(p_instructor,'')),''),
           tags           = COALESCE(p_tags, c.tags),
           objectives     = COALESCE(p_objectives, c.objectives),
           status         = p_status,
           -- ★ NULL تعني «لا تُغيّر» — لا «امسح المحتوى»
           rich_content   = COALESCE(p_rich_content, c.rich_content),
           updated_at     = NOW()
     WHERE c.id = p_id AND c.tenant_id = v_tenant
    RETURNING c.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'الدورة غير موجودة أو لا تخصّ مستأجرك';
    END IF;
  END IF;

  RETURN QUERY
  SELECT c.id, c.title::TEXT, c.status::TEXT, v_new
    FROM public.courses c WHERE c.id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_course_upsert(
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT[],TEXT[],TEXT,JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.training_course_upsert(
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT[],TEXT[],TEXT,JSONB) IS
  'إنشاء/تعديل دورة. أُضيف p_rich_content في 0353 — كان تبويب «الصور '
  'والملفات» يحفظ في الفراغ. NULL تعني «لا تُغيّر» لا «امسح».';

COMMIT;
