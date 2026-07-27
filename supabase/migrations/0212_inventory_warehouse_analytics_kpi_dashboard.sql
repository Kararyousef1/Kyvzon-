-- ============================================================================
-- 0212 — Inventory Unit 08: Warehouse Analytics & KPI Dashboard
-- docs/inventory/08-warehouse-analytics-KPI-dashboard.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_analytics_kpi_catalog (
  kpi_code TEXT PRIMARY KEY,
  kpi_group TEXT NOT NULL CHECK (kpi_group IN ('receiving','storage_inventory','picking_fulfillment','shipping','labor_cost','returns','executive','safety')),
  name_ar TEXT NOT NULL,
  formula_text TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'percent',
  direction TEXT NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower','range')),
  default_green_min NUMERIC,
  default_green_max NUMERIC,
  default_yellow_min NUMERIC,
  default_yellow_max NUMERIC,
  refresh_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (refresh_frequency IN ('minute','hourly','daily','weekly','monthly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.inventory_analytics_kpi_catalog(kpi_code,kpi_group,name_ar,formula_text,unit,direction,default_green_min,default_green_max,default_yellow_min,default_yellow_max,refresh_frequency)
VALUES
 ('inventory_value','executive','قيمة المخزون','SUM(on_hand_qty × average_cost)','currency','higher',NULL,NULL,NULL,NULL,'daily'),
 ('inventory_record_accuracy','storage_inventory','دقة سجل المخزون','[1-(الفروقات/الإجمالي)]×100','percent','higher',99.5,NULL,99,NULL,'daily'),
 ('space_utilization','storage_inventory','استغلال المساحة','المساحة/السعة المشغولة','percent','range',80,85,75,95,'hourly'),
 ('perfect_order_rate','shipping','Perfect Order Rate','أوامر صحيحة كاملة في وقت / إجمالي','percent','higher',95,NULL,90,NULL,'daily'),
 ('dock_to_stock_hours','receiving','Dock-to-Stock Time','وقت وصول الشاحنة لدخول المخزون','hours','lower',NULL,3,NULL,4,'hourly'),
 ('asn_compliance','receiving','ASN Compliance','شحنات مع ASN مسبق / إجمالي','percent','higher',90,NULL,80,NULL,'daily'),
 ('receiving_accuracy','receiving','Receiving Accuracy','بنود بدون فروق / إجمالي بنود','percent','higher',99.5,NULL,98,NULL,'daily'),
 ('dock_utilization','receiving','Dock Utilization','ساعات استخدام فعلي / متاح','percent','range',75,85,60,95,'hourly'),
 ('osd_rate','receiving','معدل OS&D','شحنات بفروق / إجمالي','percent','lower',NULL,3,NULL,5,'daily'),
 ('putaway_time_hours','storage_inventory','Putaway Time','من GR للوضع في الرف','hours','lower',NULL,2,NULL,3,'hourly'),
 ('inventory_turnover','storage_inventory','دوران المخزون','COGS / متوسط المخزون','times','range',8,12,6,14,'monthly'),
 ('slow_moving_percent','storage_inventory','مخزون راكد','قيمة/عدد لم يتحرك / إجمالي','percent','lower',NULL,3,NULL,5,'weekly'),
 ('stockout_rate','storage_inventory','Stockout Rate','أوامر/أصناف متوقفة بسبب نقص','percent','lower',NULL,1,NULL,2,'hourly'),
 ('pick_accuracy','picking_fulfillment','Pick Accuracy','أوامر بدون أخطاء / إجمالي','percent','higher',99.5,NULL,98,NULL,'hourly'),
 ('pick_rate_units_hour','picking_fulfillment','Pick Rate','وحدات / ساعة عمل','units_hour','range',150,200,120,240,'hourly'),
 ('short_pick_rate','picking_fulfillment','Short Pick Rate','أوامر بها نقص / إجمالي','percent','lower',NULL,0.5,NULL,1,'hourly'),
 ('order_cycle_hours','picking_fulfillment','Order Cycle Time','من إطلاق لإتمام السحب','hours','lower',NULL,2,NULL,3,'hourly'),
 ('on_time_shipping','shipping','On-Time Shipping','شحن في الموعد / إجمالي','percent','higher',98,NULL,95,NULL,'daily'),
 ('shipping_cost_per_order','shipping','Shipping Cost/Order','إجمالي تكاليف الشحن / أوامر','currency','lower',NULL,NULL,NULL,NULL,'daily'),
 ('carrier_otif','shipping','Carrier OTIF','وصلت في موعد وكمية / إجمالي','percent','higher',95,NULL,90,NULL,'daily'),
 ('labor_utilization','labor_cost','Labor Utilization','وقت مباشر / إجمالي وقت','percent','higher',70,NULL,60,NULL,'hourly'),
 ('cost_per_unit_handled','labor_cost','Cost per Unit Handled','إجمالي تكاليف / وحدات','currency','lower',NULL,NULL,NULL,NULL,'daily'),
 ('productivity_rate','labor_cost','Productivity Rate','وقت معياري / وقت فعلي','percent','range',90,110,80,120,'hourly'),
 ('error_cost_percent','labor_cost','تكلفة الخطأ','تكاليف إعادة العمل / إجمالي تكلفة','percent','lower',NULL,2,NULL,4,'weekly'),
 ('return_rate','returns','Return Rate','مرتجعات / شحنات','percent','lower',NULL,2,NULL,4,'daily'),
 ('return_value_recovery','returns','Value Recovery','قيمة مستردة / إجمالي قيمة المرتجعات','percent','higher',85,NULL,75,NULL,'daily'),
 ('trir','safety','TRIR','إصابات / 200,000 ساعة عمل','rate','lower',NULL,2,NULL,4,'monthly')
ON CONFLICT (kpi_code) DO UPDATE SET name_ar=EXCLUDED.name_ar, formula_text=EXCLUDED.formula_text, unit=EXCLUDED.unit, direction=EXCLUDED.direction;
GRANT SELECT ON public.inventory_analytics_kpi_catalog TO authenticated;

CREATE TABLE IF NOT EXISTS public.inventory_analytics_kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kpi_code TEXT NOT NULL REFERENCES public.inventory_analytics_kpi_catalog(kpi_code) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  green_min NUMERIC,
  green_max NUMERIC,
  yellow_min NUMERIC,
  yellow_max NUMERIC,
  target_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,kpi_code,warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_analytics_kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kpi_code TEXT NOT NULL REFERENCES public.inventory_analytics_kpi_catalog(kpi_code) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  snapshot_period TEXT NOT NULL DEFAULT 'daily' CHECK (snapshot_period IN ('minute','hourly','daily','weekly','monthly')),
  kpi_value NUMERIC,
  numerator NUMERIC,
  denominator NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,kpi_code,warehouse_id,snapshot_date,snapshot_period)
);

CREATE TABLE IF NOT EXISTS public.inventory_analytics_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  alert_name TEXT NOT NULL,
  alert_category TEXT NOT NULL CHECK (alert_category IN ('stockout','vip_delay','receiving_error','barcode_outage','rop','capacity','ira_drop','low_productivity','expiry','slow_moving','labor_plan_variance','cost_spike','other')),
  severity TEXT NOT NULL CHECK (severity IN ('urgent','warning','info')),
  threshold_value NUMERIC,
  threshold_operator TEXT DEFAULT '<=' CHECK (threshold_operator IN ('<','<=','>','>=','=','!=')),
  notification_window TEXT NOT NULL DEFAULT 'immediate' CHECK (notification_window IN ('immediate','hourly','daily')),
  target_role TEXT NOT NULL DEFAULT 'inventory',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,rule_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.inventory_analytics_alert_rules(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('urgent','warning','info')),
  alert_category TEXT NOT NULL,
  entity_table TEXT,
  entity_id UUID,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kpi_code TEXT REFERENCES public.inventory_analytics_kpi_catalog(kpi_code) ON DELETE SET NULL,
  current_value NUMERIC,
  target_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  recommended_action TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.inventory_root_cause_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  analysis_number TEXT NOT NULL,
  kpi_code TEXT NOT NULL REFERENCES public.inventory_analytics_kpi_catalog(kpi_code) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  current_value NUMERIC,
  target_value NUMERIC,
  most_affected_area TEXT,
  affected_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  affected_shift TEXT,
  affected_workers JSONB NOT NULL DEFAULT '[]'::JSONB,
  root_cause_summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  confidence_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','actioned','closed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,analysis_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_periodic_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily_operations','weekly_performance','monthly_warehouse_review')),
  schedule_cron TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Baghdad',
  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  include_excel BOOLEAN NOT NULL DEFAULT true,
  include_pdf BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,report_type)
);

