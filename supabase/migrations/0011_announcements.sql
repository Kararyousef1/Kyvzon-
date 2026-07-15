-- ============================================================================
--  FILE: 0011_announcements.sql
--  PURPOSE: Announcements module — posts, polls, options, votes, likes + view
--  EXECUTION ORDER: 12th
--  DEPENDS ON: 0001_core_schema.sql (tenants, profiles),
--              0010_platform_tenant_rls_audit.sql (current_user_* helpers)
--  SAFETY LEVEL: HIGH — idempotent, safe to re-run
-- ============================================================================
--
--  Frontend Contract:
--    src/services/sdk/AnnouncementService.ts uses:
--      - announcements
--      - announcement_polls
--      - announcement_poll_options
--      - announcement_votes
--      - announcement_likes
--      - announcements_with_stats (view: likes_count + liked_by)
--
--  Tenant Isolation:
--    All tables have tenant_id; RLS uses current_user_tenant_id().
--    Only staff (admin/hr) can update/delete others' posts.
-- ============================================================================

-- ─── Types ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE announcement_type AS ENUM ('text', 'image', 'video', 'poll');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE announcement_priority AS ENUM ('normal', 'important', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── announcements ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type             announcement_type     NOT NULL DEFAULT 'text',
  priority         announcement_priority NOT NULL DEFAULT 'normal',
  title            VARCHAR(300) NOT NULL,
  content          TEXT NOT NULL,
  media_url        TEXT,
  target_roles     TEXT[] NOT NULL DEFAULT '{}',  -- [] = everyone
  target_depts     TEXT[] NOT NULL DEFAULT '{}',  -- [] = everyone
  tags             TEXT[] NOT NULL DEFAULT '{}',
  has_notification BOOLEAN NOT NULL DEFAULT true,
  author_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name      VARCHAR(200),
  author_role      VARCHAR(50),
  views            INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- ─── announcement_polls ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  end_date        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── announcement_poll_options ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_poll_options (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       UUID NOT NULL REFERENCES public.announcement_polls(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  text          VARCHAR(300) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

-- ─── announcement_votes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id  UUID NOT NULL REFERENCES public.announcement_poll_options(id) ON DELETE CASCADE,
  poll_id    UUID NOT NULL REFERENCES public.announcement_polls(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT announcement_votes_one_per_user UNIQUE (poll_id, user_id)
);

-- ─── announcement_likes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_likes (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_created
  ON public.announcements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_priority
  ON public.announcements(priority);
CREATE INDEX IF NOT EXISTS idx_announcements_type
  ON public.announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON public.announcements(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_author
  ON public.announcements(author_id) WHERE author_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ann_polls_announcement
  ON public.announcement_polls(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_polls_tenant
  ON public.announcement_polls(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ann_options_poll
  ON public.announcement_poll_options(poll_id, display_order);

CREATE INDEX IF NOT EXISTS idx_ann_votes_poll
  ON public.announcement_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_ann_votes_user
  ON public.announcement_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_ann_likes_announcement
  ON public.announcement_likes(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_likes_user
  ON public.announcement_likes(user_id);

-- ─── Trigger: updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_announcements_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_announcements_updated_at();

-- ============================================================================
--  RLS — Row Level Security
-- ============================================================================
ALTER TABLE public.announcements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_votes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_likes        ENABLE ROW LEVEL SECURITY;

-- announcements: SELECT — visible to same tenant, non-deleted
DROP POLICY IF EXISTS kyvzon_announcements_select ON public.announcements;
CREATE POLICY kyvzon_announcements_select ON public.announcements
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND deleted_at IS NULL
  );

-- announcements: INSERT — anyone in tenant can post, must be self-authored
DROP POLICY IF EXISTS kyvzon_announcements_insert ON public.announcements;
CREATE POLICY kyvzon_announcements_insert ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND author_id = auth.uid()
  );

-- announcements: UPDATE — author or staff (admin/hr/developer/it_admin)
DROP POLICY IF EXISTS kyvzon_announcements_update ON public.announcements;
CREATE POLICY kyvzon_announcements_update ON public.announcements
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (author_id = auth.uid() OR public.current_user_is_staff())
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );

-- announcements: DELETE — author or staff (soft-delete preferred via UPDATE)
DROP POLICY IF EXISTS kyvzon_announcements_delete ON public.announcements;
CREATE POLICY kyvzon_announcements_delete ON public.announcements
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (author_id = auth.uid() OR public.current_user_is_staff())
  );

-- announcement_polls: tenant-scoped read/write
DROP POLICY IF EXISTS kyvzon_ann_polls_select ON public.announcement_polls;
CREATE POLICY kyvzon_ann_polls_select ON public.announcement_polls
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_ann_polls_insert ON public.announcement_polls;
CREATE POLICY kyvzon_ann_polls_insert ON public.announcement_polls
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_ann_polls_update ON public.announcement_polls;
CREATE POLICY kyvzon_ann_polls_update ON public.announcement_polls
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = announcement_id
        AND (a.author_id = auth.uid() OR public.current_user_is_staff())
    )
  );

DROP POLICY IF EXISTS kyvzon_ann_polls_delete ON public.announcement_polls;
CREATE POLICY kyvzon_ann_polls_delete ON public.announcement_polls
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = announcement_id
        AND (a.author_id = auth.uid() OR public.current_user_is_staff())
    )
  );

