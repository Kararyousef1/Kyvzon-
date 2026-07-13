-- ============================================================================
-- Kyvzon Development — 0007_support_and_security.sql
-- Support tables, tenant/RLS security, replay protection and public settings
-- ============================================================================

-- ════════════════════════════════════════════════════════════════
--  FILE: 008_final_cleanup.sql
--  PURPOSE: Final Cleanup + Additional Tables
--  EXECUTION ORDER: 8 (LAST)
--  SAFETY: HIGH - Uses IF NOT EXISTS
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: ERROR LOGS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    message TEXT NOT NULL,
    source TEXT,
    stack_trace TEXT,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT,
    file_name TEXT,
    line_number INTEGER,
    user_agent TEXT,
    route TEXT,
    environment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: SECURITY EVENTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),
    ip_address INET,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_error_logs_tenant 
    ON error_logs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant 
    ON security_events(tenant_id);

CREATE INDEX IF NOT EXISTS idx_security_events_type 
    ON security_events(event_type);

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: FINAL NOTES
-- ════════════════════════════════════════════════════════════════
--  This file should be executed LAST.
--  It contains supporting tables that are not critical for core functionality.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  END OF ALL MIGRATIONS
--  ════════════════════════════════════════════════════════════════
-- Align support-table contracts used by the Edge Functions.
ALTER TABLE IF EXISTS public.error_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE IF EXISTS public.security_events
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

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
  v_table_name TEXT;
  table_names CONSTANT TEXT[] := ARRAY[
    'employees',
    'departments',
    'leave_balance',
    'leave_settings',
    'holidays'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY table_names LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = v_table_name
        AND information_schema.columns.column_name = 'tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_select', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_insert', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_update', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_delete', v_table_name);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id())',
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
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) Attendance: staff can manage; employees can only see their own records
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table_name TEXT;
  table_names CONSTANT TEXT[] := ARRAY['attendance_logs', 'attendance_summary'];
BEGIN
  FOREACH v_table_name IN ARRAY table_names LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = v_table_name
        AND information_schema.columns.column_name = 'tenant_id'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = v_table_name
            AND c2.column_name = 'employee_id'
        )
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_select', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_insert', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_update', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_delete', v_table_name);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id()))',
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
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Employee-owned requests: own read/create; staff review/write
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table_name TEXT;
  table_names CONSTANT TEXT[] := ARRAY['permissions', 'permissions_request', 'leaves'];
BEGIN
  FOREACH v_table_name IN ARRAY table_names LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = v_table_name
        AND information_schema.columns.column_name = 'tenant_id'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = v_table_name
            AND c2.column_name = 'employee_id'
        )
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_select', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_insert', v_table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_update', v_table_name);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id()))',
        'kyvzon_' || v_table_name || '_select', v_table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id()))',
        'kyvzon_' || v_table_name || '_insert', v_table_name
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR employee_id = public.current_user_employee_id())) WITH CHECK (tenant_id = public.current_user_tenant_id())',
        'kyvzon_' || v_table_name || '_update', v_table_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Never grant the client broad table privileges; service_role bypasses RLS by design.
-- Validate policies on staging with both an employee JWT and an HR/admin JWT.


-- ============================================================================
-- Kyvzon Platform — 104_device_sync_nonces.sql
-- PURPOSE: Replay protection for signed biometric sync requests
-- DEPENDS ON: pgcrypto
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_sync_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_sync_nonces_expires_at
  ON public.device_sync_nonces (expires_at);

ALTER TABLE public.device_sync_nonces ENABLE ROW LEVEL SECURITY;

-- No client policy is intentional. Only the Edge Function service role writes here.
REVOKE ALL ON TABLE public.device_sync_nonces FROM anon, authenticated;


-- ============================================================================
-- Kyvzon Platform — 105_hr_modules_tenant_rls.sql
-- PURPOSE: Add tenant_id and deny-by-default RLS to HR module tables
-- DEPENDS ON: 103_secure_tenant_isolation.sql, 999_fix_all_missing_tables.sql
-- ============================================================================

