-- ============================================================================
-- 0252 — Finance Unit 12: Project Accounting
-- docs/finance/12-project-accounting.md
-- ============================================================================

ALTER TABLE public.finance_projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'operational' CHECK(project_type IN ('operational','capex','customer','internal','grant','other')),
  ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_method TEXT NOT NULL DEFAULT 'none' CHECK(billing_method IN ('none','time_material','fixed_fee','milestone','cost_plus')),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS close_reason TEXT;

CREATE TABLE IF NOT EXISTS public.finance_project_budget_lines(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.finance_projects(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  line_type TEXT NOT NULL DEFAULT 'cost' CHECK(line_type IN ('cost','revenue','capex')),
  period_start DATE,
  period_end DATE,
  budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(budget_amount>=0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_project_budget_lines_project ON public.finance_project_budget_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_finance_project_budget_lines_entity ON public.finance_project_budget_lines(legal_entity_id,account_id,cost_center_id);

CREATE TABLE IF NOT EXISTS public.finance_project_actual_snapshots(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.finance_projects(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  actual_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id,as_of_date)
);

ALTER TABLE public.finance_project_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_project_actual_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_project_budget_lines_access ON public.finance_project_budget_lines;
DROP POLICY IF EXISTS finance_project_actual_snapshots_access ON public.finance_project_actual_snapshots;
CREATE POLICY finance_project_budget_lines_access ON public.finance_project_budget_lines FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_project_actual_snapshots_access ON public.finance_project_actual_snapshots FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_project_accounting_project(p_legal_entity_id UUID,p_code TEXT,p_name_ar TEXT,p_name_en TEXT DEFAULT NULL,p_project_type TEXT DEFAULT 'operational',p_budget_amount NUMERIC DEFAULT 0,p_billing_method TEXT DEFAULT 'none',p_start_date DATE DEFAULT NULL,p_end_date DATE DEFAULT NULL,p_project_id UUID DEFAULT NULL)
RETURNS public.finance_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; old public.finance_projects%ROWTYPE; r public.finance_projects%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_code),'')='' OR COALESCE(btrim(p_name_ar),'')='' THEN RAISE EXCEPTION 'PROJECT_CODE_AND_NAME_REQUIRED'; END IF;
 IF p_project_type NOT IN ('operational','capex','customer','internal','grant','other') THEN RAISE EXCEPTION 'INVALID_PROJECT_TYPE'; END IF;
 IF p_billing_method NOT IN ('none','time_material','fixed_fee','milestone','cost_plus') THEN RAISE EXCEPTION 'INVALID_BILLING_METHOD'; END IF;
 IF p_project_id IS NOT NULL THEN SELECT * INTO old FROM public.finance_projects WHERE id=p_project_id AND legal_entity_id=p_legal_entity_id FOR UPDATE; END IF;
 IF old.id IS NOT NULL THEN
   IF old.status IN ('closed','archived') THEN RAISE EXCEPTION 'CLOSED_OR_ARCHIVED_PROJECT_CANNOT_BE_EDITED'; END IF;
   UPDATE public.finance_projects SET code=upper(btrim(p_code)),name_ar=btrim(p_name_ar),name_en=NULLIF(btrim(COALESCE(p_name_en,'')),''),project_type=p_project_type,budget_amount=COALESCE(p_budget_amount,0),billing_method=p_billing_method,start_date=p_start_date,end_date=p_end_date,updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 ELSE
   INSERT INTO public.finance_projects(tenant_id,legal_entity_id,code,name_ar,name_en,status,start_date,end_date,project_type,budget_amount,billing_method)
   VALUES(e.tenant_id,p_legal_entity_id,upper(btrim(p_code)),btrim(p_name_ar),NULLIF(btrim(COALESCE(p_name_en,'')),''),'active',p_start_date,p_end_date,p_project_type,COALESCE(p_budget_amount,0),p_billing_method) RETURNING * INTO r;
 END IF;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'project_accounting_project_upserted','finance_project',r.id,auth.uid(),CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_project_accounting_project(UUID,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,DATE,DATE,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_project_budget_line(p_project_id UUID,p_account_id UUID,p_budget_amount NUMERIC,p_line_type TEXT DEFAULT 'cost',p_cost_center_id UUID DEFAULT NULL,p_period_start DATE DEFAULT NULL,p_period_end DATE DEFAULT NULL,p_notes TEXT DEFAULT NULL,p_line_id UUID DEFAULT NULL)
RETURNS public.finance_project_budget_lines LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.finance_projects%ROWTYPE; a public.chart_of_accounts%ROWTYPE; old public.finance_project_budget_lines%ROWTYPE; r public.finance_project_budget_lines%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.finance_projects WHERE id=p_project_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(p.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF p.status IN ('closed','archived') THEN RAISE EXCEPTION 'CLOSED_PROJECT_BUDGET_CANNOT_CHANGE'; END IF;
 SELECT * INTO a FROM public.chart_of_accounts WHERE id=p_account_id AND legal_entity_id=p.legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_IN_PROJECT_ENTITY'; END IF;
 IF p_line_type NOT IN ('cost','revenue','capex') THEN RAISE EXCEPTION 'INVALID_PROJECT_BUDGET_LINE_TYPE'; END IF;
 IF p_cost_center_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centers WHERE id=p_cost_center_id AND legal_entity_id=p.legal_entity_id AND is_active) THEN RAISE EXCEPTION 'INVALID_COST_CENTER'; END IF;
 IF p_line_id IS NOT NULL THEN SELECT * INTO old FROM public.finance_project_budget_lines WHERE id=p_line_id AND project_id=p_project_id FOR UPDATE; END IF;
 IF old.id IS NOT NULL THEN
   UPDATE public.finance_project_budget_lines SET account_id=p_account_id,budget_amount=COALESCE(p_budget_amount,0),line_type=p_line_type,cost_center_id=p_cost_center_id,period_start=p_period_start,period_end=p_period_end,notes=NULLIF(btrim(COALESCE(p_notes,'')),''),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 ELSE
   INSERT INTO public.finance_project_budget_lines(tenant_id,legal_entity_id,project_id,account_id,budget_amount,line_type,cost_center_id,period_start,period_end,notes)
   VALUES(p.tenant_id,p.legal_entity_id,p.id,p_account_id,COALESCE(p_budget_amount,0),p_line_type,p_cost_center_id,p_period_start,p_period_end,NULLIF(btrim(COALESCE(p_notes,'')),'')) RETURNING * INTO r;
 END IF;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'project_budget_line_upserted','project_budget_line',r.id,auth.uid(),CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_project_budget_line(UUID,UUID,NUMERIC,TEXT,UUID,DATE,DATE,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_project_actuals_snapshot(p_project_id UUID,p_as_of_date DATE)
RETURNS public.finance_project_actual_snapshots LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.finance_projects%ROWTYPE; cost NUMERIC; revenue NUMERIC; budget NUMERIC; r public.finance_project_actual_snapshots%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.finance_projects WHERE id=p_project_id; IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(p.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT COALESCE(SUM(jel.debit_amount-jel.credit_amount),0) INTO cost FROM public.journal_entry_lines jel JOIN public.journal_entries je ON je.id=jel.entry_id JOIN public.chart_of_accounts a ON a.id=jel.account_id WHERE jel.project_id=p.id AND je.status IN ('posted','reversed') AND je.entry_date<=p_as_of_date AND a.account_type IN ('Expense','Asset');
 SELECT COALESCE(SUM(jel.credit_amount-jel.debit_amount),0) INTO revenue FROM public.journal_entry_lines jel JOIN public.journal_entries je ON je.id=jel.entry_id JOIN public.chart_of_accounts a ON a.id=jel.account_id WHERE jel.project_id=p.id AND je.status IN ('posted','reversed') AND je.entry_date<=p_as_of_date AND a.account_type='Revenue';
 SELECT COALESCE(SUM(budget_amount),0) INTO budget FROM public.finance_project_budget_lines WHERE project_id=p.id;
 INSERT INTO public.finance_project_actual_snapshots(tenant_id,legal_entity_id,project_id,as_of_date,actual_cost,actual_revenue,budget_amount,variance_amount,generated_by)
 VALUES(p.tenant_id,p.legal_entity_id,p.id,p_as_of_date,COALESCE(cost,0),COALESCE(revenue,0),COALESCE(budget,0),COALESCE(revenue,0)-COALESCE(cost,0)-COALESCE(budget,0),auth.uid())
 ON CONFLICT(project_id,as_of_date) DO UPDATE SET actual_cost=EXCLUDED.actual_cost,actual_revenue=EXCLUDED.actual_revenue,budget_amount=EXCLUDED.budget_amount,variance_amount=EXCLUDED.variance_amount,generated_by=auth.uid(),created_at=NOW()
 RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(r.tenant_id,r.legal_entity_id,'project_actuals_snapshot_generated','finance_project',p.id,auth.uid(),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_project_actuals_snapshot(UUID,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_project_accounting_status(p_project_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.finance_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.finance_projects%ROWTYPE; r public.finance_projects%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'PROJECT_STATUS_REASON_REQUIRED'; END IF;
 IF p_status NOT IN ('active','on_hold','closed','archived') THEN RAISE EXCEPTION 'INVALID_PROJECT_STATUS'; END IF;
 SELECT * INTO old FROM public.finance_projects WHERE id=p_project_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 UPDATE public.finance_projects SET status=p_status,closed_at=CASE WHEN p_status IN ('closed','archived') THEN NOW() ELSE closed_at END,closed_by=CASE WHEN p_status IN ('closed','archived') THEN auth.uid() ELSE closed_by END,close_reason=CASE WHEN p_status IN ('closed','archived') THEN btrim(p_reason) ELSE close_reason END,updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'project_accounting_status_changed','finance_project',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('project',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_project_accounting_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_project_accounting_board WITH (security_invoker=true) AS
SELECT p.*,e.code AS entity_code,e.name_ar AS entity_name,
 COALESCE(SUM(bl.budget_amount),0)::NUMERIC AS budget_lines_total,
 COALESCE((SELECT actual_cost FROM public.finance_project_actual_snapshots s WHERE s.project_id=p.id ORDER BY s.as_of_date DESC LIMIT 1),0)::NUMERIC AS latest_actual_cost,
 COALESCE((SELECT actual_revenue FROM public.finance_project_actual_snapshots s WHERE s.project_id=p.id ORDER BY s.as_of_date DESC LIMIT 1),0)::NUMERIC AS latest_actual_revenue,
 (SELECT as_of_date FROM public.finance_project_actual_snapshots s WHERE s.project_id=p.id ORDER BY s.as_of_date DESC LIMIT 1) AS latest_snapshot_date
FROM public.finance_projects p JOIN public.legal_entities e ON e.id=p.legal_entity_id LEFT JOIN public.finance_project_budget_lines bl ON bl.project_id=p.id
WHERE p.tenant_id=public.current_user_tenant_id()
GROUP BY p.id,e.code,e.name_ar
ORDER BY p.code;
GRANT SELECT ON public.finance_project_accounting_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_project_budget_line_board WITH (security_invoker=true) AS
SELECT bl.*,p.code AS project_code,p.name_ar AS project_name,a.code AS account_code,COALESCE(a.name_ar,a.name) AS account_name,cc.code AS cost_center_code,cc.name_ar AS cost_center_name
FROM public.finance_project_budget_lines bl JOIN public.finance_projects p ON p.id=bl.project_id JOIN public.chart_of_accounts a ON a.id=bl.account_id LEFT JOIN public.cost_centers cc ON cc.id=bl.cost_center_id
WHERE bl.tenant_id=public.current_user_tenant_id()
ORDER BY bl.created_at DESC;
GRANT SELECT ON public.finance_project_budget_line_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_project_actuals_board WITH (security_invoker=true) AS
SELECT s.*,p.code AS project_code,p.name_ar AS project_name FROM public.finance_project_actual_snapshots s JOIN public.finance_projects p ON p.id=s.project_id WHERE s.tenant_id=public.current_user_tenant_id() ORDER BY s.as_of_date DESC;
GRANT SELECT ON public.finance_project_actuals_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_project_accounting_dashboard WITH (security_invoker=true) AS
SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,
 COUNT(p.id) FILTER(WHERE p.status='active')::BIGINT AS active_projects,
 COUNT(p.id) FILTER(WHERE p.status='on_hold')::BIGINT AS on_hold_projects,
 COUNT(p.id) FILTER(WHERE p.status='closed')::BIGINT AS closed_projects,
 COALESCE(SUM(p.budget_amount),0)::NUMERIC AS project_budget_total,
 COALESCE(SUM(s.actual_cost),0)::NUMERIC AS latest_actual_cost,
 COALESCE(SUM(s.actual_revenue),0)::NUMERIC AS latest_actual_revenue
FROM public.legal_entities e
LEFT JOIN public.finance_projects p ON p.legal_entity_id=e.id
LEFT JOIN LATERAL (SELECT actual_cost,actual_revenue FROM public.finance_project_actual_snapshots snap WHERE snap.project_id=p.id ORDER BY snap.as_of_date DESC LIMIT 1) s ON true
WHERE e.tenant_id=public.current_user_tenant_id()
GROUP BY e.tenant_id,e.id,e.code,e.name_ar
ORDER BY e.code;
GRANT SELECT ON public.finance_project_accounting_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_project_accounting_board') IS NULL OR to_regclass('public.finance_project_budget_line_board') IS NULL OR to_regprocedure('public.upsert_project_accounting_project(uuid,text,text,text,text,numeric,text,date,date,uuid)') IS NULL OR to_regprocedure('public.generate_project_actuals_snapshot(uuid,date)') IS NULL THEN RAISE EXCEPTION '0252 failed: Finance project accounting objects missing'; END IF;
 RAISE NOTICE '✅ 0252: Finance project accounting applied';
END $$;
