-- ============================================================================
-- Kyvzon — 0149_finance_legacy_tables_rls.sql
-- P0 SECURITY FIX: Tenant isolation (RLS) for legacy finance tables.
--
-- السياق:
--   الوحدة المالية القديمة (migrations 0103–0121) أنشأت 19 جدولاً حسّاساً
--   (حسابات بنكية، موازنات، ضرائب، إيرادات، أصول ثابتة، شركات تابعة...)
--   بدون تفعيل Row-Level Security ولا أي سياسات. في نظام SaaS متعدد المستأجرين
--   هذا يعني أن أي مستخدم مصادَق عليه يستطيع — عبر PostgREST — قراءة/تعديل
--   البيانات المالية لشركات أخرى. هذا خرق عزل مستأجرين حرج (P0).
--
--   ملف 0105_rls_policies.sql أنشأ سياسات لـ chart_of_accounts/journal_entries
--   فقط، ولم يشمل هذه الـ 19 جدولاً.
--
-- ما يفعله هذا الملف:
--   1. يُفعّل ENABLE ROW LEVEL SECURITY على الجداول الـ 19.
--   2. يُنشئ سياسات FOR ALL مقيّدة بالمستأجر:
--        - جداول لها tenant_id مباشر → tenant_id = current_user_tenant_id()
--        - جداول ابن (child)      → عبر ربط بالجدول الأب (import/budget/asset/contract)
--        - جداول التوحيد (consolidation) → parent_tenant = current_user_tenant_id()
--   3. idempotent بالكامل (DROP POLICY IF EXISTS + to_regclass guards).
--
-- ملاحظة: service_role يتجاوز RLS بحكم التصميم (BYPASSRLS)، لذا Edge Functions
--         الإدارية تبقى تعمل. السياسات تستهدف دور authenticated.
-- ============================================================================

-- ─── (1) الجداول ذات tenant_id المباشر ───────────────────────────────────────
DO $$
DECLARE
  v_t TEXT;
  v_direct CONSTANT TEXT[] := ARRAY[
    'bank_accounts',
    'bank_reconciliations',
    'bank_statement_imports',
    'budgets',
    'budget_variance_reports',
    'cash_forecast_scenarios',
    'financial_report_templates',
    'fixed_assets',
    'intercompany_transactions',
    'projects',
    'revenue_contracts',
    'tax_codes',
    'tax_filing_status'
  ];
BEGIN
  FOREACH v_t IN ARRAY v_direct LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      RAISE NOTICE 'skip (missing): %', v_t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_t || '_tenant', v_t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (tenant_id = public.current_user_tenant_id()) '
      'WITH CHECK (tenant_id = public.current_user_tenant_id())',
      'kyvzon_' || v_t || '_tenant', v_t
    );
  END LOOP;
END $$;

-- ─── (2) الجداول الابن — العزل عبر الجدول الأب ────────────────────────────────
-- bank_statement_lines → bank_statement_imports (import_id)
DO $$ BEGIN
  IF to_regclass('public.bank_statement_lines') IS NOT NULL THEN
    ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kyvzon_bank_statement_lines_tenant ON public.bank_statement_lines;
    CREATE POLICY kyvzon_bank_statement_lines_tenant ON public.bank_statement_lines
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.bank_statement_imports i
        WHERE i.id = bank_statement_lines.import_id
          AND i.tenant_id = public.current_user_tenant_id()))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.bank_statement_imports i
        WHERE i.id = bank_statement_lines.import_id
          AND i.tenant_id = public.current_user_tenant_id()));
  END IF;
END $$;

-- budget_lines → budgets (budget_id)
DO $$ BEGIN
  IF to_regclass('public.budget_lines') IS NOT NULL THEN
    ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kyvzon_budget_lines_tenant ON public.budget_lines;
    CREATE POLICY kyvzon_budget_lines_tenant ON public.budget_lines
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.budgets b
        WHERE b.id = budget_lines.budget_id
          AND b.tenant_id = public.current_user_tenant_id()))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.budgets b
        WHERE b.id = budget_lines.budget_id
          AND b.tenant_id = public.current_user_tenant_id()));
  END IF;
END $$;

-- depreciation_schedules → fixed_assets (asset_id)
DO $$ BEGIN
  IF to_regclass('public.depreciation_schedules') IS NOT NULL THEN
    ALTER TABLE public.depreciation_schedules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kyvzon_depreciation_schedules_tenant ON public.depreciation_schedules;
    CREATE POLICY kyvzon_depreciation_schedules_tenant ON public.depreciation_schedules
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.fixed_assets a
        WHERE a.id = depreciation_schedules.asset_id
          AND a.tenant_id = public.current_user_tenant_id()))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.fixed_assets a
        WHERE a.id = depreciation_schedules.asset_id
          AND a.tenant_id = public.current_user_tenant_id()));
  END IF;
END $$;

-- revenue_recognition_schedules → revenue_contracts (contract_id)
DO $$ BEGIN
  IF to_regclass('public.revenue_recognition_schedules') IS NOT NULL THEN
    ALTER TABLE public.revenue_recognition_schedules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kyvzon_revenue_recognition_schedules_tenant ON public.revenue_recognition_schedules;
    CREATE POLICY kyvzon_revenue_recognition_schedules_tenant ON public.revenue_recognition_schedules
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.revenue_contracts c
        WHERE c.id = revenue_recognition_schedules.contract_id
          AND c.tenant_id = public.current_user_tenant_id()))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.revenue_contracts c
        WHERE c.id = revenue_recognition_schedules.contract_id
          AND c.tenant_id = public.current_user_tenant_id()));
  END IF;
END $$;

-- ─── (3) جداول التوحيد متعدد الشركات — العزل عبر parent_tenant ─────────────────
-- المالك للسجل هو الشركة الأم (parent_tenant). الشركة التابعة لا ترى قيود التوحيد.
DO $$
DECLARE
  v_t TEXT;
  v_consol CONSTANT TEXT[] := ARRAY['subsidiaries', 'consolidation_entries'];
BEGIN
  FOREACH v_t IN ARRAY v_consol LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kyvzon_' || v_t || '_tenant', v_t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (parent_tenant = public.current_user_tenant_id()) '
      'WITH CHECK (parent_tenant = public.current_user_tenant_id())',
      'kyvzon_' || v_t || '_tenant', v_t
    );
  END LOOP;
END $$;

-- ─── (4) تحقّق نهائي: لا يجوز بقاء أي جدول من الـ 19 بلا RLS ──────────────────
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relrowsecurity = false
    AND c.relname = ANY (ARRAY[
      'bank_accounts','bank_reconciliations','bank_statement_imports','bank_statement_lines',
      'budgets','budget_lines','budget_variance_reports','cash_forecast_scenarios',
      'consolidation_entries','depreciation_schedules','financial_report_templates',
      'fixed_assets','intercompany_transactions','projects','revenue_contracts',
      'revenue_recognition_schedules','subsidiaries','tax_codes','tax_filing_status']);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '0149 assertion failed: finance tables still without RLS: %', v_missing;
  END IF;
  RAISE NOTICE '0149 OK: RLS enabled on all 19 legacy finance tables.';
END $$;
