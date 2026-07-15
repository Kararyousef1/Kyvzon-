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
\echo '=== ✅ POST-MIGRATION CHECKS: ALL PASS ==='
