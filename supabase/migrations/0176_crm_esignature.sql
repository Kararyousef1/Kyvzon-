-- ============================================================================
-- Kyvzon — 0176_crm_esignature.sql
-- توصيل التوقيع الإلكتروني عن بُعد (DocuSign) لعروض CRM.
--
-- السياق: crm_sign_quote (0168) يوقّع داخلياً (سجل قانوني: اسم/بريد/IP/وقت) —
--   يعمل بالكامل. هذا migration يضيف مسار التوقيع عن بُعد: يُرسل العرض للعميل
--   عبر DocuSign، يوقّعه العميل، ثم webhook يؤكّد → يُختم العرض signed + عقد.
--
-- التدفّق:
--   1) الواجهة تطلب إرسال للتوقيع → Edge Function (crm-send-signature) تُنشئ
--      DocuSign Envelope وتسجّل الطلب (crm_signature_requests) بحالة 'sent'.
--   2) العميل يوقّع على DocuSign.
--   3) DocuSign يستدعي webhook (crm-signature-webhook) → crm_confirm_signature
--      يضع الطلب 'completed' ويستدعي منطق التوقيع (يختم العرض ويُنشئ عقداً).
--
-- بلا مفاتيح DocuSign → التوقيع الداخلي (crm_sign_quote) يبقى متاحاً.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- (1) عمود مرجع الظرف (envelope) على العرض
ALTER TABLE public.crm_quotes
  ADD COLUMN IF NOT EXISTS signature_envelope_id TEXT;

-- (2) جدول طلبات التوقيع
CREATE TABLE IF NOT EXISTS public.crm_signature_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_id      UUID NOT NULL REFERENCES public.crm_quotes(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'docusign' CHECK (provider IN ('internal','docusign')),
  envelope_id   TEXT,                              -- DocuSign Envelope ID
  signer_name   TEXT,
  signer_email  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','delivered','completed','declined','voided')),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_sig_req_quote    ON public.crm_signature_requests(quote_id);
CREATE INDEX IF NOT EXISTS idx_crm_sig_req_envelope ON public.crm_signature_requests(envelope_id);
CREATE INDEX IF NOT EXISTS idx_crm_sig_req_tenant   ON public.crm_signature_requests(tenant_id, status);

-- (3) RLS
ALTER TABLE public.crm_signature_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_signature_requests_select ON public.crm_signature_requests;
CREATE POLICY crm_signature_requests_select ON public.crm_signature_requests
  FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());
DROP POLICY IF EXISTS crm_signature_requests_write ON public.crm_signature_requests;
CREATE POLICY crm_signature_requests_write ON public.crm_signature_requests
  FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- (4) تسجيل طلب توقيع (تُستدعى من Edge Function عند إنشاء الظرف)
CREATE OR REPLACE FUNCTION public.crm_record_signature_request(
  p_quote_id     UUID,
  p_envelope_id  TEXT,
  p_signer_name  TEXT,
  p_signer_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_req UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_quotes WHERE id = p_quote_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  INSERT INTO public.crm_signature_requests
    (tenant_id, quote_id, provider, envelope_id, signer_name, signer_email, status, created_by)
  VALUES (v_tenant, p_quote_id, 'docusign', p_envelope_id, p_signer_name, p_signer_email, 'sent', auth.uid())
  RETURNING id INTO v_req;

  UPDATE public.crm_quotes
    SET signature_envelope_id = p_envelope_id,
        status = CASE WHEN status IN ('draft','approved') THEN 'sent' ELSE status END,
        updated_at = NOW()
    WHERE id = p_quote_id;

  RETURN v_req;
END $$;

-- (5) تأكيد اكتمال التوقيع (تُستدعى من webhook عبر service role بعد تحقق التوقيع)
--     تختم العرض signed وتُنشئ عقداً (منطق مطابق لـ crm_sign_quote الداخلي).
CREATE OR REPLACE FUNCTION public.crm_confirm_signature(
  p_envelope_id TEXT,
  p_signer_ip   TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_quote UUID; v_account UUID; v_total NUMERIC; v_title TEXT;
  v_signer_name TEXT; v_signer_email TEXT; v_num TEXT; v_existing TEXT;
BEGIN
  SELECT tenant_id, quote_id, signer_name, signer_email
    INTO v_tenant, v_quote, v_signer_name, v_signer_email
  FROM public.crm_signature_requests WHERE envelope_id = p_envelope_id LIMIT 1;
  IF v_quote IS NULL THEN RETURN false; END IF;

  -- تحديث طلب التوقيع
  UPDATE public.crm_signature_requests
    SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE envelope_id = p_envelope_id;

  -- إن كان العرض موقّعاً مسبقاً، لا نُكرّر
  SELECT status INTO v_existing FROM public.crm_quotes WHERE id = v_quote;
  IF v_existing = 'signed' THEN RETURN true; END IF;

  SELECT account_id, total, title INTO v_account, v_total, v_title
  FROM public.crm_quotes WHERE id = v_quote;

  UPDATE public.crm_quotes
    SET status = 'signed', signed_at = NOW(),
        signer_name = v_signer_name, signer_email = v_signer_email, signer_ip = p_signer_ip,
        updated_at = NOW()
    WHERE id = v_quote;

  INSERT INTO public.crm_quote_events (tenant_id, quote_id, event_type, actor_email, actor_ip)
  VALUES (v_tenant, v_quote, 'signed', v_signer_email, p_signer_ip);

  -- إنشاء عقد
  v_num := 'CT-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(replace(v_quote::text,'-',''),1,6);
  INSERT INTO public.crm_contracts
    (tenant_id, contract_number, quote_id, account_id, title, status, total_value, annual_value, signed_at, start_date)
  VALUES (v_tenant, v_num, v_quote, v_account, v_title, 'signed', v_total, v_total, NOW(), CURRENT_DATE)
  ON CONFLICT (tenant_id, contract_number) DO NOTHING;

  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.crm_record_signature_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
-- confirm تُستدعى من service role فقط (webhook)

DO $$
BEGIN
  IF to_regclass('public.crm_signature_requests') IS NULL
     OR to_regprocedure('public.crm_record_signature_request(uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.crm_confirm_signature(text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: e-signature objects missing';
  END IF;
  RAISE NOTICE '✅ 0176: التوقيع الإلكتروني عن بُعد (DocuSign) جاهز';
END $$;

-- ============================================================================
-- نهاية 0176 — توصيل التوقيع الإلكتروني عن بُعد على مستوى المخطط.
-- ============================================================================
