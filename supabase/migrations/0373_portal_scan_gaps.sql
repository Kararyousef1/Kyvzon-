-- ════════════════════════════════════════════════════════════════════════
--  0373 — سدُّ ثغرات المسح الثاني للبوابتين
--  بطلب المستخدم: «اريد ان تقوم بعمليه مسح اخرى لبوابتين وتتحقق اكثر»
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  المنهج: ماسحٌ آليٌّ (tools/dev/scan_portals.py) + مسبارٌ تشغيليّ  │
--  │  (_probe_0373.sql) على قاعدةٍ نظيفةٍ بـ301 مايجريشن.              │
--  │  الفحصُ اليدويّ لا يقيس — والماسحُ يقيس ويتكرّر في كلّ جولة.       │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ═══════════════════════════════════════════════════════════════════
--  ① ★★★★ **ثغرةُ اشتراك: جدولان في وحدة HR بلا بوّابةٍ هجينة**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_6 — فحصٌ آليٌّ لأربعةَ عشرَ جدولاً في الوحدة:
--        الجداول بلا `hybrid_gate_*` RESTRICTIVE:
--          · permissions_request
--          · wellness_entries
--
--     PROBE — إثباتٌ تشغيليّ. مستأجرٌ ألغى اشتراك HR
--     (`module_enforcement_mode='enforce'` · `enabled_modules={finance}`)،
--     بدور `hr` حقيقيّ عبر RLS:
--
--        الوحدة hr مسموحة؟              false
--        leaves (لها بوّابة)            ⇒ 0 صفّ   ← محجوب صحيحاً
--        permissions_request (بلا بوّابة) ⇒ 1 صفّ   ← ★ مكشوف
--        wellness_entries (بلا بوّابة)    ⇒ 1 صفّ   ← ★ مكشوف
--
--     ⇒ **منشأةٌ لا تدفع اشتراك الموارد البشرية تقرأ زمنيّات موظفيها
--       وبياناتِ صحّتهم النفسية.** والصحةُ النفسية أشدُّ حساسيةً من
--       الإجازات التي حُجبت.
--
--     ★ ملاحظة: الوضع الافتراضيّ `module_enforcement_mode='off'` يجعل
--       `hybrid_allows_module()` تُعيد TRUE دائماً، فالأثرُ لا يظهر
--       إلّا عند تفعيل الإنفاذ — وهو ما يجعل الثغرة **صامتةً حتى
--       اللحظة التي تُفعَّل فيها**، أي أسوأ وقت.
--
--  ═══════════════════════════════════════════════════════════════════
--  ② ★★★ **خمسُ دوالٍ في وحدة HR يملك `anon` حقَّ تنفيذها**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_7:
--        hr_analytics_departments      (SECURITY DEFINER)
--        hr_analytics_incident_trend   (SECURITY DEFINER)
--        hr_analytics_overview         (SECURITY DEFINER)
--        hr_analytics_wellness_trend   (SECURITY DEFINER)
--        leave_balance_bucket
--
--     ★★★ سببُه `pg_default_acl` من 0268: كلُّ دالّةٍ جديدةٍ تُولد
--       ومعها EXECUTE لـ`authenticated`… و`anon` هنا وَرِثته لأنّ
--       الدوال الأربع كُتبت قبل ترسيخ قاعدة `REVOKE … FROM anon`.
--
--     ★ إنصافاً — اختبارٌ تشغيليّ بدور `anon` حقيقيّ:
--          بلا هويّة        ⇒ «لا يمكن تحديد المستأجر الحالي»
--          بهويّة موظفٍ عاديّ ⇒ «لا تملك صلاحية عرض تحليلات الموارد»
--       الحرّاسُ الداخليون يصدّون فعلاً — **لا تسريبَ اليوم**.
--       لكنّ المنحَ يخالف قاعدة المشروع: `REVOKE … FROM anon` هو
--       الحارسُ الحقيقيّ، والحارسُ الداخليّ طبقةٌ ثانيةٌ لا أولى.
--       ولو أُضيف يوماً فرعٌ يسبق الحارس لانفتح الباب.
--
--     و`leave_balance_bucket('سنوية')` نجحت لـ`anon` ⇒ `annual`.
--     دالّةٌ نقيّةٌ لا تلمس بيانات، لكنّها تكشف مفرداتِ النظام.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  ما فُحص ووُجد سليماً — يُوثَّق كي لا يُعاد فحصُه                  │
--  │    · صفرُ جدولٍ من 27 في وحدة HR بلا RLS                          │
--  │    · صفرُ جدولٍ من 22 يملك `anon` قراءته                          │
--  │    · إصلاحات 0372 حيّةٌ على قاعدةٍ كاملة: حارسُ النطاق موجود ·     │
--  │      المحفّزان يعملان · رصيدُ الموظف 21.000 لا صفر                │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  أعطالُ الواجهة (تُصلَح بلا SQL — انظر التوثيق):                  │
--  │    ③ زرُّ «تحميل PDF» في SOPsPage بلا `onClick` (صفر دالّة تدعمه) │
--  │    ④ employee/AttendancePage — ملفٌّ ميّتٌ غيرُ مُوجَّه، يلمس       │
--  │       Supabase في خمسة مواضع ويُبقي «خطّ الأساس» مرتفعاً          │
--  │    ⑤ 35 `console.error` · 14 `any` · 13 `catch` صامت              │
--  └──────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
--  ① البوّابة الهجينة على الجدولين المكشوفين
--     ★★★ RESTRICTIVE إلزاماً — درسٌ متكرّر منذ 0268
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS hybrid_gate_permissions_request ON public.permissions_request;
CREATE POLICY hybrid_gate_permissions_request ON public.permissions_request
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

