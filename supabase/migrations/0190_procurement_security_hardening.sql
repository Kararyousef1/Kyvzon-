-- ============================================================================
-- 0190 — Procurement Security Hardening (P0)
-- الهدف: إغلاق أخطر ثغرات بوابة المشتريات قبل إكمال الواجهة.
-- 1) helper لفحص الدور والـ tenant
-- 2) إعادة تعريف RPCs الحساسة مع فحص دور داخلي
-- 3) إلغاء GRANT عن RPCs التي تقبل tenant_id من العميل وإنشاء بدائل آمنة
-- 4) إعادة تعريف Views المشتريات بفلاتر tenant صريحة + security_invoker
-- ============================================================================

CREATE OR REPLACE FUNCTION public.procurement_require_roles(allowed_roles TEXT[])
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role TEXT := public.current_user_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'NO_TENANT';
  END IF;
  -- لا نستخدم current_user_is_staff() هنا لأنه يشمل HR، وهذا واسع جداً لعمليات المشتريات.
  -- أدوار المنصة developer/it_admin مسموحة للعمليات التشخيصية/الدعم، أما بقية الأدوار فتُحدد صراحةً في allowed_roles.
  IF NOT (v_role = ANY(allowed_roles) OR v_role IN ('developer','it_admin')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_PROCUREMENT_OPERATION';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.procurement_require_roles(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.procurement_require_roles(TEXT[]) TO authenticated;


-- Harden RPC: create_purchase_requisition_full

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



-- Harden RPC: approve_procurement_step

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



-- Harden RPC: consolidate_prs

CREATE OR REPLACE FUNCTION public.consolidate_prs(p_pr_ids UUID[])
RETURNS UUID -- pr_id الجديد المدمج
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_first RECORD;
  v_pr_id UUID;
  v_pr_number TEXT;
  v_total NUMERIC :=0;
  v_item RECORD;
BEGIN

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF array_length(p_pr_ids,1) <2 THEN RAISE EXCEPTION 'NEED_AT_LEAST_2_PRS'; END IF;

  SELECT * INTO v_first FROM public.purchase_requisitions WHERE id=p_pr_ids[1] AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR_NOT_FOUND'; END IF;

  -- تحقق أن كلها لنفس القسم ونفس العملة وحالة approved
  IF EXISTS (SELECT 1 FROM public.purchase_requisitions WHERE id=ANY(p_pr_ids) AND (tenant_id!=v_tenant OR department_id IS DISTINCT FROM v_first.department_id OR currency_code!=v_first.currency_code OR status!='approved')) THEN
    RAISE EXCEPTION 'PRS_MUST_BE_SAME_DEPT_CURRENCY_APPROVED';
  END IF;

  SELECT COALESCE(SUM(total_estimated),0) INTO v_total FROM public.purchase_requisitions WHERE id=ANY(p_pr_ids);
  v_pr_number := 'PR-' || to_char(NOW(),'YYYY-') || 'C-' || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 10000)::TEXT,4,'0');

  INSERT INTO public.purchase_requisitions
    (tenant_id, pr_number, requester_id, department_id, cost_center_id, needed_by_date, priority, request_type, source, justification, total_estimated, currency_code, status, consolidated_from)
  VALUES
    (v_tenant, v_pr_number, v_user, v_first.department_id, v_first.cost_center_id, v_first.needed_by_date, 'normal', v_first.request_type, 'manual', 'دمج طلبات: '||array_to_string(p_pr_ids,','), v_total, v_first.currency_code, 'approved', to_jsonb(p_pr_ids))
  RETURNING id INTO v_pr_id;

  -- انسخ البنود
  FOR v_item IN SELECT * FROM public.pr_line_items WHERE pr_id=ANY(p_pr_ids) LOOP
    INSERT INTO public.pr_line_items (tenant_id, pr_id, item_code, description, quantity, unit, estimated_unit_price, suggested_supplier_id, notes)
    VALUES (v_tenant, v_pr_id, v_item.item_code, v_item.description, v_item.quantity, v_item.unit, v_item.estimated_unit_price, v_item.suggested_supplier_id, v_item.notes);
  END LOOP;

  -- علم القديمة أنها دمجت
  UPDATE public.purchase_requisitions SET consolidated_into=v_pr_id, status='converted_to_po', updated_at=NOW() WHERE id=ANY(p_pr_ids);

  RETURN v_pr_id;
