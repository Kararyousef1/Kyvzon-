-- ============================================================================
--  FILE: 0015_relaxed_insert_for_audit_error_security.sql
--  PURPOSE: Relax INSERT policies on audit/security/error log tables so any
--           authenticated user can write their own events. SELECT/UPDATE/DELETE
--           remain staff-only.
--  EXECUTION ORDER: 16th
--  DEPENDS ON: 0010 (which created the initial staff-only policies)
--  SAFETY LEVEL: HIGH — expands write access intentionally
-- ============================================================================
--
--  Rationale:
--    The original 0010 policies restricted INSERT on audit_logs / error_logs /
--    security_events to staff-only. This breaks the following legitimate cases:
--
--      1. ErrorBoundary logging a client-side error before/without login.
--      2. securityService logging a failed login attempt (no session yet).
--      3. devPinService logging a data-export audit event (any user role).
--
--    The new policy:
--      - Anyone (including anon for error_logs) can INSERT.
--      - They must EITHER:
--          * pass NULL as tenant_id (system/anonymous events), OR
--          * pass their own tenant_id (verified via current_user_tenant_id()).
--      - They must EITHER:
--          * pass NULL as actor/user id, OR
--          * pass their own auth.uid()  (self-attribution only).
--      - SELECT/UPDATE/DELETE still require staff (unchanged).
-- ============================================================================


-- ─── audit_logs: any authenticated may insert own events ────────────────────
DROP POLICY IF EXISTS kyvzon_audit_logs_insert ON public.audit_logs;
CREATE POLICY kyvzon_audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );


-- ─── error_logs: allow anon too (client crashes before login) ───────────────
DROP POLICY IF EXISTS kyvzon_error_logs_insert ON public.error_logs;
CREATE POLICY kyvzon_error_logs_insert ON public.error_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
  );


-- ─── security_events: allow anon (failed logins) ────────────────────────────
DROP POLICY IF EXISTS kyvzon_security_events_insert ON public.security_events;
CREATE POLICY kyvzon_security_events_insert ON public.security_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    AND (user_id IS NULL OR user_id = auth.uid())
  );


-- ─── Sanity check ───────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'error_logs'
      AND policyname = 'kyvzon_error_logs_insert'
  ), 'error_logs insert policy should exist';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'security_events'
      AND policyname = 'kyvzon_security_events_insert'
  ), 'security_events insert policy should exist';

  RAISE NOTICE 'CHECK PASSED — relaxed INSERT policies applied to audit/error/security';
END $$;
