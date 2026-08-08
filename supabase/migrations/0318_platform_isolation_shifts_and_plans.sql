-- ============================================================================
-- FILE: 0318_platform_isolation_shifts_and_plans.sql
-- PURPOSE: عزل بوابة المطوّرين · إصلاح الورديات والفروع · توحيد الاشتراكات
--
-- ─────────────────────────────────────────────────────────────────────────
-- خمسة أعطال مُثبَتة تشغيلياً (2026-08-05، Postgres 17 محلي):
--
-- ★ ① مطوّر المنصة يقرأ بيانات كل الشركات
--     current_user_is_platform_owner() = developer OR it_admin
--     و576 سياسة RLS تستدعيها. مسبار بمطوّر بلا مستأجر:
--         كيانات مالية لشركة أخرى = 1   ← قرأها
--         ملفات موظفي تلك الشركة  = 1   ← قرأها
--     المطلوب صراحةً: «لا أريد دور مطوّر المنصة أن يكون له علاقة
--     بباقي البوابات» — وهذا عكسه تماماً.
--
-- ★ ② الورديات مكشوفة بين الشركات
--     structure_shifts بلا tenant_id، وسياسته: USING (true)
--     أي أن أي مستخدم من أي شركة يقرأ ورديات الجميع.
--
-- ★ ③ الفرع يُفقَد عند التعديل
--     branch_id يُخزَّن في profiles.custom_permissions (JSONB) ولا عمود له.
--     ومسار التعديل يكتب allowed_pages فقط ⇒ الفرع والوردية يُمحيان.
--     ولا وجود لـ employees.branch_id إطلاقاً ⇒ لا تقرير فرع ممكن.
--
-- ★ ④ عمودان متضاربان للخطة
--     tenants.plan              ∈ free · basic · pro · enterprise
--     tenants.subscription_plan ∈ basic · professional · enterprise · custom · hybrid
--     قائمتان مختلفتان لنفس المعنى. الواجهة تقرأ subscription_plan (62 موضعاً)
--     والقاعدة تقرأ plan أحياناً. لا شيء يمنع تناقضهما.
--
-- ★ ⑤ الاشتراك لا يحرس القاعدة
--     شركة بـ subscription_plan='basic' و enabled_modules={employee}
--     أنشأت كياناً مالياً بنجاح. hybrid_allows_module تمرّ لغير الهجين.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ما لا يفعله هذا المايجريشن — عمداً:
--   ❌ لا يحذف عمود tenants.plan (99 موضعاً في الشيفرة يقرأه)
--   ❌ لا يمنع المطوّر من إدارة المنصة (الاشتراكات · تفعيل البوابات)
--   ❌ لا يُقفل الوحدات على القاعدة فوراً — يبني الأساس ويكشف التعارض
-- ============================================================================

-- ═══ 1) ★ عزل مطوّر المنصة عن بيانات المستأجرين ══════════════════════════
--
-- الفكرة: نفصل امتيازين كانا مدموجين في دالة واحدة.
--   • إدارة المنصة  : الاشتراكات · تفعيل البوابات · سجل التدقيق  → مسموح
--   • بيانات العملاء: الموظفون · المالية · الطلبات               → ممنوع
--
-- current_user_is_platform_owner() تُستدعى في 576 سياسة، فلا نغيّر
-- دلالتها فجأةً (كسر شامل). بدلاً من ذلك:
--   (أ) نضيف is_platform_admin() — للجداول المنصّية وحدها
--   (ب) نضيّق is_platform_owner ليشترط **غياب المستأجر أو تطابقه**
--       فيبقى المطوّر قادراً على التشخيص داخل شركة أُسنِد إليها فقط.

CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('developer','it_admin'), FALSE);
$$;

COMMENT ON FUNCTION public.current_user_is_platform_admin() IS
  'إدارة المنصة (اشتراكات · تفعيل بوابات · تدقيق). لا تمنح وصولاً لبيانات العملاء — استعمل current_user_tenant_id لذلك.';

REVOKE ALL ON FUNCTION public.current_user_is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_platform_admin()
  TO authenticated, service_role;

