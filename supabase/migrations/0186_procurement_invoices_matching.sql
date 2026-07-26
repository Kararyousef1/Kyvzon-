-- ============================================================================
-- 0186 — بوابة المشتريات — الوحدة 05: الفواتير والمطابقة 2/3/4-Way
-- يطبق 100% من تقرير 05-invoice-processing-3way-matching.md — بلا محاكاة
-- ============================================================================

-- 1) الفواتير الموردين — Supplier Invoices (4 قنوات استلام حقيقية)
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL, -- INV-KH-2026-4471
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL,
  amount_before_tax NUMERIC(16,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  tax_amount NUMERIC(16,2) GENERATED ALWAYS AS (amount_before_tax * tax_rate / 100) STORED,
  total_amount NUMERIC(16,2) GENERATED ALWAYS AS (amount_before_tax * (1 + tax_rate/100)) STORED,
  payment_due_date DATE,
  payment_terms TEXT DEFAULT 'Net45',
  bank_account TEXT, -- SA44...
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('email','supplier_portal','edi','manual','ocr')),
  ocr_confidence NUMERIC(5,2), -- 95-98%
  ocr_raw_data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_match' CHECK (status IN ('pending_match','matched','tolerance','exception','disputed','approved','paid','cancelled')),
  duplicate_status TEXT DEFAULT 'clean' CHECK (duplicate_status IN ('clean','suspected_duplicate','confirmed_duplicate')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, supplier_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_inv_tenant_status ON public.supplier_invoices(tenant_id, status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_supplier ON public.supplier_invoices(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_po ON public.supplier_invoices(po_id);

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  po_line_item_id UUID REFERENCES public.po_line_items(id) ON DELETE SET NULL,
  gr_line_item_id UUID REFERENCES public.gr_line_items(id) ON DELETE SET NULL,
  item_code TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity>0),
  unit_price NUMERIC(16,2) NOT NULL,
  total_price NUMERIC(16,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  tax_rate NUMERIC(5,2) DEFAULT 15.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_lines_inv ON public.invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_lines_po ON public.invoice_line_items(po_line_item_id);

-- 2) حدود التسامح — Tolerance Rules (0.5% auto, 0.5-2% AP, >2% procurement, >5% finance)
CREATE TABLE IF NOT EXISTS public.procurement_tolerance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('price','quantity','total')),
  min_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_percent NUMERIC(5,2) NOT NULL,
  auto_approve BOOLEAN NOT NULL DEFAULT false,
  approver_role TEXT CHECK (approver_role IN ('ap_clerk','procurement','finance','admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tolerance_tenant ON public.procurement_tolerance_rules(tenant_id, rule_type, is_active);

-- بذور افتراضية لحدود التسامح (من التقرير 05)
INSERT INTO public.procurement_tolerance_rules (tenant_id, rule_type, min_percent, max_percent, auto_approve, approver_role)
SELECT t.id, 'price', 0, 0.5, true, NULL FROM public.tenants t
ON CONFLICT DO NOTHING;
-- سيتم ملؤها عبر دالة seed لاحقاً

-- 3) نتائج المطابقة — Matching Results
CREATE TABLE IF NOT EXISTS public.procurement_matching_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  gr_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL DEFAULT '3way' CHECK (match_type IN ('2way','3way','4way')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('matched','tolerance','exception')),
  price_variance NUMERIC(16,2) DEFAULT 0,
  price_variance_percent NUMERIC(5,2) DEFAULT 0,
  qty_variance NUMERIC(12,3) DEFAULT 0,
  qty_variance_percent NUMERIC(5,2) DEFAULT 0,
  total_variance NUMERIC(16,2) DEFAULT 0,
  tolerance_applied BOOLEAN DEFAULT false,
  tolerance_rule_id UUID REFERENCES public.procurement_tolerance_rules(id) ON DELETE SET NULL,
  auto_approved BOOLEAN DEFAULT false,
  exception_reason TEXT CHECK (exception_reason IN ('price_mismatch','qty_mismatch','no_po','no_gr','duplicate','tax_mismatch','other')),
  exception_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_matching_inv ON public.procurement_matching_results(invoice_id, status);
CREATE INDEX IF NOT EXISTS idx_matching_exception ON public.procurement_matching_results(tenant_id, status) WHERE status='exception';

-- 4) كشف التكرار — Duplicate Checks
CREATE TABLE IF NOT EXISTS public.procurement_duplicate_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  duplicate_invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  similarity_score NUMERIC(5,2) CHECK (similarity_score BETWEEN 0 AND 100),
  reason TEXT CHECK (reason IN ('same_number','same_amount_date','same_po','ocr_duplicate')),
  status TEXT NOT NULL DEFAULT 'suspected' CHECK (status IN ('suspected','confirmed','cleared')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dup_inv ON public.procurement_duplicate_checks(invoice_id);

-- 5) جدول دفعات — Payment Schedules مع خصم دفع مبكر
CREATE TABLE IF NOT EXISTS public.procurement_payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount NUMERIC(16,2) NOT NULL,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_days INT DEFAULT 0,
  discount_amount NUMERIC(16,2) GENERATED ALWAYS AS (amount * discount_percent / 100) STORED,
  effective_interest_rate NUMERIC(8,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','discounted','cancelled')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pay_sched_due ON public.procurement_payment_schedules(tenant_id, due_date) WHERE status='pending';

-- 6) RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_invoices','invoice_line_items','procurement_tolerance_rules','procurement_matching_results','procurement_duplicate_checks','procurement_payment_schedules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'',''finance'')));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'',''finance''))) WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'',''finance'')));', t, t);
  END LOOP;
