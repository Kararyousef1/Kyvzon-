-- ============================================================================
-- Kyvzon — 0154_add_marketing_role.sql
-- إضافة دور "marketing" كدور نظام (لبوابة التسويق الجديدة).
--
-- السياق: بوابة التسويق تُفعَّل كوحدة (marketing) وتحتاج دوراً يستخدمها فريق
-- التسويق في الشركة المشتركة. نوسّع قيد profiles.role ليقبل 'marketing'.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'employee', 'hr', 'manager', 'supervisor', 'admin',
    'gatekeeper', 'developer', 'it_admin', 'tech', 'finance', 'marketing'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
      AND pg_get_constraintdef(oid) LIKE '%marketing%'
  ) THEN
    RAISE EXCEPTION '0154 assertion failed: marketing role not permitted';
  END IF;
  RAISE NOTICE '0154 OK: marketing role added to profiles constraint.';
END $$;
