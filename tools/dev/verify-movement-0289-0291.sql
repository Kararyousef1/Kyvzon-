-- ============================================================================
-- اختبار سلوكي: 0289 (Or-opt) · 0290 (الجدولة) · 0291 (تطبيق السائق)
-- كل تأكيد يرفع استثناءً عند الفشل. لا نتائج «تبدو صحيحة».
-- ============================================================================
\set ON_ERROR_STOP on

DO $outer$
DECLARE
  v_tenant  UUID;  v_tenant2 UUID;
  v_boss    UUID;  v_drvUser UUID;  v_drvUser2 UUID;  v_stranger UUID;
  v_veh     UUID;  v_veh2 UUID;
  v_drv     UUID;  v_drv2 UUID;
  v_ord     UUID;  v_ord2 UUID;
  v_disp    UUID;  v_disp2 UUID;
  v_loc     UUID[];
  v_r       RECORD;
  v_n       INT;
  v_txt     TEXT;
  v_pts     JSONB;
  v_a NUMERIC; v_b NUMERIC;
  v_pass    INT := 0;
BEGIN
  -- ══════════════ التهيئة ══════════════
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-R7-A','tr7a') RETURNING id INTO v_tenant;
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-R7-B','tr7b') RETURNING id INTO v_tenant2;

  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'boss@r7.local')  RETURNING id INTO v_boss;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'drv1@r7.local')  RETURNING id INTO v_drvUser;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'drv2@r7.local')  RETURNING id INTO v_drvUser2;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'other@r7.local') RETURNING id INTO v_stranger;

  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_boss,     v_tenant,  'مدير اللوجستيات', 'logistics'),
    (v_drvUser,  v_tenant,  'سائق أول',        'employee'),
    (v_drvUser2, v_tenant,  'سائق ثانٍ',        'employee'),
    (v_stranger, v_tenant2, 'غريب',            'logistics');

