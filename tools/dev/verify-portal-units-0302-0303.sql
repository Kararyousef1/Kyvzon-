-- ============================================================================
-- FILE: tools/dev/verify-portal-units-0302-0303.sql
-- PURPOSE: اختبار سلوكي لمعمارية الوحدات — Scoped Roles ومنظور الفريق
-- USAGE:   psql -d <db> -f tools/dev/verify-portal-units-0302-0303.sql
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vu_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vu_results;

DO $$
DECLARE
  v_tenant   UUID;
  v_root     UUID;  -- قسم التقنية (جذر)
  v_mid      UUID;  -- التطوير
  v_leaf     UUID;  -- الواجهات
  v_other    UUID;  -- المالية (خارج نطاق المدير)
  v_mgr      UUID := gen_random_uuid();  -- مدير على قسم التقنية
  v_deep     UUID := gen_random_uuid();  -- موظف في الواجهات (حفيد)
  v_out      UUID := gen_random_uuid();  -- موظف في المالية
  v_direct   UUID := gen_random_uuid();  -- مرؤوس مباشر في المالية
  v_plain    UUID := gen_random_uuid();  -- موظف بلا وحدة
  v_tenmgr   UUID := gen_random_uuid();  -- مدير بنطاق الشركة
  v_permit_in  UUID;
  v_permit_out UUID;
  v_cnt      INT;
  v_bool     BOOLEAN;
  v_txt      TEXT;
