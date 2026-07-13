-- ════════════════════════════════════════════════════════════════
--  FILE: add_permissions_request_table.sql
--  PURPOSE: Create Permissions Request Table
--  EXECUTION ORDER: 31
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS permissions_request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    permission_type TEXT NOT NULL,
    expected_out_time TIME,
    expected_return_time TIME,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_request_employee ON permissions_request(employee_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════