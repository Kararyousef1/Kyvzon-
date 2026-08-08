-- ============================================================================
-- verify-tech-integrations-0331.sql
--
-- بوابة التقنية: صحّة التكاملات · سجلّ الصادرات · تنبيه الأخطاء الحرجة.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**.
-- العزل عبر RLS الحقيقي في verify-tech-integrations-0331-rls.sh.
--
-- ملاحظات أعمدة مُحقَّقة:
--   finance_integration_connectors: tenant_id · legal_entity_id ·
--     connector_code · connector_name · source_system  كلها NOT NULL
--     status ∈ active·paused·archived
--   finance_integration_events.status ∈ received·reviewed·converted·
--     rejected·ignored·failed
--   export_logs: export_type · record_count · user_id · created_at فقط
--   finance_integration_events NOT NULL: tenant_id · legal_entity_id ·
--     source_system · source_type · event_type
--   source_system ∈ procurement·inventory·mrp·crm·hr·external·manual
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_it    UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_le    UUID := gen_random_uuid();
  v_c1    UUID := gen_random_uuid();
  v_c2    UUID := gen_random_uuid();
  v_err   UUID := gen_random_uuid();
  v_low   UUID := gen_random_uuid();
  v_n     INT;
  v_txt   TEXT;
  v_bool  BOOLEAN;
  v_pass  INT := 0;
