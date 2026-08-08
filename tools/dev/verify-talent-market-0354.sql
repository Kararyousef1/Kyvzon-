-- ============================================================================
-- verify-talent-market-0354.sql
--
-- تحقّق سلوكي من مايجريشن 0354 (خصوصية سجل المؤهلات).
--
-- ★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
--   لكل تأكيد صفٌّ مُخالِف عمداً:
--     · سيرة سرّية للمدير التنفيذي ⇒ تُثبت أن التسريب كان حقيقياً وسُدّ
--     · سيرة مؤرشفة (`__archived`) ⇒ تُثبت أنها لا تظهر
--     · صفّ بشكل `languages` شاذّ (نصّ لا مصفوفة) ⇒ يُثبت حارس النوع
--     · مستأجر أجنبي ⇒ يُثبت الترشيح
--     · موظف بلا سيرة ⇒ يُثبت الترتيب وعدم الاختفاء
--
-- ★ العطل ① لا يُثبَت هنا إثباتاً كاملاً: هذا الملف يعمل بدور postgres
--   (BYPASSRLS). الإثبات الحاسم في `-rls.sh` بدور `authenticated`.
--   ما يُقاس هنا: حارس الدور داخل الدالة، وشكل المُخرجات.
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
  v_emp UUID := gen_random_uuid();
  v_ceo UUID := gen_random_uuid();
  v_arc UUID := gen_random_uuid();
  v_bad UUID := gen_random_uuid();
  v_hrx UUID := gen_random_uuid();
