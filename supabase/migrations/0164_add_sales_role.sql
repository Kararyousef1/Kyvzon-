-- ============================================================================
-- Kyvzon — 0164_add_sales_role.sql
-- إضافة دور "sales" كدور نظام (لبوابة CRM الجديدة).
--
-- السياق: بوابة CRM تُفعَّل كوحدة (crm) ويديرها فريق المبيعات (دور sales).
-- نوسّع قيد profiles.role ليقبل 'sales'.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'employee', 'hr', 'manager', 'supervisor', 'admin',
    'gatekeeper', 'developer', 'it_admin', 'tech', 'finance', 'marketing', 'sales'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
      AND pg_get_constraintdef(oid) LIKE '%sales%'
  ) THEN
    RAISE EXCEPTION '0164 assertion failed: sales role not permitted';
  END IF;
  RAISE NOTICE '0164 OK: sales role added to profiles constraint.';
END $$;
