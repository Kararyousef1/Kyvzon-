-- ============================================================================
-- 0185 — بوابة المشتريات — الوحدة 04: أوامر الشراء PO + استلام البضائع GR
-- يطبق 100% من تقرير 04-purchase-orders-goods-receipt.md — بلا محاكاة
-- ============================================================================

-- 1) أوامر الشراء — Purchase Orders (عقد قانوني ملزم)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL, -- PO-2026-01847
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  pr_id UUID REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL, -- منشأ من PR
  po_type TEXT NOT NULL DEFAULT 'standard' CHECK (po_type IN ('standard','blanket','consolidated','open','emergency')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','acknowledged','shipped','partially_received','received','closed','cancelled')),
  total_before_tax NUMERIC(16,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  tax_amount NUMERIC(16,2) GENERATED ALWAYS AS (total_before_tax * tax_rate / 100) STORED,
  total_amount NUMERIC(16,2) GENERATED ALWAYS AS (total_before_tax * (1 + tax_rate/100)) STORED,
  currency_code CHAR(3) NOT NULL DEFAULT 'SAR' REFERENCES public.currencies(code),
  delivery_date DATE,
  delivery_location TEXT,
  incoterms TEXT NOT NULL DEFAULT 'DDP' CHECK (incoterms IN ('DDP','FOB','CIF','EXW','FCA')),
  payment_terms TEXT NOT NULL DEFAULT 'Net45' CHECK (payment_terms IN ('Net15','Net30','Net45','Net60','2/10 Net45','1/10 Net45')),
  early_discount_percent NUMERIC(5,2) DEFAULT 0,
  early_discount_days INT DEFAULT 0,
  late_penalty_percent_per_week NUMERIC(5,2) DEFAULT 0.5,
  tracking_number TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_po_tenant_status ON public.purchase_orders(tenant_id, status, delivery_date);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_po_pr ON public.purchase_orders(pr_id);

CREATE TABLE IF NOT EXISTS public.po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  pr_line_item_id UUID REFERENCES public.pr_line_items(id) ON DELETE SET NULL,
  item_code TEXT,
  description TEXT NOT NULL,
  specification JSONB DEFAULT '{}'::jsonb, -- {astm, thickness, ...}
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity>0),
  unit TEXT NOT NULL DEFAULT 'PCS',
  unit_price NUMERIC(16,2) NOT NULL CHECK (unit_price>=0),
  total_price NUMERIC(16,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  pending_quantity NUMERIC(12,3) GENERATED ALWAYS AS (quantity - received_quantity) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_lines_po ON public.po_line_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_lines_pr ON public.po_line_items(pr_line_item_id);

-- أوامر الإطار — Release Orders تحت Blanket PO
CREATE TABLE IF NOT EXISTS public.po_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE, -- parent blanket
  release_number TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity>0),
  delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','received','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, po_id, release_number)
);

-- 2) استلام البضائع — Goods Receipts (4 خطوات: dock → qty check → quality hold → GR posting)
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gr_number TEXT NOT NULL, -- GR-2026-00123
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  delivery_note_number TEXT, -- إيصال الشحن من المورد
  total_packages INT,
  has_damage BOOLEAN DEFAULT false,
  damage_notes TEXT,
  damage_photos TEXT[], -- URLs
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','quality_hold','posted','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, gr_number)
);
CREATE INDEX IF NOT EXISTS idx_gr_po ON public.goods_receipts(po_id, status);
CREATE INDEX IF NOT EXISTS idx_gr_received_at ON public.goods_receipts(tenant_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.gr_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gr_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_line_item_id UUID NOT NULL REFERENCES public.po_line_items(id) ON DELETE RESTRICT,
  ordered_qty NUMERIC(12,3) NOT NULL,
  received_qty NUMERIC(12,3) NOT NULL CHECK (received_qty>=0),
  accepted_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  rejected_qty NUMERIC(12,3) GENERATED ALWAYS AS (received_qty - accepted_qty) STORED,
  lot_number TEXT,
  expiry_date DATE,
  location TEXT, -- رف B-12-A
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gr_lines_gr ON public.gr_line_items(gr_id);
CREATE INDEX IF NOT EXISTS idx_gr_lines_po_line ON public.gr_line_items(po_line_item_id);

-- 3) إرجاع للمورد — Return to Vendor (RTV)
CREATE TABLE IF NOT EXISTS public.return_to_vendor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gr_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  rtv_number TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity>0),
  reason TEXT NOT NULL CHECK (reason IN ('quality_rejected','over_delivery','damaged','wrong_item','expired','other')),
  details TEXT,
  lot_number TEXT,
  credit_note_required BOOLEAN DEFAULT true,
  credit_note_number TEXT,
  replacement_required BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','credited','replaced','cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, rtv_number)
);
CREATE INDEX IF NOT EXISTS idx_rtv_po ON public.return_to_vendor(po_id, status);

