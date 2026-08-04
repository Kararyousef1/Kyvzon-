-- ============================================================================
-- 0264 — مزامنة إجمالي أمر الشراء مع سطوره + تحصين تحليل الإنفاق
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة المكتشفة بالتشغيل الفعلي:
--   purchase_orders.total_before_tax عمود عادي (NOT generated)، بينما
--   tax_amount و total_amount محسوبان منه:
--       total_amount = total_before_tax * (1 + tax_rate/100)
--
--   الدالة create_purchase_order_manual تحسب الإجمالي من السطور وتخزّنه
--   عند الإنشاء فقط. لكن **لا يوجد أي محفّز** يعيد الحساب عند:
--       • إضافة سطر لاحقاً
--       • تعديل كمية أو سعر سطر
--       • حذف سطر
--
--   النتيجة المُثبَتة في الاختبار:
--       أمر شراء بسطر 100 × 800 = 80,000
--       total_amount = 0.00   ← الإجمالي صفر!
--
--   والأثر يتسلسل إلى تحليل الإنفاق:
--       collect_procurement_spend_transactions تقرأ po.total_amount
--       → كل معاملات الإنفاق بقيمة 0.00
--       → باريتو 80/20 بلا معنى
--       → تحليل الموردين وتركّز الإنفاق والتنبؤ كلها أصفار
--
--   أي أن الوحدة 07 كاملة تعطي أرقاماً صفرية رغم وجود مشتريات حقيقية.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الإصلاح:
--   محفّز على po_line_items (INSERT/UPDATE/DELETE) يعيد احتساب
--   total_before_tax من مجموع السطور، فيبقى الإجمالي صحيحاً دائماً
--   مهما كان مصدر التعديل (RPC أو تعديل مباشر أو استيراد).
--
--   + مزامنة لمرة واحدة للبيانات القائمة.
--   + View موحّد لتحليل الإنفاق حسب المورد.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) دالة المحفّز
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_sync_po_total_from_lines()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po_id UUID;
  v_total NUMERIC;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);
  IF v_po_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0)
    INTO v_total
  FROM public.po_line_items
  WHERE po_id = v_po_id;

  UPDATE public.purchase_orders
     SET total_before_tax = v_total
   WHERE id = v_po_id
     AND total_before_tax IS DISTINCT FROM v_total;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sync_po_total ON public.po_line_items;
CREATE TRIGGER trg_sync_po_total
AFTER INSERT OR UPDATE OF quantity, unit_price, po_id OR DELETE
ON public.po_line_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_po_total_from_lines();

-- ─────────────────────────────────────────────────────────────────────────
-- 2) مزامنة البيانات القائمة (لمرة واحدة)
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_orders po
   SET total_before_tax = calc.total
FROM (
  SELECT po_id, COALESCE(SUM(COALESCE(quantity,0) * COALESCE(unit_price,0)), 0) AS total
  FROM public.po_line_items
  GROUP BY po_id
) calc
WHERE po.id = calc.po_id
  AND po.total_before_tax IS DISTINCT FROM calc.total;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) تصحيح معاملات الإنفاق الصفرية المُجمَّعة سابقاً من أوامر الشراء
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.spend_transactions st
   SET amount = po.total_amount
FROM public.purchase_orders po
WHERE st.po_id = po.id
  AND st.source = 'po'
  AND COALESCE(st.amount, 0) = 0
  AND COALESCE(po.total_amount, 0) > 0;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) View: تحليل الإنفاق حسب المورد (تجميع موحّد للوحة التنفيذية)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.procurement_supplier_spend_analysis
WITH (security_invoker = true) AS
WITH totals AS (
  SELECT
    st.tenant_id,
    st.supplier_id,
    SUM(st.amount)::NUMERIC AS total_spend,
    COUNT(*)::BIGINT AS transaction_count,
    COUNT(*) FILTER (WHERE st.is_maverick)::BIGINT AS maverick_count,
    SUM(st.amount) FILTER (WHERE st.is_maverick)::NUMERIC AS maverick_spend,
    MIN(st.transaction_date) AS first_transaction,
    MAX(st.transaction_date) AS last_transaction
  FROM public.spend_transactions st
  WHERE st.tenant_id = public.current_user_tenant_id()
  GROUP BY st.tenant_id, st.supplier_id
),
grand AS (
  SELECT COALESCE(SUM(total_spend), 0) AS grand_total FROM totals
)
SELECT
  t.tenant_id,
  t.supplier_id,
  s.supplier_code,
  s.legal_name AS supplier_name,
  s.status AS supplier_status,
  t.total_spend,
  t.transaction_count,
  t.maverick_count,
  COALESCE(t.maverick_spend, 0)::NUMERIC AS maverick_spend,
  ROUND((t.total_spend / NULLIF(g.grand_total, 0) * 100)::NUMERIC, 2) AS spend_share_percent,
  ROUND(SUM(t.total_spend) OVER w / NULLIF(g.grand_total, 0) * 100, 2) AS cumulative_percent,
  -- تصنيف باريتو: يعتمد على النسبة التراكمية **قبل** إضافة المورد الحالي،
  -- حتى يُصنَّف أول مورد ضمن A حتى لو استحوذ وحده على أكثر من 80%.
  CASE
    WHEN COALESCE(
           (SUM(t.total_spend) OVER w - t.total_spend) / NULLIF(g.grand_total, 0) * 100, 0
         ) < 80 THEN 'A'
    WHEN COALESCE(
           (SUM(t.total_spend) OVER w - t.total_spend) / NULLIF(g.grand_total, 0) * 100, 0
         ) < 95 THEN 'B'
    ELSE 'C'
  END::TEXT AS pareto_class,
  t.first_transaction,
  t.last_transaction
FROM totals t
CROSS JOIN grand g
LEFT JOIN public.suppliers s ON s.id = t.supplier_id
WINDOW w AS (ORDER BY t.total_spend DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
ORDER BY t.total_spend DESC;
GRANT SELECT ON public.procurement_supplier_spend_analysis TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE v_bad BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.po_line_items'::regclass AND tgname = 'trg_sync_po_total'
  ) THEN
    RAISE EXCEPTION '0264 failed: PO total sync trigger missing';
  END IF;

  IF to_regclass('public.procurement_supplier_spend_analysis') IS NULL THEN
    RAISE EXCEPTION '0264 failed: supplier spend analysis view missing';
  END IF;

  -- تحقق: لا يبقى أمر شراء إجماليه مخالف لمجموع سطوره
  SELECT COUNT(*) INTO v_bad
  FROM public.purchase_orders po
  JOIN (
    SELECT po_id, COALESCE(SUM(COALESCE(quantity,0)*COALESCE(unit_price,0)),0) AS total
    FROM public.po_line_items GROUP BY po_id
  ) calc ON calc.po_id = po.id
  WHERE po.total_before_tax IS DISTINCT FROM calc.total;

  IF v_bad > 0 THEN
    RAISE EXCEPTION '0264 failed: % purchase order(s) still out of sync', v_bad;
  END IF;

  RAISE NOTICE '✅ 0264: PO total sync trigger + spend analysis applied';
END $$;
