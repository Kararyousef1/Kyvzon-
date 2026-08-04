-- ============================================================================
-- 0269 — قواعد المزاد حسب النوع (British / Japanese / Dutch)
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقصان المكتشفان بالتشغيل الفعلي على Postgres 17 محلي:
--
-- (أ) starting_price غير مفروض إطلاقاً — ثغرة تجارية حقيقية:
--       مزاد عكسي، starting_price = 50,000
--       SELECT place_auction_bid(<british>, <supplier>, 55000);
--       →  is_new_best = t , current_best = 55000
--     أي أن العمود يُخزَّن ولا يُستخدم؛ يمكن تسجيل عرض أعلى من السقف
--     المعلن ويصبح "الأفضل"، فتُحتسب وفورات سالبة وتُمنح ترسية خاطئة.
--     في SAP Ariba (Reverse English) السقف يُسمّى price ceiling ولا يجوز
--     للمورد تجاوزه.
--
-- (ب) منطق British مفروض على الأنواع الثلاثة:
--       مزاد japanese، عرضان متتاليان بنفس السعر 48,000
--       →  ERROR: BID_MUST_BE_LOWER_THAN_CURRENT (current=48000.00)
--     العمود auction_type مُقيَّد بـ CHECK ويُخزَّن، لكن الدالة تتجاهله.
--     أي أن نوعين من الثلاثة معطّلان عملياً.
--
-- القواعد الصحيحة المطبَّقة (مرجع: SAP Ariba Sourcing، Wikipedia
-- Reverse auction، أدلة e-sourcing):
--
--   british (Reverse English)
--     • سقف = starting_price، لا يجوز تجاوزه.
--     • كل عرض جديد يجب أن يكون أقل من الأفضل الحالي (تنافس هابط).
--
--   japanese (Reverse Japanese)
--     • النظام يعلن مستويات سعرية هابطة؛ المورد "يقبل" المستوى أو ينسحب.
--     • القبول عند نفس السعر مسموح (عدة موردين يقبلون نفس المستوى).
--     • يُمنع القبول بسعر أعلى من الأفضل الحالي (تراجع للخلف).
--     • من انسحب لا يعود — يُنفَّذ عبر auction_participant_status.
--
--   dutch (Reverse Dutch)
--     • السعر يرتفع تدريجياً من نقطة منخفضة حتى يقبله أول مورد.
--     • أول قبول ينهي المزاد فوراً (status → ended) — لا مزايدة بعده.
--     • السقف = starting_price بوصفه أقصى ما يدفعه المشتري.
--
-- لا حذف ولا تغيير لبيانات قائمة — إضافة جدول حالة مشاركة + استبدال
-- الدالة بمنطق واعٍ بالنوع.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) حالة مشاركة المورد — يحتاجها المزاد الياباني (انسحاب نهائي)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auction_participant_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auction_id UUID NOT NULL REFERENCES public.procurement_auctions(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  withdrawn_at TIMESTAMPTZ,
  withdrawal_reason TEXT,
  last_accepted_price NUMERIC(16,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auction_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_auction_participant_auction
  ON public.auction_participant_status(auction_id, status);

ALTER TABLE public.auction_participant_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auction_participant_status_select ON public.auction_participant_status;
DROP POLICY IF EXISTS auction_participant_status_write ON public.auction_participant_status;
CREATE POLICY auction_participant_status_select ON public.auction_participant_status
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
     AND (public.current_user_is_staff()
          OR public.current_user_role() IN ('procurement','admin','manager')));
CREATE POLICY auction_participant_status_write ON public.auction_participant_status
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
     AND (public.current_user_is_staff()
          OR public.current_user_role() IN ('procurement','admin')))
  WITH CHECK (tenant_id = public.current_user_tenant_id()
     AND (public.current_user_is_staff()
          OR public.current_user_role() IN ('procurement','admin')));

