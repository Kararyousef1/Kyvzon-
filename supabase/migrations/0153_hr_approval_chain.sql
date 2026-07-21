-- ============================================================================
-- Kyvzon — 0153_hr_approval_chain.sql
-- سلسلة موافقات HR تسلسلية للإجازات والأذونات الزمنية.
--
-- التصميم (وفق المعايير العالمية):
--   طلب الموظف يمرّ بمراحل بالترتيب:
--     1) مشرف قسمه   (departments.supervisor_id)
--     2) مدير قسمه   (manager_id — مع الوراثة من القسم الأب)
--     3) المدير المباشر (direct_manager_id — مع الوراثة من القسم الأب)
--   - الموافقة تسلسلية: لا تبدأ مرحلة حتى تُعتمد السابقة.
--   - الرفض في أي مرحلة يوقف السلسلة ويرفض الطلب.
--   - المراحل الفارغة (لا مُعيَّن) تُتخطّى تلقائياً.
--
-- الجداول:
--   hr_approval_requests : رأس الطلب (نوع + مرجع + حالة + المرحلة الحالية).
--   hr_approval_steps    : مراحل الطلب (ترتيب + الدور + المعتمِد + الحالة).
--
-- الدوال (SECURITY DEFINER):
--   resolve_department_chain(dept_id) : يرجع (supervisor, manager, direct_manager)
--                                       مع الوراثة — مطابق لمنطق الواجهة.
--   create_hr_approval(...)           : ينشئ الطلب + مراحله ويحدّد أول مرحلة نشطة.
--   decide_hr_approval_step(...)      : اعتماد/رفض المرحلة وتحريك السلسلة.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ─── (1) الجداول ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('leave', 'permission')),
  related_id UUID NOT NULL,                 -- id في leaves أو permissions_request
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_appr_req_tenant ON public.hr_approval_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_appr_req_related ON public.hr_approval_requests(related_id);

