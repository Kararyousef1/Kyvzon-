-- ============================================================================
-- FILE: tools/dev/verify-approval-rules-0308.sql
-- PURPOSE: اختبار سلوكي لإدارة قواعد الاعتماد وكشف الفجوات (0308)
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vr_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vr_results;

DO $$
DECLARE
  v_tenant UUID;
  v_dept   UUID;
  v_admin  UUID := gen_random_uuid();
  v_emp    UUID := gen_random_uuid();
  v_mgr    UUID := gen_random_uuid();
  v_rule1  UUID;
  v_rule2  UUID;
  v_cnt    INT;
  v_txt    TEXT;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر قواعد', 'verify-rules-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'العمليات') RETURNING id INTO v_dept;

  INSERT INTO auth.users (id,email) VALUES
    (v_admin,'vr-admin@t.local'),(v_emp,'vr-emp@t.local'),(v_mgr,'vr-mgr@t.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department) VALUES
    (v_admin,v_tenant,'مدير النظام','vr-admin@t.local','admin','العمليات'),
    (v_emp,  v_tenant,'موظف','vr-emp@t.local','employee','العمليات'),
    (v_mgr,  v_tenant,'مدير','vr-mgr@t.local','manager','العمليات');

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, TRUE);

  -- ══ 1) الإنشاء ═══════════════════════════════════════════════════════
  SELECT public.upsert_approval_rule('finance','مصروف صغير',0,10000,1,'manager',NULL,NULL)
    INTO v_rule1;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('إنشاء قاعدة يُرجع معرّفاً', v_rule1 IS NOT NULL, 'id='||COALESCE(v_rule1::TEXT,'NULL'));

  -- ══ 2) التعديل ═══════════════════════════════════════════════════════
  SELECT public.upsert_approval_rule('finance','مصروف صغير معدَّل',0,15000,1,'manager',NULL,v_rule1)
    INTO v_rule2;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('التعديل يُبقي المعرّف نفسه', v_rule1 = v_rule2, 'same='||(v_rule1=v_rule2));

  SELECT max_amount::TEXT INTO v_txt FROM public.approval_rules WHERE id=v_rule1;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('القيمة الجديدة حُفظت', v_txt LIKE '15000%', 'max='||v_txt);

  -- ══ 3) التحقق من المدخلات ════════════════════════════════════════════
  BEGIN
    PERFORM public.upsert_approval_rule('finance','عكسي',5000,1000,1,'manager',NULL,NULL);
    INSERT INTO vr_results(name,passed,detail) VALUES ('يرفض نطاقاً مقلوباً',FALSE,'قُبل!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('يرفض نطاقاً مقلوباً', SQLERRM LIKE '%INVALID_AMOUNT_RANGE%', SQLERRM);
  END;

  BEGIN
    PERFORM public.upsert_approval_rule('finance','سالب',-100,1000,1,'manager',NULL,NULL);
    INSERT INTO vr_results(name,passed,detail) VALUES ('يرفض مبلغاً سالباً',FALSE,'قُبل!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('يرفض مبلغاً سالباً', SQLERRM LIKE '%NEGATIVE_AMOUNT%', SQLERRM);
  END;

  BEGIN
    PERFORM public.upsert_approval_rule('finance','   ',0,1000,1,'manager',NULL,NULL);
    INSERT INTO vr_results(name,passed,detail) VALUES ('يرفض اسماً فارغاً',FALSE,'قُبل!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('يرفض اسماً فارغاً', SQLERRM LIKE '%RULE_NAME_REQUIRED%', SQLERRM);
  END;

  BEGIN
    PERFORM public.upsert_approval_rule('bogus_unit','قاعدة',0,1000,1,'manager',NULL,NULL);
    INSERT INTO vr_results(name,passed,detail) VALUES ('يرفض وحدة غير معروفة',FALSE,'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('يرفض وحدة غير معروفة', TRUE, 'رُفض بقيد القاعدة');
  END;

  BEGIN
    PERFORM public.upsert_approval_rule('finance','قاعدة',0,1000,9,'manager',NULL,NULL);
    INSERT INTO vr_results(name,passed,detail) VALUES ('يرفض مستوى خارج 1-5',FALSE,'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('يرفض مستوى خارج 1-5', TRUE, 'رُفض بقيد القاعدة');
  END;

  BEGIN
    PERFORM public.upsert_approval_rule('finance','قاعدة',0,1000,1,'manager',gen_random_uuid(),NULL);
    INSERT INTO vr_results(name,passed,detail) VALUES ('يرفض قسماً غير موجود',FALSE,'قُبل!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('يرفض قسماً غير موجود', SQLERRM LIKE '%DEPARTMENT_NOT_FOUND%', SQLERRM);
  END;

  -- ══ 4) الصلاحية ══════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  BEGIN
    PERFORM public.upsert_approval_rule('finance','تسلل',0,1000,1,'manager',NULL,NULL);
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('موظف عادي لا يُنشئ قواعد', FALSE, 'مرّ — ثغرة!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('موظف عادي لا يُنشئ قواعد', SQLERRM LIKE '%NOT_AUTHORIZED_TO_MANAGE_RULES%', SQLERRM);
  END;

  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  BEGIN
    PERFORM public.set_approval_rule_active(v_rule1, FALSE);
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('مدير عادي لا يُعطّل قواعد', FALSE, 'مرّ — ثغرة!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('مدير عادي لا يُعطّل قواعد', SQLERRM LIKE '%NOT_AUTHORIZED_TO_MANAGE_RULES%', SQLERRM);
  END;

  -- ══ 5) التعطيل لا الحذف ══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, TRUE);
  PERFORM public.set_approval_rule_active(v_rule1, FALSE);

  SELECT count(*) INTO v_cnt FROM public.approval_rules WHERE id=v_rule1 AND is_active;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('التعطيل يُخفي القاعدة', v_cnt=0, 'active='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.approval_rules WHERE id=v_rule1;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('لا حذف — الصف باقٍ للتدقيق', v_cnt=1, 'rows='||v_cnt);

  PERFORM public.set_approval_rule_active(v_rule1, TRUE);

  BEGIN
    PERFORM public.set_approval_rule_active(gen_random_uuid(), FALSE);
    INSERT INTO vr_results(name,passed,detail) VALUES ('يرفض قاعدة غير موجودة',FALSE,'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vr_results(name,passed,detail) VALUES
      ('يرفض قاعدة غير موجودة', SQLERRM LIKE '%RULE_NOT_FOUND%', SQLERRM);
  END;

  -- ══ 6) اللوحة ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.approval_rules_board('finance');
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('اللوحة تعرض قواعد المالية', v_cnt=1, 'count='||v_cnt);

  SELECT out_department INTO v_txt FROM public.approval_rules_board('finance') LIMIT 1;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('القسم الفارغ يُعرض «كل الأقسام»', v_txt='كل الأقسام', 'dept='||COALESCE(v_txt,'NULL'));

  -- ══ 7) 🔴 كشف التداخل ════════════════════════════════════════════════
  PERFORM public.upsert_approval_rule('hr','قاعدة أ',0,5000,1,'manager',NULL,NULL);
  PERFORM public.upsert_approval_rule('hr','قاعدة ب',3000,8000,1,'manager',NULL,NULL);

  SELECT count(*) INTO v_cnt FROM public.detect_approval_rule_gaps('hr')
   WHERE out_severity='error' AND out_issue LIKE '%متداخلان%';
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('يكشف تداخل نطاقين', v_cnt=1, 'count='||v_cnt);

  SELECT out_detail INTO v_txt FROM public.detect_approval_rule_gaps('hr')
   WHERE out_issue LIKE '%متداخلان%' LIMIT 1;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('رسالة التداخل تذكر الأسماء والأرقام',
     v_txt LIKE '%قاعدة أ%' AND v_txt LIKE '%قاعدة ب%', 'detail='||left(COALESCE(v_txt,''),50));

  -- ══ 8) 🔴 كشف الفجوة ═════════════════════════════════════════════════
  PERFORM public.upsert_approval_rule('crm','خصم صغير',0,1000,1,'manager',NULL,NULL);
  PERFORM public.upsert_approval_rule('crm','خصم كبير',5000,20000,1,'manager',NULL,NULL);

  SELECT count(*) INTO v_cnt FROM public.detect_approval_rule_gaps('crm')
   WHERE out_severity='warning' AND out_issue LIKE '%فجوة%';
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('يكشف الفجوة بين نطاقين', v_cnt=1, 'count='||v_cnt);

  -- ══ 9) قواعد سليمة متتالية لا تُنتج إنذاراً ══════════════════════════
  PERFORM public.upsert_approval_rule('mrp','صغير',0,10000,1,'manager',NULL,NULL);
  PERFORM public.upsert_approval_rule('mrp','كبير',10000.01,99999,1,'manager',NULL,NULL);

  SELECT count(*) INTO v_cnt FROM public.detect_approval_rule_gaps('mrp')
   WHERE out_severity IN ('error','warning');
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('القواعد المتتالية السليمة بلا إنذار', v_cnt=0, 'issues='||v_cnt);

  -- ══ 10) وحدة بلا قواعد ═══════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.detect_approval_rule_gaps('contracts')
   WHERE out_severity='info' AND out_issue LIKE '%بلا قواعد%';
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('يُنبّه على وحدة بلا قواعد', v_cnt=1, 'count='||v_cnt);

  -- ══ 11) 🔴 دور بلا شاغل ══════════════════════════════════════════════
  PERFORM public.upsert_approval_rule('inventory','تسوية',0,50000,1,'direct_manager',v_dept,NULL);

  SELECT count(*) INTO v_cnt FROM public.detect_approval_rule_gaps('inventory')
   WHERE out_severity='error' AND out_issue LIKE '%بلا شاغل%';
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('يكشف دوراً مطلوباً بلا شاغل', v_cnt=1, 'count='||v_cnt);

  -- وبعد إسناد الدور يختفي الإنذار
  PERFORM public.assign_org_role(v_dept,'direct_manager',v_mgr,NULL);
  SELECT count(*) INTO v_cnt FROM public.detect_approval_rule_gaps('inventory')
   WHERE out_severity='error' AND out_issue LIKE '%بلا شاغل%';
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('الإنذار يختفي بعد إسناد الدور', v_cnt=0, 'count='||v_cnt);

  -- ══ 12) التكامل مع resolve_approval_chain ════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.resolve_approval_chain('inventory', v_dept, 25000);
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('السلسلة تستخدم القاعدة الجديدة', v_cnt=1, 'levels='||v_cnt);

  SELECT out_approver_id::TEXT INTO v_txt
    FROM public.resolve_approval_chain('inventory', v_dept, 25000) LIMIT 1;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('السلسلة تحلّ المعتمِد من الهيكل', v_txt = v_mgr::TEXT,
     'approver='||COALESCE(v_txt,'NULL'));

  -- ══ 13) عزل المستأجرين ═══════════════════════════════════════════════
  --
  -- تصحيح 2026-08-05: كان الفحص بالاسم فيلتقط قواعد مستأجرين آخرين
  -- تحمل الاسم نفسه — إنذار كاذب لا تسرّب. الفحص الصحيح: هل تُرجع
  -- اللوحة (المفلترة بالمستأجر) أي صف لا ينتمي لمستأجرنا؟
  SELECT count(*) INTO v_cnt
    FROM public.approval_rules_board() b
    JOIN public.approval_rules r ON r.id = b.out_rule_id
   WHERE r.tenant_id <> v_tenant;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('اللوحة لا تُرجع قواعد مستأجر آخر', v_cnt=0, 'cross='||v_cnt);

  -- وكل ما أنشأناه ينتمي لمستأجرنا
  SELECT count(*) INTO v_cnt
    FROM public.approval_rules_board() b
    JOIN public.approval_rules r ON r.id = b.out_rule_id
   WHERE r.tenant_id = v_tenant;
  INSERT INTO vr_results(name,passed,detail) VALUES
    ('اللوحة تُرجع قواعد مستأجرنا وحدها', v_cnt > 0, 'ours='||v_cnt);

  -- ══ 14) anon محروم ═══════════════════════════════════════════════════
  INSERT INTO vr_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.upsert_approval_rule(text,text,numeric,numeric,integer,text,uuid,uuid)',
      'public.set_approval_rule_active(uuid,boolean)',
      'public.approval_rules_board(text)',
      'public.detect_approval_rule_gaps(text)'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.approval_rules WHERE tenant_id=v_tenant;
  DELETE FROM public.org_role_assignments WHERE tenant_id=v_tenant;
  UPDATE public.departments SET direct_manager_id=NULL WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id IN (v_admin,v_emp,v_mgr);
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM vr_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vr_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  قواعد الاعتماد 0308: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
