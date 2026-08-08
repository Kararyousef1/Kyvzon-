-- ============================================================================
-- verify-tech-isolation-0328.sql
--
-- عزل بوابة التقنية: تقنية الشركة ليست مالكة للمنصة.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والسياسات
-- كتعريفات**. إثبات RLS الفعلي في verify-tech-isolation-0328-rls.sh
-- (17 فحصاً) — لا نَدَّعي هنا ما لا نقيسه.
--
-- كل تأكيد ★ سقط فعلاً قبل 0328 (موثَّق في docs/SECURITY_AUDIT_0328.md).
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_pt    UUID;
  v_ta    UUID := gen_random_uuid();
  v_ita   UUID := gen_random_uuid();
  v_ada   UUID := gen_random_uuid();
  v_dev   UUID := gen_random_uuid();
  v_n     INT;
  v_txt   TEXT;
  v_pass  INT := 0;
BEGIN
  SELECT id INTO v_pt FROM public.tenants WHERE slug = 'kyvzon';
  ASSERT v_pt IS NOT NULL, '0.0 مستأجر المنصة (slug=kyvzon) غير موجود';

  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_ta,'CA','شركة عميلة','iso28s-'||substr(v_ta::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_ita,'it-'||substr(v_ita::text,1,8)||'@i28.io'),
    (v_ada,'ad-'||substr(v_ada::text,1,8)||'@i28.io'),
    (v_dev,'dv-'||substr(v_dev::text,1,8)||'@i28.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_ita,v_ta,'تقني الشركة','it_admin'),
    (v_ada,v_ta,'مسؤول الشركة','admin'),
    (v_dev,v_pt,'مطوّر المنصة','developer');

  -- ═══ ① البنية ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('is_platform_tenant','current_user_is_tenant_tech','my_isolation_report');
  ASSERT v_n = 3, format('1.1 دوال 0328 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ تقرير العزل SECURITY INVOKER عمداً: يقيس RLS لا يتجاوزه
  ASSERT (SELECT NOT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='my_isolation_report'),
    '1.2 ★ my_isolation_report صار SECURITY DEFINER — يتجاوز RLS فيكذب';
  v_pass := v_pass + 1;

  -- ═══ ② ★★ مالك المنصة لم يعد يشمل it_admin — العطل ① ═════════════════
  SELECT pg_get_functiondef(p.oid) INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='current_user_is_platform_owner';

  ASSERT v_txt NOT LIKE '%''it_admin''%',
    '2.1 ★★ it_admin ما زال ضمن مالكي المنصة — تسريب قائمة العملاء';
  v_pass := v_pass + 1;

  ASSERT v_txt LIKE '%is_platform_tenant%',
    '2.2 ★ مالك المنصة لا يشترط الانتماء لمستأجر المنصة';
  v_pass := v_pass + 1;

  ASSERT v_txt LIKE '%= ''developer''%',
    '2.3 مالك المنصة لم يعد محصوراً بالمطوّر';
  v_pass := v_pass + 1;

  -- ═══ ③ ★★ سياسات system_settings تفلتر بالمستأجر — العطل ② ═══════════
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='system_settings'
     AND coalesce(qual,'') NOT ILIKE '%tenant_id%';
  ASSERT v_n = 0,
    format('3.1 ★★ %s سياسة على system_settings بلا فلتر مستأجر', v_n);
  v_pass := v_pass + 1;

  -- ★ حارس تقييدي: يُجمع بـAND فلا تتجاوزه سياسة توسيعية لاحقة
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='system_settings'
       AND permissive='RESTRICTIVE' AND coalesce(qual,'') ILIKE '%tenant_id%'
  ), '3.2 ★ لا حارس RESTRICTIVE على system_settings';
  v_pass := v_pass + 1;

  -- الكتابة محروسة كذلك (WITH CHECK لا USING وحده)
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='system_settings'
       AND cmd='ALL' AND coalesce(with_check,'') ILIKE '%tenant_id%'
  ), '3.3 ★★ الكتابة على system_settings بلا WITH CHECK للمستأجر';
  v_pass := v_pass + 1;

  -- ═══ ④ tenant_modules — العطل ③ ══════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='tenant_modules'
     AND cmd='ALL' AND coalesce(qual,'') NOT ILIKE '%tenant_id%';
  ASSERT v_n = 0, format('4.1 ★ %s سياسة كتابة بلا فلتر مستأجر', v_n);
  v_pass := v_pass + 1;

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='tenant_modules'
       AND permissive='RESTRICTIVE'
  ), '4.2 لا حارس RESTRICTIVE على tenant_modules';
  v_pass := v_pass + 1;

  -- ═══ ⑤ سلوك الدوال بهوية كل دور ══════════════════════════════════════
  -- تقني الشركة
  PERFORM set_config('request.jwt.claim.sub', v_ita::TEXT, TRUE);
  ASSERT NOT public.current_user_is_platform_owner(),
    '5.1 ★★ تقني الشركة مالك للمنصة';
  ASSERT public.current_user_is_tenant_tech(),
    '5.2 تقني الشركة فقد صلاحيته التقنية';
  v_pass := v_pass + 2;

  -- مسؤول الشركة
  PERFORM set_config('request.jwt.claim.sub', v_ada::TEXT, TRUE);
  ASSERT NOT public.current_user_is_platform_owner(),
    '5.3 ★★ مسؤول الشركة مالك للمنصة';
  ASSERT public.current_user_is_tenant_tech(),
    '5.4 مسؤول الشركة بلا صلاحية تقنية';
  v_pass := v_pass + 2;

  -- ★ مطوّر المنصة يحتفظ بصلاحيته (الخطر أن يُكسر بالإصلاح)
  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);
  ASSERT public.current_user_is_platform_owner(),
    '5.5 ★ كُسر مطوّر المنصة — لا يستطيع إدارة المنصة';
  v_pass := v_pass + 1;

  -- ═══ ⑥ is_platform_tenant يميّز بدقّة ════════════════════════════════
  ASSERT public.is_platform_tenant(v_pt), '6.1 مستأجر المنصة لم يُميَّز';
  ASSERT NOT public.is_platform_tenant(v_ta), '6.2 ★ شركة عميلة عُدّت مستأجر منصة';
  ASSERT NOT public.is_platform_tenant(NULL), '6.3 NULL عُدّ مستأجر منصة';
  ASSERT NOT public.is_platform_tenant(gen_random_uuid()),
    '6.4 مستأجر غير موجود عُدّ مستأجر منصة';
  v_pass := v_pass + 4;

  -- ★ مطوّر يعمل لدى شركة عميلة ليس مالك منصة
  UPDATE public.profiles SET role='developer' WHERE id=v_ita;
  PERFORM set_config('request.jwt.claim.sub', v_ita::TEXT, TRUE);
  ASSERT NOT public.current_user_is_platform_owner(),
    '6.5 ★★ مطوّر لدى شركة عميلة صار مالكاً للمنصة';
  v_pass := v_pass + 1;
  UPDATE public.profiles SET role='it_admin' WHERE id=v_ita;

  -- ═══ ⑦ الصلاحيات ══════════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon','public.is_platform_tenant(uuid)','EXECUTE'),
    '7.1 anon يفحص مستأجر المنصة';
  ASSERT NOT has_function_privilege('anon','public.my_isolation_report()','EXECUTE'),
    '7.2 anon يقرأ تقرير العزل';
  ASSERT NOT has_function_privilege('anon',
    'public.current_user_is_tenant_tech()','EXECUTE'),
    '7.3 anon يفحص صلاحية التقنية';
  ASSERT has_function_privilege('authenticated',
    'public.my_isolation_report()','EXECUTE'),
    '7.4 المستخدم المُصادَق لا يفحص عزله';
  v_pass := v_pass + 4;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.employees WHERE tenant_id = v_ta;
  DELETE FROM public.profiles  WHERE id IN (v_ita,v_ada,v_dev);
  DELETE FROM auth.users       WHERE id IN (v_ita,v_ada,v_dev);
  DELETE FROM public.tenants   WHERE id = v_ta;

  RAISE NOTICE '✅ verify-0328: %/24 تأكيداً ناجحاً', v_pass;
END $$;
