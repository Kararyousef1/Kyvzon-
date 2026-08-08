-- ============================================================================
-- verify-training-reports-0351.sql
--
-- تحقّق سلوكي من مايجريشن 0351 (تقارير التدريب).
--
-- ★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
--   لكل تأكيد صفٌّ مُخالِف عمداً:
--     · مستأجر أجنبي بنفس البنية        ⇒ يُثبت الترشيح
--     · موظف لم يلتحق بأي دورة           ⇒ يُثبت LEFT JOIN
--     · دورة بلا ملتحقين                 ⇒ تُثبت أنها لا تختفي
--     · قسم بلا موظفين                   ⇒ يُثبت أنه لا يختفي
--     · التحاق قديم خارج النطاق          ⇒ يُثبت الترشيح الزمني
--     · دورة archived                    ⇒ تُثبت أن status يُقرأ لا active
--
-- ★ حارس ①.0 أولاً: يستدعي كل دالة بمستأجر حقيقي قبل أي قياس.
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = WARNING;

BEGIN;

CREATE TEMP TABLE _ctx (k TEXT PRIMARY KEY, v UUID);

DO $$
DECLARE
  v_t   UUID := gen_random_uuid();
  v_x   UUID := gen_random_uuid();
  v_d1  UUID := gen_random_uuid();   -- الهندسة
  v_d2  UUID := gen_random_uuid();   -- التسويق (خالٍ تماماً)
  v_dx  UUID := gen_random_uuid();
  v_hr  UUID := gen_random_uuid();
  v_p1  UUID := gen_random_uuid();
  v_p2  UUID := gen_random_uuid();
  v_p3  UUID := gen_random_uuid();   -- لم يلتحق بأي دورة
  v_hrx UUID := gen_random_uuid();
  v_px  UUID := gen_random_uuid();
  v_e1 UUID; v_e2 UUID; v_e3 UUID; v_ex UUID; v_ehr UUID;
  v_c1 UUID := gen_random_uuid();    -- دورة نشطة إلزامية
  v_c2 UUID := gen_random_uuid();    -- دورة مؤرشفة
  v_c3 UUID := gen_random_uuid();    -- دورة بلا ملتحقين
  v_cx UUID := gen_random_uuid();
  v_m0 TIMESTAMPTZ := date_trunc('month', NOW());
