-- ============================================================================
-- Kyvzon — 0178_tenant_provider_credentials.sql
-- النموذج (ب): مفاتيح مزوّدين خاصة بكل شركة (BYOK — Bring Your Own Keys).
--
-- الهدف: كل شركة مشتركة تُدخل مفاتيح مزوّديها الخاصة (Resend/Twilio/Stripe/...)
--   فترسل بهويتها، بفاتورتها، ومسؤوليتها — بدل مفتاح واحد للمنصة.
--
-- ⚠️ الأمان الحرج (متعدد الطبقات):
--   1) القيم السرّية (secret) في عمود منفصل بلا سياسة SELECT لدور authenticated
--      → المتصفح لا يقرأ المفاتيح إطلاقاً.
--   2) الواجهة تقرأ فقط "بيانات وصفية" (view آمن): is_configured + آخر 4 أحرف + الحالة.
--   3) الوسطاء (Edge Functions) يقرؤون السرّ بمفتاح service role فقط.
--   4) RLS: كل شركة ترى صفوفها فقط (tenant_id = current_user_tenant_id()).
--
-- جدول واحد موحّد يخدم كل القنوات (channel/provider). idempotent وآمن للإعادة.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) جدول بيانات اعتماد المزوّدين لكل شركة
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tenant_provider_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- القناة والمزوّد
  channel        TEXT NOT NULL CHECK (channel IN ('email','sms','payment','enrichment','streaming','esignature','social')),
  provider       TEXT NOT NULL,                       -- resend / twilio / stripe / clearbit / zoom / docusign / meta ...
  -- إعدادات غير سرّية (يمكن للواجهة قراءتها — مثل from_email, sender_id, account_id)
  config         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- القيمة السرّية (المفتاح) — تُقرأ فقط عبر service role
  secret_value   TEXT,
  -- بيانات وصفية آمنة للعرض
  last4          TEXT,                                -- آخر 4 أحرف من المفتاح (للتعرّف)
  is_active      BOOLEAN NOT NULL DEFAULT true,
  is_verified    BOOLEAN NOT NULL DEFAULT false,      -- نجح اختبار الاتصال؟
  verified_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel, provider)
);
CREATE INDEX IF NOT EXISTS idx_tpc_tenant ON public.tenant_provider_credentials(tenant_id, channel);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) الأمان: RLS — لا وصول مباشر لدور authenticated (لا قراءة/كتابة للجدول)
--  الجدول يحوي أسراراً؛ المتصفح لا يلمسه إطلاقاً. كل التعامل عبر دوال آمنة.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.tenant_provider_credentials ENABLE ROW LEVEL SECURITY;
-- (لا CREATE POLICY متعمّداً → حرمان كامل لدور authenticated من القراءة/الكتابة المباشرة)

-- ════════════════════════════════════════════════════════════════════════════
--  (3) عرض آمن (view) — الواجهة تقرأ منه: بلا secret_value إطلاقاً
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.tenant_provider_status
WITH (security_invoker = true) AS
SELECT
  id, tenant_id, channel, provider, config,
  (secret_value IS NOT NULL AND length(secret_value) > 0) AS is_configured,
  last4, is_active, is_verified, verified_at, updated_at
FROM public.tenant_provider_credentials;

-- منح الواجهة قراءة الحالة فقط (بلا السرّ) — RLS يُطبَّق عبر security_invoker
-- ملاحظة: view يرث عزل الجدول؛ نضيف سياسة قراءة على الجدول للأعمدة غير السرّية
-- عبر الـ view فقط. لكن بما أن الجدول محروم، نمنح SELECT على الـ view لدالة آمنة:
GRANT SELECT ON public.tenant_provider_status TO authenticated;

