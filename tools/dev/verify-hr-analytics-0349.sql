-- ============================================================================
-- verify-hr-analytics-0349.sql
--
-- تحقّق سلوكي من مايجريشن 0349 (تحليلات الموارد البشرية).
--
-- ★★★ القاعدة المُستفادة (تكرّرت أربع عشرة مرة):
--     «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
--
--   لذلك كل تأكيد هنا يُقابله صفٌّ مُخالِف عمداً:
--     · مستأجر أجنبي بنفس البنية      ⇒ يُثبت أن الترشيح يعمل
--     · صفّ `profiles` بمعرّف يساوي `employees.id` لموظف آخر
--       ⇒ يُثبت أن العطل ① كان حقيقياً وأن الإصلاح ليس مصادفة
--     · بلاغ مؤرشف                     ⇒ يُثبت استثناء المؤرشف
--     · بلاغ من السنة الماضية بنفس الشهر ⇒ يُثبت أن السنة تُحترم
--     · أيام `عطلة` و`مجاز`            ⇒ تُثبت المقام الصحيح
--
--   وكل رقم متوقَّع **محسوب يدوياً** في التعليق فوقه.
--
-- ★ حارس ①.0 أولاً: يستدعي كل دالة بمستأجر حقيقي قبل أي قياس.
--   («طُبِّق بنجاح» لا يفحص أجسام الاستعلامات في PL/pgSQL.)
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = WARNING;

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- تهيئة: مستأجران — الهدف والأجنبي
-- ───────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE _ctx (k TEXT PRIMARY KEY, v UUID);

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();   -- المستأجر الهدف
  v_x     UUID := gen_random_uuid();   -- المستأجر الأجنبي
  v_d1    UUID := gen_random_uuid();   -- قسم: الهندسة
  v_d2    UUID := gen_random_uuid();   -- قسم: الجودة (الصفّ الخادع وحده)
  v_d3    UUID := gen_random_uuid();   -- قسم: التسويق — **خالٍ تماماً**
  v_dx    UUID := gen_random_uuid();   -- قسم أجنبي
  v_admin UUID := gen_random_uuid();
  v_p1    UUID := gen_random_uuid();
  v_p2    UUID := gen_random_uuid();
  v_px    UUID := gen_random_uuid();
  v_xadm  UUID := gen_random_uuid();
  v_e1 UUID; v_e2 UUID; v_ex UUID;
  v_m0 DATE := date_trunc('month', CURRENT_DATE)::DATE;
