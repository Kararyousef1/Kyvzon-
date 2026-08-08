-- ============================================================================
-- verify-legacy-deprecation-0329.sql
--
-- الإيقاف التدريجي للبوابة القديمة: قياس قبل الحذف.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والفهارس**.
-- عزل الجدول عبر RLS الحقيقي في verify-legacy-deprecation-0329-rls.sh.
--
-- كل تأكيد ★ يحرس سلوكاً لم يكن موجوداً قبل 0329.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_ta    UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_ua    UUID := gen_random_uuid();
  v_n     INT;
  v_hits  BIGINT;
  v_txt   TEXT;
  v_bool  BOOLEAN;
  v_pass  INT := 0;
BEGIN
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_ta,'LA','قديم أ','lg29a-'||substr(v_ta::text,1,8)),
    (v_tb,'LB','قديم ب','lg29b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES (v_ua,'a-'||substr(v_ua::text,1,8)||'@l29.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_ua,v_ta,'تقني أ','it_admin');

  -- ═══ ① البنية ════════════════════════════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='legacy_route_usage'),
    '1.1 جدول القياس مفقود';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('record_legacy_route_hit','legacy_route_readiness','legacy_route_summary');
  ASSERT v_n = 3, format('1.2 دوال 0329 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ التسجيل يكتب ⇒ VOLATILE (درس 0320)
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='record_legacy_route_hit') = 'v',
    '1.3 ★ record_legacy_route_hit ليست VOLATILE';
  v_pass := v_pass + 1;

  -- ★ لوحات القياس SECURITY INVOKER: تقيس تحت RLS لا تتجاوزه
  ASSERT (SELECT NOT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='legacy_route_summary'),
    '1.4 ★ legacy_route_summary صارت SECURITY DEFINER — تتجاوز RLS فتكذب';
  v_pass := v_pass + 1;

  -- ★ فهرسان جزئيان لا فهرس واحد (UNIQUE يعامل NULL كقيمة مميّزة)
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND tablename='legacy_route_usage'
     AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%WHERE%';
  ASSERT v_n = 2,
    format('1.5 ★ فهارس جزئية فريدة = %s (متوقَّع 2 — فخّ NULL)', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname='legacy_route_usage'),
    '1.6 RLS غير مُفعَّل على جدول القياس';
  v_pass := v_pass + 1;

  -- ★ حارس تقييدي (يُجمع بـAND فلا توسّعه سياسة لاحقة — درس 0320)
  ASSERT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='legacy_route_usage'
      AND permissive='RESTRICTIVE'),
    '1.7 ★ لا حارس RESTRICTIVE على جدول القياس';
  v_pass := v_pass + 1;

  -- ═══ ② التجميع اليومي ════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ua::TEXT, TRUE);
  PERFORM public.record_legacy_route_hit('hr-attendance','/app/hr/attendance');
  PERFORM public.record_legacy_route_hit('hr-attendance','/app/hr/attendance');
  PERFORM public.record_legacy_route_hit('hr-attendance','/app/hr/attendance');

  SELECT count(*) INTO v_n FROM public.legacy_route_usage
   WHERE tenant_id=v_ta AND view_id='hr-attendance';
  ASSERT v_n = 1,
    format('2.1 ★ ثلاث نقرات أنشأت %s صفاً (متوقَّع 1 — تجميع)', v_n);
  v_pass := v_pass + 1;

  SELECT hit_count INTO v_n FROM public.legacy_route_usage
   WHERE tenant_id=v_ta AND view_id='hr-attendance';
  ASSERT v_n = 3, format('2.2 hit_count = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- view مختلف = صفّ منفصل
  PERFORM public.record_legacy_route_hit('admin-employees','/app/admin/employees');
  SELECT count(*) INTO v_n FROM public.legacy_route_usage WHERE tenant_id=v_ta;
  ASSERT v_n = 2, format('2.3 صفوف المستأجر = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- المسار المحلول يُحفظ (يُثبت أن التعيين ما زال صحيحاً)
  SELECT resolved_to INTO v_txt FROM public.legacy_route_usage
   WHERE tenant_id=v_ta AND view_id='hr-attendance';
  ASSERT v_txt = '/app/hr/attendance', format('2.4 المسار المحلول = %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ③ ★ فخّ NULL في المستأجر ════════════════════════════════════════
  --    UNIQUE يعامل NULL كقيمة مميّزة ⇒ بلا فهرس جزئي ثانٍ يتكرّر الصفّ
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  PERFORM public.record_legacy_route_hit('kiosk-mode','/app/kiosk');
  PERFORM public.record_legacy_route_hit('kiosk-mode','/app/kiosk');

  SELECT count(*) INTO v_n FROM public.legacy_route_usage
   WHERE tenant_id IS NULL AND view_id='kiosk-mode';
  ASSERT v_n = 1,
    format('3.1 ★ زائر بلا مستأجر أنشأ %s صفاً (متوقَّع 1) — فخّ NULL', v_n);
  v_pass := v_pass + 1;

  SELECT hit_count INTO v_n FROM public.legacy_route_usage
   WHERE tenant_id IS NULL AND view_id='kiosk-mode';
  ASSERT v_n = 2, format('3.2 ★ hit_count للزائر = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ④ الحالات الحدّية: لا تنهار ولا تُلوّث ══════════════════════════
  ASSERT NOT public.record_legacy_route_hit(''), '4.1 view فارغ سُجّل';
  ASSERT NOT public.record_legacy_route_hit(NULL), '4.2 view NULL سُجّل';
  ASSERT NOT public.record_legacy_route_hit('   '), '4.3 view فراغات سُجّل';
  -- ★ الطول محدود: `view` يأتي من عنوان URL أي من المستخدم
  ASSERT NOT public.record_legacy_route_hit(repeat('x',200)),
    '4.4 ★ view طويل جداً سُجّل — مدخل مستخدم بلا حدّ';
  v_pass := v_pass + 4;

  SELECT count(*) INTO v_n FROM public.legacy_route_usage WHERE btrim(view_id)='';
  ASSERT v_n = 0, format('4.5 تلوّث الجدول بـ%s صفّ فارغ', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ لوحة الجاهزية ═════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ua::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.legacy_route_readiness(90);
  ASSERT v_n = 3, format('5.1 مسارات في اللوحة = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT out_total_hits INTO v_hits FROM public.legacy_route_readiness(90)
   WHERE out_view_id='hr-attendance';
  ASSERT v_hits = 3, format('5.2 إجمالي زيارات hr-attendance = %s', v_hits);
  v_pass := v_pass + 1;

  -- ★ استعمال اليوم ليس آمناً للحذف
  SELECT out_safe_to_drop INTO v_bool FROM public.legacy_route_readiness(90)
   WHERE out_view_id='hr-attendance';
  ASSERT NOT v_bool, '5.3 ★ مسار استُعمل اليوم عُدّ آمناً للحذف';
  v_pass := v_pass + 1;

  -- ★ استعمال قديم يصير آمناً
  UPDATE public.legacy_route_usage
     SET last_seen = NOW() - INTERVAL '200 days'
   WHERE tenant_id=v_ta AND view_id='admin-employees';
  SELECT out_safe_to_drop INTO v_bool FROM public.legacy_route_readiness(90)
   WHERE out_view_id='admin-employees';
  ASSERT v_bool, '5.4 ★ مسار مهجور 200 يوماً لم يُعدّ آمناً للحذف';
  v_pass := v_pass + 1;

  -- الترتيب تنازلي بالاستعمال (الأكثر أولاً)
  SELECT out_view_id INTO v_txt FROM public.legacy_route_readiness(90) LIMIT 1;
  ASSERT v_txt = 'hr-attendance', format('5.5 الترتيب خاطئ — الأول %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑥ التوصية ═══════════════════════════════════════════════════════
  SELECT out_recommendation INTO v_txt FROM public.legacy_route_summary(90);
  ASSERT v_txt LIKE '%لا تحذف%',
    format('6.1 ★ التوصية مع وجود استعمال نشط = «%s»', v_txt);
  v_pass := v_pass + 1;

  SELECT out_active_views INTO v_n FROM public.legacy_route_summary(90);
  ASSERT v_n = 2, format('6.2 مسارات نشطة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ حين يهجر الجميع ⇒ التوصية تنقلب
  UPDATE public.legacy_route_usage SET last_seen = NOW() - INTERVAL '300 days';
  SELECT out_recommendation INTO v_txt FROM public.legacy_route_summary(90);
  ASSERT v_txt LIKE '%يُؤمَن الحذف%',
    format('6.3 ★ صفر استعمال ولم تُوصِ بالحذف: «%s»', v_txt);
  v_pass := v_pass + 1;

  SELECT out_active_views INTO v_n FROM public.legacy_route_summary(90);
  ASSERT v_n = 0, format('6.4 نشطة بعد الهجر = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  -- النافذة مقصوصة (مدخل شاذّ لا يُرهق القاعدة)
  SELECT out_active_views INTO v_n FROM public.legacy_route_summary(100000);
  ASSERT v_n >= 0, '6.5 نافذة ضخمة انهارت';
  SELECT out_active_views INTO v_n FROM public.legacy_route_summary(-5);
  ASSERT v_n >= 0, '6.6 نافذة سالبة انهارت';
  SELECT out_active_views INTO v_n FROM public.legacy_route_summary(NULL);
  ASSERT v_n >= 0, '6.7 نافذة NULL انهارت';
  v_pass := v_pass + 3;

  -- ═══ ⑦ الصلاحيات ══════════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.record_legacy_route_hit(text,text)','EXECUTE'),
    '7.1 anon يُلوّث جدول القياس';
  ASSERT NOT has_function_privilege('anon',
    'public.legacy_route_summary(integer)','EXECUTE'),
    '7.2 anon يقرأ ملخّص الاستعمال';
  ASSERT NOT has_table_privilege('anon','public.legacy_route_usage','SELECT'),
    '7.3 anon يقرأ جدول القياس';
  ASSERT has_function_privilege('authenticated',
    'public.record_legacy_route_hit(text,text)','EXECUTE'),
    '7.4 المستخدم المُصادَق لا يستطيع التسجيل';
  v_pass := v_pass + 4;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.legacy_route_usage WHERE tenant_id IN (v_ta,v_tb) OR tenant_id IS NULL;
  DELETE FROM public.employees WHERE tenant_id IN (v_ta,v_tb);
  DELETE FROM public.profiles  WHERE id = v_ua;
  DELETE FROM auth.users       WHERE id = v_ua;
  DELETE FROM public.tenants   WHERE id IN (v_ta,v_tb);

  RAISE NOTICE '✅ verify-0329: %/34 تأكيداً ناجحاً', v_pass;
END $$;
