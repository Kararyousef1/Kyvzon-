-- ============================================================================
-- FILE: 0297_movement_driver_self_compliance.sql
-- PURPOSE: تمكين السائق من تسجيل ساعاته وفحص مركبته بنفسه.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الفجوة العملية التي يسدّها (اكتُشفت بمراجعة 0296):
--
--   بنيتُ في 0296 تتبّع HOS و DVIR كاملاً، لكن **كل الدوال تتطلب**
--     PERFORM public.movement_require_role('logistics');
--
--   النتيجة المنطقية المستحيلة:
--     • السائق هو من يقود ⇒ لكنه لا يستطيع تسجيل بدء قيادته
--     • السائق هو من يفحص المركبة قبل الانطلاق ⇒ لكنه لا يستطيع
--       تسجيل الفحص
--     • البديل الوحيد: موظف مكتبي يسجّل نيابةً عنه — وهو ما يجعل
--       السجل تخميناً لا توثيقاً، ويُبطل قيمته القانونية أصلاً
--
--   HOS و DVIR **معناهما** أن من يؤدي العمل هو من يوثّقه لحظياً.
--   سجلٌّ يملؤه غير السائق بعد ساعات ليس سجل امتثال بل ورقة شكلية.
--
-- المبدأ المتبَع (نفس 0291):
--   دوال self-service بلاحقة _my_ تتحقق أن المستدعي **هو السائق
--   المعني** عبر movement_require_driver() — بلا منح دور logistics.
--
-- ما لا يستطيعه السائق عمداً:
--   ❌ رفع إيقاف DVIR عن مركبته (تضارب مصالح صريح: من يُبلّغ عن عيب
--      لا يعتمد إصلاحه) — تبقى clear_vehicle_defects بدور logistics
--   ❌ تعديل أو حذف سجل ساعات سابق
--   ❌ رؤية ساعات زملائه
--   ❌ الفحص على مركبة ليست في رحلته
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) مساعد: هل هذه المركبة في رحلة نشطة لهذا السائق؟
--
--    السائق لا يفحص أي مركبة في الأسطول — فقط ما أُسند إليه. بدون هذا
--    القيد يستطيع أي سائق إيقاف أي مركبة بادعاء عيب حرج.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_owns_vehicle(
  p_driver_id  UUID,
  p_vehicle_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.logistics_dispatches d
     WHERE d.tenant_id  = public.current_user_tenant_id()
       AND d.driver_id  = p_driver_id
       AND d.vehicle_id = p_vehicle_id
       AND d.status NOT IN ('completed','failed')
  );
$$;

COMMENT ON FUNCTION public.driver_owns_vehicle(UUID,UUID) IS
  'هل المركبة في رحلة نشطة لهذا السائق؟ يمنع فحص مركبات الزملاء.';

