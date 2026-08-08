-- ════════════════════════════════════════════════════════════════════════
--  0357 — سلامة دليل فريق العمل
--  المرحلة 4 — بوابة الموارد البشرية · صفحة hr/TeamPage.tsx (290 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0357.sql — على قاعدة نظيفة)          │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★ **عمود `mood_score` لا وجود له** — «الصحة» صفر لكل موظف أبداً.
--     الصفحة تحسب:
--        avgWellness = wellnessData.reduce((a,b) => a + (b.mood_score ?? 0), 0)
--                      / empWellness.length
--     وأعمدة `wellness_entries` الحقيقية عشرة، ليس فيها `mood_score`:
--        id · employee_id · date · **score** · mood · stress · energy
--        · notes · created_at · tenant_id
--
--     PROBE_2: «mood_score غير موجود — العمود الحقيقيّ score»
--     PROBE_2B — صفّان بدرجتَي 82 و 68:
--        المتوسّط الحقيقيّ = 75
--        والصفحة تجمع `undefined ?? 0` ⇒ **0**
--
--     ⇒ بطاقة «صحة: 0%» وشريطٌ **أحمر** لكل موظف في الشركة، مهما كانت
--       درجاته الحقيقية. و`?? 0` هو ما يُخفي العطل: لولا المُعامل
--       لظهر `NaN` وانكشف فوراً.
--
--     ★ العطل نفسه في `WellnessService.getAverageScore` (السطر 34).
--
--  ② ★★★ **الربط بالمفتاح الخطأ** — «المشاكل» صفر لكل موظف أبداً.
--     الصفحة تُرشِّح: `incidentsData.filter(i => i.reported_by === profile.id)`
--     و`profile.id` هنا هو **`employees.id`**، بينما
--        incidents_reported_by_profiles_fkey → REFERENCES profiles(id)
--
--     PROBE_3 — بلاغٌ واحد أبلغ عنه سالم:
--        match_by_employee_id = 0
--        match_by_profile_id  = 1
--     PROBE_3B: `employees.id = profiles.id` ⇒ **false**
--
--     ⇒ شارة «المشاكل» لا تظهر لأحد أبداً. (وهو درس 0349 نفسه الذي
--       جعل «متوسط الصحة» صفراً لكل قسم — تكرّر هنا في صفحة أخرى.)
--
--  ③ ★★★ **البريد والاسم والهاتف والمسمّى — أربعة أعمدة فارغة**.
--     PROBE_1 — صفّ `employees` كما يبنيه المحفّز `tg_ensure_employee_row`:
--        employee_code = EMP-17570000
--        full_name_ar  = (فارغ)
--        email         = (فارغ)
--        phone         = (فارغ)
--        position      = (فارغ)
--        first_name    = سالم      ← هنا الاسم فعلاً
--        last_name     = الأول
--
--     PROBE_1B — على مستوى الجدول كلّه: `with_name_ar = 0` ·
--        `with_email = 0` · `with_phone = 0` · `with_position = 0`
--
--     والبيانات موجودة في `profiles` (الهاتف والمسمّى والاسم الكامل)
--     ولا يقرؤها أحد. النتيجة على الشاشة:
--        الاسم    → `full_name_ar || full_name || ''` ⇒ «بدون اسم»
--        الحرف    → `full_name?.charAt(0) || 'U'`     ⇒ **U** للجميع
--        البريد   → فارغ · الهاتف → «غير محدد» · المسمّى → فارغ
--     والبحث `emailMatch` بلا معنى لأن الحقل فارغ دائماً.
--
--  ④ ★★ **`role` من الجدول الخطأ.** الصفحة تقرأ `emp.role` من
--     `employees` — والعمود موجود لكنه **غير مُدار**: المحفّز لا يكتبه
--     (PROBE_1: `role = employee` وهي قيمة DEFAULT).
--     الدور الحقيقيّ في `profiles.role`. موظفٌ رُقّي إلى `manager`
--     في إدارة المستخدمين يبقى «موظف» هنا أبداً.
--
--  ⑤ ★★ **`on_leave` لا تُنتَج أبداً.** الصفحة تُعرّف ثلاث حالات
--     وتحسب `status: e.is_active ? 'active' : 'inactive'` فقط.
--     PROBE_5: لا عمود `status` في `employees` أصلاً.
--     ⇒ `statusLabels.on_leave` و`statusVariants.on_leave` شيفرةٌ ميتة،
--       وموظفٌ في إجازة معتمَدة اليوم يظهر «نشط».
--     ★ والمصدر الحقيقيّ موجود: `leaves` بحالة `'موافق'` ومدى
--       `date_from … date_to` يغطّي اليوم.
--
--  ⑥ ★★ **خمسة جداول كاملة إلى المتصفّح.** `findAll()` بلا حدّ على:
--     employees · departments · incidents · wellness_entries ·
--     employee_certifications — ثم أربع حلقات `filter` **داخل** حلقة
--     `map` على الموظفين ⇒ تعقيد O(n×m) في الواجهة.
--
--  ⑦ ★ **التسريب المحتمل**: سياسة `kyvzon_employees_select` هي
--     `(tenant_id = current_user_tenant_id())` **بلا تمييز دور**
--     (PROBE_7). فأيّ مستخدم مُصادَق يقرأ كل موظفي شركته. الصفحة
--     مسجَّلة لـHR، لكن الحماية يجب أن تكون في القاعدة لا في التوجيه.
--
--  ⑧ ★ **عدّ البلاغات يتجاهل الأرشفة**: يستثني `closed`/`resolved`
--     فقط، و`archived_at` موجود (PROBE_8B) — فبلاغٌ مؤرشف يُعدّ مفتوحاً.
--     (وهو العطل نفسه المُصلَح في 0349 — تكرّر هنا.)
--
--  ⑨ ★ `statusVariants: Record<string, any>` — `any` صريح في الصفحة.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  ما يفعله هذا المايجريشن                                          │
--  └──────────────────────────────────────────────────────────────────┘
--   (أ) `team_directory()` — الدليل كاملاً من مصادره الصحيحة:
--       الاسم والهاتف والمسمّى من `profiles` · الدور من `profiles` ·
--       الصحة من `wellness_entries.score` · البلاغات بمفتاح `profiles`
--       · الحالة الثلاثية باشتقاق `on_leave` من `leaves`.
--   (ب) `team_summary()` — بطاقات الرأس.
--   (جـ) `team_departments()` — قائمة الأقسام للترشيح.
--
-- ════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_wellness_emp_date
  ON public.wellness_entries (tenant_id, employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_emp_certs_emp
  ON public.employee_certifications (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by
  ON public.incidents (tenant_id, reported_by);

-- ─────────────────────────────────────────────────────────────────────────
-- (أ) دليل الفريق
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.team_directory(TEXT, UUID, TEXT, BOOLEAN, INTEGER);

CREATE FUNCTION public.team_directory(
  p_search        TEXT    DEFAULT NULL,
  p_department_id UUID    DEFAULT NULL,
  p_status        TEXT    DEFAULT NULL,
  p_include_inactive BOOLEAN DEFAULT TRUE,
  p_limit         INTEGER DEFAULT 300
)
RETURNS TABLE (
  out_id            UUID,
  out_user_id       UUID,
  out_employee_code TEXT,
  out_full_name     TEXT,
  out_email         TEXT,
  out_phone         TEXT,
  out_position      TEXT,
  out_department_id UUID,
  out_department    TEXT,
  out_role          TEXT,
  out_status        TEXT,
  out_wellness      NUMERIC,
  out_wellness_n    INTEGER,
  out_open_issues   INTEGER,
  out_certs         INTEGER,
  out_certs_valid   INTEGER,
  out_hire_date     DATE
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
  -- ★ اليوم بتوقيت بغداد صراحةً: الخادم Etc/UTC وبغداد UTC+3، فحساب
  --   «في إجازة اليوم» بـCURRENT_DATE يُخطئ ثلاث ساعات كل يوم.
  v_today  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  -- ★★ العطل ⑦: الحماية في القاعدة لا في التوجيه وحده
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض دليل الفريق';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('active','inactive','on_leave') THEN
    RAISE EXCEPTION 'TEAM_BAD_STATUS: حالة غير معروفة «%» — المسموح: '
      'active·inactive·on_leave', p_status USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id, e.user_id, e.employee_code, e.department_id, e.hire_date,
      e.is_active,
      -- ★★★ العطل ③: الاسم من profiles أوّلاً — full_name_ar فارغ للجميع
      COALESCE(NULLIF(btrim(e.full_name_ar), ''),
               NULLIF(btrim(p.full_name), ''),
               NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                            COALESCE(NULLIF(e.last_name,'—'),'')), ''),
               'موظف ' || COALESCE(e.employee_code,'—')) AS full_name,
      -- ★ البريد من auth.users حين يكون employees.email فارغاً (وهو دائماً)
      COALESCE(NULLIF(btrim(e.email), ''), NULLIF(btrim(u.email), '')) AS email,
      COALESCE(NULLIF(btrim(e.phone), ''), NULLIF(btrim(p.phone), '')) AS phone,
      COALESCE(NULLIF(btrim(e.position), ''), NULLIF(btrim(p.position), '')) AS position,
      -- ★★ العطل ④: الدور من profiles — employees.role غير مُدار
      COALESCE(NULLIF(btrim(p.role), ''), NULLIF(btrim(e.role), ''), 'employee') AS role,
      COALESCE(d.name_ar, p.department) AS department
    FROM public.employees e
    LEFT JOIN public.profiles    p ON p.id = e.user_id
    LEFT JOIN auth.users         u ON u.id = e.user_id
    LEFT JOIN public.departments d ON d.id = e.department_id
    WHERE e.tenant_id = v_tenant
      AND (p_include_inactive OR e.is_active)
      AND (p_department_id IS NULL OR e.department_id = p_department_id)
  ),
  wl AS (
    -- ★★★ العطل ①: العمود `score` لا `mood_score`
    SELECT w.employee_id,
           round(avg(w.score), 1) AS avg_score,
           count(*)::INTEGER      AS n
      FROM public.wellness_entries w
     WHERE w.tenant_id = v_tenant AND w.score IS NOT NULL
     GROUP BY w.employee_id
  ),
  inc AS (
    -- ★★★ العطل ②: الربط بـuser_id (مفتاح profiles) لا بـemployees.id.
    --   و ★ العطل ⑧: المؤرشف ليس مفتوحاً.
    SELECT i.reported_by AS profile_id, count(*)::INTEGER AS n
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant
       AND i.status NOT IN ('resolved','closed')
       AND i.archived_at IS NULL
     GROUP BY i.reported_by
  ),
  cert AS (
    SELECT c.employee_id,
           count(*)::INTEGER AS n,
           count(*) FILTER (
             WHERE c.expiry_date IS NULL OR c.expiry_date >= v_today
           )::INTEGER AS n_valid
      FROM public.employee_certifications c
     WHERE c.tenant_id = v_tenant
     GROUP BY c.employee_id
  ),
  lv AS (
    -- ★★ العطل ⑤: `on_leave` مشتقّة من مصدر حقيقيّ — إجازة معتمَدة
    --   تغطّي اليوم. المفردة 'موافق' مُحقَّقة من leaves_status_check.
    SELECT DISTINCT l.employee_id
      FROM public.leaves l
     WHERE l.tenant_id = v_tenant
       AND l.status = 'موافق'
       AND l.date_from <= v_today
       AND l.date_to   >= v_today
  ),
  final AS (
    SELECT b.*,
           CASE WHEN NOT b.is_active         THEN 'inactive'
                WHEN lv.employee_id IS NOT NULL THEN 'on_leave'
                ELSE 'active' END AS status,
           wl.avg_score, COALESCE(wl.n, 0) AS wl_n,
           COALESCE(inc.n, 0)   AS open_issues,
           COALESCE(cert.n, 0)  AS certs,
           COALESCE(cert.n_valid, 0) AS certs_valid
      FROM base b
      LEFT JOIN wl   ON wl.employee_id   = b.id
      LEFT JOIN inc  ON inc.profile_id   = b.user_id
      LEFT JOIN cert ON cert.employee_id = b.id
      LEFT JOIN lv   ON lv.employee_id   = b.id
  )
  SELECT f.id, f.user_id, f.employee_code::TEXT, f.full_name::TEXT,
         COALESCE(f.email, '')::TEXT, COALESCE(f.phone, '')::TEXT,
         COALESCE(f.position, '')::TEXT,
         f.department_id, COALESCE(f.department, '—')::TEXT,
         f.role::TEXT, f.status::TEXT,
         -- ★★★ NULL ≠ صفر: «لا سجلّ صحة» ليست «صحة صفر» (درس 0353)
         f.avg_score, f.wl_n,
         f.open_issues, f.certs, f.certs_valid, f.hire_date
    FROM final f
   WHERE (p_status IS NULL OR f.status = p_status)
     AND (v_q IS NULL
          OR f.full_name     ILIKE '%' || v_q || '%'
          OR f.employee_code ILIKE '%' || v_q || '%'
          OR f.email         ILIKE '%' || v_q || '%'
          OR f.phone         ILIKE '%' || v_q || '%'
          OR f.position      ILIKE '%' || v_q || '%')
   ORDER BY f.full_name
   LIMIT GREATEST(COALESCE(p_limit, 300), 1);
