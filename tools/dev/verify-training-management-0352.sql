-- ============================================================================
-- verify-training-management-0352.sql
--
-- تحقّق سلوكي من مايجريشن 0352 (إدارة التدريب والشهادات).
--
-- ★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
--   لكل تأكيد صفٌّ مُخالِف عمداً:
--     · مستأجر أجنبي بنفس البنية      ⇒ يُثبت الترشيح
--     · شهادة منتهية · وأخرى تنتهي غداً · وثالثة بلا انتهاء
--       ⇒ تُثبت تصنيف الصلاحية الثلاثي (العطل ④)
--     · موظف بلا full_name_ar ولا email ⇒ يُثبت السلسلة الاحتياطية
--     · دورة مؤرشفة                     ⇒ تُثبت أن status يُقرأ لا active
--     · محاولة نسب شهادة لموظف أجنبي    ⇒ تُثبت حراسة الانتماء
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
  v_d1  UUID := gen_random_uuid();
  v_hr  UUID := gen_random_uuid();
  v_p1  UUID := gen_random_uuid();
  v_hrx UUID := gen_random_uuid();
  v_px  UUID := gen_random_uuid();
  v_e1 UUID; v_ex UUID;
BEGIN
  INSERT INTO tenants(id,name,name_ar,slug) VALUES
    (v_t,'Target','الهدف','t52-'||substr(v_t::text,1,8)),
    (v_x,'Foreign','الأجنبي','x52-'||substr(v_x::text,1,8));

  INSERT INTO departments(id,tenant_id,name_ar) VALUES (v_d1,v_t,'الجودة');

  INSERT INTO auth.users(id,email) VALUES
    (v_hr,'hr52@t.co'), (v_p1,'p1@t.co'), (v_hrx,'hr52@x.co'), (v_px,'px@x.co');

  INSERT INTO profiles(id,tenant_id,full_name,role,department,status) VALUES
    (v_hr, v_t,'مدير الموارد','hr',      'الجودة','active'),
    (v_p1, v_t,'علي حسن',    'employee','الجودة','active'),
    (v_hrx,v_x,'مدير أجنبي', 'hr',      'قسم','active'),
    (v_px, v_x,'موظف أجنبي', 'employee','قسم','active');

  SELECT id INTO v_e1 FROM employees WHERE tenant_id=v_t AND user_id=v_p1;
  SELECT id INTO v_ex FROM employees WHERE tenant_id=v_x AND user_id=v_px;

  -- ★★★ التحقّق من الفرضية: full_name_ar و email فارغان
  IF (SELECT full_name_ar FROM employees WHERE id=v_e1) IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_PRE1: full_name_ar صار مملوءاً — راجع العيّنة';
  END IF;
  IF (SELECT email FROM employees WHERE id=v_e1) IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_PRE2: employees.email صار مملوءاً — راجع العيّنة';
  END IF;

  -- ═══ الشهادات: منتهية · تنتهي قريباً · سارية · بلا انتهاء ═══════════════
  INSERT INTO employee_certifications(tenant_id,employee_id,certification_name,
                                      issued_by,issue_date,expiry_date) VALUES
    (v_t,v_e1,'ISO 9001 منتهية','هيئة التقييس', CURRENT_DATE - 400, CURRENT_DATE - 30),
    (v_t,v_e1,'سلامة تنتهي قريباً','الدفاع المدني', CURRENT_DATE - 300, CURRENT_DATE + 10),
    (v_t,v_e1,'شهادة سارية','معهد', CURRENT_DATE - 100, CURRENT_DATE + 300),
    (v_t,v_e1,'شهادة دائمة','جامعة', CURRENT_DATE - 900, NULL);
  -- الأجنبية
  INSERT INTO employee_certifications(tenant_id,employee_id,certification_name,
                                      issued_by,issue_date,expiry_date)
    VALUES (v_x,v_ex,'شهادة أجنبية','جهة', CURRENT_DATE, CURRENT_DATE + 100);

  INSERT INTO _ctx(k,v) VALUES
    ('t',v_t),('x',v_x),('d1',v_d1),('hr',v_hr),('hrx',v_hrx),
    ('p1',v_p1),('e1',v_e1),('ex',v_ex);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ①.0 حارس الاستدعاء
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  PERFORM * FROM public.training_certifications();
  PERFORM * FROM public.training_management_summary();
  RAISE WARNING '✔ ①.0 حارس الاستدعاء — الدالتان القارئتان تعملان';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② إنشاء وتعديل دورة — العطل ①
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_t  UUID := (SELECT v FROM _ctx WHERE k='t');
  r RECORD; v_id UUID; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  -- ★★★ الشاهد: الإنشاء ينجح — وكان يفشل بـactive/rich_content
  SELECT * INTO r FROM public.training_course_upsert(
    NULL, 'دورة السلامة', 'Safety', 'وصف', 'desc',
    'أمان', 'مبتدئ', '3 ساعات', 50, TRUE, 'المدرب',
    ARRAY['سلامة','جودة'], ARRAY['هدف 1','هدف 2'], 'active');
  IF NOT r.out_created THEN
    RAISE EXCEPTION 'SENTINEL_U1: الإنشاء لم يُعلَن جديداً';
  END IF;
  IF r.out_title <> 'دورة السلامة' THEN
    RAISE EXCEPTION 'SENTINEL_U2: العنوان = %', r.out_title;
  END IF;
  IF r.out_status <> 'active' THEN
    RAISE EXCEPTION 'SENTINEL_U3: الحالة = % والمتوقَّع active', r.out_status;
  END IF;
  v_id := r.out_id;

  -- الحقول كُتبت فعلاً
  SELECT count(*) INTO n FROM courses
   WHERE id = v_id AND tenant_id = v_t
     AND mandatory AND points = 50
     AND array_length(tags,1) = 2 AND array_length(objectives,1) = 2
     AND instructor = 'المدرب' AND title_en = 'Safety';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_U4: الحقول لم تُكتب كما أُرسلت';
  END IF;

  -- ★★★ التعديل ينجح — وكان يفشل أيضاً
  SELECT * INTO r FROM public.training_course_upsert(
    v_id, 'دورة السلامة المحدّثة', NULL, NULL, NULL,
    'أمان', 'متقدم', NULL, 80, FALSE, NULL,
    ARRAY['محدّث'], ARRAY['هدف'], 'inactive');
  IF r.out_created THEN
    RAISE EXCEPTION 'SENTINEL_U5: التعديل أُعلن إنشاءً';
  END IF;
  IF r.out_status <> 'inactive' THEN
    RAISE EXCEPTION 'SENTINEL_U6: الحالة بعد التعديل = %', r.out_status;
  END IF;
  SELECT count(*) INTO n FROM courses
   WHERE id = v_id AND level = 'متقدم' AND points = 80 AND NOT mandatory;
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_U7: التعديل لم يُطبَّق';
  END IF;

  -- الحدود
  BEGIN
    PERFORM public.training_course_upsert(NULL, '   ');
    RAISE EXCEPTION 'SENTINEL_U8: قُبل عنوان فارغ';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_U8' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.training_course_upsert(NULL,'د',NULL,NULL,NULL,'ع','خارق');
    RAISE EXCEPTION 'SENTINEL_U9: قُبل مستوى غير مسموح';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_U9' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.training_course_upsert(
      NULL,'د',NULL,NULL,NULL,'ع','مبتدئ',NULL,-5);
    RAISE EXCEPTION 'SENTINEL_U10: قُبلت نقاط سالبة';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_U10' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.training_course_upsert(
      NULL,'د',NULL,NULL,NULL,'ع','مبتدئ',NULL,0,FALSE,NULL,'{}','{}','deleted');
    RAISE EXCEPTION 'SENTINEL_U11: قُبلت حالة غير مسموحة';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_U11' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ② الدورات — 11 تأكيداً (الإنشاء والتعديل ينجحان أخيراً)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ الشهادات — الأعمدة الحقيقية وحالة الصلاحية
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  r RECORD; n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  SELECT count(*) INTO n FROM public.training_certifications();
  IF n <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_T1: الشهادات = % والمتوقَّع 4 (الأجنبية مُقصاة)', n;
  END IF;

  -- ★★★ العطل ②: الاسم موجود فعلاً — كان c.title ⇒ فارغ
  SELECT * INTO r FROM public.training_certifications()
   WHERE out_certification_name = 'ISO 9001 منتهية';
  IF r.out_certification_name IS NULL OR r.out_certification_name = '' THEN
    RAISE EXCEPTION 'SENTINEL_T2: اسم الشهادة فارغ — عاد العطل ②';
  END IF;
  IF r.out_issued_by <> 'هيئة التقييس' THEN
    RAISE EXCEPTION 'SENTINEL_T3: الجهة = % والمتوقَّع «هيئة التقييس»', r.out_issued_by;
  END IF;

  -- ★★★ العطل ④: تصنيف الصلاحية
  IF r.out_validity <> 'منتهية' THEN
    RAISE EXCEPTION 'SENTINEL_T4: حالة المنتهية = % والمتوقَّع «منتهية»', r.out_validity;
  END IF;
  -- انتهت قبل 30 يوماً ⇒ -30
  IF r.out_days_to_expiry <> -30 THEN
    RAISE EXCEPTION 'SENTINEL_T5: أيام الانتهاء = % والمتوقَّع -30', r.out_days_to_expiry;
  END IF;

  SELECT * INTO r FROM public.training_certifications()
   WHERE out_certification_name = 'سلامة تنتهي قريباً';
  IF r.out_validity <> 'تنتهي قريباً' THEN
    RAISE EXCEPTION 'SENTINEL_T6: حالة القريبة = %', r.out_validity;
  END IF;
  IF r.out_days_to_expiry <> 10 THEN
    RAISE EXCEPTION 'SENTINEL_T7: أيام القريبة = % والمتوقَّع 10', r.out_days_to_expiry;
  END IF;

  SELECT * INTO r FROM public.training_certifications()
   WHERE out_certification_name = 'شهادة سارية';
  IF r.out_validity <> 'سارية' THEN
    RAISE EXCEPTION 'SENTINEL_T8: حالة السارية = %', r.out_validity;
  END IF;

  SELECT * INTO r FROM public.training_certifications()
   WHERE out_certification_name = 'شهادة دائمة';
  IF r.out_validity <> 'بلا انتهاء' THEN
    RAISE EXCEPTION 'SENTINEL_T9: حالة الدائمة = %', r.out_validity;
  END IF;
  IF r.out_days_to_expiry IS NOT NULL THEN
    RAISE EXCEPTION 'SENTINEL_T10: الدائمة لها أيام انتهاء = %', r.out_days_to_expiry;
  END IF;

  -- ★★★ العطل ⑤: الاسم من السلسلة الاحتياطية (full_name_ar فارغ)
  IF r.out_employee_name = 'موظف بلا اسم' OR r.out_employee_name IS NULL THEN
    RAISE EXCEPTION 'SENTINEL_T11: الاسم = % — السلسلة الاحتياطية فشلت',
      r.out_employee_name;
  END IF;
  IF r.out_employee_name NOT LIKE '%علي%' THEN
    RAISE EXCEPTION 'SENTINEL_T12: الاسم = % والمتوقَّع أن يحوي «علي»',
      r.out_employee_name;
  END IF;
  IF r.out_department <> 'الجودة' THEN
    RAISE EXCEPTION 'SENTINEL_T13: القسم = % والمتوقَّع الجودة', r.out_department;
  END IF;

  -- ★ الترتيب: المنتهية أولاً
  SELECT out_validity INTO r FROM public.training_certifications() LIMIT 1;
  IF r.out_validity <> 'منتهية' THEN
    RAISE EXCEPTION 'SENTINEL_T14: أول صفّ = % والمتوقَّع «منتهية»', r.out_validity;
  END IF;

  -- البحث
  SELECT count(*) INTO n FROM public.training_certifications('سلامة');
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_T15: البحث «سلامة» = % والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.training_certifications('لا يوجد إطلاقاً');
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_T16: بحث بلا نتيجة = %', n;
  END IF;
  SELECT count(*) INTO n FROM public.training_certifications('   ');
  IF n <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_T17: بحث فارغ = % والمتوقَّع 4', n;
  END IF;

  RAISE WARNING '✔ ③ الشهادات — 17 تأكيداً (الاسم يظهر · الصلاحية تُصنَّف)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ المؤشّرات — محسوبة لا ثوابت
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);
  SELECT * INTO r FROM public.training_management_summary();

  -- الشهادات الأربع
  IF r.out_total_certs <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_S1: الشهادات = % والمتوقَّع 4', r.out_total_certs;
  END IF;
  -- ★★★ العطل ③: «معتمدة» كانت = العدد الكلّي (4) أبداً.
  --   الآن: سارية = شهادة سارية + شهادة دائمة = 2
  IF r.out_valid_certs <> 2 THEN
    RAISE EXCEPTION 'SENTINEL_S2: السارية = % والمتوقَّع 2', r.out_valid_certs;
  END IF;
  IF r.out_valid_certs = r.out_total_certs THEN
    RAISE EXCEPTION 'SENTINEL_S3: السارية = الكلّي — عاد الثابت approved:true';
  END IF;
  IF r.out_expiring_certs <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_S4: التي تنتهي قريباً = % والمتوقَّع 1',
      r.out_expiring_certs;
  END IF;
  IF r.out_expired_certs <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_S5: المنتهية = % والمتوقَّع 1', r.out_expired_certs;
  END IF;
  -- حارس الجمع: 2 + 1 + 1 = 4
  IF r.out_valid_certs + r.out_expiring_certs + r.out_expired_certs
     <> r.out_total_certs THEN
    RAISE EXCEPTION 'SENTINEL_S6: %+%+% <> % — صفّ ضاع من التصنيف',
      r.out_valid_certs, r.out_expiring_certs, r.out_expired_certs,
      r.out_total_certs;
  END IF;

  -- الدورات: أُنشئت واحدة في القسم ② ثم عُدّلت إلى inactive
  IF r.out_total_courses <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_S7: الدورات = % والمتوقَّع 1', r.out_total_courses;
  END IF;
  IF r.out_active_courses <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_S8: النشطة = % والمتوقَّع 0 (عُدّلت إلى inactive)',
      r.out_active_courses;
  END IF;

  RAISE WARNING '✔ ④ المؤشّرات — 8 تأكيدات (السارية 2 لا 4)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ إضافة شهادة — الحراسات
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hr UUID := (SELECT v FROM _ctx WHERE k='hr');
  v_e1 UUID := (SELECT v FROM _ctx WHERE k='e1');
  v_ex UUID := (SELECT v FROM _ctx WHERE k='ex');
  r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, true);

  SELECT * INTO r FROM public.training_certification_upsert(
    NULL, v_e1, 'شهادة جديدة', 'جهة', CURRENT_DATE, CURRENT_DATE + 365);
  IF NOT r.out_created THEN
    RAISE EXCEPTION 'SENTINEL_C1: الإضافة لم تُعلَن جديدة';
  END IF;
  IF r.out_name <> 'شهادة جديدة' THEN
    RAISE EXCEPTION 'SENTINEL_C2: الاسم = %', r.out_name;
  END IF;

  -- ★★★ نطاق معكوس مرفوض
  BEGIN
    PERFORM public.training_certification_upsert(
      NULL, v_e1, 'معكوسة', 'جهة', CURRENT_DATE, CURRENT_DATE - 10);
    RAISE EXCEPTION 'SENTINEL_C3: قُبل انتهاء قبل الإصدار';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_C3' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- ★★★ موظف أجنبي مرفوض
  BEGIN
    PERFORM public.training_certification_upsert(
      NULL, v_ex, 'اختراق', 'جهة', CURRENT_DATE, CURRENT_DATE + 10);
    RAISE EXCEPTION 'SENTINEL_C4: قُبلت شهادة لموظف أجنبي';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_C4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- اسم فارغ مرفوض
  BEGIN
    PERFORM public.training_certification_upsert(NULL, v_e1, '   ');
    RAISE EXCEPTION 'SENTINEL_C5: قُبل اسم فارغ';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_C5' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  RAISE WARNING '✔ ⑤ إضافة الشهادات — 5 تأكيدات';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ العزل والصلاحية والخصائص
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_hrx UUID := (SELECT v FROM _ctx WHERE k='hrx');
  v_p1  UUID := (SELECT v FROM _ctx WHERE k='p1');
  v_e1  UUID := (SELECT v FROM _ctx WHERE k='e1');
  r RECORD; n INTEGER := 0; v_cid UUID;
