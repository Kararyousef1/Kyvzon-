-- ============================================================================
-- 0198 — PR Budget Scope Robustness + Reorder Point UI Support
-- التوثيق: docs/e-procurement/01-purchase-requisition-approval.md
-- يغطي: فحص ميزانية أعمق/آمن schema-wise، CAPEX/project/category foundation.
-- ============================================================================

ALTER TABLE public.procurement_reorder_points ADD COLUMN IF NOT EXISTS estimated_unit_price NUMERIC(16,2) DEFAULT 0;
ALTER TABLE public.procurement_reorder_points ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal','urgent','emergency'));
ALTER TABLE public.procurement_reorder_points ADD COLUMN IF NOT EXISTS needed_in_days INT DEFAULT 7;

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
  v_scope TEXT := COALESCE(p_budget_scope, CASE WHEN p_request_type='asset' THEN 'capex' ELSE 'cost_center' END);
  v_amount_col TEXT;
  v_has_cost_center BOOLEAN;
  v_has_project BOOLEAN;
  v_has_category BOOLEAN;
  v_budget RECORD;
  v_sql TEXT;
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

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name='cost_center_id') INTO v_has_cost_center;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name IN ('project_id','finance_project_id')) INTO v_has_project;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_lines' AND column_name IN ('category_code','budget_category_code')) INTO v_has_category;

  -- بناء اختيار الميزانية بناءً على الأعمدة الموجودة فعلاً حتى لا تفشل migrations القديمة.
  v_sql := 'SELECT b.id, COALESCE(b.budget_name, b.name, ''Budget'') AS budget_name, bl.' || quote_ident(v_amount_col) || ' AS amount
            FROM public.budgets b JOIN public.budget_lines bl ON bl.budget_id=b.id
            WHERE b.tenant_id=$1 AND COALESCE(b.fiscal_year, EXTRACT(YEAR FROM NOW())::INT)=EXTRACT(YEAR FROM NOW())::INT
              AND COALESCE(b.status, ''active'') IN (''active'',''approved'')';

  IF v_scope='cost_center' AND p_cost_center_id IS NOT NULL AND v_has_cost_center THEN
    v_sql := v_sql || ' AND bl.cost_center_id=$2';
    EXECUTE v_sql || ' ORDER BY b.created_at DESC LIMIT 1' INTO v_budget USING v_tenant, p_cost_center_id;
  ELSIF v_scope='project' AND p_project_id IS NOT NULL AND v_has_project THEN
    -- finance_project_id/project_id اختلاف أسماء محتمل؛ نستخدم dynamic حسب الموجود.
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
    -- إذا لا يوجد تصنيف CAPEX صريح، نستخدم cost_center كfallback مع تعليم واضح.
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
    v_remaining,
    v_remaining - COALESCE(p_amount,0),
    v_budget.budget_name,
    jsonb_build_object('scope',v_scope,'budget_total',v_budget.amount,'pr_approved',v_spent_pr,'spend_transactions',v_spent_spend,'total_spent',v_spent_pr+v_spent_spend);
END $$;
GRANT EXECUTE ON FUNCTION public.check_pr_budget_extended(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC) TO authenticated;

-- توافق خلفي للدوال القديمة التي تستدعي check_pr_budget(tenant,cost_center,amount)؛ لا نثق بـ tenant الممرر ونستخدم current_user_tenant_id داخلياً.
CREATE OR REPLACE FUNCTION public.check_pr_budget(
  p_tenant_id UUID,
  p_cost_center_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (is_ok BOOLEAN, remaining_before NUMERIC, remaining_after NUMERIC, budget_name TEXT, spent_breakdown JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.check_pr_budget_extended(p_cost_center_id, NULL, 'cost_center', NULL, 'raw_material', p_amount);
$$;
-- لا نعيد فتح نسخة tenant-id للعميل؛ تبقى متاحة داخلياً للدوال SECURITY DEFINER فقط.
REVOKE ALL ON FUNCTION public.check_pr_budget(UUID,UUID,NUMERIC) FROM PUBLIC, authenticated;

-- Overload آمن لا يستقبل tenant_id من العميل.
-- مهم: لا نستخدم DROP هنا لأن View pr_pending_with_age من 0190 يعتمد على هذا التوقيع.
-- CREATE OR REPLACE يكفي لأن 0190 ثبّت نفس RETURNS TABLE بخمسة أعمدة.
CREATE OR REPLACE FUNCTION public.check_pr_budget(p_cost_center_id UUID, p_amount NUMERIC)
RETURNS TABLE (is_ok BOOLEAN, remaining_before NUMERIC, remaining_after NUMERIC, budget_name TEXT, spent_breakdown JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.check_pr_budget_extended(p_cost_center_id, NULL, 'cost_center', NULL, 'raw_material', p_amount);
$$;
GRANT EXECUTE ON FUNCTION public.check_pr_budget(UUID,NUMERIC) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.check_pr_budget_extended(uuid,uuid,text,text,text,numeric)') IS NULL THEN
    RAISE EXCEPTION '0198 failed: budget extended function missing';
  END IF;
  RAISE NOTICE '✅ 0198: PR budget scope robustness and reorder UI support applied';
END $$;
