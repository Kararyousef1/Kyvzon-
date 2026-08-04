-- ============================================================================
-- FILE: 0277_movement_employee_visits_assignments_schema.sql
-- PURPOSE: Employee Movement - E03 (Field Visits) & E04 (Assignments & Missions)
-- ============================================================================

-- 1. Field Visits (الزيارات الميدانية)
CREATE TABLE IF NOT EXISTS public.employee_field_visits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  client_name          VARCHAR(250) NOT NULL,
  location_address     TEXT NOT NULL,
  purpose              TEXT NOT NULL,
  scheduled_at         TIMESTAMPTZ NOT NULL,
  check_in_at          TIMESTAMPTZ,
  check_out_at         TIMESTAMPTZ,
  status               VARCHAR(30) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'checked_in', 'completed', 'cancelled', 'missed')),
  report_notes         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_field_visits_tenant
  ON public.employee_field_visits(tenant_id, employee_id, status);

-- 2. Assignments & Missions (المهام والانتدابات الرسمية)
CREATE TABLE IF NOT EXISTS public.employee_missions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  mission_title        VARCHAR(250) NOT NULL,
  destination          VARCHAR(250) NOT NULL,
  mission_type         VARCHAR(50) NOT NULL DEFAULT 'official_mission'
    CHECK (mission_type IN ('official_mission', 'training', 'conference', 'client_support')),
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL,
  allowance_amount     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status               VARCHAR(30) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'in_progress', 'completed', 'cancelled')),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_missions_tenant
  ON public.employee_missions(tenant_id, employee_id, status);

-- Enable RLS
ALTER TABLE public.employee_field_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_missions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_employee_field_visits_all ON public.employee_field_visits;
CREATE POLICY kyvzon_employee_field_visits_all ON public.employee_field_visits
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_employee_missions_all ON public.employee_missions;
CREATE POLICY kyvzon_employee_missions_all ON public.employee_missions
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_employee_field_visits_updated ON public.employee_field_visits;
CREATE TRIGGER trg_employee_field_visits_updated BEFORE UPDATE ON public.employee_field_visits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_employee_missions_updated ON public.employee_missions;
CREATE TRIGGER trg_employee_missions_updated BEFORE UPDATE ON public.employee_missions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_field_visits');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_missions');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='employee_field_visits'), 'RLS must be enabled';
END $$;
