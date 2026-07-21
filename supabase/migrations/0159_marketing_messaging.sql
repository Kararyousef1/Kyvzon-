-- ============================================================================
-- Kyvzon — 0159_marketing_messaging.sql
-- وحدة "الرسائل النصية والواتساب" (بوابة التسويق — التقرير الرابع)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية 2025:
--   • جهات الاتصال + سجل الموافقات (Explicit Consent + توقيت) + التجزئة.
--   • SMS: 4 أنواع + عداد 160 حرف (منطق الواجهة) + قاعدة التوقيت + امتثال.
--   • WhatsApp: قوالب معتمدة (Utility/Marketing/Authentication) + حالة موافقة
--     + نافذة 24 ساعة + سجل محادثات مربوط بـ CRM (marketing_leads).
--   • إدارة Opt-out (STOP): إيقاف فوري تلقائي.
--   • بوابة المراسلة: ربط Twilio/MessageBird (adapter/simulation).
--   • التدرّج الآمن (Warm-up) + التحليلات (Delivery/Open/Click/Opt-out).
--   • الربط بالأتمتة (الوحدة 1): دالة إرسال موحّدة تُسجّل كل رسالة كحدث.
--
-- كل الجداول tenant-scoped + RLS. idempotent.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) بوابات المراسلة (Providers)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.messaging_gateways (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  provider       TEXT NOT NULL DEFAULT 'simulation'
                 CHECK (provider IN ('simulation','twilio','messagebird','meta_cloud')),
  sender_id      TEXT,                            -- Sender ID / رقم المرسل المعتمد
  is_connected   BOOLEAN NOT NULL DEFAULT false,  -- hook: يُفعَّل بمفتاح المزوّد
  -- التدرّج الآمن (Warm-up)
  daily_limit    INTEGER NOT NULL DEFAULT 500,
  warmup_started_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel, provider)
);
CREATE INDEX IF NOT EXISTS idx_msg_gateways_tenant ON public.messaging_gateways(tenant_id, channel);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) جهات الاتصال + سجل الموافقات (Consent)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.messaging_contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone          TEXT NOT NULL,                   -- E.164
  full_name      TEXT,
  -- ربط اختياري بعميل الأتمتة (الوحدة 1)
  lead_id        UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  -- الموافقة الصريحة لكل قناة (إلزامية قبل الإرسال التسويقي)
  sms_consent      BOOLEAN NOT NULL DEFAULT false,
  sms_consent_at   TIMESTAMPTZ,
  wa_consent       BOOLEAN NOT NULL DEFAULT false,
  wa_consent_at    TIMESTAMPTZ,
  -- Opt-out (STOP)
  sms_opted_out    BOOLEAN NOT NULL DEFAULT false,
  wa_opted_out     BOOLEAN NOT NULL DEFAULT false,
  opted_out_at     TIMESTAMPTZ,
  -- التجزئة
  country          TEXT,
  timezone         TEXT DEFAULT 'Asia/Baghdad',
  tags             TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_msg_contacts_tenant ON public.messaging_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_msg_contacts_lead   ON public.messaging_contacts(tenant_id, lead_id);

