-- ============================================================================
-- IFRS-ready general-ledger hardening for the multi-entity foundation.
-- Financial posting is performed only through post_journal_entry() so a client
-- cannot mark an unbalanced, closed-period or unauthorised entry as posted.
-- ============================================================================

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS account_category TEXT,
  ADD COLUMN IF NOT EXISTS normal_balance TEXT CHECK (normal_balance IN ('debit', 'credit')),
  ADD COLUMN IF NOT EXISTS allow_posting BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_control_account BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.journal_books
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS journal_book_id UUID REFERENCES public.journal_books(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS accounting_period_id UUID REFERENCES public.accounting_periods(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS transaction_currency_code CHAR(3) REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(24,10) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS line_number INTEGER,
  ADD COLUMN IF NOT EXISTS transaction_debit NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (transaction_debit >= 0),
  ADD COLUMN IF NOT EXISTS transaction_credit NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (transaction_credit >= 0),
  ADD COLUMN IF NOT EXISTS transaction_currency_code CHAR(3) REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.finance_projects(id) ON DELETE SET NULL;

-- Backfill current installations into each tenant's explicit DEFAULT entity.
UPDATE public.chart_of_accounts account
SET legal_entity_id = entity.id
FROM public.legal_entities entity
WHERE entity.tenant_id = account.tenant_id
  AND entity.code = 'DEFAULT'
  AND account.legal_entity_id IS NULL;

UPDATE public.journal_books book
SET legal_entity_id = entity.id
FROM public.legal_entities entity
WHERE entity.tenant_id = book.tenant_id
  AND entity.code = 'DEFAULT'
  AND book.legal_entity_id IS NULL;

UPDATE public.journal_entries entry
SET
  legal_entity_id = entity.id,
  transaction_currency_code = COALESCE(entry.transaction_currency_code, entity.base_currency_code)
FROM public.legal_entities entity
WHERE entity.tenant_id = entry.tenant_id
  AND entity.code = 'DEFAULT'
  AND entry.legal_entity_id IS NULL;

UPDATE public.journal_entry_lines line
SET legal_entity_id = entry.legal_entity_id,
    transaction_currency_code = COALESCE(line.transaction_currency_code, entry.transaction_currency_code)
FROM public.journal_entries entry
WHERE entry.id = line.entry_id
  AND line.legal_entity_id IS NULL;

ALTER TABLE public.chart_of_accounts ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.journal_books ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.journal_entries ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.journal_entries ALTER COLUMN transaction_currency_code SET NOT NULL;
ALTER TABLE public.journal_entry_lines ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.journal_entry_lines ALTER COLUMN transaction_currency_code SET NOT NULL;

-- Existing migrations used a smaller status check. Replace it only after
-- preserving all legacy values in the valid state set.
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_status_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'reversed', 'voided'));