-- ---------------------------------------------------------------------------
-- 2) HOS الذاتي — ملخّص ساعاتي
--
--    نفس حساب 0296 لكن مقصوراً على السائق نفسه. لا نُعيد المنطق:
--    نستدعي get_driver_hos_summary بعد التحقق من الهوية.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_hos_summary()
RETURNS TABLE (
  driving_minutes_today   INTEGER,
  on_duty_minutes_today   INTEGER,
  driving_minutes_8days   INTEGER,
  last_rest_minutes       INTEGER,
  open_period_status      TEXT,
  open_period_minutes     INTEGER,
  driving_limit_exceeded  BOOLEAN,
  duty_limit_exceeded     BOOLEAN,
  cycle_limit_exceeded    BOOLEAN,
  rest_insufficient       BOOLEAN,
  driving_minutes_left    INTEGER,
  duty_minutes_left       INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
BEGIN
  RETURN QUERY
  SELECT s.driving_minutes_today,
         s.on_duty_minutes_today,
         s.driving_minutes_8days,
         s.last_rest_minutes,
         s.open_period_status,
         s.open_period_minutes,
         s.driving_limit_exceeded,
         s.duty_limit_exceeded,
         s.cycle_limit_exceeded,
         s.rest_insufficient,
         -- المتبقّي: ما يهمّ السائق فعلاً، لا الإجمالي وحده
         GREATEST(660 - s.driving_minutes_today, 0)::INT,
         GREATEST(840 - s.on_duty_minutes_today, 0)::INT
    FROM public.get_driver_hos_summary(v_driver, CURRENT_DATE) s;
END $$;

COMMENT ON FUNCTION public.get_my_hos_summary() IS
  'ساعات السائق الحالي + المتبقّي قبل بلوغ الحدود. لا يرى ساعات غيره.';

-- ---------------------------------------------------------------------------
-- 3) بدء/إنهاء فترة خدمة من تطبيق السائق
--
--    ⚠️ قرار مهم: السائق **يُمنع** من بدء فترة قيادة بعد تجاوز الحد،
--    خلافاً لنسخة المُرسِل التي تُحذّر فقط.
--
--    السبب: المُرسِل قد يحتاج تصحيح سجل بأثر رجعي لسائق تجاوز حدّه
--    (تسجيل ما حدث فعلاً). أما السائق فيسجّل **الآن** — والسماح له
--    ببدء قيادة تجاوز حدّها يعني أن النظام يوثّق مخالفة بدل منعها.
--
--    الراحة وخروج الخدمة مسموحان دائماً: منعهما يترك السائق عالقاً
--    في حالة قيادة مفتوحة تتضخّم بلا نهاية.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_my_duty_period(
  p_duty_status TEXT,
  p_dispatch_id UUID DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
)
RETURNS TABLE (log_id UUID, hos_warning TEXT, minutes_left INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
  v_sum    RECORD;
  v_id     UUID;
  v_warn   TEXT := NULL;
BEGIN
  IF p_duty_status NOT IN ('off_duty','sleeper','driving','on_duty') THEN
    RAISE EXCEPTION 'INVALID_DUTY_STATUS (%)', p_duty_status;
  END IF;

  IF p_dispatch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.logistics_dispatches
     WHERE id = p_dispatch_id AND tenant_id = v_tenant AND driver_id = v_driver
  ) THEN
    RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU';
  END IF;

  SELECT * INTO v_sum FROM public.get_driver_hos_summary(v_driver, CURRENT_DATE);

  -- المنع يخصّ القيادة وحدها
  IF p_duty_status = 'driving' THEN
    IF v_sum.driving_limit_exceeded THEN
      RAISE EXCEPTION 'HOS_DRIVING_LIMIT_REACHED (% دقيقة من 660) — سجّل راحة',
        v_sum.driving_minutes_today;
    END IF;
    IF v_sum.duty_limit_exceeded THEN
      RAISE EXCEPTION 'HOS_DUTY_LIMIT_REACHED (% دقيقة من 840) — سجّل راحة',
        v_sum.on_duty_minutes_today;
    END IF;
    IF v_sum.cycle_limit_exceeded THEN
      RAISE EXCEPTION 'HOS_CYCLE_LIMIT_REACHED (% دقيقة في 8 أيام من 4200)',
        v_sum.driving_minutes_8days;
    END IF;
    IF v_sum.driving_minutes_today >= 600 THEN
      v_warn := 'HOS_APPROACHING_LIMIT';
    END IF;
  END IF;

  UPDATE public.fleet_driver_hos_logs
     SET ended_at = now(),
         duration_mins = GREATEST(
           FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::INT, 0)
   WHERE tenant_id = v_tenant AND driver_id = v_driver
     AND ended_at IS NULL AND started_at IS NOT NULL;

  INSERT INTO public.fleet_driver_hos_logs(
    tenant_id, driver_id, duty_status, duration_mins,
    logged_date, started_at, dispatch_id, notes)
  VALUES (v_tenant, v_driver, p_duty_status, 0,
          CURRENT_DATE, now(), p_dispatch_id,
          CASE WHEN p_notes IS NULL THEN '[من تطبيق السائق]'
               ELSE p_notes || ' [من تطبيق السائق]' END)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_warn,
    GREATEST(660 - v_sum.driving_minutes_today, 0)::INT;
END $$;

COMMENT ON FUNCTION public.start_my_duty_period(TEXT,UUID,TEXT) IS
  'بدء فترة خدمة من تطبيق السائق. القيادة تُمنع عند تجاوز الحد — الراحة مسموحة دائماً.';

