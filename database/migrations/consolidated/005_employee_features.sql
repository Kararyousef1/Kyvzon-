-- ════════════════════════════════════════════════════════════════
--  FILE: 005_employee_features.sql
--  PURPOSE: Employee-related features (Attendance, Leave, Breaks)
--  EXECUTION ORDER: 5 (After 001_core_schema.sql)
--  SAFETY: HIGH - Uses IF NOT EXISTS
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: ATTENDANCE LOGS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    punch_time TIMESTAMPTZ NOT NULL,
    punch_type TEXT CHECK (punch_type IN ('in', 'out')),
    shift_type TEXT,
    shift_date DATE,
    device_id TEXT,
    verification_type TEXT,
    raw_data JSONB,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: ATTENDANCE SUMMARY
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS attendance_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    shift_type TEXT,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    total_hours NUMERIC(5,2),
    late_minutes INTEGER DEFAULT 0,
    early_leave_minutes INTEGER DEFAULT 0,
    overtime_minutes INTEGER DEFAULT 0,
    status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_attendance_summary UNIQUE (employee_id, shift_date)
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: LEAVE REQUESTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    working_days_count INTEGER,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    approved_by UUID REFERENCES profiles(id),
    reason TEXT,
    attachment_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: EMPLOYEE BREAKS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employee_breaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    break_type TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    status TEXT CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 5: INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_date 
    ON attendance_logs(employee_id, punch_time);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee 
    ON leave_requests(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_breaks_employee 
    ON employee_breaks(employee_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════