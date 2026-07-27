-- ============================================================================
-- 0219 — MRP Unit 01: BOM & Engineering Change Management
-- docs/mrp/01-bill-of-materials-BOM.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_bom_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bom_code TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  bom_type TEXT NOT NULL DEFAULT 'MBOM' CHECK (bom_type IN ('EBOM','MBOM','SBOM','SALES')),
  structure_type TEXT NOT NULL DEFAULT 'multi_level' CHECK (structure_type IN ('single_level','multi_level')),
  name_ar TEXT,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,bom_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mrp_default_bom_per_item_type ON public.mrp_bom_headers(tenant_id,item_id,bom_type) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.mrp_bom_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bom_id UUID NOT NULL REFERENCES public.mrp_bom_headers(id) ON DELETE CASCADE,
  version_no TEXT NOT NULL DEFAULT '1.0',
  source_bom_version_id UUID REFERENCES public.mrp_bom_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','effective','superseded','archived')),
  effective_from DATE,
  effective_to DATE,
  revision_reason TEXT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,bom_id,version_no)
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bom_version_id UUID NOT NULL REFERENCES public.mrp_bom_versions(id) ON DELETE CASCADE,
  parent_line_id UUID REFERENCES public.mrp_bom_lines(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  component_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  description TEXT,
  uom TEXT NOT NULL DEFAULT 'PCS',
  quantity_per NUMERIC(18,6) NOT NULL CHECK (quantity_per > 0),
  scrap_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  net_quantity NUMERIC(18,6) GENERATED ALWAYS AS (quantity_per * (1 + scrap_percent/100)) STORED,
  material_type TEXT NOT NULL DEFAULT 'raw' CHECK (material_type IN ('raw','component','subassembly','packaging','phantom','service','byproduct','coproduct')),
  supply_type TEXT NOT NULL DEFAULT 'buy' CHECK (supply_type IN ('buy','make','subcontract','transfer')),
  lead_time_days INT DEFAULT 0,
  safety_stock NUMERIC(18,6) DEFAULT 0,
  minimum_order_qty NUMERIC(18,6) DEFAULT 0,
  order_multiple NUMERIC(18,6) DEFAULT 1,
  operation_sequence_no INT,
  is_phantom BOOLEAN NOT NULL DEFAULT false,
  is_optional BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,bom_version_id,line_no)
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_line_substitutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bom_line_id UUID NOT NULL REFERENCES public.mrp_bom_lines(id) ON DELETE CASCADE,
  substitute_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  priority INT NOT NULL DEFAULT 1,
  conversion_factor NUMERIC(18,6) NOT NULL DEFAULT 1,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,bom_line_id,substitute_item_id)
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_line_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bom_line_id UUID NOT NULL REFERENCES public.mrp_bom_lines(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_part_number TEXT,
  lead_time_days INT,
  unit_price NUMERIC(18,6),
  currency_code CHAR(3) DEFAULT 'SAR',
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_engineering_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ecr_number TEXT NOT NULL,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_source TEXT NOT NULL DEFAULT 'manual' CHECK (request_source IN ('engineering','production','quality','procurement','customer','manual')),
  reason TEXT NOT NULL,
  proposed_change TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','impact_analysis','approved_for_eco','rejected','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(tenant_id,ecr_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_engineering_change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  eco_number TEXT NOT NULL,
  ecr_id UUID REFERENCES public.mrp_engineering_change_requests(id) ON DELETE SET NULL,
  bom_version_id UUID REFERENCES public.mrp_bom_versions(id) ON DELETE SET NULL,
  affected_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  affected_boms JSONB NOT NULL DEFAULT '[]'::JSONB,
  effectivity_date DATE,
  implementation_plan TEXT,
  impact_summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','impact_analysis','approved','scheduled','implemented','rejected','closed')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  implemented_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  implemented_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,eco_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bom_version_id UUID NOT NULL REFERENCES public.mrp_bom_versions(id) ON DELETE CASCADE,
  approver_role TEXT NOT NULL CHECK (approver_role IN ('bom_engineer','production_manager','quality_inspector','cost_accountant','admin')),
  approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected')),
  comments TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_explosion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  bom_version_id UUID NOT NULL REFERENCES public.mrp_bom_versions(id) ON DELETE CASCADE,
  top_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  demand_quantity NUMERIC(18,6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,run_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_explosion_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.mrp_bom_explosion_runs(id) ON DELETE CASCADE,
  bom_line_id UUID REFERENCES public.mrp_bom_lines(id) ON DELETE SET NULL,
  level_no INT NOT NULL,
  parent_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  component_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  gross_quantity NUMERIC(18,6) NOT NULL,
  scrap_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  net_required_quantity NUMERIC(18,6) NOT NULL,
  available_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  shortage_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  supply_type TEXT,
  recommended_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_availability_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  check_number TEXT NOT NULL,
  bom_version_id UUID NOT NULL REFERENCES public.mrp_bom_versions(id) ON DELETE CASCADE,
  demand_quantity NUMERIC(18,6) NOT NULL,
  can_build BOOLEAN NOT NULL DEFAULT false,
  shortage_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,check_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_availability_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  check_id UUID NOT NULL REFERENCES public.mrp_bom_availability_checks(id) ON DELETE CASCADE,
  component_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  required_quantity NUMERIC(18,6) NOT NULL,
  available_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  shortage_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  import_type TEXT NOT NULL DEFAULT 'excel' CHECK (import_type IN ('excel','csv','api')),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validating','imported','failed','cancelled')),
  total_rows INT DEFAULT 0,
  error_rows INT DEFAULT 0,
  error_payload JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,batch_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_bom_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  bom_version_id UUID REFERENCES public.mrp_bom_versions(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL CHECK (export_type IN ('excel','csv','json')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','generating','ready','failed','expired')),
  file_url TEXT,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,request_number)
);

CREATE INDEX IF NOT EXISTS idx_mrp_bom_versions_status ON public.mrp_bom_versions(tenant_id,status,effective_from);
CREATE INDEX IF NOT EXISTS idx_mrp_bom_lines_version ON public.mrp_bom_lines(tenant_id,bom_version_id,parent_line_id,line_no);

CREATE OR REPLACE FUNCTION public.create_mrp_bom(p_bom_code TEXT,p_item_id UUID,p_bom_type TEXT DEFAULT 'MBOM',p_structure_type TEXT DEFAULT 'multi_level',p_name_ar TEXT DEFAULT NULL,p_version_no TEXT DEFAULT '1.0')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_bom UUID; v_ver UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'BOM_ITEM_NOT_FOUND'; END IF;
  v_code := public.generate_mrp_next_code('bom',p_bom_code);
  INSERT INTO public.mrp_bom_headers(tenant_id,bom_code,item_id,bom_type,structure_type,name_ar,status,created_by)
  VALUES(v_tenant,v_code,p_item_id,COALESCE(p_bom_type,'MBOM'),COALESCE(p_structure_type,'multi_level'),p_name_ar,'active',auth.uid()) RETURNING id INTO v_bom;
  INSERT INTO public.mrp_bom_versions(tenant_id,bom_id,version_no,status,created_by)
  VALUES(v_tenant,v_bom,COALESCE(p_version_no,'1.0'),'draft',auth.uid()) RETURNING id INTO v_ver;
  PERFORM public.log_mrp_audit_event('bom','mrp_bom_headers',v_bom,'create',NULL,jsonb_build_object('bom_code',v_code),'إنشاء BOM');
  RETURN v_ver;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_bom(TEXT,UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mrp_bom_line(p_bom_version_id UUID,p_parent_line_id UUID,p_line_no INT,p_component_item_id UUID,p_quantity_per NUMERIC,p_uom TEXT DEFAULT 'PCS',p_scrap_percent NUMERIC DEFAULT 0,p_material_type TEXT DEFAULT 'raw',p_supply_type TEXT DEFAULT 'buy',p_lead_time_days INT DEFAULT 0,p_safety_stock NUMERIC DEFAULT 0,p_minimum_order_qty NUMERIC DEFAULT 0,p_order_multiple NUMERIC DEFAULT 1,p_operation_sequence_no INT DEFAULT NULL,p_is_phantom BOOLEAN DEFAULT false,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_line UUID; v_status TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  SELECT status INTO v_status FROM public.mrp_bom_versions WHERE id=p_bom_version_id AND tenant_id=v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'BOM_VERSION_NOT_FOUND'; END IF;
  IF v_status NOT IN ('draft','in_review') THEN RAISE EXCEPTION 'BOM_VERSION_NOT_EDITABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_component_item_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'COMPONENT_ITEM_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_bom_lines(tenant_id,bom_version_id,parent_line_id,line_no,component_item_id,quantity_per,uom,scrap_percent,material_type,supply_type,lead_time_days,safety_stock,minimum_order_qty,order_multiple,operation_sequence_no,is_phantom,notes)
  VALUES(v_tenant,p_bom_version_id,p_parent_line_id,p_line_no,p_component_item_id,p_quantity_per,COALESCE(p_uom,'PCS'),COALESCE(p_scrap_percent,0),COALESCE(p_material_type,'raw'),COALESCE(p_supply_type,'buy'),COALESCE(p_lead_time_days,0),COALESCE(p_safety_stock,0),COALESCE(p_minimum_order_qty,0),COALESCE(p_order_multiple,1),p_operation_sequence_no,COALESCE(p_is_phantom,false),p_notes)
  RETURNING id INTO v_line;
  PERFORM public.log_mrp_audit_event('bom','mrp_bom_lines',v_line,'create',NULL,jsonb_build_object('component_item_id',p_component_item_id),'إضافة بند BOM');
  RETURN v_line;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_bom_line(UUID,UUID,INT,UUID,NUMERIC,TEXT,NUMERIC,TEXT,TEXT,INT,NUMERIC,NUMERIC,NUMERIC,INT,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_mrp_bom_version(p_bom_version_id UUID,p_effective_from DATE DEFAULT CURRENT_DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_bom UUID; v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  SELECT to_jsonb(v), bom_id INTO v_old, v_bom FROM public.mrp_bom_versions v WHERE id=p_bom_version_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'BOM_VERSION_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mrp_bom_lines WHERE bom_version_id=p_bom_version_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'BOM_VERSION_HAS_NO_LINES'; END IF;
  UPDATE public.mrp_bom_versions SET status='superseded', effective_to=COALESCE(p_effective_from,CURRENT_DATE)-1 WHERE tenant_id=v_tenant AND bom_id=v_bom AND status='effective';
  UPDATE public.mrp_bom_versions SET status='effective', effective_from=COALESCE(p_effective_from,CURRENT_DATE), approved_by=auth.uid(), approved_at=NOW() WHERE id=p_bom_version_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('bom','mrp_bom_versions',p_bom_version_id,'approve',v_old,jsonb_build_object('status','effective'),'اعتماد BOM Version');
END $$;
GRANT EXECUTE ON FUNCTION public.approve_mrp_bom_version(UUID,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.duplicate_mrp_bom_version(p_bom_version_id UUID,p_new_version_no TEXT,p_reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD; v_new UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  SELECT * INTO v_old FROM public.mrp_bom_versions WHERE id=p_bom_version_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOM_VERSION_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_bom_versions(tenant_id,bom_id,version_no,source_bom_version_id,status,revision_reason,created_by)
  VALUES(v_tenant,v_old.bom_id,p_new_version_no,p_bom_version_id,'draft',p_reason,auth.uid()) RETURNING id INTO v_new;
  INSERT INTO public.mrp_bom_lines(tenant_id,bom_version_id,parent_line_id,line_no,component_item_id,description,uom,quantity_per,scrap_percent,material_type,supply_type,lead_time_days,safety_stock,minimum_order_qty,order_multiple,operation_sequence_no,is_phantom,is_optional,notes,status)
  SELECT tenant_id,v_new,NULL,line_no,component_item_id,description,uom,quantity_per,scrap_percent,material_type,supply_type,lead_time_days,safety_stock,minimum_order_qty,order_multiple,operation_sequence_no,is_phantom,is_optional,notes,status FROM public.mrp_bom_lines WHERE tenant_id=v_tenant AND bom_version_id=p_bom_version_id AND parent_line_id IS NULL;
  RETURN v_new;
END $$;
GRANT EXECUTE ON FUNCTION public.duplicate_mrp_bom_version(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_ecr(p_reason TEXT,p_proposed_change TEXT,p_request_source TEXT DEFAULT 'manual')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager','quality_inspector']::TEXT[]);
  INSERT INTO public.mrp_engineering_change_requests(tenant_id,ecr_number,requested_by,request_source,reason,proposed_change)
  VALUES(v_tenant,public.generate_mrp_next_code('ecr',NULL),auth.uid(),COALESCE(p_request_source,'manual'),p_reason,p_proposed_change) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_ecr(TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_eco(p_ecr_id UUID,p_bom_version_id UUID,p_effectivity_date DATE,p_impact_summary TEXT,p_implementation_plan TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  INSERT INTO public.mrp_engineering_change_orders(tenant_id,eco_number,ecr_id,bom_version_id,effectivity_date,impact_summary,implementation_plan,status)
  VALUES(v_tenant,public.generate_mrp_next_code('eco',NULL),p_ecr_id,p_bom_version_id,p_effectivity_date,p_impact_summary,p_implementation_plan,'impact_analysis') RETURNING id INTO v_id;
  IF p_ecr_id IS NOT NULL THEN UPDATE public.mrp_engineering_change_requests SET status='approved_for_eco' WHERE id=p_ecr_id AND tenant_id=v_tenant; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_eco(UUID,UUID,DATE,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.implement_mrp_eco(p_eco_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_eco RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  SELECT * INTO v_eco FROM public.mrp_engineering_change_orders WHERE id=p_eco_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ECO_NOT_FOUND'; END IF;
  UPDATE public.mrp_engineering_change_orders SET status='implemented', implemented_by=auth.uid(), implemented_at=NOW() WHERE id=p_eco_id AND tenant_id=v_tenant;
  PERFORM public.log_mrp_audit_event('bom','mrp_engineering_change_orders',p_eco_id,'implemented',to_jsonb(v_eco),jsonb_build_object('status','implemented'),'تطبيق ECO');
END $$;
GRANT EXECUTE ON FUNCTION public.implement_mrp_eco(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.explode_mrp_bom(p_bom_version_id UUID,p_demand_quantity NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_run UUID; v_top UUID; v_num TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  SELECT h.item_id INTO v_top FROM public.mrp_bom_versions v JOIN public.mrp_bom_headers h ON h.id=v.bom_id AND h.tenant_id=v.tenant_id WHERE v.id=p_bom_version_id AND v.tenant_id=v_tenant;
  IF v_top IS NULL THEN RAISE EXCEPTION 'BOM_VERSION_NOT_FOUND'; END IF;
  v_num := public.generate_mrp_next_code('bom_explosion',NULL);
  INSERT INTO public.mrp_bom_explosion_runs(tenant_id,run_number,bom_version_id,top_item_id,demand_quantity,created_by)
  VALUES(v_tenant,v_num,p_bom_version_id,v_top,p_demand_quantity,auth.uid()) RETURNING id INTO v_run;
  WITH RECURSIVE bom_tree AS (
    SELECT l.id AS bom_line_id, 1 AS level_no, v_top AS parent_item_id, l.component_item_id, (p_demand_quantity*l.quantity_per) AS gross_qty, (p_demand_quantity*l.quantity_per*l.scrap_percent/100) AS scrap_qty, (p_demand_quantity*l.net_quantity) AS net_qty, l.supply_type
    FROM public.mrp_bom_lines l WHERE l.tenant_id=v_tenant AND l.bom_version_id=p_bom_version_id AND l.parent_line_id IS NULL AND l.status='active'
    UNION ALL
    SELECT c.id, bt.level_no+1, bt.component_item_id, c.component_item_id, (bt.net_qty*c.quantity_per), (bt.net_qty*c.quantity_per*c.scrap_percent/100), (bt.net_qty*c.net_quantity), c.supply_type
    FROM bom_tree bt JOIN public.mrp_bom_lines c ON c.parent_line_id=bt.bom_line_id AND c.tenant_id=v_tenant AND c.status='active'
  ), avail AS (
    SELECT item_id, COALESCE(SUM(available_qty),0) available_qty FROM public.inventory_stock_balances WHERE tenant_id=v_tenant GROUP BY item_id
  )
  INSERT INTO public.mrp_bom_explosion_lines(tenant_id,run_id,bom_line_id,level_no,parent_item_id,component_item_id,gross_quantity,scrap_quantity,net_required_quantity,available_quantity,shortage_quantity,supply_type,recommended_action)
  SELECT v_tenant,v_run,bom_line_id,level_no,parent_item_id,component_item_id,gross_qty,scrap_qty,net_qty,COALESCE(a.available_qty,0),GREATEST(net_qty-COALESCE(a.available_qty,0),0),supply_type,CASE WHEN GREATEST(net_qty-COALESCE(a.available_qty,0),0)>0 THEN CASE WHEN supply_type='buy' THEN 'create_purchase_requisition' WHEN supply_type='make' THEN 'create_planned_order' ELSE 'review_supply' END ELSE 'stock_available' END
  FROM bom_tree LEFT JOIN avail a ON a.item_id=bom_tree.component_item_id;
  RETURN v_run;
END $$;
GRANT EXECUTE ON FUNCTION public.explode_mrp_bom(UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_mrp_bom_availability(p_bom_version_id UUID,p_demand_quantity NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_check UUID; v_run UUID; v_short INT;
BEGIN
  v_run := public.explode_mrp_bom(p_bom_version_id,p_demand_quantity);
  SELECT COUNT(*) INTO v_short FROM public.mrp_bom_explosion_lines WHERE run_id=v_run AND tenant_id=v_tenant AND shortage_quantity>0;
  INSERT INTO public.mrp_bom_availability_checks(tenant_id,check_number,bom_version_id,demand_quantity,can_build,shortage_count,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('bom_availability',NULL),p_bom_version_id,p_demand_quantity,v_short=0,v_short,auth.uid()) RETURNING id INTO v_check;
  INSERT INTO public.mrp_bom_availability_lines(tenant_id,check_id,component_item_id,required_quantity,available_quantity,shortage_quantity,recommendation)
  SELECT tenant_id,v_check,component_item_id,net_required_quantity,available_quantity,shortage_quantity,recommended_action FROM public.mrp_bom_explosion_lines WHERE run_id=v_run AND tenant_id=v_tenant;
  RETURN v_check;
END $$;
GRANT EXECUTE ON FUNCTION public.check_mrp_bom_availability(UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_mrp_bom_export(p_bom_version_id UUID,p_export_type TEXT DEFAULT 'excel')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  INSERT INTO public.mrp_bom_export_requests(tenant_id,request_number,bom_version_id,export_type,requested_by)
  VALUES(v_tenant,public.generate_mrp_next_code('bom_export',NULL),p_bom_version_id,COALESCE(p_export_type,'excel'),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_mrp_bom_export(UUID,TEXT) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_bom_headers','mrp_bom_versions','mrp_bom_lines','mrp_bom_line_substitutes','mrp_bom_line_suppliers','mrp_engineering_change_requests','mrp_engineering_change_orders','mrp_bom_approvals','mrp_bom_explosion_runs','mrp_bom_explosion_lines','mrp_bom_availability_checks','mrp_bom_availability_lines','mrp_bom_import_batches','mrp_bom_export_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_bom_tree WITH (security_invoker=true) AS
WITH RECURSIVE tree AS (
  SELECT l.tenant_id,l.bom_version_id,l.id AS line_id,l.parent_line_id,1 AS level_no,l.line_no,l.component_item_id,i.item_code,i.name_ar AS item_name,l.quantity_per,l.scrap_percent,l.net_quantity,l.material_type,l.supply_type,l.notes,LPAD(l.line_no::TEXT,4,'0') AS sort_path
  FROM public.mrp_bom_lines l JOIN public.inventory_items i ON i.id=l.component_item_id AND i.tenant_id=l.tenant_id
  WHERE l.tenant_id=public.current_user_tenant_id() AND l.parent_line_id IS NULL
  UNION ALL
  SELECT c.tenant_id,c.bom_version_id,c.id,c.parent_line_id,t.level_no+1,c.line_no,c.component_item_id,i.item_code,i.name_ar,c.quantity_per,c.scrap_percent,c.net_quantity,c.material_type,c.supply_type,c.notes,t.sort_path||'.'||LPAD(c.line_no::TEXT,4,'0')
  FROM tree t JOIN public.mrp_bom_lines c ON c.parent_line_id=t.line_id AND c.tenant_id=t.tenant_id JOIN public.inventory_items i ON i.id=c.component_item_id AND i.tenant_id=c.tenant_id
)
SELECT * FROM tree ORDER BY bom_version_id, sort_path;
GRANT SELECT ON public.mrp_bom_tree TO authenticated;

CREATE OR REPLACE VIEW public.mrp_bom_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_bom_headers WHERE tenant_id=public.current_user_tenant_id()) AS bom_count,
  (SELECT COUNT(*) FROM public.mrp_bom_versions WHERE tenant_id=public.current_user_tenant_id() AND status='effective') AS effective_versions,
  (SELECT COUNT(*) FROM public.mrp_engineering_change_requests WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','rejected')) AS open_ecr,
  (SELECT COUNT(*) FROM public.mrp_engineering_change_orders WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','rejected','implemented')) AS open_eco;
GRANT SELECT ON public.mrp_bom_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_bom_kpis WITH (security_invoker=true) AS
SELECT h.tenant_id,
  COUNT(DISTINCT h.id) AS bom_count,
  ROUND(COUNT(DISTINCT v.id) FILTER (WHERE v.status='effective')::NUMERIC/NULLIF(COUNT(DISTINCT h.id),0)*100,2) AS effective_bom_percent,
  ROUND(COUNT(l.id) FILTER (WHERE l.quantity_per>0 AND l.uom IS NOT NULL AND l.component_item_id IS NOT NULL)::NUMERIC/NULLIF(COUNT(l.id),0)*100,2) AS bom_completeness_percent,
  COUNT(DISTINCT ecr.id) FILTER (WHERE ecr.status NOT IN ('closed','rejected')) AS open_ecr_count
FROM public.mrp_bom_headers h LEFT JOIN public.mrp_bom_versions v ON v.bom_id=h.id AND v.tenant_id=h.tenant_id LEFT JOIN public.mrp_bom_lines l ON l.bom_version_id=v.id AND l.tenant_id=v.tenant_id LEFT JOIN public.mrp_engineering_change_requests ecr ON ecr.tenant_id=h.tenant_id
WHERE h.tenant_id=public.current_user_tenant_id()
GROUP BY h.tenant_id;
GRANT SELECT ON public.mrp_bom_kpis TO authenticated;

CREATE OR REPLACE VIEW public.mrp_eco_dashboard WITH (security_invoker=true) AS
SELECT e.tenant_id,e.id,e.eco_number,e.status,e.effectivity_date,e.impact_summary,e.created_at,r.ecr_number
FROM public.mrp_engineering_change_orders e LEFT JOIN public.mrp_engineering_change_requests r ON r.id=e.ecr_id AND r.tenant_id=e.tenant_id
WHERE e.tenant_id=public.current_user_tenant_id()
ORDER BY e.created_at DESC;
GRANT SELECT ON public.mrp_eco_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_bom_explosion_summary WITH (security_invoker=true) AS
SELECT r.tenant_id,r.run_number,r.demand_quantity,r.status,r.created_at,COUNT(l.id) AS line_count,SUM(l.net_required_quantity) AS total_required,SUM(l.shortage_quantity) AS total_shortage
FROM public.mrp_bom_explosion_runs r LEFT JOIN public.mrp_bom_explosion_lines l ON l.run_id=r.id AND l.tenant_id=r.tenant_id
WHERE r.tenant_id=public.current_user_tenant_id()
GROUP BY r.tenant_id,r.run_number,r.demand_quantity,r.status,r.created_at;
GRANT SELECT ON public.mrp_bom_explosion_summary TO authenticated;

CREATE OR REPLACE VIEW public.mrp_bom_availability_shortages WITH (security_invoker=true) AS
SELECT a.tenant_id,a.check_number,a.can_build,a.shortage_count,l.component_item_id,i.item_code,i.name_ar AS item_name,l.required_quantity,l.available_quantity,l.shortage_quantity,l.recommendation,a.created_at
FROM public.mrp_bom_availability_checks a JOIN public.mrp_bom_availability_lines l ON l.check_id=a.id AND l.tenant_id=a.tenant_id JOIN public.inventory_items i ON i.id=l.component_item_id AND i.tenant_id=l.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id() AND l.shortage_quantity>0;
GRANT SELECT ON public.mrp_bom_availability_shortages TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_bom_headers') IS NULL OR to_regclass('public.mrp_bom_tree') IS NULL OR to_regprocedure('public.explode_mrp_bom(uuid,numeric)') IS NULL THEN
    RAISE EXCEPTION '0219 failed: MRP BOM objects missing';
  END IF;
  RAISE NOTICE '✅ 0219: MRP BOM and engineering change applied';
END $$;
