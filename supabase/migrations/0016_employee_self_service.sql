-- ============================================================================
--  FILE: 0016_employee_self_service.sql
--  PURPOSE: Employee Portal completion slice: goals, skills, HR cases, letters
--  SCOPE: Existing Employee Portal only — no new ERP portals
--  SAFETY LEVEL: HIGH — idempotent
-- ============================================================================

-- ============================================================================
--  1. EMPLOYEE GOALS & SKILLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_goals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id        UUID NOT NULL,
  title              VARCHAR(300) NOT NULL,
  description        TEXT,
  category           VARCHAR(50) NOT NULL DEFAULT 'performance'
    CHECK (category IN ('performance', 'learning', 'wellbeing', 'career', 'compliance', 'other')),
  metric             VARCHAR(200),
  target_value       VARCHAR(200),
  current_value      VARCHAR(200),
  progress_percent   INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status             VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  due_date           DATE,
  last_update_note   TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_goals_tenant_employee
  ON public.employee_goals(tenant_id, employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_goals_status
  ON public.employee_goals(tenant_id, status, due_date);

CREATE TABLE IF NOT EXISTS public.goal_updates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  goal_id            UUID NOT NULL REFERENCES public.employee_goals(id) ON DELETE CASCADE,
  employee_id        UUID NOT NULL,
  progress_percent   INTEGER NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  note               TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_updates_tenant_goal
  ON public.goal_updates(tenant_id, goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.employee_skills (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id        UUID NOT NULL,
  skill_name         VARCHAR(200) NOT NULL,
  category           VARCHAR(100),
  level              VARCHAR(30) NOT NULL DEFAULT 'intermediate'
    CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  evidence           TEXT,
  source             VARCHAR(50) NOT NULL DEFAULT 'employee_self_assessment'
    CHECK (source IN ('employee_self_assessment', 'manager_review', 'training', 'hr')),
  status             VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_skills_unique_active UNIQUE (tenant_id, employee_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_employee_skills_tenant_employee
  ON public.employee_skills(tenant_id, employee_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_skills_name
  ON public.employee_skills(tenant_id, skill_name);

-- ============================================================================
--  2. HR SELF-SERVICE CASES & LETTER REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hr_cases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id        UUID NOT NULL,
  case_type          VARCHAR(80) NOT NULL DEFAULT 'general_inquiry',
  subject            VARCHAR(300) NOT NULL,
  description        TEXT NOT NULL,
  priority           VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'urgent')),
  status             VARCHAR(40) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'waiting_employee', 'resolved', 'closed')),
  channel            VARCHAR(40) NOT NULL DEFAULT 'employee_portal'
    CHECK (channel IN ('employee_portal', 'tawathul', 'email', 'phone')),
  assigned_to        UUID,
  resolution_summary TEXT,
  sla_due_at         TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_cases_tenant_employee
  ON public.hr_cases(tenant_id, employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_cases_status
  ON public.hr_cases(tenant_id, status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hr_case_comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  case_id            UUID NOT NULL REFERENCES public.hr_cases(id) ON DELETE CASCADE,
  employee_id        UUID,
  author_id          UUID NOT NULL,
  author_role        VARCHAR(50),
  message            TEXT NOT NULL,
  is_internal        BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_case_comments_tenant_case
  ON public.hr_case_comments(tenant_id, case_id, created_at);

CREATE TABLE IF NOT EXISTS public.employee_letter_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id        UUID NOT NULL,
  letter_type        VARCHAR(60) NOT NULL
    CHECK (letter_type IN ('employment_verification', 'salary_certificate', 'experience_letter', 'other')),
  purpose            TEXT,
  language           VARCHAR(10) NOT NULL DEFAULT 'ar'
    CHECK (language IN ('ar', 'en', 'both')),
  delivery_method    VARCHAR(30) NOT NULL DEFAULT 'portal'
    CHECK (delivery_method IN ('portal', 'email', 'printed')),
  status             VARCHAR(30) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'ready', 'delivered', 'rejected')),
  document_url       TEXT,
  reviewed_by        UUID,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_letter_requests_tenant_employee
  ON public.employee_letter_requests(tenant_id, employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_letter_requests_status
  ON public.employee_letter_requests(tenant_id, status, created_at DESC);

-- ============================================================================
--  RLS
-- ============================================================================

ALTER TABLE public.employee_goals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_updates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_cases                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_case_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_letter_requests ENABLE ROW LEVEL SECURITY;

-- Employee Goals: employee owns own records; staff can read/manage tenant records.
DROP POLICY IF EXISTS kyvzon_employee_goals_select ON public.employee_goals;
CREATE POLICY kyvzon_employee_goals_select ON public.employee_goals
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_employee_goals_write ON public.employee_goals;
CREATE POLICY kyvzon_employee_goals_write ON public.employee_goals
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_goal_updates_select ON public.goal_updates;
CREATE POLICY kyvzon_goal_updates_select ON public.goal_updates
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_goal_updates_write ON public.goal_updates;
CREATE POLICY kyvzon_goal_updates_write ON public.goal_updates
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_employee_skills_select ON public.employee_skills;
CREATE POLICY kyvzon_employee_skills_select ON public.employee_skills
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_employee_skills_write ON public.employee_skills;
CREATE POLICY kyvzon_employee_skills_write ON public.employee_skills
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

-- HR Cases: employees see own non-internal data; staff sees tenant data.
DROP POLICY IF EXISTS kyvzon_hr_cases_select ON public.hr_cases;
CREATE POLICY kyvzon_hr_cases_select ON public.hr_cases
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_hr_cases_insert ON public.hr_cases;
CREATE POLICY kyvzon_hr_cases_insert ON public.hr_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_hr_cases_update ON public.hr_cases;
CREATE POLICY kyvzon_hr_cases_update ON public.hr_cases
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  )
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_hr_case_comments_select ON public.hr_case_comments;
CREATE POLICY kyvzon_hr_case_comments_select ON public.hr_case_comments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR (
        is_internal = false
        AND EXISTS (
          SELECT 1 FROM public.hr_cases c
          WHERE c.id = hr_case_comments.case_id
            AND c.tenant_id = hr_case_comments.tenant_id
            AND (c.employee_id = auth.uid() OR c.employee_id = public.current_user_employee_id())
        )
      )
    )
  );

