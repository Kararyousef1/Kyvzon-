-- ============================================================================
-- FILE: 0274_movement_logistics_orders_dispatch_schema.sql
-- PURPOSE: Logistics Gateway - L05 (Orders & Shipments) & L07 (Dispatch & Execution)
-- ============================================================================

-- 1. Logistics Orders & Shipments (أوامر النقل والشحنات)
CREATE TABLE IF NOT EXISTS public.logistics_shipment_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_code           VARCHAR(50) NOT NULL,
  origin_location_id   UUID REFERENCES public.movement_locations(id),
  destination_location_id UUID REFERENCES public.movement_locations(id),
  origin_address       TEXT NOT NULL,
  destination_address  TEXT NOT NULL,
  cargo_description    TEXT NOT NULL,
  cargo_weight_kg      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cargo_volume_cbm     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  priority             VARCHAR(30) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status               VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'dispatched', 'in_transit', 'delivered', 'cancelled')),
  scheduled_departure  TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_logistics_order_code UNIQUE (tenant_id, order_code)
);

CREATE INDEX IF NOT EXISTS idx_logistics_orders_status
  ON public.logistics_shipment_orders(tenant_id, status);

-- 2. Dispatch & Trip Execution (الإرسال وتنفيذ الرحلات)
CREATE TABLE IF NOT EXISTS public.logistics_dispatches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dispatch_code        VARCHAR(50) NOT NULL,
  order_id             UUID NOT NULL REFERENCES public.logistics_shipment_orders(id) ON DELETE CASCADE,
  vehicle_id           UUID NOT NULL REFERENCES public.logistics_vehicles(id),
  driver_id            UUID NOT NULL REFERENCES public.logistics_drivers(id),
  status               VARCHAR(30) NOT NULL DEFAULT 'dispatched'
    CHECK (status IN ('dispatched', 'en_route', 'arrived', 'completed', 'failed')),
  dispatched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estimated_arrival    TIMESTAMPTZ,
  actual_arrival       TIMESTAMPTZ,
  dispatch_notes       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_logistics_dispatch_code UNIQUE (tenant_id, dispatch_code)
);

CREATE INDEX IF NOT EXISTS idx_logistics_dispatches_status
  ON public.logistics_dispatches(tenant_id, status);

-- Enable RLS
ALTER TABLE public.logistics_shipment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_dispatches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_logistics_shipment_orders_all ON public.logistics_shipment_orders;
CREATE POLICY kyvzon_logistics_shipment_orders_all ON public.logistics_shipment_orders
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_logistics_dispatches_all ON public.logistics_dispatches;
CREATE POLICY kyvzon_logistics_dispatches_all ON public.logistics_dispatches
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_logistics_shipment_orders_updated ON public.logistics_shipment_orders;
CREATE TRIGGER trg_logistics_shipment_orders_updated BEFORE UPDATE ON public.logistics_shipment_orders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_dispatches_updated ON public.logistics_dispatches;
CREATE TRIGGER trg_logistics_dispatches_updated BEFORE UPDATE ON public.logistics_dispatches FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_shipment_orders');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_dispatches');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='logistics_shipment_orders'), 'RLS must be enabled';
END $$;
