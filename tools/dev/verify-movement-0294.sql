-- ============================================================================
-- اختبار سلوكي: 0294 — client_uuid وإحياء الجداول
-- ============================================================================
\set ON_ERROR_STOP on

DO $outer$
DECLARE
  v_tenant UUID; v_tenant2 UUID;
  v_boss UUID; v_drvUser UUID; v_emp UUID; v_emp2 UUID;
  v_veh UUID; v_veh2 UUID; v_drv UUID; v_drv2 UUID; v_drvUser2 UUID;
  v_ord UUID; v_disp UUID;
  v_loc UUID; v_fence UUID;
  v_visit UUID; v_permit UUID; v_carrier UUID;
  v_cu UUID; v_e1 UUID; v_e2 UUID;
  v_s1 UUID; v_s2 UUID; v_s3 UUID;
  v_r RECORD; v_n INT; v_txt TEXT;
  v_pass INT := 0;
BEGIN
  -- ══════════════ التهيئة ══════════════
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-294-A','t294a') RETURNING id INTO v_tenant;
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-294-B','t294b') RETURNING id INTO v_tenant2;

  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'boss294@l') RETURNING id INTO v_boss;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'drv294@l')  RETURNING id INTO v_drvUser;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'emp294@l')  RETURNING id INTO v_emp;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'emp294b@l') RETURNING id INTO v_emp2;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'drv294b@l') RETURNING id INTO v_drvUser2;

  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_boss,    v_tenant,  'مدير',   'logistics'),
    (v_drvUser, v_tenant,  'سائق',   'employee'),
    (v_emp,     v_tenant,  'موظف',   'employee_movement'),
    (v_emp2,    v_tenant2, 'موظف ب', 'employee_movement'),
    (v_drvUser2,v_tenant,  'سائق ب', 'employee');

