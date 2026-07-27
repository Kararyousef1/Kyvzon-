-- ============================================================================
-- 0239 — MRP Manufacturing Analytics UX Actions Completion
-- Adds KPI target status, analytics alert status, RCA status, report cancel,
-- export status/file actions and lookup views.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_mrp_manufacturing_kpi_target_status(p_target_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('active','inactive','archived') THEN RAISE EXCEPTION 'INVALID_KPI_TARGET_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(t) INTO v_old FROM public.mrp_manufacturing_kpi_targets t WHERE id=p_target_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'KPI_TARGET_NOT_FOUND'; END IF;
  UPDATE public.mrp_manufacturing_kpi_targets SET status=p_status WHERE id=p_target_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('analytics','mrp_manufacturing_kpi_targets',p_target_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_manufacturing_kpi_target_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_manufacturing_analytics_alert_status(p_alert_id UUID,p_status TEXT,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('acknowledged','closed','dismissed') THEN RAISE EXCEPTION 'INVALID_ANALYTICS_ALERT_STATUS'; END IF;
  SELECT to_jsonb(a) INTO v_old FROM public.mrp_manufacturing_analytics_alerts a WHERE id=p_alert_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'ANALYTICS_ALERT_NOT_FOUND'; END IF;
  UPDATE public.mrp_manufacturing_analytics_alerts
  SET status=p_status, closed_by=CASE WHEN p_status IN ('closed','dismissed') THEN auth.uid() ELSE closed_by END, closed_at=CASE WHEN p_status IN ('closed','dismissed') THEN NOW() ELSE closed_at END, close_reason=COALESCE(p_reason,close_reason)
  WHERE id=p_alert_id AND tenant_id=v_tenant AND status IN ('open','acknowledged');
  IF NOT FOUND THEN RAISE EXCEPTION 'ANALYTICS_ALERT_NOT_UPDATABLE'; END IF;
  PERFORM public.log_mrp_audit_event('analytics','mrp_manufacturing_analytics_alerts',p_alert_id,p_status,v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_manufacturing_analytics_alert_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_manufacturing_rca_status(p_rca_id UUID,p_status TEXT,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('open','in_progress','verified','closed','cancelled') THEN RAISE EXCEPTION 'INVALID_RCA_STATUS'; END IF;
  SELECT to_jsonb(r) INTO v_old FROM public.mrp_manufacturing_root_cause_analyses r WHERE id=p_rca_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'RCA_NOT_FOUND'; END IF;
  UPDATE public.mrp_manufacturing_root_cause_analyses
  SET status=p_status, closed_by=CASE WHEN p_status IN ('closed','cancelled') THEN auth.uid() ELSE closed_by END, closed_at=CASE WHEN p_status IN ('closed','cancelled') THEN NOW() ELSE closed_at END
  WHERE id=p_rca_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('analytics','mrp_manufacturing_root_cause_analyses',p_rca_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_manufacturing_rca_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mrp_manufacturing_report_run(p_report_run_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(r) INTO v_old FROM public.mrp_manufacturing_report_runs r WHERE id=p_report_run_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'REPORT_RUN_NOT_FOUND'; END IF;
  UPDATE public.mrp_manufacturing_report_runs SET status='cancelled' WHERE id=p_report_run_id AND tenant_id=v_tenant AND status IN ('queued','running','completed');
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_RUN_NOT_CANCELLABLE'; END IF;
  PERFORM public.log_mrp_audit_event('analytics','mrp_manufacturing_report_runs',p_report_run_id,'cancel',v_old,jsonb_build_object('status','cancelled'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_mrp_manufacturing_report_run(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_manufacturing_export_status(p_export_id UUID,p_status TEXT,p_file_url TEXT DEFAULT NULL,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('queued','processing','ready','failed','cancelled') THEN RAISE EXCEPTION 'INVALID_EXPORT_STATUS'; END IF;
  SELECT to_jsonb(e) INTO v_old FROM public.mrp_manufacturing_export_requests e WHERE id=p_export_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'EXPORT_REQUEST_NOT_FOUND'; END IF;
  UPDATE public.mrp_manufacturing_export_requests SET status=p_status,file_url=COALESCE(p_file_url,file_url) WHERE id=p_export_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('analytics','mrp_manufacturing_export_requests',p_export_id,'status_change',v_old,jsonb_build_object('status',p_status,'file_url',p_file_url),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_manufacturing_export_status(UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_manufacturing_kpi_target_lookup WITH (security_invoker=true) AS
SELECT id,target_code,kpi_key,target_value,status FROM public.mrp_manufacturing_kpi_targets WHERE tenant_id=public.current_user_tenant_id() ORDER BY created_at DESC;
GRANT SELECT ON public.mrp_manufacturing_kpi_target_lookup TO authenticated;

CREATE OR REPLACE VIEW public.mrp_analytics_alert_lookup WITH (security_invoker=true) AS
SELECT id,alert_number,alert_type,severity,title,status FROM public.mrp_manufacturing_analytics_alerts WHERE tenant_id=public.current_user_tenant_id() ORDER BY created_at DESC;
GRANT SELECT ON public.mrp_analytics_alert_lookup TO authenticated;

CREATE OR REPLACE VIEW public.mrp_analytics_rca_lookup WITH (security_invoker=true) AS
SELECT id,rca_number,source_type,title,status FROM public.mrp_manufacturing_root_cause_analyses WHERE tenant_id=public.current_user_tenant_id() ORDER BY created_at DESC;
GRANT SELECT ON public.mrp_analytics_rca_lookup TO authenticated;

CREATE OR REPLACE VIEW public.mrp_analytics_report_lookup WITH (security_invoker=true) AS
SELECT id,report_number,report_type,status,period_start,period_end FROM public.mrp_manufacturing_report_runs WHERE tenant_id=public.current_user_tenant_id() ORDER BY generated_at DESC;
GRANT SELECT ON public.mrp_analytics_report_lookup TO authenticated;

CREATE OR REPLACE VIEW public.mrp_analytics_export_lookup WITH (security_invoker=true) AS
SELECT id,export_number,export_format,status,file_url FROM public.mrp_manufacturing_export_requests WHERE tenant_id=public.current_user_tenant_id() ORDER BY requested_at DESC;
GRANT SELECT ON public.mrp_analytics_export_lookup TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.update_mrp_manufacturing_kpi_target_status(uuid,text,text)') IS NULL OR to_regprocedure('public.update_mrp_manufacturing_analytics_alert_status(uuid,text,text)') IS NULL OR to_regprocedure('public.cancel_mrp_manufacturing_report_run(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0239 failed: MRP analytics UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0239: MRP analytics UX actions applied';
END $$;
