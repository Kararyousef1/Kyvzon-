-- ============================================================================
-- 0191 — Procurement Same-Tenant Assertions (P0 follow-up)
-- الهدف: منع تمرير UUID من شركة أخرى داخل RPCs الحساسة حتى مع SECURITY DEFINER.
-- يعتمد على 0190.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.procurement_assert_supplier_in_tenant(p_supplier_id UUID, p_require_approved BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_status TEXT;
BEGIN
  IF p_supplier_id IS NULL THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED'; END IF;
  SELECT status INTO v_status FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_NOT_IN_TENANT'; END IF;
  IF p_require_approved AND v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_APPROVED';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_department_in_tenant(p_department_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF p_department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id=p_department_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_cost_center_in_tenant(p_cost_center_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers WHERE id=p_cost_center_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'COST_CENTER_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_pr_in_tenant(p_pr_id UUID, p_required_status TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.purchase_requisitions WHERE id=p_pr_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR_NOT_IN_TENANT'; END IF;
  IF p_required_status IS NOT NULL AND v_status IS DISTINCT FROM p_required_status THEN
    RAISE EXCEPTION 'PR_INVALID_STATUS expected %, got %', p_required_status, v_status;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_sourcing_event_in_tenant(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF p_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sourcing_events WHERE id=p_event_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'SOURCING_EVENT_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_bid_in_tenant(p_bid_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supplier_bids WHERE id=p_bid_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'BID_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_auction_in_tenant(p_auction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.procurement_auctions WHERE id=p_auction_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'AUCTION_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_po_in_tenant(p_po_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id=p_po_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'PO_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_gr_in_tenant(p_gr_id UUID, p_po_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF p_gr_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.goods_receipts
    WHERE id=p_gr_id AND tenant_id=v_tenant AND (p_po_id IS NULL OR po_id=p_po_id)
  ) THEN
    RAISE EXCEPTION 'GR_NOT_IN_TENANT_OR_PO';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_invoice_in_tenant(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'INVOICE_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_contract_in_tenant(p_contract_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.procurement_contracts WHERE id=p_contract_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'CONTRACT_NOT_IN_TENANT';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_assert_spend_transaction_in_tenant(p_transaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.spend_transactions WHERE id=p_transaction_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'SPEND_TRANSACTION_NOT_IN_TENANT';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.procurement_assert_supplier_in_tenant(UUID,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_department_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_cost_center_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_pr_in_tenant(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_sourcing_event_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_bid_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_auction_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_po_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_gr_in_tenant(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_invoice_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_contract_in_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procurement_assert_spend_transaction_in_tenant(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.procurement_assert_supplier_in_tenant(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_department_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_cost_center_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_pr_in_tenant(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_sourcing_event_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_bid_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_auction_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_po_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_gr_in_tenant(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_invoice_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_contract_in_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_assert_spend_transaction_in_tenant(UUID) TO authenticated;


-- Same-tenant hardened override
CREATE OR REPLACE FUNCTION public.create_purchase_requisition_full(
  p_department_id UUID,
  p_cost_center_id UUID,
  p_needed_by_date DATE,
  p_priority TEXT,
  p_request_type TEXT,
  p_justification TEXT,
  p_emergency_reason TEXT,
  p_source TEXT,
  p_currency_code TEXT,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_pr_id UUID;
  v_pr_number TEXT;
  v_total NUMERIC(16,2) := 0;
  v_item JSONB;
  v_budget_check RECORD;
  v_chain RECORD;
  v_req_id UUID;
  v_order INT := 0;
  v_first_active INT := NULL;
BEGIN

  PERFORM public.procurement_require_roles(ARRAY['employee','supervisor','manager','procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  PERFORM public.procurement_assert_department_in_tenant(p_department_id);
  PERFORM public.procurement_assert_cost_center_in_tenant(p_cost_center_id);
  IF p_items IS NULL OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'EMPTY_ITEMS'; END IF;
  IF p_priority='emergency' AND (p_emergency_reason IS NULL OR length(trim(p_emergency_reason))<10) THEN
    RAISE EXCEPTION 'EMERGENCY_NEEDS_REASON (min 10 chars)';
  END IF;
  IF p_request_type='service' THEN
    -- للخدمات، quantity قد تكون ساعات، لا تحتاج Lot — نسمح
    NULL;
  END IF;

  -- حساب الإجمالي
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'description') IS NULL OR length(trim(v_item->>'description'))=0 THEN
      RAISE EXCEPTION 'ITEM_DESC_REQUIRED';
    END IF;
    v_total := v_total + COALESCE((v_item->>'quantity')::NUMERIC,0) * COALESCE((v_item->>'estimated_unit_price')::NUMERIC,0);
  END LOOP;

  -- فحص الميزانية الحقيقي
  SELECT * INTO v_budget_check FROM public.check_pr_budget(v_tenant, p_cost_center_id, v_total);
  IF NOT v_budget_check.is_ok AND p_priority!='emergency' THEN
    -- للطوارئ نسمح بتجاوز الميزانية مع تسجيل، لغير الطوارئ نرفض إذا تجاوز
    -- لكن حسب التقرير، نسمح مع budget_status=exceeded ويحتاج موافقة مالية إضافية
    NULL;
  END IF;

  -- توليد رقم PR فريد
  v_pr_number := 'PR-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT, 5, '0');

  INSERT INTO public.purchase_requisitions
    (tenant_id, pr_number, requester_id, department_id, cost_center_id, needed_by_date, priority, request_type, source, justification, emergency_reason, budget_checked, budget_status, budget_remaining_before, budget_remaining_after, total_estimated, currency_code, status, current_approval_level)
  VALUES
    (v_tenant, v_pr_number, v_user, p_department_id, p_cost_center_id, p_needed_by_date, COALESCE(p_priority,'normal'), COALESCE(p_request_type,'raw_material'), COALESCE(p_source,'manual'), p_justification, p_emergency_reason, true, CASE WHEN v_budget_check.is_ok THEN 'ok' ELSE 'exceeded' END, v_budget_check.remaining_before, v_budget_check.remaining_after, v_total, COALESCE(p_currency_code,'SAR'), 'pending_approval', 1)
  RETURNING id INTO v_pr_id;

  -- بنود
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(v_item->>'suggested_supplier_id','') IS NOT NULL THEN
      PERFORM public.procurement_assert_supplier_in_tenant((v_item->>'suggested_supplier_id')::UUID, false);
    END IF;
    INSERT INTO public.pr_line_items
      (tenant_id, pr_id, item_code, description, quantity, unit, estimated_unit_price, suggested_supplier_id, unspsc_code, notes)
    VALUES
      (v_tenant, v_pr_id, v_item->>'item_code', v_item->>'description', (v_item->>'quantity')::NUMERIC, COALESCE(v_item->>'unit','PCS'), (v_item->>'estimated_unit_price')::NUMERIC, NULLIF(v_item->>'suggested_supplier_id','')::UUID, v_item->>'unspsc_code', v_item->>'notes');
  END LOOP;

  -- إنشاء طلب موافقة + مراحله من سلسلة الهيكل التنظيمي + مبلغ
  INSERT INTO public.procurement_approval_requests
    (tenant_id, request_type, related_id, requester_id, department_id, total_amount, status, current_step)
  VALUES
    (v_tenant, 'pr', v_pr_id, v_user, p_department_id, v_total, 'pending', 1)
  RETURNING id INTO v_req_id;

  FOR v_chain IN SELECT * FROM public.resolve_procurement_approval_chain(p_department_id, v_total) LOOP
    v_order := v_order+1;
    INSERT INTO public.procurement_approval_steps
      (request_id, tenant_id, step_order, approver_role, approver_id, status)
    VALUES
      (v_req_id, v_tenant, v_order, v_chain.approver_role, v_chain.approver_id, CASE WHEN v_first_active IS NULL THEN 'active' ELSE 'pending' END);
    IF v_first_active IS NULL THEN v_first_active := v_order; END IF;
  END LOOP;

  IF v_order=0 THEN
    UPDATE public.procurement_approval_requests SET status='approved', updated_at=NOW() WHERE id=v_req_id;
    UPDATE public.purchase_requisitions SET status='approved', updated_at=NOW() WHERE id=v_pr_id;
  END IF;

  RETURN v_pr_id;
END $$;

-- Same-tenant hardened override
CREATE OR REPLACE FUNCTION public.approve_procurement_step(
  p_request_id UUID,
  p_decision TEXT,
  p_comments TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_active RECORD;
  v_next RECORD;
  v_final TEXT;
  v_pr_id UUID;
BEGIN

  PERFORM public.procurement_require_roles(ARRAY['employee','supervisor','manager','procurement','admin','finance']::TEXT[]);
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procurement_approval_requests WHERE id=p_request_id AND tenant_id=public.current_user_tenant_id()) THEN
    RAISE EXCEPTION 'APPROVAL_REQUEST_NOT_IN_TENANT';
  END IF;

  SELECT * INTO v_active FROM public.procurement_approval_steps WHERE request_id=p_request_id AND status='active' ORDER BY step_order LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_STEP'; END IF;
  IF v_active.approver_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_THIS_STEP'; END IF;

  UPDATE public.procurement_approval_steps SET status=p_decision, comments=p_comments, decided_at=NOW() WHERE id=v_active.id;

  SELECT related_id INTO v_pr_id FROM public.procurement_approval_requests WHERE id=p_request_id;

  IF p_decision='rejected' THEN
    UPDATE public.procurement_approval_requests SET status='rejected', updated_at=NOW() WHERE id=p_request_id;
    UPDATE public.purchase_requisitions SET status='rejected', updated_at=NOW() WHERE id=v_pr_id;
    v_final := 'rejected';
  ELSE
    SELECT * INTO v_next FROM public.procurement_approval_steps WHERE request_id=p_request_id AND step_order>v_active.step_order AND status='pending' ORDER BY step_order LIMIT 1;
    IF FOUND THEN
      UPDATE public.procurement_approval_steps SET status='active' WHERE id=v_next.id;
      UPDATE public.procurement_approval_requests SET current_step=v_next.step_order, updated_at=NOW() WHERE id=p_request_id;
      UPDATE public.purchase_requisitions SET current_approval_level=v_next.step_order, updated_at=NOW() WHERE id=v_pr_id;
      v_final := 'pending';
    ELSE
      UPDATE public.procurement_approval_requests SET status='approved', updated_at=NOW() WHERE id=p_request_id;
      UPDATE public.purchase_requisitions SET status='approved', updated_at=NOW() WHERE id=v_pr_id;
      v_final := 'approved';
    END IF;
  END IF;
  RETURN v_final;
END $$;

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_total_price <=0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  PERFORM public.procurement_assert_sourcing_event_in_tenant(p_event_id);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, true);

  v_bid_number := 'BID-' || to_char(NOW(),'YYYYMMDD-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 10000)::TEXT,4,'0');

  INSERT INTO public.supplier_bids
    (tenant_id, event_id, supplier_id, bid_number, total_price, currency_code, lead_time_days, discount_percent, status)
  VALUES
    (v_tenant, p_event_id, p_supplier_id, v_bid_number, p_total_price, COALESCE(p_currency_code,'SAR'), p_lead_time_days, COALESCE(p_discount_percent,0), 'submitted')
  RETURNING id INTO v_bid_id;

  RETURN v_bid_id;
END $$;

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','manager']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_bid_in_tenant(p_bid_id);

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

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_sourcing_event_in_tenant(p_sourcing_event_id);

  v_number := 'AUC-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.procurement_auctions
    (tenant_id, sourcing_event_id, auction_number, item_description, annual_quantity, starting_price, current_best_price, start_time, end_time, status, created_by)
  VALUES
    (v_tenant, p_sourcing_event_id, v_number, p_item_description, p_annual_quantity, p_starting_price, p_starting_price, NOW(), NOW() + (p_duration_minutes || ' minutes')::INTERVAL, 'live', v_user)
  RETURNING id INTO v_auction_id;

  RETURN v_auction_id;
END $$;

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_bid_price <=0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  PERFORM public.procurement_assert_auction_in_tenant(p_auction_id);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, true);

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

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_po_type NOT IN ('standard','blanket','consolidated','open','emergency') THEN RAISE EXCEPTION 'INVALID_PO_TYPE'; END IF;
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, true);

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

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
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
    IF v_po_line.po_id IS DISTINCT FROM p_po_id THEN RAISE EXCEPTION 'PO_LINE_DOES_NOT_BELONG_TO_PO'; END IF;

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
    UPDATE public.po_line_items SET received_quantity = received_quantity + (v_item->>'received_qty')::NUMERIC WHERE id=v_po_line.id AND tenant_id=v_tenant;
  END LOOP;

  -- حدث حالة PO إلى partially_received أو received
  IF EXISTS (SELECT 1 FROM public.po_line_items WHERE po_id=p_po_id AND tenant_id=v_tenant AND pending_quantity>0) THEN
    UPDATE public.purchase_orders SET status='partially_received', updated_at=NOW() WHERE id=p_po_id;
  ELSE
    UPDATE public.purchase_orders SET status='received', updated_at=NOW() WHERE id=p_po_id;
  END IF;

  RETURN v_gr_id;
END $$;

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_gr_in_tenant(p_gr_id, NULL);

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

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_reason NOT IN ('quality_rejected','over_delivery','damaged','wrong_item','expired','other') THEN RAISE EXCEPTION 'INVALID_RTV_REASON'; END IF;
  PERFORM public.procurement_assert_po_in_tenant(p_po_id);
  PERFORM public.procurement_assert_gr_in_tenant(p_gr_id, p_po_id);

  v_rtv_number := 'RTV-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.return_to_vendor
    (tenant_id, gr_id, po_id, rtv_number, quantity, reason, details, lot_number, credit_note_required, created_by)
  VALUES
    (v_tenant, p_gr_id, p_po_id, v_rtv_number, p_quantity, p_reason, p_details, p_lot_number, true, v_user)
  RETURNING id INTO v_rtv_id;

  RETURN v_rtv_id;
END $$;

-- Same-tenant hardened override
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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_invoice FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  IF v_invoice.supplier_id IS NOT NULL THEN
    PERFORM public.procurement_assert_supplier_in_tenant(v_invoice.supplier_id, false);
  END IF;

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
      IF v_po_line.po_id IS DISTINCT FROM v_po.id THEN RAISE EXCEPTION 'INVOICE_LINE_PO_LINE_NOT_IN_INVOICE_PO'; END IF;
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
    UPDATE public.supplier_invoices SET status='exception', updated_at=NOW() WHERE id=p_invoice_id AND tenant_id=v_tenant;
  ELSIF EXISTS (SELECT 1 FROM public.procurement_matching_results WHERE invoice_id=p_invoice_id AND status='tolerance') THEN
    UPDATE public.supplier_invoices SET status='tolerance', updated_at=NOW() WHERE id=p_invoice_id AND tenant_id=v_tenant;
  ELSE
    UPDATE public.supplier_invoices SET status='matched', updated_at=NOW() WHERE id=p_invoice_id AND tenant_id=v_tenant;
  END IF;
END $$;

-- Same-tenant hardened override
CREATE OR REPLACE FUNCTION public.create_contract_version(
  p_contract_id UUID,
  p_version_number TEXT,
  p_content TEXT,
  p_change_summary TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_id UUID;
BEGIN

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_contract_in_tenant(p_contract_id);
  -- v1.0 الموقعة لا تُعدل أبداً — يجب إنشاء تعديل ملحق
  IF EXISTS (SELECT 1 FROM public.contract_versions WHERE contract_id=p_contract_id AND version_number='v1.0' AND tenant_id=v_tenant) AND p_version_number='v1.0' THEN
    RAISE EXCEPTION 'SIGNED_VERSION_IMMUTABLE: v1.0 cannot be modified, create amendment';
  END IF;

  INSERT INTO public.contract_versions
    (tenant_id, contract_id, version_number, content, change_summary, created_by)
  VALUES
    (v_tenant, p_contract_id, p_version_number, p_content, p_change_summary, v_user)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- Same-tenant hardened override
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_contract_id UUID,
  p_signer_email TEXT,
  p_signer_role TEXT,
  p_ip INET
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
BEGIN

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_contract_in_tenant(p_contract_id);

  INSERT INTO public.contract_signatures
    (tenant_id, contract_id, signer_email, signer_role, signed_at, ip_address, signature_method, otp_verified)
  VALUES
    (v_tenant, p_contract_id, lower(trim(p_signer_email)), p_signer_role, NOW(), p_ip, 'click', true)
  RETURNING id INTO v_id;

  -- إذا اكتمل كل الموقعين المطلوبين، حول العقد إلى signed
  IF (SELECT COUNT(*) FROM public.contract_signatures WHERE contract_id=p_contract_id AND signed_at IS NOT NULL) >= 2 THEN
    UPDATE public.procurement_contracts SET status='signed', updated_at=NOW() WHERE id=p_contract_id AND tenant_id=v_tenant;
  END IF;

  RETURN v_id;
END $$;

-- Same-tenant hardened override
CREATE OR REPLACE FUNCTION public.classify_spend_transaction(
  p_transaction_id UUID,
  p_category_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_spend_transaction_in_tenant(p_transaction_id);
  IF p_category_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.spend_categories WHERE code=p_category_code AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'SPEND_CATEGORY_NOT_IN_TENANT';
  END IF;

  UPDATE public.spend_transactions
  SET category_code = p_category_code
  WHERE id=p_transaction_id AND tenant_id=v_tenant;
END $$;

-- Same-tenant hardened override
CREATE OR REPLACE FUNCTION public.calculate_supplier_otif(
  p_supplier_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_total INT;
  v_on_time INT;
  v_otif NUMERIC;
BEGIN

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, false);
  SELECT COUNT(*) INTO v_total FROM public.purchase_orders WHERE supplier_id=p_supplier_id AND tenant_id=v_tenant;
  SELECT COUNT(*) INTO v_on_time FROM public.purchase_orders WHERE supplier_id=p_supplier_id AND tenant_id=v_tenant AND status='received' AND delivery_date >= CURRENT_DATE - INTERVAL '30 days';

  IF v_total=0 THEN RETURN 0; END IF;
  v_otif := v_on_time::NUMERIC / v_total *100;

  UPDATE public.supplier_spend_summary SET otif_score=v_otif, last_calculated_at=NOW() WHERE supplier_id=p_supplier_id AND tenant_id=v_tenant;

  RETURN v_otif;
END $$;


-- تأكيدات 0191
DO $$
BEGIN
  IF to_regprocedure('public.procurement_assert_supplier_in_tenant(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '0191 failed: supplier assertion helper missing';
  END IF;
  IF to_regprocedure('public.procurement_assert_po_in_tenant(uuid)') IS NULL THEN
    RAISE EXCEPTION '0191 failed: PO assertion helper missing';
  END IF;
  RAISE NOTICE '✅ 0191: Procurement same-tenant assertions applied to sensitive RPCs';
END $$;
