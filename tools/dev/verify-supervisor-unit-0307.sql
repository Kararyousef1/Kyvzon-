-- ============================================================================
-- FILE: tools/dev/verify-supervisor-unit-0307.sql
-- PURPOSE: اختبار سلوكي لوحدة الحركة في بوابة المشرف (0307)
--          الجوهر: المشرف يتابع ولا يعتمد.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vs7_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vs7_results;

DO $$
DECLARE
  v_tenant UUID;
  v_dept   UUID;
  v_other  UUID;
  v_sup    UUID := gen_random_uuid();
  v_mgr    UUID := gen_random_uuid();
  v_emp    UUID := gen_random_uuid();
  v_far    UUID := gen_random_uuid();
  v_permit UUID;
  v_cnt    INT;
  v_txt    TEXT;
  v_bool   BOOLEAN;
  v_min    INT;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر مشرف', 'verify-sup-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'العمليات') RETURNING id INTO v_dept;
  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'المالية')  RETURNING id INTO v_other;

  INSERT INTO auth.users (id,email) VALUES
    (v_sup,'v7-sup@t.local'),(v_mgr,'v7-mgr@t.local'),
    (v_emp,'v7-emp@t.local'),(v_far,'v7-far@t.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role,department) VALUES
    (v_sup,v_tenant,'مشرف','v7-sup@t.local','supervisor','العمليات'),
    (v_mgr,v_tenant,'مدير','v7-mgr@t.local','manager','العمليات'),
    (v_emp,v_tenant,'موظف','v7-emp@t.local','employee','العمليات'),
    (v_far,v_tenant,'موظف بعيد','v7-far@t.local','employee','المالية');

  INSERT INTO public.portal_unit_assignments (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
  VALUES (v_tenant,v_sup,'supervisor','movement','department',v_dept),
         (v_tenant,v_mgr,'manager','movement','department',v_dept);

  -- حركتان: عاد متأخراً · ما زال خارجاً ومتأخر
  INSERT INTO public.employee_movements_log
    (tenant_id,employee_id,destination_name,purpose,departure_at,expected_return_at,returned_at,status)
  VALUES
    (v_tenant,v_emp,'بنك','مهمة',NOW()-interval '3 hours',NOW()-interval '2 hours',NOW()-interval '1 hour','returned'),
    (v_tenant,v_emp,'سوق','شراء',NOW()-interval '4 hours',NOW()-interval '3 hours',NULL,'out');

  -- حركة من قسم آخر (خارج فريق المشرف)
  INSERT INTO public.employee_movements_log
    (tenant_id,employee_id,destination_name,purpose,departure_at,expected_return_at,status)
  VALUES (v_tenant,v_far,'مطار','استقبال',NOW()-interval '2 hours',NOW()-interval '1 hour','out');

  -- تصريح معلَّق
  INSERT INTO public.employee_movement_permits
    (tenant_id,employee_id,destination_name,purpose,valid_until,status)
  VALUES (v_tenant,v_emp,'محكمة','مراجعة',NOW()+interval '2 hours','pending')
  RETURNING id INTO v_permit;

  PERFORM set_config('request.jwt.claim.sub', v_sup::text, TRUE);

  -- ══ 1) المشرف يرى حركة فريقه فقط ═════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.supervisor_movement_shift(12);
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('المشرف يرى حركتَي فريقه فقط', v_cnt=2, 'count='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.supervisor_movement_shift(12)
   WHERE out_employee_id = v_far;
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('حركة القسم الآخر لا تظهر', v_cnt=0, 'count='||v_cnt);

  -- ══ 2) الترتيب: المتأخر الخارج أولاً ═════════════════════════════════
  SELECT out_is_out_now INTO v_bool FROM public.supervisor_movement_shift(12) LIMIT 1;
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('الخارج الآن يظهر أولاً', v_bool IS TRUE, 'first_is_out='||v_bool);

  -- ══ 3) حساب التأخير للخارج والعائد ═══════════════════════════════════
  SELECT out_overdue_minutes INTO v_min FROM public.supervisor_movement_shift(12)
   WHERE out_is_out_now IS TRUE LIMIT 1;
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('يحسب تأخير من لم يعد (≈180 دقيقة)', v_min BETWEEN 175 AND 185, 'minutes='||v_min);

  SELECT out_overdue_minutes INTO v_min FROM public.supervisor_movement_shift(12)
   WHERE out_is_out_now IS FALSE LIMIT 1;
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('يحسب تأخير من عاد متأخراً (≈60 دقيقة)', v_min BETWEEN 55 AND 65, 'minutes='||v_min);

  -- ══ 4) المؤشرات ══════════════════════════════════════════════════════
  SELECT out_out_now INTO v_cnt FROM public.supervisor_movement_shift_kpis(12);
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('مؤشر «خارج الآن» يعدّ واحداً', v_cnt=1, 'out_now='||v_cnt);

  SELECT out_overdue_now INTO v_cnt FROM public.supervisor_movement_shift_kpis(12);
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('مؤشر «متأخر الآن» يعدّ واحداً', v_cnt=1, 'overdue='||v_cnt);

  SELECT out_total_shift INTO v_cnt FROM public.supervisor_movement_shift_kpis(12);
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('إجمالي الوردية = حركتان', v_cnt=2, 'total='||v_cnt);

  -- ══ 5) 🔴 الجوهر: المشرف لا يعتمد ════════════════════════════════════
  BEGIN
    PERFORM count(*) FROM public.manager_movement_pending_permits();
    INSERT INTO vs7_results(name,passed,detail) VALUES
      ('المشرف لا يرى شاشة اعتماد المدير', FALSE, 'مرّ — خرق للنموذج!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vs7_results(name,passed,detail) VALUES
      ('المشرف لا يرى شاشة اعتماد المدير', SQLERRM LIKE '%NOT_ASSIGNED_TO_UNIT%', SQLERRM);
  END;

  BEGIN
    PERFORM public.manager_movement_decide_permit(v_permit,'approved','تجاوز');
    INSERT INTO vs7_results(name,passed,detail) VALUES
      ('المشرف لا يعتمد تصريحاً', FALSE, 'مرّ — تصعيد صلاحية!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vs7_results(name,passed,detail) VALUES
      ('المشرف لا يعتمد تصريحاً', SQLERRM LIKE '%NOT_ASSIGNED_TO_UNIT%', SQLERRM);
  END;

  SELECT status INTO v_txt FROM public.employee_movement_permits WHERE id=v_permit;
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('التصريح بقي معلَّقاً', v_txt='pending', 'status='||v_txt);

  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox();
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('صندوق موافقات المشرف فارغ', v_cnt=0, 'count='||v_cnt);

  -- ══ 6) المدير يشمل صلاحية المشرف (تسلسل هرمي) ════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.supervisor_movement_shift(12);
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('المدير يعاين شاشة المشرف', v_cnt=2, 'count='||v_cnt);

  -- والعكس غير صحيح: المشرف لا يرى شاشة المدير (أُثبت في 5)

  -- ══ 7) غير المُسنَد يُرفض ════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  BEGIN
    PERFORM count(*) FROM public.supervisor_movement_shift(12);
    INSERT INTO vs7_results(name,passed,detail) VALUES
      ('موظف بلا وحدة يُرفض', FALSE, 'مرّ!');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vs7_results(name,passed,detail) VALUES
      ('موظف بلا وحدة يُرفض', SQLERRM LIKE '%NOT_ASSIGNED_TO_UNIT%', SQLERRM);
  END;

  -- ══ 8) النافذة الزمنية تعمل ══════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_sup::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.supervisor_movement_shift(1);
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('نافذة ساعة واحدة تستبعد الحركات القديمة', v_cnt=0, 'count='||v_cnt);

  -- ══ 9) حارس بنيوي: لا دالة مشرف تعدّل التصاريح ═══════════════════════
  SELECT count(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname LIKE 'supervisor_movement%'
     AND pg_get_functiondef(p.oid) ~* 'UPDATE\s+public\.employee_movement_permits';
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('لا دالة مشرف تعدّل التصاريح (حارس بنيوي)', v_cnt=0, 'violations='||v_cnt);

  SELECT count(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname LIKE 'supervisor_movement%'
     AND pg_get_functiondef(p.oid) ~* 'INSERT\s+INTO\s+public\.employee_movement_approvals';
  INSERT INTO vs7_results(name,passed,detail) VALUES
    ('لا دالة مشرف تُنشئ موافقات', v_cnt=0, 'violations='||v_cnt);

  -- ══ 10) anon محروم ═══════════════════════════════════════════════════
  INSERT INTO vs7_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.supervisor_movement_shift(integer)',
      'public.supervisor_movement_shift_kpis(integer)'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.employee_movement_permits WHERE tenant_id=v_tenant;
  DELETE FROM public.employee_movements_log WHERE tenant_id=v_tenant;
  DELETE FROM public.portal_unit_assignments WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id IN (v_sup,v_mgr,v_emp,v_far);
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM vs7_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vs7_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  وحدة المشرف 0307: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
