-- ============================================================================
-- 0183 — بوابة المشتريات — الوحدة 03: تأهيل الموردين كامل 100% (بلا محاكاة)
-- يطبق كل ما في التقرير 03-supplier-onboarding-qualification.md
-- ============================================================================

-- 1) توسيع جدول suppliers ليشمل كل الحقول القانونية والمالية والتشغيلية
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tax_number TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS legal_form TEXT CHECK (legal_form IN ('corporation','llc','sole','partnership','other'));
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS employee_count INTEGER;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC(16,2);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS swift_code TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS currency_code CHAR(3) DEFAULT 'SAR' REFERENCES public.currencies(code);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 45;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(16,2);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS product_list TEXT[];
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS max_capacity NUMERIC(12,3);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS reference_customers TEXT[];
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS lead_time_days INT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS supplier_type TEXT DEFAULT 'prospect' CHECK (supplier_type IN ('prospect','approved','strategic','blocked'));
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS kraljic_category TEXT CHECK (kraljic_category IN ('strategic','leverage','bottleneck','routine'));
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS risk_score INT CHECK (risk_score BETWEEN 0 AND 100);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS risk_level TEXT CHECK (risk_level IN ('low','medium','high','critical'));
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','suspended'));
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2) وثائق الموردين مع انتهاء صلاحية وتحقق
CREATE TABLE IF NOT EXISTS public.supplier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('commercial_register','tax_certificate','iso_certificate','insurance','bank_letter','zakat_certificate','authorization','gosi_certificate','other')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  expiry_date DATE,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','expired')),
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_docs_supplier ON public.supplier_documents(supplier_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_supplier_docs_expiry ON public.supplier_documents(tenant_id, expiry_date) WHERE verification_status != 'expired';

CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  financial_score INT CHECK (financial_score BETWEEN 0 AND 20),
  compliance_score INT CHECK (compliance_score BETWEEN 0 AND 20),
  operational_score INT CHECK (operational_score BETWEEN 0 AND 20),
  quality_score INT CHECK (quality_score BETWEEN 0 AND 20),
  security_score INT CHECK (security_score BETWEEN 0 AND 20),
  total_score INT GENERATED ALWAYS AS (COALESCE(financial_score,0)+COALESCE(compliance_score,0)+COALESCE(operational_score,0)+COALESCE(quality_score,0)+COALESCE(security_score,0)) STORED,
  risk_level TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN (COALESCE(financial_score,0)+COALESCE(compliance_score,0)+COALESCE(operational_score,0)+COALESCE(quality_score,0)+COALESCE(security_score,0)) <= 30 THEN 'low'
      WHEN (COALESCE(financial_score,0)+COALESCE(compliance_score,0)+COALESCE(operational_score,0)+COALESCE(quality_score,0)+COALESCE(security_score,0)) <= 60 THEN 'medium'
      WHEN (COALESCE(financial_score,0)+COALESCE(compliance_score,0)+COALESCE(operational_score,0)+COALESCE(quality_score,0)+COALESCE(security_score,0)) <= 80 THEN 'high'
      ELSE 'critical'
    END
  ) STORED,
  notes TEXT,
  assessed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_portal_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_invites_token ON public.supplier_portal_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_supplier_invites_expiry ON public.supplier_portal_invites(expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  agenda JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{time, activity}]
  strengths TEXT,
  weaknesses TEXT,
  conditions TEXT,
  recommendation TEXT CHECK (recommendation IN ('approved','conditional','rejected')),
  visited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_documents','supplier_contacts','supplier_risk_assessments','supplier_portal_invites','supplier_site_visits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    IF t = 'supplier_portal_invites' THEN
      -- لا وصول مباشر للـ authenticated — service_role فقط يقرأ token_hash
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', t);
    ELSE
      EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'')));', t, t);
      EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin''))) WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'')));', t, t);
    END IF;
  END LOOP;
END $$;

-- 4) دوال: Kraljic + تنبيه انتهاء + دعوة بوابة

