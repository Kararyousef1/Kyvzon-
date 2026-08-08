-- ============================================================================
-- FILE: tools/dev/verify-unified-approvals-0305.sql
-- PURPOSE: اختبار سلوكي لمحرك الموافقات الموحّد (0305)
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vu5_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vu5_results;

DO $$
DECLARE
  v_tenant  UUID;
  v_dept    UUID;
  v_other   UUID;
  v_mgr     UUID := gen_random_uuid();
  v_emp     UUID := gen_random_uuid();
  v_far     UUID := gen_random_uuid();
  v_permit  UUID := gen_random_uuid();
  v_mov_ap  UUID;
  v_proc_ap UUID;
  v_far_ap  UUID;
  v_cnt     INT;
  v_txt     TEXT;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر محرك', 'verify-eng-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'العمليات') RETURNING id INTO v_dept;
  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'المالية')  RETURNING id INTO v_other;

  INSERT INTO auth.users (id,email) VALUES
    (v_mgr,'v5-mgr@t.local'),(v_emp,'v5-emp@t.local'),(v_far,'v5-far@t.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department) VALUES
    (v_mgr,v_tenant,'مدير','v5-mgr@t.local','manager','العمليات'),
    (v_emp,v_tenant,'موظف','v5-emp@t.local','employee','العمليات'),
    (v_far,v_tenant,'موظف بعيد','v5-far@t.local','employee','المالية');

  -- المدير له وحدتا الحركة والمشتريات على قسم العمليات
  INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
  VALUES (v_tenant,v_mgr,'manager','movement','department',v_dept),
         (v_tenant,v_mgr,'manager','procurement','department',v_dept);

  -- طلب حركة من فريقه
  INSERT INTO public.employee_movement_permits (id,tenant_id,employee_id,destination_name,purpose,valid_until,status)
  VALUES (v_permit,v_tenant,v_emp,'بنك','مهمة',NOW()+interval '2 hours','pending');
  INSERT INTO public.employee_movement_approvals (tenant_id,permit_id,step_order,decision)
  VALUES (v_tenant,v_permit,1,'pending') RETURNING id INTO v_mov_ap;

  -- طلب شراء من فريقه
  INSERT INTO public.procurement_approval_requests (tenant_id,related_id,requester_id,department_id,total_amount,status)
  VALUES (v_tenant,gen_random_uuid(),v_emp,v_dept,7500,'pending') RETURNING id INTO v_proc_ap;

  -- طلب حركة من قسم آخر (خارج فريقه)
  INSERT INTO public.employee_movement_permits (tenant_id,employee_id,destination_name,purpose,valid_until,status)
  VALUES (v_tenant,v_far,'سوق','شراء',NOW()+interval '2 hours','pending');
  INSERT INTO public.employee_movement_approvals (tenant_id,permit_id,step_order,decision)
  SELECT v_tenant,p.id,1,'pending' FROM public.employee_movement_permits p
   WHERE p.employee_id=v_far AND p.tenant_id=v_tenant
  RETURNING id INTO v_far_ap;

  -- طلب مالية (وحدة غير مُسنَدة له)
  INSERT INTO public.financial_approval_requests (tenant_id,request_type,reference_id,requested_by,status)
  VALUES (v_tenant,'expense',gen_random_uuid(),v_emp,'pending');

  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);

  -- ══ 1) الصندوق يجمع بوابتين مختلفتين ═════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('الصندوق يجمع بوابتين في مكان واحد', v_cnt=2, 'count='||v_cnt);

  SELECT count(DISTINCT out_source_module) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('مصدران مختلفان (حركة + مشتريات)', v_cnt=2, 'modules='||v_cnt);

  -- ══ 2) المبلغ يظهر للمشتريات ═════════════════════════════════════════
  SELECT out_amount::TEXT INTO v_txt FROM public.my_approval_inbox()
   WHERE out_source_module='procurement';
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('مبلغ طلب الشراء يظهر', v_txt LIKE '7500%', 'amount='||COALESCE(v_txt,'NULL'));

  -- ══ 3) 🔴 طلب من قسم آخر لا يظهر ═════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox()
   WHERE out_requester_id = v_far;
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('طلب من خارج الفريق لا يظهر', v_cnt=0, 'count='||v_cnt);

  -- ══ 4) وحدة غير مُسنَدة لا تظهر ══════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox()
   WHERE out_source_module='finance';
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('وحدة غير مُسنَدة (المالية) لا تظهر', v_cnt=0, 'count='||v_cnt);

  -- ══ 5) التصفية بالوحدة ═══════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox('movement');
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('التصفية بوحدة الحركة تُرجع طلباً واحداً', v_cnt=1, 'count='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox('procurement');
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('التصفية بوحدة المشتريات تُرجع طلباً واحداً', v_cnt=1, 'count='||v_cnt);

  -- ══ 6) القرار الموحّد: الحركة ════════════════════════════════════════
  BEGIN
    PERFORM public.unified_approval_decide('movement', v_mov_ap, 'approved', 'موافق');
    INSERT INTO vu5_results(name,passed,detail) VALUES ('اعتماد طلب حركة عبر المحرك',TRUE,'تم');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu5_results(name,passed,detail) VALUES ('اعتماد طلب حركة عبر المحرك',FALSE,SQLERRM);
  END;

  SELECT decision INTO v_txt FROM public.employee_movement_approvals WHERE id=v_mov_ap;
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('قرار الحركة كُتب في جدولها', v_txt='approved', 'decision='||v_txt);

  SELECT status INTO v_txt FROM public.employee_movement_permits WHERE id=v_permit;
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('التصريح نفسه تبع قرار الموافقة', v_txt='approved', 'status='||v_txt);

  -- ══ 7) القرار الموحّد: المشتريات (بوابة أخرى نفس الدالة) ═════════════
  BEGIN
    PERFORM public.unified_approval_decide('procurement', v_proc_ap, 'approved', NULL);
    INSERT INTO vu5_results(name,passed,detail) VALUES ('اعتماد طلب شراء عبر نفس الدالة',TRUE,'تم');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu5_results(name,passed,detail) VALUES ('اعتماد طلب شراء عبر نفس الدالة',FALSE,SQLERRM);
  END;

  SELECT status INTO v_txt FROM public.procurement_approval_requests WHERE id=v_proc_ap;
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('قرار الشراء كُتب في جدوله', v_txt='approved', 'status='||v_txt);

  -- ══ 8) الصندوق فرغ ═══════════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('الصندوق فرغ بعد القرارين', v_cnt=0, 'count='||v_cnt);

  -- ══ 9) 🔴 رفض الاعتماد خارج الفريق ═══════════════════════════════════
  BEGIN
    PERFORM public.unified_approval_decide('movement', v_far_ap, 'approved', 'تجاوز');
    INSERT INTO vu5_results(name,passed,detail) VALUES
      ('يرفض الاعتماد خارج الفريق', FALSE, 'مرّ — تجاوز صلاحية!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu5_results(name,passed,detail) VALUES
      ('يرفض الاعتماد خارج الفريق', SQLERRM LIKE '%REQUESTER_NOT_IN_MY_TEAM%', SQLERRM);
  END;

  SELECT decision INTO v_txt FROM public.employee_movement_approvals WHERE id=v_far_ap;
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('طلب القسم الآخر لم يتغيّر', v_txt='pending', 'decision='||v_txt);

  -- ══ 10) الاعتماد المكرر ══════════════════════════════════════════════
  BEGIN
    PERFORM public.unified_approval_decide('movement', v_mov_ap, 'approved', NULL);
    INSERT INTO vu5_results(name,passed,detail) VALUES ('يرفض الاعتماد المكرر',FALSE,'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu5_results(name,passed,detail) VALUES
      ('يرفض الاعتماد المكرر', SQLERRM LIKE '%APPROVAL_NOT_FOUND_OR_DECIDED%', SQLERRM);
  END;

  -- ══ 11) قرار غير صالح ════════════════════════════════════════════════
  BEGIN
    PERFORM public.unified_approval_decide('movement', v_far_ap, 'maybe', NULL);
    INSERT INTO vu5_results(name,passed,detail) VALUES ('يرفض قراراً غير صالح',FALSE,'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu5_results(name,passed,detail) VALUES
      ('يرفض قراراً غير صالح', SQLERRM LIKE '%INVALID_DECISION%', SQLERRM);
  END;

  -- ══ 12) مصدر غير معروف ═══════════════════════════════════════════════
  BEGIN
    PERFORM public.unified_approval_decide('bogus', gen_random_uuid(), 'approved', NULL);
    INSERT INTO vu5_results(name,passed,detail) VALUES ('يرفض مصدراً غير معروف',FALSE,'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu5_results(name,passed,detail) VALUES
      ('يرفض مصدراً غير معروف',
       SQLERRM LIKE '%APPROVAL_NOT_FOUND%' OR SQLERRM LIKE '%UNKNOWN_SOURCE_MODULE%', SQLERRM);
  END;

  -- ══ 13) موظف بلا وحدة لا يرى شيئاً ═══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('موظف بلا وحدة يرى صندوقاً فارغاً', v_cnt=0, 'count='||v_cnt);

  -- ══ 14) وحاول اعتماد شيء ═════════════════════════════════════════════
  BEGIN
    PERFORM public.unified_approval_decide('movement', v_far_ap, 'approved', NULL);
    INSERT INTO vu5_results(name,passed,detail) VALUES
      ('موظف بلا وحدة لا يعتمد', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vu5_results(name,passed,detail) VALUES
      ('موظف بلا وحدة لا يعتمد', SQLERRM LIKE '%NOT_ASSIGNED_TO_UNIT%', SQLERRM);
  END;

  -- ══ 15) قواعد الاعتماد وسلسلتها ══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);

  INSERT INTO public.approval_rules (tenant_id,unit_key,rule_name,min_amount,max_amount,level,required_role)
  VALUES (v_tenant,'procurement','مشتريات صغيرة',0,10000,1,'manager'),
         (v_tenant,'procurement','مشتريات كبيرة',10000.01,999999,2,'direct_manager');

  UPDATE public.departments SET manager_id=v_mgr WHERE id=v_dept;

  SELECT count(*) INTO v_cnt FROM public.resolve_approval_chain('procurement', v_dept, 5000);
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('قاعدة المبلغ الصغير تُرجع مستوى واحداً', v_cnt=1, 'levels='||v_cnt);

  SELECT out_approver_id::TEXT INTO v_txt FROM public.resolve_approval_chain('procurement', v_dept, 5000);
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('السلسلة تحلّ المدير من الهيكل التنظيمي', v_txt = v_mgr::TEXT,
     'approver='||COALESCE(v_txt,'NULL'));

  SELECT count(*) INTO v_cnt FROM public.resolve_approval_chain('procurement', v_dept, 50000);
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('مبلغ كبير يُطابق القاعدة الثانية', v_cnt=1, 'levels='||v_cnt);

  -- ══ 16) عزل المستأجرين في العرض ══════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.unified_approvals
   WHERE tenant_id <> v_tenant AND source_id IN (v_mov_ap, v_proc_ap, v_far_ap);
  INSERT INTO vu5_results(name,passed,detail) VALUES
    ('لا صف يعبر حدود المستأجر', v_cnt=0, 'cross='||v_cnt);

  -- ══ 17) anon محروم ═══════════════════════════════════════════════════
  INSERT INTO vu5_results(name,passed,detail)
  SELECT 'anon لا يقرأ unified_approvals',
         NOT has_table_privilege('anon','public.unified_approvals','SELECT'), 'checked';

  INSERT INTO vu5_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.my_approval_inbox(text)',
      'public.unified_approval_decide(text,uuid,text,text)',
      'public.resolve_approval_chain(text,uuid,numeric)'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.approval_rules WHERE tenant_id=v_tenant;
  DELETE FROM public.financial_approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.procurement_approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.employee_movement_approvals WHERE tenant_id=v_tenant;
  DELETE FROM public.employee_movement_permits WHERE tenant_id=v_tenant;
  DELETE FROM public.portal_unit_assignments WHERE tenant_id=v_tenant;
  DELETE FROM public.org_role_assignments WHERE tenant_id=v_tenant;
  UPDATE public.departments SET manager_id=NULL WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id IN (v_mgr,v_emp,v_far);
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM vu5_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vu5_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  محرك الموافقات 0305: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
