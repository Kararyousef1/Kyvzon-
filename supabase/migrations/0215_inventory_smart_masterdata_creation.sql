-- ============================================================================
-- 0215 — Inventory UX Completion: smart master-data creation
-- الهدف: توليد الكود/الباركود تلقائياً عند الحفظ فقط، مع دعم الإدخال اليدوي.
-- ============================================================================

ALTER TABLE public.inventory_barcodes DROP CONSTRAINT IF EXISTS inventory_barcodes_entity_type_check;
ALTER TABLE public.inventory_barcodes ADD CONSTRAINT inventory_barcodes_entity_type_check
CHECK (entity_type IN ('item','warehouse','zone','location','dock','lpn','shipment','package','rma','rtv','employee','equipment','generic'));

CREATE OR REPLACE FUNCTION public.create_inventory_item_smart(
  p_item_code TEXT DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_name_ar TEXT DEFAULT NULL,
  p_name_en TEXT DEFAULT NULL,
  p_item_type TEXT DEFAULT 'raw_material',
  p_category_id UUID DEFAULT NULL,
  p_base_uom TEXT DEFAULT 'PCS',
  p_tracking_policy TEXT DEFAULT 'none',
  p_reorder_point NUMERIC DEFAULT 0,
  p_reorder_qty NUMERIC DEFAULT 0,
  p_barcode_type TEXT DEFAULT 'code128'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_code TEXT;
  v_barcode TEXT;
  v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF COALESCE(p_name_ar,'') = '' THEN RAISE EXCEPTION 'ITEM_NAME_REQUIRED'; END IF;
  IF p_item_type NOT IN ('raw_material','finished_good','semi_finished','consumable','spare_part','packaging','service','other') THEN RAISE EXCEPTION 'INVALID_ITEM_TYPE'; END IF;
  IF p_tracking_policy NOT IN ('none','lot','serial','expiry','lot_expiry') THEN RAISE EXCEPTION 'INVALID_TRACKING_POLICY'; END IF;

  v_code := COALESCE(NULLIF(p_item_code,''), public.generate_inventory_next_code('item', NULL, NULL));
  v_barcode := COALESCE(NULLIF(p_barcode,''), public.generate_inventory_entity_barcode('item', v_code, NULL));

  INSERT INTO public.inventory_items(tenant_id,item_code,name_ar,name_en,item_type,category_id,base_uom,tracking_policy,reorder_point,reorder_qty,status,created_by)
  VALUES(v_tenant,v_code,p_name_ar,p_name_en,COALESCE(p_item_type,'raw_material'),p_category_id,COALESCE(p_base_uom,'PCS'),COALESCE(p_tracking_policy,'none'),COALESCE(p_reorder_point,0),COALESCE(p_reorder_qty,0),'active',auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.register_inventory_entity_barcode('item', v_id, v_barcode, COALESCE(p_barcode_type,'code128'), true);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_item_smart(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,NUMERIC,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_warehouse_smart(
  p_warehouse_code TEXT DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_name_ar TEXT DEFAULT NULL,
  p_name_en TEXT DEFAULT NULL,
  p_warehouse_type TEXT DEFAULT 'main',
  p_barcode_type TEXT DEFAULT 'code128'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_code TEXT;
  v_barcode TEXT;
  v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF COALESCE(p_name_ar,'') = '' THEN RAISE EXCEPTION 'WAREHOUSE_NAME_REQUIRED'; END IF;
  IF p_warehouse_type NOT IN ('main','raw_material','finished_good','returns','damaged','quarantine','cold','cross_dock','shipping','other') THEN RAISE EXCEPTION 'INVALID_WAREHOUSE_TYPE'; END IF;

  v_code := COALESCE(NULLIF(p_warehouse_code,''), public.generate_inventory_next_code('warehouse', NULL, NULL));
  v_barcode := COALESCE(NULLIF(p_barcode,''), public.generate_inventory_entity_barcode('warehouse', v_code, NULL));

  INSERT INTO public.inventory_warehouses(tenant_id,warehouse_code,name_ar,name_en,warehouse_type,status,created_by)
  VALUES(v_tenant,v_code,p_name_ar,p_name_en,COALESCE(p_warehouse_type,'main'),'active',auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.register_inventory_entity_barcode('warehouse', v_id, v_barcode, COALESCE(p_barcode_type,'code128'), true);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_warehouse_smart(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_location_smart(
  p_warehouse_id UUID,
  p_zone_id UUID DEFAULT NULL,
  p_location_code TEXT DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_location_type TEXT DEFAULT 'bin',
  p_max_capacity NUMERIC DEFAULT NULL,
  p_current_capacity_used NUMERIC DEFAULT 0,
  p_barcode_type TEXT DEFAULT 'code128'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_code TEXT;
  v_barcode TEXT;
  v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  IF p_zone_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_zones WHERE id=p_zone_id AND tenant_id=v_tenant AND warehouse_id=p_warehouse_id) THEN RAISE EXCEPTION 'ZONE_NOT_IN_WAREHOUSE'; END IF;
  IF p_location_type NOT IN ('zone','aisle','rack','shelf','bin','dock','staging','quarantine') THEN RAISE EXCEPTION 'INVALID_LOCATION_TYPE'; END IF;

  v_code := COALESCE(NULLIF(p_location_code,''), public.generate_inventory_next_code('location', NULL, NULL));
  v_barcode := COALESCE(NULLIF(p_barcode,''), public.generate_inventory_entity_barcode('location', v_code, NULL));

  INSERT INTO public.inventory_locations(tenant_id,warehouse_id,zone_id,location_code,location_type,barcode,status,max_capacity,current_capacity_used)
  VALUES(v_tenant,p_warehouse_id,p_zone_id,v_code,COALESCE(p_location_type,'bin'),v_barcode,'active',p_max_capacity,COALESCE(p_current_capacity_used,0))
  RETURNING id INTO v_id;

  PERFORM public.register_inventory_entity_barcode('location', v_id, v_barcode, COALESCE(p_barcode_type,'code128'), true);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_location_smart(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.create_inventory_item_smart(text,text,text,text,text,uuid,text,text,numeric,numeric,text)') IS NULL
     OR to_regprocedure('public.create_inventory_warehouse_smart(text,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.create_inventory_location_smart(uuid,uuid,text,text,text,numeric,numeric,text)') IS NULL THEN
    RAISE EXCEPTION '0215 failed: smart master-data creation functions missing';
  END IF;
  RAISE NOTICE '✅ 0215: Inventory smart master-data creation applied';
END $$;
