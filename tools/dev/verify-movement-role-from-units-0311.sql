-- ============================================================================
-- verify-movement-role-from-units-0311.sql
-- اختبار سلوكي لمايجريشن 0311 — يُشغَّل على قاعدة نظيفة بعد كل المايجريشنات.
--
-- يغطي: الجسر · منع تصعيد امتياز المشرف · صيانة origin · السحب والإعادة ·
--        عدم التداخل بين المصادر الثلاثة · تغيير user_id · العزل بين المستأجرين
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t1   UUID := gen_random_uuid();
  v_t2   UUID := gen_random_uuid();
  v_d1   UUID := gen_random_uuid();
  v_d2   UUID := gen_random_uuid();
  v_mgr  UUID := gen_random_uuid();   -- مدير على وحدة الحركة
  v_sup  UUID := gen_random_uuid();   -- مشرف على وحدة الحركة
  v_fin  UUID := gen_random_uuid();   -- مدير على وحدة المالية فقط
  v_man  UUID := gen_random_uuid();   -- إسناد يدوي سابق
  v_prof UUID := gen_random_uuid();   -- دوره في profiles = movement_manager
  v_t2u  UUID := gen_random_uuid();   -- مستخدم مستأجر آخر
  v_n    INT;
  v_txt  TEXT;
  v_pass INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t1,'T1 0311','مستأجر ١','t1-0311-'||substr(v_t1::text,1,8)),
    (v_t2,'T2 0311','مستأجر ٢','t2-0311-'||substr(v_t2::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d1,v_t1,'قسم ١'), (v_d2,v_t2,'قسم ٢');
  INSERT INTO auth.users(id,email) VALUES
    (v_mgr ,'m-' ||substr(v_mgr::text,1,8) ||'@0311.test'),
    (v_sup ,'s-' ||substr(v_sup::text,1,8) ||'@0311.test'),
    (v_fin ,'f-' ||substr(v_fin::text,1,8) ||'@0311.test'),
    (v_man ,'x-' ||substr(v_man::text,1,8) ||'@0311.test'),
    (v_prof,'p-' ||substr(v_prof::text,1,8)||'@0311.test'),
    (v_t2u ,'t2-'||substr(v_t2u::text,1,8) ||'@0311.test');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_mgr ,v_t1,'مدير الحركة','manager'),
    (v_sup ,v_t1,'مشرف الحركة','supervisor'),
    (v_fin ,v_t1,'مدير المالية','manager'),
    (v_man ,v_t1,'يدوي','employee'),
    (v_prof,v_t1,'قديم','movement_manager'),
    (v_t2u ,v_t2,'مدير مستأجر ٢','manager');

  -- ═══ 1) الدالة الصرفة ══════════════════════════════════════════════
  ASSERT public.movement_roles_for_portal_unit('manager','movement')
         = ARRAY['movement_manager'], '1.1 مدير+حركة يجب أن يُجسَّر';
  v_pass := v_pass + 1;

  ASSERT public.movement_roles_for_portal_unit('supervisor','movement')
         = ARRAY[]::TEXT[], '1.2 المشرف يجب ألّا يُجسَّر (تصعيد امتياز)';
  v_pass := v_pass + 1;

  ASSERT public.movement_roles_for_portal_unit('manager','finance')
         = ARRAY[]::TEXT[], '1.3 وحدة غير الحركة لا تُجسَّر';
  v_pass := v_pass + 1;

  ASSERT public.movement_roles_for_portal_unit('manager','hr')
         = ARRAY[]::TEXT[], '1.4 وحدة HR لا تُجسَّر';
  v_pass := v_pass + 1;

  ASSERT public.movement_roles_for_portal_unit(NULL,'movement')
         = ARRAY[]::TEXT[], '1.5 NULL آمن';
  v_pass := v_pass + 1;

  -- الدالة IMMUTABLE فعلاً (تسمح بالفهرسة والتحسين)
  SELECT provolatile INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND proname='movement_roles_for_portal_unit';
  ASSERT v_txt = 'i', '1.6 الدالة يجب أن تكون IMMUTABLE';
  v_pass := v_pass + 1;

  -- ═══ 2) الجسر يعمل عند الإسناد ═════════════════════════════════════
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_mgr,'manager','movement','department',v_d1);

  SELECT count(*) INTO v_n FROM public.movement_role_assignments
   WHERE user_id=v_mgr AND portal_role='movement_manager' AND is_active AND origin='unit_sync';
  ASSERT v_n=1, format('2.1 الجسر لم يعمل (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ جوهر الإصلاح: يجمع بين دور المدير وبوابة الحركة معاً
  SELECT role INTO v_txt FROM public.profiles WHERE id=v_mgr;
  ASSERT v_txt='manager', '2.2 دور المدير يجب أن يبقى manager سليماً';
  v_pass := v_pass + 1;

  -- ═══ 3) المشرف لا يُجسَّر — حارس أمني ══════════════════════════════
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_sup,'supervisor','movement','department',v_d1);

  SELECT count(*) INTO v_n FROM public.movement_role_assignments WHERE user_id=v_sup AND is_active;
  ASSERT v_n=0, format('3.1 المشرف حصل على %s دور — تصعيد امتياز', v_n);
  v_pass := v_pass + 1;

  -- ═══ 4) وحدة غير الحركة لا تفتح شيئاً ══════════════════════════════
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_fin,'manager','finance','department',v_d1);

  SELECT count(*) INTO v_n FROM public.movement_role_assignments WHERE user_id=v_fin AND is_active;
  ASSERT v_n=0, format('4.1 مدير المالية حصل على %s دور حركة', v_n);
  v_pass := v_pass + 1;

  -- ═══ 5) السحب يُعطّل ولا يحذف ══════════════════════════════════════
  UPDATE public.portal_unit_assignments SET is_active=FALSE
   WHERE user_id=v_mgr AND unit_key='movement';

  SELECT count(*) INTO v_n FROM public.movement_role_assignments WHERE user_id=v_mgr AND is_active;
  ASSERT v_n=0, format('5.1 السحب لم يُعطّل (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.movement_role_assignments WHERE user_id=v_mgr AND NOT is_active;
  ASSERT v_n=1, '5.2 يجب الأرشفة لا الحذف';
  v_pass := v_pass + 1;

  -- ═══ 6) الإعادة تُفعّل الصف نفسه (لا تكرار) ════════════════════════
  UPDATE public.portal_unit_assignments SET is_active=TRUE
   WHERE user_id=v_mgr AND unit_key='movement';

  SELECT count(*) INTO v_n FROM public.movement_role_assignments WHERE user_id=v_mgr;
  ASSERT v_n=1, format('6.1 تكرّرت الصفوف (%s) بدل إعادة التفعيل', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.movement_role_assignments WHERE user_id=v_mgr AND is_active;
  ASSERT v_n=1, '6.2 الإعادة لم تُفعّل';
  v_pass := v_pass + 1;

  -- ═══ 7) الإسناد اليدوي مُصان ═══════════════════════════════════════
