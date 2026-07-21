-- ============================================================================
--  Post-migration sanity checks — يُنفَّذ بعد كل migrations
--
--  يفشل السكربت بأمر psql -v ON_ERROR_STOP=1 عند أي RAISE EXCEPTION.
-- ============================================================================

\echo ''
\echo '=== A. عدد الجداول والـ Views ==='
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables_count,
  (SELECT COUNT(*) FROM information_schema.views
   WHERE table_schema = 'public') AS views_count;

\echo ''
\echo '=== B. جداول بدون RLS مفعّل (يجب أن يكون العدد = 0) ==='
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

\echo ''
\echo '=== C. الدوال المساعدة الموثوقة ==='
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'current_user_tenant_id',
    'current_user_role',
    'current_user_is_staff',
    'current_user_is_platform_owner',
    'current_user_employee_id',
    'set_session_context',
    'clear_session_context'
  )
ORDER BY proname;

\echo ''
\echo '=== D. عدد السياسات لكل جدول (top 15) ==='
SELECT tablename, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY COUNT(*) DESC
LIMIT 15;

\echo ''
\echo '=== E. الفهارس (top 20 حجماً) ==='
SELECT
  schemaname || '.' || indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

\echo ''
\echo '=== F. التحقق من الجداول المطلوبة من SDK ==='
DO $$
DECLARE
  required_tables TEXT[] := ARRAY[
    'tenants', 'profiles', 'employees', 'departments',
    'attendance_logs', 'leaves', 'holidays', 'permissions',
    'wellness_entries', 'notifications', 'incidents',
    'announcements', 'announcement_polls', 'announcement_votes', 'announcement_likes',
    'gatekeeper_sessions', 'gatekeeper_visitors', 'gatekeeper_visitor_logs',
    'movements_log', 'time_logs', 'specialties',
    'job_applications', 'ai_insights', 'customer_reviews',
    'approval_requests', 'approval_actions',
    'financial_approval_requests', 'financial_approval_steps',
    'legal_entities', 'entity_memberships', 'fiscal_years', 'accounting_periods',
    'cost_centers', 'finance_projects', 'exchange_rates',
    'tawathul_conversations', 'tawathul_messages', 'tawathul_members'
  ];
  required_views TEXT[] := ARRAY[
    'announcements_with_stats',
    'public_landing_config'
  ];
  tbl TEXT;
  vw TEXT;
BEGIN
  FOREACH tbl IN ARRAY required_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE EXCEPTION 'FAILED: table % does not exist', tbl;
    END IF;
  END LOOP;

  FOREACH vw IN ARRAY required_views LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = vw
    ) THEN
      RAISE EXCEPTION 'FAILED: view % does not exist', vw;
    END IF;
  END LOOP;

  RAISE NOTICE 'CHECK F PASSED — كل الجداول والـ views المطلوبة موجودة (% + %)',
    array_length(required_tables, 1), array_length(required_views, 1);
END $$;

\echo ''
\echo '=== G. التحقق من عمل الدوال المساعدة (كـ authenticated) ==='
DO $$
DECLARE
  v_uid UUID;
  v_role TEXT;
BEGIN
  -- بدون JWT: يجب أن ترجع NULL
  v_uid := public.current_user_tenant_id();
  IF v_uid IS NOT NULL THEN
    RAISE EXCEPTION 'FAILED: current_user_tenant_id() should return NULL without JWT context, got: %', v_uid;
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NOT NULL THEN
    RAISE EXCEPTION 'FAILED: current_user_role() should return NULL without JWT context, got: %', v_role;
  END IF;

  RAISE NOTICE 'CHECK G PASSED — الدوال المساعدة تُرجع NULL بدون سياق JWT (سلوك آمن)';
END $$;

