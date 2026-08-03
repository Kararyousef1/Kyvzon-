-- ============================================================================
-- 0243 — Finance Unit 03: Period Close & Audit/GRC
-- docs/finance/03-period-close-audit-grc.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_period_close_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  accounting_period_id UUID NOT NULL REFERENCES public.accounting_periods(id) ON DELETE CASCADE,
  task_code TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  severity TEXT NOT NULL DEFAULT 'required' CHECK (severity IN ('required','recommended','blocking')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','waived')),
  evidence_ref TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  waived_at TIMESTAMPTZ,
  waived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  waiver_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(accounting_period_id, task_code)
);

CREATE INDEX IF NOT EXISTS idx_finance_period_close_tasks_period
  ON public.finance_period_close_tasks(accounting_period_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_finance_period_close_tasks_entity
  ON public.finance_period_close_tasks(legal_entity_id, status);

ALTER TABLE public.finance_period_close_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_period_close_tasks_select ON public.finance_period_close_tasks;
DROP POLICY IF EXISTS finance_period_close_tasks_insert ON public.finance_period_close_tasks;
DROP POLICY IF EXISTS finance_period_close_tasks_update ON public.finance_period_close_tasks;
CREATE POLICY finance_period_close_tasks_select ON public.finance_period_close_tasks
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_legal_entity(legal_entity_id));
CREATE POLICY finance_period_close_tasks_insert ON public.finance_period_close_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_period_close_tasks_update ON public.finance_period_close_tasks
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_legal_entity(legal_entity_id))
  WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));

CREATE OR REPLACE FUNCTION public.generate_finance_period_close_checklist(p_period_id UUID)
RETURNS SETOF public.finance_period_close_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_period public.accounting_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM public.accounting_periods WHERE id=p_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_period.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;

  INSERT INTO public.finance_period_close_tasks(tenant_id,legal_entity_id,accounting_period_id,task_code,title_ar,title_en,severity)
  SELECT v_period.tenant_id, v_period.legal_entity_id, v_period.id, task_code, title_ar, title_en, severity
  FROM (VALUES
    ('GL_BALANCED','التحقق من توازن قيود الفترة','Validate period journal entries are balanced','blocking'),
    ('NO_OPEN_JOURNALS','عدم وجود قيود مفتوحة غير مرحلة','No draft/submitted/approved journals remain','blocking'),
    ('TRIAL_BALANCE_REVIEW','مراجعة ميزان المراجعة','Review trial balance','required'),
    ('AP_AR_REVIEW','مراجعة أرصدة الذمم','Review AP/AR balances','required'),
    ('BANK_CASH_REVIEW','مراجعة النقد والبنوك','Review bank and cash balances','required'),
    ('AUDIT_TRAIL_REVIEW','مراجعة سجل التدقيق','Review finance audit trail','required')
  ) AS t(task_code,title_ar,title_en,severity)
  ON CONFLICT (accounting_period_id, task_code) DO NOTHING;

  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,after_data)
  VALUES(v_period.tenant_id,v_period.legal_entity_id,'period_close_checklist_generated','accounting_period',v_period.id,auth.uid(),jsonb_build_object('period_id',v_period.id));

  RETURN QUERY
  SELECT * FROM public.finance_period_close_tasks
  WHERE accounting_period_id=p_period_id
  ORDER BY CASE severity WHEN 'blocking' THEN 1 WHEN 'required' THEN 2 ELSE 3 END, task_code;
