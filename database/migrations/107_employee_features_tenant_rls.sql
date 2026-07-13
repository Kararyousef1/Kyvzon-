-- ============================================================================
-- Kyvzon Platform — 107_employee_features_tenant_rls.sql
-- PURPOSE: Tenant isolation for employee portal feature tables
-- DEPENDS ON: 001_add_missing_tables.sql, 103_secure_tenant_isolation.sql
-- ============================================================================

DO $$
DECLARE
  table_name TEXT;
  has_employee_id BOOLEAN;
  has_user_id BOOLEAN;
  table_names CONSTANT TEXT[] := ARRAY[
    'incidents', 'incident_comments', 'sops', 'sop_readings',
    'courses', 'course_modules', 'course_progress', 'survey_responses',
    'wellness_entries', 'hr_messages'
  ];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE',
      table_name
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'idx_' || table_name || '_tenant_id', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_select_all', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_insert_all', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_update_all', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_delete_all', table_name);

    has_employee_id := EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = table_name AND c.column_name = 'employee_id'
    );
    has_user_id := EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = table_name AND c.column_name = 'user_id'
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_select', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND %s)',
      'kyvzon_' || table_name || '_select', table_name,
      CASE
        WHEN has_employee_id THEN '(public.current_user_is_staff() OR employee_id = public.current_user_employee_id())'
        WHEN has_user_id THEN '(public.current_user_is_staff() OR user_id = auth.uid())'
        ELSE 'true'
      END
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_insert', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND (%s))',
      'kyvzon_' || table_name || '_insert', table_name,
      CASE
        WHEN has_employee_id THEN '(public.current_user_is_staff() OR employee_id = public.current_user_employee_id())'
        WHEN has_user_id THEN '(public.current_user_is_staff() OR user_id = auth.uid())'
        ELSE 'public.current_user_is_staff()'
      END
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_update', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) WITH CHECK (tenant_id = public.current_user_tenant_id())',
      'kyvzon_' || table_name || '_update', table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || table_name || '_delete', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())',
      'kyvzon_' || table_name || '_delete', table_name
    );
  END LOOP;
END;
$$;
