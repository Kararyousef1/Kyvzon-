-- ============================================================================
-- 0246 — Finance Unit 06: Cash & Bank Reconciliation
-- docs/finance/06-cash-bank-reconciliation.md
-- ============================================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'bank' CHECK(account_type IN ('bank','cash','wallet')),
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.bank_accounts b SET legal_entity_id=e.id FROM public.legal_entities e WHERE e.tenant_id=b.tenant_id AND e.code='DEFAULT' AND b.legal_entity_id IS NULL;
ALTER TABLE public.bank_accounts ALTER COLUMN legal_entity_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_account_entity_number ON public.bank_accounts(legal_entity_id, account_number);

ALTER TABLE public.bank_statement_imports
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
UPDATE public.bank_statement_imports i SET legal_entity_id=b.legal_entity_id, tenant_id=b.tenant_id FROM public.bank_accounts b WHERE b.id=i.bank_account_id AND i.legal_entity_id IS NULL;
ALTER TABLE public.bank_statement_imports ALTER COLUMN legal_entity_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_import_file ON public.bank_statement_imports(bank_account_id, file_path) WHERE file_path IS NOT NULL;

ALTER TABLE public.bank_statement_lines
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS external_reference TEXT,
  ADD COLUMN IF NOT EXISTS match_reason TEXT,
  ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS matched_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
UPDATE public.bank_statement_lines l SET tenant_id=i.tenant_id, legal_entity_id=i.legal_entity_id, bank_account_id=i.bank_account_id FROM public.bank_statement_imports i WHERE i.id=l.import_id AND l.tenant_id IS NULL;
ALTER TABLE public.bank_statement_lines ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.bank_statement_lines ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.bank_statement_lines ALTER COLUMN bank_account_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_entity_account ON public.bank_statement_lines(legal_entity_id, bank_account_id, transaction_date);