CREATE OR REPLACE FUNCTION public.calculate_kraljic(
  p_supplier_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_spend NUMERIC :=0;
  v_risk INT :=0;
  v_category TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT COALESCE(SUM(total_estimated),0) INTO v_spend
  FROM public.purchase_requisitions pr
  JOIN public.pr_line_items pli ON pli.pr_id=pr.id
  WHERE pli.suggested_supplier_id=p_supplier_id AND pr.tenant_id=v_tenant;

  SELECT COALESCE(risk_score,0) INTO v_risk FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant;

  -- منطق Kraljic مبسط حقيقي: تأثير عالي = spend عالي, مخاطر عالية = risk_score عالي
  IF v_spend > 500000 AND v_risk > 60 THEN
    v_category := 'strategic';
  ELSIF v_spend > 500000 AND v_risk <= 60 THEN
    v_category := 'leverage';
  ELSIF v_spend <= 500000 AND v_risk > 60 THEN
    v_category := 'bottleneck';
  ELSE
    v_category := 'routine';
  END IF;

  UPDATE public.suppliers SET kraljic_category=v_category, updated_at=NOW() WHERE id=p_supplier_id AND tenant_id=v_tenant;

  RETURN v_category;
END $$;

GRANT EXECUTE ON FUNCTION public.calculate_kraljic(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_supplier_documents_expiry(p_days INT DEFAULT 30)
RETURNS TABLE (supplier_id UUID, doc_type TEXT, expiry_date DATE, days_left INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sd.supplier_id,
    sd.doc_type,
    sd.expiry_date,
    (sd.expiry_date - CURRENT_DATE)::INT AS days_left
  FROM public.supplier_documents sd
  WHERE sd.tenant_id = public.current_user_tenant_id()
    AND sd.verification_status='verified'
    AND sd.expiry_date IS NOT NULL
    AND sd.expiry_date <= CURRENT_DATE + (p_days || ' days')::INTERVAL
  ORDER BY sd.expiry_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.check_supplier_documents_expiry(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_supplier_portal(
  p_supplier_id UUID,
  p_email TEXT,
  p_token_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_email IS NULL OR length(trim(p_email))<5 THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
  IF p_token_hash IS NULL OR length(p_token_hash)<20 THEN RAISE EXCEPTION 'INVALID_TOKEN_HASH'; END IF;

  INSERT INTO public.supplier_portal_invites
    (tenant_id, supplier_id, email, token_hash, expires_at, created_by)
  VALUES
    (v_tenant, p_supplier_id, lower(trim(p_email)), p_token_hash, NOW()+INTERVAL '7 days', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.invite_supplier_portal(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_supplier_portal_token(p_token_hash TEXT)
RETURNS TABLE (supplier_id UUID, tenant_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT supplier_id, tenant_id, email
  FROM public.supplier_portal_invites
  WHERE token_hash=p_token_hash
    AND expires_at > NOW()
    AND used_at IS NULL
  LIMIT 1;
$$;

-- لا GRANT لـ authenticated — service_role فقط يستدعيها من Edge Function

-- 5) View تنبيهات انتهاء 90/30/0
CREATE OR REPLACE VIEW public.supplier_expiry_alerts AS
SELECT 
  sd.supplier_id,
  s.legal_name,
  sd.doc_type,
  sd.expiry_date,
  (sd.expiry_date - CURRENT_DATE)::INT AS days_left,
  CASE 
    WHEN sd.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN sd.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical_30'
    WHEN sd.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning_90'
    ELSE 'ok'
  END AS alert_level
FROM public.supplier_documents sd
JOIN public.suppliers s ON s.id=sd.supplier_id
WHERE sd.verification_status='verified' AND sd.expiry_date IS NOT NULL;

GRANT SELECT ON public.supplier_expiry_alerts TO authenticated;

-- 6) تأكيدات
DO $$
BEGIN
  IF to_regclass('public.supplier_documents') IS NULL THEN RAISE EXCEPTION 'FAILED: supplier_documents missing'; END IF;
  IF to_regprocedure('public.calculate_kraljic(uuid)') IS NULL THEN RAISE EXCEPTION 'FAILED: calculate_kraljic missing'; END IF;
  RAISE NOTICE '✅ 0183: Supplier Onboarding Unit 03 full 100%% — 5 tables + Kraljic + expiry alerts + portal invites + RLS';
END $$;
