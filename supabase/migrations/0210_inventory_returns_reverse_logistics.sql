-- ============================================================================
-- 0210 — Inventory Unit 06: Returns Management & Reverse Logistics
-- docs/inventory/06-returns-management-reverse-logistics.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_rmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rma_number TEXT NOT NULL,
  return_type TEXT NOT NULL DEFAULT 'customer_return' CHECK (return_type IN ('customer_return','production_return','rtv','inter_warehouse_transfer')),
  customer_id UUID,
  customer_name TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  original_sales_order_id UUID,
  original_invoice_id UUID,
  original_shipment_id UUID REFERENCES public.inventory_shipments(id) ON DELETE SET NULL,
  original_po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','policy_review','approved','rejected','label_sent','in_transit','received','partially_received','grading','disposition','closed','cancelled','expired')),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('defective','wrong_item','excess_quantity','customer_changed_mind','shipping_damage','cancelled_order','iqc_rejected','spec_mismatch','expired_on_arrival','our_ordering_error','production_excess','work_order_cancelled','unused_material','line_quality_rejected','transfer_return','other')),
  policy_result TEXT NOT NULL DEFAULT 'pending' CHECK (policy_result IN ('pending','accepted','rejected','manual_review')),
  warranty_valid BOOLEAN,
  returnable BOOLEAN NOT NULL DEFAULT true,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  return_label_url TEXT,
  packing_instructions TEXT,
  shipping_instructions TEXT,
  expected_total_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'SAR',
  policy_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, rma_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_rma_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rma_id UUID NOT NULL REFERENCES public.inventory_rmas(id) ON DELETE CASCADE,
  line_number INT NOT NULL DEFAULT 1,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  original_shipment_package_id UUID REFERENCES public.inventory_shipment_packages(id) ON DELETE SET NULL,
  original_lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  original_serial_id UUID REFERENCES public.inventory_serial_numbers(id) ON DELETE SET NULL,
  expected_qty NUMERIC(16,4) NOT NULL CHECK (expected_qty > 0),
  received_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'PCS',
  unit_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  declared_reason TEXT,
  expected_condition TEXT,
  status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','received','partially_received','over_received','graded','routed','closed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, rma_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_return_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  rma_id UUID REFERENCES public.inventory_rmas(id) ON DELETE SET NULL,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  dock_id UUID REFERENCES public.inventory_docks(id) ON DELETE SET NULL,
  quarantine_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  carrier_name TEXT,
  tracking_number TEXT,
  package_condition TEXT CHECK (package_condition IS NULL OR package_condition IN ('intact','damaged','wet','opened','missing_label','unknown')),
  external_damage BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','counted','grading','closed','exception')),
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_return_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES public.inventory_return_receipts(id) ON DELETE CASCADE,
  rma_line_id UUID REFERENCES public.inventory_rma_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  quarantine_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  serial_id UUID REFERENCES public.inventory_serial_numbers(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  declared_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  received_qty NUMERIC(16,4) NOT NULL CHECK (received_qty > 0),
  quantity_difference NUMERIC(16,4) GENERATED ALWAYS AS (received_qty - declared_qty) STORED,
  package_damage BOOLEAN NOT NULL DEFAULT false,
  scan_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'awaiting_grading' CHECK (status IN ('awaiting_grading','graded','routed','closed','exception')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_return_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES public.inventory_return_receipts(id) ON DELETE CASCADE,
  rma_id UUID REFERENCES public.inventory_rmas(id) ON DELETE SET NULL,
  scanned_value TEXT NOT NULL,
  scan_type TEXT NOT NULL DEFAULT 'barcode' CHECK (scan_type IN ('rma','item','lpn','serial','lot','tracking','barcode','qr','rfid')),
  scan_result TEXT NOT NULL DEFAULT 'warning' CHECK (scan_result IN ('accepted','warning','rejected')),
  result_message TEXT,
  scanned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_return_condition_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_line_id UUID NOT NULL REFERENCES public.inventory_return_receipt_lines(id) ON DELETE CASCADE,
  rma_id UUID REFERENCES public.inventory_rmas(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  condition_grade TEXT NOT NULL CHECK (condition_grade IN ('A','B','C','D')),
  condition_label_ar TEXT NOT NULL,
  defect_found BOOLEAN NOT NULL DEFAULT false,
  defect_source TEXT CHECK (defect_source IS NULL OR defect_source IN ('raw_material','supplier','production_process','iqc_failure','oqc_failure','packing','shipping','customer_use','unknown')),
  defect_type TEXT,
  defect_description TEXT,
  functional_test_result TEXT CHECK (functional_test_result IS NULL OR functional_test_result IN ('pass','fail','not_required','inconclusive')),
  packaging_status TEXT CHECK (packaging_status IS NULL OR packaging_status IN ('original_intact','original_damaged','missing','repack_required')),
  grading_accuracy_verified BOOLEAN NOT NULL DEFAULT false,
  estimated_original_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  estimated_recovered_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  recommended_disposition TEXT NOT NULL CHECK (recommended_disposition IN ('restock','repack_resell','repair_internal','return_to_vendor','scrap_recycle')),
  photos JSONB NOT NULL DEFAULT '[]'::JSONB,
  assessed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_return_disposition_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_number TEXT NOT NULL,
  assessment_id UUID NOT NULL REFERENCES public.inventory_return_condition_assessments(id) ON DELETE CASCADE,
  receipt_line_id UUID NOT NULL REFERENCES public.inventory_return_receipt_lines(id) ON DELETE CASCADE,
  rma_id UUID REFERENCES public.inventory_rmas(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  disposition TEXT NOT NULL CHECK (disposition IN ('restock','repack_resell','repair_internal','return_to_vendor','scrap_recycle')),
  target_warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  target_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  refurbished_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','completed','cancelled','blocked')),
  actual_recovered_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, task_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_return_repack_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  disposition_task_id UUID NOT NULL REFERENCES public.inventory_return_disposition_tasks(id) ON DELETE CASCADE,
  station_id UUID REFERENCES public.inventory_packing_stations(id) ON DELETE SET NULL,
  refurbished_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  new_packaging_material_id UUID REFERENCES public.inventory_packaging_materials(id) ON DELETE SET NULL,
  price_markdown_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_return_repair_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  repair_number TEXT NOT NULL,
  disposition_task_id UUID NOT NULL REFERENCES public.inventory_return_disposition_tasks(id) ON DELETE CASCADE,
  repair_workshop TEXT,
  repair_fault TEXT,
  estimated_cost NUMERIC(16,2) NOT NULL DEFAULT 0,
  actual_cost NUMERIC(16,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','diagnosis','repairing','repaired','not_repairable','closed','cancelled')),
  sent_at TIMESTAMPTZ,
  repaired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, repair_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_return_rtv_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rtv_number TEXT NOT NULL,
  disposition_task_id UUID REFERENCES public.inventory_return_disposition_tasks(id) ON DELETE SET NULL,
  rma_id UUID REFERENCES public.inventory_rmas(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  claim_reason TEXT NOT NULL CHECK (claim_reason IN ('iqc_rejected','spec_mismatch','defective','excess_quantity','expired_on_arrival','wrong_item','supplier_fault','other')),
  requested_resolution TEXT NOT NULL DEFAULT 'credit_note' CHECK (requested_resolution IN ('replacement','credit_note','refund','repair')),
  credit_note_number TEXT,
  claim_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','accepted','rejected','credit_received','replacement_received','closed','cancelled')),
  submitted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, rtv_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_return_scrap_disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scrap_number TEXT NOT NULL,
  disposition_task_id UUID NOT NULL REFERENCES public.inventory_return_disposition_tasks(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  scrap_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  disposal_method TEXT NOT NULL DEFAULT 'scrap' CHECK (disposal_method IN ('scrap','recycle','hazardous_disposal','donation','vendor_disposal')),
  environmental_doc_url TEXT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  disposed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, scrap_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_production_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_return_number TEXT NOT NULL,
  work_order_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.inventory_warehouses(id) ON DELETE RESTRICT,
  return_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('work_order_cancelled','work_order_reduced','excess_issued','unused_material','line_quality_rejected','other')),
  quality_required BOOLEAN NOT NULL DEFAULT true,
  visual_inspection_required BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','quality_review','accepted','rejected','posted','closed','cancelled')),
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, production_return_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_production_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_return_id UUID NOT NULL REFERENCES public.inventory_production_returns(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.inventory_lpn(id) ON DELETE SET NULL,
  issued_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  consumed_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  return_qty NUMERIC(16,4) NOT NULL CHECK (return_qty > 0),
  uom TEXT NOT NULL DEFAULT 'PCS',
  quality_status TEXT NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','visual_pass','visual_fail','lab_required','approved','rejected','quarantine')),
  cost_rate NUMERIC(16,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_production_return_cost_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_return_id UUID NOT NULL REFERENCES public.inventory_production_returns(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(16,4) NOT NULL,
  amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  adjustment_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending_finance_posting' CHECK (status IN ('pending_finance_posting','posted','failed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_return_customer_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rma_id UUID NOT NULL REFERENCES public.inventory_rmas(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('rma_approved','rma_rejected','label_sent','received','graded','disposition_update','closed','refund_credit','manual')),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','whatsapp','portal','webhook')),
  recipient TEXT,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','cancelled')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_supplier_rtv_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_claims INT NOT NULL DEFAULT 0,
  total_quantity NUMERIC(16,4) NOT NULL DEFAULT 0,
  total_claim_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','acknowledged','settled','cancelled')),
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, report_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_supplier_rtv_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.inventory_supplier_rtv_reports(id) ON DELETE CASCADE,
  rtv_claim_id UUID NOT NULL REFERENCES public.inventory_return_rtv_claims(id) ON DELETE CASCADE,
  claim_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, report_id, rtv_claim_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_return_capa_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES public.inventory_return_condition_assessments(id) ON DELETE SET NULL,
  ncr_id UUID REFERENCES public.inventory_quality_ncr_cases(id) ON DELETE SET NULL,
  root_cause TEXT CHECK (root_cause IS NULL OR root_cause IN ('raw_material','supplier','production_process','iqc_gap','oqc_gap','packing','shipping','training','unknown')),
  corrective_action TEXT NOT NULL,
  preventive_action TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','verified','closed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inventory_rmas_status ON public.inventory_rmas(tenant_id,status,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_return_receipts_rma ON public.inventory_return_receipts(tenant_id,rma_id,received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_return_assessments_grade ON public.inventory_return_condition_assessments(tenant_id,condition_grade,assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_return_disposition_status ON public.inventory_return_disposition_tasks(tenant_id,status,disposition,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_rtv_supplier_status ON public.inventory_return_rtv_claims(tenant_id,supplier_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_production_returns_status ON public.inventory_production_returns(tenant_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION public.create_inventory_rma(
  p_return_type TEXT,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_supplier_id UUID,
  p_original_sales_order_id UUID,
  p_original_invoice_id UUID,
  p_original_shipment_id UUID,
  p_original_po_id UUID,
  p_reason_code TEXT,
  p_warranty_valid BOOLEAN,
  p_valid_days INT,
  p_packing_instructions TEXT,
  p_shipping_instructions TEXT,
  p_lines JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_num TEXT; v_line JSONB; v_total NUMERIC:=0; v_policy TEXT:='accepted'; v_status TEXT:='approved';
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','sales','customer_service','manager']::TEXT[]);
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'RMA_LINES_REQUIRED'; END IF;
  IF COALESCE(p_return_type,'customer_return') NOT IN ('customer_return','production_return','rtv','inter_warehouse_transfer') THEN RAISE EXCEPTION 'INVALID_RETURN_TYPE'; END IF;
  IF p_reason_code NOT IN ('defective','wrong_item','excess_quantity','customer_changed_mind','shipping_damage','cancelled_order','iqc_rejected','spec_mismatch','expired_on_arrival','our_ordering_error','production_excess','work_order_cancelled','unused_material','line_quality_rejected','transfer_return','other') THEN RAISE EXCEPTION 'INVALID_RETURN_REASON'; END IF;
  IF p_original_shipment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_shipments WHERE id=p_original_shipment_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'ORIGINAL_SHIPMENT_NOT_FOUND'; END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'SUPPLIER_NOT_FOUND'; END IF;
  IF COALESCE(p_warranty_valid,true)=false OR p_reason_code='customer_changed_mind' THEN v_policy:='manual_review'; v_status:='policy_review'; END IF;
  v_num := public.inventory_next_number('RMA');
  INSERT INTO public.inventory_rmas(tenant_id,rma_number,return_type,customer_id,customer_name,supplier_id,original_sales_order_id,original_invoice_id,original_shipment_id,original_po_id,status,reason_code,policy_result,warranty_valid,expires_at,packing_instructions,shipping_instructions,created_by)
  VALUES(v_tenant,v_num,COALESCE(p_return_type,'customer_return'),p_customer_id,p_customer_name,p_supplier_id,p_original_sales_order_id,p_original_invoice_id,p_original_shipment_id,p_original_po_id,v_status,p_reason_code,v_policy,p_warranty_valid,NOW()+(COALESCE(p_valid_days,30)||' days')::INTERVAL,p_packing_instructions,p_shipping_instructions,auth.uid()) RETURNING id INTO v_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id=(v_line->>'item_id')::UUID AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
    INSERT INTO public.inventory_rma_lines(tenant_id,rma_id,line_number,item_id,original_lot_id,original_serial_id,expected_qty,uom,unit_value,declared_reason,expected_condition)
    VALUES(v_tenant,v_id,COALESCE((v_line->>'line_number')::INT,1),(v_line->>'item_id')::UUID,NULLIF(v_line->>'lot_id','')::UUID,NULLIF(v_line->>'serial_id','')::UUID,COALESCE((v_line->>'expected_qty')::NUMERIC,0),COALESCE(v_line->>'uom','PCS'),COALESCE((v_line->>'unit_value')::NUMERIC,0),v_line->>'declared_reason',v_line->>'expected_condition');
    v_total := v_total + COALESCE((v_line->>'expected_qty')::NUMERIC,0) * COALESCE((v_line->>'unit_value')::NUMERIC,0);
  END LOOP;
  UPDATE public.inventory_rmas SET expected_total_value=v_total WHERE id=v_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_return_customer_notifications(tenant_id,rma_id,notification_type,channel,recipient,message,payload,status)
  VALUES(v_tenant,v_id,CASE WHEN v_status='approved' THEN 'rma_approved' ELSE 'manual' END,'portal',p_customer_name,'RMA created: '||v_num,jsonb_build_object('rma_number',v_num,'expires_at',(SELECT expires_at FROM public.inventory_rmas WHERE id=v_id)),'queued');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_rma(TEXT,UUID,TEXT,UUID,UUID,UUID,UUID,UUID,TEXT,BOOLEAN,INT,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_inventory_rma(p_rma_id UUID, p_decision TEXT, p_return_label_url TEXT DEFAULT NULL, p_instructions TEXT DEFAULT NULL, p_valid_days INT DEFAULT 30)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_rma RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','customer_service','manager']::TEXT[]);
  SELECT * INTO v_rma FROM public.inventory_rmas WHERE id=p_rma_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_RMA_DECISION'; END IF;
  UPDATE public.inventory_rmas SET status=p_decision, policy_result=CASE WHEN p_decision='approved' THEN 'accepted' ELSE 'rejected' END, approved_at=CASE WHEN p_decision='approved' THEN NOW() ELSE approved_at END, approved_by=auth.uid(), expires_at=CASE WHEN p_decision='approved' THEN NOW()+(COALESCE(p_valid_days,30)||' days')::INTERVAL ELSE expires_at END, return_label_url=COALESCE(p_return_label_url,return_label_url), shipping_instructions=COALESCE(p_instructions,shipping_instructions), updated_at=NOW() WHERE id=p_rma_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_return_customer_notifications(tenant_id,rma_id,notification_type,channel,recipient,message,payload)
  VALUES(v_tenant,p_rma_id,CASE WHEN p_decision='approved' THEN 'rma_approved' ELSE 'rma_rejected' END,'portal',v_rma.customer_name,'RMA '||p_decision,jsonb_build_object('return_label_url',p_return_label_url,'instructions',p_instructions));
END $$;
GRANT EXECUTE ON FUNCTION public.approve_inventory_rma(UUID,TEXT,TEXT,TEXT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.scan_inventory_return_barcode(p_receipt_id UUID, p_scanned_value TEXT, p_scan_type TEXT DEFAULT 'barcode')
RETURNS TABLE(scan_result TEXT, result_message TEXT, rma_id UUID, item_id UUID, lpn_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_receipt RECORD; v_rma UUID; v_item UUID; v_lpn UUID; v_result TEXT:='warning'; v_message TEXT:='scan recorded without direct match';
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_receipt FROM public.inventory_return_receipts WHERE id=p_receipt_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_RECEIPT_NOT_FOUND'; END IF;
  SELECT id INTO v_rma FROM public.inventory_rmas WHERE tenant_id=v_tenant AND rma_number=p_scanned_value LIMIT 1;
  SELECT id INTO v_item FROM public.inventory_items WHERE tenant_id=v_tenant AND (item_code=p_scanned_value OR id::TEXT=p_scanned_value) LIMIT 1;
  SELECT id INTO v_lpn FROM public.inventory_lpn WHERE tenant_id=v_tenant AND lpn_number=p_scanned_value LIMIT 1;
  IF v_rma IS NOT NULL OR v_item IS NOT NULL OR v_lpn IS NOT NULL THEN v_result:='accepted'; v_message:='return scan matched'; END IF;
  INSERT INTO public.inventory_return_scans(tenant_id,receipt_id,rma_id,scanned_value,scan_type,scan_result,result_message,scanned_by)
  VALUES(v_tenant,p_receipt_id,COALESCE(v_rma,v_receipt.rma_id),p_scanned_value,COALESCE(p_scan_type,'barcode'),v_result,v_message,auth.uid());
  RETURN QUERY SELECT v_result, v_message, COALESCE(v_rma,v_receipt.rma_id), v_item, v_lpn;
END $$;
GRANT EXECUTE ON FUNCTION public.scan_inventory_return_barcode(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_inventory_return(
  p_rma_id UUID,
  p_warehouse_id UUID,
  p_quarantine_location_id UUID,
  p_package_condition TEXT,
  p_carrier_name TEXT,
  p_tracking_number TEXT,
  p_lines JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_rma RECORD; v_id UUID; v_num TEXT; v_line JSONB; v_rma_line RECORD; v_received_lines INT:=0; v_expected_lines INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory']::TEXT[]);
  SELECT * INTO v_rma FROM public.inventory_rmas WHERE id=p_rma_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
  IF v_rma.status NOT IN ('approved','label_sent','in_transit','policy_review') THEN RAISE EXCEPTION 'RMA_NOT_RECEIVABLE'; END IF;
  IF v_rma.expires_at IS NOT NULL AND v_rma.expires_at < NOW() THEN UPDATE public.inventory_rmas SET status='expired' WHERE id=p_rma_id AND tenant_id=v_tenant; RAISE EXCEPTION 'RMA_EXPIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  IF p_quarantine_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=p_quarantine_location_id AND tenant_id=v_tenant AND warehouse_id=p_warehouse_id) THEN RAISE EXCEPTION 'QUARANTINE_LOCATION_NOT_FOUND'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'RETURN_RECEIPT_LINES_REQUIRED'; END IF;
  v_num := public.inventory_next_number('RRC');
  INSERT INTO public.inventory_return_receipts(tenant_id,receipt_number,rma_id,warehouse_id,quarantine_location_id,package_condition,external_damage,carrier_name,tracking_number,received_by,notes)
  VALUES(v_tenant,v_num,p_rma_id,p_warehouse_id,p_quarantine_location_id,p_package_condition,p_package_condition IN ('damaged','wet','opened'),p_carrier_name,p_tracking_number,auth.uid(),'Return received into quarantine/sorting') RETURNING id INTO v_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_rma_line FROM public.inventory_rma_lines WHERE id=NULLIF(v_line->>'rma_line_id','')::UUID AND tenant_id=v_tenant;
    IF NOT FOUND THEN
      SELECT * INTO v_rma_line FROM public.inventory_rma_lines WHERE rma_id=p_rma_id AND item_id=(v_line->>'item_id')::UUID AND tenant_id=v_tenant ORDER BY line_number LIMIT 1;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'RMA_LINE_NOT_FOUND_FOR_RECEIPT'; END IF;
    INSERT INTO public.inventory_return_receipt_lines(tenant_id,receipt_id,rma_line_id,item_id,warehouse_id,quarantine_location_id,lot_id,serial_id,lpn_id,declared_qty,received_qty,package_damage,scan_payload)
    VALUES(v_tenant,v_id,v_rma_line.id,v_rma_line.item_id,p_warehouse_id,p_quarantine_location_id,NULLIF(v_line->>'lot_id','')::UUID,NULLIF(v_line->>'serial_id','')::UUID,NULLIF(v_line->>'lpn_id','')::UUID,v_rma_line.expected_qty,COALESCE((v_line->>'received_qty')::NUMERIC,0),COALESCE((v_line->>'package_damage')::BOOLEAN,false),COALESCE(v_line->'scan_payload','{}'::JSONB));
    UPDATE public.inventory_rma_lines SET received_qty=received_qty+COALESCE((v_line->>'received_qty')::NUMERIC,0), status=CASE WHEN received_qty+COALESCE((v_line->>'received_qty')::NUMERIC,0) = expected_qty THEN 'received' WHEN received_qty+COALESCE((v_line->>'received_qty')::NUMERIC,0) > expected_qty THEN 'over_received' ELSE 'partially_received' END WHERE id=v_rma_line.id AND tenant_id=v_tenant;
  END LOOP;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('received','over_received')) INTO v_expected_lines, v_received_lines FROM public.inventory_rma_lines WHERE rma_id=p_rma_id AND tenant_id=v_tenant;
  UPDATE public.inventory_rmas SET status=CASE WHEN v_received_lines=v_expected_lines THEN 'received' ELSE 'partially_received' END, updated_at=NOW() WHERE id=p_rma_id AND tenant_id=v_tenant;
  INSERT INTO public.inventory_return_customer_notifications(tenant_id,rma_id,notification_type,channel,recipient,message,payload) VALUES(v_tenant,p_rma_id,'received','portal',v_rma.customer_name,'Return received at warehouse',jsonb_build_object('receipt_number',v_num));
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.receive_inventory_return(UUID,UUID,UUID,TEXT,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.grade_inventory_return_line(
  p_receipt_line_id UUID,
  p_condition_grade TEXT,
  p_defect_source TEXT,
  p_defect_type TEXT,
  p_defect_description TEXT,
  p_functional_test_result TEXT,
  p_packaging_status TEXT,
  p_estimated_original_value NUMERIC,
  p_estimated_recovered_value NUMERIC,
  p_photos JSONB DEFAULT '[]'::JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_line RECORD; v_rma UUID; v_assessment UUID; v_label TEXT; v_disp TEXT; v_task UUID; v_ncr UUID; v_defect BOOLEAN;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','quality','manager']::TEXT[]);
  SELECT rl.*, rr.rma_id INTO v_line FROM public.inventory_return_receipt_lines rl JOIN public.inventory_return_receipts rr ON rr.id=rl.receipt_id AND rr.tenant_id=rl.tenant_id WHERE rl.id=p_receipt_line_id AND rl.tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_RECEIPT_LINE_NOT_FOUND'; END IF;
  IF p_condition_grade NOT IN ('A','B','C','D') THEN RAISE EXCEPTION 'INVALID_CONDITION_GRADE'; END IF;
  v_rma := v_line.rma_id;
  v_label := CASE p_condition_grade WHEN 'A' THEN 'ممتازة كالجديد' WHEN 'B' THEN 'جيدة وتحتاج إعادة تعبئة' WHEN 'C' THEN 'قابلة للإصلاح' ELSE 'تالفة غير قابلة للإصلاح' END;
  v_disp := CASE p_condition_grade WHEN 'A' THEN 'restock' WHEN 'B' THEN 'repack_resell' WHEN 'C' THEN CASE WHEN p_defect_source='supplier' THEN 'return_to_vendor' ELSE 'repair_internal' END ELSE 'scrap_recycle' END;
  v_defect := COALESCE(p_defect_type,'') <> '' OR p_condition_grade IN ('C','D');
  INSERT INTO public.inventory_return_condition_assessments(tenant_id,receipt_line_id,rma_id,item_id,condition_grade,condition_label_ar,defect_found,defect_source,defect_type,defect_description,functional_test_result,packaging_status,estimated_original_value,estimated_recovered_value,recommended_disposition,photos,assessed_by)
  VALUES(v_tenant,p_receipt_line_id,v_rma,v_line.item_id,p_condition_grade,v_label,v_defect,p_defect_source,p_defect_type,p_defect_description,p_functional_test_result,p_packaging_status,COALESCE(p_estimated_original_value,0),COALESCE(p_estimated_recovered_value,0),v_disp,COALESCE(p_photos,'[]'::JSONB),auth.uid()) RETURNING id INTO v_assessment;
  INSERT INTO public.inventory_return_disposition_tasks(tenant_id,task_number,assessment_id,receipt_line_id,rma_id,item_id,disposition,target_warehouse_id,target_location_id,quantity,actual_recovered_value)
  VALUES(v_tenant,public.inventory_next_number('RTD'),v_assessment,p_receipt_line_id,v_rma,v_line.item_id,v_disp,v_line.warehouse_id,v_line.quarantine_location_id,v_line.received_qty,COALESCE(p_estimated_recovered_value,0)) RETURNING id INTO v_task;
  IF v_disp='repack_resell' THEN INSERT INTO public.inventory_return_repack_tasks(tenant_id,disposition_task_id,status) VALUES(v_tenant,v_task,'open'); END IF;
  IF v_disp='repair_internal' THEN INSERT INTO public.inventory_return_repair_orders(tenant_id,repair_number,disposition_task_id,repair_fault,status) VALUES(v_tenant,public.inventory_next_number('REP'),v_task,p_defect_description,'open'); END IF;
  IF v_defect THEN
    INSERT INTO public.inventory_quality_ncr_cases(tenant_id,ncr_number,item_id,defect_type,description,status,created_by)
    VALUES(v_tenant,public.inventory_next_number('NCR'),v_line.item_id,COALESCE(p_defect_type,'return_defect'),COALESCE(p_defect_description,'NCR created automatically from return grading'),'open',auth.uid()) RETURNING id INTO v_ncr;
    INSERT INTO public.inventory_return_capa_actions(tenant_id,assessment_id,ncr_id,root_cause,corrective_action,preventive_action)
    VALUES(v_tenant,v_assessment,v_ncr,CASE WHEN p_defect_source IN ('raw_material','supplier','production_process','packing','shipping','unknown') THEN p_defect_source ELSE 'unknown' END,'تحليل عيب المرتجع وإجراء تصحيحي','تغذية نظام الجودة لمنع تكرار السبب');
  END IF;
  UPDATE public.inventory_return_receipt_lines SET status='graded' WHERE id=p_receipt_line_id AND tenant_id=v_tenant;
  UPDATE public.inventory_rmas SET status='grading', updated_at=NOW() WHERE id=v_rma AND tenant_id=v_tenant;
  RETURN v_assessment;
END $$;
GRANT EXECUTE ON FUNCTION public.grade_inventory_return_line(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.route_inventory_return_disposition(p_assessment_id UUID, p_disposition TEXT, p_target_warehouse_id UUID DEFAULT NULL, p_target_location_id UUID DEFAULT NULL, p_refurbished_item_id UUID DEFAULT NULL, p_supplier_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','quality','manager']::TEXT[]);
  IF p_disposition NOT IN ('restock','repack_resell','repair_internal','return_to_vendor','scrap_recycle') THEN RAISE EXCEPTION 'INVALID_DISPOSITION'; END IF;
  UPDATE public.inventory_return_disposition_tasks SET disposition=p_disposition, target_warehouse_id=COALESCE(p_target_warehouse_id,target_warehouse_id), target_location_id=COALESCE(p_target_location_id,target_location_id), refurbished_item_id=p_refurbished_item_id, supplier_id=p_supplier_id, notes=COALESCE(p_notes,notes), status='assigned' WHERE assessment_id=p_assessment_id AND tenant_id=v_tenant RETURNING id INTO v_task;
  IF v_task IS NULL THEN RAISE EXCEPTION 'DISPOSITION_TASK_NOT_FOUND'; END IF;
  UPDATE public.inventory_return_condition_assessments SET recommended_disposition=p_disposition WHERE id=p_assessment_id AND tenant_id=v_tenant;
  RETURN v_task;
END $$;
GRANT EXECUTE ON FUNCTION public.route_inventory_return_disposition(UUID,TEXT,UUID,UUID,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_inventory_return_disposition(p_task_id UUID, p_actual_recovered_value NUMERIC DEFAULT NULL, p_environmental_doc_url TEXT DEFAULT NULL, p_credit_note_number TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_task RECORD; v_item UUID; v_n UUID; v_reason TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','quality','manager']::TEXT[]);
  SELECT * INTO v_task FROM public.inventory_return_disposition_tasks WHERE id=p_task_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPOSITION_TASK_NOT_FOUND'; END IF;
  IF v_task.status='completed' THEN RETURN; END IF;
  IF v_task.disposition IN ('restock','repack_resell','repair_internal') THEN
    IF v_task.target_warehouse_id IS NULL THEN RAISE EXCEPTION 'TARGET_WAREHOUSE_REQUIRED'; END IF;
    v_item := COALESCE(v_task.refurbished_item_id,v_task.item_id);
    PERFORM public.post_inventory_movement('return_in', v_item, v_task.target_warehouse_id, v_task.target_location_id, v_task.quantity, 'inventory_return_disposition_tasks', v_task.id, v_task.disposition);
  ELSIF v_task.disposition='return_to_vendor' THEN
    IF v_task.supplier_id IS NULL THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED_FOR_RTV'; END IF;
    INSERT INTO public.inventory_return_rtv_claims(tenant_id,rtv_number,disposition_task_id,rma_id,supplier_id,item_id,quantity,claim_reason,credit_note_number,claim_value,status,submitted_at)
    VALUES(v_tenant,public.inventory_next_number('RTV'),v_task.id,v_task.rma_id,v_task.supplier_id,v_task.item_id,v_task.quantity,'defective',p_credit_note_number,COALESCE(p_actual_recovered_value,v_task.actual_recovered_value,0),'submitted',NOW());
  ELSIF v_task.disposition='scrap_recycle' THEN
    INSERT INTO public.inventory_return_scrap_disposals(tenant_id,scrap_number,disposition_task_id,item_id,quantity,scrap_value,environmental_doc_url,approved_by,disposed_at)
    VALUES(v_tenant,public.inventory_next_number('SCR'),v_task.id,v_task.item_id,v_task.quantity,COALESCE(p_actual_recovered_value,0),p_environmental_doc_url,auth.uid(),NOW());
  END IF;
  UPDATE public.inventory_return_disposition_tasks SET status='completed', actual_recovered_value=COALESCE(p_actual_recovered_value,actual_recovered_value), completed_by=auth.uid(), completed_at=NOW() WHERE id=p_task_id AND tenant_id=v_tenant;
  UPDATE public.inventory_return_receipt_lines SET status='closed' WHERE id=v_task.receipt_line_id AND tenant_id=v_tenant;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_return_disposition_tasks WHERE rma_id=v_task.rma_id AND tenant_id=v_tenant AND status <> 'completed') THEN
    UPDATE public.inventory_rmas SET status='closed', closed_by=auth.uid(), closed_at=NOW(), updated_at=NOW() WHERE id=v_task.rma_id AND tenant_id=v_tenant;
  ELSE
    UPDATE public.inventory_rmas SET status='disposition', updated_at=NOW() WHERE id=v_task.rma_id AND tenant_id=v_tenant;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_inventory_return_disposition(UUID,NUMERIC,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_production_return(p_work_order_id UUID, p_warehouse_id UUID, p_return_location_id UUID, p_reason_code TEXT, p_quality_required BOOLEAN, p_lines JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_line JSONB;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','production','manager']::TEXT[]);
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'PRODUCTION_RETURN_LINES_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'WAREHOUSE_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_production_returns(tenant_id,production_return_number,work_order_id,warehouse_id,return_location_id,reason_code,quality_required,requested_by)
  VALUES(v_tenant,public.inventory_next_number('PRR'),p_work_order_id,p_warehouse_id,p_return_location_id,p_reason_code,COALESCE(p_quality_required,true),auth.uid()) RETURNING id INTO v_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.inventory_production_return_lines(tenant_id,production_return_id,item_id,lot_id,lpn_id,issued_qty,consumed_qty,return_qty,uom,cost_rate)
    VALUES(v_tenant,v_id,(v_line->>'item_id')::UUID,NULLIF(v_line->>'lot_id','')::UUID,NULLIF(v_line->>'lpn_id','')::UUID,COALESCE((v_line->>'issued_qty')::NUMERIC,0),COALESCE((v_line->>'consumed_qty')::NUMERIC,0),COALESCE((v_line->>'return_qty')::NUMERIC,0),COALESCE(v_line->>'uom','PCS'),COALESCE((v_line->>'cost_rate')::NUMERIC,0));
  END LOOP;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_inventory_production_return(UUID,UUID,UUID,TEXT,BOOLEAN,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_inventory_production_return(p_production_return_id UUID, p_quality_status TEXT, p_visual_inspection_notes TEXT DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_ret RECORD; v_line RECORD; v_count INT:=0; v_ncr UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','production','quality','manager']::TEXT[]);
  SELECT * INTO v_ret FROM public.inventory_production_returns WHERE id=p_production_return_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_RETURN_NOT_FOUND'; END IF;
  IF p_quality_status NOT IN ('visual_pass','visual_fail','approved','rejected','quarantine') THEN RAISE EXCEPTION 'INVALID_PRODUCTION_RETURN_QUALITY_STATUS'; END IF;
  FOR v_line IN SELECT * FROM public.inventory_production_return_lines WHERE production_return_id=p_production_return_id AND tenant_id=v_tenant LOOP
    UPDATE public.inventory_production_return_lines SET quality_status=p_quality_status WHERE id=v_line.id AND tenant_id=v_tenant;
    IF p_quality_status IN ('visual_pass','approved') THEN
      PERFORM public.post_inventory_movement('return_in', v_line.item_id, v_ret.warehouse_id, v_ret.return_location_id, v_line.return_qty, 'inventory_production_returns', v_ret.id, 'production_return');
      INSERT INTO public.inventory_production_return_cost_adjustments(tenant_id,production_return_id,work_order_id,item_id,quantity,amount,adjustment_payload,status)
      VALUES(v_tenant,v_ret.id,v_ret.work_order_id,v_line.item_id,v_line.return_qty,v_line.return_qty*v_line.cost_rate,jsonb_build_object('reason',v_ret.reason_code,'notes',p_visual_inspection_notes),'pending_finance_posting');
      v_count := v_count + 1;
    ELSE
      INSERT INTO public.inventory_quality_ncr_cases(tenant_id,ncr_number,item_id,defect_type,description,status,created_by)
      VALUES(v_tenant,public.inventory_next_number('NCR'),v_line.item_id,'production_return_rejected',COALESCE(p_visual_inspection_notes,'Production return failed quality inspection'),'open',auth.uid()) RETURNING id INTO v_ncr;
    END IF;
  END LOOP;
  UPDATE public.inventory_production_returns SET status=CASE WHEN p_quality_status IN ('visual_pass','approved') THEN 'posted' WHEN p_quality_status='quarantine' THEN 'quality_review' ELSE 'rejected' END, received_by=auth.uid(), received_at=NOW() WHERE id=p_production_return_id AND tenant_id=v_tenant;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.receive_inventory_production_return(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_inventory_return_notification(p_rma_id UUID, p_notification_type TEXT, p_channel TEXT, p_recipient TEXT, p_message TEXT, p_payload JSONB DEFAULT '{}'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','customer_service','manager']::TEXT[]);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_rmas WHERE id=p_rma_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
  INSERT INTO public.inventory_return_customer_notifications(tenant_id,rma_id,notification_type,channel,recipient,message,payload,status)
  VALUES(v_tenant,p_rma_id,p_notification_type,COALESCE(p_channel,'portal'),p_recipient,p_message,COALESCE(p_payload,'{}'::JSONB),'queued') RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.send_inventory_return_notification(UUID,TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_supplier_rtv_report(p_supplier_id UUID, p_period_start DATE, p_period_end DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_claim RECORD; v_qty NUMERIC:=0; v_val NUMERIC:=0; v_cnt INT:=0;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','procurement','manager']::TEXT[]);
  IF p_period_end < p_period_start THEN RAISE EXCEPTION 'INVALID_RTV_REPORT_PERIOD'; END IF;
  INSERT INTO public.inventory_supplier_rtv_reports(tenant_id,report_number,supplier_id,period_start,period_end,generated_by)
  VALUES(v_tenant,public.inventory_next_number('RTVR'),p_supplier_id,p_period_start,p_period_end,auth.uid()) RETURNING id INTO v_id;
  FOR v_claim IN SELECT * FROM public.inventory_return_rtv_claims WHERE tenant_id=v_tenant AND supplier_id=p_supplier_id AND created_at::DATE BETWEEN p_period_start AND p_period_end LOOP
    INSERT INTO public.inventory_supplier_rtv_report_lines(tenant_id,report_id,rtv_claim_id,claim_value) VALUES(v_tenant,v_id,v_claim.id,v_claim.claim_value) ON CONFLICT DO NOTHING;
    v_qty := v_qty + v_claim.quantity; v_val := v_val + v_claim.claim_value; v_cnt := v_cnt + 1;
  END LOOP;
  UPDATE public.inventory_supplier_rtv_reports SET total_claims=v_cnt,total_quantity=v_qty,total_claim_value=v_val WHERE id=v_id AND tenant_id=v_tenant;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_supplier_rtv_report(UUID,DATE,DATE) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_rmas','inventory_rma_lines','inventory_return_receipts','inventory_return_receipt_lines','inventory_return_scans','inventory_return_condition_assessments','inventory_return_disposition_tasks','inventory_return_repack_tasks','inventory_return_repair_orders','inventory_return_rtv_claims','inventory_return_scrap_disposals','inventory_production_returns','inventory_production_return_lines','inventory_production_return_cost_adjustments','inventory_return_customer_notifications','inventory_supplier_rtv_reports','inventory_supplier_rtv_report_lines','inventory_return_capa_actions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''procurement'',''quality'',''production'',''customer_service'',''manager'',''finance'',''admin'',''developer'',''it_admin''))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''quality'',''production'',''customer_service'',''manager'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''inventory'',''quality'',''production'',''customer_service'',''manager'',''admin'',''developer'',''it_admin''))', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.inventory_returns_dashboard WITH (security_invoker=true) AS
SELECT r.tenant_id,
  COUNT(*) AS total_rmas,
  COUNT(*) FILTER (WHERE r.status IN ('requested','policy_review','approved','label_sent','in_transit')) AS expected_returns,
  COUNT(*) FILTER (WHERE r.status IN ('received','partially_received','grading','disposition')) AS active_returns,
  COUNT(*) FILTER (WHERE r.status='closed') AS closed_returns,
  COALESCE(SUM(r.expected_total_value),0) AS total_expected_value
FROM public.inventory_rmas r
WHERE r.tenant_id=public.current_user_tenant_id()
GROUP BY r.tenant_id;
GRANT SELECT ON public.inventory_returns_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_returns_kpis WITH (security_invoker=true) AS
SELECT r.tenant_id,
  COUNT(DISTINCT r.id) AS return_cases,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status='closed') AS closed_cases,
  ROUND(COUNT(DISTINCT r.id)::NUMERIC / NULLIF((SELECT COUNT(*) FROM public.inventory_shipments s WHERE s.tenant_id=r.tenant_id AND s.status IN ('shipped','delivered')),0) * 100,2) AS return_rate_percent,
  ROUND(AVG(EXTRACT(EPOCH FROM (r.closed_at - rr.received_at))/86400) FILTER (WHERE r.closed_at IS NOT NULL AND rr.received_at IS NOT NULL),2) AS avg_processing_days,
  COALESCE(SUM(dt.actual_recovered_value),0) AS recovered_value,
  COALESCE(SUM(a.estimated_original_value),0) AS original_return_value,
  ROUND(COALESCE(SUM(dt.actual_recovered_value),0)/NULLIF(COALESCE(SUM(a.estimated_original_value),0),0)*100,2) AS value_recovery_percent,
  ROUND(COUNT(a.id) FILTER (WHERE a.grading_accuracy_verified)::NUMERIC/NULLIF(COUNT(a.id),0)*100,2) AS grading_accuracy_percent,
  ROUND(COALESCE(SUM(ro.actual_cost),0)/NULLIF(COUNT(DISTINCT r.id),0),2) AS cost_per_return
FROM public.inventory_rmas r
LEFT JOIN public.inventory_return_receipts rr ON rr.rma_id=r.id AND rr.tenant_id=r.tenant_id
LEFT JOIN public.inventory_return_condition_assessments a ON a.rma_id=r.id AND a.tenant_id=r.tenant_id
LEFT JOIN public.inventory_return_disposition_tasks dt ON dt.assessment_id=a.id AND dt.tenant_id=a.tenant_id
LEFT JOIN public.inventory_return_repair_orders ro ON ro.disposition_task_id=dt.id AND ro.tenant_id=dt.tenant_id
WHERE r.tenant_id=public.current_user_tenant_id()
GROUP BY r.tenant_id;
GRANT SELECT ON public.inventory_returns_kpis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_return_condition_distribution WITH (security_invoker=true) AS
SELECT tenant_id, date_trunc('month', assessed_at)::DATE AS month, condition_grade, recommended_disposition, COUNT(*) AS units, SUM(estimated_original_value) AS original_value, SUM(estimated_recovered_value) AS estimated_recovered_value
FROM public.inventory_return_condition_assessments
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id, date_trunc('month', assessed_at)::DATE, condition_grade, recommended_disposition;
GRANT SELECT ON public.inventory_return_condition_distribution TO authenticated;

CREATE OR REPLACE VIEW public.inventory_return_reason_analysis WITH (security_invoker=true) AS
SELECT tenant_id, reason_code, return_type, COUNT(*) AS case_count, SUM(expected_total_value) AS total_value, MIN(requested_at) AS first_seen, MAX(requested_at) AS last_seen
FROM public.inventory_rmas
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id, reason_code, return_type;
GRANT SELECT ON public.inventory_return_reason_analysis TO authenticated;

CREATE OR REPLACE VIEW public.inventory_return_value_recovery WITH (security_invoker=true) AS
SELECT a.tenant_id, a.recommended_disposition, COUNT(*) AS units, SUM(a.estimated_original_value) AS original_value, SUM(COALESCE(dt.actual_recovered_value,a.estimated_recovered_value)) AS recovered_value,
  ROUND(SUM(COALESCE(dt.actual_recovered_value,a.estimated_recovered_value))/NULLIF(SUM(a.estimated_original_value),0)*100,2) AS recovery_percent
FROM public.inventory_return_condition_assessments a LEFT JOIN public.inventory_return_disposition_tasks dt ON dt.assessment_id=a.id AND dt.tenant_id=a.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id()
GROUP BY a.tenant_id,a.recommended_disposition;
GRANT SELECT ON public.inventory_return_value_recovery TO authenticated;

CREATE OR REPLACE VIEW public.inventory_supplier_rtv_report_summary WITH (security_invoker=true) AS
SELECT c.tenant_id,c.supplier_id,COUNT(*) AS claim_count,SUM(c.quantity) AS total_quantity,SUM(c.claim_value) AS total_claim_value,COUNT(*) FILTER (WHERE c.status IN ('open','submitted')) AS open_claims,COUNT(*) FILTER (WHERE c.status IN ('credit_received','replacement_received','closed')) AS resolved_claims
FROM public.inventory_return_rtv_claims c
WHERE c.tenant_id=public.current_user_tenant_id()
GROUP BY c.tenant_id,c.supplier_id;
GRANT SELECT ON public.inventory_supplier_rtv_report_summary TO authenticated;

CREATE OR REPLACE VIEW public.inventory_production_returns_dashboard WITH (security_invoker=true) AS
SELECT pr.tenant_id, pr.status, COUNT(*) AS return_count, SUM(l.return_qty) AS total_return_qty, SUM(l.return_qty*l.cost_rate) AS cost_to_reverse
FROM public.inventory_production_returns pr LEFT JOIN public.inventory_production_return_lines l ON l.production_return_id=pr.id AND l.tenant_id=pr.tenant_id
WHERE pr.tenant_id=public.current_user_tenant_id()
GROUP BY pr.tenant_id,pr.status;
GRANT SELECT ON public.inventory_production_returns_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.inventory_return_quality_defects_report WITH (security_invoker=true) AS
SELECT a.tenant_id,a.defect_source,a.defect_type,COUNT(*) AS defect_count,COUNT(c.id) AS capa_count,COUNT(c.id) FILTER (WHERE c.status='closed') AS closed_capa_count
FROM public.inventory_return_condition_assessments a LEFT JOIN public.inventory_return_capa_actions c ON c.assessment_id=a.id AND c.tenant_id=a.tenant_id
WHERE a.tenant_id=public.current_user_tenant_id() AND a.defect_found
GROUP BY a.tenant_id,a.defect_source,a.defect_type;
GRANT SELECT ON public.inventory_return_quality_defects_report TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_rmas') IS NULL
     OR to_regclass('public.inventory_return_condition_assessments') IS NULL
     OR to_regclass('public.inventory_return_disposition_tasks') IS NULL
     OR to_regclass('public.inventory_production_returns') IS NULL
     OR to_regclass('public.inventory_return_rtv_claims') IS NULL
     OR to_regclass('public.inventory_returns_kpis') IS NULL
     OR to_regprocedure('public.create_inventory_rma(text,uuid,text,uuid,uuid,uuid,uuid,uuid,text,boolean,integer,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.receive_inventory_return(uuid,uuid,uuid,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.grade_inventory_return_line(uuid,text,text,text,text,text,text,numeric,numeric,jsonb)') IS NULL THEN
    RAISE EXCEPTION '0210 failed: returns/reverse logistics objects missing';
  END IF;
  RAISE NOTICE '✅ 0210: Inventory returns management and reverse logistics applied';
END $$;