ALTER TABLE public.journal_entry_lines DROP CONSTRAINT IF EXISTS line_amount_check;
ALTER TABLE public.journal_entry_lines
  ADD CONSTRAINT journal_entry_line_single_side_check
  CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (credit_amount > 0 AND debit_amount = 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_chart_account_entity_code
  ON public.chart_of_accounts(legal_entity_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_book_entity_code
  ON public.journal_books(legal_entity_id, book_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entry_entity_idempotency
  ON public.journal_entries(legal_entity_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_line_entry_number
  ON public.journal_entry_lines(entry_id, line_number)
  WHERE line_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity_period_status
  ON public.journal_entries(legal_entity_id, accounting_period_id, status, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entity_account
  ON public.journal_entry_lines(legal_entity_id, account_id);

CREATE TABLE IF NOT EXISTS public.finance_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  before_data JSONB,
  after_data JSONB,
  correlation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_audit_entity_time
  ON public.finance_audit_events(legal_entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.finance_prevent_posted_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
  FROM public.journal_entries
  WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);

  IF parent_status IN ('posted', 'reversed', 'voided') THEN
    RAISE EXCEPTION 'Posted, reversed or voided journal entries are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_line_immutable ON public.journal_entry_lines;
CREATE TRIGGER trg_journal_line_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.finance_prevent_posted_entry_mutation();

CREATE OR REPLACE FUNCTION public.post_journal_entry(p_entry_id UUID)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entry_row public.journal_entries%ROWTYPE;
  debit_total NUMERIC(18,4);
  credit_total NUMERIC(18,4);
  line_count INTEGER;
BEGIN
  SELECT * INTO entry_row
  FROM public.journal_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;
  IF NOT public.current_user_can_manage_legal_entity(entry_row.legal_entity_id) THEN
    RAISE EXCEPTION 'Not authorised to post for this legal entity';
  END IF;
  IF entry_row.status NOT IN ('draft', 'submitted', 'approved') THEN
    RAISE EXCEPTION 'Only draft, submitted or approved entries can be posted';
  END IF;
  IF entry_row.accounting_period_id IS NULL THEN
    RAISE EXCEPTION 'An accounting period is required before posting';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_periods period
    WHERE period.id = entry_row.accounting_period_id
      AND period.legal_entity_id = entry_row.legal_entity_id
      AND period.status = 'open'
  ) THEN
    RAISE EXCEPTION 'The accounting period is not open';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO line_count, debit_total, credit_total
  FROM public.journal_entry_lines
  WHERE entry_id = entry_row.id;

  IF line_count < 2 THEN
    RAISE EXCEPTION 'A journal entry requires at least two lines';
  END IF;
  IF debit_total <> credit_total OR debit_total <= 0 THEN
    RAISE EXCEPTION 'Journal entry is not balanced';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.journal_entry_lines line
    JOIN public.chart_of_accounts account ON account.id = line.account_id
    WHERE line.entry_id = entry_row.id
      AND (
        line.legal_entity_id <> entry_row.legal_entity_id
        OR account.legal_entity_id <> entry_row.legal_entity_id
        OR NOT account.is_active
        OR NOT account.allow_posting
      )
  ) THEN
    RAISE EXCEPTION 'Journal entry includes an invalid or non-posting account';
  END IF;

  UPDATE public.journal_entries
  SET status = 'posted',
      total_debit = debit_total,
      total_credit = credit_total,
      posted_at = NOW(),
      posted_by = auth.uid(),
      updated_at = NOW()
  WHERE id = entry_row.id
  RETURNING * INTO entry_row;

  INSERT INTO public.finance_audit_events (
    tenant_id, legal_entity_id, event_type, aggregate_type, aggregate_id,
    actor_id, after_data
  ) VALUES (
    entry_row.tenant_id, entry_row.legal_entity_id, 'journal_entry_posted',
    'journal_entry', entry_row.id, auth.uid(), to_jsonb(entry_row)
  );

  RETURN entry_row;
END;
$$;

REVOKE ALL ON FUNCTION public.post_journal_entry(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(UUID) TO authenticated;

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chart_select ON public.chart_of_accounts;
DROP POLICY IF EXISTS chart_insert ON public.chart_of_accounts;
DROP POLICY IF EXISTS chart_update ON public.chart_of_accounts;
DROP POLICY IF EXISTS chart_delete ON public.chart_of_accounts;
DROP POLICY IF EXISTS journal_select ON public.journal_entries;
DROP POLICY IF EXISTS journal_insert ON public.journal_entries;
DROP POLICY IF EXISTS journal_update ON public.journal_entries;
DROP POLICY IF EXISTS journal_delete ON public.journal_entries;
DROP POLICY IF EXISTS line_select ON public.journal_entry_lines;
DROP POLICY IF EXISTS line_insert ON public.journal_entry_lines;
DROP POLICY IF EXISTS line_update ON public.journal_entry_lines;

CREATE POLICY finance_chart_access ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id))
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_books_access ON public.journal_books FOR ALL TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id))
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_entries_access ON public.journal_entries FOR ALL TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id))
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_lines_access ON public.journal_entry_lines FOR ALL TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id))
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_audit_read ON public.finance_audit_events FOR SELECT TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id));

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='legal_entity_id');
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='post_journal_entry');
END $$;