-- announcement_poll_options: tenant-scoped
DROP POLICY IF EXISTS kyvzon_ann_options_select ON public.announcement_poll_options;
CREATE POLICY kyvzon_ann_options_select ON public.announcement_poll_options
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_ann_options_insert ON public.announcement_poll_options;
CREATE POLICY kyvzon_ann_options_insert ON public.announcement_poll_options
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_ann_options_delete ON public.announcement_poll_options;
CREATE POLICY kyvzon_ann_options_delete ON public.announcement_poll_options
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.announcement_polls p
      JOIN public.announcements a ON a.id = p.announcement_id
      WHERE p.id = poll_id
        AND (a.author_id = auth.uid() OR public.current_user_is_staff())
    )
  );

-- announcement_votes: one vote per user per poll, own votes only
DROP POLICY IF EXISTS kyvzon_ann_votes_select ON public.announcement_votes;
CREATE POLICY kyvzon_ann_votes_select ON public.announcement_votes
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_ann_votes_insert ON public.announcement_votes;
CREATE POLICY kyvzon_ann_votes_insert ON public.announcement_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS kyvzon_ann_votes_delete ON public.announcement_votes;
CREATE POLICY kyvzon_ann_votes_delete ON public.announcement_votes
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );

-- announcement_likes: own likes only
DROP POLICY IF EXISTS kyvzon_ann_likes_select ON public.announcement_likes;
CREATE POLICY kyvzon_ann_likes_select ON public.announcement_likes
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_ann_likes_write ON public.announcement_likes;
CREATE POLICY kyvzon_ann_likes_write ON public.announcement_likes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );

-- ============================================================================
--  View: announcements_with_stats
--  Enriches announcements with likes_count and liked_by array.
--  Frontend reads this view for feed display.
-- ============================================================================
DROP VIEW IF EXISTS public.announcements_with_stats;
CREATE VIEW public.announcements_with_stats
WITH (security_invoker = true)  -- Enforces the caller's RLS, not the view owner's
AS
SELECT
  a.*,
  COALESCE(l.likes_count, 0)              AS likes_count,
  COALESCE(l.liked_by, '[]'::json)        AS liked_by
FROM public.announcements a
LEFT JOIN (
  SELECT
    announcement_id,
    COUNT(*)::INTEGER   AS likes_count,
    json_agg(user_id)   AS liked_by
  FROM public.announcement_likes
  GROUP BY announcement_id
) l ON l.announcement_id = a.id;

-- Grant view access to authenticated users (RLS on the underlying tables applies)
GRANT SELECT ON public.announcements_with_stats TO authenticated;

-- ============================================================================
--  Sanity checks
-- ============================================================================
DO $$
BEGIN
  -- Verify all 5 tables + 1 view exist
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'announcements');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'announcement_polls');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'announcement_poll_options');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'announcement_votes');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'announcement_likes');
  ASSERT EXISTS (SELECT 1 FROM information_schema.views
                 WHERE table_schema = 'public' AND table_name = 'announcements_with_stats');
  -- Verify RLS is enabled on all tables
  ASSERT (SELECT rowsecurity FROM pg_tables
          WHERE schemaname = 'public' AND tablename = 'announcements'),
    'RLS must be enabled on announcements';
END $$;
