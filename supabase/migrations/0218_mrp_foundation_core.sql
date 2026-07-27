-- ============================================================================
-- 0218 — MRP Unit 00: Manufacturing Foundation Core
-- docs/mrp/00-mrp-foundation-technical-addendum.md
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
CHECK (role IN ('employee','hr','admin','gatekeeper','developer','supervisor','manager','it_admin','tech','finance','marketing','sales','procurement','inventory','manufacturing'));

CREATE TABLE IF NOT EXISTS public.mrp_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manufacturing_role TEXT NOT NULL CHECK (manufacturing_role IN ('mrp_planner','production_manager','production_supervisor','shop_floor_operator','bom_engineer','quality_inspector','maintenance_technician','maintenance_manager','cost_accountant')),
  plant_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,user_id,manufacturing_role,plant_id)
);

CREATE TABLE IF NOT EXISTS public.manufacturing_plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plant_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  plant_type TEXT NOT NULL DEFAULT 'manufacturing' CHECK (plant_type IN ('manufacturing','assembly','packaging','maintenance','mixed')),
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Baghdad',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','closed')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plant_code)
);

CREATE TABLE IF NOT EXISTS public.manufacturing_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL REFERENCES public.manufacturing_plants(id) ON DELETE CASCADE,
  area_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  area_type TEXT NOT NULL DEFAULT 'production' CHECK (area_type IN ('production','quality','maintenance','warehouse_link','utility','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plant_id,area_code)
);

CREATE TABLE IF NOT EXISTS public.production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL REFERENCES public.manufacturing_plants(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.manufacturing_areas(id) ON DELETE SET NULL,
  line_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  line_type TEXT NOT NULL DEFAULT 'discrete' CHECK (line_type IN ('discrete','process','packaging','assembly','mixed')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','down','maintenance','inactive')),
  primary_work_center_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plant_id,line_code)
);

CREATE TABLE IF NOT EXISTS public.work_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL REFERENCES public.manufacturing_plants(id) ON DELETE CASCADE,
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  work_center_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  work_center_type TEXT NOT NULL DEFAULT 'machine' CHECK (work_center_type IN ('machine','labor','cell','inspection','packaging','external')),
  capacity_uom TEXT NOT NULL DEFAULT 'hour' CHECK (capacity_uom IN ('hour','unit','batch')),
  standard_rate_per_hour NUMERIC(16,4) DEFAULT 0,
  labor_rate_per_hour NUMERIC(16,4) DEFAULT 0,
  machine_rate_per_hour NUMERIC(16,4) DEFAULT 0,
  overhead_rate_per_hour NUMERIC(16,4) DEFAULT 0,
  queue_time_minutes NUMERIC(10,2) DEFAULT 0,
  setup_time_minutes NUMERIC(10,2) DEFAULT 0,
  move_time_minutes NUMERIC(10,2) DEFAULT 0,
  efficiency_percent NUMERIC(8,4) NOT NULL DEFAULT 100,
  utilization_percent NUMERIC(8,4) NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','down','maintenance','inactive')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plant_id,work_center_code)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='production_lines_primary_wc_fk') THEN
    ALTER TABLE public.production_lines ADD CONSTRAINT production_lines_primary_wc_fk FOREIGN KEY (primary_work_center_id) REFERENCES public.work_centers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.manufacturing_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_code TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('labor_skill','tool','fixture','machine','inspection_device','external_service')),
  name_ar TEXT NOT NULL,
  capacity_per_shift NUMERIC(16,4),
  cost_rate NUMERIC(16,4) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,resource_code)
);

CREATE TABLE IF NOT EXISTS public.work_center_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_center_id UUID NOT NULL REFERENCES public.work_centers(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.manufacturing_resources(id) ON DELETE CASCADE,
  required_quantity NUMERIC(16,4) NOT NULL DEFAULT 1,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,work_center_id,resource_id)
);