-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments(tenant_id,user_id,portal_role,is_active) VALUES
    (v_tenant,  v_boss, 'logistics',         true),
    (v_tenant,  v_emp,  'employee_movement', true),
    (v_tenant2, v_emp2, 'employee_movement', true)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;

  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);

  v_veh  := public.create_fleet_vehicle('TRK-294','Volvo','FH',2022,'truck','diesel',12000,40,0);
  v_veh2 := public.create_fleet_vehicle('TRK-294B','MAN','TGX',2023,'truck','diesel',9000,30,0);
  v_drv  := public.create_fleet_driver('سائق 294','LIC-294','heavy',(CURRENT_DATE+300)::date,'0770',NULL);
  PERFORM public.link_driver_account(v_drv, v_drvUser);
  v_drv2 := public.create_fleet_driver('سائق 294ب','LIC-294B','heavy',
              (CURRENT_DATE+300)::date,'0772',NULL);
  PERFORM public.link_driver_account(v_drv2, v_drvUser2);

  v_ord  := public.create_shipment_order('بغداد','البصرة','شحنة',3000,12,'normal',
              (now()+interval '1 day'),NULL,NULL,NULL);
  v_disp := public.dispatch_shipment_order(v_ord, v_veh, v_drv, (now()+interval '5 hours'),NULL);

  v_loc := public.create_movement_location('عميل الاختبار','client_site',NULL,33.3152,44.3661,150,NULL);
  v_carrier := public.create_logistics_carrier('ناقل 294','3pl','أحمد','0771','a@b.c',
                 (CURRENT_DATE+200)::date);

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة أ: 🔴 client_uuid — منع ازدواج ePOD
  -- ═══════════════════════════════════════════════════════════

  PERFORM set_config('request.jwt.claim.sub', v_drvUser::text, false);
  PERFORM public.update_my_trip_status(v_disp, 'en_route');
  PERFORM public.update_my_trip_status(v_disp, 'arrived');

  v_cu := gen_random_uuid();

  -- 1) التسجيل الأول ينجح
  v_e1 := public.record_my_delivery_proof(v_disp,'أبو علي','delivered',NULL,NULL,'سُلّمت',v_cu);
  IF v_e1 IS NULL THEN RAISE EXCEPTION 'A1 FAILED: first ePOD returned NULL'; END IF;
  v_pass := v_pass + 1;

  -- 2) ★★ إعادة الإرسال بنفس client_uuid تُرجع **الصف نفسه** لا خطأ
  v_e2 := public.record_my_delivery_proof(v_disp,'أبو علي','delivered',NULL,NULL,'سُلّمت',v_cu);
  IF v_e2 <> v_e1 THEN
    RAISE EXCEPTION 'A2 FAILED: retry returned different id (% vs %)', v_e2, v_e1;
  END IF; v_pass := v_pass + 1;

  -- 3) ★★ صفٌّ واحد فقط في الجدول — لا ازدواج
  SELECT count(*) INTO v_n FROM public.logistics_epod WHERE dispatch_id = v_disp;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A3 FAILED: % ePOD rows for one dispatch — DUPLICATE', v_n;
  END IF; v_pass := v_pass + 1;

  -- 4) إعادة الإرسال ببيانات مختلفة تُرجع الأصل (الصدى لا يُعاد تقييمه)
  IF public.record_my_delivery_proof(v_disp,'شخص آخر','rejected',NULL,NULL,'رفض تام',v_cu) <> v_e1 THEN
    RAISE EXCEPTION 'A4 FAILED: retry with different payload did not return original';
  END IF;
  SELECT recipient_name INTO v_txt FROM public.logistics_epod WHERE id = v_e1;
  IF v_txt <> 'أبو علي' THEN
    RAISE EXCEPTION 'A5 FAILED: original row was overwritten by retry';
  END IF; v_pass := v_pass + 1;

  -- 5) القيد الفريد يمنع الازدواج على مستوى القاعدة
  BEGIN
    INSERT INTO public.logistics_epod(tenant_id, dispatch_id, order_id,
      recipient_name, status, client_uuid)
    VALUES (v_tenant, v_disp, v_ord, 'تسلل', 'delivered', v_cu);
    RAISE EXCEPTION 'A6 FAILED: unique constraint did not fire';
  EXCEPTION WHEN unique_violation THEN NULL;
  END; v_pass := v_pass + 1;

  -- 6) client_uuid = NULL لا يمنع تسجيلات مستقلة (لا فهرس على NULL)
  DECLARE v_o2 UUID; v_d2 UUID;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
    v_o2 := public.create_shipment_order('بغداد','أربيل','شحنة2',1000,5,'normal',
              (now()+interval '2 days'),NULL,NULL,NULL);
    v_d2 := public.dispatch_shipment_order(v_o2, v_veh2, v_drv2, (now()+interval '9 hours'),NULL);
    PERFORM set_config('request.jwt.claim.sub', v_drvUser2::text, false);
    PERFORM public.update_my_trip_status(v_d2, 'en_route');
    PERFORM public.update_my_trip_status(v_d2, 'arrived');
    IF public.record_my_delivery_proof(v_d2,'مستلم آخر','delivered',NULL,NULL,NULL,NULL) IS NULL THEN
      RAISE EXCEPTION 'A7 FAILED: NULL client_uuid rejected';
    END IF;
  END; v_pass := v_pass + 1;
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ب: field_visit_checkins
  -- ═══════════════════════════════════════════════════════════

  PERFORM set_config('request.jwt.claim.sub', v_emp::text, false);

  INSERT INTO public.employee_field_visits(tenant_id, employee_id, client_name,
    location_address, purpose, scheduled_at, status)
  VALUES (v_tenant, v_emp, 'عميل الاختبار', 'بغداد - الكرادة', 'متابعة',
          now() + interval '1 hour', 'planned')
  RETURNING id INTO v_visit;

  -- 7) بلا سور: يُقبل ويُعدّ متوافقاً (لا نُعاقب على غياب إعداد إداري)
  SELECT * INTO v_r FROM public.record_field_visit_checkin(v_visit, 33.3152, 44.3661, NULL);
  IF v_r.checkin_id IS NULL THEN RAISE EXCEPTION 'B7 FAILED: checkin rejected'; END IF;
  IF NOT v_r.geofence_ok THEN
    RAISE EXCEPTION 'B7b FAILED: no fence must not mean violation';
  END IF; v_pass := v_pass + 1;

  -- 8) الزيارة انتقلت إلى checked_in
  IF (SELECT status FROM public.employee_field_visits WHERE id = v_visit) <> 'checked_in' THEN
    RAISE EXCEPTION 'B8 FAILED: visit status not updated';
  END IF;
  IF (SELECT check_in_at FROM public.employee_field_visits WHERE id = v_visit) IS NULL THEN
    RAISE EXCEPTION 'B8b FAILED: check_in_at not stamped';
  END IF; v_pass := v_pass + 1;

  -- 9) ★ مع سور: نقطة داخله → متوافق
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
  INSERT INTO public.movement_geofences(tenant_id, name_ar, fence_type,
    center_lat, center_lng, radius_m, location_id, status)
  VALUES (v_tenant, 'سور عميل الاختبار', 'circle', 33.3152, 44.3661, 200, v_loc, 'active')
  RETURNING id INTO v_fence;

  PERFORM set_config('request.jwt.claim.sub', v_emp::text, false);
  SELECT * INTO v_r FROM public.record_field_visit_checkin(v_visit, 33.3153, 44.3662, NULL);
  IF NOT v_r.geofence_ok THEN
    RAISE EXCEPTION 'B9 FAILED: point inside fence flagged as outside';
  END IF; v_pass := v_pass + 1;

  -- 10) ★★ نقطة بعيدة → مخالفة مرصودة
  SELECT * INTO v_r FROM public.record_field_visit_checkin(v_visit, 33.5000, 44.6000, 'من بعيد');
  IF v_r.geofence_ok THEN
    RAISE EXCEPTION 'B10 FAILED: point 25km away marked as inside fence';
  END IF;
  IF v_r.distance_km < 10 THEN
    RAISE EXCEPTION 'B10b FAILED: distance % km looks wrong', v_r.distance_km;
  END IF;
  RAISE NOTICE '   السور: نقطة على بُعد % كم → مخالفة مرصودة', v_r.distance_km;
  v_pass := v_pass + 1;

  -- 11) إحداثيات فاسدة مرفوضة
  BEGIN
    PERFORM public.record_field_visit_checkin(v_visit, 999, 44.3, NULL);
    RAISE EXCEPTION 'B11 FAILED: latitude 999 accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_LATITUDE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 12) ★ عزل المستأجرين: موظف آخر لا يسجّل على زيارتنا
  PERFORM set_config('request.jwt.claim.sub', v_emp2::text, false);
  BEGIN
    PERFORM public.record_field_visit_checkin(v_visit, 33.3152, 44.3661, NULL);
    RAISE EXCEPTION 'B12 FAILED: cross-tenant checkin allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%VISIT_NOT_FOUND%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ج: fleet_vehicle_documents
  -- ═══════════════════════════════════════════════════════════

  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);

  -- 13) إضافة وثيقة
  IF public.upsert_vehicle_document(v_veh,'insurance',(CURRENT_DATE+365)::date,NULL) IS NULL THEN
    RAISE EXCEPTION 'C13 FAILED: document insert returned NULL';
  END IF; v_pass := v_pass + 1;

  -- 14) ★ التجديد يُحدّث لا يُكرّر
  PERFORM public.upsert_vehicle_document(v_veh,'insurance',(CURRENT_DATE+730)::date,NULL);
  SELECT count(*) INTO v_n FROM public.fleet_vehicle_documents
   WHERE vehicle_id = v_veh AND lower(doc_type) = 'insurance';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C14 FAILED: renewal created % rows', v_n;
  END IF;
  IF (SELECT expiry_date FROM public.fleet_vehicle_documents
       WHERE vehicle_id = v_veh AND lower(doc_type)='insurance') <> (CURRENT_DATE+730) THEN
    RAISE EXCEPTION 'C14b FAILED: expiry not updated';
  END IF; v_pass := v_pass + 1;

  -- 15) وثيقة منتهية سلفاً مرفوضة
  BEGIN
    PERFORM public.upsert_vehicle_document(v_veh,'permit',(CURRENT_DATE-1)::date,NULL);
    RAISE EXCEPTION 'C15 FAILED: expired document accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ALREADY_EXPIRED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  /*
    16) ★★ التكامل الحقيقي: الوثيقة المنتهية تمنع الإسناد.

    ⚠️ درس من محاولة أولى ضعيفة: استعملتُ v_veh وهي on_trip، فجاء
    المنع من VEHICLE_NOT_AVAILABLE لا من الوثيقة — الاختبار كان
    "ينجح" دون أن يفحص ما ادّعى فحصه. نستعمل الآن مركبة **متاحة**
    ونؤكد أن رمز المنع يخصّ الوثيقة تحديداً.
  */
  DECLARE v_veh3 UUID; v_drvFree UUID;
  BEGIN
    v_veh3 := public.create_fleet_vehicle('TRK-294C','Iveco','S-Way',2024,
                'truck','diesel',8000,25,0);
    /*
      ⚠️ سائق حرّ مطلوب: 0296 أضاف DRIVER_ON_ACTIVE_DISPATCH إلى
      check_assignment_eligibility، و v_drv2 مرتبط برحلة في هذا
      الاختبار. استعماله هنا يجعل المنع يأتي من الارتباط لا الوثيقة —
      نفس فخّ on_trip الذي وقعتُ فيه سابقاً.
    */
    v_drvFree := public.create_fleet_driver('سائق حر 294','LIC-294F','heavy',
                   (CURRENT_DATE+300)::date,'0779',NULL);

    -- قبل أي وثيقة: مؤهَّلة
    SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh3, v_drvFree);
    IF NOT v_r.is_eligible THEN
      RAISE EXCEPTION 'C16a FAILED: clean vehicle blocked (% — %)',
        v_r.blocker_code, v_r.blocker_msg;
    END IF;

    -- وثيقة صالحة: تبقى مؤهَّلة
    PERFORM public.upsert_vehicle_document(v_veh3,'insurance',(CURRENT_DATE+365)::date,NULL);
    SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh3, v_drvFree);
    IF NOT v_r.is_eligible THEN
      RAISE EXCEPTION 'C16b FAILED: valid document blocked assignment (%)', v_r.blocker_code;
    END IF;

    -- ★ نُنهي الوثيقة → يجب أن يُمنع الإسناد **بسببها**
    UPDATE public.fleet_vehicle_documents SET expiry_date = CURRENT_DATE - 5
     WHERE vehicle_id = v_veh3 AND lower(doc_type) = 'insurance';

    SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh3, v_drvFree);
    IF v_r.is_eligible THEN
      RAISE EXCEPTION 'C16c FAILED: expired document did NOT block assignment';
    END IF;
    IF v_r.blocker_msg NOT LIKE '%insurance%' AND v_r.blocker_msg NOT LIKE '%وثيقة%' THEN
      RAISE EXCEPTION 'C16d FAILED: blocked for wrong reason (% — %)',
        v_r.blocker_code, v_r.blocker_msg;
    END IF;
    RAISE NOTICE '   الوثيقة المنتهية تمنع الإسناد فعلاً: %', v_r.blocker_msg;

    -- تجديدها يُعيد الأهلية — يُثبت أن السبب هو الوثيقة وحدها
    PERFORM public.upsert_vehicle_document(v_veh3,'insurance',(CURRENT_DATE+365)::date,NULL);
    SELECT * INTO v_r FROM public.check_assignment_eligibility(v_veh3, v_drvFree);
    IF NOT v_r.is_eligible THEN
      RAISE EXCEPTION 'C16e FAILED: renewal did not restore eligibility (%)', v_r.blocker_code;
    END IF;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة د: logistics_trip_stops
  -- ═══════════════════════════════════════════════════════════

  -- 17) إضافة محطات بترتيب تلقائي
  v_s1 := public.add_dispatch_stop(v_disp,'pickup',  v_loc, NULL);
  v_s2 := public.add_dispatch_stop(v_disp,'delivery',v_loc, NULL);
  IF (SELECT stop_sequence FROM public.logistics_trip_stops WHERE id=v_s1) <> 1
     OR (SELECT stop_sequence FROM public.logistics_trip_stops WHERE id=v_s2) <> 2 THEN
    RAISE EXCEPTION 'D17 FAILED: auto sequence wrong';
  END IF; v_pass := v_pass + 1;

  -- 18) ★ الإدراج الوسطي يُزيح ما بعده لا يُكرّر الرقم
  v_s3 := public.add_dispatch_stop(v_disp,'fuel', NULL, 2);
  IF (SELECT stop_sequence FROM public.logistics_trip_stops WHERE id=v_s3) <> 2 THEN
    RAISE EXCEPTION 'D18 FAILED: inserted stop not at position 2';
  END IF;
  IF (SELECT stop_sequence FROM public.logistics_trip_stops WHERE id=v_s2) <> 3 THEN
    RAISE EXCEPTION 'D18b FAILED: following stop not shifted';
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT stop_sequence FROM public.logistics_trip_stops
     WHERE dispatch_id = v_disp GROUP BY stop_sequence HAVING count(*) > 1) x;
  IF v_n > 0 THEN RAISE EXCEPTION 'D18c FAILED: duplicate sequence numbers'; END IF;
  v_pass := v_pass + 1;

  -- 19) نوع محطة غير صالح مرفوض
  BEGIN
    PERFORM public.add_dispatch_stop(v_disp,'teleport',NULL,NULL);
    RAISE EXCEPTION 'D19 FAILED: invalid stop type accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_STOP_TYPE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 20) تحديث الحالة ثم منع إعادة الفتح
  PERFORM public.update_dispatch_stop_status(v_s1,'completed');
  BEGIN
    PERFORM public.update_dispatch_stop_status(v_s1,'pending');
    RAISE EXCEPTION 'D20 FAILED: closed stop reopened';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%STOP_ALREADY_CLOSED%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 21) العرض يحسب التقدّم
  SELECT total_stops, completed_stops INTO v_r
    FROM public.logistics_dispatch_stops_view WHERE stop_id = v_s1;
  IF v_r.total_stops <> 3 OR v_r.completed_stops <> 1 THEN
    RAISE EXCEPTION 'D21 FAILED: view progress % / %', v_r.completed_stops, v_r.total_stops;
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة هـ: المرفقات والتسعيرة
  -- ═══════════════════════════════════════════════════════════

  PERFORM set_config('request.jwt.claim.sub', v_emp::text, false);
  INSERT INTO public.employee_movement_permits(tenant_id, employee_id,
    destination_name, purpose, valid_until)
  VALUES (v_tenant, v_emp, 'وجهة', 'غرض', now() + interval '3 hours')
  RETURNING id INTO v_permit;

  -- 22) إضافة مرفق
  IF public.add_permit_attachment(v_permit,'doc.pdf','https://x/y.pdf',1024) IS NULL THEN
    RAISE EXCEPTION 'E22 FAILED: attachment returned NULL';
  END IF; v_pass := v_pass + 1;

  -- 23) ملف ضخم مرفوض
  BEGIN
    PERFORM public.add_permit_attachment(v_permit,'big.zip','https://x/b.zip',99999999);
    RAISE EXCEPTION 'E23 FAILED: oversized file accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FILE_TOO_LARGE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 24) تسعيرة ناقل + التحديث لا يُراكم
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
  PERFORM public.upsert_carrier_rate(v_carrier,'بغداد','البصرة',250000);
  PERFORM public.upsert_carrier_rate(v_carrier,' بغداد ','البصرة',275000);
  SELECT count(*) INTO v_n FROM public.logistics_carrier_rates WHERE carrier_id = v_carrier;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'E24 FAILED: rate upsert created % rows', v_n;
  END IF;
  IF (SELECT rate_amount FROM public.logistics_carrier_rates
       WHERE carrier_id = v_carrier) <> 275000 THEN
    RAISE EXCEPTION 'E24b FAILED: rate not updated';
  END IF; v_pass := v_pass + 1;

  -- 25) تسعيرة سالبة مرفوضة
  BEGIN
    PERFORM public.upsert_carrier_rate(v_carrier,'أ','ب',-5);
    RAISE EXCEPTION 'E25 FAILED: negative rate accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_RATE_AMOUNT%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة و: لقطات المؤشرات
  -- ═══════════════════════════════════════════════════════════

  -- 26) اللقطة تُكتب
  IF public.capture_logistics_kpi_snapshot_for_tenant(v_tenant, CURRENT_DATE) IS NULL THEN
    RAISE EXCEPTION 'F26 FAILED: snapshot returned NULL';
  END IF; v_pass := v_pass + 1;

  -- 27) ★ لقطة واحدة لكل يوم — التكرار يُحدّث
  PERFORM public.capture_logistics_kpi_snapshot_for_tenant(v_tenant, CURRENT_DATE);
  SELECT count(*) INTO v_n FROM public.logistics_kpi_snapshots
   WHERE tenant_id = v_tenant AND snapshot_date = CURRENT_DATE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'F27 FAILED: % snapshots for one day', v_n;
  END IF; v_pass := v_pass + 1;

  -- 28) المُشغِّل يمرّ على المستأجرين
  SELECT count(*) INTO v_n FROM public.run_logistics_kpi_snapshot_cron(CURRENT_DATE);
  IF v_n < 1 THEN
    RAISE EXCEPTION 'F28 FAILED: cron processed no tenants';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ز: لا جدول ميت + الأمان
  -- ═══════════════════════════════════════════════════════════

  -- 29) ★★ كل جدول مستهدَف فيه صفوف فعلية الآن
  DECLARE v_empty TEXT := ''; v_t TEXT; v_c BIGINT;
  BEGIN
    FOREACH v_t IN ARRAY ARRAY['field_visit_checkins','fleet_vehicle_documents',
      'logistics_trip_stops','movement_permit_attachments',
      'logistics_carrier_rates','logistics_kpi_snapshots'] LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_c;
      IF v_c = 0 THEN v_empty := v_empty || ' ' || v_t; END IF;
    END LOOP;
    IF v_empty <> '' THEN
      RAISE EXCEPTION 'G29 FAILED: tables still empty after exercising:%', v_empty;
    END IF;
  END; v_pass := v_pass + 1;

  -- 30) anon محروم من كل الدوال الجديدة
  SELECT string_agg(p.proname,', ') INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('record_field_visit_checkin','upsert_vehicle_document',
                      'add_dispatch_stop','update_dispatch_stop_status',
                      'add_permit_attachment','upsert_carrier_rate',
                      'capture_logistics_kpi_snapshot_for_tenant',
                      'run_logistics_kpi_snapshot_cron','record_my_delivery_proof')
    AND has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'G30 FAILED: anon can execute %', v_txt; END IF;
  v_pass := v_pass + 1;

  -- 31) دوال cron محجوبة عن authenticated
  IF has_function_privilege('authenticated',
       'public.run_logistics_kpi_snapshot_cron(date)','EXECUTE') THEN
    RAISE EXCEPTION 'G31 FAILED: authenticated can run kpi cron';
  END IF; v_pass := v_pass + 1;

  -- 32) الجدول المهجور باقٍ وموثَّق
  IF to_regclass('public.logistics_shipments') IS NULL THEN
    RAISE EXCEPTION 'G32 FAILED: deprecated table dropped';
  END IF;
  IF obj_description('public.logistics_shipments'::regclass) NOT LIKE '%مهجور%' THEN
    RAISE EXCEPTION 'G32b FAILED: deprecation not documented';
  END IF; v_pass := v_pass + 1;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  ✅ 0294: % / 32 اختباراً نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════';
END $outer$;
