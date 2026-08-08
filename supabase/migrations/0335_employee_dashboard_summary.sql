-- ============================================================================
-- 0335_employee_dashboard_summary.sql
--
-- بوابة الموظف — حلّ معرّف الموظف وملخّص اللوحة.
--
-- ═══ العطل المُثبَت تشغيلياً ══════════════════════════════════════════════
--
--   `EmployeeDashboard.tsx` يمرّر `user.id` حيث يُنتظر `employee_id`:
--
--     attendanceSummaryService.findAll({ filters: { employee_id: user.id } })
--     expenseRequestService.findByEmployee(user.id)
--     employeeLoanService.findByEmployee(user.id)
--     employeeGoalService.findByEmployee(user.id)
--     wellnessEntryService.findByUser(user.id, 30)
--
--   لكن `user.id` هو **`profiles.id`** بينما العمود `employee_id` يشير
--   إلى **`employees.id`** — معرّفان مختلفان تماماً. مُحقَّق من
--   `pg_constraint`:
--
--     wellness_entries.employee_id    → employees
--     attendance_summary.employee_id  → employees
--     leave_balance.employee_id       → employees
--     incidents.employee_id           → employees  (وله user_id منفصل)
--
--   الإثبات على Postgres — موظف واحد ببيانات كاملة:
--
--     profiles.id  = de5e4ca9-…
--     employees.id = 63dd141c-…   ← مختلف تماماً
--
--     ★★ ما يجلبه الداشبورد (بـuser.id):
--        wellness_entries   = 0
--        attendance_summary = 0
--        employee_goals     = 0
--        leave_balance      = 0
--
--     ✅ ما هو موجود فعلاً (بـemployees.id):
--        wellness_entries   = 1
--        attendance_summary = 1
--        employee_goals     = 1
--        leave_balance      = 1
--
--   ⇒ **لوحة الموظف تعرض أصفاراً بينما بياناته كلّها موجودة.**
--
--   أربع صفحات مصابة: EmployeeDashboard · ContactPage · MyGoalsPage ·
--   SurveyPage. وعشر صفحات تحلّ المعرّف صحيحاً بتكرار يدوي للنمط:
--     employeeService.findAll({ filters: { user_id: user.id }, limit: 1 })
--
-- ═══ ما يفعله هذا المايجريشن ══════════════════════════════════════════════
--   ① my_employee_id()          — كشف current_user_employee_id للواجهة
--   ② my_dashboard_summary()    — ملخّص اللوحة في استدعاء واحد
--   ③ my_leave_balance()        — رصيد الإجازات بالمعرّف الصحيح
--   ④ فهارس
--
-- ─── حقائق بنيوية مُحقَّقة ────────────────────────────────────────────────
--   wellness_entries: score INT · **mood نصّ** ∈ great·good·neutral·bad·
--     terrible · stress · energy · date · **لا mood_score**
--   employee_goals: category ∈ performance·learning·wellbeing·career·
--     compliance·other · status ∈ draft·active·completed·cancelled
--     progress_percent 0–100
--   leave_balance: annual_total·annual_used·annual_pending·sick_total·
--     sick_used·sick_pending·hajj_taken · year INT
--   attendance_summary: shift_date·status·total_hours·late_minutes
--   expense_requests · employee_loans · payroll_records: بلا FK على
--     employee_id (لكن الدلالة نفسها = employees.id)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ⓪ ★★ قيد فريد: سجلّ موظف واحد لكل مستخدم في المستأجر
--
--    عطل ثانٍ اكتُشف أثناء إصلاح الأول. مُثبَت تشغيلياً:
--
--      بعد إنشاء الملف: عدد سجلات الموظف = 1   (محفّز 0317)
--      بعد إدراج يدوي:  عدد سجلات الموظف = 2   ⇒ لا قيد يمنع التكرار
--
--    والأخطر: `current_user_employee_id()` (0007) تختار بـ
--      SELECT e.id FROM employees e WHERE e.user_id = auth.uid() … LIMIT 1
--    **بلا ORDER BY** — فالاختيار غير محدَّد. مستخدم بسجلَّين قد يرى
--    بياناته اليوم ولا يراها غداً حسب خطة التنفيذ.
--
--    ★ فهرس **جزئي**: `user_id` يقبل NULL (موظف بلا حساب دخول —
--      حالة مشروعة)، و UNIQUE عادي يعامل كل NULL كقيمة مميزة فيسمح
--      بصفوف بلا حدّ. الفهرس الجزئي يحرس المرتبطين وحدهم.
--
--    ★ لا يُطبَّق قسراً إن وُجد تكرار قائم — نُنبّه ولا نُسقط
--      المايجريشن. حذف صفّ موظف يُيتّم حضوره وإجازاته ورواتبه.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dups INTEGER;
BEGIN
  SELECT count(*) INTO v_dups
    FROM (
      SELECT user_id, tenant_id
        FROM public.employees
       WHERE user_id IS NOT NULL
       GROUP BY user_id, tenant_id
      HAVING count(*) > 1
    ) d;

  IF v_dups > 0 THEN
    RAISE WARNING '0335: % حالة تكرار (user_id, tenant_id) في employees — '
                  'الفهرس الفريد لم يُنشأ. راجعها يدوياً: الدمج لا الحذف، '
                  'فالصفّ المحذوف يُيتّم حضوره وإجازاته.', v_dups;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_per_user_tenant
      ON public.employees (tenant_id, user_id)
      WHERE user_id IS NOT NULL;
    RAISE NOTICE '0335: قيد «سجلّ موظف واحد لكل مستخدم» مُفعَّل';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ① كشف معرّف الموظف للواجهة
