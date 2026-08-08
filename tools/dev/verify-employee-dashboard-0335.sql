-- ============================================================================
-- verify-employee-dashboard-0335.sql
--
-- بوابة الموظف: حلّ معرّف الموظف · ملخّص اللوحة · رصيد الإجازات.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
-- العزل عبر RLS الحقيقي في verify-employee-dashboard-0335-rls.sh.
--
-- ★ ملاحظة تنفيذية مهمة: `set_config(..., is_local := TRUE)` داخل كتلة
--   DO **يعمل** مع الدوال المستدعاة في نفس المعاملة. لكن محفّز
--   `trg_ensure_employee_row` (0317) يُنشئ سجلّ الموظف تلقائياً عند
--   إدراج الملف — فلا نُدرج سجلّاً ثانياً (القيد الجديد يمنعه) بل
--   نلتقط المعرّف الذي أنشأه المحفّز.
--
-- ملاحظات بنيوية مُحقَّقة (information_schema/pg_constraint):
--   wellness_entries: score INT · **mood نصّ** ∈ great·good·neutral·bad·
--     terrible · stress · energy · date · **لا mood_score** · بلا tenant NOT NULL
--   employee_goals: category ∈ performance·learning·wellbeing·career·
--     compliance·other · status ∈ draft·active·completed·cancelled
--   leave_balance: annual_* **numeric(6,3)** · sick_* numeric(5,1)
--     ⇒ نصف يوم إجازة قيمة مشروعة — الأنواع NUMERIC لا INTEGER
--   attendance_summary: shift_date · status · total_hours NOT NULL
--   employees: **لا قيد فريد على (tenant_id,user_id)** قبل 0335
--   departments.manager_id → profiles لا employees
--
-- ★★★ تحديث 0344: كانت الحالات هنا 'حاضر' — وهي مفردة **لا تُنتجها
--   المنصّة إطلاقاً**. المفردات الثماني الحقيقية من
--   determineAttendanceStatus (shiftCalculations.ts:261) هي:
--     حضور_بوقت · متأخر · زمنية_معتمدة · زمنية_انتظار ·
--     غائب · مجاز · إجازة_انتظار · عطلة
--   وقيد attendance_summary_status_vocab (0344) صار يمنع غيرها.
--   الاستبدال دلاليّ 1:1: 'حاضر' ⇒ 'حضور_بوقت'.
--   ★ ولا يُغيّر ما يقيسه الاختبار: my_dashboard_summary تستعمل
--     `status <> 'غائب'` — محايدة للمفردات.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_ub    UUID := gen_random_uuid();
  v_orph  UUID := gen_random_uuid();   -- ملف بلا سجلّ موظف
  v_d     UUID := gen_random_uuid();
  v_db    UUID := gen_random_uuid();
  v_e     UUID;
  v_eb    UUID;
  v_n     INT;
  v_num   NUMERIC;
  v_txt   TEXT;
  v_pass  INT := 0;
  r       RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'EA','لوحة أ','ed35a-'||substr(v_t::text ,1,8)),
    (v_tb,'EB','لوحة ب','ed35b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u   ,'u-'||substr(v_u::text   ,1,8)||'@e35.io'),
    (v_ub  ,'b-'||substr(v_ub::text  ,1,8)||'@e35.io'),
    (v_orph,'o-'||substr(v_orph::text,1,8)||'@e35.io');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d ,v_t ,'التقنية'), (v_db,v_tb,'قسم ب');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u ,v_t ,'الموظف','employee'),
    (v_ub,v_tb,'موظف ب','employee');

  -- ★ محفّز 0317 أنشأ سجلّ الموظف — نلتقطه لا نُدرج ثانياً
  SELECT id INTO v_e  FROM public.employees WHERE user_id=v_u  AND tenant_id=v_t;
  SELECT id INTO v_eb FROM public.employees WHERE user_id=v_ub AND tenant_id=v_tb;
  UPDATE public.employees SET department_id=v_d  WHERE id=v_e;
  UPDATE public.employees SET department_id=v_db WHERE id=v_eb;

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  ASSERT v_e IS NOT NULL,
    '1.0 ★ محفّز 0317 لم يُنشئ سجلّ الموظف — تجهيز الاختبار باطل';
  v_pass := v_pass + 1;

  -- ★★ المعرّفان مختلفان — أساس العطل كلّه
  ASSERT v_e <> v_u,
    '1.1 ★★ employees.id = profiles.id ⇒ الاختبار لا يقيس العطل الحقيقي';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('my_employee_id','my_dashboard_summary','my_leave_balance');
  ASSERT v_n = 3, format('1.2 دوال 0335 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ دالتا القراءة INVOKER: تحترمان RLS الجداول
  FOR v_txt IN SELECT unnest(ARRAY['my_dashboard_summary','my_leave_balance'])
  LOOP
    ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.3 ★★ %s صارت SECURITY DEFINER — تتجاوز RLS', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ my_employee_id تبقى DEFINER: تقرأ employees لتحلّ المعرّف
  ASSERT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='my_employee_id'),
    '1.4 ★ my_employee_id فقدت SECURITY DEFINER';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('my_employee_id','my_dashboard_summary','my_leave_balance')),
    '1.5 ★★ anon يملك EXECUTE على إحدى دوال 0335';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('idx_wellness_employee_date','idx_att_summary_employee_date',
     'idx_goals_employee_active','idx_leave_balance_employee_year',
     'idx_employees_user_tenant');
  ASSERT v_n = 5, format('1.6 فهارس 0335 = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② ★★ القيد الفريد — العطل الثاني ═════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
    WHERE indexname='uq_employee_per_user_tenant'),
    '2.1 ★★ قيد «سجلّ موظف واحد لكل مستخدم» مفقود';
  v_pass := v_pass + 1;

  -- ★ جزئي: user_id يقبل NULL (موظف بلا حساب دخول — حالة مشروعة)
  ASSERT (SELECT indexdef LIKE '%WHERE (user_id IS NOT NULL)%'
            FROM pg_indexes WHERE indexname='uq_employee_per_user_tenant'),
    '2.2 ★★ القيد ليس جزئياً — سيمنع الموظفين بلا حساب دخول';
  v_pass := v_pass + 1;

  -- ★★ القيد نافذ فعلاً: محاولة تكرار تفشل
  BEGIN
    INSERT INTO public.employees(tenant_id,user_id,employee_code,first_name,last_name)
      VALUES (v_t, v_u, 'DUP-1', 'مكرّر', 'ثانٍ');
    ASSERT FALSE, '2.3 ★★ سجلّ موظف ثانٍ لنفس المستخدم قُبل — القيد صوري';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- المتوقَّع
  END;
  v_pass := v_pass + 1;

  -- ★ وموظف بلا حساب دخول مسموح (لا يخنقه القيد)
  INSERT INTO public.employees(tenant_id,user_id,employee_code,first_name,last_name)
    VALUES (v_t, NULL, 'NOUSER-1', 'بلا', 'حساب');
  INSERT INTO public.employees(tenant_id,user_id,employee_code,first_name,last_name)
    VALUES (v_t, NULL, 'NOUSER-2', 'بلا', 'حساب٢');
  SELECT count(*) INTO v_n FROM public.employees
   WHERE tenant_id=v_t AND user_id IS NULL;
  ASSERT v_n = 2,
    format('2.4 ★ موظفان بلا حساب دخول = %s — القيد الجزئي خنقهما', v_n);
  v_pass := v_pass + 1;

  -- ═══ ③ حلّ المعرّف — أساس العطل الأول ═════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);

  ASSERT public.my_employee_id() = v_e,
    format('3.1 ★★ my_employee_id = %s (متوقَّع %s)', public.my_employee_id(), v_e);
  v_pass := v_pass + 1;

  ASSERT public.my_employee_id() <> v_u,
    '3.2 ★★ my_employee_id تُرجع profiles.id — العطل قائم';
  v_pass := v_pass + 1;

  -- ═══ ④ البيانات: تُدرَج بالمعرّف الصحيح ════════════════════════════════
  INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy)
    VALUES (v_t,v_e,current_date  ,80,'good' ,2,4),
           (v_t,v_e,current_date-1,60,'neutral',3,3);
  INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status) VALUES
    (v_t,v_e,current_date  ,'حضور_بوقت'),
    (v_t,v_e,current_date-1,'حضور_بوقت'),
    (v_t,v_e,current_date-2,'غائب'),
    (v_t,v_e,current_date-3,'حضور_بوقت');
  INSERT INTO public.employee_goals(tenant_id,employee_id,title,category,status,progress_percent) VALUES
    (v_t,v_e,'هدف نشط ١','career'     ,'active'   ,40),
    (v_t,v_e,'هدف نشط ٢','learning'   ,'active'   ,80),
    (v_t,v_e,'هدف مكتمل','performance','completed',100);
  INSERT INTO public.leave_balance
    (tenant_id,employee_id,year,annual_total,annual_used,annual_pending,
     sick_total,sick_used,sick_pending)
    VALUES (v_t,v_e,EXTRACT(YEAR FROM current_date)::INT,30,5,2.5,15,1,0);

  -- ★★ تلوّث المستأجر ب — يجب ألّا يظهر
  INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy)
    VALUES (v_tb,v_eb,current_date,10,'bad',5,1);
  INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status)
    VALUES (v_tb,v_eb,current_date,'غائب');

  -- ═══ ⑤ ملخّص اللوحة — العطل الأول ══════════════════════════════════════
  SELECT * INTO r FROM public.my_dashboard_summary();

  ASSERT r.out_employee_id = v_e,
    '5.1 ★★ الملخّص لم يحلّ معرّف الموظف';
  v_pass := v_pass + 1;

  -- ★★ متوسط 80 و60 = 70 — كان صفراً قبل الإصلاح
  ASSERT r.out_wellness_score = 70,
    format('5.2 ★★ درجة الصحة = %s (متوقَّع 70) — كانت 0', r.out_wellness_score);
  v_pass := v_pass + 1;

  -- ★★ ثلاثة حضور من أربعة = 75%
  ASSERT r.out_attendance_rate = 75,
    format('5.3 ★★ نسبة الحضور = %s%% (متوقَّع 75)', r.out_attendance_rate);
  v_pass := v_pass + 1;

  ASSERT r.out_tracked_days = 4,
    format('5.4 أيام مُتتبَّعة = %s (متوقَّع 4)', r.out_tracked_days);
  v_pass := v_pass + 1;

  ASSERT r.out_present_days = 3,
    format('5.5 أيام حضور = %s (متوقَّع 3)', r.out_present_days);
  v_pass := v_pass + 1;

  -- ★ الأهداف النشطة وحدها — المكتمل لا يُحتسب
  ASSERT r.out_active_goals = 2,
    format('5.6 ★ أهداف نشطة = %s (متوقَّع 2؛ المكتمل لا يُحتسب)', r.out_active_goals);
  v_pass := v_pass + 1;

  -- ★ متوسط 40 و80 = 60 — لا يشمل المكتمل (100)
  ASSERT r.out_avg_goal_progress = 60,
    format('5.7 ★★ متوسط التقدّم = %s (متوقَّع 60؛ لو شمل المكتمل لكان ≈73)',
           r.out_avg_goal_progress);
  v_pass := v_pass + 1;

  -- ═══ ⑥ رصيد الإجازات ══════════════════════════════════════════════════
  SELECT * INTO r FROM public.my_leave_balance(NULL);

  ASSERT r.out_annual_total = 30,
    format('6.1 إجمالي السنوي = %s', r.out_annual_total);
  v_pass := v_pass + 1;

  -- ★★ المتبقّي يطرح المعلّق: 30 − 5 − 2.5 = 22.5
  ASSERT r.out_annual_left = 22.5,
    format('6.2 ★★ المتبقّي = %s (متوقَّع 22.5) — إهمال المعلّق يُظهر رصيداً وهمياً',
           r.out_annual_left);
  v_pass := v_pass + 1;

  -- ★★ النوع NUMERIC لا INTEGER: نصف يوم قيمة مشروعة
  ASSERT r.out_annual_left <> round(r.out_annual_left),
    '6.3 ★★ المتبقّي عدد صحيح — الكسر ضاع (النوع كان INTEGER)';
  v_pass := v_pass + 1;

  ASSERT r.out_sick_left = 14,
    format('6.4 المرضي المتبقّي = %s (متوقَّع 14)', r.out_sick_left);
  v_pass := v_pass + 1;

  -- ★ سنة بلا رصيد تُعيد لا شيء لا خطأً
  SELECT count(*) INTO v_n FROM public.my_leave_balance(1990);
  ASSERT v_n = 0, format('6.5 سنة بلا رصيد أعادت %s صفاً', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ ★★ العزل بين المستأجرين ════════════════════════════════════════
  SELECT * INTO r FROM public.my_dashboard_summary();
  ASSERT r.out_tracked_days = 4,
    format('7.1 ★★ أيام مُتتبَّعة = %s ⇒ تسرّب يوم من مستأجر آخر', r.out_tracked_days);
  v_pass := v_pass + 1;

  -- ★★ متوسط الصحة لا يتأثّر بسجلّ الشركة ب (10)
  ASSERT r.out_wellness_score = 70,
    format('7.2 ★★ درجة الصحة = %s ⇒ تسرّب سجلّ صحّة أجنبي', r.out_wellness_score);
  v_pass := v_pass + 1;

  -- ★★★ تصحيح ذاتي مُوثَّق: التأكيدان أعلاه **لا يكشفان** إلغاء فلتر
  --   `tenant_id`. أثبتُّ ذلك بعكسه إلى `(a.tenant_id = v_tenant OR TRUE)`
  --   فنجح الاختبار كاملاً — لأن `employee_id` معرّف UUID فريد عالمياً،
  --   فترشيحه وحده يُقصي الصفوف الأجنبية ضمناً.
  --
  --   الكشف الحقيقي يحتاج **نفس employee_id في مستأجرين مختلفين** —
  --   حالة تبدو مستحيلة لكنها ليست كذلك: لا مفتاح أجنبي على
  --   attendance_summary.employee_id يربطه بمستأجره، فبيانات مُرحَّلة
  --   أو خطأ إدراج قد يُنتجها. فلتر المستأجر هو خطّ الدفاع الوحيد.
  INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status)
    VALUES (v_tb, v_e, current_date - 10, 'حضور_بوقت');

  SELECT * INTO r FROM public.my_dashboard_summary();
  ASSERT r.out_tracked_days = 4,
    format('7.3 ★★★ أيام مُتتبَّعة = %s (متوقَّع 4) ⇒ فلتر tenant_id مُهمَل: '
           'صفّ بنفس employee_id تحت مستأجر آخر تسرّب', r.out_tracked_days);
  v_pass := v_pass + 1;

  DELETE FROM public.attendance_summary
   WHERE tenant_id = v_tb AND employee_id = v_e;

  -- ═══ ⑧ ملف بلا سجلّ موظف ══════════════════════════════════════════════
  --   ★ نُنشئ الملف ثم نحذف سجلّ الموظف الذي أنشأه المحفّز، لنُحاكي
  --     مستخدماً غير مرتبط (يحدث حين يُنشأ الحساب قبل الربط).
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_orph,v_t,'بلا سجلّ','employee');
  DELETE FROM public.employees WHERE user_id = v_orph;

  PERFORM set_config('request.jwt.claim.sub', v_orph::text, TRUE);

  ASSERT public.my_employee_id() IS NULL,
    '8.1 ★ my_employee_id أعادت معرّفاً لمستخدم بلا سجلّ موظف';
  v_pass := v_pass + 1;

  -- ★★ صفّ بأصفار لا «لا شيء»: الواجهة تحتاج التمييز بين
  --   «لا بيانات» و«لا سجلّ موظف» — الثانية تحتاج رسالة مختلفة
  SELECT count(*) INTO v_n FROM public.my_dashboard_summary();
  ASSERT v_n = 1,
    format('8.2 ★★ الملخّص أعاد %s صفاً لمستخدم بلا سجلّ (متوقَّع 1 بأصفار)', v_n);
  v_pass := v_pass + 1;

  SELECT * INTO r FROM public.my_dashboard_summary();
  ASSERT r.out_employee_id IS NULL,
    '8.3 ★ الملخّص أعاد معرّف موظف لمن لا سجلّ له';
  v_pass := v_pass + 1;

  ASSERT r.out_tracked_days = 0 AND r.out_wellness_score = 0,
    '8.4 ★ الملخّص أعاد أرقاماً لمن لا سجلّ له';
  v_pass := v_pass + 1;

  -- ★ ورصيد الإجازات لا شيء (لا صفّ أصفار — لا معنى لرصيد بلا موظف)
  SELECT count(*) INTO v_n FROM public.my_leave_balance(NULL);
  ASSERT v_n = 0, format('8.5 رصيد لمن لا سجلّ له = %s صفاً', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑨ المستأجر المعدوم ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);

  SELECT count(*) INTO v_n FROM public.my_dashboard_summary();
  ASSERT v_n = 0, format('9.1 ★★ مستخدم بلا ملف أعاد %s صفاً', v_n);
  v_pass := v_pass + 1;

  ASSERT public.my_employee_id() IS NULL,
    '9.2 ★★ my_employee_id أعادت معرّفاً لمستخدم بلا ملف';
  v_pass := v_pass + 1;

  -- ═══ ⑩ موظف الشركة ب يرى بياناته وحدها ════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ub::text, TRUE);

  SELECT * INTO r FROM public.my_dashboard_summary();
  ASSERT r.out_employee_id = v_eb, '10.1 موظف ب لم يُحلّ معرّفه';
  v_pass := v_pass + 1;

  ASSERT r.out_tracked_days = 1,
    format('10.2 ★★ موظف ب يرى %s يوماً (متوقَّع 1)', r.out_tracked_days);
  v_pass := v_pass + 1;

  ASSERT r.out_wellness_score = 10,
    format('10.3 ★★ درجة صحة موظف ب = %s (متوقَّع 10) ⇒ تسريب معاكس',
           r.out_wellness_score);
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  verify-employee-dashboard-0335: % تأكيداً — نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0335';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_VERIFY_0335' THEN
    RAISE NOTICE 'تراجع نظيف — لا أثر في القاعدة.';
  ELSE
    RAISE;
  END IF;
END $$;
