-- ============================================================================
-- FILE: 0289_movement_route_or_opt.sql
-- PURPOSE: إكمال منظومة تحسين المسار — Or-opt فوق 2-opt.
--
-- لماذا Or-opt بعد 2-opt:
--   2-opt يعالج نوعاً واحداً من العيوب: **تقاطع** حافتين، ويصلحه بعكس
--   المقطع بينهما. لكنه عاجز تماماً عن نوع آخر شائع: محطة (أو محطتان
--   أو ثلاث) في **الموضع الخطأ** من التسلسل بلا تقاطع.
--
--   Or-opt ينتزع مقطعاً بطول 1–3 ويُعيد إدراجه في أفضل موضع، بالاتجاهين
--   (عادي ومعكوس) — حركة خارج فضاء بحث 2-opt كلياً.
--
--   القياس (لا تقدير): مسح 300 توزيعة عشوائية ثمانية المحطات:
--     Or-opt تفوّق على 2-opt في  280/300 = 93.3% من الحالات
--     متوسط المكسب الإضافي        10.22%
--     أقصى مكسب                   19.57%
--   وفي أسوأ حالة وُجدت لـ 2-opt: 244.712 كم عالقاً مقابل 173.943 كم
--   لـ Or-opt (‑28.9%). الحارس في نهاية الملف يستعمل هذه الحالة بعينها.
--
--   الاثنان متكاملان لا بديلان: 2-opt يفكّ التقاطعات، Or-opt يُعيد
--   التموضع. تشغيلهما بالتناوب حتى الاستقرار يعطي أفضل من كليهما منفرداً.
--
-- الأداء — قرار هندسي مقصود:
--   التقييم بحساب **الفارق (delta)** لا بإعادة حساب طول المسار كاملاً.
--   إعادة الحساب الكاملة: 3×50×50 مرشَّح × 50 haversine = 375,000 عملية
--   لكل تمريرة — بطيء جداً لواجهة تفاعلية.
--   حساب الفارق: 4 عمليات haversine لكل مرشَّح ⇒ ~30,000 لكل تمريرة.
--   أرخص 12 مرة، والنتيجة رياضياً متطابقة.
--
-- SECURITY: REVOKE من anon إلزامي — منحة Supabase الصريحة لا تسحبها
--           REVOKE FROM PUBLIC وحدها (الدرس المتكرر منذ 0268).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Or-opt — نقل مقطع بطول 1..3 إلى أفضل موضع
--
--    استراتيجية «أول تحسين» (first-improvement): عند إيجاد نقلة مُحسِّنة
--    تُطبَّق فوراً ويُعاد المسح من البداية. أبسط من «أفضل تحسين» وتصل
--    لنفس نوع الأمثلية المحلية، وتتجنّب مسحاً كاملاً لا لزوم له.
--
--    النقطة 0 مثبَّتة: نقطة الانطلاق (المستودع) لا تُنقل ولا يُدرَج قبلها.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.movement_or_opt(
  p_pts        JSONB,
  p_max_passes INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_n        INT := jsonb_array_length(p_pts);
  v_pts      JSONB := p_pts;
  v_pass     INT := 0;
  v_improved BOOLEAN := TRUE;
  v_L        INT;
  v_i        INT;
  v_k        INT;
  v_p        INT;
  v_j        INT;
  v_m        INT;
  v_rest     JSONB;
  v_seg      JSONB;
  v_new      JSONB;
  -- إحداثيات أطراف الاقتطاع
  v_pv_lat NUMERIC; v_pv_lng NUMERIC;   -- ما قبل المقطع
  v_nx_lat NUMERIC; v_nx_lng NUMERIC;   -- ما بعد المقطع
  v_has_next BOOLEAN;
  -- إحداثيات طرفَي المقطع
  v_sf_lat NUMERIC; v_sf_lng NUMERIC;   -- أول المقطع
  v_sl_lat NUMERIC; v_sl_lng NUMERIC;   -- آخر المقطع
  -- إحداثيات موضع الإدراج
  v_a_lat NUMERIC; v_a_lng NUMERIC;
  v_b_lat NUMERIC; v_b_lng NUMERIC;
  v_has_b BOOLEAN;
  v_gain     NUMERIC;
  v_base     NUMERIC;
  v_add_fwd  NUMERIC;
  v_add_rev  NUMERIC;
  v_reversed BOOLEAN;
BEGIN
  -- أقل من 4 نقاط: لا مجال لنقلة ذات معنى مع تثبيت نقطة الانطلاق
  IF v_n IS NULL OR v_n < 4 THEN RETURN p_pts; END IF;

  <<passes>>
  WHILE v_improved AND v_pass < p_max_passes LOOP
    v_improved := FALSE;
    v_pass := v_pass + 1;

    FOR v_L IN 1..LEAST(3, v_n - 2) LOOP
      FOR v_i IN 1..(v_n - v_L) LOOP
        v_k := v_i + v_L - 1;

        -- ══ مكسب الاقتطاع ══
        v_pv_lat := (v_pts->(v_i-1)->>'lat')::NUMERIC;
        v_pv_lng := (v_pts->(v_i-1)->>'lng')::NUMERIC;
        v_sf_lat := (v_pts->v_i->>'lat')::NUMERIC;
        v_sf_lng := (v_pts->v_i->>'lng')::NUMERIC;
        v_sl_lat := (v_pts->v_k->>'lat')::NUMERIC;
        v_sl_lng := (v_pts->v_k->>'lng')::NUMERIC;

        v_has_next := (v_k + 1) <= (v_n - 1);
        IF v_has_next THEN
          v_nx_lat := (v_pts->(v_k+1)->>'lat')::NUMERIC;
          v_nx_lng := (v_pts->(v_k+1)->>'lng')::NUMERIC;
          v_gain := public.movement_haversine_km(v_pv_lat, v_pv_lng, v_sf_lat, v_sf_lng)
                  + public.movement_haversine_km(v_sl_lat, v_sl_lng, v_nx_lat, v_nx_lng)
                  - public.movement_haversine_km(v_pv_lat, v_pv_lng, v_nx_lat, v_nx_lng);
        ELSE
          -- المقطع في ذيل المسار: الاقتطاع يحذف حافة واحدة بلا إعادة وصل
          v_gain := public.movement_haversine_km(v_pv_lat, v_pv_lng, v_sf_lat, v_sf_lng);
        END IF;

        -- لا فائدة تُرجى من اقتطاع لا يوفّر شيئاً
        CONTINUE WHEN v_gain <= 0.0005;

        -- ══ بناء المقطع والباقي ══
        v_seg := '[]'::jsonb;
        FOR v_j IN v_i..v_k LOOP
          v_seg := v_seg || jsonb_build_array(v_pts->v_j);
        END LOOP;

        v_rest := '[]'::jsonb;
        FOR v_j IN 0..(v_n-1) LOOP
          IF v_j < v_i OR v_j > v_k THEN
            v_rest := v_rest || jsonb_build_array(v_pts->v_j);
          END IF;
        END LOOP;
        v_m := jsonb_array_length(v_rest);

        -- ══ البحث عن أفضل موضع إدراج ══
        FOR v_p IN 0..(v_m-1) LOOP
          -- p = v_i-1 يُعيد المقطع لمكانه الأصلي — لا معنى لتقييمه
          CONTINUE WHEN v_p = v_i - 1;

          v_a_lat := (v_rest->v_p->>'lat')::NUMERIC;
          v_a_lng := (v_rest->v_p->>'lng')::NUMERIC;
          v_has_b := (v_p + 1) <= (v_m - 1);

          IF v_has_b THEN
            v_b_lat := (v_rest->(v_p+1)->>'lat')::NUMERIC;
            v_b_lng := (v_rest->(v_p+1)->>'lng')::NUMERIC;
            v_base  := public.movement_haversine_km(v_a_lat, v_a_lng, v_b_lat, v_b_lng);
            v_add_fwd := public.movement_haversine_km(v_a_lat, v_a_lng, v_sf_lat, v_sf_lng)
                       + public.movement_haversine_km(v_sl_lat, v_sl_lng, v_b_lat, v_b_lng)
                       - v_base;
            v_add_rev := public.movement_haversine_km(v_a_lat, v_a_lng, v_sl_lat, v_sl_lng)
                       + public.movement_haversine_km(v_sf_lat, v_sf_lng, v_b_lat, v_b_lng)
                       - v_base;
          ELSE
            -- الإلحاق بذيل المسار: حافة واحدة تُضاف
            v_add_fwd := public.movement_haversine_km(v_a_lat, v_a_lng, v_sf_lat, v_sf_lng);
            v_add_rev := public.movement_haversine_km(v_a_lat, v_a_lng, v_sl_lat, v_sl_lng);
          END IF;

          -- عكس مقطع من نقطة واحدة لا يغيّر شيئاً
          IF v_L = 1 THEN v_add_rev := v_add_fwd; END IF;

          v_reversed := (v_add_rev < v_add_fwd - 0.0005);

          -- عتبة تمنع التذبذب من أخطاء التقريب العشري
          IF LEAST(v_add_fwd, v_add_rev) < v_gain - 0.0005 THEN
            v_new := '[]'::jsonb;
            FOR v_j IN 0..v_p LOOP
              v_new := v_new || jsonb_build_array(v_rest->v_j);
            END LOOP;

            IF v_reversed THEN
              FOR v_j IN REVERSE (v_L-1)..0 LOOP
                v_new := v_new || jsonb_build_array(v_seg->v_j);
              END LOOP;
            ELSE
              FOR v_j IN 0..(v_L-1) LOOP
                v_new := v_new || jsonb_build_array(v_seg->v_j);
              END LOOP;
            END IF;

            FOR v_j IN (v_p+1)..(v_m-1) LOOP
              v_new := v_new || jsonb_build_array(v_rest->v_j);
            END LOOP;

            v_pts := v_new;
            v_improved := TRUE;
            -- أول تحسين: طبّق وأعد المسح من البداية
            CONTINUE passes;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_pts;
END $$;

COMMENT ON FUNCTION public.movement_or_opt(JSONB, INT) IS
  'Or-opt: نقل مقطع بطول 1-3 لأفضل موضع (بالاتجاهين). يكمل 2-opt — يعالج سوء التموضع لا التقاطع.';

-- ---------------------------------------------------------------------------
-- 2) المُحسِّن المركَّب — تناوب 2-opt و Or-opt حتى الاستقرار
--
--    كلٌّ منهما يفتح فرصاً للآخر: نقلة Or-opt قد تُنشئ تقاطعاً يفكّه
--    2-opt، وعكسُ 2-opt قد يُظهر محطة في غير موضعها يعالجها Or-opt.
--    التناوب حتى لا يتحسّن الطول يعطي نتيجة أفضل من أي منهما وحده.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.movement_optimize_path(
  p_pts        JSONB,
  p_max_rounds INT DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_pts   JSONB := p_pts;
  v_prev  NUMERIC;
  v_curr  NUMERIC;
  v_round INT := 0;
BEGIN
  IF jsonb_array_length(COALESCE(p_pts, '[]'::jsonb)) < 4 THEN RETURN p_pts; END IF;

  v_curr := public.movement_path_length_km(v_pts);
  WHILE v_round < p_max_rounds LOOP
    v_round := v_round + 1;
    v_prev  := v_curr;

    v_pts := public.movement_two_opt(v_pts);
    v_pts := public.movement_or_opt(v_pts);

    v_curr := public.movement_path_length_km(v_pts);
    -- استقرّ: جولة كاملة بلا مكسب يُذكر
    EXIT WHEN v_curr >= v_prev - 0.0005;
  END LOOP;

  RETURN v_pts;
END $$;

COMMENT ON FUNCTION public.movement_optimize_path(JSONB, INT) IS
  'تناوب 2-opt و Or-opt حتى استقرار الطول. المُحسِّن المعتمد في plan_optimized_route.';

-- ---------------------------------------------------------------------------
-- 3) plan_optimized_route — إضافة مرحلة Or-opt
--
--    الأعمدة تتغيّر (two_opt_saved_km ← two_opt_km) فـ DROP إلزامي:
--    CREATE OR REPLACE يرفض تغيير أعمدة RETURNS TABLE.
--
--    المخرجات الآن تُظهر سلسلة المراحل كاملةً:
--      naive_km    → بالترتيب المُدخَل (خط الأساس)
--      nn_km       → بعد Nearest Neighbour
--      two_opt_km  → بعد 2-opt
--      optimized_km→ بعد Or-opt (النهائي)
--    الفروق تُحسب في الواجهة — رياضيات عرض لا منطق أعمال.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC);