DROP POLICY IF EXISTS kyvzon_hr_case_comments_write ON public.hr_case_comments;
CREATE POLICY kyvzon_hr_case_comments_write ON public.hr_case_comments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR (
        is_internal = false
        AND EXISTS (
          SELECT 1 FROM public.hr_cases c
          WHERE c.id = hr_case_comments.case_id
            AND c.tenant_id = hr_case_comments.tenant_id
            AND (c.employee_id = auth.uid() OR c.employee_id = public.current_user_employee_id())
        )
      )
    )
  );

DROP POLICY IF EXISTS kyvzon_letter_requests_select ON public.employee_letter_requests;
CREATE POLICY kyvzon_letter_requests_select ON public.employee_letter_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_letter_requests_write ON public.employee_letter_requests;
CREATE POLICY kyvzon_letter_requests_write ON public.employee_letter_requests
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid() OR employee_id = public.current_user_employee_id())
  );

-- ============================================================================
--  Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trg_employee_goals_updated_at ON public.employee_goals;
CREATE TRIGGER trg_employee_goals_updated_at
  BEFORE UPDATE ON public.employee_goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_employee_skills_updated_at ON public.employee_skills;
CREATE TRIGGER trg_employee_skills_updated_at
  BEFORE UPDATE ON public.employee_skills
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_hr_cases_updated_at ON public.hr_cases;
CREATE TRIGGER trg_hr_cases_updated_at
  BEFORE UPDATE ON public.hr_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_letter_requests_updated_at ON public.employee_letter_requests;
CREATE TRIGGER trg_letter_requests_updated_at
  BEFORE UPDATE ON public.employee_letter_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================================
--  Sanity checks
-- ============================================================================
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_goals');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goal_updates');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_skills');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hr_cases');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hr_case_comments');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_letter_requests');

  ASSERT (SELECT bool_and(rowsecurity) FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename IN ('employee_goals', 'goal_updates', 'employee_skills', 'hr_cases', 'hr_case_comments', 'employee_letter_requests')),
    'RLS must be enabled on Employee Self-Service tables';
END $$;
