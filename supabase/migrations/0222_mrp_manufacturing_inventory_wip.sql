-- ============================================================================
-- 0222 — MRP Unit 04: Manufacturing Inventory, WIP & Traceability Integration
-- docs/mrp/04-inventory-management.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_inventory_valuation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  valuation_method TEXT NOT NULL DEFAULT 'WAC' CHECK (valuation_method IN ('FIFO','FEFO','WAC','ACTUAL')),
  costing_uom TEXT NOT NULL DEFAULT 'PCS',
  carrying_cost_percent NUMERIC(8,4) NOT NULL DEFAULT 25,
  service_level_percent NUMERIC(8,4) NOT NULL DEFAULT 95,
  z_factor NUMERIC(8,4) NOT NULL DEFAULT 1.65,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,item_id)
);

CREATE TABLE IF NOT EXISTS public.mrp_wip_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  inventory_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  wip_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,wip_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_wip_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  wip_location_id UUID REFERENCES public.mrp_wip_locations(id) ON DELETE SET NULL,
  quantity_in_process NUMERIC(18,6) NOT NULL DEFAULT 0,
  accumulated_material_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  accumulated_labor_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  accumulated_machine_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  accumulated_overhead_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,work_order_id,operation_id,item_id)
);

CREATE TABLE IF NOT EXISTS public.mrp_wip_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  movement_number TEXT NOT NULL,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  from_operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  to_operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,6) NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('start','move','complete','scrap','rework','adjustment')),
  cost_delta NUMERIC(18,6) DEFAULT 0,
  notes TEXT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,movement_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_lot_trace_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  raw_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  raw_lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  finished_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  finished_lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  quantity_consumed NUMERIC(18,6) DEFAULT 0,
  quantity_produced NUMERIC(18,6) DEFAULT 0,
  trace_direction TEXT NOT NULL DEFAULT 'both' CHECK (trace_direction IN ('forward','backward','both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_inventory_optimization_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  average_daily_demand NUMERIC(18,6) NOT NULL DEFAULT 0,
  demand_stddev NUMERIC(18,6) NOT NULL DEFAULT 0,
  lead_time_days NUMERIC(18,6) NOT NULL DEFAULT 0,
  service_level_percent NUMERIC(8,4) NOT NULL DEFAULT 95,
  z_factor NUMERIC(8,4) NOT NULL DEFAULT 1.65,
  safety_stock_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  reorder_point_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  annual_demand NUMERIC(18,6) DEFAULT 0,
  order_cost NUMERIC(18,6) DEFAULT 0,
  holding_cost_per_unit NUMERIC(18,6) DEFAULT 0,
  eoq_qty NUMERIC(18,6) DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,run_number)
);

