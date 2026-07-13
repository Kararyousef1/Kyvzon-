-- ============================================================================
-- Kyvzon Development — 0009_notifications_contract.sql
-- Complete notification schema, safe RPC creation, and user/tenant RLS.
-- ============================================================================

ALTER TABLE IF EXISTS public.notifications
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS group_key TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_created
  ON public.notifications(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_via_rpc ON public.notifications;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );

CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );

-- Direct inserts are blocked; application writes use this validated RPC.
CREATE POLICY notifications_insert_via_rpc ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.create_notification_safe(
  p_target_user UUID,
  p_type TEXT,
  p_priority TEXT,
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_group_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID;
  v_target_tenant UUID;
  v_current_tenant UUID;
  v_notification_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_current_tenant := public.current_user_tenant_id();

  -- Accept either a profile/user id or an employee id, but resolve to auth user.
  SELECT p.id, p.tenant_id
  INTO v_target_id, v_target_tenant
  FROM public.profiles p
  WHERE p.id = p_target_user
  LIMIT 1;

  IF v_target_id IS NULL THEN
    SELECT p.id, p.tenant_id
    INTO v_target_id, v_target_tenant
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE e.id = p_target_user
    LIMIT 1;
  END IF;

  IF v_target_id IS NULL OR v_target_tenant IS DISTINCT FROM v_current_tenant THEN
    RAISE EXCEPTION 'target user is outside the current tenant';
  END IF;

  INSERT INTO public.notifications (
    tenant_id,
    user_id,
    type,
    priority,
    title,
    message,
    action_url,
    group_key,
    metadata,
    expires_at
  )
  VALUES (
    v_current_tenant,
    v_target_id,
    COALESCE(NULLIF(p_type, ''), 'info'),
    COALESCE(NULLIF(p_priority, ''), 'normal'),
    LEFT(COALESCE(p_title, ''), 300),
    LEFT(COALESCE(p_message, ''), 5000),
    p_action_url,
    p_group_key,
    COALESCE(p_metadata, '{}'::JSONB),
    p_expires_at
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS INTEGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.notifications
  WHERE tenant_id = public.current_user_tenant_id()
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification_safe(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_notification_safe(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_notifications() TO authenticated;
