-- ============================================================================
-- 0267 — Lookups وأدوات ربط تكامل المشتريات
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقص المسجَّل:
--   جسور التكامل (0260 المخزون · 0262 المالية) تعتمد أعمدة ربط:
--       po_line_items.inventory_item_id
--       po_line_items.expense_account_id
--       goods_receipts.warehouse_id
--       suppliers.finance_vendor_id
--   لكنها **لا تظهر في الواجهة**، فتعمل حالياً بالاحتياطي التلقائي فقط
--   (مطابقة item_code / أول حساب مصروف). هذا يعمل لكنه غير صريح، وأي
--   اختلاف في الترميز يُسقط السطر بصمت إلى "غير مرتبط".
--
-- الحل:
--   • Lookups للأصناف والمستودعات وحسابات المصروف — بديل نسخ UUID.
--   • دوال ربط صريحة مع تحقق كامل وتسجيل تدقيق.
--   • View لصحة الربط يكشف الفجوات قبل الترحيل.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Lookups
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.procurement_inventory_item_lookup
WITH (security_invoker = true) AS
SELECT
  i.id, i.tenant_id, i.item_code, i.name_ar,
  COALESCE(c.name_ar, '') AS category_name,
  i.status
FROM public.inventory_items i
LEFT JOIN public.inventory_categories c ON c.id = i.category_id
WHERE i.tenant_id = public.current_user_tenant_id()
  AND COALESCE(i.status, 'active') = 'active'
ORDER BY i.item_code;
GRANT SELECT ON public.procurement_inventory_item_lookup TO authenticated;

CREATE OR REPLACE VIEW public.procurement_warehouse_lookup
WITH (security_invoker = true) AS
SELECT id, tenant_id, warehouse_code, name_ar, warehouse_type, status
FROM public.inventory_warehouses
WHERE tenant_id = public.current_user_tenant_id()
  AND COALESCE(status, 'active') = 'active'
ORDER BY warehouse_code;
GRANT SELECT ON public.procurement_warehouse_lookup TO authenticated;

CREATE OR REPLACE VIEW public.procurement_expense_account_lookup
WITH (security_invoker = true) AS
SELECT
  a.id, a.tenant_id, a.legal_entity_id, a.code,
  COALESCE(a.name_ar, a.name) AS account_name,
  a.account_type, e.code AS entity_code
FROM public.chart_of_accounts a
JOIN public.legal_entities e ON e.id = a.legal_entity_id
WHERE a.tenant_id = public.current_user_tenant_id()
  AND a.account_type = 'Expense'
  AND COALESCE(a.is_active, true)
  AND COALESCE(a.allow_posting, true)
  AND NOT COALESCE(a.is_control_account, false)