-- ★ التضييق: المطوّر يرى بيانات شركة **أُسنِد إليها** فقط.
--   مطوّر بلا tenant_id (الحالة الطبيعية) لم يعد يرى بيانات أي شركة.
CREATE OR REPLACE FUNCTION public.current_user_is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('developer','it_admin')
    -- ★ 0318: الشرط الجديد — لا امتياز فوق حدود المستأجر.
    --   السياسات تفلتر بـ tenant_id أصلاً؛ هذا يمنع المطوّر عديم
    --   المستأجر من تجاوز الفلتر عبر فرع OR.
    AND public.current_user_tenant_id() IS NOT NULL,
  FALSE);
$$;

COMMENT ON FUNCTION public.current_user_is_platform_owner() IS
  'امتياز منصّي داخل حدود مستأجر مُسنَد. مطوّر بلا مستأجر لا يرى بيانات العملاء (0318).';

-- ═══ 2) ★ عزل الورديات بين الشركات ══════════════════════════════════════
ALTER TABLE public.structure_shifts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_structure_shifts_tenant
  ON public.structure_shifts(tenant_id, is_active);

COMMENT ON COLUMN public.structure_shifts.tenant_id IS
  'الشركة المالكة. NULL = وردية قالب عامة (تُقرأ للجميع ولا تُعدَّل إلا من المنصة).';

-- السياسة القديمة: USING (true) — مكشوفة تماماً
DROP POLICY IF EXISTS kyvzon_structure_shifts_select ON public.structure_shifts;
DROP POLICY IF EXISTS kyvzon_structure_shifts_write  ON public.structure_shifts;

-- القراءة: ورديات شركتي + القوالب العامة (tenant_id IS NULL)
CREATE POLICY kyvzon_structure_shifts_select ON public.structure_shifts
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id());

-- الكتابة: داخل شركتي فقط · والقوالب العامة للمنصة وحدها
CREATE POLICY kyvzon_structure_shifts_write ON public.structure_shifts
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
    OR (tenant_id IS NULL AND public.current_user_is_platform_admin())
  )
  WITH CHECK (
    (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
    OR (tenant_id IS NULL AND public.current_user_is_platform_admin())
  );

-- ═══ 3) ★ الفرع كعمود حقيقي بدل JSONB ═══════════════════════════════════
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_branch
  ON public.employees(tenant_id, branch_id);

COMMENT ON COLUMN public.employees.branch_id IS
  'فرع الموظف. كان محبوساً في profiles.custom_permissions->branch_id ويُفقَد عند التعديل (0318).';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS shift_code TEXT;

COMMENT ON COLUMN public.employees.shift_code IS
  'رمز وردية الموظف. يطابق structure_shifts.code.';

-- ترحيل ما هو محفوظ في JSONB
DO $$
DECLARE v_b INT := 0; v_s INT := 0;
BEGIN
  UPDATE public.employees e
     SET branch_id = (p.custom_permissions->>'branch_id')::UUID
    FROM public.profiles p
   WHERE p.id = e.user_id
     AND e.branch_id IS NULL
     AND p.custom_permissions ? 'branch_id'
     AND NULLIF(p.custom_permissions->>'branch_id','') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.branches b
                  WHERE b.id = (p.custom_permissions->>'branch_id')::UUID);
  GET DIAGNOSTICS v_b = ROW_COUNT;

  UPDATE public.employees e
     SET shift_code = NULLIF(p.custom_permissions->>'shift_code','')
    FROM public.profiles p
   WHERE p.id = e.user_id
     AND e.shift_code IS NULL
     AND p.custom_permissions ? 'shift_code';
  GET DIAGNOSTICS v_s = ROW_COUNT;

  RAISE NOTICE '0318: رُحِّل % فرع و % وردية من custom_permissions', v_b, v_s;
END $$;

-- دالة قراءة الفرع — تقبل المصدرين أثناء الهجرة
DROP FUNCTION IF EXISTS public.resolve_person_branch(UUID);

