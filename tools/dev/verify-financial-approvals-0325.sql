-- ============================================================================
-- verify-financial-approvals-0325.sql
--
-- سلسلة اعتماد الطلبات المالية للموظف: المصروفات والسلف.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**
-- لا سياسات RLS. لا نَدَّعي هنا ما لا نقيسه.
--
-- كل تأكيد ★ سقط فعلاً قبل 0325 (موثَّق في docs/BUGFIX_0325_*.md).
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_d     UUID := gen_random_uuid();
  v_sup   UUID := gen_random_uuid();
  v_mgr   UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_hr    UUID := gen_random_uuid();
  v_eid   UUID;
  v_ex    UUID := gen_random_uuid();
  v_ex2   UUID := gen_random_uuid();
  v_ln    UUID := gen_random_uuid();
  v_orph  UUID := gen_random_uuid();
  v_rid   UUID;
  v_rid2  UUID;
  v_rl    UUID;
  v_ro    UUID;
  v_n     INT;
  v_txt   TEXT;
  v_num   NUMERIC;
  v_dt    DATE;
  v_ok    BOOLEAN;
  v_pass  INT := 0;
BEGIN
  -- ═══ تهيئة ═══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'FA','مالي أ','fa-'||substr(v_t::text ,1,8)),
    (v_tb,'FB','مالي ب','fb-'||substr(v_tb::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'العمليات');
  INSERT INTO auth.users(id,email) VALUES
    (v_sup,'s-'||substr(v_sup::text,1,8)||'@fa.io'),
    (v_mgr,'g-'||substr(v_mgr::text,1,8)||'@fa.io'),
    (v_emp,'e-'||substr(v_emp::text,1,8)||'@fa.io'),
    (v_hr ,'h-'||substr(v_hr::text ,1,8)||'@fa.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_sup,v_t,'المشرف','supervisor'),
    (v_mgr,v_t,'المدير','manager'),
    (v_hr ,v_t,'موظف HR','hr');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department)
    VALUES (v_emp,v_t,'الموظف','employee','العمليات');
  UPDATE public.departments SET supervisor_id=v_sup, manager_id=v_mgr WHERE id=v_d;
  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id=v_emp;

  -- ═══ ① البنية ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('create_financial_request_approval','record_financial_rejection_reason');
  ASSERT v_n = 2, format('1.1 دوال 0325 = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ VOLATILE: الكتابة مستحيلة في STABLE (درس 0320)
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='create_financial_request_approval') = 'v',
    '1.2 ★ create_financial_request_approval ليست VOLATILE';
  v_pass := v_pass + 1;

  -- ★ نوع الطلب المالي مسموح (كان القيد leave/permission فقط)
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='hr_approval_requests_request_type_check'
       AND pg_get_constraintdef(oid) LIKE '%expense%'
       AND pg_get_constraintdef(oid) LIKE '%loan%'
  ), '1.3 ★ قيد request_type لا يقبل expense/loan';
  v_pass := v_pass + 1;

  -- عمود المبلغ موجود (تحتاجه قواعد min/max)
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hr_approval_requests' AND column_name='amount'),
    '1.4 عمود amount مفقود';
  v_pass := v_pass + 1;

  -- ★ حارس التجاوز مُعلَّق على الجدولين الماليين
  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE t.tgname='trg_guard_status_bypass' AND NOT t.tgisinternal
     AND c.relname IN ('expense_requests','employee_loans');
  ASSERT v_n = 2, format('1.5 ★ حارس التجاوز على الجدولين = %s', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② توحيد مفردات الحالة — عطل ④ ═══════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='expense_requests_status_chk'),
    '2.1 قيد حالة المصروفات مفقود';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_loans_status_chk'),
    '2.2 قيد حالة السلف مفقود';
  v_pass := v_pass + 2;

  -- ★ المفردة العربية لم تعد تُقبل: كانت تُخزَّن ولا تطابق فلاتر الواجهة
  v_ok := TRUE;
  BEGIN
    INSERT INTO public.expense_requests(tenant_id,employee_id,title,description,amount,status)
      VALUES (v_t,v_eid,'x','y',10,'موافق');
    v_ok := FALSE;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '2.3 ★ حالة عربية قُبلت — تعارض مفردات مع فلاتر الواجهة';
  v_pass := v_pass + 1;

  -- ═══ ③ ★ تدرّج المبلغ (approval_rules) — جوهر الجولة ══════════════════
  INSERT INTO public.approval_rules
    (tenant_id,unit_key,rule_name,min_amount,max_amount,level,required_role,is_active)
  VALUES
    (v_t,'finance','صغير — مشرف',0,1000,1,'supervisor',true),
    (v_t,'finance','كبير — مشرف',1000.01,999999,1,'supervisor',true),
    (v_t,'finance','كبير — مدير',1000.01,999999,2,'manager',true);

  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);

  -- مبلغ صغير ⇒ مستوى واحد
  INSERT INTO public.expense_requests(id,tenant_id,employee_id,title,description,amount,status)
    VALUES (v_ex,v_t,v_eid,'سفر قصير','مهمة',500,'pending');
  SELECT public.create_financial_request_approval('expense', v_ex, v_eid, 500) INTO v_rid;

  SELECT count(*) INTO v_n FROM public.hr_approval_steps WHERE request_id=v_rid;
  ASSERT v_n = 1, format('3.1 ★ مبلغ 500 بنى %s خطوة (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- مبلغ كبير ⇒ مستويان
  INSERT INTO public.expense_requests(id,tenant_id,employee_id,title,description,amount,status)
    VALUES (v_ex2,v_t,v_eid,'سفر طويل','مهمة',5000,'pending');
  SELECT public.create_financial_request_approval('expense', v_ex2, v_eid, 5000) INTO v_rid2;

  SELECT count(*) INTO v_n FROM public.hr_approval_steps WHERE request_id=v_rid2;
  ASSERT v_n = 2,
    format('3.2 ★ مبلغ 5000 بنى %s خطوة — تدرّج المبلغ لا يعمل', v_n);
  v_pass := v_pass + 1;

  -- الترتيب صحيح: المشرف أولاً ثم المدير
  SELECT approver_role INTO v_txt FROM public.hr_approval_steps
   WHERE request_id=v_rid2 AND step_order=1;
  ASSERT v_txt = 'supervisor', format('3.3 أول معتمِد = %s', v_txt);
  SELECT approver_role INTO v_txt FROM public.hr_approval_steps
   WHERE request_id=v_rid2 AND step_order=2;
  ASSERT v_txt = 'manager', format('3.4 ثاني معتمِد = %s', v_txt);
  v_pass := v_pass + 2;

  -- خطوة واحدة نشطة فقط
  SELECT count(*) INTO v_n FROM public.hr_approval_steps
   WHERE request_id=v_rid2 AND status='active';
  ASSERT v_n = 1, format('3.5 خطوات نشطة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ④ ★ الظهور في العرض والصندوق — عطلا ⑤ و⑦ ════════════════════════
  SELECT count(*) INTO v_n FROM public.unified_approvals WHERE source_id=v_rid;
  ASSERT v_n = 1, format('4.1 ★ الطلب المالي غائب عن unified_approvals (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT source_module INTO v_txt FROM public.unified_approvals WHERE source_id=v_rid;
  ASSERT v_txt = 'employee_finance', format('4.2 الوحدة = %s', v_txt);
  v_pass := v_pass + 1;

  -- المبلغ يظهر (يحتاجه المعتمِد للقرار)
  SELECT amount INTO v_num FROM public.unified_approvals WHERE source_id=v_rid;
  ASSERT v_num = 500, format('4.3 ★ المبلغ في العرض = %s', COALESCE(v_num::TEXT,'NULL'));
  v_pass := v_pass + 1;

  -- ★ عطل ⑦: صاحب الخطوة النشطة يرى الطلب في صندوقه
  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox(NULL);
  ASSERT v_n = 2,
    format('4.4 ★ صندوق المشرف = %s — وحدة hr_approval_steps مثبَّتة على hr', v_n);
  v_pass := v_pass + 1;

  -- والمدير (خطوته pending) لا يرى شيئاً بعد
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox(NULL);
  ASSERT v_n = 0, format('4.5 صاحب خطوة pending يرى الطلب (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★ حارس التجاوز على المصروفات ══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_hr::TEXT, TRUE);
  v_ok := TRUE;
  BEGIN
    UPDATE public.expense_requests SET status='approved' WHERE id=v_ex;
    v_ok := FALSE;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '5.1 ★ دور hr تجاوز سلسلة اعتماد المصروف';
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.expense_requests WHERE id=v_ex;
  ASSERT v_txt = 'pending', format('5.2 ★ الحالة تغيّرت رغم الرفض: %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑥ المسار الشرعي ═════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  SELECT public.unified_approval_decide('employee_finance', v_rid, 'approved', 'موافق المشرف')
    INTO v_txt;
  ASSERT v_txt = 'approved',
    format('6.1 ★ مستوى واحد لم يكتمل بقرار واحد (%s)', v_txt);
  v_pass := v_pass + 1;

  -- ★ الجدول الأصلي تزامن
  SELECT status INTO v_txt FROM public.expense_requests WHERE id=v_ex;
  ASSERT v_txt = 'approved',
    format('6.2 ★ expense_requests.status = «%s» بعد الاعتماد', v_txt);
  v_pass := v_pass + 1;

  ASSERT (SELECT approved_at FROM public.expense_requests WHERE id=v_ex) IS NOT NULL,
    '6.3 approved_at لم يُضبَط';
  v_pass := v_pass + 1;

  -- مُقدّم الطلب أُشعِر
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_t AND user_id=v_emp AND type='approval_granted';
  ASSERT v_n >= 1, format('6.4 ★ مُقدّم الطلب لم يُشعَر بالاعتماد (%s)', v_n);
  v_pass := v_pass + 1;

  -- المبلغ يظهر في نص الإشعار (المعتمِد يحتاجه)
  SELECT title INTO v_txt FROM public.notifications
   WHERE tenant_id=v_t AND type='approval_pending' LIMIT 1;
  ASSERT v_txt IS NOT NULL, '6.5 إشعار بلا عنوان';
  v_pass := v_pass + 1;

  -- ═══ ⑦ الرفض مع السبب — عطل ① ════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  PERFORM public.unified_approval_decide('employee_finance', v_rid2, 'rejected', 'المبلغ مرتفع');
  SELECT public.record_financial_rejection_reason(v_rid2, 'المبلغ مرتفع') INTO v_n;
  ASSERT v_n = 1, format('7.1 تسجيل سبب الرفض أعاد %s', v_n);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.expense_requests WHERE id=v_ex2;
  ASSERT v_txt = 'rejected', format('7.2 حالة المصروف بعد الرفض = %s', v_txt);
  v_pass := v_pass + 1;

  -- ★ السبب في عموده الصحيح لا في approved_by (UUID)
  SELECT rejection_reason INTO v_txt FROM public.expense_requests WHERE id=v_ex2;
  ASSERT v_txt = 'المبلغ مرتفع',
    format('7.3 ★ سبب الرفض = «%s» — كان يُكتب في عمود UUID', COALESCE(v_txt,'NULL'));
  v_pass := v_pass + 1;

  -- الرفض يُنهي السلسلة: المدير لم يُزعج
  SELECT count(*) INTO v_n FROM public.hr_approval_steps
   WHERE request_id=v_rid2 AND status IN ('pending','active');
  ASSERT v_n = 0, format('7.4 بقيت %s خطوة مفتوحة بعد الرفض', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑧ ★ السلفة: end_date و remaining_amount — عطل ⑥ ═════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.employee_loans
    (id,tenant_id,employee_id,amount,months_count,monthly_installment,start_date,purpose,status)
    VALUES (v_ln,v_t,v_eid,3000,6,500,'2026-09-01','ظرف عائلي','pending');
  SELECT public.create_financial_request_approval('loan', v_ln, v_eid, 3000) INTO v_rl;

  SELECT count(*) INTO v_n FROM public.hr_approval_steps WHERE request_id=v_rl;
  ASSERT v_n = 2, format('8.1 سلسلة السلفة = %s خطوة (3000 ⇒ مستويان)', v_n);
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_sup::TEXT, TRUE);
  PERFORM public.unified_approval_decide('employee_finance', v_rl, 'approved', 'ok');
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT public.unified_approval_decide('employee_finance', v_rl, 'approved', 'ok') INTO v_txt;
  ASSERT v_txt = 'approved', format('8.2 السلفة لم تُعتمَد (%s)', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.employee_loans WHERE id=v_ln;
  ASSERT v_txt = 'approved', format('8.3 ★ حالة السلفة = %s', v_txt);
  v_pass := v_pass + 1;

  -- ★ end_date محسوبة في القاعدة (الصفحة كانت تحسبها وتُهملها)
  SELECT end_date INTO v_dt FROM public.employee_loans WHERE id=v_ln;
  ASSERT v_dt = DATE '2027-03-01',
    format('8.4 ★ end_date = %s (متوقَّع 2027-03-01 = بداية + 6 أشهر)',
           COALESCE(v_dt::TEXT,'NULL'));
  v_pass := v_pass + 1;

  -- ★ remaining_amount = amount عند الاعتماد (كان 0 دائماً)
  SELECT remaining_amount INTO v_num FROM public.employee_loans WHERE id=v_ln;
  ASSERT v_num = 3000,
    format('8.5 ★ remaining_amount = %s (متوقَّع 3000)', v_num);
  v_pass := v_pass + 1;

  -- ═══ ⑨ ★ لا اعتماد تلقائي بلا معتمِد — هذا مالٌ ═══════════════════════
  --    في HR الاعتماد التلقائي مقبول لإجازة بلا مدير. هنا غير مقبول.
  UPDATE public.departments
     SET supervisor_id=NULL, manager_id=NULL, direct_manager_id=NULL WHERE id=v_d;
  DELETE FROM public.approval_rules WHERE tenant_id=v_t;

  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.expense_requests(id,tenant_id,employee_id,title,description,amount,status)
    VALUES (v_orph,v_t,v_eid,'يتيم','وصف',200,'pending');
  SELECT public.create_financial_request_approval('expense', v_orph, v_eid, 200) INTO v_ro;

  SELECT status INTO v_txt FROM public.hr_approval_requests WHERE id=v_ro;
  ASSERT v_txt = 'pending',
    format('9.1 ★ طلب مالي اعتُمد تلقائياً بلا معتمِد (%s) — صرف بلا رقابة', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.expense_requests WHERE id=v_orph;
  ASSERT v_txt = 'pending', format('9.2 ★ المصروف اعتُمد تلقائياً (%s)', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑩ الحالات الحدّية ════════════════════════════════════════════════
  v_ok := TRUE;
  BEGIN
    PERFORM public.create_financial_request_approval('bonus', v_ex, v_eid, 100);
    v_ok := FALSE;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '10.1 نوع طلب غير مدعوم قُبل';
  v_pass := v_pass + 1;

  v_ok := TRUE;
  BEGIN
    PERFORM public.create_financial_request_approval('expense', NULL, v_eid, 100);
    v_ok := FALSE;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '10.2 مرجع فارغ قُبل';
  v_pass := v_pass + 1;

  ASSERT public.record_financial_rejection_reason(NULL,'س') = 0, '10.3 معرّف فارغ';
  ASSERT public.record_financial_rejection_reason(v_ro,'') = 0, '10.4 سبب فارغ';
  ASSERT public.record_financial_rejection_reason(gen_random_uuid(),'س') = 0,
    '10.5 طلب غير موجود';
  v_pass := v_pass + 3;

  -- ═══ ⑪ العزل بين المستأجرين ══════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.notifications WHERE tenant_id=v_tb;
  ASSERT v_n = 0, format('11.1 ★ تسرّب %s إشعاراً لشركة أخرى', v_n);
  SELECT count(*) INTO v_n FROM public.hr_approval_requests WHERE tenant_id=v_tb;
  ASSERT v_n = 0, format('11.2 ★ تسرّب %s طلباً لشركة أخرى', v_n);
  v_pass := v_pass + 2;

  -- ═══ ⑫ الصلاحيات ═════════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.create_financial_request_approval(text,uuid,uuid,numeric)','EXECUTE'),
    '12.1 anon يُنشئ طلبات مالية';
  ASSERT NOT has_function_privilege('anon',
    'public.record_financial_rejection_reason(uuid,text)','EXECUTE'),
    '12.2 anon يكتب أسباب الرفض';
  ASSERT has_function_privilege('authenticated',
    'public.create_financial_request_approval(text,uuid,uuid,numeric)','EXECUTE'),
    '12.3 المستخدم المُصادَق لا يستطيع الإنشاء';
  v_pass := v_pass + 3;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.notifications        WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.hr_approval_steps    WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_requests WHERE tenant_id = v_t;
  -- ★ 0363: محفّز trg_block_expense_delete يمنع الحذف ⇒ يُعطَّل للتنظيف
  ALTER TABLE public.expense_requests DISABLE TRIGGER trg_block_expense_delete;
  DELETE FROM public.expense_requests     WHERE tenant_id = v_t;
  ALTER TABLE public.expense_requests ENABLE TRIGGER trg_block_expense_delete;
  DELETE FROM public.employee_loans       WHERE tenant_id = v_t;
  DELETE FROM public.approval_rules       WHERE tenant_id = v_t;
  DELETE FROM public.employees            WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.profiles  WHERE id IN (v_sup,v_mgr,v_emp,v_hr);
  DELETE FROM auth.users       WHERE id IN (v_sup,v_mgr,v_emp,v_hr);
  DELETE FROM public.departments WHERE id = v_d;
  DELETE FROM public.tenants     WHERE id IN (v_t,v_tb);

  RAISE NOTICE '✅ verify-0325: %/46 تأكيداً ناجحاً', v_pass;
END $$;
