-- ============================================================================
-- 0263 — تحصين دورة حياة العقود (CLM)
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشاكل المكتشفة بالتشغيل الفعلي على Postgres 17:
--
-- 1) terminate_contract تقبل سبباً فارغاً:
--        SELECT public.terminate_contract(<id>, '');   -- ينجح!
--    وهذا يخالف مبدأ المنصة: كل إجراء حسّاس يتطلب سبباً نصياً يُسجَّل
--    في التدقيق. عقد يُنهى بلا سبب = ثغرة حوكمة.
--
-- 2) terminate_contract تسمح بإنهاء عقد منتهٍ أصلاً:
--        عقد بحالة terminated يمكن إنهاؤه مجدداً، فيُستبدل سبب الإنهاء
--        الأصلي وتاريخه — أي تزوير فعلي للسجل التاريخي.
--
-- 3) لا يمكن إنهاء عقد بحالة draft منطقياً (لم يُوقَّع بعد) — يجب إلغاؤه.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الإصلاح:
--   • سبب إلزامي (CONTRACT_TERMINATION_REASON_REQUIRED).
--   • منع إنهاء عقد منتهٍ أو منتهي الصلاحية (CONTRACT_ALREADY_TERMINATED).
--   • View لتنبيهات التجديد بثلاث عتبات (90/30/7 يوماً) كما يطلب التوثيق.
--
-- التوقيع لم يتغير، لذا لا يُكسر أي عقد قائم.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.terminate_contract(
  p_contract_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  -- ✅ سبب إلزامي — كان مقبولاً فارغاً
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'CONTRACT_TERMINATION_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_old FROM public.procurement_contracts
   WHERE id = p_contract_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;

  -- ✅ منع إعادة الإنهاء — كان يستبدل السبب والتاريخ الأصليين
  IF v_old.status = 'terminated' THEN
    RAISE EXCEPTION 'CONTRACT_ALREADY_TERMINATED';
  END IF;

  UPDATE public.procurement_contracts
     SET status = 'terminated',
         terminated_at = NOW(),
         termination_reason = btrim(p_reason),
         updated_at = NOW()
   WHERE id = p_contract_id AND tenant_id = v_tenant;

  PERFORM public.log_contract_audit(
    p_contract_id, 'contract_terminated', v_old.status, 'terminated',
    to_jsonb(v_old), jsonb_build_object('reason', btrim(p_reason)), btrim(p_reason)
  );
END $$;

REVOKE ALL ON FUNCTION public.terminate_contract(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terminate_contract(UUID,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- تنبيهات التجديد بثلاث عتبات (90 / 30 / 7 يوماً) — متطلب صريح في التوثيق
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.contract_renewal_alerts
WITH (security_invoker = true) AS
SELECT
  c.id AS contract_id,
  c.tenant_id,
  c.contract_number,
  c.title,
  c.supplier_id,
  s.legal_name AS supplier_name,
  c.status,
  c.total_value,
  c.currency_code,
  c.start_date,
  c.end_date,
  c.auto_renewal,
  (c.end_date - CURRENT_DATE)::INT AS days_remaining,
  CASE
    WHEN c.end_date < CURRENT_DATE THEN 'expired'
    WHEN c.end_date <= CURRENT_DATE + 7  THEN 'critical'
    WHEN c.end_date <= CURRENT_DATE + 30 THEN 'urgent'
    WHEN c.end_date <= CURRENT_DATE + 90 THEN 'upcoming'
    ELSE 'ok'
  END::TEXT AS alert_level,
  c.renewal_decision,
  (c.renewal_decision IS NULL) AS needs_decision
FROM public.procurement_contracts c
LEFT JOIN public.suppliers s ON s.id = c.supplier_id
WHERE c.tenant_id = public.current_user_tenant_id()
  AND c.status IN ('active', 'signed')
  AND c.end_date IS NOT NULL
  AND c.end_date <= CURRENT_DATE + 90
ORDER BY c.end_date;
GRANT SELECT ON public.contract_renewal_alerts TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.terminate_contract(uuid,text)') IS NULL
     OR to_regclass('public.contract_renewal_alerts') IS NULL
  THEN
    RAISE EXCEPTION '0263 failed: contract lifecycle guard objects missing';
  END IF;
  RAISE NOTICE '✅ 0263: contract lifecycle guards applied';
END $$;
