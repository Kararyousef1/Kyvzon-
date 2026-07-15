-- ============================================================================
--  RLS Isolation Test — يُثبت أن مستخدم شركة A لا يرى بيانات شركة B
--
--  الهدف: التحقق العملي من عزل tenant عبر:
--    1. إنشاء شركتين (Tenant_A, Tenant_B) + مستخدم لكل شركة
--    2. إدخال بيانات في كل شركة (كخدمة/service_role)
--    3. المحاكاة كل مستخدم عبر SET LOCAL request.jwt.claim.sub
--    4. التحقق أن كل مستخدم يرى بياناته فقط
--
--  الاستخدام:
--    psql -v ON_ERROR_STOP=1 -f rls_isolation_test.sql
--
--  السكربت مبني على أن run_clean_db_test.sh قد أنشأ قاعدة kyvzon_clean_test
--  ونفَّذ كل migrations + shim.
-- ============================================================================

\set ON_ERROR_STOP on

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' RLS ISOLATION TEST — Kyvzon Multi-tenant'
\echo '════════════════════════════════════════════════════════════'

-- ═══════════════════════════════════════════════════════════════════════════
-- SETUP: إنشاء البيانات كـ superuser (يتجاوز RLS)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Clean slate for repeated runs — order matters (children before parents)
DELETE FROM public.leaves WHERE reason LIKE 'RLS-TEST-%';
DELETE FROM public.announcements WHERE title LIKE 'RLS-TEST-%';
DELETE FROM public.employees WHERE employee_code LIKE 'RLS-%';
DELETE FROM public.profiles WHERE full_name LIKE 'RLS-TEST-%';
DELETE FROM auth.users WHERE email LIKE 'rls-test-%@example.com';
DELETE FROM public.tenants WHERE slug LIKE 'rls-test-%';

