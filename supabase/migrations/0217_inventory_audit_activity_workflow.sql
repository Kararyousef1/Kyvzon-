-- ============================================================================
-- 0217 — Inventory UX: audited status/edit workflow and per-unit activity feed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.inventory_unit_key_for_table(p_entity_table TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_entity_table IN ('inventory_items','inventory_warehouses','inventory_locations','inventory_stock_balances','inventory_stock_movements','inventory_code_sequences','inventory_barcodes') THEN 'foundation'
    WHEN p_entity_table LIKE 'inventory_receiving%' OR p_entity_table IN ('inventory_asns','inventory_asn_lines','inventory_dock_appointments','inventory_osd_cases','inventory_quarantine_holds','inventory_putaway_tasks','inventory_cross_dock_tasks','inventory_lpn_label_prints','inventory_inbound_notifications','inventory_quality_ncr_cases') THEN 'receiving'
    WHEN p_entity_table IN ('inventory_abc_classifications','inventory_slotting_recommendations','inventory_replenishment_tasks','inventory_location_label_prints','inventory_affinity_rules','inventory_seasonal_slotting_plans','inventory_task_interleaving_suggestions') THEN 'storage'
    WHEN p_entity_table LIKE 'inventory_pick%' OR p_entity_table IN ('inventory_picking_technology_events','inventory_zone_handoffs') THEN 'picking'
    WHEN p_entity_table IN ('inventory_packages','inventory_shipments','inventory_carriers','inventory_shipping_documents','inventory_loading_manifests','inventory_carrier_rate_quotes','inventory_rate_shopping_rules','inventory_carrier_webhook_events') THEN 'shipping'
    WHEN p_entity_table LIKE 'inventory_count%' OR p_entity_table IN ('inventory_cycle_count_plans','inventory_adjustment_approvals','inventory_annual_count_plans') THEN 'counting'
    WHEN p_entity_table LIKE 'inventory_return%' OR p_entity_table IN ('inventory_rmas','inventory_rma_lines','inventory_production_returns','inventory_supplier_rtv_reports') THEN 'returns'
    WHEN p_entity_table LIKE 'inventory_labor%' OR p_entity_table IN ('inventory_worker_availability','inventory_worker_skills') THEN 'labor'
    WHEN p_entity_table LIKE 'inventory_analytics%' OR p_entity_table LIKE 'inventory_periodic%' OR p_entity_table IN ('inventory_root_cause_analyses','inventory_report_exports','inventory_operating_cost_entries') THEN 'analytics'
    ELSE 'inventory'
  END;
$$;

CREATE OR REPLACE FUNCTION public.log_inventory_record_event(
  p_entity_table TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_comments TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','finance','procurement','quality','production','customer_service']::TEXT[]);
  INSERT INTO public.inventory_audit_log(tenant_id,entity_table,entity_id,action,actor_id,old_value,new_value,comments)
  VALUES(v_tenant,p_entity_table,p_entity_id,p_action,auth.uid(),p_old_value,p_new_value,p_comments)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_inventory_record_event(TEXT,UUID,TEXT,JSONB,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_inventory_record_status(
  p_entity_table TEXT,
  p_entity_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_allowed BOOLEAN;
  v_old JSONB;
  v_sql TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','finance','procurement','quality','production','customer_service']::TEXT[]);
  IF COALESCE(p_reason,'') = '' THEN RAISE EXCEPTION 'STATUS_CHANGE_REASON_REQUIRED'; END IF;
  SELECT p_entity_table = ANY(ARRAY[
    'inventory_asns','inventory_dock_appointments','inventory_receiving_sessions','inventory_osd_cases','inventory_quarantine_holds','inventory_putaway_tasks','inventory_cross_dock_tasks','inventory_pick_orders','inventory_pick_tasks','inventory_pick_waves','inventory_pick_exceptions','inventory_packages','inventory_shipments','inventory_loading_manifests','inventory_cycle_count_plans','inventory_count_tasks','inventory_count_variances','inventory_adjustment_approvals','inventory_rmas','inventory_return_disposition_tasks','inventory_return_rtv_claims','inventory_production_returns','inventory_labor_dispatch_tasks','inventory_analytics_alerts','inventory_periodic_report_runs','inventory_report_exports'
  ]) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'ENTITY_TABLE_NOT_ALLOWED_FOR_STATUS_UPDATE'; END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND tenant_id=$2 FOR UPDATE', p_entity_table)
  INTO v_old USING p_entity_id, v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_FOUND'; END IF;

  v_sql := format('UPDATE public.%I SET status=$1 WHERE id=$2 AND tenant_id=$3', p_entity_table);
  EXECUTE v_sql USING p_new_status, p_entity_id, v_tenant;

  PERFORM public.log_inventory_record_event(
    p_entity_table,
    p_entity_id,
    'status_change',
    v_old,
    jsonb_build_object('status',p_new_status),
    p_reason
  );
END $$;
GRANT EXECUTE ON FUNCTION public.update_inventory_record_status(TEXT,UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_inventory_master_record(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_patch JSONB,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_old JSONB;
  v_table TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF COALESCE(p_reason,'') = '' THEN RAISE EXCEPTION 'EDIT_REASON_REQUIRED'; END IF;

  IF p_entity_type='item' THEN
    v_table := 'inventory_items';
    SELECT to_jsonb(t) INTO v_old FROM public.inventory_items t WHERE id=p_entity_id AND tenant_id=v_tenant FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
    UPDATE public.inventory_items SET
      name_ar=COALESCE(p_patch->>'name_ar',name_ar),
      name_en=COALESCE(p_patch->>'name_en',name_en),
      reorder_point=COALESCE(NULLIF(p_patch->>'reorder_point','')::NUMERIC,reorder_point),
      reorder_qty=COALESCE(NULLIF(p_patch->>'reorder_qty','')::NUMERIC,reorder_qty),
      status=COALESCE(p_patch->>'status',status),
      updated_at=NOW()
    WHERE id=p_entity_id AND tenant_id=v_tenant;
  ELSIF p_entity_type='warehouse' THEN
    v_table := 'inventory_warehouses';
    SELECT to_jsonb(t) INTO v_old FROM public.inventory_warehouses t WHERE id=p_entity_id AND tenant_id=v_tenant FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
    UPDATE public.inventory_warehouses SET
      name_ar=COALESCE(p_patch->>'name_ar',name_ar),
      name_en=COALESCE(p_patch->>'name_en',name_en),
      status=COALESCE(p_patch->>'status',status),
      updated_at=NOW()
    WHERE id=p_entity_id AND tenant_id=v_tenant;
  ELSIF p_entity_type='location' THEN
    v_table := 'inventory_locations';
    SELECT to_jsonb(t) INTO v_old FROM public.inventory_locations t WHERE id=p_entity_id AND tenant_id=v_tenant FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'LOCATION_NOT_FOUND'; END IF;
    UPDATE public.inventory_locations SET
      barcode=COALESCE(p_patch->>'barcode',barcode),
      status=COALESCE(p_patch->>'status',status),
      max_capacity=COALESCE(NULLIF(p_patch->>'max_capacity','')::NUMERIC,max_capacity),
      current_capacity_used=COALESCE(NULLIF(p_patch->>'current_capacity_used','')::NUMERIC,current_capacity_used)
    WHERE id=p_entity_id AND tenant_id=v_tenant;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_MASTER_ENTITY_TYPE';
  END IF;

  PERFORM public.log_inventory_record_event(v_table,p_entity_id,'edit',v_old,p_patch,p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.update_inventory_master_record(TEXT,UUID,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.inventory_unit_activity WITH (security_invoker=true) AS
SELECT
  a.tenant_id,
  public.inventory_unit_key_for_table(a.entity_table) AS unit_key,
  a.entity_table,
  a.entity_id,
  a.action,
  a.actor_id,
  p.full_name AS actor_name,
  a.old_value,
  a.new_value,
  a.comments,
  a.created_at
FROM public.inventory_audit_log a
LEFT JOIN public.profiles p ON p.id=a.actor_id
WHERE a.tenant_id=public.current_user_tenant_id()
ORDER BY a.created_at DESC;
GRANT SELECT ON public.inventory_unit_activity TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_unit_activity') IS NULL OR to_regprocedure('public.update_inventory_record_status(text,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION '0217 failed: audited activity workflow missing';
  END IF;
  RAISE NOTICE '✅ 0217: Inventory audited edit/status workflow applied';
END $$;
