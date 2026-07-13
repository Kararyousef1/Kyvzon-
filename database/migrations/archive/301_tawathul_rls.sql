-- ============================================================================
-- بوابة التواصل (Tawathul) — 301 RLS
-- نفّذ بعد 300_tawathul_core.sql
-- ============================================================================

ALTER TABLE public.tawathul_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tawathul_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tawathul_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tawathul_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tawathul_entity_links ENABLE ROW LEVEL SECURITY;

-- ===================== settings =====================
DROP POLICY IF EXISTS tawathul_settings_select ON public.tawathul_settings;
DROP POLICY IF EXISTS tawathul_settings_write ON public.tawathul_settings;

CREATE POLICY tawathul_settings_select ON public.tawathul_settings
  FOR SELECT TO authenticated
  USING (tenant_id = public.tawathul_current_tenant_id());

CREATE POLICY tawathul_settings_write ON public.tawathul_settings
  FOR ALL TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND public.tawathul_is_staff()
  )
  WITH CHECK (tenant_id = public.tawathul_current_tenant_id());

-- ===================== conversations =====================
DROP POLICY IF EXISTS tawathul_conv_select ON public.tawathul_conversations;
DROP POLICY IF EXISTS tawathul_conv_insert ON public.tawathul_conversations;
DROP POLICY IF EXISTS tawathul_conv_update ON public.tawathul_conversations;

CREATE POLICY tawathul_conv_select ON public.tawathul_conversations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND deleted_at IS NULL
    AND (
      public.tawathul_is_member(id)
      OR is_private = false
    )
  );

CREATE POLICY tawathul_conv_insert ON public.tawathul_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tawathul_current_tenant_id()
    AND (created_by = auth.uid() OR created_by IS NULL)
  );

CREATE POLICY tawathul_conv_update ON public.tawathul_conversations
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND (
      public.tawathul_is_conv_admin(id)
      OR created_by = auth.uid()
      OR public.tawathul_is_staff()
    )
  )
  WITH CHECK (tenant_id = public.tawathul_current_tenant_id());

-- ===================== members =====================
DROP POLICY IF EXISTS tawathul_members_select ON public.tawathul_members;
DROP POLICY IF EXISTS tawathul_members_insert ON public.tawathul_members;
DROP POLICY IF EXISTS tawathul_members_update ON public.tawathul_members;
DROP POLICY IF EXISTS tawathul_members_delete ON public.tawathul_members;

CREATE POLICY tawathul_members_select ON public.tawathul_members
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.tawathul_is_member(conversation_id)
      OR public.tawathul_is_staff()
    )
  );

-- يسمح للمنشئ بإضافة الأعضاء مباشرة بعد إنشاء المحادثة
CREATE POLICY tawathul_members_insert ON public.tawathul_members
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tawathul_current_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.tawathul_is_conv_admin(conversation_id)
      OR public.tawathul_is_staff()
      OR EXISTS (
        SELECT 1
        FROM public.tawathul_conversations c
        WHERE c.id = conversation_id
          AND c.tenant_id = tenant_id
          AND c.created_by = auth.uid()
      )
    )
  );

CREATE POLICY tawathul_members_update ON public.tawathul_members
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.tawathul_is_conv_admin(conversation_id)
      OR public.tawathul_is_staff()
    )
  )
  WITH CHECK (tenant_id = public.tawathul_current_tenant_id());

CREATE POLICY tawathul_members_delete ON public.tawathul_members
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.tawathul_is_conv_admin(conversation_id)
      OR public.tawathul_is_staff()
    )
  );

-- ===================== messages =====================
DROP POLICY IF EXISTS tawathul_msg_select ON public.tawathul_messages;
DROP POLICY IF EXISTS tawathul_msg_insert ON public.tawathul_messages;
DROP POLICY IF EXISTS tawathul_msg_update ON public.tawathul_messages;

CREATE POLICY tawathul_msg_select ON public.tawathul_messages
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND public.tawathul_is_member(conversation_id)
  );

CREATE POLICY tawathul_msg_insert ON public.tawathul_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tawathul_current_tenant_id()
    AND sender_id = auth.uid()
    AND public.tawathul_is_member(conversation_id)
  );

CREATE POLICY tawathul_msg_update ON public.tawathul_messages
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND (
      sender_id = auth.uid()
      OR public.tawathul_is_conv_admin(conversation_id)
      OR public.tawathul_is_staff()
    )
  )
  WITH CHECK (tenant_id = public.tawathul_current_tenant_id());

-- ===================== entity links =====================
DROP POLICY IF EXISTS tawathul_entity_select ON public.tawathul_entity_links;
DROP POLICY IF EXISTS tawathul_entity_insert ON public.tawathul_entity_links;

CREATE POLICY tawathul_entity_select ON public.tawathul_entity_links
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tawathul_current_tenant_id()
    AND (
      public.tawathul_is_member(conversation_id)
      OR public.tawathul_is_staff()
    )
  );

CREATE POLICY tawathul_entity_insert ON public.tawathul_entity_links
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tawathul_current_tenant_id()
    AND created_by = auth.uid()
    AND (
      public.tawathul_is_member(conversation_id)
      OR EXISTS (
        SELECT 1 FROM public.tawathul_conversations c
        WHERE c.id = conversation_id AND c.created_by = auth.uid()
      )
    )
  );

-- ============================================================================
-- نهاية 301_tawathul_rls.sql
-- ============================================================================
