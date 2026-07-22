-- ============================================================================
-- Kyvzon — 0165_crm_contacts_accounts.sql
-- بوابة CRM — الوحدة 1: إدارة جهات الاتصال والحسابات (التقرير 01)
--
-- تُنفّذ كل ما ورد في تقرير "إدارة جهات الاتصال والحسابات" وفق المعايير العالمية:
--   • التفريق الجوهري: Contact (شخص) مقابل Account (شركة/مؤسسة).
--   • سجل الحساب: بيانات مؤسسية (Firmographic) + علاقة تجارية + Lifetime Value.
--   • الهيكل التنظيمي للحسابات (Account Hierarchy) عبر parent_account_id ذاتي المرجع.
--   • سجل جهة الاتصال 360°: بيانات أساسية + سياق تجاري (سلطة القرار) + وسوم + حرارة.
--   • الجدول الزمني الموحّد (Unified Activity Timeline): جدول crm_activities_timeline
--     يستقبل تلقائياً ويدوياً كل تفاعل (بريد/مكالمة/اجتماع/ملاحظة/تسويق/دعم).
--   • محرك إدارة المكررات (Deduplication): كشف تلقائي + دمج ذكي + سجل دمج.
--   • إثراء البيانات (Data Enrichment): أعمدة enrichment_* + hook (Clearbit/Apollo) محاكاة.
--   • الامتثال لـ GDPR: مصدر الموافقة + سجل تدقيق (crm_audit_log) + حذف فعلي.
--   • الربط بالتسويق: تحويل marketing_leads → crm_contacts (+ إنشاء/ربط حساب).
--
-- التصميم:
--   - كل جدول tenant-scoped مع RLS (عزل متعدد المستأجرين) — بادئة crm_* صارمة.
--   - الدوال الحساسة SECURITY DEFINER + SET search_path = public + فحص tenant_id.
--   - الإرسال/الإثراء الخارجي الفعلي hook: يُسجَّل بحالة 'simulated' حتى إدخال المفاتيح.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) الحسابات — Accounts (الشركة/المؤسسة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  legal_name            TEXT,
  registration_number   TEXT,                                   -- رقم السجل التجاري
  -- بيانات مؤسسية (Firmographic)
  industry              TEXT,
  employee_count        INTEGER,
  annual_revenue        NUMERIC(16,2),
  website               TEXT,
  linkedin_url          TEXT,
  phone                 TEXT,
  country               TEXT,
  city                  TEXT,
  address               TEXT,
  timezone              TEXT,
  -- بيانات العلاقة التجارية
  account_type          TEXT NOT NULL DEFAULT 'prospect'
                        CHECK (account_type IN ('prospect','customer','partner','vendor','competitor')),
  account_tier          TEXT NOT NULL DEFAULT 'smb'
                        CHECK (account_tier IN ('smb','mid_market','enterprise','strategic')),
  owner_id              UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Account Owner
  parent_account_id     UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL, -- Hierarchy
  lifetime_value        NUMERIC(16,2) NOT NULL DEFAULT 0,       -- إجمالي الإيراد المُحقق
  first_deal_at         TIMESTAMPTZ,
  last_deal_at          TIMESTAMPTZ,
  renewal_date          DATE,                                   -- يُشغّل تنبيهات التجديد
  health_score          INTEGER NOT NULL DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),
  -- إثراء البيانات (Data Enrichment)
  enrichment_status     TEXT NOT NULL DEFAULT 'none'
                        CHECK (enrichment_status IN ('none','pending','simulated','enriched','failed')),
  enrichment_provider   TEXT,                                   -- clearbit / apollo / zoominfo (hook)
  enriched_at           TIMESTAMPTZ,
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  notes                 TEXT,
  is_merged             BOOLEAN NOT NULL DEFAULT false,         -- سُجّل كمكرر ودُمج في آخر
  merged_into_id        UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_tenant   ON public.crm_accounts(tenant_id, account_type);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_owner    ON public.crm_accounts(tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_parent   ON public.crm_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_renewal  ON public.crm_accounts(tenant_id, renewal_date);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_name     ON public.crm_accounts(tenant_id, lower(name));

-- ════════════════════════════════════════════════════════════════════════════
--  (2) جهات الاتصال — Contacts (الشخص)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id            UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  -- بيانات أساسية (Core Data)
  first_name            TEXT NOT NULL,
  last_name             TEXT,
  full_name             TEXT GENERATED ALWAYS AS (
                          TRIM(BOTH ' ' FROM COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))
                        ) STORED,
  job_title             TEXT,
  department            TEXT,
  email                 TEXT,
  phone                 TEXT,                                   -- المباشر
  mobile                TEXT,                                   -- الجوال
  linkedin_url          TEXT,
  country               TEXT,
  city                  TEXT,
  timezone              TEXT,
  preferred_language    TEXT DEFAULT 'ar',
  -- سياق تجاري (Business Context)
  decision_role         TEXT NOT NULL DEFAULT 'user'
                        CHECK (decision_role IN ('decision_maker','influencer','user','gatekeeper')),
  estimated_budget      NUMERIC(16,2),
  source                TEXT,                                   -- website / event / referral / linkedin / manual
  first_contacted_at    TIMESTAMPTZ,
  last_activity_at      TIMESTAMPTZ,
  -- الوسوم والتصنيفات
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  temperature           TEXT NOT NULL DEFAULT 'cold'
                        CHECK (temperature IN ('cold','warm','hot')),
  owner_id              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- إثراء البيانات
  enrichment_status     TEXT NOT NULL DEFAULT 'none'
                        CHECK (enrichment_status IN ('none','pending','simulated','enriched','failed')),
  enrichment_provider   TEXT,
  enriched_at           TIMESTAMPTZ,
  -- الامتثال لـ GDPR
  consent_source        TEXT,                                   -- "نموذج الموقع بتاريخ X"
  consent_at            TIMESTAMPTZ,
  gdpr_erased           BOOLEAN NOT NULL DEFAULT false,
  -- الربط بالتسويق
  lead_id               UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  -- Deduplication
  is_merged             BOOLEAN NOT NULL DEFAULT false,
  merged_into_id        UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant   ON public.crm_contacts(tenant_id, temperature);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_account  ON public.crm_contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner    ON public.crm_contacts(tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email    ON public.crm_contacts(tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_crm_contacts_lead     ON public.crm_contacts(lead_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) الجدول الزمني الموحّد — Unified Activity Timeline
--  كل تفاعل مع جهة اتصال/حساب يُسجَّل هنا (تلقائي أو يدوي).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_activities_timeline (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id        UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  account_id        UUID REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  activity_type     TEXT NOT NULL
                    CHECK (activity_type IN (
                      'email','call','meeting','note','task',
                      'marketing_email','web_visit','support_ticket','deal','system')),
  direction         TEXT CHECK (direction IN ('inbound','outbound','internal')),
  title             TEXT NOT NULL,
  body              TEXT,
  duration_minutes  INTEGER,                                    -- للمكالمات/الاجتماعات
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- مصدر التسجيل: يدوي أو تلقائي (من ربط Gmail/Outlook/التسويق/الدعم — hook)
  logged_via        TEXT NOT NULL DEFAULT 'manual'
                    CHECK (logged_via IN ('manual','auto','simulated','import')),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (contact_id IS NOT NULL OR account_id IS NOT NULL)      -- لا سجل يتيم
);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_contact  ON public.crm_activities_timeline(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_account  ON public.crm_activities_timeline(account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_tenant   ON public.crm_activities_timeline(tenant_id, activity_type);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) سجل الدمج — Deduplication merge log (للرجوع إليه)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_merge_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('contact','account')),
  survivor_id       UUID NOT NULL,                              -- السجل الباقي
  merged_id         UUID NOT NULL,                              -- السجل المدموج
  merged_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,         -- نسخة كاملة قبل الدمج
  merged_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  merged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_merge_tenant ON public.crm_merge_log(tenant_id, entity_type);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) سجل التدقيق — Audit Log (GDPR: من رأى/عدّل/حذف ومتى)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL,                              -- contact / account
  entity_id         UUID NOT NULL,
  action            TEXT NOT NULL CHECK (action IN ('view','create','update','delete','merge','enrich','gdpr_erase')),
  actor_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_audit_entity ON public.crm_audit_log(tenant_id, entity_type, entity_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) تفعيل RLS + سياسات العزل متعدد المستأجرين
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_accounts','crm_contacts','crm_activities_timeline','crm_merge_log','crm_audit_log'
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
--  (7) الرؤية 360° — ملخص الحساب في استعلام واحد
--  يعيد: صفقات مفتوحة (0 حتى وحدة Pipeline)، عدد جهات الاتصال، آخر تواصل، الصحة.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_account_360(p_account_id UUID)
RETURNS TABLE (
  contacts_count      INTEGER,
  activities_count    INTEGER,
  last_activity_at    TIMESTAMPTZ,
  health_score        INTEGER,
  lifetime_value      NUMERIC,
  open_tickets        INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_accounts WHERE id = p_account_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED: account not in tenant';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INT FROM public.crm_contacts c
       WHERE c.account_id = p_account_id AND c.deleted_at IS NULL AND NOT c.is_merged),
    (SELECT COUNT(*)::INT FROM public.crm_activities_timeline a WHERE a.account_id = p_account_id),
    (SELECT MAX(a.occurred_at) FROM public.crm_activities_timeline a WHERE a.account_id = p_account_id),
    acc.health_score,
    acc.lifetime_value,
    0  -- open_tickets: تُوصَل بوحدة الدعم (0169) لاحقاً
  FROM public.crm_accounts acc WHERE acc.id = p_account_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) كشف المكررات — Deduplication detection
