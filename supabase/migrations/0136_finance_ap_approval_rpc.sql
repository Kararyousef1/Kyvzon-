CREATE OR REPLACE FUNCTION public.set_ap_invoice_status(p_invoice_id UUID, p_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS public.accounts_payable
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE invoice public.accounts_payable%ROWTYPE; previous public.accounts_payable%ROWTYPE;
BEGIN
  SELECT * INTO invoice FROM public.accounts_payable WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AP invoice not found'; END IF;
  previous:=invoice;
  IF NOT public.current_user_can_manage_legal_entity(invoice.legal_entity_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_status NOT IN ('submitted','approved','voided') THEN RAISE EXCEPTION 'Invalid AP status transition'; END IF;
  IF (p_status='approved' AND invoice.status<>'submitted') OR (p_status='submitted' AND invoice.status<>'draft') OR (p_status='voided' AND invoice.status IN ('paid','voided')) THEN RAISE EXCEPTION 'Invalid AP invoice state transition'; END IF;
  IF p_status='voided' AND (p_reason IS NULL OR btrim(p_reason)='') THEN RAISE EXCEPTION 'A void reason is required'; END IF;
  UPDATE public.accounts_payable SET status=p_status, approved_at=CASE WHEN p_status='approved' THEN NOW() ELSE approved_at END, approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END WHERE id=invoice.id RETURNING * INTO invoice;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(invoice.tenant_id,invoice.legal_entity_id,CONCAT('ap_invoice_',p_status),'accounts_payable',invoice.id,auth.uid(),to_jsonb(previous),jsonb_build_object('invoice',to_jsonb(invoice),'reason',p_reason));
  RETURN invoice;
END; $$;
REVOKE ALL ON FUNCTION public.set_ap_invoice_status(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_ap_invoice_status(UUID,TEXT,TEXT) TO authenticated;