-- سجل audit للموافقات (إثبات قانوني)
CREATE TABLE IF NOT EXISTS public.messaging_consent_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id     UUID REFERENCES public.messaging_contacts(id) ON DELETE SET NULL,
  phone          TEXT NOT NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  action         TEXT NOT NULL CHECK (action IN ('opt_in','opt_out')),
  method         TEXT,                            -- checkbox / keyword / manual / stop_reply
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_consent_tenant ON public.messaging_consent_log(tenant_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) قوالب واتساب المعتمدة (Meta approval status)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'utility' CHECK (category IN ('utility','marketing','authentication')),
  language       TEXT NOT NULL DEFAULT 'ar',
  body           TEXT NOT NULL,                   -- يحوي {{1}}, {{2}} ...
  -- حالة موافقة Meta
  approval_status TEXT NOT NULL DEFAULT 'draft'
                 CHECK (approval_status IN ('draft','pending','approved','rejected')),
  rejection_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_templates_tenant ON public.whatsapp_templates(tenant_id, approval_status);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) قوالب SMS (اختيارية للاستخدام المتكرّر)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  sms_type       TEXT NOT NULL DEFAULT 'promotional'
                 CHECK (sms_type IN ('promotional','transactional','reminder','survey')),
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_templates_tenant ON public.sms_templates(tenant_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) حملات المراسلة
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.messaging_campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  sms_type       TEXT CHECK (sms_type IN ('promotional','transactional','reminder','survey')),
  wa_template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  body           TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled')),
  scheduled_at   TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_campaigns_tenant ON public.messaging_campaigns(tenant_id, status);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) الرسائل + الأحداث (سجل المحادثات + التحليلات + ربط الأتمتة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.messaging_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id     UUID REFERENCES public.messaging_contacts(id) ON DELETE SET NULL,
  campaign_id    UUID REFERENCES public.messaging_campaigns(id) ON DELETE SET NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  direction      TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  body           TEXT NOT NULL DEFAULT '',
  -- مصدر الرسالة: campaign / automation (الوحدة 1) / transactional / reply
  source         TEXT NOT NULL DEFAULT 'campaign' CHECK (source IN ('campaign','automation','transactional','reply')),
  workflow_id    UUID REFERENCES public.marketing_workflows(id) ON DELETE SET NULL,
  -- حالة التسليم
  status         TEXT NOT NULL DEFAULT 'simulated'
                 CHECK (status IN ('simulated','queued','sent','delivered','read','clicked','failed','opted_out')),
  delivery_mode  TEXT NOT NULL DEFAULT 'simulated' CHECK (delivery_mode IN ('simulated','live')),
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_messages_contact ON public.messaging_messages(tenant_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_messages_campaign ON public.messaging_messages(tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_msg_messages_status  ON public.messaging_messages(tenant_id, channel, status);

-- ════════════════════════════════════════════════════════════════════════════
--  (7) RLS
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messaging_gateways','messaging_contacts','messaging_consent_log',
    'whatsapp_templates','sms_templates','messaging_campaigns','messaging_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) دالة إرسال رسالة موحّدة (تُستدعى من الحملات والأتمتة)
--  تفرض: الموافقة + عدم الـ opt-out قبل الإرسال. تسجّل الرسالة كحدث.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.send_messaging(
  p_contact_id  UUID,
  p_channel     TEXT,
  p_body        TEXT,
  p_campaign_id UUID    DEFAULT NULL,
  p_source      TEXT    DEFAULT 'campaign',
  p_workflow_id UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_consent BOOLEAN; v_opted BOOLEAN; v_msg UUID;
BEGIN
  SELECT tenant_id,
         CASE WHEN p_channel='sms' THEN sms_consent ELSE wa_consent END,
         CASE WHEN p_channel='sms' THEN sms_opted_out ELSE wa_opted_out END
    INTO v_tenant, v_consent, v_opted
  FROM public.messaging_contacts WHERE id = p_contact_id;

  IF v_tenant IS NULL THEN RAISE EXCEPTION 'contact not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  -- الامتثال: لا إرسال بلا موافقة أو بعد الإلغاء
  IF v_opted THEN
    INSERT INTO public.messaging_messages (tenant_id, contact_id, campaign_id, channel, direction, body, source, workflow_id, status)
    VALUES (v_tenant, p_contact_id, p_campaign_id, p_channel, 'outbound', p_body, p_source, p_workflow_id, 'opted_out')
    RETURNING id INTO v_msg;
    RETURN v_msg;
  END IF;
  IF NOT v_consent AND p_source <> 'transactional' THEN
    RAISE EXCEPTION 'no marketing consent for channel %', p_channel;
  END IF;

  INSERT INTO public.messaging_messages (tenant_id, contact_id, campaign_id, channel, direction, body, source, workflow_id, status, delivery_mode)
  VALUES (v_tenant, p_contact_id, p_campaign_id, p_channel, 'outbound', p_body, p_source, p_workflow_id, 'simulated', 'simulated')
  RETURNING id INTO v_msg;

  RETURN v_msg;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) معالجة رد STOP — Opt-out فوري تلقائي
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.process_stop_reply(
  p_contact_id UUID,
  p_channel    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_phone TEXT;
BEGIN
  SELECT tenant_id, phone INTO v_tenant, v_phone FROM public.messaging_contacts WHERE id = p_contact_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'contact not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  IF p_channel = 'sms' THEN
    UPDATE public.messaging_contacts SET sms_opted_out = true, opted_out_at = NOW(), updated_at = NOW() WHERE id = p_contact_id;
  ELSE
    UPDATE public.messaging_contacts SET wa_opted_out = true, opted_out_at = NOW(), updated_at = NOW() WHERE id = p_contact_id;
  END IF;

  INSERT INTO public.messaging_consent_log (tenant_id, contact_id, phone, channel, action, method)
  VALUES (v_tenant, p_contact_id, v_phone, p_channel, 'opt_out', 'stop_reply');
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) دالة KPIs للمراسلة (لكل قناة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.messaging_kpis(p_channel TEXT)
RETURNS TABLE (sent BIGINT, delivered BIGINT, read_count BIGINT, clicked BIGINT, opted_out BIGINT, failed BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE status IN ('sent','delivered','read','clicked','simulated')),
    count(*) FILTER (WHERE status IN ('delivered','read','clicked')),
    count(*) FILTER (WHERE status IN ('read','clicked')),
    count(*) FILTER (WHERE status = 'clicked'),
    count(*) FILTER (WHERE status = 'opted_out'),
    count(*) FILTER (WHERE status = 'failed')
  FROM public.messaging_messages
  WHERE channel = p_channel AND direction = 'outbound'
    AND tenant_id = public.current_user_tenant_id();
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) الصلاحيات + جدول تدرّج واتساب المرجعي
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.send_messaging(UUID,TEXT,TEXT,UUID,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stop_reply(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_kpis(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_warmup_schedule()
RETURNS TABLE (week_label TEXT, daily_limit INTEGER)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT * FROM (VALUES
    ('الأسبوع الأول', 500),
    ('الأسبوع الثاني', 1000),
    ('الأسبوع الثالث', 2000),
    ('الشهر الثاني', 5000)
  ) AS t(week_label, daily_limit);
$$;
GRANT EXECUTE ON FUNCTION public.whatsapp_warmup_schedule() TO authenticated;

-- ============================================================================
--  نهاية 0159_marketing_messaging.sql
-- ============================================================================
