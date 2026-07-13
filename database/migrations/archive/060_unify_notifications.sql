-- ════════════════════════════════════════════════════════════════
-- Migration 060: توحيد نظام الإشعارات بالكامل
-- ════════════════════════════════════════════════════════════════
-- الهدف: حل التناقضات بين Migrations 040/041/050
-- 1. id = UUID (ثابت، Supabase الافتراضي)
-- 2. دالة RPC واحدة: create_notification_safe
-- 3. سياسات RLS واضحة
-- 4. Realtime مُفعّل
-- 5. تنظيف الدوال القديمة المتعارضة
-- ════════════════════════════════════════════════════════════════

-- ── 1. إسقاط الدوال القديمة المتعارضة ──────────────────────────
DROP FUNCTION IF EXISTS public.add_notification(UUID, notification_type, notification_priority, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.add_notification_bulk(UUID[], notification_type, notification_priority, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_user_notifications(UUID, INTEGER, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS public.insert_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.mark_notification_read(UUID);
DROP FUNCTION IF EXISTS public.mark_all_notifications_read();

-- ── 2. إسقاط السياسات القديمة المتناقضة ─────────────────────────
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_via_rpc_only" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow all inserts" ON public.notifications;

-- ── 3. التأكد من الأعمدة (ALTER TABLE آمن مع IF NOT EXISTS) ───
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS group_key TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- ── 4. إنشاء INDEXs للأداء ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON public.notifications(group_key) WHERE group_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON public.notifications(expires_at) WHERE expires_at IS NOT NULL;

-- ── 5. سياسات RLS النهائية ──────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: المستخدم يرى إشعاراته فقط
CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- UPDATE: المستخدم يعدّل إشعاراته فقط (read status)
CREATE POLICY "notif_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: المستخدم يحذف إشعاراته فقط
CREATE POLICY "notif_delete" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

-- INSERT: مغلق — الإدراج عبر RPC فقط
CREATE POLICY "notif_insert_via_rpc" ON public.notifications
  FOR INSERT WITH CHECK (false);

-- ── 6. دالة تحويل employee_id → user_id ────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_id_from_employee(
  p_input UUID
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- التحقق: هل الـ input هو user_id صالح؟
  SELECT id INTO v_user_id FROM auth.users WHERE id = p_input;
  IF FOUND THEN RETURN v_user_id; END IF;

  -- محاولة التحويل: employee_id → user_id
  SELECT user_id INTO v_user_id
  FROM public.employees
  WHERE id = p_input AND is_active = true;
  IF FOUND THEN RETURN v_user_id; END IF;

  -- محاولة أخيرة: البحث بـ employee_code
  SELECT user_id INTO v_user_id
  FROM public.employees
  WHERE employee_code = p_input::TEXT AND is_active = true;
  IF FOUND THEN RETURN v_user_id; END IF;

  -- فشل
  RAISE EXCEPTION 'Invalid user/employee ID: %', p_input;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 7. الدالة الموحدة: create_notification_safe ──────────────────
CREATE OR REPLACE FUNCTION public.create_notification_safe(
  p_target_user UUID,
  p_type TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_group_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_notification_id UUID;
  v_existing_id UUID;
BEGIN
  -- تحويل تلقائي employee_id → user_id
  v_user_id := public.get_user_id_from_employee(p_target_user);

  -- منع التكرار: إذا وجد group_key + غير مقروء
  IF p_group_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.notifications
    WHERE user_id = v_user_id
      AND group_key = p_group_key
      AND is_read = false
      AND (expires_at IS NULL OR expires_at > NOW());

    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- إنشاء الإشعار
  INSERT INTO public.notifications (
    user_id, type, priority, title, message,
    action_url, group_key, metadata, expires_at
  ) VALUES (
    v_user_id, p_type, p_priority, p_title, p_message,
    p_action_url, p_group_key, p_metadata, p_expires_at
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_notification_safe TO authenticated;

-- ── 8. دالة تنظيف الإشعارات المنتهية ───────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_notifications TO authenticated;

-- ── 9. تفعيل Realtime ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;

-- ── 10. تعليقات توضيحية ────────────────────────────────────────
COMMENT ON TABLE public.notifications IS
  'جدول الإشعارات — الإدراج عبر create_notification_safe() فقط (SECURITY DEFINER)';
COMMENT ON FUNCTION public.create_notification_safe IS
  'دالة RPC آمنة لإنشاء الإشعارات — تحول employee_id→user_id تلقائياً — تمنع التكرار';
COMMENT ON FUNCTION public.get_user_id_from_employee IS
  'تحويل employee_id → auth.users.id تلقائياً';
COMMENT ON COLUMN public.notifications.id IS
  'معرف UUID — لا تستخدم BIGINT';
