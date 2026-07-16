-- ============================================================================
--  FILE: 0025_employee_breaks_supervisor_contract.sql
--  PURPOSE: Align employee_breaks DB contract with Supervisor Breaks portal
--  DEPENDS ON: 0002_employee_features.sql, 0007_support_and_security.sql,
--              0010_platform_tenant_rls_audit.sql
--  SAFETY LEVEL: HIGH — idempotent, tenant-scoped RLS, no destructive changes
-- ============================================================================
--
--  Context:
--    SupervisorBreaksPage issues and lists short break permits. The UI uses
--    supervisor_id, destination, duration_minutes, names and return timestamps,
--    while the original 0002 table only had the core attendance break columns.
--
--  Security:
--    Replaces the generic staff-only policy created in 0010 for this table with
--    a narrower domain policy:
--      - staff can manage tenant records;
--      - supervisor/manager can manage records they issued (supervisor_id=auth.uid());
--      - employee can read own break records through current_user_employee_id().
-- ============================================================================

ALTER TABLE IF EXISTS public.employee_breaks
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_name TEXT,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (duration_minutes BETWEEN 1 AND 720),
  ADD COLUMN IF NOT EXISTS out_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_employee_breaks_tenant_supervisor_created
  ON public.employee_breaks(tenant_id, supervisor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_breaks_tenant_status_created
  ON public.employee_breaks(tenant_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_employee_breaks_updated_at ON public.employee_breaks;
CREATE TRIGGER trg_employee_breaks_updated_at
  BEFORE UPDATE ON public.employee_breaks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.employee_breaks ENABLE ROW LEVEL SECURITY;

-- Drop generic policies from 0010 and any prior contract attempts.
DROP POLICY IF EXISTS kyvzon_employee_breaks_select ON public.employee_breaks;
DROP POLICY IF EXISTS kyvzon_employee_breaks_insert ON public.employee_breaks;
DROP POLICY IF EXISTS kyvzon_employee_breaks_update ON public.employee_breaks;
DROP POLICY IF EXISTS kyvzon_employee_breaks_delete ON public.employee_breaks;
DROP POLICY IF EXISTS kyvzon_employee_breaks_supervisor_select ON public.employee_breaks;
DROP POLICY IF EXISTS kyvzon_employee_breaks_supervisor_insert ON public.employee_breaks;
DROP POLICY IF EXISTS kyvzon_employee_breaks_supervisor_update ON public.employee_breaks;
DROP POLICY IF EXISTS kyvzon_employee_breaks_supervisor_delete ON public.employee_breaks;

CREATE POLICY kyvzon_employee_breaks_supervisor_select ON public.employee_breaks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR supervisor_id = auth.uid()
      OR employee_id = public.current_user_employee_id()
    )
  );

CREATE POLICY kyvzon_employee_breaks_supervisor_insert ON public.employee_breaks
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR supervisor_id = auth.uid()
    )
  );

CREATE POLICY kyvzon_employee_breaks_supervisor_update ON public.employee_breaks
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR supervisor_id = auth.uid()
    )
  );

CREATE POLICY kyvzon_employee_breaks_supervisor_delete ON public.employee_breaks
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR supervisor_id = auth.uid()
    )
  );

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee_breaks'
      AND column_name = 'supervisor_id'
  ), 'employee_breaks.supervisor_id must exist';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee_breaks'
      AND column_name = 'destination'
  ), 'employee_breaks.destination must exist';
END $$;
