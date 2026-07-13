-- ════════════════════════════════════════════════════════════════
--  FILE: 071_create_hr_modules.sql
--  PURPOSE: Create HR Modules Tables (Payroll, Performance, etc.)
--  EXECUTION ORDER: 21
--  DEPENDS ON: 001_initial_schema.sql, 070_create_payroll_tables.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

-- This file can contain additional HR module tables
-- Most tables are already created in 070_create_payroll_tables.sql

-- Performance Reviews
CREATE TABLE IF NOT EXISTS performance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES profiles(id),
    cycle_id UUID,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    comments TEXT,
    status TEXT DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee ON performance_reviews(employee_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════