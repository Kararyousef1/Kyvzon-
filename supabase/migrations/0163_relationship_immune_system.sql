-- ============================================================================
-- Kyvzon — 0163_relationship_immune_system.sql
-- وحدة "نظام المناعة العلائقية" (بوابة التسويق — التقرير السابع، الابتكار الأصلي)
--
-- الطبقة الحاكمة العليا فوق الوحدات الست: تحكم كل قرار إرسال/دعوة/استبيان.
--
--   • محرك رصيد العلاقة (0-1000) لكل عميل + جداول خصم/شحن (من التقرير).
--   • طبقة الحوكمة اللحظية: نقطة تفتيش (allow/defer/block) + سجل تدقيق.
--   • الطبقة الثقافية/الزمنية: رمضان/الصلاة/أيام وطنية/عطلة/حداد (جدول قابل للتحديث).
--   • المناعة الذاتية: رصد شذوذ الإلغاء/الشكاوى + تعليق تلقائي.
--   • الدَّين التسويقي: مؤشر تراكمي على مستوى الشركة.
--   • صفحة "علاقتك معنا": حالة مبسّطة + سرعة شحن مفضّلة.
--   • الربط العكسي: كل الوحدات تستهلك القرار قبل الإرسال وتغذّي الرصيد بعده.
--
-- كل الجداول tenant-scoped + RLS. idempotent.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) رصيد العلاقة لكل عميل + سرعة الشحن المفضّلة
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.relationship_balances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  balance        INTEGER NOT NULL DEFAULT 1000 CHECK (balance >= 0 AND balance <= 1000),
  -- تفضيل العميل: متحفظ (شحن أبطأ/عتبات أعلى) / متوازن / مفتوح
  pace_preference TEXT NOT NULL DEFAULT 'balanced' CHECK (pace_preference IN ('conservative','balanced','open')),
  last_contact_at TIMESTAMPTZ,             -- آخر تواصل ترويجي (للشحن الزمني +10/24س)
  last_recharge_at TIMESTAMPTZ,            -- آخر شحن زمني طُبّق
  no_open_streak INTEGER NOT NULL DEFAULT 0, -- عدّاد عدم فتح الرسائل المتتالية
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_rel_balances ON public.relationship_balances(tenant_id, balance);

