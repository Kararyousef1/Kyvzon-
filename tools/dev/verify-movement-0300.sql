-- ============================================================================
-- FILE: tools/dev/verify-movement-0300.sql
-- PURPOSE: اختبار سلوكي لمزامنة profiles.role ↔ movement_role_assignments
-- USAGE:   psql -d <db> -f tools/dev/verify-movement-0300.sql
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

-- نستخدم جدولاً مؤقتاً لتجميع النتائج بدل دوال مساعدة
CREATE TEMP TABLE IF NOT EXISTS v0300_results (
  seq     SERIAL,
  name    TEXT,
  passed  BOOLEAN,
  detail  TEXT
) ON COMMIT PRESERVE ROWS;

TRUNCATE v0300_results;

DO $$
DECLARE
  v_tenant UUID;
  v_u1 UUID := gen_random_uuid();  -- movement_manager من البداية
  v_u2 UUID := gen_random_uuid();  -- employee ثم يتدرّج
  v_u3 UUID := gen_random_uuid();  -- إسناد يدوي محفوظ
  v_u4 UUID := gen_random_uuid();  -- بلا مستأجر
  v_cnt INT;
  v_txt TEXT;
BEGIN
  -- ── تهيئة مستأجر معزول للاختبار ────────────────────────────────────────
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر اختبار 0300', 'verify-0300-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO v_tenant;

  INSERT INTO auth.users (id, email) VALUES
    (v_u1, 'v0300-mgr@test.local'),
    (v_u2, 'v0300-step@test.local'),
    (v_u3, 'v0300-manual@test.local'),
    (v_u4, 'v0300-notenant@test.local');

  -- ══ 1) INSERT بدور movement_manager يُنشئ الإسناد فوراً ═════════════════
  INSERT INTO public.profiles (id, tenant_id, full_name, email, role)
  VALUES (v_u1, v_tenant, 'مدير حركة', 'v0300-mgr@test.local', 'movement_manager');

  SELECT count(*) INTO v_cnt
    FROM public.movement_role_assignments
   WHERE user_id = v_u1 AND portal_role = 'movement_manager'
     AND is_active AND origin = 'profile_sync';
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('INSERT بدور movement_manager يُنشئ إسناداً فعّالاً', v_cnt = 1, 'count=' || v_cnt);

  -- ══ 2) الإسناد الجديد يحمل origin = profile_sync ═══════════════════════
  SELECT origin INTO v_txt FROM public.movement_role_assignments
   WHERE user_id = v_u1 AND portal_role = 'movement_manager';
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('الإسناد التلقائي يُوسم profile_sync', v_txt = 'profile_sync', 'origin=' || COALESCE(v_txt,'NULL'));

  -- ══ 3) employee لا يُنشئ إسناداً ═══════════════════════════════════════
  INSERT INTO public.profiles (id, tenant_id, full_name, email, role)
  VALUES (v_u2, v_tenant, 'موظف', 'v0300-step@test.local', 'employee');

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments WHERE user_id = v_u2;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('دور employee لا يُنشئ أي إسناد', v_cnt = 0, 'count=' || v_cnt);

  -- ══ 4) الترقية إلى logistics تُنشئ الإسناد ═════════════════════════════
  UPDATE public.profiles SET role = 'logistics' WHERE id = v_u2;

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u2 AND portal_role = 'logistics' AND is_active;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('الترقية employee→logistics تُنشئ إسناداً فعّالاً', v_cnt = 1, 'count=' || v_cnt);

  -- ══ 5) تبديل الدور يُعطّل القديم ═══════════════════════════════════════
  UPDATE public.profiles SET role = 'employee_movement' WHERE id = v_u2;

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u2 AND portal_role = 'logistics' AND is_active = FALSE;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('تبديل الدور يُعطّل الإسناد القديم', v_cnt = 1, 'inactive logistics=' || v_cnt);

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u2 AND portal_role = 'employee_movement' AND is_active;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('تبديل الدور يُفعّل الإسناد الجديد', v_cnt = 1, 'active emp_mov=' || v_cnt);

  -- ══ 6) لا حذف نهائي — الصف القديم موجود بـ is_active=FALSE ════════════
  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u2 AND portal_role = 'logistics';
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('لا حذف نهائي — الصف القديم محفوظ', v_cnt = 1, 'rows=' || v_cnt);

  -- ══ 7) سحب الدور يُعطّل كل الإسنادات التلقائية ════════════════════════
  UPDATE public.profiles SET role = 'employee' WHERE id = v_u2;

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u2 AND is_active;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('سحب الدور يُعطّل كل الإسنادات التلقائية', v_cnt = 0, 'active=' || v_cnt);

  -- ══ 8) صون الإسناد اليدوي ═════════════════════════════════════════════
  INSERT INTO public.profiles (id, tenant_id, full_name, email, role)
  VALUES (v_u3, v_tenant, 'يدوي', 'v0300-manual@test.local', 'employee');

