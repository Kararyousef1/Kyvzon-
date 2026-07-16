-- ============================================================================
--  FILE: 0023_manager_portal_approvals_workload.sql
--  PURPOSE: Manager Portal: approvals center + workload/resource allocation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requester_id UUID,
  requester_name VARCHAR(250),
  current_approver_id UUID,
  request_type VARCHAR(50) NOT NULL DEFAULT 'other' CHECK (request_type IN ('leave','expense','loan','attendance_correction','movement_permit','goal','other')),
  title VARCHAR(250) NOT NULL,
  description TEXT,
  related_table VARCHAR(100),
  related_id UUID,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  actor_id UUID,
  action VARCHAR(30) NOT NULL CHECK (action IN ('created','approved','rejected','commented','reassigned')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manager_workload_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL,
  employee_id UUID,
  title VARCHAR(250) NOT NULL,
  description TEXT,
  workload_type VARCHAR(30) NOT NULL DEFAULT 'task' CHECK (workload_type IN ('task','project','support','training','other')),
  estimated_hours NUMERIC(8,2),
  priority VARCHAR(30) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_approver ON public.approval_requests(tenant_id, current_approver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request ON public.approval_actions(tenant_id, approval_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manager_workload_manager ON public.manager_workload_items(tenant_id, manager_id, status, due_at);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_workload_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_approval_requests_access ON public.approval_requests;
CREATE POLICY kyvzon_approval_requests_access ON public.approval_requests FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR requester_id = auth.uid() OR current_approver_id = auth.uid()))
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR requester_id = auth.uid() OR current_approver_id = auth.uid()));

DROP POLICY IF EXISTS kyvzon_approval_actions_access ON public.approval_actions;
CREATE POLICY kyvzon_approval_actions_access ON public.approval_actions FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_manager_workload_access ON public.manager_workload_items;
CREATE POLICY kyvzon_manager_workload_access ON public.manager_workload_items FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR manager_id = auth.uid() OR employee_id = auth.uid()))
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR manager_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_manager_workload_updated_at ON public.manager_workload_items;
CREATE TRIGGER trg_manager_workload_updated_at BEFORE UPDATE ON public.manager_workload_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='approval_requests');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='manager_workload_items');
END $$;
