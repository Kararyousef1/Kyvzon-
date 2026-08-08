-- ============================================================================
-- 0347_kiosk_punch_and_summary.sql
--
-- بوابة الموارد — المرحلة 4: بوابة الحارس `hr/KioskPage`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطل ① — كل بصمة تُسجَّل «دخولاً» ════════════════════════════════════
--
--   `KioskPage.tsx:233` — وهو **الكاتب الوحيد** لـattendance_logs:
--
--     await attendanceService.create({
--       employee_id, punch_time, shift_date, source, verification_type,
--     });          ← لا punch_type ولا shift_type
--
--   والعمود `punch_type TEXT NOT NULL DEFAULT 'check-in'`. مُثبَت بعد
--   إدراج بصمتَي 08:00 و17:00:
--     SELECT DISTINCT punch_type ⇒ «check-in»
--     بصمات الخروج               ⇒ **0**
--     بصمات بلا shift_type        ⇒ **2**
--
--   ⇒ بصمة الانصراف تُسجَّل «دخولاً». والصفحة نفسها تعرض `shift_type`
--     في السطر 584 — وهو NULL دائماً فيظهر «—».
--
--   ★★ وهذا هو العطل ② الذي وثّقه `0346`: لوحة الحضور اليومي اضطرّت
--     لاشتقاق الخروج من **ترتيب** البصمات لأن النوع لا يُكتب أصلاً.
--     هنا نُصلح المصدر.
--
-- ═══ العطل ② — «حاضر: 0» مهما بصم الجميع ═══════════════════════════════════
--
--   `KioskPage.tsx:163` تحسب الإحصائيات من `attendance_summary` وحده:
--
--     const present = summaries.filter(s =>
--       s.status === 'حضور_بوقت' || s.status === 'متأخر' || …).length;
--     absent: empList.length - present - onLeave
--
--   و**لا شيء في المنصّة كلّها يكتب `attendance_summary` من البصمات**.
--   مُثبَت بعد بصمتين حقيقيتين:
--     صفوف attendance_summary            = **0**
--     محفّزات على attendance_logs        = **0**
--     دالة refresh_attendance_summary    = **0**
--
--   (الكاتب الوحيد للجدول هو `leaveAttendanceLink` عند اعتماد إجازة —
--    أي أن الجدول يمتلئ بـ'مجاز' فقط ولا يعرف الحضور الفعليّ إطلاقاً.)
--
--   ⇒ `present = 0` دائماً · `absent = كل الموظفين` · وحالة كل موظف
--     في القائمة فارغة مهما بصم. الحارس يعمل طوال اليوم واللوحة تقول
--     «حاضر: 0 · غائب: 47».
--
-- ═══ العطل ③ — منع التكرار بالتناوب لا بالنوع ══════════════════════════════
--
--   `KioskPage.tsx:198-205` و`:216-228`:
--     return empLogs.length % 2 === 0 ? 'check_in' : 'check_out';
--
--   منطق «تناوب» يستنتج النوع من **عدد** البصمات. ولو ضاعت بصمة واحدة
--   (شبكة · تكرار مُبتلَع في `catch`) انقلب كل ما بعدها: الدخول يصير
--   خروجاً والخروج دخولاً لبقية اليوم.
--
--   ★ والقيد الحقيقي `UNIQUE (tenant_id, employee_id, punch_time)`
--     يمنع التكرار **في نفس اللحظة بالضبط** فقط — بصمتان بفارق ثانية
--     تمرّان كلتاهما.
--
-- ═══ العطل ④ — لامبدا مشوّهة ═══════════════════════════════════════════════
--
--   `:163` و`:166`   .filter((s: any , EmployeeStatus) => …)
--   المعامل الثاني اسمه `EmployeeStatus` — يُظلّل الواجهة المستوردة
--   ويستقبل **فهرس العنصر** لا شيئاً ذا معنى. خطأ نسخٍ صامت.
--
-- ═══ ما يفعله هذا المايجريشن ═══════════════════════════════════════════════
--   ① kiosk_punch(employee, verification, device) — بصمة ذرّية
--   ② tg_refresh_attendance_summary — محفّز يبني الملخّص من البصمات
--   ③ kiosk_board(search, limit)   — لوحة الكشك في استدعاء واحد
--   ④ kiosk_stats()                — الإحصائيات من مصدر الحقيقة
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   attendance_logs: punch_type CHECK ∈ in·out·check-in·check-out
--     DEFAULT 'check-in' · UNIQUE (tenant_id, employee_id, punch_time)
--     shift_type TEXT قابل للفراغ · source DEFAULT 'Python'
--     سياسة INSERT تشترط current_user_is_staff()
--   attendance_summary: UNIQUE (tenant_id, employee_id, shift_date)
--     status CHECK بالمفردات الثماني (0344) · total_hours NUMERIC(5,2)
--   نوافذ الورديات (shiftConfig.ts:19): صباحي 06:00–10:00 ·
--     مسائي 14:00–18:00 · ليلي 22:00–02:00 · السماح 15 دقيقة
--   employees: is_active · **لا status** (درس 0345)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① تحديد الوردية من وقت البصمة
--
--    ★ المصدر: DEFAULT_SHIFT_WINDOWS في src/utils/shiftConfig.ts:19.
--      الوردية الليلية تعبر منتصف الليل (22:00–02:00) فتحتاج معالجة
--      خاصّة — نافذة عادية تفشل لأن 22 > 02.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.shift_for_punch(TIMESTAMPTZ);

