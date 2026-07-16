-- ============================================================================
--  FILE: 0022_supervisor_portal_operations.sql
--  PURPOSE: Supervisor Portal operations: team tasks, shift notes, checklists
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.team_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL,
  employee_id UUID,
  title VARCHAR(250) NOT NULL,
  description TEXT,
  priority VARCHAR(30) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shift_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_type VARCHAR(50),
  note_type VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (note_type IN ('handover','issue','safety','quality','general')),
  title VARCHAR(250) NOT NULL,
  content TEXT,
  severity VARCHAR(30) NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.operational_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL,
  checklist_type VARCHAR(30) NOT NULL DEFAULT 'safety' CHECK (checklist_type IN ('safety','quality','opening','closing','equipment','other')),
  title VARCHAR(250) NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  status VARCHAR(30) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_tasks_supervisor ON public.team_tasks(tenant_id, supervisor_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_shift_notes_supervisor ON public.shift_notes(tenant_id, supervisor_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_checklists_supervisor ON public.operational_checklists(tenant_id, supervisor_id, created_at DESC);

ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_team_tasks_access ON public.team_tasks;
CREATE POLICY kyvzon_team_tasks_access ON public.team_tasks FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR supervisor_id = auth.uid()))
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR supervisor_id = auth.uid()));

DROP POLICY IF EXISTS kyvzon_shift_notes_access ON public.shift_notes;
CREATE POLICY kyvzon_shift_notes_access ON public.shift_notes FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR supervisor_id = auth.uid()))
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR supervisor_id = auth.uid()));

DROP POLICY IF EXISTS kyvzon_checklists_access ON public.operational_checklists;
CREATE POLICY kyvzon_checklists_access ON public.operational_checklists FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR supervisor_id = auth.uid()))
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR supervisor_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_team_tasks_updated_at ON public.team_tasks;
CREATE TRIGGER trg_team_tasks_updated_at BEFORE UPDATE ON public.team_tasks FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_shift_notes_updated_at ON public.shift_notes;
CREATE TRIGGER trg_shift_notes_updated_at BEFORE UPDATE ON public.shift_notes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_checklists_updated_at ON public.operational_checklists;
CREATE TRIGGER trg_checklists_updated_at BEFORE UPDATE ON public.operational_checklists FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='team_tasks');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shift_notes');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='operational_checklists');
END $$;
