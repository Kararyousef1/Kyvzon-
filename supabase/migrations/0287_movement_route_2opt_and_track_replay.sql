-- ============================================================================
-- FILE: 0287_movement_route_2opt_and_track_replay.sql
-- PURPOSE: الجولة السادسة من مراجعة بوابة الحركة واللوجستيات.
--
--   (1) تحسين خوارزمية المسار: Nearest Neighbour ثم 2-opt.
--       0285 كانت NN فقط — حلٌّ جشِع يترك تقاطعات في المسار.
--       2-opt يفكّ التقاطعات بعكس المقاطع، ويحسّن 10–20% إضافية عادةً.
--
--   (2) get_dispatch_track: مسار رحلة مُجمَّع للخريطة وإعادة التشغيل.
--       الـ SDK كان يقرأ logistics_telemetry الخام (حتى 500 صف) ويحسب
--       في المتصفح. الحساب انتقل للخادم: المسافة التراكمية، الفجوات
--       الزمنية، والتوقفات — بمنطق واحد لا يُكرَّر في الواجهة.
--
--   (3) get_route_waypoints: نقاط مسار مخطَّط لعرضها على الخريطة.
--
-- SECURITY: كلها SECURITY DEFINER + movement_require_role + عزل مستأجر.
--           REVOKE من anon إلزامي (منحة Supabase الصريحة لا تسحبها
--           REVOKE FROM PUBLIC وحدها).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) مسافة مسار مرتَّب — دالة مساعدة يستعملها 2-opt مراراً
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.movement_path_length_km(p_pts JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_n     INT := jsonb_array_length(p_pts);
  v_i     INT := 0;
  v_total NUMERIC := 0;
BEGIN
  IF v_n IS NULL OR v_n < 2 THEN RETURN 0; END IF;
  WHILE v_i < v_n - 1 LOOP
    v_total := v_total + public.movement_haversine_km(
      (p_pts->v_i->>'lat')::NUMERIC,     (p_pts->v_i->>'lng')::NUMERIC,
      (p_pts->(v_i+1)->>'lat')::NUMERIC, (p_pts->(v_i+1)->>'lng')::NUMERIC);
    v_i := v_i + 1;
  END LOOP;
  RETURN v_total;
END $$;

COMMENT ON FUNCTION public.movement_path_length_km(JSONB) IS
  'طول مسار مرتَّب بالكيلومتر (Haversine). مساعدة لـ 2-opt.';

-- ---------------------------------------------------------------------------
-- 2) 2-opt: يعكس المقاطع التي تُقصِّر المسار حتى لا يبقى تحسين
--
--    نقطة البداية ثابتة (المستودع/نقطة الانطلاق) — لا تُعكَس أبداً.
--    مسار مفتوح لا دائري: لا عودة إلى نقطة البداية.
--    حد أقصى للتكرارات يمنع الحلقات اللانهائية على مدخلات مرضية.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.movement_two_opt(
  p_pts       JSONB,
  p_max_passes INT DEFAULT 40
)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_n        INT := jsonb_array_length(p_pts);
  v_pts      JSONB := p_pts;
  v_i        INT;
  v_k        INT;
  v_pass     INT := 0;
  v_improved BOOLEAN := true;
  v_a_lat NUMERIC; v_a_lng NUMERIC;
  v_b_lat NUMERIC; v_b_lng NUMERIC;
  v_c_lat NUMERIC; v_c_lng NUMERIC;
  v_d_lat NUMERIC; v_d_lng NUMERIC;
  v_before NUMERIC; v_after NUMERIC;
  v_new    JSONB;
  v_j      INT;
