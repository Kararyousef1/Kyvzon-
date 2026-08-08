-- ============================================================================
-- 0328_tech_portal_tenant_isolation.sql
--
-- ★★ عزل بوابة التقنية: دور تقنية الشركة ليس مالكاً للمنصة.
--
-- ══ السياق ══════════════════════════════════════════════════════════════
--   بوابة التقنية **خاصة بالشركة المستأجِرة**، لا نافذة على داخل المنصة.
--   مسؤول تقنية شركة عميلة يجب ألّا يعلم بوجود شركات أخرى أصلاً.
--
-- ══ الأعطال المُثبَتة تشغيلياً (جلسة RLS حقيقية) ═══════════════════════
--
--  ① ★★★ `it_admin` يُعامَل **مالكاً للمنصة**.
--     `current_user_is_platform_owner()`:
--        current_user_role() IN ('developer','it_admin')
--        AND current_user_tenant_id() IS NOT NULL
--
--     لكن `it_admin` دور **مستأجر** لا دور منصة — صفحاته في
--     `permissions.ts` هي `tech-portal · dashboard · notifications ·
--     profile · attendance` فقط. لا علاقة له بإدارة المنصة.
--
--     مقيس بدور `it_admin` لشركة (أ) عبر `SET ROLE authenticated`:
--        tenants                 = 3 صف  ← «Kyvzon Platform · أ · ب»
--        tenant_subscriptions    = 1 صف  ← خطة شركة أخرى
--        legal_entities          = 2 صف  ← كيان شركة أخرى
--        chart_of_accounts       = 1 صف  ← «نقدية شركة ب — سرّي»
--        is_platform_owner       = true
--
--     ⇒ مسؤول تقنية أي عميل يقرأ **قائمة كل العملاء** وخططهم
--       واشتراكاتهم وكياناتهم القانونية وحساباتهم المالية.
--       هذا تسريب تجاري ومنافس، لا مجرّد خلل صلاحيات.
--
--     11 سياسة تعتمد هذه الدالة على:
--        tenants · tenant_subscriptions · legal_entities ·
--        entity_memberships · platform_audit_log · public_signup_requests
--
--  ② ★★ `system_settings` بلا فلتر مستأجر إطلاقاً — قراءةً وكتابةً.
--        system_settings_admin_select : USING current_user_is_staff()
--        system_settings_admin_write  : USING/CHECK current_user_is_staff()
--
--     مقيس:
--        تقني شركة (أ) يقرأ إعدادات شركة (ب) ⇒ «شركة ب»
--        ويقرأ مفتاحها السرّي            ⇒ «sk-live-BBBB-سرّي»
--        ويكتب عليها                     ⇒ صارت «مُخترَقة»
--
--     إعدادات الشركة تحوي مفاتيح تكامل ونوافذ دوام وقواعد إجازات —
--     تعديلها من شركة أخرى تخريب مباشر.
--
--  ③ ★ `tenant_modules` بلا فلتر مستأجر في سياسة الكتابة الشاملة
--        kyvzon_tenant_modules_write : ALL
--     مقيس: تقني شركة (أ) يرى صف وحدات شركة ثالثة.
--     الوحدات المُفعَّلة تكشف ما اشترته كل شركة.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   فصل صريح بين ثلاث طبقات:
--     · مالك المنصة   : `developer` **بلا** مستأجر — يدير المنصة
--     · تقنية الشركة  : `it_admin` — داخل مستأجره فقط، بلا استثناء
--     · مستخدم عادي   : بياناته وفريقه
--
--   لا نُلغي `it_admin` بل نُخرجه من دائرة «مالك المنصة» ونمنحه
--   صلاحياته التقنية **داخل شركته**.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ⓪ إسقاط السياسات المعتمِدة أولاً
--
--    ★ مزلق موثَّق (0322): `DROP FUNCTION` يفشل إن اعتمدت عليه سياسات:
--        cannot drop function current_user_is_tenant_tech() because
--        other objects depend on it
--    فتُسقَط كل السياسات المعنيّة في مقدّمة المايجريشن، قديمةً وجديدة،
--    ليكون قابلاً لإعادة التشغيل.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS system_settings_admin_select  ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_write   ON public.system_settings;
DROP POLICY IF EXISTS system_settings_tenant_select ON public.system_settings;
DROP POLICY IF EXISTS system_settings_tenant_write  ON public.system_settings;
DROP POLICY IF EXISTS system_settings_tenant_guard  ON public.system_settings;
DROP POLICY IF EXISTS kyvzon_tenant_modules_write   ON public.tenant_modules;
DROP POLICY IF EXISTS tenant_modules_tenant_guard   ON public.tenant_modules;

-- ─────────────────────────────────────────────────────────────────────────
-- ① تمييز مستأجر المنصة نفسه
--
--    مستأجر المنصة هو صاحب `slug = 'kyvzon'` (الصف الجذر). أي مستأجر
--    آخر شركة عميلة مهما كان دور مستخدمه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.is_platform_tenant(UUID);

CREATE FUNCTION public.is_platform_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT t.slug = 'kyvzon'
      FROM public.tenants t
     WHERE t.id = p_tenant_id
  ), FALSE);
$$;

COMMENT ON FUNCTION public.is_platform_tenant(UUID) IS
  'هل هذا المستأجر هو مستأجر المنصة نفسه (slug=kyvzon)؟ يُستعمل للتمييز '
  'بين مطوّر المنصة ومطوّر يعمل لدى شركة عميلة.';

