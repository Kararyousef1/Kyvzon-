-- ============================================================================
--  FILE: 0018_hr_service_center_health_safety.sql
--  PURPOSE: HR Portal maturity slice: service center support + health & safety CAPA
--  SCOPE: Existing HR Portal only
--  SAFETY LEVEL: HIGH — idempotent
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.corrective_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  incident_id    UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  title          VARCHAR(250) NOT NULL,
  description    TEXT,
  priority       VARCHAR(30) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status         VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  owner_id       UUID,
  due_date       DATE,
  completed_by   UUID,
  completed_at   TIMESTAMPTZ,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrective_actions_tenant_status
  ON public.corrective_actions(tenant_id, status, priority, due_date);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_incident
  ON public.corrective_actions(tenant_id, incident_id);

ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_corrective_actions_select ON public.corrective_actions;
CREATE POLICY kyvzon_corrective_actions_select ON public.corrective_actions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_corrective_actions_write ON public.corrective_actions;
CREATE POLICY kyvzon_corrective_actions_write ON public.corrective_actions
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff());

DROP TRIGGER IF EXISTS trg_corrective_actions_updated_at ON public.corrective_actions;
CREATE TRIGGER trg_corrective_actions_updated_at
  BEFORE UPDATE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'corrective_actions');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'corrective_actions'),
    'RLS must be enabled on corrective_actions';
END $$;
