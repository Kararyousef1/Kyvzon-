-- ════════════════════════════════════════════════════════════════
--  FILE: 001_unify_profiles_employees.sql
--  PURPOSE: Unify User Creation Logic (handle_new_user trigger)
--  EXECUTION ORDER: 5
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: IMPROVED handle_new_user FUNCTION
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
    v_role TEXT;
BEGIN
    -- Extract metadata with safe defaults
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        NEW.email,
        'مستخدم جديد'
    );

    v_role := COALESCE(
        NEW.raw_user_meta_data->>'role',
        'employee'
    );

    -- Insert or update profile
    INSERT INTO public.profiles (
        id, 
        full_name, 
        email, 
        role, 
        status, 
        created_at, 
        updated_at
    )
    VALUES (
        NEW.id, 
        v_full_name, 
        NEW.email, 
        v_role, 
        'active', 
        NOW(), 
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET 
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: CREATE TRIGGER (if not exists)
-- ════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════