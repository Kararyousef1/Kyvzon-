-- ============================================================================
-- FILE: tools/dev/verify-portal-units-sync.sql
-- PURPOSE: اختبار سلوكي لمزامنة إسناد الوحدات (الخطوة ٢)
--          يحاكي ما يفعله PortalUnitService.syncUserUnits من المعالج.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vs_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vs_results;

DO $$
DECLARE
  v_tenant UUID;
  v_dept_a UUID;
  v_dept_b UUID;
  v_branch UUID;
  v_user   UUID := gen_random_uuid();
  v_cnt    INT;
  v_txt    TEXT;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر مزامنة', 'verify-sync-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'قسم أ') RETURNING id INTO v_dept_a;
  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'قسم ب') RETURNING id INTO v_dept_b;
  INSERT INTO public.branches (tenant_id,name_ar,code)
  VALUES (v_tenant,'فرع بغداد','BGW') RETURNING id INTO v_branch;

  INSERT INTO auth.users (id,email) VALUES (v_user,'vs-mgr@test.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department)
  VALUES (v_user,v_tenant,'مدير','vs-mgr@test.local','manager','قسم أ');

  -- ══ 1) الإسناد الأول (إنشاء) ═════════════════════════════════════════
  INSERT INTO public.portal_unit_assignments
    (tenant_id,user_id,base_role,unit_key,scope_type,scope_id,is_active,origin)
  VALUES (v_tenant,v_user,'manager','movement','department',v_dept_a,TRUE,'manual');

  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND is_active;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('الإسناد الأول ينشئ صفاً فعّالاً', v_cnt=1, 'count='||v_cnt);

  -- ══ 2) تغيير النطاق: قسم أ → قسم ب ═══════════════════════════════════
  -- syncUserUnits يُعطّل القديم ثم يُدرج الجديد (المفتاح يشمل scope_id)
  UPDATE public.portal_unit_assignments SET is_active=FALSE
   WHERE user_id=v_user AND scope_id=v_dept_a;
  INSERT INTO public.portal_unit_assignments
    (tenant_id,user_id,base_role,unit_key,scope_type,scope_id,is_active,origin)
  VALUES (v_tenant,v_user,'manager','movement','department',v_dept_b,TRUE,'manual');

  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND is_active;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('تغيير النطاق يُبقي إسناداً فعّالاً واحداً', v_cnt=1, 'active='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments WHERE user_id=v_user;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('لا حذف — الصف القديم محفوظ معطَّلاً', v_cnt=2, 'total='||v_cnt);

  -- ══ 3) نطاق فرع ══════════════════════════════════════════════════════
  INSERT INTO public.portal_unit_assignments
    (tenant_id,user_id,base_role,unit_key,scope_type,scope_id,is_active,origin)
  VALUES (v_tenant,v_user,'manager','hr','branch',v_branch,TRUE,'manual');

  SELECT scope_type INTO v_txt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND unit_key='hr';
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('نطاق الفرع مقبول', v_txt='branch', 'scope='||COALESCE(v_txt,'NULL'));

  -- ══ 4) نزع وحدة (تعطيل لا حذف) ═══════════════════════════════════════
  UPDATE public.portal_unit_assignments SET is_active=FALSE
   WHERE user_id=v_user AND unit_key='hr';

  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND unit_key='hr' AND is_active;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('نزع الوحدة يُعطّلها ولا يحذفها', v_cnt=0, 'active_hr='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND unit_key='hr';
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('صف الوحدة المنزوعة باقٍ للتدقيق', v_cnt=1, 'rows='||v_cnt);

  -- ══ 5) إعادة التفعيل ═════════════════════════════════════════════════
  UPDATE public.portal_unit_assignments SET is_active=TRUE
   WHERE user_id=v_user AND unit_key='hr';
  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND unit_key='hr' AND is_active;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('إعادة الإسناد تُفعّل الصف القائم بلا تكرار', v_cnt=1, 'active='||v_cnt);

  -- ══ 6) تغيير الدور إلى موظف يُعطّل كل الوحدات ════════════════════════
  UPDATE public.portal_unit_assignments SET is_active=FALSE WHERE user_id=v_user;
  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND is_active;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('تغيير الدور لموظف يُعطّل كل الوحدات', v_cnt=0, 'active='||v_cnt);

  -- ══ 7) القيد يرفض نطاق قسم بلا معرّف (سيناريو openEdit المكسور) ══════
  BEGIN
    INSERT INTO public.portal_unit_assignments
      (tenant_id,user_id,base_role,unit_key,scope_type,scope_id,is_active,origin)
    VALUES (v_tenant,v_user,'manager','finance','department',NULL,TRUE,'manual');
    INSERT INTO vs_results(name,passed,detail) VALUES
      ('يرفض نطاق قسم بلا معرّف', FALSE, 'قُبل — سيسبب إسناداً فاسداً!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vs_results(name,passed,detail) VALUES
      ('يرفض نطاق قسم بلا معرّف', TRUE, 'رُفض كما يجب');
  END;

  -- ══ 8) مستخدم من مستأجر آخر لا يمكن إسناده ═══════════════════════════
  BEGIN
    INSERT INTO public.portal_unit_assignments
      (tenant_id,user_id,base_role,unit_key,scope_type,scope_id,is_active,origin)
    VALUES (v_tenant,gen_random_uuid(),'manager','movement','department',v_dept_a,TRUE,'manual');
    INSERT INTO vs_results(name,passed,detail) VALUES
      ('يرفض user_id غير موجود', FALSE, 'قُبل!');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO vs_results(name,passed,detail) VALUES
      ('يرفض user_id غير موجود', TRUE, 'رُفض كما يجب');
  END;

  -- ══ 9) وحدتان مختلفتان لنفس المستخدم ═════════════════════════════════
  --
  -- تصحيح توقّع (2026-08-05): كان هذا يُفعّل كل صفوف movement بما فيها
  -- الصف المعطَّل لقسم أ (من اختبار ٢)، فصارت ثلاثة صفوف فعّالة —
  -- وهو ما أوقع اختبارَي 10 و11. الدالة كانت صحيحة وتوقّعي خاطئاً.
  -- نُفعّل الصف الأحدث لكل وحدة فقط، كما يفعل syncUserUnits.
  UPDATE public.portal_unit_assignments SET is_active=TRUE
   WHERE user_id=v_user AND unit_key='hr';
  UPDATE public.portal_unit_assignments SET is_active=TRUE
   WHERE user_id=v_user AND unit_key='movement' AND scope_id=v_dept_b;

  SELECT count(DISTINCT unit_key) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND is_active;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('يقبل وحدتين مختلفتين لنفس المستخدم', v_cnt=2, 'units='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.portal_unit_assignments
   WHERE user_id=v_user AND is_active;
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('عدد الصفوف الفعّالة = عدد الوحدات (لا ازدواج نطاق)', v_cnt=2, 'active_rows='||v_cnt);

  -- ══ 10) my_portal_units تعكس الفعّال فقط ═════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_user::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_portal_units();
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('my_portal_units تُرجع الفعّال فقط', v_cnt=2, 'count='||v_cnt);

  -- ══ 11) بعد التعطيل تختفي ════════════════════════════════════════════
  UPDATE public.portal_unit_assignments SET is_active=FALSE
   WHERE user_id=v_user AND unit_key='hr';
  SELECT count(*) INTO v_cnt FROM public.my_portal_units();
  INSERT INTO vs_results(name,passed,detail) VALUES
    ('الوحدة المعطَّلة تختفي من my_portal_units', v_cnt=1, 'count='||v_cnt);

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.portal_unit_assignments WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id=v_user;
  DELETE FROM public.branches WHERE tenant_id=v_tenant;
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM vs_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vs_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  مزامنة الوحدات: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