-- سجل حركات الرصيد (خصم/شحن) — شفافية + تدقيق + حساب الدَّين
CREATE TABLE IF NOT EXISTS public.relationship_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  event_key      TEXT NOT NULL,            -- 'email_sent','sms_sent','nps_positive'...
  direction      TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  points         INTEGER NOT NULL,         -- موجبة دائماً؛ الاتجاه يحدد الإشارة
  balance_after  INTEGER NOT NULL,
  source_system  TEXT,                     -- 'email','sms','whatsapp','event','survey','social','automation'
  reason         TEXT,                     -- سطر شفافية للعميل
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rel_ledger_lead ON public.relationship_ledger(tenant_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rel_ledger_debt ON public.relationship_ledger(tenant_id, direction, created_at);

-- سجل قرارات الحوكمة (allow/defer/block) — تدقيق كامل
CREATE TABLE IF NOT EXISTS public.governance_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id        UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  source_system  TEXT NOT NULL,           -- النظام الطالب
  channel        TEXT,                     -- email/sms/whatsapp/event/survey
  decision       TEXT NOT NULL CHECK (decision IN ('allow','defer','block')),
  reason         TEXT NOT NULL,
  balance_at_time INTEGER,
  suggested_channel TEXT,                  -- قناة بديلة أهدأ
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gov_log ON public.governance_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_log_decision ON public.governance_log(tenant_id, decision);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) التقويم الثقافي/الزمني (مناسبات + قواعد إيقاف)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cultural_calendar (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  occasion_type  TEXT NOT NULL CHECK (occasion_type IN ('ramadan','prayer_window','national_day','weekend','mourning','custom')),
  country        TEXT,                     -- خاص بدولة (national_day) أو NULL للعام
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  -- الأثر: خفض/تأجيل/إيقاف الترويجي
  effect         TEXT NOT NULL DEFAULT 'reduce' CHECK (effect IN ('reduce','defer','suspend_promotional','suspend_all')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cultural_cal ON public.cultural_calendar(tenant_id, is_active, starts_at);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) المناعة الذاتية: تنبيهات الشذوذ + التعليق التلقائي
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.immune_incidents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  incident_type  TEXT NOT NULL CHECK (incident_type IN ('unsubscribe_spike','complaint_spike','bounce_spike','broken_link','manual')),
  severity       TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning','critical')),
  description    TEXT NOT NULL,
  campaign_ref   TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','suspended','resolved')),
  auto_suspended BOOLEAN NOT NULL DEFAULT false,
  recovery_draft TEXT,                     -- مسودة اعتذار مقترحة
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_immune_incidents ON public.immune_incidents(tenant_id, status, created_at DESC);

-- إعدادات المنصة للمناعة (تعليق عام/حداد)
CREATE TABLE IF NOT EXISTS public.immune_settings (
  tenant_id      UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  global_promotional_paused BOOLEAN NOT NULL DEFAULT false,  -- حداد/طوارئ
  pause_reason   TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) RLS
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'relationship_balances','relationship_ledger','governance_log',
    'cultural_calendar','immune_incidents','immune_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (5) حالة الرصيد من القيمة (عتبات التقرير)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.relationship_status(p_balance INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_balance >= 800 THEN 'healthy'
    WHEN p_balance >= 500 THEN 'good'
    WHEN p_balance >= 300 THEN 'warning'
    WHEN p_balance >= 150 THEN 'danger'
    ELSE 'critical'
  END;
$$;

-- جدول نقاط الأحداث (خصم/شحن) — مصدر موحّد من التقرير
CREATE OR REPLACE FUNCTION public.relationship_event_points(p_event_key TEXT)
RETURNS TABLE (direction TEXT, points INTEGER)
LANGUAGE sql IMMUTABLE AS $$
  SELECT d, p FROM (VALUES
    -- خصومات
    ('email_sent','debit',15),
    ('sms_sent','debit',25),
    ('whatsapp_sent','debit',20),
    ('retargeting_ad','debit',5),
    ('event_invite','debit',30),
    ('survey_sent','debit',40),
    ('no_open_streak','debit',20),
    ('low_ces','debit',80),
    ('negative_sentiment','debit',100),
    ('channel_unsubscribe','debit',150),
    ('spam_complaint','debit',300),
    -- شحنات
    ('idle_24h','credit',10),
    ('email_opened','credit',15),
    ('link_clicked','credit',25),
    ('survey_completed','credit',20),
    ('event_attended','credit',50),
    ('high_csat','credit',40),
    ('nps_positive','credit',80),
    ('purchase','credit',100)
  ) AS t(key, d, p)
  WHERE key = p_event_key;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (6) ضمان وجود رصيد لعميل (إنشاء تلقائي عند أول تفاعل)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.ensure_relationship_balance(p_lead_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID; v_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.marketing_leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  INSERT INTO public.relationship_balances (tenant_id, lead_id) VALUES (v_tenant, p_lead_id)
  ON CONFLICT (tenant_id, lead_id) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) تطبيق حدث على الرصيد (خصم/شحن) — يسجّل في الـ ledger
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_relationship_event(
  p_lead_id     UUID,
  p_event_key   TEXT,
  p_source      TEXT DEFAULT NULL,
  p_reason      TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID; v_dir TEXT; v_pts INTEGER; v_new INTEGER; v_delta INTEGER;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.marketing_leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  PERFORM public.ensure_relationship_balance(p_lead_id);
  SELECT direction, points INTO v_dir, v_pts FROM public.relationship_event_points(p_event_key);
  IF v_dir IS NULL THEN RETURN (SELECT balance FROM public.relationship_balances WHERE lead_id = p_lead_id); END IF;

  v_delta := CASE WHEN v_dir = 'debit' THEN -v_pts ELSE v_pts END;

  UPDATE public.relationship_balances
     SET balance = LEAST(GREATEST(balance + v_delta, 0), 1000),
         last_contact_at = CASE WHEN v_dir='debit' THEN NOW() ELSE last_contact_at END,
         updated_at = NOW()
   WHERE lead_id = p_lead_id
  RETURNING balance INTO v_new;

  INSERT INTO public.relationship_ledger (tenant_id, lead_id, event_key, direction, points, balance_after, source_system, reason)
  VALUES (v_tenant, p_lead_id, p_event_key, v_dir, v_pts, v_new, p_source, p_reason);

  RETURN v_new;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) نقطة التفتيش المركزية — الحوكمة اللحظية
--  يستدعيها أي نظام قبل الإرسال. يعيد القرار ويسجّله.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.governance_check(
  p_lead_id     UUID,
  p_source      TEXT,               -- النظام الطالب
  p_channel     TEXT,               -- القناة
  p_is_promotional BOOLEAN DEFAULT true
)
RETURNS TABLE (decision TEXT, reason TEXT, out_balance INTEGER, suggested_channel TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID; v_bal INTEGER; v_status TEXT; v_decision TEXT; v_reason TEXT; v_suggest TEXT := NULL;
  v_global_pause BOOLEAN; v_last_contact TIMESTAMPTZ; v_cultural TEXT;
BEGIN
  SELECT ml.tenant_id INTO v_tenant FROM public.marketing_leads ml WHERE ml.id = p_lead_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  PERFORM public.ensure_relationship_balance(p_lead_id);
  SELECT rb.balance, rb.last_contact_at INTO v_bal, v_last_contact FROM public.relationship_balances rb WHERE rb.lead_id = p_lead_id;
  v_status := public.relationship_status(v_bal);

  -- (أ) تعليق عام (حداد/طوارئ) على مستوى المنصة
  SELECT global_promotional_paused INTO v_global_pause FROM public.immune_settings WHERE tenant_id = v_tenant;
  IF COALESCE(v_global_pause, false) AND p_is_promotional THEN
    v_decision := 'block'; v_reason := 'تعليق عام للمحتوى الترويجي (حداد/طوارئ)';

  -- (ب) الطبقة الثقافية: مناسبة نشطة الآن تُوقف الترويجي
  ELSIF p_is_promotional AND EXISTS (
    SELECT 1 FROM public.cultural_calendar
    WHERE tenant_id = v_tenant AND is_active
      AND effect IN ('suspend_promotional','suspend_all')
      AND NOW() BETWEEN COALESCE(starts_at, NOW()) AND COALESCE(ends_at, NOW())
  ) THEN
    SELECT name INTO v_cultural FROM public.cultural_calendar
     WHERE tenant_id=v_tenant AND is_active AND effect IN ('suspend_promotional','suspend_all')
       AND NOW() BETWEEN COALESCE(starts_at, NOW()) AND COALESCE(ends_at, NOW()) LIMIT 1;
    v_decision := 'defer'; v_reason := 'مناسبة ثقافية/زمنية: ' || COALESCE(v_cultural,'');

  -- (ج) عتبات الرصيد
  ELSIF v_status = 'critical' THEN
    v_decision := 'block'; v_reason := 'رصيد حرج (<150) — تعليق تام + تصعيد لمدير النجاح';
  ELSIF v_status = 'danger' THEN
    v_decision := 'block'; v_reason := 'رصيد في خطر (150-299) — تعليق الحملات + تنبيه موظف';
  ELSIF v_status = 'warning' THEN
    IF p_is_promotional THEN
      v_decision := 'block'; v_reason := 'رصيد إنذار (300-499) — تشغيلي فقط';
      v_suggest := 'email'; -- اقتراح قناة أهدأ
    ELSE
      v_decision := 'allow'; v_reason := 'تشغيلي مسموح رغم رصيد الإنذار';
    END IF;
  ELSIF v_status = 'good' THEN
    -- تباعد إلزامي 24-48 ساعة
    IF p_is_promotional AND v_last_contact IS NOT NULL AND v_last_contact > NOW() - interval '24 hours' THEN
      v_decision := 'defer'; v_reason := 'رصيد جيد (500-799) — تباعد إلزامي: تواصل حديث قبل <24 ساعة';
    ELSE
      v_decision := 'allow'; v_reason := 'رصيد جيد — مسموح مع تباعد';
    END IF;
  ELSE
    v_decision := 'allow'; v_reason := 'رصيد صحي (800+) — كل الأنظمة تعمل بحرية';
  END IF;

  INSERT INTO public.governance_log (tenant_id, lead_id, source_system, channel, decision, reason, balance_at_time, suggested_channel)
  VALUES (v_tenant, p_lead_id, p_source, p_channel, v_decision, v_reason, v_bal, v_suggest);

  RETURN QUERY SELECT v_decision, v_reason, v_bal, v_suggest;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) الدَّين التسويقي (تراكمي على مستوى الشركة لفترة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.marketing_debt(p_days INTEGER DEFAULT 90)
RETURNS TABLE (total_debit BIGINT, total_credit BIGINT, net_debt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(sum(points) FILTER (WHERE direction='debit'),0),
    COALESCE(sum(points) FILTER (WHERE direction='credit'),0),
    COALESCE(sum(points) FILTER (WHERE direction='debit'),0) - COALESCE(sum(points) FILTER (WHERE direction='credit'),0)
  FROM public.relationship_ledger
  WHERE tenant_id = public.current_user_tenant_id()
    AND created_at >= NOW() - (p_days || ' days')::interval;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) المناعة الذاتية: تسجيل حادث + تعليق تلقائي عند الشدة الحرجة
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.raise_immune_incident(
  p_type TEXT, p_severity TEXT, p_description TEXT, p_campaign_ref TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID; v_id UUID; v_auto BOOLEAN := false; v_draft TEXT := NULL;
BEGIN
  v_tenant := public.current_user_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant context'; END IF;

  IF p_severity = 'critical' THEN
    v_auto := true;
    v_draft := 'نعتذر بصدق — لاحظنا خللاً في رسالتنا الأخيرة وأوقفناها فوراً. كتقدير لوقتك، إليك ' ||
               'عرضاً رمزياً كبادرة حسن نية. شكراً لتفهّمك.';
    -- تعليق تلقائي عام للترويجي
    INSERT INTO public.immune_settings (tenant_id, global_promotional_paused, pause_reason)
    VALUES (v_tenant, true, 'تعليق تلقائي: ' || p_description)
    ON CONFLICT (tenant_id) DO UPDATE SET global_promotional_paused = true, pause_reason = EXCLUDED.pause_reason, updated_at = NOW();
  END IF;

  INSERT INTO public.immune_incidents (tenant_id, incident_type, severity, description, campaign_ref, status, auto_suspended, recovery_draft)
  VALUES (v_tenant, p_type, p_severity, p_description, p_campaign_ref,
          CASE WHEN v_auto THEN 'suspended' ELSE 'open' END, v_auto, v_draft)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- حل حادث + رفع التعليق العام
CREATE OR REPLACE FUNCTION public.resolve_immune_incident(p_incident_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.immune_incidents WHERE id = p_incident_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'incident not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  UPDATE public.immune_incidents SET status = 'resolved', resolved_at = NOW() WHERE id = p_incident_id;
  -- رفع التعليق العام إن لم تبقَ حوادث حرجة مفتوحة
  IF NOT EXISTS (SELECT 1 FROM public.immune_incidents WHERE tenant_id=v_tenant AND status='suspended') THEN
    UPDATE public.immune_settings SET global_promotional_paused = false, pause_reason = NULL, updated_at = NOW() WHERE tenant_id = v_tenant;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) الصلاحيات
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.relationship_status(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_event_points(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_relationship_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_relationship_event(UUID,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_check(UUID,TEXT,TEXT,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_debt(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.raise_immune_incident(TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_immune_incident(UUID) TO authenticated;

-- ============================================================================
--  نهاية 0163_relationship_immune_system.sql
-- ============================================================================
