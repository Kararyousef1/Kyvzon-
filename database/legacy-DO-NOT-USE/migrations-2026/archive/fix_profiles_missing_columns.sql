-- إضافة الأعمدة المفقودة في جدول profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gatekeeper_pin VARCHAR(3) DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gatekeeper_type TEXT DEFAULT 'both';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- جدول طلبات الإجازة (leave_requests)
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  employee_name TEXT,
  employee_position TEXT,
  employee_department TEXT,
  leave_type TEXT NOT NULL DEFAULT 'سنوية',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER DEFAULT 1,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  supervisor_name TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- صلاحيات RLS لجدول leave_requests
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own leave requests" ON leave_requests FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Employees can insert their own leave requests" ON leave_requests FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Supervisors can view requests of their team" ON leave_requests FOR SELECT
  USING (auth.uid() = supervisor_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('hr', 'admin')));

CREATE POLICY "HR/Admin can manage all leave requests" ON leave_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('hr', 'admin', 'manager', 'supervisor')));