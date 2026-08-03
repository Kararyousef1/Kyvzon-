-- ============================================================================
-- 0245 — Finance Unit 05: Accounts Receivable & Collections
-- docs/finance/05-accounts-receivable-collections.md
-- ============================================================================

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS due_date DATE;
UPDATE public.accounts_receivable SET total_amount=COALESCE(total_amount,amount,0) WHERE total_amount IS NULL;
ALTER TABLE public.accounts_receivable ALTER COLUMN total_amount SET DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ar_customer_invoice ON public.accounts_receivable(legal_entity_id, customer_id, invoice_number) WHERE customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ar_invoice_lines(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ar_invoice_id UUID NOT NULL REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  description TEXT,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK(quantity>0),
  unit_price NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(unit_price>=0),
  line_amount NUMERIC(18,4) NOT NULL CHECK(line_amount>=0),
  tax_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
  total_amount NUMERIC(18,4) NOT NULL CHECK(total_amount>=0),
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.finance_projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ar_invoice_id,line_number)
);
CREATE INDEX IF NOT EXISTS idx_ar_invoice_lines_invoice ON public.ar_invoice_lines(ar_invoice_id);
ALTER TABLE public.ar_invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_ar_invoice_lines_access ON public.ar_invoice_lines;
CREATE POLICY finance_ar_invoice_lines_access ON public.ar_invoice_lines FOR ALL TO authenticated
  USING(public.current_user_can_access_legal_entity(legal_entity_id))
  WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE TABLE IF NOT EXISTS public.customer_receipts(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(15,2) NOT NULL CHECK(amount>0),
  currency_code CHAR(3) NOT NULL REFERENCES public.currencies(code),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','voided')),
  created_by UUID REFERENCES public.profiles(id),
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES public.profiles(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id),
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(legal_entity_id,receipt_number)
);
CREATE TABLE IF NOT EXISTS public.customer_receipt_allocations(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES public.customer_receipts(id) ON DELETE CASCADE,
  ar_invoice_id UUID NOT NULL REFERENCES public.accounts_receivable(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(15,2) NOT NULL CHECK(allocated_amount>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(receipt_id,ar_invoice_id)
);
ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_receipt_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_customer_receipts_access ON public.customer_receipts;
DROP POLICY IF EXISTS finance_customer_receipt_allocations_access ON public.customer_receipt_allocations;
CREATE POLICY finance_customer_receipts_access ON public.customer_receipts FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_customer_receipt_allocations_access ON public.customer_receipt_allocations FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_customer(p_legal_entity_id UUID,p_customer_code TEXT,p_name_ar TEXT,p_name_en TEXT DEFAULT NULL,p_tax_number TEXT DEFAULT NULL,p_email TEXT DEFAULT NULL,p_phone TEXT DEFAULT NULL,p_payment_terms_days INTEGER DEFAULT 30,p_currency_code CHAR(3) DEFAULT 'IQD')
RETURNS public.customers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; r public.customers%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_customer_code),'')='' OR COALESCE(btrim(p_name_ar),'')='' THEN RAISE EXCEPTION 'CUSTOMER_CODE_AND_NAME_REQUIRED'; END IF;
 INSERT INTO public.customers(tenant_id,legal_entity_id,customer_code,name_ar,name_en,tax_number,email,phone,payment_terms_days,currency_code,is_active)
 VALUES(e.tenant_id,p_legal_entity_id,upper(btrim(p_customer_code)),btrim(p_name_ar),NULLIF(btrim(COALESCE(p_name_en,'')),''),NULLIF(btrim(COALESCE(p_tax_number,'')),''),NULLIF(btrim(COALESCE(p_email,'')),''),NULLIF(btrim(COALESCE(p_phone,'')),''),COALESCE(p_payment_terms_days,30),p_currency_code,true)
 ON CONFLICT(legal_entity_id,customer_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,tax_number=EXCLUDED.tax_number,email=EXCLUDED.email,phone=EXCLUDED.phone,payment_terms_days=EXCLUDED.payment_terms_days,currency_code=EXCLUDED.currency_code,is_active=true,updated_at=NOW()
 RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(r.tenant_id,r.legal_entity_id,'customer_upserted','customer',r.id,auth.uid(),to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_customer(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,CHAR(3)) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_customer_status(p_customer_id UUID,p_is_active BOOLEAN,p_reason TEXT)
RETURNS public.customers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.customers%ROWTYPE; r public.customers%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'CUSTOMER_STATUS_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.customers WHERE id=p_customer_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 UPDATE public.customers SET is_active=COALESCE(p_is_active,false),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(old.tenant_id,old.legal_entity_id,'customer_status_changed','customer',old.id,auth.uid(),to_jsonb(old),jsonb_build_object('customer',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_finance_customer_status(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_ar_invoice_with_lines(p_legal_entity_id UUID,p_customer_id UUID,p_invoice_number TEXT,p_invoice_date DATE,p_due_date DATE,p_currency_code CHAR(3),p_exchange_rate NUMERIC,p_notes TEXT,p_lines JSONB)
RETURNS public.accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.customers%ROWTYPE; inv public.accounts_receivable%ROWTYPE; cnt INT; total NUMERIC(18,4);
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO c FROM public.customers WHERE id=p_customer_id AND legal_entity_id=p_legal_entity_id AND is_active; IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_INVALID_OR_INACTIVE'; END IF;
 IF COALESCE(btrim(p_invoice_number),'')='' OR p_invoice_date IS NULL OR COALESCE(p_exchange_rate,0)<=0 THEN RAISE EXCEPTION 'AR_INVOICE_HEADER_INVALID'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'AR_INVOICE_LINES_REQUIRED'; END IF;
 SELECT COUNT(*),COALESCE(SUM(COALESCE((line->>'total_amount')::NUMERIC,COALESCE((line->>'line_amount')::NUMERIC,COALESCE((line->>'quantity')::NUMERIC,1)*COALESCE((line->>'unit_price')::NUMERIC,0))+COALESCE((line->>'tax_amount')::NUMERIC,0))),0) INTO cnt,total FROM jsonb_array_elements(p_lines) line;
 IF cnt<1 OR total<=0 THEN RAISE EXCEPTION 'AR_INVOICE_LINES_TOTAL_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) line LEFT JOIN public.chart_of_accounts a ON a.id=(line->>'account_id')::UUID LEFT JOIN public.finance_account_dimension_policies p ON p.account_id=a.id WHERE a.id IS NULL OR a.legal_entity_id<>p_legal_entity_id OR NOT a.is_active OR NOT COALESCE(a.allow_posting,false) OR COALESCE(a.is_control_account,false) OR (COALESCE(p.require_cost_center,false) AND NULLIF(line->>'cost_center_id','') IS NULL) OR (COALESCE(p.require_project,false) AND NULLIF(line->>'project_id','') IS NULL)) THEN RAISE EXCEPTION 'AR_INVOICE_HAS_INVALID_LINES_OR_DIMENSIONS'; END IF;
 INSERT INTO public.accounts_receivable(tenant_id,legal_entity_id,customer_id,invoice_number,invoice_date,due_date,amount,total_amount,amount_received,currency_code,exchange_rate,status,notes)
 VALUES(c.tenant_id,p_legal_entity_id,p_customer_id,btrim(p_invoice_number),p_invoice_date,COALESCE(p_due_date,p_invoice_date+c.payment_terms_days),ROUND(total::NUMERIC,2),ROUND(total::NUMERIC,2),0,p_currency_code,p_exchange_rate,'draft',NULLIF(btrim(COALESCE(p_notes,'')),'')) RETURNING * INTO inv;
 INSERT INTO public.ar_invoice_lines(tenant_id,legal_entity_id,ar_invoice_id,line_number,account_id,description,quantity,unit_price,line_amount,tax_amount,total_amount,cost_center_id,project_id)
 SELECT c.tenant_id,p_legal_entity_id,inv.id,ordinal,(line->>'account_id')::UUID,NULLIF(btrim(COALESCE(line->>'description','')),''),COALESCE((line->>'quantity')::NUMERIC,1),COALESCE((line->>'unit_price')::NUMERIC,0),COALESCE((line->>'line_amount')::NUMERIC,COALESCE((line->>'quantity')::NUMERIC,1)*COALESCE((line->>'unit_price')::NUMERIC,0)),COALESCE((line->>'tax_amount')::NUMERIC,0),COALESCE((line->>'total_amount')::NUMERIC,COALESCE((line->>'line_amount')::NUMERIC,COALESCE((line->>'quantity')::NUMERIC,1)*COALESCE((line->>'unit_price')::NUMERIC,0))+COALESCE((line->>'tax_amount')::NUMERIC,0)),NULLIF(line->>'cost_center_id','')::UUID,NULLIF(line->>'project_id','')::UUID FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS rows(line,ordinal);
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(inv.tenant_id,inv.legal_entity_id,'ar_invoice_created_with_lines','accounts_receivable',inv.id,auth.uid(),jsonb_build_object('invoice',to_jsonb(inv),'line_count',cnt));
 RETURN inv;
END $$;
GRANT EXECUTE ON FUNCTION public.create_ar_invoice_with_lines(UUID,UUID,TEXT,DATE,DATE,CHAR(3),NUMERIC,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ar_invoice_lifecycle_status(p_invoice_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.accounts_receivable%ROWTYPE; r public.accounts_receivable%ROWTYPE; total NUMERIC;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'AR_STATUS_REASON_REQUIRED'; END IF;
 SELECT * INTO old FROM public.accounts_receivable WHERE id=p_invoice_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'AR_INVOICE_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF p_status NOT IN ('submitted','approved','voided') THEN RAISE EXCEPTION 'INVALID_AR_STATUS'; END IF;
 IF p_status='submitted' AND old.status<>'draft' THEN RAISE EXCEPTION 'ONLY_DRAFT_AR_CAN_BE_SUBMITTED'; END IF;
 IF p_status='approved' AND old.status<>'submitted' THEN RAISE EXCEPTION 'ONLY_SUBMITTED_AR_CAN_BE_APPROVED'; END IF;
 IF p_status='voided' AND old.status IN ('paid','partially_received','voided') THEN RAISE EXCEPTION 'AR_INVOICE_CANNOT_BE_VOIDED'; END IF;
 IF p_status IN ('submitted','approved') THEN SELECT COALESCE(SUM(total_amount),0) INTO total FROM public.ar_invoice_lines WHERE ar_invoice_id=old.id; IF total<=0 OR ROUND(total::NUMERIC,2)<>ROUND(old.total_amount::NUMERIC,2) THEN RAISE EXCEPTION 'AR_INVOICE_LINES_MUST_MATCH_AMOUNT'; END IF; END IF;
 UPDATE public.accounts_receivable SET status=p_status,approved_at=CASE WHEN p_status='approved' THEN NOW() ELSE approved_at END,approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,CONCAT('ar_invoice_',p_status),'accounts_receivable',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('invoice',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.set_ar_invoice_lifecycle_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_receipt_draft(p_legal_entity_id UUID,p_customer_id UUID,p_receipt_number TEXT,p_receipt_date DATE,p_amount NUMERIC,p_currency_code CHAR(3),p_reference TEXT,p_allocations JSONB)
RETURNS public.customer_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.customers%ROWTYPE; r public.customer_receipts%ROWTYPE; allocated NUMERIC;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF; SELECT * INTO c FROM public.customers WHERE id=p_customer_id AND legal_entity_id=p_legal_entity_id AND is_active; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CUSTOMER'; END IF;
 SELECT COALESCE(SUM((x->>'allocated_amount')::NUMERIC),0) INTO allocated FROM jsonb_array_elements(p_allocations) x; IF p_amount<=0 OR allocated<>p_amount THEN RAISE EXCEPTION 'RECEIPT_AMOUNT_MUST_EQUAL_ALLOCATIONS'; END IF;
 INSERT INTO public.customer_receipts(tenant_id,legal_entity_id,customer_id,receipt_number,receipt_date,amount,currency_code,reference,status,created_by) VALUES(c.tenant_id,p_legal_entity_id,p_customer_id,btrim(p_receipt_number),p_receipt_date,p_amount,p_currency_code,NULLIF(btrim(COALESCE(p_reference,'')),''),'draft',auth.uid()) RETURNING * INTO r;
 INSERT INTO public.customer_receipt_allocations(tenant_id,legal_entity_id,receipt_id,ar_invoice_id,allocated_amount) SELECT c.tenant_id,p_legal_entity_id,r.id,(x->>'ar_invoice_id')::UUID,(x->>'allocated_amount')::NUMERIC FROM jsonb_array_elements(p_allocations) x;
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.create_customer_receipt_draft(UUID,UUID,TEXT,DATE,NUMERIC,CHAR(3),TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_customer_receipt_with_reason(p_receipt_id UUID,p_reason TEXT)
RETURNS public.customer_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.customer_receipts%ROWTYPE; old public.customer_receipts%ROWTYPE; total NUMERIC;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'RECEIPT_POST_REASON_REQUIRED'; END IF; SELECT * INTO r FROM public.customer_receipts WHERE id=p_receipt_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_NOT_FOUND'; END IF; old:=r;
 IF NOT public.current_user_can_manage_legal_entity(r.legal_entity_id) OR r.status<>'draft' THEN RAISE EXCEPTION 'RECEIPT_CANNOT_BE_POSTED'; END IF; SELECT COALESCE(SUM(allocated_amount),0) INTO total FROM public.customer_receipt_allocations WHERE receipt_id=r.id; IF total<>r.amount THEN RAISE EXCEPTION 'RECEIPT_ALLOCATIONS_MUST_EQUAL_AMOUNT'; END IF;
 IF EXISTS(SELECT 1 FROM public.customer_receipt_allocations a JOIN public.accounts_receivable i ON i.id=a.ar_invoice_id WHERE a.receipt_id=r.id AND (i.legal_entity_id<>r.legal_entity_id OR i.customer_id<>r.customer_id OR i.status NOT IN ('approved','partially_received') OR i.amount_received+a.allocated_amount>i.total_amount)) THEN RAISE EXCEPTION 'INVALID_RECEIPT_ALLOCATION'; END IF;
 UPDATE public.accounts_receivable i SET amount_received=i.amount_received+a.allocated_amount,status=CASE WHEN i.amount_received+a.allocated_amount=i.total_amount THEN 'paid' ELSE 'partially_received' END FROM public.customer_receipt_allocations a WHERE a.receipt_id=r.id AND a.ar_invoice_id=i.id;
 UPDATE public.customer_receipts SET status='posted',posted_at=NOW(),posted_by=auth.uid() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'customer_receipt_posted','customer_receipt',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('receipt',to_jsonb(r),'reason',p_reason)); RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.post_customer_receipt_with_reason(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_customer_receipt(p_receipt_id UUID,p_reason TEXT)
RETURNS public.customer_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.customer_receipts%ROWTYPE; r public.customer_receipts%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'RECEIPT_VOID_REASON_REQUIRED'; END IF; SELECT * INTO old FROM public.customer_receipts WHERE id=p_receipt_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF; IF old.status<>'draft' THEN RAISE EXCEPTION 'ONLY_DRAFT_RECEIPT_CAN_BE_VOIDED'; END IF;
 UPDATE public.customer_receipts SET status='voided',voided_at=NOW(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'customer_receipt_voided','customer_receipt',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('receipt',to_jsonb(r),'reason',p_reason)); RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.void_customer_receipt(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ar_aging(p_legal_entity_id UUID,p_as_of_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(customer_id UUID,customer_name TEXT,current_amount NUMERIC,days_1_30 NUMERIC,days_31_60 NUMERIC,days_61_90 NUMERIC,days_over_90 NUMERIC,total_outstanding NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.current_user_can_access_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 RETURN QUERY SELECT i.customer_id,COALESCE(c.name_ar,'Unknown'),COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date)<=0 THEN i.total_amount-i.amount_received ELSE 0 END),0),COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date) BETWEEN 1 AND 30 THEN i.total_amount-i.amount_received ELSE 0 END),0),COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date) BETWEEN 31 AND 60 THEN i.total_amount-i.amount_received ELSE 0 END),0),COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date) BETWEEN 61 AND 90 THEN i.total_amount-i.amount_received ELSE 0 END),0),COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date)>90 THEN i.total_amount-i.amount_received ELSE 0 END),0),COALESCE(SUM(i.total_amount-i.amount_received),0) FROM public.accounts_receivable i LEFT JOIN public.customers c ON c.id=i.customer_id WHERE i.legal_entity_id=p_legal_entity_id AND i.status IN ('approved','partially_received','overdue') GROUP BY i.customer_id,c.name_ar ORDER BY 8 DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.get_ar_aging(UUID,DATE) TO authenticated;

