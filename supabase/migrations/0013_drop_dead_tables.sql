-- ============================================================================
--  FILE: 0013_drop_dead_tables.sql
--  PURPOSE: Drop tables that are defined but not used by any SDK service
--  EXECUTION ORDER: 14th (last)
--  DEPENDS ON: 0006_hr_expansion.sql (which created most of them)
--  SAFETY LEVEL: MEDIUM — destructive but reversible via re-add migration
-- ============================================================================
--
--  Rationale:
--  The following tables were created in the canonical schema but no SDK
--  service or frontend code references them. Keeping them wastes schema
--  surface, storage, and complicates security review.
--
--  If any of these are needed in the future, add them back explicitly
--  with a new migration and a corresponding SDK service.
--
--  Analysis run: 2026-07-15  (grep of 'from(\'...\')' + super('...') across
--                             src/ and supabase/functions/)
--
--  Tables dropped:
--    - course_modules      → no code references, 'courses' table is used flat
--    - loan_repayments     → no code references, tracked in employee_loans.metadata
--    - shift_schedules     → superseded by shift_assignments
--
--  Retained despite low current usage (planned use or covered by 0010 RLS):
--    - export_logs         → referenced by 0010 RLS policies (audit surface)
--    - overtime_log        → referenced by 0010 RLS policies (audit surface)
--    - tawathul_attachments, tawathul_reactions, tawathul_notifications,
--      tawathul_entity_links, tawathul_settings
--    - course_progress
--
--  IMPORTANT: This is intentionally the LAST migration so any staging
--  environment that already has data in these tables can be inspected
--  BEFORE dropping (open the migration, comment out lines, re-run).
-- ============================================================================

-- Fail-safe: refuse to run if any of these tables actually contain rows.
DO $$
DECLARE
  tbl TEXT;
  cnt BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'course_modules',
    'loan_repayments',
    'shift_schedules'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', tbl) INTO cnt;
      IF cnt > 0 THEN
        RAISE EXCEPTION
          'Refusing to drop % — it contains % rows. '
          'Inspect and migrate the data first, then either backfill '
          'into the surviving table or comment out this table in '
          '0013_drop_dead_tables.sql.', tbl, cnt;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ─── Drops ──────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.course_modules   CASCADE;
DROP TABLE IF EXISTS public.loan_repayments  CASCADE;
DROP TABLE IF EXISTS public.shift_schedules  CASCADE;

-- ─── Post-drop verification ─────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'course_modules',
    'loan_repayments',
    'shift_schedules'
  ] LOOP
    ASSERT NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ), format('Table %s should have been dropped but still exists', tbl);
  END LOOP;
END $$;
