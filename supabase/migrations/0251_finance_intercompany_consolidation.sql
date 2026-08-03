-- ============================================================================
-- 0251 — Finance Unit 11: Intercompany & Consolidation
-- docs/finance/11-intercompany-consolidation.md
-- ============================================================================

ALTER TABLE public.intercompany_transactions
  ADD COLUMN IF NOT EXISTS source_legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS matched_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eliminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eliminated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;
UPDATE public.intercompany_transactions t
SET source_legal_entity_id=e.id,
    target_legal_entity_id=e.id
FROM public.legal_entities e
WHERE e.tenant_id=t.tenant_id AND e.code='DEFAULT' AND t.source_legal_entity_id IS NULL;
ALTER TABLE public.intercompany_transactions ALTER COLUMN source_legal_entity_id SET NOT NULL;
ALTER TABLE public.intercompany_transactions ALTER COLUMN target_legal_entity_id SET NOT NULL;
ALTER TABLE public.intercompany_transactions DROP CONSTRAINT IF EXISTS intercompany_transactions_status_check;
ALTER TABLE public.intercompany_transactions ADD CONSTRAINT intercompany_transactions_status_check CHECK(status IN ('pending','matched','eliminated','voided'));
ALTER TABLE public.intercompany_transactions DROP CONSTRAINT IF EXISTS intercompany_transactions_transaction_type_check;
ALTER TABLE public.intercompany_transactions ADD CONSTRAINT intercompany_transactions_transaction_type_check CHECK(transaction_type IN ('transfer','fee','loan','recharge','royalty','dividend'));
CREATE INDEX IF NOT EXISTS idx_intercompany_entities ON public.intercompany_transactions(source_legal_entity_id,target_legal_entity_id,status);

ALTER TABLE public.consolidation_entries
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS counterparty_legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intercompany_transaction_id UUID REFERENCES public.intercompany_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','voided')),
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
UPDATE public.consolidation_entries c
SET tenant_id=COALESCE(c.tenant_id,c.parent_tenant), legal_entity_id=e.id
FROM public.legal_entities e
WHERE e.tenant_id=c.parent_tenant AND e.code='DEFAULT' AND c.legal_entity_id IS NULL;
ALTER TABLE public.consolidation_entries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.consolidation_entries ALTER COLUMN legal_entity_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consolidation_entries_entity ON public.consolidation_entries(legal_entity_id,entry_date,status);

ALTER TABLE public.intercompany_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_intercompany_access ON public.intercompany_transactions;
DROP POLICY IF EXISTS finance_consolidation_entries_access ON public.consolidation_entries;
CREATE POLICY finance_intercompany_access ON public.intercompany_transactions FOR ALL TO authenticated
  USING(public.current_user_can_access_legal_entity(source_legal_entity_id) OR public.current_user_can_access_legal_entity(target_legal_entity_id))
  WITH CHECK(public.current_user_can_manage_legal_entity(source_legal_entity_id) AND public.current_user_can_access_legal_entity(target_legal_entity_id));