CREATE TABLE IF NOT EXISTS public.inventory_periodic_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL,
  schedule_id UUID REFERENCES public.inventory_periodic_report_schedules(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily_operations','weekly_performance','monthly_warehouse_review')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  delivery_status TEXT NOT NULL DEFAULT 'generated' CHECK (delivery_status IN ('generated','queued','sent','failed','cancelled')),
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,report_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_run_id UUID REFERENCES public.inventory_periodic_report_runs(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('excel','pdf','csv','json')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','generating','ready','failed','expired')),
  file_url TEXT,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.inventory_operating_cost_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost_category TEXT NOT NULL CHECK (cost_category IN ('labor','shipping','maintenance','rework','equipment','utilities','other')),
  amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  units_handled NUMERIC(16,4) NOT NULL DEFAULT 0,
  source_table TEXT,
  source_id UUID,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_kpi_snapshots_lookup ON public.inventory_analytics_kpi_snapshots(tenant_id,kpi_code,snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_status ON public.inventory_analytics_alerts(tenant_id,severity,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_root_cause_kpi ON public.inventory_root_cause_analyses(tenant_id,kpi_code,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_operating_cost_date ON public.inventory_operating_cost_entries(tenant_id,cost_date,cost_category);

CREATE OR REPLACE FUNCTION public.seed_inventory_analytics_kpi_targets(p_warehouse_id UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  DELETE FROM public.inventory_analytics_kpi_targets WHERE tenant_id=v_tenant AND ((p_warehouse_id IS NULL AND warehouse_id IS NULL) OR warehouse_id=p_warehouse_id);
  FOR v IN SELECT * FROM public.inventory_analytics_kpi_catalog LOOP
    INSERT INTO public.inventory_analytics_kpi_targets(tenant_id,kpi_code,warehouse_id,green_min,green_max,yellow_min,yellow_max,target_note)
    VALUES(v_tenant,v.kpi_code,p_warehouse_id,v.default_green_min,v.default_green_max,v.default_yellow_min,v.default_yellow_max,'Kyvzon default target from Unit 08')
    ON CONFLICT (tenant_id,kpi_code,warehouse_id) DO UPDATE SET green_min=EXCLUDED.green_min,green_max=EXCLUDED.green_max,yellow_min=EXCLUDED.yellow_min,yellow_max=EXCLUDED.yellow_max,is_active=true;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_inventory_analytics_kpi_targets(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_operating_cost(p_warehouse_id UUID, p_cost_date DATE, p_cost_category TEXT, p_amount NUMERIC, p_units_handled NUMERIC DEFAULT 0, p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager','finance']::TEXT[]);
  INSERT INTO public.inventory_operating_cost_entries(tenant_id,warehouse_id,cost_date,cost_category,amount,units_handled,notes,created_by)
  VALUES(v_tenant,p_warehouse_id,COALESCE(p_cost_date,CURRENT_DATE),p_cost_category,COALESCE(p_amount,0),COALESCE(p_units_handled,0),p_notes,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_inventory_operating_cost(UUID,DATE,TEXT,NUMERIC,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_inventory_kpi_snapshots(p_snapshot_date DATE DEFAULT CURRENT_DATE)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_analytics_kpi_snapshots(tenant_id,kpi_code,snapshot_date,snapshot_period,kpi_value,payload)
  VALUES
    (v_tenant,'inventory_value',p_snapshot_date,'daily',(SELECT estimated_value FROM public.inventory_kpis LIMIT 1),'{}'),
    (v_tenant,'inventory_record_accuracy',p_snapshot_date,'daily',COALESCE((SELECT ira_percent FROM public.inventory_ira_dashboard LIMIT 1),100),'{}'),
    (v_tenant,'space_utilization',p_snapshot_date,'daily',(SELECT avg_space_utilization FROM public.inventory_storage_kpis LIMIT 1),'{}'),
    (v_tenant,'perfect_order_rate',p_snapshot_date,'daily',(SELECT perfect_order_foundation_rate FROM public.inventory_shipping_kpis LIMIT 1),'{}'),
    (v_tenant,'dock_to_stock_hours',p_snapshot_date,'daily',(SELECT avg_dock_to_stock_hours FROM public.inventory_receiving_kpis LIMIT 1),'{}'),
    (v_tenant,'asn_compliance',p_snapshot_date,'daily',(SELECT asn_compliance_percent FROM public.inventory_receiving_kpis LIMIT 1),'{}'),
    (v_tenant,'receiving_accuracy',p_snapshot_date,'daily',COALESCE((SELECT ROUND(COUNT(*) FILTER (WHERE condition_status='ok' AND rejected_qty=0 AND (expected_qty IS NULL OR expected_qty=0 OR received_qty=expected_qty))::NUMERIC/NULLIF(COUNT(*),0)*100,2) FROM public.inventory_receiving_lines WHERE tenant_id=v_tenant),100),'{}'),
    (v_tenant,'dock_utilization',p_snapshot_date,'daily',COALESCE((SELECT ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(actual_completed_at,scheduled_end)-COALESCE(actual_unloading_start,actual_check_in,scheduled_start)))/3600)::NUMERIC/NULLIF((SELECT COUNT(*) FROM public.inventory_docks d WHERE d.tenant_id=v_tenant)*8,0)*100,2) FROM public.inventory_dock_appointments WHERE tenant_id=v_tenant AND scheduled_start::DATE=p_snapshot_date),0),'{}'),
    (v_tenant,'osd_rate',p_snapshot_date,'daily',COALESCE((SELECT ROUND(COUNT(DISTINCT o.id)::NUMERIC/NULLIF(COUNT(DISTINCT s.id),0)*100,2) FROM public.inventory_receiving_sessions s LEFT JOIN public.inventory_osd_cases o ON o.session_id=s.id AND o.tenant_id=s.tenant_id WHERE s.tenant_id=v_tenant),0),'{}'),
    (v_tenant,'putaway_time_hours',p_snapshot_date,'daily',(SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at-created_at))/3600),2) FROM public.inventory_putaway_tasks WHERE tenant_id=v_tenant AND completed_at IS NOT NULL),'{}'),
    (v_tenant,'inventory_turnover',p_snapshot_date,'monthly',COALESCE((SELECT ROUND(SUM(amount) FILTER (WHERE cost_category='shipping')/NULLIF((SELECT estimated_value FROM public.inventory_kpis LIMIT 1),0),2) FROM public.inventory_operating_cost_entries WHERE tenant_id=v_tenant),0),'{}'),
    (v_tenant,'slow_moving_percent',p_snapshot_date,'weekly',COALESCE((SELECT ROUND(COUNT(*)::NUMERIC/NULLIF((SELECT COUNT(*) FROM public.inventory_items i WHERE i.tenant_id=v_tenant),0)*100,2) FROM public.inventory_slow_moving_report WHERE tenant_id=v_tenant),0),'{}'),
    (v_tenant,'stockout_rate',p_snapshot_date,'daily',COALESCE((SELECT ROUND(stockout_items::NUMERIC/NULLIF(total_items,0)*100,2) FROM public.inventory_kpis LIMIT 1),0),'{}'),
    (v_tenant,'pick_accuracy',p_snapshot_date,'daily',(SELECT pick_accuracy_percent FROM public.inventory_picking_kpis LIMIT 1),'{}'),
    (v_tenant,'pick_rate_units_hour',p_snapshot_date,'daily',COALESCE((SELECT ROUND(SUM(units_processed)/NULLIF(SUM(actual_minutes)/60,0),2) FROM public.inventory_labor_time_logs WHERE tenant_id=v_tenant AND time_category='direct' AND work_date=p_snapshot_date),0),'{}'),
    (v_tenant,'short_pick_rate',p_snapshot_date,'daily',(SELECT short_pick_rate_percent FROM public.inventory_picking_kpis LIMIT 1),'{}'),
    (v_tenant,'order_cycle_hours',p_snapshot_date,'daily',(SELECT avg_order_cycle_hours FROM public.inventory_picking_kpis LIMIT 1),'{}'),
    (v_tenant,'on_time_shipping',p_snapshot_date,'daily',(SELECT on_time_shipping_rate FROM public.inventory_shipping_kpis LIMIT 1),'{}'),
    (v_tenant,'shipping_cost_per_order',p_snapshot_date,'daily',(SELECT shipping_cost_per_order FROM public.inventory_shipping_kpis LIMIT 1),'{}'),
    (v_tenant,'carrier_otif',p_snapshot_date,'daily',COALESCE((SELECT AVG(delivery_rate) FROM public.inventory_carrier_performance),0),'{}'),
    (v_tenant,'labor_utilization',p_snapshot_date,'daily',(SELECT utilization_rate_percent FROM public.inventory_labor_kpis LIMIT 1),'{}'),
    (v_tenant,'cost_per_unit_handled',p_snapshot_date,'daily',(SELECT labor_cost_per_unit FROM public.inventory_labor_kpis LIMIT 1),'{}'),
    (v_tenant,'productivity_rate',p_snapshot_date,'daily',(SELECT overall_productivity_percent FROM public.inventory_labor_kpis LIMIT 1),'{}'),
    (v_tenant,'error_cost_percent',p_snapshot_date,'weekly',COALESCE((SELECT ROUND(SUM(amount) FILTER (WHERE cost_category='rework')/NULLIF(SUM(amount),0)*100,2) FROM public.inventory_operating_cost_entries WHERE tenant_id=v_tenant),0),'{}'),
    (v_tenant,'return_rate',p_snapshot_date,'daily',(SELECT return_rate_percent FROM public.inventory_returns_kpis LIMIT 1),'{}'),
    (v_tenant,'return_value_recovery',p_snapshot_date,'daily',(SELECT value_recovery_percent FROM public.inventory_returns_kpis LIMIT 1),'{}'),
    (v_tenant,'trir',p_snapshot_date,'monthly',(SELECT trir FROM public.inventory_labor_kpis LIMIT 1),'{}')
  ON CONFLICT (tenant_id,kpi_code,warehouse_id,snapshot_date,snapshot_period) DO UPDATE SET kpi_value=EXCLUDED.kpi_value,payload=EXCLUDED.payload,created_at=NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_inventory_kpi_snapshots(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_inventory_root_cause_analysis(p_kpi_code TEXT, p_period_start DATE DEFAULT CURRENT_DATE-7, p_period_end DATE DEFAULT CURRENT_DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_current NUMERIC; v_target NUMERIC; v_area TEXT; v_summary TEXT; v_action TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT kpi_value INTO v_current FROM public.inventory_analytics_kpi_snapshots WHERE tenant_id=v_tenant AND kpi_code=p_kpi_code ORDER BY snapshot_date DESC,created_at DESC LIMIT 1;
  SELECT COALESCE(green_min,green_max) INTO v_target FROM public.inventory_analytics_kpi_targets WHERE tenant_id=v_tenant AND kpi_code=p_kpi_code AND is_active LIMIT 1;
  SELECT COALESCE(l.aisle_code,l.location_code,'غير محدد') INTO v_area
  FROM public.inventory_count_variances cv LEFT JOIN public.inventory_locations l ON l.id=cv.location_id AND l.tenant_id=cv.tenant_id
  WHERE cv.tenant_id=v_tenant AND cv.created_at::DATE BETWEEN p_period_start AND p_period_end
  GROUP BY COALESCE(l.aisle_code,l.location_code,'غير محدد') ORDER BY SUM(cv.variance_abs_qty) DESC NULLS LAST LIMIT 1;
  v_summary := 'تحليل تلقائي: أكثر منطقة مرتبطة بالانحراف هي '||COALESCE(v_area,'غير محدد')||' خلال الفترة المحددة.';
  v_action := 'مراجعة إجراءات التخزين/السحب للفريق المتأثر وتنفيذ جرد طارئ للمناطق ذات الانحراف.';
  INSERT INTO public.inventory_root_cause_analyses(tenant_id,analysis_number,kpi_code,period_start,period_end,current_value,target_value,most_affected_area,affected_items,affected_shift,affected_workers,root_cause_summary,recommended_action,confidence_percent)
  VALUES(v_tenant,public.inventory_next_number('RCA'),p_kpi_code,p_period_start,p_period_end,v_current,v_target,v_area,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id',item_id,'variance',total_variance)) FROM (SELECT item_id,SUM(variance_abs_qty) total_variance FROM public.inventory_count_variances WHERE tenant_id=v_tenant AND created_at::DATE BETWEEN p_period_start AND p_period_end GROUP BY item_id ORDER BY SUM(variance_abs_qty) DESC LIMIT 10) q),'[]'::JSONB),
    COALESCE((SELECT shift_code FROM public.inventory_worker_availability WHERE tenant_id=v_tenant AND work_date BETWEEN p_period_start AND p_period_end GROUP BY shift_code ORDER BY COUNT(*) DESC LIMIT 1),'غير محدد'),
    COALESCE((SELECT jsonb_agg(worker_id) FROM (SELECT worker_id FROM public.inventory_labor_time_logs WHERE tenant_id=v_tenant AND work_date BETWEEN p_period_start AND p_period_end GROUP BY worker_id ORDER BY SUM(error_count) DESC LIMIT 10) w),'[]'::JSONB),
    v_summary,v_action,72) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.run_inventory_root_cause_analysis(TEXT,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_inventory_analytics_alert_rules()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_analytics_alert_rules(tenant_id,rule_code,alert_name,alert_category,severity,threshold_value,threshold_operator,notification_window,target_role)
  VALUES
    (v_tenant,'critical_stockout_zero','مخزون صنف حرج وصل الصفر','stockout','urgent',0,'<=','immediate','inventory'),
    (v_tenant,'vip_or_late_shipment','شحنة ستتأخر عن موعدها','vip_delay','urgent',0,'>','immediate','inventory'),
    (v_tenant,'critical_receiving_error','خطأ استلام جوهري أو OS&D critical','receiving_error','urgent',5,'>','immediate','inventory'),
    (v_tenant,'barcode_outage_external','انقطاع في نظام الباركود','barcode_outage','urgent',1,'=','immediate','it_admin'),
    (v_tenant,'a_item_rop','صنف A وصل ROP','rop','warning',0,'<=','hourly','inventory'),
    (v_tenant,'capacity_95','منطقة تخزين وصلت 95%','capacity','warning',95,'>=','hourly','inventory'),
    (v_tenant,'ira_below_99','دقة المخزون أقل من 99%','ira_drop','warning',99,'<','hourly','inventory'),
    (v_tenant,'low_productivity_70','موظف أقل من 70%','low_productivity','warning',70,'<','hourly','manager'),
    (v_tenant,'expiry_soon','أصناف اقتربت من تاريخ الانتهاء','expiry','info',90,'<=','daily','inventory'),
    (v_tenant,'slow_moving_90','مخزون راكد لأكثر من 90 يوم','slow_moving','info',90,'>=','daily','inventory'),
    (v_tenant,'labor_plan_variance','اختلاف بين المخطط والفعلي في العمالة','labor_plan_variance','info',10,'>','daily','manager')
  ON CONFLICT (tenant_id,rule_code) DO UPDATE SET alert_name=EXCLUDED.alert_name,severity=EXCLUDED.severity,is_active=true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_inventory_analytics_alert_rules() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_predictive_alerts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; r RECORD; v_rows INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  PERFORM public.seed_inventory_analytics_alert_rules();
  FOR r IN SELECT * FROM public.inventory_reorder_alerts WHERE tenant_id=v_tenant AND alert_level='stockout' LOOP
    INSERT INTO public.inventory_analytics_alerts(tenant_id,severity,alert_category,entity_table,entity_id,title,body,status,recommended_action,payload)
    VALUES(v_tenant,'urgent','stockout','inventory_items',r.item_id,'مخزون حرج وصل الصفر',r.item_code||' / '||r.item_name,'open','تسريع شراء/نقل مخزون أو تصعيد للإنتاج',to_jsonb(r)); v_count:=v_count+1;
  END LOOP;
  INSERT INTO public.inventory_analytics_alerts(tenant_id,severity,alert_category,entity_table,entity_id,title,body,current_value,recommended_action,payload)
  SELECT v_tenant,'warning','capacity','inventory_warehouses',warehouse_id,'مستودع/منطقة تخزين فوق 95%',warehouse_code||' وصل '||capacity_percent||'%',capacity_percent,'تنفيذ إعادة توزيع/Slotting أو فتح مواقع بديلة',to_jsonb(c)
  FROM public.inventory_capacity_report c WHERE c.tenant_id=v_tenant AND c.capacity_percent >= 95;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + COALESCE(v_rows,0);
  INSERT INTO public.inventory_analytics_alerts(tenant_id,severity,alert_category,entity_table,entity_id,title,body,current_value,recommended_action,payload)
  SELECT v_tenant,'warning','low_productivity','profiles',worker_id,'إنتاجية موظف أقل من 70%',COALESCE(full_name,worker_id::TEXT)||' إنتاجيته '||productivity_percent||'%',productivity_percent,'إسناد مهمة مناسبة أو مراجعة عوائق العمل',to_jsonb(p)
  FROM public.inventory_employee_performance_realtime p WHERE p.tenant_id=v_tenant AND p.productivity_percent < 70;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + COALESCE(v_rows,0);
  INSERT INTO public.inventory_analytics_alerts(tenant_id,severity,alert_category,entity_table,entity_id,title,body,current_value,recommended_action,payload)
  SELECT v_tenant,'info','expiry','inventory_items',item_id,'صنف اقترب من الانتهاء',item_code||' ينتهي خلال '||days_left||' يوم',days_left,'تسريع الاستهلاك/البيع أو الحجر عند اللزوم',to_jsonb(e)
  FROM public.inventory_expiry_alerts e WHERE e.tenant_id=v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + COALESCE(v_rows,0);
  INSERT INTO public.inventory_analytics_alerts(tenant_id,severity,alert_category,title,body,current_value,recommended_action,payload)
  SELECT v_tenant,'warning','ira_drop','دقة المخزون أقل من 99%', 'IRA الحالية '||ira_percent||'%', ira_percent, 'تشغيل Root Cause Analysis وجرد طارئ للمناطق المتأثرة', to_jsonb(i)
  FROM public.inventory_ira_dashboard i WHERE i.tenant_id=v_tenant AND i.ira_percent < 99;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + COALESCE(v_rows,0);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_predictive_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_inventory_analytics_alert(p_alert_id UUID, p_status TEXT DEFAULT 'acknowledged')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id();
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  UPDATE public.inventory_analytics_alerts SET status=p_status, acknowledged_by=auth.uid(), acknowledged_at=NOW(), resolved_at=CASE WHEN p_status='resolved' THEN NOW() ELSE resolved_at END WHERE id=p_alert_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'ANALYTICS_ALERT_NOT_FOUND'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.acknowledge_inventory_analytics_alert(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_inventory_periodic_report_schedule(p_report_type TEXT, p_schedule_cron TEXT, p_recipients TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  INSERT INTO public.inventory_periodic_report_schedules(tenant_id,report_type,schedule_cron,recipients)
  VALUES(v_tenant,p_report_type,p_schedule_cron,COALESCE(p_recipients,ARRAY[]::TEXT[]))
  ON CONFLICT (tenant_id,report_type) DO UPDATE SET schedule_cron=EXCLUDED.schedule_cron,recipients=EXCLUDED.recipients,is_active=true
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_inventory_periodic_report_schedule(TEXT,TEXT,TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_periodic_report(p_report_type TEXT, p_period_start DATE, p_period_end DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_schedule UUID; v_payload JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF p_report_type NOT IN ('daily_operations','weekly_performance','monthly_warehouse_review') THEN RAISE EXCEPTION 'INVALID_WAREHOUSE_REPORT_TYPE'; END IF;
  SELECT id INTO v_schedule FROM public.inventory_periodic_report_schedules WHERE tenant_id=v_tenant AND report_type=p_report_type LIMIT 1;
  SELECT jsonb_build_object(
    'executive',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::JSONB) FROM public.inventory_executive_dashboard x),
    'scorecard',(SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::JSONB) FROM public.inventory_kpi_scorecard s),
    'alerts',(SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]'::JSONB) FROM public.inventory_predictive_alerts_queue a),
    'heatmap',(SELECT COALESCE(jsonb_agg(to_jsonb(h)),'[]'::JSONB) FROM public.inventory_inventory_heatmap_analytics h LIMIT 100),
    'costs',(SELECT COALESCE(jsonb_agg(to_jsonb(c)),'[]'::JSONB) FROM public.inventory_operating_cost_dashboard c)
  ) INTO v_payload;
  INSERT INTO public.inventory_periodic_report_runs(tenant_id,report_number,schedule_id,report_type,period_start,period_end,report_payload,generated_by)
  VALUES(v_tenant,public.inventory_next_number('WAR'),v_schedule,p_report_type,p_period_start,p_period_end,COALESCE(v_payload,'{}'::JSONB),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_periodic_report(TEXT,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_inventory_report_export(p_report_run_id UUID, p_export_type TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF p_export_type NOT IN ('excel','pdf','csv','json') THEN RAISE EXCEPTION 'INVALID_EXPORT_TYPE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_periodic_report_runs WHERE id=p_report_run_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'REPORT_RUN_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_report_exports(tenant_id,report_run_id,export_type,requested_by) VALUES(v_tenant,p_report_run_id,p_export_type,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_inventory_report_export(UUID,TEXT) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_analytics_kpi_targets','inventory_analytics_kpi_snapshots','inventory_analytics_alert_rules','inventory_analytics_alerts','inventory_root_cause_analyses','inventory_periodic_report_schedules','inventory_periodic_report_runs','inventory_report_exports','inventory_operating_cost_entries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''finance'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''finance'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''manager'',''finance'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_kpi_scorecard WITH (security_invoker=true) AS
WITH latest AS (
  SELECT DISTINCT ON (tenant_id,kpi_code,warehouse_id) * FROM public.inventory_analytics_kpi_snapshots
  WHERE tenant_id=public.current_user_tenant_id()
  ORDER BY tenant_id,kpi_code,warehouse_id,snapshot_date DESC,created_at DESC
)
SELECT t.tenant_id,c.kpi_code,c.kpi_group,c.name_ar,c.unit,c.direction,l.kpi_value,t.green_min,t.green_max,t.yellow_min,t.yellow_max,
  CASE
    WHEN l.kpi_value IS NULL THEN 'gray'
    WHEN c.direction='higher' AND t.green_min IS NOT NULL AND l.kpi_value >= t.green_min THEN 'green'
    WHEN c.direction='higher' AND t.yellow_min IS NOT NULL AND l.kpi_value >= t.yellow_min THEN 'yellow'
    WHEN c.direction='lower' AND t.green_max IS NOT NULL AND l.kpi_value <= t.green_max THEN 'green'
    WHEN c.direction='lower' AND t.yellow_max IS NOT NULL AND l.kpi_value <= t.yellow_max THEN 'yellow'
    WHEN c.direction='range' AND t.green_min IS NOT NULL AND t.green_max IS NOT NULL AND l.kpi_value BETWEEN t.green_min AND t.green_max THEN 'green'
    WHEN c.direction='range' AND t.yellow_min IS NOT NULL AND t.yellow_max IS NOT NULL AND l.kpi_value BETWEEN t.yellow_min AND t.yellow_max THEN 'yellow'
    ELSE 'red'
  END AS color_status,
  l.snapshot_date,l.created_at AS refreshed_at
FROM public.inventory_analytics_kpi_targets t
JOIN public.inventory_analytics_kpi_catalog c ON c.kpi_code=t.kpi_code
LEFT JOIN latest l ON l.tenant_id=t.tenant_id AND l.kpi_code=t.kpi_code AND COALESCE(l.warehouse_id,'00000000-0000-0000-0000-000000000000'::UUID)=COALESCE(t.warehouse_id,'00000000-0000-0000-0000-000000000000'::UUID)
WHERE t.tenant_id=public.current_user_tenant_id() AND t.is_active;
GRANT SELECT ON public.inventory_kpi_scorecard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_executive_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  COALESCE((SELECT estimated_value FROM public.inventory_kpis LIMIT 1),0) AS inventory_value,
  COALESCE((SELECT ira_percent FROM public.inventory_ira_dashboard LIMIT 1),100) AS inventory_accuracy_percent,
  COALESCE((SELECT avg_space_utilization FROM public.inventory_storage_kpis LIMIT 1),0) AS space_utilization_percent,
  COALESCE((SELECT perfect_order_foundation_rate FROM public.inventory_shipping_kpis LIMIT 1),0) AS perfect_order_rate,
  COALESCE((SELECT avg_dock_to_stock_hours FROM public.inventory_receiving_kpis LIMIT 1),0) AS dock_to_stock_hours,
  COALESCE((SELECT pick_accuracy_percent FROM public.inventory_picking_kpis LIMIT 1),0) AS pick_accuracy_percent,
  COALESCE((SELECT shipping_cost_per_order FROM public.inventory_shipping_kpis LIMIT 1),0) AS shipping_cost_per_order,
  (SELECT COUNT(*) FROM public.inventory_analytics_alerts a WHERE a.tenant_id=public.current_user_tenant_id() AND a.status='open' AND a.severity='urgent') AS urgent_alerts,
  (SELECT COUNT(*) FROM public.inventory_kpi_scorecard s WHERE s.color_status='red') AS red_kpis;
GRANT SELECT ON public.inventory_executive_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_operations_manager_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.inventory_labor_dispatch_tasks WHERE tenant_id=public.current_user_tenant_id() AND status='completed' AND created_at::DATE=CURRENT_DATE) AS completed_tasks_today,
  (SELECT COUNT(*) FROM public.inventory_labor_dispatch_tasks WHERE tenant_id=public.current_user_tenant_id() AND status IN ('open','assigned','in_progress') AND created_at::DATE=CURRENT_DATE) AS active_tasks_today,
  COALESCE((SELECT AVG(productivity_percent) FROM public.inventory_employee_performance_realtime),0) AS team_productivity_percent,
  (SELECT COUNT(*) FROM public.inventory_labor_dispatch_tasks WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS waiting_tasks,
  (SELECT COUNT(*) FROM public.inventory_dock_appointments WHERE tenant_id=public.current_user_tenant_id() AND status IN ('scheduled','checked_in','unloading') AND scheduled_start::DATE=CURRENT_DATE) AS active_dock_appointments,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('order',pick_order_number,'source_type',source_type,'priority',priority,'status',status,'due_at',due_at)),'[]'::JSONB) FROM public.inventory_pick_orders WHERE tenant_id=public.current_user_tenant_id() AND status IN ('released','in_progress','partially_picked') AND due_at <= NOW()+INTERVAL '2 hours') AS critical_orders;
GRANT SELECT ON public.inventory_operations_manager_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_shift_supervisor_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]'::JSONB) FROM public.inventory_employee_performance_realtime p) AS employees_now,
  (SELECT COUNT(*) FROM public.inventory_worker_availability WHERE tenant_id=public.current_user_tenant_id() AND work_date=CURRENT_DATE AND status='available' AND available_from < NOW()-INTERVAL '8 minutes') AS idle_workers_8min,
  (SELECT COUNT(*) FROM public.inventory_packages WHERE tenant_id=public.current_user_tenant_id() AND status IN ('open','verified')) AS packing_queue,
  (SELECT COUNT(*) FROM public.inventory_labor_dispatch_tasks WHERE tenant_id=public.current_user_tenant_id() AND status='open' AND priority>=80) AS urgent_open_tasks;
GRANT SELECT ON public.inventory_shift_supervisor_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_kpi_trends WITH (security_invoker=true) AS
SELECT s.tenant_id,s.kpi_code,c.kpi_group,c.name_ar,s.snapshot_period,s.snapshot_date,s.kpi_value,
  LAG(s.kpi_value) OVER (PARTITION BY s.tenant_id,s.kpi_code ORDER BY s.snapshot_date) AS previous_value,
  s.kpi_value - LAG(s.kpi_value) OVER (PARTITION BY s.tenant_id,s.kpi_code ORDER BY s.snapshot_date) AS delta_value
FROM public.inventory_analytics_kpi_snapshots s JOIN public.inventory_analytics_kpi_catalog c ON c.kpi_code=s.kpi_code
WHERE s.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.inventory_kpi_trends TO authenticated;

CREATE OR REPLACE VIEW public.inventory_inventory_heatmap_analytics WITH (security_invoker=true) AS
SELECT l.tenant_id,l.warehouse_id,l.zone_id,l.id AS location_id,l.location_code,l.full_location_code,l.aisle_code,
  COUNT(m.id) AS movement_count,
  COALESCE(SUM(m.quantity),0) AS movement_qty,
  ROUND(COALESCE(l.current_capacity_used,0)/NULLIF(l.max_capacity,0)*100,2) AS capacity_percent,
  CASE WHEN COUNT(m.id) >= 100 THEN 'hot' WHEN COUNT(m.id) >= 20 THEN 'warm' ELSE 'cold' END AS heat_level
FROM public.inventory_locations l LEFT JOIN public.inventory_stock_movements m ON m.location_id=l.id AND m.tenant_id=l.tenant_id AND m.movement_date >= NOW()-INTERVAL '90 days'
WHERE l.tenant_id=public.current_user_tenant_id()
GROUP BY l.tenant_id,l.warehouse_id,l.zone_id,l.id,l.location_code,l.full_location_code,l.aisle_code,l.current_capacity_used,l.max_capacity;
GRANT SELECT ON public.inventory_inventory_heatmap_analytics TO authenticated;

CREATE OR REPLACE VIEW public.inventory_seasonal_inventory_patterns WITH (security_invoker=true) AS
WITH monthly AS (
  SELECT
    m.tenant_id,
    m.item_id,
    i.item_code,
    i.name_ar AS item_name,
    EXTRACT(QUARTER FROM m.movement_date)::INT AS quarter_no,
    EXTRACT(MONTH FROM m.movement_date)::INT AS month_no,
    TO_CHAR(m.movement_date,'Mon') AS month_name,
    SUM(CASE WHEN m.movement_type IN ('issue','pick','ship','transfer_out','return_out','scrap') THEN m.quantity ELSE 0 END) AS outbound_qty,
    COUNT(*) AS movement_count
  FROM public.inventory_stock_movements m
  JOIN public.inventory_items i ON i.id=m.item_id AND i.tenant_id=m.tenant_id
  WHERE m.tenant_id=public.current_user_tenant_id() AND m.movement_date >= NOW()-INTERVAL '24 months'
  GROUP BY m.tenant_id,m.item_id,i.item_code,i.name_ar,EXTRACT(QUARTER FROM m.movement_date)::INT,EXTRACT(MONTH FROM m.movement_date)::INT,TO_CHAR(m.movement_date,'Mon')
)
SELECT
  tenant_id,
  item_id,
  item_code,
  item_name,
  quarter_no,
  month_name,
  outbound_qty,
  movement_count,
  ROUND(AVG(outbound_qty) OVER (PARTITION BY tenant_id,item_id,quarter_no),2) AS avg_quarter_qty
FROM monthly;
GRANT SELECT ON public.inventory_seasonal_inventory_patterns TO authenticated;

CREATE OR REPLACE VIEW public.inventory_root_cause_dashboard WITH (security_invoker=true) AS
SELECT * FROM public.inventory_root_cause_analyses
WHERE tenant_id=public.current_user_tenant_id()
ORDER BY created_at DESC;
GRANT SELECT ON public.inventory_root_cause_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_predictive_alerts_queue WITH (security_invoker=true) AS
SELECT * FROM public.inventory_analytics_alerts
WHERE tenant_id=public.current_user_tenant_id() AND status='open'
ORDER BY CASE severity WHEN 'urgent' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC;
GRANT SELECT ON public.inventory_predictive_alerts_queue TO authenticated;

CREATE OR REPLACE VIEW public.inventory_periodic_reports_dashboard WITH (security_invoker=true) AS
SELECT r.tenant_id,r.report_number,r.report_type,r.period_start,r.period_end,r.delivery_status,r.generated_at,COUNT(e.id) AS export_count,COUNT(e.id) FILTER (WHERE e.status='ready') AS ready_exports
FROM public.inventory_periodic_report_runs r LEFT JOIN public.inventory_report_exports e ON e.report_run_id=r.id AND e.tenant_id=r.tenant_id
WHERE r.tenant_id=public.current_user_tenant_id()
GROUP BY r.tenant_id,r.report_number,r.report_type,r.period_start,r.period_end,r.delivery_status,r.generated_at;
GRANT SELECT ON public.inventory_periodic_reports_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_operating_cost_dashboard WITH (security_invoker=true) AS
SELECT tenant_id,cost_date,cost_category,SUM(amount) AS total_amount,SUM(units_handled) AS units_handled,ROUND(SUM(amount)/NULLIF(SUM(units_handled),0),4) AS cost_per_unit
FROM public.inventory_operating_cost_entries
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id,cost_date,cost_category;
GRANT SELECT ON public.inventory_operating_cost_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_analytics_kpi_targets') IS NULL
     OR to_regclass('public.inventory_analytics_kpi_snapshots') IS NULL
     OR to_regclass('public.inventory_executive_dashboard') IS NULL
     OR to_regclass('public.inventory_kpi_scorecard') IS NULL
     OR to_regclass('public.inventory_predictive_alerts_queue') IS NULL
     OR to_regprocedure('public.refresh_inventory_kpi_snapshots(date)') IS NULL
     OR to_regprocedure('public.generate_inventory_predictive_alerts()') IS NULL THEN
    RAISE EXCEPTION '0212 failed: warehouse analytics objects missing';
  END IF;
  RAISE NOTICE '✅ 0212: Inventory warehouse analytics and KPI dashboard applied';
END $$;
