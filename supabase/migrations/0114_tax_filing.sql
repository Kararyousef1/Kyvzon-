CREATE TABLE IF NOT EXISTS tax_filing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  tax_period VARCHAR(20) NOT NULL, filing_type VARCHAR(30) NOT NULL DEFAULT 'vat',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected')),
  due_date DATE, submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tax_filing_tenant ON tax_filing_status(tenant_id);
