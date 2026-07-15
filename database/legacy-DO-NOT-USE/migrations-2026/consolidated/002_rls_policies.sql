-- ════════════════════════════════════════════════════════════════
--  FILE: 002_rls_policies.sql
--  PURPOSE: Row Level Security Policies (Tenant Isolation)
--  EXECUTION ORDER: 2 (MUST BE AFTER 001_core_schema.sql)
--  SAFETY: HIGH - Uses IF NOT EXISTS where possible
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: ENABLE RLS ON CORE TABLES
-- ════════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: TENANT ISOLATION POLICIES
--  These policies ensure users can only access their own tenant's data
-- ════════════════════════════════════════════════════════════════

-- Profiles: Users can only see profiles in their tenant
DROP POLICY IF EXISTS "profiles_tenant_isolation" ON profiles;
CREATE POLICY "profiles_tenant_isolation" ON profiles
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Employees: Users can only see employees in their tenant
DROP POLICY IF EXISTS "employees_tenant_isolation" ON employees;
CREATE POLICY "employees_tenant_isolation" ON employees
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Departments: Users can only see departments in their tenant
DROP POLICY IF EXISTS "departments_tenant_isolation" ON departments;
CREATE POLICY "departments_tenant_isolation" ON departments
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: ADDITIONAL SECURITY POLICIES
--  (Add more policies here as needed)
-- ════════════════════════════════════════════════════════════════

-- Example: Allow users to update their own profile
DROP POLICY IF EXISTS "users_can_update_own_profile" ON profiles;
CREATE POLICY "users_can_update_own_profile" ON profiles
    FOR UPDATE
    USING (id = auth.uid());

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: NOTES
-- ════════════════════════════════════════════════════════════════
--  IMPORTANT:
--  1. These policies assume you will set the tenant context using:
--     SET app.current_tenant_id = 'your-tenant-uuid';
--
--  2. For production, consider using Supabase Auth + RLS functions
--     instead of current_setting for better security.
--
--  3. Always test these policies thoroughly before going live.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  NEXT FILE TO EXECUTE: 003_indexes.sql
--  ════════════════════════════════════════════════════════════════