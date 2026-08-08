-- ============================================================================
-- verify-mrp-user-roles-0312.sql
-- اختبار سلوكي لمايجريشن 0312 — إحياء mrp_user_roles اليتيم.
--
-- يغطي: القراءة · الحارس الموسّع · أقل امتياز · التوافق الخلفي المطلق ·
--        العزل بين المستأجرين · الإلغاء · دالة الإسناد · رفض المجهول
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t1  UUID := gen_random_uuid();
  v_t2  UUID := gen_random_uuid();
  v_pm  UUID := gen_random_uuid();   -- مدير إنتاج (profiles.role = employee)
  v_bom UUID := gen_random_uuid();   -- مهندس قوائم مواد
  v_mfg UUID := gen_random_uuid();   -- دوره الخشن manufacturing
  v_adm UUID := gen_random_uuid();   -- مدير النظام (يُسند)
  v_t2u UUID := gen_random_uuid();   -- مستخدم مستأجر آخر
  v_n    INT;
  v_ok   BOOLEAN;
  v_pass INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t1,'T1 0312','مصنع ١','t1-0312-'||substr(v_t1::text,1,8)),
    (v_t2,'T2 0312','مصنع ٢','t2-0312-'||substr(v_t2::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_pm ,'pm-' ||substr(v_pm::text,1,8) ||'@0312.test'),
    (v_bom,'bom-'||substr(v_bom::text,1,8)||'@0312.test'),
    (v_mfg,'mfg-'||substr(v_mfg::text,1,8)||'@0312.test'),
    (v_adm,'adm-'||substr(v_adm::text,1,8)||'@0312.test'),
    (v_t2u,'t2-' ||substr(v_t2u::text,1,8)||'@0312.test');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_pm ,v_t1,'مدير إنتاج','employee'),
    (v_bom,v_t1,'مهندس BOM','employee'),
    (v_mfg,v_t1,'موظف تصنيع','manufacturing'),
    (v_adm,v_t1,'مدير نظام','admin'),
    (v_t2u,v_t2,'مدير إنتاج ٢','employee');

  INSERT INTO public.mrp_user_roles(tenant_id,user_id,manufacturing_role) VALUES
    (v_t1,v_pm ,'production_manager'),
    (v_t1,v_bom,'bom_engineer'),
    (v_t2,v_t2u,'production_manager');

  -- ═══ 1) القراءة ════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_pm::text, TRUE);
  ASSERT public.current_user_mrp_roles() = ARRAY['production_manager'],
    format('1.1 القراءة خاطئة: %s', public.current_user_mrp_roles());
  v_pass := v_pass + 1;

  ASSERT public.current_user_role() = 'employee',
    '1.2 profiles.role يجب أن يبقى employee — الدوران مستقلان';
  v_pass := v_pass + 1;

  -- ═══ 2) الحارس يقبل الدور الدقيق ═══════════════════════════════════
  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['mrp_planner','production_manager']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT v_ok, '2.1 مدير الإنتاج يجب أن يمرّ (الفرع كان ميتاً قبل 0312)';
  v_pass := v_pass + 1;

  -- ═══ 3) أقل امتياز: لا يمرّ على دور لا يملكه ═══════════════════════
  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['bom_engineer']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT NOT v_ok, '3.1 مدير الإنتاج مرّ على bom_engineer — انهيار أقل امتياز';
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['cost_accountant']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT NOT v_ok, '3.2 مرّ على cost_accountant بلا إسناد';
  v_pass := v_pass + 1;

  -- ═══ 4) كل مستخدم بدوره هو ═════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_bom::text, TRUE);
  ASSERT public.current_user_mrp_roles() = ARRAY['bom_engineer'], '4.1 خلط أدوار بين مستخدمين';
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['bom_engineer']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT v_ok, '4.2 مهندس BOM لا يمرّ على دوره';
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['production_manager']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT NOT v_ok, '4.3 مهندس BOM مرّ على production_manager';
  v_pass := v_pass + 1;

  -- ═══ 5) ★ التوافق الخلفي المطلق — لا انحدار ════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mfg::text, TRUE);
  ASSERT public.current_user_mrp_roles() = ARRAY[]::TEXT[],
    '5.1 موظف التصنيع بلا أدوار دقيقة يجب أن يعيد مصفوفة فارغة';
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['bom_engineer']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT v_ok, '5.2 انحدار: manufacturing كان يمرّ على كل شيء ولم يعد';
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['production_manager']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT v_ok, '5.3 انحدار: admin لم يعد يمرّ';
  v_pass := v_pass + 1;

  -- ═══ 6) العزل بين المستأجرين ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_t2u::text, TRUE);
  ASSERT public.current_user_mrp_roles() = ARRAY['production_manager'],
    '6.1 مستخدم المستأجر الثاني لا يقرأ دوره';
  v_pass := v_pass + 1;

  -- لا يرى صفوف المستأجر الأول: العدد واحد لا اثنان رغم تطابق اسم الدور
  SELECT array_length(public.current_user_mrp_roles(),1) INTO v_n;
  ASSERT v_n = 1, format('6.2 تسرّب مستأجر: قرأ %s دوراً', v_n);
  v_pass := v_pass + 1;

  -- ═══ 7) الإلغاء is_active=FALSE يسحب الحق فوراً ════════════════════
  UPDATE public.mrp_user_roles SET is_active = FALSE WHERE user_id = v_pm;
  PERFORM set_config('request.jwt.claim.sub', v_pm::text, TRUE);
  ASSERT public.current_user_mrp_roles() = ARRAY[]::TEXT[], '7.1 الإلغاء لم يسحب الدور';
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.mrp_require_roles(ARRAY['production_manager']::TEXT[]);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
  END;
  ASSERT NOT v_ok, '7.2 يمرّ رغم إلغاء الدور';
  v_pass := v_pass + 1;

  -- الصف مؤرشف لا محذوف
  SELECT count(*) INTO v_n FROM public.mrp_user_roles WHERE user_id=v_pm AND NOT is_active;
  ASSERT v_n = 1, '7.3 يجب الأرشفة لا الحذف';
  v_pass := v_pass + 1;

  UPDATE public.mrp_user_roles SET is_active = TRUE WHERE user_id = v_pm;

  -- ═══ 8) دالة الإسناد ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  PERFORM public.assign_mrp_role(v_mfg, 'quality_inspector', NULL);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_mfg AND manufacturing_role='quality_inspector' AND is_active;
  ASSERT v_n = 1, '8.1 assign_mrp_role لم يُسند';
  v_pass := v_pass + 1;

  -- إعادة الإسناد لا تُكرّر الصف
  PERFORM public.assign_mrp_role(v_mfg, 'quality_inspector', NULL);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_mfg AND manufacturing_role='quality_inspector';
  ASSERT v_n = 1, format('8.2 تكرّر الصف (%s)', v_n);
  v_pass := v_pass + 1;

  -- دور مجهول مرفوض من قيد الجدول
  BEGIN
    PERFORM public.assign_mrp_role(v_mfg, 'supreme_overlord', NULL);
    RAISE EXCEPTION '8.3 قُبل دور مجهول';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ★ منع الإسناد عبر المستأجرين
  BEGIN
    PERFORM public.assign_mrp_role(v_t2u, 'production_manager', NULL);
    RAISE EXCEPTION '8.4 أُسند دور لمستخدم من مستأجر آخر — تسرّب';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TARGET_USER_NOT_IN_TENANT%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- غير المخوَّل لا يُسند
  PERFORM set_config('request.jwt.claim.sub', v_pm::text, TRUE);
  BEGIN
    PERFORM public.assign_mrp_role(v_bom, 'production_manager', NULL);
    RAISE EXCEPTION '8.5 موظف عادي أسند دوراً — تصعيد امتياز';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- ═══ 9) الجدول لم يعد يتيماً ═══════════════════════════════════════
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosrc ILIKE '%mrp_user_roles%';
  ASSERT v_n >= 2, format('9.1 قارئو mrp_user_roles = %s (كان 0 قبل 0312)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='mrp_require_roles'
     AND p.prosrc ILIKE '%current_user_mrp_roles%';
  ASSERT v_n = 1, '9.2 mrp_require_roles ما زال يتجاهل الجدول';
  v_pass := v_pass + 1;

  -- ═══ 10) الصلاحيات ═════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon','public.current_user_mrp_roles()','EXECUTE'),
    '10.1 anon يقرأ الأدوار';
  ASSERT NOT has_function_privilege('anon','public.assign_mrp_role(uuid,text,uuid)','EXECUTE'),
    '10.2 anon يُسند الأدوار';
  ASSERT has_function_privilege('authenticated','public.mrp_require_roles(text[])','EXECUTE'),
    '10.3 authenticated لا ينفّذ الحارس';
  v_pass := v_pass + 3;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.mrp_user_roles WHERE user_id IN (v_pm,v_bom,v_mfg,v_adm,v_t2u);
  DELETE FROM public.profiles       WHERE id      IN (v_pm,v_bom,v_mfg,v_adm,v_t2u);
  DELETE FROM auth.users            WHERE id      IN (v_pm,v_bom,v_mfg,v_adm,v_t2u);
  DELETE FROM public.tenants        WHERE id      IN (v_t1,v_t2);

  RAISE NOTICE '✅ verify-0312: %/26 تأكيداً ناجحاً', v_pass;
END $$;
