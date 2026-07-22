-- ============================================================================
-- Kyvzon — 0177_oauth_integrations.sql
-- توصيل تكاملات OAuth: التواصل الاجتماعي (Meta/LinkedIn/X) + Gmail (auto-logging).
--
-- السياق: social_accounts (0158) به connection_mode='simulation'. هذا migration
--   يضيف خزنة رموز OAuth آمنة + حالة مزامنة البريد + دوال ربط/فكّ الربط.
--
-- ⚠️ الأمان الحرج: رموز OAuth (access/refresh tokens) سرّية جداً — لا يجوز أن
--   يقرأها المتصفح إطلاقاً. لذلك جدول الرموز:
--     • RLS مفعّل، لكن بلا سياسة SELECT لدور authenticated (المتصفح لا يقرأه).
--     • تُكتب/تُقرأ فقط عبر Edge Functions بمفتاح service role.
--   الواجهة ترى فقط حالة الربط (is_connected) من social_accounts، لا الرموز.
--
-- التفعيل الحقيقي يتطلب تسجيل تطبيق ومراجعة من Meta/Google/LinkedIn/X.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) خزنة رموز OAuth — Social OAuth Tokens (سرّية — بلا وصول للمتصفح)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.social_oauth_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id     UUID REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL CHECK (provider IN ('facebook','instagram','linkedin','x','tiktok','google')),
  access_token   TEXT NOT NULL,
  refresh_token  TEXT,
  scope          TEXT,
  expires_at     TIMESTAMPTZ,
  external_id    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_tokens_tenant  ON public.social_oauth_tokens(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_social_tokens_account ON public.social_oauth_tokens(account_id);

-- RLS: مفعّل، لكن لا سياسة SELECT/WRITE لدور authenticated → المتصفح لا يصله إطلاقاً.
-- Edge Functions (service role) تتجاوز RLS. هذا يمنع تسريب الرموز نهائياً.
ALTER TABLE public.social_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- (لا CREATE POLICY متعمّداً — الحرمان الكامل لدور authenticated)

-- ════════════════════════════════════════════════════════════════════════════
--  (2) حالة مزامنة البريد — Email Sync State (Gmail/Outlook auto-logging لـ CRM)
--  الرموز نفسها في جدول منفصل سرّي (crm_email_oauth_tokens أدناه).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_email_sync_state (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail','outlook')),
  email_address  TEXT,
  is_connected   BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  history_id     TEXT,                         -- Gmail historyId لمزامنة تزايدية
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_email_sync_tenant ON public.crm_email_sync_state(tenant_id, user_id);

-- الواجهة ترى حالة الاتصال فقط (لا الرموز)
ALTER TABLE public.crm_email_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_email_sync_select ON public.crm_email_sync_state;
CREATE POLICY crm_email_sync_select ON public.crm_email_sync_state
  FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());
-- الكتابة عبر service role فقط (Edge Functions) — لا سياسة WRITE لـ authenticated

-- خزنة رموز البريد (سرّية — بلا وصول للمتصفح، مثل social_oauth_tokens)
CREATE TABLE IF NOT EXISTS public.crm_email_oauth_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail','outlook')),
  access_token   TEXT NOT NULL,
  refresh_token  TEXT,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.crm_email_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- (لا سياسات — حرمان كامل لدور authenticated؛ Edge Functions فقط)

-- ════════════════════════════════════════════════════════════════════════════
--  (3) تخزين رموز OAuth الاجتماعي (تُستدعى من Edge Function callback عبر service role)
--  تحدّث social_accounts.is_connected = true وتربط الرمز.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.store_social_oauth_token(
  p_tenant_id     UUID,
  p_provider      TEXT,
  p_account_name  TEXT,
  p_account_handle TEXT,
  p_external_id   TEXT,
  p_access_token  TEXT,
  p_refresh_token TEXT,
  p_scope         TEXT,
  p_expires_at    TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_account UUID; v_token UUID;
BEGIN
  -- إنشاء/تحديث الحساب الاجتماعي
  INSERT INTO public.social_accounts (tenant_id, platform, account_name, account_handle, is_connected, connection_mode, external_id, connected_at)
  VALUES (p_tenant_id, p_provider, p_account_name, p_account_handle, true, 'oauth', p_external_id, NOW())
  ON CONFLICT (tenant_id, platform, account_handle) DO UPDATE
    SET is_connected = true, connection_mode = 'oauth', external_id = EXCLUDED.external_id, connected_at = NOW(), updated_at = NOW()
  RETURNING id INTO v_account;

  -- تخزين/تحديث الرمز
  INSERT INTO public.social_oauth_tokens (tenant_id, account_id, provider, access_token, refresh_token, scope, expires_at, external_id)
  VALUES (p_tenant_id, v_account, p_provider, p_access_token, p_refresh_token, p_scope, p_expires_at, p_external_id)
  RETURNING id INTO v_token;

  RETURN v_account;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (4) فكّ ربط حساب اجتماعي (يحذف الرمز ويعلّم الحساب غير متصل)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.disconnect_social_account(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.social_accounts WHERE id = p_account_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  DELETE FROM public.social_oauth_tokens WHERE account_id = p_account_id;
  UPDATE public.social_accounts
    SET is_connected = false, connection_mode = 'simulation', connected_at = NULL, updated_at = NOW()
    WHERE id = p_account_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (5) تسجيل ربط البريد (تُستدعى من Gmail OAuth callback عبر service role)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.store_email_oauth_token(
  p_tenant_id     UUID,
  p_user_id       UUID,
  p_provider      TEXT,
  p_email_address TEXT,
  p_access_token  TEXT,
  p_refresh_token TEXT,
  p_expires_at    TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.crm_email_sync_state (tenant_id, user_id, provider, email_address, is_connected)
  VALUES (p_tenant_id, p_user_id, p_provider, p_email_address, true)
  ON CONFLICT (tenant_id, user_id, provider) DO UPDATE
    SET email_address = EXCLUDED.email_address, is_connected = true, updated_at = NOW();

  DELETE FROM public.crm_email_oauth_tokens WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND provider = p_provider;
  INSERT INTO public.crm_email_oauth_tokens (tenant_id, user_id, provider, access_token, refresh_token, expires_at)
  VALUES (p_tenant_id, p_user_id, p_provider, p_access_token, p_refresh_token, p_expires_at);
END $$;

-- الصلاحيات: فكّ الربط للمستخدم؛ التخزين لـ service role فقط (لا نمنحه)
GRANT EXECUTE ON FUNCTION public.disconnect_social_account(UUID) TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.social_oauth_tokens') IS NULL
     OR to_regclass('public.crm_email_sync_state') IS NULL
     OR to_regclass('public.crm_email_oauth_tokens') IS NULL
     OR to_regprocedure('public.store_social_oauth_token(uuid,text,text,text,text,text,text,text,timestamptz)') IS NULL
     OR to_regprocedure('public.disconnect_social_account(uuid)') IS NULL
     OR to_regprocedure('public.store_email_oauth_token(uuid,uuid,text,text,text,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: OAuth integration objects missing';
  END IF;
  -- تأكيد أمني: جدول الرموز بلا سياسة SELECT لـ authenticated
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_oauth_tokens' AND cmd IN ('SELECT','ALL')) THEN
    RAISE EXCEPTION 'SECURITY: social_oauth_tokens must NOT have authenticated read policy';
  END IF;
  RAISE NOTICE '✅ 0177: تكاملات OAuth (اجتماعي + Gmail) جاهزة — الرموز محميّة (بلا وصول للمتصفح)';
END $$;

-- ============================================================================
-- نهاية 0177 — تكاملات OAuth على مستوى المخطط (الجانب التقني الأخير).
-- ============================================================================
