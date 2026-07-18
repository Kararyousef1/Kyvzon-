-- Atomic draft creation for the general ledger. The client submits a header and
-- lines; this function validates entity ownership and stores them together.

CREATE TABLE IF NOT EXISTS public.finance_document_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
  document_type TEXT NOT NULL,
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, fiscal_year, document_type)
);

ALTER TABLE public.finance_document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_document_sequences_read ON public.finance_document_sequences
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.create_journal_draft(
  p_legal_entity_id UUID,
  p_accounting_period_id UUID,
  p_entry_date DATE,
  p_description TEXT,
  p_reference TEXT,
  p_transaction_currency_code CHAR(3),
  p_exchange_rate NUMERIC,
  p_lines JSONB,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant UUID;
  period_record public.accounting_periods%ROWTYPE;
  line_count INTEGER;
  debit_total NUMERIC(18,4);
  credit_total NUMERIC(18,4);
  next_document_number BIGINT;
  entry_number_value TEXT;
  created_entry public.journal_entries%ROWTYPE;
BEGIN
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN
    RAISE EXCEPTION 'Not authorised to create a journal entry for this legal entity';
  END IF;
  IF p_entry_date IS NULL OR p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'Entry date and description are required';
  END IF;
  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'Exchange rate must be greater than zero';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Journal lines must be an array';
  END IF;

  SELECT tenant_id INTO tenant FROM public.legal_entities WHERE id = p_legal_entity_id;
  IF tenant IS NULL THEN RAISE EXCEPTION 'Legal entity not found'; END IF;

  SELECT * INTO period_record
  FROM public.accounting_periods
  WHERE id = p_accounting_period_id
    AND legal_entity_id = p_legal_entity_id;
  IF NOT FOUND OR period_record.status <> 'open' OR p_entry_date NOT BETWEEN period_record.start_date AND period_record.end_date THEN
    RAISE EXCEPTION 'Entry date must be within an open accounting period';
  END IF;

  SELECT COUNT(*), COALESCE(SUM((line->>'debit_amount')::NUMERIC), 0), COALESCE(SUM((line->>'credit_amount')::NUMERIC), 0)
  INTO line_count, debit_total, credit_total
  FROM jsonb_array_elements(p_lines) AS line;

  IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Journal entry must contain at least two balanced lines';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) line
    WHERE NOT (line ? 'account_id')
      OR COALESCE((line->>'debit_amount')::NUMERIC, 0) < 0
      OR COALESCE((line->>'credit_amount')::NUMERIC, 0) < 0
      OR (
        (COALESCE((line->>'debit_amount')::NUMERIC, 0) > 0)::INTEGER
        + (COALESCE((line->>'credit_amount')::NUMERIC, 0) > 0)::INTEGER
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'Each line must contain one posting account and exactly one debit or credit amount';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lines) line
    LEFT JOIN public.chart_of_accounts account ON account.id = (line->>'account_id')::UUID
    WHERE account.id IS NULL
      OR account.legal_entity_id <> p_legal_entity_id
      OR NOT account.is_active
      OR NOT account.allow_posting
  ) THEN
    RAISE EXCEPTION 'One or more posting accounts are invalid';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO created_entry
    FROM public.journal_entries
    WHERE legal_entity_id = p_legal_entity_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN created_entry; END IF;
  END IF;

  INSERT INTO public.finance_document_sequences (tenant_id, legal_entity_id, fiscal_year, document_type, last_number)
  VALUES (tenant, p_legal_entity_id, EXTRACT(YEAR FROM p_entry_date)::INTEGER, 'journal_entry', 1)
  ON CONFLICT (legal_entity_id, fiscal_year, document_type)
  DO UPDATE SET last_number = public.finance_document_sequences.last_number + 1, updated_at = NOW()
  RETURNING last_number INTO next_document_number;

  entry_number_value := format('JE-%s-%s', EXTRACT(YEAR FROM p_entry_date)::INTEGER, lpad(next_document_number::TEXT, 6, '0'));

  INSERT INTO public.journal_entries (
    tenant_id, legal_entity_id, accounting_period_id, entry_number, entry_date,
    description, reference, total_debit, total_credit, status,
    transaction_currency_code, exchange_rate, created_by, idempotency_key
  ) VALUES (
    tenant, p_legal_entity_id, p_accounting_period_id, entry_number_value, p_entry_date,
    btrim(p_description), NULLIF(btrim(p_reference), ''), debit_total, credit_total, 'draft',
    p_transaction_currency_code, p_exchange_rate, auth.uid(), p_idempotency_key
  ) RETURNING * INTO created_entry;

  INSERT INTO public.journal_entry_lines (
    entry_id, tenant_id, legal_entity_id, line_number, account_id, description,
    debit_amount, credit_amount, transaction_debit, transaction_credit,
    transaction_currency_code, cost_center_id, project_id
  )
  SELECT
    created_entry.id, tenant, p_legal_entity_id, ordinal,
    (line->>'account_id')::UUID, NULLIF(btrim(line->>'description'), ''),
    COALESCE((line->>'debit_amount')::NUMERIC, 0), COALESCE((line->>'credit_amount')::NUMERIC, 0),
    COALESCE((line->>'debit_amount')::NUMERIC, 0), COALESCE((line->>'credit_amount')::NUMERIC, 0),
    p_transaction_currency_code,
    NULLIF(line->>'cost_center_id', '')::UUID, NULLIF(line->>'project_id', '')::UUID
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS rows(line, ordinal);

  INSERT INTO public.finance_audit_events (tenant_id, legal_entity_id, event_type, aggregate_type, aggregate_id, actor_id, after_data, correlation_id)
  VALUES (tenant, p_legal_entity_id, 'journal_entry_draft_created', 'journal_entry', created_entry.id, auth.uid(), to_jsonb(created_entry), p_idempotency_key);

  RETURN created_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_journal_draft(UUID, UUID, DATE, TEXT, TEXT, CHAR(3), NUMERIC, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_journal_draft(UUID, UUID, DATE, TEXT, TEXT, CHAR(3), NUMERIC, JSONB, UUID) TO authenticated;
