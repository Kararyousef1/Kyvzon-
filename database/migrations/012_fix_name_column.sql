-- ════════════════════════════════════════════════════════════════
--  FILE: 012_fix_name_column.sql
--  PURPOSE: Ensure full_name column exists and is properly indexed
--  EXECUTION ORDER: 18
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

-- Make sure full_name column exists
ALTER TABLE profiles 
    ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Add index for search performance
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════