-- ============================================================================
-- verify-tech-audit-0330.sql
--
-- بوابة التقنية: سجلّ تدقيق موحّد · سجلّ الأخطاء · المهام المجدولة.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والعرض**.
-- عزل الدوال عبر RLS الحقيقي في verify-tech-audit-0330-rls.sh.
--
-- ملاحظات أعمدة مُحقَّقة (سقط عليها المسبار أولاً):
--   inventory_audit_log.entity_table   NOT NULL
--   finance_audit_events: legal_entity_id · aggregate_type · aggregate_id NOT NULL
--   audit_vault و permission_audit_logs يستعملان `timestamp` لا `created_at`
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_le    UUID := gen_random_uuid();
  v_n     INT;
  v_txt   TEXT;
  v_bool  BOOLEAN;
  v_pass  INT := 0;
BEGIN
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'TA','تدقيق أ','au30a-'||substr(v_t::text ,1,8)),
    (v_tb,'TB','تدقيق ب','au30b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u  ,'it-'||substr(v_u::text  ,1,8)||'@a30.io'),
    (v_emp,'em-'||substr(v_emp::text,1,8)||'@a30.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u  ,v_t,'تقني الشركة','it_admin'),
    (v_emp,v_t,'موظف عادي','employee');
  INSERT INTO public.legal_entities(id,tenant_id,code,name_ar)
    VALUES (v_le,v_t,'LE30V','كيان تدقيق');

  -- ═══ ① البنية ════════════════════════════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM information_schema.views
    WHERE table_schema='public' AND table_name='tech_audit_unified'),
    '1.1 العرض الموحّد مفقود';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('tech_audit_trail','tech_audit_modules','tech_error_log',
      'tech_error_summary','tech_scheduled_jobs');
  ASSERT v_n = 5, format('1.2 دوال 0330 = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  -- ★ دوال المستأجر SECURITY INVOKER: تحترم RLS كل جدول من الـ15
  FOR v_txt IN SELECT unnest(ARRAY['tech_audit_trail','tech_audit_modules',
                                   'tech_error_log','tech_error_summary'])
  LOOP
    ASSERT (SELECT NOT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.3 ★ %s صارت SECURITY DEFINER — تتجاوز RLS', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ platform_audit_log مُستثنى عمداً (بيانات منصة — قرار 0328)
  SELECT pg_get_viewdef('public.tech_audit_unified'::regclass, TRUE) INTO v_txt;
  ASSERT v_txt NOT LIKE '%platform_audit_log%',
    '1.4 ★★ platform_audit_log ضمن السجلّ الموحّد — تسريب بيانات منصة';
  v_pass := v_pass + 1;

  -- العرض يغطّي الوحدات الأساسية
  ASSERT v_txt LIKE '%inventory_audit_log%' AND v_txt LIKE '%finance_audit_events%'
     AND v_txt LIKE '%supplier_audit_log%',
    '1.5 العرض لا يغطّي كل الوحدات';
  v_pass := v_pass + 1;

  -- ═══ ② السجلّ الموحّد يجمع وحدات مختلفة ═══════════════════════════════
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,table_name,created_at)
    VALUES (v_t,v_u,'update','employees',NOW()-INTERVAL '1 hour');
  INSERT INTO public.inventory_audit_log(tenant_id,actor_id,action,entity_table,created_at)
    VALUES (v_t,v_u,'stock_adjust','inventory_items',NOW()-INTERVAL '2 hours');
  INSERT INTO public.finance_audit_events
    (tenant_id,actor_id,event_type,legal_entity_id,aggregate_type,aggregate_id,created_at)
    VALUES (v_t,v_u,'journal_post',v_le,'journal_entry',gen_random_uuid(),NOW()-INTERVAL '3 hours');
  -- حدث لشركة أخرى — يجب ألّا يظهر
  INSERT INTO public.audit_logs(tenant_id,action,table_name,created_at)
    VALUES (v_tb,'delete','secret_table',NOW());

  PERFORM set_config('request.jwt.claim.sub', v_u::TEXT, TRUE);

  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,NULL,100,0);
  ASSERT v_n = 3, format('2.1 ★ السجلّ الموحّد = %s حدث (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ العزل: حدث الشركة الأخرى غائب
  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,NULL,100,0)
   WHERE out_entity = 'secret_table';
  ASSERT v_n = 0, format('2.2 ★★ ظهر %s حدثاً لشركة أخرى', v_n);
  v_pass := v_pass + 1;

  -- الترتيب زمني تنازلي (الأحدث أولاً)
  SELECT out_action INTO v_txt FROM public.tech_audit_trail(NULL,NULL,100,0) LIMIT 1;
  ASSERT v_txt = 'update', format('2.3 الترتيب خاطئ — الأول %s', v_txt);
  v_pass := v_pass + 1;

  -- اسم الفاعل يُحلّ (لا UUID خام في الواجهة)
  SELECT out_actor_name INTO v_txt FROM public.tech_audit_trail(NULL,NULL,1,0);
  ASSERT v_txt = 'تقني الشركة', format('2.4 اسم الفاعل = %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ③ الترشيح والترقيم ══════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.tech_audit_trail('المخزون',NULL,50,0);
  ASSERT v_n = 1, format('3.1 ترشيح الوحدة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,'journal',50,0);
  ASSERT v_n = 1, format('3.2 البحث النصّي = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,NULL,2,0);
  ASSERT v_n = 2, format('3.3 الحدّ = %s (متوقَّع 2)', v_n);
  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,NULL,100,2);
  ASSERT v_n = 1, format('3.4 الإزاحة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 2;

  -- ★ مدخلات شاذّة: الحدّ مقصوص فلا استعلام مفتوح
  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,NULL,100000,0);
  ASSERT v_n <= 500, format('3.5 ★ الحدّ الأقصى تُجووز (%s)', v_n);
  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,NULL,-5,-5);
  ASSERT v_n >= 0, '3.6 قيم سالبة انهارت';
  SELECT count(*) INTO v_n FROM public.tech_audit_trail(NULL,'   ',50,0);
  ASSERT v_n = 3, format('3.7 بحث بفراغات رشّح خطأً (%s)', v_n);
  v_pass := v_pass + 3;

  -- ═══ ④ لوحة الوحدات ══════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.tech_audit_modules();
  ASSERT v_n = 3, format('4.1 وحدات لها أحداث = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT out_events INTO v_n FROM public.tech_audit_modules() WHERE out_module='المخزون';
  ASSERT v_n = 1, format('4.2 عدّاد المخزون = %s', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ سجلّ الأخطاء ══════════════════════════════════════════════════
  INSERT INTO public.error_logs(tenant_id,message,severity,category,route,created_at)
    VALUES (v_t,'فشل الاتصال بجهاز البصمة','critical','network','/app/tech-portal',NOW()),
           (v_t,'حقل ناقص','low','validation','/app/hr',NOW());
  INSERT INTO public.error_logs(tenant_id,message,severity,created_at)
    VALUES (v_tb,'خطأ شركة أخرى','critical',NOW());

  SELECT count(*) INTO v_n FROM public.tech_error_log(NULL,100,0);
  ASSERT v_n = 2, format('5.1 ★ أخطاء الشركة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ خطأ الشركة الأخرى غائب
  SELECT count(*) INTO v_n FROM public.tech_error_log(NULL,100,0)
   WHERE out_message = 'خطأ شركة أخرى';
  ASSERT v_n = 0, '5.2 ★★ ظهر خطأ شركة أخرى';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_error_log('critical',100,0);
  ASSERT v_n = 1, format('5.3 ترشيح الخطورة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- الحقول التشخيصية تصل الواجهة
  SELECT out_route INTO v_txt FROM public.tech_error_log('critical',1,0);
  ASSERT v_txt = '/app/tech-portal', format('5.4 المسار = %s', COALESCE(v_txt,'NULL'));
  v_pass := v_pass + 1;

  -- ═══ ⑥ ★ ملخّص الأخطاء: كل مستوى يظهر ولو بصفر ═══════════════════════
  SELECT count(*) INTO v_n FROM public.tech_error_summary(24);
  ASSERT v_n = 4,
    format('6.1 ★ مستويات الخطورة = %s (متوقَّع 4) — بطاقة مفقودة تُقرأ «لا مشكلة»', v_n);
  v_pass := v_pass + 1;

  SELECT out_count INTO v_n FROM public.tech_error_summary(24) WHERE out_severity='high';
  ASSERT v_n = 0, format('6.2 مستوى بلا أخطاء أعاد %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  SELECT out_count INTO v_n FROM public.tech_error_summary(24) WHERE out_severity='critical';
  ASSERT v_n = 1, format('6.3 الحرجة = %s', v_n);
  v_pass := v_pass + 1;

  -- الترتيب بالخطورة (الأخطر أولاً)
  SELECT out_severity INTO v_txt FROM public.tech_error_summary(24) LIMIT 1;
  ASSERT v_txt = 'critical', format('6.4 الترتيب خاطئ — الأول %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑦ المهام المجدولة ════════════════════════════════════════════════
  INSERT INTO public.scheduled_job_runs
    (job_name,started_at,status,duration_ms,tenants_processed)
  VALUES ('v30-notify' ,NOW()-INTERVAL '1 hour' ,'success',1200,42),
         ('v30-notify' ,NOW()-INTERVAL '25 hours','failed' , 900,10),
         ('v30-cleanup',NOW()-INTERVAL '2 hours' ,'failed' , 300,42);

  SELECT count(*) INTO v_n FROM public.tech_scheduled_jobs()
   WHERE out_job_name LIKE 'v30-%';
  ASSERT v_n = 2, format('7.1 مهام مُجمَّعة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ الفشل خارج 24 ساعة لا يجعلها غير سليمة
  SELECT out_is_healthy INTO v_bool FROM public.tech_scheduled_jobs()
   WHERE out_job_name='v30-notify';
  ASSERT v_bool, '7.2 ★ فشل قديم (25 ساعة) جعل المهمة غير سليمة';
  v_pass := v_pass + 1;

  -- وفشل حديث يجعلها غير سليمة
  SELECT out_is_healthy INTO v_bool FROM public.tech_scheduled_jobs()
   WHERE out_job_name='v30-cleanup';
  ASSERT NOT v_bool, '7.3 ★ مهمة فشلت قبل ساعتين عُدّت سليمة';
  v_pass := v_pass + 1;

  SELECT out_last_status INTO v_txt FROM public.tech_scheduled_jobs()
   WHERE out_job_name='v30-notify';
  ASSERT v_txt = 'success', format('7.4 آخر حالة = %s', v_txt);
  v_pass := v_pass + 1;

  -- ★★ لا تكشف نشاط بقية العملاء: الدالة لا تُعيد tenants_processed
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='scheduled_job_runs'
     AND column_name='tenants_processed';
  ASSERT v_n = 1, '7.5 العمود اختفى — الاختبار بحاجة تحديث';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routines r
     WHERE r.routine_schema='public' AND r.routine_name='tech_scheduled_jobs'
       AND r.routine_definition ILIKE '%tenants_processed%'
  ), '7.6 ★★ الدالة تكشف tenants_processed — نشاط بقية العملاء';
  v_pass := v_pass + 2;

  -- ★ الموظف العادي لا يرى المهام المجدولة (بيانات منصة)
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.tech_scheduled_jobs();
  ASSERT v_n = 0, format('7.7 ★★ موظف عادي يرى %s مهمة مجدولة', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑧ الصلاحيات ══════════════════════════════════════════════════════
  ASSERT NOT has_table_privilege('anon','public.tech_audit_unified','SELECT'),
    '8.1 anon يقرأ السجلّ الموحّد';
  ASSERT NOT has_function_privilege('anon',
    'public.tech_audit_trail(text,text,integer,integer)','EXECUTE'),
    '8.2 anon يقرأ سجلّ التدقيق';
  ASSERT NOT has_function_privilege('anon',
    'public.tech_error_log(text,integer,integer)','EXECUTE'),
    '8.3 anon يقرأ سجلّ الأخطاء';
  ASSERT NOT has_function_privilege('anon',
    'public.tech_scheduled_jobs()','EXECUTE'),
    '8.4 anon يقرأ المهام المجدولة';
  ASSERT has_function_privilege('authenticated',
    'public.tech_audit_trail(text,text,integer,integer)','EXECUTE'),
    '8.5 المستخدم المُصادَق محجوب عن السجلّ';
  v_pass := v_pass + 5;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.scheduled_job_runs    WHERE job_name LIKE 'v30-%';
  DELETE FROM public.error_logs            WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.audit_logs            WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.inventory_audit_log   WHERE tenant_id = v_t;
  DELETE FROM public.finance_audit_events  WHERE tenant_id = v_t;
  DELETE FROM public.legal_entities        WHERE tenant_id = v_t;
  DELETE FROM public.employees             WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.profiles WHERE id IN (v_u,v_emp);
  DELETE FROM auth.users      WHERE id IN (v_u,v_emp);
  DELETE FROM public.tenants  WHERE id IN (v_t,v_tb);

  RAISE NOTICE '✅ verify-0330: %/38 تأكيداً ناجحاً', v_pass;
END $$;
