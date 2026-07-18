-- Controlled setup RPCs. They remove client-side multi-step provisioning for a
-- legal entity and its first fiscal calendar.

CREATE OR REPLACE FUNCTION public.create_legal_entity(
  p_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT DEFAULT NULL,
  p_base_currency_code CHAR(3) DEFAULT 'IQD',
  p_registration_number TEXT DEFAULT NULL,
  p_tax_number TEXT DEFAULT NULL
)
RETURNS public.legal_entities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant UUID;
  entity public.legal_entities%ROWTYPE;
BEGIN
  IF NOT (public.current_user_is_platform_owner() OR public.current_user_role() = 'admin') THEN
    RAISE EXCEPTION 'Only a platform owner or tenant admin can create a legal entity';
  END IF;
  tenant := public.current_user_tenant_id();
  IF tenant IS NULL THEN RAISE EXCEPTION 'Tenant context is required'; END IF;
  IF p_code IS NULL OR btrim(p_code) = '' OR p_name_ar IS NULL OR btrim(p_name_ar) = '' THEN
    RAISE EXCEPTION 'Entity code and Arabic name are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = p_base_currency_code AND is_active) THEN
    RAISE EXCEPTION 'Base currency is invalid or inactive';
  END IF;

  INSERT INTO public.legal_entities (
    tenant_id, code, name_ar, name_en, base_currency_code, registration_number, tax_number
  ) VALUES (
    tenant, upper(btrim(p_code)), btrim(p_name_ar), NULLIF(btrim(p_name_en), ''),
    p_base_currency_code, NULLIF(btrim(p_registration_number), ''), NULLIF(btrim(p_tax_number), '')
  ) RETURNING * INTO entity;

  INSERT INTO public.entity_memberships (tenant_id, legal_entity_id, user_id, finance_role)
  VALUES (tenant, entity.id, auth.uid(), 'entity_admin');

  RETURN entity;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_fiscal_year_with_monthly_periods(
  p_legal_entity_id UUID,
  p_name TEXT,
  p_start_date DATE
)
RETURNS public.fiscal_years
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity public.legal_entities%ROWTYPE;
  fiscal public.fiscal_years%ROWTYPE;
  period_start DATE;
  period_end DATE;
  period_index INTEGER;
BEGIN
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this legal entity';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' OR p_start_date IS NULL THEN
    RAISE EXCEPTION 'Fiscal year name and start date are required';
  END IF;

  SELECT * INTO entity FROM public.legal_entities WHERE id = p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legal entity not found'; END IF;

  INSERT INTO public.fiscal_years (tenant_id, legal_entity_id, name, start_date, end_date, status)
  VALUES (
    entity.tenant_id, entity.id, btrim(p_name), p_start_date,
    (p_start_date + INTERVAL '1 year - 1 day')::DATE, 'open'
  ) RETURNING * INTO fiscal;

  FOR period_index IN 1..12 LOOP
    period_start := (p_start_date + ((period_index - 1) || ' months')::INTERVAL)::DATE;
    period_end := (period_start + INTERVAL '1 month - 1 day')::DATE;
    INSERT INTO public.accounting_periods (
      tenant_id, legal_entity_id, fiscal_year_id, period_number, name, start_date, end_date, status
    ) VALUES (
      entity.tenant_id, entity.id, fiscal.id, period_index,
      CONCAT(btrim(p_name), ' / ', lpad(period_index::TEXT, 2, '0')),
      period_start, period_end, 'open'
    );
  END LOOP;

  INSERT INTO public.finance_audit_events (
    tenant_id, legal_entity_id, event_type, aggregate_type, aggregate_id, actor_id, after_data
  ) VALUES (
    entity.tenant_id, entity.id, 'fiscal_year_created', 'fiscal_year', fiscal.id, auth.uid(), to_jsonb(fiscal)
  );

  RETURN fiscal;
END;
$$;

REVOKE ALL ON FUNCTION public.create_legal_entity(TEXT, TEXT, TEXT, CHAR(3), TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_fiscal_year_with_monthly_periods(UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_legal_entity(TEXT, TEXT, TEXT, CHAR(3), TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_fiscal_year_with_monthly_periods(UUID, TEXT, DATE) TO authenticated;
