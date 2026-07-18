-- Read model for trial balance. Reversed originals remain included together with
-- their posted reversal entries so the combined balance correctly nets to zero.

CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_legal_entity_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_name_ar TEXT,
  account_type TEXT,
  debit_balance NUMERIC,
  credit_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_can_access_legal_entity(p_legal_entity_id) THEN
    RAISE EXCEPTION 'Not authorised to access this legal entity';
  END IF;

  RETURN QUERY
  SELECT
    account.id,
    account.code::TEXT,
    account.name::TEXT,
    account.name_ar::TEXT,
    account.account_type::TEXT,
    COALESCE(SUM(CASE WHEN entry.id IS NOT NULL THEN line.debit_amount ELSE 0 END), 0)::NUMERIC AS debit_balance,
    COALESCE(SUM(CASE WHEN entry.id IS NOT NULL THEN line.credit_amount ELSE 0 END), 0)::NUMERIC AS credit_balance
  FROM public.chart_of_accounts account
  LEFT JOIN public.journal_entry_lines line
    ON line.account_id = account.id
    AND line.legal_entity_id = p_legal_entity_id
  LEFT JOIN public.journal_entries entry
    ON entry.id = line.entry_id
    AND entry.status IN ('posted', 'reversed')
    AND (p_from_date IS NULL OR entry.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR entry.entry_date <= p_to_date)
  WHERE account.legal_entity_id = p_legal_entity_id
  GROUP BY account.id, account.code, account.name, account.name_ar, account.account_type
  HAVING COALESCE(SUM(CASE WHEN entry.id IS NOT NULL THEN line.debit_amount ELSE 0 END), 0) <> 0
      OR COALESCE(SUM(CASE WHEN entry.id IS NOT NULL THEN line.credit_amount ELSE 0 END), 0) <> 0
  ORDER BY account.code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(UUID, DATE, DATE) TO authenticated;
