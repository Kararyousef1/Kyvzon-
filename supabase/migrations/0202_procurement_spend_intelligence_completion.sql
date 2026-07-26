-- ============================================================================
-- 0202 — Procurement Spend Intelligence Completion (Unit 07)
-- التوثيق: docs/e-procurement/07-spend-analysis-procurement-intelligence.md
-- يغطي: data collector, cleansing, classification, category strategy, executive KPIs, alerts, export views.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.p_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cardholder_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  supplier_name TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  amount NUMERIC(16,2) NOT NULL,
  currency_code CHAR(3) DEFAULT 'SAR' REFERENCES public.currencies(code),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  category_code TEXT,
  is_imported BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p_card_tenant_date ON public.p_card_transactions(tenant_id, transaction_date DESC);

CREATE TABLE IF NOT EXISTS public.supplier_name_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_supplier_alias_norm ON public.supplier_name_aliases(tenant_id, normalized_name);

CREATE TABLE IF NOT EXISTS public.spend_category_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL,
  strategy_title TEXT NOT NULL,
  current_state TEXT,
  market_analysis TEXT,
  target_savings_percent NUMERIC(5,2) DEFAULT 0,
  preferred_supplier_count INT DEFAULT 2,
  contract_coverage_target_percent NUMERIC(5,2) DEFAULT 70,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, category_code)
);

