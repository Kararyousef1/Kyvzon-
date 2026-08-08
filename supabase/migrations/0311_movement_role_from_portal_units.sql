-- ============================================================================
-- FILE: 0311_movement_role_from_portal_units.sql
-- PURPOSE: عكس اتجاه الحقيقة — وحدات البوابة تُغذّي أدوار الحركة القديمة
--
-- ─────────────────────────────────────────────────────────────────────────
-- العطل المُثبَت تشغيلياً (2026-08-05، Postgres 17 محلي، قاعدة نظيفة):
--
--   INSERT profiles(role='manager')                    ⇒ إسنادات حركة = 0 ✅ متوقَّع
--   INSERT portal_unit_assignments(manager, movement)  ⇒ إسنادات حركة = 0 ❌ العطل
--
--   أي أن مديراً مُسنَدة إليه وحدة الحركة بالمعمارية الجديدة (0302) لا يملك
--   أي حق في بوابة الحركة القديمة. المزامنة كانت **باتجاه واحد**:
--
--     0300:  profiles.role ──────────────► movement_role_assignments
--     0302:  portal_unit_assignments ────► (لا شيء)   ← الفجوة
--
--   والنتيجة العملية: لإعطاء مدير صلاحية الحركة كان لا بد من تغيير
--   profiles.role إلى 'movement_manager' — وهو ما يُلغي دوره 'manager'
--   ويُفقده بوابة المدير كاملةً (دور واحد لكل مستخدم في profiles.role).
--   استحالة الجمع بين الدورين هي بعينها المشكلة التي تُحلّ هنا.
--
-- ─────────────────────────────────────────────────────────────────────────
-- القرار المعماري: (ج) جسر ثم هجرة
--
--   ❌ (أ) تجميد        — التناقض يعود مع كل بوابة جديدة
--   ❌ (ب) هجرة كاملة   — تكسر 34 استدعاء movement_require_role('logistics') فوراً
--   ✅ (ج) جسر         — القديم يعمل بلا تعديل، والجديد يصير مصدر الحقيقة
--
--   بعد هذا المايجريشن يصبح 'movement_manager' **دوراً مُشتقّاً لا مُسنَداً**:
--   لا أحد يحتاج كتابته في profiles.role؛ يكفي إسناد وحدة الحركة للمدير.
--   ويموت الدور طبيعياً يوم تُسقَط البوابة القديمة (قرار «الإيقاف التدريجي»).
--
-- ─────────────────────────────────────────────────────────────────────────
-- قرار أمني صريح: المشرف لا يُجسَّر
--
--   supervisor + movement ⇒ **لا** إسناد في البوابة القديمة.
--   السبب: أصغر دور هناك ('employee_movement') يفتح 7 صفحات تشمل اعتماد
--   التصاريح وإدارة السياسات. والمشرف — بنص فلسفة النظام في 0307 —
--   «يتابع التنفيذ اليومي ولا يعتمد نهائياً». جسرُه تصعيدُ امتياز صامت.
--   المشرف يعمل عبر وحدته الحديثة (SupervisorMovementShiftPage) وحدها.
--
-- ─────────────────────────────────────────────────────────────────────────
-- لماذا لا تنشأ حلقة محفّزات:
--   0300:  profiles              ──► movement_role_assignments   (origin=profile_sync)
--   0311:  portal_unit_assignments ─► movement_role_assignments  (origin=unit_sync)
--   لا محفّز يكتب في portal_unit_assignments ولا في profiles انطلاقاً من
--   movement_role_assignments. الرسم البياني شجرة لا دورة.
--
-- كل origin يملك صفوفه ولا يلمس صفوف غيره:
--   manual      = أُسنِد يدوياً        (لا يمسّه أي محفّز)
--   profile_sync = من profiles.role     (يملكه 0300)
--   unit_sync    = من وحدات البوابة     (يملكه 0311)
-- ============================================================================

-- ═══ 1) توسيع قيد origin ليقبل المصدر الثالث ════════════════════════════
ALTER TABLE public.movement_role_assignments
  DROP CONSTRAINT IF EXISTS movement_role_assignments_origin_check;

ALTER TABLE public.movement_role_assignments
  ADD CONSTRAINT movement_role_assignments_origin_check
  CHECK (origin IN ('manual', 'profile_sync', 'unit_sync'));

COMMENT ON COLUMN public.movement_role_assignments.origin IS
  'مصدر الإسناد: manual = يدوي (لا يمسّه محفّز) · profile_sync = من profiles.role (0300) · unit_sync = من portal_unit_assignments (0311)';

-- ═══ 2) دالة التحويل: وحدة بوابة ⇒ دور حركة ═════════════════════════════
-- صرفة (IMMUTABLE) فتُختبر مباشرة بلا حالة ولا صفوف.
DROP FUNCTION IF EXISTS public.movement_roles_for_portal_unit(TEXT, TEXT);