DO $$
DECLARE
  v_table_name TEXT;
  has_employee_id BOOLEAN;
  table_names CONSTANT TEXT[] := ARRAY[
    'payroll_periods', 'payroll_records', 'employee_loans', 'loan_repayments',
    'bonuses', 'expense_requests', 'payroll_settings', 'performance_cycles',
    'performance_reviews', 'disciplinary_actions', 'shift_schedules',
    'shift_assignments', 'job_postings', 'onboarding_tasks',
    'employee_onboarding', 'offboarding_records', 'employee_documents',
    'employee_certifications', 'payroll', 'biometric_devices',
    'permission_audit_logs', 'tenant_subscriptions', 'platform_audit_log'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY table_names LOOP
    IF to_regclass('public.' || v_table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE',
      v_table_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      'idx_' || v_table_name || '_tenant_id', v_table_name
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);

    -- Remove the insecure policies formerly created by 999_fix_all_missing_tables.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_select_all', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_insert_all', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_update_all', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_delete_all', v_table_name);

    has_employee_id := EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table_name
        AND c.column_name = 'employee_id'
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_select', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND %s)',
      'kyvzon_' || v_table_name || '_select',
      v_table_name,
      CASE
        WHEN has_employee_id THEN '(public.current_user_is_staff() OR employee_id = public.current_user_employee_id())'
        ELSE 'public.current_user_is_staff()'
      END
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_insert', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
      'kyvzon_' || v_table_name || '_insert', v_table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_update', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) WITH CHECK (tenant_id = public.current_user_tenant_id())',
      'kyvzon_' || v_table_name || '_update', v_table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_delete', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
      'kyvzon_' || v_table_name || '_delete', v_table_name
    );
  END LOOP;
END;
$$;

-- Existing rows with NULL tenant_id are intentionally inaccessible until they
-- are explicitly assigned to a tenant by a controlled backfill procedure.


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


-- ============================================================================
-- Kyvzon Platform — 107_employee_features_tenant_rls.sql
-- PURPOSE: Tenant isolation for employee portal feature tables
-- DEPENDS ON: 001_add_missing_tables.sql, 103_secure_tenant_isolation.sql
-- ============================================================================

DO $$
DECLARE
  v_table_name TEXT;
  has_employee_id BOOLEAN;
  has_user_id BOOLEAN;
  table_names CONSTANT TEXT[] := ARRAY[
    'incidents', 'incident_comments', 'sops', 'sop_readings',
    'courses', 'course_modules', 'course_progress', 'survey_responses',
    'wellness_entries', 'hr_messages'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY table_names LOOP
    IF to_regclass('public.' || v_table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE',
      v_table_name
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'idx_' || v_table_name || '_tenant_id', v_table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_select_all', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_insert_all', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_update_all', v_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table_name || '_delete_all', v_table_name);

    has_employee_id := EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_table_name AND c.column_name = 'employee_id'
    );
    has_user_id := EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_table_name AND c.column_name = 'user_id'
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_select', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND %s)',
      'kyvzon_' || v_table_name || '_select', v_table_name,
      CASE
        WHEN has_employee_id THEN '(public.current_user_is_staff() OR employee_id = public.current_user_employee_id())'
        WHEN has_user_id THEN '(public.current_user_is_staff() OR user_id = auth.uid())'
        ELSE 'true'
      END
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_insert', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND (%s))',
      'kyvzon_' || v_table_name || '_insert', v_table_name,
      CASE
        WHEN has_employee_id THEN '(public.current_user_is_staff() OR employee_id = public.current_user_employee_id())'
        WHEN has_user_id THEN '(public.current_user_is_staff() OR user_id = auth.uid())'
        ELSE 'public.current_user_is_staff()'
      END
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_update', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) WITH CHECK (tenant_id = public.current_user_tenant_id())',
      'kyvzon_' || v_table_name || '_update', v_table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_table_name || '_delete', v_table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
      'kyvzon_' || v_table_name || '_delete', v_table_name
    );
  END LOOP;
END;
$$;
