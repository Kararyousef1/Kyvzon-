-- ============================================================================
--  FILE: 0027_public_signup_requests.sql
--  PURPOSE: Public landing signup/lead requests after email OTP verification
--  DEPENDS ON: auth.users, 0007_support_and_security.sql helpers
--  SAFETY LEVEL: HIGH — additive table, RLS enabled, no destructive changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.public_signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  country TEXT,
  governorate TEXT,
  intent_type TEXT NOT NULL DEFAULT 'general'
    CHECK (intent_type IN ('plan','service','review','demo','general')),
  selected_plan TEXT,
  selected_service TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  company_name TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','qualified','converted','rejected','archived')),
  source TEXT NOT NULL DEFAULT 'landing_page',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_signup_requests_user
  ON public.public_signup_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_signup_requests_status
  ON public.public_signup_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_signup_requests_intent
  ON public.public_signup_requests(intent_type, created_at DESC);

DROP TRIGGER IF EXISTS trg_public_signup_requests_updated_at ON public.public_signup_requests;
CREATE TRIGGER trg_public_signup_requests_updated_at
  BEFORE UPDATE ON public.public_signup_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.public_signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_public_signup_insert_own ON public.public_signup_requests;
DROP POLICY IF EXISTS kyvzon_public_signup_select_own_or_platform ON public.public_signup_requests;
DROP POLICY IF EXISTS kyvzon_public_signup_update_platform ON public.public_signup_requests;

CREATE POLICY kyvzon_public_signup_insert_own ON public.public_signup_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY kyvzon_public_signup_select_own_or_platform ON public.public_signup_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_platform_owner());

CREATE POLICY kyvzon_public_signup_update_platform ON public.public_signup_requests
  FOR UPDATE TO authenticated
  USING (public.current_user_is_platform_owner())
  WITH CHECK (public.current_user_is_platform_owner());

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='public_signup_requests'
  ), 'public_signup_requests must exist';
END $$;