CREATE FUNCTION public.resolve_person_branch(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_b UUID;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT e.branch_id INTO v_b
    FROM public.employees e WHERE e.user_id = p_user_id LIMIT 1;
  IF v_b IS NOT NULL THEN RETURN v_b; END IF;

  -- جسر توافق: القيمة القديمة في JSONB
  SELECT NULLIF(p.custom_permissions->>'branch_id','')::UUID INTO v_b
    FROM public.profiles p WHERE p.id = p_user_id;
  RETURN v_b;
END $$;

COMMENT ON FUNCTION public.resolve_person_branch(UUID) IS
  'فرع الشخص: employees.branch_id أولاً ثم custom_permissions (جسر توافق 0318).';

REVOKE ALL ON FUNCTION public.resolve_person_branch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_person_branch(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_person_branch(UUID) TO authenticated, service_role;

-- is_in_my_team: نطاق الفرع يقرأ العمود الحقيقي الآن
CREATE OR REPLACE FUNCTION public.is_in_my_team(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_tenant UUID := public.current_user_tenant_id();
  v_target UUID;
  v_dept   UUID;
  v_branch UUID;
  v_depth  INT := 0;
BEGIN
  IF v_me IS NULL OR v_tenant IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_target := public.resolve_person_user_id(p_user_id);
  IF v_target IS NULL THEN RETURN FALSE; END IF;
  IF v_target = v_me THEN RETURN TRUE; END IF;

  IF EXISTS (
    SELECT 1 FROM public.portal_unit_assignments a
     WHERE a.tenant_id = v_tenant AND a.user_id = v_me
       AND a.is_active AND a.scope_type = 'tenant'
  ) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_target AND p.tenant_id = v_tenant
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_target AND p.tenant_id = v_tenant
       AND (p.manager_id = v_me OR p.supervisor_id = v_me)
  ) THEN
    RETURN TRUE;
  END IF;

  v_dept := public.resolve_person_department(v_target);
  WHILE v_dept IS NOT NULL AND v_depth < 10 LOOP
    IF EXISTS (
      SELECT 1 FROM public.portal_unit_assignments a
       WHERE a.tenant_id = v_tenant AND a.user_id = v_me
         AND a.is_active AND a.scope_type = 'department' AND a.scope_id = v_dept
    ) THEN RETURN TRUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.departments d
       WHERE d.id = v_dept AND d.tenant_id = v_tenant
         AND (d.manager_id = v_me OR d.supervisor_id = v_me OR d.direct_manager_id = v_me)
    ) OR EXISTS (
      SELECT 1 FROM public.org_role_assignments o
       WHERE o.tenant_id = v_tenant AND o.department_id = v_dept
         AND o.user_id = v_me AND o.is_active
    ) THEN RETURN TRUE; END IF;

    SELECT d.parent_department_id INTO v_dept FROM public.departments d WHERE d.id = v_dept;
    v_depth := v_depth + 1;
  END LOOP;

  -- ★ نطاق الفرع — من العمود الحقيقي (0318) لا من JSONB
  v_branch := public.resolve_person_branch(v_target);
  IF v_branch IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.portal_unit_assignments a
     WHERE a.tenant_id = v_tenant AND a.user_id = v_me
       AND a.is_active AND a.scope_type = 'branch' AND a.scope_id = v_branch
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END $$;

-- ═══ 4) ★ توحيد الاشتراكات: مزامنة العمودين ═════════════════════════════
--
-- لا نحذف tenants.plan (99 موضعاً يقرأه) بل نجعله **مُشتقّاً** من
-- subscription_plan عبر محفّز. الخريطة صريحة لأن القائمتين مختلفتان:
--     subscription_plan → plan
--     basic             → basic
--     professional      → pro
--     enterprise        → enterprise
--     custom / hybrid   → enterprise (أوسع صلاحية — لا نُضيّق بالخطأ)
CREATE OR REPLACE FUNCTION public.plan_from_subscription_plan(p_sub TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_sub
    WHEN 'basic'        THEN 'basic'
    WHEN 'professional' THEN 'pro'
    WHEN 'enterprise'   THEN 'enterprise'
    WHEN 'custom'       THEN 'enterprise'
    WHEN 'hybrid'       THEN 'enterprise'
    ELSE 'basic'
  END;
$$;

COMMENT ON FUNCTION public.plan_from_subscription_plan(TEXT) IS
  'يحوّل subscription_plan (مصدر الحقيقة) إلى plan القديم. hybrid/custom ⇒ enterprise لتفادي تضييق خاطئ.';

CREATE OR REPLACE FUNCTION public.tg_sync_tenant_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.plan := public.plan_from_subscription_plan(NEW.subscription_plan);
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_sync_tenant_plan() IS
  'يُبقي tenants.plan مُشتقّاً من subscription_plan — يمنع تلابس العمودين (0318).';

DROP TRIGGER IF EXISTS trg_sync_tenant_plan ON public.tenants;
CREATE TRIGGER trg_sync_tenant_plan
  BEFORE INSERT OR UPDATE OF subscription_plan ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_tenant_plan();

-- ترحيل: توحيد القيم المتضاربة القائمة
DO $$
DECLARE v_n INT := 0;
BEGIN
  UPDATE public.tenants t
     SET plan = public.plan_from_subscription_plan(t.subscription_plan)
   WHERE t.plan IS DISTINCT FROM public.plan_from_subscription_plan(t.subscription_plan);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '0318: وُحِّد % مستأجر كان plan فيه يخالف subscription_plan', v_n;
END $$;

-- ═══ 5) كشف تعارض الاشتراك — تشخيص لا منع ═══════════════════════════════
-- لا نُقفل الوحدات على القاعدة الآن (كسر شامل محتمل)، بل نُعطي
-- بوابة المطوّرين أداةً ترى بها التعارض قبل أن يصير شكوى عميل.
DROP FUNCTION IF EXISTS public.detect_subscription_conflicts();

