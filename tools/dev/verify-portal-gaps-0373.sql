-- ============================================================================
-- verify-portal-gaps-0373.sql — التحقق السلوكيّ من 0373
--
--   psql -h /home/user/.pgtest/sock -p 5521 -U postgres -f tools/dev/verify-portal-gaps-0373.sql
--
-- ★ يعمل بدور postgres (BYPASSRLS). حرّاس الأدوار في -rls.sh
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on
\timing off

BEGIN;

\set TA '''a3740000-0000-0000-0000-0000000000aa'''
\set TN '''c3740000-0000-0000-0000-0000000000cc'''
\set HRA '''13740001-0000-0000-0000-0000000000a1'''
\set E1 '''23740002-0000-0000-0000-0000000000a2'''
\set HRN '''c3740001-0000-0000-0000-0000000000c1'''

CREATE TEMP TABLE _r(n TEXT, pass BOOLEAN, got TEXT, want TEXT);
CREATE OR REPLACE FUNCTION pg_temp.chk(n TEXT, got TEXT, want TEXT) RETURNS VOID
LANGUAGE sql AS $$ INSERT INTO _r VALUES (n, got IS NOT DISTINCT FROM want, got, want) $$;

DO $$
DECLARE v INTEGER;
BEGIN
  SELECT count(*) INTO v FROM public.tenants
   WHERE id IN ('a3740000-0000-0000-0000-0000000000aa',
                'c3740000-0000-0000-0000-0000000000cc');
  IF v > 0 THEN RAISE EXCEPTION 'SETUP_DIRTY: % مستأجر', v; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  البذور: مستأجرٌ مشترِك وآخرُ ألغى اشتراك HR
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 (:TA,'T0373','مستأجر مشترِك','t-0373-a');

-- ★★★ مستأجرٌ ألغى اشتراك HR: enforce + بلا hr في enabled_modules
INSERT INTO public.tenants(id,name,name_ar,slug,module_enforcement_mode,enabled_modules)
VALUES (:TN,'NoHR','منشأةٌ بلا موارد بشرية','t-0373-n','enforce', ARRAY['finance']);

INSERT INTO auth.users(id,email) VALUES
 (:HRA,'hra0373@v.local'), (:E1,'e1-0373@v.local'), (:HRN,'hrn0373@v.local');

INSERT INTO public.profiles(id,tenant_id,full_name,email,role) VALUES
 (:HRA,:TA,'مدير الموارد','hra0373@v.local','hr'),
 (:E1, :TA,'سالم','e1-0373@v.local','employee'),
 (:HRN,:TN,'موارد المنشأة الملغاة','hrn0373@v.local','hr');

-- بياناتٌ في المستأجر الملغى
DO $$
DECLARE v UUID;
BEGIN
  SELECT id INTO v FROM public.employees
   WHERE user_id='c3740001-0000-0000-0000-0000000000c1';
  INSERT INTO public.permissions_request
    (tenant_id,employee_id,permission_type,date,expected_out_time,reason,status)
  VALUES ('c3740000-0000-0000-0000-0000000000cc',v,'عادية',
          CURRENT_DATE+1,'09:00','ظرف','انتظار');
  INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,notes)
  VALUES ('c3740000-0000-0000-0000-0000000000cc',v,CURRENT_DATE,20,'terrible',
          'بيانٌ نفسيٌّ حسّاس');
  INSERT INTO public.leaves
    (tenant_id,employee_id,leave_type,date_from,date_to,working_days_count,status)
  VALUES ('c3740000-0000-0000-0000-0000000000cc',v,'سنوية',
          CURRENT_DATE+3,CURRENT_DATE+4,2,'انتظار');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ① ★★★★ العطل ①: ثغرةُ الاشتراك مسدودة
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('1.0 المستأجر الملغى: الوحدة hr ممنوعة',
  (SELECT set_config('request.jwt.claim.sub',
     'c3740001-0000-0000-0000-0000000000c1', TRUE) IS NOT NULL)::TEXT, 'true');

DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    'c3740001-0000-0000-0000-0000000000c1', TRUE);
END $$;

SELECT pg_temp.chk('1.1 hybrid_allows_module(''hr'') = false',
  (SELECT public.hybrid_allows_module('hr')::TEXT), 'false');

-- ★ البوّابات موجودةٌ الآن على الجداول الستّة
SELECT pg_temp.chk('1.2 ★★★★ بوّابةٌ RESTRICTIVE على permissions_request',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.permissions_request'::regclass
      AND polname='hybrid_gate_permissions_request'), 'false');

