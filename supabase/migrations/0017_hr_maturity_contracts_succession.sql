-- ============================================================================
--  FILE: 0017_hr_maturity_contracts_succession.sql
--  PURPOSE: HR Portal maturity slice: employee contracts + succession planning
--  SCOPE: Existing HR Portal only — no new ERP portals
--  SAFETY LEVEL: HIGH — idempotent
-- ============================================================================

-- ============================================================================
--  1. EMPLOYEE CONTRACTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL,
  contract_number     VARCHAR(100),
  contract_type       VARCHAR(40) NOT NULL DEFAULT 'permanent'
    CHECK (contract_type IN ('permanent', 'fixed_term', 'probation', 'part_time', 'consultant', 'other')),
  title               VARCHAR(250),
  start_date          DATE NOT NULL,
  end_date            DATE,
  renewal_notice_days INTEGER NOT NULL DEFAULT 30,
  status              VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'renewed')),
  salary_amount       NUMERIC(14,2),
  salary_currency     VARCHAR(10) DEFAULT 'IQD',
  document_url        TEXT,
  notes               TEXT,
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_contracts_contract_no_unique UNIQUE (tenant_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_tenant_employee
  ON public.employee_contracts(tenant_id, employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_expiry
  ON public.employee_contracts(tenant_id, status, end_date) WHERE end_date IS NOT NULL;

-- ============================================================================
--  2. SUCCESSION PLANNING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.critical_positions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title                 VARCHAR(250) NOT NULL,
  department_id          UUID,
  incumbent_employee_id  UUID,
  risk_level             VARCHAR(30) NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  business_impact        TEXT,
  required_skills        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status                 VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  created_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_critical_positions_tenant_status
  ON public.critical_positions(tenant_id, status, risk_level);

CREATE TABLE IF NOT EXISTS public.succession_candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  critical_position_id  UUID NOT NULL REFERENCES public.critical_positions(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL,
  readiness_level       VARCHAR(40) NOT NULL DEFAULT 'ready_12_months'
    CHECK (readiness_level IN ('ready_now', 'ready_6_months', 'ready_12_months', 'future_potential')),
  readiness_score       INTEGER CHECK (readiness_score BETWEEN 0 AND 100),
  strengths             TEXT,
  gaps                  TEXT,
  manager_notes         TEXT,
  status                VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  nominated_by          UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT succession_candidates_unique UNIQUE (tenant_id, critical_position_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_succession_candidates_position
  ON public.succession_candidates(tenant_id, critical_position_id, readiness_level);
CREATE INDEX IF NOT EXISTS idx_succession_candidates_employee
  ON public.succession_candidates(tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS public.succession_development_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES public.succession_candidates(id) ON DELETE CASCADE,
  action_type     VARCHAR(40) NOT NULL DEFAULT 'training'
    CHECK (action_type IN ('training', 'mentoring', 'assignment', 'certification', 'other')),
  title           VARCHAR(250) NOT NULL,
  description     TEXT,
  target_date     DATE,
  status          VARCHAR(30) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_succession_plans_candidate
  ON public.succession_development_plans(tenant_id, candidate_id, status, target_date);

-- ============================================================================
--  RLS
-- ============================================================================

ALTER TABLE public.employee_contracts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_positions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.succession_candidates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.succession_development_plans   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_employee_contracts_select ON public.employee_contracts;
CREATE POLICY kyvzon_employee_contracts_select ON public.employee_contracts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR employee_id = auth.uid()
      OR employee_id = public.current_user_employee_id()
    )
  );

DROP POLICY IF EXISTS kyvzon_employee_contracts_write ON public.employee_contracts;
CREATE POLICY kyvzon_employee_contracts_write ON public.employee_contracts
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_critical_positions_select ON public.critical_positions;
CREATE POLICY kyvzon_critical_positions_select ON public.critical_positions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_critical_positions_write ON public.critical_positions;
CREATE POLICY kyvzon_critical_positions_write ON public.critical_positions
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_succession_candidates_select ON public.succession_candidates;
CREATE POLICY kyvzon_succession_candidates_select ON public.succession_candidates
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_succession_candidates_write ON public.succession_candidates;
CREATE POLICY kyvzon_succession_candidates_write ON public.succession_candidates
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_succession_plans_select ON public.succession_development_plans;
CREATE POLICY kyvzon_succession_plans_select ON public.succession_development_plans
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_succession_plans_write ON public.succession_development_plans;
CREATE POLICY kyvzon_succession_plans_write ON public.succession_development_plans
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

-- ============================================================================
--  Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trg_employee_contracts_updated_at ON public.employee_contracts;
CREATE TRIGGER trg_employee_contracts_updated_at
  BEFORE UPDATE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_critical_positions_updated_at ON public.critical_positions;
CREATE TRIGGER trg_critical_positions_updated_at
  BEFORE UPDATE ON public.critical_positions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_succession_candidates_updated_at ON public.succession_candidates;
CREATE TRIGGER trg_succession_candidates_updated_at
  BEFORE UPDATE ON public.succession_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_succession_plans_updated_at ON public.succession_development_plans;
CREATE TRIGGER trg_succession_plans_updated_at
  BEFORE UPDATE ON public.succession_development_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================================
--  Sanity checks
-- ============================================================================
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_contracts');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'critical_positions');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'succession_candidates');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'succession_development_plans');

  ASSERT (SELECT bool_and(rowsecurity) FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename IN ('employee_contracts', 'critical_positions', 'succession_candidates', 'succession_development_plans')),
    'RLS must be enabled on HR maturity tables';
END $$;
