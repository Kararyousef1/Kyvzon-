-- ============================================================================
-- 0327_tech_portal_real_metrics.sql
--
-- بوابة التقنية: قياسات حقيقية بدل المحاكاة · تعطيل الجهاز بدل حذفه.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--
--  ① ★ الرسم الساعي للبصمات **مُختلَق**.
--     `TechDashboard.tsx:250`:
--        const avg = Math.floor(logs2 / 12);
--        for (let i = 0; i < 12; i++)
--          punchBuckets[i] = avg + Math.floor(Math.random() * 3);
--
--     يأخذ الإجمالي الحقيقي، يقسمه على 12، ثم يضيف ضجيجاً عشوائياً.
--     مقيس على Postgres بتوزيع واقعي (ذروة 20 بصمة في ساعة واحدة):
--        الحقيقة : الساعة 10 ⇒ 20 بصمة · بقية الساعات ⇒ 0
--        المعروض : 12 عموداً بقيمة ~1 لكل ساعة
--     ⇒ **الذروة تختفي تماماً**. مسؤول التقنية يرى نشاطاً موزّعاً وهمياً
--       فلا يكتشف ازدحام البوابة ولا يعرف متى يحتاج جهازاً إضافياً.
--
--     رسمٌ مُختلَق أخطر من غيابه: يبدو معلومةً وهو تشويش.
--
--  ② ★ `countPunchesSince` تعدّ بجلب الصفوف كاملةً وسقفها 1000.
--        findWhere([...], { limit: 1000 }).then(rows => rows.length)
--     شركة فيها 1200 بصمة في 12 ساعة ترى «1000» صامتةً — والرقم يُغذّي
--     الرسم أعلاه فيتضاعف الخطأ. وتُنقل آلاف الصفوف لعدّها في المتصفح.
--
--  ③ ★ حذف جهاز البصمة نهائياً يُيتّم سجلّات الحضور.
--     `BiometricDevicesPage.tsx:86` — `confirm()` ثم حذف نهائي.
--     `attendance_logs.device_id` نصّ حرّ بلا مفتاح أجنبي، فالسجلّات
--     تبقى ويضيع مصدرها.
--     مقيس:
--        قبل الحذف : سجلات الحضور المرتبطة = 2
--        بعد الحذف : السجلات = 2 · اسم الجهاز = ✗ ضاع
--        بعد التعطيل: الاسم محفوظ ✔
--     `is_active` موجود على الجدول ولم يُستعمل للتعطيل.
--
-- ══ ملاحظات أعمدة مُحقَّقة (لا تُخمَّن) ════════════════════════════════
--     `attendance_logs.shift_date`  NOT NULL بلا افتراضي
--     `attendance_logs` قيد فريد: (tenant_id, employee_id, punch_time)
--     `biometric_devices` لا FK يشير إليه · `is_active` DEFAULT true
--
-- ══ ما فُحص فوجد سليماً ════════════════════════════════════════════════
--     `SystemHealthPage` نُظّفت في جولة سابقة: `latency`/`uptime` تعودان
--     `null` صراحةً بدل أرقام مُختلَقة. لم أغيّرها.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① التوزيع الساعي الحقيقي للبصمات — عطل ①
--
--    يعيد صفاً لكل ساعة في النافذة المطلوبة، بما فيها الساعات الصفرية
--    (وإلا انزاح الرسم). `generate_series` تضمن اكتمال المحاور.
--
--    STABLE: قراءة فقط. آمن هنا — لا كتابة (درس 0320 معكوس).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.attendance_punches_hourly(INTEGER);

CREATE FUNCTION public.attendance_punches_hourly(p_hours INTEGER DEFAULT 12)
RETURNS TABLE(
  out_bucket    TIMESTAMPTZ,
  out_hour      INTEGER,
  out_punch_in  INTEGER,
  out_punch_out INTEGER,
  out_total     INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_h      INTEGER := GREATEST(1, LEAST(COALESCE(p_hours, 12), 168));  -- أسبوع كحدّ
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
             date_trunc('hour', NOW()) - ((v_h - 1) || ' hours')::INTERVAL,
             date_trunc('hour', NOW()),
             '1 hour'::INTERVAL
           ) AS b
  ),
  punches AS (
    SELECT date_trunc('hour', a.punch_time) AS b,
           count(*) FILTER (WHERE a.punch_type = 'in')::INTEGER  AS n_in,
           count(*) FILTER (WHERE a.punch_type = 'out')::INTEGER AS n_out,
           count(*)::INTEGER AS n_all
      FROM public.attendance_logs a
     WHERE a.tenant_id = v_tenant
       AND a.punch_time >= date_trunc('hour', NOW()) - ((v_h - 1) || ' hours')::INTERVAL
     GROUP BY 1
  )
  SELECT bk.b,
         EXTRACT(HOUR FROM bk.b)::INTEGER,
         COALESCE(p.n_in , 0),
         COALESCE(p.n_out, 0),
         COALESCE(p.n_all, 0)
    FROM buckets bk
    LEFT JOIN punches p ON p.b = bk.b
   ORDER BY bk.b;
END $$;

