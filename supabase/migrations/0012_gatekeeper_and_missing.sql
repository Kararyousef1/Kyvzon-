-- ============================================================================
--  FILE: 0012_gatekeeper_and_missing.sql
--  PURPOSE: Fill remaining schema gaps used by the SDK/Frontend
--  EXECUTION ORDER: 13th
--  DEPENDS ON: 0001_core_schema.sql (tenants, profiles, employees),
--              0010_platform_tenant_rls_audit.sql (current_user_* helpers)
--  SAFETY LEVEL: HIGH — idempotent
-- ============================================================================
--
--  This migration adds the tables that the frontend/SDK already references but
--  were not present in the canonical migrations 0001-0011. Each table is
--  documented with the SDK service that consumes it.
--
--  Sections:
--   1. Gatekeeper module
--   2. Movement & time tracking
--   3. Structure: specialties
--   4. Recruitment: job_applications
--   5. AI insights
--   6. Customer reviews
--   7. public_landing_config (view over system_settings, RLS-safe)
-- ============================================================================


-- ============================================================================
--  1. GATEKEEPER MODULE
--  SDK: src/services/sdk/GatekeeperService.ts + GatekeeperVisitorService.ts
--
--  NOTE: These tables intentionally do NOT include tenant_id in the current
--  SDK implementation (see GatekeeperService header comment). Access control
--  is enforced via created_by / RLS on session ownership.
--
--  We add tenant_id here anyway (nullable) for future-proofing, and RLS is
--  written so that:
--   - If tenant_id IS NULL: any authenticated user in gatekeeper role can access.
--   - If tenant_id IS NOT NULL: standard tenant isolation applies.
-- ============================================================================

