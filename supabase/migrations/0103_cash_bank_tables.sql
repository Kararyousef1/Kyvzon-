CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  account_name VARCHAR(100), account_number VARCHAR(50), bank_name VARCHAR(100),
  currency VARCHAR(3) DEFAULT 'SAR', balance NUMERIC(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_tenant ON bank_accounts(tenant_id);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
  reconciliation_date DATE NOT NULL, statement_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  adjusted_balance NUMERIC(15,2) NOT NULL DEFAULT 0, difference NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recon_tenant ON bank_reconciliations(tenant_id);
