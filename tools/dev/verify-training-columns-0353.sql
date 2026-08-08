-- ============================================================================
-- verify-training-columns-0353.sql
--
-- تحقّق سلوكي من مايجريشن 0353 (الأعمدة الناقصة في منظومة التدريب).
--
-- ★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
--   لكل تأكيد صفٌّ مُخالِف عمداً:
--     · موظف اختُبر (score=80) وآخر لم يُختبَر (score=NULL)
--       ⇒ يُثبت أن المتوسط على المُختبَرين وحدهم (المحكّ الأهمّ)
--     · دورة بلا أي مُختبَر ⇒ تُثبت أن avg_score تعود NULL لا 0
--     · مستأجر أجنبي ⇒ يُثبت الترشيح
--     · محاولتان لنفس الاختبار ⇒ تُثبتان «أفضل درجة» لا آخرها
--     · نبضة وقت متكرّرة ⇒ تُثبت التراكم لا الاستبدال
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
  v_hr  UUID := gen_random_uuid();
  v_p1  UUID := gen_random_uuid();
  v_p2  UUID := gen_random_uuid();
  v_hrx UUID := gen_random_uuid();
  v_px  UUID := gen_random_uuid();
  v_e1 UUID; v_e2 UUID; v_ex UUID;
  v_c1 UUID := gen_random_uuid();   -- دورة فيها مُختبَر واحد
  v_c2 UUID := gen_random_uuid();   -- دورة بلا أي مُختبَر
  v_cx UUID := gen_random_uuid();
  v_q1 UUID := gen_random_uuid();
