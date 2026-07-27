-- ============================================================================
-- 0205 — Inventory Unit 01: Receiving & Inbound Operations
-- التوثيق: docs/inventory/01-receiving-inbound-operations.md
-- الملحق التقني: docs/inventory/01-receiving-inbound-technical-checklist.md
-- يغطي: ASN, Dock Scheduling, Receiving Sessions, OS&D, Quarantine, LPN,
-- Cross-Docking foundation, Receiving KPIs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_asns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asn_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  expected_arrival_at TIMESTAMPTZ,
  carrier_name TEXT,
  truck_number TEXT,
  bol_number TEXT,
  seal_number TEXT,
  total_packages INT DEFAULT 0,
  total_weight NUMERIC(16,3),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','confirmed','partially_received','received','closed','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, asn_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_asn_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asn_id UUID NOT NULL REFERENCES public.inventory_asns(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  po_line_id UUID REFERENCES public.po_line_items(id) ON DELETE SET NULL,
  expected_qty NUMERIC(16,4) NOT NULL CHECK (expected_qty > 0),
  received_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'PCS',
  supplier_lot_number TEXT,
  expiry_date DATE,
  serial_numbers JSONB DEFAULT '[]'::JSONB,
  package_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_dock_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  dock_id UUID REFERENCES public.inventory_docks(id) ON DELETE SET NULL,
  asn_id UUID REFERENCES public.inventory_asns(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  actual_check_in TIMESTAMPTZ,
  actual_unloading_start TIMESTAMPTZ,
  actual_completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('requested','scheduled','checked_in','unloading','completed','no_show','cancelled')),
  package_count INT DEFAULT 0,
  special_requirements TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_end > scheduled_start),
  UNIQUE(tenant_id, appointment_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_receiving_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  receiving_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  asn_id UUID REFERENCES public.inventory_asns(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.inventory_dock_appointments(id) ON DELETE SET NULL,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('asn','po','manual','return','cross_dock')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','receiving','exception','posted','putaway_pending','completed','cancelled')),
  driver_name TEXT,
  driver_id_number TEXT,
  bol_number TEXT,
  seal_number TEXT,
  seal_status TEXT CHECK (seal_status IS NULL OR seal_status IN ('matched','missing','broken','mismatch')),
  truck_photos JSONB DEFAULT '[]'::JSONB,
  started_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(tenant_id, session_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_receiving_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.inventory_receiving_sessions(id) ON DELETE CASCADE,
  asn_line_id UUID REFERENCES public.inventory_asn_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  expected_qty NUMERIC(16,4) DEFAULT 0,
  received_qty NUMERIC(16,4) NOT NULL CHECK (received_qty >= 0),
  accepted_qty NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (accepted_qty >= 0),
  rejected_qty NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  uom TEXT NOT NULL DEFAULT 'PCS',
  lot_number TEXT,
  expiry_date DATE,
  serial_numbers JSONB DEFAULT '[]'::JSONB,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  condition_status TEXT NOT NULL DEFAULT 'ok' CHECK (condition_status IN ('ok','damaged','short','over','wrong_item','quality_hold')),
  requires_quality BOOLEAN NOT NULL DEFAULT false,
  target_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (accepted_qty + rejected_qty <= received_qty)
);

CREATE TABLE IF NOT EXISTS public.inventory_osd_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,
  session_id UUID REFERENCES public.inventory_receiving_sessions(id) ON DELETE CASCADE,
  receiving_line_id UUID REFERENCES public.inventory_receiving_lines(id) ON DELETE SET NULL,
  asn_id UUID REFERENCES public.inventory_asns(id) ON DELETE SET NULL,
  osd_type TEXT NOT NULL CHECK (osd_type IN ('overage','shortage','damage','wrong_item','seal_mismatch','documentation_error','other')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  description TEXT NOT NULL,
  quantity_difference NUMERIC(16,4),
  attachments JSONB DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','accepted','rejected','rtv_required','resolved','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, case_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_quarantine_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hold_number TEXT NOT NULL,
  session_id UUID REFERENCES public.inventory_receiving_sessions(id) ON DELETE SET NULL,
  receiving_line_id UUID REFERENCES public.inventory_receiving_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'on_hold' CHECK (status IN ('on_hold','released','rejected','scrapped','returned')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, hold_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_putaway_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_number TEXT NOT NULL,
  session_id UUID REFERENCES public.inventory_receiving_sessions(id) ON DELETE SET NULL,
  receiving_line_id UUID REFERENCES public.inventory_receiving_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  from_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  suggested_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  completed_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','completed','cancelled')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, task_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_cross_dock_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_number TEXT NOT NULL,
  session_id UUID REFERENCES public.inventory_receiving_sessions(id) ON DELETE SET NULL,
  receiving_line_id UUID REFERENCES public.inventory_receiving_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  destination_type TEXT NOT NULL CHECK (destination_type IN ('production_order','sales_order','transfer','manual')),
  destination_id UUID,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ready','moved','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, task_number)
);


CREATE TABLE IF NOT EXISTS public.inventory_receiving_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.inventory_receiving_sessions(id) ON DELETE CASCADE,
  receiving_line_id UUID REFERENCES public.inventory_receiving_lines(id) ON DELETE SET NULL,
  scanned_value TEXT NOT NULL,
  scan_type TEXT NOT NULL DEFAULT 'barcode' CHECK (scan_type IN ('barcode','qr','lpn','item','location','seal')),
  scan_result TEXT NOT NULL DEFAULT 'accepted' CHECK (scan_result IN ('accepted','rejected','warning')),
  result_message TEXT,
  scanned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_lpn_label_prints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lpn_id UUID NOT NULL REFERENCES public.inventory_lpn(id) ON DELETE CASCADE,
  label_payload JSONB NOT NULL,
  printer_name TEXT,
  printed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_inbound_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('asn_created','dock_scheduled','receiving_posted','quality_required','osd_created','putaway_created','cross_dock_ready','po_updated')),
  target_role TEXT,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_table TEXT,
  entity_id UUID,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.inventory_supplier_dock_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  asn_id UUID REFERENCES public.inventory_asns(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','booked','expired','revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_receiving_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('asn','receiving_session','receiving_line','osd_case','quarantine_hold','lpn')),
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_mime TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_quality_ncr_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ncr_number TEXT NOT NULL,
  osd_case_id UUID REFERENCES public.inventory_osd_cases(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.inventory_receiving_sessions(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  defect_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_quality_review','approved_for_use','rejected','rtv_required','scrap_required','closed')),
  disposition TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, ncr_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_lpn_label_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'html' CHECK (template_type IN ('html','zpl','pdf_html')),
  content TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, template_name)
);

CREATE INDEX IF NOT EXISTS idx_inventory_asns_tenant_status ON public.inventory_asns(tenant_id,status,expected_arrival_at);
CREATE INDEX IF NOT EXISTS idx_inventory_receiving_sessions_tenant_status ON public.inventory_receiving_sessions(tenant_id,status,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_osd_cases_tenant_status ON public.inventory_osd_cases(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_dock_appointments_time ON public.inventory_dock_appointments(tenant_id,warehouse_id,dock_id,scheduled_start,scheduled_end);
CREATE INDEX IF NOT EXISTS idx_inventory_receiving_scans_session ON public.inventory_receiving_scans(tenant_id,session_id,scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_inbound_notifications ON public.inventory_inbound_notifications(tenant_id,created_at DESC,is_read);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier_dock_invites_token ON public.inventory_supplier_dock_invites(token_hash,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_receiving_attachments_entity ON public.inventory_receiving_attachments(tenant_id,entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_quality_ncr_status ON public.inventory_quality_ncr_cases(tenant_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION public.inventory_next_number(p_prefix TEXT)
RETURNS TEXT LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_prefix || '-' || to_char(NOW(),'YYYYMMDD-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 1000000)::TEXT,6,'0');
$$;
REVOKE ALL ON FUNCTION public.inventory_next_number(TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_inventory_asn(
  p_supplier_id UUID,
  p_po_id UUID,
  p_expected_arrival_at TIMESTAMPTZ,
  p_carrier_name TEXT,
  p_truck_number TEXT,
  p_bol_number TEXT,
  p_total_packages INT,
  p_total_weight NUMERIC,
  p_lines JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_asn_id UUID; v_asn_number TEXT; v_line JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'ASN_LINES_REQUIRED'; END IF;
  IF p_po_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id=p_po_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'PO_NOT_IN_TENANT'; END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SUPPLIER_NOT_IN_TENANT'; END IF;
  v_asn_number := public.inventory_next_number('ASN');
  INSERT INTO public.inventory_asns(tenant_id,asn_number,supplier_id,po_id,expected_arrival_at,carrier_name,truck_number,bol_number,total_packages,total_weight,status,created_by)
  VALUES(v_tenant,v_asn_number,p_supplier_id,p_po_id,p_expected_arrival_at,p_carrier_name,p_truck_number,p_bol_number,COALESCE(p_total_packages,0),p_total_weight,'submitted',auth.uid()) RETURNING id INTO v_asn_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=(v_line->>'item_id')::UUID AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'ASN_ITEM_NOT_IN_TENANT'; END IF;
    INSERT INTO public.inventory_asn_lines(tenant_id,asn_id,item_id,po_line_id,expected_qty,uom,supplier_lot_number,expiry_date,serial_numbers,package_count)
    VALUES(v_tenant,v_asn_id,(v_line->>'item_id')::UUID,NULLIF(v_line->>'po_line_id','')::UUID,COALESCE((v_line->>'expected_qty')::NUMERIC,0),COALESCE(v_line->>'uom','PCS'),v_line->>'supplier_lot_number',NULLIF(v_line->>'expiry_date','')::DATE,COALESCE(v_line->'serial_numbers','[]'::JSONB),COALESCE((v_line->>'package_count')::INT,0));
  END LOOP;
  RETURN v_asn_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_asn(UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,INT,NUMERIC,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_inventory_dock_appointment(
  p_warehouse_id UUID,
  p_dock_id UUID,
  p_asn_id UUID,
  p_scheduled_start TIMESTAMPTZ,
  p_scheduled_end TIMESTAMPTZ,
  p_package_count INT DEFAULT 0,
  p_special_requirements TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT; v_supplier UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  IF p_scheduled_end <= p_scheduled_start THEN RAISE EXCEPTION 'INVALID_DOCK_WINDOW'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  IF p_dock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_docks WHERE id=p_dock_id AND tenant_id=v_tenant AND warehouse_id=p_warehouse_id) THEN RAISE EXCEPTION 'DOCK_NOT_IN_WAREHOUSE'; END IF;
  IF p_dock_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.inventory_dock_appointments
    WHERE tenant_id=v_tenant AND dock_id=p_dock_id AND status NOT IN ('cancelled','completed','no_show')
      AND tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange(p_scheduled_start, p_scheduled_end, '[)')
  ) THEN RAISE EXCEPTION 'DOCK_WINDOW_ALREADY_BOOKED'; END IF;
  IF p_asn_id IS NOT NULL THEN SELECT supplier_id INTO v_supplier FROM public.inventory_asns WHERE id=p_asn_id AND tenant_id=v_tenant; END IF;
  v_num := public.inventory_next_number('DOCK');
  INSERT INTO public.inventory_dock_appointments(tenant_id,appointment_number,warehouse_id,dock_id,asn_id,supplier_id,scheduled_start,scheduled_end,package_count,special_requirements,created_by)
  VALUES(v_tenant,v_num,p_warehouse_id,p_dock_id,p_asn_id,v_supplier,p_scheduled_start,p_scheduled_end,COALESCE(p_package_count,0),p_special_requirements,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.schedule_inventory_dock_appointment(UUID,UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,INT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_inventory_receiving_session(
  p_warehouse_id UUID,
  p_receiving_location_id UUID,
  p_asn_id UUID DEFAULT NULL,
  p_appointment_id UUID DEFAULT NULL,
  p_po_id UUID DEFAULT NULL,
  p_source_type TEXT DEFAULT 'manual',
  p_driver_name TEXT DEFAULT NULL,
  p_bol_number TEXT DEFAULT NULL,
  p_seal_number TEXT DEFAULT NULL,
  p_seal_status TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  IF p_receiving_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=p_receiving_location_id AND tenant_id=v_tenant AND warehouse_id=p_warehouse_id) THEN RAISE EXCEPTION 'RECEIVING_LOCATION_NOT_IN_WAREHOUSE'; END IF;
  IF p_asn_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_asns WHERE id=p_asn_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'ASN_NOT_FOUND'; END IF;
  v_num := public.inventory_next_number('RCV');
  INSERT INTO public.inventory_receiving_sessions(tenant_id,session_number,warehouse_id,receiving_location_id,asn_id,appointment_id,po_id,source_type,driver_name,bol_number,seal_number,seal_status,status,started_by)
  VALUES(v_tenant,v_num,p_warehouse_id,p_receiving_location_id,p_asn_id,p_appointment_id,p_po_id,COALESCE(p_source_type,'manual'),p_driver_name,p_bol_number,p_seal_number,p_seal_status,'receiving',auth.uid()) RETURNING id INTO v_id;
  IF p_appointment_id IS NOT NULL THEN UPDATE public.inventory_dock_appointments SET status='unloading', actual_unloading_start=NOW(), updated_at=NOW() WHERE id=p_appointment_id AND tenant_id=v_tenant; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_inventory_receiving_session(UUID,UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_lpn_for_receipt(p_session_id UUID, p_line_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_session RECORD; v_id UUID; v_num TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_session FROM public.inventory_receiving_sessions WHERE id=p_session_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  v_num := public.inventory_next_number('LPN');
  INSERT INTO public.inventory_lpn(tenant_id,lpn_number,warehouse_id,location_id,status,created_source)
  VALUES(v_tenant,v_num,v_session.warehouse_id,v_session.receiving_location_id,'received','receiving') RETURNING id INTO v_id;
  IF p_line_id IS NOT NULL THEN UPDATE public.inventory_receiving_lines SET lpn_id=v_id WHERE id=p_line_id AND tenant_id=v_tenant; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_lpn_for_receipt(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_receiving_line(
  p_session_id UUID,
  p_item_id UUID,
  p_expected_qty NUMERIC,
  p_received_qty NUMERIC,
  p_accepted_qty NUMERIC,
  p_rejected_qty NUMERIC,
  p_uom TEXT DEFAULT 'PCS',
  p_lot_number TEXT DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL,
  p_requires_quality BOOLEAN DEFAULT false,
  p_condition_status TEXT DEFAULT 'ok',
  p_target_location_id UUID DEFAULT NULL,
  p_generate_lpn BOOLEAN DEFAULT true
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_session RECORD; v_line_id UUID; v_lpn UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  SELECT * INTO v_session FROM public.inventory_receiving_sessions WHERE id=p_session_id AND tenant_id=v_tenant AND status IN ('open','receiving','exception');
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_RECEIVABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  IF p_target_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=p_target_location_id AND tenant_id=v_tenant AND warehouse_id=v_session.warehouse_id) THEN RAISE EXCEPTION 'TARGET_LOCATION_NOT_IN_WAREHOUSE'; END IF;
  INSERT INTO public.inventory_receiving_lines(tenant_id,session_id,item_id,expected_qty,received_qty,accepted_qty,rejected_qty,uom,lot_number,expiry_date,requires_quality,condition_status,target_location_id,created_by)
  VALUES(v_tenant,p_session_id,p_item_id,COALESCE(p_expected_qty,0),p_received_qty,COALESCE(p_accepted_qty,0),COALESCE(p_rejected_qty,0),COALESCE(p_uom,'PCS'),p_lot_number,p_expiry_date,COALESCE(p_requires_quality,false),COALESCE(p_condition_status,'ok'),p_target_location_id,auth.uid()) RETURNING id INTO v_line_id;
  IF p_generate_lpn THEN
    v_lpn := public.generate_inventory_lpn_for_receipt(p_session_id, v_line_id);
  END IF;
  IF p_condition_status IN ('damaged','short','over','wrong_item') THEN
    UPDATE public.inventory_receiving_sessions SET status='exception' WHERE id=p_session_id AND tenant_id=v_tenant;
  END IF;
  RETURN v_line_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_inventory_receiving_line(UUID,UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,DATE,BOOLEAN,TEXT,UUID,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_osd_case(
  p_session_id UUID,
  p_receiving_line_id UUID,
  p_osd_type TEXT,
  p_severity TEXT,
  p_description TEXT,
  p_quantity_difference NUMERIC DEFAULT NULL,
  p_attachments JSONB DEFAULT '[]'::JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT; v_asn UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  SELECT asn_id INTO v_asn FROM public.inventory_receiving_sessions WHERE id=p_session_id AND tenant_id=v_tenant;
  IF p_session_id IS NOT NULL AND v_asn IS NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_receiving_sessions WHERE id=p_session_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  v_num := public.inventory_next_number('OSD');
  INSERT INTO public.inventory_osd_cases(tenant_id,case_number,session_id,receiving_line_id,asn_id,osd_type,severity,description,quantity_difference,attachments,created_by)
  VALUES(v_tenant,v_num,p_session_id,p_receiving_line_id,v_asn,p_osd_type,COALESCE(p_severity,'warning'),p_description,p_quantity_difference,COALESCE(p_attachments,'[]'::JSONB),auth.uid()) RETURNING id INTO v_id;
  IF p_session_id IS NOT NULL THEN UPDATE public.inventory_receiving_sessions SET status='exception' WHERE id=p_session_id AND tenant_id=v_tenant; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_osd_case(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.scan_inventory_receiving_barcode(
  p_session_id UUID,
  p_scanned_value TEXT,
  p_scan_type TEXT DEFAULT 'barcode'
) RETURNS TABLE(scan_result TEXT, result_message TEXT, item_id UUID, lpn_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_session RECORD;
  v_item UUID;
  v_lpn UUID;
  v_result TEXT := 'warning';
  v_message TEXT := 'تم تسجيل المسح دون مطابقة مباشرة';
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_session FROM public.inventory_receiving_sessions WHERE id=p_session_id AND tenant_id=v_tenant AND status IN ('open','receiving','exception');
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_SCANNABLE'; END IF;

  SELECT id INTO v_item FROM public.inventory_items WHERE tenant_id=v_tenant AND (item_code=p_scanned_value OR id::TEXT=p_scanned_value) LIMIT 1;
  SELECT id INTO v_lpn FROM public.inventory_lpn WHERE tenant_id=v_tenant AND lpn_number=p_scanned_value LIMIT 1;

  IF v_item IS NOT NULL OR v_lpn IS NOT NULL THEN
    v_result := 'accepted';
    v_message := 'Scan matched';
  END IF;

  INSERT INTO public.inventory_receiving_scans(tenant_id,session_id,scanned_value,scan_type,scan_result,result_message,scanned_by)
  VALUES(v_tenant,p_session_id,p_scanned_value,COALESCE(p_scan_type,'barcode'),v_result,v_message,auth.uid());

  RETURN QUERY SELECT v_result, v_message, v_item, v_lpn;
END $$;
GRANT EXECUTE ON FUNCTION public.scan_inventory_receiving_barcode(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.print_inventory_lpn_label(p_lpn_id UUID, p_printer_name TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_lpn RECORD;
  v_payload JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_lpn FROM public.inventory_lpn WHERE id=p_lpn_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'LPN_NOT_FOUND'; END IF;
  v_payload := jsonb_build_object(
    'lpn_id', v_lpn.id,
    'lpn_number', v_lpn.lpn_number,
    'barcode', v_lpn.lpn_number,
    'warehouse_id', v_lpn.warehouse_id,
    'location_id', v_lpn.location_id,
    'status', v_lpn.status,
    'printed_at', NOW()
  );
  INSERT INTO public.inventory_lpn_label_prints(tenant_id,lpn_id,label_payload,printer_name,printed_by)
  VALUES(v_tenant,p_lpn_id,v_payload,p_printer_name,auth.uid());
  UPDATE public.inventory_lpn SET label_printed_at=NOW() WHERE id=p_lpn_id AND tenant_id=v_tenant;
  RETURN v_payload;
END $$;
GRANT EXECUTE ON FUNCTION public.print_inventory_lpn_label(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_inventory_receiving_session(p_session_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_session RECORD; v_line RECORD; v_hold_num TEXT; v_task_num TEXT; v_location UUID; v_gr_id UUID; v_gr_number TEXT; v_po_line RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_session FROM public.inventory_receiving_sessions WHERE id=p_session_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF v_session.status NOT IN ('receiving','exception','open') THEN RAISE EXCEPTION 'SESSION_NOT_POSTABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_receiving_lines WHERE session_id=p_session_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SESSION_HAS_NO_LINES'; END IF;

  IF v_session.po_id IS NOT NULL THEN
    v_gr_number := public.inventory_next_number('GR');
    INSERT INTO public.goods_receipts(tenant_id,gr_number,po_id,received_by,delivery_note_number,total_packages,has_damage,status,notes)
    VALUES(v_tenant,v_gr_number,v_session.po_id,auth.uid(),v_session.bol_number,NULL,EXISTS(SELECT 1 FROM public.inventory_osd_cases WHERE session_id=p_session_id AND tenant_id=v_tenant AND osd_type='damage'),'posted','Generated from inventory receiving session')
    RETURNING id INTO v_gr_id;
  END IF;

  FOR v_line IN SELECT * FROM public.inventory_receiving_lines WHERE session_id=p_session_id AND tenant_id=v_tenant LOOP
    IF v_line.accepted_qty > 0 THEN
      v_location := COALESCE(v_line.target_location_id, v_session.receiving_location_id);
      PERFORM public.post_inventory_movement('receipt', v_line.item_id, v_session.warehouse_id, v_location, v_line.accepted_qty, 'inventory_receiving_sessions', p_session_id, CASE WHEN v_line.requires_quality THEN 'quality_hold' ELSE NULL END);
      IF v_session.po_id IS NOT NULL THEN
        SELECT pl.* INTO v_po_line
        FROM public.po_line_items pl
        JOIN public.inventory_items ii ON ii.item_code=pl.item_code AND ii.tenant_id=pl.tenant_id
        WHERE pl.po_id=v_session.po_id AND pl.tenant_id=v_tenant AND ii.id=v_line.item_id
        ORDER BY pl.created_at
        LIMIT 1;
        IF FOUND THEN
          UPDATE public.po_line_items SET received_quantity=LEAST(quantity, received_quantity+v_line.accepted_qty) WHERE id=v_po_line.id AND tenant_id=v_tenant;
          IF v_gr_id IS NOT NULL THEN
            INSERT INTO public.gr_line_items(tenant_id,gr_id,po_line_item_id,ordered_qty,received_qty,accepted_qty,lot_number,expiry_date,location,notes)
            VALUES(v_tenant,v_gr_id,v_po_line.id,v_po_line.quantity,v_line.received_qty,v_line.accepted_qty,v_line.lot_number,v_line.expiry_date,v_location::TEXT,'Generated from inventory receiving');
          END IF;
        END IF;
      END IF;
      IF v_line.requires_quality OR v_line.condition_status='quality_hold' THEN
        v_hold_num := public.inventory_next_number('QH');
        INSERT INTO public.inventory_quarantine_holds(tenant_id,hold_number,session_id,receiving_line_id,item_id,warehouse_id,location_id,lpn_id,quantity,reason,created_by)
        VALUES(v_tenant,v_hold_num,p_session_id,v_line.id,v_line.item_id,v_session.warehouse_id,v_location,v_line.lpn_id,v_line.accepted_qty,'quality_hold',auth.uid());
        UPDATE public.inventory_stock_balances
        SET quality_hold_qty=quality_hold_qty+v_line.accepted_qty, updated_at=NOW()
        WHERE tenant_id=v_tenant AND item_id=v_line.item_id AND warehouse_id=v_session.warehouse_id AND location_id IS NOT DISTINCT FROM v_location
          AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL;
      ELSE
        v_task_num := public.inventory_next_number('PUT');
        INSERT INTO public.inventory_putaway_tasks(tenant_id,task_number,session_id,receiving_line_id,item_id,warehouse_id,from_location_id,suggested_location_id,lpn_id,quantity)
        VALUES(v_tenant,v_task_num,p_session_id,v_line.id,v_line.item_id,v_session.warehouse_id,v_session.receiving_location_id,v_line.target_location_id,v_line.lpn_id,v_line.accepted_qty);
        INSERT INTO public.inventory_inbound_notifications(tenant_id,event_type,target_role,entity_table,entity_id,title,body)
        VALUES(v_tenant,'putaway_created','inventory','inventory_receiving_sessions',p_session_id,'مهمة تخزين جديدة','تم إنشاء مهمة Put-away من جلسة الاستلام');
      END IF;
    END IF;
  END LOOP;

  UPDATE public.inventory_receiving_sessions SET status='putaway_pending', posted_at=NOW() WHERE id=p_session_id AND tenant_id=v_tenant;
  IF v_session.po_id IS NOT NULL THEN
    UPDATE public.purchase_orders po
    SET status = CASE WHEN EXISTS (SELECT 1 FROM public.po_line_items pl WHERE pl.po_id=po.id AND pl.tenant_id=v_tenant AND pl.pending_quantity > 0) THEN 'partially_received' ELSE 'received' END,
        updated_at = NOW()
    WHERE po.id=v_session.po_id AND po.tenant_id=v_tenant;
    INSERT INTO public.inventory_inbound_notifications(tenant_id,event_type,target_role,entity_table,entity_id,title,body)
    VALUES(v_tenant,'po_updated','procurement','purchase_orders',v_session.po_id,'تحديث أمر شراء من الاستلام','تم تحديث كميات الاستلام من جلسة WMS');
  END IF;
  INSERT INTO public.inventory_inbound_notifications(tenant_id,event_type,target_role,entity_table,entity_id,title,body)
  VALUES(v_tenant,'receiving_posted','inventory','inventory_receiving_sessions',p_session_id,'تم ترحيل الاستلام','تم تحديث المخزون وإنشاء مهام الإيداع/الحجر');
  IF v_session.asn_id IS NOT NULL THEN
    UPDATE public.inventory_asns SET status='partially_received', updated_at=NOW() WHERE id=v_session.asn_id AND tenant_id=v_tenant AND status NOT IN ('received','closed','cancelled');
  END IF;
  IF v_session.appointment_id IS NOT NULL THEN
    UPDATE public.inventory_dock_appointments SET status='completed', actual_completed_at=NOW(), updated_at=NOW() WHERE id=v_session.appointment_id AND tenant_id=v_tenant;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.post_inventory_receiving_session(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_inventory_supplier_dock_invite(
  p_supplier_id UUID,
  p_warehouse_id UUID,
  p_asn_id UUID,
  p_email TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  IF p_email IS NULL OR length(trim(p_email)) < 5 THEN RAISE EXCEPTION 'EMAIL_REQUIRED'; END IF;
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN RAISE EXCEPTION 'TOKEN_HASH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SUPPLIER_NOT_IN_TENANT'; END IF;
  IF p_asn_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_asns WHERE id=p_asn_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'ASN_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_supplier_dock_invites(tenant_id,supplier_id,warehouse_id,asn_id,email,token_hash,expires_at,created_by)
  VALUES(v_tenant,p_supplier_id,p_warehouse_id,p_asn_id,trim(p_email),p_token_hash,COALESCE(p_expires_at,NOW()+INTERVAL '14 days'),auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_supplier_dock_invite(UUID,UUID,UUID,TEXT,TEXT,TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_inventory_receiving_file(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_file_name TEXT,
  p_file_url TEXT,
  p_file_mime TEXT DEFAULT NULL,
  p_file_size BIGINT DEFAULT NULL,
  p_uploaded_by_email TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  IF p_entity_type NOT IN ('asn','receiving_session','receiving_line','osd_case','quarantine_hold','lpn') THEN RAISE EXCEPTION 'INVALID_ENTITY_TYPE'; END IF;
  IF p_file_url IS NULL OR length(trim(p_file_url))=0 THEN RAISE EXCEPTION 'FILE_URL_REQUIRED'; END IF;
  INSERT INTO public.inventory_receiving_attachments(tenant_id,entity_type,entity_id,file_name,file_url,file_mime,file_size,uploaded_by,uploaded_by_email)
  VALUES(v_tenant,p_entity_type,p_entity_id,COALESCE(NULLIF(trim(p_file_name),''),'attachment'),p_file_url,p_file_mime,p_file_size,auth.uid(),p_uploaded_by_email)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.attach_inventory_receiving_file(TEXT,UUID,TEXT,TEXT,TEXT,BIGINT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_cross_dock_task(
  p_session_id UUID,
  p_receiving_line_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_destination_type TEXT,
  p_destination_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF p_destination_type NOT IN ('production_order','sales_order','transfer','manual') THEN RAISE EXCEPTION 'INVALID_CROSS_DOCK_DESTINATION'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'QUANTITY_MUST_BE_POSITIVE'; END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_receiving_sessions WHERE id=p_session_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF p_receiving_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_receiving_lines WHERE id=p_receiving_line_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'RECEIVING_LINE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  v_num := public.inventory_next_number('XD');
  INSERT INTO public.inventory_cross_dock_tasks(tenant_id,task_number,session_id,receiving_line_id,item_id,quantity,destination_type,destination_id,status,created_by)
  VALUES(v_tenant,v_num,p_session_id,p_receiving_line_id,p_item_id,p_quantity,p_destination_type,p_destination_id,'planned',auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_cross_dock_task(UUID,UUID,UUID,NUMERIC,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_inventory_cross_dock_task(p_task_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_session RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_cross_dock_tasks WHERE id=p_task_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CROSS_DOCK_TASK_NOT_FOUND'; END IF;
  IF v_task.status NOT IN ('planned','ready') THEN RAISE EXCEPTION 'CROSS_DOCK_TASK_NOT_COMPLETABLE'; END IF;
  IF v_task.session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.inventory_receiving_sessions WHERE id=v_task.session_id AND tenant_id=v_tenant;
    IF FOUND THEN
      PERFORM public.post_inventory_movement('issue', v_task.item_id, v_session.warehouse_id, v_session.receiving_location_id, v_task.quantity, 'inventory_cross_dock_tasks', p_task_id, 'cross_dock');
    END IF;
  END IF;
  UPDATE public.inventory_cross_dock_tasks SET status='moved' WHERE id=p_task_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_inventory_cross_dock_task(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_inventory_putaway_task(p_task_id UUID, p_completed_location_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_putaway_tasks WHERE id=p_task_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUTAWAY_TASK_NOT_FOUND'; END IF;
  IF v_task.status NOT IN ('open','assigned') THEN RAISE EXCEPTION 'PUTAWAY_TASK_NOT_COMPLETABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=p_completed_location_id AND tenant_id=v_tenant AND warehouse_id=v_task.warehouse_id) THEN RAISE EXCEPTION 'TARGET_LOCATION_NOT_IN_WAREHOUSE'; END IF;
  IF v_task.from_location_id IS NOT NULL THEN
    PERFORM public.post_inventory_movement('issue', v_task.item_id, v_task.warehouse_id, v_task.from_location_id, v_task.quantity, 'inventory_putaway_tasks', p_task_id, 'putaway_from_receiving');
  END IF;
  PERFORM public.post_inventory_movement('putaway', v_task.item_id, v_task.warehouse_id, p_completed_location_id, v_task.quantity, 'inventory_putaway_tasks', p_task_id, 'putaway_to_storage');
  UPDATE public.inventory_putaway_tasks SET status='completed', completed_location_id=p_completed_location_id, completed_by=auth.uid(), completed_at=NOW() WHERE id=p_task_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_inventory_putaway_task(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_inventory_quarantine_hold(p_hold_id UUID, p_decision TEXT, p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_hold RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF p_decision NOT IN ('released','rejected','scrapped','returned') THEN RAISE EXCEPTION 'INVALID_QUARANTINE_DECISION'; END IF;
  SELECT * INTO v_hold FROM public.inventory_quarantine_holds WHERE id=p_hold_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUARANTINE_HOLD_NOT_FOUND'; END IF;
  IF v_hold.status <> 'on_hold' THEN RAISE EXCEPTION 'QUARANTINE_ALREADY_DECIDED'; END IF;
  IF p_decision='released' THEN
    UPDATE public.inventory_stock_balances
    SET quality_hold_qty=GREATEST(quality_hold_qty-v_hold.quantity,0), updated_at=NOW()
    WHERE tenant_id=v_tenant AND item_id=v_hold.item_id AND warehouse_id=v_hold.warehouse_id AND location_id IS NOT DISTINCT FROM v_hold.location_id
      AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL;
  ELSE
    UPDATE public.inventory_stock_balances
    SET quality_hold_qty=GREATEST(quality_hold_qty-v_hold.quantity,0), damaged_qty=damaged_qty+CASE WHEN p_decision IN ('rejected','scrapped') THEN v_hold.quantity ELSE 0 END, updated_at=NOW()
    WHERE tenant_id=v_tenant AND item_id=v_hold.item_id AND warehouse_id=v_hold.warehouse_id AND location_id IS NOT DISTINCT FROM v_hold.location_id
      AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL;
  END IF;
  UPDATE public.inventory_quarantine_holds SET status=p_decision, decided_by=auth.uid(), decided_at=NOW() WHERE id=p_hold_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_inbound_notifications(tenant_id,event_type,target_role,entity_table,entity_id,title,body)
  VALUES(v_tenant,'quality_required','inventory','inventory_quarantine_holds',p_hold_id,'قرار حجر صحي',COALESCE(p_notes,p_decision));
END $$;
GRANT EXECUTE ON FUNCTION public.decide_inventory_quarantine_hold(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_quality_ncr_from_osd(p_osd_case_id UUID, p_defect_type TEXT, p_description TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_osd RECORD; v_line RECORD; v_id UUID; v_num TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement']::TEXT[]);
  SELECT * INTO v_osd FROM public.inventory_osd_cases WHERE id=p_osd_case_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'OSD_CASE_NOT_FOUND'; END IF;
  IF v_osd.receiving_line_id IS NOT NULL THEN SELECT * INTO v_line FROM public.inventory_receiving_lines WHERE id=v_osd.receiving_line_id AND tenant_id=v_tenant; END IF;
  v_num := public.inventory_next_number('NCR');
  INSERT INTO public.inventory_quality_ncr_cases(tenant_id,ncr_number,osd_case_id,session_id,item_id,defect_type,description,created_by)
  VALUES(v_tenant,v_num,p_osd_case_id,v_osd.session_id,v_line.item_id,p_defect_type,p_description,auth.uid()) RETURNING id INTO v_id;
  UPDATE public.inventory_osd_cases SET status='under_review' WHERE id=p_osd_case_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_quality_ncr_from_osd(UUID,TEXT,TEXT) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_asns','inventory_asn_lines','inventory_dock_appointments','inventory_receiving_sessions','inventory_receiving_lines','inventory_osd_cases','inventory_quarantine_holds','inventory_putaway_tasks','inventory_cross_dock_tasks','inventory_receiving_scans','inventory_lpn_label_prints','inventory_inbound_notifications','inventory_supplier_dock_invites','inventory_receiving_attachments','inventory_quality_ncr_cases','inventory_lpn_label_templates'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''procurement'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_receiving_dashboard WITH (security_invoker=true) AS
SELECT
  w.tenant_id,
  w.id AS warehouse_id,
  w.warehouse_code,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('open','receiving','exception')) AS open_sessions,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('submitted','confirmed')) AS expected_asns,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('scheduled','checked_in','unloading')) AS active_dock_appointments,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('open','under_review')) AS open_osd_cases,
  COUNT(DISTINCT q.id) FILTER (WHERE q.status='on_hold') AS quarantine_holds
FROM public.inventory_warehouses w
LEFT JOIN public.inventory_receiving_sessions s ON s.warehouse_id=w.id AND s.tenant_id=w.tenant_id
LEFT JOIN public.inventory_asns a ON a.tenant_id=w.tenant_id
LEFT JOIN public.inventory_dock_appointments d ON d.warehouse_id=w.id AND d.tenant_id=w.tenant_id
LEFT JOIN public.inventory_osd_cases o ON o.tenant_id=w.tenant_id
LEFT JOIN public.inventory_quarantine_holds q ON q.warehouse_id=w.id AND q.tenant_id=w.tenant_id
WHERE w.tenant_id=public.current_user_tenant_id()
GROUP BY w.tenant_id,w.id,w.warehouse_code;
GRANT SELECT ON public.inventory_receiving_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_receiving_kpis WITH (security_invoker=true) AS
SELECT
  s.tenant_id,
  COUNT(*) AS total_sessions,
  COUNT(*) FILTER (WHERE s.status IN ('posted','putaway_pending','completed')) AS posted_sessions,
  COUNT(*) FILTER (WHERE s.asn_id IS NOT NULL) AS asn_backed_sessions,
  ROUND(COUNT(*) FILTER (WHERE s.asn_id IS NOT NULL)::NUMERIC / NULLIF(COUNT(*),0) * 100, 2) AS asn_compliance_percent,
  AVG(EXTRACT(EPOCH FROM (s.posted_at - s.started_at))/3600) FILTER (WHERE s.posted_at IS NOT NULL) AS avg_dock_to_stock_hours,
  (SELECT COUNT(*) FROM public.inventory_osd_cases o WHERE o.tenant_id=s.tenant_id) AS osd_cases
FROM public.inventory_receiving_sessions s
WHERE s.tenant_id=public.current_user_tenant_id()
GROUP BY s.tenant_id;
GRANT SELECT ON public.inventory_receiving_kpis TO authenticated;


CREATE OR REPLACE VIEW public.inventory_receiving_osd_report WITH (security_invoker=true) AS
SELECT tenant_id, osd_type, severity, status, COUNT(*) AS case_count, MIN(created_at) AS first_case_at, MAX(created_at) AS last_case_at
FROM public.inventory_osd_cases
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id, osd_type, severity, status;
GRANT SELECT ON public.inventory_receiving_osd_report TO authenticated;

CREATE OR REPLACE VIEW public.inventory_receiving_productivity WITH (security_invoker=true) AS
SELECT l.tenant_id, l.created_by AS employee_id, COUNT(*) AS lines_count, COALESCE(SUM(l.accepted_qty),0) AS accepted_qty, MIN(l.created_at) AS first_scan_at, MAX(l.created_at) AS last_scan_at
FROM public.inventory_receiving_lines l
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id, l.created_by;
GRANT SELECT ON public.inventory_receiving_productivity TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_asns') IS NULL OR to_regclass('public.inventory_receiving_sessions') IS NULL OR to_regclass('public.inventory_osd_cases') IS NULL OR to_regclass('public.inventory_receiving_scans') IS NULL OR to_regclass('public.inventory_lpn_label_prints') IS NULL OR to_regclass('public.inventory_receiving_attachments') IS NULL OR to_regclass('public.inventory_quality_ncr_cases') IS NULL THEN
    RAISE EXCEPTION '0205 failed: receiving inbound tables missing';
  END IF;
  IF to_regprocedure('public.post_inventory_receiving_session(uuid)') IS NULL OR to_regprocedure('public.scan_inventory_receiving_barcode(uuid,text,text)') IS NULL OR to_regprocedure('public.print_inventory_lpn_label(uuid,text)') IS NULL OR to_regprocedure('public.complete_inventory_putaway_task(uuid,uuid)') IS NULL OR to_regprocedure('public.create_inventory_quality_ncr_from_osd(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION '0205 failed: post receiving session missing';
  END IF;
  RAISE NOTICE '✅ 0205: Inventory receiving & inbound operations foundation applied';
END $$;
