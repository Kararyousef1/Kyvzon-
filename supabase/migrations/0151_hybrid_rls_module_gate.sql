-- ============================================================================
-- Kyvzon — 0151_hybrid_rls_module_gate.sql
-- بوابة RLS على مستوى الوحدة للاشتراك الهجين (المرحلة 3 — الحماية الخلفية).
--
-- الهدف:
--   إغلاق الثغرة على مستوى قاعدة البيانات (وليس الواجهة فقط): الشركة الهجينة
--   يجب ألا تصل لبيانات جداول تخصّ وحدةً لم تُخصَّص لها ضمن features — حتى لو
--   استُدعيت البيانات مباشرة عبر PostgREST متجاوزةً الواجهة.
--
-- مبدأ الأمان (حاسم):
--   * صفر أثر على الشركات غير الهجينة: كل الدوال تُرجع true فوراً لغير الهجين،
--     فلا تتأثر سياساتها القائمة إطلاقاً.
--   * employee + tawathul مفعّلتان دائماً للهجين (مطابقة لمنطق الواجهة في
--     useTenantModules: [...fromPages, 'employee', 'tawathul']).
--   * الجداول الجوهرية/المشتركة (CORE) لا تُقيَّد أبداً.
--
-- الآلية:
--   سياسة RESTRICTIVE إضافية لكل جدول = تُدمَج (AND) مع السياسات الموجودة،
--   ولا تستبدلها. الصيغة: USING (hybrid_allows_module('<module>')).
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ─── (1) الوحدات المفعّلة لشركة هجينة (مشتقّة من features) ────────────────────
-- تعكس نفس منطق getModuleForPage في الواجهة.
CREATE OR REPLACE FUNCTION public.hybrid_enabled_modules()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_features TEXT[];
  v_page TEXT;
  v_modules TEXT[] := ARRAY['employee', 'tawathul']; -- دائماً مفعّلة للهجين
BEGIN
  SELECT t.features INTO v_features
  FROM public.tenants t
  WHERE t.id = public.current_user_tenant_id()
  LIMIT 1;

  IF v_features IS NULL THEN
    RETURN v_modules;
  END IF;

  FOREACH v_page IN ARRAY v_features LOOP
    IF v_page LIKE 'employee-%' OR v_page = 'new-problem' THEN
      v_modules := array_append(v_modules, 'employee');
    ELSIF v_page LIKE 'hr-%' THEN
      v_modules := array_append(v_modules, 'hr');
    ELSIF v_page LIKE 'admin-%' THEN
      v_modules := array_append(v_modules, 'admin');
    ELSIF v_page LIKE 'supervisor-%' THEN
      v_modules := array_append(v_modules, 'manager'); -- المشرف ضمن مجموعة إدارة الفريق
    ELSIF v_page LIKE 'manager-%' THEN
      v_modules := array_append(v_modules, 'manager');
    ELSIF v_page LIKE 'gatekeeper-%' OR v_page = 'kiosk-mode' THEN
      v_modules := array_append(v_modules, 'gatekeeper');
    ELSIF v_page LIKE 'finance-%' THEN
      v_modules := array_append(v_modules, 'finance');
    ELSIF v_page LIKE 'tech-%' OR v_page = 'tech-portal'
          OR v_page IN ('biometric-devices','sync-logs','attendance-analytics','system-health','security-events') THEN
      v_modules := array_append(v_modules, 'tech_portal');
    END IF;
  END LOOP;

  RETURN ARRAY(SELECT DISTINCT unnest(v_modules));
END;
$$;

REVOKE ALL ON FUNCTION public.hybrid_enabled_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_enabled_modules() TO authenticated;