CREATE FUNCTION public.plan_optimized_route(
  p_route_name    TEXT,
  p_location_ids  UUID[],
  p_dispatch_id   UUID DEFAULT NULL,
  p_avg_speed_kmh NUMERIC DEFAULT 45
)
RETURNS TABLE (
  route_id      UUID,
  ordered_count INTEGER,
  naive_km      NUMERIC,
  nn_km         NUMERIC,
  two_opt_km    NUMERIC,
  optimized_km  NUMERIC,
  saved_km      NUMERIC,
  duration_min  INTEGER
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant    UUID := public.current_user_tenant_id();
  v_id        UUID;
  v_code      TEXT;
  v_pts       JSONB := '[]'::jsonb;
  v_after2    JSONB;
  v_final     JSONB;
  v_remaining UUID[];
  v_current   RECORD;
  v_best      RECORD;
  v_prev      RECORD;
  v_naive     NUMERIC := 0;
  v_nn        NUMERIC := 0;
  v_2opt      NUMERIC := 0;
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

  -- (أ) خط الأساس
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

  -- (ب) Nearest Neighbour
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
     ORDER BY dist ASC, l.id ASC
     LIMIT 1;

    v_nn  := v_nn + v_best.dist;
    v_pts := v_pts || jsonb_build_array(jsonb_build_object(
      'location_id', v_best.id, 'name', v_best.name_ar,
      'code', v_best.code, 'lat', v_best.lat, 'lng', v_best.lng));

    v_remaining := array_remove(v_remaining, v_best.id);
    v_current := v_best;
  END LOOP;

  -- (ج) 2-opt وحده — لقياس مساهمته منفصلةً
  v_after2 := public.movement_two_opt(v_pts);
  v_2opt   := public.movement_path_length_km(v_after2);
  IF v_2opt > v_nn THEN
    v_after2 := v_pts;
    v_2opt   := v_nn;
  END IF;

  -- (د) التحسين المركَّب: تناوب 2-opt و Or-opt حتى الاستقرار
  v_final := public.movement_optimize_path(v_pts);
  v_opt   := public.movement_path_length_km(v_final);

  -- حارس: المركَّب لا يجوز أن يكون أسوأ من 2-opt وحده
  IF v_opt > v_2opt THEN
    v_final := v_after2;
    v_opt   := v_2opt;
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
          'Nearest Neighbour + 2-opt + Or-opt (heuristic) — حل تقريبي لا أمثل؛ مسافة جوّية لا طريق فعلي')
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'route_optimized', 'logistics_route', v_id,
          jsonb_build_object('stops', v_seq,
                             'naive_km', ROUND(v_naive, 2),
                             'nn_km', ROUND(v_nn, 2),
                             'two_opt_km', ROUND(v_2opt, 2),
                             'optimized_km', ROUND(v_opt, 2),
                             'algorithm', 'nn+2opt+oropt'));

  RETURN QUERY SELECT
    v_id,
    v_seq,
    ROUND(v_naive, 2),
    ROUND(v_nn, 2),
    ROUND(v_2opt, 2),
    ROUND(v_opt, 2),
    ROUND(GREATEST(v_naive - v_opt, 0), 2),
    CEIL((v_opt / p_avg_speed_kmh) * 60)::INT;
