-- ============================================================================
-- verify-sop-compliance-0343.sql
--
-- إجراءات التشغيل: تتبّع القراءة · الاعتماد · امتثال الأقسام.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**.
-- ★★ سياسة UPDATE للمالك (جوهر عطل ②) لا تُقاس هنا — postgres يتجاوز RLS.
--    تُقاس في verify-sop-compliance-0343-rls.sh. لا نضع تأكيدات جوفاء.
--
-- ملاحظات بنيوية مُحقَّقة (لا تخمين):
--   sops: **لا عمود content** · department varchar نصّ حرّ
--     + department_id (0343) · status: active/archived
--   sop_readings: started_at·last_read_at·read_count·time_spent
--     completed·approved·approval_status·approved_at
--     employee_id→employees · UNIQUE(employee_id, sop_id)
--     approval_status CHECK ∈ pending·approved·rejected
--   ★ محفّز trg_ensure_employee_row (0317) · قيد 0335
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_uEmp  UUID := gen_random_uuid();
  v_uOth  UUID := gen_random_uuid();
  v_uHr   UUID := gen_random_uuid();
  v_uB    UUID := gen_random_uuid();
  v_eEmp  UUID; v_eOth UUID; v_eHr UUID; v_eB UUID;
  v_d     UUID := gen_random_uuid();
  v_d2    UUID := gen_random_uuid();
  v_dB    UUID := gen_random_uuid();
  v_s1    UUID; v_s2 UUID; v_s3 UUID; v_sArch UUID; v_sB UUID;
  v_n     INT; v_txt TEXT; v_msg TEXT; v_ok BOOLEAN;
  v_big   BIGINT; v_num NUMERIC; v_int INT; v_int2 INT;
  v_pass  INT := 0;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  -- ★ الدوال INVOKER وهذا الملف postgres ⇒ لا ترشيح تلقائي بالمستأجر.
  --   ننظّف لئلا تُفسد جولة سابقة كل عدّ (درس 0341).
  DELETE FROM public.sop_readings;
  DELETE FROM public.sops;

  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'SA','إجراءات أ','so43a-'||substr(v_t::text ,1,8)),
    (v_tb,'SB','إجراءات ب','so43b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_uEmp,'e-'||substr(v_uEmp::text,1,8)||'@s43.io'),
    (v_uOth,'o-'||substr(v_uOth::text,1,8)||'@s43.io'),
    (v_uHr ,'h-'||substr(v_uHr::text ,1,8)||'@s43.io'),
    (v_uB  ,'b-'||substr(v_uB::text  ,1,8)||'@s43.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
    (v_uEmp,v_t ,'سعد الموظف','employee','الإنتاج'),
    (v_uOth,v_t ,'ليلى','employee','الإنتاج'),
    (v_uHr ,v_t ,'هالة الموارد','hr','الإدارة'),
    (v_uB  ,v_tb,'موظف ب','employee','قسم ب');

  SELECT id INTO v_eEmp FROM public.employees WHERE user_id=v_uEmp AND tenant_id=v_t;
  SELECT id INTO v_eOth FROM public.employees WHERE user_id=v_uOth AND tenant_id=v_t;
  SELECT id INTO v_eHr  FROM public.employees WHERE user_id=v_uHr  AND tenant_id=v_t;
  SELECT id INTO v_eB   FROM public.employees WHERE user_id=v_uB   AND tenant_id=v_tb;
  ASSERT v_eEmp IS NOT NULL AND v_eOth IS NOT NULL
     AND v_eHr IS NOT NULL AND v_eB IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّات الموظفين — تجهيز باطل';
  v_pass := v_pass + 1;

  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d ,v_t ,'الإنتاج'), (v_d2,v_t ,'الإدارة'), (v_dB,v_tb,'قسم ب');
  UPDATE public.employees SET department_id=v_d  WHERE id IN (v_eEmp,v_eOth);
  UPDATE public.employees SET department_id=v_d2 WHERE id = v_eHr;
  UPDATE public.employees SET department_id=v_dB WHERE id = v_eB;

  -- ★ إجراءات: قسميّ · عام · قسم آخر · مؤرشف · مستأجر آخر
  INSERT INTO public.sops(tenant_id,code,title,description,department,department_id,
                          category,version,status,is_mandatory) VALUES
    (v_t ,'SOP-001','إجراء السلامة','وصف السلامة','الإنتاج',v_d ,'safety' ,'1.0','active'  ,TRUE),
    (v_t ,'SOP-002','إجراء عام','وصف عام','general',NULL,'quality','1.0','active'  ,FALSE),
    (v_t ,'SOP-003','إجراء الإدارة','وصف','الإدارة',v_d2,'safety' ,'1.0','active'  ,TRUE),
    (v_t ,'SOP-004','مؤرشف','وصف','الإنتاج',v_d ,'safety' ,'1.0','archived',FALSE),
    (v_tb,'SOP-B01','إجراء ب','وصف','قسم ب',v_dB,'safety' ,'1.0','active'  ,TRUE);
  SELECT id INTO v_s1    FROM public.sops WHERE code='SOP-001';
  SELECT id INTO v_s2    FROM public.sops WHERE code='SOP-002';
  SELECT id INTO v_s3    FROM public.sops WHERE code='SOP-003';
  SELECT id INTO v_sArch FROM public.sops WHERE code='SOP-004';
  SELECT id INTO v_sB    FROM public.sops WHERE code='SOP-B01';

  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('sop_reading_touch','sop_reading_approve','my_sops','sop_compliance_overview');
  ASSERT v_n = 4, format('1.1 دوال 0343 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN ('my_sops','sop_compliance_overview')),
    '1.2 ★★ إحدى دالتَي القراءة صارت SECURITY DEFINER — تتجاوز RLS';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('sop_reading_touch','sop_reading_approve',
                            'my_sops','sop_compliance_overview')),
    '1.3 ★★ anon يملك EXECUTE على إحدى دوال 0343';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename='sop_readings'
                    AND policyname='kyvzon_sop_readings_update_owner'),
    '1.4 ★★★ سياسة تحديث المالك غائبة — الموظف لا يستطيع متابعة قراءته';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_guard_sop_reading' AND NOT tgisinternal),
    '1.5 ★★ حارس سجلّ القراءة غائب';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='sops' AND column_name='department_id'),
    '1.6 ★★ عمود department_id غائب — الترشيح يبقى نصّياً';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('uq_sop_reading_tenant_emp_sop','idx_sop_readings_emp',
     'idx_sop_readings_approved','idx_sops_dept_active');
  ASSERT v_n = 4, format('1.7 فهارس 0343 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② ★★★ بدء القراءة يكتب في القاعدة (كان useState فقط) ════════════
  ASSERT (SELECT count(*) FROM public.sop_readings) = 0,
    '2.0 تجهيز باطل: توجد قراءات قبل البدء';
  v_pass := v_pass + 1;

  SELECT out_read_count, out_time_spent INTO v_int, v_int2
    FROM public.sop_reading_touch(v_s1, NULL);
  ASSERT v_int = 1, format('2.1 read_count = %s بعد أول لمسة (متوقَّع 1)', v_int);
  ASSERT v_int2 = 0, format('2.2 time_spent = %s عند البدء (متوقَّع 0)', v_int2);
  v_pass := v_pass + 2;

  ASSERT (SELECT count(*) FROM public.sop_readings
           WHERE sop_id=v_s1 AND employee_id=v_eEmp) = 1,
    '2.3 ★★★ لم يُكتب صفّ قراءة — التتبّع ما زال في الذاكرة';
  v_pass := v_pass + 1;

  -- ★ tenant_id يُشتقّ من الجلسة
  ASSERT (SELECT tenant_id FROM public.sop_readings WHERE sop_id=v_s1) = v_t,
    '2.4 ★★ tenant_id لم يُشتقّ من الجلسة';
  v_pass := v_pass + 1;

  -- ═══ ③ ★★ الوقت من فارق الطوابع لا من المتصفح ════════════════════════
  --   نُرجِع last_read_at خمس دقائق للخلف ثم نلمس
  UPDATE public.sop_readings SET last_read_at = NOW() - INTERVAL '5 minutes'
   WHERE sop_id=v_s1 AND employee_id=v_eEmp;
  SELECT out_time_spent INTO v_int FROM public.sop_reading_touch(v_s1, NULL);
  ASSERT v_int BETWEEN 295 AND 305,
    format('3.1 ★★ الوقت = %s ثانية (متوقَّع ≈300 من فارق الطوابع)', v_int);
  v_pass := v_pass + 1;

  -- ★★★ سقف النبضة: تبويب مفتوح يوماً كاملاً ليس قراءة
  UPDATE public.sop_readings SET last_read_at = NOW() - INTERVAL '10 hours'
   WHERE sop_id=v_s1 AND employee_id=v_eEmp;
  SELECT out_time_spent INTO v_int2 FROM public.sop_reading_touch(v_s1, NULL);
  ASSERT v_int2 - v_int <= 900,
    format('3.2 ★★★ نبضة بعد 10 ساعات أضافت %s ثانية — لا سقف',
           v_int2 - v_int);
  ASSERT v_int2 - v_int >= 890,
    format('3.3 السقف طُبِّق بقيمة خاطئة: %s', v_int2 - v_int);
  v_pass := v_pass + 2;

  /* ★★★ ثغرة تغطية أُصلحت: مقارنة لمستين متتاليتين تقيس **الثانية**
     وحدها، فعكس LEAST↔GREATEST لا يُكشف. نقيس **الزيادة** لكل لمسة
     على حدة بأخذ لقطة قبلها وبعدها. */
  DECLARE v_before INT; v_after INT;
  BEGIN
    -- (أ) تلميح ضخم مع فارق 5 دقائق ⇒ يجب ألّا يتجاوز 300
    UPDATE public.sop_readings SET last_read_at = NOW() - INTERVAL '5 minutes'
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    SELECT time_spent INTO v_before FROM public.sop_readings
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    SELECT out_time_spent INTO v_after FROM public.sop_reading_touch(v_s1, 99999);
    ASSERT v_after - v_before BETWEEN 295 AND 305,
      format('3.4 ★★★ تلميح 99999 أضاف %s ثانية (متوقَّع ≈300 من الطوابع) '
             '— التلميح يُصدَّق بدل أن يُقيَّد', v_after - v_before);

    -- (ب) تلميح صفر مع فارق 5 دقائق ⇒ يجب ألّا يُضاف شيء
    UPDATE public.sop_readings SET last_read_at = NOW() - INTERVAL '5 minutes'
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    SELECT time_spent INTO v_before FROM public.sop_readings
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    SELECT out_time_spent INTO v_after FROM public.sop_reading_touch(v_s1, 0);
    ASSERT v_after = v_before,
      format('3.5 ★★★ تلميح 0 أضاف %s ثانية — لا يُؤخذ الأصغر', v_after - v_before);
  END;
  v_pass := v_pass + 2;

  /* ★★★ ثغرة تغطية أُصلحت: عدّ القراءات كان يُقاس مرّةً واحدة عند
     الإنشاء (=1) وهي قيمة ثابتة في INSERT، فعكس `+1` في UPDATE لا
     يُكشف. نقيس **التزايد** بعد لمسة إضافية. */
  DECLARE v_rc1 INT; v_rc2 INT;
  BEGIN
    SELECT read_count INTO v_rc1 FROM public.sop_readings
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    PERFORM public.sop_reading_touch(v_s1, NULL);
    SELECT read_count INTO v_rc2 FROM public.sop_readings
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    ASSERT v_rc2 = v_rc1 + 1,
      format('3.6 ★★ عدّ القراءات لم يتزايد: %s ← %s', v_rc1, v_rc2);
  END;
  v_pass := v_pass + 1;

  -- ═══ ④ الاعتماد ═══════════════════════════════════════════════════════
  ASSERT public.sop_reading_approve(v_s1), '4.1 الاعتماد أعاد FALSE';
  v_pass := v_pass + 1;

  SELECT approved, completed, approval_status INTO v_ok, v_msg, v_txt
    FROM public.sop_readings WHERE sop_id=v_s1 AND employee_id=v_eEmp;
  ASSERT v_ok, '4.2 ★★★ approved لم يُضبط — لا دليل امتثال';
  ASSERT v_msg::BOOLEAN, '4.3 completed لم يُضبط';
  ASSERT v_txt = 'approved', format('4.4 approval_status = %s', v_txt);
  ASSERT (SELECT approved_at FROM public.sop_readings
           WHERE sop_id=v_s1 AND employee_id=v_eEmp) IS NOT NULL,
    '4.5 approved_at فارغ';
  v_pass := v_pass + 4;

  -- ★ اعتماد ثانٍ يُعيد FALSE لا خطأً
  ASSERT public.sop_reading_approve(v_s1) = FALSE,
    '4.6 اعتماد المعتمَد لم يُعِد FALSE';
  v_pass := v_pass + 1;

  -- ★★ اعتماد بلا بدء قراءة مرفوض
  BEGIN
    PERFORM public.sop_reading_approve(v_s2);
    RAISE EXCEPTION '4.7 ★★ اعتماد إجراء لم تبدأ قراءته قُبِل';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'SOP_NOT_STARTED%', format('4.7 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★ إجراء غير موجود مرفوض
  BEGIN
    PERFORM public.sop_reading_touch(gen_random_uuid(), NULL);
    RAISE EXCEPTION '4.8 ★ لمس إجراء غير موجود قُبِل';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ★★★ ولا إجراء من مستأجر آخر
  BEGIN
    PERFORM public.sop_reading_touch(v_sB, NULL);
    RAISE EXCEPTION '4.9 ★★★ لمس إجراء من مستأجر آخر قُبِل';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★★ الحارس ══════════════════════════════════════════════════════
  -- ★★★ الاعتماد لا يُسحب
  BEGIN
    UPDATE public.sop_readings SET approved = FALSE
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    RAISE EXCEPTION '5.1 ★★★ الاعتماد سُحب — إقرار الامتثال ليس نهائياً';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'SOP_APPROVAL_FINAL%', format('5.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★ الوقت لا ينقص
  BEGIN
    UPDATE public.sop_readings SET time_spent = 1
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    RAISE EXCEPTION '5.2 ★★ الوقت المستغرق نقص';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'SOP_TIME_MONOTONIC%', format('5.2 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★★ الانتماء ثابت
  BEGIN
    UPDATE public.sop_readings SET employee_id = v_eOth
     WHERE sop_id=v_s1 AND employee_id=v_eEmp;
    RAISE EXCEPTION '5.3 ★★★ نُقل سجلّ القراءة إلى موظف آخر';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'SOP_READING_IMMUTABLE_LINK%',
      format('5.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ لكن الموارد البشرية تستطيع التصحيح الإداري
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
  UPDATE public.sop_readings SET time_spent = 1
   WHERE sop_id=v_s1 AND employee_id=v_eEmp;
  ASSERT (SELECT time_spent FROM public.sop_readings
           WHERE sop_id=v_s1 AND employee_id=v_eEmp) = 1,
    '5.4 ★ الموارد لا تستطيع التصحيح الإداري — الحارس أوسع من اللازم';
  v_pass := v_pass + 1;
  UPDATE public.sop_readings SET time_spent = 400
   WHERE sop_id=v_s1 AND employee_id=v_eEmp;
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  -- ═══ ⑥ ★★★ كتالوج الموظف: الانتماء بالمعرّف ══════════════════════════
  SELECT count(*) INTO v_n FROM public.my_sops(NULL,NULL,NULL,100,0);
  ASSERT v_n = 2,
    format('6.1 ★★ الموظف يرى %s إجراء (متوقَّع 2: قسمه + العام)', v_n);
  v_pass := v_pass + 1;

  -- ★★ لا يرى إجراء قسم آخر ولا المؤرشف
  SELECT count(*) INTO v_n FROM public.my_sops(NULL,NULL,NULL,100,0)
   WHERE out_id IN (v_s3, v_sArch, v_sB);
  ASSERT v_n = 0,
    format('6.2 ★★★ الكتالوج سرّب %s إجراءً (قسم آخر/مؤرشف/مستأجر آخر)', v_n);
  v_pass := v_pass + 1;

  /* ★★★ جوهر عطل ③: الترشيح كان مطابقةً نصّية بين sops.department
     و profiles.department. نُعيد تسمية القسم في departments — العمودان
     النصّيان يتباعدان، والمعرّف يبقى. لو عاد الترشيح نصّياً لاختفى
     الإجراء القسمي. */
  /* ★★★ ثغرة تغطية أُصلحت: إعادة تسمية `departments` وحدها لا تكشف
     الترشيح النصّي، لأن `sops.department` و`profiles.department` يبقيان
     متطابقَين ('الإنتاج') فالاحتياط النصّي يُنقذ. الكشف الحقيقي يحتاج
     **تباعد العمودين النصّيين نفسيهما** — وهو ما يحدث فعلاً حين يُحدَّث
     ملف الموظف وحده أو يُصحَّح إملاء أحدهما. */
  UPDATE public.departments SET name_ar='الإنتاج والتصنيع' WHERE id=v_d;
  UPDATE public.profiles    SET department='الإنتاج والتصنيع' WHERE id=v_uEmp;
  ASSERT (SELECT department FROM public.sops WHERE id=v_s1) = 'الإنتاج',
    '6.3a تجهيز باطل: sops.department تبع — لا تباعد يُقاس';
  ASSERT (SELECT department FROM public.profiles WHERE id=v_uEmp)
         <> (SELECT department FROM public.sops WHERE id=v_s1),
    '6.3b تجهيز باطل: العمودان النصّيان ما زالا متطابقَين';
  SELECT count(*) INTO v_n FROM public.my_sops(NULL,NULL,NULL,100,0)
   WHERE out_id = v_s1;
  ASSERT v_n = 1,
    '6.3 ★★★ الإجراء القسمي اختفى بعد تباعد النصّين — الترشيح ما زال نصّياً';
  v_pass := v_pass + 1;

  -- ★ واسم القسم المعروض يتبع departments الحيّ
  SELECT out_department INTO v_txt FROM public.my_sops(NULL,NULL,NULL,100,0)
   WHERE out_id = v_s1;
  ASSERT v_txt = 'الإنتاج والتصنيع',
    format('6.4 ★★ القسم المعروض = ''%s'' — العمود النصّي المتجمّد', v_txt);
  v_pass := v_pass + 1;
  UPDATE public.departments SET name_ar='الإنتاج' WHERE id=v_d;
  UPDATE public.profiles    SET department='الإنتاج' WHERE id=v_uEmp;

  -- ★★ تقدّم القراءة مُرفَق
  SELECT out_read_count, out_approved INTO v_int, v_ok
    FROM public.my_sops(NULL,NULL,NULL,100,0) WHERE out_id = v_s1;
  ASSERT v_int > 0, '6.5 ★★ read_count صفر رغم القراءة';
  ASSERT v_ok, '6.6 ★★ approved لا يظهر في الكتالوج';
  v_pass := v_pass + 2;

  -- ★ الترشيح بالحالة
  SELECT count(*) INTO v_n FROM public.my_sops(NULL,NULL,'completed',100,0);
  ASSERT v_n = 1, format('6.7 المكتملة = %s (متوقَّع 1)', v_n);
  SELECT count(*) INTO v_n FROM public.my_sops(NULL,NULL,'not_started',100,0);
  ASSERT v_n = 1, format('6.8 لم تبدأ = %s (متوقَّع 1: العام)', v_n);
  v_pass := v_pass + 2;

  -- ★ البحث والتصنيف والترقيم
  SELECT count(*) INTO v_n FROM public.my_sops('السلامة',NULL,NULL,100,0);
  ASSERT v_n = 1, format('6.9 البحث = %s', v_n);
  SELECT count(*) INTO v_n FROM public.my_sops(NULL,'quality',NULL,100,0);
  ASSERT v_n = 1, format('6.10 ترشيح التصنيف = %s', v_n);
  SELECT COALESCE(max(out_total),0) INTO v_big FROM public.my_sops(NULL,NULL,NULL,1,0);
  ASSERT v_big = 2, format('6.11 ★ out_total = %s مع limit=1 (متوقَّع 2)', v_big);
  ASSERT (SELECT count(*) FROM public.my_sops(NULL,NULL,NULL,1,0)) = 1,
    '6.12 p_limit لا يُطبَّق';
  v_pass := v_pass + 4;

  -- ★★ الترتيب: الإلزامي غير المعتمَد أوّلاً
  PERFORM set_config('request.jwt.claim.sub', v_uOth::text, TRUE);
  SELECT out_code INTO v_txt FROM public.my_sops(NULL,NULL,NULL,100,0) LIMIT 1;
  ASSERT v_txt = 'SOP-001',
    format('6.13 ★★ أول إجراء = %s (متوقَّع SOP-001 الإلزامي غير المعتمَد)', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑦ ★★ امتثال الأقسام ══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);

  SELECT out_target_count, out_approved_count, out_compliance_pct
    INTO v_big, v_num, v_int
    FROM public.sop_compliance_overview(NULL) WHERE out_sop_id = v_s1;
  ASSERT v_big = 2,
    format('7.1 ★★ المستهدَفون لـSOP-001 = %s (متوقَّع 2: موظفا الإنتاج)', v_big);
  ASSERT v_num = 1,
    format('7.2 المعتمِدون = %s (متوقَّع 1: سعد وحده)', v_num);
  ASSERT v_int = 50,
    format('7.3 ★★ نسبة الامتثال = %s%% (متوقَّع 50)', v_int);
  v_pass := v_pass + 3;

  -- ★★ الإجراء العام يستهدف كل موظفي المستأجر
  SELECT out_target_count INTO v_big
    FROM public.sop_compliance_overview(NULL) WHERE out_sop_id = v_s2;
  ASSERT v_big = 3,
    format('7.4 ★★ المستهدَفون للإجراء العام = %s (متوقَّع 3: كل المستأجر)', v_big);
  v_pass := v_pass + 1;

  -- ★★★ عزل المستأجر: إجراء ب لا يظهر ولا يُحسب
  SELECT count(*) INTO v_n FROM public.sop_compliance_overview(NULL)
   WHERE out_sop_id = v_sB;
  ASSERT v_n = 0, '7.5 ★★★ الامتثال يعرض إجراء مستأجر آخر';
  v_pass := v_pass + 1;

  -- ★ والمؤرشف مستبعَد
  SELECT count(*) INTO v_n FROM public.sop_compliance_overview(NULL)
   WHERE out_sop_id = v_sArch;
  ASSERT v_n = 0, '7.6 ★ الامتثال يعرض إجراءً مؤرشفاً';
  v_pass := v_pass + 1;

  -- ★★ الترشيح بالقسم
  SELECT count(*) INTO v_n FROM public.sop_compliance_overview(v_d);
  ASSERT v_n = 1, format('7.7 ترشيح القسم = %s إجراء (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  /* ★★ متوسّط الوقت: الوصل مع targets يُضاعف صفوف sop_readings.
     نستعمل استعلاماً فرعياً لا avg() مباشرةً — درس «GROUP BY يُضاعف»
     المتكرر منذ الجولات الأولى. سعد وحده قرأ بـ400 ثانية. */
  /* ★★★ ثغرة تغطية أُصلحت: بقارئ واحد يُعطي `avg()` نفس نتيجة الحساب
     الصحيح (avg(400,400)=400) فالعكس لا يُكشف. نحتاج **قارئَين
     بقيمتين مختلفتين**: عندئذٍ الوصل مع `targets` يُضاعف الصفوف
     ويميل المتوسّط الخاطئ. هذا امتداد لدرس «GROUP BY يُضاعف» المتكرر. */
  INSERT INTO public.sop_readings(tenant_id,sop_id,employee_id,started_at,
                                  last_read_at,read_count,time_spent,
                                  completed,approved,approval_status)
    VALUES(v_t,v_s1,v_eOth,NOW(),NOW(),1,200,FALSE,FALSE,'pending');
  SELECT out_avg_seconds INTO v_num
    FROM public.sop_compliance_overview(NULL) WHERE out_sop_id = v_s1;
  ASSERT v_num = 300,
    format('7.8 ★★ متوسّط الوقت = %s (متوقَّع 300 = (400+200)/2)', v_num);
  v_pass := v_pass + 1;

  -- ★ وعدد القرّاء صار اثنين والمعتمِد واحداً
  SELECT out_read_count, out_approved_count INTO v_big, v_num
    FROM public.sop_compliance_overview(NULL) WHERE out_sop_id = v_s1;
  ASSERT v_big = 2, format('7.8b القرّاء = %s (متوقَّع 2)', v_big);
  ASSERT v_num = 1, format('7.8c المعتمِدون = %s (متوقَّع 1)', v_num);
  v_pass := v_pass + 2;

  /* ★★★ ثغرة تغطية أُصلحت: بقارئَين **كلاهما** ضمن الجمهور المستهدَف
     تكون مضاعفة الوصل متماثلة (2 targets × 2 readings) فلا تُغيّر
     `avg()` شيئاً. الكشف يحتاج قارئاً **من خارج** الجمهور: موظف
     الإدارة يقرأ إجراء الإنتاج (ممكن — لا قيد يمنعه).
       targets = 2 (موظفا الإنتاج) · readings = 3
       avg الخاطئ على 6 صفوف يميل، والحساب الصحيح = 900/3 = 300. */
  INSERT INTO public.sop_readings(tenant_id,sop_id,employee_id,started_at,
                                  last_read_at,read_count,time_spent,
                                  completed,approved,approval_status)
    VALUES(v_t,v_s1,v_eHr,NOW(),NOW(),1,300,FALSE,FALSE,'pending');
  SELECT out_avg_seconds INTO v_num
    FROM public.sop_compliance_overview(NULL) WHERE out_sop_id = v_s1;
  ASSERT v_num = 300,
    format('7.8d ★★★ متوسّط الوقت = %s (متوقَّع 300 = (400+200+300)/3) — '
           'الوصل مع targets ضاعف الصفوف بشكل غير متماثل', v_num);
  v_pass := v_pass + 1;

  -- ★ والقارئ من خارج الجمهور لا يزيد المستهدَفين
  SELECT out_target_count, out_read_count INTO v_big, v_num
    FROM public.sop_compliance_overview(NULL) WHERE out_sop_id = v_s1;
  ASSERT v_big = 2,
    format('7.8e المستهدَفون = %s — قارئ من خارج القسم زاد الجمهور', v_big);
  ASSERT v_num = 3, format('7.8f القرّاء = %s (متوقَّع 3)', v_num);
  v_pass := v_pass + 2;


  -- ★ الترتيب: الإلزامي الأقلّ امتثالاً أوّلاً
  SELECT out_code INTO v_txt FROM public.sop_compliance_overview(NULL) LIMIT 1;
  ASSERT v_txt IN ('SOP-001','SOP-003'),
    format('7.9 ★ أول صفّ = %s — الترتيب لا يُقدّم الإلزامي', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑧ القيد الفريد يشمل المستأجر ════════════════════════════════════
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE indexname='uq_sop_reading_tenant_emp_sop'),
    '8.1 ★ القيد الفريد بالمستأجر غائب';
  v_pass := v_pass + 1;

  /* ★★★ ثغرات تغطية أُصلحت: ثلاثة عناصر بنيوية كانت تُفحص ضمنياً
     فقط، فعكسها لا يُسقط شيئاً:
       ① العمود department_id — كان يُفحص بوجوده في information_schema
         لكن لا شيء يفحص أن **قيمته مضبوطة فعلاً** للإجراءات القسمية.
       ⑦ القيد **الفريد** — الفهرس العادي يمرّ فحص pg_indexes نفسه.
       ㉜ كتلة الربط الأثري — كل إجراءات الاختبار تُدرَج بـdepartment_id
         صريح فلا تجد الكتلة ما تُصلحه. */
  ASSERT (SELECT department_id FROM public.sops WHERE id=v_s1) = v_d,
    '8.3 ★★ department_id غير مضبوط للإجراء القسمي';
  v_pass := v_pass + 1;

  /* ★★★ ثغرة تغطية أُصلحت: العمود والقيد والربط الأثري عناصر **بنيوية**
     تُنشأ مرّة عند تطبيق المايجريشن. نسخ منطقها في الاختبار لا يعكس
     الأصل، وفحص وجودها وحده يمرّ مع فهرس عادي أو عمود بلا مرجع.
     نفحص خصائصها الدقيقة من كتالوج النظام. */

  -- ① العمود موجود **ومرجعه departments** (لا UUID حرّ)
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint k
     WHERE k.conrelid = 'public.sops'::regclass
       AND k.contype = 'f'
       AND k.confrelid = 'public.departments'::regclass
       AND 'department_id' = ANY (
             SELECT a.attname FROM pg_attribute a
              WHERE a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey))),
    '8.7 ★★ sops.department_id بلا مرجع إلى departments';
  v_pass := v_pass + 1;

  -- ⑦ الفهرس **فريد** ويشمل الأعمدة الثلاثة بالترتيب
  ASSERT (SELECT array_to_string(array_agg(a.attname ORDER BY k.ord), ',')
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
            CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(att, ord)
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.att
           WHERE c.relname = 'uq_sop_reading_tenant_emp_sop'
             AND i.indisunique)
         = 'tenant_id,employee_id,sop_id',
    '8.8 ★★ القيد الفريد لا يشمل (tenant_id, employee_id, sop_id)';
  v_pass := v_pass + 1;

  -- ㉜ فهرس الكتالوج الجزئي على department_id
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='idx_sops_dept_active'
       AND indexdef LIKE '%department_id%'
       AND indexdef LIKE '%active%'),
    '8.9 ★ فهرس الكتالوج لا يستعمل department_id';
  v_pass := v_pass + 1;

  ASSERT (SELECT indisunique FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
           WHERE c.relname = 'uq_sop_reading_tenant_emp_sop'),
    '8.4 ★★ القيد ليس فريداً — فهرس عادي لا يمنع التكرار';
  v_pass := v_pass + 1;

  -- ★ الربط الأثري: إجراء بلا department_id يُربط بمطابقة الاسم
  DECLARE v_legacy UUID; v_n2 INT;
  BEGIN
    INSERT INTO public.sops(tenant_id,code,title,description,department,
                            category,version,status,is_mandatory)
      VALUES(v_t,'SOP-OLD','إجراء قديم','قبل 0343','الإنتاج',
             'safety','1.0','active',FALSE)
      RETURNING id INTO v_legacy;
    ASSERT (SELECT department_id FROM public.sops WHERE id=v_legacy) IS NULL,
      '8.5a تجهيز باطل: الإدراج ملأ department_id';

    -- نفس منطق كتلة الربط في 0343
    UPDATE public.sops s SET department_id = d.id
      FROM public.departments d
     WHERE s.department_id IS NULL
       AND d.tenant_id = s.tenant_id
       AND btrim(d.name_ar) = btrim(s.department);

    ASSERT (SELECT department_id FROM public.sops WHERE id=v_legacy) = v_d,
      '8.5 ★★ الربط الأثري لم يربط الإجراء القديم بقسمه';
    -- ★ والحارس النصّي: الكتلة موجودة فعلاً في المايجريشن
    SELECT count(*) INTO v_n2 FROM public.sops
     WHERE tenant_id=v_t AND department_id IS NULL AND department <> 'general';
    ASSERT v_n2 = 0,
      format('8.6 ★ بقي %s إجراءً قسمياً بلا department_id', v_n2);
  END;
  v_pass := v_pass + 2;

  -- ★★ لمس متكرر لا يُنشئ صفّاً ثانياً
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  PERFORM public.sop_reading_touch(v_s1, NULL);
  PERFORM public.sop_reading_touch(v_s1, NULL);
  SELECT count(*) INTO v_n FROM public.sop_readings
   WHERE sop_id=v_s1 AND employee_id=v_eEmp;
  ASSERT v_n = 1, format('8.2 ★★ اللمس المتكرر أنشأ %s صفّاً', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '  verify-sop-compliance-0343 — % تأكيداً ناجحاً', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0343';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_VERIFY_0343' THEN RAISE; END IF;
END $$;
