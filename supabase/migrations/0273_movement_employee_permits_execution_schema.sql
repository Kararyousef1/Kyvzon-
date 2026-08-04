-- ============================================================================
-- FILE: 0273_movement_employee_permits_execution_schema.sql
-- PURPOSE: Employee Movement - E01 (Permits & QR security) & E02 (Execution & Gate scanning)
-- ============================================================================

-- 1. Enhanced Movement Permits (تصاريح الخروج المسبقة وتأمين QR)
CREATE TABLE IF NOT EXISTS public.employee_movement_permits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  destination_id       UUID REFERENCES public.movement_locations(id),
  destination_name     VARCHAR(200) NOT NULL,
  purpose              TEXT NOT NULL,
  valid_from           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until          TIMESTAMPTZ NOT NULL,
  max_duration_minutes INTEGER NOT NULL DEFAULT 30,
  qr_token             VARCHAR(250) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status               VARCHAR(30) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'used', 'expired', 'cancelled', 'rejected')),
  approved_by          UUID,
  created_by           UUID,
  movement_id          UUID,
  used_at              TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_movement_permits_active
  ON public.employee_movement_permits(tenant_id, employee_id, status, valid_until);

CREATE INDEX IF NOT EXISTS idx_emp_movement_permits_qr
  ON public.employee_movement_permits(tenant_id, qr_token);

-- 2. Movement Execution & Gate Control (تنفيذ الحركة والبوابة ومسح QR)
CREATE TABLE IF NOT EXISTS public.employee_movements_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  permit_id            UUID REFERENCES public.employee_movement_permits(id),
  destination_name     VARCHAR(200) NOT NULL,
  purpose              TEXT,
  departure_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_at   TIMESTAMPTZ NOT NULL,
  returned_at          TIMESTAMPTZ,
  departure_gate_id    UUID REFERENCES public.movement_locations(id),
  return_gate_id       UUID REFERENCES public.movement_locations(id),
  actual_return_location VARCHAR(200),
  route_violation      BOOLEAN NOT NULL DEFAULT FALSE,
  status               VARCHAR(30) NOT NULL DEFAULT 'out'
    CHECK (status IN ('out', 'returned', 'overdue', 'violated')),
  logged_by_id         UUID,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_movements_log_active
  ON public.employee_movements_log(tenant_id, employee_id, status);

-- Enable RLS
ALTER TABLE public.employee_movement_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_movements_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_employee_movement_permits_all ON public.employee_movement_permits;
CREATE POLICY kyvzon_employee_movement_permits_all ON public.employee_movement_permits
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_employee_movements_log_all ON public.employee_movements_log;
CREATE POLICY kyvzon_employee_movements_log_all ON public.employee_movements_log
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_emp_movement_permits_updated ON public.employee_movement_permits;
CREATE TRIGGER trg_emp_movement_permits_updated BEFORE UPDATE ON public.employee_movement_permits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_emp_movements_log_updated ON public.employee_movements_log;
CREATE TRIGGER trg_emp_movements_log_updated BEFORE UPDATE ON public.employee_movements_log FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_movement_permits');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_movements_log');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='employee_movement_permits'), 'RLS must be enabled';
END $$;
