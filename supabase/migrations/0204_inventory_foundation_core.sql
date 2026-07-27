-- ============================================================================
-- 0204 — Inventory/Warehouse Foundation Core
-- التوثيق: docs/inventory/00-inventory-foundation-technical-addendum.md
-- الهدف: تثبيت الأساس المشترك لكل وحدات WMS الثمانية قبل تنفيذ Receiving.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
CHECK (role IN ('employee','hr','admin','gatekeeper','developer','supervisor','manager','it_admin','tech','finance','marketing','sales','procurement','inventory'));

CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.inventory_uom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  precision_digits INT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  item_type TEXT NOT NULL DEFAULT 'raw_material' CHECK (item_type IN ('raw_material','finished_good','semi_finished','consumable','spare_part','packaging','service','other')),
  category_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  base_uom TEXT NOT NULL DEFAULT 'PCS',
  tracking_policy TEXT NOT NULL DEFAULT 'none' CHECK (tracking_policy IN ('none','lot','serial','expiry','lot_expiry')),
  unspsc_code TEXT,
  min_qty NUMERIC(16,4) DEFAULT 0,
  max_qty NUMERIC(16,4),
  reorder_point NUMERIC(16,4) DEFAULT 0,
  reorder_qty NUMERIC(16,4) DEFAULT 0,
  is_perishable BOOLEAN NOT NULL DEFAULT false,
  is_fragile BOOLEAN NOT NULL DEFAULT false,
  requires_cold_chain BOOLEAN NOT NULL DEFAULT false,
  is_hazardous BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, item_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_item_uom_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  from_uom TEXT NOT NULL,
  to_uom TEXT NOT NULL,
  factor NUMERIC(18,8) NOT NULL CHECK (factor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, item_id, from_uom, to_uom)
);

CREATE TABLE IF NOT EXISTS public.inventory_item_storage_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  allowed_warehouse_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  allowed_zone_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  requires_temperature_control BOOLEAN NOT NULL DEFAULT false,
  min_temperature NUMERIC(8,2),
  max_temperature NUMERIC(8,2),
  stacking_limit INT,
  hazard_class TEXT,
  abc_class TEXT CHECK (abc_class IS NULL OR abc_class IN ('A','B','C')),
  velocity_class TEXT CHECK (velocity_class IS NULL OR velocity_class IN ('fast','medium','slow','non_moving')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  warehouse_type TEXT NOT NULL DEFAULT 'main' CHECK (warehouse_type IN ('main','raw_material','finished_good','returns','damaged','quarantine','cold','cross_dock','shipping','other')),
  branch_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','closed')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  zone_code TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'bulk_storage' CHECK (zone_type IN ('receiving','quarantine','bulk_storage','forward_pick','packing','shipping','returns','damaged','cold','cross_dock')),
  name_ar TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','full','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, zone_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  location_code TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'bin' CHECK (location_type IN ('zone','aisle','rack','shelf','bin','dock','staging','quarantine')),
  barcode TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','full','closed')),
  max_capacity NUMERIC(16,4),
  current_capacity_used NUMERIC(16,4) NOT NULL DEFAULT 0,
  requires_cold_chain BOOLEAN NOT NULL DEFAULT false,
  hazardous_allowed BOOLEAN NOT NULL DEFAULT false,
  x_coordinate NUMERIC(12,4),
  y_coordinate NUMERIC(12,4),
  z_coordinate NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, location_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_docks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  dock_code TEXT NOT NULL,
  dock_type TEXT NOT NULL DEFAULT 'receiving' CHECK (dock_type IN ('receiving','shipping','both')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','maintenance','closed')),
  max_truck_size TEXT,
  calendar_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, dock_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_warehouse_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_receive BOOLEAN NOT NULL DEFAULT true,
  can_putaway BOOLEAN NOT NULL DEFAULT true,
  can_pick BOOLEAN NOT NULL DEFAULT true,
  can_pack BOOLEAN NOT NULL DEFAULT false,
  can_ship BOOLEAN NOT NULL DEFAULT false,
  can_count BOOLEAN NOT NULL DEFAULT false,
  can_adjust BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  manufacture_date DATE,
  expiry_date DATE,
  supplier_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','expired','closed')),
  quality_status TEXT NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','approved','quarantine','rejected','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, item_id, lot_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_serial_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','picked','shipped','scrapped','blocked')),
  current_warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  current_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, item_id, serial_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_lpn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lpn_number TEXT NOT NULL,
  parent_lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','received','in_quarantine','putaway_pending','stored','picked','packed','shipped','closed','void')),
  label_printed_at TIMESTAMPTZ,
  created_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, lpn_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item','location','lpn','shipment','employee','equipment')),
  entity_id UUID NOT NULL,
  barcode_value TEXT NOT NULL,
  barcode_type TEXT NOT NULL DEFAULT 'code128',
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, barcode_value)
);

