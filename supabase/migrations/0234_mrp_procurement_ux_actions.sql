-- ============================================================================
-- 0234 — MRP Procurement Integration UX Actions Completion
-- Adds recommendation review/cancel, TCO award, and alert close actions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.review_mrp_procurement_recommendation(p_recommendation_id UUID,p_status TEXT DEFAULT 'reviewed',p_supplier_id UUID DEFAULT NULL,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF p_status NOT IN ('reviewed','rfq_required','cancelled') THEN RAISE EXCEPTION 'INVALID_RECOMMENDATION_REVIEW_STATUS'; END IF;
  IF p_status='cancelled' AND COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(r) INTO v_old FROM public.mrp_procurement_recommendations r WHERE id=p_recommendation_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'RECOMMENDATION_NOT_FOUND'; END IF;
  UPDATE public.mrp_procurement_recommendations
  SET status=p_status, suggested_supplier_id=COALESCE(p_supplier_id,suggested_supplier_id), reason=COALESCE(p_reason,reason), reviewed_by=auth.uid(), reviewed_at=NOW()
  WHERE id=p_recommendation_id AND tenant_id=v_tenant AND status IN ('suggested','reviewed','rfq_required');
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOMMENDATION_NOT_REVIEWABLE'; END IF;
  PERFORM public.log_mrp_audit_event('procurement','mrp_procurement_recommendations',p_recommendation_id,'review',v_old,jsonb_build_object('status',p_status,'supplier_id',p_supplier_id),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.review_mrp_procurement_recommendation(UUID,TEXT,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_mrp_supplier_tco_candidate(p_tco_id UUID,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_tco RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  SELECT * INTO v_tco FROM public.mrp_supplier_tco_evaluations WHERE id=p_tco_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TCO_CANDIDATE_NOT_FOUND'; END IF;
  UPDATE public.mrp_supplier_tco_evaluations SET status='rejected' WHERE tenant_id=v_tenant AND recommendation_id=v_tco.recommendation_id AND id<>p_tco_id AND status IN ('candidate','shortlisted');
  UPDATE public.mrp_supplier_tco_evaluations SET status='awarded', ranking=1 WHERE id=p_tco_id AND tenant_id=v_tenant;
  UPDATE public.mrp_procurement_recommendations SET suggested_supplier_id=v_tco.supplier_id,estimated_unit_price=v_tco.quoted_unit_price,status='reviewed',reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=v_tco.recommendation_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('procurement','mrp_supplier_tco_evaluations',p_tco_id,'award',NULL,jsonb_build_object('supplier_id',v_tco.supplier_id,'recommendation_id',v_tco.recommendation_id),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.award_mrp_supplier_tco_candidate(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_procurement_alert(p_alert_id UUID,p_status TEXT DEFAULT 'resolved',p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF p_status NOT IN ('acknowledged','resolved','dismissed') THEN RAISE EXCEPTION 'INVALID_PROCUREMENT_ALERT_STATUS'; END IF;
  UPDATE public.mrp_procurement_alerts SET status=p_status WHERE id=p_alert_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROCUREMENT_ALERT_NOT_OPEN'; END IF;
  PERFORM public.log_mrp_audit_event('procurement','mrp_procurement_alerts',p_alert_id,p_status,NULL,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_procurement_alert(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_supplier_tco_candidate_board WITH (security_invoker=true) AS
SELECT t.*, r.recommendation_number, r.description, s.supplier_code, s.legal_name AS supplier_name
FROM public.mrp_supplier_tco_evaluations t
LEFT JOIN public.mrp_procurement_recommendations r ON r.id=t.recommendation_id AND r.tenant_id=t.tenant_id
LEFT JOIN public.suppliers s ON s.id=t.supplier_id AND s.tenant_id=t.tenant_id
WHERE t.tenant_id=public.current_user_tenant_id()
ORDER BY t.recommendation_id, t.tco_score ASC;
GRANT SELECT ON public.mrp_supplier_tco_candidate_board TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.review_mrp_procurement_recommendation(uuid,text,uuid,text)') IS NULL OR to_regprocedure('public.award_mrp_supplier_tco_candidate(uuid,text)') IS NULL OR to_regprocedure('public.close_mrp_procurement_alert(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION '0234 failed: MRP procurement UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0234: MRP procurement UX actions applied';
END $$;