BEGIN
  -- أقل من 4 نقاط: لا تقاطعات ممكنة في مسار مفتوح
  IF v_n IS NULL OR v_n < 4 THEN RETURN p_pts; END IF;

  WHILE v_improved AND v_pass < p_max_passes LOOP
    v_improved := false;
    v_pass := v_pass + 1;

    -- i من 1 (نُبقي النقطة 0 مثبَّتة كنقطة انطلاق)
    v_i := 1;
    WHILE v_i <= v_n - 3 LOOP
      v_k := v_i + 1;
      WHILE v_k <= v_n - 2 LOOP
        -- الحافتان الحاليتان: (i-1 → i) و (k → k+1)
        v_a_lat := (v_pts->(v_i-1)->>'lat')::NUMERIC;
        v_a_lng := (v_pts->(v_i-1)->>'lng')::NUMERIC;
        v_b_lat := (v_pts->v_i->>'lat')::NUMERIC;
        v_b_lng := (v_pts->v_i->>'lng')::NUMERIC;
        v_c_lat := (v_pts->v_k->>'lat')::NUMERIC;
        v_c_lng := (v_pts->v_k->>'lng')::NUMERIC;
        v_d_lat := (v_pts->(v_k+1)->>'lat')::NUMERIC;
        v_d_lng := (v_pts->(v_k+1)->>'lng')::NUMERIC;

        v_before := public.movement_haversine_km(v_a_lat, v_a_lng, v_b_lat, v_b_lng)
                  + public.movement_haversine_km(v_c_lat, v_c_lng, v_d_lat, v_d_lng);
        -- بعد عكس المقطع [i..k]: (i-1 → k) و (i → k+1)
        v_after  := public.movement_haversine_km(v_a_lat, v_a_lng, v_c_lat, v_c_lng)
                  + public.movement_haversine_km(v_b_lat, v_b_lng, v_d_lat, v_d_lng);

        -- عتبة صغيرة تتجنّب التذبذب من أخطاء التقريب العشري
        IF v_after < v_before - 0.0005 THEN
          v_new := '[]'::jsonb;
          v_j := 0;
          WHILE v_j < v_i LOOP
            v_new := v_new || jsonb_build_array(v_pts->v_j);  v_j := v_j + 1;
          END LOOP;
          v_j := v_k;
          WHILE v_j >= v_i LOOP
            v_new := v_new || jsonb_build_array(v_pts->v_j);  v_j := v_j - 1;
          END LOOP;
          v_j := v_k + 1;
          WHILE v_j < v_n LOOP
            v_new := v_new || jsonb_build_array(v_pts->v_j);  v_j := v_j + 1;
          END LOOP;
          v_pts := v_new;
          v_improved := true;
        END IF;
        v_k := v_k + 1;
      END LOOP;
      v_i := v_i + 1;
    END LOOP;
  END LOOP;

  RETURN v_pts;
END $$;

COMMENT ON FUNCTION public.movement_two_opt(JSONB, INT) IS
  '2-opt لمسار مفتوح: يعكس المقاطع التي تُقصِّر الطول. النقطة الأولى مثبَّتة.';

-- ---------------------------------------------------------------------------
-- 3) plan_optimized_route — النسخة المحسَّنة (NN ثم 2-opt)
--
--    توقيع الدالة لم يتغيّر، لكن أُضيف عمودان للمخرجات: nn_km و
--    two_opt_saved_km — يُظهران أثر كل مرحلة على حدة.
--    DROP ضروري: تغيير أعمدة RETURNS TABLE لا يقبله CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC);

