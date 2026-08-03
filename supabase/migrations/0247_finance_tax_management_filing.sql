-- ============================================================================
-- 0247 — Finance Unit 07: Tax Management & Filing
-- docs/finance/07-tax-management-filing.md
-- ============================================================================

ALTER TABLE public.tax_codes
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tax_type TEXT NOT NULL DEFAULT 'vat' CHECK(tax_type IN ('vat','withholding','sales','purchase','other')),
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS requires_filing BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.tax_codes t SET legal_entity_id=e.id FROM public.legal_entities e WHERE e.tenant_id=t.tenant_id AND e.code='DEFAULT' AND t.legal_entity_id IS NULL;
ALTER TABLE public.tax_codes ALTER COLUMN legal_entity_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_code_entity_code ON public.tax_codes(legal_entity_id, code);

ALTER TABLE public.tax_filing_status
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS output_tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_tax_due NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.tax_filing_status f SET legal_entity_id=e.id FROM public.legal_entities e WHERE e.tenant_id=f.tenant_id AND e.code='DEFAULT' AND f.legal_entity_id IS NULL;
ALTER TABLE public.tax_filing_status ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.tax_filing_status DROP CONSTRAINT IF EXISTS tax_filing_status_status_check;
ALTER TABLE public.tax_filing_status ADD CONSTRAINT tax_filing_status_status_check CHECK(status IN ('draft','pending','submitted','approved','rejected','paid','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_filing_entity_period_type ON public.tax_filing_status(legal_entity_id, tax_period, filing_type);

CREATE TABLE IF NOT EXISTS public.finance_tax_filing_lines(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  tax_filing_id UUID NOT NULL REFERENCES public.tax_filing_status(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('ar_invoice','ap_invoice','manual_adjustment')),
  source_id UUID, tax_code_id UUID REFERENCES public.tax_codes(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('output','input','adjustment')),
  taxable_amount NUMERIC(15,2) NOT NULL DEFAULT 0, tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_filing_lines_filing ON public.finance_tax_filing_lines(tax_filing_id);
CREATE INDEX IF NOT EXISTS idx_finance_tax_filing_lines_entity ON public.finance_tax_filing_lines(legal_entity_id, direction);

ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_filing_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tax_filing_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_tax_codes_access ON public.tax_codes;
DROP POLICY IF EXISTS finance_tax_filing_status_access ON public.tax_filing_status;
DROP POLICY IF EXISTS finance_tax_filing_lines_access ON public.finance_tax_filing_lines;
CREATE POLICY finance_tax_codes_access ON public.tax_codes FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_tax_filing_status_access ON public.tax_filing_status FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_tax_filing_lines_access ON public.finance_tax_filing_lines FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_tax_code(p_legal_entity_id UUID,p_code TEXT,p_name TEXT,p_rate NUMERIC,p_tax_type TEXT DEFAULT 'vat',p_effective_from DATE DEFAULT CURRENT_DATE,p_effective_to DATE DEFAULT NULL,p_requires_filing BOOLEAN DEFAULT true)
RETURNS public.tax_codes LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; r public.tax_codes%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_code),'')='' OR COALESCE(btrim(p_name),'')='' THEN RAISE EXCEPTION 'TAX_CODE_AND_NAME_REQUIRED'; END IF;
 IF p_rate IS NULL OR p_rate<0 OR p_rate>1 THEN RAISE EXCEPTION 'TAX_RATE_MUST_BE_BETWEEN_0_AND_1'; END IF;
 IF p_tax_type NOT IN ('vat','withholding','sales','purchase','other') THEN RAISE EXCEPTION 'INVALID_TAX_TYPE'; END IF;
 INSERT INTO public.tax_codes(tenant_id,legal_entity_id,code,name,rate,tax_type,effective_from,effective_to,requires_filing,is_active)
 VALUES(e.tenant_id,p_legal_entity_id,upper(btrim(p_code)),btrim(p_name),p_rate,p_tax_type,COALESCE(p_effective_from,CURRENT_DATE),p_effective_to,COALESCE(p_requires_filing,true),true)
 ON CONFLICT(legal_entity_id,code) DO UPDATE SET name=EXCLUDED.name,rate=EXCLUDED.rate,tax_type=EXCLUDED.tax_type,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,requires_filing=EXCLUDED.requires_filing,is_active=true,updated_at=NOW()
 RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(r.tenant_id,r.legal_entity_id,'tax_code_upserted','tax_code',r.id,auth.uid(),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_tax_code(UUID,TEXT,TEXT,NUMERIC,TEXT,DATE,DATE,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_tax_code_status(p_tax_code_id UUID,p_is_active BOOLEAN,p_reason TEXT)
RETURNS public.tax_codes LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.tax_codes%ROWTYPE; r public.tax_codes%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'TAX_CODE_STATUS_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.tax_codes WHERE id=p_tax_code_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'TAX_CODE_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 UPDATE public.tax_codes SET is_active=COALESCE(p_is_active,false),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(old.tenant_id,old.legal_entity_id,'tax_code_status_changed','tax_code',old.id,auth.uid(),to_jsonb(old),jsonb_build_object('tax_code',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_finance_tax_code_status(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_tax_filing_draft(p_legal_entity_id UUID,p_filing_type TEXT,p_period_start DATE,p_period_end DATE)
RETURNS public.tax_filing_status LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; f public.tax_filing_status%ROWTYPE; out_tax NUMERIC; in_tax NUMERIC; period_label TEXT;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end<p_period_start THEN RAISE EXCEPTION 'INVALID_TAX_PERIOD'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 period_label := to_char(p_period_start,'YYYY-MM-DD') || ':' || to_char(p_period_end,'YYYY-MM-DD');
 SELECT COALESCE(SUM(l.tax_amount),0) INTO out_tax FROM public.ar_invoice_lines l JOIN public.accounts_receivable i ON i.id=l.ar_invoice_id WHERE l.legal_entity_id=p_legal_entity_id AND i.invoice_date BETWEEN p_period_start AND p_period_end AND i.status IN ('approved','partially_received','paid','overdue');
 SELECT COALESCE(SUM(l.tax_amount),0) INTO in_tax FROM public.ap_invoice_lines l JOIN public.accounts_payable i ON i.id=l.ap_invoice_id WHERE l.legal_entity_id=p_legal_entity_id AND i.invoice_date BETWEEN p_period_start AND p_period_end AND i.status IN ('approved','partially_paid','paid','overdue');
 INSERT INTO public.tax_filing_status(tenant_id,legal_entity_id,tax_period,filing_type,status,period_start,period_end,due_date,output_tax_amount,input_tax_amount,net_tax_due)
 VALUES(e.tenant_id,p_legal_entity_id,period_label,COALESCE(p_filing_type,'vat'),'draft',p_period_start,p_period_end,p_period_end + 30,COALESCE(out_tax,0),COALESCE(in_tax,0),COALESCE(out_tax,0)-COALESCE(in_tax,0))
 ON CONFLICT(legal_entity_id,tax_period,filing_type) DO UPDATE SET status='draft',output_tax_amount=EXCLUDED.output_tax_amount,input_tax_amount=EXCLUDED.input_tax_amount,net_tax_due=EXCLUDED.net_tax_due,updated_at=NOW()
 RETURNING * INTO f;
 DELETE FROM public.finance_tax_filing_lines WHERE tax_filing_id=f.id;
 INSERT INTO public.finance_tax_filing_lines(tenant_id,legal_entity_id,tax_filing_id,source_type,source_id,direction,taxable_amount,tax_amount,notes)
 SELECT e.tenant_id,p_legal_entity_id,f.id,'ar_invoice',i.id,'output',COALESCE(SUM(l.line_amount),0),COALESCE(SUM(l.tax_amount),0),i.invoice_number FROM public.accounts_receivable i JOIN public.ar_invoice_lines l ON l.ar_invoice_id=i.id WHERE i.legal_entity_id=p_legal_entity_id AND i.invoice_date BETWEEN p_period_start AND p_period_end AND i.status IN ('approved','partially_received','paid','overdue') GROUP BY i.id,i.invoice_number;
 INSERT INTO public.finance_tax_filing_lines(tenant_id,legal_entity_id,tax_filing_id,source_type,source_id,direction,taxable_amount,tax_amount,notes)
 SELECT e.tenant_id,p_legal_entity_id,f.id,'ap_invoice',i.id,'input',COALESCE(SUM(l.line_amount),0),COALESCE(SUM(l.tax_amount),0),i.invoice_number FROM public.accounts_payable i JOIN public.ap_invoice_lines l ON l.ap_invoice_id=i.id WHERE i.legal_entity_id=p_legal_entity_id AND i.invoice_date BETWEEN p_period_start AND p_period_end AND i.status IN ('approved','partially_paid','paid','overdue') GROUP BY i.id,i.invoice_number;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(f.tenant_id,f.legal_entity_id,'tax_filing_draft_generated','tax_filing',f.id,auth.uid(),to_jsonb(f));
 RETURN f;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_tax_filing_draft(UUID,TEXT,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_tax_filing_status(p_tax_filing_id UUID,p_status TEXT,p_reason TEXT,p_payment_reference TEXT DEFAULT NULL)
RETURNS public.tax_filing_status LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.tax_filing_status%ROWTYPE; r public.tax_filing_status%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'TAX_FILING_STATUS_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.tax_filing_status WHERE id=p_tax_filing_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'TAX_FILING_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF p_status NOT IN ('submitted','approved','rejected','paid','voided') THEN RAISE EXCEPTION 'INVALID_TAX_FILING_STATUS'; END IF;
 UPDATE public.tax_filing_status SET status=p_status,submitted_at=CASE WHEN p_status='submitted' THEN NOW() ELSE submitted_at END,submitted_by=CASE WHEN p_status='submitted' THEN auth.uid() ELSE submitted_by END,approved_at=CASE WHEN p_status='approved' THEN NOW() ELSE approved_at END,approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END,rejection_reason=CASE WHEN p_status='rejected' THEN btrim(p_reason) ELSE rejection_reason END,payment_reference=COALESCE(NULLIF(btrim(COALESCE(p_payment_reference,'')),''),payment_reference),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,CONCAT('tax_filing_',p_status),'tax_filing',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('filing',to_jsonb(r),'reason',p_reason,'payment_reference',p_payment_reference));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_tax_filing_status(UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_tax_code_board WITH (security_invoker=true) AS SELECT t.*,e.code AS entity_code,e.name_ar AS entity_name FROM public.tax_codes t JOIN public.legal_entities e ON e.id=t.legal_entity_id WHERE t.tenant_id=public.current_user_tenant_id() ORDER BY e.code,t.code;
GRANT SELECT ON public.finance_tax_code_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_tax_filing_board WITH (security_invoker=true) AS SELECT f.*,e.code AS entity_code,e.name_ar AS entity_name,COUNT(l.id)::BIGINT AS line_count FROM public.tax_filing_status f JOIN public.legal_entities e ON e.id=f.legal_entity_id LEFT JOIN public.finance_tax_filing_lines l ON l.tax_filing_id=f.id WHERE f.tenant_id=public.current_user_tenant_id() GROUP BY f.id,e.code,e.name_ar ORDER BY f.period_start DESC,f.created_at DESC;
GRANT SELECT ON public.finance_tax_filing_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_tax_filing_line_board WITH (security_invoker=true) AS SELECT l.*,f.tax_period,f.filing_type,e.code AS entity_code FROM public.finance_tax_filing_lines l JOIN public.tax_filing_status f ON f.id=l.tax_filing_id JOIN public.legal_entities e ON e.id=l.legal_entity_id WHERE l.tenant_id=public.current_user_tenant_id() ORDER BY l.created_at DESC;
GRANT SELECT ON public.finance_tax_filing_line_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_tax_dashboard WITH (security_invoker=true) AS SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,COUNT(t.id) FILTER(WHERE t.is_active)::BIGINT AS active_tax_codes,COUNT(f.id) FILTER(WHERE f.status='draft')::BIGINT AS draft_filings,COUNT(f.id) FILTER(WHERE f.status='submitted')::BIGINT AS submitted_filings,COUNT(f.id) FILTER(WHERE f.status='approved')::BIGINT AS approved_filings,COALESCE(SUM(f.net_tax_due) FILTER(WHERE f.status IN ('draft','submitted','approved')),0)::NUMERIC AS open_net_tax_due FROM public.legal_entities e LEFT JOIN public.tax_codes t ON t.legal_entity_id=e.id LEFT JOIN public.tax_filing_status f ON f.legal_entity_id=e.id WHERE e.tenant_id=public.current_user_tenant_id() GROUP BY e.tenant_id,e.id,e.code,e.name_ar ORDER BY e.code;
GRANT SELECT ON public.finance_tax_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_tax_filing_lines') IS NULL OR to_regclass('public.finance_tax_code_board') IS NULL OR to_regprocedure('public.upsert_finance_tax_code(uuid,text,text,numeric,text,date,date,boolean)') IS NULL OR to_regprocedure('public.generate_tax_filing_draft(uuid,text,date,date)') IS NULL OR to_regprocedure('public.update_tax_filing_status(uuid,text,text,text)') IS NULL THEN RAISE EXCEPTION '0247 failed: Finance tax objects missing'; END IF;
 RAISE NOTICE '✅ 0247: Finance tax management and filing applied';
END $$;
