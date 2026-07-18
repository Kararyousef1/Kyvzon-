-- =============================================================================
-- 0143_training_quizzes.sql
-- إنشاء جدول الاختبارات للتدريب — إزالة الاعتماد على localStorage
-- =============================================================================
-- السياق: TrainingManagementPage كانت تستخدم localStorage لـ quizzes_data
-- العلاج: جدول quizzes مع RLS + tenant isolation
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'اختبار',
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  passing_score INTEGER NOT NULL DEFAULT 70 CHECK (passing_score BETWEEN 0 AND 100),
  time_limit_minutes INTEGER DEFAULT 30 CHECK (time_limit_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, course_id, title)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_tenant_course ON public.quizzes(tenant_id, course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_active ON public.quizzes(tenant_id, is_active) WHERE is_active = true;

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quizzes_tenant_isolation ON public.quizzes;
CREATE POLICY quizzes_tenant_isolation ON public.quizzes
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

COMMENT ON TABLE public.quizzes IS 'Training quizzes — migrated from localStorage in TrainingManagementPage, part of P1 fix for HR portal';

DO $$
BEGIN
  RAISE NOTICE '0143 quizzes table created — HR Training now uses Supabase, not localStorage';
END
$$;