-- ─── (2) بوابة: هل يُسمح لمستخدم الجلسة بجداول وحدة معيّنة؟ ───────────────────
-- غير الهجين → true دائماً (صفر أثر). الهجين → فقط إن كانت الوحدة ضمن features.
CREATE OR REPLACE FUNCTION public.hybrid_allows_module(p_module TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT COALESCE(public.current_user_is_hybrid(), false) THEN true
    ELSE p_module = ANY (public.hybrid_enabled_modules())
  END;
$$;

REVOKE ALL ON FUNCTION public.hybrid_allows_module(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_allows_module(TEXT) TO authenticated;

-- ─── (3) تطبيق سياسات RESTRICTIVE إضافية حسب الوحدة ──────────────────────────
-- تُدمَج AND مع السياسات القائمة؛ لا تمنح صلاحية، بل تُضيف شرط الوحدة للهجين.
DO $$
DECLARE
  v_table TEXT;
  v_module TEXT;
  -- خريطة: module → جداوله. CORE مستبعد عمداً (لا يُقيَّد).
  v_map JSONB := '{
    "hr": ["ai_insights","announcement_likes","announcement_poll_options","announcement_polls","announcement_votes","announcements","attendance_logs","attendance_summary","biometric_devices","bonuses","courses","critical_positions","disciplinary_actions","employee_certifications","employee_contracts","employee_documents","employee_goals","employee_letter_requests","employee_loans","employee_onboarding","employee_skills","employees","expense_requests","hr_case_comments","hr_cases","hr_messages","incident_comments","incidents","job_applications","job_postings","leave_balance","leave_settings","leaves","offboarding_records","onboarding_tasks","overtime_log","payroll","payroll_periods","payroll_records","payroll_settings","performance_cycles","performance_reviews","quizzes","sops","succession_candidates","succession_development_plans"],
    "finance": ["accounting_periods","accounts_payable","accounts_receivable","bank_accounts","bank_reconciliations","bank_statement_imports","bank_statement_lines","budget_lines","budget_variance_reports","budgets","cash_forecast_scenarios","chart_of_accounts","consolidation_entries","cost_centers","currencies","customer_reviews","customers","depreciation_schedules","entity_memberships","exchange_rates","finance_audit_events","finance_document_sequences","finance_projects","financial_approval_requests","financial_approval_steps","financial_report_templates","fiscal_years","fixed_assets","intercompany_transactions","journal_books","journal_entries","journal_entry_lines","legal_entities","projects","revenue_contracts","revenue_recognition_schedules","subsidiaries","tax_codes","tax_filing_status","vendor_payment_allocations","vendor_payments","vendors"],
    "gatekeeper": ["gatekeeper_sessions","gatekeeper_visitor_logs","gatekeeper_visitors","movement_permits","movements_log","time_logs"],
    "manager": ["approval_actions","approval_requests","manager_workload_items","operational_checklists","shift_assignments","shift_notes","team_tasks"],
    "admin": ["compliance_checks","corrective_actions"]
  }'::JSONB;
BEGIN
  FOR v_module IN SELECT jsonb_object_keys(v_map) LOOP
    FOR v_table IN SELECT jsonb_array_elements_text(v_map -> v_module) LOOP
      IF to_regclass('public.' || v_table) IS NULL THEN
        CONTINUE;
      END IF;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'hybrid_gate_' || v_table, v_table);
      -- سياسة RESTRICTIVE: تُطبَّق على كل العمليات، وتُدمَج AND مع الموجود.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        'USING (public.hybrid_allows_module(%L)) '
        'WITH CHECK (public.hybrid_allows_module(%L))',
        'hybrid_gate_' || v_table, v_table, v_module, v_module
      );
    END LOOP;
  END LOOP;
END $$;

-- ملاحظة: 'permissions' و'permissions_request' لم تُقيَّد بوابةً هجينة لأنها
-- بنية صلاحيات جوهرية قد يحتاجها أي مستخدم؛ إبقاؤها مفتوحة أأمن من كسر الدخول.

-- ─── (4) تحقّق نهائي ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.hybrid_allows_module(text)') IS NULL THEN
    RAISE EXCEPTION '0151 assertion failed: hybrid_allows_module missing';
  END IF;
  RAISE NOTICE '0151 OK: hybrid module gate applied (restrictive policies) — zero impact on non-hybrid tenants.';
END $$;