-- ─────────────────────────────────────────────────────────────────────────
-- 2) الدالة الرئيسية — واعية بنوع المزاد
--    التوقيع محفوظ كما هو (UUID,UUID,NUMERIC) حتى لا ينكسر SDK/الواجهة،
--    مع إضافة عمودَي إخراج: auction_closed و rule_applied.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.place_auction_bid(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_auction_id UUID,
  p_supplier_id UUID,
  p_bid_price NUMERIC
)
RETURNS TABLE (
  is_new_best BOOLEAN,
  current_best NUMERIC,
  extended BOOLEAN,
  auction_closed BOOLEAN,
  rule_applied TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_auction RECORD;
  v_participant RECORD;
  v_is_best BOOLEAN := false;
  v_extended BOOLEAN := false;
  v_closed BOOLEAN := false;
  v_new_best NUMERIC;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_bid_price IS NULL OR p_bid_price <= 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  PERFORM public.procurement_assert_auction_in_tenant(p_auction_id);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, true);

  SELECT * INTO v_auction
    FROM public.procurement_auctions
   WHERE id = p_auction_id AND tenant_id = v_tenant
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUCTION_NOT_FOUND'; END IF;
  IF v_auction.status <> 'live' THEN RAISE EXCEPTION 'AUCTION_NOT_LIVE'; END IF;
  IF NOW() > v_auction.end_time THEN RAISE EXCEPTION 'AUCTION_ENDED'; END IF;

  -- سقف السعر: يسري على كل الأنواع. كان غائباً تماماً قبل 0269.
  IF v_auction.starting_price IS NOT NULL AND p_bid_price > v_auction.starting_price THEN
    RAISE EXCEPTION 'BID_ABOVE_CEILING (ceiling=%, bid=%)',
      v_auction.starting_price, p_bid_price;
  END IF;

  -- حالة المشاركة (يُنشأ صف عند أول تفاعل)
  SELECT * INTO v_participant
    FROM public.auction_participant_status
   WHERE auction_id = p_auction_id AND supplier_id = p_supplier_id
     FOR UPDATE;

  IF FOUND AND v_participant.status = 'withdrawn' THEN
    RAISE EXCEPTION 'SUPPLIER_WITHDRAWN_FROM_AUCTION';
  END IF;

  -- ── القواعد حسب النوع ────────────────────────────────────────────────
  IF v_auction.auction_type = 'british' THEN
    -- تنافس هابط صارم
    IF v_auction.current_best_price IS NOT NULL
       AND p_bid_price >= v_auction.current_best_price THEN
      RAISE EXCEPTION 'BID_MUST_BE_LOWER_THAN_CURRENT (current=%)',
        v_auction.current_best_price;
    END IF;
    v_is_best := true;

  ELSIF v_auction.auction_type = 'japanese' THEN
    -- قبول مستوى سعري: نفس السعر مسموح، الأعلى ممنوع
    IF v_auction.current_best_price IS NOT NULL
       AND p_bid_price > v_auction.current_best_price THEN
      RAISE EXCEPTION 'JAPANESE_CANNOT_ACCEPT_HIGHER_LEVEL (current=%)',
        v_auction.current_best_price;
    END IF;
    v_is_best := (v_auction.current_best_price IS NULL
                  OR p_bid_price < v_auction.current_best_price);

  ELSIF v_auction.auction_type = 'dutch' THEN
    -- أول قبول يفوز وينهي المزاد
    IF v_auction.current_best_supplier_id IS NOT NULL THEN
      RAISE EXCEPTION 'DUTCH_AUCTION_ALREADY_ACCEPTED';
    END IF;
    v_is_best := true;
    v_closed  := true;

  ELSE
    RAISE EXCEPTION 'UNKNOWN_AUCTION_TYPE (%)', v_auction.auction_type;
  END IF;

  -- تسجيل العرض
  INSERT INTO public.auction_bids (tenant_id, auction_id, supplier_id, bid_price)
  VALUES (v_tenant, p_auction_id, p_supplier_id, p_bid_price);

  INSERT INTO public.auction_participant_status
    (tenant_id, auction_id, supplier_id, status, last_accepted_price)
  VALUES (v_tenant, p_auction_id, p_supplier_id, 'active', p_bid_price)
  ON CONFLICT (auction_id, supplier_id)
  DO UPDATE SET last_accepted_price = EXCLUDED.last_accepted_price;

  -- التمديد التلقائي ضد القنص — لا معنى له في الهولندي لأنه ينتهي فوراً
  IF NOT v_closed
     AND v_auction.extension_minutes IS NOT NULL
     AND v_auction.end_time - NOW() < (v_auction.extension_minutes || ' minutes')::INTERVAL THEN
    UPDATE public.procurement_auctions
       SET end_time = end_time + (v_auction.extension_minutes || ' minutes')::INTERVAL
     WHERE id = p_auction_id;
    v_extended := true;
  END IF;

  -- الأفضل الحالي: في الياباني لا نرفع السعر للخلف
  v_new_best := CASE
    WHEN v_is_best THEN p_bid_price
    ELSE LEAST(v_auction.current_best_price, p_bid_price)
  END;

  UPDATE public.procurement_auctions
     SET current_best_price       = v_new_best,
         current_best_supplier_id = CASE WHEN v_is_best
                                         THEN p_supplier_id
                                         ELSE current_best_supplier_id END,
         status                   = CASE WHEN v_closed THEN 'ended' ELSE status END
   WHERE id = p_auction_id;

  RETURN QUERY SELECT v_is_best, v_new_best, v_extended, v_closed,
                      v_auction.auction_type::TEXT;
END $$;