-- ─── إنشاء شركتين ─────────────────────────────────────────────────────────
INSERT INTO public.tenants (id, slug, name_ar, name_en, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rls-test-a', 'شركة أ', 'Company A', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'rls-test-b', 'شركة ب', 'Company B', 'active');

-- ─── إنشاء مستخدم auth لكل شركة ───────────────────────────────────────────
INSERT INTO auth.users (id, email)
VALUES
  ('aaaa1111-1111-1111-1111-111111111111', 'rls-test-user-a@example.com'),
  ('bbbb2222-2222-2222-2222-222222222222', 'rls-test-user-b@example.com'),
  ('cccc3333-3333-3333-3333-333333333333', 'rls-test-admin-a@example.com');

-- ─── إنشاء profile لكل مستخدم ─────────────────────────────────────────────
INSERT INTO public.profiles (id, tenant_id, email, full_name, role)
VALUES
  ('aaaa1111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'rls-test-user-a@example.com', 'RLS-TEST-UserA', 'employee'),

  ('bbbb2222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   'rls-test-user-b@example.com', 'RLS-TEST-UserB', 'employee'),

  ('cccc3333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'rls-test-admin-a@example.com', 'RLS-TEST-AdminA', 'admin');

-- ─── إنشاء employees مرتبطين بـ profiles ─────────────────────────────────
-- (leaves.employee_id يشير إلى employees.id لا profiles.id)
INSERT INTO public.employees (id, tenant_id, user_id, employee_code, first_name, last_name)
VALUES
  ('e1111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'aaaa1111-1111-1111-1111-111111111111',
   'RLS-A-001', 'RLS-TEST-EmpA', 'UserA'),

  ('e2222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   'bbbb2222-2222-2222-2222-222222222222',
   'RLS-B-001', 'RLS-TEST-EmpB', 'UserB');

-- ─── إنشاء announcements في كل شركة ───────────────────────────────────────
INSERT INTO public.announcements (tenant_id, title, content, author_id, author_name)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   'RLS-TEST-Announcement-A1', 'محتوى شركة A',
   'cccc3333-3333-3333-3333-333333333333', 'RLS-TEST-AdminA'),

  ('11111111-1111-1111-1111-111111111111',
   'RLS-TEST-Announcement-A2', 'محتوى ثاني لشركة A',
   'cccc3333-3333-3333-3333-333333333333', 'RLS-TEST-AdminA'),

  ('22222222-2222-2222-2222-222222222222',
   'RLS-TEST-Announcement-B1', 'محتوى شركة B',
   NULL, 'system');

-- ─── إنشاء leaves في كل شركة ──────────────────────────────────────────────
INSERT INTO public.leaves (
  tenant_id, employee_id, leave_type, date_from, date_to,
  working_days_count, reason, status
)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   'e1111111-1111-1111-1111-111111111111',
   'سنوية', '2026-08-01', '2026-08-05', 5, 'RLS-TEST-LeaveA', 'انتظار'),

  ('22222222-2222-2222-2222-222222222222',
   'e2222222-2222-2222-2222-222222222222',
   'سنوية', '2026-08-10', '2026-08-15', 6, 'RLS-TEST-LeaveB', 'انتظار');

COMMIT;

\echo ''
\echo '✓ SETUP: أُنشئت 2 tenants + 3 users + 2 employees + 3 announcements + 2 leaves'
\echo ''


-- ═══════════════════════════════════════════════════════════════════════════
-- TEST HARNESS
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: يُشغِّل استعلاماً كمستخدم معين ويُقارن العدد المتوقع
CREATE OR REPLACE FUNCTION _rls_test(
  test_name TEXT,
  user_id UUID,
  role TEXT,
  query TEXT,
  expected_count INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  actual_count INTEGER;
BEGIN
  -- ضبط سياق JWT للاختبار
  PERFORM set_config('request.jwt.claim.sub', user_id::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', role, true);

  -- التبديل إلى دور authenticated (وليس superuser الذي يتجاوز RLS)
  SET LOCAL ROLE authenticated;

  EXECUTE 'SELECT COUNT(*) FROM (' || query || ') AS sub' INTO actual_count;

  -- العودة إلى superuser للسجل
  RESET ROLE;

  IF actual_count = expected_count THEN
    RAISE NOTICE '✓ PASS: % — got % rows (expected %)', test_name, actual_count, expected_count;
  ELSE
    RAISE EXCEPTION '✗ FAIL: % — got % rows, expected %', test_name, actual_count, expected_count;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- TESTS
-- ═══════════════════════════════════════════════════════════════════════════

\echo '════════════════════════════════════════════════════════════'
\echo ' Test 1: UserA يرى فقط announcements شركته (2 لا 3)'
\echo '════════════════════════════════════════════════════════════'
SELECT _rls_test(
  'UserA sees only Company A announcements',
  'aaaa1111-1111-1111-1111-111111111111'::UUID,
  'authenticated',
  'SELECT id FROM public.announcements WHERE title LIKE ''RLS-TEST-%''',
  2
);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 2: UserB يرى فقط announcements شركته (1 لا 3)'
\echo '════════════════════════════════════════════════════════════'
SELECT _rls_test(
  'UserB sees only Company B announcements',
  'bbbb2222-2222-2222-2222-222222222222'::UUID,
  'authenticated',
  'SELECT id FROM public.announcements WHERE title LIKE ''RLS-TEST-%''',
  1
);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 3: UserA يرى فقط leaves شركته (1 لا 2)'
\echo '════════════════════════════════════════════════════════════'
SELECT _rls_test(
  'UserA sees only Company A leaves',
  'aaaa1111-1111-1111-1111-111111111111'::UUID,
  'authenticated',
  'SELECT id FROM public.leaves WHERE reason LIKE ''RLS-TEST-%''',
  1
);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 4: UserB يرى فقط leaves شركته (1 لا 2)'
\echo '════════════════════════════════════════════════════════════'
SELECT _rls_test(
  'UserB sees only Company B leaves',
  'bbbb2222-2222-2222-2222-222222222222'::UUID,
  'authenticated',
  'SELECT id FROM public.leaves WHERE reason LIKE ''RLS-TEST-%''',
  1
);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 5: UserA يرى فقط profiles شركته (2: نفسه + admin شركته)'
\echo '════════════════════════════════════════════════════════════'
SELECT _rls_test(
  'UserA sees only Company A profiles',
  'aaaa1111-1111-1111-1111-111111111111'::UUID,
  'authenticated',
  'SELECT id FROM public.profiles WHERE full_name LIKE ''RLS-TEST-%''',
  2
);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 6: مستخدم غير مسجَّل (anon) لا يرى أي بيانات'
\echo '════════════════════════════════════════════════════════════'
DO $$
DECLARE
  cnt INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  SET LOCAL ROLE anon;

  SELECT COUNT(*) INTO cnt
  FROM public.announcements WHERE title LIKE 'RLS-TEST-%';

  RESET ROLE;

  IF cnt = 0 THEN
    RAISE NOTICE '✓ PASS: anon sees 0 announcements';
  ELSE
    RAISE EXCEPTION '✗ FAIL: anon should see 0 announcements, saw %', cnt;
  END IF;
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 7: UserA لا يستطيع كتابة announcement في شركة B'
\echo '════════════════════════════════════════════════════════════'
DO $$
DECLARE
  err_msg TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    'aaaa1111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.announcements (
      tenant_id, title, content, author_id
    ) VALUES (
      '22222222-2222-2222-2222-222222222222',  -- Tenant B!
      'RLS-TEST-Attack-CrossTenant',
      'محاولة اختراق',
      'aaaa1111-1111-1111-1111-111111111111'
    );
    RESET ROLE;
    RAISE EXCEPTION '✗ FAIL: UserA succeeded inserting into Company B (SECURITY BREACH)';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RESET ROLE;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    RAISE NOTICE '✓ PASS: UserA blocked from inserting into Company B (%)', err_msg;
  END;
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 8: UserA لا يستطيع تعديل profile UserB'
\echo '════════════════════════════════════════════════════════════'
DO $$
DECLARE
  updated_rows INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    'aaaa1111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  UPDATE public.profiles
  SET full_name = 'HACKED'
  WHERE id = 'bbbb2222-2222-2222-2222-222222222222';

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RESET ROLE;

  IF updated_rows = 0 THEN
    RAISE NOTICE '✓ PASS: UserA update on UserB profile = 0 rows affected';
  ELSE
    RAISE EXCEPTION '✗ FAIL: UserA updated % rows in Company B (SECURITY BREACH)', updated_rows;
  END IF;
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 9: UserA يرى tenants (شركته فقط)'
\echo '════════════════════════════════════════════════════════════'
SELECT _rls_test(
  'UserA sees only Company A tenant',
  'aaaa1111-1111-1111-1111-111111111111'::UUID,
  'authenticated',
  'SELECT id FROM public.tenants WHERE slug LIKE ''rls-test-%''',
  1
);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' Test 10: AdminA (admin) يرى profiles شركته فقط، لا شركة B'
\echo '════════════════════════════════════════════════════════════'
SELECT _rls_test(
  'AdminA sees only Company A profiles (not B)',
  'cccc3333-3333-3333-3333-333333333333'::UUID,
  'authenticated',
  'SELECT id FROM public.profiles WHERE full_name LIKE ''RLS-TEST-%''',
  2
);

-- ─── تنظيف الدالة المساعدة ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS _rls_test(TEXT, UUID, TEXT, TEXT, INTEGER);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo ' 🎉 ALL 10 RLS ISOLATION TESTS PASSED'
\echo '════════════════════════════════════════════════════════════'