BEGIN
  INSERT INTO tenants(id,name,name_ar,slug) VALUES
    (v_t,'Target','الهدف','t54-'||substr(v_t::text,1,8)),
    (v_x,'Foreign','الأجنبي','x54-'||substr(v_x::text,1,8));

  INSERT INTO auth.users(id,email) VALUES
    (v_hr,'hr@t.co'),(v_emp,'emp@t.co'),(v_ceo,'ceo@t.co'),
    (v_arc,'arc@t.co'),(v_bad,'bad@t.co'),(v_hrx,'hr@x.co');

  INSERT INTO profiles(id,tenant_id,full_name,role,status,phone,position,cv_data) VALUES
    (v_hr, v_t,'مدير الموارد','hr','active','0770','مدير موارد','{}'::jsonb),
    (v_emp,v_t,'موظف عادي','employee','active','0771','فني',
      '{"skills":[{"name":"صيانة"}],"summary":"ملخّص الفني",
        "languages":[{"name":"العربية"},{"name":"الإنجليزية"}]}'::jsonb),
    -- ★★★ السيرة السرّية — الشاهد على العطل ①
    (v_ceo,v_t,'المدير التنفيذي','admin','active','0779999999','CEO',
      '{"skills":[{"name":"تفاوض"},{"name":"صيانة"}],
        "summary":"سيرة سرّية","salary_expectation":"سرّي",
        "languages":[{"name":"العربية"}]}'::jsonb),
    -- ★ سيرة مؤرشفة — بالشكل الذي تُنتجه `archive_my_cv()` فعلاً
    --   (مُحقَّق في 0336:215): الكائن كلّه يصير `{"__archived":{cv,archived_at}}`
    --   ولا يبقى مفتاح آخر. ★★ عيّنتي الأولى كانت خاطئة:
    --   `{"__archived":true,"skills":[…]}` لا تُنتجها الدالة أبداً،
    --   وأسقط ذلك SENTINEL_P3 — الخطأ كان في العيّنة لا في الشيفرة.
    -- ★★★ اسمه يحوي «محاسبة» عمداً: لولا ذلك ما كُشف توسيع p_skill
    --   ليشمل الاسم (عكس INV08b كان ينجو). هذه هي الحالة التي كشفها
    --   التأكيد 4.8 في verify-cv-profile-0336.
    (v_arc,v_t,'موظف محاسبة مؤرشف','employee','active','0772','محاسب',
      '{"__archived":{"cv":{"skills":[{"name":"محاسبة"}]},
                      "archived_at":"2026-01-01T00:00:00Z"}}'::jsonb),
    -- ★ شكل شاذّ: languages نصّ لا مصفوفة — يجب ألّا تسقط الدالة
    (v_bad,v_t,'شكل شاذّ','employee','active','0773','إداري',
      '{"skills":[{"name":"تنظيم"}],"languages":"العربية"}'::jsonb),
    -- ★★★ الأجنبي بمهارة ومنصب **فريدين**: لولاهما لما كُشف تسرّب
    --   الإحصاءات عبر المستأجرين (عكس INV13 كان ينجو).
    (v_hrx,v_x,'مدير أجنبي','hr','active','0999','منصب أجنبي فريد',
      '{"skills":[{"name":"مهارة أجنبية فريدة"}],"summary":"سيرة أجنبية",
        "languages":[{"name":"لغة أجنبية فريدة"}]}'::jsonb);

  INSERT INTO _ctx(k,v) VALUES
    ('t',v_t),('x',v_x),('hr',v_hr),('emp',v_emp),('ceo',v_ceo),
    ('arc',v_arc),('bad',v_bad),('hrx',v_hrx);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ①.0 حارس الاستدعاء
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_ceo UUID := (SELECT v FROM _ctx WHERE k='ceo');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  PERFORM * FROM public.hr_talent_profiles();
  PERFORM * FROM public.hr_talent_profile_detail(v_ceo);
  PERFORM * FROM public.hr_talent_skill_stats();
  RAISE WARNING '✔ ①.0 حارس الاستدعاء — الدوال الثلاث تعمل';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② ★★★ القائمة لا تحمل cv_data إطلاقاً
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n INTEGER;
BEGIN
  -- الدالة لا تُصرّح بعمود cv_data في توقيعها أصلاً
  SELECT count(*) INTO n
    FROM information_schema.routines r
    JOIN information_schema.parameters p
      ON p.specific_name = r.specific_name
   WHERE r.routine_name = 'hr_talent_profiles'
     AND p.parameter_mode = 'OUT'
     AND p.parameter_name = 'out_cv_data';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_L1: القائمة ما زالت تُصرّح بـout_cv_data';
  END IF;

  -- وتُصرّح بأسماء المهارات فقط
  SELECT count(*) INTO n
    FROM information_schema.routines r
    JOIN information_schema.parameters p
      ON p.specific_name = r.specific_name
   WHERE r.routine_name = 'hr_talent_profiles'
     AND p.parameter_mode = 'OUT'
     AND p.parameter_name = 'out_skills';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_L2: out_skills مفقود';
  END IF;

  RAISE WARNING '✔ ② شكل المُخرجات — 2 تأكيدان (لا cv_data في القائمة)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ القائمة والبحث والأرشيف
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_arc UUID := (SELECT v FROM _ctx WHERE k='arc');
  v_ceo UUID := (SELECT v FROM _ctx WHERE k='ceo');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- خمسة صفوف للهدف (الأجنبي مُقصى)
  SELECT count(*) INTO n FROM public.hr_talent_profiles();
  IF n <> 5 THEN
    RAISE EXCEPTION 'SENTINEL_P1: الصفوف = % والمتوقَّع 5', n;
  END IF;

  -- العدد الكلّي يُعاد مع كل صفّ
  SELECT out_total_count INTO n FROM public.hr_talent_profiles() LIMIT 1;
  IF n <> 5 THEN
    RAISE EXCEPTION 'SENTINEL_P2: العدد الكلّي = % والمتوقَّع 5', n;
  END IF;

  -- ★★★ الأرشيف: has_cv=false ومهاراته لا تُعَدّ
  SELECT * INTO r FROM public.hr_talent_profiles() WHERE out_id = v_arc;
  IF r.out_has_cv THEN
    RAISE EXCEPTION 'SENTINEL_P3: السيرة المؤرشفة تُعَدّ موجودة';
  END IF;

  -- المدير التنفيذي: مهارتان ولا سيرة كاملة في القائمة
  SELECT * INTO r FROM public.hr_talent_profiles() WHERE out_id = v_ceo;
  IF r.out_skill_count <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_P4: مهارات المدير = % والمتوقَّع 2', r.out_skill_count;
  END IF;
  IF NOT (r.out_skills @> ARRAY['تفاوض']) THEN
    RAISE EXCEPTION 'SENTINEL_P5: أسماء المهارات لا تحوي «تفاوض»';
  END IF;

  -- ★★★ المؤرشف: لا مهارات ولا عدد. لولا هذا التأكيد كان عكس INV14
  --   (اشتقاق المهارات من cv بعد حذف __archived) ينجو — لأن
  --   `cv_skill_names(cv_data)` تُقصي الأرشيف أصلاً بينما الاشتقاق
  --   من `cv` المُنظَّف لا يُقصيه.
  SELECT * INTO r FROM public.hr_talent_profiles() WHERE out_id = v_arc;
  IF r.out_skill_count <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_P5b: مهارات المؤرشف = % والمتوقَّع 0',
      r.out_skill_count;
  END IF;
  IF COALESCE(array_length(r.out_skills, 1), 0) <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_P5c: أسماء مهارات المؤرشف تسرّبت: %', r.out_skills;
  END IF;

  -- ★★★ العطل ②: البحث يُنفَّذ في القاعدة
  --   «صيانة» عند الفني والمدير التنفيذي = 2 (والمؤرشف مُقصى مهاراته)
  SELECT count(*) INTO n FROM public.hr_talent_profiles('صيانة');
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_P6: البحث «صيانة» = % والمتوقَّع 2', n;
  END IF;
  -- ★ البحث النصّي مُعامل مستقلّ (p_text) — لا يُوسّع معنى p_skill
  SELECT count(*) INTO n FROM public.hr_talent_profiles(NULL,200,0,'التنفيذي');
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_P7: البحث بالاسم = % والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.hr_talent_profiles(NULL,200,0,'محاسب');
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_P8: البحث بالمنصب = % والمتوقَّع 1', n;
  END IF;
  -- ★★★ الشاهد: اسمٌ يحوي مهارةً لا يُطابق البحث بالمهارة إن أُرشفت
  --   سيرته. (خطأ ارتكبتُه بتوسيع p_skill وكشفه 4.8 في 0336.)
  SELECT count(*) INTO n FROM public.hr_talent_profiles('محاسبة');
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_P8b: بحث المهارة طابق % رغم الأرشفة', n;
  END IF;
  -- ★ مهارة مؤرشفة لا تُطابَق
  SELECT count(*) INTO n FROM public.hr_talent_profiles('محاسبة');
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_P9: مهارة مؤرشفة طابقت % صفّاً', n;
  END IF;
  SELECT count(*) INTO n FROM public.hr_talent_profiles('لا يوجد إطلاقاً');
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_P10: بحث بلا نتيجة = %', n;
  END IF;

  -- الترقيم
  SELECT count(*) INTO n FROM public.hr_talent_profiles(NULL, 2, 0);
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_P11: الحدّ 2 أعاد % صفّاً', n;
  END IF;
  SELECT out_total_count INTO n FROM public.hr_talent_profiles(NULL, 2, 0) LIMIT 1;
  IF n <> 5 THEN
    RAISE EXCEPTION 'SENTINEL_P12: العدد الكلّي مع الحدّ = % والمتوقَّع 5', n;
  END IF;

  RAISE WARNING '✔ ③ القائمة والبحث — 15 تأكيداً (البحث في القاعدة · الأرشيف مُقصى)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ التفاصيل — الفصل والخصوصية
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr  UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_emp UUID := (SELECT v FROM _ctx WHERE k='emp');
  v_ceo UUID := (SELECT v FROM _ctx WHERE k='ceo');
  v_arc UUID := (SELECT v FROM _ctx WHERE k='arc');
  r RECORD;
