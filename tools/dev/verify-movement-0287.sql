-- ============================================================================
-- اختبار سلوكي للمايجريشن 0287 — الجولة السادسة
-- يُشغَّل على Postgres محلي بعد تطبيق كل المايجريشنات.
-- كل تأكيد يرفع استثناءً عند الفشل — لا نتائج "تبدو صحيحة".
-- ============================================================================
\set ON_ERROR_STOP on

DO $outer$
DECLARE
  v_tenant  UUID;
  v_user    UUID;
  v_tenant2 UUID;
  v_user2   UUID;
  v_loc     UUID[];
  v_veh     UUID;
  v_drv     UUID;
  v_ord     UUID;
  v_disp    UUID;
  v_r       RECORD;
  v_n       INT;
  v_txt     TEXT;
  v_pts     JSONB;
  v_len_before NUMERIC;
  v_len_after  NUMERIC;
  v_pass    INT := 0;
BEGIN
  -- ══ التهيئة ══
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-0287-A', 't0287a')
    RETURNING id INTO v_tenant;
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-0287-B', 't0287b')
    RETURNING id INTO v_tenant2;

  INSERT INTO auth.users(id, email) VALUES (gen_random_uuid(), 'r6a@test.local')
    RETURNING id INTO v_user;
  INSERT INTO auth.users(id, email) VALUES (gen_random_uuid(), 'r6b@test.local')
    RETURNING id INTO v_user2;

  INSERT INTO public.profiles(id, tenant_id, full_name, role)
    VALUES (v_user, v_tenant, 'مخطط المسارات', 'logistics');
  INSERT INTO public.profiles(id, tenant_id, full_name, role)
    VALUES (v_user2, v_tenant2, 'مستاجر اخر', 'logistics');

