-- ════════════════════════════════════════════════════════════════
--  Migration 042 — إصلاح شامل لنظام الإشعارات
-- ════════════════════════════════════════════════════════════════
--  يُنفَّذ بعد: 040, 041
--  يُصلح:
--  1. إضافة الأعمدة الناقصة في جدول notifications
--  2. إنشاء RPC create_notification_safe (SECURITY DEFINER)
--  3. إنشاء RPC cleanup_expired_notifications
--  4. DELETE policy للمستخدم
-- ════════════════════════════════════════════════════════════════

-- ─── 1: إضافة الأعمدة الناقصة ───────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority      VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS action_url    TEXT,
  ADD COLUMN IF NOT EXISTS group_key     TEXT,
  ADD COLUMN IF NOT EXISTS metadata      JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at       TIMESTAMPTZ;

-- تحديث فهارس البحث
CREATE INDEX IF NOT EXISTS idx_notifications_tenant
  ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_group
  ON public.notifications(group_key) WHERE group_key IS NOT NULL;

-- ─── 2: DELETE policy ────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own"
  ON public.notifications
  FOR DELETE
  USING (user_id = auth.uid());

-- ─── 3: RPC create_notification_safe ─────────────────────────
-- SECURITY DEFINER تسمح بالإدراج رغم policy (WITH CHECK false)
-- وتتحقق أن المُرسَل إليه موجود في profiles

CREATE OR REPLACE FUNCTION public.create_notification_safe(
  p_target_user  UUID,
  p_type         TEXT,
  p_priority     TEXT     DEFAULT 'normal',
  p_title        TEXT     DEFAULT '',
  p_message      TEXT     DEFAULT '',
  p_action_url   TEXT     DEFAULT NULL,
  p_group_key    TEXT     DEFAULT NULL,
  p_metadata     JSONB    DEFAULT '{}',
  p_expires_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_tenant_id       UUID;
BEGIN
  -- التحقق من وجود المستخدم
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user) THEN
    RETURN NULL;
  END IF;

  -- جلب tenant_id من profiles
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = p_target_user
  LIMIT 1;

  -- منع تكرار الإشعار إن كان group_key موجوداً وغير مقروء
  IF p_group_key IS NOT NULL THEN
    SELECT id INTO v_notification_id
    FROM public.notifications
    WHERE user_id     = p_target_user
      AND group_key   = p_group_key
      AND is_read     = false
    LIMIT 1;

    IF v_notification_id IS NOT NULL THEN
      RETURN v_notification_id; -- نُعيد ID الموجود بدون تكرار
    END IF;
  END IF;

  -- إدراج الإشعار
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
    expires_at,
    is_read,
    created_at
  ) VALUES (
    v_tenant_id,
    p_target_user,
    p_type,
    COALESCE(p_priority, 'normal'),
    COALESCE(p_title, ''),
    COALESCE(p_message, ''),
    p_action_url,
    p_group_key,
    COALESCE(p_metadata, '{}'),
    p_expires_at,
    false,
    NOW()
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- منح صلاحية التنفيذ للمستخدمين المصادَق عليهم
GRANT EXECUTE ON FUNCTION public.create_notification_safe TO authenticated;

-- ─── 4: RPC cleanup_expired_notifications ─────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_notifications TO authenticated;

-- ─── 5: تفعيل Realtime على جدول notifications ─────────────────
-- (يجب تفعيله من Supabase Dashboard أيضاً: Database → Replication)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;