-- Compatibility migration for databases where the previous version of 0107
-- was already recorded. It creates the isolated financial approval schema
-- without modifying the manager approval tables or deleting existing data.

CREATE TABLE IF NOT EXISTS public.financial_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('journal_entry','invoice','expense','budget','tax_filing')),
  reference_id UUID NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step > 0),
  total_steps INTEGER NOT NULL DEFAULT 1 CHECK (total_steps > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (current_step <= total_steps)
);

CREATE TABLE IF NOT EXISTS public.financial_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.financial_approval_requests(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  approver_role VARCHAR(20) NOT NULL,
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
  comments TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_financial_approval_tenant ON public.financial_approval_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_approval_status ON public.financial_approval_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_approval_steps_request ON public.financial_approval_steps(request_id);

ALTER TABLE public.financial_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_approval_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_approval_requests_access ON public.financial_approval_requests;
CREATE POLICY financial_approval_requests_access ON public.financial_approval_requests FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS financial_approval_steps_access ON public.financial_approval_steps;
CREATE POLICY financial_approval_steps_access ON public.financial_approval_steps FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.financial_approval_requests request
    WHERE request.id = request_id
      AND request.tenant_id = public.current_user_tenant_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.financial_approval_requests request
    WHERE request.id = request_id
      AND request.tenant_id = public.current_user_tenant_id()
  ));
