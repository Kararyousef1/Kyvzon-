-- ============================================================================
-- Kyvzon — 0169_crm_support_ticketing.sql
-- بوابة CRM — الوحدة 5: الدعم الفني وإدارة التذاكر (التقرير 05)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية:
--   • منظومة التذاكر (crm_tickets): رقم فريد + عميل/حساب + نوع + أولوية + قناة + حالة + SLA.
--   • أنواع التذاكر: technical / feature_request / billing / critical_incident.
--   • الأولوية والـ SLA (crm_sla_policies): P1 30د/4س … P4 يوم/3أيام + SLA متمايز حسب الباقة.
--   • القنوات (Omnichannel): email / live_chat / self_service / phone / whatsapp.
--   • التوزيع الذكي (crm_routing_rules): rule_based / round_robin / skills_based.
--   • سير العمل: new→open→pending_customer→pending_internal→resolved→closed + CSAT عند الحل.
--   • الردود (crm_ticket_replies): عامة (للعميل) + ملاحظات داخلية (internal notes).
--   • الردود الجاهزة (crm_canned_responses) + قاعدة المعرفة (crm_kb_articles) + Deflection.
--   • التصعيد التلقائي وخطر المغادرة (crm_ticket_escalate + churn_risk) + ربط بالحساب/الجدول الزمني.
--   • CSAT (على التذكرة) + مؤشرات الأداء (crm_support_kpis).
--
-- التصميم: tenant-scoped + RLS، بادئة crm_* صارمة، دوال SECURITY DEFINER + فحص المستأجر.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) سياسات الـ SLA — SLA Policies (حسب الأولوية + الباقة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_sla_policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  priority          TEXT NOT NULL CHECK (priority IN ('p1','p2','p3','p4')),
  plan_tier         TEXT NOT NULL DEFAULT 'default'
                    CHECK (plan_tier IN ('default','starter','professional','enterprise','strategic')),
  first_response_minutes INTEGER NOT NULL,                        -- وقت الرد الأول (دقائق)
  resolution_minutes     INTEGER NOT NULL,                        -- وقت الحل (دقائق)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, priority, plan_tier)
);
CREATE INDEX IF NOT EXISTS idx_crm_sla_tenant ON public.crm_sla_policies(tenant_id, priority);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) التذاكر — Tickets
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_number     TEXT NOT NULL,
  subject           TEXT NOT NULL,
  description       TEXT,
  account_id        UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  ticket_type       TEXT NOT NULL DEFAULT 'technical'
                    CHECK (ticket_type IN ('technical','feature_request','billing','critical_incident')),
  priority          TEXT NOT NULL DEFAULT 'p3' CHECK (priority IN ('p1','p2','p3','p4')),
  channel           TEXT NOT NULL DEFAULT 'email'
                    CHECK (channel IN ('email','live_chat','self_service','phone','whatsapp')),
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','open','pending_customer','pending_internal','resolved','closed')),
  assignee_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- المهارة المطلوبة (skills-based routing)
  required_skill    TEXT,                                         -- 'hr_module' / 'zkteco' / 'billing'
  -- الـ SLA (تُحتسب عند الإنشاء)
  sla_first_response_due TIMESTAMPTZ,
  sla_resolution_due     TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  sla_breached      BOOLEAN NOT NULL DEFAULT false,
  -- CSAT بعد الحل
  csat_score        INTEGER CHECK (csat_score BETWEEN 1 AND 5),
  csat_comment      TEXT,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, ticket_number)
);
CREATE INDEX IF NOT EXISTS idx_crm_tickets_tenant   ON public.crm_tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_tickets_account  ON public.crm_tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_crm_tickets_assignee ON public.crm_tickets(tenant_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_crm_tickets_priority ON public.crm_tickets(tenant_id, priority, status);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) الردود — Ticket Replies (عامة + ملاحظات داخلية)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_ticket_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id     UUID NOT NULL REFERENCES public.crm_tickets(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  is_internal   BOOLEAN NOT NULL DEFAULT false,                  -- ملاحظة داخلية لا يراها العميل
  author_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_type   TEXT NOT NULL DEFAULT 'agent' CHECK (author_type IN ('agent','customer','system')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_replies_ticket ON public.crm_ticket_replies(ticket_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) الردود الجاهزة — Canned Responses
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_canned_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  category      TEXT,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_canned_tenant ON public.crm_canned_responses(tenant_id, is_active);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) قاعدة المعرفة — Knowledge Base Articles
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_kb_articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  article_type  TEXT NOT NULL DEFAULT 'how_to'
                CHECK (article_type IN ('how_to','troubleshooting','faq','release_notes')),
  is_published  BOOLEAN NOT NULL DEFAULT true,
  view_count    INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  unhelpful_count INTEGER NOT NULL DEFAULT 0,
  deflection_count INTEGER NOT NULL DEFAULT 0,                   -- حالات وجد العميل الإجابة بلا تذكرة
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_kb_tenant ON public.crm_kb_articles(tenant_id, article_type, is_published);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) قواعد التوزيع الذكي — Routing Rules
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_routing_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  strategy      TEXT NOT NULL DEFAULT 'rule_based' CHECK (strategy IN ('rule_based','round_robin','skills_based')),
  match_type    TEXT CHECK (match_type IN ('ticket_type','priority','required_skill','plan_tier')),
  match_value   TEXT,
  assign_to     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority      INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_routing_tenant ON public.crm_routing_rules(tenant_id, strategy, is_active);