DROP POLICY IF EXISTS hybrid_gate_wellness_entries ON public.wellness_entries;
CREATE POLICY hybrid_gate_wellness_entries ON public.wellness_entries
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

-- ★ و`permissions` (المُنفَّذة) نظيرةُ `permissions_request`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class
              WHERE relname='permissions' AND relnamespace='public'::regnamespace
                AND relkind='r' AND relrowsecurity) THEN
    DROP POLICY IF EXISTS hybrid_gate_permissions ON public.permissions;
    CREATE POLICY hybrid_gate_permissions ON public.permissions
      AS RESTRICTIVE FOR ALL
      USING (public.hybrid_allows_module('hr'))
      WITH CHECK (public.hybrid_allows_module('hr'));
  END IF;
END $$;

-- ★ و`leave_balance` — الرصيدُ بيانٌ في الوحدة نفسها
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class
              WHERE relname='leave_balance' AND relnamespace='public'::regnamespace
                AND relkind='r' AND relrowsecurity) THEN
    DROP POLICY IF EXISTS hybrid_gate_leave_balance ON public.leave_balance;
    CREATE POLICY hybrid_gate_leave_balance ON public.leave_balance
      AS RESTRICTIVE FOR ALL
      USING (public.hybrid_allows_module('hr'))
      WITH CHECK (public.hybrid_allows_module('hr'));
  END IF;
END $$;

-- ★★★ وسلسلةُ الاعتماد نفسُها — كشفتها دالّةُ التدقيق التي كتبتُها
--   في هذا المايجريشن. طلباتُ الاعتماد وخطواتُها بيانُ وحدةِ الموارد
--   البشرية، ومستأجرٌ ألغى الاشتراك كان يقرؤها.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_approval_requests','hr_approval_steps'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class
                WHERE relname = t AND relnamespace = 'public'::regnamespace
                  AND relkind = 'r' AND relrowsecurity) THEN
      EXECUTE format('DROP POLICY IF EXISTS hybrid_gate_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY hybrid_gate_%I ON public.%I AS RESTRICTIVE FOR ALL '
        'USING (public.hybrid_allows_module(''hr'')) '
        'WITH CHECK (public.hybrid_allows_module(''hr''))', t, t);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ② حرمانُ `anon` من دوال الوحدة الخمس
--     ★★★ `REVOKE … FROM anon` هو الحارس الحقيقيّ (درس 0268)
-- ═══════════════════════════════════════════════════════════════════

DO $revoke$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND (p.proname LIKE 'hr\_%'      OR p.proname LIKE 'leave\_%'
            OR p.proname LIKE 'capa\_%' OR p.proname LIKE 'my\_%'
            OR p.proname LIKE '%permission_request%'
            OR p.proname LIKE 'sop\_%'  OR p.proname LIKE 'wellness\_%')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- ★★★★ `FROM anon` وحده لا يكفي: ACL يُظهر `=X/postgres` أي أنّ
    --   **PUBLIC** يملك التنفيذ و`anon` عضوٌ فيه، فالحرمانُ يُزيل
    --   منحاً صريحاً لا يملكه أصلاً. نُزيل PUBLIC ثمّ نمنح authenticated.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    n := n + 1;
    RAISE NOTICE 'حُرم anon من %', r.proname;
  END LOOP;
  RAISE NOTICE '★ حُرم anon من % دالّة في وحدة الموارد البشرية', n;
