-- ============================================================================
-- 0231 — MRP Forecasting/MPS UX Actions Completion
-- Adds missing planning policy, forecast override, MPS cancel/release, and alert close actions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_mrp_product_planning_policy(p_item_id UUID,p_strategy TEXT DEFAULT 'MTS',p_safety_stock_qty NUMERIC DEFAULT 0,p_min_mps_qty NUMERIC DEFAULT 0,p_order_multiple NUMERIC DEFAULT 1,p_manufacturing_lead_time_days INT DEFAULT 0,p_forecast_horizon_weeks INT DEFAULT 13,p_frozen_horizon_days INT DEFAULT 7,p_planning_time_fence_days INT DEFAULT 28,p_default_work_center_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'POLICY_ITEM_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_product_planning_policies(tenant_id,item_id,strategy,safety_stock_qty,min_mps_qty,order_multiple,manufacturing_lead_time_days,forecast_horizon_weeks,frozen_horizon_days,planning_time_fence_days,default_work_center_id)
  VALUES(v_tenant,p_item_id,COALESCE(p_strategy,'MTS'),COALESCE(p_safety_stock_qty,0),COALESCE(p_min_mps_qty,0),COALESCE(p_order_multiple,1),COALESCE(p_manufacturing_lead_time_days,0),COALESCE(p_forecast_horizon_weeks,13),COALESCE(p_frozen_horizon_days,7),COALESCE(p_planning_time_fence_days,28),p_default_work_center_id)
  ON CONFLICT (tenant_id,item_id) DO UPDATE SET strategy=EXCLUDED.strategy,safety_stock_qty=EXCLUDED.safety_stock_qty,min_mps_qty=EXCLUDED.min_mps_qty,order_multiple=EXCLUDED.order_multiple,manufacturing_lead_time_days=EXCLUDED.manufacturing_lead_time_days,forecast_horizon_weeks=EXCLUDED.forecast_horizon_weeks,frozen_horizon_days=EXCLUDED.frozen_horizon_days,planning_time_fence_days=EXCLUDED.planning_time_fence_days,default_work_center_id=EXCLUDED.default_work_center_id,is_active=true
  RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('forecasting','mrp_product_planning_policies',v_id,'upsert',NULL,jsonb_build_object('item_id',p_item_id),'إنشاء/تحديث سياسة تخطيط صنف');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_product_planning_policy(UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,INT,INT,INT,INT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.override_mrp_forecast_line(p_forecast_line_id UUID,p_new_qty NUMERIC,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'FORECAST_OVERRIDE_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.mrp_forecast_lines WHERE id=p_forecast_line_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORECAST_LINE_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_forecast_overrides(tenant_id,forecast_line_id,old_qty,new_qty,reason,actor_id) VALUES(v_tenant,p_forecast_line_id,COALESCE(v_old.adjusted_qty,v_old.forecast_qty),p_new_qty,p_reason,auth.uid());
  UPDATE public.mrp_forecast_lines SET adjusted_qty=p_new_qty,notes=COALESCE(notes,'')||E'\nOverride: '||p_reason WHERE id=p_forecast_line_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.override_mrp_forecast_line(UUID,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mrp_mps_plan(p_mps_plan_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.mrp_mps_plans p WHERE id=p_mps_plan_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'MPS_PLAN_NOT_FOUND'; END IF;
  UPDATE public.mrp_mps_plans SET status='cancelled' WHERE id=p_mps_plan_id AND tenant_id=v_tenant AND status NOT IN ('released','superseded','cancelled');
  IF NOT FOUND THEN RAISE EXCEPTION 'MPS_PLAN_NOT_CANCELLABLE'; END IF;
  PERFORM public.log_mrp_audit_event('mps','mrp_mps_plans',p_mps_plan_id,'cancel',v_old,jsonb_build_object('status','cancelled'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_mrp_mps_plan(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_mrp_mps_plan(p_mps_plan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  UPDATE public.mrp_mps_plans SET status='released' WHERE id=p_mps_plan_id AND tenant_id=v_tenant AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'MPS_PLAN_NOT_RELEASABLE'; END IF;
  PERFORM public.log_mrp_audit_event('mps','mrp_mps_plans',p_mps_plan_id,'release',NULL,jsonb_build_object('status','released'),'إطلاق MPS للتخطيط');
END $$;
GRANT EXECUTE ON FUNCTION public.release_mrp_mps_plan(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_mps_alert(p_alert_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  UPDATE public.mrp_mps_alerts SET status='resolved' WHERE id=p_alert_id AND tenant_id=v_tenant AND status IN ('open','acknowledged');
  IF NOT FOUND THEN RAISE EXCEPTION 'MPS_ALERT_NOT_CLOSABLE'; END IF;
  PERFORM public.log_mrp_audit_event('mps','mrp_mps_alerts',p_alert_id,'resolve',NULL,jsonb_build_object('status','resolved'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_mps_alert(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_forecast_line_board WITH (security_invoker=true) AS
SELECT fl.*, fr.run_number, fr.method, i.item_code, i.name_ar AS item_name
FROM public.mrp_forecast_lines fl
JOIN public.mrp_forecast_runs fr ON fr.id=fl.forecast_run_id AND fr.tenant_id=fl.tenant_id
LEFT JOIN public.inventory_items i ON i.id=fl.item_id AND i.tenant_id=fl.tenant_id
WHERE fl.tenant_id=public.current_user_tenant_id()
ORDER BY fl.bucket_start DESC;
GRANT SELECT ON public.mrp_forecast_line_board TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.upsert_mrp_product_planning_policy(uuid,text,numeric,numeric,numeric,integer,integer,integer,integer,uuid)') IS NULL OR to_regprocedure('public.override_mrp_forecast_line(uuid,numeric,text)') IS NULL OR to_regprocedure('public.release_mrp_mps_plan(uuid)') IS NULL THEN
    RAISE EXCEPTION '0231 failed: MRP Forecasting/MPS UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0231: MRP forecasting/MPS UX actions applied';
END $$;
