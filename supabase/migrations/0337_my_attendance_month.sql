-- ============================================================================
-- 0337_my_attendance_month.sql
--
-- بوابة الموظف: حضوري الشهري — نطاق زمني حقيقي.
--
-- ═══ العطل ① — الشهر المختار لا يُرشَّح إطلاقاً ═══════════════════════════
--
--   `MyAttendancePage.tsx:175` تحسب حدود الشهر:
--
--     const startDate = format(new Date(currentYear, currentMonth, 1), 'yyyy-MM-dd');
--     const endDate   = format(new Date(currentYear, currentMonth + 1, 0), 'yyyy-MM-dd');
--
--   ثم **لا تُمرّرهما لأي استعلام**. مُحقَّق: `grep -n 'startDate\|endDate'`
--   يُرجع سطرَي التعريف فقط — لا استعمال واحد.
--
--     attendanceSummaryService.findAll({
--       filters: { employee_id: employeeId },   ← بلا نطاق
--       orderBy: 'shift_date', ascending: false,
--     })
--
--   ⇒ الصفحة تجلب **كل تاريخ الموظف** وتعرضه كأنه الشهر المختار،
--     وأزرار التنقّل بين الشهور لا تغيّر شيئاً.
--
--   الإثبات على Postgres — موظف له 3 أيام هذا الشهر و20 يوماً سابقاً:
--
--     ★★ ما تجلبه الصفحة (بلا ترشيح):
--        إجمالي السجلات = 23   ← تُعرض كأنها الشهر المختار
--        مجموع الساعات = 175.00 ← «ساعات هذا الشهر»
--        متوسط الساعات = 7.61
--
--     ✅ الصحيح (الشهر الحالي وحده):
--        إجمالي السجلات = 3
--        مجموع الساعات = 15.00
--
--   والأسوأ أن الخطأ **يتفاقم مع الزمن**: موظف بعامين من السجلات يرى
--   «ساعات هذا الشهر» تقارب 4000.
--
-- ═══ العطل ② — weeklyStreak ليس تتابعاً ══════════════════════════════════
--
--     weeklyStreak: Math.min(summaryData.filter(s => s.status !== 'غائب').length, 7)
--
--   هذا **عدّ** لا **تتابع**. موظف حضر يوماً وغاب يوماً على مدى شهر
--   يحصل على «7 أيام متتالية» بينما أطول تتابع لديه = 1.
--   التتابع الحقيقي يحتاج ترتيب الأيام وكسر السلسلة عند أول غياب.
--
-- ═══ ما يفعله هذا المايجريشن ══════════════════════════════════════════════
--   ① my_attendance_month(year, month)   — سجلّات الشهر
--   ② my_attendance_month_stats(y, m)    — إحصاءاته محسوبة في القاعدة
--   ③ my_attendance_streak()             — التتابع الحقيقي
--   ④ فهارس
--
-- ─── حقائق بنيوية مُحقَّقة (information_schema/pg_constraint) ─────────────
--   attendance_summary: tenant_id·employee_id·shift_date NOT NULL
--     shift_type·check_in·check_out قابلة للفراغ
--     total_hours·late_minutes·early_leave_minutes·overtime_minutes
--       NOT NULL · status NOT NULL
--   ★ الحالات نصوص عربية: 'في الوقت' · 'متأخر' · 'غائب' · 'إجازة'
--     (لا CHECK يقيّدها — قيم حرّة، لذلك نطابق نصّاً)
--   attendance_logs: punch_time·punch_type·shift_date NOT NULL
--     قيد فريد (tenant_id, employee_id, punch_time)
--   employees.id ≠ profiles.id — نستعمل current_user_employee_id (0335)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① سجلّات الشهر — بنطاق حقيقي
--
--    ★ نحسب الحدود في القاعدة لا نستقبلها نصّاً: تمرير تاريخين من
--      المتصفح يعني الوثوق بمنطقته الزمنية، والموظف في بغداد قد يرى
--      شهراً مختلفاً عن زميله لو تغيّر إعداد جهازه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_attendance_month(INTEGER, INTEGER);

