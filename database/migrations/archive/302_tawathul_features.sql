-- ============================================================================
-- بوابة التواصل (Tawathul) — 302 Features
-- ردود/تفاعلات/تثبيت/إشارات/ملفات/إشعارات داخل البوابة
-- نفّذ بعد 300 و 301
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) أعمدة إضافية على الرسائل
-- ---------------------------------------------------------------------------
ALTER TABLE public.tawathul_messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tawathul_messages
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tawathul_msg_pinned
  ON public.tawathul_messages (conversation_id)
  WHERE is_pinned = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tawathul_msg_body_trgm
  ON public.tawathul_messages USING gin (to_tsvector('simple', coalesce(body, '')));

-- ---------------------------------------------------------------------------
-- 2) التفاعلات (Reactions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.tawathul_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.tawathul_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tawathul_reactions_unique UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_tawathul_reactions_msg
  ON public.tawathul_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_tawathul_reactions_conv
  ON public.tawathul_reactions (conversation_id);

-- ---------------------------------------------------------------------------
-- 3) مرفقات الرسائل (metadata — الملف في Storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.tawathul_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.tawathul_conversations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name VARCHAR(300) NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT,
  mime_type VARCHAR(120),
  file_size BIGINT DEFAULT 0,
  kind VARCHAR(20) NOT NULL DEFAULT 'file'
    CHECK (kind IN ('file', 'image', 'voice', 'video')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tawathul_att_msg
  ON public.tawathul_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_tawathul_att_conv
  ON public.tawathul_attachments (conversation_id);

-- ---------------------------------------------------------------------------
-- 4) إشعارات داخل البوابة (غير جدول notifications العام — اختياري مكمل)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.tawathul_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.tawathul_messages(id) ON DELETE SET NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'message'
    CHECK (type IN ('message', 'mention', 'reaction', 'invite', 'system')),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tawathul_notif_user
  ON public.tawathul_notifications (tenant_id, user_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tawathul_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tawathul_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tawathul_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tawathul_reactions_select ON public.tawathul_reactions;
DROP POLICY IF EXISTS tawathul_reactions_insert ON public.tawathul_reactions;
DROP POLICY IF EXISTS tawathul_reactions_delete ON public.tawathul_reactions;

CREATE POLICY tawathul_reactions_select ON public.tawathul_reactions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND public.tawathul_is_member(conversation_id)
  );

CREATE POLICY tawathul_reactions_insert ON public.tawathul_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tawathul_current_tenant_id()
    AND user_id = auth.uid()
    AND public.tawathul_is_member(conversation_id)
  );

CREATE POLICY tawathul_reactions_delete ON public.tawathul_reactions
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND (user_id = auth.uid() OR public.tawathul_is_staff())
  );

DROP POLICY IF EXISTS tawathul_att_select ON public.tawathul_attachments;
DROP POLICY IF EXISTS tawathul_att_insert ON public.tawathul_attachments;

CREATE POLICY tawathul_att_select ON public.tawathul_attachments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND public.tawathul_is_member(conversation_id)
  );

CREATE POLICY tawathul_att_insert ON public.tawathul_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tawathul_current_tenant_id()
    AND uploaded_by = auth.uid()
    AND public.tawathul_is_member(conversation_id)
  );

DROP POLICY IF EXISTS tawathul_notif_select ON public.tawathul_notifications;
DROP POLICY IF EXISTS tawathul_notif_update ON public.tawathul_notifications;
DROP POLICY IF EXISTS tawathul_notif_insert ON public.tawathul_notifications;

CREATE POLICY tawathul_notif_select ON public.tawathul_notifications
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND user_id = auth.uid()
  );

CREATE POLICY tawathul_notif_update ON public.tawathul_notifications
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tawathul_notif_insert ON public.tawathul_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tawathul_current_tenant_id()
  );

-- ---------------------------------------------------------------------------
-- 6) إشعار تلقائي للأعضاء عند رسالة جديدة (ما عدا المرسل)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tawathul_notify_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tawathul_notifications (
    tenant_id, user_id, conversation_id, message_id, type, title, body
  )
  SELECT
    NEW.tenant_id,
    m.user_id,
    NEW.conversation_id,
    NEW.id,
    CASE
      WHEN NEW.mentions IS NOT NULL
        AND NEW.mentions @> to_jsonb(ARRAY[m.user_id::text])
      THEN 'mention'
      ELSE 'message'
    END,
    CASE
      WHEN NEW.mentions IS NOT NULL
        AND NEW.mentions @> to_jsonb(ARRAY[m.user_id::text])
      THEN 'تمت الإشارة إليك'
      ELSE 'رسالة جديدة'
    END,
    LEFT(COALESCE(NEW.body, 'مرفق'), 180)
  FROM public.tawathul_members m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.left_at IS NULL
    AND m.user_id IS DISTINCT FROM NEW.sender_id
    AND COALESCE(m.is_muted, false) = false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tawathul_notify_msg ON public.tawathul_messages;
CREATE TRIGGER trg_tawathul_notify_msg
  AFTER INSERT ON public.tawathul_messages
  FOR EACH ROW
  WHEN (NEW.message_type IS DISTINCT FROM 'system')
  EXECUTE FUNCTION public.tawathul_notify_on_message();

-- ---------------------------------------------------------------------------
-- 7) Realtime إضافي
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tawathul_reactions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'reactions realtime: %', SQLERRM;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tawathul_notifications;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notifications realtime: %', SQLERRM;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Storage bucket للملفات (إن سمحت الصلاحيات)
-- ---------------------------------------------------------------------------
-- يُنشأ يدوياً من Dashboard إن فشل هذا الجزء:
-- Bucket name: tawathul
-- public: false (موصى به) أو true للتطوير
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'tawathul',
    'tawathul',
    true,
    26214400,
    ARRAY[
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'audio/webm','audio/mpeg','audio/ogg','audio/wav'
    ]::text[]
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'storage bucket tawathul skipped: %', SQLERRM;
END;
$$;

-- ============================================================================
-- نهاية 302_tawathul_features.sql
-- ============================================================================
