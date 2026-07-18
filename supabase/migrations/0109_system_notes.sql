CREATE TABLE IF NOT EXISTS system_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  note_content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_immutable BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_system_notes_tenant ON system_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_notes_entity ON system_notes(entity_type, entity_id);
ALTER TABLE system_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_notes_select ON system_notes FOR SELECT USING (tenant_id = current_user_tenant_id());
CREATE POLICY system_notes_insert ON system_notes FOR INSERT WITH CHECK (tenant_id = current_user_tenant_id());
CREATE POLICY system_notes_delete ON system_notes FOR DELETE USING (false);