REVOKE ALL ON FUNCTION public.is_platform_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_tenant(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_tenant(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② فصل مالك المنصة عن تقنية الشركة — العطل ①
--
--    `developer` بلا مستأجر = مالك منصة (يُدار من بوابة المطوّرين).
--    `it_admin` = تقنية شركة، مهما كان مستأجره.
--
--    ★ ملاحظة 0318 السابقة كانت تشترط `tenant_id IS NOT NULL` ظنّاً أن
--      ذلك يمنع التجاوز. الحقيقة معكوسة: مالك المنصة الحقيقي **لا
--      مستأجر له**، فالشرط كان يمنح الامتياز لمن له مستأجر — أي لتقني
--      الشركة — ويمنعه عن مالك المنصة.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- مالك المنصة: مطوّر المنصة وحده. `it_admin` دور **مستأجر**
    -- (صفحاته: tech-portal · dashboard · notifications · profile)
    -- فلا يجوز أن يرى قائمة الشركات العميلة ولا اشتراكاتها.
    public.current_user_role() = 'developer'
    AND public.is_platform_tenant(public.current_user_tenant_id()),
  FALSE);
$$;

COMMENT ON FUNCTION public.current_user_is_platform_owner() IS
  'مالك المنصة = مطوّر ينتمي لمستأجر المنصة نفسه. قبل 0328 كان يشمل '
  'it_admin وهو دور تقنية الشركة، فكان تقني أي عميل يقرأ قائمة كل '
  'العملاء واشتراكاتهم (عطل 0328/①).';

-- ─────────────────────────────────────────────────────────────────────────
-- ③ دور تقنية الشركة — صلاحياته داخل مستأجره
--
--    بديل `current_user_is_platform_owner()` في السياقات التي كان
--    `it_admin` يحتاجها فعلاً (أجهزة البصمة · السجلّات · الإعدادات).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.current_user_is_tenant_tech();

CREATE FUNCTION public.current_user_is_tenant_tech()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('admin','it_admin','developer')
    AND public.current_user_tenant_id() IS NOT NULL,
  FALSE);
$$;

COMMENT ON FUNCTION public.current_user_is_tenant_tech() IS
  'تقنية الشركة: admin · it_admin · developer داخل مستأجرهم. '
  'يُستعمل لصلاحيات بوابة التقنية — لا يمنح أي رؤية خارج المستأجر.';

REVOKE ALL ON FUNCTION public.current_user_is_tenant_tech() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_tenant_tech() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_tenant_tech() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ إغلاق تسريب `system_settings` — العطل ②
--
--    السياسات القديمة تُسقط أولاً (DROP POLICY) قبل إعادة البناء:
--    `CREATE POLICY` لا يستبدل سياسة بنفس الاسم.
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY system_settings_tenant_select ON public.system_settings
  FOR SELECT
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_tenant_tech()
  );

CREATE POLICY system_settings_tenant_write ON public.system_settings
  FOR ALL
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_tenant_tech()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_tenant_tech()
  );

-- ★ حارس تقييدي: يُجمع بـAND فلا يمكن لأي سياسة توسيعية لاحقة تجاوزه.
--   (درس 0320: PERMISSIVE تُجمع بـOR وقد توسّع؛ RESTRICTIVE تضيّق فقط)
CREATE POLICY system_settings_tenant_guard ON public.system_settings
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ إغلاق تسريب `tenant_modules` — العطل ③
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY kyvzon_tenant_modules_write ON public.tenant_modules
  FOR ALL
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_tenant_tech()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_tenant_tech()
  );

CREATE POLICY tenant_modules_tenant_guard ON public.tenant_modules
  AS RESTRICTIVE
  FOR ALL
  USING (
    tenant_id = public.current_user_tenant_id()
    OR public.current_user_is_platform_owner()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    OR public.current_user_is_platform_owner()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ لوحة تشخيص العزل — تُثبِت الإغلاق بدل ادّعائه
--
--    تُعيد لكل جدول حسّاس: هل يراه المستخدم الحالي خارج مستأجره؟
--    الغرض أن يفحص المسؤول التقني عزله بنفسه دون امتياز إضافي.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_isolation_report();

CREATE FUNCTION public.my_isolation_report()
RETURNS TABLE(
  out_area        TEXT,
  out_visible     INTEGER,
  out_foreign     INTEGER,
  out_is_isolated BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ عمداً: يقيس ما يراه المستدعي فعلاً تحت RLS
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_pair   TEXT[];
  v_all    INTEGER;
  v_out    INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['إعدادات الشركة'   ,'system_settings'],
    ARRAY['وحدات الاشتراك'   ,'tenant_modules'],
    ARRAY['أجهزة البصمة'     ,'biometric_devices'],
    ARRAY['الأحداث الأمنية'  ,'security_events'],
    ARRAY['سجلّ المزامنة'    ,'sync_log'],
    ARRAY['سجلّ الأخطاء'     ,'error_logs']
  ] LOOP
    EXECUTE format('SELECT count(*)::INTEGER, '
                || 'count(*) FILTER (WHERE tenant_id IS DISTINCT FROM $1)::INTEGER '
                || 'FROM public.%I', v_pair[2])
      INTO v_all, v_out USING v_tenant;

    out_area        := v_pair[1];
    out_visible     := v_all;
    out_foreign     := v_out;
    out_is_isolated := (v_out = 0);
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.my_isolation_report() IS
  'تقرير عزل بوابة التقنية: كم صفاً يراه المستخدم خارج مستأجره. '
  'SECURITY INVOKER عمداً — يقيس RLS الفعلي لا يتجاوزه.';

REVOKE ALL ON FUNCTION public.my_isolation_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_isolation_report() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_isolation_report() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0328: عزل بوابة التقنية — تقنية الشركة ليست مالكة للمنصة';
END $$;
