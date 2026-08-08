-- ============================================================================
-- verify-cv-and-attendance-0333.sql
--
-- إصلاح عطلَي المتصفح: profiles.cv_data · نطاق سجلّات الحضور.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
-- العزل عبر RLS الحقيقي في verify-cv-and-attendance-0333-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة (information_schema):
--   profiles: 23 عموداً قبل 0333 — **لا cv_data** · department نصّ حرّ
--   attendance_logs: punch_time · punch_type · shift_date NOT NULL
--     employee_id UUID → قيد فريد (tenant_id, employee_id, punch_time)
--   employees NOT NULL: employee_code · first_name · last_name
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_hr    UUID := gen_random_uuid();
  v_e1    UUID := gen_random_uuid();
  v_e2    UUID := gen_random_uuid();
  v_hrb   UUID := gen_random_uuid();
  v_eb    UUID := gen_random_uuid();
  v_emp1  UUID;
  v_emp2  UUID;
  v_empb  UUID;
  v_n     INT;
  v_txt   TEXT;
  v_bool  BOOLEAN;
  v_pass  INT := 0;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'CA','شركة أ','cv33a-'||substr(v_t::text ,1,8)),
    (v_tb,'CB','شركة ب','cv33b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_hr ,'hr-' ||substr(v_hr::text ,1,8)||'@c33.io'),
    (v_e1 ,'e1-' ||substr(v_e1::text ,1,8)||'@c33.io'),
    (v_e2 ,'e2-' ||substr(v_e2::text ,1,8)||'@c33.io'),
    (v_hrb,'hrb-'||substr(v_hrb::text,1,8)||'@c33.io'),
    (v_eb ,'eb-' ||substr(v_eb::text ,1,8)||'@c33.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department,position) VALUES
    (v_hr ,v_t ,'مسؤول الموارد','hr','الإدارة','مدير موارد'),
    (v_e1 ,v_t ,'مبرمج أول','employee','التقنية','مطوّر'),
    (v_e2 ,v_t ,'محاسب','employee','المالية','محاسب'),
    (v_hrb,v_tb,'مسؤول ب','hr','الإدارة','مدير'),
    (v_eb ,v_tb,'موظف ب سرّي','employee','التقنية','مطوّر');
  -- ★ تحديث 0335: المحفّز أنشأ السجلات؛ القيد الجديد يمنع التكرار
  SELECT id INTO v_emp1 FROM public.employees WHERE user_id=v_e1 AND tenant_id=v_t;
  SELECT id INTO v_emp2 FROM public.employees WHERE user_id=v_e2 AND tenant_id=v_t;
  SELECT id INTO v_empb FROM public.employees WHERE user_id=v_eb AND tenant_id=v_tb;
  UPDATE public.employees SET employee_code='E33A1' WHERE id=v_emp1;
  UPDATE public.employees SET employee_code='E33A2' WHERE id=v_emp2;
  UPDATE public.employees SET employee_code='E33B1' WHERE id=v_empb;
  ASSERT v_emp1 IS NOT NULL AND v_emp2 IS NOT NULL AND v_empb IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّات الموظفين — تجهيز باطل';

  -- ═══ ① البنية — العطل ① ═══════════════════════════════════════════════
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='cv_data'),
    '1.1 ★★ profiles.cv_data مفقود — [42703] يعود';
  v_pass := v_pass + 1;

  -- ★ JSONB لا TEXT: الواجهة تستدعي Object.keys() عليه
  ASSERT (SELECT data_type FROM information_schema.columns
           WHERE table_name='profiles' AND column_name='cv_data') = 'jsonb',
    '1.2 ★ cv_data ليس JSONB';
  v_pass := v_pass + 1;

  -- ★★ NOT NULL DEFAULT '{}': NULL يُسقط TalentMarketPage.tsx:268
  ASSERT (SELECT is_nullable FROM information_schema.columns
           WHERE table_name='profiles' AND column_name='cv_data') = 'NO',
    '1.3 ★★ cv_data يقبل NULL — Object.keys(null) يُسقط الصفحة';
  v_pass := v_pass + 1;

  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_name='profiles' AND column_name='cv_data')
         LIKE '%{}%',
    '1.4 ★ افتراضي cv_data ليس كائناً فارغاً';
  v_pass := v_pass + 1;

  -- ★ الملف الجديد يولد بكائن فارغ لا NULL
  ASSERT (SELECT cv_data FROM public.profiles WHERE id=v_e2) = '{}'::jsonb,
    '1.5 ★ ملف جديد بلا cv_data افتراضي';
  v_pass := v_pass + 1;

  -- الفهرسان
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_profiles_cv_data_gin'),
    '1.6 فهرس GIN مفقود — البحث بالمهارة مسح كامل';
  v_pass := v_pass + 1;

  ASSERT (SELECT indexdef LIKE '%WHERE%' FROM pg_indexes
           WHERE indexname='idx_profiles_has_cv'),
    '1.7 ★ فهرس «من لديه سيرة» ليس جزئياً';
  v_pass := v_pass + 1;

  -- الدوال الأربع
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('attendance_today_by_hour','attendance_today_shift_split',
      'attendance_last_7_days','hr_talent_profiles');
  ASSERT v_n = 4, format('1.8 دوال 0333 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★ كلها INVOKER: تحترم RLS
  -- ★★★ تحديث 0354 — تصحيح معلن لهذا الحارس:
  --   كان يشمل `hr_talent_profiles` بحجّة «INVOKER يحترم RLS».
  --   **الحجّة سقطت بالتشغيل**: سياسة القراءة على `profiles` هي
  --     (tenant_id = current_user_tenant_id())
  --   أي **كل عضو في المستأجر** بلا تمييز دور. فكون الدالة INVOKER
  --   لم يمنع شيئاً — مُثبَت بدور authenticated أن موظفاً عادياً قرأ
  --   السيرة الكاملة للمدير التنفيذي («توقّعات الراتب» ورقم هاتفه).
  --
  --   ⇒ صارت في 0354 `SECURITY DEFINER` **مع حارس دور صريح**
  --     (`current_user_is_staff()`) وهو أضيق من RLS لا أوسع.
  --   وحارسها الجديد في `verify-talent-market-0354.sql` و`-rls.sh`.
  --   دوال الحضور الثلاث تبقى INVOKER كما كانت.
  FOR v_txt IN SELECT unnest(ARRAY['attendance_today_by_hour',
                                   'attendance_today_shift_split',
                                   'attendance_last_7_days'])
  LOOP
    ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=v_txt),
      format('1.9 ★★ %s صارت SECURITY DEFINER — تتجاوز RLS', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('attendance_today_by_hour','attendance_today_shift_split',
                            'attendance_last_7_days','hr_talent_profiles')),
    '1.10 ★★ anon يملك EXECUTE على إحدى دوال 0333';
  v_pass := v_pass + 1;

  -- ═══ ② حفظ السيرة الذاتية — كان يفشل بـ42703 ══════════════════════════
  UPDATE public.profiles
     SET cv_data = '{"skills":["React","PostgreSQL","TypeScript"],
                     "education":["بكالوريوس علوم حاسوب"],
                     "certifications":["AWS"],
                     "experience":[{"company":"شركة سابقة","position":"مطوّر"}]}'::jsonb
   WHERE id = v_e1;

  ASSERT (SELECT cv_data->'skills'->>0 FROM public.profiles WHERE id=v_e1) = 'React',
    '2.1 ★★ حفظ السيرة لم يُخزَّن';
  v_pass := v_pass + 1;

  ASSERT (SELECT jsonb_array_length(cv_data->'skills') FROM public.profiles WHERE id=v_e1) = 3,
    '2.2 عدد المهارات المحفوظة خطأ';
  v_pass := v_pass + 1;

  -- ★ الحذف يُفرّغ ولا يُنَل (ProfilePage.tsx:264 يكتب {})
  UPDATE public.profiles SET cv_data = '{}'::jsonb WHERE id = v_e2;
  ASSERT (SELECT cv_data FROM public.profiles WHERE id=v_e2) = '{}'::jsonb,
    '2.3 حذف السيرة لم يُفرّغ الحقل';
  v_pass := v_pass + 1;

  -- ═══ ③ سجل المؤهلات ═══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, TRUE);

  SELECT count(*) INTO v_n FROM public.hr_talent_profiles(NULL,200,0);
  ASSERT v_n = 3, format('3.1 ملفات الشركة = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★ لا تسريب من الشركة الأخرى
  ASSERT NOT EXISTS (SELECT 1 FROM public.hr_talent_profiles(NULL,200,0)
                      WHERE out_full_name = 'موظف ب سرّي'),
    '3.2 ★★ تسريب: ملف من شركة أخرى ظهر في سجل المؤهلات';
  v_pass := v_pass + 1;

  SELECT out_has_cv INTO v_bool FROM public.hr_talent_profiles(NULL,200,0) WHERE out_id=v_e1;
  ASSERT v_bool, '3.3 ★ من له سيرة يظهر has_cv=false';
  v_pass := v_pass + 1;

  SELECT out_has_cv INTO v_bool FROM public.hr_talent_profiles(NULL,200,0) WHERE out_id=v_e2;
  ASSERT NOT v_bool, '3.4 ★ من لا سيرة له يظهر has_cv=true';
  v_pass := v_pass + 1;

  SELECT out_skill_count INTO v_n FROM public.hr_talent_profiles(NULL,200,0) WHERE out_id=v_e1;
  ASSERT v_n = 3, format('3.5 عدد المهارات = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ صفر مهارات لمن لا سيرة له — لا NULL ولا انهيار
  SELECT out_skill_count INTO v_n FROM public.hr_talent_profiles(NULL,200,0) WHERE out_id=v_e2;
  ASSERT v_n = 0, format('3.6 ★ مهارات ملف بلا سيرة = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  -- ★★ البحث بالمهارة يعمل
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('React',200,0);
  ASSERT v_n = 1, format('3.7 ★ البحث عن React = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★★ البحث فعّال لا صوري: مهارة غير موجودة تعيد صفراً
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('COBOL',200,0);
  ASSERT v_n = 0,
    format('3.8 ★★ البحث عن مهارة غير موجودة أعاد %s ⇒ الترشيح مُهمَل', v_n);
  v_pass := v_pass + 1;

  -- ★ البحث جزئي وغير حسّاس لحالة الأحرف
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles('post',200,0);
  ASSERT v_n = 1, format('3.9 ★ البحث الجزئي «post» = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ من له سيرة أولاً في الترتيب
  ASSERT (SELECT out_id FROM public.hr_talent_profiles(NULL,200,0) LIMIT 1) = v_e1,
    '3.10 ★ الترتيب لا يضع صاحب السيرة أولاً';
  v_pass := v_pass + 1;

  -- ★ الحدّ مقصوص
  SELECT count(*) INTO v_n FROM public.hr_talent_profiles(NULL,999999,0);
  ASSERT v_n = 3, format('3.11 حدّ ضخم أعاد %s', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_talent_profiles(NULL,-5,-5);
  ASSERT v_n = 1, format('3.12 حدّ سالب أعاد %s (متوقَّع 1 بفعل GREATEST)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ④ التوزيع الساعي — العطل ② ═══════════════════════════════════════
  INSERT INTO public.attendance_logs
    (tenant_id,employee_id,punch_time,punch_type,shift_date) VALUES
    (v_t ,v_emp1,date_trunc('day',NOW())+INTERVAL '8 hours'         ,'in' ,current_date),
    (v_t ,v_emp1,date_trunc('day',NOW())+INTERVAL '8 hours 5 min'   ,'out',current_date),
    (v_t ,v_emp2,date_trunc('day',NOW())+INTERVAL '14 hours'        ,'in' ,current_date),
    (v_t ,v_emp2,date_trunc('day',NOW())+INTERVAL '20 hours'        ,'in' ,current_date),
    -- ★ شركة ب — يجب ألّا تُحتسب
    (v_tb,v_empb,date_trunc('day',NOW())+INTERVAL '8 hours'         ,'in' ,current_date);

  -- ★★ 24 صفاً دائماً — الساعات الصفرية مُضمَّنة (درس 0327)
  SELECT count(*) INTO v_n FROM public.attendance_today_by_hour();
  ASSERT v_n = 24,
    format('4.1 ★★ التوزيع الساعي = %s صف (متوقَّع 24؛ حذف الأصفار يُزيح الرسم)', v_n);
  v_pass := v_pass + 1;

  -- ★★ العزل: أربع بصمات لا خمس
  SELECT sum(out_total)::INT INTO v_n FROM public.attendance_today_by_hour();
  ASSERT v_n = 4,
    format('4.2 ★★ مجموع البصمات = %s (متوقَّع 4) ⇒ تسريب من شركة أخرى', v_n);
  v_pass := v_pass + 1;

  SELECT out_total INTO v_n FROM public.attendance_today_by_hour() WHERE out_hour=8;
  ASSERT v_n = 2, format('4.3 الساعة 8 = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ التمييز بين الدخول والخروج
  SELECT out_punch_in INTO v_n FROM public.attendance_today_by_hour() WHERE out_hour=8;
  ASSERT v_n = 1, format('4.4 ★ دخول الساعة 8 = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  SELECT out_punch_out INTO v_n FROM public.attendance_today_by_hour() WHERE out_hour=8;
  ASSERT v_n = 1, format('4.5 ★ خروج الساعة 8 = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ ساعة فارغة تعطي صفراً لا تختفي
  SELECT out_total INTO v_n FROM public.attendance_today_by_hour() WHERE out_hour=3;
  ASSERT v_n = 0, format('4.6 ★ ساعة فارغة = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  -- ★ الترتيب تصاعدي 0→23
  ASSERT (SELECT out_hour FROM public.attendance_today_by_hour() LIMIT 1) = 0,
    '4.7 التوزيع لا يبدأ بالساعة 0';
  v_pass := v_pass + 1;

  -- ═══ ⑤ توزيع الورديات ═════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.attendance_today_shift_split();
  ASSERT v_n = 3, format('5.1 الورديات = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT out_count INTO v_n FROM public.attendance_today_shift_split()
   WHERE out_shift='morning';
  ASSERT v_n = 2, format('5.2 وردية الصباح = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT out_count INTO v_n FROM public.attendance_today_shift_split()
   WHERE out_shift='afternoon';
  ASSERT v_n = 1, format('5.3 وردية الظهيرة = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ المساء يشمل 18–24 و0–6 معاً
  SELECT out_count INTO v_n FROM public.attendance_today_shift_split()
   WHERE out_shift='evening';
  ASSERT v_n = 1, format('5.4 ★ وردية المساء = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★★ المجموع يطابق التوزيع الساعي — لا بصمة ضائعة ولا مكرّرة
  SELECT sum(out_count)::INT INTO v_n FROM public.attendance_today_shift_split();
  ASSERT v_n = 4,
    format('5.5 ★★ مجموع الورديات = %s (متوقَّع 4) ⇒ بصمة ضاعت أو تكرّرت', v_n);
  v_pass := v_pass + 1;

  SELECT out_label INTO v_txt FROM public.attendance_today_shift_split()
   WHERE out_shift='morning';
  ASSERT v_txt = 'الصباح (6–12)', format('5.6 تسمية الوردية = %L', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑥ آخر سبعة أيام ══════════════════════════════════════════════════
  INSERT INTO public.attendance_logs
    (tenant_id,employee_id,punch_time,punch_type,shift_date) VALUES
    (v_t,v_emp1,NOW()-INTERVAL '2 days','in',current_date-2),
    (v_t,v_emp2,NOW()-INTERVAL '2 days','in',current_date-2),
    -- ★ خارج النافذة: عشرة أيام
    (v_t,v_emp1,NOW()-INTERVAL '10 days','in',current_date-10);

  SELECT count(*) INTO v_n FROM public.attendance_last_7_days();
  ASSERT v_n = 7, format('6.1 ★ أيام الأسبوع = %s (متوقَّع 7 مع الفارغة)', v_n);
  v_pass := v_pass + 1;

  -- ★★ النافذة فعّالة: بصمة العشرة أيام مُقصاة
  --
  --   ★ تصحيح ذاتي مُوثَّق: حاولتُ أولاً جعل هذا التأكيد يحرس شرط
  --     النافذة في WHERE، فاكتشفتُ بالعكس أنه لا يسقط. السبب الحقيقي:
  --     الإقصاء **بنيوي** لا شرطي — `days` تُبنى من generate_series
  --     والـLEFT JOIN لا يُنتج صفاً لبصمة خارجها. أُثبت بتوسيع النافذة
  --     إلى 9999 يوماً: المخرَج مطابق حرفياً.
  --     فما يحرسه هذا التأكيد هو **الإقصاء البنيوي** — ولو استُبدل
  --     generate_series بمصدر أيام مفتوح لسقط. وهذا حراسة حقيقية.
  SELECT sum(out_total)::INT INTO v_n FROM public.attendance_last_7_days();
  ASSERT v_n = 6,
    format('6.2 ★★ مجموع الأسبوع = %s (متوقَّع 6) ⇒ يوم خارج السبعة تسرّب', v_n);
  v_pass := v_pass + 1;

  -- ★ تجهيز مُتحقَّق منه: الجدول يحوي أكثر مما تعرضه النافذة
  SELECT count(*) INTO v_n FROM public.attendance_logs WHERE tenant_id = v_t;
  ASSERT v_n = 7, format('6.2b تجهيز: بصمات الشركة = %s (متوقَّع 7)', v_n);
  ASSERT (SELECT sum(out_total)::INT FROM public.attendance_last_7_days()) < v_n,
    '6.2c ★★ الدالة تعرض كل بصمات الجدول ⇒ نافذة السبعة أيام انهارت';
  v_pass := v_pass + 1;

  -- ★ present = موظفون متمايزون لا بصمات
  SELECT out_present INTO v_n FROM public.attendance_last_7_days()
   WHERE out_day = current_date;
  ASSERT v_n = 2,
    format('6.3 ★ حاضرو اليوم = %s (متوقَّع 2 موظف لا 4 بصمات)', v_n);
  v_pass := v_pass + 1;

  SELECT out_total INTO v_n FROM public.attendance_last_7_days()
   WHERE out_day = current_date;
  ASSERT v_n = 4, format('6.4 بصمات اليوم = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★ يوم فارغ يظهر بصفر
  SELECT out_total INTO v_n FROM public.attendance_last_7_days()
   WHERE out_day = current_date - 5;
  ASSERT v_n = 0, format('6.5 ★ يوم فارغ = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;

  -- ★ الترتيب تصاعدي: الأقدم أولاً
  ASSERT (SELECT out_day FROM public.attendance_last_7_days() LIMIT 1)
         = current_date - 6,
    '6.6 ★ الأسبوع لا يبدأ بأقدم يوم';
  v_pass := v_pass + 1;

  -- ═══ ⑦ المستأجر المعدوم ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);

  -- ★★★ تحديث 0354: مستخدم بلا ملف = بلا مستأجر. كانت الدالة تُرجع
  --   صفر صفوف بصمت؛ صارت ترفع «لا يمكن تحديد المستأجر الحالي».
  --   الرفض الصريح أفضل من الصمت: الصمت يُقرأ «لا بيانات» لا «لا هوية».
  BEGIN
    SELECT count(*) INTO v_n FROM public.hr_talent_profiles(NULL,200,0);
    RAISE EXCEPTION 'SENTINEL_733: مستخدم بلا مستأجر نفّذ الدالة (رأى % صفّاً)', v_n;
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_733' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.attendance_today_by_hour();
  ASSERT v_n = 0, format('7.2 ★ مستخدم بلا ملف رأى %s صف توزيع', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.attendance_today_shift_split();
  ASSERT v_n = 0, format('7.3 ★ مستخدم بلا ملف رأى %s وردية', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.attendance_last_7_days();
  ASSERT v_n = 0, format('7.4 ★ مستخدم بلا ملف رأى %s يوماً', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑧ شركة ب ترى بياناتها وحدها ══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_hrb::text, TRUE);

  SELECT count(*) INTO v_n FROM public.hr_talent_profiles(NULL,200,0);
  ASSERT v_n = 2, format('8.1 شركة ب ترى %s ملفاً (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (SELECT 1 FROM public.hr_talent_profiles(NULL,200,0)
                      WHERE out_full_name = 'مبرمج أول'),
    '8.2 ★★ تسريب معاكس: شركة ب رأت ملف شركة أ';
  v_pass := v_pass + 1;

  SELECT sum(out_total)::INT INTO v_n FROM public.attendance_today_by_hour();
  ASSERT v_n = 1, format('8.3 ★★ شركة ب ترى %s بصمة (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  verify-cv-and-attendance-0333: % تأكيداً — نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0333';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_VERIFY_0333' THEN
    RAISE NOTICE 'تراجع نظيف — لا أثر في القاعدة.';
  ELSE
    RAISE;
  END IF;
END $$;
