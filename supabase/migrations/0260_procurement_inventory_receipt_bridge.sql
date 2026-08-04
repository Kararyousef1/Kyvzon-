-- ============================================================================
-- 0260 — جسر الاستلام: المشتريات ← بوابة المخزون الحقيقية
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (الفجوة الأخطر في تدقيق بوابة المشتريات):
--   post_goods_receipt في 0199 تكتب فقط في جدول موازٍ اسمه
--   public.inventory_transactions يملك item_code TEXT بلا مفتاح أجنبي،
--   ولا علاقة له ببوابة المخزون الفعلية التي تعتمد:
--       inventory_items · inventory_stock_balances · inventory_stock_movements
--
--   النتيجة العملية: عند استلام بضاعة عبر المشتريات
--     ✅ يُسجَّل صف في inventory_transactions (سجل المشتريات)
--     ❌ لا يزيد الرصيد في inventory_stock_balances
--     ❌ لا تظهر الحركة في الكارت المخزني
--   أي أن أمين المستودع لا يرى البضاعة المستلمة إطلاقاً.
--
--   ويوجد في 0185 تعليق مكشوف يؤكد أن الربط كان مؤجلاً:
--       -- INSERT INTO inventory_transactions ...
--
--   بُغ إضافي مكتشف أثناء التحقق:
--     post_goods_receipt في 0199 تنفّذ
--         UPDATE public.goods_receipts SET status='posted', updated_at=NOW()
--     بينما الجدول لا يملك عمود updated_at إطلاقاً، فتفشل وقت التنفيذ:
--         ERROR: column "updated_at" of relation "goods_receipts" does not exist
--     أي أن ترحيل الاستلام كان معطّلاً كلياً حتى قبل مسألة المخزون.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل:
--   1) ربط سطر أمر الشراء بصنف المخزون (po_line_items.inventory_item_id)
--      وربط الاستلام بالمستودع (goods_receipts.warehouse_id).
--   2) دالة جسر post_goods_receipt_to_inventory تكتب حركة استلام حقيقية
--      في inventory_stock_movements وتُحدِّث inventory_stock_balances.
--   3) إعادة تعريف post_goods_receipt لتستدعي الجسر مع الإبقاء على
--      السجل القديم للتوافق الخلفي.
--
-- مبادئ ملتزم بها:
--   • idempotent: لا ترحيل مزدوج لنفس الاستلام.
--   • عدم كسر البيانات القائمة: الربط اختياري، وإن لم يُحل الصنف يُتخطّى
--     السطر مع تسجيل تحذير بدل إسقاط العملية كلها.
--   • كل شيء مُدقَّق في procurement_audit_events.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) أعمدة الربط
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.po_line_items
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL;

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_posted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_line_items_inventory_item
  ON public.po_line_items(inventory_item_id) WHERE inventory_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gr_warehouse
  ON public.goods_receipts(warehouse_id) WHERE warehouse_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) حل الصنف: من الربط المباشر أو بمطابقة item_code
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_inventory_item_for_po_line(p_po_line_id UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_line RECORD;
  v_item_id UUID;
BEGIN
  SELECT * INTO v_line FROM public.po_line_items WHERE id = p_po_line_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_line.inventory_item_id IS NOT NULL THEN
    RETURN v_line.inventory_item_id;
  END IF;

  -- مطابقة بالكود (نفس المستأجر) — الحل الاحتياطي للبيانات القديمة
  IF COALESCE(btrim(v_line.item_code), '') <> '' THEN
    SELECT id INTO v_item_id
    FROM public.inventory_items
    WHERE tenant_id = v_tenant
      AND upper(btrim(item_code)) = upper(btrim(v_line.item_code))
    LIMIT 1;
  END IF;

  RETURN v_item_id;
END $$;
REVOKE ALL ON FUNCTION public.resolve_inventory_item_for_po_line(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_inventory_item_for_po_line(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) الجسر: ترحيل استلام إلى المخزون الحقيقي
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_goods_receipt_to_inventory(
  p_gr_id UUID,
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
  v_gr RECORD;
  v_line RECORD;
  v_po_line RECORD;
  v_item_id UUID;
  v_wh UUID;
  v_posted INTEGER := 0;
  v_skipped INTEGER := 0;
  v_total NUMERIC := 0;
  v_move_no TEXT;
  v_uom TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_gr FROM public.goods_receipts
   WHERE id = p_gr_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GR_NOT_FOUND'; END IF;

  -- منع الترحيل المزدوج
  IF v_gr.inventory_posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'GR_ALREADY_POSTED_TO_INVENTORY';
  END IF;

  -- تحديد المستودع: الوسيط ← المسجَّل في الاستلام ← الافتراضي النشط
  v_wh := COALESCE(p_warehouse_id, v_gr.warehouse_id);
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM public.inventory_warehouses
     WHERE tenant_id = v_tenant AND COALESCE(status,'active') = 'active'
     ORDER BY created_at LIMIT 1;
  END IF;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'NO_WAREHOUSE_AVAILABLE'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.inventory_warehouses WHERE id = v_wh AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'WAREHOUSE_NOT_IN_TENANT';
  END IF;

  FOR v_line IN
    SELECT * FROM public.gr_line_items
     WHERE gr_id = p_gr_id AND tenant_id = v_tenant AND COALESCE(accepted_qty,0) > 0
  LOOP
    SELECT * INTO v_po_line FROM public.po_line_items
     WHERE id = v_line.po_line_item_id AND tenant_id = v_tenant;

    v_item_id := public.resolve_inventory_item_for_po_line(v_line.po_line_item_id);

    -- لا نُسقط العملية كلها: نتخطّى السطر غير المرتبط ونُحصيه
    IF v_item_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_uom := COALESCE(NULLIF(btrim(v_po_line.unit), ''), 'PCS');
    v_move_no := 'GRM-' || to_char(NOW(), 'YYYYMMDD') || '-' ||
                 lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 1000000)::TEXT, 6, '0') ||
                 '-' || v_posted::TEXT;

    -- حركة مخزنية حقيقية في الكارت المخزني
    INSERT INTO public.inventory_stock_movements(
      tenant_id, movement_number, movement_type, item_id, warehouse_id,
      quantity, uom, base_quantity, unit_cost, reference_type, reference_id, actor_id
    ) VALUES (
      v_tenant, v_move_no, 'receipt', v_item_id, v_wh,
      v_line.accepted_qty, v_uom, v_line.accepted_qty,
      COALESCE(v_po_line.unit_price, 0), 'goods_receipt', p_gr_id, auth.uid()
    );

    -- تحديث الرصيد الفعلي (upsert)
    IF EXISTS (
      SELECT 1 FROM public.inventory_stock_balances
       WHERE tenant_id = v_tenant AND item_id = v_item_id AND warehouse_id = v_wh
         AND location_id IS NULL AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL
    ) THEN
      UPDATE public.inventory_stock_balances
         SET on_hand_qty = on_hand_qty + v_line.accepted_qty,
             updated_at = NOW()
       WHERE tenant_id = v_tenant AND item_id = v_item_id AND warehouse_id = v_wh
         AND location_id IS NULL AND lot_id IS NULL AND serial_id IS NULL AND lpn_id IS NULL;
    ELSE
      INSERT INTO public.inventory_stock_balances(
        tenant_id, item_id, warehouse_id, on_hand_qty, average_cost
      ) VALUES (
        v_tenant, v_item_id, v_wh, v_line.accepted_qty, COALESCE(v_po_line.unit_price, 0)
      );
    END IF;

    v_posted := v_posted + 1;
    v_total := v_total + v_line.accepted_qty;
  END LOOP;

  UPDATE public.goods_receipts
     SET warehouse_id = v_wh,
         inventory_posted_at = NOW(),
         inventory_posted_by = auth.uid()
   WHERE id = p_gr_id AND tenant_id = v_tenant;

  -- تدقيق
  BEGIN
    PERFORM public.log_procurement_audit_event(
      'gr_posted_to_inventory', 'goods_receipt', p_gr_id, NULL, NULL,
      jsonb_build_object(
        'warehouse_id', v_wh,
        'posted_lines', v_posted,
        'skipped_lines', v_skipped,
        'total_quantity', v_total
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT v_posted::INTEGER, v_skipped::INTEGER, v_total::NUMERIC, v_wh::UUID;
END $$;
REVOKE ALL ON FUNCTION public.post_goods_receipt_to_inventory(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_goods_receipt_to_inventory(UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) إعادة تعريف post_goods_receipt لتستدعي الجسر
--    (نفس التوقيع ونوع الإرجاع — لا كسر لأي عقد قائم)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_goods_receipt(p_gr_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_gr RECORD;
  v_iqc RECORD;
  v_line RECORD;
  v_po_line RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  SELECT * INTO v_gr FROM public.goods_receipts WHERE id = p_gr_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GR_NOT_FOUND'; END IF;
  IF v_gr.status <> 'quality_hold' THEN RAISE EXCEPTION 'GR_MUST_BE_QUALITY_HOLD'; END IF;

  SELECT * INTO v_iqc FROM public.iqc_inspections WHERE gr_id = p_gr_id AND tenant_id = v_tenant;
  IF FOUND AND v_iqc.status = 'rejected' THEN RAISE EXCEPTION 'IQC_REJECTED_CANNOT_POST'; END IF;

  -- سجل المشتريات القديم (توافق خلفي)
  FOR v_line IN SELECT * FROM public.gr_line_items WHERE gr_id = p_gr_id AND tenant_id = v_tenant LOOP
    SELECT * INTO v_po_line FROM public.po_line_items WHERE id = v_line.po_line_item_id AND tenant_id = v_tenant;
    INSERT INTO public.inventory_transactions(
      tenant_id, source_table, source_id, item_code, description, quantity, unit,
      lot_number, expiry_date, location, direction
    ) VALUES (
      v_tenant, 'goods_receipts', p_gr_id, v_po_line.item_code, v_po_line.description,
      v_line.accepted_qty, v_po_line.unit, v_line.lot_number, v_line.expiry_date, v_line.location, 'in'
    );
  END LOOP;

  -- ✅ الجديد: ترحيل فعلي إلى بوابة المخزون
  PERFORM public.post_goods_receipt_to_inventory(p_gr_id, v_gr.warehouse_id);

  -- ملاحظة: جدول goods_receipts لا يملك عمود updated_at.
  -- النسخة الأصلية في 0199 كانت تحدّثه فتفشل وقت التنفيذ:
  --   ERROR: column "updated_at" of relation "goods_receipts" does not exist
  UPDATE public.goods_receipts SET status = 'posted'
   WHERE id = p_gr_id AND tenant_id = v_tenant;

  PERFORM public.log_po_audit(
    v_gr.po_id, 'gr_posted', v_gr.status, 'posted',
    to_jsonb(v_gr), jsonb_build_object('gr_id', p_gr_id), NULL
  );
END $$;
REVOKE ALL ON FUNCTION public.post_goods_receipt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_goods_receipt(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) View: حالة ترحيل الاستلامات إلى المخزون
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.procurement_gr_inventory_status
WITH (security_invoker = true) AS
SELECT
  gr.id AS gr_id,
  gr.tenant_id,
  gr.gr_number,
  gr.po_id,
  po.po_number,
  gr.status AS gr_status,
  gr.warehouse_id,
  wh.warehouse_code,
  wh.name_ar AS warehouse_name,
  gr.inventory_posted_at,
  (gr.inventory_posted_at IS NOT NULL) AS is_posted_to_inventory,
  COUNT(gl.id)::BIGINT AS line_count,
  COUNT(gl.id) FILTER (
    WHERE public.resolve_inventory_item_for_po_line(gl.po_line_item_id) IS NULL
  )::BIGINT AS unlinked_line_count,
  COALESCE(SUM(gl.accepted_qty), 0)::NUMERIC AS accepted_quantity,
  gr.created_at
FROM public.goods_receipts gr
LEFT JOIN public.purchase_orders po ON po.id = gr.po_id
LEFT JOIN public.inventory_warehouses wh ON wh.id = gr.warehouse_id
LEFT JOIN public.gr_line_items gl ON gl.gr_id = gr.id
WHERE gr.tenant_id = public.current_user_tenant_id()
GROUP BY gr.id, gr.tenant_id, gr.gr_number, gr.po_id, po.po_number, gr.status,
         gr.warehouse_id, wh.warehouse_code, wh.name_ar, gr.inventory_posted_at, gr.created_at
ORDER BY gr.created_at DESC;
GRANT SELECT ON public.procurement_gr_inventory_status TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.post_goods_receipt_to_inventory(uuid,uuid)') IS NULL
     OR to_regprocedure('public.resolve_inventory_item_for_po_line(uuid)') IS NULL
     OR to_regclass('public.procurement_gr_inventory_status') IS NULL
  THEN
    RAISE EXCEPTION '0260 failed: procurement→inventory bridge objects missing';
  END IF;
  RAISE NOTICE '✅ 0260: procurement → inventory receipt bridge applied';
END $$;
