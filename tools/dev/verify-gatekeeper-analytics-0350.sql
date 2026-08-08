-- ============================================================================
-- verify-gatekeeper-analytics-0350.sql
--
-- تحقّق سلوكي من مايجريشن 0350 (عزل البوابة وتحليلات الحركة).
--
-- ★★★ القاعدة (تكرّرت خمس عشرة مرة):
--     «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
--
--   لذلك لكل تأكيد صفٌّ مُخالِف عمداً:
--     · مستأجر أجنبي بنفس البنية        ⇒ يُثبت الترشيح
--     · حركة في وردية لاحقة              ⇒ تُثبت الحدّ الأعلى (العطل ④)
--     · سجلّ زائر قبل النطاق             ⇒ يُثبت الترشيح الزمني (العطل ②)
--     · حركة route_violation=true وملاحظة خالية من الوسم النصّي
--       ⇒ تُثبت أن المصدر هو العمود لا النصّ (العطل ⑤)
--     · وردية باسم حارس مختلف            ⇒ تُثبت البحث (العطل ⑧)
--
-- ★ حارس ①.0 أولاً: يستدعي كل دالة بمستأجر حقيقي قبل أي قياس.
--   («طُبِّق بنجاح» لا يفحص أجسام الاستعلامات في PL/pgSQL.)
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = WARNING;

BEGIN;

CREATE TEMP TABLE _ctx (k TEXT PRIMARY KEY, v UUID);
CREATE TEMP TABLE _t0  (k TEXT PRIMARY KEY, v TIMESTAMPTZ);

DO $$
DECLARE
  v_t   UUID := gen_random_uuid();
  v_x   UUID := gen_random_uuid();
  v_hr  UUID := gen_random_uuid();
  v_emp UUID := gen_random_uuid();
  v_gk  UUID := gen_random_uuid();
  v_hrx UUID := gen_random_uuid();
  v_empx UUID := gen_random_uuid();
  v_s1 UUID := gen_random_uuid();   -- وردية أولى (منتهية)
  v_s2 UUID := gen_random_uuid();   -- وردية ثانية (منتهية)
  v_sx UUID := gen_random_uuid();   -- وردية أجنبية
  -- ★ NOW() ثابت داخل المعاملة — نُثبّت المرجع صراحةً
  v_now TIMESTAMPTZ := date_trunc('hour', NOW());
