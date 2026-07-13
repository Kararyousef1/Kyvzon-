-- ════════════════════════════════════════════════════════════════
--  Migration 041: إصلاح RLS لجدول notifications
--  Kyvzon Platform
--
--  المشاكل المُصلَحة:
--  1. WITH CHECK (true) → أي مستخدم يمكنه إدراج إشعار لأي user_id
--  2. عدم التحقق من تطابق user_id مع auth.uid()
--  3. إضافة policy آمنة للـ INSERT عبر SECURITY DEFINER RPC
-- ════════════════════════════════════════════════════════════════

-- ── 1. حذف السياسة المفتوحة الخطيرة ────────────────────────────
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
DROP POLICY IF EXISTS "Allow all inserts" ON notifications;

-- ── 2. إعادة إنشاء سياسات آمنة ─────────────────────────────────

-- SELECT: المستخدم يرى إشعاراته فقط
CREATE POLICY "notifications_select_own"
  ON notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- UPDATE: المستخدم يعدّل إشعاراته فقط (قراءة، حذف)
CREATE POLICY "notifications_update_own"
  ON notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: المستخدم يحذف إشعاراته فقط
CREATE POLICY "notifications_delete_own"
  ON notifications
  FOR DELETE
  USING (user_id = auth.uid());

-- INSERT: يتم عبر دالة SECURITY DEFINER فقط (لا مباشرة)
-- المستخدم العادي لا يمكنه INSERT مباشرة
CREATE POLICY "notifications_insert_via_rpc_only"
  ON notifications
  FOR INSERT
  WITH CHECK (false); -- مغلق بالكامل — الإدراج عبر RPC فقط

-- ── 3. إنشاء دالة SECURITY DEFINER لإدراج الإشعارات ────────────
-- هذه الدالة تعمل بصلاحيات postgres وليس المستخدم العادي
-- تمنع تزوير user_id

CREATE OR REPLACE FUNCTION insert_notification(
  p_user_id     UUID,
  p_type        TEXT,
  p_title       TEXT,
  p_message     TEXT,
  p_priority    TEXT DEFAULT 'medium',
  p_action_url  TEXT DEFAULT NULL,
  p_group_key   TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}',
  p_expires_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_caller_role TEXT;
BEGIN
  -- التحقق من أن المستدعي مصادق
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'مطلوب المصادقة';
  END IF;

  -- جلب دور المستدعي
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  -- التحقق من الصلاحيات:
  -- المستخدم يرسل لنفسه، أو
  -- المشرف/HR/المدير/Admin يرسل لأي شخص
  IF p_user_id != auth.uid() AND v_caller_role NOT IN ('admin', 'hr', 'manager', 'supervisor', 'developer') THEN
    RAISE EXCEPTION 'غير مخوَّل لإرسال إشعار لهذا المستخدم';
  END IF;

  -- التحقق من نوع الإشعار (يمنع أنواعاً غير موجودة)
  -- إذا كان الجدول يستخدم enum، استخدم cast
  -- إذا كان TEXT، تحقق من القيمة
  IF p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RAISE EXCEPTION 'نوع الإشعار مطلوب';
  END IF;

  -- إدراج الإشعار
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    priority,
    action_url,
    group_key,
    metadata,
    expires_at,
    is_read,
    created_at
  )
  VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    COALESCE(p_priority, 'medium'),
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

-- منح صلاحية تنفيذ الدالة للمستخدمين المصادقين
REVOKE ALL ON FUNCTION insert_notification FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_notification TO authenticated;

-- ── 4. إنشاء دالة لتحديد إشعار كمقروء ─────────────────────────

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'مطلوب المصادقة';
  END IF;

  UPDATE notifications
  SET is_read = true, read_at = NOW()
  WHERE id = p_notification_id AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_notification_read TO authenticated;

-- ── 5. إنشاء دالة لتحديد جميع الإشعارات كمقروءة ────────────────

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'مطلوب المصادقة';
  END IF;

  UPDATE notifications
  SET is_read = true, read_at = NOW()
  WHERE user_id = auth.uid() AND is_read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_all_notifications_read TO authenticated;

-- ── 6. تفعيل Realtime لجدول notifications ───────────────────────
-- (كان معلّقاً في migration 040)

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ── 7. تعليق توضيحي ─────────────────────────────────────────────
COMMENT ON TABLE notifications IS 
  'جدول الإشعارات — الإدراج عبر insert_notification() فقط (SECURITY DEFINER)';

COMMENT ON FUNCTION insert_notification IS
  'الدالة الآمنة لإدراج الإشعارات — تتحقق من هوية المستدعي وصلاحياته';
