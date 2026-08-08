-- ============================================================================
-- 0344_attendance_status_vocabulary.sql
--
-- بوابة الموظف: مفردات حالة الحضور · تصحيح الحضور · إصلاح انحدار 0337.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ★★★ تصحيح علنيّ لخطأ ارتكبتُه في 0337
-- ═══════════════════════════════════════════════════════════════════════════
--
--   في 0337 كتبتُ في التعليق:
--
--     «★ الحالات نصوص عربية: 'في الوقت' · 'متأخر' · 'غائب' · 'إجازة'
--       (لا CHECK يقيّدها — قيم حرّة، لذلك نطابق نصّاً)»
--
--   **هذا خاطئ.** المفردات الفعلية التي تكتبها المنصّة ثمانٍ لا أربع،
--   ولا واحدة منها 'في الوقت' ولا 'حاضر' ولا 'إجازة'. المصدر الوحيد
--   للحقيقة هو `determineAttendanceStatus` في
--   `src/utils/shiftCalculations.ts:261` — وهي الدالة التي تُنتج كل
--   قيمة تُكتب في العمود:
--
--     'عطلة' · 'مجاز' · 'إجازة_انتظار' · 'غائب' ·
--     'زمنية_معتمدة' · 'زمنية_انتظار' · 'متأخر' · 'حضور_بوقت'
--
--   وهي نفسها `AttendanceStatus` في `src/utils/shiftTypes.ts:15`،
--   ونفسها `STATUS_LABELS`/`STATUS_COLORS` في `src/utils/shiftReports.ts:9`،
--   ونفسها ما يكتبه `leaveAttendanceLink.ts:57` ('مجاز') و`:123`
--   ('زمنية_معتمدة')، ونفسها ما يقرأه `KioskPage.tsx:164`
--   و`MyAttendancePage.tsx:91` و`AIInsightsDashboard.tsx:98`
--   و`attendanceNotificationService.ts:347`، ونفسها ما يعرضه
--   `database/seeds/complete_demo.sql:194` في CASE من ثمانية فروع.
--
--   ثمانية مصادر مستقلة تقول الشيء نفسه — و0337 قال غيره.
--
--   ★ ولماذا لم يسقط اختبار العقد؟ لأنه **نسخ نصّ المايجريشن**:
--     `src/test/myAttendanceContract.test.ts:87`
--
--       expect(body).toMatch(
--         /sum\(total_hours\) FILTER \(WHERE status IN \('في الوقت','متأخر','حاضر'\)\)/
--       );
--
--     هذا يقارن الدالة بنفسها. لو كتبتُ 'أبجد' لمرّ الاختبار بشرط أن
--     أكتب 'أبجد' في الاختبار أيضاً. هذا **درس التغطية للمرة التاسعة**:
--     «نسخ المنطق بدل استدعائه». الاختبار الجديد يُدرج صفوفاً بحالات
--     حقيقية ويطالب بأرقام **محسوبة يدوياً سلفاً**.
--
-- ─── الإثبات التشغيلي (Postgres محلي · قبل الإصلاح) ────────────────────────
--
--   سبعة أيام بمفردات الشيفرة الحقيقية:
--     3/1 حضور_بوقت 8.00 · 3/2 حضور_بوقت 8.00 · 3/3 متأخر 7.00 (30د)
--     3/4 زمنية_معتمدة 6.00 · 3/5 غائب 0 · 3/8 مجاز 0 · 3/9 عطلة 0
--
--     ★★★ ما تُرجعه my_attendance_month_stats(2026,3):
--          total=7  present=1  late=1  absent=1  leave=0
--          totalHours=29.00  avgHours=7.00
--
--     ✅ الحقيقة:
--          total=7  present=4  late=1  absent=1  leave=2
--          totalHours=29.00  avgHours=7.25
--
--   ⇒ الموظف الذي حضر **أربعة** أيام يرى «حضور: 1». و'مجاز' و'عطلة'
--     يسقطان من كل خانة — لا حضوراً ولا إجازةً ولا غياباً: يتبخّران.
--     والمتوسط 7.00 بدل 7.25 لأن البسط جمع يوماً واحداً (8.00) والمقام 1،
--     بينما الصحيح 29.00/4.
--
--     ★★ لاحظ أن total=7 صحيح — لأنه count(*) بلا ترشيح حالة. لهذا
--        بدت الشاشة «تعمل»: الرقم الإجمالي سليم والتفصيل كلّه خطأ.
--
--     ★★★ my_attendance_streak(): current=0  longest=1  lastAbsence=2026-03-05
--         الحقيقة: أطول تتابع = 4 (1·2·3·4 مارس متتالية حضوراً فعلياً).
--         عادت 1 لأن 'حضور_بوقت' و'زمنية_معتمدة' خارج قائمتها البيضاء
--         `IN ('في الوقت','متأخر','حاضر','غائب')` — فلم يبقَ إلا 'متأخر'
--         (3/3) وحده بين غياب مُسجَّل وما قبله.
--
-- ═══ العطل ② — رحلة الإجازة ↔ الحضور مقطوعة في ثلاثة مواضع ═════════════════
--
--   `src/services/integrations/leaveAttendanceLink.ts` هو ما يجعل الإجازة
--   المعتمَدة تظهر في سجلّ الحضور بحالة 'مجاز'. وهو يلمس Supabase مباشرة
--   (لا يمرّ بـBaseService) فلا يستفيد من حقن tenant_id:
--
--   ② -أ  `:52` upsert بلا tenant_id — مُثبَت:
--           null value in column "tenant_id" of relation
--           "attendance_summary" violates not-null constraint
--
--   ② -ب  `:63` onConflict: 'employee_id, shift_date' — والقيد الحقيقي
--           UNIQUE (tenant_id, employee_id, shift_date). مُثبَت:
--           there is no unique or exclusion constraint matching the
--           ON CONFLICT specification
--           (فهارس فريدة على العمودين وحدهما = 0)
--
--   ② -ج  `:189` supabase.rpc('refresh_attendance_summary', …) —
--           مُثبَت: SELECT count(*) FROM pg_proc WHERE
--           proname='refresh_attendance_summary' ⇒ **0**
--           الدالة موجودة في `database/legacy-DO-NOT-USE/schema.sql:869`
--           فقط ولم تُنقَل قط إلى supabase/migrations. صفر مطابقة في
--           `grep -rln refresh_attendance_summary supabase/`.
--
--   ⇒ اعتماد إجازة لا يُحدِّث الحضور إطلاقاً (② -أ)، ورفضها يحذف الصفوف
--     حذفاً نهائياً ثم يستدعي دالةً غير موجودة لإعادة بنائها (② -ج)
--     ⇒ **فقدان بيانات صافٍ**. وهذا مخالف لقاعدة «لا حذف نهائي».
--
-- ═══ العطل ③ — العمود بلا قيد ══════════════════════════════════════════════
--
--   مُثبَت: قيود CHECK على attendance_summary = 0. أدرجتُ
--   status='قيمة عشوائية لا معنى لها' بلا اعتراض. عمودٌ تقرأه ست شاشات
--   بمطابقة نصّية ولا يمنع الخطأ المطبعي — وهو بالضبط ما سمح لخطأ 0337
--   بالمرور صامتاً.
--
-- ═══ ما يفعله هذا المايجريشن ═══════════════════════════════════════════════
--   ① دالة تصنيف مركزية `attendance_status_bucket(text)` — مصدر حقيقة واحد
--   ② إعادة كتابة my_attendance_month_stats بالمفردات الصحيحة
--   ③ إعادة كتابة my_attendance_streak بالمفردات الصحيحة
--   ④ apply_leave_to_attendance / revert_leave_from_attendance
--      — بديل leaveAttendanceLink بلا حذف نهائي
--   ⑤ my_attendance_corrections — سجلّ طلبات التصحيح
--   ⑥ قيد CHECK على status + فهرس
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① التصنيف المركزي
--
--    ★ لماذا دالة لا قائمة مكرّرة في كل استعلام؟ لأن التكرار هو ما
--      أنتج عطل 0337: القائمة كُتبت أربع مرات في ملف واحد، فكفى أن
--      تكون خاطئة مرّة لتكون خاطئة أربعاً. الآن التغيير في موضع واحد.
--
--    الدلالات الأربع:
--      present — حضر فعلاً بأي صورة (بوقته · متأخراً · بزمنية)
--      absent  — غاب غياباً مُسجَّلاً
--      leave   — إجازة أو عطلة: ليس حضوراً ولا غياباً
--      unknown — نصّ لا نعرفه (بيانات قديمة أو خطأ مطبعي)
--
--    ★★ 'إجازة_انتظار' و'زمنية_انتظار' ليستا حالتين معلّقتين إدارياً بل
--      وصفٌ ليوم مضى: الموظف لم يبصم وطلب إجازته قيد النظر
--      ('إجازة_انتظار' ⇒ لا حضور)، أو بصم وخرج بزمنية لم تُعتمد بعد
--      ('زمنية_انتظار' ⇒ حضور، فالبصمة موجودة).
--      المرجع: determineAttendanceStatus — 'إجازة_انتظار' تُعاد من فرع
--      `IF NOT hasPunch`، و'زمنية_انتظار' من فرع بعد `hasPunch`.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.attendance_status_bucket(TEXT);

