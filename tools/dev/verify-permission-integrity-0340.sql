-- ============================================================================
-- verify-permission-integrity-0340.sql
--
-- نزاهة طلبات الزمنيات: القرار · الأثر · التنفيذ · الاسم · الأوقات.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**.
-- العزل عبر RLS الحقيقي في verify-permission-integrity-0340-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة (من information_schema/pg_constraint لا من الذاكرة):
--   permissions_request: approved_by → profiles(id) · employee_id → employees(id)
--     employee_name·employee_department نصّان حرّان (مكرّران عن مصدرهما)
--   permissions: جدول **منفصل** بحقلَي actual_out_time/actual_return_time
--     كان فارغاً دائماً قبل 0340
--   hr_approval_steps.approver_id ← departments.manager_id → **profiles**
--   محفّز trg_ensure_employee_row (0317) يُنشئ سجلّ الموظف تلقائياً
--   قيد uq_employee_per_user_tenant (0335) يمنع سجلّاً ثانياً
--   ★ الدوال DEFINER تقرأ الجلسة ⇒ كل استدعاء يحتاج
--     set_config('request.jwt.claim.sub', …)
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_uEmp  UUID := gen_random_uuid();
  v_uMgr  UUID := gen_random_uuid();
  v_uSup  UUID := gen_random_uuid();
  v_uHr   UUID := gen_random_uuid();
  v_uB    UUID := gen_random_uuid();
  v_eEmp  UUID; v_eMgr UUID; v_eSup UUID; v_eHr UUID; v_eB UUID;
  v_d     UUID := gen_random_uuid();
  v_dB    UUID := gen_random_uuid();
  v_id    UUID; v_req UUID; v_st TEXT; v_n INT; v_txt TEXT;
  v_ok    BOOLEAN; v_msg TEXT; v_fin TEXT; v_uid UUID; v_ts TIMESTAMPTZ;
  v_pass  INT := 0;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'PA','زمنيات أ','pm40a-'||substr(v_t::text ,1,8)),
    (v_tb,'PB','زمنيات ب','pm40b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_uEmp,'e-'||substr(v_uEmp::text,1,8)||'@p40.io'),
    (v_uMgr,'m-'||substr(v_uMgr::text,1,8)||'@p40.io'),
    (v_uSup,'s-'||substr(v_uSup::text,1,8)||'@p40.io'),
    (v_uHr ,'h-'||substr(v_uHr::text ,1,8)||'@p40.io'),
    (v_uB  ,'b-'||substr(v_uB::text  ,1,8)||'@p40.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_uEmp,v_t ,'سعد الموظف','employee'),
    (v_uMgr,v_t ,'ليث المدير','manager'),
    (v_uSup,v_t ,'رنا المشرفة','supervisor'),
    (v_uHr ,v_t ,'هالة الموارد','hr'),
    (v_uB  ,v_tb,'موظف ب','employee');

  -- ★ المحفّز 0317 أنشأ السجلات — نلتقطها (0335 يمنع إدراجاً ثانياً)
  SELECT id INTO v_eEmp FROM public.employees WHERE user_id=v_uEmp AND tenant_id=v_t;
  SELECT id INTO v_eMgr FROM public.employees WHERE user_id=v_uMgr AND tenant_id=v_t;
  SELECT id INTO v_eSup FROM public.employees WHERE user_id=v_uSup AND tenant_id=v_t;
  SELECT id INTO v_eHr  FROM public.employees WHERE user_id=v_uHr  AND tenant_id=v_t;
  SELECT id INTO v_eB   FROM public.employees WHERE user_id=v_uB   AND tenant_id=v_tb;
  ASSERT v_eEmp IS NOT NULL AND v_eMgr IS NOT NULL AND v_eSup IS NOT NULL
     AND v_eHr IS NOT NULL AND v_eB IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّات الموظفين — تجهيز باطل';
  v_pass := v_pass + 1;

  INSERT INTO public.departments(id,tenant_id,name_ar,manager_id,supervisor_id) VALUES
    (v_d ,v_t ,'قسم الإنتاج',v_uMgr,v_uSup),
    (v_dB,v_tb,'قسم ب'      ,NULL  ,NULL  );
  UPDATE public.employees SET department_id=v_d  WHERE id IN (v_eEmp,v_eMgr,v_eSup,v_eHr);
  UPDATE public.employees SET department_id=v_dB WHERE id=v_eB;

  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('submit_permission_request','cancel_permission_request','permission_requests_view');
  ASSERT v_n = 3, format('1.1 دوال 0340 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='permission_requests_view'),
    '1.2 ★★ permission_requests_view صارت SECURITY DEFINER — تتجاوز RLS';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('submit_permission_request','cancel_permission_request',
                            'permission_requests_view','sync_hr_source_status')),
    '1.3 ★★ anon يملك EXECUTE على إحدى دوال 0340';
  v_pass := v_pass + 1;

  -- ★★ سياسة المعتمِد على الجدول المنفَّذ
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND policyname='kyvzon_permissions_select_approver'),
    '1.4 ★★ سياسة المعتمِد على permissions غائبة';
  v_pass := v_pass + 1;

  -- ★ سياسة 0339 على permissions_request ما زالت قائمة (لا انحدار)
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND policyname='kyvzon_permissions_request_select_approver'),
    '1.5 ★★★ سياسة 0339 على permissions_request اختفت — انحدار';
  v_pass := v_pass + 1;

  -- ═══ ② القيود (كانت غائبة تماماً) ═════════════════════════════════════
  BEGIN
    INSERT INTO public.permissions_request(tenant_id,employee_id,date,permission_type,
                                           expected_out_time,reason)
      VALUES(v_t,v_eEmp,current_date+1,'نوع_مخترع','10:00','نوع');
    RAISE EXCEPTION '2.1 ★ permission_type قَبِل ''نوع_مخترع'' — القيد غائب';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_pass := v_pass + 1;

  BEGIN
    INSERT INTO public.permissions_request(tenant_id,employee_id,date,permission_type,
                                           expected_out_time,expected_return_time,reason)
      VALUES(v_t,v_eEmp,current_date+1,'عادية','16:00','09:00','مقلوب');
    RAISE EXCEPTION '2.2 ★ عودة 09:00 قبل خروج 16:00 قُبِلت';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ★ 'مغادرة' بلا عودة مشروعة (وإلا كان القيد أوسع من اللازم)
  INSERT INTO public.permissions_request(tenant_id,employee_id,date,permission_type,
                                         expected_out_time,expected_return_time,reason)
    VALUES(v_t,v_eEmp,current_date+40,'مغادرة','14:00',NULL,'مغادرة بلا عودة')
    RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, '2.3 ★ مغادرة بلا وقت عودة رُفضت';
  v_pass := v_pass + 1;
  DELETE FROM public.permissions_request WHERE id=v_id;

  -- ═══ ③ البوّابة: المعرّف والاسم من الجلسة ════════════════════════════
  SELECT out_permission_id, out_request_id INTO v_id, v_req
    FROM public.submit_permission_request('عادية', current_date+2, '10:00', '12:00', 'زيارة طبيب');
  ASSERT v_id IS NOT NULL, '3.1 submit_permission_request لم تُعد معرّفاً';
  v_pass := v_pass + 1;

  ASSERT (SELECT employee_id FROM public.permissions_request WHERE id=v_id) = v_eEmp,
    '3.2 ★★★ الطلب نُسب لمعرّف خاطئ — لم يُشتقّ من الجلسة';
  v_pass := v_pass + 1;

  -- ★★ السلسلة أُنشئت في نفس المعاملة — لا طلب بلا رقابة
  ASSERT v_req IS NOT NULL, '3.3 ★★★ لا سلسلة اعتماد — الطلب بلا رقابة';
  SELECT count(*) INTO v_n FROM public.hr_approval_steps WHERE request_id=v_req;
  ASSERT v_n = 2, format('3.4 خطوات السلسلة = %s (متوقَّع 2: مشرفة + مدير)', v_n);
  v_pass := v_pass + 2;

  -- ★ الاسم والقسم من مصدرهما لا من المتصفح
  SELECT employee_name, employee_department INTO v_txt, v_msg
    FROM public.permissions_request WHERE id=v_id;
  ASSERT v_txt IS NOT NULL AND v_txt <> '',
    '3.5 ★ الاسم لم يُملأ من القاعدة';

  -- ★★★ ثغرة تغطية أُصلحت: «غير فارغ» يمرّ سواء جاء الاسم من
  --   profiles.full_name (حيّ) أو employees.first_name (متجمّد منذ محفّز
  --   0317 بـON CONFLICT DO NOTHING). نحتاج قيمة **مميِّزة**: نغيّر
  --   profiles وحده ونطلب زمنية جديدة — لو قُدّم employees لعاد الاسم
  --   القديم. مُثبَت أن العمودين يتباعدان فعلاً:
  --     profiles.full_name = 'الاسم الجديد' · employees.first_name = 'الموظف'
  DECLARE
    v_oldName TEXT;
    v_probe   UUID;
    v_got     TEXT;
  BEGIN
    SELECT full_name INTO v_oldName FROM public.profiles WHERE id=v_uEmp;
    UPDATE public.profiles SET full_name='سعد المُحدَّث فيصل' WHERE id=v_uEmp;
    -- تأكيد أن employees لم يتبع (وإلا لم يكن هناك تباعد أصلاً).
    -- ★ محفّز 0317 يشطر الاسم: first_name = الكلمة الأولى · last_name = الباقي.
    --   الاسم القديم 'سعد الموظف' ⇒ 'سعد' + 'الموظف'. لذلك نقارن الاسم
    --   **المركّب** لا الجزء الأول (الذي يصادف تطابقه مع الاسم الجديد).
    ASSERT btrim((SELECT first_name||' '||last_name FROM public.employees WHERE id=v_eEmp))
           <> 'سعد المُحدَّث فيصل',
      format('3.5b تجهيز باطل: employees تبع profiles (%s) — لا تباعد يُقاس',
             (SELECT first_name||' '||last_name FROM public.employees WHERE id=v_eEmp));

    SELECT out_permission_id INTO v_probe
      FROM public.submit_permission_request('عادية', current_date+13, '08:00', '09:00', 'فحص الاسم');
    SELECT employee_name INTO v_got
      FROM public.permissions_request WHERE id=v_probe;
    ASSERT v_got = 'سعد المُحدَّث فيصل',
      format('3.5c ★★★ الاسم المخزَّن = ''%s'' — جاء من employees المتجمّد '
             'لا من profiles الحيّ', v_got);
    PERFORM public.cancel_permission_request(v_probe, NULL);
    UPDATE public.profiles SET full_name=v_oldName WHERE id=v_uEmp;
  END;
  v_pass := v_pass + 1;
  ASSERT v_msg = 'قسم الإنتاج',
    format('3.6 ★ القسم = %s (متوقَّع ''قسم الإنتاج'' من departments)', v_msg);
  v_pass := v_pass + 2;

  -- ★★★ ثغرة تغطية أُصلحت: كل مستخدمي الاختبار لهم سجلّ موظف تلقائياً
  --   (محفّز 0317) فحارس `v_emp IS NULL` لا يُنفَّذ أبداً وعكسه لا يُسقط
  --   شيئاً. محفّز 0317 يستثني 'developer' و'it_admin' صراحةً
  --   (السطر 379: IF NEW.role IN ('developer','it_admin') THEN RETURN NEW)
  --   ⇒ نستعملهما لخلق مستخدم بلا سجلّ موظف.
  DECLARE
    v_uDev UUID := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users(id,email) VALUES(v_uDev,'d-'||substr(v_uDev::text,1,8)||'@p40.io');
    INSERT INTO public.profiles(id,tenant_id,full_name,role)
      VALUES(v_uDev,v_t,'مطوّر بلا سجلّ موظف','developer');
    ASSERT NOT EXISTS (SELECT 1 FROM public.employees WHERE user_id=v_uDev),
      '3.8 تجهيز باطل: محفّز 0317 أنشأ سجلّ موظف للمطوّر';
    v_pass := v_pass + 1;

    PERFORM set_config('request.jwt.claim.sub', v_uDev::text, TRUE);
    ASSERT public.current_user_employee_id() IS NULL,
      '3.9 تجهيز باطل: current_user_employee_id ليست NULL للمطوّر';
    BEGIN
      PERFORM public.submit_permission_request('عادية', current_date+12, '10:00', '11:00', 'بلا سجلّ');
      RAISE EXCEPTION
        '3.9 ★★★ مستخدم بلا سجلّ موظف أنشأ طلب زمنية — سيُدرَج بـemployee_id NULL';
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      ASSERT v_msg LIKE 'PERM_NO_EMPLOYEE%',
        format('3.9 رُفض بسبب آخر لا انعدام السجلّ: %s', v_msg);
    WHEN not_null_violation THEN
      RAISE EXCEPTION
        '3.9 ★★★ الحارس غائب: وصل الإدراج إلى قيد NOT NULL بدل رسالة مفهومة';
    END;
    v_pass := v_pass + 1;
    PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  END;

  -- ★★ 'مغادرة' تُهمل وقت العودة حتى لو أُرسل
  DECLARE v_leave UUID;
  BEGIN
    SELECT out_permission_id INTO v_leave
      FROM public.submit_permission_request('مغادرة', current_date+3, '14:00', '16:00', 'مغادرة');
    ASSERT (SELECT expected_return_time FROM public.permissions_request WHERE id=v_leave) IS NULL,
      '3.7 ★★ مغادرة احتفظت بوقت عودة — خروج بلا رجوع بالتعريف';
    PERFORM public.cancel_permission_request(v_leave, NULL);
  END;
  v_pass := v_pass + 1;

  -- ═══ ④ الفحوص المسبقة ════════════════════════════════════════════════
  BEGIN
    PERFORM public.submit_permission_request('نوع_مخترع', current_date+4, '10:00', '11:00', 'خطأ');
    RAISE EXCEPTION '4.1 ★ نوع غير معروف قُبِل في البوّابة';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'PERM_BAD_TYPE%', format('4.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.submit_permission_request('عادية', current_date-500, '10:00', '11:00', 'ماضٍ');
    RAISE EXCEPTION '4.2 ★ زمنية قبل 500 يوم قُبِلت';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'PERM_TOO_OLD%', format('4.2 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.submit_permission_request('عادية', current_date+5, '16:00', '09:00', 'مقلوب');
    RAISE EXCEPTION '4.3 ★ عودة قبل خروج قُبِلت في البوّابة';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'PERM_BAD_TIMES%', format('4.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ تسوية بيومين للخلف مسموحة (وإلا كان الحدّ صارماً)
  DECLARE v_back UUID;
  BEGIN
    SELECT out_permission_id INTO v_back
      FROM public.submit_permission_request('عادية', current_date-2, '10:00', '11:00', 'رجعي');
    ASSERT v_back IS NOT NULL, '4.4 ★ تسوية بيومين للخلف رُفضت — الحدّ صارم زيادة';
    PERFORM public.cancel_permission_request(v_back, NULL);
  END;
  v_pass := v_pass + 1;

  -- ★★ سقف 0339 اليومي ما زال يعمل (لا انحدار)
  PERFORM public.submit_permission_request('عادية', current_date+6, '08:00', '09:00', 'س1');
  PERFORM public.submit_permission_request('عادية', current_date+6, '10:00', '11:00', 'س2');
  PERFORM public.submit_permission_request('عادية', current_date+6, '12:00', '13:00', 'س3');
  BEGIN
    PERFORM public.submit_permission_request('عادية', current_date+6, '14:00', '15:00', 'س4');
    RAISE EXCEPTION '4.5 ★★ الرابعة قُبِلت — سقف 0339 انكسر';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'PERMISSION_DAILY_CAP%', format('4.5 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★★★ أثر القرار: approved_by · reviewed_at ═════════════════════
  ASSERT (SELECT approved_by FROM public.permissions_request WHERE id=v_id) IS NULL,
    '5.0 تجهيز باطل: approved_by مملوء قبل القرار';
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
  v_fin := public.decide_hr_approval_step(v_req,'approved','موافقة المشرفة');
  ASSERT v_fin = 'pending', format('5.1 قرار المشرفة أعطى %s (متوقَّع pending)', v_fin);
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_uMgr::text, TRUE);
  v_fin := public.decide_hr_approval_step(v_req,'approved','موافقة المدير');
  ASSERT v_fin = 'approved', format('5.2 قرار المدير أعطى %s', v_fin);
  v_pass := v_pass + 1;

  SELECT status, approved_by, reviewed_at INTO v_st, v_uid, v_ts
    FROM public.permissions_request WHERE id=v_id;
  ASSERT v_st = 'موافق', format('5.3 الحالة = %s بعد اكتمال السلسلة', v_st);
  v_pass := v_pass + 1;

  ASSERT v_uid IS NOT NULL,
    '5.4 ★★★ approved_by ما زال NULL بعد الاعتماد — لا أثر تدقيقي';
  v_pass := v_pass + 1;

  -- ★★ وهو **المُعتمِد الأخير** لا الأول
  ASSERT v_uid = v_uMgr,
    format('5.5 ★★ approved_by = %s (متوقَّع المدير %s — آخر من قرّر)', v_uid, v_uMgr);
  v_pass := v_pass + 1;

  ASSERT v_ts IS NOT NULL,
    '5.6 ★★ reviewed_at ما زال NULL بعد الاعتماد';
  v_pass := v_pass + 1;

  -- ★★ approved_by يشير إلى profiles لا employees (عائلة عطل 0335)
  ASSERT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_uid),
    '5.7 ★★★ approved_by ليس profiles.id — سيكسر FK';
  ASSERT NOT EXISTS (SELECT 1 FROM public.employees WHERE id=v_uid),
    '5.8 ★★★ approved_by = employees.id — نفس عطل 0339 ①';
  v_pass := v_pass + 2;

  -- ═══ ⑥ ★★★ التنفيذ: جدول permissions كان فارغاً دائماً ═══════════════
  SELECT count(*) INTO v_n FROM public.permissions
   WHERE tenant_id=v_t AND employee_id=v_eEmp AND date=current_date+2;
  ASSERT v_n = 1,
    format('6.1 ★★★ صفوف permissions = %s بعد اعتماد الزمنية (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ البيانات منقولة صحيحةً
  SELECT permission_type, expected_out_time::TEXT, approved_by INTO v_txt, v_msg, v_uid
    FROM public.permissions WHERE tenant_id=v_t AND date=current_date+2;
  ASSERT v_txt = 'عادية', format('6.2 النوع المنقول = %s', v_txt);
  ASSERT v_msg LIKE '10:00%', format('6.3 وقت الخروج المنقول = %s', v_msg);
  ASSERT v_uid = v_uMgr, '6.4 المُعتمِد لم يُنقل إلى permissions';
  v_pass := v_pass + 3;

  -- ★★ لا تكرار: قرار ثانٍ لا يُنشئ صفّاً ثانياً
  PERFORM public.sync_hr_source_status(v_req, 'approved');
  SELECT count(*) INTO v_n FROM public.permissions
   WHERE tenant_id=v_t AND employee_id=v_eEmp AND date=current_date+2;
  ASSERT v_n = 1, format('6.5 ★★ تكرار التنفيذ: %s صفّاً', v_n);
  v_pass := v_pass + 1;

  -- ★★ الرفض لا يُنفّذ شيئاً
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  DECLARE v_rej UUID; v_rreq UUID;
  BEGIN
    SELECT out_permission_id, out_request_id INTO v_rej, v_rreq
      FROM public.submit_permission_request('عادية', current_date+7, '10:00', '11:00', 'سيُرفض');
    PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
    v_fin := public.decide_hr_approval_step(v_rreq,'rejected','لا');
    ASSERT v_fin = 'rejected', format('6.6 الرفض أعطى %s', v_fin);
    SELECT count(*) INTO v_n FROM public.permissions
     WHERE tenant_id=v_t AND date=current_date+7;
    ASSERT v_n = 0, format('6.7 ★★ الرفض نفّذ الزمنية: %s صفّاً', v_n);
    ASSERT (SELECT status FROM public.permissions_request WHERE id=v_rej) = 'مرفوض',
      '6.8 حالة المرفوض غير صحيحة';
    ASSERT (SELECT approved_by FROM public.permissions_request WHERE id=v_rej) = v_uSup,
      '6.9 ★ الرافض لم يُسجَّل في approved_by';
  END;
  v_pass := v_pass + 4;

  -- ★★★ لا انحدار في الإجازات: 0339 ما زالت تعمل بعد إعادة بناء الدالة
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  DECLARE v_lv UUID; v_lreq UUID;
  BEGIN
    INSERT INTO public.leave_balance(tenant_id,employee_id,year,annual_total)
      VALUES(v_t,v_eEmp,EXTRACT(YEAR FROM current_date)::INT,21),
            (v_t,v_eEmp,EXTRACT(YEAR FROM current_date)::INT+1,21)
      ON CONFLICT DO NOTHING;
    SELECT out_leave_id, out_request_id INTO v_lv, v_lreq
      FROM public.submit_leave_request('سنوية', current_date+60, current_date+62, 'اختبار عدم الانحدار');
    PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
    PERFORM public.decide_hr_approval_step(v_lreq,'approved',NULL);
    PERFORM set_config('request.jwt.claim.sub', v_uMgr::text, TRUE);
    PERFORM public.decide_hr_approval_step(v_lreq,'approved',NULL);
    ASSERT (SELECT status FROM public.leaves WHERE id=v_lv) = 'موافق',
      '6.10 ★★★ انحدار: مزامنة الإجازات انكسرت بعد إعادة بناء sync_hr_source_status';
    ASSERT (SELECT approved_by FROM public.leaves WHERE id=v_lv) = v_uMgr,
      '6.11 ★ الإجازة: approved_by لم يُملأ (إضافة 0340)';
    ASSERT (SELECT sum(annual_used) FROM public.leave_balance WHERE employee_id=v_eEmp) > 0,
      '6.12 ★★★ انحدار: رصيد الإجازات لم يُخصم';
  END;
  v_pass := v_pass + 3;

  -- ═══ ⑦ الإلغاء ════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  DECLARE v_c UUID; v_creq UUID;
  BEGIN
    SELECT out_permission_id, out_request_id INTO v_c, v_creq
      FROM public.submit_permission_request('تعويضية', current_date+8, '09:00', '10:00', 'سيُلغى');
    v_ok := public.cancel_permission_request(v_c, 'تغيّرت ظروفي');
    ASSERT v_ok, '7.1 cancel_permission_request أعادت FALSE';
    ASSERT (SELECT status FROM public.permissions_request WHERE id=v_c) = 'ملغى',
      '7.2 الحالة بعد الإلغاء ليست ''ملغى''';
    -- ★ الطلب باقٍ للتدقيق — لا حذف
    ASSERT EXISTS (SELECT 1 FROM public.permissions_request WHERE id=v_c),
      '7.3 ★ الطلب اختفى — الإلغاء صار حذفاً';
    SELECT count(*) INTO v_n FROM public.hr_approval_steps
     WHERE request_id=v_creq AND status IN ('active','pending');
    ASSERT v_n = 0, format('7.4 %s خطوة حيّة بعد الإلغاء', v_n);
    -- ★ إلغاء ثانٍ يُعيد FALSE لا خطأ
    ASSERT public.cancel_permission_request(v_c, NULL) = FALSE,
      '7.5 إلغاء المُلغى لم يُعِد FALSE';
  END;
  v_pass := v_pass + 5;

  -- ★★★ الملكية: زميل في **نفس المستأجر** بلا صفة staff
  --   (المستأجر الآخر يصدّه tenant_id ضمناً — الدرس المتكرر)
  DECLARE v_own UUID;
  BEGIN
    SELECT out_permission_id INTO v_own
      FROM public.submit_permission_request('عادية', current_date+9, '10:00', '11:00', 'ملك سعد');
    PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
    ASSERT NOT public.current_user_is_staff(),
      '7.6 تجهيز باطل: المشرفة صارت staff فلا يقيس الاختبار الملكية';
    BEGIN
      PERFORM public.cancel_permission_request(v_own, 'أنا المشرفة');
      RAISE EXCEPTION '7.6 ★★★ زميل في نفس المستأجر ألغى طلب غيره';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    v_pass := v_pass + 1;

    -- ★ وصاحبُه يلغيه فعلاً
    PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
    ASSERT public.cancel_permission_request(v_own, NULL),
      '7.7 ★ صاحب الطلب مُنع من إلغاء طلبه';
    v_pass := v_pass + 1;
  END;

  -- ═══ ⑧ permission_requests_view ══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  SELECT count(*) INTO v_n FROM public.permission_requests_view('mine', NULL, 200, 0)
   WHERE out_employee_id <> v_eEmp;
  ASSERT v_n = 0, format('8.1 ★★★ نطاق mine سرّب %s صفّاً لغير صاحبه', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.permission_requests_view('mine', NULL, 200, 0)
   WHERE out_can_decide;
  ASSERT v_n = 0, format('8.2 ★★★ can_decide=TRUE في %s من طلبات الموظف نفسه', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.permission_requests_view('mine', NULL, 200, 0)
   WHERE out_employee_name IN ('—','');
  ASSERT v_n = 0, format('8.3 ★★ %s صفّاً بلا اسم', v_n);
  v_pass := v_pass + 1;

  -- ★★★ الاسم المعروض يتبع مصدره الحيّ.
  --   ★ تأكيد **موجب** لا سلبي: `NOT LIKE '%الاسم القديم%'` يمرّ لأي قيمة
  --     أخرى — بما فيها employees.first_name المتجمّد إن صادف اختلافه.
  --     نطالب بالقيمة الجديدة **بعينها**.
  UPDATE public.profiles SET full_name='سعد بعد التغيير' WHERE id=v_uEmp;
  ASSERT btrim((SELECT first_name||' '||last_name FROM public.employees WHERE id=v_eEmp))
         <> 'سعد بعد التغيير',
    '8.4a تجهيز باطل: employees تبع profiles — لا تباعد يُقاس';
  SELECT out_employee_name INTO v_txt
    FROM public.permission_requests_view('mine', NULL, 1, 0);
  ASSERT v_txt = 'سعد بعد التغيير',
    format('8.4 ★★★ الاسم المعروض ''%s'' ليس القيمة الحيّة في profiles '
           '(''سعد بعد التغيير'') — يأتي من النصّ المخزَّن أو employees المتجمّد',
           v_txt);
  v_pass := v_pass + 2;

  -- ★ علَم التنفيذ
  SELECT count(*) INTO v_n FROM public.permission_requests_view('mine', 'موافق', 200, 0)
   WHERE NOT out_executed;
  ASSERT v_n = 0, format('8.5 ★★ %s زمنية معتمَدة غير منفَّذة', v_n);
  v_pass := v_pass + 1;

  -- ★ صندوق المشرفة
  DECLARE v_box UUID;
  BEGIN
    SELECT out_permission_id INTO v_box
      FROM public.submit_permission_request('عادية', current_date+11, '10:00', '11:00', 'لصندوق المشرفة');
    PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
    SELECT count(*) INTO v_n FROM public.permission_requests_view('inbox', NULL, 200, 0)
     WHERE out_id = v_box;
    ASSERT v_n = 1, format('8.6 صندوق المشرفة لا يحوي الطلب (%s)', v_n);
    v_pass := v_pass + 1;

    SELECT count(*) INTO v_n FROM public.permission_requests_view('inbox', NULL, 200, 0)
     WHERE NOT out_can_decide;
    ASSERT v_n = 0, format('8.7 ★ %s صفّاً في الصندوق بلا صلاحية قرار', v_n);
    v_pass := v_pass + 1;

    -- ★★★ المدير لا يرى ما خطوته pending بعد
    PERFORM set_config('request.jwt.claim.sub', v_uMgr::text, TRUE);
    SELECT count(*) INTO v_n FROM public.permission_requests_view('inbox', NULL, 200, 0)
     WHERE out_id = v_box;
    ASSERT v_n = 0, '8.8 ★★★ المدير يرى في صندوقه طلباً دورُه لم يحن';
    v_pass := v_pass + 1;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  SELECT count(*) INTO v_n FROM public.permission_requests_view('mine', 'ملغى', 200, 0)
   WHERE out_status <> 'ملغى';
  ASSERT v_n = 0, format('8.9 ترشيح الحالة سرّب %s صفّاً', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT count(*) FROM public.permission_requests_view('mine', NULL, 1, 0)) = 1,
    '8.10 p_limit لا يُطبَّق';
  v_pass := v_pass + 1;

  -- ═══ ⑨ ★★★ عزل المستأجرين ════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uB::text, TRUE);
  DECLARE v_pb UUID;
  BEGIN
    -- نفس اليوم ونفس الوقت تماماً — لا تصادم عبر المستأجرين
    SELECT out_permission_id INTO v_pb
      FROM public.submit_permission_request('عادية', current_date+2, '10:00', '12:00', 'زمنية ب');
    ASSERT v_pb IS NOT NULL,
      '9.1 ★★★ طلب موظف ب اصطدم بطلب المستأجر أ';
    v_pass := v_pass + 1;

    -- قسم ب بلا رؤساء ⇒ اعتماد تلقائي (0339) ⇒ يُنفَّذ فوراً
    ASSERT (SELECT status FROM public.permissions_request WHERE id=v_pb) = 'موافق',
      '9.2 ★★ قسم ب بلا رؤساء: لم يُعتمد تلقائياً ولم يُزامَن';
    v_pass := v_pass + 1;

    SELECT count(*) INTO v_n FROM public.permissions WHERE tenant_id=v_tb;
    ASSERT v_n = 1, format('9.3 ★★ تنفيذ ب = %s (متوقَّع 1)', v_n);
    v_pass := v_pass + 1;

    -- ★★★ ولا يرى شيئاً من المستأجر أ
    SELECT count(*) INTO v_n FROM public.permission_requests_view('mine', NULL, 200, 0)
     WHERE out_employee_id <> v_eB;
    ASSERT v_n = 0, format('9.4 ★★★ موظف ب رأى %s صفّاً من مستأجر آخر', v_n);
    v_pass := v_pass + 1;

    -- ★★ تنفيذ أ لم يُحسب على ب
    SELECT count(*) INTO v_n FROM public.permissions WHERE tenant_id=v_t;
    ASSERT v_n >= 1, '9.5 تنفيذ أ اختفى';
    v_pass := v_pass + 1;
  END;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '  verify-permission-integrity-0340 — % تأكيداً ناجحاً', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0340';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_VERIFY_0340' THEN RAISE; END IF;
END $$;