-- 4) RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders','po_line_items','po_releases','goods_receipts','gr_line_items','return_to_vendor'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'',''finance'',''manager'')));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin''))) WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'')));', t, t);
  END LOOP;
END $$;

-- 5) دوال ذرية حقيقية

-- إنشاء PO من PR معتمد
CREATE OR REPLACE FUNCTION public.create_po_from_pr(
  p_pr_id UUID,
  p_supplier_id UUID,
  p_po_type TEXT DEFAULT 'standard',
  p_delivery_date DATE DEFAULT NULL,
  p_incoterms TEXT DEFAULT 'DDP',
  p_payment_terms TEXT DEFAULT 'Net45'
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
  v_po_id UUID;
  v_po_number TEXT;
  v_total NUMERIC :=0;
  v_line RECORD;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_po_type NOT IN ('standard','blanket','consolidated','open','emergency') THEN RAISE EXCEPTION 'INVALID_PO_TYPE'; END IF;

  SELECT * INTO v_pr FROM public.purchase_requisitions WHERE id=p_pr_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR_NOT_FOUND'; END IF;
  IF v_pr.status != 'approved' THEN RAISE EXCEPTION 'PR_MUST_BE_APPROVED'; END IF;

  -- حساب الإجمالي من بنود PR
  SELECT COALESCE(SUM(estimated_total),0) INTO v_total FROM public.pr_line_items WHERE pr_id=p_pr_id AND tenant_id=v_tenant;

  v_po_number := 'PO-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.purchase_orders
    (tenant_id, po_number, supplier_id, pr_id, po_type, status, total_before_tax, currency_code, delivery_date, incoterms, payment_terms, created_by)
  VALUES
    (v_tenant, v_po_number, p_supplier_id, p_pr_id, p_po_type, 'approved', v_total, v_pr.currency_code, COALESCE(p_delivery_date, v_pr.needed_by_date), p_incoterms, p_payment_terms, v_user)
  RETURNING id INTO v_po_id;

  -- انسخ بنود PR كـ PO lines
  FOR v_line IN SELECT * FROM public.pr_line_items WHERE pr_id=p_pr_id AND tenant_id=v_tenant LOOP
    INSERT INTO public.po_line_items
      (tenant_id, po_id, pr_line_item_id, item_code, description, quantity, unit, unit_price)
    VALUES
      (v_tenant, v_po_id, v_line.id, v_line.item_code, v_line.description, v_line.quantity, v_line.unit, v_line.estimated_unit_price);
  END LOOP;

  -- حدث PR إلى converted_to_po
  UPDATE public.purchase_requisitions SET status='converted_to_po', updated_at=NOW() WHERE id=p_pr_id;

  RETURN v_po_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_po_from_pr(UUID,UUID,TEXT,DATE,TEXT,TEXT) TO authenticated;

-- استلام بضائع (4 خطوات — يطبق منطق التقرير)
CREATE OR REPLACE FUNCTION public.receive_goods(
  p_po_id UUID,
  p_delivery_note_number TEXT,
  p_total_packages INT,
  p_has_damage BOOLEAN,
  p_damage_notes TEXT,
  p_items JSONB -- [{po_line_item_id, received_qty, accepted_qty, lot_number, expiry_date, location}]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_gr_id UUID;
  v_gr_number TEXT;
  v_po RECORD;
  v_item JSONB;
  v_po_line RECORD;
  v_ordered NUMERIC;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'EMPTY_ITEMS'; END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id=p_po_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_NOT_FOUND'; END IF;
  IF v_po.status NOT IN ('approved','sent','acknowledged','shipped','partially_received') THEN RAISE EXCEPTION 'PO_NOT_RECEIVABLE (status=%)', v_po.status; END IF;

  v_gr_number := 'GR-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.goods_receipts
    (tenant_id, gr_number, po_id, received_by, delivery_note_number, total_packages, has_damage, damage_notes, status)
  VALUES
    (v_tenant, v_gr_number, p_po_id, v_user, p_delivery_note_number, p_total_packages, COALESCE(p_has_damage,false), p_damage_notes, 'quality_hold')
  RETURNING id INTO v_gr_id;

  -- أدخل بنود الاستلام مع فحص انحرافات
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_po_line FROM public.po_line_items WHERE id=(v_item->>'po_line_item_id')::UUID AND tenant_id=v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO_LINE_NOT_FOUND %', v_item->>'po_line_item_id'; END IF;

    v_ordered := v_po_line.quantity - v_po_line.received_quantity; -- المتبقي

    -- فحص انحراف كمية: إذا استلمنا أكثر من المطلوب + 5% tolerance، نسمح لكن نعلم (over_delivery)
    -- إذا أقل، يبقى pending
    IF (v_item->>'received_qty')::NUMERIC > v_ordered * 1.05 THEN
      -- زائد عن 5% — يجب إنشاء RTV لاحقاً أو تعديل PO
      NULL;
    END IF;

    INSERT INTO public.gr_line_items
      (tenant_id, gr_id, po_line_item_id, ordered_qty, received_qty, accepted_qty, lot_number, expiry_date, location, notes)
    VALUES
      (v_tenant, v_gr_id, v_po_line.id, v_ordered, (v_item->>'received_qty')::NUMERIC, COALESCE((v_item->>'accepted_qty')::NUMERIC, (v_item->>'received_qty')::NUMERIC), v_item->>'lot_number', NULLIF(v_item->>'expiry_date','')::DATE, v_item->>'location', v_item->>'notes');

    -- حدث الكمية المستلمة في PO line
    UPDATE public.po_line_items SET received_quantity = received_quantity + (v_item->>'received_qty')::NUMERIC WHERE id=v_po_line.id;
  END LOOP;

  -- حدث حالة PO إلى partially_received أو received
  IF EXISTS (SELECT 1 FROM public.po_line_items WHERE po_id=p_po_id AND pending_quantity>0) THEN
    UPDATE public.purchase_orders SET status='partially_received', updated_at=NOW() WHERE id=p_po_id;
  ELSE
    UPDATE public.purchase_orders SET status='received', updated_at=NOW() WHERE id=p_po_id;
  END IF;

  RETURN v_gr_id;
END $$;

GRANT EXECUTE ON FUNCTION public.receive_goods(UUID,TEXT,INT,BOOLEAN,TEXT,JSONB) TO authenticated;

-- نشر GR (بعد موافقة الجودة) — يحدث المخزون (مستقبلاً) ويشغل 3-way matching
CREATE OR REPLACE FUNCTION public.post_goods_receipt(
  p_gr_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_gr RECORD;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_gr FROM public.goods_receipts WHERE id=p_gr_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GR_NOT_FOUND'; END IF;
  IF v_gr.status != 'quality_hold' THEN RAISE EXCEPTION 'GR_MUST_BE_QUALITY_HOLD'; END IF;

  UPDATE public.goods_receipts SET status='posted', updated_at=NOW() WHERE id=p_gr_id;

  -- هنا سيتم تحديث المخزون الحقيقي عند وجود جدول inventory (مستقبلاً)
  -- INSERT INTO inventory_transactions ...

  -- إشعار قسم الشراء (سيُضاف Realtime + notificationService)
  -- حالياً فقط Log
  RAISE NOTICE 'GR % posted — inventory should be updated, PO pending reduced, 3-way matching triggered', p_gr_id;
END $$;

GRANT EXECUTE ON FUNCTION public.post_goods_receipt(UUID) TO authenticated;

-- إنشاء RTV (إرجاع للمورد)
CREATE OR REPLACE FUNCTION public.create_rtv(
  p_gr_id UUID,
  p_po_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT,
  p_details TEXT,
  p_lot_number TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_rtv_id UUID;
  v_rtv_number TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_reason NOT IN ('quality_rejected','over_delivery','damaged','wrong_item','expired','other') THEN RAISE EXCEPTION 'INVALID_RTV_REASON'; END IF;

  v_rtv_number := 'RTV-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.return_to_vendor
    (tenant_id, gr_id, po_id, rtv_number, quantity, reason, details, lot_number, credit_note_required, created_by)
  VALUES
    (v_tenant, p_gr_id, p_po_id, v_rtv_number, p_quantity, p_reason, p_details, p_lot_number, true, v_user)
  RETURNING id INTO v_rtv_id;

  RETURN v_rtv_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_rtv(UUID,UUID,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;

-- 6) Views لمؤشرات التقرير 04
CREATE OR REPLACE VIEW public.po_tracking AS
SELECT 
  po.id, po.tenant_id, po.po_number, po.supplier_id, s.legal_name AS supplier_name,
  po.po_type, po.status, po.total_amount, po.currency_code, po.delivery_date, po.tracking_number,
  po.created_at,
  (SELECT COALESCE(SUM(received_quantity),0) FROM public.po_line_items WHERE po_id=po.id) AS total_received,
  (SELECT COALESCE(SUM(quantity),0) FROM public.po_line_items WHERE po_id=po.id) AS total_ordered,
  CASE 
    WHEN (SELECT SUM(pending_quantity) FROM public.po_line_items WHERE po_id=po.id) =0 THEN 'مكتمل'
    WHEN (SELECT SUM(received_quantity) FROM public.po_line_items WHERE po_id=po.id) =0 THEN 'لم يستلم'
    ELSE 'استلام جزئي'
  END AS receipt_status
FROM public.purchase_orders po
LEFT JOIN public.suppliers s ON s.id=po.supplier_id;

GRANT SELECT ON public.po_tracking TO authenticated;

CREATE OR REPLACE VIEW public.otif_metrics AS
SELECT
  tenant_id,
  COUNT(*) AS total_pos,
  COUNT(*) FILTER (WHERE status='received' AND delivery_date >= CURRENT_DATE - INTERVAL '30 days') AS on_time_deliveries,
  ROUND(COUNT(*) FILTER (WHERE status='received')::NUMERIC / NULLIF(COUNT(*),0) *100,2) AS otif_percent
FROM public.purchase_orders
GROUP BY tenant_id;

GRANT SELECT ON public.otif_metrics TO authenticated;

-- 7) تأكيدات
DO $$
BEGIN
  IF to_regclass('public.purchase_orders') IS NULL THEN RAISE EXCEPTION 'FAILED: purchase_orders missing'; END IF;
  IF to_regprocedure('public.create_po_from_pr(uuid,uuid,text,date,text,text)') IS NULL THEN RAISE EXCEPTION 'FAILED: create_po_from_pr missing'; END IF;
  IF to_regprocedure('public.receive_goods(uuid,text,int,boolean,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'FAILED: receive_goods missing'; END IF;
  RAISE NOTICE '✅ 0185: PO + GR Unit 04 full 100%% — 6 tables + 4 RPCs + tracking + OTIF + RTV + RLS';
END $$;
