-- ============================================================================
-- verify-tech-exports-0332.sql
--
-- بوابة التقنية: الصادرات الموحّدة · المتعثّرة · أحداث الناقلين.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
-- العزل عبر RLS الحقيقي في verify-tech-exports-0332-rls.sh.
--
-- ملاحظات أعمدة مُحقَّقة (information_schema/pg_constraint):
--   finance_report_exports: report_run_id NOT NULL FK→finance_report_runs
--     legal_entity_id NOT NULL FK · error_message · completed_at
--     status ∈ requested·processing·ready·failed·cancelled
--   inventory_report_exports: report_run_id FK→**inventory_periodic_report_runs**
--     (جدول `inventory_report_runs` غير موجود) · بلا error_message
--     status ∈ requested·generating·ready·failed·expired
--     export_type ∈ excel·pdf·csv·json
--   mrp_bom_export_requests: request_number NOT NULL · UNIQUE(tenant,request_number)
--     export_type ∈ excel·csv·json · بلا completed_at
--   mrp_manufacturing_export_requests: export_number NOT NULL
--     status ∈ queued·processing·ready·failed·cancelled
--     export_format ∈ xlsx·csv·pdf·json · بلا completed_at
--   inventory_carrier_webhook_events: received_at · processed BOOLEAN
--     carrier_id FK→inventory_carriers ON DELETE SET NULL
--   inventory_carriers NOT NULL: carrier_code·name_ar·provider
--   finance_report_runs NOT NULL: legal_entity_id·report_type·report_name
--     report_type ∈ trial_balance·profit_loss·balance_sheet·… (11 قيمة)
--   inventory_periodic_report_runs NOT NULL: report_number·report_type·
--     period_start·period_end·delivery_status
--     report_type ∈ daily_operations·weekly_performance·monthly_warehouse_review
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();   -- المستأجر أ
  v_tb    UUID := gen_random_uuid();   -- المستأجر ب (لإثبات عدم التسريب)
  v_it    UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_itb   UUID := gen_random_uuid();
  v_le    UUID := gen_random_uuid();
  v_leb   UUID := gen_random_uuid();
  v_car1  UUID := gen_random_uuid();
  v_car2  UUID := gen_random_uuid();
  v_frr   UUID := gen_random_uuid();
  v_irr   UUID := gen_random_uuid();
  v_frrb  UUID := gen_random_uuid();
  v_fx1   UUID := gen_random_uuid();
  v_fx2   UUID := gen_random_uuid();
  v_stuck UUID := gen_random_uuid();
  v_n     INT;
  v_txt   TEXT;
  v_num   NUMERIC;
  v_bool  BOOLEAN;
  v_pass  INT := 0;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'EA','صادرات أ','ex32a-'||substr(v_t::text ,1,8)),
    (v_tb,'EB','صادرات ب','ex32b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_it ,'it-' ||substr(v_it::text ,1,8)||'@e32.io'),
    (v_emp,'em-' ||substr(v_emp::text,1,8)||'@e32.io'),
    (v_itb,'itb-'||substr(v_itb::text,1,8)||'@e32.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_it ,v_t ,'تقني الشركة','it_admin'),
    (v_emp,v_t ,'موظف عادي','employee'),
    (v_itb,v_tb,'تقني الشركة ب','it_admin');
  INSERT INTO public.legal_entities(id,tenant_id,code,name_ar) VALUES
    (v_le ,v_t ,'LE32A','كيان أ'),
    (v_leb,v_tb,'LE32B','كيان ب');
  INSERT INTO public.inventory_carriers(id,tenant_id,carrier_code,name_ar,provider,is_active) VALUES
    (v_car1,v_t,'CAR-A','ناقل نشط','aramex',TRUE),
    (v_car2,v_t,'CAR-B','ناقل متعثّر','dhl',TRUE);

  INSERT INTO public.finance_report_runs(id,tenant_id,legal_entity_id,report_type,report_name) VALUES
    (v_frr ,v_t ,v_le ,'trial_balance','ميزان المراجعة'),
    (v_frrb,v_tb,v_leb,'balance_sheet','ميزانية ب');
  INSERT INTO public.inventory_periodic_report_runs
    (id,tenant_id,report_number,report_type,period_start,period_end,delivery_status)
    VALUES (v_irr,v_t,'IPR-32-1','daily_operations',current_date-1,current_date,'generated');

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('tech_export_log','tech_export_summary','tech_export_failures',
      'tech_carrier_webhooks','tech_webhook_summary');
  ASSERT v_n = 5, format('1.1 دوال 0332 = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  -- ★ كلها INVOKER: تحترم RLS كل جدول ولا تتجاوزه
  FOR v_txt IN SELECT unnest(ARRAY['tech_export_log','tech_export_summary',
                                   'tech_export_failures','tech_carrier_webhooks',
                                   'tech_webhook_summary'])
  LOOP
    ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.2 ★ %s صارت SECURITY DEFINER — تتجاوز RLS', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ التوقيع الجديد أربعة معاملات: القديم (INTEGER,INTEGER) يجب أن يختفي
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='tech_export_log'
       AND pg_get_function_identity_arguments(p.oid) = 'p_limit integer, p_offset integer'),
    '1.3 ★ التوقيع القديم tech_export_log(int,int) ما زال موجوداً — حمولة زائدة غامضة';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('tech_export_log','tech_export_summary',
                            'tech_export_failures','tech_carrier_webhooks',
                            'tech_webhook_summary')),
    '1.4 ★ anon يملك EXECUTE على إحدى دوال 0332';
  v_pass := v_pass + 1;

  -- ★ الفهارس السبعة
  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('idx_fin_report_exports_tenant_req','idx_inv_report_exports_tenant_req',
     'idx_mrp_bom_exports_tenant_req','idx_mrp_mfg_exports_tenant_req',
     'idx_export_logs_tenant_created','idx_carrier_webhooks_tenant_pending',
     'idx_carrier_webhooks_tenant_received');
  ASSERT v_n = 7, format('1.5 فهارس 0332 = %s (متوقَّع 7)', v_n);
  v_pass := v_pass + 1;

  -- الفهرس الجزئي جزئيّ فعلاً لا كامل
  ASSERT (SELECT indexdef LIKE '%WHERE%processed%' FROM pg_indexes
           WHERE indexname='idx_carrier_webhooks_tenant_pending'),
    '1.6 ★ idx_carrier_webhooks_tenant_pending ليس فهرساً جزئياً';
  v_pass := v_pass + 1;

  -- ═══ ② الحالة قبل أي بيانات: صفر لا خطأ ═══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_it::text, TRUE);

  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,500,0);
  ASSERT v_n = 0, format('2.1 قاعدة فارغة تعيد %s صفاً', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_export_failures(6);
  ASSERT v_n = 0, format('2.2 لا صادرات ⇒ لا متعثّرات، لكن أعادت %s', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_carrier_webhooks(NULL,500,0);
  ASSERT v_n = 0, format('2.3 لا أحداث ناقلين، لكن أعادت %s', v_n);
  v_pass := v_pass + 1;

  -- ═══ ③ الصادرات: خمسة مصادر ═══════════════════════════════════════════
  INSERT INTO public.finance_report_exports
    (id,tenant_id,legal_entity_id,report_run_id,export_format,status,requested_by,requested_at,completed_at,error_message)
  VALUES
    (v_fx1,v_t,v_le,v_frr,'xlsx','ready' ,v_it,NOW()-INTERVAL '3 hours',NOW()-INTERVAL '2 hours',NULL),
    (v_fx2,v_t,v_le,v_frr,'pdf' ,'failed',v_it,NOW()-INTERVAL '1 hour' ,NULL,'تعذّر توليد PDF: الخط مفقود');

  INSERT INTO public.inventory_report_exports
    (tenant_id,report_run_id,export_type,status,requested_by,requested_at)
  VALUES (v_t,v_irr,'excel','ready',v_it,NOW()-INTERVAL '5 hours');

  INSERT INTO public.mrp_bom_export_requests
    (tenant_id,request_number,export_type,status,requested_by,requested_at)
  VALUES (v_t,'BOM-32-1','csv','ready',v_it,NOW()-INTERVAL '10 hours');

  -- ★ عالق: queued منذ 30 ساعة — يبدو «في الطابور» إلى الأبد
  INSERT INTO public.mrp_manufacturing_export_requests
    (id,tenant_id,export_number,export_format,status,requested_by,requested_at)
  VALUES (v_stuck,v_t,'MFG-32-1','xlsx','queued',v_it,NOW()-INTERVAL '30 hours');

  INSERT INTO public.export_logs(tenant_id,user_id,export_type,record_count,created_at)
  VALUES (v_t,v_emp,'employees_csv',412,NOW()-INTERVAL '20 hours');

  -- تلوّث المستأجر ب — يجب ألّا يظهر أبداً
  INSERT INTO public.finance_report_exports
    (tenant_id,legal_entity_id,report_run_id,export_format,status,requested_by)
  VALUES (v_tb,v_leb,v_frrb,'xlsx','ready',v_itb);
  INSERT INTO public.export_logs(tenant_id,user_id,export_type,record_count)
  VALUES (v_tb,v_itb,'secret_b',9999);

  -- ★★ العطل ①: كان 0 والآن 5
  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,500,0);
  ASSERT v_n = 6, format('3.1 ★ سجلّ الصادرات = %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;

  -- ★ عدم التسريب: لا صف من المستأجر ب
  ASSERT NOT EXISTS (SELECT 1 FROM public.tech_export_log(NULL,NULL,500,0)
                      WHERE out_reference = 'secret_b' OR out_reference = 'ميزانية ب'),
    '3.2 ★★ تسريب: صادرة من مستأجر آخر ظهرت في سجلّ التقني';
  v_pass := v_pass + 1;

  -- ★ كل المصادر الخمسة ممثَّلة
  SELECT count(DISTINCT out_source) INTO v_n FROM public.tech_export_log(NULL,NULL,500,0);
  ASSERT v_n = 5, format('3.3 مصادر متمايزة = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  FOR v_txt IN SELECT unnest(ARRAY['finance','inventory','mrp_bom','mrp_mfg','legacy'])
  LOOP
    ASSERT EXISTS (SELECT 1 FROM public.tech_export_log(NULL,NULL,500,0)
                    WHERE out_source = v_txt),
      format('3.4 المصدر %s غائب عن السجلّ الموحّد', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ المرجع يُحلّ من جدول التشغيل لا يُعرض UUID خام
  SELECT out_reference INTO v_txt FROM public.tech_export_log(NULL,NULL,500,0)
   WHERE out_id = v_fx1;
  ASSERT v_txt = 'ميزان المراجعة',
    format('3.5 مرجع الصادرة المالية = %L (متوقَّع اسم التقرير)', v_txt);
  v_pass := v_pass + 1;

  -- ★ error_message يُقرأ — كان يُكتب ولا يُقرأ
  SELECT out_error INTO v_txt FROM public.tech_export_log(NULL,NULL,500,0)
   WHERE out_id = v_fx2;
  ASSERT v_txt = 'تعذّر توليد PDF: الخط مفقود',
    format('3.6 ★ سبب الفشل لا يصل الواجهة: %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ الحالة مُعرَّبة
  SELECT out_status_ar INTO v_txt FROM public.tech_export_log(NULL,NULL,500,0)
   WHERE out_id = v_fx2;
  ASSERT v_txt = 'فشل', format('3.7 تعريب الحالة failed = %L', v_txt);
  v_pass := v_pass + 1;

  SELECT out_status_ar INTO v_txt FROM public.tech_export_log(NULL,NULL,500,0)
   WHERE out_id = v_stuck;
  ASSERT v_txt = 'في الطابور', format('3.8 تعريب الحالة queued = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ اسم الطالب يُحلّ من profiles
  SELECT out_user_name INTO v_txt FROM public.tech_export_log(NULL,NULL,500,0)
   WHERE out_source = 'legacy';
  ASSERT v_txt = 'موظف عادي', format('3.9 اسم الطالب = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ record_count يُنقل من المصدر القديم وحده
  SELECT out_records INTO v_n FROM public.tech_export_log(NULL,NULL,500,0)
   WHERE out_source = 'legacy';
  ASSERT v_n = 412, format('3.10 عدد السجلّات = %s (متوقَّع 412)', v_n);
  v_pass := v_pass + 1;

  -- ★ الترتيب تنازلي بالزمن
  ASSERT (SELECT out_source FROM public.tech_export_log(NULL,NULL,500,0) LIMIT 1) = 'finance',
    '3.11 الترتيب ليس تنازلياً بالزمن (الأحدث صادرة PDF المالية)';
  v_pass := v_pass + 1;

  -- ═══ ④ الترشيح ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.tech_export_log('finance',NULL,500,0);
  ASSERT v_n = 2, format('4.1 ترشيح المصدر finance = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,'ready',500,0);
  ASSERT v_n = 4, format('4.2 ترشيح الحالة ready = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_export_log('finance','failed',500,0);
  ASSERT v_n = 1, format('4.3 ترشيح مزدوج = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ الترشيحان يعملان معاً لا أحدهما: تركيبة موجودة في كلٍّ منفرداً وغائبة معاً
  SELECT count(*) INTO v_n FROM public.tech_export_log('inventory','failed',500,0);
  ASSERT v_n = 0,
    format('4.4 ★ تركيبة inventory+failed غير موجودة لكن أعادت %s ⇒ أحد الترشيحين مُهمَل', v_n);
  v_pass := v_pass + 1;

  -- ★ مصدر مجهول لا يُسقط الدالة
  SELECT count(*) INTO v_n FROM public.tech_export_log('لا-وجود-له',NULL,500,0);
  ASSERT v_n = 0, format('4.5 مصدر مجهول أعاد %s', v_n);
  v_pass := v_pass + 1;

  -- ★ الترقيم
  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,2,0);
  ASSERT v_n = 2, format('4.6 حدّ 2 أعاد %s', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,2,4);
  ASSERT v_n = 2, format('4.7 إزاحة 4 بحدّ 2 أعادت %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ الحدّ مقيَّد بسقف 500 لا يُصدَّق حرفياً
  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,999999,0);
  ASSERT v_n = 6, format('4.8 حدّ ضخم أعاد %s', v_n);
  v_pass := v_pass + 1;

  -- ★ حدّ سالب لا يُسقط الدالة (GREATEST 1)
  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,-5,-5);
  ASSERT v_n = 1, format('4.9 حدّ سالب أعاد %s (متوقَّع 1 بفعل GREATEST)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ الملخّص — العطل ② ══════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.tech_export_summary(30);
  ASSERT v_n = 5, format('5.1 ★ ملخّص المصادر = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  SELECT out_total INTO v_n FROM public.tech_export_summary(30) WHERE out_source='finance';
  ASSERT v_n = 2, format('5.2 إجمالي finance = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_failed INTO v_n FROM public.tech_export_summary(30) WHERE out_source='finance';
  ASSERT v_n = 1, format('5.3 فاشلات finance = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  SELECT out_ready INTO v_n FROM public.tech_export_summary(30) WHERE out_source='finance';
  ASSERT v_n = 1, format('5.4 جاهزات finance = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ queued يُحسب معلّقاً لا جاهزاً ولا فاشلاً
  SELECT out_pending INTO v_n FROM public.tech_export_summary(30) WHERE out_source='mrp_mfg';
  ASSERT v_n = 1, format('5.5 ★ معلّقات mrp_mfg = %s (متوقَّع 1؛ queued ليس ready)', v_n);
  v_pass := v_pass + 1;

  SELECT out_ready INTO v_n FROM public.tech_export_summary(30) WHERE out_source='mrp_mfg';
  ASSERT v_n = 0, format('5.6 ★ jahiz mrp_mfg = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  -- ★ الفشل أولاً في الترتيب — finance وحده يحمل فاشلاً
  ASSERT (SELECT out_source FROM public.tech_export_summary(30) LIMIT 1) = 'finance',
    '5.7 ★ الترتيب لا يضع المصدر ذا الفشل أولاً';
  v_pass := v_pass + 1;

  -- ★ النافذة الزمنية تعمل: نافذة يوم واحد تُقصي صادرة عمرها 30 ساعة
  SELECT count(*) INTO v_n FROM public.tech_export_summary(1) WHERE out_source='mrp_mfg';
  ASSERT v_n = 0,
    '5.8 ★ نافذة يوم واحد لم تُقصِ الصادرة العالقة منذ 30 ساعة ⇒ النافذة صورية';
  v_pass := v_pass + 1;

  -- الاسم العربي حاضر
  SELECT out_source_ar INTO v_txt FROM public.tech_export_summary(30) WHERE out_source='mrp_bom';
  ASSERT v_txt = 'شجرة المواد', format('5.9 الاسم العربي = %L', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑥ المتعثّرات — العطل ③ ═══════════════════════════════════════════
  -- بعتبة 6 ساعات: الفاشلة + العالقة منذ 30 ساعة = 2
  SELECT count(*) INTO v_n FROM public.tech_export_failures(6);
  ASSERT v_n = 2, format('6.1 ★ متعثّرات = %s (متوقَّع 2: فاشلة + عالقة)', v_n);
  v_pass := v_pass + 1;

  SELECT out_kind INTO v_txt FROM public.tech_export_failures(6) WHERE out_id=v_fx2;
  ASSERT v_txt = 'failed', format('6.2 تصنيف الفاشلة = %L', v_txt);
  v_pass := v_pass + 1;

  SELECT out_kind INTO v_txt FROM public.tech_export_failures(6) WHERE out_id=v_stuck;
  ASSERT v_txt = 'stuck', format('6.3 ★ تصنيف العالقة = %L (متوقَّع stuck)', v_txt);
  v_pass := v_pass + 1;

  SELECT out_kind_ar INTO v_txt FROM public.tech_export_failures(6) WHERE out_id=v_stuck;
  ASSERT v_txt = 'عالق', format('6.4 تعريب التصنيف = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ العمر محسوب لا صفر
  SELECT out_age_hours INTO v_num FROM public.tech_export_failures(6) WHERE out_id=v_stuck;
  ASSERT v_num BETWEEN 29.5 AND 30.5,
    format('6.5 ★ عمر العالقة = %s ساعة (متوقَّع ≈30)', v_num);
  v_pass := v_pass + 1;

  -- ★★ العتبة فعّالة: 48 ساعة تُقصي العالقة وتُبقي الفاشلة
  SELECT count(*) INTO v_n FROM public.tech_export_failures(48);
  ASSERT v_n = 1,
    format('6.6 ★★ عتبة 48 ساعة أعادت %s (متوقَّع 1) ⇒ العتبة صورية', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT out_id FROM public.tech_export_failures(48)) = v_fx2,
    '6.7 عتبة 48 أبقت الصف الخطأ';
  v_pass := v_pass + 1;

  -- ★ عتبة ساعة واحدة تلتقط الجاهزة؟ لا — الجاهزة ليست حالة انتقالية
  SELECT count(*) INTO v_n FROM public.tech_export_failures(1);
  ASSERT v_n = 2,
    format('6.8 ★ عتبة ساعة أعادت %s — الحالة ready يجب ألّا تُعدّ عالقة أبداً', v_n);
  v_pass := v_pass + 1;

  -- ★ سبب الفشل يصل
  SELECT out_error INTO v_txt FROM public.tech_export_failures(6) WHERE out_id=v_fx2;
  ASSERT v_txt = 'تعذّر توليد PDF: الخط مفقود',
    format('6.9 سبب الفشل في سطح المتعثّرات = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ الترتيب تصاعدي: الأقدم أولاً (الأطول تعثّراً)
  ASSERT (SELECT out_id FROM public.tech_export_failures(6) LIMIT 1) = v_stuck,
    '6.10 ★ المتعثّرات لا تبدأ بالأقدم';
  v_pass := v_pass + 1;

  -- ═══ ⑦ أحداث الناقلين — العطل ④ ═══════════════════════════════════════
  INSERT INTO public.inventory_carrier_webhook_events
    (tenant_id,carrier_id,tracking_number,event_status,processed,received_at,payload)
  VALUES
    (v_t ,v_car1,'TRK-A1','delivered' ,TRUE ,NOW()-INTERVAL '2 hours' ,'{"a":1,"b":2}'::jsonb),
    (v_t ,v_car2,'TRK-B1','in_transit',FALSE,NOW()-INTERVAL '30 hours','{"x":1}'::jsonb),
    (v_t ,v_car2,'TRK-B2',NULL        ,FALSE,NOW()-INTERVAL '10 minutes','{}'::jsonb),
    (v_tb,NULL  ,'TRK-SECRET','ب'     ,FALSE,NOW(),'{}'::jsonb);

  SELECT count(*) INTO v_n FROM public.tech_carrier_webhooks(NULL,500,0);
  ASSERT v_n = 3, format('7.1 ★ أحداث الناقلين = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (SELECT 1 FROM public.tech_carrier_webhooks(NULL,500,0)
                      WHERE out_tracking='TRK-SECRET'),
    '7.2 ★★ تسريب: حدث ناقل من مستأجر آخر ظهر';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_carrier_webhooks(FALSE,500,0);
  ASSERT v_n = 2, format('7.3 غير المعالَجة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_carrier_webhooks(TRUE,500,0);
  ASSERT v_n = 1, format('7.4 المعالَجة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ غير المعالَج أولاً في الترتيب
  ASSERT (SELECT out_processed FROM public.tech_carrier_webhooks(NULL,500,0) LIMIT 1) = FALSE,
    '7.5 ★ الترتيب لا يضع غير المعالَج أولاً';
  v_pass := v_pass + 1;

  -- ★ اسم الناقل يُحلّ
  SELECT out_carrier INTO v_txt FROM public.tech_carrier_webhooks(NULL,500,0)
   WHERE out_tracking='TRK-A1';
  ASSERT v_txt = 'ناقل نشط', format('7.6 اسم الناقل = %L', v_txt);
  v_pass := v_pass + 1;

  SELECT out_provider INTO v_txt FROM public.tech_carrier_webhooks(NULL,500,0)
   WHERE out_tracking='TRK-B1';
  ASSERT v_txt = 'dhl', format('7.7 مزوّد الناقل = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ event_status الفارغ لا يكسر العرض
  SELECT out_event INTO v_txt FROM public.tech_carrier_webhooks(NULL,500,0)
   WHERE out_tracking='TRK-B2';
  ASSERT v_txt = '—', format('7.8 حدث بلا حالة عُرض %L بدل شرطة', v_txt);
  v_pass := v_pass + 1;

  -- ★ عمر التعليق محسوب
  SELECT out_age_hours INTO v_num FROM public.tech_carrier_webhooks(NULL,500,0)
   WHERE out_tracking='TRK-B1';
  ASSERT v_num BETWEEN 29.5 AND 30.5,
    format('7.9 ★ عمر الحدث العالق = %s (متوقَّع ≈30)', v_num);
  v_pass := v_pass + 1;

  -- ★ عدّ مفاتيح الحمولة — يميّز الحمولة الفارغة من المملوءة
  SELECT out_payload_keys INTO v_n FROM public.tech_carrier_webhooks(NULL,500,0)
   WHERE out_tracking='TRK-A1';
  ASSERT v_n = 2, format('7.10 مفاتيح الحمولة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_payload_keys INTO v_n FROM public.tech_carrier_webhooks(NULL,500,0)
   WHERE out_tracking='TRK-B2';
  ASSERT v_n = 0, format('7.11 ★ حمولة فارغة = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  -- ★★ الناقل المحذوف: FK له ON DELETE SET NULL ⇒ الحدث يبقى واسمه بديل
  DELETE FROM public.inventory_carriers WHERE id = v_car1;
  SELECT count(*) INTO v_n FROM public.tech_carrier_webhooks(NULL,500,0);
  ASSERT v_n = 3,
    format('7.12 ★★ حذف الناقل أضاع أحداثه: %s (متوقَّع 3 — JOIN داخلي؟)', v_n);
  v_pass := v_pass + 1;

  SELECT out_carrier INTO v_txt FROM public.tech_carrier_webhooks(NULL,500,0)
   WHERE out_tracking='TRK-A1';
  ASSERT v_txt = '— ناقل محذوف —',
    format('7.13 ★ حدث ناقل محذوف عُرض %L', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑧ ملخّص الناقلين ═════════════════════════════════════════════════
  -- بعد الحذف: صف للناقل ب + صف للـ NULL (الناقل المحذوف)
  SELECT count(*) INTO v_n FROM public.tech_webhook_summary(7);
  ASSERT v_n = 2, format('8.1 صفوف ملخّص الناقلين = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_pending INTO v_n FROM public.tech_webhook_summary(7)
   WHERE out_carrier_id = v_car2;
  ASSERT v_n = 2, format('8.2 معلّقات الناقل ب = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_processed INTO v_n FROM public.tech_webhook_summary(7)
   WHERE out_carrier_id = v_car2;
  ASSERT v_n = 0, format('8.3 معالَجات الناقل ب = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  -- ★ عمر أقدم عالق للناقل ب ≈ 30 ساعة (لا عمر الأحدث)
  SELECT out_oldest_hours INTO v_num FROM public.tech_webhook_summary(7)
   WHERE out_carrier_id = v_car2;
  ASSERT v_num BETWEEN 29.5 AND 30.5,
    format('8.4 ★ أقدم عالق = %s ساعة (متوقَّع ≈30 لا ≈0.17 للأحدث)', v_num);
  v_pass := v_pass + 1;

  -- ★ الناقل المحذوف: كل أحداثه معالَجة ⇒ oldest = 0 لا NULL
  SELECT out_oldest_hours INTO v_num FROM public.tech_webhook_summary(7)
   WHERE out_carrier_id IS NULL;
  ASSERT v_num = 0,
    format('8.5 ★ ناقل بلا عالق أعاد %s (متوقَّع 0 لا NULL)', v_num);
  v_pass := v_pass + 1;

  -- ★ العالق أولاً
  ASSERT (SELECT out_carrier_id FROM public.tech_webhook_summary(7) LIMIT 1) = v_car2,
    '8.6 ★ الملخّص لا يضع الناقل الأكثر تعليقاً أولاً';
  v_pass := v_pass + 1;

  -- ★★ عدم التسريب في الملخّص — لا يكفي عدّ الصفوف
  --
  --   تصحيح ذاتي: التأكيد 8.1 (عدّ الصفوف = 2) **لا يكشف** إلغاء فلتر
  --   المستأجر، لأن حدث المستأجر ب يحمل carrier_id=NULL تماماً كالناقل
  --   المحذوف، فيندمجان في مجموعة GROUP BY واحدة ويبقى العدد 2.
  --   أُثبت ذلك بعكس الشرط إلى (tenant_id = v_tenant OR TRUE): نجح
  --   الاختبار كاملاً رغم التسريب. المجموع هو ما يكشفه.
  SELECT sum(out_total)::INT INTO v_n FROM public.tech_webhook_summary(7);
  ASSERT v_n = 3,
    format('8.7 ★★ مجموع أحداث الملخّص = %s (متوقَّع 3) ⇒ تسريب من مستأجر آخر', v_n);
  v_pass := v_pass + 1;

  -- ★★ والمثل في ملخّص الصادرات
  SELECT sum(out_total)::INT INTO v_n FROM public.tech_export_summary(30);
  ASSERT v_n = 6,
    format('8.8 ★★ مجموع صادرات الملخّص = %s (متوقَّع 6) ⇒ تسريب', v_n);
  v_pass := v_pass + 1;

  -- ★★ النافذة الزمنية فعّالة: يوم واحد يُقصي الحدث العالق منذ 30 ساعة
  SELECT out_total INTO v_n FROM public.tech_webhook_summary(1)
   WHERE out_carrier_id = v_car2;
  ASSERT v_n = 1,
    format('8.9 ★★ نافذة يوم أعادت %s للناقل ب (متوقَّع 1) ⇒ النافذة صورية', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑨ المستأجر المعدوم ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);

  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,500,0);
  ASSERT v_n = 0, format('9.1 ★ مستخدم بلا ملف رأى %s صادرة', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_export_failures(6);
  ASSERT v_n = 0, format('9.2 ★ مستخدم بلا ملف رأى %s متعثّرة', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_carrier_webhooks(NULL,500,0);
  ASSERT v_n = 0, format('9.3 ★ مستخدم بلا ملف رأى %s حدث ناقل', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_webhook_summary(7);
  ASSERT v_n = 0, format('9.4 ★ مستخدم بلا ملف رأى %s صف ملخّص', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_export_summary(30);
  ASSERT v_n = 0, format('9.5 ★ مستخدم بلا ملف رأى %s صف ملخّص صادرات', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑩ تقني المستأجر ب يرى بياناته وحدها ══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_itb::text, TRUE);

  SELECT count(*) INTO v_n FROM public.tech_export_log(NULL,NULL,500,0);
  ASSERT v_n = 2, format('10.1 تقني ب يرى %s صادرة (متوقَّع 2: خاصته)', v_n);
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (SELECT 1 FROM public.tech_export_log(NULL,NULL,500,0)
                      WHERE out_reference = 'ميزان المراجعة'),
    '10.2 ★★ تسريب معاكس: تقني ب رأى صادرة المستأجر أ';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.tech_carrier_webhooks(NULL,500,0);
  ASSERT v_n = 1, format('10.3 تقني ب يرى %s حدث ناقل (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  verify-tech-exports-0332: % تأكيداً — نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0332';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_VERIFY_0332' THEN
    RAISE NOTICE 'تراجع نظيف — لا أثر في القاعدة.';
  ELSE
    RAISE;
  END IF;
END $$;
