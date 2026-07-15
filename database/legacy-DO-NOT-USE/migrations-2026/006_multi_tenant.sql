-- ════════════════════════════════════════════════════════════════
--  FILE: 006_multi_tenant.sql
--  PURPOSE: Multi-Tenant Support (تعدد الشركات)
--  EXECUTION ORDER: 2
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: TENANTS TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar VARCHAR(200) NOT NULL,
    name_en VARCHAR(200),
    code VARCHAR(10) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    subscription_tier VARCHAR(50) DEFAULT 'basic'
        CHECK (subscription_tier IN ('basic', 'professional', 'enterprise')),
    subscription_ends_at TIMESTAMPTZ,
    max_employees INTEGER DEFAULT 100,
    max_departments INTEGER DEFAULT 20,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: USER_TENANTS TABLE (ربط المستخدمين بالشركات)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_tenants (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'employee'
        CHECK (role IN ('developer', 'system_admin', 'manager', 'employee', 'gatekeeper')),
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_tenant UNIQUE (user_id, tenant_id)
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tenants_code ON tenants(code);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: UPDATED_AT TRIGGER
-- ════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  NEXT FILE TO EXECUTE: 101_add_tenant_id_and_rls.sql
--  ════════════════════════════════════════════════════════════════