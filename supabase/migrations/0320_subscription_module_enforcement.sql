-- ============================================================================
-- FILE: 0320_subscription_module_enforcement.sql
-- PURPOSE: الإقفال الحقيقي — الاشتراك يحرس القاعدة لا الواجهة وحدها
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ الثغرة المُثبَتة تشغيلياً (2026-08-05):
--
--   hybrid_allows_module() تنتهي بـ:
--       WHEN NOT current_user_is_hybrid() THEN true
--   أي أن **كل شركة غير هجينة تمرّ على كل الوحدات**.
--
--   مسبار بشركة subscription_plan='basic' و enabled_modules={employee}:
--       hybrid_allows_module('finance')   = TRUE
--       hybrid_allows_module('inventory') = TRUE
--   ⇒ أنشأت كياناً مالياً بنجاح رغم أن اشتراكها لا يشمل المالية.
--
--   والأسوأ — حصر النطاق كشف أن البوابة لا تغطي أصلاً إلا 5 وحدات:
--       hr=46 · finance=42 · manager=7 · gatekeeper=6 · admin=2  (103 جدولاً)
--   بينما:
--       inventory_*   142 جدولاً  ← صفر حراسة
--       mrp_*         106 جداول   ← صفر حراسة
--       crm_*          37 جدولاً  ← صفر حراسة
--       procurement_*  14 جدولاً  ← صفر حراسة
--       contract_*     11 جدولاً  ← صفر حراسة
--   **310 جداول بلا أي بوابة اشتراك.**
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★★ المخاطرة التي تحكم التصميم كله
--
--   tenants.enabled_modules افتراضيه ARRAY['employee'] — ولا شيء في
--   القاعدة يقرأه إلا hybrid_allows_module و detect_subscription_conflicts.
--   أي أن معظم الشركات القائمة قيمتها ناقصة أو غير محدَّثة.
--
--   **إقفال فوري صارم = قطع كل بوابة لكل عميل يعمل الآن.**
--
--   لذلك: نبني الآلية كاملةً، ونشغّلها بـ **مفتاح أمان لكل مستأجر**
--   (enforcement_mode) يبدأ عند 'off'. لا شيء يتغيّر حتى تُشغّله أنت
--   بوعي، شركةً شركة، بعد مراجعة تقرير الأثر.
--
--   ثلاثة أوضاع:
--     off     : لا إقفال — السلوك الحالي حرفياً (الافتراضي)
--     audit   : يُسجَّل الانتهاك في subscription_access_log ولا يُمنع
--     enforce : يُمنع فعلياً
--
--   هذا نمط معياري (feature flag + dry-run) يجعل التراجع فورياً.
-- ============================================================================

-- ═══ 0) تنظيف إعادة التشغيل ═════════════════════════════════════════════
-- عند إعادة تطبيق الملف تكون الـ308 سياسة معتمدة على
-- subscription_allows_module فيفشل DROP FUNCTION بـ
--   «cannot drop function ... because other objects depend on it».
-- نُسقط السياسات أولاً؛ القسم ٦ يُعيد بناءها. (اكتُشف بإعادة التشغيل.)
DO $$
DECLARE v_tbl TEXT; v_n INT := 0;
BEGIN
  FOR v_tbl IN
    SELECT tablename FROM pg_policies
     WHERE schemaname='public' AND policyname='kyvzon_subscription_gate'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS kyvzon_subscription_gate ON public.%I', v_tbl);
    v_n := v_n + 1;
  END LOOP;
  IF v_n > 0 THEN
    RAISE NOTICE '0320: أُسقطت % بوابة قديمة لإعادة البناء', v_n;
  END IF;
END $$;

