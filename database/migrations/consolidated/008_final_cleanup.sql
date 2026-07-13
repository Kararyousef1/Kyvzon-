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