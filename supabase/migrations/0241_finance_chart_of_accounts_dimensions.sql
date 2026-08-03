-- ============================================================================
-- 0241 — Finance Unit 01: Chart of Accounts & Dimensions
-- docs/finance/01-chart-of-accounts-dimensions.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_account_dimension_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  require_cost_center BOOLEAN NOT NULL DEFAULT false,
  require_project BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_account_dimension_policies_entity
  ON public.finance_account_dimension_policies(legal_entity_id);

ALTER TABLE public.finance_account_dimension_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_account_dimension_policy_select ON public.finance_account_dimension_policies;
DROP POLICY IF EXISTS finance_account_dimension_policy_insert ON public.finance_account_dimension_policies;
DROP POLICY IF EXISTS finance_account_dimension_policy_update ON public.finance_account_dimension_policies;
CREATE POLICY finance_account_dimension_policy_select ON public.finance_account_dimension_policies
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id));
CREATE POLICY finance_account_dimension_policy_insert ON public.finance_account_dimension_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_account_dimension_policy_update ON public.finance_account_dimension_policies
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_legal_entity(legal_entity_id))
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_chart_account(
  p_legal_entity_id UUID,
  p_code TEXT,
  p_name TEXT,
  p_account_type TEXT,
  p_account_id UUID DEFAULT NULL,
  p_name_ar TEXT DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL,
  p_normal_balance TEXT DEFAULT NULL,
  p_allow_posting BOOLEAN DEFAULT true,
  p_is_control_account BOOLEAN DEFAULT false,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.chart_of_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_entity public.legal_entities%ROWTYPE;
  v_parent public.chart_of_accounts%ROWTYPE;
  v_old public.chart_of_accounts%ROWTYPE;
  v_row public.chart_of_accounts%ROWTYPE;
  v_code TEXT := upper(btrim(COALESCE(p_code,'')));
  v_name TEXT := btrim(COALESCE(p_name,''));
  v_type TEXT := btrim(COALESCE(p_account_type,''));
  v_normal TEXT;
  v_level INTEGER := 1;
  v_allow_posting BOOLEAN := COALESCE(p_allow_posting,true);
  v_zero UUID := '00000000-0000-0000-0000-000000000000'::UUID;
BEGIN
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY';
  END IF;
  SELECT * INTO v_entity FROM public.legal_entities WHERE id=p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
  IF v_code='' THEN RAISE EXCEPTION 'ACCOUNT_CODE_REQUIRED'; END IF;
  IF v_name='' THEN RAISE EXCEPTION 'ACCOUNT_NAME_REQUIRED'; END IF;
  IF v_type NOT IN ('Asset','Liability','Equity','Revenue','Expense') THEN RAISE EXCEPTION 'INVALID_ACCOUNT_TYPE'; END IF;

  v_normal := COALESCE(NULLIF(btrim(COALESCE(p_normal_balance,'')),''), CASE WHEN v_type IN ('Asset','Expense') THEN 'debit' ELSE 'credit' END);
  IF v_normal NOT IN ('debit','credit') THEN RAISE EXCEPTION 'INVALID_NORMAL_BALANCE'; END IF;
  IF COALESCE(p_is_control_account,false) AND COALESCE(p_allow_posting,false) THEN
    RAISE EXCEPTION 'CONTROL_ACCOUNT_CANNOT_ALLOW_POSTING';
  END IF;
  IF COALESCE(p_is_control_account,false) THEN v_allow_posting := false; END IF;

  IF p_parent_id IS NOT NULL THEN
    IF p_account_id IS NOT NULL AND p_parent_id=p_account_id THEN RAISE EXCEPTION 'ACCOUNT_CANNOT_BE_ITS_OWN_PARENT'; END IF;
    SELECT * INTO v_parent FROM public.chart_of_accounts WHERE id=p_parent_id AND legal_entity_id=p_legal_entity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PARENT_ACCOUNT_NOT_FOUND'; END IF;
    IF NOT v_parent.is_active THEN RAISE EXCEPTION 'PARENT_ACCOUNT_INACTIVE'; END IF;
    IF v_parent.account_type <> v_type THEN RAISE EXCEPTION 'PARENT_ACCOUNT_TYPE_MISMATCH'; END IF;
    IF COALESCE(v_parent.allow_posting,false) THEN RAISE EXCEPTION 'PARENT_ACCOUNT_MUST_BE_NON_POSTING'; END IF;
    v_level := v_parent.level + 1;
    IF v_level > 4 THEN RAISE EXCEPTION 'ACCOUNT_LEVEL_EXCEEDS_LIMIT'; END IF;
  END IF;

  IF p_account_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.chart_of_accounts WHERE id=p_account_id AND legal_entity_id=p_legal_entity_id FOR UPDATE;
  ELSE
    SELECT * INTO v_old FROM public.chart_of_accounts WHERE legal_entity_id=p_legal_entity_id AND code=v_code FOR UPDATE;
  END IF;

  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE account_id=v_old.id)
       AND (v_old.code <> v_code OR v_old.account_type <> v_type OR COALESCE(v_old.parent_id,v_zero) <> COALESCE(p_parent_id,v_zero)) THEN
      RAISE EXCEPTION 'USED_ACCOUNT_STRUCTURE_IS_IMMUTABLE';
    END IF;
    IF v_allow_posting AND EXISTS (
      SELECT 1 FROM public.chart_of_accounts child
      WHERE child.parent_id=v_old.id AND child.legal_entity_id=p_legal_entity_id AND child.is_active
    ) THEN
      RAISE EXCEPTION 'ACCOUNT_WITH_ACTIVE_CHILDREN_CANNOT_ALLOW_POSTING';
    END IF;
    UPDATE public.chart_of_accounts
    SET code=v_code,
        name=v_name,
        name_ar=NULLIF(btrim(COALESCE(p_name_ar,'')),''),
        account_type=v_type,
        parent_id=p_parent_id,
        level=v_level,
        normal_balance=v_normal,
        allow_posting=v_allow_posting,
        is_control_account=COALESCE(p_is_control_account,false),
        is_active=true,
        archived_at=NULL,
        updated_at=NOW()
    WHERE id=v_old.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.chart_of_accounts(
      tenant_id,legal_entity_id,code,name,name_ar,account_type,parent_id,level,
      is_active,normal_balance,allow_posting,is_control_account
    ) VALUES (
      v_entity.tenant_id,p_legal_entity_id,v_code,v_name,NULLIF(btrim(COALESCE(p_name_ar,'')),''),v_type,p_parent_id,v_level,
      true,v_normal,v_allow_posting,COALESCE(p_is_control_account,false)
    ) RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_entity.tenant_id,p_legal_entity_id,'chart_account_upserted','chart_account',v_row.id,auth.uid(),CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,jsonb_build_object('account',to_jsonb(v_row),'reason',COALESCE(NULLIF(p_reason,''),'إنشاء/تحديث حساب مالي')));

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.upsert_finance_chart_account(UUID,TEXT,TEXT,TEXT,UUID,TEXT,UUID,TEXT,BOOLEAN,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_finance_chart_account(UUID,TEXT,TEXT,TEXT,UUID,TEXT,UUID,TEXT,BOOLEAN,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_finance_chart_account(p_account_id UUID,p_reason TEXT)
RETURNS public.chart_of_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_old public.chart_of_accounts%ROWTYPE;
  v_row public.chart_of_accounts%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'ARCHIVE_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.chart_of_accounts WHERE id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts child WHERE child.parent_id=p_account_id AND child.is_active) THEN
    RAISE EXCEPTION 'ACCOUNT_HAS_ACTIVE_CHILDREN';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.journal_entry_lines line
    JOIN public.journal_entries entry ON entry.id=line.entry_id
    WHERE line.account_id=p_account_id
      AND entry.status NOT IN ('posted','reversed','voided')
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_USED_BY_OPEN_JOURNAL_LINES';
  END IF;
  UPDATE public.chart_of_accounts
  SET is_active=false, allow_posting=false, archived_at=NOW(), updated_at=NOW()
  WHERE id=p_account_id
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'chart_account_archived','chart_account',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('account',to_jsonb(v_row),'reason',p_reason));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.archive_finance_chart_account(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_finance_chart_account(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_account_posting(p_account_id UUID,p_allow_posting BOOLEAN,p_reason TEXT)
RETURNS public.chart_of_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_old public.chart_of_accounts%ROWTYPE;
  v_row public.chart_of_accounts%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'POSTING_CHANGE_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.chart_of_accounts WHERE id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF COALESCE(p_allow_posting,false) THEN
    IF NOT v_old.is_active THEN RAISE EXCEPTION 'INACTIVE_ACCOUNT_CANNOT_ALLOW_POSTING'; END IF;
    IF COALESCE(v_old.is_control_account,false) THEN RAISE EXCEPTION 'CONTROL_ACCOUNT_CANNOT_ALLOW_POSTING'; END IF;
    IF EXISTS (SELECT 1 FROM public.chart_of_accounts child WHERE child.parent_id=p_account_id AND child.is_active) THEN
      RAISE EXCEPTION 'ACCOUNT_WITH_ACTIVE_CHILDREN_CANNOT_ALLOW_POSTING';
    END IF;
  END IF;
  UPDATE public.chart_of_accounts
  SET allow_posting=COALESCE(p_allow_posting,false), updated_at=NOW()
  WHERE id=p_account_id
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'chart_account_posting_changed','chart_account',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('account',to_jsonb(v_row),'reason',p_reason));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.update_finance_account_posting(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_finance_account_posting(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_account_dimension_policy(
  p_account_id UUID,
  p_require_cost_center BOOLEAN DEFAULT false,
  p_require_project BOOLEAN DEFAULT false,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.finance_account_dimension_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_account public.chart_of_accounts%ROWTYPE;
  v_old public.finance_account_dimension_policies%ROWTYPE;
  v_row public.finance_account_dimension_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_account FROM public.chart_of_accounts WHERE id=p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_account.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  SELECT * INTO v_old FROM public.finance_account_dimension_policies WHERE account_id=p_account_id FOR UPDATE;
  INSERT INTO public.finance_account_dimension_policies(tenant_id,legal_entity_id,account_id,require_cost_center,require_project,notes)
  VALUES(v_account.tenant_id,v_account.legal_entity_id,v_account.id,COALESCE(p_require_cost_center,false),COALESCE(p_require_project,false),p_reason)
  ON CONFLICT (account_id) DO UPDATE SET
    require_cost_center=EXCLUDED.require_cost_center,
    require_project=EXCLUDED.require_project,
    notes=EXCLUDED.notes,
    updated_at=NOW()
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_account.tenant_id,v_account.legal_entity_id,'account_dimension_policy_upserted','account_dimension_policy',v_row.id,auth.uid(),CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,jsonb_build_object('policy',to_jsonb(v_row),'reason',COALESCE(NULLIF(p_reason,''),'تحديث سياسة أبعاد الحساب')));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.upsert_finance_account_dimension_policy(UUID,BOOLEAN,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_finance_account_dimension_policy(UUID,BOOLEAN,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_finance_account_hierarchy(p_legal_entity_id UUID)
RETURNS TABLE(severity TEXT, account_id UUID, code TEXT, issue_code TEXT, issue_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF NOT public.current_user_can_access_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;

  RETURN QUERY
  SELECT 'error'::TEXT, a.id, a.code::TEXT, 'PARENT_ENTITY_MISMATCH'::TEXT, 'الحساب الأب لا ينتمي لنفس الكيان القانوني'::TEXT
  FROM public.chart_of_accounts a
  JOIN public.chart_of_accounts p ON p.id=a.parent_id
  WHERE a.legal_entity_id=p_legal_entity_id AND p.legal_entity_id<>a.legal_entity_id;

  RETURN QUERY
  SELECT 'error'::TEXT, a.id, a.code::TEXT, 'LEVEL_MISMATCH'::TEXT, 'مستوى الحساب لا يساوي مستوى الأب + 1'::TEXT
  FROM public.chart_of_accounts a
  JOIN public.chart_of_accounts p ON p.id=a.parent_id
  WHERE a.legal_entity_id=p_legal_entity_id AND a.level<>p.level+1;

  RETURN QUERY
  SELECT 'warning'::TEXT, a.id, a.code::TEXT, 'PARENT_ALLOWS_POSTING'::TEXT, 'حساب أب لديه أبناء نشطون وما زال يسمح بالترحيل'::TEXT
  FROM public.chart_of_accounts a
  WHERE a.legal_entity_id=p_legal_entity_id
    AND a.is_active
    AND COALESCE(a.allow_posting,false)
    AND EXISTS(SELECT 1 FROM public.chart_of_accounts child WHERE child.parent_id=a.id AND child.is_active);

  RETURN QUERY
  SELECT 'error'::TEXT, a.id, a.code::TEXT, 'CONTROL_ALLOWS_POSTING'::TEXT, 'حساب رقابي يسمح بالترحيل المباشر'::TEXT
  FROM public.chart_of_accounts a
  WHERE a.legal_entity_id=p_legal_entity_id AND COALESCE(a.is_control_account,false) AND COALESCE(a.allow_posting,false);

  RETURN QUERY
  SELECT 'error'::TEXT, a.id, a.code::TEXT, 'INVALID_NORMAL_BALANCE'::TEXT, 'الرصيد الطبيعي غير متوافق مع نوع الحساب'::TEXT
  FROM public.chart_of_accounts a
  WHERE a.legal_entity_id=p_legal_entity_id
    AND ((a.account_type IN ('Asset','Expense') AND a.normal_balance='credit') OR (a.account_type IN ('Liability','Equity','Revenue') AND a.normal_balance='debit'));
END $$;
REVOKE ALL ON FUNCTION public.validate_finance_account_hierarchy(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_finance_account_hierarchy(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_validate_journal_line_dimensions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_policy public.finance_account_dimension_policies%ROWTYPE;
BEGIN
  IF NEW.cost_center_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.cost_centers cc
    WHERE cc.id=NEW.cost_center_id AND cc.legal_entity_id=NEW.legal_entity_id AND cc.is_active
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_INACTIVE_COST_CENTER_FOR_LINE';
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.finance_projects fp
    WHERE fp.id=NEW.project_id AND fp.legal_entity_id=NEW.legal_entity_id AND fp.status='active'
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_INACTIVE_PROJECT_FOR_LINE';
  END IF;
  SELECT * INTO v_policy FROM public.finance_account_dimension_policies WHERE account_id=NEW.account_id;
  IF FOUND THEN
    IF v_policy.require_cost_center AND NEW.cost_center_id IS NULL THEN RAISE EXCEPTION 'COST_CENTER_REQUIRED_FOR_ACCOUNT'; END IF;
    IF v_policy.require_project AND NEW.project_id IS NULL THEN RAISE EXCEPTION 'PROJECT_REQUIRED_FOR_ACCOUNT'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_finance_journal_line_dimensions ON public.journal_entry_lines;
CREATE TRIGGER trg_finance_journal_line_dimensions
  BEFORE INSERT OR UPDATE OF account_id,legal_entity_id,cost_center_id,project_id ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.finance_validate_journal_line_dimensions();

CREATE OR REPLACE VIEW public.finance_account_usage_summary WITH (security_invoker=true) AS
SELECT
  a.tenant_id,
  a.legal_entity_id,
  a.id AS account_id,
  a.code,
  a.name,
  a.name_ar,
  COUNT(line.id)::BIGINT AS line_count,
  COUNT(line.id) FILTER (WHERE entry.status NOT IN ('posted','reversed','voided'))::BIGINT AS open_line_count,
  COALESCE(SUM(line.debit_amount) FILTER (WHERE entry.status IN ('posted','reversed')),0)::NUMERIC AS posted_debit,
  COALESCE(SUM(line.credit_amount) FILTER (WHERE entry.status IN ('posted','reversed')),0)::NUMERIC AS posted_credit,
  COALESCE(SUM(line.debit_amount-line.credit_amount) FILTER (WHERE entry.status IN ('posted','reversed')),0)::NUMERIC AS posted_net_balance,
  MAX(entry.entry_date) AS last_entry_date
FROM public.chart_of_accounts a
LEFT JOIN public.journal_entry_lines line ON line.account_id=a.id AND line.legal_entity_id=a.legal_entity_id
LEFT JOIN public.journal_entries entry ON entry.id=line.entry_id
WHERE a.tenant_id=public.current_user_tenant_id()
GROUP BY a.tenant_id,a.legal_entity_id,a.id,a.code,a.name,a.name_ar;
GRANT SELECT ON public.finance_account_usage_summary TO authenticated;

CREATE OR REPLACE VIEW public.finance_account_dimension_policy_board WITH (security_invoker=true) AS
SELECT
  p.id,
  p.tenant_id,
  p.legal_entity_id,
  p.account_id,
  a.code AS account_code,
  a.name AS account_name,
  a.name_ar AS account_name_ar,
  a.account_type,
  p.require_cost_center,
  p.require_project,
  p.notes,
  p.updated_at
FROM public.finance_account_dimension_policies p
JOIN public.chart_of_accounts a ON a.id=p.account_id AND a.legal_entity_id=p.legal_entity_id
WHERE p.tenant_id=public.current_user_tenant_id()
ORDER BY a.code;
GRANT SELECT ON public.finance_account_dimension_policy_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_chart_of_accounts_tree WITH (security_invoker=true) AS
SELECT
  a.id,
  a.tenant_id,
  a.legal_entity_id,
  e.code AS entity_code,
  e.name_ar AS entity_name,
  a.code,
  a.name,
  a.name_ar,
  a.account_type,
  a.account_category,
  a.normal_balance,
  a.parent_id,
  parent.code AS parent_code,
  COALESCE(parent.name_ar,parent.name) AS parent_name,
  a.level,
  a.is_active,
  a.allow_posting,
  a.is_control_account,
  a.archived_at,
  COALESCE(children.child_count,0)::BIGINT AS child_count,
  COALESCE(usage.line_count,0)::BIGINT AS line_count,
  COALESCE(usage.open_line_count,0)::BIGINT AS open_line_count,
  COALESCE(usage.posted_debit,0)::NUMERIC AS posted_debit,
  COALESCE(usage.posted_credit,0)::NUMERIC AS posted_credit,
  COALESCE(usage.posted_net_balance,0)::NUMERIC AS posted_net_balance,
  COALESCE(policy.require_cost_center,false) AS require_cost_center,
  COALESCE(policy.require_project,false) AS require_project
FROM public.chart_of_accounts a
JOIN public.legal_entities e ON e.id=a.legal_entity_id AND e.tenant_id=a.tenant_id
LEFT JOIN public.chart_of_accounts parent ON parent.id=a.parent_id
LEFT JOIN (
  SELECT parent_id, COUNT(*) AS child_count
  FROM public.chart_of_accounts
  WHERE is_active
  GROUP BY parent_id
) children ON children.parent_id=a.id
LEFT JOIN public.finance_account_usage_summary usage ON usage.account_id=a.id
LEFT JOIN public.finance_account_dimension_policies policy ON policy.account_id=a.id
WHERE a.tenant_id=public.current_user_tenant_id()
ORDER BY e.code, a.code;
GRANT SELECT ON public.finance_chart_of_accounts_tree TO authenticated;

CREATE OR REPLACE VIEW public.finance_posting_account_lookup WITH (security_invoker=true) AS
SELECT
  a.id,
  a.tenant_id,
  a.legal_entity_id,
  e.code AS entity_code,
  a.code,
  COALESCE(a.name_ar,a.name) AS display_name,
  a.name,
  a.name_ar,
  a.account_type,
  a.normal_balance,
  COALESCE(policy.require_cost_center,false) AS require_cost_center,
  COALESCE(policy.require_project,false) AS require_project
FROM public.chart_of_accounts a
JOIN public.legal_entities e ON e.id=a.legal_entity_id AND e.tenant_id=a.tenant_id
LEFT JOIN public.finance_account_dimension_policies policy ON policy.account_id=a.id
WHERE a.tenant_id=public.current_user_tenant_id()
  AND a.is_active
  AND COALESCE(a.allow_posting,false)
  AND NOT COALESCE(a.is_control_account,false)
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts child WHERE child.parent_id=a.id AND child.is_active)
ORDER BY e.code, a.code;
GRANT SELECT ON public.finance_posting_account_lookup TO authenticated;

CREATE OR REPLACE VIEW public.finance_dimensions_dashboard WITH (security_invoker=true) AS
SELECT
  e.tenant_id,
  e.id AS legal_entity_id,
  e.code AS entity_code,
  e.name_ar AS entity_name,
  COUNT(a.id) FILTER (WHERE a.is_active)::BIGINT AS active_accounts,
  COUNT(a.id) FILTER (WHERE a.is_active AND COALESCE(a.allow_posting,false))::BIGINT AS posting_accounts,
  COUNT(a.id) FILTER (WHERE a.is_active AND COALESCE(a.is_control_account,false))::BIGINT AS control_accounts,
  COUNT(p.id) FILTER (WHERE p.require_cost_center)::BIGINT AS accounts_requiring_cost_center,
  COUNT(p.id) FILTER (WHERE p.require_project)::BIGINT AS accounts_requiring_project,
  (SELECT COUNT(*) FROM public.cost_centers cc WHERE cc.legal_entity_id=e.id AND cc.is_active)::BIGINT AS active_cost_centers,
  (SELECT COUNT(*) FROM public.finance_projects fp WHERE fp.legal_entity_id=e.id AND fp.status='active')::BIGINT AS active_projects
FROM public.legal_entities e
LEFT JOIN public.chart_of_accounts a ON a.legal_entity_id=e.id AND a.tenant_id=e.tenant_id
LEFT JOIN public.finance_account_dimension_policies p ON p.account_id=a.id
WHERE e.tenant_id=public.current_user_tenant_id()
GROUP BY e.tenant_id,e.id,e.code,e.name_ar
ORDER BY e.code;
GRANT SELECT ON public.finance_dimensions_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.finance_account_dimension_policies') IS NULL
     OR to_regclass('public.finance_chart_of_accounts_tree') IS NULL
     OR to_regclass('public.finance_posting_account_lookup') IS NULL
     OR to_regclass('public.finance_account_usage_summary') IS NULL
     OR to_regprocedure('public.upsert_finance_chart_account(uuid,text,text,text,uuid,text,uuid,text,boolean,boolean,text)') IS NULL
     OR to_regprocedure('public.archive_finance_chart_account(uuid,text)') IS NULL
     OR to_regprocedure('public.update_finance_account_posting(uuid,boolean,text)') IS NULL
     OR to_regprocedure('public.upsert_finance_account_dimension_policy(uuid,boolean,boolean,text)') IS NULL
     OR to_regprocedure('public.validate_finance_account_hierarchy(uuid)') IS NULL THEN
    RAISE EXCEPTION '0241 failed: Finance chart of accounts/dimensions objects missing';
  END IF;
  RAISE NOTICE '✅ 0241: Finance chart of accounts and dimensions applied';
END $$;
