-- ============================================================================
-- Kyvzon — 0181_add_procurement_role.sql
-- إضافة دور "procurement" كدور نظام (لبوابة المشتريات الجديدة).
--
-- السياق: بوابة المشتريات تُفعَّل كوحدة (procurement) ويديرها فريق المشتريات
-- (دور procurement). نوسّع قيد profiles.role ليقبل 'procurement'.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'employee', 'hr', 'manager', 'supervisor', 'admin',
    'gatekeeper', 'developer', 'it_admin', 'tech', 'finance', 'marketing', 'sales', 'procurement'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
      AND pg_get_constraintdef(oid) LIKE '%procurement%'
  ) THEN
    RAISE EXCEPTION '0181 assertion failed: procurement role not permitted';
  END IF;
  RAISE NOTICE '0181 OK: procurement role added to profiles constraint.';
END $$;
