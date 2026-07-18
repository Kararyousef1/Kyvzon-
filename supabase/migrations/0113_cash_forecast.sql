CREATE TABLE IF NOT EXISTS cash_forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  scenario_name VARCHAR(100) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
  projected_cash NUMERIC(15,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecast_tenant ON cash_forecast_scenarios(tenant_id);