END $$;

COMMENT ON FUNCTION public.team_directory(TEXT, UUID, TEXT, BOOLEAN, INTEGER) IS
  'دليل الفريق من مصادره الصحيحة. الصفحة كانت تقرأ mood_score (عمود '
  'معدوم ⇒ صحة 0% للجميع) وتربط البلاغات بـemployees.id بينما '
  'reported_by يشير إلى profiles (⇒ 0 مشاكل للجميع)، وتقرأ الاسم '
  'والبريد والهاتف من employees وكلها NULL.';

REVOKE ALL ON FUNCTION public.team_directory(TEXT, UUID, TEXT, BOOLEAN, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_directory(TEXT, UUID, TEXT, BOOLEAN, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.team_directory(TEXT, UUID, TEXT, BOOLEAN, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (ب) ملخّص الفريق
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.team_summary();

CREATE FUNCTION public.team_summary()
RETURNS TABLE (
  out_total        INTEGER,
  out_active       INTEGER,
  out_on_leave     INTEGER,
  out_inactive     INTEGER,
  out_departments  INTEGER,
  out_avg_wellness NUMERIC,
  out_measured     INTEGER,
  out_open_issues  INTEGER,
  out_certs        INTEGER,
  out_expiring     INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص الفريق';
  END IF;

  RETURN QUERY
  WITH lv AS (
    SELECT DISTINCT l.employee_id FROM public.leaves l
     WHERE l.tenant_id = v_tenant AND l.status = 'موافق'
       AND l.date_from <= v_today AND l.date_to >= v_today
  ),
  emp AS (
    SELECT e.id, e.is_active,
           (lv.employee_id IS NOT NULL) AS on_leave
      FROM public.employees e
      LEFT JOIN lv ON lv.employee_id = e.id
     WHERE e.tenant_id = v_tenant
  ),
  wl AS (
    -- ★ متوسّط المتوسّطات لكل موظف — لا متوسّط كل الصفوف. موظفٌ سجّل
    --   ثلاثين مرة لا يجب أن يُرجّح على من سجّل مرّة.
    SELECT round(avg(m.a), 1) AS avg_all, count(*)::INTEGER AS n
      FROM (SELECT w.employee_id, avg(w.score) AS a
              FROM public.wellness_entries w
             WHERE w.tenant_id = v_tenant AND w.score IS NOT NULL
             GROUP BY w.employee_id) m
  )
  SELECT
    (SELECT count(*)::INTEGER FROM emp),
    (SELECT count(*)::INTEGER FROM emp WHERE is_active AND NOT on_leave),
    (SELECT count(*)::INTEGER FROM emp WHERE is_active AND on_leave),
    (SELECT count(*)::INTEGER FROM emp WHERE NOT is_active),
    (SELECT count(*)::INTEGER FROM public.departments d
      WHERE d.tenant_id = v_tenant),
    (SELECT avg_all FROM wl),
    (SELECT n FROM wl),
    (SELECT count(*)::INTEGER FROM public.incidents i
      WHERE i.tenant_id = v_tenant
        AND i.status NOT IN ('resolved','closed')
        AND i.archived_at IS NULL),
    (SELECT count(*)::INTEGER FROM public.employee_certifications c
      WHERE c.tenant_id = v_tenant),
    -- ★ تنتهي خلال ثلاثين يوماً — المنتهية أصلاً خارج العدّ
    (SELECT count(*)::INTEGER FROM public.employee_certifications c
      WHERE c.tenant_id = v_tenant
        AND c.expiry_date IS NOT NULL
        AND c.expiry_date >= v_today
        AND c.expiry_date <= v_today + 30);
END $$;

COMMENT ON FUNCTION public.team_summary() IS
  'بطاقات دليل الفريق. المتوسّط NULL حين لا سجلّ صحة — لا صفر. '
  'ويُحسب كمتوسّط متوسّطات الموظفين لا متوسّط الصفوف.';

REVOKE ALL ON FUNCTION public.team_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.team_summary() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (جـ) الأقسام للترشيح
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.team_departments();

CREATE FUNCTION public.team_departments()
RETURNS TABLE (
  out_id      UUID,
  out_name    TEXT,
  out_members INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض الأقسام';
  END IF;

  RETURN QUERY
  SELECT d.id, d.name_ar::TEXT,
         (SELECT count(*)::INTEGER FROM public.employees e
           WHERE e.department_id = d.id AND e.tenant_id = v_tenant)
    FROM public.departments d
   WHERE d.tenant_id = v_tenant
   ORDER BY d.name_ar;
END $$;

COMMENT ON FUNCTION public.team_departments() IS
  'أقسام المستأجر بعدد أعضائها. الصفحة كانت تشتقّ القائمة من أسماء '
  'الأقسام الظاهرة في الصفحة فقط — فقسمٌ بلا موظفين لا يظهر، '
  'والترشيح بالاسم النصّي لا بالمعرّف.';

REVOKE ALL ON FUNCTION public.team_departments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_departments() FROM anon;
GRANT EXECUTE ON FUNCTION public.team_departments() TO authenticated;
