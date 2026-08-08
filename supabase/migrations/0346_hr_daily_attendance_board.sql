-- ============================================================================
-- 0346_hr_daily_attendance_board.sql
--
-- بوابة الموارد البشرية — المرحلة 4: لوحة الحضور اليومي `hr/AttendancePage`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الصفحة 145 سطراً — وبدت «بسيطة». وهي ليست بسيطة بل **ناقصة**: ثلاثة
-- أعطال مستقلّة، كلٌّ منها وحده كافٍ لجعل الجدول فارغاً أبداً.
--
-- ═══ العطل ① — `check_in` مقابل `check-in` ═════════════════════════════════
--
--   `hr/AttendancePage.tsx:44-45`
--     const checkIn  = empLogs.find(l => l.punch_type === 'check_in')?.punch_time;
--     const checkOut = empLogs.find(l => l.punch_type === 'check_out')?.punch_time;
--
--   والقيد المُحقَّق على العمود:
--     CHECK (punch_type = ANY (ARRAY['in','out','check-in','check-out']))
--
--   القيم بـ**شرطة** والصفحة تبحث بـ**شرطة سفلية**. مُثبَت بالتشغيل:
--     INSERT ... punch_type='check_in'
--       ⇒ new row for relation "attendance_logs" violates check
--         constraint "attendance_logs_punch_type_check"
--
--   ⇒ **لا صفّ في القاعدة يمكن أن يطابق ما تبحث عنه الصفحة إطلاقاً.**
--     `checkIn` و`checkOut` = `undefined` لكل موظف، فالشرطان
--     `if (checkIn && !checkOut)` و`if (checkIn && checkOut)` لا يُنفَّذان
--     أبداً، والحالة تبقى `'غائب'` **للجميع دائماً** — حتى لو بصم الجميع.
--
-- ═══ العطل ② — لا بصمة خروج في النظام كلّه ═════════════════════════════════
--
--   `KioskPage.tsx:233` هو **الكاتب الوحيد** لـattendance_logs من الواجهة:
--
--     await attendanceService.create({
--       employee_id, punch_time, shift_date, source, verification_type,
--     });                            ← **لا punch_type إطلاقاً**
--
--   والعمود `DEFAULT 'check-in'`. مُثبَت: بعد إدراج بصمتين (صباحاً ومساءً)
--     SELECT DISTINCT punch_type ⇒ «check-in»
--     بصمات الخروج في القاعدة    ⇒ **0**
--
--   ⇒ حتى لو صُحِّحت الشرطة في العطل ①، `checkOut` يبقى `undefined` أبداً
--     لأن القاعدة **لا تحوي ولا بصمة خروج واحدة**.
--
--   ★ لهذا لا يكفي إصلاح الواجهة: نحتاج اشتقاق الدخول/الخروج من **ترتيب
--     البصمات الزمني** لا من `punch_type` وحده. أول بصمة = دخول، وآخر
--     بصمة (إن تعدّدت) = خروج — وهو ما يفعله `extractPunchTimes` في
--     `shiftCalculations.ts:301` بالفعل ولم تستعمله هذه الصفحة.
--
-- ═══ العطل ③ — ترشيح بمساواة لحظية ═════════════════════════════════════════
--
--   `hr/AttendancePage.tsx:29`
--     filters: { punch_time: todayStart }
--
--   و`BaseService.findAll` يحوّل كل مُرشِّح إلى `.eq(key, value)`
--   (مُحقَّق: `query = query.eq(key, value)`). أي أن الشرط يصير
--   **مساواة تامّة للحظة 00:00:00.000** لا «منذ بداية اليوم».
--
--   مُثبَت: بصمتان اليوم في القاعدة · الصفوف المطابقة للحظة = **0**.
--
--   ⇒ عطلٌ ثالثٌ مستقلّ يجعل `logs` مصفوفة فارغة دائماً. و`todayEnd`
--     مُحتسب في السطر 23 و**لا يُستعمل قط** — نفس نمط عطل `0337`.
--
-- ═══ العطل ④ — عمودان بلا مصدر ═════════════════════════════════════════════
--
--   `:59-60`  breakDuration: 0 · currentDestination: ''
--   ويُعرضان في الجدول (`:106-107`) كعمودين «مدة الاستراحات» و«موقع
--   الاستراحة الحالي». الأول يعرض `—` ثابتاً والثاني **خلية فارغة**.
--
--   والبيانات موجودة فعلاً: جدول `employee_breaks` (17 عموداً) يملؤه
--   `GatekeeperService` و`SupervisorBreaksPage` بـ`destination` و
--   `duration_minutes` و`out_time`/`return_time` و`status`.
--
-- ═══ العطل ⑥ — «بدون اسم» لكل موظف ═════════════════════════════════════════
--
--   `hr/AttendancePage.tsx:56`
--     full_name: emp.full_name_ar || 'بدون اسم'
--
--   ومحفّز `trg_ensure_employee_row` (0317:420) يُدرج:
--     (tenant_id, user_id, department_id, employee_code,
--      first_name, last_name)
--   — **لا `full_name_ar` إطلاقاً**. مُثبَت بالتشغيل بعد إدراج ملفٍ
--   اسمه «أحمد المداوم»:
--     first_name = «أحمد» · last_name = «المداوم» · full_name_ar = NULL
--     موظفون لهم full_name_ar في القاعدة كلها = **0** من 1
--
--   ⇒ الجدول يعرض «بدون اسم» في كل صفّ.
--
--   ★★ والأثر أوسع من هذه الصفحة: `grep -rln full_name_ar src/pages`
--     يُرجع **ثماني صفحات** على الأقل (BranchesPage · CompliancePage ·
--     MovementControlPage · BonusesPage · DisciplinaryPage ·
--     DocumentsPage · EmployeeContractsPage · هذه).
--
--   ★ الحلّ هنا: نشتقّ الاسم في القاعدة بأولوية
--     `full_name_ar` → `first_name + last_name` → `profiles.full_name`
--     بدل الاعتماد على عمودٍ لا يملؤه أحد. (ملء العمود نفسه لكل
--     الصفحات الثماني عملٌ منفصل خارج نطاق هذه الجولة.)
--
-- ═══ العطل ⑤ — لا ترشيح ولا تاريخ ولا ملخّص ════════════════════════════════
--
--   الصفحة تعرض **اليوم فقط** بلا منتقي تاريخ، بلا بحث بالاسم، بلا
--   ترشيح بالقسم أو الحالة، وبلا أي ملخّص (كم حاضر؟ كم غائب؟ كم متأخر؟).
--   مديرُ موارد بشركة فيها 300 موظف يرى جدولاً من 300 صفّ بلا أداة واحدة.
--
-- ═══ ما يفعله هذا المايجريشن ═══════════════════════════════════════════════
--   ① hr_daily_attendance(p_date, …)  — لوحة اليوم مع الاستراحات
--   ② hr_daily_attendance_summary()   — ملخّص اليوم
--   ③ فهارس
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   attendance_logs: punch_type CHECK ∈ in·out·check-in·check-out
--     DEFAULT 'check-in' · UNIQUE (tenant_id, employee_id, punch_time)
--     shift_date DATE NOT NULL
--   employee_breaks: destination TEXT · duration_minutes INT
--     CHECK (1..720) DEFAULT 15 · status TEXT DEFAULT 'active'
--     out_time · return_time · employee_id → employees
--   employees: is_active BOOLEAN DEFAULT true · **لا status** (درس 0345)
--     full_name_ar TEXT · department_id UUID
--   departments: name_ar (**لا name**)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① لوحة الحضور اليومي
--
--    ★★★ الدخول/الخروج يُشتقّان من **ترتيب البصمات** لا من punch_type:
--      العطل ② أثبت أن القاعدة لا تحوي ولا بصمة خروج واحدة، فالاعتماد
--      على punch_type يعني عموداً فارغاً أبداً. نأخذ:
--        دخول = أول بصمة زمنياً
--        خروج = آخر بصمة **إن تعدّدت** (بصمة واحدة = دخول بلا خروج)
--
--      وحين يكون punch_type صحيحاً فعلاً (أجهزة ADMS تُرسله) نحترمه:
--      آخر بصمة من نوع out/check-out تُقدَّم على الاشتقاق الزمني.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_daily_attendance(DATE, UUID, TEXT, TEXT, INTEGER);

