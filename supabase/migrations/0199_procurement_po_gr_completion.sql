-- ============================================================================
-- 0199 — Procurement PO/GR Completion (Unit 04)
-- التوثيق: docs/e-procurement/04-purchase-orders-goods-receipt.md
-- يغطي: manual PO, send/ack/tracking, IQC, inventory transactions, RTV inventory, OTIF alerts, audit.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.po_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  old_value JSONB,
  new_value JSONB,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_audit_po ON public.po_audit_log(po_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  item_code TEXT,
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'PCS',
  lot_number TEXT,
  expiry_date DATE,
  location TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in','out','hold')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_tenant_item ON public.inventory_transactions(tenant_id, item_code, created_at DESC);

CREATE TABLE IF NOT EXISTS public.iqc_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gr_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','partial')),
  inspector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_notes TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, gr_id)
);
CREATE INDEX IF NOT EXISTS idx_iqc_tenant_status ON public.iqc_inspections(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.po_otif_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('late_delivery','partial_overdue','open_balance','rtv_rate')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_otif_alerts_tenant ON public.po_otif_alerts(tenant_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['po_audit_log','inventory_transactions','iqc_inspections','po_otif_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''manager'',''developer'',''it_admin''));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin''));', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_po_audit(p_po_id UUID,p_action TEXT,p_old_status TEXT DEFAULT NULL,p_new_status TEXT DEFAULT NULL,p_old_value JSONB DEFAULT NULL,p_new_value JSONB DEFAULT NULL,p_comments TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_po_id IS NOT NULL THEN PERFORM public.procurement_assert_po_in_tenant(p_po_id); END IF;
  INSERT INTO public.po_audit_log(tenant_id,po_id,actor_id,action,old_status,new_status,old_value,new_value,comments)
  VALUES(v_tenant,p_po_id,auth.uid(),p_action,p_old_status,p_new_status,p_old_value,p_new_value,p_comments) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_po_audit(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_purchase_order_manual(
  p_supplier_id UUID,
  p_po_type TEXT,
  p_currency_code TEXT,
  p_delivery_date DATE,
  p_delivery_location TEXT,
  p_incoterms TEXT,
  p_payment_terms TEXT,
  p_lines JSONB
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_po_id UUID; v_po_number TEXT; v_total NUMERIC:=0; v_line JSONB;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id,true);
  IF p_po_type NOT IN ('standard','blanket','consolidated','open','emergency') THEN RAISE EXCEPTION 'INVALID_PO_TYPE'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'EMPTY_PO_LINES'; END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total := v_total + COALESCE((v_line->>'quantity')::NUMERIC,0) * COALESCE((v_line->>'unit_price')::NUMERIC,0);
  END LOOP;
  v_po_number := 'PO-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');
  INSERT INTO public.purchase_orders(tenant_id,po_number,supplier_id,po_type,status,total_before_tax,currency_code,delivery_date,delivery_location,incoterms,payment_terms,created_by)
  VALUES(v_tenant,v_po_number,p_supplier_id,p_po_type,'approved',v_total,COALESCE(p_currency_code,'SAR'),p_delivery_date,p_delivery_location,COALESCE(p_incoterms,'DDP'),COALESCE(p_payment_terms,'Net45'),auth.uid()) RETURNING id INTO v_po_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.po_line_items(tenant_id,po_id,item_code,description,quantity,unit,unit_price,specification)
    VALUES(v_tenant,v_po_id,v_line->>'item_code',v_line->>'description',(v_line->>'quantity')::NUMERIC,COALESCE(v_line->>'unit','PCS'),(v_line->>'unit_price')::NUMERIC,COALESCE(v_line->'specification','{}'::jsonb));
  END LOOP;
  PERFORM public.log_po_audit(v_po_id,'po_manual_created',NULL,'approved',NULL,jsonb_build_object('total',v_total),NULL);
  RETURN v_po_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_manual(UUID,TEXT,TEXT,DATE,TEXT,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_po_sent(p_po_id UUID,p_tracking_number TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_old FROM public.purchase_orders WHERE id=p_po_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_NOT_FOUND'; END IF;
  UPDATE public.purchase_orders SET status='sent', tracking_number=COALESCE(p_tracking_number,tracking_number), updated_at=NOW() WHERE id=p_po_id AND tenant_id=v_tenant;
  PERFORM public.log_po_audit(p_po_id,'po_sent',v_old.status,'sent',to_jsonb(v_old),jsonb_build_object('tracking_number',p_tracking_number),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.mark_po_sent(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_po(p_po_id UUID,p_tracking_number TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_old FROM public.purchase_orders WHERE id=p_po_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_NOT_FOUND'; END IF;
  UPDATE public.purchase_orders SET status='acknowledged', tracking_number=COALESCE(p_tracking_number,tracking_number), updated_at=NOW() WHERE id=p_po_id AND tenant_id=v_tenant;
  PERFORM public.log_po_audit(p_po_id,'po_acknowledged',v_old.status,'acknowledged',to_jsonb(v_old),jsonb_build_object('tracking_number',p_tracking_number),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.acknowledge_po(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_po_tracking(p_po_id UUID,p_status TEXT,p_tracking_number TEXT DEFAULT NULL,p_delivery_date DATE DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF p_status NOT IN ('approved','sent','acknowledged','shipped','partially_received','received','closed','cancelled') THEN RAISE EXCEPTION 'INVALID_PO_STATUS'; END IF;
  SELECT * INTO v_old FROM public.purchase_orders WHERE id=p_po_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_NOT_FOUND'; END IF;
  UPDATE public.purchase_orders SET status=p_status, tracking_number=COALESCE(p_tracking_number,tracking_number), delivery_date=COALESCE(p_delivery_date,delivery_date), updated_at=NOW() WHERE id=p_po_id AND tenant_id=v_tenant;
  PERFORM public.log_po_audit(p_po_id,'po_tracking_updated',v_old.status,p_status,to_jsonb(v_old),jsonb_build_object('tracking_number',p_tracking_number,'delivery_date',p_delivery_date),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.update_po_tracking(UUID,TEXT,TEXT,DATE) TO authenticated;

-- Override receive_goods: creates IQC inspection and audit
CREATE OR REPLACE FUNCTION public.receive_goods(p_po_id UUID,p_delivery_note_number TEXT,p_total_packages INT,p_has_damage BOOLEAN,p_damage_notes TEXT,p_items JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_user UUID:=auth.uid(); v_gr_id UUID; v_gr_number TEXT; v_po RECORD; v_item JSONB; v_po_line RECORD; v_ordered NUMERIC;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF p_items IS NULL OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'EMPTY_ITEMS'; END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id=p_po_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_NOT_FOUND'; END IF;
  IF v_po.status NOT IN ('approved','sent','acknowledged','shipped','partially_received') THEN RAISE EXCEPTION 'PO_NOT_RECEIVABLE'; END IF;
  v_gr_number := 'GR-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');
  INSERT INTO public.goods_receipts(tenant_id,gr_number,po_id,received_by,delivery_note_number,total_packages,has_damage,damage_notes,status)
  VALUES(v_tenant,v_gr_number,p_po_id,v_user,p_delivery_note_number,p_total_packages,COALESCE(p_has_damage,false),p_damage_notes,'quality_hold') RETURNING id INTO v_gr_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_po_line FROM public.po_line_items WHERE id=(v_item->>'po_line_item_id')::UUID AND tenant_id=v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO_LINE_NOT_FOUND'; END IF;
    IF v_po_line.po_id IS DISTINCT FROM p_po_id THEN RAISE EXCEPTION 'PO_LINE_DOES_NOT_BELONG_TO_PO'; END IF;
    v_ordered := v_po_line.quantity - v_po_line.received_quantity;
    INSERT INTO public.gr_line_items(tenant_id,gr_id,po_line_item_id,ordered_qty,received_qty,accepted_qty,lot_number,expiry_date,location,notes)
    VALUES(v_tenant,v_gr_id,v_po_line.id,v_ordered,(v_item->>'received_qty')::NUMERIC,COALESCE((v_item->>'accepted_qty')::NUMERIC,(v_item->>'received_qty')::NUMERIC),v_item->>'lot_number',NULLIF(v_item->>'expiry_date','')::DATE,v_item->>'location',v_item->>'notes');
    UPDATE public.po_line_items SET received_quantity=received_quantity+(v_item->>'received_qty')::NUMERIC WHERE id=v_po_line.id AND tenant_id=v_tenant;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.po_line_items WHERE po_id=p_po_id AND tenant_id=v_tenant AND pending_quantity>0) THEN
    UPDATE public.purchase_orders SET status='partially_received', updated_at=NOW() WHERE id=p_po_id AND tenant_id=v_tenant;
  ELSE
    UPDATE public.purchase_orders SET status='received', updated_at=NOW() WHERE id=p_po_id AND tenant_id=v_tenant;
  END IF;
  INSERT INTO public.iqc_inspections(tenant_id,gr_id,po_id,status) VALUES(v_tenant,v_gr_id,p_po_id,'pending') ON CONFLICT DO NOTHING;
  PERFORM public.log_po_audit(p_po_id,'goods_received',v_po.status,(SELECT status FROM public.purchase_orders WHERE id=p_po_id),to_jsonb(v_po),jsonb_build_object('gr_id',v_gr_id,'damage',p_has_damage),NULL);
  RETURN v_gr_id;
END $$;
GRANT EXECUTE ON FUNCTION public.receive_goods(UUID,TEXT,INT,BOOLEAN,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_iqc_inspection(p_gr_id UUID,p_status TEXT,p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_iqc RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF p_status NOT IN ('approved','rejected','partial') THEN RAISE EXCEPTION 'INVALID_IQC_STATUS'; END IF;
  SELECT * INTO v_iqc FROM public.iqc_inspections WHERE gr_id=p_gr_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IQC_NOT_FOUND'; END IF;
  UPDATE public.iqc_inspections SET status=p_status, inspector_id=auth.uid(), decision_notes=p_notes, decided_at=NOW() WHERE id=v_iqc.id;
  PERFORM public.log_po_audit(v_iqc.po_id,'iqc_'||p_status,NULL,NULL,to_jsonb(v_iqc),jsonb_build_object('notes',p_notes),p_notes);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_iqc_inspection(UUID,TEXT,TEXT) TO authenticated;

-- Override post_goods_receipt: inventory in, requires non-rejected IQC
CREATE OR REPLACE FUNCTION public.post_goods_receipt(p_gr_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_gr RECORD; v_iqc RECORD; v_line RECORD; v_po_line RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_gr FROM public.goods_receipts WHERE id=p_gr_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GR_NOT_FOUND'; END IF;
  IF v_gr.status!='quality_hold' THEN RAISE EXCEPTION 'GR_MUST_BE_QUALITY_HOLD'; END IF;
  SELECT * INTO v_iqc FROM public.iqc_inspections WHERE gr_id=p_gr_id AND tenant_id=v_tenant;
  IF FOUND AND v_iqc.status='rejected' THEN RAISE EXCEPTION 'IQC_REJECTED_CANNOT_POST'; END IF;
  FOR v_line IN SELECT * FROM public.gr_line_items WHERE gr_id=p_gr_id AND tenant_id=v_tenant LOOP
    SELECT * INTO v_po_line FROM public.po_line_items WHERE id=v_line.po_line_item_id AND tenant_id=v_tenant;
    INSERT INTO public.inventory_transactions(tenant_id,source_table,source_id,item_code,description,quantity,unit,lot_number,expiry_date,location,direction)
    VALUES(v_tenant,'goods_receipts',p_gr_id,v_po_line.item_code,v_po_line.description,v_line.accepted_qty,v_po_line.unit,v_line.lot_number,v_line.expiry_date,v_line.location,'in');
  END LOOP;
  UPDATE public.goods_receipts SET status='posted', updated_at=NOW() WHERE id=p_gr_id AND tenant_id=v_tenant;
  PERFORM public.log_po_audit(v_gr.po_id,'gr_posted',v_gr.status,'posted',to_jsonb(v_gr),jsonb_build_object('gr_id',p_gr_id),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.post_goods_receipt(UUID) TO authenticated;

-- Override create_rtv: inventory out and audit
CREATE OR REPLACE FUNCTION public.create_rtv(p_gr_id UUID,p_po_id UUID,p_quantity NUMERIC,p_reason TEXT,p_details TEXT,p_lot_number TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_user UUID:=auth.uid(); v_rtv_id UUID; v_rtv_number TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF p_reason NOT IN ('quality_rejected','over_delivery','damaged','wrong_item','expired','other') THEN RAISE EXCEPTION 'INVALID_RTV_REASON'; END IF;
  PERFORM public.procurement_assert_po_in_tenant(p_po_id);
  PERFORM public.procurement_assert_gr_in_tenant(p_gr_id,p_po_id);
  v_rtv_number := 'RTV-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');
  INSERT INTO public.return_to_vendor(tenant_id,gr_id,po_id,rtv_number,quantity,reason,details,lot_number,credit_note_required,created_by)
  VALUES(v_tenant,p_gr_id,p_po_id,v_rtv_number,p_quantity,p_reason,p_details,p_lot_number,true,v_user) RETURNING id INTO v_rtv_id;
  INSERT INTO public.inventory_transactions(tenant_id,source_table,source_id,item_code,description,quantity,unit,lot_number,direction)
  SELECT v_tenant,'return_to_vendor',v_rtv_id,pl.item_code,pl.description,p_quantity,pl.unit,p_lot_number,'out'
  FROM public.gr_line_items gl JOIN public.po_line_items pl ON pl.id=gl.po_line_item_id
  WHERE gl.gr_id=p_gr_id AND gl.tenant_id=v_tenant LIMIT 1;
  PERFORM public.log_po_audit(p_po_id,'rtv_created',NULL,NULL,NULL,jsonb_build_object('rtv_id',v_rtv_id,'reason',p_reason,'quantity',p_quantity),p_details);
  RETURN v_rtv_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_rtv(UUID,UUID,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.detect_late_po_alerts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_po RECORD; v_count INT:=0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  FOR v_po IN SELECT * FROM public.purchase_orders WHERE tenant_id=v_tenant AND status IN ('sent','acknowledged','shipped','partially_received') AND delivery_date < CURRENT_DATE LOOP
    INSERT INTO public.po_otif_alerts(tenant_id,po_id,alert_type,severity,message)
    VALUES(v_tenant,v_po.id,'late_delivery','warning','تأخر تسليم أمر الشراء '||v_po.po_number)
    ON CONFLICT DO NOTHING;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.detect_late_po_alerts() TO authenticated;

CREATE OR REPLACE VIEW public.po_gr_kpis
WITH (security_invoker = true) AS
SELECT
  po.tenant_id,
  COUNT(*) AS total_pos,
  COUNT(*) FILTER (WHERE po.status IN ('received','closed')) AS completed_pos,
  ROUND(COUNT(*) FILTER (WHERE po.status IN ('received','closed'))::NUMERIC/NULLIF(COUNT(*),0)*100,2) AS completion_rate,
  SUM(po.total_amount) FILTER (WHERE po.status NOT IN ('received','closed','cancelled')) AS open_po_value,
  COUNT(DISTINCT gr.id) AS total_grs,
  COUNT(DISTINCT gr.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.gr_line_items gl WHERE gl.gr_id=gr.id AND gl.rejected_qty>0)) AS first_pass_grs,
  ROUND(COUNT(DISTINCT gr.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.gr_line_items gl WHERE gl.gr_id=gr.id AND gl.rejected_qty>0))::NUMERIC/NULLIF(COUNT(DISTINCT gr.id),0)*100,2) AS first_pass_receipt_rate,
  COUNT(DISTINCT rtv.id) AS total_rtvs
FROM public.purchase_orders po
LEFT JOIN public.goods_receipts gr ON gr.po_id=po.id AND gr.tenant_id=po.tenant_id
LEFT JOIN public.return_to_vendor rtv ON rtv.po_id=po.id AND rtv.tenant_id=po.tenant_id
WHERE po.tenant_id=public.current_user_tenant_id()
GROUP BY po.tenant_id;
GRANT SELECT ON public.po_gr_kpis TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.inventory_transactions') IS NULL THEN RAISE EXCEPTION '0199 failed: inventory tx missing'; END IF;
  IF to_regclass('public.iqc_inspections') IS NULL THEN RAISE EXCEPTION '0199 failed: iqc missing'; END IF;
  IF to_regprocedure('public.create_purchase_order_manual(uuid,text,text,date,text,text,text,jsonb)') IS NULL THEN RAISE EXCEPTION '0199 failed: manual PO missing'; END IF;
  RAISE NOTICE '✅ 0199: PO/GR unit completion applied';
END $$;
