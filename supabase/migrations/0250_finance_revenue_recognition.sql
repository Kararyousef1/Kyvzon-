-- ============================================================================
-- 0250 — Finance Unit 10: Revenue Recognition
-- docs/finance/10-revenue-recognition.md
-- ============================================================================

ALTER TABLE public.revenue_contracts
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS deferred_revenue_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recognized_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.revenue_contracts c SET legal_entity_id=e.id,currency_code=COALESCE(currency_code,e.base_currency_code) FROM public.legal_entities e WHERE e.tenant_id=c.tenant_id AND e.code='DEFAULT' AND c.legal_entity_id IS NULL;
ALTER TABLE public.revenue_contracts ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.revenue_contracts ALTER COLUMN currency_code SET NOT NULL;
ALTER TABLE public.revenue_contracts DROP CONSTRAINT IF EXISTS revenue_contracts_status_check;
ALTER TABLE public.revenue_contracts ADD CONSTRAINT revenue_contracts_status_check CHECK(status IN ('draft','active','completed','cancelled','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_contract_entity_number ON public.revenue_contracts(legal_entity_id, contract_number);

ALTER TABLE public.revenue_recognition_schedules
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recognized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recognized_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recognition_reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE public.revenue_recognition_schedules s SET tenant_id=c.tenant_id,legal_entity_id=c.legal_entity_id FROM public.revenue_contracts c WHERE c.id=s.contract_id AND s.tenant_id IS NULL;
ALTER TABLE public.revenue_recognition_schedules ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.revenue_recognition_schedules ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.revenue_recognition_schedules DROP CONSTRAINT IF EXISTS revenue_recognition_schedules_status_check;
ALTER TABLE public.revenue_recognition_schedules ADD CONSTRAINT revenue_recognition_schedules_status_check CHECK(status IN ('scheduled','recognized','adjusted','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_schedule_contract_period ON public.revenue_recognition_schedules(contract_id, period_start, period_end);

ALTER TABLE public.revenue_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_recognition_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_revenue_contracts_access ON public.revenue_contracts;
DROP POLICY IF EXISTS finance_revenue_schedules_access ON public.revenue_recognition_schedules;
CREATE POLICY finance_revenue_contracts_access ON public.revenue_contracts FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_revenue_schedules_access ON public.revenue_recognition_schedules FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_revenue_contract(p_legal_entity_id UUID,p_contract_number TEXT,p_customer_name TEXT,p_total_amount NUMERIC,p_contract_start DATE,p_contract_end DATE,p_recognition_method TEXT DEFAULT 'straight_line',p_currency_code CHAR(3) DEFAULT NULL,p_customer_id UUID DEFAULT NULL,p_contract_id UUID DEFAULT NULL)
RETURNS public.revenue_contracts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; old public.revenue_contracts%ROWTYPE; r public.revenue_contracts%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_contract_number),'')='' OR COALESCE(p_total_amount,0)<=0 OR p_contract_start IS NULL THEN RAISE EXCEPTION 'REVENUE_CONTRACT_REQUIRED_FIELDS'; END IF;
 IF p_contract_end IS NOT NULL AND p_contract_end<p_contract_start THEN RAISE EXCEPTION 'INVALID_CONTRACT_DATES'; END IF;
 IF p_recognition_method NOT IN ('straight_line','milestone','usage_based') THEN RAISE EXCEPTION 'INVALID_RECOGNITION_METHOD'; END IF;
 IF p_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_customer_id AND legal_entity_id=p_legal_entity_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_IN_ENTITY'; END IF;
 IF p_contract_id IS NOT NULL THEN SELECT * INTO old FROM public.revenue_contracts WHERE id=p_contract_id AND legal_entity_id=p_legal_entity_id FOR UPDATE; END IF;
 IF old.id IS NOT NULL THEN
   IF old.status NOT IN ('draft','active') THEN RAISE EXCEPTION 'ONLY_DRAFT_OR_ACTIVE_CONTRACT_CAN_BE_EDITED'; END IF;
   UPDATE public.revenue_contracts SET contract_number=upper(btrim(p_contract_number)),customer_name=NULLIF(btrim(COALESCE(p_customer_name,'')),''),customer_id=p_customer_id,total_amount=p_total_amount,contract_start=p_contract_start,contract_end=p_contract_end,recognition_method=p_recognition_method,currency_code=COALESCE(p_currency_code,e.base_currency_code),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 ELSE
   INSERT INTO public.revenue_contracts(tenant_id,legal_entity_id,contract_number,customer_name,customer_id,total_amount,contract_start,contract_end,recognition_method,currency_code,status)
   VALUES(e.tenant_id,p_legal_entity_id,upper(btrim(p_contract_number)),NULLIF(btrim(COALESCE(p_customer_name,'')),''),p_customer_id,p_total_amount,p_contract_start,p_contract_end,p_recognition_method,COALESCE(p_currency_code,e.base_currency_code),'active') RETURNING * INTO r;
 END IF;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'revenue_contract_upserted','revenue_contract',r.id,auth.uid(),CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_revenue_contract(UUID,TEXT,TEXT,NUMERIC,DATE,DATE,TEXT,CHAR(3),UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_revenue_recognition_schedule(p_contract_id UUID)
RETURNS SETOF public.revenue_recognition_schedules LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.revenue_contracts%ROWTYPE; months INT; i INT; ps DATE; pe DATE; amt NUMERIC; cum NUMERIC:=0;
BEGIN
 SELECT * INTO c FROM public.revenue_contracts WHERE id=p_contract_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'REVENUE_CONTRACT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(c.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF c.status<>'active' THEN RAISE EXCEPTION 'ONLY_ACTIVE_CONTRACT_CAN_BE_SCHEDULED'; END IF;
 IF c.contract_end IS NULL THEN RAISE EXCEPTION 'CONTRACT_END_REQUIRED_FOR_SCHEDULE'; END IF;
 months := GREATEST(1, ((date_part('year',age(c.contract_end,c.contract_start))*12 + date_part('month',age(c.contract_end,c.contract_start)))::INT + 1));
 amt := ROUND((c.total_amount / months)::NUMERIC,2);
 FOR i IN 1..months LOOP
   ps := (date_trunc('month',c.contract_start)::DATE + ((i-1)||' months')::INTERVAL)::DATE;
   pe := (ps + INTERVAL '1 month - 1 day')::DATE;
   cum := CASE WHEN i=months THEN c.total_amount ELSE LEAST(c.total_amount,cum+amt) END;
   INSERT INTO public.revenue_recognition_schedules(contract_id,tenant_id,legal_entity_id,period_start,period_end,recognized_amount,cumulative_amount,status)
   VALUES(c.id,c.tenant_id,c.legal_entity_id,ps,pe,CASE WHEN i=months THEN c.total_amount-(cum-amt) ELSE amt END,cum,'scheduled') ON CONFLICT(contract_id,period_start,period_end) DO NOTHING;
 END LOOP;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(c.tenant_id,c.legal_entity_id,'revenue_schedule_generated','revenue_contract',c.id,auth.uid(),jsonb_build_object('contract_id',c.id,'months',months));
 RETURN QUERY SELECT * FROM public.revenue_recognition_schedules WHERE contract_id=c.id ORDER BY period_start;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_revenue_recognition_schedule(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.recognize_revenue_schedule_line(p_schedule_id UUID,p_reason TEXT)
RETURNS public.revenue_recognition_schedules LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.revenue_recognition_schedules%ROWTYPE; r public.revenue_recognition_schedules%ROWTYPE; c public.revenue_contracts%ROWTYPE; total_recognized NUMERIC;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'REVENUE_RECOGNITION_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.revenue_recognition_schedules WHERE id=p_schedule_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'REVENUE_SCHEDULE_NOT_FOUND'; END IF;
 IF old.status<>'scheduled' THEN RAISE EXCEPTION 'ONLY_SCHEDULED_REVENUE_CAN_BE_RECOGNIZED'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO c FROM public.revenue_contracts WHERE id=old.contract_id FOR UPDATE;
 UPDATE public.revenue_recognition_schedules SET status='recognized',recognized_at=NOW(),recognized_by=auth.uid(),recognition_reason=btrim(p_reason) WHERE id=old.id RETURNING * INTO r;
 SELECT COALESCE(SUM(recognized_amount),0) INTO total_recognized FROM public.revenue_recognition_schedules WHERE contract_id=c.id AND status='recognized';
 UPDATE public.revenue_contracts SET recognized_amount=LEAST(total_amount,total_recognized),status=CASE WHEN total_recognized>=total_amount THEN 'completed' ELSE status END,updated_at=NOW() WHERE id=c.id;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'revenue_schedule_recognized','revenue_schedule',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('schedule',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.recognize_revenue_schedule_line(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_revenue_contract_status(p_contract_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.revenue_contracts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.revenue_contracts%ROWTYPE; r public.revenue_contracts%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'REVENUE_CONTRACT_STATUS_REASON_REQUIRED'; END IF;
 IF p_status NOT IN ('active','completed','cancelled','voided') THEN RAISE EXCEPTION 'INVALID_REVENUE_CONTRACT_STATUS'; END IF;
 SELECT * INTO old FROM public.revenue_contracts WHERE id=p_contract_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'REVENUE_CONTRACT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 UPDATE public.revenue_contracts SET status=p_status,updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'revenue_contract_status_changed','revenue_contract',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('contract',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_revenue_contract_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_revenue_contract_board WITH (security_invoker=true) AS SELECT c.*,e.code AS entity_code,e.name_ar AS entity_name,COUNT(s.id)::BIGINT AS schedule_count,COUNT(s.id) FILTER(WHERE s.status='recognized')::BIGINT AS recognized_schedule_count,COALESCE(SUM(s.recognized_amount) FILTER(WHERE s.status='recognized'),0)::NUMERIC AS schedule_recognized_total FROM public.revenue_contracts c JOIN public.legal_entities e ON e.id=c.legal_entity_id LEFT JOIN public.revenue_recognition_schedules s ON s.contract_id=c.id WHERE c.tenant_id=public.current_user_tenant_id() GROUP BY c.id,e.code,e.name_ar ORDER BY c.contract_start DESC;
GRANT SELECT ON public.finance_revenue_contract_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_revenue_schedule_board WITH (security_invoker=true) AS SELECT s.*,c.contract_number,c.customer_name,c.recognition_method FROM public.revenue_recognition_schedules s JOIN public.revenue_contracts c ON c.id=s.contract_id WHERE s.tenant_id=public.current_user_tenant_id() ORDER BY s.period_start DESC;
GRANT SELECT ON public.finance_revenue_schedule_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_revenue_dashboard WITH (security_invoker=true) AS SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,COUNT(c.id) FILTER(WHERE c.status='active')::BIGINT AS active_contracts,COUNT(c.id) FILTER(WHERE c.status='completed')::BIGINT AS completed_contracts,COALESCE(SUM(c.total_amount) FILTER(WHERE c.status IN ('active','completed')),0)::NUMERIC AS contracted_revenue,COALESCE(SUM(c.recognized_amount),0)::NUMERIC AS recognized_revenue,COUNT(s.id) FILTER(WHERE s.status='scheduled')::BIGINT AS scheduled_lines FROM public.legal_entities e LEFT JOIN public.revenue_contracts c ON c.legal_entity_id=e.id LEFT JOIN public.revenue_recognition_schedules s ON s.legal_entity_id=e.id WHERE e.tenant_id=public.current_user_tenant_id() GROUP BY e.tenant_id,e.id,e.code,e.name_ar ORDER BY e.code;
GRANT SELECT ON public.finance_revenue_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_revenue_contract_board') IS NULL OR to_regclass('public.finance_revenue_schedule_board') IS NULL OR to_regprocedure('public.upsert_finance_revenue_contract(uuid,text,text,numeric,date,date,text,character,uuid,uuid)') IS NULL OR to_regprocedure('public.recognize_revenue_schedule_line(uuid,text)') IS NULL THEN RAISE EXCEPTION '0250 failed: Finance revenue recognition objects missing'; END IF;
 RAISE NOTICE '✅ 0250: Finance revenue recognition applied';
END $$;