-- ─── gatekeeper_sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gatekeeper_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  gatekeeper_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  handover_status VARCHAR(50),
  temp_pin        VARCHAR(20),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gk_sessions_active
  ON public.gatekeeper_sessions(is_active, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_gk_sessions_gatekeeper
  ON public.gatekeeper_sessions(gatekeeper_id);
CREATE INDEX IF NOT EXISTS idx_gk_sessions_tenant
  ON public.gatekeeper_sessions(tenant_id) WHERE tenant_id IS NOT NULL;

-- ─── gatekeeper_visitors ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gatekeeper_visitors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  phone           VARCHAR(50),
  id_number       VARCHAR(50),
  vehicle_number  VARCHAR(50),
  purpose         VARCHAR(300),
  host_name       VARCHAR(200),
  status          VARCHAR(30) DEFAULT 'checked_in',
  check_in_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_time  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gk_visitors_phone
  ON public.gatekeeper_visitors(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gk_visitors_status
  ON public.gatekeeper_visitors(status, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_gk_visitors_tenant
  ON public.gatekeeper_visitors(tenant_id) WHERE tenant_id IS NOT NULL;

-- ─── gatekeeper_visitor_logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gatekeeper_visitor_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES public.gatekeeper_sessions(id) ON DELETE SET NULL,
  visitor_name    VARCHAR(200) NOT NULL,
  visitor_phone   VARCHAR(50),
  id_number       VARCHAR(50),
  check_in_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_time  TIMESTAMPTZ,
  purpose         VARCHAR(300),
  host_name       VARCHAR(200),
  status          VARCHAR(30) DEFAULT 'in',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gk_vlogs_session
  ON public.gatekeeper_visitor_logs(session_id, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_gk_vlogs_status
  ON public.gatekeeper_visitor_logs(status, check_in_time DESC);


-- ============================================================================
--  2. MOVEMENT & TIME TRACKING
-- ============================================================================

-- ─── movements_log ──────────────────────────────────────────────────────────
-- SDK: src/services/sdk/GatekeeperService.ts (movementLogService)
CREATE TABLE IF NOT EXISTS public.movements_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_type   VARCHAR(50),   -- 'exit', 'return', 'field_visit', 'training', ...
  departure_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at     TIMESTAMPTZ,
  destination     VARCHAR(300),
  purpose         VARCHAR(500),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movements_tenant_emp
  ON public.movements_log(tenant_id, employee_id, departure_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_active
  ON public.movements_log(tenant_id, departure_at DESC) WHERE returned_at IS NULL;

-- ─── time_logs ──────────────────────────────────────────────────────────────
-- SDK: src/services/sdk/TimeLogService.ts
CREATE TABLE IF NOT EXISTS public.time_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  log_type     VARCHAR(50) NOT NULL,   -- 'check_in', 'check_out', 'break_start', 'break_end', ...
  "timestamp"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       VARCHAR(50),            -- 'biometric', 'kiosk', 'mobile', 'manual', ...
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_logs_tenant_emp
  ON public.time_logs(tenant_id, employee_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_type
  ON public.time_logs(log_type, "timestamp" DESC);


-- ============================================================================
--  3. STRUCTURE: specialties
-- ============================================================================

-- ─── specialties ────────────────────────────────────────────────────────────
-- SDK: src/services/sdk/DepartmentService.ts (specialtyService)
CREATE TABLE IF NOT EXISTS public.specialties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  name_en      VARCHAR(200),
  description  TEXT,
  department   VARCHAR(200),
  role_level   VARCHAR(50),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT specialties_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_specialties_tenant
  ON public.specialties(tenant_id, name);


-- ============================================================================
--  4. RECRUITMENT: job_applications
-- ============================================================================

-- ─── job_applications ──────────────────────────────────────────────────────
-- SDK: src/services/sdk/RecruitmentService.ts (jobApplicationService)
CREATE TABLE IF NOT EXISTS public.job_applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  posting_id     UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  applicant_name VARCHAR(200) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone          VARCHAR(50),
  resume_url     TEXT,
  status         VARCHAR(50) NOT NULL DEFAULT 'submitted',
    -- 'submitted', 'reviewing', 'shortlisted', 'interviewed', 'offered', 'rejected', 'withdrawn'
  notes          TEXT,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_apps_tenant_posting
  ON public.job_applications(tenant_id, posting_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_apps_status
  ON public.job_applications(tenant_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_apps_email
  ON public.job_applications(tenant_id, email);


-- ============================================================================
--  5. AI INSIGHTS
-- ============================================================================

-- ─── ai_insights ────────────────────────────────────────────────────────────
-- SDK: src/services/sdk/AIService.ts (aiService)
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_type    VARCHAR(50) NOT NULL,
    -- 'attendance', 'anomaly', 'prediction', 'department', 'workforce_health'
  scope           VARCHAR(30) NOT NULL DEFAULT 'global',
    -- 'global', 'department', 'employee'
  department_id   UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  title           VARCHAR(300) NOT NULL,
  summary         TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity        VARCHAR(30) NOT NULL DEFAULT 'info',
    -- 'info', 'warning', 'critical'
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_generated
  ON public.ai_insights(tenant_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type_severity
  ON public.ai_insights(tenant_id, insight_type, severity);
-- Note: Cannot use "WHERE valid_until > NOW()" — NOW() is not IMMUTABLE.
-- Instead we index on valid_until directly; queries should filter with the
-- runtime value: WHERE valid_until IS NULL OR valid_until > now().
CREATE INDEX IF NOT EXISTS idx_ai_insights_valid_until
  ON public.ai_insights(tenant_id, valid_until);


-- ============================================================================
--  6. CUSTOMER REVIEWS
-- ============================================================================

-- ─── customer_reviews ──────────────────────────────────────────────────────
-- SDK: src/services/sdk/ReviewService.ts (reviewService)
CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  customer_name VARCHAR(200),
  product_name  VARCHAR(200),
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_tenant_created
  ON public.customer_reviews(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_employee
  ON public.customer_reviews(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_rating
  ON public.customer_reviews(tenant_id, rating);


-- ============================================================================
--  7. public_landing_config (VIEW over system_settings)
--
--  Frontend (src/core/stores/uiStore.ts) reads the landing config from a
--  "table" it calls public_landing_config. To avoid exposing the entire
--  system_settings row (which contains ai_settings and other sensitive keys),
--  we expose it as a security-invoker VIEW that only surfaces landing_config.
--
--  Prerequisite: system_settings table exists (created in 0003_hr_platform_modules.sql)
--  and holds a singleton row with id = 'singleton'.
-- ============================================================================

DROP VIEW IF EXISTS public.public_landing_config;
CREATE VIEW public.public_landing_config
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.landing_config
FROM public.system_settings s;

-- Grant read access; underlying RLS on system_settings still applies.
GRANT SELECT ON public.public_landing_config TO authenticated, anon;


-- ============================================================================
--  RLS — Row Level Security
-- ============================================================================

-- All new tables get RLS enabled
ALTER TABLE public.gatekeeper_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gatekeeper_visitors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gatekeeper_visitor_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews         ENABLE ROW LEVEL SECURITY;

-- ─── Gatekeeper Sessions ─────────────────────────────────────────────────────
-- Read: any authenticated user in the same tenant (or global tenant_id IS NULL).
-- Write: only gatekeeper/admin/hr.

DROP POLICY IF EXISTS kyvzon_gk_sessions_select ON public.gatekeeper_sessions;
CREATE POLICY kyvzon_gk_sessions_select ON public.gatekeeper_sessions
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS kyvzon_gk_sessions_write ON public.gatekeeper_sessions;
CREATE POLICY kyvzon_gk_sessions_write ON public.gatekeeper_sessions
  FOR ALL TO authenticated
  USING (
    (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
      OR gatekeeper_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IS NULL OR tenant_id = public.current_user_tenant_id()
  );

-- ─── Gatekeeper Visitors ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_gk_visitors_select ON public.gatekeeper_visitors;
CREATE POLICY kyvzon_gk_visitors_select ON public.gatekeeper_visitors
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS kyvzon_gk_visitors_write ON public.gatekeeper_visitors;
CREATE POLICY kyvzon_gk_visitors_write ON public.gatekeeper_visitors
  FOR ALL TO authenticated
  USING (
    (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
    )
  )
  WITH CHECK (
    tenant_id IS NULL OR tenant_id = public.current_user_tenant_id()
  );

-- ─── Gatekeeper Visitor Logs ─────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs;
CREATE POLICY kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS kyvzon_gk_vlogs_write ON public.gatekeeper_visitor_logs;
CREATE POLICY kyvzon_gk_vlogs_write ON public.gatekeeper_visitor_logs
  FOR ALL TO authenticated
  USING (
    (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
    )
  )
  WITH CHECK (
    tenant_id IS NULL OR tenant_id = public.current_user_tenant_id()
  );

-- ─── Movements Log ──────────────────────────────────────────────────────────
-- Read: staff/gatekeeper see all in tenant; employees see own only.
-- Write: staff/gatekeeper only.
DROP POLICY IF EXISTS kyvzon_movements_select ON public.movements_log;
CREATE POLICY kyvzon_movements_select ON public.movements_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
      OR employee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS kyvzon_movements_write ON public.movements_log;
CREATE POLICY kyvzon_movements_write ON public.movements_log
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
    )
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );

-- ─── Time Logs ──────────────────────────────────────────────────────────────
-- Read: employees see own; staff see all in tenant.
-- Write: staff or the employee themselves.
DROP POLICY IF EXISTS kyvzon_time_logs_select ON public.time_logs;
CREATE POLICY kyvzon_time_logs_select ON public.time_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR employee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS kyvzon_time_logs_insert ON public.time_logs;
CREATE POLICY kyvzon_time_logs_insert ON public.time_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR employee_id = auth.uid())
  );

DROP POLICY IF EXISTS kyvzon_time_logs_update ON public.time_logs;
CREATE POLICY kyvzon_time_logs_update ON public.time_logs
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

DROP POLICY IF EXISTS kyvzon_time_logs_delete ON public.time_logs;
CREATE POLICY kyvzon_time_logs_delete ON public.time_logs
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

-- ─── Specialties ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_specialties_select ON public.specialties;
CREATE POLICY kyvzon_specialties_select ON public.specialties
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_specialties_write ON public.specialties;
CREATE POLICY kyvzon_specialties_write ON public.specialties
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );

-- ─── Job Applications ───────────────────────────────────────────────────────
-- Public inserts are handled by an Edge Function; here we only allow
-- authenticated staff to read/update/delete.
DROP POLICY IF EXISTS kyvzon_job_apps_select ON public.job_applications;
CREATE POLICY kyvzon_job_apps_select ON public.job_applications
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

DROP POLICY IF EXISTS kyvzon_job_apps_write ON public.job_applications;
CREATE POLICY kyvzon_job_apps_write ON public.job_applications
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );

-- ─── AI Insights ────────────────────────────────────────────────────────────
-- Read: employees see own or global; staff see everything in tenant.
-- Write: staff only (usually generated server-side).
DROP POLICY IF EXISTS kyvzon_ai_insights_select ON public.ai_insights;
CREATE POLICY kyvzon_ai_insights_select ON public.ai_insights
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR scope = 'global'
      OR employee_id = public.current_user_employee_id()
    )
  );

DROP POLICY IF EXISTS kyvzon_ai_insights_write ON public.ai_insights;
CREATE POLICY kyvzon_ai_insights_write ON public.ai_insights
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );

-- ─── Customer Reviews ───────────────────────────────────────────────────────
-- Read: tenant-scoped for everyone.
-- Write: staff only.
DROP POLICY IF EXISTS kyvzon_reviews_select ON public.customer_reviews;
CREATE POLICY kyvzon_reviews_select ON public.customer_reviews
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_reviews_write ON public.customer_reviews;
CREATE POLICY kyvzon_reviews_write ON public.customer_reviews
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );


-- ============================================================================
--  Triggers: updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_specialties_updated_at ON public.specialties;
CREATE TRIGGER trg_specialties_updated_at
  BEFORE UPDATE ON public.specialties
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_job_apps_updated_at ON public.job_applications;
CREATE TRIGGER trg_job_apps_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- ============================================================================
--  Sanity checks
-- ============================================================================
DO $$
BEGIN
  -- All new tables exist
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'gatekeeper_sessions');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'gatekeeper_visitors');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'gatekeeper_visitor_logs');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'movements_log');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'time_logs');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'specialties');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'job_applications');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'ai_insights');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'customer_reviews');
  ASSERT EXISTS (SELECT 1 FROM information_schema.views
                 WHERE table_schema = 'public' AND table_name = 'public_landing_config');
  -- RLS enabled on all
  ASSERT (SELECT bool_and(rowsecurity) FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename IN (
              'gatekeeper_sessions', 'gatekeeper_visitors', 'gatekeeper_visitor_logs',
              'movements_log', 'time_logs', 'specialties', 'job_applications',
              'ai_insights', 'customer_reviews'
            )),
    'RLS must be enabled on all new tables';
END $$;
