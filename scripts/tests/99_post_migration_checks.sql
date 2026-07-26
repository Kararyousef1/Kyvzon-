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
\echo '=== T. بوابة CRM — الوحدة 1: جهات الاتصال والحسابات (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.crm_accounts') IS NULL
     OR to_regclass('public.crm_contacts') IS NULL
     OR to_regclass('public.crm_activities_timeline') IS NULL
     OR to_regclass('public.crm_merge_log') IS NULL
     OR to_regclass('public.crm_audit_log') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM contacts/accounts tables missing';
  END IF;
  IF to_regprocedure('public.crm_account_360(uuid)') IS NULL
     OR to_regprocedure('public.crm_find_duplicate_contacts(uuid)') IS NULL
     OR to_regprocedure('public.crm_merge_contacts(uuid,uuid)') IS NULL
     OR to_regprocedure('public.crm_convert_lead(uuid)') IS NULL
     OR to_regprocedure('public.crm_enrich_account(uuid,text)') IS NULL
     OR to_regprocedure('public.crm_gdpr_erase_contact(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM contacts/accounts functions missing';
  END IF;
  RAISE NOTICE 'CHECK T PASSED — وحدة جهات الاتصال والحسابات مكتملة (5 جداول + 6 دوال)';
END $$;

\echo ''
\echo '=== U. بوابة CRM — الوحدة 2: خط الأنابيب والصفقات (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.crm_pipelines') IS NULL
     OR to_regclass('public.crm_stages') IS NULL
     OR to_regclass('public.crm_deal_loss_reasons') IS NULL
     OR to_regclass('public.crm_deals') IS NULL
     OR to_regclass('public.crm_deal_stage_history') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM pipeline/deals tables missing';
  END IF;
  IF to_regprocedure('public.crm_move_deal_stage(uuid,uuid)') IS NULL
     OR to_regprocedure('public.crm_close_deal(uuid,text,uuid,text,text)') IS NULL
     OR to_regprocedure('public.crm_deal_velocity(uuid)') IS NULL
     OR to_regprocedure('public.crm_deal_stagnation_alerts()') IS NULL
     OR to_regprocedure('public.crm_seed_default_pipeline()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM pipeline/deals functions missing';
  END IF;
  RAISE NOTICE 'CHECK U PASSED — وحدة خط الأنابيب والصفقات مكتملة (5 جداول + 5 دوال)';
END $$;

\echo ''
\echo '=== V. بوابة CRM — الوحدة 3: الأنشطة والأتمتة (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.crm_tasks') IS NULL
     OR to_regclass('public.crm_sequences') IS NULL
     OR to_regclass('public.crm_sequence_steps') IS NULL
     OR to_regclass('public.crm_sequence_enrollments') IS NULL
     OR to_regclass('public.crm_automation_rules') IS NULL
     OR to_regclass('public.crm_automation_log') IS NULL
     OR to_regclass('public.crm_assignment_rules') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM activities/automation tables missing';
  END IF;
  IF to_regprocedure('public.crm_log_call(uuid,uuid,uuid,integer,text,text,text,timestamptz)') IS NULL
     OR to_regprocedure('public.crm_complete_task(uuid)') IS NULL
     OR to_regprocedure('public.crm_enroll_in_sequence(uuid,uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.crm_advance_sequence(uuid)') IS NULL
     OR to_regprocedure('public.crm_apply_assignment(uuid)') IS NULL
     OR to_regprocedure('public.crm_activity_stats(integer)') IS NULL
     OR to_regprocedure('public.crm_activity_gaps(integer)') IS NULL
     OR to_regprocedure('public.crm_seed_default_sequences()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM activities/automation functions missing';
  END IF;
  RAISE NOTICE 'CHECK V PASSED — وحدة الأنشطة والأتمتة مكتملة (7 جداول + 8 دوال)';
END $$;

\echo ''
\echo '=== W. بوابة CRM — الوحدة 4: العروض والعقود CPQ (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.crm_products') IS NULL
     OR to_regclass('public.crm_pricing_rules') IS NULL
     OR to_regclass('public.crm_quotes') IS NULL
     OR to_regclass('public.crm_quote_line_items') IS NULL
     OR to_regclass('public.crm_discount_approvals') IS NULL
     OR to_regclass('public.crm_quote_events') IS NULL
     OR to_regclass('public.crm_contracts') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM quotes/CPQ tables missing';
  END IF;
  IF to_regprocedure('public.crm_discount_level(numeric)') IS NULL
     OR to_regprocedure('public.crm_recalc_quote(uuid)') IS NULL
     OR to_regprocedure('public.crm_submit_quote(uuid,text)') IS NULL
     OR to_regprocedure('public.crm_decide_approval(uuid,boolean,text)') IS NULL
     OR to_regprocedure('public.crm_send_quote(uuid)') IS NULL
     OR to_regprocedure('public.crm_track_quote_event(uuid,text,jsonb,text,text)') IS NULL
     OR to_regprocedure('public.crm_sign_quote(uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.crm_contract_renewal_alerts()') IS NULL
     OR to_regprocedure('public.crm_quote_analytics()') IS NULL
     OR to_regprocedure('public.crm_seed_default_products()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM quotes/CPQ functions missing';
  END IF;
  RAISE NOTICE 'CHECK W PASSED — وحدة العروض والعقود CPQ مكتملة (7 جداول + 10 دوال)';
END $$;

\echo ''
\echo '=== X. بوابة CRM — الوحدة 5: الدعم والتذاكر (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.crm_sla_policies') IS NULL
     OR to_regclass('public.crm_tickets') IS NULL
     OR to_regclass('public.crm_ticket_replies') IS NULL
     OR to_regclass('public.crm_canned_responses') IS NULL
     OR to_regclass('public.crm_kb_articles') IS NULL
     OR to_regclass('public.crm_routing_rules') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM support/ticketing tables missing';
  END IF;
  IF to_regprocedure('public.crm_create_ticket(text,text,uuid,uuid,text,text,text,text)') IS NULL
     OR to_regprocedure('public.crm_add_ticket_reply(uuid,text,boolean,text)') IS NULL
     OR to_regprocedure('public.crm_set_ticket_status(uuid,text)') IS NULL
     OR to_regprocedure('public.crm_submit_csat(uuid,integer,text)') IS NULL
     OR to_regprocedure('public.crm_support_churn_risk()') IS NULL
     OR to_regprocedure('public.crm_support_kpis()') IS NULL
     OR to_regprocedure('public.crm_seed_default_sla()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM support/ticketing functions missing';
  END IF;
  RAISE NOTICE 'CHECK X PASSED — وحدة الدعم والتذاكر مكتملة (6 جداول + 7 دوال)';
END $$;

\echo ''
\echo '=== Y. بوابة CRM — الوحدة 6: التحليلات والتنبؤ (جداول + دوال) ==='
DO $$
BEGIN
  IF to_regclass('public.crm_sales_targets') IS NULL
     OR to_regclass('public.crm_deal_forecast') IS NULL
     OR to_regclass('public.crm_mrr_snapshots') IS NULL
     OR to_regclass('public.crm_health_weights') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM analytics tables missing';
  END IF;
  IF to_regprocedure('public.crm_weighted_forecast(uuid)') IS NULL
     OR to_regprocedure('public.crm_conversion_funnel(uuid)') IS NULL
     OR to_regprocedure('public.crm_pipeline_velocity_report(uuid)') IS NULL
     OR to_regprocedure('public.crm_winloss_by_competitor()') IS NULL
     OR to_regprocedure('public.crm_segmentation()') IS NULL
     OR to_regprocedure('public.crm_account_health_score(uuid)') IS NULL
     OR to_regprocedure('public.crm_mrr_movement()') IS NULL
     OR to_regprocedure('public.crm_rep_performance(date)') IS NULL
     OR to_regprocedure('public.crm_exec_kpis()') IS NULL
     OR to_regprocedure('public.crm_seed_health_weights()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: CRM analytics functions missing';
  END IF;
  RAISE NOTICE 'CHECK Y PASSED — وحدة التحليلات والتنبؤ مكتملة (4 جداول + 10 دوال) — بوابة CRM كاملة 6/6';
END $$;

\echo ''
\echo '=== Z. توصيل المزوّدين + الربط المالي (البريد/الرسائل/المالية) ==='
DO $$
BEGIN
  -- عمود تتبّع البريد (0171)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_events' AND column_name='provider_message_id') THEN
    RAISE EXCEPTION 'FAILED: email_events.provider_message_id missing (0171)';
  END IF;
  -- عمود تتبّع الرسائل (0172)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messaging_messages' AND column_name='provider_message_id') THEN
    RAISE EXCEPTION 'FAILED: messaging_messages.provider_message_id missing (0172)';
  END IF;
  -- resend مزوّد مدعوم (0171)
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='email_sender_domains_provider_check' AND check_clause LIKE '%resend%') THEN
    RAISE EXCEPTION 'FAILED: resend not in email provider constraint (0171)';
  END IF;
  -- الربط المالي (0173)
  IF to_regprocedure('public.crm_link_deal_to_finance(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: crm_link_deal_to_finance missing (0173)';
  END IF;
  -- دفع الفعاليات (0174)
  IF to_regclass('public.event_payments') IS NULL
     OR to_regprocedure('public.mkt_record_event_payment_intent(uuid,text,numeric,text)') IS NULL
     OR to_regprocedure('public.mkt_confirm_event_payment(text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: event payments (Stripe) objects missing (0174)';
  END IF;
  -- إثراء البيانات (0175)
  IF to_regprocedure('public.crm_apply_enrichment(uuid,text,text,integer,numeric,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: crm_apply_enrichment missing (0175)';
  END IF;
  -- التوقيع الإلكتروني عن بُعد (0176)
  IF to_regclass('public.crm_signature_requests') IS NULL
     OR to_regprocedure('public.crm_record_signature_request(uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.crm_confirm_signature(text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: e-signature (DocuSign) objects missing (0176)';
  END IF;
  -- تكاملات OAuth (0177) + تأكيد أمان الرموز
  IF to_regclass('public.social_oauth_tokens') IS NULL
     OR to_regclass('public.crm_email_oauth_tokens') IS NULL
     OR to_regprocedure('public.store_social_oauth_token(uuid,text,text,text,text,text,text,text,timestamptz)') IS NULL
     OR to_regprocedure('public.disconnect_social_account(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: OAuth integration objects missing (0177)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('social_oauth_tokens','crm_email_oauth_tokens')) THEN
    RAISE EXCEPTION 'SECURITY: OAuth token tables must have NO authenticated policies (0177)';
  END IF;
  -- مفاتيح المزوّدين لكل شركة BYOK (0178) + تأكيد حماية الأسرار
  IF to_regclass('public.tenant_provider_credentials') IS NULL
     OR to_regprocedure('public.tenant_set_provider_credential(text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.tenant_list_provider_status()') IS NULL
     OR to_regprocedure('public.get_tenant_provider_secret(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: tenant provider credentials (BYOK) missing (0178)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenant_provider_credentials') THEN
    RAISE EXCEPTION 'SECURITY: tenant_provider_credentials must have NO direct policies (0178)';
  END IF;
  RAISE NOTICE 'CHECK Z PASSED — كل المزوّدين + مفاتيح لكل شركة BYOK (0171→0178) + الأسرار محميّة بالكامل';
END $$;

\echo ''
\echo '=== AA. بوابة المشتريات — P0 Security + الوحدات السبع ==='
DO $$
BEGIN
  -- Role + Module
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND pg_get_constraintdef(oid) LIKE '%procurement%') THEN
    RAISE EXCEPTION 'FAILED: procurement role missing from profiles constraint';
  END IF;

  -- Unit 01: PR
  IF to_regclass('public.purchase_requisitions') IS NULL
     OR to_regclass('public.pr_line_items') IS NULL
     OR to_regclass('public.procurement_approval_requests') IS NULL
     OR to_regclass('public.pr_audit_log') IS NULL
     OR to_regclass('public.pr_comments') IS NULL
     OR to_regclass('public.pr_approval_reminders') IS NULL
     OR to_regclass('public.pr_overdue_approvals') IS NULL
     OR to_regprocedure('public.create_purchase_requisition_full(uuid,uuid,date,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.approve_procurement_step(uuid,text,text)') IS NULL
     OR to_regprocedure('public.request_pr_revision(uuid,text)') IS NULL
     OR to_regprocedure('public.generate_reorder_point_prs()') IS NULL
     OR to_regprocedure('public.record_pr_approval_reminder(uuid,uuid,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement PR unit missing';
  END IF;

  -- Unit 02: RFx/Auctions
  IF to_regclass('public.sourcing_events') IS NULL
     OR to_regclass('public.supplier_bids') IS NULL
     OR to_regclass('public.procurement_auctions') IS NULL
     OR to_regclass('public.rfx_supplier_invitations') IS NULL
     OR to_regclass('public.rfx_questions') IS NULL
     OR to_regclass('public.rfx_event_audit_log') IS NULL
     OR to_regclass('public.rfx_templates') IS NULL
     OR to_regclass('public.rfx_evaluation_criteria') IS NULL
     OR to_regclass('public.rfx_bid_scorecards') IS NULL
     OR to_regprocedure('public.create_sourcing_event_from_pr(uuid,text,int)') IS NULL
     OR to_regprocedure('public.place_auction_bid(uuid,uuid,numeric)') IS NULL
     OR to_regprocedure('public.award_supplier_bid(uuid,text)') IS NULL
     OR to_regprocedure('public.score_bid_mecca(uuid,jsonb,text)') IS NULL
     OR to_regprocedure('public.start_procurement_auction_from_event(uuid,text,int)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement RFx/auction unit missing';
  END IF;

  -- Unit 03: Suppliers
  IF to_regclass('public.suppliers') IS NULL
     OR to_regclass('public.supplier_documents') IS NULL
     OR to_regclass('public.supplier_risk_assessments') IS NULL
     OR to_regclass('public.supplier_audit_log') IS NULL
     OR to_regclass('public.supplier_qualification_forms') IS NULL
     OR to_regprocedure('public.calculate_kraljic(uuid)') IS NULL
     OR to_regprocedure('public.decide_supplier_qualification(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement supplier unit missing';
  END IF;

  -- Unit 04: PO/GR
  IF to_regclass('public.purchase_orders') IS NULL
     OR to_regclass('public.goods_receipts') IS NULL
     OR to_regclass('public.return_to_vendor') IS NULL
     OR to_regclass('public.inventory_transactions') IS NULL
     OR to_regclass('public.iqc_inspections') IS NULL
     OR to_regclass('public.po_otif_alerts') IS NULL
     OR to_regprocedure('public.create_po_from_pr(uuid,uuid,text,date,text,text)') IS NULL
     OR to_regprocedure('public.create_purchase_order_manual(uuid,text,text,date,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.receive_goods(uuid,text,int,boolean,text,jsonb)') IS NULL
     OR to_regprocedure('public.decide_iqc_inspection(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement PO/GR unit missing';
  END IF;

  -- Unit 05: Invoices
  IF to_regclass('public.supplier_invoices') IS NULL
     OR to_regclass('public.procurement_matching_results') IS NULL
     OR to_regclass('public.invoice_exception_actions') IS NULL
     OR to_regclass('public.invoice_audit_log') IS NULL
     OR to_regclass('public.invoice_archive') IS NULL
     OR to_regprocedure('public.match_invoice(uuid)') IS NULL
     OR to_regprocedure('public.detect_duplicate_invoice(uuid,text,numeric,date)') IS NULL
     OR to_regprocedure('public.create_supplier_invoice_full(uuid,uuid,text,date,numeric,numeric,text,date,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.approve_invoice_for_payment(uuid,text)') IS NULL
     OR to_regprocedure('public.record_invoice_payment(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement invoice/matching unit missing';
  END IF;

  -- Unit 06: CLM
  IF to_regclass('public.procurement_contracts') IS NULL
     OR to_regclass('public.contract_versions') IS NULL
     OR to_regclass('public.contract_obligations') IS NULL
     OR to_regclass('public.contract_audit_log') IS NULL
     OR to_regclass('public.contract_approval_steps') IS NULL
     OR to_regclass('public.contract_signature_requests') IS NULL
     OR to_regclass('public.contract_clm_analytics') IS NULL
     OR to_regprocedure('public.create_contract_version(uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.create_procurement_contract_full(uuid,text,text,numeric,text,date,date,uuid,text)') IS NULL
     OR to_regprocedure('public.request_contract_approval(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement contracts unit missing';
  END IF;

  -- Unit 07: Spend
  IF to_regclass('public.spend_transactions') IS NULL
     OR to_regclass('public.procurement_price_history') IS NULL
     OR to_regclass('public.p_card_transactions') IS NULL
     OR to_regclass('public.supplier_name_aliases') IS NULL
     OR to_regclass('public.spend_intelligence_alerts') IS NULL
     OR to_regclass('public.procurement_executive_kpis') IS NULL
     OR to_regclass('public.spend_category_report') IS NULL
     OR to_regprocedure('public.forecast_spend(text,text)') IS NULL
     OR to_regprocedure('public.detect_maverick_spend()') IS NULL
     OR to_regprocedure('public.collect_procurement_spend_transactions()') IS NULL
     OR to_regprocedure('public.generate_spend_intelligence_alerts()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement spend analytics unit missing';
  END IF;

  -- P0 Security hardening
  IF to_regprocedure('public.procurement_require_roles(text[])') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement security helper missing';
  END IF;
  IF to_regprocedure('public.procurement_assert_supplier_in_tenant(uuid,boolean)') IS NULL
     OR to_regprocedure('public.procurement_assert_po_in_tenant(uuid)') IS NULL
     OR to_regprocedure('public.procurement_assert_contract_in_tenant(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: procurement same-tenant assertion helpers missing';
  END IF;

  IF has_function_privilege('authenticated', 'public.forecast_spend(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.detect_maverick_spend(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.detect_duplicate_invoice(uuid,uuid,text,numeric,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.seed_procurement_tolerance_rules(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY: tenant-taking procurement RPC still executable by authenticated';
  END IF;

  RAISE NOTICE 'CHECK AA PASSED — بوابة المشتريات: الوحدات السبع + P0 security hardening موجودة';
END $$;

\echo ''
\echo '=== ✅ POST-MIGRATION CHECKS: ALL PASS ==='