BEGIN
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'IA','تكامل أ','in31a-'||substr(v_t::text ,1,8)),
    (v_tb,'IB','تكامل ب','in31b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_it ,'it-'||substr(v_it::text ,1,8)||'@i31.io'),
    (v_emp,'em-'||substr(v_emp::text,1,8)||'@i31.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_it ,v_t,'تقني الشركة','it_admin'),
    (v_emp,v_t,'موظف عادي','employee');
  INSERT INTO public.legal_entities(id,tenant_id,code,name_ar)
    VALUES (v_le,v_t,'LE31','كيان التكامل');

  -- ═══ ① البنية ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('tech_integrations_health','tech_integration_events',
      'tech_export_log','tech_export_summary','notify_critical_error');
  ASSERT v_n = 5, format('1.1 دوال 0331 = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  -- ★ دوال القراءة INVOKER: الجداول المالية محميّة بـ
  --   current_user_can_access_legal_entity — نحترمها لا نتجاوزها
  FOR v_txt IN SELECT unnest(ARRAY['tech_integrations_health',
                                   'tech_integration_events',
                                   'tech_export_log','tech_export_summary'])
  LOOP
    ASSERT (SELECT NOT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.2 ★ %s صارت SECURITY DEFINER — تتجاوز RLS', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ الإشعار يكتب ⇒ VOLATILE (درس 0320)
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='notify_critical_error') = 'v',
    '1.3 ★ notify_critical_error ليست VOLATILE';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgname='trg_notify_critical_error' AND NOT tgisinternal),
    '1.4 محفّز الأخطاء الحرجة مفقود';
  v_pass := v_pass + 1;

  -- ═══ ② صحّة التكاملات ═════════════════════════════════════════════════
  INSERT INTO public.finance_integration_connectors
    (id,tenant_id,legal_entity_id,connector_code,connector_name,source_system,direction,status)
  -- ملاحظة قيد: source_system ∈ procurement·inventory·mrp·crm·hr·external·manual
  VALUES
    (v_c1,v_t,v_le,'BANK-1','موصّل البنك','external','inbound','active'),
    (v_c2,v_t,v_le,'ERP-1','موصّل موقوف','external','outbound','paused');

  INSERT INTO public.finance_integration_events
    (tenant_id,legal_entity_id,connector_id,source_system,source_type,event_type,status,amount,created_at)
  VALUES
    (v_t,v_le,v_c1,'external','invoice','payment','converted',500,NOW()-INTERVAL '1 hour'),
    (v_t,v_le,v_c1,'external','invoice','payment','received' ,300,NOW()-INTERVAL '2 hours');
  INSERT INTO public.finance_integration_events
    (tenant_id,legal_entity_id,connector_id,source_system,source_type,event_type,status,error_message,created_at)
  VALUES
    (v_t,v_le,v_c1,'external','invoice','payment','failed','رفض البنك الطلب',NOW()-INTERVAL '3 hours');

  -- ★ تصحيح تأكيد ميت: الموصّل الموقوف بلا أحداث كان f24=0 فيُعدّ
  --   سليماً في الحالتين — فلا يقيس التأكيد شيئاً. نمنحه فشلاً حقيقياً
  --   ليصير الفرق بين «يُستثنى لأنه موقوف» و«يُعدّ معطوباً» قابلاً للقياس.
  INSERT INTO public.finance_integration_events
    (tenant_id,legal_entity_id,connector_id,source_system,source_type,event_type,status,error_message,created_at)
  VALUES
    (v_t,v_le,v_c2,'external','invoice','sync','failed','الموصّل موقوف',NOW()-INTERVAL '1 hour');

  PERFORM set_config('request.jwt.claim.sub', v_it::TEXT, TRUE);

  SELECT count(*) INTO v_n FROM public.tech_integrations_health();
  ASSERT v_n = 2, format('2.1 موصّلات = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_events_24h INTO v_n FROM public.tech_integrations_health()
   WHERE out_connector_id = v_c1;
  ASSERT v_n = 3, format('2.2 أحداث 24 ساعة = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT out_failed_24h INTO v_n FROM public.tech_integrations_health()
   WHERE out_connector_id = v_c1;
  ASSERT v_n = 1, format('2.3 ★ الفاشلة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  SELECT out_pending_review INTO v_n FROM public.tech_integrations_health()
   WHERE out_connector_id = v_c1;
  ASSERT v_n = 1, format('2.4 المعلَّقة للمراجعة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ موصّل نشط بفشل ⇒ غير سليم
  SELECT out_is_healthy INTO v_bool FROM public.tech_integrations_health()
   WHERE out_connector_id = v_c1;
  ASSERT NOT v_bool, '2.5 ★ موصّل نشط فيه فشل عُدّ سليماً';
  v_pass := v_pass + 1;

  -- ★ الموصّل الموقوف لا يُعدّ معطوباً (وإلا صار تنبيهاً دائماً)
  SELECT out_is_healthy INTO v_bool FROM public.tech_integrations_health()
   WHERE out_connector_id = v_c2;
  ASSERT v_bool,
    '2.6 ★ موصّل موقوف **وفيه فشل** عُدّ معطوباً — تنبيه دائم يُدرَّب على تجاهله';

  -- وللتأكّد أن الفشل مُسجَّل فعلاً (وإلا عاد التأكيد ميتاً)
  SELECT out_failed_24h INTO v_n FROM public.tech_integrations_health()
   WHERE out_connector_id = v_c2;
  ASSERT v_n = 1,
    format('2.6b التأكيد أعلاه ميت — الموصّل الموقوف بلا فشل (%s)', v_n);
  v_pass := v_pass + 2;

  -- ═══ ③ أحداث التكامل والترشيح ════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.tech_integration_events(NULL,100,0);
  ASSERT v_n = 4, format('3.1 كل الأحداث = %s (متوقَّع 4)', v_n);
  SELECT count(*) INTO v_n FROM public.tech_integration_events('failed',100,0);
  ASSERT v_n = 2, format('3.2 الفاشلة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 2;

  -- ★ رسالة الخطأ تصل الواجهة (كانت تُكتب ولا تُقرأ)
  -- نستهدف الحدث بعينه: الترتيب زمني والحدثان فاشلان
  SELECT out_error INTO v_txt FROM public.tech_integration_events('failed',10,0)
   WHERE out_connector = 'موصّل البنك';
  ASSERT v_txt = 'رفض البنك الطلب',
    format('3.3 ★ رسالة الخطأ = %s', COALESCE(v_txt,'NULL'));
  v_pass := v_pass + 1;

  -- اسم الموصّل يُحلّ لا معرّفه الخام
  SELECT count(DISTINCT out_connector) INTO v_n
    FROM public.tech_integration_events(NULL,10,0);
  ASSERT v_n = 2, format('3.4 أسماء الموصّلات المحلولة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- الحدّ مقصوص (لا استعلام مفتوح)
  SELECT count(*) INTO v_n FROM public.tech_integration_events(NULL,100000,0);
  ASSERT v_n <= 500, format('3.5 ★ الحدّ الأقصى تُجووز (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ④ سجلّ الصادرات — نُقل إلى 0332 ═══════════════════════════════
  --
  --   ★ تصحيح علني: تأكيدات هذا القسم (4.1–4.7) كانت تقيس
  --     `tech_export_log(INTEGER,INTEGER)` وهي دالة قرأت `export_logs`
  --     وحده. أُثبت تشغيلياً في 0332 أنها تعيد **0 صفاً** بينما خمس
  --     صادرات حقيقية موجودة في الجداول الأربعة الفعلية. أي أن هذه
  --     التأكيدات كانت تُثبت صحّة سلوك ناقص.
  --
  --   الدالة أُعيد بناؤها بتوقيع (TEXT,TEXT,INTEGER,INTEGER) والتوقيع
  --   القديم أُسقط عمداً. التأكيدات البديلة — 78 منها — في:
  --       tools/dev/verify-tech-exports-0332.sql
  --
  --   ما يبقى هنا: التحقق من أن التوقيع القديم اختفى فعلاً، وإلا بقيت
  --   حمولة زائدة غامضة تُستدعى خطأً.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'tech_export_log'
       AND pg_get_function_identity_arguments(p.oid) = 'p_limit integer, p_offset integer'),
    '4.1 ★ التوقيع القديم tech_export_log(int,int) ما زال موجوداً';
  v_pass := v_pass + 1;

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'tech_export_log'
       AND pg_get_function_identity_arguments(p.oid) =
         'p_source text, p_status text, p_limit integer, p_offset integer'),
    '4.2 ★ التوقيع الموحّد الجديد مفقود';
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★ تنبيه الأخطاء الحرجة ═════════════════════════════════════════
  DELETE FROM public.notifications WHERE tenant_id = v_t;

  -- الفاعل موظف حتى لا تبتلع notify_user الإشعار كـ«إشعار ذاتي»
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.error_logs(id,tenant_id,message,severity,route,created_at)
    VALUES (v_err,v_t,'انهيار خدمة البصمة','critical','/app/tech-portal',NOW());

  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND type='tech_critical_error';
  ASSERT v_n >= 1,
    format('5.1 ★ الخطأ الحرج لم يُشعِر أحداً (%s) — صامت', v_n);
  v_pass := v_pass + 1;

  -- ★ تقني الشركة أُشعِر
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_it AND type='tech_critical_error';
  ASSERT v_n = 1, format('5.2 ★ تقني الشركة لم يُشعَر (%s)', v_n);
  v_pass := v_pass + 1;

  -- الرابط يوصل لصفحة الأخطاء
  SELECT action_url INTO v_txt FROM public.notifications
   WHERE tenant_id=v_t AND type='tech_critical_error' LIMIT 1;
  ASSERT v_txt = '/app/tech-portal/error-logs',
    format('5.3 الرابط = %s', COALESCE(v_txt,'NULL'));
  v_pass := v_pass + 1;

  -- ★ الخطأ المنخفض لا يُشعِر (إشعار كل خطأ يُدرِّب على التجاهل)
  DELETE FROM public.notifications WHERE tenant_id = v_t;
  INSERT INTO public.error_logs(id,tenant_id,message,severity,created_at)
    VALUES (v_low,v_t,'حقل ناقص','low',NOW());
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND type='tech_critical_error';
  ASSERT v_n = 0,
    format('5.4 ★ خطأ منخفض أشعر %s — ضجيج يُدرَّب على تجاهله', v_n);
  v_pass := v_pass + 1;

  -- الحالات الحدّية
  ASSERT public.notify_critical_error(NULL) = 0, '5.5 معرّف فارغ أشعر';
  ASSERT public.notify_critical_error(gen_random_uuid()) = 0,
    '5.6 خطأ غير موجود أشعر';
  ASSERT public.notify_critical_error(v_low) = 0,
    '5.7 ★ استدعاء مباشر لخطأ منخفض أشعر';
  v_pass := v_pass + 3;

  -- ★ العزل: لا إشعار لشركة أخرى
  SELECT count(*) INTO v_n FROM public.notifications WHERE tenant_id = v_tb;
  ASSERT v_n = 0, format('5.8 ★★ تسرّب %s إشعاراً لشركة أخرى', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑥ الصلاحيات ══════════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.tech_integrations_health()','EXECUTE'), '6.1 anon يقرأ التكاملات';
  ASSERT NOT has_function_privilege('anon',
    'public.tech_export_log(text,text,integer,integer)','EXECUTE'),
    '6.2 anon يقرأ الصادرات';
  ASSERT NOT has_function_privilege('anon',
    'public.notify_critical_error(uuid)','EXECUTE'), '6.3 anon يُطلق تنبيهات';
  ASSERT has_function_privilege('authenticated',
    'public.tech_integrations_health()','EXECUTE'),
    '6.4 المستخدم المُصادَق محجوب عن التكاملات';
  v_pass := v_pass + 4;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.notifications                    WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.error_logs                       WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.export_logs                      WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.finance_integration_events       WHERE tenant_id = v_t;
  DELETE FROM public.finance_integration_connectors   WHERE tenant_id = v_t;
  DELETE FROM public.legal_entities                   WHERE tenant_id = v_t;
  DELETE FROM public.employees                        WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.profiles WHERE id IN (v_it,v_emp);
  DELETE FROM auth.users      WHERE id IN (v_it,v_emp);
  DELETE FROM public.tenants  WHERE id IN (v_t,v_tb);

  RAISE NOTICE '✅ verify-0331: %/35 تأكيداً ناجحاً', v_pass;
END $$;
