-- ============================================================================
-- 0240 — Finance Unit 00: Foundation & Control Plane completion
-- docs/finance/00-finance-foundation-control-plane.md
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_legal_entity_status(p_legal_entity_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.legal_entities
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.legal_entities%ROWTYPE; v_new public.legal_entities%ROWTYPE;
BEGIN
  IF p_status NOT IN ('active','inactive','archived') THEN RAISE EXCEPTION 'INVALID_LEGAL_ENTITY_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.legal_entities WHERE id=p_legal_entity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  UPDATE public.legal_entities SET status=p_status,updated_at=NOW() WHERE id=p_legal_entity_id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_new.tenant_id,v_new.id,'legal_entity_status_change','legal_entity',v_new.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('entity',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
GRANT EXECUTE ON FUNCTION public.update_legal_entity_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_finance_entity_membership(p_legal_entity_id UUID,p_user_id UUID,p_finance_role TEXT DEFAULT 'viewer')
RETURNS public.entity_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entity public.legal_entities%ROWTYPE; v_row public.entity_memberships%ROWTYPE;
BEGIN
  IF p_finance_role NOT IN ('viewer','accountant','approver','finance_manager','entity_admin') THEN RAISE EXCEPTION 'INVALID_FINANCE_ROLE'; END IF;
  SELECT * INTO v_entity FROM public.legal_entities WHERE id=p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND tenant_id=v_entity.tenant_id) THEN RAISE EXCEPTION 'USER_NOT_IN_TENANT'; END IF;
  INSERT INTO public.entity_memberships(tenant_id,legal_entity_id,user_id,finance_role,is_active)
  VALUES(v_entity.tenant_id,p_legal_entity_id,p_user_id,p_finance_role,true)
  ON CONFLICT (legal_entity_id,user_id) DO UPDATE SET finance_role=EXCLUDED.finance_role,is_active=true,updated_at=NOW()
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(v_entity.tenant_id,p_legal_entity_id,'entity_membership_assigned','entity_membership',v_row.id,auth.uid(),to_jsonb(v_row));
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.assign_finance_entity_membership(UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_finance_entity_membership(p_membership_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.entity_memberships%ROWTYPE;
BEGIN
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'DEACTIVATION_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.entity_memberships WHERE id=p_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_MEMBERSHIP_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  UPDATE public.entity_memberships SET is_active=false,updated_at=NOW() WHERE id=p_membership_id;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'entity_membership_deactivated','entity_membership',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('is_active',false,'reason',p_reason));
END $$;
GRANT EXECUTE ON FUNCTION public.deactivate_finance_entity_membership(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_cost_center(p_legal_entity_id UUID,p_code TEXT,p_name_ar TEXT,p_name_en TEXT DEFAULT NULL,p_parent_id UUID DEFAULT NULL)
RETURNS public.cost_centers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entity public.legal_entities%ROWTYPE; v_row public.cost_centers%ROWTYPE;
BEGIN
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  SELECT * INTO v_entity FROM public.legal_entities WHERE id=p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
  IF p_parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centers WHERE id=p_parent_id AND legal_entity_id=p_legal_entity_id) THEN RAISE EXCEPTION 'PARENT_COST_CENTER_NOT_FOUND'; END IF;
  INSERT INTO public.cost_centers(tenant_id,legal_entity_id,code,name_ar,name_en,parent_id,is_active)
  VALUES(v_entity.tenant_id,p_legal_entity_id,upper(btrim(p_code)),p_name_ar,p_name_en,p_parent_id,true)
  ON CONFLICT (legal_entity_id,code) DO UPDATE SET name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,parent_id=EXCLUDED.parent_id,is_active=true,updated_at=NOW()
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(v_entity.tenant_id,p_legal_entity_id,'cost_center_upserted','cost_center',v_row.id,auth.uid(),to_jsonb(v_row));
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_cost_center(UUID,TEXT,TEXT,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_cost_center_status(p_cost_center_id UUID,p_is_active BOOLEAN,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.cost_centers%ROWTYPE;
BEGIN
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.cost_centers WHERE id=p_cost_center_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COST_CENTER_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  UPDATE public.cost_centers SET is_active=p_is_active,updated_at=NOW() WHERE id=p_cost_center_id;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'cost_center_status_change','cost_center',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('is_active',p_is_active,'reason',p_reason));
END $$;
GRANT EXECUTE ON FUNCTION public.update_finance_cost_center_status(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_project(p_legal_entity_id UUID,p_code TEXT,p_name_ar TEXT,p_name_en TEXT DEFAULT NULL,p_status TEXT DEFAULT 'active',p_start_date DATE DEFAULT NULL,p_end_date DATE DEFAULT NULL)
RETURNS public.finance_projects
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entity public.legal_entities%ROWTYPE; v_row public.finance_projects%ROWTYPE;
BEGIN
  IF p_status NOT IN ('active','on_hold','closed','archived') THEN RAISE EXCEPTION 'INVALID_FINANCE_PROJECT_STATUS'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  SELECT * INTO v_entity FROM public.legal_entities WHERE id=p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
  INSERT INTO public.finance_projects(tenant_id,legal_entity_id,code,name_ar,name_en,status,start_date,end_date)
  VALUES(v_entity.tenant_id,p_legal_entity_id,upper(btrim(p_code)),p_name_ar,p_name_en,p_status,p_start_date,p_end_date)
  ON CONFLICT (legal_entity_id,code) DO UPDATE SET name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,status=EXCLUDED.status,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,updated_at=NOW()
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(v_entity.tenant_id,p_legal_entity_id,'finance_project_upserted','finance_project',v_row.id,auth.uid(),to_jsonb(v_row));
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_project(UUID,TEXT,TEXT,TEXT,TEXT,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_finance_project_status(p_project_id UUID,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.finance_projects%ROWTYPE;
BEGIN
  IF p_status NOT IN ('active','on_hold','closed','archived') THEN RAISE EXCEPTION 'INVALID_FINANCE_PROJECT_STATUS'; END IF;
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'STATUS_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.finance_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_PROJECT_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  UPDATE public.finance_projects SET status=p_status,updated_at=NOW() WHERE id=p_project_id;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'finance_project_status_change','finance_project',v_old.id,auth.uid(),to_jsonb(v_old),jsonb_build_object('status',p_status,'reason',p_reason));
END $$;
GRANT EXECUTE ON FUNCTION public.update_finance_project_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_exchange_rate(p_legal_entity_id UUID,p_rate_date DATE,p_from_currency_code CHAR(3),p_to_currency_code CHAR(3),p_rate NUMERIC,p_source TEXT DEFAULT 'manual',p_status TEXT DEFAULT 'approved')
RETURNS public.exchange_rates
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entity public.legal_entities%ROWTYPE; v_row public.exchange_rates%ROWTYPE;
BEGIN
  IF p_status NOT IN ('draft','approved','superseded') THEN RAISE EXCEPTION 'INVALID_EXCHANGE_RATE_STATUS'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  IF p_rate IS NULL OR p_rate<=0 THEN RAISE EXCEPTION 'INVALID_EXCHANGE_RATE'; END IF;
  SELECT * INTO v_entity FROM public.legal_entities WHERE id=p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
  INSERT INTO public.exchange_rates(tenant_id,legal_entity_id,rate_date,from_currency_code,to_currency_code,rate,source,status,approved_by)
  VALUES(v_entity.tenant_id,p_legal_entity_id,p_rate_date,p_from_currency_code,p_to_currency_code,p_rate,COALESCE(p_source,'manual'),p_status,CASE WHEN p_status='approved' THEN auth.uid() ELSE NULL END)
  ON CONFLICT (legal_entity_id,rate_date,from_currency_code,to_currency_code) DO UPDATE SET rate=EXCLUDED.rate,source=EXCLUDED.source,status=EXCLUDED.status,approved_by=EXCLUDED.approved_by
  RETURNING * INTO v_row;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(v_entity.tenant_id,p_legal_entity_id,'exchange_rate_upserted','exchange_rate',v_row.id,auth.uid(),to_jsonb(v_row));
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_exchange_rate(UUID,DATE,CHAR,CHAR,NUMERIC,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_foundation_dashboard WITH (security_invoker=true) AS
SELECT public.current_user_tenant_id() AS tenant_id,
  (SELECT COUNT(*) FROM public.legal_entities WHERE tenant_id=public.current_user_tenant_id() AND status='active') AS active_legal_entities,
  (SELECT COUNT(*) FROM public.fiscal_years WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_fiscal_years,
  (SELECT COUNT(*) FROM public.accounting_periods WHERE tenant_id=public.current_user_tenant_id() AND status='open') AS open_periods,
  (SELECT COUNT(*) FROM public.cost_centers WHERE tenant_id=public.current_user_tenant_id() AND is_active) AS active_cost_centers,
  (SELECT COUNT(*) FROM public.finance_projects WHERE tenant_id=public.current_user_tenant_id() AND status='active') AS active_projects,
  (SELECT COUNT(*) FROM public.exchange_rates WHERE tenant_id=public.current_user_tenant_id() AND status='approved') AS approved_exchange_rates;
GRANT SELECT ON public.finance_foundation_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.finance_legal_entity_lookup WITH (security_invoker=true) AS
SELECT id,code,name_ar,base_currency_code,status FROM public.legal_entities WHERE tenant_id=public.current_user_tenant_id() ORDER BY code;
GRANT SELECT ON public.finance_legal_entity_lookup TO authenticated;

CREATE OR REPLACE VIEW public.finance_entity_membership_board WITH (security_invoker=true) AS
SELECT m.*, e.code AS entity_code, e.name_ar AS entity_name, p.full_name, p.email, p.role
FROM public.entity_memberships m
JOIN public.legal_entities e ON e.id=m.legal_entity_id AND e.tenant_id=m.tenant_id
LEFT JOIN public.profiles p ON p.id=m.user_id AND p.tenant_id=m.tenant_id
WHERE m.tenant_id=public.current_user_tenant_id()
ORDER BY e.code, p.full_name;
GRANT SELECT ON public.finance_entity_membership_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_cost_center_lookup WITH (security_invoker=true) AS
SELECT cc.id,cc.code,cc.name_ar,cc.name_en,cc.is_active,e.code AS entity_code,e.name_ar AS entity_name
FROM public.cost_centers cc JOIN public.legal_entities e ON e.id=cc.legal_entity_id AND e.tenant_id=cc.tenant_id
WHERE cc.tenant_id=public.current_user_tenant_id()
ORDER BY e.code, cc.code;
GRANT SELECT ON public.finance_cost_center_lookup TO authenticated;

CREATE OR REPLACE VIEW public.finance_project_lookup WITH (security_invoker=true) AS
SELECT p.id,p.code,p.name_ar,p.name_en,p.status,p.start_date,p.end_date,e.code AS entity_code,e.name_ar AS entity_name
FROM public.finance_projects p JOIN public.legal_entities e ON e.id=p.legal_entity_id AND e.tenant_id=p.tenant_id
WHERE p.tenant_id=public.current_user_tenant_id()
ORDER BY e.code, p.code;
GRANT SELECT ON public.finance_project_lookup TO authenticated;

CREATE OR REPLACE VIEW public.finance_exchange_rate_board WITH (security_invoker=true) AS
SELECT r.*, e.code AS entity_code, e.name_ar AS entity_name
FROM public.exchange_rates r JOIN public.legal_entities e ON e.id=r.legal_entity_id AND e.tenant_id=r.tenant_id
WHERE r.tenant_id=public.current_user_tenant_id()
ORDER BY r.rate_date DESC, r.from_currency_code, r.to_currency_code;
GRANT SELECT ON public.finance_exchange_rate_board TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.update_legal_entity_status(uuid,text,text)') IS NULL OR to_regprocedure('public.upsert_finance_cost_center(uuid,text,text,text,uuid)') IS NULL OR to_regclass('public.finance_foundation_dashboard') IS NULL THEN
    RAISE EXCEPTION '0240 failed: Finance foundation control plane objects missing';
  END IF;
  RAISE NOTICE '✅ 0240: Finance foundation control plane applied';
END $$;