COMMENT ON FUNCTION public.attendance_punches_hourly(INTEGER) IS
  'التوزيع الساعي الحقيقي للبصمات مع الساعات الصفرية. لوحة التقنية كانت '
  'تقسم الإجمالي على 12 وتضيف Math.random() فتختفي الذروة (عطل 0327/①).';

REVOKE ALL ON FUNCTION public.attendance_punches_hourly(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_punches_hourly(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.attendance_punches_hourly(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② عدّ البصمات في القاعدة — عطل ②
--
--    بديل `findWhere(...).then(rows => rows.length)` الذي يجلب حتى 1000
--    صفّ كامل ليعدّها في المتصفح، فيكذب صامتاً فوق ذلك.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.attendance_punch_count(INTEGER);

CREATE FUNCTION public.attendance_punch_count(p_hours INTEGER DEFAULT 12)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::INTEGER
    FROM public.attendance_logs a
   WHERE a.tenant_id = public.current_user_tenant_id()
     AND a.punch_time >= NOW()
         - (GREATEST(1, LEAST(COALESCE(p_hours, 12), 168)) || ' hours')::INTERVAL;
$$;

COMMENT ON FUNCTION public.attendance_punch_count(INTEGER) IS
  'عدّ البصمات في القاعدة. البديل السابق كان يجلب 1000 صفّ كامل ويعدّها '
  'في المتصفح فيسقف الرقم صامتاً (عطل 0327/②).';

REVOKE ALL ON FUNCTION public.attendance_punch_count(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_punch_count(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.attendance_punch_count(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ تعطيل جهاز البصمة بدل حذفه — عطل ③
--
--    الحذف يترك سجلّات حضور بمعرّف جهاز لا يقابله شيء ⇒ لا يُعرف من أي
--    بوابة جاءت البصمة. `is_active=false` يُخفيه من التشغيل ويحفظ اسمه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.deactivate_biometric_device(UUID, BOOLEAN);

CREATE FUNCTION public.deactivate_biometric_device(
  p_device_id UUID,
  p_active    BOOLEAN DEFAULT FALSE
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_name   TEXT;
  v_cur    BOOLEAN;
  v_logs   INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- بوابة التقنية: المسؤول التقني وأدوار المنصة
  IF v_role NOT IN ('admin','it_admin','developer') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED (role %)', v_role;
  END IF;

  SELECT d.name, d.is_active INTO v_name, v_cur
    FROM public.biometric_devices d
   WHERE d.id = p_device_id AND d.tenant_id = v_tenant;

  IF v_name IS NULL THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND'; END IF;
  IF v_cur IS NOT DISTINCT FROM p_active THEN
    RETURN CASE WHEN p_active THEN 'already_active' ELSE 'already_inactive' END;
  END IF;

  SELECT count(*)::INTEGER INTO v_logs
    FROM public.attendance_logs a
   WHERE a.tenant_id = v_tenant AND a.device_id = p_device_id::TEXT;

  UPDATE public.biometric_devices
     SET is_active = p_active, updated_at = NOW()
   WHERE id = p_device_id AND tenant_id = v_tenant;

  -- ★ السجلّات تبقى منسوبة لجهاز معروف الاسم؛ الحذف كان يُيتّمها.
  RAISE NOTICE 'الجهاز % → is_active=% (% سجلّ حضور محفوظ النسب)',
    v_name, p_active, v_logs;

  RETURN CASE WHEN p_active THEN 'activated' ELSE 'deactivated' END;
END $$;

COMMENT ON FUNCTION public.deactivate_biometric_device(UUID, BOOLEAN) IS
  'تعطيل/تفعيل جهاز بصمة بدل حذفه. الحذف يترك attendance_logs بمعرّف '
  'جهاز لا يقابله شيء فلا يُعرف مصدر البصمة (عطل 0327/③).';

REVOKE ALL ON FUNCTION public.deactivate_biometric_device(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_biometric_device(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.deactivate_biometric_device(UUID, BOOLEAN)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ صحّة أجهزة البصمة — قياس لا تخمين
--
--    تُظهر لكل جهاز: نشط؟ · آخر مزامنة · دقائق التأخّر · بصمات اليوم.
--    التأخّر يُقاس مقابل `sync_interval_minutes` المُعرَّف على الجهاز
--    نفسه لا مقابل رقم ثابت.
-- ─────────────────────────────────────────────────────────────────────────
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
         -- ★ متأخّر = تجاوز ضعف فترته المُعرَّفة، أو لم يزامن قطّ
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
              AND a.punch_time >= date_trunc('day', NOW())
         ), 0)
    FROM public.biometric_devices d
   WHERE d.tenant_id = v_tenant
   ORDER BY COALESCE(d.is_active, FALSE) DESC, d.name;
END $$;

COMMENT ON FUNCTION public.biometric_devices_health() IS
  'صحّة أجهزة البصمة: التأخّر مقيس مقابل sync_interval_minutes لكل جهاز '
  'لا مقابل رقم ثابت. الجهاز المعطَّل لا يُعدّ متأخّراً.';

REVOKE ALL ON FUNCTION public.biometric_devices_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.biometric_devices_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.biometric_devices_health() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0327: بوابة التقنية — قياسات حقيقية بدل المحاكاة';
END $$;