BEGIN
  INSERT INTO tenants(id,name,name_ar,slug) VALUES
    (v_t,'Target','الهدف','t-'||substr(v_t::text,1,8)),
    (v_x,'Foreign','الأجنبي','x-'||substr(v_x::text,1,8));

  -- ★★★ التسويق خالٍ تماماً: لا صفّ profiles نصّه 'التسويق' ⇒ لا موظف.
  --   وجودُه شرطٌ لاختبار أن LEFT JOIN لا يُخفي الأقسام الفارغة.
  --   (بدونه كان عكس INV15 ينجو — لا بيانات تخالف الشرط.)
  INSERT INTO departments(id,tenant_id,name_ar) VALUES
    (v_d1,v_t,'الهندسة'), (v_d2,v_t,'الجودة'), (v_d3,v_t,'التسويق'),
    (v_dx,v_x,'قسم أجنبي');

  INSERT INTO auth.users(id,email) VALUES
    (v_admin,'admin@t.co'), (v_p1,'p1@t.co'), (v_p2,'p2@t.co'),
    (v_px,'px@x.co'), (v_xadm,'xadm@x.co');

  INSERT INTO profiles(id,tenant_id,full_name,role,department,status) VALUES
    (v_admin,v_t,'مدير الموارد','hr','الهندسة','active'),
    (v_p1,   v_t,'علي',        'employee','الهندسة','active'),
    (v_p2,   v_t,'سارة',       'employee','الهندسة','active'),
    (v_xadm, v_x,'مدير أجنبي', 'hr','قسم أجنبي','active'),
    (v_px,   v_x,'أجنبي',      'employee','قسم أجنبي','active');

  -- محفّز 0317 ينشئ صفوف employees تلقائياً من profiles
  SELECT id INTO v_e1 FROM employees WHERE tenant_id=v_t AND user_id=v_p1;
  SELECT id INTO v_e2 FROM employees WHERE tenant_id=v_t AND user_id=v_p2;
  SELECT id INTO v_ex FROM employees WHERE tenant_id=v_x AND user_id=v_px;

  UPDATE employees SET department_id=v_d1 WHERE id IN (v_e1,v_e2);
  UPDATE employees SET department_id=v_dx WHERE id=v_ex;

  INSERT INTO _ctx(k,v) VALUES
    ('t',v_t),('x',v_x),('d1',v_d1),('d2',v_d2),('d3',v_d3),('admin',v_admin),
    ('p1',v_p1),('p2',v_p2),('e1',v_e1),('e2',v_e2),('ex',v_ex),
    ('xadm',v_xadm);

  -- ═══ العطل ① — الشاهد الحاسم ═══════════════════════════════════════════
  --   نُنشئ صفّ `profiles` معرّفه **يساوي** `employees.id` للموظف الأول.
  --   المنطق القديم `profiles.find(p => p.id === w.employee_id)` كان
  --   سيلتقط هذا الصفّ ويَنسِب صحة «علي» إلى قسم هذا الدخيل.
  --   الإصلاح يربط عبر employees.id مباشرةً ⇒ لا يراه إطلاقاً.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_e1) THEN
    INSERT INTO auth.users(id,email) VALUES (v_e1,'decoy@t.co');
  END IF;
  INSERT INTO profiles(id,tenant_id,full_name,role,department,status)
    VALUES (v_e1, v_t, 'صفّ خادع', 'employee', 'الجودة', 'active')
    ON CONFLICT (id) DO NOTHING;

  -- ═══ الصحة النفسية ═════════════════════════════════════════════════════
  --   علي 30 · سارة 40  ⇒ متوسط الهندسة = 35.0 · العيّنات = 2
  INSERT INTO wellness_entries(employee_id,tenant_id,date,score,mood,stress,energy) VALUES
    (v_e1,v_t,v_m0 + 1,30,'bad','80','20'),
    (v_e2,v_t,v_m0 + 1,40,'neutral','70','30');
  --   الأجنبي 99 — يجب ألّا يظهر في أي رقم للهدف
  INSERT INTO wellness_entries(employee_id,tenant_id,date,score,mood,stress,energy)
    VALUES (v_ex,v_x,v_m0 + 1,99,'great','10','95');

  -- ═══ الحضور ════════════════════════════════════════════════════════════
  --   علي : حضور_بوقت · متأخر · عطلة · مجاز · غائب
  --   سارة: حضور_بوقت · حضور_بوقت · عطلة
  --
  --   الحساب اليدوي بتصنيف العطل ⑥ (عطلة ومجاز خارج المقام):
  --     المجموع الخام            = 8 صفوف
  --     عطلة = 2 · مجاز = 1      ⇒ خارج المقام
  --     أيام العمل               = 8 − 2 − 1 = 5
  --     الحضور الفعلي            = (حضور_بوقت+متأخر) + (حضور_بوقت×2) = 4
  --     الغياب = 1 · التأخير = 1
  --     معدل الحضور  = 4/5 = 80.0%
  --     معدل الغياب  = 1/5 = 20.0%
  --     معدل التأخير = 1/5 = 20.0%
  --
  --   ★ المنطق القديم: المقام 8 (يشمل العطلتين والمجاز) والبسط 7
  --     (كل ما ليس غائب) ⇒ 87.5% — تضخيم 7.5 نقطة.
  INSERT INTO attendance_summary(tenant_id,employee_id,shift_date,status,late_minutes) VALUES
    (v_t,v_e1,v_m0 + 1,'حضور_بوقت',0),
    (v_t,v_e1,v_m0 + 2,'متأخر',   25),
    (v_t,v_e1,v_m0 + 3,'عطلة',     0),
    (v_t,v_e1,v_m0 + 4,'مجاز',     0),
    (v_t,v_e1,v_m0 + 5,'غائب',     0),
    (v_t,v_e2,v_m0 + 1,'حضور_بوقت',0),
    (v_t,v_e2,v_m0 + 2,'حضور_بوقت',0),
    (v_t,v_e2,v_m0 + 3,'عطلة',     0);
  --   الأجنبي: كله غائب — لو تسرّب لانهار معدل الهدف
  INSERT INTO attendance_summary(tenant_id,employee_id,shift_date,status,late_minutes) VALUES
    (v_t,v_ex,v_m0 + 1,'غائب',0);
  --   ★ لاحظ: الصفّ أعلاه tenant_id = الهدف لكن employee_id أجنبي.
  --     الدالة تربط بـ emp (موظفي الهدف) ⇒ يُقصى. لولا الربط لتسرّب.

  -- ═══ البلاغات ══════════════════════════════════════════════════════════
  --   (أ) مُغلق داخل الشهر الحالي — 4 أيام بالضبط
  INSERT INTO incidents(id,tenant_id,reported_by,employee_id,title,description,
                        category,severity,status,created_at,closed_at)
    VALUES (gen_random_uuid(),v_t,v_p1,v_e1,'مغلق حديث','د','hr','low','closed',
            (v_m0 + 1)::timestamptz, (v_m0 + 5)::timestamptz);
  --   (ب) مُغلق بنفس الشهر لكن **السنة الماضية** — 10 أيام
  --       المنطق القديم `getMonth()` كان يحتسبه ضمن «هذا الشهر».
  INSERT INTO incidents(id,tenant_id,reported_by,employee_id,title,description,
                        category,severity,status,created_at,closed_at)
    VALUES (gen_random_uuid(),v_t,v_p1,v_e1,'مغلق قديم','د','hr','low','closed',
            (v_m0 + 1 - INTERVAL '1 year')::timestamptz,
            (v_m0 + 11 - INTERVAL '1 year')::timestamptz);
  --   (ج) مفتوح
  INSERT INTO incidents(id,tenant_id,reported_by,employee_id,title,description,
                        category,severity,status,created_at)
    VALUES (gen_random_uuid(),v_t,v_p2,v_e2,'مفتوح','د','hr','low','pending',
            (v_m0 + 2)::timestamptz);
  --   (د) مفتوح لكنه **مؤرشف** — يجب ألّا يُعدّ مفتوحاً
  INSERT INTO incidents(id,tenant_id,reported_by,employee_id,title,description,
                        category,severity,status,created_at,archived_at)
    VALUES (gen_random_uuid(),v_t,v_p2,v_e2,'مؤرشف','د','hr','low','pending',
            (v_m0 + 2)::timestamptz, now());

  -- ═══ بلاغ للمستأجر الأجنبي في الشهر نفسه ═══════════════════════════════
  --   ★★★ شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.
  --   بلا هذا الصفّ كان عكس INV09 (إسقاط ترشيح tenant من اتجاه البلاغات)
  --   ينجو: لم يكن للأجنبي أيّ بلاغ فلا فرق بين الترشيح وعدمه.
  INSERT INTO incidents(id,tenant_id,reported_by,employee_id,title,description,
                        category,severity,status,created_at,closed_at)
    VALUES (gen_random_uuid(),v_x,v_px,v_ex,'بلاغ أجنبي','د','hr','low','closed',
            (v_m0 + 1)::timestamptz, (v_m0 + 2)::timestamptz);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- حارس ①.0 — استدعاء كل دالة فعلياً
