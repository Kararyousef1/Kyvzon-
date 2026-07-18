CREATE TABLE IF NOT EXISTS bank_statement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
  import_date DATE NOT NULL DEFAULT CURRENT_DATE,
  file_path VARCHAR(500), status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  total_imported INTEGER DEFAULT 0, total_matched INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_import_tenant ON bank_statement_imports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_import_account ON bank_statement_imports(bank_account_id);
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), import_id UUID REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL, description TEXT, amount NUMERIC(15,2) NOT NULL,
  matched BOOLEAN DEFAULT false, matched_to_journal UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_statement_line_import ON bank_statement_lines(import_id);
