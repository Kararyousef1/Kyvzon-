CREATE TABLE IF NOT EXISTS tax_codes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, code VARCHAR(20) NOT NULL, name VARCHAR(100), rate NUMERIC(5,4) NOT NULL DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_tax_tenant ON tax_codes(tenant_id);
CREATE TABLE IF NOT EXISTS budgets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, budget_name VARCHAR(100) NOT NULL, fiscal_year INTEGER NOT NULL, start_date DATE, end_date DATE, status VARCHAR(20) DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_budget_tenant ON budgets(tenant_id);
CREATE TABLE IF NOT EXISTS budget_lines (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE, account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT, budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_budget_line_budget ON budget_lines(budget_id);
