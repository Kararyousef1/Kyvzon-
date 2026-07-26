-- ============================================================================
-- 0197 — Procurement PR Attachments/Notifications/Budget Scope (Unit 01 finalization)
-- التوثيق: docs/e-procurement/01-purchase-requisition-approval.md
-- يغطي المتبقي: تنبيهات المعتمدين، budget scopes، وسجل تذكيرات.
-- ============================================================================

ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.finance_projects(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS budget_scope TEXT DEFAULT 'cost_center' CHECK (budget_scope IN ('cost_center','project','category','capex'));
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS budget_category_code TEXT;
ALTER TABLE public.purchase_requisitions ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.pr_approval_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pr_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  approval_step_id UUID REFERENCES public.procurement_approval_steps(id) ON DELETE SET NULL,
  approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reminder_level INT NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'audit' CHECK (channel IN ('audit','email','notification')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pr_reminders_tenant ON public.pr_approval_reminders(tenant_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_reminders_pr ON public.pr_approval_reminders(pr_id, sent_at DESC);

ALTER TABLE public.pr_approval_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_approval_reminders_select ON public.pr_approval_reminders;
DROP POLICY IF EXISTS pr_approval_reminders_insert ON public.pr_approval_reminders;
CREATE POLICY pr_approval_reminders_select ON public.pr_approval_reminders FOR SELECT TO authenticated
USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN ('procurement','admin','manager','finance','developer','it_admin'));
CREATE POLICY pr_approval_reminders_insert ON public.pr_approval_reminders FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN ('procurement','admin','developer','it_admin'));

CREATE OR REPLACE VIEW public.pr_overdue_approvals
WITH (security_invoker = true) AS
SELECT
  pr.tenant_id,
  pr.id AS pr_id,
  pr.pr_number,
  pr.total_estimated,
  pr.currency_code,
  pr.priority,
  pr.status,
  pr.created_at AS pr_created_at,
  s.id AS step_id,
  s.step_order,
  s.approver_role,
  s.approver_id,
  s.created_at AS step_created_at,
  EXTRACT(EPOCH FROM (NOW() - s.created_at))/3600 AS waiting_hours,
  pr.last_reminder_at
FROM public.purchase_requisitions pr
JOIN public.procurement_approval_requests ar ON ar.related_id=pr.id AND ar.tenant_id=pr.tenant_id AND ar.status='pending'
JOIN public.procurement_approval_steps s ON s.request_id=ar.id AND s.tenant_id=pr.tenant_id AND s.status='active'
WHERE pr.tenant_id=public.current_user_tenant_id()
  AND pr.status IN ('pending_approval','under_review')
  AND s.created_at < NOW() - INTERVAL '4 hours';
GRANT SELECT ON public.pr_overdue_approvals TO authenticated;

CREATE OR REPLACE FUNCTION public.record_pr_approval_reminder(
  p_pr_id UUID,
  p_step_id UUID,
  p_channel TEXT DEFAULT 'audit',
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_step RECORD;
  v_id UUID;
  v_level INT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_pr_in_tenant(p_pr_id, NULL);
  SELECT * INTO v_step FROM public.procurement_approval_steps WHERE id=p_step_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPROVAL_STEP_NOT_FOUND'; END IF;
  SELECT COALESCE(MAX(reminder_level),0)+1 INTO v_level FROM public.pr_approval_reminders WHERE pr_id=p_pr_id AND approval_step_id=p_step_id AND tenant_id=v_tenant;
  INSERT INTO public.pr_approval_reminders(tenant_id, pr_id, approval_step_id, approver_id, reminder_level, channel, details)
  VALUES (v_tenant, p_pr_id, p_step_id, v_step.approver_id, v_level, p_channel, p_details)
  RETURNING id INTO v_id;
  UPDATE public.purchase_requisitions SET last_reminder_at=NOW(), updated_at=NOW() WHERE id=p_pr_id AND tenant_id=v_tenant;
  PERFORM public.log_pr_audit(p_pr_id,'approval_reminder_sent',(SELECT status FROM public.purchase_requisitions WHERE id=p_pr_id),(SELECT status FROM public.purchase_requisitions WHERE id=p_pr_id),to_jsonb(v_step),p_details,'Reminder level '||v_level);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_pr_approval_reminder(UUID,UUID,TEXT,JSONB) TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.pr_approval_reminders') IS NULL THEN RAISE EXCEPTION '0197 failed: pr reminders missing'; END IF;
  IF to_regclass('public.pr_overdue_approvals') IS NULL THEN RAISE EXCEPTION '0197 failed: overdue approvals view missing'; END IF;
  IF to_regprocedure('public.record_pr_approval_reminder(uuid,uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION '0197 failed: record reminder function missing'; END IF;
  RAISE NOTICE '✅ 0197: PR notifications and budget scope foundations applied';
END $$;