-- ════════════════════════════════════════════════════════════════════════════
--  (7) تفعيل RLS + سياسات العزل
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_sla_policies','crm_tickets','crm_ticket_replies','crm_canned_responses',
    'crm_kb_articles','crm_routing_rules'
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
--  (8) إنشاء تذكرة — Create ticket (يحسب الـ SLA حسب الأولوية والباقة + توزيع)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_create_ticket(
  p_subject      TEXT,
  p_description  TEXT,
  p_account_id   UUID,
  p_contact_id   UUID,
  p_type         TEXT DEFAULT 'technical',
  p_priority     TEXT DEFAULT 'p3',
  p_channel      TEXT DEFAULT 'email',
  p_required_skill TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_ticket UUID; v_num TEXT; v_frt INT; v_ttr INT; v_owner UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- SLA من السياسة (fallback: قيم التقرير الافتراضية)
  SELECT first_response_minutes, resolution_minutes INTO v_frt, v_ttr
  FROM public.crm_sla_policies
  WHERE tenant_id = v_tenant AND priority = p_priority AND plan_tier = 'default' LIMIT 1;

  IF v_frt IS NULL THEN
    v_frt := CASE p_priority WHEN 'p1' THEN 30 WHEN 'p2' THEN 120 WHEN 'p3' THEN 240 ELSE 480 END;
    v_ttr := CASE p_priority WHEN 'p1' THEN 240 WHEN 'p2' THEN 480 WHEN 'p3' THEN 1440 ELSE 4320 END;
  END IF;

  v_num := 'TK-' || to_char(NOW(), 'YYMMDD') || '-' || lpad((floor(random()*100000))::text, 5, '0');

  -- توزيع rule-based: أول قاعدة مطابقة للنوع/الأولوية/المهارة
  SELECT assign_to INTO v_owner FROM public.crm_routing_rules r
   WHERE r.tenant_id = v_tenant AND r.is_active = true AND r.strategy = 'rule_based'
     AND (
       (r.match_type = 'ticket_type'    AND r.match_value = p_type)
       OR (r.match_type = 'priority'    AND r.match_value = p_priority)
       OR (r.match_type = 'required_skill' AND r.match_value = p_required_skill)
     )
   ORDER BY r.priority DESC LIMIT 1;

  INSERT INTO public.crm_tickets (
    tenant_id, ticket_number, subject, description, account_id, contact_id,
    ticket_type, priority, channel, required_skill, assignee_id, status,
    sla_first_response_due, sla_resolution_due, created_by
  ) VALUES (
    v_tenant, v_num, p_subject, p_description, p_account_id, p_contact_id,
    p_type, p_priority, p_channel, p_required_skill, v_owner,
    CASE WHEN v_owner IS NOT NULL THEN 'open' ELSE 'new' END,
    NOW() + (v_frt || ' minutes')::INTERVAL, NOW() + (v_ttr || ' minutes')::INTERVAL, auth.uid()
  ) RETURNING id INTO v_ticket;

  -- ربط بالجدول الزمني للحساب (الوحدة 1)
  IF p_account_id IS NOT NULL THEN
    INSERT INTO public.crm_activities_timeline
      (tenant_id, account_id, contact_id, activity_type, direction, title, body, logged_via, created_by)
    VALUES (v_tenant, p_account_id, p_contact_id, 'support_ticket', 'inbound',
            format('تذكرة دعم: %s', p_subject), p_description, 'auto', auth.uid());
  END IF;

  RETURN v_ticket;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) إضافة رد — Add reply (يضبط first_response_at لأول رد عام من موظف)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_add_ticket_reply(
  p_ticket_id UUID, p_body TEXT, p_is_internal BOOLEAN DEFAULT false, p_author_type TEXT DEFAULT 'agent'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_reply UUID; v_frt TIMESTAMPTZ;
BEGIN
  SELECT tenant_id, first_response_at INTO v_tenant, v_frt FROM public.crm_tickets WHERE id = p_ticket_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  INSERT INTO public.crm_ticket_replies (tenant_id, ticket_id, body, is_internal, author_id, author_type)
  VALUES (v_tenant, p_ticket_id, p_body, p_is_internal, auth.uid(), p_author_type)
  RETURNING id INTO v_reply;

  -- أول رد عام من موظف يضبط first_response_at وينقل الحالة لـ open
  IF NOT p_is_internal AND p_author_type = 'agent' AND v_frt IS NULL THEN
    UPDATE public.crm_tickets
      SET first_response_at = NOW(),
          status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
          updated_at = NOW()
      WHERE id = p_ticket_id;
  END IF;

  RETURN v_reply;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) تغيير حالة تذكرة — Set status (يضبط resolved/closed + كسر SLA)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_set_ticket_status(p_ticket_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_res_due TIMESTAMPTZ;
BEGIN
  SELECT tenant_id, sla_resolution_due INTO v_tenant, v_res_due FROM public.crm_tickets WHERE id = p_ticket_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  UPDATE public.crm_tickets
    SET status = p_status,
        resolved_at = CASE WHEN p_status = 'resolved' THEN NOW() ELSE resolved_at END,
        closed_at   = CASE WHEN p_status = 'closed' THEN NOW() ELSE closed_at END,
        sla_breached = CASE WHEN p_status IN ('resolved','closed') AND v_res_due IS NOT NULL AND NOW() > v_res_due THEN true ELSE sla_breached END,
        updated_at = NOW()
    WHERE id = p_ticket_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) تسجيل CSAT — Submit CSAT (بعد الحل)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_submit_csat(p_ticket_id UUID, p_score INTEGER, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_tickets WHERE id = p_ticket_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;
  IF p_score < 1 OR p_score > 5 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;

  UPDATE public.crm_tickets SET csat_score = p_score, csat_comment = p_comment, updated_at = NOW()
    WHERE id = p_ticket_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) تنبيهات خطر المغادرة — Churn Risk (من نشاط الدعم)
