-- ============================================================================
-- 0228 — MRP Unit 10: Manufacturing Analytics
-- docs/mrp/10-manufacturing-analytics.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_manufacturing_kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_code TEXT NOT NULL,
  kpi_key TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'plant' CHECK (scope_type IN ('enterprise','plant','line','work_center','item')),
  scope_id UUID,
  target_value NUMERIC(18,6) NOT NULL,
  warning_threshold NUMERIC(18,6),
  critical_threshold NUMERIC(18,6),
  direction TEXT NOT NULL DEFAULT 'higher_better' CHECK (direction IN ('higher_better','lower_better','between')),
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,target_code)
);

CREATE TABLE IF NOT EXISTS public.mrp_manufacturing_kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_number TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_type TEXT NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily','weekly','monthly','quarterly')),
  kpi_key TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'enterprise',
  scope_id UUID,
  actual_value NUMERIC(18,6) NOT NULL DEFAULT 0,
  target_value NUMERIC(18,6),
  variance_value NUMERIC(18,6),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','warning','critical','no_target')),
  source_view TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,snapshot_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_manufacturing_analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_number TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('oee_drop','schedule_risk','cost_variance','scrap_spike','quality_risk','maintenance_risk','material_shortage','bottleneck','forecast_error')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','urgent','critical')),
  title TEXT NOT NULL,
  body TEXT,
  source_table TEXT,
  source_id UUID,
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed','dismissed')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  close_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,alert_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_manufacturing_predictive_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_number TEXT NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('capacity_risk','late_order_risk','quality_risk','maintenance_risk','cost_overrun_risk','inventory_shortage_risk')),
  confidence_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  impact_score NUMERIC(12,4) NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  explanation TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  alert_id UUID REFERENCES public.mrp_manufacturing_analytics_alerts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','converted_to_alert','closed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,insight_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_manufacturing_root_cause_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rca_number TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('downtime','quality','cost_variance','late_order','maintenance','manual')),
  source_id UUID,
  title TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '5_whys' CHECK (method IN ('5_whys','fishbone','pareto','8d','other')),
  root_cause_category TEXT CHECK (root_cause_category IS NULL OR root_cause_category IN ('materials','machines','methods','manpower','measurement','environment','management','unknown')),
  root_cause_text TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','verified','closed','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,rca_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_manufacturing_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('executive','production_performance','oee','cost_variance','quality','maintenance','schedule','custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,report_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_manufacturing_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  export_number TEXT NOT NULL,
  report_run_id UUID REFERENCES public.mrp_manufacturing_report_runs(id) ON DELETE SET NULL,
  export_format TEXT NOT NULL DEFAULT 'xlsx' CHECK (export_format IN ('xlsx','csv','pdf','json')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed','cancelled')),
  file_url TEXT,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,export_number)
);

