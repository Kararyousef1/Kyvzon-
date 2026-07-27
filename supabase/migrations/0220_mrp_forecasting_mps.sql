-- ============================================================================
-- 0220 — MRP Unit 02: Demand Forecasting & Master Production Schedule (MPS)
-- docs/mrp/02-demand-forecasting-MPS.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_product_planning_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL DEFAULT 'MTS' CHECK (strategy IN ('MTS','MTO','ATO','ETO')),
  safety_stock_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  min_mps_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  order_multiple NUMERIC(18,6) NOT NULL DEFAULT 1,
  manufacturing_lead_time_days INT NOT NULL DEFAULT 0,
  forecast_horizon_weeks INT NOT NULL DEFAULT 13 CHECK (forecast_horizon_weeks BETWEEN 2 AND 52),
  frozen_horizon_days INT NOT NULL DEFAULT 7,
  planning_time_fence_days INT NOT NULL DEFAULT 28,
  default_work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,item_id)
);

CREATE TABLE IF NOT EXISTS public.mrp_demand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  demand_date DATE NOT NULL,
  demand_bucket TEXT NOT NULL DEFAULT 'daily' CHECK (demand_bucket IN ('daily','weekly','monthly')),
  demand_type TEXT NOT NULL CHECK (demand_type IN ('historical_sales','confirmed_order','inventory_consumption','sales_plan','external_indicator','forecast_override')),
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  source_table TEXT,
  source_id UUID,
  confidence_percent NUMERIC(8,4),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mrp_demand_history_item_date ON public.mrp_demand_history(tenant_id,item_id,demand_date DESC);