-- ═══════════════════════════════════════════════════════════════════════════
--   PL/pgSQL لا يفحص أجسام الاستعلامات عند الإنشاء. اسمُ عمودٍ خاطئ يمرّ
--   في المايجريشن ويسقط عند أول استدعاء. هذا الحارس يُجبر الاستدعاء.

DO $$
DECLARE
  v_admin UUID := (SELECT v FROM _ctx WHERE k='admin');
  n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  PERFORM * FROM public.hr_analytics_overview();
  PERFORM * FROM public.hr_analytics_departments();
  PERFORM * FROM public.hr_analytics_wellness_trend();
  PERFORM * FROM public.hr_analytics_incident_trend();

  SELECT count(*) INTO n FROM public.hr_analytics_overview();
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_G10: overview أرجعت % صفاً لا 1', n;
  END IF;
  RAISE WARNING '✔ ①.0 حارس الاستدعاء — الدوال الأربع تعمل بمستأجر حقيقي';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② نظرة عامة — الأرقام المحسوبة يدوياً
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin UUID := (SELECT v FROM _ctx WHERE k='admin');
  r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT * INTO r FROM public.hr_analytics_overview(
    date_trunc('month', CURRENT_DATE)::DATE,
    (date_trunc('month', CURRENT_DATE) + INTERVAL '20 days')::DATE
  );

  -- ★ حقيقة مُحقَّقة تشغيلياً (لا تخمين): محفّز 0317 يُنشئ صفّ `employees`
  --   لكل صفّ `profiles` **مهما كان دوره** — بما فيه `hr`. فمستأجر الهدف
  --   فيه أربعة: مدير الموارد · علي · سارة · الصفّ الخادع.
  --   والأجنبي مُقصى. لذلك المتوقَّع 4 لا 2.
  --   ★★ هذا التأكيد أسقط توقّعي الأول (2) وصحّحه — وهو الغرض منه.
  IF r.out_total_employees <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_A1: الموظفون = % والمتوقَّع 4', r.out_total_employees;
  END IF;

  -- ★ العطل ⑥ — أيام العمل = 5 (العطلتان مستبعدتان من المقام)
  IF r.out_working_days <> 5 THEN
    RAISE EXCEPTION 'SENTINEL_A2: أيام العمل = % والمتوقَّع 5 (العطلة تُستبعد)',
      r.out_working_days;
  END IF;
  IF r.out_present_days <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_A3: الحضور = % والمتوقَّع 4', r.out_present_days;
  END IF;
  IF r.out_absent_days <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A4: الغياب = % والمتوقَّع 1', r.out_absent_days;
  END IF;
  IF r.out_late_days <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A5: التأخير = % والمتوقَّع 1', r.out_late_days;
  END IF;
  -- يوما العطلة ويوم المجاز يُعادان صراحةً — لا يختفيان من الحساب
  IF r.out_holiday_days <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A5b: أيام العطلة = % والمتوقَّع 2', r.out_holiday_days;
  END IF;
  IF r.out_leave_days <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A5c: أيام المجاز = % والمتوقَّع 1', r.out_leave_days;
  END IF;
  -- حارس الجمع: العمل + العطلة + المجاز = المجموع الخام 8
  IF r.out_working_days + r.out_holiday_days + r.out_leave_days <> 8 THEN
    RAISE EXCEPTION 'SENTINEL_A5d: %+%+% <> 8 — صفّ ضاع من التصنيف',
      r.out_working_days, r.out_holiday_days, r.out_leave_days;
  END IF;
  -- 4/5 = 80.0 — والمنطق القديم كان 7/8 = 87.5
  IF r.out_attendance_rate <> 80.0 THEN
    RAISE EXCEPTION 'SENTINEL_A6: معدل الحضور = % والمتوقَّع 80.0', r.out_attendance_rate;
  END IF;
  IF r.out_absenteeism_rate <> 20.0 THEN
    RAISE EXCEPTION 'SENTINEL_A7: معدل الغياب = % والمتوقَّع 20.0', r.out_absenteeism_rate;
  END IF;

  -- ★ العطل ① — (30+40)/2 = 35.0 · عيّنتان. الأجنبي (99) مُقصى.
  IF r.out_wellness_score <> 35.0 THEN
    RAISE EXCEPTION 'SENTINEL_A8: مؤشر الصحة = % والمتوقَّع 35.0', r.out_wellness_score;
  END IF;
  IF r.out_wellness_samples <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_A9: عيّنات الصحة = % والمتوقَّع 2', r.out_wellness_samples;
  END IF;

  -- ★ العطل ② — المُغلق في النطاق = 1 فقط (لا 2). القديم يخلط السنة.
  IF r.out_resolved_in_range <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A10: المُغلق = % والمتوقَّع 1 (بلاغ السنة الماضية مُقصى)',
      r.out_resolved_in_range;
  END IF;

  -- ★ العطل ④ — متوسط الحل = 4.00 يوماً محسوباً (لا الثابت 2.4)
  IF r.out_avg_resolution_days <> 4.00 THEN
    RAISE EXCEPTION 'SENTINEL_A11: متوسط الحل = % والمتوقَّع 4.00',
      r.out_avg_resolution_days;
  END IF;
  IF r.out_avg_resolution_days = 2.4 THEN
    RAISE EXCEPTION 'SENTINEL_A12: عاد الثابت 2.4 المُختلَق';
  END IF;

  -- ★ العطل ⑦ — المفتوح = 1 (المؤرشف مُقصى) لا 2
  IF r.out_open_incidents <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_A13: المفتوح = % والمتوقَّع 1 (المؤرشف مُقصى)',
      r.out_open_incidents;
  END IF;

  RAISE WARNING '✔ ② نظرة عامة — 13 تأكيداً (حضور 80%% · صحة 35 · حل 4.00 يوم)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ الأقسام — الشاهد الحاسم على العطل ①
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin UUID := (SELECT v FROM _ctx WHERE k='admin');
  v_d1 UUID := (SELECT v FROM _ctx WHERE k='d1');
  v_d2 UUID := (SELECT v FROM _ctx WHERE k='d2');
  v_d3 UUID := (SELECT v FROM _ctx WHERE k='d3');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  -- قسما الهدف فقط (الهندسة + الجودة) — لا القسم الأجنبي
  SELECT count(*) INTO n FROM public.hr_analytics_departments(
    date_trunc('month', CURRENT_DATE)::DATE,
    (date_trunc('month', CURRENT_DATE) + INTERVAL '20 days')::DATE);
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_D1: الأقسام = % والمتوقَّع 3', n;
  END IF;

  SELECT * INTO r FROM public.hr_analytics_departments(
    date_trunc('month', CURRENT_DATE)::DATE,
    (date_trunc('month', CURRENT_DATE) + INTERVAL '20 days')::DATE)
   WHERE out_department_id = v_d1;

  -- ★ مدير الموارد نفسه له صفّ employees (محفّز 0317) و department_id
  --   أُسند للهندسة في التهيئة ⇒ الهندسة = علي + سارة + المدير = 3.
  --   الصفّ الخادع بلا department_id ⇒ لا ينتمي لأي قسم.
  IF r.out_employee_count <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_D2: موظفو الهندسة = % والمتوقَّع 3', r.out_employee_count;
  END IF;

  -- ★★★ الشاهد: المنطق القديم كان يُنتج 0 هنا دائماً.
  IF r.out_wellness_avg <> 35.0 THEN
    RAISE EXCEPTION 'SENTINEL_D3: متوسط صحة الهندسة = % والمتوقَّع 35.0', r.out_wellness_avg;
  END IF;
  IF r.out_wellness_avg = 0 THEN
    RAISE EXCEPTION 'SENTINEL_D4: عاد العطل ① — صفر مطابقة';
  END IF;
  IF r.out_wellness_samples <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_D5: عيّنات الهندسة = % والمتوقَّع 2', r.out_wellness_samples;
  END IF;

  -- بلاغات الهندسة داخل النطاق: مغلق حديث + مفتوح = 2 (المؤرشف والقديم مُقصيان)
  IF r.out_incident_count <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_D6: بلاغات الهندسة = % والمتوقَّع 2', r.out_incident_count;
  END IF;
  IF r.out_resolved_count <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_D7: المحلول = % والمتوقَّع 1', r.out_resolved_count;
  END IF;
  IF r.out_open_count <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_D8: المفتوح = % والمتوقَّع 1', r.out_open_count;
  END IF;
  IF r.out_attendance_rate <> 80.0 THEN
    RAISE EXCEPTION 'SENTINEL_D9: حضور الهندسة = % والمتوقَّع 80.0', r.out_attendance_rate;
  END IF;

  -- الجودة: يجب أن تظهر ولو بلا قياسات صحة — لا أن تختفي من الجدول.
  --
  -- ★ حقيقة مُحقَّقة: `tg_ensure_employee_row` يستدعي
  --   `resolve_person_department(NEW.id)` ويُسند `department_id` من نصّ
  --   `profiles.department` الحرّ. والصفّ الخادع نصّه 'الجودة'
  --   ⇒ سقط في الجودة. فالجودة فيها موظف واحد (الخادع) لا صفر.
  --   ★★ توقّعي الأول (0 موظف) كان خاطئاً وأسقطه SENTINEL_D11.
  SELECT * INTO r FROM public.hr_analytics_departments(
    date_trunc('month', CURRENT_DATE)::DATE,
    (date_trunc('month', CURRENT_DATE) + INTERVAL '20 days')::DATE)
   WHERE out_department_id = v_d2;
  IF r.out_department_id IS NULL THEN
    RAISE EXCEPTION 'SENTINEL_D10: قسم الجودة اختفى بدل أن يظهر بصفوفه';
  END IF;
  IF r.out_employee_count <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_D11: الجودة = % موظف والمتوقَّع 1', r.out_employee_count;
  END IF;
  -- ★★★ الشاهد الحاسم على العطل ①:
  --   الصفّ الخادع معرّفه في `profiles` **يساوي** `employees.id` لعليّ.
  --   المنطق القديم `profiles.find(p => p.id === w.employee_id)` كان
  --   سيلتقطه ويَنسِب درجة عليّ (30) إلى **الجودة**.
  --   الإصلاح يربط عبر `employees.id` ⇒ الجودة بلا قياسات = 0.
  IF r.out_wellness_avg <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_D12: صحة الجودة = % والمتوقَّع 0 — تسرّبت درجة عبر الصفّ الخادع',
      r.out_wellness_avg;
  END IF;
  IF r.out_wellness_samples <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_D13: عيّنات الجودة = % والمتوقَّع 0', r.out_wellness_samples;
  END IF;

  -- ★★★ التسويق خالٍ تماماً — ويجب أن يظهر بأصفار لا أن يختفي.
  --   هذا التأكيد وحده يُسقط عكس LEFT JOIN ⇒ INNER (INV15).
  SELECT * INTO r FROM public.hr_analytics_departments(
    date_trunc('month', CURRENT_DATE)::DATE,
    (date_trunc('month', CURRENT_DATE) + INTERVAL '20 days')::DATE)
   WHERE out_department_id = v_d3;
  IF r.out_department_id IS NULL THEN
    RAISE EXCEPTION 'SENTINEL_D14: قسم التسويق الخالي اختفى — LEFT JOIN انقلب INNER';
  END IF;
  IF r.out_employee_count <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_D15: التسويق = % موظف والمتوقَّع 0', r.out_employee_count;
  END IF;
  IF r.out_wellness_avg <> 0 OR r.out_incident_count <> 0
     OR r.out_attendance_rate <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_D16: التسويق ليس بأصفار: صحة=% بلاغات=% حضور=%',
      r.out_wellness_avg, r.out_incident_count, r.out_attendance_rate;
  END IF;

  RAISE WARNING '✔ ③ الأقسام — 16 تأكيداً (صحة الهندسة 35.0 لا 0 · الشاهد الخادع لم يُلتقَط)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ الاتجاهات الزمنية — أشهر حقيقية لا أقسام
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin UUID := (SELECT v FROM _ctx WHERE k='admin');
  n INTEGER; v_score NUMERIC; v_m DATE;
  v_m0 DATE := date_trunc('month', CURRENT_DATE)::DATE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  -- ستة أشهر ⇒ ستة صفوف بالضبط، متتالية، آخرها الشهر الحالي
  SELECT count(*) INTO n FROM public.hr_analytics_wellness_trend(6);
  IF n <> 6 THEN
    RAISE EXCEPTION 'SENTINEL_T1: صفوف الاتجاه = % والمتوقَّع 6', n;
  END IF;

  SELECT max(out_month_start) INTO v_m FROM public.hr_analytics_wellness_trend(6);
  IF v_m <> v_m0 THEN
    RAISE EXCEPTION 'SENTINEL_T2: آخر شهر = % والمتوقَّع %', v_m, v_m0;
  END IF;

  -- الشهر الحالي = 35.0 · والأشهر الخالية = 0 لا تختفي
  SELECT out_avg_score INTO v_score
    FROM public.hr_analytics_wellness_trend(6) WHERE out_month_start = v_m0;
  IF v_score <> 35.0 THEN
    RAISE EXCEPTION 'SENTINEL_T3: صحة الشهر = % والمتوقَّع 35.0', v_score;
  END IF;

  SELECT count(*) INTO n FROM public.hr_analytics_wellness_trend(6)
   WHERE out_samples = 0;
  IF n <> 5 THEN
    RAISE EXCEPTION 'SENTINEL_T4: الأشهر الخالية = % والمتوقَّع 5', n;
  END IF;

  -- اتجاه البلاغات: الشهر الحالي 3 واردة (مغلق حديث + مفتوح + مؤرشف؟)
  --   المؤرشف مُقصى ⇒ 2 واردة · 1 مُغلق
  SELECT out_opened INTO n FROM public.hr_analytics_incident_trend(6)
   WHERE out_month_start = v_m0;
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_T5: الواردة = % والمتوقَّع 2 (المؤرشف مُقصى)', n;
  END IF;
  SELECT out_closed INTO n FROM public.hr_analytics_incident_trend(6)
   WHERE out_month_start = v_m0;
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_T6: المُغلقة = % والمتوقَّع 1', n;
  END IF;
  -- ★★★ للأجنبي بلاغ مُغلق في الشهر نفسه. لو سقط ترشيح tenant لصار
  --   الوارد 3 والمُغلق 2. هذان التأكيدان يُسقطان عكس INV09.
  IF n = 2 THEN
    RAISE EXCEPTION 'SENTINEL_T6b: تسرّب بلاغ المستأجر الأجنبي إلى المُغلق';
  END IF;
  SELECT out_avg_days INTO v_score FROM public.hr_analytics_incident_trend(6)
   WHERE out_month_start = v_m0;
  -- المُغلق الوحيد للهدف استغرق 4 أيام. بلاغ الأجنبي استغرق يوماً واحداً
  -- ⇒ لو تسرّب لصار المتوسط 2.50 بدل 4.00.
  IF v_score <> 4.00 THEN
    RAISE EXCEPTION 'SENTINEL_T6c: متوسط أيام الشهر = % والمتوقَّع 4.00 '
      '(2.50 يعني تسرّب الأجنبي)', v_score;
  END IF;

  -- حدود p_months
  BEGIN
    PERFORM * FROM public.hr_analytics_wellness_trend(0);
    RAISE EXCEPTION 'SENTINEL_T7: قُبل p_months=0';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_T7' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.hr_analytics_incident_trend(37);
    RAISE EXCEPTION 'SENTINEL_T8: قُبل p_months=37';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_T8' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ④ الاتجاهات — 10 تأكيدات (6 أشهر حقيقية · الفجوات لا تُطوى)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ العزل والصلاحية
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_xadm UUID := (SELECT v FROM _ctx WHERE k='xadm');
  v_p1   UUID := (SELECT v FROM _ctx WHERE k='p1');
  r RECORD;
