-- ════════════════════════════════════════════════════════════════
--  FILE: 001_core_schema.sql
--  PURPOSE: Core Schema + Multi-Tenancy Foundation
--  EXECUTION ORDER: 1 (MUST BE FIRST)
--  SAFETY: HIGH - Uses IF NOT EXISTS everywhere
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: EXTENSIONS (Safe to run multiple times)
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: TENANTS TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    domain TEXT,
    plan TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('free', 'basic', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'deleted')),
    subscription_plan TEXT NOT NULL DEFAULT 'basic' CHECK (subscription_plan IN ('basic', 'professional', 'enterprise', 'custom')),
    subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'grace_period', 'expired', 'cancelled')),
    subscription_start_date DATE,
    subscription_end_date DATE,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    max_employees INTEGER NOT NULL DEFAULT 50 CHECK (max_employees > 0),
    max_departments INTEGER NOT NULL DEFAULT 20 CHECK (max_departments > 0),
    enabled_modules TEXT[] NOT NULL DEFAULT ARRAY['employee']::TEXT[],
    features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: PROFILES TABLE (Users)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'employee' CHECK (role IN (
        'employee', 'hr', 'manager', 'supervisor', 'admin', 
        'gatekeeper', 'developer', 'it_admin'
    )),
    rank TEXT,
    department TEXT,
    position TEXT,
    phone TEXT,
    location TEXT,
    profile_image TEXT,
    avatar_url TEXT,
    employee_id UUID,
    custom_permissions JSONB NOT NULL DEFAULT '{}'::JSONB,
    manager_id UUID,
    supervisor_id UUID,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    permissions TEXT[] DEFAULT '{}',
    gatekeeper_type TEXT,
    gatekeeper_pin TEXT,
    salary NUMERIC(12,2),
    salary_currency TEXT DEFAULT 'SAR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: DEPARTMENTS TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    manager_id UUID REFERENCES profiles(id),
    parent_department_id UUID REFERENCES departments(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 5: EMPLOYEES TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    employee_code TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    full_name_ar TEXT,
    email TEXT,
    phone TEXT,
    department_id UUID REFERENCES departments(id),
    position TEXT,
    role TEXT DEFAULT 'employee',
    manager_id UUID REFERENCES employees(id),
    hire_date DATE,
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_employee_code_per_tenant UNIQUE (tenant_id, employee_code)
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 6: BASIC INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status ON tenants(subscription_status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);

-- ════════════════════════════════════════════════════════════════
--  SECTION 7: UPDATED_AT TRIGGER FUNCTION
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
--  SECTION 8: APPLY TRIGGERS
-- ════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_departments_updated_at ON departments;
CREATE TRIGGER update_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════
--  NEXT FILE TO EXECUTE: 002_rls_policies.sql
--  ════════════════════════════════════════════════════════════════