-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments
    (tenant_id, user_id, portal_role, is_active, origin)
  VALUES (v_tenant, v_u3, 'logistics', TRUE, 'manual')
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;

  -- تغيير الدور ثم سحبه: اليدوي يجب أن يصمد للحالتين
  UPDATE public.profiles SET role = 'employee_movement' WHERE id = v_u3;
  UPDATE public.profiles SET role = 'employee' WHERE id = v_u3;

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u3 AND portal_role = 'logistics' AND is_active AND origin = 'manual';
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('الإسناد اليدوي يصمد أمام تغيير وسحب الدور', v_cnt = 1, 'active manual=' || v_cnt);

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u3 AND portal_role = 'employee_movement' AND is_active = FALSE;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('الإسناد التلقائي وحده يُعطَّل عند السحب', v_cnt = 1, 'inactive sync=' || v_cnt);

  -- ══ 9) profile بلا tenant_id لا يكسر المحفّز ══════════════════════════
  BEGIN
    INSERT INTO public.profiles (id, tenant_id, full_name, email, role)
    VALUES (v_u4, NULL, 'بلا مستأجر', 'v0300-notenant@test.local', 'logistics');
    INSERT INTO v0300_results(name, passed, detail) VALUES
      ('profile بلا tenant_id لا يكسر المحفّز', TRUE, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO v0300_results(name, passed, detail) VALUES
      ('profile بلا tenant_id لا يكسر المحفّز', FALSE, SQLERRM);
  END;

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments WHERE user_id = v_u4;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('profile بلا tenant_id لا يُنشئ إسناداً', v_cnt = 0, 'count=' || v_cnt);

  -- ══ 10) أدوار المنصة لا تُنشئ إسناداً ═════════════════════════════════
  UPDATE public.profiles SET role = 'admin' WHERE id = v_u1;

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u1 AND is_active;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('دور admin يُعطّل الإسناد التلقائي (له مسار منصة منفصل)', v_cnt = 0, 'active=' || v_cnt);

  -- ══ 11) استرجاع الدور يُعيد التفعيل ═══════════════════════════════════
  UPDATE public.profiles SET role = 'movement_manager' WHERE id = v_u1;

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u1 AND portal_role = 'movement_manager' AND is_active;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('استرجاع الدور يُعيد تفعيل الإسناد', v_cnt = 1, 'active=' || v_cnt);

  -- ══ 12) لا تكرار صفوف بعد كل هذه الدورات ══════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u1 AND portal_role = 'movement_manager';
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('لا تكرار صفوف رغم دورات التبديل', v_cnt = 1, 'rows=' || v_cnt);

  -- ══ 13) الدالة الصرفة تعطي التحويل الصحيح ═════════════════════════════
  INSERT INTO v0300_results(name, passed, detail)
  SELECT 'movement_roles_for_profile_role(movement_manager)',
         public.movement_roles_for_profile_role('movement_manager') = ARRAY['movement_manager'],
         array_to_string(public.movement_roles_for_profile_role('movement_manager'), ',');

  INSERT INTO v0300_results(name, passed, detail)
  SELECT 'movement_roles_for_profile_role(employee) فارغة',
         public.movement_roles_for_profile_role('employee') = ARRAY[]::TEXT[],
         'len=' || array_length(public.movement_roles_for_profile_role('employee'), 1);

  INSERT INTO v0300_results(name, passed, detail)
  SELECT 'movement_roles_for_profile_role(admin) فارغة',
         public.movement_roles_for_profile_role('admin') = ARRAY[]::TEXT[],
         'ok';

  -- ══ 14) قيد origin يرفض القيم الغريبة ═════════════════════════════════
  BEGIN
    INSERT INTO public.movement_role_assignments
      (tenant_id, user_id, portal_role, is_active, origin)
    VALUES (v_tenant, v_u2, 'logistics', TRUE, 'bogus_origin')
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;
    INSERT INTO v0300_results(name, passed, detail) VALUES
      ('قيد origin يرفض القيم غير المسموحة', FALSE, 'قُبلت قيمة غريبة!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO v0300_results(name, passed, detail) VALUES
      ('قيد origin يرفض القيم غير المسموحة', TRUE, 'رُفضت كما يجب');
  END;

  -- ══ 15) المحفّز موجود على profiles ════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM pg_trigger
   WHERE tgname = 'trg_sync_movement_role_assignment'
     AND tgrelid = 'public.profiles'::regclass;
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('المحفّز مُثبَّت على public.profiles', v_cnt = 1, 'count=' || v_cnt);

  -- ══ 16) anon لا ينفّذ الدالة ══════════════════════════════════════════
  INSERT INTO v0300_results(name, passed, detail)
  SELECT 'anon لا ينفّذ movement_roles_for_profile_role',
         NOT has_function_privilege('anon', 'public.movement_roles_for_profile_role(text)', 'EXECUTE'),
         'checked';

  -- ══ 17) لا يتيم: كل ذي دور حركة له إسناد ══════════════════════════════
  SELECT count(*) INTO v_cnt
    FROM public.profiles p
   WHERE p.tenant_id IS NOT NULL
     AND p.role IN ('employee_movement','logistics','movement_manager')
     AND NOT EXISTS (
       SELECT 1 FROM public.movement_role_assignments a
        WHERE a.user_id = p.id AND a.is_active
     );
  INSERT INTO v0300_results(name, passed, detail) VALUES
    ('لا يوجد profile بدور حركة بلا إسناد فعّال', v_cnt = 0, 'orphans=' || v_cnt);

  -- ── تنظيف بيانات الاختبار ──────────────────────────────────────────────
  DELETE FROM public.movement_role_assignments WHERE user_id IN (v_u1,v_u2,v_u3,v_u4);
  DELETE FROM public.profiles WHERE id IN (v_u1,v_u2,v_u3,v_u4);
  DELETE FROM auth.users WHERE id IN (v_u1,v_u2,v_u3,v_u4);
  DELETE FROM public.tenants WHERE id = v_tenant;
END $$;

-- ─── التقرير ────────────────────────────────────────────────────────────
SELECT
  seq AS "#",
  CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
  name AS "الاختبار",
  detail AS "التفصيل"
FROM v0300_results
ORDER BY seq;

DO $$
DECLARE
  v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM v0300_results;

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  0300 verify: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ 0300 verify: % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
