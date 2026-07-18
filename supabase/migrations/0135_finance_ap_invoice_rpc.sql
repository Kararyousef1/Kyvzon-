CREATE OR REPLACE FUNCTION public.create_ap_invoice(
  p_legal_entity_id UUID, p_vendor_id UUID, p_invoice_number TEXT,
  p_invoice_date DATE, p_due_date DATE, p_amount NUMERIC,
  p_currency_code CHAR(3), p_exchange_rate NUMERIC DEFAULT 1, p_notes TEXT DEFAULT NULL
) RETURNS public.accounts_payable
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vendors%ROWTYPE; result public.accounts_payable%ROWTYPE;
BEGIN
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO v FROM public.vendors WHERE id=p_vendor_id AND legal_entity_id=p_legal_entity_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor is invalid or inactive'; END IF;
  IF p_invoice_number IS NULL OR btrim(p_invoice_number)='' OR p_invoice_date IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_exchange_rate<=0 THEN RAISE EXCEPTION 'Invoice number, date, positive amount and exchange rate are required'; END IF;
  INSERT INTO public.accounts_payable(tenant_id,legal_entity_id,vendor_id,invoice_number,vendor_name,invoice_date,due_date,amount,currency_code,exchange_rate,status,notes)
  VALUES(v.tenant_id,p_legal_entity_id,p_vendor_id,btrim(p_invoice_number),v.name_ar,p_invoice_date,COALESCE(p_due_date,p_invoice_date+v.payment_terms_days),p_amount,p_currency_code,p_exchange_rate,'draft',NULLIF(btrim(p_notes),'')) RETURNING * INTO result;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(v.tenant_id,p_legal_entity_id,'ap_invoice_created','accounts_payable',result.id,auth.uid(),to_jsonb(result));
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_ap_invoice(UUID,UUID,TEXT,DATE,DATE,NUMERIC,CHAR(3),NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ap_invoice(UUID,UUID,TEXT,DATE,DATE,NUMERIC,CHAR(3),NUMERIC,TEXT) TO authenticated;
