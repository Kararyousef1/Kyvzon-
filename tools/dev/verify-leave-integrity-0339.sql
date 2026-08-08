-- ============================================================================
-- verify-leave-integrity-0339.sql
--
-- نزاهة طلبات الإجازات والزمنيات: الرصيد · التداخل · تضارب المصالح ·
-- الأيتام · الإلغاء.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**.
-- العزل عبر RLS الحقيقي في verify-leave-integrity-0339-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة (من information_schema/pg_constraint لا من الذاكرة):
--   leaves: 13 عموداً · **لا employee_name** · approved_by → profiles(id)
--   leave_balance: annual_* numeric(6,3) · sick_* numeric(5,1)
--                  UNIQUE (tenant_id, employee_id, year)
--   hr_approval_requests.related_id بلا FK (متعدد الأشكال)
--   محفّز trg_ensure_employee_row (0317) يُنشئ سجلّ الموظف تلقائياً
--   قيد uq_employee_per_user_tenant (0335) يمنع سجلّاً ثانياً
--   ★ الدوال SECURITY DEFINER تقرأ الجلسة عبر current_user_employee_id()
--     ⇒ كل استدعاء يحتاج set_config('request.jwt.claim.sub', …)
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_uEmp  UUID := gen_random_uuid();
  v_uMgr  UUID := gen_random_uuid();
  v_uSup  UUID := gen_random_uuid();
  v_uB    UUID := gen_random_uuid();
  v_eEmp  UUID; v_eMgr UUID; v_eSup UUID; v_eB UUID;
  v_d     UUID := gen_random_uuid();
  v_dNone UUID := gen_random_uuid();
  v_dB    UUID := gen_random_uuid();
  v_year  INT  := EXTRACT(YEAR FROM current_date)::INT;
  v_lv    UUID; v_req UUID; v_st TEXT; v_n INT; v_num NUMERIC;
  v_days  INT; v_ok BOOLEAN; v_msg TEXT; v_fin TEXT;
  v_pass  INT := 0;
  r       RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'LA','إجازات أ','lv39a-'||substr(v_t::text ,1,8)),
    (v_tb,'LB','إجازات ب','lv39b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_uEmp,'e-'||substr(v_uEmp::text,1,8)||'@l39.io'),
    (v_uMgr,'m-'||substr(v_uMgr::text,1,8)||'@l39.io'),
    (v_uSup,'s-'||substr(v_uSup::text,1,8)||'@l39.io'),
    (v_uB  ,'b-'||substr(v_uB::text  ,1,8)||'@l39.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_uEmp,v_t ,'سعد الموظف','employee'),
    (v_uMgr,v_t ,'ليث المدير','manager'),
    (v_uSup,v_t ,'رنا المشرفة','supervisor'),
    (v_uB  ,v_tb,'موظف ب','employee');

  -- ★ المحفّز 0317 أنشأ سجلّات الموظفين — نلتقطها (0335 يمنع إدراجاً ثانياً)
  SELECT id INTO v_eEmp FROM public.employees WHERE user_id=v_uEmp AND tenant_id=v_t;
  SELECT id INTO v_eMgr FROM public.employees WHERE user_id=v_uMgr AND tenant_id=v_t;
  SELECT id INTO v_eSup FROM public.employees WHERE user_id=v_uSup AND tenant_id=v_t;
  SELECT id INTO v_eB   FROM public.employees WHERE user_id=v_uB   AND tenant_id=v_tb;
  ASSERT v_eEmp IS NOT NULL AND v_eMgr IS NOT NULL
     AND v_eSup IS NOT NULL AND v_eB IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّات الموظفين — تجهيز باطل';
  v_pass := v_pass + 1;

  INSERT INTO public.departments(id,tenant_id,name_ar,manager_id,supervisor_id) VALUES
    (v_d    ,v_t ,'قسم أ'        ,v_uMgr,v_uSup),
    (v_dNone,v_t ,'قسم بلا رؤساء',NULL  ,NULL  ),
    (v_dB   ,v_tb,'قسم ب'        ,NULL  ,NULL  );
  UPDATE public.employees SET department_id=v_d  WHERE id IN (v_eEmp,v_eMgr,v_eSup);
  UPDATE public.employees SET department_id=v_dB WHERE id=v_eB;

  -- ★ سنتان: بعض المدَيات تعبر رأس السنة (current_date+150 يقع في السنة
  --   التالية) وقيد leave_balance فريد على (tenant, employee, year).
  INSERT INTO public.leave_balance(tenant_id,employee_id,year,annual_total,sick_total)
    VALUES (v_t,v_eEmp,v_year,10,30),(v_t,v_eEmp,v_year+1,10,30);

  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('leave_working_days','leave_preview_working_days','leave_balance_bucket',
      'submit_leave_request','cancel_leave_request','leave_requests_view');
  ASSERT v_n = 6, format('1.1 دوال 0339 = %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;

  -- ★★ سياستا المعتمِد: بدونهما يرى المشرف/المدير صفر طلبات
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND policyname IN
     ('kyvzon_leaves_select_approver','kyvzon_permissions_request_select_approver');
  ASSERT v_n = 2,
    format('1.1b ★★★ سياسات المعتمِد = %s (متوقَّع 2) — شاشات المشرف فارغة', v_n);
  v_pass := v_pass + 1;

  -- ★ المعاينة لا تستقبل tenant_id من المتصفح
  ASSERT (SELECT pg_get_function_identity_arguments(p.oid)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='leave_preview_working_days')
         = 'p_from date, p_to date',
    '1.1c leave_preview_working_days تستقبل مستأجراً من المتصفح';
  v_pass := v_pass + 1;

  ASSERT (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='leave_requests_view'),
    '1.2 ★★ leave_requests_view صارت SECURITY DEFINER — تتجاوز RLS';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('submit_leave_request','cancel_leave_request',
                            'leave_requests_view','leave_working_days',
                            'leave_preview_working_days')),
    '1.3 ★★ anon يملك EXECUTE على إحدى دوال 0339';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE NOT t.tgisinternal AND t.tgname IN
     ('trg_leave_balance_movement','trg_close_orphan_hr_request','trg_permission_daily_cap');
  ASSERT v_n = 4,
    format('1.4 محفّزات 0339 = %s (متوقَّع 4: رصيد + يتيم×2 + سقف)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('idx_leaves_overlap_probe','idx_hr_requests_related','idx_permissions_request_daily');
  ASSERT v_n = 3, format('1.5 فهارس 0339 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② قيد الحالة (كان نصّاً حرّاً) ═══════════════════════════════════
  INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to,
                            working_days_count,reason)
    VALUES(v_t,v_eEmp,'تكليف',current_date+200,current_date+201,2,'قيد الحالة')
    RETURNING id INTO v_lv;
  BEGIN
    UPDATE public.leaves SET status='مقبووول' WHERE id=v_lv;
    RAISE EXCEPTION '2.1 ★★ status قَبِل ''مقبووول'' — قيد leaves_status_check غائب';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_pass := v_pass + 1;

  UPDATE public.leaves SET status='ملغى' WHERE id=v_lv;
  ASSERT (SELECT status FROM public.leaves WHERE id=v_lv) = 'ملغى',
    '2.2 ''ملغى'' حالة مشروعة (بديل الحذف) ومع ذلك رُفضت';
  v_pass := v_pass + 1;
  DELETE FROM public.leaves WHERE id=v_lv;

  -- ═══ ③ حساب أيام العمل في القاعدة ═════════════════════════════════════
  -- مدى ١٤ يوماً من أول اثنين قادم ⇒ 14 - 2 جمعة = 12
  DECLARE v_mon DATE := current_date + ((8 - EXTRACT(ISODOW FROM current_date)::INT) % 7);
  BEGIN
    IF EXTRACT(ISODOW FROM v_mon) <> 1 THEN v_mon := v_mon + 1; END IF;
    v_days := public.leave_working_days(v_t, v_mon, v_mon+13);
    ASSERT v_days = 12,
      format('3.1 أيام العمل في أسبوعين = %s (متوقَّع 12 = 14 ناقص جمعتين)', v_days);
    v_pass := v_pass + 1;

    -- ★ العطل الرسمية: ما لا يعرفه المتصفح إطلاقاً
    INSERT INTO public.holidays(tenant_id,date,name) VALUES (v_t, v_mon, 'عطلة اختبار');
    v_days := public.leave_working_days(v_t, v_mon, v_mon+13);
    ASSERT v_days = 11,
      format('3.2 ★ العطلة الرسمية لم تُستثنَ: %s (متوقَّع 11)', v_days);
    v_pass := v_pass + 1;

    -- ★★ عزل المستأجر: عطلة أ لا تُنقص أيام ب
    v_days := public.leave_working_days(v_tb, v_mon, v_mon+13);
    ASSERT v_days = 12,
      format('3.3 ★★ عطلة المستأجر أ خصمت من المستأجر ب: %s (متوقَّع 12)', v_days);
    v_pass := v_pass + 1;
    DELETE FROM public.holidays WHERE tenant_id=v_t AND date=v_mon;
  END;

  -- ═══ ④ الرصيد: حجز عند الطلب ═════════════════════════════════════════
  SELECT out_leave_id, out_working_days INTO v_lv, v_days
    FROM public.submit_leave_request('سنوية', current_date+30, current_date+34, 'حجز');
  ASSERT v_lv IS NOT NULL, '4.1 submit_leave_request لم تُعد معرّفاً';
  v_pass := v_pass + 1;

  -- المجموع عبر السنوات: محايد تجاه المدى العابر لرأس السنة
  SELECT sum(annual_pending) INTO v_num FROM public.leave_balance
   WHERE employee_id=v_eEmp;
  ASSERT v_num = v_days,
    format('4.2 ★★ annual_pending = %s بينما الطلب %s يوم — الرصيد لم يُحجز', v_num, v_days);
  v_pass := v_pass + 1;

  SELECT sum(annual_used) INTO v_num FROM public.leave_balance
   WHERE employee_id=v_eEmp;
  ASSERT v_num = 0, format('4.3 annual_used=%s قبل الاعتماد (متوقَّع 0)', v_num);
  v_pass := v_pass + 1;

  -- المدة محسوبة في القاعدة لا في المتصفح
  ASSERT (SELECT working_days_count FROM public.leaves WHERE id=v_lv) = v_days,
    '4.4 working_days_count المخزَّن يخالف ما حسبته leave_working_days';
  v_pass := v_pass + 1;

  -- ★★★ ثغرة تغطية أُصلحت: مقارنة المخزَّن بالمُعاد لا تكشف شيئاً — كلاهما
  --   من نفس المصدر. الكشف يحتاج **قيمة مستقلة معروفة سلفاً**: مدى أسبوعين
  --   من اثنين إلى أحد فيه جمعتان ⇒ 12 يوم عمل من 14 يوماً تقويمياً.
  --   لو عاد الحساب إلى (date_to - date_from + 1) كما في المتصفح لأعطى 14.
  DECLARE
    v_mon2  DATE := current_date + 30 + ((8 - EXTRACT(ISODOW FROM current_date+30)::INT) % 7);
    v_lvW   UUID;
    v_calen INT;
  BEGIN
    IF EXTRACT(ISODOW FROM v_mon2) <> 1 THEN v_mon2 := v_mon2 + 1; END IF;
    v_mon2 := v_mon2 + 300;   -- بعيداً عن كل مدَيات الاختبار الأخرى
    IF EXTRACT(ISODOW FROM v_mon2) <> 1 THEN
      v_mon2 := v_mon2 + ((8 - EXTRACT(ISODOW FROM v_mon2)::INT) % 7);
    END IF;
    v_calen := (v_mon2 + 13) - v_mon2 + 1;
    ASSERT v_calen = 14, format('4.5 تجهيز باطل: أيام تقويمية = %s', v_calen);

    INSERT INTO public.leave_balance(tenant_id,employee_id,year,annual_total)
      VALUES(v_t,v_eEmp,EXTRACT(YEAR FROM v_mon2)::INT,40) ON CONFLICT DO NOTHING;
    UPDATE public.leave_balance SET annual_total=40
     WHERE employee_id=v_eEmp AND year=EXTRACT(YEAR FROM v_mon2)::INT;

    SELECT out_leave_id INTO v_lvW
      FROM public.submit_leave_request('سنوية', v_mon2, v_mon2+13, 'أسبوعان');
    ASSERT (SELECT working_days_count FROM public.leaves WHERE id=v_lvW) = 12,
      format('4.5 ★★★ المدة المخزَّنة = %s على 14 يوماً تقويمياً (متوقَّع 12): '
             'الحساب لا يستثني الجمعة — عاد إلى منطق المتصفح',
             (SELECT working_days_count FROM public.leaves WHERE id=v_lvW));
    PERFORM public.cancel_leave_request(v_lvW, NULL);
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑤ التداخل ════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.submit_leave_request('مرضية', current_date+32, current_date+36, 'تداخل');
    RAISE EXCEPTION '5.1 ★★ طلب متداخل قُبِل — فحص LEAVE_OVERLAP غائب';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'LEAVE_OVERLAP%',
      format('5.1 رُفض بسبب آخر لا التداخل: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- تداخل بيوم واحد فقط في الطرف — يجب أن يُرفض أيضاً
  BEGIN
    PERFORM public.submit_leave_request('سنوية', current_date+34, current_date+38, 'طرف');
    RAISE EXCEPTION '5.2 ★ تداخل بيوم واحد على الحدّ قُبِل';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ★★ لا تداخل: مدى منفصل تماماً يجب أن يمرّ (وإلا كان الفحص فضفاضاً)
  DECLARE v_lv2 UUID;
  BEGIN
    SELECT out_leave_id INTO v_lv2
      FROM public.submit_leave_request('تكليف', current_date+60, current_date+61, 'منفصل');
    ASSERT v_lv2 IS NOT NULL, '5.3 ★★ مدى منفصل رُفض — فحص التداخل فضفاض';
    DELETE FROM public.leaves WHERE id=v_lv2;
  END;
  v_pass := v_pass + 1;

  -- ★★★ عزل المستأجر: طلب موظف ب على نفس المدى لا يصطدم بطلب أ
  --     (الكشف الحقيقي يحتاج employee_id مختلفاً تحت مستأجر آخر)
  PERFORM set_config('request.jwt.claim.sub', v_uB::text, TRUE);
  DECLARE v_lvB UUID;
  BEGIN
    INSERT INTO public.leave_balance(tenant_id,employee_id,year,annual_total)
      VALUES(v_tb,v_eB,v_year,10);
    SELECT out_leave_id INTO v_lvB
      FROM public.submit_leave_request('سنوية', current_date+30, current_date+34, 'ب');
    ASSERT v_lvB IS NOT NULL,
      '5.4 ★★★ طلب موظف المستأجر ب اصطدم بطلب المستأجر أ — تسريب عبر المستأجرين';
    -- ورصيده هو من تحرّك لا رصيد أ.
    -- ★ قسم ب بلا رؤساء ⇒ اعتماد تلقائي فوري (إصلاح ⑩) ⇒ الحجز
    --   يتحوّل خصماً في نفس المعاملة: pending=0 · used=المدة.
    --   لذلك نقيس المستهلَك الكلّي لا الحجز وحده.
    SELECT annual_pending + annual_used INTO v_num FROM public.leave_balance
     WHERE employee_id=v_eB AND tenant_id=v_tb;
    ASSERT v_num > 0, format('5.5 رصيد موظف ب لم يتحرّك: %s', v_num);
    ASSERT (SELECT annual_used FROM public.leave_balance
             WHERE employee_id=v_eB AND tenant_id=v_tb) = v_num,
      '5.5b قسم ب بلا رؤساء: كان يجب أن يُعتمد تلقائياً ويُخصم لا يُحجز';
  END;
  v_pass := v_pass + 3;
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  -- ═══ ⑥ سقف الرصيد ═════════════════════════════════════════════════════
  -- الرصيد 10 · محجوز 5 (تقريباً) ⇒ طلب 10 أيام يجب أن يُرفض
  BEGIN
    PERFORM public.submit_leave_request('سنوية', current_date+100, current_date+113, 'تجاوز');
    RAISE EXCEPTION '6.1 ★★ طلب يتجاوز الرصيد قُبِل';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'LEAVE_INSUFFICIENT_BALANCE%',
      format('6.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ نوع بلا رصيد (وفاة) لا يخضع للسقف
  DECLARE v_lv3 UUID;
  BEGIN
    SELECT out_leave_id INTO v_lv3
      FROM public.submit_leave_request('وفاة_أول', current_date+120, current_date+122, 'وفاة');
    ASSERT v_lv3 IS NOT NULL, '6.2 ★ إجازة وفاة رُفضت بحجّة الرصيد وهي بلا رصيد';
    DELETE FROM public.leaves WHERE id=v_lv3;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑦ الماضي البعيد ══════════════════════════════════════════════════
  BEGIN
    PERFORM public.submit_leave_request('تكليف', current_date-400, current_date-398, 'ماضٍ');
    RAISE EXCEPTION '7.1 ★ طلب بدأ قبل 400 يوم قُبِل';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'LEAVE_TOO_OLD%', format('7.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ تسوية بأثر رجعي قصير (يومان للخلف) مسموحة — وإلا كان الحدّ صارماً
  DECLARE v_lv4 UUID;
  BEGIN
    SELECT out_leave_id INTO v_lv4
      FROM public.submit_leave_request('تكليف', current_date-2, current_date-1, 'رجعي قصير');
    ASSERT v_lv4 IS NOT NULL, '7.2 ★ تسوية بيومين للخلف رُفضت — الحدّ صارم زيادة';
    DELETE FROM public.leaves WHERE id=v_lv4;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑧ تضارب المصالح: المدير لا يعتمد نفسه ═══════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uMgr::text, TRUE);
  INSERT INTO public.leave_balance(tenant_id,employee_id,year,annual_total)
    VALUES(v_t,v_eMgr,v_year,21),(v_t,v_eMgr,v_year+1,21) ON CONFLICT DO NOTHING;
  SELECT out_leave_id, out_request_id INTO v_lv, v_req
    FROM public.submit_leave_request('سنوية', current_date+150, current_date+152, 'إجازة المدير');

  SELECT count(*) INTO v_n FROM public.hr_approval_steps
   WHERE request_id=v_req AND approver_id=v_uMgr;
  ASSERT v_n = 0,
    format('8.1 ★★★ المدير معتمِدُ نفسه في %s خطوة — تضارب مصالح', v_n);
  v_pass := v_pass + 1;

  -- المشرفة تبقى معتمِدة (لا نُفرغ السلسلة)
  SELECT count(*) INTO v_n FROM public.hr_approval_steps
   WHERE request_id=v_req AND approver_id=v_uSup;
  ASSERT v_n = 1,
    format('8.2 ★ خطوة المشرفة اختفت (%s) — التخطّي أوسع من اللازم', v_n);
  v_pass := v_pass + 1;

  -- ★★ ولا يستطيع البتّ فيها
  BEGIN
    PERFORM public.decide_hr_approval_step(v_req,'approved','أوافق على نفسي');
    RAISE EXCEPTION '8.3 ★★★ المدير بتّ في طلبه';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE '%not authorized%',
      format('8.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- والمشرفة تبتّ فتُعتمَد
  PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
  v_fin := public.decide_hr_approval_step(v_req,'approved',NULL);
  ASSERT v_fin = 'approved', format('8.4 قرار المشرفة أعطى %s', v_fin);
  v_pass := v_pass + 1;

  ASSERT (SELECT status FROM public.leaves WHERE id=v_lv) = 'موافق',
    '8.5 leaves.status لم يُزامَن بعد اكتمال السلسلة';
  v_pass := v_pass + 1;

  -- ═══ ⑨ الخصم عند الاعتماد ════════════════════════════════════════════
  SELECT sum(annual_used), sum(annual_pending) INTO v_num, v_days
    FROM public.leave_balance WHERE employee_id=v_eMgr;
  ASSERT v_num > 0,
    format('9.1 ★★ annual_used=%s بعد اعتماد إجازة — الرصيد لم يُخصم', v_num);
  v_pass := v_pass + 1;
  ASSERT v_days = 0,
    format('9.2 ★ annual_pending=%s بعد الاعتماد — الحجز لم يُحرَّر', v_days);
  v_pass := v_pass + 1;

  -- ═══ ⑩ الاعتماد التلقائي يُزامن المصدر (قسم بلا رؤساء) ═══════════════
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  UPDATE public.employees SET department_id=v_dNone WHERE id=v_eEmp;
  SELECT out_leave_id, out_request_id INTO v_lv, v_req
    FROM public.submit_leave_request('تكليف', current_date+170, current_date+171, 'بلا رؤساء');
  ASSERT (SELECT status FROM public.hr_approval_requests WHERE id=v_req) = 'approved',
    '10.1 قسم بلا رؤساء لم يُعتمَد تلقائياً';
  v_pass := v_pass + 1;
  ASSERT (SELECT status FROM public.leaves WHERE id=v_lv) = 'موافق',
    '10.2 ★★ الطلب approved بينما leaves.status ما زال ''انتظار'' — لا مزامنة';
  v_pass := v_pass + 1;
  UPDATE public.employees SET department_id=v_d WHERE id=v_eEmp;

  -- ═══ ⑪ الأيتام ════════════════════════════════════════════════════════
  SELECT out_leave_id, out_request_id INTO v_lv, v_req
    FROM public.submit_leave_request('وفاة_ثاني', current_date+180, current_date+181, 'سيُحذف');
  SELECT count(*) INTO v_n FROM public.hr_approval_steps
   WHERE request_id=v_req AND status IN ('active','pending');
  ASSERT v_n > 0, '11.0 تجهيز باطل: لا خطوات حيّة قبل الحذف';
  v_pass := v_pass + 1;

  DELETE FROM public.leaves WHERE id=v_lv;
  SELECT count(*) INTO v_n FROM public.hr_approval_steps
   WHERE request_id=v_req AND status IN ('active','pending');
  ASSERT v_n = 0,
    format('11.1 ★★ %s خطوة حيّة لطلب محذوف — يتيم في صندوق المدير', v_n);
  v_pass := v_pass + 1;
  ASSERT (SELECT status FROM public.hr_approval_requests WHERE id=v_req) <> 'pending',
    '11.2 ★★ hr_approval_requests ما زال pending بعد حذف مصدره';
  v_pass := v_pass + 1;

  -- ═══ ⑫ الإلغاء بدل الحذف ═════════════════════════════════════════════
  SELECT sum(annual_pending) INTO v_num FROM public.leave_balance
   WHERE employee_id=v_eEmp;
  DECLARE v_before NUMERIC := v_num;
  BEGIN
    SELECT out_leave_id, out_request_id INTO v_lv, v_req
      FROM public.submit_leave_request('سنوية', current_date+190, current_date+191, 'سيُلغى');
    SELECT sum(annual_pending) INTO v_num FROM public.leave_balance
     WHERE employee_id=v_eEmp;
    ASSERT v_num > v_before, '12.0 تجهيز باطل: الحجز لم يزد';

    v_ok := public.cancel_leave_request(v_lv, 'تغيّرت ظروفي');
    ASSERT v_ok, '12.1 cancel_leave_request أعادت FALSE';
    v_pass := v_pass + 1;

    ASSERT (SELECT status FROM public.leaves WHERE id=v_lv) = 'ملغى',
      '12.2 الحالة بعد الإلغاء ليست ''ملغى''';
    v_pass := v_pass + 1;

    -- ★ الطلب باقٍ للتدقيق — لا حذف نهائي
    ASSERT EXISTS (SELECT 1 FROM public.leaves WHERE id=v_lv),
      '12.3 ★ الطلب اختفى — الإلغاء صار حذفاً';
    v_pass := v_pass + 1;

    SELECT sum(annual_pending) INTO v_num FROM public.leave_balance
     WHERE employee_id=v_eEmp;
    ASSERT v_num = v_before,
      format('12.4 ★★ الحجز لم يُحرَّر بعد الإلغاء: %s (متوقَّع %s)', v_num, v_before);
    v_pass := v_pass + 1;

    SELECT count(*) INTO v_n FROM public.hr_approval_steps
     WHERE request_id=v_req AND status IN ('active','pending');
    ASSERT v_n = 0, format('12.5 %s خطوة حيّة بعد الإلغاء', v_n);
    v_pass := v_pass + 1;

    -- ★★ لا يُلغي غيرُ صاحبه: موظف من مستأجر آخر
    PERFORM set_config('request.jwt.claim.sub', v_uB::text, TRUE);
    BEGIN
      PERFORM public.cancel_leave_request(v_lv, 'لست صاحبه');
      RAISE EXCEPTION '12.6 ★★★ موظف من مستأجر آخر ألغى طلباً ليس له';
    EXCEPTION WHEN insufficient_privilege OR no_data_found THEN NULL;
    END;
    v_pass := v_pass + 1;

    -- ★★★ ثغرة تغطية أُصلحت: الحالة أعلاه يصدّها ترشيح tenant_id **ضمناً**
    --   (نفس درس «المعرّف الفريد عالمياً يُقصي الأجنبي ضمناً» المتكرر).
    --   الكشف الحقيقي يحتاج زميلاً في **نفس المستأجر** بلا صفة staff:
    --   المشرفة رنا (supervisor — ليست في current_user_is_staff) تحاول
    --   إلغاء طلب سعد. لو سقط فحص الملكية لنجحت.
    PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
    ASSERT NOT public.current_user_is_staff(),
      '12.7 تجهيز باطل: المشرفة صارت staff فلا يقيس الاختبار الملكية';
    BEGIN
      PERFORM public.cancel_leave_request(v_lv, 'أنا المشرفة');
      RAISE EXCEPTION
        '12.7 ★★★ زميل في نفس المستأجر ألغى طلب غيره — فحص الملكية ساقط';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    v_pass := v_pass + 1;

    -- ★ وصاحبُه يلغيه فعلاً (وإلا كان الفحص يمنع الجميع)
    PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
    DECLARE v_lvOwn UUID;
    BEGIN
      SELECT out_leave_id INTO v_lvOwn
        FROM public.submit_leave_request('تكليف', current_date+240, current_date+241, 'ملكي');
      ASSERT public.cancel_leave_request(v_lvOwn, NULL),
        '12.8 ★ صاحب الطلب مُنع من إلغاء طلبه';
    END;
    v_pass := v_pass + 1;
  END;

  -- ═══ ⑬ الحجّ مرّة واحدة ═══════════════════════════════════════════════
  UPDATE public.leave_balance SET hajj_taken=TRUE
   WHERE employee_id=v_eEmp;
  BEGIN
    PERFORM public.submit_leave_request('حج', current_date+300, current_date+310, 'حج ثانٍ');
    RAISE EXCEPTION '13.1 ★ إجازة حج ثانية قُبِلت';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'LEAVE_HAJJ_USED%', format('13.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;
  UPDATE public.leave_balance SET hajj_taken=FALSE
   WHERE employee_id=v_eEmp;

  -- ═══ ⑭ سقف الزمنيات اليومي ════════════════════════════════════════════
  INSERT INTO public.permissions_request(tenant_id,employee_id,employee_name,date,
                                         permission_type,expected_out_time,
                                         expected_return_time,reason)
    SELECT v_t,v_eEmp,'سعد',current_date+5,'عادية','10:00','12:00','زمنية '||g
      FROM generate_series(1,3) g;
  BEGIN
    INSERT INTO public.permissions_request(tenant_id,employee_id,employee_name,date,
                                           permission_type,expected_out_time,
                                           expected_return_time,reason)
      VALUES(v_t,v_eEmp,'سعد',current_date+5,'عادية','14:00','15:00','الرابعة');
    RAISE EXCEPTION '14.1 ★ زمنية رابعة في اليوم قُبِلت — السقف غائب';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'PERMISSION_DAILY_CAP%', format('14.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ يوم آخر يمرّ (وإلا كان السقف شهرياً لا يومياً)
  INSERT INTO public.permissions_request(tenant_id,employee_id,employee_name,date,
                                         permission_type,expected_out_time,
                                         expected_return_time,reason)
    VALUES(v_t,v_eEmp,'سعد',current_date+6,'عادية','10:00','11:00','يوم آخر');
  v_pass := v_pass + 1;

  -- ★★ عزل المستأجر: زمنيات أ لا تُحسب على ب
  INSERT INTO public.permissions_request(tenant_id,employee_id,employee_name,date,
                                         permission_type,expected_out_time,
                                         expected_return_time,reason)
    VALUES(v_tb,v_eB,'ب',current_date+5,'عادية','10:00','11:00','زمنية ب');
  v_pass := v_pass + 1;

  -- ═══ ⑮ leave_requests_view ════════════════════════════════════════════
  -- ★ الاسم: العمود employee_name غير موجود في leaves أصلاً
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='leaves' AND column_name='employee_name';
  ASSERT v_n = 0,
    '15.0 صار في leaves عمود employee_name — الافتراض البنيوي تغيّر';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.leave_requests_view('mine', NULL, 100, 0)
   WHERE out_employee_name IN ('—','');
  ASSERT v_n = 0,
    format('15.1 ★★ %s صفّاً بلا اسم موظف — الاسم لا يُحلّ', v_n);
  v_pass := v_pass + 1;

  -- كل ما يراه الموظف ملكه
  SELECT count(*) INTO v_n FROM public.leave_requests_view('mine', NULL, 100, 0)
   WHERE out_employee_id <> v_eEmp;
  ASSERT v_n = 0, format('15.2 ★★★ نطاق mine سرّب %s صفّاً لغير صاحبه', v_n);
  v_pass := v_pass + 1;

  -- ولا يستطيع البتّ في شيء
  SELECT count(*) INTO v_n FROM public.leave_requests_view('mine', NULL, 100, 0)
   WHERE out_can_decide;
  ASSERT v_n = 0,
    format('15.3 ★★★ can_decide=TRUE في %s من طلبات الموظف نفسه', v_n);
  v_pass := v_pass + 1;

  -- ★★ صندوق المشرفة: ترى ما لها فيه خطوة نشطة فقط
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  SELECT out_leave_id INTO v_lv
    FROM public.submit_leave_request('سنوية', current_date+220, current_date+221, 'لصندوق المشرفة');
  PERFORM set_config('request.jwt.claim.sub', v_uSup::text, TRUE);
  SELECT count(*) INTO v_n FROM public.leave_requests_view('inbox', NULL, 100, 0);
  ASSERT v_n >= 1, '15.4 صندوق المشرفة فارغ رغم وجود خطوة نشطة لها';
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.leave_requests_view('inbox', NULL, 100, 0)
   WHERE NOT out_can_decide;
  ASSERT v_n = 0, format('15.5 ★ %s صفّاً في الصندوق بلا صلاحية قرار', v_n);
  v_pass := v_pass + 1;

  -- ★★★ صندوق المدير: لا يرى طلباً ليست له فيه خطوة نشطة
  PERFORM set_config('request.jwt.claim.sub', v_uMgr::text, TRUE);
  SELECT count(*) INTO v_n FROM public.leave_requests_view('inbox', NULL, 100, 0)
   WHERE out_id = v_lv;
  ASSERT v_n = 0,
    '15.6 ★★★ المدير يرى في صندوقه طلباً خطوتُه ما زالت pending عند المشرفة';
  v_pass := v_pass + 1;

  -- الترشيح بالحالة
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  SELECT count(*) INTO v_n FROM public.leave_requests_view('mine', 'ملغى', 100, 0)
   WHERE out_status <> 'ملغى';
  ASSERT v_n = 0, format('15.7 ترشيح الحالة سرّب %s صفّاً', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT count(*) FROM public.leave_requests_view('mine', NULL, 1, 0)) = 1,
    '15.8 p_limit لا يُطبَّق';
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '  verify-leave-integrity-0339 — % تأكيداً ناجحاً', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0339';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_VERIFY_0339' THEN RAISE; END IF;
END $$;
