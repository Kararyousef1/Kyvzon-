-- ============================================================================
-- 0230 — MRP BOM UX Actions Completion
-- Adds missing BOM line substitute/supplier/import and ECR/ECO lookup-friendly actions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_mrp_bom_line_substitute(p_bom_line_id UUID,p_substitute_item_id UUID,p_priority INT DEFAULT 1,p_conversion_factor NUMERIC DEFAULT 1,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.mrp_bom_lines WHERE id=p_bom_line_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'BOM_LINE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_substitute_item_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'SUBSTITUTE_ITEM_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_bom_line_substitutes(tenant_id,bom_line_id,substitute_item_id,priority,conversion_factor,notes)
  VALUES(v_tenant,p_bom_line_id,p_substitute_item_id,COALESCE(p_priority,1),COALESCE(p_conversion_factor,1),p_notes)
  ON CONFLICT (tenant_id,bom_line_id,substitute_item_id) DO UPDATE SET priority=EXCLUDED.priority,conversion_factor=EXCLUDED.conversion_factor,notes=EXCLUDED.notes,is_active=true
  RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('bom','mrp_bom_line_substitutes',v_id,'upsert',NULL,jsonb_build_object('bom_line_id',p_bom_line_id),'إضافة/تحديث بديل بند BOM');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_bom_line_substitute(UUID,UUID,INT,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mrp_bom_line_supplier(p_bom_line_id UUID,p_supplier_id UUID,p_supplier_part_number TEXT DEFAULT NULL,p_lead_time_days INT DEFAULT NULL,p_unit_price NUMERIC DEFAULT NULL,p_currency_code CHAR(3) DEFAULT 'SAR',p_is_preferred BOOLEAN DEFAULT false)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.mrp_bom_lines WHERE id=p_bom_line_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'BOM_LINE_NOT_FOUND'; END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SUPPLIER_NOT_FOUND'; END IF;
  IF COALESCE(p_is_preferred,false) THEN UPDATE public.mrp_bom_line_suppliers SET is_preferred=false WHERE tenant_id=v_tenant AND bom_line_id=p_bom_line_id; END IF;
  INSERT INTO public.mrp_bom_line_suppliers(tenant_id,bom_line_id,supplier_id,supplier_part_number,lead_time_days,unit_price,currency_code,is_preferred)
  VALUES(v_tenant,p_bom_line_id,p_supplier_id,p_supplier_part_number,p_lead_time_days,p_unit_price,COALESCE(p_currency_code,'SAR'),COALESCE(p_is_preferred,false))
  RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('bom','mrp_bom_line_suppliers',v_id,'create',NULL,jsonb_build_object('bom_line_id',p_bom_line_id),'إضافة مورد بند BOM');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_bom_line_supplier(UUID,UUID,TEXT,INT,NUMERIC,CHAR,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_bom_import_batch(p_file_name TEXT,p_file_url TEXT DEFAULT NULL,p_import_type TEXT DEFAULT 'excel')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  INSERT INTO public.mrp_bom_import_batches(tenant_id,batch_number,file_name,file_url,import_type,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('bom_import',NULL),p_file_name,p_file_url,COALESCE(p_import_type,'excel'),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_bom_import_batch(TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_ecr(p_ecr_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  IF p_status NOT IN ('rejected','closed','approved_for_eco') THEN RAISE EXCEPTION 'INVALID_ECR_CLOSE_STATUS'; END IF;
  SELECT to_jsonb(e) INTO v_old FROM public.mrp_engineering_change_requests e WHERE id=p_ecr_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'ECR_NOT_FOUND'; END IF;
  UPDATE public.mrp_engineering_change_requests SET status=p_status,closed_at=CASE WHEN p_status IN ('rejected','closed') THEN NOW() ELSE closed_at END WHERE id=p_ecr_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('bom','mrp_engineering_change_requests',p_ecr_id,p_status,v_old,jsonb_build_object('status',p_status),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_ecr(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_bom_line_substitute_catalog WITH (security_invoker=true) AS
SELECT s.*, bl.line_no, i.item_code AS substitute_item_code, i.name_ar AS substitute_item_name
FROM public.mrp_bom_line_substitutes s
JOIN public.mrp_bom_lines bl ON bl.id=s.bom_line_id AND bl.tenant_id=s.tenant_id
LEFT JOIN public.inventory_items i ON i.id=s.substitute_item_id AND i.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_bom_line_substitute_catalog TO authenticated;

CREATE OR REPLACE VIEW public.mrp_bom_line_supplier_catalog WITH (security_invoker=true) AS
SELECT bs.*, bl.line_no, s.supplier_code, s.legal_name AS supplier_name
FROM public.mrp_bom_line_suppliers bs
JOIN public.mrp_bom_lines bl ON bl.id=bs.bom_line_id AND bl.tenant_id=bs.tenant_id
LEFT JOIN public.suppliers s ON s.id=bs.supplier_id AND s.tenant_id=bs.tenant_id
WHERE bs.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_bom_line_supplier_catalog TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.add_mrp_bom_line_substitute(uuid,uuid,integer,numeric,text)') IS NULL OR to_regprocedure('public.add_mrp_bom_line_supplier(uuid,uuid,text,integer,numeric,character,boolean)') IS NULL OR to_regprocedure('public.create_mrp_bom_import_batch(text,text,text)') IS NULL THEN
    RAISE EXCEPTION '0230 failed: MRP BOM UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0230: MRP BOM UX actions applied';
END $$;