CREATE FUNCTION public.my_attendance_month(
  p_year  INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL
) RETURNS TABLE(
  out_shift_date    DATE,
  out_shift_type    TEXT,
  out_check_in      TIMESTAMPTZ,
  out_check_out     TIMESTAMPTZ,
  out_status        TEXT,
  out_total_hours   NUMERIC,
  out_late_minutes  INTEGER,
  out_early_minutes INTEGER,
  out_overtime      INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_y      INTEGER := COALESCE(p_year , EXTRACT(YEAR  FROM current_date)::INTEGER);
  v_m      INTEGER := COALESCE(p_month, EXTRACT(MONTH FROM current_date)::INTEGER);
  v_from   DATE;
  v_to     DATE;
BEGIN
  IF v_tenant IS NULL OR v_emp IS NULL THEN RETURN; END IF;

  -- ★ شهر خارج المدى يُقصّ لا يُسقط الاستعلام
  IF v_m < 1 OR v_m > 12 THEN RETURN; END IF;
  IF v_y < 1900 OR v_y > 2200 THEN RETURN; END IF;

  v_from := make_date(v_y, v_m, 1);
  v_to   := (v_from + INTERVAL '1 month')::DATE;

  RETURN QUERY
  SELECT a.shift_date,
         COALESCE(a.shift_type, '—')::TEXT,
         a.check_in,
         a.check_out,
         a.status::TEXT,
         a.total_hours,
         a.late_minutes,
         a.early_leave_minutes,
         a.overtime_minutes
    FROM public.attendance_summary a
   WHERE a.tenant_id = v_tenant
     AND a.employee_id = v_emp
     AND a.shift_date >= v_from
     AND a.shift_date <  v_to
   ORDER BY a.shift_date DESC;
END $$;

COMMENT ON FUNCTION public.my_attendance_month(INTEGER,INTEGER) IS
  'سجلّات حضور الموظف لشهر بعينه. الصفحة كانت تحسب startDate/endDate '
  'ولا تُمرّرهما لأي استعلام — فجلبت كل التاريخ وعرضته كأنه الشهر '
  'المختار (23 سجلاً بدل 3 في الإثبات).';

REVOKE ALL ON FUNCTION public.my_attendance_month(INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_attendance_month(INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_attendance_month(INTEGER,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② إحصاءات الشهر — محسوبة في القاعدة
--
--    ★ الحالات نصوص عربية حرّة (لا CHECK). نطابق ما تكتبه الأنظمة:
--      'في الوقت' · 'متأخر' · 'غائب' · 'إجازة'
--      و«حاضر» تظهر في بيانات قديمة — نقبلها ضمن الحضور.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_attendance_month_stats(INTEGER, INTEGER);

CREATE FUNCTION public.my_attendance_month_stats(
  p_year  INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL
) RETURNS TABLE(
  out_total        INTEGER,
  out_present      INTEGER,
  out_late         INTEGER,
  out_absent       INTEGER,
  out_leave        INTEGER,
  out_total_hours  NUMERIC,
  out_avg_hours    NUMERIC,
  out_late_minutes INTEGER,
  out_overtime     INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_y      INTEGER := COALESCE(p_year , EXTRACT(YEAR  FROM current_date)::INTEGER);
  v_m      INTEGER := COALESCE(p_month, EXTRACT(MONTH FROM current_date)::INTEGER);
  v_from   DATE;
  v_to     DATE;
BEGIN
  -- ★ صفّ أصفار لا «لا شيء»: الواجهة تعرض بطاقات إحصاء دائماً،
  --   وغياب الصفّ يجعلها undefined فتظهر NaN.
  IF v_tenant IS NULL OR v_emp IS NULL
     OR v_m < 1 OR v_m > 12 OR v_y < 1900 OR v_y > 2200 THEN
    RETURN QUERY SELECT 0,0,0,0,0, 0::NUMERIC, 0::NUMERIC, 0, 0;
    RETURN;
  END IF;

  v_from := make_date(v_y, v_m, 1);
  v_to   := (v_from + INTERVAL '1 month')::DATE;

  RETURN QUERY
  WITH m AS (
    SELECT a.status, a.total_hours, a.late_minutes, a.overtime_minutes
      FROM public.attendance_summary a
     WHERE a.tenant_id = v_tenant
       AND a.employee_id = v_emp
       AND a.shift_date >= v_from
       AND a.shift_date <  v_to
  )
  SELECT count(*)::INTEGER,
         -- الحضور يشمل المتأخر: حضر لكن متأخراً
         count(*) FILTER (WHERE status IN ('في الوقت','متأخر','حاضر'))::INTEGER,
         count(*) FILTER (WHERE status = 'متأخر')::INTEGER,
         count(*) FILTER (WHERE status = 'غائب')::INTEGER,
         count(*) FILTER (WHERE status = 'إجازة')::INTEGER,
         COALESCE(sum(total_hours), 0)::NUMERIC,
         -- ★ المتوسط على أيام الحضور لا كل الأيام: قسمة الساعات على
         --   أيام تشمل الغياب تُظهر متوسطاً أقلّ من الحقيقة.
         COALESCE(
           round(
             sum(total_hours) FILTER (WHERE status IN ('في الوقت','متأخر','حاضر'))
             / NULLIF(count(*) FILTER (WHERE status IN ('في الوقت','متأخر','حاضر')), 0),
             2),
           0)::NUMERIC,
         COALESCE(sum(late_minutes), 0)::INTEGER,
         COALESCE(sum(overtime_minutes), 0)::INTEGER
    FROM m;
END $$;

COMMENT ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) IS
  'إحصاءات حضور الشهر. المتوسط على أيام الحضور لا كل الأيام — القسمة '
  'على أيام تشمل الغياب تُظهر متوسطاً أقلّ من الحقيقة.';

REVOKE ALL ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ التتابع الحقيقي — العطل ②
--
--    الصفحة كانت تحسبه:
--      Math.min(filter(s => s.status !== 'غائب').length, 7)
--    وهذا **عدّ** لا **تتابع**: من حضر يوماً وغاب يوماً شهراً كاملاً
--    يحصل على 7، بينما أطول تتابع لديه = 1.
--
--    ★ الأيام بلا سجلّ لا تكسر التتابع: عطلة نهاية الأسبوع لا تُسجَّل
--      أصلاً، وكسر السلسلة عندها يجعل التتابع لا يتجاوز 5 أبداً.
--      نكسرها عند **الغياب المُسجَّل** وحده.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_attendance_streak();

CREATE FUNCTION public.my_attendance_streak()
RETURNS TABLE(
  out_current_streak INTEGER,
  out_longest_streak INTEGER,
  out_last_absence   DATE
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_emp     UUID := public.current_user_employee_id();
  r         RECORD;
  v_cur     INTEGER := 0;
  v_best    INTEGER := 0;
  v_last    DATE := NULL;
  v_running INTEGER := 0;
  v_seen    BOOLEAN := FALSE;
BEGIN
  IF v_tenant IS NULL OR v_emp IS NULL THEN
    RETURN QUERY SELECT 0, 0, NULL::DATE;
    RETURN;
  END IF;

  -- ★ من الأحدث إلى الأقدم: التتابع الحالي هو ما قبل أول غياب
  FOR r IN
    SELECT a.shift_date, a.status
      FROM public.attendance_summary a
     WHERE a.tenant_id = v_tenant
       AND a.employee_id = v_emp
       AND a.status IN ('في الوقت','متأخر','حاضر','غائب')
     ORDER BY a.shift_date DESC
     LIMIT 400
  LOOP
    IF r.status = 'غائب' THEN
      IF v_last IS NULL THEN v_last := r.shift_date; END IF;
      IF NOT v_seen THEN
        v_cur  := v_running;   -- التتابع الحالي انتهى عند أول غياب
        v_seen := TRUE;
      END IF;
      IF v_running > v_best THEN v_best := v_running; END IF;
      v_running := 0;
    ELSE
      v_running := v_running + 1;
    END IF;
  END LOOP;

  -- لا غياب إطلاقاً ⇒ التتابع الحالي = كل الأيام
  IF NOT v_seen THEN v_cur := v_running; END IF;
  IF v_running > v_best THEN v_best := v_running; END IF;

  RETURN QUERY SELECT v_cur, v_best, v_last;
END $$;

COMMENT ON FUNCTION public.my_attendance_streak() IS
  'تتابع الحضور الحقيقي. الصفحة كانت تحسبه Math.min(عدد غير الغائب, 7) '
  '— عدٌّ لا تتابع: من حضر يوماً وغاب يوماً شهراً يحصل على 7 بينما '
  'أطول تتابع لديه 1. الأيام بلا سجلّ لا تكسر السلسلة (عطلة الأسبوع).';

REVOKE ALL ON FUNCTION public.my_attendance_streak() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_attendance_streak() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_attendance_streak() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_att_summary_emp_month
  ON public.attendance_summary (tenant_id, employee_id, shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_att_logs_emp_date
  ON public.attendance_logs (tenant_id, employee_id, shift_date DESC);