ALTER TABLE public.bank_reconciliations
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS book_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE public.bank_reconciliations r SET legal_entity_id=b.legal_entity_id, tenant_id=b.tenant_id FROM public.bank_accounts b WHERE b.id=r.bank_account_id AND r.legal_entity_id IS NULL;
ALTER TABLE public.bank_reconciliations ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.bank_reconciliations DROP CONSTRAINT IF EXISTS bank_reconciliations_status_check;
ALTER TABLE public.bank_reconciliations ADD CONSTRAINT bank_reconciliations_status_check CHECK(status IN ('draft','pending','completed','voided'));

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_bank_accounts_access ON public.bank_accounts;
DROP POLICY IF EXISTS finance_bank_statement_imports_access ON public.bank_statement_imports;
DROP POLICY IF EXISTS finance_bank_statement_lines_access ON public.bank_statement_lines;
DROP POLICY IF EXISTS finance_bank_reconciliations_access ON public.bank_reconciliations;
CREATE POLICY finance_bank_accounts_access ON public.bank_accounts FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_bank_statement_imports_access ON public.bank_statement_imports FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_bank_statement_lines_access ON public.bank_statement_lines FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_bank_reconciliations_access ON public.bank_reconciliations FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_bank_account(p_legal_entity_id UUID,p_account_name TEXT,p_account_number TEXT,p_bank_name TEXT,p_currency CHAR(3) DEFAULT 'IQD',p_account_type TEXT DEFAULT 'bank',p_opening_balance NUMERIC DEFAULT 0)
RETURNS public.bank_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; r public.bank_accounts%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_account_name),'')='' OR COALESCE(btrim(p_account_number),'')='' OR COALESCE(btrim(p_bank_name),'')='' THEN RAISE EXCEPTION 'BANK_ACCOUNT_REQUIRED_FIELDS'; END IF;
 IF p_account_type NOT IN ('bank','cash','wallet') THEN RAISE EXCEPTION 'INVALID_BANK_ACCOUNT_TYPE'; END IF;
 INSERT INTO public.bank_accounts(tenant_id,legal_entity_id,account_name,account_number,bank_name,currency,balance,opening_balance,is_active,account_type)
 VALUES(e.tenant_id,p_legal_entity_id,btrim(p_account_name),btrim(p_account_number),btrim(p_bank_name),p_currency,COALESCE(p_opening_balance,0),COALESCE(p_opening_balance,0),true,p_account_type)
 ON CONFLICT(legal_entity_id,account_number) DO UPDATE SET account_name=EXCLUDED.account_name,bank_name=EXCLUDED.bank_name,currency=EXCLUDED.currency,account_type=EXCLUDED.account_type,is_active=true,updated_at=NOW()
 RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(r.tenant_id,r.legal_entity_id,'bank_account_upserted','bank_account',r.id,auth.uid(),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_bank_account(UUID,TEXT,TEXT,TEXT,CHAR(3),TEXT,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_bank_account_status(p_bank_account_id UUID,p_is_active BOOLEAN,p_reason TEXT)
RETURNS public.bank_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.bank_accounts%ROWTYPE; r public.bank_accounts%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'BANK_ACCOUNT_STATUS_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.bank_accounts WHERE id=p_bank_account_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 UPDATE public.bank_accounts SET is_active=COALESCE(p_is_active,false),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(old.tenant_id,old.legal_entity_id,'bank_account_status_changed','bank_account',old.id,auth.uid(),to_jsonb(old),jsonb_build_object('bank_account',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_finance_bank_account_status(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_bank_statement_import_with_lines(p_bank_account_id UUID,p_file_path TEXT,p_import_date DATE,p_source_name TEXT DEFAULT NULL,p_lines JSONB DEFAULT '[]'::jsonb)
RETURNS public.bank_statement_imports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bank_accounts%ROWTYPE; imp public.bank_statement_imports%ROWTYPE; cnt INT;
BEGIN
 SELECT * INTO b FROM public.bank_accounts WHERE id=p_bank_account_id AND is_active; IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNT_INVALID_OR_INACTIVE'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(b.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF COALESCE(btrim(p_file_path),'')='' THEN RAISE EXCEPTION 'BANK_STATEMENT_FILE_PATH_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.bank_statement_imports WHERE bank_account_id=p_bank_account_id AND file_path=btrim(p_file_path)) THEN RAISE EXCEPTION 'BANK_STATEMENT_ALREADY_IMPORTED'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'BANK_STATEMENT_LINES_MUST_BE_ARRAY'; END IF;
 SELECT COUNT(*) INTO cnt FROM jsonb_array_elements(p_lines);
 INSERT INTO public.bank_statement_imports(tenant_id,legal_entity_id,bank_account_id,import_date,file_path,source_name,status,total_imported,total_matched)
 VALUES(b.tenant_id,b.legal_entity_id,b.id,COALESCE(p_import_date,CURRENT_DATE),btrim(p_file_path),NULLIF(btrim(COALESCE(p_source_name,'')),''),'completed',cnt,0) RETURNING * INTO imp;
 INSERT INTO public.bank_statement_lines(import_id,tenant_id,legal_entity_id,bank_account_id,transaction_date,description,amount,external_reference,matched)
 SELECT imp.id,b.tenant_id,b.legal_entity_id,b.id,(line->>'transaction_date')::DATE,NULLIF(btrim(COALESCE(line->>'description','')),''),(line->>'amount')::NUMERIC,NULLIF(btrim(COALESCE(line->>'external_reference','')),''),false FROM jsonb_array_elements(p_lines) line;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(b.tenant_id,b.legal_entity_id,'bank_statement_imported','bank_statement_import',imp.id,auth.uid(),jsonb_build_object('import',to_jsonb(imp),'line_count',cnt));
 RETURN imp;
END $$;
GRANT EXECUTE ON FUNCTION public.create_bank_statement_import_with_lines(UUID,TEXT,DATE,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.match_bank_statement_line(p_statement_line_id UUID,p_journal_entry_id UUID,p_reason TEXT)
RETURNS public.bank_statement_lines LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.bank_statement_lines%ROWTYPE; r public.bank_statement_lines%ROWTYPE; je public.journal_entries%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'BANK_MATCH_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.bank_statement_lines WHERE id=p_statement_line_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'BANK_STATEMENT_LINE_NOT_FOUND'; END IF;
 IF old.matched THEN RAISE EXCEPTION 'BANK_STATEMENT_LINE_ALREADY_MATCHED'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO je FROM public.journal_entries WHERE id=p_journal_entry_id AND legal_entity_id=old.legal_entity_id AND status IN ('posted','reversed'); IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_JOURNAL_ENTRY_INVALID'; END IF;
 UPDATE public.bank_statement_lines SET matched=true,matched_to_journal=p_journal_entry_id,match_reason=btrim(p_reason),matched_at=NOW(),matched_by=auth.uid() WHERE id=old.id RETURNING * INTO r;
 UPDATE public.bank_statement_imports SET total_matched=(SELECT COUNT(*) FROM public.bank_statement_lines WHERE import_id=old.import_id AND matched) WHERE id=old.import_id;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(old.tenant_id,old.legal_entity_id,'bank_statement_line_matched','bank_statement_line',old.id,auth.uid(),to_jsonb(old),jsonb_build_object('line',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.match_bank_statement_line(UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_bank_reconciliation_controlled(p_bank_account_id UUID,p_reconciliation_date DATE,p_statement_balance NUMERIC,p_book_balance NUMERIC,p_period_start DATE DEFAULT NULL,p_period_end DATE DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS public.bank_reconciliations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bank_accounts%ROWTYPE; r public.bank_reconciliations%ROWTYPE; diff NUMERIC;
BEGIN
 SELECT * INTO b FROM public.bank_accounts WHERE id=p_bank_account_id AND is_active; IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNT_INVALID_OR_INACTIVE'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(b.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 diff := COALESCE(p_statement_balance,0)-COALESCE(p_book_balance,0);
 INSERT INTO public.bank_reconciliations(tenant_id,legal_entity_id,bank_account_id,reconciliation_date,period_start,period_end,statement_balance,book_balance,adjusted_balance,difference,status,notes)
 VALUES(b.tenant_id,b.legal_entity_id,b.id,p_reconciliation_date,p_period_start,p_period_end,p_statement_balance,p_book_balance,p_book_balance,diff,'draft',NULLIF(btrim(COALESCE(p_notes,'')),'')) RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(r.tenant_id,r.legal_entity_id,'bank_reconciliation_created','bank_reconciliation',r.id,auth.uid(),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.create_bank_reconciliation_controlled(UUID,DATE,NUMERIC,NUMERIC,DATE,DATE,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_bank_reconciliation(p_reconciliation_id UUID,p_reason TEXT)
RETURNS public.bank_reconciliations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.bank_reconciliations%ROWTYPE; r public.bank_reconciliations%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'BANK_RECONCILIATION_COMPLETE_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.bank_reconciliations WHERE id=p_reconciliation_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'BANK_RECONCILIATION_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF old.status NOT IN ('draft','pending') THEN RAISE EXCEPTION 'BANK_RECONCILIATION_CANNOT_COMPLETE'; END IF;
 UPDATE public.bank_reconciliations SET status='completed',completed_at=NOW(),completed_by=auth.uid() WHERE id=old.id RETURNING * INTO r;
 UPDATE public.bank_accounts SET balance=r.adjusted_balance,updated_at=NOW() WHERE id=r.bank_account_id;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'bank_reconciliation_completed','bank_reconciliation',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('reconciliation',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_bank_reconciliation(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_bank_reconciliation(p_reconciliation_id UUID,p_reason TEXT)
RETURNS public.bank_reconciliations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.bank_reconciliations%ROWTYPE; r public.bank_reconciliations%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'BANK_RECONCILIATION_VOID_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.bank_reconciliations WHERE id=p_reconciliation_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'BANK_RECONCILIATION_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF old.status='completed' THEN RAISE EXCEPTION 'COMPLETED_RECONCILIATION_CANNOT_BE_VOIDED'; END IF;
 UPDATE public.bank_reconciliations SET status='voided',voided_at=NOW(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'bank_reconciliation_voided','bank_reconciliation',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('reconciliation',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.void_bank_reconciliation(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_bank_account_board WITH (security_invoker=true) AS SELECT b.*,e.code AS entity_code,e.name_ar AS entity_name,COUNT(i.id)::BIGINT AS import_count,COUNT(r.id)::BIGINT AS reconciliation_count FROM public.bank_accounts b JOIN public.legal_entities e ON e.id=b.legal_entity_id LEFT JOIN public.bank_statement_imports i ON i.bank_account_id=b.id LEFT JOIN public.bank_reconciliations r ON r.bank_account_id=b.id WHERE b.tenant_id=public.current_user_tenant_id() GROUP BY b.id,e.code,e.name_ar ORDER BY e.code,b.bank_name,b.account_name;
GRANT SELECT ON public.finance_bank_account_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_bank_statement_import_board WITH (security_invoker=true) AS SELECT i.*,b.bank_name,b.account_name,b.account_number,b.currency,e.code AS entity_code,e.name_ar AS entity_name FROM public.bank_statement_imports i JOIN public.bank_accounts b ON b.id=i.bank_account_id JOIN public.legal_entities e ON e.id=i.legal_entity_id WHERE i.tenant_id=public.current_user_tenant_id() ORDER BY i.import_date DESC,i.created_at DESC;
GRANT SELECT ON public.finance_bank_statement_import_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_bank_statement_line_board WITH (security_invoker=true) AS SELECT l.*,b.bank_name,b.account_name,je.entry_number FROM public.bank_statement_lines l JOIN public.bank_accounts b ON b.id=l.bank_account_id LEFT JOIN public.journal_entries je ON je.id=l.matched_to_journal WHERE l.tenant_id=public.current_user_tenant_id() ORDER BY l.transaction_date DESC,l.created_at DESC;
GRANT SELECT ON public.finance_bank_statement_line_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_bank_reconciliation_board WITH (security_invoker=true) AS SELECT r.*,b.bank_name,b.account_name,b.account_number,b.currency,e.code AS entity_code,e.name_ar AS entity_name FROM public.bank_reconciliations r JOIN public.bank_accounts b ON b.id=r.bank_account_id JOIN public.legal_entities e ON e.id=r.legal_entity_id WHERE r.tenant_id=public.current_user_tenant_id() ORDER BY r.reconciliation_date DESC,r.created_at DESC;
GRANT SELECT ON public.finance_bank_reconciliation_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_cash_bank_dashboard WITH (security_invoker=true) AS SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,COUNT(b.id) FILTER(WHERE b.is_active)::BIGINT AS active_bank_accounts,COALESCE(SUM(b.balance) FILTER(WHERE b.is_active),0)::NUMERIC AS total_cash_balance,COUNT(i.id) FILTER(WHERE i.status IN ('pending','processing'))::BIGINT AS pending_imports,COUNT(l.id) FILTER(WHERE NOT l.matched)::BIGINT AS unmatched_statement_lines,COUNT(r.id) FILTER(WHERE r.status IN ('draft','pending'))::BIGINT AS open_reconciliations FROM public.legal_entities e LEFT JOIN public.bank_accounts b ON b.legal_entity_id=e.id LEFT JOIN public.bank_statement_imports i ON i.legal_entity_id=e.id LEFT JOIN public.bank_statement_lines l ON l.legal_entity_id=e.id LEFT JOIN public.bank_reconciliations r ON r.legal_entity_id=e.id WHERE e.tenant_id=public.current_user_tenant_id() GROUP BY e.tenant_id,e.id,e.code,e.name_ar ORDER BY e.code;
GRANT SELECT ON public.finance_cash_bank_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_bank_account_board') IS NULL OR to_regclass('public.finance_bank_statement_line_board') IS NULL OR to_regprocedure('public.upsert_finance_bank_account(uuid,text,text,text,character,text,numeric)') IS NULL OR to_regprocedure('public.create_bank_statement_import_with_lines(uuid,text,date,text,jsonb)') IS NULL OR to_regprocedure('public.complete_bank_reconciliation(uuid,text)') IS NULL THEN RAISE EXCEPTION '0246 failed: Finance cash/bank objects missing'; END IF;
 RAISE NOTICE '✅ 0246: Finance cash and bank reconciliation applied';
END $$;