CREATE TABLE IF NOT EXISTS public.spend_intelligence_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price_increase','supplier_concentration','maverick_spend','contract_expiry','tail_spend','forecast_variance')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  related_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_code TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_spend_alerts_tenant ON public.spend_intelligence_alerts(tenant_id, status, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['p_card_transactions','supplier_name_aliases','spend_category_strategies','spend_intelligence_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin''));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin''));', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_supplier_name(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(coalesce(p_name,''), '[^[:alnum:]]+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.collect_procurement_spend_transactions()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v_before INT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  SELECT COUNT(*) INTO v_before FROM public.spend_transactions WHERE tenant_id=v_tenant;

  -- PO source
  INSERT INTO public.spend_transactions(tenant_id,source,supplier_id,po_id,category_code,amount,currency_code,transaction_date,cost_center_id,is_maverick,is_tail)
  SELECT po.tenant_id,'po',po.supplier_id,po.id,pl.item_code,po.total_amount,po.currency_code,po.created_at::DATE,NULL,false,false
  FROM public.purchase_orders po
  LEFT JOIN LATERAL (SELECT item_code FROM public.po_line_items WHERE po_id=po.id LIMIT 1) pl ON true
  WHERE po.tenant_id=v_tenant AND po.status NOT IN ('cancelled','draft')
    AND NOT EXISTS (SELECT 1 FROM public.spend_transactions st WHERE st.tenant_id=v_tenant AND st.source='po' AND st.po_id=po.id);

  -- paid/approved invoice source
  INSERT INTO public.spend_transactions(tenant_id,source,supplier_id,po_id,invoice_id,category_code,amount,currency_code,transaction_date,cost_center_id,is_maverick,is_tail)
  SELECT si.tenant_id,'invoice',si.supplier_id,si.po_id,si.id,il.item_code,si.total_amount,COALESCE(si.currency_code,'SAR'),si.invoice_date,NULL,(si.po_id IS NULL OR s.status<>'approved'),false
  FROM public.supplier_invoices si
  LEFT JOIN public.suppliers s ON s.id=si.supplier_id AND s.tenant_id=si.tenant_id
  LEFT JOIN LATERAL (SELECT item_code FROM public.invoice_line_items WHERE invoice_id=si.id LIMIT 1) il ON true
  WHERE si.tenant_id=v_tenant AND si.status IN ('approved','paid','matched')
    AND NOT EXISTS (SELECT 1 FROM public.spend_transactions st WHERE st.tenant_id=v_tenant AND st.source='invoice' AND st.invoice_id=si.id);

  -- contract source
  INSERT INTO public.spend_transactions(tenant_id,source,supplier_id,category_code,amount,currency_code,transaction_date,is_maverick,is_tail)
  SELECT pc.tenant_id,'contract',pc.supplier_id,pc.type,COALESCE(pc.total_value,0),COALESCE(pc.currency_code,'SAR'),COALESCE(pc.start_date,CURRENT_DATE),false,false
  FROM public.procurement_contracts pc
  WHERE pc.tenant_id=v_tenant AND pc.status IN ('signed','active') AND COALESCE(pc.total_value,0)>0
    AND NOT EXISTS (SELECT 1 FROM public.spend_transactions st WHERE st.tenant_id=v_tenant AND st.source='contract' AND st.supplier_id=pc.supplier_id AND st.amount=pc.total_value AND st.transaction_date=COALESCE(pc.start_date,CURRENT_DATE));

  -- P-card source
  INSERT INTO public.spend_transactions(tenant_id,source,supplier_id,category_code,amount,currency_code,transaction_date,is_maverick,is_tail)
  SELECT pc.tenant_id,'p_card',COALESCE(pc.supplier_id, a.supplier_id),pc.category_code,pc.amount,pc.currency_code,pc.transaction_date,(COALESCE(pc.supplier_id,a.supplier_id) IS NULL),pc.amount < 5000
  FROM public.p_card_transactions pc
  LEFT JOIN public.supplier_name_aliases a ON a.tenant_id=pc.tenant_id AND a.normalized_name=public.normalize_supplier_name(pc.supplier_name)
  WHERE pc.tenant_id=v_tenant
    AND NOT EXISTS (SELECT 1 FROM public.spend_transactions st WHERE st.tenant_id=v_tenant AND st.source='p_card' AND st.amount=pc.amount AND st.transaction_date=pc.transaction_date AND COALESCE(st.supplier_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(pc.supplier_id,a.supplier_id,'00000000-0000-0000-0000-000000000000'::uuid));

  SELECT COUNT(*)-v_before INTO v_count FROM public.spend_transactions WHERE tenant_id=v_tenant;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.collect_procurement_spend_transactions() TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanse_supplier_aliases()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_s RECORD; v_count INT:=0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  FOR v_s IN SELECT id, legal_name, trade_name FROM public.suppliers WHERE tenant_id=v_tenant LOOP
    INSERT INTO public.supplier_name_aliases(tenant_id,supplier_id,alias_name,normalized_name)
    VALUES(v_tenant,v_s.id,v_s.legal_name,public.normalize_supplier_name(v_s.legal_name)) ON CONFLICT DO NOTHING;
    IF v_s.trade_name IS NOT NULL THEN
      INSERT INTO public.supplier_name_aliases(tenant_id,supplier_id,alias_name,normalized_name)
      VALUES(v_tenant,v_s.id,v_s.trade_name,public.normalize_supplier_name(v_s.trade_name)) ON CONFLICT DO NOTHING;
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.cleanse_supplier_aliases() TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_classify_spend_transactions()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  UPDATE public.spend_transactions st
  SET category_code = COALESCE(st.category_code,
    CASE
      WHEN lower(coalesce(st.source,''))='contract' THEN 'CONTRACT'
      WHEN EXISTS (SELECT 1 FROM public.spend_categories c WHERE c.tenant_id=v_tenant AND c.code=st.category_code) THEN st.category_code
      WHEN st.source='p_card' THEN 'P-CARD'
      ELSE 'UNCLASSIFIED'
    END)
  WHERE st.tenant_id=v_tenant AND (st.category_code IS NULL OR st.category_code='');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.auto_classify_spend_transactions() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_supplier_spend_summary()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  INSERT INTO public.supplier_spend_summary(tenant_id,supplier_id,total_spend,last_12m_spend,maverick_spend,tail_spend_flag,last_calculated_at)
  SELECT tenant_id,supplier_id,SUM(amount),SUM(amount) FILTER (WHERE transaction_date>=CURRENT_DATE-INTERVAL '12 months'),SUM(amount) FILTER (WHERE is_maverick), (SUM(amount)<50000), NOW()
  FROM public.spend_transactions
  WHERE tenant_id=v_tenant AND supplier_id IS NOT NULL
  GROUP BY tenant_id,supplier_id
  ON CONFLICT (tenant_id,supplier_id) DO UPDATE SET total_spend=EXCLUDED.total_spend,last_12m_spend=EXCLUDED.last_12m_spend,maverick_spend=EXCLUDED.maverick_spend,tail_spend_flag=EXCLUDED.tail_spend_flag,last_calculated_at=NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_supplier_spend_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_spend_intelligence_alerts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0; v_r RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  -- supplier concentration >20%
  FOR v_r IN SELECT * FROM public.spend_pareto_80_20 WHERE tenant_id=v_tenant AND cumulative_percent <= 25 LOOP
    INSERT INTO public.spend_intelligence_alerts(tenant_id,alert_type,severity,title,related_supplier_id,details)
    VALUES(v_tenant,'supplier_concentration','warning','تركيز إنفاق مرتفع على مورد',v_r.supplier_id,to_jsonb(v_r)) ON CONFLICT DO NOTHING;
    v_count:=v_count+1;
  END LOOP;
  -- price increases > 8%
  FOR v_r IN SELECT * FROM public.price_trend WHERE tenant_id=v_tenant AND change_percent >= 8 LOOP
    INSERT INTO public.spend_intelligence_alerts(tenant_id,alert_type,severity,title,category_code,details)
    VALUES(v_tenant,'price_increase','warning','ارتفاع سعر صنف بأكثر من 8%',v_r.item_code,to_jsonb(v_r)) ON CONFLICT DO NOTHING;
    v_count:=v_count+1;
  END LOOP;
  -- contracts expiring 30d
  FOR v_r IN SELECT * FROM public.contract_renewals_upcoming WHERE tenant_id=v_tenant AND days_until_expiry <= 30 LOOP
    INSERT INTO public.spend_intelligence_alerts(tenant_id,alert_type,severity,title,related_supplier_id,details)
    VALUES(v_tenant,'contract_expiry','critical','عقد ينتهي خلال 30 يوم',v_r.supplier_id,to_jsonb(v_r)) ON CONFLICT DO NOTHING;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_spend_intelligence_alerts() TO authenticated;

CREATE OR REPLACE VIEW public.procurement_executive_kpis
WITH (security_invoker = true) AS
SELECT
  t.id AS tenant_id,
  COALESCE((SELECT SUM(amount) FROM public.spend_transactions st WHERE st.tenant_id=t.id AND st.transaction_date>=date_trunc('year',CURRENT_DATE)),0) AS total_spend_ytd,
  COALESCE((SELECT SUM(amount) FROM public.spend_transactions st WHERE st.tenant_id=t.id AND st.is_maverick),0) AS maverick_spend,
  COALESCE((SELECT COUNT(*) FROM public.suppliers s WHERE s.tenant_id=t.id AND s.status='approved'),0) AS active_suppliers,
  COALESCE((SELECT COUNT(*) FROM public.contract_renewals_upcoming cr WHERE cr.tenant_id=t.id AND cr.days_until_expiry<=90),0) AS contracts_expiring_90,
  COALESCE((SELECT AVG(otif_score) FROM public.supplier_spend_summary ss WHERE ss.tenant_id=t.id),0) AS avg_supplier_otif,
  COALESCE((SELECT SUM((starting_price-current_best_price)*annual_quantity) FROM public.procurement_auctions a WHERE a.tenant_id=t.id AND a.status='ended'),0) AS auction_savings
FROM public.tenants t
WHERE t.id=public.current_user_tenant_id();
GRANT SELECT ON public.procurement_executive_kpis TO authenticated;

CREATE OR REPLACE VIEW public.spend_category_report
WITH (security_invoker = true) AS
SELECT
  st.tenant_id,
  COALESCE(st.category_code,'UNCLASSIFIED') AS category_code,
  COALESCE(sc.name_ar, st.category_code, 'غير مصنف') AS category_name,
  SUM(st.amount) AS total_spend,
  COUNT(*) AS transaction_count,
  COUNT(DISTINCT st.supplier_id) AS supplier_count,
  SUM(st.amount) FILTER (WHERE st.is_maverick) AS maverick_spend
FROM public.spend_transactions st
LEFT JOIN public.spend_categories sc ON sc.tenant_id=st.tenant_id AND sc.code=st.category_code
WHERE st.tenant_id=public.current_user_tenant_id()
GROUP BY st.tenant_id, COALESCE(st.category_code,'UNCLASSIFIED'), COALESCE(sc.name_ar, st.category_code, 'غير مصنف')
ORDER BY total_spend DESC;
GRANT SELECT ON public.spend_category_report TO authenticated;

CREATE OR REPLACE VIEW public.procurement_export_spend_report
WITH (security_invoker = true) AS
SELECT
  st.transaction_date,
  st.source,
  st.amount,
  st.currency_code,
  st.category_code,
  s.supplier_code,
  s.legal_name AS supplier_name,
  st.is_maverick,
  st.is_tail
FROM public.spend_transactions st
LEFT JOIN public.suppliers s ON s.id=st.supplier_id AND s.tenant_id=st.tenant_id
WHERE st.tenant_id=public.current_user_tenant_id()
ORDER BY st.transaction_date DESC;
GRANT SELECT ON public.procurement_export_spend_report TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.collect_procurement_spend_transactions()') IS NULL THEN RAISE EXCEPTION '0202 failed: collector missing'; END IF;
  IF to_regclass('public.procurement_executive_kpis') IS NULL THEN RAISE EXCEPTION '0202 failed: executive kpis missing'; END IF;
  RAISE NOTICE '✅ 0202: Spend intelligence completion applied';
END $$;