END $$;



-- Harden RPC: create_sourcing_event_from_pr

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

  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
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



-- Harden RPC: submit_supplier_bid

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

  v_bid_number := 'BID-' || to_char(NOW(),'YYYYMMDD-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 10000)::TEXT,4,'0');

  INSERT INTO public.supplier_bids
    (tenant_id, event_id, supplier_id, bid_number, total_price, currency_code, lead_time_days, discount_percent, status)
  VALUES
    (v_tenant, p_event_id, p_supplier_id, v_bid_number, p_total_price, COALESCE(p_currency_code,'SAR'), p_lead_time_days, COALESCE(p_discount_percent,0), 'submitted')
  RETURNING id INTO v_bid_id;

  RETURN v_bid_id;
END $$;



-- Harden RPC: evaluate_bid

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



-- Harden RPC: start_procurement_auction

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

  v_number := 'AUC-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.procurement_auctions
    (tenant_id, sourcing_event_id, auction_number, item_description, annual_quantity, starting_price, current_best_price, start_time, end_time, status, created_by)
  VALUES
    (v_tenant, p_sourcing_event_id, v_number, p_item_description, p_annual_quantity, p_starting_price, p_starting_price, NOW(), NOW() + (p_duration_minutes || ' minutes')::INTERVAL, 'live', v_user)
  RETURNING id INTO v_auction_id;

  RETURN v_auction_id;
END $$;



-- Harden RPC: place_auction_bid

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



-- Harden RPC: create_po_from_pr

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



-- Harden RPC: receive_goods

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



-- Harden RPC: post_goods_receipt

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



-- Harden RPC: create_rtv

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

  v_rtv_number := 'RTV-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');

  INSERT INTO public.return_to_vendor
    (tenant_id, gr_id, po_id, rtv_number, quantity, reason, details, lot_number, credit_note_required, created_by)
  VALUES
    (v_tenant, p_gr_id, p_po_id, v_rtv_number, p_quantity, p_reason, p_details, p_lot_number, true, v_user)
  RETURNING id INTO v_rtv_id;

  RETURN v_rtv_id;
END $$;



-- Harden RPC: match_invoice

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



-- Harden RPC: create_contract_version

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



-- Harden RPC: sign_contract

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



-- Harden RPC: classify_spend_transaction

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

  UPDATE public.spend_transactions
  SET category_code = p_category_code
  WHERE id=p_transaction_id AND tenant_id=v_tenant;
END $$;



-- Harden RPC: calculate_supplier_otif

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
  SELECT COUNT(*) INTO v_total FROM public.purchase_orders WHERE supplier_id=p_supplier_id AND tenant_id=v_tenant;
  SELECT COUNT(*) INTO v_on_time FROM public.purchase_orders WHERE supplier_id=p_supplier_id AND tenant_id=v_tenant AND status='received' AND delivery_date >= CURRENT_DATE - INTERVAL '30 days';

  IF v_total=0 THEN RETURN 0; END IF;
  v_otif := v_on_time::NUMERIC / v_total *100;

  UPDATE public.supplier_spend_summary SET otif_score=v_otif, last_calculated_at=NOW() WHERE supplier_id=p_supplier_id AND tenant_id=v_tenant;

  RETURN v_otif;
END $$;



-- ----------------------------------------------------------------------------
-- Tenant-safe overloads: لا تقبل tenant_id من العميل
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.check_pr_budget(UUID,UUID,NUMERIC) FROM PUBLIC, authenticated;
DROP FUNCTION IF EXISTS public.check_pr_budget(UUID,NUMERIC);

