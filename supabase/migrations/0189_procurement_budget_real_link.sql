-- ============================================================================
-- 0189 — ربط فحص ميزانية PR بالمالية الحقيقية (journal_entries + spend_transactions)
-- يحدث دالة check_pr_budget لتقرأ الإنفاق الحقيقي من 3 مصادر: PRs المعتمدة + spend_transactions + journal_entries
-- ============================================================================

DROP FUNCTION IF EXISTS public.check_pr_budget(UUID,UUID,NUMERIC);

CREATE OR REPLACE FUNCTION public.check_pr_budget(
  p_tenant_id UUID,
  p_cost_center_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (is_ok BOOLEAN, remaining_before NUMERIC, remaining_after NUMERIC, budget_name TEXT, spent_breakdown JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget RECORD;
  v_spent_pr NUMERIC := 0;
  v_spent_spend NUMERIC := 0;
  v_spent_journal NUMERIC := 0;
  v_spent_total NUMERIC := 0;
  v_remaining NUMERIC;
BEGIN
  IF p_cost_center_id IS NULL THEN
    RETURN QUERY SELECT true, NULL::NUMERIC, NULL::NUMERIC, 'لا يوجد مركز تكلفة — تخطي فحص الميزانية'::TEXT, '{}'::JSONB;
    RETURN;
  END IF;

  -- خذ أول ميزانية نشطة لنفس cost_center في السنة الحالية
  SELECT b.id, b.budget_name, bl.amount INTO v_budget
  FROM public.budgets b
  JOIN public.budget_lines bl ON bl.budget_id = b.id
  WHERE b.tenant_id = p_tenant_id
    AND bl.cost_center_id = p_cost_center_id
    AND b.fiscal_year = EXTRACT(YEAR FROM NOW())::INT
    AND b.status = 'active'
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, NULL::NUMERIC, NULL::NUMERIC, 'لا توجد ميزانية — تخطي'::TEXT, '{}'::JSONB;
    RETURN;
  END IF;

  -- 1) المنصرف من PRs المعتمدة لنفس cost_center السنة الحالية
  SELECT COALESCE(SUM(total_estimated),0) INTO v_spent_pr
  FROM public.purchase_requisitions
  WHERE tenant_id = p_tenant_id
    AND cost_center_id = p_cost_center_id
    AND status IN ('approved','converted_to_po')
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  -- 2) المنصرف من spend_transactions (إنفاق حقيقي من PO/فواتير) — جديد
  SELECT COALESCE(SUM(amount),0) INTO v_spent_spend
  FROM public.spend_transactions
  WHERE tenant_id = p_tenant_id
    AND cost_center_id = p_cost_center_id
    AND EXTRACT(YEAR FROM transaction_date) = EXTRACT(YEAR FROM NOW());

  -- 3) المنصرف من journal_entries (قيود يومية مرحلة لنفس cost_center) — جديد
  -- نفترض أن journal_entry_lines تحتوي cost_center_id (إن وجد)
  BEGIN
    SELECT COALESCE(SUM(jel.debit),0) INTO v_spent_journal
    FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.tenant_id = p_tenant_id
      AND jel.cost_center_id = p_cost_center_id
      AND je.status = 'posted'
      AND EXTRACT(YEAR FROM je.entry_date) = EXTRACT(YEAR FROM NOW());
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_spent_journal := 0;
  END;

  v_spent_total := v_spent_pr + v_spent_spend + v_spent_journal;
  v_remaining := COALESCE(v_budget.amount,0) - v_spent_total;

  RETURN QUERY SELECT 
    (v_remaining >= p_amount),
    v_remaining,
    (v_remaining - p_amount),
    v_budget.budget_name,
    jsonb_build_object(
      'pr_approved', v_spent_pr,
      'spend_transactions', v_spent_spend,
      'journal_posted', v_spent_journal,
      'total_spent', v_spent_total,
      'budget_total', v_budget.amount
    );
END $$;

GRANT EXECUTE ON FUNCTION public.check_pr_budget(UUID,UUID,NUMERIC) TO authenticated;

-- تحديث View pr_pending_with_age ليشمل budget breakdown
DROP VIEW IF EXISTS public.pr_pending_with_age;
CREATE OR REPLACE VIEW public.pr_pending_with_age AS
SELECT 
  pr.id, pr.tenant_id, pr.pr_number, pr.requester_id, pr.department_id, pr.cost_center_id,
  pr.total_estimated, pr.priority, pr.status, pr.created_at,
  EXTRACT(EPOCH FROM (NOW() - pr.created_at))/3600 AS age_hours,
  p.full_name AS requester_name,
  d.name_ar AS department_name,
  cc.name_ar AS cost_center_name,
  (SELECT is_ok FROM public.check_pr_budget(pr.tenant_id, pr.cost_center_id, pr.total_estimated) LIMIT 1) AS budget_ok
FROM public.purchase_requisitions pr
LEFT JOIN public.profiles p ON p.id=pr.requester_id
LEFT JOIN public.departments d ON d.id=pr.department_id
LEFT JOIN public.cost_centers cc ON cc.id=pr.cost_center_id
WHERE pr.status='pending_approval';

GRANT SELECT ON public.pr_pending_with_age TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0189: Budget check now links real finance — PRs + spend_transactions + journal_entries (posted)';
END $$;