END $$;
REVOKE ALL ON FUNCTION public.generate_finance_period_close_checklist(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_finance_period_close_checklist(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_finance_close_task(p_task_id UUID,p_evidence_ref TEXT DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS public.finance_period_close_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_old public.finance_period_close_tasks%ROWTYPE; v_new public.finance_period_close_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.finance_period_close_tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLOSE_TASK_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  UPDATE public.finance_period_close_tasks
  SET status='completed', evidence_ref=NULLIF(btrim(COALESCE(p_evidence_ref,'')),''), notes=NULLIF(btrim(COALESCE(p_notes,'')),''), completed_at=NOW(), completed_by=auth.uid(), waived_at=NULL, waived_by=NULL, waiver_reason=NULL, updated_at=NOW()
  WHERE id=p_task_id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'period_close_task_completed','period_close_task',v_old.id,auth.uid(),to_jsonb(v_old),to_jsonb(v_new));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.complete_finance_close_task(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_finance_close_task(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.waive_finance_close_task(p_task_id UUID,p_reason TEXT)
RETURNS public.finance_period_close_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_old public.finance_period_close_tasks%ROWTYPE; v_new public.finance_period_close_tasks%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'WAIVER_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.finance_period_close_tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLOSE_TASK_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_old.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  UPDATE public.finance_period_close_tasks
  SET status='waived', waiver_reason=btrim(p_reason), waived_at=NOW(), waived_by=auth.uid(), completed_at=NULL, completed_by=NULL, updated_at=NOW()
  WHERE id=p_task_id RETURNING * INTO v_new;
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_old.tenant_id,v_old.legal_entity_id,'period_close_task_waived','period_close_task',v_old.id,auth.uid(),to_jsonb(v_old),to_jsonb(v_new));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.waive_finance_close_task(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.waive_finance_close_task(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_close_checklist_board WITH (security_invoker=true) AS
SELECT
  task.id, task.tenant_id, task.legal_entity_id, entity.code AS entity_code, entity.name_ar AS entity_name,
  task.accounting_period_id, period.name AS period_name, period.start_date, period.end_date, period.status AS period_status,
  task.task_code, task.title_ar, task.title_en, task.severity, task.status, task.evidence_ref, task.notes,
  task.completed_at, task.completed_by, completer.full_name AS completed_by_name,
  task.waived_at, task.waived_by, waiver.full_name AS waived_by_name, task.waiver_reason,
  task.created_at, task.updated_at
FROM public.finance_period_close_tasks task
JOIN public.accounting_periods period ON period.id=task.accounting_period_id
JOIN public.legal_entities entity ON entity.id=task.legal_entity_id
LEFT JOIN public.profiles completer ON completer.id=task.completed_by
LEFT JOIN public.profiles waiver ON waiver.id=task.waived_by
WHERE task.tenant_id=public.current_user_tenant_id()
ORDER BY period.start_date DESC, CASE task.severity WHEN 'blocking' THEN 1 WHEN 'required' THEN 2 ELSE 3 END, task.task_code;
GRANT SELECT ON public.finance_close_checklist_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_period_close_readiness WITH (security_invoker=true) AS
SELECT
  period.tenant_id,
  period.legal_entity_id,
  entity.code AS entity_code,
  entity.name_ar AS entity_name,
  period.fiscal_year_id,
  fy.name AS fiscal_year_name,
  period.id AS accounting_period_id,
  period.period_number,
  period.name AS period_name,
  period.start_date,
  period.end_date,
  period.status,
  period.locked_at,
  period.locked_by,
  COUNT(entry.id) FILTER (WHERE entry.status IN ('draft','submitted','approved'))::BIGINT AS open_journal_entries,
  COUNT(entry.id) FILTER (WHERE entry.total_debit<>entry.total_credit)::BIGINT AS unbalanced_entries,
  COUNT(task.id)::BIGINT AS checklist_tasks,
  COUNT(task.id) FILTER (WHERE task.severity IN ('blocking','required') AND task.status NOT IN ('completed','waived'))::BIGINT AS required_open_tasks,
  COUNT(task.id) FILTER (WHERE task.status='completed')::BIGINT AS completed_tasks,
  COUNT(task.id) FILTER (WHERE task.status='waived')::BIGINT AS waived_tasks,
  (
    COUNT(entry.id) FILTER (WHERE entry.status IN ('draft','submitted','approved')) = 0
    AND COUNT(entry.id) FILTER (WHERE entry.total_debit<>entry.total_credit) = 0
    AND COUNT(task.id) FILTER (WHERE task.severity IN ('blocking','required') AND task.status NOT IN ('completed','waived')) = 0
    AND COUNT(task.id) > 0
  ) AS ready_for_final_close
FROM public.accounting_periods period
JOIN public.legal_entities entity ON entity.id=period.legal_entity_id
JOIN public.fiscal_years fy ON fy.id=period.fiscal_year_id
LEFT JOIN public.journal_entries entry ON entry.accounting_period_id=period.id AND entry.legal_entity_id=period.legal_entity_id
LEFT JOIN public.finance_period_close_tasks task ON task.accounting_period_id=period.id
WHERE period.tenant_id=public.current_user_tenant_id()
GROUP BY period.tenant_id,period.legal_entity_id,entity.code,entity.name_ar,period.fiscal_year_id,fy.name,period.id,period.period_number,period.name,period.start_date,period.end_date,period.status,period.locked_at,period.locked_by
ORDER BY period.start_date DESC;
GRANT SELECT ON public.finance_period_close_readiness TO authenticated;

CREATE OR REPLACE FUNCTION public.close_accounting_period_controlled(p_period_id UUID,p_status TEXT,p_reason TEXT)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_period public.accounting_periods%ROWTYPE;
  v_required_open BIGINT;
  v_open_entries BIGINT;
  v_unbalanced BIGINT;
  v_new public.accounting_periods%ROWTYPE;
BEGIN
  IF p_status NOT IN ('soft_closed','closed') THEN RAISE EXCEPTION 'INVALID_CLOSE_STATUS'; END IF;
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'CLOSE_REASON_REQUIRED'; END IF;
  SELECT * INTO v_period FROM public.accounting_periods WHERE id=p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_period.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;

  PERFORM public.generate_finance_period_close_checklist(p_period_id);

  SELECT required_open_tasks, open_journal_entries, unbalanced_entries
  INTO v_required_open, v_open_entries, v_unbalanced
  FROM public.finance_period_close_readiness
  WHERE accounting_period_id=p_period_id;

  IF p_status='closed' AND (COALESCE(v_required_open,0)>0 OR COALESCE(v_open_entries,0)>0 OR COALESCE(v_unbalanced,0)>0) THEN
    RAISE EXCEPTION 'PERIOD_NOT_READY_FOR_FINAL_CLOSE';
  END IF;

  v_new := public.set_accounting_period_status(p_period_id,p_status,btrim(p_reason));
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_period.tenant_id,v_period.legal_entity_id,CASE WHEN p_status='closed' THEN 'period_final_close_controlled' ELSE 'period_soft_close_controlled' END,'accounting_period',v_period.id,auth.uid(),to_jsonb(v_period),jsonb_build_object('period',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.close_accounting_period_controlled(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_accounting_period_controlled(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period_controlled(p_period_id UUID,p_reason TEXT)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_period public.accounting_periods%ROWTYPE; v_new public.accounting_periods%ROWTYPE;
BEGIN
  IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'REOPEN_REASON_REQUIRED'; END IF;
  SELECT * INTO v_period FROM public.accounting_periods WHERE id=p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND'; END IF;
  IF NOT public.current_user_can_manage_legal_entity(v_period.legal_entity_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_ENTITY'; END IF;
  v_new := public.set_accounting_period_status(p_period_id,'open',btrim(p_reason));
  INSERT INTO public.finance_audit_events(tenant_id,legal_entity_id,event_type,aggregate_type,aggregate_id,actor_id,before_data,after_data)
  VALUES(v_period.tenant_id,v_period.legal_entity_id,'period_reopened_controlled','accounting_period',v_period.id,auth.uid(),to_jsonb(v_period),jsonb_build_object('period',to_jsonb(v_new),'reason',p_reason));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.reopen_accounting_period_controlled(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period_controlled(UUID,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.finance_audit_event_board WITH (security_invoker=true) AS
SELECT
  event.id, event.tenant_id, event.legal_entity_id, entity.code AS entity_code, entity.name_ar AS entity_name,
  event.event_type, event.aggregate_type, event.aggregate_id, event.actor_id, actor.full_name AS actor_name, actor.email AS actor_email,
  event.before_data, event.after_data, event.correlation_id, event.created_at
FROM public.finance_audit_events event
JOIN public.legal_entities entity ON entity.id=event.legal_entity_id
LEFT JOIN public.profiles actor ON actor.id=event.actor_id
WHERE event.tenant_id=public.current_user_tenant_id()
ORDER BY event.created_at DESC;
GRANT SELECT ON public.finance_audit_event_board TO authenticated;

CREATE OR REPLACE VIEW public.finance_grc_dashboard WITH (security_invoker=true) AS
SELECT
  entity.tenant_id,
  entity.id AS legal_entity_id,
  entity.code AS entity_code,
  entity.name_ar AS entity_name,
  COUNT(period.id) FILTER (WHERE period.status='open')::BIGINT AS open_periods,
  COUNT(period.id) FILTER (WHERE period.status='soft_closed')::BIGINT AS soft_closed_periods,
  COUNT(period.id) FILTER (WHERE period.status='closed')::BIGINT AS closed_periods,
  COUNT(readiness.accounting_period_id) FILTER (WHERE readiness.ready_for_final_close)::BIGINT AS periods_ready_for_close,
  COUNT(task.id) FILTER (WHERE task.status='open' AND task.severity IN ('blocking','required'))::BIGINT AS open_required_close_tasks,
  COUNT(audit.id) FILTER (WHERE audit.created_at >= NOW() - INTERVAL '7 days')::BIGINT AS audit_events_last_7_days
FROM public.legal_entities entity
LEFT JOIN public.accounting_periods period ON period.legal_entity_id=entity.id
LEFT JOIN public.finance_period_close_readiness readiness ON readiness.accounting_period_id=period.id
LEFT JOIN public.finance_period_close_tasks task ON task.legal_entity_id=entity.id
LEFT JOIN public.finance_audit_events audit ON audit.legal_entity_id=entity.id
WHERE entity.tenant_id=public.current_user_tenant_id()
GROUP BY entity.tenant_id,entity.id,entity.code,entity.name_ar
ORDER BY entity.code;
GRANT SELECT ON public.finance_grc_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.finance_period_close_tasks') IS NULL
     OR to_regclass('public.finance_period_close_readiness') IS NULL
     OR to_regclass('public.finance_close_checklist_board') IS NULL
     OR to_regclass('public.finance_audit_event_board') IS NULL
     OR to_regclass('public.finance_grc_dashboard') IS NULL
     OR to_regprocedure('public.generate_finance_period_close_checklist(uuid)') IS NULL
     OR to_regprocedure('public.complete_finance_close_task(uuid,text,text)') IS NULL
     OR to_regprocedure('public.waive_finance_close_task(uuid,text)') IS NULL
     OR to_regprocedure('public.close_accounting_period_controlled(uuid,text,text)') IS NULL
     OR to_regprocedure('public.reopen_accounting_period_controlled(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0243 failed: Finance period close/audit GRC objects missing';
  END IF;
  RAISE NOTICE '✅ 0243: Finance period close/audit GRC applied';
END $$;
