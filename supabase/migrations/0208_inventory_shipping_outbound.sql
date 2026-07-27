-- ============================================================================
-- 0208 — Inventory Unit 04: Shipping & Outbound Operations
-- التوثيق: docs/inventory/04-shipping-outbound-operations.md
-- يغطي: Packing Station, Shipping Documents, Rate Shopping, Carrier integration
-- foundation, Staging, Loading, Tracking, Notifications, Digital Manifest, KPIs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_packing_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  station_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  has_scale BOOLEAN NOT NULL DEFAULT true,
  has_label_printer BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, station_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_packaging_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'box' CHECK (package_type IN ('box','pallet','envelope','crate','bubble','tape','other')),
  length_cm NUMERIC(12,3), width_cm NUMERIC(12,3), height_cm NUMERIC(12,3),
  empty_weight_kg NUMERIC(12,3) DEFAULT 0,
  max_weight_kg NUMERIC(12,3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, material_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_packing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  packing_number TEXT NOT NULL,
  pick_order_id UUID REFERENCES public.inventory_pick_orders(id) ON DELETE SET NULL,
  pick_list_id UUID REFERENCES public.inventory_pick_lists(id) ON DELETE SET NULL,
  station_id UUID REFERENCES public.inventory_packing_stations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','verifying','packed','exception','cancelled')),
  packed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(tenant_id, packing_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_number TEXT NOT NULL,
  packing_session_id UUID NOT NULL REFERENCES public.inventory_packing_sessions(id) ON DELETE CASCADE,
  packaging_material_id UUID REFERENCES public.inventory_packaging_materials(id) ON DELETE SET NULL,
  package_barcode TEXT NOT NULL,
  actual_weight_kg NUMERIC(12,3),
  dimensional_weight_kg NUMERIC(12,3),
  length_cm NUMERIC(12,3), width_cm NUMERIC(12,3), height_cm NUMERIC(12,3),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','verified','closed','staged','loaded','shipped','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(tenant_id, package_number),
  UNIQUE(tenant_id, package_barcode)
);

CREATE TABLE IF NOT EXISTS public.inventory_package_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.inventory_packages(id) ON DELETE CASCADE,
  pick_task_id UUID REFERENCES public.inventory_pick_tasks(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  scan_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('aramex','smsa','dhl','fedex','ups','manual','other')),
  api_mode TEXT NOT NULL DEFAULT 'simulated' CHECK (api_mode IN ('simulated','live')),
  credentials_reference TEXT,
  tracking_url_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, carrier_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_carrier_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES public.inventory_carriers(id) ON DELETE CASCADE,
  service_code TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_level TEXT NOT NULL DEFAULT 'standard' CHECK (service_level IN ('express','standard','economy','ground','priority')),
  estimated_days INT DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(tenant_id, carrier_id, service_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_number TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('sales_order','transfer','production_order','manual')),
  source_id UUID,
  shipper_name TEXT,
  shipper_address TEXT,
  consignee_name TEXT NOT NULL,
  consignee_address TEXT NOT NULL,
  destination_city TEXT,
  destination_country TEXT DEFAULT 'SA',
  incoterms TEXT DEFAULT 'DDP' CHECK (incoterms IN ('EXW','FOB','CIF','DDP','FCA','DAP')),
  carrier_id UUID REFERENCES public.inventory_carriers(id) ON DELETE SET NULL,
  carrier_service_id UUID REFERENCES public.inventory_carrier_services(id) ON DELETE SET NULL,
  tracking_number TEXT,
  tracking_url TEXT,
  service_level TEXT,
  estimated_delivery_date DATE,
  actual_ship_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  shipping_cost NUMERIC(16,2) DEFAULT 0,
  currency_code CHAR(3) DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','packed','rated','label_printed','staged','loaded','shipped','delivered','delayed','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, shipment_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_shipment_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.inventory_shipments(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.inventory_packages(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, shipment_id, package_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_carrier_rate_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.inventory_shipments(id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES public.inventory_carriers(id) ON DELETE CASCADE,
  carrier_service_id UUID REFERENCES public.inventory_carrier_services(id) ON DELETE SET NULL,
  quoted_cost NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency_code CHAR(3) DEFAULT 'SAR',
  estimated_delivery_date DATE,
  selected BOOLEAN NOT NULL DEFAULT false,
  quote_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_shipping_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.inventory_shipments(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.inventory_packages(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('shipping_label','packing_list','bol','commercial_invoice','certificate_of_origin','msds','customs','manifest')),
  document_number TEXT NOT NULL,
  document_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','printed','void')),
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, document_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_shipping_staging_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  lane_code TEXT NOT NULL,
  carrier_id UUID REFERENCES public.inventory_carriers(id) ON DELETE SET NULL,
  wave_id UUID REFERENCES public.inventory_pick_waves(id) ON DELETE SET NULL,
  destination_zone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','full','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, lane_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_loading_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  manifest_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES public.inventory_carriers(id) ON DELETE SET NULL,
  truck_number TEXT,
  driver_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','loading','closed','sent','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(tenant_id, manifest_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_manifest_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  manifest_id UUID NOT NULL REFERENCES public.inventory_loading_manifests(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.inventory_packages(id) ON DELETE RESTRICT,
  loaded BOOLEAN NOT NULL DEFAULT false,
  loaded_at TIMESTAMPTZ,
  loaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, manifest_id, package_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_loading_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  manifest_id UUID NOT NULL REFERENCES public.inventory_loading_manifests(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.inventory_packages(id) ON DELETE SET NULL,
  scanned_value TEXT NOT NULL,
  scan_result TEXT NOT NULL CHECK (scan_result IN ('accepted','rejected','warning')),
  result_message TEXT,
  scanned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_shipment_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.inventory_shipments(id) ON DELETE CASCADE,
  event_code TEXT NOT NULL,
  event_status TEXT NOT NULL CHECK (event_status IN ('label_created','picked_up','in_transit','out_for_delivery','delivered','delayed','exception','returned')),
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location_text TEXT,
  details TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS public.inventory_customer_shipping_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.inventory_shipments(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('shipped','delivered','delayed','exception')),
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','whatsapp','system')),
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);


CREATE TABLE IF NOT EXISTS public.inventory_rate_shopping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'cheapest_on_time' CHECK (strategy IN ('cheapest','fastest','cheapest_on_time','preferred_carrier')),
  max_delivery_days INT,
  preferred_carrier_id UUID REFERENCES public.inventory_carriers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, rule_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_carrier_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES public.inventory_carriers(id) ON DELETE SET NULL,
  tracking_number TEXT,
  event_status TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_international_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('commercial_invoice','certificate_of_origin','msds','customs','international_packing_list')),
  country_code TEXT,
  content_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, template_code)
);

CREATE INDEX IF NOT EXISTS idx_inventory_shipments_status ON public.inventory_shipments(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_packages_status ON public.inventory_packages(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_loading_scans_manifest ON public.inventory_loading_scans(tenant_id,manifest_id,scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_carrier_webhook_events_tracking ON public.inventory_carrier_webhook_events(tenant_id,tracking_number,received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_rate_rules_active ON public.inventory_rate_shopping_rules(tenant_id,is_active,created_at DESC);

CREATE OR REPLACE FUNCTION public.start_inventory_packing_session(p_pick_order_id UUID, p_pick_list_id UUID, p_station_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  INSERT INTO public.inventory_packing_sessions(tenant_id,packing_number,pick_order_id,pick_list_id,station_id,packed_by)
  VALUES(v_tenant,public.inventory_next_number('PACK'),p_pick_order_id,p_pick_list_id,p_station_id,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_inventory_packing_session(UUID,UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.suggest_inventory_carton(p_packing_session_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT id INTO v_id FROM public.inventory_packaging_materials WHERE tenant_id=v_tenant AND is_active AND package_type='box' ORDER BY COALESCE(max_weight_kg,999999), length_cm*width_cm*height_cm NULLS LAST LIMIT 1;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.suggest_inventory_carton(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_inventory_pack_scan(p_package_id UUID, p_pick_task_id UUID, p_item_id UUID, p_quantity NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_packages WHERE id=p_package_id AND tenant_id=v_tenant AND status IN ('open','verified')) THEN RAISE EXCEPTION 'PACKAGE_NOT_OPEN'; END IF;
  IF p_pick_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_pick_tasks WHERE id=p_pick_task_id AND tenant_id=v_tenant AND item_id=p_item_id AND status='picked') THEN RAISE EXCEPTION 'PICK_TASK_NOT_PICKED_OR_ITEM_MISMATCH'; END IF;
  INSERT INTO public.inventory_package_lines(tenant_id,package_id,pick_task_id,item_id,quantity,scan_verified)
  VALUES(v_tenant,p_package_id,p_pick_task_id,p_item_id,p_quantity,true) RETURNING id INTO v_id;
  UPDATE public.inventory_packages SET status='verified' WHERE id=p_package_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.verify_inventory_pack_scan(UUID,UUID,UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_inventory_package(p_packing_session_id UUID, p_packaging_material_id UUID, p_actual_weight_kg NUMERIC, p_length_cm NUMERIC, p_width_cm NUMERIC, p_height_cm NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_dim NUMERIC;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_packing_sessions WHERE id=p_packing_session_id AND tenant_id=v_tenant AND status IN ('open','verifying')) THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_OPEN'; END IF;
  v_dim := COALESCE(p_length_cm,0)*COALESCE(p_width_cm,0)*COALESCE(p_height_cm,0)/5000;
  INSERT INTO public.inventory_packages(tenant_id,package_number,packing_session_id,packaging_material_id,package_barcode,actual_weight_kg,dimensional_weight_kg,length_cm,width_cm,height_cm,status,closed_at)
  VALUES(v_tenant,public.inventory_next_number('PKG'),p_packing_session_id,p_packaging_material_id,public.inventory_next_number('PKGB'),p_actual_weight_kg,v_dim,p_length_cm,p_width_cm,p_height_cm,'closed',NOW()) RETURNING id INTO v_id;
  UPDATE public.inventory_packing_sessions SET status='packed', completed_at=NOW() WHERE id=p_packing_session_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.close_inventory_package(UUID,UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_shipment(p_source_type TEXT,p_source_id UUID,p_consignee_name TEXT,p_consignee_address TEXT,p_destination_city TEXT,p_destination_country TEXT,p_package_ids UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_pkg UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  INSERT INTO public.inventory_shipments(tenant_id,shipment_number,source_type,source_id,consignee_name,consignee_address,destination_city,destination_country,created_by)
  VALUES(v_tenant,public.inventory_next_number('SHP'),p_source_type,p_source_id,p_consignee_name,p_consignee_address,p_destination_city,COALESCE(p_destination_country,'SA'),auth.uid()) RETURNING id INTO v_id;
  FOREACH v_pkg IN ARRAY p_package_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.inventory_packages WHERE id=v_pkg AND tenant_id=v_tenant AND status IN ('closed','verified')) THEN RAISE EXCEPTION 'PACKAGE_NOT_READY_FOR_SHIPMENT'; END IF;
    INSERT INTO public.inventory_shipment_packages(tenant_id,shipment_id,package_id) VALUES(v_tenant,v_id,v_pkg);
  END LOOP;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_shipment(TEXT,UUID,TEXT,TEXT,TEXT,TEXT,UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.rate_shop_inventory_shipment(p_shipment_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_shipments WHERE id=p_shipment_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SHIPMENT_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_carrier_rate_quotes(tenant_id,shipment_id,carrier_id,carrier_service_id,quoted_cost,estimated_delivery_date,quote_payload)
  SELECT v_tenant,p_shipment_id,c.id,s.id,CASE s.service_level WHEN 'express' THEN 120 WHEN 'priority' THEN 78 WHEN 'economy' THEN 45 ELSE 85 END,CURRENT_DATE+COALESCE(s.estimated_days,2),jsonb_build_object('mode',c.api_mode,'provider',c.provider)
  FROM public.inventory_carriers c LEFT JOIN public.inventory_carrier_services s ON s.carrier_id=c.id AND s.tenant_id=c.tenant_id AND s.is_active
  WHERE c.tenant_id=v_tenant AND c.is_active;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE public.inventory_shipments SET status='rated' WHERE id=p_shipment_id AND tenant_id=v_tenant;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.rate_shop_inventory_shipment(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_shipping_document(p_shipment_id UUID,p_package_id UUID,p_document_type TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_ship RECORD; v_id UUID; v_payload JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_ship FROM public.inventory_shipments WHERE id=p_shipment_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIPMENT_NOT_FOUND'; END IF;
  IF p_document_type NOT IN ('shipping_label','packing_list','bol','commercial_invoice','certificate_of_origin','msds','customs','manifest') THEN RAISE EXCEPTION 'INVALID_SHIPPING_DOCUMENT'; END IF;
  v_payload := jsonb_build_object('shipment_number',v_ship.shipment_number,'tracking_number',v_ship.tracking_number,'consignee',v_ship.consignee_name,'address',v_ship.consignee_address,'document_type',p_document_type,'generated_at',NOW());
  INSERT INTO public.inventory_shipping_documents(tenant_id,shipment_id,package_id,document_type,document_number,document_payload,generated_by)
  VALUES(v_tenant,p_shipment_id,p_package_id,p_document_type,public.inventory_next_number(upper(left(p_document_type,3))),v_payload,auth.uid()) RETURNING id INTO v_id;
  IF p_document_type='shipping_label' THEN UPDATE public.inventory_shipments SET status='label_printed' WHERE id=p_shipment_id AND tenant_id=v_tenant; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_shipping_document(UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.stage_inventory_package(p_package_id UUID,p_lane_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_shipping_staging_lanes WHERE id=p_lane_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'STAGING_LANE_NOT_FOUND'; END IF;
  UPDATE public.inventory_packages SET status='staged' WHERE id=p_package_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.stage_inventory_package(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.scan_inventory_load_package(p_manifest_id UUID,p_package_barcode TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_pkg RECORD; v_mp RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_pkg FROM public.inventory_packages WHERE tenant_id=v_tenant AND package_barcode=p_package_barcode;
  IF NOT FOUND THEN
    INSERT INTO public.inventory_loading_scans(tenant_id,manifest_id,scanned_value,scan_result,result_message,scanned_by) VALUES(v_tenant,p_manifest_id,p_package_barcode,'rejected','Package not found',auth.uid());
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
  END IF;
  SELECT * INTO v_mp FROM public.inventory_manifest_packages WHERE tenant_id=v_tenant AND manifest_id=p_manifest_id AND package_id=v_pkg.id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.inventory_loading_scans(tenant_id,manifest_id,package_id,scanned_value,scan_result,result_message,scanned_by) VALUES(v_tenant,p_manifest_id,v_pkg.id,p_package_barcode,'rejected','Package not in manifest',auth.uid());
    RAISE EXCEPTION 'PACKAGE_NOT_IN_MANIFEST';
  END IF;
  UPDATE public.inventory_manifest_packages SET loaded=true,loaded_at=NOW(),loaded_by=auth.uid() WHERE id=v_mp.id;
  UPDATE public.inventory_packages SET status='loaded' WHERE id=v_pkg.id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_loading_scans(tenant_id,manifest_id,package_id,scanned_value,scan_result,result_message,scanned_by) VALUES(v_tenant,p_manifest_id,v_pkg.id,p_package_barcode,'accepted','Loaded',auth.uid());
  RETURN 'loaded';
END $$;
GRANT EXECUTE ON FUNCTION public.scan_inventory_load_package(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_inventory_loading_manifest(p_manifest_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_manifest RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_manifest FROM public.inventory_loading_manifests WHERE id=p_manifest_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANIFEST_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_manifest_packages WHERE manifest_id=p_manifest_id AND tenant_id=v_tenant AND loaded=false) THEN RAISE EXCEPTION 'MANIFEST_HAS_UNLOADED_PACKAGES'; END IF;
  UPDATE public.inventory_loading_manifests SET status='closed',closed_by=auth.uid(),closed_at=NOW() WHERE id=p_manifest_id AND tenant_id=v_tenant;
  UPDATE public.inventory_shipments s SET status='shipped',actual_ship_at=NOW() FROM public.inventory_shipment_packages sp JOIN public.inventory_manifest_packages mp ON mp.package_id=sp.package_id AND mp.tenant_id=sp.tenant_id WHERE sp.shipment_id=s.id AND mp.manifest_id=p_manifest_id AND s.tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.close_inventory_loading_manifest(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_tracking_event(p_shipment_id UUID,p_event_status TEXT,p_location_text TEXT DEFAULT NULL,p_details TEXT DEFAULT NULL,p_raw_payload JSONB DEFAULT '{}'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_recipient TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF p_event_status NOT IN ('label_created','picked_up','in_transit','out_for_delivery','delivered','delayed','exception','returned') THEN RAISE EXCEPTION 'INVALID_TRACKING_STATUS'; END IF;
  INSERT INTO public.inventory_shipment_tracking_events(tenant_id,shipment_id,event_code,event_status,location_text,details,raw_payload)
  VALUES(v_tenant,p_shipment_id,public.inventory_next_number('TRK'),p_event_status,p_location_text,p_details,COALESCE(p_raw_payload,'{}'::JSONB)) RETURNING id INTO v_id;
  UPDATE public.inventory_shipments SET status=CASE WHEN p_event_status='delivered' THEN 'delivered' WHEN p_event_status='delayed' THEN 'delayed' WHEN p_event_status IN ('picked_up','in_transit','out_for_delivery') THEN 'shipped' ELSE status END, delivered_at=CASE WHEN p_event_status='delivered' THEN NOW() ELSE delivered_at END, updated_at=NOW() WHERE id=p_shipment_id AND tenant_id=v_tenant;
  SELECT consignee_name INTO v_recipient FROM public.inventory_shipments WHERE id=p_shipment_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_customer_shipping_notifications(tenant_id,shipment_id,notification_type,recipient,subject,body)
  VALUES(v_tenant,p_shipment_id,CASE WHEN p_event_status='delivered' THEN 'delivered' WHEN p_event_status='delayed' THEN 'delayed' ELSE 'shipped' END,COALESCE(v_recipient,'customer'),'تحديث الشحنة',COALESCE(p_details,p_event_status));
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_inventory_tracking_event(UUID,TEXT,TEXT,TEXT,JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_inventory_package(
  p_packing_session_id UUID,
  p_packaging_material_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_packing_sessions WHERE id=p_packing_session_id AND tenant_id=v_tenant AND status IN ('open','verifying')) THEN RAISE EXCEPTION 'PACKING_SESSION_NOT_OPEN'; END IF;
  INSERT INTO public.inventory_packages(tenant_id,package_number,packing_session_id,packaging_material_id,package_barcode,status)
  VALUES(v_tenant,public.inventory_next_number('PKG'),p_packing_session_id,p_packaging_material_id,public.inventory_next_number('PKGB'),'open')
  RETURNING id INTO v_id;
  UPDATE public.inventory_packing_sessions SET status='verifying' WHERE id=p_packing_session_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_package(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.select_inventory_best_rate_quote(p_shipment_id UUID, p_rule_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_rule RECORD; v_quote UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF p_rule_id IS NOT NULL THEN SELECT * INTO v_rule FROM public.inventory_rate_shopping_rules WHERE id=p_rule_id AND tenant_id=v_tenant AND is_active; END IF;
  SELECT q.id INTO v_quote
  FROM public.inventory_carrier_rate_quotes q
  LEFT JOIN public.inventory_carrier_services s ON s.id=q.carrier_service_id AND s.tenant_id=q.tenant_id
  WHERE q.tenant_id=v_tenant AND q.shipment_id=p_shipment_id
    AND (v_rule.id IS NULL OR v_rule.strategy <> 'preferred_carrier' OR q.carrier_id=v_rule.preferred_carrier_id)
    AND (v_rule.id IS NULL OR v_rule.max_delivery_days IS NULL OR COALESCE(s.estimated_days,999) <= v_rule.max_delivery_days)
  ORDER BY
    CASE WHEN v_rule.strategy='fastest' THEN COALESCE(s.estimated_days,999) ELSE 0 END ASC,
    q.quoted_cost ASC,
    COALESCE(s.estimated_days,999) ASC
  LIMIT 1;
  IF v_quote IS NULL THEN RAISE EXCEPTION 'NO_RATE_QUOTE_AVAILABLE'; END IF;
  UPDATE public.inventory_carrier_rate_quotes SET selected=false WHERE tenant_id=v_tenant AND shipment_id=p_shipment_id;
  UPDATE public.inventory_carrier_rate_quotes SET selected=true WHERE id=v_quote AND tenant_id=v_tenant;
  UPDATE public.inventory_shipments sh
  SET carrier_id=q.carrier_id, carrier_service_id=q.carrier_service_id, shipping_cost=q.quoted_cost, currency_code=q.currency_code,
      estimated_delivery_date=q.estimated_delivery_date, status='rated', updated_at=NOW()
  FROM public.inventory_carrier_rate_quotes q
  WHERE q.id=v_quote AND sh.id=p_shipment_id AND sh.tenant_id=v_tenant;
  RETURN v_quote;
END $$;
GRANT EXECUTE ON FUNCTION public.select_inventory_best_rate_quote(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_loading_manifest(p_warehouse_id UUID, p_carrier_id UUID DEFAULT NULL, p_truck_number TEXT DEFAULT NULL, p_driver_name TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_loading_manifests(tenant_id,manifest_number,warehouse_id,carrier_id,truck_number,driver_name,created_by)
  VALUES(v_tenant,public.inventory_next_number('MAN'),p_warehouse_id,p_carrier_id,p_truck_number,p_driver_name,auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_loading_manifest(UUID,UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_inventory_package_to_manifest(p_manifest_id UUID, p_package_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_loading_manifests WHERE id=p_manifest_id AND tenant_id=v_tenant AND status IN ('open','loading')) THEN RAISE EXCEPTION 'MANIFEST_NOT_OPEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_packages WHERE id=p_package_id AND tenant_id=v_tenant AND status IN ('closed','staged','verified')) THEN RAISE EXCEPTION 'PACKAGE_NOT_READY_FOR_MANIFEST'; END IF;
  INSERT INTO public.inventory_manifest_packages(tenant_id,manifest_id,package_id) VALUES(v_tenant,p_manifest_id,p_package_id)
  ON CONFLICT (tenant_id,manifest_id,package_id) DO UPDATE SET loaded=public.inventory_manifest_packages.loaded
  RETURNING id INTO v_id;
  UPDATE public.inventory_loading_manifests SET status='loading' WHERE id=p_manifest_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_inventory_package_to_manifest(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_inventory_carrier_webhook(p_carrier_id UUID, p_tracking_number TEXT, p_event_status TEXT, p_payload JSONB DEFAULT '{}'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_shipment UUID;
BEGIN
  -- service/internal caller may use this through Edge Function with service role, but remains tenant-scoped by carrier.
  SELECT tenant_id INTO v_tenant FROM public.inventory_carriers WHERE id=p_carrier_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CARRIER_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_carrier_webhook_events(tenant_id,carrier_id,tracking_number,event_status,payload)
  VALUES(v_tenant,p_carrier_id,p_tracking_number,p_event_status,COALESCE(p_payload,'{}'::JSONB)) RETURNING id INTO v_id;
  SELECT id INTO v_shipment FROM public.inventory_shipments WHERE tenant_id=v_tenant AND tracking_number=p_tracking_number LIMIT 1;
  IF v_shipment IS NOT NULL THEN
    INSERT INTO public.inventory_shipment_tracking_events(tenant_id,shipment_id,event_code,event_status,raw_payload)
    VALUES(v_tenant,v_shipment,public.inventory_next_number('TRK'),p_event_status,COALESCE(p_payload,'{}'::JSONB));
    UPDATE public.inventory_shipments SET status=CASE WHEN p_event_status='delivered' THEN 'delivered' WHEN p_event_status='delayed' THEN 'delayed' ELSE status END, updated_at=NOW() WHERE id=v_shipment AND tenant_id=v_tenant;
    UPDATE public.inventory_carrier_webhook_events SET processed=true WHERE id=v_id;
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.receive_inventory_carrier_webhook(UUID,TEXT,TEXT,JSONB) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_packing_stations','inventory_packaging_materials','inventory_packing_sessions','inventory_packages','inventory_package_lines','inventory_carriers','inventory_carrier_services','inventory_shipments','inventory_shipment_packages','inventory_carrier_rate_quotes','inventory_shipping_documents','inventory_shipping_staging_lanes','inventory_loading_manifests','inventory_manifest_packages','inventory_loading_scans','inventory_shipment_tracking_events','inventory_customer_shipping_notifications','inventory_rate_shopping_rules','inventory_carrier_webhook_events','inventory_international_document_templates'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_shipping_dashboard WITH (security_invoker=true) AS
SELECT tenant_id,
  COUNT(*) AS total_shipments,
  COUNT(*) FILTER (WHERE status IN ('draft','packed','rated','label_printed','staged','loaded')) AS open_shipments,
  COUNT(*) FILTER (WHERE status='shipped') AS shipped,
  COUNT(*) FILTER (WHERE status='delivered') AS delivered,
  COUNT(*) FILTER (WHERE status='delayed') AS delayed,
  COALESCE(SUM(shipping_cost),0) AS total_shipping_cost
FROM public.inventory_shipments
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id;
GRANT SELECT ON public.inventory_shipping_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_shipping_kpis WITH (security_invoker=true) AS
SELECT tenant_id,
  COUNT(*) AS total_shipments,
  ROUND(COUNT(*) FILTER (WHERE actual_ship_at <= COALESCE(estimated_delivery_date::TIMESTAMPTZ, actual_ship_at))::NUMERIC / NULLIF(COUNT(*),0) * 100,2) AS on_time_shipping_rate,
  ROUND(COUNT(*) FILTER (WHERE status IN ('shipped','delivered') AND tracking_number IS NOT NULL)::NUMERIC / NULLIF(COUNT(*),0) * 100,2) AS perfect_order_foundation_rate,
  ROUND(COALESCE(SUM(shipping_cost),0)/NULLIF(COUNT(*),0),2) AS shipping_cost_per_order,
  COUNT(*) FILTER (WHERE status='delayed') AS delayed_shipments
FROM public.inventory_shipments
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id;
GRANT SELECT ON public.inventory_shipping_kpis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_carrier_performance WITH (security_invoker=true) AS
SELECT s.tenant_id,s.carrier_id,c.name_ar AS carrier_name,COUNT(*) AS shipments,
  COUNT(*) FILTER (WHERE s.status='delivered') AS delivered,
  COUNT(*) FILTER (WHERE s.status='delayed') AS delayed,
  ROUND(COUNT(*) FILTER (WHERE s.status='delivered')::NUMERIC/NULLIF(COUNT(*),0)*100,2) AS delivery_rate
FROM public.inventory_shipments s
LEFT JOIN public.inventory_carriers c ON c.id=s.carrier_id AND c.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
GROUP BY s.tenant_id,s.carrier_id,c.name_ar;
GRANT SELECT ON public.inventory_carrier_performance TO authenticated;

CREATE OR REPLACE VIEW public.inventory_shipping_cost_report WITH (security_invoker=true) AS
SELECT tenant_id, carrier_id, currency_code, COUNT(*) AS shipments, SUM(shipping_cost) AS total_cost, AVG(shipping_cost) AS avg_cost
FROM public.inventory_shipments
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id,carrier_id,currency_code;
GRANT SELECT ON public.inventory_shipping_cost_report TO authenticated;


CREATE OR REPLACE VIEW public.inventory_shipment_tracking_timeline WITH (security_invoker=true) AS
SELECT s.tenant_id,s.id AS shipment_id,s.shipment_number,s.tracking_number,e.event_status,e.event_time,e.location_text,e.details
FROM public.inventory_shipments s
LEFT JOIN public.inventory_shipment_tracking_events e ON e.shipment_id=s.id AND e.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
ORDER BY s.created_at DESC,e.event_time DESC;
GRANT SELECT ON public.inventory_shipment_tracking_timeline TO authenticated;

CREATE OR REPLACE VIEW public.inventory_manifest_completion WITH (security_invoker=true) AS
SELECT m.tenant_id,m.id AS manifest_id,m.manifest_number,m.status,COUNT(mp.id) AS package_count,COUNT(mp.id) FILTER (WHERE mp.loaded) AS loaded_count,
  CASE WHEN COUNT(mp.id)>0 THEN ROUND(COUNT(mp.id) FILTER (WHERE mp.loaded)::NUMERIC/COUNT(mp.id)*100,2) ELSE 0 END AS completion_percent
FROM public.inventory_loading_manifests m
LEFT JOIN public.inventory_manifest_packages mp ON mp.manifest_id=m.id AND mp.tenant_id=m.tenant_id
WHERE m.tenant_id=public.current_user_tenant_id()
GROUP BY m.tenant_id,m.id,m.manifest_number,m.status;
GRANT SELECT ON public.inventory_manifest_completion TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_shipments') IS NULL OR to_regclass('public.inventory_packages') IS NULL OR to_regclass('public.inventory_loading_manifests') IS NULL OR to_regclass('public.inventory_carrier_webhook_events') IS NULL OR to_regclass('public.inventory_shipment_tracking_timeline') IS NULL THEN
    RAISE EXCEPTION '0208 failed: shipping tables missing';
  END IF;
  IF to_regprocedure('public.scan_inventory_load_package(uuid,text)') IS NULL OR to_regprocedure('public.select_inventory_best_rate_quote(uuid,uuid)') IS NULL OR to_regprocedure('public.receive_inventory_carrier_webhook(uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION '0208 failed: loading scan missing';
  END IF;
  RAISE NOTICE '✅ 0208: Inventory shipping/outbound operations applied';
END $$;
