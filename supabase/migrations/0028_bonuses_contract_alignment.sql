-- ============================================================================
--  FILE: 0028_bonuses_contract_alignment.sql
--  PURPOSE: Align bonuses table contract with frontend/SDK usage
--  DEPENDS ON: 0006_hr_expansion.sql (bonuses table)
--  SAFETY LEVEL: HIGH — additive, idempotent, preserves existing data
-- ============================================================================
--
--  Context:
--    The current frontend/SDK uses bonuses.bonus_date for ordering and older
--    code paths still use bonus_amount. The canonical table created in 0006
--    contains amount, period_start, period_end, created_at, but not bonus_date
--    or bonus_amount.
--
--  This migration:
--    - Adds bonus_date and bonus_amount for backward/forward compatibility.
--    - Backfills existing rows from amount/period_start/created_at.
--    - Adds a trigger to keep amount and bonus_amount synchronized.
--    - Normalizes legacy Arabic status values to canonical English values.
-- ============================================================================

ALTER TABLE IF EXISTS public.bonuses
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bonus_date DATE,
  ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'IQD';

-- Backfill tenant_id for legacy rows if possible through employees.
UPDATE public.bonuses b
SET tenant_id = e.tenant_id
FROM public.employees e
WHERE b.tenant_id IS NULL
  AND b.employee_id = e.id;

-- Fallback to the default/demo tenant if the project has legacy data without an employee link.
UPDATE public.bonuses
SET tenant_id = COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001'::uuid)
WHERE tenant_id IS NULL;

-- Backfill compatible fields.
UPDATE public.bonuses
SET
  bonus_date = COALESCE(bonus_date, period_start, created_at::date, CURRENT_DATE),
  bonus_amount = COALESCE(bonus_amount, amount, 0)
WHERE bonus_date IS NULL
   OR bonus_amount IS NULL;

-- Keep defaults for future rows.
ALTER TABLE public.bonuses
  ALTER COLUMN bonus_date SET DEFAULT CURRENT_DATE;

-- Keep amount and bonus_amount synchronized for legacy and new code paths.
CREATE OR REPLACE FUNCTION public.sync_bonus_amount_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS NULL AND NEW.bonus_amount IS NOT NULL THEN
    NEW.amount := NEW.bonus_amount;
  END IF;

  IF NEW.bonus_amount IS NULL AND NEW.amount IS NOT NULL THEN
    NEW.bonus_amount := NEW.amount;
  END IF;

  IF NEW.bonus_date IS NULL THEN
    NEW.bonus_date := COALESCE(NEW.period_start, CURRENT_DATE);
  END IF;

  IF NEW.currency IS NULL OR NEW.currency = '' THEN
    NEW.currency := 'IQD';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bonus_amount_fields ON public.bonuses;
CREATE TRIGGER trg_sync_bonus_amount_fields
  BEFORE INSERT OR UPDATE ON public.bonuses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_bonus_amount_fields();

-- Normalize old Arabic statuses that some legacy code wrote.
UPDATE public.bonuses
SET status = CASE status
  WHEN 'موافق' THEN 'approved'
  WHEN 'ملغي' THEN 'cancelled'
  WHEN 'مرفوض' THEN 'cancelled'
  WHEN 'انتظار' THEN 'pending'
  ELSE status
END
WHERE status IN ('موافق', 'ملغي', 'مرفوض', 'انتظار');

-- Helpful indexes for the current SDK queries and dashboards.
CREATE INDEX IF NOT EXISTS idx_bonuses_tenant_bonus_date
  ON public.bonuses(tenant_id, bonus_date DESC);

CREATE INDEX IF NOT EXISTS idx_bonuses_tenant_employee_bonus_date
  ON public.bonuses(tenant_id, employee_id, bonus_date DESC);

CREATE INDEX IF NOT EXISTS idx_bonuses_tenant_status
  ON public.bonuses(tenant_id, status);

-- RLS policies: replace generic policy with a clear tenant-scoped staff policy.
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_bonuses_select ON public.bonuses;
DROP POLICY IF EXISTS kyvzon_bonuses_insert ON public.bonuses;
DROP POLICY IF EXISTS kyvzon_bonuses_update ON public.bonuses;
DROP POLICY IF EXISTS kyvzon_bonuses_delete ON public.bonuses;

CREATE POLICY kyvzon_bonuses_select ON public.bonuses
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR employee_id = public.current_user_employee_id()
    )
  );

CREATE POLICY kyvzon_bonuses_insert ON public.bonuses
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

CREATE POLICY kyvzon_bonuses_update ON public.bonuses
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );

CREATE POLICY kyvzon_bonuses_delete ON public.bonuses
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

-- Ask PostgREST to reload its schema cache after adding columns.
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bonuses'
      AND column_name = 'bonus_date'
  ), 'bonuses.bonus_date must exist';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bonuses'
      AND column_name = 'bonus_amount'
  ), 'bonuses.bonus_amount must exist';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bonuses'
      AND column_name = 'tenant_id'
  ), 'bonuses.tenant_id must exist';
END $$;