CREATE TABLE IF NOT EXISTS public.manufacturing_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  linked_maintenance_asset_id UUID,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  criticality TEXT NOT NULL DEFAULT 'B' CHECK (criticality IN ('A','B','C')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','down','maintenance','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,asset_code)
);

CREATE TABLE IF NOT EXISTS public.manufacturing_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  calendar_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Baghdad',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,calendar_code)
);

CREATE TABLE IF NOT EXISTS public.manufacturing_calendar_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES public.manufacturing_calendars(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT true,
  available_minutes NUMERIC(10,2) NOT NULL DEFAULT 480,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,calendar_id,work_date)
);

CREATE TABLE IF NOT EXISTS public.manufacturing_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  starts_at_time TIME NOT NULL,
  ends_at_time TIME NOT NULL,
  break_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,shift_code)
);

CREATE TABLE IF NOT EXISTS public.work_center_shift_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_center_id UUID NOT NULL REFERENCES public.work_centers(id) ON DELETE CASCADE,
  calendar_id UUID REFERENCES public.manufacturing_calendars(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.manufacturing_shifts(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  available_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_capacity_units NUMERIC(16,4) DEFAULT 0,
  planned_load_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  reserved_load_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','overloaded','maintenance','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,work_center_id,shift_id,work_date)
);

CREATE TABLE IF NOT EXISTS public.manufacturing_operation_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  operation_type TEXT NOT NULL DEFAULT 'production' CHECK (operation_type IN ('production','setup','inspection','packaging','maintenance','subcontract')),
  standard_setup_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  standard_run_minutes_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
  requires_quality_check BOOLEAN NOT NULL DEFAULT false,
  requires_machine BOOLEAN NOT NULL DEFAULT true,
  requires_operator BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,operation_code)
);

CREATE TABLE IF NOT EXISTS public.routing_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  routing_code TEXT NOT NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  routing_type TEXT NOT NULL DEFAULT 'manufacturing' CHECK (routing_type IN ('manufacturing','rework','repair','subcontract')),
  version_no TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','effective','superseded','archived')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE,
  effective_to DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,routing_code,version_no)
);

CREATE TABLE IF NOT EXISTS public.routing_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  routing_id UUID NOT NULL REFERENCES public.routing_headers(id) ON DELETE CASCADE,
  sequence_no INT NOT NULL,
  operation_id UUID REFERENCES public.manufacturing_operation_catalog(id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  operation_name TEXT NOT NULL,
  setup_minutes NUMERIC(10,2) DEFAULT 0,
  run_minutes_per_unit NUMERIC(10,4) DEFAULT 0,
  queue_minutes NUMERIC(10,2) DEFAULT 0,
  move_minutes NUMERIC(10,2) DEFAULT 0,
  overlap_allowed BOOLEAN NOT NULL DEFAULT false,
  quality_gate_required BOOLEAN NOT NULL DEFAULT false,
  backflush_materials BOOLEAN NOT NULL DEFAULT false,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,routing_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS public.mrp_numbering_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  prefix TEXT NOT NULL,
  separator TEXT NOT NULL DEFAULT '-',
  padding INT NOT NULL DEFAULT 4,
  next_number BIGINT NOT NULL DEFAULT 1,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,entity_type,prefix)
);

CREATE TABLE IF NOT EXISTS public.mrp_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  barcode_value TEXT NOT NULL,
  barcode_type TEXT NOT NULL DEFAULT 'code128',
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,barcode_value)
);

