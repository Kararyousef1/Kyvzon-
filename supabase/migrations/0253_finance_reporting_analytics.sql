-- ============================================================================
-- 0253 — Finance Unit 13: Financial Reporting & Analytics
-- docs/finance/13-financial-reporting-analytics.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_report_runs(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK(report_type IN ('trial_balance','profit_loss','balance_sheet','cash_flow','tax_summary','budget_variance','fixed_assets','revenue_recognition','intercompany','project_accounting','executive_kpi')),
  report_name TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','cancelled','failed')),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancel_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_finance_report_runs_entity_time ON public.finance_report_runs(legal_entity_id,generated_at DESC);

CREATE TABLE IF NOT EXISTS public.finance_report_exports(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  report_run_id UUID NOT NULL REFERENCES public.finance_report_runs(id) ON DELETE CASCADE,
  export_format TEXT NOT NULL CHECK(export_format IN ('xlsx','pdf','csv','json')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','processing','ready','failed','cancelled')),
  file_url TEXT,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_finance_report_exports_run ON public.finance_report_exports(report_run_id,requested_at DESC);

ALTER TABLE public.finance_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_report_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_report_runs_access ON public.finance_report_runs;
DROP POLICY IF EXISTS finance_report_exports_access ON public.finance_report_exports;
CREATE POLICY finance_report_runs_access ON public.finance_report_runs FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_report_exports_access ON public.finance_report_exports FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE VIEW public.finance_executive_kpi_dashboard WITH (security_invoker=true) AS
SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,
  COALESCE((SELECT SUM(total_debit) FROM public.journal_entries je WHERE je.legal_entity_id=e.id AND je.status IN ('posted','reversed')),0)::NUMERIC AS posted_debits,
  COALESCE((SELECT SUM(total_credit) FROM public.journal_entries je WHERE je.legal_entity_id=e.id AND je.status IN ('posted','reversed')),0)::NUMERIC AS posted_credits,
  COALESCE((SELECT SUM(amount-amount_paid) FROM public.accounts_payable ap WHERE ap.legal_entity_id=e.id AND ap.status IN ('approved','partially_paid','overdue')),0)::NUMERIC AS ap_outstanding,
  COALESCE((SELECT SUM(total_amount-amount_received) FROM public.accounts_receivable ar WHERE ar.legal_entity_id=e.id AND ar.status IN ('approved','partially_received','overdue')),0)::NUMERIC AS ar_outstanding,
  COALESCE((SELECT SUM(balance) FROM public.bank_accounts b WHERE b.legal_entity_id=e.id AND b.is_active),0)::NUMERIC AS cash_balance,
  COALESCE((SELECT SUM(net_tax_due) FROM public.tax_filing_status tf WHERE tf.legal_entity_id=e.id AND tf.status IN ('draft','submitted','approved')),0)::NUMERIC AS open_tax_due,
  COALESCE((SELECT SUM(book_value) FROM public.fixed_assets fa WHERE fa.legal_entity_id=e.id AND fa.status='active'),0)::NUMERIC AS fixed_asset_book_value,
  COALESCE((SELECT SUM(recognized_amount) FROM public.revenue_contracts rc WHERE rc.legal_entity_id=e.id),0)::NUMERIC AS recognized_revenue
FROM public.legal_entities e
WHERE e.tenant_id=public.current_user_tenant_id()
ORDER BY e.code;
GRANT SELECT ON public.finance_executive_kpi_dashboard TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_finance_report_run(p_legal_entity_id UUID,p_report_type TEXT,p_period_start DATE DEFAULT NULL,p_period_end DATE DEFAULT NULL,p_parameters JSONB DEFAULT '{}'::jsonb)
RETURNS public.finance_report_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; payload JSONB := '{}'::jsonb; run public.finance_report_runs%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_access_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF p_report_type NOT IN ('trial_balance','profit_loss','balance_sheet','cash_flow','tax_summary','budget_variance','fixed_assets','revenue_recognition','intercompany','project_accounting','executive_kpi') THEN RAISE EXCEPTION 'INVALID_FINANCE_REPORT_TYPE'; END IF;
 IF p_report_type='trial_balance' THEN
   SELECT jsonb_agg(to_jsonb(x)) INTO payload FROM public.get_trial_balance(p_legal_entity_id,p_period_start,p_period_end) x;
 ELSIF p_report_type='executive_kpi' THEN
   SELECT to_jsonb(x) INTO payload FROM public.finance_executive_kpi_dashboard x WHERE x.legal_entity_id=p_legal_entity_id;
 ELSIF p_report_type='budget_variance' THEN
   SELECT jsonb_agg(to_jsonb(x)) INTO payload FROM public.finance_budget_variance_board x WHERE x.legal_entity_id=p_legal_entity_id AND (p_period_start IS NULL OR x.period_start>=p_period_start) AND (p_period_end IS NULL OR x.period_end<=p_period_end);
 ELSIF p_report_type='fixed_assets' THEN
   SELECT jsonb_agg(to_jsonb(x)) INTO payload FROM public.finance_fixed_asset_board x WHERE x.legal_entity_id=p_legal_entity_id;
 ELSIF p_report_type='revenue_recognition' THEN
   SELECT jsonb_agg(to_jsonb(x)) INTO payload FROM public.finance_revenue_contract_board x WHERE x.legal_entity_id=p_legal_entity_id;
 ELSIF p_report_type='intercompany' THEN
   SELECT jsonb_agg(to_jsonb(x)) INTO payload FROM public.finance_intercompany_transaction_board x WHERE x.source_legal_entity_id=p_legal_entity_id OR x.target_legal_entity_id=p_legal_entity_id;
 ELSIF p_report_type='project_accounting' THEN
   SELECT jsonb_agg(to_jsonb(x)) INTO payload FROM public.finance_project_accounting_board x WHERE x.legal_entity_id=p_legal_entity_id;
 ELSIF p_report_type='tax_summary' THEN
   SELECT jsonb_agg(to_jsonb(x)) INTO payload FROM public.finance_tax_filing_board x WHERE x.legal_entity_id=p_legal_entity_id;
 ELSE
   SELECT to_jsonb(x) INTO payload FROM public.finance_executive_kpi_dashboard x WHERE x.legal_entity_id=p_legal_entity_id;
 END IF;
 INSERT INTO public.finance_report_runs(tenant_id,legal_entity_id,report_type,report_name,period_start,period_end,parameters,report_payload,generated_by)
 VALUES(e.tenant_id,p_legal_entity_id,p_report_type,p_report_type || ' — ' || e.code,p_period_start,p_period_end,COALESCE(p_parameters,'{}'::jsonb),COALESCE(payload,'[]'::jsonb),auth.uid()) RETURNING * INTO run;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(run.tenant_id,run.legal_entity_id,'finance_report_generated','finance_report_run',run.id,auth.uid(),to_jsonb(run));
 RETURN run;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_finance_report_run(UUID,TEXT,DATE,DATE,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_finance_report_export(p_report_run_id UUID,p_export_format TEXT)
RETURNS public.finance_report_exports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_report_runs%ROWTYPE; ex public.finance_report_exports%ROWTYPE;
BEGIN
 IF p_export_format NOT IN ('xlsx','pdf','csv','json') THEN RAISE EXCEPTION 'INVALID_EXPORT_FORMAT'; END IF;
 SELECT * INTO r FROM public.finance_report_runs WHERE id=p_report_run_id; IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_RUN_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_access_legal_entity(r.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 INSERT INTO public.finance_report_exports(tenant_id,legal_entity_id,report_run_id,export_format,requested_by) VALUES(r.tenant_id,r.legal_entity_id,r.id,p_export_format,auth.uid()) RETURNING * INTO ex;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(ex.tenant_id,ex.legal_entity_id,'finance_report_export_requested','finance_report_export',ex.id,auth.uid(),to_jsonb(ex));
 RETURN ex;
END $$;
GRANT EXECUTE ON FUNCTION public.request_finance_report_export(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_finance_report_run(p_report_run_id UUID,p_reason TEXT)
RETURNS public.finance_report_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.finance_report_runs%ROWTYPE; r public.finance_report_runs%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'REPORT_CANCEL_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.finance_report_runs WHERE id=p_report_run_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_RUN_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 UPDATE public.finance_report_runs SET status='cancelled',cancelled_at=NOW(),cancelled_by=auth.uid(),cancel_reason=btrim(p_reason) WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'finance_report_cancelled','finance_report_run',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('report',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_finance_report_run(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_report_run_board WITH (security_invoker=true) AS
SELECT r.*,e.code AS entity_code,e.name_ar AS entity_name,p.full_name AS generated_by_name,COUNT(x.id)::BIGINT AS export_count
FROM public.finance_report_runs r JOIN public.legal_entities e ON e.id=r.legal_entity_id LEFT JOIN public.profiles p ON p.id=r.generated_by LEFT JOIN public.finance_report_exports x ON x.report_run_id=r.id
WHERE r.tenant_id=public.current_user_tenant_id()
GROUP BY r.id,e.code,e.name_ar,p.full_name
ORDER BY r.generated_at DESC;
GRANT SELECT ON public.finance_report_run_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_report_export_board WITH (security_invoker=true) AS
SELECT x.*,r.report_type,r.report_name,e.code AS entity_code,e.name_ar AS entity_name,p.full_name AS requested_by_name
FROM public.finance_report_exports x JOIN public.finance_report_runs r ON r.id=x.report_run_id JOIN public.legal_entities e ON e.id=x.legal_entity_id LEFT JOIN public.profiles p ON p.id=x.requested_by
WHERE x.tenant_id=public.current_user_tenant_id()
ORDER BY x.requested_at DESC;
GRANT SELECT ON public.finance_report_export_board TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_report_runs') IS NULL OR to_regclass('public.finance_report_run_board') IS NULL OR to_regprocedure('public.generate_finance_report_run(uuid,text,date,date,jsonb)') IS NULL OR to_regprocedure('public.request_finance_report_export(uuid,text)') IS NULL THEN RAISE EXCEPTION '0253 failed: Finance reporting analytics objects missing'; END IF;
 RAISE NOTICE '✅ 0253: Finance reporting analytics applied';
END $$;
