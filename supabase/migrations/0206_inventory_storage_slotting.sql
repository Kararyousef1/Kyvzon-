-- ============================================================================
-- 0206 — Inventory Unit 02: Storage Management & Slotting Optimization
-- التوثيق: docs/inventory/02-storage-management-slotting.md
-- الملحق التقني: docs/inventory/02-storage-management-technical-checklist.md
-- يغطي: Warehouse hierarchy, ABC, Slotting, Directed Put-away, Replenishment,
-- Capacity, Heatmap, Slow Moving, Location Labels, Storage KPIs.
-- ============================================================================

ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS aisle_code TEXT;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS bay_code TEXT;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS level_code TEXT;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS bin_code TEXT;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS full_location_code TEXT;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS length_cm NUMERIC(12,3);
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS width_cm NUMERIC(12,3);
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS height_cm NUMERIC(12,3);
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS max_weight_kg NUMERIC(12,3);
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS allowed_item_types TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS storage_strategy TEXT DEFAULT 'dynamic' CHECK (storage_strategy IN ('fixed','dynamic','affinity','seasonal'));
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS is_golden_zone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS pick_sequence INT;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.inventory_abc_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  analysis_from DATE NOT NULL,
  analysis_to DATE NOT NULL,
  pick_count INT NOT NULL DEFAULT 0,
  movement_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  cumulative_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  abc_class TEXT NOT NULL CHECK (abc_class IN ('A','B','C')),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,item_id,analysis_from,analysis_to)
);

CREATE TABLE IF NOT EXISTS public.inventory_slotting_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  strategy_code TEXT NOT NULL,
  strategy_type TEXT NOT NULL CHECK (strategy_type IN ('fixed','dynamic','affinity','seasonal')),
  name_ar TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  rules JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,strategy_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_fixed_item_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  min_qty NUMERIC(16,4) DEFAULT 0,
  max_qty NUMERIC(16,4),
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,item_id,location_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_affinity_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  related_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  affinity_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,item_id,related_item_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_slotting_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  current_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  recommended_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('abc','capacity','affinity','seasonal','slow_moving','golden_zone')),
  reason TEXT NOT NULL,
  score NUMERIC(10,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','applied','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.inventory_replenishment_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  forward_location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  reserve_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  min_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  max_qty NUMERIC(16,4) NOT NULL,
  reorder_qty NUMERIC(16,4),
  policy_type TEXT NOT NULL DEFAULT 'min_max' CHECK (policy_type IN ('min_max','dynamic','manual')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,item_id,forward_location_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_replenishment_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_number TEXT NOT NULL,
  policy_id UUID REFERENCES public.inventory_replenishment_policies(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  from_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  to_location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','completed','cancelled')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,task_number)
);

ALTER TABLE public.inventory_replenishment_policies ADD COLUMN IF NOT EXISTS lead_time_minutes INT DEFAULT 45;
ALTER TABLE public.inventory_replenishment_policies ADD COLUMN IF NOT EXISTS demand_window_hours INT DEFAULT 4;
ALTER TABLE public.inventory_replenishment_policies ADD COLUMN IF NOT EXISTS safety_stock_qty NUMERIC(16,4) DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.inventory_location_label_prints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  label_payload JSONB NOT NULL,
  printer_name TEXT,
  printed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.inventory_location_numbering_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL, code_pattern TEXT NOT NULL DEFAULT '{WH}-{ZONE}-{AISLE}-{BAY}-{LEVEL}-{BIN}',
  odd_even_rule TEXT NOT NULL DEFAULT 'none' CHECK (odd_even_rule IN ('none','odd_right_even_left','odd_left_even_right')),
  starts_from TEXT NOT NULL DEFAULT 'shipping' CHECK (starts_from IN ('receiving','shipping','packing','custom')),
  pad_lengths JSONB NOT NULL DEFAULT '{"aisle":2,"bay":3,"level":2}'::JSONB, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id, warehouse_id, rule_name)
);

