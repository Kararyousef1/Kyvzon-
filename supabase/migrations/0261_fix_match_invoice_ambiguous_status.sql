-- ============================================================================
-- 0261 — إصلاح خطأ وقت التنفيذ في match_invoice (المطابقة الثلاثية)
--
-- السبب الجذري:
--   الدالة معلَّنة:
--       RETURNS TABLE (line_id UUID, status TEXT, ...)
--   فيصبح `status` معرّفاً خارجاً (OUT parameter) داخل جسم الدالة.
--   وفي نهاية الدالة توجد استعلامات:
--       SELECT 1 FROM public.procurement_matching_results
--        WHERE invoice_id=p_invoice_id AND status='exception'
--   فلا يستطيع PostgreSQL تحديد هل `status` هو عمود الجدول أم معامل الإخراج:
--       ERROR: column reference "status" is ambiguous
--
-- لماذا لم يُكتشف؟
--   الخطأ يقع وقت التنفيذ لا وقت الإنشاء، ولا يظهر إلا بعد اجتياز حلقة
--   السطور والوصول إلى كتلة تحديث حالة الفاتورة.
--
-- الأثر:
--   المطابقة الثلاثية (3-Way Matching) — وهي قلب الوحدة 05 والحامي الأول
--   لأموال الشركة — كانت تفشل دائماً، ولا تُحدَّث حالة الفاتورة إطلاقاً.
--
-- الإصلاح:
--   تأهيل مراجع الأعمدة باسم مستعار (alias) للجدول: mr.status
--   مع الإبقاء على التوقيع ونوع الإرجاع والمنطق كما هو تماماً.
-- ============================================================================

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
  v_has_exception BOOLEAN;
  v_has_tolerance BOOLEAN;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_invoice FROM public.supplier_invoices WHERE id=p_invoice_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  IF v_invoice.supplier_id IS NOT NULL THEN
    PERFORM public.procurement_assert_supplier_in_tenant(v_invoice.supplier_id, false);
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id=v_invoice.po_id AND tenant_id=v_tenant;

  -- فاتورة بدون PO → استثناء no_po
  IF v_po.id IS NULL THEN
    INSERT INTO public.procurement_matching_results
      (tenant_id, invoice_id, po_id, match_type, status, exception_reason, exception_details)
    VALUES
      (v_tenant, p_invoice_id, v_invoice.po_id, '2way', 'exception', 'no_po', '{"reason":"فاتورة بدون PO"}'::jsonb);
    RETURN QUERY SELECT NULL::UUID, 'exception'::TEXT, 0::NUMERIC, 0::NUMERIC, false, false, 'no_po'::TEXT;
    RETURN;
  END IF;

  -- آخر استلام مُرحَّل مرتبط بأمر الشراء
  SELECT * INTO v_gr FROM public.goods_receipts
   WHERE po_id=v_po.id AND tenant_id=v_tenant AND goods_receipts.status='posted'
   ORDER BY received_at DESC LIMIT 1;

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

    IF v_gr.id IS NOT NULL THEN
      SELECT * INTO v_gr_line FROM public.gr_line_items
       WHERE gr_id=v_gr.id AND po_line_item_id=v_inv_line.po_line_item_id AND tenant_id=v_tenant LIMIT 1;
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
      END IF;
    END IF;

    v_total_var := v_price_var * v_inv_line.quantity;

    INSERT INTO public.procurement_matching_results
      (tenant_id, invoice_id, po_id, gr_id, match_type, status, price_variance, price_variance_percent,
       qty_variance, qty_variance_percent, total_variance, tolerance_applied, auto_approved,
       exception_reason, exception_details)
    VALUES
      (v_tenant, p_invoice_id, v_po.id, v_gr.id, CASE WHEN v_gr.id IS NULL THEN '2way' ELSE '3way' END,
       v_status, v_price_var, v_price_var_percent, v_qty_var, v_qty_var_percent, v_total_var,
       v_tolerance, v_auto, v_exception,
       jsonb_build_object('inv_line', v_inv_line.id, 'po_line', v_po_line.id));

    RETURN QUERY SELECT v_inv_line.id, v_status, v_price_var, v_qty_var, v_tolerance, v_auto, v_exception;
  END LOOP;

  -- ✅ الإصلاح: تأهيل مرجع العمود باسم مستعار لتفادي تعارضه مع معامل الإخراج
  SELECT EXISTS (
    SELECT 1 FROM public.procurement_matching_results mr
     WHERE mr.invoice_id = p_invoice_id AND mr.tenant_id = v_tenant AND mr.status = 'exception'
  ) INTO v_has_exception;

  SELECT EXISTS (
    SELECT 1 FROM public.procurement_matching_results mr
     WHERE mr.invoice_id = p_invoice_id AND mr.tenant_id = v_tenant AND mr.status = 'tolerance'
  ) INTO v_has_tolerance;

  IF v_has_exception THEN
    UPDATE public.supplier_invoices si SET status='exception', updated_at=NOW()
     WHERE si.id=p_invoice_id AND si.tenant_id=v_tenant;
  ELSIF v_has_tolerance THEN
    UPDATE public.supplier_invoices si SET status='tolerance', updated_at=NOW()
     WHERE si.id=p_invoice_id AND si.tenant_id=v_tenant;
  ELSE
    UPDATE public.supplier_invoices si SET status='matched', updated_at=NOW()
     WHERE si.id=p_invoice_id AND si.tenant_id=v_tenant;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.match_invoice(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_invoice(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.match_invoice(uuid)') IS NULL THEN
    RAISE EXCEPTION '0261 failed: match_invoice is missing';
  END IF;
  RAISE NOTICE '✅ 0261: match_invoice ambiguous status reference fixed';
END $$;
