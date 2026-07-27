-- ============================================================================
-- 0224 — MRP Unit 06: Quality Management
-- docs/mrp/06-quality-management.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_quality_inspection_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  bom_version_id UUID REFERENCES public.mrp_bom_versions(id) ON DELETE SET NULL,
  routing_id UUID REFERENCES public.routing_headers(id) ON DELETE SET NULL,
  inspection_stage TEXT NOT NULL CHECK (inspection_stage IN ('IQC','IPQC','OQC','FINAL','CUSTOMER_COMPLAINT','INTERNAL_AUDIT')),
  name_ar TEXT NOT NULL,
  aql_level TEXT DEFAULT 'AQL_1_0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','inactive','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plan_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_inspection_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.mrp_quality_inspection_plans(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.manufacturing_operation_catalog(id) ON DELETE SET NULL,
  routing_operation_id UUID REFERENCES public.routing_operations(id) ON DELETE SET NULL,
  point_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  ccp BOOLEAN NOT NULL DEFAULT false,
  specification TEXT,
  lower_spec_limit NUMERIC(18,6),
  upper_spec_limit NUMERIC(18,6),
  target_value NUMERIC(18,6),
  frequency_text TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plan_id,point_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  inspection_stage TEXT NOT NULL CHECK (inspection_stage IN ('IQC','IPQC','OQC','FINAL','CUSTOMER_COMPLAINT','INTERNAL_AUDIT')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,template_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.mrp_quality_checklist_templates(id) ON DELETE CASCADE,
  sequence_no INT NOT NULL,
  check_text TEXT NOT NULL,
  response_type TEXT NOT NULL DEFAULT 'pass_fail' CHECK (response_type IN ('pass_fail','numeric','text','select','photo')),
  required BOOLEAN NOT NULL DEFAULT true,
  lower_spec_limit NUMERIC(18,6),
  upper_spec_limit NUMERIC(18,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,template_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_aql_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  aql_code TEXT NOT NULL,
  lot_min INT NOT NULL,
  lot_max INT NOT NULL,
  sample_size INT NOT NULL,
  accept_number INT NOT NULL,
  reject_number INT NOT NULL,
  defect_class TEXT NOT NULL CHECK (defect_class IN ('critical','major','minor','observation')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,aql_code,lot_min,lot_max,defect_class)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_number TEXT NOT NULL,
  plan_id UUID REFERENCES public.mrp_quality_inspection_plans(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.mrp_quality_checklist_templates(id) ON DELETE SET NULL,
  inspection_stage TEXT NOT NULL CHECK (inspection_stage IN ('IQC','IPQC','OQC','FINAL','CUSTOMER_COMPLAINT','INTERNAL_AUDIT')),
  source_table TEXT,
  source_id UUID,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  batch_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  sample_size INT DEFAULT 0,
  accepted_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  defect_count INT NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','accepted','conditional_accept','rejected','rework_required','scrap_required')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_inspection','completed','cancelled')),
  inspector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,inspection_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_inspection_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id UUID NOT NULL REFERENCES public.mrp_quality_inspections(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.mrp_quality_checklist_items(id) ON DELETE SET NULL,
  inspection_point_id UUID REFERENCES public.mrp_quality_inspection_points(id) ON DELETE SET NULL,
  result_value TEXT,
  numeric_value NUMERIC(18,6),
  pass_fail TEXT CHECK (pass_fail IS NULL OR pass_fail IN ('pass','fail','na')),
  defect_class TEXT CHECK (defect_class IS NULL OR defect_class IN ('critical','major','minor','observation')),
  defect_description TEXT,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  measured_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_ncrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ncr_number TEXT NOT NULL,
  inspection_id UUID REFERENCES public.mrp_quality_inspections(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  defect_class TEXT NOT NULL CHECK (defect_class IN ('critical','major','minor','observation')),
  defect_type TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  reference_spec TEXT,
  immediate_action TEXT,
  disposition TEXT CHECK (disposition IS NULL OR disposition IN ('rtv','use_as_is','rework','scrap','sort','hold')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','impact_analysis','disposition_pending','capa_required','closed','cancelled')),
  opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,ncr_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_capa_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capa_number TEXT NOT NULL,
  ncr_id UUID REFERENCES public.mrp_quality_ncrs(id) ON DELETE SET NULL,
  capa_type TEXT NOT NULL CHECK (capa_type IN ('corrective','preventive','both')),
  root_cause_method TEXT DEFAULT '5_whys' CHECK (root_cause_method IN ('5_whys','fishbone','pareto','other')),
  root_cause_category TEXT CHECK (root_cause_category IS NULL OR root_cause_category IN ('materials','machines','methods','man','environment','measurement','unknown')),
  root_cause_text TEXT,
  corrective_action TEXT NOT NULL,
  preventive_action TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','verified','closed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(tenant_id,capa_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_measurement_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'gauge',
  standard_reference TEXT,
  calibration_frequency_days INT NOT NULL DEFAULT 180,
  last_calibration_date DATE,
  next_calibration_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','due','overdue','out_of_service','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,device_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_calibration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.mrp_quality_measurement_devices(id) ON DELETE CASCADE,
  event_number TEXT NOT NULL,
  calibration_date DATE NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail','conditional')),
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  certificate_url TEXT,
  next_due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,event_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_spc_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_point_id UUID REFERENCES public.mrp_quality_inspection_points(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  operation_id UUID REFERENCES public.mrp_work_order_operations(id) ON DELETE SET NULL,
  measured_value NUMERIC(18,6) NOT NULL,
  center_line NUMERIC(18,6),
  ucl NUMERIC(18,6),
  lcl NUMERIC(18,6),
  is_out_of_control BOOLEAN GENERATED ALWAYS AS (CASE WHEN ucl IS NOT NULL AND measured_value > ucl THEN true WHEN lcl IS NOT NULL AND measured_value < lcl THEN true ELSE false END) STORED,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  measured_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_quality_quarantine_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ncr_id UUID REFERENCES public.mrp_quality_ncrs(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  decision TEXT NOT NULL CHECK (decision IN ('release','conditional_release','reject','rtv','scrap','rework')),
  reason TEXT NOT NULL,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.create_mrp_quality_inspection_plan(p_plan_code TEXT,p_item_id UUID,p_stage TEXT,p_name_ar TEXT,p_aql_level TEXT DEFAULT 'AQL_1_0')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_quality_inspection_plans(tenant_id,plan_code,item_id,inspection_stage,name_ar,aql_level,created_by)
  VALUES(v_tenant,COALESCE(p_plan_code,public.generate_mrp_next_code('quality_plan',NULL)),p_item_id,p_stage,p_name_ar,COALESCE(p_aql_level,'AQL_1_0'),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_quality_inspection_plan(TEXT,UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_mrp_aql_sample(p_lot_size INT,p_aql_code TEXT DEFAULT 'AQL_1_0',p_defect_class TEXT DEFAULT 'major')
RETURNS TABLE(sample_size INT, accept_number INT, reject_number INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  RETURN QUERY SELECT r.sample_size,r.accept_number,r.reject_number FROM public.mrp_quality_aql_rules r WHERE (r.tenant_id=v_tenant OR r.tenant_id IS NULL) AND r.aql_code=p_aql_code AND r.defect_class=p_defect_class AND p_lot_size BETWEEN r.lot_min AND r.lot_max AND r.is_active LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT CASE WHEN p_lot_size<=150 THEN 13 WHEN p_lot_size<=280 THEN 20 WHEN p_lot_size<=500 THEN 32 WHEN p_lot_size<=1200 THEN 50 WHEN p_lot_size<=3200 THEN 80 ELSE 125 END, 1, 2; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_mrp_aql_sample(INT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_mrp_quality_inspection(p_plan_id UUID,p_stage TEXT,p_source_table TEXT,p_source_id UUID,p_item_id UUID,p_lot_id UUID,p_work_order_id UUID,p_operation_id UUID,p_batch_qty NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_sample INT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  SELECT sample_size INTO v_sample FROM public.calculate_mrp_aql_sample(COALESCE(p_batch_qty,0)::INT,'AQL_1_0','major') LIMIT 1;
  INSERT INTO public.mrp_quality_inspections(tenant_id,inspection_number,plan_id,inspection_stage,source_table,source_id,item_id,lot_id,work_order_id,operation_id,batch_qty,sample_size,status,inspector_id,started_at)
  VALUES(v_tenant,public.generate_mrp_next_code('quality_inspection',NULL),p_plan_id,p_stage,p_source_table,p_source_id,p_item_id,p_lot_id,p_work_order_id,p_operation_id,COALESCE(p_batch_qty,0),COALESCE(v_sample,0),'in_inspection',auth.uid(),NOW()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_mrp_quality_inspection(UUID,TEXT,TEXT,UUID,UUID,UUID,UUID,UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_quality_result(p_inspection_id UUID,p_result_value TEXT,p_numeric_value NUMERIC,p_pass_fail TEXT,p_defect_class TEXT DEFAULT NULL,p_defect_description TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_quality_inspection_results(tenant_id,inspection_id,result_value,numeric_value,pass_fail,defect_class,defect_description,measured_by)
  VALUES(v_tenant,p_inspection_id,p_result_value,p_numeric_value,p_pass_fail,p_defect_class,p_defect_description,auth.uid()) RETURNING id INTO v_id;
  UPDATE public.mrp_quality_inspections SET defect_count=defect_count+CASE WHEN p_pass_fail='fail' THEN 1 ELSE 0 END, accepted_count=accepted_count+CASE WHEN p_pass_fail='pass' THEN 1 ELSE 0 END, rejected_count=rejected_count+CASE WHEN p_pass_fail='fail' THEN 1 ELSE 0 END WHERE id=p_inspection_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_quality_result(UUID,TEXT,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_mrp_quality_inspection(p_inspection_id UUID,p_decision TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_ins RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  SELECT * INTO v_ins FROM public.mrp_quality_inspections WHERE id=p_inspection_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSPECTION_NOT_FOUND'; END IF;
  UPDATE public.mrp_quality_inspections SET decision=p_decision,status='completed',completed_at=NOW() WHERE id=p_inspection_id AND tenant_id=v_tenant;
  IF p_decision IN ('rejected','rework_required','scrap_required') THEN
    PERFORM public.create_mrp_quality_ncr(p_inspection_id,COALESCE(v_ins.item_id,NULL),COALESCE(v_ins.lot_id,NULL),COALESCE(v_ins.work_order_id,NULL),'major','inspection_failure','فشل فحص الجودة',COALESCE(v_ins.batch_qty,0),'فتح تلقائي من فحص الجودة');
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_mrp_quality_inspection(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_quality_ncr(p_inspection_id UUID,p_item_id UUID,p_lot_id UUID,p_work_order_id UUID,p_defect_class TEXT,p_defect_type TEXT,p_description TEXT,p_affected_qty NUMERIC,p_immediate_action TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_quality_ncrs(tenant_id,ncr_number,inspection_id,item_id,lot_id,work_order_id,defect_class,defect_type,description,affected_qty,immediate_action,opened_by)
  VALUES(v_tenant,public.generate_mrp_next_code('quality_ncr',NULL),p_inspection_id,p_item_id,p_lot_id,p_work_order_id,p_defect_class,p_defect_type,p_description,COALESCE(p_affected_qty,0),p_immediate_action,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_quality_ncr(UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_mrp_quality_ncr(p_ncr_id UUID,p_disposition TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  UPDATE public.mrp_quality_ncrs SET disposition=p_disposition,status=CASE WHEN p_disposition IN ('rework','scrap') THEN 'capa_required' ELSE 'closed' END,closed_by=CASE WHEN p_disposition NOT IN ('rework','scrap') THEN auth.uid() ELSE closed_by END,closed_at=CASE WHEN p_disposition NOT IN ('rework','scrap') THEN NOW() ELSE closed_at END WHERE id=p_ncr_id AND tenant_id=v_tenant;
  INSERT INTO public.mrp_quality_quarantine_decisions(tenant_id,ncr_id,item_id,lot_id,quantity,decision,reason,decided_by)
  SELECT tenant_id,id,item_id,lot_id,affected_qty,CASE WHEN p_disposition='use_as_is' THEN 'conditional_release' WHEN p_disposition='rtv' THEN 'rtv' WHEN p_disposition='scrap' THEN 'scrap' WHEN p_disposition='rework' THEN 'rework' ELSE 'release' END,p_reason,auth.uid() FROM public.mrp_quality_ncrs WHERE id=p_ncr_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.decide_mrp_quality_ncr(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_capa(p_ncr_id UUID,p_capa_type TEXT,p_root_cause_method TEXT,p_root_cause_category TEXT,p_root_cause_text TEXT,p_corrective_action TEXT,p_preventive_action TEXT,p_due_date DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_quality_capa_actions(tenant_id,capa_number,ncr_id,capa_type,root_cause_method,root_cause_category,root_cause_text,corrective_action,preventive_action,owner_id,due_date)
  VALUES(v_tenant,public.generate_mrp_next_code('quality_capa',NULL),p_ncr_id,p_capa_type,p_root_cause_method,p_root_cause_category,p_root_cause_text,p_corrective_action,p_preventive_action,auth.uid(),p_due_date) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_capa(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_capa(p_capa_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  UPDATE public.mrp_quality_capa_actions SET status='closed',closed_at=NOW() WHERE id=p_capa_id AND tenant_id=v_tenant;
  UPDATE public.mrp_quality_ncrs SET status='closed',closed_by=auth.uid(),closed_at=NOW() WHERE id=(SELECT ncr_id FROM public.mrp_quality_capa_actions WHERE id=p_capa_id AND tenant_id=v_tenant) AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_capa(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_calibration_event(p_device_id UUID,p_calibration_date DATE,p_result TEXT,p_next_due_date DATE,p_certificate_url TEXT DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_quality_calibration_events(tenant_id,device_id,event_number,calibration_date,result,performed_by,certificate_url,next_due_date,notes)
  VALUES(v_tenant,p_device_id,public.generate_mrp_next_code('calibration',NULL),p_calibration_date,p_result,auth.uid(),p_certificate_url,p_next_due_date,p_notes) RETURNING id INTO v_id;
  UPDATE public.mrp_quality_measurement_devices SET last_calibration_date=p_calibration_date,next_calibration_date=p_next_due_date,status=CASE WHEN p_result='pass' THEN 'active' ELSE 'out_of_service' END WHERE id=p_device_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_calibration_event(UUID,DATE,TEXT,DATE,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_spc_measurement(p_inspection_point_id UUID,p_work_order_id UUID,p_operation_id UUID,p_measured_value NUMERIC,p_center_line NUMERIC,p_ucl NUMERIC,p_lcl NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_out BOOLEAN;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_quality_spc_measurements(tenant_id,inspection_point_id,work_order_id,operation_id,measured_value,center_line,ucl,lcl,measured_by)
  VALUES(v_tenant,p_inspection_point_id,p_work_order_id,p_operation_id,p_measured_value,p_center_line,p_ucl,p_lcl,auth.uid()) RETURNING id INTO v_id;
  SELECT is_out_of_control INTO v_out FROM public.mrp_quality_spc_measurements WHERE id=v_id;
  IF v_out THEN
    INSERT INTO public.mrp_work_order_alerts(tenant_id,work_order_id,alert_type,severity,title,body) VALUES(v_tenant,p_work_order_id,'quality_hold','urgent','SPC خارج حدود السيطرة','قياس خارج UCL/LCL');
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_spc_measurement(UUID,UUID,UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_quality_inspection_plans','mrp_quality_inspection_points','mrp_quality_checklist_templates','mrp_quality_checklist_items','mrp_quality_aql_rules','mrp_quality_inspections','mrp_quality_inspection_results','mrp_quality_ncrs','mrp_quality_capa_actions','mrp_quality_measurement_devices','mrp_quality_calibration_events','mrp_quality_spc_measurements','mrp_quality_quarantine_decisions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''inventory'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''inventory'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''inventory'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_quality_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_quality_inspections WHERE tenant_id=public.current_user_tenant_id() AND status IN ('open','in_inspection')) AS open_inspections,
  (SELECT COUNT(*) FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','cancelled')) AS open_ncr,
  (SELECT COUNT(*) FROM public.mrp_quality_capa_actions WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','cancelled')) AS open_capa,
  (SELECT COUNT(*) FROM public.mrp_quality_measurement_devices WHERE tenant_id=public.current_user_tenant_id() AND (next_calibration_date <= CURRENT_DATE + 30 OR status IN ('due','overdue'))) AS calibration_due;
GRANT SELECT ON public.mrp_quality_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_inspection_queue WITH (security_invoker=true) AS
SELECT q.*, i.item_code, i.name_ar AS item_name, wo.work_order_number FROM public.mrp_quality_inspections q LEFT JOIN public.inventory_items i ON i.id=q.item_id AND i.tenant_id=q.tenant_id LEFT JOIN public.mrp_work_orders wo ON wo.id=q.work_order_id AND wo.tenant_id=q.tenant_id WHERE q.tenant_id=public.current_user_tenant_id() ORDER BY q.created_at DESC;
GRANT SELECT ON public.mrp_quality_inspection_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_ncr_dashboard WITH (security_invoker=true) AS
SELECT n.*, i.item_code, i.name_ar AS item_name, wo.work_order_number FROM public.mrp_quality_ncrs n LEFT JOIN public.inventory_items i ON i.id=n.item_id AND i.tenant_id=n.tenant_id LEFT JOIN public.mrp_work_orders wo ON wo.id=n.work_order_id AND wo.tenant_id=n.tenant_id WHERE n.tenant_id=public.current_user_tenant_id() ORDER BY n.created_at DESC;
GRANT SELECT ON public.mrp_quality_ncr_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_capa_dashboard WITH (security_invoker=true) AS
SELECT c.*, n.ncr_number FROM public.mrp_quality_capa_actions c LEFT JOIN public.mrp_quality_ncrs n ON n.id=c.ncr_id AND n.tenant_id=c.tenant_id WHERE c.tenant_id=public.current_user_tenant_id() ORDER BY c.created_at DESC;
GRANT SELECT ON public.mrp_quality_capa_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_calibration_due WITH (security_invoker=true) AS
SELECT * FROM public.mrp_quality_measurement_devices WHERE tenant_id=public.current_user_tenant_id() AND (next_calibration_date <= CURRENT_DATE + 30 OR status IN ('due','overdue'));
GRANT SELECT ON public.mrp_quality_calibration_due TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_spc_alerts WITH (security_invoker=true) AS
SELECT s.*, p.point_code, p.name_ar AS point_name FROM public.mrp_quality_spc_measurements s LEFT JOIN public.mrp_quality_inspection_points p ON p.id=s.inspection_point_id AND p.tenant_id=s.tenant_id WHERE s.tenant_id=public.current_user_tenant_id() AND s.is_out_of_control ORDER BY s.measured_at DESC;
GRANT SELECT ON public.mrp_quality_spc_alerts TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_quarantine_queue WITH (security_invoker=true) AS
SELECT q.*, n.ncr_number, i.item_code, i.name_ar AS item_name, l.lot_number FROM public.mrp_quality_quarantine_decisions q LEFT JOIN public.mrp_quality_ncrs n ON n.id=q.ncr_id AND n.tenant_id=q.tenant_id LEFT JOIN public.inventory_items i ON i.id=q.item_id AND i.tenant_id=q.tenant_id LEFT JOIN public.inventory_lots l ON l.id=q.lot_id AND l.tenant_id=q.tenant_id WHERE q.tenant_id=public.current_user_tenant_id() ORDER BY q.created_at DESC;
GRANT SELECT ON public.mrp_quality_quarantine_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_kpis WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  ROUND((SELECT COUNT(*) FILTER (WHERE decision IN ('accepted','conditional_accept'))::NUMERIC/NULLIF(COUNT(*),0)*100 FROM public.mrp_quality_inspections WHERE tenant_id=public.current_user_tenant_id()),2) AS fpy_percent,
  ROUND((SELECT COUNT(*) FILTER (WHERE disposition='scrap')::NUMERIC/NULLIF(COUNT(*),0)*100 FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id()),2) AS scrap_rate_percent,
  ROUND((SELECT COUNT(*) FILTER (WHERE disposition='rework')::NUMERIC/NULLIF(COUNT(*),0)*100 FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id()),2) AS rework_rate_percent,
  (SELECT AVG(EXTRACT(EPOCH FROM (closed_at-created_at))/86400) FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id() AND closed_at IS NOT NULL) AS avg_ncr_close_days;
GRANT SELECT ON public.mrp_quality_kpis TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_quality_inspections') IS NULL OR to_regclass('public.mrp_quality_ncrs') IS NULL OR to_regprocedure('public.start_mrp_quality_inspection(uuid,text,text,uuid,uuid,uuid,uuid,uuid,numeric)') IS NULL THEN
    RAISE EXCEPTION '0224 failed: MRP quality objects missing';
  END IF;
  RAISE NOTICE '✅ 0224: MRP quality management applied';
END $$;
