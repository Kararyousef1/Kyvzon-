-- ============================================================================
-- 0257 — إصلاح خطأ وقت التنفيذ في check_pr_budget_extended
--
-- السبب الجذري:
--   في 0198 يُبنى استعلام ديناميكي يحوي:
--       COALESCE(b.budget_name, b.name, 'Budget')
--   لكن جدول public.budgets لا يملك عمود name إطلاقاً (الموجود budget_name فقط).
--   ولأن الاستعلام ديناميكي (EXECUTE)، لا يفشل عند إنشاء الدالة بل عند أول
--   استدعاء فعلي:
--       ERROR: column b.name does not exist
--
-- الأثر الحقيقي:
--   إنشاء أي طلب شراء يفشل، لأن create_purchase_requisition_full تستدعي
--   check_pr_budget_extended لفحص الميزانية. أي أن الوحدة 01 كانت معطّلة
--   كلياً في وقت التشغيل رغم نجاح كل الفحوصات الثابتة.
--
-- الإصلاح:
--   اكتشاف عمود اسم الميزانية من information_schema بدل افتراضه — بنفس
--   الأسلوب الذي تتبعه الدالة أصلاً مع عمود المبلغ.
--
-- ملاحظة: التوقيع ونوع الإرجاع مطابقان تماماً للأصل في 0198
--         (is_ok, remaining_before, remaining_after, budget_name, spent_breakdown)
--         حتى لا يُكسر أي عقد قائم أو استدعاء من SDK.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_pr_budget_extended(
  p_cost_center_id UUID,
  p_project_id UUID,
  p_budget_scope TEXT,
  p_category_code TEXT,
  p_request_type TEXT,
  p_amount NUMERIC
)
RETURNS TABLE (is_ok BOOLEAN, remaining_before NUMERIC, remaining_after NUMERIC, budget_name TEXT, spent_breakdown JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_scope TEXT := COALESCE(NULLIF(btrim(p_budget_scope),''), 'cost_center');
  v_amount_col TEXT;
  v_name_col TEXT;
  v_name_expr TEXT;
  v_has_cost_center BOOLEAN;
  v_has_project BOOLEAN;
  v_has_category BOOLEAN;
  v_sql TEXT;
  v_budget RECORD;
  v_spent_pr NUMERIC := 0;
  v_spent_spend NUMERIC := 0;
  v_remaining NUMERIC;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF to_regclass('public.budgets') IS NULL OR to_regclass('public.budget_lines') IS NULL THEN
    RETURN QUERY SELECT true, NULL::NUMERIC, NULL::NUMERIC, 'لا توجد جداول ميزانية — تخطي'::TEXT, jsonb_build_object('scope', v_scope);
    RETURN;
  END IF;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name='amount') THEN 'amount'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name='budget_amount') THEN 'budget_amount'
    ELSE NULL
  END INTO v_amount_col;

  IF v_amount_col IS NULL THEN
    RETURN QUERY SELECT true, NULL::NUMERIC, NULL::NUMERIC, 'لا يوجد عمود مبلغ في budget_lines — تخطي'::TEXT, jsonb_build_object('scope', v_scope);
    RETURN;
  END IF;

  -- ✅ الإصلاح: اكتشاف عمود اسم الميزانية بدل افتراض وجود b.name
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budgets' AND column_name='budget_name') THEN 'budget_name'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budgets' AND column_name='name') THEN 'name'
    ELSE NULL
  END INTO v_name_col;

  v_name_expr := CASE
    WHEN v_name_col IS NULL THEN '''Budget'''
    ELSE 'COALESCE(b.' || quote_ident(v_name_col) || ', ''Budget'')'
  END;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name='cost_center_id') INTO v_has_cost_center;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name IN ('project_id','finance_project_id')) INTO v_has_project;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name IN ('category_code','budget_category_code')) INTO v_has_category;

  v_sql := 'SELECT b.id, ' || v_name_expr || ' AS budget_name, bl.' || quote_ident(v_amount_col) || ' AS amount
            FROM public.budgets b JOIN public.budget_lines bl ON bl.budget_id=b.id
            WHERE b.tenant_id=$1 AND COALESCE(b.fiscal_year, EXTRACT(YEAR FROM NOW())::INT)=EXTRACT(YEAR FROM NOW())::INT
              AND COALESCE(b.status, ''active'') IN (''active'',''approved'')';

  IF v_scope='cost_center' AND p_cost_center_id IS NOT NULL AND v_has_cost_center THEN
    v_sql := v_sql || ' AND bl.cost_center_id=$2';
    EXECUTE v_sql || ' ORDER BY b.created_at DESC LIMIT 1' INTO v_budget USING v_tenant, p_cost_center_id;
  ELSIF v_scope='project' AND p_project_id IS NOT NULL AND v_has_project THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name='project_id') THEN
      v_sql := v_sql || ' AND bl.project_id=$2';
    ELSE
      v_sql := v_sql || ' AND bl.finance_project_id=$2';
    END IF;
    EXECUTE v_sql || ' ORDER BY b.created_at DESC LIMIT 1' INTO v_budget USING v_tenant, p_project_id;
  ELSIF v_scope='category' AND p_category_code IS NOT NULL AND v_has_category THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name='category_code') THEN
      v_sql := v_sql || ' AND bl.category_code=$2';
    ELSE
      v_sql := v_sql || ' AND bl.budget_category_code=$2';
    END IF;
    EXECUTE v_sql || ' ORDER BY b.created_at DESC LIMIT 1' INTO v_budget USING v_tenant, p_category_code;
  ELSIF v_scope='capex' THEN
    IF p_cost_center_id IS NOT NULL AND v_has_cost_center THEN
      v_sql := v_sql || ' AND bl.cost_center_id=$2';
      EXECUTE v_sql || ' ORDER BY b.created_at DESC LIMIT 1' INTO v_budget USING v_tenant, p_cost_center_id;
    ELSE
      EXECUTE v_sql || ' ORDER BY b.created_at DESC LIMIT 1' INTO v_budget USING v_tenant;
    END IF;
  ELSE
    EXECUTE v_sql || ' ORDER BY b.created_at DESC LIMIT 1' INTO v_budget USING v_tenant;
  END IF;

  IF v_budget.id IS NULL THEN
    RETURN QUERY SELECT true, NULL::NUMERIC, NULL::NUMERIC, ('لا توجد ميزانية مطابقة للنطاق: ' || v_scope || ' — تخطي')::TEXT, jsonb_build_object('scope', v_scope);
    RETURN;
  END IF;

  SELECT COALESCE(SUM(total_estimated),0) INTO v_spent_pr
  FROM public.purchase_requisitions
  WHERE tenant_id=v_tenant
    AND status IN ('approved','converted_to_po')
    AND EXTRACT(YEAR FROM created_at)=EXTRACT(YEAR FROM NOW())
    AND (v_scope <> 'cost_center' OR p_cost_center_id IS NULL OR cost_center_id=p_cost_center_id)
    AND (v_scope <> 'project' OR p_project_id IS NULL OR project_id=p_project_id)
    AND (v_scope <> 'category' OR p_category_code IS NULL OR budget_category_code=p_category_code)
    AND (v_scope <> 'capex' OR request_type='asset');

  IF to_regclass('public.spend_transactions') IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_spent_spend
    FROM public.spend_transactions
    WHERE tenant_id=v_tenant
      AND EXTRACT(YEAR FROM transaction_date)=EXTRACT(YEAR FROM NOW())
      AND (v_scope <> 'cost_center' OR p_cost_center_id IS NULL OR cost_center_id=p_cost_center_id)
      AND (v_scope <> 'category' OR p_category_code IS NULL OR category_code=p_category_code);
  END IF;

  v_remaining := COALESCE(v_budget.amount,0) - v_spent_pr - v_spent_spend;
  RETURN QUERY SELECT
    (v_remaining >= COALESCE(p_amount,0)),
    v_remaining::NUMERIC,
    (v_remaining - COALESCE(p_amount,0))::NUMERIC,
    v_budget.budget_name::TEXT,
    jsonb_build_object('scope',v_scope,'budget_total',v_budget.amount,'pr_approved',v_spent_pr,'spend_transactions',v_spent_spend,'total_spent',v_spent_pr+v_spent_spend);
END $$;

GRANT EXECUTE ON FUNCTION public.check_pr_budget_extended(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.check_pr_budget_extended(uuid,uuid,text,text,text,numeric)') IS NULL THEN
    RAISE EXCEPTION '0257 failed: check_pr_budget_extended is missing';
  END IF;
  RAISE NOTICE '✅ 0257: check_pr_budget_extended column bug fixed';
END $$;
