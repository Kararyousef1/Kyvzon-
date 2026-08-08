-- ============================================================================
-- verify-enforcement-console-0321.sql
-- اختبار سلوكي لوحدة تحكّم الإقفال — الدوال التي تغذّي الشاشة.
--
-- يغطي: ظهور الشركات النظيفة · توصية الجاهزية بكل حالاتها ·
--        التفاصيل · العزل · حصر الوصول بالمنصة
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_clean  UUID := gen_random_uuid();   -- off · بلا سجل
  v_ready  UUID := gen_random_uuid();   -- audit · بلا محاولات
  v_dirty  UUID := gen_random_uuid();   -- audit · بمحاولات
  v_locked UUID := gen_random_uuid();   -- enforce
  v_dev    UUID := gen_random_uuid();
  v_usr    UUID := gen_random_uuid();
  v_u2     UUID := gen_random_uuid();
  v_n      INT;
  v_txt    TEXT;
  v_pass   INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug,subscription_plan,enabled_modules,module_enforcement_mode) VALUES
    (v_clean, 'K1','نظيفة',  'k1-'||substr(v_clean::text,1,8), 'basic',       ARRAY['employee','hr'],'off'),
    (v_ready, 'K2','جاهزة',  'k2-'||substr(v_ready::text,1,8), 'professional',ARRAY['employee','hr'],'audit'),
    (v_dirty, 'K3','بمحاولات','k3-'||substr(v_dirty::text,1,8),'basic',       ARRAY['employee'],     'audit'),
    (v_locked,'K4','مُقفَلة', 'k4-'||substr(v_locked::text,1,8),'basic',       ARRAY['employee'],     'enforce');

  INSERT INTO auth.users(id,email) VALUES
    (v_dev,'d-'||substr(v_dev::text,1,8)||'@k.io'),
    (v_usr,'u-'||substr(v_usr::text,1,8)||'@k.io'),
    (v_u2, 'v-'||substr(v_u2::text,1,8) ||'@k.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_dev,v_clean,'مطوّر','developer'),
    (v_usr,v_dirty,'مستخدم أ','admin'),
    (v_u2, v_dirty,'مستخدم ب','employee');

  -- محاولات على شركتين مختلفتين للتحقق من العزل
  INSERT INTO public.subscription_access_log(tenant_id,user_id,module_key,outcome) VALUES
    (v_dirty, v_usr,'inventory','would_block'),
    (v_dirty, v_u2, 'inventory','would_block'),
    (v_dirty, v_usr,'mrp',      'would_block'),
    (v_locked,v_usr,'crm',      'blocked');

  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);

  -- ═══ ① الشركات النظيفة تظهر — جوهر 0321 ════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM public.enforcement_console_overview()
                  WHERE out_tenant_id = v_clean),
    '1.1 ★ شركة بلا سجل غائبة عن الوحدة — لا يمكن اختيارها للتشغيل';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.enforcement_console_overview()
   WHERE out_tenant_id IN (v_clean,v_ready,v_dirty,v_locked);
  ASSERT v_n = 4, format('1.2 ظهرت %s شركة من 4', v_n);
  v_pass := v_pass + 1;

  -- كل شركة صف واحد لا صف لكل محاولة
  SELECT count(*) INTO v_n FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_dirty;
  ASSERT v_n = 1, format('1.3 تكرّرت الشركة %s مرة (GROUP BY خاطئ)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② الإحصاء صحيح ════════════════════════════════════════════════
  SELECT out_would_block INTO v_n FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_dirty;
  ASSERT v_n = 3, format('2.1 would_block = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT out_distinct_modules INTO v_n FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_dirty;
  ASSERT v_n = 2, format('2.2 وحدات مميّزة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_blocked INTO v_n FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_locked;
  ASSERT v_n = 1, format('2.3 blocked = %s', v_n);
  v_pass := v_pass + 1;

  SELECT out_would_block INTO v_n FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_clean;
  ASSERT v_n = 0, '2.4 الشركة النظيفة لها محاولات';
  v_pass := v_pass + 1;

  -- ═══ ③ ★ توصية الجاهزية — كل الحالات ═══════════════════════════════
  SELECT out_readiness INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_clean;
  ASSERT v_txt = 'ابدأ بوضع audit', format('3.1 توصية off = %s', v_txt);
  v_pass := v_pass + 1;

  SELECT out_readiness INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_ready;
  ASSERT v_txt = 'جاهز للإقفال — لا محاولات', format('3.2 توصية audit نظيف = %s', v_txt);
  v_pass := v_pass + 1;

  SELECT out_readiness INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_dirty;
  ASSERT v_txt LIKE 'راجع 2 وحدة%', format('3.3 توصية audit بمحاولات = %s', v_txt);
  v_pass := v_pass + 1;

  SELECT out_readiness INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_locked;
  ASSERT v_txt = 'مُقفَل', format('3.4 توصية enforce = %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ④ enabled_modules تُعاد للعرض ═════════════════════════════════
  ASSERT (SELECT 'hr' = ANY(out_enabled_modules)
            FROM public.enforcement_console_overview() WHERE out_tenant_id = v_clean),
    '4.1 enabled_modules لا تُعاد';
  v_pass := v_pass + 1;

  -- ═══ ⑤ التفاصيل ════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.enforcement_tenant_detail(v_dirty);
  ASSERT v_n = 2, format('5.1 صفوف التفصيل = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ عدّ المستخدمين المميّزين لا المحاولات
  SELECT out_users INTO v_n FROM public.enforcement_tenant_detail(v_dirty)
   WHERE out_module = 'inventory';
  ASSERT v_n = 2, format('5.2 مستخدمون مميّزون = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_would_block INTO v_n FROM public.enforcement_tenant_detail(v_dirty)
   WHERE out_module = 'inventory';
  ASSERT v_n = 2, format('5.3 محاولات inventory = %s', v_n);
  v_pass := v_pass + 1;

  -- الوحدة خارج الخطة
  ASSERT NOT (SELECT out_in_plan FROM public.enforcement_tenant_detail(v_dirty)
               WHERE out_module = 'inventory'),
    '5.4 inventory تُحسَب داخل الخطة وهي ليست كذلك';
  v_pass := v_pass + 1;

  -- ═══ ⑥ العزل بين المستأجرين ════════════════════════════════════════
  ASSERT NOT EXISTS (SELECT 1 FROM public.enforcement_tenant_detail(v_dirty)
                      WHERE out_module = 'crm'),
    '6.1 ★ تسرّب سجل من شركة أخرى';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.enforcement_tenant_detail(v_clean);
  ASSERT v_n = 0, format('6.2 الشركة النظيفة لها %s صف تفصيل', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ ★ الوصول للمنصة وحدها ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_usr::TEXT, TRUE);

  SELECT count(*) INTO v_n FROM public.enforcement_console_overview();
  ASSERT v_n = 0, format('7.1 ★ مدير شركة يرى %s شركة في وحدة المنصة', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.enforcement_tenant_detail(v_dirty);
  ASSERT v_n = 0, format('7.2 ★ مدير شركة يقرأ تفاصيل الإقفال (%s)', v_n);
  v_pass := v_pass + 1;

  -- ولا يبدّل الوضع
  BEGIN
    PERFORM public.set_module_enforcement(v_dirty, 'off');
    RAISE EXCEPTION '7.3 ★ مدير شركة بدّل وضع الإقفال';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_AUTHORIZED_TO_SET_ENFORCEMENT%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑧ الترتيب: audit بمحاولات أولاً ═══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);
  SELECT out_tenant_id INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id IN (v_clean,v_ready,v_dirty,v_locked) LIMIT 1;
  ASSERT v_txt = v_dirty::TEXT,
    '8.1 الترتيب لا يُقدّم الشركة التي تحتاج مراجعة';
  v_pass := v_pass + 1;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.subscription_access_log
   WHERE tenant_id IN (v_clean,v_ready,v_dirty,v_locked);
  DELETE FROM public.employees WHERE tenant_id IN (v_clean,v_ready,v_dirty,v_locked);
  DELETE FROM public.profiles  WHERE id IN (v_dev,v_usr,v_u2);
  DELETE FROM auth.users       WHERE id IN (v_dev,v_usr,v_u2);
  DELETE FROM public.tenants   WHERE id IN (v_clean,v_ready,v_dirty,v_locked);

  RAISE NOTICE '✅ verify-0321: %/22 تأكيداً ناجحاً', v_pass;
END $$;
