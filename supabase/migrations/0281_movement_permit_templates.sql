-- ============================================================================
-- FILE: 0281_movement_permit_templates.sql
-- PURPOSE: E01 - Employee Movement Permit Templates & Advanced Lifecycle Support
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_movement_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_name        VARCHAR(200) NOT NULL,
  permit_type          VARCHAR(50) NOT NULL DEFAULT 'official',
  destination_id       UUID REFERENCES public.movement_locations(id),
  destination_name     VARCHAR(200) NOT NULL,
  purpose              TEXT NOT NULL,
  max_duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_movement_template_name UNIQUE (tenant_id, template_name)
);

ALTER TABLE public.employee_movement_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_employee_movement_templates_all ON public.employee_movement_templates;
CREATE POLICY kyvzon_employee_movement_templates_all ON public.employee_movement_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP TRIGGER IF EXISTS trg_employee_movement_templates_updated ON public.employee_movement_templates;
CREATE TRIGGER trg_employee_movement_templates_updated BEFORE UPDATE ON public.employee_movement_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_movement_templates');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='employee_movement_templates'), 'RLS must be enabled';
END $$;
