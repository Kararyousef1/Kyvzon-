-- ============================================================================
-- 0238 — MRP Costing UX Actions Completion
-- Adds status/review/cancel actions for cost master data, variances and postings.
-- ============================================================================

ALTER TABLE public.mrp_cost_variances ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','resolved','dismissed'));
ALTER TABLE public.mrp_cost_variances ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.mrp_cost_variances ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.mrp_cost_variances ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

CREATE OR REPLACE FUNCTION public.update_mrp_cost_element_status(p_cost_element_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','finance','manager']::TEXT[]);
  IF p_status NOT IN ('active','inactive','archived') THEN RAISE EXCEPTION 'INVALID_COST_ELEMENT_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(e) INTO v_old FROM public.mrp_cost_elements e WHERE id=p_cost_element_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'COST_ELEMENT_NOT_FOUND'; END IF;
  UPDATE public.mrp_cost_elements SET status=p_status WHERE id=p_cost_element_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('costing','mrp_cost_elements',p_cost_element_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_cost_element_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_costing_profile_status(p_profile_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','finance','manager']::TEXT[]);
  IF p_status NOT IN ('draft','active','inactive','archived') THEN RAISE EXCEPTION 'INVALID_COSTING_PROFILE_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.mrp_costing_profiles p WHERE id=p_profile_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'COSTING_PROFILE_NOT_FOUND'; END IF;
  UPDATE public.mrp_costing_profiles SET status=p_status WHERE id=p_profile_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('costing','mrp_costing_profiles',p_profile_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_costing_profile_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_standard_cost_version_status(p_version_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','finance','manager']::TEXT[]);
  IF p_status NOT IN ('approved','effective','superseded','archived') THEN RAISE EXCEPTION 'INVALID_STANDARD_COST_VERSION_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(v) INTO v_old FROM public.mrp_standard_cost_versions v WHERE id=p_version_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'STANDARD_COST_VERSION_NOT_FOUND'; END IF;
  UPDATE public.mrp_standard_cost_versions SET status=p_status, approved_by=CASE WHEN p_status IN ('approved','effective') THEN COALESCE(approved_by,auth.uid()) ELSE approved_by END, approved_at=CASE WHEN p_status IN ('approved','effective') THEN COALESCE(approved_at,NOW()) ELSE approved_at END WHERE id=p_version_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('costing','mrp_standard_cost_versions',p_version_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_standard_cost_version_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_mrp_cost_variance(p_variance_id UUID,p_status TEXT DEFAULT 'reviewed',p_resolution_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','finance','manager']::TEXT[]);
  IF p_status NOT IN ('reviewed','resolved','dismissed') THEN RAISE EXCEPTION 'INVALID_VARIANCE_STATUS'; END IF;
  SELECT to_jsonb(v) INTO v_old FROM public.mrp_cost_variances v WHERE id=p_variance_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'COST_VARIANCE_NOT_FOUND'; END IF;
  UPDATE public.mrp_cost_variances SET status=p_status,reviewed_by=auth.uid(),reviewed_at=NOW(),resolution_notes=p_resolution_notes WHERE id=p_variance_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('costing','mrp_cost_variances',p_variance_id,p_status,v_old,jsonb_build_object('status',p_status),p_resolution_notes);
END $$;
GRANT EXECUTE ON FUNCTION public.review_mrp_cost_variance(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mrp_cost_posting_draft(p_posting_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','finance','manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.mrp_cost_posting_drafts p WHERE id=p_posting_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'COST_POSTING_NOT_FOUND'; END IF;
  UPDATE public.mrp_cost_posting_drafts SET status='cancelled' WHERE id=p_posting_id AND tenant_id=v_tenant AND status IN ('draft','reviewed');
  IF NOT FOUND THEN RAISE EXCEPTION 'COST_POSTING_NOT_CANCELLABLE'; END IF;
  PERFORM public.log_mrp_audit_event('costing','mrp_cost_posting_drafts',p_posting_id,'cancel',v_old,jsonb_build_object('status','cancelled'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_mrp_cost_posting_draft(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_cost_element_lookup WITH (security_invoker=true) AS
SELECT id,element_code,name_ar,cost_category,status FROM public.mrp_cost_elements WHERE tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_cost_element_lookup TO authenticated;

CREATE OR REPLACE VIEW public.mrp_cost_variance_review_queue WITH (security_invoker=true) AS
SELECT v.*, wo.work_order_number, i.item_code, i.name_ar AS item_name
FROM public.mrp_cost_variances v
LEFT JOIN public.mrp_work_orders wo ON wo.id=v.work_order_id AND wo.tenant_id=v.tenant_id
LEFT JOIN public.inventory_items i ON i.id=wo.item_id AND i.tenant_id=wo.tenant_id
WHERE v.tenant_id=public.current_user_tenant_id()
ORDER BY CASE v.severity WHEN 'urgent' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, v.created_at DESC;
GRANT SELECT ON public.mrp_cost_variance_review_queue TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.cancel_mrp_cost_posting_draft(uuid,text)') IS NULL OR to_regprocedure('public.review_mrp_cost_variance(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION '0238 failed: MRP costing UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0238: MRP costing UX actions applied';
END $$;