SELECT pg_temp.chk('1.3 ★★★★ وعلى wellness_entries',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.wellness_entries'::regclass
      AND polname='hybrid_gate_wellness_entries'), 'false');

SELECT pg_temp.chk('1.4 ★★★ وعلى leave_balance',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.leave_balance'::regclass
      AND polname='hybrid_gate_leave_balance'), 'false');

SELECT pg_temp.chk('1.5 ★★★ وعلى permissions',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.permissions'::regclass
      AND polname='hybrid_gate_permissions'), 'false');

SELECT pg_temp.chk('1.6 ★★★ وعلى hr_approval_requests',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.hr_approval_requests'::regclass
      AND polname='hybrid_gate_hr_approval_requests'), 'false');

SELECT pg_temp.chk('1.7 ★★★ وعلى hr_approval_steps',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.hr_approval_steps'::regclass
      AND polname='hybrid_gate_hr_approval_steps'), 'false');

-- ★★★ وكلُّها على وحدة hr لا غيرها
SELECT pg_temp.chk('1.8 ★★★ كلُّ البوّابات الجديدة على وحدة hr',
  (SELECT count(*)::TEXT FROM pg_policy
    WHERE polname IN ('hybrid_gate_permissions_request',
                      'hybrid_gate_wellness_entries',
                      'hybrid_gate_leave_balance',
                      'hybrid_gate_permissions',
                      'hybrid_gate_hr_approval_requests',
                      'hybrid_gate_hr_approval_steps')
      AND pg_get_expr(polqual, polrelid) LIKE '%''hr''%'), '6');

