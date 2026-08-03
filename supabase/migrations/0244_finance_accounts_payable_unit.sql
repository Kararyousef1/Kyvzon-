-- ============================================================================
-- 0244 — Finance Unit 04: Accounts Payable
-- docs/finance/04-accounts-payable.md
-- ============================================================================

ALTER TABLE public.vendor_payments
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE TABLE IF NOT EXISTS public.ap_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ap_invoice_id UUID NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  description TEXT,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK(quantity > 0),
  unit_price NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
  line_amount NUMERIC(18,4) NOT NULL CHECK(line_amount >= 0),
  tax_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(tax_amount >= 0),
  total_amount NUMERIC(18,4) NOT NULL CHECK(total_amount >= 0),
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.finance_projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ap_invoice_id,line_number)
);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_lines_invoice ON public.ap_invoice_lines(ap_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_lines_entity_account ON public.ap_invoice_lines(legal_entity_id,account_id);
ALTER TABLE public.ap_invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_ap_invoice_lines_access ON public.ap_invoice_lines;
CREATE POLICY finance_ap_invoice_lines_access ON public.ap_invoice_lines FOR ALL TO authenticated
  USING(public.current_user_can_access_legal_entity(legal_entity_id))
  WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_vendor(
  p_legal_entity_id UUID,
  p_vendor_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT DEFAULT NULL,
  p_tax_number TEXT DEFAULT NULL,
  p_registration_number TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_payment_terms_days INTEGER DEFAULT 30,
  p_currency_code CHAR(3) DEFAULT 'IQD'
)
RETURNS public.vendors
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entity public.legal_entities%ROWTYPE; v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  SELECT * INTO v_entity FROM public.legal_entities WHERE id=p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
  IF COALESCE(btrim(p_vendor_code),'')='' OR COALESCE(btrim(p_name_ar),'')='' THEN RAISE EXCEPTION 'VENDOR_CODE_AND_NAME_REQUIRED'; END IF;
  IF COALESCE(p_payment_terms_days,0)<0 THEN RAISE EXCEPTION 'INVALID_PAYMENT_TERMS'; END IF;
  INSERT INTO public.vendors(tenant_id,legal_entity_id,vendor_code,name_ar,name_en,tax_number,registration_number,email,phone,payment_terms_days,currency_code,is_active)
  VALUES(v_entity.tenant_id,p_legal_entity_id,upper(btrim(p_vendor_code)),btrim(p_name_ar),NULLIF(btrim(COALESCE(p_name_en,'')),''),NULLIF(btrim(COALESCE(p_tax_number,'')),''),NULLIF(btrim(COALESCE(p_registration_number,'')),''),NULLIF(btrim(COALESCE(p_email,'')),''),NULLIF(btrim(COALESCE(p_phone,'')),''),COALESCE(p_payment_terms_days,30),p_currency_code,true)
  ON CONFLICT(legal_entity_id,vendor_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,tax_number=EXCLUDED.tax_number,registration_number=EXCLUDED.registration_number,email=EXCLUDED.email,phone=EXCLUDED.phone,payment_terms_days=EXCLUDED.payment_terms_days,currency_code=EXCLUDED.currency_code,is_active=true,updated_at=NOW()
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(v_entity.tenant_id,p_legal_entity_id,'vendor_upserted','vendor',v_row.id,auth.uid(),to_jsonb(v_row));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.upsert_finance_vendor(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,CHAR(3)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_finance_vendor(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,CHAR(3)) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_vendor_status(p_vendor_id UUID,p_is_active BOOLEAN,p_reason TEXT)
RETURNS public.vendors
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.vendors%ROWTYPE; v_new public.vendors%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'VENDOR_STATUS_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.vendors WHERE id=p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDOR_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  UPDATE public.vendors SET is_active=COALESCE(p_is_active,false), updated_at=NOW() WHERE id=p_vendor_id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'vendor_status_changed','vendor',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('vendor',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.update_finance_vendor_status(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_finance_vendor_status(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_ap_invoice_with_lines(
  p_legal_entity_id UUID,
  p_vendor_id UUID,
  p_invoice_number TEXT,
  p_invoice_date DATE,
  p_due_date DATE,
  p_currency_code CHAR(3),
  p_exchange_rate NUMERIC,
  p_notes TEXT,
  p_lines JSONB
)
RETURNS public.accounts_payable
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_invoice public.accounts_payable%ROWTYPE;
  v_line_count INTEGER;
  v_total NUMERIC(18,4);
BEGIN
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  SELECT * INTO v_vendor FROM public.vendors WHERE id=p_vendor_id AND legal_entity_id=p_legal_entity_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDOR_INVALID_OR_INACTIVE'; END IF;
  IF COALESCE(btrim(p_invoice_number),'')='' OR p_invoice_date IS NULL OR COALESCE(p_exchange_rate,0)<=0 THEN RAISE EXCEPTION 'AP_INVOICE_HEADER_INVALID'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'AP_INVOICE_LINES_REQUIRED'; END IF;
  SELECT COUNT(*), COALESCE(SUM(COALESCE((line->>'total_amount')::NUMERIC, COALESCE((line->>'line_amount')::NUMERIC, COALESCE((line->>'quantity')::NUMERIC,1)*COALESCE((line->>'unit_price')::NUMERIC,0)) + COALESCE((line->>'tax_amount')::NUMERIC,0))),0)
  INTO v_line_count, v_total
  FROM jsonb_array_elements(p_lines) line;
  IF v_line_count < 1 OR v_total <= 0 THEN RAISE EXCEPTION 'AP_INVOICE_LINES_TOTAL_INVALID'; END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_lines) line
    LEFT JOIN public.chart_of_accounts account ON account.id=(line->>'account_id')::UUID
    LEFT JOIN public.finance_account_dimension_policies policy ON policy.account_id=account.id
    WHERE account.id IS NULL OR account.legal_entity_id<>p_legal_entity_id OR NOT account.is_active OR NOT COALESCE(account.allow_posting,false) OR COALESCE(account.is_control_account,false)
      OR (COALESCE(policy.require_cost_center,false) AND NULLIF(line->>'cost_center_id','') IS NULL)
      OR (COALESCE(policy.require_project,false) AND NULLIF(line->>'project_id','') IS NULL)
      OR (NULLIF(line->>'cost_center_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centers cc WHERE cc.id=(line->>'cost_center_id')::UUID AND cc.legal_entity_id=p_legal_entity_id AND cc.is_active))
      OR (NULLIF(line->>'project_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_projects fp WHERE fp.id=(line->>'project_id')::UUID AND fp.legal_entity_id=p_legal_entity_id AND fp.status='active'))
  ) THEN RAISE EXCEPTION 'AP_INVOICE_HAS_INVALID_LINES_OR_DIMENSIONS'; END IF;

  INSERT INTO public.accounts_payable(tenant_id,legal_entity_id,vendor_id,invoice_number,vendor_name,invoice_date,due_date,amount,currency_code,exchange_rate,status,notes)
  VALUES(v_vendor.tenant_id,p_legal_entity_id,p_vendor_id,btrim(p_invoice_number),v_vendor.name_ar,p_invoice_date,COALESCE(p_due_date,p_invoice_date+v_vendor.payment_terms_days),ROUND(v_total::NUMERIC,2),p_currency_code,p_exchange_rate,'draft',NULLIF(btrim(COALESCE(p_notes,'')),''))
  RETURNING * INTO v_invoice;

  INSERT INTO public.ap_invoice_lines(tenant_id,legal_entity_id,ap_invoice_id,line_number,account_id,description,quantity,unit_price,line_amount,tax_amount,total_amount,cost_center_id,project_id)
  SELECT v_vendor.tenant_id,p_legal_entity_id,v_invoice.id,ordinal,(line->>'account_id')::UUID,NULLIF(btrim(COALESCE(line->>'description','')),''),
    COALESCE((line->>'quantity')::NUMERIC,1),COALESCE((line->>'unit_price')::NUMERIC,0),
    COALESCE((line->>'line_amount')::NUMERIC,COALESCE((line->>'quantity')::NUMERIC,1)*COALESCE((line->>'unit_price')::NUMERIC,0)),
    COALESCE((line->>'tax_amount')::NUMERIC,0),
    COALESCE((line->>'total_amount')::NUMERIC,COALESCE((line->>'line_amount')::NUMERIC,COALESCE((line->>'quantity')::NUMERIC,1)*COALESCE((line->>'unit_price')::NUMERIC,0))+COALESCE((line->>'tax_amount')::NUMERIC,0)),
    NULLIF(line->>'cost_center_id','')::UUID,NULLIF(line->>'project_id','')::UUID
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS rows(line,ordinal);

  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(v_invoice.tenant_id,v_invoice.legal_entity_id,'ap_invoice_created_with_lines','accounts_payable',v_invoice.id,auth.uid(),jsonb_build_object('invoice',to_jsonb(v_invoice),'line_count',v_line_count));
  RETURN v_invoice;
END $$;
REVOKE ALL ON FUNCTION public.create_ap_invoice_with_lines(UUID,UUID,TEXT,DATE,DATE,CHAR(3),NUMERIC,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ap_invoice_with_lines(UUID,UUID,TEXT,DATE,DATE,CHAR(3),NUMERIC,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ap_invoice_lifecycle_status(p_invoice_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.accounts_payable
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.accounts_payable%ROWTYPE; v_new public.accounts_payable%ROWTYPE; v_line_total NUMERIC;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'AP_STATUS_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.accounts_payable WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AP_INVOICE_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF p_status NOT IN ('submitted','approved','voided') THEN RAISE EXCEPTION 'INVALID_AP_STATUS'; END IF;
  IF p_status='submitted' AND v_old.status<>'draft' THEN RAISE EXCEPTION 'ONLY_DRAFT_AP_CAN_BE_SUBMITTED'; END IF;
  IF p_status='approved' AND v_old.status<>'submitted' THEN RAISE EXCEPTION 'ONLY_SUBMITTED_AP_CAN_BE_APPROVED'; END IF;
  IF p_status='voided' AND v_old.status IN ('paid','partially_paid','voided') THEN RAISE EXCEPTION 'AP_INVOICE_CANNOT_BE_VOIDED'; END IF;
  IF p_status IN ('submitted','approved') THEN
    SELECT COALESCE(SUM(total_amount),0) INTO v_line_total FROM public.ap_invoice_lines WHERE ap_invoice_id=v_old.id;
    IF v_line_total <= 0 OR ROUND(v_line_total::NUMERIC,2) <> ROUND(v_old.amount::NUMERIC,2) THEN RAISE EXCEPTION 'AP_INVOICE_LINES_MUST_MATCH_AMOUNT'; END IF;
  END IF;
  UPDATE public.accounts_payable SET status=p_status, approved_at=CASE WHEN p_status='approved' THEN NOW() ELSE approved_at END, approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_new.tenant_id,v_new.legal_entity_id,CONCAT('ap_invoice_',p_status),'accounts_payable',v_new.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('invoice',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.set_ap_invoice_lifecycle_status(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_ap_invoice_lifecycle_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_vendor_payment_with_reason(p_payment_id UUID,p_reason TEXT)
RETURNS public.vendor_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.vendor_payments%ROWTYPE; old public.vendor_payments%ROWTYPE; total NUMERIC;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'PAYMENT_POST_REASON_REQUIRED'; END IF;
  SELECT * INTO p FROM public.vendor_payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  old:=p;
  IF NOT public.current_user_can_manage_legal_entity(p.legal_entity_id) OR p.status<>'draft' THEN RAISE EXCEPTION 'PAYMENT_CANNOT_BE_POSTED'; END IF;
  SELECT COALESCE(SUM(allocated_amount),0) INTO total FROM public.vendor_payment_allocations WHERE payment_id=p.id;
  IF total<>p.amount THEN RAISE EXCEPTION 'PAYMENT_ALLOCATIONS_MUST_EQUAL_AMOUNT'; END IF;
  IF EXISTS(SELECT 1 FROM public.vendor_payment_allocations a JOIN public.accounts_payable i ON i.id=a.ap_invoice_id WHERE a.payment_id=p.id AND (i.legal_entity_id<>p.legal_entity_id OR i.vendor_id<>p.vendor_id OR i.status NOT IN ('approved','partially_paid') OR i.amount_paid+a.allocated_amount>i.amount)) THEN RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATION'; END IF;
  UPDATE public.accounts_payable i SET amount_paid=i.amount_paid+a.allocated_amount,status=CASE WHEN i.amount_paid+a.allocated_amount=i.amount THEN 'paid' ELSE 'partially_paid' END FROM public.vendor_payment_allocations a WHERE a.payment_id=p.id AND a.ap_invoice_id=i.id;
  UPDATE public.vendor_payments SET status='posted',posted_at=NOW(),posted_by=auth.uid() WHERE id=p.id RETURNING * INTO p;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(p.tenant_id,p.legal_entity_id,'vendor_payment_posted','vendor_payment',p.id,auth.uid(),to_jsonb(old),jsonb_build_object('payment',to_jsonb(p),'reason',p_reason));
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.post_vendor_payment_with_reason(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_vendor_payment_with_reason(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_vendor_payment(p_payment_id UUID,p_reason TEXT)
RETURNS public.vendor_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.vendor_payments%ROWTYPE; p public.vendor_payments%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'PAYMENT_VOID_REASON_REQUIRED'; END IF;
  SELECT * INTO old FROM public.vendor_payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF old.status<>'draft' THEN RAISE EXCEPTION 'ONLY_DRAFT_PAYMENT_CAN_BE_VOIDED'; END IF;
  UPDATE public.vendor_payments SET status='voided',voided_at=NOW(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=old.id RETURNING * INTO p;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(p.tenant_id,p.legal_entity_id,'vendor_payment_voided','vendor_payment',p.id,auth.uid(),to_jsonb(old),jsonb_build_object('payment',to_jsonb(p),'reason',p_reason));
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.void_vendor_payment(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_vendor_payment(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_vendor_lookup WITH (security_invoker=true) AS
SELECT v.*, e.code AS entity_code, e.name_ar AS entity_name
FROM public.vendors v JOIN public.legal_entities e ON e.id=v.legal_entity_id
WHERE v.tenant_id=public.current_user_tenant_id()
ORDER BY e.code, v.name_ar;
GRANT SELECT ON public.finance_vendor_lookup TO authenticated;

CREATE OR REPLACE VIEW public.finance_ap_invoice_line_board WITH (security_invoker=true) AS
SELECT l.*, a.code AS account_code, COALESCE(a.name_ar,a.name) AS account_name, cc.code AS cost_center_code, cc.name_ar AS cost_center_name, fp.code AS project_code, fp.name_ar AS project_name
FROM public.ap_invoice_lines l
JOIN public.chart_of_accounts a ON a.id=l.account_id
LEFT JOIN public.cost_centers cc ON cc.id=l.cost_center_id
LEFT JOIN public.finance_projects fp ON fp.id=l.project_id
WHERE l.tenant_id=public.current_user_tenant_id()
ORDER BY l.ap_invoice_id,l.line_number;
GRANT SELECT ON public.finance_ap_invoice_line_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_ap_invoice_board WITH (security_invoker=true) AS
SELECT i.*, e.code AS entity_code, e.name_ar AS entity_name, v.vendor_code,
  COALESCE(v.name_ar,i.vendor_name) AS vendor_display_name,
  COUNT(l.id)::BIGINT AS line_count,
  COALESCE(SUM(l.total_amount),0)::NUMERIC AS lines_total,
  (i.amount-i.amount_paid)::NUMERIC AS outstanding_amount,
  CASE WHEN i.status IN ('approved','partially_paid','overdue') AND COALESCE(i.due_date,i.invoice_date)<CURRENT_DATE THEN CURRENT_DATE-COALESCE(i.due_date,i.invoice_date) ELSE 0 END AS days_past_due
FROM public.accounts_payable i
JOIN public.legal_entities e ON e.id=i.legal_entity_id
LEFT JOIN public.vendors v ON v.id=i.vendor_id
LEFT JOIN public.ap_invoice_lines l ON l.ap_invoice_id=i.id
WHERE i.tenant_id=public.current_user_tenant_id()
GROUP BY i.id,e.code,e.name_ar,v.vendor_code,v.name_ar
ORDER BY i.invoice_date DESC,i.created_at DESC;
GRANT SELECT ON public.finance_ap_invoice_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_ap_dashboard WITH (security_invoker=true) AS
SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,
  COUNT(i.id) FILTER (WHERE i.status='draft')::BIGINT AS draft_invoices,
  COUNT(i.id) FILTER (WHERE i.status='submitted')::BIGINT AS submitted_invoices,
  COUNT(i.id) FILTER (WHERE i.status='approved')::BIGINT AS approved_invoices,
  COUNT(i.id) FILTER (WHERE i.status IN ('partially_paid','paid'))::BIGINT AS payment_progress_invoices,
  COUNT(i.id) FILTER (WHERE i.status='voided')::BIGINT AS voided_invoices,
  COALESCE(SUM(i.amount-i.amount_paid) FILTER (WHERE i.status IN ('approved','partially_paid','overdue')),0)::NUMERIC AS total_outstanding,
  COALESCE(SUM(i.amount-i.amount_paid) FILTER (WHERE i.status IN ('approved','partially_paid','overdue') AND COALESCE(i.due_date,i.invoice_date)<CURRENT_DATE),0)::NUMERIC AS overdue_outstanding,
  COUNT(v.id) FILTER (WHERE v.is_active)::BIGINT AS active_vendors
FROM public.legal_entities e
LEFT JOIN public.accounts_payable i ON i.legal_entity_id=e.id
LEFT JOIN public.vendors v ON v.legal_entity_id=e.id
WHERE e.tenant_id=public.current_user_tenant_id()
GROUP BY e.tenant_id,e.id,e.code,e.name_ar
ORDER BY e.code;
GRANT SELECT ON public.finance_ap_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.finance_vendor_payment_board WITH (security_invoker=true) AS
SELECT p.*, e.code AS entity_code, e.name_ar AS entity_name, v.vendor_code, v.name_ar AS vendor_name,
  COUNT(a.id)::BIGINT AS allocation_count, COALESCE(SUM(a.allocated_amount),0)::NUMERIC AS allocated_total
FROM public.vendor_payments p
JOIN public.legal_entities e ON e.id=p.legal_entity_id
JOIN public.vendors v ON v.id=p.vendor_id
LEFT JOIN public.vendor_payment_allocations a ON a.payment_id=p.id
WHERE p.tenant_id=public.current_user_tenant_id()
GROUP BY p.id,e.code,e.name_ar,v.vendor_code,v.name_ar
ORDER BY p.payment_date DESC,p.created_at DESC;
GRANT SELECT ON public.finance_vendor_payment_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_vendor_payment_allocation_board WITH (security_invoker=true) AS
SELECT a.*, p.payment_number, i.invoice_number, i.vendor_name, i.amount AS invoice_amount, i.amount_paid AS invoice_paid
FROM public.vendor_payment_allocations a
JOIN public.vendor_payments p ON p.id=a.payment_id
JOIN public.accounts_payable i ON i.id=a.ap_invoice_id
WHERE a.tenant_id=public.current_user_tenant_id()
ORDER BY p.payment_date DESC,p.payment_number,i.invoice_number;
GRANT SELECT ON public.finance_vendor_payment_allocation_board TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.ap_invoice_lines') IS NULL
     OR to_regclass('public.finance_ap_invoice_board') IS NULL
     OR to_regclass('public.finance_vendor_payment_board') IS NULL
     OR to_regprocedure('public.upsert_finance_vendor(uuid,text,text,text,text,text,text,text,integer,character)') IS NULL
     OR to_regprocedure('public.create_ap_invoice_with_lines(uuid,uuid,text,date,date,character,numeric,text,jsonb)') IS NULL
     OR to_regprocedure('public.set_ap_invoice_lifecycle_status(uuid,text,text)') IS NULL
     OR to_regprocedure('public.post_vendor_payment_with_reason(uuid,text)') IS NULL
     OR to_regprocedure('public.void_vendor_payment(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0244 failed: Finance AP unit objects missing';
  END IF;
  RAISE NOTICE '✅ 0244: Finance accounts payable unit applied';
END $$;
