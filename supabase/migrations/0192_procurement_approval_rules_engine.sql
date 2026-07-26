-- ============================================================================
-- 0192 — Procurement Approval Rules Engine (Phase 3 foundation)
-- الهدف: جعل procurement_approval_rules مستخدمة فعلياً بدلاً من سير ثابت فقط.
-- يعتمد على 0182 + 0190/0191.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_procurement_approval_chain(
  p_department_id UUID,
  p_total_amount NUMERIC
)
RETURNS TABLE (step_order INT, approver_role TEXT, approver_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_rule RECORD;
  v_order INT := 0;
  v_dept UUID := p_department_id;
  v_depth INT := 0;
  v_row RECORD;
  v_sup UUID;
  v_mgr UUID;
  v_dm UUID;
  v_proc UUID;
  v_fin UUID;
  v_admin UUID;
  v_candidate UUID;
  v_has_rules BOOLEAN := false;
  v_seen_roles TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_assert_department_in_tenant(p_department_id);

  -- supervisor خاص بالقسم، أما manager/direct/procurement فيُورث من أقرب أب.
  IF p_department_id IS NOT NULL THEN
    SELECT d.supervisor_id INTO v_sup
    FROM public.departments d
    WHERE d.id = p_department_id AND d.tenant_id = v_tenant;
  END IF;

  WHILE v_dept IS NOT NULL AND v_depth < 20 AND (v_mgr IS NULL OR v_dm IS NULL OR v_proc IS NULL) LOOP
    SELECT d.manager_id, d.direct_manager_id, d.procurement_manager_id, d.parent_department_id
      INTO v_row
    FROM public.departments d
    WHERE d.id = v_dept AND d.tenant_id = v_tenant;
    IF NOT FOUND THEN EXIT; END IF;
    IF v_mgr IS NULL THEN v_mgr := v_row.manager_id; END IF;
    IF v_dm IS NULL THEN v_dm := v_row.direct_manager_id; END IF;
    IF v_proc IS NULL THEN v_proc := v_row.procurement_manager_id; END IF;
    v_dept := v_row.parent_department_id;
    v_depth := v_depth + 1;
  END LOOP;

  IF v_proc IS NULL THEN
    SELECT id INTO v_proc FROM public.profiles WHERE tenant_id=v_tenant AND role='procurement' AND status='active' LIMIT 1;
  END IF;
  SELECT id INTO v_fin FROM public.profiles WHERE tenant_id=v_tenant AND role='finance' AND status='active' LIMIT 1;
  SELECT id INTO v_admin FROM public.profiles WHERE tenant_id=v_tenant AND role='admin' AND status='active' LIMIT 1;

  -- القواعد القابلة للتخصيص: exact department له أولوية على NULL العام، ثم level.
  FOR v_rule IN
    SELECT *
    FROM public.procurement_approval_rules r
    WHERE r.tenant_id = v_tenant
      AND r.is_active = true
      AND p_total_amount BETWEEN r.min_amount AND r.max_amount
      AND (r.department_id IS NULL OR r.department_id = p_department_id)
    ORDER BY r.level ASC, (r.department_id IS NULL) ASC, r.min_amount DESC
  LOOP
    v_has_rules := true;
    v_candidate := CASE v_rule.required_role
      WHEN 'supervisor' THEN v_sup
      WHEN 'manager' THEN v_mgr
      WHEN 'direct_manager' THEN v_dm
      WHEN 'procurement' THEN v_proc
      WHEN 'finance' THEN v_fin
      WHEN 'admin' THEN v_admin
      ELSE NULL
    END;

    -- لا نعيد نفس الدور مرتين إذا وُجدت قاعدة عامة وقاعدة قسم بنفس المستوى.
    IF v_candidate IS NOT NULL AND NOT (v_rule.required_role = ANY(v_seen_roles)) THEN
      v_order := v_order + 1;
      v_seen_roles := array_append(v_seen_roles, v_rule.required_role);
      RETURN QUERY SELECT v_order, v_rule.required_role::TEXT, v_candidate;
    END IF;
  END LOOP;

  IF v_has_rules AND v_order > 0 THEN
    RETURN;
  END IF;

  -- fallback افتراضي مطابق تقريباً للوثيقة: direct/supervisor → manager → procurement → finance → admin.
  IF v_sup IS NOT NULL THEN
    v_order := v_order+1;
    RETURN QUERY SELECT v_order, 'supervisor'::TEXT, v_sup;
  END IF;

  IF p_total_amount >= 5000 OR v_sup IS NULL THEN
    IF COALESCE(v_dm, v_mgr) IS NOT NULL THEN
      v_order := v_order+1;
      RETURN QUERY SELECT v_order, CASE WHEN v_dm IS NOT NULL THEN 'direct_manager' ELSE 'manager' END::TEXT, COALESCE(v_dm, v_mgr);
    END IF;
  END IF;

  IF v_proc IS NOT NULL THEN
    v_order := v_order+1;
    RETURN QUERY SELECT v_order, 'procurement'::TEXT, v_proc;
  END IF;

  IF p_total_amount > 50000 AND v_fin IS NOT NULL THEN
    v_order := v_order+1;
    RETURN QUERY SELECT v_order, 'finance'::TEXT, v_fin;
  END IF;

  IF p_total_amount > 250000 AND v_admin IS NOT NULL THEN
    v_order := v_order+1;
    RETURN QUERY SELECT v_order, 'admin'::TEXT, v_admin;
  END IF;

  IF v_order = 0 AND v_admin IS NOT NULL THEN
    RETURN QUERY SELECT 1, 'admin'::TEXT, v_admin;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_procurement_approval_chain(UUID,NUMERIC) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.resolve_procurement_approval_chain(uuid,numeric)') IS NULL THEN
    RAISE EXCEPTION '0192 failed: resolve_procurement_approval_chain missing';
  END IF;
  RAISE NOTICE '✅ 0192: Procurement approval rules engine enabled';
END $$;