-- ══════════════════════════════════════════════════════════════════════
--  ② ★★★ العطل ②: anon محرومٌ من دوال الوحدة
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('2.1 ★★★★ anon محرومٌ من hr_analytics_overview',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_analytics_overview(DATE,DATE)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('2.2 ★★★ ومن hr_analytics_departments',
  (SELECT count(*)::TEXT FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname='hr_analytics_departments'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')), '0');

SELECT pg_temp.chk('2.3 ★★★ ومن leave_balance_bucket',
  (SELECT count(*)::TEXT FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname='leave_balance_bucket'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')), '0');

-- ★★★★ الجوهر: `FROM anon` وحده لا يكفي — PUBLIC كان يملك التنفيذ
SELECT pg_temp.chk('2.4 ★★★★ وPUBLIC محرومٌ كذلك (لا وراثةَ عبره)',
  -- ★ منحُ PUBLIC يظهر بلا اسمِ مستفيدٍ قبل `=` (مثل `=X/postgres`).
  --   أوّلُ صياغةٍ كتبتُها استعملت `LIKE '%=X/%'` فطابقت
  --   `postgres=X/postgres` أيضاً وأعطت أربعةً كاذبة.
  (SELECT count(*)::TEXT FROM pg_proc p,
          LATERAL unnest(COALESCE(p.proacl, '{}'::aclitem[])) AS a
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname LIKE 'hr_analytics%'
      AND a::TEXT LIKE '=%'), '0');

-- ★ وauthenticated احتفظ بحقّه — الحرمانُ لم يكسر الاستعمال المشروع
SELECT pg_temp.chk('2.5 ★★★ وauthenticated ما زال ينفّذها',
  (SELECT count(*)::TEXT FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname LIKE 'hr_analytics%'
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')), '0');

-- ══════════════════════════════════════════════════════════════════════
--  ③ ★★★★ دالّةُ التدقيق — الحارس الدائم
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('3.1 ★★★★ التدقيق يُعيد صفر ثغرة',
  (SELECT count(*)::TEXT FROM public.hr_module_gate_audit()), '0');

SELECT pg_temp.chk('3.2 وقائمةُ جداول الوحدة غيرُ فارغة',
  (SELECT CASE WHEN array_length(public.hr_module_tables(),1) >= 25
               THEN 'كافية' ELSE 'ناقصة' END), 'كافية');

-- ★★★ والتدقيق يكشف ثغرةً مُصطنعة — وإلّا فهو عدّادُ أصفارٍ لا حارس
DROP POLICY IF EXISTS hybrid_gate_wellness_entries ON public.wellness_entries;
SELECT pg_temp.chk('3.3 ★★★★ التدقيق يكشف بوّابةً مفقودة',
  (SELECT count(*)::TEXT FROM public.hr_module_gate_audit()
    WHERE object_name='wellness_entries'
      AND issue='بلا بوّابة هجينة RESTRICTIVE'), '1');

-- ★ ويكشف منحاً لـanon
GRANT EXECUTE ON FUNCTION public.leave_balance_bucket(TEXT) TO anon;
SELECT pg_temp.chk('3.4 ★★★★ ويكشف منحاً لـanon',
  (SELECT count(*)::TEXT FROM public.hr_module_gate_audit()
    WHERE object_name='leave_balance_bucket'
      AND issue='anon يملك EXECUTE'), '1');

-- ★ استرجاعٌ داخل المعاملة
REVOKE ALL ON FUNCTION public.leave_balance_bucket(TEXT) FROM anon;
CREATE POLICY hybrid_gate_wellness_entries ON public.wellness_entries
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

SELECT pg_temp.chk('3.5 ★★★ وبعد الاسترجاع يعود إلى صفر',
  (SELECT count(*)::TEXT FROM public.hr_module_gate_audit()), '0');

-- ══════════════════════════════════════════════════════════════════════
--  ④ ما فُحص ووُجد سليماً — يُوثَّق كي لا يُعاد فحصُه
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('4.1 صفرُ جدولٍ في الوحدة بلا RLS',
  (SELECT count(*)::TEXT FROM pg_class c
    WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
      AND c.relname = ANY (public.hr_module_tables())
      AND NOT c.relrowsecurity), '0');

SELECT pg_temp.chk('4.2 صفرُ جدولٍ في الوحدة يقرؤه anon',
  (SELECT count(*)::TEXT FROM pg_class c
    WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
      AND c.relname = ANY (public.hr_module_tables())
      AND has_table_privilege('anon', c.oid, 'SELECT')), '0');

-- ★ إصلاحات 0372 ما زالت حيّة
SELECT pg_temp.chk('4.3 حارسُ النطاق (0372) حيّ',
  (SELECT count(*)::TEXT FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='can_use_request_scope'), '1');

SELECT pg_temp.chk('4.4 ومحفّزُ الرصيد (0372) حيّ',
  (SELECT count(*)::TEXT FROM pg_trigger
    WHERE tgrelid='public.employees'::regclass
      AND tgname='trg_seed_leave_balance'), '1');

SELECT pg_temp.chk('4.5 ورصيدُ سالم غيرُ صفر',
  (SELECT CASE WHEN b.annual_total > 0 THEN 'موجب' ELSE 'صفر' END
   FROM public.leave_balance b JOIN public.employees e ON e.id=b.employee_id
   WHERE e.user_id=:E1), 'موجب');

-- ══════════════════════════════════════════════════════════════════════
--  ⑤ الجدار على الجديد
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('5.1 ★★★ anon محرومٌ من hr_module_gate_audit',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_module_gate_audit()','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('5.2 ★★★ ومن hr_module_tables',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_module_tables()','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('5.3 hr_module_gate_audit هي DEFINER (تقرأ الكتالوج)',
  (SELECT prosecdef::TEXT FROM pg_proc
    WHERE oid='public.hr_module_gate_audit()'::regprocedure), 'true');

-- ══════════════════════════════════════════════════════════════════════
--  النتيجة
-- ══════════════════════════════════════════════════════════════════════
\set QUIET off
\echo ''
\echo '════════════════ نتائج verify-portal-gaps-0373 ════════════════'
SELECT n AS "التأكيد",
       CASE WHEN pass THEN '✅' ELSE '❌' END AS "ح",
       CASE WHEN pass THEN '' ELSE 'حصلنا: '||COALESCE(got,'NULL')||' · نتوقّع: '||COALESCE(want,'NULL') END AS "التفصيل"
FROM _r ORDER BY row_number() OVER ();

SELECT count(*) FILTER (WHERE pass) AS "ناجح",
       count(*) FILTER (WHERE NOT pass) AS "فاشل",
       count(*) AS "الإجمالي"
FROM _r;

DO $$
DECLARE v INTEGER;
BEGIN
  SELECT count(*) INTO v FROM _r WHERE NOT pass;
  IF v > 0 THEN RAISE EXCEPTION 'VERIFY_0373_FAILED: % تأكيداً فاشلاً', v; END IF;
  RAISE NOTICE '✅ verify-portal-gaps-0373: كل التأكيدات ناجحة';
END $$;

ROLLBACK;