CREATE FUNCTION public.shift_for_punch(p_at TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- ★★★ التحويل إلى Asia/Baghdad **صريحاً** لا اعتماداً على منطقة
  --   الجلسة. مُكتشَف بالتشغيل: الخادم على Etc/UTC، فبصمة 07:00+03
  --   تُقرأ 04:00 و`EXTRACT(HOUR)` يُعيد 4 ⇒ موظف الوردية الصباحية
  --   يُصنَّف «ليلي». والفارق يظهر فقط حين تختلف منطقة الخادم عن
  --   منطقة المنشأة — أي في الإنتاج لا في جهاز المطوّر.
  SELECT CASE
    -- ★ الليلي أولاً: نافذته تعبر منتصف الليل فلا يصحّ اختبارها كمدى
    WHEN h >= 22 OR h < 6 THEN 'ليلي'
    WHEN h < 14           THEN 'صباحي'
    ELSE                       'مسائي'
  END
  FROM (SELECT EXTRACT(HOUR FROM (p_at AT TIME ZONE 'Asia/Baghdad'))::INT AS h) q;
$$;

COMMENT ON FUNCTION public.shift_for_punch(TIMESTAMPTZ) IS
  'الوردية من وقت البصمة. المصدر DEFAULT_SHIFT_WINDOWS في '
  'shiftConfig.ts:19. الليلي يُختبَر أولاً لأن نافذته تعبر منتصف الليل. '
  'KioskPage لم تكن تكتب shift_type إطلاقاً فظهر «—» في كل صفّ.';

GRANT EXECUTE ON FUNCTION public.shift_for_punch(TIMESTAMPTZ) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② إعادة بناء ملخّص اليوم من البصمات
--
--    ★★★ هذه هي الدالة المفقودة. `leaveAttendanceLink.ts:189` كان
--      يستدعي `refresh_attendance_summary` منذ البداية — وهي **غير
--      موجودة في القاعدة إطلاقاً** (مُثبَت: 0 في pg_proc · تعريفها
--      الوحيد في database/legacy-DO-NOT-USE/schema.sql:869 ولم يُنقَل).
--      وثّقتُ ذلك في 0344 وأزلتُ الاستدعاء الميّت؛ هنا أبنيها فعلاً.
--
--    ★★ DEFINER لأن سياسة INSERT على attendance_summary تشترط
--      current_user_is_staff() = admin·hr·developer·it_admin. والحارس
--      قد يكون بدور آخر — والمحفّز يعمل بسياق من أدرج البصمة.
--
--    ★ لا تلمس صفّاً حالته 'مجاز' أو 'إجازة_انتظار' أو 'عطلة': الإجازة
--      قرار إداريّ اتّخذه محرّك الاعتماد (0344)، وبصمةٌ عارضة يجب ألّا
--      تمحوه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.refresh_attendance_summary(UUID, DATE);

CREATE FUNCTION public.refresh_attendance_summary(
  p_employee_id UUID,
  p_shift_date  DATE
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID;
  v_first   TIMESTAMPTZ;
  v_last    TIMESTAMPTZ;
  v_count   INTEGER;
  v_out     TIMESTAMPTZ;
  v_shift   TEXT;
  v_hours   NUMERIC(5,2);
  v_late    INTEGER := 0;
  v_status  TEXT;
  v_locked  BOOLEAN;
BEGIN
  SELECT e.tenant_id INTO v_tenant
    FROM public.employees e WHERE e.id = p_employee_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- ★ قرار إداريّ قائم لا تمسّه البصمات
  SELECT (a.status IN ('مجاز','إجازة_انتظار','عطلة')) INTO v_locked
    FROM public.attendance_summary a
   WHERE a.tenant_id = v_tenant
     AND a.employee_id = p_employee_id
     AND a.shift_date = p_shift_date;
  IF COALESCE(v_locked, FALSE) THEN RETURN; END IF;

  SELECT min(l.punch_time), max(l.punch_time), count(*),
         max(l.punch_time) FILTER (WHERE l.punch_type IN ('out','check-out'))
    INTO v_first, v_last, v_count, v_out
    FROM public.attendance_logs l
   WHERE l.tenant_id = v_tenant
     AND l.employee_id = p_employee_id
     AND l.shift_date = p_shift_date;

  IF v_first IS NULL THEN RETURN; END IF;

  -- ★★ الخروج: الصريح أولاً، وإلا آخر بصمة **إن تعدّدت**. بصمة واحدة
  --   تعني دخولاً بلا خروج — لا نختلق خروجاً يساوي الدخول (درس 0346).
  IF v_out IS NULL AND v_count > 1 THEN v_out := v_last; END IF;

  v_shift := public.shift_for_punch(v_first);

  -- ★ دقائق التأخير عن بداية الوردية مع سماح 15 دقيقة
  --   (DEFAULT_POLICY.late.gracePeriodMinutes في shiftConfig.ts:35)
  -- ★★★ بداية الوردية بتوقيت **بغداد** لا بتوقيت الخادم: طرحُ طابع
  --   مبنيّ على منطقة الخادم من طابع حقيقي يُنتج فارق ساعات ثابتاً
  --   (ثلاث ساعات = 180 دقيقة تأخير وهميّ لكل موظف).
  v_late := GREATEST(
    round(EXTRACT(EPOCH FROM (
      v_first - ((p_shift_date + CASE v_shift
                                   WHEN 'صباحي' THEN TIME '06:00'
                                   WHEN 'مسائي' THEN TIME '14:00'
                                   ELSE              TIME '22:00'
                                 END) AT TIME ZONE 'Asia/Baghdad')
    )) / 60)::INTEGER - 15,
    0);

  v_hours := CASE
    WHEN v_out IS NULL THEN 0
    ELSE round(EXTRACT(EPOCH FROM (v_out - v_first)) / 3600.0, 2)
  END;

  -- ★ المفردات الثماني من 0344 — والقيد يرفض غيرها
  v_status := CASE WHEN v_late > 0 THEN 'متأخر' ELSE 'حضور_بوقت' END;

  INSERT INTO public.attendance_summary
    (tenant_id, employee_id, shift_date, shift_type,
     check_in, check_out, total_hours, late_minutes, status, updated_at)
  VALUES
    (v_tenant, p_employee_id, p_shift_date, v_shift,
     v_first, v_out, v_hours, v_late, v_status, NOW())
  ON CONFLICT (tenant_id, employee_id, shift_date) DO UPDATE
    SET shift_type   = EXCLUDED.shift_type,
        check_in     = EXCLUDED.check_in,
        check_out    = EXCLUDED.check_out,
        total_hours  = EXCLUDED.total_hours,
        late_minutes = EXCLUDED.late_minutes,
        status       = EXCLUDED.status,
        updated_at   = NOW();
END $$;

COMMENT ON FUNCTION public.refresh_attendance_summary(UUID,DATE) IS
  'يبني ملخّص اليوم من البصمات. الدالة كانت مُستدعاة منذ البداية في '
  'leaveAttendanceLink.ts:189 و**غير موجودة في القاعدة** (0 في pg_proc). '
  'بلا هذا كان attendance_summary فارغاً من الحضور الفعليّ ⇒ كشك '
  'الحارس يعرض «حاضر: 0» مهما بصم الجميع. لا تمسّ صفّاً بحالة إجازة.';

REVOKE ALL ON FUNCTION public.refresh_attendance_summary(UUID,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_attendance_summary(UUID,DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_attendance_summary(UUID,DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ المحفّز — الملخّص يتبع البصمة تلقائياً
--
--    ★ AFTER INSERT OR DELETE: الحذف نادر (لا يُسمح به للموظف) لكن
--      الموارد قد تصحّح بصمةً خاطئة، والملخّص يجب أن يتبع.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.tg_refresh_attendance_summary() CASCADE;

CREATE FUNCTION public.tg_refresh_attendance_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_attendance_summary(OLD.employee_id, OLD.shift_date);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_attendance_summary(NEW.employee_id, NEW.shift_date);
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_refresh_attendance_summary() IS
  'يُبقي attendance_summary متّسقاً مع attendance_logs. لم يكن ثمة '
  'محفّز واحد على الجدول (مُقاس: 0) فبقي الملخّص فارغاً من الحضور.';

DROP TRIGGER IF EXISTS trg_refresh_attendance_summary ON public.attendance_logs;
CREATE TRIGGER trg_refresh_attendance_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_attendance_summary();

-- ─────────────────────────────────────────────────────────────────────────
-- ④ تسجيل البصمة — ذرّي ويعرف نوعه
--
--    ★★★ يستبدل منطق «التناوب» في الواجهة: النوع يُحدَّد من **آخر
--      بصمة فعلية** في القاعدة لا من عدّ مصفوفة في المتصفح. ولو ضاعت
--      بصمة فلا ينقلب شيء — الحالة تُقرأ من المصدر في كل مرّة.
--
--    ★★ DEFINER لأن سياسة INSERT تشترط current_user_is_staff()،
--      والحارس قد يحمل دوراً آخر. الدالة تفحص الصلاحية بنفسها.
--
--    ★ نافذة الارتداد: بصمتان بفارق أقلّ من 60 ثانية تُعاملان كواحدة.
--      القيد الفريد يمنع التطابق التامّ فقط، وأصابع تلمس القارئ مرّتين
--      تُنتج بصمتين بفارق ثانية — فينقلب التناوب.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.kiosk_punch(UUID, TEXT, TEXT);

CREATE FUNCTION public.kiosk_punch(
  p_employee_id UUID,
  p_verification TEXT DEFAULT 'finger',
  p_device_id    TEXT DEFAULT NULL
) RETURNS TABLE(
  out_punch_type   TEXT,
  out_punch_time   TIMESTAMPTZ,
  out_shift_type   TEXT,
  out_shift_date   DATE,
  out_punch_count  INTEGER,
  out_debounced    BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_now    TIMESTAMPTZ := NOW();
  v_day    DATE := (v_now AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_last   TIMESTAMPTZ;
  v_lastty TEXT;
  v_type   TEXT;
  v_shift  TEXT;
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا مستأجر في السياق';
  END IF;

  IF v_role IS NULL OR v_role NOT IN
     ('admin','hr','developer','it_admin','manager','supervisor',
      'direct_manager','gatekeeper','security') THEN
    RAISE EXCEPTION 'غير مصرَّح بتسجيل البصمات (الدور: %)', COALESCE(v_role,'—');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant AND e.is_active
  ) THEN
    RAISE EXCEPTION 'الموظف غير موجود أو غير نشط في هذا المستأجر';
  END IF;

  -- ★ آخر بصمة اليوم — مصدر الحقيقة للنوع التالي
  SELECT l.punch_time, l.punch_type INTO v_last, v_lastty
    FROM public.attendance_logs l
   WHERE l.tenant_id = v_tenant
     AND l.employee_id = p_employee_id
     AND l.shift_date = v_day
   ORDER BY l.punch_time DESC
   LIMIT 1;

  -- ★★ الارتداد: لمسة مكرّرة خلال دقيقة ليست بصمةً جديدة
  IF v_last IS NOT NULL AND (v_now - v_last) < INTERVAL '60 seconds' THEN
    SELECT count(*)::INTEGER INTO v_n FROM public.attendance_logs l
     WHERE l.tenant_id = v_tenant AND l.employee_id = p_employee_id
       AND l.shift_date = v_day;
    RETURN QUERY SELECT v_lastty, v_last,
                        public.shift_for_punch(v_last), v_day, v_n, TRUE;
    RETURN;
  END IF;

  -- ★★★ النوع من آخر بصمة فعلية لا من عدّ المصفوفة
  v_type := CASE
    WHEN v_lastty IS NULL                        THEN 'check-in'
    WHEN v_lastty IN ('in','check-in')           THEN 'check-out'
    ELSE                                              'check-in'
  END;

  v_shift := public.shift_for_punch(v_now);

  INSERT INTO public.attendance_logs
    (tenant_id, employee_id, punch_time, punch_type, shift_type,
     shift_date, device_id, verification_type, source)
  VALUES
    (v_tenant, p_employee_id, v_now, v_type, v_shift,
     v_day, p_device_id, COALESCE(p_verification,'finger'), 'ADMS');

  SELECT count(*)::INTEGER INTO v_n FROM public.attendance_logs l
   WHERE l.tenant_id = v_tenant AND l.employee_id = p_employee_id
     AND l.shift_date = v_day;

  RETURN QUERY SELECT v_type, v_now, v_shift, v_day, v_n, FALSE;
END $$;

COMMENT ON FUNCTION public.kiosk_punch(UUID,TEXT,TEXT) IS
  'تسجيل بصمة الكشك. KioskPage كانت لا تمرّر punch_type إطلاقاً '
  '(DEFAULT check-in) فسُجّلت بصمات الخروج «دخولاً» — وبصمات الخروج في '
  'القاعدة = 0. وكانت تستنتج النوع من عدّ المصفوفة (length %% 2) فلو '
  'ضاعت بصمة انقلب كل ما بعدها. النوع الآن من آخر بصمة فعلية، ومع '
  'نافذة ارتداد 60 ثانية للمسة المكرّرة.';

REVOKE ALL ON FUNCTION public.kiosk_punch(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kiosk_punch(UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.kiosk_punch(UUID,TEXT,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ لوحة الكشك — استدعاء واحد
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.kiosk_board(TEXT, INTEGER);

CREATE FUNCTION public.kiosk_board(
  p_search TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 300
) RETURNS TABLE(
  out_employee_id   UUID,
  out_full_name     TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_user_id       UUID,
  out_check_in      TIMESTAMPTZ,
  out_check_out     TIMESTAMPTZ,
  out_shift_type    TEXT,
  out_punch_count   INTEGER,
  out_next_action   TEXT,
  out_status        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_day    DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH p AS (
    SELECT l.employee_id,
           min(l.punch_time) AS first_punch,
           max(l.punch_time) AS last_punch,
           count(*)::INTEGER AS n,
           max(l.punch_time) FILTER (
             WHERE l.punch_type IN ('out','check-out')) AS out_at,
           (array_agg(l.punch_type ORDER BY l.punch_time DESC))[1] AS last_type,
           (array_agg(l.shift_type ORDER BY l.punch_time ASC))[1]  AS shift
      FROM public.attendance_logs l
     WHERE l.tenant_id = v_tenant AND l.shift_date = v_day
     GROUP BY l.employee_id
  )
  SELECT e.id,
         -- ★ الاسم بأولوية: full_name_ar فارغ لكل موظف (درس 0346)
         COALESCE(
           NULLIF(btrim(e.full_name_ar), ''),
           NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.first_name), ''),
                                       NULLIF(btrim(e.last_name), ''))), ''),
           NULLIF(btrim(pr.full_name), ''),
           'بدون اسم')::TEXT,
         COALESCE(e.employee_code, '')::TEXT,
         COALESCE(d.name_ar, 'بدون قسم')::TEXT,
         e.user_id,
         p.first_punch,
         CASE WHEN p.out_at IS NOT NULL THEN p.out_at
              WHEN p.n > 1              THEN p.last_punch
              ELSE NULL END,
         COALESCE(p.shift, '')::TEXT,
         COALESCE(p.n, 0),
         -- ★★★ الإجراء التالي من **نوع** آخر بصمة لا من عدّها
         CASE
           WHEN p.last_type IS NULL              THEN 'check-in'
           WHEN p.last_type IN ('in','check-in') THEN 'check-out'
           ELSE                                       'check-in'
         END::TEXT,
         -- ★★★ الحالة تتبع **آخر** بصمة لا وجودَ بصمة خروج.
         --   مُكتشَف بالتشغيل: من بصم دخولاً ثم خروجاً ثم عاد ودخل
         --   (3 بصمات) كان يظهر «منصرف» لأن out_at موجودة — بينما هو
         --   داخل المنشأة الآن. الخروج للعرض شيء والحالة شيء آخر.
         CASE
           WHEN p.first_punch IS NULL                 THEN 'غائب'
           WHEN p.last_type IN ('out','check-out')    THEN 'منصرف'
           WHEN p.last_type IN ('in','check-in')      THEN 'مداوم'
           -- بصمتان بلا نوع صريح ⇒ التناوب الزوجيّ: زوجيّ = خرج
           WHEN p.n % 2 = 0                           THEN 'منصرف'
           ELSE 'مداوم'
         END::TEXT
    FROM public.employees e
    LEFT JOIN public.departments d ON d.id = e.department_id
    LEFT JOIN public.profiles pr   ON pr.id = e.user_id
    LEFT JOIN p ON p.employee_id = e.id
   WHERE e.tenant_id = v_tenant
     AND e.is_active
     AND (v_q IS NULL
          OR e.full_name_ar  ILIKE '%' || v_q || '%'
          OR e.first_name    ILIKE '%' || v_q || '%'
          OR e.last_name     ILIKE '%' || v_q || '%'
          OR pr.full_name    ILIKE '%' || v_q || '%'
          OR e.employee_code ILIKE '%' || v_q || '%')
   ORDER BY (p.first_punch IS NULL), p.last_punch DESC NULLS LAST
   LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.kiosk_board(TEXT,INTEGER) IS
  'لوحة الكشك. «الإجراء التالي» يُحدَّد من نوع آخر بصمة لا من عدّ '
  'المصفوفة في المتصفح (length %% 2) — منطقٌ ينقلب كلّه لو ضاعت بصمة.';

REVOKE ALL ON FUNCTION public.kiosk_board(TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kiosk_board(TEXT,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.kiosk_board(TEXT,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ إحصائيات الكشك — من البصمات لا من ملخّص فارغ
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.kiosk_stats();

CREATE FUNCTION public.kiosk_stats()
RETURNS TABLE(
  out_total   INTEGER,
  out_present INTEGER,
  out_left    INTEGER,
  out_on_leave INTEGER,
  out_absent  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_day    DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  -- صفّ أصفار لا «لا شيء» (درس 0337)
  IF v_tenant IS NULL THEN
    RETURN QUERY SELECT 0,0,0,0,0;
    RETURN;
  END IF;

  RETURN QUERY
  WITH b AS (SELECT * FROM public.kiosk_board(NULL, 1000)),
  lv AS (
    -- ★ الإجازة قرار إداريّ من attendance_summary — وهو المكان الوحيد
    --   الذي يعرفها (يكتبه محرّك اعتماد الإجازات في 0344).
    SELECT a.employee_id
      FROM public.attendance_summary a
     WHERE a.tenant_id = v_tenant AND a.shift_date = v_day
       AND a.status IN ('مجاز','إجازة_انتظار','عطلة')
  )
  SELECT count(*)::INTEGER,
         count(*) FILTER (WHERE out_status = 'مداوم')::INTEGER,
         count(*) FILTER (WHERE out_status = 'منصرف')::INTEGER,
         count(*) FILTER (WHERE out_employee_id IN (SELECT employee_id FROM lv))::INTEGER,
         -- ★★ الغائب = بلا بصمة **وبلا** إجازة. طرحُ المُجاز من الغياب
         --   لازم وإلا ظهر من في إجازة معتمَدة «غائباً».
         count(*) FILTER (
           WHERE out_status = 'غائب'
             AND out_employee_id NOT IN (SELECT employee_id FROM lv)
         )::INTEGER
    FROM b;
END $$;

COMMENT ON FUNCTION public.kiosk_stats() IS
  'إحصائيات الكشك من البصمات. الصفحة كانت تحسبها من attendance_summary '
  'وحده — ولا شيء كان يكتبه من البصمات (0 محفّزات · 0 دوال) ⇒ '
  '«حاضر: 0» و«غائب: الجميع» مهما بصم الحارس طوال اليوم.';

REVOKE ALL ON FUNCTION public.kiosk_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kiosk_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.kiosk_stats() TO authenticated;