BEGIN
  -- الأجنبي يرى شهادته وحدها
  PERFORM set_config('request.jwt.claim.sub', v_hrx::text, true);
  SELECT count(*) INTO n FROM public.training_certifications();
  IF n <> 1 THEN
    RAISE EXCEPTION 'SENTINEL_I1: الأجنبي يرى % شهادة والمتوقَّع 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.training_certifications()
   WHERE out_certification_name LIKE '%ISO%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'SENTINEL_I2: تسرّبت شهادة الهدف للأجنبي';
  END IF;

  -- ولا يعدّل دورة الهدف
  SELECT id INTO v_cid FROM courses WHERE title LIKE '%السلامة%' LIMIT 1;
  BEGIN
    PERFORM public.training_course_upsert(v_cid, 'اختراق');
    RAISE EXCEPTION 'SENTINEL_I3: الأجنبي عدّل دورة الهدف';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I3' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- موظف عادي مرفوض من الأربع
  PERFORM set_config('request.jwt.claim.sub', v_p1::text, true);
  BEGIN
    PERFORM * FROM public.training_certifications();
    RAISE EXCEPTION 'SENTINEL_I4: موظف قرأ الشهادات';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I4' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.training_management_summary();
    RAISE EXCEPTION 'SENTINEL_I5: موظف قرأ المؤشّرات';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I5' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.training_course_upsert(NULL, 'دورة موظف');
    RAISE EXCEPTION 'SENTINEL_I6: موظف أنشأ دورة';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I6' in SQLERRM) > 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.training_certification_upsert(NULL, v_e1, 'شهادة موظف');
    RAISE EXCEPTION 'SENTINEL_I7: موظف أضاف شهادة';
  EXCEPTION WHEN OTHERS THEN
    IF position('SENTINEL_I7' in SQLERRM) > 0 THEN RAISE; END IF;
  END;

  -- الخصائص
  n := 0;
  FOR r IN
    SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN ('training_course_upsert','training_certifications',
                         'training_certification_upsert','training_management_summary')
  LOOP
    n := n + 1;
    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'SENTINEL_P1: % ليست SECURITY DEFINER', r.proname;
    END IF;
    IF r.proconfig IS NULL OR NOT ('search_path=public' = ANY(r.proconfig)) THEN
      RAISE EXCEPTION 'SENTINEL_P2: % بلا search_path=public', r.proname;
    END IF;
    IF r.proname LIKE '%upsert' THEN
      IF r.provolatile <> 'v' THEN
        RAISE EXCEPTION 'SENTINEL_P3: % الكاتبة ليست VOLATILE', r.proname;
      END IF;
    ELSIF r.provolatile <> 's' THEN
      RAISE EXCEPTION 'SENTINEL_P4: % القارئة ليست STABLE', r.proname;
    END IF;
  END LOOP;
  IF n <> 4 THEN
    RAISE EXCEPTION 'SENTINEL_P5: الدوال = % والمتوقَّع 4', n;
  END IF;

  RAISE WARNING '✔ ⑥ العزل والخصائص — 12 تأكيداً';
END $$;

DO $$ BEGIN
  RAISE WARNING '════════════════════════════════════════════════════════';
  RAISE WARNING '  0352 — 53 تأكيداً · صفر فشل';
  RAISE WARNING '════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