REVOKE ALL ON FUNCTION public.place_auction_bid(UUID,UUID,NUMERIC) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon عبر ALTER DEFAULT PRIVILEGES،
-- و REVOKE FROM PUBLIC لا يسحب منحة صريحة. الدالة محمية داخلياً بـ
-- procurement_require_roles (NO_AUTH)، وهذا سحب دفاعٍ بالعمق للزوار.
REVOKE ALL ON FUNCTION public.place_auction_bid(UUID,UUID,NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_auction_bid(UUID,UUID,NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) انسحاب المورد — ركن المزاد الياباني، لم يكن موجوداً
--    سبب نصي إلزامي (سياسة المنصة: كل تغيير حالة يحتاج سبباً مُدقَّقاً).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.withdraw_from_auction(
  p_auction_id UUID,
  p_supplier_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_auction RECORD;
  v_active_count INTEGER;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'WITHDRAWAL_REASON_REQUIRED';
  END IF;
  PERFORM public.procurement_assert_auction_in_tenant(p_auction_id);

  SELECT * INTO v_auction
    FROM public.procurement_auctions
   WHERE id = p_auction_id AND tenant_id = v_tenant
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUCTION_NOT_FOUND'; END IF;
  IF v_auction.status <> 'live' THEN RAISE EXCEPTION 'AUCTION_NOT_LIVE'; END IF;

  INSERT INTO public.auction_participant_status
    (tenant_id, auction_id, supplier_id, status, withdrawn_at, withdrawal_reason)
  VALUES (v_tenant, p_auction_id, p_supplier_id, 'withdrawn', NOW(), trim(p_reason))
  ON CONFLICT (auction_id, supplier_id)
  DO UPDATE SET status = 'withdrawn',
                withdrawn_at = NOW(),
                withdrawal_reason = trim(p_reason);

  -- في الياباني: بقاء مورد واحد فقط ينهي المزاد
  IF v_auction.auction_type = 'japanese' THEN
    SELECT COUNT(*) INTO v_active_count
      FROM public.auction_participant_status
     WHERE auction_id = p_auction_id AND status = 'active';

    IF v_active_count <= 1 THEN
      UPDATE public.procurement_auctions
         SET status = 'ended'
       WHERE id = p_auction_id;
      RETURN true;   -- أُغلق المزاد
    END IF;
  END IF;

  RETURN false;      -- المزاد مستمر
END $$;

REVOKE ALL ON FUNCTION public.withdraw_from_auction(UUID,UUID,TEXT) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon عبر ALTER DEFAULT PRIVILEGES،
-- و REVOKE FROM PUBLIC لا يسحب منحة صريحة. الدالة محمية داخلياً بـ
-- procurement_require_roles (NO_AUTH)، وهذا سحب دفاعٍ بالعمق للزوار.
REVOKE ALL ON FUNCTION public.withdraw_from_auction(UUID,UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_from_auction(UUID,UUID,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) View: حالة المزاد الحية مع الوفورات المحسوبة من السقف الصحيح
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.auction_live_status
WITH (security_invoker = true) AS
SELECT
  a.id AS auction_id,
  a.tenant_id,
  a.auction_number,
  a.item_description,
  a.auction_type,
  a.status,
  a.starting_price,
  a.current_best_price,
  a.current_best_supplier_id,
  s.legal_name AS current_best_supplier_name,
  a.start_time,
  a.end_time,
  GREATEST(0, COALESCE(a.starting_price, 0) - COALESCE(a.current_best_price, a.starting_price, 0))
    AS savings_amount,
  CASE
    WHEN COALESCE(a.starting_price, 0) > 0
    THEN ROUND(
      (COALESCE(a.starting_price, 0) - COALESCE(a.current_best_price, a.starting_price, 0))
      / a.starting_price * 100, 2)
    ELSE 0
  END AS savings_percent,
  (SELECT COUNT(*) FROM public.auction_bids b WHERE b.auction_id = a.id) AS total_bids,
  (SELECT COUNT(*) FROM public.auction_participant_status p
    WHERE p.auction_id = a.id AND p.status = 'active') AS active_participants,
  (SELECT COUNT(*) FROM public.auction_participant_status p
    WHERE p.auction_id = a.id AND p.status = 'withdrawn') AS withdrawn_participants
FROM public.procurement_auctions a
LEFT JOIN public.suppliers s ON s.id = a.current_best_supplier_id
WHERE a.tenant_id = public.current_user_tenant_id();

GRANT SELECT ON public.auction_live_status TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) تأكيدات
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.auction_participant_status') IS NULL THEN
    RAISE EXCEPTION '0269 failed: auction_participant_status missing';
  END IF;
  IF to_regprocedure('public.place_auction_bid(uuid,uuid,numeric)') IS NULL THEN
    RAISE EXCEPTION '0269 failed: place_auction_bid missing';
  END IF;
  IF to_regprocedure('public.withdraw_from_auction(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0269 failed: withdraw_from_auction missing';
  END IF;
  IF to_regclass('public.auction_live_status') IS NULL THEN
    RAISE EXCEPTION '0269 failed: auction_live_status view missing';
  END IF;

  -- الزائر غير المسجَّل لا يزايد ولا ينسحب (دفاع بالعمق فوق NO_AUTH)
  IF has_function_privilege('anon', 'public.place_auction_bid(uuid,uuid,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.withdraw_from_auction(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0269 failed: anon must not execute auction functions';
  END IF;

  -- والموظف المسجَّل يجب أن يقدر (وإلا تعطّلت الواجهة)
  IF NOT has_function_privilege('authenticated', 'public.place_auction_bid(uuid,uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION '0269 failed: authenticated must be able to place bids';
  END IF;
  RAISE NOTICE '✅ 0269: auction type-specific rules applied';
END $$;
