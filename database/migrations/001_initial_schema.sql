-- ════════════════════════════════════════════════════════════════
--  FILE: 001_initial_schema.sql
--  PURPOSE: Core Schema - Initial Tables and Enums
--  EXECUTION ORDER: 1
--  DEPENDS ON: None
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: EXTENSIONS
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: ENUMS (Custom Types)
-- ════════════════════════════════════════════════════════════════

-- User Roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'employee', 'hr', 'manager', 'supervisor', 'admin', 
        'gatekeeper', 'developer', 'it_admin', 'kiosk'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- User Status
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'on_leave');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Incident Status
DO $$ BEGIN
    CREATE TYPE incident_status AS ENUM ('pending', 'in_progress', 'resolved', 'closed', 'escalated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Incident Severity
DO $$ BEGIN
    CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Log Type
DO $$ BEGIN
    CREATE TYPE log_type AS ENUM ('check_in', 'check_out', 'break_start', 'break_end');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: PROFILES TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    role user_role DEFAULT 'employee',
    rank TEXT,
    department TEXT,
    position TEXT,
    phone TEXT,
    location TEXT,
    profile_image TEXT,
    manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status user_status DEFAULT 'active',
    permissions TEXT[] DEFAULT '{}',
    gatekeeper_type TEXT,
    gatekeeper_pin TEXT,
    salary NUMERIC(12,2),
    salary_currency TEXT DEFAULT 'SAR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: TIME LOGS (Attendance)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    log_type log_type NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    kiosk_id UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 5: INCIDENTS (Problems & Reports)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    severity incident_severity DEFAULT 'medium',
    status incident_status DEFAULT 'pending',
    is_anonymous BOOLEAN DEFAULT FALSE,
    reported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ai_analysis JSONB,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 6: MOVEMENTS LOG
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS movements_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    employee_name VARCHAR(255),
    department VARCHAR(255),
    logged_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    destination TEXT NOT NULL,
    departure_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    returned_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 7: HR MESSAGES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hr_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 8: BASIC INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_time_logs_employee ON time_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_movements_employee ON movements_log(employee_id);

-- ════════════════════════════════════════════════════════════════
--  SECTION 9: UPDATED_AT TRIGGER
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables that have updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents;
CREATE TRIGGER update_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  NEXT FILE TO EXECUTE: 006_multi_tenant.sql (or 101_add_tenant_id_and_rls.sql)
--  ════════════════════════════════════════════════════════════════