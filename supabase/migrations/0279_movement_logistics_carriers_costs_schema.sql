-- ============================================================================
-- FILE: 0279_movement_logistics_carriers_costs_schema.sql
-- PURPOSE: Logistics Gateway - L10 (Carriers & Contracting) & L11 (Cost Analytics)
-- ============================================================================

-- 1. Carriers & Contracting (الناقلون والتعاقد الخارجي)
CREATE TABLE IF NOT EXISTS public.logistics_carriers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier_code         VARCHAR(50) NOT NULL,
  carrier_name_ar      VARCHAR(250) NOT NULL,
  contact_person       VARCHAR(200),
  phone                VARCHAR(50),
  email                VARCHAR(150),
  service_type         VARCHAR(50) NOT NULL DEFAULT '3pl'
    CHECK (service_type IN ('3pl', 'freight_forwarder', 'courier', 'owner_operator')),
  contract_expiry      DATE,
  rating               NUMERIC(3,2) DEFAULT 5.00,
  status               VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'blacklisted', 'contract_expired')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_logistics_carrier_code UNIQUE (tenant_id, carrier_code)
);

CREATE INDEX IF NOT EXISTS idx_logistics_carriers_tenant
  ON public.logistics_carriers(tenant_id, status);

-- 2. Cost Analytics & Financial Settlement (التكاليف والتحليلات المالية للرحلات)
CREATE TABLE IF NOT EXISTS public.logistics_trip_costs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dispatch_id          UUID REFERENCES public.logistics_dispatches(id) ON DELETE CASCADE,
  carrier_id           UUID REFERENCES public.logistics_carriers(id),
  fuel_cost            NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  toll_cost            NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  driver_allowance     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  maintenance_share    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_cost           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  revenue              NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  net_profit           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status               VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'invoiced', 'paid')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_trip_costs_tenant
  ON public.logistics_trip_costs(tenant_id, status);

-- Enable RLS
ALTER TABLE public.logistics_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_trip_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_logistics_carriers_all ON public.logistics_carriers;
CREATE POLICY kyvzon_logistics_carriers_all ON public.logistics_carriers
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_logistics_trip_costs_all ON public.logistics_trip_costs;
CREATE POLICY kyvzon_logistics_trip_costs_all ON public.logistics_trip_costs
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_logistics_carriers_updated ON public.logistics_carriers;
CREATE TRIGGER trg_logistics_carriers_updated BEFORE UPDATE ON public.logistics_carriers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_trip_costs_updated ON public.logistics_trip_costs;
CREATE TRIGGER trg_logistics_trip_costs_updated BEFORE UPDATE ON public.logistics_trip_costs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_carriers');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_trip_costs');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='logistics_carriers'), 'RLS must be enabled';
END $$;