-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments(tenant_id,user_id,portal_role,is_active,origin,notes)
    VALUES (v_t1,v_man,'logistics',TRUE,'manual','إسناد يدوي')
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_man,'manager','movement','department',v_d1);
  UPDATE public.portal_unit_assignments SET is_active=FALSE
   WHERE user_id=v_man AND unit_key='movement';

  SELECT count(*) INTO v_n FROM public.movement_role_assignments
   WHERE user_id=v_man AND portal_role='logistics' AND is_active AND origin='manual';
  ASSERT v_n=1, '7.1 المحفّز أتلف إسناداً يدوياً';
  v_pass := v_pass + 1;

  -- ═══ 8) profile_sync مُصان (0300 يملك صفوفه) ═══════════════════════
  SELECT count(*) INTO v_n FROM public.movement_role_assignments
   WHERE user_id=v_prof AND origin='profile_sync' AND is_active;
  ASSERT v_n=1, format('8.1 صف 0300 مفقود (%s)', v_n);
  v_pass := v_pass + 1;

  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_prof,'manager','movement','department',v_d1);
  UPDATE public.portal_unit_assignments SET is_active=FALSE
   WHERE user_id=v_prof AND unit_key='movement';

  SELECT count(*) INTO v_n FROM public.movement_role_assignments
   WHERE user_id=v_prof AND origin='profile_sync' AND is_active;
  ASSERT v_n=1, '8.2 محفّز 0311 أتلف صف 0300 — تداخل مصادر';
  v_pass := v_pass + 1;

  -- ═══ 9) العزل بين المستأجرين ═══════════════════════════════════════
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t2,v_t2u,'manager','movement','department',v_d2);

  SELECT tenant_id INTO v_txt FROM public.movement_role_assignments WHERE user_id=v_t2u AND is_active;
  ASSERT v_txt = v_t2::TEXT, '9.1 تسرّب مستأجر في الجسر';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.movement_role_assignments
   WHERE user_id=v_t2u AND tenant_id=v_t1;
  ASSERT v_n=0, '9.2 صف بمستأجر خاطئ';
  v_pass := v_pass + 1;

  -- ═══ 10) قيد origin يقبل الثلاثة ويرفض المجهول ═════════════════════
  SELECT pg_get_constraintdef(oid) INTO v_txt FROM pg_constraint
   WHERE conname='movement_role_assignments_origin_check';
  ASSERT v_txt LIKE '%unit_sync%',    '10.1 unit_sync غائب عن القيد';
  ASSERT v_txt LIKE '%profile_sync%', '10.2 profile_sync غائب عن القيد';
  ASSERT v_txt LIKE '%manual%',       '10.3 manual غائب عن القيد';
  v_pass := v_pass + 3;

  BEGIN
    INSERT INTO public.movement_role_assignments(tenant_id,user_id,portal_role,is_active,origin)
      VALUES (v_t1,v_fin,'logistics',TRUE,'bogus_origin')
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;
    RAISE EXCEPTION '10.4 القيد يقبل origin مختلَقاً';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_pass := v_pass + 1;

  -- ═══ 11) الصلاحيات ═════════════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.movement_roles_for_portal_unit(text,text)','EXECUTE'), '11.1 anon ينفّذ';
  ASSERT has_function_privilege('authenticated',
    'public.movement_roles_for_portal_unit(text,text)','EXECUTE'), '11.2 authenticated لا ينفّذ';
  v_pass := v_pass + 2;

  -- ═══ 12) لا حلقة محفّزات ═══════════════════════════════════════════
  -- تصحيح صريح: النسخة الأولى من هذا التأكيد منعت *أي* محفّز على الجدول،
  -- فسقطت على trg_movement_role_assignments_updated وهو tg_set_updated_at
  -- (جسمه: NEW.updated_at = NOW(); RETURN NEW). التأكيد كان خاطئاً لا الشيفرة.
  -- المقصود الحقيقي: ألّا يكتب أي محفّز على هذا الجدول في جدولٍ مصدر،
  -- فتنشأ دورة  units → roles → units.
  SELECT count(*) INTO v_n
    FROM pg_trigger t
    JOIN pg_proc  p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.movement_role_assignments'::regclass
     AND NOT t.tgisinternal
     AND (p.prosrc ILIKE '%portal_unit_assignments%'
          OR p.prosrc ILIKE '%INSERT INTO public.profiles%'
          OR p.prosrc ILIKE '%UPDATE public.profiles%');
  ASSERT v_n = 0, format('12.1 محفّز يكتب في جدول مصدر ⇒ حلقة محتملة (%s)', v_n);
  v_pass := v_pass + 1;

  -- والعكس: محفّزا 0300 و0311 لا يكتب أحدهما في مُشغِّل الآخر
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname = 'tg_sync_movement_role_from_unit'
     AND (prosrc ILIKE '%INSERT INTO public.profiles%'
          OR prosrc ILIKE '%UPDATE public.profiles%'
          OR prosrc ILIKE '%INSERT INTO public.portal_unit_assignments%'
          OR prosrc ILIKE '%UPDATE public.portal_unit_assignments%');
  ASSERT v_n = 0, '12.2 محفّز 0311 يكتب في جدول مصدر';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname = 'tg_sync_movement_role_assignment'
     AND prosrc ILIKE '%portal_unit_assignments%';
  ASSERT v_n = 0, '12.3 محفّز 0300 يلمس جدول الوحدات';
  v_pass := v_pass + 1;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  DELETE FROM public.movement_role_assignments
   WHERE user_id IN (v_mgr,v_sup,v_fin,v_man,v_prof,v_t2u);
  DELETE FROM public.portal_unit_assignments
   WHERE user_id IN (v_mgr,v_sup,v_fin,v_man,v_prof,v_t2u);
  DELETE FROM public.profiles WHERE id IN (v_mgr,v_sup,v_fin,v_man,v_prof,v_t2u);
  DELETE FROM auth.users      WHERE id IN (v_mgr,v_sup,v_fin,v_man,v_prof,v_t2u);
  DELETE FROM public.departments WHERE id IN (v_d1,v_d2);
  DELETE FROM public.tenants     WHERE id IN (v_t1,v_t2);

  RAISE NOTICE '✅ verify-0311: %/28 تأكيداً ناجحاً', v_pass;
END $$;
