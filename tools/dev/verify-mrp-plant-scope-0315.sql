-- ============================================================================
-- verify-mrp-plant-scope-0315.sql
-- اختبار سلوكي لمايجريشن 0315 — نطاق المصنع في أدوار التصنيع.
--
-- يغطي: اتساق الامتياز مع RLS · إرشاد التنطيق · الإسناد والسحب بمصنع ·
--        استقلال الصفوف بين المصانع · العزل بين المستأجرين · حصر الأعمدة
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t1   UUID := gen_random_uuid();
  v_t2   UUID := gen_random_uuid();
  v_d1   UUID := gen_random_uuid();
  v_coord UUID := gen_random_uuid();  -- profiles.role='employee' + وحدة mrp
  v_emp  UUID := gen_random_uuid();
  v_out  UUID := gen_random_uuid();   -- بلا امتياز
  v_t2u  UUID := gen_random_uuid();
  v_pA   UUID := gen_random_uuid();
  v_pB   UUID := gen_random_uuid();
  v_pArch UUID := gen_random_uuid();  -- مصنع مؤرشف
  v_pT2  UUID := gen_random_uuid();
  v_n    INT;
  v_pass INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t1,'T1 315','مصنع ١','t1-315-'||substr(v_t1::text,1,8)),
    (v_t2,'T2 315','مصنع ٢','t2-315-'||substr(v_t2::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d1,v_t1,'الإنتاج');
  INSERT INTO auth.users(id,email) VALUES
    (v_coord,'c-'||substr(v_coord::text,1,8)||'@315.io'),
    (v_emp,  'e-'||substr(v_emp::text,1,8)  ||'@315.io'),
    (v_out,  'o-'||substr(v_out::text,1,8)  ||'@315.io'),
    (v_t2u,  'x-'||substr(v_t2u::text,1,8)  ||'@315.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    -- ★ 'employee' عمداً: هذا من كانت RLS تحجب عنه المصانع قبل 0315
    (v_coord,v_t1,'منسّق التصنيع','employee'),
    (v_emp,  v_t1,'عامل','employee'),
    (v_out,  v_t1,'موظف آخر','employee'),
    (v_t2u,  v_t2,'مدير مستأجر ٢','admin');
  INSERT INTO public.manufacturing_plants(id,tenant_id,plant_code,name_ar,status) VALUES
    (v_pA,   v_t1,'PL-A','مصنع بغداد','active'),
    (v_pB,   v_t1,'PL-B','مصنع البصرة','active'),
    (v_pArch,v_t1,'PL-X','مصنع مغلق','closed'),
    (v_pT2,  v_t2,'PL-T2','مصنع المستأجر الثاني','active');
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_coord,'manager','mrp','department',v_d1);

  -- ═══ 1) ★ اتساق الامتياز مع رؤية المصانع ═══════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_coord::text, TRUE);

  ASSERT public.can_manage_mrp_roles(), '1.1 حامل وحدة mrp محروم من الامتياز';
  v_pass := v_pass + 1;

  -- العطل الذي يعالجه 0315: الامتياز موجود لكن القائمة كانت فارغة
  SELECT count(*) INTO v_n FROM public.mrp_plants_for_role_scope();
  ASSERT v_n = 2, format('1.2 يرى %s مصنعاً (متوقَّع 2) — عدم اتساق مع can_manage', v_n);
  v_pass := v_pass + 1;

  -- ملاحظة: لا نفحص RLS المباشرة هنا. الاختبار يعمل بدور postgres
  -- (BYPASSRLS) فأي SELECT مباشر يمرّ دائماً، والتأكيد سيكون ميتاً.
  -- الفرق الحقيقي بين المسارين يظهر في Supabase الحقيقي وحده، وهو
  -- موثَّق في رأس 0315 بمسبار منفصل. لا نُوثّق ما لم نُثبته هنا.

  -- المؤرشف لا يظهر
  ASSERT NOT EXISTS (SELECT 1 FROM public.mrp_plants_for_role_scope()
                      WHERE out_plant_id = v_pArch),
    '1.4 المصنع المغلق يظهر في قائمة الإسناد';
  v_pass := v_pass + 1;

  -- الأعمدة الثلاثة موجودة ومملوءة
  ASSERT EXISTS (SELECT 1 FROM public.mrp_plants_for_role_scope()
                  WHERE out_plant_code = 'PL-A' AND out_name_ar = 'مصنع بغداد'),
    '1.5 الرمز أو الاسم مفقود';
  v_pass := v_pass + 1;

  -- ═══ 2) العزل بين المستأجرين ═══════════════════════════════════════
  ASSERT NOT EXISTS (SELECT 1 FROM public.mrp_plants_for_role_scope()
                      WHERE out_plant_id = v_pT2),
    '2.1 تسرّب مصنع من مستأجر آخر';
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_t2u::text, TRUE);
  SELECT count(*) INTO v_n FROM public.mrp_plants_for_role_scope();
  ASSERT v_n = 1, format('2.2 مستخدم المستأجر ٢ يرى %s مصنعاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ═══ 3) غير المخوَّل ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_out::text, TRUE);
  ASSERT NOT public.can_manage_mrp_roles(), '3.1 موظف بلا وحدة يملك الامتياز';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.mrp_plants_for_role_scope();
  ASSERT v_n = 0, format('3.2 تسريب %s مصنع لغير المخوَّل', v_n);
  v_pass := v_pass + 1;

  -- ═══ 4) الكتالوج الموسَّع ══════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.mrp_role_catalog();
  ASSERT v_n = 9, format('4.1 الكتالوج %s (متوقَّع 9)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.mrp_role_catalog() WHERE out_plant_scoped;
  ASSERT v_n = 6, format('4.2 الأدوار المُنطَّقة %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT out_plant_scoped FROM public.mrp_role_catalog()
           WHERE out_role_key='production_supervisor'),
    '4.3 مشرف الإنتاج يجب أن يُنصَح بتنطيقه';
  v_pass := v_pass + 1;

  ASSERT NOT (SELECT out_plant_scoped FROM public.mrp_role_catalog()
               WHERE out_role_key='mrp_planner'),
    '4.4 مخطّط الإنتاج على مستوى الشركة';
  v_pass := v_pass + 1;

  -- الكتالوج ما زال مُشتقّاً — لا قائمة منسوخة
  ASSERT (SELECT bool_and(
            EXISTS (SELECT 1 FROM pg_constraint c
                     WHERE c.conrelid='public.mrp_user_roles'::regclass
                       AND pg_get_constraintdef(c.oid) LIKE '%'''||k.out_role_key||'''%')
          ) FROM public.mrp_role_catalog() k),
    '4.5 الكتالوج يحوي دوراً لا يقبله القيد';
  v_pass := v_pass + 1;

  -- ═══ 5) الإسناد بنطاق مصنع ═════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_coord::text, TRUE);

  PERFORM public.assign_mrp_role(v_emp,'production_supervisor',v_pA);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND plant_id=v_pA AND is_active;
  ASSERT v_n = 1, '5.1 الإسناد بمصنع فشل';
  v_pass := v_pass + 1;

  -- ★ نفس الدور بمصنع آخر صف مستقل
  PERFORM public.assign_mrp_role(v_emp,'production_supervisor',v_pB);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='production_supervisor' AND is_active;
  ASSERT v_n = 2, format('5.2 المصنعان لم يُنشئا صفّين (%s)', v_n);
  v_pass := v_pass + 1;

  -- والدور نفسه بلا مصنع صف ثالث مستقل
  PERFORM public.assign_mrp_role(v_emp,'production_supervisor',NULL);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='production_supervisor' AND is_active;
  ASSERT v_n = 3, format('5.3 النطاق العام لم يستقل (%s)', v_n);
  v_pass := v_pass + 1;

  -- التكرار بنفس المصنع لا يُنشئ صفاً رابعاً
  PERFORM public.assign_mrp_role(v_emp,'production_supervisor',v_pA);
  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='production_supervisor';
  ASSERT v_n = 3, format('5.4 التكرار أنشأ صفاً (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ 6) السحب يميّز المصنع ═════════════════════════════════════════
  SELECT public.revoke_mrp_role(v_emp,'production_supervisor',v_pA) INTO v_n;
  ASSERT v_n = 1, format('6.1 السحب بمصنع أعاد %s', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.mrp_user_roles
   WHERE user_id=v_emp AND manufacturing_role='production_supervisor' AND is_active;
  ASSERT v_n = 2, format('6.2 السحب أثّر على مصانع أخرى (%s باقٍ)', v_n);
  v_pass := v_pass + 1;

  -- المصنع الآخر سليم
  ASSERT EXISTS (SELECT 1 FROM public.mrp_user_roles
                  WHERE user_id=v_emp AND plant_id=v_pB AND is_active),
    '6.3 سحب مصنع أتلف مصنعاً آخر';
  v_pass := v_pass + 1;

  -- والنطاق العام سليم
  ASSERT EXISTS (SELECT 1 FROM public.mrp_user_roles
                  WHERE user_id=v_emp AND plant_id IS NULL
                    AND manufacturing_role='production_supervisor' AND is_active),
    '6.4 سحب مصنع أتلف النطاق العام';
  v_pass := v_pass + 1;

  -- ═══ 7) العرض يُظهر اسم المصنع ═════════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM public.mrp_role_assignments_overview()
                  WHERE out_plant_name = 'مصنع البصرة'),
    '7.1 اسم المصنع لا يظهر في العرض';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM public.mrp_role_assignments_overview()
                  WHERE out_plant_id IS NULL AND out_mrp_role='production_supervisor'),
    '7.2 صف النطاق العام مفقود من العرض';
  v_pass := v_pass + 1;

  -- ═══ 8) الصلاحيات ══════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon','public.mrp_plants_for_role_scope()','EXECUTE'),
    '8.1 anon يقرأ المصانع';
  ASSERT has_function_privilege('authenticated','public.mrp_plants_for_role_scope()','EXECUTE'),
    '8.2 authenticated محروم';
  v_pass := v_pass + 2;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.mrp_user_roles          WHERE user_id IN (v_coord,v_emp,v_out,v_t2u);
  DELETE FROM public.portal_unit_assignments WHERE user_id IN (v_coord,v_emp,v_out,v_t2u);
  DELETE FROM public.profiles                WHERE id      IN (v_coord,v_emp,v_out,v_t2u);
  DELETE FROM auth.users                     WHERE id      IN (v_coord,v_emp,v_out,v_t2u);
  DELETE FROM public.manufacturing_plants    WHERE id      IN (v_pA,v_pB,v_pArch,v_pT2);
  DELETE FROM public.departments             WHERE id      =  v_d1;
  DELETE FROM public.tenants                 WHERE id      IN (v_t1,v_t2);

  RAISE NOTICE '✅ verify-0315: %/25 تأكيداً ناجحاً', v_pass;
END $$;
