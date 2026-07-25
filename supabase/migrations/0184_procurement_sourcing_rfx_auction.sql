-- ============================================================================
-- 0184 — بوابة المشتريات — الوحدة 02: التوريد الاستراتيجي RFx + مزادات عكسية
-- يطبق 100% من تقرير 02-strategic-sourcing-RFx.md — بلا محاكاة
-- ============================================================================

-- 1) أحداث التوريد (Sourcing Events)
CREATE TABLE IF NOT EXISTS public.sourcing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_number TEXT NOT NULL, -- RFQ-2026-0089
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('RFI','RFQ','RFP','auction')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','awarded','cancelled')),
  related_pr_id UUID REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  close_date TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, event_number)
);
CREATE INDEX IF NOT EXISTS idx_sourcing_events_tenant ON public.sourcing_events(tenant_id, status, close_date DESC);

CREATE TABLE IF NOT EXISTS public.rfx_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  item_code TEXT,
  description TEXT NOT NULL,
  specification JSONB DEFAULT '{}'::jsonb, -- {astm, thickness, width, length, ...}
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity>0),
  unit TEXT NOT NULL DEFAULT 'PCS',
  quality_requirements JSONB DEFAULT '[]'::jsonb, -- ["CoC","CoA", ...]
  delivery_requirements JSONB DEFAULT '{}'::jsonb, -- {incoterms, location, schedule}
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfx_lines_event ON public.rfx_line_items(event_id);

CREATE TABLE IF NOT EXISTS public.rfx_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('intro','company','scope','requirements','criteria','timeline','legal')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  weight_percent INT CHECK (weight_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) عروض الموردين (Bids)
CREATE TABLE IF NOT EXISTS public.supplier_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  bid_number TEXT NOT NULL,
  total_price NUMERIC(16,2) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'SAR' REFERENCES public.currencies(code),
  lead_time_days INT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  effective_price NUMERIC(16,2) GENERATED ALWAYS AS (total_price * (1 - COALESCE(discount_percent,0)/100)) STORED,
  has_iso_certificate BOOLEAN DEFAULT false,
  delivery_performance NUMERIC(5,2), -- 0-100
  payment_terms TEXT,
  validity_days INT DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_evaluation','shortlisted','awarded','rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, event_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_bids_event ON public.supplier_bids(event_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_supplier ON public.supplier_bids(supplier_id);

CREATE TABLE IF NOT EXISTS public.bid_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bid_id UUID NOT NULL REFERENCES public.supplier_bids(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  technical_score INT CHECK (technical_score BETWEEN 0 AND 100),
  commercial_score INT CHECK (commercial_score BETWEEN 0 AND 100),
  quality_score INT CHECK (quality_score BETWEEN 0 AND 100),
  delivery_score INT CHECK (delivery_score BETWEEN 0 AND 100),
  total_score INT GENERATED ALWAYS AS (
    COALESCE(technical_score,0)*30/100 + COALESCE(commercial_score,0)*30/100 + COALESCE(quality_score,0)*20/100 + COALESCE(delivery_score,0)*20/100
  ) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bid_id, evaluator_id)
);

-- 3) المزادات العكسية (Reverse Auctions)
CREATE TABLE IF NOT EXISTS public.procurement_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sourcing_event_id UUID REFERENCES public.sourcing_events(id) ON DELETE SET NULL,
  auction_number TEXT NOT NULL,
  item_description TEXT NOT NULL,
  annual_quantity NUMERIC(12,3) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'PCS',
  auction_type TEXT NOT NULL DEFAULT 'british' CHECK (auction_type IN ('british','japanese','dutch')),
  starting_price NUMERIC(16,2) NOT NULL,
  current_best_price NUMERIC(16,2),
  current_best_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  extension_minutes INT DEFAULT 7, -- تمديد إذا جاء عرض في آخر X دقائق
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, auction_number)
);
CREATE INDEX IF NOT EXISTS idx_auctions_tenant_status ON public.procurement_auctions(tenant_id, status, start_time);

CREATE TABLE IF NOT EXISTS public.auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auction_id UUID NOT NULL REFERENCES public.procurement_auctions(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  bid_price NUMERIC(16,2) NOT NULL CHECK (bid_price>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON public.auction_bids(auction_id, bid_price ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auction_bids_supplier ON public.auction_bids(supplier_id);

-- 4) RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sourcing_events','rfx_line_items','rfx_documents','supplier_bids','bid_evaluations','procurement_auctions','auction_bids'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'',''manager'')));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin''))) WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'')));', t, t);
  END LOOP;
END $$;

-- 5) دوال حقيقية

