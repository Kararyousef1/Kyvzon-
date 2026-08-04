-- ============================================================================
-- FILE: 0275_movement_logistics_route_tracking_schema.sql
-- PURPOSE: Logistics Gateway - L06 (Route Planning) & L08 (Live Tracking)
-- ============================================================================

-- 1. Route Planning & Optimization (تخطيط المسارات والتحسين)
CREATE TABLE IF NOT EXISTS public.logistics_routes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_code           VARCHAR(50) NOT NULL,
  route_name           VARCHAR(200) NOT NULL,
  dispatch_id          UUID REFERENCES public.logistics_dispatches(id) ON DELETE CASCADE,
  waypoints_json       JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_distance_km    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  estimated_duration_min INTEGER NOT NULL DEFAULT 0,
  status               VARCHAR(30) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'optimized', 'in_progress', 'completed', 'deviated')),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_logistics_route_code UNIQUE (tenant_id, route_code)
);

CREATE INDEX IF NOT EXISTS idx_logistics_routes_tenant
  ON public.logistics_routes(tenant_id, status);

-- 2. Live Tracking & Telemetry (التتبع والرؤية الحية)
CREATE TABLE IF NOT EXISTS public.logistics_telemetry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id           UUID NOT NULL REFERENCES public.logistics_vehicles(id) ON DELETE CASCADE,
  dispatch_id          UUID REFERENCES public.logistics_dispatches(id),
  latitude             NUMERIC(10,7) NOT NULL,
  longitude            NUMERIC(10,7) NOT NULL,
  speed_kmh            NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  heading              NUMERIC(5,2) DEFAULT 0.00,
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_telemetry_vehicle
  ON public.logistics_telemetry(tenant_id, vehicle_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.logistics_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_telemetry ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_logistics_routes_all ON public.logistics_routes;
CREATE POLICY kyvzon_logistics_routes_all ON public.logistics_routes
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_logistics_telemetry_all ON public.logistics_telemetry;
CREATE POLICY kyvzon_logistics_telemetry_all ON public.logistics_telemetry
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_logistics_routes_updated ON public.logistics_routes;
CREATE TRIGGER trg_logistics_routes_updated BEFORE UPDATE ON public.logistics_routes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_routes');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_telemetry');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='logistics_routes'), 'RLS must be enabled';
END $$;
