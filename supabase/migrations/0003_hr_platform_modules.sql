-- ============================================================================
-- Kyvzon Development — 0003_hr_platform_modules.sql
-- Courses, SOPs, incidents, structure, payroll and supporting settings
-- ============================================================================

-- ============================================
-- نظام إدارة الهيكلية للمطور
-- Developer System Structure Management
-- ============================================

-- 1. جدول الأقسام التصنيعية
CREATE TABLE IF NOT EXISTS structure_departments (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول المناصب الوظيفية
CREATE TABLE IF NOT EXISTS structure_positions (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  department_id INT REFERENCES structure_departments(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول المراتب
CREATE TABLE IF NOT EXISTS structure_ranks (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  level INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول الورديات
CREATE TABLE IF NOT EXISTS structure_shifts (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول أدوار النظام
CREATE TABLE IF NOT EXISTS structure_roles (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- إدراج البيانات الافتراضية (فقط إذا كانت الجداول فارغة)
-- ============================================

INSERT INTO structure_departments (name_ar, name_en, code) 
SELECT 'قسم التقنية', 'Tech Dept', 'tech'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'syrups');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'قسم المبيعات', 'Sales Dept', 'sales'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'tablets');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'قسم التسويق', 'Marketing Dept', 'marketing'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'ointments');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'قسم الدعم الفني', 'Support Dept', 'support'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'powders');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'الإدارة العامة', 'General Management', 'management'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'management');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'تقنية المعلومات', 'IT Dept', 'it'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'it');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'الموارد البشرية', 'HR Dept', 'hr'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'hr');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'موظف', 'Employee', 'employee', 1
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'employee');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'مشرف', 'Supervisor', 'supervisor', 2
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'supervisor');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'مدير قسم', 'Department Manager', 'manager', 3
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'manager');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'مدير تنفيذي', 'Executive Director', 'executive', 4
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'executive');

INSERT INTO structure_shifts (name_ar, name_en, code, start_time, end_time)
SELECT 'الوردية الصباحية', 'Morning Shift', 'morning', '08:00', '16:00'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'morning');

INSERT INTO structure_shifts (name_ar, name_en, code, start_time, end_time)
SELECT 'الوردية المسائية', 'Evening Shift', 'evening', '16:00', '00:00'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'evening');

INSERT INTO structure_shifts (name_ar, name_en, code, start_time, end_time)
SELECT 'الوردية الليلية', 'Night Shift', 'night', '00:00', '08:00'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'night');

INSERT INTO structure_shifts (name_ar, name_en, code)
SELECT 'وردية مرنة', 'Flexible Shift', 'flexible'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'flexible');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'موظف', 'Employee', 'employee'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'employee');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مشرف', 'Supervisor', 'supervisor'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'supervisor');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مدير قسم', 'Department Manager', 'manager'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'manager');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'موارد بشرية', 'HR', 'hr'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'hr');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'حارس', 'Gatekeeper', 'gatekeeper'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'gatekeeper');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مطور', 'Developer', 'developer'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'developer');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مدير نظام', 'System Admin', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'admin');

-- عرض البيانات
SELECT '✅ Departments:' as info, COUNT(*) as count FROM structure_departments
UNION ALL SELECT '✅ Ranks:', COUNT(*) FROM structure_ranks
UNION ALL SELECT '✅ Shifts:', COUNT(*) FROM structure_shifts
UNION ALL SELECT '✅ Roles:', COUNT(*) FROM structure_roles;

-- ============================================================================
-- ملف: 001_add_missing_tables.sql
-- الوصف: إضافة الجداول المفقودة التي تستخدمها صفحات بوابة الموظف
-- التاريخ: 2026-06-17
-- ============================================================================

-- ============================================================================
-- 1. جدول البلاغات (Incidents) - لصفحات ProblemsList, NewProblemPage, ProblemDetail
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'other'
    CHECK (category IN ('technical', 'hr', 'management', 'workplace', 'salary', 'safety', 'other')),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
  employee_name VARCHAR(200),
  department VARCHAR(200),
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  reported_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_user ON public.incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON public.incidents(created_at DESC);

