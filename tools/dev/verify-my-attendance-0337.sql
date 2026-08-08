-- ============================================================================
-- verify-my-attendance-0337.sql
--
-- حضوري الشهري: النطاق الزمني · الإحصاءات · التتابع الحقيقي.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
-- العزل عبر RLS الحقيقي في verify-my-attendance-0337-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة:
--   attendance_summary: tenant_id·employee_id·shift_date·status NOT NULL
--     total_hours·late_minutes·early_leave_minutes·overtime_minutes NOT NULL
--   ★ الحالات نصوص عربية حرّة **بلا CHECK** — مستخرجة من المايجريشنات:
--     'غائب'(10) · 'متأخر'(7) · 'حضور_بوقت'(6) · 'حضور_بوقت'(4) · 'مجاز'(3)
--   محفّز trg_ensure_employee_row (0317) يُنشئ سجلّ الموظف تلقائياً
--   قيد uq_employee_per_user_tenant (0335) يمنع سجلّاً ثانياً
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_ub    UUID := gen_random_uuid();
  v_e     UUID;
  v_eb    UUID;
  v_y     INTEGER := EXTRACT(YEAR  FROM current_date)::INTEGER;
  v_m     INTEGER := EXTRACT(MONTH FROM current_date)::INTEGER;
  v_first DATE    := date_trunc('month', current_date)::DATE;
  v_prev  DATE    := (date_trunc('month', current_date) - INTERVAL '1 month')::DATE;
  v_n     INT;
  v_num   NUMERIC;
  v_pass  INT := 0;
  r       RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'AA','حضور أ','at37a-'||substr(v_t::text ,1,8)),
    (v_tb,'AB','حضور ب','at37b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u ,'u-'||substr(v_u::text ,1,8)||'@a37.io'),
    (v_ub,'b-'||substr(v_ub::text,1,8)||'@a37.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u ,v_t ,'الموظف','employee'),
    (v_ub,v_tb,'موظف ب','employee');

  -- ★ المحفّز أنشأ سجلّ الموظف — نلتقطه (القيد يمنع إدراجاً ثانياً)
  SELECT id INTO v_e  FROM public.employees WHERE user_id=v_u  AND tenant_id=v_t;
  SELECT id INTO v_eb FROM public.employees WHERE user_id=v_ub AND tenant_id=v_tb;
  ASSERT v_e IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّ الموظف — تجهيز باطل';
  v_pass := v_pass + 1;

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('my_attendance_month','my_attendance_month_stats','my_attendance_streak');
  ASSERT v_n = 3, format('1.1 دوال 0337 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★ كلها INVOKER: تحترم RLS جدول attendance_summary
  FOR r IN SELECT unnest(ARRAY['my_attendance_month','my_attendance_month_stats',
                               'my_attendance_streak']) AS nm
  LOOP
    ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=r.nm),
      format('1.2 ★★ %s صارت SECURITY DEFINER — تتجاوز RLS', r.nm);
  END LOOP;
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('my_attendance_month','my_attendance_month_stats',
                            'my_attendance_streak')),
    '1.3 ★★ anon يملك EXECUTE على إحدى دوال 0337';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('idx_att_summary_emp_month','idx_att_logs_emp_date');
  ASSERT v_n = 2, format('1.4 فهارس 0337 = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② البيانات: 3 أيام هذا الشهر · 20 يوماً سابقاً ═══════════════════
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours,late_minutes,overtime_minutes) VALUES
    (v_t,v_e,v_first    ,'حضور_بوقت',8,0 ,0),
    (v_t,v_e,v_first + 1,'متأخر'   ,7,30,0),
    (v_t,v_e,v_first + 2,'غائب'    ,0,0 ,0);

  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours,late_minutes,overtime_minutes)
  SELECT v_t, v_e, v_prev + g, 'حضور_بوقت', 8, 0, 0
    FROM generate_series(0,19) g;

  -- ★★ تلوّث المستأجر ب — نفس التواريخ
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours) VALUES
    (v_tb,v_eb,v_first,'حضور_بوقت',8);

  -- ═══ ③ النطاق الزمني — العطل ① ════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);

  -- ★★★ كان يجلب 23؛ الآن 3
  SELECT count(*) INTO v_n FROM public.my_attendance_month(v_y, v_m);
  ASSERT v_n = 3,
    format('3.1 ★★★ سجلّات الشهر = %s (متوقَّع 3) — كانت 23 بلا ترشيح', v_n);
  v_pass := v_pass + 1;

  -- ★★ الشهر السابق يُرجع سجلّاته هو
  SELECT count(*) INTO v_n FROM public.my_attendance_month(
    EXTRACT(YEAR FROM v_prev)::INTEGER, EXTRACT(MONTH FROM v_prev)::INTEGER);
  ASSERT v_n = 20,
    format('3.2 ★★ الشهر السابق = %s (متوقَّع 20) ⇒ التنقّل بين الشهور معطّل', v_n);
  v_pass := v_pass + 1;

  -- ★★ شهر بلا سجلّات يُرجع صفراً لا كل التاريخ
  SELECT count(*) INTO v_n FROM public.my_attendance_month(2001, 5);
  ASSERT v_n = 0,
    format('3.3 ★★ شهر فارغ أعاد %s سجلاً ⇒ النطاق صوري', v_n);
  v_pass := v_pass + 1;

  -- ★ الافتراضي = الشهر الحالي
  SELECT count(*) INTO v_n FROM public.my_attendance_month(NULL, NULL);
  ASSERT v_n = 3, format('3.4 الافتراضي أعاد %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ شهر خارج المدى لا يُسقط الاستعلام
  SELECT count(*) INTO v_n FROM public.my_attendance_month(v_y, 13);
  ASSERT v_n = 0, format('3.5 ★ شهر 13 أعاد %s', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.my_attendance_month(v_y, 0);
  ASSERT v_n = 0, format('3.6 ★ شهر 0 أعاد %s', v_n);
  v_pass := v_pass + 1;

  -- ★ الترتيب تنازلي (الأحدث أولاً)
  ASSERT (SELECT out_shift_date FROM public.my_attendance_month(v_y,v_m) LIMIT 1)
         = v_first + 2,
    '3.7 ★ الترتيب ليس تنازلياً بالتاريخ';
  v_pass := v_pass + 1;

  -- ★★★ تصحيح ذاتي مُوثَّق (نفس درس 0335): التأكيد بهذه الصيغة **لا
  --   يكشف** إلغاء فلتر tenant_id، لأن الشركة ب لها employee_id
  --   مختلف — و`employee_id` معرّف UUID فريد عالمياً فيُقصي الأجانب
  --   ضمناً. أثبتُّه بعكس الشرط إلى `(OR TRUE)`: نجح الاختبار كاملاً.
  --
  --   الكشف الحقيقي يحتاج **نفس employee_id تحت مستأجرين** — حالة
  --   ممكنة لأن `attendance_summary.employee_id` بلا مفتاح أجنبي
  --   يربطه بمستأجره. فلتر المستأجر هو خطّ الدفاع الوحيد.
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
    VALUES (v_tb, v_e, v_first + 10, 'حضور_بوقت', 8);

  SELECT count(*) INTO v_n FROM public.my_attendance_month(v_y, v_m);
  ASSERT v_n = 3,
    format('3.8 ★★★ سجلّات الشهر = %s (متوقَّع 3) ⇒ فلتر tenant_id مُهمَل: '
           'صفّ بنفس employee_id تحت مستأجر آخر تسرّب', v_n);
  v_pass := v_pass + 1;

  SELECT out_total_hours INTO v_num FROM public.my_attendance_month_stats(v_y, v_m);
  ASSERT v_num = 15,
    format('3.9 ★★★ ساعات الشهر = %s (متوقَّع 15) ⇒ الإحصاءات تسرّبت', v_num);
  v_pass := v_pass + 1;

  DELETE FROM public.attendance_summary
   WHERE tenant_id = v_tb AND employee_id = v_e;

  -- ═══ ④ الإحصاءات ══════════════════════════════════════════════════════
  SELECT * INTO r FROM public.my_attendance_month_stats(v_y, v_m);

  ASSERT r.out_total = 3, format('4.1 ★★ الإجمالي = %s (متوقَّع 3)', r.out_total);
  v_pass := v_pass + 1;

  -- ★ الحضور يشمل المتأخر
  ASSERT r.out_present = 2,
    format('4.2 ★ الحضور = %s (متوقَّع 2: في الوقت + متأخر)', r.out_present);
  v_pass := v_pass + 1;

  ASSERT r.out_late = 1, format('4.3 المتأخر = %s', r.out_late);
  v_pass := v_pass + 1;

  ASSERT r.out_absent = 1, format('4.4 الغياب = %s', r.out_absent);
  v_pass := v_pass + 1;

  -- ★★ مجموع الساعات: 8 + 7 + 0 = 15 (كان 175 بلا ترشيح)
  ASSERT r.out_total_hours = 15,
    format('4.5 ★★★ مجموع الساعات = %s (متوقَّع 15) — كان 175', r.out_total_hours);
  v_pass := v_pass + 1;

  -- ★★ المتوسط على أيام الحضور: 15/2 = 7.5 لا 15/3 = 5
  ASSERT r.out_avg_hours = 7.5,
    format('4.6 ★★ المتوسط = %s (متوقَّع 7.5 على أيام الحضور لا 5 على الكل)',
           r.out_avg_hours);
  v_pass := v_pass + 1;

  ASSERT r.out_late_minutes = 30,
    format('4.7 دقائق التأخير = %s (متوقَّع 30)', r.out_late_minutes);
  v_pass := v_pass + 1;

  -- ★★ إحصاءات الشهر السابق مختلفة
  SELECT * INTO r FROM public.my_attendance_month_stats(
    EXTRACT(YEAR FROM v_prev)::INTEGER, EXTRACT(MONTH FROM v_prev)::INTEGER);
  ASSERT r.out_total = 20,
    format('4.8 ★★ إجمالي الشهر السابق = %s (متوقَّع 20)', r.out_total);
  v_pass := v_pass + 1;

  ASSERT r.out_total_hours = 160,
    format('4.9 ساعات الشهر السابق = %s (متوقَّع 160)', r.out_total_hours);
  v_pass := v_pass + 1;

  -- ★★ شهر فارغ يُرجع صفّ أصفار لا «لا شيء» (الواجهة تعرض بطاقات دائماً)
  SELECT count(*) INTO v_n FROM public.my_attendance_month_stats(2001, 5);
  ASSERT v_n = 1,
    format('4.10 ★★ شهر فارغ أعاد %s صفاً (متوقَّع 1 بأصفار) ⇒ NaN في الواجهة', v_n);
  v_pass := v_pass + 1;

  SELECT * INTO r FROM public.my_attendance_month_stats(2001, 5);
  ASSERT r.out_total = 0 AND r.out_avg_hours = 0,
    '4.11 ★ شهر فارغ أعاد أرقاماً';
  v_pass := v_pass + 1;

  -- ★ لا قسمة على صفر حين كل الأيام غياب
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
    VALUES (v_t,v_e,make_date(2010,3,1),'غائب',0);
  SELECT * INTO r FROM public.my_attendance_month_stats(2010, 3);
  ASSERT r.out_avg_hours = 0,
    format('4.12 ★★ متوسط شهر كلّه غياب = %s (متوقَّع 0 لا NULL/خطأ)', r.out_avg_hours);
  v_pass := v_pass + 1;

  -- ═══ ⑤ التتابع — العطل ② ══════════════════════════════════════════════
  -- الحالة: [أقدم→أحدث] 20 حضوراً · حضور · تأخير · غياب
  --   من الأحدث: غائب ⇒ التتابع الحالي = 0
  --   أطول تتابع = 22 (20 + 2)
  SELECT * INTO r FROM public.my_attendance_streak();

  ASSERT r.out_current_streak = 0,
    format('5.1 ★★ التتابع الحالي = %s (متوقَّع 0: آخر يوم غياب)',
           r.out_current_streak);
  v_pass := v_pass + 1;

  ASSERT r.out_longest_streak = 22,
    format('5.2 ★★★ أطول تتابع = %s (متوقَّع 22) — الصيغة القديمة تُرجع 7', r.out_longest_streak);
  v_pass := v_pass + 1;

  ASSERT r.out_last_absence = v_first + 2,
    format('5.3 ★ آخر غياب = %s', r.out_last_absence);
  v_pass := v_pass + 1;

  -- ★★★ الفرق الجوهري: حضور/غياب متناوب
  --   الصيغة القديمة: min(عدد غير الغائب, 7) = 7
  --   الحقيقة: أطول تتابع = 1
  DELETE FROM public.attendance_summary WHERE tenant_id = v_t;
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
  SELECT v_t, v_e, v_first + g,
         CASE WHEN g % 2 = 0 THEN 'حضور_بوقت' ELSE 'غائب' END, 8
    FROM generate_series(0,13) g;

  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_longest_streak = 1,
    format('5.4 ★★★ تناوب حضور/غياب: أطول تتابع = %s (متوقَّع 1؛ '
           'الصيغة القديمة min(7,7)=7)', r.out_longest_streak);
  v_pass := v_pass + 1;

  -- ★★ الأيام بلا سجلّ لا تكسر التتابع (عطلة الأسبوع)
  DELETE FROM public.attendance_summary WHERE tenant_id = v_t;
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours) VALUES
    (v_t,v_e,v_first    ,'حضور_بوقت',8),
    (v_t,v_e,v_first + 1,'حضور_بوقت',8),
    -- فجوة: يوما 2 و3 بلا سجلّ (عطلة)
    (v_t,v_e,v_first + 4,'حضور_بوقت',8),
    (v_t,v_e,v_first + 5,'حضور_بوقت',8);

  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_current_streak = 4,
    format('5.5 ★★★ التتابع مع فجوة عطلة = %s (متوقَّع 4) ⇒ الفجوة تكسر '
           'السلسلة فلا تتجاوز 5 أبداً', r.out_current_streak);
  v_pass := v_pass + 1;

  ASSERT r.out_last_absence IS NULL,
    '5.6 ★ آخر غياب ليس NULL رغم عدم وجود غياب';
  v_pass := v_pass + 1;

  -- ★★★ تصحيح ذاتي ثانٍ: القائمة في التتابع تستثني 'مجاز' عمداً —
  --   الإجازة المعتمَدة ليست حضوراً ولا انقطاعاً، فاحتسابها حضوراً
  --   يُضخّم التتابع زوراً. لم يكن في الاختبار سجلّ إجازة إطلاقاً،
  --   فتوسيع القائمة لتشملها لم يُسقط شيئاً. أُضيف السيناريو:
  DELETE FROM public.attendance_summary WHERE tenant_id = v_t;
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours) VALUES
    (v_t,v_e,v_first    ,'حضور_بوقت',8),
    (v_t,v_e,v_first + 1,'مجاز'   ,0),
    (v_t,v_e,v_first + 2,'مجاز'   ,0),
    (v_t,v_e,v_first + 3,'حضور_بوقت',8);

  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_current_streak = 2,
    format('5.8 ★★★ التتابع مع إجازتين = %s (متوقَّع 2: يوما حضور فقط) '
           '⇒ الإجازة تُحتسب حضوراً فيُضخَّم التتابع', r.out_current_streak);
  v_pass := v_pass + 1;

  -- ★ بلا سجلّات إطلاقاً
  DELETE FROM public.attendance_summary WHERE tenant_id = v_t;
  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_current_streak = 0 AND r.out_longest_streak = 0,
    '5.7 ★ تتابع بلا سجلّات ليس صفراً';
  v_pass := v_pass + 1;

  -- ═══ ⑥ المستخدم بلا سجلّ موظف ═════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);

  SELECT count(*) INTO v_n FROM public.my_attendance_month(v_y, v_m);
  ASSERT v_n = 0, format('6.1 ★ مستخدم بلا ملف رأى %s سجلاً', v_n);
  v_pass := v_pass + 1;

  -- ★ الإحصاءات تُرجع صفّ أصفار (الواجهة تعرض بطاقات)
  SELECT count(*) INTO v_n FROM public.my_attendance_month_stats(v_y, v_m);
  ASSERT v_n = 1, format('6.2 ★ الإحصاءات أعادت %s صفاً (متوقَّع 1 بأصفار)', v_n);
  v_pass := v_pass + 1;

  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_current_streak = 0,
    '6.3 ★ تتابع لمستخدم بلا ملف ليس صفراً';
  v_pass := v_pass + 1;

  -- ═══ ⑦ موظف الشركة ب يرى بياناته وحدها ════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ub::text, TRUE);

  SELECT count(*) INTO v_n FROM public.my_attendance_month(v_y, v_m);
  ASSERT v_n = 1,
    format('7.1 ★★ موظف ب يرى %s سجلاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  SELECT * INTO r FROM public.my_attendance_month_stats(v_y, v_m);
  ASSERT r.out_total_hours = 8,
    format('7.2 ★★ ساعات موظف ب = %s (متوقَّع 8) ⇒ تسريب معاكس',
           r.out_total_hours);
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  verify-my-attendance-0337: % تأكيداً — نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0337';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_VERIFY_0337' THEN
    RAISE NOTICE 'تراجع نظيف — لا أثر في القاعدة.';
  ELSE
    RAISE;
  END IF;
END $$;
