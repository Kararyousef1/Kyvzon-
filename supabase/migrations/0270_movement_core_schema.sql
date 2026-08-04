-- ============================================================================
-- FILE: 0270_movement_core_schema.sql
-- PURPOSE: Movement & Logistics Gateway - Core Schema (L00 & E00 Foundation)
-- ============================================================================

-- 1. Movement Role Assignments (Multi-role support for employees/logistics staff)
CREATE TABLE IF NOT EXISTS public.movement_role_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL,
  portal_role          VARCHAR(50) NOT NULL CHECK (portal_role IN ('employee_movement', 'logistics', 'movement_manager')),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by          UUID,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_movement_role_user UNIQUE (tenant_id, user_id, portal_role)
);

CREATE INDEX IF NOT EXISTS idx_movement_role_assignments_tenant
  ON public.movement_role_assignments(tenant_id, user_id, is_active);

-- 2. Movement Locations / Stations (Geo-fenced points for employees and logistics)
CREATE TABLE IF NOT EXISTS public.movement_locations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code                 VARCHAR(50) NOT NULL,
  name_ar              VARCHAR(200) NOT NULL,
  name_en              VARCHAR(200),
  location_type        VARCHAR(50) NOT NULL DEFAULT 'checkpoint'
    CHECK (location_type IN ('gate', 'warehouse', 'office', 'checkpoint', 'parking', 'hub', 'client_site')),
  latitude             NUMERIC(10,7),
  longitude            NUMERIC(10,7),
  radius_meters        INTEGER DEFAULT 50,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  description          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_movement_location_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_movement_locations_tenant
  ON public.movement_locations(tenant_id, is_active);

-- 3. Movement Policies (Rules for employee departures, maximum durations, alerts)
CREATE TABLE IF NOT EXISTS public.movement_policies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_code          VARCHAR(50) NOT NULL,
  title_ar             VARCHAR(200) NOT NULL,
  destination_type     VARCHAR(100) NOT NULL,
  max_duration_minutes INTEGER NOT NULL DEFAULT 30,
  requires_approval    BOOLEAN NOT NULL DEFAULT FALSE,
  auto_notify_overdue  BOOLEAN NOT NULL DEFAULT TRUE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  rules_json           JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_movement_policy_code UNIQUE (tenant_id, policy_code)
);

CREATE INDEX IF NOT EXISTS idx_movement_policies_tenant
  ON public.movement_policies(tenant_id, is_active);

-- 4. Logistics Hub Settings & Fleet Foundation Setup
CREATE TABLE IF NOT EXISTS public.logistics_settings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  setting_key          VARCHAR(100) NOT NULL,
  setting_value        TEXT NOT NULL,
  description          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_logistics_setting_key UNIQUE (tenant_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_logistics_settings_tenant
  ON public.logistics_settings(tenant_id);

-- Enable RLS on all created tables
ALTER TABLE public.movement_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_movement_role_assignments_all ON public.movement_role_assignments;
CREATE POLICY kyvzon_movement_role_assignments_all ON public.movement_role_assignments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_movement_locations_all ON public.movement_locations;
CREATE POLICY kyvzon_movement_locations_all ON public.movement_locations
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_movement_policies_all ON public.movement_policies;
CREATE POLICY kyvzon_movement_policies_all ON public.movement_policies
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_logistics_settings_all ON public.logistics_settings;
CREATE POLICY kyvzon_logistics_settings_all ON public.logistics_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_movement_role_assignments_updated ON public.movement_role_assignments;
CREATE TRIGGER trg_movement_role_assignments_updated BEFORE UPDATE ON public.movement_role_assignments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_movement_locations_updated ON public.movement_locations;
CREATE TRIGGER trg_movement_locations_updated BEFORE UPDATE ON public.movement_locations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_movement_policies_updated ON public.movement_policies;
CREATE TRIGGER trg_movement_policies_updated BEFORE UPDATE ON public.movement_policies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_settings_updated ON public.logistics_settings;
CREATE TRIGGER trg_logistics_settings_updated BEFORE UPDATE ON public.logistics_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='movement_role_assignments');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='movement_locations');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='movement_policies');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='logistics_settings');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='movement_role_assignments'), 'RLS must be enabled';
END $$;
