-- ============================================================================
-- 0233 — MRP Manufacturing Inventory/WIP UX Actions Completion
-- Adds WIP location status, balance adjustment, optimization close/review helpers.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_mrp_wip_location_status(p_wip_location_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','inventory','production_manager']::TEXT[]);
  IF p_status NOT IN ('active','blocked','closed') THEN RAISE EXCEPTION 'INVALID_WIP_LOCATION_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(w) INTO v_old FROM public.mrp_wip_locations w WHERE id=p_wip_location_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'WIP_LOCATION_NOT_FOUND'; END IF;
  UPDATE public.mrp_wip_locations SET status=p_status WHERE id=p_wip_location_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('inventory','mrp_wip_locations',p_wip_location_id,'status_change',v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_mrp_wip_location_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_mrp_wip_balance(p_work_order_id UUID,p_operation_id UUID,p_item_id UUID,p_wip_location_id UUID,p_quantity_delta NUMERIC,p_cost_delta NUMERIC DEFAULT 0,p_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_balance UUID; v_move UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','inventory','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'ADJUSTMENT_REASON_REQUIRED'; END IF;
  INSERT INTO public.mrp_wip_balances(tenant_id,work_order_id,operation_id,item_id,wip_location_id,quantity_in_process,accumulated_material_cost,updated_at)
  VALUES(v_tenant,p_work_order_id,p_operation_id,p_item_id,p_wip_location_id,COALESCE(p_quantity_delta,0),COALESCE(p_cost_delta,0),NOW())
  ON CONFLICT (tenant_id,work_order_id,operation_id,item_id) DO UPDATE SET quantity_in_process=mrp_wip_balances.quantity_in_process+EXCLUDED.quantity_in_process, accumulated_material_cost=mrp_wip_balances.accumulated_material_cost+EXCLUDED.accumulated_material_cost, wip_location_id=COALESCE(EXCLUDED.wip_location_id,mrp_wip_balances.wip_location_id), updated_at=NOW()
  RETURNING id INTO v_balance;
  INSERT INTO public.mrp_wip_movements(tenant_id,movement_number,work_order_id,from_operation_id,to_operation_id,item_id,quantity,movement_type,cost_delta,notes,actor_id)
  VALUES(v_tenant,public.generate_mrp_next_code('wip_movement',NULL),p_work_order_id,p_operation_id,p_operation_id,p_item_id,COALESCE(p_quantity_delta,0),'adjustment',COALESCE(p_cost_delta,0),p_reason,auth.uid()) RETURNING id INTO v_move;
  PERFORM public.log_mrp_audit_event('inventory','mrp_wip_balances',v_balance,'adjust',NULL,jsonb_build_object('quantity_delta',p_quantity_delta,'cost_delta',p_cost_delta),p_reason);
  RETURN v_move;
END $$;
GRANT EXECUTE ON FUNCTION public.adjust_mrp_wip_balance(UUID,UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_mrp_inventory_valuation_policy(p_policy_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','inventory','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'DEACTIVATION_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.mrp_inventory_valuation_policies p WHERE id=p_policy_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'VALUATION_POLICY_NOT_FOUND'; END IF;
  UPDATE public.mrp_inventory_valuation_policies SET is_active=false WHERE id=p_policy_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('inventory','mrp_inventory_valuation_policies',p_policy_id,'deactivate',v_old,jsonb_build_object('is_active',false),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.deactivate_mrp_inventory_valuation_policy(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_wip_location_lookup WITH (security_invoker=true) AS
SELECT wl.id,wl.wip_code,wl.name_ar,wl.status,wc.work_center_code,l.location_code
FROM public.mrp_wip_locations wl
LEFT JOIN public.work_centers wc ON wc.id=wl.work_center_id AND wc.tenant_id=wl.tenant_id
LEFT JOIN public.inventory_locations l ON l.id=wl.inventory_location_id AND l.tenant_id=wl.tenant_id
WHERE wl.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_wip_location_lookup TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.update_mrp_wip_location_status(uuid,text,text)') IS NULL OR to_regprocedure('public.adjust_mrp_wip_balance(uuid,uuid,uuid,uuid,numeric,numeric,text)') IS NULL THEN
    RAISE EXCEPTION '0233 failed: MRP inventory/WIP UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0233: MRP inventory/WIP UX actions applied';
END $$;
