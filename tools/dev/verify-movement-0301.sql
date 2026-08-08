-- ============================================================================
-- FILE: tools/dev/verify-movement-0301.sql
-- PURPOSE: اختبار سلوكي للجولة ١ — حارس السائق · نوع السائق · المفاتيح الأجنبية
-- USAGE:   psql -d <db> -f tools/dev/verify-movement-0301.sql
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS v0301_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE v0301_results;

DO $$
DECLARE
  v_tenant UUID;
  v_emp_drv UUID := gen_random_uuid();  -- سائق موظف
  v_con_drv UUID := gen_random_uuid();  -- سائق متعاقد
  v_plain   UUID := gen_random_uuid();  -- ليس سائقاً
  v_mgr     UUID := gen_random_uuid();  -- مدير لوجستيات
  v_did     UUID;
  v_cnt     INT;
  v_bool    BOOLEAN;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر 0301', 'verify-0301-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO auth.users (id,email) VALUES
    (v_emp_drv,'v0301-empdrv@test.local'),
    (v_con_drv,'v0301-condrv@test.local'),
    (v_plain,  'v0301-plain@test.local'),
    (v_mgr,    'v0301-mgr@test.local');

  INSERT INTO public.profiles (id,tenant_id,full_name,email,role) VALUES
    (v_emp_drv,v_tenant,'سائق موظف','v0301-empdrv@test.local','employee'),
    (v_con_drv,v_tenant,'سائق متعاقد','v0301-condrv@test.local','employee'),
    (v_plain,  v_tenant,'موظف عادي','v0301-plain@test.local','employee'),
    (v_mgr,    v_tenant,'مدير لوجستيات','v0301-mgr@test.local','logistics');

  -- ══ 1) سائق موظف: employee مع employee_id ═══════════════════════════
  BEGIN
    INSERT INTO public.logistics_drivers
      (tenant_id,driver_name_ar,license_number,license_class,license_expiry_date,user_id,employee_id,driver_type)
    VALUES (v_tenant,'سائق موظف','V0301-EMP','C','2030-01-01',v_emp_drv,v_emp_drv,'employee');
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('سائق موظف: driver_type=employee مع employee_id', TRUE, 'أُدرج');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('سائق موظف: driver_type=employee مع employee_id', FALSE, SQLERRM);
  END;

  -- ══ 2) سائق متعاقد: contractor بلا employee_id ══════════════════════
  BEGIN
    INSERT INTO public.logistics_drivers
      (tenant_id,driver_name_ar,license_number,license_class,license_expiry_date,user_id,driver_type)
    VALUES (v_tenant,'سائق متعاقد','V0301-CON','C','2030-01-01',v_con_drv,'contractor');
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('سائق متعاقد: contractor بلا employee_id', TRUE, 'أُدرج');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('سائق متعاقد: contractor بلا employee_id', FALSE, SQLERRM);
  END;

  -- ══ 3) تناقض: contractor مع employee_id ═════════════════════════════
  BEGIN
    INSERT INTO public.logistics_drivers
      (tenant_id,driver_name_ar,license_number,license_class,license_expiry_date,employee_id,driver_type)
    VALUES (v_tenant,'متناقض','V0301-BAD1','C','2030-01-01',v_plain,'contractor');
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('يرفض contractor مع employee_id', FALSE, 'قُبل التناقض!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('يرفض contractor مع employee_id', TRUE, 'رُفض كما يجب');
  END;

  -- ══ 4) تناقض عكسي: employee بلا employee_id ═════════════════════════
  BEGIN
    INSERT INTO public.logistics_drivers
      (tenant_id,driver_name_ar,license_number,license_class,license_expiry_date,driver_type)
    VALUES (v_tenant,'متناقض2','V0301-BAD2','C','2030-01-01','employee');
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('يرفض employee بلا employee_id', FALSE, 'قُبل التناقض!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('يرفض employee بلا employee_id', TRUE, 'رُفض كما يجب');
  END;

  -- ══ 5-7) is_current_user_driver لكل حالة ════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp_drv::text, TRUE);
  SELECT public.is_current_user_driver() INTO v_bool;
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('السائق الموظف يُعرَّف سائقاً', v_bool IS TRUE, 'result=' || v_bool);

  PERFORM set_config('request.jwt.claim.sub', v_con_drv::text, TRUE);
  SELECT public.is_current_user_driver() INTO v_bool;
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('السائق المتعاقد يُعرَّف سائقاً', v_bool IS TRUE, 'result=' || v_bool);

  PERFORM set_config('request.jwt.claim.sub', v_plain::text, TRUE);
  SELECT public.is_current_user_driver() INTO v_bool;
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('غير السائق يُرفض', v_bool IS FALSE, 'result=' || v_bool);

  -- ══ 8) السائق الموقوف يفقد الوصول ═══════════════════════════════════
  UPDATE public.logistics_drivers SET status='suspended' WHERE license_number='V0301-EMP';
  PERFORM set_config('request.jwt.claim.sub', v_emp_drv::text, TRUE);
  SELECT public.is_current_user_driver() INTO v_bool;
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('السائق الموقوف يفقد الوصول', v_bool IS FALSE, 'result=' || v_bool);
  UPDATE public.logistics_drivers SET status='active' WHERE license_number='V0301-EMP';

  -- ══ 9) السائق لا يملك دور logistics — الفصل صحيح ════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp_drv::text, TRUE);
  BEGIN
    PERFORM public.movement_require_role('logistics');
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('السائق لا يُمنح دور مدير الأسطول', FALSE, 'مرّ — تصعيد امتياز!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('السائق لا يُمنح دور مدير الأسطول', SQLERRM LIKE '%NOT_AUTHORIZED%', SQLERRM);
  END;

  -- ══ 10) ومع ذلك هو سائق ⇒ الفصل بين المفهومين ═══════════════════════
  SELECT public.is_current_user_driver() INTO v_bool;
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('السائق بلا دور بوابة يبقى سائقاً', v_bool IS TRUE, 'result=' || v_bool);

  -- ══ 11) مدير اللوجستيات ليس سائقاً ══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  SELECT public.is_current_user_driver() INTO v_bool;
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('مدير الأسطول ليس سائقاً تلقائياً', v_bool IS FALSE, 'result=' || v_bool);

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);

  -- ══ 12-16) المفاتيح الأجنبية الخمسة موجودة ══════════════════════════
  INSERT INTO v0301_results(name,passed,detail)
  SELECT 'FK على ' || t,
         EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_employee_id_fkey' AND contype='f'),
         'checked'
  FROM unnest(ARRAY[
    'employee_movement_permits','employee_movements_log',
    'employee_field_visits','employee_missions','employee_movement_violations'
  ]) AS t;

  -- ══ 17) FK يرفض employee_id وهمياً ══════════════════════════════════
  BEGIN
    INSERT INTO public.employee_missions
      (tenant_id,employee_id,mission_title,destination,mission_type,start_date,end_date)
    VALUES (v_tenant,'99999999-9999-4999-8999-999999999999','وهمي','بغداد','official_mission','2026-01-01','2026-01-02');
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('FK يرفض employee_id غير موجود', FALSE, 'قُبل اليتيم!');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('FK يرفض employee_id غير موجود', TRUE, 'رُفض كما يجب');
  END;

  -- ══ 18) FK يقبل employee_id صحيحاً ══════════════════════════════════
  BEGIN
    INSERT INTO public.employee_missions
      (tenant_id,employee_id,mission_title,destination,mission_type,start_date,end_date)
    VALUES (v_tenant,v_plain,'مهمة حقيقية','بغداد','official_mission','2026-01-01','2026-01-02');
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('FK يقبل employee_id صحيحاً', TRUE, 'أُدرج');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO v0301_results(name,passed,detail) VALUES
      ('FK يقبل employee_id صحيحاً', FALSE, SQLERRM);
  END;

  -- ══ 19) ON DELETE CASCADE ═══════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.employee_missions WHERE employee_id = v_plain;
  DELETE FROM public.profiles WHERE id = v_plain;
  SELECT count(*) INTO v_cnt FROM public.employee_missions WHERE employee_id = v_plain;
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('حذف الملف يُنظّف سجلات حركته (CASCADE)', v_cnt = 0, 'remaining=' || v_cnt);

  -- ══ 20) FK يشير إلى profiles لا employees ═══════════════════════════
  SELECT count(*) INTO v_cnt
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
   WHERE tc.constraint_name = 'employee_movement_permits_employee_id_fkey'
     AND ccu.table_name = 'profiles';
  INSERT INTO v0301_results(name,passed,detail) VALUES
    ('FK يشير إلى profiles (متسق مع movements_log القديم)', v_cnt = 1, 'refs profiles=' || v_cnt);

  -- ══ 21) anon لا ينفّذ ═══════════════════════════════════════════════
  INSERT INTO v0301_results(name,passed,detail)
  SELECT 'anon لا ينفّذ is_current_user_driver',
         NOT has_function_privilege('anon','public.is_current_user_driver()','EXECUTE'), 'checked';

  -- ══ 22) authenticated ينفّذ ═════════════════════════════════════════
  INSERT INTO v0301_results(name,passed,detail)
  SELECT 'authenticated ينفّذ is_current_user_driver',
         has_function_privilege('authenticated','public.is_current_user_driver()','EXECUTE'), 'checked';

  -- تنظيف
  DELETE FROM public.employee_missions WHERE tenant_id = v_tenant;
  DELETE FROM public.logistics_drivers WHERE tenant_id = v_tenant;
  DELETE FROM public.profiles WHERE tenant_id = v_tenant;
  DELETE FROM auth.users WHERE id IN (v_emp_drv,v_con_drv,v_plain,v_mgr);
  DELETE FROM public.tenants WHERE id = v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار",
       detail AS "التفصيل"
  FROM v0301_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM v0301_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  0301 verify: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ 0301 verify: % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
