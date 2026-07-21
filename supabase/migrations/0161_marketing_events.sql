-- ============================================================================
-- Kyvzon — 0161_marketing_events.sql
-- وحدة "إدارة الفعاليات والمؤتمرات" (بوابة التسويق — التقرير الخامس)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية:
--   • فعاليات (حضوري/افتراضي/هجين) + صفحة حدث + متحدثون + رعاة + جلسات.
--   • أنواع تذاكر متعددة (Early Bird/General/VIP/Group/Press) + كودات خصم.
--   • تسجيلات + QR فريد + قوائم انتظار + حالة الدفع.
--   • Check-in بمسح QR مع منع التكرار + لوحة حضور فورية.
--   • Engagement Scoring (افتراضي) → تحديث Lead Score (الوحدة 1).
--   • ربط المسجّل بعميل + التحليلات/ROI.
--
-- الدفع الفعلي (Stripe) والبث (Zoom/Teams) hooks — محاكاة حتى إدخال المفاتيح.
-- كل الجداول tenant-scoped + RLS. idempotent.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) الفعاليات
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  slug           TEXT,
  description    TEXT,
  event_type     TEXT NOT NULL DEFAULT 'in_person' CHECK (event_type IN ('in_person','virtual','hybrid')),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','live','completed','cancelled')),
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  timezone       TEXT DEFAULT 'Asia/Baghdad',
  location       TEXT,                              -- للحضوري
  map_url        TEXT,
  -- البث للافتراضي/الهجين (hook خارجي)
  stream_provider TEXT CHECK (stream_provider IN ('zoom','teams','youtube','vimeo','other')),
  stream_url     TEXT,
  capacity       INTEGER,                           -- السعة الكلية (NULL = بلا حد)
  cover_image_url TEXT,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON public.marketing_events(tenant_id, status);

-- المتحدثون
CREATE TABLE IF NOT EXISTS public.event_speakers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.marketing_events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  title          TEXT,
  bio            TEXT,
  photo_url      TEXT,
  linkedin_url   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_speakers ON public.event_speakers(tenant_id, event_id);

-- الرعاة
CREATE TABLE IF NOT EXISTS public.event_sponsors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.marketing_events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  logo_url       TEXT,
  website_url    TEXT,
  tier           TEXT,                              -- باقة الرعاية
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_sponsors ON public.event_sponsors(tenant_id, event_id);

