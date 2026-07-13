-- ============================================================================
-- Kyvzon Development — 0002_employee_features.sql
-- Canonical employee domain: attendance, leave, permissions, breaks, holidays
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type TEXT NOT NULL DEFAULT 'check-in' CHECK (punch_type IN ('in', 'out', 'check-in', 'check-out')),
  shift_type TEXT,
  shift_date DATE NOT NULL,
  device_id TEXT,
  verification_type TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  source TEXT NOT NULL DEFAULT 'Python',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_logs_unique_punch UNIQUE (tenant_id, employee_id, punch_time)
);

CREATE TABLE IF NOT EXISTS public.attendance_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_type TEXT,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  total_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_leave_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'غائب',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_summary_unique_day UNIQUE (tenant_id, employee_id, shift_date)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  permission_type TEXT NOT NULL DEFAULT 'عادية',
  expected_out_time TIME NOT NULL,
  expected_return_time TIME,
  actual_out_time TIMESTAMPTZ,
  actual_return_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'انتظار',
  approved_by UUID REFERENCES public.profiles(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name TEXT,
  employee_department TEXT,
  date DATE NOT NULL,
  permission_type TEXT NOT NULL DEFAULT 'عادية',
  expected_out_time TIME NOT NULL,
  expected_return_time TIME,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'انتظار',
  approved_by UUID REFERENCES public.profiles(id),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  working_days_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'انتظار',
  approved_by UUID REFERENCES public.profiles(id),
  reason TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leaves_valid_dates CHECK (date_from <= date_to)
);

CREATE TABLE IF NOT EXISTS public.leave_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  annual_total NUMERIC(6,3) NOT NULL DEFAULT 0,
  annual_used NUMERIC(6,3) NOT NULL DEFAULT 0,
  annual_pending NUMERIC(6,3) NOT NULL DEFAULT 0,
  sick_total NUMERIC(5,1) NOT NULL DEFAULT 30,
  sick_used NUMERIC(5,1) NOT NULL DEFAULT 0,
  sick_pending NUMERIC(5,1) NOT NULL DEFAULT 0,
  hajj_taken BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_balance_unique_year UNIQUE (tenant_id, employee_id, year)
);

CREATE TABLE IF NOT EXISTS public.leave_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  days_allowed INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  requires_attachment BOOLEAN NOT NULL DEFAULT false,
  once_per_service BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_settings_unique_type UNIQUE (tenant_id, leave_type)
);

CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'all',
  department_id UUID REFERENCES public.departments(id),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holidays_unique_date_per_tenant UNIQUE (tenant_id, date)
);

CREATE TABLE IF NOT EXISTS public.employee_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  break_type TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.overtime_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type TEXT,
  extra_minutes INTEGER NOT NULL DEFAULT 0,
  converted_to_permission BOOLEAN NOT NULL DEFAULT false,
  permission_id UUID REFERENCES public.permissions(id),
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_tenant_employee_date ON public.attendance_logs(tenant_id, employee_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_punch_time ON public.attendance_logs(tenant_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_tenant_employee_date ON public.attendance_summary(tenant_id, employee_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_permissions_tenant_employee_date ON public.permissions(tenant_id, employee_id, date);
CREATE INDEX IF NOT EXISTS idx_permissions_request_tenant_employee_date ON public.permissions_request(tenant_id, employee_id, date);
CREATE INDEX IF NOT EXISTS idx_leaves_tenant_employee_dates ON public.leaves(tenant_id, employee_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_leave_balance_tenant_employee ON public.leave_balance(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant_date ON public.holidays(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_employee_breaks_tenant_employee ON public.employee_breaks(tenant_id, employee_id);

DROP TRIGGER IF EXISTS update_attendance_summary_updated_at ON public.attendance_summary;
CREATE TRIGGER update_attendance_summary_updated_at BEFORE UPDATE ON public.attendance_summary FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_permissions_updated_at ON public.permissions;
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_permissions_request_updated_at ON public.permissions_request;
CREATE TRIGGER update_permissions_request_updated_at BEFORE UPDATE ON public.permissions_request FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_leaves_updated_at ON public.leaves;
CREATE TRIGGER update_leaves_updated_at BEFORE UPDATE ON public.leaves FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_leave_balance_updated_at ON public.leave_balance;
CREATE TRIGGER update_leave_balance_updated_at BEFORE UPDATE ON public.leave_balance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
