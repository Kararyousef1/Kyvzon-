-- ============================================================================
-- verify-incident-anonymity-0338.sql
--
-- ★ تحديث 0341: توقيعا `hr_incidents_inbox` و`my_incidents` تغيّرا.
--   أُضيف `p_include_archived` قبل `p_limit` في الأولى، و`p_search`
--   بعد `p_status` في الثانية. **انحدار مُثبَت**: أول تشغيل بعد 0341
--   أعطى `function public.hr_incidents_inbox(unknown, unknown, unknown,
--   integer, integer) does not exist`. الاستدعاءات هنا حُدِّثت،
--   و`TRUE` تُمرَّر لـ`p_include_archived` كي يبقى هذا الاختبار قائساً
--   لنفس المجموعة (لا مؤرشف في بياناته أصلاً).
--
-- البلاغات: حماية هوية المُبلِّغ المجهول · صندوق الموارد · الإسناد.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
-- العزل عبر RLS الحقيقي في verify-incident-anonymity-0338-rls.sh.
--
-- ملاحظات بنيوية مُحقَّقة:
--   incidents: title·description·category·severity·status NOT NULL
--     is_anonymous BOOLEAN NOT NULL
--     ★ حقول مكرّرة: employee_name نصّ **و** employee_id مرجع
--                    department نصّ **و** department_id مرجع
--     user_id → auth.users · employee_id → employees
--     assigned_to → employees · reported_by → profiles
--   سياسة kyvzon_incidents_select تُرشّح بـuser_id لا employee_id
--   محفّز trg_ensure_employee_row (0317) يُنشئ سجلّ الموظف تلقائياً
--   قيد uq_employee_per_user_tenant (0335) يمنع سجلّاً ثانياً
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();   -- الموظف المُبلِّغ
  v_hr    UUID := gen_random_uuid();   -- مسؤول الموارد
  v_oth   UUID := gen_random_uuid();   -- زميل عادي
  v_ub    UUID := gen_random_uuid();   -- شركة ب
  v_e     UUID;
  v_eo    UUID;
  v_eb    UUID;
  v_d     UUID := gen_random_uuid();
  v_db    UUID := gen_random_uuid();
  v_i1    UUID := gen_random_uuid();   -- بلاغ عادي
  v_i2    UUID := gen_random_uuid();   -- بلاغ مجهول
  v_i3    UUID := gen_random_uuid();   -- حرج
  v_n     INT;
  v_txt   TEXT;
  v_uuid  UUID;
  v_num   NUMERIC;
  v_pass  INT := 0;
  r       RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  -- ★★ الدوال SECURITY INVOKER وهذا الملف يعمل بدور postgres (BYPASSRLS)
  --   ⇒ لا ترشيح بالمستأجر، فبيانات أي جولة سابقة تُفسد كل عدّ إجمالي.
  --   (ظهر عملياً: «5.1 صندوق الموارد = 4 (متوقَّع 3)» بعد تشغيل 0341.)
  --   ★ ومحفّز 0341 يمنع الحذف حتى على postgres — نُعطّله للتنظيف وحده.
  ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
  DELETE FROM public.incident_comments;
  DELETE FROM public.incidents;
  ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;

  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'IA','بلاغ أ','in38a-'||substr(v_t::text ,1,8)),
    (v_tb,'IB','بلاغ ب','in38b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u  ,'u-'||substr(v_u::text  ,1,8)||'@i38.io'),
    (v_hr ,'h-'||substr(v_hr::text ,1,8)||'@i38.io'),
    (v_oth,'o-'||substr(v_oth::text,1,8)||'@i38.io'),
    (v_ub ,'b-'||substr(v_ub::text ,1,8)||'@i38.io');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d ,v_t ,'التقنية'), (v_db,v_tb,'قسم ب');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
    (v_u  ,v_t ,'أحمد الموظف','employee','التقنية'),
    (v_hr ,v_t ,'مسؤول الموارد','hr','الإدارة'),
    (v_oth,v_t ,'زميل عادي','employee','التقنية'),
    (v_ub ,v_tb,'موظف ب','employee','قسم ب');

  -- ★ المحفّز أنشأ سجلّات الموظفين — نلتقطها
  SELECT id INTO v_e  FROM public.employees WHERE user_id=v_u   AND tenant_id=v_t;
  SELECT id INTO v_eo FROM public.employees WHERE user_id=v_oth AND tenant_id=v_t;
  SELECT id INTO v_eb FROM public.employees WHERE user_id=v_ub  AND tenant_id=v_tb;
  UPDATE public.employees SET department_id=v_d WHERE id IN (v_e, v_eo);
  ASSERT v_e IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّ الموظف — تجهيز باطل';
  v_pass := v_pass + 1;

  -- ═══ ① البنية ═════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('my_incidents','hr_incidents_inbox','hr_incident_stats','assign_incident');
  ASSERT v_n = 4, format('1.1 دوال 0338 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★★ كلها INVOKER: تحترم سياسة kyvzon_incidents_select
  FOR r IN SELECT unnest(ARRAY['my_incidents','hr_incidents_inbox',
                               'hr_incident_stats','assign_incident']) AS nm
  LOOP
    ASSERT (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname=r.nm),
      format('1.2 ★★ %s صارت SECURITY DEFINER — تتجاوز RLS', r.nm);
  END LOOP;
  v_pass := v_pass + 1;

  -- ★ الإسناد VOLATILE (درس 0320)
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='assign_incident') = 'v',
    '1.3 ★ assign_incident ليست VOLATILE — الكتابة مستحيلة';
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN ('my_incidents','hr_incidents_inbox',
                            'hr_incident_stats','assign_incident')),
    '1.4 ★★ anon يملك EXECUTE على إحدى دوال 0338';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('idx_incidents_user_created','idx_incidents_tenant_status',
     'idx_incidents_unassigned_open');
  ASSERT v_n = 3, format('1.5 فهارس 0338 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT indexdef LIKE '%WHERE%assigned_to IS NULL%' FROM pg_indexes
           WHERE indexname='idx_incidents_unassigned_open'),
    '1.6 ★ فهرس غير المُسنَد ليس جزئياً';
  v_pass := v_pass + 1;

  -- ═══ ② البيانات ═══════════════════════════════════════════════════════
  INSERT INTO public.incidents
    (id,tenant_id,user_id,employee_id,department_id,title,description,
     category,severity,status,is_anonymous,employee_name,department,created_at)
  VALUES
    (v_i1,v_t,v_u,v_e,v_d,'عطل الطابعة','لا تعمل','technical','medium',
     'pending',FALSE,'أحمد الموظف','التقنية',NOW() - INTERVAL '5 hours'),
    -- ★★★ البلاغ المجهول — الاسم مُخزَّن لكن يجب ألّا يظهر
    (v_i2,v_t,v_u,v_e,v_d,'شكوى سرّية','مضمون حسّاس','hr','high',
     'pending',TRUE ,'أحمد الموظف','التقنية',NOW() - INTERVAL '30 hours'),
    (v_i3,v_t,v_oth,v_eo,v_d,'خطر سلامة','عاجل','safety','critical',
     'pending',FALSE,'زميل عادي','التقنية',NOW() - INTERVAL '2 hours');

  -- شركة ب — للعزل
  INSERT INTO public.incidents
    (tenant_id,user_id,employee_id,title,description,category,severity,status,employee_name)
  VALUES (v_tb,v_ub,v_eb,'بلاغ سرّي ب','—','other','low','pending','موظف ب');

  -- ═══ ③ ★★★ إخفاء الهوية — العطل الأول ═════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, TRUE);

  SELECT * INTO r FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0)
   WHERE out_id = v_i2;

  ASSERT r.out_reporter = 'مُبلِّغ مجهول',
    format('3.1 ★★★ اسم المُبلِّغ المجهول = %L — الهوية مكشوفة', r.out_reporter);
  v_pass := v_pass + 1;

  -- ★★ المعرّف مخفيّ أيضاً: من يملك قائمة الموظفين يربطه بالاسم
  ASSERT r.out_employee_id IS NULL,
    format('3.2 ★★★ معرّف المُبلِّغ المجهول = %s — الحجب صوري',
           r.out_employee_id);
  v_pass := v_pass + 1;

  -- ★★ والقسم: في شركة صغيرة القسم يكشف الشخص
  ASSERT r.out_department = '—',
    format('3.3 ★★ قسم المُبلِّغ المجهول = %L — يكشفه في فريق صغير',
           r.out_department);
  v_pass := v_pass + 1;

  -- ★ الشارة نفسها تظهر (الواجهة تحتاجها)
  ASSERT r.out_is_anonymous,
    '3.4 ★ is_anonymous لا يصل الواجهة — لا شارة «مجهول»';
  v_pass := v_pass + 1;

  -- ★ المحتوى يبقى مرئياً — الحماية للهوية لا للبلاغ
  ASSERT r.out_title = 'شكوى سرّية' AND r.out_description = 'مضمون حسّاس',
    '3.5 ★ محتوى البلاغ المجهول حُجب — الحماية للهوية لا المضمون';
  v_pass := v_pass + 1;

  -- ✅ والبلاغ العادي يعرض هويته
  SELECT * INTO r FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0)
   WHERE out_id = v_i1;
  ASSERT r.out_reporter = 'أحمد الموظف',
    format('3.6 ★ اسم مُبلِّغ عادي = %L (متوقَّع الاسم)', r.out_reporter);
  v_pass := v_pass + 1;

  ASSERT r.out_employee_id = v_e,
    '3.7 ★ معرّف مُبلِّغ عادي محجوب — الحجب أوسع من اللازم';
  v_pass := v_pass + 1;

  ASSERT r.out_department = 'التقنية',
    format('3.8 قسم مُبلِّغ عادي = %L', r.out_department);
  v_pass := v_pass + 1;

  -- ═══ ④ ★★★ البحث لا يكشف الهوية بالاستنتاج ════════════════════════════
  --   لو شمل البحث بالاسم البلاغات المجهولة لأمكن كشفها: يكتب اسماً
  --   فتظهر «بلاغاته المجهولة».
  SELECT count(*) INTO v_n
    FROM public.hr_incidents_inbox(NULL,NULL,'أحمد',TRUE,50,0) b
    JOIN public.incidents i ON i.id = b.out_id WHERE i.tenant_id = v_t;
  ASSERT v_n = 1,
    format('4.1 ★★★ البحث عن «أحمد» = %s (متوقَّع 1: العادي وحده) '
           '⇒ الهوية تُكشَف بالاستنتاج', v_n);
  v_pass := v_pass + 1;

  ASSERT (SELECT b.out_id FROM public.hr_incidents_inbox(NULL,NULL,'أحمد',TRUE,50,0) b
            JOIN public.incidents i ON i.id = b.out_id WHERE i.tenant_id = v_t) = v_i1,
    '4.2 ★★★ البحث بالاسم أعاد البلاغ المجهول';
  v_pass := v_pass + 1;

  -- ★ البحث في العنوان والمضمون يعمل للجميع
  SELECT count(*) INTO v_n
    FROM public.hr_incidents_inbox(NULL,NULL,'سرّية',TRUE,50,0) b
    JOIN public.incidents i ON i.id = b.out_id WHERE i.tenant_id = v_t;
  ASSERT v_n = 1, format('4.3 ★ البحث في العنوان = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n
    FROM public.hr_incidents_inbox(NULL,NULL,'حسّاس',TRUE,50,0) b
    JOIN public.incidents i ON i.id = b.out_id WHERE i.tenant_id = v_t;
  ASSERT v_n = 1, format('4.4 البحث في المضمون = %s', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ الترشيح والترتيب ═══════════════════════════════════════════════
  -- ★★★ تصحيح 0341: هذه التأكيدات كانت تعدّ صفوف الدالة كلها بأرقام
  --   مكتوبة على افتراض عزل المستأجر. لكن `hr_incidents_inbox`
  --   **SECURITY INVOKER** وهذا الملف يعمل بدور postgres (BYPASSRLS)
  --   ⇒ تُرى بلاغات المستأجرين معاً. مروره سابقاً كان صدفةً لا دليلاً.
  --   الحلّ: نعدّ صفوف مستأجر الاختبار وحده بربط `out_id` بالجدول.
  --   العزل الحقيقي يُقاس بـSET ROLE في verify-incident-lifecycle-0341-rls.sh.
  SELECT count(*) INTO v_n
    FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) b
    JOIN public.incidents i ON i.id = b.out_id
   WHERE i.tenant_id = v_t;
  ASSERT v_n = 3, format('5.1 صندوق مستأجر الاختبار = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★ بلاغ ب يظهر هنا (بلا RLS) — دليل أن الترشيح على RLS لا داخل
  --   الدالة. لو اختفى لكانت الدالة تُرشّح داخلياً وتُخفي عطلاً في RLS.
  ASSERT EXISTS (SELECT 1 FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0)
                  WHERE out_title = 'بلاغ سرّي ب'),
    '5.2 ★★ بلاغ ب غائب بدور postgres — الدالة تُرشّح داخلياً';
  v_pass := v_pass + 1;

  -- ★ الحرج أولاً — ضمن مستأجر الاختبار
  --
  -- ★★★ تصحيح 0357: كان التأكيد `JOIN … LIMIT 1` **بلا ORDER BY**.
  --   ترتيب صفوف `JOIN` غير محدَّد في SQL: المُخطِّط حرٌّ في قيادة
  --   الحلقة من أيّ جانب. كان يمرّ صدفةً لأن الخطة كانت تقود من
  --   الدالة (المُرتَّبة داخلياً).
  --
  --   أضافت 0357 الفهرس `idx_incidents_reported_by (tenant_id, …)`
  --   فصارت الخطة (مقيسة بـEXPLAIN):
  --      Limit → Nested Loop
  --                → Index Scan using idx_incidents_reported_by on incidents i
  --                → Function Scan on hr_incidents_inbox b
  --   أي أن `incidents` صارت الجانب الخارجيّ ⇒ الترتيب انقلب.
  --
  --   العطل في **التأكيد** لا في الدالة: `hr_incidents_inbox` تُرتّب
  --   صحيحاً (pending → in_progress → resolved، ثم critical → high →
  --   medium، ثم created_at DESC). نحفظ ترتيبها برقم صفٍّ صريح بدل
  --   الاعتماد على خطة التنفيذ.
  ASSERT (SELECT x.out_id FROM (
            SELECT b.out_id, row_number() OVER () AS rn
              FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) b
          ) x
          JOIN public.incidents i ON i.id = x.out_id
         WHERE i.tenant_id = v_t
         ORDER BY x.rn LIMIT 1) = v_i3,
    '5.3 ★ الترتيب لا يضع الحرج أولاً';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n
    FROM public.hr_incidents_inbox(NULL,'high',NULL,TRUE,50,0) b
    JOIN public.incidents i ON i.id = b.out_id
   WHERE i.tenant_id = v_t;
  ASSERT v_n = 1, format('5.4 ترشيح الخطورة high = %s', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n
    FROM public.hr_incidents_inbox('pending',NULL,NULL,TRUE,50,0) b
    JOIN public.incidents i ON i.id = b.out_id
   WHERE i.tenant_id = v_t;
  ASSERT v_n = 3, format('5.5 ترشيح الحالة pending = %s', v_n);
  v_pass := v_pass + 1;

  -- ★★ الترشيحان معاً لا أحدهما
  SELECT count(*) INTO v_n
    FROM public.hr_incidents_inbox('resolved','critical',NULL,TRUE,50,0) b
    JOIN public.incidents i ON i.id = b.out_id
   WHERE i.tenant_id = v_t;
  ASSERT v_n = 0,
    format('5.6 ★★ تركيبة غير موجودة أعادت %s ⇒ أحد الترشيحين مُهمَل', v_n);
  v_pass := v_pass + 1;

  -- ★ العمر محسوب في القاعدة
  SELECT out_age_hours INTO v_num FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0)
   WHERE out_id = v_i2;
  ASSERT v_num BETWEEN 29.5 AND 30.5,
    format('5.7 ★ عمر البلاغ = %s ساعة (متوقَّع ≈30)', v_num);
  v_pass := v_pass + 1;

  -- ═══ ⑥ شاشة الموظف ════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);

  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,50,0);
  ASSERT v_n = 2,
    format('6.1 ★ بلاغاتي = %s (متوقَّع 2؛ بلاغ الزميل لا يظهر)', v_n);
  v_pass := v_pass + 1;

  -- ★★ بلاغ الزميل لا يظهر رغم نفس القسم
  ASSERT NOT EXISTS (SELECT 1 FROM public.my_incidents(NULL,NULL,50,0)
                      WHERE out_id = v_i3),
    '6.2 ★★ بلاغ زميل ظهر في «بلاغاتي»';
  v_pass := v_pass + 1;

  -- ★ الموظف يرى بلاغه المجهول (هو صاحبه)
  ASSERT EXISTS (SELECT 1 FROM public.my_incidents(NULL,NULL,50,0) WHERE out_id = v_i2),
    '6.3 ★★ الموظف لا يرى بلاغه المجهول — لا يستطيع متابعته';
  v_pass := v_pass + 1;

  -- ★★★ تصحيح 0341: هذا التأكيد كان **لا يقيس شيئاً**.
  --   `set_config('request.jwt.claim.sub', …)` يغيّر هوية `auth.uid()`
  --   لكن الدور يبقى `postgres` (BYPASSRLS)، و`hr_incidents_inbox`
  --   INVOKER تعتمد على RLS وحده — فلا حجب هنا مهما كان المستخدم.
  --   مروره سابقاً كان لأن الصندوق كان فارغاً في تلك اللحظة، لا لأن
  --   الحجب يعمل. الحجب الحقيقي مُقاس بـ`SET ROLE authenticated` في
  --   verify-incident-lifecycle-0341-rls.sh (② «موظف عادي عبر صندوق
  --   الموارد يرى بلاغيه فقط»).
  --   ما يبقى قابلاً للقياس هنا: `my_incidents` تُرشّح بـ`user_id`
  --   **داخل الدالة** فتعمل حتى بلا RLS.
  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,50,0);
  ASSERT v_n = 2,
    format('6.4 ★★ my_incidents أعادت %s (متوقَّع 2: بلاغا أحمد) — '
           'الترشيح بـuser_id داخل الدالة لا يعمل', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ التحليلات ══════════════════════════════════════════════════════
  --   ★★★ تصحيح 0341: `hr_incident_stats` INVOKER أيضاً، فبدور postgres
  --   تحسب المستأجرين معاً. بلاغ ب واحد `pending` بخطورة `low` وبلا
  --   مُسنَد، فنطرحه صراحةً من كل رقم متأثّر بدل تثبيت أرقام مطلقة.
  PERFORM set_config('request.jwt.claim.sub', v_hr::text, TRUE);
  SELECT * INTO r FROM public.hr_incident_stats(30);

  ASSERT r.out_total = 4, format('7.1 الإجمالي = %s (متوقَّع 4: 3 في أ + 1 في ب)', r.out_total);
  v_pass := v_pass + 1;

  ASSERT r.out_pending = 4, format('7.2 المعلّق = %s (متوقَّع 4: كلّها معلّقة)', r.out_pending);
  v_pass := v_pass + 1;

  ASSERT r.out_critical = 1, format('7.3 الحرج = %s', r.out_critical);
  v_pass := v_pass + 1;

  ASSERT r.out_anonymous = 1, format('7.4 المجهول = %s', r.out_anonymous);
  v_pass := v_pass + 1;

  -- ★★ غير المُسنَد يعدّ **المفتوح** وحده
  ASSERT r.out_unassigned = 4,
    format('7.5 غير المُسنَد = %s (متوقَّع 4: كلّها مفتوحة بلا إسناد)',
           r.out_unassigned);
  v_pass := v_pass + 1;

  -- ★ أقدم مفتوح ≈30 ساعة
  ASSERT r.out_oldest_hours BETWEEN 29.5 AND 30.5,
    format('7.6 ★ أقدم مفتوح = %s ساعة (متوقَّع ≈30)', r.out_oldest_hours);
  v_pass := v_pass + 1;

  -- ★★ بلاغ محلول بلا مُسنَد ليس مشكلة
  UPDATE public.incidents SET status = 'resolved' WHERE id = v_i2;
  SELECT * INTO r FROM public.hr_incident_stats(30);
  ASSERT r.out_unassigned = 3,
    format('7.7 ★★ غير المُسنَد بعد الحلّ = %s (متوقَّع 3) — المحلول يُعدّ '
           'مشكلة', r.out_unassigned);
  v_pass := v_pass + 1;

  ASSERT r.out_resolved = 1, format('7.8 المحلول = %s', r.out_resolved);
  v_pass := v_pass + 1;

  -- ★ وأقدم مفتوح تغيّر (كان البلاغ المحلول أقدمها)
  ASSERT r.out_oldest_hours BETWEEN 4.5 AND 5.5,
    format('7.9 ★★ أقدم مفتوح بعد الحلّ = %s (متوقَّع ≈5) — المحلول '
           'يُحتسب في العمر', r.out_oldest_hours);
  v_pass := v_pass + 1;

  UPDATE public.incidents SET status = 'pending' WHERE id = v_i2;

  -- ═══ ⑧ الإسناد ════════════════════════════════════════════════════════
  ASSERT public.assign_incident(v_i1, v_eo),
    '8.1 ★ الإسناد فشل';
  v_pass := v_pass + 1;

  SELECT out_assigned_to INTO v_uuid FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0)
   WHERE out_id = v_i1;
  ASSERT v_uuid = v_eo, '8.2 ★ المُسنَد إليه لم يُحفظ';
  v_pass := v_pass + 1;

  SELECT out_assignee INTO v_txt FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0)
   WHERE out_id = v_i1;
  ASSERT v_txt <> '—', format('8.3 اسم المُسنَد إليه = %L', v_txt);
  v_pass := v_pass + 1;

  -- ★★ لا إسناد لموظف من مستأجر آخر
  BEGIN
    PERFORM public.assign_incident(v_i1, v_eb);
    ASSERT FALSE, '8.4 ★★★ أُسنِد بلاغ لموظف شركة أخرى';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%ASSIGNEE_NOT_IN_TENANT%',
      format('8.4 رسالة غير متوقَّعة: %s', SQLERRM);
  END;
  v_pass := v_pass + 1;

  -- ★ إلغاء الإسناد بـNULL
  ASSERT public.assign_incident(v_i1, NULL), '8.5 إلغاء الإسناد فشل';
  v_pass := v_pass + 1;

  SELECT out_assigned_to INTO v_uuid FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0)
   WHERE out_id = v_i1;
  ASSERT v_uuid IS NULL, '8.6 ★ الإسناد لم يُلغَ';
  v_pass := v_pass + 1;

  -- ★ بلاغ غير موجود يُعيد FALSE لا خطأ
  ASSERT NOT public.assign_incident(gen_random_uuid(), v_eo),
    '8.7 إسناد بلاغ مجهول لم يُعِد FALSE';
  v_pass := v_pass + 1;

  -- ★★★ موظف عادي لا يُسنِد
  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);
  BEGIN
    PERFORM public.assign_incident(v_i1, v_eo);
    ASSERT FALSE, '8.8 ★★★ موظف عادي أسنَد بلاغاً';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%NOT_AUTHORIZED_TO_ASSIGN%',
      format('8.8 رسالة غير متوقَّعة: %s', SQLERRM);
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑨ المستخدم المعدوم ═══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);

  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,50,0);
  ASSERT v_n = 0, format('9.1 ★ مستخدم بلا ملف رأى %s بلاغاً', v_n);
  v_pass := v_pass + 1;

  -- ★★★ تصحيح 0341: `hr_incidents_inbox` INVOKER تعتمد على RLS، وبدور
  --   postgres لا حجب. التأكيد الأصلي كان يمرّ صدفةً. الحجب الحقيقي
  --   مُقاس بـSET ROLE في verify-incident-lifecycle-0341-rls.sh (⑨).
  --   ما يبقى قابلاً للقياس: البحث بمعرّف مجهول لا يُرجع شيئاً من
  --   `my_incidents` لأن ترشيحها بـ`user_id` **داخل** الدالة.
  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,'أحمد',50,0);
  ASSERT v_n = 0,
    format('9.2 ★★ مستخدم بلا ملف رأى %s عبر بحث my_incidents', v_n);
  v_pass := v_pass + 1;

  -- ★ التحليلات تُرجع صفّ أصفار (الواجهة تعرض بطاقات)
  SELECT count(*) INTO v_n FROM public.hr_incident_stats(30);
  ASSERT v_n = 1,
    format('9.3 ★ التحليلات أعادت %s صفاً (متوقَّع 1 بأصفار)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑩ شركة ب ترى بلاغاتها وحدها ══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ub::text, TRUE);

  SELECT count(*) INTO v_n FROM public.my_incidents(NULL,NULL,50,0);
  ASSERT v_n = 1, format('10.1 موظف ب يرى %s بلاغاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (SELECT 1 FROM public.my_incidents(NULL,NULL,50,0)
                      WHERE out_title = 'شكوى سرّية'),
    '10.2 ★★ تسريب معاكس: موظف ب رأى بلاغ شركة أ';
  v_pass := v_pass + 1;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  verify-incident-anonymity-0338: % تأكيداً — نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════';

  RAISE EXCEPTION 'ROLLBACK_VERIFY_0338';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_VERIFY_0338' THEN
    RAISE NOTICE 'تراجع نظيف — لا أثر في القاعدة.';
  ELSE
    RAISE;
  END IF;
END $$;
