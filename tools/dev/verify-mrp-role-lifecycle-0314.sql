-- ============================================================================
-- verify-mrp-role-lifecycle-0314.sql
-- اختبار سلوكي لمايجريشن 0314 — دورة حياة أدوار التصنيع.
--
-- يغطي: الكتالوج المُشتقّ · الامتياز المركزي · التضييق الأمني ·
--        الإسناد والسحب · الأرشفة · العزل بين المستأجرين · نطاق المصنع
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t1   UUID := gen_random_uuid();
  v_t2   UUID := gen_random_uuid();
  v_d1   UUID := gen_random_uuid();
  v_p1   UUID := gen_random_uuid();   -- مصنع في المستأجر ١
  v_p2   UUID := gen_random_uuid();   -- مصنع في المستأجر ٢
  v_adm  UUID := gen_random_uuid();   -- admin
  v_mgr  UUID := gen_random_uuid();   -- manager بلا وحدة mrp
  v_mfg  UUID := gen_random_uuid();   -- manufacturing
  v_emp  UUID := gen_random_uuid();   -- موظف هدف
  v_t2u  UUID := gen_random_uuid();   -- مستخدم مستأجر آخر
  v_n    INT;
  v_pass INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t1,'T1 314','مصنع ١','t1-314-'||substr(v_t1::text,1,8)),
    (v_t2,'T2 314','مصنع ٢','t2-314-'||substr(v_t2::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d1,v_t1,'الإنتاج');
  INSERT INTO public.manufacturing_plants(id,tenant_id,plant_code,name_ar) VALUES
    (v_p1,v_t1,'PL1','مصنع بغداد'), (v_p2,v_t2,'PL2','مصنع البصرة');
  INSERT INTO auth.users(id,email) VALUES
    (v_adm,'a-'||substr(v_adm::text,1,8)||'@314.io'),
    (v_mgr,'m-'||substr(v_mgr::text,1,8)||'@314.io'),
    (v_mfg,'f-'||substr(v_mfg::text,1,8)||'@314.io'),
    (v_emp,'e-'||substr(v_emp::text,1,8)||'@314.io'),
    (v_t2u,'x-'||substr(v_t2u::text,1,8)||'@314.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_adm,v_t1,'مدير نظام','admin'),
    (v_mgr,v_t1,'مدير قسم','manager'),
    (v_mfg,v_t1,'موظف تصنيع','manufacturing'),
    (v_emp,v_t1,'عامل','employee'),
    (v_t2u,v_t2,'مدير مستأجر ٢','admin');

  -- ═══ 1) الكتالوج مُشتقّ من القيد ═══════════════════════════════════
  SELECT count(*) INTO v_n FROM public.mrp_role_catalog();
  ASSERT v_n = 9, format('1.1 الكتالوج أعاد %s دوراً (متوقَّع 9)', v_n);
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM public.mrp_role_catalog()
                  WHERE out_role_key='production_manager' AND out_label_ar='مدير الإنتاج'),
    '1.2 مدير الإنتاج مفقود أو بلا تسمية عربية';
  v_pass := v_pass + 1;

  -- لا يتسرّب أي محرف اقتباس أو نوع
  ASSERT NOT EXISTS (SELECT 1 FROM public.mrp_role_catalog()
                      WHERE out_role_key LIKE '%''%' OR out_role_key LIKE '%text%'),
    '1.3 الكتالوج يسرّب محارف من تعريف القيد';
  v_pass := v_pass + 1;

  -- كل مفتاح له تسمية عربية (لا مفتاح خام معروض للمستخدم)
  ASSERT NOT EXISTS (SELECT 1 FROM public.mrp_role_catalog() WHERE out_label_ar = out_role_key),
    '1.4 دور بلا تسمية عربية';
  v_pass := v_pass + 1;

  -- ★ الكتالوج يطابق ما يقبله الجدول فعلاً — لا مصدر حقيقة ثانٍ
  FOR v_n IN SELECT 1 FROM public.mrp_role_catalog() LOOP NULL; END LOOP;
  ASSERT (SELECT bool_and(
            EXISTS (SELECT 1 FROM pg_constraint c
                     WHERE c.conrelid='public.mrp_user_roles'::regclass
                       AND pg_get_constraintdef(c.oid) LIKE '%'''||k.out_role_key||'''%')
          ) FROM public.mrp_role_catalog() k),
    '1.5 الكتالوج يحوي دوراً لا يقبله القيد';
  v_pass := v_pass + 1;

  -- ═══ 2) ★ التضييق الأمني: manager وحده لا يكفي ═════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  ASSERT NOT public.can_manage_mrp_roles(),
    '2.1 مدير قسم بلا وحدة mrp يملك الامتياز — تصعيد أفقي';
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.assign_mrp_role(v_emp,'production_manager',NULL);
    RAISE EXCEPTION '2.2 مدير بلا وحدة mrp أسند دوراً';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- بعد إسناد وحدة mrp
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_mgr,'manager','mrp','department',v_d1);
  ASSERT public.can_manage_mrp_roles(), '2.3 مدير بوحدة mrp ما زال محروماً';
  v_pass := v_pass + 1;

  -- ★ وحدة أخرى لا تكفي: نتحقق أن الشرط على unit_key='mrp' تحديداً
  UPDATE public.portal_unit_assignments SET is_active=FALSE
   WHERE user_id=v_mgr AND unit_key='mrp';
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_mgr,'manager','hr','department',v_d1);
  ASSERT NOT public.can_manage_mrp_roles(),
    '2.4 وحدة hr منحت امتياز إدارة أدوار التصنيع';
  v_pass := v_pass + 1;

  UPDATE public.portal_unit_assignments SET is_active=TRUE
   WHERE user_id=v_mgr AND unit_key='mrp';

  -- ═══ 3) الأدوار المخوَّلة ══════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  ASSERT public.can_manage_mrp_roles(), '3.1 admin محروم';
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_mfg::text, TRUE);
  ASSERT public.can_manage_mrp_roles(), '3.2 manufacturing محروم';
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  ASSERT NOT public.can_manage_mrp_roles(), '3.3 موظف عادي يملك الامتياز';
  v_pass := v_pass + 1;

  -- ═══ 4) الإسناد ════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  PERFORM public.assign_mrp_role(v_emp,'bom_engineer',NULL);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='bom_engineer' AND is_active;
  ASSERT v_n = 1, format('4.1 الإسناد فشل (%s)', v_n);
  v_pass := v_pass + 1;

  -- إسناد ثانٍ لنفس المستخدم — أدوار متعددة مسموحة (عكس profiles.role)
  PERFORM public.assign_mrp_role(v_emp,'quality_inspector',NULL);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles WHERE user_id=v_emp AND is_active;
  ASSERT v_n = 2, format('4.2 الأدوار المتعددة لا تعمل (%s)', v_n);
  v_pass := v_pass + 1;

  -- التكرار لا يُنشئ صفاً ثانياً
  PERFORM public.assign_mrp_role(v_emp,'bom_engineer',NULL);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='bom_engineer';
  ASSERT v_n = 1, format('4.3 تكرّر الصف (%s)', v_n);
  v_pass := v_pass + 1;

  -- إسناد بنطاق مصنع
  PERFORM public.assign_mrp_role(v_emp,'production_manager',v_p1);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND plant_id=v_p1 AND is_active;
  ASSERT v_n = 1, '4.4 الإسناد بنطاق مصنع فشل';
  v_pass := v_pass + 1;

  -- ★ نفس الدور بمصنع مختلف صف مستقل (النطاق يفرّق)
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='production_manager';
  ASSERT v_n = 1, '4.5 خلط بين الدور المُنطَّق وغير المُنطَّق';
  v_pass := v_pass + 1;

  -- ═══ 5) رفض المجهول وعبور المستأجرين ═══════════════════════════════
  BEGIN
    PERFORM public.assign_mrp_role(v_emp,'supreme_overlord',NULL);
    RAISE EXCEPTION '5.1 قُبل دور مجهول';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.assign_mrp_role(v_t2u,'bom_engineer',NULL);
    RAISE EXCEPTION '5.2 أُسند لمستخدم من مستأجر آخر';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TARGET_USER_NOT_IN_TENANT%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- ★ مصنع من مستأجر آخر مرفوض (فحص أضافه 0314)
  BEGIN
    PERFORM public.assign_mrp_role(v_emp,'mrp_planner',v_p2);
    RAISE EXCEPTION '5.3 قُبل مصنع من مستأجر آخر';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PLANT_NOT_IN_TENANT%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- ═══ 6) السحب ══════════════════════════════════════════════════════
  SELECT public.revoke_mrp_role(v_emp,'bom_engineer',NULL) INTO v_n;
  ASSERT v_n = 1, format('6.1 السحب أعاد %s', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='bom_engineer' AND is_active;
  ASSERT v_n = 0, '6.2 السحب لم يُعطّل';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='bom_engineer' AND NOT is_active;
  ASSERT v_n = 1, '6.3 الصف حُذف بدل أن يُؤرشَف';
  v_pass := v_pass + 1;

  -- السحب لا يمسّ الأدوار الأخرى
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='quality_inspector' AND is_active;
  ASSERT v_n = 1, '6.4 السحب أتلف دوراً آخر';
  v_pass := v_pass + 1;

  -- ★ السحب يميّز النطاق: سحب بلا مصنع لا يمسّ المُنطَّق بمصنع
  SELECT public.revoke_mrp_role(v_emp,'production_manager',NULL) INTO v_n;
  ASSERT v_n = 0, format('6.5 السحب بلا مصنع سحب المُنطَّق بمصنع (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT public.revoke_mrp_role(v_emp,'production_manager',v_p1) INTO v_n;
  ASSERT v_n = 1, '6.6 السحب بنطاق مصنع فشل';
  v_pass := v_pass + 1;

  -- السحب المكرّر لا يفشل ويعيد صفراً
  SELECT public.revoke_mrp_role(v_emp,'production_manager',v_p1) INTO v_n;
  ASSERT v_n = 0, format('6.7 السحب المكرّر أعاد %s', v_n);
  v_pass := v_pass + 1;

  -- إعادة الإسناد تُحيي الصف المؤرشف
  PERFORM public.assign_mrp_role(v_emp,'bom_engineer',NULL);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='bom_engineer';
  ASSERT v_n = 1, format('6.8 الإعادة أنشأت صفاً ثانياً (%s)', v_n);
  v_pass := v_pass + 1;

  -- غير المخوَّل لا يسحب
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  BEGIN
    PERFORM public.revoke_mrp_role(v_emp,'quality_inspector',NULL);
    RAISE EXCEPTION '6.9 موظف سحب دوراً — تصعيد امتياز';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- ═══ 7) شاشة الإدارة ═══════════════════════════════════════════════
  -- غير المخوَّل يرى صفراً (لا خطأ يكشف الوجود)
  SELECT count(*) INTO v_n FROM public.mrp_role_assignments_overview();
  ASSERT v_n = 0, format('7.1 تسريب %s صف لغير المخوَّل', v_n);
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  SELECT count(*) INTO v_n FROM public.mrp_role_assignments_overview();
  ASSERT v_n >= 2, format('7.2 المخوَّل يرى %s صف فقط', v_n);
  v_pass := v_pass + 1;

  -- ★ العزل: لا يرى صفوف المستأجر الثاني
  PERFORM set_config('request.jwt.claim.sub', v_t2u::text, TRUE);
  PERFORM public.assign_mrp_role(v_t2u,'mrp_planner',NULL);
  SELECT count(*) INTO v_n FROM public.mrp_role_assignments_overview();
  ASSERT v_n = 1, format('7.3 تسرّب مستأجر: رأى %s صف', v_n);
  v_pass := v_pass + 1;

  -- الاسم والتسمية موجودان (الشاشة تعرضهما)
  ASSERT EXISTS (SELECT 1 FROM public.mrp_role_assignments_overview()
                  WHERE out_full_name IS NOT NULL AND out_mrp_role IS NOT NULL),
    '7.4 حقول العرض فارغة';
  v_pass := v_pass + 1;

  -- ═══ 8) الصلاحيات ══════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon','public.revoke_mrp_role(uuid,text,uuid)','EXECUTE'),
    '8.1 anon يسحب الأدوار';
  ASSERT NOT has_function_privilege('anon','public.mrp_role_assignments_overview()','EXECUTE'),
    '8.2 anon يقرأ الإسنادات';
  ASSERT NOT has_function_privilege('anon','public.can_manage_mrp_roles()','EXECUTE'),
    '8.3 anon يفحص الامتياز';
  v_pass := v_pass + 3;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.mrp_user_roles          WHERE user_id IN (v_adm,v_mgr,v_mfg,v_emp,v_t2u);
  DELETE FROM public.portal_unit_assignments WHERE user_id IN (v_adm,v_mgr,v_mfg,v_emp,v_t2u);
  DELETE FROM public.movement_role_assignments WHERE user_id IN (v_adm,v_mgr,v_mfg,v_emp,v_t2u);
  DELETE FROM public.profiles                WHERE id      IN (v_adm,v_mgr,v_mfg,v_emp,v_t2u);
  DELETE FROM auth.users                     WHERE id      IN (v_adm,v_mgr,v_mfg,v_emp,v_t2u);
  DELETE FROM public.manufacturing_plants    WHERE id      IN (v_p1,v_p2);
  DELETE FROM public.departments             WHERE id      =  v_d1;
  DELETE FROM public.tenants                 WHERE id      IN (v_t1,v_t2);

  RAISE NOTICE '✅ verify-0314: %/36 تأكيداً ناجحاً', v_pass;
END $$;