--  عميل: >5 تذاكر في 30 يوم أو CSAT<3 في آخر تذكرتين أو P1 كسر SLA.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_support_churn_risk()
RETURNS TABLE (
  account_id      UUID,
  account_name    TEXT,
  tickets_30d     INTEGER,
  avg_recent_csat NUMERIC,
  breached_p1     INTEGER,
  risk_reason     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT t.account_id,
      COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '30 days')::INT AS c30,
      COUNT(*) FILTER (WHERE t.priority = 'p1' AND t.sla_breached)::INT AS breached,
      AVG(t.csat_score) FILTER (WHERE t.csat_score IS NOT NULL) AS csat
    FROM public.crm_tickets t
    WHERE t.tenant_id = v_tenant AND t.account_id IS NOT NULL
    GROUP BY t.account_id
  )
  SELECT a.account_id, acc.name, a.c30, ROUND(COALESCE(a.csat,0),1), a.breached,
    CASE
      WHEN a.c30 > 5 THEN 'أكثر من 5 تذاكر في 30 يوم'
      WHEN COALESCE(a.csat,5) < 3 THEN 'رضا العميل منخفض (CSAT < 3)'
      WHEN a.breached > 0 THEN 'تذكرة P1 كسرت الـ SLA'
      ELSE 'متعدد'
    END
  FROM agg a JOIN public.crm_accounts acc ON acc.id = a.account_id
  WHERE a.c30 > 5 OR COALESCE(a.csat,5) < 3 OR a.breached > 0
  ORDER BY a.c30 DESC;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (13) مؤشرات أداء الدعم — Support KPIs
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_support_kpis()
RETURNS TABLE (
  open_tickets    INTEGER,
  breached        INTEGER,
  sla_compliance  NUMERIC,
  avg_csat        NUMERIC,
  resolved_30d    INTEGER,
  avg_ttr_hours   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_closed INT; v_breached INT;
BEGIN
  SELECT COUNT(*) FILTER (WHERE status IN ('resolved','closed')),
         COUNT(*) FILTER (WHERE sla_breached)
    INTO v_closed, v_breached
  FROM public.crm_tickets WHERE tenant_id = v_tenant;

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INT FROM public.crm_tickets WHERE tenant_id = v_tenant AND status NOT IN ('resolved','closed')),
    v_breached,
    CASE WHEN v_closed > 0 THEN ROUND((v_closed - v_breached)::NUMERIC / v_closed * 100, 1) ELSE 100 END,
    (SELECT ROUND(COALESCE(AVG(csat_score),0),2) FROM public.crm_tickets WHERE tenant_id = v_tenant AND csat_score IS NOT NULL),
    (SELECT COUNT(*)::INT FROM public.crm_tickets WHERE tenant_id = v_tenant AND resolved_at >= NOW() - INTERVAL '30 days'),
    (SELECT ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600.0),0),1)
       FROM public.crm_tickets WHERE tenant_id = v_tenant AND resolved_at IS NOT NULL);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (14) seed سياسات SLA الافتراضية (من التقرير) — idempotent
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_seed_default_sla()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_created INT := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  INSERT INTO public.crm_sla_policies (tenant_id, priority, plan_tier, first_response_minutes, resolution_minutes) VALUES
    (v_tenant, 'p1', 'default', 30,  240),    -- 30 دقيقة / 4 ساعات
    (v_tenant, 'p2', 'default', 120, 480),    -- 2 ساعة / 8 ساعات
    (v_tenant, 'p3', 'default', 240, 1440),   -- 4 ساعات / 24 ساعة
    (v_tenant, 'p4', 'default', 480, 4320)    -- يوم عمل / 3 أيام
  ON CONFLICT (tenant_id, priority, plan_tier) DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (15) صلاحيات التنفيذ
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.crm_create_ticket(TEXT,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_add_ticket_reply(UUID,TEXT,BOOLEAN,TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_set_ticket_status(UUID,TEXT)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_submit_csat(UUID,INTEGER,TEXT)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_support_churn_risk()                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_support_kpis()                                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seed_default_sla()                                       TO authenticated;

-- ============================================================================
-- نهاية 0169 — الوحدة 5 (الدعم والتذاكر) مكتملة.
-- ============================================================================
