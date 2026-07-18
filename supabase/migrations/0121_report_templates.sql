CREATE TABLE IF NOT EXISTS financial_report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  template_name VARCHAR(100) NOT NULL, template_code VARCHAR(30) NOT NULL,
  report_type VARCHAR(30) NOT NULL CHECK (report_type IN ('pnl','balance_sheet','cash_flow','trial_balance','budget_variance','intercompany','tax_summary','fixed_assets','revenue_recognition','audit_trail')),
  description TEXT, format VARCHAR(20) DEFAULT 'pdf' CHECK (format IN ('pdf','excel','csv')),
  is_custom BOOLEAN DEFAULT false, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_templates_tenant ON financial_report_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_type ON financial_report_templates(report_type);
