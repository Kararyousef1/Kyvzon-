-- ============================================================================
-- 0349_hr_analytics_real_metrics.sql
--
-- بوابة الموارد البشرية — المرحلة 4: صفحة التحليلات `hr/AnalyticsPage`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً على Postgres محلي (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطل ① — ربط الصحة النفسية بالأقسام يُنتج صفراً دائماً ═══════════════
--
--   `AnalyticsPage.tsx:207`
--     wellnessList.forEach((w) => {
--       const emp = profileList.find((p) => p.id === w.employee_id);
--
--   و`wellness_entries.employee_id` مفتاح أجنبي على **`employees(id)`**:
--     wellness_entries_employee_id_fkey
--       FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
--
--   و`employees.id` **≠** `profiles.id` — الجدولان مرتبطان عبر
--   `employees.user_id → profiles(id)` لا عبر تطابق المعرّف.
--
--   مُثبَت بالتشغيل (مستأجر حقيقي · موظفان · درجتان 30 و40):
--     wellness rows=2  avg_score=35
--     PAGE-LOGIC  join profiles.id = wellness.employee_id  => matches=0
--     CORRECT     join via employees.user_id               => matches=2
--
--   ⇒ عمود «متوسط الصحة» في جدول الأقسام **صفر لكل قسم أبداً**، وشريط
--     التقدّم يُرسم بعرض `0%` ويُلوَّن أحمر — أي أن كل قسم في المؤسسة
--     يظهر في حالة صحية حرجة بينما المتوسط الحقيقي 35.
--
--   ★ ملاحظة: `overallWellness` (بطاقة «مؤشر الصحة») صحيح صدفةً لأنه
--     يجمع `wellnessList` كلها بلا ربط. فالبطاقة تقول 35% والجدول يقول
--     0% — رقمان متناقضان في الشاشة نفسها من المصدر نفسه.
--
-- ═══ العطل ② — «محلولة هذا الشهر» تخلط السنوات ═════════════════════════════
--
--   `AnalyticsPage.tsx:180`
--     const currentMonth = new Date().getMonth();
--     … new Date(i.updated_at).getMonth() === currentMonth
--
--   `getMonth()` يُرجع الشهر بلا سنة ⇒ يوليو 2025 = يوليو 2026.
--
--   مُثبَت بالتشغيل (بلاغ حُلّ 2025-07-15 وآخر 2026-07-05):
--     PAGE-LOGIC  getMonth()==6 بلا سنة  => 2
--     CORRECT     يوليو 2026 فقط         => 1
--
--   ⇒ العدّاد يتضخّم بكل سنة تمرّ. وفي مؤسسة عمرها ثلاث سنوات يعرض
--     ثلاثة أضعاف الرقم الحقيقي.
--
--   ★ وأسوأ: يعتمد `updated_at` وهو يتغيّر بأي تعديل (محفّز
--     `update_incidents_updated_at` يضربه عند كل UPDATE) — فبلاغ حُلّ
--     في يناير وعُدِّل وسمُه في يوليو يُحتسب «محلولاً في يوليو».
--     الصواب `closed_at` وهو العمود المخصّص.
--
-- ═══ العطل ③ — «معدل الرضا 85%» رقم مكتوب يدوياً ═══════════════════════════
--
--   `AnalyticsPage.tsx:121`  satisfactionRate: 85,
--   `AnalyticsPage.tsx:224`  satisfactionRate: 85,
--   `AnalyticsPage.tsx:190`  satisfactionScore: 85   ← لكل قسم
--
--   ثابت لا يتغيّر مهما كانت البيانات. ويُعرض في بطاقة «معدل الرضا»
--   وفي عمود «الرضا» لكل قسم وفي رادار «مؤشرات الرضا».
--
--   ⇒ ثلاثة عناصر بصرية تعرض رقماً مُختلَقاً بوصفه قياساً.
--
-- ═══ العطل ④ — «متوسط وقت الحل 2.4 أيام» رقم مكتوب يدوياً ══════════════════
--
--   `AnalyticsPage.tsx:225`  avgResolutionTime: 2.4,
--
--   لا يُقرأ من أي جدول. والبيانات اللازمة موجودة كاملةً:
--   `incidents.created_at` و`incidents.closed_at`.
--
-- ═══ العطل ⑤ — «تحليل المشاعر الشهري» رسم بياني مُصنَّع ════════════════════
--
--   `AnalyticsPage.tsx:131`
--     const positive = Math.min(90, 40 + dept.employeeCount * 2 + resolvedCount);
--     const negative = Math.max(5, 30 - dept.employeeCount);
--     const neutral  = 100 - positive - negative;
--     return { month: monthNames[idx % 6] … }
--
--   هذه معادلة مُختلَقة لا مصدر لها. والأسوأ أن المحور السيني يُسمّى
--   «شهر» ويحمل أسماء يوليو…ديسمبر، بينما الصفوف **أقسام** لا أشهر:
--   `stats.departmentStats.slice(0,6).map((dept, idx) => …)`.
--
--   ⇒ القسم الأول يُسمّى «يوليو» والثاني «أغسطس». الرسم يُقرأ كسلسلة
--     زمنية وهو ليس كذلك. والبطاقة تحمل وسم «تحليل AI».
--
--   ★ ونفس العطل حرفياً في `wellnessTrend` (:157) — وسمها «6 أشهر»
--     وهي ستة أقسام.
--
--   ★★ أُصحّح نفسي علناً: ظننتُ ابتداءً أن `neutral` قد يصير سالباً.
--      حسبتُها يدوياً على الحدود — `positive ≤ 90` و`negative ≥ 5`
--      ⇒ `neutral ≥ 5` دائماً. **الادعاء كان خاطئاً ولم أُدرجه.**
--
-- ═══ العطل ⑥ — معدل الحضور يحتسب العطلة والإجازة حضوراً ════════════════════
--
--   `WorkforceAnalyticsService.ts:50`
--     presentRows = rows.filter(a => !['غائب','absent'].includes(status))
--     attendanceRate = presentRows.length / attendanceRows.length
--
--   أي أن **كل** حالة عدا «غائب» تُحتسب حضوراً — بما فيها `عطلة`
--   و`مجاز` و`إجازة_انتظار`. ومفردات 0344 الثماني هي:
--     حضور_بوقت · متأخر · زمنية_معتمدة · زمنية_انتظار ·
--     غائب · مجاز · إجازة_انتظار · عطلة
--
--   مُثبَت بالتشغيل (5 أيام: حضور_بوقت · عطلة · عطلة · مجاز · غائب):
--     SERVICE-LOGIC (كل ما ليس غائب = حاضر) => 4/5 = 80%
--     CORRECT (أيام العمل فقط، حضور فعلي)   => 1/3 = 33%
--
--   ⇒ انحراف 47 نقطة مئوية. ومن يقرأ «معدل حضور 80%» يظنّ المؤسسة
--     بخير وهي عند 33%. والخطأ ينمو كلما زادت العطل.
--
-- ═══ العطل ⑦ — البلاغات المفتوحة تعدّ المؤرشف ══════════════════════════════
--
--   `WorkforceAnalyticsService.ts:58`
--     openIncidents = incidents.filter(i => !['resolved','closed',…]).length
--
--   ولا ذكر لـ`archived_at` — وهو العمود الذي أضافته دورة حياة البلاغ.
--
--   مُثبَت بالتشغيل (بلاغ واحد pending ومؤرشف):
--     SERVICE-LOGIC (يتجاهل archived_at) => 1
--     CORRECT (يستثني المؤرشف)           => 0
--
-- ═══ العطل ⑧ — «التحليل المتقدم» يعرض نتائج مُصنَّعة بعد انتظار وهمي ═══════
--
--   `AnalyticsPage.tsx:250`  await new Promise(r => setTimeout(r, 2500));
--
--   تأخير مُفتعَل يُوهم بمعالجة، ثم تُعرض ثوابت مكتوبة في الملف:
--     «دقة النموذج 91%» · «p-value < 0.05» · «Random Forest»
--     «تحليل فجوة المهارات: 40% من المهندسين…» · «+12k سجل»
--     chartData = [{ name:'أسبوع 1', actual:78 }, …]
--
--   لا شيء من هذا يمسّ قاعدة البيانات. والبطاقة موسومة «AI Powered».
--
--   ★ سابقة مُوثَّقة في الملف نفسه (:283): أُزيلت محاكاة `Math.random()`
--     في فرع الارتباط واستُبدلت بحالة فارغة صادقة. هذا المايجريشن
--     يُكمل ما بدأه ذلك التعليق على بقية الفروع.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ما يفعله هذا المايجريشن
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ① `hr_analytics_overview(p_from, p_to)`  — البطاقات العليا:
--        الموظفون · الحضور الفعلي · الغياب · التأخير · مؤشر الصحة
--        · متوسط وقت الحل المحسوب · المحلولة في النطاق · المفتوحة
--        (بلا مؤرشف) · العقود المنتهية · تغطية التعاقب.
--
--   ② `hr_analytics_departments(p_from, p_to)` — صفّ لكل قسم حقيقي من
--        جدول `departments` عبر `employees.department_id`، لا من نصّ
--        `profiles.department` الحرّ. مع متوسط صحة **مربوط صحيحاً**.
--
--   ③ `hr_analytics_wellness_trend(p_months)` — سلسلة زمنية **حقيقية**
--        بالشهر من `wellness_entries.date`. تُنهي تسمية الأقسام بأسماء
--        أشهر.
--
--   ④ `hr_analytics_incident_trend(p_months)` — الوارد مقابل المُغلق
--        بالشهر — بديل صادق لـ«تحليل المشاعر» المُصنَّع.
--
--   الأربع `STABLE` و`SECURITY DEFINER` مع `search_path=public` وتُرشّح
--   بـ`current_user_tenant_id()` داخلياً، وتشترط `current_user_is_staff()`.
--
--   ولا تُنشئ جداول ولا تكتب شيئاً — القراءة فقط.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① نظرة عامة — كل رقم محسوب من مصدره
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_analytics_overview(DATE, DATE);

CREATE FUNCTION public.hr_analytics_overview(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_to   DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  out_total_employees      INTEGER,
  out_active_employees     INTEGER,
  out_working_days         INTEGER,
  out_present_days         INTEGER,
  out_absent_days          INTEGER,
  out_late_days            INTEGER,
  out_leave_days           INTEGER,
  out_holiday_days         INTEGER,
  out_attendance_rate      NUMERIC,
  out_absenteeism_rate     NUMERIC,
  out_late_rate            NUMERIC,
  out_wellness_score       NUMERIC,
  out_wellness_samples     INTEGER,
  out_avg_resolution_days  NUMERIC,
  out_resolved_in_range    INTEGER,
  out_open_incidents       INTEGER,
  out_contracts_expiring   INTEGER,
  out_critical_positions   INTEGER,
  out_succession_coverage  NUMERIC
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الموارد البشرية';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.is_active
      FROM public.employees e
     WHERE e.tenant_id = v_tenant
  ),
  -- ★ العطل ⑥ — تعريف المقام صراحةً بدل «كل ما ليس غائب».
  --
  --   المفردات الثماني (0344) تُصنَّف هكذا، وكل صنف مُعلَن لا ضمني:
  --
  --     عطلة          ⇒ ليست يوم عمل أصلاً    — خارج المقام كلياً
  --     مجاز          ⇒ إجازة **معتمَدة**      — خارج المقام (غياب مشروع)
  --     إجازة_انتظار  ⇒ إجازة **لم تُعتمَد**   — داخل المقام وغير حاضر
  --     غائب          ⇒ غياب                   — داخل المقام وغير حاضر
  --     حضور_بوقت · متأخر · زمنية_معتمدة · زمنية_انتظار ⇒ حاضر فعلاً
  --
  --   ★★ أُصحّح نفسي: حسبتُ ابتداءً المقام بحذف `عطلة` وحدها، فظهر
  --      6 بدل 5 وأسقط التأكيد SENTINEL_A2. السبب أن `مجاز` ليست
  --      `عطلة`. الاحتساب الصامت للإجازة المعتمَدة غياباً يظلم الموظف،
  --      فصار الاستبعاد صريحاً — ويومَا العطلة والإجازة يُعادان في
  --      عمودين مستقلّين كي لا يختفي شيء من الحساب.
  att AS (
    SELECT s.status, s.late_minutes
      FROM public.attendance_summary s
      JOIN emp ON emp.id = s.employee_id
     WHERE s.tenant_id  = v_tenant
       AND s.shift_date BETWEEN p_from AND p_to
  ),
  att_agg AS (
    SELECT
      count(*) FILTER (WHERE status NOT IN ('عطلة','مجاز'))::INTEGER AS working_days,
      count(*) FILTER (
        WHERE status IN ('حضور_بوقت','متأخر','زمنية_معتمدة','زمنية_انتظار')
      )::INTEGER AS present_days,
      count(*) FILTER (WHERE status = 'غائب')::INTEGER AS absent_days,
      count(*) FILTER (
        WHERE status <> 'عطلة'
          AND (status = 'متأخر' OR COALESCE(late_minutes,0) > 0)
      )::INTEGER AS late_days,
      count(*) FILTER (WHERE status = 'مجاز')::INTEGER  AS leave_days,
      count(*) FILTER (WHERE status = 'عطلة')::INTEGER  AS holiday_days
      FROM att
  ),
  -- ★ العطل ①: الربط عبر employees.id مباشرةً — لا عبر profiles.id.
  well AS (
    SELECT w.score
      FROM public.wellness_entries w
      JOIN emp ON emp.id = w.employee_id
     WHERE w.tenant_id = v_tenant
       AND w.date BETWEEN p_from AND p_to
  ),
  -- ★ العطل ②+④: closed_at لا updated_at · والنطاق يحمل سنته.
  inc_closed AS (
    SELECT i.created_at, i.closed_at
      FROM public.incidents i
     WHERE i.tenant_id   = v_tenant
       AND i.archived_at IS NULL
       AND i.closed_at   IS NOT NULL
       AND i.closed_at  >= p_from::timestamptz
       AND i.closed_at   < (p_to + 1)::timestamptz
  ),
  -- ★ العطل ⑦: المؤرشف ليس مفتوحاً.
  inc_open AS (
    SELECT 1 AS n
      FROM public.incidents i
     WHERE i.tenant_id   = v_tenant
       AND i.archived_at IS NULL
       AND i.status NOT IN ('resolved','closed')
  ),
  contracts AS (
    SELECT 1 AS n
      FROM public.employee_contracts c
     WHERE c.tenant_id = v_tenant
       AND c.status    = 'active'
       AND c.end_date IS NOT NULL
       AND c.end_date >= CURRENT_DATE
       AND c.end_date <= CURRENT_DATE
                       + (COALESCE(c.renewal_notice_days,30) || ' days')::INTERVAL
  ),
  pos AS (
    SELECT p.id
      FROM public.critical_positions p
     WHERE p.tenant_id  = v_tenant
       AND p.status     = 'active'
       AND p.risk_level IN ('high','critical')
  ),
  pos_cov AS (
    SELECT count(*)::INTEGER AS covered
      FROM pos
     WHERE EXISTS (
       SELECT 1 FROM public.succession_candidates sc
        WHERE sc.critical_position_id = pos.id
          AND sc.tenant_id = v_tenant
     )
  )
  SELECT
    (SELECT count(*)::INTEGER FROM emp),
    (SELECT count(*) FILTER (WHERE is_active IS NOT FALSE)::INTEGER FROM emp),
    a.working_days,
    a.present_days,
    a.absent_days,
    a.late_days,
    a.leave_days,
    a.holiday_days,
    CASE WHEN a.working_days > 0
         THEN round(a.present_days * 100.0 / a.working_days, 1) ELSE 0 END,
    CASE WHEN a.working_days > 0
         THEN round(a.absent_days  * 100.0 / a.working_days, 1) ELSE 0 END,
    CASE WHEN a.working_days > 0
         THEN round(a.late_days    * 100.0 / a.working_days, 1) ELSE 0 END,
    COALESCE((SELECT round(avg(score), 1) FROM well), 0),
    (SELECT count(*)::INTEGER FROM well),
    COALESCE((
      SELECT round(avg(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400.0), 2)
        FROM inc_closed
    ), 0),
    (SELECT count(*)::INTEGER FROM inc_closed),
    (SELECT count(*)::INTEGER FROM inc_open),
    (SELECT count(*)::INTEGER FROM contracts),
    (SELECT count(*)::INTEGER FROM pos),
    CASE WHEN (SELECT count(*) FROM pos) > 0
         THEN round((SELECT covered FROM pos_cov) * 100.0
                    / (SELECT count(*) FROM pos), 1)
         ELSE 0 END
  FROM att_agg a;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_analytics_overview(DATE,DATE) TO authenticated;

COMMENT ON FUNCTION public.hr_analytics_overview(DATE,DATE) IS
  'تحليلات الموارد البشرية — البطاقات العليا. يستبعد `عطلة` من مقام الحضور '
  '(العطل ⑥) والمؤرشف من المفتوح (العطل ⑦) ويحسب وقت الحل من closed_at '
  'بدل الثابت 2.4 (العطل ②+④).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② إحصاءات الأقسام — الربط الصحيح للصحة النفسية
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_analytics_departments(DATE, DATE);

CREATE FUNCTION public.hr_analytics_departments(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_to   DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  out_department_id   UUID,
  out_department_name TEXT,
  out_employee_count  INTEGER,
  out_incident_count  INTEGER,
  out_resolved_count  INTEGER,
  out_open_count      INTEGER,
  out_wellness_avg    NUMERIC,
  out_wellness_samples INTEGER,
  out_attendance_rate NUMERIC,
  out_absent_days     INTEGER
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الموارد البشرية';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.department_id
      FROM public.employees e
     WHERE e.tenant_id = v_tenant
       AND e.is_active IS NOT FALSE
  ),
  d AS (
    SELECT dd.id, dd.name_ar
      FROM public.departments dd
     WHERE dd.tenant_id = v_tenant
  ),
  emp_cnt AS (
    SELECT department_id, count(*)::INTEGER AS n
      FROM emp GROUP BY department_id
  ),
  -- ★ العطل ①: wellness_entries.employee_id → employees.id مباشرةً.
  --   المنطق القديم كان يقارنه بـ profiles.id ⇒ صفر مطابقة دائماً.
  well AS (
    SELECT e.department_id,
           round(avg(w.score), 1) AS avg_score,
           count(*)::INTEGER      AS samples
      FROM public.wellness_entries w
      JOIN emp e ON e.id = w.employee_id
     WHERE w.tenant_id = v_tenant
       AND w.date BETWEEN p_from AND p_to
     GROUP BY e.department_id
  ),
  -- البلاغات تُنسب للقسم عبر employee_id (موظف) لا reported_by (بروفايل).
  inc AS (
    SELECT e.department_id,
           count(*)::INTEGER AS total,
           count(*) FILTER (WHERE i.status IN ('resolved','closed'))::INTEGER AS resolved,
           count(*) FILTER (WHERE i.status NOT IN ('resolved','closed'))::INTEGER AS still_open
      FROM public.incidents i
      JOIN emp e ON e.id = i.employee_id
     WHERE i.tenant_id   = v_tenant
       AND i.archived_at IS NULL
       AND i.created_at >= p_from::timestamptz
       AND i.created_at  < (p_to + 1)::timestamptz
     GROUP BY e.department_id
  ),
  att AS (
    -- نفس تصنيف العطل ⑥ حرفياً: عطلة ومجاز خارج المقام.
    SELECT e.department_id,
           count(*) FILTER (WHERE s.status NOT IN ('عطلة','مجاز'))::INTEGER AS working_days,
           count(*) FILTER (
             WHERE s.status IN ('حضور_بوقت','متأخر','زمنية_معتمدة','زمنية_انتظار')
           )::INTEGER AS present_days,
           count(*) FILTER (WHERE s.status = 'غائب')::INTEGER AS absent_days
      FROM public.attendance_summary s
      JOIN emp e ON e.id = s.employee_id
     WHERE s.tenant_id  = v_tenant
       AND s.shift_date BETWEEN p_from AND p_to
     GROUP BY e.department_id
  )
  SELECT
    d.id,
    d.name_ar,
    COALESCE(emp_cnt.n, 0),
    COALESCE(inc.total, 0),
    COALESCE(inc.resolved, 0),
    COALESCE(inc.still_open, 0),
    COALESCE(well.avg_score, 0),
    COALESCE(well.samples, 0),
    CASE WHEN COALESCE(att.working_days,0) > 0
         THEN round(att.present_days * 100.0 / att.working_days, 1)
         ELSE 0 END,
    COALESCE(att.absent_days, 0)
    FROM d
    LEFT JOIN emp_cnt ON emp_cnt.department_id = d.id
    LEFT JOIN well    ON well.department_id    = d.id
    LEFT JOIN inc     ON inc.department_id     = d.id
    LEFT JOIN att     ON att.department_id     = d.id
   ORDER BY COALESCE(emp_cnt.n,0) DESC, d.name_ar;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_analytics_departments(DATE,DATE) TO authenticated;

COMMENT ON FUNCTION public.hr_analytics_departments(DATE,DATE) IS
  'إحصاءات الأقسام. يربط wellness_entries.employee_id بـ employees.id '
  '(العطل ①: المنطق القديم قارنه بـ profiles.id ⇒ صفر مطابقة) '
  'ويستبدل satisfactionScore الثابت 85 بمقاييس محسوبة (العطل ③).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ اتجاه الصحة النفسية — سلسلة زمنية حقيقية بالشهر
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ العطل ⑤: المنطق القديم رسم **أقسامًا** وسمّاها «يوليو…ديسمبر».
--   هذه الدالة تُرجع أشهراً فعلية من `wellness_entries.date`، وتُخرج
--   صفّاً لكل شهر في المدى حتى لو خلا من قياسات (samples = 0)
--   كي لا يقفز الرسم فوق الفجوات ويُوهم باستمرارية.

DROP FUNCTION IF EXISTS public.hr_analytics_wellness_trend(INTEGER);

CREATE FUNCTION public.hr_analytics_wellness_trend(p_months INTEGER DEFAULT 6)
RETURNS TABLE(
  out_month_start DATE,
  out_avg_score   NUMERIC,
  out_samples     INTEGER,
  out_employees   INTEGER
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الموارد البشرية';
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
  emp AS (
    SELECT e.id FROM public.employees e WHERE e.tenant_id = v_tenant
  ),
  w AS (
    SELECT date_trunc('month', we.date)::DATE AS m,
           avg(we.score)                      AS avg_score,
           count(*)::INTEGER                  AS samples,
           count(DISTINCT we.employee_id)::INTEGER AS employees
      FROM public.wellness_entries we
      JOIN emp ON emp.id = we.employee_id
     WHERE we.tenant_id = v_tenant
     GROUP BY 1
  )
  SELECT months.m,
         COALESCE(round(w.avg_score, 1), 0),
         COALESCE(w.samples, 0),
         COALESCE(w.employees, 0)
    FROM months
    LEFT JOIN w ON w.m = months.m
   ORDER BY months.m;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_analytics_wellness_trend(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.hr_analytics_wellness_trend(INTEGER) IS
  'اتجاه الصحة النفسية بالشهر — سلسلة زمنية حقيقية. يُنهي العطل ⑤ '
  'حيث كان المنطق القديم يرسم أقساماً ويسمّيها بأسماء أشهر.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ اتجاه البلاغات — بديل صادق لـ«تحليل المشاعر» المُصنَّع
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_analytics_incident_trend(INTEGER);

CREATE FUNCTION public.hr_analytics_incident_trend(p_months INTEGER DEFAULT 6)
RETURNS TABLE(
  out_month_start   DATE,
  out_opened        INTEGER,
  out_closed        INTEGER,
  out_avg_days      NUMERIC
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الموارد البشرية';
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
  opened AS (
    SELECT date_trunc('month', i.created_at)::DATE AS m, count(*)::INTEGER AS n
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant AND i.archived_at IS NULL
     GROUP BY 1
  ),
  closed AS (
    SELECT date_trunc('month', i.closed_at)::DATE AS m,
           count(*)::INTEGER AS n,
           avg(EXTRACT(EPOCH FROM (i.closed_at - i.created_at)) / 86400.0) AS d
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant AND i.archived_at IS NULL
       AND i.closed_at IS NOT NULL
     GROUP BY 1
  )
  SELECT months.m,
         COALESCE(opened.n, 0),
         COALESCE(closed.n, 0),
         COALESCE(round(closed.d, 2), 0)
    FROM months
    LEFT JOIN opened ON opened.m = months.m
    LEFT JOIN closed ON closed.m = months.m
   ORDER BY months.m;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_analytics_incident_trend(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.hr_analytics_incident_trend(INTEGER) IS
  'الوارد مقابل المُغلق بالشهر — بديل صادق لرسم «تحليل المشاعر» '
  'المُصنَّع بمعادلة 40 + employeeCount*2 (العطل ⑤).';

COMMIT;
