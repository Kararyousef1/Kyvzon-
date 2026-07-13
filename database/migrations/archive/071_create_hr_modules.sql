-- ============================================================================
-- ملف: 071_create_hr_modules.sql
-- الوصف: جداول الوحدات الإضافية (تقييم أداء + جزاءات + مستندات + نفقات + جدولة + توظيف)
-- التاريخ: 2026-06-26
-- ============================================================================

-- ============================================================================
-- أنواع بيانات إضافية
-- ============================================================================

CREATE TYPE review_status_enum AS ENUM ('draft', 'submitted', 'under_review', 'completed', 'cancelled');
CREATE TYPE goal_status_enum AS ENUM ('not_started', 'in_progress', 'on_track', 'at_risk', 'completed', 'overdue');
CREATE TYPE disciplinary_type_enum AS ENUM ('verbal_warning', 'written_warning', 'suspension', 'demotion', 'termination');
CREATE TYPE document_type_enum AS ENUM ('contract', 'certificate', 'id_copy', 'cv', 'medical', 'degree', 'recommendation', 'other');
CREATE TYPE expense_status_enum AS ENUM ('pending', 'approved', 'rejected', 'paid', 'cancelled');
CREATE TYPE job_status_enum AS ENUM ('draft', 'open', 'closed', 'filled', 'cancelled');
CREATE TYPE application_status_enum AS ENUM ('applied', 'screening', 'interview', 'test', 'offer', 'hired', 'rejected', 'withdrawn');
CREATE TYPE onboarding_status_enum AS ENUM ('pending', 'in_progress', 'completed', 'skipped');

-- ============================================================================
-- 1. تقييم الأداء
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.performance_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  review_period VARCHAR(50) NOT NULL DEFAULT 'quarterly',
  status review_status_enum NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.employees(id),
  overall_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  strengths TEXT,
  improvements TEXT,
  comments TEXT,
  goals_summary TEXT,
  status review_status_enum NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_cycle_review UNIQUE (employee_id, cycle_id)
);

CREATE INDEX idx_reviews_cycle ON public.performance_reviews(cycle_id);
CREATE INDEX idx_reviews_employee ON public.performance_reviews(employee_id);
CREATE INDEX idx_reviews_reviewer ON public.performance_reviews(reviewer_id);

CREATE TABLE IF NOT EXISTS public.performance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  weight NUMERIC(5,2) NOT NULL DEFAULT 0,
  target_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  actual_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  status goal_status_enum NOT NULL DEFAULT 'not_started',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_employee ON public.performance_goals(employee_id);
CREATE INDEX idx_goals_review ON public.performance_goals(review_id);

-- ============================================================================
-- 2. الجزاءات والإنذارات التأديبية
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type disciplinary_type_enum NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'low',
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  issued_by UUID NOT NULL REFERENCES public.employees(id),
  witnesses TEXT[],
  attachments TEXT[],
  is_appealed BOOLEAN NOT NULL DEFAULT false,
  appeal_response TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disciplinary_employee ON public.disciplinary_actions(employee_id);
CREATE INDEX idx_disciplinary_status ON public.disciplinary_actions(status);
CREATE INDEX idx_disciplinary_type ON public.disciplinary_actions(type);

-- ============================================================================
-- 3. إدارة المستندات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_type document_type_enum NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name VARCHAR(500),
  file_size BIGINT,
  mime_type VARCHAR(100),
  is confidential BOOLEAN NOT NULL DEFAULT false,
  expires_at DATE,
  uploaded_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_employee ON public.employee_documents(employee_id);
CREATE INDEX idx_documents_type ON public.employee_documents(document_type);

-- ============================================================================
-- 4. طلبات النفقات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.expense_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  status expense_status_enum NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_employee ON public.expense_requests(employee_id);
CREATE INDEX idx_expenses_status ON public.expense_requests(status);
CREATE INDEX idx_expenses_date ON public.expense_requests(expense_date);

-- ============================================================================
-- 5. جدولة الورديات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shift_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.shift_schedules(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_type shift_type_enum NOT NULL,
  shift_date DATE NOT NULL,
  notes TEXT,
  assigned_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_shift_date UNIQUE (employee_id, shift_date)
);

CREATE INDEX idx_shift_assignments_employee ON public.shift_assignments(employee_id);
CREATE INDEX idx_shift_assignments_date ON public.shift_assignments(shift_date);
CREATE INDEX idx_shift_assignments_schedule ON public.shift_assignments(schedule_id);

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.employees(id),
  target_id UUID NOT NULL REFERENCES public.employees(id),
  shift_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status expense_status_enum NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_swaps_requester ON public.shift_swap_requests(requester_id);
CREATE INDEX idx_shift_swaps_date ON public.shift_swap_requests(shift_date);

-- ============================================================================
-- 6. التوظيف
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  title_en VARCHAR(300),
  description TEXT NOT NULL,
  description_en TEXT,
  department_id UUID REFERENCES public.departments(id),
  position VARCHAR(200),
  employment_type VARCHAR(50) DEFAULT 'full_time',
  salary_min NUMERIC(12,2),
  salary_max NUMERIC(12,2),
  requirements TEXT[],
  status job_status_enum NOT NULL DEFAULT 'draft',
  vacancy_count INTEGER NOT NULL DEFAULT 1,
  posted_date DATE,
  closing_date DATE,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_postings_status ON public.job_postings(status);
CREATE INDEX idx_job_postings_department ON public.job_postings(department_id);

CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  applicant_name VARCHAR(200) NOT NULL,
  applicant_email VARCHAR(255),
  applicant_phone VARCHAR(50),
  cv_url TEXT,
  cover_letter TEXT,
  status application_status_enum NOT NULL DEFAULT 'applied',
  notes TEXT,
  reviewed_by UUID REFERENCES public.employees(id),
  hired_employee_id UUID REFERENCES public.employees(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applications_job ON public.job_applications(job_id);
CREATE INDEX idx_applications_status ON public.job_applications(status);

-- ============================================================================
-- 7. Onboarding / Offboarding
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.onboarding_tasks(id) ON DELETE CASCADE,
  status onboarding_status_enum NOT NULL DEFAULT 'pending',
  completed_by UUID REFERENCES public.employees(id),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_employee_task UNIQUE (employee_id, task_id)
);

CREATE INDEX idx_onboarding_employee ON public.employee_onboarding(employee_id);

CREATE TABLE IF NOT EXISTS public.offboarding_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  last_working_day DATE NOT NULL,
  reason TEXT NOT NULL,
  exit_type VARCHAR(50) NOT NULL DEFAULT 'voluntary',
  is_final_settlement_done BOOLEAN NOT NULL DEFAULT false,
  assets_returned TEXT[],
  access_revoked BOOLEAN NOT NULL DEFAULT false,
  exit_interview_notes TEXT,
  conducted_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_offboarding_employee ON public.offboarding_records(employee_id);

-- ============================================================================
-- 8. عقود الموظفين
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type VARCHAR(50) NOT NULL DEFAULT 'permanent',
  start_date DATE NOT NULL,
  end_date DATE,
  salary NUMERIC(12,2),
  position VARCHAR(200),
  department_id UUID REFERENCES public.departments(id),
  terms TEXT,
  contract_file_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  renewed_from UUID REFERENCES public.employee_contracts(id),
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contracts_employee ON public.employee_contracts(employee_id);
CREATE INDEX idx_contracts_status ON public.employee_contracts(status);

-- ============================================================================
-- 9. Triggers
-- ============================================================================

CREATE TRIGGER update_performance_reviews_updated_at BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_goals_updated_at BEFORE UPDATE ON public.performance_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_disciplinary_actions_updated_at BEFORE UPDATE ON public.disciplinary_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_documents_updated_at BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expense_requests_updated_at BEFORE UPDATE ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shift_assignments_updated_at BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_postings_updated_at BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_applications_updated_at BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_onboarding_updated_at BEFORE UPDATE ON public.employee_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_offboarding_records_updated_at BEFORE UPDATE ON public.offboarding_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_contracts_updated_at BEFORE UPDATE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 10. RLS
-- ============================================================================

ALTER TABLE public.performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_contracts ENABLE ROW LEVEL SECURITY;

-- الموظف يرى تقييمه
CREATE POLICY reviews_employee_select ON public.performance_reviews
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY reviews_admin_all ON public.performance_reviews
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin', 'manager'));

CREATE POLICY goals_employee_select ON public.performance_goals
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY goals_admin_all ON public.performance_goals
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY disciplinary_employee_select ON public.disciplinary_actions
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY disciplinary_admin_all ON public.disciplinary_actions
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY documents_employee_select ON public.employee_documents
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY documents_admin_all ON public.employee_documents
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY expenses_employee_select ON public.expense_requests
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY expenses_employee_insert ON public.expense_requests
  FOR INSERT WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY expenses_admin_all ON public.expense_requests
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin', 'manager'));

CREATE POLICY shifts_employee_select ON public.shift_assignments
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY shifts_admin_all ON public.shift_assignments
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY shift_swaps_employee_insert ON public.shift_swap_requests
  FOR INSERT WITH CHECK (requester_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY shift_swaps_admin_all ON public.shift_swap_requests
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY jobs_all_select ON public.job_postings
  FOR SELECT USING (status = 'open');

CREATE POLICY jobs_admin_all ON public.job_postings
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY applications_admin_all ON public.job_applications
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY onboarding_employee_select ON public.employee_onboarding
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY onboarding_admin_all ON public.employee_onboarding
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY offboarding_admin_all ON public.offboarding_records
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

CREATE POLICY contracts_employee_select ON public.employee_contracts
  FOR SELECT USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY contracts_admin_all ON public.employee_contracts
  FOR ALL USING (current_setting('app.current_role', true) IN ('hr', 'admin'));

-- ============================================================================
-- بيانات أولية (مهام Onboarding)
-- ============================================================================

INSERT INTO public.onboarding_tasks (title, description, task_type, sort_order, is_mandatory) VALUES
('استلام حسابات النظام', 'تفعيل حساب البريد والنظام', 'IT', 1, true),
('تسليم بطاقة الحضور', 'بطاقة البصمة والتعريف', 'HR', 2, true),
('مراجعة دليل الموظف', 'قراءة وتوقيع دليل سياسات الشركة', 'HR', 3, true),
('تعيين المدير المباشر', 'ربط الموظف بمشرفه المباشر', 'HR', 4, true),
('تحديد الوردية', 'تعيين الوردية المناسبة', 'HR', 5, true),
('تدريب السلامة المهنية', 'إكمال تدريب السلامة الإلزامي', 'Training', 6, true),
('جولة الشركة', 'تعرف على الأقسام والمرافق', 'HR', 7, false),
('إعداد محطة العمل', 'تجهيز المكتب والحاسوب', 'IT', 8, true),
('مقابلة الترحيب', 'لقاء مع مدير القسم', 'HR', 9, false),
('تقييم الفترة التجريبية', 'تقييم بعد 90 يوم', 'HR', 10, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- نهاية
-- ============================================================================
