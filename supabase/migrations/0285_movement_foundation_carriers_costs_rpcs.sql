-- ============================================================================
-- 0285 — الأساس والناقلون والتكاليف والمسارات — الجولة الرابعة
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقص المعالَج (آخر 6 أزرار «قيد التطوير»):
--   E00  المواقع والسياسات      — قراءة فقط
--   L06  تخطيط المسارات          — لا خوارزمية ولا إنشاء
--   L10  الناقلون                — قراءة فقط
--   L11  التكاليف                — قراءة فقط، وأخطر: total_cost و net_profit
--        أعمدة عادية تُكتب يدوياً ⇒ يمكن إدخال ربح لا يطابق مكوّناته.
--
-- المبدأ نفسه: الحساب والتحقق في قاعدة البيانات لا في الواجهة.
--
-- خوارزمية المسار: Nearest Neighbour + Haversine داخل Postgres.
--   ⚠️ إفصاح صريح: هذا حل تقريبي (heuristic) لا أمثل. لا OR-Tools
--   (لا تعمل داخل Postgres). النتيجة تُعرض دائماً كـ «قبل ← بعد».
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) المواقع (E00) — الإحداثيات تُلتقط من الخريطة لا تُكتب يدوياً
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_movement_location(
  p_name_ar       TEXT,
  p_location_type TEXT DEFAULT 'checkpoint',
  p_name_en       TEXT DEFAULT NULL,
  p_latitude      NUMERIC DEFAULT NULL,
  p_longitude     NUMERIC DEFAULT NULL,
  p_radius_meters INTEGER DEFAULT 50,
  p_description   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
  v_code TEXT;
BEGIN
  -- المواقع مشتركة بين الدورين: من يملك أياً منهما يديرها
  IF NOT (public.movement_has_role(auth.uid(), 'employee_movement')
          OR public.movement_has_role(auth.uid(), 'logistics')
          OR public.movement_has_role(auth.uid(), 'movement_manager')
          OR public.current_user_role() IN ('admin','developer','it_admin')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MOVEMENT_ROLE (location management)';
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_name_ar IS NULL OR length(trim(p_name_ar)) < 3 THEN
    RAISE EXCEPTION 'LOCATION_NAME_REQUIRED';
  END IF;
  IF p_location_type NOT IN ('gate','warehouse','office','checkpoint','parking','hub','client_site') THEN
    RAISE EXCEPTION 'INVALID_LOCATION_TYPE (%)', p_location_type;
  END IF;

  -- الإحداثيات إما معاً أو لا شيء — نصفها بلا معنى
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'COORDINATES_MUST_BE_BOTH_OR_NEITHER';
  END IF;
  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
    RAISE EXCEPTION 'INVALID_LATITUDE (%)', p_latitude;
  END IF;
  IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION 'INVALID_LONGITUDE (%)', p_longitude;
  END IF;
  IF p_radius_meters IS NOT NULL AND p_radius_meters <= 0 THEN
    RAISE EXCEPTION 'RADIUS_MUST_BE_POSITIVE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movement_locations
     WHERE tenant_id = v_tenant AND lower(name_ar) = lower(trim(p_name_ar))
       AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_LOCATION_NAME (%)', trim(p_name_ar);
  END IF;

  v_code := public.movement_next_code('LOC', 'movement_locations', 'code');

  INSERT INTO public.movement_locations(
    tenant_id, code, name_ar, name_en, location_type,
    latitude, longitude, radius_meters, description, is_active)
  VALUES (v_tenant, v_code, trim(p_name_ar), p_name_en, p_location_type,
          p_latitude, p_longitude, COALESCE(p_radius_meters, 50), p_description, TRUE)
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'location_created', 'movement_location', v_id,
          jsonb_build_object('code', v_code, 'name', trim(p_name_ar)));
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_movement_location(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,INTEGER,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_movement_location(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,INTEGER,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_movement_location(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,INTEGER,TEXT) TO authenticated;

-- أرشفة لا حذف (سياسة المنصة) — بسبب إلزامي
CREATE OR REPLACE FUNCTION public.archive_movement_location(
  p_location_id UUID,
  p_reason      TEXT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF NOT (public.movement_has_role(auth.uid(), 'employee_movement')
          OR public.movement_has_role(auth.uid(), 'logistics')
          OR public.movement_has_role(auth.uid(), 'movement_manager')
          OR public.current_user_role() IN ('admin','developer','it_admin')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MOVEMENT_ROLE (location management)';
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'ARCHIVE_REASON_REQUIRED';
  END IF;

  -- موقع مستخدَم في تصاريح نشطة لا يُؤرشف
  IF EXISTS (
    SELECT 1 FROM public.employee_movement_permits
     WHERE tenant_id = v_tenant AND destination_id = p_location_id
       AND status IN ('pending','approved','used')
  ) THEN
    RAISE EXCEPTION 'LOCATION_IN_USE_BY_ACTIVE_PERMITS';
  END IF;

  UPDATE public.movement_locations
     SET is_active = FALSE, updated_at = NOW()
   WHERE id = p_location_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOCATION_NOT_FOUND'; END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'location_archived', 'movement_location',
          p_location_id, jsonb_build_object('reason', trim(p_reason)));
END $$;

REVOKE ALL ON FUNCTION public.archive_movement_location(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_movement_location(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_movement_location(UUID,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) سياسات الحركة (E00)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_movement_policy(
  p_title_ar            TEXT,
  p_destination_type    TEXT,
  p_max_duration_minutes INTEGER,
  p_requires_approval   BOOLEAN DEFAULT FALSE,
  p_auto_notify_overdue BOOLEAN DEFAULT TRUE,
  p_policy_id           UUID DEFAULT NULL,
  p_reason              TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
  v_code TEXT;
  v_old RECORD;
BEGIN
  PERFORM public.movement_require_role('employee_movement');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_title_ar IS NULL OR length(trim(p_title_ar)) < 3 THEN
    RAISE EXCEPTION 'POLICY_TITLE_REQUIRED';
  END IF;
  IF p_destination_type IS NULL OR length(trim(p_destination_type)) < 2 THEN
    RAISE EXCEPTION 'DESTINATION_TYPE_REQUIRED';
  END IF;
  -- حد منطقي: من دقيقة إلى يوم كامل
  IF p_max_duration_minutes IS NULL
     OR p_max_duration_minutes <= 0 OR p_max_duration_minutes > 1440 THEN
    RAISE EXCEPTION 'INVALID_MAX_DURATION (must be 1..1440)';
  END IF;

  IF p_policy_id IS NULL THEN
    v_code := public.movement_next_code('POL', 'movement_policies', 'policy_code');
    INSERT INTO public.movement_policies(
      tenant_id, policy_code, title_ar, destination_type,
      max_duration_minutes, requires_approval, auto_notify_overdue, is_active)
    VALUES (v_tenant, v_code, trim(p_title_ar), trim(p_destination_type),
            p_max_duration_minutes, p_requires_approval, p_auto_notify_overdue, TRUE)
    RETURNING id INTO v_id;

    INSERT INTO public.movement_audit_events(
      tenant_id, actor_id, event_type, entity_type, entity_id, payload)
    VALUES (v_tenant, auth.uid(), 'policy_created', 'movement_policy', v_id,
            jsonb_build_object('code', v_code, 'title', trim(p_title_ar)));
  ELSE
    -- التعديل يتطلب سبباً: السياسة تؤثر على كل التصاريح القادمة
    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'POLICY_CHANGE_REASON_REQUIRED';
    END IF;

    SELECT * INTO v_old FROM public.movement_policies
     WHERE id = p_policy_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'POLICY_NOT_FOUND'; END IF;

    UPDATE public.movement_policies
       SET title_ar = trim(p_title_ar),
           destination_type = trim(p_destination_type),
           max_duration_minutes = p_max_duration_minutes,
           requires_approval = p_requires_approval,
           auto_notify_overdue = p_auto_notify_overdue,
           updated_at = NOW()
     WHERE id = p_policy_id AND tenant_id = v_tenant;
    v_id := p_policy_id;

    INSERT INTO public.movement_audit_events(
      tenant_id, actor_id, event_type, entity_type, entity_id, payload)
    VALUES (v_tenant, auth.uid(), 'policy_updated', 'movement_policy', v_id,
            jsonb_build_object(
              'old_max_duration', v_old.max_duration_minutes,
              'new_max_duration', p_max_duration_minutes,
              'reason', trim(p_reason)));
  END IF;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.upsert_movement_policy(TEXT,TEXT,INTEGER,BOOLEAN,BOOLEAN,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_movement_policy(TEXT,TEXT,INTEGER,BOOLEAN,BOOLEAN,UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_movement_policy(TEXT,TEXT,INTEGER,BOOLEAN,BOOLEAN,UUID,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) الناقلون (L10)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_logistics_carrier(
  p_carrier_name_ar TEXT,
  p_service_type    TEXT DEFAULT '3pl',
  p_contact_person  TEXT DEFAULT NULL,
  p_phone           TEXT DEFAULT NULL,
  p_email           TEXT DEFAULT NULL,
  p_contract_expiry DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_carrier_name_ar IS NULL OR length(trim(p_carrier_name_ar)) < 3 THEN
    RAISE EXCEPTION 'CARRIER_NAME_REQUIRED';
  END IF;
  IF p_service_type NOT IN ('3pl','freight_forwarder','courier','owner_operator') THEN
    RAISE EXCEPTION 'INVALID_SERVICE_TYPE (%)', p_service_type;
  END IF;
  IF p_email IS NOT NULL AND p_email <> '' AND p_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  -- عقد منتهٍ أصلاً لا معنى لتسجيله
  IF p_contract_expiry IS NOT NULL AND p_contract_expiry < CURRENT_DATE THEN
    RAISE EXCEPTION 'CONTRACT_ALREADY_EXPIRED (%)', p_contract_expiry;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.logistics_carriers
     WHERE tenant_id = v_tenant AND lower(carrier_name_ar) = lower(trim(p_carrier_name_ar))
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_CARRIER_NAME';
  END IF;

  v_code := public.movement_next_code('CAR', 'logistics_carriers', 'carrier_code');

  INSERT INTO public.logistics_carriers(
    tenant_id, carrier_code, carrier_name_ar, contact_person,
    phone, email, service_type, contract_expiry, status)
  VALUES (v_tenant, v_code, trim(p_carrier_name_ar), p_contact_person,
          p_phone, p_email, p_service_type, p_contract_expiry, 'active')
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'carrier_created', 'logistics_carrier', v_id,
          jsonb_build_object('code', v_code, 'name', trim(p_carrier_name_ar)));
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_logistics_carrier(TEXT,TEXT,TEXT,TEXT,TEXT,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_logistics_carrier(TEXT,TEXT,TEXT,TEXT,TEXT,DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_logistics_carrier(TEXT,TEXT,TEXT,TEXT,TEXT,DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) ★ تكاليف الرحلة (L11)
--    total_cost و net_profit أعمدة عادية ⇒ كانت تُكتب يدوياً ويمكن
--    إدخال ربح لا يطابق مكوّناته. هنا تُحسب حصراً في الخادم.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_trip_cost(
  p_dispatch_id      UUID,
  p_fuel_cost        NUMERIC DEFAULT 0,
  p_toll_cost        NUMERIC DEFAULT 0,
  p_driver_allowance NUMERIC DEFAULT 0,
  p_maintenance_share NUMERIC DEFAULT 0,
  p_revenue          NUMERIC DEFAULT 0,
  p_carrier_id       UUID DEFAULT NULL
)
RETURNS TABLE (cost_id UUID, total_cost NUMERIC, net_profit NUMERIC)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_disp   RECORD;
  v_id     UUID;
  v_total  NUMERIC;
  v_net    NUMERIC;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_fuel_cost < 0 OR p_toll_cost < 0 OR p_driver_allowance < 0
     OR p_maintenance_share < 0 OR p_revenue < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_AMOUNT_NOT_ALLOWED';
  END IF;

  SELECT * INTO v_disp FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_FOUND'; END IF;

  -- التكلفة تُسجَّل بعد انتهاء الرحلة فقط
  IF v_disp.status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'CANNOT_RECORD_COST_FOR_ACTIVE_DISPATCH (status=%)', v_disp.status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.logistics_trip_costs
     WHERE tenant_id = v_tenant AND dispatch_id = p_dispatch_id
  ) THEN
    RAISE EXCEPTION 'TRIP_COST_ALREADY_RECORDED';
  END IF;

  -- ★ الحساب في الخادم — لا يقبل قيمة من المستخدم
  v_total := p_fuel_cost + p_toll_cost + p_driver_allowance + p_maintenance_share;
  v_net   := p_revenue - v_total;

  INSERT INTO public.logistics_trip_costs(
    tenant_id, dispatch_id, carrier_id, fuel_cost, toll_cost,
    driver_allowance, maintenance_share, total_cost, revenue, net_profit, status)
  VALUES (v_tenant, p_dispatch_id, p_carrier_id, p_fuel_cost, p_toll_cost,
          p_driver_allowance, p_maintenance_share, v_total, p_revenue, v_net, 'pending')
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'trip_cost_recorded', 'logistics_trip_cost', v_id,
          jsonb_build_object('total_cost', v_total, 'net_profit', v_net));

  RETURN QUERY SELECT v_id, v_total, v_net;
END $$;

REVOKE ALL ON FUNCTION public.record_trip_cost(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_trip_cost(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_trip_cost(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) ★ تخطيط المسار (L06) — Nearest Neighbour + Haversine
--    ⚠️ حل تقريبي (heuristic) لا أمثل. OR-Tools لا تعمل داخل Postgres.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plan_optimized_route(
  p_route_name   TEXT,
  p_location_ids UUID[],
  p_dispatch_id  UUID DEFAULT NULL,
  p_avg_speed_kmh NUMERIC DEFAULT 45
)
RETURNS TABLE (
  route_id       UUID,
  ordered_count  INTEGER,
  naive_km       NUMERIC,
  optimized_km   NUMERIC,
  saved_km       NUMERIC,
  duration_min   INTEGER
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_id       UUID;
  v_code     TEXT;
  v_pts      JSONB := '[]'::jsonb;
  v_remaining UUID[];
  v_current  RECORD;
  v_best     RECORD;
  v_naive    NUMERIC := 0;
  v_opt      NUMERIC := 0;
  v_prev     RECORD;
  v_seq      INTEGER := 0;
  v_n        INTEGER;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_route_name IS NULL OR length(trim(p_route_name)) < 3 THEN
    RAISE EXCEPTION 'ROUTE_NAME_REQUIRED';
  END IF;
  v_n := COALESCE(array_length(p_location_ids, 1), 0);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'AT_LEAST_TWO_LOCATIONS_REQUIRED';
  END IF;
  IF v_n > 50 THEN
    RAISE EXCEPTION 'TOO_MANY_STOPS_FOR_INLINE_OPTIMIZATION (max 50, got %)', v_n;
  END IF;
  IF p_avg_speed_kmh IS NULL OR p_avg_speed_kmh <= 0 THEN
    RAISE EXCEPTION 'INVALID_AVG_SPEED';
  END IF;

  -- كل المواقع يجب أن تملك إحداثيات وإلا فلا مسافة
  IF EXISTS (
    SELECT 1 FROM unnest(p_location_ids) AS x(lid)
     LEFT JOIN public.movement_locations l
            ON l.id = x.lid AND l.tenant_id = v_tenant
     WHERE l.id IS NULL OR l.latitude IS NULL OR l.longitude IS NULL
  ) THEN
    RAISE EXCEPTION 'ALL_LOCATIONS_MUST_HAVE_COORDINATES';
  END IF;

  -- (أ) المسافة بالترتيب المُدخَل (خط الأساس للمقارنة)
  FOR v_current IN
    SELECT l.id, l.latitude AS lat, l.longitude AS lng, x.ord
      FROM unnest(p_location_ids) WITH ORDINALITY AS x(lid, ord)
      JOIN public.movement_locations l ON l.id = x.lid
     WHERE l.tenant_id = v_tenant
     ORDER BY x.ord
  LOOP
    IF v_prev IS NOT NULL THEN
      v_naive := v_naive + public.movement_haversine_km(
        v_prev.lat, v_prev.lng, v_current.lat, v_current.lng);
    END IF;
    v_prev := v_current;
  END LOOP;

  -- (ب) Nearest Neighbour من أول موقع
  v_remaining := p_location_ids[2:v_n];
  SELECT l.id, l.latitude AS lat, l.longitude AS lng, l.name_ar
    INTO v_current
    FROM public.movement_locations l
   WHERE l.id = p_location_ids[1] AND l.tenant_id = v_tenant;

  v_seq := 1;
  v_pts := v_pts || jsonb_build_object(
    'seq', v_seq, 'location_id', v_current.id,
    'name', v_current.name_ar, 'lat', v_current.lat, 'lng', v_current.lng);

  WHILE COALESCE(array_length(v_remaining, 1), 0) > 0 LOOP
    SELECT l.id, l.latitude AS lat, l.longitude AS lng, l.name_ar,
           public.movement_haversine_km(v_current.lat, v_current.lng,
                                        l.latitude, l.longitude) AS dist
      INTO v_best
      FROM public.movement_locations l
     WHERE l.id = ANY(v_remaining) AND l.tenant_id = v_tenant
     ORDER BY dist ASC
     LIMIT 1;

    v_opt := v_opt + v_best.dist;
    v_seq := v_seq + 1;
    v_pts := v_pts || jsonb_build_object(
      'seq', v_seq, 'location_id', v_best.id, 'name', v_best.name_ar,
      'lat', v_best.lat, 'lng', v_best.lng, 'leg_km', ROUND(v_best.dist, 3));

    v_remaining := array_remove(v_remaining, v_best.id);
    v_current := v_best;
  END LOOP;

  v_code := public.movement_next_code('RTE', 'logistics_routes', 'route_code');

  INSERT INTO public.logistics_routes(
    tenant_id, route_code, route_name, dispatch_id, waypoints_json,
    total_distance_km, estimated_duration_min, status, notes)
  VALUES (v_tenant, v_code, trim(p_route_name), p_dispatch_id, v_pts,
          ROUND(v_opt, 2), CEIL((v_opt / p_avg_speed_kmh) * 60)::INT, 'optimized',
          'Nearest Neighbour (heuristic) — حل تقريبي لا أمثل')
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'route_optimized', 'logistics_route', v_id,
          jsonb_build_object('stops', v_seq, 'naive_km', ROUND(v_naive,2),
                             'optimized_km', ROUND(v_opt,2)));

  RETURN QUERY SELECT v_id, v_seq, ROUND(v_naive,2), ROUND(v_opt,2),
                      ROUND(GREATEST(v_naive - v_opt, 0), 2),
                      CEIL((v_opt / p_avg_speed_kmh) * 60)::INT;
END $$;

REVOKE ALL ON FUNCTION public.plan_optimized_route(TEXT,UUID[],UUID,NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plan_optimized_route(TEXT,UUID[],UUID,NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.plan_optimized_route(TEXT,UUID[],UUID,NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) View: ربحية الرحلات (L11)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.logistics_profitability
WITH (security_invoker = true) AS
SELECT
  c.id                AS cost_id,
  c.tenant_id,
  d.dispatch_code,
  o.order_code,
  v.vehicle_code,
  c.fuel_cost, c.toll_cost, c.driver_allowance, c.maintenance_share,
  c.total_cost, c.revenue, c.net_profit,
  c.status            AS cost_status,
  CASE WHEN c.revenue > 0
       THEN ROUND(c.net_profit / c.revenue * 100, 2) ELSE NULL END AS margin_percent,
  r.total_distance_km,
  CASE WHEN COALESCE(r.total_distance_km, 0) > 0
       THEN ROUND(c.total_cost / r.total_distance_km, 2) ELSE NULL END AS cost_per_km,
  c.created_at
FROM public.logistics_trip_costs c
JOIN public.logistics_dispatches d       ON d.id = c.dispatch_id
JOIN public.logistics_shipment_orders o  ON o.id = d.order_id
JOIN public.logistics_vehicles v         ON v.id = d.vehicle_id
LEFT JOIN public.logistics_routes r      ON r.dispatch_id = d.id
WHERE c.tenant_id = public.current_user_tenant_id();

GRANT SELECT ON public.logistics_profitability TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) View: أداء الناقلين
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.logistics_carrier_performance
WITH (security_invoker = true) AS
SELECT
  ca.id                       AS carrier_id,
  ca.tenant_id,
  ca.carrier_code,
  ca.carrier_name_ar,
  ca.service_type,
  ca.status,
  ca.rating,
  ca.contract_expiry,
  CASE
    WHEN ca.contract_expiry IS NULL                    THEN 'no_contract'
    WHEN ca.contract_expiry <  CURRENT_DATE            THEN 'expired'
    WHEN ca.contract_expiry <= CURRENT_DATE + 30       THEN 'expiring_soon'
    ELSE 'valid'
  END::TEXT                   AS contract_status,
  COUNT(c.id)                 AS trips_count,
  COALESCE(SUM(c.total_cost), 0) AS total_spend,
  COALESCE(SUM(c.net_profit), 0) AS total_profit
FROM public.logistics_carriers ca
LEFT JOIN public.logistics_trip_costs c
       ON c.carrier_id = ca.id AND c.tenant_id = ca.tenant_id
WHERE ca.tenant_id = public.current_user_tenant_id()
GROUP BY ca.id, ca.tenant_id, ca.carrier_code, ca.carrier_name_ar,
         ca.service_type, ca.status, ca.rating, ca.contract_expiry;

GRANT SELECT ON public.logistics_carrier_performance TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 8) تأكيدات
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_fn TEXT; v_missing TEXT := ''; v_anon TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_movement_location(text,text,text,numeric,numeric,integer,text)',
    'public.archive_movement_location(uuid,text)',
    'public.upsert_movement_policy(text,text,integer,boolean,boolean,uuid,text)',
    'public.create_logistics_carrier(text,text,text,text,text,date)',
    'public.record_trip_cost(uuid,numeric,numeric,numeric,numeric,numeric,uuid)',
    'public.plan_optimized_route(text,uuid[],uuid,numeric)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0285 failed: missing functions:%', v_missing;
  END IF;

  IF to_regclass('public.logistics_profitability') IS NULL
     OR to_regclass('public.logistics_carrier_performance') IS NULL THEN
    RAISE EXCEPTION '0285 failed: views missing';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_movement_location','archive_movement_location',
                       'upsert_movement_policy','create_logistics_carrier',
                       'record_trip_cost','plan_optimized_route')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0285 failed: anon can execute: %', v_anon;
  END IF;

  RAISE NOTICE '✅ 0285: foundation, carriers, costs & routing RPCs applied';
END $$;
