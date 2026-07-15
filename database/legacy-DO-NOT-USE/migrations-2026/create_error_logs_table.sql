-- ════════════════════════════════════════════════════════════════
--  FILE: create_error_logs_table.sql
--  PURPOSE: Create Error Logs Table
--  EXECUTION ORDER: 32
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    message TEXT NOT NULL,
    source TEXT,
    stack_trace TEXT,
    severity TEXT,
    category TEXT,
    file_name TEXT,
    line_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_tenant ON error_logs(tenant_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════