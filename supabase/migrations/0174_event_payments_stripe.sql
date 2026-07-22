-- ============================================================================
-- Kyvzon — 0174_event_payments_stripe.sql
-- توصيل الدفع الحقيقي لتذاكر الفعاليات عبر Stripe.
--
-- السياق: تسجيل الفعالية (0161) يضع payment_status='pending' عند وجود سعر.
--   هذا migration يضيف طبقة تتبّع الدفع (event_payments) + عمود مرجع المزوّد
--   على التسجيل، ودالة تأكيد الدفع تُستدعى من webhook (service role).
--
-- التدفّق:
--   1) الواجهة تطلب جلسة دفع → Edge Function (event-create-payment) تُنشئ Stripe Checkout.
--   2) العميل يدفع على صفحة Stripe.
--   3) Stripe يستدعي webhook (event-payment-webhook) → يؤكّد الدفع →
--      crm/mkt_confirm_event_payment يضع payment_status='paid'.
--
-- بلا مفتاح Stripe → يبقى pending (توافق عكسي، لا يفشل شيء).
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- (1) عمود مرجع جلسة الدفع على التسجيل
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

-- (2) جدول تتبّع مدفوعات الفعاليات
CREATE TABLE IF NOT EXISTS public.event_payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  registration_id    UUID NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL DEFAULT 'stripe' CHECK (provider IN ('simulation','stripe')),
  provider_session_id TEXT,                     -- Stripe Checkout Session id
  provider_payment_id TEXT,                     -- Stripe PaymentIntent id
  amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'usd',
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed','refunded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_payments_reg     ON public.event_payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_session ON public.event_payments(provider_session_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_tenant  ON public.event_payments(tenant_id, status);

-- (3) RLS
ALTER TABLE public.event_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_payments_select ON public.event_payments;
CREATE POLICY event_payments_select ON public.event_payments
  FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());
DROP POLICY IF EXISTS event_payments_write ON public.event_payments;
CREATE POLICY event_payments_write ON public.event_payments
  FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- (4) تسجيل نية دفع (تُستدعى من Edge Function عند إنشاء جلسة Checkout)
CREATE OR REPLACE FUNCTION public.mkt_record_event_payment_intent(
  p_registration_id UUID,
  p_session_id      TEXT,
  p_amount          NUMERIC,
  p_currency        TEXT DEFAULT 'usd'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_pay UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.event_registrations WHERE id = p_registration_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  INSERT INTO public.event_payments (tenant_id, registration_id, provider, provider_session_id, amount, currency, status)
  VALUES (v_tenant, p_registration_id, 'stripe', p_session_id, p_amount, p_currency, 'pending')
  RETURNING id INTO v_pay;

  UPDATE public.event_registrations
    SET provider_payment_id = p_session_id, updated_at = NOW()
    WHERE id = p_registration_id;

  RETURN v_pay;
END $$;

-- (5) تأكيد الدفع (تُستدعى من webhook عبر service role — بلا فحص tenant لأن المصدر Stripe موثّق بالتوقيع)
CREATE OR REPLACE FUNCTION public.mkt_confirm_event_payment(
  p_session_id       TEXT,
  p_payment_intent   TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_reg UUID; v_amount NUMERIC;
BEGIN
  SELECT registration_id, amount INTO v_reg, v_amount
  FROM public.event_payments WHERE provider_session_id = p_session_id LIMIT 1;
  IF v_reg IS NULL THEN RETURN false; END IF;

  UPDATE public.event_payments
    SET status = 'paid', provider_payment_id = COALESCE(p_payment_intent, provider_payment_id), updated_at = NOW()
    WHERE provider_session_id = p_session_id;

  UPDATE public.event_registrations
    SET payment_status = 'paid', amount_paid = COALESCE(v_amount, amount_paid), updated_at = NOW()
    WHERE id = v_reg;

  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.mkt_record_event_payment_intent(UUID, TEXT, NUMERIC, TEXT) TO authenticated;
-- confirm تُستدعى من service role فقط (webhook) — لا نمنحها لـ authenticated

DO $$
BEGIN
  IF to_regclass('public.event_payments') IS NULL
     OR to_regprocedure('public.mkt_record_event_payment_intent(uuid,text,numeric,text)') IS NULL
     OR to_regprocedure('public.mkt_confirm_event_payment(text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: event payments objects missing';
  END IF;
  RAISE NOTICE '✅ 0174: دفع الفعاليات (Stripe) جاهز (event_payments + intent/confirm)';
END $$;

-- ============================================================================
-- نهاية 0174 — توصيل دفع تذاكر الفعاليات (Stripe) على مستوى المخطط.
-- ============================================================================
