-- ============================================================================
-- 0200 — Procurement Invoices + 3-Way Matching Completion (Unit 05)
-- التوثيق: docs/e-procurement/05-invoice-processing-3way-matching.md
-- يغطي: إنشاء فاتورة ببنود، كشف تكرار، exception workflow، اعتماد/دفع، خصومات مبكرة، أرشيف/تحليلات.
-- ============================================================================

ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS currency_code CHAR(3) DEFAULT 'SAR' REFERENCES public.currencies(code);
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS exception_owner_role TEXT;
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS exception_notes TEXT;

CREATE TABLE IF NOT EXISTS public.invoice_exception_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  matching_result_id UUID REFERENCES public.procurement_matching_results(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('assign','approve_tolerance','request_credit_note','request_revised_invoice','dispute','resolve','cancel')),
  owner_role TEXT CHECK (owner_role IN ('ap_clerk','procurement','finance','admin')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_exception_actions_inv ON public.invoice_exception_actions(invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  old_value JSONB,
  new_value JSONB,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_inv ON public.invoice_audit_log(invoice_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoice_exception_actions','invoice_audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin''));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin''));', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_invoice_audit(p_invoice_id UUID,p_action TEXT,p_old_status TEXT DEFAULT NULL,p_new_status TEXT DEFAULT NULL,p_old_value JSONB DEFAULT NULL,p_new_value JSONB DEFAULT NULL,p_comments TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_invoice_id IS NOT NULL THEN PERFORM public.procurement_assert_invoice_in_tenant(p_invoice_id); END IF;
  INSERT INTO public.invoice_audit_log(tenant_id,invoice_id,actor_id,action,old_status,new_status,old_value,new_value,comments)
  VALUES(v_tenant,p_invoice_id,auth.uid(),p_action,p_old_status,p_new_status,p_old_value,p_new_value,p_comments) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_invoice_audit(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_supplier_invoice_full(
  p_supplier_id UUID,
  p_po_id UUID,
  p_invoice_number TEXT,
  p_invoice_date DATE,
  p_amount_before_tax NUMERIC,
  p_tax_rate NUMERIC,
  p_currency_code TEXT,
  p_payment_due_date DATE,
  p_payment_terms TEXT,
  p_bank_account TEXT,
  p_source TEXT,
  p_lines JSONB
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_invoice_id UUID;
  v_line JSONB;
  v_dup RECORD;
  v_total NUMERIC;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id,false);
  IF p_po_id IS NOT NULL THEN PERFORM public.procurement_assert_po_in_tenant(p_po_id); END IF;
  IF p_invoice_number IS NULL OR length(trim(p_invoice_number))<2 THEN RAISE EXCEPTION 'INVOICE_NUMBER_REQUIRED'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'EMPTY_INVOICE_LINES'; END IF;
  v_total := COALESCE(p_amount_before_tax,0) * (1 + COALESCE(p_tax_rate,15)/100);

  INSERT INTO public.supplier_invoices(tenant_id,invoice_number,supplier_id,po_id,invoice_date,amount_before_tax,tax_rate,currency_code,payment_due_date,payment_terms,bank_account,source,created_by)
  VALUES(v_tenant,trim(p_invoice_number),p_supplier_id,p_po_id,p_invoice_date,COALESCE(p_amount_before_tax,0),COALESCE(p_tax_rate,15),COALESCE(p_currency_code,'SAR'),p_payment_due_date,COALESCE(p_payment_terms,'Net45'),p_bank_account,COALESCE(p_source,'manual'),auth.uid())
  RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'po_line_item_id') IS NOT NULL AND (v_line->>'po_line_item_id') <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM public.po_line_items WHERE id=(v_line->>'po_line_item_id')::UUID AND tenant_id=v_tenant AND (p_po_id IS NULL OR po_id=p_po_id)) THEN
        RAISE EXCEPTION 'INVOICE_LINE_PO_LINE_NOT_IN_TENANT_OR_PO';
      END IF;
    END IF;
    INSERT INTO public.invoice_line_items(tenant_id,invoice_id,po_line_item_id,gr_line_item_id,item_code,description,quantity,unit_price,tax_rate)
    VALUES(v_tenant,v_invoice_id,NULLIF(v_line->>'po_line_item_id','')::UUID,NULLIF(v_line->>'gr_line_item_id','')::UUID,v_line->>'item_code',COALESCE(v_line->>'description','بند فاتورة'),COALESCE((v_line->>'quantity')::NUMERIC,1),COALESCE((v_line->>'unit_price')::NUMERIC,0),COALESCE((v_line->>'tax_rate')::NUMERIC,COALESCE(p_tax_rate,15)));
  END LOOP;

  FOR v_dup IN SELECT * FROM public.detect_duplicate_invoice(p_supplier_id, trim(p_invoice_number), v_total, p_invoice_date) LOOP
    INSERT INTO public.procurement_duplicate_checks(tenant_id,invoice_id,duplicate_invoice_id,similarity_score,reason,status)
    VALUES(v_tenant,v_invoice_id,v_dup.duplicate_id,v_dup.similarity,v_dup.reason,'suspected');
    UPDATE public.supplier_invoices SET duplicate_status='suspected_duplicate' WHERE id=v_invoice_id;
  END LOOP;

  INSERT INTO public.procurement_payment_schedules(tenant_id,invoice_id,due_date,amount,discount_percent,discount_days,status)
  VALUES(v_tenant,v_invoice_id,COALESCE(p_payment_due_date,p_invoice_date+INTERVAL '45 days'),v_total,
         CASE WHEN COALESCE(p_payment_terms,'') LIKE '2/10%' THEN 2 WHEN COALESCE(p_payment_terms,'') LIKE '1/10%' THEN 1 ELSE 0 END,
         CASE WHEN COALESCE(p_payment_terms,'') LIKE '%/10%' THEN 10 ELSE 0 END,
         'pending');

  PERFORM public.log_invoice_audit(v_invoice_id,'invoice_created',NULL,'pending_match',NULL,jsonb_build_object('invoice_number',p_invoice_number,'total',v_total),NULL);
  RETURN v_invoice_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_INVOICE_NUMBER_FOR_SUPPLIER';
