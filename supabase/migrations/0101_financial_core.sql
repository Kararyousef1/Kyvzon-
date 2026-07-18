-- ════════════════════════════════════════════════════════════════
--  FILE: 0101_financial_core.sql
--  MODULE: Financial Portal (بوابة المالية)
--  EXECUTION ORDER: 101 (بعد جميع migrations الحالية)
--  SAFETY: HIGH — IF NOT EXISTS + IF NOT EXISTS
--  ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name TEXT NOT NULL,
    name_ar TEXT,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
    parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 4),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chart_tenant ON chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chart_code ON chart_of_accounts(code);
CREATE INDEX IF NOT EXISTS idx_chart_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_chart_parent ON chart_of_accounts(parent_id);

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entry_number VARCHAR(20) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    reference TEXT,
    total_debit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
    total_credit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT balanced_check CHECK (total_debit = total_credit)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_tenant_number ON journal_entries(tenant_id, entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_tenant_date ON journal_entries(tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_tenant_status ON journal_entries(tenant_id, status);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    description TEXT,
    debit_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
    credit_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
    reference VARCHAR(100),
    cost_center UUID,
    project_code VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT line_amount_check CHECK (debit_amount > 0 OR credit_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_line_tenant ON journal_entry_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_line_entry ON journal_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_line_account ON journal_entry_lines(account_id);

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
