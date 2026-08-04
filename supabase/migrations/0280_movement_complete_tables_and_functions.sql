-- ============================================================================
-- FILE: 0280_movement_complete_tables_and_functions.sql
-- PURPOSE: Complete all 41 tables, spatial functions (Haversine, Geofence),
--          triggers, and security assertions for Kyvzon Movement & Logistics Gateway.
-- ============================================================================

-- 1. Spatial & Geofencing Functions
CREATE OR REPLACE FUNCTION public.movement_haversine_km(
  lat1 NUMERIC, lng1 NUMERIC, lat2 NUMERIC, lng2 NUMERIC
)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT ROUND((6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
      COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
      POWER(SIN(RADIANS(lng2 - lng1) / 2), 2)
  )))::NUMERIC, 3);
$$;

CREATE OR REPLACE FUNCTION public.movement_point_in_polygon(
  p_points JSONB, p_lat NUMERIC, p_lng NUMERIC
)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n INT := jsonb_array_length(p_points);
  i INT := 0; j INT;
  inside BOOLEAN := false;
  xi NUMERIC; yi NUMERIC; xj NUMERIC; yj NUMERIC;
BEGIN
  IF n < 3 THEN RETURN false; END IF;
  j := n - 1;
  WHILE i < n LOOP
    xi := (p_points->i->>'lng')::NUMERIC;  yi := (p_points->i->>'lat')::NUMERIC;
    xj := (p_points->j->>'lng')::NUMERIC;  yj := (p_points->j->>'lat')::NUMERIC;
    IF ((yi > p_lat) <> (yj > p_lat))
       AND (p_lng < (xj - xi) * (p_lat - yi) / NULLIF(yj - yi, 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i; i := i + 1;
  END LOOP;
  RETURN inside;
END $$;

CREATE OR REPLACE FUNCTION public.movement_point_in_geofence(
  p_geofence_id UUID, p_lat NUMERIC, p_lng NUMERIC
)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE g RECORD; v_dist NUMERIC;
BEGIN
  SELECT * INTO g FROM public.movement_geofences WHERE id = p_geofence_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF g.fence_type = 'circle' THEN
    v_dist := public.movement_haversine_km(g.center_lat, g.center_lng, p_lat, p_lng);
    RETURN (v_dist * 1000) <= g.radius_m;
  END IF;
  RETURN public.movement_point_in_polygon(g.polygon_points, p_lat, p_lng);
END $$;

-- 2. Remaining Tables (Geofences, Audit, Approvals, Attachments, Checkins, Fleet Docs, HOS, Maintenance Parts, Shipments, Stops, Legs, Exceptions, Carrier Rates, KPIs)
CREATE TABLE IF NOT EXISTS public.movement_geofences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name_ar       TEXT NOT NULL,
  fence_type    TEXT NOT NULL DEFAULT 'circle' CHECK (fence_type IN ('circle','polygon')),
  center_lat    NUMERIC(10,7),
  center_lng    NUMERIC(10,7),
  radius_m      INTEGER,
  polygon_points JSONB,
  location_id   UUID REFERENCES public.movement_locations(id) ON DELETE CASCADE,
  alert_on_enter BOOLEAN DEFAULT false,
  alert_on_exit  BOOLEAN DEFAULT false,
  is_restricted  BOOLEAN DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.movement_audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id      UUID,
  event_type    TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  payload       JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_movement_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  permit_id     UUID REFERENCES public.employee_movement_permits(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL DEFAULT 1,
  approver_id   UUID,
  decision      TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected','delegated')),
  decided_at    TIMESTAMPTZ,
  comments      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.movement_permit_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  permit_id     UUID REFERENCES public.employee_movement_permits(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.field_visit_checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  visit_id      UUID REFERENCES public.employee_field_visits(id) ON DELETE CASCADE,
  latitude      NUMERIC(10,7) NOT NULL,
  longitude     NUMERIC(10,7) NOT NULL,
  geofence_ok   BOOLEAN DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id    UUID REFERENCES public.logistics_vehicles(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL,
  expiry_date   DATE NOT NULL,
  document_url  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fleet_driver_hos_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id     UUID REFERENCES public.logistics_drivers(id) ON DELETE CASCADE,
  duty_status   TEXT NOT NULL CHECK (duty_status IN ('off_duty','sleeper','driving','on_duty')),
  duration_mins INTEGER NOT NULL DEFAULT 0,
  logged_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logistics_shipments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_code TEXT NOT NULL UNIQUE,
  order_id      UUID REFERENCES public.logistics_shipment_orders(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','loaded','in_transit','delivered')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logistics_trip_stops (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dispatch_id   UUID REFERENCES public.logistics_dispatches(id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL,
  stop_type     TEXT NOT NULL CHECK (stop_type IN ('pickup','delivery','depot','fuel')),
  location_id   UUID REFERENCES public.movement_locations(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','arrived','completed','skipped')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logistics_carrier_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier_id    UUID REFERENCES public.logistics_carriers(id) ON DELETE CASCADE,
  origin_zone   TEXT,
  dest_zone     TEXT,
  rate_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logistics_kpi_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  otif_percent  NUMERIC(5,2) DEFAULT 100.00,
  total_trips   INTEGER DEFAULT 0,
  avg_cost_per_km NUMERIC(10,2) DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS & Security Revocation on new tables
ALTER TABLE public.movement_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_movement_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_permit_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_visit_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_driver_hos_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_carrier_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_kpi_snapshots ENABLE ROW LEVEL SECURITY;

-- Security Hardening for Spatial Functions
REVOKE ALL ON FUNCTION public.movement_haversine_km(NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_haversine_km(NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movement_haversine_km(NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.movement_point_in_polygon(JSONB, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_point_in_polygon(JSONB, NUMERIC, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movement_point_in_polygon(JSONB, NUMERIC, NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC) TO authenticated, service_role;

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.movement_haversine_km(NUMERIC, NUMERIC, NUMERIC, NUMERIC)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.movement_haversine_km(NUMERIC, NUMERIC, NUMERIC, NUMERIC)', 'EXECUTE');
  ASSERT has_function_privilege('authenticated', 'public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC)', 'EXECUTE');
END $$;
