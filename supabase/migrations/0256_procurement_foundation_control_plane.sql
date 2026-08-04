-- ============================================================================
-- 0256 — بوابة المشتريات · الوحدة 00: الأساس ولوحة التحكم
-- docs/e-procurement/00-procurement-foundation-control-plane.md
--
-- الغرض:
--   توفير طبقة تحكم موحّدة للمشتريات: سجل تدقيق مركزي، فئات الإنفاق،
--   قواعد الموافقة، وسياسات المشتريات — مع Views جاهزة للوحات والبحث.
--
-- مبادئ ملتزم بها:
--   • لا حذف نهائي — تعطيل/أرشفة فقط.
--   • كل تغيير حساس يتطلب سبباً نصياً ويُسجَّل في سجل التدقيق.
--   • تحويل صريح للأنواع في كل RETURNS TABLE (درس get_ap_aging / 0255).
--   • كل View بـ security_invoker لاحترام RLS.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) سجل التدقيق المركزي للمشتريات
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proc_audit_tenant_created
  ON public.procurement_audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proc_audit_aggregate
  ON public.procurement_audit_events(aggregate_type, aggregate_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) سياسات المشتريات (عتبات وقواعد عامة على مستوى الشركة)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  policy_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, policy_key)
);
CREATE INDEX IF NOT EXISTS idx_proc_policies_tenant
  ON public.procurement_policies(tenant_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) تعزيز الجداول القائمة (idempotent)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spend_categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deactivated_reason TEXT;

