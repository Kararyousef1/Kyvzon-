-- ============================================================================
-- verify-request-guard-0324.sql
--
-- حارس تجاوز سلسلة الاعتماد + الأرشفة بدل الحذف النهائي.
--
-- منهجية: أقسام ①–④ تعمل بدور postgres (BYPASSRLS) فتقيس **منطق
-- الدوال والمحفّزات**. القسم ⑤ يقيس السلوك عبر RLS الحقيقي في جلسة
-- منفصلة (tools/dev/verify-request-guard-0324-rls.sh) — لا نَدَّعي هنا
-- ما لا نقيسه.
--
-- كل تأكيد ★ سقط فعلاً قبل 0324 (موثَّق في docs/BUGFIX_0324_*.md).
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_d     UUID := gen_random_uuid();
  v_dsub  UUID := gen_random_uuid();
  v_sup   UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_hr    UUID := gen_random_uuid();
  v_adm   UUID := gen_random_uuid();
  v_eid   UUID;
  v_lv    UUID := gen_random_uuid();
  v_lv2   UUID := gen_random_uuid();
  v_pm    UUID := gen_random_uuid();
  v_sop   UUID := gen_random_uuid();
  v_rid   UUID;
  v_n     INT;
  v_txt   TEXT;
  v_ok    BOOLEAN;
  v_tbl   TEXT;
  v_pass  INT := 0;