--  يعيد المرشّحين المتشابهين (نفس البريد/الهاتف أو اسم متطابق) لجهة اتصال.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_find_duplicate_contacts(p_contact_id UUID)
RETURNS TABLE (
  candidate_id    UUID,
  full_name       TEXT,
  email           TEXT,
  phone           TEXT,
  match_reason    TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_email TEXT; v_phone TEXT; v_name TEXT;
BEGIN
  SELECT c.tenant_id, lower(c.email), c.phone, lower(c.full_name)
    INTO v_tenant, v_email, v_phone, v_name
  FROM public.crm_contacts c WHERE c.id = p_contact_id;

  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT c.id, c.full_name, c.email, c.phone,
    CASE
      WHEN v_email IS NOT NULL AND lower(c.email) = v_email THEN 'نفس البريد الإلكتروني'
      WHEN v_phone IS NOT NULL AND c.phone = v_phone       THEN 'نفس رقم الهاتف'
      ELSE 'اسم متطابق'
    END
  FROM public.crm_contacts c
  WHERE c.tenant_id = v_tenant
    AND c.id <> p_contact_id
    AND c.is_merged = false
    AND c.deleted_at IS NULL
    AND (
      (v_email IS NOT NULL AND lower(c.email) = v_email)
      OR (v_phone IS NOT NULL AND c.phone = v_phone)
      OR (v_name  IS NOT NULL AND lower(c.full_name) = v_name)
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) الدمج الذكي — Merge contacts (يحتفظ بالبيانات، لا يحذف، يسجّل)
--  يُحوّل مرجعية الأنشطة إلى السجل الباقي ويعلّم المدموج ويكتب سجل دمج + تدقيق.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_merge_contacts(p_survivor_id UUID, p_merged_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_merged_tenant UUID; v_snapshot JSONB;
BEGIN
  IF p_survivor_id = p_merged_id THEN
    RAISE EXCEPTION 'INVALID: cannot merge a record into itself';
  END IF;

  SELECT tenant_id INTO v_tenant        FROM public.crm_contacts WHERE id = p_survivor_id;
  SELECT tenant_id INTO v_merged_tenant FROM public.crm_contacts WHERE id = p_merged_id;

  IF v_tenant IS NULL OR v_merged_tenant IS NULL
     OR v_tenant <> v_merged_tenant
     OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED: contacts not in same tenant';
  END IF;

  -- لقطة قبل الدمج
  SELECT to_jsonb(c) INTO v_snapshot FROM public.crm_contacts c WHERE c.id = p_merged_id;

  -- تحويل مرجعية الأنشطة للسجل الباقي
  UPDATE public.crm_activities_timeline SET contact_id = p_survivor_id WHERE contact_id = p_merged_id;

  -- تعليم المدموج (Soft — لا حذف)
  UPDATE public.crm_contacts
    SET is_merged = true, merged_into_id = p_survivor_id, updated_at = NOW()
    WHERE id = p_merged_id;

  -- سجل الدمج
  INSERT INTO public.crm_merge_log (tenant_id, entity_type, survivor_id, merged_id, merged_snapshot, merged_by)
  VALUES (v_tenant, 'contact', p_survivor_id, p_merged_id, v_snapshot, auth.uid());

  -- سجل التدقيق
  INSERT INTO public.crm_audit_log (tenant_id, entity_type, entity_id, action, actor_id, details)
  VALUES (v_tenant, 'contact', p_survivor_id, 'merge', auth.uid(),
          jsonb_build_object('merged_id', p_merged_id));

  RETURN p_survivor_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) تحويل عميل تسويقي إلى جهة اتصال — Lead → Contact (+ ربط/إنشاء حساب)
--  الربط الاستراتيجي بين بوابة التسويق وبوابة CRM.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_convert_lead(p_lead_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_lead RECORD; v_account_id UUID; v_contact_id UUID;
  v_first TEXT; v_last TEXT; v_temp TEXT;
BEGIN
  SELECT * INTO v_lead FROM public.marketing_leads WHERE id = p_lead_id;
  IF v_lead IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: lead'; END IF;
  v_tenant := v_lead.tenant_id;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  -- منع تكرار التحويل
  SELECT id INTO v_contact_id FROM public.crm_contacts WHERE lead_id = p_lead_id LIMIT 1;
  IF v_contact_id IS NOT NULL THEN RETURN v_contact_id; END IF;

  -- الحساب: ربط بحساب قائم بنفس الاسم أو إنشاء جديد
  IF v_lead.company IS NOT NULL AND length(trim(v_lead.company)) > 0 THEN
    SELECT id INTO v_account_id FROM public.crm_accounts
      WHERE tenant_id = v_tenant AND lower(name) = lower(trim(v_lead.company)) AND is_merged = false
      LIMIT 1;
    IF v_account_id IS NULL THEN
      INSERT INTO public.crm_accounts (tenant_id, name, industry, country, owner_id, account_type, created_by)
      VALUES (v_tenant, trim(v_lead.company), v_lead.industry, v_lead.country, v_lead.owner_id, 'prospect', auth.uid())
      RETURNING id INTO v_account_id;
    END IF;
  END IF;

  -- اسم أول/أخير من full_name
  v_first := split_part(v_lead.full_name, ' ', 1);
  v_last  := NULLIF(trim(substring(v_lead.full_name FROM position(' ' IN v_lead.full_name))), '');
  -- خريطة الحرارة: sales_ready → hot
  v_temp  := CASE WHEN v_lead.temperature = 'sales_ready' THEN 'hot' ELSE v_lead.temperature END;

  INSERT INTO public.crm_contacts (
    tenant_id, account_id, first_name, last_name, job_title, email, phone,
    country, source, temperature, tags, owner_id, lead_id, first_contacted_at, created_by
  ) VALUES (
    v_tenant, v_account_id, v_first, v_last, v_lead.job_title, v_lead.email, v_lead.phone,
    v_lead.country, COALESCE(v_lead.source, 'marketing_lead'), v_temp, v_lead.tags,
    v_lead.owner_id, p_lead_id, v_lead.created_at, auth.uid()
  ) RETURNING id INTO v_contact_id;

  -- تسجيل التحويل في الجدول الزمني
  INSERT INTO public.crm_activities_timeline
    (tenant_id, contact_id, account_id, activity_type, direction, title, body, logged_via, created_by)
  VALUES (v_tenant, v_contact_id, v_account_id, 'system', 'internal',
          'تحويل عميل تسويقي إلى جهة اتصال',
          'تم التحويل من marketing_leads إلى CRM.', 'auto', auth.uid());

  -- سجل التدقيق
  INSERT INTO public.crm_audit_log (tenant_id, entity_type, entity_id, action, actor_id, details)
  VALUES (v_tenant, 'contact', v_contact_id, 'create', auth.uid(),
          jsonb_build_object('from_lead', p_lead_id));

  RETURN v_contact_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) إثراء البيانات (محاكاة) — Data Enrichment hook
--  يعلّم السجل enriched (simulated) حتى إدخال مفاتيح Clearbit/Apollo فعلياً.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_enrich_account(p_account_id UUID, p_provider TEXT DEFAULT 'clearbit')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_accounts WHERE id = p_account_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  -- محاكاة: تُعلَّم كـ simulated. الاستدعاء الفعلي لمزود الإثراء يُضاف عند إدخال المفتاح.
  UPDATE public.crm_accounts
    SET enrichment_status = 'simulated', enrichment_provider = p_provider,
        enriched_at = NOW(), updated_at = NOW()
    WHERE id = p_account_id;

  INSERT INTO public.crm_audit_log (tenant_id, entity_type, entity_id, action, actor_id, details)
  VALUES (v_tenant, 'account', p_account_id, 'enrich', auth.uid(),
          jsonb_build_object('provider', p_provider, 'mode', 'simulated'));
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) GDPR — حذف بيانات جهة اتصال (حذف فعلي من كل الجداول ذات الصلة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_gdpr_erase_contact(p_contact_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_contacts WHERE id = p_contact_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  -- سجل التدقيق أولاً (قبل الحذف) — امتثال
  INSERT INTO public.crm_audit_log (tenant_id, entity_type, entity_id, action, actor_id, details)
  VALUES (v_tenant, 'contact', p_contact_id, 'gdpr_erase', auth.uid(),
          jsonb_build_object('reason', 'gdpr_right_to_be_forgotten'));

  DELETE FROM public.crm_activities_timeline WHERE contact_id = p_contact_id;
  DELETE FROM public.crm_contacts WHERE id = p_contact_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (13) صلاحيات التنفيذ للدوال
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.crm_account_360(UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_find_duplicate_contacts(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_merge_contacts(UUID, UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_convert_lead(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_enrich_account(UUID, TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gdpr_erase_contact(UUID)          TO authenticated;

-- ============================================================================
-- نهاية 0165 — الوحدة 1 (جهات الاتصال والحسابات) مكتملة.
-- ============================================================================