CREATE OR REPLACE FUNCTION public.upsert_mrp_inventory_valuation_policy(p_item_id UUID,p_method TEXT,p_carrying_cost_percent NUMERIC DEFAULT 25,p_service_level_percent NUMERIC DEFAULT 95,p_z_factor NUMERIC DEFAULT 1.65)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager','cost_accountant']::TEXT[]);
  IF p_method NOT IN ('FIFO','FEFO','WAC','ACTUAL') THEN RAISE EXCEPTION 'INVALID_VALUATION_METHOD'; END IF;
  INSERT INTO public.mrp_inventory_valuation_policies(tenant_id,item_id,valuation_method,carrying_cost_percent,service_level_percent,z_factor)
  VALUES(v_tenant,p_item_id,p_method,COALESCE(p_carrying_cost_percent,25),COALESCE(p_service_level_percent,95),COALESCE(p_z_factor,1.65))
  ON CONFLICT (tenant_id,item_id) DO UPDATE SET valuation_method=EXCLUDED.valuation_method,carrying_cost_percent=EXCLUDED.carrying_cost_percent,service_level_percent=EXCLUDED.service_level_percent,z_factor=EXCLUDED.z_factor,is_active=true
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_inventory_valuation_policy(UUID,TEXT,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_wip_location(p_wip_code TEXT,p_name_ar TEXT,p_work_center_id UUID DEFAULT NULL,p_inventory_location_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_wc RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  IF p_work_center_id IS NOT NULL THEN SELECT * INTO v_wc FROM public.work_centers WHERE id=p_work_center_id AND tenant_id=v_tenant; END IF;
  INSERT INTO public.mrp_wip_locations(tenant_id,plant_id,line_id,work_center_id,inventory_location_id,wip_code,name_ar)
  VALUES(v_tenant,v_wc.plant_id,v_wc.line_id,p_work_center_id,p_inventory_location_id,COALESCE(p_wip_code,public.generate_mrp_next_code('wip_location',NULL)),p_name_ar)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_wip_location(TEXT,TEXT,UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_wip_movement(p_work_order_id UUID,p_from_operation_id UUID,p_to_operation_id UUID,p_item_id UUID,p_quantity NUMERIC,p_movement_type TEXT,p_cost_delta NUMERIC DEFAULT 0,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_supervisor','production_manager']::TEXT[]);
  INSERT INTO public.mrp_wip_movements(tenant_id,movement_number,work_order_id,from_operation_id,to_operation_id,item_id,quantity,movement_type,cost_delta,notes,actor_id)
  VALUES(v_tenant,public.generate_mrp_next_code('wip_movement',NULL),p_work_order_id,p_from_operation_id,p_to_operation_id,p_item_id,p_quantity,p_movement_type,COALESCE(p_cost_delta,0),p_notes,auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.mrp_wip_balances(tenant_id,work_order_id,operation_id,item_id,quantity_in_process,accumulated_material_cost)
  VALUES(v_tenant,p_work_order_id,COALESCE(p_to_operation_id,p_from_operation_id),p_item_id,p_quantity,COALESCE(p_cost_delta,0))
  ON CONFLICT (tenant_id,work_order_id,operation_id,item_id) DO UPDATE SET quantity_in_process=mrp_wip_balances.quantity_in_process+EXCLUDED.quantity_in_process, accumulated_material_cost=mrp_wip_balances.accumulated_material_cost+EXCLUDED.accumulated_material_cost, updated_at=NOW();
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_wip_movement(UUID,UUID,UUID,UUID,NUMERIC,TEXT,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_mrp_lot_trace(p_work_order_id UUID,p_raw_item_id UUID,p_raw_lot_id UUID,p_finished_item_id UUID,p_finished_lot_id UUID,p_consumed NUMERIC DEFAULT 0,p_produced NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_lot_trace_links(tenant_id,work_order_id,raw_item_id,raw_lot_id,finished_item_id,finished_lot_id,quantity_consumed,quantity_produced)
  VALUES(v_tenant,p_work_order_id,p_raw_item_id,p_raw_lot_id,p_finished_item_id,p_finished_lot_id,COALESCE(p_consumed,0),COALESCE(p_produced,0)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.link_mrp_lot_trace(UUID,UUID,UUID,UUID,UUID,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_mrp_inventory_optimization(p_item_id UUID,p_average_daily_demand NUMERIC,p_demand_stddev NUMERIC,p_lead_time_days NUMERIC,p_annual_demand NUMERIC DEFAULT 0,p_order_cost NUMERIC DEFAULT 0,p_holding_cost NUMERIC DEFAULT 0,p_service_level_percent NUMERIC DEFAULT 95,p_z_factor NUMERIC DEFAULT 1.65)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_ss NUMERIC; v_rop NUMERIC; v_eoq NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager','cost_accountant']::TEXT[]);
  v_ss := COALESCE(p_z_factor,1.65)*COALESCE(p_demand_stddev,0)*sqrt(GREATEST(COALESCE(p_lead_time_days,0),0));
  v_rop := COALESCE(p_average_daily_demand,0)*COALESCE(p_lead_time_days,0)+v_ss;
  v_eoq := CASE WHEN COALESCE(p_holding_cost,0)>0 THEN sqrt(2*COALESCE(p_annual_demand,0)*COALESCE(p_order_cost,0)/p_holding_cost) ELSE 0 END;
  INSERT INTO public.mrp_inventory_optimization_runs(tenant_id,run_number,item_id,average_daily_demand,demand_stddev,lead_time_days,service_level_percent,z_factor,safety_stock_qty,reorder_point_qty,annual_demand,order_cost,holding_cost_per_unit,eoq_qty,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('inventory_optimization',NULL),p_item_id,p_average_daily_demand,p_demand_stddev,p_lead_time_days,COALESCE(p_service_level_percent,95),COALESCE(p_z_factor,1.65),v_ss,v_rop,p_annual_demand,p_order_cost,p_holding_cost,v_eoq,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_mrp_inventory_optimization(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_inventory_valuation_policies','mrp_wip_locations','mrp_wip_balances','mrp_wip_movements','mrp_lot_trace_links','mrp_inventory_optimization_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_raw_materials_inventory WITH (security_invoker=true) AS
SELECT b.tenant_id,b.item_id,i.item_code,i.name_ar AS item_name,SUM(b.on_hand_qty) AS on_hand_qty,SUM(b.available_qty) AS available_qty,SUM(b.reserved_qty) AS reserved_qty,COALESCE(p.valuation_method,'WAC') AS valuation_method
FROM public.inventory_stock_balances b JOIN public.inventory_items i ON i.id=b.item_id AND i.tenant_id=b.tenant_id LEFT JOIN public.mrp_inventory_valuation_policies p ON p.item_id=b.item_id AND p.tenant_id=b.tenant_id
WHERE b.tenant_id=public.current_user_tenant_id() AND i.item_type IN ('raw_material','packaging','consumable')
GROUP BY b.tenant_id,b.item_id,i.item_code,i.name_ar,p.valuation_method;
GRANT SELECT ON public.mrp_raw_materials_inventory TO authenticated;

CREATE OR REPLACE VIEW public.mrp_wip_dashboard WITH (security_invoker=true) AS
SELECT b.tenant_id,wo.work_order_number,i.item_code,i.name_ar AS item_name,wc.work_center_code,b.quantity_in_process,(b.accumulated_material_cost+b.accumulated_labor_cost+b.accumulated_machine_cost+b.accumulated_overhead_cost) AS accumulated_cost,b.updated_at
FROM public.mrp_wip_balances b JOIN public.mrp_work_orders wo ON wo.id=b.work_order_id AND wo.tenant_id=b.tenant_id JOIN public.inventory_items i ON i.id=b.item_id AND i.tenant_id=b.tenant_id LEFT JOIN public.mrp_work_order_operations op ON op.id=b.operation_id AND op.tenant_id=b.tenant_id LEFT JOIN public.work_centers wc ON wc.id=op.work_center_id AND wc.tenant_id=op.tenant_id
WHERE b.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_wip_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_finished_goods_inventory WITH (security_invoker=true) AS
SELECT b.tenant_id,b.item_id,i.item_code,i.name_ar AS item_name,SUM(b.on_hand_qty) AS on_hand_qty,SUM(b.available_qty) AS available_qty,AVG(b.average_cost) AS average_cost
FROM public.inventory_stock_balances b JOIN public.inventory_items i ON i.id=b.item_id AND i.tenant_id=b.tenant_id
WHERE b.tenant_id=public.current_user_tenant_id() AND i.item_type='finished_good'
GROUP BY b.tenant_id,b.item_id,i.item_code,i.name_ar;
GRANT SELECT ON public.mrp_finished_goods_inventory TO authenticated;

CREATE OR REPLACE VIEW public.mrp_lot_forward_traceability WITH (security_invoker=true) AS
SELECT t.tenant_id,t.raw_lot_id,rl.lot_number AS raw_lot_number,ri.item_code AS raw_item_code,wo.work_order_number,t.finished_lot_id,fl.lot_number AS finished_lot_number,fi.item_code AS finished_item_code,t.quantity_consumed,t.quantity_produced,t.created_at
FROM public.mrp_lot_trace_links t LEFT JOIN public.inventory_lots rl ON rl.id=t.raw_lot_id AND rl.tenant_id=t.tenant_id LEFT JOIN public.inventory_items ri ON ri.id=t.raw_item_id AND ri.tenant_id=t.tenant_id LEFT JOIN public.mrp_work_orders wo ON wo.id=t.work_order_id AND wo.tenant_id=t.tenant_id LEFT JOIN public.inventory_lots fl ON fl.id=t.finished_lot_id AND fl.tenant_id=t.tenant_id LEFT JOIN public.inventory_items fi ON fi.id=t.finished_item_id AND fi.tenant_id=t.tenant_id
WHERE t.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_lot_forward_traceability TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_order_material_reconciliation WITH (security_invoker=true) AS
SELECT m.tenant_id,wo.work_order_number,i.item_code,i.name_ar AS item_name,m.required_qty,m.issued_qty,m.consumed_qty,(m.consumed_qty-m.required_qty) AS consumption_variance,m.status
FROM public.mrp_work_order_materials m JOIN public.mrp_work_orders wo ON wo.id=m.work_order_id AND wo.tenant_id=m.tenant_id JOIN public.inventory_items i ON i.id=m.item_id AND i.tenant_id=m.tenant_id
WHERE m.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_work_order_material_reconciliation TO authenticated;

CREATE OR REPLACE VIEW public.mrp_inventory_optimization_report WITH (security_invoker=true) AS
SELECT r.*, i.item_code, i.name_ar AS item_name FROM public.mrp_inventory_optimization_runs r LEFT JOIN public.inventory_items i ON i.id=r.item_id AND i.tenant_id=r.tenant_id WHERE r.tenant_id=public.current_user_tenant_id() ORDER BY r.created_at DESC;
GRANT SELECT ON public.mrp_inventory_optimization_report TO authenticated;

CREATE OR REPLACE VIEW public.mrp_manufacturing_inventory_kpis WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COALESCE(SUM(available_qty),0) FROM public.mrp_raw_materials_inventory) AS raw_available_qty,
  (SELECT COALESCE(SUM(quantity_in_process),0) FROM public.mrp_wip_dashboard) AS wip_qty,
  (SELECT COALESCE(SUM(available_qty),0) FROM public.mrp_finished_goods_inventory) AS fg_available_qty,
  (SELECT COUNT(*) FROM public.mrp_lot_trace_links WHERE tenant_id=public.current_user_tenant_id()) AS trace_links;
GRANT SELECT ON public.mrp_manufacturing_inventory_kpis TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_wip_balances') IS NULL OR to_regclass('public.mrp_wip_dashboard') IS NULL OR to_regprocedure('public.calculate_mrp_inventory_optimization(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION '0222 failed: MRP manufacturing inventory objects missing';
  END IF;
  RAISE NOTICE '✅ 0222: MRP manufacturing inventory and WIP integration applied';
END $$;
