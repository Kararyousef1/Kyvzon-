-- ============================================================================
-- 0258 — إصلاح خطأ وقت التنفيذ في calculate_kraljic
--
-- السبب الجذري:
--   الدالة في 0183 معلَّنة STABLE، لكنها تنفّذ:
--       UPDATE public.suppliers SET kraljic_category=...
--   وPostgreSQL يمنع الكتابة داخل دالة STABLE، فتفشل عند كل استدعاء:
--       ERROR: UPDATE is not allowed in a non-volatile function
--
-- لماذا لم تُكتشف؟
--   القيد يُفحص وقت التنفيذ لا وقت الإنشاء، فمرّت كل الفحوصات الثابتة
--   بينما تصنيف كراليتش معطّل كلياً في الواقع.
--
-- الأثر:
--   مصفوفة كراليتش (متطلب صريح في 03-supplier-onboarding-qualification.md)
--   لا تعمل إطلاقاً، ولا يُحدَّث عمود suppliers.kraljic_category أبداً.
--
-- الإصلاح:
--   إعلان الدالة VOLATILE (الافتراضي للدوال التي تكتب)، مع الإبقاء على
--   نفس التوقيع ونوع الإرجاع (TEXT) حتى لا يُكسر أي عقد قائم.
--   أُضيف كذلك تسجيل تدقيق للتغيير عند تبدّل التصنيف.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_kraljic(
  p_supplier_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE                                  -- ✅ الإصلاح: كانت STABLE مع UPDATE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_spend NUMERIC := 0;
  v_risk INT := 0;
  v_category TEXT;
  v_old TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND';
  END IF;

  SELECT COALESCE(SUM(pli.quantity * pli.estimated_unit_price), 0) INTO v_spend
  FROM public.purchase_requisitions pr
  JOIN public.pr_line_items pli ON pli.pr_id = pr.id
  WHERE pli.suggested_supplier_id = p_supplier_id
    AND pr.tenant_id = v_tenant
    AND pr.status IN ('approved', 'converted_to_po');

  SELECT COALESCE(risk_score, 0), kraljic_category
    INTO v_risk, v_old
  FROM public.suppliers
  WHERE id = p_supplier_id AND tenant_id = v_tenant;

  -- مصفوفة كراليتش: تأثير الإنفاق × درجة المخاطر
  IF v_spend > 500000 AND v_risk > 60 THEN
    v_category := 'strategic';
  ELSIF v_spend > 500000 AND v_risk <= 60 THEN
    v_category := 'leverage';
  ELSIF v_spend <= 500000 AND v_risk > 60 THEN
    v_category := 'bottleneck';
  ELSE
    v_category := 'routine';
  END IF;

  UPDATE public.suppliers
     SET kraljic_category = v_category, updated_at = NOW()
   WHERE id = p_supplier_id AND tenant_id = v_tenant;

  -- تسجيل التغيير في سجل تدقيق الموردين عند تبدّل التصنيف فعلياً
  IF v_old IS DISTINCT FROM v_category THEN
    BEGIN
      PERFORM public.log_supplier_audit(
        p_supplier_id,
        'kraljic_recalculated',
        'suppliers',
        p_supplier_id,
        jsonb_build_object('kraljic_category', v_old),
        jsonb_build_object('kraljic_category', v_category, 'spend', v_spend, 'risk_score', v_risk),
        'إعادة احتساب تصنيف كراليتش'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- التدقيق لا يجب أن يُفشل العملية الأساسية
    END;
  END IF;

  RETURN v_category;
END $$;

REVOKE ALL ON FUNCTION public.calculate_kraljic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_kraljic(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE v_volatile CHAR;
BEGIN
  SELECT provolatile INTO v_volatile FROM pg_proc WHERE oid = 'public.calculate_kraljic(uuid)'::regprocedure;
  IF v_volatile <> 'v' THEN
    RAISE EXCEPTION '0258 failed: calculate_kraljic must be VOLATILE (found %)', v_volatile;
  END IF;
  RAISE NOTICE '✅ 0258: calculate_kraljic volatility fixed';
END $$;
