-- ============================================================================
-- 0221 — MRP Unit 03: Production Planning & Work Orders
-- docs/mrp/03-production-planning-work-orders.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  source_mps_plan_id UUID REFERENCES public.mrp_mps_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  run_scope TEXT NOT NULL DEFAULT 'mps' CHECK (run_scope IN ('mps','item','manual')),
  started_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE(tenant_id,run_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_planned_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  planned_order_number TEXT NOT NULL,
  mrp_run_id UUID REFERENCES public.mrp_runs(id) ON DELETE SET NULL,
  source_mps_line_id UUID REFERENCES public.mrp_mps_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  bom_version_id UUID REFERENCES public.mrp_bom_versions(id) ON DELETE SET NULL,
  routing_id UUID REFERENCES public.routing_headers(id) ON DELETE SET NULL,
  order_type TEXT NOT NULL DEFAULT 'production' CHECK (order_type IN ('production','purchase','subcontract','transfer')),
  suggested_qty NUMERIC(18,6) NOT NULL CHECK (suggested_qty > 0),
  due_date DATE,
  suggested_start_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent','critical')),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','reviewed','firmed','converted_to_work_order','converted_to_purchase_requisition','cancelled')),
  planner_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,planned_order_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_number TEXT NOT NULL,
  planned_order_id UUID REFERENCES public.mrp_planned_orders(id) ON DELETE SET NULL,
  work_order_type TEXT NOT NULL DEFAULT 'standard' CHECK (work_order_type IN ('standard','custom_eto','rework','subcontract')),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  bom_version_id UUID REFERENCES public.mrp_bom_versions(id) ON DELETE SET NULL,
  routing_id UUID REFERENCES public.routing_headers(id) ON DELETE SET NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  quantity_to_produce NUMERIC(18,6) NOT NULL CHECK (quantity_to_produce > 0),
  quantity_completed NUMERIC(18,6) NOT NULL DEFAULT 0,
  quantity_scrapped NUMERIC(18,6) NOT NULL DEFAULT 0,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  critical_ratio NUMERIC(12,6),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent','critical')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','firmed','released','material_reserved','in_progress','paused','completed','closed','cancelled','on_hold')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,work_order_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_work_order_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  bom_line_id UUID REFERENCES public.mrp_bom_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  required_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  reserved_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  issued_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  consumed_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  scrap_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'PCS',
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'required' CHECK (status IN ('required','reserved','issued','consumed','short','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_work_order_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  routing_operation_id UUID REFERENCES public.routing_operations(id) ON DELETE SET NULL,
  sequence_no INT NOT NULL,
  operation_name TEXT NOT NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  setup_minutes NUMERIC(10,2) DEFAULT 0,
  run_minutes_per_unit NUMERIC(10,4) DEFAULT 0,
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  quantity_completed NUMERIC(18,6) NOT NULL DEFAULT 0,
  quantity_scrapped NUMERIC(18,6) NOT NULL DEFAULT 0,
  quality_gate_required BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','in_progress','paused','completed','skipped','blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,work_order_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS public.mrp_work_order_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.mrp_work_order_materials(id) ON DELETE CASCADE,
  inventory_reservation_id UUID REFERENCES public.inventory_reservations(id) ON DELETE SET NULL,
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','released','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_production_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_number TEXT NOT NULL,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  scheduling_method TEXT NOT NULL CHECK (scheduling_method IN ('forward','backward','finite_capacity')),
  sequence_rule TEXT NOT NULL DEFAULT 'CR' CHECK (sequence_rule IN ('FIFO','EDD','SPT','CR','setup_minimization')),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','released','cancelled','completed')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,schedule_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_dispatch_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dispatch_number TEXT NOT NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  work_order_operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  priority_rank INT NOT NULL DEFAULT 100,
  critical_ratio NUMERIC(12,6),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dispatched','started','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,dispatch_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_work_order_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('critical_ratio','late_start','late_completion','material_shortage','capacity_conflict','quality_hold')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','urgent')),
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.run_mrp_from_mps(p_mps_plan_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_run UUID; v_line RECORD; v_bom UUID; v_routing UUID; v_qty NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  INSERT INTO public.mrp_runs(tenant_id,run_number,source_mps_plan_id,status,started_by,completed_at)
  VALUES(v_tenant,public.generate_mrp_next_code('mrp_run',NULL),p_mps_plan_id,'completed',auth.uid(),NOW()) RETURNING id INTO v_run;
  FOR v_line IN SELECT * FROM public.mrp_mps_lines WHERE tenant_id=v_tenant AND mps_plan_id=p_mps_plan_id AND mps_qty>0 LOOP
    SELECT v.id INTO v_bom FROM public.mrp_bom_versions v JOIN public.mrp_bom_headers h ON h.id=v.bom_id AND h.tenant_id=v.tenant_id WHERE v.tenant_id=v_tenant AND h.item_id=v_line.item_id AND v.status='effective' ORDER BY v.effective_from DESC NULLS LAST LIMIT 1;
    SELECT id INTO v_routing FROM public.routing_headers WHERE tenant_id=v_tenant AND item_id=v_line.item_id AND status='effective' ORDER BY effective_from DESC NULLS LAST LIMIT 1;
    v_qty := v_line.mps_qty;
    INSERT INTO public.mrp_planned_orders(tenant_id,planned_order_number,mrp_run_id,source_mps_line_id,item_id,bom_version_id,routing_id,order_type,suggested_qty,due_date,suggested_start_date,priority,status)
    VALUES(v_tenant,public.generate_mrp_next_code('planned_order',NULL),v_run,v_line.id,v_line.item_id,v_bom,v_routing,'production',v_qty,v_line.bucket_end,v_line.bucket_start,CASE WHEN v_line.is_frozen THEN 'urgent' ELSE 'normal' END,'suggested');
  END LOOP;
  RETURN v_run;
END $$;
GRANT EXECUTE ON FUNCTION public.run_mrp_from_mps(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_planned_order(p_planned_order_id UUID,p_status TEXT,p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF p_status NOT IN ('reviewed','firmed','cancelled') THEN RAISE EXCEPTION 'INVALID_PLANNED_ORDER_REVIEW_STATUS'; END IF;
  UPDATE public.mrp_planned_orders SET status=p_status, planner_notes=p_notes, reviewed_by=auth.uid(), reviewed_at=NOW() WHERE id=p_planned_order_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLANNED_ORDER_NOT_FOUND'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.review_planned_order(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_work_order(p_item_id UUID,p_quantity NUMERIC,p_bom_version_id UUID DEFAULT NULL,p_routing_id UUID DEFAULT NULL,p_work_order_type TEXT DEFAULT 'standard',p_due_at TIMESTAMPTZ DEFAULT NULL,p_planned_order_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_plant UUID; v_line UUID; v_routing UUID; v_bom UUID; v_mat RECORD; v_op RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  v_bom := p_bom_version_id;
  IF v_bom IS NULL THEN SELECT v.id INTO v_bom FROM public.mrp_bom_versions v JOIN public.mrp_bom_headers h ON h.id=v.bom_id AND h.tenant_id=v.tenant_id WHERE v.tenant_id=v_tenant AND h.item_id=p_item_id AND v.status='effective' ORDER BY v.effective_from DESC NULLS LAST LIMIT 1; END IF;
  v_routing := p_routing_id;
  IF v_routing IS NULL THEN SELECT id INTO v_routing FROM public.routing_headers WHERE tenant_id=v_tenant AND item_id=p_item_id AND status='effective' LIMIT 1; END IF;
  SELECT plant_id,line_id INTO v_plant,v_line FROM public.work_centers WHERE tenant_id=v_tenant AND status='active' LIMIT 1;
  INSERT INTO public.mrp_work_orders(tenant_id,work_order_number,planned_order_id,work_order_type,item_id,bom_version_id,routing_id,plant_id,line_id,quantity_to_produce,due_at,status,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('work_order',NULL),p_planned_order_id,COALESCE(p_work_order_type,'standard'),p_item_id,v_bom,v_routing,v_plant,v_line,p_quantity,p_due_at,'planned',auth.uid()) RETURNING id INTO v_id;
  IF v_bom IS NOT NULL THEN
    FOR v_mat IN SELECT * FROM public.mrp_bom_lines WHERE tenant_id=v_tenant AND bom_version_id=v_bom AND status='active' LOOP
      INSERT INTO public.mrp_work_order_materials(tenant_id,work_order_id,bom_line_id,item_id,required_qty,uom,status)
      VALUES(v_tenant,v_id,v_mat.id,v_mat.component_item_id,p_quantity*v_mat.net_quantity,v_mat.uom,'required');
    END LOOP;
  END IF;
  IF v_routing IS NOT NULL THEN
    FOR v_op IN SELECT * FROM public.routing_operations WHERE tenant_id=v_tenant AND routing_id=v_routing AND status='active' ORDER BY sequence_no LOOP
      INSERT INTO public.mrp_work_order_operations(tenant_id,work_order_id,routing_operation_id,sequence_no,operation_name,work_center_id,setup_minutes,run_minutes_per_unit,quality_gate_required,status)
      VALUES(v_tenant,v_id,v_op.id,v_op.sequence_no,v_op.operation_name,v_op.work_center_id,v_op.setup_minutes,v_op.run_minutes_per_unit,v_op.quality_gate_required,'pending');
    END LOOP;
  END IF;
  IF p_planned_order_id IS NOT NULL THEN UPDATE public.mrp_planned_orders SET status='converted_to_work_order' WHERE id=p_planned_order_id AND tenant_id=v_tenant; END IF;
  PERFORM public.log_mrp_audit_event('planning','mrp_work_orders',v_id,'create',NULL,jsonb_build_object('work_order_id',v_id),'إنشاء أمر عمل');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_work_order(UUID,NUMERIC,UUID,UUID,TEXT,TIMESTAMPTZ,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_planned_order_to_work_order(p_planned_order_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_po RECORD;
BEGIN
  SELECT * INTO v_po FROM public.mrp_planned_orders WHERE id=p_planned_order_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLANNED_ORDER_NOT_FOUND'; END IF;
  RETURN public.create_mrp_work_order(v_po.item_id,v_po.suggested_qty,v_po.bom_version_id,v_po.routing_id,'standard',v_po.due_date::TIMESTAMPTZ,p_planned_order_id);
END $$;
GRANT EXECUTE ON FUNCTION public.convert_planned_order_to_work_order(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_mrp_work_order(p_work_order_id UUID,p_method TEXT DEFAULT 'forward',p_sequence_rule TEXT DEFAULT 'CR',p_start_at TIMESTAMPTZ DEFAULT NOW(),p_due_at TIMESTAMPTZ DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_wo RECORD; v_total NUMERIC; v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  SELECT * INTO v_wo FROM public.mrp_work_orders WHERE id=p_work_order_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  SELECT COALESCE(SUM(setup_minutes + run_minutes_per_unit*v_wo.quantity_to_produce),60) INTO v_total FROM public.mrp_work_order_operations WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id;
  IF p_method='backward' AND p_due_at IS NOT NULL THEN v_end:=p_due_at; v_start:=p_due_at - (v_total||' minutes')::INTERVAL; ELSE v_start:=COALESCE(p_start_at,NOW()); v_end:=v_start+(v_total||' minutes')::INTERVAL; END IF;
  INSERT INTO public.mrp_production_schedules(tenant_id,schedule_number,work_order_id,scheduling_method,sequence_rule,scheduled_start_at,scheduled_end_at,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('production_schedule',NULL),p_work_order_id,p_method,p_sequence_rule,v_start,v_end,auth.uid()) RETURNING id INTO v_id;
  UPDATE public.mrp_work_orders SET scheduled_start_at=v_start, scheduled_end_at=v_end, due_at=COALESCE(p_due_at,due_at), status=CASE WHEN status='draft' THEN 'planned' ELSE status END WHERE id=p_work_order_id AND tenant_id=v_tenant;
  UPDATE public.mrp_work_order_operations SET planned_start_at=v_start, planned_end_at=v_end WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id AND planned_start_at IS NULL;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.schedule_mrp_work_order(UUID,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_mrp_work_order(p_work_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_mat RECORD; v_res UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  FOR v_mat IN SELECT * FROM public.mrp_work_order_materials WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id AND status IN ('required','short') LOOP
    BEGIN
      SELECT public.reserve_inventory(v_mat.item_id, COALESCE(v_mat.warehouse_id,(SELECT warehouse_id FROM public.inventory_stock_balances WHERE tenant_id=v_tenant AND item_id=v_mat.item_id AND available_qty>0 LIMIT 1)), v_mat.required_qty, 'mrp_work_orders', p_work_order_id) INTO v_res;
      INSERT INTO public.mrp_work_order_reservations(tenant_id,work_order_id,material_id,inventory_reservation_id,quantity) VALUES(v_tenant,p_work_order_id,v_mat.id,v_res,v_mat.required_qty);
      UPDATE public.mrp_work_order_materials SET reserved_qty=required_qty,status='reserved' WHERE id=v_mat.id AND tenant_id=v_tenant;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.mrp_work_order_materials SET status='short' WHERE id=v_mat.id AND tenant_id=v_tenant;
      INSERT INTO public.mrp_work_order_alerts(tenant_id,work_order_id,alert_type,severity,title,body) VALUES(v_tenant,p_work_order_id,'material_shortage','urgent','مواد غير متوفرة','فشل حجز مادة لأمر العمل');
    END;
  END LOOP;
  UPDATE public.mrp_work_orders SET status='material_reserved', released_by=auth.uid(), updated_at=NOW() WHERE id=p_work_order_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.release_mrp_work_order(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_mrp_work_order_material(p_material_id UUID,p_quantity NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_mat RECORD; v_wh UUID; v_loc UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_supervisor','production_manager']::TEXT[]);
  SELECT * INTO v_mat FROM public.mrp_work_order_materials WHERE id=p_material_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO_MATERIAL_NOT_FOUND'; END IF;
  SELECT warehouse_id,location_id INTO v_wh,v_loc FROM public.inventory_stock_balances WHERE tenant_id=v_tenant AND item_id=v_mat.item_id AND available_qty>=p_quantity LIMIT 1;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'MATERIAL_STOCK_NOT_AVAILABLE'; END IF;
  PERFORM public.post_inventory_movement('issue',v_mat.item_id,v_wh,v_loc,p_quantity,'mrp_work_order_materials',p_material_id,'work_order_issue');
  UPDATE public.mrp_work_order_materials SET issued_qty=issued_qty+p_quantity,status=CASE WHEN issued_qty+p_quantity>=required_qty THEN 'issued' ELSE status END WHERE id=p_material_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.issue_mrp_work_order_material(UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_mrp_work_order(p_work_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_supervisor','production_manager']::TEXT[]);
  UPDATE public.mrp_work_orders SET status='in_progress', actual_start_at=COALESCE(actual_start_at,NOW()), updated_at=NOW() WHERE id=p_work_order_id AND tenant_id=v_tenant AND status IN ('released','material_reserved','planned','firmed');
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_NOT_STARTABLE'; END IF;
  UPDATE public.mrp_work_order_operations SET status='ready' WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id AND sequence_no=(SELECT MIN(sequence_no) FROM public.mrp_work_order_operations WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id);
END $$;
GRANT EXECUTE ON FUNCTION public.start_mrp_work_order(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_mrp_work_order_operation(p_operation_id UUID,p_completed_qty NUMERIC,p_scrap_qty NUMERIC DEFAULT 0)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_op RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_supervisor','shop_floor_operator','production_manager']::TEXT[]);
  SELECT * INTO v_op FROM public.mrp_work_order_operations WHERE id=p_operation_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO_OPERATION_NOT_FOUND'; END IF;
  UPDATE public.mrp_work_order_operations SET status='completed', actual_end_at=NOW(), quantity_completed=p_completed_qty, quantity_scrapped=COALESCE(p_scrap_qty,0) WHERE id=p_operation_id AND tenant_id=v_tenant;
  UPDATE public.mrp_work_order_operations SET status='ready' WHERE tenant_id=v_tenant AND work_order_id=v_op.work_order_id AND sequence_no=(SELECT MIN(sequence_no) FROM public.mrp_work_order_operations WHERE tenant_id=v_tenant AND work_order_id=v_op.work_order_id AND status='pending');
END $$;
GRANT EXECUTE ON FUNCTION public.complete_mrp_work_order_operation(UUID,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_mrp_work_order(p_work_order_id UUID,p_completed_qty NUMERIC,p_scrap_qty NUMERIC DEFAULT 0,p_receipt_warehouse_id UUID DEFAULT NULL,p_receipt_location_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_wo RECORD; v_wh UUID; v_loc UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_supervisor','production_manager']::TEXT[]);
  SELECT * INTO v_wo FROM public.mrp_work_orders WHERE id=p_work_order_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  v_wh := COALESCE(p_receipt_warehouse_id,(SELECT id FROM public.inventory_warehouses WHERE tenant_id=v_tenant AND status='active' LIMIT 1));
  v_loc := p_receipt_location_id;
  IF p_completed_qty>0 THEN PERFORM public.post_inventory_movement('receipt',v_wo.item_id,v_wh,v_loc,p_completed_qty,'mrp_work_orders',p_work_order_id,'production_completion'); END IF;
  UPDATE public.mrp_work_orders SET status='completed', quantity_completed=p_completed_qty, quantity_scrapped=COALESCE(p_scrap_qty,0), actual_end_at=NOW(), updated_at=NOW() WHERE id=p_work_order_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_mrp_work_order(UUID,NUMERIC,NUMERIC,UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_work_order(p_work_order_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  SELECT to_jsonb(t) INTO v_old FROM public.mrp_work_orders t WHERE id=p_work_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  UPDATE public.mrp_work_orders SET status='closed', closed_by=auth.uid(), updated_at=NOW() WHERE id=p_work_order_id AND tenant_id=v_tenant AND status='completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_NOT_CLOSABLE'; END IF;
  PERFORM public.log_mrp_audit_event('planning','mrp_work_orders',p_work_order_id,'close',v_old,jsonb_build_object('status','closed'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_mrp_work_order_critical_ratio(p_work_order_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_wo RECORD; v_remaining NUMERIC; v_time NUMERIC; v_cr NUMERIC;
BEGIN
  SELECT * INTO v_wo FROM public.mrp_work_orders WHERE id=p_work_order_id AND tenant_id=v_tenant;
  IF NOT FOUND OR v_wo.due_at IS NULL THEN RETURN NULL; END IF;
  v_remaining := GREATEST(v_wo.quantity_to_produce-v_wo.quantity_completed,0);
  v_time := GREATEST(EXTRACT(EPOCH FROM (v_wo.due_at-NOW()))/3600,0.01);
  v_cr := v_time/NULLIF(v_remaining,0);
  UPDATE public.mrp_work_orders SET critical_ratio=v_cr, priority=CASE WHEN v_cr<0.8 THEN 'critical' WHEN v_cr<1 THEN 'urgent' WHEN v_cr<1.3 THEN 'normal' ELSE 'low' END WHERE id=p_work_order_id AND tenant_id=v_tenant;
  RETURN v_cr;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_mrp_work_order_critical_ratio(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_work_order_alerts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v_rows INT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager','production_supervisor']::TEXT[]);
  INSERT INTO public.mrp_work_order_alerts(tenant_id,work_order_id,alert_type,severity,title,body)
  SELECT v_tenant,id,'critical_ratio','urgent','أمر عمل حرج','Critical Ratio أقل من 0.8' FROM public.mrp_work_orders WHERE tenant_id=v_tenant AND critical_ratio < 0.8 AND status NOT IN ('closed','cancelled','completed');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count:=v_count+v_rows;
  INSERT INTO public.mrp_work_order_alerts(tenant_id,work_order_id,alert_type,severity,title,body)
  SELECT v_tenant,id,'late_start','warning','تأخر بدء أمر عمل','تجاوز وقت البدء المجدول' FROM public.mrp_work_orders WHERE tenant_id=v_tenant AND scheduled_start_at < NOW() AND actual_start_at IS NULL AND status NOT IN ('closed','cancelled');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count:=v_count+v_rows;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_work_order_alerts() TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_runs','mrp_planned_orders','mrp_work_orders','mrp_work_order_materials','mrp_work_order_operations','mrp_work_order_reservations','mrp_production_schedules','mrp_dispatch_list','mrp_work_order_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_planning_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_runs WHERE tenant_id=public.current_user_tenant_id()) AS mrp_runs,
  (SELECT COUNT(*) FROM public.mrp_planned_orders WHERE tenant_id=public.current_user_tenant_id() AND status IN ('suggested','reviewed','firmed')) AS open_planned_orders,
  (SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','cancelled')) AS open_work_orders,
  (SELECT COUNT(*) FROM public.mrp_work_order_alerts WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_alerts;
GRANT SELECT ON public.mrp_planning_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_planned_order_review_queue WITH (security_invoker=true) AS
SELECT po.*, i.item_code, i.name_ar AS item_name FROM public.mrp_planned_orders po JOIN public.inventory_items i ON i.id=po.item_id AND i.tenant_id=po.tenant_id WHERE po.tenant_id=public.current_user_tenant_id() AND po.status IN ('suggested','reviewed','firmed') ORDER BY po.due_date NULLS LAST, po.created_at;
GRANT SELECT ON public.mrp_planned_order_review_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_order_dashboard WITH (security_invoker=true) AS
SELECT wo.*, i.item_code, i.name_ar AS item_name, COUNT(op.id) AS operation_count, COUNT(op.id) FILTER (WHERE op.status='completed') AS completed_operations
FROM public.mrp_work_orders wo JOIN public.inventory_items i ON i.id=wo.item_id AND i.tenant_id=wo.tenant_id LEFT JOIN public.mrp_work_order_operations op ON op.work_order_id=wo.id AND op.tenant_id=wo.tenant_id
WHERE wo.tenant_id=public.current_user_tenant_id()
GROUP BY wo.id, i.item_code, i.name_ar;
GRANT SELECT ON public.mrp_work_order_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_order_material_status WITH (security_invoker=true) AS
SELECT m.*, i.item_code, i.name_ar AS item_name, wo.work_order_number FROM public.mrp_work_order_materials m JOIN public.inventory_items i ON i.id=m.item_id AND i.tenant_id=m.tenant_id JOIN public.mrp_work_orders wo ON wo.id=m.work_order_id AND wo.tenant_id=m.tenant_id WHERE m.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_work_order_material_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_order_operation_status WITH (security_invoker=true) AS
SELECT op.*, wo.work_order_number, wc.work_center_code, wc.name_ar AS work_center_name FROM public.mrp_work_order_operations op JOIN public.mrp_work_orders wo ON wo.id=op.work_order_id AND wo.tenant_id=op.tenant_id LEFT JOIN public.work_centers wc ON wc.id=op.work_center_id AND wc.tenant_id=op.tenant_id WHERE op.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_work_order_operation_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_production_schedule_board WITH (security_invoker=true) AS
SELECT s.*, wo.work_order_number, wo.item_id, i.item_code, i.name_ar AS item_name FROM public.mrp_production_schedules s JOIN public.mrp_work_orders wo ON wo.id=s.work_order_id AND wo.tenant_id=s.tenant_id JOIN public.inventory_items i ON i.id=wo.item_id AND i.tenant_id=wo.tenant_id WHERE s.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_production_schedule_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_dispatch_queue WITH (security_invoker=true) AS
SELECT d.*, wo.work_order_number, op.operation_name, wc.work_center_code FROM public.mrp_dispatch_list d LEFT JOIN public.mrp_work_orders wo ON wo.id=d.work_order_id AND wo.tenant_id=d.tenant_id LEFT JOIN public.mrp_work_order_operations op ON op.id=d.work_order_operation_id AND op.tenant_id=d.tenant_id LEFT JOIN public.work_centers wc ON wc.id=d.work_center_id AND wc.tenant_id=d.tenant_id WHERE d.tenant_id=public.current_user_tenant_id() ORDER BY priority_rank ASC, created_at;
GRANT SELECT ON public.mrp_dispatch_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_order_alert_queue WITH (security_invoker=true) AS
SELECT a.*, wo.work_order_number FROM public.mrp_work_order_alerts a LEFT JOIN public.mrp_work_orders wo ON wo.id=a.work_order_id AND wo.tenant_id=a.tenant_id WHERE a.tenant_id=public.current_user_tenant_id() AND a.status='open' ORDER BY CASE a.severity WHEN 'urgent' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, a.created_at DESC;
GRANT SELECT ON public.mrp_work_order_alert_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_production_planning_kpis WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id()) AS total_work_orders,
  (SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status='completed') AS completed_work_orders,
  (SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND priority='critical') AS critical_work_orders,
  (SELECT AVG(critical_ratio) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND critical_ratio IS NOT NULL) AS avg_critical_ratio;
GRANT SELECT ON public.mrp_production_planning_kpis TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_work_orders') IS NULL OR to_regclass('public.mrp_planning_dashboard') IS NULL OR to_regprocedure('public.run_mrp_from_mps(uuid)') IS NULL THEN
    RAISE EXCEPTION '0221 failed: MRP planning/work order objects missing';
  END IF;
  RAISE NOTICE '✅ 0221: MRP production planning and work orders applied';
END $$;
