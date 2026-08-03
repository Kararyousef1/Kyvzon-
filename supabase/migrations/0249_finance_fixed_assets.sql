-- ============================================================================
-- 0249 — Finance Unit 09: Fixed Assets
-- docs/finance/09-fixed-assets.md
-- ============================================================================

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS asset_category TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
  ADD COLUMN IF NOT EXISTS depreciation_rate NUMERIC(8,4) DEFAULT 20.0000,
  ADD COLUMN IF NOT EXISTS depreciation_start_date DATE,
  ADD COLUMN IF NOT EXISTS salvage_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_date DATE,
  ADD COLUMN IF NOT EXISTS disposal_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS disposal_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_depreciation_run TIMESTAMPTZ;
UPDATE public.fixed_assets a SET legal_entity_id=e.id FROM public.legal_entities e WHERE e.tenant_id=a.tenant_id AND e.code='DEFAULT' AND a.legal_entity_id IS NULL;
UPDATE public.fixed_assets SET asset_category=COALESCE(asset_category,category,'equipment'), category=COALESCE(category,asset_category,'equipment'), book_value=COALESCE(book_value,purchase_cost,0) WHERE asset_category IS NULL OR category IS NULL OR book_value IS NULL;
ALTER TABLE public.fixed_assets ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_status_check;
ALTER TABLE public.fixed_assets ADD CONSTRAINT fixed_assets_status_check CHECK(status IN ('draft','active','held_for_sale','retired','sold','impaired','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_asset_entity_code ON public.fixed_assets(legal_entity_id, asset_code);

ALTER TABLE public.depreciation_schedules
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE public.depreciation_schedules d SET tenant_id=a.tenant_id, legal_entity_id=a.legal_entity_id FROM public.fixed_assets a WHERE a.id=d.asset_id AND d.tenant_id IS NULL;
ALTER TABLE public.depreciation_schedules ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.depreciation_schedules ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.depreciation_schedules DROP CONSTRAINT IF EXISTS depreciation_schedules_status_check;
ALTER TABLE public.depreciation_schedules ADD CONSTRAINT depreciation_schedules_status_check CHECK(status IN ('scheduled','posted','skipped','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_depreciation_asset_date ON public.depreciation_schedules(asset_id, schedule_date);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depreciation_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_fixed_assets_access ON public.fixed_assets;
DROP POLICY IF EXISTS finance_depreciation_schedules_access ON public.depreciation_schedules;
CREATE POLICY finance_fixed_assets_access ON public.fixed_assets FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_depreciation_schedules_access ON public.depreciation_schedules FOR ALL TO authenticated USING(public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK(public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.upsert_finance_fixed_asset(p_legal_entity_id UUID,p_asset_code TEXT,p_asset_name TEXT,p_asset_category TEXT,p_purchase_date DATE,p_purchase_cost NUMERIC,p_useful_life_years INTEGER DEFAULT 5,p_depreciation_method TEXT DEFAULT 'straight_line',p_salvage_value NUMERIC DEFAULT 0,p_depreciation_start_date DATE DEFAULT NULL,p_asset_id UUID DEFAULT NULL)
RETURNS public.fixed_assets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.legal_entities%ROWTYPE; old public.fixed_assets%ROWTYPE; r public.fixed_assets%ROWTYPE; v_rate NUMERIC;
BEGIN
 IF NOT public.current_user_can_manage_legal_entity(p_legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 SELECT * INTO e FROM public.legal_entities WHERE id=p_legal_entity_id; IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_ENTITY_NOT_FOUND'; END IF;
 IF COALESCE(btrim(p_asset_code),'')='' OR COALESCE(btrim(p_asset_name),'')='' THEN RAISE EXCEPTION 'ASSET_CODE_AND_NAME_REQUIRED'; END IF;
 IF p_purchase_cost IS NULL OR p_purchase_cost<0 OR COALESCE(p_useful_life_years,0)<=0 THEN RAISE EXCEPTION 'INVALID_ASSET_COST_OR_LIFE'; END IF;
 IF p_depreciation_method NOT IN ('straight_line','declining_balance') THEN RAISE EXCEPTION 'INVALID_DEPRECIATION_METHOD'; END IF;
 v_rate := ROUND((100.0 / p_useful_life_years)::NUMERIC,4);
 IF p_asset_id IS NOT NULL THEN SELECT * INTO old FROM public.fixed_assets WHERE id=p_asset_id AND legal_entity_id=p_legal_entity_id FOR UPDATE; END IF;
 IF old.id IS NOT NULL THEN
   IF old.status NOT IN ('draft','active') THEN RAISE EXCEPTION 'ONLY_DRAFT_OR_ACTIVE_ASSET_CAN_BE_EDITED'; END IF;
   UPDATE public.fixed_assets SET asset_code=upper(btrim(p_asset_code)),asset_name=btrim(p_asset_name),asset_category=p_asset_category,category=p_asset_category,purchase_date=p_purchase_date,purchase_cost=p_purchase_cost,useful_life_years=p_useful_life_years,depreciation_method=p_depreciation_method,depreciation_rate=v_rate,salvage_value=COALESCE(p_salvage_value,0),depreciation_start_date=COALESCE(p_depreciation_start_date,p_purchase_date),book_value=p_purchase_cost-COALESCE(accumulated_depreciation,0),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 ELSE
   INSERT INTO public.fixed_assets(tenant_id,legal_entity_id,asset_code,asset_name,asset_category,category,purchase_date,purchase_cost,useful_life_years,depreciation_method,depreciation_rate,salvage_value,depreciation_start_date,accumulated_depreciation,book_value,status)
   VALUES(e.tenant_id,p_legal_entity_id,upper(btrim(p_asset_code)),btrim(p_asset_name),p_asset_category,p_asset_category,p_purchase_date,p_purchase_cost,p_useful_life_years,p_depreciation_method,v_rate,COALESCE(p_salvage_value,0),COALESCE(p_depreciation_start_date,p_purchase_date),0,p_purchase_cost,'active') RETURNING * INTO r;
 END IF;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'fixed_asset_upserted','fixed_asset',r.id,auth.uid(),CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(r));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_finance_fixed_asset(UUID,TEXT,TEXT,TEXT,DATE,NUMERIC,INTEGER,TEXT,NUMERIC,DATE,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_fixed_asset_depreciation_schedule(p_asset_id UUID)
RETURNS SETOF public.depreciation_schedules LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.fixed_assets%ROWTYPE; monthly NUMERIC; i INT; d DATE; acc NUMERIC:=0;
BEGIN
 SELECT * INTO a FROM public.fixed_assets WHERE id=p_asset_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FIXED_ASSET_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(a.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF a.status<>'active' THEN RAISE EXCEPTION 'ONLY_ACTIVE_ASSET_CAN_BE_SCHEDULED'; END IF;
 monthly := ROUND(((a.purchase_cost-COALESCE(a.salvage_value,0))/(a.useful_life_years*12))::NUMERIC,2);
 FOR i IN 1..(a.useful_life_years*12) LOOP
   d := (date_trunc('month',COALESCE(a.depreciation_start_date,a.purchase_date))::DATE + ((i-1)||' months')::INTERVAL)::DATE;
   acc := LEAST(a.purchase_cost-COALESCE(a.salvage_value,0), acc + monthly);
   INSERT INTO public.depreciation_schedules(asset_id,tenant_id,legal_entity_id,schedule_date,depreciation_amount,accumulated_at_date,status)
   VALUES(a.id,a.tenant_id,a.legal_entity_id,d,LEAST(monthly,a.purchase_cost-COALESCE(a.salvage_value,0)-(acc-monthly)),acc,'scheduled') ON CONFLICT(asset_id,schedule_date) DO NOTHING;
 END LOOP;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data) VALUES(a.tenant_id,a.legal_entity_id,'fixed_asset_schedule_generated','fixed_asset',a.id,auth.uid(),jsonb_build_object('asset_id',a.id));
 RETURN QUERY SELECT * FROM public.depreciation_schedules WHERE asset_id=a.id ORDER BY schedule_date;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_fixed_asset_depreciation_schedule(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_fixed_asset_depreciation(p_asset_id UUID,p_run_until DATE,p_reason TEXT)
RETURNS public.fixed_assets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.fixed_assets%ROWTYPE; old public.fixed_assets%ROWTYPE; dep NUMERIC;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'DEPRECIATION_RUN_REASON_REQUIRED'; END IF;
 SELECT * INTO a FROM public.fixed_assets WHERE id=p_asset_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FIXED_ASSET_NOT_FOUND'; END IF; old:=a;
 IF NOT public.current_user_can_manage_legal_entity(a.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 IF a.status<>'active' THEN RAISE EXCEPTION 'ONLY_ACTIVE_ASSET_CAN_DEPRECIATE'; END IF;
 SELECT COALESCE(SUM(depreciation_amount),0) INTO dep FROM public.depreciation_schedules WHERE asset_id=a.id AND status='scheduled' AND schedule_date<=p_run_until;
 UPDATE public.depreciation_schedules SET status='posted',posted_at=NOW(),posted_by=auth.uid() WHERE asset_id=a.id AND status='scheduled' AND schedule_date<=p_run_until;
 UPDATE public.fixed_assets SET accumulated_depreciation=LEAST(purchase_cost-COALESCE(salvage_value,0),COALESCE(accumulated_depreciation,0)+dep),book_value=GREATEST(COALESCE(salvage_value,0),purchase_cost-LEAST(purchase_cost-COALESCE(salvage_value,0),COALESCE(accumulated_depreciation,0)+dep)),last_depreciation_run=NOW(),updated_at=NOW() WHERE id=a.id RETURNING * INTO a;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(a.tenant_id,a.legal_entity_id,'fixed_asset_depreciation_run','fixed_asset',a.id,auth.uid(),to_jsonb(old),jsonb_build_object('asset',to_jsonb(a),'depreciation_amount',dep,'reason',p_reason));
 RETURN a;
END $$;
GRANT EXECUTE ON FUNCTION public.run_fixed_asset_depreciation(UUID,DATE,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_fixed_asset_status(p_asset_id UUID,p_status TEXT,p_reason TEXT,p_disposal_date DATE DEFAULT NULL,p_disposal_amount NUMERIC DEFAULT NULL)
RETURNS public.fixed_assets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.fixed_assets%ROWTYPE; r public.fixed_assets%ROWTYPE;
BEGIN
 IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'FIXED_ASSET_STATUS_REASON_REQUIRED'; END IF;
 IF p_status NOT IN ('draft','active','held_for_sale','retired','sold','impaired','voided') THEN RAISE EXCEPTION 'INVALID_FIXED_ASSET_STATUS'; END IF;
 SELECT * INTO old FROM public.fixed_assets WHERE id=p_asset_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FIXED_ASSET_NOT_FOUND'; END IF;
 IF NOT public.current_user_can_manage_legal_entity(old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
 UPDATE public.fixed_assets SET status=p_status,disposal_date=CASE WHEN p_status IN ('retired','sold','voided') THEN COALESCE(p_disposal_date,CURRENT_DATE) ELSE disposal_date END,disposal_amount=CASE WHEN p_status='sold' THEN p_disposal_amount ELSE disposal_amount END,disposal_reason=btrim(p_reason),updated_at=NOW() WHERE id=old.id RETURNING * INTO r;
 INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data) VALUES(r.tenant_id,r.legal_entity_id,'fixed_asset_status_changed','fixed_asset',r.id,auth.uid(),to_jsonb(old),jsonb_build_object('asset',to_jsonb(r),'reason',p_reason));
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.update_fixed_asset_status(UUID,TEXT,TEXT,DATE,NUMERIC) TO authenticated;

CREATE OR REPLACE VIEW public.finance_fixed_asset_board WITH (security_invoker=true) AS SELECT a.*,e.code AS entity_code,e.name_ar AS entity_name,COUNT(d.id)::BIGINT AS schedule_count,COUNT(d.id) FILTER(WHERE d.status='posted')::BIGINT AS posted_depreciation_count FROM public.fixed_assets a JOIN public.legal_entities e ON e.id=a.legal_entity_id LEFT JOIN public.depreciation_schedules d ON d.asset_id=a.id WHERE a.tenant_id=public.current_user_tenant_id() GROUP BY a.id,e.code,e.name_ar ORDER BY a.asset_code;
GRANT SELECT ON public.finance_fixed_asset_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_depreciation_schedule_board WITH (security_invoker=true) AS SELECT d.*,a.asset_code,a.asset_name,a.asset_category FROM public.depreciation_schedules d JOIN public.fixed_assets a ON a.id=d.asset_id WHERE d.tenant_id=public.current_user_tenant_id() ORDER BY d.schedule_date DESC;
GRANT SELECT ON public.finance_depreciation_schedule_board TO authenticated;
CREATE OR REPLACE VIEW public.finance_fixed_asset_dashboard WITH (security_invoker=true) AS SELECT e.tenant_id,e.id AS legal_entity_id,e.code AS entity_code,e.name_ar AS entity_name,COUNT(a.id) FILTER(WHERE a.status='active')::BIGINT AS active_assets,COALESCE(SUM(a.purchase_cost) FILTER(WHERE a.status='active'),0)::NUMERIC AS active_asset_cost,COALESCE(SUM(a.book_value) FILTER(WHERE a.status='active'),0)::NUMERIC AS active_book_value,COALESCE(SUM(a.accumulated_depreciation),0)::NUMERIC AS accumulated_depreciation,COUNT(d.id) FILTER(WHERE d.status='scheduled')::BIGINT AS scheduled_depreciation_lines FROM public.legal_entities e LEFT JOIN public.fixed_assets a ON a.legal_entity_id=e.id LEFT JOIN public.depreciation_schedules d ON d.legal_entity_id=e.id WHERE e.tenant_id=public.current_user_tenant_id() GROUP BY e.tenant_id,e.id,e.code,e.name_ar ORDER BY e.code;
GRANT SELECT ON public.finance_fixed_asset_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN
 IF to_regclass('public.finance_fixed_asset_board') IS NULL OR to_regclass('public.finance_depreciation_schedule_board') IS NULL OR to_regprocedure('public.upsert_finance_fixed_asset(uuid,text,text,text,date,numeric,integer,text,numeric,date,uuid)') IS NULL OR to_regprocedure('public.run_fixed_asset_depreciation(uuid,date,text)') IS NULL THEN RAISE EXCEPTION '0249 failed: Finance fixed assets objects missing'; END IF;
 RAISE NOTICE '✅ 0249: Finance fixed assets applied';
END $$;
