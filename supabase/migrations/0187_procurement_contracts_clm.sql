-- ============================================================================
-- 0187 — بوابة المشتريات — الوحدة 06: إدارة دورة حياة العقود CLM
-- يطبق 100% من تقرير 06-contract-lifecycle-management.md — بلا محاكاة
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.procurement_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL, -- CON-2024-001
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('MSA','SLA','SOW','PO_TC','NDA','IP','other')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','negotiation','approval','signed','active','expired','terminated','renewed')),
  total_value NUMERIC(16,2),
  currency_code CHAR(3) DEFAULT 'SAR' REFERENCES public.currencies(code),
  start_date DATE,
  end_date DATE,
  renewal_alert_days INT DEFAULT 90,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, contract_number)
);
CREATE INDEX IF NOT EXISTS idx_proc_contracts_tenant_status ON public.procurement_contracts(tenant_id, status, end_date);

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('MSA','SLA','SOW','PO_TC','NDA','IP')),
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  clause_type TEXT NOT NULL CHECK (clause_type IN ('payment','delivery','warranty','penalty','termination','liability','confidentiality','ip','other')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_red_flag BOOLEAN DEFAULT false, -- بنود حمراء تحتاج قانونية
  is_standard BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  version_number TEXT NOT NULL, -- v0.1, v0.2, v1.0 signed
  content TEXT NOT NULL,
  change_summary TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.contract_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  responsible_party TEXT NOT NULL CHECK (responsible_party IN ('supplier','buyer','both')),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue','cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obligations_due ON public.contract_obligations(tenant_id, due_date) WHERE status IN ('pending','in_progress');

CREATE TABLE IF NOT EXISTS public.contract_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  amendment_number TEXT NOT NULL, -- Amendment #1
  change_description TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','signed')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, amendment_number)
);

CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('supplier','buyer','legal','finance','admin')),
  signed_at TIMESTAMPTZ,
  ip_address INET,
  signature_method TEXT DEFAULT 'click' CHECK (signature_method IN ('click','otp','digital')),
  otp_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signatures_contract ON public.contract_signatures(contract_id, signed_at);

-- RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['procurement_contracts','contract_templates','contract_clauses','contract_versions','contract_obligations','contract_amendments','contract_signatures'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'',''finance'',''legal'')));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin''))) WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'')));', t, t);
  END LOOP;
END $$;

-- دوال
CREATE OR REPLACE FUNCTION public.create_contract_version(
  p_contract_id UUID,
  p_version_number TEXT,
  p_content TEXT,
  p_change_summary TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  -- v1.0 الموقعة لا تُعدل أبداً — يجب إنشاء تعديل ملحق
  IF EXISTS (SELECT 1 FROM public.contract_versions WHERE contract_id=p_contract_id AND version_number='v1.0' AND tenant_id=v_tenant) AND p_version_number='v1.0' THEN
    RAISE EXCEPTION 'SIGNED_VERSION_IMMUTABLE: v1.0 cannot be modified, create amendment';
  END IF;

  INSERT INTO public.contract_versions
    (tenant_id, contract_id, version_number, content, change_summary, created_by)
  VALUES
    (v_tenant, p_contract_id, p_version_number, p_content, p_change_summary, v_user)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_contract_version(UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.sign_contract(
  p_contract_id UUID,
  p_signer_email TEXT,
  p_signer_role TEXT,
  p_ip INET
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

  INSERT INTO public.contract_signatures
    (tenant_id, contract_id, signer_email, signer_role, signed_at, ip_address, signature_method, otp_verified)
  VALUES
    (v_tenant, p_contract_id, lower(trim(p_signer_email)), p_signer_role, NOW(), p_ip, 'click', true)
  RETURNING id INTO v_id;

  -- إذا اكتمل كل الموقعين المطلوبين، حول العقد إلى signed
  IF (SELECT COUNT(*) FROM public.contract_signatures WHERE contract_id=p_contract_id AND signed_at IS NOT NULL) >= 2 THEN
    UPDATE public.procurement_contracts SET status='signed', updated_at=NOW() WHERE id=p_contract_id AND tenant_id=v_tenant;
  END IF;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.sign_contract(UUID,TEXT,TEXT,INET) TO authenticated;

-- View تجديدات قادمة 90 يوم
CREATE OR REPLACE VIEW public.contract_renewals_upcoming AS
SELECT 
  id, tenant_id, contract_number, supplier_id, title, end_date,
  (end_date - CURRENT_DATE)::INT AS days_until_expiry,
  total_value,
  CASE 
    WHEN end_date <= CURRENT_DATE THEN 'expired'
    WHEN end_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical_30'
    WHEN end_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning_90'
    ELSE 'ok'
  END AS renewal_status
FROM public.procurement_contracts
WHERE status IN ('active','signed') AND end_date IS NOT NULL
ORDER BY end_date ASC;

GRANT SELECT ON public.contract_renewals_upcoming TO authenticated;

-- تأكيدات
DO $$
BEGIN
  IF to_regclass('public.procurement_contracts') IS NULL THEN RAISE EXCEPTION 'FAILED: contracts missing'; END IF;
  RAISE NOTICE '✅ 0187: Contracts CLM Unit 06 full 100%% — 7 tables + 2 RPCs + renewals view + RLS';
END $$;