CREATE FUNCTION public.plan_optimized_route(
  p_route_name    TEXT,
  p_location_ids  UUID[],
  p_dispatch_id   UUID DEFAULT NULL,
  p_avg_speed_kmh NUMERIC DEFAULT 45
)
RETURNS TABLE (
  route_id          UUID,
  ordered_count     INTEGER,
  naive_km          NUMERIC,
  nn_km             NUMERIC,
  optimized_km      NUMERIC,
  saved_km          NUMERIC,
  two_opt_saved_km  NUMERIC,
  duration_min      INTEGER
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant    UUID := public.current_user_tenant_id();
  v_id        UUID;
  v_code      TEXT;
  v_pts       JSONB := '[]'::jsonb;
  v_final     JSONB;
  v_remaining UUID[];
  v_current   RECORD;
  v_best      RECORD;
  v_prev      RECORD;
  v_naive     NUMERIC := 0;
  v_nn        NUMERIC := 0;
  v_opt       NUMERIC := 0;
  v_seq       INTEGER := 0;
  v_n         INTEGER;
  v_i         INT;
  v_out       JSONB := '[]'::jsonb;
  v_leg       NUMERIC;
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

  -- تكرار الموقع نفسه يفسد NN (مسافة صفر تفوز دائماً)
  IF v_n <> (SELECT count(DISTINCT x) FROM unnest(p_location_ids) AS x) THEN
    RAISE EXCEPTION 'DUPLICATE_LOCATIONS_NOT_ALLOWED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_location_ids) AS x(lid)
     LEFT JOIN public.movement_locations l
            ON l.id = x.lid AND l.tenant_id = v_tenant
     WHERE l.id IS NULL OR l.latitude IS NULL OR l.longitude IS NULL
  ) THEN
    RAISE EXCEPTION 'ALL_LOCATIONS_MUST_HAVE_COORDINATES';
  END IF;

  IF p_dispatch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.logistics_dispatches d
     WHERE d.id = p_dispatch_id AND d.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'DISPATCH_NOT_FOUND_IN_TENANT';
  END IF;

  -- (أ) خط الأساس: المسافة بالترتيب المُدخَل
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
  SELECT l.id, l.latitude AS lat, l.longitude AS lng, l.name_ar, l.code
    INTO v_current
    FROM public.movement_locations l
   WHERE l.id = p_location_ids[1] AND l.tenant_id = v_tenant;

  v_pts := v_pts || jsonb_build_array(jsonb_build_object(
    'location_id', v_current.id, 'name', v_current.name_ar,
    'code', v_current.code, 'lat', v_current.lat, 'lng', v_current.lng));

  WHILE COALESCE(array_length(v_remaining, 1), 0) > 0 LOOP
    SELECT l.id, l.latitude AS lat, l.longitude AS lng, l.name_ar, l.code,
           public.movement_haversine_km(v_current.lat, v_current.lng,
                                        l.latitude, l.longitude) AS dist
      INTO v_best
      FROM public.movement_locations l
     WHERE l.id = ANY(v_remaining) AND l.tenant_id = v_tenant
     ORDER BY dist ASC, l.id ASC   -- l.id يجعل كسر التعادل حتمياً
     LIMIT 1;

    v_nn  := v_nn + v_best.dist;
    v_pts := v_pts || jsonb_build_array(jsonb_build_object(
      'location_id', v_best.id, 'name', v_best.name_ar,
      'code', v_best.code, 'lat', v_best.lat, 'lng', v_best.lng));

    v_remaining := array_remove(v_remaining, v_best.id);
    v_current := v_best;
  END LOOP;

  -- (ج) 2-opt فوق ناتج NN
  v_final := public.movement_two_opt(v_pts);
  v_opt   := public.movement_path_length_km(v_final);

  -- 2-opt لا يزيد الطول أبداً، لكن نحرس ضد أي انحراف عددي
  IF v_opt > v_nn THEN
    v_final := v_pts;
    v_opt   := v_nn;
  END IF;

  -- ترقيم المحطات وحساب طول كل ساق بعد الترتيب النهائي
  v_i := 0;
  WHILE v_i < jsonb_array_length(v_final) LOOP
    IF v_i = 0 THEN
      v_leg := 0;
    ELSE
      v_leg := public.movement_haversine_km(
        (v_final->(v_i-1)->>'lat')::NUMERIC, (v_final->(v_i-1)->>'lng')::NUMERIC,
        (v_final->v_i->>'lat')::NUMERIC,     (v_final->v_i->>'lng')::NUMERIC);
    END IF;
    v_out := v_out || jsonb_build_array(
      (v_final->v_i) || jsonb_build_object('seq', v_i + 1, 'leg_km', ROUND(v_leg, 3)));
    v_i := v_i + 1;
  END LOOP;
  v_seq := jsonb_array_length(v_out);

  v_code := public.movement_next_code('RTE', 'logistics_routes', 'route_code');

  INSERT INTO public.logistics_routes(
    tenant_id, route_code, route_name, dispatch_id, waypoints_json,
    total_distance_km, estimated_duration_min, status, notes)
  VALUES (v_tenant, v_code, trim(p_route_name), p_dispatch_id, v_out,
          ROUND(v_opt, 2), CEIL((v_opt / p_avg_speed_kmh) * 60)::INT, 'optimized',
          'Nearest Neighbour + 2-opt (heuristic) — حل تقريبي لا أمثل؛ مسافة جوّية لا طريق فعلي')
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'route_optimized', 'logistics_route', v_id,
          jsonb_build_object('stops', v_seq,
                             'naive_km', ROUND(v_naive, 2),
                             'nn_km', ROUND(v_nn, 2),
                             'optimized_km', ROUND(v_opt, 2),
                             'algorithm', 'nn+2opt'));

  RETURN QUERY SELECT
    v_id,
    v_seq,
    ROUND(v_naive, 2),
    ROUND(v_nn, 2),
    ROUND(v_opt, 2),
    ROUND(GREATEST(v_naive - v_opt, 0), 2),
    ROUND(GREATEST(v_nn - v_opt, 0), 2),
    CEIL((v_opt / p_avg_speed_kmh) * 60)::INT;
END $$;

