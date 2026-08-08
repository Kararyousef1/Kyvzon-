-- ============================================================================
-- verify-platform-isolation-0318.sql
-- تدقيق المحاور الخمسة: الفروع · الورديات · الكيان المالي ·
--                        عزل بوابة المطوّرين · أنواع الاشتراكات
--
-- ملاحظة منهجية: بعض الفحوص تتطلب SET ROLE authenticated لأن دور
-- postgres يتجاوز RLS (BYPASSRLS). ما لا يمكن قياسه هنا موثَّق صراحةً
-- ولا يُدَّعى إثباته.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t1   UUID := gen_random_uuid();
  v_t2   UUID := gen_random_uuid();
  v_b1   UUID := gen_random_uuid();
  v_b2   UUID := gen_random_uuid();
  v_d1   UUID := gen_random_uuid();
  v_dev  UUID := gen_random_uuid();
  v_mgr  UUID := gen_random_uuid();
  v_emp  UUID := gen_random_uuid();
  v_far  UUID := gen_random_uuid();
  v_eid  UUID;
  v_fid  UUID;
  v_n    INT;
  v_txt  TEXT;
  v_pass INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug,subscription_plan) VALUES
    (v_t1,'T1 318','شركة ١','t1-318-'||substr(v_t1::text,1,8),'professional'),
    (v_t2,'T2 318','شركة ٢','t2-318-'||substr(v_t2::text,1,8),'hybrid');
  INSERT INTO public.branches(id,tenant_id,name_ar,code) VALUES
    (v_b1,v_t1,'فرع بغداد','BGW'), (v_b2,v_t1,'فرع البصرة','BSR');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d1,v_t1,'العمليات');
  INSERT INTO auth.users(id,email) VALUES
    (v_dev,'d-'||substr(v_dev::text,1,8)||'@k.io'),
    (v_mgr,'m-'||substr(v_mgr::text,1,8)||'@1.io'),
    (v_emp,'e-'||substr(v_emp::text,1,8)||'@1.io'),
    (v_far,'f-'||substr(v_far::text,1,8)||'@1.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_dev,NULL,'مطوّر المنصة','developer'),
    (v_mgr,v_t1,'مدير الفرع','manager'),
    (v_emp,v_t1,'موظف بغداد','employee'),
    (v_far,v_t1,'موظف البصرة','employee');

  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id = v_emp;
  SELECT e.id INTO v_fid FROM public.employees e WHERE e.user_id = v_far;

  -- ═══ ① توحيد الاشتراكات ════════════════════════════════════════════
  SELECT plan INTO v_txt FROM public.tenants WHERE id = v_t1;
  ASSERT v_txt = 'pro',
    format('1.1 professional ⇒ plan=%s (متوقَّع pro)', v_txt);
  v_pass := v_pass + 1;

  SELECT plan INTO v_txt FROM public.tenants WHERE id = v_t2;
  ASSERT v_txt = 'enterprise',
    format('1.2 hybrid ⇒ plan=%s (متوقَّع enterprise)', v_txt);
  v_pass := v_pass + 1;

  -- ★ محاولة كسر التوافق يدوياً — المحفّز يُصلحها
  UPDATE public.tenants SET subscription_plan = 'basic' WHERE id = v_t1;
  SELECT plan INTO v_txt FROM public.tenants WHERE id = v_t1;
  ASSERT v_txt = 'basic', format('1.3 المحفّز لم يُزامن (%s)', v_txt);
  v_pass := v_pass + 1;

  UPDATE public.tenants SET subscription_plan = 'professional' WHERE id = v_t1;

  -- كل القيم المقبولة لها خريطة
  FOR v_txt IN SELECT unnest(ARRAY['basic','professional','enterprise','custom','hybrid'])
  LOOP
    ASSERT public.plan_from_subscription_plan(v_txt) IN ('basic','pro','enterprise'),
      format('1.4 خريطة %s تُنتج قيمة خارج قيد plan', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ═══ ② الفروع ══════════════════════════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='employees' AND column_name='branch_id'),
    '2.1 employees.branch_id مفقود';
  v_pass := v_pass + 1;

  UPDATE public.employees SET branch_id = v_b1, department_id = v_d1 WHERE id = v_eid;
  UPDATE public.employees SET branch_id = v_b2, department_id = v_d1 WHERE id = v_fid;

  ASSERT public.resolve_person_branch(v_emp) = v_b1, '2.2 قراءة الفرع فشلت';
  ASSERT public.resolve_person_branch(v_far) = v_b2, '2.3 خلط بين الفروع';
  v_pass := v_pass + 2;

  -- ★ نطاق الفرع في is_in_my_team
  INSERT INTO public.portal_unit_assignments
    (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_mgr,'manager','hr','branch',v_b1);

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  ASSERT public.is_in_my_team(v_emp),
    '2.4 ★ مدير فرع بغداد لا يرى موظف فرعه';
  v_pass := v_pass + 1;

  ASSERT NOT public.is_in_my_team(v_far),
    '2.5 ★ مدير فرع بغداد يرى موظف فرع البصرة — تسرّب';
  v_pass := v_pass + 1;

  -- الفرع يبقى بعد تعديل بيانات أخرى (كان يُفقَد)
  UPDATE public.profiles SET full_name = 'موظف بغداد المُعدَّل' WHERE id = v_emp;
  ASSERT public.resolve_person_branch(v_emp) = v_b1,
    '2.6 ★ الفرع فُقِد بعد تعديل الملف';
  v_pass := v_pass + 1;

  -- ═══ ③ الورديات ════════════════════════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='structure_shifts' AND column_name='tenant_id'),
    '3.1 structure_shifts.tenant_id مفقود';
  v_pass := v_pass + 1;

  -- ★ لا سياسة قراءة مكشوفة
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='structure_shifts' AND cmd='SELECT' AND qual='true'
  ), '3.2 ★ الورديات ما زالت مقروءة للجميع USING(true)';
  v_pass := v_pass + 1;

  INSERT INTO public.structure_shifts(tenant_id,name_ar,code,start_time,end_time)
    VALUES (v_t1,'صباحية ١','M-'||substr(v_t1::text,1,6),'08:00','16:00'),
           (v_t2,'صباحية ٢','M-'||substr(v_t2::text,1,6),'09:00','17:00');

  SELECT count(*) INTO v_n FROM public.structure_shifts WHERE tenant_id = v_t1;
  ASSERT v_n = 1, format('3.3 ورديات الشركة الأولى = %s', v_n);
  v_pass := v_pass + 1;

  -- وردية الموظف عمود حقيقي
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='employees' AND column_name='shift_code'),
    '3.4 employees.shift_code مفقود';
  v_pass := v_pass + 1;

  -- ═══ ④ عزل بوابة المطوّرين ═════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);

  ASSERT public.current_user_is_platform_admin(),
    '4.1 المطوّر فقد صلاحية إدارة المنصة';
  v_pass := v_pass + 1;

  ASSERT NOT public.current_user_is_platform_owner(),
    '4.2 ★ مطوّر بلا مستأجر ما زال يملك بيانات العملاء';
  v_pass := v_pass + 1;

  -- أداة كشف التعارض متاحة له
  SELECT count(*) INTO v_n FROM public.detect_subscription_conflicts();
  ASSERT v_n >= 0, '4.3 أداة التعارض لا تعمل للمطوّر';
  v_pass := v_pass + 1;

  -- ★ وغير المطوّر لا يراها
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.detect_subscription_conflicts();
  ASSERT v_n = 0, format('4.4 ★ مدير عادي يقرأ تعارضات المنصة (%s)', v_n);
  v_pass := v_pass + 1;

  ASSERT NOT public.current_user_is_platform_admin(),
    '4.5 مدير عادي يملك صلاحية منصّية';
  v_pass := v_pass + 1;

  -- ═══ ⑤ كشف تعارض الاشتراك ══════════════════════════════════════════
  -- شركة هجينة بلا features ⇒ يجب أن تُكتشَف
  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.detect_subscription_conflicts()
   WHERE out_tenant_id = v_t2 AND out_issue = 'هجين بلا صفحات';
  ASSERT v_n = 1, format('5.1 لم يُكتشَف الهجين الفارغ (%s)', v_n);
  v_pass := v_pass + 1;

  -- وحدة مُسنَدة خارج enabled_modules ⇒ تُكتشَف
  SELECT count(*) INTO v_n FROM public.detect_subscription_conflicts()
   WHERE out_tenant_id = v_t1 AND out_issue = 'وحدة بلا تفعيل';
  ASSERT v_n = 1, format('5.2 لم تُكتشَف وحدة hr خارج enabled_modules (%s)', v_n);
  v_pass := v_pass + 1;

  -- بعد تفعيل الوحدة يختفي التعارض
  UPDATE public.tenants SET enabled_modules = ARRAY['employee','hr'] WHERE id = v_t1;
  SELECT count(*) INTO v_n FROM public.detect_subscription_conflicts()
   WHERE out_tenant_id = v_t1 AND out_issue = 'وحدة بلا تفعيل';
  ASSERT v_n = 0, '5.3 التعارض لم يختفِ بعد التفعيل';
  v_pass := v_pass + 1;

  -- ═══ ⑥ الكيان والدور المالي ════════════════════════════════════════
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='entity_memberships'
       AND qual ILIKE '%current_user_can_manage_legal_entity%'
  ), '6.1 سياسة entity_memberships تغيّرت';
  v_pass := v_pass + 1;

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='legal_entities'
       AND qual ILIKE '%current_user_tenant_id%'
  ), '6.2 legal_entities بلا فلتر مستأجر';
  v_pass := v_pass + 1;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.structure_shifts        WHERE tenant_id IN (v_t1,v_t2);
  DELETE FROM public.portal_unit_assignments WHERE tenant_id IN (v_t1,v_t2);
  DELETE FROM public.employees               WHERE tenant_id IN (v_t1,v_t2);
  DELETE FROM public.profiles   WHERE id IN (v_dev,v_mgr,v_emp,v_far);
  DELETE FROM auth.users        WHERE id IN (v_dev,v_mgr,v_emp,v_far);
  DELETE FROM public.branches    WHERE id IN (v_b1,v_b2);
  DELETE FROM public.departments WHERE id = v_d1;
  DELETE FROM public.tenants     WHERE id IN (v_t1,v_t2);

  RAISE NOTICE '✅ verify-0318: %/24 تأكيداً ناجحاً', v_pass;
END $$;