BEGIN
  -- الموظّف (staff) يرى التفاصيل
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  SELECT * INTO r FROM public.hr_talent_profile_detail(v_ceo);
  IF r.out_cv_data ->> 'summary' <> 'سيرة سرّية' THEN
    RAISE EXCEPTION 'SENTINEL_D1: hr لا يرى الملخّص';
  END IF;

  -- ★★★ الموظف العادي يرى سيرته هو
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, true);
  SELECT * INTO r FROM public.hr_talent_profile_detail(v_emp);
  IF r.out_cv_data ->> 'summary' <> 'ملخّص الفني' THEN
    RAISE EXCEPTION 'SENTINEL_D2: الموظف لا يرى سيرته هو';
  END IF;

  -- ★★★ ولا يرى سيرة المدير التنفيذي
  BEGIN
    PERFORM * FROM public.hr_talent_profile_detail(v_ceo);
    RAISE EXCEPTION 'SENTINEL_D3: موظف عادي قرأ سيرة المدير التنفيذي';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_D3' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- الأرشيف لا يُعاد حتى في التفاصيل
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  SELECT * INTO r FROM public.hr_talent_profile_detail(v_arc);
  IF r.out_cv_data ? '__archived' THEN
    RAISE EXCEPTION 'SENTINEL_D4: مفتاح __archived تسرّب';
  END IF;

  RAISE WARNING '✔ ④ التفاصيل — 4 تأكيدات (الموظف سيرته وحدها)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ الإحصاءات — في القاعدة وبحارس نوع
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  n BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- «صيانة» عند اثنين (المؤرشف مُقصى)
  SELECT out_count INTO n FROM public.hr_talent_skill_stats()
   WHERE out_kind = 'skill' AND out_label = 'صيانة';
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_S1: «صيانة» = % والمتوقَّع 2', n;
  END IF;

  -- ★ مهارة المؤرشف لا تُحتسب
  SELECT count(*) INTO n FROM public.hr_talent_skill_stats()
   WHERE out_kind = 'skill' AND out_label = 'محاسبة';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_S2: مهارة مؤرشفة ظهرت في الإحصاءات';
  END IF;

  -- السِيَر المكتملة: الفني · المدير · الشكل الشاذّ = 3
  --   (مدير الموارد بلا سيرة · والمؤرشف حُذف أرشيفه ⇒ {})
  SELECT out_count INTO n FROM public.hr_talent_skill_stats()
   WHERE out_kind = 'cv_count';
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_S3: السِيَر المكتملة = % والمتوقَّع 3', n;
  END IF;

  -- ★★★ حارس النوع: languages نصّ عند «شكل شاذّ» — الدالة لا تسقط
  --   والعربية عند الفني والمدير = 2
  SELECT out_count INTO n FROM public.hr_talent_skill_stats()
   WHERE out_kind = 'language' AND out_label = 'العربية';
  IF n <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_S4: «العربية» = % والمتوقَّع 2', n;
  END IF;

  -- المناصب
  SELECT out_count INTO n FROM public.hr_talent_skill_stats()
   WHERE out_kind = 'position' AND out_label = 'CEO';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_S5: منصب CEO = % والمتوقَّع 1', n;
  END IF;

  -- ★★★ العزل داخل الإحصاءات: لا شيء من المستأجر الأجنبي
  SELECT count(*) INTO n FROM public.hr_talent_skill_stats()
   WHERE out_label = 'مهارة أجنبية فريدة';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_S6: تسرّبت مهارة المستأجر الأجنبي للإحصاءات';
  END IF;
  SELECT count(*) INTO n FROM public.hr_talent_skill_stats()
   WHERE out_label = 'منصب أجنبي فريد';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_S7: تسرّب منصب المستأجر الأجنبي';
  END IF;
  SELECT count(*) INTO n FROM public.hr_talent_skill_stats()
   WHERE out_label = 'لغة أجنبية فريدة';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_S8: تسرّبت لغة المستأجر الأجنبي';
  END IF;
  -- وعدد السِيَر لا يشمله
  SELECT out_count INTO n FROM public.hr_talent_skill_stats()
   WHERE out_kind = 'cv_count';
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_S9: عدد السِيَر = % والمتوقَّع 3 (الأجنبي مُقصى)', n;
  END IF;

  RAISE WARNING '✔ ⑤ الإحصاءات — 9 تأكيدات (حارس النوع · العزل)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ الحارس والعزل والخصائص
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_emp UUID := (SELECT v FROM _ctx WHERE k='emp');
  v_hrx UUID := (SELECT v FROM _ctx WHERE k='hrx');
  r RECORD; n INTEGER := 0;
