-- ============================================================================
-- 0201 — Procurement Contracts CLM Completion (Unit 06)
-- التوثيق: docs/e-procurement/06-contract-lifecycle-management.md
-- يغطي: request/drafting/review/approval/signature tokens/obligations/amendments/renewal/termination/audit/analytics.
-- ============================================================================

-- 1) توسيع حالات العقد لتغطي دورة الحياة الكاملة
DO $$
DECLARE c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid='public.procurement_contracts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%'
  LIMIT 1;
  IF c_name IS NOT NULL THEN EXECUTE format('ALTER TABLE public.procurement_contracts DROP CONSTRAINT %I', c_name); END IF;
  ALTER TABLE public.procurement_contracts ADD CONSTRAINT procurement_contracts_status_check
    CHECK (status IN ('request','draft','review','negotiation','approval','approved','sent_for_signature','signed','active','expired','terminated','renewed'));
END $$;

ALTER TABLE public.procurement_contracts ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT false;
ALTER TABLE public.procurement_contracts ADD COLUMN IF NOT EXISTS non_standard_terms BOOLEAN DEFAULT false;
ALTER TABLE public.procurement_contracts ADD COLUMN IF NOT EXISTS legal_review_required BOOLEAN DEFAULT false;
ALTER TABLE public.procurement_contracts ADD COLUMN IF NOT EXISTS renewal_decision TEXT CHECK (renewal_decision IN ('renew_same','renegotiate','expand','reduce','terminate','rfq_new'));
ALTER TABLE public.procurement_contracts ADD COLUMN IF NOT EXISTS renewal_decision_notes TEXT;
ALTER TABLE public.procurement_contracts ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;
ALTER TABLE public.procurement_contracts ADD COLUMN IF NOT EXISTS termination_reason TEXT;

CREATE TABLE IF NOT EXISTS public.contract_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  old_value JSONB,
  new_value JSONB,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_audit_contract ON public.contract_audit_log(contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.contract_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  current_step INT NOT NULL DEFAULT 1,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, contract_id, status)
);

CREATE TABLE IF NOT EXISTS public.contract_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.contract_approval_requests(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  approver_role TEXT NOT NULL CHECK (approver_role IN ('legal','procurement','finance','admin')),
  approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','approved','rejected','skipped')),
  comments TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_contract_approval_steps_active ON public.contract_approval_steps(tenant_id, approver_id, status);

CREATE TABLE IF NOT EXISTS public.contract_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('supplier','buyer','legal','finance','admin')),
  signing_order INT NOT NULL DEFAULT 1,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','viewed','signed','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  ip_address INET,
  otp_code_hash TEXT,
  otp_verified BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_signature_token ON public.contract_signature_requests(token_hash);
CREATE INDEX IF NOT EXISTS idx_contract_signature_contract ON public.contract_signature_requests(contract_id, signing_order);

