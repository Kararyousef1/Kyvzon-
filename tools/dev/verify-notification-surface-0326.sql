-- ============================================================================
-- verify-notification-surface-0326.sql
--
-- توحيد سطح الإشعارات: بوابة التواصل تصل الجرس · مزامنة القراءة.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**
-- لا سياسات RLS. عزل بوابة التواصل عبر RLS الحقيقي في
-- tools/dev/verify-tawathul-isolation-0326-rls.sh — لا نَدَّعي هنا ما لا نقيسه.
--
-- كل تأكيد ★ سقط فعلاً قبل 0326 (موثَّق في docs/BUGFIX_0326_*.md).
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_a     UUID := gen_random_uuid();   -- المرسل
  v_b     UUID := gen_random_uuid();   -- المستقبل
  v_c     UUID := gen_random_uuid();   -- عضو مكتوم
  v_d     UUID := gen_random_uuid();   -- عضو غادر
  v_conv  UUID := gen_random_uuid();
  v_msg   UUID := gen_random_uuid();
  v_msg2  UUID := gen_random_uuid();
  v_nid   UUID;
  v_n     INT;
  v_txt   TEXT;
  v_pass  INT := 0;
BEGIN
  -- ═══ تهيئة ═══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'NA','إشعار أ','na26-'||substr(v_t::text ,1,8)),
    (v_tb,'NB','إشعار ب','nb26-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_a,'a-'||substr(v_a::text,1,8)||'@n26.io'),
    (v_b,'b-'||substr(v_b::text,1,8)||'@n26.io'),
    (v_c,'c-'||substr(v_c::text,1,8)||'@n26.io'),
    (v_d,'d-'||substr(v_d::text,1,8)||'@n26.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_a,v_t,'المرسل','employee'),
    (v_b,v_t,'المستقبل','employee'),
    (v_c,v_t,'المكتوم','employee'),
    (v_d,v_t,'المغادر','employee');

  INSERT INTO public.tawathul_conversations(id,tenant_id,type,title,created_by)
    VALUES (v_conv,v_t,'group','نقاش المشروع',v_a);
  INSERT INTO public.tawathul_members(tenant_id,conversation_id,user_id,role,is_muted,left_at)
    VALUES (v_t,v_conv,v_a,'admin',FALSE,NULL),
           (v_t,v_conv,v_b,'member',FALSE,NULL),
           (v_t,v_conv,v_c,'member',TRUE,NULL),
           (v_t,v_conv,v_d,'member',FALSE,NOW());

  -- ═══ ① البنية ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('tg_sync_tawathul_read','notify_inventory_inbound',
      'notification_surface_overview','my_unread_by_kind');
  ASSERT v_n = 4, format('1.1 دوال 0326 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- محفّزا مزامنة القراءة على الجدولين
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname='trg_sync_tawathul_read' AND NOT tgisinternal;
  ASSERT v_n = 2, format('1.2 محفّزات مزامنة القراءة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ notify_inventory_inbound VOLATILE (الكتابة مستحيلة في STABLE — درس 0320)
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='notify_inventory_inbound') = 'v',
    '1.3 ★ notify_inventory_inbound ليست VOLATILE';
  v_pass := v_pass + 1;

  -- ═══ ② ★ الجسر: رسالة التواصل تصل الجرس — عطل ① ══════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_a::TEXT, TRUE);
  INSERT INTO public.tawathul_messages(id,tenant_id,conversation_id,sender_id,body)
    VALUES (v_msg,v_t,v_conv,v_a,'هل انتهى التقرير؟');

  -- الجدول الخاص يعمل كما كان
  SELECT count(*) INTO v_n FROM public.tawathul_notifications
   WHERE tenant_id=v_t AND message_id=v_msg;
  ASSERT v_n = 1, format('2.1 إشعارات التواصل = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ الجرس الموحّد صار يرى الرسالة
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND related_table='tawathul_messages' AND related_id=v_msg;
  ASSERT v_n = 1,
    format('2.2 ★ رسالة التواصل لم تصل الجرس (%s) — الموظف لا يعلم', v_n);
  v_pass := v_pass + 1;

  -- المستقبل وحده أُشعِر
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_b AND related_id=v_msg;
  ASSERT v_n = 1, format('2.3 المستقبل لم يُشعَر (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ المرسل لا يُشعر بفعله (حراسة notify_user)
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_a;
  ASSERT v_n = 0, format('2.4 ★ المرسل أُشعِر برسالته هو (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ العضو المكتوم لا يُشعَر (لا في الجدول ولا في الجرس)
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_c;
  ASSERT v_n = 0, format('2.5 ★ العضو المكتوم أُشعِر في الجرس (%s)', v_n);
  SELECT count(*) INTO v_n FROM public.tawathul_notifications
   WHERE tenant_id=v_t AND user_id=v_c;
  ASSERT v_n = 0, format('2.6 العضو المكتوم أُشعِر في الجدول (%s)', v_n);
  v_pass := v_pass + 2;

  -- ★ العضو المغادر لا يُشعَر
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_d;
  ASSERT v_n = 0, format('2.7 ★ عضو غادر المحادثة أُشعِر (%s)', v_n);
  v_pass := v_pass + 1;

  -- الإشعار يحمل رابطاً يوصل للمحادثة
  SELECT action_url INTO v_txt FROM public.notifications
   WHERE tenant_id=v_t AND related_id=v_msg LIMIT 1;
  ASSERT v_txt LIKE '%/app/tawathul%' AND v_txt LIKE '%' || v_conv::TEXT || '%',
    format('2.8 الرابط لا يوصل للمحادثة: %s', COALESCE(v_txt,'NULL'));
  v_pass := v_pass + 1;

  -- ★ عنوان المحادثة في نص الإشعار («رسالة جديدة» وحدها لا تُخبر أين)
  SELECT title INTO v_txt FROM public.notifications
   WHERE tenant_id=v_t AND related_id=v_msg LIMIT 1;
  ASSERT v_txt LIKE '%نقاش المشروع%',
    format('2.9 عنوان المحادثة مفقود من الإشعار: %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ③ الإشارة بالاسم نوع مستقلّ ══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_a::TEXT, TRUE);
  INSERT INTO public.tawathul_messages(id,tenant_id,conversation_id,sender_id,body,mentions)
    VALUES (v_msg2,v_t,v_conv,v_a,'@المستقبل راجع هذا',
            to_jsonb(ARRAY[v_b::TEXT]));

  SELECT type INTO v_txt FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_b AND related_id=v_msg2;
  ASSERT v_txt = 'tawathul_mention',
    format('3.1 ★ نوع إشعار الإشارة = %s (متوقَّع tawathul_mention)', v_txt);
  v_pass := v_pass + 1;

  SELECT title INTO v_txt FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_b AND related_id=v_msg2;
  ASSERT v_txt LIKE '%تمت الإشارة إليك%', format('3.2 عنوان الإشارة = %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ④ عدّاد الجرس يشمل التواصل ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_b::TEXT, TRUE);
  SELECT public.my_unread_notification_count() INTO v_n;
  ASSERT v_n = 2,
    format('4.1 ★ عدّاد الجرس = %s (متوقَّع 2 — رسالة + إشارة)', v_n);
  v_pass := v_pass + 1;

  -- التفصيل حسب النوع
  SELECT out_count INTO v_n FROM public.my_unread_by_kind() WHERE out_kind='messages';
  ASSERT v_n = 2, format('4.2 تفصيل الرسائل = %s', COALESCE(v_n,0));
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★ مزامنة القراءة في الاتجاهين — عطل ③ ═════════════════════════
  -- (أ) القراءة في بوابة التواصل ⇒ الجرس يهدأ
  UPDATE public.tawathul_notifications SET is_read = TRUE
   WHERE tenant_id=v_t AND user_id=v_b AND message_id=v_msg;

  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_b AND related_id=v_msg
     AND COALESCE(is_read,FALSE);
  ASSERT v_n = 1,
    format('5.1 ★ القراءة في التواصل لم تُزامَن للجرس (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT public.my_unread_notification_count() INTO v_n;
  ASSERT v_n = 1, format('5.2 العدّاد لم ينقص بعد القراءة (%s)', v_n);
  v_pass := v_pass + 1;

  -- (ب) القراءة في الجرس ⇒ بوابة التواصل تهدأ
  SELECT id INTO v_nid FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_b AND related_id=v_msg2;
  UPDATE public.notifications SET is_read = TRUE WHERE id = v_nid;

  SELECT count(*) INTO v_n FROM public.tawathul_notifications
   WHERE tenant_id=v_t AND user_id=v_b AND message_id=v_msg2
     AND COALESCE(is_read,FALSE);
  ASSERT v_n = 1,
    format('5.3 ★ القراءة في الجرس لم تُزامَن للتواصل (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT public.my_unread_notification_count() INTO v_n;
  ASSERT v_n = 0, format('5.4 العدّاد لم يصل صفراً (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ المزامنة لا تلمس مستخدماً آخر
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id <> v_b AND COALESCE(is_read,FALSE);
  ASSERT v_n = 0, format('5.5 ★ المزامنة علّمت إشعارات مستخدم آخر (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑥ ★ الجدول اليتيم صار له كاتب — عطل ② ═══════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_a::TEXT, TRUE);
  -- ملاحظة عمود: event_type مقيَّد بـCHECK — القيم المسموحة
  -- asn_created · dock_scheduled · receiving_posted · quality_required
  -- osd_created · putaway_created · cross_dock_ready · po_updated
  SELECT public.notify_inventory_inbound(
    'asn_created','وصلت شحنة ASN-100', v_b, 'الرصيف 3') INTO v_n;
  ASSERT v_n = 1, format('6.1 إشعار المخزون لم يُرسَل (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.inventory_inbound_notifications
   WHERE tenant_id=v_t AND target_user_id=v_b;
  ASSERT v_n = 1, format('6.2 ★ الجدول اليتيم ما زال فارغاً (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_b AND type='inventory_inbound';
  ASSERT v_n = 1, format('6.3 ★ إشعار المخزون لم يصل الجرس (%s)', v_n);
  v_pass := v_pass + 1;

  -- الحالات الحدّية
  ASSERT public.notify_inventory_inbound('asn_created','') = 0,
    '6.4 عنوان فارغ أنشأ إشعاراً';
  ASSERT public.notify_inventory_inbound('asn_created','عنوان') = 0,
    '6.5 بلا مستخدم ولا دور أنشأ إشعاراً';
  v_pass := v_pass + 2;

  -- ═══ ⑦ لوحة التشخيص ══════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.notification_surface_overview();
  ASSERT v_n >= 7, format('7.1 اللوحة أعادت %s جدولاً (متوقَّع ≥7)', v_n);
  v_pass := v_pass + 1;

  -- الجرس الموحّد مُصنَّف صحيحاً
  SELECT out_category INTO v_txt FROM public.notification_surface_overview()
   WHERE out_table='notifications';
  ASSERT v_txt = 'الجرس الموحّد', format('7.2 تصنيف notifications = %s', v_txt);
  v_pass := v_pass + 1;

  -- ★ سجلّ التدقيق لا يُدَّعى أنه يصل الجرس
  SELECT out_reaches_bell INTO v_txt FROM public.notification_surface_overview()
   WHERE out_table='movement_notification_log';
  ASSERT v_txt = 'false',
    format('7.3 ★ سجلّ التدقيق ادُّعي أنه يصل الجرس (%s)', v_txt);
  v_pass := v_pass + 1;

  -- والتواصل مُصنَّف مجسوراً
  SELECT out_reaches_bell INTO v_txt FROM public.notification_surface_overview()
   WHERE out_table='tawathul_notifications';
  ASSERT v_txt = 'true', format('7.4 التواصل غير مُصنَّف مجسوراً (%s)', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑧ العزل بين المستأجرين ══════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.notifications WHERE tenant_id=v_tb;
  ASSERT v_n = 0, format('8.1 ★ تسرّب %s إشعاراً لشركة أخرى', v_n);
  SELECT count(*) INTO v_n FROM public.tawathul_notifications WHERE tenant_id=v_tb;
  ASSERT v_n = 0, format('8.2 ★ تسرّب %s إشعار تواصل لشركة أخرى', v_n);
  v_pass := v_pass + 2;

  -- ═══ ⑨ الصلاحيات ═════════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.notify_inventory_inbound(text,text,uuid,text,text,uuid,text)','EXECUTE'),
    '9.1 anon يُنشئ إشعارات مخزون';
  ASSERT NOT has_function_privilege('anon',
    'public.notification_surface_overview()','EXECUTE'),
    '9.2 anon يقرأ لوحة التشخيص';
  ASSERT NOT has_function_privilege('anon','public.my_unread_by_kind()','EXECUTE'),
    '9.3 anon يقرأ تفصيل غير المقروء';
  ASSERT has_function_privilege('authenticated','public.my_unread_by_kind()','EXECUTE'),
    '9.4 المستخدم المُصادَق لا يصل للتفصيل';
  v_pass := v_pass + 4;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.inventory_inbound_notifications WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.notifications          WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.tawathul_notifications WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.tawathul_messages      WHERE tenant_id = v_t;
  DELETE FROM public.tawathul_members       WHERE tenant_id = v_t;
  DELETE FROM public.tawathul_conversations WHERE tenant_id = v_t;
  DELETE FROM public.employees              WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.profiles  WHERE id IN (v_a,v_b,v_c,v_d);
  DELETE FROM auth.users       WHERE id IN (v_a,v_b,v_c,v_d);
  DELETE FROM public.tenants   WHERE id IN (v_t,v_tb);

  RAISE NOTICE '✅ verify-0326: %/36 تأكيداً ناجحاً', v_pass;
END $$;
