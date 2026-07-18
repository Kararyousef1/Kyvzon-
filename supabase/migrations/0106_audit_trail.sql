CREATE TABLE IF NOT EXISTS audit_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  before_values JSONB,
  after_values JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_immutable BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_vault(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_vault(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_vault(timestamp);
ALTER TABLE audit_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_vault FOR SELECT USING (tenant_id = current_user_tenant_id());
