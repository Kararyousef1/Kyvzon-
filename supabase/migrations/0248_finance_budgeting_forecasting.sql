-- ============================================================================
-- 0248 — Finance Unit 08: Budgeting & Forecasting
-- docs/finance/08-budgeting-forecasting.md
-- ============================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fiscal_year_id UUID REFERENCES public.fiscal_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.budgets b SET legal_entity_id=e.id,currency_code=COALESCE(currency_code,e.base_currency_code) FROM public.legal_entities e WHERE e.tenant_id=b.tenant_id AND e.code='DEFAULT' AND b.legal_entity_id IS NULL;
ALTER TABLE public.budgets ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.budgets ALTER COLUMN currency_code SET NOT NULL;
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_status_check;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_status_check CHECK(status IN ('draft','submitted','approved','closed','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_budget_entity_year_name ON public.budgets(legal_entity_id,fiscal_year,budget_name);

ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.finance_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS forecast_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.budget_lines l SET tenant_id=b.tenant_id, legal_entity_id=b.legal_entity_id, amount=COALESCE(l.amount,l.budget_amount) FROM public.budgets b WHERE b.id=l.budget_id AND l.legal_entity_id IS NULL;
ALTER TABLE public.budget_lines ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.budget_lines ALTER COLUMN legal_entity_id SET NOT NULL;
UPDATE public.budget_lines SET amount=budget_amount WHERE amount IS NULL;
ALTER TABLE public.budget_lines ALTER COLUMN amount SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_lines_entity_dims ON public.budget_lines(legal_entity_id,account_id,cost_center_id,project_id);

ALTER TABLE public.budget_variance_reports
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.finance_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
UPDATE public.budget_variance_reports r SET legal_entity_id=b.legal_entity_id, tenant_id=b.tenant_id FROM public.budgets b WHERE b.id=r.budget_id AND r.legal_entity_id IS NULL;

ALTER TABLE public.cash_forecast_scenarios
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scenario_type TEXT NOT NULL DEFAULT 'cash' CHECK(scenario_type IN ('cash','revenue','expense','working_capital','custom')),
  ADD COLUMN IF NOT EXISTS confidence_level TEXT NOT NULL DEFAULT 'base' CHECK(confidence_level IN ('low','base','high','stress')),
  ADD COLUMN IF NOT EXISTS assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.cash_forecast_scenarios s SET legal_entity_id=e.id FROM public.legal_entities e WHERE e.tenant_id=s.tenant_id AND e.code='DEFAULT' AND s.legal_entity_id IS NULL;
ALTER TABLE public.cash_forecast_scenarios ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.cash_forecast_scenarios DROP CONSTRAINT IF EXISTS cash_forecast_scenarios_status_check;
ALTER TABLE public.cash_forecast_scenarios ADD CONSTRAINT cash_forecast_scenarios_status_check CHECK(status IN ('draft','submitted','approved','closed','voided'));

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_variance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_forecast_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_budgets_access ON public.budgets;
DROP POLICY IF EXISTS finance_budget_lines_access ON public.budget_lines;
DROP POLICY IF EXISTS finance_budget_variance_access ON public.budget_variance_reports;
DROP POLICY IF EXISTS finance_cash_forecast_access ON public.cash_forecast_scenarios;
CREATE POLICY finance_budgets_access ON public.budgets FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_budget_lines_access ON public.budget_lines FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_budget_variance_access ON public.budget_variance_reports FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_cash_forecast_access ON public.cash_forecast_scenarios FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_budget(p_legal_entity_id UUID,p_budget_name TEXT,p_fiscal_year INTEGER,p_start_date DATE DEFAULT NULL,p_end_date DATE DEFAULT NULL,p_currency_code CHAR(3) DEFAULT NULL,p_description TEXT DEFAULT NULL,p_budget_id UUID DEFAULT NULL)
RETURNS public.budgets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; old public.budgets%ROWTYPE; r public.budgets%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_budget_name),'')='' OR p_fiscal_year IS NULL THEN RAISE EXCEPTION 'BUDGET_NAME_AND_YEAR_REQUIRED'; END IF;
 IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date<p_start_date THEN RAISE EXCEPTION 'INVALID_BUDGET_DATES'; END IF;
 IF p_budget_id IS NOT NULL THEN SELECT * INTO old FROM public.budgets WHERE id=p_budget_id AND legal_entity_id=p_legal_entity_id FOR UPDATE; END IF;
 IF old.id IS NOT NULL THEN
   IF old.status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'ONLY_DRAFT_OR_SUBMITTED_BUDGET_CAN_BE_EDITED'; END IF;
   UPDATE public.budgets SET budget_name=btrim(p_budget_name),fiscal_year=p_fiscal_year,start_date=p_start_date,end_date=p_end_date,currency_code=COALESCE(p_currency_code,e.base_currency_code),description=NULLIF(btrim(COALESCE(p_description,'')),''),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 ELSE
   INSERT INTO public.budgets(tenant_id,legal_entity_id,budget_name,fiscal_year,start_date,end_date,currency_code,description,status)
   VALUES(e.tenant_id,p_legal_entity_id,btrim(p_budget_name),p_fiscal_year,p_start_date,p_end_date,COALESCE(p_currency_code,e.base_currency_code),NULLIF(btrim(COALESCE(p_description,'')),''),'draft') RETURNING * INTO r;
 END IF;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'budget_upserted','budget',r.id,auth.uid(),CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_budget(UUID,TEXT,INTEGER,DATE,DATE,CHAR(3),TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_budget_line(p_budget_id UUID,p_account_id UUID,p_budget_amount NUMERIC,p_period_start DATE DEFAULT NULL,p_period_end DATE DEFAULT NULL,p_cost_center_id UUID DEFAULT NULL,p_project_id UUID DEFAULT NULL,p_forecast_amount NUMERIC DEFAULT 0,p_notes TEXT DEFAULT NULL,p_line_id UUID DEFAULT NULL)
RETURNS public.budget_lines LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; a public.chart_of_accounts%ROWTYPE; old public.budget_lines%ROWTYPE; r public.budget_lines%ROWTYPE;
BEGIN
 SELECT * INTO b FROM public.budgets WHERE id=p_budget_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(b.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF b.status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'ONLY_DRAFT_OR_SUBMITTED_BUDGET_LINES_CAN_CHANGE'; END IF;
 SELECT * INTO a FROM public.chart_of_accounts WHERE id=p_account_id AND legal_entity_id=b.legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_IN_BUDGET_ENTITY'; END IF;
 IF p_budget_amount IS NULL OR p_budget_amount<0 THEN RAISE EXCEPTION 'INVALID_BUDGET_AMOUNT'; END IF;
 IF p_cost_center_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centers WHERE id=p_cost_center_id AND legal_entity_id=b.legal_entity_id AND is_active) THEN RAISE EXCEPTION 'INVALID_COST_CENTER'; END IF;
 IF p_project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_projects WHERE id=p_project_id AND legal_entity_id=b.legal_entity_id AND status='active') THEN RAISE EXCEPTION 'INVALID_PROJECT'; END IF;
 IF p_line_id IS NOT NULL THEN SELECT * INTO old FROM public.budget_lines WHERE id=p_line_id AND budget_id=p_budget_id FOR UPDATE; END IF;
 IF old.id IS NOT NULL THEN
   UPDATE public.budget_lines SET account_id=p_account_id,budget_amount=p_budget_amount,amount=p_budget_amount,period_start=p_period_start,period_end=p_period_end,cost_center_id=p_cost_center_id,project_id=p_project_id,forecast_amount=COALESCE(p_forecast_amount,0),notes=NULLIF(btrim(COALESCE(p_notes,'')),''),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 ELSE
   INSERT INTO public.budget_lines(tenant_id,legal_entity_id,budget_id,account_id,budget_amount,amount,period_start,period_end,cost_center_id,project_id,forecast_amount,notes)
   VALUES(b.tenant_id,b.legal_entity_id,b.id,p_account_id,p_budget_amount,p_budget_amount,p_period_start,p_period_end,p_cost_center_id,p_project_id,COALESCE(p_forecast_amount,0),NULLIF(btrim(COALESCE(p_notes,'')),'')) RETURNING * INTO r;
 END IF;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'budget_line_upserted','budget_line',r.id,auth.uid(),CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_budget_line(UUID,UUID,NUMERIC,DATE,DATE,UUID,UUID,NUMERIC,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_budget_status(p_budget_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.budgets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.budgets%ROWTYPE; r public.budgets%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'BUDGET_STATUS_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.budgets WHERE id=p_budget_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF p_status NOT IN ('submitted','approved','closed','voided') THEN RAISE EXCEPTION 'INVALID_BUDGET_STATUS'; END IF;
 IF p_status='submitted' AND old.status<>'draft' THEN RAISE EXCEPTION 'ONLY_DRAFT_BUDGET_CAN_BE_SUBMITTED'; END IF;
 IF p_status='approved' AND old.status<>'submitted' THEN RAISE EXCEPTION 'ONLY_SUBMITTED_BUDGET_CAN_BE_APPROVED'; END IF;
 IF p_status='approved' AND NOT EXISTS(SELECT 1 FROM public.budget_lines WHERE budget_id=old.id) THEN RAISE EXCEPTION 'BUDGET_REQUIRES_LINES_BEFORE_APPROVAL'; END IF;
 IF p_status='closed' AND old.status<>'approved' THEN RAISE EXCEPTION 'ONLY_APPROVED_BUDGET_CAN_BE_CLOSED'; END IF;
 UPDATE public.budgets SET status=p_status,submitted_at=CASE WHEN p_status='submitted' THEN NOW() ELSE submitted_at END,submitted_by=CASE WHEN p_status='submitted' THEN auth.uid() ELSE submitted_by END,approved_at=CASE WHEN p_status='approved' THEN NOW() ELSE approved_at END,approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END,closed_at=CASE WHEN p_status='closed' THEN NOW() ELSE closed_at END,closed_by=CASE WHEN p_status='closed' THEN auth.uid() ELSE closed_by END,updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,CONCAT('budget_',p_status),'budget',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('budget',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_finance_budget_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_budget_variance_report(p_budget_id UUID,p_period_start DATE,p_period_end DATE)
RETURNS SETOF public.budget_variance_reports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; label TEXT;
BEGIN
 SELECT * INTO b FROM public.budgets WHERE id=p_budget_id; IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(b.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end<p_period_start THEN RAISE EXCEPTION 'INVALID_VARIANCE_PERIOD'; END IF;
 label := to_char(p_period_start,'YYYY-MM-DD') || ':' || to_char(p_period_end,'YYYY-MM-DD');
 DELETE FROM public.budget_variance_reports WHERE budget_id=p_budget_id AND report_period=label;
 INSERT INTO public.budget_variance_reports(tenant_id,legal_entity_id,budget_id,account_id,cost_center_id,project_id,budget_amount,actual_amount,variance_amount,variance_percentage,report_period,period_start,period_end,generated_by)
 SELECT b.tenant_id,b.legal_entity_id,bl.budget_id,bl.account_id,bl.cost_center_id,bl.project_id,bl.budget_amount,
   COALESCE((SELECT SUM(CASE WHEN a.normal_balance='credit' THEN jel.credit_amount-jel.debit_amount ELSE jel.debit_amount-jel.credit_amount END) FROM public.journal_entry_lines jel JOIN public.journal_entries je ON je.id=jel.entry_id JOIN public.chart_of_accounts a ON a.id=jel.account_id WHERE je.legal_entity_id=b.legal_entity_id AND jel.account_id=bl.account_id AND je.status IN ('posted','reversed') AND je.entry_date BETWEEN p_period_start AND p_period_end AND (bl.cost_center_id IS NULL OR jel.cost_center_id=bl.cost_center_id) AND (bl.project_id IS NULL OR jel.project_id=bl.project_id)),0) AS actual_amount,
   0,0,label,p_period_start,p_period_end,auth.uid()
 FROM public.budget_lines bl WHERE bl.budget_id=p_budget_id;
 UPDATE public.budget_variance_reports SET variance_amount=actual_amount-budget_amount, variance_percentage=CASE WHEN budget_amount=0 THEN 0 ELSE ((actual_amount-budget_amount)/budget_amount)*100 END WHERE budget_id=p_budget_id AND report_period=label;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(b.tenant_id,b.legal_entity_id,'budget_variance_generated','budget',b.id,auth.uid(),jsonb_build_object('budget_id',b.id,'period',label));
 RETURN QUERY SELECT * FROM public.budget_variance_reports WHERE budget_id=p_budget_id AND report_period=label ORDER BY account_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_budget_variance_report(UUID,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_forecast_scenario(p_legal_entity_id UUID,p_scenario_name TEXT,p_start_date DATE,p_end_date DATE,p_projected_cash NUMERIC,p_scenario_type TEXT DEFAULT 'cash',p_confidence_level TEXT DEFAULT 'base',p_assumptions JSONB DEFAULT '{}'::jsonb,p_scenario_id UUID DEFAULT NULL)
RETURNS public.cash_forecast_scenarios LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; old public.cash_forecast_scenarios%ROWTYPE; r public.cash_forecast_scenarios%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_scenario_name),'')='' OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date THEN RAISE EXCEPTION 'INVALID_FORECAST_SCENARIO'; END IF;
 IF p_scenario_id IS NOT NULL THEN SELECT * INTO old FROM public.cash_forecast_scenarios WHERE id=p_scenario_id AND legal_entity_id=p_legal_entity_id FOR UPDATE; END IF;
 IF old.id IS NOT NULL THEN
   UPDATE public.cash_forecast_scenarios SET scenario_name=btrim(p_scenario_name),start_date=p_start_date,end_date=p_end_date,projected_cash=COALESCE(p_projected_cash,0),scenario_type=p_scenario_type,confidence_level=p_confidence_level,assumptions=COALESCE(p_assumptions,'{}'::jsonb),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 ELSE
   INSERT INTO public.cash_forecast_scenarios(tenant_id,legal_entity_id,scenario_name,start_date,end_date,projected_cash,status,scenario_type,confidence_level,assumptions)
   VALUES(e.tenant_id,p_legal_entity_id,btrim(p_scenario_name),p_start_date,p_end_date,COALESCE(p_projected_cash,0),'draft',p_scenario_type,p_confidence_level,COALESCE(p_assumptions,'{}'::jsonb)) RETURNING * INTO r;
 END IF;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'forecast_scenario_upserted','cash_forecast_scenario',r.id,auth.uid(),CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_forecast_scenario(UUID,TEXT,DATE,DATE,NUMERIC,TEXT,TEXT,JSONB,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_forecast_status(p_scenario_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.cash_forecast_scenarios LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.cash_forecast_scenarios%ROWTYPE; r public.cash_forecast_scenarios%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'FORECAST_STATUS_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.cash_forecast_scenarios WHERE id=p_scenario_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FORECAST_SCENARIO_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF p_status NOT IN ('submitted','approved','closed','voided') THEN RAISE EXCEPTION 'INVALID_FORECAST_STATUS'; END IF;
 UPDATE public.cash_forecast_scenarios SET status=p_status,approved_at=CASE WHEN p_status='approved' THEN NOW() ELSE approved_at END,approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END,updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,CONCAT('forecast_',p_status),'cash_forecast_scenario',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('scenario',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_finance_forecast_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_budget_board WITH (security_invoker=true) AS SELECT b.*,e.code AS entity_code,e.name_ar AS entity_name,COUNT(l.id)::BIGINT AS line_count,COALESCE(SUM(l.budget_amount),0)::NUMERIC AS total_budget,COALESCE(SUM(l.forecast_amount),0)::NUMERIC AS total_forecast FROM public.budgets b JOIN public.legal_entities e ON e.id=b.legal_entity_id LEFT JOIN public.budget_lines l ON l.budget_id=b.id WHERE b.tenant_id=public.current_user_tenant_id() GROUP BY b.id,e.code,e.name_ar ORDER BY b.fiscal_year DESC,b.budget_name;
GRANT SELECT ON public.finance_budget_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_budget_line_board WITH (security_invoker=true) AS SELECT l.*,a.code AS account_code,COALESCE(a.name_ar,a.name) AS account_name,cc.code AS cost_center_code,cc.name_ar AS cost_center_name,fp.code AS project_code,fp.name_ar AS project_name FROM public.budget_lines l JOIN public.chart_of_accounts a ON a.id=l.account_id LEFT JOIN public.cost_centers cc ON cc.id=l.cost_center_id LEFT JOIN public.finance_projects fp ON fp.id=l.project_id WHERE l.tenant_id=public.current_user_tenant_id() ORDER BY l.created_at DESC;
GRANT SELECT ON public.finance_budget_line_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_budget_variance_board WITH (security_invoker=true) AS SELECT r.*,b.budget_name,a.code AS account_code,COALESCE(a.name_ar,a.name) AS account_name,cc.code AS cost_center_code,fp.code AS project_code FROM public.budget_variance_reports r JOIN public.budgets b ON b.id=r.budget_id LEFT JOIN public.chart_of_accounts a ON a.id=r.account_id LEFT JOIN public.cost_centers cc ON cc.id=r.cost_center_id LEFT JOIN public.finance_projects fp ON fp.id=r.project_id WHERE r.tenant_id=public.current_user_tenant_id() ORDER BY r.created_at DESC;
GRANT SELECT ON public.finance_budget_variance_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_budget_dashboard WITH (security_invoker=true) AS SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,COUNT(b.id) FILTER(WHERE b.status='draft')::BIGINT AS draft_budgets,COUNT(b.id) FILTER(WHERE b.status='submitted')::BIGINT AS submitted_budgets,COUNT(b.id) FILTER(WHERE b.status='approved')::BIGINT AS approved_budgets,COALESCE(SUM(l.budget_amount) FILTER(WHERE b.status='approved'),0)::NUMERIC AS approved_budget_total,COUNT(s.id) FILTER(WHERE s.status='approved')::BIGINT AS approved_forecasts FROM public.legal_entities e LEFT JOIN public.budgets b ON b.legal_entity_id=e.id LEFT JOIN public.budget_lines l ON l.budget_id=b.id LEFT JOIN public.cash_forecast_scenarios s ON s.legal_entity_id=e.id WHERE e.tenant_id=public.current_user_tenant_id() GROUP BY e.tenant_id,e.id,e.code,e.name_ar ORDER BY e.code;
GRANT SELECT ON public.finance_budget_dashboard TO authenticated;
CREATE OR REPLACE VIEW public.finance_forecast_scenario_board WITH (security_invoker=true) AS SELECT s.*,e.code AS entity_code,e.name_ar AS entity_name FROM public.cash_forecast_scenarios s JOIN public.legal_entities e ON e.id=s.legal_entity_id WHERE s.tenant_id=public.current_user_tenant_id() ORDER BY s.start_date DESC,s.created_at DESC;
GRANT SELECT ON public.finance_forecast_scenario_board TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_budget_board') IS NULL OR to_regclass('public.finance_forecast_scenario_board') IS NULL OR to_regprocedure('public.upsert_finance_budget(uuid,text,integer,date,date,character,text,uuid)') IS NULL OR to_regprocedure('public.generate_budget_variance_report(uuid,date,date)') IS NULL OR to_regprocedure('public.upsert_finance_forecast_scenario(uuid,text,date,date,numeric,text,text,jsonb,uuid)') IS NULL THEN RAISE EXCEPTION '0248 failed: Finance budgeting/forecasting objects missing'; END IF;
 RAISE NOTICE '✅ 0248: Finance budgeting and forecasting applied';
END $$;
