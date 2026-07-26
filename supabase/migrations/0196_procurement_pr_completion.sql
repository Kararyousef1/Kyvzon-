-- ============================================================================
-- 0196 — Procurement PR Completion (Unit 01)
-- التوثيق: docs/e-procurement/01-purchase-requisition-approval.md
-- يغطي المتبقي: revision/cancel, audit log, comments, reorder-point PR generation, KPIs.
-- ============================================================================

-- 1) توسيع حالات PR لتطابق التوثيق (Submitted / Under Review / Revision Required)
DO $$
DECLARE c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid='public.purchase_requisitions'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
    AND pg_get_constraintdef(oid) LIKE '%pending_approval%'
  LIMIT 1;
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.purchase_requisitions DROP CONSTRAINT %I', c_name);
  END IF;
  ALTER TABLE public.purchase_requisitions
    ADD CONSTRAINT purchase_requisitions_status_check
    CHECK (status IN ('draft','submitted','under_review','pending_approval','revision_required','approved','rejected','converted_to_po','cancelled'));
END $$;

-- 2) سجل تدقيق وتعليقات PR
CREATE TABLE IF NOT EXISTS public.pr_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pr_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  old_value JSONB,
  new_value JSONB,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_audit_pr ON public.pr_audit_log(pr_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_audit_tenant ON public.pr_audit_log(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pr_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pr_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_comments_pr ON public.pr_comments(pr_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pr_audit_log','pr_comments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_role() IN (''procurement'',''admin'',''manager'',''finance'',''developer'',''it_admin'') OR EXISTS (SELECT 1 FROM public.purchase_requisitions pr WHERE pr.id=%I.pr_id AND pr.requester_id=auth.uid())));', t, t, t);
    IF t='pr_audit_log' THEN
      EXECUTE format('CREATE POLICY %I_write ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''manager'',''finance'',''developer'',''it_admin''));', t, t);
    ELSE
      EXECUTE format('CREATE POLICY %I_write ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_role() IN (''procurement'',''admin'',''manager'',''finance'',''developer'',''it_admin'') OR EXISTS (SELECT 1 FROM public.purchase_requisitions pr WHERE pr.id=pr_id AND pr.requester_id=auth.uid())));', t, t);
    END IF;
  END LOOP;
END $$;

-- 3) دوال audit/comments/revision/cancel
CREATE OR REPLACE FUNCTION public.log_pr_audit(
  p_pr_id UUID,
  p_action TEXT,
  p_old_status TEXT DEFAULT NULL,
  p_new_status TEXT DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_comments TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_pr_in_tenant(p_pr_id, NULL);
  INSERT INTO public.pr_audit_log(tenant_id, pr_id, actor_id, action, old_status, new_status, old_value, new_value, comments)
  VALUES (v_tenant, p_pr_id, auth.uid(), p_action, p_old_status, p_new_status, p_old_value, p_new_value, p_comments)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_pr_audit(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_pr_comment(
  p_pr_id UUID,
  p_comment TEXT,
  p_is_internal BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_pr RECORD;
  v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  SELECT * INTO v_pr FROM public.purchase_requisitions WHERE id=p_pr_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR_NOT_FOUND'; END IF;
  IF NOT (public.current_user_role() IN ('procurement','admin','manager','finance','developer','it_admin') OR v_pr.requester_id=auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_COMMENT';
  END IF;
  IF p_comment IS NULL OR length(trim(p_comment))<2 THEN RAISE EXCEPTION 'COMMENT_REQUIRED'; END IF;
  INSERT INTO public.pr_comments(tenant_id, pr_id, author_id, comment, is_internal)
  VALUES (v_tenant, p_pr_id, auth.uid(), trim(p_comment), COALESCE(p_is_internal,false))
  RETURNING id INTO v_id;
  PERFORM public.log_pr_audit(p_pr_id,'comment_added',v_pr.status,v_pr.status,NULL,jsonb_build_object('comment_id',v_id),trim(p_comment));
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_pr_comment(UUID,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_pr_revision(
  p_pr_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_pr RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','manager','finance']::TEXT[]);
  SELECT * INTO v_pr FROM public.purchase_requisitions WHERE id=p_pr_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR_NOT_FOUND'; END IF;
  IF v_pr.status NOT IN ('pending_approval','under_review','submitted') THEN RAISE EXCEPTION 'PR_NOT_REVISIONABLE'; END IF;
  UPDATE public.purchase_requisitions SET status='revision_required', updated_at=NOW() WHERE id=p_pr_id AND tenant_id=v_tenant;
  PERFORM public.add_pr_comment(p_pr_id, p_reason, false);
  PERFORM public.log_pr_audit(p_pr_id,'revision_requested',v_pr.status,'revision_required',to_jsonb(v_pr),jsonb_build_object('reason',p_reason),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.request_pr_revision(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_pr(p_pr_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_pr RECORD;
BEGIN
  SELECT * INTO v_pr FROM public.purchase_requisitions WHERE id=p_pr_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR_NOT_FOUND'; END IF;
  IF NOT (public.current_user_role() IN ('procurement','admin','developer','it_admin') OR v_pr.requester_id=auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_CANCEL_PR';
  END IF;
  IF v_pr.status IN ('approved','converted_to_po') THEN RAISE EXCEPTION 'APPROVED_PR_CANNOT_BE_CANCELLED_HERE'; END IF;
  UPDATE public.purchase_requisitions SET status='cancelled', updated_at=NOW() WHERE id=p_pr_id AND tenant_id=v_tenant;
  PERFORM public.log_pr_audit(p_pr_id,'pr_cancelled',v_pr.status,'cancelled',to_jsonb(v_pr),jsonb_build_object('reason',p_reason),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_pr(UUID,TEXT) TO authenticated;

-- 4) تحديث approve_procurement_step ليكتب audit
CREATE OR REPLACE FUNCTION public.approve_procurement_step(
  p_request_id UUID,
  p_decision TEXT,
  p_comments TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_active RECORD;
  v_next RECORD;
  v_final TEXT;
  v_pr_id UUID;
  v_old_status TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['employee','supervisor','manager','procurement','admin','finance']::TEXT[]);
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procurement_approval_requests WHERE id=p_request_id AND tenant_id=public.current_user_tenant_id()) THEN
    RAISE EXCEPTION 'APPROVAL_REQUEST_NOT_IN_TENANT';
  END IF;

  SELECT * INTO v_active FROM public.procurement_approval_steps WHERE request_id=p_request_id AND status='active' ORDER BY step_order LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_STEP'; END IF;
  IF v_active.approver_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_THIS_STEP'; END IF;

  UPDATE public.procurement_approval_steps SET status=p_decision, comments=p_comments, decided_at=NOW() WHERE id=v_active.id;
  SELECT related_id INTO v_pr_id FROM public.procurement_approval_requests WHERE id=p_request_id;
  SELECT status INTO v_old_status FROM public.purchase_requisitions WHERE id=v_pr_id;

  IF p_decision='rejected' THEN
    UPDATE public.procurement_approval_requests SET status='rejected', updated_at=NOW() WHERE id=p_request_id;
    UPDATE public.purchase_requisitions SET status='rejected', updated_at=NOW() WHERE id=v_pr_id;
    v_final := 'rejected';
  ELSE
    SELECT * INTO v_next FROM public.procurement_approval_steps WHERE request_id=p_request_id AND step_order>v_active.step_order AND status='pending' ORDER BY step_order LIMIT 1;
    IF FOUND THEN
      UPDATE public.procurement_approval_steps SET status='active' WHERE id=v_next.id;
      UPDATE public.procurement_approval_requests SET current_step=v_next.step_order, updated_at=NOW() WHERE id=p_request_id;
      UPDATE public.purchase_requisitions SET current_approval_level=v_next.step_order, status='under_review', updated_at=NOW() WHERE id=v_pr_id;
      v_final := 'pending';
    ELSE
      UPDATE public.procurement_approval_requests SET status='approved', updated_at=NOW() WHERE id=p_request_id;
      UPDATE public.purchase_requisitions SET status='approved', updated_at=NOW() WHERE id=v_pr_id;
      v_final := 'approved';
    END IF;
  END IF;
  PERFORM public.log_pr_audit(v_pr_id,'approval_step_'||p_decision,v_old_status,(SELECT status FROM public.purchase_requisitions WHERE id=v_pr_id),to_jsonb(v_active),jsonb_build_object('final',v_final,'comments',p_comments),p_comments);
  RETURN v_final;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_procurement_step(UUID,TEXT,TEXT) TO authenticated;

-- 5) توليد PRs من نقاط إعادة الطلب/MRP المبسط
CREATE OR REPLACE FUNCTION public.generate_reorder_point_prs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_rp RECORD;
  v_pr_id UUID;
  v_count INT := 0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  FOR v_rp IN
    SELECT * FROM public.procurement_reorder_points
    WHERE tenant_id=v_tenant AND is_active=true AND current_stock <= reorder_point
      AND (last_generated_at IS NULL OR last_generated_at < NOW() - INTERVAL '1 day')
  LOOP
    SELECT public.create_purchase_requisition_full(
      v_rp.department_id,
      NULL,
      (CURRENT_DATE + INTERVAL '7 days')::DATE,
      'normal',
      'raw_material',
      'توليد تلقائي من نقطة إعادة الطلب: ' || v_rp.item_code,
      NULL,
      'reorder_point',
      'SAR',
      jsonb_build_array(jsonb_build_object('item_code',v_rp.item_code,'description',v_rp.description,'quantity',v_rp.reorder_qty,'unit',v_rp.unit,'estimated_unit_price',0))
    ) INTO v_pr_id;
    UPDATE public.procurement_reorder_points SET last_generated_at=NOW() WHERE id=v_rp.id;
    PERFORM public.log_pr_audit(v_pr_id,'pr_generated_from_reorder_point',NULL,'pending_approval',NULL,to_jsonb(v_rp),NULL);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_reorder_point_prs() TO authenticated;

-- 6) KPIs للوحدة الأولى
CREATE OR REPLACE VIEW public.pr_kpis
WITH (security_invoker = true) AS
SELECT
  tenant_id,
  COUNT(*) AS total_prs,
  COUNT(*) FILTER (WHERE priority='emergency') AS emergency_prs,
  ROUND(COUNT(*) FILTER (WHERE priority='emergency')::NUMERIC / NULLIF(COUNT(*),0)*100,2) AS emergency_percent,
  COUNT(*) FILTER (WHERE status='rejected') AS rejected_prs,
  ROUND(COUNT(*) FILTER (WHERE status='rejected')::NUMERIC / NULLIF(COUNT(*),0)*100,2) AS rejected_percent,
  COUNT(*) FILTER (WHERE status='converted_to_po') AS converted_to_po,
  AVG(EXTRACT(EPOCH FROM (updated_at-created_at))/3600) FILTER (WHERE status='approved') AS avg_approval_hours
FROM public.purchase_requisitions
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id;
GRANT SELECT ON public.pr_kpis TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.pr_audit_log') IS NULL THEN RAISE EXCEPTION '0196 failed: pr_audit_log missing'; END IF;
  IF to_regprocedure('public.request_pr_revision(uuid,text)') IS NULL THEN RAISE EXCEPTION '0196 failed: request revision missing'; END IF;
  IF to_regprocedure('public.generate_reorder_point_prs()') IS NULL THEN RAISE EXCEPTION '0196 failed: reorder generation missing'; END IF;
  RAISE NOTICE '✅ 0196: PR unit completion applied';
END $$;