BEGIN
  -- ★★★ العطل ①: الموظف العادي مرفوض من القائمة والإحصاءات
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, true);
  BEGIN
    PERFORM * FROM public.hr_talent_profiles();
    RAISE EXCEPTION 'SENTINEL_G1: موظف عادي قرأ سجل المؤهلات';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_G1' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.hr_talent_skill_stats();
    RAISE EXCEPTION 'SENTINEL_G2: موظف عادي قرأ الإحصاءات';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_G2' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- العزل: الأجنبي يرى صفّه وحده
  PERFORM set_config('request.jwt.claim.sub', v_hrx::text, true);
  SELECT count(*) INTO n FROM public.hr_talent_profiles();
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_G3: الأجنبي يرى % صفّاً والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.hr_talent_profiles()
   WHERE out_full_name LIKE '%التنفيذي%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_G4: تسرّب المدير التنفيذي للأجنبي';
  END IF;

  -- الخصائص
  FOR r IN
    SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN ('hr_talent_profiles','hr_talent_profile_detail',
                         'hr_talent_skill_stats')
  LOOP
    n := n + 1;
    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'SENTINEL_G5: % ليست SECURITY DEFINER', r.proname;
    END IF;
    IF r.provolatile <> 's' THEN
      RAISE EXCEPTION 'SENTINEL_G6: % ليست STABLE', r.proname;
    END IF;
    IF r.proconfig IS NULL OR NOT ('search_path=public' = ANY(r.proconfig)) THEN
      RAISE EXCEPTION 'SENTINEL_G7: % بلا search_path=public', r.proname;
    END IF;
  END LOOP;
  IF n <> 3 THEN
    RAISE EXCEPTION 'SENTINEL_G8: الدوال = % والمتوقَّع 3', n;
  END IF;

  -- ★ درس 0353: anon لا ينفّذ شيئاً
  IF has_function_privilege('anon','public.hr_talent_profiles(text,integer,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'SENTINEL_G9: anon ينفّذ hr_talent_profiles';
  END IF;
  IF has_function_privilege('anon','public.hr_talent_profile_detail(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'SENTINEL_G10: anon ينفّذ hr_talent_profile_detail';
  END IF;

  RAISE WARNING '✔ ⑥ الحارس والعزل — 10 تأكيدات (anon مرفوض · الموظف مرفوض)';
END $$;

DO $$ BEGIN
  RAISE WARNING '════════════════════════════════════════════════════════';
  RAISE WARNING '  0354 — 40 تأكيداً · صفر فشل';
  RAISE WARNING '════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
