-- ============================================================================
-- FILE: 0300_movement_role_assignment_sync.sql
-- PURPOSE: مزامنة تلقائية بين profiles.role و movement_role_assignments
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة التي يحلّها (مُشاهَدة في المتصفح 2026-08-04):
--
--   مستخدم دوره في profiles.role = 'movement_manager' فتح بوابة الحركة
--   فظهرت له: «لم يُسنَد إليك أي دور في بوابة الحركة».
--
--   السبب: نظامان للأدوار لا يعرف أحدهما الآخر.
--     • الشريط العلوي يقرأ  profiles.role                → movement_manager ✅
--     • حارس الصفحة يقرأ    movement_role_assignments    → فارغ ❌
--
--   لم يكن هناك أي رابط: لا محفّز في القاعدة، ولا كود في AdminEmployeesPage
--   (الذي يكتب entity_memberships للمالية لكن لا يكتب movement_role_assignments).
--   فتغيير profiles.role إلى movement_manager لم يكن يُنشئ صف الإسناد إطلاقاً.
--
-- الحل: محفّز AFTER INSERT OR UPDATE OF role ON public.profiles يزامن
--   الجدول تلقائياً مهما كان مصدر التغيير (شاشة الإدارة · Edge Function ·
--   SQL مباشر). هذا أمتن من إصلاح الشاشة وحدها لأنه يغطي كل المسارات.
--
-- ─────────────────────────────────────────────────────────────────────────
-- قرارات تصميمية صريحة:
--
--   1) الإسناد اليدوي مُصان. من مُنح 'logistics' يدوياً في الجدول ثم صار
--      دوره في profiles = 'employee_movement' لا يفقد اللوجستيات، لأن
--      المحفّز يُلغّي فقط الأدوار التي هو نفسه أنشأها (origin='profile_sync').
--
--   2) لا حذف نهائي. إلغاء الدور = is_active=FALSE (سياسة المشروع:
--      archive/cancel/void بدل DELETE).
--
--   3) أدوار المنصة (admin/developer/it_admin) لا تُسنَد هنا؛ لها مسار
--      منفصل في movement_require_role ينفذ RETURN مبكراً.
--
--   4) الترحيل الأثري (backfill) يعالج كل من أُسنِد قبل هذا المايجريشن.
-- ============================================================================

-- ─── 1. عمود المصدر: يميّز الإسناد التلقائي عن اليدوي ──────────────────────
ALTER TABLE public.movement_role_assignments
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'movement_role_assignments_origin_check'
       AND conrelid = 'public.movement_role_assignments'::regclass
  ) THEN
    ALTER TABLE public.movement_role_assignments
      ADD CONSTRAINT movement_role_assignments_origin_check
      CHECK (origin IN ('manual', 'profile_sync'));
  END IF;
END $$;

COMMENT ON COLUMN public.movement_role_assignments.origin IS
  'مصدر الإسناد: manual = أُسنِد يدوياً (لا يمسّه المحفّز) · profile_sync = اشتُقّ من profiles.role';

CREATE INDEX IF NOT EXISTS idx_movement_role_assignments_origin
  ON public.movement_role_assignments(user_id, origin, is_active);