CREATE OR REPLACE FUNCTION public.check_pr_budget(
  p_cost_center_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (is_ok BOOLEAN, remaining_before NUMERIC, remaining_after NUMERIC, budget_name TEXT, spent_breakdown JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.is_ok,
    b.remaining_before,
    b.remaining_after,
    b.budget_name,
    b.spent_breakdown
  FROM public.check_pr_budget(public.current_user_tenant_id(), p_cost_center_id, p_amount) AS b;
$$;
GRANT EXECUTE ON FUNCTION public.check_pr_budget(UUID,NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION public.seed_procurement_tolerance_rules(UUID) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.seed_procurement_tolerance_rules()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  INSERT INTO public.procurement_tolerance_rules (tenant_id, rule_type, min_percent, max_percent, auto_approve, approver_role)
  VALUES
    (v_tenant, 'price', 0, 0.5, true, NULL),
    (v_tenant, 'price', 0.5, 2.0, false, 'ap_clerk'),
    (v_tenant, 'price', 2.0, 5.0, false, 'procurement'),
    (v_tenant, 'price', 5.0, 100, false, 'finance'),
    (v_tenant, 'quantity', 0, 0.5, true, NULL),
    (v_tenant, 'quantity', 0.5, 2.0, false, 'ap_clerk'),
    (v_tenant, 'quantity', 2.0, 100, false, 'procurement')
  ON CONFLICT DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_procurement_tolerance_rules() TO authenticated;

REVOKE ALL ON FUNCTION public.detect_duplicate_invoice(UUID,UUID,TEXT,NUMERIC,DATE) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.detect_duplicate_invoice(
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
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_IN_TENANT';
  END IF;

  RETURN QUERY
  SELECT si.id, 'same_number'::TEXT, 100::INT
  FROM public.supplier_invoices si
  WHERE si.tenant_id=v_tenant
    AND si.supplier_id=p_supplier_id
    AND lower(si.invoice_number)=lower(p_invoice_number)
  ORDER BY si.created_at DESC
  LIMIT 5;

  RETURN QUERY
  SELECT si.id, 'same_amount_date'::TEXT, 90::INT
  FROM public.supplier_invoices si
  WHERE si.tenant_id=v_tenant
    AND si.supplier_id=p_supplier_id
    AND si.total_amount = p_total_amount
    AND si.invoice_date BETWEEN p_invoice_date - INTERVAL '7 days' AND p_invoice_date + INTERVAL '7 days'
    AND lower(si.invoice_number) != lower(p_invoice_number)
  LIMIT 5;
END $$;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_invoice(UUID,TEXT,NUMERIC,DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.detect_maverick_spend(UUID) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.detect_maverick_spend()
RETURNS TABLE (transaction_id UUID, supplier_id UUID, amount NUMERIC, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  RETURN QUERY
  SELECT
    st.id,
    st.supplier_id,
    st.amount,
    CASE
      WHEN po.id IS NULL THEN 'بدون أمر شراء'
      WHEN s.status != 'approved' THEN 'مورد غير معتمد'
      ELSE 'تحت حد الشراء'
    END AS reason
  FROM public.spend_transactions st
  LEFT JOIN public.purchase_orders po ON po.id=st.po_id AND po.tenant_id=v_tenant
  LEFT JOIN public.suppliers s ON s.id=st.supplier_id AND s.tenant_id=v_tenant
  WHERE st.tenant_id=v_tenant
    AND (po.id IS NULL OR s.status != 'approved');
END $$;
GRANT EXECUTE ON FUNCTION public.detect_maverick_spend() TO authenticated;

REVOKE ALL ON FUNCTION public.forecast_spend(UUID,TEXT,TEXT) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.forecast_spend(
  p_period TEXT,
  p_category_code TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_avg NUMERIC;
  v_forecast NUMERIC;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT AVG(amount) INTO v_avg
  FROM public.spend_transactions
  WHERE tenant_id=v_tenant
    AND (p_category_code IS NULL OR category_code=p_category_code)
    AND transaction_date >= CURRENT_DATE - INTERVAL '12 months';

  v_forecast := COALESCE(v_avg,0) * 1.08;

  INSERT INTO public.spend_forecasts
    (tenant_id, period, category_code, forecasted_amount, method)
  VALUES
    (v_tenant, p_period, p_category_code, v_forecast, 'trend')
  ON CONFLICT (tenant_id, period, category_code)
  DO UPDATE SET forecasted_amount=EXCLUDED.forecasted_amount, method='trend';

  RETURN v_forecast;
END $$;
GRANT EXECUTE ON FUNCTION public.forecast_spend(TEXT,TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- Tenant-scoped procurement views (security_invoker + current tenant filter)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pr_pending_with_age
WITH (security_invoker = true) AS
SELECT 
  pr.id,
  pr.tenant_id,
  pr.pr_number,
  pr.requester_id,
  pr.department_id,
  pr.cost_center_id,
  pr.total_estimated,
  pr.priority,
  pr.status,
  pr.created_at,
  EXTRACT(EPOCH FROM (NOW() - pr.created_at))/3600 AS age_hours,
  p.full_name AS requester_name,
  d.name_ar AS department_name,
  cc.name_ar AS cost_center_name,
  (SELECT is_ok FROM public.check_pr_budget(pr.cost_center_id, pr.total_estimated) LIMIT 1) AS budget_ok
FROM public.purchase_requisitions pr
LEFT JOIN public.profiles p ON p.id=pr.requester_id
LEFT JOIN public.departments d ON d.id=pr.department_id
LEFT JOIN public.cost_centers cc ON cc.id=pr.cost_center_id AND cc.tenant_id=pr.tenant_id
WHERE pr.status='pending_approval'
  AND pr.tenant_id = public.current_user_tenant_id();
GRANT SELECT ON public.pr_pending_with_age TO authenticated;

CREATE OR REPLACE VIEW public.pr_rogue_spending
WITH (security_invoker = true) AS
SELECT pr.id, pr.tenant_id, pr.pr_number, pr.total_estimated, pr.budget_status, pr.status, pr.created_at
FROM public.purchase_requisitions pr
WHERE pr.tenant_id = public.current_user_tenant_id()
  AND (pr.budget_status='exceeded' OR pr.status='cancelled');
GRANT SELECT ON public.pr_rogue_spending TO authenticated;

CREATE OR REPLACE VIEW public.supplier_expiry_alerts
WITH (security_invoker = true) AS
SELECT 
  sd.supplier_id,
  s.legal_name,
  sd.doc_type,
  sd.expiry_date,
  (sd.expiry_date - CURRENT_DATE)::INT AS days_left,
  CASE 
    WHEN sd.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN sd.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical_30'
    WHEN sd.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning_90'
    ELSE 'ok'
  END AS alert_level
FROM public.supplier_documents sd
JOIN public.suppliers s ON s.id=sd.supplier_id AND s.tenant_id=sd.tenant_id
WHERE sd.tenant_id = public.current_user_tenant_id()
  AND sd.verification_status='verified'
  AND sd.expiry_date IS NOT NULL;
GRANT SELECT ON public.supplier_expiry_alerts TO authenticated;

CREATE OR REPLACE VIEW public.rfq_tco_comparison
WITH (security_invoker = true) AS
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
  (SELECT AVG(delivery_score) FROM public.bid_evaluations be WHERE be.bid_id=sb.id AND be.tenant_id=se.tenant_id) AS avg_delivery_score,
  (SELECT AVG(total_score) FROM public.bid_evaluations be WHERE be.bid_id=sb.id AND be.tenant_id=se.tenant_id) AS avg_total_score
FROM public.sourcing_events se
JOIN public.supplier_bids sb ON sb.event_id=se.id AND sb.tenant_id=se.tenant_id
JOIN public.suppliers s ON s.id=sb.supplier_id AND s.tenant_id=se.tenant_id
WHERE se.type='RFQ'
  AND se.tenant_id = public.current_user_tenant_id();
GRANT SELECT ON public.rfq_tco_comparison TO authenticated;

CREATE OR REPLACE VIEW public.auction_savings
WITH (security_invoker = true) AS
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
WHERE pa.tenant_id = public.current_user_tenant_id()
  AND pa.status='ended'
  AND pa.current_best_price IS NOT NULL;
GRANT SELECT ON public.auction_savings TO authenticated;

CREATE OR REPLACE VIEW public.po_tracking
WITH (security_invoker = true) AS
SELECT 
  po.id, po.tenant_id, po.po_number, po.supplier_id, s.legal_name AS supplier_name,
  po.po_type, po.status, po.total_amount, po.currency_code, po.delivery_date, po.tracking_number,
  po.created_at,
  (SELECT COALESCE(SUM(received_quantity),0) FROM public.po_line_items WHERE po_id=po.id AND tenant_id=po.tenant_id) AS total_received,
  (SELECT COALESCE(SUM(quantity),0) FROM public.po_line_items WHERE po_id=po.id AND tenant_id=po.tenant_id) AS total_ordered,
  CASE 
    WHEN (SELECT SUM(pending_quantity) FROM public.po_line_items WHERE po_id=po.id AND tenant_id=po.tenant_id) =0 THEN 'مكتمل'
    WHEN (SELECT SUM(received_quantity) FROM public.po_line_items WHERE po_id=po.id AND tenant_id=po.tenant_id) =0 THEN 'لم يستلم'
    ELSE 'استلام جزئي'
  END AS receipt_status
FROM public.purchase_orders po
LEFT JOIN public.suppliers s ON s.id=po.supplier_id AND s.tenant_id=po.tenant_id
WHERE po.tenant_id = public.current_user_tenant_id();
GRANT SELECT ON public.po_tracking TO authenticated;

CREATE OR REPLACE VIEW public.otif_metrics
WITH (security_invoker = true) AS
SELECT
  tenant_id,
  COUNT(*) AS total_pos,
  COUNT(*) FILTER (WHERE status='received' AND delivery_date >= CURRENT_DATE - INTERVAL '30 days') AS on_time_deliveries,
  ROUND(COUNT(*) FILTER (WHERE status='received')::NUMERIC / NULLIF(COUNT(*),0) *100,2) AS otif_percent
FROM public.purchase_orders
WHERE tenant_id = public.current_user_tenant_id()
GROUP BY tenant_id;
GRANT SELECT ON public.otif_metrics TO authenticated;

CREATE OR REPLACE VIEW public.invoice_stp_metrics
WITH (security_invoker = true) AS
SELECT
  tenant_id,
  COUNT(*) AS total_invoices,
  COUNT(*) FILTER (WHERE status='matched') AS stp_matched,
  ROUND(COUNT(*) FILTER (WHERE status='matched')::NUMERIC / NULLIF(COUNT(*),0)*100,2) AS stp_percent,
  COUNT(*) FILTER (WHERE status='exception') AS needs_review,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) FILTER (WHERE status IN ('matched','approved','paid')) AS avg_processing_days
FROM public.supplier_invoices
WHERE tenant_id = public.current_user_tenant_id()
GROUP BY tenant_id;
GRANT SELECT ON public.invoice_stp_metrics TO authenticated;

CREATE OR REPLACE VIEW public.invoice_dispute_breakdown
WITH (security_invoker = true) AS
SELECT tenant_id, exception_reason, COUNT(*) AS count
FROM public.procurement_matching_results
WHERE tenant_id = public.current_user_tenant_id()
  AND status='exception'
GROUP BY tenant_id, exception_reason;
GRANT SELECT ON public.invoice_dispute_breakdown TO authenticated;

CREATE OR REPLACE VIEW public.contract_renewals_upcoming
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, contract_number, supplier_id, title, end_date,
  (end_date - CURRENT_DATE)::INT AS days_until_expiry,
  total_value,
  CASE 
    WHEN end_date <= CURRENT_DATE THEN 'expired'
    WHEN end_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical_30'
    WHEN end_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning_90'
    ELSE 'ok'
  END AS renewal_status
FROM public.procurement_contracts
WHERE tenant_id = public.current_user_tenant_id()
  AND status IN ('active','signed')
  AND end_date IS NOT NULL
ORDER BY end_date ASC;
GRANT SELECT ON public.contract_renewals_upcoming TO authenticated;

CREATE OR REPLACE VIEW public.spend_pareto_80_20
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  supplier_id,
  SUM(amount) AS total_spend,
  SUM(SUM(amount)) OVER (PARTITION BY tenant_id ORDER BY SUM(amount) DESC ROWS UNBOUNDED PRECEDING) AS cumulative_spend,
  SUM(SUM(amount)) OVER (PARTITION BY tenant_id) AS grand_total,
  ROUND(SUM(SUM(amount)) OVER (PARTITION BY tenant_id ORDER BY SUM(amount) DESC ROWS UNBOUNDED PRECEDING) / NULLIF(SUM(SUM(amount)) OVER (PARTITION BY tenant_id),0) *100,2) AS cumulative_percent
FROM public.spend_transactions
WHERE tenant_id = public.current_user_tenant_id()
GROUP BY tenant_id, supplier_id
ORDER BY total_spend DESC;
GRANT SELECT ON public.spend_pareto_80_20 TO authenticated;

CREATE OR REPLACE VIEW public.price_trend
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  item_code,
  valid_from,
  price,
  LAG(price) OVER (PARTITION BY tenant_id, item_code ORDER BY valid_from) AS prev_price,
  CASE WHEN LAG(price) OVER (PARTITION BY tenant_id, item_code ORDER BY valid_from) IS NOT NULL 
       THEN ROUND((price - LAG(price) OVER (PARTITION BY tenant_id, item_code ORDER BY valid_from)) / NULLIF(LAG(price) OVER (PARTITION BY tenant_id, item_code ORDER BY valid_from),0) *100,2)
       ELSE 0 END AS change_percent
FROM public.procurement_price_history
WHERE tenant_id = public.current_user_tenant_id()
ORDER BY item_code, valid_from;
GRANT SELECT ON public.price_trend TO authenticated;

-- ----------------------------------------------------------------------------
-- تأكيدات P0
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_leaky_rpc TEXT;
BEGIN
  IF to_regprocedure('public.procurement_require_roles(text[])') IS NULL THEN
    RAISE EXCEPTION '0190 failed: procurement_require_roles missing';
  END IF;

  -- لا نستخدم فهارس صلاحيات information_schema هنا لأنها تربط بالصلاحيات على اسم الدالة فقط،
  -- ومع وجود overload آمن بنفس الاسم سيُنتج ذلك false positive ضد النسخة القديمة التي تستقبل tenant_id.
  -- الفحص الصحيح يجب أن يكون على OID/التوقيع المحدد للدالة.
  SELECT p.oid::regprocedure::TEXT
    INTO v_leaky_rpc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('forecast_spend','detect_maverick_spend','detect_duplicate_invoice','seed_procurement_tolerance_rules')
    AND p.pronargs > 0
    AND pg_get_function_identity_arguments(p.oid) LIKE '%tenant%'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LIMIT 1;

  IF v_leaky_rpc IS NOT NULL THEN
    RAISE EXCEPTION '0190 failed: tenant-taking procurement RPC still executable by authenticated: %', v_leaky_rpc;
  END IF;

  RAISE NOTICE '✅ 0190: Procurement P0 security hardening applied — guarded RPCs, tenant-safe overloads, tenant-scoped views';
END $$;