-- بما أن الـ view بـ security_invoker والجدول محروم لـ authenticated، نحتاج
-- دالة SECURITY DEFINER تُرجع الحالة الآمنة (بلا سرّ) مع فحص tenant.
CREATE OR REPLACE FUNCTION public.tenant_list_provider_status()
RETURNS TABLE (
  id UUID, channel TEXT, provider TEXT, config JSONB,
  is_configured BOOLEAN, last4 TEXT, is_active BOOLEAN, is_verified BOOLEAN, verified_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, channel, provider, config,
         (secret_value IS NOT NULL AND length(secret_value) > 0),
         last4, is_active, is_verified, verified_at, updated_at
  FROM public.tenant_provider_credentials
  WHERE tenant_id = public.current_user_tenant_id();
$$;
GRANT EXECUTE ON FUNCTION public.tenant_list_provider_status() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  (4) حفظ/تحديث مفتاح (من الواجهة) — يخزّن السرّ + يحسب last4، بلا إرجاع السرّ
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tenant_set_provider_credential(
  p_channel   TEXT,
  p_provider  TEXT,
  p_secret    TEXT,
  p_config    JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_id UUID; v_last4 TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_secret IS NULL OR length(trim(p_secret)) < 4 THEN RAISE EXCEPTION 'INVALID_SECRET'; END IF;

  v_last4 := right(p_secret, 4);

  INSERT INTO public.tenant_provider_credentials
    (tenant_id, channel, provider, secret_value, last4, config, is_verified, created_by)
  VALUES (v_tenant, p_channel, p_provider, p_secret, v_last4, COALESCE(p_config,'{}'::jsonb), false, auth.uid())
  ON CONFLICT (tenant_id, channel, provider) DO UPDATE
    SET secret_value = EXCLUDED.secret_value, last4 = EXCLUDED.last4,
        config = EXCLUDED.config, is_verified = false, is_active = true, updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;  -- نعيد المعرّف فقط، لا السرّ
END $$;
GRANT EXECUTE ON FUNCTION public.tenant_set_provider_credential(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  (5) حذف مفتاح (فكّ الربط)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tenant_delete_provider_credential(p_channel TEXT, p_provider TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  DELETE FROM public.tenant_provider_credentials
    WHERE tenant_id = v_tenant AND channel = p_channel AND provider = p_provider;
END $$;
GRANT EXECUTE ON FUNCTION public.tenant_delete_provider_credential(TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  (6) قراءة السرّ (للوسطاء فقط — service role) + تعليم كمُتحقَّق
--  لا تُمنح لـ authenticated. الوسيط يستدعيها بمفتاح الخدمة لجلب مفتاح الشركة.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_tenant_provider_secret(
  p_tenant_id UUID, p_channel TEXT, p_provider TEXT
)
RETURNS TABLE (secret_value TEXT, config JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT secret_value, config
  FROM public.tenant_provider_credentials
  WHERE tenant_id = p_tenant_id AND channel = p_channel AND provider = p_provider AND is_active = true
  LIMIT 1;
$$;
-- لا GRANT لـ authenticated — service role يتجاوز ذلك تلقائياً.
REVOKE ALL ON FUNCTION public.get_tenant_provider_secret(UUID, TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.mark_tenant_provider_verified(p_tenant_id UUID, p_channel TEXT, p_provider TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.tenant_provider_credentials
    SET is_verified = true, verified_at = NOW(), updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND channel = p_channel AND provider = p_provider;
$$;
REVOKE ALL ON FUNCTION public.mark_tenant_provider_verified(UUID, TEXT, TEXT) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) تأكيدات
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.tenant_provider_credentials') IS NULL
     OR to_regprocedure('public.tenant_set_provider_credential(text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.tenant_list_provider_status()') IS NULL
     OR to_regprocedure('public.get_tenant_provider_secret(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: tenant provider credentials objects missing';
  END IF;
  -- تأكيد أمني: لا سياسة قراءة/كتابة مباشرة لدور authenticated على الجدول
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenant_provider_credentials') THEN
    RAISE EXCEPTION 'SECURITY: tenant_provider_credentials must have NO direct policies (secrets protected)';
  END IF;
  RAISE NOTICE '✅ 0178: مفاتيح المزوّدين لكل شركة (BYOK) جاهزة — الأسرار محميّة بالكامل';
END $$;

-- ============================================================================
-- نهاية 0178 — الأساس المشترك لنموذج "كل شركة بمفتاحها" (يخدم كل القنوات).
-- ============================================================================
