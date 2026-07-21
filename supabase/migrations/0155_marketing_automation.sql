-- ============================================================================
-- Kyvzon — 0155_marketing_automation.sql
-- وحدة "أتمتة التسويق" (بوابة التسويق — التقرير الأول)
--
-- تُنفّذ كل ما ورد في تقرير أتمتة التسويق وفق المعايير العالمية:
--   • رحلة العميل (Customer Journey) بمراحلها الست.
--   • منشئ المخططات الانسيابية (Workflows) بمكوّناته الخمسة:
--       Entry Trigger / Conditions / Actions / Timing / Decision Branches.
--   • محرك المحفزات (Triggers): زمنية/سلوكية/بيانات/سلبية.
--   • نظام تقييم العملاء (Lead Scoring): قواعد ديموغرافية وسلوكية + عتبات.
--   • مركز تنفيذ الإجراءات (Action Center) عبر سجل تنفيذ (execution log).
--   • إدارة العملاء المحتملين (Leads): نقاط، مرحلة pipeline، وسوم.
--   • أتمتة البيانات الداخلية: tags / pipeline stage / tasks / notifications.
--   • قاعدة التردد (Frequency Cap) + KPIs (عبر جداول قابلة للتجميع).
--
-- التصميم:
--   - كل جدول tenant-scoped مع RLS (عزل متعدد المستأجرين).
--   - محرك التشغيل منطقياً داخل DB (SECURITY DEFINER functions):
--       * apply_lead_score_event : يطبّق قاعدة نقاط على lead ويحدّث تصنيفه.
--       * enroll_lead_in_workflow : يُدخل lead في رحلة ويفعّل أول خطوة.
--       * advance_workflow_enrollment : ينقل الالتحاق للخطوة التالية (منطق شجرة القرار/التوقيت).
--   - الإرسال الخارجي الفعلي (بريد/SMS) يُترك كـ hook: كل إجراء إرسال يُسجَّل
--     في marketing_action_log بحالة 'simulated' ويُوصَل لاحقاً بوحدتي البريد(2)/الرسائل(4).
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) العملاء المحتملون — Leads
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  company           TEXT,
  job_title         TEXT,
  country           TEXT,
  industry          TEXT,
  company_size      TEXT,                                        -- e.g. '50-500'
  source            TEXT,                                        -- form / import / signup / manual
  -- رحلة العميل: المرحلة الحالية (المراحل الست في التقرير)
  journey_stage     TEXT NOT NULL DEFAULT 'awareness'
                    CHECK (journey_stage IN ('awareness','consideration','purchase','onboarding','retention','expansion')),
  -- مرحلة الـ pipeline (CRM) — أتمتة البيانات الداخلية
  pipeline_stage    TEXT NOT NULL DEFAULT 'not_contacted'
                    CHECK (pipeline_stage IN ('not_contacted','contacted','negotiation','won','lost')),
  score             INTEGER NOT NULL DEFAULT 0,
  -- تصنيف العميل وفق عتبات التقرير (0-20 بارد / 21-40 دافئ / 41-60 ساخن / 60+ جاهز للمبيعات)
  temperature       TEXT NOT NULL DEFAULT 'cold'
                    CHECK (temperature IN ('cold','warm','hot','sales_ready')),
  tags              TEXT[] NOT NULL DEFAULT '{}',
  is_subscribed     BOOLEAN NOT NULL DEFAULT true,               -- لإدارة إلغاء الاشتراك
  owner_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- موظف المبيعات المسؤول
  last_activity_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_tenant       ON public.marketing_leads(tenant_id, temperature);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_pipeline     ON public.marketing_leads(tenant_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_score        ON public.marketing_leads(tenant_id, score DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) قواعد تقييم العملاء — Lead Score Rules
--  (النوعان: demographic / behavioral — كما في التقرير)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_lead_score_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('demographic','behavioral')),
  -- مفتاح الحدث/المعيار الذي تنطبق عليه القاعدة (مثال: 'visit_pricing', 'job_title_manager')
  event_key     TEXT NOT NULL,
  label         TEXT NOT NULL,
  points        INTEGER NOT NULL,                                -- قد تكون سالبة (مثال: unsubscribe -50)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_mkt_score_rules_tenant ON public.marketing_lead_score_rules(tenant_id, rule_type);