\echo ''
\echo '=== H. لا يجوز بقاء أي جدول مالي حسّاس بلا RLS (حارس 0149) ==='
DO $$
DECLARE
  v_missing TEXT;
  v_finance CONSTANT TEXT[] := ARRAY[
    'bank_accounts','bank_reconciliations','bank_statement_imports','bank_statement_lines',
    'budgets','budget_lines','budget_variance_reports','cash_forecast_scenarios',
    'consolidation_entries','depreciation_schedules','financial_report_templates',
    'fixed_assets','intercompany_transactions','projects','revenue_contracts',
    'revenue_recognition_schedules','subsidiaries','tax_codes','tax_filing_status'
  ];
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relrowsecurity = false
    AND c.relname = ANY (v_finance);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAILED (regression!): finance tables without RLS: %', v_missing;
  END IF;
  RAISE NOTICE 'CHECK H PASSED — كل الجداول المالية الحسّاسة (%) عليها RLS', array_length(v_finance, 1);
END $$;

\echo ''
\echo '=== I. دعم الاشتراك الهجين (hybrid) على مستوى قاعدة البيانات ==='
DO $$
BEGIN
  -- 1) القيد يسمح بـ hybrid
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_subscription_plan_check'
      AND conrelid = 'public.tenants'::regclass
      AND pg_get_constraintdef(oid) LIKE '%hybrid%'
  ) THEN
    RAISE EXCEPTION 'FAILED: tenants_subscription_plan_check does not permit hybrid';
  END IF;

  -- 2) الدوال المساعدة موجودة
  IF to_regprocedure('public.current_user_is_hybrid()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: current_user_is_hybrid() missing';
  END IF;
  IF to_regprocedure('public.tenant_has_feature(text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: tenant_has_feature(text) missing';
  END IF;

  RAISE NOTICE 'CHECK I PASSED — hybrid plan + RLS helper functions موجودة';
END $$;

\echo ''
\echo '=== J. بوابة RLS للوحدات في الاشتراك الهجين ==='
DO $$
DECLARE
  v_gate_count INT;
BEGIN
  IF to_regprocedure('public.hybrid_allows_module(text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: hybrid_allows_module(text) missing';
  END IF;
  IF to_regprocedure('public.hybrid_enabled_modules()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: hybrid_enabled_modules() missing';
  END IF;

  SELECT count(*) INTO v_gate_count FROM pg_policy WHERE polname LIKE 'hybrid_gate_%';
  IF v_gate_count < 50 THEN
    RAISE EXCEPTION 'FAILED: expected >=50 hybrid_gate policies, found %', v_gate_count;
  END IF;

  RAISE NOTICE 'CHECK J PASSED — % سياسة hybrid_gate + دوال البوابة موجودة', v_gate_count;
END $$;

\echo ''
\echo '=== K. أعمدة أدوار الهيكل التنظيمي في departments ==='
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='departments' AND column_name='supervisor_id') THEN
    RAISE EXCEPTION 'FAILED: departments.supervisor_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='departments' AND column_name='direct_manager_id') THEN
    RAISE EXCEPTION 'FAILED: departments.direct_manager_id missing';
  END IF;
  RAISE NOTICE 'CHECK K PASSED — departments supervisor_id + direct_manager_id موجودة';
END $$;

\echo ''
\echo '=== L. نظام سلسلة موافقات HR (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.hr_approval_requests') IS NULL OR to_regclass('public.hr_approval_steps') IS NULL THEN
    RAISE EXCEPTION 'FAILED: hr_approval tables missing';
  END IF;
  IF to_regprocedure('public.create_hr_approval(text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.decide_hr_approval_step(uuid,text,text)') IS NULL
     OR to_regprocedure('public.resolve_department_chain(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: hr_approval functions missing';
  END IF;
  RAISE NOTICE 'CHECK L PASSED — نظام سلسلة موافقات HR مكتمل';
END $$;

\echo ''
\echo '=== M. وحدة أتمتة التسويق (جداول + دوال المحرّك) ==='
DO $$
BEGIN
  IF to_regclass('public.marketing_leads') IS NULL
     OR to_regclass('public.marketing_lead_score_rules') IS NULL
     OR to_regclass('public.marketing_lead_score_events') IS NULL
     OR to_regclass('public.marketing_workflows') IS NULL
     OR to_regclass('public.marketing_workflow_steps') IS NULL
     OR to_regclass('public.marketing_workflow_enrollments') IS NULL
     OR to_regclass('public.marketing_action_log') IS NULL THEN
    RAISE EXCEPTION 'FAILED: marketing automation tables missing';
  END IF;
  IF to_regprocedure('public.apply_lead_score_event(uuid,text)') IS NULL
     OR to_regprocedure('public.enroll_lead_in_workflow(uuid,uuid)') IS NULL
     OR to_regprocedure('public.advance_workflow_enrollment(uuid,text)') IS NULL
     OR to_regprocedure('public.seed_marketing_score_rules(uuid)') IS NULL
     OR to_regprocedure('public.marketing_temperature_for_score(integer)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: marketing automation functions missing';
  END IF;
  RAISE NOTICE 'CHECK M PASSED — وحدة أتمتة التسويق مكتملة (7 جداول + 5 دوال)';
END $$;

\echo ''
\echo '=== N. وحدة البريد الإلكتروني (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.email_sender_domains') IS NULL
     OR to_regclass('public.email_lists') IS NULL
     OR to_regclass('public.email_subscribers') IS NULL
     OR to_regclass('public.email_list_members') IS NULL
     OR to_regclass('public.email_segments') IS NULL
     OR to_regclass('public.email_templates') IS NULL
     OR to_regclass('public.email_campaigns') IS NULL
     OR to_regclass('public.email_campaign_variants') IS NULL
     OR to_regclass('public.email_events') IS NULL
     OR to_regclass('public.email_unsubscribe_log') IS NULL THEN
    RAISE EXCEPTION 'FAILED: email marketing tables missing';
  END IF;
  IF to_regprocedure('public.record_email_event(uuid,text,uuid,uuid,text,uuid,text,text)') IS NULL
     OR to_regprocedure('public.confirm_email_subscription(uuid)') IS NULL
     OR to_regprocedure('public.email_campaign_kpis(uuid)') IS NULL
     OR to_regprocedure('public.email_warmup_schedule()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: email marketing functions missing';
  END IF;
  RAISE NOTICE 'CHECK N PASSED — وحدة البريد الإلكتروني مكتملة (10 جداول + 4 دوال)';
END $$;

\echo ''
\echo '=== O. وحدة وسائل التواصل الاجتماعي (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.social_accounts') IS NULL
     OR to_regclass('public.social_posts') IS NULL
     OR to_regclass('public.social_post_targets') IS NULL
     OR to_regclass('public.social_interactions') IS NULL
     OR to_regclass('public.social_utm_links') IS NULL
     OR to_regclass('public.social_listening_terms') IS NULL
     OR to_regclass('public.social_listening_mentions') IS NULL THEN
    RAISE EXCEPTION 'FAILED: social media tables missing';
  END IF;
  IF to_regprocedure('public.build_utm_url(text,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.convert_interaction_to_lead(uuid,uuid)') IS NULL
     OR to_regprocedure('public.social_kpis()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: social media functions missing';
  END IF;
  RAISE NOTICE 'CHECK O PASSED — وحدة وسائل التواصل الاجتماعي مكتملة (7 جداول + 3 دوال)';
END $$;

\echo ''
\echo '=== P. وحدة الرسائل النصية والواتساب (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.messaging_gateways') IS NULL
     OR to_regclass('public.messaging_contacts') IS NULL
     OR to_regclass('public.messaging_consent_log') IS NULL
     OR to_regclass('public.whatsapp_templates') IS NULL
     OR to_regclass('public.sms_templates') IS NULL
     OR to_regclass('public.messaging_campaigns') IS NULL
     OR to_regclass('public.messaging_messages') IS NULL THEN
    RAISE EXCEPTION 'FAILED: messaging tables missing';
  END IF;
  IF to_regprocedure('public.send_messaging(uuid,text,text,uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.process_stop_reply(uuid,text)') IS NULL
     OR to_regprocedure('public.messaging_kpis(text)') IS NULL
     OR to_regprocedure('public.whatsapp_warmup_schedule()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: messaging functions missing';
  END IF;
  RAISE NOTICE 'CHECK P PASSED — وحدة الرسائل (SMS/واتساب) مكتملة (7 جداول + 4 دوال)';
END $$;

\echo ''
\echo '=== Q. وحدة إدارة الفعاليات (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.marketing_events') IS NULL
     OR to_regclass('public.event_speakers') IS NULL
     OR to_regclass('public.event_sponsors') IS NULL
     OR to_regclass('public.event_sessions') IS NULL
     OR to_regclass('public.event_ticket_types') IS NULL
     OR to_regclass('public.event_promo_codes') IS NULL
     OR to_regclass('public.event_registrations') IS NULL THEN
    RAISE EXCEPTION 'FAILED: event management tables missing';
  END IF;
  IF to_regprocedure('public.register_for_event(uuid,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.checkin_by_qr(uuid)') IS NULL
     OR to_regprocedure('public.set_event_engagement(uuid,integer,integer)') IS NULL
     OR to_regprocedure('public.event_kpis(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: event management functions missing';
  END IF;
  RAISE NOTICE 'CHECK Q PASSED — وحدة إدارة الفعاليات مكتملة (7 جداول + 4 دوال)';
END $$;

\echo ''
\echo '=== R. وحدة الاستبيانات والتغذية الراجعة (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.marketing_surveys') IS NULL
     OR to_regclass('public.mkt_survey_questions') IS NULL
     OR to_regclass('public.mkt_survey_responses') IS NULL
     OR to_regclass('public.mkt_survey_answers') IS NULL
     OR to_regclass('public.mkt_survey_certificates') IS NULL THEN
    RAISE EXCEPTION 'FAILED: surveys tables missing';
  END IF;
  IF to_regprocedure('public.submit_survey_response(uuid,jsonb,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.close_survey_loop(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.survey_kpis(uuid)') IS NULL
     OR to_regprocedure('public.nps_category_for(integer)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: surveys functions missing';
  END IF;
  RAISE NOTICE 'CHECK R PASSED — وحدة الاستبيانات مكتملة (5 جداول + 4 دوال)';
END $$;

\echo ''
\echo '=== S. نظام المناعة العلائقية (جداول + دوال — الطبقة الحاكمة) ==='
DO $$
BEGIN
  IF to_regclass('public.relationship_balances') IS NULL
     OR to_regclass('public.relationship_ledger') IS NULL
     OR to_regclass('public.governance_log') IS NULL
     OR to_regclass('public.cultural_calendar') IS NULL
     OR to_regclass('public.immune_incidents') IS NULL
     OR to_regclass('public.immune_settings') IS NULL THEN
    RAISE EXCEPTION 'FAILED: relationship immune system tables missing';
  END IF;
  IF to_regprocedure('public.apply_relationship_event(uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.governance_check(uuid,text,text,boolean)') IS NULL
     OR to_regprocedure('public.marketing_debt(integer)') IS NULL
     OR to_regprocedure('public.raise_immune_incident(text,text,text,text)') IS NULL
     OR to_regprocedure('public.relationship_status(integer)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: relationship immune system functions missing';
  END IF;
  RAISE NOTICE 'CHECK S PASSED — نظام المناعة العلائقية مكتمل (6 جداول + 8 دوال)';
END $$;

\echo ''
\echo '=== ✅ POST-MIGRATION CHECKS: ALL PASS ==='