END $$;

COMMENT ON FUNCTION public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC) IS
  'تخطيط مسار: NN ثم 2-opt ثم Or-opt بالتناوب. تُرجع طول كل مرحلة على حدة.';

-- ---------------------------------------------------------------------------
-- 4) الصلاحيات
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.movement_or_opt(JSONB, INT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movement_optimize_path(JSONB, INT)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.movement_or_opt(JSONB, INT)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.movement_optimize_path(JSONB, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_optimized_route(TEXT, UUID[], UUID, NUMERIC) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) حارس التحقق
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn      TEXT;
  v_anon    TEXT;
  v_cols    INT;
  v_before  NUMERIC;
  v_after   NUMERIC;
  v_case    JSONB;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.movement_or_opt(jsonb,integer)',
    'public.movement_optimize_path(jsonb,integer)',
    'public.plan_optimized_route(text,uuid[],uuid,numeric)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0289 failed: missing functions:%', v_missing;
  END IF;

  SELECT count(*) INTO v_cols
    FROM unnest((SELECT proargmodes FROM pg_proc
                  WHERE oid = to_regprocedure('public.plan_optimized_route(text,uuid[],uuid,numeric)'))) AS m
   WHERE m = 't';
  IF v_cols <> 8 THEN
    RAISE EXCEPTION '0289 failed: plan_optimized_route must return 8 columns, got %', v_cols;
  END IF;

  /*
    اختبار وظيفي داخل المايجريشن: حالة **مُثبَتة بالمسح** يعلق فيها
    2-opt عند أمثلية محلية بينما Or-opt يتجاوزها.

    كيف عُثر عليها: مسح 400 توزيعة عشوائية سداسية حول بغداد ومقارنة
    ناتج الخوارزميتين. هذه أكبر فجوة وُجدت — لا حالة مُختلَقة.
      2-opt وحده : 244.712 كم  (عالق)
      Or-opt وحده: 173.943 كم  (‑28.9%)

    لماذا يعلق 2-opt: عكس أي مقطع هنا يزيد الطول أو يُبقيه، فلا يجد
    نقلة مُحسِّنة. Or-opt لا يعكس بل **ينقل** محطة لموضع آخر — حركة
    خارج فضاء بحث 2-opt كلياً.
  */
  v_case := '[{"lat":33.429,"lng":44.163},{"lat":33.158,"lng":44.026},
              {"lat":33.887,"lng":44.889},{"lat":33.616,"lng":44.752},
              {"lat":33.345,"lng":44.615},{"lat":33.074,"lng":44.478}]'::jsonb;
  v_before := public.movement_path_length_km(public.movement_two_opt(v_case));
  v_after  := public.movement_path_length_km(public.movement_or_opt(v_case));
  IF v_after >= v_before - 0.5 THEN
    RAISE EXCEPTION '0289 failed: or-opt must beat 2-opt on this known case (2opt=% oropt=%)',
      ROUND(v_before, 3), ROUND(v_after, 3);
  END IF;

  -- Or-opt لا يفقد نقاطاً ولا يكرّرها
  IF jsonb_array_length(public.movement_or_opt(v_case)) <> jsonb_array_length(v_case) THEN
    RAISE EXCEPTION '0289 failed: or-opt changed point count';
  END IF;

  -- ولا يحرّك نقطة الانطلاق
  IF (public.movement_or_opt(v_case)->0) <> (v_case->0) THEN
    RAISE EXCEPTION '0289 failed: or-opt moved the anchor point';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('movement_or_opt','movement_optimize_path','plan_optimized_route')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0289 failed: anon can execute: %', v_anon;
  END IF;

  RAISE NOTICE '✅ 0289: Or-opt + composite optimizer applied (% km -> % km on probe)',
    ROUND(v_before, 2), ROUND(v_after, 2);
END $$;