-- مشغل تحديث updated_at للبلاغات
DROP TRIGGER IF EXISTS update_incidents_updated_at ON public.incidents;
CREATE TRIGGER update_incidents_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. جدول تعليقات البلاغات (Incident Comments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incident_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident ON public.incident_comments(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_comments_created ON public.incident_comments(created_at ASC);

-- ============================================================================
-- 3. جدول إجراءات التشغيل القياسية (SOPs) - لصفحة SOPsPage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(300) NOT NULL,
  title_en VARCHAR(300),
  description TEXT NOT NULL,
  description_en TEXT,
  department VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  duration INTEGER NOT NULL DEFAULT 15,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  review_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 year'),
  tags TEXT[] DEFAULT '{}',
  file_url TEXT,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sops_department ON public.sops(department);
CREATE INDEX IF NOT EXISTS idx_sops_category ON public.sops(category);
CREATE INDEX IF NOT EXISTS idx_sops_status ON public.sops(status);
CREATE INDEX IF NOT EXISTS idx_sops_code ON public.sops(code);

DROP TRIGGER IF EXISTS update_sops_updated_at ON public.sops;
CREATE TRIGGER update_sops_updated_at
  BEFORE UPDATE ON public.sops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. جدول سجل قراءة SOPs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sop_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES public.sops(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  read_count INTEGER NOT NULL DEFAULT 0,
  time_spent INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_sop UNIQUE (employee_id, sop_id)
);

CREATE INDEX IF NOT EXISTS idx_sop_readings_employee ON public.sop_readings(employee_id);
CREATE INDEX IF NOT EXISTS idx_sop_readings_sop ON public.sop_readings(sop_id);

-- ============================================================================
-- 5. جدول الدورات التدريبية (Courses) - لصفحة TrainingPage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  title_en VARCHAR(300),
  description TEXT NOT NULL,
  description_en TEXT,
  category VARCHAR(50) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'مبتدئ'
    CHECK (level IN ('مبتدئ', 'متوسط', 'متقدم', 'خبير')),
  duration VARCHAR(50) NOT NULL DEFAULT 'ساعة',
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  mandatory BOOLEAN NOT NULL DEFAULT false,
  points INTEGER NOT NULL DEFAULT 0,
  instructor VARCHAR(200),
  thumbnail TEXT,
  objectives TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_category ON public.courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_level ON public.courses(level);
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);

DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. جدول وحدات الدورات التدريبية (Course Modules)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  duration VARCHAR(50) NOT NULL DEFAULT '15 دقيقة',
  type VARCHAR(20) NOT NULL DEFAULT 'reading'
    CHECK (type IN ('video', 'reading', 'quiz', 'practical')),
  content TEXT,
  key_points TEXT[] DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_modules_course ON public.course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_order ON public.course_modules(course_id, sort_order);

-- ============================================================================
-- 7. جدول تقدم الموظف في الدورات التدريبية
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_course UNIQUE (employee_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_progress_employee ON public.course_progress(employee_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course ON public.course_progress(course_id);

-- ============================================================================
-- 8. جدول إجابات الاستبيانات (Survey Responses) - لصفحة SurveyPage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id VARCHAR(100) NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_survey UNIQUE (employee_id, survey_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_employee ON public.survey_responses(employee_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON public.survey_responses(survey_id);

-- ============================================================================
-- 9. جدول مدخلات الصحة النفسية (Wellness Entries) - لصفحة WellnessPage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wellness_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  score INTEGER NOT NULL DEFAULT 50,
  mood VARCHAR(20) NOT NULL DEFAULT 'good'
    CHECK (mood IN ('great', 'good', 'neutral', 'bad', 'terrible')),
  stress INTEGER NOT NULL DEFAULT 30,
  energy INTEGER NOT NULL DEFAULT 70,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_date UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_wellness_entries_employee ON public.wellness_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_wellness_entries_date ON public.wellness_entries(date);

-- ============================================================================
-- 10. جدول رسائل الموظفين إلى HR (HR Messages) - لصفحة ContactPage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hr_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  subject VARCHAR(300) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'urgent')),
  status VARCHAR(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'closed')),
  reply TEXT,
  replied_by UUID REFERENCES public.employees(id),
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_messages_employee ON public.hr_messages(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_messages_status ON public.hr_messages(status);
CREATE INDEX IF NOT EXISTS idx_hr_messages_priority ON public.hr_messages(priority);
CREATE INDEX IF NOT EXISTS idx_hr_messages_created ON public.hr_messages(created_at DESC);

DROP TRIGGER IF EXISTS update_hr_messages_updated_at ON public.hr_messages;
CREATE TRIGGER update_hr_messages_updated_at
  BEFORE UPDATE ON public.hr_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- دوال RLS لهذه الجداول (مع إضافة system_settings)
-- ============================================================================

ALTER TABLE IF EXISTS public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.incident_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sop_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wellness_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hr_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- نهاية ملف الإضافة
-- ============================================================================

-- ════════════════════════════════════════════════════════════════
--  FILE: 070_create_payroll_tables.sql
--  PURPOSE: Create Payroll Related Tables
--  EXECUTION ORDER: 10
--  DEPENDS ON: 001_initial_schema.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payroll_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'open',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    payroll_period_id UUID REFERENCES payroll_periods(id),
    base_salary NUMERIC(12,2),
    allowances NUMERIC(12,2) DEFAULT 0,
    deductions NUMERIC(12,2) DEFAULT 0,
    net_salary NUMERIC(12,2),
    status TEXT DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(payroll_period_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  FILE: 071_create_hr_modules.sql
--  PURPOSE: Create HR Modules Tables (Payroll, Performance, etc.)
--  EXECUTION ORDER: 21
--  DEPENDS ON: 001_initial_schema.sql, 070_create_payroll_tables.sql
--  SAFETY LEVEL: MEDIUM
--  ════════════════════════════════════════════════════════════════

-- This file can contain additional HR module tables
-- Most tables are already created in 070_create_payroll_tables.sql

-- Performance Reviews
CREATE TABLE IF NOT EXISTS performance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES profiles(id),
    cycle_id UUID,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    comments TEXT,
    status TEXT DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee ON performance_reviews(employee_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  FILE: 006_hr_modules.sql
--  PURPOSE: HR Modules (Courses, SOPs, Notifications)
--  EXECUTION ORDER: 6 (After 001_core_schema.sql)
--  SAFETY: HIGH - Uses IF NOT EXISTS
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: COURSES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    duration_minutes INTEGER,
    instructor TEXT,
    is_mandatory BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    score INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: SOPs (Standard Operating Procedures)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    department_id UUID REFERENCES departments(id),
    content TEXT,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: NOTIFICATIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    related_table TEXT,
    related_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 4: INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_course_progress_employee 
    ON course_progress(employee_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user 
    ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_unread 
    ON notifications(user_id, is_read) WHERE is_read = false;

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════
-- Canonical system settings table. Public landing reads through a view later.
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  landing_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  general_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  ai_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  shift_timings JSONB NOT NULL DEFAULT '{}'::JSONB,
  shift_windows JSONB NOT NULL DEFAULT '{}'::JSONB,
  leave_defaults JSONB NOT NULL DEFAULT '{}'::JSONB,
  work_weekend JSONB NOT NULL DEFAULT '[]'::JSONB,
  overtime_rules JSONB NOT NULL DEFAULT '{}'::JSONB,
  attendance_thresholds JSONB NOT NULL DEFAULT '{}'::JSONB,
  ai_insights_schedule JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  target TEXT,
  details TEXT,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  device_id TEXT,
  records_synced INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_tenant ON public.system_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON public.sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_logs_tenant_created ON public.export_logs(tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'zkteco',
  ip_address INET NOT NULL,
  port INTEGER NOT NULL DEFAULT 4370 CHECK (port BETWEEN 1 AND 65535),
  location TEXT,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (sync_interval_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permission_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  emp_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_permissions JSONB NOT NULL DEFAULT '{}'::JSONB,
  new_permissions JSONB NOT NULL DEFAULT '{}'::JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'IQD',
  payment_method TEXT,
  payment_reference TEXT,
  max_employees INTEGER NOT NULL DEFAULT 50,
  features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role TEXT,
  target_type TEXT,
  target_id UUID,
  target_name TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  description TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_devices_tenant ON public.biometric_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_tenant_time ON public.permission_audit_logs(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON public.tenant_subscriptions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_tenant_time ON public.platform_audit_log(tenant_id, created_at DESC);
