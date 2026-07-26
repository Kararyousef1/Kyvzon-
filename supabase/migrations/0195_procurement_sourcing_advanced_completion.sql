-- ============================================================================
-- 0195 — Procurement Strategic Sourcing Advanced Completion (Unit 02)
-- التوثيق: docs/e-procurement/02-strategic-sourcing-RFx.md
-- يغطي المتبقي: RFx templates/builder, MECCA weighted scorecards, auction lifecycle, price archive.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rfx_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RFI','RFQ','RFP','auction')),
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, template_name, type)
);
CREATE INDEX IF NOT EXISTS idx_rfx_templates_tenant ON public.rfx_templates(tenant_id, type, is_active);

CREATE TABLE IF NOT EXISTS public.rfx_evaluation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  criterion_key TEXT NOT NULL,
  label_ar TEXT NOT NULL,
  label_en TEXT,
  weight_percent NUMERIC(5,2) NOT NULL CHECK (weight_percent >= 0 AND weight_percent <= 100),
  max_score NUMERIC(8,2) NOT NULL DEFAULT 100,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, event_id, criterion_key)
);
CREATE INDEX IF NOT EXISTS idx_rfx_criteria_event ON public.rfx_evaluation_criteria(event_id, sort_order);

CREATE TABLE IF NOT EXISTS public.rfx_bid_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  bid_id UUID NOT NULL REFERENCES public.supplier_bids(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  weighted_total NUMERIC(8,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, bid_id, evaluator_id)
);
CREATE INDEX IF NOT EXISTS idx_rfx_scorecards_bid ON public.rfx_bid_scorecards(bid_id, weighted_total DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rfx_templates','rfx_evaluation_criteria','rfx_bid_scorecards'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''manager'',''developer'',''it_admin''));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin''));', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.seed_default_rfx_templates()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_count INT := 0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  INSERT INTO public.rfx_templates(tenant_id, template_name, type, sections, default_criteria, created_by)
  VALUES
    (v_tenant, 'قالب RFI — بحث سوق', 'RFI',
     '[{"section":"company","title":"معلومات الشركة"},{"section":"capabilities","title":"القدرات والشهادات"},{"section":"references","title":"المرجعيات"}]'::jsonb,
     '[{"key":"capability","label_ar":"القدرة الفنية","weight":40},{"key":"compliance","label_ar":"الامتثال والشهادات","weight":30},{"key":"references","label_ar":"المرجعيات","weight":30}]'::jsonb,
     auth.uid()),
    (v_tenant, 'قالب RFQ — خامات معيارية', 'RFQ',
     '[{"section":"scope","title":"المواصفات والكميات"},{"section":"quality","title":"متطلبات الجودة"},{"section":"delivery","title":"شروط التسليم"},{"section":"commercial","title":"متطلبات السعر"}]'::jsonb,
     '[{"key":"price","label_ar":"السعر","weight":45},{"key":"quality","label_ar":"الجودة والشهادات","weight":25},{"key":"delivery","label_ar":"التسليم","weight":20},{"key":"payment","label_ar":"شروط الدفع","weight":10}]'::jsonb,
     auth.uid()),
    (v_tenant, 'قالب RFP — حل مخصص', 'RFP',
     '[{"section":"overview","title":"خلفية وأهداف المشروع"},{"section":"scope","title":"نطاق العمل"},{"section":"response","title":"متطلبات الاستجابة"},{"section":"legal","title":"الشروط القانونية"}]'::jsonb,
     '[{"key":"experience","label_ar":"الخبرة والمرجعيات","weight":25},{"key":"methodology","label_ar":"المنهجية والحل","weight":30},{"key":"team","label_ar":"الفريق والكفاءات","weight":20},{"key":"commercial","label_ar":"السعر وشروط الدفع","weight":25}]'::jsonb,
     auth.uid())
  ON CONFLICT (tenant_id, template_name, type) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_default_rfx_templates() TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_rfx_template(
  p_event_id UUID,
  p_template_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_tpl RECORD;
  v_section JSONB;
  v_criterion JSONB;
  v_order INT := 0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_sourcing_event_in_tenant(p_event_id);
  SELECT * INTO v_tpl FROM public.rfx_templates WHERE id=p_template_id AND tenant_id=v_tenant AND is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFX_TEMPLATE_NOT_FOUND'; END IF;

  FOR v_section IN SELECT * FROM jsonb_array_elements(v_tpl.sections) LOOP
    INSERT INTO public.rfx_documents(tenant_id,event_id,section,title,content,weight_percent)
    VALUES (v_tenant,p_event_id,COALESCE(v_section->>'section','requirements'),COALESCE(v_section->>'title','قسم'),COALESCE(v_section->>'content',''),NULL);
  END LOOP;

  FOR v_criterion IN SELECT * FROM jsonb_array_elements(v_tpl.default_criteria) LOOP
    v_order := v_order + 1;
    INSERT INTO public.rfx_evaluation_criteria(tenant_id,event_id,criterion_key,label_ar,label_en,weight_percent,sort_order)
    VALUES (v_tenant,p_event_id,COALESCE(v_criterion->>'key','criterion_'||v_order),COALESCE(v_criterion->>'label_ar','معيار'),v_criterion->>'label_en',COALESCE((v_criterion->>'weight')::NUMERIC,0),v_order)
    ON CONFLICT (tenant_id,event_id,criterion_key) DO UPDATE SET label_ar=EXCLUDED.label_ar, weight_percent=EXCLUDED.weight_percent, sort_order=EXCLUDED.sort_order;
  END LOOP;

  PERFORM public.log_rfx_audit(p_event_id,'template_applied','rfx_templates',p_template_id,NULL,to_jsonb(v_tpl),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.apply_rfx_template(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.score_bid_mecca(
  p_bid_id UUID,
  p_scores JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_bid RECORD;
  v_criterion RECORD;
  v_score NUMERIC;
  v_total NUMERIC := 0;
  v_weight_sum NUMERIC := 0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','manager']::TEXT[]);
  SELECT * INTO v_bid FROM public.supplier_bids WHERE id=p_bid_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'BID_NOT_FOUND'; END IF;

  FOR v_criterion IN SELECT * FROM public.rfx_evaluation_criteria WHERE event_id=v_bid.event_id AND tenant_id=v_tenant LOOP
    v_score := COALESCE((p_scores->>v_criterion.criterion_key)::NUMERIC,0);
    IF v_score < 0 OR v_score > v_criterion.max_score THEN
      RAISE EXCEPTION 'INVALID_SCORE_FOR_%', v_criterion.criterion_key;
    END IF;
    v_total := v_total + (v_score / NULLIF(v_criterion.max_score,0)) * v_criterion.weight_percent;
    v_weight_sum := v_weight_sum + v_criterion.weight_percent;
  END LOOP;

  IF v_weight_sum = 0 THEN RAISE EXCEPTION 'NO_EVALUATION_CRITERIA'; END IF;
  v_total := ROUND((v_total / v_weight_sum * 100)::NUMERIC, 2);

  INSERT INTO public.rfx_bid_scorecards(tenant_id,event_id,bid_id,evaluator_id,scores,weighted_total,notes)
  VALUES (v_tenant,v_bid.event_id,p_bid_id,auth.uid(),p_scores,v_total,p_notes)
  ON CONFLICT (tenant_id,bid_id,evaluator_id) DO UPDATE SET scores=EXCLUDED.scores, weighted_total=EXCLUDED.weighted_total, notes=EXCLUDED.notes, updated_at=NOW();

  PERFORM public.log_rfx_audit(v_bid.event_id,'bid_mecca_scored','rfx_bid_scorecards',p_bid_id,NULL,jsonb_build_object('weighted_total',v_total,'scores',p_scores),p_notes);
  RETURN v_total;
END $$;
GRANT EXECUTE ON FUNCTION public.score_bid_mecca(UUID,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_procurement_auction_from_event(
  p_event_id UUID,
  p_auction_type TEXT DEFAULT 'british',
  p_duration_minutes INT DEFAULT 45
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_line RECORD;
  v_event RECORD;
  v_auction_id UUID;
  v_number TEXT;
  v_start NUMERIC;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_sourcing_event_in_tenant(p_event_id);
  IF p_auction_type NOT IN ('british','japanese','dutch') THEN RAISE EXCEPTION 'INVALID_AUCTION_TYPE'; END IF;
  SELECT * INTO v_event FROM public.sourcing_events WHERE id=p_event_id AND tenant_id=v_tenant;
  SELECT * INTO v_line FROM public.rfx_line_items WHERE event_id=p_event_id AND tenant_id=v_tenant ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_RFX_LINE_FOR_AUCTION'; END IF;
  SELECT COALESCE(MIN(effective_price), MAX(quantity * 1)) INTO v_start FROM public.supplier_bids WHERE event_id=p_event_id AND tenant_id=v_tenant;
  IF v_start IS NULL OR v_start <= 0 THEN v_start := 1; END IF;
  v_number := 'AUC-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');
  INSERT INTO public.procurement_auctions(tenant_id,sourcing_event_id,auction_number,item_description,annual_quantity,unit,auction_type,starting_price,current_best_price,start_time,end_time,status,created_by)
  VALUES (v_tenant,p_event_id,v_number,COALESCE(v_line.description,v_event.title),v_line.quantity,v_line.unit,p_auction_type,v_start,v_start,NOW(),NOW()+(p_duration_minutes||' minutes')::INTERVAL,'live',auth.uid())
  RETURNING id INTO v_auction_id;
  UPDATE public.sourcing_events SET evaluation_method='auction', updated_at=NOW() WHERE id=p_event_id AND tenant_id=v_tenant;
  PERFORM public.log_rfx_audit(p_event_id,'auction_started','procurement_auctions',v_auction_id,NULL,jsonb_build_object('auction_type',p_auction_type,'starting_price',v_start),NULL);
  RETURN v_auction_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_procurement_auction_from_event(UUID,TEXT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_procurement_auction(p_auction_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_auction RECORD;
  v_event UUID;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_auction FROM public.procurement_auctions WHERE id=p_auction_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUCTION_NOT_FOUND'; END IF;
  UPDATE public.procurement_auctions SET status='ended' WHERE id=p_auction_id AND tenant_id=v_tenant;
  v_event := v_auction.sourcing_event_id;
  IF v_event IS NOT NULL THEN
    PERFORM public.log_rfx_audit(v_event,'auction_closed','procurement_auctions',p_auction_id,to_jsonb(v_auction),jsonb_build_object('current_best_supplier_id',v_auction.current_best_supplier_id,'current_best_price',v_auction.current_best_price),NULL);
  END IF;
  RETURN v_event;
END $$;
GRANT EXECUTE ON FUNCTION public.close_procurement_auction(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_awarded_bid_price(p_bid_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_bid RECORD;
  v_line RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_bid FROM public.supplier_bids WHERE id=p_bid_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'BID_NOT_FOUND'; END IF;
  FOR v_line IN SELECT * FROM public.rfx_line_items WHERE event_id=v_bid.event_id AND tenant_id=v_tenant LOOP
    INSERT INTO public.procurement_price_history(tenant_id,item_code,supplier_id,price,currency_code,valid_from,source)
    VALUES (v_tenant,COALESCE(v_line.item_code,'EVENT-'||v_bid.event_id::TEXT),v_bid.supplier_id,v_bid.effective_price, v_bid.currency_code, CURRENT_DATE,'rfq');
  END LOOP;
  PERFORM public.log_rfx_audit(v_bid.event_id,'awarded_price_archived','procurement_price_history',p_bid_id,NULL,jsonb_build_object('effective_price',v_bid.effective_price),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.archive_awarded_bid_price(UUID) TO authenticated;

CREATE OR REPLACE VIEW public.rfx_mecca_comparison
WITH (security_invoker = true) AS
SELECT
  b.tenant_id,
  b.event_id,
  b.id AS bid_id,
  b.supplier_id,
  s.legal_name AS supplier_name,
  b.effective_price,
  b.lead_time_days,
  b.status,
  AVG(sc.weighted_total) AS mecca_score,
  RANK() OVER (PARTITION BY b.event_id ORDER BY AVG(sc.weighted_total) DESC NULLS LAST, b.effective_price ASC) AS rank_by_value
FROM public.supplier_bids b
JOIN public.suppliers s ON s.id=b.supplier_id AND s.tenant_id=b.tenant_id
LEFT JOIN public.rfx_bid_scorecards sc ON sc.bid_id=b.id AND sc.tenant_id=b.tenant_id
WHERE b.tenant_id=public.current_user_tenant_id()
GROUP BY b.tenant_id,b.event_id,b.id,b.supplier_id,s.legal_name,b.effective_price,b.lead_time_days,b.status;
GRANT SELECT ON public.rfx_mecca_comparison TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.rfx_templates') IS NULL THEN RAISE EXCEPTION '0195 failed: rfx_templates missing'; END IF;
  IF to_regclass('public.rfx_evaluation_criteria') IS NULL THEN RAISE EXCEPTION '0195 failed: criteria missing'; END IF;
  IF to_regprocedure('public.score_bid_mecca(uuid,jsonb,text)') IS NULL THEN RAISE EXCEPTION '0195 failed: score_bid_mecca missing'; END IF;
  IF to_regprocedure('public.start_procurement_auction_from_event(uuid,text,int)') IS NULL THEN RAISE EXCEPTION '0195 failed: auction from event missing'; END IF;
  RAISE NOTICE '✅ 0195: Strategic sourcing advanced completion applied';
END $$;
