-- ============================================================================
-- 0242 — Finance Unit 02: General Ledger & Journal Lifecycle
-- docs/finance/02-general-ledger-journal-lifecycle.md
-- ============================================================================

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE OR REPLACE FUNCTION public.finance_assert_journal_entry_postable(p_entry_id UUID)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_entry public.journal_entries%ROWTYPE;
  v_debit NUMERIC(18,4);
  v_credit NUMERIC(18,4);
  v_count INTEGER;
BEGIN
  SELECT * INTO v_entry FROM public.journal_entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOURNAL_ENTRY_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_entry.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF v_entry.status NOT IN ('draft','submitted','approved') THEN RAISE EXCEPTION 'JOURNAL_ENTRY_STATUS_NOT_POSTABLE'; END IF;
  IF v_entry.accounting_period_id IS NULL THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_REQUIRED'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.accounting_periods p
    WHERE p.id=v_entry.accounting_period_id
      AND p.legal_entity_id=v_entry.legal_entity_id
      AND p.status='open'
      AND v_entry.entry_date BETWEEN p.start_date AND p.end_date
  ) THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_OPEN_FOR_ENTRY_DATE';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0)
  INTO v_count, v_debit, v_credit
  FROM public.journal_entry_lines
  WHERE entry_id=v_entry.id;

  IF v_count < 2 OR v_debit <= 0 OR v_debit <> v_credit THEN RAISE EXCEPTION 'JOURNAL_ENTRY_NOT_BALANCED'; END IF;
  IF EXISTS(
    SELECT 1
    FROM public.journal_entry_lines line
    JOIN public.chart_of_accounts account ON account.id=line.account_id
    LEFT JOIN public.finance_account_dimension_policies policy ON policy.account_id=account.id
    WHERE line.entry_id=v_entry.id
      AND (
        line.legal_entity_id<>v_entry.legal_entity_id
        OR account.legal_entity_id<>v_entry.legal_entity_id
        OR NOT account.is_active
        OR NOT COALESCE(account.allow_posting,false)
        OR COALESCE(account.is_control_account,false)
        OR (COALESCE(policy.require_cost_center,false) AND line.cost_center_id IS NULL)
        OR (COALESCE(policy.require_project,false) AND line.project_id IS NULL)
        OR (line.cost_center_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centers cc WHERE cc.id=line.cost_center_id AND cc.legal_entity_id=v_entry.legal_entity_id AND cc.is_active))
        OR (line.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_projects fp WHERE fp.id=line.project_id AND fp.legal_entity_id=v_entry.legal_entity_id AND fp.status='active'))
      )
  ) THEN
    RAISE EXCEPTION 'JOURNAL_ENTRY_HAS_INVALID_LINES_OR_DIMENSIONS';
  END IF;

  UPDATE public.journal_entries
  SET total_debit=v_debit, total_credit=v_credit, updated_at=NOW()
  WHERE id=v_entry.id
  RETURNING * INTO v_entry;

  RETURN v_entry;
