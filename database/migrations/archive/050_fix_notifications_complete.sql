-- ════════════════════════════════════════════════════════════════
-- Migration 050: إصلاح نظام الإشعارات الكامل
-- ════════════════════════════════════════════════════════════════
-- التاريخ: 2024
-- الهدف: حل مشاكل user_id vs employee_id + RLS + Realtime
-- ════════════════════════════════════════════════════════════════
-- ────────────────────────────────────────────────────────────────
-- 1️⃣ تحديث جدول notifications ليطابق الكود
-- ────────────────────────────────────────────────────────────────
-- إضافة أعمدة جديدة (إذا لم تكن موجودة)
ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal' 
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS group_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
-- إنشاء فهرس للأداء
CREATE INDEX IF NOT EXISTS idx_notifications_group_key 
  ON public.notifications(group_key) WHERE group_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at 
  ON public.notifications(expires_at) WHERE expires_at IS NOT NULL;
-- ────────────────────────────────────────────────────────────────
-- 2️⃣ دالة تحويل employee_id → user_id (جوهر الإصلاح)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_id_from_employee(
  p_input UUID
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- التحقق: هل الـ input هو user_id صالح؟
  SELECT id INTO v_user_id FROM auth.users WHERE id = p_input;
  IF FOUND THEN
    RETURN v_user_id; -- ✅ user_id صحيح
  END IF;
  -- محاولة التحويل: employee_id → user_id
  SELECT user_id INTO v_user_id 
  FROM public.employees 
  WHERE id = p_input AND is_active = true;
  
  IF FOUND THEN
    RETURN v_user_id; -- ✅ تم التحويل
  END IF;
  -- محاولة أخيرة: البحث بـ employee_code
  SELECT user_id INTO v_user_id
  FROM public.employees
  WHERE employee_code = p_input::TEXT AND is_active = true;
  IF FOUND THEN
    RETURN v_user_id;
  END IF;
  -- فشل التحويل
  RAISE EXCEPTION 'Invalid user/employee ID: %', p_input;
END;
$$ LANGUAGE plpgsql STABLE;
-- ────────────────────────────────────────────────────────────────
-- 3️⃣ دالة RPC آمنة لإنشاء إشعارات (تستخدمها Frontend)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_notification_safe(
  p_target_user UUID,              -- يقبل employee_id أو user_id
  p_type TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_group_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_user_id UUID;
  v_notification_id BIGINT;
BEGIN
  -- تحويل تلقائي employee_id → user_id
  v_user_id := public.get_user_id_from_employee(p_target_user);
  -- منع التكرار: إذا وجد group_key + غير مقروء
  IF p_group_key IS NOT NULL THEN
    SELECT id INTO v_notification_id
    FROM public.notifications
    WHERE user_id = v_user_id
      AND group_key = p_group_key
      AND is_read = false
      AND (expires_at IS NULL OR expires_at > NOW());
    
    IF FOUND THEN
      RETURN v_notification_id; -- ✅ إرجاع الموجود بدلاً من تكرار
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
-- منح الصلاحية للمستخدمين المصادقين
GRANT EXECUTE ON FUNCTION public.create_notification_safe TO authenticated;
-- ────────────────────────────────────────────────────────────────
-- 4️⃣ سياسات RLS المُصلَحة
-- ────────────────────────────────────────────────────────────────
-- حذف السياسات القديمة
DROP POLICY IF EXISTS notifications_user_select ON public.notifications;
DROP POLICY IF EXISTS notifications_user_update ON public.notifications;
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;
-- سياسة SELECT: المستخدم يرى إشعاراته فقط
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
-- سياسة UPDATE: المستخدم يعدّل إشعاراته فقط (تحديد كمقروء/حذف)
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- سياسة DELETE: المستخدم يحذف إشعاراته فقط
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE USING (user_id = auth.uid());
-- سياسة INSERT: استخدام RPC create_notification_safe فقط
-- (لا سياسة INSERT مباشرة — كل شيء عبر الدالة الآمنة)
-- ────────────────────────────────────────────────────────────────
-- 5️⃣ تفعيل Realtime للإشعارات
-- ────────────────────────────────────────────────────────────────
-- إضافة جدول notifications إلى publication (إذا لم يكن موجوداً)
DO $$
BEGIN
  -- التحقق من وجود publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  -- إضافة الجدول
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN
    -- الجدول موجود مسبقاً
    NULL;
END;
$$;
-- ────────────────────────────────────────────────────────────────
-- 6️⃣ دالة تنظيف الإشعارات المنتهية (Cron Job)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ────────────────────────────────────────────────────────────────
-- 7️⃣ إصلاح البيانات الموجودة (Migration للبيانات القديمة)
-- ────────────────────────────────────────────────────────────────
-- تحديث أي إشعارات قديمة تحتوي على employee_id بدلاً من user_id
DO $$
DECLARE
  v_record RECORD;
  v_user_id UUID;
BEGIN
  FOR v_record IN 
    SELECT DISTINCT n.user_id 
    FROM public.notifications n
    WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = n.user_id)
  LOOP
    BEGIN
      -- محاولة إيجاد user_id الصحيح
      SELECT user_id INTO v_user_id
      FROM public.employees
      WHERE id = v_record.user_id AND is_active = true;
      IF FOUND THEN
        -- تحديث الإشعارات
        UPDATE public.notifications
        SET user_id = v_user_id
        WHERE user_id = v_record.user_id;
        
        RAISE NOTICE 'Fixed % notifications for employee %', 
          (SELECT COUNT(*) FROM public.notifications WHERE user_id = v_user_id),
          v_record.user_id;
      ELSE
        -- حذف الإشعارات اليتيمة
        DELETE FROM public.notifications WHERE user_id = v_record.user_id;
        RAISE NOTICE 'Deleted orphan notifications for %', v_record.user_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not fix notifications for %: %', v_record.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;
-- ────────────────────────────────────────────────────────────────
-- 8️⃣ تعليقات توضيحية
-- ────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.get_user_id_from_employee IS 
  'تحويل employee_id → auth.users.id تلقائياً (يقبل كليهما)';
COMMENT ON FUNCTION public.create_notification_safe IS 
  'دالة RPC آمنة لإنشاء الإشعارات - تستخدمها Frontend بدلاً من INSERT المباشر';
COMMENT ON COLUMN public.notifications.group_key IS 
  'مفتاح لتجنب تكرار الإشعارات (مثال: leave-approve-{userId}-{leaveId})';
COMMENT ON COLUMN public.notifications.priority IS 
  'الأولوية: low, normal, high, urgent';
-- ════════════════════════════════════════════════════════════════
-- نهاية Migration 050
-- ════════════════════════════════════════════════════════════════