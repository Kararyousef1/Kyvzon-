-- ============================================================================
-- 0194 — Procurement Strategic Sourcing Completion (Unit 02)
-- التوثيق: docs/e-procurement/02-strategic-sourcing-RFx.md
-- يغطي: دعوات الموردين، بوابة تقديم العروض، Q&A، الترسية، audit، KPIs.
-- ============================================================================

ALTER TABLE public.sourcing_events ADD COLUMN IF NOT EXISTS evaluation_method TEXT DEFAULT 'tco' CHECK (evaluation_method IN ('price_only','tco','mecca','auction'));
ALTER TABLE public.sourcing_events ADD COLUMN IF NOT EXISTS award_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.sourcing_events ADD COLUMN IF NOT EXISTS awarded_bid_id UUID REFERENCES public.supplier_bids(id) ON DELETE SET NULL;
ALTER TABLE public.sourcing_events ADD COLUMN IF NOT EXISTS award_reason TEXT;
ALTER TABLE public.sourcing_events ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
ALTER TABLE public.sourcing_events ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.rfx_supplier_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','viewed','responded','declined','expired','cancelled')),
  bid_id UUID REFERENCES public.supplier_bids(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  UNIQUE(tenant_id, event_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_rfx_inv_event ON public.rfx_supplier_invitations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_rfx_inv_token ON public.rfx_supplier_invitations(token_hash) WHERE token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rfx_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT,
  answered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'all_suppliers' CHECK (visibility IN ('all_suppliers','private')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rfx_questions_event ON public.rfx_questions(event_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rfx_event_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.sourcing_events(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfx_audit_event ON public.rfx_event_audit_log(event_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rfx_supplier_invitations','rfx_questions','rfx_event_audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''manager'',''developer'',''it_admin''));', t, t);
    IF t='rfx_event_audit_log' THEN
      EXECUTE format('CREATE POLICY %I_write ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin''));', t, t);
    ELSE
      EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin''));', t, t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_rfx_audit(
  p_event_id UUID,
  p_action TEXT,
  p_entity_table TEXT,
  p_entity_id UUID,
  p_old_value JSONB,
  p_new_value JSONB,
  p_comments TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_sourcing_event_in_tenant(p_event_id);
  INSERT INTO public.rfx_event_audit_log(tenant_id,event_id,actor_id,action,entity_table,entity_id,old_value,new_value,comments)
  VALUES (v_tenant,p_event_id,auth.uid(),p_action,p_entity_table,p_entity_id,p_old_value,p_new_value,p_comments)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_rfx_audit(UUID,TEXT,TEXT,UUID,JSONB,JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_suppliers_to_rfx(
  p_event_id UUID,
  p_supplier_ids UUID[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_supplier UUID;
  v_count INT := 0;
  v_email TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_sourcing_event_in_tenant(p_event_id);

  FOREACH v_supplier IN ARRAY p_supplier_ids LOOP
    PERFORM public.procurement_assert_supplier_in_tenant(v_supplier, true);
    SELECT COALESCE(email, (SELECT email FROM public.supplier_contacts c WHERE c.supplier_id=s.id AND c.tenant_id=v_tenant AND c.is_primary LIMIT 1))
      INTO v_email
    FROM public.suppliers s WHERE s.id=v_supplier AND s.tenant_id=v_tenant;
    IF v_email IS NULL THEN v_email := 'unknown@example.invalid'; END IF;

    INSERT INTO public.rfx_supplier_invitations(tenant_id,event_id,supplier_id,email,invited_by)
    VALUES (v_tenant,p_event_id,v_supplier,v_email,auth.uid())
    ON CONFLICT (tenant_id,event_id,supplier_id) DO UPDATE
      SET status='invited', invited_at=NOW(), invited_by=auth.uid(), expires_at=NOW()+INTERVAL '14 days';
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.sourcing_events SET issued_at=COALESCE(issued_at,NOW()), status='open', updated_at=NOW()
  WHERE id=p_event_id AND tenant_id=v_tenant;

  PERFORM public.log_rfx_audit(p_event_id,'suppliers_invited','rfx_supplier_invitations',p_event_id,NULL,jsonb_build_object('count',v_count),NULL);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.invite_suppliers_to_rfx(UUID,UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.answer_rfx_question(
  p_question_id UUID,
  p_answer TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_q FROM public.rfx_questions WHERE id=p_question_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUESTION_NOT_FOUND'; END IF;

  UPDATE public.rfx_questions
  SET answer=p_answer, answered_by=auth.uid(), answered_at=NOW(), status='answered'
  WHERE id=p_question_id AND tenant_id=v_tenant;

  PERFORM public.log_rfx_audit(v_q.event_id,'question_answered','rfx_questions',p_question_id,to_jsonb(v_q),jsonb_build_object('answer',p_answer),NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.answer_rfx_question(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_supplier_bid(
  p_bid_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_bid RECORD;
  v_event RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  SELECT * INTO v_bid FROM public.supplier_bids WHERE id=p_bid_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BID_NOT_FOUND'; END IF;

  SELECT * INTO v_event FROM public.sourcing_events WHERE id=v_bid.event_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;
  IF v_event.status NOT IN ('open','closed') THEN RAISE EXCEPTION 'EVENT_NOT_AWARDABLE'; END IF;

  UPDATE public.supplier_bids SET status='rejected' WHERE event_id=v_bid.event_id AND tenant_id=v_tenant AND id<>p_bid_id;
  UPDATE public.supplier_bids SET status='awarded' WHERE id=p_bid_id AND tenant_id=v_tenant;
  UPDATE public.sourcing_events
  SET status='awarded', awarded_bid_id=p_bid_id, award_supplier_id=v_bid.supplier_id, award_reason=p_reason, awarded_at=NOW(), updated_at=NOW()
  WHERE id=v_bid.event_id AND tenant_id=v_tenant;
  UPDATE public.rfx_supplier_invitations SET status='responded', bid_id=p_bid_id, responded_at=COALESCE(responded_at,NOW())
  WHERE event_id=v_bid.event_id AND supplier_id=v_bid.supplier_id AND tenant_id=v_tenant;

  PERFORM public.log_rfx_audit(v_bid.event_id,'bid_awarded','supplier_bids',p_bid_id,to_jsonb(v_event),jsonb_build_object('supplier_id',v_bid.supplier_id,'reason',p_reason),p_reason);
  RETURN v_bid.event_id;
END $$;
GRANT EXECUTE ON FUNCTION public.award_supplier_bid(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.sourcing_event_kpis
WITH (security_invoker = true) AS
SELECT
  se.tenant_id,
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE se.status='awarded') AS awarded_events,
  AVG(EXTRACT(EPOCH FROM (se.awarded_at - se.issued_at))/86400) FILTER (WHERE se.awarded_at IS NOT NULL AND se.issued_at IS NOT NULL) AS avg_cycle_days,
  AVG(inv.invited_count) AS avg_invited_suppliers,
  AVG(bids.bid_count) AS avg_bids_received
FROM public.sourcing_events se
LEFT JOIN LATERAL (SELECT COUNT(*) AS invited_count FROM public.rfx_supplier_invitations i WHERE i.event_id=se.id AND i.tenant_id=se.tenant_id) inv ON true
LEFT JOIN LATERAL (SELECT COUNT(*) AS bid_count FROM public.supplier_bids b WHERE b.event_id=se.id AND b.tenant_id=se.tenant_id) bids ON true
WHERE se.tenant_id=public.current_user_tenant_id()
GROUP BY se.tenant_id;
GRANT SELECT ON public.sourcing_event_kpis TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.rfx_supplier_invitations') IS NULL THEN RAISE EXCEPTION '0194 failed: invitations missing'; END IF;
  IF to_regclass('public.rfx_questions') IS NULL THEN RAISE EXCEPTION '0194 failed: questions missing'; END IF;
  IF to_regprocedure('public.award_supplier_bid(uuid,text)') IS NULL THEN RAISE EXCEPTION '0194 failed: award function missing'; END IF;
  RAISE NOTICE '✅ 0194: Strategic sourcing completion foundations applied';
END $$;