BEGIN
  INSERT INTO tenants(id,name,name_ar,slug) VALUES
    (v_t,'Target','الهدف','t50-'||substr(v_t::text,1,8)),
    (v_x,'Foreign','الأجنبي','x50-'||substr(v_x::text,1,8));

  INSERT INTO auth.users(id,email) VALUES
    (v_hr,'hr50@t.co'), (v_emp,'emp50@t.co'), (v_gk,'gk50@t.co'),
    (v_hrx,'hr50@x.co'), (v_empx,'emp50@x.co');

  INSERT INTO profiles(id,tenant_id,full_name,role,department,status) VALUES
    (v_hr,  v_t,'مدير الموارد','hr',        'الإدارة','active'),
    (v_emp, v_t,'علي حسن',    'employee',  'الهندسة','active'),
    (v_gk,  v_t,'حارس البوابة','gatekeeper','الأمن','active'),
    (v_hrx, v_x,'مدير أجنبي', 'hr',        'الإدارة','active'),
    (v_empx,v_x,'موظف أجنبي', 'employee',  'الهندسة','active');

  -- ورديتان متتاليتان للهدف + واحدة أجنبية
  INSERT INTO gatekeeper_sessions(id,tenant_id,gatekeeper_id,started_at,ended_at,is_active,handover_status) VALUES
    (v_s1,v_t,v_gk,  v_now - INTERVAL '10 hours', v_now - INTERVAL '6 hours', false,'completed'),
    (v_s2,v_t,v_hr,  v_now - INTERVAL '6 hours',  v_now - INTERVAL '2 hours', false,'completed'),
    (v_sx,v_x,v_hrx, v_now - INTERVAL '10 hours', v_now - INTERVAL '6 hours', false,'completed');

  -- ═══ حركات ═══════════════════════════════════════════════════════════
  --   (أ) داخل الوردية الأولى — مخالفة مسار بالعمود المنطقي
  --       ★ الملاحظة **خالية** من الوسم النصّي '[مخالفة مسار 🚨]'
  --         ⇒ المنطق القديم يراها «ملتزم» والعمود يقول مخالفة.
  INSERT INTO movements_log(tenant_id,employee_id,departure_at,returned_at,
                            destination,route_violation,notes)
    VALUES (v_t,v_emp, v_now - INTERVAL '9 hours', v_now - INTERVAL '8 hours',
            'البنك', true, 'ذهب إلى مكان آخر');
  --   (ب) داخل الوردية الأولى — ملتزم، ولم يعد بعد
  INSERT INTO movements_log(tenant_id,employee_id,departure_at,returned_at,
                            destination,route_violation,notes)
    VALUES (v_t,v_emp, v_now - INTERVAL '7 hours', NULL,
            'الدائرة', false, NULL);
  --   (ج) ★★★ داخل الوردية **الثانية** — يجب ألّا تظهر في أرشيف الأولى
  INSERT INTO movements_log(tenant_id,employee_id,departure_at,returned_at,
                            destination,route_violation,notes)
    VALUES (v_t,v_emp, v_now - INTERVAL '4 hours', v_now - INTERVAL '3 hours',
            'السوق', false, NULL);
  --   (د) قديمة جداً — خارج أي نطاق نفحصه
  INSERT INTO movements_log(tenant_id,employee_id,departure_at,returned_at,
                            destination,route_violation,notes)
    VALUES (v_t,v_emp, v_now - INTERVAL '400 days', v_now - INTERVAL '400 days',
            'قديم', false, NULL);
  --   (هـ) حركة أجنبية في النافذة نفسها
  INSERT INTO movements_log(tenant_id,employee_id,departure_at,returned_at,
                            destination,route_violation,notes)
    VALUES (v_x,v_empx, v_now - INTERVAL '9 hours', v_now - INTERVAL '8 hours',
            'وجهة أجنبية', true, NULL);

  -- ═══ زوّار ═══════════════════════════════════════════════════════════
  --   اثنان في الوردية الأولى (أحدهما لم يخرج) وواحد قديم جداً
  INSERT INTO gatekeeper_visitor_logs(tenant_id,session_id,visitor_name,visitor_phone,
                                      id_number,purpose,host_name,check_in_time,check_out_time,status)
    VALUES
    (v_t,v_s1,'زائر أول','0770','ID-1','اجتماع','علي',
      v_now - INTERVAL '9 hours', v_now - INTERVAL '8 hours','out'),
    (v_t,v_s1,'زائر ثانٍ','0771','ID-2','صيانة','علي',
      v_now - INTERVAL '7 hours', NULL,'in'),
    (v_t,v_s2,'زائر قديم','0772','ID-3','زيارة','علي',
      v_now - INTERVAL '400 days', v_now - INTERVAL '400 days','out');
  --   زائر أجنبي في النافذة نفسها
  INSERT INTO gatekeeper_visitor_logs(tenant_id,session_id,visitor_name,check_in_time,status)
    VALUES (v_x,v_sx,'زائر أجنبي', v_now - INTERVAL '9 hours','out');

  INSERT INTO _ctx(k,v) VALUES
    ('t',v_t),('x',v_x),('hr',v_hr),('emp',v_emp),('gk',v_gk),
    ('hrx',v_hrx),('s1',v_s1),('s2',v_s2),('sx',v_sx);
  INSERT INTO _t0(k,v) VALUES ('now',v_now);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ①.0 حارس الاستدعاء
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_s1 UUID := (SELECT v FROM _ctx WHERE k='s1');
  v_now TIMESTAMPTZ := (SELECT v FROM _t0 WHERE k='now');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  PERFORM * FROM public.gatekeeper_movement_analytics(v_now - INTERVAL '1 day', v_now);
  PERFORM * FROM public.gatekeeper_visitor_analytics(v_now - INTERVAL '1 day', v_now);
  PERFORM * FROM public.gatekeeper_session_archive();
  PERFORM * FROM public.gatekeeper_shift_movements(v_s1);
  RAISE WARNING '✔ ①.0 حارس الاستدعاء — الدوال الأربع تعمل بمستأجر حقيقي';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② العزل — العمود صار إلزامياً والسياسة لا تسمح بـNULL
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD; n INTEGER;
BEGIN
  -- (أ) NOT NULL مفروض على الجدولين
  FOR r IN
    SELECT c.relname, a.attnotnull
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname IN ('gatekeeper_sessions','gatekeeper_visitor_logs')
       AND a.attname = 'tenant_id'
  LOOP
    IF NOT r.attnotnull THEN
      RAISE EXCEPTION 'SENTINEL_S1: %.tenant_id ما زال يقبل NULL', r.relname;
    END IF;
  END LOOP;

  -- (ب) ★★★ الإدراج بلا مستأجر يفشل — كان ينجح ويُسرّب
  BEGIN
    INSERT INTO public.gatekeeper_visitor_logs(tenant_id,visitor_name,check_in_time)
      VALUES (NULL,'زائر يتيم', NOW());
    RAISE EXCEPTION 'SENTINEL_S2: قُبل سجلّ زائر بلا مستأجر';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_S2' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- (ج) ★★★ الفرع `tenant_id IS NULL` حُذف من السياسات الأربع
  SELECT count(*) INTO n
    FROM pg_policy
   WHERE polrelid IN ('gatekeeper_sessions'::regclass,
                      'gatekeeper_visitor_logs'::regclass)
     AND polname LIKE 'kyvzon_%'
     AND pg_get_expr(polqual, polrelid) LIKE '%tenant_id IS NULL%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_S3: % سياسة ما زالت تسمح بمرور tenant_id IS NULL', n;
  END IF;

  -- (د) والسياسات الأربع ما زالت موجودة (لم تُحذف بلا بديل)
  SELECT count(*) INTO n
    FROM pg_policy
   WHERE polrelid IN ('gatekeeper_sessions'::regclass,
                      'gatekeeper_visitor_logs'::regclass)
     AND polname LIKE 'kyvzon_%';
  IF n <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_S4: سياسات kyvzon = % والمتوقَّع 4', n;
  END IF;

  RAISE WARNING '✔ ② العزل — 4 تأكيدات (NOT NULL · رفض اليتيم · لا فرع NULL)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ تحليلات الحركة — الأرقام محسوبة يدوياً
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_now TIMESTAMPTZ := (SELECT v FROM _t0 WHERE k='now');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- نافذة 24 ساعة: الحركات (أ)(ب)(ج) = 3. القديمة والأجنبية مُقصاتان.
  SELECT count(*) INTO n FROM public.gatekeeper_movement_analytics(
    v_now - INTERVAL '24 hours', v_now);
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_M1: الحركات = % والمتوقَّع 3', n;
  END IF;

  -- ★ العطل ⑤: المخالفة من العمود المنطقي — والملاحظة خالية من الوسم
  SELECT * INTO r FROM public.gatekeeper_movement_analytics(
    v_now - INTERVAL '24 hours', v_now) WHERE out_destination = 'البنك';
  IF NOT r.out_route_violation THEN
    RAISE EXCEPTION 'SENTINEL_M2: مخالفة المسار = false والمتوقَّع true';
  END IF;
  IF r.out_notes LIKE '%مخالفة مسار%' THEN
    RAISE EXCEPTION 'SENTINEL_M3: الملاحظة تحوي الوسم النصّي — العيّنة لا تختبر العطل ⑤';
  END IF;

  -- المدة: ساعة واحدة = 3600 ثانية (محسوبة يدوياً)
  IF r.out_duration_secs <> 3600 THEN
    RAISE EXCEPTION 'SENTINEL_M4: المدة = % والمتوقَّع 3600', r.out_duration_secs;
  END IF;

  -- الاسم من profiles لا من اللقطة
  IF r.out_employee_name <> 'علي حسن' THEN
    RAISE EXCEPTION 'SENTINEL_M5: الاسم = % والمتوقَّع «علي حسن»', r.out_employee_name;
  END IF;

  -- من لم يعد: المدة NULL لا صفر (الصفر يعني «عاد فوراً»)
  SELECT * INTO r FROM public.gatekeeper_movement_analytics(
    v_now - INTERVAL '24 hours', v_now) WHERE out_destination = 'الدائرة';
  IF r.out_duration_secs IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_M6: من لم يعد مدته % والمتوقَّع NULL', r.out_duration_secs;
  END IF;

  -- ★ العزل: لا حركة أجنبية
  SELECT count(*) INTO n FROM public.gatekeeper_movement_analytics(
    v_now - INTERVAL '24 hours', v_now) WHERE out_destination = 'وجهة أجنبية';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_M7: تسرّبت % حركة أجنبية', n;
  END IF;

  -- ★ العطل ②: نافذة ضيّقة (آخر 5 ساعات) ⇒ الحركة (ج) وحدها
  SELECT count(*) INTO n FROM public.gatekeeper_movement_analytics(
    v_now - INTERVAL '5 hours', v_now);
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_M8: نافذة 5 ساعات = % والمتوقَّع 1', n;
  END IF;

  RAISE WARNING '✔ ③ الحركة — 8 تأكيدات (المخالفة من العمود · المدة 3600 · النافذة تعمل)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ الزوّار — الترشيح الزمني والأعمدة المسطّحة
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_now TIMESTAMPTZ := (SELECT v FROM _t0 WHERE k='now');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- ★★★ العطل ②: نافذة 24 ساعة ⇒ زائران فقط (القديم مُقصى)
  SELECT count(*) INTO n FROM public.gatekeeper_visitor_analytics(
    v_now - INTERVAL '24 hours', v_now);
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_V1: الزوّار = % والمتوقَّع 2 (القديم مُقصى)', n;
  END IF;
  IF n = 3 THEN
    RAISE EXCEPTION 'SENTINEL_V2: عاد العطل ② — fromDate مُهمَل';
  END IF;

  -- ★★★ العطل ③: الاسم موجود فعلاً — كان v.visitor?.name ⇒ فراغ
  SELECT * INTO r FROM public.gatekeeper_visitor_analytics(
    v_now - INTERVAL '24 hours', v_now) WHERE out_visitor_name = 'زائر أول';
  IF r.out_visitor_name IS NULL OR r.out_visitor_name = '' THEN
    RAISE EXCEPTION 'SENTINEL_V3: اسم الزائر فارغ — عاد العطل ③';
  END IF;
  IF r.out_visitor_phone <> '0770' OR r.out_id_number <> 'ID-1' THEN
    RAISE EXCEPTION 'SENTINEL_V4: الهاتف/الهوية = %/% والمتوقَّع 0770/ID-1',
      r.out_visitor_phone, r.out_id_number;
  END IF;
  IF r.out_purpose <> 'اجتماع' OR r.out_host_name <> 'علي' THEN
    RAISE EXCEPTION 'SENTINEL_V5: الغرض/المضيف = %/%', r.out_purpose, r.out_host_name;
  END IF;
  IF r.out_duration_secs <> 3600 THEN
    RAISE EXCEPTION 'SENTINEL_V6: مدة الزيارة = % والمتوقَّع 3600', r.out_duration_secs;
  END IF;

  -- من لم يخرج: NULL لا صفر
  SELECT * INTO r FROM public.gatekeeper_visitor_analytics(
    v_now - INTERVAL '24 hours', v_now) WHERE out_visitor_name = 'زائر ثانٍ';
  IF r.out_duration_secs IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_V7: من لم يخرج مدته % والمتوقَّع NULL', r.out_duration_secs;
  END IF;

  -- ★ العزل
  SELECT count(*) INTO n FROM public.gatekeeper_visitor_analytics(
    v_now - INTERVAL '24 hours', v_now) WHERE out_visitor_name = 'زائر أجنبي';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_V8: تسرّب زائر أجنبي';
  END IF;

  RAISE WARNING '✔ ④ الزوّار — 8 تأكيدات (النافذة تعمل · الأعمدة المسطّحة تُقرأ)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ الأرشيف — حصر الوردية والبحث
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_s1 UUID := (SELECT v FROM _ctx WHERE k='s1');
  v_sx UUID := (SELECT v FROM _ctx WHERE k='sx');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- ورديتا الهدف فقط (الأجنبية مُقصاة)
  SELECT count(*) INTO n FROM public.gatekeeper_session_archive();
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A1: الورديات = % والمتوقَّع 2', n;
  END IF;

  SELECT * INTO r FROM public.gatekeeper_session_archive() WHERE out_id = v_s1;

  -- ★★★ العطل ④: حركات الوردية الأولى = 2 (أ+ب). الحركة (ج) في الثانية.
  IF r.out_movement_count <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A2: حركات الوردية الأولى = % والمتوقَّع 2 '
      '(3 يعني عودة العطل ④)', r.out_movement_count;
  END IF;
  IF r.out_movement_count = 3 THEN
    RAISE EXCEPTION 'SENTINEL_A3: عاد العطل ④ — الأرشيف تجاوز نهاية الوردية';
  END IF;

  -- زوّار الوردية الأولى = 2
  IF r.out_visitor_count <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A4: زوّار الوردية = % والمتوقَّع 2', r.out_visitor_count;
  END IF;

  -- المدة 4 ساعات = 14400 ثانية
  IF r.out_duration_secs <> 14400 THEN
    RAISE EXCEPTION 'SENTINEL_A5: مدة الوردية = % والمتوقَّع 14400', r.out_duration_secs;
  END IF;

  -- اسم الحارس من profiles
  IF r.out_gatekeeper_name <> 'حارس البوابة' THEN
    RAISE EXCEPTION 'SENTINEL_A6: اسم الحارس = %', r.out_gatekeeper_name;
  END IF;

  -- ★★★ العطل ⑧: البحث يُرشِّح فعلاً
  SELECT count(*) INTO n FROM public.gatekeeper_session_archive('حارس البوابة');
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A7: البحث بالاسم = % والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.gatekeeper_session_archive('لا يوجد إطلاقاً');
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_A8: بحث بلا نتيجة أرجع % والمتوقَّع 0 '
      '(2 يعني أن البحث مُهمَل)', n;
  END IF;
  -- بحث فارغ = كل شيء
  SELECT count(*) INTO n FROM public.gatekeeper_session_archive('   ');
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A9: بحث فارغ = % والمتوقَّع 2', n;
  END IF;

  -- ★★★ حركات وردية بعينها = 2
  SELECT count(*) INTO n FROM public.gatekeeper_shift_movements(v_s1);
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A10: حركات الوردية = % والمتوقَّع 2', n;
  END IF;

  -- ★ وردية أجنبية تُرفض بالاسم لا تُرجع فراغاً صامتاً
  BEGIN
    PERFORM * FROM public.gatekeeper_shift_movements(v_sx);
    RAISE EXCEPTION 'SENTINEL_A11: قُبلت وردية أجنبية';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_A11' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ⑤ الأرشيف — 11 تأكيداً (الحصر بالنهاية · البحث ينفَّذ · الأجنبية مرفوضة)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ العزل والصلاحية والخصائص
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hrx UUID := (SELECT v FROM _ctx WHERE k='hrx');
  v_emp UUID := (SELECT v FROM _ctx WHERE k='emp');
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_now TIMESTAMPTZ := (SELECT v FROM _t0 WHERE k='now');
  r RECORD; n INTEGER := 0;
