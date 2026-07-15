-- ============================================================================
-- ملف: 070_create_payroll_tables.sql
-- الوصف: جداول نظام الرواتب والاستقطاعات والسلف والجوائز
-- التاريخ: 2026-06-26
-- ============================================================================

-- ============================================================================
-- 1. أنواع بيانات الرواتب
-- ============================================================================

CREATE TYPE payroll_status_enum AS ENUM ('draft', 'pending_approval', 'approved', 'paid', 'cancelled');
CREATE TYPE payroll_frequency_enum AS ENUM ('monthly', 'semi_monthly', 'weekly', 'bi_weekly');
CREATE TYPE allowance_type_enum AS ENUM ('housing', 'transportation', 'seniority', 'danger', 'food', 'phone', 'representation', 'other');
CREATE TYPE deduction_type_enum AS ENUM ('social_security', 'tax', 'absence', 'late', 'permission_penalty', 'loan', 'advance', 'other');
CREATE TYPE loan_status_enum AS ENUM ('pending', 'approved', 'active', 'completed', 'rejected');
CREATE TYPE bonus_type_enum AS ENUM ('performance', 'overtime', 'annual', 'spot', 'referral', 'other');

-- ============================================================================
-- 2. فترات الرواتب
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  frequency payroll_frequency_enum NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  payment_date DATE NOT NULL,
  status payroll_status_enum NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT period_dates_check CHECK (start_date < end_date AND payment_date >= end_date)
);

CREATE INDEX idx_payroll_periods_dates ON public.payroll_periods(start_date, end_date);
CREATE INDEX idx_payroll_periods_status ON public.payroll_periods(status);

-- ============================================================================
-- 3. سجل الرواتب لكل موظف
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  working_days INTEGER NOT NULL DEFAULT 0,
  present_days INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  leave_days INTEGER NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  status payroll_status_enum NOT NULL DEFAULT 'draft',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_period UNIQUE (employee_id, period_id)
);

CREATE INDEX idx_payroll_records_period ON public.payroll_records(period_id);
CREATE INDEX idx_payroll_records_employee ON public.payroll_records(employee_id);
CREATE INDEX idx_payroll_records_status ON public.payroll_records(status);

-- ============================================================================
-- 4. البدلات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_allowances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  allowance_type allowance_type_enum NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_percentage BOOLEAN NOT NULL DEFAULT false,
  percentage_of NUMERIC(5,2),
  description TEXT,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_allowances_record ON public.payroll_allowances(record_id);
CREATE INDEX idx_allowances_employee ON public.payroll_allowances(employee_id);

-- ============================================================================
-- 5. الاستقطاعات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  deduction_type deduction_type_enum NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_percentage BOOLEAN NOT NULL DEFAULT false,
  percentage_of NUMERIC(5,2),
  description TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deductions_record ON public.payroll_deductions(record_id);
CREATE INDEX idx_deductions_employee ON public.payroll_deductions(employee_id);

-- ============================================================================
-- 6. السلف والقروض
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_installment NUMERIC(12,2) NOT NULL DEFAULT 0,
  months_count INTEGER NOT NULL DEFAULT 1,
  months_paid INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE,
  purpose TEXT NOT NULL,
  status loan_status_enum NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loans_employee ON public.employee_loans(employee_id);
CREATE INDEX idx_loans_status ON public.employee_loans(status);

-- ============================================================================
-- 7. أقساط السلف
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payroll_period_id UUID REFERENCES public.payroll_periods(id),
  payment_date DATE,
  status payroll_status_enum NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repayments_loan ON public.loan_repayments(loan_id);
CREATE INDEX idx_repayments_employee ON public.loan_repayments(employee_id);

-- ============================================================================
-- 8. الجوائز والمكافآت
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  bonus_type bonus_type_enum NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  approved_by UUID REFERENCES public.employees(id),
  status payroll_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bonuses_employee ON public.bonuses(employee_id);
CREATE INDEX idx_bonuses_type ON public.bonuses(bonus_type);
CREATE INDEX idx_bonuses_status ON public.bonuses(status);