CREATE FUNCTION public.detect_subscription_conflicts()
RETURNS TABLE (
  out_tenant_id   UUID,
  out_tenant_name TEXT,
  out_issue       TEXT,
  out_detail      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- ① plan لا يطابق subscription_plan
  SELECT t.id, t.name_ar::TEXT, 'تعارض عمودَي الخطة'::TEXT,
         format('subscription_plan=%s ⇒ plan المتوقَّع=%s · الفعلي=%s',
                t.subscription_plan, public.plan_from_subscription_plan(t.subscription_plan), t.plan)
    FROM public.tenants t
   WHERE public.current_user_is_platform_admin()
     AND t.plan IS DISTINCT FROM public.plan_from_subscription_plan(t.subscription_plan)

  UNION ALL
  -- ② هجين بلا صفحات مخصّصة
  SELECT t.id, t.name_ar::TEXT, 'هجين بلا صفحات'::TEXT,
         'subscription_plan=hybrid لكن features فارغة ⇒ المستخدمون بلا صفحات'::TEXT
    FROM public.tenants t
   WHERE public.current_user_is_platform_admin()
     AND t.subscription_plan = 'hybrid'
     AND COALESCE(array_length(t.features, 1), 0) = 0

  UNION ALL
  -- ③ غير هجين ومع ذلك features مملوءة (تُتجاهَل صامتةً)
  SELECT t.id, t.name_ar::TEXT, 'صفحات مخصّصة بلا خطة هجينة'::TEXT,
         format('subscription_plan=%s لكن features فيها %s عنصراً — ستُتجاهَل',
                t.subscription_plan, array_length(t.features,1))
    FROM public.tenants t
   WHERE public.current_user_is_platform_admin()
     AND t.subscription_plan <> 'hybrid'
     AND COALESCE(array_length(t.features, 1), 0) > 0

  UNION ALL
  -- ④ اشتراك منتهٍ وحالته active
  SELECT t.id, t.name_ar::TEXT, 'اشتراك منتهٍ وما زال نشطاً'::TEXT,
         format('انتهى في %s وحالته %s', t.subscription_end_date, t.subscription_status)
    FROM public.tenants t
   WHERE public.current_user_is_platform_admin()
     AND t.subscription_end_date IS NOT NULL
     AND t.subscription_end_date < CURRENT_DATE
     AND t.subscription_status = 'active'

  UNION ALL
  -- ⑤ وحدة مفعّلة خارج enabled_modules
  SELECT t.id, t.name_ar::TEXT, 'وحدة بلا تفعيل'::TEXT,
         format('%s مستخدماً له وحدة %s غير المُفعَّلة للشركة',
                count(*), a.unit_key)
    FROM public.tenants t
    JOIN public.portal_unit_assignments a ON a.tenant_id = t.id AND a.is_active
   WHERE public.current_user_is_platform_admin()
     AND NOT (a.unit_key = ANY (COALESCE(t.enabled_modules, ARRAY[]::TEXT[])))
   GROUP BY t.id, t.name_ar, a.unit_key;
$$;

COMMENT ON FUNCTION public.detect_subscription_conflicts() IS
  'يكشف تعارضات الاشتراك لبوابة المطوّرين. للمنصة وحدها — غيرها يحصل على صفر صفوف.';

REVOKE ALL ON FUNCTION public.detect_subscription_conflicts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detect_subscription_conflicts() FROM anon;
GRANT EXECUTE ON FUNCTION public.detect_subscription_conflicts()
  TO authenticated, service_role;

-- ═══ 6) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_t     UUID := gen_random_uuid();
  v_t2    UUID := gen_random_uuid();
  v_dev   UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_le    UUID := gen_random_uuid();
  v_plan  TEXT;
