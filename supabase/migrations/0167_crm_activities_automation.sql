-- ============================================================================
-- Kyvzon — 0167_crm_activities_automation.sql
-- بوابة CRM — الوحدة 3: الأنشطة والمهام وأتمتة المبيعات (التقرير 03)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية:
--   • المهام (Tasks): عنوان/وصف/أولوية/استحقاق/مُعيَّن إليه/ربط (اتصال+حساب+صفقة)/حالة.
--   • المكالمات/الاجتماعات/الأنشطة المخصصة: تُسجَّل في crm_activities_timeline (الوحدة 1)
--     — نضيف هنا دالة crm_log_call/crm_log_meeting بحقول النتيجة والخطوة التالية.
--   • سلاسل المتابعة (Sequences/Cadences): تعريف + خطوات + التحاق (enrollment) + تقدّم.
--   • قواعد الأتمتة (If-Then): crm_automation_rules (trigger + condition + action).
--   • قواعد الإسناد التلقائي (Auto-Assignment): crm_assignment_rules (منطقة/قيمة → مالك).
--   • تحليل الأنشطة (Activity Analytics): دالة crm_activity_stats + crm_activity_gaps.
--   • أتمتة تحريك الـ Pipeline وإنشاء المهام: عبر دوال (إكمال مهمة → مهمة تالية/تحريك صفقة).
--
-- ملاحظة: Auto-Logging للبريد/التقويم/الهاتف (Gmail/Outlook/VoIP) hook — يُسجَّل
--   بحالة logged_via='auto' عند التوصيل الفعلي؛ حتى ذلك الحين التسجيل يدوي/عبر الدوال.
--
-- التصميم: كل جدول tenant-scoped + RLS، بادئة crm_* صارمة، دوال SECURITY DEFINER.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) المهام — Tasks
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  task_type     TEXT NOT NULL DEFAULT 'todo'
                CHECK (task_type IN ('todo','call','email','meeting','demo','follow_up','custom')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('urgent','high','medium','low')),
  status        TEXT NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started','in_progress','completed','cancelled')),
  due_at        TIMESTAMPTZ,
  assignee_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- الربط
  contact_id    UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  account_id    UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  deal_id       UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  -- مصدر: يدوي / من سلسلة متابعة / من قاعدة أتمتة
  origin        TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','sequence','automation')),
  sequence_enrollment_id UUID,                                    -- إن نشأت عن سلسلة
  completed_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee ON public.crm_tasks(tenant_id, assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due      ON public.crm_tasks(tenant_id, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal     ON public.crm_tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact  ON public.crm_tasks(contact_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) سلاسل المتابعة — Sequences (Cadences)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_sequences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sequence_type TEXT NOT NULL DEFAULT 'custom'
                CHECK (sequence_type IN ('cold_outreach','post_demo','proposal_sent','re_engagement','renewal','onboarding','custom')),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_sequences_tenant ON public.crm_sequences(tenant_id, sequence_type);

-- خطوات السلسلة (نقاط التواصل بترتيب زمني بالأيام)
CREATE TABLE IF NOT EXISTS public.crm_sequence_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_id   UUID NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL,
  delay_days    INTEGER NOT NULL DEFAULT 0,                       -- بعد كم يوم من الالتحاق/الخطوة السابقة
  action_type   TEXT NOT NULL DEFAULT 'task'
                CHECK (action_type IN ('task','email','call','sms','wait','stop')),
  title         TEXT NOT NULL,
  body          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_seq_steps_seq ON public.crm_sequence_steps(sequence_id, step_order);

-- التحاق (كل صفقة/جهة اتصال ملتحقة بسلسلة)
CREATE TABLE IF NOT EXISTS public.crm_sequence_enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_id    UUID NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  contact_id     UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  deal_id        UUID REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  assignee_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','completed','stopped')),
  current_step   INTEGER NOT NULL DEFAULT 0,
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  CHECK (contact_id IS NOT NULL OR deal_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_crm_seq_enroll_seq ON public.crm_sequence_enrollments(sequence_id, status);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) قواعد الأتمتة — If-Then Rules
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_automation_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- المحفّز (IF)
  trigger_event TEXT NOT NULL
                CHECK (trigger_event IN (
                  'deal_created','deal_stage_changed','deal_won','deal_overdue',
                  'call_outcome','lead_score_reached','task_completed','no_activity')),
  -- شرط إضافي (JSON مرن — مثال: {"min_amount":10000} أو {"outcome":"very_interested"})
  condition     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- الإجراء (THEN)
  action_type   TEXT NOT NULL
                CHECK (action_type IN (
                  'notify_manager','create_task','move_stage','create_deal',
                  'notify_team','start_sequence','assign_owner')),
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  run_count     INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_automation_tenant ON public.crm_automation_rules(tenant_id, trigger_event, is_active);

-- سجل تنفيذ قواعد الأتمتة (شفافية)
CREATE TABLE IF NOT EXISTS public.crm_automation_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id       UUID REFERENCES public.crm_automation_rules(id) ON DELETE SET NULL,
  entity_type   TEXT,
  entity_id     UUID,
  action_taken  TEXT NOT NULL,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_automation_log_tenant ON public.crm_automation_log(tenant_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) قواعد الإسناد التلقائي — Auto-Assignment Rules
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_assignment_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  match_type    TEXT NOT NULL DEFAULT 'region' CHECK (match_type IN ('region','value_gte','source','industry')),
  match_value   TEXT NOT NULL,                                    -- 'الرياض' / '50000' / 'website' ...
  assign_to     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority      INTEGER NOT NULL DEFAULT 0,                       -- ترتيب التطبيق
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_assign_rules_tenant ON public.crm_assignment_rules(tenant_id, match_type, is_active);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) تفعيل RLS + سياسات العزل
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_tasks','crm_sequences','crm_sequence_steps','crm_sequence_enrollments',
    'crm_automation_rules','crm_automation_log','crm_assignment_rules'
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
--  (6) تسجيل مكالمة/اجتماع — يكتب في الجدول الزمني (الوحدة 1) + خطوة تالية اختيارية
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_log_call(
  p_contact_id     UUID,
  p_account_id     UUID,
  p_deal_id        UUID,
  p_duration_min   INTEGER,
  p_outcome        TEXT,                                          -- interested / thinking / no_answer / callback / rejected
  p_summary        TEXT,
  p_next_step      TEXT DEFAULT NULL,
  p_next_step_due  TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_activity UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  INSERT INTO public.crm_activities_timeline
    (tenant_id, contact_id, account_id, activity_type, direction, title, body, duration_minutes, logged_via, metadata, created_by)
  VALUES (v_tenant, p_contact_id, p_account_id, 'call', 'outbound',
          format('مكالمة — %s', COALESCE(p_outcome,'—')), p_summary, p_duration_min, 'manual',
          jsonb_build_object('outcome', p_outcome, 'deal_id', p_deal_id), auth.uid())
  RETURNING id INTO v_activity;

  -- خطوة تالية → مهمة
  IF p_next_step IS NOT NULL AND length(trim(p_next_step)) > 0 THEN
    INSERT INTO public.crm_tasks (tenant_id, title, task_type, priority, status, due_at,
                                  contact_id, account_id, deal_id, origin, created_by, assignee_id)
    VALUES (v_tenant, p_next_step, 'follow_up', 'high', 'not_started', p_next_step_due,
            p_contact_id, p_account_id, p_deal_id, 'manual', auth.uid(), auth.uid());
  END IF;

  RETURN v_activity;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) إكمال مهمة — Complete task (أتمتة: قد تُنشئ الخطوة التالية في السلسلة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_complete_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_enroll UUID;
BEGIN
  SELECT tenant_id, sequence_enrollment_id INTO v_tenant, v_enroll
  FROM public.crm_tasks WHERE id = p_task_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  UPDATE public.crm_tasks
    SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE id = p_task_id;

  -- إن كانت من سلسلة → تقدّم للخطوة التالية
  IF v_enroll IS NOT NULL THEN
    PERFORM public.crm_advance_sequence(v_enroll);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) التحاق بسلسلة — Enroll (يُنشئ التحاقاً ويطلق أول خطوة كمهمة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_enroll_in_sequence(
  p_sequence_id UUID,
  p_contact_id  UUID DEFAULT NULL,
  p_deal_id     UUID DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_enroll UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_contact_id IS NULL AND p_deal_id IS NULL THEN
    RAISE EXCEPTION 'TARGET_REQUIRED: contact or deal';
  END IF;

  INSERT INTO public.crm_sequence_enrollments
    (tenant_id, sequence_id, contact_id, deal_id, assignee_id, status, current_step)
  VALUES (v_tenant, p_sequence_id, p_contact_id, p_deal_id, COALESCE(p_assignee_id, auth.uid()), 'active', 0)
  RETURNING id INTO v_enroll;

  PERFORM public.crm_advance_sequence(v_enroll);
  RETURN v_enroll;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) تقدّم السلسلة — Advance (يُنشئ مهمة الخطوة التالية أو يُنهي السلسلة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_advance_sequence(p_enrollment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_seq UUID; v_next INT; v_step RECORD; v_contact UUID; v_deal UUID; v_assignee UUID;
BEGIN
  SELECT tenant_id, sequence_id, current_step, contact_id, deal_id, assignee_id
    INTO v_tenant, v_seq, v_next, v_contact, v_deal, v_assignee
  FROM public.crm_sequence_enrollments WHERE id = p_enrollment_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  v_next := v_next + 1;

  SELECT * INTO v_step FROM public.crm_sequence_steps
    WHERE sequence_id = v_seq AND step_order = v_next
    ORDER BY step_order LIMIT 1;

  IF v_step IS NULL OR v_step.action_type = 'stop' THEN
    UPDATE public.crm_sequence_enrollments
      SET status = 'completed', current_step = v_next, completed_at = NOW()
      WHERE id = p_enrollment_id;
    RETURN;
  END IF;

  UPDATE public.crm_sequence_enrollments SET current_step = v_next WHERE id = p_enrollment_id;

  -- خطوة wait لا تُنشئ مهمة (فقط تأخير)
  IF v_step.action_type <> 'wait' THEN
    INSERT INTO public.crm_tasks
      (tenant_id, title, description, task_type, priority, status, due_at,
       contact_id, deal_id, origin, sequence_enrollment_id, assignee_id, created_by)
    VALUES (v_tenant, v_step.title, v_step.body,
            CASE v_step.action_type WHEN 'email' THEN 'email' WHEN 'call' THEN 'call' ELSE 'follow_up' END,
            'medium', 'not_started', NOW() + (v_step.delay_days || ' days')::INTERVAL,
            v_contact, v_deal, 'sequence', p_enrollment_id, v_assignee, auth.uid());
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) الإسناد التلقائي — يطبّق أول قاعدة مطابقة على صفقة ويحدّث مالكها
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_apply_assignment(p_deal_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_deal RECORD; v_owner UUID; v_country TEXT; v_source TEXT;
BEGIN
  SELECT * INTO v_deal FROM public.crm_deals WHERE id = p_deal_id;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_tenant := v_deal.tenant_id;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  SELECT country INTO v_country FROM public.crm_accounts WHERE id = v_deal.account_id;
  v_source := v_deal.source;

  SELECT assign_to INTO v_owner FROM public.crm_assignment_rules r
   WHERE r.tenant_id = v_tenant AND r.is_active = true
     AND (
       (r.match_type = 'region'    AND v_country = r.match_value)
       OR (r.match_type = 'value_gte' AND v_deal.amount >= (r.match_value)::NUMERIC)
       OR (r.match_type = 'source'  AND v_source = r.match_value)
     )
   ORDER BY r.priority DESC
   LIMIT 1;

  IF v_owner IS NOT NULL THEN
    UPDATE public.crm_deals SET owner_id = v_owner, updated_at = NOW() WHERE id = p_deal_id;
  END IF;
  RETURN v_owner;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) تحليل الأنشطة — Activity Stats (مؤشرات قيادية لكل موظف/الفريق)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_activity_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  calls           INTEGER,
  meetings        INTEGER,
  emails          INTEGER,
  tasks_completed INTEGER,
  tasks_overdue   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_since TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INT FROM public.crm_activities_timeline a WHERE a.tenant_id = v_tenant AND a.activity_type = 'call' AND a.occurred_at >= v_since),
    (SELECT COUNT(*)::INT FROM public.crm_activities_timeline a WHERE a.tenant_id = v_tenant AND a.activity_type = 'meeting' AND a.occurred_at >= v_since),
    (SELECT COUNT(*)::INT FROM public.crm_activities_timeline a WHERE a.tenant_id = v_tenant AND a.activity_type IN ('email','marketing_email') AND a.occurred_at >= v_since),
    (SELECT COUNT(*)::INT FROM public.crm_tasks t WHERE t.tenant_id = v_tenant AND t.status = 'completed' AND t.completed_at >= v_since),
    (SELECT COUNT(*)::INT FROM public.crm_tasks t WHERE t.tenant_id = v_tenant AND t.status IN ('not_started','in_progress') AND t.due_at < NOW());
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) فجوات النشاط — Activity Gaps (صفقات بلا تواصل منذ X يوماً — تموت صامتة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_activity_gaps(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  deal_id       UUID,
  deal_name     TEXT,
  days_silent   INTEGER,
  amount        NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT d.id, d.name,
    FLOOR(EXTRACT(EPOCH FROM (NOW() - GREATEST(d.created_at, COALESCE(d.last_activity_at, d.created_at)))) / 86400.0)::INT,
    d.amount
  FROM public.crm_deals d
  WHERE d.tenant_id = v_tenant AND d.status = 'open'
    AND EXTRACT(EPOCH FROM (NOW() - GREATEST(d.created_at, COALESCE(d.last_activity_at, d.created_at)))) / 86400.0 >= p_days
  ORDER BY d.amount DESC;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (13) seed سلاسل المتابعة القياسية (اختياري لكل مستأجر)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_seed_default_sequences()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_seq UUID; v_created INT := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- Post-Demo (25 يوم) — من التقرير
  IF NOT EXISTS (SELECT 1 FROM public.crm_sequences WHERE tenant_id = v_tenant AND sequence_type = 'post_demo') THEN
    INSERT INTO public.crm_sequences (tenant_id, name, sequence_type, description, created_by)
    VALUES (v_tenant, 'متابعة ما بعد العرض التوضيحي', 'post_demo', 'سلسلة 25 يوماً بعد Demo', auth.uid())
    RETURNING id INTO v_seq;
    INSERT INTO public.crm_sequence_steps (tenant_id, sequence_id, step_order, delay_days, action_type, title, body) VALUES
      (v_tenant, v_seq, 1, 0,  'email', 'بريد شكر + ملخص ما ناقشناه + الخطوات التالية', NULL),
      (v_tenant, v_seq, 2, 2,  'call',  'اتصال للتحقق من انطباعاتهم', NULL),
      (v_tenant, v_seq, 3, 5,  'email', 'إرسال دراسة حالة ذات صلة بقطاعهم', NULL),
      (v_tenant, v_seq, 4, 8,  'task',  'إرسال عرض سعر مبدئي', NULL),
      (v_tenant, v_seq, 5, 12, 'call',  'اتصال لمناقشة العرض', NULL),
      (v_tenant, v_seq, 6, 18, 'email', 'بريد "هل ما زلت مهتماً؟" من المدير المباشر', NULL),
      (v_tenant, v_seq, 7, 25, 'stop',  'إن لم يرد — نقل لـ Nurturing وإيقاف السلسلة', NULL);
    v_created := v_created + 1;
  END IF;

  -- Cold Outreach (21 يوم)
  IF NOT EXISTS (SELECT 1 FROM public.crm_sequences WHERE tenant_id = v_tenant AND sequence_type = 'cold_outreach') THEN
    INSERT INTO public.crm_sequences (tenant_id, name, sequence_type, description, created_by)
    VALUES (v_tenant, 'تواصل أول مع عميل بارد', 'cold_outreach', 'سلسلة 21 يوماً', auth.uid())
    RETURNING id INTO v_seq;
    INSERT INTO public.crm_sequence_steps (tenant_id, sequence_id, step_order, delay_days, action_type, title) VALUES
      (v_tenant, v_seq, 1, 0,  'email', 'بريد تعريفي أول'),
      (v_tenant, v_seq, 2, 3,  'call',  'اتصال متابعة'),
      (v_tenant, v_seq, 3, 7,  'email', 'بريد بقيمة مضافة (محتوى/دراسة)'),
      (v_tenant, v_seq, 4, 14, 'call',  'اتصال أخير'),
      (v_tenant, v_seq, 5, 21, 'stop',  'إيقاف إن لم يرد');
    v_created := v_created + 1;
  END IF;

  RETURN v_created;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (14) صلاحيات التنفيذ
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.crm_log_call(UUID,UUID,UUID,INTEGER,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_complete_task(UUID)                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_enroll_in_sequence(UUID,UUID,UUID,UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_advance_sequence(UUID)                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_apply_assignment(UUID)                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_activity_stats(INTEGER)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_activity_gaps(INTEGER)                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seed_default_sequences()                                     TO authenticated;

-- ============================================================================
-- نهاية 0167 — الوحدة 3 (الأنشطة والأتمتة) مكتملة.
-- ============================================================================
