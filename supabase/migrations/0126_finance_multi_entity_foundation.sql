-- ============================================================================
-- Finance foundation: IFRS-ready multi-entity accounting inside a tenant.
-- Iraq uses IQD as the default functional currency; all tax/legal rules remain
-- configuration work and must be approved by a local accounting adviser.
-- ============================================================================

DROP TABLE IF EXISTS public.currencies CASCADE;

CREATE TABLE IF NOT EXISTS public.currencies (
  code CHAR(3) PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT,
  decimal_places SMALLINT NOT NULL DEFAULT 2 CHECK (decimal_places BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.currencies (code, name, symbol, decimal_places)
VALUES
  ('IQD', 'Iraqi Dinar', 'د.ع', 0),
  ('USD', 'US Dollar', '$', 2),
  ('SAR', 'Saudi Riyal', 'ر.س', 2),
  ('EUR', 'Euro', '€', 2)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol,
  decimal_places = EXCLUDED.decimal_places;

CREATE TABLE IF NOT EXISTS public.legal_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  registration_number TEXT,
  tax_number TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'IQ',
  base_currency_code CHAR(3) NOT NULL DEFAULT 'IQD' REFERENCES public.currencies(code),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_legal_entities_tenant_status
  ON public.legal_entities(tenant_id, status);

-- Every existing tenant receives a default legal entity. This is intentionally
-- idempotent and preserves existing tenant data during the staged rollout.
INSERT INTO public.legal_entities (tenant_id, code, name_ar, name_en, base_currency_code)
SELECT t.id, 'DEFAULT', t.name_ar, COALESCE(t.name_en, t.name_ar), 'IQD'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_entities entity
  WHERE entity.tenant_id = t.id AND entity.code = 'DEFAULT'
);

CREATE TABLE IF NOT EXISTS public.entity_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  finance_role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (finance_role IN ('viewer', 'accountant', 'approver', 'finance_manager', 'entity_admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_memberships_user
  ON public.entity_memberships(user_id, legal_entity_id) WHERE is_active;

-- Seed active tenant administrators into the default entity only. This does
-- not grant cross-entity access; additional entities require explicit setup.
INSERT INTO public.entity_memberships (tenant_id, legal_entity_id, user_id, finance_role)
SELECT entity.tenant_id, entity.id, profile.id, 'entity_admin'
FROM public.legal_entities entity
JOIN public.profiles profile ON profile.tenant_id = entity.tenant_id
WHERE entity.code = 'DEFAULT'
  AND profile.status = 'active'
  AND profile.role IN ('admin', 'hr', 'manager')
ON CONFLICT (legal_entity_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date),
  UNIQUE (legal_entity_id, name),
  UNIQUE (legal_entity_id, start_date)
);

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  period_number SMALLINT NOT NULL CHECK (period_number BETWEEN 1 AND 13),
  name VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'soft_closed', 'closed')),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date),
  UNIQUE (fiscal_year_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_entity_dates
  ON public.accounting_periods(legal_entity_id, start_date, end_date, status);

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  parent_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE IF NOT EXISTS public.finance_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'closed', 'archived')),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  rate_date DATE NOT NULL,
  from_currency_code CHAR(3) NOT NULL REFERENCES public.currencies(code),
  to_currency_code CHAR(3) NOT NULL REFERENCES public.currencies(code),
  rate NUMERIC(24,10) NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'superseded')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_currency_code <> to_currency_code),
  UNIQUE (legal_entity_id, rate_date, from_currency_code, to_currency_code)
);

CREATE OR REPLACE FUNCTION public.current_user_can_access_legal_entity(p_legal_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_is_platform_owner()
    OR EXISTS (
      SELECT 1
      FROM public.entity_memberships membership
      WHERE membership.legal_entity_id = p_legal_entity_id
        AND membership.user_id = auth.uid()
        AND membership.is_active
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_legal_entity(p_legal_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_is_platform_owner()
    OR EXISTS (
      SELECT 1
      FROM public.entity_memberships membership
      WHERE membership.legal_entity_id = p_legal_entity_id
        AND membership.user_id = auth.uid()
        AND membership.is_active
        AND membership.finance_role IN ('accountant', 'finance_manager', 'entity_admin')
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_access_legal_entity(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_legal_entity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_legal_entity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_legal_entity(UUID) TO authenticated;

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS currencies_read_authenticated ON public.currencies;
CREATE POLICY currencies_read_authenticated ON public.currencies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS legal_entities_access ON public.legal_entities;
CREATE POLICY legal_entities_access ON public.legal_entities FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    OR public.current_user_is_platform_owner()
  )
  WITH CHECK (
    public.current_user_is_platform_owner()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_role() = 'admin'
    )
  );

DROP POLICY IF EXISTS entity_memberships_access ON public.entity_memberships;
CREATE POLICY entity_memberships_access ON public.entity_memberships FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_can_manage_legal_entity(legal_entity_id)
    OR public.current_user_is_platform_owner()
  )
  WITH CHECK (
    public.current_user_can_manage_legal_entity(legal_entity_id)
    OR public.current_user_is_platform_owner()
    OR (
      user_id = auth.uid()
      AND public.current_user_role() = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.legal_entities entity
        WHERE entity.id = legal_entity_id
          AND entity.tenant_id = public.current_user_tenant_id()
      )
    )
  );

DO $$
DECLARE
  table_name TEXT;
  tables CONSTANT TEXT[] := ARRAY[
    'fiscal_years', 'accounting_periods', 'cost_centers', 'finance_projects', 'exchange_rates'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS finance_%I_access ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY finance_%I_access ON public.%I FOR ALL TO authenticated USING (public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id))',
      table_name, table_name
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_legal_entities_updated_at ON public.legal_entities;
CREATE TRIGGER trg_legal_entities_updated_at BEFORE UPDATE ON public.legal_entities
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_entity_memberships_updated_at ON public.entity_memberships;
CREATE TRIGGER trg_entity_memberships_updated_at BEFORE UPDATE ON public.entity_memberships
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_fiscal_years_updated_at ON public.fiscal_years;
CREATE TRIGGER trg_fiscal_years_updated_at BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_accounting_periods_updated_at ON public.accounting_periods;
CREATE TRIGGER trg_accounting_periods_updated_at BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_cost_centers_updated_at ON public.cost_centers;
CREATE TRIGGER trg_cost_centers_updated_at BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_finance_projects_updated_at ON public.finance_projects;
CREATE TRIGGER trg_finance_projects_updated_at BEFORE UPDATE ON public.finance_projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legal_entities');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounting_periods');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'exchange_rates');
END $$;
