-- ════════════════════════════════════════════════════════════════
--  FILE: 400_add_missing_indexes.sql
--  PURPOSE: Add Performance Indexes for All Tables
--  EXECUTION ORDER: 12
--  DEPENDS ON: All previous schema files
--  SAFETY LEVEL: HIGH
--  ════════════════════════════════════════════════════════════════

-- Employees
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

-- Incidents
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_employee ON incidents(reported_by);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_logs(employee_id, punch_time);

-- Payroll
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(payroll_period_id);

-- Performance Reviews (if table exists)
-- CREATE INDEX IF NOT EXISTS idx_performance_employee ON performance_reviews(employee_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════