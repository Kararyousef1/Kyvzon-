-- ============================================================================
-- Kyvzon Platform
-- قاعدة البيانات الكاملة - Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- 1. أنواع البيانات المخصصة (ENUMs)
-- ============================================================================

CREATE TYPE shift_type_enum AS ENUM ('صباحي', 'مسائي', 'ليلي');
CREATE TYPE verification_type_enum AS ENUM ('finger', 'face', 'card', 'password');
CREATE TYPE source_enum AS ENUM ('ADMS', 'Python');
CREATE TYPE attendance_status_enum AS ENUM (
  'حضور_بوقت', 'متأخر', 'زمنية_معتمدة', 'زمنية_انتظار',
  'مجاز', 'إجازة_انتظار', 'غائب', 'عطلة'
);
CREATE TYPE permission_type_enum AS ENUM ('عادية', 'مغادرة', 'تعويضية', 'بدون_راتب');
CREATE TYPE permission_status_enum AS ENUM ('انتظار', 'موافق', 'مرفوض');
CREATE TYPE leave_type_enum AS ENUM (
  'سنوية', 'مرضية', 'وفاة_أول', 'وفاة_ثاني',
  'زواج', 'امتحانات', 'غير_مدفوعة', 'حج', 'تكليف'
);
CREATE TYPE leave_status_enum AS ENUM ('انتظار', 'موافق', 'مرفوض');
CREATE TYPE notification_type_enum AS ENUM (
  'موافقة', 'رفض', 'تنبيه', 'تذكير', 'تحذير', 'خطأ', 'معلومات'
);
CREATE TYPE insight_type_enum AS ENUM (
  'حضور', 'شذوذ', 'تنبؤ', 'قسم', 'صحة_قوى_عاملة'
);
CREATE TYPE scope_enum AS ENUM ('global', 'department', 'employee');
CREATE TYPE severity_enum AS ENUM ('info', 'warning', 'critical');
CREATE TYPE applies_to_enum AS ENUM ('all', 'department');

-- ============================================================================
-- 2. جدول الموظفين (يمتد من auth.users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name_ar VARCHAR(201) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50),
  department_id UUID,
  position VARCHAR(200),
  role VARCHAR(50) NOT NULL DEFAULT 'employee'
    CHECK (role IN ('developer', 'system_admin', 'manager', 'employee')),
  manager_id UUID REFERENCES public.employees(id),
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_department ON public.employees(department_id);
CREATE INDEX idx_employees_role ON public.employees(role);
CREATE INDEX idx_employees_manager ON public.employees(manager_id);

-- ============================================================================
-- 3. جدول الأقسام
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200),
  manager_id UUID REFERENCES public.employees(id),
  parent_department_id UUID REFERENCES public.departments(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.employees
  ADD CONSTRAINT fk_employee_department
  FOREIGN KEY (department_id) REFERENCES public.departments(id);

-- ============================================================================
-- 4. سجلات الحضور (البصمات)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id BIGSERIAL PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type VARCHAR(20) DEFAULT 'check-in',
  shift_type shift_type_enum,
  shift_date DATE NOT NULL,
  device_id VARCHAR(100),
  verification_type verification_type_enum DEFAULT 'finger',
  raw_data JSONB,
  source source_enum NOT NULL DEFAULT 'Python',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- منع التكرار: نفس الموظف + نفس الوقت = بصمة واحدة فقط
  CONSTRAINT unique_employee_punch UNIQUE (employee_id, punch_time)
);

-- فهارس للأداء
CREATE INDEX idx_attendance_logs_employee ON public.attendance_logs(employee_id);
CREATE INDEX idx_attendance_logs_date ON public.attendance_logs(shift_date);
CREATE INDEX idx_attendance_logs_employee_date
  ON public.attendance_logs(employee_id, shift_date);
CREATE INDEX idx_attendance_logs_source ON public.attendance_logs(source);
CREATE INDEX idx_attendance_logs_created_at ON public.attendance_logs(created_at);

-- ============================================================================
-- 5. ملخص الحضور اليومي
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_summary (
  id BIGSERIAL PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  shift_date DATE NOT NULL,
  shift_type shift_type_enum,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  total_hours NUMERIC(5,2) DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  early_leave_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  status attendance_status_enum NOT NULL DEFAULT 'غائب',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_shift_date UNIQUE (employee_id, shift_date)
);

CREATE INDEX idx_attendance_summary_employee ON public.attendance_summary(employee_id);
CREATE INDEX idx_attendance_summary_date ON public.attendance_summary(shift_date);
CREATE INDEX idx_attendance_summary_status ON public.attendance_summary(status);
CREATE INDEX idx_attendance_summary_employee_date
  ON public.attendance_summary(employee_id, shift_date);