CREATE OR REPLACE FUNCTION public.end_my_duty_period(
  p_notes TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
  v_mins   INTEGER;
BEGIN
  UPDATE public.fleet_driver_hos_logs
     SET ended_at = now(),
         duration_mins = GREATEST(
           FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::INT, 0),
         notes = COALESCE(notes || ' | ', '') || COALESCE(p_notes, '')
   WHERE tenant_id = v_tenant AND driver_id = v_driver
     AND ended_at IS NULL AND started_at IS NOT NULL
  RETURNING duration_mins INTO v_mins;

  IF v_mins IS NULL THEN RAISE EXCEPTION 'NO_OPEN_DUTY_PERIOD'; END IF;
  RETURN v_mins;
END $$;

COMMENT ON FUNCTION public.end_my_duty_period(TEXT) IS
  'إنهاء فترة الخدمة المفتوحة للسائق الحالي.';

-- ---------------------------------------------------------------------------
-- 4) DVIR الذاتي — فحص مركبتي
--
--    السائق يفحص **مركبة رحلته النشطة فقط**. العيب الحرج يوقفها
--    بنفس منطق 0296 — لا استثناء للسائق.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_my_vehicle_inspection(
  p_dispatch_id     UUID,
  p_inspection_type TEXT,
  p_defects         JSONB DEFAULT '[]'::jsonb,
  p_odometer_km     NUMERIC DEFAULT NULL,
  p_signature_name  TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS TABLE (inspection_id UUID, has_critical BOOLEAN, vehicle_grounded BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver  UUID := public.movement_require_driver();
  v_tenant  UUID := public.current_user_tenant_id();
  v_vehicle UUID;
  v_status  TEXT;
  v_cur_km  NUMERIC;
  v_crit    BOOLEAN := FALSE;
  v_ground  BOOLEAN := FALSE;
  v_id      UUID;
  v_bad     INT;
BEGIN
  IF p_inspection_type NOT IN ('pre_trip','post_trip','periodic') THEN
    RAISE EXCEPTION 'INVALID_INSPECTION_TYPE (%)', p_inspection_type;
  END IF;
  IF p_defects IS NULL OR jsonb_typeof(p_defects) <> 'array' THEN
    RAISE EXCEPTION 'DEFECTS_MUST_BE_ARRAY';
  END IF;

  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements(p_defects) AS d
   WHERE d->>'code' IS NULL
      OR COALESCE(d->>'severity','') NOT IN ('minor','major','critical');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVALID_DEFECT_ENTRY (% entries)', v_bad;
  END IF;

  SELECT d.vehicle_id, d.status INTO v_vehicle, v_status
    FROM public.logistics_dispatches d
   WHERE d.id = p_dispatch_id AND d.tenant_id = v_tenant AND d.driver_id = v_driver;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;
  IF v_vehicle IS NULL THEN RAISE EXCEPTION 'DISPATCH_HAS_NO_VEHICLE'; END IF;

  SELECT current_mileage_km INTO v_cur_km FROM public.logistics_vehicles
   WHERE id = v_vehicle AND tenant_id = v_tenant FOR UPDATE;

  IF p_odometer_km IS NOT NULL THEN
    IF p_odometer_km < 0 THEN RAISE EXCEPTION 'INVALID_ODOMETER'; END IF;
    IF p_odometer_km < v_cur_km THEN
      RAISE EXCEPTION 'ODOMETER_CANNOT_DECREASE (current=%, given=%)',
        v_cur_km, p_odometer_km;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_defects) AS d
     WHERE d->>'severity' = 'critical') INTO v_crit;

  INSERT INTO public.fleet_vehicle_inspections(
    tenant_id, vehicle_id, driver_id, dispatch_id, inspection_type,
    odometer_km, defects, has_critical, is_safe_to_operate,
    signature_name, notes)
  VALUES (v_tenant, v_vehicle, v_driver, p_dispatch_id, p_inspection_type,
          p_odometer_km, p_defects, v_crit, NOT v_crit,
          p_signature_name,
          CASE WHEN p_notes IS NULL THEN '[من تطبيق السائق]'
               ELSE p_notes || ' [من تطبيق السائق]' END)
  RETURNING id INTO v_id;

  IF p_odometer_km IS NOT NULL AND p_odometer_km > v_cur_km THEN
    UPDATE public.logistics_vehicles
       SET current_mileage_km = p_odometer_km, updated_at = NOW()
     WHERE id = v_vehicle AND tenant_id = v_tenant;
  END IF;

  /*
    الإيقاف: نفس قاعدة 0296 — المركبة في رحلة لا تُوقَف فوراً، لكن
    العيب مسجَّل وحارس الإسناد يمنع أي رحلة جديدة.
    السائق يُبلّغ، والمُرسِل يقرّر متى تتوقف الحمولة.
  */
  IF v_crit THEN
    UPDATE public.logistics_vehicles
       SET status = 'out_of_service', updated_at = NOW()
     WHERE id = v_vehicle AND tenant_id = v_tenant AND status = 'available';
    GET DIAGNOSTICS v_bad = ROW_COUNT;
    v_ground := (v_bad > 0);
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'vehicle_inspection_recorded',
          'logistics_vehicle', v_vehicle,
          jsonb_build_object('inspection_id', v_id,
                             'type', p_inspection_type,
                             'defect_count', jsonb_array_length(p_defects),
                             'has_critical', v_crit,
                             'grounded', v_ground,
                             'source', 'driver_app',
                             'driver_id', v_driver));

  RETURN QUERY SELECT v_id, v_crit, v_ground;
