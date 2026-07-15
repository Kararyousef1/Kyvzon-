-- ============================================================================
-- Kyvzon Platform — Migration 202: البوابة التقنية + المرتبات + البصمة
-- ============================================================================
-- هذا الملف:
-- 1. يضيف جدول biometric_devices — أجهزة البصمة
-- 2. يضيف حقول salary + salary_currency لجدول profiles
-- 3. ينشئ جدول salary_deductions — استقطاعات الرواتب المرتبطة بالحضور
-- 4. ينشئ جدول attendance_payroll_bridge — جسر الحضور → الرواتب
-- 5. يضيف approval_workflow_log لسجل الموافقات
-- ============================================================================

-- ============================================================================
-- 1. جدول أجهزة البصمة
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name VARCHAR(200) NOT NULL,
  device_type VARCHAR(50) NOT NULL DEFAULT 'zkteco',
  ip_address VARCHAR(50),
  port INTEGER DEFAULT 4370,
  serial_number VARCHAR(100),
  location VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_interval_minutes INTEGER DEFAULT 5,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_devices_tenant ON public.biometric_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_active ON public.biometric_devices(is_active);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_biometric_devices_updated_at ON public.biometric_devices;
CREATE TRIGGER update_biometric_devices_updated_at
  BEFORE UPDATE ON public.biometric_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.biometric_devices ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. إضافة حقول المرتب للموظفين
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS salary DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS salary_currency VARCHAR(10) DEFAULT 'IQD'
    CHECK (salary_currency IN ('IQD', 'USD')),
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(30) DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern'));

-- ============================================================================
-- 3. جدول استقطاعات الحضور (يربط الغياب والتأخير بالرواتب)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  employee_id UUID NOT NULL REFERENCES public.profiles(id),
  deduction_date DATE NOT NULL,
  deduction_type VARCHAR(30) NOT NULL
    CHECK (deduction_type IN ('late', 'absent', 'early_leave', 'half_day', 'unpaid_leave')),
  minutes INTEGER DEFAULT 0,
  deduction_amount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'IQD',
  is_applied BOOLEAN DEFAULT false,
  payroll_period_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_deductions_emp ON public.attendance_deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_deductions_date ON public.attendance_deductions(deduction_date);
CREATE INDEX IF NOT EXISTS idx_attendance_deductions_period ON public.attendance_deductions(payroll_period_id);

ALTER TABLE public.attendance_deductions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. جدول فترات الرواتب
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  period_name VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  working_days INTEGER NOT NULL DEFAULT 22,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'calculated', 'approved', 'paid', 'closed')),
  total_salaries DECIMAL(14,2) DEFAULT 0,
  total_deductions DECIMAL(14,2) DEFAULT 0,
  total_net DECIMAL(14,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'IQD',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant ON public.payroll_periods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON public.payroll_periods(status);

DROP TRIGGER IF EXISTS update_payroll_periods_updated_at ON public.payroll_periods;
CREATE TRIGGER update_payroll_periods_updated_at
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. جدول سجل الموافقات (للإجازات، الزمنيات، النفقات)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.approval_workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  request_type VARCHAR(30) NOT NULL
    CHECK (request_type IN ('leave', 'permission', 'expense', 'overtime', 'loan')),
  request_id UUID NOT NULL,
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id UUID REFERENCES auth.users(id),
  approver_comment TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_workflow_req ON public.approval_workflow(request_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_requester ON public.approval_workflow(requester_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_status ON public.approval_workflow(status);

ALTER TABLE public.approval_workflow ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

CREATE POLICY bio_devices_select ON public.biometric_devices
  FOR SELECT USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

CREATE POLICY bio_devices_all ON public.biometric_devices
  FOR ALL USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

CREATE POLICY attendance_ded_select ON public.attendance_deductions
  FOR SELECT USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

CREATE POLICY attendance_ded_all ON public.attendance_deductions
  FOR ALL USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

CREATE POLICY payroll_periods_select ON public.payroll_periods
  FOR SELECT USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

CREATE POLICY payroll_periods_all ON public.payroll_periods
  FOR ALL USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

CREATE POLICY approval_wf_select ON public.approval_workflow
  FOR SELECT USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

CREATE POLICY approval_wf_all ON public.approval_workflow
  FOR ALL USING (public.is_same_tenant(tenant_id) OR public.is_platform_owner());

-- ============================================================================
-- 7. دالة: حساب استقطاعات الحضور تلقائياً لفترة راتب
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_attendance_deductions(
  p_tenant_id UUID,
  p_employee_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_daily_salary DECIMAL
) RETURNS TABLE(
  late_count INTEGER,
  late_minutes_total INTEGER,
  absent_days INTEGER,
  early_leave_count INTEGER,
  total_deduction DECIMAL
) AS $$
DECLARE
  v_late_count INTEGER := 0;
  v_late_mins INTEGER := 0;
  v_absent INTEGER := 0;
  v_early INTEGER := 0;
  v_total_deduction DECIMAL := 0;
  v_daily_deduction DECIMAL;
BEGIN
  -- تأخير
  SELECT COUNT(*), COALESCE(SUM(late_minutes), 0)
  INTO v_late_count, v_late_mins
  FROM public.attendance_summary
  WHERE tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND shift_date BETWEEN p_start_date AND p_end_date
    AND status IN ('متأخر');

  -- غياب
  SELECT COUNT(*)
  INTO v_absent
  FROM public.attendance_summary
  WHERE tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND shift_date BETWEEN p_start_date AND p_end_date
    AND status = 'غائب';

  -- خروج مبكر
  SELECT COUNT(*)
  INTO v_early
  FROM public.attendance_summary
  WHERE tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND shift_date BETWEEN p_start_date AND p_end_date
    AND status = 'متأخر'
    AND early_leave_minutes > 0;

  -- الحساب: كل يوم غياب = خصم يوم كامل
  v_daily_deduction := p_daily_salary;
  v_total_deduction := (v_absent * v_daily_deduction);
  
  -- التأخير التراكمي: كل 60 دقيقة = خصم ربع يوم
  v_total_deduction := v_total_deduction + (FLOOR(v_late_mins / 60.0) * (v_daily_deduction / 4));

  RETURN QUERY SELECT v_late_count, v_late_mins, v_absent, v_early, v_total_deduction;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- تم الانتهاء من Migration 202
-- ============================================================================
