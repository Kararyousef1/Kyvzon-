-- ============================================================================
-- FILE: 0278_movement_employee_compliance_analytics_schema.sql
-- PURPOSE: Employee Movement - E05 (Compliance & Violations) & E06 (Analytics & Reports)
-- ============================================================================

-- 1. Employee Compliance & Violations (الامتثال والمخالفات)
CREATE TABLE IF NOT EXISTS public.employee_movement_violations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  movement_id          UUID REFERENCES public.employee_movements_log(id),
  violation_type       VARCHAR(50) NOT NULL DEFAULT 'late_return'
    CHECK (violation_type IN ('late_return', 'route_deviation', 'unauthorized_exit', 'missing_check_in')),
  severity             VARCHAR(30) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description          TEXT NOT NULL,
  penalty_action       VARCHAR(100),
  status               VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_violations_tenant
  ON public.employee_movement_violations(tenant_id, employee_id, status);

-- Enable RLS
ALTER TABLE public.employee_movement_violations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_employee_movement_violations_all ON public.employee_movement_violations;
CREATE POLICY kyvzon_employee_movement_violations_all ON public.employee_movement_violations
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_employee_movement_violations_updated ON public.employee_movement_violations;
CREATE TRIGGER trg_employee_movement_violations_updated BEFORE UPDATE ON public.employee_movement_violations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_movement_violations');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='employee_movement_violations'), 'RLS must be enabled';
END $$;
