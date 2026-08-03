-- ============================================================================
-- 0255 — إصلاح خطأ وقت التنفيذ في get_ap_aging (HTTP 400 في صفحة أعمار الذمم)
--
-- السبب الجذري:
--   public.accounts_payable.vendor_name أُنشئ في 0102_ap_ar_tables.sql بنوع
--   VARCHAR(200)، بينما 0138_finance_ap_aging_rpc.sql تعلن العمود المُرجَع
--   vendor_name بنوع TEXT. PostgreSQL يرفض ذلك وقت التنفيذ بالخطأ:
--     structure of query does not match function result type
--     DETAIL: Returned type character varying does not match expected type text
--   لذلك تفشل الدالة دائماً (حتى مع عدم وجود بيانات) و PostgREST يعيد 400.
--
-- الإصلاح:
--   1) تحويل صريح ::TEXT لكل الأعمدة النصية المُرجَعة.
--   2) تحويل صريح ::NUMERIC لكل الأعمدة الرقمية لتفادي أي انحراف نوعي مستقبلي.
--   3) تفضيل الاسم الرسمي من جدول vendors مع fallback إلى vendor_name القديم.
--   4) توحيد رسالة الصلاحية مع بقية وحدات المالية (NOT_AUTHORIZED_FOR_ENTITY).
--
-- ملاحظة: التوقيع لم يتغير، لذا CREATE OR REPLACE آمن ولا يكسر أي عقد قائم.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_ap_aging(
  p_legal_entity_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  vendor_id UUID,
  vendor_name TEXT,
  current_amount NUMERIC,
  days_1_30 NUMERIC,
  days_31_60 NUMERIC,
  days_61_90 NUMERIC,
  days_over_90 NUMERIC,
  total_outstanding NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of DATE := COALESCE(p_as_of_date, CURRENT_DATE);
BEGIN
  IF p_legal_entity_id IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_REQUIRED';
  END IF;
  IF NOT public.current_user_can_access_legal_entity(p_legal_entity_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY';
  END IF;

  RETURN QUERY
  SELECT
    i.vendor_id,
    COALESCE(v.name_ar, i.vendor_name, 'Unknown')::TEXT,
    COALESCE(SUM(CASE WHEN v_as_of - COALESCE(i.due_date, i.invoice_date) <= 0
                      THEN i.amount - i.amount_paid ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN v_as_of - COALESCE(i.due_date, i.invoice_date) BETWEEN 1 AND 30
                      THEN i.amount - i.amount_paid ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN v_as_of - COALESCE(i.due_date, i.invoice_date) BETWEEN 31 AND 60
                      THEN i.amount - i.amount_paid ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN v_as_of - COALESCE(i.due_date, i.invoice_date) BETWEEN 61 AND 90
                      THEN i.amount - i.amount_paid ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN v_as_of - COALESCE(i.due_date, i.invoice_date) > 90
                      THEN i.amount - i.amount_paid ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(i.amount - i.amount_paid), 0)::NUMERIC
  FROM public.accounts_payable i
  LEFT JOIN public.vendors v ON v.id = i.vendor_id
  WHERE i.legal_entity_id = p_legal_entity_id
    AND i.status IN ('approved', 'partially_paid', 'overdue')
  GROUP BY i.vendor_id, COALESCE(v.name_ar, i.vendor_name, 'Unknown')
  ORDER BY 8 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ap_aging(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ap_aging(UUID, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.get_ap_aging(uuid,date)') IS NULL THEN
    RAISE EXCEPTION '0255 failed: get_ap_aging is missing';
  END IF;
  RAISE NOTICE '✅ 0255: get_ap_aging type mismatch fixed';
END $$;