-- ═══ 1) مفتاح الأمان لكل مستأجر ═════════════════════════════════════════
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS module_enforcement_mode TEXT NOT NULL DEFAULT 'off';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenants_module_enforcement_mode_check'
       AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_module_enforcement_mode_check
      CHECK (module_enforcement_mode IN ('off','audit','enforce'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.module_enforcement_mode IS
  'إقفال الوحدات: off = لا شيء (افتراضي) · audit = تسجيل بلا منع · enforce = منع فعلي (0320).';

-- ═══ 2) سجل محاولات الوصول — أساس وضع audit ═════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_access_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  module_key  TEXT NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('would_block','blocked')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_access_log_tenant
  ON public.subscription_access_log(tenant_id, module_key, occurred_at DESC);

COMMENT ON TABLE public.subscription_access_log IS
  'محاولات الوصول لوحدة خارج الاشتراك. would_block = وضع audit · blocked = enforce.';

ALTER TABLE public.subscription_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_sub_access_log_select ON public.subscription_access_log;
CREATE POLICY kyvzon_sub_access_log_select ON public.subscription_access_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    OR public.current_user_is_platform_admin()
  );

-- الكتابة عبر الدالة وحدها (SECURITY DEFINER) — لا إدراج مباشر
DROP POLICY IF EXISTS kyvzon_sub_access_log_insert ON public.subscription_access_log;
CREATE POLICY kyvzon_sub_access_log_insert ON public.subscription_access_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- ═══ 3) الوحدات المسموحة للمستأجر — مصدر حقيقة واحد ═════════════════════
DROP FUNCTION IF EXISTS public.tenant_allowed_modules();

CREATE FUNCTION public.tenant_allowed_modules()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t    RECORD;
  v_mods TEXT[];
BEGIN
  SELECT t.subscription_plan, t.enabled_modules, t.features
    INTO v_t
    FROM public.tenants t
   WHERE t.id = public.current_user_tenant_id();

  IF NOT FOUND THEN RETURN ARRAY[]::TEXT[]; END IF;

  -- الهجين: الوحدات مشتقّة من الصفحات المخصّصة (منطق 0151 كما هو)
  IF v_t.subscription_plan = 'hybrid' THEN
    RETURN public.hybrid_enabled_modules();
  END IF;

  v_mods := COALESCE(v_t.enabled_modules, ARRAY[]::TEXT[]);

  -- ★ وحدات لا تُقفَل أبداً: بلا employee لا يستطيع أحد تسجيل الدخول
  --   واستعمال حسابه، وبلا admin لا يستطيع مدير النظام إصلاح الإعداد.
  --   إقفالها يُنتج قفلاً لا مخرج منه (lockout).
  v_mods := array_cat(v_mods, ARRAY['employee','admin','tawathul']);

  RETURN ARRAY(SELECT DISTINCT unnest(v_mods));
END $$;

COMMENT ON FUNCTION public.tenant_allowed_modules() IS
  'وحدات المستأجر المسموحة. الهجين من features · غيره من enabled_modules. employee/admin/tawathul لا تُقفَل أبداً (منع lockout).';

REVOKE ALL ON FUNCTION public.tenant_allowed_modules() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_allowed_modules() FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_allowed_modules() TO authenticated, service_role;

-- ═══ 4) ★ البوابة الموحّدة — تحلّ محلّ hybrid_allows_module ══════════════
--
-- التوقيع نفسه (TEXT → BOOLEAN) فلا تحتاج الـ103 سياسة أي تعديل.
-- الاسم الجديد للجداول التي سنحرسها لاحقاً؛ والقديم يُعاد تعريفه
-- ليستدعيه فيبقى متّسقاً.
DROP FUNCTION IF EXISTS public.subscription_allows_module(TEXT);