CREATE FUNCTION public.movement_roles_for_portal_unit(
  p_base_role TEXT,
  p_unit_key  TEXT
)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    -- المدير على وحدة الحركة يشرف على الدورين معاً (نفس دلالة 0282:124)
    WHEN p_unit_key = 'movement' AND p_base_role = 'manager'
      THEN ARRAY['movement_manager']
    -- المشرف عمداً لا يُجسَّر — انظر «قرار أمني صريح» أعلاه
    ELSE ARRAY[]::TEXT[]
  END;
$$;

COMMENT ON FUNCTION public.movement_roles_for_portal_unit(TEXT, TEXT) IS
  'يحوّل إسناد وحدة بوابة إلى أدوار بوابة الحركة القديمة. المدير على وحدة movement فقط؛ المشرف يعيد مصفوفة فارغة عمداً (منع تصعيد امتياز).';

REVOKE ALL ON FUNCTION public.movement_roles_for_portal_unit(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_roles_for_portal_unit(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.movement_roles_for_portal_unit(TEXT, TEXT)
  TO authenticated, service_role;

-- ═══ 3) دالة المزامنة ═══════════════════════════════════════════════════
-- تُعيد حساب أدوار unit_sync للمستخدم كاملةً من كل وحداته النشطة.
-- إعادة الحساب الكلي أمتن من التعديل التفاضلي: تعالج INSERT و UPDATE
-- و«التعطيل» بمسار واحد، فلا تتسرّب حالة بين الفروع.
CREATE OR REPLACE FUNCTION public.tg_sync_movement_role_from_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID;
  v_tenant UUID;
  v_target TEXT[];
  v_role   TEXT;
BEGIN
  -- عند UPDATE قد يتغيّر user_id؛ نعالج الصفّين لئلا يبقى القديم معلّقاً.
  FOREACH v_user IN ARRAY (
    CASE
      WHEN TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id
        THEN ARRAY[OLD.user_id, NEW.user_id]
      ELSE ARRAY[NEW.user_id]
    END
  ) LOOP
    SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id = v_user;
    CONTINUE WHEN v_tenant IS NULL;

    -- كل أدوار الحركة المستحقّة من مجموع وحدات هذا المستخدم النشطة
    SELECT COALESCE(array_agg(DISTINCT r.role), ARRAY[]::TEXT[])
      INTO v_target
      FROM public.portal_unit_assignments a
     CROSS JOIN LATERAL unnest(
       public.movement_roles_for_portal_unit(a.base_role::TEXT, a.unit_key::TEXT)
     ) AS r(role)
     WHERE a.user_id   = v_user
       AND a.tenant_id = v_tenant
       AND a.is_active = TRUE;

    -- (أ) تعطيل ما اشتُقّ من الوحدات ولم يعد مستحقاً — لا حذف نهائي
    UPDATE public.movement_role_assignments m
       SET is_active  = FALSE,
           updated_at = NOW()
     WHERE m.user_id   = v_user
       AND m.origin    = 'unit_sync'
       AND m.is_active = TRUE
       AND NOT (m.portal_role = ANY (v_target));

    -- (ب) إنشاء/تفعيل المستحق
    FOREACH v_role IN ARRAY v_target LOOP
      INSERT INTO public.movement_role_assignments
        (tenant_id, user_id, portal_role, is_active, origin, notes)
      VALUES
        (v_tenant, v_user, v_role, TRUE, 'unit_sync',
         'مزامنة تلقائية 0311 من وحدة بوابة المدير')
      ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE
        SET is_active  = TRUE,
            updated_at = NOW();
      -- origin لا يُلمس: إن كان الصف يدوياً أو من profiles يبقى ملكاً لصاحبه،
      -- فلا يُعطّله محفّزنا لاحقاً عند سحب الوحدة.
    END LOOP;
  END LOOP;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_sync_movement_role_from_unit() IS
  'يزامن movement_role_assignments مع portal_unit_assignments. يصون الإسناد اليدوي و profile_sync.';

DROP TRIGGER IF EXISTS trg_sync_movement_role_from_unit ON public.portal_unit_assignments;
CREATE TRIGGER trg_sync_movement_role_from_unit
  AFTER INSERT OR UPDATE OF user_id, base_role, unit_key, is_active
  ON public.portal_unit_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_movement_role_from_unit();

-- ═══ 4) ترحيل أثري: كل من يملك وحدة الحركة اليوم ════════════════════════
DO $$
DECLARE v_n INT := 0;
BEGIN
  INSERT INTO public.movement_role_assignments
    (tenant_id, user_id, portal_role, is_active, origin, notes)
  SELECT DISTINCT a.tenant_id, a.user_id, r.role, TRUE, 'unit_sync',
         'ترحيل أثري 0311 من portal_unit_assignments'
    FROM public.portal_unit_assignments a
   CROSS JOIN LATERAL unnest(
     public.movement_roles_for_portal_unit(a.base_role::TEXT, a.unit_key::TEXT)
   ) AS r(role)
   WHERE a.is_active = TRUE
  ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE
    SET is_active = TRUE, updated_at = NOW();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '0311: رُحِّل % إسناد حركة من وحدات البوابة', v_n;
