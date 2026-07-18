CREATE OR REPLACE FUNCTION public.get_ap_aging(p_legal_entity_id UUID, p_as_of_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(vendor_id UUID,vendor_name TEXT,current_amount NUMERIC,days_1_30 NUMERIC,days_31_60 NUMERIC,days_61_90 NUMERIC,days_over_90 NUMERIC,total_outstanding NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.current_user_can_access_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 RETURN QUERY SELECT i.vendor_id,COALESCE(i.vendor_name,'Unknown'),
 COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date)<=0 THEN i.amount-i.amount_paid ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date) BETWEEN 1 AND 30 THEN i.amount-i.amount_paid ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date) BETWEEN 31 AND 60 THEN i.amount-i.amount_paid ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date) BETWEEN 61 AND 90 THEN i.amount-i.amount_paid ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN p_as_of_date-COALESCE(i.due_date,i.invoice_date)>90 THEN i.amount-i.amount_paid ELSE 0 END),0),
 COALESCE(SUM(i.amount-i.amount_paid),0)
 FROM public.accounts_payable i WHERE i.legal_entity_id=p_legal_entity_id AND i.status IN ('approved','partially_paid','overdue') GROUP BY i.vendor_id,i.vendor_name ORDER BY 8 DESC; END; $$;
REVOKE ALL ON FUNCTION public.get_ap_aging(UUID,DATE) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_ap_aging(UUID,DATE) TO authenticated;
