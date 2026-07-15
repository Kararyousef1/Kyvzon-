-- =============================================================
-- Migration: 040_create_notifications_table.sql
-- Purpose:   إنشاء جدول الإشعارات المركزي مع Realtime
-- Author:    System
-- Date:      2026-07-06
-- =============================================================
-- هذا الملف ينشئ جدول الإشعارات الأساسي الذي يربط كل الإشعارات
-- في النظام بين جميع المستخدمين عبر Supabase Realtime
-- =============================================================

-- 1. إنشاء نوع الإشعارات (لضمان الاتساق مع الـ frontend)
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'welcome', 'login', 'logout', 'profile_update', 'permission_update',
    'system', 'info', 'success', 'warning', 'error',
    'problem_created', 'problem_updated', 'problem_comment',
    'leave_requested', 'leave_approved', 'leave_rejected',
    'assigned_to_you'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. إنشاء نوع أولوية الإشعارات
DO $$ BEGIN
  CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. جدول الإشعارات الأساسي
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type notification_type NOT NULL DEFAULT 'info',
  priority notification_priority NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  action_url TEXT,
  group_key TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- 4. إنشاء INDEXs للأداء
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON notifications(group_key);

-- 5. تفعيل RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 6. سياسات RLS للأمان
-- المستخدم يرى فقط إشعاراته الخاصة
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- المستخدم يمكنه تحديث إشعاراته (read status)
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- النظام (service role) يمكنه إدراج إشعارات لأي مستخدم
-- هذا يسمح لـ server-side أو triggers بإضافة إشعارات
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- يمكن للمستخدم حذف إشعاراته
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- 7. تفعيل Realtime للإشعارات (البث المباشر)
-- يجب تشغيل هذا الأمر من Supabase Dashboard أو SQL Editor
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 8. دالة مساعدة لإضافة إشعار (تستخدم من قبل triggers أو edge functions)
CREATE OR REPLACE FUNCTION add_notification(
  p_user_id UUID,
  p_type notification_type,
  p_priority notification_priority,
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_group_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_existing_id UUID;
BEGIN
  -- منع التكرار بناءً على group_key (فقط للإشعارات غير المقروءة)
  IF p_group_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM notifications
      WHERE user_id = p_user_id
        AND group_key = p_group_key
        AND is_read = FALSE
      LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id; -- إرجاع الإشعار الموجود بدلاً من إنشاء مكرر
    END IF;
  END IF;

  -- إنشاء الإشعار الجديد
  INSERT INTO notifications (user_id, type, priority, title, message, action_url, group_key, metadata, expires_at)
  VALUES (p_user_id, p_type, p_priority, p_title, p_message, p_action_url, p_group_key, p_metadata, p_expires_at)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. دالة لإضافة إشعار لعدة مستخدمين في وقت واحد
CREATE OR REPLACE FUNCTION add_notification_bulk(
  p_user_ids UUID[],
  p_type notification_type,
  p_priority notification_priority,
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_group_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF UUID AS $$
DECLARE
  v_user_id UUID;
  v_notif_id UUID;
BEGIN
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    SELECT add_notification(v_user_id, p_type, p_priority, p_title, p_message, p_action_url, p_group_key, p_metadata, p_expires_at)
    INTO v_notif_id;
    RETURN NEXT v_notif_id;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. دالة لجلب إشعارات المستخدم مع التحكم في الحد الأقصى
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_unread_only BOOLEAN DEFAULT FALSE
) RETURNS SETOF notifications AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM notifications
  WHERE user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (NOT p_unread_only OR is_read = FALSE)
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ROLLBACK:
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP FUNCTION IF EXISTS add_notification;
-- DROP FUNCTION IF EXISTS add_notification_bulk;
-- DROP FUNCTION IF EXISTS get_user_notifications;