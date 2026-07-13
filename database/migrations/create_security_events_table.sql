-- ════════════════════════════════════════════════════════════════
--  FILE: create_security_events_table.sql
--  PURPOSE: Create Security Events Table
--  EXECUTION ORDER: 33
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),
    ip_address INET,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON security_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════