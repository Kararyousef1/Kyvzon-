-- ============================================================================
-- اختبار سلوكي: 0296 — HOS · DVIR · احتيال الوقود
-- ============================================================================
\set ON_ERROR_STOP on

DO $outer$
DECLARE
  v_tenant UUID; v_boss UUID;
  v_veh UUID; v_veh2 UUID; v_veh3 UUID;
  v_drv UUID; v_drv2 UUID; v_drv3 UUID;
  v_r RECORD; v_n INT; v_txt TEXT; v_id UUID;
  v_pass INT := 0;
BEGIN
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-296','t296') RETURNING id INTO v_tenant;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'b296@l') RETURNING id INTO v_boss;
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_boss, v_tenant, 'مدير', 'logistics');
-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments(tenant_id,user_id,portal_role,is_active)
    VALUES (v_tenant, v_boss, 'logistics', true)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);

  v_veh  := public.create_fleet_vehicle('DV-1','Volvo','FH',2022,'truck','diesel',12000,40,1000);
  v_veh2 := public.create_fleet_vehicle('DV-2','MAN','TGX',2023,'truck','diesel',9000,30,2000);
  v_veh3 := public.create_fleet_vehicle('DV-3','Iveco','S',2024,'truck','diesel',8000,25,500);
  v_drv  := public.create_fleet_driver('سائق أ','L296A','heavy',(CURRENT_DATE+300)::date,'077',NULL);
  v_drv2 := public.create_fleet_driver('سائق ب','L296B','heavy',(CURRENT_DATE+300)::date,'078',NULL);
  v_drv3 := public.create_fleet_driver('سائق ج','L296C','heavy',(CURRENT_DATE+300)::date,'079',NULL);

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة أ: DVIR
  -- ═══════════════════════════════════════════════════════════

  -- 1) فحص نظيف: لا إيقاف
  SELECT * INTO v_r FROM public.record_vehicle_inspection(
    v_veh, 'pre_trip', '[]'::jsonb, 1100, v_drv, NULL, 'أحمد', NULL);
  IF v_r.has_critical OR v_r.vehicle_grounded THEN
    RAISE EXCEPTION 'A1 FAILED: clean inspection grounded the vehicle';
  END IF; v_pass := v_pass + 1;

  -- 2) العداد تحدّث من الفحص
  IF (SELECT current_mileage_km FROM public.logistics_vehicles WHERE id=v_veh) <> 1100 THEN
    RAISE EXCEPTION 'A2 FAILED: odometer not updated from inspection';
  END IF; v_pass := v_pass + 1;

  -- 3) عيب بسيط: لا إيقاف
  SELECT * INTO v_r FROM public.record_vehicle_inspection(
    v_veh, 'post_trip',
    '[{"code":"WIPER_WORN","severity":"minor","note":"مساحة مهترئة"}]'::jsonb,
    NULL, v_drv, NULL, NULL, NULL);
  IF v_r.vehicle_grounded THEN
    RAISE EXCEPTION 'A3 FAILED: minor defect grounded the vehicle';
  END IF;
  IF (SELECT status FROM public.logistics_vehicles WHERE id=v_veh) <> 'available' THEN
    RAISE EXCEPTION 'A3b FAILED: vehicle status changed on minor defect';
  END IF; v_pass := v_pass + 1;

  -- 4) ★★ عيب حرج: إيقاف تلقائي فوري
  SELECT * INTO v_r FROM public.record_vehicle_inspection(
    v_veh, 'pre_trip',
    '[{"code":"BRAKE_FAILURE","severity":"critical","note":"فرامل معطلة"}]'::jsonb,
    NULL, v_drv, NULL, 'أحمد', NULL);
  IF NOT v_r.has_critical THEN RAISE EXCEPTION 'A4 FAILED: critical not detected'; END IF;
  IF NOT v_r.vehicle_grounded THEN RAISE EXCEPTION 'A4b FAILED: vehicle NOT grounded'; END IF;
  IF (SELECT status FROM public.logistics_vehicles WHERE id=v_veh) <> 'out_of_service' THEN
    RAISE EXCEPTION 'A4c FAILED: status is not out_of_service';
  END IF;
  RAISE NOTICE '   DVIR: عيب حرج → المركبة out_of_service تلقائياً ✅';
  v_pass := v_pass + 1;

  -- 5) ★ العيب الحرج يمنع الإسناد
  SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh, v_drv);
  IF v_r.is_eligible THEN
    RAISE EXCEPTION 'A5 FAILED: grounded vehicle still eligible';
  END IF; v_pass := v_pass + 1;

  -- 6) الإصلاح يرفع الإيقاف
  IF public.clear_vehicle_defects(v_veh, 'استُبدلت الفرامل واعتُمدت') IS NULL THEN
    RAISE EXCEPTION 'A6 FAILED: clear returned NULL';
  END IF;
  IF (SELECT status FROM public.logistics_vehicles WHERE id=v_veh) <> 'available' THEN
    RAISE EXCEPTION 'A6b FAILED: vehicle not restored';
  END IF;
  SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh, v_drv);
  IF NOT v_r.is_eligible THEN
    RAISE EXCEPTION 'A6c FAILED: still blocked after repair (% — %)',
      v_r.blocker_code, v_r.blocker_msg;
  END IF; v_pass := v_pass + 1;

  -- 7) ★ السجل الأصلي محفوظ — دليل تدقيقي لا يُعدَّل
  SELECT count(*) INTO v_n FROM public.fleet_vehicle_inspections
   WHERE vehicle_id = v_veh AND has_critical;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A7 FAILED: critical record altered or deleted (found %)', v_n;
  END IF; v_pass := v_pass + 1;

  -- 8) إصلاح بلا عيب حرج مرفوض
  BEGIN
    PERFORM public.clear_vehicle_defects(v_veh2, 'لا شيء لإصلاحه');
    RAISE EXCEPTION 'A8 FAILED: cleared without a critical defect';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NO_CRITICAL_DEFECT%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 9) سبب الإصلاح إلزامي
  BEGIN
    PERFORM public.clear_vehicle_defects(v_veh, 'ok');
    RAISE EXCEPTION 'A9 FAILED: short repair note accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%REPAIR_NOTES_REQUIRED%'
       AND SQLERRM NOT LIKE '%NO_CRITICAL_DEFECT%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 10) عيب بلا severity صالحة مرفوض
  BEGIN
    PERFORM public.record_vehicle_inspection(
      v_veh2, 'pre_trip', '[{"code":"X","severity":"catastrophic"}]'::jsonb,
      NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'A10 FAILED: invalid severity accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_DEFECT_ENTRY%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 11) عيب بلا code مرفوض
  BEGIN
    PERFORM public.record_vehicle_inspection(
      v_veh2, 'pre_trip', '[{"severity":"minor"}]'::jsonb, NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'A11 FAILED: defect without code accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_DEFECT_ENTRY%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 12) العداد لا يتراجع في الفحص
  BEGIN
    PERFORM public.record_vehicle_inspection(v_veh, 'periodic', '[]'::jsonb, 5,
      NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'A12 FAILED: decreasing odometer accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ODOMETER_CANNOT_DECREASE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ب: HOS
  -- ═══════════════════════════════════════════════════════════

  -- 13) سائق بلا سجل: كل الحدود سليمة
  SELECT * INTO v_r FROM public.get_driver_hos_summary(v_drv2, CURRENT_DATE);
  IF v_r.driving_limit_exceeded OR v_r.duty_limit_exceeded
     OR v_r.cycle_limit_exceeded OR v_r.rest_insufficient THEN
    RAISE EXCEPTION 'B13 FAILED: fresh driver flagged';
  END IF; v_pass := v_pass + 1;

  -- 14) بدء فترة قيادة
  SELECT * INTO v_r FROM public.start_driver_duty_period(v_drv2, 'driving', NULL, NULL);
  IF v_r.log_id IS NULL THEN RAISE EXCEPTION 'B14 FAILED: no log id'; END IF;
  IF v_r.hos_warning IS NOT NULL THEN
    RAISE EXCEPTION 'B14b FAILED: unexpected warning %', v_r.hos_warning;
  END IF; v_pass := v_pass + 1;

  -- 15) ★ فترة مفتوحة واحدة فقط — الثانية تُغلق الأولى
  PERFORM public.start_driver_duty_period(v_drv2, 'on_duty', NULL, NULL);
  SELECT count(*) INTO v_n FROM public.fleet_driver_hos_logs
   WHERE driver_id = v_drv2 AND ended_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'B15 FAILED: % open periods (must be 1)', v_n;
  END IF; v_pass := v_pass + 1;

  -- 16) إنهاء الفترة يحسب المدة
  IF public.end_driver_duty_period(v_drv2, 'انتهى') IS NULL THEN
    RAISE EXCEPTION 'B16 FAILED: end returned NULL';
  END IF;
  SELECT count(*) INTO v_n FROM public.fleet_driver_hos_logs
   WHERE driver_id = v_drv2 AND ended_at IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'B16b FAILED: period still open'; END IF;
  v_pass := v_pass + 1;

  -- 17) إنهاء بلا فترة مفتوحة مرفوض
  BEGIN
    PERFORM public.end_driver_duty_period(v_drv2, NULL);
    RAISE EXCEPTION 'B17 FAILED: ended with no open period';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NO_OPEN_DUTY_PERIOD%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 18) ★★ تجاوز 11 ساعة قيادة → الحد يُرصد
  INSERT INTO public.fleet_driver_hos_logs(tenant_id, driver_id, duty_status,
    duration_mins, logged_date, started_at, ended_at)
  VALUES (v_tenant, v_drv3, 'driving', 700, CURRENT_DATE,
          now() - interval '12 hours', now() - interval '1 hour');

  SELECT * INTO v_r FROM public.get_driver_hos_summary(v_drv3, CURRENT_DATE);
  IF v_r.driving_minutes_today <> 700 THEN
    RAISE EXCEPTION 'B18 FAILED: driving minutes = % (expected 700)',
      v_r.driving_minutes_today;
  END IF;
  IF NOT v_r.driving_limit_exceeded THEN
    RAISE EXCEPTION 'B18b FAILED: 700 min (11.7h) did not exceed 11h limit';
  END IF;
  RAISE NOTICE '   HOS: % دقيقة قيادة → تجاوز حد الـ 11 ساعة ✅', v_r.driving_minutes_today;
  v_pass := v_pass + 1;

  -- 19) ★★★ الأهم: تجاوز HOS يمنع الإسناد فعلياً
  SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh2, v_drv3);
  IF v_r.is_eligible THEN
    RAISE EXCEPTION 'B19 FAILED: HOS-exceeded driver still eligible';
  END IF;
  IF v_r.blocker_code <> 'HOS_LIMIT_EXCEEDED' THEN
    RAISE EXCEPTION 'B19b FAILED: blocked for wrong reason (%)', v_r.blocker_code;
  END IF;
  RAISE NOTICE '   الإسناد ممنوع: % — %', v_r.blocker_code, v_r.blocker_msg;
  v_pass := v_pass + 1;

  -- 20) تحذير عند الاقتراب (10 ساعات) لا منع
  DECLARE v_drv4 UUID;
  BEGIN
    v_drv4 := public.create_fleet_driver('سائق د','L296D','heavy',
                (CURRENT_DATE+300)::date,'070',NULL);
    INSERT INTO public.fleet_driver_hos_logs(tenant_id, driver_id, duty_status,
      duration_mins, logged_date, started_at, ended_at)
    VALUES (v_tenant, v_drv4, 'driving', 610, CURRENT_DATE,
            now() - interval '11 hours', now() - interval '1 hour');

    SELECT * INTO v_r FROM public.start_driver_duty_period(v_drv4,'driving',NULL,NULL);
    IF v_r.hos_warning <> 'HOS_APPROACHING_LIMIT' THEN
      RAISE EXCEPTION 'B20 FAILED: expected approaching warning, got %',
        COALESCE(v_r.hos_warning, 'NULL');
    END IF;
    PERFORM public.end_driver_duty_period(v_drv4, NULL);

    -- ولا يزال مؤهَّلاً (لم يتجاوز بعد)
    SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh2, v_drv4);
    IF NOT v_r.is_eligible THEN
      RAISE EXCEPTION 'B20b FAILED: warning must not block (% )', v_r.blocker_code;
    END IF;
  END; v_pass := v_pass + 1;

  -- 21) ★ حد 14 ساعة عمل (driving + on_duty)
  DECLARE v_drv5 UUID;
  BEGIN
    v_drv5 := public.create_fleet_driver('سائق هـ','L296E','heavy',
                (CURRENT_DATE+300)::date,'071',NULL);
    INSERT INTO public.fleet_driver_hos_logs(tenant_id, driver_id, duty_status,
      duration_mins, logged_date, started_at, ended_at)
    VALUES (v_tenant, v_drv5, 'driving', 500, CURRENT_DATE,
            now() - interval '15 hours', now() - interval '7 hours'),
           (v_tenant, v_drv5, 'on_duty', 400, CURRENT_DATE,
            now() - interval '7 hours', now() - interval '1 hour');

    SELECT * INTO v_r FROM public.get_driver_hos_summary(v_drv5, CURRENT_DATE);
    IF v_r.on_duty_minutes_today <> 900 THEN
      RAISE EXCEPTION 'B21 FAILED: duty minutes = % (expected 900)',
        v_r.on_duty_minutes_today;
    END IF;
    IF NOT v_r.duty_limit_exceeded THEN
      RAISE EXCEPTION 'B21b FAILED: 900 min (15h) did not exceed 14h limit';
    END IF;
    IF v_r.driving_limit_exceeded THEN
      RAISE EXCEPTION 'B21c FAILED: 500 min driving wrongly flagged as >11h';
    END IF;

    SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh2, v_drv5);
    IF v_r.blocker_code <> 'HOS_DUTY_LIMIT_EXCEEDED' THEN
      RAISE EXCEPTION 'B21d FAILED: wrong blocker (%)', COALESCE(v_r.blocker_code,'none');
    END IF;
  END; v_pass := v_pass + 1;

  -- 22) ★ حد الدورة 70 ساعة / 8 أيام
  DECLARE v_drv6 UUID; i INT;
  BEGIN
    v_drv6 := public.create_fleet_driver('سائق و','L296F','heavy',
                (CURRENT_DATE+300)::date,'072',NULL);
    -- 7 أيام سابقة × 600 دقيقة = 4200 (لا يمسّ حدّ اليوم الحالي)
    FOR i IN 1..7 LOOP
      INSERT INTO public.fleet_driver_hos_logs(tenant_id, driver_id, duty_status,
        duration_mins, logged_date, started_at, ended_at)
      VALUES (v_tenant, v_drv6, 'driving', 600, CURRENT_DATE - i,
              now() - (i || ' days')::interval, now() - (i || ' days')::interval + interval '10 hours');
    END LOOP;

    SELECT * INTO v_r FROM public.get_driver_hos_summary(v_drv6, CURRENT_DATE);
    IF v_r.driving_minutes_8days < 4200 THEN
      RAISE EXCEPTION 'B22 FAILED: cycle minutes = % (expected >= 4200)',
        v_r.driving_minutes_8days;
    END IF;
    IF NOT v_r.cycle_limit_exceeded THEN
      RAISE EXCEPTION 'B22b FAILED: 70h cycle not flagged';
    END IF;
    IF v_r.driving_limit_exceeded THEN
      RAISE EXCEPTION 'B22c FAILED: past days leaked into today count';
    END IF;

    SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh2, v_drv6);
    IF v_r.blocker_code <> 'HOS_CYCLE_LIMIT_EXCEEDED' THEN
      RAISE EXCEPTION 'B22d FAILED: wrong blocker (%)', COALESCE(v_r.blocker_code,'none');
    END IF;
  END; v_pass := v_pass + 1;

  -- 23) ★ الفترة المفتوحة تُحتسب حتى الآن لا تُهمل
  DECLARE v_drv7 UUID; v_before INT;
  BEGIN
    v_drv7 := public.create_fleet_driver('سائق ز','L296G','heavy',
                (CURRENT_DATE+300)::date,'073',NULL);
    SELECT driving_minutes_today INTO v_before
      FROM public.get_driver_hos_summary(v_drv7, CURRENT_DATE);

    INSERT INTO public.fleet_driver_hos_logs(tenant_id, driver_id, duty_status,
      duration_mins, logged_date, started_at)
    VALUES (v_tenant, v_drv7, 'driving', 0, CURRENT_DATE, now() - interval '3 hours');

    SELECT * INTO v_r FROM public.get_driver_hos_summary(v_drv7, CURRENT_DATE);
    IF v_r.driving_minutes_today < 170 THEN
      RAISE EXCEPTION 'B23 FAILED: open period not counted (% min)',
        v_r.driving_minutes_today;
    END IF;
    IF v_r.open_period_status <> 'driving' THEN
      RAISE EXCEPTION 'B23b FAILED: open status = %', COALESCE(v_r.open_period_status,'NULL');
    END IF;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ج: احتيال الوقود
  -- ═══════════════════════════════════════════════════════════

  UPDATE public.logistics_vehicles SET fuel_tank_capacity_l = 300 WHERE id = v_veh3;

  -- 24) تزوّد عادي: بلا أعلام
  SELECT * INTO v_r FROM public.log_fuel_transaction(v_veh3, 200, 300000, 900,
    NULL, 'محطة', NULL);
  IF array_length(v_r.flags, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'C24 FAILED: normal refuel flagged: %', v_r.flags;
  END IF; v_pass := v_pass + 1;

  -- 25) ★★ تجاوز سعة الخزان → علم جديد
  SELECT * INTO v_r FROM public.log_fuel_transaction(v_veh3, 400, 600000, 1500,
    NULL, 'محطة', NULL);
  IF NOT ('TANK_CAPACITY_EXCEEDED' = ANY(v_r.flags)) THEN
    RAISE EXCEPTION 'C25 FAILED: 400L into 300L tank not flagged (flags=%)', v_r.flags;
  END IF;
  RAISE NOTICE '   الوقود: 400 لتر في خزان 300 → % ✅', v_r.flags;
  v_pass := v_pass + 1;

  -- 26) ★ هامش 5% لا يُنذر كذباً
  UPDATE public.logistics_vehicles SET fuel_tank_capacity_l = 300 WHERE id = v_veh2;
  SELECT * INTO v_r FROM public.log_fuel_transaction(v_veh2, 310, 400000, 2100,
    NULL, NULL, NULL);
  IF 'TANK_CAPACITY_EXCEEDED' = ANY(v_r.flags) THEN
    RAISE EXCEPTION 'C26 FAILED: 310L into 300L tank (within 5%%) false-flagged';
  END IF; v_pass := v_pass + 1;

  -- 27) سعة غير مسجَّلة: لا فحص ولا إنذار
  SELECT * INTO v_r FROM public.log_fuel_transaction(v_veh, 450, 500000, 1200,
    NULL, NULL, NULL);
  IF 'TANK_CAPACITY_EXCEEDED' = ANY(v_r.flags) THEN
    RAISE EXCEPTION 'C27 FAILED: NULL capacity produced a capacity flag';
  END IF; v_pass := v_pass + 1;

  -- 28) الأعلام السابقة ما زالت تعمل (RAPID_REFUEL)
  SELECT * INTO v_r FROM public.log_fuel_transaction(v_veh3, 50, 70000, 1600,
    NULL, NULL, NULL);
  IF NOT ('RAPID_REFUEL' = ANY(v_r.flags)) THEN
    RAISE EXCEPTION 'C28 FAILED: rapid refuel no longer detected (flags=%)', v_r.flags;
  END IF; v_pass := v_pass + 1;

  -- 29) سعة صفر أو سالبة مرفوضة على مستوى القيد
  BEGIN
    UPDATE public.logistics_vehicles SET fuel_tank_capacity_l = 0 WHERE id = v_veh3;
    RAISE EXCEPTION 'C29 FAILED: zero tank capacity accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة د: العروض والأمان
  -- ═══════════════════════════════════════════════════════════

  -- 30) عرض امتثال السائقين يصنّف صحيحاً
  SELECT compliance_status INTO v_txt FROM public.logistics_safety_compliance
   WHERE driver_id = v_drv3;
  IF v_txt <> 'hos_violation' THEN
    RAISE EXCEPTION 'D30 FAILED: driver with HOS breach shows %', v_txt;
  END IF; v_pass := v_pass + 1;

  -- 31) السائق النظيف compliant
  SELECT compliance_status INTO v_txt FROM public.logistics_safety_compliance
   WHERE driver_id = v_drv;
  IF v_txt <> 'compliant' THEN
    RAISE EXCEPTION 'D31 FAILED: clean driver shows %', v_txt;
  END IF; v_pass := v_pass + 1;

  -- 32) عرض سلامة المركبات
  SELECT safety_status INTO v_txt FROM public.logistics_vehicle_safety_status
   WHERE vehicle_id = v_veh;
  IF v_txt NOT IN ('compliant','inspection_overdue') THEN
    RAISE EXCEPTION 'D32 FAILED: repaired vehicle shows %', v_txt;
  END IF;
  -- مركبة لم تُفحص قط
  SELECT safety_status INTO v_txt FROM public.logistics_vehicle_safety_status
   WHERE vehicle_id = v_veh2;
  IF v_txt <> 'never_inspected' THEN
    RAISE EXCEPTION 'D32b FAILED: uninspected vehicle shows %', v_txt;
  END IF; v_pass := v_pass + 1;

  -- 33) anon محروم
  SELECT string_agg(p.proname,', ') INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('record_vehicle_inspection','clear_vehicle_defects',
                      'get_driver_hos_summary','start_driver_duty_period',
                      'end_driver_duty_period','check_assignment_eligibility',
                      'log_fuel_transaction')
    AND has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'D33 FAILED: anon can execute %', v_txt; END IF;
  IF has_table_privilege('anon','public.fleet_vehicle_inspections','SELECT') THEN
    RAISE EXCEPTION 'D33b FAILED: anon can read inspections';
  END IF; v_pass := v_pass + 1;

  -- 34) نسخة واحدة من كل دالة أُعيد بناؤها (درس 0294)
  FOREACH v_txt IN ARRAY ARRAY['check_assignment_eligibility','log_fuel_transaction'] LOOP
    SELECT count(*) INTO v_n FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_txt;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'D34 FAILED: % has % overloads', v_txt, v_n;
    END IF;
  END LOOP; v_pass := v_pass + 1;

  -- 35) سجل التدقيق يوثّق الإيقاف
  IF NOT EXISTS (SELECT 1 FROM public.movement_audit_events
     WHERE event_type='vehicle_inspection_recorded'
       AND (payload->>'grounded')::boolean = true) THEN
    RAISE EXCEPTION 'D35 FAILED: grounding not audited';
  END IF; v_pass := v_pass + 1;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  ✅ 0296: % / 35 اختباراً نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════';
END $outer$;
