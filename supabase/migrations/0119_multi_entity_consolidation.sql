CREATE TABLE IF NOT EXISTS subsidiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), parent_tenant UUID REFERENCES tenants(id) ON DELETE CASCADE,
  subsidiary_tenant UUID REFERENCES tenants(id) ON DELETE CASCADE,
  consolidation_method VARCHAR(30) DEFAULT 'full' CHECK (consolidation_method IN ('full','equity','proportional')),
  elimination_policy JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subsidiaries_parent ON subsidiaries(parent_tenant);
CREATE INDEX IF NOT EXISTS idx_subsidiaries_sub ON subsidiaries(subsidiary_tenant);
CREATE TABLE IF NOT EXISTS consolidation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), parent_tenant UUID REFERENCES tenants(id) ON DELETE CASCADE,
  subsidiary_tenant UUID REFERENCES tenants(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL, description TEXT,
  debit_amount NUMERIC(15,2) DEFAULT 0, credit_amount NUMERIC(15,2) DEFAULT 0,
  elimination_type VARCHAR(30) NOT NULL DEFAULT 'intercompany',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consolidation_tenant ON consolidation_entries(parent_tenant);