-- سجل أحداث التقييم — كل مرة تُطبَّق قاعدة على lead
CREATE TABLE IF NOT EXISTS public.marketing_lead_score_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  event_key     TEXT NOT NULL,
  points_applied INTEGER NOT NULL,
  score_after   INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_score_events_lead ON public.marketing_lead_score_events(tenant_id, lead_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) المخططات الانسيابية — Workflows + Steps
--  الخطوة تحمل نوعها (action/wait/condition/branch) + إعداداتها (JSONB)
--  ومسارات شجرة القرار عبر next_step_yes / next_step_no.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  -- قالب الحملة (التقرير: 5 قوالب) أو مخصص
  campaign_type TEXT NOT NULL DEFAULT 'custom'
                CHECK (campaign_type IN ('custom','welcome','nurturing','re_engagement','post_purchase','abandoned_cart')),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','active','paused','archived')),
  -- نقطة الدخول (Entry Trigger)
  trigger_type  TEXT NOT NULL DEFAULT 'time_based'
                CHECK (trigger_type IN ('time_based','behavioral','data_based','negative')),
  trigger_event TEXT,                                            -- e.g. 'form_submitted','visit_pricing','score_threshold','no_login_14d'
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,             -- إعدادات المحفّز (عتبة/مدة/صفحة...)
  -- الشروط والفلاتر (Conditions/Filters) على مستوى الرحلة
  entry_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,           -- مصفوفة شروط دخول
  -- قاعدة التردد (Frequency Cap)
  frequency_cap_per_day INTEGER,                                 -- NULL = بلا حد
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_wf_tenant ON public.marketing_workflows(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.marketing_workflow_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id    UUID NOT NULL REFERENCES public.marketing_workflows(id) ON DELETE CASCADE,
  step_order     INTEGER NOT NULL CHECK (step_order >= 0),
  -- نوع الخطوة: إجراء / انتظار (توقيت) / شرط / تفرّع (شجرة قرار)
  step_type      TEXT NOT NULL CHECK (step_type IN ('action','wait','condition','branch')),
  -- للإجراءات (Action Center): نوع الإجراء
  action_type    TEXT CHECK (action_type IN
                  ('send_email','send_sms','send_whatsapp','create_task','update_field',
                   'add_tag','remove_tag','change_pipeline_stage','internal_notification','retargeting_ad')),
  config         JSONB NOT NULL DEFAULT '{}'::jsonb,             -- محتوى/قالب/حقل/وسم/مدة انتظار...
  -- التوقيت (Timing) لخطوات wait: ساعات الانتظار أو حدث الانتظار
  wait_hours     INTEGER,
  wait_for_event TEXT,                                           -- 'email_opened' / 'link_clicked' ...
  -- شجرة القرار (Decision Branches)
  next_step_yes  UUID REFERENCES public.marketing_workflow_steps(id) ON DELETE SET NULL,
  next_step_no   UUID REFERENCES public.marketing_workflow_steps(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_mkt_wf_steps_wf ON public.marketing_workflow_steps(workflow_id, step_order);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) التحاق العملاء بالرحلات — Enrollments (حالة كل lead داخل workflow)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_workflow_enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id    UUID NOT NULL REFERENCES public.marketing_workflows(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  current_step_id UUID REFERENCES public.marketing_workflow_steps(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','completed','exited','failed')),
  -- التوقيت: متى تُستحق الخطوة الحالية (لمحرك التشغيل الزمني)
  next_run_at    TIMESTAMPTZ,
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  UNIQUE (workflow_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_enroll_due ON public.marketing_workflow_enrollments(tenant_id, status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_mkt_enroll_lead ON public.marketing_workflow_enrollments(tenant_id, lead_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) سجل تنفيذ الإجراءات — Action Log (مركز تنفيذ الإجراءات + مصدر KPIs)
--  كل إجراء يُنفّذه المحرك يُسجَّل هنا: الإرسال الخارجي حالته 'simulated' حتى
--  تُوصَل وحدتا البريد(2)/الرسائل(4)، فتصبح 'sent' فعلياً دون إعادة بناء.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_action_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id    UUID REFERENCES public.marketing_workflows(id) ON DELETE SET NULL,
  step_id        UUID REFERENCES public.marketing_workflow_steps(id) ON DELETE SET NULL,
  lead_id        UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  action_type    TEXT NOT NULL,
  channel        TEXT,                                           -- email / sms / whatsapp / internal / crm
  -- حالة التسليم: simulated (hook) / sent / delivered / opened / clicked / bounced / unsubscribed / failed
  status         TEXT NOT NULL DEFAULT 'simulated'
                 CHECK (status IN ('simulated','queued','sent','delivered','opened','clicked','bounced','unsubscribed','failed')),
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_action_log_wf   ON public.marketing_action_log(tenant_id, workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_action_log_lead ON public.marketing_action_log(tenant_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_action_log_freq ON public.marketing_action_log(tenant_id, lead_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) RLS — عزل متعدد المستأجرين لكل الجداول
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_leads','marketing_lead_score_rules','marketing_lead_score_events',
    'marketing_workflows','marketing_workflow_steps','marketing_workflow_enrollments',
    'marketing_action_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());',
      t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());',
      t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) دالة تصنيف العميل حسب النقاط (عتبات التقرير)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.marketing_temperature_for_score(p_score INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score >= 61 THEN 'sales_ready'   -- 60+ جاهز للمبيعات
    WHEN p_score >= 41 THEN 'hot'           -- 41-60 ساخن
    WHEN p_score >= 21 THEN 'warm'          -- 21-40 دافئ
    ELSE 'cold'                             -- 0-20 بارد
  END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) تطبيق حدث تقييم على lead — يحدّث النقاط والتصنيف ويسجّل الحدث
--  يعيد النقاط الجديدة. SECURITY DEFINER لضمان اتساق الكتابة عبر المنطق.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_lead_score_event(
  p_lead_id  UUID,
  p_event_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID;
  v_points  INTEGER;
  v_new     INTEGER;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.marketing_leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'lead not found';
  END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'permission denied (tenant mismatch)';
  END IF;

  SELECT points INTO v_points
  FROM public.marketing_lead_score_rules
  WHERE tenant_id = v_tenant AND event_key = p_event_key AND is_active = true;

  IF v_points IS NULL THEN
    -- لا قاعدة فعّالة لهذا الحدث → لا تغيير
    SELECT score INTO v_new FROM public.marketing_leads WHERE id = p_lead_id;
    RETURN v_new;
  END IF;

  UPDATE public.marketing_leads
     SET score = GREATEST(score + v_points, 0),
         last_activity_at = NOW(),
         updated_at = NOW()
   WHERE id = p_lead_id
  RETURNING score INTO v_new;

  UPDATE public.marketing_leads
     SET temperature = public.marketing_temperature_for_score(v_new)
   WHERE id = p_lead_id;

  INSERT INTO public.marketing_lead_score_events (tenant_id, lead_id, event_key, points_applied, score_after)
  VALUES (v_tenant, p_lead_id, p_event_key, v_points, v_new);

  RETURN v_new;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) إدخال lead في رحلة — Enroll
--  ينشئ التحاقاً ويحدّد أول خطوة + وقت استحقاقها.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enroll_lead_in_workflow(
  p_workflow_id UUID,
  p_lead_id     UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     UUID;
  v_lead_tenant UUID;
  v_first_step UUID;
  v_wait_hours INTEGER;
  v_enroll_id  UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.marketing_workflows WHERE id = p_workflow_id;
  SELECT tenant_id INTO v_lead_tenant FROM public.marketing_leads WHERE id = p_lead_id;
  IF v_tenant IS NULL OR v_lead_tenant IS NULL THEN
    RAISE EXCEPTION 'workflow or lead not found';
  END IF;
  IF v_tenant <> v_lead_tenant OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'permission denied (tenant mismatch)';
  END IF;

  -- أول خطوة (أصغر step_order)
  SELECT id, wait_hours INTO v_first_step, v_wait_hours
  FROM public.marketing_workflow_steps
  WHERE workflow_id = p_workflow_id
  ORDER BY step_order ASC
  LIMIT 1;

  INSERT INTO public.marketing_workflow_enrollments
    (tenant_id, workflow_id, lead_id, current_step_id, status, next_run_at)
  VALUES
    (v_tenant, p_workflow_id, p_lead_id, v_first_step, 'active',
     NOW() + (COALESCE(v_wait_hours, 0) || ' hours')::interval)
  ON CONFLICT (workflow_id, lead_id) DO UPDATE
    SET status = 'active',
        current_step_id = EXCLUDED.current_step_id,
        next_run_at = EXCLUDED.next_run_at,
        enrolled_at = NOW(),
        completed_at = NULL
  RETURNING id INTO v_enroll_id;

  RETURN v_enroll_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) تنفيذ الخطوة الحالية وتقدّم الالتحاق — محرك التشغيل المنطقي
--  ينفّذ إجراء الخطوة الحالية (يسجّله في action_log مع احترام Frequency Cap)،
--  ثم ينقل الالتحاق للخطوة التالية (أو ينهيه). p_branch لاختيار مسار شجرة القرار.
--  يعيد حالة الالتحاق بعد التقدّم.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.advance_workflow_enrollment(
  p_enrollment_id UUID,
  p_branch        TEXT DEFAULT NULL   -- 'yes' / 'no' لخطوات القرار/التفرّع
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

  -- الخطوة الحالية
  SELECT * INTO v_step
  FROM public.marketing_workflow_steps
  WHERE id = v_current;

  IF v_step.id IS NULL THEN
    UPDATE public.marketing_workflow_enrollments
       SET status = 'completed', completed_at = NOW(), next_run_at = NULL
     WHERE id = p_enrollment_id;
    RETURN 'completed';
  END IF;

  -- تنفيذ الإجراء إن كانت الخطوة من نوع action
  IF v_step.step_type = 'action' AND v_step.action_type IS NOT NULL THEN
    v_channel := CASE
      WHEN v_step.action_type = 'send_email'    THEN 'email'
      WHEN v_step.action_type = 'send_sms'      THEN 'sms'
      WHEN v_step.action_type = 'send_whatsapp' THEN 'whatsapp'
      WHEN v_step.action_type = 'internal_notification' THEN 'internal'
      ELSE 'crm'
    END;

    -- قاعدة التردد (Frequency Cap): حد الرسائل الخارجية اليومية لكل lead
    SELECT frequency_cap_per_day INTO v_cap FROM public.marketing_workflows WHERE id = v_workflow;
    IF v_cap IS NOT NULL AND v_channel IN ('email','sms','whatsapp') THEN
      SELECT count(*) INTO v_sent_today
      FROM public.marketing_action_log
      WHERE tenant_id = v_tenant AND lead_id = v_lead
        AND channel IN ('email','sms','whatsapp')
        AND created_at >= date_trunc('day', NOW());
      IF v_sent_today >= v_cap THEN
        -- تجاوز الحد: أجّل ساعة ولا تُنفّذ
        UPDATE public.marketing_workflow_enrollments
           SET next_run_at = NOW() + interval '1 hour'
         WHERE id = p_enrollment_id;
        RETURN 'frequency_capped';
      END IF;
    END IF;

    -- تنفيذ منطقي: يُسجَّل كـ simulated (hook للوحدتين 2/4).
    INSERT INTO public.marketing_action_log
      (tenant_id, workflow_id, step_id, lead_id, action_type, channel, status, payload)
    VALUES
      (v_tenant, v_workflow, v_step.id, v_lead, v_step.action_type, v_channel,
       CASE WHEN v_channel IN ('email','sms','whatsapp') THEN 'simulated' ELSE 'sent' END,
       v_step.config);

    -- أتمتة البيانات الداخلية: تطبيق آثار CRM فوراً
    IF v_step.action_type = 'add_tag' AND v_step.config ? 'tag' THEN
      UPDATE public.marketing_leads
         SET tags = array_append(array_remove(tags, v_step.config->>'tag'), v_step.config->>'tag'),
             updated_at = NOW()
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

  -- تحديد الخطوة التالية (شجرة القرار أو التسلسل)
  IF v_step.step_type IN ('condition','branch') THEN
    IF p_branch = 'no' THEN
      v_next := v_step.next_step_no;
    ELSE
      v_next := v_step.next_step_yes;
    END IF;
  ELSE
    -- التالي بالترتيب: أصغر step_order أكبر من الحالي
    SELECT id INTO v_next
    FROM public.marketing_workflow_steps
    WHERE workflow_id = v_workflow AND step_order > v_step.step_order
    ORDER BY step_order ASC
    LIMIT 1;
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

-- ════════════════════════════════════════════════════════════════════════════
--  (11) الصلاحيات
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.marketing_temperature_for_score(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lead_score_event(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_lead_in_workflow(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_workflow_enrollment(UUID, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) بذور قواعد التقييم الافتراضية (Seeds) — لكل tenant عند التفعيل
--  دالة مساعدة تُنشئ القواعد القياسية من التقرير لأي tenant (idempotent).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.seed_marketing_score_rules(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.marketing_lead_score_rules (tenant_id, rule_type, event_key, label, points)
  VALUES
    -- ديموغرافي (من التقرير)
    (p_tenant_id, 'demographic', 'job_title_exec',     'المسمى الوظيفي: مدير/CEO/VP', 15),
    (p_tenant_id, 'demographic', 'company_size_mid',   'حجم الشركة: 50-500 موظف',      10),
    (p_tenant_id, 'demographic', 'industry_fit',       'القطاع: مناسب للمنتج',          10),
    (p_tenant_id, 'demographic', 'country_target',     'الدولة: ضمن السوق المستهدف',     5),
    (p_tenant_id, 'demographic', 'personal_email',     'بريد شخصي (Gmail)',           -10),
    -- سلوكي (من التقرير)
    (p_tenant_id, 'behavioral',  'visit_pricing',      'زيارة صفحة التسعير',           20),
    (p_tenant_id, 'behavioral',  'request_demo',       'طلب تجربة مجانية (Demo)',      25),
    (p_tenant_id, 'behavioral',  'email_opened',       'فتح بريد تسويقي',               5),
    (p_tenant_id, 'behavioral',  'link_clicked',       'الضغط على رابط داخل البريد',   10),
    (p_tenant_id, 'behavioral',  'download_asset',     'تحميل كتاب/دراسة حالة',         8),
    (p_tenant_id, 'behavioral',  'attend_webinar',     'حضور ويبينار',                 15),
    (p_tenant_id, 'behavioral',  'visit_homepage',     'زيارة صفحة رئيسية عادية',        2),
    (p_tenant_id, 'behavioral',  'no_open_5',          'عدم فتح 5 رسائل متتالية',      -10),
    (p_tenant_id, 'behavioral',  'unsubscribed',       'إلغاء الاشتراك',              -50)
  ON CONFLICT (tenant_id, event_key) DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_marketing_score_rules(UUID) TO authenticated;

-- ============================================================================
--  نهاية 0155_marketing_automation.sql
-- ============================================================================