END $$;
REVOKE ALL ON FUNCTION public.finance_assert_journal_entry_postable(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_assert_journal_entry_postable(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_journal_entry(p_entry_id UUID,p_reason TEXT)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_old public.journal_entries%ROWTYPE; v_new public.journal_entries%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'SUBMIT_REASON_REQUIRED'; END IF;
  v_old := public.finance_assert_journal_entry_postable(p_entry_id);
  IF v_old.status <> 'draft' THEN RAISE EXCEPTION 'ONLY_DRAFT_CAN_BE_SUBMITTED'; END IF;
  UPDATE public.journal_entries
  SET status='submitted', submitted_at=NOW(), submitted_by=auth.uid(), updated_at=NOW()
  WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'journal_entry_submitted','journal_entry',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('entry',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.submit_journal_entry(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_journal_entry(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_journal_entry(p_entry_id UUID,p_reason TEXT)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_old public.journal_entries%ROWTYPE; v_new public.journal_entries%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'APPROVAL_REASON_REQUIRED'; END IF;
  v_old := public.finance_assert_journal_entry_postable(p_entry_id);
  IF v_old.status <> 'submitted' THEN RAISE EXCEPTION 'ONLY_SUBMITTED_CAN_BE_APPROVED'; END IF;
  UPDATE public.journal_entries
  SET status='approved', approved_at=NOW(), approved_by=auth.uid(), updated_at=NOW()
  WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'journal_entry_approved','journal_entry',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('entry',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.approve_journal_entry(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_journal_entry(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_journal_entry_with_reason(p_entry_id UUID,p_reason TEXT)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_old public.journal_entries%ROWTYPE; v_new public.journal_entries%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'POST_REASON_REQUIRED'; END IF;
  v_old := public.finance_assert_journal_entry_postable(p_entry_id);
  UPDATE public.journal_entries
  SET status='posted', posted_at=NOW(), posted_by=auth.uid(), updated_at=NOW()
  WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'journal_entry_posted','journal_entry',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('entry',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.post_journal_entry_with_reason(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_with_reason(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_journal_entry(p_entry_id UUID,p_reason TEXT)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_old public.journal_entries%ROWTYPE; v_new public.journal_entries%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'VOID_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.journal_entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOURNAL_ENTRY_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF v_old.status NOT IN ('draft','submitted','approved') THEN RAISE EXCEPTION 'ONLY_UNPOSTED_ENTRY_CAN_BE_VOIDED'; END IF;
  UPDATE public.journal_entries
  SET status='voided', voided_at=NOW(), voided_by=auth.uid(), void_reason=btrim(p_reason), updated_at=NOW()
  WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'journal_entry_voided','journal_entry',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('entry',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.void_journal_entry(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_journal_entry(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_journal_entry_line_board WITH (security_invoker=true) AS
SELECT
  line.id,
  line.tenant_id,
  line.legal_entity_id,
  line.entry_id,
  line.line_number,
  line.account_id,
  account.code AS account_code,
  COALESCE(account.name_ar,account.name) AS account_name,
  account.account_type,
  line.description,
  line.debit_amount,
  line.credit_amount,
  line.transaction_currency_code,
  line.cost_center_id,
  cc.code AS cost_center_code,
  cc.name_ar AS cost_center_name,
  line.project_id,
  fp.code AS project_code,
  fp.name_ar AS project_name,
  line.created_at
FROM public.journal_entry_lines line
JOIN public.chart_of_accounts account ON account.id=line.account_id
LEFT JOIN public.cost_centers cc ON cc.id=line.cost_center_id
LEFT JOIN public.finance_projects fp ON fp.id=line.project_id
WHERE line.tenant_id=public.current_user_tenant_id()
ORDER BY line.entry_id,line.line_number,line.created_at;
GRANT SELECT ON public.finance_journal_entry_line_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_journal_entry_board WITH (security_invoker=true) AS
SELECT
  entry.id,
  entry.tenant_id,
  entry.legal_entity_id,
  entity.code AS entity_code,
  entity.name_ar AS entity_name,
  entry.accounting_period_id,
  period.name AS period_name,
  entry.entry_number,
  entry.entry_date,
  entry.description,
  entry.reference,
  entry.total_debit,
  entry.total_credit,
  entry.status,
  entry.transaction_currency_code,
  entry.exchange_rate,
  entry.created_by,
  creator.full_name AS created_by_name,
  entry.submitted_at,
  entry.submitted_by,
  submitter.full_name AS submitted_by_name,
  entry.approved_at,
  entry.approved_by,
  approver.full_name AS approved_by_name,
  entry.posted_at,
  entry.posted_by,
  poster.full_name AS posted_by_name,
  entry.voided_at,
  entry.voided_by,
  voider.full_name AS voided_by_name,
  entry.void_reason,
  entry.reversed_entry_id,
  entry.reversal_reason,
  entry.created_at,
  entry.updated_at,
  COUNT(line.id)::BIGINT AS line_count,
  COUNT(line.id) FILTER (WHERE line.cost_center_id IS NOT NULL)::BIGINT AS lines_with_cost_center,
  COUNT(line.id) FILTER (WHERE line.project_id IS NOT NULL)::BIGINT AS lines_with_project
FROM public.journal_entries entry
JOIN public.legal_entities entity ON entity.id=entry.legal_entity_id AND entity.tenant_id=entry.tenant_id
LEFT JOIN public.accounting_periods period ON period.id=entry.accounting_period_id
LEFT JOIN public.profiles creator ON creator.id=entry.created_by
LEFT JOIN public.profiles submitter ON submitter.id=entry.submitted_by
LEFT JOIN public.profiles approver ON approver.id=entry.approved_by
LEFT JOIN public.profiles poster ON poster.id=entry.posted_by
LEFT JOIN public.profiles voider ON voider.id=entry.voided_by
LEFT JOIN public.journal_entry_lines line ON line.entry_id=entry.id
WHERE entry.tenant_id=public.current_user_tenant_id()
GROUP BY entry.id,entry.tenant_id,entry.legal_entity_id,entity.code,entity.name_ar,entry.accounting_period_id,period.name,
  entry.entry_number,entry.entry_date,entry.description,entry.reference,entry.total_debit,entry.total_credit,entry.status,
  entry.transaction_currency_code,entry.exchange_rate,entry.created_by,creator.full_name,entry.submitted_at,entry.submitted_by,submitter.full_name,
  entry.approved_at,entry.approved_by,approver.full_name,entry.posted_at,entry.posted_by,poster.full_name,entry.voided_at,entry.voided_by,voider.full_name,
  entry.void_reason,entry.reversed_entry_id,entry.reversal_reason,entry.created_at,entry.updated_at
ORDER BY entry.entry_date DESC, entry.created_at DESC;
GRANT SELECT ON public.finance_journal_entry_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_journal_lifecycle_dashboard WITH (security_invoker=true) AS
SELECT
  entity.tenant_id,
  entity.id AS legal_entity_id,
  entity.code AS entity_code,
  entity.name_ar AS entity_name,
  COUNT(entry.id) FILTER (WHERE entry.status='draft')::BIGINT AS draft_entries,
  COUNT(entry.id) FILTER (WHERE entry.status='submitted')::BIGINT AS submitted_entries,
  COUNT(entry.id) FILTER (WHERE entry.status='approved')::BIGINT AS approved_entries,
  COUNT(entry.id) FILTER (WHERE entry.status='posted')::BIGINT AS posted_entries,
  COUNT(entry.id) FILTER (WHERE entry.status='reversed')::BIGINT AS reversed_entries,
  COUNT(entry.id) FILTER (WHERE entry.status='voided')::BIGINT AS voided_entries,
  COALESCE(SUM(entry.total_debit) FILTER (WHERE entry.status IN ('posted','reversed')),0)::NUMERIC AS posted_debit,
  COALESCE(SUM(entry.total_credit) FILTER (WHERE entry.status IN ('posted','reversed')),0)::NUMERIC AS posted_credit
FROM public.legal_entities entity
LEFT JOIN public.journal_entries entry ON entry.legal_entity_id=entity.id AND entry.tenant_id=entity.tenant_id
WHERE entity.tenant_id=public.current_user_tenant_id()
GROUP BY entity.tenant_id,entity.id,entity.code,entity.name_ar
ORDER BY entity.code;
GRANT SELECT ON public.finance_journal_lifecycle_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.finance_journal_entry_board') IS NULL
     OR to_regclass('public.finance_journal_entry_line_board') IS NULL
     OR to_regclass('public.finance_journal_lifecycle_dashboard') IS NULL
     OR to_regprocedure('public.submit_journal_entry(uuid,text)') IS NULL
     OR to_regprocedure('public.approve_journal_entry(uuid,text)') IS NULL
     OR to_regprocedure('public.post_journal_entry_with_reason(uuid,text)') IS NULL
     OR to_regprocedure('public.void_journal_entry(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0242 failed: Finance general ledger lifecycle objects missing';
  END IF;
  RAISE NOTICE '✅ 0242: Finance general ledger journal lifecycle applied';
END $$;
