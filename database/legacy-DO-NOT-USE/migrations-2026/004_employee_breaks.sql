-- ════════════════════════════════════════════════════════════════
--  FILE: 004_employee_breaks.sql
--  PURPOSE: Employee Breaks System
--  EXECUTION ORDER: 15
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employee_breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    break_type TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    status TEXT CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_breaks_employee ON employee_breaks(employee_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════