CREATE TABLE IF NOT EXISTS public.inventory_reason_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  reason_type TEXT NOT NULL CHECK (reason_type IN ('receiving_exception','stock_adjustment','quality_hold','return','scrap','short_pick','damage')),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.inventory_stock_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  serial_id UUID REFERENCES public.inventory_serial_numbers(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  on_hand_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  reserved_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  quality_hold_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  damaged_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  available_qty NUMERIC(16,4) GENERATED ALWAYS AS (on_hand_qty - reserved_qty - quality_hold_qty - damaged_qty) STORED,
  average_cost NUMERIC(16,4) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (on_hand_qty >= 0),
  CHECK (reserved_qty >= 0),
  CHECK (quality_hold_qty >= 0),
  CHECK (damaged_qty >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_stock_balance_identity
ON public.inventory_stock_balances(
  tenant_id,
  item_id,
  warehouse_id,
  COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(lpn_id, '00000000-0000-0000-0000-000000000000'::UUID)
);

CREATE TABLE IF NOT EXISTS public.inventory_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  movement_number TEXT NOT NULL,
  movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening_balance','receipt','putaway','relocation','issue','pick','pack','ship','transfer_out','transfer_in','adjustment','return_in','return_out','quarantine_hold','quarantine_release','reservation','unreservation','scrap')),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  serial_id UUID REFERENCES public.inventory_serial_numbers(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  uom TEXT NOT NULL DEFAULT 'PCS',
  base_quantity NUMERIC(16,4) NOT NULL,
  unit_cost NUMERIC(16,4) DEFAULT 0,
  currency_code CHAR(3) DEFAULT 'SAR',
  reference_type TEXT,
  reference_id UUID,
  reason_code TEXT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, movement_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reservation_number TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  reserved_qty NUMERIC(16,4) NOT NULL CHECK (reserved_qty > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','partially_consumed','consumed','released','expired','cancelled')),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, reservation_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_value JSONB,
  new_value JSONB,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_status ON public.inventory_items(tenant_id,status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date ON public.inventory_stock_movements(tenant_id,item_id,movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_source ON public.inventory_reservations(tenant_id,source_type,source_id,status);

CREATE OR REPLACE FUNCTION public.inventory_require_roles(allowed_roles TEXT[])
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role TEXT := public.current_user_role();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF public.current_user_tenant_id() IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (v_role = ANY(allowed_roles) OR v_role IN ('admin','developer','it_admin')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_INVENTORY_OPERATION';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.inventory_require_roles(TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_inventory_movement(
  p_movement_type TEXT,
  p_item_id UUID,
  p_warehouse_id UUID,
  p_location_id UUID,
  p_quantity NUMERIC,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reason_code TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_balance RECORD;
  v_delta NUMERIC;
  v_movement_id UUID;
  v_movement_number TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement','manager']::TEXT[]);
  IF p_quantity IS NULL OR p_quantity = 0 THEN RAISE EXCEPTION 'QUANTITY_MUST_NOT_BE_ZERO'; END IF;
  IF p_quantity < 0 AND p_movement_type <> 'adjustment' THEN RAISE EXCEPTION 'NEGATIVE_QUANTITY_ALLOWED_ONLY_FOR_ADJUSTMENT'; END IF;
  IF p_movement_type NOT IN ('opening_balance','receipt','putaway','relocation','issue','pick','pack','ship','transfer_out','transfer_in','adjustment','return_in','return_out','quarantine_hold','quarantine_release','scrap') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=p_location_id AND tenant_id=v_tenant AND warehouse_id=p_warehouse_id AND status='active') THEN RAISE EXCEPTION 'LOCATION_NOT_IN_WAREHOUSE'; END IF;

  v_delta := CASE WHEN p_movement_type = 'adjustment' THEN p_quantity WHEN p_movement_type IN ('issue','pick','ship','transfer_out','return_out','scrap') THEN -p_quantity ELSE p_quantity END;

  SELECT * INTO v_balance
  FROM public.inventory_stock_balances
  WHERE tenant_id=v_tenant AND item_id=p_item_id AND warehouse_id=p_warehouse_id AND location_id IS NOT DISTINCT FROM p_location_id
    AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    IF v_delta < 0 THEN RAISE EXCEPTION 'NEGATIVE_STOCK_NOT_ALLOWED'; END IF;
    INSERT INTO public.inventory_stock_balances(tenant_id,item_id,warehouse_id,location_id,on_hand_qty)
    VALUES(v_tenant,p_item_id,p_warehouse_id,p_location_id,v_delta);
  ELSE
    IF v_balance.on_hand_qty + v_delta < v_balance.reserved_qty THEN RAISE EXCEPTION 'NEGATIVE_STOCK_NOT_ALLOWED'; END IF;
    UPDATE public.inventory_stock_balances
    SET on_hand_qty=on_hand_qty+v_delta, updated_at=NOW()
    WHERE id=v_balance.id;
  END IF;

  v_movement_number := 'IM-' || to_char(NOW(),'YYYYMMDD-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 1000000)::TEXT,6,'0');
  INSERT INTO public.inventory_stock_movements(tenant_id,movement_number,movement_type,item_id,warehouse_id,location_id,quantity,base_quantity,reference_type,reference_id,reason_code,actor_id)
  VALUES(v_tenant,v_movement_number,p_movement_type,p_item_id,p_warehouse_id,p_location_id,ABS(p_quantity),ABS(p_quantity),p_reference_type,p_reference_id,p_reason_code,v_user)
  RETURNING id INTO v_movement_id;
  RETURN v_movement_id;
END $$;
GRANT EXECUTE ON FUNCTION public.post_inventory_movement(TEXT,UUID,UUID,UUID,NUMERIC,TEXT,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_inventory(
  p_item_id UUID,
  p_warehouse_id UUID,
  p_location_id UUID,
  p_quantity NUMERIC,
  p_source_type TEXT,
  p_source_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_balance RECORD; v_reservation_id UUID; v_number TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement','manager']::TEXT[]);
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'QUANTITY_MUST_BE_POSITIVE'; END IF;
  SELECT * INTO v_balance FROM public.inventory_stock_balances
  WHERE tenant_id=v_tenant AND item_id=p_item_id AND warehouse_id=p_warehouse_id AND location_id IS NOT DISTINCT FROM p_location_id
    AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_balance.available_qty < p_quantity THEN RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_STOCK'; END IF;
  UPDATE public.inventory_stock_balances SET reserved_qty=reserved_qty+p_quantity, updated_at=NOW() WHERE id=v_balance.id;
  v_number := 'RSV-' || to_char(NOW(),'YYYYMMDD-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 1000000)::TEXT,6,'0');
  INSERT INTO public.inventory_reservations(tenant_id,reservation_number,source_type,source_id,item_id,warehouse_id,location_id,reserved_qty,created_by)
  VALUES(v_tenant,v_number,p_source_type,p_source_id,p_item_id,p_warehouse_id,p_location_id,p_quantity,auth.uid()) RETURNING id INTO v_reservation_id;
  RETURN v_reservation_id;
END $$;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(UUID,UUID,UUID,NUMERIC,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_inventory_reservation(p_reservation_id UUID, p_quantity NUMERIC DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_res RECORD; v_qty NUMERIC;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement','manager']::TEXT[]);
  SELECT * INTO v_res FROM public.inventory_reservations WHERE id=p_reservation_id AND tenant_id=v_tenant AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  v_qty := COALESCE(p_quantity, v_res.reserved_qty);
  IF v_qty <= 0 OR v_qty > v_res.reserved_qty THEN RAISE EXCEPTION 'INVALID_RELEASE_QUANTITY'; END IF;
  UPDATE public.inventory_stock_balances
  SET reserved_qty=GREATEST(reserved_qty-v_qty,0), updated_at=NOW()
  WHERE tenant_id=v_tenant AND item_id=v_res.item_id AND warehouse_id=v_res.warehouse_id AND location_id IS NOT DISTINCT FROM v_res.location_id
    AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL;
  UPDATE public.inventory_reservations
  SET reserved_qty=reserved_qty-v_qty, status=CASE WHEN reserved_qty-v_qty <= 0 THEN 'released' ELSE 'active' END
  WHERE id=p_reservation_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.release_inventory_reservation(UUID,NUMERIC) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_categories','inventory_uom','inventory_items','inventory_item_uom_conversions','inventory_item_storage_rules','inventory_warehouses','inventory_zones','inventory_locations','inventory_docks','inventory_warehouse_users','inventory_lots','inventory_serial_numbers','inventory_lpn','inventory_barcodes','inventory_reason_codes','inventory_stock_balances','inventory_stock_movements','inventory_reservations','inventory_audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''procurement'',''manager'',''finance'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_kpis WITH (security_invoker=true) AS
SELECT i.tenant_id,
  COUNT(DISTINCT i.id) AS total_items,
  COUNT(DISTINCT i.id) FILTER (WHERE COALESCE(b.available_qty,0) <= COALESCE(i.reorder_point,0) AND COALESCE(i.reorder_point,0) > 0) AS reorder_items,
  COUNT(DISTINCT i.id) FILTER (WHERE COALESCE(b.available_qty,0) <= 0) AS stockout_items,
  COALESCE(SUM(COALESCE(b.on_hand_qty,0) * COALESCE(b.average_cost,0)),0) AS estimated_value
FROM public.inventory_items i
LEFT JOIN public.inventory_stock_balances b ON b.item_id=i.id AND b.tenant_id=i.tenant_id
WHERE i.tenant_id = public.current_user_tenant_id()
GROUP BY i.tenant_id;
GRANT SELECT ON public.inventory_kpis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_reorder_alerts WITH (security_invoker=true) AS
SELECT i.tenant_id, i.id AS item_id, i.item_code, i.name_ar AS item_name, w.id AS warehouse_id, w.warehouse_code,
  COALESCE(SUM(b.available_qty),0) AS available_qty,
  COALESCE(i.reorder_point,0) AS reorder_point,
  CASE WHEN COALESCE(SUM(b.available_qty),0) <= 0 THEN 'stockout' ELSE 'reorder' END AS alert_level
FROM public.inventory_items i
JOIN public.inventory_stock_balances b ON b.item_id=i.id AND b.tenant_id=i.tenant_id
JOIN public.inventory_warehouses w ON w.id=b.warehouse_id AND w.tenant_id=i.tenant_id
WHERE i.tenant_id = public.current_user_tenant_id()
GROUP BY i.tenant_id,i.id,i.item_code,i.name_ar,w.id,w.warehouse_code,i.reorder_point
HAVING COALESCE(SUM(b.available_qty),0) <= COALESCE(i.reorder_point,0) AND COALESCE(i.reorder_point,0) > 0;
GRANT SELECT ON public.inventory_reorder_alerts TO authenticated;

CREATE OR REPLACE VIEW public.inventory_expiry_alerts WITH (security_invoker=true) AS
SELECT b.tenant_id,b.item_id,i.item_code,i.name_ar AS item_name,b.warehouse_id,w.warehouse_code,l.lot_number,l.expiry_date,(l.expiry_date-CURRENT_DATE)::INT AS days_left
FROM public.inventory_stock_balances b
JOIN public.inventory_items i ON i.id=b.item_id AND i.tenant_id=b.tenant_id
JOIN public.inventory_warehouses w ON w.id=b.warehouse_id AND w.tenant_id=b.tenant_id
JOIN public.inventory_lots l ON l.id=b.lot_id AND l.tenant_id=b.tenant_id
WHERE b.tenant_id=public.current_user_tenant_id() AND l.expiry_date IS NOT NULL AND l.expiry_date <= CURRENT_DATE + INTERVAL '90 days';
GRANT SELECT ON public.inventory_expiry_alerts TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_items') IS NULL OR to_regclass('public.inventory_stock_movements') IS NULL OR to_regclass('public.inventory_lpn') IS NULL THEN
    RAISE EXCEPTION '0204 failed: inventory foundation tables missing';
  END IF;
  IF to_regprocedure('public.post_inventory_movement(text,uuid,uuid,uuid,numeric,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0204 failed: post_inventory_movement missing';
  END IF;
  RAISE NOTICE '✅ 0204: Inventory/Warehouse foundation core applied';
END $$;
