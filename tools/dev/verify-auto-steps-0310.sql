-- ============================================================================
-- FILE: tools/dev/verify-auto-steps-0310.sql
-- PURPOSE: اختبار سلوكي — الجسور تبني سلسلة المستويات تلقائياً (0310)
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS va_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE va_results;

DO $$
DECLARE
  v_tenant UUID;
  v_dept   UUID;
  v_admin  UUID := gen_random_uuid();
  v_l1     UUID := gen_random_uuid();
  v_l2     UUID := gen_random_uuid();
  v_emp    UUID := gen_random_uuid();
  v_nodept UUID := gen_random_uuid();
  v_item   UUID;
  v_bomh   UUID;
  v_bomv   UUID;
  v_req    UUID;
  v_req2   UUID;
  v_cnt    INT;
  v_txt    TEXT;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر تلقائي', 'verify-auto-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'العمليات') RETURNING id INTO v_dept;

  INSERT INTO auth.users (id,email) VALUES
    (v_admin,'va-adm@t.local'),(v_l1,'va-l1@t.local'),
    (v_l2,'va-l2@t.local'),(v_emp,'va-emp@t.local'),(v_nodept,'va-nd@t.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department) VALUES
    (v_admin, v_tenant,'مدير النظام','va-adm@t.local','admin','العمليات'),
    (v_l1,    v_tenant,'مدير م1','va-l1@t.local','manager','العمليات'),
    (v_l2,    v_tenant,'مدير م2','va-l2@t.local','manager','العمليات'),
    (v_emp,   v_tenant,'موظف','va-emp@t.local','employee','العمليات');
  -- موظف بلا قسم إطلاقاً
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role) VALUES
    (v_nodept,v_tenant,'بلا قسم','va-nd@t.local','employee');

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, TRUE);
  PERFORM public.assign_org_role(v_dept,'manager',v_l1,NULL);
  PERFORM public.assign_org_role(v_dept,'direct_manager',v_l2,NULL);
  PERFORM public.upsert_approval_rule('finance','م1',0,999999,1,'manager',NULL,NULL);
  PERFORM public.upsert_approval_rule('finance','م2',0,999999,2,'direct_manager',NULL,NULL);
  PERFORM public.upsert_approval_rule('hr','إجازة',0,999999,1,'manager',NULL,NULL);
  PERFORM public.upsert_approval_rule('mrp','BOM',0,999999,1,'manager',NULL,NULL);

  -- ══ 1) 🔴 الجوهر: المالية تبني تلقائياً ══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  SELECT public.create_financial_approval('expense', gen_random_uuid(), 5000) INTO v_req;

  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps WHERE source_id = v_req;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('المالية تبني خطوتين بلا استدعاء يدوي', v_cnt=2, 'steps='||v_cnt);

  SELECT out_status INTO v_txt FROM public.approval_steps_for('finance', v_req) WHERE out_step_order=1;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('الخطوة الأولى نشطة', v_txt='active', 'status='||v_txt);

  SELECT out_approver_name INTO v_txt FROM public.approval_steps_for('finance', v_req) WHERE out_step_order=2;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('الخطوة الثانية للمدير المباشر', v_txt='مدير م2', 'approver='||v_txt);

  -- ══ 2) الدورة تعمل من طرف لطرف ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_l1::text, TRUE);
  SELECT public.unified_approval_decide('finance', v_req, 'approved', 'م1') INTO v_txt;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('المستوى الأول يُرجع pending', v_txt='pending', 'result='||v_txt);

  PERFORM set_config('request.jwt.claim.sub', v_l2::text, TRUE);
  SELECT public.unified_approval_decide('finance', v_req, 'approved', 'م2') INTO v_txt;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('المستوى الثاني يُنهي الاعتماد', v_txt='approved', 'result='||v_txt);

  SELECT status INTO v_txt FROM public.financial_approval_requests WHERE id=v_req;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('الطلب اعتُمد في بوابته', v_txt='approved', 'status='||v_txt);

  -- ══ 3) آمن للتكرار: نفس المرجع لا يُنشئ خطوات مضاعفة ═════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  DECLARE v_ref UUID := gen_random_uuid();
  BEGIN
    SELECT public.create_financial_approval('invoice', v_ref, 100) INTO v_req2;
    PERFORM public.create_financial_approval('invoice', v_ref, 100);

    SELECT count(*) INTO v_cnt FROM public.unified_approval_steps WHERE source_id = v_req2;
    INSERT INTO va_results(name,passed,detail) VALUES
      ('الاستدعاء المكرر لا يُضاعف الخطوات', v_cnt=2, 'steps='||v_cnt);
  END;

  -- ══ 4) 🔴 موظف بلا قسم: لا خطوات ولا انهيار ══════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_nodept::text, TRUE);
  BEGIN
    SELECT public.create_financial_approval('budget', gen_random_uuid(), 100) INTO v_req2;
    INSERT INTO va_results(name,passed,detail) VALUES
      ('موظف بلا قسم: الطلب يُنشأ', v_req2 IS NOT NULL, 'id ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO va_results(name,passed,detail) VALUES
      ('موظف بلا قسم: الطلب يُنشأ', FALSE, SQLERRM);
  END;

  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps WHERE source_id = v_req2;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('موظف بلا قسم: بلا خطوات (مسار قديم)', v_cnt=0, 'steps='||v_cnt);

  -- ══ 5) الجسر العام يحترم p_unit_key ══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  SELECT public.create_general_approval('leave','إجازة',NULL,NULL,NULL,'normal','hr',0) INTO v_req2;

  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps WHERE source_id = v_req2;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('الجسر العام يبني بقواعد الوحدة المحدَّدة', v_cnt=1, 'steps='||v_cnt);

  -- وحدة بلا قواعد ⇒ لا خطوات
  SELECT public.create_general_approval('other','عقد',NULL,NULL,NULL,'normal','contracts',0) INTO v_req2;
  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps WHERE source_id = v_req2;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('وحدة بلا قواعد: بلا خطوات', v_cnt=0, 'steps='||v_cnt);

  BEGIN
    PERFORM public.create_general_approval('leave','خطأ',NULL,NULL,NULL,'normal','bogus',0);
    INSERT INTO va_results(name,passed,detail) VALUES
      ('يرفض وحدة غير معروفة', FALSE, 'قُبل!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO va_results(name,passed,detail) VALUES
      ('يرفض وحدة غير معروفة', SQLERRM LIKE '%INVALID_UNIT_KEY%', SQLERRM);
  END;

  -- ══ 6) التصنيع يبني تلقائياً ═════════════════════════════════════════
  INSERT INTO public.inventory_items (tenant_id,item_code,name_ar,item_type,base_uom,tracking_policy)
  VALUES (v_tenant,'ITM-VA-1','صنف','finished_good','EA','none') RETURNING id INTO v_item;
  INSERT INTO public.mrp_bom_headers (tenant_id,bom_code,item_id,bom_type)
  VALUES (v_tenant,'BOM-VA-1',v_item,'MBOM') RETURNING id INTO v_bomh;
  INSERT INTO public.mrp_bom_versions (tenant_id,bom_id,version_no,status)
  VALUES (v_tenant,v_bomh,'v1','draft') RETURNING id INTO v_bomv;

  SELECT public.create_mrp_bom_approval(v_bomv,'production_manager') INTO v_req2;
  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps WHERE source_id = v_req2;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('التصنيع يبني خطوة تلقائياً', v_cnt=1, 'steps='||v_cnt);

  -- ══ 7) resolve_requester_department ══════════════════════════════════
  SELECT public.resolve_requester_department(v_emp) INTO v_req2;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('يحلّ القسم من profiles.department', v_req2 = v_dept, 'match='||(v_req2=v_dept));

  SELECT public.resolve_requester_department(v_nodept) INTO v_req2;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('يُرجع NULL لمن بلا قسم', v_req2 IS NULL, 'null='||(v_req2 IS NULL));

  -- ══ 8) لا حِمل زائد (يُربك PostgREST) ════════════════════════════════
  INSERT INTO va_results(name,passed,detail)
  SELECT 'لا حِمل زائد على '||fn,
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname=fn) = 1,
         'count='||(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname=fn)
    FROM unnest(ARRAY['create_financial_approval','create_mrp_bom_approval',
                      'create_general_approval','resolve_requester_department']) AS fn;

  -- ══ 9) عزل المستأجرين ════════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps
   WHERE tenant_id <> v_tenant AND source_id = v_req;
  INSERT INTO va_results(name,passed,detail) VALUES
    ('لا خطوة تعبر حدود المستأجر', v_cnt=0, 'cross='||v_cnt);

  -- ══ 10) anon محروم ═══════════════════════════════════════════════════
  INSERT INTO va_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.resolve_requester_department(uuid)',
      'public.create_financial_approval(text,uuid,numeric)',
      'public.create_mrp_bom_approval(uuid,text)',
      'public.create_general_approval(text,text,text,uuid,text,text,text,numeric)'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.unified_approval_steps WHERE tenant_id=v_tenant;
  DELETE FROM public.approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.mrp_bom_approvals WHERE tenant_id=v_tenant;
  DELETE FROM public.mrp_bom_versions WHERE tenant_id=v_tenant;
  DELETE FROM public.mrp_bom_headers WHERE tenant_id=v_tenant;
  DELETE FROM public.inventory_items WHERE tenant_id=v_tenant;
  DELETE FROM public.financial_approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.approval_rules WHERE tenant_id=v_tenant;
  DELETE FROM public.org_role_assignments WHERE tenant_id=v_tenant;
  UPDATE public.departments SET manager_id=NULL, direct_manager_id=NULL WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id IN (v_admin,v_l1,v_l2,v_emp,v_nodept);
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM va_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM va_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  البناء التلقائي 0310: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