CREATE OR REPLACE FUNCTION public.upsert_mrp_manufacturing_kpi_target(p_target_code TEXT,p_kpi_key TEXT,p_target_value NUMERIC,p_scope_type TEXT DEFAULT 'enterprise',p_scope_id UUID DEFAULT NULL,p_warning_threshold NUMERIC DEFAULT NULL,p_critical_threshold NUMERIC DEFAULT NULL,p_direction TEXT DEFAULT 'higher_better')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('manufacturing_kpi_target',p_target_code);
  INSERT INTO public.mrp_manufacturing_kpi_targets(tenant_id,target_code,kpi_key,scope_type,scope_id,target_value,warning_threshold,critical_threshold,direction,created_by)
  VALUES(v_tenant,v_code,p_kpi_key,COALESCE(p_scope_type,'enterprise'),p_scope_id,COALESCE(p_target_value,0),p_warning_threshold,p_critical_threshold,COALESCE(p_direction,'higher_better'),auth.uid())
  ON CONFLICT (tenant_id,target_code) DO UPDATE SET kpi_key=EXCLUDED.kpi_key,scope_type=EXCLUDED.scope_type,scope_id=EXCLUDED.scope_id,target_value=EXCLUDED.target_value,warning_threshold=EXCLUDED.warning_threshold,critical_threshold=EXCLUDED.critical_threshold,direction=EXCLUDED.direction
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_manufacturing_kpi_target(TEXT,TEXT,NUMERIC,TEXT,UUID,NUMERIC,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_mrp_manufacturing_kpi_snapshots(p_snapshot_date DATE DEFAULT CURRENT_DATE,p_period_type TEXT DEFAULT 'daily')
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v_oee NUMERIC; v_schedule NUMERIC; v_variance NUMERIC; v_pm NUMERIC;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  SELECT COALESCE(AVG(oee_percent),0) INTO v_oee FROM public.mrp_oee_snapshots WHERE tenant_id=v_tenant AND period_end::DATE=p_snapshot_date;
  SELECT COALESCE(AVG(progress_percent),0) INTO v_schedule FROM public.mrp_work_order_execution_status;
  SELECT COALESCE(AVG(total_variance_cost),0) INTO v_variance FROM public.mrp_work_order_cost_summaries WHERE tenant_id=v_tenant;
  SELECT COALESCE(pm_compliance_percent,0) INTO v_pm FROM public.mrp_maintenance_kpis LIMIT 1;
  INSERT INTO public.mrp_manufacturing_kpi_snapshots(tenant_id,snapshot_number,snapshot_date,period_type,kpi_key,actual_value,target_value,variance_value,status,source_view)
  VALUES
    (v_tenant,public.generate_mrp_next_code('manufacturing_kpi_snapshot',NULL),p_snapshot_date,p_period_type,'oee_percent',v_oee,85,v_oee-85,CASE WHEN v_oee<65 THEN 'critical' WHEN v_oee<75 THEN 'warning' ELSE 'ok' END,'mrp_oee_snapshots'),
    (v_tenant,public.generate_mrp_next_code('manufacturing_kpi_snapshot',NULL),p_snapshot_date,p_period_type,'schedule_attainment',v_schedule,95,v_schedule-95,CASE WHEN v_schedule<80 THEN 'critical' WHEN v_schedule<95 THEN 'warning' ELSE 'ok' END,'mrp_work_order_execution_status'),
    (v_tenant,public.generate_mrp_next_code('manufacturing_kpi_snapshot',NULL),p_snapshot_date,p_period_type,'avg_cost_variance',v_variance,0,v_variance,CASE WHEN ABS(v_variance)>1000 THEN 'warning' ELSE 'ok' END,'mrp_work_order_cost_summaries'),
    (v_tenant,public.generate_mrp_next_code('manufacturing_kpi_snapshot',NULL),p_snapshot_date,p_period_type,'pm_compliance',v_pm,90,v_pm-90,CASE WHEN v_pm<75 THEN 'critical' WHEN v_pm<90 THEN 'warning' ELSE 'ok' END,'mrp_maintenance_kpis');
  v_count := 4;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_mrp_manufacturing_kpi_snapshots(DATE,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_manufacturing_predictive_alerts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  IF EXISTS (SELECT 1 FROM public.mrp_oee_snapshots WHERE tenant_id=v_tenant AND period_end>=NOW()-INTERVAL '24 hours' HAVING AVG(oee_percent)<65) THEN
    INSERT INTO public.mrp_manufacturing_analytics_alerts(tenant_id,alert_number,alert_type,severity,title,body,recommended_action,created_by) VALUES(v_tenant,public.generate_mrp_next_code('mfg_alert',NULL),'oee_drop','urgent','OEE منخفض خلال آخر 24 ساعة','متوسط OEE أقل من 65%','راجع Pareto للتوقفات ومراكز العمل ذات الأداء المنخفض',auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.mrp_manufacturing_predictive_insights(tenant_id,insight_number,insight_type,confidence_percent,impact_score,title,explanation,alert_id,status) VALUES(v_tenant,public.generate_mrp_next_code('mfg_insight',NULL),'capacity_risk',75,80,'خطر انخفاض طاقة إنتاجية','OEE منخفض قد يؤثر على تسليم الأوامر',v_id,'converted_to_alert');
    v_count := v_count + 1;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mrp_work_order_cost_summaries WHERE tenant_id=v_tenant AND ABS(total_variance_cost)>1000) THEN
    INSERT INTO public.mrp_manufacturing_analytics_alerts(tenant_id,alert_number,alert_type,severity,title,body,recommended_action,created_by) VALUES(v_tenant,public.generate_mrp_next_code('mfg_alert',NULL),'cost_variance','warning','فروقات تكلفة مرتفعة','توجد أوامر عمل بفروقات تكلفة عالية','افتح تحليل فروقات التكلفة وRoot Cause',auth.uid());
    v_count := v_count + 1;
  END IF;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_manufacturing_predictive_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_manufacturing_analytics_alert(p_alert_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_manufacturing_analytics_alerts SET status='closed',closed_by=auth.uid(),closed_at=NOW(),close_reason=p_reason WHERE id=p_alert_id AND tenant_id=v_tenant AND status IN ('open','acknowledged');
  IF NOT FOUND THEN RAISE EXCEPTION 'ANALYTICS_ALERT_NOT_CLOSABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_manufacturing_analytics_alert(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_manufacturing_root_cause_analysis(p_source_type TEXT,p_source_id UUID,p_title TEXT,p_problem_statement TEXT,p_method TEXT DEFAULT '5_whys',p_root_cause_category TEXT DEFAULT NULL,p_root_cause_text TEXT DEFAULT NULL,p_corrective_action TEXT DEFAULT NULL,p_preventive_action TEXT DEFAULT NULL,p_due_date DATE DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_manufacturing_root_cause_analyses(tenant_id,rca_number,source_type,source_id,title,problem_statement,method,root_cause_category,root_cause_text,corrective_action,preventive_action,owner_id,due_date,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('mfg_rca',NULL),p_source_type,p_source_id,p_title,p_problem_statement,COALESCE(p_method,'5_whys'),p_root_cause_category,p_root_cause_text,p_corrective_action,p_preventive_action,auth.uid(),p_due_date,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_manufacturing_root_cause_analysis(TEXT,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_mrp_manufacturing_root_cause_analysis(p_rca_id UUID,p_close_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  UPDATE public.mrp_manufacturing_root_cause_analyses SET status='closed',closed_by=auth.uid(),closed_at=NOW(),root_cause_text=COALESCE(root_cause_text,p_close_note) WHERE id=p_rca_id AND tenant_id=v_tenant AND status IN ('open','in_progress','verified');
  IF NOT FOUND THEN RAISE EXCEPTION 'RCA_NOT_CLOSABLE'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.close_mrp_manufacturing_root_cause_analysis(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_manufacturing_periodic_report(p_report_type TEXT,p_period_start DATE,p_period_end DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_summary JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  v_summary := jsonb_build_object('work_orders',(SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=v_tenant AND created_at::DATE BETWEEN p_period_start AND p_period_end),'avg_oee',(SELECT AVG(oee_percent) FROM public.mrp_oee_snapshots WHERE tenant_id=v_tenant AND period_end::DATE BETWEEN p_period_start AND p_period_end),'cost_variance',(SELECT SUM(total_variance_cost) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=v_tenant),'open_ncr',(SELECT COUNT(*) FROM public.mrp_quality_ncrs WHERE tenant_id=v_tenant AND status NOT IN ('closed','cancelled')));
  INSERT INTO public.mrp_manufacturing_report_runs(tenant_id,report_number,report_type,period_start,period_end,summary,generated_by)
  VALUES(v_tenant,public.generate_mrp_next_code('mfg_report',NULL),p_report_type,p_period_start,p_period_end,v_summary,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_manufacturing_periodic_report(TEXT,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_mrp_manufacturing_report_export(p_report_run_id UUID,p_export_format TEXT DEFAULT 'xlsx')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','manager']::TEXT[]);
  INSERT INTO public.mrp_manufacturing_export_requests(tenant_id,export_number,report_run_id,export_format,requested_by)
  VALUES(v_tenant,public.generate_mrp_next_code('mfg_export',NULL),p_report_run_id,COALESCE(p_export_format,'xlsx'),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_mrp_manufacturing_report_export(UUID,TEXT) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_manufacturing_kpi_targets','mrp_manufacturing_kpi_snapshots','mrp_manufacturing_analytics_alerts','mrp_manufacturing_predictive_insights','mrp_manufacturing_root_cause_analyses','mrp_manufacturing_report_runs','mrp_manufacturing_export_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_manufacturing_executive_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status IN ('released','in_progress','paused')) AS active_work_orders,
  (SELECT COALESCE(SUM(quantity_completed),0) FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() AND actual_end_at::DATE=CURRENT_DATE) AS completed_today,
  (SELECT ROUND(AVG(oee_percent),2) FROM public.mrp_oee_snapshots WHERE tenant_id=public.current_user_tenant_id() AND period_end>=NOW()-INTERVAL '24 hours') AS avg_oee_24h,
  (SELECT ROUND(AVG(total_variance_cost),2) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()) AS avg_cost_variance,
  (SELECT COUNT(*) FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','cancelled')) AS open_ncr,
  (SELECT COUNT(*) FROM public.mrp_maintenance_work_orders WHERE tenant_id=public.current_user_tenant_id() AND status IN ('new','assigned','in_progress')) AS open_maintenance_wo,
  (SELECT COUNT(*) FROM public.mrp_manufacturing_analytics_alerts WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_analytics_alerts;
GRANT SELECT ON public.mrp_manufacturing_executive_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_production_performance_dashboard WITH (security_invoker=true) AS
SELECT wo.tenant_id,wo.id AS work_order_id,wo.work_order_number,wo.status,wo.quantity_to_produce,wo.quantity_completed,ROUND((wo.quantity_completed/NULLIF(wo.quantity_to_produce,0))*100,2) AS progress_percent,wo.critical_ratio,i.item_code,i.name_ar AS item_name
FROM public.mrp_work_orders wo LEFT JOIN public.inventory_items i ON i.id=wo.item_id AND i.tenant_id=wo.tenant_id
WHERE wo.tenant_id=public.current_user_tenant_id()
ORDER BY wo.created_at DESC;
GRANT SELECT ON public.mrp_production_performance_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_oee_trend_report WITH (security_invoker=true) AS
SELECT o.tenant_id,o.period_start::DATE AS work_date,o.work_center_id,wc.work_center_code,ROUND(AVG(o.oee_percent),2) AS avg_oee,ROUND(AVG(o.availability_percent),2) AS availability,ROUND(AVG(o.performance_percent),2) AS performance,ROUND(AVG(o.quality_percent),2) AS quality
FROM public.mrp_oee_snapshots o LEFT JOIN public.work_centers wc ON wc.id=o.work_center_id AND wc.tenant_id=o.tenant_id
WHERE o.tenant_id=public.current_user_tenant_id()
GROUP BY o.tenant_id,o.period_start::DATE,o.work_center_id,wc.work_center_code
ORDER BY work_date DESC;
GRANT SELECT ON public.mrp_oee_trend_report TO authenticated;

CREATE OR REPLACE VIEW public.mrp_schedule_attainment_report WITH (security_invoker=true) AS
SELECT tenant_id,COUNT(*) AS work_order_count,ROUND(SUM(quantity_completed)/NULLIF(SUM(quantity_to_produce),0)*100,2) AS schedule_attainment_percent,COUNT(*) FILTER (WHERE status IN ('completed','closed')) AS completed_orders
FROM public.mrp_work_orders WHERE tenant_id=public.current_user_tenant_id() GROUP BY tenant_id;
GRANT SELECT ON public.mrp_schedule_attainment_report TO authenticated;

CREATE OR REPLACE VIEW public.mrp_bottleneck_analysis WITH (security_invoker=true) AS
SELECT wc.tenant_id,wc.id AS work_center_id,wc.work_center_code,wc.name_ar AS work_center_name,
  (SELECT COUNT(*) FROM public.mrp_work_order_operations op WHERE op.tenant_id=wc.tenant_id AND op.work_center_id=wc.id AND op.status IN ('pending','ready','in_progress','blocked')) AS open_operation_count,
  (SELECT COALESCE(SUM(live_duration_minutes),0) FROM public.mrp_downtime_dashboard d WHERE d.work_center_id=wc.id) AS downtime_minutes,
  (SELECT ROUND(AVG(oee_percent),2) FROM public.mrp_oee_snapshots o WHERE o.tenant_id=wc.tenant_id AND o.work_center_id=wc.id AND o.period_end>=NOW()-INTERVAL '7 days') AS avg_oee_7d
FROM public.work_centers wc WHERE wc.tenant_id=public.current_user_tenant_id()
ORDER BY open_operation_count DESC, downtime_minutes DESC;
GRANT SELECT ON public.mrp_bottleneck_analysis TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_cost_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','cancelled')) AS open_ncr,
  (SELECT COALESCE(SUM(affected_qty),0) FROM public.mrp_quality_ncrs WHERE tenant_id=public.current_user_tenant_id()) AS affected_qty,
  (SELECT COALESCE(SUM(scrap_rework_cost),0) FROM public.mrp_work_order_cost_summaries WHERE tenant_id=public.current_user_tenant_id()) AS scrap_rework_cost;
GRANT SELECT ON public.mrp_quality_cost_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_cost_variance_dashboard WITH (security_invoker=true) AS
SELECT cost_category,variance_type,COUNT(*) AS variance_count,ROUND(SUM(variance_amount),2) AS total_variance,MAX(severity) AS max_severity
FROM public.mrp_cost_variances WHERE tenant_id=public.current_user_tenant_id() GROUP BY cost_category,variance_type ORDER BY ABS(SUM(variance_amount)) DESC;
GRANT SELECT ON public.mrp_cost_variance_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_maintenance_reliability_dashboard WITH (security_invoker=true) AS
SELECT * FROM public.mrp_maintenance_mtbf_mttr WHERE tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_maintenance_reliability_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_manufacturing_kpi_scorecard WITH (security_invoker=true) AS
SELECT s.*, t.target_code,t.direction
FROM public.mrp_manufacturing_kpi_snapshots s LEFT JOIN public.mrp_manufacturing_kpi_targets t ON t.tenant_id=s.tenant_id AND t.kpi_key=s.kpi_key AND t.status='active'
WHERE s.tenant_id=public.current_user_tenant_id()
ORDER BY s.snapshot_date DESC,s.kpi_key;
GRANT SELECT ON public.mrp_manufacturing_kpi_scorecard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_predictive_alert_queue WITH (security_invoker=true) AS
SELECT a.* FROM public.mrp_manufacturing_analytics_alerts a WHERE a.tenant_id=public.current_user_tenant_id() ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END, a.created_at DESC;
GRANT SELECT ON public.mrp_predictive_alert_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_root_cause_analysis_board WITH (security_invoker=true) AS
SELECT * FROM public.mrp_manufacturing_root_cause_analyses WHERE tenant_id=public.current_user_tenant_id() ORDER BY created_at DESC;
GRANT SELECT ON public.mrp_root_cause_analysis_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_manufacturing_report_center WITH (security_invoker=true) AS
SELECT * FROM public.mrp_manufacturing_report_runs WHERE tenant_id=public.current_user_tenant_id() ORDER BY generated_at DESC;
GRANT SELECT ON public.mrp_manufacturing_report_center TO authenticated;

CREATE OR REPLACE VIEW public.mrp_manufacturing_export_queue WITH (security_invoker=true) AS
SELECT * FROM public.mrp_manufacturing_export_requests WHERE tenant_id=public.current_user_tenant_id() ORDER BY requested_at DESC;
GRANT SELECT ON public.mrp_manufacturing_export_queue TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_manufacturing_kpi_targets') IS NULL OR to_regclass('public.mrp_manufacturing_executive_dashboard') IS NULL OR to_regprocedure('public.refresh_mrp_manufacturing_kpi_snapshots(date,text)') IS NULL THEN
    RAISE EXCEPTION '0228 failed: MRP manufacturing analytics objects missing';
  END IF;
  RAISE NOTICE '✅ 0228: MRP manufacturing analytics applied';
END $$;