CREATE FUNCTION public.hr_daily_attendance(
  p_date          DATE    DEFAULT NULL,
  p_department_id UUID    DEFAULT NULL,
  p_status        TEXT    DEFAULT NULL,
  p_search        TEXT    DEFAULT NULL,
  p_limit         INTEGER DEFAULT 200
) RETURNS TABLE(
  out_employee_id    UUID,
  out_full_name      TEXT,
  out_employee_code  TEXT,
  out_department_id  UUID,
  out_department     TEXT,
  out_check_in       TIMESTAMPTZ,
  out_check_out      TIMESTAMPTZ,
  out_punch_count    INTEGER,
  out_worked_minutes INTEGER,
  out_break_minutes  INTEGER,
  out_break_count    INTEGER,
  out_on_break       BOOLEAN,
  out_destination    TEXT,
  out_status         TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_day    DATE := COALESCE(p_date, current_date);
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH punches AS (
    SELECT a.employee_id,
           min(a.punch_time) AS first_punch,
           max(a.punch_time) AS last_punch,
           count(*)::INTEGER AS punch_count,
           -- ★ آخر بصمة خروج **صريحة** إن وُجدت. القاعدة لا تحوي أياً
           --   منها اليوم (العطل ②) لكن أجهزة ADMS قد ترسلها لاحقاً،
           --   فنحترمها حين تظهر بدل تجاهلها.
           max(a.punch_time) FILTER (
             WHERE a.punch_type IN ('out', 'check-out')
           ) AS explicit_out
      FROM public.attendance_logs a
     WHERE a.tenant_id = v_tenant
       AND a.shift_date = v_day
     GROUP BY a.employee_id
  ),
  brk AS (
    SELECT b.employee_id,
           -- ★★ المدة الفعلية حين تتوفّر الطوابع، وإلا فالمدة المصرّح بها.
           --   استراحة انتهت فعلاً في 12 دقيقة لا تُحتسب 15 لمجرّد أن
           --   التصريح كان 15.
           COALESCE(sum(
             CASE
               WHEN b.out_time IS NOT NULL AND b.return_time IS NOT NULL
                 THEN GREATEST(
                        round(EXTRACT(EPOCH FROM (b.return_time - b.out_time)) / 60)::INTEGER,
                        0)
               ELSE b.duration_minutes
             END
           ), 0)::INTEGER AS break_minutes,
           count(*)::INTEGER AS break_count,
           -- ★ «خارج الآن»: تصريح نشط لم يُسجَّل له رجوع
           bool_or(b.status = 'active' AND b.return_time IS NULL) AS on_break,
           (array_agg(b.destination ORDER BY b.created_at DESC)
              FILTER (WHERE b.status = 'active' AND b.return_time IS NULL)
           )[1] AS destination
      FROM public.employee_breaks b
     WHERE b.tenant_id = v_tenant
       AND b.created_at >= v_day::TIMESTAMPTZ
       AND b.created_at <  (v_day + 1)::TIMESTAMPTZ
     GROUP BY b.employee_id
  ),
  base AS (
    SELECT e.id,
           -- ★★★ العطل ⑥: full_name_ar فارغ لكل موظف (المحفّز 0317
           --   يملأ first_name/last_name فقط). نشتقّ بأولوية بدل عرض
           --   «بدون اسم» للجميع.
           COALESCE(
             NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.first_name), ''),
                                         NULLIF(btrim(e.last_name), ''))), ''),
             NULLIF(btrim(pr.full_name), ''),
             'بدون اسم'
           )::TEXT AS full_name,
           COALESCE(e.employee_code, '')::TEXT AS employee_code,
           e.department_id,
           COALESCE(d.name_ar, 'بدون قسم')::TEXT AS department,
           p.first_punch,
           -- ★★★ الخروج: الصريح أولاً، وإلا آخر بصمة **إن تعدّدت**.
           --   بصمة واحدة تعني دخولاً بلا خروج — لا نختلق خروجاً يساوي
           --   الدخول فيظهر «عمل صفر دقيقة» بدل «ما زال مداوماً».
           CASE
             WHEN p.explicit_out IS NOT NULL THEN p.explicit_out
             WHEN p.punch_count > 1          THEN p.last_punch
             ELSE NULL
           END AS check_out,
           COALESCE(p.punch_count, 0) AS punch_count,
           COALESCE(b.break_minutes, 0) AS break_minutes,
           COALESCE(b.break_count, 0)   AS break_count,
           COALESCE(b.on_break, FALSE)  AS on_break,
           b.destination
      FROM public.employees e
      LEFT JOIN public.departments d ON d.id = e.department_id
      -- ★ الملف الشخصي مصدر احتياطي ثالث للاسم
      LEFT JOIN public.profiles pr ON pr.id = e.user_id
      LEFT JOIN punches p ON p.employee_id = e.id
      LEFT JOIN brk     b ON b.employee_id = e.id
     WHERE e.tenant_id = v_tenant
       -- ★ is_active لا status — العمود الأخير غير موجود (درس 0345)
       AND e.is_active
       AND (p_department_id IS NULL OR e.department_id = p_department_id)
       -- ★★ البحث يشمل مصادر الاسم الثلاثة: البحث في full_name_ar
       --   وحده لا يجد أحداً (العمود فارغ للجميع).
       AND (v_q IS NULL
            OR e.full_name_ar  ILIKE '%' || v_q || '%'
            OR e.first_name    ILIKE '%' || v_q || '%'
            OR e.last_name     ILIKE '%' || v_q || '%'
            OR pr.full_name    ILIKE '%' || v_q || '%'
            OR e.employee_code ILIKE '%' || v_q || '%')
  ),
  shaped AS (
    SELECT b.*,
           CASE
             WHEN b.first_punch IS NULL     THEN 'غائب'
             WHEN b.on_break                THEN 'في استراحة'
             WHEN b.check_out IS NOT NULL   THEN 'منصرف'
             ELSE 'مداوم'
           END AS status_label,
           -- ★★ دقائق العمل = (الخروج − الدخول) − الاستراحات.
           --   ومن لم ينصرف بعد يُحتسب حتى **الآن** لا حتى منتصف الليل،
           --   ولا يُحتسب إطلاقاً إن كان اليوم ماضياً (لا نخترع ساعات).
           CASE
             WHEN b.first_punch IS NULL THEN 0
             ELSE GREATEST(
               round(EXTRACT(EPOCH FROM (
                 COALESCE(
                   b.check_out,
                   CASE WHEN v_day = current_date THEN now() ELSE b.first_punch END
                 ) - b.first_punch
               )) / 60)::INTEGER - b.break_minutes,
               0)
           END AS worked_minutes
      FROM base b
  )
  SELECT s.id, s.full_name, s.employee_code, s.department_id, s.department,
         s.first_punch, s.check_out, s.punch_count,
         s.worked_minutes, s.break_minutes, s.break_count,
         s.on_break, s.destination, s.status_label
    FROM shaped s
   WHERE p_status IS NULL OR s.status_label = p_status
   -- ★ الغائبون آخراً: من يحتاج تدخّلاً يظهر أولاً
   ORDER BY (s.first_punch IS NULL), s.first_punch, s.full_name
   LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.hr_daily_attendance(DATE,UUID,TEXT,TEXT,INTEGER) IS
  'لوحة الحضور اليومي. الصفحة كانت تبحث عن punch_type=''check_in'' '
  'بشرطة سفلية والقيد يسمح بـ''check-in'' بشرطة ⇒ صفر مطابقة والجميع '
  '«غائب» أبداً. وترشّح punch_time بمساواة لحظية ⇒ لا صفوف أصلاً. '
  'الدخول/الخروج يُشتقّان من ترتيب البصمات لأن القاعدة لا تحوي ولا '
  'بصمة خروج واحدة (KioskPage لا يمرّر punch_type). والاسم يُشتقّ '
  'بأولوية لأن full_name_ar فارغ لكل موظف (محفّز 0317 يملأ '
  'first_name/last_name فقط) ⇒ «بدون اسم» في كل صفّ.';

