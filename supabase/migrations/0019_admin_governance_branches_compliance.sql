-- ============================================================================
--  FILE: 0019_admin_governance_branches_compliance.sql
--  PURPOSE: Admin Portal governance: branches + compliance center
--  SCOPE: Existing Admin Portal only
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name_ar     VARCHAR(200) NOT NULL,
  name_en     VARCHAR(200),
  code        VARCHAR(50),
  city        VARCHAR(120),
  country     VARCHAR(120),
  address     TEXT,
  manager_id  UUID,
  phone       VARCHAR(50),
  email       VARCHAR(255),
  status      VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branches_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant_status ON public.branches(tenant_id, status, name_ar);

CREATE TABLE IF NOT EXISTS public.compliance_checks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title        VARCHAR(250) NOT NULL,
  category     VARCHAR(40) NOT NULL DEFAULT 'other'
    CHECK (category IN ('security', 'hr', 'documents', 'permissions', 'data_protection', 'operations', 'other')),
  description  TEXT,
  risk_level   VARCHAR(30) NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status       VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'closed', 'waived')),
  owner_id     UUID,
  due_date     DATE,
  evidence_url TEXT,
  reviewed_by  UUID,
  reviewed_at  TIMESTAMPTZ,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_tenant_status
  ON public.compliance_checks(tenant_id, status, risk_level, due_date);

CREATE TABLE IF NOT EXISTS public.policy_acknowledgements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id       UUID,
  employee_id     UUID NOT NULL,
  policy_title    VARCHAR(250) NOT NULL,
  policy_version  VARCHAR(50),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_ack_tenant_employee
  ON public.policy_acknowledgements(tenant_id, employee_id, acknowledged_at DESC);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_branches_select ON public.branches;
CREATE POLICY kyvzon_branches_select ON public.branches
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_branches_write ON public.branches;
CREATE POLICY kyvzon_branches_write ON public.branches
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_compliance_checks_select ON public.compliance_checks;
CREATE POLICY kyvzon_compliance_checks_select ON public.compliance_checks
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_compliance_checks_write ON public.compliance_checks;
CREATE POLICY kyvzon_compliance_checks_write ON public.compliance_checks
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_policy_ack_select ON public.policy_acknowledgements;
CREATE POLICY kyvzon_policy_ack_select ON public.policy_acknowledgements
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_policy_ack_write ON public.policy_acknowledgements;
CREATE POLICY kyvzon_policy_ack_write ON public.policy_acknowledgements
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_compliance_checks_updated_at ON public.compliance_checks;
CREATE TRIGGER trg_compliance_checks_updated_at BEFORE UPDATE ON public.compliance_checks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='branches');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='compliance_checks');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='policy_acknowledgements');
END $$;