BEGIN
  INSERT INTO tenants(id,name,name_ar,slug) VALUES
    (v_t,'Target','الهدف','t53-'||substr(v_t::text,1,8)),
    (v_x,'Foreign','الأجنبي','x53-'||substr(v_x::text,1,8));

  INSERT INTO auth.users(id,email) VALUES
    (v_hr,'hr53@t.co'),(v_p1,'p1@t.co'),(v_p2,'p2@t.co'),
    (v_hrx,'hr53@x.co'),(v_px,'px@x.co');

  INSERT INTO profiles(id,tenant_id,full_name,role,status) VALUES
    (v_hr, v_t,'مدير الموارد','hr','active'),
    (v_p1, v_t,'علي حسن','employee','active'),
    (v_p2, v_t,'سارة محمد','employee','active'),
    (v_hrx,v_x,'مدير أجنبي','hr','active'),
    (v_px, v_x,'موظف أجنبي','employee','active');

  SELECT id INTO v_e1 FROM employees WHERE tenant_id=v_t AND user_id=v_p1;
  SELECT id INTO v_e2 FROM employees WHERE tenant_id=v_t AND user_id=v_p2;
  SELECT id INTO v_ex FROM employees WHERE tenant_id=v_x AND user_id=v_px;

  INSERT INTO courses(id,tenant_id,title,description,category,level,status) VALUES
    (v_c1,v_t,'دورة فيها اختبار','د','عام','مبتدئ','active'),
    (v_c2,v_t,'دورة بلا اختبار','د','عام','مبتدئ','active'),
    (v_cx,v_x,'دورة أجنبية','د','عام','مبتدئ','active');

  INSERT INTO quizzes(id,tenant_id,course_id,title,questions,passing_score)
    VALUES (v_q1,v_t,v_c1,'اختبار الدورة','[]'::jsonb,60);

  -- ═══ التقدّم ═══════════════════════════════════════════════════════════
  --   c1: علي اختُبر (80) · سارة لم تُختبَر (NULL)
  --   ⇒ avg_score = 80.0 (على المُختبَرين وحدهم) · scored_count = 1
  --     ولو حُوّلت NULL صفراً لصار المتوسط 40.0 — وهو المحكّ الأهمّ.
  INSERT INTO course_progress(tenant_id,course_id,employee_id,progress,completed,score,time_spent)
    VALUES (v_t,v_c1,v_e1,100,true, 80, 3600),
           (v_t,v_c1,v_e2, 50,false,NULL, 600);
  --   c2: التحاق بلا درجة إطلاقاً
  INSERT INTO course_progress(tenant_id,course_id,employee_id,progress,completed,score,time_spent)
    VALUES (v_t,v_c2,v_e1,20,false,NULL,120);
  --   الأجنبي
  INSERT INTO course_progress(tenant_id,course_id,employee_id,progress,completed,score,time_spent)
    VALUES (v_x,v_cx,v_ex,100,true,99,9999);

  INSERT INTO _ctx(k,v) VALUES
    ('t',v_t),('x',v_x),('hr',v_hr),('hrx',v_hrx),('p1',v_p1),('p2',v_p2),
    ('e1',v_e1),('e2',v_e2),('ex',v_ex),('c1',v_c1),('c2',v_c2),('cx',v_cx),
    ('q1',v_q1);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ①.0 حارس الاستدعاء
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  PERFORM * FROM public.training_course_stats();
  PERFORM * FROM public.training_participants();
  PERFORM * FROM public.training_quiz_attempts();
  RAISE WARNING '✔ ①.0 حارس الاستدعاء — الدوال القارئة الثلاث تعمل';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② الأعمدة موجودة بقيودها
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n INTEGER; msg TEXT;
BEGIN
  -- الأعمدة الثلاثة
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='course_progress'
     AND column_name IN ('score','time_spent','last_access_at');
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_A1: أعمدة course_progress الجديدة = % والمتوقَّع 3', n;
  END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='courses' AND column_name='rich_content';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A2: courses.rich_content مفقود';
  END IF;

  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema='public' AND table_name='quiz_attempts';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A3: جدول quiz_attempts مفقود';
  END IF;

  -- ★★★ `score` يجب أن يبقى NULL-able — «لم يُختبَر» ≠ «صفر»
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='course_progress' AND column_name='score'
     AND is_nullable='YES';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A4: score صار NOT NULL — ضاع تمييز «لم يُختبَر»';
  END IF;

  -- ★ ولا DEFAULT صفر عليه
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='course_progress' AND column_name='score'
     AND column_default IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_A5: score له DEFAULT — يُفسد المتوسطات';
  END IF;

  -- القيود تعمل فعلاً
  BEGIN
    UPDATE course_progress SET score = 150 WHERE score = 80;
    RAISE EXCEPTION 'SENTINEL_A6: قُبلت درجة 150';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_A6' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE course_progress SET time_spent = -1 WHERE time_spent = 3600;
    RAISE EXCEPTION 'SENTINEL_A7: قُبل وقت سالب';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_A7' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE courses SET rich_content = '[]'::jsonb WHERE title = 'دورة بلا اختبار';
    RAISE EXCEPTION 'SENTINEL_A8: قُبل rich_content بلا مفتاح blocks';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_A8' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE course_progress SET progress = 120 WHERE progress = 50;
    RAISE EXCEPTION 'SENTINEL_A9: قُبل تقدّم 120%%';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_A9' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ② الأعمدة والقيود — 9 تأكيدات';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ ★★★ المحكّ الأهمّ: المتوسط على المُختبَرين وحدهم
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_c1 UUID := (SELECT v FROM _ctx WHERE k='c1');
  v_c2 UUID := (SELECT v FROM _ctx WHERE k='c2');
  r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  SELECT * INTO r FROM public.training_course_stats() WHERE out_id = v_c1;

  -- علي 80 · سارة NULL ⇒ المتوسط 80.0 لا 40.0
  IF r.out_avg_score <> 80.0 THEN
    RAISE EXCEPTION 'SENTINEL_B1: متوسط الدرجات = % والمتوقَّع 80.0', r.out_avg_score;
  END IF;
  IF r.out_avg_score = 40.0 THEN
    RAISE EXCEPTION 'SENTINEL_B2: المتوسط 40 — أُدخل غير المُختبَرين بصفر';
  END IF;
  IF r.out_scored_count <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_B3: عدد المُختبَرين = % والمتوقَّع 1', r.out_scored_count;
  END IF;
  -- الوقت: 3600 + 600 = 4200
  IF r.out_total_time <> 4200 THEN
    RAISE EXCEPTION 'SENTINEL_B4: الوقت الكلّي = % والمتوقَّع 4200', r.out_total_time;
  END IF;

  -- ★★★ دورة بلا مُختبَر: NULL لا صفر
  SELECT * INTO r FROM public.training_course_stats() WHERE out_id = v_c2;
  IF r.out_avg_score IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_B5: متوسط دورة بلا مُختبَر = % والمتوقَّع NULL',
      r.out_avg_score;
  END IF;
  IF r.out_scored_count <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_B6: مُختبَرو الدورة الخالية = %', r.out_scored_count;
  END IF;
  IF r.out_total_time <> 120 THEN
    RAISE EXCEPTION 'SENTINEL_B7: وقت الدورة الثانية = % والمتوقَّع 120', r.out_total_time;
  END IF;

  RAISE WARNING '✔ ③ المتوسط على المُختبَرين — 7 تأكيدات (80.0 لا 40.0 · NULL لا 0)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ المشاركون — الدرجة والوقت
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_e1 UUID := (SELECT v FROM _ctx WHERE k='e1');
  v_e2 UUID := (SELECT v FROM _ctx WHERE k='e2');
  v_c1 UUID := (SELECT v FROM _ctx WHERE k='c1');
  r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  SELECT * INTO r FROM public.training_participants(v_c1)
   WHERE out_employee_id = v_e1;
  IF r.out_score <> 80 THEN
    RAISE EXCEPTION 'SENTINEL_C1: درجة علي = % والمتوقَّع 80', r.out_score;
  END IF;
  IF r.out_time_spent <> 3600 THEN
    RAISE EXCEPTION 'SENTINEL_C2: وقت علي = % والمتوقَّع 3600', r.out_time_spent;
  END IF;

  -- ★★★ سارة لم تُختبَر ⇒ NULL لا صفر
  SELECT * INTO r FROM public.training_participants(v_c1)
   WHERE out_employee_id = v_e2;
  IF r.out_score IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_C3: درجة من لم تُختبَر = % والمتوقَّع NULL', r.out_score;
  END IF;
  IF r.out_time_spent <> 600 THEN
    RAISE EXCEPTION 'SENTINEL_C4: وقت سارة = % والمتوقَّع 600', r.out_time_spent;
  END IF;

  RAISE WARNING '✔ ④ المشاركون — 4 تأكيدات';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ نبضة الوقت — تراكم لا استبدال
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_p1 UUID := (SELECT v FROM _ctx WHERE k='p1');
  v_c2 UUID := (SELECT v FROM _ctx WHERE k='c2');
  v_cx UUID := (SELECT v FROM _ctx WHERE k='cx');
  r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_p1::text, true);

  -- الوقت الحالي للدورة الثانية = 120 · نضيف 300 ⇒ 420
  SELECT * INTO r FROM public.training_progress_touch(v_c2, 300, 35);
  IF r.out_time_spent <> 420 THEN
    RAISE EXCEPTION 'SENTINEL_D1: الوقت بعد النبضة = % والمتوقَّع 420 (تراكم)',
      r.out_time_spent;
  END IF;
  IF r.out_progress <> 35 THEN
    RAISE EXCEPTION 'SENTINEL_D2: التقدّم = % والمتوقَّع 35', r.out_progress;
  END IF;

  -- ★★★ التقدّم لا يتراجع: نبضة بـ10 بعد 35 تبقيه 35
  SELECT * INTO r FROM public.training_progress_touch(v_c2, 60, 10);
  IF r.out_progress <> 35 THEN
    RAISE EXCEPTION 'SENTINEL_D3: التقدّم تراجع إلى % — نبضة متأخّرة محت إنجازاً',
      r.out_progress;
  END IF;
  IF r.out_time_spent <> 480 THEN
    RAISE EXCEPTION 'SENTINEL_D4: الوقت = % والمتوقَّع 480', r.out_time_spent;
  END IF;

  -- last_access_at امتلأ
  IF (SELECT last_access_at FROM course_progress
       WHERE course_id = v_c2 AND employee_id = public.current_user_employee_id())
     IS NULL THEN
    RAISE EXCEPTION 'SENTINEL_D5: last_access_at ما زال NULL بعد النبضة';
  END IF;

  -- الحدود
  BEGIN
    PERFORM public.training_progress_touch(v_c2, -5);
    RAISE EXCEPTION 'SENTINEL_D6: قُبلت ثوانٍ سالبة';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_D6' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.training_progress_touch(v_c2, 99999);
    RAISE EXCEPTION 'SENTINEL_D7: قُبلت نبضة 99999 ثانية';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_D7' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  -- ★ دورة أجنبية مرفوضة
  BEGIN
    PERFORM public.training_progress_touch(v_cx, 10);
    RAISE EXCEPTION 'SENTINEL_D8: قُبلت نبضة على دورة أجنبية';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_D8' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ⑤ نبضة الوقت — 8 تأكيدات (تراكم · لا تراجع · حدود)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ محاولات الاختبار — أفضل درجة لا آخرها
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_p2 UUID := (SELECT v FROM _ctx WHERE k='p2');
  v_e2 UUID := (SELECT v FROM _ctx WHERE k='e2');
  v_q1 UUID := (SELECT v FROM _ctx WHERE k='q1');
  v_c1 UUID := (SELECT v FROM _ctx WHERE k='c1');
  r RECORD; n INTEGER; v_score NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_p2::text, true);

  -- المحاولة الأولى: 45 ⇒ رسوب (passing_score = 60)
  SELECT * INTO r FROM public.training_quiz_submit(v_q1, 45, '[]'::jsonb, 300);
  IF r.out_attempt_number <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_E1: رقم المحاولة = % والمتوقَّع 1', r.out_attempt_number;
  END IF;
  IF r.out_passed THEN
    RAISE EXCEPTION 'SENTINEL_E2: 45 اعتُبرت نجاحاً و passing_score=60';
  END IF;

  -- المحاولة الثانية: 85 ⇒ نجاح
  SELECT * INTO r FROM public.training_quiz_submit(v_q1, 85, '[]'::jsonb, 200);
  IF r.out_attempt_number <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_E3: رقم المحاولة = % والمتوقَّع 2', r.out_attempt_number;
  END IF;
  IF NOT r.out_passed THEN
    RAISE EXCEPTION 'SENTINEL_E4: 85 لم تُعتبَر نجاحاً';
  END IF;
  IF r.out_best_score <> 85 THEN
    RAISE EXCEPTION 'SENTINEL_E5: أفضل درجة = % والمتوقَّع 85', r.out_best_score;
  END IF;

  -- ★★★ المحاولة الثالثة أسوأ (30) — أفضل درجة تبقى 85 لا 30
  SELECT * INTO r FROM public.training_quiz_submit(v_q1, 30, '[]'::jsonb, 100);
  IF r.out_best_score <> 85 THEN
    RAISE EXCEPTION 'SENTINEL_E6: أفضل درجة = % بعد محاولة أسوأ — المتوقَّع 85',
      r.out_best_score;
  END IF;

  -- سجلّ التقدّم أخذ أفضل درجة
  SELECT score INTO v_score FROM course_progress
   WHERE course_id = v_c1 AND employee_id = v_e2;
  IF v_score <> 85 THEN
    RAISE EXCEPTION 'SENTINEL_E7: درجة سجلّ التقدّم = % والمتوقَّع 85', v_score;
  END IF;

  -- ثلاث محاولات مُسجَّلة
  SELECT count(*) INTO n FROM public.training_quiz_attempts(v_q1);
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_E8: المحاولات = % والمتوقَّع 3', n;
  END IF;

  -- الحدود
  BEGIN
    PERFORM public.training_quiz_submit(v_q1, 150);
    RAISE EXCEPTION 'SENTINEL_E9: قُبلت درجة 150';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_E9' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ⑥ المحاولات — 9 تأكيدات (أفضل درجة 85 لا آخرها 30)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑦ العزل والخصوصية
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hrx UUID := (SELECT v FROM _ctx WHERE k='hrx');
  v_p1  UUID := (SELECT v FROM _ctx WHERE k='p1');
  v_e2  UUID := (SELECT v FROM _ctx WHERE k='e2');
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  n INTEGER; r RECORD;
BEGIN
  -- الأجنبي يرى دورته وحدها بدرجتها
  PERFORM set_config('request.jwt.claim.sub', v_hrx::text, true);
  SELECT count(*) INTO n FROM public.training_course_stats();
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_F1: الأجنبي يرى % دورة والمتوقَّع 1', n;
  END IF;
  SELECT out_avg_score INTO r FROM public.training_course_stats();
  IF r.out_avg_score <> 99.0 THEN
    RAISE EXCEPTION 'SENTINEL_F2: متوسط الأجنبي = % والمتوقَّع 99.0', r.out_avg_score;
  END IF;
  SELECT count(*) INTO n FROM public.training_quiz_attempts();
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_F3: الأجنبي يرى % محاولة والمتوقَّع 0', n;
  END IF;

  -- ★★★ موظف لا يرى محاولات زميله
  PERFORM set_config('request.jwt.claim.sub', v_p1::text, true);
  BEGIN
    PERFORM * FROM public.training_quiz_attempts(NULL, v_e2);
    RAISE EXCEPTION 'SENTINEL_F4: موظف قرأ محاولات زميله';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_F4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  -- وبلا معرّف يرى محاولاته وحده (وهي صفر)
  SELECT count(*) INTO n FROM public.training_quiz_attempts();
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_F5: موظف بلا محاولات يرى % والمتوقَّع 0', n;
  END IF;

  -- والمدير يراها كلها
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  SELECT count(*) INTO n FROM public.training_quiz_attempts(NULL, v_e2);
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_F6: المدير يرى % محاولة والمتوقَّع 3', n;
  END IF;

  RAISE WARNING '✔ ⑦ العزل والخصوصية — 6 تأكيدات';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑧ خصائص الدوال والجدول
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN ('training_progress_touch','training_quiz_submit',
                         'training_quiz_attempts')
  LOOP
    n := n + 1;
    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'SENTINEL_G1: % ليست SECURITY DEFINER', r.proname;
    END IF;
    IF r.proconfig IS NULL OR NOT ('search_path=public' = ANY(r.proconfig)) THEN
      RAISE EXCEPTION 'SENTINEL_G2: % بلا search_path=public', r.proname;
    END IF;
    IF r.proname = 'training_quiz_attempts' THEN
      IF r.provolatile <> 's' THEN
        RAISE EXCEPTION 'SENTINEL_G3: القارئة ليست STABLE';
      END IF;
    ELSIF r.provolatile <> 'v' THEN
      RAISE EXCEPTION 'SENTINEL_G4: % الكاتبة ليست VOLATILE', r.proname;
    END IF;
  END LOOP;
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_G5: الدوال الجديدة = % والمتوقَّع 3', n;
  END IF;

  -- RLS مفعّل على الجدول الجديد
  SELECT count(*) INTO n FROM pg_class
   WHERE relname = 'quiz_attempts' AND relrowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_G6: RLS غير مفعّل على quiz_attempts';
  END IF;

  -- ★★★ لا سياسة UPDATE ولا DELETE — سجلّ اختبار لا يُعدَّل
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'public.quiz_attempts'::regclass
     AND polcmd IN ('w','d');
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_G7: توجد % سياسة تعديل/حذف على المحاولات', n;
  END IF;

  -- ولا فرع tenant_id IS NULL (درس 0350)
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'public.quiz_attempts'::regclass
     AND pg_get_expr(polqual, polrelid) LIKE '%tenant_id IS NULL%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_G8: سياسة تسمح بمرور tenant_id IS NULL';
  END IF;

  RAISE WARNING '✔ ⑧ الخصائص — 8 تأكيدات (لا تعديل للمحاولات · لا فرع NULL)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑨ rich_content يُحفَظ فعلاً عبر training_course_upsert
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ العمود موجود، لكن السؤال الحقيقي: هل الدالة تكتبه؟
--   عمودٌ بلا كاتب = عمود يتيم.

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_id UUID; v_rc JSONB; r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- الإنشاء يكتب المحتوى
  SELECT out_id INTO v_id FROM public.training_course_upsert(
    NULL,'دورة بوسائط',NULL,NULL,NULL,'عام','مبتدئ',NULL,0,FALSE,NULL,
    '{}','{}','active','{"blocks":[{"type":"image","url":"a.png"}]}'::jsonb);
  SELECT rich_content INTO v_rc FROM courses WHERE id = v_id;
  IF jsonb_array_length(v_rc -> 'blocks') <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_R1: كتل المحتوى = % والمتوقَّع 1',
      jsonb_array_length(v_rc -> 'blocks');
  END IF;

  -- ★★★ التعديل بـNULL لا يمحو المحتوى
  PERFORM public.training_course_upsert(
    v_id,'دورة بوسائط محدّثة',NULL,NULL,NULL,'عام','متوسط',NULL,10,FALSE,NULL,
    '{}','{}','active', NULL);
  SELECT rich_content INTO v_rc FROM courses WHERE id = v_id;
  IF jsonb_array_length(v_rc -> 'blocks') <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_R2: التعديل بـNULL محا المحتوى (الكتل = %)',
      jsonb_array_length(v_rc -> 'blocks');
  END IF;

  -- والتعديل بمحتوى جديد يستبدله
  PERFORM public.training_course_upsert(
    v_id,'دورة بوسائط',NULL,NULL,NULL,'عام','مبتدئ',NULL,0,FALSE,NULL,
    '{}','{}','active','{"blocks":[]}'::jsonb);
  SELECT rich_content INTO v_rc FROM courses WHERE id = v_id;
  IF jsonb_array_length(v_rc -> 'blocks') <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_R3: الاستبدال لم يُطبَّق';
  END IF;

  -- شكل خاطئ يُرفض برسالة مفهومة
  BEGIN
    PERFORM public.training_course_upsert(
      NULL,'د',NULL,NULL,NULL,'ع','مبتدئ',NULL,0,FALSE,NULL,
      '{}','{}','active','[]'::jsonb);
    RAISE EXCEPTION 'SENTINEL_R4: قُبل محتوى بلا مفتاح blocks';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_R4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ⑨ محتوى الوسائط — 4 تأكيدات (يُحفَظ · NULL لا يمحو)';
END $$;

DO $$ BEGIN
  RAISE WARNING '════════════════════════════════════════════════════════';
  RAISE WARNING '  0353 — 55 تأكيداً · صفر فشل';
  RAISE WARNING '════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
