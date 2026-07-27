-- ============================================================================
-- 0229 — MRP Foundation UX Actions Completion
-- Adds missing master-data action RPCs used by the UI buttons/lookups.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_mrp_area(p_plant_id UUID,p_area_code TEXT,p_name_ar TEXT,p_area_type TEXT DEFAULT 'production')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.manufacturing_plants WHERE id=p_plant_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'PLANT_NOT_FOUND'; END IF;
  v_code := public.generate_mrp_next_code('area',p_area_code);
  INSERT INTO public.manufacturing_areas(tenant_id,plant_id,area_code,name_ar,area_type)
  VALUES(v_tenant,p_plant_id,v_code,p_name_ar,COALESCE(p_area_type,'production')) RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('foundation','manufacturing_areas',v_id,'create',NULL,jsonb_build_object('area_code',v_code),'إنشاء منطقة تصنيع');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_area(UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_line(p_plant_id UUID,p_area_id UUID,p_line_code TEXT,p_name_ar TEXT,p_line_type TEXT DEFAULT 'discrete')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.manufacturing_plants WHERE id=p_plant_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'PLANT_NOT_FOUND'; END IF;
  IF p_area_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.manufacturing_areas WHERE id=p_area_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'AREA_NOT_FOUND'; END IF;
  v_code := public.generate_mrp_next_code('production_line',p_line_code);
  INSERT INTO public.production_lines(tenant_id,plant_id,area_id,line_code,name_ar,line_type)
  VALUES(v_tenant,p_plant_id,p_area_id,v_code,p_name_ar,COALESCE(p_line_type,'discrete')) RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('foundation','production_lines',v_id,'create',NULL,jsonb_build_object('line_code',v_code),'إنشاء خط إنتاج');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_line(UUID,UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_resource(p_resource_code TEXT,p_resource_type TEXT,p_name_ar TEXT,p_capacity_per_shift NUMERIC DEFAULT NULL,p_cost_rate NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('resource',p_resource_code);
  INSERT INTO public.manufacturing_resources(tenant_id,resource_code,resource_type,name_ar,capacity_per_shift,cost_rate)
  VALUES(v_tenant,v_code,p_resource_type,p_name_ar,p_capacity_per_shift,COALESCE(p_cost_rate,0))
  ON CONFLICT (tenant_id,resource_code) DO UPDATE SET resource_type=EXCLUDED.resource_type,name_ar=EXCLUDED.name_ar,capacity_per_shift=EXCLUDED.capacity_per_shift,cost_rate=EXCLUDED.cost_rate,status='active'
  RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('foundation','manufacturing_resources',v_id,'upsert',NULL,jsonb_build_object('resource_code',v_code),'إنشاء/تحديث مورد تصنيع');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_resource(TEXT,TEXT,TEXT,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_mrp_work_center_resource(p_work_center_id UUID,p_resource_id UUID,p_required_quantity NUMERIC DEFAULT 1,p_is_primary BOOLEAN DEFAULT false)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  INSERT INTO public.work_center_resources(tenant_id,work_center_id,resource_id,required_quantity,is_primary)
  VALUES(v_tenant,p_work_center_id,p_resource_id,COALESCE(p_required_quantity,1),COALESCE(p_is_primary,false))
  ON CONFLICT (tenant_id,work_center_id,resource_id) DO UPDATE SET required_quantity=EXCLUDED.required_quantity,is_primary=EXCLUDED.is_primary
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.link_mrp_work_center_resource(UUID,UUID,NUMERIC,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_asset(p_asset_code TEXT,p_name_ar TEXT,p_plant_id UUID DEFAULT NULL,p_work_center_id UUID DEFAULT NULL,p_criticality TEXT DEFAULT 'B',p_linked_maintenance_asset_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT; v_plant UUID:=p_plant_id;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  IF v_plant IS NULL AND p_work_center_id IS NOT NULL THEN SELECT plant_id INTO v_plant FROM public.work_centers WHERE id=p_work_center_id AND tenant_id=v_tenant; END IF;
  v_code := public.generate_mrp_next_code('asset',p_asset_code);
  INSERT INTO public.manufacturing_assets(tenant_id,asset_code,name_ar,linked_maintenance_asset_id,plant_id,work_center_id,criticality)
  VALUES(v_tenant,v_code,p_name_ar,p_linked_maintenance_asset_id,v_plant,p_work_center_id,COALESCE(p_criticality,'B'))
  ON CONFLICT (tenant_id,asset_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,linked_maintenance_asset_id=EXCLUDED.linked_maintenance_asset_id,plant_id=EXCLUDED.plant_id,work_center_id=EXCLUDED.work_center_id,criticality=EXCLUDED.criticality,status='available'
  RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('foundation','manufacturing_assets',v_id,'upsert',NULL,jsonb_build_object('asset_code',v_code),'إنشاء/تحديث أصل إنتاجي');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_asset(TEXT,TEXT,UUID,UUID,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_shift(p_shift_code TEXT,p_name_ar TEXT,p_starts_at_time TIME,p_ends_at_time TIME,p_break_minutes NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('shift',p_shift_code);
  INSERT INTO public.manufacturing_shifts(tenant_id,shift_code,name_ar,starts_at_time,ends_at_time,break_minutes)
  VALUES(v_tenant,v_code,p_name_ar,p_starts_at_time,p_ends_at_time,COALESCE(p_break_minutes,0)) RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('foundation','manufacturing_shifts',v_id,'create',NULL,jsonb_build_object('shift_code',v_code),'إنشاء وردية تصنيع');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_shift(TEXT,TEXT,TIME,TIME,NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.create_mrp_area(uuid,text,text,text)') IS NULL OR to_regprocedure('public.create_mrp_line(uuid,uuid,text,text,text)') IS NULL OR to_regprocedure('public.create_mrp_shift(text,text,time,time,numeric)') IS NULL THEN
    RAISE EXCEPTION '0229 failed: MRP foundation UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0229: MRP foundation UX actions applied';
END $$;