-- ★ ملاحظة تقنية حاسمة (اكتُشفت بالتشغيل — أمسكها حارس المايجريشن):
--   هذه الدالة تُسجّل في subscription_access_log، والكتابة مستحيلة داخل
--   دالة STABLE (Postgres يرفعها كخطأ يبتلعه بلوك EXCEPTION صامتاً
--   فيبدو أن التسجيل «لا يعمل» بلا سبب ظاهر).
--   لذلك هي VOLATILE. الأثر على الأداء مقبول: RLS تستدعيها مرة لكل
--   استعلام لا لكل صف، لأن معاملها ثابت نصّي.
CREATE FUNCTION public.subscription_allows_module(p_module TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode   TEXT;
  v_tenant UUID := public.current_user_tenant_id();
  v_ok     BOOLEAN;
BEGIN
  -- بلا مستأجر لا قرار — نترك RLS الأساسية تتصرّف
  IF v_tenant IS NULL THEN RETURN TRUE; END IF;

  -- أدوار المنصة تمرّ للتشخيص (نفس نمط movement_require_role)
  IF public.current_user_role() IN ('developer','it_admin') THEN
    RETURN TRUE;
  END IF;

  SELECT t.module_enforcement_mode INTO v_mode
    FROM public.tenants t WHERE t.id = v_tenant;

  v_mode := COALESCE(v_mode, 'off');

  -- ★ مفتاح الأمان: off = السلوك القديم حرفياً
  IF v_mode = 'off' THEN RETURN TRUE; END IF;

  v_ok := p_module = ANY (public.tenant_allowed_modules());

  IF v_ok THEN RETURN TRUE; END IF;

  -- خارج الاشتراك: نُسجّل ثم نقرّر حسب الوضع
  BEGIN
    INSERT INTO public.subscription_access_log
      (tenant_id, user_id, module_key, outcome)
    VALUES (v_tenant, auth.uid(), p_module,
            CASE WHEN v_mode = 'enforce' THEN 'blocked' ELSE 'would_block' END);
  EXCEPTION WHEN OTHERS THEN
    -- التسجيل لا يجوز أن يُسقط الاستعلام
    NULL;
  END;

  RETURN (v_mode <> 'enforce');
END $$;

COMMENT ON FUNCTION public.subscription_allows_module(TEXT) IS
  'بوابة الاشتراك الموحّدة. تحترم module_enforcement_mode: off يمرّ دائماً · audit يسجّل ويمرّ · enforce يمنع (0320).';

REVOKE ALL ON FUNCTION public.subscription_allows_module(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.subscription_allows_module(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.subscription_allows_module(TEXT)
  TO authenticated, service_role;

-- ═══ 5) إعادة توجيه hybrid_allows_module للبوابة الجديدة ════════════════
-- الـ103 سياسة تستدعيها بالاسم؛ نُبقيها ونجعلها واجهة رقيقة.
-- بهذا تنتقل الـ103 جدولاً إلى النظام الجديد بلا تعديل سياسة واحدة.
CREATE OR REPLACE FUNCTION public.hybrid_allows_module(p_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.subscription_allows_module(p_module);
$$;

COMMENT ON FUNCTION public.hybrid_allows_module(TEXT) IS
  'واجهة توافق — تستدعي subscription_allows_module (0320). الاسم محفوظ لأن 103 سياسة تستعمله.';

-- ═══ 6) حراسة البوابات الخمس غير المحروسة ═══════════════════════════════
--
-- 310 جداول بلا بوابة. نضيف سياسة **مقيِّدة** (RESTRICTIVE) — تُضاف
-- إلى الشروط القائمة ولا تحلّ محلها. مع وضع off لا أثر لها إطلاقاً.
--
-- لماذا RESTRICTIVE لا PERMISSIVE:
--   السياسات العادية تُجمع بـ OR — فإضافة واحدة قد **توسّع** الوصول.
--   المقيِّدة تُجمع بـ AND فتضيّق فقط. هذا ما نريده لبوابة اشتراك.
DO $$
DECLARE
  v_tbl  TEXT;
  v_mod  TEXT;
  v_n    INT := 0;
BEGIN
  FOR v_tbl, v_mod IN
    SELECT t.tablename,
           CASE
             WHEN t.tablename LIKE 'inventory\_%'   THEN 'inventory'
             WHEN t.tablename LIKE 'mrp\_%'         THEN 'mrp'
             WHEN t.tablename LIKE 'procurement\_%' THEN 'procurement'
             WHEN t.tablename LIKE 'crm\_%'         THEN 'crm'
             WHEN t.tablename LIKE 'contract\_%'    THEN 'contracts'
           END
      FROM pg_tables t
     WHERE t.schemaname = 'public'
       AND (t.tablename LIKE 'inventory\_%' OR t.tablename LIKE 'mrp\_%'
         OR t.tablename LIKE 'procurement\_%' OR t.tablename LIKE 'crm\_%'
         OR t.tablename LIKE 'contract\_%')
       -- الجدول عليه RLS فعلاً (وإلا السياسة بلا معنى)
       AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='public' AND c.relname=t.tablename AND c.relrowsecurity)
       -- لا نكرّر
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=t.tablename
            AND p.policyname = 'kyvzon_subscription_gate'
       )
  LOOP
    CONTINUE WHEN v_mod IS NULL;
    EXECUTE format(
      'CREATE POLICY kyvzon_subscription_gate ON public.%I '
      'AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.subscription_allows_module(%L)) '
      'WITH CHECK (public.subscription_allows_module(%L))',
      v_tbl, v_mod, v_mod);
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE '0320: أُضيفت بوابة اشتراك على % جدولاً (معطّلة حتى تُشغّل enforcement)', v_n;
END $$;

