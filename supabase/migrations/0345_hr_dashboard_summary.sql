-- ============================================================================
-- 0345_hr_dashboard_summary.sql
--
-- بوابة الموارد البشرية — المرحلة 4، الصفحة الأولى: لوحة `HRDashboard`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً على Postgres محلي (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ ① «الموظفون النشطون» = صفر دائماً ═════════════════════════════════════
--
--   `HRDashboard.tsx:277`
--     activeEmployees: emps.filter(e => e.status === 'active').length
--
--   والجدول **لا يحوي عمود `status` إطلاقاً**. مُثبَت:
--     SELECT count(*) FROM information_schema.columns
--      WHERE table_name='employees' AND column_name='status';   ⇒ 0
--     ... AND column_name='is_active';                          ⇒ 1
--
--   ⇒ `e.status` هو `undefined` لكل صفّ، والمقارنة بـ`'active'` تفشل دائماً.
--     بطاقة «الموظفون النشطون» تعرض **0** بينما الحقيقة 3 في الإثبات.
--
--   ★ ولاحظ التناقض داخل الصفحة نفسها: السطر 162 يُرشّح
--     `filters: { is_active: true }` — أي أن الاستعلام يعرف العمود الصحيح،
--     ثم يعيد الترشيح في المتصفح بعمود لا وجود له. والأسوأ أن الرقم
--     «يبدو معقولاً» (صفر) فلا يلفت النظر.
--
-- ═══ ② الصحة النفسية لكل قسم = NaN ═════════════════════════════════════════
--
--   `HRDashboard.tsx:253`
--     deptMap[d].wellnessTotal += w.mood_score;
--
--   مُثبَت: `mood_score` **غير موجود في أي جدول في المخطط كلّه**:
--     SELECT table_name FROM information_schema.columns
--      WHERE column_name='mood_score';   ⇒ (0 rows)
--
--   العمود الحقيقي `wellness_entries.score INTEGER NOT NULL DEFAULT 50`
--   (والجدول يحوي أيضاً `mood VARCHAR` نصّاً ∈ great·good·neutral·bad·
--   terrible — وهو غالباً مصدر الالتباس).
--
--   ⇒ `wellnessTotal += undefined` ⇒ **NaN**، ثم
--     `Math.round(NaN / count)` ⇒ **NaN** يُعرض حرفياً على الشاشة،
--     ويُستعمل في `width: ${dept.wellnessAvg}%` (سطر 665) فينكسر الشريط.
--
--   في الإثبات: متوسط قسم الإنتاج الحقيقي = **70** (80 و60).
--
--   ★★ ولا يظهر الخطأ في كل الحالات: الفرع `d.wellnessCount > 0 ? … : 75`
--     يُخفيه حين لا سجلّات — فالأقسام الفارغة تعرض 75 «سليمة»، والأقسام
--     التي **لديها بيانات فعلاً** هي وحدها التي تعرض NaN. أي أن العطل
--     يضرب البيانات الحقيقية ويتجنّب الفارغة.
--
-- ═══ ③ كل البلاغات تُنسب إلى قسم «عام» ═════════════════════════════════════
--
--   `HRDashboard.tsx:246`
--     const reporter = emps.find(e => e.id === i.reported_by);
--
--   `emps` من `employeeService` ⇒ `e.id` هو **`employees.id`**.
--   لكن `incidents.reported_by` يشير إلى **`profiles.id`** منذ `0008`:
--
--     incidents_reported_by_profiles_fkey
--       FOREIGN KEY (reported_by) REFERENCES profiles(id) ON DELETE SET NULL
--
--   (التعريف الأصلي في `0003:192` كان `REFERENCES employees(id)` —
--    و`0008_incident_contract_fixes.sql:12-25` أسقطه وأعاد ربطه بـprofiles.
--    الشيفرة بقيت على الافتراض القديم.)
--
--   و`employees.id ≠ profiles.id` — وهو درس `0335` نفسه.
--
--   مُثبَت: مطابقات `e.id === reported_by` = **0**
--     employees.id = 00097b65-… · reported_by = 9ee2fbb0-…
--
--   ⇒ `problemCount` لكل قسم = **صفر**، وكل البلاغات تُنسب لقسم «عام»
--     الذي **لا وجود له في `deptMap`** أصلاً (يُبنى من أقسام الموظفين
--     فقط) ⇒ الشرط `if (deptMap[dept])` يفشل فتُهمل البلاغات تماماً.
--
--   والأثر نفسه في `recentIncidents` (سطر 289): `reporter` دائماً
--   `undefined` ⇒ اسم المُبلِّغ لا يظهر أبداً.
--
-- ═══ ④ بطاقة «مُصعَّدة لـ HR» ميّتة ════════════════════════════════════════
--
--   `HRDashboard.tsx:194`  incs.filter(i => i.status === 'escalated')
--
--   وقيد الحالة المُحقَّق:
--     CHECK (status = ANY (ARRAY['pending','in_progress','resolved','closed']))
--
--   ⇒ `'escalated'` **قيمة لا يمكن أن توجد** — القيد يمنعها.
--     بطاقة كاملة (سطر 403) تعرض صفراً إلى الأبد.
--
-- ═══ ⑤ «معدل الرضا 85%» رقم مُختلَق ════════════════════════════════════════
--
--   `HRDashboard.tsx:137` و`:279`  satisfactionRate: 85
--
--   ثابت مكتوب يدوياً يُعرض كأنه مؤشّر مُقاس (سطر 347). لا مصدر له.
--
-- ═══ ⑥ الحسابات كلها في المتصفح ════════════════════════════════════════════
--
--   `incidentService.findAll()` بلا حدّ ⇒ **كل بلاغات المستأجر** تُنقل
--   إلى المتصفح لتُعدّ فيه. وكذلك `wellnessEntryService.findAllEntries()`.
--   مع نموّ البيانات تصير اللوحة أبطأ خطّياً بلا سقف.
--
-- ═══ ما يفعله هذا المايجريشن ═══════════════════════════════════════════════
--   ① hr_dashboard_summary()        — المؤشّرات في صفّ واحد
--   ② hr_dashboard_departments()    — إحصاءات الأقسام (المعرّف الصحيح)
--   ③ hr_dashboard_monthly_trend()  — ستة أشهر
--   ④ hr_dashboard_wellness_trend() — سبعة أيام
--   ⑤ فهارس
--
-- ─── حقائق بنيوية مُحقَّقة (information_schema/pg_constraint) ─────────────
--   employees: is_active BOOLEAN DEFAULT true · **لا status** ·
--     full_name_ar TEXT · department_id UUID · id ≠ profiles.id
--   departments: name_ar (**لا name**)
--   wellness_entries: score INTEGER NOT NULL · mood VARCHAR ∈ 5 قيم ·
--     stress · energy · date · employee_id → employees · **لا mood_score**
--   incidents: reported_by → **profiles** · assigned_to → employees ·
--     employee_id → employees · status ∈ pending·in_progress·resolved·closed
--     severity ∈ low·medium·high·critical · category ∈ 7 قيم
--   ★ الأرشفة عمودها **`archived_at TIMESTAMPTZ`** لا `archived BOOLEAN`
--     (مع archived_by → profiles و archive_reason). كتبتُ `i.archived`
--     أولاً — والمايجريشن **طُبِّق بنجاح** رغم ذلك لأن PL/pgSQL لا يفحص
--     أجسام الاستعلامات عند الإنشاء، والاستدعاء الأول عاد مبكراً من فرع
--     `tenant_id IS NULL` فلم يبلغ الخطأ. كشفه استدعاءٌ بمستأجر حقيقي.
--     ⇒ «طُبِّق بنجاح» ليس دليلاً على الصحة في PL/pgSQL.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① المؤشّرات الرئيسية — صفّ واحد
--
--    ★ لماذا في القاعدة؟ لأن الأعطال ①②③ كلها أخطاء **مطابقة أعمدة في
--      المتصفح**: عمود لا وجود له، عمود باسم خاطئ، ومعرّف من جدول آخر.
--      القاعدة تعرف مخططها — ولو كُتب اسم عمود خاطئ هنا لفشل المايجريشن
--      فوراً بدل أن يُنتج NaN صامتاً.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_dashboard_summary();

CREATE FUNCTION public.hr_dashboard_summary()
RETURNS TABLE(
  out_total_employees   INTEGER,
  out_active_employees  INTEGER,
  out_departments       INTEGER,
  out_wellness_score    INTEGER,
  out_wellness_samples  INTEGER,
  out_pending           INTEGER,
  out_in_progress       INTEGER,
  out_resolved          INTEGER,
  out_closed            INTEGER,
  out_critical_open     INTEGER,
  out_unassigned        INTEGER,
  out_resolved_month    INTEGER,
  out_incidents_total   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  -- صفّ أصفار لا «لا شيء»: اللوحة تعرض البطاقات دائماً (درس 0337)
  IF v_tenant IS NULL THEN
    RETURN QUERY SELECT 0,0,0,0,0,0,0,0,0,0,0,0,0;
    RETURN;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.is_active
      FROM public.employees e
     WHERE e.tenant_id = v_tenant
  ),
  dep AS (
    SELECT 1 FROM public.departments d WHERE d.tenant_id = v_tenant
  ),
  -- ★★ الصحة النفسية: العمود `score` لا `mood_score` (العطل ②).
  --   ونحدّها بآخر 30 يوماً: متوسط على تاريخ كامل لا يعني شيئاً إدارياً.
  well AS (
    SELECT w.score
      FROM public.wellness_entries w
      JOIN public.employees e ON e.id = w.employee_id
     WHERE e.tenant_id = v_tenant
       AND w.date >= current_date - INTERVAL '30 days'
  ),
  inc AS (
    SELECT i.status, i.severity, i.assigned_to, i.updated_at
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant
       AND i.archived_at IS NULL
  )
  SELECT
    (SELECT count(*)::INTEGER FROM emp),
    -- ★★★ is_active لا status (العطل ①)
    (SELECT count(*) FILTER (WHERE is_active)::INTEGER FROM emp),
    (SELECT count(*)::INTEGER FROM dep),
    (SELECT COALESCE(round(avg(score))::INTEGER, 0) FROM well),
    -- ★ عدد العيّنات معه: متوسط 82 من ثلاث إدخالات ليس كمتوسط 82 من 300،
    --   والواجهة تحتاج أن تُفرّق بينهما بدل عرض رقم بلا سياق.
    (SELECT count(*)::INTEGER FROM well),
    (SELECT count(*) FILTER (WHERE status = 'pending')::INTEGER     FROM inc),
    (SELECT count(*) FILTER (WHERE status = 'in_progress')::INTEGER FROM inc),
    (SELECT count(*) FILTER (WHERE status = 'resolved')::INTEGER    FROM inc),
    (SELECT count(*) FILTER (WHERE status = 'closed')::INTEGER      FROM inc),
    -- ★★ «الحرجة» تعني الحرجة **المفتوحة**: عدّ الحرجة المُغلقة ضمن
    --   مؤشّر إنذار يجعل الرقم يرتفع أبداً ولا ينخفض مهما عولجت.
    (SELECT count(*) FILTER (
       WHERE severity = 'critical' AND status IN ('pending','in_progress')
     )::INTEGER FROM inc),
    -- ★★ غير المُسنَدة — بديل بطاقة 'escalated' الميّتة (العطل ④).
    --   هذه حالة حقيقية تحتاج تدخّل الموارد فعلاً.
    (SELECT count(*) FILTER (
       WHERE assigned_to IS NULL AND status IN ('pending','in_progress')
     )::INTEGER FROM inc),
    (SELECT count(*) FILTER (
       WHERE status IN ('resolved','closed')
         AND updated_at >= date_trunc('month', current_date)
     )::INTEGER FROM inc),
    (SELECT count(*)::INTEGER FROM inc);
END $$;

COMMENT ON FUNCTION public.hr_dashboard_summary() IS
  'مؤشّرات لوحة الموارد. أصلح: activeEmployees كان يرشّح e.status وهو '
  'عمود غير موجود (⇒ صفر دائماً) · متوسط العافية كان يجمع w.mood_score '
  'وهو عمود غير موجود في المخطط كلّه (⇒ NaN) · بطاقة escalated كانت '
  'تعدّ حالة يمنعها قيد CHECK (⇒ صفر أبداً).';

REVOKE ALL ON FUNCTION public.hr_dashboard_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_dashboard_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_dashboard_summary() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② إحصاءات الأقسام — بالمعرّف الصحيح
--
--    ★★★ العطل ③: الصفحة تربط `incidents.reported_by` بـ`employees.id`
--      بينما هو `profiles.id`. هنا نربط الصحيح، ونجمع **ثلاثة مسارات**
--      للنسبة إلى قسم لأن البيانات القائمة غير متجانسة:
--        • incidents.department_id  — المباشر (أُضيف لاحقاً)
--        • incidents.employee_id    — → employees.department_id
--        • incidents.reported_by    — → profiles → employees.user_id
--
--    ★ الأولوية للأدقّ: department_id ثم employee_id ثم reported_by.
--      COALESCE يوقف عند أول قيمة غير فارغة.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_dashboard_departments(INTEGER);

CREATE FUNCTION public.hr_dashboard_departments(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  out_department_id   UUID,
  out_name            TEXT,
  out_employee_count  INTEGER,
  out_active_count    INTEGER,
  out_problem_count   INTEGER,
  out_open_problems   INTEGER,
  out_wellness_avg    INTEGER,
  out_wellness_count  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH inc_dept AS (
    -- ★★★ ثلاثة مسارات للنسبة — العطل ③
    SELECT i.id,
           i.status,
           COALESCE(
             i.department_id,
             (SELECT e2.department_id FROM public.employees e2
               WHERE e2.id = i.employee_id),
             (SELECT e3.department_id FROM public.employees e3
               WHERE e3.user_id = i.reported_by AND e3.tenant_id = v_tenant)
           ) AS dept_id
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant
       AND i.archived_at IS NULL
  ),
  emp_well AS (
    -- ★ متوسط كل موظف أولاً ثم متوسط الأقسام: موظفٌ سجّل 30 مرّة
    --   وآخر مرّة واحدة يجب ألّا يطغى أحدهما على متوسط القسم.
    SELECT e.department_id, e.id AS emp_id, avg(w.score) AS emp_avg
      FROM public.wellness_entries w
      JOIN public.employees e ON e.id = w.employee_id
     WHERE e.tenant_id = v_tenant
       AND w.date >= current_date - INTERVAL '30 days'
     GROUP BY e.department_id, e.id
  )
  SELECT d.id,
         d.name_ar::TEXT,
         (SELECT count(*)::INTEGER FROM public.employees e
           WHERE e.tenant_id = v_tenant AND e.department_id = d.id),
         (SELECT count(*)::INTEGER FROM public.employees e
           WHERE e.tenant_id = v_tenant AND e.department_id = d.id
             AND e.is_active),
         (SELECT count(*)::INTEGER FROM inc_dept x WHERE x.dept_id = d.id),
         (SELECT count(*)::INTEGER FROM inc_dept x
           WHERE x.dept_id = d.id AND x.status IN ('pending','in_progress')),
         -- ★★ صفر حين لا بيانات — لا 75 مُختلَقة. الصفحة كانت تكتب
         --   `: 75` فتُظهر قسماً بلا أي سجلّ عافية كأنه «جيد».
         (SELECT COALESCE(round(avg(emp_avg))::INTEGER, 0) FROM emp_well ew
           WHERE ew.department_id = d.id),
         (SELECT count(*)::INTEGER FROM emp_well ew
           WHERE ew.department_id = d.id)
    FROM public.departments d
   WHERE d.tenant_id = v_tenant
   ORDER BY d.name_ar
   LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.hr_dashboard_departments(INTEGER) IS
  'إحصاءات الأقسام. الصفحة كانت تربط incidents.reported_by بـemployees.id '
  'بينما هو profiles.id منذ 0008 ⇒ صفر مطابقة وكل البلاغات تُنسب لقسم '
  '«عام» غير موجود في الخريطة فتُهمل. ومتوسط العافية يُحسب لكل موظف '
  'أولاً كي لا يطغى كثير التسجيل.';

REVOKE ALL ON FUNCTION public.hr_dashboard_departments(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_dashboard_departments(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_dashboard_departments(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ الاتجاه الشهري
--
--    ★★★ الصفحة تحسبه:
--      const m = (currentMonth - 5 + i + 12) % 12;
--      incs.filter(inc => new Date(inc.created_at).getMonth() === m)
--
--    `getMonth()` **يُهمل السنة**. بلاغ في مارس 2024 يُحتسب ضمن مارس 2026
--    إن وقع الشهر في النافذة. مع بيانات سنتين يصير الرسم مجموعاً تراكمياً
--    لا اتجاهاً — وهو نفس نمط العطل الذي أصلحه 0337 لصفحة الحضور.
--
--    هنا نستعمل حدوداً زمنية حقيقية (شهر بسنته).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_dashboard_monthly_trend(INTEGER);

CREATE FUNCTION public.hr_dashboard_monthly_trend(p_months INTEGER DEFAULT 6)
RETURNS TABLE(
  out_year      INTEGER,
  out_month     INTEGER,
  out_problems  INTEGER,
  out_resolved  INTEGER,
  out_critical  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_n      INTEGER := LEAST(GREATEST(COALESCE(p_months, 6), 1), 36);
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
             date_trunc('month', current_date) - ((v_n - 1) || ' months')::INTERVAL,
             date_trunc('month', current_date),
             '1 month'::INTERVAL
           )::DATE AS m_start
  )
  SELECT EXTRACT(YEAR  FROM m.m_start)::INTEGER,
         EXTRACT(MONTH FROM m.m_start)::INTEGER,
         -- ★ الأشهر الفارغة تظهر بصفر لا تختفي: رسمٌ يقفز من مارس إلى
         --   يونيو يكذب بصرياً.
         (SELECT count(*)::INTEGER FROM public.incidents i
           WHERE i.tenant_id = v_tenant
             AND i.archived_at IS NULL
             AND i.created_at >= m.m_start
             AND i.created_at <  (m.m_start + INTERVAL '1 month')),
         (SELECT count(*)::INTEGER FROM public.incidents i
           WHERE i.tenant_id = v_tenant
             AND i.archived_at IS NULL
             AND i.created_at >= m.m_start
             AND i.created_at <  (m.m_start + INTERVAL '1 month')
             AND i.status IN ('resolved','closed')),
         (SELECT count(*)::INTEGER FROM public.incidents i
           WHERE i.tenant_id = v_tenant
             AND i.archived_at IS NULL
             AND i.created_at >= m.m_start
             AND i.created_at <  (m.m_start + INTERVAL '1 month')
             AND i.severity = 'critical')
    FROM months m
   ORDER BY m.m_start;
END $$;

COMMENT ON FUNCTION public.hr_dashboard_monthly_trend(INTEGER) IS
  'اتجاه البلاغات الشهري. الصفحة كانت ترشّح بـgetMonth() وحده — يُهمل '
  'السنة، فبلاغ مارس 2024 يُحتسب في مارس 2026. الأشهر الفارغة تظهر بصفر.';

REVOKE ALL ON FUNCTION public.hr_dashboard_monthly_trend(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_dashboard_monthly_trend(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_dashboard_monthly_trend(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ اتجاه العافية — سبعة أيام
--
--    ★ الأيام بلا إدخالات تعود بـNULL لا صفر: صفرٌ في رسم بياني يعني
--      «الصحة النفسية = 0» وهو أسوأ قيمة ممكنة، بينما الحقيقة «لا بيانات».
--      الصفحة كانت تكتب `: 0` فتُظهر عطلة نهاية الأسبوع كانهيار نفسي.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_dashboard_wellness_trend(INTEGER);

CREATE FUNCTION public.hr_dashboard_wellness_trend(p_days INTEGER DEFAULT 7)
RETURNS TABLE(
  out_date    DATE,
  out_score   INTEGER,
  out_samples INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_n      INTEGER := LEAST(GREATEST(COALESCE(p_days, 7), 1), 90);
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
             current_date - (v_n - 1),
             current_date,
             '1 day'::INTERVAL
           )::DATE AS d
  )
  SELECT dd.d,
         (SELECT round(avg(w.score))::INTEGER
            FROM public.wellness_entries w
            JOIN public.employees e ON e.id = w.employee_id
           WHERE e.tenant_id = v_tenant AND w.date = dd.d),
         (SELECT count(*)::INTEGER
            FROM public.wellness_entries w
            JOIN public.employees e ON e.id = w.employee_id
           WHERE e.tenant_id = v_tenant AND w.date = dd.d)
    FROM days dd
   ORDER BY dd.d;
END $$;

COMMENT ON FUNCTION public.hr_dashboard_wellness_trend(INTEGER) IS
  'اتجاه العافية اليومي. الأيام بلا إدخالات تُعيد NULL لا صفر — صفر في '
  'الرسم يعني أسوأ حالة نفسية ممكنة بينما المعنى «لا بيانات».';

REVOKE ALL ON FUNCTION public.hr_dashboard_wellness_trend(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_dashboard_wellness_trend(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_dashboard_wellness_trend(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_created
  ON public.incidents (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status_sev
  ON public.incidents (tenant_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_wellness_emp_date
  ON public.wellness_entries (employee_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_employees_tenant_dept
  ON public.employees (tenant_id, department_id);