BEGIN
  -- ═══ تهيئة ═══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'G','حارس','g-'||substr(v_t::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar,is_active)
    VALUES (v_d,v_t,'العمليات',true);
  INSERT INTO auth.users(id,email) VALUES
    (v_sup,'s-'||substr(v_sup::text,1,8)||'@g.io'),
    (v_emp,'e-'||substr(v_emp::text,1,8)||'@g.io'),
    (v_hr ,'h-'||substr(v_hr::text ,1,8)||'@g.io'),
    (v_adm,'a-'||substr(v_adm::text,1,8)||'@g.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_sup,v_t,'المشرف','supervisor'),
    (v_hr ,v_t,'موظف HR','hr'),
    (v_adm,v_t,'المسؤول','admin');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department)
    VALUES (v_emp,v_t,'الموظف','employee','العمليات');
  UPDATE public.departments SET supervisor_id = v_sup WHERE id = v_d;
  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id = v_emp;

  -- ═══ ① الدوال والمحفّزات موجودة ══════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('tg_guard_request_status_bypass','archive_sop','archive_department');
  ASSERT v_n = 3, format('1.1 دوال 0324 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- حُدِّث في 0325: كانا اثنين (leaves · permissions_request) وصارا أربعة
  -- بإضافة expense_requests و employee_loans. الرقم الحرفي كان يُثبّت
  -- نقصاً لا يُثبت صحة، فنفحص الحدّ الأدنى ووجود الجدولين الأصليين اسماً.
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname='trg_guard_status_bypass' AND NOT tgisinternal;
  ASSERT v_n >= 2, format('1.2 محفّزات الحارس = %s (متوقَّع ≥2)', v_n);
  v_pass := v_pass + 1;

  FOREACH v_tbl IN ARRAY ARRAY['leaves','permissions_request'] LOOP
    ASSERT EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE t.tgname='trg_guard_status_bypass' AND NOT t.tgisinternal
         AND c.relname = v_tbl
    ), format('1.2b حارس %s مفقود', v_tbl);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ BEFORE لا AFTER: الرفض يجب أن يمنع الكتابة لا أن يتبعها
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgname='trg_guard_status_bypass' AND NOT t.tgisinternal
       AND pg_get_triggerdef(t.oid) NOT ILIKE '%BEFORE UPDATE%'
  ), '1.3 ★ حارس ليس BEFORE UPDATE — الكتابة تمرّ ثم يُرفع الخطأ';
  v_pass := v_pass + 1;

  -- ═══ ② ★ الحارس: تجاوز السلسلة مرفوض (العطل ①) ═══════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_lv,v_t,v_eid,'annual','2026-09-01','2026-09-03','انتظار');
  SELECT public.create_hr_approval('leave', v_lv, v_eid) INTO v_rid;

  SELECT count(*) INTO v_n FROM public.hr_approval_steps
   WHERE request_id = v_rid AND status IN ('pending','active');
  ASSERT v_n >= 1, format('2.1 السلسلة لم تُبنَ (%s خطوة مفتوحة)', v_n);
  v_pass := v_pass + 1;

  -- دور hr يحاول الاعتماد مباشرةً — كان ينجح قبل 0324
  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  v_ok := TRUE;
  BEGIN
    UPDATE public.leaves SET status = 'موافق' WHERE id = v_lv;
    v_ok := FALSE;   -- لم يُرفع استثناء ⇒ الثغرة مفتوحة
  EXCEPTION WHEN check_violation THEN
    v_ok := TRUE;
  END;
  ASSERT v_ok,
    '2.2 ★ دور hr تجاوز سلسلة الاعتماد وكتب الحالة مباشرةً';
  v_pass := v_pass + 1;

  -- والحالة لم تتغيّر فعلاً
  SELECT status INTO v_txt FROM public.leaves WHERE id = v_lv;
  ASSERT v_txt = 'انتظار',
    format('2.3 ★ الحالة تغيّرت رغم الرفض: «%s»', v_txt);
  v_pass := v_pass + 1;

  -- الرسالة تشرح البديل لا تكتفي بالمنع
  BEGIN
    UPDATE public.leaves SET status = 'موافق' WHERE id = v_lv;
    ASSERT FALSE, '2.4 لم يُرفع استثناء';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    ASSERT v_txt LIKE '%صندوق الموافقات%',
      format('2.4 الرسالة لا تشرح البديل: %s', v_txt);
  END;
  v_pass := v_pass + 1;

  -- الأذونات محروسة كذلك
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.permissions_request
    (id,tenant_id,employee_id,date,expected_out_time,expected_return_time,reason,status)
    VALUES (v_pm,v_t,v_eid,'2026-09-10','10:00','12:00','مراجعة','انتظار');
  PERFORM public.create_hr_approval('permission', v_pm, v_eid);

  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  v_ok := TRUE;
  BEGIN
    UPDATE public.permissions_request SET status = 'موافق' WHERE id = v_pm;
    v_ok := FALSE;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '2.5 ★ تجاوز سلسلة الإذن مسموح';
  v_pass := v_pass + 1;

  -- ═══ ③ المحرّك الشرعي لم ينكسر ════════════════════════════════════════
  --    الخطر الأكبر في حارس كهذا أن يمنع المحرّك نفسه.
  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  SELECT public.unified_approval_decide('hr', v_rid, 'approved', 'موافق') INTO v_txt;
  ASSERT v_txt = 'approved', format('3.1 ★ الحارس منع المحرّك الشرعي (%s)', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.leaves WHERE id = v_lv;
  ASSERT v_txt = 'موافق',
    format('3.2 ★ المزامنة لم تعبر الحارس: «%s»', v_txt);
  v_pass := v_pass + 1;

  -- ★ العلَم محلّي للمعاملة — لا يبقى مرفوعاً بعدها
  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_lv2,v_t,v_eid,'annual','2026-11-01','2026-11-02','انتظار');
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  PERFORM public.create_hr_approval('leave', v_lv2, v_eid);
  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  v_ok := TRUE;
  BEGIN
    UPDATE public.leaves SET status = 'موافق' WHERE id = v_lv2;
    v_ok := FALSE;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '3.3 ★ علَم المزامنة بقي مرفوعاً — الحارس مُعطَّل للأبد';
  v_pass := v_pass + 1;

  -- ═══ ④ الاستثناءات المشروعة ══════════════════════════════════════════
  -- طلب بلا سلسلة (سجل قديم) ⇒ المسار الإداري مسموح
  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  UPDATE public.leaves SET status = 'موافق'
   WHERE id = (SELECT l.id FROM public.leaves l
                WHERE l.tenant_id = v_t AND NOT EXISTS (
                  SELECT 1 FROM public.hr_approval_requests r
                   WHERE r.related_id = l.id) LIMIT 1);
  v_pass := v_pass + 1;   -- لم يُرفع استثناء

  -- المسؤول يتجاوز سلسلة قائمة (تصحيح إداري)
  PERFORM set_config('request.jwt.claim.sub', v_adm::TEXT, TRUE);
  UPDATE public.leaves SET status = 'مرفوض' WHERE id = v_lv2;
  SELECT status INTO v_txt FROM public.leaves WHERE id = v_lv2;
  ASSERT v_txt = 'مرفوض', format('4.2 المسؤول لم يستطع التصحيح (%s)', v_txt);
  v_pass := v_pass + 2;

  -- تعديل حقل آخر لا يمسّ الحالة يمرّ دائماً
  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  UPDATE public.leaves SET reason = 'ملاحظة إدارية' WHERE id = v_lv;
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★ أرشفة الإجراء بدل حذفه (العطل ②) ════════════════════════════
  INSERT INTO public.sops(id,tenant_id,code,title,description,department,category,status)
    VALUES (v_sop,v_t,'SOP-G','إجراء السلامة','وصف','العمليات','سلامة','active');
  INSERT INTO public.sop_readings(sop_id,employee_id,tenant_id,completed)
    VALUES (v_sop,v_eid,v_t,true);

  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  SELECT public.archive_sop(v_sop, 'قديم') INTO v_txt;
  ASSERT v_txt = 'archived', format('5.1 الأرشفة أعادت %s', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.sops WHERE id = v_sop;
  ASSERT v_txt = 'archived', format('5.2 الحالة = %s', v_txt);
  v_pass := v_pass + 1;

  -- ★ دليل الامتثال محفوظ — الحذف كان يُبيده (CASCADE)
  SELECT count(*) INTO v_n FROM public.sop_readings WHERE sop_id = v_sop;
  ASSERT v_n = 1,
    format('5.3 ★ سجلات القراءة = %s — دليل الامتثال أُبيد', v_n);
  v_pass := v_pass + 1;

  -- الأرشفة مرتين آمنة
  SELECT public.archive_sop(v_sop) INTO v_txt;
  ASSERT v_txt = 'already_archived', format('5.4 أرشفة مكرّرة = %s', v_txt);
  v_pass := v_pass + 1;

  -- الموظف العادي لا يؤرشف
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  v_ok := TRUE;
  BEGIN
    PERFORM public.archive_sop(v_sop);
    v_ok := FALSE;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '5.5 ★ موظف عادي أرشف إجراء تشغيل';
  v_pass := v_pass + 1;

  -- ═══ ⑥ ★ أرشفة القسم بأسباب مفهومة (العطل ③) ═════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);

  -- قسم فيه موظفون ⇒ سبب واضح لا رسالة قيد خام
  BEGIN
    PERFORM public.archive_department(v_d);
    ASSERT FALSE, '6.1 أُرشف قسم فيه موظفون';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    ASSERT v_txt LIKE '%HAS_EMPLOYEES%',
      format('6.1 السبب غير مفهوم: %s', v_txt);
  END;
  v_pass := v_pass + 1;

  -- قسم فيه أقسام فرعية نشطة
  INSERT INTO public.departments(id,tenant_id,name_ar,parent_department_id,is_active)
    VALUES (v_dsub,v_t,'فرعي',v_d,true);
  UPDATE public.employees SET department_id = NULL WHERE tenant_id = v_t;
  BEGIN
    PERFORM public.archive_department(v_d);
    ASSERT FALSE, '6.2 أُرشف قسم له فروع نشطة';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    ASSERT v_txt LIKE '%HAS_ACTIVE_CHILDREN%',
      format('6.2 السبب غير مفهوم: %s', v_txt);
  END;
  v_pass := v_pass + 1;

  -- بعد إزالة الموانع: تنجح، وقواعد الاعتماد تبقى
  INSERT INTO public.approval_rules
    (tenant_id,unit_key,rule_name,level,required_role,department_id)
    VALUES (v_t,'hr','قاعدة القسم',1,'manager',v_d);
  UPDATE public.departments SET is_active = FALSE WHERE id = v_dsub;
  SELECT public.archive_department(v_d) INTO v_txt;
  ASSERT v_txt = 'archived', format('6.3 الأرشفة أعادت %s', v_txt);
  v_pass := v_pass + 1;

  ASSERT NOT (SELECT is_active FROM public.departments WHERE id = v_d),
    '6.4 القسم ما زال نشطاً';
  v_pass := v_pass + 1;

  -- ★ الحذف كان يُبيد هذه عبر ON DELETE CASCADE
  SELECT count(*) INTO v_n FROM public.approval_rules
   WHERE department_id = v_d AND tenant_id = v_t;
  ASSERT v_n = 1,
    format('6.5 ★ قواعد الاعتماد أُبيدت (%s) — الأرشفة يجب أن تحفظها', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ الصلاحيات ══════════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon','public.archive_sop(uuid,text)','EXECUTE'),
    '7.1 anon يؤرشف إجراءات';
  ASSERT NOT has_function_privilege('anon','public.archive_department(uuid)','EXECUTE'),
    '7.2 anon يؤرشف أقساماً';
  ASSERT has_function_privilege('authenticated','public.archive_sop(uuid,text)','EXECUTE'),
    '7.3 المستخدم المُصادَق لا يستطيع الأرشفة';
  v_pass := v_pass + 3;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.approval_rules       WHERE tenant_id = v_t;
  DELETE FROM public.sop_readings         WHERE tenant_id = v_t;
  DELETE FROM public.sops                 WHERE tenant_id = v_t;
  DELETE FROM public.notifications        WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_steps    WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_requests WHERE tenant_id = v_t;
  DELETE FROM public.permissions_request  WHERE tenant_id = v_t;
  DELETE FROM public.leaves               WHERE tenant_id = v_t;
  DELETE FROM public.employees            WHERE tenant_id = v_t;
  DELETE FROM public.profiles  WHERE id IN (v_sup,v_emp,v_hr,v_adm);
  DELETE FROM auth.users       WHERE id IN (v_sup,v_emp,v_hr,v_adm);
  DELETE FROM public.departments WHERE tenant_id = v_t;
  DELETE FROM public.tenants     WHERE id = v_t;

  RAISE NOTICE '✅ verify-0324: %/29 تأكيداً ناجحاً', v_pass;
END $$;
