-- ============================================================================
-- Kyvzon Platform — 103_secure_tenant_isolation.sql
-- PURPOSE: Make tenant isolation derive from auth.uid(), not client/localStorage context
-- DEPENDS ON: profiles.tenant_id, employees.user_id, tenants/user_tenants
-- SAFETY: HIGH — review on staging before production
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Trusted session helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::TEXT
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'hr', 'developer', 'it_admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.current_user_employee_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees AS e
  WHERE e.user_id = auth.uid()
    AND e.tenant_id = public.current_user_tenant_id()
  LIMIT 1;
$$;

-- The client may read the resolved values, but cannot set them.
CREATE OR REPLACE FUNCTION public.set_session_context()
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_tenant_id UUID;
BEGIN
  v_role := public.current_user_role();
  v_tenant_id := public.current_user_tenant_id();

  RETURN jsonb_build_object(
    'resolved_role', COALESCE(v_role, 'employee'),
    'resolved_tenant_id', v_tenant_id,
    'is_owner', COALESCE(v_role IN ('admin', 'developer', 'it_admin'), false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_session_context()
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kept for API compatibility. RLS no longer trusts a client-set GUC.
  PERFORM set_config('app.current_tenant_id', '', true);
  PERFORM set_config('app.current_role', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_employee_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_session_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_session_context() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_session_context() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Profiles: tenant read, self update only from the client
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_tenant_isolation ON public.profiles;
DROP POLICY IF EXISTS "profiles_tenant_isolation" ON public.profiles;
DROP POLICY IF EXISTS users_can_update_own_profile ON public.profiles;
DROP POLICY IF EXISTS "users_can_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS kyvzon_profiles_select ON public.profiles;
DROP POLICY IF EXISTS kyvzon_profiles_update_self ON public.profiles;

CREATE POLICY kyvzon_profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY kyvzon_profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND tenant_id = public.current_user_tenant_id())
  WITH CHECK (id = auth.uid() AND tenant_id = public.current_user_tenant_id());

-- ----------------------------------------------------------------------------
-- 3) Tenant-scoped read and staff-write policies for core operational tables
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  table_name TEXT;
  table_names CONSTANT TEXT[] := ARRAY[
    'employees',
    'departments',
    'leave_balance',
    'leave_settings',
    'holidays'
  ];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = table_name
        AND information_schema.columns.column_name = 'tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_select', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_insert', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_update', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_delete', table_name);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id())',
        'kyvzon_' || table_name || '_select', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
        'kyvzon_' || table_name || '_insert', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) WITH CHECK (tenant_id = public.current_user_tenant_id())',
        'kyvzon_' || table_name || '_update', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
        'kyvzon_' || table_name || '_delete', table_name
      );
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) Attendance: staff can manage; employees can only see their own records
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  table_name TEXT;
  table_names CONSTANT TEXT[] := ARRAY['attendance_logs', 'attendance_summary'];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = table_name
        AND information_schema.columns.column_name = 'tenant_id'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = table_name
            AND c2.column_name = 'employee_id'
        )
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_select', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_insert', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_update', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_delete', table_name);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id()))',
        'kyvzon_' || table_name || '_select', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
        'kyvzon_' || table_name || '_insert', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) WITH CHECK (tenant_id = public.current_user_tenant_id())',
        'kyvzon_' || table_name || '_update', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
        'kyvzon_' || table_name || '_delete', table_name
      );
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Employee-owned requests: own read/create; staff review/write
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  table_name TEXT;
  table_names CONSTANT TEXT[] := ARRAY['permissions', 'permissions_request', 'leaves'];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = table_name
        AND information_schema.columns.column_name = 'tenant_id'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = table_name
            AND c2.column_name = 'employee_id'
        )
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_select', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_insert', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_update', table_name);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id()))',
        'kyvzon_' || table_name || '_select', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id()))',
        'kyvzon_' || table_name || '_insert', table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id())) WITH CHECK (tenant_id = public.current_user_tenant_id())',
        'kyvzon_' || table_name || '_update', table_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Never grant the client broad table privileges; service_role bypasses RLS by design.
-- Validate policies on staging with both an employee JWT and an HR/admin JWT.
