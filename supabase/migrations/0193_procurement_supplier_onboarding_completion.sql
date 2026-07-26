-- ============================================================================
-- 0193 — Procurement Supplier Onboarding Completion (Unit 03)
-- التوثيق: docs/e-procurement/03-supplier-onboarding-qualification.md
-- يغطي: بيانات التسجيل، نماذج التأهيل، سير الموافقة حسب المخاطر، سجل تدقيق، وحقول بوابة الموردين.
-- ============================================================================

-- 1) حقول إضافية مطلوبة من وثيقة التأهيل
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS operating_country TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS ownership_structure JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS authorized_signatories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS warehouses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS quality_facilities JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS credit_rating TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bcp_summary TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sanctions_checked BOOLEAN DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS conflict_checked BOOLEAN DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS last_qualification_at TIMESTAMPTZ;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS qualification_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_suppliers_email ON public.suppliers(tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_suppliers_status_risk ON public.suppliers(tenant_id, status, risk_level);

-- 2) نماذج التأهيل القابلة للتخصيص حسب نوع المورد/الفئة
CREATE TABLE IF NOT EXISTS public.supplier_qualification_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  supplier_type TEXT CHECK (supplier_type IN ('prospect','approved','strategic','blocked')),
  category_code TEXT,
  schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_qualification_forms_tenant ON public.supplier_qualification_forms(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.supplier_qualification_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  form_id UUID REFERENCES public.supplier_qualification_forms(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  submitted_by_email TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_qualification_responses_supplier ON public.supplier_qualification_responses(supplier_id, created_at DESC);

-- 3) سجل تدقيق المورّدين: كل تغيير مهم في بيانات المورد/وثائقه/مخاطره
CREATE TABLE IF NOT EXISTS public.supplier_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_audit_supplier ON public.supplier_audit_log(supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_audit_tenant ON public.supplier_audit_log(tenant_id, created_at DESC);

-- 4) RLS للجداول الجديدة
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_qualification_forms','supplier_qualification_responses','supplier_audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''finance'',''developer'',''it_admin''));', t, t);
    IF t = 'supplier_audit_log' THEN
      EXECUTE format('CREATE POLICY %I_write ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin''));', t, t);
    ELSE
      EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin'')) WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN (''procurement'',''admin'',''developer'',''it_admin''));', t, t);
    END IF;
  END LOOP;
END $$;

-- 5) دالة تسجيل تدقيق موحدة
CREATE OR REPLACE FUNCTION public.log_supplier_audit(
  p_supplier_id UUID,
  p_action TEXT,
  p_entity_table TEXT,
  p_entity_id UUID,
  p_old_value JSONB,
  p_new_value JSONB,
  p_comments TEXT DEFAULT NULL
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
  IF p_supplier_id IS NOT NULL THEN
    PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, false);
  END IF;

  INSERT INTO public.supplier_audit_log
    (tenant_id, supplier_id, actor_id, action, entity_table, entity_id, old_value, new_value, comments)
  VALUES
    (v_tenant, p_supplier_id, auth.uid(), p_action, p_entity_table, p_entity_id, p_old_value, p_new_value, p_comments)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.log_supplier_audit(UUID,TEXT,TEXT,UUID,JSONB,JSONB,TEXT) TO authenticated;

