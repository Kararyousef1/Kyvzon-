-- ============================================================================
-- verify-incident-lifecycle-0341.sql
--
-- دورة حياة البلاغ: الحالة · الأرشفة · الترقيم · الاسم الحيّ · الإسناد.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال والمحفّزات**.
-- العزل عبر RLS الحقيقي في verify-incident-lifecycle-0341-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة (من information_schema/pg_constraint لا من الذاكرة):
--   incidents: title varchar(300) · category/severity/status varchar محدودة
--     ★ القيود الثلاثة **موجودة** (status·severity·category) — صحّحتُ
--       ادّعاءً أوّلياً بأنها غائبة
--     employee_name·department نصّان مكرّران · user_id→auth.users
--     assigned_to→employees · reported_by→profiles · department_id→departments
--   incident_comments.incident_id **ON DELETE CASCADE**
--   corrective_actions.incident_id ON DELETE SET NULL
--   ★ الدوال INVOKER تحترم RLS ⇒ بدور postgres تُرى كل الصفوف
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_uHr   UUID := gen_random_uuid();
  v_uEmp  UUID := gen_random_uuid();
  v_uOth  UUID := gen_random_uuid();
  v_uB    UUID := gen_random_uuid();
  v_eHr   UUID; v_eEmp UUID; v_eOth UUID; v_eB UUID;
  v_d     UUID := gen_random_uuid();
  v_dB    UUID := gen_random_uuid();
  v_i1    UUID; v_i2 UUID; v_i3 UUID; v_iB UUID;
  v_n     INT; v_txt TEXT; v_st TEXT; v_num NUMERIC; v_big BIGINT;
  v_ok    BOOLEAN; v_msg TEXT; v_ts TIMESTAMPTZ;
  v_pass  INT := 0;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  -- ★★★ الدوال أُعلنت SECURITY INVOKER، وهذا الملف يعمل بدور postgres
  --   (BYPASSRLS) ⇒ لا يُرشَّح شيء بالمستأجر تلقائياً وتُرى كل الصفوف.
  --   بيانات جولات سابقة في نفس القاعدة تُفسد كل عدّ إجمالي. ننظّف أوّلاً.
  --   (في verify-…-rls.sh يحكم RLS فعلاً — وهذا فرق منهجي مقصود.)
  --   ★ ومحفّز 0341 يمنع الحذف حتى على postgres — نُعطّله للتنظيف وحده
  --     ثم نُعيده فوراً. هذا بذاته دليل أن الحارس يعمل بلا استثناء.
  ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
  DELETE FROM public.incident_comments;
  DELETE FROM public.incidents;
  ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;

  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'IA','بلاغات أ','in41a-'||substr(v_t::text ,1,8)),
    (v_tb,'IB','بلاغات ب','in41b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_uHr ,'h-'||substr(v_uHr::text ,1,8)||'@i41.io'),
    (v_uEmp,'e-'||substr(v_uEmp::text,1,8)||'@i41.io'),
    (v_uOth,'o-'||substr(v_uOth::text,1,8)||'@i41.io'),
    (v_uB  ,'b-'||substr(v_uB::text  ,1,8)||'@i41.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_uHr ,v_t ,'هالة الموارد','hr'),
    (v_uEmp,v_t ,'سعد الموظف','employee'),
    (v_uOth,v_t ,'زميل','employee'),
    (v_uB  ,v_tb,'موظف ب','employee');

  -- ★ المحفّز 0317 أنشأ السجلات — نلتقطها (0335 يمنع إدراجاً ثانياً)
  SELECT id INTO v_eHr  FROM public.employees WHERE user_id=v_uHr  AND tenant_id=v_t;
  SELECT id INTO v_eEmp FROM public.employees WHERE user_id=v_uEmp AND tenant_id=v_t;
  SELECT id INTO v_eOth FROM public.employees WHERE user_id=v_uOth AND tenant_id=v_t;
  SELECT id INTO v_eB   FROM public.employees WHERE user_id=v_uB   AND tenant_id=v_tb;
  ASSERT v_eHr IS NOT NULL AND v_eEmp IS NOT NULL
     AND v_eOth IS NOT NULL AND v_eB IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّات الموظفين — تجهيز باطل';
  v_pass := v_pass + 1;

  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d ,v_t ,'قسم الإنتاج'), (v_dB,v_tb,'قسم ب');
  UPDATE public.employees SET department_id=v_d  WHERE tenant_id=v_t;
  UPDATE public.employees SET department_id=v_dB WHERE tenant_id=v_tb;

  INSERT INTO public.incidents(tenant_id,user_id,employee_id,department_id,
                               employee_name,department,title,description,
                               category,severity,status,is_anonymous)
  VALUES
    (v_t,v_uEmp,v_eEmp,v_d,'سعد الموظف','قسم الإنتاج','تسريب مياه','الطابق الثاني','workplace','high','pending',false),
    (v_t,v_uEmp,v_eEmp,v_d,'سعد الموظف','قسم الإنتاج','مضايقة','بلاغ حسّاس','hr','critical','pending',true),
    (v_t,v_uOth,v_eOth,v_d,'زميل','قسم الإنتاج','بطء الشبكة','منذ أسبوع','technical','medium','in_progress',false);
  -- ★ لا RETURNING INTO مع إدراج متعدد الصفوف: يرفع
  --   "query returned more than one row". نلتقط المعرّفات بالعنوان.
  SELECT id INTO v_i1 FROM public.incidents WHERE tenant_id=v_t AND title='تسريب مياه';
  SELECT id INTO v_i2 FROM public.incidents WHERE tenant_id=v_t AND title='مضايقة';
  SELECT id INTO v_i3 FROM public.incidents WHERE tenant_id=v_t AND title='بطء الشبكة';

  INSERT INTO public.incidents(tenant_id,user_id,employee_id,title,description,
                               category,severity,status,is_anonymous)
  VALUES (v_tb,v_uB,v_eB,'بلاغ ب','من مستأجر آخر','other','low','pending',false)
  RETURNING id INTO v_iB;

  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('set_incident_status','archive_incident','tg_block_incident_delete');
  ASSERT v_n = 3, format('1.1 دوال 0341 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★ الدوال القارئة INVOKER: تحترم RLS
  ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
             AND p.proname IN ('hr_incidents_inbox','my_incidents','hr_incident_stats')),
    '1.2 ★★ إحدى دوال القراءة صارت SECURITY DEFINER — تتجاوز RLS';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('set_incident_status','archive_incident',
                            'hr_incidents_inbox','my_incidents','hr_incident_stats')),
    '1.3 ★★ anon يملك EXECUTE على إحدى دوال 0341';
  v_pass := v_pass + 1;

  -- ★★★ سياسة الحذف أُسقطت والمحفّز قائم
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE tablename='incidents' AND policyname='kyvzon_incidents_delete'),
    '1.4 ★★★ سياسة الحذف ما زالت قائمة';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_block_incident_delete' AND NOT tgisinternal),
    '1.5 ★★★ محفّز منع الحذف غائب';
  v_pass := v_pass + 1;

  ASSERT (SELECT is_nullable FROM information_schema.columns
           WHERE table_name='incidents' AND column_name='tenant_id') = 'NO',
    '1.6 ★★ tenant_id ما زال يقبل NULL — بلاغ يضيع من كل الصناديق';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('idx_incidents_inbox_open','idx_incidents_mine','idx_incidents_unassigned');
  ASSERT v_n = 3, format('1.7 فهارس 0341 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ القيود الثلاثة القائمة لم تُمسّ (تصحيح ادّعاء أوّلي)
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid='public.incidents'::regclass AND contype='c'
     AND conname IN ('incidents_status_check','incidents_severity_check',
                     'incidents_category_check');
  ASSERT v_n = 3, format('1.8 قيود CHECK القائمة = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② ★★★ منع الحذف النهائي ═════════════════════════════════════════
  BEGIN
    DELETE FROM public.incidents WHERE id=v_i1;
    RAISE EXCEPTION '2.1 ★★★ الحذف النهائي نجح — البلاغ دليل';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_DELETE_FORBIDDEN%',
      format('2.1 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM public.incidents WHERE id=v_i1),
    '2.2 البلاغ اختفى رغم رفض الحذف';
  v_pass := v_pass + 1;

  -- ★★ والتعليقات محفوظة (كانت تُباد بـCASCADE)
  INSERT INTO public.incident_comments(tenant_id,incident_id,user_id,text)
    VALUES(v_t,v_i1,v_uHr,'تعليق تدقيقي');
  BEGIN
    DELETE FROM public.incidents WHERE id=v_i1;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM public.incident_comments WHERE incident_id=v_i1;
  ASSERT v_n = 1, format('2.3 ★★ التعليقات = %s بعد محاولة الحذف', v_n);
  v_pass := v_pass + 1;

  -- ═══ ③ ★★★ انتقالات الحالة ═══════════════════════════════════════════
  -- staff: pending → in_progress
  v_st := public.set_incident_status(v_i1, 'in_progress', 'بدأت المعالجة');
  ASSERT v_st = 'in_progress', format('3.1 الانتقال أعطى %s', v_st);
  v_pass := v_pass + 1;

  -- ★ الملاحظة تُسجَّل في التعليقات — أثر لا يُمحى
  SELECT count(*) INTO v_n FROM public.incident_comments
   WHERE incident_id=v_i1 AND text LIKE '%بدأت المعالجة%';
  ASSERT v_n = 1, format('3.2 ★ الملاحظة لم تُسجَّل (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★★ انتقال غير مشروع: in_progress → (لا شيء خارج القائمة)
  BEGIN
    PERFORM public.set_incident_status(v_i1, 'حالة_مخترعة', NULL);
    RAISE EXCEPTION '3.3 ★ حالة غير معروفة قُبِلت';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_BAD_STATUS%', format('3.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★★ انتقال ممنوع: closed → resolved
  PERFORM public.set_incident_status(v_i1, 'closed', NULL);
  BEGIN
    PERFORM public.set_incident_status(v_i1, 'resolved', NULL);
    RAISE EXCEPTION '3.4 ★★ انتقال closed→resolved قُبِل';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_BAD_TRANSITION%',
      format('3.4 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ closed_at/closed_by مُلئا
  SELECT closed_at, closed_by INTO v_ts, v_txt FROM public.incidents WHERE id=v_i1;
  ASSERT v_ts IS NOT NULL, '3.5 ★ closed_at لم يُملأ عند الإغلاق';
  ASSERT v_txt::UUID = v_uHr, '3.6 ★ closed_by خاطئ';
  v_pass := v_pass + 2;

  -- ★★ إعادة الفتح تُفرّغهما
  PERFORM public.set_incident_status(v_i1, 'in_progress', 'إعادة فتح');
  ASSERT (SELECT closed_at FROM public.incidents WHERE id=v_i1) IS NULL,
    '3.7 ★★ closed_at باقٍ بعد إعادة الفتح — تاريخ إغلاق لبلاغ مفتوح';
  v_pass := v_pass + 1;

  -- ★ لا تغيير = ليس خطأً
  ASSERT public.set_incident_status(v_i1, 'in_progress', NULL) = 'in_progress',
    '3.8 تكرار نفس الحالة أثار خطأً';
  v_pass := v_pass + 1;

  -- ═══ ④ ★★★ صاحب البلاغ يسحبه ═════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  ASSERT NOT public.current_user_is_staff(),
    '4.0 تجهيز باطل: سعد صار staff';
  v_pass := v_pass + 1;

  -- بلاغه المعلّق → مغلق: مسموح
  v_st := public.set_incident_status(v_i2, 'closed', 'سحبتُ بلاغي');
  ASSERT v_st = 'closed', format('4.1 ★★★ صاحب البلاغ لم يستطع سحبه: %s', v_st);
  v_pass := v_pass + 1;

  -- ★★ لكن لا يفتحه ولا يحلّه
  BEGIN
    PERFORM public.set_incident_status(v_i2, 'in_progress', NULL);
    RAISE EXCEPTION '4.2 ★★★ الموظف أعاد فتح بلاغه — صلاحية موارد';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ★★★ ولا يمسّ بلاغ غيره
  BEGIN
    PERFORM public.set_incident_status(v_i3, 'closed', 'ليس لي');
    RAISE EXCEPTION '4.3 ★★★ الموظف أغلق بلاغ زميله';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_NOT_OWNER%', format('4.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★ ولا يسحب بلاغاً بدأت معالجته
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
  PERFORM public.set_incident_status(v_i2, 'in_progress', 'أعدنا الفتح');
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  BEGIN
    PERFORM public.set_incident_status(v_i2, 'closed', 'سحب متأخر');
    RAISE EXCEPTION '4.4 ★★ الموظف سحب بلاغاً قيد المعالجة';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_OWNER_LIMIT%', format('4.4 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★★★ ولا يمسّ بلاغ مستأجر آخر
  BEGIN
    PERFORM public.set_incident_status(v_iB, 'closed', 'من مستأجر آخر');
    RAISE EXCEPTION '4.5 ★★★ اختراق عبر المستأجرين في تغيير الحالة';
  EXCEPTION WHEN no_data_found OR insufficient_privilege THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑤ الأرشفة ════════════════════════════════════════════════════════
  -- ★★ الموظف لا يؤرشف
  BEGIN
    PERFORM public.archive_incident(v_i2, 'محاولة');
    RAISE EXCEPTION '5.1 ★★ موظف عادي أرشف بلاغاً';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);

  -- ★ السبب إلزامي
  BEGIN
    PERFORM public.archive_incident(v_i3, '   ');
    RAISE EXCEPTION '5.2 ★ الأرشفة قُبِلت بلا سبب';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_ARCHIVE_NEEDS_REASON%',
      format('5.2 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  ASSERT public.archive_incident(v_i3, 'مكرّر مع بلاغ آخر'),
    '5.3 الأرشفة أعادت FALSE';
  v_pass := v_pass + 1;

  SELECT archived_at, archived_by, archive_reason INTO v_ts, v_txt, v_msg
    FROM public.incidents WHERE id=v_i3;
  ASSERT v_ts IS NOT NULL AND v_txt::UUID = v_uHr AND v_msg = 'مكرّر مع بلاغ آخر',
    '5.4 حقول الأرشفة لم تُملأ صحيحةً';
  v_pass := v_pass + 1;

  -- ★ البلاغ باقٍ — لا حذف
  ASSERT EXISTS (SELECT 1 FROM public.incidents WHERE id=v_i3),
    '5.5 ★ الأرشفة صارت حذفاً';
  v_pass := v_pass + 1;

  -- ★ أرشفة ثانية تُعيد FALSE لا خطأً
  ASSERT public.archive_incident(v_i3, 'مرة أخرى') = FALSE,
    '5.6 أرشفة المؤرشف لم تُعِد FALSE';
  v_pass := v_pass + 1;

  -- ★★ والمؤرشف لا تتغيّر حالته
  BEGIN
    PERFORM public.set_incident_status(v_i3, 'resolved', NULL);
    RAISE EXCEPTION '5.7 ★★ حالة بلاغ مؤرشف تغيّرت';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE 'INCIDENT_ARCHIVED%', format('5.7 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑥ ★★★ الاسم الحيّ (نمط عطل 0340) ════════════════════════════════
  UPDATE public.profiles SET full_name='سعد الاسم الجديد' WHERE id=v_uEmp;

  -- تأكيد التباعد: العمود النصّي لم يتبع
  ASSERT (SELECT employee_name FROM public.incidents WHERE id=v_i1) = 'سعد الموظف',
    '6.0 تجهيز باطل: employee_name تبع profiles — لا تباعد يُقاس';
  v_pass := v_pass + 1;

  SELECT out_reporter INTO v_txt
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0) WHERE out_id=v_i1;
  ASSERT v_txt = 'سعد الاسم الجديد',
    format('6.1 ★★★ الصندوق يعرض ''%s'' — العمود النصّي المتجمّد لا profiles', v_txt);
  v_pass := v_pass + 1;

  -- ★★★ ثغرة تغطية أُصلحت: التجهيز جعل incidents.department النصّي
  --   مساوياً لـdepartments.name_ar، فعكس الترتيب لا يُغيّر شيئاً.
  --   نُباعد بينهما بقيمة **مميِّزة** كما فعلنا مع الاسم:
  --   نُعيد تسمية القسم في departments ونتوقّع أن يتبع العرض.
  UPDATE public.departments SET name_ar='قسم الإنتاج المُعاد تسميته' WHERE id=v_d;
  ASSERT (SELECT department FROM public.incidents WHERE id=v_i1) = 'قسم الإنتاج',
    '6.2a تجهيز باطل: العمود النصّي تبع departments — لا تباعد يُقاس';
  SELECT out_department INTO v_txt
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0) WHERE out_id=v_i1;
  ASSERT v_txt = 'قسم الإنتاج المُعاد تسميته',
    format('6.2 ★★★ القسم المعروض ''%s'' — العمود النصّي المتجمّد لا departments', v_txt);
  UPDATE public.departments SET name_ar='قسم الإنتاج' WHERE id=v_d;
  v_pass := v_pass + 2;

  -- ★★★ إخفاء الهوية من 0338 ما زال يعمل (لا انحدار)
  SELECT out_reporter, out_employee_id INTO v_txt, v_msg
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0) WHERE out_id=v_i2;
  ASSERT v_txt = 'مُبلِّغ مجهول',
    format('6.3 ★★★ انحدار 0338: البلاغ المجهول يكشف ''%s''', v_txt);
  ASSERT v_msg IS NULL,
    '6.4 ★★★ انحدار 0338: معرّف المُبلِّغ المجهول ظاهر';
  v_pass := v_pass + 2;

  SELECT out_department INTO v_txt
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0) WHERE out_id=v_i2;
  ASSERT v_txt = '—', format('6.5 ★★★ انحدار 0338: قسم المجهول ظاهر (%s)', v_txt);
  v_pass := v_pass + 1;

  -- ★★★ والبحث بالاسم الحيّ لا يكشف المجهول
  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,NULL,'سعد الاسم',FALSE,200,0)
   WHERE out_id = v_i2;
  ASSERT v_n = 0,
    '6.6 ★★★ البحث بالاسم الجديد كشف البلاغ المجهول — ثغرة استنتاج';
  v_pass := v_pass + 1;

  -- ★ لكنه يجد بلاغه غير المجهول (وإلا كان البحث معطّلاً)
  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,NULL,'سعد الاسم',FALSE,200,0)
   WHERE out_id = v_i1;
  ASSERT v_n = 1, '6.7 ★ البحث بالاسم الحيّ لا يجد البلاغ غير المجهول';
  v_pass := v_pass + 1;

  UPDATE public.profiles SET full_name='سعد الموظف' WHERE id=v_uEmp;

  -- ═══ ⑦ ★★ الترقيم والإجمالي ══════════════════════════════════════════
  -- ★ بدور postgres تُرى بلاغات المستأجرين معاً: 3 في أ + 1 في ب = 4،
  --   ناقص المؤرشف (v_i3) = 3. العزل الحقيقي يُقاس في سكربت RLS.
  SELECT out_total INTO v_big
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,1,0);
  ASSERT v_big = 3,
    format('7.1 ★★ out_total = %s مع limit=1 (متوقَّع 3 غير مؤرشف)', v_big);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,1,0);
  ASSERT v_n = 1, format('7.2 p_limit لا يُطبَّق (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ الإجمالي يتبع الترشيح لا الجدول كلّه
  SELECT COALESCE(max(out_total),0) INTO v_big
    FROM public.hr_incidents_inbox(NULL,NULL,'تسريب',FALSE,200,0);
  ASSERT v_big = 1, format('7.3 ★ out_total لا يتبع البحث (%s)', v_big);
  v_pass := v_pass + 1;

  -- ★★ المؤرشف مستبعَد افتراضياً ويظهر بالمعامل
  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0)
   WHERE out_id = v_i3;
  ASSERT v_n = 0, '7.4 ★★ البلاغ المؤرشف ظاهر في الصندوق الافتراضي';
  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0)
   WHERE out_id = v_i3;
  ASSERT v_n = 1, '7.5 ★ المؤرشف لا يظهر حتى مع p_include_archived';
  v_pass := v_pass + 2;

  -- ★★★ ثغرة تغطية أُصلحت: `IN ('pending','in_progress')` يقبل حالتين
  --   من أربع فيمرّ صدفةً مهما كان الترتيب. نفس درس «التأكيد الفضفاض»
  --   المتكرر. نُثبّت بيانات معروفة ونطالب بترتيب **كامل** محدَّد.
  DECLARE
    v_seq TEXT;
  BEGIN
    -- نضبط حالات معروفة: محلول(low) · معلّق(critical) · معلّق(low)
    PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
    UPDATE public.incidents SET status='resolved', severity='low'      WHERE id=v_i1;
    UPDATE public.incidents SET status='pending',  severity='critical' WHERE id=v_i2;
    UPDATE public.incidents SET status='pending',  severity='low'      WHERE id=v_iB;

    SELECT string_agg(out_status||'/'||out_severity, ' → ' ORDER BY o)
      INTO v_seq
      FROM (SELECT out_status, out_severity, row_number() OVER () AS o
              FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0)) t;
    ASSERT v_seq = 'pending/critical → pending/low → resolved/low',
      format('7.6 ★★★ الترتيب = %s (متوقَّع: المعلّق الحرج ثم المعلّق ثم المحلول)', v_seq);

    -- ★ نُعيد ما غيّرناه: الكتل التالية تعتمد على حالات محدّدة، وتغييرها
    --   هنا كان يُسقط 8.3 بـINCIDENT_BAD_TRANSITION (resolved → pending
    --   ليس انتقالاً مشروعاً — وهو بذاته دليل أن جدول الانتقالات يعمل).
    UPDATE public.incidents SET status='in_progress', severity='high'     WHERE id=v_i1;
    UPDATE public.incidents SET status='in_progress', severity='critical' WHERE id=v_i2;
    UPDATE public.incidents SET status='pending',     severity='low'      WHERE id=v_iB;
  END;
  v_pass := v_pass + 1;

  -- ★ الترشيح بالحالة والخطورة
  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox('in_progress',NULL,NULL,FALSE,200,0)
   WHERE out_status <> 'in_progress';
  ASSERT v_n = 0, format('7.7 ترشيح الحالة سرّب %s', v_n);
  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,'high',NULL,FALSE,200,0)
   WHERE out_severity <> 'high';
  ASSERT v_n = 0, format('7.8 ترشيح الخطورة سرّب %s', v_n);
  v_pass := v_pass + 2;

  -- ═══ ⑧ my_incidents ══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);

  SELECT COALESCE(max(out_total),0) INTO v_big FROM public.my_incidents(NULL,NULL,1,0);
  ASSERT v_big = 2, format('8.1 ★★ my_incidents.out_total = %s (متوقَّع 2)', v_big);
  v_pass := v_pass + 1;

  -- ★★★ can_withdraw يطابق شرط set_incident_status فلا يظهر زرّ يفشل
  --   v_i1 قيد المعالجة (لا سحب) · v_i2 قيد المعالجة أيضاً بعد إعادة الفتح
  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,200,0)
   WHERE out_can_withdraw AND out_status <> 'pending';
  ASSERT v_n = 0,
    format('8.2 ★★★ can_withdraw=TRUE في %s بلاغاً حالته ليست pending', v_n);
  v_pass := v_pass + 1;

  -- ★ ولو صار معلّقاً لظهر الزرّ
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);
  PERFORM public.set_incident_status(v_i1, 'pending', NULL);
  PERFORM set_config('request.jwt.claim.sub', v_uEmp::text, TRUE);
  SELECT out_can_withdraw INTO v_ok FROM public.my_incidents(NULL,NULL,200,0)
   WHERE out_id = v_i1;
  ASSERT v_ok, '8.3 ★ can_withdraw=FALSE لبلاغ معلّق يملكه صاحبه';
  v_pass := v_pass + 1;

  -- ★★ وما يقوله العرض يطابق ما تفعله الدالة فعلاً
  ASSERT public.set_incident_status(v_i1, 'closed', 'سحب') = 'closed',
    '8.4 ★★★ can_withdraw وعد بما لا تسمح به set_incident_status';
  v_pass := v_pass + 1;

  -- ★★ البحث في القاعدة
  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,'تسريب',200,0);
  ASSERT v_n = 1, format('8.5 ★★ البحث في my_incidents أعاد %s', v_n);
  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,'لا_يوجد_هذا',200,0);
  ASSERT v_n = 0, format('8.6 البحث الفارغ أعاد %s', v_n);
  v_pass := v_pass + 2;

  -- ★★★ لا يرى بلاغات غيره (RLS مُعطَّل هنا فالترشيح داخل الدالة)
  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,200,0)
   WHERE out_id IN (v_i3, v_iB);
  ASSERT v_n = 0, format('8.7 ★★★ my_incidents سرّب %s بلاغاً لغير صاحبه', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑨ الإحصاءات ══════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uHr::text, TRUE);

  SELECT out_total, out_archived, out_unassigned, out_anonymous
    INTO v_big, v_n, v_num, v_msg
    FROM public.hr_incident_stats(30);
  ASSERT v_big = 3,
    format('9.1 ★★ out_total = %s (متوقَّع 3 غير مؤرشف من 4)', v_big);
  -- ★ العزل الحقيقي بين المستأجرين يُقاس في سكربت RLS لا هنا.
  v_pass := v_pass + 1;

  ASSERT v_n = 1, format('9.2 ★ out_archived = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★★ unassigned يحسب المفتوح فقط
  ASSERT v_num >= 0, '9.3 out_unassigned سالب';
  -- ★ العدّ المباشر بلا ترشيح مستأجر: الدالة INVOKER وهذا الملف postgres
  --   فترى المستأجرين معاً. الترشيح بـtenant_id هنا كان سيقارن نطاقين
  --   مختلفين ويسقط لسبب خاطئ.
  SELECT out_unassigned INTO v_num FROM public.hr_incident_stats(30);
  ASSERT v_num = (SELECT count(*) FROM public.incidents
                   WHERE assigned_to IS NULL
                     AND archived_at IS NULL AND status IN ('pending','in_progress')),
    format('9.4 ★★ out_unassigned = %s لا يطابق العدّ المباشر (%s)', v_num,
           (SELECT count(*) FROM public.incidents
             WHERE assigned_to IS NULL AND archived_at IS NULL
               AND status IN ('pending','in_progress')));
  v_pass := v_pass + 2;

  -- ★★ الإحصاءات تستبعد المؤرشف كما تفعل القائمة (وإلا تناقضا)
  SELECT out_total INTO v_big FROM public.hr_incident_stats(30);
  SELECT COALESCE(max(out_total),0) INTO v_num
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0);
  ASSERT v_big = v_num,
    format('9.5 ★★ الإحصاءات (%s) تناقض القائمة (%s)', v_big, v_num);
  v_pass := v_pass + 1;

  -- ═══ ⑩ ★★★ الإسناد (assign_incident من 0338) ═════════════════════════
  ASSERT public.assign_incident(v_i1, v_eOth), '10.1 الإسناد فشل';
  v_pass := v_pass + 1;

  SELECT out_assignee INTO v_txt
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0) WHERE out_id=v_i1;
  ASSERT v_txt <> '—', format('10.2 ★ اسم المُسنَد إليه لا يظهر (%s)', v_txt);
  v_pass := v_pass + 1;

  -- ★★★ لا إسناد لموظف من مستأجر آخر
  BEGIN
    PERFORM public.assign_incident(v_i1, v_eB);
    RAISE EXCEPTION '10.3 ★★★ أُسنِد البلاغ لموظف من مستأجر آخر';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg LIKE '%ASSIGNEE_NOT_IN_TENANT%',
      format('10.3 رُفض بسبب آخر: %s', v_msg);
  END;
  v_pass := v_pass + 1;

  -- ★ وإلغاء الإسناد يُعيده إلى unassigned
  PERFORM public.assign_incident(v_i1, NULL);
  ASSERT (SELECT assigned_to FROM public.incidents WHERE id=v_i1) IS NULL,
    '10.4 إلغاء الإسناد لم يعمل';
  v_pass := v_pass + 1;

  -- ═══ ⑪ ★★★ عزل المستأجرين ════════════════════════════════════════════
  -- ★★★ هنا بدور postgres (BYPASSRLS) فبلاغ ب **يُرى** — وهذا متوقَّع
  --   لأن الدوال INVOKER تعتمد على RLS الذي لا يسري على postgres.
  --   نتحقّق من أن العزل يعتمد على RLS فعلاً لا على ترشيح داخل الدالة:
  SELECT count(*) INTO v_n FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0)
   WHERE out_id = v_iB;
  ASSERT v_n = 1,
    '11.1 ★★ بدور postgres يجب أن يُرى بلاغ ب — وإلا فالدالة تُرشّح داخلياً '
    'وتُخفي عطلاً في RLS. العزل الحقيقي في verify-…-0341-rls.sh';
  v_pass := v_pass + 1;

  -- ★★ لكن ترشيح المستأجر في `my_incidents` **داخل الدالة** (user_id)
  --   فيجب أن يعمل حتى بلا RLS — وقد قِسناه في 8.7.
  ASSERT (SELECT count(*) FROM public.my_incidents(NULL,NULL,200,0)
           WHERE out_id = v_iB) = 0,
    '11.2 ★★★ my_incidents سرّبت بلاغ مستأجر آخر رغم ترشيح user_id';
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '  verify-incident-lifecycle-0341 — % تأكيداً ناجحاً', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0341';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_VERIFY_0341' THEN RAISE; END IF;
END $$;
