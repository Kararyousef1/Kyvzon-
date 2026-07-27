-- ============================================================================
-- 0226 — MRP Unit 08: Maintenance Management / CMMS
-- docs/mrp/08-maintenance-management-CMMS.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_maintenance_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_number TEXT NOT NULL,
  manufacturing_asset_id UUID REFERENCES public.manufacturing_assets(id) ON DELETE SET NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  commissioning_date DATE,
  warranty_end_date DATE,
  original_value NUMERIC(18,4) DEFAULT 0,
  expected_life_years NUMERIC(10,2),
  average_usage_hours_per_day NUMERIC(10,2),
  technical_specs JSONB NOT NULL DEFAULT '{}'::JSONB,
  criticality_class TEXT NOT NULL DEFAULT 'B' CHECK (criticality_class IN ('A','B','C')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','down','maintenance','retired')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,asset_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_maintenance_asset_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  maintenance_asset_id UUID NOT NULL REFERENCES public.mrp_maintenance_assets(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('manual','hydraulic_diagram','electrical_diagram','invoice','inspection_certificate','spare_parts_list','warranty','sop','other')),
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_asset_criticality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  maintenance_asset_id UUID NOT NULL REFERENCES public.mrp_maintenance_assets(id) ON DELETE CASCADE,
  production_impact_score INT NOT NULL CHECK (production_impact_score BETWEEN 1 AND 5),
  failure_likelihood_score INT NOT NULL CHECK (failure_likelihood_score BETWEEN 1 AND 5),
  safety_impact_score INT NOT NULL DEFAULT 1 CHECK (safety_impact_score BETWEEN 1 AND 5),
  quality_impact_score INT NOT NULL DEFAULT 1 CHECK (quality_impact_score BETWEEN 1 AND 5),
  total_score INT NOT NULL DEFAULT 0,
  criticality_class TEXT NOT NULL DEFAULT 'B' CHECK (criticality_class IN ('A','B','C')),
  rationale TEXT,
  assessed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_pm_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  maintenance_asset_id UUID NOT NULL REFERENCES public.mrp_maintenance_assets(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  maintenance_type TEXT NOT NULL DEFAULT 'preventive' CHECK (maintenance_type IN ('preventive','predictive','condition_based','inspection','calibration')),
  frequency_type TEXT NOT NULL CHECK (frequency_type IN ('daily','weekly','monthly','quarterly','yearly','meter_based','condition_based')),
  interval_value INT NOT NULL DEFAULT 1,
  estimated_minutes NUMERIC(12,2) NOT NULL DEFAULT 60,
  responsible_role TEXT DEFAULT 'maintenance_technician',
  sop_url TEXT,
  next_due_date DATE,
  last_generated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plan_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_pm_plan_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pm_plan_id UUID NOT NULL REFERENCES public.mrp_pm_plans(id) ON DELETE CASCADE,
  sequence_no INT NOT NULL,
  task_text TEXT NOT NULL,
  expected_result TEXT,
  mandatory BOOLEAN NOT NULL DEFAULT true,
  estimated_minutes NUMERIC(12,2) DEFAULT 0,
  required_skill TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,pm_plan_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS public.mrp_maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  maintenance_wo_number TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','pm_plan','condition_alert','shopfloor_breakdown','annual_shutdown')),
  source_id UUID,
  pm_plan_id UUID REFERENCES public.mrp_pm_plans(id) ON DELETE SET NULL,
  maintenance_asset_id UUID REFERENCES public.mrp_maintenance_assets(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  manufacturing_work_order_id UUID REFERENCES public.mrp_work_orders(id) ON DELETE SET NULL,
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('reactive','breakdown','preventive','predictive','condition_based','shutdown','inspection')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent','critical')),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  estimated_minutes NUMERIC(12,2) DEFAULT 0,
  actual_minutes NUMERIC(12,2) DEFAULT 0,
  downtime_minutes NUMERIC(12,2) DEFAULT 0,
  labor_cost NUMERIC(18,4) DEFAULT 0,
  parts_cost NUMERIC(18,4) DEFAULT 0,
  other_cost NUMERIC(18,4) DEFAULT 0,
  total_cost NUMERIC(18,4) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','in_progress','completed','closed','cancelled','on_hold')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  close_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,maintenance_wo_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_maintenance_work_order_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  maintenance_wo_id UUID NOT NULL REFERENCES public.mrp_maintenance_work_orders(id) ON DELETE CASCADE,
  pm_plan_task_id UUID REFERENCES public.mrp_pm_plan_tasks(id) ON DELETE SET NULL,
  sequence_no INT NOT NULL,
  task_text TEXT NOT NULL,
  result_text TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,maintenance_wo_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS public.mrp_maintenance_spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  spare_part_code TEXT NOT NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  maintenance_asset_id UUID REFERENCES public.mrp_maintenance_assets(id) ON DELETE SET NULL,
  spare_part_type TEXT NOT NULL CHECK (spare_part_type IN ('insurance','consumable','emergency','repairable','tool')),
  name_ar TEXT NOT NULL,
  current_stock_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(18,6) NOT NULL DEFAULT 0,
  min_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  max_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  lead_time_days INT DEFAULT 0,
  unit_cost NUMERIC(18,4) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','obsolete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,spare_part_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_maintenance_work_order_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  maintenance_wo_id UUID NOT NULL REFERENCES public.mrp_maintenance_work_orders(id) ON DELETE CASCADE,
  spare_part_id UUID REFERENCES public.mrp_maintenance_spare_parts(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  required_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  issued_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18,4) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'required' CHECK (status IN ('required','issued','short','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_condition_monitoring_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  maintenance_asset_id UUID NOT NULL REFERENCES public.mrp_maintenance_assets(id) ON DELETE CASCADE,
  reading_type TEXT NOT NULL CHECK (reading_type IN ('vibration','temperature','oil_tan','oil_viscosity','oil_water','pressure','current','runtime_hours','other')),
  reading_value NUMERIC(18,6) NOT NULL,
  unit TEXT NOT NULL,
  warning_threshold NUMERIC(18,6),
  critical_threshold NUMERIC(18,6),
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','warning','critical')),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_condition_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_number TEXT NOT NULL,
  reading_id UUID REFERENCES public.mrp_condition_monitoring_readings(id) ON DELETE SET NULL,
  maintenance_asset_id UUID REFERENCES public.mrp_maintenance_assets(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('warning_threshold','critical_threshold','trend_anomaly','manual')),
  severity TEXT NOT NULL CHECK (severity IN ('warning','urgent','critical')),
  title TEXT NOT NULL,
  body TEXT,
  maintenance_wo_id UUID REFERENCES public.mrp_maintenance_work_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','converted_to_wo','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,alert_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_annual_shutdown_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shutdown_number TEXT NOT NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  production_buffer_plan TEXT,
  external_vendor_plan TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('draft','planned','in_progress','completed','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,shutdown_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_annual_shutdown_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shutdown_plan_id UUID NOT NULL REFERENCES public.mrp_annual_shutdown_plans(id) ON DELETE CASCADE,
  sequence_no INT NOT NULL,
  maintenance_asset_id UUID REFERENCES public.mrp_maintenance_assets(id) ON DELETE SET NULL,
  task_text TEXT NOT NULL,
  required_spares TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  planned_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,shutdown_plan_id,sequence_no)
);

CREATE OR REPLACE FUNCTION public.upsert_mrp_maintenance_asset(p_asset_number TEXT,p_name_ar TEXT,p_manufacturing_asset_id UUID DEFAULT NULL,p_work_center_id UUID DEFAULT NULL,p_manufacturer TEXT DEFAULT NULL,p_model TEXT DEFAULT NULL,p_serial_number TEXT DEFAULT NULL,p_purchase_date DATE DEFAULT NULL,p_commissioning_date DATE DEFAULT NULL,p_warranty_end_date DATE DEFAULT NULL,p_original_value NUMERIC DEFAULT 0,p_expected_life_years NUMERIC DEFAULT NULL,p_specs JSONB DEFAULT '{}'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT; v_plant UUID; v_line UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('maintenance_asset',p_asset_number);
  SELECT plant_id,line_id INTO v_plant,v_line FROM public.work_centers WHERE id=p_work_center_id AND tenant_id=v_tenant;
  INSERT INTO public.mrp_maintenance_assets(tenant_id,asset_number,name_ar,manufacturing_asset_id,plant_id,line_id,work_center_id,manufacturer,model,serial_number,purchase_date,commissioning_date,warranty_end_date,original_value,expected_life_years,technical_specs,created_by,updated_at)
  VALUES(v_tenant,v_code,p_name_ar,p_manufacturing_asset_id,v_plant,v_line,p_work_center_id,p_manufacturer,p_model,p_serial_number,p_purchase_date,p_commissioning_date,p_warranty_end_date,COALESCE(p_original_value,0),p_expected_life_years,COALESCE(p_specs,'{}'::JSONB),auth.uid(),NOW())
  ON CONFLICT (tenant_id,asset_number) DO UPDATE SET name_ar=EXCLUDED.name_ar,manufacturing_asset_id=EXCLUDED.manufacturing_asset_id,plant_id=EXCLUDED.plant_id,line_id=EXCLUDED.line_id,work_center_id=EXCLUDED.work_center_id,manufacturer=EXCLUDED.manufacturer,model=EXCLUDED.model,serial_number=EXCLUDED.serial_number,warranty_end_date=EXCLUDED.warranty_end_date,technical_specs=EXCLUDED.technical_specs,updated_at=NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_maintenance_asset(TEXT,TEXT,UUID,UUID,TEXT,TEXT,TEXT,DATE,DATE,DATE,NUMERIC,NUMERIC,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.assess_mrp_asset_criticality(p_maintenance_asset_id UUID,p_production_impact INT,p_failure_likelihood INT,p_safety_impact INT DEFAULT 1,p_quality_impact INT DEFAULT 1,p_rationale TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_score INT; v_class TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_score := (p_production_impact*p_failure_likelihood)+p_safety_impact+p_quality_impact;
  v_class := CASE WHEN v_score>=18 THEN 'A' WHEN v_score>=10 THEN 'B' ELSE 'C' END;
  INSERT INTO public.mrp_asset_criticality_assessments(tenant_id,maintenance_asset_id,production_impact_score,failure_likelihood_score,safety_impact_score,quality_impact_score,total_score,criticality_class,rationale,assessed_by)
  VALUES(v_tenant,p_maintenance_asset_id,p_production_impact,p_failure_likelihood,COALESCE(p_safety_impact,1),COALESCE(p_quality_impact,1),v_score,v_class,p_rationale,auth.uid()) RETURNING id INTO v_id;
  UPDATE public.mrp_maintenance_assets SET criticality_class=v_class,updated_at=NOW() WHERE id=p_maintenance_asset_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.assess_mrp_asset_criticality(UUID,INT,INT,INT,INT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_pm_plan(p_maintenance_asset_id UUID,p_plan_code TEXT,p_plan_name TEXT,p_frequency_type TEXT,p_interval_value INT DEFAULT 1,p_estimated_minutes NUMERIC DEFAULT 60,p_next_due_date DATE DEFAULT NULL,p_sop_url TEXT DEFAULT NULL,p_maintenance_type TEXT DEFAULT 'preventive')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('pm_plan',p_plan_code);
  INSERT INTO public.mrp_pm_plans(tenant_id,plan_code,maintenance_asset_id,plan_name,maintenance_type,frequency_type,interval_value,estimated_minutes,next_due_date,sop_url,created_by)
  VALUES(v_tenant,v_code,p_maintenance_asset_id,p_plan_name,COALESCE(p_maintenance_type,'preventive'),p_frequency_type,COALESCE(p_interval_value,1),COALESCE(p_estimated_minutes,60),p_next_due_date,p_sop_url,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_pm_plan(UUID,TEXT,TEXT,TEXT,INT,NUMERIC,DATE,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mrp_pm_plan_task(p_pm_plan_id UUID,p_sequence_no INT,p_task_text TEXT,p_expected_result TEXT DEFAULT NULL,p_estimated_minutes NUMERIC DEFAULT 0,p_required_skill TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_pm_plan_tasks(tenant_id,pm_plan_id,sequence_no,task_text,expected_result,estimated_minutes,required_skill)
  VALUES(v_tenant,p_pm_plan_id,p_sequence_no,p_task_text,p_expected_result,COALESCE(p_estimated_minutes,0),p_required_skill) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_pm_plan_task(UUID,INT,TEXT,TEXT,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_maintenance_work_order(p_maintenance_asset_id UUID,p_maintenance_type TEXT,p_priority TEXT,p_title TEXT,p_description TEXT DEFAULT NULL,p_scheduled_start_at TIMESTAMPTZ DEFAULT NULL,p_scheduled_end_at TIMESTAMPTZ DEFAULT NULL,p_assigned_to UUID DEFAULT NULL,p_source_type TEXT DEFAULT 'manual',p_source_id UUID DEFAULT NULL,p_pm_plan_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_asset RECORD; v_est NUMERIC:=0;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT * INTO v_asset FROM public.mrp_maintenance_assets WHERE id=p_maintenance_asset_id AND tenant_id=v_tenant;
  IF p_maintenance_asset_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_ASSET_NOT_FOUND'; END IF;
  IF p_scheduled_start_at IS NOT NULL AND p_scheduled_end_at IS NOT NULL THEN v_est := ROUND((EXTRACT(EPOCH FROM (p_scheduled_end_at-p_scheduled_start_at))/60)::NUMERIC,2); END IF;
  INSERT INTO public.mrp_maintenance_work_orders(tenant_id,maintenance_wo_number,source_type,source_id,pm_plan_id,maintenance_asset_id,work_center_id,maintenance_type,priority,title,description,scheduled_start_at,scheduled_end_at,assigned_to,estimated_minutes,status,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('maintenance_wo',NULL),COALESCE(p_source_type,'manual'),p_source_id,p_pm_plan_id,p_maintenance_asset_id,v_asset.work_center_id,p_maintenance_type,COALESCE(p_priority,'medium'),p_title,p_description,p_scheduled_start_at,p_scheduled_end_at,p_assigned_to,v_est,CASE WHEN p_assigned_to IS NULL THEN 'new' ELSE 'assigned' END,auth.uid()) RETURNING id INTO v_id;
  IF p_pm_plan_id IS NOT NULL THEN
    INSERT INTO public.mrp_maintenance_work_order_tasks(tenant_id,maintenance_wo_id,pm_plan_task_id,sequence_no,task_text)
    SELECT v_tenant,v_id,id,sequence_no,task_text FROM public.mrp_pm_plan_tasks WHERE tenant_id=v_tenant AND pm_plan_id=p_pm_plan_id ORDER BY sequence_no;
  END IF;
  IF v_asset.work_center_id IS NOT NULL AND p_scheduled_start_at IS NOT NULL THEN
    INSERT INTO public.work_center_shift_capacity(tenant_id,work_center_id,work_date,available_minutes,status)
    VALUES(v_tenant,v_asset.work_center_id,p_scheduled_start_at::DATE,0,'maintenance');
  END IF;
  UPDATE public.mrp_maintenance_assets SET status=CASE WHEN p_maintenance_type IN ('breakdown','reactive') THEN 'down' ELSE status END,updated_at=NOW() WHERE id=p_maintenance_asset_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_maintenance_work_order(UUID,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID,TEXT,UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_pm_work_orders(p_until_date DATE DEFAULT CURRENT_DATE + 30)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_plan RECORD; v_count INT:=0; v_wo UUID; v_next DATE;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  FOR v_plan IN SELECT * FROM public.mrp_pm_plans WHERE tenant_id=v_tenant AND status='active' AND next_due_date IS NOT NULL AND next_due_date<=p_until_date LOOP
    v_wo := public.create_mrp_maintenance_work_order(v_plan.maintenance_asset_id,CASE WHEN v_plan.maintenance_type='condition_based' THEN 'condition_based' WHEN v_plan.maintenance_type='predictive' THEN 'predictive' ELSE 'preventive' END,'medium','PM: '||v_plan.plan_name,'أمر صيانة مولد من خطة PM',v_plan.next_due_date::TIMESTAMPTZ,(v_plan.next_due_date::TIMESTAMPTZ + (v_plan.estimated_minutes||' minutes')::INTERVAL),NULL,'pm_plan',v_plan.id,v_plan.id);
    v_next := CASE v_plan.frequency_type WHEN 'daily' THEN v_plan.next_due_date + v_plan.interval_value WHEN 'weekly' THEN v_plan.next_due_date + (v_plan.interval_value*7) WHEN 'monthly' THEN (v_plan.next_due_date + (v_plan.interval_value||' months')::INTERVAL)::DATE WHEN 'quarterly' THEN (v_plan.next_due_date + ((v_plan.interval_value*3)||' months')::INTERVAL)::DATE WHEN 'yearly' THEN (v_plan.next_due_date + (v_plan.interval_value||' years')::INTERVAL)::DATE ELSE v_plan.next_due_date END;
    UPDATE public.mrp_pm_plans SET last_generated_at=NOW(),next_due_date=v_next WHERE id=v_plan.id AND tenant_id=v_tenant;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_pm_work_orders(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_mrp_maintenance_work_order(p_maintenance_wo_id UUID,p_assigned_to UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_maintenance_work_orders SET assigned_to=p_assigned_to,status='assigned',updated_at=NOW() WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant AND status IN ('new','assigned','on_hold');
  IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_ASSIGNABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.assign_mrp_maintenance_work_order(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_mrp_maintenance_work_order(p_maintenance_wo_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_asset UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT maintenance_asset_id INTO v_asset FROM public.mrp_maintenance_work_orders WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant;
  UPDATE public.mrp_maintenance_work_orders SET status='in_progress',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant AND status IN ('new','assigned','on_hold');
  IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_STARTABLE'; END IF;
  UPDATE public.mrp_maintenance_assets SET status='maintenance',updated_at=NOW() WHERE id=v_asset AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.start_mrp_maintenance_work_order(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_mrp_maintenance_work_order(p_maintenance_wo_id UUID,p_actual_minutes NUMERIC DEFAULT NULL,p_labor_cost NUMERIC DEFAULT 0,p_other_cost NUMERIC DEFAULT 0,p_completion_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_parts NUMERIC; v_start TIMESTAMPTZ;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT COALESCE(SUM(issued_qty*COALESCE(unit_cost,0)),0) INTO v_parts FROM public.mrp_maintenance_work_order_parts WHERE tenant_id=v_tenant AND maintenance_wo_id=p_maintenance_wo_id;
  SELECT started_at INTO v_start FROM public.mrp_maintenance_work_orders WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant;
  UPDATE public.mrp_maintenance_work_orders SET status='completed',completed_at=NOW(),actual_minutes=COALESCE(p_actual_minutes,ROUND((EXTRACT(EPOCH FROM (NOW()-COALESCE(v_start,NOW())))/60)::NUMERIC,2)),downtime_minutes=COALESCE(p_actual_minutes,ROUND((EXTRACT(EPOCH FROM (NOW()-COALESCE(v_start,NOW())))/60)::NUMERIC,2)),labor_cost=COALESCE(p_labor_cost,0),parts_cost=v_parts,other_cost=COALESCE(p_other_cost,0),total_cost=COALESCE(p_labor_cost,0)+v_parts+COALESCE(p_other_cost,0),description=COALESCE(description,'')||CASE WHEN p_completion_notes IS NULL THEN '' ELSE E'\nCompletion: '||p_completion_notes END,updated_at=NOW() WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant AND status IN ('in_progress','assigned','new');
  IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_COMPLETABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_mrp_maintenance_work_order(UUID,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_maintenance_work_order(p_maintenance_wo_id UUID,p_close_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_asset UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT maintenance_asset_id INTO v_asset FROM public.mrp_maintenance_work_orders WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant;
  UPDATE public.mrp_maintenance_work_orders SET status='closed',closed_by=auth.uid(),closed_at=NOW(),close_reason=p_close_reason,updated_at=NOW() WHERE id=p_maintenance_wo_id AND tenant_id=v_tenant AND status='completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_WO_NOT_CLOSABLE'; END IF;
  UPDATE public.mrp_maintenance_assets SET status='active',updated_at=NOW() WHERE id=v_asset AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_maintenance_work_order(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_maintenance_spare_part(p_spare_part_code TEXT,p_name_ar TEXT,p_item_id UUID DEFAULT NULL,p_maintenance_asset_id UUID DEFAULT NULL,p_spare_part_type TEXT DEFAULT 'consumable',p_current_stock_qty NUMERIC DEFAULT 0,p_reorder_point NUMERIC DEFAULT 0,p_min_qty NUMERIC DEFAULT 0,p_max_qty NUMERIC DEFAULT 0,p_lead_time_days INT DEFAULT 0,p_unit_cost NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('maintenance_spare',p_spare_part_code);
  INSERT INTO public.mrp_maintenance_spare_parts(tenant_id,spare_part_code,item_id,maintenance_asset_id,spare_part_type,name_ar,current_stock_qty,reorder_point,min_qty,max_qty,lead_time_days,unit_cost)
  VALUES(v_tenant,v_code,p_item_id,p_maintenance_asset_id,COALESCE(p_spare_part_type,'consumable'),p_name_ar,COALESCE(p_current_stock_qty,0),COALESCE(p_reorder_point,0),COALESCE(p_min_qty,0),COALESCE(p_max_qty,0),COALESCE(p_lead_time_days,0),COALESCE(p_unit_cost,0))
  ON CONFLICT (tenant_id,spare_part_code) DO UPDATE SET item_id=EXCLUDED.item_id,maintenance_asset_id=EXCLUDED.maintenance_asset_id,spare_part_type=EXCLUDED.spare_part_type,name_ar=EXCLUDED.name_ar,current_stock_qty=EXCLUDED.current_stock_qty,reorder_point=EXCLUDED.reorder_point,min_qty=EXCLUDED.min_qty,max_qty=EXCLUDED.max_qty,lead_time_days=EXCLUDED.lead_time_days,unit_cost=EXCLUDED.unit_cost
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_maintenance_spare_part(TEXT,TEXT,UUID,UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,INT,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mrp_maintenance_work_order_part(p_maintenance_wo_id UUID,p_spare_part_id UUID,p_required_qty NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_part RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT * INTO v_part FROM public.mrp_maintenance_spare_parts WHERE id=p_spare_part_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SPARE_PART_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_maintenance_work_order_parts(tenant_id,maintenance_wo_id,spare_part_id,item_id,required_qty,unit_cost,status)
  VALUES(v_tenant,p_maintenance_wo_id,p_spare_part_id,v_part.item_id,COALESCE(p_required_qty,0),v_part.unit_cost,CASE WHEN v_part.current_stock_qty>=COALESCE(p_required_qty,0) THEN 'required' ELSE 'short' END) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_maintenance_work_order_part(UUID,UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_mrp_maintenance_spare_part(p_work_order_part_id UUID,p_issued_qty NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_spare UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT spare_part_id INTO v_spare FROM public.mrp_maintenance_work_order_parts WHERE id=p_work_order_part_id AND tenant_id=v_tenant;
  IF v_spare IS NULL THEN RAISE EXCEPTION 'WORK_ORDER_PART_NOT_FOUND'; END IF;
  UPDATE public.mrp_maintenance_spare_parts SET current_stock_qty=GREATEST(current_stock_qty-COALESCE(p_issued_qty,0),0) WHERE id=v_spare AND tenant_id=v_tenant;
  UPDATE public.mrp_maintenance_work_order_parts SET issued_qty=issued_qty+COALESCE(p_issued_qty,0),status='issued' WHERE id=p_work_order_part_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.issue_mrp_maintenance_spare_part(UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_spare_part_reorder_recommendations()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_part RECORD; v_count INT:=0; v_qty NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  FOR v_part IN SELECT * FROM public.mrp_maintenance_spare_parts WHERE tenant_id=v_tenant AND status='active' AND item_id IS NOT NULL AND current_stock_qty<=reorder_point LOOP
    v_qty := GREATEST(v_part.max_qty-v_part.current_stock_qty,v_part.min_qty-v_part.current_stock_qty,1);
    PERFORM public.create_mrp_procurement_recommendation(v_part.item_id,v_qty,(CURRENT_DATE+COALESCE(v_part.lead_time_days,0))::DATE,'urgent','maintenance_spare',v_part.id,NULL,v_part.unit_cost,'Reorder spare part: '||v_part.spare_part_code);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_spare_part_reorder_recommendations() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_condition_reading(p_maintenance_asset_id UUID,p_reading_type TEXT,p_reading_value NUMERIC,p_unit TEXT,p_warning_threshold NUMERIC DEFAULT NULL,p_critical_threshold NUMERIC DEFAULT NULL,p_generate_work_order BOOLEAN DEFAULT true)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_status TEXT; v_alert UUID; v_wo UUID; v_title TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_status := CASE WHEN p_critical_threshold IS NOT NULL AND p_reading_value>=p_critical_threshold THEN 'critical' WHEN p_warning_threshold IS NOT NULL AND p_reading_value>=p_warning_threshold THEN 'warning' ELSE 'normal' END;
  INSERT INTO public.mrp_condition_monitoring_readings(tenant_id,maintenance_asset_id,reading_type,reading_value,unit,warning_threshold,critical_threshold,status,recorded_by)
  VALUES(v_tenant,p_maintenance_asset_id,p_reading_type,p_reading_value,p_unit,p_warning_threshold,p_critical_threshold,v_status,auth.uid()) RETURNING id INTO v_id;
  IF v_status IN ('warning','critical') THEN
    v_title := 'Condition alert: '||p_reading_type||'='||p_reading_value||' '||p_unit;
    IF p_generate_work_order AND v_status='critical' THEN
      v_wo := public.create_mrp_maintenance_work_order(p_maintenance_asset_id,'condition_based','critical',v_title,'تجاوز حد حرج من قراءة حالة الأصل',NOW(),NOW()+INTERVAL '2 hours',NULL,'condition_alert',v_id,NULL);
    END IF;
    INSERT INTO public.mrp_condition_alerts(tenant_id,alert_number,reading_id,maintenance_asset_id,alert_type,severity,title,body,maintenance_wo_id,status)
    VALUES(v_tenant,public.generate_mrp_next_code('condition_alert',NULL),v_id,p_maintenance_asset_id,CASE WHEN v_status='critical' THEN 'critical_threshold' ELSE 'warning_threshold' END,CASE WHEN v_status='critical' THEN 'critical' ELSE 'warning' END,v_title,'قراءة حالة خارج الحدود',v_wo,CASE WHEN v_wo IS NULL THEN 'open' ELSE 'converted_to_wo' END) RETURNING id INTO v_alert;
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_condition_reading(UUID,TEXT,NUMERIC,TEXT,NUMERIC,NUMERIC,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_shopfloor_request_to_maintenance_wo(p_shopfloor_request_id UUID,p_assigned_to UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_req RECORD; v_asset UUID; v_wo UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT * INTO v_req FROM public.mrp_shopfloor_maintenance_requests WHERE id=p_shopfloor_request_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOPFLOOR_MAINTENANCE_REQUEST_NOT_FOUND'; END IF;
  SELECT id INTO v_asset FROM public.mrp_maintenance_assets WHERE tenant_id=v_tenant AND manufacturing_asset_id=v_req.asset_id LIMIT 1;
  v_wo := public.create_mrp_maintenance_work_order(v_asset,'breakdown',CASE WHEN v_req.severity='critical' THEN 'critical' ELSE 'urgent' END,'Breakdown from shop floor: '||v_req.request_number,v_req.problem_description,NOW(),NOW()+INTERVAL '4 hours',p_assigned_to,'shopfloor_breakdown',p_shopfloor_request_id,NULL);
  UPDATE public.mrp_maintenance_work_orders SET manufacturing_work_order_id=v_req.work_order_id, work_center_id=COALESCE(work_center_id,v_req.work_center_id) WHERE id=v_wo AND tenant_id=v_tenant;
  UPDATE public.mrp_shopfloor_maintenance_requests SET status='converted_to_cmms',future_cmms_work_order_id=v_wo WHERE id=p_shopfloor_request_id AND tenant_id=v_tenant;
  RETURN v_wo;
END $$;
GRANT EXECUTE ON FUNCTION public.convert_shopfloor_request_to_maintenance_wo(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_annual_shutdown_plan(p_title TEXT,p_start_date DATE,p_end_date DATE,p_plant_id UUID DEFAULT NULL,p_line_id UUID DEFAULT NULL,p_production_buffer_plan TEXT DEFAULT NULL,p_external_vendor_plan TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_annual_shutdown_plans(tenant_id,shutdown_number,plant_id,line_id,title,start_date,end_date,production_buffer_plan,external_vendor_plan,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('annual_shutdown',NULL),p_plant_id,p_line_id,p_title,p_start_date,p_end_date,p_production_buffer_plan,p_external_vendor_plan,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_annual_shutdown_plan(TEXT,DATE,DATE,UUID,UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mrp_shutdown_task(p_shutdown_plan_id UUID,p_sequence_no INT,p_task_text TEXT,p_maintenance_asset_id UUID DEFAULT NULL,p_required_spares TEXT DEFAULT NULL,p_assigned_to UUID DEFAULT NULL,p_planned_date DATE DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_annual_shutdown_tasks(tenant_id,shutdown_plan_id,sequence_no,maintenance_asset_id,task_text,required_spares,assigned_to,planned_date)
  VALUES(v_tenant,p_shutdown_plan_id,p_sequence_no,p_maintenance_asset_id,p_task_text,p_required_spares,p_assigned_to,p_planned_date) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_shutdown_task(UUID,INT,TEXT,UUID,TEXT,UUID,DATE) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_maintenance_assets','mrp_maintenance_asset_documents','mrp_asset_criticality_assessments','mrp_pm_plans','mrp_pm_plan_tasks','mrp_maintenance_work_orders','mrp_maintenance_work_order_tasks','mrp_maintenance_spare_parts','mrp_maintenance_work_order_parts','mrp_condition_monitoring_readings','mrp_condition_alerts','mrp_annual_shutdown_plans','mrp_annual_shutdown_tasks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''inventory'',''procurement'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_maintenance_asset_registry WITH (security_invoker=true) AS
SELECT a.*, wc.work_center_code,wc.name_ar AS work_center_name, pl.line_code, pl.name_ar AS line_name,
  (SELECT COUNT(*) FROM public.mrp_maintenance_asset_documents d WHERE d.tenant_id=a.tenant_id AND d.maintenance_asset_id=a.id) AS document_count,
  (SELECT MAX(assessed_at) FROM public.mrp_asset_criticality_assessments c WHERE c.tenant_id=a.tenant_id AND c.maintenance_asset_id=a.id) AS last_criticality_assessment
FROM public.mrp_maintenance_assets a
LEFT JOIN public.work_centers wc ON wc.id=a.work_center_id AND wc.tenant_id=a.tenant_id
LEFT JOIN public.production_lines pl ON pl.id=a.line_id AND pl.tenant_id=a.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_maintenance_asset_registry TO authenticated;

CREATE OR REPLACE VIEW public.mrp_pm_calendar WITH (security_invoker=true) AS
SELECT p.*, a.asset_number,a.name_ar AS asset_name,a.criticality_class,wc.work_center_code
FROM public.mrp_pm_plans p
JOIN public.mrp_maintenance_assets a ON a.id=p.maintenance_asset_id AND a.tenant_id=p.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=a.work_center_id AND wc.tenant_id=a.tenant_id
WHERE p.tenant_id=public.current_user_tenant_id() AND p.status='active'
ORDER BY p.next_due_date NULLS LAST;
GRANT SELECT ON public.mrp_pm_calendar TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_work_order_board WITH (security_invoker=true) AS
SELECT wo.*, a.asset_number,a.name_ar AS asset_name,a.criticality_class,wc.work_center_code,
  (SELECT COUNT(*) FROM public.mrp_maintenance_work_order_tasks t WHERE t.tenant_id=wo.tenant_id AND t.maintenance_wo_id=wo.id AND t.completed) AS completed_tasks,
  (SELECT COUNT(*) FROM public.mrp_maintenance_work_order_tasks t WHERE t.tenant_id=wo.tenant_id AND t.maintenance_wo_id=wo.id) AS total_tasks
FROM public.mrp_maintenance_work_orders wo
LEFT JOIN public.mrp_maintenance_assets a ON a.id=wo.maintenance_asset_id AND a.tenant_id=wo.tenant_id
LEFT JOIN public.work_centers wc ON wc.id=wo.work_center_id AND wc.tenant_id=wo.tenant_id
WHERE wo.tenant_id=public.current_user_tenant_id()
ORDER BY CASE wo.priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'high' THEN 3 WHEN 'medium' THEN 4 ELSE 5 END, wo.created_at DESC;
GRANT SELECT ON public.mrp_maintenance_work_order_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_spare_parts_status WITH (security_invoker=true) AS
SELECT sp.*, i.item_code,i.name_ar AS item_name,a.asset_number,
  CASE WHEN sp.current_stock_qty<=sp.reorder_point THEN 'reorder' WHEN sp.current_stock_qty<sp.min_qty THEN 'below_min' ELSE 'ok' END AS stock_status,
  GREATEST(sp.max_qty-sp.current_stock_qty,0) AS suggested_reorder_qty
FROM public.mrp_maintenance_spare_parts sp
LEFT JOIN public.inventory_items i ON i.id=sp.item_id AND i.tenant_id=sp.tenant_id
LEFT JOIN public.mrp_maintenance_assets a ON a.id=sp.maintenance_asset_id AND a.tenant_id=sp.tenant_id
WHERE sp.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_maintenance_spare_parts_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_condition_monitoring_board WITH (security_invoker=true) AS
SELECT r.*, a.asset_number,a.name_ar AS asset_name,a.criticality_class
FROM public.mrp_condition_monitoring_readings r
JOIN public.mrp_maintenance_assets a ON a.id=r.maintenance_asset_id AND a.tenant_id=r.tenant_id
WHERE r.tenant_id=public.current_user_tenant_id()
ORDER BY r.measured_at DESC;
GRANT SELECT ON public.mrp_condition_monitoring_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_condition_alert_queue WITH (security_invoker=true) AS
SELECT al.*, a.asset_number,a.name_ar AS asset_name
FROM public.mrp_condition_alerts al
LEFT JOIN public.mrp_maintenance_assets a ON a.id=al.maintenance_asset_id AND a.tenant_id=al.tenant_id
WHERE al.tenant_id=public.current_user_tenant_id()
ORDER BY CASE al.severity WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, al.created_at DESC;
GRANT SELECT ON public.mrp_condition_alert_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_annual_shutdown_schedule WITH (security_invoker=true) AS
SELECT s.*, pl.line_code, pl.name_ar AS line_name,
  (SELECT COUNT(*) FROM public.mrp_annual_shutdown_tasks t WHERE t.tenant_id=s.tenant_id AND t.shutdown_plan_id=s.id) AS task_count,
  (SELECT COUNT(*) FROM public.mrp_annual_shutdown_tasks t WHERE t.tenant_id=s.tenant_id AND t.shutdown_plan_id=s.id AND t.status='completed') AS completed_tasks
FROM public.mrp_annual_shutdown_plans s
LEFT JOIN public.production_lines pl ON pl.id=s.line_id AND pl.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
ORDER BY s.start_date;
GRANT SELECT ON public.mrp_annual_shutdown_schedule TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_mtbf_mttr WITH (security_invoker=true) AS
SELECT a.tenant_id,a.id AS maintenance_asset_id,a.asset_number,a.name_ar AS asset_name,
  COUNT(wo.id) FILTER (WHERE wo.maintenance_type IN ('breakdown','reactive')) AS failure_count,
  ROUND(AVG(NULLIF(wo.downtime_minutes,0)),2) AS mttr_minutes,
  ROUND((EXTRACT(EPOCH FROM (NOW()-MIN(wo.created_at)))/3600)/NULLIF(COUNT(wo.id) FILTER (WHERE wo.maintenance_type IN ('breakdown','reactive')),0),2) AS mtbf_hours_proxy
FROM public.mrp_maintenance_assets a
LEFT JOIN public.mrp_maintenance_work_orders wo ON wo.maintenance_asset_id=a.id AND wo.tenant_id=a.tenant_id AND wo.status IN ('completed','closed')
WHERE a.tenant_id=public.current_user_tenant_id()
GROUP BY a.tenant_id,a.id,a.asset_number,a.name_ar;
GRANT SELECT ON public.mrp_maintenance_mtbf_mttr TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_kpis WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  ROUND((SELECT COUNT(*) FILTER (WHERE status IN ('completed','closed') AND scheduled_end_at IS NOT NULL AND completed_at<=scheduled_end_at)::NUMERIC/NULLIF(COUNT(*) FILTER (WHERE source_type='pm_plan'),0)*100 FROM public.mrp_maintenance_work_orders WHERE tenant_id=public.current_user_tenant_id() AND source_type='pm_plan'),2) AS pm_compliance_percent,
  ROUND((SELECT COUNT(*) FILTER (WHERE maintenance_type IN ('preventive','predictive','condition_based','inspection'))::NUMERIC/NULLIF(COUNT(*),0)*100 FROM public.mrp_maintenance_work_orders WHERE tenant_id=public.current_user_tenant_id()),2) AS proactive_maintenance_percent,
  ROUND((SELECT COUNT(*) FILTER (WHERE maintenance_type IN ('breakdown','reactive'))::NUMERIC/NULLIF(COUNT(*),0)*100 FROM public.mrp_maintenance_work_orders WHERE tenant_id=public.current_user_tenant_id()),2) AS reactive_maintenance_percent,
  (SELECT ROUND(AVG(downtime_minutes),2) FROM public.mrp_maintenance_work_orders WHERE tenant_id=public.current_user_tenant_id() AND maintenance_type IN ('breakdown','reactive') AND status IN ('completed','closed')) AS avg_mttr_minutes,
  (SELECT ROUND(SUM(total_cost),2) FROM public.mrp_maintenance_work_orders WHERE tenant_id=public.current_user_tenant_id()) AS total_maintenance_cost;
GRANT SELECT ON public.mrp_maintenance_kpis TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_cost_by_asset WITH (security_invoker=true) AS
SELECT a.tenant_id,a.id AS maintenance_asset_id,a.asset_number,a.name_ar AS asset_name,
  COUNT(wo.id) AS work_order_count,ROUND(SUM(COALESCE(wo.total_cost,0)),2) AS total_cost,ROUND(AVG(NULLIF(wo.total_cost,0)),2) AS avg_work_order_cost
FROM public.mrp_maintenance_assets a
LEFT JOIN public.mrp_maintenance_work_orders wo ON wo.maintenance_asset_id=a.id AND wo.tenant_id=a.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id()
GROUP BY a.tenant_id,a.id,a.asset_number,a.name_ar
ORDER BY total_cost DESC;
GRANT SELECT ON public.mrp_maintenance_cost_by_asset TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_maintenance_assets WHERE tenant_id=public.current_user_tenant_id() AND status IN ('down','maintenance')) AS assets_down_or_maintenance,
  (SELECT COUNT(*) FROM public.mrp_maintenance_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status IN ('new','assigned','in_progress','on_hold')) AS open_work_orders,
  (SELECT COUNT(*) FROM public.mrp_pm_plans WHERE tenant_id=public.current_user_tenant_id() AND status='active' AND next_due_date<=CURRENT_DATE+7) AS pm_due_7_days,
  (SELECT COUNT(*) FROM public.mrp_condition_alerts WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_condition_alerts,
  (SELECT COUNT(*) FROM public.mrp_maintenance_spare_parts WHERE tenant_id=public.current_user_tenant_id() AND current_stock_qty<=reorder_point) AS spare_parts_to_reorder;
GRANT SELECT ON public.mrp_maintenance_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_integration_health WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  to_regclass('public.mrp_shopfloor_maintenance_requests') IS NOT NULL AS shopfloor_bridge_available,
  to_regclass('public.work_center_shift_capacity') IS NOT NULL AS production_capacity_calendar_available,
  to_regclass('public.inventory_items') IS NOT NULL AS inventory_spares_available,
  to_regprocedure('public.create_mrp_procurement_recommendation(uuid,numeric,date,text,text,uuid,uuid,numeric,text)') IS NOT NULL AS procurement_recommendation_available,
  to_regclass('public.mrp_maintenance_work_orders') IS NOT NULL AS cmms_available;
GRANT SELECT ON public.mrp_maintenance_integration_health TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_maintenance_assets') IS NULL OR to_regclass('public.mrp_maintenance_work_orders') IS NULL OR to_regclass('public.mrp_pm_plans') IS NULL OR to_regclass('public.mrp_maintenance_spare_parts') IS NULL OR to_regprocedure('public.create_mrp_maintenance_work_order(uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid,text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '0226 failed: MRP maintenance CMMS objects missing';
  END IF;
  RAISE NOTICE '✅ 0226: MRP maintenance management CMMS applied';
END $$;
