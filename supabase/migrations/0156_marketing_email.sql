-- ============================================================================
-- Kyvzon — 0156_marketing_email.sql
-- وحدة "التسويق عبر البريد الإلكتروني" (بوابة التسويق — التقرير الثاني)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية 2024/2025:
--   • البنية التقنية: نطاقات إرسال + حالة SPF/DKIM/DMARC/BIMI + تدفئة النطاق.
--   • إدارة القوائم: قوائم + مشتركون (Double Opt-in) + شرائح ديناميكية + نظافة.
--   • القوالب والحملات: قوالب RTL + حملات + متغيّرات A/B + جدولة.
--   • التحليلات: أحداث البريد (sent/delivered/opened/clicked/bounced/...) → KPIs.
--   • الامتثال: إلغاء اشتراك (one-click) + سجل Audit.
--   • الربط بالأتمتة (الوحدة 1): دالة إرسال موحّدة تُسجّل كل بريد كحدث تحليلي،
--     ويُستدعيها محرك الأتمتة. الإرسال الخارجي hook (provider) بوضع محاكاة.
--
-- التصميم: كل الجداول tenant-scoped + RLS. الإرسال الفعلي عبر مزوّد (SendGrid/SES)
--          يُفعَّل لاحقاً بإدخال مفتاح في email_sender_domains/إعدادات دون إعادة بناء.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) نطاقات الإرسال — Sender Domains (SPF/DKIM/DMARC/BIMI + تدفئة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_sender_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain          TEXT NOT NULL,
  from_name       TEXT,
  from_email      TEXT,
  -- حالة المصادقة (verified/pending/failed) — تُحدَّث بعد فحص DNS
  spf_status      TEXT NOT NULL DEFAULT 'pending'   CHECK (spf_status   IN ('pending','verified','failed')),
  dkim_status     TEXT NOT NULL DEFAULT 'pending'   CHECK (dkim_status  IN ('pending','verified','failed')),
  dmarc_status    TEXT NOT NULL DEFAULT 'pending'   CHECK (dmarc_status IN ('pending','verified','failed')),
  dmarc_policy    TEXT NOT NULL DEFAULT 'none'      CHECK (dmarc_policy IN ('none','quarantine','reject')),
  bimi_status     TEXT NOT NULL DEFAULT 'not_configured' CHECK (bimi_status IN ('not_configured','pending','verified')),
  -- تدفئة النطاق (Warm-up)
  warmup_enabled  BOOLEAN NOT NULL DEFAULT false,
  warmup_started_at TIMESTAMPTZ,
  daily_send_limit  INTEGER NOT NULL DEFAULT 50,
  -- إعداد المزوّد (hook): اسم المزوّد؛ المفتاح يُحفظ كـ secret خارج DB في الإنتاج
  provider        TEXT NOT NULL DEFAULT 'simulation' CHECK (provider IN ('simulation','sendgrid','amazon_ses','mailgun','postmark')),
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_email_domains_tenant ON public.email_sender_domains(tenant_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) القوائم البريدية + المشتركون (Double Opt-in) + العضوية
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_lists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  opt_in_type     TEXT NOT NULL DEFAULT 'double' CHECK (opt_in_type IN ('single','double')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_lists_tenant ON public.email_lists(tenant_id);

CREATE TABLE IF NOT EXISTS public.email_subscribers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  -- ربط اختياري بعميل الأتمتة (الوحدة 1)
  lead_id         UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  -- حالة الاشتراك (Double Opt-in + الامتثال + نظافة القائمة)
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','unsubscribed','bounced','complained','cleaned')),
  -- التجزئة الديموغرافية
  country         TEXT,
  city            TEXT,
  language        TEXT,
  job_title       TEXT,
  company_size    TEXT,
  industry        TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  -- Double Opt-in
  confirm_token   UUID,
  confirmed_at    TIMESTAMPTZ,
  -- الامتثال + نظافة
  unsubscribed_at TIMESTAMPTZ,
  bounce_type     TEXT CHECK (bounce_type IN ('hard','soft')),
  soft_bounce_count INTEGER NOT NULL DEFAULT 0,
  last_engaged_at TIMESTAMPTZ,   -- آخر فتح/نقر (لتحديد الخاملين)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_email_subs_tenant ON public.email_subscribers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_email_subs_token  ON public.email_subscribers(confirm_token);

CREATE TABLE IF NOT EXISTS public.email_list_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  list_id       UUID NOT NULL REFERENCES public.email_lists(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES public.email_subscribers(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (list_id, subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_email_members_list ON public.email_list_members(tenant_id, list_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) الشرائح الديناميكية — Segments (فلتر JSONB)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  segment_type  TEXT NOT NULL DEFAULT 'behavioral'
                CHECK (segment_type IN ('demographic','behavioral','lifecycle','microsegment')),
  -- شروط الفلتر (مصفوفة {field, op, value}) — تُقيَّم على المشتركين
  filters       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_segments_tenant ON public.email_segments(tenant_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) القوالب — Templates (محرر مرئي RTL + تخصيص ديناميكي)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  preheader     TEXT,
  -- بلوكات المحرّر المرئي (JSONB) + HTML مُصيَّر
  blocks        JSONB NOT NULL DEFAULT '[]'::jsonb,
  html          TEXT,
  category      TEXT NOT NULL DEFAULT 'custom',
  is_rtl        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON public.email_templates(tenant_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) الحملات — Campaigns (+ A/B + جدولة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- استهداف: قائمة أو شريحة
  list_id         UUID REFERENCES public.email_lists(id) ON DELETE SET NULL,
  segment_id      UUID REFERENCES public.email_segments(id) ON DELETE SET NULL,
  sender_domain_id UUID REFERENCES public.email_sender_domains(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled')),
  -- A/B testing
  is_ab_test      BOOLEAN NOT NULL DEFAULT false,
  ab_winner_metric TEXT CHECK (ab_winner_metric IN ('open_rate','click_rate')),
  ab_winner_variant UUID,     -- variant الفائز بعد الحسم
  -- الجدولة (توقيت أمثل)
  scheduled_at    TIMESTAMPTZ,
  timezone        TEXT DEFAULT 'Asia/Baghdad',
  sent_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_tenant ON public.email_campaigns(tenant_id, status);

-- متغيّرات الحملة (نسخة واحدة للعادية، عدة نسخ لـ A/B)
CREATE TABLE IF NOT EXISTS public.email_campaign_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  variant_label TEXT NOT NULL DEFAULT 'A',   -- 'A' / 'B'
  template_id   UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject       TEXT NOT NULL DEFAULT '',
  preheader     TEXT,
  html          TEXT,
  -- نسبة توزيع العينة لهذه النسخة (لـ A/B)
  sample_pct    INTEGER NOT NULL DEFAULT 100 CHECK (sample_pct BETWEEN 0 AND 100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, variant_label)
);
CREATE INDEX IF NOT EXISTS idx_email_variants_campaign ON public.email_campaign_variants(campaign_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) أحداث البريد — Events (مصدر كل التحليلات + ربط الأتمتة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  variant_id    UUID REFERENCES public.email_campaign_variants(id) ON DELETE SET NULL,
  subscriber_id UUID REFERENCES public.email_subscribers(id) ON DELETE SET NULL,
  -- مصدر البريد: campaign (حملة) أو automation (محرك الوحدة 1) أو transactional
  source        TEXT NOT NULL DEFAULT 'campaign' CHECK (source IN ('campaign','automation','transactional')),
  workflow_id   UUID REFERENCES public.marketing_workflows(id) ON DELETE SET NULL,
  -- نوع الحدث (سلسلة حياة البريد)
  event_type    TEXT NOT NULL
                CHECK (event_type IN ('queued','sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed')),
  bounce_type   TEXT CHECK (bounce_type IN ('hard','soft')),
  -- وضع الإرسال: simulated (hook) أو live (مزوّد فعلي)
  delivery_mode TEXT NOT NULL DEFAULT 'simulated' CHECK (delivery_mode IN ('simulated','live')),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON public.email_events(tenant_id, campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_type     ON public.email_events(tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_sub      ON public.email_events(tenant_id, subscriber_id);

-- سجل Audit لإلغاء الاشتراك (الامتثال GDPR/CAN-SPAM)
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES public.email_subscribers(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  campaign_id   UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  method        TEXT NOT NULL DEFAULT 'one_click' CHECK (method IN ('one_click','link','manual','complaint')),
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_unsub_tenant ON public.email_unsubscribe_log(tenant_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  (7) RLS — عزل متعدد المستأجرين
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'email_sender_domains','email_lists','email_subscribers','email_list_members',
    'email_segments','email_templates','email_campaigns','email_campaign_variants',
    'email_events','email_unsubscribe_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) دالة تسجيل حدث بريد — نقطة الدخول الموحّدة (تُستدعى من الأتمتة والحملات)
--  تُسجّل الحدث وتحدّث حالة المشترك (فتح/نقر/ارتداد/شكوى/إلغاء) للنظافة والتحليلات.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_email_event(
  p_subscriber_id UUID,
  p_event_type    TEXT,
  p_campaign_id   UUID    DEFAULT NULL,
  p_variant_id    UUID    DEFAULT NULL,
  p_source        TEXT    DEFAULT 'campaign',
  p_workflow_id   UUID    DEFAULT NULL,
  p_bounce_type   TEXT    DEFAULT NULL,
  p_delivery_mode TEXT    DEFAULT 'simulated'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_event  UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.email_subscribers WHERE id = p_subscriber_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'subscriber not found';
  END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'permission denied (tenant mismatch)';
  END IF;

  INSERT INTO public.email_events
    (tenant_id, campaign_id, variant_id, subscriber_id, source, workflow_id, event_type, bounce_type, delivery_mode)
  VALUES
    (v_tenant, p_campaign_id, p_variant_id, p_subscriber_id, p_source, p_workflow_id, p_event_type, p_bounce_type, p_delivery_mode)
  RETURNING id INTO v_event;

  -- تحديث حالة المشترك حسب الحدث (نظافة القائمة + الامتثال)
  IF p_event_type IN ('opened','clicked') THEN
    UPDATE public.email_subscribers SET last_engaged_at = NOW(), updated_at = NOW() WHERE id = p_subscriber_id;
  ELSIF p_event_type = 'bounced' THEN
    IF p_bounce_type = 'hard' THEN
      UPDATE public.email_subscribers SET status = 'bounced', bounce_type = 'hard', updated_at = NOW() WHERE id = p_subscriber_id;
    ELSE
      UPDATE public.email_subscribers
         SET bounce_type = 'soft', soft_bounce_count = soft_bounce_count + 1,
             status = CASE WHEN soft_bounce_count + 1 >= 3 THEN 'bounced' ELSE status END,
             updated_at = NOW()
       WHERE id = p_subscriber_id;
    END IF;
  ELSIF p_event_type = 'complained' THEN
    UPDATE public.email_subscribers SET status = 'complained', updated_at = NOW() WHERE id = p_subscriber_id;
  ELSIF p_event_type = 'unsubscribed' THEN
    UPDATE public.email_subscribers SET status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW() WHERE id = p_subscriber_id;
    INSERT INTO public.email_unsubscribe_log (tenant_id, subscriber_id, email, campaign_id, method)
    SELECT v_tenant, p_subscriber_id, email, p_campaign_id, 'one_click'
    FROM public.email_subscribers WHERE id = p_subscriber_id;
  END IF;

  RETURN v_event;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) Double Opt-in: تأكيد المشترك عبر رمز
--  دالة عامة (SECURITY DEFINER) تسمح بالتأكيد دون سياق tenant (رابط عام).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_email_subscription(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.email_subscribers
   WHERE confirm_token = p_token AND status = 'pending';
  IF v_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.email_subscribers
     SET status = 'confirmed', confirmed_at = NOW(), confirm_token = NULL, updated_at = NOW()
   WHERE id = v_id;
  RETURN true;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) دالة تجميع KPIs لحملة (أو كل الحملات) — بمعادلات التقرير
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.email_campaign_kpis(p_campaign_id UUID)
RETURNS TABLE (
  sent BIGINT, delivered BIGINT, opened BIGINT, clicked BIGINT,
  bounced BIGINT, unsubscribed BIGINT, complained BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE event_type = 'sent'),
    count(*) FILTER (WHERE event_type = 'delivered'),
    count(*) FILTER (WHERE event_type = 'opened'),
    count(*) FILTER (WHERE event_type = 'clicked'),
    count(*) FILTER (WHERE event_type = 'bounced'),
    count(*) FILTER (WHERE event_type = 'unsubscribed'),
    count(*) FILTER (WHERE event_type = 'complained')
  FROM public.email_events
  WHERE campaign_id = p_campaign_id
    AND tenant_id = public.current_user_tenant_id();
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) الصلاحيات
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.record_email_event(UUID,TEXT,UUID,UUID,TEXT,UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_email_subscription(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.email_campaign_kpis(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) بذر جدول تدفئة النطاق القياسي (كمرجع ثابت لأي واجهة)
--  دالة تُرجع جدول الأسابيع/الحدود من التقرير.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.email_warmup_schedule()
RETURNS TABLE (week_no INTEGER, daily_limit_min INTEGER, daily_limit_max INTEGER)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT * FROM (VALUES
    (1, 20, 50),
    (2, 100, 200),
    (3, 500, 1000),
    (4, 2000, 5000)
  ) AS t(week_no, daily_limit_min, daily_limit_max);
$$;
GRANT EXECUTE ON FUNCTION public.email_warmup_schedule() TO authenticated;

-- ============================================================================
--  نهاية 0156_marketing_email.sql
-- ============================================================================
