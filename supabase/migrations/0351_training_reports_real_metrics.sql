-- ============================================================================
-- 0351_training_reports_real_metrics.sql
--
-- بوابة الموارد البشرية — المرحلة 4: `hr/TrainingReportsPage` (761 سطراً).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً على Postgres محلي (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطل ① — ★★★ خمسة أعمدة وهمية تُقرأ في كل حساب ═══════════════════════
--
--   الصفحة تُعرّف `CourseProgressDB` بحقول لا وجود لها في المخطط.
--   مُثبَت بالاستعلام عن `information_schema.columns`:
--
--     العمود المقروء        موجود؟
--     ─────────────────────────────
--     progress_percent        0     ← الموجود اسمه `progress`
--     score                   0     ← لا وجود له إطلاقاً
--     time_spent              0     ← لا وجود له إطلاقاً
--     last_access_at          0     ← لا وجود له إطلاقاً
--     courses.active          0     ← الموجود اسمه `status`
--
--   `course_progress` الحقيقي أحد عشر عموداً:
--     id · course_id · employee_id · progress NUMERIC · completed BOOLEAN
--     · approved BOOLEAN · started_at · completed_at · created_at
--     · updated_at · tenant_id
--
--   الأثر المُقاس (دورة واحدة · موظفان · progress = 100 و45):
--     متوسط progress الحقيقي = 72.5
--     الصفحة تقرأ `p.progress_percent` ⇒ undefined
--       ⇒ شريط التقدّم `width: 0%` ويُلوَّن **أحمر** لكل مشارك
--       ⇒ حتى من أتمّ الدورة بنسبة 100% يظهر عند الصفر
--     `p.score`      ⇒ undefined ⇒ `avgScore` صفر لكل دورة أبداً
--                                  و«متوسط الدرجات» صفر في لوحة المؤشرات
--     `p.time_spent` ⇒ undefined ⇒ «0ث» لكل مشارك
--     `course.active`⇒ undefined ⇒ falsy ⇒ «الدورات النشطة: 0» أبداً
--                                  (بينما `status='active'` ⇒ 1)
--
--   ⇒ **صفحة تقارير كاملة أصفارها ليست قياساً بل أعمدة معدومة.**
--
-- ═══ العطل ② — «تصدير التقرير» زرٌّ لا يُصدِّر ═════════════════════════════
--
--   `TrainingReportsPage.tsx:453`
--     const handleExport = () => addToast('تم تحميل التقرير بصيغة PDF', 'success');
--
--   لا ملف يُولَّد ولا تنزيل يحدث. **الرسالة تكذب على المستخدم**:
--   تقول «تم تحميل التقرير» ولم يُحمَّل شيء.
--
-- ═══ العطل ③ — مُرشِّح المدة معطّل ═════════════════════════════════════════
--
--   `:263` `const [timeRange, setTimeRange] = useState<TimeRange>('all');`
--   `:491` `<select value={timeRange} onChange={… setTimeRange(…)}>`
--
--   وذلك **كل** ما في الملف عن `timeRange` — لا موضع ثالث يقرؤه.
--   ⇒ «آخر 6 أشهر / هذه السنة / الكل» زينة لا أثر لها على أي رقم.
--
-- ═══ العطل ④ — `toggleActive` يكتب عموداً غير موجود ════════════════════════
--
--   `TrainingService.ts:34`  return this.update(id, { active });
--
--   مُثبَت بالتشغيل:
--     UPDATE courses SET active = false WHERE id = …
--       ⇒ ERROR: column "active" of relation "courses" does not exist
--
--   ⇒ تفعيل/تعطيل أي دورة **يفشل دائماً**.
--
-- ═══ العطل ⑤ — `deleteCourse` حذف نهائي ════════════════════════════════════
--
--   `TrainingService.ts:30`  async deleteCourse(id) { return this.delete(id); }
--
--   و`course_progress.course_id` مفتاح أجنبي **ON DELETE CASCADE**
--   ⇒ حذف دورة يمحو **كل سجلّات تقدّم الموظفين فيها** بلا أثر ولا رجعة.
--   وهذا يخالف قاعدة المشروع: لا حذف نهائي — أرشفة أو تعطيل.
--   والمخطط يدعم ذلك أصلاً: `status ∈ active·inactive·archived`.
--
-- ═══ العطل ⑥ — «تحليل AI» ليس تحليلاً ولا AI ══════════════════════════════
--
--   `:424` `handleGenerateAIAnalysis` سلسلة `if/else` على `progress.score`
--   و`progress.time_spent` — **وكلاهما عمود معدوم** ⇒ كل الفروع تسقط
--   ويبقى سطر واحد: «إجمالي وقت التدريب: —».
--   والزرّ موسوم «توليد تحليل بالذكاء الاصطناعي».
--
-- ═══ العطل ⑦ — عدّ الأقسام يعتمد نصّاً حرّاً ═══════════════════════════════
--
--   الصفحة تبني `deptMap` من `departmentService` ثم تُطابق بالاسم النصّي،
--   والقسم بلا موظفين يختفي (`filter(d => d.employees > 0)`).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ما يفعله هذا المايجريشن
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ① `training_course_stats(from,to)`     — صفّ لكل دورة بأعمدة حقيقية
--   ② `training_monthly_trend(months)`     — سلسلة زمنية حقيقية
--   ③ `training_department_stats(from,to)` — من `departments` لا من نصّ
--   ④ `training_participants(course_id,q)` — المشاركون بالبحث والترشيح
--   ⑤ `training_course_archive(id,status)` — بديل الحذف النهائي
--
--   الأربع الأولى `STABLE`، والخامسة `VOLATILE` (تكتب).
--   كلها `SECURITY DEFINER` · `search_path=public` · تُرشّح بالمستأجر.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① إحصاءات الدورات
-- ═══════════════════════════════════════════════════════════════════════════

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
  out_approved        INTEGER
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
    -- ★ العطل ①: `progress` هو العمود الموجود — لا `progress_percent`.
    -- ★ العطل ③: النطاق يُطبَّق فعلاً على تاريخ الالتحاق.
    SELECT cp.course_id, cp.progress, cp.completed, cp.approved
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
      count(*) FILTER (WHERE approved)::INTEGER                AS approved
      FROM prog GROUP BY course_id
  )
  SELECT
    c.id,
    c.title::TEXT,
    c.category::TEXT,
    c.level::TEXT,
    -- ★ العطل ①: `status` هو العمود الموجود — لا `active`
    c.status::TEXT,
    c.mandatory,
    COALESCE(agg.enrolled, 0),
    COALESCE(agg.completed, 0),
    COALESCE(agg.in_prog, 0),
    COALESCE(agg.not_started, 0),
    COALESCE(agg.avg_progress, 0),
    CASE WHEN COALESCE(agg.enrolled,0) > 0
         THEN round(agg.completed * 100.0 / agg.enrolled, 1) ELSE 0 END,
    COALESCE(agg.approved, 0)
    FROM public.courses c
    LEFT JOIN agg ON agg.course_id = c.id
   WHERE c.tenant_id = v_tenant
   ORDER BY COALESCE(agg.enrolled,0) DESC, c.title;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_course_stats(TIMESTAMPTZ,TIMESTAMPTZ)
  TO authenticated;