END $$;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_full(UUID,UUID,TEXT,DATE,NUMERIC,NUMERIC,TEXT,DATE,TEXT,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_invoice_exception(p_invoice_id UUID,p_action TEXT,p_notes TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_inv RECORD; v_new_status TEXT; v_owner TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  SELECT * INTO v_inv FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  IF p_action NOT IN ('approve_tolerance','request_credit_note','request_revised_invoice','dispute','resolve','cancel') THEN RAISE EXCEPTION 'INVALID_EXCEPTION_ACTION'; END IF;
  v_new_status := CASE p_action WHEN 'approve_tolerance' THEN 'approved' WHEN 'resolve' THEN 'approved' WHEN 'cancel' THEN 'cancelled' ELSE 'disputed' END;
  v_owner := CASE p_action WHEN 'approve_tolerance' THEN 'ap_clerk' WHEN 'request_credit_note' THEN 'procurement' WHEN 'request_revised_invoice' THEN 'procurement' WHEN 'dispute' THEN 'finance' ELSE 'admin' END;
  INSERT INTO public.invoice_exception_actions(tenant_id,invoice_id,action_type,owner_role,notes,created_by)
  VALUES(v_tenant,p_invoice_id,p_action,v_owner,p_notes,auth.uid());
  UPDATE public.supplier_invoices SET status=v_new_status, exception_owner_role=v_owner, exception_notes=p_notes, approved_by=CASE WHEN v_new_status='approved' THEN auth.uid() ELSE approved_by END, approved_at=CASE WHEN v_new_status='approved' THEN NOW() ELSE approved_at END, updated_at=NOW() WHERE id=p_invoice_id;
  PERFORM public.log_invoice_audit(p_invoice_id,'exception_'||p_action,v_inv.status,v_new_status,to_jsonb(v_inv),jsonb_build_object('owner_role',v_owner,'notes',p_notes),p_notes);
  RETURN v_new_status;
END $$;
GRANT EXECUTE ON FUNCTION public.resolve_invoice_exception(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_invoice_for_payment(p_invoice_id UUID,p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_inv RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['finance','admin']::TEXT[]);
  SELECT * INTO v_inv FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  IF v_inv.duplicate_status <> 'clean' THEN RAISE EXCEPTION 'DUPLICATE_INVOICE_REVIEW_REQUIRED'; END IF;
  IF v_inv.status NOT IN ('matched','tolerance','approved') THEN RAISE EXCEPTION 'INVOICE_NOT_READY_FOR_PAYMENT'; END IF;
  UPDATE public.supplier_invoices SET status='approved', approved_by=auth.uid(), approved_at=NOW(), updated_at=NOW() WHERE id=p_invoice_id;
  PERFORM public.log_invoice_audit(p_invoice_id,'approved_for_payment',v_inv.status,'approved',to_jsonb(v_inv),NULL,p_notes);
END $$;
GRANT EXECUTE ON FUNCTION public.approve_invoice_for_payment(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id UUID,p_payment_reference TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_inv RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['finance','admin']::TEXT[]);
  SELECT * INTO v_inv FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  IF v_inv.status <> 'approved' THEN RAISE EXCEPTION 'INVOICE_MUST_BE_APPROVED'; END IF;
  UPDATE public.supplier_invoices SET status='paid', paid_at=NOW(), payment_reference=p_payment_reference, updated_at=NOW() WHERE id=p_invoice_id;
  UPDATE public.procurement_payment_schedules SET status='paid', paid_at=NOW() WHERE invoice_id=p_invoice_id AND tenant_id=v_tenant AND status='pending';
  PERFORM public.log_invoice_audit(p_invoice_id,'invoice_paid','approved','paid',to_jsonb(v_inv),jsonb_build_object('payment_reference',p_payment_reference),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.invoice_dynamic_discount_options(p_invoice_id UUID)
RETURNS TABLE(option_label TEXT,pay_date DATE,discount_percent NUMERIC,pay_amount NUMERIC,saving NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_inv RECORD; v_days INT;
BEGIN
  SELECT * INTO v_inv FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  v_days := GREATEST(1, COALESCE(v_inv.payment_due_date,CURRENT_DATE+45)-CURRENT_DATE);
  RETURN QUERY SELECT 'الدفع اليوم'::TEXT, CURRENT_DATE, 1.5::NUMERIC, ROUND(v_inv.total_amount*0.985,2), ROUND(v_inv.total_amount*0.015,2);
  RETURN QUERY SELECT 'الدفع بعد 20 يوم'::TEXT, CURRENT_DATE + 20, 0.8::NUMERIC, ROUND(v_inv.total_amount*0.992,2), ROUND(v_inv.total_amount*0.008,2) WHERE v_days > 20;
  RETURN QUERY SELECT 'الدفع في تاريخ الاستحقاق'::TEXT, COALESCE(v_inv.payment_due_date,CURRENT_DATE+v_days), 0::NUMERIC, v_inv.total_amount, 0::NUMERIC;
END $$;
GRANT EXECUTE ON FUNCTION public.invoice_dynamic_discount_options(UUID) TO authenticated;

CREATE OR REPLACE VIEW public.invoice_archive
WITH (security_invoker = true) AS
SELECT si.*, s.legal_name AS supplier_name, po.po_number,
  COALESCE((SELECT COUNT(*) FROM public.procurement_matching_results mr WHERE mr.invoice_id=si.id),0) AS matching_rows,
  COALESCE((SELECT COUNT(*) FROM public.invoice_exception_actions ea WHERE ea.invoice_id=si.id),0) AS exception_actions
FROM public.supplier_invoices si
LEFT JOIN public.suppliers s ON s.id=si.supplier_id AND s.tenant_id=si.tenant_id
LEFT JOIN public.purchase_orders po ON po.id=si.po_id AND po.tenant_id=si.tenant_id
WHERE si.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.invoice_archive TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.create_supplier_invoice_full(uuid,uuid,text,date,numeric,numeric,text,date,text,text,text,jsonb)') IS NULL THEN RAISE EXCEPTION '0200 failed: create invoice missing'; END IF;
  IF to_regprocedure('public.approve_invoice_for_payment(uuid,text)') IS NULL THEN RAISE EXCEPTION '0200 failed: approve payment missing'; END IF;
  RAISE NOTICE '✅ 0200: Invoice processing completion applied';
END $$;
