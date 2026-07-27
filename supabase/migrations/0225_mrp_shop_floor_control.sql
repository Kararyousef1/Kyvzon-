-- ============================================================================
-- 0225 — MRP Unit 07: Shop Floor Control & Manufacturing Execution
-- docs/mrp/07-shop-floor-control.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_shop_floor_workstations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workstation_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'tablet' CHECK (device_type IN ('tablet','kiosk','industrial_pc','mobile','hmi','api')),
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.manufacturing_assets(id) ON DELETE SET NULL,
  sop_url TEXT,
  work_instructions TEXT,
  allow_production_entry BOOLEAN NOT NULL DEFAULT true,
  allow_downtime_entry BOOLEAN NOT NULL DEFAULT true,
  allow_andon BOOLEAN NOT NULL DEFAULT true,
  current_status TEXT NOT NULL DEFAULT 'active' CHECK (current_status IN ('active','locked','down','maintenance','retired')),
  last_seen_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,workstation_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_shop_floor_terminal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_number TEXT NOT NULL,
  workstation_id UUID NOT NULL REFERENCES public.mrp_shop_floor_workstations(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.manufacturing_shifts(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','forced_closed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,session_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_downtime_reason_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('planned','unplanned')),
  reason_type TEXT NOT NULL CHECK (reason_type IN ('machine_breakdown','material_shortage','quality_issue','changeover','planned_maintenance','labor_absence','power_outage','meeting_break','setup','other')),
  parent_id UUID REFERENCES public.mrp_downtime_reason_codes(id) ON DELETE SET NULL,
  oee_loss_bucket TEXT NOT NULL DEFAULT 'availability' CHECK (oee_loss_bucket IN ('availability','performance','quality','excluded')),
  requires_comment BOOLEAN NOT NULL DEFAULT false,
  triggers_maintenance BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,reason_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_downtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  downtime_number TEXT NOT NULL,
  workstation_id UUID REFERENCES public.mrp_shop_floor_workstations(id) ON DELETE SET NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.manufacturing_assets(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  reason_id UUID REFERENCES public.mrp_downtime_reason_codes(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'unplanned' CHECK (category IN ('planned','unplanned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes NUMERIC(14,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  notes TEXT,
  resolution_notes TEXT,
  reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,downtime_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_production_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_number TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'unit_completed' CHECK (event_type IN ('unit_completed','batch_completed','setup_start','setup_end','material_request','quality_issue','scrap','rework')),
  workstation_id UUID REFERENCES public.mrp_shop_floor_workstations(id) ON DELETE SET NULL,
  terminal_session_id UUID REFERENCES public.mrp_shop_floor_terminal_sessions(id) ON DELETE SET NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  lot_code TEXT,
  good_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  scrap_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  rework_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  cycle_time_seconds NUMERIC(14,4),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,event_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_actual_material_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  consumption_number TEXT NOT NULL,
  production_event_id UUID REFERENCES public.mrp_production_events(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  work_order_material_id UUID REFERENCES public.mrp_work_order_materials(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  standard_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  actual_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  variance_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'PCS',
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,consumption_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_labor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assignment_number TEXT NOT NULL,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.manufacturing_shifts(id) ON DELETE SET NULL,
  workstation_id UUID REFERENCES public.mrp_shop_floor_workstations(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  labor_role TEXT NOT NULL DEFAULT 'operator' CHECK (labor_role IN ('operator','helper','setter','quality','maintenance','supervisor')),
  skill_code TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  direct_minutes NUMERIC(14,4) NOT NULL DEFAULT 0,
  downtime_minutes NUMERIC(14,4) NOT NULL DEFAULT 0,
  good_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  scrap_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','working','paused','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,assignment_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_andon_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  andon_number TEXT NOT NULL,
  workstation_id UUID REFERENCES public.mrp_shop_floor_workstations(id) ON DELETE SET NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  downtime_event_id UUID REFERENCES public.mrp_downtime_events(id) ON DELETE SET NULL,
  color TEXT NOT NULL CHECK (color IN ('green','yellow','red','blue','white')),
  signal_type TEXT NOT NULL CHECK (signal_type IN ('normal','attention','stop','material_required','quality_issue','maintenance_required','capacity_full','other')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','urgent','critical')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','cancelled')),
  raised_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,andon_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_shopfloor_maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'breakdown' CHECK (source_type IN ('breakdown','andon','downtime','manual')),
  downtime_event_id UUID REFERENCES public.mrp_downtime_events(id) ON DELETE SET NULL,
  andon_signal_id UUID REFERENCES public.mrp_andon_signals(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.manufacturing_assets(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'urgent' CHECK (severity IN ('info','warning','urgent','critical')),
  problem_description TEXT NOT NULL,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','converted_to_cmms','resolved','cancelled')),
  future_cmms_work_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,request_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_oee_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_number TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  shift_id UUID REFERENCES public.manufacturing_shifts(id) ON DELETE SET NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  workstation_id UUID REFERENCES public.mrp_shop_floor_workstations(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  planned_minutes NUMERIC(14,4) NOT NULL DEFAULT 0,
  downtime_minutes NUMERIC(14,4) NOT NULL DEFAULT 0,
  run_minutes NUMERIC(14,4) NOT NULL DEFAULT 0,
  ideal_cycle_seconds NUMERIC(14,4) NOT NULL DEFAULT 60,
  theoretical_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  good_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  scrap_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  availability_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  performance_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  quality_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  oee_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  calculated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,snapshot_number)
);

CREATE INDEX IF NOT EXISTS idx_mrp_shopfloor_events_tenant_time ON public.mrp_production_events(tenant_id,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrp_shopfloor_events_wo ON public.mrp_production_events(tenant_id,work_order_id);
CREATE INDEX IF NOT EXISTS idx_mrp_downtime_events_tenant_time ON public.mrp_downtime_events(tenant_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrp_andon_open ON public.mrp_andon_signals(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrp_oee_snapshots_period ON public.mrp_oee_snapshots(tenant_id,period_start DESC,period_end DESC);

CREATE OR REPLACE FUNCTION public.upsert_mrp_workstation(p_workstation_code TEXT,p_name_ar TEXT,p_device_type TEXT DEFAULT 'tablet',p_work_center_id UUID DEFAULT NULL,p_asset_id UUID DEFAULT NULL,p_sop_url TEXT DEFAULT NULL,p_work_instructions TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT; v_plant UUID; v_line UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('shopfloor_workstation',p_workstation_code);
  SELECT wc.plant_id,wc.line_id INTO v_plant,v_line FROM public.work_centers wc WHERE wc.id=p_work_center_id AND wc.tenant_id=v_tenant;
  INSERT INTO public.mrp_shop_floor_workstations(tenant_id,workstation_code,name_ar,device_type,plant_id,line_id,work_center_id,asset_id,sop_url,work_instructions,created_by,updated_at)
  VALUES(v_tenant,v_code,p_name_ar,COALESCE(p_device_type,'tablet'),v_plant,v_line,p_work_center_id,p_asset_id,p_sop_url,p_work_instructions,auth.uid(),NOW())
  ON CONFLICT (tenant_id,workstation_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,device_type=EXCLUDED.device_type,plant_id=EXCLUDED.plant_id,line_id=EXCLUDED.line_id,work_center_id=EXCLUDED.work_center_id,asset_id=EXCLUDED.asset_id,sop_url=EXCLUDED.sop_url,work_instructions=EXCLUDED.work_instructions,updated_at=NOW()
  RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('shopfloor','mrp_shop_floor_workstations',v_id,'upsert',NULL,jsonb_build_object('workstation_code',v_code),'إنشاء/تحديث محطة أرضية المصنع');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_workstation(TEXT,TEXT,TEXT,UUID,UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_mrp_terminal_session(p_workstation_id UUID,p_shift_id UUID DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.mrp_shop_floor_workstations WHERE id=p_workstation_id AND tenant_id=v_tenant AND current_status IN ('active','locked')) THEN RAISE EXCEPTION 'WORKSTATION_NOT_FOUND_OR_INACTIVE'; END IF;
  INSERT INTO public.mrp_shop_floor_terminal_sessions(tenant_id,session_number,workstation_id,shift_id,operator_id,notes)
  VALUES(v_tenant,public.generate_mrp_next_code('shopfloor_session',NULL),p_workstation_id,p_shift_id,auth.uid(),p_notes) RETURNING id INTO v_id;
  UPDATE public.mrp_shop_floor_workstations SET last_seen_at=NOW() WHERE id=p_workstation_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.open_mrp_terminal_session(UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_terminal_session(p_session_id UUID,p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_shop_floor_terminal_sessions SET status='closed',closed_at=NOW(),notes=COALESCE(p_notes,notes) WHERE id=p_session_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'TERMINAL_SESSION_NOT_OPEN'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_terminal_session(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_mrp_operation(p_work_order_operation_id UUID,p_workstation_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_wo UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT work_order_id INTO v_wo FROM public.mrp_work_order_operations WHERE id=p_work_order_operation_id AND tenant_id=v_tenant;
  IF v_wo IS NULL THEN RAISE EXCEPTION 'WORK_ORDER_OPERATION_NOT_FOUND'; END IF;
  UPDATE public.mrp_work_order_operations SET status='in_progress',actual_start_at=COALESCE(actual_start_at,NOW()) WHERE id=p_work_order_operation_id AND tenant_id=v_tenant;
  UPDATE public.mrp_work_orders SET status='in_progress',actual_start_at=COALESCE(actual_start_at,NOW()),updated_at=NOW() WHERE id=v_wo AND tenant_id=v_tenant AND status IN ('released','material_reserved','planned','firmed','paused','on_hold','in_progress');
  IF p_workstation_id IS NOT NULL THEN UPDATE public.mrp_shop_floor_workstations SET last_seen_at=NOW(),current_status='active' WHERE id=p_workstation_id AND tenant_id=v_tenant; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.start_mrp_operation(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_mrp_downtime(p_reason_id UUID,p_workstation_id UUID DEFAULT NULL,p_work_order_operation_id UUID DEFAULT NULL,p_asset_id UUID DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_reason RECORD; v_plant UUID; v_line UUID; v_ws_wc UUID; v_ws_asset UUID; v_wo UUID; v_op_wc UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT * INTO v_reason FROM public.mrp_downtime_reason_codes WHERE id=p_reason_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOWNTIME_REASON_NOT_FOUND'; END IF;
  SELECT plant_id,line_id,work_center_id,asset_id INTO v_plant,v_line,v_ws_wc,v_ws_asset FROM public.mrp_shop_floor_workstations WHERE id=p_workstation_id AND tenant_id=v_tenant;
  SELECT work_order_id,work_center_id INTO v_wo,v_op_wc FROM public.mrp_work_order_operations WHERE id=p_work_order_operation_id AND tenant_id=v_tenant;
  INSERT INTO public.mrp_downtime_events(tenant_id,downtime_number,workstation_id,plant_id,line_id,work_center_id,asset_id,work_order_id,operation_id,reason_id,category,notes,reported_by)
  VALUES(v_tenant,public.generate_mrp_next_code('downtime',NULL),p_workstation_id,v_plant,v_line,COALESCE(v_op_wc,v_ws_wc),COALESCE(p_asset_id,v_ws_asset),v_wo,p_work_order_operation_id,p_reason_id,v_reason.category,p_notes,auth.uid()) RETURNING id INTO v_id;
  IF p_work_order_operation_id IS NOT NULL THEN UPDATE public.mrp_work_order_operations SET status='paused' WHERE id=p_work_order_operation_id AND tenant_id=v_tenant; END IF;
  IF v_wo IS NOT NULL THEN UPDATE public.mrp_work_orders SET status='paused',updated_at=NOW() WHERE id=v_wo AND tenant_id=v_tenant; END IF;
  IF p_workstation_id IS NOT NULL THEN UPDATE public.mrp_shop_floor_workstations SET current_status=CASE WHEN v_reason.triggers_maintenance THEN 'down' ELSE current_status END,last_seen_at=NOW() WHERE id=p_workstation_id AND tenant_id=v_tenant; END IF;
  IF v_reason.triggers_maintenance THEN PERFORM public.create_mrp_breakdown_maintenance_request(v_id,COALESCE(p_asset_id,v_ws_asset),COALESCE(v_op_wc,v_ws_wc),'urgent',COALESCE(p_notes,v_reason.name_ar)); END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_mrp_downtime(UUID,UUID,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_mrp_downtime(p_downtime_event_id UUID,p_resolution_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_op UUID; v_wo UUID; v_ws UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT operation_id,work_order_id,workstation_id INTO v_op,v_wo,v_ws FROM public.mrp_downtime_events WHERE id=p_downtime_event_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'DOWNTIME_EVENT_NOT_OPEN'; END IF;
  UPDATE public.mrp_downtime_events SET status='closed',ended_at=NOW(),duration_minutes=ROUND((EXTRACT(EPOCH FROM (NOW()-started_at))/60)::NUMERIC,4),resolution_notes=p_resolution_notes,closed_by=auth.uid() WHERE id=p_downtime_event_id AND tenant_id=v_tenant;
  IF v_op IS NOT NULL THEN UPDATE public.mrp_work_order_operations SET status='in_progress' WHERE id=v_op AND tenant_id=v_tenant AND status='paused'; END IF;
  IF v_wo IS NOT NULL THEN UPDATE public.mrp_work_orders SET status='in_progress',updated_at=NOW() WHERE id=v_wo AND tenant_id=v_tenant AND status='paused'; END IF;
  IF v_ws IS NOT NULL THEN UPDATE public.mrp_shop_floor_workstations SET current_status='active',last_seen_at=NOW() WHERE id=v_ws AND tenant_id=v_tenant AND current_status='down'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.end_mrp_downtime(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.pause_mrp_operation(p_work_order_operation_id UUID,p_reason_id UUID,p_workstation_id UUID DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.start_mrp_downtime(p_reason_id,p_workstation_id,p_work_order_operation_id,NULL,p_notes);
END $$;
GRANT EXECUTE ON FUNCTION public.pause_mrp_operation(UUID,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resume_mrp_operation(p_downtime_event_id UUID,p_resolution_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.end_mrp_downtime(p_downtime_event_id,p_resolution_notes);
END $$;
GRANT EXECUTE ON FUNCTION public.resume_mrp_operation(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_production_event(p_work_order_operation_id UUID,p_workstation_id UUID,p_event_type TEXT,p_good_qty NUMERIC DEFAULT 0,p_scrap_qty NUMERIC DEFAULT 0,p_rework_qty NUMERIC DEFAULT 0,p_cycle_time_seconds NUMERIC DEFAULT NULL,p_lot_code TEXT DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_op RECORD; v_item UUID; v_plant UUID; v_line UUID; v_ws_wc UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT o.*, wo.item_id INTO v_op FROM public.mrp_work_order_operations o JOIN public.mrp_work_orders wo ON wo.id=o.work_order_id AND wo.tenant_id=o.tenant_id WHERE o.id=p_work_order_operation_id AND o.tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_OPERATION_NOT_FOUND'; END IF;
  v_item := v_op.item_id;
  SELECT plant_id,line_id,work_center_id INTO v_plant,v_line,v_ws_wc FROM public.mrp_shop_floor_workstations WHERE id=p_workstation_id AND tenant_id=v_tenant;
  INSERT INTO public.mrp_production_events(tenant_id,event_number,event_type,workstation_id,plant_id,line_id,work_center_id,work_order_id,operation_id,item_id,lot_code,good_qty,scrap_qty,rework_qty,cycle_time_seconds,recorded_by,notes)
  VALUES(v_tenant,public.generate_mrp_next_code('production_event',NULL),COALESCE(p_event_type,'unit_completed'),p_workstation_id,v_plant,v_line,COALESCE(v_ws_wc,v_op.work_center_id),v_op.work_order_id,p_work_order_operation_id,v_item,p_lot_code,COALESCE(p_good_qty,0),COALESCE(p_scrap_qty,0),COALESCE(p_rework_qty,0),p_cycle_time_seconds,auth.uid(),p_notes) RETURNING id INTO v_id;
  UPDATE public.mrp_work_order_operations SET quantity_completed=quantity_completed+COALESCE(p_good_qty,0),quantity_scrapped=quantity_scrapped+COALESCE(p_scrap_qty,0),status=CASE WHEN quantity_completed+COALESCE(p_good_qty,0) >= (SELECT quantity_to_produce FROM public.mrp_work_orders WHERE id=v_op.work_order_id AND tenant_id=v_tenant) THEN 'completed' ELSE 'in_progress' END,actual_start_at=COALESCE(actual_start_at,NOW()),actual_end_at=CASE WHEN quantity_completed+COALESCE(p_good_qty,0) >= (SELECT quantity_to_produce FROM public.mrp_work_orders WHERE id=v_op.work_order_id AND tenant_id=v_tenant) THEN NOW() ELSE actual_end_at END WHERE id=p_work_order_operation_id AND tenant_id=v_tenant;
  UPDATE public.mrp_work_orders SET quantity_completed=quantity_completed+COALESCE(p_good_qty,0),quantity_scrapped=quantity_scrapped+COALESCE(p_scrap_qty,0),status=CASE WHEN quantity_completed+COALESCE(p_good_qty,0) >= quantity_to_produce THEN 'completed' ELSE 'in_progress' END,actual_start_at=COALESCE(actual_start_at,NOW()),actual_end_at=CASE WHEN quantity_completed+COALESCE(p_good_qty,0) >= quantity_to_produce THEN NOW() ELSE actual_end_at END,updated_at=NOW() WHERE id=v_op.work_order_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_production_event(UUID,UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_actual_material_consumption(p_production_event_id UUID,p_work_order_material_id UUID,p_actual_qty NUMERIC,p_standard_qty NUMERIC DEFAULT NULL,p_lot_id UUID DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_ev RECORD; v_mat RECORD; v_std NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT * INTO v_ev FROM public.mrp_production_events WHERE id=p_production_event_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_EVENT_NOT_FOUND'; END IF;
  SELECT * INTO v_mat FROM public.mrp_work_order_materials WHERE id=p_work_order_material_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_MATERIAL_NOT_FOUND'; END IF;
  v_std := COALESCE(p_standard_qty,v_mat.required_qty);
  INSERT INTO public.mrp_actual_material_consumption(tenant_id,consumption_number,production_event_id,work_order_id,operation_id,work_order_material_id,item_id,standard_qty,actual_qty,variance_qty,uom,lot_id,recorded_by,notes)
  VALUES(v_tenant,public.generate_mrp_next_code('actual_consumption',NULL),p_production_event_id,v_ev.work_order_id,v_ev.operation_id,p_work_order_material_id,v_mat.item_id,v_std,COALESCE(p_actual_qty,0),COALESCE(p_actual_qty,0)-COALESCE(v_std,0),v_mat.uom,p_lot_id,auth.uid(),p_notes) RETURNING id INTO v_id;
  UPDATE public.mrp_work_order_materials SET consumed_qty=consumed_qty+COALESCE(p_actual_qty,0),status='consumed' WHERE id=p_work_order_material_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_actual_material_consumption(UUID,UUID,NUMERIC,NUMERIC,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_mrp_labor_to_operation(p_worker_id UUID,p_work_order_operation_id UUID,p_shift_id UUID DEFAULT NULL,p_workstation_id UUID DEFAULT NULL,p_labor_role TEXT DEFAULT 'operator',p_skill_code TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_op RECORD; v_wc UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT * INTO v_op FROM public.mrp_work_order_operations WHERE id=p_work_order_operation_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_OPERATION_NOT_FOUND'; END IF;
  v_wc := v_op.work_center_id;
  IF p_workstation_id IS NOT NULL THEN SELECT work_center_id INTO v_wc FROM public.mrp_shop_floor_workstations WHERE id=p_workstation_id AND tenant_id=v_tenant; END IF;
  INSERT INTO public.mrp_labor_assignments(tenant_id,assignment_number,worker_id,shift_id,workstation_id,work_center_id,work_order_id,operation_id,labor_role,skill_code,started_at,status)
  VALUES(v_tenant,public.generate_mrp_next_code('labor_assignment',NULL),p_worker_id,p_shift_id,p_workstation_id,v_wc,v_op.work_order_id,p_work_order_operation_id,COALESCE(p_labor_role,'operator'),p_skill_code,NOW(),'working') RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.assign_mrp_labor_to_operation(UUID,UUID,UUID,UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_labor_assignment(p_assignment_id UUID,p_good_qty NUMERIC DEFAULT 0,p_scrap_qty NUMERIC DEFAULT 0,p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_start TIMESTAMPTZ;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT started_at INTO v_start FROM public.mrp_labor_assignments WHERE id=p_assignment_id AND tenant_id=v_tenant AND status IN ('assigned','working','paused');
  IF NOT FOUND THEN RAISE EXCEPTION 'LABOR_ASSIGNMENT_NOT_OPEN'; END IF;
  UPDATE public.mrp_labor_assignments SET status='completed',ended_at=NOW(),direct_minutes=ROUND((EXTRACT(EPOCH FROM (NOW()-COALESCE(v_start,assigned_at)))/60)::NUMERIC,4),good_qty=COALESCE(p_good_qty,0),scrap_qty=COALESCE(p_scrap_qty,0),notes=COALESCE(p_notes,notes) WHERE id=p_assignment_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_labor_assignment(UUID,NUMERIC,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.raise_mrp_andon_signal(p_workstation_id UUID,p_work_order_id UUID,p_operation_id UUID,p_color TEXT,p_signal_type TEXT,p_title TEXT,p_description TEXT DEFAULT NULL,p_create_downtime BOOLEAN DEFAULT false,p_reason_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_dt UUID; v_sev TEXT; v_plant UUID; v_line UUID; v_wc UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT plant_id,line_id,work_center_id INTO v_plant,v_line,v_wc FROM public.mrp_shop_floor_workstations WHERE id=p_workstation_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKSTATION_NOT_FOUND'; END IF;
  v_sev := CASE WHEN p_color='red' THEN 'critical' WHEN p_color IN ('yellow','blue') THEN 'warning' ELSE 'info' END;
  IF p_create_downtime AND p_reason_id IS NOT NULL THEN v_dt := public.start_mrp_downtime(p_reason_id,p_workstation_id,p_operation_id,NULL,p_description); END IF;
  INSERT INTO public.mrp_andon_signals(tenant_id,andon_number,workstation_id,plant_id,line_id,work_center_id,work_order_id,operation_id,downtime_event_id,color,signal_type,severity,title,description,raised_by)
  VALUES(v_tenant,public.generate_mrp_next_code('andon',NULL),p_workstation_id,v_plant,v_line,v_wc,p_work_order_id,p_operation_id,v_dt,p_color,p_signal_type,v_sev,p_title,p_description,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.raise_mrp_andon_signal(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,BOOLEAN,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_mrp_andon_signal(p_signal_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_andon_signals SET status='acknowledged',acknowledged_by=auth.uid(),acknowledged_at=NOW() WHERE id=p_signal_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'ANDON_SIGNAL_NOT_OPEN'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.acknowledge_mrp_andon_signal(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_mrp_andon_signal(p_signal_id UUID,p_resolution_notes TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_dt UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT downtime_event_id INTO v_dt FROM public.mrp_andon_signals WHERE id=p_signal_id AND tenant_id=v_tenant;
  UPDATE public.mrp_andon_signals SET status='resolved',resolved_by=auth.uid(),resolved_at=NOW(),resolution_notes=p_resolution_notes WHERE id=p_signal_id AND tenant_id=v_tenant AND status IN ('open','acknowledged');
  IF NOT FOUND THEN RAISE EXCEPTION 'ANDON_SIGNAL_NOT_ACTIVE'; END IF;
  IF v_dt IS NOT NULL THEN PERFORM public.end_mrp_downtime(v_dt,p_resolution_notes); END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.resolve_mrp_andon_signal(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.raise_mrp_quality_issue_from_floor(p_work_order_id UUID,p_operation_id UUID,p_item_id UUID,p_description TEXT,p_affected_qty NUMERIC,p_defect_class TEXT DEFAULT 'major')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_ncr UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.mrp_work_orders WHERE id=p_work_order_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  v_ncr := public.create_mrp_quality_ncr(NULL,p_item_id,NULL,p_work_order_id,p_defect_class,'shop_floor_issue',p_description,COALESCE(p_affected_qty,0),'فتح من أرضية المصنع');
  INSERT INTO public.mrp_production_events(tenant_id,event_number,event_type,work_order_id,operation_id,item_id,scrap_qty,recorded_by,notes)
  VALUES(v_tenant,public.generate_mrp_next_code('production_event',NULL),'quality_issue',p_work_order_id,p_operation_id,p_item_id,COALESCE(p_affected_qty,0),auth.uid(),p_description);
  RETURN v_ncr;
END $$;
GRANT EXECUTE ON FUNCTION public.raise_mrp_quality_issue_from_floor(UUID,UUID,UUID,TEXT,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_breakdown_maintenance_request(p_downtime_event_id UUID,p_asset_id UUID,p_work_center_id UUID,p_severity TEXT,p_description TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_dt_asset UUID; v_dt_wc UUID; v_dt_wo UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT asset_id,work_center_id,work_order_id INTO v_dt_asset,v_dt_wc,v_dt_wo FROM public.mrp_downtime_events WHERE id=p_downtime_event_id AND tenant_id=v_tenant;
  INSERT INTO public.mrp_shopfloor_maintenance_requests(tenant_id,request_number,source_type,downtime_event_id,asset_id,work_center_id,work_order_id,severity,problem_description,requested_by)
  VALUES(v_tenant,public.generate_mrp_next_code('maintenance_request',NULL),'breakdown',p_downtime_event_id,COALESCE(p_asset_id,v_dt_asset),COALESCE(p_work_center_id,v_dt_wc),v_dt_wo,COALESCE(p_severity,'urgent'),p_description,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_breakdown_maintenance_request(UUID,UUID,UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_mrp_oee_snapshot(p_work_center_id UUID,p_period_start TIMESTAMPTZ,p_period_end TIMESTAMPTZ,p_shift_id UUID DEFAULT NULL,p_work_order_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_wc RECORD; v_planned NUMERIC; v_down NUMERIC; v_run NUMERIC; v_good NUMERIC; v_scrap NUMERIC; v_total NUMERIC; v_ideal NUMERIC; v_theory NUMERIC; v_av NUMERIC; v_perf NUMERIC; v_qual NUMERIC; v_oee NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT plant_id,line_id INTO v_wc FROM public.work_centers WHERE id=p_work_center_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_CENTER_NOT_FOUND'; END IF;
  v_planned := GREATEST(ROUND((EXTRACT(EPOCH FROM (p_period_end-p_period_start))/60)::NUMERIC,4),0);
  SELECT COALESCE(SUM(CASE WHEN status='open' THEN EXTRACT(EPOCH FROM (NOW()-started_at))/60 ELSE duration_minutes END),0) INTO v_down FROM public.mrp_downtime_events WHERE tenant_id=v_tenant AND work_center_id=p_work_center_id AND started_at < p_period_end AND COALESCE(ended_at,NOW()) > p_period_start AND category='unplanned';
  v_run := GREATEST(v_planned-COALESCE(v_down,0),0);
  SELECT COALESCE(SUM(good_qty),0),COALESCE(SUM(scrap_qty),0),COALESCE(SUM(good_qty+scrap_qty+rework_qty),0) INTO v_good,v_scrap,v_total FROM public.mrp_production_events WHERE tenant_id=v_tenant AND work_center_id=p_work_center_id AND event_at BETWEEN p_period_start AND p_period_end AND (p_work_order_id IS NULL OR work_order_id=p_work_order_id);
  SELECT COALESCE(NULLIF(AVG(NULLIF(run_minutes_per_unit,0))*60,0),60) INTO v_ideal FROM public.mrp_work_order_operations WHERE tenant_id=v_tenant AND work_center_id=p_work_center_id;
  v_theory := CASE WHEN v_ideal>0 THEN (v_run*60)/v_ideal ELSE 0 END;
  v_av := CASE WHEN v_planned>0 THEN ROUND((v_run/v_planned)*100,4) ELSE 0 END;
  v_perf := CASE WHEN v_theory>0 THEN ROUND((v_total/v_theory)*100,4) ELSE 0 END;
  v_qual := CASE WHEN v_total>0 THEN ROUND((v_good/v_total)*100,4) ELSE 0 END;
  v_oee := ROUND((v_av/100)*(v_perf/100)*(v_qual/100)*100,4);
  INSERT INTO public.mrp_oee_snapshots(tenant_id,snapshot_number,period_start,period_end,shift_id,plant_id,line_id,work_center_id,work_order_id,planned_minutes,downtime_minutes,run_minutes,ideal_cycle_seconds,theoretical_qty,total_qty,good_qty,scrap_qty,availability_percent,performance_percent,quality_percent,oee_percent,calculated_by)
  VALUES(v_tenant,public.generate_mrp_next_code('oee_snapshot',NULL),p_period_start,p_period_end,p_shift_id,v_wc.plant_id,v_wc.line_id,p_work_center_id,p_work_order_id,v_planned,COALESCE(v_down,0),v_run,v_ideal,v_theory,v_total,v_good,v_scrap,v_av,v_perf,v_qual,v_oee,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_mrp_oee_snapshot(UUID,TIMESTAMPTZ,TIMESTAMPTZ,UUID,UUID) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_shop_floor_workstations','mrp_shop_floor_terminal_sessions','mrp_downtime_reason_codes','mrp_downtime_events','mrp_production_events','mrp_actual_material_consumption','mrp_labor_assignments','mrp_andon_signals','mrp_shopfloor_maintenance_requests','mrp_oee_snapshots'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''inventory'',''procurement'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_shop_floor_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_shop_floor_workstations WHERE tenant_id=public.current_user_tenant_id() AND current_status='active') AS active_workstations,
  (SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status='in_progress') AS work_orders_in_progress,
  (SELECT COUNT(*) FROM public.mrp_downtime_events WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_downtime_events,
  (SELECT COUNT(*) FROM public.mrp_andon_signals WHERE tenant_id=public.current_user_tenant_id() AND status IN ('open','acknowledged')) AS active_andon_signals,
  (SELECT ROUND(AVG(oee_percent),2) FROM public.mrp_oee_snapshots WHERE tenant_id=public.current_user_tenant_id() AND period_end >= NOW()-INTERVAL '24 hours') AS avg_oee_24h;
GRANT SELECT ON public.mrp_shop_floor_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_digital_workstation_board WITH (security_invoker=true) AS
SELECT ws.*, wc.work_center_code,wc.name_ar AS work_center_name, pl.line_code, pl.name_ar AS line_name, a.asset_code, a.name_ar AS asset_name,
  (SELECT COUNT(*) FROM public.mrp_shop_floor_terminal_sessions s WHERE s.tenant_id=ws.tenant_id AND s.workstation_id=ws.id AND s.status='open') AS open_sessions,
  (SELECT COUNT(*) FROM public.mrp_andon_signals an WHERE an.tenant_id=ws.tenant_id AND an.workstation_id=ws.id AND an.status IN ('open','acknowledged')) AS active_andon
FROM public.mrp_shop_floor_workstations ws
LEFT JOIN public.work_centers wc ON wc.id=ws.work_center_id AND wc.tenant_id=ws.tenant_id
LEFT JOIN public.production_lines pl ON pl.id=ws.line_id AND pl.tenant_id=ws.tenant_id
LEFT JOIN public.manufacturing_assets a ON a.id=ws.asset_id AND a.tenant_id=ws.tenant_id
WHERE ws.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_digital_workstation_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_real_time_production_tracking WITH (security_invoker=true) AS
SELECT e.*, wo.work_order_number, wo.quantity_to_produce, wo.quantity_completed AS wo_completed_qty, wo.quantity_scrapped AS wo_scrapped_qty,
  ROUND((wo.quantity_completed/NULLIF(wo.quantity_to_produce,0))*100,2) AS completion_percent,
  op.sequence_no, op.operation_name, wc.work_center_code, wc.name_ar AS work_center_name, i.item_code, i.name_ar AS item_name
FROM public.mrp_production_events e
JOIN public.mrp_work_orders wo ON wo.id=e.work_order_id AND wo.tenant_id=e.tenant_id
LEFT JOIN public.mrp_work_order_operations op ON op.id=e.operation_id AND op.tenant_id=e.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=e.work_center_id AND wc.tenant_id=e.tenant_id
LEFT JOIN public.inventory_items i ON i.id=e.item_id AND i.tenant_id=e.tenant_id
WHERE e.tenant_id=public.current_user_tenant_id()
ORDER BY e.event_at DESC;
GRANT SELECT ON public.mrp_real_time_production_tracking TO authenticated;

CREATE OR REPLACE VIEW public.mrp_actual_vs_standard_consumption WITH (security_invoker=true) AS
SELECT c.*, wo.work_order_number, i.item_code, i.name_ar AS item_name, pe.event_number,
  ROUND((c.variance_qty/NULLIF(c.standard_qty,0))*100,2) AS variance_percent
FROM public.mrp_actual_material_consumption c
LEFT JOIN public.mrp_work_orders wo ON wo.id=c.work_order_id AND wo.tenant_id=c.tenant_id
LEFT JOIN public.inventory_items i ON i.id=c.item_id AND i.tenant_id=c.tenant_id
LEFT JOIN public.mrp_production_events pe ON pe.id=c.production_event_id AND pe.tenant_id=c.tenant_id
WHERE c.tenant_id=public.current_user_tenant_id()
ORDER BY c.consumed_at DESC;
GRANT SELECT ON public.mrp_actual_vs_standard_consumption TO authenticated;

CREATE OR REPLACE VIEW public.mrp_oee_dashboard WITH (security_invoker=true) AS
SELECT o.*, wc.work_center_code,wc.name_ar AS work_center_name, pl.line_code, pl.name_ar AS line_name, wo.work_order_number,
  CASE WHEN o.oee_percent < 65 THEN 'needs_improvement' WHEN o.oee_percent < 75 THEN 'good' WHEN o.oee_percent < 85 THEN 'excellent' ELSE 'world_class' END AS oee_classification
FROM public.mrp_oee_snapshots o
LEFT JOIN public.work_centers wc ON wc.id=o.work_center_id AND wc.tenant_id=o.tenant_id
LEFT JOIN public.production_lines pl ON pl.id=o.line_id AND pl.tenant_id=o.tenant_id
LEFT JOIN public.mrp_work_orders wo ON wo.id=o.work_order_id AND wo.tenant_id=o.tenant_id
WHERE o.tenant_id=public.current_user_tenant_id()
ORDER BY o.period_end DESC;
GRANT SELECT ON public.mrp_oee_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_downtime_dashboard WITH (security_invoker=true) AS
SELECT d.*, r.reason_code,r.name_ar AS reason_name,r.reason_type,r.oee_loss_bucket, wc.work_center_code,wc.name_ar AS work_center_name, wo.work_order_number,
  CASE WHEN d.status='open' THEN ROUND((EXTRACT(EPOCH FROM (NOW()-d.started_at))/60)::NUMERIC,2) ELSE d.duration_minutes END AS live_duration_minutes
FROM public.mrp_downtime_events d
LEFT JOIN public.mrp_downtime_reason_codes r ON r.id=d.reason_id AND r.tenant_id=d.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=d.work_center_id AND wc.tenant_id=d.tenant_id
LEFT JOIN public.mrp_work_orders wo ON wo.id=d.work_order_id AND wo.tenant_id=d.tenant_id
WHERE d.tenant_id=public.current_user_tenant_id()
ORDER BY d.started_at DESC;
GRANT SELECT ON public.mrp_downtime_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_downtime_pareto WITH (security_invoker=true) AS
SELECT reason_code,reason_name,reason_type,category,COUNT(*) AS event_count,ROUND(SUM(live_duration_minutes),2) AS total_minutes,
  ROUND((SUM(live_duration_minutes)/NULLIF(SUM(SUM(live_duration_minutes)) OVER (),0))*100,2) AS percent_of_total,
  ROUND((SUM(SUM(live_duration_minutes)) OVER (ORDER BY SUM(live_duration_minutes) DESC)/NULLIF(SUM(SUM(live_duration_minutes)) OVER (),0))*100,2) AS cumulative_percent
FROM public.mrp_downtime_dashboard
GROUP BY reason_code,reason_name,reason_type,category
ORDER BY total_minutes DESC;
GRANT SELECT ON public.mrp_downtime_pareto TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_order_execution_status WITH (security_invoker=true) AS
SELECT wo.id,wo.tenant_id,wo.work_order_number,wo.status,wo.priority,wo.quantity_to_produce,wo.quantity_completed,wo.quantity_scrapped,
  GREATEST(wo.quantity_to_produce-wo.quantity_completed,0) AS remaining_qty,
  ROUND((wo.quantity_completed/NULLIF(wo.quantity_to_produce,0))*100,2) AS progress_percent,
  wo.critical_ratio,wo.due_at,i.item_code,i.name_ar AS item_name, pl.line_code,
  (SELECT COUNT(*) FROM public.mrp_work_order_operations o WHERE o.tenant_id=wo.tenant_id AND o.work_order_id=wo.id AND o.status IN ('pending','ready','blocked')) AS pending_operations,
  (SELECT COUNT(*) FROM public.mrp_downtime_events d WHERE d.tenant_id=wo.tenant_id AND d.work_order_id=wo.id AND d.status='open') AS open_downtime,
  (SELECT COUNT(*) FROM public.mrp_andon_signals a WHERE a.tenant_id=wo.tenant_id AND a.work_order_id=wo.id AND a.status IN ('open','acknowledged')) AS active_andon
FROM public.mrp_work_orders wo
LEFT JOIN public.inventory_items i ON i.id=wo.item_id AND i.tenant_id=wo.tenant_id
LEFT JOIN public.production_lines pl ON pl.id=wo.line_id AND pl.tenant_id=wo.tenant_id
WHERE wo.tenant_id=public.current_user_tenant_id()
ORDER BY wo.due_at NULLS LAST, wo.created_at DESC;
GRANT SELECT ON public.mrp_work_order_execution_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_labor_shift_dashboard WITH (security_invoker=true) AS
SELECT la.*, sh.shift_code, sh.name_ar AS shift_name, wc.work_center_code, wc.name_ar AS work_center_name, wo.work_order_number,
  ROUND((la.good_qty/NULLIF(la.direct_minutes,0))*60,4) AS units_per_hour
FROM public.mrp_labor_assignments la
LEFT JOIN public.manufacturing_shifts sh ON sh.id=la.shift_id AND sh.tenant_id=la.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=la.work_center_id AND wc.tenant_id=la.tenant_id
LEFT JOIN public.mrp_work_orders wo ON wo.id=la.work_order_id AND wo.tenant_id=la.tenant_id
WHERE la.tenant_id=public.current_user_tenant_id()
ORDER BY la.assigned_at DESC;
GRANT SELECT ON public.mrp_labor_shift_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_andon_board WITH (security_invoker=true) AS
SELECT a.*, ws.workstation_code,ws.name_ar AS workstation_name, wc.work_center_code,wc.name_ar AS work_center_name, wo.work_order_number,
  CASE WHEN a.status IN ('open','acknowledged') THEN ROUND((EXTRACT(EPOCH FROM (NOW()-a.created_at))/60)::NUMERIC,2) ELSE ROUND((EXTRACT(EPOCH FROM (COALESCE(a.resolved_at,a.created_at)-a.created_at))/60)::NUMERIC,2) END AS age_minutes
FROM public.mrp_andon_signals a
LEFT JOIN public.mrp_shop_floor_workstations ws ON ws.id=a.workstation_id AND ws.tenant_id=a.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=a.work_center_id AND wc.tenant_id=a.tenant_id
LEFT JOIN public.mrp_work_orders wo ON wo.id=a.work_order_id AND wo.tenant_id=a.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id()
ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END, a.created_at DESC;
GRANT SELECT ON public.mrp_andon_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_supervisor_dashboard WITH (security_invoker=true) AS
SELECT wc.tenant_id,wc.id AS work_center_id,wc.work_center_code,wc.name_ar AS work_center_name,
  (SELECT ROUND(AVG(oee_percent),2) FROM public.mrp_oee_snapshots o WHERE o.tenant_id=wc.tenant_id AND o.work_center_id=wc.id AND o.period_end>=NOW()-INTERVAL '24 hours') AS oee_24h,
  (SELECT COALESCE(SUM(good_qty),0) FROM public.mrp_production_events e WHERE e.tenant_id=wc.tenant_id AND e.work_center_id=wc.id AND e.event_at>=NOW()-INTERVAL '24 hours') AS good_qty_24h,
  (SELECT COALESCE(SUM(CASE WHEN status='open' THEN EXTRACT(EPOCH FROM (NOW()-started_at))/60 ELSE duration_minutes END),0) FROM public.mrp_downtime_events d WHERE d.tenant_id=wc.tenant_id AND d.work_center_id=wc.id AND d.started_at>=NOW()-INTERVAL '24 hours') AS downtime_minutes_24h,
  (SELECT COUNT(*) FROM public.mrp_andon_signals a WHERE a.tenant_id=wc.tenant_id AND a.work_center_id=wc.id AND a.status IN ('open','acknowledged')) AS active_andon
FROM public.work_centers wc
WHERE wc.tenant_id=public.current_user_tenant_id()
ORDER BY wc.work_center_code;
GRANT SELECT ON public.mrp_supervisor_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_production_manager_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status IN ('released','material_reserved','in_progress','paused')) AS active_work_orders,
  (SELECT COALESCE(SUM(quantity_completed),0) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND actual_start_at>=CURRENT_DATE) AS completed_today,
  (SELECT ROUND(AVG(oee_percent),2) FROM public.mrp_oee_snapshots WHERE tenant_id=public.current_user_tenant_id() AND period_end>=NOW()-INTERVAL '24 hours') AS avg_oee_24h,
  (SELECT COUNT(*) FROM public.mrp_downtime_events WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_downtime,
  (SELECT COUNT(*) FROM public.mrp_shopfloor_maintenance_requests WHERE tenant_id=public.current_user_tenant_id() AND status IN ('open','triaged')) AS open_maintenance_requests,
  (SELECT COUNT(*) FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','cancelled')) AS open_quality_ncr;
GRANT SELECT ON public.mrp_production_manager_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_shopfloor_maintenance_queue WITH (security_invoker=true) AS
SELECT r.*, a.asset_code,a.name_ar AS asset_name,wc.work_center_code,wc.name_ar AS work_center_name,wo.work_order_number,d.downtime_number
FROM public.mrp_shopfloor_maintenance_requests r
LEFT JOIN public.manufacturing_assets a ON a.id=r.asset_id AND a.tenant_id=r.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=r.work_center_id AND wc.tenant_id=r.tenant_id
LEFT JOIN public.mrp_work_orders wo ON wo.id=r.work_order_id AND wo.tenant_id=r.tenant_id
LEFT JOIN public.mrp_downtime_events d ON d.id=r.downtime_event_id AND d.tenant_id=r.tenant_id
WHERE r.tenant_id=public.current_user_tenant_id()
ORDER BY CASE r.severity WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END, r.requested_at DESC;
GRANT SELECT ON public.mrp_shopfloor_maintenance_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_shopfloor_kpis WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT ROUND(AVG(oee_percent),2) FROM public.mrp_oee_snapshots WHERE tenant_id=public.current_user_tenant_id() AND period_end>=NOW()-INTERVAL '30 days') AS avg_oee_30d,
  (SELECT ROUND((SUM(quantity_completed)/NULLIF(SUM(quantity_to_produce),0))*100,2) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status IN ('completed','closed')) AS schedule_attainment_percent,
  (SELECT ROUND(AVG(cycle_time_seconds),2) FROM public.mrp_production_events WHERE tenant_id=public.current_user_tenant_id() AND cycle_time_seconds IS NOT NULL) AS avg_cycle_time_seconds,
  (SELECT ROUND(SUM(CASE WHEN status='open' THEN EXTRACT(EPOCH FROM (NOW()-started_at))/60 ELSE duration_minutes END)/NULLIF(COUNT(*) FILTER (WHERE category='unplanned'),0),2) FROM public.mrp_downtime_events WHERE tenant_id=public.current_user_tenant_id()) AS mttr_minutes_proxy,
  (SELECT ROUND(NULLIF(SUM(run_minutes),0)/NULLIF((SELECT COUNT(*) FROM public.mrp_downtime_events WHERE tenant_id=public.current_user_tenant_id() AND category='unplanned'),0),2) FROM public.mrp_oee_snapshots WHERE tenant_id=public.current_user_tenant_id()) AS mtbf_minutes_proxy;
GRANT SELECT ON public.mrp_shopfloor_kpis TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_shop_floor_workstations') IS NULL OR to_regclass('public.mrp_production_events') IS NULL OR to_regclass('public.mrp_downtime_events') IS NULL OR to_regclass('public.mrp_andon_signals') IS NULL OR to_regprocedure('public.record_mrp_production_event(uuid,uuid,text,numeric,numeric,numeric,numeric,text,text)') IS NULL THEN
    RAISE EXCEPTION '0225 failed: MRP shop floor control objects missing';
  END IF;
  RAISE NOTICE '✅ 0225: MRP shop floor control and MES execution applied';
END $$;