CREATE FUNCTION public.attendance_status_bucket(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_status
    WHEN 'حضور_بوقت'     THEN 'present'
    WHEN 'متأخر'          THEN 'present'
    WHEN 'زمنية_معتمدة'  THEN 'present'
    WHEN 'زمنية_انتظار'  THEN 'present'
    WHEN 'غائب'           THEN 'absent'
    WHEN 'مجاز'           THEN 'leave'
    WHEN 'إجازة_انتظار'  THEN 'leave'
    WHEN 'عطلة'           THEN 'leave'
    ELSE 'unknown'
  END;
$$;

COMMENT ON FUNCTION public.attendance_status_bucket(TEXT) IS
  'تصنيف حالة الحضور إلى present/absent/leave/unknown. مصدر الحقيقة '
  'الوحيد للمفردات الثماني التي تُنتجها determineAttendanceStatus في '
  'src/utils/shiftCalculations.ts:261. مايجريشن 0337 استعمل مفردات '
  'مختلقة (في الوقت·حاضر·إجازة) فأظهر «حضور 1» لموظف حضر 4 أيام.';

GRANT EXECUTE ON FUNCTION public.attendance_status_bucket(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② إحصاءات الشهر — بالمفردات الصحيحة
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
  out_overtime     INTEGER,
  out_unknown      INTEGER
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
  -- صفّ أصفار لا «لا شيء»: الواجهة تعرض البطاقات دائماً (0337)
  IF v_tenant IS NULL OR v_emp IS NULL
     OR v_m < 1 OR v_m > 12 OR v_y < 1900 OR v_y > 2200 THEN
    RETURN QUERY SELECT 0,0,0,0,0, 0::NUMERIC, 0::NUMERIC, 0, 0, 0;
    RETURN;
  END IF;

  v_from := make_date(v_y, v_m, 1);
  v_to   := (v_from + INTERVAL '1 month')::DATE;

  RETURN QUERY
  WITH m AS (
    SELECT public.attendance_status_bucket(a.status) AS bucket,
           a.status,
           a.total_hours,
           a.late_minutes,
           a.overtime_minutes
      FROM public.attendance_summary a
     WHERE a.tenant_id = v_tenant
       AND a.employee_id = v_emp
       AND a.shift_date >= v_from
       AND a.shift_date <  v_to
  )
  SELECT count(*)::INTEGER,
         count(*) FILTER (WHERE bucket = 'present')::INTEGER,
         -- ★ 'متأخر' وحدها: 'زمنية_معتمدة' حضور لكنها ليست تأخيراً
         count(*) FILTER (WHERE status = 'متأخر')::INTEGER,
         count(*) FILTER (WHERE bucket = 'absent')::INTEGER,
         count(*) FILTER (WHERE bucket = 'leave')::INTEGER,
         COALESCE(sum(total_hours), 0)::NUMERIC,
         -- المتوسط على أيام الحضور لا كل الأيام (0337 — المبدأ صحيح،
         -- والقائمة هي التي كانت خاطئة)
         COALESCE(
           round(
             sum(total_hours) FILTER (WHERE bucket = 'present')
             / NULLIF(count(*) FILTER (WHERE bucket = 'present'), 0),
             2),
           0)::NUMERIC,
         COALESCE(sum(late_minutes), 0)::INTEGER,
         COALESCE(sum(overtime_minutes), 0)::INTEGER,
         -- ★★ نكشف المجهول لا نخفيه: صفر يعني أن المفردات متطابقة،
         --    وأي رقم أكبر يعني بياناتٍ بحالة لا نعرفها.
         count(*) FILTER (WHERE bucket = 'unknown')::INTEGER
    FROM m;
END $$;

COMMENT ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) IS
  'إحصاءات حضور الشهر. 0344 صحّح مفردات 0337 المختلقة: موظف حضر 4 أيام '
  'كان يرى «حضور 1» و«إجازة 0» ومتوسطاً 7.00 بدل 7.25. out_unknown '
  'يكشف أي حالة خارج المفردات الثماني بدل ابتلاعها صامتاً.';

REVOKE ALL ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ التتابع — بالمفردات الصحيحة
--
--    مبدأ 0337 سليم: 'غائب' يكسر · الأيام بلا سجلّ لا تكسر (عطلة
--    الأسبوع غير مُسجَّلة أصلاً). الخطأ كان في القائمة البيضاء وحدها.
--
--    ★★ 'مجاز'/'عطلة'/'إجازة_انتظار' لا تُحتسب حضوراً **ولا تكسر**:
--      من أخذ إجازةً أسبوعاً ثم عاد لا يبدأ من الصفر، ومن أُجيز لا
--      يُكافأ بأيام لم يعملها. تُتخطّى تماماً — وهذا ما يفعله
--      `bucket <> 'leave'` في الترشيح.
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

  FOR r IN
    SELECT a.shift_date,
           public.attendance_status_bucket(a.status) AS bucket
      FROM public.attendance_summary a
     WHERE a.tenant_id = v_tenant
       AND a.employee_id = v_emp
       -- ★ الإجازة والعطلة تُتخطّى · المجهول يُتخطّى (لا نخمّن دلالته)
       AND public.attendance_status_bucket(a.status) IN ('present','absent')
     ORDER BY a.shift_date DESC
     LIMIT 400
  LOOP
    IF r.bucket = 'absent' THEN
      IF v_last IS NULL THEN v_last := r.shift_date; END IF;
      IF NOT v_seen THEN
        v_cur  := v_running;
        v_seen := TRUE;
      END IF;
      IF v_running > v_best THEN v_best := v_running; END IF;
      v_running := 0;
    ELSE
      v_running := v_running + 1;
    END IF;
  END LOOP;

  IF NOT v_seen THEN v_cur := v_running; END IF;
  IF v_running > v_best THEN v_best := v_running; END IF;

  RETURN QUERY SELECT v_cur, v_best, v_last;
END $$;

COMMENT ON FUNCTION public.my_attendance_streak() IS
  'تتابع الحضور. 0344 صحّح مفردات 0337: أطول تتابع كان يعود 1 بدل 4 '
  'لأن حضور_بوقت وزمنية_معتمدة كانتا خارج القائمة البيضاء. الإجازة '
  'والعطلة تُتخطّى — لا تُحتسب حضوراً ولا تكسر السلسلة.';

REVOKE ALL ON FUNCTION public.my_attendance_streak() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_attendance_streak() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_attendance_streak() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ ربط الإجازة بالحضور — بديل leaveAttendanceLink
--
--    ★ SECURITY DEFINER لأن الكاتب مُعتمِد الإجازة (مشرف/مدير) وسياسة
--      INSERT على attendance_summary تشترط current_user_is_staff()
--      — والمُثبَت أنها تعني admin·hr·developer·it_admin فقط. المدير
--      الذي يعتمد الإجازة **ليس** staff بهذا التعريف، فالإدراج كان
--      ليُصدّ حتى لو مُرّر tenant_id. الدالة تفحص الصلاحية بنفسها.
--
--    ★★ بلا حذف نهائي: الرفض يُعيد الحالة إلى 'غائب' أو يحذف الصفّ
--      **الذي أنشأته الدالة نفسها وحده** — نميّزه بأنه 'مجاز' وبلا
--      بصمة (check_in IS NULL). صفٌّ فيه بصمة يعني أن الموظف حضر
--      فعلاً ذلك اليوم، فلا نمسّه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.apply_leave_to_attendance(UUID, DATE, DATE);

CREATE FUNCTION public.apply_leave_to_attendance(
  p_employee_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_days   INTEGER := 0;
  d        DATE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا مستأجر في السياق';
  END IF;

  -- ★ الصلاحية صريحة: من يعتمد الإجازة يطبّقها
  IF v_role IS NULL OR v_role NOT IN
     ('admin','hr','developer','it_admin','manager','supervisor','direct_manager') THEN
    RAISE EXCEPTION 'غير مصرَّح بتطبيق الإجازة على الحضور (الدور: %)', COALESCE(v_role,'—');
  END IF;

  -- ★★ الموظف من نفس المستأجر — الدالة DEFINER فلا RLS يحميها
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'الموظف ليس ضمن هذا المستأجر';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'نطاق التاريخ معكوس';
  END IF;

  -- ★ حدّ أعلى: نطاق مفتوح يُنشئ ملايين الصفوف
  IF p_date_to - p_date_from > 400 THEN
    RAISE EXCEPTION 'نطاق الإجازة يتجاوز 400 يوم';
  END IF;

  d := p_date_from;
  WHILE d <= p_date_to LOOP
    -- الجمعة عطلة أسبوعية (EXTRACT(DOW)=5)
    IF EXTRACT(DOW FROM d) <> 5
       AND NOT EXISTS (
         SELECT 1 FROM public.holidays h
          WHERE h.tenant_id = v_tenant AND h.date = d
       )
    THEN
      -- ★★★ القيد الحقيقي ثلاثيّ: (tenant_id, employee_id, shift_date)
      --     الكود القديم أعلن onConflict ثنائياً — مُثبَت أنه يفشل
      INSERT INTO public.attendance_summary
        (tenant_id, employee_id, shift_date, status,
         total_hours, late_minutes, early_leave_minutes, overtime_minutes)
      VALUES (v_tenant, p_employee_id, d, 'مجاز', 0, 0, 0, 0)
      ON CONFLICT (tenant_id, employee_id, shift_date) DO UPDATE
        SET status = 'مجاز', updated_at = NOW()
        -- ★ لا نطمس يوماً حضره الموظف فعلاً بلا داعٍ
        WHERE public.attendance_summary.status <> 'مجاز';
      v_days := v_days + 1;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN v_days;
END $$;

COMMENT ON FUNCTION public.apply_leave_to_attendance(UUID,DATE,DATE) IS
  'تطبيق إجازة معتمَدة على سجلّ الحضور. leaveAttendanceLink.ts:52 كان '
  'يُدرج بلا tenant_id (NOT NULL ⇒ فشل مُثبَت) ويعلن onConflict ثنائياً '
  'بينما القيد ثلاثيّ (ON CONFLICT فشل مُثبَت).';

REVOKE ALL ON FUNCTION public.apply_leave_to_attendance(UUID,DATE,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_leave_to_attendance(UUID,DATE,DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_leave_to_attendance(UUID,DATE,DATE) TO authenticated;

DROP FUNCTION IF EXISTS public.revert_leave_from_attendance(UUID, DATE, DATE);

CREATE FUNCTION public.revert_leave_from_attendance(
  p_employee_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_days   INTEGER := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا مستأجر في السياق';
  END IF;

  IF v_role IS NULL OR v_role NOT IN
     ('admin','hr','developer','it_admin','manager','supervisor','direct_manager') THEN
    RAISE EXCEPTION 'غير مصرَّح بالتراجع (الدور: %)', COALESCE(v_role,'—');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'الموظف ليس ضمن هذا المستأجر';
  END IF;

  -- ★★★ لا DELETE. الكود القديم (leaveAttendanceLink.ts:171) كان يحذف
  --   الصفّ نهائياً ثم يستدعي refresh_attendance_summary لإعادة بنائه
  --   — وهي دالة **غير موجودة** (مُثبَت: 0 في pg_proc) ⇒ فقدان صافٍ.
  --   نُعيد الحالة إلى 'غائب' والبيانات كلّها باقية.
  UPDATE public.attendance_summary a
     SET status = 'غائب', updated_at = NOW()
   WHERE a.tenant_id = v_tenant
     AND a.employee_id = p_employee_id
     AND a.shift_date >= p_date_from
     AND a.shift_date <= p_date_to
     AND a.status = 'مجاز'
     -- ★ يومٌ فيه بصمة يعني حضوراً فعلياً — لا نُعلنه غياباً
     AND a.check_in IS NULL;

  GET DIAGNOSTICS v_days = ROW_COUNT;
  RETURN v_days;
END $$;

COMMENT ON FUNCTION public.revert_leave_from_attendance(UUID,DATE,DATE) IS
  'التراجع عن إجازة مرفوضة/ملغاة. بلا حذف نهائي — الحالة تعود «غائب». '
  'الكود القديم كان يحذف ثم يستدعي refresh_attendance_summary غير '
  'الموجودة (0 في pg_proc) ⇒ فقدان بيانات صافٍ.';

REVOKE ALL ON FUNCTION public.revert_leave_from_attendance(UUID,DATE,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revert_leave_from_attendance(UUID,DATE,DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.revert_leave_from_attendance(UUID,DATE,DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ طلبات تصحيح الحضور — سجلّ الموظف
--
--    MyAttendancePage تُنشئ hr_case بـcase_type='attendance_correction'
--    ثم **لا تعرضه أبداً**. الموظف يضغط «أرسل» ويرى رسالة نجاح ولا يعرف
--    أبداً ما جرى للطلب. الدالة تُعيد له سجلّه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_attendance_corrections(INTEGER);

CREATE FUNCTION public.my_attendance_corrections(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  out_id          UUID,
  out_subject     TEXT,
  out_description TEXT,
  out_status      TEXT,
  out_priority    TEXT,
  out_resolution  TEXT,
  out_created_at  TIMESTAMPTZ,
  out_resolved_at TIMESTAMPTZ
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
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id,
         c.subject::TEXT,
         c.description,
         c.status::TEXT,
         c.priority::TEXT,
         c.resolution_summary,
         c.created_at,
         c.resolved_at
    FROM public.hr_cases c
   WHERE c.tenant_id = v_tenant
     AND c.case_type = 'attendance_correction'
     -- ★ employees.id ≠ profiles.id — وسياسة hr_cases تقبل الاثنين،
     --   فبيانات قديمة قد تحمل أيّاً منهما. نطابق كليهما.
     AND (c.employee_id = v_emp OR c.employee_id = v_uid)
   ORDER BY c.created_at DESC
   LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.my_attendance_corrections(INTEGER) IS
  'سجلّ طلبات تصحيح الحضور. MyAttendancePage تُنشئ hr_case ثم لا تعرضه '
  'أبداً — الموظف يرى «تم الإرسال» ولا يعرف مصير طلبه.';

REVOKE ALL ON FUNCTION public.my_attendance_corrections(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_attendance_corrections(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_attendance_corrections(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ القيد والفهرس
--
--    ★ NOT VALID عمداً: بيانات قائمة قد تحمل حالات قديمة، وقيدٌ يمنع
--      تطبيق المايجريشن أسوأ من قيدٍ يحرس الجديد. الصفوف القديمة تُفحص
--      لاحقاً بـVALIDATE CONSTRAINT بعد تنظيفها.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.attendance_summary'::regclass
       AND conname  = 'attendance_summary_status_vocab'
  ) THEN
    ALTER TABLE public.attendance_summary
      ADD CONSTRAINT attendance_summary_status_vocab
      CHECK (status IN (
        'حضور_بوقت','متأخر','زمنية_معتمدة','زمنية_انتظار',
        'غائب','مجاز','إجازة_انتظار','عطلة'
      )) NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT attendance_summary_status_vocab ON public.attendance_summary IS
  'المفردات الثماني من determineAttendanceStatus. قبل 0344 لم يكن ثمة '
  'قيد إطلاقاً — أُدرجت «قيمة عشوائية لا معنى لها» بلا اعتراض، وهو ما '
  'سمح لمفردات 0337 المختلقة بالمرور صامتة.';

CREATE INDEX IF NOT EXISTS idx_hr_cases_attendance_correction
  ON public.hr_cases (tenant_id, employee_id, created_at DESC)
  WHERE case_type = 'attendance_correction';
