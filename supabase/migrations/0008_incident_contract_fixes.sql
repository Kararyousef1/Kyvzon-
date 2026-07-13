-- ============================================================================
-- Kyvzon Development — 0008_incident_contract_fixes.sql
-- Align incident queries and reporter identity with the frontend contract.
-- ============================================================================

ALTER TABLE IF EXISTS public.incidents
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- The frontend supplies the authenticated profile ID as reported_by.
ALTER TABLE IF EXISTS public.incidents
  DROP CONSTRAINT IF EXISTS incidents_reported_by_fkey;

DO $$
BEGIN
  IF to_regclass('public.incidents') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'incidents_reported_by_profiles_fkey'
        AND conrelid = 'public.incidents'::regclass
    ) THEN
    ALTER TABLE public.incidents
      ADD CONSTRAINT incidents_reported_by_profiles_fkey
      FOREIGN KEY (reported_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_incidents_tenant_employee
  ON public.incidents(tenant_id, employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_user
  ON public.incidents(tenant_id, user_id, created_at DESC);
