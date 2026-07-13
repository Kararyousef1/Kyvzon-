-- ════════════════════════════════════════════════════════════════
--  FILE: 010_fix_profiles_columns.sql
--  PURPOSE: Fix and Add Missing Columns to profiles Table
--  EXECUTION ORDER: 16
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

-- Add missing columns if they don't exist
ALTER TABLE profiles 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE profiles 
    ADD COLUMN IF NOT EXISTS full_name_ar TEXT;

ALTER TABLE profiles 
    ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '{}'::jsonb;

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════