-- ============================================================================
-- 0211 — Inventory Unit 07: Labor Management & Workforce Productivity
-- docs/inventory/07-labor-management-productivity.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_labor_standard_templates (
  code TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  task_subtype TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  standard_minutes NUMERIC(10,4) NOT NULL CHECK (standard_minutes > 0),
  standard_basis TEXT NOT NULL DEFAULT 'engineered' CHECK (standard_basis IN ('engineered','historical','hybrid')),
  required_skill_code TEXT,
  setup_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  travel_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  scan_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  execution_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  expected_error_rate_percent NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.inventory_labor_standard_templates(code,task_type,task_subtype,name_ar,standard_minutes,standard_basis,required_skill_code,travel_minutes,scan_minutes,execution_minutes)
VALUES
 ('receive_pallet_scan_weight','receiving','pallet_scan_weight','استلام بليت واحد — وزن + مسح',4,'engineered',NULL,0.75,0.75,2.5),
 ('putaway_pallet_forklift','putaway','pallet_rack_forklift','تخزين بليت في رف بالرافعة',6,'engineered','forklift',2,0.5,3.5),
 ('pick_low_shelf_each','picking','low_shelf_each','سحب صنف من رف منخفض',2.5,'engineered',NULL,0.75,0.25,1.5),
 ('pick_high_shelf_ladder','picking','high_shelf_ladder','سحب صنف من رف عالٍ بسلم',4.5,'engineered','ladder_pick',1.5,0.5,2.5),
 ('pack_small_parcel','packing','small_parcel','تعبئة طرد صغير',3,'historical',NULL,0.25,0.5,2.25),
 ('pack_large_parcel','packing','large_parcel','تعبئة طرد كبير',7,'historical',NULL,0.5,0.75,5.75),
 ('count_location','counting','single_location','جرد موقع واحد',3,'engineered',NULL,0.5,0.5,2),
 ('forklift_transfer_30m','transfer','pallet_30m','نقل بليت بالرافعة لمسافة 30 متر',5,'engineered','forklift',2.5,0.5,2)
ON CONFLICT (code) DO UPDATE SET
  task_type=EXCLUDED.task_type, task_subtype=EXCLUDED.task_subtype, name_ar=EXCLUDED.name_ar,
  standard_minutes=EXCLUDED.standard_minutes, standard_basis=EXCLUDED.standard_basis, required_skill_code=EXCLUDED.required_skill_code,
  travel_minutes=EXCLUDED.travel_minutes, scan_minutes=EXCLUDED.scan_minutes, execution_minutes=EXCLUDED.execution_minutes;
GRANT SELECT ON public.inventory_labor_standard_templates TO authenticated;

CREATE TABLE IF NOT EXISTS public.inventory_labor_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL,
  standard_code TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('receiving','putaway','picking','packing','shipping','counting','replenishment','transfer','returns','cycle_count','maintenance','indirect')),
  task_subtype TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  standard_minutes NUMERIC(10,4) NOT NULL CHECK (standard_minutes > 0),
  standard_basis TEXT NOT NULL DEFAULT 'engineered' CHECK (standard_basis IN ('engineered','historical','hybrid')),
  setup_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  travel_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  scan_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  execution_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  historical_sample_size INT NOT NULL DEFAULT 0,
  required_skill_code TEXT,
  expected_error_rate_percent NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, zone_id, standard_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_skill_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  skill_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  skill_category TEXT NOT NULL DEFAULT 'warehouse' CHECK (skill_category IN ('warehouse','equipment','safety','packing','quality','systems','leadership','other')),
  requires_certification BOOLEAN NOT NULL DEFAULT false,
  renewal_days INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, skill_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_worker_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.inventory_labor_skill_catalog(id) ON DELETE CASCADE,
  skill_level TEXT NOT NULL DEFAULT 'certified' CHECK (skill_level IN ('certified','in_training','not_qualified','expired')),
  certified_at DATE,
  expires_at DATE,
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  evidence_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, worker_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES public.inventory_labor_skill_catalog(id) ON DELETE SET NULL,
  training_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','passed','failed','expired','cancelled')),
  started_at DATE,
  completed_at DATE,
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  score NUMERIC(8,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_worker_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  shift_code TEXT NOT NULL DEFAULT 'day',
  shift_start TIMESTAMPTZ NOT NULL,
  shift_end TIMESTAMPTZ NOT NULL,
  planned_minutes NUMERIC(10,2) NOT NULL DEFAULT 480,
  break_minutes NUMERIC(10,2) NOT NULL DEFAULT 30,
  efficiency_factor NUMERIC(8,4) NOT NULL DEFAULT 0.85 CHECK (efficiency_factor > 0 AND efficiency_factor <= 1.5),
  hourly_cost NUMERIC(16,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','on_break','offline','sick','leave','training')),
  current_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  current_zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL,
  available_from TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, worker_id, work_date, shift_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_workforce_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_number TEXT NOT NULL,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  plan_date DATE NOT NULL,
  horizon TEXT NOT NULL DEFAULT 'daily' CHECK (horizon IN ('daily','weekly','monthly')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated','approved','published','closed','cancelled')),
  expected_workload_minutes NUMERIC(14,2) NOT NULL DEFAULT 0,
  available_capacity_minutes NUMERIC(14,2) NOT NULL DEFAULT 0,
  effective_capacity_minutes NUMERIC(14,2) NOT NULL DEFAULT 0,
  required_workers NUMERIC(12,2) NOT NULL DEFAULT 0,
  available_workers INT NOT NULL DEFAULT 0,
  capacity_status TEXT NOT NULL DEFAULT 'unknown' CHECK (capacity_status IN ('shortage','balanced','surplus','unknown')),
  recommendation TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, plan_date, horizon, plan_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_workforce_plan_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.inventory_labor_workforce_plans(id) ON DELETE CASCADE,
  workload_area TEXT NOT NULL CHECK (workload_area IN ('receiving','putaway','picking','packing','shipping','counting','replenishment','returns','transfer','other')),
  source_table TEXT,
  source_count INT NOT NULL DEFAULT 0,
  workload_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  standard_minutes_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
  expected_minutes NUMERIC(14,2) NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_dispatch_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  source_task_type TEXT NOT NULL,
  source_task_id UUID,
  task_type TEXT NOT NULL CHECK (task_type IN ('receiving','putaway','picking','packing','shipping','counting','replenishment','transfer','returns','indirect')),
  task_subtype TEXT,
  priority INT NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  from_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  to_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  from_zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL,
  to_zone_id UUID REFERENCES public.inventory_zones(id) ON DELETE SET NULL,
  required_skill_code TEXT,
  standard_id UUID REFERENCES public.inventory_labor_standards(id) ON DELETE SET NULL,
  standard_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  expected_travel_meters NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','completed','blocked','cancelled')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignment_mode TEXT CHECK (assignment_mode IS NULL OR assignment_mode IN ('manual','dynamic','interleaved')),
  mobile_instruction TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_minutes NUMERIC(10,2),
  error_count INT NOT NULL DEFAULT 0,
  units_processed NUMERIC(14,4) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, task_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_task_interleaving_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anchor_task_id UUID REFERENCES public.inventory_labor_dispatch_tasks(id) ON DELETE CASCADE,
  suggested_task_id UUID REFERENCES public.inventory_labor_dispatch_tasks(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  estimated_dead_travel_saved_meters NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_minutes_saved NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','rejected','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, anchor_task_id, suggested_task_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  dispatch_task_id UUID REFERENCES public.inventory_labor_dispatch_tasks(id) ON DELETE SET NULL,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_category TEXT NOT NULL CHECK (time_category IN ('direct','indirect','personal','unexplained')),
  reason_code TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  actual_minutes NUMERIC(10,2),
  standard_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  units_processed NUMERIC(14,4) NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at IS NULL OR end_at >= start_at)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_non_productive_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('waiting','dead_travel','searching','rework','equipment_wait','meeting','maintenance','break','other')),
  recommended_action TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, reason_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_incentive_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed','cancelled')),
  target_productivity_min NUMERIC(8,4) NOT NULL DEFAULT 85,
  max_error_rate_percent NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  tier_good_percent NUMERIC(8,4) NOT NULL DEFAULT 95,
  tier_excellent_percent NUMERIC(8,4) NOT NULL DEFAULT 105,
  tier_exceptional_percent NUMERIC(8,4) NOT NULL DEFAULT 115,
  good_bonus_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  excellent_bonus_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  exceptional_bonus_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'SAR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_incentive_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.inventory_labor_incentive_programs(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  productivity_percent NUMERIC(10,4) NOT NULL DEFAULT 0,
  error_rate_percent NUMERIC(10,4) NOT NULL DEFAULT 0,
  incentive_tier TEXT NOT NULL CHECK (incentive_tier IN ('standard','good','excellent','exceptional','disqualified')),
  award_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated','approved','paid','rejected')),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, program_id, worker_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_shift_leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  shift_code TEXT NOT NULL DEFAULT 'day',
  team_average_productivity NUMERIC(10,4) NOT NULL DEFAULT 0,
  shift_target_percent NUMERIC(10,4) NOT NULL DEFAULT 90,
  total_errors INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','published','closed')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, warehouse_id, work_date, shift_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_shift_leaderboard_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  leaderboard_id UUID NOT NULL REFERENCES public.inventory_labor_shift_leaderboards(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank_no INT NOT NULL,
  medal TEXT CHECK (medal IS NULL OR medal IN ('gold','silver','bronze')),
  completed_tasks INT NOT NULL DEFAULT 0,
  productivity_percent NUMERIC(10,4) NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, leaderboard_id, worker_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_productivity_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily','weekly','monthly')),
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, report_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  incident_date DATE NOT NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('first_aid','recordable','lost_time','near_miss','property_damage')),
  recordable BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  corrective_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','closed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_labor_turnover_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('hire','termination','transfer_in','transfer_out')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_labor_standards_task ON public.inventory_labor_standards(tenant_id,task_type,task_subtype,is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_worker_availability_date ON public.inventory_worker_availability(tenant_id,warehouse_id,work_date,status);
CREATE INDEX IF NOT EXISTS idx_inventory_labor_dispatch_status ON public.inventory_labor_dispatch_tasks(tenant_id,warehouse_id,status,priority,due_at);
CREATE INDEX IF NOT EXISTS idx_inventory_labor_time_worker_date ON public.inventory_labor_time_logs(tenant_id,worker_id,work_date,time_category);
CREATE INDEX IF NOT EXISTS idx_inventory_worker_skills_worker ON public.inventory_worker_skills(tenant_id,worker_id,skill_id,skill_level);

CREATE OR REPLACE FUNCTION public.seed_inventory_labor_standards_from_templates(p_warehouse_id UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v_tpl RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  FOR v_tpl IN SELECT * FROM public.inventory_labor_standard_templates LOOP
    INSERT INTO public.inventory_labor_standards(tenant_id,warehouse_id,standard_code,task_type,task_subtype,name_ar,standard_minutes,standard_basis,required_skill_code,setup_minutes,travel_minutes,scan_minutes,execution_minutes,created_by,updated_by)
    VALUES(v_tenant,p_warehouse_id,v_tpl.code,v_tpl.task_type,v_tpl.task_subtype,v_tpl.name_ar,v_tpl.standard_minutes,v_tpl.standard_basis,v_tpl.required_skill_code,v_tpl.setup_minutes,v_tpl.travel_minutes,v_tpl.scan_minutes,v_tpl.execution_minutes,auth.uid(),auth.uid())
    ON CONFLICT (tenant_id, warehouse_id, zone_id, standard_code) DO UPDATE SET standard_minutes=EXCLUDED.standard_minutes, standard_basis=EXCLUDED.standard_basis, required_skill_code=EXCLUDED.required_skill_code, updated_by=auth.uid(), updated_at=NOW();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_inventory_labor_standards_from_templates(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_inventory_labor_standard(p_warehouse_id UUID, p_standard_code TEXT, p_task_type TEXT, p_task_subtype TEXT, p_name_ar TEXT, p_standard_minutes NUMERIC, p_standard_basis TEXT DEFAULT 'engineered', p_required_skill_code TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  IF p_standard_minutes IS NULL OR p_standard_minutes <= 0 THEN RAISE EXCEPTION 'STANDARD_MINUTES_REQUIRED'; END IF;
  INSERT INTO public.inventory_labor_standards(tenant_id,warehouse_id,standard_code,task_type,task_subtype,name_ar,standard_minutes,standard_basis,required_skill_code,created_by,updated_by)
  VALUES(v_tenant,p_warehouse_id,p_standard_code,p_task_type,p_task_subtype,p_name_ar,p_standard_minutes,COALESCE(p_standard_basis,'engineered'),p_required_skill_code,auth.uid(),auth.uid())
  ON CONFLICT (tenant_id, warehouse_id, zone_id, standard_code) DO UPDATE SET name_ar=EXCLUDED.name_ar, standard_minutes=EXCLUDED.standard_minutes, standard_basis=EXCLUDED.standard_basis, required_skill_code=EXCLUDED.required_skill_code, updated_by=auth.uid(), updated_at=NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_inventory_labor_standard(UUID,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_worker_availability(p_worker_id UUID, p_warehouse_id UUID, p_work_date DATE, p_shift_code TEXT, p_shift_start TIMESTAMPTZ, p_shift_end TIMESTAMPTZ, p_efficiency_factor NUMERIC DEFAULT 0.85, p_hourly_cost NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_minutes NUMERIC;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  IF p_shift_end <= p_shift_start THEN RAISE EXCEPTION 'INVALID_SHIFT_WINDOW'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_worker_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WORKER_NOT_FOUND'; END IF;
  v_minutes := EXTRACT(EPOCH FROM (p_shift_end-p_shift_start))/60;
  INSERT INTO public.inventory_worker_availability(tenant_id,worker_id,warehouse_id,work_date,shift_code,shift_start,shift_end,planned_minutes,efficiency_factor,hourly_cost,available_from)
  VALUES(v_tenant,p_worker_id,p_warehouse_id,p_work_date,COALESCE(p_shift_code,'day'),p_shift_start,p_shift_end,v_minutes,COALESCE(p_efficiency_factor,0.85),COALESCE(p_hourly_cost,0),p_shift_start)
  ON CONFLICT (tenant_id, worker_id, work_date, shift_code) DO UPDATE SET warehouse_id=EXCLUDED.warehouse_id, shift_start=EXCLUDED.shift_start, shift_end=EXCLUDED.shift_end, planned_minutes=EXCLUDED.planned_minutes, efficiency_factor=EXCLUDED.efficiency_factor, hourly_cost=EXCLUDED.hourly_cost, status='available'
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_inventory_worker_availability(UUID,UUID,DATE,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_inventory_worker_skill(p_worker_id UUID, p_skill_code TEXT, p_name_ar TEXT, p_skill_level TEXT DEFAULT 'certified', p_expires_at DATE DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_skill UUID; v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  INSERT INTO public.inventory_labor_skill_catalog(tenant_id,skill_code,name_ar,requires_certification)
  VALUES(v_tenant,p_skill_code,p_name_ar,true)
  ON CONFLICT (tenant_id,skill_code) DO UPDATE SET name_ar=EXCLUDED.name_ar
  RETURNING id INTO v_skill;
  INSERT INTO public.inventory_worker_skills(tenant_id,worker_id,skill_id,skill_level,certified_at,expires_at,trainer_id)
  VALUES(v_tenant,p_worker_id,v_skill,COALESCE(p_skill_level,'certified'),CURRENT_DATE,p_expires_at,auth.uid())
  ON CONFLICT (tenant_id,worker_id,skill_id) DO UPDATE SET skill_level=EXCLUDED.skill_level, certified_at=EXCLUDED.certified_at, expires_at=EXCLUDED.expires_at, trainer_id=auth.uid()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_inventory_worker_skill(UUID,TEXT,TEXT,TEXT,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_inventory_labor_skill_catalog()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  INSERT INTO public.inventory_labor_skill_catalog(tenant_id,skill_code,name_ar,skill_category,requires_certification,renewal_days)
  VALUES
    (v_tenant,'forklift','تشغيل رافعة شوكية','equipment',true,365),
    (v_tenant,'wms','استخدام نظام WMS','systems',false,NULL),
    (v_tenant,'packing_shipping','التعبئة والشحن','packing',false,NULL),
    (v_tenant,'manual_picking','السحب اليدوي','warehouse',false,NULL),
    (v_tenant,'special_packing','التعبئة الخاصة','packing',true,365),
    (v_tenant,'pallet_jack','تشغيل رافعة العتلة','equipment',true,365),
    (v_tenant,'ladder_pick','السحب من الرفوف العالية بسلم','safety',true,365)
  ON CONFLICT (tenant_id,skill_code) DO UPDATE SET name_ar=EXCLUDED.name_ar, skill_category=EXCLUDED.skill_category, requires_certification=EXCLUDED.requires_certification, renewal_days=EXCLUDED.renewal_days;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_inventory_labor_skill_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_inventory_labor_non_productive_reasons()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  INSERT INTO public.inventory_labor_non_productive_reasons(tenant_id,reason_code,name_ar,category,recommended_action)
  VALUES
    (v_tenant,'waiting_time','الانتظار — لا توجد مهمة جاهزة','waiting','Task Interleaving وتحضير قوائم أطول'),
    (v_tenant,'dead_travel','التنقل الفارغ بين المهام','dead_travel','تحسين Slotting وذكاء التوزيع'),
    (v_tenant,'searching','البحث عن مخزون أو موقع','searching','تحسين دقة المخزون وتتبع المواقع'),
    (v_tenant,'rework','إعادة العمل بسبب خطأ','rework','تدريب إضافي وتفعيل Scan-to-Confirm'),
    (v_tenant,'equipment_wait','انتظار المعدات','equipment_wait','جدولة أفضل للمعدات والرافعات')
  ON CONFLICT (tenant_id,reason_code) DO UPDATE SET name_ar=EXCLUDED.name_ar, category=EXCLUDED.category, recommended_action=EXCLUDED.recommended_action;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_inventory_labor_non_productive_reasons() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_labor_dispatch_task(p_warehouse_id UUID, p_source_task_type TEXT, p_source_task_id UUID, p_task_type TEXT, p_task_subtype TEXT, p_priority INT DEFAULT 50, p_from_location_id UUID DEFAULT NULL, p_to_location_id UUID DEFAULT NULL, p_required_skill_code TEXT DEFAULT NULL, p_due_at TIMESTAMPTZ DEFAULT NULL, p_units NUMERIC DEFAULT 1)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_std RECORD; v_from_zone UUID; v_to_zone UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT zone_id INTO v_from_zone FROM public.inventory_locations WHERE id=p_from_location_id AND tenant_id=v_tenant;
  SELECT zone_id INTO v_to_zone FROM public.inventory_locations WHERE id=p_to_location_id AND tenant_id=v_tenant;
  SELECT * INTO v_std FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type=p_task_type AND (task_subtype=p_task_subtype OR p_task_subtype IS NULL) AND (warehouse_id=p_warehouse_id OR warehouse_id IS NULL) AND is_active ORDER BY warehouse_id NULLS LAST LIMIT 1;
  INSERT INTO public.inventory_labor_dispatch_tasks(tenant_id,task_number,warehouse_id,source_task_type,source_task_id,task_type,task_subtype,priority,from_location_id,to_location_id,from_zone_id,to_zone_id,required_skill_code,standard_id,standard_minutes,expected_travel_meters,due_at,units_processed,mobile_instruction)
  VALUES(v_tenant,public.inventory_next_number('LDT'),p_warehouse_id,p_source_task_type,p_source_task_id,p_task_type,p_task_subtype,COALESCE(p_priority,50),p_from_location_id,p_to_location_id,v_from_zone,v_to_zone,COALESCE(p_required_skill_code,v_std.required_skill_code),v_std.id,COALESCE(v_std.standard_minutes,0)*COALESCE(p_units,1),COALESCE(v_std.travel_minutes,0)*60,p_due_at,COALESCE(p_units,1),'مهمتك التالية: '||COALESCE(p_task_type,'task')||COALESCE(' / '||p_task_subtype,'')) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_labor_dispatch_task(UUID,TEXT,UUID,TEXT,TEXT,INT,UUID,UUID,TEXT,TIMESTAMPTZ,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_inventory_labor_task(p_task_id UUID DEFAULT NULL, p_worker_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_worker UUID; v_today DATE:=CURRENT_DATE;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_labor_dispatch_tasks WHERE tenant_id=v_tenant AND status='open' AND (p_task_id IS NULL OR id=p_task_id) ORDER BY priority DESC, due_at NULLS LAST, created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_OPEN_LABOR_TASK'; END IF;
  IF p_worker_id IS NOT NULL THEN
    v_worker := p_worker_id;
  ELSE
    SELECT a.worker_id INTO v_worker
    FROM public.inventory_worker_availability a
    WHERE a.tenant_id=v_tenant AND a.work_date=v_today AND a.status IN ('available','assigned') AND (a.warehouse_id IS NULL OR a.warehouse_id=v_task.warehouse_id)
      AND (v_task.required_skill_code IS NULL OR EXISTS (
        SELECT 1 FROM public.inventory_worker_skills ws JOIN public.inventory_labor_skill_catalog sc ON sc.id=ws.skill_id AND sc.tenant_id=ws.tenant_id
        WHERE ws.tenant_id=v_tenant AND ws.worker_id=a.worker_id AND sc.skill_code=v_task.required_skill_code AND ws.skill_level='certified' AND (ws.expires_at IS NULL OR ws.expires_at>=CURRENT_DATE)
      ))
    ORDER BY CASE WHEN a.current_zone_id IS NOT NULL AND a.current_zone_id IN (v_task.from_zone_id,v_task.to_zone_id) THEN 0 ELSE 1 END,
      (SELECT COUNT(*) FROM public.inventory_labor_dispatch_tasks d WHERE d.tenant_id=v_tenant AND d.assigned_to=a.worker_id AND d.status IN ('assigned','in_progress')) ASC,
      a.available_from NULLS FIRST
    LIMIT 1;
  END IF;
  IF v_worker IS NULL THEN RAISE EXCEPTION 'NO_ELIGIBLE_WORKER_FOR_TASK'; END IF;
  UPDATE public.inventory_labor_dispatch_tasks SET status='assigned', assigned_to=v_worker, assigned_by=auth.uid(), assignment_mode=CASE WHEN p_worker_id IS NULL THEN 'dynamic' ELSE 'manual' END, mobile_instruction='مهمتك التالية: '||task_type||COALESCE(' → '||task_subtype,'') WHERE id=v_task.id AND tenant_id=v_tenant;
  UPDATE public.inventory_worker_availability SET status='assigned' WHERE tenant_id=v_tenant AND worker_id=v_worker AND work_date=v_today;
  RETURN v_task.id;
END $$;
GRANT EXECUTE ON FUNCTION public.dispatch_inventory_labor_task(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_inventory_labor_task(p_task_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_labor_dispatch_tasks WHERE id=p_task_id AND tenant_id=v_tenant;
  IF NOT FOUND OR v_task.assigned_to IS NULL THEN RAISE EXCEPTION 'LABOR_TASK_NOT_ASSIGNED'; END IF;
  UPDATE public.inventory_labor_dispatch_tasks SET status='in_progress', started_at=NOW() WHERE id=p_task_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_labor_time_logs(tenant_id,worker_id,warehouse_id,dispatch_task_id,work_date,time_category,start_at,standard_minutes,units_processed)
  VALUES(v_tenant,v_task.assigned_to,v_task.warehouse_id,p_task_id,CURRENT_DATE,'direct',NOW(),v_task.standard_minutes,v_task.units_processed);
END $$;
GRANT EXECUTE ON FUNCTION public.start_inventory_labor_task(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_inventory_labor_task(p_task_id UUID, p_units_processed NUMERIC DEFAULT NULL, p_error_count INT DEFAULT 0)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_minutes NUMERIC;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_labor_dispatch_tasks WHERE id=p_task_id AND tenant_id=v_tenant;
  IF NOT FOUND OR v_task.status NOT IN ('assigned','in_progress') THEN RAISE EXCEPTION 'LABOR_TASK_NOT_COMPLETABLE'; END IF;
  v_minutes := GREATEST(EXTRACT(EPOCH FROM (NOW()-COALESCE(v_task.started_at,NOW())))/60,0.01);
  UPDATE public.inventory_labor_dispatch_tasks SET status='completed', completed_at=NOW(), actual_minutes=v_minutes, units_processed=COALESCE(p_units_processed,units_processed), error_count=COALESCE(p_error_count,0) WHERE id=p_task_id AND tenant_id=v_tenant;
  UPDATE public.inventory_labor_time_logs SET end_at=NOW(), actual_minutes=GREATEST(EXTRACT(EPOCH FROM (NOW()-start_at))/60,0.01), units_processed=COALESCE(p_units_processed,units_processed), error_count=COALESCE(p_error_count,0) WHERE tenant_id=v_tenant AND dispatch_task_id=p_task_id AND end_at IS NULL;
  UPDATE public.inventory_worker_availability SET status='available', current_location_id=v_task.to_location_id, current_zone_id=v_task.to_zone_id, available_from=NOW() WHERE tenant_id=v_tenant AND worker_id=v_task.assigned_to AND work_date=CURRENT_DATE;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_inventory_labor_task(UUID,NUMERIC,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_labor_time(p_worker_id UUID, p_warehouse_id UUID, p_time_category TEXT, p_reason_code TEXT, p_start_at TIMESTAMPTZ, p_end_at TIMESTAMPTZ, p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_minutes NUMERIC;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  IF p_time_category NOT IN ('direct','indirect','personal','unexplained') THEN RAISE EXCEPTION 'INVALID_TIME_CATEGORY'; END IF;
  IF p_end_at IS NOT NULL AND p_end_at < p_start_at THEN RAISE EXCEPTION 'INVALID_TIME_WINDOW'; END IF;
  v_minutes := CASE WHEN p_end_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (p_end_at-p_start_at))/60 END;
  INSERT INTO public.inventory_labor_time_logs(tenant_id,worker_id,warehouse_id,work_date,time_category,reason_code,start_at,end_at,actual_minutes,notes)
  VALUES(v_tenant,p_worker_id,p_warehouse_id,p_start_at::DATE,p_time_category,p_reason_code,p_start_at,p_end_at,v_minutes,p_notes) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_inventory_labor_time(UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.classify_inventory_unexplained_time(p_time_log_id UUID, p_reason_code TEXT, p_new_category TEXT, p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  UPDATE public.inventory_labor_time_logs SET time_category=p_new_category, reason_code=p_reason_code, notes=COALESCE(p_notes,notes) WHERE id=p_time_log_id AND tenant_id=v_tenant AND time_category='unexplained';
  IF NOT FOUND THEN RAISE EXCEPTION 'UNEXPLAINED_TIME_LOG_NOT_FOUND'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.classify_inventory_unexplained_time(UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_labor_interleaving_suggestions(p_worker_id UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_anchor RECORD; v_sugg RECORD; v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  FOR v_anchor IN SELECT * FROM public.inventory_labor_dispatch_tasks WHERE tenant_id=v_tenant AND status IN ('assigned','in_progress') AND (p_worker_id IS NULL OR assigned_to=p_worker_id) LOOP
    FOR v_sugg IN SELECT * FROM public.inventory_labor_dispatch_tasks WHERE tenant_id=v_tenant AND status='open' AND warehouse_id=v_anchor.warehouse_id AND id<>v_anchor.id AND (from_zone_id=v_anchor.to_zone_id OR to_zone_id=v_anchor.to_zone_id OR from_location_id=v_anchor.to_location_id) ORDER BY priority DESC, due_at NULLS LAST LIMIT 3 LOOP
      INSERT INTO public.inventory_labor_task_interleaving_suggestions(tenant_id,worker_id,anchor_task_id,suggested_task_id,reason,estimated_dead_travel_saved_meters,estimated_minutes_saved)
      VALUES(v_tenant,v_anchor.assigned_to,v_anchor.id,v_sugg.id,'نفس المنطقة/المسار لتقليل التنقل الفارغ',COALESCE(v_sugg.expected_travel_meters,0),ROUND(COALESCE(v_sugg.expected_travel_meters,0)/100,2)) ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_labor_interleaving_suggestions(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_inventory_labor_interleaving(p_suggestion_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_s RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_s FROM public.inventory_labor_task_interleaving_suggestions WHERE id=p_suggestion_id AND tenant_id=v_tenant AND status='suggested';
  IF NOT FOUND THEN RAISE EXCEPTION 'INTERLEAVING_SUGGESTION_NOT_FOUND'; END IF;
  UPDATE public.inventory_labor_dispatch_tasks SET assigned_to=v_s.worker_id, assigned_by=auth.uid(), assignment_mode='interleaved', status='assigned' WHERE id=v_s.suggested_task_id AND tenant_id=v_tenant;
  UPDATE public.inventory_labor_task_interleaving_suggestions SET status='accepted', accepted_at=NOW() WHERE id=p_suggestion_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_inventory_labor_interleaving(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_workforce_plan(p_plan_date DATE, p_warehouse_id UUID DEFAULT NULL, p_horizon TEXT DEFAULT 'daily')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_plan UUID; v_days INT; v_start DATE; v_end DATE; v_work NUMERIC; v_cap NUMERIC; v_eff NUMERIC; v_workers INT; v_rec TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF p_horizon NOT IN ('daily','weekly','monthly') THEN RAISE EXCEPTION 'INVALID_PLAN_HORIZON'; END IF;
  v_days := CASE p_horizon WHEN 'weekly' THEN 7 WHEN 'monthly' THEN 30 ELSE 1 END;
  v_start := p_plan_date; v_end := p_plan_date + (v_days-1);
  INSERT INTO public.inventory_labor_workforce_plans(tenant_id,plan_number,warehouse_id,plan_date,horizon,status,created_by)
  VALUES(v_tenant,public.inventory_next_number('LWP'),p_warehouse_id,p_plan_date,p_horizon,'generated',auth.uid()) RETURNING id INTO v_plan;
  INSERT INTO public.inventory_labor_workforce_plan_lines(tenant_id,plan_id,workload_area,source_table,source_count,workload_units,standard_minutes_per_unit,expected_minutes,priority,notes)
  SELECT v_tenant,v_plan,'receiving','inventory_dock_appointments',COUNT(*),COUNT(*),60,COUNT(*)*60,'high','الشاحنات الواردة المجدولة' FROM public.inventory_dock_appointments WHERE tenant_id=v_tenant AND (p_warehouse_id IS NULL OR warehouse_id=p_warehouse_id) AND scheduled_start::DATE BETWEEN v_start AND v_end HAVING COUNT(*)>0;
  INSERT INTO public.inventory_labor_workforce_plan_lines(tenant_id,plan_id,workload_area,source_table,source_count,workload_units,standard_minutes_per_unit,expected_minutes,priority,notes)
  SELECT v_tenant,v_plan,'putaway','inventory_putaway_tasks',COUNT(*),COALESCE(SUM(quantity),COUNT(*)),COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type='putaway' AND is_active),6),COALESCE(SUM(quantity),COUNT(*))*COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type='putaway' AND is_active),6),'normal','مهام التخزين المفتوحة' FROM public.inventory_putaway_tasks WHERE tenant_id=v_tenant AND status IN ('open','assigned') AND (p_warehouse_id IS NULL OR warehouse_id=p_warehouse_id) HAVING COUNT(*)>0;
  INSERT INTO public.inventory_labor_workforce_plan_lines(tenant_id,plan_id,workload_area,source_table,source_count,workload_units,standard_minutes_per_unit,expected_minutes,priority,notes)
  SELECT v_tenant,v_plan,'picking','inventory_pick_tasks',COUNT(*),COALESCE(SUM(required_qty),COUNT(*)),COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type='picking' AND is_active),2.5),COALESCE(SUM(required_qty),COUNT(*))*COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type='picking' AND is_active),2.5),'urgent','مهام السحب المفتوحة' FROM public.inventory_pick_tasks WHERE tenant_id=v_tenant AND status IN ('open','assigned','in_progress') AND (p_warehouse_id IS NULL OR warehouse_id=p_warehouse_id) HAVING COUNT(*)>0;
  INSERT INTO public.inventory_labor_workforce_plan_lines(tenant_id,plan_id,workload_area,source_table,source_count,workload_units,standard_minutes_per_unit,expected_minutes,priority,notes)
  SELECT v_tenant,v_plan,'packing','inventory_packages',COUNT(*),COUNT(*),COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type='packing' AND is_active),5),COUNT(*)*COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type='packing' AND is_active),5),'high','طرود مفتوحة للتعبئة' FROM public.inventory_packages p JOIN public.inventory_packing_sessions s ON s.id=p.packing_session_id AND s.tenant_id=p.tenant_id LEFT JOIN public.inventory_packing_stations st ON st.id=s.station_id AND st.tenant_id=s.tenant_id WHERE p.tenant_id=v_tenant AND p.status IN ('open','verified') AND (p_warehouse_id IS NULL OR st.warehouse_id=p_warehouse_id) HAVING COUNT(*)>0;
  INSERT INTO public.inventory_labor_workforce_plan_lines(tenant_id,plan_id,workload_area,source_table,source_count,workload_units,standard_minutes_per_unit,expected_minutes,priority,notes)
  SELECT v_tenant,v_plan,'shipping','inventory_shipments',COUNT(*),COUNT(*),30,COUNT(*)*30,'high','شحنات مجدولة/مجهزة' FROM public.inventory_shipments WHERE tenant_id=v_tenant AND status IN ('packed','rated','label_printed','staged') HAVING COUNT(*)>0;
  INSERT INTO public.inventory_labor_workforce_plan_lines(tenant_id,plan_id,workload_area,source_table,source_count,workload_units,standard_minutes_per_unit,expected_minutes,priority,notes)
  SELECT v_tenant,v_plan,'counting','inventory_count_tasks',COUNT(*),COUNT(*),COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type IN ('counting','cycle_count') AND is_active),3),COUNT(*)*COALESCE((SELECT AVG(standard_minutes) FROM public.inventory_labor_standards WHERE tenant_id=v_tenant AND task_type IN ('counting','cycle_count') AND is_active),3),'normal','مهام جرد مفتوحة' FROM public.inventory_count_tasks WHERE tenant_id=v_tenant AND status IN ('open','assigned') HAVING COUNT(*)>0;
  INSERT INTO public.inventory_labor_workforce_plan_lines(tenant_id,plan_id,workload_area,source_table,source_count,workload_units,standard_minutes_per_unit,expected_minutes,priority,notes)
  SELECT v_tenant,v_plan,'returns','inventory_return_disposition_tasks',COUNT(*),COALESCE(SUM(quantity),COUNT(*)),8,COALESCE(SUM(quantity),COUNT(*))*8,'normal','مرتجعات تحتاج توجيه/معالجة' FROM public.inventory_return_disposition_tasks WHERE tenant_id=v_tenant AND status IN ('open','assigned','in_progress') HAVING COUNT(*)>0;
  SELECT COALESCE(SUM(expected_minutes),0) INTO v_work FROM public.inventory_labor_workforce_plan_lines WHERE plan_id=v_plan AND tenant_id=v_tenant;
  SELECT COALESCE(SUM(planned_minutes-break_minutes),0), COALESCE(SUM((planned_minutes-break_minutes)*efficiency_factor),0), COUNT(*) INTO v_cap,v_eff,v_workers FROM public.inventory_worker_availability WHERE tenant_id=v_tenant AND work_date BETWEEN v_start AND v_end AND status NOT IN ('sick','leave','offline') AND (p_warehouse_id IS NULL OR warehouse_id=p_warehouse_id);
  v_rec := CASE WHEN v_eff < v_work THEN 'نقص عمالة: نحتاج عمالة إضافية أو ساعات إضافية' WHEN v_eff > v_work*1.25 THEN 'فائض طاقة: يمكن تكليف مهام تجديد وجرد دوري وتحسين مواقع' ELSE 'الطاقة متوازنة مع عبء العمل المتوقع' END;
  UPDATE public.inventory_labor_workforce_plans SET expected_workload_minutes=v_work, available_capacity_minutes=v_cap, effective_capacity_minutes=v_eff, available_workers=v_workers, required_workers=ROUND(v_work/NULLIF(480*0.85,0),2), capacity_status=CASE WHEN v_eff < v_work THEN 'shortage' WHEN v_eff > v_work*1.25 THEN 'surplus' ELSE 'balanced' END, recommendation=v_rec WHERE id=v_plan AND tenant_id=v_tenant;
  RETURN v_plan;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_workforce_plan(DATE,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_inventory_labor_incentives(p_program_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_prog RECORD; v_perf RECORD; v_tier TEXT; v_award NUMERIC; v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  SELECT * INTO v_prog FROM public.inventory_labor_incentive_programs WHERE id=p_program_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'INCENTIVE_PROGRAM_NOT_FOUND'; END IF;
  FOR v_perf IN
    SELECT worker_id, ROUND(SUM(standard_minutes)/NULLIF(SUM(actual_minutes),0)*100,2) productivity_percent, ROUND(SUM(error_count)::NUMERIC/NULLIF(SUM(units_processed),0)*100,4) error_rate_percent
    FROM public.inventory_labor_time_logs WHERE tenant_id=v_tenant AND work_date BETWEEN v_prog.period_start AND v_prog.period_end AND time_category='direct' AND actual_minutes > 0 GROUP BY worker_id
  LOOP
    IF COALESCE(v_perf.error_rate_percent,0) > v_prog.max_error_rate_percent THEN v_tier:='disqualified'; v_award:=0;
    ELSIF v_perf.productivity_percent >= v_prog.tier_exceptional_percent THEN v_tier:='exceptional'; v_award:=v_prog.exceptional_bonus_amount;
    ELSIF v_perf.productivity_percent >= v_prog.tier_excellent_percent THEN v_tier:='excellent'; v_award:=v_prog.excellent_bonus_amount;
    ELSIF v_perf.productivity_percent >= v_prog.tier_good_percent THEN v_tier:='good'; v_award:=v_prog.good_bonus_amount;
    ELSE v_tier:='standard'; v_award:=0; END IF;
    INSERT INTO public.inventory_labor_incentive_awards(tenant_id,program_id,worker_id,productivity_percent,error_rate_percent,incentive_tier,award_amount)
    VALUES(v_tenant,p_program_id,v_perf.worker_id,v_perf.productivity_percent,COALESCE(v_perf.error_rate_percent,0),v_tier,v_award)
    ON CONFLICT (tenant_id,program_id,worker_id) DO UPDATE SET productivity_percent=EXCLUDED.productivity_percent,error_rate_percent=EXCLUDED.error_rate_percent,incentive_tier=EXCLUDED.incentive_tier,award_amount=EXCLUDED.award_amount,calculated_at=NOW();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_inventory_labor_incentives(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_shift_leaderboard(p_warehouse_id UUID, p_work_date DATE, p_shift_code TEXT DEFAULT 'day', p_target_percent NUMERIC DEFAULT 90)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_line RECORD; v_rank INT:=0; v_avg NUMERIC; v_errors INT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_labor_shift_leaderboards(tenant_id,warehouse_id,work_date,shift_code,shift_target_percent)
  VALUES(v_tenant,p_warehouse_id,p_work_date,COALESCE(p_shift_code,'day'),COALESCE(p_target_percent,90))
  ON CONFLICT (tenant_id,warehouse_id,work_date,shift_code) DO UPDATE SET generated_at=NOW(), shift_target_percent=EXCLUDED.shift_target_percent
  RETURNING id INTO v_id;
  DELETE FROM public.inventory_labor_shift_leaderboard_lines WHERE tenant_id=v_tenant AND leaderboard_id=v_id;
  FOR v_line IN SELECT worker_id, COUNT(dispatch_task_id) FILTER (WHERE dispatch_task_id IS NOT NULL) completed_tasks, ROUND(SUM(standard_minutes)/NULLIF(SUM(actual_minutes),0)*100,2) productivity_percent, SUM(error_count) error_count FROM public.inventory_labor_time_logs WHERE tenant_id=v_tenant AND work_date=p_work_date AND time_category='direct' AND actual_minutes > 0 AND (p_warehouse_id IS NULL OR warehouse_id=p_warehouse_id) GROUP BY worker_id ORDER BY ROUND(SUM(standard_minutes)/NULLIF(SUM(actual_minutes),0)*100,2) DESC NULLS LAST LOOP
    v_rank := v_rank + 1;
    INSERT INTO public.inventory_labor_shift_leaderboard_lines(tenant_id,leaderboard_id,worker_id,rank_no,medal,completed_tasks,productivity_percent,error_count)
    VALUES(v_tenant,v_id,v_line.worker_id,v_rank,CASE v_rank WHEN 1 THEN 'gold' WHEN 2 THEN 'silver' WHEN 3 THEN 'bronze' ELSE NULL END,COALESCE(v_line.completed_tasks,0),COALESCE(v_line.productivity_percent,0),COALESCE(v_line.error_count,0));
  END LOOP;
  SELECT AVG(productivity_percent), SUM(error_count) INTO v_avg,v_errors FROM public.inventory_labor_shift_leaderboard_lines WHERE tenant_id=v_tenant AND leaderboard_id=v_id;
  UPDATE public.inventory_labor_shift_leaderboards SET team_average_productivity=COALESCE(v_avg,0), total_errors=COALESCE(v_errors,0) WHERE id=v_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_shift_leaderboard(UUID,DATE,TEXT,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_labor_productivity_report(p_report_type TEXT, p_period_start DATE, p_period_end DATE, p_warehouse_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_payload JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  IF p_report_type NOT IN ('daily','weekly','monthly') THEN RAISE EXCEPTION 'INVALID_LABOR_REPORT_TYPE'; END IF;
  SELECT jsonb_build_object('kpis',(SELECT COALESCE(jsonb_agg(to_jsonb(k)),'[]'::JSONB) FROM public.inventory_labor_kpis k),'non_productive',(SELECT COALESCE(jsonb_agg(to_jsonb(n)),'[]'::JSONB) FROM public.inventory_non_productive_time_analysis n),'productivity',(SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]'::JSONB) FROM public.inventory_employee_performance_realtime p)) INTO v_payload;
  INSERT INTO public.inventory_labor_productivity_report_runs(tenant_id,report_number,report_type,warehouse_id,period_start,period_end,report_payload,generated_by)
  VALUES(v_tenant,public.inventory_next_number('LPR'),p_report_type,p_warehouse_id,p_period_start,p_period_end,COALESCE(v_payload,'{}'::JSONB),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_labor_productivity_report(TEXT,DATE,DATE,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_labor_safety_incident(p_warehouse_id UUID, p_worker_id UUID, p_incident_date DATE, p_incident_type TEXT, p_recordable BOOLEAN, p_description TEXT, p_corrective_action TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','hr']::TEXT[]);
  INSERT INTO public.inventory_labor_safety_incidents(tenant_id,warehouse_id,worker_id,incident_date,incident_type,recordable,description,corrective_action)
  VALUES(v_tenant,p_warehouse_id,p_worker_id,p_incident_date,p_incident_type,COALESCE(p_recordable,false),p_description,p_corrective_action) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_inventory_labor_safety_incident(UUID,UUID,DATE,TEXT,BOOLEAN,TEXT,TEXT) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_labor_standards','inventory_labor_skill_catalog','inventory_worker_skills','inventory_labor_training_records','inventory_worker_availability','inventory_labor_workforce_plans','inventory_labor_workforce_plan_lines','inventory_labor_dispatch_tasks','inventory_labor_task_interleaving_suggestions','inventory_labor_time_logs','inventory_labor_non_productive_reasons','inventory_labor_incentive_programs','inventory_labor_incentive_awards','inventory_labor_shift_leaderboards','inventory_labor_shift_leaderboard_lines','inventory_labor_productivity_report_runs','inventory_labor_safety_incidents','inventory_labor_turnover_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''supervisor'',''hr'',''finance'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''supervisor'',''hr'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''supervisor'',''hr'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_labor_workload_capacity WITH (security_invoker=true) AS
SELECT p.tenant_id,p.id AS plan_id,p.plan_number,p.plan_date,p.horizon,p.expected_workload_minutes,p.effective_capacity_minutes,p.required_workers,p.available_workers,p.capacity_status,p.recommendation
FROM public.inventory_labor_workforce_plans p
WHERE p.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.inventory_labor_workload_capacity TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_dispatch_queue WITH (security_invoker=true) AS
SELECT d.tenant_id,d.id,d.task_number,d.task_type,d.task_subtype,d.priority,d.required_skill_code,d.status,d.assigned_to,d.standard_minutes,d.actual_minutes,d.mobile_instruction,d.due_at,d.created_at
FROM public.inventory_labor_dispatch_tasks d
WHERE d.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.inventory_labor_dispatch_queue TO authenticated;

CREATE OR REPLACE VIEW public.inventory_employee_performance_realtime WITH (security_invoker=true) AS
SELECT l.tenant_id,l.worker_id,p.full_name,
  COUNT(DISTINCT l.dispatch_task_id) FILTER (WHERE l.dispatch_task_id IS NOT NULL AND l.end_at IS NOT NULL) AS completed_tasks,
  ROUND(COALESCE(SUM(l.actual_minutes),0),2) AS actual_minutes,
  ROUND(COALESCE(SUM(l.standard_minutes),0),2) AS standard_minutes,
  ROUND(COALESCE(SUM(l.standard_minutes),0)/NULLIF(COALESCE(SUM(l.actual_minutes),0),0)*100,2) AS productivity_percent,
  SUM(l.units_processed) AS units_processed,
  SUM(l.error_count) AS error_count,
  ROUND(SUM(l.error_count)::NUMERIC/NULLIF(SUM(l.units_processed),0)*100,4) AS error_rate_percent,
  ROUND(SUM(l.actual_minutes) FILTER (WHERE l.time_category='direct')/NULLIF(SUM(l.actual_minutes),0)*100,2) AS direct_percent,
  ROUND(SUM(l.actual_minutes) FILTER (WHERE l.time_category='unexplained')/NULLIF(SUM(l.actual_minutes),0)*100,2) AS unexplained_percent
FROM public.inventory_labor_time_logs l LEFT JOIN public.profiles p ON p.id=l.worker_id
WHERE l.tenant_id=public.current_user_tenant_id() AND l.work_date=CURRENT_DATE
GROUP BY l.tenant_id,l.worker_id,p.full_name;
GRANT SELECT ON public.inventory_employee_performance_realtime TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_manager_dashboard WITH (security_invoker=true) AS
SELECT a.tenant_id,a.warehouse_id,a.work_date,a.shift_code,
  COUNT(DISTINCT a.worker_id) AS available_workers,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('open','assigned','in_progress')) AS active_tasks,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status='completed') AS completed_tasks,
  ROUND(AVG(p.productivity_percent),2) AS avg_productivity_percent,
  ROUND(AVG(p.direct_percent),2) AS avg_direct_percent
FROM public.inventory_worker_availability a
LEFT JOIN public.inventory_labor_dispatch_tasks d ON d.tenant_id=a.tenant_id AND d.warehouse_id=a.warehouse_id AND d.created_at::DATE=a.work_date
LEFT JOIN public.inventory_employee_performance_realtime p ON p.tenant_id=a.tenant_id AND p.worker_id=a.worker_id
WHERE a.tenant_id=public.current_user_tenant_id()
GROUP BY a.tenant_id,a.warehouse_id,a.work_date,a.shift_code;
GRANT SELECT ON public.inventory_labor_manager_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_non_productive_time_analysis WITH (security_invoker=true) AS
SELECT l.tenant_id,COALESCE(r.category,l.reason_code,'unclassified') AS non_productive_category,COALESCE(r.name_ar,l.reason_code,'غير مصنف') AS reason_name,COALESCE(r.recommended_action,'مراجعة مدير الوردية') AS recommended_action,COUNT(*) AS log_count,ROUND(SUM(l.actual_minutes),2) AS total_minutes
FROM public.inventory_labor_time_logs l LEFT JOIN public.inventory_labor_non_productive_reasons r ON r.tenant_id=l.tenant_id AND r.reason_code=l.reason_code
WHERE l.tenant_id=public.current_user_tenant_id() AND l.time_category IN ('indirect','personal','unexplained')
GROUP BY l.tenant_id,COALESCE(r.category,l.reason_code,'unclassified'),COALESCE(r.name_ar,l.reason_code,'غير مصنف'),COALESCE(r.recommended_action,'مراجعة مدير الوردية');
GRANT SELECT ON public.inventory_non_productive_time_analysis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_skill_matrix WITH (security_invoker=true) AS
SELECT ws.tenant_id,ws.worker_id,p.full_name,sc.skill_code,sc.name_ar,sc.skill_category,ws.skill_level,ws.certified_at,ws.expires_at,(ws.skill_level='certified' AND (ws.expires_at IS NULL OR ws.expires_at>=CURRENT_DATE)) AS currently_qualified
FROM public.inventory_worker_skills ws JOIN public.inventory_labor_skill_catalog sc ON sc.id=ws.skill_id AND sc.tenant_id=ws.tenant_id LEFT JOIN public.profiles p ON p.id=ws.worker_id
WHERE ws.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.inventory_labor_skill_matrix TO authenticated;

CREATE OR REPLACE VIEW public.inventory_shift_leaderboard_current WITH (security_invoker=true) AS
SELECT lb.tenant_id,lb.warehouse_id,lb.work_date,lb.shift_code,lb.team_average_productivity,lb.shift_target_percent,ll.rank_no,ll.medal,ll.worker_id,p.full_name,ll.completed_tasks,ll.productivity_percent,ll.error_count
FROM public.inventory_labor_shift_leaderboards lb JOIN public.inventory_labor_shift_leaderboard_lines ll ON ll.leaderboard_id=lb.id AND ll.tenant_id=lb.tenant_id LEFT JOIN public.profiles p ON p.id=ll.worker_id
WHERE lb.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.inventory_shift_leaderboard_current TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_incentive_summary WITH (security_invoker=true) AS
SELECT a.tenant_id,pr.program_name,a.incentive_tier,COUNT(*) AS worker_count,SUM(a.award_amount) AS total_awards,AVG(a.productivity_percent) AS avg_productivity,AVG(a.error_rate_percent) AS avg_error_rate
FROM public.inventory_labor_incentive_awards a JOIN public.inventory_labor_incentive_programs pr ON pr.id=a.program_id AND pr.tenant_id=a.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id()
GROUP BY a.tenant_id,pr.program_name,a.incentive_tier;
GRANT SELECT ON public.inventory_labor_incentive_summary TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_productivity_trends WITH (security_invoker=true) AS
SELECT tenant_id,work_date,time_category,COUNT(DISTINCT worker_id) AS workers,ROUND(SUM(standard_minutes),2) AS standard_minutes,ROUND(SUM(actual_minutes),2) AS actual_minutes,ROUND(SUM(standard_minutes)/NULLIF(SUM(actual_minutes),0)*100,2) AS productivity_percent,SUM(units_processed) AS units_processed,SUM(error_count) AS errors
FROM public.inventory_labor_time_logs
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id,work_date,time_category;
GRANT SELECT ON public.inventory_labor_productivity_trends TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_safety_trir WITH (security_invoker=true) AS
SELECT t.tenant_id,COUNT(DISTINCT i.id) FILTER (WHERE i.recordable) AS recordable_incidents,ROUND(SUM(t.actual_minutes)/60,2) AS labor_hours,ROUND(COUNT(DISTINCT i.id) FILTER (WHERE i.recordable)::NUMERIC*200000/NULLIF(SUM(t.actual_minutes)/60,0),4) AS trir
FROM public.inventory_labor_time_logs t LEFT JOIN public.inventory_labor_safety_incidents i ON i.tenant_id=t.tenant_id AND i.incident_date=t.work_date
WHERE t.tenant_id=public.current_user_tenant_id()
GROUP BY t.tenant_id;
GRANT SELECT ON public.inventory_labor_safety_trir TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_turnover_report WITH (security_invoker=true) AS
SELECT tenant_id,date_trunc('month',event_date)::DATE AS month,COUNT(*) FILTER (WHERE event_type IN ('termination','transfer_out')) AS exits,COUNT(*) FILTER (WHERE event_type IN ('hire','transfer_in')) AS entries,ROUND(COUNT(*) FILTER (WHERE event_type IN ('termination','transfer_out'))::NUMERIC/NULLIF(COUNT(DISTINCT worker_id),0)*100,2) AS turnover_rate_percent
FROM public.inventory_labor_turnover_events
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id,date_trunc('month',event_date)::DATE;
GRANT SELECT ON public.inventory_labor_turnover_report TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_kpis WITH (security_invoker=true) AS
SELECT l.tenant_id,
  ROUND(SUM(l.standard_minutes)/NULLIF(SUM(l.actual_minutes) FILTER (WHERE l.time_category='direct'),0)*100,2) AS overall_productivity_percent,
  ROUND(SUM(l.actual_minutes) FILTER (WHERE l.time_category='direct')/NULLIF(SUM(l.actual_minutes),0)*100,2) AS utilization_rate_percent,
  ROUND(SUM(l.actual_minutes) FILTER (WHERE l.time_category='unexplained')/NULLIF(SUM(l.actual_minutes),0)*100,2) AS unexplained_time_percent,
  ROUND(SUM(COALESCE(a.hourly_cost,0)*(l.actual_minutes/60))/NULLIF(SUM(l.units_processed),0),4) AS labor_cost_per_unit,
  (SELECT trir FROM public.inventory_labor_safety_trir s WHERE s.tenant_id=l.tenant_id LIMIT 1) AS trir,
  (SELECT AVG(turnover_rate_percent) FROM public.inventory_labor_turnover_report tr WHERE tr.tenant_id=l.tenant_id) AS turnover_rate_percent
FROM public.inventory_labor_time_logs l LEFT JOIN public.inventory_worker_availability a ON a.tenant_id=l.tenant_id AND a.worker_id=l.worker_id AND a.work_date=l.work_date
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id;
GRANT SELECT ON public.inventory_labor_kpis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_labor_dashboard WITH (security_invoker=true) AS
SELECT k.tenant_id,k.overall_productivity_percent,k.utilization_rate_percent,k.unexplained_time_percent,k.labor_cost_per_unit,k.trir,k.turnover_rate_percent,
  (SELECT COUNT(*) FROM public.inventory_labor_dispatch_tasks d WHERE d.tenant_id=k.tenant_id AND d.status IN ('open','assigned','in_progress')) AS active_tasks,
  (SELECT COUNT(*) FROM public.inventory_worker_availability a WHERE a.tenant_id=k.tenant_id AND a.work_date=CURRENT_DATE AND a.status NOT IN ('sick','leave','offline')) AS available_workers
FROM public.inventory_labor_kpis k
WHERE k.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.inventory_labor_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_labor_standards') IS NULL
     OR to_regclass('public.inventory_worker_availability') IS NULL
     OR to_regclass('public.inventory_labor_dispatch_tasks') IS NULL
     OR to_regclass('public.inventory_labor_time_logs') IS NULL
     OR to_regclass('public.inventory_labor_kpis') IS NULL
     OR to_regprocedure('public.generate_inventory_workforce_plan(date,uuid,text)') IS NULL
     OR to_regprocedure('public.dispatch_inventory_labor_task(uuid,uuid)') IS NULL
     OR to_regprocedure('public.complete_inventory_labor_task(uuid,numeric,integer)') IS NULL THEN
    RAISE EXCEPTION '0211 failed: labor management objects missing';
  END IF;
  RAISE NOTICE '✅ 0211: Inventory labor management and productivity applied';
END $$;
