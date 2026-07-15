-- ════════════════════════════════════════════════════════════════
--  Migration 080 — جدول التبليغات والإعلانات
--  تنفيذ بعد: 001_initial_schema.sql, 101_add_tenant_id_and_rls.sql
-- ════════════════════════════════════════════════════════════════

-- ─── الأنواع ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE announcement_type AS ENUM ('text', 'image', 'video', 'poll');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE announcement_priority AS ENUM ('normal', 'important', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── جدول التبليغات ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type            announcement_type    NOT NULL DEFAULT 'text',
  priority        announcement_priority NOT NULL DEFAULT 'normal',
  title           VARCHAR(300) NOT NULL,
  content         TEXT NOT NULL,
  media_url       TEXT,
  target_roles    TEXT[] NOT NULL DEFAULT '{}',       -- [] = الكل
  target_depts    TEXT[] NOT NULL DEFAULT '{}',       -- [] = الكل
  tags            TEXT[] NOT NULL DEFAULT '{}',
  has_notification BOOLEAN NOT NULL DEFAULT true,
  author_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name     VARCHAR(200),
  author_role     VARCHAR(50),
  views           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ                         -- soft delete
);

-- ─── جدول الاستفتاءات ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  end_date        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.announcement_poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES public.announcement_polls(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  text        VARCHAR(300) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

-- ─── جدول الأصوات ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id   UUID NOT NULL REFERENCES public.announcement_poll_options(id) ON DELETE CASCADE,
  poll_id     UUID NOT NULL REFERENCES public.announcement_polls(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, user_id)        -- كل مستخدم يصوت مرة واحدة لكل استفتاء
);

-- ─── جدول الإعجابات ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_likes (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);

-- ─── الفهارس ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_announcements_tenant     ON public.announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created    ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_priority   ON public.announcements(priority);
CREATE INDEX IF NOT EXISTS idx_announcements_type       ON public.announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_deleted    ON public.announcements(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ann_polls_announcement   ON public.announcement_polls(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_votes_poll           ON public.announcement_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_ann_votes_user           ON public.announcement_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_ann_likes_ann            ON public.announcement_likes(announcement_id);

-- ─── Trigger: updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_announcement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION update_announcement_updated_at();

-- ════════════════════════════════════════════════════════════════
--  RLS — Row Level Security
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.announcements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_votes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_likes      ENABLE ROW LEVEL SECURITY;

-- announcements: SELECT — مرئي لأعضاء نفس الـ tenant فقط
DROP POLICY IF EXISTS ann_select ON public.announcements;
CREATE POLICY ann_select ON public.announcements
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND deleted_at IS NULL
  );

-- announcements: INSERT — أصحاب صلاحية النشر فقط
DROP POLICY IF EXISTS ann_insert ON public.announcements;
CREATE POLICY ann_insert ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND author_id = auth.uid()
  );

-- announcements: UPDATE/DELETE — صاحب التبليغ أو admin/hr
DROP POLICY IF EXISTS ann_update ON public.announcements;
CREATE POLICY ann_update ON public.announcements
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'hr')
      )
    )
  );

DROP POLICY IF EXISTS ann_delete ON public.announcements;
CREATE POLICY ann_delete ON public.announcements
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'hr')
      )
    )
  );

-- polls/options/votes/likes: عزل بـ tenant_id
DROP POLICY IF EXISTS ann_polls_select ON public.announcement_polls;
CREATE POLICY ann_polls_select ON public.announcement_polls
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS ann_polls_insert ON public.announcement_polls;
CREATE POLICY ann_polls_insert ON public.announcement_polls
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS ann_options_select ON public.announcement_poll_options;
CREATE POLICY ann_options_select ON public.announcement_poll_options
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS ann_options_insert ON public.announcement_poll_options;
CREATE POLICY ann_options_insert ON public.announcement_poll_options
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS ann_votes_select ON public.announcement_votes;
CREATE POLICY ann_votes_select ON public.announcement_votes
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS ann_votes_insert ON public.announcement_votes;
CREATE POLICY ann_votes_insert ON public.announcement_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS ann_likes_all ON public.announcement_likes;
CREATE POLICY ann_likes_all ON public.announcement_likes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND user_id = auth.uid()
  );

-- ════════════════════════════════════════════════════════════════
--  View: announcements مع عدد الإعجابات والأصوات
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.announcements_with_stats AS
SELECT
  a.*,
  COALESCE(l.likes_count, 0)   AS likes_count,
  COALESCE(l.liked_by, '[]'::json) AS liked_by
FROM public.announcements a
LEFT JOIN (
  SELECT
    announcement_id,
    COUNT(*)           AS likes_count,
    json_agg(user_id)  AS liked_by
  FROM public.announcement_likes
  GROUP BY announcement_id
) l ON l.announcement_id = a.id;
