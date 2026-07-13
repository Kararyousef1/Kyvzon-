-- ============================================================================
-- Kyvzon Platform — 106_harden_system_settings.sql
-- PURPOSE: Stop exposing AI/general settings through the public system_settings row
-- DEPENDS ON: 103_secure_tenant_isolation.sql, system_settings
-- ============================================================================

CREATE OR REPLACE VIEW public.public_landing_config AS
SELECT id, landing_config, updated_at
FROM public.system_settings
WHERE id = 'singleton';

GRANT SELECT ON public.public_landing_config TO anon, authenticated;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_select ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_write ON public.system_settings;

CREATE POLICY system_settings_admin_select ON public.system_settings
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff());

CREATE POLICY system_settings_admin_write ON public.system_settings
  FOR ALL TO authenticated
  USING (public.current_user_is_staff())
  WITH CHECK (public.current_user_is_staff());

REVOKE ALL ON TABLE public.system_settings FROM anon;