--
--    `current_user_employee_id()` موجودة منذ 0007 لكنها لم تُكشف
--    كـRPC، فكل صفحة كرّرت الحلّ يدوياً — وأربع صفحات نسيته.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_employee_id();

CREATE FUNCTION public.my_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_employee_id();
$$;

COMMENT ON FUNCTION public.my_employee_id() IS
  'معرّف سجلّ الموظف للمستخدم الحالي (employees.id لا profiles.id). '
  'كشفٌ لدالة 0007 كي تتوقّف الصفحات عن تكرار الحلّ يدوياً — '
  'أربع صفحات نسيته فعرضت أصفاراً.';

REVOKE ALL ON FUNCTION public.my_employee_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_employee_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_employee_id() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② ملخّص لوحة الموظف — استدعاء واحد بدل سبعة
--
--    اللوحة كانت تُطلق سبعة استعلامات متوازية وتُجمّع في المتصفح.
--    الآن صفّ واحد محسوب في القاعدة بالمعرّف الصحيح.
--
--    ★ SECURITY INVOKER: كل جدول محميّ بسياساته ونحترمها.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_dashboard_summary();

CREATE FUNCTION public.my_dashboard_summary()
RETURNS TABLE(
  out_employee_id        UUID,
  out_total_problems     INTEGER,
  out_resolved_problems  INTEGER,
  out_pending_problems   INTEGER,
  out_wellness_score     INTEGER,
  out_attendance_rate    INTEGER,
  out_present_days       INTEGER,
  out_tracked_days       INTEGER,
  out_active_goals       INTEGER,
  out_avg_goal_progress  INTEGER,
  out_pending_expenses   INTEGER,
  out_outstanding_loans  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_uid    UUID := auth.uid();
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- ★ بلا سجلّ موظف نُعيد صفّاً بأصفار لا لا شيء: الواجهة تحتاج
  --   التمييز بين «لا بيانات» و«لا سجلّ موظف مرتبط» — الثانية
  --   تحتاج رسالة مختلفة تماماً (راجع employeeLinkMissing).
  IF v_emp IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, 0,0,0,0,0,0,0,0,0,0, 0::NUMERIC;
    RETURN;
  END IF;

  RETURN QUERY
  WITH probs AS (
    -- ★ incidents يحمل employee_id **و** user_id — نقبل الاثنين
    --   لأن البلاغات القديمة سُجّلت بـuser_id.
    SELECT i.status
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant
       AND (i.employee_id = v_emp OR i.user_id = v_uid)
  ),
  well AS (
    SELECT w.score
      FROM public.wellness_entries w
     WHERE w.employee_id = v_emp
     ORDER BY w.date DESC
     LIMIT 30
  ),
  att AS (
    SELECT a.status
      FROM public.attendance_summary a
     WHERE a.tenant_id = v_tenant
       AND a.employee_id = v_emp
     ORDER BY a.shift_date DESC
     LIMIT 30
  ),
  goals AS (
    SELECT g.progress_percent
      FROM public.employee_goals g
     WHERE g.tenant_id = v_tenant
       AND g.employee_id = v_emp
       AND g.status = 'active'
  ),
  exp AS (
    SELECT count(*)::INTEGER AS n
      FROM public.expense_requests e
     WHERE e.tenant_id = v_tenant
       AND e.employee_id = v_emp
       AND e.status IN ('pending', 'انتظار')
  ),
  loans AS (
    SELECT COALESCE(sum(l.remaining_amount), 0)::NUMERIC AS amt
      FROM public.employee_loans l
     WHERE l.tenant_id = v_tenant
       AND l.employee_id = v_emp
       AND l.status IN ('approved', 'موافق', 'active')
  )
  SELECT
    v_emp,
    (SELECT count(*)::INTEGER FROM probs),
    (SELECT count(*) FILTER (WHERE status IN ('resolved','closed'))::INTEGER FROM probs),
    (SELECT count(*) FILTER (WHERE status = 'pending')::INTEGER FROM probs),
    (SELECT COALESCE(round(avg(score))::INTEGER, 0) FROM well),
    -- ★ النسبة صفر حين لا أيام مُتتبَّعة — لا قسمة على صفر
    (SELECT CASE WHEN count(*) = 0 THEN 0
                 ELSE round(count(*) FILTER (WHERE status <> 'غائب') * 100.0 / count(*))::INTEGER
            END FROM att),
    (SELECT count(*) FILTER (WHERE status <> 'غائب')::INTEGER FROM att),
    (SELECT count(*)::INTEGER FROM att),
    (SELECT count(*)::INTEGER FROM goals),
    (SELECT COALESCE(round(avg(progress_percent))::INTEGER, 0) FROM goals),
    (SELECT n FROM exp),
    (SELECT amt FROM loans);
END $$;

COMMENT ON FUNCTION public.my_dashboard_summary() IS
  'ملخّص لوحة الموظف بالمعرّف الصحيح (employees.id). اللوحة كانت تمرّر '
  'profiles.id فتعرض أصفاراً بينما البيانات موجودة كلّها. صفّ واحد '
  'بدل سبعة استعلامات تُجمّع في المتصفح.';

REVOKE ALL ON FUNCTION public.my_dashboard_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_dashboard_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_dashboard_summary() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ رصيد الإجازات — بالمعرّف الصحيح
--
--    الأعمدة مُحقَّقة: annual_total·annual_used·annual_pending·
--    sick_total·sick_used·sick_pending·hajj_taken · year INT
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_leave_balance(INTEGER);

CREATE FUNCTION public.my_leave_balance(p_year INTEGER DEFAULT NULL)
-- ★ الأنواع NUMERIC لا INTEGER: الأعمدة مُحقَّقة من information_schema
--   annual_* :: numeric(6,3) · sick_* :: numeric(5,1)
--   نصف يوم إجازة قيمة مشروعة — تقريبها إلى صحيح يُفقد رصيداً.
RETURNS TABLE(
  out_year            INTEGER,
  out_annual_total    NUMERIC,
  out_annual_used     NUMERIC,
  out_annual_pending  NUMERIC,
  out_annual_left     NUMERIC,
  out_sick_total      NUMERIC,
  out_sick_used       NUMERIC,
  out_sick_pending    NUMERIC,
  out_sick_left       NUMERIC,
  out_hajj_taken      BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID    := public.current_user_tenant_id();
  v_emp    UUID    := public.current_user_employee_id();
  v_year   INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM current_date)::INTEGER);