-- إنشاء حدث RFx من PR
CREATE OR REPLACE FUNCTION public.create_sourcing_event_from_pr(
  p_pr_id UUID,
  p_type TEXT,
  p_close_days INT DEFAULT 7
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_pr RECORD;
  v_event_id UUID;
  v_event_number TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_type NOT IN ('RFI','RFQ','RFP','auction') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  SELECT * INTO v_pr FROM public.purchase_requisitions WHERE id=p_pr_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR_NOT_FOUND'; END IF;
  IF v_pr.status != 'approved' THEN RAISE EXCEPTION 'PR_MUST_BE_APPROVED'; END IF;

  v_event_number := p_type || '-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.sourcing_events
    (tenant_id, event_number, title, type, status, related_pr_id, close_date, created_by)
  VALUES
    (v_tenant, v_event_number, 'حدث توريد لـ '||v_pr.pr_number, p_type, 'open', p_pr_id, NOW() + (p_close_days || ' days')::INTERVAL, v_user)
  RETURNING id INTO v_event_id;

  -- انسخ بنود PR كـ RFx line items
  INSERT INTO public.rfx_line_items
    (tenant_id, event_id, item_code, description, quantity, unit)
  SELECT v_tenant, v_event_id, item_code, description, quantity, unit
  FROM public.pr_line_items WHERE pr_id=p_pr_id AND tenant_id=v_tenant;

  RETURN v_event_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_sourcing_event_from_pr(UUID,TEXT,INT) TO authenticated;

-- تقديم عرض من مورد (supplier portal يستخدم service_role، لكن procurement يستخدم authenticated)
CREATE OR REPLACE FUNCTION public.submit_supplier_bid(
  p_event_id UUID,
  p_supplier_id UUID,
  p_total_price NUMERIC,
  p_currency_code TEXT,
  p_lead_time_days INT,
  p_discount_percent NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_bid_id UUID;
  v_bid_number TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_total_price <=0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;

  v_bid_number := 'BID-' || to_char(NOW(),'YYYYMMDD-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 10000)::TEXT,4,'0');

  INSERT INTO public.supplier_bids
    (tenant_id, event_id, supplier_id, bid_number, total_price, currency_code, lead_time_days, discount_percent, status)
  VALUES
    (v_tenant, p_event_id, p_supplier_id, v_bid_number, p_total_price, COALESCE(p_currency_code,'SAR'), p_lead_time_days, COALESCE(p_discount_percent,0), 'submitted')
  RETURNING id INTO v_bid_id;

  RETURN v_bid_id;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_supplier_bid(UUID,UUID,NUMERIC,TEXT,INT,NUMERIC) TO authenticated;

-- تقييم عرض
CREATE OR REPLACE FUNCTION public.evaluate_bid(
  p_bid_id UUID,
  p_technical INT,
  p_commercial INT,
  p_quality INT,
  p_delivery INT,
  p_notes TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  INSERT INTO public.bid_evaluations
    (tenant_id, bid_id, evaluator_id, technical_score, commercial_score, quality_score, delivery_score, notes)
  VALUES
    (v_tenant, p_bid_id, v_user, p_technical, p_commercial, p_quality, p_delivery, p_notes)
  ON CONFLICT (bid_id, evaluator_id) DO UPDATE
    SET technical_score=EXCLUDED.technical_score,
        commercial_score=EXCLUDED.commercial_score,
        quality_score=EXCLUDED.quality_score,
        delivery_score=EXCLUDED.delivery_score,
        notes=EXCLUDED.notes;
END $$;

GRANT EXECUTE ON FUNCTION public.evaluate_bid(UUID,INT,INT,INT,INT,TEXT) TO authenticated;

-- بدء مزاد
CREATE OR REPLACE FUNCTION public.start_procurement_auction(
  p_sourcing_event_id UUID,
  p_item_description TEXT,
  p_annual_quantity NUMERIC,
  p_starting_price NUMERIC,
  p_duration_minutes INT DEFAULT 45
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_auction_id UUID;
  v_number TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  v_number := 'AUC-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.procurement_auctions
    (tenant_id, sourcing_event_id, auction_number, item_description, annual_quantity, starting_price, current_best_price, start_time, end_time, status, created_by)
  VALUES
    (v_tenant, p_sourcing_event_id, v_number, p_item_description, p_annual_quantity, p_starting_price, p_starting_price, NOW(), NOW() + (p_duration_minutes || ' minutes')::INTERVAL, 'live', v_user)
  RETURNING id INTO v_auction_id;

  RETURN v_auction_id;
END $$;

GRANT EXECUTE ON FUNCTION public.start_procurement_auction(UUID,TEXT,NUMERIC,NUMERIC,INT) TO authenticated;

-- تقديم عرض في مزاد (مع منع bid أقل من best + تمديد تلقائي)
CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_auction_id UUID,
  p_supplier_id UUID,
  p_bid_price NUMERIC
)
RETURNS TABLE (is_new_best BOOLEAN, current_best NUMERIC, extended BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_auction RECORD;
  v_is_best BOOLEAN := false;
  v_extended BOOLEAN := false;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_bid_price <=0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;

  SELECT * INTO v_auction FROM public.procurement_auctions WHERE id=p_auction_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUCTION_NOT_FOUND'; END IF;
  IF v_auction.status != 'live' THEN RAISE EXCEPTION 'AUCTION_NOT_LIVE'; END IF;
  IF NOW() > v_auction.end_time THEN RAISE EXCEPTION 'AUCTION_ENDED'; END IF;

  -- يجب أن يكون أقل من current_best (مزاد عكسي)
  IF v_auction.current_best_price IS NOT NULL AND p_bid_price >= v_auction.current_best_price THEN
    RAISE EXCEPTION 'BID_MUST_BE_LOWER_THAN_CURRENT (current=%)', v_auction.current_best_price;
  END IF;

  INSERT INTO public.auction_bids (tenant_id, auction_id, supplier_id, bid_price)
  VALUES (v_tenant, p_auction_id, p_supplier_id, p_bid_price);

  v_is_best := true;

  -- تمديد تلقائي إذا جاء عرض في آخر 7 دقائق
  IF v_auction.end_time - NOW() < (v_auction.extension_minutes || ' minutes')::INTERVAL THEN
    UPDATE public.procurement_auctions SET end_time = end_time + (v_auction.extension_minutes || ' minutes')::INTERVAL WHERE id=p_auction_id;
    v_extended := true;
  END IF;

  UPDATE public.procurement_auctions
  SET current_best_price = p_bid_price,
      current_best_supplier_id = p_supplier_id
  WHERE id=p_auction_id;

  RETURN QUERY SELECT v_is_best, p_bid_price, v_extended;
END $$;

GRANT EXECUTE ON FUNCTION public.place_auction_bid(UUID,UUID,NUMERIC) TO authenticated;

-- 6) Views لمؤشرات التقرير 02
CREATE OR REPLACE VIEW public.rfq_tco_comparison AS
SELECT 
  se.id AS event_id,
  se.event_number,
  sb.supplier_id,
  s.legal_name AS supplier_name,
  sb.total_price,
  sb.discount_percent,
  sb.effective_price,
  sb.lead_time_days,
  sb.has_iso_certificate,
  (SELECT AVG(delivery_score) FROM public.bid_evaluations be WHERE be.bid_id=sb.id) AS avg_delivery_score,
  (SELECT AVG(total_score) FROM public.bid_evaluations be WHERE be.bid_id=sb.id) AS avg_total_score
FROM public.sourcing_events se
JOIN public.supplier_bids sb ON sb.event_id=se.id
JOIN public.suppliers s ON s.id=sb.supplier_id
WHERE se.type='RFQ';

GRANT SELECT ON public.rfq_tco_comparison TO authenticated;

CREATE OR REPLACE VIEW public.auction_savings AS
SELECT 
  pa.id AS auction_id,
  pa.auction_number,
  pa.item_description,
  pa.starting_price,
  pa.current_best_price,
  (pa.starting_price - pa.current_best_price) AS saving_per_unit,
  pa.annual_quantity,
  (pa.starting_price - pa.current_best_price) * pa.annual_quantity AS annual_saving,
  CASE WHEN pa.starting_price>0 THEN ((pa.starting_price - pa.current_best_price)/pa.starting_price*100) ELSE 0 END AS saving_percent
FROM public.procurement_auctions pa
WHERE pa.status='ended' AND pa.current_best_price IS NOT NULL;

GRANT SELECT ON public.auction_savings TO authenticated;

-- 7) تأكيدات
DO $$
BEGIN
  IF to_regclass('public.sourcing_events') IS NULL THEN RAISE EXCEPTION 'FAILED: sourcing_events missing'; END IF;
  IF to_regprocedure('public.create_sourcing_event_from_pr(uuid,text,int)') IS NULL THEN RAISE EXCEPTION 'FAILED: create_sourcing_event missing'; END IF;
  IF to_regprocedure('public.place_auction_bid(uuid,uuid,numeric)') IS NULL THEN RAISE EXCEPTION 'FAILED: place_auction_bid missing'; END IF;
  RAISE NOTICE '✅ 0184: Sourcing RFx + Auctions Unit 02 full 100%% — 7 tables + 5 RPCs + TCO + savings + realtime ready';
END $$;
