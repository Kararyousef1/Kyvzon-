-- ════════════════════════════════════════════════════════════════
--  FILE: 060_create_sops_tables.sql
--  PURPOSE: Create SOPs (Standard Operating Procedures) Table
--  EXECUTION ORDER: 9
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    department_id UUID REFERENCES departments(id),
    content TEXT,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sops_department ON sops(department_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════