CREATE TABLE IF NOT EXISTS public.hr_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.hr_approval_requests(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  approver_role TEXT NOT NULL CHECK (approver_role IN ('supervisor', 'manager', 'direct_manager')),
  approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'approved', 'rejected', 'skipped')),
  comments TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_hr_appr_step_approver ON public.hr_approval_steps(tenant_id, approver_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_appr_step_req ON public.hr_approval_steps(request_id, step_order);

-- ─── (2) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_approval_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_appr_req_select ON public.hr_approval_requests;
CREATE POLICY hr_appr_req_select ON public.hr_approval_requests
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS hr_appr_req_write ON public.hr_approval_requests;
CREATE POLICY hr_appr_req_write ON public.hr_approval_requests
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS hr_appr_step_select ON public.hr_approval_steps;
CREATE POLICY hr_appr_step_select ON public.hr_approval_steps
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS hr_appr_step_write ON public.hr_approval_steps;
CREATE POLICY hr_appr_step_write ON public.hr_approval_steps
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- ─── (3) حلّ سلسلة القسم مع الوراثة ───────────────────────────────────────────
-- يرجع المشرف (خاص بالقسم) والمدير/المدير المباشر (موروثان من الأب إن فارغين).
CREATE OR REPLACE FUNCTION public.resolve_department_chain(p_department_id UUID)
RETURNS TABLE (supervisor_id UUID, manager_id UUID, direct_manager_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_node UUID := p_department_id;
  v_sup UUID;
  v_mgr UUID;
  v_dm UUID;
  v_row RECORD;
  v_depth INT := 0;
BEGIN
  -- المشرف من القسم نفسه فقط
  SELECT d.supervisor_id INTO v_sup FROM public.departments d WHERE d.id = p_department_id;

  -- المدير والمدير المباشر: صعود في السلسلة حتى إيجاد أول قيمة
  WHILE v_node IS NOT NULL AND v_depth < 20 AND (v_mgr IS NULL OR v_dm IS NULL) LOOP
    SELECT d.manager_id, d.direct_manager_id, d.parent_department_id
      INTO v_row
      FROM public.departments d WHERE d.id = v_node;
    IF NOT FOUND THEN EXIT; END IF;
    IF v_mgr IS NULL THEN v_mgr := v_row.manager_id; END IF;
    IF v_dm IS NULL THEN v_dm := v_row.direct_manager_id; END IF;
    v_node := v_row.parent_department_id;
    v_depth := v_depth + 1;
  END LOOP;

  supervisor_id := v_sup;
  manager_id := v_mgr;
  direct_manager_id := v_dm;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_department_chain(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_department_chain(UUID) TO authenticated;

-- ─── (4) إنشاء طلب موافقة + مراحله ────────────────────────────────────────────
-- يبني المراحل بالترتيب متخطّياً الفارغة، ويضبط أول مرحلة كـ active.
-- إن لم توجد أي مرحلة (لا معتمِدين) → يُعتمد الطلب تلقائياً.
CREATE OR REPLACE FUNCTION public.create_hr_approval(
  p_request_type TEXT,
  p_related_id UUID,
  p_employee_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_dept UUID;
  v_chain RECORD;
  v_req_id UUID;
  v_order INT := 0;
  v_first_active INT := NULL;
  v_approvers UUID[];
  v_roles TEXT[];
  i INT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant context'; END IF;

  SELECT department_id INTO v_dept FROM public.employees WHERE id = p_employee_id;
  SELECT * INTO v_chain FROM public.resolve_department_chain(v_dept);

  v_approvers := ARRAY[v_chain.supervisor_id, v_chain.manager_id, v_chain.direct_manager_id];
  v_roles := ARRAY['supervisor', 'manager', 'direct_manager'];

  INSERT INTO public.hr_approval_requests (tenant_id, request_type, related_id, employee_id, department_id)
  VALUES (v_tenant, p_request_type, p_related_id, p_employee_id, v_dept)
  RETURNING id INTO v_req_id;

  -- بناء المراحل (تخطّي الفارغ)
  FOR i IN 1..3 LOOP
    IF v_approvers[i] IS NOT NULL THEN
      v_order := v_order + 1;
      INSERT INTO public.hr_approval_steps (request_id, tenant_id, step_order, approver_role, approver_id, status)
      VALUES (
        v_req_id, v_tenant, v_order, v_roles[i], v_approvers[i],
        CASE WHEN v_first_active IS NULL THEN 'active' ELSE 'pending' END
      );
      IF v_first_active IS NULL THEN v_first_active := v_order; END IF;
    END IF;
  END LOOP;

  -- لا معتمِدين → اعتماد تلقائي
  IF v_order = 0 THEN
    UPDATE public.hr_approval_requests SET status = 'approved', updated_at = NOW() WHERE id = v_req_id;
  ELSE
    UPDATE public.hr_approval_requests SET current_step = v_first_active WHERE id = v_req_id;
  END IF;

  RETURN v_req_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_hr_approval(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hr_approval(TEXT, UUID, UUID) TO authenticated;

-- ─── (5) اتخاذ قرار على مرحلة (اعتماد/رفض) وتحريك السلسلة ─────────────────────
CREATE OR REPLACE FUNCTION public.decide_hr_approval_step(
  p_request_id UUID,
  p_decision TEXT,        -- 'approved' | 'rejected'
  p_comments TEXT DEFAULT NULL
)
RETURNS TEXT             -- الحالة النهائية للطلب
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_active RECORD;
  v_next RECORD;
  v_final TEXT;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  -- المرحلة النشطة الحالية
  SELECT * INTO v_active
  FROM public.hr_approval_steps
  WHERE request_id = p_request_id AND status = 'active'
  ORDER BY step_order LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'no active step'; END IF;

  -- يجب أن يكون المتخذ هو المعتمِد المعيّن لهذه المرحلة
  IF v_active.approver_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not authorized for this step';
  END IF;

  UPDATE public.hr_approval_steps
  SET status = p_decision, comments = p_comments, decided_at = NOW()
  WHERE id = v_active.id;

  IF p_decision = 'rejected' THEN
    UPDATE public.hr_approval_requests SET status = 'rejected', updated_at = NOW() WHERE id = p_request_id;
    v_final := 'rejected';
  ELSE
    -- تفعيل المرحلة التالية إن وُجدت
    SELECT * INTO v_next
    FROM public.hr_approval_steps
    WHERE request_id = p_request_id AND step_order > v_active.step_order AND status = 'pending'
    ORDER BY step_order LIMIT 1;

    IF FOUND THEN
      UPDATE public.hr_approval_steps SET status = 'active' WHERE id = v_next.id;
      UPDATE public.hr_approval_requests SET current_step = v_next.step_order, updated_at = NOW() WHERE id = p_request_id;
      v_final := 'pending';
    ELSE
      UPDATE public.hr_approval_requests SET status = 'approved', updated_at = NOW() WHERE id = p_request_id;
      v_final := 'approved';
    END IF;
  END IF;

  RETURN v_final;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_hr_approval_step(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_hr_approval_step(UUID, TEXT, TEXT) TO authenticated;

-- ─── (6) تحقّق نهائي ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.create_hr_approval(text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.decide_hr_approval_step(uuid,text,text)') IS NULL
     OR to_regprocedure('public.resolve_department_chain(uuid)') IS NULL THEN
    RAISE EXCEPTION '0153 assertion failed: approval-chain functions missing';
  END IF;
  RAISE NOTICE '0153 OK: HR approval-chain tables + functions installed.';
END $$;
