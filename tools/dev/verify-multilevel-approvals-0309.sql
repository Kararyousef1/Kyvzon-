-- ============================================================================
-- FILE: tools/dev/verify-multilevel-approvals-0309.sql
-- PURPOSE: اختبار سلوكي للاعتماد متعدد المستويات (0309)
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vm_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vm_results;

DO $$
DECLARE
  v_tenant UUID;
  v_dept   UUID;
  v_admin  UUID := gen_random_uuid();
  v_l1     UUID := gen_random_uuid();
  v_l2     UUID := gen_random_uuid();
  v_emp    UUID := gen_random_uuid();
  v_req1   UUID;
  v_req2   UUID;
  v_req3   UUID;
  v_cnt    INT;
  v_txt    TEXT;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر مستويات', 'verify-ml-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'العمليات') RETURNING id INTO v_dept;

  INSERT INTO auth.users (id,email) VALUES
    (v_admin,'vm-adm@t.local'),(v_l1,'vm-l1@t.local'),
    (v_l2,'vm-l2@t.local'),(v_emp,'vm-emp@t.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department) VALUES
    (v_admin,v_tenant,'مدير النظام','vm-adm@t.local','admin','العمليات'),
    (v_l1,   v_tenant,'مدير م1','vm-l1@t.local','manager','العمليات'),
    (v_l2,   v_tenant,'مدير م2','vm-l2@t.local','manager','العمليات'),
    (v_emp,  v_tenant,'موظف','vm-emp@t.local','employee','العمليات');

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, TRUE);
  PERFORM public.assign_org_role(v_dept,'manager',v_l1,NULL);
  PERFORM public.assign_org_role(v_dept,'direct_manager',v_l2,NULL);
  PERFORM public.upsert_approval_rule('finance','مستوى أول',0,999999,1,'manager',NULL,NULL);
  PERFORM public.upsert_approval_rule('finance','مستوى ثانٍ',0,999999,2,'direct_manager',NULL,NULL);

  -- ══ 1) بناء السلسلة ══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  SELECT public.create_financial_approval('expense', gen_random_uuid()) INTO v_req1;
  SELECT public.build_approval_steps('finance', v_req1, 'finance', v_dept, 5000) INTO v_cnt;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('يبني خطوتين من قاعدتين', v_cnt=2, 'steps='||v_cnt);

  SELECT out_status INTO v_txt FROM public.approval_steps_for('finance', v_req1) WHERE out_step_order=1;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الخطوة الأولى نشطة', v_txt='active', 'status='||v_txt);

  SELECT out_status INTO v_txt FROM public.approval_steps_for('finance', v_req1) WHERE out_step_order=2;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الخطوة الثانية معلَّقة', v_txt='pending', 'status='||v_txt);

  -- ══ 2) آمن للتكرار ═══════════════════════════════════════════════════
  SELECT public.build_approval_steps('finance', v_req1, 'finance', v_dept, 5000) INTO v_cnt;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('إعادة البناء لا تُضاعف الخطوات', v_cnt=2, 'steps='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps
   WHERE source_id = v_req1;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('صفّان فقط في الجدول', v_cnt=2, 'rows='||v_cnt);

  -- ══ 3) الصندوق لصاحب الخطوة النشطة وحده ══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_l1::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('صاحب الخطوة النشطة يرى الطلب', v_cnt=1, 'count='||v_cnt);

  PERFORM set_config('request.jwt.claim.sub', v_l2::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('صاحب الخطوة التالية لا يراه بعد', v_cnt=0, 'count='||v_cnt);

  -- ══ 4) 🔴 لا يبتّ من ليس دوره ════════════════════════════════════════
  BEGIN
    PERFORM public.unified_approval_decide('finance', v_req1, 'approved', 'تجاوز');
    INSERT INTO vm_results(name,passed,detail) VALUES
      ('يرفض البتّ من غير صاحب الخطوة', FALSE, 'مرّ — تجاوز!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vm_results(name,passed,detail) VALUES
      ('يرفض البتّ من غير صاحب الخطوة', SQLERRM LIKE '%NOT_YOUR_STEP%', SQLERRM);
  END;

  -- ══ 5) 🔴 الجوهر: المستوى الأول لا يُنهي الطلب ═══════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_l1::text, TRUE);
  SELECT public.unified_approval_decide('finance', v_req1, 'approved', 'موافق م1') INTO v_txt;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('موافقة المستوى الأول تُرجع pending', v_txt='pending', 'result='||v_txt);

  SELECT status INTO v_txt FROM public.financial_approval_requests WHERE id=v_req1;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الطلب في بوابته ما زال معلَّقاً', v_txt='pending', 'status='||v_txt);

  SELECT out_status INTO v_txt FROM public.approval_steps_for('finance', v_req1) WHERE out_step_order=1;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الخطوة الأولى صارت approved', v_txt='approved', 'status='||v_txt);

  SELECT out_status INTO v_txt FROM public.approval_steps_for('finance', v_req1) WHERE out_step_order=2;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الخطوة الثانية صارت active', v_txt='active', 'status='||v_txt);

  -- ══ 6) الصندوق انتقل ═════════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('المستوى الأول لم يعد يراه', v_cnt=0, 'count='||v_cnt);

  PERFORM set_config('request.jwt.claim.sub', v_l2::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('المستوى الثاني صار يراه', v_cnt=1, 'count='||v_cnt);

  SELECT out_step_order||'/'||out_total_steps INTO v_txt FROM public.my_approval_inbox() LIMIT 1;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الصندوق يبيّن المستوى 2/2', v_txt='2/2', 'level='||v_txt);

  -- ══ 7) المستوى الأخير يُنهي ══════════════════════════════════════════
  SELECT public.unified_approval_decide('finance', v_req1, 'approved', 'موافق م2') INTO v_txt;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('المستوى الأخير يُرجع approved', v_txt='approved', 'result='||v_txt);

  SELECT status INTO v_txt FROM public.financial_approval_requests WHERE id=v_req1;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الطلب اعتُمد نهائياً', v_txt='approved', 'status='||v_txt);

  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الصندوق فرغ بعد الاكتمال', v_cnt=0, 'count='||v_cnt);

  -- ══ 8) الرفض يُنهي المسار ويتخطّى المتبقي ════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  SELECT public.create_financial_approval('invoice', gen_random_uuid()) INTO v_req2;
  PERFORM public.build_approval_steps('finance', v_req2, 'finance', v_dept, 5000);

  PERFORM set_config('request.jwt.claim.sub', v_l1::text, TRUE);
  SELECT public.unified_approval_decide('finance', v_req2, 'rejected', 'مرفوض') INTO v_txt;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الرفض يُرجع rejected فوراً', v_txt='rejected', 'result='||v_txt);

  SELECT status INTO v_txt FROM public.financial_approval_requests WHERE id=v_req2;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الطلب رُفض في بوابته', v_txt='rejected', 'status='||v_txt);

  SELECT out_status INTO v_txt FROM public.approval_steps_for('finance', v_req2) WHERE out_step_order=2;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الخطوة المتبقية تُتخطّى', v_txt='skipped', 'status='||v_txt);

  PERFORM set_config('request.jwt.claim.sub', v_l2::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('المستوى الثاني لا يرى المرفوض', v_cnt=0, 'count='||v_cnt);

  -- ══ 9) 🔴 التوافق الخلفي: طلب بلا خطوات ══════════════════════════════
  --
  -- تحديث 2026-08-05 (بعد 0310): الجسور صارت تبني الخطوات تلقائياً،
  -- فلا يمكن إنشاء طلب «بلا خطوات» عبرها. نُدرج مباشرةً في الجدول
  -- لمحاكاة الطلبات القائمة قبل 0309 — وهي الحالة التي يحرسها
  -- التوافق الخلفي فعلاً.
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  INSERT INTO public.financial_approval_requests
    (tenant_id, request_type, reference_id, requested_by, status, current_step, total_steps)
  VALUES (v_tenant, 'budget', gen_random_uuid(), v_emp, 'pending', 1, 1)
  RETURNING id INTO v_req3;

  INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
  VALUES (v_tenant,v_l1,'manager','finance','department',v_dept)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', v_l1::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox()
   WHERE out_source_id = v_req3;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الطلب بلا خطوات يظهر لصاحب الوحدة', v_cnt=1, 'count='||v_cnt);

  SELECT out_total_steps INTO v_cnt FROM public.my_approval_inbox()
   WHERE out_source_id = v_req3;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الطلب بلا خطوات يُعرض كـ 1/1', v_cnt=1, 'total='||v_cnt);

  SELECT public.unified_approval_decide('finance', v_req3, 'approved', 'خطوة واحدة') INTO v_txt;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('المسار القديم يعتمد بخطوة واحدة', v_txt='approved', 'result='||v_txt);

  SELECT status INTO v_txt FROM public.financial_approval_requests WHERE id=v_req3;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('الطلب القديم اعتُمد', v_txt='approved', 'status='||v_txt);

  -- ══ 10) مستوى بلا شاغل يُتخطّى ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, TRUE);
  PERFORM public.upsert_approval_rule('crm','مستوى يتيم',0,999999,1,'unit_manager',v_dept,NULL);

  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  SELECT public.create_general_approval('other','طلب CRM',NULL,NULL,NULL,'normal') INTO v_txt;
  SELECT public.build_approval_steps('general', v_txt::UUID, 'crm', v_dept, 100) INTO v_cnt;
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('المستوى بلا شاغل يُتخطّى (لا خطوة معلّقة أبداً)', v_cnt=0, 'steps='||v_cnt);

  -- ══ 11) عزل المستأجرين ═══════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.unified_approval_steps
   WHERE tenant_id <> v_tenant AND source_id IN (v_req1, v_req2);
  INSERT INTO vm_results(name,passed,detail) VALUES
    ('لا خطوة تعبر حدود المستأجر', v_cnt=0, 'cross='||v_cnt);

  -- ══ 12) RLS و anon ═══════════════════════════════════════════════════
  INSERT INTO vm_results(name,passed,detail)
  SELECT 'RLS مفعَّلة على unified_approval_steps',
         (SELECT rowsecurity FROM pg_tables
           WHERE schemaname='public' AND tablename='unified_approval_steps'), 'checked';

  INSERT INTO vm_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.build_approval_steps(text,uuid,text,uuid,numeric)',
      'public.approval_steps_for(text,uuid)',
      'public.unified_approval_decide(text,uuid,text,text)',
      'public.my_approval_inbox(text)'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.unified_approval_steps WHERE tenant_id=v_tenant;
  DELETE FROM public.approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.financial_approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.approval_rules WHERE tenant_id=v_tenant;
  DELETE FROM public.portal_unit_assignments WHERE tenant_id=v_tenant;
  DELETE FROM public.org_role_assignments WHERE tenant_id=v_tenant;
  UPDATE public.departments SET manager_id=NULL, direct_manager_id=NULL WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id IN (v_admin,v_l1,v_l2,v_emp);
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM vm_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vm_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  متعدد المستويات 0309: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
