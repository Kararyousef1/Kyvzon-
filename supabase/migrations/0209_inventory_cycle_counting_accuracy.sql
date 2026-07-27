-- ============================================================================
-- 0209 — Inventory Unit 05: Cycle Counting & Inventory Accuracy
-- docs/inventory/05-cycle-counting-inventory-accuracy.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_cycle_count_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_number TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('abc','location','event','control_group','annual_wall_to_wall')),
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','counting','submitted','approved','posted','cancelled')),
  starts_on DATE,
  ends_on DATE,
  blind_count BOOLEAN NOT NULL DEFAULT true,
  double_count_threshold_percent NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  third_count_threshold_percent NUMERIC(8,4) NOT NULL DEFAULT 2.0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  UNIQUE(tenant_id,plan_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_cycle_count_plan_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.inventory_cycle_count_plans(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  abc_class TEXT CHECK (abc_class IS NULL OR abc_class IN ('A','B','C')),
  scheduled_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','assigned','counted','skipped','cancelled')),
  UNIQUE(tenant_id,plan_id,location_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_count_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_number TEXT NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.inventory_cycle_count_plans(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  count_round INT NOT NULL DEFAULT 1 CHECK (count_round IN (1,2,3)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','counted','variance_review','approved','posted','cancelled')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  counted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,task_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_count_task_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.inventory_count_tasks(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  system_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  counted_qty NUMERIC(16,4),
  variance_qty NUMERIC(16,4) GENERATED ALWAYS AS (COALESCE(counted_qty,0)-system_qty) STORED,
  variance_percent NUMERIC(12,6) GENERATED ALWAYS AS (CASE WHEN system_qty=0 THEN CASE WHEN counted_qty IS NULL OR counted_qty=0 THEN 0 ELSE 100 END ELSE ABS(COALESCE(counted_qty,0)-system_qty)/ABS(system_qty)*100 END) STORED,
  scan_location_value TEXT,
  scan_item_value TEXT,
  notes TEXT,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_count_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  count_line_id UUID NOT NULL REFERENCES public.inventory_count_task_lines(id) ON DELETE CASCADE,
  required_round INT NOT NULL CHECK (required_round IN (2,3)),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','completed','cancelled')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.inventory_variance_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  reason_category TEXT NOT NULL CHECK (reason_category IN ('human_error','theft_loss','damage_waste','system_error','unknown')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,reason_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_count_variances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  count_line_id UUID NOT NULL REFERENCES public.inventory_count_task_lines(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  variance_qty NUMERIC(16,4) NOT NULL,
  variance_abs_qty NUMERIC(16,4) NOT NULL,
  variance_percent NUMERIC(12,6) NOT NULL,
  reason_id UUID REFERENCES public.inventory_variance_reasons(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','recount_required','approval_required','approved','posted','rejected','investigation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.inventory_adjustment_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  variance_id UUID NOT NULL REFERENCES public.inventory_count_variances(id) ON DELETE CASCADE,
  required_role TEXT NOT NULL CHECK (required_role IN ('inventory','supervisor','manager','finance','admin')),
  approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected')),
  comments TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_count_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.inventory_cycle_count_plans(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  freeze_scope TEXT NOT NULL CHECK (freeze_scope IN ('warehouse','location','item')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.inventory_annual_count_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fiscal_year INT NOT NULL,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  planned_start TIMESTAMPTZ NOT NULL,
  planned_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','announced','frozen','counting','reconciled','posted','cancelled')),
  notification_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,fiscal_year,warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_tasks_status ON public.inventory_count_tasks(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_count_variances_status ON public.inventory_count_variances(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_freezes_active ON public.inventory_count_freezes(tenant_id,status,warehouse_id,location_id);

CREATE OR REPLACE FUNCTION public.generate_inventory_cycle_count_schedule(p_plan_type TEXT, p_warehouse_id UUID, p_days_ahead INT DEFAULT 30)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_plan UUID; v_loc RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF p_plan_type NOT IN ('abc','location','event','control_group','annual_wall_to_wall') THEN RAISE EXCEPTION 'INVALID_COUNT_PLAN_TYPE'; END IF;
  INSERT INTO public.inventory_cycle_count_plans(tenant_id,plan_number,plan_type,warehouse_id,status,starts_on,ends_on,created_by)
  VALUES(v_tenant,public.inventory_next_number('CCP'),p_plan_type,p_warehouse_id,'scheduled',CURRENT_DATE,CURRENT_DATE+COALESCE(p_days_ahead,30),auth.uid()) RETURNING id INTO v_plan;
  FOR v_loc IN
    SELECT l.id, COALESCE(abc.abc_class,'C') abc_class
    FROM public.inventory_locations l
    LEFT JOIN public.inventory_stock_balances b ON b.location_id=l.id AND b.tenant_id=l.tenant_id
    LEFT JOIN public.inventory_abc_classifications abc ON abc.item_id=b.item_id AND abc.tenant_id=b.tenant_id
    WHERE l.tenant_id=v_tenant AND (p_warehouse_id IS NULL OR l.warehouse_id=p_warehouse_id)
    GROUP BY l.id, COALESCE(abc.abc_class,'C')
    LIMIT 500
  LOOP
    INSERT INTO public.inventory_cycle_count_plan_locations(tenant_id,plan_id,location_id,abc_class,scheduled_date)
    VALUES(v_tenant,v_plan,v_loc.id,v_loc.abc_class, CURRENT_DATE + CASE v_loc.abc_class WHEN 'A' THEN 0 WHEN 'B' THEN 7 ELSE 14 END);
    INSERT INTO public.inventory_count_tasks(tenant_id,task_number,plan_id,location_id,count_round,status)
    VALUES(v_tenant,public.inventory_next_number('CCT'),v_plan,v_loc.id,1,'open');
  END LOOP;
  RETURN v_plan;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_cycle_count_schedule(TEXT,UUID,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_inventory_count(p_task_id UUID, p_item_id UUID, p_counted_qty NUMERIC, p_scan_location TEXT DEFAULT NULL, p_scan_item TEXT DEFAULT NULL, p_lot_id UUID DEFAULT NULL, p_lpn_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_bal RECORD; v_line UUID; v_var UUID; v_status TEXT; v_role TEXT; v_abs NUMERIC; v_pct NUMERIC;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_count_tasks WHERE id=p_task_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_TASK_NOT_FOUND'; END IF;
  SELECT * INTO v_bal FROM public.inventory_stock_balances WHERE tenant_id=v_tenant AND item_id=p_item_id AND location_id IS NOT DISTINCT FROM v_task.location_id AND lot_id IS NOT DISTINCT FROM p_lot_id AND lpn_id IS NOT DISTINCT FROM p_lpn_id LIMIT 1;
  INSERT INTO public.inventory_count_task_lines(tenant_id,task_id,item_id,warehouse_id,location_id,lot_id,lpn_id,system_qty,counted_qty,scan_location_value,scan_item_value,notes,counted_at)
  VALUES(v_tenant,p_task_id,p_item_id,COALESCE(v_bal.warehouse_id,(SELECT warehouse_id FROM public.inventory_locations WHERE id=v_task.location_id)),v_task.location_id,p_lot_id,p_lpn_id,COALESCE(v_bal.on_hand_qty,0),p_counted_qty,p_scan_location,p_scan_item,p_notes,NOW()) RETURNING id INTO v_line;
  SELECT ABS(variance_qty), variance_percent INTO v_abs, v_pct FROM public.inventory_count_task_lines WHERE id=v_line;
  IF v_pct > 2 THEN v_status := 'investigation';
  ELSIF v_pct > 0.5 THEN v_status := 'recount_required';
  ELSIF v_abs > 0 THEN v_status := 'approval_required';
  ELSE v_status := 'approved'; END IF;
  IF v_abs > 0 THEN
    INSERT INTO public.inventory_count_variances(tenant_id,count_line_id,item_id,warehouse_id,location_id,variance_qty,variance_abs_qty,variance_percent,status)
    SELECT v_tenant,id,item_id,warehouse_id,location_id,variance_qty,ABS(variance_qty),variance_percent,v_status FROM public.inventory_count_task_lines WHERE id=v_line RETURNING id INTO v_var;
    IF v_status='recount_required' THEN INSERT INTO public.inventory_count_verifications(tenant_id,count_line_id,required_round,reason) VALUES(v_tenant,v_line,2,'فرق أكبر من 0.5% يتطلب عدّاً ثانياً'); END IF;
    IF v_status='investigation' THEN INSERT INTO public.inventory_count_verifications(tenant_id,count_line_id,required_round,reason) VALUES(v_tenant,v_line,3,'فرق أكبر من 2% يتطلب عدّاً ثالثاً وتحقيقاً'); END IF;
    v_role := CASE WHEN v_abs <= 10 THEN 'inventory' WHEN v_abs <= 100 THEN 'supervisor' WHEN v_abs <= 500 THEN 'manager' ELSE 'finance' END;
    INSERT INTO public.inventory_adjustment_approvals(tenant_id,variance_id,required_role) VALUES(v_tenant,v_var,v_role);
  END IF;
  UPDATE public.inventory_count_tasks SET status=CASE WHEN v_status IN ('recount_required','investigation') THEN 'variance_review' ELSE 'counted' END, counted_by=auth.uid(), counted_at=NOW() WHERE id=p_task_id;
  RETURN v_line;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count(UUID,UUID,NUMERIC,TEXT,TEXT,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_inventory_recount(p_count_line_id UUID, p_required_round INT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_line RECORD; v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_line FROM public.inventory_count_task_lines WHERE id=p_count_line_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_LINE_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_count_verifications(tenant_id,count_line_id,required_round,reason) VALUES(v_tenant,p_count_line_id,p_required_round,'Manual recount request') RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_inventory_recount(UUID,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_inventory_adjustment(p_approval_id UUID, p_decision TEXT, p_comments TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_app RECORD; v_role TEXT:=public.current_user_role();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','finance']::TEXT[]);
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  SELECT * INTO v_app FROM public.inventory_adjustment_approvals WHERE id=p_approval_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPROVAL_NOT_FOUND'; END IF;
  IF NOT (v_role IN ('admin','developer','it_admin') OR v_role=v_app.required_role OR (v_app.required_role='supervisor' AND v_role IN ('manager','finance')) OR (v_app.required_role='manager' AND v_role='finance')) THEN RAISE EXCEPTION 'ROLE_NOT_ALLOWED_FOR_ADJUSTMENT'; END IF;
  UPDATE public.inventory_adjustment_approvals SET decision=p_decision,comments=p_comments,approver_id=auth.uid(),decided_at=NOW() WHERE id=p_approval_id AND tenant_id=v_tenant;
  UPDATE public.inventory_count_variances SET status=CASE WHEN p_decision='approved' THEN 'approved' ELSE 'rejected' END WHERE id=v_app.variance_id AND tenant_id=v_tenant;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_inventory_adjustment(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_inventory_count_adjustments(p_plan_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_var RECORD; v_count INT:=0; v_mtype TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  FOR v_var IN
    SELECT v.*, l.counted_qty, l.system_qty FROM public.inventory_count_variances v JOIN public.inventory_count_task_lines l ON l.id=v.count_line_id AND l.tenant_id=v.tenant_id JOIN public.inventory_count_tasks t ON t.id=l.task_id AND t.tenant_id=l.tenant_id WHERE t.plan_id=p_plan_id AND v.tenant_id=v_tenant AND v.status='approved'
  LOOP
    IF v_var.variance_qty <> 0 THEN
      PERFORM public.post_inventory_movement('adjustment', v_var.item_id, v_var.warehouse_id, v_var.location_id, v_var.variance_qty, 'inventory_count_variances', v_var.id, CASE WHEN v_var.variance_qty > 0 THEN 'cycle_count_positive' ELSE 'cycle_count_negative' END);
    END IF;
    UPDATE public.inventory_count_variances SET status='posted', resolved_at=NOW() WHERE id=v_var.id AND tenant_id=v_tenant;
    v_count := v_count + 1;
  END LOOP;
  UPDATE public.inventory_cycle_count_plans SET status='posted', posted_at=NOW() WHERE id=p_plan_id AND tenant_id=v_tenant;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.post_inventory_count_adjustments(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.freeze_inventory_for_count(p_plan_id UUID, p_warehouse_id UUID, p_location_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_count_freezes(tenant_id,plan_id,warehouse_id,location_id,freeze_scope,reason,created_by) VALUES(v_tenant,p_plan_id,p_warehouse_id,p_location_id,CASE WHEN p_location_id IS NULL THEN 'warehouse' ELSE 'location' END,COALESCE(p_reason,'count freeze'),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.freeze_inventory_for_count(UUID,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unfreeze_inventory_after_count(p_freeze_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  UPDATE public.inventory_count_freezes SET status='released', released_by=auth.uid(), released_at=NOW() WHERE id=p_freeze_id AND tenant_id=v_tenant AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'FREEZE_NOT_FOUND'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.unfreeze_inventory_after_count(UUID) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_cycle_count_plans','inventory_cycle_count_plan_locations','inventory_count_tasks','inventory_count_task_lines','inventory_count_verifications','inventory_variance_reasons','inventory_count_variances','inventory_adjustment_approvals','inventory_count_freezes','inventory_annual_count_plans'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''finance'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''finance'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''finance'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_variance_analysis WITH (security_invoker=true) AS
SELECT v.tenant_id, r.reason_category, COALESCE(r.name_ar,'غير مصنف') AS reason_name, COUNT(*) AS variance_count, SUM(v.variance_abs_qty) AS total_abs_variance, AVG(v.variance_percent) AS avg_variance_percent
FROM public.inventory_count_variances v LEFT JOIN public.inventory_variance_reasons r ON r.id=v.reason_id AND r.tenant_id=v.tenant_id
WHERE v.tenant_id=public.current_user_tenant_id()
GROUP BY v.tenant_id,r.reason_category,r.name_ar;
GRANT SELECT ON public.inventory_variance_analysis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_ira_dashboard WITH (security_invoker=true) AS
SELECT l.tenant_id,
  COUNT(*) AS counted_lines,
  COALESCE(SUM(ABS(l.variance_qty)),0) AS total_abs_variance,
  COALESCE(SUM(ABS(l.system_qty)),0) AS total_system_qty,
  ROUND((1 - COALESCE(SUM(ABS(l.variance_qty)),0)/NULLIF(COALESCE(SUM(ABS(l.system_qty)),0),0))*100,2) AS ira_percent,
  COUNT(*) FILTER (WHERE l.variance_percent > 2) AS major_variances
FROM public.inventory_count_task_lines l
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id;
GRANT SELECT ON public.inventory_ira_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_cycle_count_completion WITH (security_invoker=true) AS
SELECT p.tenant_id,p.id AS plan_id,p.plan_number,p.status,COUNT(t.id) AS task_count,COUNT(t.id) FILTER (WHERE t.status IN ('counted','approved','posted')) AS counted_count,
  ROUND(COUNT(t.id) FILTER (WHERE t.status IN ('counted','approved','posted'))::NUMERIC/NULLIF(COUNT(t.id),0)*100,2) AS completion_percent
FROM public.inventory_cycle_count_plans p LEFT JOIN public.inventory_count_tasks t ON t.plan_id=p.id AND t.tenant_id=p.tenant_id
WHERE p.tenant_id=public.current_user_tenant_id()
GROUP BY p.tenant_id,p.id,p.plan_number,p.status;
GRANT SELECT ON public.inventory_cycle_count_completion TO authenticated;

CREATE OR REPLACE VIEW public.inventory_expiry_count_report WITH (security_invoker=true) AS
SELECT * FROM public.inventory_expiry_alerts;
GRANT SELECT ON public.inventory_expiry_count_report TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_cycle_count_plans') IS NULL OR to_regclass('public.inventory_count_tasks') IS NULL OR to_regclass('public.inventory_ira_dashboard') IS NULL THEN
    RAISE EXCEPTION '0209 failed: cycle count objects missing';
  END IF;
  IF to_regprocedure('public.submit_inventory_count(uuid,uuid,numeric,text,text,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0209 failed: submit count function missing';
  END IF;
  RAISE NOTICE '✅ 0209: Inventory cycle counting and accuracy applied';
END $$;
