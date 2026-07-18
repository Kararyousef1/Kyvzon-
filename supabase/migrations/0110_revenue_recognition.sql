CREATE TABLE IF NOT EXISTS revenue_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  contract_number VARCHAR(50) NOT NULL, customer_name VARCHAR(200),
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  contract_start DATE NOT NULL, contract_end DATE,
  recognition_method VARCHAR(30) DEFAULT 'straight_line' CHECK (recognition_method IN ('straight_line','milestone','usage_based')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft','active','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rev_contract_tenant ON revenue_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rev_contract_status ON revenue_contracts(status);

CREATE TABLE IF NOT EXISTS revenue_recognition_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_id UUID REFERENCES revenue_contracts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  recognized_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  cumulative_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','recognized','adjusted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rev_schedule_contract ON revenue_recognition_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_rev_schedule_period ON revenue_recognition_schedules(period_start, period_end);
