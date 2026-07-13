-- ════════════════════════════════════════════════════════════════
--  FILE: 102_set_session_context_rpc.sql
--  PURPOSE: Create RPC Functions for Session Context
--  EXECUTION ORDER: 26
--  DEPENDS ON: 006_multi_tenant.sql, 101_add_tenant_id_and_rls.sql
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

-- Function to set session context (used for RLS)
CREATE OR REPLACE FUNCTION set_session_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    -- This function should be customized based on your auth logic
    -- Example implementation:
    SELECT jsonb_build_object(
        'resolved_role', COALESCE(
            (SELECT role FROM profiles WHERE id = auth.uid()),
            'employee'
        ),
        'resolved_tenant_id', COALESCE(
            (SELECT tenant_id FROM profiles WHERE id = auth.uid()),
            NULL
        ),
        'is_owner', COALESCE(
            (SELECT role = 'admin' FROM profiles WHERE id = auth.uid()),
            false
        )
    ) INTO result;
    
    RETURN result;
END;
$$;

-- Function to clear session context
CREATE OR REPLACE FUNCTION clear_session_context()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Clear any session variables if needed
    PERFORM set_config('app.current_tenant_id', '', true);
END;
$$;

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════