REVOKE ALL ON FUNCTION public.hr_daily_attendance(DATE,UUID,TEXT,TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_daily_attendance(DATE,UUID,TEXT,TEXT,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_daily_attendance(DATE,UUID,TEXT,TEXT,INTEGER)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② ملخّص اليوم
--
--    ★ الملخّص يُحسب على **كل** الموظفين المطابقين للمُرشِّح لا على
--      الصفحة المعروضة: «حاضر 12 من 200» يجب ألّا تتغيّر بتغيّر الحدّ.
--      لهذا نمرّر limit كبيراً داخلياً بدل الاعتماد على نتيجة الاستدعاء.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_daily_attendance_summary(DATE, UUID);

CREATE FUNCTION public.hr_daily_attendance_summary(
  p_date          DATE DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
) RETURNS TABLE(
  out_total       INTEGER,
  out_present     INTEGER,
  out_on_break    INTEGER,
  out_left        INTEGER,
  out_absent      INTEGER,
  out_avg_minutes INTEGER,
  out_first_in    TIMESTAMPTZ,
  out_last_out    TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  -- صفّ أصفار لا «لا شيء»: الواجهة تعرض البطاقات دائماً (درس 0337)
  IF v_tenant IS NULL THEN
    RETURN QUERY SELECT 0,0,0,0,0,0, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT * FROM public.hr_daily_attendance(
      p_date, p_department_id, NULL, NULL, 1000
    )
  )
  SELECT count(*)::INTEGER,
         -- ★★ «حاضر» يشمل من في استراحة: هو في العمل لا خارجه.
         --   عدّه غائباً يجعل الرقم يقفز ويهبط طوال اليوم بلا معنى.
         count(*) FILTER (WHERE out_status IN ('مداوم','في استراحة','منصرف'))::INTEGER,
         count(*) FILTER (WHERE out_status = 'في استراحة')::INTEGER,
         count(*) FILTER (WHERE out_status = 'منصرف')::INTEGER,
         count(*) FILTER (WHERE out_status = 'غائب')::INTEGER,
         -- ★★ المتوسط على الحاضرين وحدهم: قسمة على عدد يشمل الغائبين
         --   (وأصفارهم) تُظهر متوسطاً أقلّ من الحقيقة (درس 0337).
         COALESCE(
           round(avg(out_worked_minutes) FILTER (WHERE out_status <> 'غائب'))::INTEGER,
           0),
         min(out_check_in),
         max(out_check_out)
    FROM rows;
END $$;

COMMENT ON FUNCTION public.hr_daily_attendance_summary(DATE,UUID) IS
  'ملخّص الحضور اليومي — لم يكن للصفحة ملخّص إطلاقاً. المتوسط على '
  'الحاضرين وحدهم، و«حاضر» يشمل من في استراحة (هو في العمل لا خارجه).';

REVOKE ALL ON FUNCTION public.hr_daily_attendance_summary(DATE,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_daily_attendance_summary(DATE,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_daily_attendance_summary(DATE,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_att_logs_tenant_shift_date
  ON public.attendance_logs (tenant_id, shift_date, employee_id);

CREATE INDEX IF NOT EXISTS idx_emp_breaks_tenant_created
  ON public.employee_breaks (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emp_breaks_employee
  ON public.employee_breaks (employee_id, created_at DESC);
