-- ============================================================================
-- Kyvzon Development — 0010_platform_tenant_rls_audit.sql
-- Final tenant isolation for platform/support tables.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_is_platform_owner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('developer', 'it_admin'), false);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_platform_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_platform_owner() TO authenticated;

-- Companies: ordinary staff sees only its own company; platform owners can
-- manage the platform registry across companies.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_select_scoped ON public.tenants;
DROP POLICY IF EXISTS tenants_insert_platform ON public.tenants;
DROP POLICY IF EXISTS tenants_update_platform ON public.tenants;
DROP POLICY IF EXISTS tenants_delete_platform ON public.tenants;

CREATE POLICY tenants_select_scoped ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id = public.current_user_tenant_id()
    OR public.current_user_is_platform_owner()
  );

CREATE POLICY tenants_insert_platform ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_platform_owner());

CREATE POLICY tenants_update_platform ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.current_user_is_platform_owner())
  WITH CHECK (public.current_user_is_platform_owner());

CREATE POLICY tenants_delete_platform ON public.tenants
  FOR DELETE TO authenticated
  USING (public.current_user_is_platform_owner());

-- Support/audit tables which were intentionally kept out of the feature
-- policies. They are deny-by-default for anonymous users.
DO $$
DECLARE
  v_table_name TEXT;
  v_table_names CONSTANT TEXT[] := ARRAY[
    'audit_logs',
    'sync_log',
    'export_logs',
    'error_logs',
    'security_events',
    'overtime_log',
    'employee_breaks'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY v_table_names LOOP
    IF to_regclass('public.' || v_table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_select', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_insert', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_update', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_delete', v_table_name);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
      'kyvzon_' || v_table_name || '_select', v_table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
      'kyvzon_' || v_table_name || '_insert', v_table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) WITH CHECK (tenant_id = public.current_user_tenant_id())',
      'kyvzon_' || v_table_name || '_update', v_table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
      'kyvzon_' || v_table_name || '_delete', v_table_name
    );
  END LOOP;
END;
$$;

-- Complete the security event contract used by the local security service.
ALTER TABLE IF EXISTS public.security_events
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS threat_level TEXT,
  ADD COLUMN IF NOT EXISTS user_name TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE IF EXISTS public.audit_logs
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;