BEGIN
  -- المستأجر الأجنبي يرى حركته وحدها
  PERFORM set_config('request.jwt.claim.sub', v_hrx::text, true);
  SELECT count(*) INTO n FROM public.gatekeeper_movement_analytics(
    v_now - INTERVAL '24 hours', v_now);
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_I1: الأجنبي يرى % حركة والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.gatekeeper_session_archive();
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_I2: الأجنبي يرى % وردية والمتوقَّع 1', n;
  END IF;

  -- موظف عادي مرفوض من الأربع
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, true);
  BEGIN
    PERFORM * FROM public.gatekeeper_movement_analytics(v_now - INTERVAL '1 day', v_now);
    RAISE EXCEPTION 'SENTINEL_I3: موظف نفذ تحليلات الحركة';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I3' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.gatekeeper_visitor_analytics(v_now - INTERVAL '1 day', v_now);
    RAISE EXCEPTION 'SENTINEL_I4: موظف نفذ سجلّ الزوّار';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.gatekeeper_session_archive();
    RAISE EXCEPTION 'SENTINEL_I5: موظف نفذ الأرشيف';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I5' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- نطاق معكوس مرفوض
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  BEGIN
    PERFORM * FROM public.gatekeeper_movement_analytics(v_now, v_now - INTERVAL '5 hours');
    RAISE EXCEPTION 'SENTINEL_I6: قُبل نطاق معكوس';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I6' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- الخصائص
  n := 0;
  FOR r IN
    SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname LIKE 'gatekeeper_%'
       AND p.proname IN ('gatekeeper_movement_analytics','gatekeeper_visitor_analytics',
                         'gatekeeper_session_archive','gatekeeper_shift_movements')
  LOOP
    n := n + 1;
    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'SENTINEL_P1: % ليست SECURITY DEFINER', r.proname;
    END IF;
    IF r.provolatile <> 's' THEN
      RAISE EXCEPTION 'SENTINEL_P2: % ليست STABLE', r.proname;
    END IF;
    IF r.proconfig IS NULL OR NOT ('search_path=public' = ANY(r.proconfig)) THEN
      RAISE EXCEPTION 'SENTINEL_P3: % بلا search_path=public', r.proname;
    END IF;
  END LOOP;
  IF n <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_P4: الدوال = % والمتوقَّع 4', n;
  END IF;

  RAISE WARNING '✔ ⑥ العزل والخصائص — 10 تأكيدات';
END $$;

DO $$ BEGIN
  RAISE WARNING '════════════════════════════════════════════════════════';
  RAISE WARNING '  0350 — 41 تأكيداً · صفر فشل';
  RAISE WARNING '════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
