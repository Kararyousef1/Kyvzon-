-- ============================================================================
-- بوابة التواصل (Tawathul) — 007 Core Schema
-- متوافق مع Kyvzon Platform / Multi-tenant عند التوفّر
-- نفّذ مرة واحدة في Supabase SQL Editor قبل 301
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) دالة updated_at (آمنة إن وُجدت مسبقاً)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) جدول tenants مرن (لا يكسر 006 أو 100 إن وُجدا)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS name_ar VARCHAR(200);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS name_en VARCHAR(200);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS code VARCHAR(10);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.tenants
SET name_ar = COALESCE(NULLIF(name_ar, ''), 'الشركة الافتراضية')
WHERE name_ar IS NULL OR name_ar = '';

-- شركة افتراضية للرافدين
INSERT INTO public.tenants (id, name_ar, name_en, slug, status, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Kyvzon Platform',
  'Kyvzon Platform',
  'kyvzon',
  'active',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = COALESCE(public.tenants.name_en, EXCLUDED.name_en),
  slug = COALESCE(public.tenants.slug, EXCLUDED.slug),
  status = COALESCE(public.tenants.status, EXCLUDED.status),
  is_active = COALESCE(public.tenants.is_active, true);

-- ---------------------------------------------------------------------------
-- 2) إعدادات البوابة لكل شركة
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  allow_dms BOOLEAN NOT NULL DEFAULT true,
  allow_groups BOOLEAN NOT NULL DEFAULT true,
  allow_channels BOOLEAN NOT NULL DEFAULT true,
  allow_file_upload BOOLEAN NOT NULL DEFAULT true,
  max_file_size_mb INTEGER NOT NULL DEFAULT 25,
  retention_days INTEGER,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tawathul_settings_tenant_unique UNIQUE (tenant_id)
);

-- ---------------------------------------------------------------------------
-- 3) المحادثات
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('dm', 'group', 'channel', 'entity')),
  title VARCHAR(200),
  description TEXT,
  avatar_url VARCHAR(500),
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview VARCHAR(280),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tawathul_conv_tenant
  ON public.tawathul_conversations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tawathul_conv_tenant_type
  ON public.tawathul_conversations (tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_tawathul_conv_last_msg
  ON public.tawathul_conversations (tenant_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tawathul_conv_active
  ON public.tawathul_conversations (tenant_id)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4) الأعضاء
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.tawathul_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  nickname VARCHAR(100),
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ,
  last_read_message_id UUID,
  CONSTRAINT tawathul_members_unique UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tawathul_members_tenant
  ON public.tawathul_members (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tawathul_members_user_active
  ON public.tawathul_members (tenant_id, user_id)
  WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tawathul_members_conv_active
  ON public.tawathul_members (conversation_id)
  WHERE left_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5) الرسائل
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.tawathul_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'system', 'file', 'voice')),
  body TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to_id UUID REFERENCES public.tawathul_messages(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tawathul_msg_tenant
  ON public.tawathul_messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tawathul_msg_conv_created
  ON public.tawathul_messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tawathul_msg_sender
  ON public.tawathul_messages (tenant_id, sender_id);

-- ---------------------------------------------------------------------------
-- 6) ربط ERP
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tawathul_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.tawathul_conversations(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  title VARCHAR(200),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tawathul_entity_unique UNIQUE (tenant_id, entity_type, entity_id),
  CONSTRAINT tawathul_entity_conv_unique UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_tawathul_entity_lookup
  ON public.tawathul_entity_links (tenant_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 7) Triggers updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_tawathul_settings_updated ON public.tawathul_settings;
CREATE TRIGGER trg_tawathul_settings_updated
  BEFORE UPDATE ON public.tawathul_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tawathul_conv_updated ON public.tawathul_conversations;
CREATE TRIGGER trg_tawathul_conv_updated
  BEFORE UPDATE ON public.tawathul_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8) تحديث آخر رسالة
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tawathul_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tawathul_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(COALESCE(NEW.body, ''), 280),
    updated_at = NOW()
  WHERE id = NEW.conversation_id
    AND tenant_id = NEW.tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tawathul_msg_after_insert ON public.tawathul_messages;
CREATE TRIGGER trg_tawathul_msg_after_insert
  AFTER INSERT ON public.tawathul_messages
  FOR EACH ROW EXECUTE FUNCTION public.tawathul_on_message_insert();

-- ---------------------------------------------------------------------------
-- 9) مساعدات Tenant + عضوية (تعمل حتى بدون عمود profiles.tenant_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tawathul_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid UUID;
  v_has_col BOOLEAN;
BEGIN
  -- 1) سياق الجلسة إن وُجد
  BEGIN
    v_tid := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
    IF v_tid IS NOT NULL THEN
      RETURN v_tid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 2) profiles.tenant_id إن وُجد العمود
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'tenant_id'
  ) INTO v_has_col;

  IF v_has_col AND auth.uid() IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT tenant_id FROM public.profiles WHERE id = $1 LIMIT 1'
        INTO v_tid
        USING auth.uid();
      IF v_tid IS NOT NULL THEN
        RETURN v_tid;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_tid := NULL;
    END;
  END IF;

  -- 3) Kyvzon
  RETURN '00000000-0000-0000-0000-000000000001'::UUID;
END;
$$;

CREATE OR REPLACE FUNCTION public.tawathul_is_member(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tawathul_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = auth.uid()
      AND m.left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.tawathul_is_conv_admin(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tawathul_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = auth.uid()
      AND m.left_at IS NULL
      AND m.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.tawathul_is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'hr', 'developer')
  );
$$;

-- ---------------------------------------------------------------------------
-- 10) Realtime (يتجاوز الخطأ إن كان مضافاً مسبقاً)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tawathul_messages;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'tawathul_messages realtime: %', SQLERRM;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tawathul_conversations;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'tawathul_conversations realtime: %', SQLERRM;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tawathul_members;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'tawathul_members realtime: %', SQLERRM;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11) إعداد افتراضي
-- ---------------------------------------------------------------------------
INSERT INTO public.tawathul_settings (tenant_id, is_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', true)
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- نهاية 300_tawathul_core.sql
-- ============================================================================
