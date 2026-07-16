-- ============================================================================
--  FILE: 0021_movement_permits.sql
--  PURPOSE: Movement Portal improvement: pre-approved employee movement permits
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.movement_permits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  employee_name        VARCHAR(250),
  department           VARCHAR(200),
  destination          VARCHAR(300) NOT NULL,
  purpose              TEXT,
  valid_from           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until          TIMESTAMPTZ NOT NULL,
  max_duration_minutes INTEGER NOT NULL DEFAULT 30,
  status               VARCHAR(30) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'used', 'expired', 'cancelled')),
  approved_by          UUID,
  created_by           UUID,
  movement_id          UUID,
  used_at              TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movement_permits_active
  ON public.movement_permits(tenant_id, employee_id, status, valid_until);
CREATE INDEX IF NOT EXISTS idx_movement_permits_destination
  ON public.movement_permits(tenant_id, destination, valid_until);

ALTER TABLE public.movement_permits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_movement_permits_select ON public.movement_permits;
CREATE POLICY kyvzon_movement_permits_select ON public.movement_permits
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
      OR employee_id = auth.uid()
      OR employee_id = public.current_user_employee_id()
    )
  );

DROP POLICY IF EXISTS kyvzon_movement_permits_write ON public.movement_permits;
CREATE POLICY kyvzon_movement_permits_write ON public.movement_permits
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR public.current_user_role() = 'gatekeeper')
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR public.current_user_role() = 'gatekeeper')
  );

DROP TRIGGER IF EXISTS trg_movement_permits_updated_at ON public.movement_permits;
CREATE TRIGGER trg_movement_permits_updated_at
  BEFORE UPDATE ON public.movement_permits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='movement_permits');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='movement_permits'), 'RLS must be enabled';
END $$;
