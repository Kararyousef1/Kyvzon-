-- ============================================================================
-- verify-structure-and-notifications-0322.sql
-- عزل الجداول الهيكلية + ربط الموافقات بالإشعارات.
--
-- ملاحظة منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال
-- والمحفّزات**. إثبات RLS الفعلي جرى بمسبار SET ROLE authenticated
-- وموثَّق في docs — لا نَدَّعي هنا ما لا نقيسه.
--
-- ★★★ تصحيح 0339: هذا الملف كان يُدرج `status='pending'` (إنجليزية) في
--   `leaves`. قبل 0339 لم يكن على العمود أي CHECK فمرّ الإدراج — لكنه
--   كان **يكتب قيمة لا تقرؤها أي شاشة**: `leaves.status` افتراضه
--   `'انتظار'`، و`sync_hr_source_status` تكتب `'موافق'`/`'مرفوض'`،
--   وكل فلاتر الواجهة تقارن بالعربية. أي أن الاختبار كان يمرّ على
--   بيانات لا تُنتجها القاعدة ولا تعرضها الواجهة.
--   قيد 0339 كشف ذلك: new row violates "leaves_status_check".
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_ta   UUID := gen_random_uuid();
  v_tb   UUID := gen_random_uuid();
  v_d    UUID := gen_random_uuid();
  v_mgr  UUID := gen_random_uuid();
  v_emp  UUID := gen_random_uuid();
  v_sup  UUID := gen_random_uuid();
  v_eid  UUID;
  v_lv   UUID := gen_random_uuid();
  v_rid  UUID;
  v_n    INT;
  v_txt  TEXT;
  v_tbl  TEXT;
  v_pass INT := 0;
