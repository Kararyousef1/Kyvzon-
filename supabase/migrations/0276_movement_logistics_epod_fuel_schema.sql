-- ============================================================================
-- FILE: 0276_movement_logistics_epod_fuel_schema.sql
-- PURPOSE: Logistics Gateway - L09 (EPOD & Delivery Proof) & L04 (Fuel & Energy)
-- ============================================================================

-- 1. Electronic Proof of Delivery (EPOD - التسليم وإثباته)
CREATE TABLE IF NOT EXISTS public.logistics_epod (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dispatch_id          UUID NOT NULL REFERENCES public.logistics_dispatches(id) ON DELETE CASCADE,
  order_id             UUID NOT NULL REFERENCES public.logistics_shipment_orders(id) ON DELETE CASCADE,
  recipient_name       VARCHAR(200) NOT NULL,
  signature_url        TEXT,
  photo_proof_url      TEXT,
  delivery_notes       TEXT,
  delivered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status               VARCHAR(30) NOT NULL DEFAULT 'delivered'
    CHECK (status IN ('delivered', 'partially_delivered', 'rejected', 'disputed')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_epod_dispatch
  ON public.logistics_epod(tenant_id, dispatch_id);

-- 2. Fuel & Energy Management (الوقود والطاقة)
CREATE TABLE IF NOT EXISTS public.logistics_fuel_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id           UUID NOT NULL REFERENCES public.logistics_vehicles(id) ON DELETE CASCADE,
  driver_id            UUID REFERENCES public.logistics_drivers(id),
  liters               NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cost                 NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  odometer_reading     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  station_name         VARCHAR(200),
  logged_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_fuel_vehicle
  ON public.logistics_fuel_logs(tenant_id, vehicle_id, logged_at DESC);

-- Enable RLS
ALTER TABLE public.logistics_epod ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_fuel_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_logistics_epod_all ON public.logistics_epod;
CREATE POLICY kyvzon_logistics_epod_all ON public.logistics_epod
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_logistics_fuel_logs_all ON public.logistics_fuel_logs;
CREATE POLICY kyvzon_logistics_fuel_logs_all ON public.logistics_fuel_logs
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_logistics_epod_updated ON public.logistics_epod;
CREATE TRIGGER trg_logistics_epod_updated BEFORE UPDATE ON public.logistics_epod FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_fuel_logs_updated ON public.logistics_fuel_logs;
CREATE TRIGGER trg_logistics_fuel_logs_updated BEFORE UPDATE ON public.logistics_fuel_logs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_epod');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_fuel_logs');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='logistics_epod'), 'RLS must be enabled';
END $$;