COMMENT ON FUNCTION public.training_course_stats(TIMESTAMPTZ,TIMESTAMPTZ) IS
  'إحصاءات الدورات بأعمدة حقيقية: progress لا progress_percent، و status '
  'لا active (العطل ①)، ومع نطاق زمني يُطبَّق فعلاً (العطل ③).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② الاتجاه الشهري
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_monthly_trend(INTEGER);

CREATE FUNCTION public.training_monthly_trend(p_months INTEGER DEFAULT 12)
RETURNS TABLE(
  out_month_start   DATE,
  out_enrollments   INTEGER,
  out_completions   INTEGER,
  out_avg_progress  NUMERIC
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
  IF p_months IS NULL OR p_months < 1 OR p_months > 36 THEN
    RAISE EXCEPTION 'عدد الأشهر يجب أن يكون بين 1 و36، ووصل: %', p_months;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
             date_trunc('month', CURRENT_DATE)::DATE
               - ((p_months - 1) || ' months')::INTERVAL,
             date_trunc('month', CURRENT_DATE)::DATE,
             '1 month'::INTERVAL
           )::DATE AS m
  ),
  -- ★ التوقيت المحلي صراحةً: الخادم على Etc/UTC، والالتحاق ليلاً
  --   في بغداد قد يُنسب للشهر السابق لولا التحويل.
  enr AS (
    SELECT date_trunc('month', cp.started_at AT TIME ZONE 'Asia/Baghdad')::DATE AS m,
           count(*)::INTEGER AS n,
           round(avg(cp.progress), 1) AS avg_p
      FROM public.course_progress cp
     WHERE cp.tenant_id = v_tenant
     GROUP BY 1
  ),
  cmp AS (
    SELECT date_trunc('month', cp.completed_at AT TIME ZONE 'Asia/Baghdad')::DATE AS m,
           count(*)::INTEGER AS n
      FROM public.course_progress cp
     WHERE cp.tenant_id = v_tenant
       AND cp.completed
       AND cp.completed_at IS NOT NULL
     GROUP BY 1
  )
  SELECT months.m,
         COALESCE(enr.n, 0),
         COALESCE(cmp.n, 0),
         COALESCE(enr.avg_p, 0)
    FROM months
    LEFT JOIN enr ON enr.m = months.m
    LEFT JOIN cmp ON cmp.m = months.m
   ORDER BY months.m;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_monthly_trend(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.training_monthly_trend(INTEGER) IS
  'اتجاه التدريب بالشهر. الأشهر الخالية تظهر بأصفار ولا تُطوى، '
  'والتوقيت Asia/Baghdad صراحةً لا توقيت الخادم.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ إحصاءات الأقسام
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_department_stats(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION public.training_department_stats(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  out_department_id   UUID,
  out_department_name TEXT,
  out_employees       INTEGER,
  out_enrolled        INTEGER,
  out_trained         INTEGER,
  out_pending         INTEGER,
  out_completion_rate NUMERIC,
  out_avg_progress    NUMERIC
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
  WITH emp AS (
    SELECT e.id, e.department_id
      FROM public.employees e
     WHERE e.tenant_id = v_tenant
       AND e.is_active IS NOT FALSE
  ),
  prog AS (
    -- ★ course_progress.employee_id → employees(id) مباشرةً
    SELECT e.department_id, cp.employee_id, cp.completed, cp.progress
      FROM public.course_progress cp
      JOIN emp e ON e.id = cp.employee_id
     WHERE cp.tenant_id = v_tenant
       AND (p_from IS NULL OR cp.started_at >= p_from)
       AND (p_to   IS NULL OR cp.started_at <= p_to)
  ),
  emp_cnt AS (
    SELECT department_id, count(*)::INTEGER AS n FROM emp GROUP BY department_id
  ),
  agg AS (
    SELECT department_id,
           count(DISTINCT employee_id)::INTEGER AS enrolled,
           count(DISTINCT employee_id) FILTER (WHERE completed)::INTEGER AS trained,
           round(avg(progress), 1) AS avg_p
      FROM prog GROUP BY department_id
  )
  SELECT
    d.id,
    d.name_ar,
    COALESCE(emp_cnt.n, 0),
    COALESCE(agg.enrolled, 0),
    COALESCE(agg.trained, 0),
    GREATEST(COALESCE(emp_cnt.n,0) - COALESCE(agg.trained,0), 0),
    CASE WHEN COALESCE(emp_cnt.n,0) > 0
         THEN round(COALESCE(agg.trained,0) * 100.0 / emp_cnt.n, 1) ELSE 0 END,
    COALESCE(agg.avg_p, 0)
    FROM public.departments d
    LEFT JOIN emp_cnt ON emp_cnt.department_id = d.id
    LEFT JOIN agg     ON agg.department_id     = d.id
   WHERE d.tenant_id = v_tenant
   ORDER BY COALESCE(emp_cnt.n,0) DESC, d.name_ar;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_department_stats(TIMESTAMPTZ,TIMESTAMPTZ)
  TO authenticated;

COMMENT ON FUNCTION public.training_department_stats(TIMESTAMPTZ,TIMESTAMPTZ) IS
  'إحصاءات تدريب الأقسام من جدول departments عبر employees.department_id '
  'لا من نصّ حرّ (العطل ⑦). والقسم الخالي يظهر بأصفار ولا يختفي.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ المشاركون
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
  out_status_label   TEXT
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
           -- ★ `employees.full_name_ar` فارغ لكل موظف (محفّز 0317 يملأ
           --   first_name/last_name فقط) ⇒ سلسلة احتياطية إلزامية،
           --   وإلا ظهر «بدون اسم» في ثماني صفحات.
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
    END::TEXT
    FROM emp
    LEFT JOIN public.departments d ON d.id = emp.department_id
    -- ★ LEFT JOIN كي يظهر من لم يلتحق بأي دورة — وهو أهمّ ما في التقرير
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
  'المشاركون مع بحث يُنفَّذ في القاعدة. يستعمل progress الحقيقي بدل '
  'progress_percent المعدوم، وسلسلة احتياطية للاسم لأن full_name_ar فارغ.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ أرشفة الدورة — بديل الحذف النهائي (العطل ④+⑤)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★★★ `deleteCourse` كان `DELETE` فعلياً، و`course_progress.course_id`
--   عليه `ON DELETE CASCADE` ⇒ حذف دورة يمحو **كل سجلّات تقدّم الموظفين**
--   فيها بلا رجعة. وهذا يخالف قاعدة المشروع نصّاً.
--
-- ★ و`toggleActive` كان يكتب `active` وهو عمود معدوم ⇒ يفشل دائماً.
--   العمود الصحيح `status ∈ active·inactive·archived`.

DROP FUNCTION IF EXISTS public.training_course_set_status(UUID, TEXT);

CREATE FUNCTION public.training_course_set_status(
  p_course_id UUID,
  p_status    TEXT
)
RETURNS TABLE(
  out_id      UUID,
  out_title   TEXT,
  out_status  TEXT,
  out_enrolled INTEGER
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_exists BOOLEAN;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل حالة الدورة';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('active','inactive','archived') THEN
    RAISE EXCEPTION 'حالة غير مسموحة: % — المسموح active·inactive·archived', p_status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.courses c
     WHERE c.id = p_course_id AND c.tenant_id = v_tenant
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'الدورة غير موجودة أو لا تخصّ مستأجرك';
  END IF;

  UPDATE public.courses c
     SET status = p_status, updated_at = NOW()
   WHERE c.id = p_course_id AND c.tenant_id = v_tenant;

  RETURN QUERY
  SELECT c.id, c.title::TEXT, c.status::TEXT,
         (SELECT count(*)::INTEGER FROM public.course_progress cp
           WHERE cp.course_id = c.id AND cp.tenant_id = v_tenant)
    FROM public.courses c
   WHERE c.id = p_course_id AND c.tenant_id = v_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_course_set_status(UUID,TEXT) TO authenticated;

COMMENT ON FUNCTION public.training_course_set_status(UUID,TEXT) IS
  'أرشفة/تعطيل الدورة بدل الحذف النهائي (العطل ⑤: DELETE كان يُسقط '
  'سجلّات التقدّم بـCASCADE). ويكتب status لا active المعدوم (العطل ④).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ ★★★ تصحيح انحدار من جولة 0327 — «بصمات اليوم» بتوقيت الخادم
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ هذا ليس من أعطال صفحة التدريب. اكتشفه **الفحص الشامل** حين سقط
--   `tools/dev/verify-tech-metrics-0327.sql` عند التأكيد 4.7:
--     ERROR: 4.7 بصمات اليوم للجهاز = 3 (متوقَّع 23)
--
--   والسبب عطلٌ كتبتُه أنا في 0327 ولم يظهر حينها:
--
--     `biometric_devices_health()` تعدّ بصمات اليوم هكذا:
--       AND a.punch_time >= date_trunc('day', NOW())
--
--     و`NOW()` و`date_trunc` يعملان بمنطقة **الجلسة**، والخادم على
--     `Etc/UTC` بينما المؤسسة في بغداد (UTC+3).
--
--   مُقاس لحظة الاكتشاف (07:48 UTC = 10:48 بغداد):
--     date_trunc('day', now())                    = 2026-08-07 00:00+00
--     بداية يوم بغداد الحقيقية                     = 2026-08-06 21:00+00
--     بصمة قبل 8 ساعات (23:48 بغداد أمس… لا)      = 2026-08-06 23:48+00
--       counted_utc      = false   ← لم تُعدّ
--       counted_baghdad  = true    ← وكان يجب أن تُعدّ
--
--   ⇒ **كل بصمة بين 00:00 و03:00 بتوقيت بغداد تسقط من عدّاد اليوم.**
--     أي أن الوردية الليلية — وهي بالضبط من يهمّ مراقبتها — تُعدّ صفراً
--     في لوحة صحّة أجهزة البصمة كل صباح حتى الساعة الثالثة.
--
--   ★★ ولماذا لم يسقط الاختبار في الجولات السابقة؟
--     لأنه يُدرج بصمات عند `NOW() - 8 hours`. فحين تُشغَّل الجولة بعد
--     الساعة 08:00 UTC يقع الطرح داخل اليوم نفسه ويمرّ التأكيد.
--     هذه الجولة شُغّلت 07:48 UTC فوقع الطرح في اليوم السابق وانكشف.
--     **اختبارٌ يعتمد ساعة التشغيل = اختبار غير موثوق** — والعطل كان
--     قائماً طوال الوقت في الإنتاج لا في الاختبار.
--
--   الإصلاح: بداية اليوم بتوقيت `Asia/Baghdad` صراحةً.

DROP FUNCTION IF EXISTS public.biometric_devices_health();

CREATE FUNCTION public.biometric_devices_health()
RETURNS TABLE(
  out_device_id      UUID,
  out_name           TEXT,
  out_location       TEXT,
  out_is_active      BOOLEAN,
  out_last_sync_at   TIMESTAMPTZ,
  out_minutes_behind INTEGER,
  out_expected_every INTEGER,
  out_is_stale       BOOLEAN,
  out_punches_today  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  -- ★ بداية اليوم المحلي مُحوَّلة إلى timestamptz للمقارنة الصحيحة
  v_day_start TIMESTAMPTZ :=
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Baghdad')) AT TIME ZONE 'Asia/Baghdad';
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT d.id,
         d.name,
         d.location,
         COALESCE(d.is_active, FALSE),
         d.last_sync_at,
         CASE WHEN d.last_sync_at IS NULL THEN NULL
              ELSE (EXTRACT(EPOCH FROM (NOW() - d.last_sync_at)) / 60)::INTEGER
         END,
         COALESCE(d.sync_interval_minutes, 5),
         CASE
           WHEN NOT COALESCE(d.is_active, FALSE) THEN FALSE
           WHEN d.last_sync_at IS NULL           THEN TRUE
           ELSE (NOW() - d.last_sync_at)
                > ((COALESCE(d.sync_interval_minutes, 5) * 2) || ' minutes')::INTERVAL
         END,
         COALESCE((
           SELECT count(*)::INTEGER FROM public.attendance_logs a
            WHERE a.tenant_id = v_tenant
              AND a.device_id = d.id::TEXT
              -- ★★★ كان: date_trunc('day', NOW()) بتوقيت الخادم UTC
              AND a.punch_time >= v_day_start
         ), 0)
    FROM public.biometric_devices d
   WHERE d.tenant_id = v_tenant
   ORDER BY COALESCE(d.is_active, FALSE) DESC, d.name;
END;
$$;

-- ★★★ درس: `DROP FUNCTION` يُسقط الصلاحيات معه، و`CREATE` يمنح
--   EXECUTE لـPUBLIC افتراضياً — أي أن إعادة إنشاء دالة بلا REVOKE
--   **تفتحها للدور `anon` من جديد**. أسقط هذا التأكيد 8.3 في
--   verify-tech-metrics-0327 فوراً بعد التصحيح أعلاه.
--   صحّة أجهزة البصمة تكشف بنية المنشأة — لا تُقرأ بلا مصادقة.
REVOKE ALL ON FUNCTION public.biometric_devices_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.biometric_devices_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.biometric_devices_health() TO authenticated;

COMMENT ON FUNCTION public.biometric_devices_health() IS
  'صحّة أجهزة البصمة. «بصمات اليوم» تُحسب من بداية اليوم بتوقيت '
  'Asia/Baghdad لا بتوقيت الخادم UTC — تصحيح انحدار من 0327 كان يُسقط '
  'كل بصمة بين 00:00 و03:00 محلياً (الوردية الليلية).';

COMMIT;
