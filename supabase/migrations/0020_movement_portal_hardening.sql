-- ============================================================================
--  FILE: 0020_movement_portal_hardening.sql
--  PURPOSE: Movement Portal hardening: align movements_log with UI/SDK contract
--  SCOPE: Existing movement/gatekeeper portal only
-- ============================================================================

ALTER TABLE public.movements_log
  ADD COLUMN IF NOT EXISTS employee_name VARCHAR(250),
  ADD COLUMN IF NOT EXISTS department VARCHAR(200),
  ADD COLUMN IF NOT EXISTS logged_by_id UUID,
  ADD COLUMN IF NOT EXISTS expected_return_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_location VARCHAR(300),
  ADD COLUMN IF NOT EXISTS route_violation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_movements_log_active_out
  ON public.movements_log(tenant_id, departure_at DESC) WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_movements_log_route_violation
  ON public.movements_log(tenant_id, route_violation, departure_at DESC);

DROP TRIGGER IF EXISTS trg_movements_log_updated_at ON public.movements_log;
CREATE TRIGGER trg_movements_log_updated_at
  BEFORE UPDATE ON public.movements_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'movements_log' AND column_name = 'employee_name'
  );
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'movements_log' AND column_name = 'route_violation'
  );
END $$;