CREATE TABLE IF NOT EXISTS public.inventory_seasonal_slotting_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL, name_ar TEXT NOT NULL, season_name TEXT, starts_on DATE NOT NULL, ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','completed','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, activated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (ends_on >= starts_on), UNIQUE(tenant_id, plan_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_seasonal_slotting_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.inventory_seasonal_slotting_plans(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  current_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  seasonal_location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  reason TEXT, status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','moved','reverted','cancelled')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_task_interleaving_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL, name_ar TEXT NOT NULL, from_task_type TEXT NOT NULL, to_task_type TEXT NOT NULL,
  max_distance_score NUMERIC(10,4) DEFAULT 100, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id, rule_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_task_interleaving_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_task_table TEXT NOT NULL, source_task_id UUID NOT NULL, suggested_task_table TEXT NOT NULL, suggested_task_id UUID NOT NULL,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL, assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  score NUMERIC(10,4) NOT NULL DEFAULT 0, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','completed','cancelled')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_slow_moving_report_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_name TEXT NOT NULL, recipient_email TEXT NOT NULL, frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly','monthly','quarterly')),
  threshold_days INT NOT NULL DEFAULT 180, is_active BOOLEAN NOT NULL DEFAULT true, last_sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, report_name, recipient_email)
);

CREATE TABLE IF NOT EXISTS public.inventory_slow_moving_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.inventory_slow_moving_report_subscriptions(id) ON DELETE SET NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), threshold_days INT NOT NULL, item_count INT NOT NULL DEFAULT 0,
  report_payload JSONB NOT NULL DEFAULT '{}'::JSONB, status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','sent','failed')), error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_abc_item ON public.inventory_abc_classifications(tenant_id,item_id,calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_slotting_recs_status ON public.inventory_slotting_recommendations(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_replenishment_tasks_status ON public.inventory_replenishment_tasks(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_interleaving_status ON public.inventory_task_interleaving_suggestions(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_seasonal_plans_status ON public.inventory_seasonal_slotting_plans(tenant_id,status,starts_on,ends_on);