END $$;

-- ═══ 5) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_t     UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_sup   UUID := gen_random_uuid();
  v_d     UUID := gen_random_uuid();
  v_slug  TEXT := 'guard-0311-' || substr(v_t::TEXT, 1, 8);
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_sync_movement_role_from_unit'
       AND tgrelid = 'public.portal_unit_assignments'::regclass
  ), '0311 failed: trigger missing';

  -- لا حِمل زائد (إضافة معامل بـ DEFAULT تُنشئ توقيعاً ثانياً صامتاً)
  SELECT count(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'movement_roles_for_portal_unit';
  ASSERT v_cnt = 1, format('0311 failed: overloads = %s (must be 1)', v_cnt);

  -- الدالة الصرفة: المدير يُجسَّر، المشرف لا
  ASSERT public.movement_roles_for_portal_unit('manager', 'movement')
         = ARRAY['movement_manager'], '0311 failed: manager+movement must bridge';
  ASSERT public.movement_roles_for_portal_unit('supervisor', 'movement')
         = ARRAY[]::TEXT[], '0311 failed: supervisor MUST NOT bridge (privilege escalation)';
  ASSERT public.movement_roles_for_portal_unit('manager', 'finance')
         = ARRAY[]::TEXT[], '0311 failed: non-movement unit must not bridge';

  -- اختبار سلوكي كامل داخل المايجريشن (plpgsql يؤجّل فحص الأعمدة،
  -- فالتشغيل الفعلي وحده يكشف الأخطاء)
  INSERT INTO public.tenants(id, name, name_ar, slug)
    VALUES (v_t, 'Guard 0311', 'حارس 0311', v_slug);
  INSERT INTO public.departments(id, tenant_id, name_ar) VALUES (v_d, v_t, 'قسم الحارس');
  INSERT INTO auth.users(id, email) VALUES
    (v_u,   'guard-mgr-' || substr(v_u::TEXT,1,8)   || '@0311.test'),
    (v_sup, 'guard-sup-' || substr(v_sup::TEXT,1,8) || '@0311.test');
  INSERT INTO public.profiles(id, tenant_id, full_name, role) VALUES
    (v_u,   v_t, 'مدير الحارس', 'manager'),
    (v_sup, v_t, 'مشرف الحارس', 'supervisor');

  -- المدير: إسناد الوحدة يجب أن يفتح البوابة القديمة
  INSERT INTO public.portal_unit_assignments
    (tenant_id, user_id, base_role, unit_key, scope_type, scope_id)
    VALUES (v_t, v_u, 'manager', 'movement', 'department', v_d);

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u AND portal_role = 'movement_manager'
     AND is_active AND origin = 'unit_sync';
  ASSERT v_cnt = 1, format('0311 failed: manager bridge did not fire (%s)', v_cnt);

  -- المشرف: يجب ألّا يُفتح له شيء
  INSERT INTO public.portal_unit_assignments
    (tenant_id, user_id, base_role, unit_key, scope_type, scope_id)
    VALUES (v_t, v_sup, 'supervisor', 'movement', 'department', v_d);

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_sup AND is_active;
  ASSERT v_cnt = 0, format('0311 failed: supervisor got %s movement role(s) — escalation', v_cnt);

  -- سحب الوحدة يُعطّل الدور المشتقّ (لا حذف نهائي)
  UPDATE public.portal_unit_assignments SET is_active = FALSE
   WHERE user_id = v_u AND unit_key = 'movement';

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u AND is_active;
  ASSERT v_cnt = 0, format('0311 failed: revoke did not deactivate (%s)', v_cnt);

  SELECT count(*) INTO v_cnt FROM public.movement_role_assignments
   WHERE user_id = v_u AND NOT is_active;
  ASSERT v_cnt = 1, '0311 failed: row must be archived not deleted';

  -- تنظيف مسبار الحارس
  DELETE FROM public.movement_role_assignments WHERE user_id IN (v_u, v_sup);
  DELETE FROM public.portal_unit_assignments   WHERE user_id IN (v_u, v_sup);
  DELETE FROM public.profiles                  WHERE id      IN (v_u, v_sup);
  DELETE FROM auth.users                       WHERE id      IN (v_u, v_sup);
  DELETE FROM public.departments               WHERE id      =  v_d;
  DELETE FROM public.tenants                   WHERE id      =  v_t;

  ASSERT NOT has_function_privilege('anon',
    'public.movement_roles_for_portal_unit(text,text)', 'EXECUTE'),
    '0311 failed: anon can execute bridge function';

  RAISE NOTICE '✅ 0311: وحدات البوابة تُغذّي أدوار الحركة — movement_manager صار مُشتقّاً لا مُسنَداً';
END $$;
