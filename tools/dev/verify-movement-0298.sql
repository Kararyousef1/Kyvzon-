-- ============================================================================
-- اختبار سلوكي: 0298 — العمل دون اتصال لكل عمليات السائق
-- ============================================================================
\set ON_ERROR_STOP on

DO $outer$
DECLARE
  v_tenant UUID; v_boss UUID; v_u1 UUID; v_u2 UUID;
  v_veh UUID; v_veh2 UUID; v_drv UUID; v_drv2 UUID;
  v_ord UUID; v_ord2 UUID; v_disp UUID; v_disp2 UUID;
  v_cu1 UUID; v_cu2 UUID; v_cu3 UUID; v_cu4 UUID; v_cu5 UUID;
  v_r RECORD; v_n INT; v_txt TEXT; v_id1 UUID; v_id2 UUID;
  v_pass INT := 0;
BEGIN
  -- ══════════════ التهيئة ══════════════
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-298','t298') RETURNING id INTO v_tenant;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'b298@l') RETURNING id INTO v_boss;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'d298a@l') RETURNING id INTO v_u1;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'d298b@l') RETURNING id INTO v_u2;

  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_boss, v_tenant, 'مدير',  'logistics'),
    (v_u1,   v_tenant, 'سائق أ','employee'),
    (v_u2,   v_tenant, 'سائق ب','employee');
