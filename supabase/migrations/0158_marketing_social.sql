-- ============================================================================
-- Kyvzon — 0158_marketing_social.sql
-- وحدة "التسويق عبر وسائل التواصل الاجتماعي" (بوابة التسويق — التقرير الثالث)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية:
--   • إدارة الحسابات: ربط FB/IG/LinkedIn/X (OAuth) — حالة اتصال + adapter.
--   • منشئ المنشورات + النشر الموحّد + الجدولة + أهداف نشر لكل منصة.
--   • تقويم المحتوى (حالات: مجدول/منشور/فشل).
--   • مركز التفاعل الموحّد (Inbox): تعليقات/رسائل/إشارات + رد + تعيين + حالة.
--   • تحويل التعليق → Lead (ربط بالوحدة 1: marketing_leads).
--   • توليد UTM تلقائي + الإسناد (Attribution) + ROI لكل منصة/حملة/منشور.
--   • الاستماع الاجتماعي (Social Listening): مصطلحات + نتائج.
--
-- الربط الفعلي بالمنصات (OAuth/API) hook: is_connected + provider،
--   يُفعَّل بإدخال بيانات تطبيق OAuth دون إعادة بناء. قبلها وضع محاكاة.
--
-- كل الجداول tenant-scoped + RLS. idempotent.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) الحسابات الاجتماعية المربوطة
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('facebook','instagram','linkedin','x','tiktok')),
  account_name   TEXT NOT NULL,
  account_handle TEXT,
  -- حالة الربط (OAuth): محاكاة حتى إدخال بيانات تطبيق فعلي
  is_connected   BOOLEAN NOT NULL DEFAULT false,
  connection_mode TEXT NOT NULL DEFAULT 'simulation' CHECK (connection_mode IN ('simulation','oauth')),
  external_id    TEXT,             -- معرّف الحساب لدى المنصة (بعد OAuth)
  followers      INTEGER NOT NULL DEFAULT 0,
  connected_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, platform, account_handle)
);
CREATE INDEX IF NOT EXISTS idx_social_accounts_tenant ON public.social_accounts(tenant_id, platform);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) المنشورات + أهداف النشر لكل منصة (نشر موحّد)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.social_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content        TEXT NOT NULL DEFAULT '',
  media_urls     TEXT[] NOT NULL DEFAULT '{}',
  link_url       TEXT,                        -- الرابط (يُولَّد له UTM)
  content_type   TEXT NOT NULL DEFAULT 'post'
                 CHECK (content_type IN ('post','reel','story','case_study','educational','infographic','poll')),
  campaign_name  TEXT,                        -- لربط UTM بالحملة
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','scheduled','published','failed')),
  scheduled_at   TIMESTAMPTZ,
  published_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_posts_tenant ON public.social_posts(tenant_id, status, scheduled_at);

