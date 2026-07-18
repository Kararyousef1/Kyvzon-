CREATE OR REPLACE FUNCTION public.get_general_ledger(
  p_legal_entity_id UUID,
  p_account_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (
  entry_id UUID, entry_number TEXT, entry_date DATE, description TEXT,
  reference TEXT, debit NUMERIC, credit NUMERIC, running_balance NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.current_user_can_access_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id=p_account_id AND legal_entity_id=p_legal_entity_id) THEN RAISE EXCEPTION 'Account does not belong to legal entity'; END IF;
  RETURN QUERY
  SELECT entry.id, entry.entry_number::TEXT, entry.entry_date, entry.description::TEXT, entry.reference::TEXT,
    line.debit_amount, line.credit_amount,
    SUM(line.debit_amount - line.credit_amount) OVER (ORDER BY entry.entry_date, entry.created_at, line.line_number, line.created_at)
  FROM public.journal_entry_lines line
  JOIN public.journal_entries entry ON entry.id=line.entry_id
  WHERE line.legal_entity_id=p_legal_entity_id AND line.account_id=p_account_id
    AND entry.status IN ('posted','reversed')
    AND (p_from_date IS NULL OR entry.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR entry.entry_date <= p_to_date)
  ORDER BY entry.entry_date, entry.created_at, line.line_number, line.created_at;
END; $$;
REVOKE ALL ON FUNCTION public.get_general_ledger(UUID, UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_general_ledger(UUID, UUID, DATE, DATE) TO authenticated;