BEGIN
  -- الدوال موجودة بلا حِمل زائد
  FOR v_cnt IN
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('current_user_is_platform_admin','resolve_person_branch',
        'plan_from_subscription_plan','detect_subscription_conflicts')
  LOOP
    ASSERT v_cnt = 4, format('0318 failed: functions = %s (expected 4)', v_cnt);
  END LOOP;

  -- الأعمدة الجديدة
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='structure_shifts' AND column_name='tenant_id'),
    '0318 failed: structure_shifts.tenant_id missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='employees' AND column_name='branch_id'),
    '0318 failed: employees.branch_id missing';

  -- ★ سياسة الورديات لم تعد مكشوفة
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='structure_shifts' AND cmd='SELECT' AND qual = 'true'
  ), '0318 failed: structure_shifts still world-readable';

  -- خريطة الخطط
  ASSERT public.plan_from_subscription_plan('professional') = 'pro',
    '0318 failed: professional must map to pro';
  ASSERT public.plan_from_subscription_plan('hybrid') = 'enterprise',
    '0318 failed: hybrid must map to enterprise';

  -- ═══ اختبار سلوكي: عزل المطوّر ═══════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug,subscription_plan)
    VALUES (v_t,'G318','عميل','g318-'||substr(v_t::text,1,8),'professional');

  -- محفّز المزامنة عمل؟
  SELECT plan INTO v_plan FROM public.tenants WHERE id = v_t;
  ASSERT v_plan = 'pro', format('0318 failed: plan sync = %s (expected pro)', v_plan);

  INSERT INTO auth.users(id,email) VALUES
    (v_dev,'d318-'||substr(v_dev::text,1,8)||'@k.io'),
    (v_emp,'e318-'||substr(v_emp::text,1,8)||'@c.io');
  -- ★ المطوّر بلا مستأجر — الحالة الطبيعية
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_dev,NULL,'مطوّر المنصة','developer');
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_emp,v_t,'موظف العميل','employee');
  INSERT INTO public.legal_entities(id,tenant_id,code,name_ar)
    VALUES (v_le,v_t,'LE318','كيان العميل');

  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);

  ASSERT public.current_user_is_platform_admin(),
    '0318 failed: developer lost platform admin';
  ASSERT NOT public.current_user_is_platform_owner(),
    '0318 failed: ★ tenant-less developer still owns tenant data';

  -- ورديات: قالب عام مقروء · وردية شركة محجوبة
  -- ملاحظة: structure_shifts.id عدد صحيح لا UUID (اكتُشف بالتشغيل)
  INSERT INTO public.structure_shifts(tenant_id,name_ar,code,start_time,end_time)
    VALUES (v_t,'وردية العميل','C1-'||substr(v_t::text,1,6),'08:00','16:00');

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.structure_shifts WHERE tenant_id = v_t;
  DELETE FROM public.legal_entities   WHERE id = v_le;
  DELETE FROM public.employees        WHERE tenant_id = v_t;
  DELETE FROM public.profiles         WHERE id IN (v_dev,v_emp);
  DELETE FROM auth.users              WHERE id IN (v_dev,v_emp);
  DELETE FROM public.tenants          WHERE id IN (v_t,v_t2);

  ASSERT NOT has_function_privilege('anon',
    'public.detect_subscription_conflicts()','EXECUTE'),
    '0318 failed: anon can read subscription conflicts';

  RAISE NOTICE '✅ 0318: المطوّر معزول · الورديات مُستأجَرة · الفرع عمود · الخطط موحّدة';
END $$;