-- هدف نشر: نسخة المنشور على منصة معيّنة (نشر متزامن/مستقل)
CREATE TABLE IF NOT EXISTS public.social_post_targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  post_id        UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','published','failed')),
  external_post_id TEXT,
  scheduled_at   TIMESTAMPTZ,
  published_at   TIMESTAMPTZ,
  error_message  TEXT,
  -- مقاييس المنشور على هذه المنصة (Awareness/Engagement)
  reach          INTEGER NOT NULL DEFAULT 0,
  impressions    INTEGER NOT NULL DEFAULT 0,
  likes          INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares         INTEGER NOT NULL DEFAULT 0,
  saves          INTEGER NOT NULL DEFAULT 0,
  clicks         INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_social_targets_post ON public.social_post_targets(tenant_id, post_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) مركز التفاعل الموحّد — Inbox (تعليقات/رسائل/إشارات)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.social_interactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id     UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  post_id        UUID REFERENCES public.social_posts(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('comment','dm','mention','ad_comment')),
  author_name    TEXT,
  author_handle  TEXT,
  message        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','replied','assigned','closed')),
  assigned_to    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reply_text     TEXT,
  replied_at     TIMESTAMPTZ,
  -- إن حُوِّل لعميل محتمل (الوحدة 1)
  converted_lead_id UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  external_id    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_inter_tenant ON public.social_interactions(tenant_id, status, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) روابط UTM — الإسناد (Attribution) + ROI
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.social_utm_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  post_id        UUID REFERENCES public.social_posts(id) ON DELETE SET NULL,
  base_url       TEXT NOT NULL,
  utm_source     TEXT NOT NULL,               -- المنصة
  utm_medium     TEXT NOT NULL DEFAULT 'social',
  utm_campaign   TEXT,
  utm_content    TEXT,
  utm_term       TEXT,
  full_url       TEXT NOT NULL,               -- الرابط الكامل المُولَّد
  -- الإسناد: نقرات وإيراد مُنسب
  clicks         INTEGER NOT NULL DEFAULT 0,
  conversions    INTEGER NOT NULL DEFAULT 0,
  attributed_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_utm_tenant ON public.social_utm_links(tenant_id, utm_source);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) الاستماع الاجتماعي — مصطلحات + نتائج
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.social_listening_terms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  term           TEXT NOT NULL,
  term_type      TEXT NOT NULL DEFAULT 'keyword' CHECK (term_type IN ('brand','keyword','competitor')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, term)
);
CREATE INDEX IF NOT EXISTS idx_social_terms_tenant ON public.social_listening_terms(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.social_listening_mentions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  term_id        UUID REFERENCES public.social_listening_terms(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL,
  author_name    TEXT,
  content        TEXT NOT NULL DEFAULT '',
  sentiment      TEXT NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative')),
  is_opportunity BOOLEAN NOT NULL DEFAULT false,   -- فرصة (مثال: شكوى من منافس)
  converted_lead_id UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_mentions_tenant ON public.social_listening_mentions(tenant_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) RLS
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'social_accounts','social_posts','social_post_targets','social_interactions',
    'social_utm_links','social_listening_terms','social_listening_mentions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) دالة توليد UTM (المعاملات الخمسة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.build_utm_url(
  p_base TEXT, p_source TEXT, p_medium TEXT DEFAULT 'social',
  p_campaign TEXT DEFAULT NULL, p_content TEXT DEFAULT NULL, p_term TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_base
    || (CASE WHEN position('?' in p_base) > 0 THEN '&' ELSE '?' END)
    || 'utm_source=' || p_source
    || '&utm_medium=' || p_medium
    || COALESCE('&utm_campaign=' || p_campaign, '')
    || COALESCE('&utm_content=' || p_content, '')
    || COALESCE('&utm_term=' || p_term, '');
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) تحويل تفاعل (تعليق/رسالة) إلى عميل محتمل — Social Selling
--  ينشئ lead في الوحدة 1 ويربطه بالتفاعل ويعيّن مالكاً.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.convert_interaction_to_lead(
  p_interaction_id UUID,
  p_owner_id       UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_name TEXT; v_platform TEXT; v_msg TEXT; v_lead UUID; v_existing UUID;
BEGIN
  SELECT tenant_id, author_name, platform, message, converted_lead_id
    INTO v_tenant, v_name, v_platform, v_msg, v_existing
  FROM public.social_interactions WHERE id = p_interaction_id;

  IF v_tenant IS NULL THEN RAISE EXCEPTION 'interaction not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO public.marketing_leads (tenant_id, full_name, source, owner_id, journey_stage, pipeline_stage)
  VALUES (v_tenant, COALESCE(NULLIF(v_name,''), 'عميل من ' || v_platform),
          'social:' || v_platform, p_owner_id, 'consideration', 'contacted')
  RETURNING id INTO v_lead;

  UPDATE public.social_interactions
     SET converted_lead_id = v_lead, status = 'assigned', assigned_to = COALESCE(p_owner_id, assigned_to), updated_at = NOW()
   WHERE id = p_interaction_id;

  RETURN v_lead;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) دالة KPIs اجتماعية إجمالية (Reach/Engagement/ROI)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.social_kpis()
RETURNS TABLE (
  total_reach BIGINT, total_impressions BIGINT, total_engagements BIGINT,
  total_clicks BIGINT, attributed_revenue NUMERIC, published_posts BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT sum(reach) FROM public.social_post_targets WHERE tenant_id = public.current_user_tenant_id()),0),
    COALESCE((SELECT sum(impressions) FROM public.social_post_targets WHERE tenant_id = public.current_user_tenant_id()),0),
    COALESCE((SELECT sum(likes+comments_count+shares+saves) FROM public.social_post_targets WHERE tenant_id = public.current_user_tenant_id()),0),
    COALESCE((SELECT sum(clicks) FROM public.social_post_targets WHERE tenant_id = public.current_user_tenant_id()),0),
    COALESCE((SELECT sum(attributed_revenue) FROM public.social_utm_links WHERE tenant_id = public.current_user_tenant_id()),0),
    COALESCE((SELECT count(*) FROM public.social_posts WHERE tenant_id = public.current_user_tenant_id() AND status='published'),0);
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) الصلاحيات
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.build_utm_url(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_interaction_to_lead(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_kpis() TO authenticated;

-- ============================================================================
--  نهاية 0158_marketing_social.sql
-- ============================================================================
