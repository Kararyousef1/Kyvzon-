-- ============================================================================
-- FILE: 0271_movement_rbac_functions.sql
-- PURPOSE: Movement & Logistics Gateway - RBAC Functions, Security & Revocation
-- ============================================================================

-- Function: Check if user has a specific movement role
CREATE OR REPLACE FUNCTION public.movement_has_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.movement_role_assignments
    WHERE tenant_id = public.current_user_tenant_id()
      AND user_id = p_user_id
      AND portal_role = p_role
      AND is_active = TRUE
  );
$$;

-- Function: Get current user movement roles array
CREATE OR REPLACE FUNCTION public.current_user_movement_roles()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(portal_role), ARRAY[]::TEXT[])
  FROM public.movement_role_assignments
  WHERE tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
    AND is_active = TRUE;
$$;

-- Security hardening: Revoke EXECUTE from PUBLIC, anon, authenticated by default
REVOKE ALL ON FUNCTION public.movement_has_role(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_has_role(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movement_has_role(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_movement_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_movement_roles() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_movement_roles() TO authenticated, service_role;

-- Verification assertions
DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.movement_has_role(UUID, TEXT)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.movement_has_role(UUID, TEXT)', 'EXECUTE');
  ASSERT has_function_privilege('authenticated', 'public.current_user_movement_roles()', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.current_user_movement_roles()', 'EXECUTE');
END $$;
