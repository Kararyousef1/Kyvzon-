-- ============================================================================
-- verify-approval-lifecycle-0323.sql
--
-- دورة حياة الاعتماد الكاملة + إيصال الإشعارات لكل البوابات.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**
-- لا سياسات RLS. لا نَدَّعي هنا ما لا نقيسه.
--
-- كل تأكيد هنا **سقط فعلاً** قبل 0323 (موثَّق في docs/BUGFIX_0323_*.md).
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_d     UUID := gen_random_uuid();
  v_mgr   UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_sup   UUID := gen_random_uuid();
  v_eid   UUID;
  v_lv    UUID := gen_random_uuid();
  v_lv2   UUID := gen_random_uuid();
  v_pm    UUID := gen_random_uuid();
  v_rid   UUID;
  v_rid2  UUID;
  v_ridp  UUID;
  v_n     INT;
  v_txt   TEXT;
  v_res   TEXT;
  v_pass  INT := 0;
BEGIN
  -- ═══ تهيئة ═══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'LA','دورة أ','la-'||substr(v_t::text ,1,8)),
    (v_tb,'LB','دورة ب','lb-'||substr(v_tb::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'العمليات');
  INSERT INTO auth.users(id,email) VALUES
    (v_mgr,'m-'||substr(v_mgr::text,1,8)||'@l.io'),
    (v_emp,'e-'||substr(v_emp::text,1,8)||'@l.io'),
    (v_sup,'s-'||substr(v_sup::text,1,8)||'@l.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_mgr,v_t,'المدير','manager'),
    (v_sup,v_t,'المشرف','supervisor');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
    (v_emp,v_t,'الموظف','employee','العمليات');
  UPDATE public.departments SET manager_id=v_mgr, supervisor_id=v_sup WHERE id=v_d;
  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id=v_emp;

  -- ═══ ① الدوال الجديدة موجودة وبالتقلّب الصحيح ════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('approval_source_info','sync_hr_source_status','my_unread_notification_count');
  ASSERT v_n = 3, format('1.1 دوال 0323 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ الكتابة مستحيلة في STABLE — درس 0320
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='approval_source_info') = 'v',
    '1.2 ★ approval_source_info ليست VOLATILE — الكتابة ستُبتلع صامتة';
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='sync_hr_source_status') = 'v',
    '1.3 ★ sync_hr_source_status ليست VOLATILE';
  v_pass := v_pass + 2;

  -- المحفّزات على جداول الخطوات الأربعة، بـINSERT **و**UPDATE
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname='trg_notify_approval_step' AND NOT tgisinternal;
  ASSERT v_n = 4, format('1.4 محفّزات الخطوات = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★ العطل ③: UPDATE كان مفقوداً تماماً
  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE t.tgname='trg_notify_approval_step' AND NOT t.tgisinternal
     AND pg_get_triggerdef(t.oid) ILIKE '%UPDATE%';
  ASSERT v_n = 4, format('1.5 ★ محفّزات بلا UPDATE = %s — المعتمِد التالي لا يُشعَر', 4-v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname='trg_notify_single_approval' AND NOT tgisinternal;
  ASSERT v_n = 4, format('1.6 محفّزات البوابات المفردة = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② إنشاء الطلب: صاحب الخطوة النشطة **وحده** يُشعَر ════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_lv,v_t,v_eid,'annual','2026-09-01','2026-09-03','انتظار');
  SELECT public.create_hr_approval('leave', v_lv, v_eid) INTO v_rid;

  ASSERT (SELECT count(*) FROM public.hr_approval_steps WHERE request_id=v_rid) = 2,
    '2.1 السلسلة لم تُبنَ بخطوتين';
  v_pass := v_pass + 1;

  -- المشرف (خطوة active) يُشعَر
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_sup AND type='approval_pending';
  ASSERT v_n = 1, format('2.2 المشرف (الخطوة النشطة) أُشعِر %s مرة', v_n);
  v_pass := v_pass + 1;

  -- ★ العطل ④: المدير خطوته pending — دوره لم يحن
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_mgr;
  ASSERT v_n = 0,
    format('2.3 ★ صاحب خطوة pending أُشعِر (%s) — ضجيج يُدرَّب على تجاهله', v_n);
  v_pass := v_pass + 1;

  -- مُقدّم الطلب لا يُشعَر بفعله
  SELECT count(*) INTO v_n FROM public.notifications WHERE tenant_id=v_t AND user_id=v_emp;
  ASSERT v_n = 0, format('2.4 مُقدّم الطلب أُشعِر بفعله (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ③ ★ صندوق المعتمِد يرى سلسلة البوابة الخاصة (العطل ⑦) ═══════════
  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox(NULL);
  ASSERT v_n = 1,
    format('3.1 ★ صندوق المشرف = %s — hr_approval_steps غائب عن الصندوق', v_n);
  v_pass := v_pass + 1;

  -- والمدير (خطوته pending) لا يرى شيئاً بعد
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox(NULL);
  ASSERT v_n = 0, format('3.2 صاحب خطوة pending يرى الطلب في صندوقه (%s)', v_n);
  v_pass := v_pass + 1;

  -- ترقيم الخطوة صحيح في الصندوق
  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  SELECT out_total_steps INTO v_n FROM public.my_approval_inbox(NULL) LIMIT 1;
  ASSERT v_n = 2, format('3.3 إجمالي الخطوات في الصندوق = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ④ ★ المعتمِد الشرعي يبتّ من الصفحة الموحّدة (العطل ⑧) ════════════
  DELETE FROM public.notifications WHERE tenant_id=v_t;
  SELECT public.unified_approval_decide('hr', v_rid, 'approved', 'موافقة المشرف')
    INTO v_res;
  ASSERT v_res = 'pending',
    format('4.1 ★ نتيجة قرار المشرف = %s (متوقَّع pending — بقيت خطوة)', v_res);
  v_pass := v_pass + 1;

  ASSERT (SELECT status FROM public.hr_approval_steps
           WHERE request_id=v_rid AND step_order=1) = 'approved',
    '4.2 خطوة المشرف لم تُعتمَد';
  ASSERT (SELECT status FROM public.hr_approval_steps
           WHERE request_id=v_rid AND step_order=2) = 'active',
    '4.3 خطوة المدير لم تُفعَّل';
  v_pass := v_pass + 2;

  -- ★ العطل ③: المعتمِد التالي يُشعَر عند تفعيل خطوته
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_mgr AND type='approval_pending';
  ASSERT v_n = 1,
    format('4.4 ★ المعتمِد التالي لم يُشعَر (%s) — الطلب يتجمّد بصمت', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★ القرار النهائي: إشعار + مزامنة المصدر (العطلان ⑤ و⑥) ═════════
  DELETE FROM public.notifications WHERE tenant_id=v_t;
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT public.unified_approval_decide('hr', v_rid, 'approved', 'اعتماد نهائي')
    INTO v_res;
  ASSERT v_res = 'approved', format('5.1 النتيجة النهائية = %s', v_res);
  v_pass := v_pass + 1;

  ASSERT (SELECT status FROM public.hr_approval_requests WHERE id=v_rid) = 'approved',
    '5.2 الطلب لم يُعتمَد';
  v_pass := v_pass + 1;

  -- ★ العطل ⑥ — الأخطر: الإجازة نفسها
  SELECT status INTO v_txt FROM public.leaves WHERE id=v_lv;
  ASSERT v_txt = 'موافق',
    format('5.3 ★ leaves.status = «%s» بعد الاعتماد — الموظف يرى «قيد المراجعة» للأبد', v_txt);
  v_pass := v_pass + 1;

  -- ★ العطل ⑤: مُقدّم الطلب يُشعَر بالنتيجة
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_emp AND type='approval_granted';
  ASSERT v_n >= 1, format('5.4 ★ مُقدّم الطلب لم يُشعَر بالاعتماد (%s)', v_n);
  v_pass := v_pass + 1;

  -- السبب يظهر، والرابط يوجّه
  SELECT message INTO v_txt FROM public.notifications
   WHERE tenant_id=v_t AND type='approval_granted' LIMIT 1;
  ASSERT v_txt LIKE '%اعتماد نهائي%', format('5.5 سبب القرار مفقود: %s', v_txt);
  ASSERT EXISTS (SELECT 1 FROM public.notifications
                  WHERE tenant_id=v_t AND type='approval_granted'
                    AND action_url IS NOT NULL),
    '5.6 إشعار القرار بلا رابط';
  v_pass := v_pass + 2;

  -- ★ العطل ①: الدالة تعمل بعد أن اختفى الطلب من العرض
  ASSERT (SELECT count(*) FROM public.unified_approvals WHERE source_id=v_rid) = 0,
    '5.7 العرض ما زال يُظهر طلباً مُعتمَداً';
  SELECT public.notify_approval_decided('hr', v_rid, 'approved', 'تحقّق') INTO v_n;
  ASSERT v_n = 1,
    format('5.8 ★ notify_approval_decided = %s بعد تغيّر الحالة — تقرأ من العرض المُصفّى', v_n);
  v_pass := v_pass + 2;

  -- ═══ ⑥ مسار الرفض: يُنهي السلسلة ويُزامن ═════════════════════════════
  DELETE FROM public.notifications WHERE tenant_id=v_t;
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_lv2,v_t,v_eid,'annual','2026-10-01','2026-10-02','انتظار');
  SELECT public.create_hr_approval('leave', v_lv2, v_eid) INTO v_rid2;

  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  SELECT public.unified_approval_decide('hr', v_rid2, 'rejected', 'الرصيد لا يكفي')
    INTO v_res;
  ASSERT v_res = 'rejected', format('6.1 الرفض لم يُنهِ السلسلة (%s)', v_res);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.leaves WHERE id=v_lv2;
  ASSERT v_txt = 'مرفوض', format('6.2 ★ leaves.status بعد الرفض = «%s»', v_txt);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_emp AND type='approval_rejected';
  ASSERT v_n >= 1, format('6.3 لم يُشعَر مُقدّم الطلب بالرفض (%s)', v_n);
  v_pass := v_pass + 1;

  -- المدير لم يُزعج: السلسلة انتهت عند الخطوة الأولى
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_mgr AND type='approval_pending';
  ASSERT v_n = 0, format('6.4 أُشعِر المعتمِد التالي رغم انتهاء السلسلة بالرفض (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ طلب الإذن يسلك المسار نفسه ═══════════════════════════════════
  DELETE FROM public.notifications WHERE tenant_id=v_t;
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  -- ملاحظة عمود: `reason` NOT NULL بلا افتراضي (تحقّق من information_schema)
  INSERT INTO public.permissions_request
    (id,tenant_id,employee_id,date,expected_out_time,expected_return_time,reason,status)
    VALUES (v_pm,v_t,v_eid,'2026-09-10','10:00','12:00','مراجعة طبية','انتظار');
  SELECT public.create_hr_approval('permission', v_pm, v_eid) INTO v_ridp;

  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  PERFORM public.unified_approval_decide('hr', v_ridp, 'approved', 'موافق');
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  PERFORM public.unified_approval_decide('hr', v_ridp, 'approved', 'موافق');

  SELECT status INTO v_txt FROM public.permissions_request WHERE id=v_pm;
  ASSERT v_txt = 'موافق',
    format('7.1 ★ permissions_request.status = «%s» بعد الاعتماد', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑧ الحالات الحدّية ═══════════════════════════════════════════════
  ASSERT public.notify_approval_decided('hr', NULL, 'approved') = 0,
    '8.1 source_id فارغ أنشأ إشعاراً';
  ASSERT public.notify_approval_decided('hr', gen_random_uuid(), 'approved') = 0,
    '8.2 طلب غير موجود أنشأ إشعاراً';
  ASSERT public.notify_approval_pending('hr', gen_random_uuid()) = 0,
    '8.3 طلب غير موجود أشعر معتمِدين';
  ASSERT public.sync_hr_source_status(NULL, 'approved') = 0,
    '8.4 مزامنة بمعرّف فارغ';
  ASSERT public.sync_hr_source_status(v_rid, 'pending') = 0,
    '8.5 مزامنة بحالة غير نهائية';
  v_pass := v_pass + 5;

  -- وحدة غير معروفة لا تنهار
  SELECT count(*) INTO v_n FROM public.approval_source_info('nope', gen_random_uuid());
  ASSERT v_n = 0, format('8.6 وحدة مجهولة أعادت %s صفاً', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑨ عدّاد الجرس ═══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  SELECT public.my_unread_notification_count() INTO v_n;
  ASSERT v_n >= 1, format('9.1 عدّاد الجرس = %s رغم وجود إشعارات', v_n);
  v_pass := v_pass + 1;

  UPDATE public.notifications SET is_read = TRUE WHERE tenant_id=v_t AND user_id=v_emp;
  SELECT public.my_unread_notification_count() INTO v_n;
  ASSERT v_n = 0, format('9.2 العدّاد لا يحترم is_read (%s)', v_n);
  v_pass := v_pass + 1;

  -- المنتهي لا يُحسَب
  UPDATE public.notifications
     SET is_read = FALSE, expires_at = NOW() - INTERVAL '1 day'
   WHERE tenant_id=v_t AND user_id=v_emp;
  SELECT public.my_unread_notification_count() INTO v_n;
  ASSERT v_n = 0, format('9.3 العدّاد يحسب إشعارات منتهية (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑩ العزل بين المستأجرين ══════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.notifications WHERE tenant_id=v_tb;
  ASSERT v_n = 0, format('10.1 ★ تسرّب %s إشعاراً لشركة أخرى', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑪ الصلاحيات ═════════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.approval_source_info(text,uuid)','EXECUTE'),
    '11.1 anon يقرأ بيانات الطلبات';
  ASSERT NOT has_function_privilege('anon',
    'public.sync_hr_source_status(uuid,text)','EXECUTE'),
    '11.2 ★ anon يُغيّر حالة الإجازات';
  ASSERT NOT has_function_privilege('anon',
    'public.my_unread_notification_count()','EXECUTE'),
    '11.3 anon يقرأ عدّاد الإشعارات';
  ASSERT has_function_privilege('authenticated',
    'public.my_approval_inbox(text)','EXECUTE'),
    '11.4 المستخدم المُصادَق لا يصل لصندوقه';
  v_pass := v_pass + 4;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.notifications        WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.hr_approval_steps    WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_requests WHERE tenant_id = v_t;
  DELETE FROM public.permissions_request  WHERE tenant_id = v_t;
  DELETE FROM public.leaves               WHERE tenant_id = v_t;
  DELETE FROM public.employees            WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.profiles   WHERE id IN (v_mgr,v_emp,v_sup);
  DELETE FROM auth.users        WHERE id IN (v_mgr,v_emp,v_sup);
  DELETE FROM public.departments WHERE id = v_d;
  DELETE FROM public.tenants     WHERE id IN (v_t,v_tb);

  RAISE NOTICE '✅ verify-0323: %/44 تأكيداً ناجحاً', v_pass;
END $$;
