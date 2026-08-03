-- ============================================================================
-- 0254 — Finance Unit 14: Finance Integrations
-- docs/finance/14-finance-integrations.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_integration_connectors(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  connector_code TEXT NOT NULL,
  connector_name TEXT NOT NULL,
  source_system TEXT NOT NULL CHECK(source_system IN ('procurement','inventory','mrp','crm','hr','external','manual')),
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound','bidirectional')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(legal_entity_id,connector_code)
);

CREATE TABLE IF NOT EXISTS public.finance_integration_events(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  connector_id UUID REFERENCES public.finance_integration_connectors(id) ON DELETE SET NULL,
  source_system TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID,
  idempotency_key TEXT,
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency_code CHAR(3) REFERENCES public.currencies(code),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewed','converted','rejected','ignored','failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_reason TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(legal_entity_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_finance_integration_events_entity_status ON public.finance_integration_events(legal_entity_id,status,created_at DESC);

ALTER TABLE public.finance_integration_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_integration_connectors_access ON public.finance_integration_connectors FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_integration_events_access ON public.finance_integration_events FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_integration_connector(p_legal_entity_id UUID,p_connector_code TEXT,p_connector_name TEXT,p_source_system TEXT,p_direction TEXT DEFAULT 'inbound',p_status TEXT DEFAULT 'active',p_settings JSONB DEFAULT '{}'::jsonb)
RETURNS public.finance_integration_connectors LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; r public.finance_integration_connectors%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF p_source_system NOT IN ('procurement','inventory','mrp','crm','hr','external','manual') THEN RAISE EXCEPTION 'INVALID_INTEGRATION_SOURCE'; END IF;
 INSERT INTO public.finance_integration_connectors(tenant_id,legal_entity_id,connector_code,connector_name,source_system,direction,status,settings,created_by)
 VALUES(e.tenant_id,p_legal_entity_id,upper(btrim(p_connector_code)),btrim(p_connector_name),p_source_system,COALESCE(p_direction,'inbound'),COALESCE(p_status,'active'),COALESCE(p_settings,'{}'::jsonb),auth.uid())
 ON CONFLICT(legal_entity_id,connector_code) DO UPDATE SET connector_name=EXCLUDED.connector_name,source_system=EXCLUDED.source_system,direction=EXCLUDED.direction,status=EXCLUDED.status,settings=EXCLUDED.settings,updated_at=NOW()
 RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(r.tenant_id,r.legal_entity_id,'finance_integration_connector_upserted','finance_integration_connector',r.id,auth.uid(),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_integration_connector(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.ingest_finance_integration_event(p_legal_entity_id UUID,p_connector_id UUID,p_source_system TEXT,p_source_type TEXT,p_source_id UUID,p_event_type TEXT,p_event_date DATE,p_amount NUMERIC,p_currency_code CHAR(3),p_idempotency_key TEXT,p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS public.finance_integration_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; r public.finance_integration_events%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_source_type),'')='' OR COALESCE(btrim(p_event_type),'')='' THEN RAISE EXCEPTION 'INTEGRATION_EVENT_REQUIRED_FIELDS'; END IF;
 INSERT INTO public.finance_integration_events(tenant_id,legal_entity_id,connector_id,source_system,source_type,source_id,event_type,event_date,amount,currency_code,idempotency_key,payload,status)
 VALUES(e.tenant_id,p_legal_entity_id,p_connector_id,p_source_system,p_source_type,p_source_id,p_event_type,COALESCE(p_event_date,CURRENT_DATE),COALESCE(p_amount,0),COALESCE(p_currency_code,e.base_currency_code),NULLIF(btrim(COALESCE(p_idempotency_key,'')),''),COALESCE(p_payload,'{}'::jsonb),'received')
 ON CONFLICT(legal_entity_id,idempotency_key) DO UPDATE SET updated_at=NOW()
 RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(r.tenant_id,r.legal_entity_id,'finance_integration_event_ingested','finance_integration_event',r.id,auth.uid(),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.ingest_finance_integration_event(UUID,UUID,TEXT,TEXT,UUID,TEXT,DATE,NUMERIC,CHAR(3),TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_finance_integration_event(p_event_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.finance_integration_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.finance_integration_events%ROWTYPE; r public.finance_integration_events%ROWTYPE;
BEGIN
 IF p_status NOT IN ('reviewed','rejected','ignored') THEN RAISE EXCEPTION 'INVALID_INTEGRATION_REVIEW_STATUS'; END IF;
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'INTEGRATION_REVIEW_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.finance_integration_events WHERE id=p_event_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'INTEGRATION_EVENT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF old.status NOT IN ('received','reviewed','failed') THEN RAISE EXCEPTION 'INTEGRATION_EVENT_CANNOT_BE_REVIEWED'; END IF;
 UPDATE public.finance_integration_events SET status=p_status,reviewed_at=NOW(),reviewed_by=auth.uid(),review_reason=btrim(p_reason),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'finance_integration_event_reviewed','finance_integration_event',r.id,auth.uid(),to_jsonb(old),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.review_finance_integration_event(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_finance_journal_from_integration_event(p_event_id UUID,p_accounting_period_id UUID,p_description TEXT,p_lines JSONB,p_reason TEXT)
RETURNS public.journal_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ev public.finance_integration_events%ROWTYPE; je public.journal_entries%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'INTEGRATION_POSTING_REASON_REQUIRED'; END IF;
 SELECT * INTO ev FROM public.finance_integration_events WHERE id=p_event_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'INTEGRATION_EVENT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(ev.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF ev.status NOT IN ('received','reviewed','failed') THEN RAISE EXCEPTION 'INTEGRATION_EVENT_CANNOT_BE_CONVERTED'; END IF;
 je := public.create_journal_draft(ev.legal_entity_id,p_accounting_period_id,ev.event_date,COALESCE(NULLIF(btrim(p_description),''),ev.event_type),ev.source_system || ':' || ev.source_type,ev.currency_code,1,p_lines,gen_random_uuid());
 je := public.post_journal_entry_with_reason(je.id,p_reason);
 UPDATE public.finance_integration_events SET status='converted',journal_entry_id=je.id,reviewed_at=COALESCE(reviewed_at,NOW()),reviewed_by=COALESCE(reviewed_by,auth.uid()),review_reason=p_reason,updated_at=NOW() WHERE id=ev.id;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(ev.tenant_id,ev.legal_entity_id,'finance_integration_event_converted','finance_integration_event',ev.id,auth.uid(),to_jsonb(ev),jsonb_build_object('journal_entry',to_jsonb(je),'reason',p_reason));
 RETURN je;
END $$;
GRANT EXECUTE ON FUNCTION public.create_finance_journal_from_integration_event(UUID,UUID,TEXT,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_integration_connector_board WITH (security_invoker=true) AS SELECT c.*,e.code AS entity_code,e.name_ar AS entity_name FROM public.finance_integration_connectors c JOIN public.legal_entities e ON e.id=c.legal_entity_id WHERE c.tenant_id=public.current_user_tenant_id() ORDER BY c.source_system,c.connector_code;
GRANT SELECT ON public.finance_integration_connector_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_integration_event_board WITH (security_invoker=true) AS SELECT ev.*,e.code AS entity_code,e.name_ar AS entity_name,c.connector_code,c.connector_name,je.entry_number FROM public.finance_integration_events ev JOIN public.legal_entities e ON e.id=ev.legal_entity_id LEFT JOIN public.finance_integration_connectors c ON c.id=ev.connector_id LEFT JOIN public.journal_entries je ON je.id=ev.journal_entry_id WHERE ev.tenant_id=public.current_user_tenant_id() ORDER BY ev.created_at DESC;
GRANT SELECT ON public.finance_integration_event_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_integration_dashboard WITH (security_invoker=true) AS SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,COUNT(c.id) FILTER(WHERE c.status='active')::BIGINT AS active_connectors,COUNT(ev.id) FILTER(WHERE ev.status='received')::BIGINT AS received_events,COUNT(ev.id) FILTER(WHERE ev.status='reviewed')::BIGINT AS reviewed_events,COUNT(ev.id) FILTER(WHERE ev.status='converted')::BIGINT AS converted_events,COUNT(ev.id) FILTER(WHERE ev.status IN ('failed','rejected'))::BIGINT AS failed_or_rejected_events FROM public.legal_entities e LEFT JOIN public.finance_integration_connectors c ON c.legal_entity_id=e.id LEFT JOIN public.finance_integration_events ev ON ev.legal_entity_id=e.id WHERE e.tenant_id=public.current_user_tenant_id() GROUP BY e.tenant_id,e.id,e.code,e.name_ar ORDER BY e.code;
GRANT SELECT ON public.finance_integration_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_integration_connectors') IS NULL OR to_regclass('public.finance_integration_event_board') IS NULL OR to_regprocedure('public.upsert_finance_integration_connector(uuid,text,text,text,text,text,jsonb)') IS NULL OR to_regprocedure('public.create_finance_journal_from_integration_event(uuid,uuid,text,jsonb,text)') IS NULL THEN RAISE EXCEPTION '0254 failed: Finance integrations objects missing'; END IF;
 RAISE NOTICE '✅ 0254: Finance integrations applied';
END $$;