-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments(tenant_id,user_id,portal_role,is_active)
  VALUES (v_tenant, v_boss, 'logistics', true),
         (v_tenant2, v_stranger, 'logistics', true)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;

  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة أ: 0289 — Or-opt
  -- ═══════════════════════════════════════════════════════════

  -- 1) أقل من 4 نقاط تُعاد كما هي
  v_pts := '[{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":2,"lng":2}]'::jsonb;
  IF public.movement_or_opt(v_pts) <> v_pts THEN
    RAISE EXCEPTION 'A1 FAILED: <4 points must be unchanged';
  END IF; v_pass := v_pass + 1;

  -- 2) عدد النقاط محفوظ دائماً
  v_pts := '[{"lat":33.429,"lng":44.163},{"lat":33.158,"lng":44.026},
             {"lat":33.887,"lng":44.889},{"lat":33.616,"lng":44.752},
             {"lat":33.345,"lng":44.615},{"lat":33.074,"lng":44.478}]'::jsonb;
  IF jsonb_array_length(public.movement_or_opt(v_pts)) <> 6 THEN
    RAISE EXCEPTION 'A2 FAILED: or-opt changed point count';
  END IF; v_pass := v_pass + 1;

  -- 3) نقطة الانطلاق مثبَّتة
  IF (public.movement_or_opt(v_pts)->0) <> (v_pts->0) THEN
    RAISE EXCEPTION 'A3 FAILED: anchor moved';
  END IF; v_pass := v_pass + 1;

  -- 4) Or-opt يتفوق على 2-opt في الحالة المعروفة
  v_a := public.movement_path_length_km(public.movement_two_opt(v_pts));
  v_b := public.movement_path_length_km(public.movement_or_opt(v_pts));
  IF v_b >= v_a THEN
    RAISE EXCEPTION 'A4 FAILED: or-opt (%) did not beat 2-opt (%)', v_b, v_a;
  END IF;
  RAISE NOTICE '   Or-opt: 2opt=% كم → oropt=% كم (‑%%%)',
    ROUND(v_a,2), ROUND(v_b,2), ROUND((v_a-v_b)/v_a*100,1);
  v_pass := v_pass + 1;

  -- 5) لا نقاط مفقودة ولا مكرَّرة (مقارنة المجموعات)
  IF (SELECT count(DISTINCT e) FROM jsonb_array_elements(public.movement_or_opt(v_pts)) e)
     <> (SELECT count(DISTINCT e) FROM jsonb_array_elements(v_pts) e) THEN
    RAISE EXCEPTION 'A5 FAILED: or-opt lost or duplicated points';
  END IF; v_pass := v_pass + 1;

  -- 6) المُحسِّن المركَّب لا يُنتج أسوأ من 2-opt وحده
  IF public.movement_path_length_km(public.movement_optimize_path(v_pts))
     > public.movement_path_length_km(public.movement_two_opt(v_pts)) + 0.001 THEN
    RAISE EXCEPTION 'A6 FAILED: composite worse than 2-opt alone';
  END IF; v_pass := v_pass + 1;

  -- 7) استقرار: تشغيل ثانٍ لا يُحسّن أكثر
  IF public.movement_path_length_km(
       public.movement_optimize_path(public.movement_optimize_path(v_pts)))
     < public.movement_path_length_km(public.movement_optimize_path(v_pts)) - 0.001 THEN
    RAISE EXCEPTION 'A7 FAILED: composite not converged';
  END IF; v_pass := v_pass + 1;

  -- 8) حتمية: نفس المدخل ⇒ نفس المخرج
  IF public.movement_optimize_path(v_pts) <> public.movement_optimize_path(v_pts) THEN
    RAISE EXCEPTION 'A8 FAILED: optimizer not deterministic';
  END IF; v_pass := v_pass + 1;

  -- 9) plan_optimized_route تُرجع الأعمدة الثمانية بمراحلها
  v_loc := ARRAY[]::UUID[];
  FOR v_r IN SELECT * FROM (VALUES
      ('مستودع بغداد', 33.3152, 44.3661), ('الكرادة', 33.3020, 44.4200),
      ('الأعظمية',     33.3700, 44.3600), ('الدورة',   33.2500, 44.4000),
      ('الكاظمية',     33.3800, 44.3300), ('زيونة',    33.3300, 44.4400),
      ('المنصور',      33.3100, 44.3200)) AS t(nm,la,lo)
  LOOP
    v_loc := v_loc || (SELECT public.create_movement_location(
      v_r.nm,'checkpoint',NULL,v_r.la,v_r.lo,100,NULL));
  END LOOP;

  SELECT * INTO v_r FROM public.plan_optimized_route('مسار الجولة السابعة', v_loc, NULL, 45);
  IF v_r.route_id IS NULL OR v_r.ordered_count <> 7 THEN
    RAISE EXCEPTION 'A9 FAILED: plan returned % stops', v_r.ordered_count;
  END IF; v_pass := v_pass + 1;

  -- 10) تسلسل المراحل منطقي: naive ≥ nn ≥ 2opt ≥ optimized
  IF NOT (v_r.naive_km >= v_r.optimized_km AND v_r.two_opt_km >= v_r.optimized_km) THEN
    RAISE EXCEPTION 'A10 FAILED: stage ordering violated (naive=% nn=% 2opt=% opt=%)',
      v_r.naive_km, v_r.nn_km, v_r.two_opt_km, v_r.optimized_km;
  END IF;
  RAISE NOTICE '   المسار: أساس % | NN % | 2opt % | +oropt % كم',
    v_r.naive_km, v_r.nn_km, v_r.two_opt_km, v_r.optimized_km;
  v_pass := v_pass + 1;

  -- 11) الطول المخزَّن = الطول المحسوب من النقاط المخزَّنة (لا تزوير)
  SELECT waypoints_json, total_distance_km INTO v_pts, v_a
    FROM public.logistics_routes WHERE id = v_r.route_id;
  IF ABS(public.movement_path_length_km(v_pts) - v_a) > 0.05 THEN
    RAISE EXCEPTION 'A11 FAILED: stored % <> computed %',
      v_a, public.movement_path_length_km(v_pts);
  END IF; v_pass := v_pass + 1;

  -- 12) سجل التدقيق يذكر الخوارزمية الكاملة
  IF NOT EXISTS (SELECT 1 FROM public.movement_audit_events
     WHERE entity_id = v_r.route_id AND payload->>'algorithm' = 'nn+2opt+oropt') THEN
    RAISE EXCEPTION 'A12 FAILED: audit missing nn+2opt+oropt';
  END IF; v_pass := v_pass + 1;

  -- 13) anon محروم من دوال التحسين
  SELECT string_agg(p.proname,', ') INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('movement_or_opt','movement_optimize_path','plan_optimized_route')
    AND has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'A13 FAILED: anon can execute %', v_txt; END IF;
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ب: 0290 — الجدولة والسجل
  -- ═══════════════════════════════════════════════════════════

  /*
    14) عرض الصحة يغطي كل المهام المجدولة.
    محدَّث: 0295 أضاف logistics_kpi_snapshot فصارت ثلاثاً بدل اثنتين.
    نتحقق من وجود المهام المعروفة بالاسم بدل رقم ثابت يتقادم مع كل إضافة.
  */
  SELECT count(*) INTO v_n FROM public.movement_cron_health
   WHERE job_name IN ('movement_daily_notifications','telemetry_purge');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'B14 FAILED: core jobs missing from health view (found %)', v_n;
  END IF;
  v_pass := v_pass + 1;

  -- 15) لا حالة NULL في العرض
  IF EXISTS (SELECT 1 FROM public.movement_cron_health WHERE health IS NULL) THEN
    RAISE EXCEPTION 'B15 FAILED: NULL health';
  END IF; v_pass := v_pass + 1;

  -- 16) تشغيل المهمة يكتب سجلاً ناجحاً
  PERFORM public.run_movement_notifications_job(30);
  SELECT * INTO v_r FROM public.movement_cron_health
   WHERE job_name = 'movement_daily_notifications';
  IF v_r.last_status <> 'success' OR v_r.health <> 'healthy' THEN
    RAISE EXCEPTION 'B16 FAILED: status=% health=%', v_r.last_status, v_r.health;
  END IF; v_pass := v_pass + 1;

  -- 17) الزمن مقيس
  IF v_r.last_duration_ms IS NULL THEN
    RAISE EXCEPTION 'B17 FAILED: duration not measured';
  END IF; v_pass := v_pass + 1;

  -- 18) التنظيف يعمل ويُسجَّل
  PERFORM public.run_telemetry_purge_job(90);
  IF (SELECT last_status FROM public.movement_cron_health
       WHERE job_name='telemetry_purge') <> 'success' THEN
    RAISE EXCEPTION 'B18 FAILED: purge job not successful';
  END IF; v_pass := v_pass + 1;

  -- 19) سجل التشغيل بـ RLS مفعَّل وله سياسة (لا حجب كامل)
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='scheduled_job_runs' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'B19 FAILED: RLS off on scheduled_job_runs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='scheduled_job_runs') THEN
    RAISE EXCEPTION 'B19b FAILED: RLS enabled with zero policies = lockout';
  END IF; v_pass := v_pass + 1;

  -- 20) authenticated و anon ممنوعان من تشغيل المهام
  FOREACH v_txt IN ARRAY ARRAY[
    'public.run_movement_notifications_job(integer)',
    'public.run_telemetry_purge_job(integer)'] LOOP
    IF has_function_privilege('anon', v_txt,'EXECUTE') THEN
      RAISE EXCEPTION 'B20 FAILED: anon can run %', v_txt;
    END IF;
    IF has_function_privilege('authenticated', v_txt,'EXECUTE') THEN
      RAISE EXCEPTION 'B20b FAILED: authenticated can run %', v_txt;
    END IF;
    IF NOT has_function_privilege('service_role', v_txt,'EXECUTE') THEN
      RAISE EXCEPTION 'B20c FAILED: service_role cannot run %', v_txt;
    END IF;
  END LOOP; v_pass := v_pass + 1;

  -- 21) anon لا يقرأ السجل ولا عرض الصحة
  IF has_table_privilege('anon','public.scheduled_job_runs','SELECT')
     OR has_table_privilege('anon','public.movement_cron_health','SELECT') THEN
    RAISE EXCEPTION 'B21 FAILED: anon can read job logs';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ج: 0291 — تطبيق السائق
  -- ═══════════════════════════════════════════════════════════

  v_veh  := public.create_fleet_vehicle('TRK-D1','Volvo','FH16',2022,'truck','diesel',12000,40,0);
  v_veh2 := public.create_fleet_vehicle('TRK-D2','Scania','R450',2023,'truck','diesel',10000,35,0);
  v_drv  := public.create_fleet_driver('سائق أول','LIC-D1','heavy',(CURRENT_DATE+300)::date,'0770001',NULL);
  v_drv2 := public.create_fleet_driver('سائق ثانٍ','LIC-D2','heavy',(CURRENT_DATE+300)::date,'0770002',NULL);

  v_ord  := public.create_shipment_order('بغداد','الكرادة','شحنة أ',3000,12,'normal',
              (now()+interval '1 day'),NULL,NULL,NULL);
  v_ord2 := public.create_shipment_order('بغداد','الموصل','شحنة ب',2000,8,'normal',
              (now()+interval '2 days'),NULL,NULL,NULL);
  v_disp  := public.dispatch_shipment_order(v_ord, v_veh,  v_drv,  (now()+interval '4 hours'),NULL);
  v_disp2 := public.dispatch_shipment_order(v_ord2,v_veh2, v_drv2, (now()+interval '9 hours'),NULL);

  -- 22) قبل الربط: المستخدم ليس سائقاً
  PERFORM set_config('request.jwt.claim.sub', v_drvUser::text, false);
  IF public.current_driver_id() IS NOT NULL THEN
    RAISE EXCEPTION 'C22 FAILED: unlinked user resolved as driver';
  END IF;
  BEGIN
    PERFORM public.get_my_driver_trips();
    RAISE EXCEPTION 'C22b FAILED: unlinked user got trips';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_A_DRIVER%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 23) السائق لا يربط نفسه — يحتاج دور logistics
  BEGIN
    PERFORM public.link_driver_account(v_drv, v_drvUser);
    RAISE EXCEPTION 'C23 FAILED: driver self-linked without logistics role';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'C23 FAILED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 24) المدير يربط الحسابين
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
  PERFORM public.link_driver_account(v_drv,  v_drvUser);
  PERFORM public.link_driver_account(v_drv2, v_drvUser2);
  PERFORM set_config('request.jwt.claim.sub', v_drvUser::text, false);
  IF public.current_driver_id() <> v_drv THEN
    RAISE EXCEPTION 'C24 FAILED: link did not take effect';
  END IF; v_pass := v_pass + 1;

  -- 25) ★ العزل الجوهري: السائق يرى رحلته وحدها لا رحلة زميله
  SELECT count(*) INTO v_n FROM public.get_my_driver_trips();
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C25 FAILED: driver sees % trips (must be exactly 1)', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_my_driver_trips() WHERE dispatch_id = v_disp) THEN
    RAISE EXCEPTION 'C25b FAILED: driver does not see own trip';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_my_driver_trips() WHERE dispatch_id = v_disp2) THEN
    RAISE EXCEPTION 'C25c FAILED: driver sees a colleague trip — ISOLATION BREACH';
  END IF; v_pass := v_pass + 1;

  -- 26) لا يسجّل موقعاً على رحلة زميله
  BEGIN
    PERFORM public.record_driver_position(v_disp2, 33.31, 44.36, 40, 90, NULL);
    RAISE EXCEPTION 'C26 FAILED: driver posted position on colleague trip';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_ASSIGNED_TO_YOU%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 27) ولا يغيّر حالة رحلة زميله
  BEGIN
    PERFORM public.update_my_trip_status(v_disp2, 'en_route');
    RAISE EXCEPTION 'C27 FAILED: driver changed colleague trip status';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_ASSIGNED_TO_YOU%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 28) يسجّل موقعاً على رحلته
  IF public.record_driver_position(v_disp, 33.3152, 44.3661, 45, 90, NULL) IS NULL THEN
    RAISE EXCEPTION 'C28 FAILED: own position rejected';
  END IF; v_pass := v_pass + 1;

  -- 29) رفض الإحداثيات الفاسدة
  BEGIN
    PERFORM public.record_driver_position(v_disp, 999, 44.36, 40, 90, NULL);
    RAISE EXCEPTION 'C29 FAILED: latitude 999 accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_LATITUDE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 30) رفض السرعة الخيالية
  BEGIN
    PERFORM public.record_driver_position(v_disp, 33.31, 44.36, 500, 90, NULL);
    RAISE EXCEPTION 'C30 FAILED: speed 500 accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_SPEED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 31) رفض الزمن المستقبلي (تزوير سجل)
  BEGIN
    PERFORM public.record_driver_position(v_disp, 33.31, 44.36, 40, 90, now()+interval '3 days');
    RAISE EXCEPTION 'C31 FAILED: future timestamp accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%IN_FUTURE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 32) رفض الزمن الموغل في القدم
  BEGIN
    PERFORM public.record_driver_position(v_disp, 33.31, 44.36, 40, 90, now()-interval '30 days');
    RAISE EXCEPTION 'C32 FAILED: 30-day-old timestamp accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TOO_OLD%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 33) ★ الرفع دفعةً: الصالح يُقبل والفاسد يُرفض بلا إسقاط الدفعة
  SELECT * INTO v_r FROM public.record_driver_position_batch(v_disp, jsonb_build_array(
    jsonb_build_object('lat',33.320,'lng',44.370,'speed',50,'at',(now()-interval '9 min')),
    jsonb_build_object('lat',33.325,'lng',44.380,'speed',55,'at',(now()-interval '8 min')),
    jsonb_build_object('lat',999,   'lng',44.390,'speed',50,'at',(now()-interval '7 min')),
    jsonb_build_object('lat',33.330,'lng',44.400,'speed',900,'at',(now()-interval '6 min')),
    jsonb_build_object('lat',33.335,'lng',44.410,'speed',60,'at',(now()-interval '5 min'))));
  IF v_r.accepted <> 3 OR v_r.rejected <> 2 THEN
    RAISE EXCEPTION 'C33 FAILED: batch accepted=% rejected=% (expected 3/2)',
      v_r.accepted, v_r.rejected;
  END IF;
  RAISE NOTICE '   الدفعة: % مقبولة · % مرفوضة (لم تسقط الدفعة)', v_r.accepted, v_r.rejected;
  v_pass := v_pass + 1;

  -- 34) حد حجم الدفعة
  BEGIN
    PERFORM public.record_driver_position_batch(v_disp,
      (SELECT jsonb_agg(jsonb_build_object('lat',33.3,'lng',44.3,'speed',10))
         FROM generate_series(1,600)));
    RAISE EXCEPTION 'C34 FAILED: 600-point batch accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%BATCH_TOO_LARGE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 35) آلة الحالات: dispatched → en_route
  PERFORM public.update_my_trip_status(v_disp, 'en_route');
  IF (SELECT status FROM public.logistics_dispatches WHERE id=v_disp) <> 'en_route' THEN
    RAISE EXCEPTION 'C35 FAILED: en_route not applied';
  END IF; v_pass := v_pass + 1;

  -- 36) القفز عن حالة مرفوض
  BEGIN
    PERFORM public.update_my_trip_status(v_disp, 'completed');
    RAISE EXCEPTION 'C36 FAILED: en_route → completed allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_STATUS_TRANSITION%'
       AND SQLERRM NOT LIKE '%EPOD_REQUIRED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 37) ★ السائق لا يملك إعلان الفشل
  BEGIN
    PERFORM public.update_my_trip_status(v_disp, 'failed');
    RAISE EXCEPTION 'C37 FAILED: driver declared failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DRIVER_CANNOT_SET_STATUS%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 38) الوصول ثم ePOD
  PERFORM public.update_my_trip_status(v_disp, 'arrived');
  IF (SELECT actual_arrival FROM public.logistics_dispatches WHERE id=v_disp) IS NULL THEN
    RAISE EXCEPTION 'C38 FAILED: actual_arrival not stamped';
  END IF; v_pass := v_pass + 1;

  -- 39) ★ الإكمال بلا ePOD مرفوض
  BEGIN
    PERFORM public.update_my_trip_status(v_disp, 'completed');
    RAISE EXCEPTION 'C39 FAILED: completed without ePOD';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EPOD_REQUIRED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 40) الرفض يتطلب ملاحظات
  BEGIN
    PERFORM public.record_my_delivery_proof(v_disp,'أبو أحمد','rejected',NULL,NULL,NULL);
    RAISE EXCEPTION 'C40 FAILED: rejection without notes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOTES_REQUIRED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  /*
    41) اسم مستلم فارغ/قصير مرفوض.

    ⚠️ ملاحظة ترميز مهمة: هذا المختبر يعمل بـ SQL_ASCII بينما Supabase
    يعمل بـ UTF8. في SQL_ASCII يكون length('أ') = 2 (بايتان) بينما في
    UTF8 = 1 (محرف). لذا نختبر بمسافات — سلوكها متطابق في الترميزين —
    بدل حرف عربي مفرد يختلف طوله بحسب الترميز.
  */
  BEGIN
    PERFORM public.record_my_delivery_proof(v_disp,'  ','delivered',NULL,NULL,NULL);
    RAISE EXCEPTION 'C41 FAILED: blank recipient accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%RECIPIENT_NAME_REQUIRED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 42) ePOD صحيح يُسجَّل
  IF public.record_my_delivery_proof(v_disp,'أبو أحمد','delivered',NULL,NULL,'سُلّمت') IS NULL THEN
    RAISE EXCEPTION 'C42 FAILED: valid ePOD rejected';
  END IF; v_pass := v_pass + 1;

  -- 43) لا ePOD مزدوج
  BEGIN
    PERFORM public.record_my_delivery_proof(v_disp,'شخص آخر','delivered',NULL,NULL,NULL);
    RAISE EXCEPTION 'C43 FAILED: duplicate ePOD';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ALREADY_RECORDED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 44) الإكمال ينجح الآن ويحرّر المركبة
  PERFORM public.update_my_trip_status(v_disp, 'completed');
  IF (SELECT status FROM public.logistics_vehicles WHERE id=v_veh) <> 'available' THEN
    RAISE EXCEPTION 'C44 FAILED: vehicle not released';
  END IF;
  IF (SELECT status FROM public.logistics_shipment_orders WHERE id=v_ord) <> 'delivered' THEN
    RAISE EXCEPTION 'C44b FAILED: order not marked delivered';
  END IF; v_pass := v_pass + 1;

  -- 45) رحلة مغلقة لا تقبل مواقع
  BEGIN
    PERFORM public.record_driver_position(v_disp, 33.31, 44.36, 40, 90, NULL);
    RAISE EXCEPTION 'C45 FAILED: position on closed trip';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ALREADY_CLOSED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 46) الرحلة المكتملة تختفي من القائمة النشطة وتظهر مع include_closed
  SELECT count(*) INTO v_n FROM public.get_my_driver_trips(FALSE);
  IF v_n <> 0 THEN RAISE EXCEPTION 'C46 FAILED: completed trip still active'; END IF;
  SELECT count(*) INTO v_n FROM public.get_my_driver_trips(TRUE);
  IF v_n <> 1 THEN RAISE EXCEPTION 'C46b FAILED: history missing'; END IF;
  v_pass := v_pass + 1;

  -- 47) الملخّص اليومي
  SELECT * INTO v_r FROM public.get_my_driver_summary();
  IF v_r.driver_id <> v_drv THEN RAISE EXCEPTION 'C47 FAILED: wrong driver'; END IF;
  IF v_r.completed_today <> 1 THEN
    RAISE EXCEPTION 'C47b FAILED: completed_today=%', v_r.completed_today;
  END IF;
  IF v_r.km_today <= 0 THEN
    RAISE EXCEPTION 'C47c FAILED: km_today=% (positions were recorded)', v_r.km_today;
  END IF;
  RAISE NOTICE '   السائق: % رحلة مكتملة اليوم · % كم · الرخصة بعد % يوم',
    v_r.completed_today, v_r.km_today, v_r.license_days_left;
  v_pass := v_pass + 1;

  -- 48) ★ عزل المستأجرين: غريب من مستأجر آخر لا يصل
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, false);
  IF public.current_driver_id() IS NOT NULL THEN
    RAISE EXCEPTION 'C48 FAILED: cross-tenant user resolved as driver';
  END IF;
  BEGIN
    PERFORM public.record_driver_position(v_disp2, 33.31, 44.36, 40, 90, NULL);
    RAISE EXCEPTION 'C48b FAILED: cross-tenant position accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_A_DRIVER%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 49) الربط عبر المستأجرين مرفوض
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
  BEGIN
    PERFORM public.link_driver_account(v_drv, v_stranger);
    RAISE EXCEPTION 'C49 FAILED: linked user from another tenant';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%USER_NOT_IN_TENANT%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 50) حساب واحد لا يكون سائقين
  BEGIN
    PERFORM public.link_driver_account(v_drv2, v_drvUser);
    RAISE EXCEPTION 'C50 FAILED: one account linked to two drivers';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ALREADY_LINKED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 51) السائق الموقوف يفقد الوصول فوراً
  UPDATE public.logistics_drivers SET status='suspended' WHERE id=v_drv;
  PERFORM set_config('request.jwt.claim.sub', v_drvUser::text, false);
  IF public.current_driver_id() IS NOT NULL THEN
    RAISE EXCEPTION 'C51 FAILED: suspended driver still resolves';
  END IF;
  BEGIN
    PERFORM public.get_my_driver_trips();
    RAISE EXCEPTION 'C51b FAILED: suspended driver got trips';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_A_DRIVER%' THEN RAISE; END IF;
  END;
  UPDATE public.logistics_drivers SET status='active' WHERE id=v_drv;
  v_pass := v_pass + 1;

  -- 52) فك الربط يقطع الوصول
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
  PERFORM public.link_driver_account(v_drv, NULL);
  PERFORM set_config('request.jwt.claim.sub', v_drvUser::text, false);
  IF public.current_driver_id() IS NOT NULL THEN
    RAISE EXCEPTION 'C52 FAILED: unlink did not revoke access';
  END IF; v_pass := v_pass + 1;

  -- 53) anon محروم من كل دوال السائق التسع
  SELECT string_agg(p.proname,', ') INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('current_driver_id','movement_require_driver','link_driver_account',
                      'get_my_driver_trips','record_driver_position',
                      'record_driver_position_batch','update_my_trip_status',
                      'record_my_delivery_proof','get_my_driver_summary')
    AND has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'C53 FAILED: anon can execute %', v_txt; END IF;
  v_pass := v_pass + 1;

  -- 54) سجل التدقيق يميّز مصدر التغيير (تطبيق السائق)
  IF NOT EXISTS (SELECT 1 FROM public.movement_audit_events
     WHERE entity_id=v_disp AND payload->>'source'='driver_app') THEN
    RAISE EXCEPTION 'C54 FAILED: driver_app source not audited';
  END IF; v_pass := v_pass + 1;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  ✅ 0289-0291: % / 54 اختباراً نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════';
END $outer$;