CREATE TABLE IF NOT EXISTS public.contract_redline_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.contract_versions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_email TEXT,
  comment TEXT NOT NULL,
  selection_text TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_redline_contract ON public.contract_redline_comments(contract_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_audit_log','contract_approval_requests','contract_approval_steps','contract_signature_requests','contract_redline_comments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin''));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin'')) WITH CHECK (tenant_id=public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin''));', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_contract_audit(p_contract_id UUID,p_action TEXT,p_old_status TEXT DEFAULT NULL,p_new_status TEXT DEFAULT NULL,p_old_value JSONB DEFAULT NULL,p_new_value JSONB DEFAULT NULL,p_comments TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_contract_id IS NOT NULL THEN PERFORM public.procurement_assert_contract_in_tenant(p_contract_id); END IF;
  INSERT INTO public.contract_audit_log(tenant_id,contract_id,actor_id,action,old_status,new_status,old_value,new_value,comments)
  VALUES(v_tenant,p_contract_id,auth.uid(),p_action,p_old_status,p_new_status,p_old_value,p_new_value,p_comments) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_contract_audit(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_default_contract_templates_clauses()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_count INT:=0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  INSERT INTO public.contract_templates(tenant_id,name,type,content,is_active)
  VALUES
    (v_tenant,'MSA — عقد إطاري للموردين','MSA','Master Services Agreement template: parties, scope, payment, warranty, liability, termination.',true),
    (v_tenant,'SLA — اتفاقية مستوى الخدمة','SLA','Service Level Agreement template: service levels, response times, penalties, reporting.',true),
    (v_tenant,'SOW — بيان عمل مشروع','SOW','Statement of Work template: deliverables, milestones, acceptance, budget.',true),
    (v_tenant,'NDA — اتفاقية عدم إفصاح','NDA','Non Disclosure Agreement template: confidentiality, permitted use, return of information.',true),
    (v_tenant,'PO Terms & Conditions','PO_TC','Purchase Order terms: delivery, invoicing, acceptance, dispute.',true),
    (v_tenant,'IP Agreement — ملكية فكرية','IP','IP ownership, licensing, deliverables, source materials.',true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.contract_clauses(tenant_id,clause_type,title,content,is_red_flag,is_standard)
  VALUES
    (v_tenant,'payment','Net 45 with 2/10 discount','Payment due within 45 days; 2% discount if paid within 10 days.',false,true),
    (v_tenant,'delivery','DDP Delivery','Supplier bears delivery and customs costs until buyer location.',false,true),
    (v_tenant,'warranty','12 month quality warranty','Supplier warrants goods for 12 months from receipt.',false,true),
    (v_tenant,'penalty','Late delivery penalty','0.5% per week delay, capped at 10%.',false,true),
    (v_tenant,'liability','Supplier full liability exclusion','Supplier excludes all liability for defects.',true,false),
    (v_tenant,'termination','Immediate supplier stop right','Supplier may stop immediately without compensation.',true,false)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_default_contract_templates_clauses() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_procurement_contract_full(p_supplier_id UUID,p_type TEXT,p_title TEXT,p_total_value NUMERIC,p_currency_code TEXT,p_start_date DATE,p_end_date DATE,p_template_id UUID DEFAULT NULL,p_description TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_number TEXT; v_content TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id,false);
  IF p_type NOT IN ('MSA','SLA','SOW','PO_TC','NDA','IP','other') THEN RAISE EXCEPTION 'INVALID_CONTRACT_TYPE'; END IF;
  IF p_template_id IS NOT NULL THEN SELECT content INTO v_content FROM public.contract_templates WHERE id=p_template_id AND tenant_id=v_tenant; END IF;
  v_number := 'CON-' || to_char(NOW(),'YYYY-') || lpad((EXTRACT(EPOCH FROM clock_timestamp())::BIGINT % 100000)::TEXT,5,'0');
  INSERT INTO public.procurement_contracts(tenant_id,contract_number,supplier_id,type,title,description,status,total_value,currency_code,start_date,end_date,legal_review_required,created_by)
  VALUES(v_tenant,v_number,p_supplier_id,p_type,p_title,p_description,'draft',p_total_value,COALESCE(p_currency_code,'SAR'),p_start_date,p_end_date,(COALESCE(p_total_value,0)>50000),auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.contract_versions(tenant_id,contract_id,version_number,content,change_summary,created_by)
  VALUES(v_tenant,v_id,'v0.1',COALESCE(v_content,'مسودة عقد: '||p_title),'إنشاء مسودة أولية',auth.uid());
  PERFORM public.log_contract_audit(v_id,'contract_created',NULL,'draft',NULL,jsonb_build_object('contract_number',v_number),NULL);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_procurement_contract_full(UUID,TEXT,TEXT,NUMERIC,TEXT,DATE,DATE,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_contract_approval(p_contract_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_contract RECORD; v_req UUID; v_order INT:=0; v_role TEXT; v_approver UUID;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_contract FROM public.procurement_contracts WHERE id=p_contract_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  INSERT INTO public.contract_approval_requests(tenant_id,contract_id,status,current_step,requested_by) VALUES(v_tenant,p_contract_id,'pending',1,auth.uid()) RETURNING id INTO v_req;
  FOR v_role IN SELECT unnest(ARRAY[CASE WHEN v_contract.legal_review_required OR v_contract.non_standard_terms THEN 'legal' ELSE NULL END,'procurement',CASE WHEN COALESCE(v_contract.total_value,0)>50000 THEN 'finance' ELSE NULL END,CASE WHEN COALESCE(v_contract.total_value,0)>500000 THEN 'admin' ELSE NULL END]) LOOP
    IF v_role IS NULL THEN CONTINUE; END IF;
    SELECT id INTO v_approver FROM public.profiles WHERE tenant_id=v_tenant AND role=CASE WHEN v_role='legal' THEN 'admin' ELSE v_role END AND status='active' LIMIT 1;
    v_order:=v_order+1;
    INSERT INTO public.contract_approval_steps(tenant_id,request_id,contract_id,step_order,approver_role,approver_id,status)
    VALUES(v_tenant,v_req,p_contract_id,v_order,v_role,v_approver,CASE WHEN v_order=1 THEN 'active' ELSE 'pending' END);
  END LOOP;
  UPDATE public.procurement_contracts SET status='approval', updated_at=NOW() WHERE id=p_contract_id AND tenant_id=v_tenant;
  PERFORM public.log_contract_audit(p_contract_id,'approval_requested',v_contract.status,'approval',to_jsonb(v_contract),jsonb_build_object('request_id',v_req),NULL);
  RETURN v_req;
END $$;
GRANT EXECUTE ON FUNCTION public.request_contract_approval(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_contract_step(p_step_id UUID,p_decision TEXT,p_comments TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_step RECORD; v_next RECORD; v_final TEXT;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  SELECT * INTO v_step FROM public.contract_approval_steps WHERE id=p_step_id AND tenant_id=v_tenant AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_STEP_NOT_FOUND'; END IF;
  IF v_step.approver_id IS NOT NULL AND v_step.approver_id IS DISTINCT FROM auth.uid() AND public.current_user_role() NOT IN ('admin','developer','it_admin') THEN RAISE EXCEPTION 'NOT_APPROVER'; END IF;
  UPDATE public.contract_approval_steps SET status=p_decision,comments=p_comments,decided_at=NOW() WHERE id=p_step_id;
  IF p_decision='rejected' THEN
    UPDATE public.contract_approval_requests SET status='rejected',updated_at=NOW() WHERE id=v_step.request_id;
    UPDATE public.procurement_contracts SET status='review',updated_at=NOW() WHERE id=v_step.contract_id;
    v_final:='rejected';
  ELSE
    SELECT * INTO v_next FROM public.contract_approval_steps WHERE request_id=v_step.request_id AND status='pending' AND tenant_id=v_tenant ORDER BY step_order LIMIT 1;
    IF FOUND THEN
      UPDATE public.contract_approval_steps SET status='active' WHERE id=v_next.id;
      UPDATE public.contract_approval_requests SET current_step=v_next.step_order,updated_at=NOW() WHERE id=v_step.request_id;
      v_final:='pending';
    ELSE
      UPDATE public.contract_approval_requests SET status='approved',updated_at=NOW() WHERE id=v_step.request_id;
      UPDATE public.procurement_contracts SET status='approved',updated_at=NOW() WHERE id=v_step.contract_id;
      v_final:='approved';
    END IF;
  END IF;
  PERFORM public.log_contract_audit(v_step.contract_id,'approval_step_'||p_decision,NULL,v_final,to_jsonb(v_step),jsonb_build_object('comments',p_comments),p_comments);
  RETURN v_final;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_contract_step(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_contract_signature(p_contract_id UUID,p_signers JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_contract RECORD; v_signer JSONB; v_count INT:=0;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_contract FROM public.procurement_contracts WHERE id=p_contract_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  IF v_contract.status NOT IN ('approved','active') THEN RAISE EXCEPTION 'CONTRACT_MUST_BE_APPROVED'; END IF;
  FOR v_signer IN SELECT * FROM jsonb_array_elements(p_signers) LOOP
    INSERT INTO public.contract_signature_requests(tenant_id,contract_id,signer_email,signer_role,signing_order,token_hash,created_by)
    VALUES(v_tenant,p_contract_id,lower(v_signer->>'email'),COALESCE(v_signer->>'role','supplier'),COALESCE((v_signer->>'order')::INT,1),md5(gen_random_uuid()::TEXT || clock_timestamp()::TEXT),auth.uid());
    v_count:=v_count+1;
  END LOOP;
  UPDATE public.procurement_contracts SET status='sent_for_signature',updated_at=NOW() WHERE id=p_contract_id AND tenant_id=v_tenant;
  PERFORM public.log_contract_audit(p_contract_id,'signature_requested','approved','sent_for_signature',NULL,jsonb_build_object('count',v_count),NULL);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.request_contract_signature(UUID,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_contract_obligation(p_contract_id UUID,p_description TEXT,p_responsible_party TEXT,p_due_date DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_contract_in_tenant(p_contract_id);
  INSERT INTO public.contract_obligations(tenant_id,contract_id,description,responsible_party,due_date,status)
  VALUES(v_tenant,p_contract_id,p_description,p_responsible_party,p_due_date,'pending') RETURNING id INTO v_id;
  PERFORM public.log_contract_audit(p_contract_id,'obligation_added',NULL,NULL,NULL,jsonb_build_object('obligation_id',v_id,'description',p_description),NULL);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_contract_obligation(UUID,TEXT,TEXT,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_contract_renewal(p_contract_id UUID,p_decision TEXT,p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  IF p_decision NOT IN ('renew_same','renegotiate','expand','reduce','terminate','rfq_new') THEN RAISE EXCEPTION 'INVALID_RENEWAL_DECISION'; END IF;
  SELECT * INTO v_old FROM public.procurement_contracts WHERE id=p_contract_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  UPDATE public.procurement_contracts SET renewal_decision=p_decision, renewal_decision_notes=p_notes, updated_at=NOW() WHERE id=p_contract_id AND tenant_id=v_tenant;
  PERFORM public.log_contract_audit(p_contract_id,'renewal_decision',v_old.status,v_old.status,to_jsonb(v_old),jsonb_build_object('decision',p_decision,'notes',p_notes),p_notes);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_contract_renewal(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.terminate_contract(p_contract_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_old FROM public.procurement_contracts WHERE id=p_contract_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  UPDATE public.procurement_contracts SET status='terminated',terminated_at=NOW(),termination_reason=p_reason,updated_at=NOW() WHERE id=p_contract_id AND tenant_id=v_tenant;
  PERFORM public.log_contract_audit(p_contract_id,'contract_terminated',v_old.status,'terminated',to_jsonb(v_old),jsonb_build_object('reason',p_reason),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.terminate_contract(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.contract_clm_analytics
WITH (security_invoker = true) AS
SELECT
  tenant_id,
  COUNT(*) FILTER (WHERE status IN ('active','signed')) AS active_contracts,
  COALESCE(SUM(total_value) FILTER (WHERE status IN ('active','signed')),0) AS active_contract_value,
  COUNT(*) FILTER (WHERE end_date <= CURRENT_DATE + INTERVAL '90 days' AND status IN ('active','signed')) AS renewals_90,
  COUNT(*) FILTER (WHERE auto_renewal=true AND status IN ('active','signed')) AS auto_renewal_contracts,
  COUNT(*) FILTER (WHERE status='terminated') AS terminated_contracts,
  ROUND(COUNT(*) FILTER (WHERE status IN ('signed','active'))::NUMERIC/NULLIF(COUNT(*),0)*100,2) AS esign_percent
FROM public.procurement_contracts
WHERE tenant_id=public.current_user_tenant_id()
GROUP BY tenant_id;
GRANT SELECT ON public.contract_clm_analytics TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.contract_audit_log') IS NULL THEN RAISE EXCEPTION '0201 failed: contract audit missing'; END IF;
  IF to_regprocedure('public.create_procurement_contract_full(uuid,text,text,numeric,text,date,date,uuid,text)') IS NULL THEN RAISE EXCEPTION '0201 failed: create contract missing'; END IF;
  IF to_regprocedure('public.request_contract_approval(uuid)') IS NULL THEN RAISE EXCEPTION '0201 failed: approval missing'; END IF;
  RAISE NOTICE '✅ 0201: CLM completion applied';
END $$;
