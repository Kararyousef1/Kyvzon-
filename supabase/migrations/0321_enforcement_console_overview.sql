-- ============================================================================
-- FILE: 0321_enforcement_console_overview.sql
-- PURPOSE: نظرة شاملة لوحدة تحكّم الإقفال في بوابة المطوّرين
--
-- ─────────────────────────────────────────────────────────────────────────
-- الفجوة (مُكتشَفة أثناء بناء الواجهة):
--
--   0320 أعطى ثلاث دوال:
--     preview_enforcement_impact(tenant)  ← لشركة واحدة
--     set_module_enforcement(tenant,mode) ← تبديل
--     enforcement_audit_summary()         ← ملخّص السجل
--
--   لكن الثالثة تبدأ من subscription_access_log:
--       FROM subscription_access_log l JOIN tenants t ON t.id = l.tenant_id
--   ⇒ **شركة وضعها off ولا سجل لها لا تظهر إطلاقاً**.
--
--   والنتيجة العملية: الواجهة لا تستطيع عرض قائمة الشركات لاختيار
--   واحدة منها — وهي أول ما يحتاجه المشغّل. لا يمكن أن تُدار وحدة
--   تحكّم من دالة تُظهر المتضررين فقط.
--
-- الحل: دالة تبدأ من tenants (كل الشركات) وتُلحق بها إحصاء السجل
--   عبر LEFT JOIN — فتظهر الشركات النظيفة بصفر.
--
-- ❌ لا تعديل على 0320 · ✅ إضافة فقط
-- ============================================================================

DROP FUNCTION IF EXISTS public.enforcement_console_overview();