CREATE OR REPLACE FUNCTION public.refresh_inventory_abc_classification(p_days INT DEFAULT 90)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_from DATE := CURRENT_DATE - COALESCE(p_days,90);
  v_to DATE := CURRENT_DATE;
  v_total NUMERIC;
  v_count INT := 0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT COALESCE(COUNT(*),0) INTO v_total
  FROM public.inventory_stock_movements
  WHERE tenant_id=v_tenant AND movement_type IN ('issue','pick','ship') AND movement_date::DATE BETWEEN v_from AND v_to;

  DELETE FROM public.inventory_abc_classifications WHERE tenant_id=v_tenant AND analysis_from=v_from AND analysis_to=v_to;

  WITH item_counts AS (
    SELECT item_id, COUNT(*)::INT AS pick_count
    FROM public.inventory_stock_movements
    WHERE tenant_id=v_tenant AND movement_type IN ('issue','pick','ship') AND movement_date::DATE BETWEEN v_from AND v_to
    GROUP BY item_id
  ), ranked AS (
    SELECT item_id, pick_count,
      CASE WHEN v_total>0 THEN pick_count::NUMERIC/v_total*100 ELSE 0 END AS movement_percent,
      SUM(CASE WHEN v_total>0 THEN pick_count::NUMERIC/v_total*100 ELSE 0 END) OVER (ORDER BY pick_count DESC ROWS UNBOUNDED PRECEDING) AS cumulative_percent
    FROM item_counts
  )
  INSERT INTO public.inventory_abc_classifications(tenant_id,item_id,analysis_from,analysis_to,pick_count,movement_percent,cumulative_percent,abc_class)
  SELECT v_tenant,item_id,v_from,v_to,pick_count,movement_percent,cumulative_percent,
    CASE WHEN cumulative_percent <= 80 THEN 'A' WHEN cumulative_percent <= 95 THEN 'B' ELSE 'C' END
  FROM ranked;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_inventory_abc_classification(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.suggest_inventory_putaway_location(
  p_item_id UUID,
  p_warehouse_id UUID,
  p_quantity NUMERIC DEFAULT 1
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_item RECORD;
  v_abc TEXT;
  v_location UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_item FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  SELECT abc_class INTO v_abc FROM public.inventory_abc_classifications WHERE tenant_id=v_tenant AND item_id=p_item_id ORDER BY calculated_at DESC LIMIT 1;

  -- Fixed location first
  SELECT fl.location_id INTO v_location
  FROM public.inventory_fixed_item_locations fl
  JOIN public.inventory_locations l ON l.id=fl.location_id AND l.tenant_id=fl.tenant_id
  WHERE fl.tenant_id=v_tenant AND fl.item_id=p_item_id AND l.warehouse_id=p_warehouse_id AND l.status='active'
  ORDER BY fl.is_primary DESC
  LIMIT 1;
  IF v_location IS NOT NULL THEN RETURN v_location; END IF;

  -- Dynamic directed putaway: A class gets golden zone, then capacity/sequence.
  SELECT l.id INTO v_location
  FROM public.inventory_locations l
  LEFT JOIN public.inventory_stock_balances b ON b.location_id=l.id AND b.tenant_id=l.tenant_id
  WHERE l.tenant_id=v_tenant AND l.warehouse_id=p_warehouse_id AND l.status='active'
    AND (array_length(l.allowed_item_types,1) IS NULL OR v_item.item_type = ANY(l.allowed_item_types))
    AND (l.max_capacity IS NULL OR COALESCE(l.current_capacity_used,0) + COALESCE(p_quantity,1) <= l.max_capacity)
  GROUP BY l.id,l.is_golden_zone,l.pick_sequence,l.current_capacity_used,l.max_capacity
  ORDER BY CASE WHEN v_abc='A' AND l.is_golden_zone THEN 0 ELSE 1 END, COALESCE(l.pick_sequence,999999), COALESCE(l.current_capacity_used / NULLIF(l.max_capacity,0),0)
  LIMIT 1;

  IF v_location IS NULL THEN RAISE EXCEPTION 'NO_SUITABLE_LOCATION_FOUND'; END IF;
  RETURN v_location;
END $$;
GRANT EXECUTE ON FUNCTION public.suggest_inventory_putaway_location(UUID,UUID,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_slotting_recommendations()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_slotting_recommendations(tenant_id,item_id,current_location_id,recommended_location_id,recommendation_type,reason,score)
  SELECT DISTINCT
    v_tenant,
    b.item_id,
    b.location_id,
    (SELECT l2.id FROM public.inventory_locations l2 WHERE l2.tenant_id=v_tenant AND l2.warehouse_id=b.warehouse_id AND l2.is_golden_zone AND l2.status='active' ORDER BY COALESCE(l2.pick_sequence,999999) LIMIT 1),
    'golden_zone',
    'الصنف مصنف A ويستحق موقعاً في Golden Zone',
    90
  FROM public.inventory_stock_balances b
  JOIN public.inventory_abc_classifications abc ON abc.item_id=b.item_id AND abc.tenant_id=b.tenant_id
  LEFT JOIN public.inventory_locations l ON l.id=b.location_id AND l.tenant_id=b.tenant_id
  WHERE b.tenant_id=v_tenant AND abc.abc_class='A' AND COALESCE(l.is_golden_zone,false)=false
    AND NOT EXISTS (SELECT 1 FROM public.inventory_slotting_recommendations r WHERE r.tenant_id=v_tenant AND r.item_id=b.item_id AND r.status='open' AND r.recommendation_type='golden_zone');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_slotting_recommendations() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_replenishment_tasks()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_replenishment_tasks(tenant_id,task_number,policy_id,item_id,from_location_id,to_location_id,quantity,priority)
  SELECT v_tenant,
    public.inventory_next_number('REP'),
    p.id,
    p.item_id,
    p.reserve_location_id,
    p.forward_location_id,
    GREATEST(COALESCE(p.reorder_qty, p.max_qty - COALESCE(b.available_qty,0)), 0),
    CASE WHEN COALESCE(b.available_qty,0)<=0 THEN 'critical' ELSE 'normal' END
  FROM public.inventory_replenishment_policies p
  LEFT JOIN public.inventory_stock_balances b ON b.tenant_id=p.tenant_id AND b.item_id=p.item_id AND b.location_id=p.forward_location_id
  WHERE p.tenant_id=v_tenant AND p.is_active AND COALESCE(b.available_qty,0) <= p.min_qty
    AND GREATEST(COALESCE(p.reorder_qty, p.max_qty - COALESCE(b.available_qty,0)), 0) > 0
    AND NOT EXISTS (SELECT 1 FROM public.inventory_replenishment_tasks t WHERE t.tenant_id=v_tenant AND t.policy_id=p.id AND t.status IN ('open','assigned'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_replenishment_tasks() TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_inventory_replenishment_task(p_task_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_wh UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_replenishment_tasks WHERE id=p_task_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPLENISHMENT_TASK_NOT_FOUND'; END IF;
  IF v_task.status NOT IN ('open','assigned') THEN RAISE EXCEPTION 'TASK_NOT_COMPLETABLE'; END IF;
  SELECT warehouse_id INTO v_wh FROM public.inventory_locations WHERE id=v_task.to_location_id AND tenant_id=v_tenant;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'TARGET_LOCATION_NOT_FOUND'; END IF;
  IF v_task.from_location_id IS NOT NULL THEN
    PERFORM public.post_inventory_movement('issue', v_task.item_id, v_wh, v_task.from_location_id, v_task.quantity, 'inventory_replenishment_tasks', p_task_id, 'replenishment_out');
  END IF;
  PERFORM public.post_inventory_movement('putaway', v_task.item_id, v_wh, v_task.to_location_id, v_task.quantity, 'inventory_replenishment_tasks', p_task_id, 'replenishment_in');
  UPDATE public.inventory_replenishment_tasks SET status='completed', completed_by=auth.uid(), completed_at=NOW() WHERE id=p_task_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_inventory_replenishment_task(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.print_inventory_location_label(p_location_id UUID, p_printer_name TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_loc RECORD; v_payload JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_loc FROM public.inventory_locations WHERE id=p_location_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOCATION_NOT_FOUND'; END IF;
  v_payload := jsonb_build_object('location_id',v_loc.id,'location_code',v_loc.location_code,'full_location_code',COALESCE(v_loc.full_location_code,v_loc.location_code),'barcode',COALESCE(v_loc.barcode,v_loc.location_code),'warehouse_id',v_loc.warehouse_id,'printed_at',NOW());
  INSERT INTO public.inventory_location_label_prints(tenant_id,location_id,label_payload,printer_name,printed_by)
  VALUES(v_tenant,p_location_id,v_payload,p_printer_name,auth.uid());
  RETURN v_payload;
END $$;
GRANT EXECUTE ON FUNCTION public.print_inventory_location_label(UUID,TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.generate_inventory_location_code(p_warehouse_id UUID,p_zone_id UUID,p_aisle TEXT,p_bay TEXT,p_level TEXT,p_bin TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_wh TEXT; v_zone TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT warehouse_code INTO v_wh FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  SELECT zone_code INTO v_zone FROM public.inventory_zones WHERE id=p_zone_id AND tenant_id=v_tenant;
  RETURN v_wh || '-' || COALESCE(v_zone,'Z') || '-' || lpad(COALESCE(p_aisle,'0'),2,'0') || '-' || lpad(COALESCE(p_bay,'0'),3,'0') || '-' || lpad(COALESCE(p_level,'0'),2,'0') || '-' || COALESCE(p_bin,'A');
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_location_code(UUID,UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_inventory_affinity_rules(p_days INT DEFAULT 180)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_from TIMESTAMPTZ:=NOW()-(COALESCE(p_days,180)||' days')::INTERVAL; v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  DELETE FROM public.inventory_affinity_rules WHERE tenant_id=v_tenant;
  WITH refs AS (
    SELECT reference_type, reference_id, item_id FROM public.inventory_stock_movements
    WHERE tenant_id=v_tenant AND reference_id IS NOT NULL AND movement_date>=v_from AND movement_type IN ('issue','pick','ship') GROUP BY reference_type, reference_id, item_id
  ), pairs AS (
    SELECT a.item_id, b.item_id AS related_item_id, COUNT(*)::NUMERIC AS together_count FROM refs a JOIN refs b ON a.reference_type=b.reference_type AND a.reference_id=b.reference_id AND a.item_id<>b.item_id GROUP BY a.item_id,b.item_id
  ), base AS (SELECT item_id, COUNT(*)::NUMERIC AS total_refs FROM refs GROUP BY item_id)
  INSERT INTO public.inventory_affinity_rules(tenant_id,item_id,related_item_id,affinity_score,evidence)
  SELECT v_tenant,p.item_id,p.related_item_id,ROUND((p.together_count/NULLIF(b.total_refs,0))*100,4),jsonb_build_object('together_count',p.together_count,'base_count',b.total_refs,'days',p_days)
  FROM pairs p JOIN base b ON b.item_id=p.item_id WHERE p.together_count > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_inventory_affinity_rules(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_inventory_seasonal_slotting_plan(p_plan_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_seasonal_slotting_plans WHERE id=p_plan_id AND tenant_id=v_tenant AND status IN ('draft','scheduled')) THEN RAISE EXCEPTION 'SEASONAL_PLAN_NOT_ACTIVATABLE'; END IF;
  UPDATE public.inventory_seasonal_slotting_plans SET status='active', activated_by=auth.uid(), activated_at=NOW() WHERE id=p_plan_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_slotting_recommendations(tenant_id,item_id,current_location_id,recommended_location_id,recommendation_type,reason,score)
  SELECT v_tenant,item_id,current_location_id,seasonal_location_id,'seasonal','اقتراح موسمي من خطة slotting',95 FROM public.inventory_seasonal_slotting_lines WHERE tenant_id=v_tenant AND plan_id=p_plan_id AND status='planned';
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.activate_inventory_seasonal_slotting_plan(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_dynamic_replenishment_tasks()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_replenishment_tasks(tenant_id,task_number,policy_id,item_id,from_location_id,to_location_id,quantity,priority)
  SELECT v_tenant, public.inventory_next_number('DREP'), p.id, p.item_id, p.reserve_location_id, p.forward_location_id,
    GREATEST(COALESCE(p.reorder_qty, p.max_qty - COALESCE(b.available_qty,0)),0), CASE WHEN COALESCE(b.available_qty,0) <= COALESCE(p.safety_stock_qty,0) THEN 'critical' ELSE 'urgent' END
  FROM public.inventory_replenishment_policies p
  LEFT JOIN public.inventory_stock_balances b ON b.tenant_id=p.tenant_id AND b.item_id=p.item_id AND b.location_id=p.forward_location_id
  LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity),0)/NULLIF(p.demand_window_hours,0) AS hourly_demand FROM public.inventory_stock_movements m WHERE m.tenant_id=p.tenant_id AND m.item_id=p.item_id AND m.movement_type IN ('issue','pick','ship') AND m.movement_date >= NOW()-(p.demand_window_hours||' hours')::INTERVAL) d ON true
  WHERE p.tenant_id=v_tenant AND p.is_active AND p.policy_type IN ('dynamic','min_max')
    AND (COALESCE(b.available_qty,0) - COALESCE(d.hourly_demand,0) * (p.lead_time_minutes::NUMERIC/60)) <= (p.min_qty + COALESCE(p.safety_stock_qty,0))
    AND NOT EXISTS (SELECT 1 FROM public.inventory_replenishment_tasks t WHERE t.tenant_id=v_tenant AND t.policy_id=p.id AND t.status IN ('open','assigned'));
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_dynamic_replenishment_tasks() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_task_interleaving_suggestions(p_assigned_to UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_task_interleaving_suggestions(tenant_id,source_task_table,source_task_id,suggested_task_table,suggested_task_id,warehouse_id,assigned_to,score,reason)
  SELECT v_tenant,'inventory_putaway_tasks',p.id,'inventory_replenishment_tasks',r.id,p.warehouse_id,COALESCE(p.assigned_to,r.assigned_to),80,'دمج Put-away مع Replenishment في نفس المستودع لتقليل الحركة غير المنتجة'
  FROM public.inventory_putaway_tasks p JOIN public.inventory_replenishment_tasks r ON r.tenant_id=p.tenant_id AND r.status IN ('open','assigned')
  JOIN public.inventory_locations tl ON tl.id=r.to_location_id AND tl.tenant_id=r.tenant_id AND tl.warehouse_id=p.warehouse_id
  WHERE p.tenant_id=v_tenant AND p.status IN ('open','assigned') AND (p_assigned_to IS NULL OR p.assigned_to=p_assigned_to OR r.assigned_to=p_assigned_to)
    AND NOT EXISTS (SELECT 1 FROM public.inventory_task_interleaving_suggestions sx WHERE sx.tenant_id=v_tenant AND sx.source_task_id=p.id AND sx.suggested_task_id=r.id AND sx.status='open');
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_task_interleaving_suggestions(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_slow_moving_report_run(p_subscription_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_sub RECORD; v_id UUID; v_payload JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_sub FROM public.inventory_slow_moving_report_subscriptions WHERE id=p_subscription_id AND tenant_id=v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'SLOW_MOVING_SUBSCRIPTION_NOT_FOUND'; END IF;
  SELECT jsonb_agg(to_jsonb(x)) INTO v_payload FROM (SELECT * FROM public.inventory_slow_moving_report WHERE tenant_id=v_tenant AND days_without_movement>=v_sub.threshold_days LIMIT 500) x;
  INSERT INTO public.inventory_slow_moving_report_runs(tenant_id,subscription_id,threshold_days,item_count,report_payload)
  VALUES(v_tenant,p_subscription_id,v_sub.threshold_days,COALESCE(jsonb_array_length(COALESCE(v_payload,'[]'::jsonb)),0),COALESCE(v_payload,'[]'::jsonb)) RETURNING id INTO v_id;
  UPDATE public.inventory_slow_moving_report_subscriptions SET last_sent_at=NOW() WHERE id=p_subscription_id AND tenant_id=v_tenant; RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_slow_moving_report_run(UUID) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_abc_classifications','inventory_slotting_strategies','inventory_fixed_item_locations','inventory_affinity_rules','inventory_slotting_recommendations','inventory_replenishment_policies','inventory_replenishment_tasks','inventory_location_label_prints','inventory_location_numbering_rules','inventory_seasonal_slotting_plans','inventory_seasonal_slotting_lines','inventory_task_interleaving_rules','inventory_task_interleaving_suggestions','inventory_slow_moving_report_subscriptions','inventory_slow_moving_report_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_location_map WITH (security_invoker=true) AS
SELECT
  l.tenant_id,l.id AS location_id,l.warehouse_id,w.warehouse_code,l.zone_id,z.zone_code,l.location_code,COALESCE(l.full_location_code,l.location_code) AS full_location_code,
  l.location_type,l.status,l.aisle_code,l.bay_code,l.level_code,l.bin_code,l.barcode,l.is_golden_zone,l.pick_sequence,
  l.max_capacity,l.current_capacity_used,
  CASE WHEN l.max_capacity IS NOT NULL AND l.max_capacity>0 THEN ROUND(l.current_capacity_used/l.max_capacity*100,2) ELSE NULL END AS capacity_percent,
  COALESCE(SUM(b.on_hand_qty),0) AS on_hand_qty,
  COUNT(DISTINCT b.item_id) AS item_count
FROM public.inventory_locations l
JOIN public.inventory_warehouses w ON w.id=l.warehouse_id AND w.tenant_id=l.tenant_id
LEFT JOIN public.inventory_zones z ON z.id=l.zone_id AND z.tenant_id=l.tenant_id
LEFT JOIN public.inventory_stock_balances b ON b.location_id=l.id AND b.tenant_id=l.tenant_id
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id,l.id,w.warehouse_code,z.zone_code;
GRANT SELECT ON public.inventory_location_map TO authenticated;

CREATE OR REPLACE VIEW public.inventory_location_heatmap WITH (security_invoker=true) AS
SELECT
  l.tenant_id,l.id AS location_id,l.location_code,l.warehouse_id,
  COUNT(m.id) FILTER (WHERE m.movement_date >= NOW()-INTERVAL '30 days') AS movement_30d,
  COUNT(m.id) FILTER (WHERE m.movement_date >= NOW()-INTERVAL '7 days') AS movement_7d,
  CASE
    WHEN COUNT(m.id) FILTER (WHERE m.movement_date >= NOW()-INTERVAL '30 days') >= 100 THEN 'hot'
    WHEN COUNT(m.id) FILTER (WHERE m.movement_date >= NOW()-INTERVAL '30 days') >= 20 THEN 'warm'
    ELSE 'cold'
  END AS heat_level
FROM public.inventory_locations l
LEFT JOIN public.inventory_stock_movements m ON m.location_id=l.id AND m.tenant_id=l.tenant_id
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id,l.id,l.location_code,l.warehouse_id;
GRANT SELECT ON public.inventory_location_heatmap TO authenticated;

CREATE OR REPLACE VIEW public.inventory_capacity_report WITH (security_invoker=true) AS
SELECT
  l.tenant_id,l.warehouse_id,w.warehouse_code,
  COUNT(*) AS location_count,
  COALESCE(SUM(l.max_capacity),0) AS total_capacity,
  COALESCE(SUM(l.current_capacity_used),0) AS used_capacity,
  ROUND(COALESCE(SUM(l.current_capacity_used),0)/NULLIF(COALESCE(SUM(l.max_capacity),0),0)*100,2) AS capacity_percent
FROM public.inventory_locations l
JOIN public.inventory_warehouses w ON w.id=l.warehouse_id AND w.tenant_id=l.tenant_id
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id,l.warehouse_id,w.warehouse_code;
GRANT SELECT ON public.inventory_capacity_report TO authenticated;

CREATE OR REPLACE VIEW public.inventory_capacity_alerts WITH (security_invoker=true) AS
SELECT *, CASE WHEN capacity_percent >= 90 THEN 'critical' WHEN capacity_percent >= 85 THEN 'warning' ELSE 'ok' END AS alert_level
FROM public.inventory_capacity_report
WHERE capacity_percent >= 85;
GRANT SELECT ON public.inventory_capacity_alerts TO authenticated;

CREATE OR REPLACE VIEW public.inventory_slow_moving_report WITH (security_invoker=true) AS
SELECT
  i.tenant_id,i.id AS item_id,i.item_code,i.name_ar AS item_name,
  MAX(m.movement_date) AS last_movement_at,
  EXTRACT(DAY FROM (NOW() - COALESCE(MAX(m.movement_date), i.created_at)))::INT AS days_without_movement,
  COALESCE(SUM(b.on_hand_qty),0) AS on_hand_qty
FROM public.inventory_items i
LEFT JOIN public.inventory_stock_movements m ON m.item_id=i.id AND m.tenant_id=i.tenant_id
LEFT JOIN public.inventory_stock_balances b ON b.item_id=i.id AND b.tenant_id=i.tenant_id
WHERE i.tenant_id=public.current_user_tenant_id()
GROUP BY i.tenant_id,i.id,i.item_code,i.name_ar,i.created_at
HAVING EXTRACT(DAY FROM (NOW() - COALESCE(MAX(m.movement_date), i.created_at))) >= 180;
GRANT SELECT ON public.inventory_slow_moving_report TO authenticated;

CREATE OR REPLACE VIEW public.inventory_storage_kpis WITH (security_invoker=true) AS
SELECT
  cr.tenant_id,
  ROUND(AVG(cr.capacity_percent),2) AS avg_space_utilization,
  COUNT(ca.*) FILTER (WHERE ca.alert_level='critical') AS critical_capacity_locations,
  (SELECT COUNT(*) FROM public.inventory_slotting_recommendations r WHERE r.tenant_id=cr.tenant_id AND r.status='open') AS open_slotting_recommendations,
  (SELECT COUNT(*) FROM public.inventory_replenishment_tasks t WHERE t.tenant_id=cr.tenant_id AND t.status IN ('open','assigned')) AS open_replenishment_tasks,
  (SELECT COUNT(*) FROM public.inventory_slow_moving_report s WHERE s.tenant_id=cr.tenant_id) AS slow_moving_items,
  (SELECT COUNT(*) FROM public.inventory_task_interleaving_suggestions q WHERE q.tenant_id=cr.tenant_id AND q.status='open') AS open_interleaving_suggestions,
  (SELECT COUNT(*) FROM public.inventory_seasonal_slotting_plans p WHERE p.tenant_id=cr.tenant_id AND p.status IN ('scheduled','active')) AS active_seasonal_plans
FROM public.inventory_capacity_report cr
LEFT JOIN public.inventory_capacity_alerts ca ON ca.tenant_id=cr.tenant_id AND ca.warehouse_id=cr.warehouse_id
WHERE cr.tenant_id=public.current_user_tenant_id()
GROUP BY cr.tenant_id;
GRANT SELECT ON public.inventory_storage_kpis TO authenticated;


CREATE OR REPLACE VIEW public.inventory_seasonal_slotting_status WITH (security_invoker=true) AS
SELECT p.tenant_id,p.id AS plan_id,p.plan_code,p.name_ar,p.season_name,p.starts_on,p.ends_on,p.status,COUNT(l.id) AS line_count
FROM public.inventory_seasonal_slotting_plans p LEFT JOIN public.inventory_seasonal_slotting_lines l ON l.plan_id=p.id AND l.tenant_id=p.tenant_id
WHERE p.tenant_id=public.current_user_tenant_id()
GROUP BY p.tenant_id,p.id,p.plan_code,p.name_ar,p.season_name,p.starts_on,p.ends_on,p.status;
GRANT SELECT ON public.inventory_seasonal_slotting_status TO authenticated;

CREATE OR REPLACE VIEW public.inventory_task_interleaving_queue WITH (security_invoker=true) AS
SELECT * FROM public.inventory_task_interleaving_suggestions
WHERE tenant_id=public.current_user_tenant_id() AND status='open'
ORDER BY score DESC, created_at ASC;
GRANT SELECT ON public.inventory_task_interleaving_queue TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_abc_classifications') IS NULL OR to_regclass('public.inventory_replenishment_tasks') IS NULL OR to_regclass('public.inventory_location_map') IS NULL OR to_regclass('public.inventory_task_interleaving_suggestions') IS NULL OR to_regclass('public.inventory_seasonal_slotting_plans') IS NULL THEN
    RAISE EXCEPTION '0206 failed: storage/slotting objects missing';
  END IF;
  IF to_regprocedure('public.suggest_inventory_putaway_location(uuid,uuid,numeric)') IS NULL OR to_regprocedure('public.refresh_inventory_affinity_rules(integer)') IS NULL OR to_regprocedure('public.generate_inventory_task_interleaving_suggestions(uuid)') IS NULL THEN
    RAISE EXCEPTION '0206 failed: directed putaway function missing';
  END IF;
  RAISE NOTICE '✅ 0206: Inventory storage management and slotting applied';
END $$;
