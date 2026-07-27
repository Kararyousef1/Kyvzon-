-- ============================================================================
-- 0227 — MRP Unit 09: Manufacturing Costing
-- docs/mrp/09-manufacturing-costing.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_cost_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  element_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  cost_category TEXT NOT NULL CHECK (cost_category IN ('material','labor','machine','overhead','subcontract','quality','maintenance','scrap','rework')),
  finance_account_code TEXT,
  is_capitalized BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,element_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_costing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  costing_method TEXT NOT NULL DEFAULT 'standard' CHECK (costing_method IN ('standard','actual','wac','hybrid')),
  currency_code TEXT NOT NULL DEFAULT 'IQD',
  overhead_method TEXT NOT NULL DEFAULT 'work_center_rate' CHECK (overhead_method IN ('work_center_rate','labor_percent','machine_hour','flat_percent','manual')),
  overhead_rate NUMERIC(18,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','inactive','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,profile_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_standard_cost_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_code TEXT NOT NULL,
  profile_id UUID REFERENCES public.mrp_costing_profiles(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL,
  effective_from DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','effective','superseded','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,version_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_item_standard_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  standard_cost_version_id UUID NOT NULL REFERENCES public.mrp_standard_cost_versions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  material_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  machine_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  overhead_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  subcontract_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  quality_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  maintenance_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  scrap_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  rework_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'IQD',
  source_rollup_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,standard_cost_version_id,item_id)
);

CREATE TABLE IF NOT EXISTS public.mrp_cost_rollup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  standard_cost_version_id UUID NOT NULL REFERENCES public.mrp_standard_cost_versions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  bom_version_id UUID REFERENCES public.mrp_bom_versions(id) ON DELETE SET NULL,
  routing_id UUID REFERENCES public.routing_headers(id) ON DELETE SET NULL,
  rollup_qty NUMERIC(18,6) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed','cancelled')),
  total_unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  run_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,run_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_cost_rollup_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rollup_run_id UUID NOT NULL REFERENCES public.mrp_cost_rollup_runs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('bom_material','routing_labor','routing_machine','routing_overhead','manual')),
  cost_category TEXT NOT NULL CHECK (cost_category IN ('material','labor','machine','overhead','subcontract','quality','maintenance','scrap','rework')),
  source_id UUID,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  rate NUMERIC(18,6) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  extended_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_actual_cost_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  standard_cost_version_id UUID REFERENCES public.mrp_standard_cost_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed','cancelled')),
  run_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,run_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_work_order_cost_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actual_cost_run_id UUID REFERENCES public.mrp_actual_cost_runs(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  cost_category TEXT NOT NULL CHECK (cost_category IN ('material','labor','machine','overhead','subcontract','quality','maintenance','scrap','rework')),
  source_table TEXT,
  source_id UUID,
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  rate NUMERIC(18,6) NOT NULL DEFAULT 0,
  actual_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  standard_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  variance_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_work_order_cost_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actual_cost_run_id UUID REFERENCES public.mrp_actual_cost_runs(id) ON DELETE SET NULL,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  good_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  scrap_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  material_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  machine_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  overhead_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  quality_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  maintenance_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  scrap_rework_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_actual_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  actual_unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  standard_unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_variance_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,work_order_id)
);

CREATE TABLE IF NOT EXISTS public.mrp_cost_variances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  variance_type TEXT NOT NULL CHECK (variance_type IN ('material_usage','material_price','labor_efficiency','labor_rate','machine_efficiency','overhead','scrap','rework','maintenance')),
  cost_category TEXT NOT NULL,
  standard_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','urgent')),
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_wip_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ledger_number TEXT NOT NULL,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('material_issue','labor_absorb','machine_absorb','overhead_absorb','maintenance_absorb','scrap','rework','fg_receipt','adjustment')),
  debit_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  reference_table TEXT,
  reference_id UUID,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,ledger_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_finished_goods_costing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fg_cost_number TEXT NOT NULL,
  work_order_id UUID NOT NULL REFERENCES public.mrp_work_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  good_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  valuation_method TEXT NOT NULL DEFAULT 'actual' CHECK (valuation_method IN ('standard','actual','hybrid')),
  valued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,fg_cost_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_cost_posting_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  posting_number TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('work_order_cost','wip_ledger','fg_valuation','variance','manual_adjustment')),
  source_id UUID,
  posting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  debit_account_code TEXT,
  credit_account_code TEXT,
  amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'IQD',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','posted','cancelled')),
  finance_journal_entry_id UUID,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  posted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,posting_number)
);