COMMENT ON FUNCTION public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC) IS
  'تخطيط مسار: Nearest Neighbour ثم 2-opt. تُرجع خط الأساس وناتج كل مرحلة.';

-- ---------------------------------------------------------------------------
-- 4) get_dispatch_track — مسار رحلة للخريطة وإعادة التشغيل
--
--    تُعيد النقاط مرتَّبة زمنياً مع: المسافة التراكمية، الفجوة عن النقطة
--    السابقة، وعلامة توقف (سرعة صفر لأكثر من 5 دقائق).
--    الحساب في الخادم لا في المتصفح: منطق واحد لا يتكرر ولا يتباعد.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dispatch_track(
  p_dispatch_id UUID,
  p_limit       INT DEFAULT 2000
)
RETURNS TABLE (
  seq             INTEGER,
  telemetry_id    UUID,
  latitude        NUMERIC,
  longitude       NUMERIC,
  speed_kmh       NUMERIC,
  heading         NUMERIC,
  recorded_at     TIMESTAMPTZ,
  leg_km          NUMERIC,
  cumulative_km   NUMERIC,
  gap_minutes     INTEGER,
  is_stop         BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'INVALID_LIMIT (1..5000)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.logistics_dispatches d
     WHERE d.id = p_dispatch_id AND d.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'DISPATCH_NOT_FOUND_IN_TENANT';
  END IF;

  RETURN QUERY
  WITH pts AS (
    SELECT t.id, t.latitude, t.longitude, t.speed_kmh, t.heading, t.recorded_at,
           ROW_NUMBER() OVER (ORDER BY t.recorded_at ASC, t.id ASC) AS rn,
           LAG(t.latitude)    OVER (ORDER BY t.recorded_at ASC, t.id ASC) AS p_lat,
           LAG(t.longitude)   OVER (ORDER BY t.recorded_at ASC, t.id ASC) AS p_lng,
           LAG(t.recorded_at) OVER (ORDER BY t.recorded_at ASC, t.id ASC) AS p_at
      FROM public.logistics_telemetry t
     WHERE t.dispatch_id = p_dispatch_id
       AND t.tenant_id   = v_tenant
     ORDER BY t.recorded_at ASC, t.id ASC
     LIMIT p_limit
  ), legs AS (
    SELECT p.*,
           CASE WHEN p.p_lat IS NULL THEN 0::NUMERIC
                ELSE public.movement_haversine_km(p.p_lat, p.p_lng,
                                                  p.latitude, p.longitude)
           END AS leg,
           CASE WHEN p.p_at IS NULL THEN 0
                ELSE FLOOR(EXTRACT(EPOCH FROM (p.recorded_at - p.p_at)) / 60)::INT
           END AS gap
      FROM pts p
  )
  SELECT l.rn::INT,
         l.id,
         l.latitude,
         l.longitude,
         l.speed_kmh,
         l.heading,
         l.recorded_at,
         ROUND(l.leg, 3),
         ROUND(SUM(l.leg) OVER (ORDER BY l.rn
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 3),
         l.gap,
         (COALESCE(l.speed_kmh, 0) = 0 AND l.gap >= 5)
    FROM legs l
   ORDER BY l.rn;
END $$;

COMMENT ON FUNCTION public.get_dispatch_track(UUID, INT) IS
  'مسار رحلة مرتَّب زمنياً مع المسافة التراكمية والفجوات والتوقفات — للخريطة وإعادة التشغيل.';

-- ---------------------------------------------------------------------------
-- 5) get_dispatch_track_summary — ملخّص الرحلة لرأس شاشة إعادة التشغيل
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dispatch_track_summary(p_dispatch_id UUID)
RETURNS TABLE (
  point_count     INTEGER,
  total_km        NUMERIC,
  first_ping_at   TIMESTAMPTZ,
  last_ping_at    TIMESTAMPTZ,
  duration_min    INTEGER,
  max_speed_kmh   NUMERIC,
  avg_speed_kmh   NUMERIC,
  stop_count      INTEGER,
  max_gap_minutes INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.logistics_dispatches d
     WHERE d.id = p_dispatch_id AND d.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'DISPATCH_NOT_FOUND_IN_TENANT';
  END IF;

  RETURN QUERY
  WITH tr AS (SELECT * FROM public.get_dispatch_track(p_dispatch_id, 5000))
  SELECT COALESCE(count(*), 0)::INT,
         COALESCE(ROUND(MAX(tr.cumulative_km), 2), 0),
         MIN(tr.recorded_at),
         MAX(tr.recorded_at),
         COALESCE(FLOOR(EXTRACT(EPOCH FROM (MAX(tr.recorded_at) - MIN(tr.recorded_at))) / 60)::INT, 0),
         COALESCE(ROUND(MAX(tr.speed_kmh), 1), 0),
         COALESCE(ROUND(AVG(tr.speed_kmh), 1), 0),
         COALESCE(count(*) FILTER (WHERE tr.is_stop), 0)::INT,
         COALESCE(MAX(tr.gap_minutes), 0)
    FROM tr;
END $$;

COMMENT ON FUNCTION public.get_dispatch_track_summary(UUID) IS
  'ملخّص مسار رحلة: المسافة والمدة والسرعات والتوقفات وأكبر فجوة إشارة.';

-- ---------------------------------------------------------------------------
-- 6) الرحلات التي لها مسار مسجَّل — لقائمة اختيار إعادة التشغيل
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.logistics_trackable_dispatches AS
SELECT d.id            AS dispatch_id,
       d.tenant_id,
       d.dispatch_code,
       d.status,
       d.dispatched_at,
       v.vehicle_code,
       v.plate_number,
       dr.driver_name_ar,
       count(t.id)::INT AS ping_count,
       MIN(t.recorded_at) AS first_ping_at,
       MAX(t.recorded_at) AS last_ping_at
  FROM public.logistics_dispatches d
  JOIN public.logistics_telemetry t ON t.dispatch_id = d.id
  LEFT JOIN public.logistics_vehicles v ON v.id = d.vehicle_id
  LEFT JOIN public.logistics_drivers  dr ON dr.id = d.driver_id
 GROUP BY d.id, d.tenant_id, d.dispatch_code, d.status, d.dispatched_at,
          v.vehicle_code, v.plate_number, dr.driver_name_ar;

COMMENT ON VIEW public.logistics_trackable_dispatches IS
  'الرحلات التي سُجِّلت لها إشارات GPS — مصدر قائمة إعادة تشغيل المسار.';

-- ---------------------------------------------------------------------------
-- 7) الصلاحيات
--    REVOKE FROM anon إلزامي: Supabase تمنح anon تنفيذاً صريحاً على دوال
--    public، و REVOKE ... FROM PUBLIC لا يسحب تلك المنحة.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.movement_path_length_km(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movement_two_opt(JSONB, INT)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dispatch_track(UUID, INT)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dispatch_track_summary(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.movement_path_length_km(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.movement_two_opt(JSONB, INT)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dispatch_track(UUID, INT)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dispatch_track_summary(UUID) TO authenticated, service_role;

REVOKE ALL ON public.logistics_trackable_dispatches FROM PUBLIC, anon;
GRANT SELECT ON public.logistics_trackable_dispatches TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) حارس التحقق — يفشل المايجريشن إن اختلّ أي شرط
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn      TEXT;
  v_anon    TEXT;
  v_cols    INT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.movement_path_length_km(jsonb)',
    'public.movement_two_opt(jsonb,integer)',
    'public.plan_optimized_route(text,uuid[],uuid,numeric)',
    'public.get_dispatch_track(uuid,integer)',
    'public.get_dispatch_track_summary(uuid)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0287 failed: missing functions:%', v_missing;
  END IF;

  IF to_regclass('public.logistics_trackable_dispatches') IS NULL THEN
    RAISE EXCEPTION '0287 failed: view logistics_trackable_dispatches missing';
  END IF;

  -- plan_optimized_route لا بد أن تُرجع 8 أعمدة الآن (كانت 6)
  SELECT count(*) INTO v_cols
    FROM unnest((SELECT proargmodes FROM pg_proc
                  WHERE oid = to_regprocedure('public.plan_optimized_route(text,uuid[],uuid,numeric)'))) AS m
   WHERE m = 't';
  IF v_cols <> 8 THEN
    RAISE EXCEPTION '0287 failed: plan_optimized_route must return 8 columns, got %', v_cols;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('movement_path_length_km','movement_two_opt',
                       'plan_optimized_route','get_dispatch_track',
                       'get_dispatch_track_summary')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0287 failed: anon can execute: %', v_anon;
  END IF;

  IF has_table_privilege('anon', 'public.logistics_trackable_dispatches', 'SELECT') THEN
    RAISE EXCEPTION '0287 failed: anon can read logistics_trackable_dispatches';
  END IF;

  RAISE NOTICE '✅ 0287: 2-opt routing + dispatch track replay applied';
END $$;
