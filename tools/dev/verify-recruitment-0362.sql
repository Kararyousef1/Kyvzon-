-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0362 — التوظيف
--  كل رقم متوقَّع محسوب يدوياً في التعليق فوقه.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.chk(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL [%]: got=«%» want=«%»', p_label, p_got, p_want;
  END IF;
  RAISE NOTICE 'ok   %  =  %', rpad(p_label, 54, '.'), COALESCE(p_want,'NULL');
END $$;

-- ══════════════════════ العيّنة ══════════════════════
-- ★ UUIDات فريدة في **أول 8 حروف** (درس 0355)
INSERT INTO public.tenants (id,name,name_ar,slug) VALUES
 ('a3620000-0000-0000-0000-00000000000a','T362A','شركة ألف','t362a'),
 ('b3620000-0000-0000-0000-00000000000b','T362B','شركة باء','t362b');

INSERT INTO auth.users(id,email) VALUES
 ('11620001-0000-0000-0000-000000000001','salem@t362a'),
 ('33620003-0000-0000-0000-000000000003','huda@t362a'),
 ('44620004-0000-0000-0000-000000000004','munir@t362a'),
 ('77620007-0000-0000-0000-000000000007','hr@t362b');

INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('44620004-0000-0000-0000-000000000004','a3620000-0000-0000-0000-00000000000a','منير المدير','manager','المالية');
INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3620000-0000-0000-0000-00000000000d','a3620000-0000-0000-0000-00000000000a','المالية',
  '44620004-0000-0000-0000-000000000004'),
 ('d3620000-0000-0000-0000-00000000000e','b3620000-0000-0000-0000-00000000000b','مالية باء',NULL);
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('11620001-0000-0000-0000-000000000001','a3620000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية'),
 ('33620003-0000-0000-0000-000000000003','a3620000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
 ('77620007-0000-0000-0000-000000000007','b3620000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد');

-- ★★ إعلانٌ في باء موجودٌ منذ العيّنة — يحتاجه حارس المستأجر
--   (درس 0361/INV13: حارسٌ سابق يمسك الحالة قبل الحارس المقصود)
INSERT INTO public.job_postings (id,tenant_id,title,description,status)
VALUES ('50620000-0000-0000-0000-00000000000b','b3620000-0000-0000-0000-00000000000b',
        'إعلان باء الأصلي','وصف','open');

SET LOCAL request.jwt.claim.sub = '33620003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ① بنية الجداول والقيود ═══'

DO $$
BEGIN
  -- ★★★ العطل ①: الأعمدة التي كانت الصفحة تقرؤها وهي معدومة
  PERFORM pg_temp.chk('1.1 cover_letter أُضيف',
    (SELECT count(*)::TEXT FROM information_schema.columns
      WHERE table_name='job_applications' AND column_name='cover_letter'), '1');
  PERFORM pg_temp.chk('1.2 reviewed_by/at أُضيفا',
    (SELECT count(*)::TEXT FROM information_schema.columns
      WHERE table_name='job_applications'
        AND column_name IN ('reviewed_by','reviewed_at')), '2');
  PERFORM pg_temp.chk('1.3 hired_employee_id أُضيف',
    (SELECT count(*)::TEXT FROM information_schema.columns
      WHERE table_name='job_applications' AND column_name='hired_employee_id'), '1');
  PERFORM pg_temp.chk('1.4 rating/rejection_reason أُضيفا',
    (SELECT count(*)::TEXT FROM information_schema.columns
      WHERE table_name='job_applications'
        AND column_name IN ('rating','rejection_reason')), '2');

  PERFORM pg_temp.chk('1.5 tenant_id في الإعلانات NOT NULL',
    (SELECT is_nullable FROM information_schema.columns
      WHERE table_name='job_postings' AND column_name='tenant_id'), 'NO');

  -- ★★★ العطل ⑩: CASCADE أُسقط
  PERFORM pg_temp.chk('1.6 FK الإعلان القديم (CASCADE) أُسقط',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='job_applications_posting_id_fkey'), '0');
  PERFORM pg_temp.chk('1.7 والجديد مركَّب RESTRICT',
    (SELECT (pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%')::TEXT
       FROM pg_constraint WHERE conname='job_applications_posting_tenant_fkey'), 'true');

  PERFORM pg_temp.chk('1.8 CHECK على حالة الطلب',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='job_applications_status_chk'), '1');
  -- ★★★ العطل ②: DEFAULT صار من مفردات الواجهة
  PERFORM pg_temp.chk('1.9 DEFAULT صار applied لا submitted',
    (SELECT column_default FROM information_schema.columns
      WHERE table_name='job_applications' AND column_name='status'),
    '''applied''::character varying');

  PERFORM pg_temp.chk('1.10 محفّزا منع الحذف',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgname IN ('trg_block_job_application_delete',
                       'trg_block_job_posting_delete')), '2');

  -- ★★★ hybrid_gate يبقى RESTRICTIVE (درس 0355)
  PERFORM pg_temp.chk('1.11 hybrid_gate الإعلانات RESTRICTIVE',
    (SELECT (NOT polpermissive)::TEXT FROM pg_policy
      WHERE polname='hybrid_gate_job_postings'), 'true');
  PERFORM pg_temp.chk('1.12 hybrid_gate الطلبات RESTRICTIVE',
    (SELECT (NOT polpermissive)::TEXT FROM pg_policy
      WHERE polname='hybrid_gate_job_applications'), 'true');
END $$;

\echo ''
\echo '═══ ★★ ② حرّاس إنشاء الإعلان ═══'

DO $$
DECLARE v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.job_postings);

  v_m := ''; BEGIN PERFORM public.job_posting_upsert(NULL,'   ','وصف');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.1 RECRUITMENT_TITLE_REQUIRED',
    (position('RECRUITMENT_TITLE_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.job_posting_upsert(NULL,'عنوان','  ');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.2 RECRUITMENT_DESCRIPTION_REQUIRED',
    (position('RECRUITMENT_DESCRIPTION_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ③: حالة مختلقة
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(
    NULL,'عنوان','وصف',NULL,NULL,'full_time',NULL,NULL,1,NULL,NULL,'ThIsIsGaRbAgE');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.3 RECRUITMENT_STATUS_INVALID',
    (position('RECRUITMENT_STATUS_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑧: نوع توظيف مختلق
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(
    NULL,'عنوان','وصف',NULL,NULL,'مخترع');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.4 RECRUITMENT_TYPE_INVALID',
    (position('RECRUITMENT_TYPE_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑥: شواغر صفر
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(
    NULL,'عنوان','وصف',NULL,NULL,'full_time',NULL,NULL,0);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.5 RECRUITMENT_VACANCY_INVALID',
    (position('RECRUITMENT_VACANCY_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑤: راتبٌ مقلوب
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(
    NULL,'عنوان','وصف',NULL,NULL,'full_time',9000000,1000,1);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.6 RECRUITMENT_SALARY_RANGE',
    (position('RECRUITMENT_SALARY_RANGE' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑦: إغلاقٌ في الماضي (أمس بتوقيت بغداد)
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(
    NULL,'عنوان','وصف',NULL,NULL,'full_time',NULL,NULL,1,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE - 1));
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.7 RECRUITMENT_CLOSING_IN_PAST',
    (position('RECRUITMENT_CLOSING_IN_PAST' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑮: قسمٌ من مستأجر آخر
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(
    NULL,'عنوان','وصف',NULL,'d3620000-0000-0000-0000-00000000000e');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.8 RECRUITMENT_DEPARTMENT_NOT_FOUND',
    (position('RECRUITMENT_DEPARTMENT_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');

  -- ★★ ولا صفّ دخل من الثمانية
  PERFORM pg_temp.chk('2.9 لا إعلان دخل مع الحرّاس الثمانية',
    (SELECT count(*)::TEXT FROM public.job_postings), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★ ③ القيود تحرس الكتابة المباشرة ═══'

DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description,status)
        VALUES ('a3620000-0000-0000-0000-00000000000a','ع','و','ThIsIsGaRbAgE');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.1 CHECK يرفض حالة مختلقة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description,employment_type)
        VALUES ('a3620000-0000-0000-0000-00000000000a','ع','و','مخترع');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.2 CHECK يرفض نوع توظيف مختلق', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description,vacancy_count)
        VALUES ('a3620000-0000-0000-0000-00000000000a','ع','و',0);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.3 CHECK يرفض صفر شاغر', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description,salary_min,salary_max)
        VALUES ('a3620000-0000-0000-0000-00000000000a','ع','و',900,100);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.4 CHECK يرفض راتباً مقلوباً', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description,posted_date,closing_date)
        VALUES ('a3620000-0000-0000-0000-00000000000a','ع','و',
                CURRENT_DATE, CURRENT_DATE - 30);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.5 CHECK يرفض زمناً مقلوباً', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description)
        VALUES ('a3620000-0000-0000-0000-00000000000a','   ','و');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.6 CHECK يرفض عنواناً فارغاً', v_ok::TEXT, 'true');

  -- ★★ كشف العكسُ DDL15 أن FK القسم المركَّب لم يكن مُختبَراً:
  --   اختبرتُ RECRUITMENT_DEPARTMENT_NOT_FOUND في الدالة ونسيتُ القيد.
  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description,department_id)
        VALUES ('a3620000-0000-0000-0000-00000000000a','ع','و',
                'd3620000-0000-0000-0000-00000000000e');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.7 FK يرفض قسم مستأجرٍ آخر', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.job_postings (tenant_id,title,description,department_id)
        VALUES ('a3620000-0000-0000-0000-00000000000a','ع','و',
                'ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.8 FK يرفض قسماً معدوماً', v_ok::TEXT, 'true');

  -- ★★ وكشف DDL09 أن قيد البريد لم يكن مُختبَراً كذلك
  --   (RECRUITMENT_EMAIL_INVALID يُختبَر في الدالة وحدها).
  --   نحتاج إعلاناً موجوداً — إعلان باء ليس في ألف فنستعمل FK آخر.
  --   نُدرج إعلاناً مؤقتاً صالحاً ثم نُجرّب البريد عليه.
  DECLARE v_tmp UUID;
  BEGIN
    INSERT INTO public.job_postings (tenant_id,title,description,status)
    VALUES ('a3620000-0000-0000-0000-00000000000a','مؤقّت لفحص البريد','و','open')
    RETURNING id INTO v_tmp;

    v_ok := FALSE;
    BEGIN INSERT INTO public.job_applications
            (tenant_id,posting_id,applicant_name,email)
          VALUES ('a3620000-0000-0000-0000-00000000000a',v_tmp,'س','ليس بريدا');
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    PERFORM pg_temp.chk('3.9 CHECK يرفض بريداً غير صالح', v_ok::TEXT, 'true');

    -- ★ وبريدٌ بلا نقطة في النطاق مرفوض كذلك
    v_ok := FALSE;
    BEGIN INSERT INTO public.job_applications
            (tenant_id,posting_id,applicant_name,email)
          VALUES ('a3620000-0000-0000-0000-00000000000a',v_tmp,'س','a@b');
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    PERFORM pg_temp.chk('3.10 وبريدٌ بلا نقطة مرفوض', v_ok::TEXT, 'true');

    -- ★ والاسم الفارغ
    v_ok := FALSE;
    BEGIN INSERT INTO public.job_applications
            (tenant_id,posting_id,applicant_name,email)
          VALUES ('a3620000-0000-0000-0000-00000000000a',v_tmp,'   ','a@b.cc');
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    PERFORM pg_temp.chk('3.11 CHECK يرفض اسماً فارغاً', v_ok::TEXT, 'true');

    -- ★ والتقييم خارج 1..5
    v_ok := FALSE;
    BEGIN INSERT INTO public.job_applications
            (tenant_id,posting_id,applicant_name,email,rating)
          VALUES ('a3620000-0000-0000-0000-00000000000a',v_tmp,'س','ok@b.cc',9);
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    PERFORM pg_temp.chk('3.12 CHECK يرفض تقييماً خارج 1..5', v_ok::TEXT, 'true');

    -- تنظيف: الحذف ممنوع ⇒ نُعطّل المحفّز مؤقتاً
    ALTER TABLE public.job_postings DISABLE TRIGGER trg_block_job_posting_delete;
    DELETE FROM public.job_postings WHERE id = v_tmp;
    ALTER TABLE public.job_postings ENABLE TRIGGER trg_block_job_posting_delete;
  END;
END $$;

\echo ''
\echo '═══ ★★ ④ إنشاء الإعلانات ═══'

DO $$
DECLARE v_p1 UUID; v_p2 UUID; v_p3 UUID;
BEGIN
  -- مفتوح · شاغران · بقسم
  v_p1 := public.job_posting_upsert(
    NULL,'محاسب أول','إدارة القيود','محاسب',
    'd3620000-0000-0000-0000-00000000000d','full_time',800000,1200000,2,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 30), ARRAY['IFRS'],'open');
  -- مسودة
  v_p2 := public.job_posting_upsert(
    NULL,'مطوّر واجهات','React','مطوّر',NULL,'contract',NULL,NULL,1,NULL,NULL,'draft');
  -- مفتوح بلا متقدمين
  v_p3 := public.job_posting_upsert(
    NULL,'سائق','نقل','سائق',NULL,'part_time',NULL,NULL,1,NULL,NULL,'open');

  PERFORM set_config('kyvzon.t362_p1', v_p1::TEXT, FALSE);
  PERFORM set_config('kyvzon.t362_p2', v_p2::TEXT, FALSE);
  PERFORM set_config('kyvzon.t362_p3', v_p3::TEXT, FALSE);

  PERFORM pg_temp.chk('4.1 ثلاثة إعلانات في ألف',
    (SELECT count(*)::TEXT FROM public.job_postings
      WHERE tenant_id='a3620000-0000-0000-0000-00000000000a'), '3');
  -- ★ العطل ⑮: المنشئ يُملأ تلقائياً
  PERFORM pg_temp.chk('4.2 created_by = هدى',
    (SELECT created_by::TEXT FROM public.job_postings WHERE id=v_p1),
    '33620003-0000-0000-0000-000000000003');
  -- ★★ والنشر يُسجَّل لحظته
  PERFORM pg_temp.chk('4.3 posted_date = اليوم بتوقيت بغداد',
    (SELECT posted_date::TEXT FROM public.job_postings WHERE id=v_p1),
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE)::TEXT);
  PERFORM pg_temp.chk('4.4 المسودة بلا تاريخ نشر',
    (SELECT (posted_date IS NULL)::TEXT FROM public.job_postings WHERE id=v_p2), 'true');

  -- ★ والمسودة تُنشر ⇒ يُسجَّل التاريخ
  PERFORM public.job_posting_upsert(
    v_p2,'مطوّر واجهات','React','مطوّر',NULL,'contract',NULL,NULL,1,NULL,NULL,'open');
  PERFORM pg_temp.chk('4.5 النشر لاحقاً يُسجّل التاريخ',
    (SELECT (posted_date IS NOT NULL)::TEXT FROM public.job_postings WHERE id=v_p2), 'true');
  -- استرجاع
  PERFORM public.job_posting_upsert(
    v_p2,'مطوّر واجهات','React','مطوّر',NULL,'contract',NULL,NULL,1,NULL,NULL,'draft');
END $$;

\echo ''
\echo '═══ ★★★ ⑤ العطل ⑨: التقديم على إعلانٍ في مستأجرٍ آخر ═══'

DO $$
DECLARE v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.job_applications);

  -- ★★★ إعلانٌ في باء موجودٌ فعلاً (الحارس أول من يراه لا FK)
  v_m := ''; BEGIN PERFORM public.application_submit(
    '50620000-0000-0000-0000-00000000000b','عابر','x@y.z');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.1 RECRUITMENT_POSTING_NOT_FOUND',
    (position('RECRUITMENT_POSTING_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  -- ★★ والرمز رمزُ الحارس لا رسالةُ FK (درس 0361/INV13)
  PERFORM pg_temp.chk('5.2 الحارس سبق FK',
    (position('posting_tenant_fkey' IN v_m) > 0)::TEXT, 'false');

  -- ★★ والكتابة المباشرة يمسكها FK المركَّب
  DECLARE v_ok BOOLEAN := FALSE;
  BEGIN
    BEGIN INSERT INTO public.job_applications
            (tenant_id,posting_id,applicant_name,email)
          VALUES ('a3620000-0000-0000-0000-00000000000a',
                  '50620000-0000-0000-0000-00000000000b','عابر','x@y.z');
    EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
    PERFORM pg_temp.chk('5.3 FK المركَّب يحرس الكتابة المباشرة', v_ok::TEXT, 'true');
  END;

  -- ★★ لا تقديمَ على مسودة
  v_m := ''; BEGIN PERFORM public.application_submit(
    current_setting('kyvzon.t362_p2')::UUID,'مبكر','early@y.z');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.4 RECRUITMENT_POSTING_NOT_OPEN',
    (position('RECRUITMENT_POSTING_NOT_OPEN' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑫: بريدٌ غير صالح
  v_m := ''; BEGIN PERFORM public.application_submit(
    current_setting('kyvzon.t362_p1')::UUID,'بلا بريد','ليس بريداً');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.5 RECRUITMENT_EMAIL_INVALID',
    (position('RECRUITMENT_EMAIL_INVALID' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.application_submit(
    current_setting('kyvzon.t362_p1')::UUID,'  ','ok@y.z');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.6 RECRUITMENT_NAME_REQUIRED',
    (position('RECRUITMENT_NAME_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  PERFORM pg_temp.chk('5.7 لا طلب دخل من الحرّاس الخمسة',
    (SELECT count(*)::TEXT FROM public.job_applications), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★★ ⑥ العطل ⑪: لا تكرار — والبريد يُطبَّع ═══'

DO $$
DECLARE v_a1 UUID; v_a2 UUID; v_a3 UUID; v_m TEXT; v_ok BOOLEAN;
BEGIN
  v_a1 := public.application_submit(
    current_setting('kyvzon.t362_p1')::UUID,'سالم المتقدّم','Salem@Example.COM',
    '0770','http://x/cv1.pdf','رسالة تغطية');
  v_a2 := public.application_submit(
    current_setting('kyvzon.t362_p1')::UUID,'ناصر المتقدّم','nasser@example.com');
  v_a3 := public.application_submit(
    current_setting('kyvzon.t362_p1')::UUID,'هند المتقدّمة','hind@example.com');
  PERFORM set_config('kyvzon.t362_a1', v_a1::TEXT, FALSE);
  PERFORM set_config('kyvzon.t362_a2', v_a2::TEXT, FALSE);
  PERFORM set_config('kyvzon.t362_a3', v_a3::TEXT, FALSE);

  -- ★★ البريد طُبِّع (وإلا التفّ المتقدّم على الفرادة بحرفٍ كبير)
  PERFORM pg_temp.chk('6.1 البريد طُبِّع صغيراً',
    (SELECT email FROM public.job_applications WHERE id=v_a1), 'salem@example.com');
  -- ★★★ العطل ②: الحالة من مفردات الواجهة لا submitted
  PERFORM pg_temp.chk('6.2 الحالة applied لا submitted',
    (SELECT status FROM public.job_applications WHERE id=v_a1), 'applied');

  -- ★★★ التكرار بحرفٍ كبير يُرفَض
  v_m := ''; BEGIN PERFORM public.application_submit(
    current_setting('kyvzon.t362_p1')::UUID,'سالم مكرَّر','SALEM@EXAMPLE.COM');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.3 RECRUITMENT_DUPLICATE_APPLICATION',
    (position('RECRUITMENT_DUPLICATE_APPLICATION' IN v_m) > 0)::TEXT, 'true');

  -- ★★ والفهرس الفريد يحرس الإدراج المباشر
  v_ok := FALSE;
  BEGIN INSERT INTO public.job_applications
          (tenant_id,posting_id,applicant_name,email)
        VALUES ('a3620000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t362_p1')::UUID,'مكرَّر','Salem@example.com');
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('6.4 الفهرس الفريد يحرس المباشر', v_ok::TEXT, 'true');

  PERFORM pg_temp.chk('6.5 ثلاثة متقدمين لا خمسة',
    (SELECT count(*)::TEXT FROM public.job_applications
      WHERE posting_id = current_setting('kyvzon.t362_p1')::UUID), '3');
END $$;

\echo ''
\echo '═══ ★★★ ⑦ العطل ①: قائمة المتقدمين تعمل الآن ═══'

DO $$
DECLARE v_n INTEGER; r RECORD;
BEGIN
  -- ★★★ كان findByJob يرمي: column "job_id" does not exist
  v_n := (SELECT count(*) FROM public.recruitment_applications(
    current_setting('kyvzon.t362_p1')::UUID, NULL));
  PERFORM pg_temp.chk('7.1 القائمة تُعيد 3', v_n::TEXT, '3');

  SELECT * INTO r FROM public.recruitment_applications(
    current_setting('kyvzon.t362_p1')::UUID, NULL)
   WHERE out_id = current_setting('kyvzon.t362_a1')::UUID;
  -- ★★ الحقول التي كانت undefined
  PERFORM pg_temp.chk('7.2 البريد موجود', r.out_email, 'salem@example.com');
  PERFORM pg_temp.chk('7.3 السيرة موجودة', r.out_resume_url, 'http://x/cv1.pdf');
  PERFORM pg_temp.chk('7.4 رسالة التغطية موجودة', r.out_cover_letter, 'رسالة تغطية');
  PERFORM pg_temp.chk('7.5 submitted_at غير فارغ',
    (r.out_submitted_at IS NOT NULL)::TEXT, 'true');
  -- ★ ولا مراجعَ بعد
  PERFORM pg_temp.chk('7.6 المراجع «—» لا فراغ', r.out_reviewer_name, '—');

  -- ★ إعلانٌ بلا متقدمين = صفر لا خطأ
  PERFORM pg_temp.chk('7.7 إعلانٌ بلا متقدمين = 0',
    (SELECT count(*)::TEXT FROM public.recruitment_applications(
      current_setting('kyvzon.t362_p3')::UUID, NULL)), '0');
END $$;

\echo ''
\echo '═══ ★★ ⑧ حرّاس تغيير الحالة ═══'

DO $$
DECLARE v_m TEXT;
BEGIN
  -- ★ مفردة مختلقة
  v_m := ''; BEGIN PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a1')::UUID,'مخترعة');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.1 RECRUITMENT_APP_STATUS_INVALID',
    (position('RECRUITMENT_APP_STATUS_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ التوظيف لا يمرّ من هنا
  v_m := ''; BEGIN PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a1')::UUID,'hired');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.2 RECRUITMENT_USE_HIRE_FUNCTION',
    (position('RECRUITMENT_USE_HIRE_FUNCTION' IN v_m) > 0)::TEXT, 'true');

  -- ★★ الرفض يحتاج سبباً
  v_m := ''; BEGIN PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a3')::UUID,'rejected');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.3 RECRUITMENT_REJECTION_REASON_REQUIRED',
    (position('RECRUITMENT_REJECTION_REASON_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a1')::UUID,'screening',NULL,9);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.4 RECRUITMENT_RATING_RANGE',
    (position('RECRUITMENT_RATING_RANGE' IN v_m) > 0)::TEXT, 'true');

  -- ★ ولا حالةَ تغيّرت
  PERFORM pg_temp.chk('8.5 الحالة لم تتغيّر',
    (SELECT status FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a1')::UUID), 'applied');
END $$;

\echo ''
\echo '═══ ★★ ⑨ التقدّم في المسار + المراجع يُسجَّل ═══'

DO $$
BEGIN
  PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a1')::UUID,'screening',NULL,4);
  PERFORM pg_temp.chk('9.1 الحالة صارت screening',
    (SELECT status FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a1')::UUID), 'screening');
  PERFORM pg_temp.chk('9.2 التقييم 4',
    (SELECT rating::TEXT FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a1')::UUID), '4');
  -- ★★ المحفّز يسجّل المراجع تلقائياً
  PERFORM pg_temp.chk('9.3 reviewed_by = هدى',
    (SELECT reviewed_by::TEXT FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a1')::UUID),
    '33620003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('9.4 reviewed_at غير فارغ',
    (SELECT (reviewed_at IS NOT NULL)::TEXT FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a1')::UUID), 'true');
  PERFORM pg_temp.chk('9.5 واسم المراجع في القائمة',
    (SELECT out_reviewer_name FROM public.recruitment_applications(
      current_setting('kyvzon.t362_p1')::UUID, NULL)
      WHERE out_id = current_setting('kyvzon.t362_a1')::UUID), 'هدى الموارد');

  PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a1')::UUID,'offer');
  PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a3')::UUID,'rejected','لا تتوفّر الخبرة');
  PERFORM pg_temp.chk('9.6 سبب الرفض مسجَّل',
    (SELECT rejection_reason FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a3')::UUID), 'لا تتوفّر الخبرة');
END $$;

\echo ''
\echo '═══ ★★★ ⑩ العطل ①: ترتيب القائمة بالأجدر لا بالأبجديّ ═══'

DO $$
DECLARE v_order TEXT;
BEGIN
  -- سالم offer(2) · ناصر applied(6) · هند rejected(7)
  SELECT string_agg(out_status, '|' ORDER BY rn) INTO v_order
    FROM (SELECT out_status, row_number() OVER () rn
            FROM public.recruitment_applications(
              current_setting('kyvzon.t362_p1')::UUID, NULL)) t;
  PERFORM pg_temp.chk('10.1 الترتيب: offer ثم applied ثم rejected',
    v_order, 'offer|applied|rejected');

  PERFORM pg_temp.chk('10.2 ترشيح applied = 1',
    (SELECT count(*)::TEXT FROM public.recruitment_applications(
      current_setting('kyvzon.t362_p1')::UUID, 'applied')), '1');
  PERFORM pg_temp.chk('10.3 ترشيح rejected = 1',
    (SELECT count(*)::TEXT FROM public.recruitment_applications(
      current_setting('kyvzon.t362_p1')::UUID, 'rejected')), '1');
END $$;

\echo ''
\echo '═══ ★★★ ⑪ العطل ⑬: التوظيف يُنشئ موظفاً فعلاً ═══'

DO $$
DECLARE r RECORD; v_emp UUID; v_m TEXT;
BEGIN
  -- ★ المرفوض لا يُوظَّف
  v_m := ''; BEGIN PERFORM public.application_hire(
    current_setting('kyvzon.t362_a3')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('11.1 RECRUITMENT_CANNOT_HIRE للمرفوض',
    (position('RECRUITMENT_CANNOT_HIRE' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ التوظيف الفعليّ — الشاغران 2 فالإعلان يبقى مفتوحاً
  SELECT * INTO r FROM public.application_hire(
    current_setting('kyvzon.t362_a1')::UUID, 'EMP-T362-A');
  v_emp := r.out_employee_id;
  PERFORM set_config('kyvzon.t362_emp', v_emp::TEXT, FALSE);

  PERFORM pg_temp.chk('11.2 صفّ employees أُنشئ',
    (SELECT count(*)::TEXT FROM public.employees WHERE id = v_emp), '1');
  PERFORM pg_temp.chk('11.3 الاسم الأول من اسم المتقدّم',
    (SELECT first_name FROM public.employees WHERE id = v_emp), 'سالم');
  PERFORM pg_temp.chk('11.4 والاسم الأخير',
    (SELECT last_name FROM public.employees WHERE id = v_emp), 'المتقدّم');
  -- ★★ البريد والهاتف يُنقلان (employees.email كان NULL دائماً)
  PERFORM pg_temp.chk('11.5 البريد نُقل', 
    (SELECT email FROM public.employees WHERE id = v_emp), 'salem@example.com');
  PERFORM pg_temp.chk('11.6 الهاتف نُقل',
    (SELECT phone FROM public.employees WHERE id = v_emp), '0770');
  -- ★ والقسم يُورَث من الإعلان
  PERFORM pg_temp.chk('11.7 القسم مُورَث من الإعلان',
    (SELECT department_id::TEXT FROM public.employees WHERE id = v_emp),
    'd3620000-0000-0000-0000-00000000000d');
  PERFORM pg_temp.chk('11.8 الرمز المُرسَل',
    (SELECT employee_code FROM public.employees WHERE id = v_emp), 'EMP-T362-A');

  -- ★★★ والطلب مربوطٌ بالموظف
  PERFORM pg_temp.chk('11.9 hired_employee_id مربوط',
    (SELECT (hired_employee_id = v_emp)::TEXT FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a1')::UUID), 'true');
  PERFORM pg_temp.chk('11.10 الحالة hired',
    (SELECT status FROM public.job_applications
      WHERE id = current_setting('kyvzon.t362_a1')::UUID), 'hired');

  -- ★★ شاغران وواحدٌ شُغل ⇒ الإعلان يبقى مفتوحاً وبقي شاغر
  PERFORM pg_temp.chk('11.11 الإعلان ما زال مفتوحاً', r.out_posting_status, 'open');
  PERFORM pg_temp.chk('11.12 بقي شاغرٌ واحد', r.out_left::TEXT, '1');

  -- ★ والموظَّف لا يعود متقدّماً
  v_m := ''; BEGIN PERFORM public.application_set_status(
    current_setting('kyvzon.t362_a1')::UUID,'screening');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('11.13 RECRUITMENT_ALREADY_HIRED',
    (position('RECRUITMENT_ALREADY_HIRED' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑫ الشاغر الثاني يُغلق الإعلان تلقائياً ═══'

DO $$
DECLARE r RECORD; v_m TEXT;
BEGIN
  SELECT * INTO r FROM public.application_hire(
    current_setting('kyvzon.t362_a2')::UUID, 'EMP-T362-B');
  PERFORM pg_temp.chk('12.1 الإعلان صار filled', r.out_posting_status, 'filled');
  PERFORM pg_temp.chk('12.2 لم يبقَ شاغر', r.out_left::TEXT, '0');
  PERFORM pg_temp.chk('12.3 وحالة الإعلان في الجدول',
    (SELECT status FROM public.job_postings
      WHERE id = current_setting('kyvzon.t362_p1')::UUID), 'filled');
  PERFORM pg_temp.chk('12.4 موظّفان أُنشئا',
    (SELECT count(*)::TEXT FROM public.employees
      WHERE tenant_id='a3620000-0000-0000-0000-00000000000a'
        AND employee_code LIKE 'EMP-T362-%'), '2');

  -- ★★★ ولا توظيفَ فوق الشواغر — نُعيد فتح الإعلان ونُجرّب متقدّماً رابعاً
  UPDATE public.job_postings SET status='open'
   WHERE id = current_setting('kyvzon.t362_p1')::UUID;
  DECLARE v_a4 UUID;
  BEGIN
    v_a4 := public.application_submit(
      current_setting('kyvzon.t362_p1')::UUID,'رابع','rabi@example.com');
    v_m := ''; BEGIN PERFORM public.application_hire(v_a4);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
    PERFORM pg_temp.chk('12.5 RECRUITMENT_NO_VACANCY_LEFT',
      (position('RECRUITMENT_NO_VACANCY_LEFT' IN v_m) > 0)::TEXT, 'true');
    PERFORM pg_temp.chk('12.6 ولا موظّف ثالث أُنشئ',
      (SELECT count(*)::TEXT FROM public.employees
        WHERE tenant_id='a3620000-0000-0000-0000-00000000000a'
          AND employee_code LIKE 'EMP-T362-%'), '2');
    PERFORM set_config('kyvzon.t362_a4', v_a4::TEXT, FALSE);
  END;
  UPDATE public.job_postings SET status='filled'
   WHERE id = current_setting('kyvzon.t362_p1')::UUID;

  -- ★ ورمزٌ مكرَّر يُرفَض
  v_m := ''; BEGIN PERFORM public.application_hire(
    current_setting('kyvzon.t362_a4')::UUID, 'EMP-T362-A');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('12.7 رمزٌ مكرَّر يُرفَض',
    (position('RECRUITMENT_EMPLOYEE_CODE_TAKEN' IN v_m) > 0
     OR position('RECRUITMENT_NO_VACANCY_LEFT' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑬ العطلان ⑩: الحذف ممنوع ولا إبادة ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.job_applications
         WHERE id = current_setting('kyvzon.t362_a1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.1 حذف الطلب يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('13.2 رمز RECRUITMENT_DELETE_BLOCKED',
    (position('RECRUITMENT_DELETE_BLOCKED' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE;
  BEGIN DELETE FROM public.job_postings
         WHERE id = current_setting('kyvzon.t362_p1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('13.3 حذف الإعلان يرمي', v_ok::TEXT, 'true');

  -- ★★★ وحتى بتعطيل المحفّز، RESTRICT يمنع الإبادة
  ALTER TABLE public.job_postings DISABLE TRIGGER trg_block_job_posting_delete;
  v_ok := FALSE;
  BEGIN DELETE FROM public.job_postings
         WHERE id = current_setting('kyvzon.t362_p1')::UUID;
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('13.4 RESTRICT يمنع إبادة المتقدمين', v_ok::TEXT, 'true');
  ALTER TABLE public.job_postings ENABLE TRIGGER trg_block_job_posting_delete;

  PERFORM pg_temp.chk('13.5 المتقدمون الأربعة باقون',
    (SELECT count(*)::TEXT FROM public.job_applications
      WHERE posting_id = current_setting('kyvzon.t362_p1')::UUID), '4');
END $$;

\echo ''
\echo '═══ ★★ ⑭ اللوح: عدّادات المتقدمين (العطل ⑭) ═══'

DO $$
DECLARE r RECORD; v_order TEXT;
BEGIN
  SELECT * INTO r FROM public.recruitment_board(NULL,NULL,500)
   WHERE out_id = current_setting('kyvzon.t362_p1')::UUID;
  -- سالم hired · ناصر hired · هند rejected · رابع applied = 4
  PERFORM pg_temp.chk('14.1 مجموع المتقدمين', r.out_apps_total::TEXT, '4');
  PERFORM pg_temp.chk('14.2 الجدد (applied)', r.out_apps_new::TEXT, '1');
  PERFORM pg_temp.chk('14.3 قيد المسار', r.out_apps_progress::TEXT, '0');
  PERFORM pg_temp.chk('14.4 الموظَّفون', r.out_apps_hired::TEXT, '2');
  PERFORM pg_temp.chk('14.5 القسم', r.out_department, 'المالية');
  PERFORM pg_temp.chk('14.6 المنشئ', r.out_creator_name, 'هدى الموارد');
  -- ★ 30 يوماً من اليوم
  PERFORM pg_temp.chk('14.7 المتبقّي 30 يوماً', r.out_days_left::TEXT, '30');
  PERFORM pg_temp.chk('14.8 غير منتهٍ', r.out_is_expired::TEXT, 'false');

  -- ★ إعلانٌ بلا موعد إغلاق: NULL لا صفر (درس 0353)
  PERFORM pg_temp.chk('14.9 بلا موعد إغلاق = NULL',
    (SELECT out_days_left::TEXT FROM public.recruitment_board(NULL,NULL,500)
      WHERE out_id = current_setting('kyvzon.t362_p3')::UUID), NULL);
  PERFORM pg_temp.chk('14.10 وإعلانٌ بلا متقدمين = 0 لا NULL',
    (SELECT out_apps_total::TEXT FROM public.recruitment_board(NULL,NULL,500)
      WHERE out_id = current_setting('kyvzon.t362_p3')::UUID), '0');

  -- ★★★ الترتيب: المفتوح أوّلاً — والتسوية بين غير المفتوحَين
  --   تقع على (created_at DESC, id DESC).
  --
  -- ★ تصحيحٌ لخطأٍ في نسختي الأولى: توقّعتُ 'open|draft|filled' وهو
  --   تأكيدٌ **غير موثوق**: كل الصفوف تُدرَج في معاملةٍ واحدة و
  --   `created_at DEFAULT now()` = طابع المعاملة ⇒ **متساوية كلها**،
  --   فالفرز يقع على `id` وهو `gen_random_uuid()` عشوائيّ. أسقطه
  --   خطُّ الأساس بـ«got=open|filled|draft». الشرط الحقيقيّ الذي
  --   يحرسه المايجريشن هو **المفتوح أوّلاً** لا ترتيب البقية.
  SELECT string_agg(out_status,'|' ORDER BY rn) INTO v_order
    FROM (SELECT out_status, row_number() OVER () rn
            FROM public.recruitment_board(NULL,NULL,500)) t;
  PERFORM pg_temp.chk('14.11 المفتوح أوّلاً في اللوح',
    split_part(v_order,'|',1), 'open');
  -- ★★ والمفتوح وحده في المقدّمة (لا مفتوحَ بعد غير المفتوح)
  PERFORM pg_temp.chk('14.11b لا مفتوحَ بعد غير المفتوح',
    (position('open' IN split_part(v_order,'|',2)
                      || split_part(v_order,'|',3)) > 0)::TEXT, 'false');

  -- ★★★ والترتيب **حتميّ** بمفتاحين: نُفرِّق الطوابع ونقارن بمرجعٍ مستقلّ
  -- ★★ الطوابع تُفرَّق **عكس** الترتيب الأبجديّ للعناوين، وإلا وافق
  --   `ORDER BY b.title` المرجعَ صدفةً ونجا العكس INV39 (وقد نجا فعلاً).
  --   «سائق» < «محاسب أول» < «مطوّر واجهات» أبجدياً — فنجعل الأقدم
  --   زمنياً هو الأول أبجدياً ليختلف الترتيبان حتماً.
  UPDATE public.job_postings b
     SET created_at = now() - (s.rn || ' hours')::INTERVAL
    FROM (SELECT id, row_number() OVER (ORDER BY title DESC) rn
            FROM public.job_postings
           WHERE tenant_id='a3620000-0000-0000-0000-00000000000a') s
   WHERE b.id = s.id;
  DECLARE v_want TEXT;
  BEGIN
    SELECT string_agg(t.title,'|' ORDER BY (t.status='open') DESC,
                      t.created_at DESC, t.id DESC)
      INTO v_want FROM public.job_postings t
     WHERE t.tenant_id='a3620000-0000-0000-0000-00000000000a';
    SELECT string_agg(out_title,'|' ORDER BY rn) INTO v_order
      FROM (SELECT out_title, row_number() OVER () rn
              FROM public.recruitment_board(NULL,NULL,500)) t;
    PERFORM pg_temp.chk('14.11c الترتيب = المرجع الحتميّ', v_order, v_want);
  END;

  PERFORM pg_temp.chk('14.12 ترشيح open = 1',
    (SELECT count(*)::TEXT FROM public.recruitment_board(NULL,'open',500)), '1');
  PERFORM pg_temp.chk('14.13 بحث «محاسب»',
    (SELECT count(*)::TEXT FROM public.recruitment_board('محاسب',NULL,500)), '1');
  PERFORM pg_temp.chk('14.14 بحث بالقسم «المالية»',
    (SELECT count(*)::TEXT FROM public.recruitment_board('المالية',NULL,500)), '1');
  PERFORM pg_temp.chk('14.15 LIMIT = 2 يعمل',
    (SELECT count(*)::TEXT FROM public.recruitment_board(NULL,NULL,2)), '2');
END $$;

\echo ''
\echo '═══ ★★ ⑮ الملخّص بأرقام محسوبة يدوياً ═══'

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.recruitment_summary();
  -- p3 مفتوح · p2 مسودة · p1 filled
  PERFORM pg_temp.chk('15.1 المفتوح',   r.out_open::TEXT,   '1');
  PERFORM pg_temp.chk('15.2 المسودة',   r.out_draft::TEXT,  '1');
  PERFORM pg_temp.chk('15.3 المغلق',    r.out_closed::TEXT, '1');
  -- الشواغر في المفتوح: p3 = 1
  PERFORM pg_temp.chk('15.4 الشواغر',   r.out_vacancies::TEXT, '1');
  PERFORM pg_temp.chk('15.5 المنتهي',   r.out_expired::TEXT, '0');
  -- الطلبات غير المسحوبة: 4
  PERFORM pg_temp.chk('15.6 الطلبات',   r.out_apps_total::TEXT, '4');
  PERFORM pg_temp.chk('15.7 الجدد',     r.out_apps_new::TEXT, '1');
  PERFORM pg_temp.chk('15.8 الموظَّفون', r.out_apps_hired::TEXT, '2');
  -- ★★ المفتوح بلا متقدّم: p3
  PERFORM pg_temp.chk('15.9 مفتوحٌ بلا متقدّم', r.out_no_apps::TEXT, '1');

  -- ★★★ كشف العكسُ INV41 أن هذا التأكيد وحده لا يميّز «المفتوح بلا
  --   متقدّم» عن «المفتوح كلّه»: في العيّنة كان المفتوح واحداً وهو
  --   نفسه بلا متقدّم ⇒ الرقمان متساويان فنجا العكس. نُعيد فتح p1
  --   (وله أربعة متقدمين) فيصير المفتوح 2 و«بلا متقدّم» 1.
  PERFORM public.job_posting_upsert(
    current_setting('kyvzon.t362_p1')::UUID,'محاسب أول','إدارة القيود','محاسب',
    'd3620000-0000-0000-0000-00000000000d','full_time',800000,1200000,2,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 30), ARRAY['IFRS'],'open');
  SELECT * INTO r FROM public.recruitment_summary();
  PERFORM pg_temp.chk('15.10 المفتوح صار 2', r.out_open::TEXT, '2');
  PERFORM pg_temp.chk('15.11 و«بلا متقدّم» بقي 1 لا 2', r.out_no_apps::TEXT, '1');
  -- ★ والشواغر صارت 1 + 2 = 3
  PERFORM pg_temp.chk('15.12 الشواغر صارت 3', r.out_vacancies::TEXT, '3');
  -- استرجاع
  PERFORM public.job_posting_upsert(
    current_setting('kyvzon.t362_p1')::UUID,'محاسب أول','إدارة القيود','محاسب',
    'd3620000-0000-0000-0000-00000000000d','full_time',800000,1200000,2,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 30), ARRAY['IFRS'],'filled');
END $$;

\echo ''
\echo '═══ ★★★ ⑯ عزل المستأجر ═══'

DO $$
DECLARE v_n INTEGER; v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77620007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.application_submit(
    '50620000-0000-0000-0000-00000000000b','متقدّم باء','b@example.com');

  v_n := (SELECT count(*) FROM public.recruitment_board(NULL,NULL,500));
  PERFORM pg_temp.chk('16.1 باء يرى إعلاناً واحداً', v_n::TEXT, '1');
  PERFORM pg_temp.chk('16.2 ملخّص باء: طلبٌ واحد',
    (SELECT out_apps_total::TEXT FROM public.recruitment_summary()), '1');

  PERFORM set_config('request.jwt.claim.sub',
    '33620003-0000-0000-0000-000000000003', TRUE);
  v_n := (SELECT count(*) FROM public.recruitment_board(NULL,NULL,500));
  PERFORM pg_temp.chk('16.3 هدى ما زالت ترى 3 لا 4', v_n::TEXT, '3');
  PERFORM pg_temp.chk('16.4 إعلان باء غائب',
    (SELECT count(*)::TEXT FROM public.recruitment_board(NULL,NULL,500)
      WHERE out_title='إعلان باء الأصلي'), '0');
  PERFORM pg_temp.chk('16.5 والصفّ موجود فعلاً',
    (SELECT count(*)::TEXT FROM public.job_postings
      WHERE title='إعلان باء الأصلي'), '1');
  -- ★★ وقائمة متقدمي باء محجوبة
  PERFORM pg_temp.chk('16.6 قائمة متقدمي باء محجوبة عن هدى',
    (SELECT count(*)::TEXT FROM public.recruitment_applications(
      '50620000-0000-0000-0000-00000000000b', NULL)), '0');
  -- ★★★ وهدى لا تُعدّل إعلان باء
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(
    '50620000-0000-0000-0000-00000000000b','مُختطَف','وصف');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('16.7 هدى لا تُعدّل إعلان باء',
    (position('RECRUITMENT_POSTING_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('16.8 عنوان إعلان باء لم يتغيّر',
    (SELECT title FROM public.job_postings
      WHERE id='50620000-0000-0000-0000-00000000000b'), 'إعلان باء الأصلي');
END $$;

\echo ''
\echo '═══ ★★ ⑰ حرّاس الدور ═══'

DO $$
DECLARE v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '11620001-0000-0000-0000-000000000001', TRUE);
  v_m := ''; BEGIN PERFORM public.recruitment_summary();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('17.1 الموظف محجوب عن الملخّص',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.recruitment_board(NULL,NULL,10);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('17.2 الموظف محجوب عن اللوح',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.recruitment_applications(
    current_setting('kyvzon.t362_p1')::UUID, NULL);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('17.3 الموظف محجوب عن المتقدمين',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  -- ★★ والمدير ليس staff
  PERFORM set_config('request.jwt.claim.sub',
    '44620004-0000-0000-0000-000000000004', TRUE);
  v_m := ''; BEGIN PERFORM public.job_posting_upsert(NULL,'منصبي','وصف');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('17.4 المدير لا يُنشئ إعلاناً',
    (position('RECRUITMENT_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.application_hire(
    current_setting('kyvzon.t362_a4')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('17.5 المدير لا يُوظِّف',
    (position('RECRUITMENT_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  PERFORM set_config('request.jwt.claim.sub',
    '33620003-0000-0000-0000-000000000003', TRUE);
  PERFORM pg_temp.chk('17.6 لا إعلان دخل من الحرّاس',
    (SELECT count(*)::TEXT FROM public.job_postings WHERE title='منصبي'), '0');
END $$;

\echo ''
\echo '════════════ كل تأكيدات 0362 نجحت ════════════'
ROLLBACK;