-- ═══ 7) أدوات التشغيل الآمن لبوابة المطوّرين ════════════════════════════

-- (أ) تقرير الأثر قبل التشغيل: ماذا سيُمنَع لو شُغّل enforce الآن؟
DROP FUNCTION IF EXISTS public.preview_enforcement_impact(UUID);

CREATE FUNCTION public.preview_enforcement_impact(p_tenant_id UUID)
RETURNS TABLE (
  out_module    TEXT,
  out_allowed   BOOLEAN,
  out_row_count BIGINT,
  out_note      TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed TEXT[];
  v_plan    TEXT;
  v_mod     TEXT;
  v_cnt     BIGINT;
BEGIN
  IF NOT public.current_user_is_platform_admin() THEN RETURN; END IF;

  SELECT t.subscription_plan,
         CASE WHEN t.subscription_plan = 'hybrid' THEN ARRAY[]::TEXT[]
              ELSE COALESCE(t.enabled_modules, ARRAY[]::TEXT[]) END
    INTO v_plan, v_allowed
    FROM public.tenants t WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN RETURN; END IF;
  v_allowed := array_cat(v_allowed, ARRAY['employee','admin','tawathul']);

  FOREACH v_mod IN ARRAY ARRAY['inventory','mrp','procurement','crm','contracts',
                               'hr','finance','movement','manager','gatekeeper']
  LOOP
    v_cnt := 0;
    -- عدّ تقريبي من جدول تمثيلي لكل وحدة
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM public.%I WHERE tenant_id = $1',
        CASE v_mod
          WHEN 'inventory'   THEN 'inventory_items'
          WHEN 'mrp'         THEN 'mrp_user_roles'
          WHEN 'procurement' THEN 'procurement_approval_requests'
          WHEN 'crm'         THEN 'crm_discount_approvals'
          WHEN 'contracts'   THEN 'contract_approval_requests'
          WHEN 'hr'          THEN 'hr_approval_requests'
          WHEN 'finance'     THEN 'financial_approval_requests'
          WHEN 'movement'    THEN 'movement_role_assignments'
          WHEN 'manager'     THEN 'portal_unit_assignments'
          ELSE 'profiles'
        END)
      INTO v_cnt USING p_tenant_id;
    EXCEPTION WHEN OTHERS THEN v_cnt := -1;
    END;

    out_module    := v_mod;
    out_allowed   := (v_mod = ANY (v_allowed));
    out_row_count := v_cnt;
    out_note      := CASE
      WHEN v_mod = ANY (v_allowed) THEN 'مسموحة'
      WHEN v_cnt > 0 THEN '★ ستُمنَع ولديها ' || v_cnt || ' صف — راجع قبل التشغيل'
      ELSE 'ستُمنَع (لا بيانات)'
    END;
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.preview_enforcement_impact(UUID) IS
  'تقرير أثر قبل تشغيل الإقفال: أي وحدة ستُمنَع وكم صفاً فيها. للمنصة وحدها.';