CREATE POLICY finance_consolidation_entries_access ON public.consolidation_entries FOR ALL TO authenticated
  USING(public.current_user_can_access_legal_entity(legal_entity_id))
  WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.create_intercompany_transaction_controlled(
  p_source_legal_entity_id UUID,
  p_target_legal_entity_id UUID,
  p_transaction_type TEXT,
  p_amount NUMERIC,
  p_currency CHAR(3),
  p_reference TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS public.intercompany_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.legal_entities%ROWTYPE; t public.legal_entities%ROWTYPE; r public.intercompany_transactions%ROWTYPE;
BEGIN
  IF p_source_legal_entity_id=p_target_legal_entity_id THEN RAISE EXCEPTION 'INTERCOMPANY_REQUIRES_DIFFERENT_ENTITIES'; END IF;
  IF COALESCE(p_amount,0)<=0 THEN RAISE EXCEPTION 'INTERCOMPANY_AMOUNT_MUST_BE_POSITIVE'; END IF;
  IF p_transaction_type NOT IN ('transfer','fee','loan','recharge','royalty','dividend') THEN RAISE EXCEPTION 'INVALID_INTERCOMPANY_TYPE'; END IF;
  SELECT * INTO s FROM public.legal_entities WHERE id=p_source_legal_entity_id;
  SELECT * INTO t FROM public.legal_entities WHERE id=p_target_legal_entity_id;
  IF s.id IS NULL OR t.id IS NULL OR s.tenant_id<>t.tenant_id THEN RAISE EXCEPTION 'ENTITIES_MUST_BELONG_TO_SAME_TENANT'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(s.id) OR NOT public.current_user_can_access_legal_entity(t.id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_INTERCOMPANY'; END IF;
  INSERT INTO public.intercompany_transactions(tenant_id,source_tenant,target_tenant,source_legal_entity_id,target_legal_entity_id,transaction_type,amount,currency,reference,description,status)
  VALUES(s.tenant_id,s.tenant_id,t.tenant_id,s.id,t.id,p_transaction_type,p_amount,p_currency,NULLIF(btrim(COALESCE(p_reference,'')),''),NULLIF(btrim(COALESCE(p_description,'')),''),'pending') RETURNING * INTO r;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(r.tenant_id,r.source_legal_entity_id,'intercompany_transaction_created','intercompany_transaction',r.id,auth.uid(),to_jsonb(r));
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.create_intercompany_transaction_controlled(UUID,UUID,TEXT,NUMERIC,CHAR(3),TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.match_intercompany_transaction(p_transaction_id UUID,p_reason TEXT)
RETURNS public.intercompany_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.intercompany_transactions%ROWTYPE; r public.intercompany_transactions%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'INTERCOMPANY_MATCH_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.intercompany_transactions WHERE id=p_transaction_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'INTERCOMPANY_TRANSACTION_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.source_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF old.status<>'pending' THEN RAISE EXCEPTION 'ONLY_PENDING_INTERCOMPANY_CAN_BE_MATCHED'; END IF;
 UPDATE public.intercompany_transactions SET status='matched',matched_at=NOW(),matched_by=auth.uid(),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
 VALUES(r.tenant_id,r.source_legal_entity_id,'intercompany_transaction_matched','intercompany_transaction',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('transaction',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.match_intercompany_transaction(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.eliminate_intercompany_transaction(p_transaction_id UUID,p_reason TEXT)
RETURNS public.intercompany_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.intercompany_transactions%ROWTYPE; r public.intercompany_transactions%ROWTYPE; ce public.consolidation_entries%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'INTERCOMPANY_ELIMINATION_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.intercompany_transactions WHERE id=p_transaction_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'INTERCOMPANY_TRANSACTION_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.source_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF old.status NOT IN ('pending','matched') THEN RAISE EXCEPTION 'INTERCOMPANY_TRANSACTION_CANNOT_BE_ELIMINATED'; END IF;
 INSERT INTO public.consolidation_entries(parent_tenant,subsidiary_tenant,tenant_id,legal_entity_id,counterparty_legal_entity_id,intercompany_transaction_id,entry_date,description,debit_amount,credit_amount,elimination_type,status,reason,created_by)
 VALUES(old.source_tenant,old.target_tenant,old.tenant_id,old.source_legal_entity_id,old.target_legal_entity_id,old.id,CURRENT_DATE,COALESCE(old.description,'Intercompany elimination'),old.amount,old.amount,'intercompany','posted',btrim(p_reason),auth.uid()) RETURNING * INTO ce;
 UPDATE public.intercompany_transactions SET status='eliminated',eliminated_at=NOW(),eliminated_by=auth.uid(),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
 VALUES(r.tenant_id,r.source_legal_entity_id,'intercompany_transaction_eliminated','intercompany_transaction',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('transaction',to_jsonb(r),'consolidation_entry',to_jsonb(ce),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.eliminate_intercompany_transaction(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_intercompany_transaction(p_transaction_id UUID,p_reason TEXT)
RETURNS public.intercompany_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.intercompany_transactions%ROWTYPE; r public.intercompany_transactions%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'INTERCOMPANY_VOID_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.intercompany_transactions WHERE id=p_transaction_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'INTERCOMPANY_TRANSACTION_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.source_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF old.status='eliminated' THEN RAISE EXCEPTION 'ELIMINATED_INTERCOMPANY_CANNOT_BE_VOIDED'; END IF;
 UPDATE public.intercompany_transactions SET status='voided',voided_at=NOW(),voided_by=auth.uid(),void_reason=btrim(p_reason),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
 VALUES(r.tenant_id,r.source_legal_entity_id,'intercompany_transaction_voided','intercompany_transaction',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('transaction',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.void_intercompany_transaction(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_intercompany_transaction_board WITH (security_invoker=true) AS
SELECT tx.*, se.code AS source_entity_code, se.name_ar AS source_entity_name, te.code AS target_entity_code, te.name_ar AS target_entity_name
FROM public.intercompany_transactions tx
JOIN public.legal_entities se ON se.id=tx.source_legal_entity_id
JOIN public.legal_entities te ON te.id=tx.target_legal_entity_id
WHERE tx.tenant_id=public.current_user_tenant_id()
ORDER BY tx.created_at DESC;
GRANT SELECT ON public.finance_intercompany_transaction_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_consolidation_entry_board WITH (security_invoker=true) AS
SELECT ce.*, le.code AS entity_code, le.name_ar AS entity_name, cp.code AS counterparty_entity_code, cp.name_ar AS counterparty_entity_name
FROM public.consolidation_entries ce
JOIN public.legal_entities le ON le.id=ce.legal_entity_id
LEFT JOIN public.legal_entities cp ON cp.id=ce.counterparty_legal_entity_id
WHERE ce.tenant_id=public.current_user_tenant_id()
ORDER BY ce.entry_date DESC, ce.created_at DESC;
GRANT SELECT ON public.finance_consolidation_entry_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_intercompany_dashboard WITH (security_invoker=true) AS
SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,
 COUNT(tx.id) FILTER(WHERE tx.status='pending')::BIGINT AS pending_transactions,
 COUNT(tx.id) FILTER(WHERE tx.status='matched')::BIGINT AS matched_transactions,
 COUNT(tx.id) FILTER(WHERE tx.status='eliminated')::BIGINT AS eliminated_transactions,
 COALESCE(SUM(tx.amount) FILTER(WHERE tx.status IN ('pending','matched')),0)::NUMERIC AS open_intercompany_amount,
 COUNT(ce.id) FILTER(WHERE ce.status='posted')::BIGINT AS posted_eliminations
FROM public.legal_entities e
LEFT JOIN public.intercompany_transactions tx ON tx.source_legal_entity_id=e.id OR tx.target_legal_entity_id=e.id
LEFT JOIN public.consolidation_entries ce ON ce.legal_entity_id=e.id
WHERE e.tenant_id=public.current_user_tenant_id()
GROUP BY e.tenant_id,e.id,e.code,e.name_ar
ORDER BY e.code;
GRANT SELECT ON public.finance_intercompany_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_intercompany_transaction_board') IS NULL OR to_regclass('public.finance_consolidation_entry_board') IS NULL OR to_regprocedure('public.create_intercompany_transaction_controlled(uuid,uuid,text,numeric,character,text,text)') IS NULL OR to_regprocedure('public.eliminate_intercompany_transaction(uuid,text)') IS NULL THEN RAISE EXCEPTION '0251 failed: Finance intercompany objects missing'; END IF;
 RAISE NOTICE '✅ 0251: Finance intercompany and consolidation applied';
END $$;