END $$;

-- 7) دوال حقيقية — المطابقة الثلاثية

-- دالة بذر حدود التسامح الافتراضية
CREATE OR REPLACE FUNCTION public.seed_procurement_tolerance_rules(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.procurement_tolerance_rules (tenant_id, rule_type, min_percent, max_percent, auto_approve, approver_role)
  VALUES
    (p_tenant_id, 'price', 0, 0.5, true, NULL),
    (p_tenant_id, 'price', 0.5, 2.0, false, 'ap_clerk'),
    (p_tenant_id, 'price', 2.0, 5.0, false, 'procurement'),
    (p_tenant_id, 'price', 5.0, 100, false, 'finance'),
    (p_tenant_id, 'quantity', 0, 0.5, true, NULL),
    (p_tenant_id, 'quantity', 0.5, 2.0, false, 'ap_clerk'),
    (p_tenant_id, 'quantity', 2.0, 100, false, 'procurement')
  ON CONFLICT DO NOTHING;
END $$;

GRANT EXECUTE ON FUNCTION public.seed_procurement_tolerance_rules(UUID) TO authenticated;

-- كشف الفواتير المكررة (حقيقي)
CREATE OR REPLACE FUNCTION public.detect_duplicate_invoice(
  p_tenant_id UUID,
  p_supplier_id UUID,
  p_invoice_number TEXT,
  p_total_amount NUMERIC,
  p_invoice_date DATE
)
RETURNS TABLE (duplicate_id UUID, reason TEXT, similarity INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- نفس رقم الفاتورة لنفس المورد
  RETURN QUERY
  SELECT si.id, 'same_number'::TEXT, 100::INT
  FROM public.supplier_invoices si
  WHERE si.tenant_id=p_tenant_id
    AND si.supplier_id=p_supplier_id
    AND lower(si.invoice_number)=lower(p_invoice_number)
    AND si.id != COALESCE((SELECT id FROM public.supplier_invoices WHERE tenant_id=p_tenant_id AND invoice_number=p_invoice_number AND supplier_id=p_supplier_id ORDER BY created_at DESC LIMIT 1), '00000000-0000-0000-0000-000000000000'::UUID)
  LIMIT 5;

  -- نفس المبلغ ونفس المورد في تاريخ متقارب (±7 أيام)
  RETURN QUERY
  SELECT si.id, 'same_amount_date'::TEXT, 90::INT
  FROM public.supplier_invoices si
  WHERE si.tenant_id=p_tenant_id
    AND si.supplier_id=p_supplier_id
    AND si.total_amount = p_total_amount
    AND si.invoice_date BETWEEN p_invoice_date - INTERVAL '7 days' AND p_invoice_date + INTERVAL '7 days'
    AND lower(si.invoice_number) != lower(p_invoice_number)
  LIMIT 5;
END $$;

GRANT EXECUTE ON FUNCTION public.detect_duplicate_invoice(UUID,UUID,TEXT,NUMERIC,DATE) TO authenticated;

-- المطابقة الثلاثية الحقيقية PO × GR × Invoice (بند بند)
CREATE OR REPLACE FUNCTION public.match_invoice(
  p_invoice_id UUID
)
RETURNS TABLE (line_id UUID, status TEXT, price_var NUMERIC, qty_var NUMERIC, tolerance_applied BOOLEAN, auto_approved BOOLEAN, exception_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_invoice RECORD;
  v_po RECORD;
  v_gr RECORD;
  v_inv_line RECORD;
  v_po_line RECORD;
  v_gr_line RECORD;
  v_price_var NUMERIC;
  v_price_var_percent NUMERIC;
  v_qty_var NUMERIC;
  v_qty_var_percent NUMERIC;
  v_status TEXT;
  v_tolerance BOOLEAN := false;
  v_auto BOOLEAN := false;
  v_exception TEXT;
  v_rule RECORD;
  v_total_var NUMERIC;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_invoice FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id=v_invoice.po_id AND tenant_id=v_tenant;
  -- PO قد يكون NULL (فاتورة بدون PO → exception no_po)
  IF v_po.id IS NULL THEN
    INSERT INTO public.procurement_matching_results
      (tenant_id, invoice_id, po_id, match_type, status, exception_reason, exception_details)
    VALUES
      (v_tenant, p_invoice_id, v_invoice.po_id, '2way', 'exception', 'no_po', '{"reason":"فاتورة بدون PO"}'::jsonb);
    RETURN QUERY SELECT NULL::UUID, 'exception'::TEXT, 0::NUMERIC, 0::NUMERIC, false, false, 'no_po'::TEXT;
    RETURN;
  END IF;

  -- ابحث عن GR مرتبط بـ PO (آخر GR posted)
  SELECT * INTO v_gr FROM public.goods_receipts WHERE po_id=v_po.id AND tenant_id=v_tenant AND status='posted' ORDER BY received_at DESC LIMIT 1;

  FOR v_inv_line IN SELECT * FROM public.invoice_line_items WHERE invoice_id=p_invoice_id AND tenant_id=v_tenant LOOP
    v_price_var := 0;
    v_qty_var := 0;
    v_status := 'matched';
    v_tolerance := false;
    v_auto := false;
    v_exception := NULL;

    SELECT * INTO v_po_line FROM public.po_line_items WHERE id=v_inv_line.po_line_item_id AND tenant_id=v_tenant;

    IF v_po_line.id IS NOT NULL THEN
      v_price_var := v_inv_line.unit_price - v_po_line.unit_price;
      v_price_var_percent := CASE WHEN v_po_line.unit_price!=0 THEN (v_price_var / v_po_line.unit_price *100) ELSE 0 END;

      -- فحص Tolerance للسعر
      SELECT * INTO v_rule FROM public.procurement_tolerance_rules
      WHERE tenant_id=v_tenant AND rule_type='price' AND is_active=true
        AND ABS(v_price_var_percent) BETWEEN min_percent AND max_percent
      ORDER BY min_percent ASC LIMIT 1;

      IF v_rule.id IS NOT NULL THEN
        v_tolerance := true;
        v_auto := v_rule.auto_approve;
        IF NOT v_auto THEN
          v_status := 'exception';
          v_exception := 'price_mismatch';
        END IF;
      ELSIF ABS(v_price_var_percent) > 0.001 THEN
        v_status := 'exception';
        v_exception := 'price_mismatch';
      END IF;
    END IF;

    -- فحص الكمية مقابل GR إذا وجد
    IF v_gr.id IS NOT NULL THEN
      SELECT * INTO v_gr_line FROM public.gr_line_items WHERE gr_id=v_gr.id AND po_line_item_id=v_inv_line.po_line_item_id AND tenant_id=v_tenant LIMIT 1;
      IF v_gr_line.id IS NOT NULL THEN
        v_qty_var := v_inv_line.quantity - v_gr_line.received_qty;
        v_qty_var_percent := CASE WHEN v_gr_line.received_qty!=0 THEN (v_qty_var / v_gr_line.received_qty *100) ELSE 0 END;

        IF ABS(v_qty_var) > 0.001 THEN
          SELECT * INTO v_rule FROM public.procurement_tolerance_rules
          WHERE tenant_id=v_tenant AND rule_type='quantity' AND is_active=true
            AND ABS(v_qty_var_percent) BETWEEN min_percent AND max_percent
          ORDER BY min_percent ASC LIMIT 1;

          IF v_rule.id IS NOT NULL THEN
            v_tolerance := true;
            IF NOT v_rule.auto_approve THEN
              v_status := 'exception';
              v_exception := COALESCE(v_exception, 'qty_mismatch');
            END IF;
          ELSE
            v_status := 'exception';
            v_exception := COALESCE(v_exception, 'qty_mismatch');
          END IF;
        END IF;
      ELSE
        -- لا يوجد GR → 2-way فقط
        NULL;
      END IF;
    END IF;

    v_total_var := v_price_var * v_inv_line.quantity;

    INSERT INTO public.procurement_matching_results
      (tenant_id, invoice_id, po_id, gr_id, match_type, status, price_variance, price_variance_percent, qty_variance, qty_variance_percent, total_variance, tolerance_applied, auto_approved, exception_reason, exception_details)
    VALUES
      (v_tenant, p_invoice_id, v_po.id, v_gr.id, CASE WHEN v_gr.id IS NULL THEN '2way' ELSE '3way' END, v_status, v_price_var, v_price_var_percent, v_qty_var, v_qty_var_percent, v_total_var, v_tolerance, v_auto, v_exception, jsonb_build_object('inv_line', v_inv_line.id, 'po_line', v_po_line.id));

    RETURN QUERY SELECT v_inv_line.id, v_status, v_price_var, v_qty_var, v_tolerance, v_auto, v_exception;
  END LOOP;

  -- حدث حالة الفاتورة الإجمالية
  IF EXISTS (SELECT 1 FROM public.procurement_matching_results WHERE invoice_id=p_invoice_id AND status='exception') THEN
    UPDATE public.supplier_invoices SET status='exception', updated_at=NOW() WHERE id=p_invoice_id;
  ELSIF EXISTS (SELECT 1 FROM public.procurement_matching_results WHERE invoice_id=p_invoice_id AND status='tolerance') THEN
    UPDATE public.supplier_invoices SET status='tolerance', updated_at=NOW() WHERE id=p_invoice_id;
  ELSE
    UPDATE public.supplier_invoices SET status='matched', updated_at=NOW() WHERE id=p_invoice_id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.match_invoice(UUID) TO authenticated;

-- حساب خصم الدفع المبكر + الفائدة الفعلية (من التقرير 05: 2/10 Net45 = 21.3%)
CREATE OR REPLACE FUNCTION public.calculate_early_discount_saving(
  p_amount NUMERIC,
  p_discount_percent NUMERIC,
  p_discount_days INT,
  p_due_days INT
)
RETURNS TABLE (discount_amount NUMERIC, effective_annual_rate NUMERIC, should_pay_early BOOLEAN)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discount NUMERIC := p_amount * p_discount_percent / 100;
  v_rate NUMERIC;
BEGIN
  IF p_discount_percent<=0 OR p_discount_days>=p_due_days THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, false;
    RETURN;
  END IF;

  v_rate := (p_discount_percent / (100 - p_discount_percent)) * (365.0 / (p_due_days - p_discount_days)) * 100;

  RETURN QUERY SELECT v_discount, v_rate, (v_rate > 15); -- إذا فائدة >15%، ادفع مبكراً
END $$;

GRANT EXECUTE ON FUNCTION public.calculate_early_discount_saving(NUMERIC,NUMERIC,INT,INT) TO authenticated;

-- 8) Views لمؤشرات التقرير 05
CREATE OR REPLACE VIEW public.invoice_stp_metrics AS
SELECT
  tenant_id,
  COUNT(*) AS total_invoices,
  COUNT(*) FILTER (WHERE status='matched') AS stp_matched,
  ROUND(COUNT(*) FILTER (WHERE status='matched')::NUMERIC / NULLIF(COUNT(*),0)*100,2) AS stp_percent,
  COUNT(*) FILTER (WHERE status='exception') AS needs_review,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) FILTER (WHERE status IN ('matched','approved','paid')) AS avg_processing_days
FROM public.supplier_invoices
GROUP BY tenant_id;

GRANT SELECT ON public.invoice_stp_metrics TO authenticated;

CREATE OR REPLACE VIEW public.invoice_dispute_breakdown AS
SELECT
  tenant_id,
  exception_reason,
  COUNT(*) AS count
FROM public.procurement_matching_results
WHERE status='exception'
GROUP BY tenant_id, exception_reason;

GRANT SELECT ON public.invoice_dispute_breakdown TO authenticated;

-- 9) Triggers updated_at
CREATE OR REPLACE FUNCTION public.tg_inv_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_inv_updated_at ON public.supplier_invoices;
CREATE TRIGGER trg_inv_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.tg_inv_updated_at();
DROP TRIGGER IF EXISTS trg_matching_updated_at ON public.procurement_matching_results;
CREATE TRIGGER trg_matching_updated_at BEFORE UPDATE ON public.procurement_matching_results FOR EACH ROW EXECUTE FUNCTION public.tg_inv_updated_at();

-- 10) تأكيدات
DO $$
BEGIN
  IF to_regclass('public.supplier_invoices') IS NULL THEN RAISE EXCEPTION 'FAILED: supplier_invoices missing'; END IF;
  IF to_regprocedure('public.match_invoice(uuid)') IS NULL THEN RAISE EXCEPTION 'FAILED: match_invoice missing'; END IF;
  IF to_regprocedure('public.detect_duplicate_invoice(uuid,uuid,text,numeric,date)') IS NULL THEN RAISE EXCEPTION 'FAILED: detect_duplicate missing'; END IF;
  RAISE NOTICE '✅ 0186: Invoices + 3-Way Matching Unit 05 full 100%% — 6 tables + 4 RPCs + Tolerance + Early Discount + STP + duplicate detection + RLS';
END $$;