BEGIN
  IF v_tenant IS NULL OR v_emp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT b.year,
         b.annual_total,
         b.annual_used,
         b.annual_pending,
         -- ★ المتبقّي يطرح المعلّق أيضاً: طلب قيد الاعتماد يحجز الرصيد.
         --   بدونه يرى الموظف رصيداً يظنّه متاحاً ثم يُرفض طلبه.
         GREATEST(0::NUMERIC, b.annual_total - b.annual_used - b.annual_pending),
         b.sick_total,
         b.sick_used,
         b.sick_pending,
         GREATEST(0::NUMERIC, b.sick_total - b.sick_used - b.sick_pending),
         b.hajj_taken
    FROM public.leave_balance b
   WHERE b.tenant_id = v_tenant
     AND b.employee_id = v_emp
     AND b.year = v_year
   LIMIT 1;
END $$;

COMMENT ON FUNCTION public.my_leave_balance(INTEGER) IS
  'رصيد إجازات الموظف الحالي. المتبقّي يطرح المعلّق — طلب قيد الاعتماد '
  'يحجز الرصيد، وبدون طرحه يرى الموظف رصيداً يظنّه متاحاً.';

REVOKE ALL ON FUNCTION public.my_leave_balance(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_leave_balance(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_leave_balance(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ فهارس — كل استعلام أعلاه يُرشّح بـemployee_id
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wellness_employee_date
  ON public.wellness_entries (employee_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_att_summary_employee_date
  ON public.attendance_summary (tenant_id, employee_id, shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_goals_employee_active
  ON public.employee_goals (tenant_id, employee_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_leave_balance_employee_year
  ON public.leave_balance (tenant_id, employee_id, year);

CREATE INDEX IF NOT EXISTS idx_employees_user_tenant
  ON public.employees (user_id, tenant_id);
