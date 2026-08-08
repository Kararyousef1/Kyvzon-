-- ============================================================================
-- verify-cv-profile-0336.sql
--
-- الملف الشخصي: بحث المهارات · أرشفة السيرة الذاتية.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
-- العزل عبر RLS الحقيقي في verify-cv-profile-0336-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة:
--   profiles.cv_data :: JSONB NOT NULL DEFAULT '{}'  (0333)
--   ★ تعارض الشكل: النوع الرسمي CvData يتوقّع skills: string[]
--     بينما ProfilePage.tsx تكتب skills: {name, level}[]
--     jsonb_array_elements_text على الكائن تُخرجه **كاملاً كنصّ**:
--       '{"name": "React", "level": "متقدم"}'
--     فالبحث يُطابق المفاتيح والقيم معاً.
--   محفّز trg_ensure_employee_row (0317) يُنشئ سجلّ موظف تلقائياً
--   قيد uq_employee_per_user_tenant (0335) يمنع سجلّاً ثانياً
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_a     UUID := gen_random_uuid();   -- مهارات ككائنات (ProfilePage)
  v_b     UUID := gen_random_uuid();   -- مهارات كنصوص (النوع الرسمي)
  v_c     UUID := gen_random_uuid();   -- بلا سيرة
  v_bb    UUID := gen_random_uuid();   -- شركة أخرى
  -- ★ 0354: سجل المؤهلات صار محروساً بـstaff — نحتاج هوية hr للبحث
  v_hr    UUID := gen_random_uuid();
  v_n     INT;
  v_txt   TEXT;
  v_bool  BOOLEAN;
  v_json  JSONB;
  v_pass  INT := 0;
  r       RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'CA','سير أ','cv36a-'||substr(v_t::text ,1,8)),
    (v_tb,'CB','سير ب','cv36b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_a ,'a-' ||substr(v_a::text ,1,8)||'@c36.io'),
    (v_b ,'b-' ||substr(v_b::text ,1,8)||'@c36.io'),
    (v_c ,'c-' ||substr(v_c::text ,1,8)||'@c36.io'),
    (v_bb,'bb-'||substr(v_bb::text,1,8)||'@c36.io'),
    (v_hr,'hr-'||substr(v_hr::text,1,8)||'@c36.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
    (v_a ,v_t ,'خبير React','employee','التقنية'),
    (v_b ,v_t ,'محلّل بيانات','employee','التقنية'),
    (v_c ,v_t ,'موظف جديد','employee','الإدارة'),
    (v_bb,v_tb,'موظف شركة ب','employee','التقنية'),
    (v_hr,v_t ,'مدير الموارد','hr','الإدارة');

  -- ★ الشكل الذي تكتبه ProfilePage: كائنات {name, level}
  UPDATE public.profiles SET cv_data = '{
    "template":"modern","summary":"مطوّر واجهات",
    "skills":[{"name":"React","level":"متقدم"},{"name":"TypeScript","level":"متوسط"}],
    "languages":[{"name":"العربية","level":"ممتاز"}],
    "hobbies":["القراءة"]
  }'::jsonb WHERE id = v_a;

  -- ★ الشكل الرسمي: نصوص مجرّدة
  UPDATE public.profiles SET cv_data = '{
    "summary":"محلّل",
    "skills":["SQL","Python"],
    "education":["بكالوريوس إحصاء"]
  }'::jsonb WHERE id = v_b;

  -- شركة ب — للعزل
  UPDATE public.profiles SET cv_data = '{
    "skills":[{"name":"React","level":"مبتدئ"}]
  }'::jsonb WHERE id = v_bb;

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('cv_skill_names','archive_my_cv','restore_my_cv','my_cv_archive_info');
  ASSERT v_n = 4, format('1.1 دوال 0336 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★ cv_skill_names نقيّة: IMMUTABLE يسمح بالفهرسة التعبيرية
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='cv_skill_names') = 'i',
    '1.2 ★ cv_skill_names ليست IMMUTABLE';
  v_pass := v_pass + 1;

  -- ★ دوال الكتابة VOLATILE (درس 0320)
  FOR v_txt IN SELECT unnest(ARRAY['archive_my_cv','restore_my_cv'])
  LOOP
    ASSERT (SELECT bool_and(p.provolatile = 'v') FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.3 ★ %s ليست VOLATILE — الكتابة مستحيلة في STABLE', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★★★ تحديث 0354 — تصحيح معلن:
  --   كان `hr_talent_profiles` ضمن هذه القائمة بحجّة أن INVOKER يحترم
  --   RLS. **الحجّة سقطت بالتشغيل**: سياسة القراءة على `profiles` هي
  --   (tenant_id = current_user_tenant_id()) — أي كل عضو في المستأجر
  --   بلا تمييز دور. مُثبَت بدور authenticated أن موظفاً عادياً قرأ
  --   السيرة الكاملة للمدير التنفيذي.
  --   ⇒ صارت DEFINER **مع حارس دور أضيق** (current_user_is_staff).
  --   دوال السيرة الشخصية الثلاث تبقى INVOKER: حارسها أن المستخدم
  --   يعدّل سيرته هو، وسياسة profiles_update_self تكفي لذلك.
  FOR v_txt IN SELECT unnest(ARRAY['archive_my_cv',
                                   'restore_my_cv','my_cv_archive_info'])
  LOOP
    ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.4 ★★ %s صارت SECURITY DEFINER — تتجاوز RLS', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('cv_skill_names','archive_my_cv','restore_my_cv',
                            'my_cv_archive_info','hr_talent_profiles')),
    '1.5 ★★ anon يملك EXECUTE على إحدى دوال 0336';
  v_pass := v_pass + 1;

  -- ★★★ تحديث 0354: `out_cv_data` **أُزيل عمداً** من القائمة.
  --   كان إرجاع السيرة الكاملة لكل صفّ هو جوهر التسريب: الملخّص
  --   وتوقّعات الراتب تُرسَل لمن يفتح الصفحة. التفاصيل صارت عبر
  --   `hr_talent_profile_detail` بطلب صريح وحارس منفصل.
  --   ⇒ الحارس هنا يفحص الأعمدة الباقية، ويُضاف تأكيد أن cv_data
  --     **لم يعد** موجوداً (أدناه).
  FOR v_txt IN SELECT unnest(ARRAY['out_id','out_full_name','out_email','out_phone',
                                   'out_department','out_position','out_profile_image',
                                   'out_has_cv','out_skill_count'])
  LOOP
    ASSERT (SELECT pg_get_function_result(p.oid) LIKE '%'||v_txt||'%'
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='hr_talent_profiles'),
      format('1.6 ★★ العمود %s اختفى من hr_talent_profiles', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★★★ 0354: والعكس أيضاً — cv_data يجب ألّا يعود إلى القائمة
  ASSERT (SELECT pg_get_function_result(p.oid) NOT LIKE '%out_cv_data%'
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='hr_talent_profiles'),
    '1.6b ★★★ out_cv_data عاد إلى القائمة — يعود تسريب السِيَر';
  v_pass := v_pass + 1;

  -- ═══ ② cv_skill_names — يقبل الشكلين ═════════════════════════════════
  -- ★ شكل ProfilePage: كائنات
  ASSERT public.cv_skill_names(
    '{"skills":[{"name":"React","level":"متقدم"}]}'::jsonb) = ARRAY['React'],
    format('2.1 ★★ استخراج من كائن = %s',
           public.cv_skill_names('{"skills":[{"name":"React","level":"متقدم"}]}'::jsonb));
  v_pass := v_pass + 1;

  -- ★ الشكل الرسمي: نصوص
  ASSERT public.cv_skill_names('{"skills":["SQL","Python"]}'::jsonb)
         = ARRAY['SQL','Python'],
    '2.2 ★ استخراج من نصوص فشل';
  v_pass := v_pass + 1;

  -- ★ خليط الشكلين في مصفوفة واحدة
  ASSERT public.cv_skill_names(
    '{"skills":["SQL",{"name":"React","level":"متقدم"}]}'::jsonb)
    = ARRAY['SQL','React'],
    '2.3 ★★ الخليط لا يُعالَج';
  v_pass := v_pass + 1;

  -- ★ سيرة بلا مهارات
  ASSERT public.cv_skill_names('{"summary":"لا مهارات"}'::jsonb) = ARRAY[]::TEXT[],
    '2.4 سيرة بلا مهارات لم تُعِد مصفوفة فارغة';
  v_pass := v_pass + 1;

  -- ★★ skills ليست مصفوفة (بيانات تالفة) — لا تُسقط الدالة
  ASSERT public.cv_skill_names('{"skills":"نصّ خاطئ"}'::jsonb) = ARRAY[]::TEXT[],
    '2.5 ★★ skills غير مصفوفة أسقطت الدالة';
  v_pass := v_pass + 1;

  -- ★ كائن بلا name يُتخطّى لا يُنتج NULL
  ASSERT public.cv_skill_names(
    '{"skills":[{"level":"متقدم"},{"name":"Go"}]}'::jsonb) = ARRAY['Go'],
    '2.6 ★ كائن بلا name لم يُتخطَّ';
  v_pass := v_pass + 1;

  -- ★ الفراغات تُقصى
  ASSERT public.cv_skill_names(
    '{"skills":[{"name":"  "},{"name":"Rust"}]}'::jsonb) = ARRAY['Rust'],
    '2.7 ★ مهارة فارغة لم تُقصَ';
  v_pass := v_pass + 1;

  -- ═══ ③ البحث — العطل ① ════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_a::text, TRUE);

  -- ★★★ العطل الأصلي: «متقدم» مستوى لا مهارة
  -- ★★★ 0354: البحث في سجل المؤهلات يحتاج دور staff
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, TRUE);

  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('متقدم',200,0);
  ASSERT v_n = 0,
    format('3.1 ★★★ البحث عن «متقدم» = %s (متوقَّع 0) — المستوى يُعامَل كمهارة', v_n);
  v_pass := v_pass + 1;

  -- ★★ ولا «level» ولا «name» (مفاتيح JSON)
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('level',200,0);
  ASSERT v_n = 0,
    format('3.2 ★★ البحث عن مفتاح «level» = %s ⇒ الكائن يُبحَث كنصّ خام', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('name',200,0);
  ASSERT v_n = 0, format('3.3 ★★ البحث عن مفتاح «name» = %s', v_n);
  v_pass := v_pass + 1;

  -- ✅ والمهارة الحقيقية تُوجَد
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('React',200,0);
  ASSERT v_n = 1, format('3.4 ★ البحث عن React = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ✅ والشكل الرسمي يعمل أيضاً
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('SQL',200,0);
  ASSERT v_n = 1, format('3.5 ★ البحث في مصفوفة النصوص = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ البحث جزئي وغير حسّاس للحالة
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('reac',200,0);
  ASSERT v_n = 1, format('3.6 ★ البحث الجزئي «reac» = %s', v_n);
  v_pass := v_pass + 1;

  -- ★★ مهارة غير موجودة تُعيد صفراً (الترشيح فعّال لا صوري)
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('COBOL',200,0);
  ASSERT v_n = 0, format('3.7 ★★ مهارة غير موجودة أعادت %s', v_n);
  v_pass := v_pass + 1;

  -- ★ عدّ المهارات صحيح للشكلين
  SELECT out_skill_count INTO v_n FROM public.hr_talent_profiles(NULL,200,0)
   WHERE out_id = v_a;
  ASSERT v_n = 2, format('3.8 عدّ مهارات الكائنات = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_skill_count INTO v_n FROM public.hr_talent_profiles(NULL,200,0)
   WHERE out_id = v_b;
  ASSERT v_n = 2, format('3.9 عدّ مهارات النصوص = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_skill_count INTO v_n FROM public.hr_talent_profiles(NULL,200,0)
   WHERE out_id = v_c;
  ASSERT v_n = 0, format('3.10 عدّ مهارات من بلا سيرة = %s', v_n);
  v_pass := v_pass + 1;

  -- ★★ عزل: موظف شركة ب لا يظهر رغم أن مهارته React
  ASSERT NOT EXISTS (SELECT 1 FROM public.hr_talent_profiles('React',200,0)
                      WHERE out_full_name = 'موظف شركة ب'),
    '3.11 ★★ تسريب: ملف من شركة أخرى ظهر في البحث';
  v_pass := v_pass + 1;

  -- ★★★ استرجاع هوية صاحب السيرة قبل قسم الأرشفة:
  --   `archive_my_cv()` تعمل على `auth.uid()`، وقسم البحث أعلاه بدّل
  --   الهوية إلى مدير الموارد. نسيان هذا السطر أسقط 4.2 فوراً —
  --   والاختبار كشفه بدل أن يمرّ صامتاً.
  PERFORM set_config('request.jwt.claim.sub', v_a::text, TRUE);

  -- ═══ ④ الأرشفة — العطل ② ══════════════════════════════════════════════
  SELECT * INTO r FROM public.my_cv_archive_info();
  ASSERT NOT r.out_has_archive, '4.1 أرشيف موجود قبل الأرشفة';
  v_pass := v_pass + 1;

  ASSERT public.archive_my_cv(), '4.2 ★★ الأرشفة فشلت';
  v_pass := v_pass + 1;

  -- ★★ السيرة اختفت من العرض
  -- ★★★ تحديث 0354: `v_a` موظف عادي لا يقرأ سجل المؤهلات. والمقصود
  --   التحقّق من **سيرته هو** — عبر hr_talent_profile_detail.
  SELECT (out_cv_data <> '{}'::jsonb) INTO v_bool
    FROM public.hr_talent_profile_detail(v_a);
  ASSERT NOT v_bool,
    '4.3 ★★ السيرة المؤرشفة ما زالت تظهر';
  v_pass := v_pass + 1;

  -- ★★ ولا تُعاد في cv_data
  SELECT out_cv_data INTO v_json FROM public.hr_talent_profile_detail(v_a);
  ASSERT v_json = '{}'::jsonb,
    format('4.4 ★★ cv_data المُعاد = %s (متوقَّع {}) — الأرشيف تسرّب للواجهة', v_json);
  v_pass := v_pass + 1;

  -- ★★ لكنها محفوظة فعلاً — هذا جوهر الفرق عن الحذف
  SELECT * INTO r FROM public.my_cv_archive_info();
  ASSERT r.out_has_archive, '4.5 ★★★ الأرشيف مفقود — الأرشفة صارت حذفاً';
  v_pass := v_pass + 1;

  ASSERT r.out_archived_at IS NOT NULL, '4.6 ★ وقت الأرشفة لم يُسجَّل';
  v_pass := v_pass + 1;

  ASSERT r.out_skill_count = 2,
    format('4.7 ★ مهارات الأرشيف = %s (متوقَّع 2)', r.out_skill_count);
  v_pass := v_pass + 1;

  -- ★★ البحث لا يجد المؤرشف
  -- ★ 0354: البحث يحتاج staff — نبدّل الهوية مؤقتاً ثم نُرجعها.
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, TRUE);
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('React',200,0);
  PERFORM set_config('request.jwt.claim.sub', v_a::text, TRUE);
  ASSERT v_n = 0,
    format('4.8 ★★ البحث وجد %s في سيرة مؤرشفة', v_n);
  v_pass := v_pass + 1;

  -- ★ أرشفة ثانية لا تُتلف الأرشيف الأول
  ASSERT NOT public.archive_my_cv(),
    '4.9 ★★ أرشفة سيرة فارغة نجحت — تُتلف الأرشيف القائم';
  v_pass := v_pass + 1;

  SELECT * INTO r FROM public.my_cv_archive_info();
  ASSERT r.out_skill_count = 2,
    '4.10 ★★★ الأرشيف أُتلف بأرشفة ثانية';
  v_pass := v_pass + 1;

  -- ═══ ⑤ الاسترجاع ══════════════════════════════════════════════════════
  ASSERT public.restore_my_cv(), '5.1 ★★ الاسترجاع فشل';
  v_pass := v_pass + 1;

  -- ★★★ تحديث 0354: `v_a` دوره `employee` ولم يعد يقرأ سجل المؤهلات.
  --   والمقصود هنا التحقّق من **سيرته هو** بعد الاسترجاع — وهذا ما
  --   تتيحه `hr_talent_profile_detail` (الموظف يرى سيرته وحدها).
  SELECT (out_cv_data <> '{}'::jsonb) INTO v_bool
    FROM public.hr_talent_profile_detail(v_a);
  ASSERT v_bool, '5.2 ★★ السيرة لم تعد بعد الاسترجاع';
  v_pass := v_pass + 1;

  SELECT COALESCE(array_length(public.cv_skill_names(out_cv_data), 1), 0)
    INTO v_n FROM public.hr_talent_profile_detail(v_a);
  ASSERT v_n = 2, format('5.3 ★ مهارات بعد الاسترجاع = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ المحتوى نفسه لا نسخة منقوصة
  SELECT cv_data ->> 'summary' INTO v_txt FROM public.profiles WHERE id = v_a;
  ASSERT v_txt = 'مطوّر واجهات',
    format('5.4 ★★ الملخّص بعد الاسترجاع = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★ الأرشيف نُظّف بعد الاسترجاع
  SELECT * INTO r FROM public.my_cv_archive_info();
  ASSERT NOT r.out_has_archive, '5.5 ★ الأرشيف باقٍ بعد الاسترجاع';
  v_pass := v_pass + 1;

  -- ★ استرجاع بلا أرشيف يُعيد FALSE لا خطأ
  ASSERT NOT public.restore_my_cv(), '5.6 استرجاع بلا أرشيف لم يُعِد FALSE';
  v_pass := v_pass + 1;

  -- ═══ ⑥ من بلا سيرة ════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_c::text, TRUE);

  ASSERT NOT public.archive_my_cv(),
    '6.1 ★ أرشفة سيرة فارغة نجحت';
  v_pass := v_pass + 1;

  SELECT * INTO r FROM public.my_cv_archive_info();
  ASSERT NOT r.out_has_archive, '6.2 أرشيف وهمي لمن بلا سيرة';
  v_pass := v_pass + 1;

  -- ★ cv_data يبقى {} لا NULL (0333)
  SELECT cv_data INTO v_json FROM public.profiles WHERE id = v_c;
  ASSERT v_json = '{}'::jsonb,
    format('6.3 ★ cv_data لمن بلا سيرة = %s (متوقَّع {})', v_json);
  v_pass := v_pass + 1;

  -- ═══ ⑦ المستخدم المعدوم ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);

  ASSERT NOT public.archive_my_cv(), '7.1 ★★ مستخدم بلا ملف أرشف شيئاً';
  v_pass := v_pass + 1;

  ASSERT NOT public.restore_my_cv(), '7.2 ★★ مستخدم بلا ملف استرجع شيئاً';
  v_pass := v_pass + 1;

  -- ★★★ تحديث 0354: كانت تُرجع صفراً بصمت؛ صارت ترفع «لا يمكن تحديد
  --   المستأجر». الرفض الصريح أفضل: الصمت يُقرأ «لا بيانات» لا «لا هوية».
  BEGIN
    SELECT count(*) INTO v_n FROM public.hr_talent_profiles(NULL,200,0);
    RAISE EXCEPTION 'SENTINEL_736A: مستخدم بلا مستأجر رأى % ملفاً', v_n;
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_736A' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑧ شركة ب ═════════════════════════════════════════════════════════
  -- ★★★ تحديث 0354: `v_bb` دوره `employee` — والسجل صار محروساً
  --   بـcurrent_user_is_staff(). فالعزل بين المستأجرين يُقاس الآن
  --   بدور staff في `verify-talent-market-0354.sql` (SENTINEL_G3/G4)
  --   و`-rls.sh`. وما يُقاس هنا: أن الموظف العادي **مرفوض أصلاً**،
  --   وهو حارس أقوى من العزل نفسه.
  PERFORM set_config('request.jwt.claim.sub', v_bb::text, TRUE);

  BEGIN
    SELECT count(*) INTO v_n FROM public.hr_talent_profiles(NULL,200,0);
    RAISE EXCEPTION 'SENTINEL_836: موظف عادي قرأ سجل المؤهلات (% صفّاً)', v_n;
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_836' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  BEGIN
    SELECT count(*) INTO v_n FROM public.hr_talent_profiles('React',200,0);
    RAISE EXCEPTION 'SENTINEL_836B: موظف عادي بحث في سجل المؤهلات';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_836B' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  verify-cv-profile-0336: % تأكيداً — نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0336';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_VERIFY_0336' THEN
    RAISE NOTICE 'تراجع نظيف — لا أثر في القاعدة.';
  ELSE
    RAISE;
  END IF;
END $$;