CREATE TABLE IF NOT EXISTS public.mrp_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unit_key TEXT NOT NULL DEFAULT 'foundation',
  entity_table TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mrp_audit_activity ON public.mrp_audit_log(tenant_id,unit_key,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_center_capacity_date ON public.work_center_shift_capacity(tenant_id,work_center_id,work_date);

CREATE OR REPLACE FUNCTION public.mrp_require_roles(allowed_roles TEXT[])
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role TEXT:=public.current_user_role();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF public.current_user_tenant_id() IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (v_role=ANY(allowed_roles) OR v_role IN ('manufacturing','admin','developer','it_admin')) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MRP_OPERATION'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.mrp_require_roles(TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_mrp_audit_event(p_unit_key TEXT,p_entity_table TEXT,p_entity_id UUID,p_action TEXT,p_old_value JSONB DEFAULT NULL,p_new_value JSONB DEFAULT NULL,p_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_audit_log(tenant_id,unit_key,entity_table,entity_id,action,old_value,new_value,reason,actor_id)
  VALUES(v_tenant,COALESCE(p_unit_key,'foundation'),p_entity_table,p_entity_id,p_action,p_old_value,p_new_value,p_reason,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_mrp_audit_event(TEXT,TEXT,UUID,TEXT,JSONB,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_numbering_rule(p_entity_type TEXT,p_prefix TEXT,p_padding INT DEFAULT 4,p_next_number BIGINT DEFAULT 1,p_separator TEXT DEFAULT '-',p_is_default BOOLEAN DEFAULT true)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF p_is_default THEN UPDATE public.mrp_numbering_rules SET is_default=false WHERE tenant_id=v_tenant AND entity_type=p_entity_type; END IF;
  INSERT INTO public.mrp_numbering_rules(tenant_id,entity_type,prefix,padding,next_number,separator,is_default)
  VALUES(v_tenant,p_entity_type,p_prefix,COALESCE(p_padding,4),COALESCE(p_next_number,1),COALESCE(p_separator,'-'),COALESCE(p_is_default,true))
  ON CONFLICT (tenant_id,entity_type,prefix) DO UPDATE SET padding=EXCLUDED.padding,next_number=EXCLUDED.next_number,separator=EXCLUDED.separator,is_default=EXCLUDED.is_default
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_numbering_rule(TEXT,TEXT,INT,BIGINT,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_mrp_next_code(p_entity_type TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v RECORD;
BEGIN
  SELECT * INTO v FROM public.mrp_numbering_rules WHERE tenant_id=v_tenant AND entity_type=p_entity_type AND is_default ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN UPPER(p_entity_type)||'-0001'; END IF;
  RETURN v.prefix||v.separator||LPAD(v.next_number::TEXT,v.padding,'0');
END $$;
GRANT EXECUTE ON FUNCTION public.preview_mrp_next_code(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_next_code(p_entity_type TEXT,p_manual_code TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v RECORD; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF COALESCE(p_manual_code,'')<>'' THEN RETURN p_manual_code; END IF;
  SELECT * INTO v FROM public.mrp_numbering_rules WHERE tenant_id=v_tenant AND entity_type=p_entity_type AND is_default ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN UPPER(p_entity_type)||'-'||LPAD((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 10000)::TEXT,4,'0'); END IF;
  v_code := v.prefix||v.separator||LPAD(v.next_number::TEXT,v.padding,'0');
  UPDATE public.mrp_numbering_rules SET next_number=next_number+1 WHERE id=v.id;
  RETURN v_code;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_next_code(TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_plant(p_plant_code TEXT,p_name_ar TEXT,p_name_en TEXT DEFAULT NULL,p_plant_type TEXT DEFAULT 'manufacturing',p_address TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('plant',p_plant_code);
  INSERT INTO public.manufacturing_plants(tenant_id,plant_code,name_ar,name_en,plant_type,address,created_by)
  VALUES(v_tenant,v_code,p_name_ar,p_name_en,COALESCE(p_plant_type,'manufacturing'),p_address,auth.uid()) RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('foundation','manufacturing_plants',v_id,'create',NULL,jsonb_build_object('plant_code',v_code), 'إنشاء مصنع');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_plant(TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_work_center(p_plant_id UUID,p_line_id UUID,p_work_center_code TEXT,p_name_ar TEXT,p_work_center_type TEXT DEFAULT 'machine')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.manufacturing_plants WHERE id=p_plant_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'PLANT_NOT_FOUND'; END IF;
  v_code := public.generate_mrp_next_code('work_center',p_work_center_code);
  INSERT INTO public.work_centers(tenant_id,plant_id,line_id,work_center_code,name_ar,work_center_type,created_by)
  VALUES(v_tenant,p_plant_id,p_line_id,v_code,p_name_ar,COALESCE(p_work_center_type,'machine'),auth.uid()) RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('foundation','work_centers',v_id,'create',NULL,jsonb_build_object('work_center_code',v_code), 'إنشاء مركز عمل');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_work_center(UUID,UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_calendar(p_calendar_code TEXT,p_name_ar TEXT,p_timezone TEXT DEFAULT 'Asia/Baghdad')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('calendar',p_calendar_code);
  INSERT INTO public.manufacturing_calendars(tenant_id,calendar_code,name_ar,timezone) VALUES(v_tenant,v_code,p_name_ar,COALESCE(p_timezone,'Asia/Baghdad')) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_calendar(TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_operation_catalog(p_operation_code TEXT,p_name_ar TEXT,p_operation_type TEXT DEFAULT 'production',p_setup NUMERIC DEFAULT 0,p_run NUMERIC DEFAULT 0,p_quality BOOLEAN DEFAULT false)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('operation',p_operation_code);
  INSERT INTO public.manufacturing_operation_catalog(tenant_id,operation_code,name_ar,operation_type,standard_setup_minutes,standard_run_minutes_per_unit,requires_quality_check)
  VALUES(v_tenant,v_code,p_name_ar,COALESCE(p_operation_type,'production'),COALESCE(p_setup,0),COALESCE(p_run,0),COALESCE(p_quality,false))
  ON CONFLICT (tenant_id,operation_code) DO UPDATE SET name_ar=EXCLUDED.name_ar, operation_type=EXCLUDED.operation_type, standard_setup_minutes=EXCLUDED.standard_setup_minutes, standard_run_minutes_per_unit=EXCLUDED.standard_run_minutes_per_unit, requires_quality_check=EXCLUDED.requires_quality_check
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_operation_catalog(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_work_center_capacity(p_work_center_id UUID,p_calendar_id UUID,p_shift_id UUID,p_start DATE,p_end DATE,p_minutes NUMERIC DEFAULT 480)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); d DATE; v_count INT:=0;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  d := p_start;
  WHILE d <= p_end LOOP
    INSERT INTO public.work_center_shift_capacity(tenant_id,work_center_id,calendar_id,shift_id,work_date,available_minutes,status)
    VALUES(v_tenant,p_work_center_id,p_calendar_id,p_shift_id,d,COALESCE(p_minutes,480),'available')
    ON CONFLICT (tenant_id,work_center_id,shift_id,work_date) DO UPDATE SET available_minutes=EXCLUDED.available_minutes,status='available';
    v_count := v_count + 1; d := d + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_work_center_capacity(UUID,UUID,UUID,DATE,DATE,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_routing_header(p_routing_code TEXT,p_item_id UUID,p_routing_type TEXT DEFAULT 'manufacturing',p_version_no TEXT DEFAULT '1.0')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('routing',p_routing_code);
  INSERT INTO public.routing_headers(tenant_id,routing_code,item_id,routing_type,version_no,status,created_by)
  VALUES(v_tenant,v_code,p_item_id,p_routing_type,COALESCE(p_version_no,'1.0'),'draft',auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_routing_header(TEXT,UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_routing_operation(p_routing_id UUID,p_sequence_no INT,p_operation_id UUID,p_work_center_id UUID,p_operation_name TEXT,p_setup NUMERIC DEFAULT 0,p_run NUMERIC DEFAULT 0,p_quality BOOLEAN DEFAULT false,p_instructions TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','bom_engineer','production_manager']::TEXT[]);
  INSERT INTO public.routing_operations(tenant_id,routing_id,sequence_no,operation_id,work_center_id,operation_name,setup_minutes,run_minutes_per_unit,quality_gate_required,instructions)
  VALUES(v_tenant,p_routing_id,p_sequence_no,p_operation_id,p_work_center_id,p_operation_name,COALESCE(p_setup,0),COALESCE(p_run,0),COALESCE(p_quality,false),p_instructions) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_routing_operation(UUID,INT,UUID,UUID,TEXT,NUMERIC,NUMERIC,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_routing(p_routing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  UPDATE public.routing_headers SET status='effective', approved_by=auth.uid(), approved_at=NOW() WHERE id=p_routing_id AND tenant_id=v_tenant AND status IN ('draft','in_review','approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUTING_NOT_APPROVABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_routing(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_mrp_master_record(p_entity_table TEXT,p_entity_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  IF p_entity_table NOT IN ('manufacturing_plants','manufacturing_areas','production_lines','work_centers','manufacturing_resources','manufacturing_assets','manufacturing_calendars','manufacturing_shifts','manufacturing_operation_catalog','routing_headers') THEN RAISE EXCEPTION 'ENTITY_NOT_ARCHIVABLE'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND tenant_id=$2 FOR UPDATE', p_entity_table) INTO v_old USING p_entity_id,v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_FOUND'; END IF;
  EXECUTE format('UPDATE public.%I SET status=$1 WHERE id=$2 AND tenant_id=$3', p_entity_table) USING 'archived',p_entity_id,v_tenant;
  PERFORM public.log_mrp_audit_event('foundation',p_entity_table,p_entity_id,'archive',v_old,jsonb_build_object('status','archived'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.archive_mrp_master_record(TEXT,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_work_center_availability(p_work_center_id UUID,p_work_date DATE,p_required_minutes NUMERIC)
RETURNS TABLE(is_available BOOLEAN, available_minutes NUMERIC, reserved_minutes NUMERIC, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  RETURN QUERY SELECT (COALESCE(SUM(c.available_minutes-c.reserved_load_minutes),0) >= p_required_minutes), COALESCE(SUM(c.available_minutes),0), COALESCE(SUM(c.reserved_load_minutes),0), COALESCE(MAX(c.status),'none')
  FROM public.work_center_shift_capacity c WHERE c.tenant_id=v_tenant AND c.work_center_id=p_work_center_id AND c.work_date=p_work_date;
END $$;
GRANT EXECUTE ON FUNCTION public.check_work_center_availability(UUID,DATE,NUMERIC) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_user_roles','manufacturing_plants','manufacturing_areas','production_lines','work_centers','manufacturing_resources','work_center_resources','manufacturing_assets','manufacturing_calendars','manufacturing_calendar_days','manufacturing_shifts','work_center_shift_capacity','manufacturing_operation_catalog','routing_headers','routing_operations','mrp_numbering_rules','mrp_barcodes','mrp_audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_foundation_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.manufacturing_plants WHERE tenant_id=public.current_user_tenant_id() AND status='active') AS active_plants,
  (SELECT COUNT(*) FROM public.production_lines WHERE tenant_id=public.current_user_tenant_id() AND status='active') AS active_lines,
  (SELECT COUNT(*) FROM public.work_centers WHERE tenant_id=public.current_user_tenant_id() AND status='active') AS active_work_centers,
  (SELECT COUNT(*) FROM public.routing_headers WHERE tenant_id=public.current_user_tenant_id() AND status='effective') AS effective_routings;
GRANT SELECT ON public.mrp_foundation_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_work_center_capacity_calendar WITH (security_invoker=true) AS
SELECT c.*, wc.work_center_code, wc.name_ar AS work_center_name
FROM public.work_center_shift_capacity c JOIN public.work_centers wc ON wc.id=c.work_center_id AND wc.tenant_id=c.tenant_id
WHERE c.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_work_center_capacity_calendar TO authenticated;

CREATE OR REPLACE VIEW public.mrp_resource_matrix WITH (security_invoker=true) AS
SELECT wc.tenant_id,wc.work_center_code,wc.name_ar AS work_center_name,r.resource_code,r.name_ar AS resource_name,r.resource_type,wcr.required_quantity,wcr.is_primary
FROM public.work_center_resources wcr JOIN public.work_centers wc ON wc.id=wcr.work_center_id AND wc.tenant_id=wcr.tenant_id JOIN public.manufacturing_resources r ON r.id=wcr.resource_id AND r.tenant_id=wcr.tenant_id
WHERE wcr.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_resource_matrix TO authenticated;

CREATE OR REPLACE VIEW public.mrp_routing_overview WITH (security_invoker=true) AS
SELECT h.tenant_id,h.id AS routing_id,h.routing_code,h.version_no,h.status,h.item_id,COUNT(o.id) AS operation_count,SUM(COALESCE(o.setup_minutes,0)) AS setup_minutes,SUM(COALESCE(o.run_minutes_per_unit,0)) AS run_minutes_per_unit
FROM public.routing_headers h LEFT JOIN public.routing_operations o ON o.routing_id=h.id AND o.tenant_id=h.tenant_id
WHERE h.tenant_id=public.current_user_tenant_id()
GROUP BY h.tenant_id,h.id,h.routing_code,h.version_no,h.status,h.item_id;
GRANT SELECT ON public.mrp_routing_overview TO authenticated;

CREATE OR REPLACE VIEW public.mrp_open_masterdata_issues WITH (security_invoker=true) AS
SELECT tenant_id,'work_center_without_capacity' AS issue_type, id AS entity_id, work_center_code AS entity_code, 'مركز عمل نشط لا يملك طاقة مستقبلية' AS issue_text
FROM public.work_centers wc
WHERE tenant_id=public.current_user_tenant_id() AND status='active' AND NOT EXISTS (SELECT 1 FROM public.work_center_shift_capacity c WHERE c.work_center_id=wc.id AND c.tenant_id=wc.tenant_id AND c.work_date>=CURRENT_DATE)
UNION ALL
SELECT tenant_id,'routing_without_operations', id, routing_code, 'Routing بدون عمليات'
FROM public.routing_headers h
WHERE tenant_id=public.current_user_tenant_id() AND NOT EXISTS (SELECT 1 FROM public.routing_operations o WHERE o.routing_id=h.id AND o.tenant_id=h.tenant_id);
GRANT SELECT ON public.mrp_open_masterdata_issues TO authenticated;

CREATE OR REPLACE VIEW public.mrp_audit_activity WITH (security_invoker=true) AS
SELECT a.*, p.full_name AS actor_name FROM public.mrp_audit_log a LEFT JOIN public.profiles p ON p.id=a.actor_id WHERE a.tenant_id=public.current_user_tenant_id() ORDER BY a.created_at DESC;
GRANT SELECT ON public.mrp_audit_activity TO authenticated;

CREATE OR REPLACE VIEW public.mrp_integration_health WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  to_regclass('public.inventory_items') IS NOT NULL AS inventory_available,
  to_regclass('public.purchase_requisitions') IS NOT NULL AS procurement_available,
  to_regclass('public.chart_of_accounts') IS NOT NULL AS finance_available,
  to_regclass('public.profiles') IS NOT NULL AS hr_available,
  to_regclass('public.inventory_quality_ncr_cases') IS NOT NULL AS quality_foundation_available;
GRANT SELECT ON public.mrp_integration_health TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.manufacturing_plants') IS NULL OR to_regclass('public.work_centers') IS NULL OR to_regclass('public.routing_headers') IS NULL OR to_regprocedure('public.create_mrp_plant(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION '0218 failed: MRP foundation objects missing';
  END IF;
  RAISE NOTICE '✅ 0218: MRP manufacturing foundation core applied';
END $$;
