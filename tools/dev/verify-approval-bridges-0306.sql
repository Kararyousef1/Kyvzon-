-- ============================================================================
-- FILE: tools/dev/verify-approval-bridges-0306.sql
-- PURPOSE: اختبار سلوكي لجسور الموافقات وإدارة الهيكل (0306)
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vb_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vb_results;

DO $$
DECLARE
  v_tenant UUID;
  v_dept   UUID;
  v_admin  UUID := gen_random_uuid();
  v_mgr    UUID := gen_random_uuid();
  v_emp    UUID := gen_random_uuid();
  v_bom    UUID;
  v_bomh   UUID;
  v_item   UUID;
  v_ref    UUID := gen_random_uuid();
  v_id1    UUID;
  v_id2    UUID;
  v_cnt    INT;
  v_txt    TEXT;
  v_uid    UUID;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر جسور', 'verify-br-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'العمليات') RETURNING id INTO v_dept;

  INSERT INTO auth.users (id,email) VALUES
    (v_admin,'vb-admin@t.local'),(v_mgr,'vb-mgr@t.local'),(v_emp,'vb-emp@t.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department) VALUES
    (v_admin,v_tenant,'مدير النظام','vb-admin@t.local','admin','العمليات'),
    (v_mgr,  v_tenant,'مدير','vb-mgr@t.local','manager','العمليات'),
    (v_emp,  v_tenant,'موظف','vb-emp@t.local','employee','العمليات');

  INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
  VALUES (v_tenant,v_mgr,'manager','finance','department',v_dept),
         (v_tenant,v_mgr,'manager','mrp','department',v_dept),
         (v_tenant,v_mgr,'manager','hr','department',v_dept);

  -- ══ (أ) إدارة الهيكل التنظيمي ════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, TRUE);

  -- 1) الإسناد يكتب في الجدول الجديد
  PERFORM public.assign_org_role(v_dept,'manager',v_mgr,NULL);
  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE department_id=v_dept AND org_role='manager' AND user_id=v_mgr AND is_active;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('assign_org_role يكتب في الجدول الجديد', v_cnt=1, 'rows='||v_cnt);

  -- 2) ويُزامن العمود القديم
  SELECT manager_id INTO v_uid FROM public.departments WHERE id=v_dept;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('يُزامن العمود القديم (توافق 0153/0182)', v_uid=v_mgr, 'match='||(v_uid=v_mgr));

  -- 3) نزع الدور يُعطّل ولا يحذف
  PERFORM public.assign_org_role(v_dept,'manager',NULL,NULL);
  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE department_id=v_dept AND org_role='manager' AND is_active;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('نزع الدور يُعطّله', v_cnt=0, 'active='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE department_id=v_dept AND org_role='manager';
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('لا حذف — الصف باقٍ للتدقيق', v_cnt=1, 'rows='||v_cnt);

  PERFORM public.assign_org_role(v_dept,'manager',v_mgr,NULL);  -- استرجاع

  -- 4) مدير وحدة
  PERFORM public.assign_org_role(v_dept,'unit_manager',v_mgr,'procurement');
  SELECT procurement_manager_id INTO v_uid FROM public.departments WHERE id=v_dept;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('unit_manager/procurement يُزامن عموده', v_uid=v_mgr, 'match='||(v_uid=v_mgr));

  -- 5) تماسك unit_key
  BEGIN
    PERFORM public.assign_org_role(v_dept,'unit_manager',v_mgr,NULL);
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض unit_manager بلا unit_key', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض unit_manager بلا unit_key', SQLERRM LIKE '%UNIT_KEY_COHERENCE%', SQLERRM);
  END;

  BEGIN
    PERFORM public.assign_org_role(v_dept,'manager',v_mgr,'finance');
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض دوراً هرمياً مع unit_key', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض دوراً هرمياً مع unit_key', SQLERRM LIKE '%UNIT_KEY_COHERENCE%', SQLERRM);
  END;

  -- 6) موظف عادي لا يدير الهيكل
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  BEGIN
    PERFORM public.assign_org_role(v_dept,'supervisor',v_emp,NULL);
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('موظف عادي لا يدير الهيكل', FALSE, 'مرّ — ثغرة!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('موظف عادي لا يدير الهيكل', SQLERRM LIKE '%NOT_AUTHORIZED_TO_MANAGE_ORG%', SQLERRM);
  END;

  -- 7) مستخدم من خارج المستأجر
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, TRUE);
  BEGIN
    PERFORM public.assign_org_role(v_dept,'supervisor',gen_random_uuid(),NULL);
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض مستخدماً خارج المستأجر', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض مستخدماً خارج المستأجر', SQLERRM LIKE '%USER_NOT_IN_TENANT%', SQLERRM);
  END;

  -- ══ (ب) جسر المالية ══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);

  SELECT public.create_financial_approval('journal_entry', v_ref, 0) INTO v_id1;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('جسر المالية ينشئ طلباً', v_id1 IS NOT NULL, 'id='||COALESCE(v_id1::TEXT,'NULL'));

  -- آمن للتكرار: نفس المرجع يعيد نفس الطلب
  SELECT public.create_financial_approval('journal_entry', v_ref, 0) INTO v_id2;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('لا ازدواج لنفس المرجع', v_id1 = v_id2, 'same='||(v_id1=v_id2));

  SELECT count(*) INTO v_cnt FROM public.financial_approval_requests
   WHERE tenant_id=v_tenant AND reference_id=v_ref;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('صف واحد فقط في الجدول', v_cnt=1, 'rows='||v_cnt);

  BEGIN
    PERFORM public.create_financial_approval('bogus', gen_random_uuid(), 0);
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض نوع طلب غير صالح', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض نوع طلب غير صالح', SQLERRM LIKE '%INVALID_REQUEST_TYPE%', SQLERRM);
  END;

  -- ══ (ج) جسر التصنيع ══════════════════════════════════════════════════
  -- mrp_bom_headers.item_id NOT NULL ⇒ نحتاج صنفاً حقيقياً
  INSERT INTO public.inventory_items
    (tenant_id, item_code, name_ar, item_type, base_uom, tracking_policy)
  VALUES (v_tenant, 'ITM-VB-1', 'صنف اختبار', 'finished_good', 'EA', 'none')
  RETURNING id INTO v_item;

  INSERT INTO public.mrp_bom_headers (tenant_id, bom_code, item_id, bom_type)
  VALUES (v_tenant, 'BOM-VB-1', v_item, 'MBOM')
  RETURNING id INTO v_bomh;

  INSERT INTO public.mrp_bom_versions (tenant_id, bom_id, version_no, status)
  VALUES (v_tenant, v_bomh, 'v1', 'draft')
  RETURNING id INTO v_bom;

  SELECT public.create_mrp_bom_approval(v_bom, 'production_manager') INTO v_id1;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('جسر التصنيع ينشئ طلباً', v_id1 IS NOT NULL, 'id='||COALESCE(v_id1::TEXT,'NULL'));

  SELECT public.create_mrp_bom_approval(v_bom, 'production_manager') INTO v_id2;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('لا ازدواج لنفس النسخة', v_id1 = v_id2, 'same='||(v_id1=v_id2));

  BEGIN
    PERFORM public.create_mrp_bom_approval(gen_random_uuid(), 'production_manager');
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض نسخة BOM غير موجودة', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض نسخة BOM غير موجودة', SQLERRM LIKE '%BOM_VERSION_NOT_FOUND%', SQLERRM);
  END;

  -- ══ (د) الجسر العام ══════════════════════════════════════════════════
  SELECT public.create_general_approval('expense','طلب مصروف','expenses',gen_random_uuid(),'وصف','urgent','hr',0)
    INTO v_id1;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('الجسر العام ينشئ طلباً', v_id1 IS NOT NULL, 'id='||COALESCE(v_id1::TEXT,'NULL'));

  SELECT current_approver_id INTO v_uid FROM public.approval_requests WHERE id=v_id1;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('يحلّ المعتمِد من السلسلة التنظيمية', v_uid = v_mgr,
     'approver='||COALESCE(v_uid::TEXT,'NULL'));

  SELECT requester_name INTO v_txt FROM public.approval_requests WHERE id=v_id1;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('يسجّل اسم مقدّم الطلب', v_txt='موظف', 'name='||COALESCE(v_txt,'NULL'));

  BEGIN
    PERFORM public.create_general_approval('expense','   ',NULL,NULL,NULL,'normal','hr',0);
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض عنواناً فارغاً', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض عنواناً فارغاً', SQLERRM LIKE '%TITLE_REQUIRED%', SQLERRM);
  END;

  BEGIN
    PERFORM public.create_general_approval('expense','عنوان',NULL,NULL,NULL,'bogus','hr',0);
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض أولوية غير صالحة', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('يرفض أولوية غير صالحة', SQLERRM LIKE '%INVALID_PRIORITY%', SQLERRM);
  END;

  -- ══ (هـ) 🔴 الأهم: الأنظمة الميتة صارت حيّة في مركز المدير ══════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);

  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox()
   WHERE out_source_module='finance';
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('طلب المالية يظهر في مركز المدير', v_cnt=1, 'count='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox()
   WHERE out_source_module='mrp';
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('طلب التصنيع يظهر في مركز المدير', v_cnt=1, 'count='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox()
   WHERE out_source_module='general';
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('الطلب العام يظهر في مركز المدير', v_cnt=1, 'count='||v_cnt);

  SELECT count(DISTINCT out_source_module) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('ثلاث بوابات كانت ميتة في مكان واحد', v_cnt=3, 'modules='||v_cnt);

  -- ══ (و) القرار يعمل على الأنظمة المُحياة ═════════════════════════════
  SELECT out_source_id INTO v_id1 FROM public.my_approval_inbox()
   WHERE out_source_module='finance' LIMIT 1;
  BEGIN
    PERFORM public.unified_approval_decide('finance', v_id1, 'approved', 'موافق');
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('اعتماد طلب مالية عبر المحرك', TRUE, 'تم');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('اعتماد طلب مالية عبر المحرك', FALSE, SQLERRM);
  END;

  SELECT status INTO v_txt FROM public.financial_approval_requests WHERE id=v_id1;
  INSERT INTO vb_results(name,passed,detail) VALUES
    ('حالة الطلب المالي تغيّرت', v_txt='approved', 'status='||v_txt);

  SELECT out_source_id INTO v_id2 FROM public.my_approval_inbox()
   WHERE out_source_module='mrp' LIMIT 1;
  BEGIN
    PERFORM public.unified_approval_decide('mrp', v_id2, 'rejected', 'مرفوض');
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('رفض طلب تصنيع عبر المحرك', TRUE, 'تم');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vb_results(name,passed,detail) VALUES
      ('رفض طلب تصنيع عبر المحرك', FALSE, SQLERRM);
  END;

  -- ══ (ز) الدوال القائمة لم تُمسّ ══════════════════════════════════════
  INSERT INTO vb_results(name,passed,detail)
  SELECT 'submit_journal_entry سليمة',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='submit_journal_entry'), 'checked';

  INSERT INTO vb_results(name,passed,detail)
  SELECT 'approve_mrp_bom_version سليمة',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='approve_mrp_bom_version'), 'checked';

  -- ══ (ح) anon محروم ═══════════════════════════════════════════════════
  INSERT INTO vb_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.create_financial_approval(text,uuid,numeric)',
      'public.create_mrp_bom_approval(uuid,text)',
      'public.create_general_approval(text,text,text,uuid,text,text,text,numeric)',
      'public.assign_org_role(uuid,text,uuid,text)'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.mrp_bom_approvals WHERE tenant_id=v_tenant;
  DELETE FROM public.mrp_bom_versions WHERE tenant_id=v_tenant;
  DELETE FROM public.mrp_bom_headers WHERE tenant_id=v_tenant;
  DELETE FROM public.inventory_items WHERE tenant_id=v_tenant;
  DELETE FROM public.financial_approval_requests WHERE tenant_id=v_tenant;
  DELETE FROM public.portal_unit_assignments WHERE tenant_id=v_tenant;
  DELETE FROM public.org_role_assignments WHERE tenant_id=v_tenant;
  UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL,
         direct_manager_id=NULL, procurement_manager_id=NULL WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id IN (v_admin,v_mgr,v_emp);
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM vb_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vb_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  جسور الموافقات 0306: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
