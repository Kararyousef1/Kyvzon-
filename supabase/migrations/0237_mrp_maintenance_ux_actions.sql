-- ============================================================================
-- 0237 — MRP Maintenance/CMMS UX Actions Completion
-- Adds asset/PM/WO/spare/condition/shutdown status actions with reasons.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_mrp_maintenance_asset_status(p_maintenance_asset_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('active','down','maintenance','retired') THEN RAISE EXCEPTION 'INVALID_MAINTENANCE_ASSET_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(a) INTO v_old FROM public.mrp_maintenance_assets a WHERE id=p_maintenance_asset_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'MAINTENANCE_ASSET_NOT_FOUND'; END IF;
  UPDATE public.mrp_maintenance_assets SET status=p_status,updated_at=NOW() WHERE id=p_maintenance_asset_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('maintenance','mrp_maintenance_assets',p_maintenance_asset_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_maintenance_asset_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_pm_plan_status(p_pm_plan_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('draft','active','paused','archived') THEN RAISE EXCEPTION 'INVALID_PM_PLAN_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.mrp_pm_plans p WHERE id=p_pm_plan_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'PM_PLAN_NOT_FOUND'; END IF;
  UPDATE public.mrp_pm_plans SET status=p_status WHERE id=p_pm_plan_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('maintenance','mrp_pm_plans',p_pm_plan_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_pm_plan_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.hold_mrp_maintenance_work_order(p_maintenance_wo_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'HOLD_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(w) INTO v_old FROM public.mrp_maintenance_work_orders w WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_FOUND'; END IF;
  UPDATE public.mrp_maintenance_work_orders SET status='on_hold',updated_at=NOW() WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant AND status IN ('new','assigned','in_progress');
  IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_HOLDABLE'; END IF;
  PERFORM public.log_mrp_audit_event('maintenance','mrp_maintenance_work_orders',p_maintenance_wo_id,'hold',v_old,jsonb_build_object('status','on_hold'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.hold_mrp_maintenance_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mrp_maintenance_work_order(p_maintenance_wo_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB; v_asset UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(w), maintenance_asset_id INTO v_old, v_asset FROM public.mrp_maintenance_work_orders w WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_FOUND'; END IF;
  UPDATE public.mrp_maintenance_work_orders SET status='cancelled',updated_at=NOW(),close_reason=p_reason WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant AND status NOT IN ('completed','closed','cancelled');
  IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_CANCELLABLE'; END IF;
  UPDATE public.mrp_maintenance_assets SET status='active',updated_at=NOW() WHERE id=v_asset AND tenant_id=v_tenant AND status='maintenance';
  PERFORM public.log_mrp_audit_event('maintenance','mrp_maintenance_work_orders',p_maintenance_wo_id,'cancel',v_old,jsonb_build_object('status','cancelled'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_mrp_maintenance_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_maintenance_spare_part_status(p_spare_part_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('active','inactive','obsolete') THEN RAISE EXCEPTION 'INVALID_SPARE_PART_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(s) INTO v_old FROM public.mrp_maintenance_spare_parts s WHERE id=p_spare_part_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'SPARE_PART_NOT_FOUND'; END IF;
  UPDATE public.mrp_maintenance_spare_parts SET status=p_status WHERE id=p_spare_part_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('maintenance','mrp_maintenance_spare_parts',p_spare_part_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_maintenance_spare_part_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_condition_alert(p_alert_id UUID,p_status TEXT DEFAULT 'resolved',p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('resolved','dismissed') THEN RAISE EXCEPTION 'INVALID_CONDITION_ALERT_STATUS'; END IF;
  SELECT to_jsonb(a) INTO v_old FROM public.mrp_condition_alerts a WHERE id=p_alert_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'CONDITION_ALERT_NOT_FOUND'; END IF;
  UPDATE public.mrp_condition_alerts SET status=p_status WHERE id=p_alert_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'CONDITION_ALERT_NOT_OPEN'; END IF;
  PERFORM public.log_mrp_audit_event('maintenance','mrp_condition_alerts',p_alert_id,p_status,v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_condition_alert(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_annual_shutdown_status(p_shutdown_plan_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('draft','planned','in_progress','completed','cancelled') THEN RAISE EXCEPTION 'INVALID_SHUTDOWN_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(s) INTO v_old FROM public.mrp_annual_shutdown_plans s WHERE id=p_shutdown_plan_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'SHUTDOWN_PLAN_NOT_FOUND'; END IF;
  UPDATE public.mrp_annual_shutdown_plans SET status=p_status WHERE id=p_shutdown_plan_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('maintenance','mrp_annual_shutdown_plans',p_shutdown_plan_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_annual_shutdown_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_shutdown_task_status(p_shutdown_task_id UUID,p_status TEXT,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF p_status NOT IN ('planned','in_progress','completed','cancelled') THEN RAISE EXCEPTION 'INVALID_SHUTDOWN_TASK_STATUS'; END IF;
  SELECT to_jsonb(t) INTO v_old FROM public.mrp_annual_shutdown_tasks t WHERE id=p_shutdown_task_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'SHUTDOWN_TASK_NOT_FOUND'; END IF;
  UPDATE public.mrp_annual_shutdown_tasks SET status=p_status WHERE id=p_shutdown_task_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('maintenance','mrp_annual_shutdown_tasks',p_shutdown_task_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_shutdown_task_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_condition_alert_lookup WITH (security_invoker=true) AS
SELECT a.id,a.alert_number,a.severity,a.status,a.title,ma.asset_number,ma.name_ar AS asset_name
FROM public.mrp_condition_alerts a
LEFT JOIN public.mrp_maintenance_assets ma ON ma.id=a.maintenance_asset_id AND ma.tenant_id=a.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id()
ORDER BY a.created_at DESC;
GRANT SELECT ON public.mrp_condition_alert_lookup TO authenticated;

CREATE OR REPLACE VIEW public.mrp_shutdown_task_lookup WITH (security_invoker=true) AS
SELECT t.id,t.sequence_no,t.task_text,t.status,p.shutdown_number,p.title AS shutdown_title
FROM public.mrp_annual_shutdown_tasks t
JOIN public.mrp_annual_shutdown_plans p ON p.id=t.shutdown_plan_id AND p.tenant_id=t.tenant_id
WHERE t.tenant_id=public.current_user_tenant_id()
ORDER BY p.start_date DESC,t.sequence_no;
GRANT SELECT ON public.mrp_shutdown_task_lookup TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.update_mrp_maintenance_asset_status(uuid,text,text)') IS NULL OR to_regprocedure('public.cancel_mrp_maintenance_work_order(uuid,text)') IS NULL OR to_regprocedure('public.close_mrp_condition_alert(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION '0237 failed: MRP maintenance UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0237: MRP maintenance UX actions applied';
END $$;
