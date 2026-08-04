-- ============================================================================
-- 0265 — جسر المرتجعات العكسي: RTV ← بوابة المخزون الحقيقية
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (نقص مسجَّل بعد الوحدة 04):
--   المايجريشن 0260 أغلق فجوة الاستلام (GR → زيادة الرصيد)، لكن
--   create_rtv بقيت تكتب في الجدول الموازي المعزول فقط:
--       INSERT INTO public.inventory_transactions(... direction='out')
--
--   النتيجة: عند إرجاع بضاعة للمورد
--     ✅ يُسجَّل صف في جدول المشتريات
--     ❌ **لا يُخصم** من inventory_stock_balances
--     ❌ **لا تظهر** حركة خروج في الكارت المخزني
--
--   الخطورة: أسوأ من فجوة الاستلام. الاستلام الناقص يُظهر رصيداً أقل
--   من الواقع (تحفّظي)، أما المرتجع غير المخصوم فيُظهر رصيداً **أعلى**
--   من الواقع — فيُخطط الإنتاج على بضاعة غير موجودة فعلياً.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل:
--   1) ربط المرتجع بالمستودع والصنف (return_to_vendor).
--   2) دالة جسر post_rtv_to_inventory تكتب حركة return_out وتخصم الرصيد.
--   3) إعادة تعريف create_rtv لتستدعي الجسر.
--
-- حمايات:
--   • منع الخصم المزدوج.
--   • منع الخصم إن كان الرصيد غير كافٍ (INSUFFICIENT_STOCK) — الجدول
--     يمنع الأرصدة السالبة أصلاً بـ CHECK، فنُعطي خطأً مفهوماً بدل
--     انتهاك قيد غامض.
--   • لا يُسقط إنشاء المرتجع إن تعذّر الخصم — يُسجَّل السبب.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) أعمدة الربط
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.return_to_vendor
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_post_error TEXT;