REVOKE ALL ON FUNCTION public.preview_enforcement_impact(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_enforcement_impact(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_enforcement_impact(UUID)
  TO authenticated, service_role;

-- (ب) تبديل الوضع — مع حارس يمنع القفز المباشر إلى enforce
DROP FUNCTION IF EXISTS public.set_module_enforcement(UUID, TEXT);

CREATE FUNCTION public.set_module_enforcement(
  p_tenant_id UUID,
  p_mode      TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
  v_would   INT;
BEGIN
  IF NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_SET_ENFORCEMENT';
  END IF;

  IF p_mode NOT IN ('off','audit','enforce') THEN
    RAISE EXCEPTION 'INVALID_ENFORCEMENT_MODE (%)', p_mode;
  END IF;

  SELECT t.module_enforcement_mode INTO v_current
    FROM public.tenants t WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND'; END IF;

  -- ★ حارس التدرّج: لا يُسمح بالقفز من off إلى enforce مباشرةً.
  --   يجب المرور بـ audit أولاً لتُرى الآثار في السجل.
  IF COALESCE(v_current,'off') = 'off' AND p_mode = 'enforce' THEN
    RAISE EXCEPTION 'MUST_AUDIT_BEFORE_ENFORCE — شغّل وضع audit أولاً وراجع subscription_access_log';
  END IF;

  UPDATE public.tenants
     SET module_enforcement_mode = p_mode
   WHERE id = p_tenant_id;

  SELECT count(*) INTO v_would
    FROM public.subscription_access_log l
   WHERE l.tenant_id = p_tenant_id AND l.outcome = 'would_block';

  RETURN format('الوضع الآن: %s · محاولات مُسجَّلة سابقاً: %s', p_mode, v_would);
END $$;

COMMENT ON FUNCTION public.set_module_enforcement(UUID, TEXT) IS
  'يبدّل وضع الإقفال. يمنع القفز من off إلى enforce دون المرور بـ audit (0320).';

REVOKE ALL ON FUNCTION public.set_module_enforcement(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_module_enforcement(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_module_enforcement(UUID, TEXT)
  TO authenticated, service_role;

-- (ج) ملخّص سجل المحاولات — لمراجعة وضع audit
DROP FUNCTION IF EXISTS public.enforcement_audit_summary();

CREATE FUNCTION public.enforcement_audit_summary()
RETURNS TABLE (
  out_tenant_id   UUID,
  out_tenant_name TEXT,
  out_mode        TEXT,
  out_module      TEXT,
  out_attempts    BIGINT,
  out_last_seen   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.tenant_id, t.name_ar::TEXT, t.module_enforcement_mode::TEXT,
         l.module_key::TEXT, count(*), max(l.occurred_at)
    FROM public.subscription_access_log l
    JOIN public.tenants t ON t.id = l.tenant_id
   WHERE public.current_user_is_platform_admin()
   GROUP BY l.tenant_id, t.name_ar, t.module_enforcement_mode, l.module_key
   ORDER BY count(*) DESC;
$$;

COMMENT ON FUNCTION public.enforcement_audit_summary() IS
  'ملخّص محاولات الوصول لوحدات خارج الاشتراك. يُراجَع قبل الانتقال من audit إلى enforce.';

REVOKE ALL ON FUNCTION public.enforcement_audit_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforcement_audit_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforcement_audit_summary()
  TO authenticated, service_role;

-- ═══ 8) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_t     UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_ok    BOOLEAN;
  v_txt   TEXT;
BEGIN
  -- الدوال موجودة بلا حِمل زائد
  FOR v_cnt IN
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('tenant_allowed_modules','subscription_allows_module',
        'preview_enforcement_impact','set_module_enforcement','enforcement_audit_summary')
  LOOP
    ASSERT v_cnt = 5, format('0320 failed: functions = %s (expected 5)', v_cnt);
  END LOOP;

  -- ★ البوابات المقيِّدة أُضيفت
  SELECT count(*) INTO v_cnt FROM pg_policies
   WHERE schemaname='public' AND policyname='kyvzon_subscription_gate';
  ASSERT v_cnt > 100, format('0320 failed: subscription gates = %s (expected >100)', v_cnt);

  -- وكلها RESTRICTIVE لا PERMISSIVE
  SELECT count(*) INTO v_cnt FROM pg_policies
   WHERE schemaname='public' AND policyname='kyvzon_subscription_gate'
     AND permissive <> 'RESTRICTIVE';
  ASSERT v_cnt = 0, format('0320 failed: %s gates are PERMISSIVE (would widen access)', v_cnt);

  -- ═══ اختبار سلوكي ═══════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug,subscription_plan,enabled_modules)
    VALUES (v_t,'G320','حارس','g320-'||substr(v_t::text,1,8),'basic',ARRAY['employee','hr']);
  INSERT INTO auth.users(id,email) VALUES (v_u,'g320-'||substr(v_u::text,1,8)||'@t.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES (v_u,v_t,'مدير','admin');

  PERFORM set_config('request.jwt.claim.sub', v_u::TEXT, TRUE);

  -- ★ الوضع الافتراضي off ⇒ كل شيء يمرّ (السلوك القديم حرفياً)
  SELECT t.module_enforcement_mode INTO v_txt FROM public.tenants t WHERE t.id=v_t;
  ASSERT v_txt = 'off', format('0320 failed: default mode = %s', v_txt);

  ASSERT public.subscription_allows_module('inventory'),
    '0320 failed: ★ off mode must allow everything (no behaviour change)';

  -- audit: يمرّ ويُسجَّل
  UPDATE public.tenants SET module_enforcement_mode='audit' WHERE id=v_t;
  ASSERT public.subscription_allows_module('inventory'),
    '0320 failed: audit mode must not block';

  SELECT count(*) INTO v_cnt FROM public.subscription_access_log
   WHERE tenant_id=v_t AND module_key='inventory' AND outcome='would_block';
  ASSERT v_cnt >= 1, '0320 failed: audit mode did not log';

  -- المسموح لا يُسجَّل
  ASSERT public.subscription_allows_module('hr'), '0320 failed: allowed module blocked';
  SELECT count(*) INTO v_cnt FROM public.subscription_access_log
   WHERE tenant_id=v_t AND module_key='hr';
  ASSERT v_cnt = 0, '0320 failed: allowed module was logged';

  -- enforce: يمنع
  UPDATE public.tenants SET module_enforcement_mode='enforce' WHERE id=v_t;
  ASSERT NOT public.subscription_allows_module('inventory'),
    '0320 failed: ★ enforce mode did not block';
  ASSERT public.subscription_allows_module('hr'),
    '0320 failed: enforce blocked an allowed module';

  -- ★ وحدات منع القفل
  ASSERT public.subscription_allows_module('employee'),
    '0320 failed: ★ employee must never be blocked (lockout)';
  ASSERT public.subscription_allows_module('admin'),
    '0320 failed: ★ admin must never be blocked (lockout)';

  -- حارس التدرّج — يتطلب دور منصة، فنُبدّل الهوية
  UPDATE public.tenants SET module_enforcement_mode='off' WHERE id=v_t;
  UPDATE public.profiles SET role='developer', tenant_id=v_t WHERE id=v_u;
  BEGIN
    PERFORM public.set_module_enforcement(v_t, 'enforce');
    RAISE EXCEPTION '0320 failed: jumped from off to enforce';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%MUST_AUDIT_BEFORE_ENFORCE%' THEN RAISE; END IF;
  END;

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.subscription_access_log WHERE tenant_id = v_t;
  DELETE FROM public.employees WHERE tenant_id = v_t;
  DELETE FROM public.profiles  WHERE id = v_u;
  DELETE FROM auth.users       WHERE id = v_u;
  DELETE FROM public.tenants   WHERE id = v_t;

  ASSERT NOT has_function_privilege('anon',
    'public.set_module_enforcement(uuid,text)','EXECUTE'),
    '0320 failed: anon can toggle enforcement';

  RAISE NOTICE '✅ 0320: بوابة الاشتراك جاهزة على 300+ جدول — الوضع off لكل المستأجرين (لا تغيير سلوكي)';
END $$;
