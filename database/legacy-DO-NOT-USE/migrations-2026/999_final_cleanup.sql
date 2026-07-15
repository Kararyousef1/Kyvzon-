-- ════════════════════════════════════════════════════════════════
--  FILE: 999_final_cleanup.sql
--  PURPOSE: Final Cleanup and Additional Security Tables
--  EXECUTION ORDER: 99 (LAST)
--  DEPENDS ON: All previous files
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

-- Error Logs
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

-- Security Events
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),
    ip_address INET,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_tenant ON error_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON security_events(tenant_id);

-- ════════════════════════════════════════════════════════════════
--  END OF ALL MIGRATIONS
--  ════════════════════════════════════════════════════════════════