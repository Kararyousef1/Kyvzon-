-- ════════════════════════════════════════════════════════════════
--  FILE: 003_indexes.sql
--  PURPOSE: Performance Indexes
--  EXECUTION ORDER: 3 (Can be executed after 001)
--  SAFETY: HIGH - Uses IF NOT EXISTS
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: EMPLOYEES INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_employees_department_id 
    ON employees(department_id);

CREATE INDEX IF NOT EXISTS idx_employees_manager_id 
    ON employees(manager_id);

CREATE INDEX IF NOT EXISTS idx_employees_is_active 
    ON employees(is_active);

CREATE INDEX IF NOT EXISTS idx_employees_hire_date 
    ON employees(hire_date);

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: PROFILES INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_role 
    ON profiles(role);

CREATE INDEX IF NOT EXISTS idx_profiles_status 
    ON profiles(status);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: NOTES
-- ════════════════════════════════════════════════════════════════
--  These indexes improve query performance on frequently filtered columns.
--  Add more indexes based on your actual query patterns.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════