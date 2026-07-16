-- ============================================================================
--  FILE: 0024_tenant_modules_control_plane.sql
--  PURPOSE: SaaS Control Plane — tenant portal/module activation
--  SCOPE: Developer Portal controls which portals/modules are enabled per tenant
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key VARCHAR(80) NOT NULL,
  module_label VARCHAR(160),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  source_plan VARCHAR(50),
  enabled_by UUID,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_modules_unique UNIQUE (tenant_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_enabled
  ON public.tenant_modules(tenant_id, is_enabled, module_key);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_key
  ON public.tenant_modules(module_key, is_enabled);

ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_tenant_modules_select ON public.tenant_modules;
CREATE POLICY kyvzon_tenant_modules_select ON public.tenant_modules
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    OR public.current_user_is_staff()
    OR public.current_user_role() IN ('developer', 'it_admin')
  );

DROP POLICY IF EXISTS kyvzon_tenant_modules_write ON public.tenant_modules;
CREATE POLICY kyvzon_tenant_modules_write ON public.tenant_modules
  FOR ALL TO authenticated
  USING (
    public.current_user_is_staff()
    OR public.current_user_role() IN ('developer', 'it_admin')
  )
  WITH CHECK (
    public.current_user_is_staff()
    OR public.current_user_role() IN ('developer', 'it_admin')
  );

DROP TRIGGER IF EXISTS trg_tenant_modules_updated_at ON public.tenant_modules;
CREATE TRIGGER trg_tenant_modules_updated_at
  BEFORE UPDATE ON public.tenant_modules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed tenant_modules from tenants.enabled_modules when present, for backward compatibility.
INSERT INTO public.tenant_modules (tenant_id, module_key, module_label, is_enabled, source_plan, enabled_at)
SELECT
  t.id,
  module_key,
  module_key,
  true,
  t.subscription_plan,
  NOW()
FROM public.tenants t
CROSS JOIN LATERAL unnest(COALESCE(t.enabled_modules, ARRAY[]::text[])) AS module_key
ON CONFLICT (tenant_id, module_key) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  source_plan = EXCLUDED.source_plan,
  enabled_at = COALESCE(public.tenant_modules.enabled_at, NOW()),
  disabled_at = NULL,
  updated_at = NOW();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenant_modules');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='tenant_modules'),
    'RLS must be enabled on tenant_modules';
END $$;