-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments(tenant_id, user_id, portal_role, is_active)
    VALUES (v_tenant, v_user, 'logistics', true)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;
  INSERT INTO public.movement_role_assignments(tenant_id, user_id, portal_role, is_active)
    VALUES (v_tenant2, v_user2, 'logistics', true)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, false);

  -- ══════════════════════════════════════════════════════════════════
  -- المجموعة 1: movement_path_length_km
  -- ══════════════════════════════════════════════════════════════════

  -- 1) مسار فارغ = 0
  IF public.movement_path_length_km('[]'::jsonb) <> 0 THEN
    RAISE EXCEPTION 'T1 FAILED: empty path must be 0';
  END IF; v_pass := v_pass + 1;

  -- 2) نقطة واحدة = 0
  IF public.movement_path_length_km('[{"lat":33.3,"lng":44.4}]'::jsonb) <> 0 THEN
    RAISE EXCEPTION 'T2 FAILED: single point must be 0';
  END IF; v_pass := v_pass + 1;

  -- 3) نقطتان = مسافة Haversine بينهما بالضبط
  IF public.movement_path_length_km(
       '[{"lat":33.0,"lng":44.0},{"lat":34.0,"lng":44.0}]'::jsonb)
     <> public.movement_haversine_km(33.0, 44.0, 34.0, 44.0) THEN
    RAISE EXCEPTION 'T3 FAILED: two-point path must equal haversine';
  END IF; v_pass := v_pass + 1;

  -- ══════════════════════════════════════════════════════════════════
  -- المجموعة 2: movement_two_opt — جوهر التحسين
  -- ══════════════════════════════════════════════════════════════════

  -- 4) أقل من 4 نقاط تُعاد كما هي
  v_pts := '[{"lat":33.0,"lng":44.0},{"lat":33.1,"lng":44.0},{"lat":33.2,"lng":44.0}]'::jsonb;
  IF public.movement_two_opt(v_pts) <> v_pts THEN
    RAISE EXCEPTION 'T4 FAILED: <4 points must be returned unchanged';
  END IF; v_pass := v_pass + 1;

  -- 5) مسار متقاطع: 2-opt يجب أن يُقصّره فعلياً
  --    مربع بترتيب متقاطع (0,0) → (1,1) → (1,0) → (0,1)
  v_pts := '[{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":1,"lng":0},{"lat":0,"lng":1}]'::jsonb;
  v_len_before := public.movement_path_length_km(v_pts);
  v_len_after  := public.movement_path_length_km(public.movement_two_opt(v_pts));
  IF v_len_after >= v_len_before THEN
    RAISE EXCEPTION 'T5 FAILED: 2-opt must shorten crossed path (% -> %)',
      v_len_before, v_len_after;
  END IF;
  RAISE NOTICE '   2-opt: % كم -> % كم (تحسين %%%)',
    ROUND(v_len_before,2), ROUND(v_len_after,2),
    ROUND((v_len_before - v_len_after) / v_len_before * 100, 1);
  v_pass := v_pass + 1;

  -- 6) النقطة الأولى تبقى مثبَّتة بعد 2-opt
  IF (public.movement_two_opt(v_pts)->0) <> (v_pts->0) THEN
    RAISE EXCEPTION 'T6 FAILED: first point must stay anchored';
  END IF; v_pass := v_pass + 1;

  -- 7) عدد النقاط محفوظ (لا فقدان ولا تكرار)
  IF jsonb_array_length(public.movement_two_opt(v_pts)) <> jsonb_array_length(v_pts) THEN
    RAISE EXCEPTION 'T7 FAILED: 2-opt changed point count';
  END IF; v_pass := v_pass + 1;

  -- 8) مسار مثالي أصلاً لا يتغيّر (idempotent)
  v_pts := '[{"lat":0,"lng":0},{"lat":0,"lng":1},{"lat":0,"lng":2},{"lat":0,"lng":3}]'::jsonb;
  IF public.movement_two_opt(v_pts) <> v_pts THEN
    RAISE EXCEPTION 'T8 FAILED: already-optimal path must not change';
  END IF; v_pass := v_pass + 1;

  -- 9) تطبيق 2-opt مرتين لا يُحسّن أكثر (وصل لأمثلية محلية)
  v_pts := '[{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":1,"lng":0},{"lat":0,"lng":1}]'::jsonb;
  IF public.movement_path_length_km(public.movement_two_opt(public.movement_two_opt(v_pts)))
     <> public.movement_path_length_km(public.movement_two_opt(v_pts)) THEN
    RAISE EXCEPTION 'T9 FAILED: 2-opt not converged after one call';
  END IF; v_pass := v_pass + 1;

  -- ══════════════════════════════════════════════════════════════════
  -- المجموعة 3: plan_optimized_route
  -- ══════════════════════════════════════════════════════════════════

  -- مواقع بترتيب مُدخَل سيّئ عمداً (زجزاج عبر بغداد)
  v_loc := ARRAY[]::UUID[];
  FOR v_r IN
    SELECT * FROM (VALUES
      ('المستودع المركزي', 33.3152, 44.3661),
      ('الكرادة',          33.3020, 44.4200),
      ('الأعظمية',         33.3700, 44.3600),
      ('الدورة',           33.2500, 44.4000),
      ('الكاظمية',         33.3800, 44.3300),
      ('زيونة',            33.3300, 44.4400)
    ) AS t(nm, la, lo)
  LOOP
    v_loc := v_loc || (SELECT (public.create_movement_location(
      v_r.nm, 'checkpoint', NULL, v_r.la, v_r.lo, 100, NULL)));
  END LOOP;

  IF array_length(v_loc, 1) <> 6 THEN
    RAISE EXCEPTION 'SETUP FAILED: expected 6 locations, got %', array_length(v_loc,1);
  END IF;

  -- 10) الدالة تعمل وتُرجع 8 أعمدة
  SELECT * INTO v_r FROM public.plan_optimized_route('مسار توزيع بغداد', v_loc, NULL, 45);
  IF v_r.route_id IS NULL THEN
    RAISE EXCEPTION 'T10 FAILED: no route_id returned';
  END IF; v_pass := v_pass + 1;

  -- 11) كل المحطات موجودة في الناتج
  IF v_r.ordered_count <> 6 THEN
    RAISE EXCEPTION 'T11 FAILED: ordered_count % <> 6', v_r.ordered_count;
  END IF; v_pass := v_pass + 1;

  -- 12) التحسين لم يزد الطول عن خط الأساس
  IF v_r.optimized_km > v_r.naive_km THEN
    RAISE EXCEPTION 'T12 FAILED: optimized (%) > naive (%)',
      v_r.optimized_km, v_r.naive_km;
  END IF; v_pass := v_pass + 1;

  -- 13) التحسين لم يُفسد ناتج NN
  IF v_r.optimized_km > v_r.nn_km THEN
    RAISE EXCEPTION 'T13 FAILED: optimizer made it worse (nn=% opt=%)',
      v_r.nn_km, v_r.optimized_km;
  END IF; v_pass := v_pass + 1;

  -- 14) الحسابات المُعادة متسقة رياضياً
  IF v_r.saved_km <> ROUND(GREATEST(v_r.naive_km - v_r.optimized_km, 0), 2) THEN
    RAISE EXCEPTION 'T14 FAILED: saved_km inconsistent';
  END IF;
  /*
    ⚠️ محدَّث في الجولة السابعة: 0289 استبدل العمود two_opt_saved_km
    بـ two_opt_km (طول المرحلة لا الفارق). الفروق تُحسب في الواجهة.
    نتحقق الآن من ترتيب المراحل: 2-opt لا يُنتج أقصر من الناتج النهائي.
  */
  IF v_r.two_opt_km < v_r.optimized_km - 0.001 THEN
    RAISE EXCEPTION 'T14b FAILED: final (%) worse than 2-opt stage (%)',
      v_r.optimized_km, v_r.two_opt_km;
  END IF; v_pass := v_pass + 1;

  RAISE NOTICE '   المسار: أساس % | NN % | 2opt % | نهائي % كم (وفر %)',
    v_r.naive_km, v_r.nn_km, v_r.two_opt_km, v_r.optimized_km, v_r.saved_km;

  -- 15) الطول المخزَّن = الطول المحسوب من النقاط المخزَّنة (لا تزوير)
  SELECT waypoints_json, total_distance_km INTO v_pts, v_len_before
    FROM public.logistics_routes WHERE id = v_r.route_id;
  IF ABS(public.movement_path_length_km(v_pts) - v_len_before) > 0.05 THEN
    RAISE EXCEPTION 'T15 FAILED: stored distance % <> path length %',
      v_len_before, public.movement_path_length_km(v_pts);
  END IF; v_pass := v_pass + 1;

  -- 16) كل نقطة لها seq و leg_km و location_id
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_pts) AS e
     WHERE e->>'seq' IS NULL OR e->>'leg_km' IS NULL OR e->>'location_id' IS NULL
  ) THEN
    RAISE EXCEPTION 'T16 FAILED: waypoint missing seq/leg_km/location_id';
  END IF; v_pass := v_pass + 1;

  -- 17) التسلسل 1..n بلا فجوات
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_pts) AS e
   WHERE (e->>'seq')::INT BETWEEN 1 AND 6;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'T17 FAILED: seq not 1..6';
  END IF; v_pass := v_pass + 1;

  -- 18) رفض المواقع المكرَّرة (كان ثغرة في 0285)
  BEGIN
    PERFORM public.plan_optimized_route('مكرر', ARRAY[v_loc[1], v_loc[1], v_loc[2]], NULL, 45);
    RAISE EXCEPTION 'T18 FAILED: duplicates accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DUPLICATE_LOCATIONS%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 19) رفض موقع بلا إحداثيات
  DECLARE v_bad UUID;
  BEGIN
    v_bad := public.create_movement_location('بلا إحداثيات', 'office', NULL, NULL, NULL, 50, NULL);
    BEGIN
      PERFORM public.plan_optimized_route('سيء', ARRAY[v_loc[1], v_bad], NULL, 45);
      RAISE EXCEPTION 'T19 FAILED: location without coords accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%MUST_HAVE_COORDINATES%' THEN RAISE; END IF;
    END;
  END; v_pass := v_pass + 1;

  -- 20) رفض موقع واحد
  BEGIN
    PERFORM public.plan_optimized_route('واحد', ARRAY[v_loc[1]], NULL, 45);
    RAISE EXCEPTION 'T20 FAILED: single location accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%AT_LEAST_TWO%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 21) رفض سرعة صفر أو سالبة (قسمة على صفر)
  BEGIN
    PERFORM public.plan_optimized_route('سرعة صفر', v_loc[1:3], NULL, 0);
    RAISE EXCEPTION 'T21 FAILED: zero speed accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_AVG_SPEED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 22) رفض اسم قصير
  BEGIN
    PERFORM public.plan_optimized_route('أ', v_loc[1:3], NULL, 45);
    RAISE EXCEPTION 'T22 FAILED: short name accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ROUTE_NAME_REQUIRED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  /*
    23) حدث تدقيق مسجَّل بالخوارزمية الصحيحة.
    محدَّث في الجولة السابعة: 0289 غيّر الوسم من 'nn+2opt' إلى
    'nn+2opt+oropt'. نقبل الاثنين حتى يبقى الملف صالحاً لأي قاعدة
    طُبِّق عليها 0287 دون 0289.
  */
  IF NOT EXISTS (
    SELECT 1 FROM public.movement_audit_events
     WHERE entity_id = v_r.route_id AND event_type = 'route_optimized'
       AND payload->>'algorithm' IN ('nn+2opt', 'nn+2opt+oropt')
  ) THEN
    RAISE EXCEPTION 'T23 FAILED: audit event missing or wrong algorithm';
  END IF; v_pass := v_pass + 1;

  -- ══════════════════════════════════════════════════════════════════
  -- المجموعة 4: get_dispatch_track
  -- ══════════════════════════════════════════════════════════════════

  v_veh := public.create_fleet_vehicle('TRK-R6', 'Volvo', 'FH16', 2022, 'truck',
             'diesel', 12000, 40, 0);
  v_drv := public.create_fleet_driver('سائق الجولة السادسة', 'LIC-R6', 'heavy',
             (CURRENT_DATE + 400)::date, '07700000006', NULL);
  v_ord := public.create_shipment_order('بغداد - المستودع', 'بغداد - الكرادة',
             'شحنة اختبار', 3000, 12, 'normal',
             (now() + interval '1 day'), NULL, NULL, NULL);
  v_disp := public.dispatch_shipment_order(v_ord, v_veh, v_drv, (now() + interval '4 hours'), NULL);

  -- إشارات GPS: 5 نقاط، منها توقف طويل
  PERFORM public.record_vehicle_telemetry(v_veh, 33.3152, 44.3661, 40, 90, v_disp);
  UPDATE public.logistics_telemetry SET recorded_at = now() - interval '50 minutes'
   WHERE dispatch_id = v_disp AND recorded_at > now() - interval '1 minute';

  PERFORM public.record_vehicle_telemetry(v_veh, 33.3200, 44.3800, 55, 90, v_disp);
  UPDATE public.logistics_telemetry SET recorded_at = now() - interval '40 minutes'
   WHERE dispatch_id = v_disp AND recorded_at > now() - interval '1 minute';

  PERFORM public.record_vehicle_telemetry(v_veh, 33.3250, 44.3950, 0, 90, v_disp);
  UPDATE public.logistics_telemetry SET recorded_at = now() - interval '20 minutes'
   WHERE dispatch_id = v_disp AND recorded_at > now() - interval '1 minute';

  PERFORM public.record_vehicle_telemetry(v_veh, 33.3300, 44.4100, 60, 90, v_disp);
  UPDATE public.logistics_telemetry SET recorded_at = now() - interval '10 minutes'
   WHERE dispatch_id = v_disp AND recorded_at > now() - interval '1 minute';

  PERFORM public.record_vehicle_telemetry(v_veh, 33.3350, 44.4250, 45, 90, v_disp);

  -- 24) خمس نقاط تُعاد
  SELECT count(*) INTO v_n FROM public.get_dispatch_track(v_disp);
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'T24 FAILED: expected 5 track points, got %', v_n;
  END IF; v_pass := v_pass + 1;

  -- 25) الترتيب زمني تصاعدي
  IF EXISTS (
    SELECT 1 FROM (
      SELECT recorded_at, LAG(recorded_at) OVER (ORDER BY seq) AS prev
        FROM public.get_dispatch_track(v_disp)) x
     WHERE prev IS NOT NULL AND recorded_at < prev
  ) THEN
    RAISE EXCEPTION 'T25 FAILED: track not chronologically ordered';
  END IF; v_pass := v_pass + 1;

  -- 26) أول نقطة: leg=0 و cumulative=0
  SELECT * INTO v_r FROM public.get_dispatch_track(v_disp) WHERE seq = 1;
  IF v_r.leg_km <> 0 OR v_r.cumulative_km <> 0 THEN
    RAISE EXCEPTION 'T26 FAILED: first point must have zero leg/cumulative';
  END IF; v_pass := v_pass + 1;

  -- 27) المسافة التراكمية غير تناقصية
  IF EXISTS (
    SELECT 1 FROM (
      SELECT cumulative_km, LAG(cumulative_km) OVER (ORDER BY seq) AS prev
        FROM public.get_dispatch_track(v_disp)) x
     WHERE prev IS NOT NULL AND cumulative_km < prev
  ) THEN
    RAISE EXCEPTION 'T27 FAILED: cumulative distance decreased';
  END IF; v_pass := v_pass + 1;

  -- 28) التراكمي النهائي = مجموع السيقان
  SELECT MAX(cumulative_km) INTO v_len_before FROM public.get_dispatch_track(v_disp);
  SELECT SUM(leg_km)        INTO v_len_after  FROM public.get_dispatch_track(v_disp);
  IF ABS(v_len_before - v_len_after) > 0.01 THEN
    RAISE EXCEPTION 'T28 FAILED: cumulative % <> sum of legs %', v_len_before, v_len_after;
  END IF; v_pass := v_pass + 1;

  -- 29) التوقف مرصود (سرعة صفر + فجوة >= 5 دقائق)
  SELECT count(*) INTO v_n FROM public.get_dispatch_track(v_disp) WHERE is_stop;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'T29 FAILED: stop not detected';
  END IF; v_pass := v_pass + 1;

  -- 30) رفض حد خارج المدى
  BEGIN
    PERFORM public.get_dispatch_track(v_disp, 99999);
    RAISE EXCEPTION 'T30 FAILED: oversized limit accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_LIMIT%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- ══════════════════════════════════════════════════════════════════
  -- المجموعة 5: get_dispatch_track_summary
  -- ══════════════════════════════════════════════════════════════════

  SELECT * INTO v_r FROM public.get_dispatch_track_summary(v_disp);

  -- 31) عدد النقاط مطابق
  IF v_r.point_count <> 5 THEN
    RAISE EXCEPTION 'T31 FAILED: summary point_count % <> 5', v_r.point_count;
  END IF; v_pass := v_pass + 1;

  -- 32) المسافة الكلية = أقصى تراكمي
  SELECT MAX(cumulative_km) INTO v_len_before FROM public.get_dispatch_track(v_disp);
  IF ABS(v_r.total_km - ROUND(v_len_before, 2)) > 0.01 THEN
    RAISE EXCEPTION 'T32 FAILED: summary total_km % <> track max %',
      v_r.total_km, v_len_before;
  END IF; v_pass := v_pass + 1;

  -- 33) أقصى سرعة = 60 (أعلى قيمة سُجِّلت)
  IF v_r.max_speed_kmh <> 60 THEN
    RAISE EXCEPTION 'T33 FAILED: max_speed % <> 60', v_r.max_speed_kmh;
  END IF; v_pass := v_pass + 1;

  -- 34) المدة موجبة والتوقفات مرصودة
  IF v_r.duration_min <= 0 THEN
    RAISE EXCEPTION 'T34 FAILED: duration must be positive, got %', v_r.duration_min;
  END IF;
  IF v_r.stop_count < 1 THEN
    RAISE EXCEPTION 'T34b FAILED: stop_count must be >= 1';
  END IF; v_pass := v_pass + 1;

  RAISE NOTICE '   الرحلة: % نقطة | % كم | % دقيقة | أقصى سرعة % | % توقف | أكبر فجوة % د',
    v_r.point_count, v_r.total_km, v_r.duration_min,
    v_r.max_speed_kmh, v_r.stop_count, v_r.max_gap_minutes;

  -- ══════════════════════════════════════════════════════════════════
  -- المجموعة 6: العزل والأمان
  -- ══════════════════════════════════════════════════════════════════

  -- 35) العرض يُظهر الرحلة لمستأجرها
  SELECT count(*) INTO v_n FROM public.logistics_trackable_dispatches
   WHERE dispatch_id = v_disp AND tenant_id = v_tenant;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T35 FAILED: dispatch not in trackable view';
  END IF; v_pass := v_pass + 1;

  -- 36) عدد الإشارات في العرض صحيح
  SELECT ping_count INTO v_n FROM public.logistics_trackable_dispatches
   WHERE dispatch_id = v_disp;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'T36 FAILED: view ping_count % <> 5', v_n;
  END IF; v_pass := v_pass + 1;

  -- 37) مستأجر آخر لا يصل لمسار هذه الرحلة
  PERFORM set_config('request.jwt.claim.sub', v_user2::text, false);
  BEGIN
    PERFORM public.get_dispatch_track(v_disp);
    RAISE EXCEPTION 'T37 FAILED: cross-tenant track access allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DISPATCH_NOT_FOUND_IN_TENANT%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 38) ولا لملخّصها
  BEGIN
    PERFORM public.get_dispatch_track_summary(v_disp);
    RAISE EXCEPTION 'T38 FAILED: cross-tenant summary access allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DISPATCH_NOT_FOUND_IN_TENANT%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 39) ولا يربط مساراً برحلة ليست له
  BEGIN
    PERFORM public.plan_optimized_route('اختراق', v_loc[1:2], v_disp, 45);
    RAISE EXCEPTION 'T39 FAILED: cross-tenant dispatch link allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DISPATCH_NOT_FOUND_IN_TENANT%'
       AND SQLERRM NOT LIKE '%MUST_HAVE_COORDINATES%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, false);

  -- 40) بلا دور لوجستي = ممنوع
  UPDATE public.movement_role_assignments SET is_active = false
   WHERE user_id = v_user AND tenant_id = v_tenant;
  BEGIN
    PERFORM public.get_dispatch_track(v_disp);
    RAISE EXCEPTION 'T40 FAILED: revoked role can still read track';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'T40 FAILED%' THEN RAISE; END IF;
  END;
  UPDATE public.movement_role_assignments SET is_active = true
   WHERE user_id = v_user AND tenant_id = v_tenant;
  v_pass := v_pass + 1;

  -- 41) anon لا ينفّذ أياً من الدوال الخمس
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('movement_path_length_km','movement_two_opt',
                       'plan_optimized_route','get_dispatch_track',
                       'get_dispatch_track_summary')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'T41 FAILED: anon can execute %', v_txt;
  END IF; v_pass := v_pass + 1;

  -- 42) anon لا يقرأ عرض الرحلات القابلة للتتبع
  IF has_table_privilege('anon', 'public.logistics_trackable_dispatches', 'SELECT') THEN
    RAISE EXCEPTION 'T42 FAILED: anon can read trackable dispatches view';
  END IF; v_pass := v_pass + 1;

  -- 43) authenticated يقرأ العرض (وإلا الواجهة لن تعمل)
  IF NOT has_table_privilege('authenticated', 'public.logistics_trackable_dispatches', 'SELECT') THEN
    RAISE EXCEPTION 'T43 FAILED: authenticated cannot read trackable view';
  END IF; v_pass := v_pass + 1;

  -- 44) الدالتان STABLE لا تكتبان (تحقّق من التصنيف)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_dispatch_track','get_dispatch_track_summary')
       AND p.provolatile <> 's'
  ) THEN
    RAISE EXCEPTION 'T44 FAILED: track functions must be STABLE';
  END IF; v_pass := v_pass + 1;

  -- 45) رحلة بلا إشارات: ملخّص أصفار لا خطأ
  DECLARE v_disp2 UUID; v_ord2 UUID; v_veh2 UUID; v_drv2 UUID;
  BEGIN
    -- مركبة وسائق آخران: الأولان مشغولان بالرحلة السابقة (on_trip)
    v_veh2 := public.create_fleet_vehicle('TRK-R6B', 'Scania', 'R450', 2023,
                'truck', 'diesel', 10000, 35, 0);
    v_drv2 := public.create_fleet_driver('سائق بلا تتبع', 'LIC-R6B', 'heavy',
                (CURRENT_DATE + 400)::date, '07700000007', NULL);
    v_ord2  := public.create_shipment_order('بغداد', 'الموصل',
                 'شحنة بلا تتبع', 1000, 5, 'normal',
                 (now() + interval '2 days'), NULL, NULL, NULL);
    v_disp2 := public.dispatch_shipment_order(v_ord2, v_veh2, v_drv2,
                 (now() + interval '8 hours'), NULL);
    SELECT * INTO v_r FROM public.get_dispatch_track_summary(v_disp2);
    IF v_r.point_count <> 0 OR v_r.total_km <> 0 THEN
      RAISE EXCEPTION 'T45 FAILED: empty track summary must be zeros, got % pts % km',
        v_r.point_count, v_r.total_km;
    END IF;
  END; v_pass := v_pass + 1;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  ✅ 0287: % / 45 اختباراً نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════';
END $outer$;
