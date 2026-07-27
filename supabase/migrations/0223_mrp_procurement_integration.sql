-- ============================================================================
-- 0223 — MRP Unit 05: Procurement & Supplier Management Integration
-- docs/mrp/05-procurement-supplier-management.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_procurement_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recommendation_number TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('mrp_run','bom_explosion','reorder_point','manual')),
  source_id UUID,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_code TEXT,
  description TEXT NOT NULL,
  required_qty NUMERIC(18,6) NOT NULL CHECK (required_qty > 0),
  uom TEXT NOT NULL DEFAULT 'PCS',
  required_date DATE,
  suggested_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  estimated_unit_price NUMERIC(16,4) NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent','emergency')),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','reviewed','converted_to_pr','rfq_required','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,recommendation_number)
);

CREATE TABLE IF NOT EXISTS public.mrp_procurement_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES public.mrp_procurement_recommendations(id) ON DELETE CASCADE,
  pr_id UUID REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  gr_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  link_type TEXT NOT NULL DEFAULT 'pr' CHECK (link_type IN ('pr','po','gr','invoice')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_supplier_tco_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES public.mrp_procurement_recommendations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  quoted_unit_price NUMERIC(16,4) NOT NULL DEFAULT 0,
  lead_time_days INT DEFAULT 0,
  quality_score NUMERIC(8,4) DEFAULT 0,
  otif_score NUMERIC(8,4) DEFAULT 0,
  delay_risk_cost NUMERIC(16,4) DEFAULT 0,
  quality_risk_cost NUMERIC(16,4) DEFAULT 0,
  tco_score NUMERIC(16,4) GENERATED ALWAYS AS (quoted_unit_price + delay_risk_cost + quality_risk_cost) STORED,
  ranking INT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','shortlisted','awarded','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_procurement_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES public.mrp_procurement_recommendations(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('material_shortage','contract_expiring','supplier_blocked','late_po','quality_risk','emergency_purchase')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','urgent')),
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.create_mrp_procurement_recommendation(p_item_id UUID,p_required_qty NUMERIC,p_required_date DATE,p_priority TEXT DEFAULT 'normal',p_source_type TEXT DEFAULT 'manual',p_source_id UUID DEFAULT NULL,p_supplier_id UUID DEFAULT NULL,p_unit_price NUMERIC DEFAULT 0,p_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_item RECORD; v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  SELECT * INTO v_item FROM public.inventory_items WHERE id=p_item_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  INSERT INTO public.mrp_procurement_recommendations(tenant_id,recommendation_number,source_type,source_id,item_id,item_code,description,required_qty,uom,required_date,suggested_supplier_id,estimated_unit_price,priority,reason,created_by)
  VALUES(v_tenant,public.generate_mrp_next_code('mrp_pr_rec',NULL),p_source_type,p_source_id,p_item_id,v_item.item_code,v_item.name_ar,p_required_qty,v_item.base_uom,p_required_date,p_supplier_id,COALESCE(p_unit_price,0),COALESCE(p_priority,'normal'),p_reason,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_procurement_recommendation(UUID,NUMERIC,DATE,TEXT,TEXT,UUID,UUID,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_procurement_recommendations_from_shortages(p_explosion_run_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); r RECORD; v_count INT:=0;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  FOR r IN SELECT l.*, i.item_code, i.name_ar, i.base_uom FROM public.mrp_bom_explosion_lines l JOIN public.inventory_items i ON i.id=l.component_item_id AND i.tenant_id=l.tenant_id WHERE l.tenant_id=v_tenant AND l.run_id=p_explosion_run_id AND l.shortage_quantity>0 AND COALESCE(l.supply_type,'buy') IN ('buy','subcontract') LOOP
    INSERT INTO public.mrp_procurement_recommendations(tenant_id,recommendation_number,source_type,source_id,item_id,item_code,description,required_qty,uom,required_date,priority,reason,created_by)
    VALUES(v_tenant,public.generate_mrp_next_code('mrp_pr_rec',NULL),'bom_explosion',p_explosion_run_id,r.component_item_id,r.item_code,r.name_ar,r.shortage_quantity,r.base_uom,CURRENT_DATE + COALESCE((SELECT lead_time_days FROM public.mrp_bom_lines WHERE id=r.bom_line_id),0),'urgent','Shortage from BOM explosion',auth.uid());
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_procurement_recommendations_from_shortages(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_mrp_recommendation_to_pr(p_recommendation_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_rec RECORD; v_pr UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  SELECT * INTO v_rec FROM public.mrp_procurement_recommendations WHERE id=p_recommendation_id AND tenant_id=v_tenant AND status IN ('suggested','reviewed','rfq_required');
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOMMENDATION_NOT_CONVERTIBLE'; END IF;
  SELECT public.create_purchase_requisition_full(NULL,NULL,v_rec.required_date,v_rec.priority,'raw_material',COALESCE(v_rec.reason,'MRP generated requirement'),NULL,'mrp','SAR',jsonb_build_array(jsonb_build_object('item_code',v_rec.item_code,'description',v_rec.description,'quantity',v_rec.required_qty,'unit',v_rec.uom,'estimated_unit_price',v_rec.estimated_unit_price,'suggested_supplier_id',COALESCE(v_rec.suggested_supplier_id::TEXT,''),'notes','Generated from MRP recommendation '||v_rec.recommendation_number))) INTO v_pr;
  INSERT INTO public.mrp_procurement_links(tenant_id,recommendation_id,pr_id,link_type) VALUES(v_tenant,p_recommendation_id,v_pr,'pr');
  UPDATE public.mrp_procurement_recommendations SET status='converted_to_pr', reviewed_by=auth.uid(), reviewed_at=NOW() WHERE id=p_recommendation_id AND tenant_id=v_tenant;
  RETURN v_pr;
END $$;
GRANT EXECUTE ON FUNCTION public.convert_mrp_recommendation_to_pr(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mrp_supplier_tco_candidate(p_recommendation_id UUID,p_supplier_id UUID,p_quoted_unit_price NUMERIC,p_lead_time_days INT DEFAULT 0,p_quality_score NUMERIC DEFAULT 0,p_otif_score NUMERIC DEFAULT 0,p_delay_risk_cost NUMERIC DEFAULT 0,p_quality_risk_cost NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  INSERT INTO public.mrp_supplier_tco_evaluations(tenant_id,recommendation_id,supplier_id,quoted_unit_price,lead_time_days,quality_score,otif_score,delay_risk_cost,quality_risk_cost)
  VALUES(v_tenant,p_recommendation_id,p_supplier_id,p_quoted_unit_price,p_lead_time_days,p_quality_score,p_otif_score,p_delay_risk_cost,p_quality_risk_cost) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_supplier_tco_candidate(UUID,UUID,NUMERIC,INT,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_mrp_procurement_alerts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v_rows INT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','mrp_planner','production_manager']::TEXT[]);
  INSERT INTO public.mrp_procurement_alerts(tenant_id,recommendation_id,alert_type,severity,title,body)
  SELECT v_tenant,id,'material_shortage','urgent','نقص مادة يحتاج شراء',description||' كمية '||required_qty FROM public.mrp_procurement_recommendations WHERE tenant_id=v_tenant AND status IN ('suggested','reviewed');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count:=v_count+v_rows;
  INSERT INTO public.mrp_procurement_alerts(tenant_id,supplier_id,alert_type,severity,title,body)
  SELECT v_tenant,supplier_id,'contract_expiring','warning','عقد مورد يقترب من الانتهاء',contract_number||' ينتهي في '||end_date FROM public.contract_renewals_upcoming WHERE tenant_id=v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count:=v_count+v_rows;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_mrp_procurement_alerts() TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mrp_procurement_recommendations','mrp_procurement_links','mrp_supplier_tco_evaluations','mrp_procurement_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''procurement'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''procurement'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''manufacturing'',''procurement'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.mrp_procurement_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.mrp_procurement_recommendations WHERE tenant_id=public.current_user_tenant_id() AND status IN ('suggested','reviewed')) AS open_recommendations,
  (SELECT COUNT(*) FROM public.purchase_requisitions WHERE tenant_id=public.current_user_tenant_id() AND source='mrp') AS mrp_pr_count,
  (SELECT COUNT(*) FROM public.purchase_orders WHERE tenant_id=public.current_user_tenant_id() AND status NOT IN ('closed','cancelled')) AS open_pos,
  (SELECT COUNT(*) FROM public.mrp_procurement_alerts WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_alerts;
GRANT SELECT ON public.mrp_procurement_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_recommendation_queue WITH (security_invoker=true) AS
SELECT r.*, s.supplier_code, s.legal_name AS supplier_name FROM public.mrp_procurement_recommendations r LEFT JOIN public.suppliers s ON s.id=r.suggested_supplier_id AND s.tenant_id=r.tenant_id WHERE r.tenant_id=public.current_user_tenant_id() ORDER BY CASE r.priority WHEN 'emergency' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, r.required_date NULLS LAST;
GRANT SELECT ON public.mrp_procurement_recommendation_queue TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_pr_status WITH (security_invoker=true) AS
SELECT pr.id,pr.tenant_id,pr.pr_number,pr.status,pr.priority,pr.needed_by_date,pr.total_estimated,l.recommendation_id,r.recommendation_number FROM public.purchase_requisitions pr LEFT JOIN public.mrp_procurement_links l ON l.pr_id=pr.id AND l.tenant_id=pr.tenant_id LEFT JOIN public.mrp_procurement_recommendations r ON r.id=l.recommendation_id AND r.tenant_id=l.tenant_id WHERE pr.tenant_id=public.current_user_tenant_id() AND pr.source='mrp';
GRANT SELECT ON public.mrp_procurement_pr_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_po_status WITH (security_invoker=true) AS
SELECT po.tenant_id,po.id,po.po_number,po.status,po.delivery_date,po.total_before_tax,po.total_amount,s.supplier_code,s.legal_name AS supplier_name,po.pr_id FROM public.purchase_orders po JOIN public.suppliers s ON s.id=po.supplier_id AND s.tenant_id=po.tenant_id WHERE po.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_procurement_po_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_gr_status WITH (security_invoker=true) AS
SELECT gr.tenant_id,gr.id,gr.gr_number,gr.status,gr.received_at AS received_date,gr.po_id,po.po_number FROM public.goods_receipts gr LEFT JOIN public.purchase_orders po ON po.id=gr.po_id AND po.tenant_id=gr.tenant_id WHERE gr.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_procurement_gr_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_invoice_match_status WITH (security_invoker=true) AS
SELECT i.tenant_id,i.id,i.invoice_number,i.status,i.total_amount,i.po_id,po.po_number,i.supplier_id,s.supplier_code,s.legal_name AS supplier_name FROM public.supplier_invoices i LEFT JOIN public.purchase_orders po ON po.id=i.po_id AND po.tenant_id=i.tenant_id LEFT JOIN public.suppliers s ON s.id=i.supplier_id AND s.tenant_id=i.tenant_id WHERE i.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_procurement_invoice_match_status TO authenticated;

CREATE OR REPLACE VIEW public.mrp_supplier_scorecard WITH (security_invoker=true) AS
SELECT s.tenant_id,s.id AS supplier_id,s.supplier_code,s.legal_name,
  COUNT(po.id) AS po_count,
  ROUND(COUNT(po.id) FILTER (WHERE po.status IN ('received','closed'))::NUMERIC/NULLIF(COUNT(po.id),0)*100,2) AS otif_proxy_percent,
  ROUND(COUNT(gr.id) FILTER (WHERE gr.status IN ('accepted','received','completed'))::NUMERIC/NULLIF(COUNT(gr.id),0)*100,2) AS quality_proxy_percent,
  COALESCE(AVG(tco.tco_score),0) AS avg_tco_score,
  CASE WHEN COALESCE(AVG(tco.tco_score),0)=0 THEN 'unrated' WHEN COALESCE(AVG(tco.tco_score),0)<100 THEN 'excellent' WHEN COALESCE(AVG(tco.tco_score),0)<500 THEN 'approved' ELSE 'review' END AS supplier_grade
FROM public.suppliers s LEFT JOIN public.purchase_orders po ON po.supplier_id=s.id AND po.tenant_id=s.tenant_id LEFT JOIN public.goods_receipts gr ON gr.po_id=po.id AND gr.tenant_id=po.tenant_id LEFT JOIN public.mrp_supplier_tco_evaluations tco ON tco.supplier_id=s.id AND tco.tenant_id=s.tenant_id
WHERE s.tenant_id=public.current_user_tenant_id()
GROUP BY s.tenant_id,s.id,s.supplier_code,s.legal_name;
GRANT SELECT ON public.mrp_supplier_scorecard TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_contract_alerts WITH (security_invoker=true) AS
SELECT tenant_id,id AS contract_id,contract_number,supplier_id,title,end_date,days_until_expiry AS days_to_expiry FROM public.contract_renewals_upcoming WHERE tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_procurement_contract_alerts TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_kpis WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.purchase_requisitions WHERE tenant_id=public.current_user_tenant_id() AND source='mrp') AS mrp_pr_count,
  (SELECT ROUND(AVG(EXTRACT(DAY FROM (po.created_at-pr.created_at))),2) FROM public.purchase_requisitions pr JOIN public.purchase_orders po ON po.pr_id=pr.id AND po.tenant_id=pr.tenant_id WHERE pr.tenant_id=public.current_user_tenant_id() AND pr.source='mrp') AS avg_pr_to_po_days,
  (SELECT COUNT(*) FROM public.purchase_requisitions WHERE tenant_id=public.current_user_tenant_id() AND priority='emergency') AS emergency_pr_count,
  (SELECT COUNT(*) FROM public.mrp_supplier_scorecard WHERE tenant_id=public.current_user_tenant_id() AND supplier_grade='excellent') AS excellent_suppliers;
GRANT SELECT ON public.mrp_procurement_kpis TO authenticated;

CREATE OR REPLACE VIEW public.mrp_procurement_alert_queue WITH (security_invoker=true) AS
SELECT * FROM public.mrp_procurement_alerts WHERE tenant_id=public.current_user_tenant_id() AND status='open' ORDER BY CASE severity WHEN 'urgent' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC;
GRANT SELECT ON public.mrp_procurement_alert_queue TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.mrp_procurement_recommendations') IS NULL OR to_regclass('public.mrp_procurement_dashboard') IS NULL OR to_regprocedure('public.convert_mrp_recommendation_to_pr(uuid)') IS NULL THEN
    RAISE EXCEPTION '0223 failed: MRP procurement integration objects missing';
  END IF;
  RAISE NOTICE '✅ 0223: MRP procurement and supplier integration applied';
END $$;
