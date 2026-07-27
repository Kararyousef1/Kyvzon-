-- ============================================================================
-- 0207 — Inventory Unit 03: Picking Operations & Order Fulfillment
-- التوثيق: docs/inventory/03-picking-operations-fulfillment.md
-- الملحق: docs/inventory/03-picking-operations-technical-checklist.md
-- يغطي: pick orders, methods, smart pick lists, scan-to-confirm, exceptions,
-- waves, task interleaving, productivity and technology foundation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_pick_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pick_order_number TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('production_order','sales_order','replenishment','transfer','manual')),
  source_id UUID,
  destination_type TEXT CHECK (destination_type IS NULL OR destination_type IN ('production_line','packing','shipping','warehouse','wip','manual')),
  destination_id UUID,
  picking_method TEXT NOT NULL DEFAULT 'discrete' CHECK (picking_method IN ('discrete','batch','cluster','zone','wave')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent','critical')),
  critical_ratio NUMERIC(10,4),
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released','in_progress','partially_picked','picked','short_picked','cancelled')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,pick_order_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pick_order_id UUID NOT NULL REFERENCES public.inventory_pick_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  requested_qty NUMERIC(16,4) NOT NULL CHECK (requested_qty > 0),
  picked_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'PCS',
  preferred_warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  preferred_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','allocated','picked','short','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_waves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wave_number TEXT NOT NULL,
  wave_type TEXT NOT NULL DEFAULT 'shipping' CHECK (wave_type IN ('shipping','production','priority','carrier','manual')),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  criteria JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released','in_progress','completed','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,wave_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_wave_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wave_id UUID NOT NULL REFERENCES public.inventory_pick_waves(id) ON DELETE CASCADE,
  pick_order_id UUID NOT NULL REFERENCES public.inventory_pick_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,wave_id,pick_order_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pick_list_number TEXT NOT NULL,
  pick_order_id UUID REFERENCES public.inventory_pick_orders(id) ON DELETE CASCADE,
  wave_id UUID REFERENCES public.inventory_pick_waves(id) ON DELETE SET NULL,
  route_algorithm TEXT NOT NULL DEFAULT 's_shape' CHECK (route_algorithm IN ('s_shape','largest_gap','combined')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(tenant_id,pick_list_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  container_number TEXT NOT NULL,
  pick_list_id UUID REFERENCES public.inventory_pick_lists(id) ON DELETE CASCADE,
  pick_order_id UUID REFERENCES public.inventory_pick_orders(id) ON DELETE SET NULL,
  container_slot TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','closed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,container_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_number TEXT NOT NULL,
  pick_list_id UUID NOT NULL REFERENCES public.inventory_pick_lists(id) ON DELETE CASCADE,
  pick_order_id UUID NOT NULL REFERENCES public.inventory_pick_orders(id) ON DELETE CASCADE,
  pick_order_line_id UUID NOT NULL REFERENCES public.inventory_pick_order_lines(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  container_id UUID REFERENCES public.inventory_pick_containers(id) ON DELETE SET NULL,
  sequence_no INT NOT NULL DEFAULT 1,
  required_qty NUMERIC(16,4) NOT NULL CHECK (required_qty > 0),
  picked_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','picked','short','exception','cancelled')),
  scan_required BOOLEAN NOT NULL DEFAULT true,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,task_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pick_task_id UUID NOT NULL REFERENCES public.inventory_pick_tasks(id) ON DELETE CASCADE,
  scanned_value TEXT NOT NULL,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('location','item','lot','lpn','container','voice_check_digit','rfid','pick_to_light')),
  scan_result TEXT NOT NULL CHECK (scan_result IN ('accepted','rejected','warning')),
  result_message TEXT,
  scanned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exception_number TEXT NOT NULL,
  pick_task_id UUID REFERENCES public.inventory_pick_tasks(id) ON DELETE SET NULL,
  pick_order_id UUID REFERENCES public.inventory_pick_orders(id) ON DELETE SET NULL,
  exception_type TEXT NOT NULL CHECK (exception_type IN ('short_pick','location_empty','wrong_item','wrong_lot','damaged','other')),
  expected_qty NUMERIC(16,4),
  actual_qty NUMERIC(16,4),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','rerouted','resolved','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,exception_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_picking_technology_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pick_task_id UUID REFERENCES public.inventory_pick_tasks(id) ON DELETE SET NULL,
  technology_type TEXT NOT NULL CHECK (technology_type IN ('barcode','voice','pick_to_light','rfid')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


ALTER TABLE public.inventory_pick_tasks ADD COLUMN IF NOT EXISTS route_algorithm TEXT DEFAULT 's_shape' CHECK (route_algorithm IN ('s_shape','largest_gap','combined'));
ALTER TABLE public.inventory_pick_tasks ADD COLUMN IF NOT EXISTS route_path JSONB DEFAULT '{}'::JSONB;
ALTER TABLE public.inventory_pick_tasks ADD COLUMN IF NOT EXISTS check_digit TEXT;
ALTER TABLE public.inventory_pick_tasks ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.inventory_pick_zone_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  handoff_number TEXT NOT NULL,
  pick_task_id UUID NOT NULL REFERENCES public.inventory_pick_tasks(id) ON DELETE CASCADE,
  from_zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL,
  to_zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL,
  from_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(tenant_id,handoff_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_sorting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sorting_number TEXT NOT NULL,
  pick_list_id UUID NOT NULL REFERENCES public.inventory_pick_lists(id) ON DELETE CASCADE,
  station_code TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','sorting','completed','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(tenant_id,sorting_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_pick_sorting_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sorting_session_id UUID NOT NULL REFERENCES public.inventory_pick_sorting_sessions(id) ON DELETE CASCADE,
  pick_task_id UUID NOT NULL REFERENCES public.inventory_pick_tasks(id) ON DELETE CASCADE,
  container_id UUID REFERENCES public.inventory_pick_containers(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','sorted','exception','cancelled')),
  sorted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sorted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_pick_orders_status ON public.inventory_pick_orders(tenant_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_inventory_pick_tasks_status ON public.inventory_pick_tasks(tenant_id,status,sequence_no);
CREATE INDEX IF NOT EXISTS idx_inventory_pick_exceptions_status ON public.inventory_pick_exceptions(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_pick_scans_task ON public.inventory_pick_scans(tenant_id,pick_task_id,scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_zone_handoffs_status ON public.inventory_pick_zone_handoffs(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_sorting_sessions_status ON public.inventory_pick_sorting_sessions(tenant_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION public.create_inventory_pick_order(
  p_source_type TEXT,
  p_source_id UUID,
  p_destination_type TEXT,
  p_destination_id UUID,
  p_picking_method TEXT,
  p_priority TEXT,
  p_critical_ratio NUMERIC,
  p_due_at TIMESTAMPTZ,
  p_lines JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT; v_line JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF p_source_type NOT IN ('production_order','sales_order','replenishment','transfer','manual') THEN RAISE EXCEPTION 'INVALID_PICK_SOURCE_TYPE'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'PICK_LINES_REQUIRED'; END IF;
  v_num := public.inventory_next_number('PICK');
  INSERT INTO public.inventory_pick_orders(tenant_id,pick_order_number,source_type,source_id,destination_type,destination_id,picking_method,priority,critical_ratio,due_at,created_by)
  VALUES(v_tenant,v_num,p_source_type,p_source_id,p_destination_type,p_destination_id,COALESCE(p_picking_method,'discrete'),COALESCE(p_priority,CASE WHEN COALESCE(p_critical_ratio,999) < 1 THEN 'critical' ELSE 'normal' END),p_critical_ratio,p_due_at,auth.uid()) RETURNING id INTO v_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=(v_line->>'item_id')::UUID AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'PICK_ITEM_NOT_FOUND'; END IF;
    INSERT INTO public.inventory_pick_order_lines(tenant_id,pick_order_id,item_id,requested_qty,uom,preferred_warehouse_id,preferred_location_id,lot_id,lpn_id)
    VALUES(v_tenant,v_id,(v_line->>'item_id')::UUID,COALESCE((v_line->>'requested_qty')::NUMERIC,0),COALESCE(v_line->>'uom','PCS'),NULLIF(v_line->>'warehouse_id','')::UUID,NULLIF(v_line->>'location_id','')::UUID,NULLIF(v_line->>'lot_id','')::UUID,NULLIF(v_line->>'lpn_id','')::UUID);
  END LOOP;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_pick_order(TEXT,UUID,TEXT,UUID,TEXT,TEXT,NUMERIC,TIMESTAMPTZ,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_pick_list(p_pick_order_id UUID, p_route_algorithm TEXT DEFAULT 's_shape')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_order RECORD; v_list_id UUID; v_num TEXT; v_line RECORD; v_bal RECORD; v_seq INT:=0; v_container UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_order FROM public.inventory_pick_orders WHERE id=p_pick_order_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICK_ORDER_NOT_FOUND'; END IF;
  IF p_route_algorithm NOT IN ('s_shape','largest_gap','combined') THEN RAISE EXCEPTION 'INVALID_ROUTE_ALGORITHM'; END IF;
  v_num := public.inventory_next_number('PL');
  INSERT INTO public.inventory_pick_lists(tenant_id,pick_list_number,pick_order_id,route_algorithm,status,assigned_to)
  VALUES(v_tenant,v_num,p_pick_order_id,p_route_algorithm,'open',v_order.assigned_to) RETURNING id INTO v_list_id;

  IF v_order.picking_method='cluster' THEN
    INSERT INTO public.inventory_pick_containers(tenant_id,container_number,pick_list_id,pick_order_id,container_slot)
    VALUES(v_tenant,public.inventory_next_number('CONT'),v_list_id,p_pick_order_id,'1') RETURNING id INTO v_container;
  END IF;

  FOR v_line IN SELECT * FROM public.inventory_pick_order_lines WHERE pick_order_id=p_pick_order_id AND tenant_id=v_tenant AND status='open' LOOP
    SELECT b.* INTO v_bal
    FROM public.inventory_stock_balances b
    LEFT JOIN public.inventory_locations l ON l.id=b.location_id AND l.tenant_id=b.tenant_id
    WHERE b.tenant_id=v_tenant AND b.item_id=v_line.item_id AND b.available_qty > 0
      AND (v_line.preferred_warehouse_id IS NULL OR b.warehouse_id=v_line.preferred_warehouse_id)
      AND (v_line.preferred_location_id IS NULL OR b.location_id=v_line.preferred_location_id)
    ORDER BY COALESCE(l.pick_sequence,999999), b.available_qty DESC
    LIMIT 1;
    IF NOT FOUND OR v_bal.available_qty < v_line.requested_qty THEN
      INSERT INTO public.inventory_pick_exceptions(tenant_id,exception_number,pick_order_id,exception_type,expected_qty,actual_qty,description,created_by)
      VALUES(v_tenant,public.inventory_next_number('PEX'),p_pick_order_id,'short_pick',v_line.requested_qty,COALESCE(v_bal.available_qty,0),'Insufficient stock at pick generation',auth.uid());
      UPDATE public.inventory_pick_order_lines SET status='short' WHERE id=v_line.id AND tenant_id=v_tenant;
    ELSE
      v_seq := v_seq + 1;
      INSERT INTO public.inventory_pick_tasks(tenant_id,task_number,pick_list_id,pick_order_id,pick_order_line_id,item_id,warehouse_id,location_id,lot_id,lpn_id,container_id,sequence_no,required_qty,status,assigned_to)
      VALUES(v_tenant,public.inventory_next_number('PT'),v_list_id,p_pick_order_id,v_line.id,v_line.item_id,v_bal.warehouse_id,v_bal.location_id,v_bal.lot_id,v_bal.lpn_id,v_container,v_seq,v_line.requested_qty,'open',v_order.assigned_to);
      UPDATE public.inventory_pick_order_lines SET status='allocated' WHERE id=v_line.id AND tenant_id=v_tenant;
    END IF;
  END LOOP;
  UPDATE public.inventory_pick_orders SET status='released', released_at=NOW(), updated_at=NOW() WHERE id=p_pick_order_id AND tenant_id=v_tenant;
  RETURN v_list_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_pick_list(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_inventory_pick_scan(
  p_pick_task_id UUID,
  p_location_barcode TEXT,
  p_item_barcode TEXT,
  p_lpn_barcode TEXT,
  p_quantity NUMERIC
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_item RECORD; v_loc RECORD; v_lpn RECORD; v_qty NUMERIC;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_pick_tasks WHERE id=p_pick_task_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICK_TASK_NOT_FOUND'; END IF;
  IF v_task.status NOT IN ('open','assigned','in_progress') THEN RAISE EXCEPTION 'PICK_TASK_NOT_SCANNABLE'; END IF;
  SELECT * INTO v_item FROM public.inventory_items WHERE id=v_task.item_id AND tenant_id=v_tenant;
  SELECT * INTO v_loc FROM public.inventory_locations WHERE id=v_task.location_id AND tenant_id=v_tenant;
  IF v_task.location_id IS NOT NULL AND p_location_barcode IS NOT NULL AND p_location_barcode NOT IN (v_loc.location_code, COALESCE(v_loc.full_location_code,''), COALESCE(v_loc.barcode,'')) THEN
    INSERT INTO public.inventory_pick_scans(tenant_id,pick_task_id,scanned_value,scan_type,scan_result,result_message,scanned_by) VALUES(v_tenant,p_pick_task_id,p_location_barcode,'location','rejected','Wrong location',auth.uid());
    RAISE EXCEPTION 'WRONG_LOCATION_SCAN';
  END IF;
  IF p_item_barcode IS NOT NULL AND p_item_barcode NOT IN (v_item.item_code, v_item.id::TEXT) THEN
    INSERT INTO public.inventory_pick_scans(tenant_id,pick_task_id,scanned_value,scan_type,scan_result,result_message,scanned_by) VALUES(v_tenant,p_pick_task_id,p_item_barcode,'item','rejected','Wrong item',auth.uid());
    RAISE EXCEPTION 'WRONG_ITEM_SCAN';
  END IF;
  IF v_task.lpn_id IS NOT NULL THEN
    SELECT * INTO v_lpn FROM public.inventory_lpn WHERE id=v_task.lpn_id AND tenant_id=v_tenant;
    IF p_lpn_barcode IS NOT NULL AND p_lpn_barcode NOT IN (v_lpn.lpn_number, v_lpn.id::TEXT) THEN
      INSERT INTO public.inventory_pick_scans(tenant_id,pick_task_id,scanned_value,scan_type,scan_result,result_message,scanned_by) VALUES(v_tenant,p_pick_task_id,p_lpn_barcode,'lpn','rejected','Wrong LPN',auth.uid());
      RAISE EXCEPTION 'WRONG_LPN_SCAN';
    END IF;
  END IF;
  v_qty := COALESCE(p_quantity, v_task.required_qty);
  IF v_qty <= 0 OR v_qty > v_task.required_qty THEN RAISE EXCEPTION 'INVALID_PICK_QUANTITY'; END IF;
  PERFORM public.post_inventory_movement('pick', v_task.item_id, v_task.warehouse_id, v_task.location_id, v_qty, 'inventory_pick_tasks', p_pick_task_id, 'pick_confirmed');
  UPDATE public.inventory_pick_tasks SET picked_qty=v_qty,status=CASE WHEN v_qty<v_task.required_qty THEN 'short' ELSE 'picked' END,completed_at=NOW(),assigned_to=COALESCE(assigned_to,auth.uid()) WHERE id=p_pick_task_id AND tenant_id=v_tenant;
  UPDATE public.inventory_pick_order_lines SET picked_qty=picked_qty+v_qty,status=CASE WHEN picked_qty+v_qty>=requested_qty THEN 'picked' ELSE 'short' END WHERE id=v_task.pick_order_line_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_pick_scans(tenant_id,pick_task_id,scanned_value,scan_type,scan_result,result_message,scanned_by) VALUES(v_tenant,p_pick_task_id,COALESCE(p_item_barcode,v_item.item_code),'item','accepted','Pick confirmed',auth.uid());
  RETURN 'picked';
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_pick_scan(UUID,TEXT,TEXT,TEXT,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_inventory_pick_exception(p_pick_task_id UUID, p_exception_type TEXT, p_actual_qty NUMERIC, p_description TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF p_exception_type NOT IN ('short_pick','location_empty','wrong_item','wrong_lot','damaged','other') THEN RAISE EXCEPTION 'INVALID_PICK_EXCEPTION'; END IF;
  SELECT * INTO v_task FROM public.inventory_pick_tasks WHERE id=p_pick_task_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICK_TASK_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_pick_exceptions(tenant_id,exception_number,pick_task_id,pick_order_id,exception_type,expected_qty,actual_qty,description,created_by)
  VALUES(v_tenant,public.inventory_next_number('PEX'),p_pick_task_id,v_task.pick_order_id,p_exception_type,v_task.required_qty,p_actual_qty,p_description,auth.uid()) RETURNING id INTO v_id;
  UPDATE public.inventory_pick_tasks SET status='exception', picked_qty=COALESCE(p_actual_qty,0) WHERE id=p_pick_task_id AND tenant_id=v_tenant;
  UPDATE public.inventory_pick_orders SET status='short_picked' WHERE id=v_task.pick_order_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.report_inventory_pick_exception(UUID,TEXT,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_pick_wave(p_wave_type TEXT, p_scheduled_start TIMESTAMPTZ, p_scheduled_end TIMESTAMPTZ, p_pick_order_ids UUID[], p_criteria JSONB DEFAULT '{}'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_order UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_pick_waves(tenant_id,wave_number,wave_type,scheduled_start,scheduled_end,criteria,created_by)
  VALUES(v_tenant,public.inventory_next_number('WAVE'),COALESCE(p_wave_type,'manual'),p_scheduled_start,p_scheduled_end,COALESCE(p_criteria,'{}'::JSONB),auth.uid()) RETURNING id INTO v_id;
  FOREACH v_order IN ARRAY p_pick_order_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.inventory_pick_orders WHERE id=v_order AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'PICK_ORDER_NOT_FOUND_IN_WAVE'; END IF;
    INSERT INTO public.inventory_pick_wave_orders(tenant_id,wave_id,pick_order_id) VALUES(v_tenant,v_id,v_order) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_pick_wave(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID[],JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_inventory_pick_wave(p_wave_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_order RECORD; v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_pick_waves WHERE id=p_wave_id AND tenant_id=v_tenant AND status='draft') THEN RAISE EXCEPTION 'WAVE_NOT_RELEASABLE'; END IF;
  FOR v_order IN SELECT po.* FROM public.inventory_pick_orders po JOIN public.inventory_pick_wave_orders wo ON wo.pick_order_id=po.id AND wo.tenant_id=po.tenant_id WHERE wo.wave_id=p_wave_id AND po.tenant_id=v_tenant LOOP
    PERFORM public.generate_inventory_pick_list(v_order.id, 'combined');
    v_count := v_count + 1;
  END LOOP;
  UPDATE public.inventory_pick_waves SET status='released', released_by=auth.uid(), released_at=NOW() WHERE id=p_wave_id AND tenant_id=v_tenant;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.release_inventory_pick_wave(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_picking_interleaving(p_assigned_to UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_task_interleaving_suggestions(tenant_id,source_task_table,source_task_id,suggested_task_table,suggested_task_id,warehouse_id,assigned_to,score,reason)
  SELECT v_tenant,'inventory_pick_tasks',pt.id,'inventory_replenishment_tasks',rt.id,pt.warehouse_id,COALESCE(pt.assigned_to,rt.assigned_to),85,'دمج Pick Task مع Replenishment في نفس المستودع'
  FROM public.inventory_pick_tasks pt
  JOIN public.inventory_replenishment_tasks rt ON rt.tenant_id=pt.tenant_id AND rt.status IN ('open','assigned')
  JOIN public.inventory_locations rl ON rl.id=rt.to_location_id AND rl.tenant_id=rt.tenant_id AND rl.warehouse_id=pt.warehouse_id
  WHERE pt.tenant_id=v_tenant AND pt.status IN ('open','assigned') AND (p_assigned_to IS NULL OR pt.assigned_to=p_assigned_to OR rt.assigned_to=p_assigned_to)
    AND NOT EXISTS (SELECT 1 FROM public.inventory_task_interleaving_suggestions s WHERE s.tenant_id=v_tenant AND s.source_task_id=pt.id AND s.suggested_task_id=rt.id AND s.status='open');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_picking_interleaving(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.record_inventory_picking_technology_event(
  p_pick_task_id UUID,
  p_technology_type TEXT,
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF p_technology_type NOT IN ('barcode','voice','pick_to_light','rfid') THEN RAISE EXCEPTION 'INVALID_PICK_TECHNOLOGY'; END IF;
  IF p_pick_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_pick_tasks WHERE id=p_pick_task_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'PICK_TASK_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_picking_technology_events(tenant_id,pick_task_id,technology_type,event_type,payload,actor_id)
  VALUES(v_tenant,p_pick_task_id,p_technology_type,p_event_type,COALESCE(p_payload,'{}'::JSONB),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_inventory_picking_technology_event(UUID,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_inventory_voice_pick(p_pick_task_id UUID, p_check_digit TEXT, p_quantity NUMERIC)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_pick_tasks WHERE id=p_pick_task_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICK_TASK_NOT_FOUND'; END IF;
  IF v_task.check_digit IS NOT NULL AND p_check_digit IS DISTINCT FROM v_task.check_digit THEN
    PERFORM public.record_inventory_picking_technology_event(p_pick_task_id,'voice','voice_rejected',jsonb_build_object('provided',p_check_digit,'expected',v_task.check_digit));
    RAISE EXCEPTION 'VOICE_CHECK_DIGIT_MISMATCH';
  END IF;
  PERFORM public.record_inventory_picking_technology_event(p_pick_task_id,'voice','voice_confirmed',jsonb_build_object('check_digit',p_check_digit,'quantity',p_quantity));
  RETURN public.confirm_inventory_pick_scan(p_pick_task_id,NULL,NULL,NULL,p_quantity);
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_voice_pick(UUID,TEXT,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.trigger_inventory_pick_to_light(p_pick_task_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_loc RECORD; v_payload JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_pick_tasks WHERE id=p_pick_task_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICK_TASK_NOT_FOUND'; END IF;
  SELECT * INTO v_loc FROM public.inventory_locations WHERE id=v_task.location_id AND tenant_id=v_tenant;
  v_payload := jsonb_build_object('pick_task_id',p_pick_task_id,'location_code',COALESCE(v_loc.full_location_code,v_loc.location_code),'quantity',v_task.required_qty,'action','blink_light');
  PERFORM public.record_inventory_picking_technology_event(p_pick_task_id,'pick_to_light','light_triggered',v_payload);
  RETURN v_payload;
END $$;
GRANT EXECUTE ON FUNCTION public.trigger_inventory_pick_to_light(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ingest_inventory_rfid_pick_event(p_pick_task_id UUID, p_tag_values JSONB, p_quantity NUMERIC)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF p_tag_values IS NULL OR jsonb_array_length(p_tag_values)=0 THEN RAISE EXCEPTION 'RFID_TAGS_REQUIRED'; END IF;
  PERFORM public.record_inventory_picking_technology_event(p_pick_task_id,'rfid','rfid_tags_read',jsonb_build_object('tags',p_tag_values,'quantity',p_quantity));
  RETURN public.confirm_inventory_pick_scan(p_pick_task_id,NULL,NULL,NULL,p_quantity);
END $$;
GRANT EXECUTE ON FUNCTION public.ingest_inventory_rfid_pick_event(UUID,JSONB,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_pick_sorting_session(p_pick_list_id UUID, p_station_code TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT; v_task RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_pick_lists WHERE id=p_pick_list_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'PICK_LIST_NOT_FOUND'; END IF;
  v_num := public.inventory_next_number('SORT');
  INSERT INTO public.inventory_pick_sorting_sessions(tenant_id,sorting_number,pick_list_id,station_code,created_by)
  VALUES(v_tenant,v_num,p_pick_list_id,p_station_code,auth.uid()) RETURNING id INTO v_id;
  FOR v_task IN SELECT * FROM public.inventory_pick_tasks WHERE pick_list_id=p_pick_list_id AND tenant_id=v_tenant LOOP
    INSERT INTO public.inventory_pick_sorting_lines(tenant_id,sorting_session_id,pick_task_id,container_id,item_id,quantity)
    VALUES(v_tenant,v_id,v_task.id,v_task.container_id,v_task.item_id,GREATEST(v_task.picked_qty,v_task.required_qty));
  END LOOP;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_pick_sorting_session(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_inventory_sorting_line(p_sorting_line_id UUID, p_container_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  UPDATE public.inventory_pick_sorting_lines
  SET status='sorted', container_id=COALESCE(p_container_id,container_id), sorted_by=auth.uid(), sorted_at=NOW()
  WHERE id=p_sorting_line_id AND tenant_id=v_tenant AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'SORTING_LINE_NOT_FOUND_OR_NOT_OPEN'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_sorting_line(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_zone_handoff(p_pick_task_id UUID, p_from_zone_id UUID, p_to_zone_id UUID, p_to_user_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT; v_task RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_pick_tasks WHERE id=p_pick_task_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICK_TASK_NOT_FOUND'; END IF;
  v_num := public.inventory_next_number('HAND');
  INSERT INTO public.inventory_pick_zone_handoffs(tenant_id,handoff_number,pick_task_id,from_zone_id,to_zone_id,from_user_id,to_user_id,notes)
  VALUES(v_tenant,v_num,p_pick_task_id,p_from_zone_id,p_to_zone_id,auth.uid(),p_to_user_id,p_notes) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_zone_handoff(UUID,UUID,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_inventory_zone_handoff(p_handoff_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  UPDATE public.inventory_pick_zone_handoffs SET status='completed', completed_at=NOW()
  WHERE id=p_handoff_id AND tenant_id=v_tenant AND status IN ('pending','accepted');
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_NOT_FOUND_OR_NOT_OPEN'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_inventory_zone_handoff(UUID) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_pick_orders','inventory_pick_order_lines','inventory_pick_waves','inventory_pick_wave_orders','inventory_pick_lists','inventory_pick_containers','inventory_pick_tasks','inventory_pick_scans','inventory_pick_exceptions','inventory_picking_technology_events','inventory_pick_zone_handoffs','inventory_pick_sorting_sessions','inventory_pick_sorting_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_pick_task_queue WITH (security_invoker=true) AS
SELECT t.*, i.item_code, i.name_ar AS item_name, l.location_code, l.full_location_code, po.priority, po.critical_ratio, po.due_at
FROM public.inventory_pick_tasks t
JOIN public.inventory_items i ON i.id=t.item_id AND i.tenant_id=t.tenant_id
LEFT JOIN public.inventory_locations l ON l.id=t.location_id AND l.tenant_id=t.tenant_id
JOIN public.inventory_pick_orders po ON po.id=t.pick_order_id AND po.tenant_id=t.tenant_id
WHERE t.tenant_id=public.current_user_tenant_id() AND t.status IN ('open','assigned','in_progress')
ORDER BY CASE po.priority WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, COALESCE(po.critical_ratio,999), t.sequence_no;
GRANT SELECT ON public.inventory_pick_task_queue TO authenticated;

CREATE OR REPLACE VIEW public.inventory_picking_productivity WITH (security_invoker=true) AS
SELECT tenant_id, assigned_to AS employee_id, COUNT(*) FILTER (WHERE status='picked') AS picked_tasks, COALESCE(SUM(picked_qty),0) AS picked_qty,
  AVG(EXTRACT(EPOCH FROM (completed_at-started_at))/60) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL) AS avg_minutes_per_task
FROM public.inventory_pick_tasks
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id, assigned_to;
GRANT SELECT ON public.inventory_picking_productivity TO authenticated;

CREATE OR REPLACE VIEW public.inventory_picking_exceptions_report WITH (security_invoker=true) AS
SELECT tenant_id, exception_type, status, COUNT(*) AS exception_count, MIN(created_at) AS first_at, MAX(created_at) AS last_at
FROM public.inventory_pick_exceptions
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id, exception_type, status;
GRANT SELECT ON public.inventory_picking_exceptions_report TO authenticated;

CREATE OR REPLACE VIEW public.inventory_picking_kpis WITH (security_invoker=true) AS
SELECT
  po.tenant_id,
  COUNT(DISTINCT po.id) AS total_pick_orders,
  COUNT(DISTINCT po.id) FILTER (WHERE po.status IN ('picked','partially_picked','short_picked')) AS processed_orders,
  ROUND(COUNT(DISTINCT po.id) FILTER (WHERE po.status='picked')::NUMERIC / NULLIF(COUNT(DISTINCT po.id),0) * 100, 2) AS pick_accuracy_percent,
  ROUND(COUNT(DISTINCT ex.id)::NUMERIC / NULLIF(COUNT(DISTINCT po.id),0) * 100, 2) AS short_pick_rate_percent,
  AVG(EXTRACT(EPOCH FROM (po.completed_at-po.released_at))/3600) FILTER (WHERE po.completed_at IS NOT NULL AND po.released_at IS NOT NULL) AS avg_order_cycle_hours,
  COUNT(DISTINCT po.id) FILTER (WHERE po.due_at IS NOT NULL AND po.completed_at <= po.due_at) AS on_time_orders
FROM public.inventory_pick_orders po
LEFT JOIN public.inventory_pick_exceptions ex ON ex.pick_order_id=po.id AND ex.tenant_id=po.tenant_id AND ex.exception_type='short_pick'
WHERE po.tenant_id=public.current_user_tenant_id()
GROUP BY po.tenant_id;
GRANT SELECT ON public.inventory_picking_kpis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_pick_wave_dashboard WITH (security_invoker=true) AS
SELECT w.tenant_id,w.id AS wave_id,w.wave_number,w.wave_type,w.status,w.scheduled_start,w.scheduled_end,
  COUNT(DISTINCT wo.pick_order_id) AS order_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('open','assigned','in_progress')) AS open_tasks,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status='picked') AS picked_tasks
FROM public.inventory_pick_waves w
LEFT JOIN public.inventory_pick_wave_orders wo ON wo.wave_id=w.id AND wo.tenant_id=w.tenant_id
LEFT JOIN public.inventory_pick_tasks t ON t.pick_order_id=wo.pick_order_id AND t.tenant_id=w.tenant_id
WHERE w.tenant_id=public.current_user_tenant_id()
GROUP BY w.tenant_id,w.id,w.wave_number,w.wave_type,w.status,w.scheduled_start,w.scheduled_end;
GRANT SELECT ON public.inventory_pick_wave_dashboard TO authenticated;


CREATE OR REPLACE VIEW public.inventory_pick_route_map WITH (security_invoker=true) AS
SELECT t.tenant_id,t.pick_list_id,t.id AS pick_task_id,t.task_number,t.sequence_no,t.route_algorithm,t.route_path,
  l.location_code,l.full_location_code,l.aisle_code,l.bay_code,l.level_code,l.bin_code,i.item_code,i.name_ar AS item_name,t.required_qty,t.status
FROM public.inventory_pick_tasks t
JOIN public.inventory_items i ON i.id=t.item_id AND i.tenant_id=t.tenant_id
LEFT JOIN public.inventory_locations l ON l.id=t.location_id AND l.tenant_id=t.tenant_id
WHERE t.tenant_id=public.current_user_tenant_id()
ORDER BY t.pick_list_id,t.sequence_no;
GRANT SELECT ON public.inventory_pick_route_map TO authenticated;

CREATE OR REPLACE VIEW public.inventory_pick_sorting_dashboard WITH (security_invoker=true) AS
SELECT s.tenant_id,s.id AS sorting_session_id,s.sorting_number,s.station_code,s.status,
  COUNT(l.id) AS line_count,
  COUNT(l.id) FILTER (WHERE l.status='sorted') AS sorted_count
FROM public.inventory_pick_sorting_sessions s
LEFT JOIN public.inventory_pick_sorting_lines l ON l.sorting_session_id=s.id AND l.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
GROUP BY s.tenant_id,s.id,s.sorting_number,s.station_code,s.status;
GRANT SELECT ON public.inventory_pick_sorting_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_picking_technology_events_report WITH (security_invoker=true) AS
SELECT tenant_id, technology_type, event_type, COUNT(*) AS event_count, MAX(created_at) AS last_event_at
FROM public.inventory_picking_technology_events
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id, technology_type, event_type;
GRANT SELECT ON public.inventory_picking_technology_events_report TO authenticated;

CREATE OR REPLACE VIEW public.inventory_zone_handoff_queue WITH (security_invoker=true) AS
SELECT h.*, t.task_number, i.item_code
FROM public.inventory_pick_zone_handoffs h
JOIN public.inventory_pick_tasks t ON t.id=h.pick_task_id AND t.tenant_id=h.tenant_id
JOIN public.inventory_items i ON i.id=t.item_id AND i.tenant_id=t.tenant_id
WHERE h.tenant_id=public.current_user_tenant_id() AND h.status IN ('pending','accepted')
ORDER BY h.created_at ASC;
GRANT SELECT ON public.inventory_zone_handoff_queue TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_pick_orders') IS NULL OR to_regclass('public.inventory_pick_tasks') IS NULL OR to_regclass('public.inventory_pick_waves') IS NULL OR to_regclass('public.inventory_pick_sorting_sessions') IS NULL OR to_regclass('public.inventory_pick_zone_handoffs') IS NULL THEN
    RAISE EXCEPTION '0207 failed: picking tables missing';
  END IF;
  IF to_regprocedure('public.confirm_inventory_pick_scan(uuid,text,text,text,numeric)') IS NULL OR to_regprocedure('public.confirm_inventory_voice_pick(uuid,text,numeric)') IS NULL OR to_regprocedure('public.trigger_inventory_pick_to_light(uuid)') IS NULL OR to_regprocedure('public.ingest_inventory_rfid_pick_event(uuid,jsonb,numeric)') IS NULL THEN
    RAISE EXCEPTION '0207 failed: scan-to-confirm missing';
  END IF;
  RAISE NOTICE '✅ 0207: Inventory picking operations and fulfillment applied';
END $$;