-- ============================================================================
-- 9. إعدادات الرواتب
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_currency VARCHAR(10) NOT NULL DEFAULT 'IQD',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  social_security_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  overtime_rate NUMERIC(5,2) NOT NULL DEFAULT 1.5,
  late_penalty_per_minute NUMERIC(8,2) NOT NULL DEFAULT 0,
  absence_penalty_per_day NUMERIC(8,2) NOT NULL DEFAULT 0,
  max_overtime_hours_per_month NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_loan_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_loan_months INTEGER NOT NULL DEFAULT 12,
  default_basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  working_days_per_month INTEGER NOT NULL DEFAULT 26,
  allowance_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.employees(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- إعدادات افتراضية
INSERT INTO public.payroll_settings (id, default_currency, tax_rate, social_security_rate, overtime_rate, working_days_per_month)
SELECT 1, 'IQD', 0, 0, 1.5, 26
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_settings WHERE id = 1);

-- ============================================================================
-- 10. Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS update_employee_loans_updated_at ON public.employee_loans;
CREATE TRIGGER update_employee_loans_updated_at
  BEFORE UPDATE ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_records_updated_at ON public.payroll_records;
CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_periods_updated_at ON public.payroll_periods;
CREATE TRIGGER update_payroll_periods_updated_at
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bonuses_updated_at ON public.bonuses;
CREATE TRIGGER update_bonuses_updated_at
  BEFORE UPDATE ON public.bonuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 11. دوال حساب الرواتب
-- ============================================================================

-- حساب صافي الراتب لفترة معينة
CREATE OR REPLACE FUNCTION public.calculate_net_salary(
  p_employee_id UUID,
  p_period_id UUID
) RETURNS NUMERIC(12,2) AS $$
DECLARE
  v_basic NUMERIC(12,2);
  v_allowances NUMERIC(12,2);
  v_deductions NUMERIC(12,2);
  v_overtime NUMERIC(12,2);
  v_bonus NUMERIC(12,2);
BEGIN
  SELECT basic_salary, total_allowances, total_deductions, overtime_pay, bonus_amount
    INTO v_basic, v_allowances, v_deductions, v_overtime, v_bonus
  FROM public.payroll_records
  WHERE employee_id = p_employee_id AND period_id = p_period_id;

  IF v_basic IS NULL THEN RETURN 0; END IF;

  RETURN COALESCE(v_basic, 0) + COALESCE(v_allowances, 0)
    - COALESCE(v_deductions, 0) + COALESCE(v_overtime, 0)
    + COALESCE(v_bonus, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 12. RLS
-- ============================================================================

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

-- الموظف: يرى سجله فقط
CREATE POLICY payroll_records_employee_select ON public.payroll_records
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- HR و Admin: يرون كل شيء
CREATE POLICY payroll_records_admin_select ON public.payroll_records
  FOR SELECT USING (current_setting('app.current_role', true) IN ('hr', 'admin', 'developer'));

CREATE POLICY payroll_records_admin_insert ON public.payroll_records
  FOR INSERT WITH CHECK (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY payroll_records_admin_update ON public.payroll_records
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY payroll_periods_admin_select ON public.payroll_periods
  FOR SELECT USING (current_setting('app.current_role', true) IN ('hr', 'admin', 'developer'));

CREATE POLICY payroll_periods_admin_insert ON public.payroll_periods
  FOR INSERT WITH CHECK (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY payroll_periods_admin_update ON public.payroll_periods
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

-- السلف
CREATE POLICY loans_employee_select ON public.employee_loans
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY loans_employee_insert ON public.employee_loans
  FOR INSERT WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY loans_admin_select ON public.employee_loans
  FOR SELECT USING (current_setting('app.current_role', true) IN ('hr', 'admin', 'developer'));

CREATE POLICY loans_admin_update ON public.employee_loans
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

-- الجوائز
CREATE POLICY bonuses_employee_select ON public.bonuses
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY bonuses_admin_select ON public.bonuses
  FOR SELECT USING (current_setting('app.current_role', true) IN ('hr', 'admin', 'developer'));

CREATE POLICY bonuses_admin_insert ON public.bonuses
  FOR INSERT WITH CHECK (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY bonuses_admin_update ON public.bonuses
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

-- إعدادات الرواتب
CREATE POLICY payroll_settings_select ON public.payroll_settings
  FOR SELECT USING (true);

CREATE POLICY payroll_settings_admin_update ON public.payroll_settings
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

-- ============================================================================
-- نهاية
-- ============================================================================