BEGIN
  -- ── تهيئة ──────────────────────────────────────────────────────────────
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر وحدات', 'verify-units-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id, name_ar) VALUES (v_tenant,'التقنية') RETURNING id INTO v_root;
  INSERT INTO public.departments (tenant_id, name_ar, parent_department_id) VALUES (v_tenant,'التطوير',v_root) RETURNING id INTO v_mid;
  INSERT INTO public.departments (tenant_id, name_ar, parent_department_id) VALUES (v_tenant,'الواجهات',v_mid) RETURNING id INTO v_leaf;
  INSERT INTO public.departments (tenant_id, name_ar) VALUES (v_tenant,'المالية') RETURNING id INTO v_other;

  INSERT INTO auth.users (id,email) VALUES
    (v_mgr,'vu-mgr@t.local'), (v_deep,'vu-deep@t.local'), (v_out,'vu-out@t.local'),
    (v_direct,'vu-direct@t.local'), (v_plain,'vu-plain@t.local'), (v_tenmgr,'vu-tenmgr@t.local');

  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department,manager_id) VALUES
    (v_mgr,   v_tenant,'المدير',      'vu-mgr@t.local','manager','التقنية',NULL),
    (v_deep,  v_tenant,'موظف عميق',   'vu-deep@t.local','employee','الواجهات',NULL),
    (v_out,   v_tenant,'موظف مالية',  'vu-out@t.local','employee','المالية',NULL),
    (v_direct,v_tenant,'مرؤوس مباشر','vu-direct@t.local','employee','المالية',v_mgr),
    (v_plain, v_tenant,'بلا وحدة',    'vu-plain@t.local','manager','المالية',NULL),
    (v_tenmgr,v_tenant,'مدير الشركة', 'vu-tenmgr@t.local','manager','التقنية',NULL);

  -- المدير على قسم التقنية (الجذر) · ومدير آخر بنطاق الشركة
  INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
  VALUES (v_tenant,v_mgr,'manager','movement','department',v_root);
  INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
  VALUES (v_tenant,v_tenmgr,'manager','movement','tenant',NULL);

  -- ══ 1) قيد النطاق: tenant لا يحمل scope_id ═══════════════════════════
  BEGIN
    INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_tenant,v_plain,'manager','hr','tenant',v_root);
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض scope_type=tenant مع scope_id',FALSE,'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض scope_type=tenant مع scope_id',TRUE,'رُفض كما يجب');
  END;

  -- ══ 2) قيد النطاق: department يلزمه scope_id ═════════════════════════
  BEGIN
    INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_tenant,v_plain,'manager','hr','department',NULL);
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض department بلا scope_id',FALSE,'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض department بلا scope_id',TRUE,'رُفض كما يجب');
  END;

  -- ══ 3) قيد unit_key ══════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_tenant,v_plain,'manager','bogus_unit','department',v_root);
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض unit_key غير معروف',FALSE,'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض unit_key غير معروف',TRUE,'رُفض كما يجب');
  END;

  -- ══ 4) قيد base_role ═════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_tenant,v_plain,'employee','movement','department',v_root);
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض base_role خارج manager/supervisor',FALSE,'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض base_role خارج manager/supervisor',TRUE,'رُفض كما يجب');
  END;

  -- ══ 5) تفرّد الإسناد بنطاق ═══════════════════════════════════════════
  BEGIN
    INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_tenant,v_mgr,'manager','movement','department',v_root);
    INSERT INTO vu_results(name,passed,detail) VALUES ('يمنع تكرار نفس الإسناد',FALSE,'قُبل التكرار!');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO vu_results(name,passed,detail) VALUES ('يمنع تكرار نفس الإسناد',TRUE,'رُفض كما يجب');
  END;

  -- ══ 6) تفرّد نطاق الشركة (الفهرس الجزئي على NULL) ════════════════════
  BEGIN
    INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_tenant,v_tenmgr,'manager','movement','tenant',NULL);
    INSERT INTO vu_results(name,passed,detail) VALUES ('يمنع تكرار إسناد نطاق الشركة',FALSE,'قُبل التكرار!');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO vu_results(name,passed,detail) VALUES ('يمنع تكرار إسناد نطاق الشركة',TRUE,'رُفض كما يجب');
  END;

  -- ══ 7-10) is_in_my_team ══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);

  SELECT public.is_in_my_team(v_deep) INTO v_bool;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('الفريق يشمل حفيد القسم (وراثة الشجرة)', v_bool IS TRUE, 'result='||v_bool);

  SELECT public.is_in_my_team(v_out) INTO v_bool;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('الفريق لا يشمل قسماً آخر', v_bool IS FALSE, 'result='||v_bool);

  SELECT public.is_in_my_team(v_direct) INTO v_bool;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('الفريق يشمل المرؤوس المباشر ولو في قسم آخر', v_bool IS TRUE, 'result='||v_bool);

  -- ══ 11) نطاق الشركة يشمل الجميع ══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_tenmgr::text, TRUE);
  SELECT public.is_in_my_team(v_out) INTO v_bool;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('مدير بنطاق الشركة يشمل كل الموظفين', v_bool IS TRUE, 'result='||v_bool);

  -- ══ 12-14) has_portal_unit ═══════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);

  SELECT public.has_portal_unit('manager','movement') INTO v_bool;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('المدير له وحدة الحركة', v_bool IS TRUE, 'result='||v_bool);

  SELECT public.has_portal_unit('manager','finance') INTO v_bool;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('المدير لا يملك وحدة المالية', v_bool IS FALSE, 'result='||v_bool);

  SELECT public.has_portal_unit('supervisor','movement') INTO v_bool;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('المدير يشمل صلاحية المشرف في وحدته', v_bool IS TRUE, 'result='||v_bool);

  -- ══ 15) my_portal_units ══════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.my_portal_units();
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('my_portal_units تُرجع وحدة واحدة للمدير', v_cnt = 1, 'count='||v_cnt);

  -- ══ 16) حارس الوحدة يرفض غير المُسنَد ════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_plain::text, TRUE);
  BEGIN
    PERFORM public.require_portal_unit('manager','movement');
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('حارس الوحدة يرفض غير المُسنَد', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('حارس الوحدة يرفض غير المُسنَد', SQLERRM LIKE '%NOT_ASSIGNED_TO_UNIT%', SQLERRM);
  END;

  -- ── تصاريح: واحد داخل الفريق وآخر خارجه ────────────────────────────────
  INSERT INTO public.employee_movement_permits (tenant_id,employee_id,destination_name,purpose,valid_until,status)
  VALUES (v_tenant,v_deep,'بنك','مهمة',NOW()+interval '2 hours','pending') RETURNING id INTO v_permit_in;
  INSERT INTO public.employee_movement_permits (tenant_id,employee_id,destination_name,purpose,valid_until,status)
  VALUES (v_tenant,v_out,'سوق','شراء',NOW()+interval '2 hours','pending') RETURNING id INTO v_permit_out;

  -- ══ 17) المدير يرى تصاريح فريقه فقط ══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.manager_movement_pending_permits();
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('المدير يرى تصريح فريقه وحده', v_cnt = 1, 'count='||v_cnt);

  SELECT out_employee_name INTO v_txt FROM public.manager_movement_pending_permits() LIMIT 1;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('التصريح المعروض يخصّ الموظف الصحيح', v_txt = 'موظف عميق', 'name='||COALESCE(v_txt,'NULL'));

  -- ══ 18) الاعتماد ينجح على الفريق ═════════════════════════════════════
  BEGIN
    PERFORM public.manager_movement_decide_permit(v_permit_in,'approved','موافق');
    INSERT INTO vu_results(name,passed,detail) VALUES ('اعتماد تصريح الفريق ينجح',TRUE,'تم');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu_results(name,passed,detail) VALUES ('اعتماد تصريح الفريق ينجح',FALSE,SQLERRM);
  END;

  SELECT status INTO v_txt FROM public.employee_movement_permits WHERE id = v_permit_in;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('حالة التصريح صارت approved', v_txt = 'approved', 'status='||v_txt);

  -- ══ 19) الأثر مسجَّل في سجل الموافقات ════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.employee_movement_approvals
   WHERE permit_id = v_permit_in AND decision = 'approved';
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('القرار مسجَّل في employee_movement_approvals', v_cnt = 1, 'count='||v_cnt);

  -- ══ 20) 🔴 الأهم: لا يعتمد خارج فريقه ════════════════════════════════
  BEGIN
    PERFORM public.manager_movement_decide_permit(v_permit_out,'approved','تجاوز');
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('يرفض الاعتماد خارج الفريق', FALSE, 'مرّ — تجاوز صلاحية!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('يرفض الاعتماد خارج الفريق', SQLERRM LIKE '%EMPLOYEE_NOT_IN_MY_TEAM%', SQLERRM);
  END;

  SELECT status INTO v_txt FROM public.employee_movement_permits WHERE id = v_permit_out;
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('تصريح القسم الآخر لم يتغيّر', v_txt = 'pending', 'status='||v_txt);

  -- ══ 21) اعتماد مكرر يُرفض ════════════════════════════════════════════
  BEGIN
    PERFORM public.manager_movement_decide_permit(v_permit_in,'approved','مكرر');
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض الاعتماد المكرر',FALSE,'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('يرفض الاعتماد المكرر', SQLERRM LIKE '%PERMIT_NOT_PENDING%', SQLERRM);
  END;

  -- ══ 22) قرار غير صالح ════════════════════════════════════════════════
  BEGIN
    PERFORM public.manager_movement_decide_permit(v_permit_out,'maybe',NULL);
    INSERT INTO vu_results(name,passed,detail) VALUES ('يرفض قراراً غير صالح',FALSE,'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('يرفض قراراً غير صالح', SQLERRM LIKE '%INVALID_DECISION%', SQLERRM);
  END;

  -- ══ 23) غير المُسنَد لا يرى التصاريح ═════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_plain::text, TRUE);
  BEGIN
    PERFORM count(*) FROM public.manager_movement_pending_permits();
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('غير المُسنَد لا يرى تصاريح', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu_results(name,passed,detail) VALUES
      ('غير المُسنَد لا يرى تصاريح', SQLERRM LIKE '%NOT_ASSIGNED_TO_UNIT%', SQLERRM);
  END;

  -- ══ 24) مؤشرات الفريق ════════════════════════════════════════════════
  --
  -- تصحيح توقّع (2026-08-05): توقّعتُ 2 (العميق + المرؤوس المباشر) فجاء 3.
  -- الفحص أثبت أن الدالة **صحيحة** وتوقّعي كان خاطئاً: v_tenmgr قسمه
  -- «التقنية» أيضاً، وهو داخل نطاق المدير. النطاق مكاني (القسم وفروعه)
  -- لا هرمي — المدير مسؤول عن كل من في قسمه بمن فيهم من يحمل إسناداً
  -- آخر. الاستثناء الوحيد هو المدير نفسه (pr.id <> auth.uid()).
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  SELECT out_team_size INTO v_cnt FROM public.manager_movement_team_kpis(30);
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('حجم الفريق = عميق + مرؤوس مباشر + مدير الشركة (كلهم في نطاقه)',
     v_cnt = 3, 'team_size='||v_cnt);

  -- ══ 24ب) المدير لا يُحسب ضمن فريق نفسه ═══════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.profiles pr
   WHERE pr.tenant_id = v_tenant AND public.is_in_my_team(pr.id);
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('team_kpis يستثني المدير نفسه من العدّ',
     v_cnt = 4, 'is_in_my_team=4 (بمن فيهم نفسه) بينما team_size=3');

  -- ══ 25) عزل المستأجرين ═══════════════════════════════════════════════
  SELECT count(*) INTO v_cnt
    FROM public.portal_unit_assignments a
   WHERE a.tenant_id <> v_tenant AND a.user_id IN (v_mgr,v_tenmgr,v_plain);
  INSERT INTO vu_results(name,passed,detail) VALUES
    ('لا إسناد يعبر حدود المستأجر', v_cnt = 0, 'cross='||v_cnt);

  -- ══ 26) RLS مفعَّلة ══════════════════════════════════════════════════
  INSERT INTO vu_results(name,passed,detail)
  SELECT 'RLS مفعَّلة على portal_unit_assignments',
         (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='portal_unit_assignments'),
         'checked';

  -- ══ 27-29) anon لا ينفّذ ═════════════════════════════════════════════
  INSERT INTO vu_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.my_portal_units()',
      'public.has_portal_unit(text,text)',
      'public.is_in_my_team(uuid)',
      'public.require_portal_unit(text,text)',
      'public.manager_movement_pending_permits()',
      'public.manager_movement_decide_permit(uuid,text,text)',
      'public.manager_movement_team_log(integer)',
      'public.manager_movement_team_kpis(integer)'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- ── تنظيف ──────────────────────────────────────────────────────────────
  DELETE FROM public.employee_movement_approvals WHERE tenant_id = v_tenant;
  DELETE FROM public.employee_movement_permits WHERE tenant_id = v_tenant;
  DELETE FROM public.portal_unit_assignments WHERE tenant_id = v_tenant;
  DELETE FROM public.profiles WHERE tenant_id = v_tenant;
  DELETE FROM auth.users WHERE id IN (v_mgr,v_deep,v_out,v_direct,v_plain,v_tenmgr);
  DELETE FROM public.departments WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants WHERE id = v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار",
       detail AS "التفصيل"
  FROM vu_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vu_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  معمارية الوحدات: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