-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments(tenant_id,user_id,portal_role,is_active)
    VALUES (v_tenant, v_boss, 'logistics', true)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;

  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);

  v_veh  := public.create_fleet_vehicle('OF-1','Volvo','FH',2022,'truck','diesel',12000,40,1000);
  v_veh2 := public.create_fleet_vehicle('OF-2','MAN','TGX',2023,'truck','diesel',9000,30,2000);
  v_drv  := public.create_fleet_driver('سائق أ','L298A','heavy',(CURRENT_DATE+300)::date,'077',NULL);
  v_drv2 := public.create_fleet_driver('سائق ب','L298B','heavy',(CURRENT_DATE+300)::date,'078',NULL);
  PERFORM public.link_driver_account(v_drv,  v_u1);
  PERFORM public.link_driver_account(v_drv2, v_u2);

  v_ord  := public.create_shipment_order('بغداد','البصرة','شحنة أ',3000,12,'normal',
              (now()+interval '1 day'),NULL,NULL,NULL);
  v_ord2 := public.create_shipment_order('بغداد','أربيل','شحنة ب',2000,8,'normal',
              (now()+interval '2 days'),NULL,NULL,NULL);
  v_disp  := public.dispatch_shipment_order(v_ord,  v_veh,  v_drv,  (now()+interval '5 hours'),NULL);
  v_disp2 := public.dispatch_shipment_order(v_ord2, v_veh2, v_drv2, (now()+interval '9 hours'),NULL);

  PERFORM set_config('request.jwt.claim.sub', v_u1::text, false);

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة أ: الفحص idempotent
  -- ═══════════════════════════════════════════════════════════

  v_cu1 := gen_random_uuid();

  -- 1) الفحص الأول ينجح
  SELECT * INTO v_r FROM public.record_my_vehicle_inspection(
    v_disp,'pre_trip','[]'::jsonb, 1100,'سائق أ',NULL, v_cu1, NULL);
  IF v_r.inspection_id IS NULL THEN RAISE EXCEPTION 'A1 FAILED: no id'; END IF;
  v_id1 := v_r.inspection_id; v_pass := v_pass + 1;

  -- 2) ★★ إعادة الإرسال بنفس المعرّف تُرجع الأصل لا صفّاً ثانياً
  SELECT * INTO v_r FROM public.record_my_vehicle_inspection(
    v_disp,'pre_trip','[]'::jsonb, 1100,'سائق أ',NULL, v_cu1, NULL);
  IF v_r.inspection_id <> v_id1 THEN
    RAISE EXCEPTION 'A2 FAILED: retry returned a different id';
  END IF;
  SELECT count(*) INTO v_n FROM public.fleet_vehicle_inspections
   WHERE client_uuid = v_cu1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'A2b FAILED: % rows — DUPLICATE', v_n; END IF;
  v_pass := v_pass + 1;

  -- 3) ★ وقت التنفيذ على الجهاز يُحترم لا وقت الرفع
  v_cu2 := gen_random_uuid();
  SELECT * INTO v_r FROM public.record_my_vehicle_inspection(
    v_disp,'post_trip','[]'::jsonb, NULL,NULL,NULL, v_cu2,
    now() - interval '3 hours');
  IF (SELECT inspected_at FROM public.fleet_vehicle_inspections
       WHERE id = v_r.inspection_id) > now() - interval '2 hours' THEN
    RAISE EXCEPTION 'A3 FAILED: performed_at ignored — timeline corrupted';
  END IF;
  RAISE NOTICE '   الفحص سُجِّل بوقت التنفيذ (قبل 3 ساعات) لا وقت الرفع ✅';
  v_pass := v_pass + 1;

  -- 4) زمن مستقبلي مرفوض
  BEGIN
    PERFORM public.record_my_vehicle_inspection(v_disp,'pre_trip','[]'::jsonb,
      NULL,NULL,NULL, gen_random_uuid(), now() + interval '3 days');
    RAISE EXCEPTION 'A4 FAILED: future timestamp accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERFORMED_AT_IN_FUTURE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 5) زمن موغل في القدم مرفوض
  BEGIN
    PERFORM public.record_my_vehicle_inspection(v_disp,'pre_trip','[]'::jsonb,
      NULL,NULL,NULL, gen_random_uuid(), now() - interval '30 days');
    RAISE EXCEPTION 'A5 FAILED: 30-day-old timestamp accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERFORMED_AT_TOO_OLD%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 6) التحققات السابقة محفوظة
  BEGIN
    PERFORM public.record_my_vehicle_inspection(v_disp2,'pre_trip','[]'::jsonb,
      NULL,NULL,NULL, gen_random_uuid(), NULL);
    RAISE EXCEPTION 'A6 FAILED: colleague dispatch accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_ASSIGNED_TO_YOU%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 7) client_uuid = NULL يعمل (توافق خلفي)
  IF (SELECT inspection_id FROM public.record_my_vehicle_inspection(
        v_disp,'periodic','[]'::jsonb,NULL,NULL,NULL,NULL,NULL)) IS NULL THEN
    RAISE EXCEPTION 'A7 FAILED: NULL client_uuid rejected';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ب: 🔴 الرفع الدفعي المرتَّب
  -- ═══════════════════════════════════════════════════════════

  PERFORM set_config('request.jwt.claim.sub', v_u2::text, false);

  v_cu1 := gen_random_uuid();  -- فحص
  v_cu2 := gen_random_uuid();  -- انطلاق
  v_cu3 := gen_random_uuid();  -- وصول
  v_cu4 := gen_random_uuid();  -- تسليم
  v_cu5 := gen_random_uuid();  -- إكمال

  /*
    ★★★ الاختبار الحاسم: نرسل العمليات **بترتيب معكوس** عمداً.
    لو رُفعت كما وردت لفشل الإكمال (لا ePOD بعد) والوصول (لم ينطلق).
    الترتيب الزمني في الخادم يجب أن يُصلح ذلك.
  */
  CREATE TEMP TABLE _batch_result ON COMMIT DROP AS
  SELECT * FROM public.sync_driver_offline_batch(jsonb_build_array(
    jsonb_build_object('client_uuid', v_cu5, 'operation_type','trip_status',
      'dispatch_id', v_disp2, 'trip_status','completed',
      'performed_at', (now() - interval '10 minutes')),
    jsonb_build_object('client_uuid', v_cu3, 'operation_type','trip_status',
      'dispatch_id', v_disp2, 'trip_status','arrived',
      'performed_at', (now() - interval '40 minutes')),
    jsonb_build_object('client_uuid', v_cu1, 'operation_type','inspection',
      'dispatch_id', v_disp2, 'inspection_type','pre_trip',
      'defects','[]'::jsonb, 'signature_name','سائق ب',
      'performed_at', (now() - interval '2 hours')),
    jsonb_build_object('client_uuid', v_cu4, 'operation_type','delivery_proof',
      'dispatch_id', v_disp2, 'recipient_name','أبو محمد',
      'epod_status','delivered',
      'performed_at', (now() - interval '20 minutes')),
    jsonb_build_object('client_uuid', v_cu2, 'operation_type','trip_status',
      'dispatch_id', v_disp2, 'trip_status','en_route',
      'performed_at', (now() - interval '90 minutes'))
  ));

  -- 8) ★★★ كل العمليات الخمس نجحت رغم الترتيب المعكوس
  SELECT count(*) INTO v_n FROM _batch_result WHERE out_status = 'applied';
  IF v_n <> 5 THEN
    SELECT string_agg(out_operation_type || ':' || out_status || ' ' ||
                      COALESCE(out_error_message,''), E'\n') INTO v_txt
      FROM _batch_result;
    RAISE EXCEPTION 'B8 FAILED: only % of 5 applied:%s', v_n, E'\n' || v_txt;
  END IF;
  RAISE NOTICE '   الدفعة المعكوسة: 5/5 نجحت بالترتيب الزمني ✅';
  v_pass := v_pass + 1;

  -- 9) الرحلة اكتملت فعلاً
  IF (SELECT status FROM public.logistics_dispatches WHERE id = v_disp2)
     <> 'completed' THEN
    RAISE EXCEPTION 'B9 FAILED: dispatch status = %',
      (SELECT status FROM public.logistics_dispatches WHERE id = v_disp2);
  END IF; v_pass := v_pass + 1;

  -- 10) ePOD سُجِّل
  IF NOT EXISTS (SELECT 1 FROM public.logistics_epod WHERE dispatch_id = v_disp2) THEN
    RAISE EXCEPTION 'B10 FAILED: ePOD missing after batch';
  END IF; v_pass := v_pass + 1;

  -- 11) الفحص سُجِّل بوقته الأصلي
  IF NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_inspections
     WHERE client_uuid = v_cu1 AND inspected_at < now() - interval '1 hour') THEN
    RAISE EXCEPTION 'B11 FAILED: inspection timestamp not preserved';
  END IF; v_pass := v_pass + 1;

  -- 12) ★★ إعادة رفع الدفعة نفسها: كلها duplicate لا تكرار
  SELECT count(*) INTO v_n FROM public.sync_driver_offline_batch(jsonb_build_array(
    jsonb_build_object('client_uuid', v_cu1, 'operation_type','inspection',
      'dispatch_id', v_disp2, 'inspection_type','pre_trip', 'defects','[]'::jsonb,
      'performed_at', (now() - interval '2 hours')),
    jsonb_build_object('client_uuid', v_cu4, 'operation_type','delivery_proof',
      'dispatch_id', v_disp2, 'recipient_name','أبو محمد',
      'performed_at', (now() - interval '20 minutes'))
  )) WHERE out_status = 'duplicate';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'B12 FAILED: % marked duplicate (expected 2)', v_n;
  END IF;

  -- ولا صفوف إضافية
  SELECT count(*) INTO v_n FROM public.fleet_vehicle_inspections
   WHERE client_uuid = v_cu1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'B12b FAILED: inspection duplicated'; END IF;
  SELECT count(*) INTO v_n FROM public.logistics_epod WHERE dispatch_id = v_disp2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'B12c FAILED: ePOD duplicated'; END IF;
  RAISE NOTICE '   إعادة رفع الدفعة: كلها duplicate بلا تكرار ✅';
  v_pass := v_pass + 1;

  -- 13) ★ عملية فاسدة لا تُسقط الدفعة
  DECLARE v_good UUID := gen_random_uuid();
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_u1::text, false);
    SELECT count(*) INTO v_n FROM public.sync_driver_offline_batch(jsonb_build_array(
      jsonb_build_object('client_uuid', gen_random_uuid(),
        'operation_type','inspection', 'dispatch_id', v_disp2,
        'inspection_type','pre_trip','defects','[]'::jsonb,
        'performed_at', now()),
      jsonb_build_object('client_uuid', v_good,
        'operation_type','inspection', 'dispatch_id', v_disp,
        'inspection_type','post_trip','defects','[]'::jsonb,
        'performed_at', now())
    )) WHERE out_status = 'applied';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'B13 FAILED: valid op did not survive a bad one (% applied)', v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_inspections
                    WHERE client_uuid = v_good) THEN
      RAISE EXCEPTION 'B13b FAILED: good operation lost';
    END IF;
  END; v_pass := v_pass + 1;

  -- 14) الفشل مُسجَّل لا صامت
  SELECT count(*) INTO v_n FROM public.driver_offline_operations
   WHERE status = 'failed' AND error_message IS NOT NULL;
  IF v_n < 1 THEN RAISE EXCEPTION 'B14 FAILED: failure not recorded'; END IF;
  v_pass := v_pass + 1;

  -- 15) العرض يُظهر الفشل للمُرسِل
  SELECT count(*) INTO v_n FROM public.driver_offline_sync_issues;
  IF v_n < 1 THEN RAISE EXCEPTION 'B15 FAILED: issues view empty'; END IF;
  SELECT error_message INTO v_txt FROM public.driver_offline_sync_issues LIMIT 1;
  IF v_txt IS NULL THEN RAISE EXCEPTION 'B15b FAILED: no error detail'; END IF;
  v_pass := v_pass + 1;

  -- 16) العرض يحسب تأخّر الرفع
  IF (SELECT delay_hours FROM public.driver_offline_sync_issues LIMIT 1) IS NULL THEN
    RAISE EXCEPTION 'B16 FAILED: delay not computed';
  END IF; v_pass := v_pass + 1;

  -- 17) client_uuid إلزامي في الدفعة
  SELECT out_status INTO v_txt FROM public.sync_driver_offline_batch(jsonb_build_array(
    jsonb_build_object('operation_type','inspection','dispatch_id', v_disp,
      'performed_at', now())));
  IF v_txt <> 'failed' THEN
    RAISE EXCEPTION 'B17 FAILED: missing client_uuid not rejected';
  END IF; v_pass := v_pass + 1;

  -- 18) نوع عملية مجهول يُرفض
  SELECT out_error_message INTO v_txt FROM public.sync_driver_offline_batch(jsonb_build_array(
    jsonb_build_object('client_uuid', gen_random_uuid(),
      'operation_type','hack','dispatch_id', v_disp, 'performed_at', now())));
  IF v_txt NOT LIKE '%UNKNOWN_OPERATION_TYPE%' THEN
    RAISE EXCEPTION 'B18 FAILED: unknown type accepted (%)', COALESCE(v_txt,'null');
  END IF; v_pass := v_pass + 1;

  -- 19) حد حجم الدفعة
  BEGIN
    PERFORM public.sync_driver_offline_batch(
      (SELECT jsonb_agg(jsonb_build_object('client_uuid', gen_random_uuid(),
         'operation_type','inspection','dispatch_id', v_disp,
         'performed_at', now()))
         FROM generate_series(1,150)));
    RAISE EXCEPTION 'B19 FAILED: 150-op batch accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%BATCH_TOO_LARGE%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 20) مصفوفة غير صالحة مرفوضة
  BEGIN
    PERFORM public.sync_driver_offline_batch('{"not":"array"}'::jsonb);
    RAISE EXCEPTION 'B20 FAILED: non-array accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%MUST_BE_ARRAY%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ج: العيب الحرج دون اتصال
  -- ═══════════════════════════════════════════════════════════

  -- 21) ★★ عيب حرج مؤجَّل يوقف المركبة عند الرفع
  DECLARE v_ord3 UUID; v_disp3 UUID; v_cuC UUID := gen_random_uuid();
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
    v_ord3 := public.create_shipment_order('بغداد','كركوك','شحنة ج',900,4,'normal',
                (now()+interval '3 days'),NULL,NULL,NULL);
    -- v_veh متاحة؟ الرحلة الأولى ما زالت جارية — نستعمل مركبة ثالثة
    DECLARE v_veh3 UUID; v_drv3 UUID; v_u3 UUID;
    BEGIN
      v_veh3 := public.create_fleet_vehicle('OF-3','Iveco','S',2024,'truck',
                  'diesel',8000,25,500);
      INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'d298c@l')
        RETURNING id INTO v_u3;
      INSERT INTO public.profiles(id,tenant_id,full_name,role)
        VALUES (v_u3, v_tenant, 'سائق ج', 'employee');
      v_drv3 := public.create_fleet_driver('سائق ج','L298C','heavy',
                  (CURRENT_DATE+300)::date,'079',NULL);
      PERFORM public.link_driver_account(v_drv3, v_u3);
      v_disp3 := public.dispatch_shipment_order(v_ord3, v_veh3, v_drv3,
                   (now()+interval '12 hours'), NULL);

      PERFORM set_config('request.jwt.claim.sub', v_u3::text, false);
      SELECT count(*) INTO v_n FROM public.sync_driver_offline_batch(
        jsonb_build_array(jsonb_build_object(
          'client_uuid', v_cuC, 'operation_type','inspection',
          'dispatch_id', v_disp3, 'inspection_type','pre_trip',
          'defects', '[{"code":"BRAKE_FAILURE","severity":"critical"}]'::jsonb,
          'performed_at', (now() - interval '1 hour'))))
       WHERE out_status = 'applied';
      IF v_n <> 1 THEN RAISE EXCEPTION 'C21 FAILED: critical inspection not applied'; END IF;

      IF NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_inspections
                      WHERE client_uuid = v_cuC AND has_critical) THEN
        RAISE EXCEPTION 'C21b FAILED: critical flag lost through batch';
      END IF;
      RAISE NOTICE '   عيب حرج مؤجَّل: سُجِّل ورُصد عند الرفع ✅';
    END;
  END; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة د: العزل والأمان
  -- ═══════════════════════════════════════════════════════════

  -- 22) ★ السجل معزول بالمستأجر
  PERFORM set_config('request.jwt.claim.sub', v_u1::text, false);
  IF EXISTS (SELECT 1 FROM public.driver_offline_operations
              WHERE tenant_id <> v_tenant) THEN
    RAISE EXCEPTION 'D22 FAILED: cross-tenant rows visible';
  END IF; v_pass := v_pass + 1;

  -- 23) غير السائق لا يرفع دفعة
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, false);
  BEGIN
    PERFORM public.sync_driver_offline_batch('[]'::jsonb);
    RAISE EXCEPTION 'D23 FAILED: non-driver synced a batch';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_A_DRIVER%' THEN RAISE; END IF;
  END; v_pass := v_pass + 1;

  -- 24) anon محروم
  SELECT string_agg(p.proname,', ') INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('record_my_vehicle_inspection','sync_driver_offline_batch')
    AND has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'D24 FAILED: anon can execute %', v_txt; END IF;
  IF has_table_privilege('anon','public.driver_offline_operations','SELECT') THEN
    RAISE EXCEPTION 'D24b FAILED: anon can read offline ops';
  END IF; v_pass := v_pass + 1;

  -- 25) نسخة واحدة من دالة الفحص
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='record_my_vehicle_inspection';
  IF v_n <> 1 THEN RAISE EXCEPTION 'D25 FAILED: % overloads', v_n; END IF;
  v_pass := v_pass + 1;

  -- 26) السجل يميّز العمليات المؤجَّلة في التدقيق
  IF NOT EXISTS (SELECT 1 FROM public.movement_audit_events
     WHERE event_type='vehicle_inspection_recorded'
       AND (payload->>'offline')::boolean = true) THEN
    RAISE EXCEPTION 'D26 FAILED: offline flag not audited';
  END IF; v_pass := v_pass + 1;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  ✅ 0298: % / 26 اختباراً نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════';
END $outer$;
