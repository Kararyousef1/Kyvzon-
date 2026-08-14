-- ═══════════════════════════════════════════════════════════════════════════
-- 0376 — دورة حياة الموظف: Hire → Auth invitation → Draft contract
--                         Offboarding → Contract close → Auth disable
--
-- PostgreSQL لا يستطيع إنشاء/تعطيل مستخدم Auth بأمان؛ لذلك تعتمد الدفعة
-- outbox دائمة (`employee_identity_jobs`). إنشاء الموظف والعقد والمسار
-- التعريفي والـoutbox ذري داخل DB، ثم Edge Function تنفذ Auth مع retry واضح.
-- لا تعديل لأي migration مطبقة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① روابط العقود الحقيقية إلى التوظيف وإنهاء الخدمة.
-- ───────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_applications_id_tenant_lifecycle
  ON public.job_applications (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_offboarding_records_id_tenant_lifecycle
  ON public.offboarding_records (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_id_tenant_lifecycle
  ON public.employees (id, tenant_id);

-- أي قيمة تاريخية غير صحيحة تُفصل بدلاً من حذف العقد القانوني.
UPDATE public.employee_contracts c
   SET job_application_id = NULL
 WHERE c.job_application_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.job_applications a
      WHERE a.id = c.job_application_id AND a.tenant_id = c.tenant_id
   );

UPDATE public.employee_contracts c
   SET offboarding_id = NULL
 WHERE c.offboarding_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.offboarding_records o
      WHERE o.id = c.offboarding_id AND o.tenant_id = c.tenant_id
   );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_job_application_tenant_fkey') THEN
    ALTER TABLE public.employee_contracts
      ADD CONSTRAINT employee_contracts_job_application_tenant_fkey
      FOREIGN KEY (job_application_id, tenant_id)
      REFERENCES public.job_applications(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_offboarding_tenant_fkey') THEN
    ALTER TABLE public.employee_contracts
      ADD CONSTRAINT employee_contracts_offboarding_tenant_fkey
      FOREIGN KEY (offboarding_id, tenant_id)
      REFERENCES public.offboarding_records(id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_contract_job_application
  ON public.employee_contracts (tenant_id, job_application_id)
  WHERE job_application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_contract_offboarding
  ON public.employee_contracts (tenant_id, offboarding_id)
  WHERE offboarding_id IS NOT NULL;

COMMENT ON COLUMN public.employee_contracts.offboarding_id IS
  'سجل إنهاء الخدمة الذي أغلق العقد. 0376 يملؤه ذرياً عند offboarding.';

-- ───────────────────────────────────────────────────────────────────────────
-- ② Outbox هو حدّ الاتساق مع Auth الخارجي؛ الفشل قابل للرؤية وإعادة المحاولة.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_identity_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  job_application_id UUID,
  offboarding_id UUID,
  action TEXT NOT NULL CHECK (action IN ('provision','disable')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  email TEXT,
  auth_user_id UUID,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_identity_jobs_employee_tenant_fkey
    FOREIGN KEY (employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT employee_identity_jobs_application_tenant_fkey
    FOREIGN KEY (job_application_id, tenant_id)
    REFERENCES public.job_applications(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT employee_identity_jobs_offboarding_tenant_fkey
    FOREIGN KEY (offboarding_id, tenant_id)
    REFERENCES public.offboarding_records(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT employee_identity_jobs_shape_chk CHECK (
    (action = 'provision' AND job_application_id IS NOT NULL AND offboarding_id IS NULL)
    OR
    (action = 'disable' AND offboarding_id IS NOT NULL)
  ),
  UNIQUE (tenant_id, employee_id, action)
);

COMMENT ON TABLE public.employee_identity_jobs IS
  'Outbox لدورة Auth. التوظيف يطلب invitation، وإنهاء الخدمة يطلب تعطيل '
  'الحساب. Edge Function تنفذ وتحدّث status؛ فشل Auth لا يضيع حدث DB.';

ALTER TABLE public.employee_identity_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_identity_jobs_select ON public.employee_identity_jobs;
CREATE POLICY employee_identity_jobs_select
  ON public.employee_identity_jobs FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

REVOKE ALL ON public.employee_identity_jobs FROM PUBLIC;
REVOKE ALL ON public.employee_identity_jobs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.employee_identity_jobs FROM authenticated;
GRANT SELECT ON public.employee_identity_jobs TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_employee_identity_jobs_queue
  ON public.employee_identity_jobs (status, requested_at)
  WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_employee_identity_jobs_application
  ON public.employee_identity_jobs (tenant_id, job_application_id);

-- ───────────────────────────────────────────────────────────────────────────
-- ③ التوظيف: trigger ذري بعد application_hire الحالية.
--    ينشئ عقداً draft، outbox دعوة، ومهام التعريف المتاحة.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_recruitment_hire_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posting RECORD;
  v_contract_type TEXT;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF NEW.status <> 'hired' OR NEW.hired_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = NEW.hired_employee_id AND e.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'HIRE_LIFECYCLE_EMPLOYEE_TENANT_MISMATCH';
  END IF;

  SELECT p.title, p.position, p.employment_type
    INTO v_posting
    FROM public.job_postings p
   WHERE p.id = NEW.posting_id AND p.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'HIRE_LIFECYCLE_POSTING_NOT_FOUND'; END IF;

  v_contract_type := CASE v_posting.employment_type
    WHEN 'full_time' THEN 'permanent'
    WHEN 'part_time' THEN 'part_time'
    ELSE 'other'
  END;

  INSERT INTO public.employee_contracts
    (tenant_id, employee_id, contract_type, title, start_date,
     renewal_notice_days, status, job_application_id, notes)
  VALUES
    (NEW.tenant_id, NEW.hired_employee_id, v_contract_type,
     COALESCE(NULLIF(btrim(v_posting.position),''), v_posting.title),
     v_today, 30, 'draft', NEW.id,
     'مسودة أُنشئت تلقائياً من دورة التوظيف 0376')
  ON CONFLICT (tenant_id, job_application_id)
    WHERE job_application_id IS NOT NULL
  DO NOTHING;

  INSERT INTO public.employee_identity_jobs
    (tenant_id, employee_id, job_application_id, action, status,
     email, requested_by)
  VALUES
    (NEW.tenant_id, NEW.hired_employee_id, NEW.id, 'provision', 'pending',
     lower(NULLIF(btrim(NEW.email),'')), auth.uid())
  ON CONFLICT (tenant_id, employee_id, action) DO NOTHING;

  INSERT INTO public.employee_onboarding
    (tenant_id, employee_id, task_id, status)
  SELECT NEW.tenant_id, NEW.hired_employee_id, t.id, 'pending'
    FROM public.onboarding_tasks t
   WHERE t.tenant_id = NEW.tenant_id AND t.is_active
  ON CONFLICT (tenant_id, employee_id, task_id) DO NOTHING;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_recruitment_hire_lifecycle() IS
  '0376: بعد application_hire ينشئ ذرياً عقد draft وطلب دعوة Auth '
  'ومهام التعريف. Auth نفسها تُنفذ خارج DB عبر outbox قابلة لإعادة المحاولة.';

DROP TRIGGER IF EXISTS trg_recruitment_hire_lifecycle
  ON public.job_applications;
CREATE TRIGGER trg_recruitment_hire_lifecycle
  AFTER INSERT OR UPDATE OF status, hired_employee_id
  ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_recruitment_hire_lifecycle();

-- Backfill للتوظيفات السابقة: لا تعديل للموظف أو الطلب.
INSERT INTO public.employee_contracts
  (tenant_id, employee_id, contract_type, title, start_date,
   renewal_notice_days, status, job_application_id, notes)
SELECT a.tenant_id, a.hired_employee_id,
       CASE p.employment_type WHEN 'full_time' THEN 'permanent'
                              WHEN 'part_time' THEN 'part_time' ELSE 'other' END,
       COALESCE(NULLIF(btrim(p.position),''), p.title),
       COALESCE(a.submitted_at::DATE,
                (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE),
       30, 'draft', a.id,
       'مسودة backfill من توظيف سابق — 0376'
  FROM public.job_applications a
  JOIN public.job_postings p ON p.id = a.posting_id AND p.tenant_id = a.tenant_id
  JOIN public.employees e ON e.id = a.hired_employee_id AND e.tenant_id = a.tenant_id
 WHERE a.status = 'hired' AND a.hired_employee_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.employee_contracts c
      WHERE c.tenant_id = a.tenant_id AND c.job_application_id = a.id
   )
ON CONFLICT (tenant_id, job_application_id)
  WHERE job_application_id IS NOT NULL
DO NOTHING;

INSERT INTO public.employee_identity_jobs
  (tenant_id, employee_id, job_application_id, action, status,
   email, auth_user_id, requested_by, completed_at)
SELECT a.tenant_id, a.hired_employee_id, a.id, 'provision',
       CASE WHEN e.user_id IS NULL THEN 'pending' ELSE 'completed' END,
       lower(NULLIF(btrim(a.email),'')), e.user_id, a.reviewed_by,
       CASE WHEN e.user_id IS NULL THEN NULL ELSE NOW() END
  FROM public.job_applications a
  JOIN public.employees e ON e.id = a.hired_employee_id AND e.tenant_id = a.tenant_id
 WHERE a.status = 'hired' AND a.hired_employee_id IS NOT NULL
ON CONFLICT (tenant_id, employee_id, action) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ إنهاء الخدمة: تحقق التاريخ ثم إغلاق العقد وطلب تعطيل Auth ذرياً.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_offboarding_contract_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.employee_contracts c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.employee_id = NEW.employee_id
       AND c.status IN ('draft','active')
       AND c.start_date > NEW.last_working_day
  ) THEN
    RAISE EXCEPTION 'OFFBOARDING_BEFORE_CONTRACT_START'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_offboarding_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_email TEXT;
BEGIN
  UPDATE public.employee_contracts c
     SET status = 'terminated',
         terminated_at = NEW.last_working_day::TIMESTAMPTZ,
         termination_reason = btrim(NEW.reason),
         end_date = NEW.last_working_day,
         offboarding_id = NEW.id,
         updated_at = NOW()
   WHERE c.tenant_id = NEW.tenant_id
     AND c.employee_id = NEW.employee_id
     AND c.status IN ('draft','active');

  SELECT e.user_id, e.email INTO v_user, v_email
    FROM public.employees e
   WHERE e.id = NEW.employee_id AND e.tenant_id = NEW.tenant_id;

  -- لو انتهت الخدمة قبل تنفيذ دعوةٍ معلقة، لا يجوز إنشاء الحساب لاحقاً.
  UPDATE public.employee_identity_jobs j
     SET status = 'cancelled',
         last_error = 'أُلغي provisioning لأن خدمة الموظف انتهت',
         completed_at = NOW(), updated_at = NOW()
   WHERE j.tenant_id = NEW.tenant_id
     AND j.employee_id = NEW.employee_id
     AND j.action = 'provision'
     AND j.status IN ('pending','failed');

  INSERT INTO public.employee_identity_jobs
    (tenant_id, employee_id, offboarding_id, action, status,
     email, auth_user_id, requested_by)
  VALUES
    (NEW.tenant_id, NEW.employee_id, NEW.id, 'disable', 'pending',
     lower(NULLIF(btrim(v_email),'')), v_user, auth.uid())
  ON CONFLICT (tenant_id, employee_id, action) DO UPDATE SET
    offboarding_id = EXCLUDED.offboarding_id,
    status = CASE WHEN employee_identity_jobs.status = 'completed'
                  THEN 'completed' ELSE 'pending' END,
    last_error = NULL,
    updated_at = NOW();

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_offboarding_lifecycle() IS
  '0376: يغلق draft/active contracts ويربطها بـoffboarding، يلغي دعوة '
  'لم تنفذ، ويضيف outbox لتعطيل Auth.';

DROP TRIGGER IF EXISTS trg_offboarding_contract_guard ON public.offboarding_records;
CREATE TRIGGER trg_offboarding_contract_guard
  BEFORE INSERT ON public.offboarding_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_offboarding_contract_guard();

DROP TRIGGER IF EXISTS trg_offboarding_lifecycle ON public.offboarding_records;
CREATE TRIGGER trg_offboarding_lifecycle
  AFTER INSERT ON public.offboarding_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_offboarding_lifecycle();

-- Backfill آمن: نغلق فقط إذا كان آخر يوم لا يسبق بداية العقد.
UPDATE public.employee_contracts c
   SET status = 'terminated',
       terminated_at = o.last_working_day::TIMESTAMPTZ,
       termination_reason = btrim(o.reason),
       end_date = o.last_working_day,
       offboarding_id = o.id,
       updated_at = NOW()
  FROM public.offboarding_records o
 WHERE o.tenant_id = c.tenant_id
   AND o.employee_id = c.employee_id
   AND c.status IN ('draft','active')
   AND c.start_date <= o.last_working_day;

INSERT INTO public.employee_identity_jobs
  (tenant_id, employee_id, offboarding_id, action, status,
   email, auth_user_id, requested_by, completed_at)
SELECT o.tenant_id, o.employee_id, o.id, 'disable',
       CASE WHEN e.user_id IS NULL THEN 'completed' ELSE 'pending' END,
       lower(NULLIF(btrim(e.email),'')), e.user_id, o.conducted_by,
       CASE WHEN e.user_id IS NULL THEN NOW() ELSE NULL END
  FROM public.offboarding_records o
  JOIN public.employees e ON e.id = o.employee_id AND e.tenant_id = o.tenant_id
ON CONFLICT (tenant_id, employee_id, action) DO NOTHING;

UPDATE public.employee_identity_jobs j
   SET status = 'cancelled',
       last_error = 'أُلغي provisioning: الموظف غير نشط',
       completed_at = NOW(), updated_at = NOW()
  FROM public.employees e
 WHERE e.id = j.employee_id AND e.tenant_id = j.tenant_id
   AND NOT e.is_active
   AND j.action = 'provision'
   AND j.status IN ('pending','failed');

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ قراءة حالة الـoutbox عبر SDK؛ لا كتابة من المتصفح.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.employee_identity_job_for_employee(UUID, TEXT);
CREATE FUNCTION public.employee_identity_job_for_employee(
  p_employee UUID,
  p_action TEXT DEFAULT NULL
)
RETURNS TABLE(
  out_id UUID,
  out_action TEXT,
  out_status TEXT,
  out_auth_user_id UUID,
  out_attempt_count INTEGER,
  out_last_error TEXT,
  out_updated_at TIMESTAMPTZ,
  out_contract_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'IDENTITY_JOB_NOT_AUTHORIZED'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action IS NOT NULL AND p_action NOT IN ('provision','disable') THEN
    RAISE EXCEPTION 'IDENTITY_JOB_BAD_ACTION';
  END IF;

  RETURN QUERY
  SELECT j.id, j.action, j.status, j.auth_user_id,
         j.attempt_count, j.last_error, j.updated_at,
         (SELECT c.id FROM public.employee_contracts c
           WHERE c.tenant_id = j.tenant_id
             AND c.job_application_id = j.job_application_id
           LIMIT 1)
    FROM public.employee_identity_jobs j
   WHERE j.tenant_id = v_tenant
     AND j.employee_id = p_employee
     AND (p_action IS NULL OR j.action = p_action)
   ORDER BY j.requested_at DESC
   LIMIT 1;
END $$;

REVOKE ALL ON FUNCTION public.employee_identity_job_for_employee(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_identity_job_for_employee(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.employee_identity_job_for_employee(UUID,TEXT)
  TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ توسيع قائمة المتقدمين بحالة الدعوة والعقد، مع إبقاء تنفيذ 0362 داخلياً.
-- ───────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.recruitment_applications(UUID, TEXT)
  RENAME TO recruitment_applications_pre_0376;
REVOKE ALL ON FUNCTION public.recruitment_applications_pre_0376(UUID,TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.recruitment_applications(
  p_posting UUID,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE(
  out_id UUID,
  out_posting_id UUID,
  out_name TEXT,
  out_email TEXT,
  out_phone TEXT,
  out_resume_url TEXT,
  out_cover_letter TEXT,
  out_status TEXT,
  out_rating INTEGER,
  out_notes TEXT,
  out_rejection_reason TEXT,
  out_reviewer_name TEXT,
  out_reviewed_at TIMESTAMPTZ,
  out_hired_employee_id UUID,
  out_submitted_at TIMESTAMPTZ,
  out_identity_task_id UUID,
  out_identity_status TEXT,
  out_identity_error TEXT,
  out_contract_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.out_id, q.out_posting_id, q.out_name, q.out_email,
         q.out_phone, q.out_resume_url, q.out_cover_letter, q.out_status,
         q.out_rating, q.out_notes, q.out_rejection_reason,
         q.out_reviewer_name, q.out_reviewed_at, q.out_hired_employee_id,
         q.out_submitted_at, j.id, j.status, j.last_error, c.id
    FROM public.recruitment_applications_pre_0376(p_posting, p_status) q
    LEFT JOIN public.employee_identity_jobs j
      ON j.tenant_id = public.current_user_tenant_id()
     AND j.job_application_id = q.out_id
     AND j.action = 'provision'
    LEFT JOIN public.employee_contracts c
      ON c.tenant_id = public.current_user_tenant_id()
     AND c.job_application_id = q.out_id
   ORDER BY CASE q.out_status
              WHEN 'hired' THEN 1 WHEN 'offer' THEN 2 WHEN 'test' THEN 3
              WHEN 'interview' THEN 4 WHEN 'screening' THEN 5
              WHEN 'applied' THEN 6 WHEN 'rejected' THEN 7 ELSE 8 END,
            q.out_submitted_at DESC, q.out_id DESC;
$$;

COMMENT ON FUNCTION public.recruitment_applications(UUID,TEXT) IS
  '0376: قائمة 0362 مع حالة دعوة Auth ومعرّف العقد الناتج عن التوظيف.';
REVOKE ALL ON FUNCTION public.recruitment_applications(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recruitment_applications(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.recruitment_applications(UUID,TEXT)
  TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑦ توسيع لوحة إنهاء الخدمة بحالة تعطيل Auth والعقود المغلقة.
-- ───────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.offboarding_board(TEXT, TEXT, INTEGER)
  RENAME TO offboarding_board_pre_0376;
REVOKE ALL ON FUNCTION public.offboarding_board_pre_0376(TEXT,TEXT,INTEGER)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.offboarding_board(
  p_exit_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE(
  out_id UUID,
  out_employee_id UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department TEXT,
  out_last_day DATE,
  out_reason TEXT,
  out_exit_type TEXT,
  out_notes TEXT,
  out_access_revoked BOOLEAN,
  out_settlement BOOLEAN,
  out_assets TEXT[],
  out_conducted_by UUID,
  out_conductor TEXT,
  out_still_active BOOLEAN,
  out_created_at TIMESTAMPTZ,
  out_identity_task_id UUID,
  out_identity_status TEXT,
  out_identity_error TEXT,
  out_closed_contracts INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.out_id, q.out_employee_id, q.out_employee_name,
         q.out_employee_code, q.out_department, q.out_last_day,
         q.out_reason, q.out_exit_type, q.out_notes,
         q.out_access_revoked, q.out_settlement, q.out_assets,
         q.out_conducted_by, q.out_conductor, q.out_still_active,
         q.out_created_at, j.id, j.status, j.last_error,
         (SELECT count(*)::INTEGER FROM public.employee_contracts c
           WHERE c.tenant_id = public.current_user_tenant_id()
             AND c.offboarding_id = q.out_id)
    FROM public.offboarding_board_pre_0376(p_exit_type, p_search, p_limit) q
    LEFT JOIN public.employee_identity_jobs j
      ON j.tenant_id = public.current_user_tenant_id()
     AND j.offboarding_id = q.out_id
     AND j.action = 'disable'
   ORDER BY q.out_last_day DESC, q.out_created_at DESC;
$$;

COMMENT ON FUNCTION public.offboarding_board(TEXT,TEXT,INTEGER) IS
  '0376: لوحة 0359 مع حالة تعطيل Auth وعدد العقود التي أغلقها offboarding.';
REVOKE ALL ON FUNCTION public.offboarding_board(TEXT,TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offboarding_board(TEXT,TEXT,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.offboarding_board(TEXT,TEXT,INTEGER)
  TO authenticated;
