-- ============================================================================
--  FILE: 0014_structure_reference_rls.sql
--  PURPOSE: Enable RLS on structure_* reference tables (departments/positions/
--           ranks/roles/shifts). These are shared reference data, not tenant-
--           scoped, so the policies are:
--             - SELECT: any authenticated user (read-only reference).
--             - INSERT/UPDATE/DELETE: staff only (admin/hr/developer/it_admin).
--  EXECUTION ORDER: 15th (must be after 0007_support_and_security.sql which
--                   defines current_user_is_staff)
--  DEPENDS ON: 0001 (which creates these tables), 0007 (helper functions)
--  SAFETY LEVEL: HIGH — closes an RLS gap detected by clean-DB test.
-- ============================================================================
--
--  Rationale:
--    These tables were introduced in 0001_core_schema.sql without RLS
--    because they were considered "system" tables. However, having them
--    unprotected means an authenticated user could truncate them.
--    Reference data should still require *authentication* to read and
--    *staff role* to write.
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  reference_tables CONSTANT TEXT[] := ARRAY[
    'structure_departments',
    'structure_positions',
    'structure_ranks',
    'structure_roles',
    'structure_shifts'
  ];
BEGIN
  FOREACH tbl IN ARRAY reference_tables LOOP
    -- Skip silently if the table doesn't exist (older environments)
    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE NOTICE 'Skipping %: table does not exist', tbl;
      CONTINUE;
    END IF;

    -- Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop old policies if any (idempotent re-run)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   'kyvzon_' || tbl || '_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   'kyvzon_' || tbl || '_write', tbl);

    -- SELECT: any authenticated user
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      'kyvzon_' || tbl || '_select', tbl
    );

    -- INSERT/UPDATE/DELETE: staff only
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.current_user_is_staff()) '
      'WITH CHECK (public.current_user_is_staff())',
      'kyvzon_' || tbl || '_write', tbl
    );
  END LOOP;
END $$;

-- ─── Sanity check ───────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'structure_departments', 'structure_positions', 'structure_ranks',
    'structure_roles', 'structure_shifts'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    ASSERT (SELECT rowsecurity FROM pg_tables
            WHERE schemaname = 'public' AND tablename = tbl),
      format('RLS should be enabled on %s', tbl);
  END LOOP;
  RAISE NOTICE 'CHECK PASSED — RLS enabled on all structure_* reference tables';
END $$;
