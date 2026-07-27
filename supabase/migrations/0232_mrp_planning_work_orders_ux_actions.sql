-- ============================================================================
-- 0232 — MRP Planning/Work Orders UX Actions Completion
-- Adds missing hold/resume/cancel, dispatch, and alert-close actions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hold_mrp_work_order(p_work_order_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'HOLD_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(w) INTO v_old FROM public.mrp_work_orders w WHERE id=p_work_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  UPDATE public.mrp_work_orders SET status='on_hold',updated_at=NOW() WHERE id=p_work_order_id AND tenant_id=v_tenant AND status IN ('planned','firmed','released','material_reserved','in_progress','paused');
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_NOT_HOLDABLE'; END IF;
  PERFORM public.log_mrp_audit_event('planning','mrp_work_orders',p_work_order_id,'hold',v_old,jsonb_build_object('status','on_hold'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.hold_mrp_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resume_mrp_work_order(p_work_order_id UUID,p_reason TEXT DEFAULT 'استئناف أمر العمل')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  SELECT to_jsonb(w) INTO v_old FROM public.mrp_work_orders w WHERE id=p_work_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  UPDATE public.mrp_work_orders SET status=CASE WHEN actual_start_at IS NOT NULL THEN 'in_progress' WHEN released_by IS NOT NULL THEN 'material_reserved' ELSE 'planned' END,updated_at=NOW() WHERE id=p_work_order_id AND tenant_id=v_tenant AND status IN ('on_hold','paused');
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_NOT_RESUMABLE'; END IF;
  PERFORM public.log_mrp_audit_event('planning','mrp_work_orders',p_work_order_id,'resume',v_old,jsonb_build_object('status','resumed'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.resume_mrp_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mrp_work_order(p_work_order_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(w) INTO v_old FROM public.mrp_work_orders w WHERE id=p_work_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  UPDATE public.mrp_work_orders SET status='cancelled',updated_at=NOW() WHERE id=p_work_order_id AND tenant_id=v_tenant AND status NOT IN ('completed','closed','cancelled');
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_NOT_CANCELLABLE'; END IF;
  UPDATE public.mrp_work_order_operations SET status='skipped' WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id AND status IN ('pending','ready','blocked');
  UPDATE public.mrp_work_order_reservations SET status='released' WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id AND status='reserved';
  PERFORM public.log_mrp_audit_event('planning','mrp_work_orders',p_work_order_id,'cancel',v_old,jsonb_build_object('status','cancelled'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_mrp_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_dispatch_item(p_work_order_operation_id UUID,p_priority_rank INT DEFAULT 100)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_op RECORD; v_cr NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  SELECT * INTO v_op FROM public.mrp_work_order_operations WHERE id=p_work_order_operation_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_OPERATION_NOT_FOUND'; END IF;
  SELECT critical_ratio INTO v_cr FROM public.mrp_work_orders WHERE id=v_op.work_order_id AND tenant_id=v_tenant;
  INSERT INTO public.mrp_dispatch_list(tenant_id,dispatch_number,work_center_id,work_order_operation_id,work_order_id,priority_rank,critical_ratio,status)
  VALUES(v_tenant,public.generate_mrp_next_code('dispatch',NULL),v_op.work_center_id,p_work_order_operation_id,v_op.work_order_id,COALESCE(p_priority_rank,100),v_cr,'open') RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_dispatch_item(UUID,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_dispatch_status(p_dispatch_id UUID,p_status TEXT,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  IF p_status NOT IN ('open','dispatched','started','completed','cancelled') THEN RAISE EXCEPTION 'INVALID_DISPATCH_STATUS'; END IF;
  SELECT to_jsonb(d) INTO v_old FROM public.mrp_dispatch_list d WHERE id=p_dispatch_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'DISPATCH_NOT_FOUND'; END IF;
  UPDATE public.mrp_dispatch_list SET status=p_status WHERE id=p_dispatch_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('planning','mrp_dispatch_list',p_dispatch_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_dispatch_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_work_order_alert(p_alert_id UUID,p_status TEXT DEFAULT 'resolved',p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  IF p_status NOT IN ('acknowledged','resolved','dismissed') THEN RAISE EXCEPTION 'INVALID_ALERT_STATUS'; END IF;
  UPDATE public.mrp_work_order_alerts SET status=p_status WHERE id=p_alert_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_ALERT_NOT_OPEN'; END IF;
  PERFORM public.log_mrp_audit_event('planning','mrp_work_order_alerts',p_alert_id,p_status,NULL,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_work_order_alert(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_dispatch_lookup WITH (security_invoker=true) AS
SELECT d.id,d.dispatch_number,d.status,d.priority_rank,wo.work_order_number,op.operation_name,wc.work_center_code
FROM public.mrp_dispatch_list d
LEFT JOIN public.mrp_work_orders wo ON wo.id=d.work_order_id AND wo.tenant_id=d.tenant_id
LEFT JOIN public.mrp_work_order_operations op ON op.id=d.work_order_operation_id AND op.tenant_id=d.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=d.work_center_id AND wc.tenant_id=d.tenant_id
WHERE d.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_dispatch_lookup TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.cancel_mrp_work_order(uuid,text)') IS NULL OR to_regprocedure('public.create_mrp_dispatch_item(uuid,integer)') IS NULL OR to_regprocedure('public.close_mrp_work_order_alert(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION '0232 failed: MRP planning UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0232: MRP planning/work orders UX actions applied';
END $$;
