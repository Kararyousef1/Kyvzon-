-- ════════════════════════════════════════════════════════════════
--  FILE: 030_fix_system_settings_rls.sql
--  PURPOSE: Enable RLS on system_settings table + Create proper policies
--  EXECUTION ORDER: 4
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: HIGH (Security Fix)
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: CREATE TABLE IF NOT EXISTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_settings (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    landing_config JSONB DEFAULT '{}'::jsonb,
    general_settings JSONB DEFAULT '{}'::jsonb,
    ai_settings JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: ENABLE ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: DROP OLD POLICIES (to avoid conflicts)
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Everyone can read system settings" ON system_settings;
DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: CREATE SECURE POLICIES
-- ════════════════════════════════════════════════════════════════

-- Allow everyone to read (needed for landing page before login)
CREATE POLICY "Everyone can read system settings" ON system_settings
    FOR SELECT USING (true);

-- Allow only admins to insert/update/delete
CREATE POLICY "Admins can manage system settings" ON system_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════