-- الجلسات (أجندة + جلسات متوازية)
CREATE TABLE IF NOT EXISTS public.event_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.marketing_events(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  speaker_id     UUID REFERENCES public.event_speakers(id) ON DELETE SET NULL,
  room           TEXT,
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  capacity       INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_sessions ON public.event_sessions(tenant_id, event_id, starts_at);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) أنواع التذاكر + كودات الخصم
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.event_ticket_types (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.marketing_events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  tier           TEXT NOT NULL DEFAULT 'general' CHECK (tier IN ('early_bird','general','vip','group','press','free')),
  price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       CHAR(3) NOT NULL DEFAULT 'USD',
  quantity       INTEGER,                           -- الكمية المتاحة (NULL = بلا حد)
  sold           INTEGER NOT NULL DEFAULT 0,
  min_group_size INTEGER,                           -- لتذاكر المجموعات
  sales_end_at   TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_types ON public.event_ticket_types(tenant_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_promo_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.marketing_events(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,
  discount_type  TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
  discount_value NUMERIC(12,2) NOT NULL,
  max_uses       INTEGER,
  used_count     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, code)
);
CREATE INDEX IF NOT EXISTS idx_promo_codes ON public.event_promo_codes(tenant_id, event_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) التسجيلات (QR + قائمة انتظار + دفع + حضور + engagement)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.marketing_events(id) ON DELETE CASCADE,
  ticket_type_id UUID REFERENCES public.event_ticket_types(id) ON DELETE SET NULL,
  -- بيانات المسجّل
  full_name      TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  company        TEXT,
  job_title      TEXT,
  custom_fields  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- نماذج مخصصة
  -- ربط بعميل الأتمتة (الوحدة 1)
  lead_id        UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  -- الحالة: مسجّل / قائمة انتظار / ملغى
  status         TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','waitlisted','cancelled')),
  -- الدفع
  payment_status TEXT NOT NULL DEFAULT 'not_required' CHECK (payment_status IN ('not_required','pending','paid','refunded')),
  amount_paid    NUMERIC(12,2) NOT NULL DEFAULT 0,
  promo_code     TEXT,
  -- QR + الحضور (منع التكرار عبر checked_in)
  qr_token       UUID NOT NULL DEFAULT gen_random_uuid(),
  checked_in     BOOLEAN NOT NULL DEFAULT false,
  checked_in_at  TIMESTAMPTZ,
  -- Engagement (للافتراضي): 0-100
  engagement_score INTEGER NOT NULL DEFAULT 0,
  attendance_pct INTEGER NOT NULL DEFAULT 0,          -- نسبة حضور الويبينار
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, email)
);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON public.event_registrations(tenant_id, event_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_qr    ON public.event_registrations(qr_token);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) RLS
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_events','event_speakers','event_sponsors','event_sessions',
    'event_ticket_types','event_promo_codes','event_registrations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (5) تسجيل في فعالية — يحدّد الحالة (مسجّل/قائمة انتظار حسب السعة) + الدفع + QR
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.register_for_event(
  p_event_id     UUID,
  p_ticket_type_id UUID,
  p_full_name    TEXT,
  p_email        TEXT,
  p_promo_code   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_capacity INTEGER; v_registered INTEGER; v_status TEXT;
  v_price NUMERIC; v_pay_status TEXT; v_amount NUMERIC := 0; v_disc NUMERIC := 0;
  v_disc_type TEXT; v_reg UUID; v_qty INTEGER; v_sold INTEGER;
BEGIN
  SELECT tenant_id, capacity INTO v_tenant, v_capacity FROM public.marketing_events WHERE id = p_event_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'event not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  -- تحديد الحالة حسب السعة (قائمة انتظار عند الامتلاء)
  SELECT count(*) INTO v_registered FROM public.event_registrations
   WHERE event_id = p_event_id AND status = 'registered';
  IF v_capacity IS NOT NULL AND v_registered >= v_capacity THEN
    v_status := 'waitlisted';
  ELSE
    v_status := 'registered';
  END IF;

  -- الدفع
  SELECT price, quantity, sold INTO v_price, v_qty, v_sold FROM public.event_ticket_types WHERE id = p_ticket_type_id;
  v_amount := COALESCE(v_price, 0);

  -- كود الخصم
  IF p_promo_code IS NOT NULL THEN
    SELECT discount_type, discount_value INTO v_disc_type, v_disc
    FROM public.event_promo_codes
    WHERE event_id = p_event_id AND code = p_promo_code AND is_active = true
      AND (max_uses IS NULL OR used_count < max_uses);
    IF v_disc IS NOT NULL THEN
      IF v_disc_type = 'percent' THEN v_amount := v_amount * (1 - v_disc/100);
      ELSE v_amount := GREATEST(v_amount - v_disc, 0); END IF;
      UPDATE public.event_promo_codes SET used_count = used_count + 1
       WHERE event_id = p_event_id AND code = p_promo_code;
    END IF;
  END IF;

  v_pay_status := CASE WHEN v_amount > 0 THEN 'pending' ELSE 'not_required' END;

  INSERT INTO public.event_registrations
    (tenant_id, event_id, ticket_type_id, full_name, email, status, payment_status, amount_paid, promo_code)
  VALUES
    (v_tenant, p_event_id, p_ticket_type_id, p_full_name, p_email, v_status, v_pay_status, 0, p_promo_code)
  RETURNING id INTO v_reg;

  -- تحديث الكمية المباعة إن كان مسجّلاً
  IF v_status = 'registered' AND p_ticket_type_id IS NOT NULL THEN
    UPDATE public.event_ticket_types SET sold = sold + 1 WHERE id = p_ticket_type_id;
  END IF;

  RETURN v_reg;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (6) Check-in بمسح QR — منع التكرار
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.checkin_by_qr(p_qr_token UUID)
RETURNS TABLE (result TEXT, registrant TEXT, reg_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_id UUID; v_name TEXT; v_done BOOLEAN;
BEGIN
  SELECT tenant_id, id, full_name, checked_in INTO v_tenant, v_id, v_name, v_done
  FROM public.event_registrations WHERE qr_token = p_qr_token;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::UUID; RETURN;
  END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;
  IF v_done THEN
    RETURN QUERY SELECT 'already_checked_in'::TEXT, v_name, v_id; RETURN;
  END IF;

  UPDATE public.event_registrations SET checked_in = true, checked_in_at = NOW(), updated_at = NOW() WHERE id = v_id;
  RETURN QUERY SELECT 'success'::TEXT, v_name, v_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) تسجيل engagement (افتراضي) + ترقية Lead Score إن مرتبط بعميل
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_event_engagement(
  p_registration_id UUID,
  p_attendance_pct  INTEGER,
  p_engagement      INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_lead UUID;
BEGIN
  SELECT tenant_id, lead_id INTO v_tenant, v_lead FROM public.event_registrations WHERE id = p_registration_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'registration not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  UPDATE public.event_registrations
     SET attendance_pct = p_attendance_pct, engagement_score = p_engagement, updated_at = NOW()
   WHERE id = p_registration_id;

  -- ربط بالوحدة 1: حضور 80%+ = عميل ساخن → تطبيق حدث تقييم (حضور ويبينار)
  IF v_lead IS NOT NULL AND p_attendance_pct >= 80 THEN
    PERFORM public.apply_lead_score_event(v_lead, 'attend_webinar');
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) KPIs الفعالية
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.event_kpis(p_event_id UUID)
RETURNS TABLE (registered BIGINT, waitlisted BIGINT, checked_in BIGINT, revenue NUMERIC, leads BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE status='registered'),
    count(*) FILTER (WHERE status='waitlisted'),
    count(*) FILTER (WHERE checked_in),
    COALESCE(sum(amount_paid),0),
    count(*) FILTER (WHERE lead_id IS NOT NULL)
  FROM public.event_registrations
  WHERE event_id = p_event_id AND tenant_id = public.current_user_tenant_id();
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) الصلاحيات
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.register_for_event(UUID,UUID,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_by_qr(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_engagement(UUID,INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_kpis(UUID) TO authenticated;

-- ============================================================================
--  نهاية 0161_marketing_events.sql
-- ============================================================================