BEGIN
  INSERT INTO tenants(id,name,name_ar,slug) VALUES
    (v_t,'Target','الهدف','t51-'||substr(v_t::text,1,8)),
    (v_x,'Foreign','الأجنبي','x51-'||substr(v_x::text,1,8));

  INSERT INTO departments(id,tenant_id,name_ar) VALUES
    (v_d1,v_t,'الهندسة'), (v_d2,v_t,'التسويق'), (v_dx,v_x,'قسم أجنبي');

  INSERT INTO auth.users(id,email) VALUES
    (v_hr,'hr51@t.co'), (v_p1,'p1@t.co'), (v_p2,'p2@t.co'),
    (v_p3,'p3@t.co'), (v_hrx,'hr51@x.co'), (v_px,'px@x.co');

  INSERT INTO profiles(id,tenant_id,full_name,role,department,status) VALUES
    (v_hr, v_t,'مدير الموارد','hr',      'الهندسة','active'),
    (v_p1, v_t,'علي حسن',    'employee','الهندسة','active'),
    (v_p2, v_t,'سارة محمد',  'employee','الهندسة','active'),
    (v_p3, v_t,'خالد لم يلتحق','employee','الهندسة','active'),
    (v_hrx,v_x,'مدير أجنبي', 'hr',      'قسم أجنبي','active'),
    (v_px, v_x,'موظف أجنبي', 'employee','قسم أجنبي','active');

  SELECT id INTO v_ehr FROM employees WHERE tenant_id=v_t AND user_id=v_hr;
  SELECT id INTO v_e1  FROM employees WHERE tenant_id=v_t AND user_id=v_p1;
  SELECT id INTO v_e2  FROM employees WHERE tenant_id=v_t AND user_id=v_p2;
  SELECT id INTO v_e3  FROM employees WHERE tenant_id=v_t AND user_id=v_p3;
  SELECT id INTO v_ex  FROM employees WHERE tenant_id=v_x AND user_id=v_px;

  -- ★★★ full_name_ar فارغ لكل موظف (محفّز 0317) — نتحقّق من ذلك صراحةً
  IF (SELECT count(*) FROM employees WHERE tenant_id=v_t
        AND NULLIF(btrim(COALESCE(full_name_ar,'')),'') IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'SENTINEL_PRE1: full_name_ar صار مملوءاً — راجع العيّنة';
  END IF;

  INSERT INTO courses(id,tenant_id,title,description,category,level,status,mandatory) VALUES
    (v_c1,v_t,'السلامة المهنية','د','أمان','مبتدئ','active',  true),
    (v_c2,v_t,'دورة مؤرشفة',   'د','عام', 'متوسط','archived',false),
    (v_c3,v_t,'دورة بلا ملتحقين','د','عام','مبتدئ','active', false),
    (v_cx,v_x,'دورة أجنبية',   'د','عام', 'مبتدئ','active',  false);

  -- ═══ التقدّم ═══════════════════════════════════════════════════════════
  --   c1: علي مكتمل (progress=100) · سارة قيد التنفيذ (progress=40)
  --   ⇒ enrolled=2 · completed=1 · in_progress=1 · not_started=0
  --     avg_progress = (100+40)/2 = 70.0
  --     completion_rate = 1/2 = 50.0%
  INSERT INTO course_progress(tenant_id,course_id,employee_id,progress,completed,approved,started_at,completed_at)
    VALUES (v_t,v_c1,v_e1,100,true,true,  v_m0 + INTERVAL '1 day', v_m0 + INTERVAL '2 days'),
           (v_t,v_c1,v_e2, 40,false,false,v_m0 + INTERVAL '1 day', NULL);

  --   c2 (المؤرشفة): علي التحق قديماً — قبل أكثر من سنة
  --   ★ يُثبت الترشيح الزمني (العطل ③)
  INSERT INTO course_progress(tenant_id,course_id,employee_id,progress,completed,started_at,completed_at)
    VALUES (v_t,v_c2,v_e1,100,true, NOW() - INTERVAL '400 days', NOW() - INTERVAL '399 days');

  --   الأجنبي
  INSERT INTO course_progress(tenant_id,course_id,employee_id,progress,completed,started_at)
    VALUES (v_x,v_cx,v_ex,100,true, v_m0 + INTERVAL '1 day');

  INSERT INTO _ctx(k,v) VALUES
    ('t',v_t),('x',v_x),('d1',v_d1),('d2',v_d2),('hr',v_hr),('hrx',v_hrx),
    ('p1',v_p1),('e1',v_e1),('e2',v_e2),('e3',v_e3),
    ('c1',v_c1),('c2',v_c2),('c3',v_c3),('cx',v_cx),('ehr',v_ehr);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ①.0 حارس الاستدعاء
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  PERFORM * FROM public.training_course_stats();
  PERFORM * FROM public.training_monthly_trend();
  PERFORM * FROM public.training_department_stats();
  PERFORM * FROM public.training_participants();
  RAISE WARNING '✔ ①.0 حارس الاستدعاء — الدوال الأربع القارئة تعمل';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② إحصاءات الدورات — الأعمدة الحقيقية
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_c1 UUID := (SELECT v FROM _ctx WHERE k='c1');
  v_c2 UUID := (SELECT v FROM _ctx WHERE k='c2');
  v_c3 UUID := (SELECT v FROM _ctx WHERE k='c3');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- ثلاث دورات للهدف (الأجنبية مُقصاة)
  SELECT count(*) INTO n FROM public.training_course_stats();
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_C1: الدورات = % والمتوقَّع 3', n;
  END IF;

  SELECT * INTO r FROM public.training_course_stats() WHERE out_id = v_c1;

  IF r.out_enrolled <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_C2: الملتحقون = % والمتوقَّع 2', r.out_enrolled;
  END IF;
  IF r.out_completed <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_C3: المكتملون = % والمتوقَّع 1', r.out_completed;
  END IF;
  IF r.out_in_progress <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_C4: قيد التنفيذ = % والمتوقَّع 1', r.out_in_progress;
  END IF;

  -- ★★★ العطل ①: (100+40)/2 = 70.0 من عمود `progress` الحقيقي.
  --   المنطق القديم يقرأ `progress_percent` المعدوم ⇒ 0.
  IF r.out_avg_progress <> 70.0 THEN
    RAISE EXCEPTION 'SENTINEL_C5: متوسط التقدّم = % والمتوقَّع 70.0', r.out_avg_progress;
  END IF;
  IF r.out_avg_progress = 0 THEN
    RAISE EXCEPTION 'SENTINEL_C6: عاد العطل ① — progress_percent المعدوم';
  END IF;

  IF r.out_completion_rate <> 50.0 THEN
    RAISE EXCEPTION 'SENTINEL_C7: معدل الإتمام = % والمتوقَّع 50.0', r.out_completion_rate;
  END IF;
  IF r.out_approved <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_C8: المعتمدون = % والمتوقَّع 1', r.out_approved;
  END IF;

  -- ★★★ العطل ①: `status` يُقرأ — و`active` معدوم
  IF r.out_status <> 'active' THEN
    RAISE EXCEPTION 'SENTINEL_C9: الحالة = % والمتوقَّع active', r.out_status;
  END IF;
  IF NOT r.out_mandatory THEN
    RAISE EXCEPTION 'SENTINEL_C10: الدورة ليست إلزامية والمتوقَّع نعم';
  END IF;

  -- الدورة المؤرشفة تظهر بحالتها لا تختفي
  SELECT * INTO r FROM public.training_course_stats() WHERE out_id = v_c2;
  IF r.out_status <> 'archived' THEN
    RAISE EXCEPTION 'SENTINEL_C11: حالة المؤرشفة = % والمتوقَّع archived', r.out_status;
  END IF;

  -- ★ دورة بلا ملتحقين تظهر بأصفار — لا تختفي
  SELECT * INTO r FROM public.training_course_stats() WHERE out_id = v_c3;
  IF r.out_id IS NULL THEN
    RAISE EXCEPTION 'SENTINEL_C12: الدورة بلا ملتحقين اختفت';
  END IF;
  IF r.out_enrolled <> 0 OR r.out_avg_progress <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_C13: الدورة الخالية = % ملتحق · تقدّم %',
      r.out_enrolled, r.out_avg_progress;
  END IF;

  -- ★★★ العطل ③: النطاق يعمل — الالتحاق القديم (400 يوماً) مُقصى
  SELECT out_enrolled INTO n FROM public.training_course_stats(
    date_trunc('month', NOW()), NOW()) WHERE out_id = v_c2;
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_C14: النطاق لم يُقصِ الالتحاق القديم = %', n;
  END IF;
  SELECT out_enrolled INTO n FROM public.training_course_stats(
    date_trunc('month', NOW()), NOW()) WHERE out_id = v_c1;
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_C15: النطاق أقصى التحاقاً حديثاً = %', n;
  END IF;

  RAISE WARNING '✔ ② الدورات — 15 تأكيداً (تقدّم 70.0 لا 0 · status لا active)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ الأقسام والمشاركون
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_d1 UUID := (SELECT v FROM _ctx WHERE k='d1');
  v_d2 UUID := (SELECT v FROM _ctx WHERE k='d2');
  v_e3 UUID := (SELECT v FROM _ctx WHERE k='e3');
  v_c1 UUID := (SELECT v FROM _ctx WHERE k='c1');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- قسما الهدف
  SELECT count(*) INTO n FROM public.training_department_stats();
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_D1: الأقسام = % والمتوقَّع 2', n;
  END IF;

  -- الهندسة: مدير + علي + سارة + خالد = 4 موظفين
  SELECT * INTO r FROM public.training_department_stats() WHERE out_department_id = v_d1;
  IF r.out_employees <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_D2: موظفو الهندسة = % والمتوقَّع 4', r.out_employees;
  END IF;
  -- المتدرّبون (أتمّوا): علي وحده = 1
  IF r.out_trained <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_D3: المتدرّبون = % والمتوقَّع 1', r.out_trained;
  END IF;
  -- الملتحقون (موظفون مميّزون): علي وسارة = 2
  IF r.out_enrolled <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_D4: الملتحقون = % والمتوقَّع 2', r.out_enrolled;
  END IF;
  -- المتبقّون = 4 − 1 = 3
  IF r.out_pending <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_D5: المتبقّون = % والمتوقَّع 3', r.out_pending;
  END IF;
  -- 1/4 = 25.0%
  IF r.out_completion_rate <> 25.0 THEN
    RAISE EXCEPTION 'SENTINEL_D6: معدل الإتمام = % والمتوقَّع 25.0', r.out_completion_rate;
  END IF;

  -- ★★★ قسم التسويق خالٍ تماماً — يجب أن يظهر بأصفار (العطل ⑦)
  SELECT * INTO r FROM public.training_department_stats() WHERE out_department_id = v_d2;
  IF r.out_department_id IS NULL THEN
    RAISE EXCEPTION 'SENTINEL_D7: قسم التسويق الخالي اختفى';
  END IF;
  IF r.out_employees <> 0 OR r.out_trained <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_D8: التسويق = % موظف · % متدرّب والمتوقَّع 0 · 0',
      r.out_employees, r.out_trained;
  END IF;

  -- ═══ المشاركون ═══════════════════════════════════════════════════════
  -- ★★★ خالد لم يلتحق بأي دورة — ويجب أن يظهر (LEFT JOIN)
  SELECT count(*) INTO n FROM public.training_participants()
   WHERE out_employee_id = v_e3;
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_P1: خالد (لم يلتحق) ظهر % مرة والمتوقَّع 1', n;
  END IF;

  SELECT * INTO r FROM public.training_participants() WHERE out_employee_id = v_e3;
  IF r.out_status_label <> 'لم يلتحق' THEN
    RAISE EXCEPTION 'SENTINEL_P2: حالة خالد = % والمتوقَّع «لم يلتحق»', r.out_status_label;
  END IF;
  IF r.out_course_id IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_P3: خالد مربوط بدورة وهو لم يلتحق';
  END IF;

  -- ★★★ الاسم: full_name_ar فارغ ⇒ يجب أن تعمل السلسلة الاحتياطية
  IF r.out_employee_name = 'موظف بلا اسم' OR r.out_employee_name IS NULL THEN
    RAISE EXCEPTION 'SENTINEL_P4: الاسم = % — السلسلة الاحتياطية فشلت',
      r.out_employee_name;
  END IF;
  IF r.out_employee_name NOT LIKE '%خالد%' THEN
    RAISE EXCEPTION 'SENTINEL_P5: الاسم = % والمتوقَّع أن يحوي «خالد»',
      r.out_employee_name;
  END IF;
  IF r.out_department <> 'الهندسة' THEN
    RAISE EXCEPTION 'SENTINEL_P6: قسم خالد = % والمتوقَّع الهندسة', r.out_department;
  END IF;

  -- علي في دورة السلامة: progress = 100 مكتمل
  SELECT * INTO r FROM public.training_participants(v_c1)
   WHERE out_employee_name LIKE '%علي%';
  IF r.out_progress <> 100 THEN
    RAISE EXCEPTION 'SENTINEL_P7: تقدّم علي = % والمتوقَّع 100', r.out_progress;
  END IF;
  IF NOT r.out_completed OR r.out_status_label <> 'مكتمل' THEN
    RAISE EXCEPTION 'SENTINEL_P8: حالة علي = %', r.out_status_label;
  END IF;

  -- البحث يُنفَّذ فعلاً
  SELECT count(*) INTO n FROM public.training_participants(NULL, 'سارة');
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_P9: البحث «سارة» = % والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.training_participants(NULL, 'لا يوجد إطلاقاً');
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_P10: بحث بلا نتيجة = % والمتوقَّع 0', n;
  END IF;
  SELECT count(*) INTO n FROM public.training_participants(NULL, '   ');
  IF n < 4 THEN
    RAISE EXCEPTION 'SENTINEL_P11: بحث فارغ = % والمتوقَّع 4 فأكثر', n;
  END IF;

  RAISE WARNING '✔ ③ الأقسام والمشاركون — 17 تأكيداً (من لم يلتحق يظهر · الاسم يعمل)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ الاتجاه الشهري
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  n INTEGER; v_m DATE := date_trunc('month', CURRENT_DATE)::DATE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  SELECT count(*) INTO n FROM public.training_monthly_trend(6);
  IF n <> 6 THEN
    RAISE EXCEPTION 'SENTINEL_T1: الأشهر = % والمتوقَّع 6', n;
  END IF;

  -- الشهر الحالي: التحاقان (علي وسارة في c1) · إتمام واحد
  SELECT out_enrollments INTO n FROM public.training_monthly_trend(6)
   WHERE out_month_start = v_m;
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_T2: التحاقات الشهر = % والمتوقَّع 2', n;
  END IF;
  SELECT out_completions INTO n FROM public.training_monthly_trend(6)
   WHERE out_month_start = v_m;
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_T3: إتمامات الشهر = % والمتوقَّع 1', n;
  END IF;

  -- الأشهر الخالية تظهر بأصفار ولا تُطوى
  SELECT count(*) INTO n FROM public.training_monthly_trend(6)
   WHERE out_enrollments = 0;
  IF n <> 5 THEN
    RAISE EXCEPTION 'SENTINEL_T4: الأشهر الخالية = % والمتوقَّع 5', n;
  END IF;

  -- الحدود
  BEGIN
    PERFORM * FROM public.training_monthly_trend(0);
    RAISE EXCEPTION 'SENTINEL_T5: قُبل p_months=0';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_T5' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.training_monthly_trend(37);
    RAISE EXCEPTION 'SENTINEL_T6: قُبل p_months=37';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_T6' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ④ الاتجاه — 6 تأكيدات';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ الأرشفة بدل الحذف
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_c1 UUID := (SELECT v FROM _ctx WHERE k='c1');
  v_cx UUID := (SELECT v FROM _ctx WHERE k='cx');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- الأرشفة تنجح وتُبقي سجلّات التقدّم
  SELECT * INTO r FROM public.training_course_set_status(v_c1, 'archived');
  IF r.out_status <> 'archived' THEN
    RAISE EXCEPTION 'SENTINEL_A1: الحالة بعد الأرشفة = %', r.out_status;
  END IF;
  -- ★★★ الشاهد: سجلّات التقدّم باقية (الحذف كان يمحوها بـCASCADE)
  IF r.out_enrolled <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A2: سجلّات التقدّم بعد الأرشفة = % والمتوقَّع 2',
      r.out_enrolled;
  END IF;
  SELECT count(*) INTO n FROM public.course_progress WHERE course_id = v_c1;
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A3: التقدّم في القاعدة = % والمتوقَّع 2', n;
  END IF;

  -- الإرجاع
  PERFORM public.training_course_set_status(v_c1, 'active');

  -- حالة غير مسموحة تُرفض
  BEGIN
    PERFORM public.training_course_set_status(v_c1, 'deleted');
    RAISE EXCEPTION 'SENTINEL_A4: قُبلت حالة deleted';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_A4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- دورة أجنبية تُرفض
  BEGIN
    PERFORM public.training_course_set_status(v_cx, 'archived');
    RAISE EXCEPTION 'SENTINEL_A5: قُبلت دورة أجنبية';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_A5' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ⑤ الأرشفة — 5 تأكيدات (التقدّم باقٍ · الأجنبية مرفوضة)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ العزل والصلاحية والخصائص
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hrx UUID := (SELECT v FROM _ctx WHERE k='hrx');
  v_p1  UUID := (SELECT v FROM _ctx WHERE k='p1');
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_c1  UUID := (SELECT v FROM _ctx WHERE k='c1');
  r RECORD; n INTEGER := 0;
BEGIN
  -- الأجنبي يرى دورته وحدها
  PERFORM set_config('request.jwt.claim.sub', v_hrx::text, true);
  SELECT count(*) INTO n FROM public.training_course_stats();
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_I1: الأجنبي يرى % دورة والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.training_department_stats();
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_I2: الأجنبي يرى % قسماً والمتوقَّع 1', n;
  END IF;
  -- ★★ تصحيح توقّعي: `training_participants` تسرد **كل موظفي المستدعي**
  --   (LEFT JOIN كي يظهر من لم يلتحق). فتمرير معرّف دورة أجنبية لا يُقلّل
  --   عدد الصفوف — بل يجعل `course_id` فارغاً في كلّها.
  --   توقّعي الأول (n <= 1) كان خاطئاً وأسقطه SENTINEL_I3.
  --   ★★★ الشاهد الصحيح: أن يكون كل `course_id` فارغاً ولا يتسرّب
  --   عنوان دورة الهدف ولا تقدّم موظفيه.
  SELECT count(*) INTO n FROM public.training_participants(v_c1)
   WHERE out_course_id IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_I3: تسرّبت % صفّ تقدّم من دورة الهدف', n;
  END IF;
  SELECT count(*) INTO n FROM public.training_participants(v_c1)
   WHERE out_course_title <> '—' OR out_progress <> 0;
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_I3b: تسرّب عنوان/تقدّم من دورة الهدف في % صفّ', n;
  END IF;
  -- ولا يرى أسماء موظفي الهدف إطلاقاً
  SELECT count(*) INTO n FROM public.training_participants(v_c1)
   WHERE out_employee_name LIKE '%علي%' OR out_employee_name LIKE '%سارة%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_I3c: تسرّب % اسم موظف من الهدف', n;
  END IF;

  -- موظف عادي مرفوض
  PERFORM set_config('request.jwt.claim.sub', v_p1::text, true);
  BEGIN
    PERFORM * FROM public.training_course_stats();
    RAISE EXCEPTION 'SENTINEL_I4: موظف نفذ إحصاءات الدورات';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.training_participants();
    RAISE EXCEPTION 'SENTINEL_I5: موظف نفذ قائمة المشاركين';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I5' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.training_course_set_status(v_c1, 'archived');
    RAISE EXCEPTION 'SENTINEL_I6: موظف أرشف دورة';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I6' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- نطاق معكوس
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  BEGIN
    PERFORM * FROM public.training_course_stats(NOW(), NOW() - INTERVAL '5 days');
    RAISE EXCEPTION 'SENTINEL_I7: قُبل نطاق معكوس';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I7' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- الخصائص
  n := 0;
  FOR r IN
    SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     -- ★★★ تصحيح: كان `LIKE 'training_%'` فالتقط دوال 0352 الجديدة
     --   (training_course_upsert · training_certifications …) وأسقط
     --   SENTINEL_S4 لأن الكاتبة منها VOLATILE عن قصد.
     --   الحارس يجب أن يفحص **دوال جولته وحدها** — وإلا صار كل
     --   مايجريشن لاحق يكسر اختبار سابق بلا ذنب.
     WHERE ns.nspname = 'public'
       AND p.proname IN ('training_course_stats','training_monthly_trend',
                         'training_department_stats','training_participants',
                         'training_course_set_status')
  LOOP
    n := n + 1;
    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'SENTINEL_S1: % ليست SECURITY DEFINER', r.proname;
    END IF;
    IF r.proconfig IS NULL OR NOT ('search_path=public' = ANY(r.proconfig)) THEN
      RAISE EXCEPTION 'SENTINEL_S2: % بلا search_path=public', r.proname;
    END IF;
    -- الأربع القارئة STABLE · والكاتبة VOLATILE
    IF r.proname = 'training_course_set_status' THEN
      IF r.provolatile <> 'v' THEN
        RAISE EXCEPTION 'SENTINEL_S3: الكاتبة ليست VOLATILE';
      END IF;
    ELSIF r.provolatile <> 's' THEN
      RAISE EXCEPTION 'SENTINEL_S4: % القارئة ليست STABLE', r.proname;
    END IF;
  END LOOP;
  IF n <> 5 THEN
    RAISE EXCEPTION 'SENTINEL_S5: دوال training_ = % والمتوقَّع 5', n;
  END IF;

  RAISE WARNING '✔ ⑥ العزل والخصائص — 14 تأكيداً';
END $$;

DO $$ BEGIN
  RAISE WARNING '════════════════════════════════════════════════════════';
  RAISE WARNING '  0351 — 57 تأكيداً · صفر فشل';
  RAISE WARNING '════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
