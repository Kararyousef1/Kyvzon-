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