ALTER TABLE public.procurement_approval_rules
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deactivated_reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- RLS للجداول الجديدة (نفس نمط 0188)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['procurement_audit_events','procurement_policies'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'',''finance'')));',
      t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin''))) WITH CHECK (tenant_id = public.current_user_tenant_id() AND (public.current_user_is_staff() OR public.current_user_role() IN (''procurement'',''admin'')));',
      t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) دالة مساعدة: تسجيل حدث تدقيق
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_procurement_audit_event(
  p_event_type TEXT,
  p_aggregate_type TEXT,
  p_aggregate_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_before JSONB DEFAULT NULL,
  p_after JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  INSERT INTO public.procurement_audit_events(
    tenant_id, event_type, aggregate_type, aggregate_id, actor_id, reason, before_data, after_data)
  VALUES (v_tenant, p_event_type, p_aggregate_type, p_aggregate_id, auth.uid(), p_reason, p_before, p_after)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.log_procurement_audit_event(TEXT,TEXT,UUID,TEXT,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_procurement_audit_event(TEXT,TEXT,UUID,TEXT,JSONB,JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) فئات الإنفاق (UNSPSC) — إنشاء/تعديل/تعطيل
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_spend_category(
  p_code TEXT,
  p_name_ar TEXT,
  p_level INT,
  p_category_id UUID DEFAULT NULL,
  p_name_en TEXT DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL
)
RETURNS public.spend_categories
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old public.spend_categories%ROWTYPE;
  v_row public.spend_categories%ROWTYPE;
  v_parent public.spend_categories%ROWTYPE;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']);
  IF COALESCE(btrim(p_code),'') = '' OR COALESCE(btrim(p_name_ar),'') = '' THEN
    RAISE EXCEPTION 'CATEGORY_CODE_AND_NAME_REQUIRED';
  END IF;
  IF p_level IS NULL OR p_level < 1 OR p_level > 4 THEN
    RAISE EXCEPTION 'CATEGORY_LEVEL_MUST_BE_1_TO_4';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.spend_categories
      WHERE id = p_parent_id AND tenant_id = v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'PARENT_CATEGORY_NOT_FOUND'; END IF;
    IF v_parent.level <> p_level - 1 THEN
      RAISE EXCEPTION 'PARENT_LEVEL_MUST_BE_ONE_ABOVE_CHILD';
    END IF;
    IF p_category_id IS NOT NULL AND p_parent_id = p_category_id THEN
      RAISE EXCEPTION 'CATEGORY_CANNOT_BE_ITS_OWN_PARENT';
    END IF;
  ELSIF p_level <> 1 THEN
    RAISE EXCEPTION 'NON_ROOT_CATEGORY_REQUIRES_PARENT';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.spend_categories
      WHERE id = p_category_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND'; END IF;
    UPDATE public.spend_categories
      SET code = upper(btrim(p_code)),
          name_ar = btrim(p_name_ar),
          name_en = NULLIF(btrim(COALESCE(p_name_en,'')),''),
          parent_id = p_parent_id,
          level = p_level,
          updated_at = NOW()
      WHERE id = p_category_id
      RETURNING * INTO v_row;
    PERFORM public.log_procurement_audit_event(
      'spend_category_updated','spend_category',v_row.id,NULL,to_jsonb(v_old),to_jsonb(v_row));
  ELSE
    INSERT INTO public.spend_categories(tenant_id, code, name_ar, name_en, parent_id, level, is_active)
    VALUES (v_tenant, upper(btrim(p_code)), btrim(p_name_ar),
            NULLIF(btrim(COALESCE(p_name_en,'')),''), p_parent_id, p_level, true)
    ON CONFLICT (tenant_id, code) DO UPDATE
      SET name_ar = EXCLUDED.name_ar,
          name_en = EXCLUDED.name_en,
          parent_id = EXCLUDED.parent_id,
          level = EXCLUDED.level,
          is_active = true,
          updated_at = NOW()
    RETURNING * INTO v_row;
    PERFORM public.log_procurement_audit_event(
      'spend_category_created','spend_category',v_row.id,NULL,NULL,to_jsonb(v_row));
  END IF;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.upsert_spend_category(TEXT,TEXT,INT,UUID,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_spend_category(TEXT,TEXT,INT,UUID,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_spend_category_status(
  p_category_id UUID, p_is_active BOOLEAN, p_reason TEXT)
RETURNS public.spend_categories
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old public.spend_categories%ROWTYPE;
  v_row public.spend_categories%ROWTYPE;
  v_children BIGINT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']);
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'CATEGORY_STATUS_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.spend_categories
    WHERE id = p_category_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND'; END IF;

  IF COALESCE(p_is_active,false) = false THEN
    SELECT COUNT(*) INTO v_children FROM public.spend_categories
      WHERE parent_id = p_category_id AND is_active AND tenant_id = v_tenant;
    IF v_children > 0 THEN RAISE EXCEPTION 'CATEGORY_HAS_ACTIVE_CHILDREN'; END IF;
  END IF;

  UPDATE public.spend_categories
    SET is_active = COALESCE(p_is_active,false),
        deactivated_reason = CASE WHEN COALESCE(p_is_active,false) THEN NULL ELSE btrim(p_reason) END,
        updated_at = NOW()
    WHERE id = p_category_id
    RETURNING * INTO v_row;

  PERFORM public.log_procurement_audit_event(
    'spend_category_status_changed','spend_category',v_row.id,btrim(p_reason),
    to_jsonb(v_old),to_jsonb(v_row));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.set_spend_category_status(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_spend_category_status(UUID,BOOLEAN,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) قواعد الموافقة — إنشاء/تعديل/تعطيل
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_procurement_approval_rule(
  p_rule_name TEXT,
  p_min_amount NUMERIC,
  p_max_amount NUMERIC,
  p_level INT,
  p_required_role TEXT,
  p_rule_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.procurement_approval_rules
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old public.procurement_approval_rules%ROWTYPE;
  v_row public.procurement_approval_rules%ROWTYPE;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['admin']);
  IF COALESCE(btrim(p_rule_name),'') = '' THEN RAISE EXCEPTION 'RULE_NAME_REQUIRED'; END IF;
  IF p_level IS NULL OR p_level < 1 OR p_level > 5 THEN RAISE EXCEPTION 'RULE_LEVEL_MUST_BE_1_TO_5'; END IF;
  IF p_required_role NOT IN ('supervisor','manager','direct_manager','finance','admin','procurement') THEN
    RAISE EXCEPTION 'INVALID_REQUIRED_ROLE';
  END IF;
  IF COALESCE(p_min_amount,0) < 0 THEN RAISE EXCEPTION 'MIN_AMOUNT_CANNOT_BE_NEGATIVE'; END IF;
  IF COALESCE(p_max_amount,0) <= COALESCE(p_min_amount,0) THEN
    RAISE EXCEPTION 'MAX_AMOUNT_MUST_EXCEED_MIN_AMOUNT';
  END IF;
  IF p_department_id IS NOT NULL THEN
    PERFORM public.procurement_assert_department_in_tenant(p_department_id);
  END IF;

  IF p_rule_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.procurement_approval_rules
      WHERE id = p_rule_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APPROVAL_RULE_NOT_FOUND'; END IF;
    UPDATE public.procurement_approval_rules
      SET rule_name = btrim(p_rule_name),
          min_amount = p_min_amount,
          max_amount = p_max_amount,
          department_id = p_department_id,
          level = p_level,
          required_role = p_required_role,
          notes = NULLIF(btrim(COALESCE(p_notes,'')),''),
          updated_at = NOW()
      WHERE id = p_rule_id
      RETURNING * INTO v_row;
    PERFORM public.log_procurement_audit_event(
      'approval_rule_updated','approval_rule',v_row.id,NULL,to_jsonb(v_old),to_jsonb(v_row));
  ELSE
    INSERT INTO public.procurement_approval_rules(
      tenant_id, rule_name, min_amount, max_amount, department_id, level,
      required_role, is_active, notes, created_by)
    VALUES (v_tenant, btrim(p_rule_name), p_min_amount, p_max_amount, p_department_id,
            p_level, p_required_role, true, NULLIF(btrim(COALESCE(p_notes,'')),''), auth.uid())
    RETURNING * INTO v_row;
    PERFORM public.log_procurement_audit_event(
      'approval_rule_created','approval_rule',v_row.id,NULL,NULL,to_jsonb(v_row));
  END IF;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.upsert_procurement_approval_rule(TEXT,NUMERIC,NUMERIC,INT,TEXT,UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_procurement_approval_rule(TEXT,NUMERIC,NUMERIC,INT,TEXT,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_procurement_approval_rule_status(
  p_rule_id UUID, p_is_active BOOLEAN, p_reason TEXT)
RETURNS public.procurement_approval_rules
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old public.procurement_approval_rules%ROWTYPE;
  v_row public.procurement_approval_rules%ROWTYPE;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['admin']);
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'RULE_STATUS_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.procurement_approval_rules
    WHERE id = p_rule_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPROVAL_RULE_NOT_FOUND'; END IF;

  UPDATE public.procurement_approval_rules
    SET is_active = COALESCE(p_is_active,false),
        deactivated_reason = CASE WHEN COALESCE(p_is_active,false) THEN NULL ELSE btrim(p_reason) END,
        updated_at = NOW()
    WHERE id = p_rule_id
    RETURNING * INTO v_row;

  PERFORM public.log_procurement_audit_event(
    'approval_rule_status_changed','approval_rule',v_row.id,btrim(p_reason),
    to_jsonb(v_old),to_jsonb(v_row));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.set_procurement_approval_rule_status(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_procurement_approval_rule_status(UUID,BOOLEAN,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) سياسات المشتريات
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_procurement_policy(
  p_policy_key TEXT, p_policy_value JSONB, p_description TEXT DEFAULT NULL)
RETURNS public.procurement_policies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old public.procurement_policies%ROWTYPE;
  v_row public.procurement_policies%ROWTYPE;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['admin']);
  IF COALESCE(btrim(p_policy_key),'') = '' THEN RAISE EXCEPTION 'POLICY_KEY_REQUIRED'; END IF;
  IF p_policy_value IS NULL OR jsonb_typeof(p_policy_value) <> 'object' THEN
    RAISE EXCEPTION 'POLICY_VALUE_MUST_BE_OBJECT';
  END IF;

  SELECT * INTO v_old FROM public.procurement_policies
    WHERE tenant_id = v_tenant AND policy_key = btrim(p_policy_key);

  INSERT INTO public.procurement_policies(tenant_id, policy_key, policy_value, description, updated_by)
  VALUES (v_tenant, btrim(p_policy_key), p_policy_value,
          NULLIF(btrim(COALESCE(p_description,'')),''), auth.uid())
  ON CONFLICT (tenant_id, policy_key) DO UPDATE
    SET policy_value = EXCLUDED.policy_value,
        description = EXCLUDED.description,
        is_active = true,
        updated_by = auth.uid(),
        updated_at = NOW()
  RETURNING * INTO v_row;

  PERFORM public.log_procurement_audit_event(
    'procurement_policy_upserted','procurement_policy',v_row.id,NULL,
    CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END, to_jsonb(v_row));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.upsert_procurement_policy(TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_procurement_policy(TEXT,JSONB,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) Views — لوحات وبحث
-- ─────────────────────────────────────────────────────────────────────────

-- شجرة فئات الإنفاق مع المسار الكامل واستخدامها
CREATE OR REPLACE VIEW public.procurement_category_tree
WITH (security_invoker = true) AS
WITH RECURSIVE tree AS (
  SELECT c.id, c.tenant_id, c.code, c.name_ar, c.name_en, c.parent_id, c.level,
         c.is_active, c.deactivated_reason, c.created_at,
         c.name_ar::TEXT AS path_ar,
         LPAD(c.level::TEXT, 2, '0') || '/' || c.code AS sort_key
  FROM public.spend_categories c
  WHERE c.parent_id IS NULL
  UNION ALL
  SELECT c.id, c.tenant_id, c.code, c.name_ar, c.name_en, c.parent_id, c.level,
         c.is_active, c.deactivated_reason, c.created_at,
         (t.path_ar || ' › ' || c.name_ar)::TEXT,
         t.sort_key || '/' || c.code
  FROM public.spend_categories c
  JOIN tree t ON t.id = c.parent_id
)
SELECT
  t.id, t.tenant_id, t.code, t.name_ar, t.name_en, t.parent_id, t.level,
  t.is_active, t.deactivated_reason, t.path_ar,
  (SELECT COUNT(*) FROM public.spend_categories ch WHERE ch.parent_id = t.id)::BIGINT AS child_count,
  COALESCE((SELECT COUNT(*) FROM public.spend_transactions st WHERE st.category_code = t.code), 0)::BIGINT AS transaction_count,
  t.created_at
FROM tree t
WHERE t.tenant_id = public.current_user_tenant_id()
ORDER BY t.sort_key;
GRANT SELECT ON public.procurement_category_tree TO authenticated;

-- بحث سريع للفئات النشطة (Lookup — بديل نسخ UUID)
CREATE OR REPLACE VIEW public.procurement_category_lookup
WITH (security_invoker = true) AS
SELECT id, tenant_id, code, name_ar, name_en, level, parent_id, path_ar
FROM public.procurement_category_tree
WHERE is_active
ORDER BY path_ar;
GRANT SELECT ON public.procurement_category_lookup TO authenticated;

-- لوحة قواعد الموافقة
CREATE OR REPLACE VIEW public.procurement_approval_rule_board
WITH (security_invoker = true) AS
SELECT
  r.id, r.tenant_id, r.rule_name, r.min_amount, r.max_amount, r.level,
  r.required_role, r.is_active, r.deactivated_reason, r.notes,
  r.department_id,
  d.name_ar AS department_name,
  p.full_name AS created_by_name,
  r.created_at, r.updated_at
FROM public.procurement_approval_rules r
LEFT JOIN public.departments d ON d.id = r.department_id
LEFT JOIN public.profiles p ON p.id = r.created_by
WHERE r.tenant_id = public.current_user_tenant_id()
ORDER BY r.level, r.min_amount;
GRANT SELECT ON public.procurement_approval_rule_board TO authenticated;

-- سجل التدقيق
CREATE OR REPLACE VIEW public.procurement_audit_board
WITH (security_invoker = true) AS
SELECT
  e.id, e.tenant_id, e.event_type, e.aggregate_type, e.aggregate_id,
  e.actor_id, COALESCE(p.full_name, p.email, 'نظام') AS actor_name,
  e.reason, e.before_data, e.after_data, e.created_at
FROM public.procurement_audit_events e
LEFT JOIN public.profiles p ON p.id = e.actor_id
WHERE e.tenant_id = public.current_user_tenant_id()
ORDER BY e.created_at DESC;
GRANT SELECT ON public.procurement_audit_board TO authenticated;

-- لوحة السياسات
CREATE OR REPLACE VIEW public.procurement_policy_board
WITH (security_invoker = true) AS
SELECT
  pol.id, pol.tenant_id, pol.policy_key, pol.policy_value, pol.description,
  pol.is_active, COALESCE(p.full_name, p.email) AS updated_by_name,
  pol.created_at, pol.updated_at
FROM public.procurement_policies pol
LEFT JOIN public.profiles p ON p.id = pol.updated_by
WHERE pol.tenant_id = public.current_user_tenant_id()
ORDER BY pol.policy_key;
GRANT SELECT ON public.procurement_policy_board TO authenticated;

-- لوحة الأساس: مؤشرات حقيقية (تحل محل الأرقام الوهمية في الداشبورد)
CREATE OR REPLACE VIEW public.procurement_foundation_dashboard
WITH (security_invoker = true) AS
SELECT
  t.id AS tenant_id,
  COALESCE((SELECT COUNT(*) FROM public.suppliers s
            WHERE s.tenant_id = t.id AND COALESCE(s.is_active, true)), 0)::BIGINT AS active_suppliers,
  COALESCE((SELECT COUNT(*) FROM public.suppliers s
            WHERE s.tenant_id = t.id), 0)::BIGINT AS total_suppliers,
  COALESCE((SELECT COUNT(*) FROM public.purchase_requisitions r
            WHERE r.tenant_id = t.id), 0)::BIGINT AS total_requisitions,
  COALESCE((SELECT COUNT(*) FROM public.purchase_requisitions r
            WHERE r.tenant_id = t.id AND r.status = 'pending_approval'), 0)::BIGINT AS pending_requisitions,
  COALESCE((SELECT COUNT(*) FROM public.purchase_requisitions r
            WHERE r.tenant_id = t.id AND r.status = 'approved'), 0)::BIGINT AS approved_requisitions,
  COALESCE((SELECT COUNT(*) FROM public.spend_categories c
            WHERE c.tenant_id = t.id AND c.is_active), 0)::BIGINT AS active_categories,
  COALESCE((SELECT COUNT(*) FROM public.procurement_approval_rules ar
            WHERE ar.tenant_id = t.id AND ar.is_active), 0)::BIGINT AS active_approval_rules,
  COALESCE((SELECT COUNT(*) FROM public.procurement_policies pp
            WHERE pp.tenant_id = t.id AND pp.is_active), 0)::BIGINT AS active_policies,
  COALESCE((SELECT COUNT(*) FROM public.procurement_audit_events ae
            WHERE ae.tenant_id = t.id AND ae.created_at > NOW() - INTERVAL '30 days'), 0)::BIGINT AS audit_events_30d
FROM public.tenants t
WHERE t.id = public.current_user_tenant_id();
GRANT SELECT ON public.procurement_foundation_dashboard TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) فحص صحة إعداد المشتريات (RETURNS TABLE — تحويل صريح للأنواع)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_procurement_foundation()
RETURNS TABLE(
  severity TEXT,
  check_code TEXT,
  message TEXT,
  affected_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- لا توجد قواعد موافقة نشطة
  RETURN QUERY
  SELECT 'error'::TEXT, 'NO_ACTIVE_APPROVAL_RULES'::TEXT,
         'لا توجد قواعد موافقة نشطة — طلبات الشراء لن تجد معتمِداً'::TEXT,
         COUNT(*)::BIGINT
  FROM public.procurement_approval_rules
  WHERE tenant_id = v_tenant AND is_active
  HAVING COUNT(*) = 0;

  -- فجوات في نطاقات المبالغ لنفس المستوى
  RETURN QUERY
  SELECT 'warning'::TEXT, 'APPROVAL_RULE_OVERLAP'::TEXT,
         'قواعد موافقة متداخلة في نفس المستوى والقسم'::TEXT,
         COUNT(*)::BIGINT
  FROM public.procurement_approval_rules a
  JOIN public.procurement_approval_rules b
    ON a.tenant_id = b.tenant_id
   AND a.id <> b.id
   AND a.level = b.level
   AND COALESCE(a.department_id, '00000000-0000-0000-0000-000000000000'::UUID)
     = COALESCE(b.department_id, '00000000-0000-0000-0000-000000000000'::UUID)
   AND a.min_amount < b.max_amount
   AND b.min_amount < a.max_amount
  WHERE a.tenant_id = v_tenant AND a.is_active AND b.is_active
  HAVING COUNT(*) > 0;

  -- لا توجد فئات إنفاق
  RETURN QUERY
  SELECT 'warning'::TEXT, 'NO_SPEND_CATEGORIES'::TEXT,
         'لا توجد فئات إنفاق نشطة — تحليل الإنفاق سيكون غير مصنّف'::TEXT,
         COUNT(*)::BIGINT
  FROM public.spend_categories
  WHERE tenant_id = v_tenant AND is_active
  HAVING COUNT(*) = 0;

  -- فئات يتيمة (أب غير نشط)
  RETURN QUERY
  SELECT 'warning'::TEXT, 'ORPHAN_CATEGORIES'::TEXT,
         'فئات نشطة تحت أب معطّل'::TEXT,
         COUNT(*)::BIGINT
  FROM public.spend_categories c
  JOIN public.spend_categories p ON p.id = c.parent_id
  WHERE c.tenant_id = v_tenant AND c.is_active AND NOT p.is_active
  HAVING COUNT(*) > 0;

  -- لا يوجد موردون نشطون
  RETURN QUERY
  SELECT 'warning'::TEXT, 'NO_ACTIVE_SUPPLIERS'::TEXT,
         'لا يوجد موردون نشطون'::TEXT,
         COUNT(*)::BIGINT
  FROM public.suppliers
  WHERE tenant_id = v_tenant AND COALESCE(is_active, true)
  HAVING COUNT(*) = 0;

  RETURN;
END $$;
REVOKE ALL ON FUNCTION public.validate_procurement_foundation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_procurement_foundation() TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.procurement_audit_events') IS NULL
     OR to_regclass('public.procurement_policies') IS NULL
     OR to_regclass('public.procurement_category_tree') IS NULL
     OR to_regclass('public.procurement_foundation_dashboard') IS NULL
     OR to_regprocedure('public.upsert_spend_category(text,text,integer,uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.upsert_procurement_approval_rule(text,numeric,numeric,integer,text,uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.validate_procurement_foundation()') IS NULL
  THEN
    RAISE EXCEPTION '0256 failed: procurement foundation objects missing';
  END IF;
  RAISE NOTICE '✅ 0256: Procurement foundation & control plane applied';
END $$;
