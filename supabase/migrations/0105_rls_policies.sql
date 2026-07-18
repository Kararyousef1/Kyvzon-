-- ════════════════════════════════════════════════════════════════
--  FILE: 0105_rls_policies.sql — Financial Portal RLS
--  ════════════════════════════════════════════════════════════════

CREATE POLICY chart_select ON chart_of_accounts
    FOR SELECT USING (tenant_id = current_user_tenant_id());

CREATE POLICY chart_insert ON chart_of_accounts
    FOR INSERT WITH CHECK (tenant_id = current_user_tenant_id());

CREATE POLICY chart_update ON chart_of_accounts
    FOR UPDATE USING (tenant_id = current_user_tenant_id())
    WITH CHECK (tenant_id = current_user_tenant_id());

CREATE POLICY chart_delete ON chart_of_accounts
    FOR DELETE USING (tenant_id = current_user_tenant_id());

CREATE POLICY journal_select ON journal_entries
    FOR SELECT USING (tenant_id = current_user_tenant_id());

CREATE POLICY journal_insert ON journal_entries
    FOR INSERT WITH CHECK (tenant_id = current_user_tenant_id());

CREATE POLICY journal_update ON journal_entries
    FOR UPDATE USING (tenant_id = current_user_tenant_id())
    WITH CHECK (tenant_id = current_user_tenant_id());

CREATE POLICY journal_delete ON journal_entries
    FOR DELETE USING (tenant_id = current_user_tenant_id());

CREATE POLICY line_select ON journal_entry_lines
    FOR SELECT USING (tenant_id = current_user_tenant_id());

CREATE POLICY line_insert ON journal_entry_lines
    FOR INSERT WITH CHECK (tenant_id = current_user_tenant_id());

CREATE POLICY line_update ON journal_entry_lines
    FOR UPDATE USING (tenant_id = current_user_tenant_id())
    WITH CHECK (tenant_id = current_user_tenant_id());