CREATE FUNCTION public.enforcement_console_overview()
RETURNS TABLE (
  out_tenant_id        UUID,
  out_tenant_name      TEXT,
  out_subscription_plan TEXT,
  out_mode             TEXT,
  out_enabled_modules  TEXT[],
  out_would_block      BIGINT,
  out_blocked          BIGINT,
  out_distinct_modules BIGINT,
  out_last_attempt     TIMESTAMPTZ,
  out_readiness        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.name_ar::TEXT,
    t.subscription_plan::TEXT,
    COALESCE(t.module_enforcement_mode, 'off')::TEXT,
    COALESCE(t.enabled_modules, ARRAY[]::TEXT[]),
    COALESCE(count(*) FILTER (WHERE l.outcome = 'would_block'), 0),
    COALESCE(count(*) FILTER (WHERE l.outcome = 'blocked'), 0),
    COALESCE(count(DISTINCT l.module_key), 0),
    max(l.occurred_at),
    -- ★ توصية صريحة بدل ترك المشغّل يجتهد
    CASE
      WHEN COALESCE(t.module_enforcement_mode,'off') = 'enforce'
        THEN 'مُقفَل'
      WHEN COALESCE(t.module_enforcement_mode,'off') = 'off'
        THEN 'ابدأ بوضع audit'
      -- في audit: القرار يعتمد على السجل
      WHEN count(*) FILTER (WHERE l.outcome = 'would_block') = 0
        THEN 'جاهز للإقفال — لا محاولات'
      ELSE 'راجع ' || count(DISTINCT l.module_key)::TEXT || ' وحدة قبل الإقفال'
    END
    FROM public.tenants t
    LEFT JOIN public.subscription_access_log l ON l.tenant_id = t.id
   WHERE public.current_user_is_platform_admin()
     AND COALESCE(t.is_active, TRUE)
   GROUP BY t.id, t.name_ar, t.subscription_plan,
            t.module_enforcement_mode, t.enabled_modules
   ORDER BY
     -- الأولوية: من في audit وله محاولات، ثم الباقي
     CASE COALESCE(t.module_enforcement_mode,'off')
       WHEN 'audit' THEN 1 WHEN 'enforce' THEN 2 ELSE 3 END,
     count(*) FILTER (WHERE l.outcome = 'would_block') DESC,
     t.name_ar;
$$;

COMMENT ON FUNCTION public.enforcement_console_overview() IS
  'كل الشركات مع وضع الإقفال وإحصاء السجل وتوصية الجاهزية. تبدأ من tenants لا من السجل فتظهر الشركات النظيفة أيضاً (0321).';

REVOKE ALL ON FUNCTION public.enforcement_console_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforcement_console_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforcement_console_overview()
  TO authenticated, service_role;

-- ═══ تفاصيل محاولات شركة واحدة — للوحة التفصيل ══════════════════════════
DROP FUNCTION IF EXISTS public.enforcement_tenant_detail(UUID);

CREATE FUNCTION public.enforcement_tenant_detail(p_tenant_id UUID)
RETURNS TABLE (
  out_module      TEXT,
  out_would_block BIGINT,
  out_blocked     BIGINT,
  out_users       BIGINT,
  out_last_seen   TIMESTAMPTZ,
  out_in_plan     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.module_key::TEXT,
    count(*) FILTER (WHERE l.outcome = 'would_block'),
    count(*) FILTER (WHERE l.outcome = 'blocked'),
    count(DISTINCT l.user_id),
    max(l.occurred_at),
    -- هل الوحدة ضمن enabled_modules للشركة؟
    -- (تظهر FALSE عادةً — وإلا لما سُجّلت محاولة)
    l.module_key = ANY (
      SELECT unnest(COALESCE(t2.enabled_modules, ARRAY[]::TEXT[]))
        FROM public.tenants t2 WHERE t2.id = p_tenant_id
    )
    FROM public.subscription_access_log l
   WHERE l.tenant_id = p_tenant_id
     AND public.current_user_is_platform_admin()
   GROUP BY l.module_key
   ORDER BY count(*) DESC;
$$;

COMMENT ON FUNCTION public.enforcement_tenant_detail(UUID) IS
  'تفاصيل محاولات شركة: أي وحدة · كم محاولة · كم مستخدماً · آخر مرة. للمنصة وحدها.';

REVOKE ALL ON FUNCTION public.enforcement_tenant_detail(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforcement_tenant_detail(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.enforcement_tenant_detail(UUID)
  TO authenticated, service_role;

-- ═══ حرّاس التحقق ════════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt  INT;
  v_t1   UUID := gen_random_uuid();
  v_t2   UUID := gen_random_uuid();
  v_dev  UUID := gen_random_uuid();
  v_usr  UUID := gen_random_uuid();
  v_txt  TEXT;
BEGIN
  FOR v_cnt IN
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('enforcement_console_overview','enforcement_tenant_detail')
  LOOP
    ASSERT v_cnt = 2, format('0321 failed: functions = %s', v_cnt);
  END LOOP;

  -- ═══ اختبار سلوكي ═══════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug,subscription_plan,enabled_modules) VALUES
    (v_t1,'C1','شركة نظيفة','c1-'||substr(v_t1::text,1,8),'basic',ARRAY['employee','hr']),
    (v_t2,'C2','شركة بمحاولات','c2-'||substr(v_t2::text,1,8),'basic',ARRAY['employee']);
  INSERT INTO auth.users(id,email) VALUES
    (v_dev,'d321-'||substr(v_dev::text,1,8)||'@k.io'),
    (v_usr,'u321-'||substr(v_usr::text,1,8)||'@c.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_dev,v_t1,'مطوّر','developer'),
    (v_usr,v_t2,'مستخدم','admin');

  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);

  -- ★ الشركة النظيفة تظهر رغم صفر سجل — جوهر هذا المايجريشن
  ASSERT EXISTS (SELECT 1 FROM public.enforcement_console_overview()
                  WHERE out_tenant_id = v_t1),
    '0321 failed: ★ clean tenant missing from console (the whole point)';

  SELECT out_would_block INTO v_cnt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_t1;
  ASSERT v_cnt = 0, format('0321 failed: clean tenant would_block = %s', v_cnt);

  -- التوصية للوضع off
  SELECT out_readiness INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_t1;
  ASSERT v_txt = 'ابدأ بوضع audit',
    format('0321 failed: readiness for off = %s', v_txt);

  -- شركة في audit ولها محاولات
  UPDATE public.tenants SET module_enforcement_mode='audit' WHERE id=v_t2;
  INSERT INTO public.subscription_access_log(tenant_id,user_id,module_key,outcome)
  VALUES (v_t2,v_usr,'inventory','would_block'),
         (v_t2,v_usr,'inventory','would_block'),
         (v_t2,v_usr,'mrp','would_block');

  SELECT out_would_block INTO v_cnt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_t2;
  ASSERT v_cnt = 3, format('0321 failed: would_block = %s (expected 3)', v_cnt);

  SELECT out_readiness INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_t2;
  ASSERT v_txt LIKE 'راجع 2 وحدة%',
    format('0321 failed: readiness = %s', v_txt);

  -- audit بلا محاولات ⇒ جاهز
  UPDATE public.tenants SET module_enforcement_mode='audit' WHERE id=v_t1;
  SELECT out_readiness INTO v_txt FROM public.enforcement_console_overview()
   WHERE out_tenant_id = v_t1;
  ASSERT v_txt = 'جاهز للإقفال — لا محاولات',
    format('0321 failed: clean audit readiness = %s', v_txt);

  -- التفصيل
  SELECT count(*) INTO v_cnt FROM public.enforcement_tenant_detail(v_t2);
  ASSERT v_cnt = 2, format('0321 failed: detail rows = %s (expected 2)', v_cnt);

  SELECT out_users INTO v_cnt FROM public.enforcement_tenant_detail(v_t2)
   WHERE out_module = 'inventory';
  ASSERT v_cnt = 1, format('0321 failed: distinct users = %s', v_cnt);

  -- ★ غير المنصة لا يرى شيئاً
  PERFORM set_config('request.jwt.claim.sub', v_usr::TEXT, TRUE);
  SELECT count(*) INTO v_cnt FROM public.enforcement_console_overview();
  ASSERT v_cnt = 0, format('0321 failed: ★ non-platform sees %s tenants', v_cnt);

  SELECT count(*) INTO v_cnt FROM public.enforcement_tenant_detail(v_t2);
  ASSERT v_cnt = 0, format('0321 failed: ★ non-platform sees %s detail rows', v_cnt);

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.subscription_access_log WHERE tenant_id IN (v_t1,v_t2);
  DELETE FROM public.employees WHERE tenant_id IN (v_t1,v_t2);
  DELETE FROM public.profiles  WHERE id IN (v_dev,v_usr);
  DELETE FROM auth.users       WHERE id IN (v_dev,v_usr);
  DELETE FROM public.tenants   WHERE id IN (v_t1,v_t2);

  ASSERT NOT has_function_privilege('anon',
    'public.enforcement_console_overview()','EXECUTE'),
    '0321 failed: anon can read console';

  RAISE NOTICE '✅ 0321: وحدة تحكّم الإقفال — كل الشركات مع توصية الجاهزية';
END $$;
