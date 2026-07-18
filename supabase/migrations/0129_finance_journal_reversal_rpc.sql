-- Reversal is the only correction path for a posted entry. It creates and posts
-- an opposite entry; it never mutates the original financial lines.

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  p_entry_id UUID,
  p_accounting_period_id UUID,
  p_reversal_date DATE,
  p_reason TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original public.journal_entries%ROWTYPE;
  reversal_lines JSONB;
  reversal_draft public.journal_entries%ROWTYPE;
  posted_reversal public.journal_entries%ROWTYPE;
BEGIN
  SELECT * INTO original FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(original.legal_entity_id) THEN
    RAISE EXCEPTION 'Not authorised to reverse this journal entry';
  END IF;
  IF original.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted journal entries can be reversed';
  END IF;
  IF original.reversed_entry_id IS NOT NULL THEN
    SELECT * INTO posted_reversal FROM public.journal_entries WHERE id = original.reversed_entry_id;
    RETURN posted_reversal;
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reversal reason is required';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'account_id', line.account_id,
    'description', CONCAT('Reversal of ', original.entry_number, ': ', COALESCE(line.description, '')),
    'debit_amount', line.credit_amount,
    'credit_amount', line.debit_amount,
    'cost_center_id', line.cost_center_id,
    'project_id', line.project_id
  ) ORDER BY line.line_number, line.created_at)
  INTO reversal_lines
  FROM public.journal_entry_lines line
  WHERE line.entry_id = original.id;

  reversal_draft := public.create_journal_draft(
    original.legal_entity_id,
    p_accounting_period_id,
    p_reversal_date,
    CONCAT('Reversal: ', original.description),
    CONCAT('Reversal of ', original.entry_number, '. ', btrim(p_reason)),
    original.transaction_currency_code,
    original.exchange_rate,
    reversal_lines,
    p_idempotency_key
  );

  posted_reversal := public.post_journal_entry(reversal_draft.id);

  UPDATE public.journal_entries
  SET status = 'reversed',
      reversed_entry_id = posted_reversal.id,
      reversal_reason = btrim(p_reason),
      updated_at = NOW()
  WHERE id = original.id;

  INSERT INTO public.finance_audit_events (
    tenant_id, legal_entity_id, event_type, aggregate_type, aggregate_id,
    actor_id, before_data, after_data, correlation_id
  ) VALUES (
    original.tenant_id, original.legal_entity_id, 'journal_entry_reversed', 'journal_entry', original.id,
    auth.uid(), to_jsonb(original), to_jsonb(posted_reversal), p_idempotency_key
  );

  RETURN posted_reversal;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_journal_entry(UUID, UUID, DATE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(UUID, UUID, DATE, TEXT, UUID) TO authenticated;