CREATE OR REPLACE FUNCTION public.upsert_mrp_cost_element(p_element_code TEXT,p_name_ar TEXT,p_cost_category TEXT,p_finance_account_code TEXT DEFAULT NULL,p_is_capitalized BOOLEAN DEFAULT true)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('cost_element',p_element_code);
  INSERT INTO public.mrp_cost_elements(tenant_id,element_code,name_ar,cost_category,finance_account_code,is_capitalized)
  VALUES(v_tenant,v_code,p_name_ar,p_cost_category,p_finance_account_code,COALESCE(p_is_capitalized,true))
  ON CONFLICT (tenant_id,element_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,cost_category=EXCLUDED.cost_category,finance_account_code=EXCLUDED.finance_account_code,is_capitalized=EXCLUDED.is_capitalized
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_cost_element(TEXT,TEXT,TEXT,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_costing_profile(p_profile_code TEXT,p_name_ar TEXT,p_plant_id UUID DEFAULT NULL,p_costing_method TEXT DEFAULT 'standard',p_currency_code TEXT DEFAULT 'IQD',p_overhead_method TEXT DEFAULT 'work_center_rate',p_overhead_rate NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('costing_profile',p_profile_code);
  INSERT INTO public.mrp_costing_profiles(tenant_id,profile_code,name_ar,plant_id,costing_method,currency_code,overhead_method,overhead_rate,created_by)
  VALUES(v_tenant,v_code,p_name_ar,p_plant_id,COALESCE(p_costing_method,'standard'),COALESCE(p_currency_code,'IQD'),COALESCE(p_overhead_method,'work_center_rate'),COALESCE(p_overhead_rate,0),auth.uid())
  ON CONFLICT (tenant_id,profile_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,plant_id=EXCLUDED.plant_id,costing_method=EXCLUDED.costing_method,currency_code=EXCLUDED.currency_code,overhead_method=EXCLUDED.overhead_method,overhead_rate=EXCLUDED.overhead_rate
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_costing_profile(TEXT,TEXT,UUID,TEXT,TEXT,TEXT,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_standard_cost_version(p_version_code TEXT,p_name_ar TEXT,p_profile_id UUID DEFAULT NULL,p_effective_from DATE DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('standard_cost_version',p_version_code);
  INSERT INTO public.mrp_standard_cost_versions(tenant_id,version_code,profile_id,name_ar,effective_from,created_by)
  VALUES(v_tenant,v_code,p_profile_id,p_name_ar,p_effective_from,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_standard_cost_version(TEXT,TEXT,UUID,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_item_standard_cost(p_standard_cost_version_id UUID,p_item_id UUID,p_material NUMERIC DEFAULT 0,p_labor NUMERIC DEFAULT 0,p_machine NUMERIC DEFAULT 0,p_overhead NUMERIC DEFAULT 0,p_subcontract NUMERIC DEFAULT 0,p_quality NUMERIC DEFAULT 0,p_maintenance NUMERIC DEFAULT 0,p_scrap NUMERIC DEFAULT 0,p_rework NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_total NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_total := COALESCE(p_material,0)+COALESCE(p_labor,0)+COALESCE(p_machine,0)+COALESCE(p_overhead,0)+COALESCE(p_subcontract,0)+COALESCE(p_quality,0)+COALESCE(p_maintenance,0)+COALESCE(p_scrap,0)+COALESCE(p_rework,0);
  INSERT INTO public.mrp_item_standard_costs(tenant_id,standard_cost_version_id,item_id,material_cost,labor_cost,machine_cost,overhead_cost,subcontract_cost,quality_cost,maintenance_cost,scrap_cost,rework_cost,total_unit_cost)
  VALUES(v_tenant,p_standard_cost_version_id,p_item_id,COALESCE(p_material,0),COALESCE(p_labor,0),COALESCE(p_machine,0),COALESCE(p_overhead,0),COALESCE(p_subcontract,0),COALESCE(p_quality,0),COALESCE(p_maintenance,0),COALESCE(p_scrap,0),COALESCE(p_rework,0),v_total)
  ON CONFLICT (tenant_id,standard_cost_version_id,item_id) DO UPDATE SET material_cost=EXCLUDED.material_cost,labor_cost=EXCLUDED.labor_cost,machine_cost=EXCLUDED.machine_cost,overhead_cost=EXCLUDED.overhead_cost,subcontract_cost=EXCLUDED.subcontract_cost,quality_cost=EXCLUDED.quality_cost,maintenance_cost=EXCLUDED.maintenance_cost,scrap_cost=EXCLUDED.scrap_cost,rework_cost=EXCLUDED.rework_cost,total_unit_cost=EXCLUDED.total_unit_cost
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_item_standard_cost(UUID,UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_mrp_standard_cost_version(p_standard_cost_version_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_standard_cost_versions SET status='effective',approved_by=auth.uid(),approved_at=NOW() WHERE id=p_standard_cost_version_id AND tenant_id=v_tenant AND status IN ('draft','approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD_COST_VERSION_NOT_APPROVABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_mrp_standard_cost_version(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_mrp_standard_cost_rollup(p_standard_cost_version_id UUID,p_item_id UUID,p_bom_version_id UUID DEFAULT NULL,p_routing_id UUID DEFAULT NULL,p_rollup_qty NUMERIC DEFAULT 1)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_run UUID; v_bom UUID; v_routing UUID; v_total NUMERIC; v_mat NUMERIC; v_labor NUMERIC; v_machine NUMERIC; v_overhead NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_bom := p_bom_version_id;
  IF v_bom IS NULL THEN SELECT v.id INTO v_bom FROM public.mrp_bom_versions v JOIN public.mrp_bom_headers h ON h.id=v.bom_id AND h.tenant_id=v.tenant_id WHERE v.tenant_id=v_tenant AND h.item_id=p_item_id AND v.status IN ('effective','approved') ORDER BY v.effective_from DESC NULLS LAST LIMIT 1; END IF;
  v_routing := p_routing_id;
  IF v_routing IS NULL THEN SELECT id INTO v_routing FROM public.routing_headers WHERE tenant_id=v_tenant AND item_id=p_item_id AND status='effective' LIMIT 1; END IF;
  INSERT INTO public.mrp_cost_rollup_runs(tenant_id,run_number,standard_cost_version_id,item_id,bom_version_id,routing_id,rollup_qty,run_by)
  VALUES(v_tenant,public.generate_mrp_next_code('cost_rollup',NULL),p_standard_cost_version_id,p_item_id,v_bom,v_routing,COALESCE(p_rollup_qty,1),auth.uid()) RETURNING id INTO v_run;
  INSERT INTO public.mrp_cost_rollup_lines(tenant_id,rollup_run_id,source_type,cost_category,source_id,item_id,quantity,rate,unit_cost,extended_cost,notes)
  SELECT v_tenant,v_run,'bom_material','material',bl.id,bl.component_item_id,bl.net_quantity,COALESCE(sc.total_unit_cost,0),COALESCE(sc.total_unit_cost,0),bl.net_quantity*COALESCE(sc.total_unit_cost,0),'BOM material rollup'
  FROM public.mrp_bom_lines bl LEFT JOIN public.mrp_item_standard_costs sc ON sc.tenant_id=bl.tenant_id AND sc.standard_cost_version_id=p_standard_cost_version_id AND sc.item_id=bl.component_item_id
  WHERE bl.tenant_id=v_tenant AND bl.bom_version_id=v_bom AND bl.status='active';
  INSERT INTO public.mrp_cost_rollup_lines(tenant_id,rollup_run_id,source_type,cost_category,source_id,work_center_id,quantity,rate,unit_cost,extended_cost,notes)
  SELECT v_tenant,v_run,'routing_labor','labor',ro.id,ro.work_center_id,(COALESCE(ro.setup_minutes,0)+COALESCE(ro.run_minutes_per_unit,0))/60,COALESCE(wc.labor_rate_per_hour,0),COALESCE(wc.labor_rate_per_hour,0),(COALESCE(ro.setup_minutes,0)+COALESCE(ro.run_minutes_per_unit,0))/60*COALESCE(wc.labor_rate_per_hour,0),'Routing labor rollup'
  FROM public.routing_operations ro LEFT JOIN public.work_centers wc ON wc.id=ro.work_center_id AND wc.tenant_id=ro.tenant_id WHERE ro.tenant_id=v_tenant AND ro.routing_id=v_routing AND ro.status='active';
  INSERT INTO public.mrp_cost_rollup_lines(tenant_id,rollup_run_id,source_type,cost_category,source_id,work_center_id,quantity,rate,unit_cost,extended_cost,notes)
  SELECT v_tenant,v_run,'routing_machine','machine',ro.id,ro.work_center_id,COALESCE(ro.run_minutes_per_unit,0)/60,COALESCE(wc.machine_rate_per_hour,0),COALESCE(wc.machine_rate_per_hour,0),COALESCE(ro.run_minutes_per_unit,0)/60*COALESCE(wc.machine_rate_per_hour,0),'Routing machine rollup'
  FROM public.routing_operations ro LEFT JOIN public.work_centers wc ON wc.id=ro.work_center_id AND wc.tenant_id=ro.tenant_id WHERE ro.tenant_id=v_tenant AND ro.routing_id=v_routing AND ro.status='active';
  INSERT INTO public.mrp_cost_rollup_lines(tenant_id,rollup_run_id,source_type,cost_category,source_id,work_center_id,quantity,rate,unit_cost,extended_cost,notes)
  SELECT v_tenant,v_run,'routing_overhead','overhead',ro.id,ro.work_center_id,COALESCE(ro.run_minutes_per_unit,0)/60,COALESCE(wc.overhead_rate_per_hour,0),COALESCE(wc.overhead_rate_per_hour,0),COALESCE(ro.run_minutes_per_unit,0)/60*COALESCE(wc.overhead_rate_per_hour,0),'Routing overhead rollup'
  FROM public.routing_operations ro LEFT JOIN public.work_centers wc ON wc.id=ro.work_center_id AND wc.tenant_id=ro.tenant_id WHERE ro.tenant_id=v_tenant AND ro.routing_id=v_routing AND ro.status='active';
  SELECT COALESCE(SUM(extended_cost),0) INTO v_total FROM public.mrp_cost_rollup_lines WHERE tenant_id=v_tenant AND rollup_run_id=v_run;
  SELECT COALESCE(SUM(extended_cost),0) INTO v_mat FROM public.mrp_cost_rollup_lines WHERE tenant_id=v_tenant AND rollup_run_id=v_run AND cost_category='material';
  SELECT COALESCE(SUM(extended_cost),0) INTO v_labor FROM public.mrp_cost_rollup_lines WHERE tenant_id=v_tenant AND rollup_run_id=v_run AND cost_category='labor';
  SELECT COALESCE(SUM(extended_cost),0) INTO v_machine FROM public.mrp_cost_rollup_lines WHERE tenant_id=v_tenant AND rollup_run_id=v_run AND cost_category='machine';
  SELECT COALESCE(SUM(extended_cost),0) INTO v_overhead FROM public.mrp_cost_rollup_lines WHERE tenant_id=v_tenant AND rollup_run_id=v_run AND cost_category='overhead';
  UPDATE public.mrp_cost_rollup_runs SET total_unit_cost=v_total WHERE id=v_run AND tenant_id=v_tenant;
  PERFORM public.upsert_mrp_item_standard_cost(p_standard_cost_version_id,p_item_id,v_mat,v_labor,v_machine,v_overhead,0,0,0,0,0);
  UPDATE public.mrp_item_standard_costs SET source_rollup_run_id=v_run WHERE tenant_id=v_tenant AND standard_cost_version_id=p_standard_cost_version_id AND item_id=p_item_id;
  RETURN v_run;
END $$;
GRANT EXECUTE ON FUNCTION public.run_mrp_standard_cost_rollup(UUID,UUID,UUID,UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_mrp_actual_work_order_costing(p_work_order_id UUID,p_standard_cost_version_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_run UUID; v_item UUID; v_good NUMERIC; v_scrap NUMERIC; v_std NUMERIC; v_total NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT item_id,quantity_completed,quantity_scrapped INTO v_item,v_good,v_scrap FROM public.mrp_work_orders WHERE id=p_work_order_id AND tenant_id=v_tenant;
  IF v_item IS NULL THEN RAISE EXCEPTION 'WORK_ORDER_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_actual_cost_runs(tenant_id,run_number,work_order_id,standard_cost_version_id,run_by) VALUES(v_tenant,public.generate_mrp_next_code('actual_cost_run',NULL),p_work_order_id,p_standard_cost_version_id,auth.uid()) RETURNING id INTO v_run;
  DELETE FROM public.mrp_work_order_cost_lines WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id;
  INSERT INTO public.mrp_work_order_cost_lines(tenant_id,actual_cost_run_id,work_order_id,cost_category,source_table,source_id,quantity,rate,actual_cost,notes)
  SELECT v_tenant,v_run,p_work_order_id,'material','mrp_actual_material_consumption',c.id,c.actual_qty,COALESCE(sc.total_unit_cost,0),c.actual_qty*COALESCE(sc.total_unit_cost,0),'Actual material consumption'
  FROM public.mrp_actual_material_consumption c LEFT JOIN public.mrp_item_standard_costs sc ON sc.tenant_id=c.tenant_id AND sc.standard_cost_version_id=p_standard_cost_version_id AND sc.item_id=c.item_id
  WHERE c.tenant_id=v_tenant AND c.work_order_id=p_work_order_id;
  INSERT INTO public.mrp_work_order_cost_lines(tenant_id,actual_cost_run_id,work_order_id,cost_category,source_table,source_id,quantity,rate,actual_cost,notes)
  SELECT v_tenant,v_run,p_work_order_id,'labor','mrp_labor_assignments',la.id,COALESCE(la.direct_minutes,0)/60,COALESCE(wc.labor_rate_per_hour,0),COALESCE(la.direct_minutes,0)/60*COALESCE(wc.labor_rate_per_hour,0),'Actual labor'
  FROM public.mrp_labor_assignments la LEFT JOIN public.work_centers wc ON wc.id=la.work_center_id AND wc.tenant_id=la.tenant_id WHERE la.tenant_id=v_tenant AND la.work_order_id=p_work_order_id;
  INSERT INTO public.mrp_work_order_cost_lines(tenant_id,actual_cost_run_id,work_order_id,cost_category,source_table,source_id,quantity,rate,actual_cost,notes)
  SELECT v_tenant,v_run,p_work_order_id,'machine','mrp_production_events',pe.id,COALESCE(pe.cycle_time_seconds,0)/3600,COALESCE(wc.machine_rate_per_hour,0),COALESCE(pe.cycle_time_seconds,0)/3600*COALESCE(wc.machine_rate_per_hour,0),'Actual machine time'
  FROM public.mrp_production_events pe LEFT JOIN public.work_centers wc ON wc.id=pe.work_center_id AND wc.tenant_id=pe.tenant_id WHERE pe.tenant_id=v_tenant AND pe.work_order_id=p_work_order_id;
  INSERT INTO public.mrp_work_order_cost_lines(tenant_id,actual_cost_run_id,work_order_id,cost_category,source_table,source_id,quantity,rate,actual_cost,notes)
  SELECT v_tenant,v_run,p_work_order_id,'maintenance','mrp_maintenance_work_orders',mw.id,1,COALESCE(mw.total_cost,0),COALESCE(mw.total_cost,0),'Maintenance absorbed to production'
  FROM public.mrp_maintenance_work_orders mw WHERE mw.tenant_id=v_tenant AND mw.manufacturing_work_order_id=p_work_order_id AND mw.status IN ('completed','closed');
  SELECT COALESCE(total_unit_cost,0) INTO v_std FROM public.mrp_item_standard_costs WHERE tenant_id=v_tenant AND standard_cost_version_id=p_standard_cost_version_id AND item_id=v_item LIMIT 1;
  IF COALESCE(v_scrap,0)>0 THEN INSERT INTO public.mrp_work_order_cost_lines(tenant_id,actual_cost_run_id,work_order_id,cost_category,source_table,quantity,rate,actual_cost,notes) VALUES(v_tenant,v_run,p_work_order_id,'scrap','mrp_work_orders',v_scrap,COALESCE(v_std,0),v_scrap*COALESCE(v_std,0),'Scrap cost'); END IF;
  SELECT COALESCE(SUM(actual_cost),0) INTO v_total FROM public.mrp_work_order_cost_lines WHERE tenant_id=v_tenant AND actual_cost_run_id=v_run;
  INSERT INTO public.mrp_work_order_cost_summaries(tenant_id,actual_cost_run_id,work_order_id,item_id,good_qty,scrap_qty,material_cost,labor_cost,machine_cost,overhead_cost,quality_cost,maintenance_cost,scrap_rework_cost,total_actual_cost,actual_unit_cost,standard_unit_cost,total_variance_cost)
  SELECT v_tenant,v_run,p_work_order_id,v_item,COALESCE(v_good,0),COALESCE(v_scrap,0),COALESCE(SUM(actual_cost) FILTER (WHERE cost_category='material'),0),COALESCE(SUM(actual_cost) FILTER (WHERE cost_category='labor'),0),COALESCE(SUM(actual_cost) FILTER (WHERE cost_category='machine'),0),COALESCE(SUM(actual_cost) FILTER (WHERE cost_category='overhead'),0),COALESCE(SUM(actual_cost) FILTER (WHERE cost_category='quality'),0),COALESCE(SUM(actual_cost) FILTER (WHERE cost_category='maintenance'),0),COALESCE(SUM(actual_cost) FILTER (WHERE cost_category IN ('scrap','rework')),0),v_total,CASE WHEN COALESCE(v_good,0)>0 THEN v_total/v_good ELSE 0 END,COALESCE(v_std,0),v_total-(COALESCE(v_std,0)*COALESCE(v_good,0)) FROM public.mrp_work_order_cost_lines WHERE tenant_id=v_tenant AND actual_cost_run_id=v_run
  ON CONFLICT (tenant_id,work_order_id) DO UPDATE SET actual_cost_run_id=EXCLUDED.actual_cost_run_id,good_qty=EXCLUDED.good_qty,scrap_qty=EXCLUDED.scrap_qty,material_cost=EXCLUDED.material_cost,labor_cost=EXCLUDED.labor_cost,machine_cost=EXCLUDED.machine_cost,overhead_cost=EXCLUDED.overhead_cost,quality_cost=EXCLUDED.quality_cost,maintenance_cost=EXCLUDED.maintenance_cost,scrap_rework_cost=EXCLUDED.scrap_rework_cost,total_actual_cost=EXCLUDED.total_actual_cost,actual_unit_cost=EXCLUDED.actual_unit_cost,standard_unit_cost=EXCLUDED.standard_unit_cost,total_variance_cost=EXCLUDED.total_variance_cost;
  RETURN v_run;
END $$;
GRANT EXECUTE ON FUNCTION public.run_mrp_actual_work_order_costing(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_mrp_work_order_variances(p_work_order_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_sum RECORD; v_count INT:=0;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  DELETE FROM public.mrp_cost_variances WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id;
  SELECT * INTO v_sum FROM public.mrp_work_order_cost_summaries WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ORDER_COST_SUMMARY_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_cost_variances(tenant_id,work_order_id,variance_type,cost_category,standard_amount,actual_amount,variance_amount,severity,explanation)
  VALUES(v_tenant,p_work_order_id,'material_usage','material',v_sum.standard_unit_cost*v_sum.good_qty,v_sum.material_cost,v_sum.material_cost-(v_sum.standard_unit_cost*v_sum.good_qty),CASE WHEN ABS(v_sum.total_variance_cost)>v_sum.standard_unit_cost THEN 'urgent' ELSE 'warning' END,'Actual vs standard material proxy');
  INSERT INTO public.mrp_cost_variances(tenant_id,work_order_id,variance_type,cost_category,standard_amount,actual_amount,variance_amount,severity,explanation)
  VALUES(v_tenant,p_work_order_id,'maintenance','maintenance',0,v_sum.maintenance_cost,v_sum.maintenance_cost,CASE WHEN v_sum.maintenance_cost>0 THEN 'warning' ELSE 'info' END,'Maintenance absorbed into production');
  INSERT INTO public.mrp_cost_variances(tenant_id,work_order_id,variance_type,cost_category,standard_amount,actual_amount,variance_amount,severity,explanation)
  VALUES(v_tenant,p_work_order_id,'scrap','scrap',0,v_sum.scrap_rework_cost,v_sum.scrap_rework_cost,CASE WHEN v_sum.scrap_rework_cost>0 THEN 'warning' ELSE 'info' END,'Scrap/rework cost');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 3;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_mrp_work_order_variances(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_mrp_wip_cost_ledger(p_work_order_id UUID,p_entry_type TEXT,p_debit NUMERIC DEFAULT 0,p_credit NUMERIC DEFAULT 0,p_reference_table TEXT DEFAULT NULL,p_reference_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_wip_cost_ledger(tenant_id,ledger_number,work_order_id,entry_type,debit_amount,credit_amount,reference_table,reference_id,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('wip_cost',NULL),p_work_order_id,p_entry_type,COALESCE(p_debit,0),COALESCE(p_credit,0),p_reference_table,p_reference_id,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.post_mrp_wip_cost_ledger(UUID,TEXT,NUMERIC,NUMERIC,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.value_mrp_finished_goods_from_work_order(p_work_order_id UUID,p_valuation_method TEXT DEFAULT 'actual')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_item UUID; v_good NUMERIC; v_total NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT item_id,quantity_completed INTO v_item,v_good FROM public.mrp_work_orders WHERE id=p_work_order_id AND tenant_id=v_tenant;
  SELECT total_actual_cost INTO v_total FROM public.mrp_work_order_cost_summaries WHERE tenant_id=v_tenant AND work_order_id=p_work_order_id;
  INSERT INTO public.mrp_finished_goods_costing(tenant_id,fg_cost_number,work_order_id,item_id,good_qty,total_cost,unit_cost,valuation_method,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('fg_cost',NULL),p_work_order_id,v_item,COALESCE(v_good,0),COALESCE(v_total,0),CASE WHEN COALESCE(v_good,0)>0 THEN COALESCE(v_total,0)/v_good ELSE 0 END,COALESCE(p_valuation_method,'actual'),auth.uid()) RETURNING id INTO v_id;
  PERFORM public.post_mrp_wip_cost_ledger(p_work_order_id,'fg_receipt',0,COALESCE(v_total,0),'mrp_finished_goods_costing',v_id);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.value_mrp_finished_goods_from_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_cost_posting_draft(p_source_type TEXT,p_source_id UUID,p_description TEXT,p_amount NUMERIC,p_debit_account_code TEXT DEFAULT NULL,p_credit_account_code TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_cost_posting_drafts(tenant_id,posting_number,source_type,source_id,description,amount,debit_account_code,credit_account_code,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('cost_posting',NULL),p_source_type,p_source_id,p_description,COALESCE(p_amount,0),p_debit_account_code,p_credit_account_code,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_cost_posting_draft(TEXT,UUID,TEXT,NUMERIC,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_mrp_cost_posting_reviewed(p_posting_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_cost_posting_drafts SET status='reviewed',reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=p_posting_id AND tenant_id=v_tenant AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'COST_POSTING_NOT_REVIEWABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_mrp_cost_posting_reviewed(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_mrp_cost_posting_posted(p_posting_id UUID,p_finance_journal_entry_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_cost_posting_drafts SET status='posted',finance_journal_entry_id=p_finance_journal_entry_id,posted_by=auth.uid(),posted_at=NOW() WHERE id=p_posting_id AND tenant_id=v_tenant AND status='reviewed';
  IF NOT FOUND THEN RAISE EXCEPTION 'COST_POSTING_NOT_POSTABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_mrp_cost_posting_posted(UUID,UUID) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_cost_elements','mrp_costing_profiles','mrp_standard_cost_versions','mrp_item_standard_costs','mrp_cost_rollup_runs','mrp_cost_rollup_lines','mrp_actual_cost_runs','mrp_work_order_cost_lines','mrp_work_order_cost_summaries','mrp_cost_variances','mrp_wip_cost_ledger','mrp_finished_goods_costing','mrp_cost_posting_drafts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''finance'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''finance'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''finance'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_cost_rollup_summary WITH (security_invoker=true) AS
SELECT r.*, i.item_code, i.name_ar AS item_name,
  COALESCE(SUM(l.extended_cost) FILTER (WHERE l.cost_category='material'),0) AS material_cost,
  COALESCE(SUM(l.extended_cost) FILTER (WHERE l.cost_category='labor'),0) AS labor_cost,
  COALESCE(SUM(l.extended_cost) FILTER (WHERE l.cost_category='machine'),0) AS machine_cost,
  COALESCE(SUM(l.extended_cost) FILTER (WHERE l.cost_category='overhead'),0) AS overhead_cost
FROM public.mrp_cost_rollup_runs r
LEFT JOIN public.mrp_cost_rollup_lines l ON l.rollup_run_id=r.id AND l.tenant_id=r.tenant_id
LEFT JOIN public.inventory_items i ON i.id=r.item_id AND i.tenant_id=r.tenant_id
WHERE r.tenant_id=public.current_user_tenant_id()
GROUP BY r.id,i.item_code,i.name_ar;
GRANT SELECT ON public.mrp_cost_rollup_summary TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_order_cost_dashboard WITH (security_invoker=true) AS
SELECT s.*, wo.work_order_number, wo.status AS work_order_status, i.item_code, i.name_ar AS item_name
FROM public.mrp_work_order_cost_summaries s
JOIN public.mrp_work_orders wo ON wo.id=s.work_order_id AND wo.tenant_id=s.tenant_id
LEFT JOIN public.inventory_items i ON i.id=s.item_id AND i.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
ORDER BY s.created_at DESC;
GRANT SELECT ON public.mrp_work_order_cost_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_cost_variance_analysis WITH (security_invoker=true) AS
SELECT v.*, wo.work_order_number, i.item_code, i.name_ar AS item_name
FROM public.mrp_cost_variances v
JOIN public.mrp_work_orders wo ON wo.id=v.work_order_id AND wo.tenant_id=v.tenant_id
LEFT JOIN public.inventory_items i ON i.id=wo.item_id AND i.tenant_id=wo.tenant_id
WHERE v.tenant_id=public.current_user_tenant_id()
ORDER BY CASE v.severity WHEN 'urgent' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, v.created_at DESC;
GRANT SELECT ON public.mrp_cost_variance_analysis TO authenticated;

CREATE OR REPLACE VIEW public.mrp_wip_valuation WITH (security_invoker=true) AS
SELECT l.tenant_id,l.work_order_id,wo.work_order_number,SUM(l.debit_amount-l.credit_amount) AS wip_balance,MAX(l.posted_at) AS last_posted_at
FROM public.mrp_wip_cost_ledger l JOIN public.mrp_work_orders wo ON wo.id=l.work_order_id AND wo.tenant_id=l.tenant_id
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id,l.work_order_id,wo.work_order_number;
GRANT SELECT ON public.mrp_wip_valuation TO authenticated;

CREATE OR REPLACE VIEW public.mrp_finished_goods_valuation WITH (security_invoker=true) AS
SELECT fg.*, wo.work_order_number, i.item_code, i.name_ar AS item_name
FROM public.mrp_finished_goods_costing fg
JOIN public.mrp_work_orders wo ON wo.id=fg.work_order_id AND wo.tenant_id=fg.tenant_id
LEFT JOIN public.inventory_items i ON i.id=fg.item_id AND i.tenant_id=fg.tenant_id
WHERE fg.tenant_id=public.current_user_tenant_id()
ORDER BY fg.valued_at DESC;
GRANT SELECT ON public.mrp_finished_goods_valuation TO authenticated;

CREATE OR REPLACE VIEW public.mrp_costing_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_standard_cost_versions WHERE tenant_id=public.current_user_tenant_id() AND status='effective') AS effective_standard_versions,
  (SELECT COUNT(*) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()) AS costed_work_orders,
  (SELECT ROUND(SUM(total_variance_cost),2) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()) AS total_variance,
  (SELECT COUNT(*) FROM public.mrp_cost_posting_drafts WHERE tenant_id=public.current_user_tenant_id() AND status IN ('draft','reviewed')) AS open_postings;
GRANT SELECT ON public.mrp_costing_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_costing_kpis WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  ROUND((SELECT AVG(actual_unit_cost) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()),4) AS avg_actual_unit_cost,
  ROUND((SELECT AVG(total_variance_cost) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()),4) AS avg_variance,
  ROUND((SELECT SUM(scrap_rework_cost) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()),4) AS scrap_rework_cost,
  ROUND((SELECT SUM(maintenance_cost) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()),4) AS maintenance_absorbed_cost;
GRANT SELECT ON public.mrp_costing_kpis TO authenticated;

CREATE OR REPLACE VIEW public.mrp_cost_by_item_report WITH (security_invoker=true) AS
SELECT s.tenant_id,s.item_id,i.item_code,i.name_ar AS item_name,COUNT(*) AS work_order_count,ROUND(AVG(s.actual_unit_cost),4) AS avg_actual_unit_cost,ROUND(AVG(s.standard_unit_cost),4) AS avg_standard_unit_cost,ROUND(SUM(s.total_variance_cost),4) AS total_variance
FROM public.mrp_work_order_cost_summaries s LEFT JOIN public.inventory_items i ON i.id=s.item_id AND i.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
GROUP BY s.tenant_id,s.item_id,i.item_code,i.name_ar;
GRANT SELECT ON public.mrp_cost_by_item_report TO authenticated;

CREATE OR REPLACE VIEW public.mrp_cost_posting_queue WITH (security_invoker=true) AS
SELECT * FROM public.mrp_cost_posting_drafts WHERE tenant_id=public.current_user_tenant_id() ORDER BY created_at DESC;
GRANT SELECT ON public.mrp_cost_posting_queue TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_cost_elements') IS NULL OR to_regclass('public.mrp_work_order_cost_summaries') IS NULL OR to_regclass('public.mrp_costing_dashboard') IS NULL OR to_regprocedure('public.run_mrp_actual_work_order_costing(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '0227 failed: MRP manufacturing costing objects missing';
  END IF;
  RAISE NOTICE '✅ 0227: MRP manufacturing costing applied';
END $$;
