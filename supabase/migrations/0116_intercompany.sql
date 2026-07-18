CREATE TABLE IF NOT EXISTS intercompany_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  source_tenant UUID REFERENCES tenants(id) ON DELETE CASCADE,
  target_tenant UUID REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_type VARCHAR(30) NOT NULL DEFAULT 'transfer' CHECK (transaction_type IN ('transfer','fee','loan')),
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'SAR',
  reference VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','matched','eliminated')),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inter_tenant ON intercompany_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inter_source ON intercompany_transactions(source_tenant);
CREATE INDEX IF NOT EXISTS idx_inter_target ON intercompany_transactions(target_tenant);
