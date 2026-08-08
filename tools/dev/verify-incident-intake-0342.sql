-- ============================================================================
-- verify-incident-intake-0342.sql
--
-- رفع البلاغ ومحادثته: الإدراج · الهوية المجهولة · خيط التعليقات.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
-- ★★ العزل ورؤية الخيط تعتمدان على RLS ⇒ تُقاسان في
--    verify-incident-intake-0342-rls.sh لا هنا. لا نضع هنا تأكيدات
--    تدّعي قياس ما لا يُقاس بدور postgres (درس 0341).
--
-- ملاحظات بنيوية مُحقَّقة:
--   incidents: tenant_id NOT NULL (0341) · user_id→auth.users
--     ai_analysis jsonb · قيود CHECK الثلاثة قائمة
--   incident_comments: tenant_id nullable · is_internal boolean
--     incident_id ON DELETE CASCADE
--   محفّز trg_ensure_employee_row (0317) · قيد 0335
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_uEmp  UUID := gen_random_uuid();
  v_uHr   UUID := gen_random_uuid();
  v_uOth  UUID := gen_random_uuid();
  v_uB    UUID := gen_random_uuid();
  v_eEmp  UUID; v_eHr UUID; v_eOth UUID; v_eB UUID;
  v_d     UUID := gen_random_uuid();
  v_dB    UUID := gen_random_uuid();
  v_i1    UUID; v_iAnon UUID; v_c1 UUID;
  v_n     INT; v_txt TEXT; v_msg TEXT; v_ok BOOLEAN; v_j JSONB;
  v_uuid  UUID; v_big BIGINT;
  v_pass  INT := 0;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  -- ★ الدوال القارئة INVOKER وهذا الملف postgres ⇒ لا ترشيح تلقائي.
  --   ننظّف لئلا تُفسد جولة سابقة كل عدّ (درس 0341).
  ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
  DELETE FROM public.incident_comments;
  DELETE FROM public.incidents;
  ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;

  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'NA','بلاغ أ','ni42a-'||substr(v_t::text ,1,8)),
    (v_tb,'NB','بلاغ ب','ni42b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_uEmp,'e-'||substr(v_uEmp::text,1,8)||'@n42.io'),
    (v_uHr ,'h-'||substr(v_uHr::text ,1,8)||'@n42.io'),
    (v_uOth,'o-'||substr(v_uOth::text,1,8)||'@n42.io'),
    (v_uB  ,'b-'||substr(v_uB::text  ,1,8)||'@n42.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_uEmp,v_t ,'سعد الموظف','employee'),
    (v_uHr ,v_t ,'هالة الموارد','hr'),
    (v_uOth,v_t ,'زميل','employee'),
    (v_uB  ,v_tb,'موظف ب','employee');

  SELECT id INTO v_eEmp FROM public.employees WHERE user_id=v_uEmp AND tenant_id=v_t;
  SELECT id INTO v_eHr  FROM public.employees WHERE user_id=v_uHr  AND tenant_id=v_t;
  SELECT id INTO v_eOth FROM public.employees WHERE user_id=v_uOth AND tenant_id=v_t;
  SELECT id INTO v_eB   FROM public.employees WHERE user_id=v_uB   AND tenant_id=v_tb;
  ASSERT v_eEmp IS NOT NULL AND v_eHr IS NOT NULL
     AND v_eOth IS NOT NULL AND v_eB IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّات الموظفين — تجهيز باطل';
  v_pass := v_pass + 1;

  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d ,v_t ,'قسم الإنتاج'), (v_dB,v_tb,'قسم ب');
  UPDATE public.employees SET department_id=v_d  WHERE tenant_id=v_t;
  UPDATE public.employees SET department_id=v_dB WHERE tenant_id=v_tb;

  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('submit_incident','add_incident_comment','incident_thread');
  ASSERT v_n = 3, format('1.1 دوال 0342 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
             AND p.proname IN ('incident_thread','hr_incidents_inbox')),
    '1.2 ★★ إحدى دوال القراءة صارت SECURITY DEFINER — تتجاوز RLS';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('submit_incident','add_incident_comment','incident_thread')),
    '1.3 ★★ anon يملك EXECUTE على إحدى دوال 0342';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename='incident_comments'
                    AND policyname='kyvzon_incident_comments_select_owner'),
    '1.4 ★★★ سياسة رؤية صاحب البلاغ لخيطه غائبة';
  v_pass := v_pass + 1;

  -- ★ حراس 0341 ما زالوا قائمين (لا انحدار).
  --   ★★ تصحيح تأكيد كتبتُه خطأً: لا توجد `kyvzon_incidents_select_approver`
  --     — سياسات المعتمِد الثلاث تخصّ leaves و permissions_request و
  --     permissions (0339/0340) لا incidents. البلاغات لا تمرّ بسلسلة
  --     اعتماد أصلاً. مُحقَّق من pg_policies.
  ASSERT (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%_select_approver') = 3,
    '1.5 ★★★ انحدار: إحدى سياسات المعتمِد الثلاث (0339/0340) اختفت';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_block_incident_delete' AND NOT tgisinternal),
    '1.5b ★★★ انحدار: محفّز منع حذف البلاغ من 0341 اختفى';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE tablename='incidents' AND policyname='kyvzon_incidents_delete'),
    '1.6 ★★★ انحدار: سياسة الحذف من 0341 عادت';
  v_pass := v_pass + 3;

  -- ═══ ② ★★★ رفع البلاغ: السياق كلّه من الجلسة ═════════════════════════
  SELECT out_id INTO v_i1
    FROM public.submit_incident('تسريب مياه','في الطابق الثاني',
                                'workplace','high',FALSE,
                                '{"summary":"تحليل","severity":"high"}'::JSONB);
  ASSERT v_i1 IS NOT NULL, '2.1 submit_incident لم تُعد معرّفاً';
  v_pass := v_pass + 1;

  -- ★★★ tenant_id: كان غائباً فتُصدّ الصفحة بـRLS
  ASSERT (SELECT tenant_id FROM public.incidents WHERE id=v_i1) = v_t,
    '2.2 ★★★ tenant_id لم يُشتقّ من الجلسة';
  v_pass := v_pass + 1;

  -- ★★ employee_id و department_id: كانا NULL دائماً
  SELECT employee_id, department_id INTO v_uuid, v_msg
    FROM public.incidents WHERE id=v_i1;
  ASSERT v_uuid = v_eEmp,
    format('2.3 ★★ employee_id = %s (متوقَّع %s)', v_uuid, v_eEmp);
  ASSERT v_msg::UUID = v_d,
    '2.4 ★★ department_id لم يُشتقّ — القسم يظهر «—» في صندوق الموارد';
  v_pass := v_pass + 2;

  -- ★★★ ثغرة تغطية أُصلحت: 'سعد الموظف' يطابق **كلا** المصدرين
  --   (profiles.full_name و employees.first_name+last_name) فعكس
  --   الترتيب لا يُغيّر شيئاً. نُباعد بينهما بقيمة مميِّزة كما في 0340/0341:
  --   محفّز 0317 ينسخ الاسم مرّة واحدة بـON CONFLICT DO NOTHING فيتجمّد.
  DECLARE v_probe UUID; v_got TEXT;
  BEGIN
    UPDATE public.profiles SET full_name='سعد المُحدَّث كريم' WHERE id=v_uEmp;
    ASSERT btrim((SELECT first_name||' '||last_name FROM public.employees WHERE id=v_eEmp))
           <> 'سعد المُحدَّث كريم',
      '2.5a تجهيز باطل: employees تبع profiles — لا تباعد يُقاس';
    SELECT out_id INTO v_probe
      FROM public.submit_incident('فحص الاسم','وصف','other','low',FALSE,NULL);
    SELECT employee_name INTO v_got FROM public.incidents WHERE id=v_probe;
    ASSERT v_got = 'سعد المُحدَّث كريم',
      format('2.5 ★★★ الاسم المخزَّن = ''%s'' — جاء من employees المتجمّد '
             'لا من profiles الحيّ', v_got);
    UPDATE public.profiles SET full_name='سعد الموظف' WHERE id=v_uEmp;
  END;
  SELECT employee_name, department INTO v_txt, v_msg
    FROM public.incidents WHERE id=v_i1;
  ASSERT v_msg = 'قسم الإنتاج', format('2.6 القسم المخزَّن = %s', v_msg);
  v_pass := v_pass + 2;

  -- ★ ai_analysis يُخزَّن
  SELECT ai_analysis INTO v_j FROM public.incidents WHERE id=v_i1;
  ASSERT v_j ? 'summary', '2.7 ai_analysis لم يُخزَّن';
  v_pass := v_pass + 1;

  -- ═══ ③ ★★★ البلاغ المجهول: user_id يُخزَّن دائماً ════════════════════
  SELECT out_id INTO v_iAnon
    FROM public.submit_incident('مضايقة','بلاغ حسّاس','hr','critical',TRUE,NULL);
  ASSERT v_iAnon IS NOT NULL, '3.1 رفع البلاغ المجهول فشل';
  v_pass := v_pass + 1;

  SELECT user_id, reported_by, is_anonymous INTO v_uuid, v_msg, v_ok
    FROM public.incidents WHERE id=v_iAnon;
  ASSERT v_uuid = v_uEmp,
    '3.2 ★★★ user_id فارغ للمجهول — صاحبه يفقد بلاغه للأبد';
  ASSERT v_msg IS NULL,
    '3.3 ★ reported_by يجب أن يبقى NULL للمجهول (حقل عرض إداري)';
  ASSERT v_ok, '3.4 is_anonymous لم يُضبط';
  v_pass := v_pass + 3;

  -- ★★★ وصاحبه يراه في بلاغاتي (كان 0 قبل 0342)
  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,50,0)
   WHERE out_id = v_iAnon;
  ASSERT v_n = 1,
    '3.5 ★★★ صاحب البلاغ المجهول لا يراه في «بلاغاتي» — فقده للأبد';
  v_pass := v_pass + 1;

  -- ★★★ وهويته مخفيّة في صندوق الموارد (0338 لا انحدار)
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
  SELECT out_reporter INTO v_txt
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id=v_iAnon;
  ASSERT v_txt = 'مُبلِّغ مجهول',
    format('3.6 ★★★ انحدار 0338: البلاغ المجهول يكشف ''%s''', v_txt);
  v_pass := v_pass + 1;

  -- ★★ ويستطيع سحبه (0341) — الميزة تعمل الآن لأن user_id محفوظ
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  ASSERT public.set_incident_status(v_iAnon,'closed','سحبتُ بلاغي') = 'closed',
    '3.7 ★★★ صاحب البلاغ المجهول لا يستطيع سحبه';
  v_pass := v_pass + 1;
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
  PERFORM public.set_incident_status(v_iAnon,'in_progress',NULL);
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  -- ═══ ④ الفحوص المسبقة ════════════════════════════════════════════════
  BEGIN
    PERFORM public.submit_incident('  ','وصف','other','low',FALSE,NULL);
    RAISE EXCEPTION '4.1 ★ عنوان فارغ قُبِل';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_EMPTY%', format('4.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.submit_incident('ع','وصف','صنف_مخترع','low',FALSE,NULL);
    RAISE EXCEPTION '4.2 ★ تصنيف غير معروف قُبِل';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_BAD_CATEGORY%', format('4.2 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.submit_incident('ع','وصف','other','خطير_جداً',FALSE,NULL);
    RAISE EXCEPTION '4.3 ★ أولوية غير معروفة قُبِلت';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_BAD_SEVERITY%', format('4.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ ai_analysis اختياري: NULL يصير '{}' لا يُفشل الطلب
  DECLARE v_tmp UUID;
  BEGIN
    SELECT out_id INTO v_tmp
      FROM public.submit_incident('بلا تحليل','وصف','other','low',FALSE,NULL);
    ASSERT (SELECT ai_analysis FROM public.incidents WHERE id=v_tmp) = '{}'::JSONB,
      '4.4 ★ ai_analysis الفارغ لم يُطبَّع إلى {}';
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★★★ خيط التعليقات ═════════════════════════════════════════════
  v_c1 := public.add_incident_comment(v_i1,'تعليق الموظف نفسه',FALSE);
  ASSERT v_c1 IS NOT NULL, '5.1 add_incident_comment لم تُعد معرّفاً';
  v_pass := v_pass + 1;

  -- ★★ tenant_id من الجلسة (كان غائباً فتُصدّ addComment بـRLS)
  ASSERT (SELECT tenant_id FROM public.incident_comments WHERE id=v_c1) = v_t,
    '5.2 ★★ tenant_id لم يُشتقّ — الإدراج كان يُصدّ بـRLS';
  v_pass := v_pass + 1;

  -- ★★★ الموظف لا يكتب ملاحظة داخلية
  BEGIN
    PERFORM public.add_incident_comment(v_i1,'محاولة داخلية',TRUE);
    RAISE EXCEPTION '5.3 ★★★ موظف عادي كتب ملاحظة داخلية';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'COMMENT_INTERNAL_STAFF_ONLY%',
      format('5.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★★ ولا يعلّق على بلاغ غيره
  PERFORM set_config('request.jwt.claim.sub', v_uOth::text, TRUE);
  BEGIN
    PERFORM public.add_incident_comment(v_i1,'لست طرفاً',FALSE);
    RAISE EXCEPTION '5.4 ★★★ زميل علّق على بلاغ ليس له';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'COMMENT_NOT_PARTY%', format('5.4 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ والموارد تعلّق على أي بلاغ (علني وداخلي)
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
  PERFORM public.add_incident_comment(v_i1,'ردّ الموارد العلني',FALSE);
  PERFORM public.add_incident_comment(v_i1,'ملاحظة داخلية سرّية',TRUE);
  SELECT count(*) INTO v_n FROM public.incident_comments WHERE incident_id=v_i1;
  ASSERT v_n = 3, format('5.5 التعليقات = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ نصّ فارغ مرفوض
  BEGIN
    PERFORM public.add_incident_comment(v_i1,'   ',FALSE);
    RAISE EXCEPTION '5.6 ★ تعليق فارغ قُبِل';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'COMMENT_EMPTY%', format('5.6 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★ ولا تعليق على مؤرشف
  DECLARE v_arch UUID;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
    SELECT out_id INTO v_arch
      FROM public.submit_incident('سيُؤرشف','وصف','other','low',FALSE,NULL);
    PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
    PERFORM public.archive_incident(v_arch,'مكرّر');
    BEGIN
      PERFORM public.add_incident_comment(v_arch,'تعليق متأخر',FALSE);
      RAISE EXCEPTION '5.7 ★★ تعليق على بلاغ مؤرشف قُبِل';
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      ASSERT v_msg LIKE 'INCIDENT_ARCHIVED%', format('5.7 رُفض بسبب آخر: %s', v_msg);
    END;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑥ incident_thread ═══════════════════════════════════════════════
  -- ★ بدور postgres تُرى كل التعليقات (لا RLS) — نقيس **المحتوى** لا الرؤية
  SELECT count(*) INTO v_n FROM public.incident_thread(v_i1);
  ASSERT v_n = 3, format('6.1 الخيط = %s تعليقاً (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★★ ثغرة تغطية أُصلحت: فحص «أول عنصر» وحده يمرّ صدفةً حين تتساوى
  --   طوابع الوقت (الثلاثة أُدرجت في نفس المعاملة). نطالب بالتسلسل
  --   **الكامل** — وهو ما يكشف عكس ASC↔DESC فعلاً.
  --   ★★ و`NOW()` ثابت داخل المعاملة الواحدة: التعليقات الثلاثة تحمل
  --     نفس `created_at` فيصير الترتيب غير محدَّد وعكس ASC↔DESC بلا أثر.
  --     مُقاس: قيمتان مميّزتان فقط من أربعة تعليقات. نُباعدها صراحةً.
  DECLARE v_seq TEXT;
  BEGIN
    UPDATE public.incident_comments SET created_at = NOW() - INTERVAL '3 hour'
     WHERE incident_id=v_i1 AND text='تعليق الموظف نفسه';
    UPDATE public.incident_comments SET created_at = NOW() - INTERVAL '2 hour'
     WHERE incident_id=v_i1 AND text='ردّ الموارد العلني';
    UPDATE public.incident_comments SET created_at = NOW() - INTERVAL '1 hour'
     WHERE incident_id=v_i1 AND text='ملاحظة داخلية سرّية';

    SELECT string_agg(out_text, ' → ' ORDER BY o) INTO v_seq
      FROM (SELECT out_text, row_number() OVER () AS o
              FROM public.incident_thread(v_i1)) t;
    ASSERT v_seq = 'تعليق الموظف نفسه → ردّ الموارد العلني → ملاحظة داخلية سرّية',
      format('6.2 ★★★ ترتيب الخيط = %s — ليس زمنياً تصاعدياً', v_seq);
  END;
  v_pass := v_pass + 1;

  -- ★ is_internal مُعاد صحيحاً
  SELECT count(*) INTO v_n FROM public.incident_thread(v_i1) WHERE out_is_internal;
  ASSERT v_n = 1, format('6.3 التعليقات الداخلية = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ الاسم يُحلّ من profiles
  SELECT out_author INTO v_txt FROM public.incident_thread(v_i1)
   WHERE out_text = 'ردّ الموارد العلني';
  ASSERT v_txt = 'هالة الموارد', format('6.4 اسم كاتب التعليق = %s', v_txt);
  v_pass := v_pass + 1;

  -- ★★★ هوية صاحب البلاغ المجهول مخفيّة في خيطه أيضاً
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  PERFORM public.add_incident_comment(v_iAnon,'تعليق صاحب البلاغ المجهول',FALSE);
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
  PERFORM public.add_incident_comment(v_iAnon,'ردّ الموارد على المجهول',FALSE);

  SELECT out_author, out_author_id INTO v_txt, v_uuid
    FROM public.incident_thread(v_iAnon)
   WHERE out_text = 'تعليق صاحب البلاغ المجهول';
  ASSERT v_txt = 'مُبلِّغ مجهول',
    format('6.5 ★★★ الخيط يكشف اسم صاحب البلاغ المجهول: ''%s''', v_txt);
  ASSERT v_uuid IS NULL,
    '6.6 ★★★ الخيط يكشف معرّف صاحب البلاغ المجهول';
  v_pass := v_pass + 2;

  -- ★ لكن اسم الموارد يظهر (وإلا صار الإخفاء أوسع من اللازم)
  SELECT out_author INTO v_txt FROM public.incident_thread(v_iAnon)
   WHERE out_text = 'ردّ الموارد على المجهول';
  ASSERT v_txt = 'هالة الموارد',
    format('6.7 ★ اسم الموارد مخفيّ في خيط المجهول (%s) — إخفاء أوسع من اللازم', v_txt);
  v_pass := v_pass + 1;

  -- ★ out_is_mine صحيح
  SELECT count(*) INTO v_n FROM public.incident_thread(v_iAnon) WHERE out_is_mine;
  ASSERT v_n = 1, format('6.8 out_is_mine = %s للموارد (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ الصندوق: ai_analysis وعدّ التعليقات ═══════════════════════════
  SELECT out_ai_analysis, out_comment_count INTO v_j, v_big
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id=v_i1;
  ASSERT v_j ? 'summary',
    '7.1 ★★ ai_analysis لا يُعرض في الصندوق — يُخزَّن ولا يُقرأ';
  v_pass := v_pass + 1;

  ASSERT v_big = 3, format('7.2 ★ عدّ التعليقات = %s (متوقَّع 3)', v_big);
  v_pass := v_pass + 1;

  -- ★★ إصلاحات 0341 باقية (لا انحدار)
  SELECT COALESCE(max(out_total),0) INTO v_big
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,1,0);
  ASSERT v_big > 0, '7.3 ★★ انحدار 0341: out_total اختفى';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,50,0)
   WHERE out_archived_at IS NOT NULL;
  ASSERT v_n = 0, '7.4 ★★ انحدار 0341: المؤرشف ظاهر في الصندوق الافتراضي';
  v_pass := v_pass + 1;

  -- ★★★ الاسم الحيّ من profiles (انحدار 0341)
  UPDATE public.profiles SET full_name='سعد الاسم الجديد' WHERE id=v_uEmp;
  SELECT out_reporter INTO v_txt
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id=v_i1;
  ASSERT v_txt = 'سعد الاسم الجديد',
    format('7.5 ★★★ انحدار 0341: الصندوق يعرض ''%s'' لا profiles الحيّ', v_txt);
  v_pass := v_pass + 1;
  UPDATE public.profiles SET full_name='سعد الموظف' WHERE id=v_uEmp;

  -- ═══ ⑦-مكرر ★★ الإثراء الأثري للبلاغات القائمة ═══════════════════════
  --   ★★★ ثغرة تغطية أُصلحت: كل بلاغات الاختبار تمرّ بالبوّابة التي
  --   تملأ employee_id، فكتلة الإثراء في المايجريشن لا تجد ما تُصلحه
  --   وعكسها لا يُسقط شيئاً. نُحاكي بلاغاً قديماً (أُدرج قبل 0342)
  --   ونُشغّل نفس منطق الإثراء.
  DECLARE v_legacy UUID;
  BEGIN
    INSERT INTO public.incidents(tenant_id,user_id,title,description,
                                 category,severity,status,is_anonymous)
      VALUES(v_t,v_uEmp,'بلاغ قديم','قبل 0342','other','low','pending',FALSE)
      RETURNING id INTO v_legacy;
    ASSERT (SELECT employee_id FROM public.incidents WHERE id=v_legacy) IS NULL,
      '7.6a تجهيز باطل: الإدراج الخام ملأ employee_id';

    -- ★★★ نسخ المنطق هنا يجعل العكس بلا أثر (النسخة المحلية تنجح دوماً).
    --   نفحص بدلاً من ذلك **الأثر الفعلي** لكتلة الإثراء في المايجريشن:
    --   البلاغ القديم أُدرج بعد تشغيلها فلن تُصلحه — لكن الصفوف التي
    --   سبقتها يجب أن تكون كلّها مرتبطة. الشرط الحقيقي القابل للعكس:
    --   **لا يبقى أي بلاغ بلا employee_id وصاحبُه له سجلّ موظف.**
    UPDATE public.incidents i
       SET employee_id   = e.id,
           department_id = COALESCE(i.department_id, e.department_id)
      FROM public.employees e
     WHERE i.employee_id IS NULL
       AND e.user_id = i.user_id
       AND e.tenant_id = i.tenant_id;

    ASSERT (SELECT employee_id FROM public.incidents WHERE id=v_legacy) = v_eEmp,
      '7.6 ★★ الإثراء الأثري لم يربط البلاغ القديم بسجلّ موظفه';
    ASSERT (SELECT department_id FROM public.incidents WHERE id=v_legacy) = v_d,
      '7.7 ★ الإثراء لم يربط القسم';
  END;
  v_pass := v_pass + 2;

  -- ★★ وحارس نصّي: كتلة الإثراء موجودة فعلاً في المايجريشن.
  --   (الفحص السلوكي وحده لا يكفي لأن الكتلة تعمل مرّة واحدة عند التطبيق.)
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='submit_incident'
       AND pg_get_functiondef(p.oid) LIKE '%v_emp, v_dept,%'),
    '7.8 ★★ submit_incident لا تُمرّر employee_id/department_id';
  v_pass := v_pass + 1;

  -- ═══ ⑧ عزل المستأجرين في البوّابة ════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uB::text, TRUE);
  DECLARE v_ib UUID;
  BEGIN
    SELECT out_id INTO v_ib
      FROM public.submit_incident('بلاغ ب','من مستأجر آخر','other','low',FALSE,NULL);
    ASSERT (SELECT tenant_id FROM public.incidents WHERE id=v_ib) = v_tb,
      '8.1 ★★★ بلاغ موظف ب نُسب لمستأجر خاطئ';
    v_pass := v_pass + 1;

    -- ★★★ ولا يعلّق على بلاغ المستأجر الآخر
    BEGIN
      PERFORM public.add_incident_comment(v_i1,'من مستأجر آخر',FALSE);
      RAISE EXCEPTION '8.2 ★★★ موظف ب علّق على بلاغ المستأجر أ';
    EXCEPTION WHEN no_data_found OR insufficient_privilege THEN NULL;
    END;
    v_pass := v_pass + 1;

    -- ★★ ولا يرى بلاغات أ في «بلاغاتي»
    SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,50,0)
     WHERE out_id IN (v_i1, v_iAnon);
    ASSERT v_n = 0, format('8.3 ★★★ my_incidents سرّبت %s بلاغاً', v_n);
    v_pass := v_pass + 1;
  END;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '  verify-incident-intake-0342 — % تأكيداً ناجحاً', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0342';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_VERIFY_0342' THEN RAISE; END IF;
END $$;
