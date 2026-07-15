-- ============================================================================
-- Kyvzon Platform — 104_device_sync_nonces.sql
-- PURPOSE: Replay protection for signed biometric sync requests
-- DEPENDS ON: pgcrypto
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_sync_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_sync_nonces_expires_at
  ON public.device_sync_nonces (expires_at);

ALTER TABLE public.device_sync_nonces ENABLE ROW LEVEL SECURITY;

-- No client policy is intentional. Only the Edge Function service role writes here.
REVOKE ALL ON TABLE public.device_sync_nonces FROM anon, authenticated;
