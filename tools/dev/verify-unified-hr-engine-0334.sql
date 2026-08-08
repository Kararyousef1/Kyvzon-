-- ============================================================================
-- verify-unified-hr-engine-0334.sql
--
-- توحيد محرّك الاعتماد: مرآة خطوات الموارد البشرية إلى المحرّك الموحّد.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**.
-- العزل عبر RLS الحقيقي في verify-unified-hr-engine-0334-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة:
--   hr_approval_steps: approver_role ∈ supervisor·manager·direct_manager
--     status ∈ pending·active·approved·rejected·skipped
--     UNIQUE (request_id, step_order) · **لا decided_by ولا rule_name**
--   unified_approval_steps: source_module ∈ hr·procurement·finance·
--     contracts·movement·inventory·mrp·crm·general
--     UNIQUE (tenant_id, source_module, source_id, step_order)
--   hr_approval_requests: request_type ∈ leave·permission·expense·loan
--   departments.manager_id → **profiles** لا employees
--   decide_hr_approval_step تقبل 'approved'/'rejected' لا 'approve'
--   ★ unified_approvals.source_id لطلبات HR = hr_approval_requests.id
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_mgr   UUID := gen_random_uuid();
  v_sup   UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_mgrb  UUID := gen_random_uuid();
  v_empb  UUID := gen_random_uuid();
  v_e     UUID;
  v_eb    UUID;
  v_d     UUID := gen_random_uuid();
  v_db    UUID := gen_random_uuid();
  v_lv    UUID;
  v_lv2   UUID;
  v_perm  UUID;
  v_req   UUID;
  v_req2  UUID;
  v_reqp  UUID;
  v_n     INT;
  v_txt   TEXT;
  v_bool  BOOLEAN;
  v_pass  INT := 0;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'UA','موحّد أ','u34a-'||substr(v_t::text ,1,8)),
    (v_tb,'UB','موحّد ب','u34b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_mgr ,'mgr-' ||substr(v_mgr::text ,1,8)||'@u34.io'),
    (v_sup ,'sup-' ||substr(v_sup::text ,1,8)||'@u34.io'),
    (v_emp ,'emp-' ||substr(v_emp::text ,1,8)||'@u34.io'),
    (v_mgrb,'mgrb-'||substr(v_mgrb::text,1,8)||'@u34.io'),
    (v_empb,'empb-'||substr(v_empb::text,1,8)||'@u34.io');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d ,v_t ,'التقنية'),
    (v_db,v_tb,'قسم ب');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
    (v_mgr ,v_t ,'المدير','manager','التقنية'),
    (v_sup ,v_t ,'المشرف','supervisor','التقنية'),
    (v_emp ,v_t ,'الموظف','employee','التقنية'),
    (v_mgrb,v_tb,'مدير ب','manager','قسم ب'),
    (v_empb,v_tb,'موظف ب','employee','قسم ب');
  -- ★ manager_id يشير إلى profiles لا employees
  UPDATE public.departments SET manager_id=v_mgr,  supervisor_id=v_sup WHERE id=v_d;
  UPDATE public.departments SET manager_id=v_mgrb                       WHERE id=v_db;
  -- ★ تحديث 0335: محفّز trg_ensure_employee_row (0317) أنشأ سجلّ
  --   الموظف تلقائياً عند إدراج الملف، والقيد الجديد
  --   uq_employee_per_user_tenant يمنع إدراج ثانٍ. نلتقط ما أنشأه
  --   المحفّز — وهذا ما يحدث في الإنتاج فعلاً.
  SELECT id INTO v_e  FROM public.employees WHERE user_id=v_emp  AND tenant_id=v_t;
  SELECT id INTO v_eb FROM public.employees WHERE user_id=v_empb AND tenant_id=v_tb;
  UPDATE public.employees SET department_id=v_d , employee_code='U34A' WHERE id=v_e;
  UPDATE public.employees SET department_id=v_db, employee_code='U34B' WHERE id=v_eb;
  ASSERT v_e IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّ الموظف — تجهيز الاختبار باطل';

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('mirror_hr_step_to_unified','tg_mirror_hr_step','approval_steps_for',
      'resolve_hr_approval_source','hr_approval_decide_any');
  ASSERT v_n = 5, format('1.1 دوال 0334 = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgname='trg_mirror_hr_step' AND NOT tgisinternal),
    '1.2 ★★ محفّز المرآة مفقود';
  v_pass := v_pass + 1;

  -- ★ المحفّز على INSERT **و** UPDATE: الخطوة تُنشأ ثم تُبتّ
  ASSERT (SELECT (tgtype & 4) > 0 AND (tgtype & 16) > 0 FROM pg_trigger
           WHERE tgname='trg_mirror_hr_step' AND NOT tgisinternal),
    '1.3 ★★ المحفّز ليس على INSERT وUPDATE معاً — تحوّل الحالة لا يُعكس';
  v_pass := v_pass + 1;

  -- ★ دوال الكتابة VOLATILE (درس 0320)
  FOR v_txt IN SELECT unnest(ARRAY['mirror_hr_step_to_unified','hr_approval_decide_any'])
  LOOP
    ASSERT (SELECT bool_and(p.provolatile = 'v') FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.4 ★ %s ليست VOLATILE — الكتابة مستحيلة في STABLE', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ تصحيح ذاتي: `approval_steps_for` **يجب** أن تبقى SECURITY DEFINER.
  --   هكذا عُرّفت في 0316 عن قصد: تقرأ profiles و unified_approvals
  --   لحساب صلاحية الرؤية، وحارسها الحقيقي هو can_view_approval_trail()
  --   لا RLS الجدول. كتبتُ التأكيد أولاً يطلب INVOKER فسقط — وكان
  --   التأكيد هو الخطأ لا الدالة.
  ASSERT (SELECT p.prosecdef FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='approval_steps_for'),
    '1.5a ★ approval_steps_for فقدت SECURITY DEFINER — حارس 0316 ينكسر';
  v_pass := v_pass + 1;

  -- ★★ ولأنها DEFINER فالحارس النصّي إلزامي
  ASSERT (SELECT pg_get_functiondef(p.oid) LIKE '%can_view_approval_trail%'
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='approval_steps_for'),
    '1.5b ★★ approval_steps_for بلا can_view_approval_trail — مكشوفة';
  v_pass := v_pass + 1;

  -- ★ الترجمة INVOKER: تحترم RLS جدول hr_approval_requests
  ASSERT (SELECT NOT p.prosecdef FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='resolve_hr_approval_source'),
    '1.5c ★★ resolve_hr_approval_source صارت DEFINER — تتجاوز RLS';
  v_pass := v_pass + 1;

  -- ★★ التوقيع محفوظ: UnifiedApprovalService.findSteps تقرأ عشرة أعمدة
  --   وحذف out_is_mine/out_is_current يكسر ApprovalTrail صامتاً.
  FOR v_txt IN SELECT unnest(ARRAY['out_step_order','out_required_role',
                                   'out_approver_id','out_approver_name',
                                   'out_status','out_comments','out_decided_at',
                                   'out_rule_name','out_is_mine','out_is_current'])
  LOOP
    ASSERT (SELECT pg_get_function_result(p.oid) LIKE '%'||v_txt||'%'
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='approval_steps_for'),
      format('1.5d ★★ العمود %s اختفى من approval_steps_for', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('mirror_hr_step_to_unified','approval_steps_for',
                            'resolve_hr_approval_source','hr_approval_decide_any')),
    '1.6 ★★ anon يملك EXECUTE على إحدى دوال 0334';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('idx_hr_steps_request_order','idx_hr_steps_approver_active',
     'idx_hr_requests_related','idx_unified_steps_source');
  ASSERT v_n = 4, format('1.7 فهارس 0334 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT indexdef LIKE '%WHERE%active%' FROM pg_indexes
           WHERE indexname='idx_hr_steps_approver_active'),
    '1.8 ★ فهرس الخطوة النشطة ليس جزئياً';
  v_pass := v_pass + 1;

  -- ═══ ② المرآة عند الإنشاء — العطل ③ ═══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);

  INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to)
    VALUES (v_t,v_e,'سنوية',current_date+7,current_date+9) RETURNING id INTO v_lv;
  SELECT public.create_hr_approval('leave', v_lv, v_e) INTO v_req;

  -- سلسلة القسم: مشرف ثم مدير
  SELECT count(*) INTO v_n FROM public.hr_approval_steps WHERE request_id=v_req;
  ASSERT v_n = 2, format('2.1 خطوات hr = %s (متوقَّع 2: مشرف ومدير)', v_n);
  v_pass := v_pass + 1;

  -- ★★ العطل ③: كانت صفراً
  SELECT count(*) INTO v_n FROM public.unified_approval_steps
   WHERE source_id=v_req AND source_module='hr';
  ASSERT v_n = 2,
    format('2.2 ★★ المرآة في المحرّك الموحّد = %s (متوقَّع 2؛ كانت 0)', v_n);
  v_pass := v_pass + 1;

  -- ★ source_id هو request_id لا related_id — وإلا مرجعان لطلب واحد
  SELECT count(*) INTO v_n FROM public.unified_approval_steps WHERE source_id=v_lv;
  ASSERT v_n = 0,
    '2.3 ★★ المرآة استعملت related_id — يخالف unified_approvals.source_id';
  v_pass := v_pass + 1;

  -- ★ الحالة الأولية منقولة بدقّة: الأولى active والثانية pending
  SELECT status INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=1;
  ASSERT v_txt = 'active', format('2.4 ★ حالة الخطوة الأولى = %L (متوقَّع active)', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=2;
  ASSERT v_txt = 'pending', format('2.5 حالة الخطوة الثانية = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ المعتمِد منقول
  SELECT approver_id INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=1;
  ASSERT v_txt::UUID = v_sup, '2.6 ★ معتمِد الخطوة الأولى ليس المشرف';
  v_pass := v_pass + 1;

  -- ★ الدور منقول: approver_role → required_role
  SELECT required_role INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=1;
  ASSERT v_txt = 'supervisor', format('2.7 الدور المنقول = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ rule_name يُميّز الصفوف المعكوسة
  SELECT rule_name INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=1;
  ASSERT v_txt = 'مرآة سلسلة الموارد البشرية',
    format('2.8 rule_name = %L', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ③ سجل التتبّع — العطل ① ══════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.approval_steps_for('hr', v_req);
  ASSERT v_n = 2,
    format('3.1 ★★ سجل التتبّع بـrequest_id = %s (متوقَّع 2؛ كان 0)', v_n);
  v_pass := v_pass + 1;

  -- ★★ الترجمة: الواجهة قد تملك معرّف الإجازة لا الطلب
  SELECT count(*) INTO v_n FROM public.approval_steps_for('hr', v_lv);
  ASSERT v_n = 2,
    format('3.2 ★★ سجل التتبّع بـleave_id = %s (متوقَّع 2) ⇒ الترجمة معطّلة', v_n);
  v_pass := v_pass + 1;

  -- ★ اسم المعتمِد يُحلّ لا UUID خام
  SELECT out_approver_name INTO v_txt FROM public.approval_steps_for('hr', v_req)
   WHERE out_step_order=1;
  ASSERT v_txt = 'المشرف', format('3.3 اسم المعتمِد = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ الترتيب تصاعدي
  ASSERT (SELECT out_step_order FROM public.approval_steps_for('hr', v_req) LIMIT 1) = 1,
    '3.4 سجل التتبّع لا يبدأ بالخطوة الأولى';
  v_pass := v_pass + 1;

  -- ★★ لا تكرار: المرآة موجودة والاحتياط يُقصيها بـNOT EXISTS
  SELECT count(*) INTO v_n FROM public.approval_steps_for('hr', v_req);
  ASSERT v_n = 2,
    format('3.5 ★★ سجل التتبّع = %s ⇒ الفرعان يتكرّران (NOT EXISTS معطّل)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ④ ترجمة المعرّف ══════════════════════════════════════════════════
  SELECT out_request_id INTO v_txt FROM public.resolve_hr_approval_source(v_lv);
  ASSERT v_txt::UUID = v_req, '4.1 ★ الترجمة من معرّف الإجازة فشلت';
  v_pass := v_pass + 1;

  SELECT out_kind INTO v_txt FROM public.resolve_hr_approval_source(v_lv);
  ASSERT v_txt = 'source', format('4.2 نوع المعرّف = %L (متوقَّع source)', v_txt);
  v_pass := v_pass + 1;

  SELECT out_request_id INTO v_txt FROM public.resolve_hr_approval_source(v_req);
  ASSERT v_txt::UUID = v_req, '4.3 الترجمة من معرّف الطلب فشلت';
  v_pass := v_pass + 1;

  SELECT out_kind INTO v_txt FROM public.resolve_hr_approval_source(v_req);
  ASSERT v_txt = 'request', format('4.4 نوع المعرّف = %L (متوقَّع request)', v_txt);
  v_pass := v_pass + 1;

  SELECT out_module INTO v_txt FROM public.resolve_hr_approval_source(v_lv);
  ASSERT v_txt = 'hr', format('4.5 وحدة الإجازة = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ معرّف مجهول لا يُسقط الدالة
  SELECT count(*) INTO v_n FROM public.resolve_hr_approval_source(gen_random_uuid());
  ASSERT v_n = 0, format('4.6 معرّف مجهول أعاد %s صفاً', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ المرآة عند البتّ — تحوّل الحالة ═════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_sup::text, TRUE);
  PERFORM public.decide_hr_approval_step(v_req, 'approved', 'موافق المشرف');

  -- ★★ الحالة الجديدة انعكست
  SELECT status INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=1;
  ASSERT v_txt = 'approved',
    format('5.1 ★★ حالة الخطوة المعكوسة = %L (متوقَّع approved) ⇒ المحفّز لا يعمل على UPDATE', v_txt);
  v_pass := v_pass + 1;

  -- ★ الخطوة التالية صارت active وانعكست
  SELECT status INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=2;
  ASSERT v_txt = 'active',
    format('5.2 ★ الخطوة الثانية في المرآة = %L (متوقَّع active)', v_txt);
  v_pass := v_pass + 1;

  -- ★ التعليق منقول
  SELECT comments INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_req AND step_order=1;
  ASSERT v_txt = 'موافق المشرف', format('5.3 التعليق المنقول = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ وقت القرار منقول
  ASSERT (SELECT decided_at IS NOT NULL FROM public.unified_approval_steps
           WHERE source_id=v_req AND step_order=1),
    '5.4 ★ وقت القرار لم يُنقل إلى المرآة';
  v_pass := v_pass + 1;

  -- ★★ لا تكرار بعد التحديث: ON CONFLICT يُحدّث لا يُدرج
  SELECT count(*) INTO v_n FROM public.unified_approval_steps WHERE source_id=v_req;
  ASSERT v_n = 2,
    format('5.5 ★★ صفوف المرآة = %s بعد التحديث (متوقَّع 2) ⇒ ON CONFLICT معطّل', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑥ إكمال السلسلة ══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  PERFORM public.decide_hr_approval_step(v_req, 'approved', 'موافق المدير');

  SELECT status INTO v_txt FROM public.hr_approval_requests WHERE id=v_req;
  ASSERT v_txt = 'approved', format('6.1 حالة الطلب = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★★ 0323: مصدر الطلب يُزامَن
  SELECT status INTO v_txt FROM public.leaves WHERE id=v_lv;
  ASSERT v_txt = 'موافق',
    format('6.2 ★★ حالة الإجازة = %L (متوقَّع «موافق») ⇒ 0323 انكسر', v_txt);
  v_pass := v_pass + 1;

  -- ★ كل خطوات المرآة معتمَدة
  SELECT count(*) INTO v_n FROM public.unified_approval_steps
   WHERE source_id=v_req AND status='approved';
  ASSERT v_n = 2, format('6.3 ★ خطوات المرآة المعتمَدة = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ البتّ الموحّد بأيّ معرّف — العطل ② ══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to)
    VALUES (v_t,v_e,'مرضية',current_date+20,current_date+21) RETURNING id INTO v_lv2;
  SELECT public.create_hr_approval('leave', v_lv2, v_e) INTO v_req2;

  PERFORM set_config('request.jwt.claim.sub', v_sup::text, TRUE);

  -- ★★ بمعرّف الإجازة — كان يفشل بـAPPROVAL_NOT_FOUND_OR_DECIDED
  SELECT public.hr_approval_decide_any(v_lv2, 'approved', 'عبر معرّف المصدر') INTO v_txt;
  ASSERT v_txt = 'pending',
    format('7.1 ★★ البتّ بمعرّف الإجازة أعاد %L (متوقَّع pending: بقيت خطوة)', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.hr_approval_steps
   WHERE request_id=v_req2 AND step_order=1;
  ASSERT v_txt = 'approved', format('7.2 خطوة المشرف = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ بمعرّف الطلب أيضاً
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  SELECT public.hr_approval_decide_any(v_req2, 'approved', 'عبر معرّف الطلب') INTO v_txt;
  ASSERT v_txt = 'approved', format('7.3 ★ البتّ بمعرّف الطلب أعاد %L', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.leaves WHERE id=v_lv2;
  ASSERT v_txt = 'موافق', format('7.4 ★ الإجازة الثانية = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ قرار غير صالح يُرفض صراحةً
  BEGIN
    PERFORM public.hr_approval_decide_any(v_lv2, 'maybe', NULL);
    ASSERT FALSE, '7.5 ★ قرار «maybe» قُبل';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%INVALID_DECISION%',
      format('7.5 رسالة خطأ غير متوقَّعة: %s', SQLERRM);
  END;
  v_pass := v_pass + 1;

  -- ★ معرّف مجهول يُرفض صراحةً لا يمرّ صامتاً
  BEGIN
    PERFORM public.hr_approval_decide_any(gen_random_uuid(), 'approved', NULL);
    ASSERT FALSE, '7.6 ★★ معرّف مجهول قُبل';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%HR_APPROVAL_NOT_FOUND%',
      format('7.6 رسالة خطأ غير متوقَّعة: %s', SQLERRM);
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑧ الرفض ينعكس أيضاً ══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  INSERT INTO public.permissions_request
    (tenant_id,employee_id,date,expected_out_time,expected_return_time,reason)
    VALUES (v_t,v_e,current_date+3,'10:00','12:00','مراجعة طبية')
    RETURNING id INTO v_perm;
  SELECT public.create_hr_approval('permission', v_perm, v_e) INTO v_reqp;

  PERFORM set_config('request.jwt.claim.sub', v_sup::text, TRUE);
  PERFORM public.decide_hr_approval_step(v_reqp, 'rejected', 'غير مناسب');

  SELECT status INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_reqp AND step_order=1;
  ASSERT v_txt = 'rejected',
    format('8.1 ★★ الرفض في المرآة = %L (متوقَّع rejected)', v_txt);
  v_pass := v_pass + 1;

  -- ★★ الرفض يتخطّى بقية الخطوات — والمرآة تعكس التخطّي
  SELECT status INTO v_txt FROM public.unified_approval_steps
   WHERE source_id=v_reqp AND step_order=2;
  ASSERT v_txt = 'skipped',
    format('8.2 ★★ الخطوة الثانية بعد الرفض = %L (متوقَّع skipped)', v_txt);
  v_pass := v_pass + 1;

  SELECT status INTO v_txt FROM public.permissions_request WHERE id=v_perm;
  ASSERT v_txt = 'مرفوض', format('8.3 حالة الاستئذان = %L', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑨ عزل المستأجر ═══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_empb::text, TRUE);
  INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to)
    VALUES (v_tb,v_eb,'سنوية',current_date+5,current_date+6);

  -- ★★ تقني/موظف ب لا يترجم معرّفات شركة أ
  SELECT count(*) INTO v_n FROM public.resolve_hr_approval_source(v_lv);
  ASSERT v_n = 0,
    format('9.1 ★★ موظف شركة ب ترجم معرّف شركة أ (%s صف) — تسريب', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.approval_steps_for('hr', v_req);
  ASSERT v_n = 0,
    format('9.2 ★★ موظف شركة ب رأى %s خطوة من شركة أ', v_n);
  v_pass := v_pass + 1;

  -- ★ ولا يبتّ فيها
  BEGIN
    PERFORM public.hr_approval_decide_any(v_lv, 'approved', NULL);
    ASSERT FALSE, '9.3 ★★ موظف شركة ب بتّ في طلب شركة أ';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%HR_APPROVAL_NOT_FOUND%' OR SQLERRM LIKE '%not authorized%',
      format('9.3 رسالة غير متوقَّعة: %s', SQLERRM);
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑩ المستأجر المعدوم ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);

  SELECT count(*) INTO v_n FROM public.approval_steps_for('hr', v_req);
  ASSERT v_n = 0, format('10.1 ★ مستخدم بلا ملف رأى %s خطوة', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.resolve_hr_approval_source(v_lv);
  ASSERT v_n = 0, format('10.2 ★ مستخدم بلا ملف ترجم %s معرّفاً', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  verify-unified-hr-engine-0334: % تأكيداً — نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0334';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_VERIFY_0334' THEN
    RAISE NOTICE 'تراجع نظيف — لا أثر في القاعدة.';
  ELSE
    RAISE;
  END IF;
END $$;