BEGIN
  -- المستأجر الأجنبي يرى بياناته وحدها.
  -- موظفوه: الأجنبي + مديره (محفّز 0317 يُنشئ صفّاً لدور hr أيضاً) = 2.
  -- والهدف فيه 4 ⇒ لو تسرّب لظهر 6.
  PERFORM set_config('request.jwt.claim.sub', v_xadm::text, true);
  SELECT * INTO r FROM public.hr_analytics_overview(
    date_trunc('month', CURRENT_DATE)::DATE,
    (date_trunc('month', CURRENT_DATE) + INTERVAL '20 days')::DATE);
  IF r.out_total_employees <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_I1: الأجنبي يرى % موظفاً والمتوقَّع 2', r.out_total_employees;
  END IF;
  IF r.out_wellness_score <> 99.0 THEN
    RAISE EXCEPTION 'SENTINEL_I2: صحة الأجنبي = % والمتوقَّع 99.0', r.out_wellness_score;
  END IF;
  -- ★ الصفّ الذي tenant_id=الهدف و employee_id=أجنبي لا يتسرّب هنا أيضاً
  IF r.out_working_days <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_I3: أيام عمل الأجنبي = % والمتوقَّع 0', r.out_working_days;
  END IF;

  -- موظف عادي (ليس staff) يُرفض
  PERFORM set_config('request.jwt.claim.sub', v_p1::text, true);
  BEGIN
    PERFORM * FROM public.hr_analytics_overview();
    RAISE EXCEPTION 'SENTINEL_I4: موظف عادي نفذ overview';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.hr_analytics_departments();
    RAISE EXCEPTION 'SENTINEL_I5: موظف عادي نفذ departments';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I5' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- نطاق معكوس يُرفض
  PERFORM set_config('request.jwt.claim.sub',
    (SELECT v FROM _ctx WHERE k='admin')::text, true);
  BEGIN
    PERFORM * FROM public.hr_analytics_overview(CURRENT_DATE, CURRENT_DATE - 5);
    RAISE EXCEPTION 'SENTINEL_I6: قُبل نطاق معكوس';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I6' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ⑤ العزل — 6 تأكيدات (الأجنبي معزول · غير staff مرفوض · النطاق محروس)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ خصائص الدوال
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname LIKE 'hr_analytics_%'
  LOOP
    n := n + 1;
    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'SENTINEL_P1: % ليست SECURITY DEFINER', r.proname;
    END IF;
    IF r.provolatile <> 's' THEN
      RAISE EXCEPTION 'SENTINEL_P2: % ليست STABLE (volatile=%)', r.proname, r.provolatile;
    END IF;
    IF r.proconfig IS NULL
       OR NOT ('search_path=public' = ANY(r.proconfig)) THEN
      RAISE EXCEPTION 'SENTINEL_P3: % بلا search_path=public', r.proname;
    END IF;
  END LOOP;
  IF n <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_P4: دوال hr_analytics = % والمتوقَّع 4', n;
  END IF;
  RAISE WARNING '✔ ⑥ الخصائص — 4 دوال · DEFINER · STABLE · search_path';
END $$;

DO $$ BEGIN
  RAISE WARNING '════════════════════════════════════════════════════════';
  RAISE WARNING '  0349 — 51 تأكيداً · صفر فشل';
  RAISE WARNING '════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