-- ============================================================================
-- 6. الزمنيات (Permissions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  date DATE NOT NULL,
  permission_type permission_type_enum NOT NULL DEFAULT 'عادية',
  expected_out_time TIME NOT NULL,
  expected_return_time TIME,
  actual_out_time TIMESTAMPTZ,
  actual_return_time TIMESTAMPTZ,
  status permission_status_enum NOT NULL DEFAULT 'انتظار',
  approved_by UUID REFERENCES public.employees(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_employee ON public.permissions(employee_id);
CREATE INDEX idx_permissions_date ON public.permissions(date);
CREATE INDEX idx_permissions_status ON public.permissions(status);
CREATE INDEX idx_permissions_approved_by ON public.permissions(approved_by);

-- ============================================================================
-- 7. جدول طلبات الزمنيات (Permissions Request)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.permissions_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  employee_name VARCHAR(200),
  employee_department VARCHAR(200),
  date DATE NOT NULL,
  permission_type permission_type_enum NOT NULL DEFAULT 'عادية',
  expected_out_time TIME NOT NULL,
  expected_return_time TIME,
  reason TEXT NOT NULL,
  status permission_status_enum NOT NULL DEFAULT 'انتظار',
  approved_by UUID REFERENCES public.employees(id),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_request_employee ON public.permissions_request(employee_id);
CREATE INDEX idx_permissions_request_date ON public.permissions_request(date);
CREATE INDEX idx_permissions_request_status ON public.permissions_request(status);
CREATE INDEX idx_permissions_request_created_at ON public.permissions_request(created_at DESC);

-- مشغل تحديث updated_at لطلبات الزمنيات
DROP TRIGGER IF EXISTS update_permissions_request_updated_at ON public.permissions_request;
CREATE TRIGGER update_permissions_request_updated_at
  BEFORE UPDATE ON public.permissions_request
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 8. الإجازات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  leave_type leave_type_enum NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  working_days_count INTEGER NOT NULL DEFAULT 0,
  status leave_status_enum NOT NULL DEFAULT 'انتظار',
  approved_by UUID REFERENCES public.employees(id),
  reason TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- التحقق: تاريخ البداية <= تاريخ النهاية
  CONSTRAINT check_leave_dates CHECK (date_from <= date_to)
);

CREATE INDEX idx_leaves_employee ON public.leaves(employee_id);
CREATE INDEX idx_leaves_type ON public.leaves(leave_type);
CREATE INDEX idx_leaves_status ON public.leaves(status);
CREATE INDEX idx_leaves_dates ON public.leaves(date_from, date_to);
CREATE INDEX idx_leaves_employee_type ON public.leaves(employee_id, leave_type);

-- ============================================================================
-- 8. رصيد الإجازات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leave_balance (
  id BIGSERIAL PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  -- الرصيد السنوي
  annual_total NUMERIC(6,3) NOT NULL DEFAULT 0,
  annual_used NUMERIC(6,3) NOT NULL DEFAULT 0,
  annual_pending NUMERIC(6,3) NOT NULL DEFAULT 0,
  annual_remaining NUMERIC(6,3) GENERATED ALWAYS AS (annual_total - annual_used - annual_pending) STORED,
  -- الرصيد المرضي
  sick_total NUMERIC(5,1) NOT NULL DEFAULT 30,
  sick_used NUMERIC(5,1) NOT NULL DEFAULT 0,
  sick_pending NUMERIC(5,1) NOT NULL DEFAULT 0,
  sick_remaining NUMERIC(5,1) GENERATED ALWAYS AS (sick_total - sick_used - sick_pending) STORED,
  -- إجازة الحج (مرة واحدة فقط في الخدمة)
  hajj_taken BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_year UNIQUE (employee_id, year)
);

CREATE INDEX idx_leave_balance_employee ON public.leave_balance(employee_id);
CREATE INDEX idx_leave_balance_year ON public.leave_balance(year);

-- ============================================================================
-- 9. إعدادات الإجازات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leave_settings (
  id BIGSERIAL PRIMARY KEY,
  leave_type leave_type_enum UNIQUE NOT NULL,
  days_allowed INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  requires_attachment BOOLEAN NOT NULL DEFAULT false,
  once_per_service BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_by UUID REFERENCES public.employees(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. العطل الرسمية والطارئة
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name VARCHAR(200) NOT NULL,
  applies_to applies_to_enum NOT NULL DEFAULT 'all',
  department_id UUID REFERENCES public.departments(id),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_holiday_date UNIQUE (date)
);

CREATE INDEX idx_holidays_date ON public.holidays(date);
CREATE INDEX idx_holidays_department ON public.holidays(department_id);

-- ============================================================================
-- 11. الوقت الإضافي (أوفرتايم)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.overtime_log (
  id BIGSERIAL PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  date DATE NOT NULL,
  shift_type shift_type_enum,
  extra_minutes INTEGER NOT NULL DEFAULT 0,
  converted_to_permission BOOLEAN NOT NULL DEFAULT false,
  permission_id UUID REFERENCES public.permissions(id),
  approved_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_overtime_employee ON public.overtime_log(employee_id);
CREATE INDEX idx_overtime_date ON public.overtime_log(date);

-- ============================================================================
-- 12. الإشعارات والتنبيهات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type_enum NOT NULL DEFAULT 'معلومات',
  title VARCHAR(300) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_table VARCHAR(100),
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- ============================================================================
-- 13. تحليلات الذكاء الاصطناعي
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_insights (
  id BIGSERIAL PRIMARY KEY,
  insight_type insight_type_enum NOT NULL,
  scope scope_enum NOT NULL DEFAULT 'global',
  department_id UUID REFERENCES public.departments(id),
  employee_id UUID REFERENCES public.employees(id),
  title VARCHAR(300) NOT NULL,
  summary TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  severity severity_enum NOT NULL DEFAULT 'info',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ
);

CREATE INDEX idx_ai_insights_type ON public.ai_insights(insight_type);
CREATE INDEX idx_ai_insights_scope ON public.ai_insights(scope);
CREATE INDEX idx_ai_insights_department ON public.ai_insights(department_id);
CREATE INDEX idx_ai_insights_employee ON public.ai_insights(employee_id);
CREATE INDEX idx_ai_insights_severity ON public.ai_insights(severity);

-- ============================================================================
-- 14. إعدادات النظام
-- ============================================================================

-- الجدول موجود مسبقاً بهيكل (id TEXT, landing_config JSONB, ...)
-- نضيف الأعمدة الجديدة إذا لم تكن موجودة
ALTER TABLE public.system_settings 
  ADD COLUMN IF NOT EXISTS shift_timings JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shift_windows JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS leave_defaults JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS work_weekend JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overtime_rules JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attendance_thresholds JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_insights_schedule JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- تحديث الإعدادات الافتراضية في السجل الموجود (إذا كان موجوداً)
UPDATE public.system_settings SET
  shift_timings = CASE WHEN shift_timings = '{}'::jsonb THEN '{"صباحي": {"start": "08:00", "end": "16:00", "hours": 8}, "مسائي": {"start": "16:00", "end": "00:00", "hours": 8}, "ليلي": {"start": "00:00", "end": "08:00", "hours": 8}}'::jsonb ELSE shift_timings END,
  shift_windows = CASE WHEN shift_windows = '{}'::jsonb THEN '{"صباحي": {"from": "06:00", "to": "10:00"}, "مسائي": {"from": "14:00", "to": "18:00"}, "ليلي": {"from": "22:00", "to": "02:00"}}'::jsonb ELSE shift_windows END,
  leave_defaults = CASE WHEN leave_defaults = '{}'::jsonb THEN '{"وفاة_أول": 3, "وفاة_ثاني": 2, "زواج": 7, "امتحانات": 15, "حج": 15, "مرضية": 30}'::jsonb ELSE leave_defaults END,
  work_weekend = CASE WHEN work_weekend = '[]'::jsonb THEN '["6"]'::jsonb ELSE work_weekend END,
  overtime_rules = CASE WHEN overtime_rules = '{}'::jsonb THEN '{"min_minutes": 30, "max_daily": 240, "approval_required": true}'::jsonb ELSE overtime_rules END,
  attendance_thresholds = CASE WHEN attendance_thresholds = '{}'::jsonb THEN '{"late_threshold_minutes": 15, "absent_threshold_hours": 4, "early_leave_threshold_minutes": 15}'::jsonb ELSE attendance_thresholds END,
  ai_insights_schedule = CASE WHEN ai_insights_schedule = '{}'::jsonb THEN '{"interval_hours": 24, "enabled": true}'::jsonb ELSE ai_insights_schedule END,
  updated_at = NOW()
WHERE id = 'singleton';

-- إذا لم يكن السجل موجوداً، ننشئه
INSERT INTO public.system_settings (id, shift_timings, shift_windows, leave_defaults, work_weekend, overtime_rules, attendance_thresholds, ai_insights_schedule)
SELECT
  'singleton',
  '{"صباحي": {"start": "08:00", "end": "16:00", "hours": 8}, "مسائي": {"start": "16:00", "end": "00:00", "hours": 8}, "ليلي": {"start": "00:00", "end": "08:00", "hours": 8}}'::jsonb,
  '{"صباحي": {"from": "06:00", "to": "10:00"}, "مسائي": {"from": "14:00", "to": "18:00"}, "ليلي": {"from": "22:00", "to": "02:00"}}'::jsonb,
  '{"وفاة_أول": 3, "وفاة_ثاني": 2, "زواج": 7, "امتحانات": 15, "حج": 15, "مرضية": 30}'::jsonb,
  '["6"]'::jsonb,
  '{"min_minutes": 30, "max_daily": 240, "approval_required": true}'::jsonb,
  '{"late_threshold_minutes": 15, "absent_threshold_hours": 4, "early_leave_threshold_minutes": 15}'::jsonb,
  '{"interval_hours": 24, "enabled": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE id = 'singleton');

-- ============================================================================
-- 15. سجل التدقيق (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  employee_id UUID REFERENCES public.employees(id),
  role VARCHAR(50),
  action VARCHAR(200) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX idx_audit_log_table ON public.audit_log(table_name);
CREATE INDEX idx_audit_log_action ON public.audit_log(action);
CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);

-- ============================================================================
-- 16. سجل المزامنة (Sync Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_log (
  id BIGSERIAL PRIMARY KEY,
  sync_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source source_enum NOT NULL,
  device_id VARCHAR(100),
  records_synced INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error')),
  error_message TEXT,
  details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sync_log_source ON public.sync_log(source);
CREATE INDEX idx_sync_log_status ON public.sync_log(status);
CREATE INDEX idx_sync_log_time ON public.sync_log(sync_time DESC);

-- ============================================================================
-- 17. سجل التصدير (Export Logs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.export_logs (
  id BIGSERIAL PRIMARY KEY,
  exported_by UUID NOT NULL REFERENCES public.employees(id),
  export_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_from DATE,
  date_to DATE,
  format VARCHAR(20) NOT NULL CHECK (format IN ('Excel', 'PDF')),
  filters JSONB DEFAULT '{}'::jsonb,
  records_count INTEGER DEFAULT 0,
  file_size_bytes BIGINT DEFAULT 0
);

CREATE INDEX idx_export_logs_user ON public.export_logs(exported_by);
CREATE INDEX idx_export_logs_time ON public.export_logs(export_time DESC);

-- ============================================================================
-- 18. الدوال المساعدة (Functions)
-- ============================================================================

-- دوال تحديث حقل updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- دالة حساب أيام العمل الفعلية (تستثني الجمعة والعطل الرسمية)
CREATE OR REPLACE FUNCTION public.calculate_working_days(
  p_date_from DATE,
  p_date_to DATE
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_current DATE;
  v_is_holiday BOOLEAN;
BEGIN
  v_current := p_date_from;
  WHILE v_current <= p_date_to LOOP
    -- استثناء يوم الجمعة (6)
    IF EXTRACT(DOW FROM v_current) != 6 THEN
      -- التحقق من العطل الرسمية المسجلة
      SELECT EXISTS(
        SELECT 1 FROM public.holidays
        WHERE date = v_current
      ) INTO v_is_holiday;

      IF NOT v_is_holiday THEN
        v_count := v_count + 1;
      END IF;
    END IF;
    v_current := v_current + INTERVAL '1 day';
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- دالة تحديد الوردية بناءً على وقت البصمة
CREATE OR REPLACE FUNCTION public.determine_shift(punch_time TIMESTAMPTZ)
RETURNS shift_type_enum AS $$
DECLARE
  v_hour INTEGER := EXTRACT(HOUR FROM punch_time);
  v_shift shift_type_enum;
BEGIN
  -- نوافذ تحديد الوردية:
  -- 06:00-10:00 -> صباحي
  -- 14:00-18:00 -> مسائي
  -- 22:00-02:00 -> ليلي
  IF v_hour >= 6 AND v_hour < 10 THEN
    v_shift := 'صباحي'::shift_type_enum;
  ELSIF v_hour >= 14 AND v_hour < 18 THEN
    v_shift := 'مسائي'::shift_type_enum;
  ELSIF v_hour >= 22 OR v_hour < 2 THEN
    v_shift := 'ليلي'::shift_type_enum;
  ELSE
    -- خارج النوافذ - نحاول التخمين بأقرب وردية
    IF v_hour >= 6 AND v_hour < 14 THEN
      v_shift := 'صباحي'::shift_type_enum;
    ELSIF v_hour >= 14 AND v_hour < 22 THEN
      v_shift := 'مسائي'::shift_type_enum;
    ELSE
      v_shift := 'ليلي'::shift_type_enum;
    END IF;
  END IF;

  RETURN v_shift;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- دالة حساب رصيد الإجازة السنوية
CREATE OR REPLACE FUNCTION public.calculate_annual_leave_balance(
  p_employee_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
) RETURNS NUMERIC(6,3) AS $$
DECLARE
  v_hire_date DATE;
  v_days_of_service INTEGER;
  v_total_annual_days INTEGER := 21; -- القيمة الافتراضية (يمكن جلبها من الإعدادات)
  v_balance NUMERIC(6,3);
BEGIN
  -- الحصول على تاريخ التوظيف
  SELECT hire_date INTO v_hire_date
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_hire_date IS NULL THEN
    RETURN 0;
  END IF;

  -- حساب أيام الخدمة في هذه السنة
  IF EXTRACT(YEAR FROM v_hire_date) < p_year THEN
    v_days_of_service := (DATE_TRUNC('year', MAKE_DATE(p_year, 1, 1)) + INTERVAL '1 year' - INTERVAL '1 day')::DATE
      - MAKE_DATE(p_year, 1, 1) + 1;
  ELSE
    v_days_of_service := LEAST(
      CURRENT_DATE,
      (DATE_TRUNC('year', MAKE_DATE(p_year, 1, 1)) + INTERVAL '1 year' - INTERVAL '1 day')::DATE
    ) - v_hire_date + 1;
    IF v_days_of_service < 0 THEN
      RETURN 0;
    END IF;
  END IF;

  -- المعادلة: (21 ÷ 365) × أيام الخدمة
  v_balance := ROUND((v_total_annual_days::NUMERIC / 365) * v_days_of_service, 3);

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- دالة إنشاء أو تحديث رصيد الإجازات السنوية
CREATE OR REPLACE FUNCTION public.update_leave_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_annual_balance NUMERIC(6,3);
  v_year INTEGER := EXTRACT(YEAR FROM NEW.date_from);
  v_working_days INTEGER;
BEGIN
  v_working_days := public.calculate_working_days(NEW.date_from, NEW.date_to);

  IF NEW.leave_type = 'سنوية' THEN
    v_annual_balance := public.calculate_annual_leave_balance(NEW.employee_id, v_year);

    INSERT INTO public.leave_balance (employee_id, year, annual_total, annual_pending)
    VALUES (NEW.employee_id, v_year, v_annual_balance, v_working_days)
    ON CONFLICT (employee_id, year) DO UPDATE
    SET
      annual_total = v_annual_balance,
      annual_pending = public.leave_balance.annual_pending + v_working_days,
      updated_at = NOW();

  ELSIF NEW.leave_type = 'مرضية' THEN
    INSERT INTO public.leave_balance (employee_id, year, sick_pending)
    VALUES (NEW.employee_id, v_year, v_working_days)
    ON CONFLICT (employee_id, year) DO UPDATE
    SET
      sick_pending = public.leave_balance.sick_pending + v_working_days,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 19. المشغلات (Triggers)
-- ============================================================================

-- مشغل تحديث updated_at للموظفين
DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث updated_at للأقسام
DROP TRIGGER IF EXISTS update_departments_updated_at ON public.departments;
CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث updated_at للملخص اليومي
DROP TRIGGER IF EXISTS update_attendance_summary_updated_at ON public.attendance_summary;
CREATE TRIGGER update_attendance_summary_updated_at
  BEFORE UPDATE ON public.attendance_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث updated_at للزمنيات
DROP TRIGGER IF EXISTS update_permissions_updated_at ON public.permissions;
CREATE TRIGGER update_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث updated_at للإجازات
DROP TRIGGER IF EXISTS update_leaves_updated_at ON public.leaves;
CREATE TRIGGER update_leaves_updated_at
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث updated_at لرصيد الإجازات
DROP TRIGGER IF EXISTS update_leave_balance_updated_at ON public.leave_balance;
CREATE TRIGGER update_leave_balance_updated_at
  BEFORE UPDATE ON public.leave_balance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث updated_at لإعدادات الإجازات
DROP TRIGGER IF EXISTS update_leave_settings_updated_at ON public.leave_settings;
CREATE TRIGGER update_leave_settings_updated_at
  BEFORE UPDATE ON public.leave_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث updated_at لإعدادات النظام
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- مشغل تحديث رصيد الإجازات عند إنشاء طلب إجازة جديد
DROP TRIGGER IF EXISTS trigger_update_leave_balance ON public.leaves;
CREATE TRIGGER trigger_update_leave_balance
  AFTER INSERT ON public.leaves
  FOR EACH ROW
  WHEN (NEW.status = 'انتظار')
  EXECUTE FUNCTION public.update_leave_balance();

-- مشغل تسجيل التغييرات في audit_log
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_id UUID;
  v_role VARCHAR(50);
BEGIN
  -- محاولة الحصول على معلومات المستخدم من السياق
  v_employee_id := NULLIF(current_setting('app.current_employee_id', true), '');
  v_role := NULLIF(current_setting('app.current_role', true), '');

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (
      employee_id, role, action, table_name, record_id, old_value
    ) VALUES (
      v_employee_id, v_role, 'DELETE', TG_TABLE_NAME, OLD.id,
      row_to_json(OLD)::jsonb
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (
      employee_id, role, action, table_name, record_id,
      old_value, new_value
    ) VALUES (
      v_employee_id, v_role, 'UPDATE', TG_TABLE_NAME, NEW.id,
      row_to_json(OLD)::jsonb,
      row_to_json(NEW)::jsonb
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (
      employee_id, role, action, table_name, record_id, new_value
    ) VALUES (
      v_employee_id, v_role, 'INSERT', TG_TABLE_NAME, NEW.id,
      row_to_json(NEW)::jsonb
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تطبيق audit_log على الجداول الهامة
CREATE TRIGGER audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_attendance_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_summary
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_leaves
  AFTER INSERT OR UPDATE OR DELETE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_leave_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_balance
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_leave_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_holidays
  AFTER INSERT OR UPDATE OR DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ============================================================================
-- 20. دالة تحديث ملخص الحضور اليومي
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_attendance_summary(
  p_employee_id UUID,
  p_shift_date DATE
) RETURNS void AS $$
DECLARE
  v_check_in TIMESTAMPTZ;
  v_check_out TIMESTAMPTZ;
  v_shift_type shift_type_enum;
  v_late_minutes INTEGER := 0;
  v_early_leave_minutes INTEGER := 0;
  v_overtime_minutes INTEGER := 0;
  v_status attendance_status_enum;
  v_shift_start TIME;
  v_shift_end TIME;
  v_shift_hours INTEGER;
  v_is_holiday BOOLEAN;
  v_is_friday BOOLEAN;
  v_has_approved_leave BOOLEAN;
  v_has_pending_leave BOOLEAN;
  v_has_approved_permission BOOLEAN;
  v_has_pending_permission BOOLEAN;
  v_total_seconds INTEGER;
  v_shift_settings JSONB;
BEGIN
  -- التحقق من يوم الجمعة
  v_is_friday := EXTRACT(DOW FROM p_shift_date) = 6;

  -- التحقق من العطلة الرسمية أو الطارئة
  SELECT EXISTS(
    SELECT 1 FROM public.holidays WHERE date = p_shift_date
  ) INTO v_is_holiday;

  -- إذا كان اليوم عطلة، نضع الحالة عطلة ونرجع
  IF v_is_friday OR v_is_holiday THEN
    INSERT INTO public.attendance_summary
      (employee_id, shift_date, status)
    VALUES (p_employee_id, p_shift_date, 'عطلة'::attendance_status_enum)
    ON CONFLICT (employee_id, shift_date)
    DO UPDATE SET status = 'عطلة'::attendance_status_enum, updated_at = NOW();
    RETURN;
  END IF;

  -- جلب بصمات اليوم
  SELECT punch_time, shift_type
    INTO v_check_in, v_shift_type
  FROM public.attendance_logs
  WHERE employee_id = p_employee_id
    AND shift_date = p_shift_date
  ORDER BY punch_time ASC
  LIMIT 1;

  -- جلب آخر بصمة (انصراف)
  SELECT punch_time INTO v_check_out
  FROM public.attendance_logs
  WHERE employee_id = p_employee_id
    AND shift_date = p_shift_date
  ORDER BY punch_time DESC
  LIMIT 1;

  -- إذا لم يبصم الموظف
  IF v_check_in IS NULL THEN
    -- التحقق من وجود إجازة موافق عليها
    SELECT EXISTS(
      SELECT 1 FROM public.leaves
      WHERE employee_id = p_employee_id
        AND p_shift_date BETWEEN date_from AND date_to
        AND status = 'موافق'
    ) INTO v_has_approved_leave;

    IF v_has_approved_leave THEN
      v_status := 'مجاز'::attendance_status_enum;
    ELSE
      -- التحقق من وجود إجازة بانتظار الموافقة
      SELECT EXISTS(
        SELECT 1 FROM public.leaves
        WHERE employee_id = p_employee_id
          AND p_shift_date BETWEEN date_from AND date_to
          AND status = 'انتظار'
      ) INTO v_has_pending_leave;

      IF v_has_pending_leave THEN
        v_status := 'إجازة_انتظار'::attendance_status_enum;
      ELSE
        v_status := 'غائب'::attendance_status_enum;
      END IF;
    END IF;

    INSERT INTO public.attendance_summary
      (employee_id, shift_date, status)
    VALUES (p_employee_id, p_shift_date, v_status)
    ON CONFLICT (employee_id, shift_date)
    DO UPDATE SET status = v_status, updated_at = NOW();
    RETURN;
  END IF;

  -- الموظف بصم - نحدد الوردية من أول بصمة
  IF v_shift_type IS NULL THEN
    v_shift_type := public.determine_shift(v_check_in);
  END IF;

  -- جلب إعدادات الوردية
  SELECT shift_timings INTO v_shift_settings
  FROM public.system_settings WHERE id = 'singleton';

  -- استخراج وقت بداية ونهاية الوردية
  v_shift_start := (v_shift_settings->>v_shift_type::TEXT)::jsonb->>'start';
  v_shift_end := (v_shift_settings->>v_shift_type::TEXT)::jsonb->>'end';
  v_shift_hours := ((v_shift_settings->>v_shift_type::TEXT)::jsonb->>'hours')::INTEGER;

  -- حساب التأخير (بالدقائق)
  IF v_check_in::TIME > v_shift_start THEN
    v_late_minutes := EXTRACT(EPOCH FROM (v_check_in::TIME - v_shift_start)) / 60;
  END IF;

  -- حساب ساعات العمل والإضافي
  IF v_check_out IS NOT NULL THEN
    v_total_seconds := EXTRACT(EPOCH FROM (v_check_out - v_check_in));

    -- حساب الدقائق الإضافية
    IF v_total_seconds > v_shift_hours * 3600 THEN
      v_overtime_minutes := (v_total_seconds - v_shift_hours * 3600) / 60;
    END IF;

    -- حساب الخروج المبكر
    IF v_check_out::TIME < v_shift_end THEN
      v_early_leave_minutes := EXTRACT(EPOCH FROM (v_shift_end - v_check_out::TIME)) / 60;
    END IF;
  END IF;

  -- تحديد الحالة بناءً على المنطق الصارم
  IF v_late_minutes > 0 THEN
    v_status := 'متأخر'::attendance_status_enum;
  ELSE
    v_status := 'حضور_بوقت'::attendance_status_enum;
  END IF;

  -- التحقق من وجود زمنية إذا كان هناك خروج مبكر
  IF v_early_leave_minutes > 0 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id
        AND date = p_shift_date
        AND status = 'موافق'
        AND actual_out_time IS NOT NULL
    ) INTO v_has_approved_permission;

    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id
        AND date = p_shift_date
        AND status = 'انتظار'
    ) INTO v_has_pending_permission;

    IF v_has_approved_permission THEN
      v_status := 'زمنية_معتمدة'::attendance_status_enum;
    ELSIF v_has_pending_permission THEN
      v_status := 'زمنية_انتظار'::attendance_status_enum;
    END IF;
  END IF;

  -- حفظ أو تحديث الملخص
  INSERT INTO public.attendance_summary (
    employee_id, shift_date, shift_type, check_in, check_out,
    total_hours, late_minutes, early_leave_minutes,
    overtime_minutes, status
  ) VALUES (
    p_employee_id, p_shift_date, v_shift_type, v_check_in, v_check_out,
    ROUND(COALESCE(v_total_seconds, 0)::NUMERIC / 3600, 2),
    v_late_minutes, v_early_leave_minutes, v_overtime_minutes, v_status
  )
  ON CONFLICT (employee_id, shift_date) DO UPDATE SET
    shift_type = COALESCE(v_shift_type, public.attendance_summary.shift_type),
    check_in = COALESCE(v_check_in, public.attendance_summary.check_in),
    check_out = COALESCE(v_check_out, public.attendance_summary.check_out),
    total_hours = ROUND(COALESCE(v_total_seconds, 0)::NUMERIC / 3600, 2),
    late_minutes = COALESCE(v_late_minutes, public.attendance_summary.late_minutes),
    early_leave_minutes = COALESCE(v_early_leave_minutes, public.attendance_summary.early_leave_minutes),
    overtime_minutes = COALESCE(v_overtime_minutes, public.attendance_summary.overtime_minutes),
    status = v_status,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- مشغل تحديث الملخص تلقائياً عند إضافة بصمة جديدة
CREATE OR REPLACE FUNCTION public.on_attendance_log_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.refresh_attendance_summary(NEW.employee_id, NEW.shift_date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_refresh_summary_on_log ON public.attendance_logs;
CREATE TRIGGER trigger_refresh_summary_on_log
  AFTER INSERT ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.on_attendance_log_insert();

-- ============================================================================
-- 21. دالة التحقق من إجازة الحج (مرة واحدة فقط)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_hajj_eligibility(
  p_employee_id UUID
) RETURNS TABLE (
  eligible BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_hajj_taken BOOLEAN;
BEGIN
  SELECT COALESCE(lb.hajj_taken, false) INTO v_hajj_taken
  FROM public.leave_balance lb
  WHERE lb.employee_id = p_employee_id
  ORDER BY lb.year DESC
  LIMIT 1;

  IF v_hajj_taken THEN
    RETURN QUERY SELECT
      false::BOOLEAN AS eligible,
      'لقد حصلت على إجازة حج من قبل. لا يمكن التقديم مرة أخرى.'::TEXT AS message;
  ELSE
    RETURN QUERY SELECT
      true::BOOLEAN AS eligible,
      'يمكنك التقديم على إجازة حج.'::TEXT AS message;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- دالة إنشاء إشعار تلقائي
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type notification_type_enum,
  p_title VARCHAR(300),
  p_message TEXT,
  p_related_table VARCHAR(100) DEFAULT NULL,
  p_related_id UUID DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_notification_id BIGINT;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, related_table, related_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_related_table, p_related_id)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 22. دوال Edge Functions المساعدة
-- ============================================================================

-- دالة المزامنة من ADMS
CREATE OR REPLACE FUNCTION public.sync_adms_punch(
  p_employee_code VARCHAR(50),
  p_punch_time TIMESTAMPTZ,
  p_verification_type verification_type_enum DEFAULT 'finger',
  p_device_id VARCHAR(100) DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_employee_id UUID;
  v_shift_type shift_type_enum;
  v_shift_date DATE;
BEGIN
  -- البحث عن الموظف بالكود
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE employee_code = p_employee_code AND is_active = true;

  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الموظف غير موجود أو غير نشط'
    );
  END IF;

  -- تحديد تاريخ الوردية
  -- الوردية الليلية: تاريخها = يوم الدخول دائماً
  v_shift_date := p_punch_time::DATE;

  -- تحديد الوردية
  v_shift_type := public.determine_shift(p_punch_time);

  -- إدخال البصمة
  INSERT INTO public.attendance_logs (
    employee_id, punch_time, shift_type, shift_date,
    device_id, verification_type, source
  ) VALUES (
    v_employee_id, p_punch_time, v_shift_type, v_shift_date,
    p_device_id, p_verification_type, 'ADMS'
  )
  ON CONFLICT (employee_id, punch_time) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', v_employee_id,
    'shift_type', v_shift_type,
    'shift_date', v_shift_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 23. سياسات أمان مستوى الصف (Row Level Security)
-- ============================================================================

-- تفعيل RLS على كل الجداول
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 23.1 سياسات الموظفين (employee)
-- ============================================================================

CREATE POLICY employees_employee_select ON public.employees
  FOR SELECT USING (
    auth.uid() = user_id OR
    current_setting('app.current_role', true) IN ('manager', 'system_admin', 'developer')
  );

CREATE POLICY employees_employee_update ON public.employees
  FOR UPDATE USING (
    auth.uid() = user_id
  ) WITH CHECK (
    auth.uid() = user_id
  );

-- ============================================================================
-- 23.2 سياسات attendance_logs
-- ============================================================================

-- الموظف: يرى بصماته فقط
CREATE POLICY attendance_logs_employee_select ON public.attendance_logs
  FOR SELECT USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- المدير: يرى موظفي قسمه فقط
CREATE POLICY attendance_logs_manager_select ON public.attendance_logs
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'manager' AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

-- مدير النظام والمطور: يرون كل البصمات
CREATE POLICY attendance_logs_admin_select ON public.attendance_logs
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.3 سياسات attendance_summary
-- ============================================================================

CREATE POLICY attendance_summary_employee_select ON public.attendance_summary
  FOR SELECT USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY attendance_summary_manager_select ON public.attendance_summary
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'manager' AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY attendance_summary_admin_select ON public.attendance_summary
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.4 سياسات permissions (الزمنيات)
-- ============================================================================

-- الموظف: يرى زمنياته فقط، ويستطيع إضافة زمنية جديدة
CREATE POLICY permissions_employee_select ON public.permissions
  FOR SELECT USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY permissions_employee_insert ON public.permissions
  FOR INSERT WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- المدير: يرى زمنيات قسمه، ويستطيع الموافقة أو الرفض
CREATE POLICY permissions_manager_select ON public.permissions
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'manager' AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY permissions_manager_update ON public.permissions
  FOR UPDATE USING (
    current_setting('app.current_role', true) = 'manager' AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

-- مدير النظام والمطور: يرون ويعدّلون كل الزمنيات
CREATE POLICY permissions_admin_select ON public.permissions
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

CREATE POLICY permissions_admin_update ON public.permissions
  FOR UPDATE USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.5 سياسات leaves (الإجازات)
-- ============================================================================

CREATE POLICY leaves_employee_select ON public.leaves
  FOR SELECT USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY leaves_employee_insert ON public.leaves
  FOR INSERT WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY leaves_manager_select ON public.leaves
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'manager' AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY leaves_manager_update ON public.leaves
  FOR UPDATE USING (
    current_setting('app.current_role', true) = 'manager' AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY leaves_admin_select ON public.leaves
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

CREATE POLICY leaves_admin_update ON public.leaves
  FOR UPDATE USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.6 سياسات leave_balance
-- ============================================================================

CREATE POLICY leave_balance_employee_select ON public.leave_balance
  FOR SELECT USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY leave_balance_manager_select ON public.leave_balance
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'manager' AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY leave_balance_admin_select ON public.leave_balance
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

CREATE POLICY leave_balance_admin_update ON public.leave_balance
  FOR UPDATE USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.7 سياسات leave_settings
-- ============================================================================

CREATE POLICY leave_settings_all_select ON public.leave_settings
  FOR SELECT USING (true);

CREATE POLICY leave_settings_admin_update ON public.leave_settings
  FOR UPDATE USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.8 سياسات holidays
-- ============================================================================

CREATE POLICY holidays_all_select ON public.holidays
  FOR SELECT USING (true);

CREATE POLICY holidays_admin_insert ON public.holidays
  FOR INSERT WITH CHECK (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

CREATE POLICY holidays_admin_update ON public.holidays
  FOR UPDATE USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

CREATE POLICY holidays_admin_delete ON public.holidays
  FOR DELETE USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.9 سياسات notifications
-- ============================================================================

CREATE POLICY notifications_user_select ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_user_update ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- 23.10 سياسات ai_insights
-- ============================================================================

CREATE POLICY ai_insights_global_select ON public.ai_insights
  FOR SELECT USING (true);

-- ============================================================================
-- 23.11 سياسات system_settings
-- ============================================================================

CREATE POLICY system_settings_all_select ON public.system_settings
  FOR SELECT USING (true);

CREATE POLICY system_settings_admin_update ON public.system_settings
  FOR UPDATE USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.12 سياسات audit_log (فقط developer)
-- ============================================================================

CREATE POLICY audit_log_developer_select ON public.audit_log
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'developer'
  );

CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'system_admin'
  );

-- ============================================================================
-- 23.13 سياسات sync_log
-- ============================================================================

CREATE POLICY sync_log_admin_select ON public.sync_log
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

-- ============================================================================
-- 23.14 سياسات export_logs
-- ============================================================================

CREATE POLICY export_logs_self_select ON public.export_logs
  FOR SELECT USING (
    exported_by IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY export_logs_admin_select ON public.export_logs
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('system_admin', 'developer')
  );

CREATE POLICY export_logs_insert ON public.export_logs
  FOR INSERT WITH CHECK (
    exported_by IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 24. إنشاء حساب کاربر المسؤول الأولي (اختياري)
-- ملاحظة: هذا يتم عبر Supabase Auth Dashboard عادة
-- ============================================================================

-- دالة شاملة لإنشاء المستخدم في profiles + employees عند التسجيل
-- تنشئ سجلاً في profiles (للواجهة الأمامية) و employees (للحضور والبصمة)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_role TEXT;
  v_employee_code TEXT;
  v_attempt INT := 0;
BEGIN
  v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'name', 'مستخدم');
  v_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'full_name', 'جديد');
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');

  INSERT INTO public.profiles (id, full_name, email, role, status, created_at, updated_at)
  VALUES (NEW.id, v_first_name || ' ' || v_last_name, NEW.email, v_role, 'active', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, role = EXCLUDED.role, updated_at = NOW();

  -- توليد employee_code فريد باستخدام gen_random_uuid()
  -- نستخدم loop للمحاولة مرة أخرى إذا حدث تضارب
  LOOP
    v_employee_code := 'EMP-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 10));
    
    BEGIN
      INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role, is_active)
      VALUES (NEW.id, v_employee_code, v_first_name, v_last_name, NEW.email, v_role, true)
      ON CONFLICT (user_id) DO UPDATE SET 
        employee_code = CASE WHEN public.employees.employee_code IS NULL THEN v_employee_code ELSE public.employees.employee_code END,
        first_name = EXCLUDED.first_name, 
        last_name = EXCLUDED.last_name, 
        email = EXCLUDED.email, 
        is_active = true;
      EXIT; -- نجاح، نخرج من الحلقة
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN
        -- بعد 5 محاولات، نستخدم timestamp لضمان الفريدية
        v_employee_code := 'EMP-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || SUBSTRING(gen_random_uuid()::TEXT, 1, 4);
        INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role, is_active)
        VALUES (NEW.id, v_employee_code, v_first_name, v_last_name, NEW.email, v_role, true)
        ON CONFLICT (user_id) DO UPDATE SET 
          employee_code = CASE WHEN public.employees.employee_code IS NULL THEN v_employee_code ELSE public.employees.employee_code END,
          first_name = EXCLUDED.first_name, 
          last_name = EXCLUDED.last_name, 
          email = EXCLUDED.email, 
          is_active = true;
        EXIT;
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- مشغل إنشاء الموظف تلقائياً عند تسجيل مستخدم جديد
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 25. دوال إحصائيات وتحليلات سريعة
-- ============================================================================

-- إحصائيات الحضور ليوم معين
CREATE OR REPLACE FUNCTION public.get_daily_attendance_stats(
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  total_employees BIGINT,
  present_count BIGINT,
  late_count BIGINT,
  absent_count BIGINT,
  vacation_count BIGINT,
  permission_count BIGINT,
  attendance_rate NUMERIC(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_employees,
    COUNT(*) FILTER (WHERE status IN ('حضور_بوقت', 'متأخر', 'زمنية_معتمدة'))::BIGINT AS present_count,
    COUNT(*) FILTER (WHERE status = 'متأخر')::BIGINT AS late_count,
    COUNT(*) FILTER (WHERE status = 'غائب')::BIGINT AS absent_count,
    COUNT(*) FILTER (WHERE status IN ('مجاز', 'عطلة'))::BIGINT AS vacation_count,
    COUNT(*) FILTER (WHERE status IN ('زمنية_معتمدة', 'زمنية_انتظار'))::BIGINT AS permission_count,
    ROUND(
      (COUNT(*) FILTER (WHERE status IN ('حضور_بوقت', 'متأخر', 'زمنية_معتمدة'))::NUMERIC /
      NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('عطلة', 'مجاز')), 0)) * 100, 2
    ) AS attendance_rate
  FROM public.attendance_summary
  WHERE shift_date = p_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- إحصائيات الموظف الشهرية
CREATE OR REPLACE FUNCTION public.get_employee_monthly_stats(
  p_employee_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)
) RETURNS TABLE (
  working_days BIGINT,
  present_days BIGINT,
  late_days BIGINT,
  absent_days BIGINT,
  total_late_minutes BIGINT,
  total_overtime_minutes BIGINT,
  total_permissions BIGINT,
  avg_hours NUMERIC(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS working_days,
    COUNT(*) FILTER (WHERE status IN ('حضور_بوقت', 'متأخر'))::BIGINT AS present_days,
    COUNT(*) FILTER (WHERE status = 'متأخر')::BIGINT AS late_days,
    COUNT(*) FILTER (WHERE status = 'غائب')::BIGINT AS absent_days,
    COALESCE(SUM(late_minutes), 0)::BIGINT AS total_late_minutes,
    COALESCE(SUM(overtime_minutes), 0)::BIGINT AS total_overtime_minutes,
    COUNT(*) FILTER (WHERE status IN ('زمنية_معتمدة', 'زمنية_انتظار'))::BIGINT AS total_permissions,
    ROUND(AVG(total_hours) FILTER (WHERE total_hours > 0), 2) AS avg_hours
  FROM public.attendance_summary
  WHERE employee_id = p_employee_id
    AND EXTRACT(YEAR FROM shift_date) = p_year
    AND EXTRACT(MONTH FROM shift_date) = p_month;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- نهاية ملف schema.sql
-- ============================================================================