CREATE OR REPLACE VIEW public.finance_customer_lookup WITH (security_invoker=true) AS SELECT c.*,e.code AS entity_code,e.name_ar AS entity_name FROM public.customers c JOIN public.legal_entities e ON e.id=c.legal_entity_id WHERE c.tenant_id=public.current_user_tenant_id() ORDER BY e.code,c.name_ar;
GRANT SELECT ON public.finance_customer_lookup TO authenticated;
CREATE OR REPLACE VIEW public.finance_ar_invoice_line_board WITH (security_invoker=true) AS SELECT l.*,a.code AS account_code,COALESCE(a.name_ar,a.name) AS account_name,cc.code AS cost_center_code,cc.name_ar AS cost_center_name,fp.code AS project_code,fp.name_ar AS project_name FROM public.ar_invoice_lines l JOIN public.chart_of_accounts a ON a.id=l.account_id LEFT JOIN public.cost_centers cc ON cc.id=l.cost_center_id LEFT JOIN public.finance_projects fp ON fp.id=l.project_id WHERE l.tenant_id=public.current_user_tenant_id() ORDER BY l.ar_invoice_id,l.line_number;
GRANT SELECT ON public.finance_ar_invoice_line_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_ar_invoice_board WITH (security_invoker=true) AS SELECT i.*,e.code AS entity_code,e.name_ar AS entity_name,c.customer_code,COALESCE(c.name_ar,'Unknown') AS customer_display_name,COUNT(l.id)::BIGINT AS line_count,COALESCE(SUM(l.total_amount),0)::NUMERIC AS lines_total,(i.total_amount-i.amount_received)::NUMERIC AS outstanding_amount,CASE WHEN i.status IN ('approved','partially_received','overdue') AND COALESCE(i.due_date,i.invoice_date)<CURRENT_DATE THEN CURRENT_DATE-COALESCE(i.due_date,i.invoice_date) ELSE 0 END AS days_past_due FROM public.accounts_receivable i JOIN public.legal_entities e ON e.id=i.legal_entity_id LEFT JOIN public.customers c ON c.id=i.customer_id LEFT JOIN public.ar_invoice_lines l ON l.ar_invoice_id=i.id WHERE i.tenant_id=public.current_user_tenant_id() GROUP BY i.id,e.code,e.name_ar,c.customer_code,c.name_ar ORDER BY i.invoice_date DESC,i.created_at DESC;
GRANT SELECT ON public.finance_ar_invoice_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_ar_dashboard WITH (security_invoker=true) AS SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,COUNT(i.id) FILTER(WHERE i.status='draft')::BIGINT AS draft_invoices,COUNT(i.id) FILTER(WHERE i.status='submitted')::BIGINT AS submitted_invoices,COUNT(i.id) FILTER(WHERE i.status='approved')::BIGINT AS approved_invoices,COUNT(i.id) FILTER(WHERE i.status IN ('partially_received','paid'))::BIGINT AS collection_progress_invoices,COUNT(i.id) FILTER(WHERE i.status='voided')::BIGINT AS voided_invoices,COALESCE(SUM(i.total_amount-i.amount_received) FILTER(WHERE i.status IN ('approved','partially_received','overdue')),0)::NUMERIC AS total_outstanding,COALESCE(SUM(i.total_amount-i.amount_received) FILTER(WHERE i.status IN ('approved','partially_received','overdue') AND COALESCE(i.due_date,i.invoice_date)<CURRENT_DATE),0)::NUMERIC AS overdue_outstanding,COUNT(c.id) FILTER(WHERE c.is_active)::BIGINT AS active_customers FROM public.legal_entities e LEFT JOIN public.accounts_receivable i ON i.legal_entity_id=e.id LEFT JOIN public.customers c ON c.legal_entity_id=e.id WHERE e.tenant_id=public.current_user_tenant_id() GROUP BY e.tenant_id,e.id,e.code,e.name_ar ORDER BY e.code;
GRANT SELECT ON public.finance_ar_dashboard TO authenticated;
CREATE OR REPLACE VIEW public.finance_customer_receipt_board WITH (security_invoker=true) AS SELECT r.*,e.code AS entity_code,e.name_ar AS entity_name,c.customer_code,c.name_ar AS customer_name,COUNT(a.id)::BIGINT AS allocation_count,COALESCE(SUM(a.allocated_amount),0)::NUMERIC AS allocated_total FROM public.customer_receipts r JOIN public.legal_entities e ON e.id=r.legal_entity_id JOIN public.customers c ON c.id=r.customer_id LEFT JOIN public.customer_receipt_allocations a ON a.receipt_id=r.id WHERE r.tenant_id=public.current_user_tenant_id() GROUP BY r.id,e.code,e.name_ar,c.customer_code,c.name_ar ORDER BY r.receipt_date DESC,r.created_at DESC;
GRANT SELECT ON public.finance_customer_receipt_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_customer_receipt_allocation_board WITH (security_invoker=true) AS SELECT a.*,r.receipt_number,i.invoice_number,c.name_ar AS customer_name,i.total_amount AS invoice_amount,i.amount_received AS invoice_received FROM public.customer_receipt_allocations a JOIN public.customer_receipts r ON r.id=a.receipt_id JOIN public.accounts_receivable i ON i.id=a.ar_invoice_id LEFT JOIN public.customers c ON c.id=i.customer_id WHERE a.tenant_id=public.current_user_tenant_id() ORDER BY r.receipt_date DESC,r.receipt_number,i.invoice_number;
GRANT SELECT ON public.finance_customer_receipt_allocation_board TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.ar_invoice_lines') IS NULL OR to_regclass('public.customer_receipts') IS NULL OR to_regclass('public.finance_ar_invoice_board') IS NULL OR to_regprocedure('public.upsert_finance_customer(uuid,text,text,text,text,text,text,integer,character)') IS NULL OR to_regprocedure('public.create_ar_invoice_with_lines(uuid,uuid,text,date,date,character,numeric,text,jsonb)') IS NULL OR to_regprocedure('public.post_customer_receipt_with_reason(uuid,text)') IS NULL THEN RAISE EXCEPTION '0245 failed: Finance AR unit objects missing'; END IF;
 RAISE NOTICE '✅ 0245: Finance accounts receivable and collections applied';
END $$;