END $$;

COMMENT ON FUNCTION public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT) IS
  'DVIR من تطبيق السائق. مركبة رحلته فقط. لا يستطيع رفع الإيقاف — تضارب مصالح.';

-- ---------------------------------------------------------------------------
-- 5) فحوصات مركبتي — للاطلاع لا للتعديل
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_vehicle_inspections(
  p_dispatch_id UUID
)
RETURNS TABLE (
  inspection_id   UUID,
  inspection_type TEXT,
  defect_count    INTEGER,
  has_critical    BOOLEAN,
  odometer_km     NUMERIC,
  inspected_at    TIMESTAMPTZ,
  notes           TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver  UUID := public.movement_require_driver();
  v_tenant  UUID := public.current_user_tenant_id();
  v_vehicle UUID;
BEGIN
  SELECT d.vehicle_id INTO v_vehicle
    FROM public.logistics_dispatches d
   WHERE d.id = p_dispatch_id AND d.tenant_id = v_tenant AND d.driver_id = v_driver;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;

  RETURN QUERY
  SELECT i.id, i.inspection_type,
         jsonb_array_length(i.defects)::INT,
         i.has_critical, i.odometer_km, i.inspected_at, i.notes
    FROM public.fleet_vehicle_inspections i
   WHERE i.tenant_id = v_tenant
     AND i.vehicle_id = v_vehicle
     AND i.dispatch_id = p_dispatch_id
   ORDER BY i.inspected_at DESC;
END $$;

COMMENT ON FUNCTION public.get_my_vehicle_inspections(UUID) IS
  'فحوصات رحلة السائق الحالي — قراءة فقط.';

-- ---------------------------------------------------------------------------
-- 6) 🔴 ربط HOS ببدء الرحلة
--
--    المشكلة: السائق يبدأ رحلة عبر update_my_trip_status('en_route')
--    دون أن يُسجَّل شيء في HOS. النتيجة: ساعات القيادة تبقى صفراً
--    مهما قاد — والنظام كله بلا معنى.
--
--    الحل: بدء الرحلة يفتح فترة 'driving' تلقائياً، وإنهاؤها يُغلقها.
--    التلقائية ضرورية: سائق مشغول لن يتذكّر ضغط زرَّين.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_trip_status(
  p_dispatch_id UUID,
  p_status      TEXT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
  v_rec    RECORD;
  v_ok     BOOLEAN;
  v_hos    RECORD;
BEGIN
  IF p_status NOT IN ('en_route','arrived','completed') THEN
    RAISE EXCEPTION 'DRIVER_CANNOT_SET_STATUS (%) — الفشل يُعلنه المُرسِل', p_status;
  END IF;

  SELECT * INTO v_rec FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant AND driver_id = v_driver
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;

  IF v_rec.status IN ('completed','failed') THEN
    RAISE EXCEPTION 'DISPATCH_ALREADY_CLOSED (status=%)', v_rec.status;
  END IF;

  v_ok := (v_rec.status = 'dispatched' AND p_status = 'en_route')
       OR (v_rec.status = 'en_route'   AND p_status = 'arrived')
       OR (v_rec.status = 'arrived'    AND p_status = 'completed');
  IF NOT v_ok THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION (% → %)', v_rec.status, p_status;
  END IF;

  -- ★ الانطلاق يتطلب رصيد ساعات
  IF p_status = 'en_route' THEN
    SELECT * INTO v_hos FROM public.get_driver_hos_summary(v_driver, CURRENT_DATE);
    IF v_hos.driving_limit_exceeded THEN
      RAISE EXCEPTION 'HOS_DRIVING_LIMIT_REACHED (% دقيقة من 660) — لا يمكن بدء الرحلة',
        v_hos.driving_minutes_today;
    END IF;
    IF v_hos.duty_limit_exceeded THEN
      RAISE EXCEPTION 'HOS_DUTY_LIMIT_REACHED (% دقيقة من 840) — لا يمكن بدء الرحلة',
        v_hos.on_duty_minutes_today;
    END IF;
  END IF;

  IF p_status = 'completed' AND NOT EXISTS (
    SELECT 1 FROM public.logistics_epod e WHERE e.dispatch_id = p_dispatch_id
  ) THEN
    RAISE EXCEPTION 'EPOD_REQUIRED_BEFORE_COMPLETION';
  END IF;

  UPDATE public.logistics_dispatches
     SET status = p_status,
         actual_arrival = CASE WHEN p_status = 'arrived' THEN NOW() ELSE actual_arrival END,
         updated_at = NOW()
   WHERE id = p_dispatch_id AND tenant_id = v_tenant;

  -- ★ فتح فترة القيادة تلقائياً
  IF p_status = 'en_route' THEN
    UPDATE public.fleet_driver_hos_logs
       SET ended_at = now(),
           duration_mins = GREATEST(
             FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::INT, 0)
     WHERE tenant_id = v_tenant AND driver_id = v_driver
       AND ended_at IS NULL AND started_at IS NOT NULL;

    INSERT INTO public.fleet_driver_hos_logs(
      tenant_id, driver_id, duty_status, duration_mins,
      logged_date, started_at, dispatch_id, notes)
    VALUES (v_tenant, v_driver, 'driving', 0, CURRENT_DATE, now(),
            p_dispatch_id, '[تلقائي: انطلاق الرحلة]');

    UPDATE public.logistics_shipment_orders
       SET status = 'in_transit', updated_at = NOW()
     WHERE id = v_rec.order_id AND tenant_id = v_tenant;

  ELSIF p_status = 'arrived' THEN
    -- ★ الوصول يُغلق القيادة ويفتح "على رأس العمل" (تفريغ/أوراق)
    UPDATE public.fleet_driver_hos_logs
       SET ended_at = now(),
           duration_mins = GREATEST(
             FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::INT, 0)
     WHERE tenant_id = v_tenant AND driver_id = v_driver
       AND ended_at IS NULL AND started_at IS NOT NULL
       AND duty_status = 'driving';

    INSERT INTO public.fleet_driver_hos_logs(
      tenant_id, driver_id, duty_status, duration_mins,
      logged_date, started_at, dispatch_id, notes)
    VALUES (v_tenant, v_driver, 'on_duty', 0, CURRENT_DATE, now(),
            p_dispatch_id, '[تلقائي: الوصول للوجهة]');

  ELSIF p_status = 'completed' THEN
    -- ★ الإكمال يُغلق أي فترة مفتوحة — لا تُترك تتضخّم
    UPDATE public.fleet_driver_hos_logs
       SET ended_at = now(),
           duration_mins = GREATEST(
             FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::INT, 0)
     WHERE tenant_id = v_tenant AND driver_id = v_driver
       AND ended_at IS NULL AND started_at IS NOT NULL;

    UPDATE public.logistics_vehicles
       SET status = 'available', updated_at = NOW()
     WHERE id = v_rec.vehicle_id AND tenant_id = v_tenant AND status = 'on_trip';

    UPDATE public.logistics_shipment_orders
       SET status = 'delivered', updated_at = NOW()
     WHERE id = v_rec.order_id AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'dispatch_status_changed', 'logistics_dispatch',
          p_dispatch_id, jsonb_build_object('old_status', v_rec.status,
                                            'new_status', p_status,
                                            'source', 'driver_app',
                                            'driver_id', v_driver,
                                            'hos_auto_logged', true));
