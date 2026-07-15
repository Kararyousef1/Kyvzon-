-- ============================================================================
--  FILE: 0000_extensions.sql
--  PURPOSE: Ensure required PostgreSQL extensions are enabled
--  EXECUTION ORDER: 1st (before any table creation)
--  DEPENDS ON: —
--  SAFETY LEVEL: HIGH — must run before anything else
-- ============================================================================
--
--  Extensions required by Kyvzon schema:
--  - pgcrypto  → gen_random_uuid()  (used as DEFAULT in almost every PK)
--  - uuid-ossp → uuid_generate_v4() (fallback, some legacy code paths)
--
--  Both are already available in Supabase's Postgres image; this file just
--  makes the dependency explicit and idempotent.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
--  Sanity check: fail loudly if extensions were not installed for any reason.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'pgcrypto extension is required but not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    RAISE EXCEPTION 'uuid-ossp extension is required but not installed';
  END IF;
END $$;
