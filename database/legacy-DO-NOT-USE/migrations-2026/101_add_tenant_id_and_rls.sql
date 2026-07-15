-- ════════════════════════════════════════════════════════════════
--  FILE: 101_add_tenant_id_and_rls.sql
--  PURPOSE: Add tenant_id to all business tables + Enable RLS
--  EXECUTION ORDER: 3
--  DEPENDS ON: 006_multi_tenant.sql
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: ADD tenant_id COLUMN TO CORE TABLES
-- ════════════════════════════════════════════════════════════════

-- Employees
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Departments
ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Attendance Logs
ALTER TABLE attendance_logs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Attendance Summary
ALTER TABLE attendance_summary
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Permissions
ALTER TABLE permissions
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Permission Requests
ALTER TABLE permissions_request
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Leaves
ALTER TABLE leaves
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Leave Balance
ALTER TABLE leave_balance
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Leave Settings
ALTER TABLE leave_settings
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Holidays
ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: ENABLE RLS ON BUSINESS TABLES
-- ════════════════════════════════════════════════════════════════

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: TENANT ISOLATION POLICIES
-- ════════════════════════════════════════════════════════════════

-- Employees
DROP POLICY IF EXISTS "employees_tenant_isolation" ON employees;
CREATE POLICY "employees_tenant_isolation" ON employees
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Departments
DROP POLICY IF EXISTS "departments_tenant_isolation" ON departments;
CREATE POLICY "departments_tenant_isolation" ON departments
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Attendance Logs
DROP POLICY IF EXISTS "attendance_logs_tenant_isolation" ON attendance_logs;
CREATE POLICY "attendance_logs_tenant_isolation" ON attendance_logs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Attendance Summary
DROP POLICY IF EXISTS "attendance_summary_tenant_isolation" ON attendance_summary;
CREATE POLICY "attendance_summary_tenant_isolation" ON attendance_summary
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════