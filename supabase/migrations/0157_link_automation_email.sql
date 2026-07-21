-- ============================================================================
-- Kyvzon — 0157_link_automation_email.sql
-- ربط وحدة الأتمتة (1) بوحدة البريد (2): عند تنفيذ خطوة send_email في رحلة
-- أتمتة، إن كان للعميل (lead) مشترك بريد مرتبط، يُسجَّل الحدث في email_events
-- بمصدر 'automation' — فتظهر رسائل الأتمتة في تحليلات البريد تلقائياً.
--
-- يعيد تعريف advance_workflow_enrollment (نسخة مطابقة لـ0155 + سطر الربط).
-- الإرسال الخارجي الفعلي يبقى hook (delivery_mode='simulated') حتى مفتاح المزوّد.
-- idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.advance_workflow_enrollment(
  p_enrollment_id UUID,
  p_branch        TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     UUID;
  v_workflow   UUID;
  v_lead       UUID;
  v_current    UUID;
  v_step       RECORD;
  v_cap        INTEGER;
  v_sent_today INTEGER;
  v_next       UUID;
  v_next_wait  INTEGER;
  v_channel    TEXT;
  v_subscriber UUID;
BEGIN
  SELECT e.tenant_id, e.workflow_id, e.lead_id, e.current_step_id
    INTO v_tenant, v_workflow, v_lead, v_current
  FROM public.marketing_workflow_enrollments e
  WHERE e.id = p_enrollment_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'permission denied (tenant mismatch)';
  END IF;

  SELECT * INTO v_step FROM public.marketing_workflow_steps WHERE id = v_current;

  IF v_step.id IS NULL THEN
    UPDATE public.marketing_workflow_enrollments
       SET status = 'completed', completed_at = NOW(), next_run_at = NULL
     WHERE id = p_enrollment_id;
    RETURN 'completed';
  END IF;

  IF v_step.step_type = 'action' AND v_step.action_type IS NOT NULL THEN
    v_channel := CASE
      WHEN v_step.action_type = 'send_email'    THEN 'email'
      WHEN v_step.action_type = 'send_sms'      THEN 'sms'
      WHEN v_step.action_type = 'send_whatsapp' THEN 'whatsapp'
      WHEN v_step.action_type = 'internal_notification' THEN 'internal'
      ELSE 'crm'
    END;

    SELECT frequency_cap_per_day INTO v_cap FROM public.marketing_workflows WHERE id = v_workflow;
    IF v_cap IS NOT NULL AND v_channel IN ('email','sms','whatsapp') THEN
      SELECT count(*) INTO v_sent_today
      FROM public.marketing_action_log
      WHERE tenant_id = v_tenant AND lead_id = v_lead
        AND channel IN ('email','sms','whatsapp')
        AND created_at >= date_trunc('day', NOW());
      IF v_sent_today >= v_cap THEN
        UPDATE public.marketing_workflow_enrollments
           SET next_run_at = NOW() + interval '1 hour'
         WHERE id = p_enrollment_id;
        RETURN 'frequency_capped';
      END IF;
    END IF;

    INSERT INTO public.marketing_action_log
      (tenant_id, workflow_id, step_id, lead_id, action_type, channel, status, payload)
    VALUES
      (v_tenant, v_workflow, v_step.id, v_lead, v_step.action_type, v_channel,
       CASE WHEN v_channel IN ('email','sms','whatsapp') THEN 'simulated' ELSE 'sent' END,
       v_step.config);

    -- 🔗 الربط بوحدة البريد: إن كان الإجراء بريداً وللعميل مشترك بريد مرتبط،
    --    سجّل الحدث في email_events (source='automation') لتحليلات البريد الموحّدة.
    IF v_step.action_type = 'send_email' THEN
      SELECT id INTO v_subscriber
      FROM public.email_subscribers
      WHERE tenant_id = v_tenant AND lead_id = v_lead
        AND status = 'confirmed'
      LIMIT 1;
      IF v_subscriber IS NOT NULL THEN
        INSERT INTO public.email_events
          (tenant_id, subscriber_id, source, workflow_id, event_type, delivery_mode)
        VALUES (v_tenant, v_subscriber, 'automation', v_workflow, 'sent', 'simulated');
        INSERT INTO public.email_events
          (tenant_id, subscriber_id, source, workflow_id, event_type, delivery_mode)
        VALUES (v_tenant, v_subscriber, 'automation', v_workflow, 'delivered', 'simulated');
      END IF;
    END IF;

    -- أتمتة البيانات الداخلية (وسوم/مرحلة CRM)
    IF v_step.action_type = 'add_tag' AND v_step.config ? 'tag' THEN
      UPDATE public.marketing_leads
         SET tags = array_append(array_remove(tags, v_step.config->>'tag'), v_step.config->>'tag'), updated_at = NOW()
       WHERE id = v_lead;
    ELSIF v_step.action_type = 'remove_tag' AND v_step.config ? 'tag' THEN
      UPDATE public.marketing_leads
         SET tags = array_remove(tags, v_step.config->>'tag'), updated_at = NOW()
       WHERE id = v_lead;
    ELSIF v_step.action_type = 'change_pipeline_stage' AND v_step.config ? 'stage' THEN
      UPDATE public.marketing_leads
         SET pipeline_stage = v_step.config->>'stage', updated_at = NOW()
       WHERE id = v_lead AND (v_step.config->>'stage') IN ('not_contacted','contacted','negotiation','won','lost');
    END IF;
  END IF;

  IF v_step.step_type IN ('condition','branch') THEN
    IF p_branch = 'no' THEN v_next := v_step.next_step_no; ELSE v_next := v_step.next_step_yes; END IF;
  ELSE
    SELECT id INTO v_next
    FROM public.marketing_workflow_steps
    WHERE workflow_id = v_workflow AND step_order > v_step.step_order
    ORDER BY step_order ASC LIMIT 1;
  END IF;

  IF v_next IS NULL THEN
    UPDATE public.marketing_workflow_enrollments
       SET status = 'completed', completed_at = NOW(), current_step_id = NULL, next_run_at = NULL
     WHERE id = p_enrollment_id;
    RETURN 'completed';
  END IF;

  SELECT wait_hours INTO v_next_wait FROM public.marketing_workflow_steps WHERE id = v_next;
  UPDATE public.marketing_workflow_enrollments
     SET current_step_id = v_next,
         next_run_at = NOW() + (COALESCE(v_next_wait, 0) || ' hours')::interval
   WHERE id = p_enrollment_id;

  RETURN 'advanced';
END $$;

GRANT EXECUTE ON FUNCTION public.advance_workflow_enrollment(UUID, TEXT) TO authenticated;

-- ============================================================================
--  نهاية 0157_link_automation_email.sql
-- ============================================================================
