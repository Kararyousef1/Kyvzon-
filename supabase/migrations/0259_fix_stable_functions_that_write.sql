-- ============================================================================
-- 0259 — إصلاح دوال معلَّنة STABLE بينما تنفّذ كتابة
--
-- الخلفية:
--   بعد اكتشاف نفس العلة في calculate_kraljic (المايجريشن 0258)، أُجري مسح
--   منهجي على كل دوال المخطط بحثاً عن:
--       provolatile IN ('s','i')  AND  prosrc يحوي INSERT/UPDATE/DELETE
--   فظهرت دالتان إضافيتان بنفس الفصيلة.
--
-- القاعدة في PostgreSQL:
--   الدوال STABLE/IMMUTABLE ممنوعة من تعديل البيانات، والخطأ يقع
--   **وقت التنفيذ** لا وقت الإنشاء:
--       ERROR: UPDATE is not allowed in a non-volatile function
--   لذلك لا يكشفها أي فحص ثابت.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1) calculate_supplier_otif
--    خطورة خاصة: تبدأ بـ `IF v_total=0 THEN RETURN 0; END IF;` فتخرج قبل
--    الوصول إلى UPDATE عندما لا توجد أوامر شراء. لذلك تنجح في البيئات
--    الفارغة وتفشل فور وجود بيانات حقيقية — أسوأ أنواع الأعطال.
--
-- 2) forecast_spend
--    تكتب في spend_forecasts وهي معلَّنة STABLE.
--
-- الإصلاح: إعلانهما VOLATILE مع الإبقاء على التوقيع ونوع الإرجاع تماماً.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) calculate_supplier_otif — النسخة النهائية (من 0191) مع VOLATILE
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_supplier_otif(
  p_supplier_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
VOLATILE                                  -- ✅ كانت STABLE مع UPDATE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_total INT;
  v_on_time INT;
  v_otif NUMERIC;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, false);

  SELECT COUNT(*) INTO v_total
  FROM public.purchase_orders
  WHERE supplier_id = p_supplier_id AND tenant_id = v_tenant;

  SELECT COUNT(*) INTO v_on_time
  FROM public.purchase_orders
  WHERE supplier_id = p_supplier_id
    AND tenant_id = v_tenant
    AND status = 'received'
    AND delivery_date >= CURRENT_DATE - INTERVAL '30 days';

  IF v_total = 0 THEN RETURN 0; END IF;
  v_otif := v_on_time::NUMERIC / v_total * 100;

  UPDATE public.supplier_spend_summary
     SET otif_score = v_otif, last_calculated_at = NOW()
   WHERE supplier_id = p_supplier_id AND tenant_id = v_tenant;

  RETURN v_otif;
END $$;

REVOKE ALL ON FUNCTION public.calculate_supplier_otif(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_supplier_otif(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) forecast_spend — النسخة القديمة ذات 3 معاملات (tenant, period, category)
--    معلَّنة STABLE بينما تكتب في spend_forecasts.
--    ملاحظة: توجد نسخة أحدث بمعاملين (period, category) وهي VOLATILE بالفعل.
--    نُبقي النسخة القديمة للتوافق الخلفي لكن نُصلح تقلّبيتها.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forecast_spend(
  p_tenant_id UUID,
  p_period TEXT,
  p_category_code TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
VOLATILE                                  -- ✅ كانت STABLE مع INSERT
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC;
  v_forecast NUMERIC;
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  -- لا نثق بالـ tenant الممرَّر: نستخدم سياق المستخدم الحالي (نفس نهج 0198)
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT AVG(amount) INTO v_avg
  FROM public.spend_transactions
  WHERE tenant_id = v_tenant
    AND (p_category_code IS NULL OR category_code = p_category_code)
    AND transaction_date >= CURRENT_DATE - INTERVAL '12 months';

  -- اتجاه بسيط: +8% عن العام السابق (كما في التقرير 07)
  v_forecast := COALESCE(v_avg, 0) * 1.08;

  INSERT INTO public.spend_forecasts
    (tenant_id, period, category_code, forecasted_amount, method)
  VALUES
    (v_tenant, p_period, p_category_code, v_forecast, 'trend')
  ON CONFLICT (tenant_id, period, category_code)
  DO UPDATE SET forecasted_amount = EXCLUDED.forecasted_amount, method = 'trend';

  RETURN v_forecast;
END $$;

REVOKE ALL ON FUNCTION public.forecast_spend(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forecast_spend(UUID,TEXT,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- تحقق نهائي: لا تبقى أي دالة STABLE/IMMUTABLE تكتب
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad TEXT;
  v_count INT;
BEGIN
  SELECT COUNT(*), string_agg(p.proname, ', ')
    INTO v_count, v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.provolatile IN ('s','i')
    AND p.prosrc ~* '(^|[^a-z_])(insert into|update |delete from)';

  IF v_count > 0 THEN
    RAISE EXCEPTION '0259 failed: still % non-volatile function(s) performing writes: %', v_count, v_bad;
  END IF;

  RAISE NOTICE '✅ 0259: all write-performing functions are VOLATILE';
END $$;