END $$;

COMMENT ON FUNCTION public.update_my_trip_status(UUID,TEXT) IS
  'تحديث حالة رحلة السائق + تسجيل HOS تلقائياً. الانطلاق يتطلب رصيد ساعات.';

-- ---------------------------------------------------------------------------
-- 7) الصلاحيات
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.driver_owns_vehicle(UUID,UUID)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_hos_summary()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_my_duty_period(TEXT,UUID,TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_my_duty_period(TEXT)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_vehicle_inspections(UUID)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_trip_status(UUID,TEXT)              FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.driver_owns_vehicle(UUID,UUID)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_hos_summary()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_my_duty_period(TEXT,UUID,TEXT)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_my_duty_period(TEXT)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_vehicle_inspections(UUID)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_trip_status(UUID,TEXT)           TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 8) 🔴 حارس التحقق
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn      TEXT;
  v_anon    TEXT;
  v_cnt     INT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.driver_owns_vehicle(uuid,uuid)',
    'public.get_my_hos_summary()',
    'public.start_my_duty_period(text,uuid,text)',
    'public.end_my_duty_period(text)',
    'public.record_my_vehicle_inspection(uuid,text,jsonb,numeric,text,text)',
    'public.get_my_vehicle_inspections(uuid)',
    'public.update_my_trip_status(uuid,text)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0297 failed: missing functions:%', v_missing;
  END IF;

  -- درس 0294: نسخة واحدة من الدالة المُعاد بناؤها
  SELECT count(*) INTO v_cnt FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_my_trip_status';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION '0297 failed: update_my_trip_status has % overloads', v_cnt;
  END IF;

  -- دوال السائق لا تفرض دور logistics (وإلا فالغرض ساقط)
  FOREACH v_fn IN ARRAY ARRAY[
    'get_my_hos_summary','start_my_duty_period','end_my_duty_period',
    'record_my_vehicle_inspection','get_my_vehicle_inspections'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_fn
         AND p.prosrc ILIKE '%movement_require_role%'
    ) THEN
      RAISE EXCEPTION '0297 failed: % must not require the logistics role', v_fn;
    END IF;
  END LOOP;

  -- وكلها تفرض هوية السائق
  FOREACH v_fn IN ARRAY ARRAY[
    'get_my_hos_summary','start_my_duty_period','end_my_duty_period',
    'record_my_vehicle_inspection','get_my_vehicle_inspections',
    'update_my_trip_status'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_fn
         AND p.prosrc ILIKE '%movement_require_driver%'
    ) THEN
      RAISE EXCEPTION '0297 failed: % does not enforce driver identity', v_fn;
    END IF;
  END LOOP;

  -- السائق لا يرفع إيقاف DVIR — تضارب مصالح
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'clear_vehicle_defects'
       AND p.prosrc ILIKE '%movement_require_driver%'
  ) THEN
    RAISE EXCEPTION '0297 failed: drivers must not clear their own defects';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('driver_owns_vehicle','get_my_hos_summary',
                       'start_my_duty_period','end_my_duty_period',
                       'record_my_vehicle_inspection','get_my_vehicle_inspections',
                       'update_my_trip_status')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0297 failed: anon can execute: %', v_anon;
  END IF;

  RAISE NOTICE '✅ 0297: السائق يسجّل ساعاته وفحص مركبته — HOS تلقائي مع الرحلة';
END $$;
