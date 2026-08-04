-- ============================================================================
-- FILE: 0272_movement_logistics_fleet_schema.sql
-- PURPOSE: Logistics Gateway - L01 (Fleet & Vehicles), L02 (Drivers & Compliance), L03 (Maintenance & Repair)
-- ============================================================================

-- 1. Fleet Vehicles (الأسطول والمركبات)
CREATE TABLE IF NOT EXISTS public.logistics_vehicles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plate_number         VARCHAR(50) NOT NULL,
  vehicle_code         VARCHAR(50) NOT NULL,
  make                 VARCHAR(100) NOT NULL,
  model                VARCHAR(100) NOT NULL,
  year                 INTEGER NOT NULL,
  vehicle_type         VARCHAR(50) NOT NULL DEFAULT 'truck'
    CHECK (vehicle_type IN ('truck', 'van', 'pickup', 'heavy_transport', 'forklift', 'car')),
  fuel_type            VARCHAR(30) NOT NULL DEFAULT 'diesel'
    CHECK (fuel_type IN ('diesel', 'gasoline', 'electric', 'hybrid')),
  max_weight_kg        NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_volume_cbm       NUMERIC(10,2) NOT NULL DEFAULT 0,
  current_mileage_km   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status               VARCHAR(30) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'on_trip', 'maintenance', 'out_of_service')),
  branch_id            UUID,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_logistics_vehicle_plate UNIQUE (tenant_id, plate_number),
  CONSTRAINT uq_logistics_vehicle_code UNIQUE (tenant_id, vehicle_code)
);

CREATE INDEX IF NOT EXISTS idx_logistics_vehicles_status
  ON public.logistics_vehicles(tenant_id, status);

-- 2. Logistics Drivers (السائقون والامتثال)
CREATE TABLE IF NOT EXISTS public.logistics_drivers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID,
  driver_name_ar       VARCHAR(250) NOT NULL,
  license_number       VARCHAR(100) NOT NULL,
  license_class        VARCHAR(50) NOT NULL,
  license_expiry_date  DATE NOT NULL,
  phone                VARCHAR(50),
  status               VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_trip', 'suspended', 'off_duty')),
  safety_score         NUMERIC(5,2) DEFAULT 100.00,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_logistics_driver_license UNIQUE (tenant_id, license_number)
);

CREATE INDEX IF NOT EXISTS idx_logistics_drivers_status
  ON public.logistics_drivers(tenant_id, status);

-- 3. Vehicle Maintenance & Repair (الصيانة والإصلاح)
CREATE TABLE IF NOT EXISTS public.logistics_maintenance (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id           UUID NOT NULL REFERENCES public.logistics_vehicles(id) ON DELETE CASCADE,
  maintenance_type     VARCHAR(50) NOT NULL DEFAULT 'routine'
    CHECK (maintenance_type IN ('routine', 'repair', 'emergency', 'inspection')),
  description          TEXT NOT NULL,
  cost                 NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  odometer_reading     NUMERIC(10,2),
  status               VARCHAR(30) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_date       DATE NOT NULL,
  completed_date       DATE,
  technician_notes     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_maintenance_vehicle
  ON public.logistics_maintenance(tenant_id, vehicle_id, status);

-- Enable RLS
ALTER TABLE public.logistics_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_maintenance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_logistics_vehicles_all ON public.logistics_vehicles;
CREATE POLICY kyvzon_logistics_vehicles_all ON public.logistics_vehicles
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_logistics_drivers_all ON public.logistics_drivers;
CREATE POLICY kyvzon_logistics_drivers_all ON public.logistics_drivers
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_logistics_maintenance_all ON public.logistics_maintenance;
CREATE POLICY kyvzon_logistics_maintenance_all ON public.logistics_maintenance
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_logistics_vehicles_updated ON public.logistics_vehicles;
CREATE TRIGGER trg_logistics_vehicles_updated BEFORE UPDATE ON public.logistics_vehicles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_drivers_updated ON public.logistics_drivers;
CREATE TRIGGER trg_logistics_drivers_updated BEFORE UPDATE ON public.logistics_drivers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_maintenance_updated ON public.logistics_maintenance;
CREATE TRIGGER trg_logistics_maintenance_updated BEFORE UPDATE ON public.logistics_maintenance FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_vehicles');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_drivers');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_maintenance');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='logistics_vehicles'), 'RLS must be enabled';
END $$;
