-- ============================================================================
-- 0236 — MRP Shop Floor/MES UX Actions Completion
-- Adds workstation status, downtime reason upsert, forced terminal close,
-- maintenance request triage/status, and production event cancellation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_mrp_workstation_status(p_workstation_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  IF p_status NOT IN ('active','locked','down','maintenance','retired') THEN RAISE EXCEPTION 'INVALID_WORKSTATION_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(w) INTO v_old FROM public.mrp_shop_floor_workstations w WHERE id=p_workstation_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'WORKSTATION_NOT_FOUND'; END IF;
  UPDATE public.mrp_shop_floor_workstations SET current_status=p_status,updated_at=NOW() WHERE id=p_workstation_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('shopfloor','mrp_shop_floor_workstations',p_workstation_id,'status_change',v_old,jsonb_build_object('current_status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_workstation_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.force_close_mrp_terminal_session(p_session_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'FORCE_CLOSE_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(s) INTO v_old FROM public.mrp_shop_floor_terminal_sessions s WHERE id=p_session_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'TERMINAL_SESSION_NOT_FOUND'; END IF;
  UPDATE public.mrp_shop_floor_terminal_sessions SET status='forced_closed',closed_at=NOW(),notes=COALESCE(notes,'')||E'\nForce close: '||p_reason WHERE id=p_session_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'TERMINAL_SESSION_NOT_OPEN'; END IF;
  PERFORM public.log_mrp_audit_event('shopfloor','mrp_shop_floor_terminal_sessions',p_session_id,'force_close',v_old,jsonb_build_object('status','forced_closed'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.force_close_mrp_terminal_session(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_downtime_reason(p_reason_code TEXT,p_name_ar TEXT,p_category TEXT,p_reason_type TEXT,p_oee_loss_bucket TEXT DEFAULT 'availability',p_requires_comment BOOLEAN DEFAULT false,p_triggers_maintenance BOOLEAN DEFAULT false)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  v_code := public.generate_mrp_next_code('downtime_reason',p_reason_code);
  INSERT INTO public.mrp_downtime_reason_codes(tenant_id,reason_code,name_ar,category,reason_type,oee_loss_bucket,requires_comment,triggers_maintenance)
  VALUES(v_tenant,v_code,p_name_ar,p_category,p_reason_type,COALESCE(p_oee_loss_bucket,'availability'),COALESCE(p_requires_comment,false),COALESCE(p_triggers_maintenance,false))
  ON CONFLICT (tenant_id,reason_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,category=EXCLUDED.category,reason_type=EXCLUDED.reason_type,oee_loss_bucket=EXCLUDED.oee_loss_bucket,requires_comment=EXCLUDED.requires_comment,triggers_maintenance=EXCLUDED.triggers_maintenance,is_active=true
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_downtime_reason(TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_mrp_shopfloor_maintenance_request_status(p_request_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  IF p_status NOT IN ('open','triaged','converted_to_cmms','resolved','cancelled') THEN RAISE EXCEPTION 'INVALID_MAINTENANCE_REQUEST_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(r) INTO v_old FROM public.mrp_shopfloor_maintenance_requests r WHERE id=p_request_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'SHOPFLOOR_MAINTENANCE_REQUEST_NOT_FOUND'; END IF;
  UPDATE public.mrp_shopfloor_maintenance_requests SET status=p_status WHERE id=p_request_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('shopfloor','mrp_shopfloor_maintenance_requests',p_request_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_shopfloor_maintenance_request_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mrp_production_event(p_event_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_event RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT * INTO v_event FROM public.mrp_production_events WHERE id=p_event_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_EVENT_NOT_FOUND'; END IF;
  UPDATE public.mrp_work_order_operations SET quantity_completed=GREATEST(quantity_completed-COALESCE(v_event.good_qty,0),0), quantity_scrapped=GREATEST(quantity_scrapped-COALESCE(v_event.scrap_qty,0),0) WHERE id=v_event.operation_id AND tenant_id=v_tenant;
  UPDATE public.mrp_work_orders SET quantity_completed=GREATEST(quantity_completed-COALESCE(v_event.good_qty,0),0), quantity_scrapped=GREATEST(quantity_scrapped-COALESCE(v_event.scrap_qty,0),0), updated_at=NOW() WHERE id=v_event.work_order_id AND tenant_id=v_tenant;
  UPDATE public.mrp_production_events SET notes=COALESCE(notes,'')||E'\nCANCELLED/REVERSED: '||p_reason, good_qty=0, scrap_qty=0, rework_qty=0 WHERE id=p_event_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('shopfloor','mrp_production_events',p_event_id,'cancel_reverse',to_jsonb(v_event),jsonb_build_object('good_qty',0,'scrap_qty',0),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_mrp_production_event(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_shopfloor_terminal_session_lookup WITH (security_invoker=true) AS
SELECT s.id,s.session_number,s.status,s.opened_at,s.closed_at,ws.workstation_code,ws.name_ar AS workstation_name
FROM public.mrp_shop_floor_terminal_sessions s
LEFT JOIN public.mrp_shop_floor_workstations ws ON ws.id=s.workstation_id AND ws.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
ORDER BY s.opened_at DESC;
GRANT SELECT ON public.mrp_shopfloor_terminal_session_lookup TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.update_mrp_workstation_status(uuid,text,text)') IS NULL OR to_regprocedure('public.force_close_mrp_terminal_session(uuid,text)') IS NULL OR to_regprocedure('public.upsert_mrp_downtime_reason(text,text,text,text,text,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION '0236 failed: MRP shop floor UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0236: MRP shop floor UX actions applied';
END $$;