BEGIN
  -- ═══ ① الأعمدة والسياسات ═══════════════════════════════════════════
  FOREACH v_tbl IN ARRAY ARRAY[
    'structure_departments','structure_positions','structure_ranks','structure_roles'
  ] LOOP
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_tbl AND column_name='tenant_id'),
      format('1.1 %s.tenant_id مفقود', v_tbl);

    -- ★ لا سياسة مكشوفة
    ASSERT NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
         AND cmd='SELECT' AND qual='true'
    ), format('1.2 ★ %s ما زال مقروءاً للجميع USING(true)', v_tbl);

    -- والسياسة الجديدة تذكر المستأجر
    ASSERT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
         AND cmd='SELECT' AND qual ILIKE '%current_user_tenant_id%'
    ), format('1.3 %s بلا فلتر مستأجر', v_tbl);
  END LOOP;
  v_pass := v_pass + 3;

  -- القوالب العامة تبقى مقروءة (توافق خلفي)
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='structure_positions'
       AND cmd='SELECT' AND qual ILIKE '%tenant_id IS NULL%'
  ), '1.4 القوالب العامة لم تعد مقروءة — كسر توافق';
  v_pass := v_pass + 1;

  -- ═══ ② دوال الإشعار ════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('notify_user','notify_approval_pending','notify_approval_decided');
  ASSERT v_n = 3, format('2.1 دوال الإشعار = %s', v_n);
  v_pass := v_pass + 1;

  -- ★ المحفّز على جدول الخطوات لا الطلبات (السباق الزمني)
  --
  --   حُدِّث في 0323: كانا اثنين (unified + hr) وصارا أربعة بإضافة
  --   procurement_approval_steps و contract_approval_steps. الرقم
  --   الحرفي «2» كان يُثبّت نقصاً لا يُثبت صحة، فنفحص الحدّ الأدنى
  --   ووجود الجدولين الأصليين اللذين يعنيان هذا الاختبار.
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname='trg_notify_approval_step' AND NOT tgisinternal;
  ASSERT v_n >= 2, format('2.2 محفّزات الخطوات = %s (متوقَّع ≥2)', v_n);
  v_pass := v_pass + 1;

  FOREACH v_tbl IN ARRAY ARRAY['unified_approval_steps','hr_approval_steps'] LOOP
    ASSERT EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE t.tgname='trg_notify_approval_step' AND NOT t.tgisinternal
         AND c.relname = v_tbl
    ), format('2.2b محفّز %s مفقود', v_tbl);
  END LOOP;
  v_pass := v_pass + 1;

  -- ولا محفّز على جداول الطلبات (النسخة الخاطئة)
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname='trg_notify_approval_created' AND NOT tgisinternal;
  ASSERT v_n = 0, format('2.3 ★ محفّز الطلبات باقٍ (%s) — سباق زمني', v_n);
  v_pass := v_pass + 1;

  -- ═══ ③ ★ الفجوة الأصلية: الموافقة تُشعر ════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_ta,'NA','شركة أ','na-'||substr(v_ta::text,1,8)),
    (v_tb,'NB','شركة ب','nb-'||substr(v_tb::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_ta,'العمليات');
  INSERT INTO auth.users(id,email) VALUES
    (v_mgr,'m-'||substr(v_mgr::text,1,8)||'@n.io'),
    (v_emp,'e-'||substr(v_emp::text,1,8)||'@n.io'),
    (v_sup,'s-'||substr(v_sup::text,1,8)||'@n.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_mgr,v_ta,'المدير','manager'),
    (v_sup,v_ta,'المشرف','supervisor');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
    (v_emp,v_ta,'الموظف','employee','العمليات');
  UPDATE public.departments SET manager_id=v_mgr, supervisor_id=v_sup WHERE id=v_d;

  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id=v_emp;

  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_lv,v_ta,v_eid,'annual','2026-09-01','2026-09-03','انتظار');
  SELECT public.create_hr_approval('leave', v_lv, v_eid) INTO v_rid;

  -- ★ الاختبار الحاسم
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_ta AND type='approval_pending';
  ASSERT v_n >= 1,
    format('3.1 ★ صفر إشعار للمعتمِدين — الفجوة الأصلية (%s)', v_n);
  v_pass := v_pass + 1;

  -- المشرف أول معتمِد في السلسلة ⇒ يُشعَر
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_ta AND user_id=v_sup;
  ASSERT v_n >= 1, format('3.2 المشرف (أول السلسلة) لم يُشعَر (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ مُقدّم الطلب لا يُشعَر بفعله
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_ta AND user_id=v_emp;
  ASSERT v_n = 0, format('3.3 ★ مُقدّم الطلب أُشعِر بفعله هو (%s)', v_n);
  v_pass := v_pass + 1;

  -- الإشعار يحمل عنواناً ورابطاً مفيدين
  SELECT title INTO v_txt FROM public.notifications
   WHERE tenant_id=v_ta AND type='approval_pending' LIMIT 1;
  ASSERT v_txt IS NOT NULL AND btrim(v_txt) <> '', '3.4 إشعار بلا عنوان';
  v_pass := v_pass + 1;

  ASSERT EXISTS (SELECT 1 FROM public.notifications
                  WHERE tenant_id=v_ta AND action_url IS NOT NULL),
    '3.5 إشعار بلا رابط — المستخدم لا يعرف أين يذهب';
  v_pass := v_pass + 1;

  -- غير مقروء ابتداءً
  ASSERT NOT EXISTS (SELECT 1 FROM public.notifications
                      WHERE tenant_id=v_ta AND is_read),
    '3.6 الإشعار مقروء عند الإنشاء';
  v_pass := v_pass + 1;

  -- ═══ ④ notify_user: الحالات الحدّية ════════════════════════════════
  -- NULL آمن
  ASSERT public.notify_user(NULL, v_mgr, 't','x','y') IS NULL, '4.1 tenant NULL أنشأ إشعاراً';
  ASSERT public.notify_user(v_ta, NULL, 't','x','y') IS NULL, '4.2 user NULL أنشأ إشعاراً';
  v_pass := v_pass + 2;

  -- ★ لا إشعار ذاتي
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  ASSERT public.notify_user(v_ta, v_mgr, 't','x','y') IS NULL,
    '4.3 ★ أُشعِر المستخدم بفعله هو';
  v_pass := v_pass + 1;

  -- إشعار مستخدم آخر يعمل
  ASSERT public.notify_user(v_ta, v_emp, 'test','عنوان','رسالة') IS NOT NULL,
    '4.4 تعذّر إشعار مستخدم آخر';
  v_pass := v_pass + 1;

  -- ═══ ⑤ إشعار القرار ════════════════════════════════════════════════
  -- ملاحظة 0323: هذه الدالة صارت تقرأ من approval_source_info لا من
  -- العرض unified_approvals، فتعمل بصرف النظر عن حالة الطلب. قبل 0323
  -- كان هذا التأكيد ينجح **بالصدفة** لأن الطلب ما زال pending.
  SELECT public.notify_approval_decided('hr', v_rid, 'approved', 'موافق') INTO v_n;
  ASSERT v_n = 1, format('5.1 إشعار القرار لم يُرسَل (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.notifications
   WHERE tenant_id=v_ta AND user_id=v_emp AND type='approval_granted';
  ASSERT v_n = 1, format('5.2 مُقدّم الطلب لم يُشعَر بالقرار (%s)', v_n);
  v_pass := v_pass + 1;

  -- السبب يظهر في الرسالة
  SELECT message INTO v_txt FROM public.notifications
   WHERE tenant_id=v_ta AND type='approval_granted' LIMIT 1;
  ASSERT v_txt LIKE '%موافق%', format('5.3 سبب القرار مفقود: %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══ ⑥ العزل بين المستأجرين في الإشعارات ═══════════════════════════
  SELECT count(*) INTO v_n FROM public.notifications WHERE tenant_id=v_tb;
  ASSERT v_n = 0, format('6.1 ★ تسرّبت %s إشعارات لشركة أخرى', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ الصلاحيات ═══════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.notify_user(uuid,uuid,text,text,text,text,text,uuid)','EXECUTE'),
    '7.1 anon يُنشئ إشعارات';
  ASSERT NOT has_function_privilege('anon',
    'public.notify_approval_pending(text,uuid)','EXECUTE'),
    '7.2 anon يُشعر المعتمِدين';
  v_pass := v_pass + 2;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.notifications        WHERE tenant_id IN (v_ta,v_tb);
  DELETE FROM public.hr_approval_steps    WHERE tenant_id = v_ta;
  DELETE FROM public.hr_approval_requests WHERE tenant_id = v_ta;
  DELETE FROM public.leaves               WHERE tenant_id = v_ta;
  DELETE FROM public.employees            WHERE tenant_id IN (v_ta,v_tb);
  DELETE FROM public.profiles  WHERE id IN (v_mgr,v_emp,v_sup);
  DELETE FROM auth.users       WHERE id IN (v_mgr,v_emp,v_sup);
  DELETE FROM public.departments WHERE id = v_d;
  DELETE FROM public.tenants     WHERE id IN (v_ta,v_tb);

  RAISE NOTICE '✅ verify-0322: %/24 تأكيداً ناجحاً', v_pass;
END $$;