CREATE TABLE IF NOT EXISTS public.mrp_forecast_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  model_code TEXT NOT NULL,
  model_name TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('simple_moving_average','weighted_moving_average','exponential_smoothing','seasonal_index','ai_external')),
  bucket TEXT NOT NULL DEFAULT 'weekly' CHECK (bucket IN ('daily','weekly','monthly')),
  horizon_periods INT NOT NULL DEFAULT 13 CHECK (horizon_periods BETWEEN 1 AND 60),
  parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,model_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_forecast_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  model_id UUID NOT NULL REFERENCES public.mrp_forecast_models(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  bucket TEXT NOT NULL,
  horizon_start DATE NOT NULL,
  horizon_periods INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  mape_percent NUMERIC(10,4),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,run_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_forecast_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  forecast_run_id UUID NOT NULL REFERENCES public.mrp_forecast_runs(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  bucket_start DATE NOT NULL,
  bucket_end DATE NOT NULL,
  forecast_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  confirmed_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  adjusted_qty NUMERIC(18,6),
  final_forecast_qty NUMERIC(18,6) GENERATED ALWAYS AS (COALESCE(adjusted_qty, forecast_qty)) STORED,
  confidence_percent NUMERIC(8,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,forecast_run_id,item_id,bucket_start)
);

CREATE TABLE IF NOT EXISTS public.mrp_forecast_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  forecast_line_id UUID NOT NULL REFERENCES public.mrp_forecast_lines(id) ON DELETE CASCADE,
  old_qty NUMERIC(18,6),
  new_qty NUMERIC(18,6) NOT NULL,
  reason TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_forecast_accuracy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  model_id UUID REFERENCES public.mrp_forecast_models(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  forecast_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  actual_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  absolute_error NUMERIC(18,6) GENERATED ALWAYS AS (ABS(actual_qty-forecast_qty)) STORED,
  mape_percent NUMERIC(10,4) GENERATED ALWAYS AS (CASE WHEN actual_qty=0 THEN NULL ELSE ABS(actual_qty-forecast_qty)/ABS(actual_qty)*100 END) STORED,
  quality_band TEXT GENERATED ALWAYS AS (CASE WHEN actual_qty=0 THEN 'n/a' WHEN ABS(actual_qty-forecast_qty)/ABS(actual_qty)*100 < 10 THEN 'excellent' WHEN ABS(actual_qty-forecast_qty)/ABS(actual_qty)*100 < 20 THEN 'good' WHEN ABS(actual_qty-forecast_qty)/ABS(actual_qty)*100 < 30 THEN 'acceptable' ELSE 'poor' END) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_mps_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_number TEXT NOT NULL,
  plant_id UUID REFERENCES public.manufacturing_plants(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  horizon_start DATE NOT NULL,
  horizon_end DATE NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'weekly' CHECK (bucket IN ('daily','weekly','monthly')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','simulated','firmed','approved','released','superseded','cancelled')),
  frozen_horizon_days INT NOT NULL DEFAULT 7,
  source_forecast_run_id UUID REFERENCES public.mrp_forecast_runs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,plan_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_mps_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mps_plan_id UUID NOT NULL REFERENCES public.mrp_mps_plans(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  bucket_start DATE NOT NULL,
  bucket_end DATE NOT NULL,
  forecast_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  confirmed_order_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  gross_demand_qty NUMERIC(18,6) GENERATED ALWAYS AS (GREATEST(forecast_qty, confirmed_order_qty)) STORED,
  beginning_inventory_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  scheduled_receipts_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  safety_stock_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  mps_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  ending_inventory_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  strategy TEXT NOT NULL DEFAULT 'MTS' CHECK (strategy IN ('MTS','MTO','ATO','ETO')),
  is_frozen BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','firmed','released','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,mps_plan_id,item_id,bucket_start)
);

CREATE TABLE IF NOT EXISTS public.mrp_mps_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mps_line_id UUID NOT NULL REFERENCES public.mrp_mps_lines(id) ON DELETE CASCADE,
  old_mps_qty NUMERIC(18,6),
  new_mps_qty NUMERIC(18,6) NOT NULL,
  reason TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_rccp_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_number TEXT NOT NULL,
  mps_plan_id UUID NOT NULL REFERENCES public.mrp_mps_plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed','cancelled')),
  overloaded_work_centers INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,run_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_rccp_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rccp_run_id UUID NOT NULL REFERENCES public.mrp_rccp_runs(id) ON DELETE CASCADE,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  bucket_start DATE NOT NULL,
  bucket_end DATE NOT NULL,
  required_minutes NUMERIC(18,6) NOT NULL DEFAULT 0,
  available_minutes NUMERIC(18,6) NOT NULL DEFAULT 0,
  utilization_percent NUMERIC(10,4) GENERATED ALWAYS AS (CASE WHEN available_minutes=0 THEN NULL ELSE required_minutes/available_minutes*100 END) STORED,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','overloaded','no_capacity')),
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_mps_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mps_plan_id UUID REFERENCES public.mrp_mps_plans(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('capacity_gap','material_gap','stockout_risk','forecast_error_high','frozen_change','inventory_coverage_low')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','urgent')),
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.create_mrp_forecast_model(p_item_id UUID,p_method TEXT,p_bucket TEXT DEFAULT 'weekly',p_horizon_periods INT DEFAULT 13,p_parameters JSONB DEFAULT '{}'::JSONB,p_model_code TEXT DEFAULT NULL,p_model_name TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF p_method NOT IN ('simple_moving_average','weighted_moving_average','exponential_smoothing','seasonal_index','ai_external') THEN RAISE EXCEPTION 'INVALID_FORECAST_METHOD'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant AND status='active') THEN RAISE EXCEPTION 'FORECAST_ITEM_NOT_FOUND'; END IF;
  v_code := public.generate_mrp_next_code('forecast_model',p_model_code);
  INSERT INTO public.mrp_forecast_models(tenant_id,item_id,model_code,model_name,method,bucket,horizon_periods,parameters,created_by)
  VALUES(v_tenant,p_item_id,v_code,COALESCE(p_model_name,v_code),p_method,COALESCE(p_bucket,'weekly'),COALESCE(p_horizon_periods,13),COALESCE(p_parameters,'{}'::JSONB),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_forecast_model(UUID,TEXT,TEXT,INT,JSONB,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_mrp_demand_history(p_item_id UUID,p_demand_date DATE,p_quantity NUMERIC,p_demand_type TEXT DEFAULT 'historical_sales',p_demand_bucket TEXT DEFAULT 'daily',p_payload JSONB DEFAULT '{}'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  INSERT INTO public.mrp_demand_history(tenant_id,item_id,demand_date,demand_bucket,demand_type,quantity,payload)
  VALUES(v_tenant,p_item_id,p_demand_date,COALESCE(p_demand_bucket,'daily'),COALESCE(p_demand_type,'historical_sales'),COALESCE(p_quantity,0),COALESCE(p_payload,'{}'::JSONB)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_mrp_demand_history(UUID,DATE,NUMERIC,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_mrp_forecast(p_model_id UUID,p_horizon_start DATE DEFAULT CURRENT_DATE,p_horizon_periods INT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_model RECORD; v_run UUID; v_periods INT; i INT; v_start DATE; v_end DATE; v_base NUMERIC; v_alpha NUMERIC; v_prev NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  SELECT * INTO v_model FROM public.mrp_forecast_models WHERE id=p_model_id AND tenant_id=v_tenant AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'FORECAST_MODEL_NOT_FOUND'; END IF;
  v_periods := COALESCE(p_horizon_periods,v_model.horizon_periods);
  v_alpha := COALESCE((v_model.parameters->>'alpha')::NUMERIC,0.3);
  SELECT COALESCE(AVG(quantity),0) INTO v_base FROM (SELECT quantity FROM public.mrp_demand_history WHERE tenant_id=v_tenant AND item_id=v_model.item_id ORDER BY demand_date DESC LIMIT COALESCE((v_model.parameters->>'window')::INT,12)) x;
  v_prev := v_base;
  INSERT INTO public.mrp_forecast_runs(tenant_id,run_number,model_id,item_id,method,bucket,horizon_start,horizon_periods,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('forecast_run',NULL),p_model_id,v_model.item_id,v_model.method,v_model.bucket,COALESCE(p_horizon_start,CURRENT_DATE),v_periods,auth.uid()) RETURNING id INTO v_run;
  FOR i IN 0..v_periods-1 LOOP
    v_start := CASE v_model.bucket WHEN 'monthly' THEN (date_trunc('month',p_horizon_start)::DATE + (i||' month')::INTERVAL)::DATE WHEN 'weekly' THEN p_horizon_start + (i*7) ELSE p_horizon_start+i END;
    v_end := CASE v_model.bucket WHEN 'monthly' THEN (date_trunc('month',v_start)::DATE + INTERVAL '1 month - 1 day')::DATE WHEN 'weekly' THEN v_start+6 ELSE v_start END;
    IF v_model.method='exponential_smoothing' THEN v_prev := v_alpha*v_base + (1-v_alpha)*v_prev; END IF;
    INSERT INTO public.mrp_forecast_lines(tenant_id,forecast_run_id,item_id,bucket_start,bucket_end,forecast_qty,confirmed_qty,confidence_percent)
    VALUES(v_tenant,v_run,v_model.item_id,v_start,v_end,CASE WHEN v_model.method='exponential_smoothing' THEN v_prev ELSE v_base END,COALESCE((SELECT SUM(quantity) FROM public.mrp_demand_history WHERE tenant_id=v_tenant AND item_id=v_model.item_id AND demand_type='confirmed_order' AND demand_date BETWEEN v_start AND v_end),0),80);
  END LOOP;
  RETURN v_run;
END $$;
GRANT EXECUTE ON FUNCTION public.run_mrp_forecast(UUID,DATE,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_mrp_forecast_accuracy(p_forecast_run_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_mape NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  INSERT INTO public.mrp_forecast_accuracy_snapshots(tenant_id,item_id,model_id,period_start,period_end,forecast_qty,actual_qty)
  SELECT r.tenant_id,l.item_id,r.model_id,l.bucket_start,l.bucket_end,l.final_forecast_qty,COALESCE((SELECT SUM(h.quantity) FROM public.mrp_demand_history h WHERE h.tenant_id=r.tenant_id AND h.item_id=l.item_id AND h.demand_date BETWEEN l.bucket_start AND l.bucket_end AND h.demand_type IN ('historical_sales','confirmed_order','inventory_consumption')),0)
  FROM public.mrp_forecast_lines l JOIN public.mrp_forecast_runs r ON r.id=l.forecast_run_id AND r.tenant_id=l.tenant_id
  WHERE r.id=p_forecast_run_id AND r.tenant_id=v_tenant;
  SELECT AVG(mape_percent) INTO v_mape FROM public.mrp_forecast_accuracy_snapshots WHERE tenant_id=v_tenant AND model_id=(SELECT model_id FROM public.mrp_forecast_runs WHERE id=p_forecast_run_id AND tenant_id=v_tenant);
  UPDATE public.mrp_forecast_runs SET mape_percent=v_mape WHERE id=p_forecast_run_id AND tenant_id=v_tenant;
  RETURN v_mape;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_mrp_forecast_accuracy(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_mps_plan(p_plan_name TEXT,p_horizon_start DATE,p_horizon_end DATE,p_bucket TEXT DEFAULT 'weekly',p_plant_id UUID DEFAULT NULL,p_frozen_horizon_days INT DEFAULT 7)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF p_horizon_end < p_horizon_start THEN RAISE EXCEPTION 'INVALID_MPS_HORIZON'; END IF;
  INSERT INTO public.mrp_mps_plans(tenant_id,plan_number,plant_id,plan_name,horizon_start,horizon_end,bucket,frozen_horizon_days,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('mps_plan',NULL),p_plant_id,p_plan_name,p_horizon_start,p_horizon_end,COALESCE(p_bucket,'weekly'),COALESCE(p_frozen_horizon_days,7),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_mps_plan(TEXT,DATE,DATE,TEXT,UUID,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mps_from_forecast(p_mps_plan_id UUID,p_forecast_run_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_line RECORD; v_policy RECORD; v_begin NUMERIC; v_sched NUMERIC; v_mps NUMERIC; v_end NUMERIC; v_count INT:=0; v_plan RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  SELECT * INTO v_plan FROM public.mrp_mps_plans WHERE id=p_mps_plan_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'MPS_PLAN_NOT_FOUND'; END IF;
  FOR v_line IN SELECT * FROM public.mrp_forecast_lines WHERE forecast_run_id=p_forecast_run_id AND tenant_id=v_tenant LOOP
    SELECT * INTO v_policy FROM public.mrp_product_planning_policies WHERE tenant_id=v_tenant AND item_id=v_line.item_id AND is_active;
    SELECT COALESCE(SUM(available_qty),0) INTO v_begin FROM public.inventory_stock_balances WHERE tenant_id=v_tenant AND item_id=v_line.item_id;
    v_sched := 0;
    v_mps := GREATEST(v_line.final_forecast_qty + COALESCE(v_line.confirmed_qty,0) + COALESCE(v_policy.safety_stock_qty,0) - v_begin - v_sched,0);
    IF COALESCE(v_policy.order_multiple,1)>1 AND v_mps>0 THEN v_mps := CEIL(v_mps/v_policy.order_multiple)*v_policy.order_multiple; END IF;
    v_end := v_begin + v_sched + v_mps - GREATEST(v_line.final_forecast_qty,COALESCE(v_line.confirmed_qty,0));
    INSERT INTO public.mrp_mps_lines(tenant_id,mps_plan_id,item_id,bucket_start,bucket_end,forecast_qty,confirmed_order_qty,beginning_inventory_qty,scheduled_receipts_qty,safety_stock_qty,mps_qty,ending_inventory_qty,strategy,is_frozen)
    VALUES(v_tenant,p_mps_plan_id,v_line.item_id,v_line.bucket_start,v_line.bucket_end,v_line.final_forecast_qty,COALESCE(v_line.confirmed_qty,0),v_begin,v_sched,COALESCE(v_policy.safety_stock_qty,0),v_mps,v_end,COALESCE(v_policy.strategy,'MTS'),v_line.bucket_start <= CURRENT_DATE + v_plan.frozen_horizon_days)
    ON CONFLICT (tenant_id,mps_plan_id,item_id,bucket_start) DO UPDATE SET forecast_qty=EXCLUDED.forecast_qty,confirmed_order_qty=EXCLUDED.confirmed_order_qty,mps_qty=EXCLUDED.mps_qty,ending_inventory_qty=EXCLUDED.ending_inventory_qty;
    v_count:=v_count+1;
  END LOOP;
  UPDATE public.mrp_mps_plans SET status='simulated',source_forecast_run_id=p_forecast_run_id WHERE id=p_mps_plan_id AND tenant_id=v_tenant;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mps_from_forecast(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.override_mps_line(p_mps_line_id UUID,p_new_mps_qty NUMERIC,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'OVERRIDE_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.mrp_mps_lines WHERE id=p_mps_line_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MPS_LINE_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_mps_overrides(tenant_id,mps_line_id,old_mps_qty,new_mps_qty,reason,actor_id) VALUES(v_tenant,p_mps_line_id,v_old.mps_qty,p_new_mps_qty,p_reason,auth.uid());
  UPDATE public.mrp_mps_lines SET mps_qty=p_new_mps_qty,override_reason=p_reason,status='firmed' WHERE id=p_mps_line_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.override_mps_line(UUID,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_mps_rccp(p_mps_plan_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_run UUID; v_l RECORD; v_wc UUID; v_req NUMERIC; v_avail NUMERIC; v_over INT:=0;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  INSERT INTO public.mrp_rccp_runs(tenant_id,run_number,mps_plan_id,created_by) VALUES(v_tenant,public.generate_mrp_next_code('rccp_run',NULL),p_mps_plan_id,auth.uid()) RETURNING id INTO v_run;
  FOR v_l IN SELECT * FROM public.mrp_mps_lines WHERE tenant_id=v_tenant AND mps_plan_id=p_mps_plan_id LOOP
    SELECT default_work_center_id INTO v_wc FROM public.mrp_product_planning_policies WHERE tenant_id=v_tenant AND item_id=v_l.item_id;
    IF v_wc IS NULL THEN SELECT id INTO v_wc FROM public.work_centers WHERE tenant_id=v_tenant AND status='active' LIMIT 1; END IF;
    v_req := v_l.mps_qty * 60;
    SELECT COALESCE(SUM(available_minutes),0) INTO v_avail FROM public.work_center_shift_capacity WHERE tenant_id=v_tenant AND work_center_id=v_wc AND work_date BETWEEN v_l.bucket_start AND v_l.bucket_end;
    INSERT INTO public.mrp_rccp_lines(tenant_id,rccp_run_id,work_center_id,item_id,bucket_start,bucket_end,required_minutes,available_minutes,status,recommendation)
    VALUES(v_tenant,v_run,v_wc,v_l.item_id,v_l.bucket_start,v_l.bucket_end,v_req,v_avail,CASE WHEN v_avail=0 THEN 'no_capacity' WHEN v_req>v_avail THEN 'overloaded' ELSE 'available' END,CASE WHEN v_avail=0 THEN 'define_capacity' WHEN v_req>v_avail THEN 'add_shift_or_subcontract_or_reduce_mps' ELSE 'capacity_ok' END);
    IF v_avail=0 OR v_req>v_avail THEN v_over:=v_over+1; END IF;
  END LOOP;
  UPDATE public.mrp_rccp_runs SET overloaded_work_centers=v_over WHERE id=v_run AND tenant_id=v_tenant;
  RETURN v_run;
END $$;
GRANT EXECUTE ON FUNCTION public.run_mps_rccp(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_mps_plan(p_mps_plan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','production_manager']::TEXT[]);
  UPDATE public.mrp_mps_plans SET status='approved',approved_by=auth.uid(),approved_at=NOW() WHERE id=p_mps_plan_id AND tenant_id=v_tenant AND status IN ('simulated','firmed','draft');
  IF NOT FOUND THEN RAISE EXCEPTION 'MPS_PLAN_NOT_APPROVABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_mps_plan(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mps_alerts(p_mps_plan_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  INSERT INTO public.mrp_mps_alerts(tenant_id,mps_plan_id,item_id,alert_type,severity,title,body)
  SELECT v_tenant,p_mps_plan_id,item_id,'stockout_risk','warning','خطر نقص مخزون','المخزون النهائي أقل من مخزون الأمان'
  FROM public.mrp_mps_lines WHERE tenant_id=v_tenant AND mps_plan_id=p_mps_plan_id AND ending_inventory_qty < safety_stock_qty;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.mrp_mps_alerts(tenant_id,mps_plan_id,item_id,alert_type,severity,title,body)
  SELECT v_tenant,p_mps_plan_id,item_id,'frozen_change','info','سطر داخل الفترة المجمدة','راجع أي تعديل داخل frozen horizon'
  FROM public.mrp_mps_lines WHERE tenant_id=v_tenant AND mps_plan_id=p_mps_plan_id AND is_frozen;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mps_alerts(UUID) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_product_planning_policies','mrp_demand_history','mrp_forecast_models','mrp_forecast_runs','mrp_forecast_lines','mrp_forecast_overrides','mrp_forecast_accuracy_snapshots','mrp_mps_plans','mrp_mps_lines','mrp_mps_overrides','mrp_rccp_runs','mrp_rccp_lines','mrp_mps_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_forecast_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_forecast_models WHERE tenant_id=public.current_user_tenant_id() AND status='active') AS active_models,
  (SELECT COUNT(*) FROM public.mrp_forecast_runs WHERE tenant_id=public.current_user_tenant_id()) AS forecast_runs,
  (SELECT AVG(mape_percent) FROM public.mrp_forecast_runs WHERE tenant_id=public.current_user_tenant_id() AND mape_percent IS NOT NULL) AS avg_mape,
  (SELECT COUNT(*) FROM public.mrp_mps_plans WHERE tenant_id=public.current_user_tenant_id() AND status IN ('draft','simulated','firmed')) AS open_mps_plans;
GRANT SELECT ON public.mrp_forecast_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_forecast_accuracy_report WITH (security_invoker=true) AS
SELECT s.tenant_id,s.item_id,i.item_code,i.name_ar AS item_name,s.period_start,s.period_end,s.forecast_qty,s.actual_qty,s.mape_percent,s.quality_band
FROM public.mrp_forecast_accuracy_snapshots s JOIN public.inventory_items i ON i.id=s.item_id AND i.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_forecast_accuracy_report TO authenticated;

CREATE OR REPLACE VIEW public.mrp_mps_board WITH (security_invoker=true) AS
SELECT l.tenant_id,p.plan_number,p.plan_name,p.status AS plan_status,l.id AS mps_line_id,l.item_id,i.item_code,i.name_ar AS item_name,l.bucket_start,l.bucket_end,l.forecast_qty,l.confirmed_order_qty,l.gross_demand_qty,l.beginning_inventory_qty,l.safety_stock_qty,l.mps_qty,l.ending_inventory_qty,l.strategy,l.is_frozen,l.status
FROM public.mrp_mps_lines l JOIN public.mrp_mps_plans p ON p.id=l.mps_plan_id AND p.tenant_id=l.tenant_id JOIN public.inventory_items i ON i.id=l.item_id AND i.tenant_id=l.tenant_id
WHERE l.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_mps_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_rccp_load_report WITH (security_invoker=true) AS
SELECT r.tenant_id,r.run_number,wc.work_center_code,wc.name_ar AS work_center_name,l.bucket_start,l.bucket_end,l.required_minutes,l.available_minutes,l.utilization_percent,l.status,l.recommendation
FROM public.mrp_rccp_lines l JOIN public.mrp_rccp_runs r ON r.id=l.rccp_run_id AND r.tenant_id=l.tenant_id LEFT JOIN public.work_centers wc ON wc.id=l.work_center_id AND wc.tenant_id=l.tenant_id
WHERE l.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_rccp_load_report TO authenticated;

CREATE OR REPLACE VIEW public.mrp_mps_alert_queue WITH (security_invoker=true) AS
SELECT * FROM public.mrp_mps_alerts WHERE tenant_id=public.current_user_tenant_id() AND status='open' ORDER BY CASE severity WHEN 'urgent' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC;
GRANT SELECT ON public.mrp_mps_alert_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_mps_kpis WITH (security_invoker=true) AS
SELECT p.tenant_id,COUNT(DISTINCT p.id) AS mps_plans,COUNT(l.id) AS mps_lines,SUM(l.mps_qty) AS total_mps_qty,ROUND(AVG(CASE WHEN l.safety_stock_qty=0 THEN 100 ELSE l.ending_inventory_qty/NULLIF(l.safety_stock_qty,0)*100 END),2) AS inventory_coverage_index,COUNT(a.id) FILTER (WHERE a.status='open') AS open_alerts
FROM public.mrp_mps_plans p LEFT JOIN public.mrp_mps_lines l ON l.mps_plan_id=p.id AND l.tenant_id=p.tenant_id LEFT JOIN public.mrp_mps_alerts a ON a.mps_plan_id=p.id AND a.tenant_id=p.tenant_id
WHERE p.tenant_id=public.current_user_tenant_id()
GROUP BY p.tenant_id;
GRANT SELECT ON public.mrp_mps_kpis TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_forecast_models') IS NULL OR to_regclass('public.mrp_mps_plans') IS NULL OR to_regprocedure('public.run_mrp_forecast(uuid,date,integer)') IS NULL THEN
    RAISE EXCEPTION '0220 failed: MRP Forecasting/MPS objects missing';
  END IF;
  RAISE NOTICE '✅ 0220: MRP demand forecasting and MPS applied';
END $$;
