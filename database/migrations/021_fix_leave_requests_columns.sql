-- ════════════════════════════════════════════════════════════════
--  FILE: 021_fix_leave_requests_columns.sql
--  PURPOSE: Add Missing Columns to leave_requests Table
--  EXECUTION ORDER: 20
--  DEPENDS ON: 020_fix_leave_requests_table.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

ALTER TABLE leave_requests 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════