-- ─── 2. دالة تحويل دور الملف الشخصي إلى أدوار البوابة ─────────────────────
-- دالة صرفة (IMMUTABLE) — تُختبر مباشرة بلا حالة.
CREATE OR REPLACE FUNCTION public.movement_roles_for_profile_role(p_profile_role TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_profile_role
    WHEN 'movement_manager'  THEN ARRAY['movement_manager']
    WHEN 'logistics'         THEN ARRAY['logistics']
    WHEN 'employee_movement' THEN ARRAY['employee_movement']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

COMMENT ON FUNCTION public.movement_roles_for_profile_role(TEXT) IS
  'يحوّل profiles.role إلى أدوار بوابة الحركة. أدوار المنصة والأدوار الأخرى تعيد مصفوفة فارغة.';

REVOKE ALL ON FUNCTION public.movement_roles_for_profile_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_roles_for_profile_role(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.movement_roles_for_profile_role(TEXT) TO authenticated, service_role;

-- ─── 3. دالة المزامنة ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_sync_movement_role_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_roles TEXT[];
  v_role         TEXT;
BEGIN
  -- بلا مستأجر لا إسناد ممكن (tenant_id NOT NULL في الجدول)
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_target_roles := public.movement_roles_for_profile_role(NEW.role);

  -- (أ) تعطيل ما اشتُقّ سابقاً ولم يعد مطابقاً — لا حذف نهائي
  UPDATE public.movement_role_assignments a
     SET is_active  = FALSE,
         updated_at = NOW()
   WHERE a.user_id   = NEW.id
     AND a.origin    = 'profile_sync'
     AND a.is_active = TRUE
     AND NOT (a.portal_role = ANY (v_target_roles));

  -- (ب) إنشاء/تفعيل الأدوار المطلوبة
  FOREACH v_role IN ARRAY v_target_roles LOOP
    INSERT INTO public.movement_role_assignments
      (tenant_id, user_id, portal_role, is_active, origin, notes)
    VALUES
      (NEW.tenant_id, NEW.id, v_role, TRUE, 'profile_sync',
       'مزامنة تلقائية من profiles.role = ' || NEW.role)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE
      SET is_active  = TRUE,
          updated_at = NOW();
      -- ملاحظة: لا نلمس origin هنا. إن كان الصف يدوياً أصلاً يبقى يدوياً،
      -- فلا يُلغيه المحفّز لاحقاً عند تغيير الدور.
  END LOOP;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_sync_movement_role_assignment() IS
  'يزامن movement_role_assignments مع profiles.role. يصون الإسناد اليدوي (origin=manual).';

-- ─── 4. المحفّز ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_movement_role_assignment ON public.profiles;
CREATE TRIGGER trg_sync_movement_role_assignment
  AFTER INSERT OR UPDATE OF role, tenant_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_movement_role_assignment();

-- ─── 5. الترحيل الأثري: كل من أُسنِد قبل هذا المايجريشن ──────────────────
DO $$
DECLARE
  v_synced INT := 0;
BEGIN
  INSERT INTO public.movement_role_assignments
    (tenant_id, user_id, portal_role, is_active, origin, notes)
  SELECT p.tenant_id, p.id, r.role, TRUE, 'profile_sync',
         'ترحيل أثري 0300 من profiles.role = ' || p.role
    FROM public.profiles p
   CROSS JOIN LATERAL unnest(public.movement_roles_for_profile_role(p.role)) AS r(role)
   WHERE p.tenant_id IS NOT NULL
  ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE
    SET is_active = TRUE, updated_at = NOW();

  GET DIAGNOSTICS v_synced = ROW_COUNT;
  RAISE NOTICE '0300: رُحِّل % إسناداً أثرياً من profiles.role', v_synced;
END $$;

-- ─── 6. حرّاس التحقق ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_orphans INT;
  v_overloads INT;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_sync_movement_role_assignment'
       AND tgrelid = 'public.profiles'::regclass
  ), '0300 failed: trigger missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='movement_role_assignments'
       AND column_name='origin'
  ), '0300 failed: origin column missing';

  -- لا حِمل زائد على دالة التحويل
  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='movement_roles_for_profile_role';
  ASSERT v_overloads = 1, format('0300 failed: overloads (must be 1) = %s', v_overloads);

  -- كل صاحب دور حركة في profiles له إسناد فعّال
  SELECT count(*) INTO v_orphans
    FROM public.profiles p
   WHERE p.tenant_id IS NOT NULL
     AND p.role IN ('employee_movement','logistics','movement_manager')
     AND NOT EXISTS (
       SELECT 1 FROM public.movement_role_assignments a
        WHERE a.user_id = p.id AND a.is_active = TRUE
     );
  ASSERT v_orphans = 0, format('0300 failed: %s profile(s) with movement role lack assignment', v_orphans);

  -- anon لا ينفّذ
  ASSERT NOT has_function_privilege('anon',
    'public.movement_roles_for_profile_role(text)', 'EXECUTE'),
    '0300 failed: anon can execute movement_roles_for_profile_role';

  RAISE NOTICE '✅ 0300: مزامنة profiles.role ↔ movement_role_assignments مفعَّلة — انتهى انفصال نظامَي الأدوار';
END $$;
