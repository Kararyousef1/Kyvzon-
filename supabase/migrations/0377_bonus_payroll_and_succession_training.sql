-- ═══════════════════════════════════════════════════════════════════════════
-- 0377 — تكاملات المرحلة الخامسة ذات الأولوية العالية
--   A) Bonus → Payroll → Paid
--   B) Succession development plan → Course assignment → Completion
-- تراكمية فقط؛ لا تعديل لمايجريشنات مطبقة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- A. المكافآت والرواتب
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_periods_id_tenant_0377
  ON public.payroll_periods (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_records_id_tenant_0377
  ON public.payroll_records (id, tenant_id);

ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.bonuses
  ADD COLUMN IF NOT EXISTS payroll_period_id UUID,
  ADD COLUMN IF NOT EXISTS payroll_record_id UUID,
  ADD COLUMN IF NOT EXISTS payroll_included_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bonuses_payroll_period_tenant_fkey') THEN
    ALTER TABLE public.bonuses
      ADD CONSTRAINT bonuses_payroll_period_tenant_fkey
      FOREIGN KEY (payroll_period_id, tenant_id)
      REFERENCES public.payroll_periods(id, tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bonuses_payroll_record_tenant_fkey') THEN
    ALTER TABLE public.bonuses
      ADD CONSTRAINT bonuses_payroll_record_tenant_fkey
      FOREIGN KEY (payroll_record_id, tenant_id)
      REFERENCES public.payroll_records(id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bonuses_payroll_period
  ON public.bonuses (tenant_id, payroll_period_id)
  WHERE payroll_period_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_guard_bonus_payroll_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync BOOLEAN := COALESCE(
    current_setting('kyvzon.payroll_bonus_sync', TRUE), 'false'
  ) = 'true';
BEGIN
  IF v_sync THEN RETURN NEW; END IF;

  -- المكافأة المدفوعة لا تُعلن يدوياً؛ مصدر الحقيقة هو صرف فترة الرواتب.
  IF OLD.status = 'approved' AND NEW.status = 'paid' THEN
    RAISE EXCEPTION 'BONUS_USE_PAYROLL_PAYMENT: صرف المكافأة يتم من فترة الرواتب'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.payroll_period_id IS NOT NULL THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.bonus_date IS DISTINCT FROM OLD.bonus_date
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.payroll_period_id IS DISTINCT FROM OLD.payroll_period_id
       OR NEW.payroll_record_id IS DISTINCT FROM OLD.payroll_record_id THEN
      RAISE EXCEPTION 'BONUS_LOCKED_IN_PAYROLL: المكافأة مرتبطة بفترة رواتب'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_bonus_payroll_link ON public.bonuses;
CREATE TRIGGER trg_guard_bonus_payroll_link
  BEFORE UPDATE ON public.bonuses
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_bonus_payroll_link();

-- نحافظ على حساب 0348 واختباراته داخلياً، ثم نضيف claim وربط المكافآت.
ALTER FUNCTION public.payroll_run(UUID) RENAME TO payroll_run_pre_0377;
REVOKE ALL ON FUNCTION public.payroll_run_pre_0377(UUID)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.payroll_run(p_period_id UUID)
RETURNS TABLE(
  out_employees INTEGER,
  out_gross NUMERIC,
  out_deductions NUMERIC,
  out_net NUMERIC
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_start DATE;
  v_end DATE;
BEGIN
  -- الدالة السابقة تحرس الدور والمستأجر وحالة الفترة وتحسب الحضور/القروض.
  PERFORM * FROM public.payroll_run_pre_0377(p_period_id);

  SELECT p.start_date, p.end_date INTO v_start, v_end
    FROM public.payroll_periods p
   WHERE p.id = p_period_id AND p.tenant_id = v_tenant;

  PERFORM set_config('kyvzon.payroll_bonus_sync', 'true', TRUE);

  -- Claim حتمي: مكافأة approved وغير مؤرشفة، تتقاطع فترتها مع فترة الراتب،
  -- ولم تُربط بفترة أخرى. إعادة التشغيل لن تضاعفها.
  UPDATE public.bonuses b
     SET payroll_period_id = p_period_id,
         payroll_record_id = r.id,
         payroll_included_at = COALESCE(b.payroll_included_at, NOW()),
         updated_at = NOW()
    FROM public.payroll_records r
   WHERE r.tenant_id = v_tenant
     AND r.period_id = p_period_id
     AND r.employee_id = b.employee_id
     AND b.tenant_id = v_tenant
     AND b.status = 'approved'
     AND b.archived_at IS NULL
     AND (b.payroll_period_id IS NULL OR b.payroll_period_id = p_period_id)
     AND COALESCE(b.period_start, b.bonus_date) <= v_end
     AND COALESCE(b.period_end, b.period_start, b.bonus_date) >= v_start;

  -- المصدر الوحيد لـpayroll_records.bonus_amount هو مجموع الروابط الفعلية.
  UPDATE public.payroll_records r
     SET bonus_amount = x.amount,
         net_salary = round(
           r.basic_salary + r.total_allowances + r.overtime_pay
           + x.amount - r.total_deductions, 2
         ),
         updated_at = NOW()
    FROM (
      SELECT pr.id AS record_id, COALESCE(sum(b.amount), 0)::NUMERIC AS amount
        FROM public.payroll_records pr
        LEFT JOIN public.bonuses b
          ON b.payroll_record_id = pr.id
         AND b.payroll_period_id = p_period_id
         AND b.status = 'approved'
         AND b.archived_at IS NULL
       WHERE pr.tenant_id = v_tenant AND pr.period_id = p_period_id
       GROUP BY pr.id
    ) x
   WHERE r.id = x.record_id;

  RETURN QUERY
  SELECT count(*)::INTEGER,
         COALESCE(round(sum(r.basic_salary + r.total_allowances
                            + r.overtime_pay + r.bonus_amount), 2), 0),
         COALESCE(round(sum(r.total_deductions), 2), 0),
         COALESCE(round(sum(r.net_salary), 2), 0)
    FROM public.payroll_records r
   WHERE r.tenant_id = v_tenant AND r.period_id = p_period_id;
END $$;

COMMENT ON FUNCTION public.payroll_run(UUID) IS
  '0377: حساب 0348 مع claim ذرّي للمكافآت approved المتقاطعة مع الفترة، '
  'وربطها بالسجل وتضمينها مرة واحدة في bonus_amount/net_salary.';
REVOKE ALL ON FUNCTION public.payroll_run(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_run(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.payroll_run(UUID) TO authenticated;

-- الصرف النهائي يغلق السجلات والمكافآت معاً.
DROP FUNCTION IF EXISTS public.payroll_mark_paid(UUID);
CREATE FUNCTION public.payroll_mark_paid(p_period_id UUID)
RETURNS TABLE(
  out_records INTEGER,
  out_bonuses INTEGER,
  out_bonus_amount NUMERIC
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role TEXT := public.current_user_role();
  v_status TEXT;
  v_records INTEGER := 0;
  v_bonuses INTEGER := 0;
  v_amount NUMERIC := 0;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN RAISE EXCEPTION 'PAYROLL_NO_CONTEXT'; END IF;
  IF v_role NOT IN ('admin','hr') THEN RAISE EXCEPTION 'PAYROLL_PAYMENT_NOT_AUTHORIZED'; END IF;

  SELECT p.status INTO v_status FROM public.payroll_periods p
   WHERE p.id = p_period_id AND p.tenant_id = v_tenant FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'PAYROLL_PERIOD_NOT_FOUND'; END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'PAYROLL_PAYMENT_REQUIRES_APPROVED: %', v_status;
  END IF;

  PERFORM set_config('kyvzon.payroll_bonus_sync', 'true', TRUE);

  UPDATE public.payroll_records
     SET status = 'paid', paid_at = NOW(), updated_at = NOW()
   WHERE tenant_id = v_tenant AND period_id = p_period_id
     AND status = 'approved';
  GET DIAGNOSTICS v_records = ROW_COUNT;

  SELECT count(*)::INTEGER, COALESCE(sum(b.amount), 0)
    INTO v_bonuses, v_amount
    FROM public.bonuses b
   WHERE b.tenant_id = v_tenant
     AND b.payroll_period_id = p_period_id
     AND b.status = 'approved';

  UPDATE public.bonuses
     SET status = 'paid', decided_at = NOW(), updated_at = NOW()
   WHERE tenant_id = v_tenant
     AND payroll_period_id = p_period_id
     AND status = 'approved';

  UPDATE public.payroll_periods
     SET status = 'paid', paid_by = auth.uid(), paid_at = NOW(), updated_at = NOW()
   WHERE id = p_period_id AND tenant_id = v_tenant;

  RETURN QUERY SELECT v_records, v_bonuses, round(v_amount, 2);
END $$;

COMMENT ON FUNCTION public.payroll_mark_paid(UUID) IS
  'يصرف فترة approved ويحوّل سجلاتها ومكافآتها المرتبطة إلى paid ذرياً.';
REVOKE ALL ON FUNCTION public.payroll_mark_paid(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_mark_paid(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.payroll_mark_paid(UUID) TO authenticated;

-- إظهار رابط الراتب في لوحة المكافآت.
ALTER FUNCTION public.bonus_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER)
  RENAME TO bonus_board_pre_0377;
REVOKE ALL ON FUNCTION public.bonus_board_pre_0377(TEXT,TEXT,TEXT,BOOLEAN,INTEGER)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.bonus_board(
  p_status TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_include_archived BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE(
  out_id UUID, out_employee_id UUID, out_employee_name TEXT,
  out_employee_code TEXT, out_department TEXT, out_type TEXT,
  out_amount NUMERIC, out_currency TEXT, out_reason TEXT, out_status TEXT,
  out_period_start DATE, out_period_end DATE, out_bonus_date DATE,
  out_approved_by UUID, out_approver_name TEXT, out_decided_at TIMESTAMPTZ,
  out_decision_note TEXT, out_archived BOOLEAN, out_created_at TIMESTAMPTZ,
  out_payroll_period_id UUID, out_payroll_period_name TEXT,
  out_payroll_period_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.*, b.payroll_period_id, p.name::TEXT, p.status::TEXT
    FROM public.bonus_board_pre_0377(
      p_status, p_type, p_search, p_include_archived, p_limit
    ) q
    JOIN public.bonuses b
      ON b.id = q.out_id AND b.tenant_id = public.current_user_tenant_id()
    LEFT JOIN public.payroll_periods p
      ON p.id = b.payroll_period_id AND p.tenant_id = b.tenant_id
   ORDER BY q.out_created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.bonus_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bonus_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.bonus_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. خطط التعاقب والتدريب
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uq_succession_candidates_id_tenant_0377
  ON public.succession_candidates (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_id_tenant_0377
  ON public.courses (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_progress_id_tenant_0377
  ON public.course_progress (id, tenant_id);

ALTER TABLE public.succession_development_plans
  ADD COLUMN IF NOT EXISTS course_id UUID,
  ADD COLUMN IF NOT EXISTS course_progress_id UUID,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- الخطط القديمة من نوع training بلا دورة لا تصبح تكليفاً وهمياً.
UPDATE public.succession_development_plans
   SET action_type = 'other',
       description = concat_ws(E'\n', description,
         '0377: حُوّل النوع من training لعدم وجود course_id تاريخياً')
 WHERE action_type IN ('training','certification') AND course_id IS NULL;

-- فصل أي رابط تاريخي عابر للمستأجر قبل القيود.
UPDATE public.succession_development_plans p SET course_id = NULL
 WHERE p.course_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.courses c
                    WHERE c.id = p.course_id AND c.tenant_id = p.tenant_id);
UPDATE public.succession_development_plans p SET course_progress_id = NULL
 WHERE p.course_progress_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.course_progress cp
                    WHERE cp.id = p.course_progress_id AND cp.tenant_id = p.tenant_id);

ALTER TABLE public.succession_development_plans
  DROP CONSTRAINT IF EXISTS succession_development_plans_candidate_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='succession_plans_candidate_tenant_fkey') THEN
    ALTER TABLE public.succession_development_plans
      ADD CONSTRAINT succession_plans_candidate_tenant_fkey
      FOREIGN KEY (candidate_id, tenant_id)
      REFERENCES public.succession_candidates(id, tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='succession_plans_course_tenant_fkey') THEN
    ALTER TABLE public.succession_development_plans
      ADD CONSTRAINT succession_plans_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id)
      REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='succession_plans_progress_tenant_fkey') THEN
    ALTER TABLE public.succession_development_plans
      ADD CONSTRAINT succession_plans_progress_tenant_fkey
      FOREIGN KEY (course_progress_id, tenant_id)
      REFERENCES public.course_progress(id, tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='succession_plans_training_shape_chk') THEN
    ALTER TABLE public.succession_development_plans
      ADD CONSTRAINT succession_plans_training_shape_chk CHECK (
        action_type NOT IN ('training','certification') OR course_id IS NOT NULL
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_succession_plan_candidate_course
  ON public.succession_development_plans (tenant_id, candidate_id, course_id)
  WHERE course_id IS NOT NULL AND status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.tg_block_succession_plan_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SUCCESSION_PLAN_DELETE_BLOCKED: ألغِ الخطة ولا تحذفها';
END $$;
DROP TRIGGER IF EXISTS trg_block_succession_plan_delete
  ON public.succession_development_plans;
CREATE TRIGGER trg_block_succession_plan_delete
  BEFORE DELETE ON public.succession_development_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_succession_plan_delete();

-- إنشاء الخطة وتكليف الدورة للمرشّح في معاملة واحدة.
DROP FUNCTION IF EXISTS public.succession_plan_create(UUID,TEXT,TEXT,TEXT,DATE,UUID);
CREATE FUNCTION public.succession_plan_create(
  p_candidate UUID,
  p_action TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_target DATE DEFAULT NULL,
  p_course UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_employee UUID;
  v_progress UUID;
  v_plan UUID;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_NOT_AUTHORIZED';
  END IF;
  IF p_action NOT IN ('training','mentoring','assignment','certification','other') THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_BAD_ACTION';
  END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN RAISE EXCEPTION 'SUCCESSION_PLAN_TITLE_REQUIRED'; END IF;
  IF p_action IN ('training','certification') AND p_course IS NULL THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_COURSE_REQUIRED';
  END IF;

  SELECT c.employee_id INTO v_employee
    FROM public.succession_candidates c
   WHERE c.id = p_candidate AND c.tenant_id = v_tenant AND c.status = 'active';
  IF v_employee IS NULL THEN RAISE EXCEPTION 'SUCCESSION_ACTIVE_CANDIDATE_NOT_FOUND'; END IF;

  IF p_course IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.courses c
                    WHERE c.id=p_course AND c.tenant_id=v_tenant AND c.status='active') THEN
      RAISE EXCEPTION 'SUCCESSION_ACTIVE_COURSE_NOT_FOUND';
    END IF;
    INSERT INTO public.course_progress
      (tenant_id, course_id, employee_id, progress, completed, approved, last_access_at)
    VALUES (v_tenant, p_course, v_employee, 0, FALSE, TRUE, NULL)
    ON CONFLICT (employee_id, course_id) DO UPDATE
      SET approved = TRUE, updated_at = NOW()
    RETURNING id INTO v_progress;
  END IF;

  INSERT INTO public.succession_development_plans
    (tenant_id,candidate_id,action_type,title,description,target_date,status,
     course_id,course_progress_id,created_by)
  VALUES
    (v_tenant,p_candidate,p_action,btrim(p_title),NULLIF(btrim(COALESCE(p_description,'')),''),
     p_target,'planned',p_course,v_progress,auth.uid())
  RETURNING id INTO v_plan;
  RETURN v_plan;
END $$;
REVOKE ALL ON FUNCTION public.succession_plan_create(UUID,TEXT,TEXT,TEXT,DATE,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_plan_create(UUID,TEXT,TEXT,TEXT,DATE,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_plan_create(UUID,TEXT,TEXT,TEXT,DATE,UUID)
  TO authenticated;

DROP FUNCTION IF EXISTS public.succession_plan_set_status(UUID,TEXT,TEXT);
CREATE FUNCTION public.succession_plan_set_status(
  p_plan UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old TEXT;
  v_progress UUID;
  v_completed BOOLEAN;
BEGIN
  IF v_tenant IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_NOT_AUTHORIZED';
  END IF;
  IF p_status NOT IN ('in_progress','completed','cancelled') THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_BAD_STATUS';
  END IF;
  IF p_status='cancelled' AND btrim(COALESCE(p_reason,''))='' THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_CANCEL_REASON_REQUIRED';
  END IF;

  SELECT p.status, p.course_progress_id INTO v_old, v_progress
    FROM public.succession_development_plans p
   WHERE p.id=p_plan AND p.tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'SUCCESSION_PLAN_NOT_FOUND'; END IF;
  IF v_old IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_FINAL: %', v_old;
  END IF;

  IF p_status='completed' AND v_progress IS NOT NULL THEN
    SELECT cp.completed INTO v_completed FROM public.course_progress cp
     WHERE cp.id=v_progress AND cp.tenant_id=v_tenant;
    IF NOT COALESCE(v_completed,FALSE) THEN
      RAISE EXCEPTION 'SUCCESSION_TRAINING_NOT_COMPLETED';
    END IF;
  END IF;

  UPDATE public.succession_development_plans
     SET status=p_status,
         started_at=CASE WHEN p_status='in_progress' THEN COALESCE(started_at,NOW()) ELSE started_at END,
         completed_at=CASE WHEN p_status='completed' THEN NOW() ELSE completed_at END,
         cancelled_reason=CASE WHEN p_status='cancelled' THEN btrim(p_reason) ELSE cancelled_reason END,
         updated_at=NOW()
   WHERE id=p_plan AND tenant_id=v_tenant;
  RETURN p_status;
END $$;
REVOKE ALL ON FUNCTION public.succession_plan_set_status(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_plan_set_status(UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_plan_set_status(UUID,TEXT,TEXT) TO authenticated;

-- completed في القاعدة يعني 100% دائماً؛ يمنع حالة «مكتملة 1%» بعد الاختبار.
UPDATE public.course_progress
   SET progress=100,completed_at=COALESCE(completed_at,updated_at,created_at,NOW()),updated_at=NOW()
 WHERE completed AND progress<100;

CREATE OR REPLACE FUNCTION public.tg_normalize_completed_course_progress()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.completed THEN
    NEW.progress:=100;
    NEW.completed_at:=COALESCE(NEW.completed_at,NOW());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_completed_course_progress ON public.course_progress;
CREATE TRIGGER trg_normalize_completed_course_progress
  BEFORE INSERT OR UPDATE OF completed,progress ON public.course_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_completed_course_progress();

-- إتمام الدورة يغلق الخطة تلقائياً؛ بدء التقدم يحولها إلى in_progress.
CREATE OR REPLACE FUNCTION public.tg_sync_succession_plan_from_training()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.succession_development_plans p
     SET status = CASE WHEN NEW.completed THEN 'completed' ELSE 'in_progress' END,
         started_at = COALESCE(p.started_at, NEW.started_at, NOW()),
         completed_at = CASE WHEN NEW.completed THEN COALESCE(p.completed_at,NEW.completed_at,NOW())
                             ELSE p.completed_at END,
         updated_at = NOW()
   WHERE p.tenant_id=NEW.tenant_id
     AND p.course_progress_id=NEW.id
     AND p.status IN ('planned','in_progress')
     AND (NEW.completed OR NEW.progress > 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_succession_plan_from_training ON public.course_progress;
CREATE TRIGGER trg_sync_succession_plan_from_training
  AFTER INSERT OR UPDATE OF progress, completed, completed_at
  ON public.course_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_succession_plan_from_training();

DROP FUNCTION IF EXISTS public.succession_plan_board(UUID);
CREATE FUNCTION public.succession_plan_board(p_candidate UUID DEFAULT NULL)
RETURNS TABLE(
  out_id UUID, out_candidate_id UUID, out_employee_name TEXT,
  out_action TEXT, out_title TEXT, out_description TEXT, out_target_date DATE,
  out_status TEXT, out_course_id UUID, out_course_title TEXT,
  out_progress NUMERIC, out_course_completed BOOLEAN,
  out_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_PLAN_NOT_AUTHORIZED';
  END IF;
  RETURN QUERY
  SELECT p.id,p.candidate_id,
         COALESCE(NULLIF(btrim(e.full_name_ar),''),
                  NULLIF(btrim(concat_ws(' ',e.first_name,NULLIF(e.last_name,'—'))),''),
                  'موظف '||e.employee_code)::TEXT,
         p.action_type::TEXT,p.title::TEXT,p.description,p.target_date,p.status::TEXT,
         p.course_id,c.title::TEXT,cp.progress,COALESCE(cp.completed,FALSE),p.created_at
    FROM public.succession_development_plans p
    JOIN public.succession_candidates sc
      ON sc.id=p.candidate_id AND sc.tenant_id=p.tenant_id
    JOIN public.employees e ON e.id=sc.employee_id AND e.tenant_id=sc.tenant_id
    LEFT JOIN public.courses c ON c.id=p.course_id AND c.tenant_id=p.tenant_id
    LEFT JOIN public.course_progress cp ON cp.id=p.course_progress_id AND cp.tenant_id=p.tenant_id
   WHERE p.tenant_id=v_tenant AND (p_candidate IS NULL OR p.candidate_id=p_candidate)
   ORDER BY CASE p.status WHEN 'in_progress' THEN 1 WHEN 'planned' THEN 2
                          WHEN 'completed' THEN 3 ELSE 4 END,
            p.target_date NULLS LAST,p.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.succession_plan_board(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_plan_board(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_plan_board(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.succession_training_courses();
CREATE FUNCTION public.succession_training_courses()
RETURNS TABLE(out_id UUID,out_title TEXT,out_level TEXT,out_mandatory BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id,c.title::TEXT,c.level::TEXT,c.mandatory
    FROM public.courses c
   WHERE c.tenant_id=public.current_user_tenant_id()
     AND c.status='active' AND public.current_user_is_staff()
   ORDER BY c.title,c.id;
$$;
REVOKE ALL ON FUNCTION public.succession_training_courses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_training_courses() FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_training_courses() TO authenticated;

-- 0377: مشغل المحتوى يكتب الوقت والتقدم؛ 100% تكمل الدورة إذا لم يوجد اختبار نشط.
CREATE OR REPLACE FUNCTION public.training_progress_touch(
  p_course_id UUID,
  p_seconds INTEGER DEFAULT 0,
  p_progress NUMERIC DEFAULT NULL
)
RETURNS TABLE(out_progress NUMERIC,out_time_spent INTEGER,out_completed BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_emp UUID:=public.current_user_employee_id();
  v_complete BOOLEAN:=FALSE;
BEGIN
  IF v_tenant IS NULL OR v_emp IS NULL THEN RAISE EXCEPTION 'TRAINING_NO_CONTEXT'; END IF;
  IF p_seconds IS NULL OR p_seconds<0 OR p_seconds>3600 THEN
    RAISE EXCEPTION 'TRAINING_TOUCH_SECONDS_INVALID';
  END IF;
  IF p_progress IS NOT NULL AND (p_progress<0 OR p_progress>100) THEN
    RAISE EXCEPTION 'TRAINING_PROGRESS_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.courses c
                  WHERE c.id=p_course_id AND c.tenant_id=v_tenant AND c.status='active') THEN
    RAISE EXCEPTION 'TRAINING_ACTIVE_COURSE_NOT_FOUND';
  END IF;

  v_complete := COALESCE(p_progress,0)>=100 AND NOT EXISTS (
    SELECT 1 FROM public.quizzes q
     WHERE q.tenant_id=v_tenant AND q.course_id=p_course_id AND q.is_active
  );

  INSERT INTO public.course_progress AS cp
    (tenant_id,course_id,employee_id,progress,time_spent,last_access_at,
     completed,completed_at)
  VALUES
    (v_tenant,p_course_id,v_emp,COALESCE(p_progress,0),p_seconds,NOW(),
     v_complete,CASE WHEN v_complete THEN NOW() ELSE NULL END)
  ON CONFLICT (employee_id,course_id) DO UPDATE SET
    time_spent=cp.time_spent+EXCLUDED.time_spent,
    progress=GREATEST(cp.progress,COALESCE(p_progress,cp.progress)),
    completed=cp.completed OR v_complete,
    completed_at=CASE WHEN cp.completed_at IS NULL AND v_complete THEN NOW()
                      ELSE cp.completed_at END,
    last_access_at=NOW(),updated_at=NOW();

  RETURN QUERY SELECT cp.progress,cp.time_spent,cp.completed
    FROM public.course_progress cp
   WHERE cp.tenant_id=v_tenant AND cp.employee_id=v_emp AND cp.course_id=p_course_id;
END $$;
REVOKE ALL ON FUNCTION public.training_progress_touch(UUID,INTEGER,NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.training_progress_touch(UUID,INTEGER,NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.training_progress_touch(UUID,INTEGER,NUMERIC)
  TO authenticated;