CREATE INDEX IF NOT EXISTS idx_rtv_warehouse
  ON public.return_to_vendor(warehouse_id) WHERE warehouse_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) الجسر العكسي
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_rtv_to_inventory(
  p_rtv_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE(
  posted_lines INTEGER,
  skipped_lines INTEGER,
  total_quantity NUMERIC,
  target_warehouse_id UUID
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_rtv RECORD;
  v_po_line RECORD;
  v_item_id UUID;
  v_wh UUID;
  v_available NUMERIC;
  v_move_no TEXT;
  v_uom TEXT;
  v_posted INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_rtv FROM public.return_to_vendor
   WHERE id = p_rtv_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RTV_NOT_FOUND'; END IF;

  IF v_rtv.inventory_posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'RTV_ALREADY_POSTED_TO_INVENTORY';
  END IF;
  IF COALESCE(v_rtv.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'RTV_QUANTITY_MUST_BE_POSITIVE';
  END IF;

  -- المستودع: الوسيط ← المسجَّل ← مستودع الاستلام الأصلي ← الافتراضي
  v_wh := COALESCE(p_warehouse_id, v_rtv.warehouse_id);
  IF v_wh IS NULL THEN
    SELECT gr.warehouse_id INTO v_wh FROM public.goods_receipts gr
     WHERE gr.id = v_rtv.gr_id AND gr.tenant_id = v_tenant;
  END IF;
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM public.inventory_warehouses
     WHERE tenant_id = v_tenant AND COALESCE(status,'active') = 'active'
     ORDER BY created_at LIMIT 1;
  END IF;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'NO_WAREHOUSE_AVAILABLE'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id = v_wh AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'WAREHOUSE_NOT_IN_TENANT';
  END IF;

  -- الصنف: من سطر أمر الشراء المرتبط بالاستلام
  SELECT pl.* INTO v_po_line
  FROM public.gr_line_items gl
  JOIN public.po_line_items pl ON pl.id = gl.po_line_item_id
  WHERE gl.gr_id = v_rtv.gr_id AND gl.tenant_id = v_tenant
  LIMIT 1;

  IF v_po_line.id IS NOT NULL THEN
    v_item_id := public.resolve_inventory_item_for_po_line(v_po_line.id);
  END IF;

  IF v_item_id IS NULL THEN
    -- سطر غير مرتبط: لا نُسقط العملية، نُحصيه فقط
    v_skipped := 1;
    UPDATE public.return_to_vendor
       SET warehouse_id = v_wh,
           inventory_posted_at = NOW(),
           inventory_post_error = 'ITEM_NOT_LINKED'
     WHERE id = p_rtv_id AND tenant_id = v_tenant;
    RETURN QUERY SELECT 0::INTEGER, v_skipped::INTEGER, 0::NUMERIC, v_wh::UUID;
    RETURN;
  END IF;

  -- التحقق من كفاية الرصيد قبل الخصم
  SELECT COALESCE(on_hand_qty, 0) INTO v_available
  FROM public.inventory_stock_balances
  WHERE tenant_id = v_tenant AND item_id = v_item_id AND warehouse_id = v_wh
    AND location_id IS NULL AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL;

  IF COALESCE(v_available, 0) < v_rtv.quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK_FOR_RTV (available=%, requested=%)',
      COALESCE(v_available, 0), v_rtv.quantity;
  END IF;

  v_uom := COALESCE(NULLIF(btrim(v_po_line.unit), ''), 'PCS');
  v_move_no := 'RTVM-' || to_char(NOW(), 'YYYYMMDD') || '-' ||
               lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 1000000)::TEXT, 6, '0');

  -- حركة خروج حقيقية
  INSERT INTO public.inventory_stock_movements(
    tenant_id, movement_number, movement_type, item_id, warehouse_id,
    quantity, uom, base_quantity, unit_cost, reference_type, reference_id, reason_code, actor_id
  ) VALUES (
    v_tenant, v_move_no, 'return_out', v_item_id, v_wh,
    v_rtv.quantity, v_uom, v_rtv.quantity,
    COALESCE(v_po_line.unit_price, 0), 'return_to_vendor', p_rtv_id, v_rtv.reason, auth.uid()
  );

  -- خصم الرصيد
  UPDATE public.inventory_stock_balances
     SET on_hand_qty = on_hand_qty - v_rtv.quantity,
         updated_at = NOW()
   WHERE tenant_id = v_tenant AND item_id = v_item_id AND warehouse_id = v_wh
     AND location_id IS NULL AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL;

  UPDATE public.return_to_vendor
     SET warehouse_id = v_wh,
         inventory_posted_at = NOW(),
         inventory_post_error = NULL
   WHERE id = p_rtv_id AND tenant_id = v_tenant;

  v_posted := 1;

  BEGIN
    PERFORM public.log_procurement_audit_event(
      'rtv_posted_to_inventory', 'return_to_vendor', p_rtv_id, v_rtv.reason, NULL,
      jsonb_build_object('warehouse_id', v_wh, 'item_id', v_item_id, 'quantity', v_rtv.quantity)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT v_posted::INTEGER, v_skipped::INTEGER, v_rtv.quantity::NUMERIC, v_wh::UUID;
END $$;
REVOKE ALL ON FUNCTION public.post_rtv_to_inventory(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_rtv_to_inventory(UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) create_rtv تستدعي الجسر (نفس التوقيع — لا كسر لأي عقد)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_rtv(
  p_gr_id UUID, p_po_id UUID, p_quantity NUMERIC,
  p_reason TEXT, p_details TEXT, p_lot_number TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_rtv_id UUID;
  v_rtv_number TEXT;
  v_err TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF p_reason NOT IN ('quality_rejected','over_delivery','damaged','wrong_item','expired','other') THEN
    RAISE EXCEPTION 'INVALID_RTV_REASON';
  END IF;
  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'RTV_QUANTITY_MUST_BE_POSITIVE';
  END IF;

  PERFORM public.procurement_assert_po_in_tenant(p_po_id);
  PERFORM public.procurement_assert_gr_in_tenant(p_gr_id, p_po_id);

  v_rtv_number := 'RTV-' || to_char(NOW(),'YYYY-') ||
                  lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT, 5, '0');

  INSERT INTO public.return_to_vendor(
    tenant_id, gr_id, po_id, rtv_number, quantity, reason, details,
    lot_number, credit_note_required, created_by
  ) VALUES (
    v_tenant, p_gr_id, p_po_id, v_rtv_number, p_quantity, p_reason, p_details,
    p_lot_number, true, v_user
  ) RETURNING id INTO v_rtv_id;

  -- السجل القديم (توافق خلفي)
  INSERT INTO public.inventory_transactions(
    tenant_id, source_table, source_id, item_code, description, quantity, unit, lot_number, direction
  )
  SELECT v_tenant, 'return_to_vendor', v_rtv_id, pl.item_code, pl.description,
         p_quantity, pl.unit, p_lot_number, 'out'
  FROM public.gr_line_items gl
  JOIN public.po_line_items pl ON pl.id = gl.po_line_item_id
  WHERE gl.gr_id = p_gr_id AND gl.tenant_id = v_tenant
  LIMIT 1;

  -- ✅ الجديد: خصم فعلي من بوابة المخزون.
  -- لا نُسقط إنشاء المرتجع إن تعذّر الخصم — نسجّل السبب ليعالجه أمين المستودع.
  BEGIN
    PERFORM public.post_rtv_to_inventory(v_rtv_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    UPDATE public.return_to_vendor SET inventory_post_error = v_err WHERE id = v_rtv_id;
  END;

  PERFORM public.log_po_audit(
    p_po_id, 'rtv_created', NULL, NULL, NULL,
    jsonb_build_object('rtv_id', v_rtv_id, 'reason', p_reason, 'quantity', p_quantity), p_details
  );

  RETURN v_rtv_id;
END $$;
REVOKE ALL ON FUNCTION public.create_rtv(UUID,UUID,NUMERIC,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rtv(UUID,UUID,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) View: حالة ترحيل المرتجعات
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.procurement_rtv_inventory_status
WITH (security_invoker = true) AS
SELECT
  r.id AS rtv_id,
  r.tenant_id,
  r.rtv_number,
  r.po_id,
  po.po_number,
  r.gr_id,
  gr.gr_number,
  r.quantity,
  r.reason,
  r.warehouse_id,
  wh.warehouse_code,
  r.inventory_posted_at,
  (r.inventory_posted_at IS NOT NULL AND r.inventory_post_error IS NULL) AS is_deducted_from_inventory,
  r.inventory_post_error,
  r.created_at
FROM public.return_to_vendor r
LEFT JOIN public.purchase_orders po ON po.id = r.po_id
LEFT JOIN public.goods_receipts gr ON gr.id = r.gr_id
LEFT JOIN public.inventory_warehouses wh ON wh.id = r.warehouse_id
WHERE r.tenant_id = public.current_user_tenant_id()
ORDER BY r.created_at DESC;
GRANT SELECT ON public.procurement_rtv_inventory_status TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.post_rtv_to_inventory(uuid,uuid)') IS NULL
     OR to_regclass('public.procurement_rtv_inventory_status') IS NULL
  THEN
    RAISE EXCEPTION '0265 failed: RTV inventory bridge objects missing';
  END IF;
  RAISE NOTICE '✅ 0265: RTV → inventory reverse bridge applied';
END $$;