ORDER BY e.code, a.code;
GRANT SELECT ON public.procurement_expense_account_lookup TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) ربط سطر أمر الشراء بصنف المخزون وحساب المصروف
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_po_line_integration(
  p_po_line_id UUID,
  p_inventory_item_id UUID DEFAULT NULL,
  p_expense_account_id UUID DEFAULT NULL
)
RETURNS public.po_line_items
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old public.po_line_items%ROWTYPE;
  v_row public.po_line_items%ROWTYPE;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  SELECT * INTO v_old FROM public.po_line_items
   WHERE id = p_po_line_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_LINE_NOT_FOUND'; END IF;

  IF p_inventory_item_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.inventory_items
                      WHERE id = p_inventory_item_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'INVENTORY_ITEM_NOT_IN_TENANT';
  END IF;

  IF p_expense_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts
                      WHERE id = p_expense_account_id AND tenant_id = v_tenant
                        AND account_type = 'Expense'
                        AND COALESCE(is_active, true)
                        AND COALESCE(allow_posting, true)
                        AND NOT COALESCE(is_control_account, false)) THEN
    RAISE EXCEPTION 'EXPENSE_ACCOUNT_INVALID';
  END IF;

  UPDATE public.po_line_items
     SET inventory_item_id = COALESCE(p_inventory_item_id, inventory_item_id),
         expense_account_id = COALESCE(p_expense_account_id, expense_account_id)
   WHERE id = p_po_line_id AND tenant_id = v_tenant
   RETURNING * INTO v_row;

  BEGIN
    PERFORM public.log_procurement_audit_event(
      'po_line_integration_linked', 'po_line_item', p_po_line_id, NULL,
      to_jsonb(v_old), to_jsonb(v_row));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.link_po_line_integration(UUID,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_po_line_integration(UUID,UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) تحديد مستودع الاستلام
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_goods_receipt_warehouse(
  p_gr_id UUID,
  p_warehouse_id UUID
)
RETURNS public.goods_receipts
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old public.goods_receipts%ROWTYPE;
  v_row public.goods_receipts%ROWTYPE;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  SELECT * INTO v_old FROM public.goods_receipts
   WHERE id = p_gr_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GR_NOT_FOUND'; END IF;

  IF v_old.inventory_posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'GR_ALREADY_POSTED_CANNOT_CHANGE_WAREHOUSE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses
                  WHERE id = p_warehouse_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'WAREHOUSE_NOT_IN_TENANT';
  END IF;

  UPDATE public.goods_receipts SET warehouse_id = p_warehouse_id
   WHERE id = p_gr_id AND tenant_id = v_tenant
   RETURNING * INTO v_row;

  BEGIN
    PERFORM public.log_procurement_audit_event(
      'gr_warehouse_set', 'goods_receipt', p_gr_id, NULL,
      to_jsonb(v_old), to_jsonb(v_row));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.set_goods_receipt_warehouse(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_goods_receipt_warehouse(UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) View: صحة ربط التكامل — يكشف الفجوات قبل الترحيل
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.procurement_integration_health
WITH (security_invoker = true) AS
SELECT
  'po_lines_without_inventory_item'::TEXT AS check_code,
  'سطور أوامر شراء بلا صنف مخزون مرتبط'::TEXT AS message,
  'warning'::TEXT AS severity,
  COUNT(*)::BIGINT AS affected_count
FROM public.po_line_items pl
WHERE pl.tenant_id = public.current_user_tenant_id()
  AND pl.inventory_item_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_items i
     WHERE i.tenant_id = pl.tenant_id
       AND upper(btrim(i.item_code)) = upper(btrim(COALESCE(pl.item_code, '')))
  )
HAVING COUNT(*) > 0

UNION ALL
SELECT
  'gr_not_posted_to_inventory'::TEXT,
  'استلامات مُرحَّلة لم تصل المخزون'::TEXT,
  'error'::TEXT,
  COUNT(*)::BIGINT
FROM public.goods_receipts gr
WHERE gr.tenant_id = public.current_user_tenant_id()
  AND gr.status = 'posted'
  AND gr.inventory_posted_at IS NULL
HAVING COUNT(*) > 0

UNION ALL
SELECT
  'invoices_not_posted_to_ap'::TEXT,
  'فواتير معتمدة لم تصل الذمم الدائنة'::TEXT,
  'error'::TEXT,
  COUNT(*)::BIGINT
FROM public.supplier_invoices si
WHERE si.tenant_id = public.current_user_tenant_id()
  AND si.status IN ('approved', 'paid')
  AND si.ap_invoice_id IS NULL
HAVING COUNT(*) > 0

UNION ALL
SELECT
  'rtv_not_deducted'::TEXT,
  'مرتجعات لم تُخصم من المخزون'::TEXT,
  'error'::TEXT,
  COUNT(*)::BIGINT
FROM public.return_to_vendor r
WHERE r.tenant_id = public.current_user_tenant_id()
  AND (r.inventory_posted_at IS NULL OR r.inventory_post_error IS NOT NULL)
HAVING COUNT(*) > 0

UNION ALL
SELECT
  'suppliers_without_finance_vendor'::TEXT,
  'موردون معتمدون بلا حساب مورد مالي'::TEXT,
  'info'::TEXT,
  COUNT(*)::BIGINT
FROM public.suppliers s
WHERE s.tenant_id = public.current_user_tenant_id()
  AND s.status = 'approved'
  AND s.finance_vendor_id IS NULL
HAVING COUNT(*) > 0;
GRANT SELECT ON public.procurement_integration_health TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.procurement_inventory_item_lookup') IS NULL
     OR to_regclass('public.procurement_warehouse_lookup') IS NULL
     OR to_regclass('public.procurement_expense_account_lookup') IS NULL
     OR to_regclass('public.procurement_integration_health') IS NULL
     OR to_regprocedure('public.link_po_line_integration(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.set_goods_receipt_warehouse(uuid,uuid)') IS NULL
  THEN
    RAISE EXCEPTION '0267 failed: integration lookup objects missing';
  END IF;
  RAISE NOTICE '✅ 0267: procurement integration lookups applied';
END $$;