END $revoke$;

-- ═══════════════════════════════════════════════════════════════════
--  ③ ★★★ حارسٌ دائم: دالّةُ تدقيقٍ تكشف أيّ ثغرةٍ مستقبلية
--     العطلُ الذي يُقاس لا يعود صامتاً.
-- ═══════════════════════════════════════════════════════════════════

-- ★ قائمةُ جداول الوحدة — مصدرٌ واحدٌ للحقيقة بدل تكرارها
DROP FUNCTION IF EXISTS public.hr_module_tables();
CREATE FUNCTION public.hr_module_tables()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'leaves','leave_balance','leave_policies',
    'permissions_request','permissions',
    'attendance_logs','attendance_summary',
    'hr_messages','hr_cases','hr_case_comments',
    'incidents','corrective_actions','wellness_entries',
    'performance_reviews','employee_documents','employee_contracts',
    'disciplinary_actions','bonuses','employee_loans','expense_requests',
    'job_applications','critical_positions','succession_candidates',
    'shift_assignments','hr_report_runs',
    'hr_approval_requests','hr_approval_steps'
  ]::TEXT[];
$$;

REVOKE ALL ON FUNCTION public.hr_module_tables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_module_tables() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_module_tables() TO authenticated;

DROP FUNCTION IF EXISTS public.hr_module_gate_audit();
CREATE FUNCTION public.hr_module_gate_audit()
RETURNS TABLE (
  object_kind TEXT,
  object_name TEXT,
  issue       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER               -- ★ يقرأ الكتالوج لا بيانات المستأجرين
SET search_path TO 'public'
AS $$
  -- جداولُ الوحدة بلا RLS
  SELECT 'table'::TEXT, c.relname::TEXT, 'بلا RLS'::TEXT
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND c.relname = ANY (public.hr_module_tables())
     AND NOT c.relrowsecurity

  UNION ALL
  -- جداولُ الوحدة بلا بوّابةٍ هجينة RESTRICTIVE
  SELECT 'table'::TEXT, c.relname::TEXT, 'بلا بوّابة هجينة RESTRICTIVE'::TEXT
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND c.relname = ANY (public.hr_module_tables())
     AND NOT EXISTS (
       SELECT 1 FROM pg_policy p
        WHERE p.polrelid = c.oid AND NOT p.polpermissive
          AND p.polname LIKE 'hybrid\_gate%')

  UNION ALL
  -- جداولُ الوحدة التي يقرؤها anon
  SELECT 'table'::TEXT, c.relname::TEXT, 'anon يملك SELECT'::TEXT
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND c.relname = ANY (public.hr_module_tables())
     AND has_table_privilege('anon', c.oid, 'SELECT')

  UNION ALL
  -- دوالُّ الوحدة التي ينفّذها anon
  SELECT 'function'::TEXT, p.proname::TEXT, 'anon يملك EXECUTE'::TEXT
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND (p.proname LIKE 'hr\_%'      OR p.proname LIKE 'leave\_%'
          OR p.proname LIKE 'capa\_%' OR p.proname LIKE 'my\_%'
          OR p.proname LIKE '%permission_request%'
          OR p.proname LIKE 'sop\_%'  OR p.proname LIKE 'wellness\_%')
     AND has_function_privilege('anon', p.oid, 'EXECUTE')

  -- ★★★ التذييل بالاسم: بلا ترتيبٍ حتميٍّ تصير المقارنةُ هشّة
  ORDER BY 1, 2, 3;
$$;


REVOKE ALL ON FUNCTION public.hr_module_gate_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_module_gate_audit() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_module_gate_audit() TO authenticated;

COMMENT ON FUNCTION public.hr_module_gate_audit() IS
  'تدقيقُ جدار وحدة الموارد البشرية: جداولٌ بلا RLS أو بلا بوّابةٍ هجينة، '
  'وأشياءُ يصلها anon. كُتبت بعد مسحٍ كشف permissions_request و'
  'wellness_entries مكشوفَين لمستأجرٍ ألغى الاشتراك — 0373';
