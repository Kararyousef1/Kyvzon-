-- Controlled period close/reopen workflow. Closing is available to entity finance
-- managers; reopening a closed period is restricted to entity_admin/platform.

CREATE OR REPLACE FUNCTION public.set_accounting_period_status(
  p_period_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period_row public.accounting_periods%ROWTYPE;
  previous_period public.accounting_periods%ROWTYPE;
  role_name TEXT;
BEGIN
  SELECT * INTO period_row FROM public.accounting_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting period not found'; END IF;
  previous_period := period_row;
  IF NOT public.current_user_can_manage_legal_entity(period_row.legal_entity_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this accounting period';
  END IF;
  IF p_status NOT IN ('open', 'soft_closed', 'closed') THEN
    RAISE EXCEPTION 'Invalid accounting period status';
  END IF;

  SELECT finance_role INTO role_name FROM public.entity_memberships
  WHERE legal_entity_id = period_row.legal_entity_id AND user_id = auth.uid() AND is_active;
  IF period_row.status = 'closed' AND p_status = 'open'
    AND NOT (public.current_user_is_platform_owner() OR role_name = 'entity_admin') THEN
    RAISE EXCEPTION 'Only an entity administrator can reopen a closed period';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required for a period status change';
  END IF;

  UPDATE public.accounting_periods
  SET status = p_status,
      locked_at = CASE WHEN p_status = 'open' THEN NULL ELSE NOW() END,
      locked_by = CASE WHEN p_status = 'open' THEN NULL ELSE auth.uid() END,
      updated_at = NOW()
  WHERE id = period_row.id
  RETURNING * INTO period_row;

  INSERT INTO public.finance_audit_events (tenant_id, legal_entity_id, event_type, aggregate_type, aggregate_id, actor_id, before_data, after_data)
  VALUES (period_row.tenant_id, period_row.legal_entity_id, CONCAT('accounting_period_', p_status), 'accounting_period', period_row.id, auth.uid(), to_jsonb(previous_period), jsonb_build_object('period', to_jsonb(period_row), 'reason', btrim(p_reason)));

  RETURN period_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_accounting_period_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_accounting_period_status(UUID, TEXT, TEXT) TO authenticated;