-- 6) Trigger تدقيق لتغييرات المورد الأساسية
CREATE OR REPLACE FUNCTION public.tg_supplier_audit() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.supplier_audit_log(tenant_id, supplier_id, actor_id, action, entity_table, entity_id, old_value, new_value)
    VALUES (NEW.tenant_id, NEW.id, auth.uid(), 'supplier_created', TG_TABLE_NAME, NEW.id, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.supplier_audit_log(tenant_id, supplier_id, actor_id, action, entity_table, entity_id, old_value, new_value)
    VALUES (NEW.tenant_id, NEW.id, auth.uid(), 'supplier_updated', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_suppliers_audit ON public.suppliers;
CREATE TRIGGER trg_suppliers_audit
AFTER INSERT OR UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.tg_supplier_audit();

-- 7) تحديث supplier risk_score/risk_level من آخر تقييم مخاطر
CREATE OR REPLACE FUNCTION public.sync_supplier_risk_from_assessment(p_supplier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_assessment RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, false);

  SELECT * INTO v_assessment
  FROM public.supplier_risk_assessments
  WHERE supplier_id=p_supplier_id AND tenant_id=v_tenant
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.suppliers
    SET risk_score = v_assessment.total_score,
        risk_level = v_assessment.risk_level,
        updated_at = NOW()
    WHERE id=p_supplier_id AND tenant_id=v_tenant;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.sync_supplier_risk_from_assessment(UUID) TO authenticated;

-- 8) سير موافقة/رفض/تجميد المورد حسب المخاطر
CREATE OR REPLACE FUNCTION public.decide_supplier_qualification(
  p_supplier_id UUID,
  p_decision TEXT,
  p_comments TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role TEXT := public.current_user_role();
  v_supplier RECORD;
  v_risk TEXT;
  v_new_status TEXT;
  v_new_type TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin','finance']::TEXT[]);
  PERFORM public.procurement_assert_supplier_in_tenant(p_supplier_id, false);

  IF p_decision NOT IN ('approve','reject','suspend','reactivate','under_review') THEN
    RAISE EXCEPTION 'INVALID_SUPPLIER_DECISION';
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers WHERE id=p_supplier_id AND tenant_id=v_tenant FOR UPDATE;
  v_risk := COALESCE(v_supplier.risk_level, 'medium');

  -- حسب التوثيق: منخفض = مشتريات، متوسط = مشتريات+مالية، مرتفع/حرج = لجنة/إدارة.
  -- في هذه المرحلة نطبّق طبقة صلاحية محافظة: المخاطر المرتفعة/الحرجة لا يوافقها إلا admin.
  IF p_decision='approve' AND v_risk IN ('high','critical') AND v_role NOT IN ('admin','developer','it_admin') THEN
    RAISE EXCEPTION 'HIGH_RISK_SUPPLIER_REQUIRES_ADMIN_COMMITTEE_APPROVAL';
  END IF;
  IF p_decision='approve' AND v_risk='medium' AND v_role NOT IN ('finance','admin','developer','it_admin','procurement') THEN
    RAISE EXCEPTION 'MEDIUM_RISK_SUPPLIER_REQUIRES_PROCUREMENT_OR_FINANCE';
  END IF;

  v_new_status := CASE p_decision
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'suspend' THEN 'suspended'
    WHEN 'reactivate' THEN 'under_review'
    WHEN 'under_review' THEN 'under_review'
  END;

  v_new_type := CASE
    WHEN p_decision='approve' AND v_risk IN ('high','critical') THEN 'strategic'
    WHEN p_decision='approve' THEN 'approved'
    WHEN p_decision='suspend' THEN 'blocked'
    ELSE v_supplier.supplier_type
  END;

  UPDATE public.suppliers
  SET status=v_new_status,
      supplier_type=v_new_type,
      is_active=(v_new_status IN ('approved','under_review','pending')),
      last_qualification_at=CASE WHEN p_decision='approve' THEN NOW() ELSE last_qualification_at END,
      qualification_notes=p_comments,
      updated_at=NOW()
  WHERE id=p_supplier_id AND tenant_id=v_tenant;

  PERFORM public.log_supplier_audit(
    p_supplier_id,
    'supplier_qualification_' || p_decision,
    'suppliers',
    p_supplier_id,
    to_jsonb(v_supplier),
    (SELECT to_jsonb(s) FROM public.suppliers s WHERE s.id=p_supplier_id),
    p_comments
  );

  RETURN v_new_status;
END $$;
GRANT EXECUTE ON FUNCTION public.decide_supplier_qualification(UUID,TEXT,TEXT) TO authenticated;

-- 9) View KPIs للتأهيل كما في التوثيق
CREATE OR REPLACE VIEW public.supplier_onboarding_kpis
WITH (security_invoker = true) AS
SELECT
  s.tenant_id,
  COUNT(*) AS total_suppliers,
  COUNT(*) FILTER (WHERE s.status='approved') AS approved_suppliers,
  COUNT(*) FILTER (WHERE s.status='rejected') AS rejected_suppliers,
  COUNT(*) FILTER (WHERE s.status='suspended') AS suspended_suppliers,
  ROUND(COUNT(*) FILTER (WHERE s.status='approved')::NUMERIC / NULLIF(COUNT(*),0) * 100, 2) AS approval_rate,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.supplier_documents d
    WHERE d.supplier_id=s.id AND d.tenant_id=s.tenant_id AND d.verification_status='expired'
  )) AS suppliers_with_expired_docs,
  COUNT(*) FILTER (WHERE s.risk_level IN ('high','critical')) AS high_risk_suppliers
FROM public.suppliers s
WHERE s.tenant_id = public.current_user_tenant_id()
GROUP BY s.tenant_id;
GRANT SELECT ON public.supplier_onboarding_kpis TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.supplier_audit_log') IS NULL THEN RAISE EXCEPTION '0193 failed: supplier_audit_log missing'; END IF;
  IF to_regclass('public.supplier_qualification_forms') IS NULL THEN RAISE EXCEPTION '0193 failed: qualification forms missing'; END IF;
  IF to_regprocedure('public.decide_supplier_qualification(uuid,text,text)') IS NULL THEN RAISE EXCEPTION '0193 failed: decide supplier qualification missing'; END IF;
  RAISE NOTICE '✅ 0193: Supplier onboarding completion foundations applied';
END $$;
