-- ============================================================================
-- 0284 — دورة حياة الإرسال والتسليم والوقود — الجولة الثالثة
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقص المعالَج:
--   0283 غطّى الأسطول (L01) والصيانة (L03). بقيت الوحدات التشغيلية
--   الأساسية بلا منطق: أوامر النقل (L05) والإرسال (L07) والتسليم (L09)
--   والوقود (L04). أحد عشر زراً في الواجهة يعرض «قيد التطوير».
--
--   الأخطر: **لا رابط فعلي بين الأمر والمركبة والسائق**. جدول
--   logistics_dispatches موجود لكن لا شيء يمنع:
--     • إرسال أمر مرسَل أصلاً (ازدواج)
--     • إسناد مركبة في رحلة أخرى
--     • تحميل يتجاوز سعة المركبة
--     • تسليم بلا إرسال
--     • تزوّد وقود يفوق سعة الخزان
--
-- المبدأ: الحالة تنتقل عبر RPC فقط. الجداول لا تُكتب مباشرة.
--
-- الأمان: movement_require_role('logistics') + REVOKE FROM anon صريح.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) إنشاء أمر نقل
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_shipment_order(
  p_origin_address      TEXT,
  p_destination_address TEXT,
  p_cargo_description   TEXT,
  p_cargo_weight_kg     NUMERIC DEFAULT 0,
  p_cargo_volume_cbm    NUMERIC DEFAULT 0,
  p_priority            TEXT DEFAULT 'normal',
  p_scheduled_departure TIMESTAMPTZ DEFAULT NULL,
  p_origin_location_id  UUID DEFAULT NULL,
  p_destination_location_id UUID DEFAULT NULL,
  p_notes               TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
  v_code TEXT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_origin_address IS NULL OR length(trim(p_origin_address)) < 3 THEN
    RAISE EXCEPTION 'ORIGIN_ADDRESS_REQUIRED';
  END IF;
  IF p_destination_address IS NULL OR length(trim(p_destination_address)) < 3 THEN
    RAISE EXCEPTION 'DESTINATION_ADDRESS_REQUIRED';
  END IF;
  IF p_cargo_description IS NULL OR length(trim(p_cargo_description)) < 3 THEN
    RAISE EXCEPTION 'CARGO_DESCRIPTION_REQUIRED';
  END IF;
  IF p_priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'INVALID_PRIORITY (%)', p_priority;
  END IF;
  IF p_cargo_weight_kg < 0 OR p_cargo_volume_cbm < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_CARGO_NOT_ALLOWED';
  END IF;
  -- نقل من موقع إلى نفسه بلا معنى
  IF p_origin_location_id IS NOT NULL
     AND p_origin_location_id = p_destination_location_id THEN
    RAISE EXCEPTION 'ORIGIN_AND_DESTINATION_IDENTICAL';
  END IF;

  v_code := public.movement_next_code('TO', 'logistics_shipment_orders', 'order_code');

  INSERT INTO public.logistics_shipment_orders(
    tenant_id, order_code, origin_location_id, destination_location_id,
    origin_address, destination_address, cargo_description,
    cargo_weight_kg, cargo_volume_cbm, priority, status,
    scheduled_departure, notes)
  VALUES (
    v_tenant, v_code, p_origin_location_id, p_destination_location_id,
    trim(p_origin_address), trim(p_destination_address), trim(p_cargo_description),
    p_cargo_weight_kg, p_cargo_volume_cbm, p_priority, 'draft',
    p_scheduled_departure, p_notes)
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'shipment_order_created', 'logistics_shipment_order',
          v_id, jsonb_build_object('order_code', v_code, 'weight_kg', p_cargo_weight_kg));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_shipment_order(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TIMESTAMPTZ,UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_shipment_order(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TIMESTAMPTZ,UUID,UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_shipment_order(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TIMESTAMPTZ,UUID,UUID,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) ★ إرسال أمر — القلب التشغيلي للبوابة
--    يربط الأمر بمركبة وسائق بعد التحقق من كل القيود.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_shipment_order(
  p_order_id   UUID,
  p_vehicle_id UUID,
  p_driver_id  UUID,
  p_estimated_arrival TIMESTAMPTZ DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_order   RECORD;
  v_vehicle RECORD;
  v_blocker RECORD;
  v_id      UUID;
  v_code    TEXT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_order FROM public.logistics_shipment_orders
   WHERE id = p_order_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  -- لا يُرسَل إلا أمر جاهز
  IF v_order.status NOT IN ('draft','scheduled') THEN
    RAISE EXCEPTION 'ORDER_NOT_DISPATCHABLE (status=%)', v_order.status;
  END IF;

  -- منع الازدواج: أمر له إرسال نشط
  IF EXISTS (
    SELECT 1 FROM public.logistics_dispatches
     WHERE tenant_id = v_tenant AND order_id = p_order_id
       AND status IN ('dispatched','en_route','arrived')
  ) THEN
    RAISE EXCEPTION 'ORDER_ALREADY_DISPATCHED';
  END IF;

  -- أهلية المركبة والسائق (يعيد استخدام منطق 0283 — مصدر حقيقة واحد)
  FOR v_blocker IN
    SELECT * FROM public.check_assignment_eligibility(p_vehicle_id, p_driver_id)
     WHERE is_eligible = false
  LOOP
    RAISE EXCEPTION 'ASSIGNMENT_BLOCKED: % — %', v_blocker.blocker_code, v_blocker.blocker_msg;
  END LOOP;

  -- المركبة ليست في رحلة أخرى نشطة
  IF EXISTS (
    SELECT 1 FROM public.logistics_dispatches
     WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
       AND status IN ('dispatched','en_route','arrived')
  ) THEN
    RAISE EXCEPTION 'VEHICLE_ALREADY_ON_ACTIVE_DISPATCH';
  END IF;

  -- السائق ليس في رحلة أخرى نشطة
  IF EXISTS (
    SELECT 1 FROM public.logistics_dispatches
     WHERE tenant_id = v_tenant AND driver_id = p_driver_id
       AND status IN ('dispatched','en_route','arrived')
  ) THEN
    RAISE EXCEPTION 'DRIVER_ALREADY_ON_ACTIVE_DISPATCH';
  END IF;

  -- ★ السعة: لا تحميل يتجاوز قدرة المركبة
  SELECT * INTO v_vehicle FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant FOR UPDATE;

  IF v_vehicle.max_weight_kg > 0 AND v_order.cargo_weight_kg > v_vehicle.max_weight_kg THEN
    RAISE EXCEPTION 'CARGO_EXCEEDS_VEHICLE_WEIGHT (cargo=%, capacity=%)',
      v_order.cargo_weight_kg, v_vehicle.max_weight_kg;
  END IF;
  IF v_vehicle.max_volume_cbm > 0 AND v_order.cargo_volume_cbm > v_vehicle.max_volume_cbm THEN
    RAISE EXCEPTION 'CARGO_EXCEEDS_VEHICLE_VOLUME (cargo=%, capacity=%)',
      v_order.cargo_volume_cbm, v_vehicle.max_volume_cbm;
  END IF;

  v_code := public.movement_next_code('DSP', 'logistics_dispatches', 'dispatch_code');

  INSERT INTO public.logistics_dispatches(
    tenant_id, dispatch_code, order_id, vehicle_id, driver_id,
    status, dispatched_at, estimated_arrival, dispatch_notes)
  VALUES (v_tenant, v_code, p_order_id, p_vehicle_id, p_driver_id,
          'dispatched', NOW(), p_estimated_arrival, p_notes)
  RETURNING id INTO v_id;

  -- تحديث الحالات المترابطة
  UPDATE public.logistics_shipment_orders
     SET status = 'dispatched', updated_at = NOW()
   WHERE id = p_order_id AND tenant_id = v_tenant;

  UPDATE public.logistics_vehicles
     SET status = 'on_trip', updated_at = NOW()
   WHERE id = p_vehicle_id AND tenant_id = v_tenant;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'order_dispatched', 'logistics_dispatch', v_id,
          jsonb_build_object('dispatch_code', v_code, 'order_id', p_order_id,
                             'vehicle_id', p_vehicle_id, 'driver_id', p_driver_id));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_shipment_order(UUID,UUID,UUID,TIMESTAMPTZ,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_shipment_order(UUID,UUID,UUID,TIMESTAMPTZ,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispatch_shipment_order(UUID,UUID,UUID,TIMESTAMPTZ,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) تحديث حالة الإرسال — انتقالات مشروعة فقط
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_dispatch_status(
  p_dispatch_id UUID,
  p_status      TEXT,
  p_reason      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_rec    RECORD;
  v_ok     BOOLEAN := false;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_status NOT IN ('dispatched','en_route','arrived','completed','failed') THEN
    RAISE EXCEPTION 'INVALID_DISPATCH_STATUS (%)', p_status;
  END IF;

  SELECT * INTO v_rec FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_FOUND'; END IF;

  IF v_rec.status IN ('completed','failed') THEN
    RAISE EXCEPTION 'DISPATCH_ALREADY_CLOSED (status=%)', v_rec.status;
  END IF;

  -- آلة الحالات: dispatched → en_route → arrived → completed
  --              وأي حالة نشطة → failed (بسبب إلزامي)
  v_ok := (v_rec.status = 'dispatched' AND p_status IN ('en_route','failed'))
       OR (v_rec.status = 'en_route'   AND p_status IN ('arrived','failed'))
       OR (v_rec.status = 'arrived'    AND p_status IN ('completed','failed'));

  IF NOT v_ok THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION (% → %)', v_rec.status, p_status;
  END IF;

  IF p_status = 'failed' AND (p_reason IS NULL OR length(trim(p_reason)) < 5) THEN
    RAISE EXCEPTION 'FAILURE_REASON_REQUIRED';
  END IF;

  UPDATE public.logistics_dispatches
     SET status = p_status,
         actual_arrival = CASE WHEN p_status = 'arrived' THEN NOW() ELSE actual_arrival END,
         dispatch_notes = COALESCE(p_reason, dispatch_notes),
         updated_at = NOW()
   WHERE id = p_dispatch_id AND tenant_id = v_tenant;

  -- الإغلاق يحرّر المركبة ويحدّث الأمر
  IF p_status IN ('completed','failed') THEN
    UPDATE public.logistics_vehicles
       SET status = 'available', updated_at = NOW()
     WHERE id = v_rec.vehicle_id AND tenant_id = v_tenant AND status = 'on_trip';

    UPDATE public.logistics_shipment_orders
       SET status = CASE WHEN p_status = 'completed' THEN 'delivered' ELSE 'cancelled' END,
           updated_at = NOW()
     WHERE id = v_rec.order_id AND tenant_id = v_tenant;

  ELSIF p_status = 'en_route' THEN
    UPDATE public.logistics_shipment_orders
       SET status = 'in_transit', updated_at = NOW()
     WHERE id = v_rec.order_id AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'dispatch_status_changed', 'logistics_dispatch',
          p_dispatch_id, jsonb_build_object('old_status', v_rec.status,
                                            'new_status', p_status,
                                            'reason', p_reason));
END $$;

REVOKE ALL ON FUNCTION public.update_dispatch_status(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_dispatch_status(UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_dispatch_status(UUID,TEXT,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) تسجيل إثبات التسليم (ePOD)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_delivery_proof(
  p_dispatch_id    UUID,
  p_recipient_name TEXT,
  p_status         TEXT DEFAULT 'delivered',
  p_signature_url  TEXT DEFAULT NULL,
  p_photo_proof_url TEXT DEFAULT NULL,
  p_delivery_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_disp   RECORD;
  v_id     UUID;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_status NOT IN ('delivered','partially_delivered','rejected','disputed') THEN
    RAISE EXCEPTION 'INVALID_EPOD_STATUS (%)', p_status;
  END IF;
  IF p_recipient_name IS NULL OR length(trim(p_recipient_name)) < 3 THEN
    RAISE EXCEPTION 'RECIPIENT_NAME_REQUIRED';
  END IF;
  -- الرفض والنزاع يحتاجان تفسيراً
  IF p_status IN ('rejected','disputed')
     AND (p_delivery_notes IS NULL OR length(trim(p_delivery_notes)) < 5) THEN
    RAISE EXCEPTION 'DELIVERY_NOTES_REQUIRED_FOR_% ', p_status;
  END IF;

  SELECT * INTO v_disp FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_FOUND'; END IF;

  -- لا إثبات تسليم قبل الوصول
  IF v_disp.status NOT IN ('arrived','completed') THEN
    RAISE EXCEPTION 'CANNOT_RECORD_EPOD_BEFORE_ARRIVAL (status=%)', v_disp.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.logistics_epod
     WHERE tenant_id = v_tenant AND dispatch_id = p_dispatch_id
  ) THEN
    RAISE EXCEPTION 'EPOD_ALREADY_RECORDED';
  END IF;

  INSERT INTO public.logistics_epod(
    tenant_id, dispatch_id, order_id, recipient_name,
    signature_url, photo_proof_url, delivery_notes, delivered_at, status)
  VALUES (v_tenant, p_dispatch_id, v_disp.order_id, trim(p_recipient_name),
          p_signature_url, p_photo_proof_url, p_delivery_notes, NOW(), p_status)
  RETURNING id INTO v_id;

  -- تسليم ناجح يُغلق الإرسال تلقائياً
  IF p_status = 'delivered' AND v_disp.status = 'arrived' THEN
    PERFORM public.update_dispatch_status(p_dispatch_id, 'completed', NULL);
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'delivery_proof_recorded', 'logistics_epod', v_id,
          jsonb_build_object('dispatch_id', p_dispatch_id, 'status', p_status,
                             'recipient', trim(p_recipient_name)));
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.record_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) ★ تسجيل تزوّد وقود + كشف الاحتيال
--    الوقود ≈ 30%+ من تكاليف الأسطول — أعلى بند بعد الرواتب.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_fuel_transaction(
  p_vehicle_id       UUID,
  p_liters           NUMERIC,
  p_cost             NUMERIC,
  p_odometer_reading NUMERIC,
  p_driver_id        UUID DEFAULT NULL,
  p_station_name     TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL
)
RETURNS TABLE (fuel_log_id UUID, flags TEXT[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_vehicle  RECORD;
  v_prev     RECORD;
  v_id       UUID;
  v_flags    TEXT[] := ARRAY[]::TEXT[];
  v_distance NUMERIC;
  v_rate     NUMERIC;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_liters IS NULL OR p_liters <= 0 THEN RAISE EXCEPTION 'INVALID_LITERS'; END IF;
  IF p_cost IS NULL OR p_cost < 0 THEN RAISE EXCEPTION 'INVALID_COST'; END IF;
  IF p_odometer_reading IS NULL OR p_odometer_reading < 0 THEN
    RAISE EXCEPTION 'INVALID_ODOMETER';
  END IF;

  SELECT * INTO v_vehicle FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  -- العداد لا يتراجع (نفس قاعدة 0283)
  IF p_odometer_reading < v_vehicle.current_mileage_km THEN
    RAISE EXCEPTION 'ODOMETER_CANNOT_DECREASE (current=%, given=%)',
      v_vehicle.current_mileage_km, p_odometer_reading;
  END IF;

  -- 🚩 علم: تزوّدان خلال ساعة
  SELECT * INTO v_prev FROM public.logistics_fuel_logs
   WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
   ORDER BY logged_at DESC LIMIT 1;

  IF FOUND AND v_prev.logged_at > NOW() - INTERVAL '1 hour' THEN
    v_flags := array_append(v_flags, 'RAPID_REFUEL');
  END IF;

  -- 🚩 علم: استهلاك شاذ مقارنةً بالمسافة المقطوعة
  IF FOUND AND v_prev.odometer_reading > 0 THEN
    v_distance := p_odometer_reading - v_prev.odometer_reading;
    IF v_distance <= 0 THEN
      v_flags := array_append(v_flags, 'NO_DISTANCE_SINCE_LAST_REFUEL');
    ELSE
      v_rate := (p_liters / v_distance) * 100;   -- لتر/100كم
      IF v_rate > 60 THEN
        v_flags := array_append(v_flags, 'ABNORMAL_CONSUMPTION');
      END IF;
    END IF;
  END IF;

  -- 🚩 علم: كمية غير منطقية لنوع المركبة
  IF p_liters > 500 THEN
    v_flags := array_append(v_flags, 'EXCESSIVE_QUANTITY');
  END IF;

  -- 🚩 علم: مركبة كهربائية تتزوّد وقوداً
  IF v_vehicle.fuel_type = 'electric' THEN
    v_flags := array_append(v_flags, 'FUEL_FOR_ELECTRIC_VEHICLE');
  END IF;

  INSERT INTO public.logistics_fuel_logs(
    tenant_id, vehicle_id, driver_id, liters, cost,
    odometer_reading, station_name, logged_at, notes)
  VALUES (v_tenant, p_vehicle_id, p_driver_id, p_liters, p_cost,
          p_odometer_reading, p_station_name, NOW(),
          CASE WHEN array_length(v_flags,1) IS NULL THEN p_notes
               ELSE COALESCE(p_notes || ' | ', '') || 'FLAGS: ' || array_to_string(v_flags, ',')
          END)
  RETURNING id INTO v_id;

  -- العداد يُحدَّث من قراءة التزوّد
  UPDATE public.logistics_vehicles
     SET current_mileage_km = p_odometer_reading, updated_at = NOW()
   WHERE id = p_vehicle_id AND tenant_id = v_tenant;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'fuel_logged', 'logistics_fuel_log', v_id,
          jsonb_build_object('liters', p_liters, 'cost', p_cost, 'flags', v_flags));

  RETURN QUERY SELECT v_id, v_flags;
END $$;

REVOKE ALL ON FUNCTION public.log_fuel_transaction(UUID,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_fuel_transaction(UUID,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_fuel_transaction(UUID,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) View: لوحة الإرسال (Kanban) — الأوامر والرحلات مع سياقها
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.logistics_dispatch_board
WITH (security_invoker = true) AS
SELECT
  d.id                    AS dispatch_id,
  d.tenant_id,
  d.dispatch_code,
  d.status                AS dispatch_status,
  d.dispatched_at,
  d.estimated_arrival,
  d.actual_arrival,
  o.id                    AS order_id,
  o.order_code,
  o.origin_address,
  o.destination_address,
  o.cargo_description,
  o.cargo_weight_kg,
  o.priority,
  v.id                    AS vehicle_id,
  v.vehicle_code,
  v.plate_number,
  dr.id                   AS driver_id,
  dr.driver_name_ar,
  dr.phone                AS driver_phone,
  (e.id IS NOT NULL)      AS has_epod,
  e.status                AS epod_status,
  CASE
    WHEN d.status IN ('completed','failed') THEN false
    WHEN d.estimated_arrival IS NULL        THEN false
    ELSE NOW() > d.estimated_arrival
  END                     AS is_overdue,
  CASE
    WHEN d.estimated_arrival IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - d.estimated_arrival))::INT / 60
  END                     AS minutes_late
FROM public.logistics_dispatches d
JOIN public.logistics_shipment_orders o ON o.id = d.order_id
JOIN public.logistics_vehicles v        ON v.id = d.vehicle_id
JOIN public.logistics_drivers dr        ON dr.id = d.driver_id
LEFT JOIN public.logistics_epod e       ON e.dispatch_id = d.id
WHERE d.tenant_id = public.current_user_tenant_id();

GRANT SELECT ON public.logistics_dispatch_board TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) View: كفاءة الوقود لكل مركبة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.logistics_fuel_efficiency
WITH (security_invoker = true) AS
SELECT
  v.id                          AS vehicle_id,
  v.tenant_id,
  v.vehicle_code,
  v.plate_number,
  v.fuel_type,
  COUNT(f.id)                   AS refuel_count,
  COALESCE(SUM(f.liters), 0)    AS total_liters,
  COALESCE(SUM(f.cost), 0)      AS total_cost,
  MAX(f.odometer_reading) - MIN(f.odometer_reading) AS distance_covered_km,
  CASE
    WHEN COUNT(f.id) < 2
      OR (MAX(f.odometer_reading) - MIN(f.odometer_reading)) <= 0 THEN NULL
    ELSE ROUND(
      (COALESCE(SUM(f.liters),0) - COALESCE(MIN(f.liters),0))
      / (MAX(f.odometer_reading) - MIN(f.odometer_reading)) * 100, 2)
  END                           AS liters_per_100km,
  COUNT(*) FILTER (WHERE f.notes LIKE '%FLAGS:%') AS flagged_transactions
FROM public.logistics_vehicles v
LEFT JOIN public.logistics_fuel_logs f
       ON f.vehicle_id = v.id AND f.tenant_id = v.tenant_id
WHERE v.tenant_id = public.current_user_tenant_id()
GROUP BY v.id, v.tenant_id, v.vehicle_code, v.plate_number, v.fuel_type;

GRANT SELECT ON public.logistics_fuel_efficiency TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 8) تأكيدات
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_fn TEXT; v_missing TEXT := ''; v_anon TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_shipment_order(text,text,text,numeric,numeric,text,timestamptz,uuid,uuid,text)',
    'public.dispatch_shipment_order(uuid,uuid,uuid,timestamptz,text)',
    'public.update_dispatch_status(uuid,text,text)',
    'public.record_delivery_proof(uuid,text,text,text,text,text)',
    'public.log_fuel_transaction(uuid,numeric,numeric,numeric,uuid,text,text)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0284 failed: missing functions:%', v_missing;
  END IF;

  IF to_regclass('public.logistics_dispatch_board') IS NULL
     OR to_regclass('public.logistics_fuel_efficiency') IS NULL THEN
    RAISE EXCEPTION '0284 failed: views missing';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_shipment_order','dispatch_shipment_order',
                       'update_dispatch_status','record_delivery_proof',
                       'log_fuel_transaction')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0284 failed: anon can execute: %', v_anon;
  END IF;

  RAISE NOTICE '✅ 0284: dispatch lifecycle RPCs applied';
END $$;
