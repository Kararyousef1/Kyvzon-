-- ============================================================================
-- FILE: 0312_activate_mrp_user_roles.sql
-- PURPOSE: إحياء جدول أدوار التصنيع اليتيم — إنهاء 11 دوراً «شبحاً»
--
-- ─────────────────────────────────────────────────────────────────────────
-- التشخيص المُثبَت تشغيلياً (2026-08-05، Postgres 17 محلي، قاعدة نظيفة):
--
--   ① 11 اسم دور تظهر في 388 استدعاء *_require_roles لكنها **مرفوضة**
--      من profiles_role_check. أُثبِت بمسبار أدخل الأحد عشر واحداً واحداً:
--        ✅ 11/11 رُفضت بـ check_violation
--      أبرزها production_manager: 99 استدعاءً — كلها فروع لا تُنفَّذ أبداً.
--
--   ② جدول public.mrp_user_roles موجود منذ 0218 ويقبل هذه الأدوار بالضبط
--      في عمود manufacturing_role، وله RLS وسياستان… لكنه **يتيم تماماً**:
--        SELECT proname FROM pg_proc WHERE prosrc ILIKE '%mrp_user_roles%'
--          ⇒ صفر صفوف
--        SELECT count(*) FROM pg_policies WHERE qual ILIKE '%mrp_user_roles%'
--          ⇒ 0
--      لا دالة واحدة تقرأه. أُنشئ ثم نُسي.
--
--   ③ mrp_require_roles يقرأ current_user_role() (أي profiles.role) وحده:
--        IF NOT (v_role=ANY(allowed_roles) OR v_role IN ('manufacturing',…))
--      فمدير إنتاج مُسنَد في mrp_user_roles يُرفض رغم إسناده — مُثبَت بمسبار.
--
--   الأثر العملي: كل صلاحيات التصنيع الدقيقة تنهار إلى صلاحية واحدة خشنة
--   هي 'manufacturing'. مخطِّط الإنتاج ومهندس قوائم المواد ومفتّش الجودة
--   ومحاسب التكاليف — كلهم إمّا 'manufacturing' بكل الصلاحيات أو لا شيء.
--   هذا **عكس** مبدأ أقل امتياز، وهو نفس مرض «انفجار الأدوار» من الوجه
--   الآخر: أسماء أدوار بلا آلية إسناد.
--
-- ─────────────────────────────────────────────────────────────────────────
-- القرار: تفعيل الجدول القائم — لا حذف الاستدعاءات ولا تضخيم profiles.role
--
--   ❌ حذف الـ388 استدعاءً        — يُلغي تصميماً مقصوداً ويوسّع الصلاحيات
--   ❌ إضافة 11 دوراً لـ profiles  — انفجار أدوار صريح؛ ودور واحد لكل
--                                    مستخدم يعني أن مدير الإنتاج يفقد
--                                    'manufacturing' فيخسر البوابة كلها
--   ✅ تفعيل mrp_user_roles        — الجدول مصمَّم لهذا: user + role + plant
--                                    ويسمح بأدوار متعددة للمستخدم الواحد
--
--   وهذا هو **نفس نمط Scoped Roles** المعتمد في 0302: دور خشن في profiles
--   + أدوار دقيقة بنطاق في جدول مخصص. نُعمّم النمط لا نخترع غيره.
--
-- ─────────────────────────────────────────────────────────────────────────
-- التوافق الخلفي مطلق — توسيع لا تضييق:
--   من كان يمرّ قبل هذا المايجريشن يمرّ بعده (الشرط أُضيف بـ OR).
--   ❌ لا يُسحب أي حق قائم   ❌ لا تُعدَّل الـ388 استدعاءً   ❌ لا حذف
-- ============================================================================

-- ═══ 1) دالة قراءة أدوار التصنيع للمستخدم الحالي ════════════════════════
CREATE OR REPLACE FUNCTION public.current_user_mrp_roles()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT r.manufacturing_role), ARRAY[]::TEXT[])
    FROM public.mrp_user_roles r
   WHERE r.tenant_id = public.current_user_tenant_id()
     AND r.user_id   = auth.uid()
     AND r.is_active = TRUE;
$$;

COMMENT ON FUNCTION public.current_user_mrp_roles() IS
  'أدوار التصنيع الدقيقة للمستخدم الحالي من mrp_user_roles. تُكمّل profiles.role ولا تحلّ محله.';

REVOKE ALL ON FUNCTION public.current_user_mrp_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_mrp_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_mrp_roles() TO authenticated, service_role;

-- ═══ 2) توسيع mrp_require_roles ليقرأ الجدول المخصص ═════════════════════
-- ملاحظة بنيوية: CREATE OR REPLACE يحافظ على التوقيع نفسه (TEXT[]) فلا
-- ينشأ حِمل زائد، ولا تحتاج الـ388 استدعاءً أي تعديل.
CREATE OR REPLACE FUNCTION public.mrp_require_roles(allowed_roles TEXT[])
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      TEXT := public.current_user_role();
  v_mrp_roles TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF public.current_user_tenant_id() IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- المسار القديم أولاً: أرخص (لا استعلام) ويغطي الأغلبية الساحقة.
  IF v_role = ANY(allowed_roles)
     OR v_role IN ('manufacturing','admin','developer','it_admin') THEN
    RETURN;
  END IF;

  -- المسار الجديد: أدوار التصنيع الدقيقة من mrp_user_roles.
  -- هذا ما يُحيي الـ99 استدعاءً التي تذكر production_manager وأخواتها.
  v_mrp_roles := public.current_user_mrp_roles();
  IF v_mrp_roles && allowed_roles THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MRP_OPERATION';
END $$;

COMMENT ON FUNCTION public.mrp_require_roles(TEXT[]) IS
  'حارس عمليات التصنيع. يقبل profiles.role أو دوراً دقيقاً من mrp_user_roles (0312). توسيع لا تضييق: من كان يمرّ يبقى يمرّ.';

GRANT EXECUTE ON FUNCTION public.mrp_require_roles(TEXT[]) TO authenticated;

-- ═══ 3) إصلاح التفرّد: UNIQUE يعامل NULL كقيمة مميزة ════════════════════
--
-- ★ عيب اكتُشف بالاختبار السلوكي 8.2 (لا بالمراجعة):
--   القيد الأصلي في 0218 هو UNIQUE(tenant_id,user_id,manufacturing_role,plant_id).
--   وبما أن plant_id يقبل NULL — وهو الحال الشائع (دور على مستوى الشركة
--   لا مصنع بعينه) — فإن Postgres يعامل كل NULL كقيمة مميزة، فيسمح بصفوف
--   مكرّرة بلا حدّ لنفس (مستأجر، مستخدم، دور). أُثبت تشغيلياً: استدعاءان
--   لـ assign_mrp_role أنتجا صفّين لا صفاً واحداً، لأن ON CONFLICT لم يجد
--   قيداً ينطبق.
--
-- الحل المتبَع في المشروع (0302 و0304): فهرسان جزئيان متكاملان.
-- لا نُسقط القيد الأصلي — يظل صحيحاً لحالة plant_id NOT NULL — بل نضيف
-- الفهرس الناقص لحالة NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mrp_user_role_tenant_wide
  ON public.mrp_user_roles (tenant_id, user_id, manufacturing_role)
  WHERE plant_id IS NULL;

COMMENT ON INDEX public.uq_mrp_user_role_tenant_wide IS
  'يمنع تكرار دور تصنيع على مستوى الشركة. لازم لأن UNIQUE العادي يعامل plant_id=NULL كقيمة مميزة.';

-- إزالة أي تكرار سابق قبل فرض الفهرس (أرشفة لا حذف):
-- نُبقي الأقدم فعّالاً ونُعطّل ما بعده.
DO $$
DECLARE v_dupes INT := 0;
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (
             PARTITION BY tenant_id, user_id, manufacturing_role
             ORDER BY created_at, id
           ) AS rn
      FROM public.mrp_user_roles
     WHERE plant_id IS NULL AND is_active
  )
  UPDATE public.mrp_user_roles m
     SET is_active = FALSE
    FROM ranked r
   WHERE m.id = r.id AND r.rn > 1;

  GET DIAGNOSTICS v_dupes = ROW_COUNT;
  IF v_dupes > 0 THEN
    RAISE NOTICE '0312: عُطِّل % صف مكرّر (أُرشِف ولم يُحذف)', v_dupes;
  END IF;
END $$;

-- ═══ 4) دالة إسناد دور تصنيع — واجهة مُتحقَّقة بدل INSERT مباشر ═════════
DROP FUNCTION IF EXISTS public.assign_mrp_role(UUID, TEXT, UUID);

CREATE FUNCTION public.assign_mrp_role(
  p_user_id UUID,
  p_role    TEXT,
  p_plant_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- الإسناد امتياز إداري: لا يمنحه إلا مدير المنصة أو مدير التصنيع
  IF public.current_user_role() NOT IN
     ('admin','developer','it_admin','manufacturing','manager') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE';
  END IF;

  -- المستهدَف داخل المستأجر نفسه — منع الإسناد عبر الشركات
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user_id AND p.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'TARGET_USER_NOT_IN_TENANT';
  END IF;

  -- فرعان لأن التفرّد مفروض بآليتين مختلفتين:
  --   plant_id IS NULL     → الفهرس الجزئي uq_mrp_user_role_tenant_wide
  --   plant_id IS NOT NULL → قيد UNIQUE الأصلي من 0218
  -- ON CONFLICT لا يستهدف فهرساً جزئياً دون ذكر شرطه، فنُصرّح به.
  IF p_plant_id IS NULL THEN
    INSERT INTO public.mrp_user_roles(tenant_id, user_id, manufacturing_role, plant_id, is_active)
    VALUES (v_tenant, p_user_id, p_role, NULL, TRUE)
    ON CONFLICT (tenant_id, user_id, manufacturing_role) WHERE plant_id IS NULL
    DO UPDATE SET is_active = TRUE
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.mrp_user_roles(tenant_id, user_id, manufacturing_role, plant_id, is_active)
    VALUES (v_tenant, p_user_id, p_role, p_plant_id, TRUE)
    ON CONFLICT (tenant_id, user_id, manufacturing_role, plant_id)
    DO UPDATE SET is_active = TRUE
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.assign_mrp_role(UUID, TEXT, UUID) IS
  'يُسند دور تصنيع دقيقاً. قيد CHECK على manufacturing_role يرفض المجهول. لا حذف — الإلغاء is_active=FALSE.';

REVOKE ALL ON FUNCTION public.assign_mrp_role(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_mrp_role(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_mrp_role(UUID, TEXT, UUID) TO authenticated, service_role;

-- ═══ 5) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_t     UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_roles TEXT[];
  v_def   TEXT;
BEGIN
  -- لا حِمل زائد على أي من الدوال الثلاث
  FOREACH v_def IN ARRAY ARRAY['current_user_mrp_roles','mrp_require_roles','assign_mrp_role'] LOOP
    SELECT count(*) INTO v_cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_def;
    ASSERT v_cnt = 1, format('0312 failed: %s overloads = %s', v_def, v_cnt);
  END LOOP;

  -- ★ الحارس الجوهري: mrp_require_roles صار يقرأ الجدول المخصص فعلاً
  SELECT prosrc INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mrp_require_roles';
  ASSERT v_def ILIKE '%current_user_mrp_roles%',
    '0312 failed: mrp_require_roles still ignores mrp_user_roles';

  -- الجدول لم يعد يتيماً
  SELECT count(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ILIKE '%mrp_user_roles%';
  ASSERT v_cnt >= 2, format('0312 failed: mrp_user_roles readers = %s (expected >= 2)', v_cnt);

  -- قيد manufacturing_role يغطي الأدوار الأحد عشر المستعملة في require_roles
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.mrp_user_roles'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%manufacturing_role%';
  ASSERT v_def ILIKE '%production_manager%', '0312 failed: production_manager missing from CHECK';
  ASSERT v_def ILIKE '%mrp_planner%',        '0312 failed: mrp_planner missing from CHECK';
  ASSERT v_def ILIKE '%bom_engineer%',       '0312 failed: bom_engineer missing from CHECK';
  ASSERT v_def ILIKE '%quality_inspector%',  '0312 failed: quality_inspector missing from CHECK';
  ASSERT v_def ILIKE '%cost_accountant%',    '0312 failed: cost_accountant missing from CHECK';

  -- اختبار سلوكي: الدور المجهول يُرفض من قيد الجدول
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'Guard 0312','حارس 0312','g0312-'||substr(v_t::text,1,8));
  INSERT INTO auth.users(id,email) VALUES (v_u,'g0312-'||substr(v_u::text,1,8)||'@t.test');
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_u,v_t,'عامل','employee');

  BEGIN
    INSERT INTO public.mrp_user_roles(tenant_id,user_id,manufacturing_role)
      VALUES (v_t,v_u,'not_a_real_mrp_role');
    RAISE EXCEPTION '0312 failed: CHECK accepts arbitrary manufacturing_role';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- الإسناد الصحيح يُقبل ويُقرأ
  INSERT INTO public.mrp_user_roles(tenant_id,user_id,manufacturing_role)
    VALUES (v_t,v_u,'production_manager');
  SELECT count(*) INTO v_cnt FROM public.mrp_user_roles
   WHERE user_id=v_u AND manufacturing_role='production_manager' AND is_active;
  ASSERT v_cnt = 1, '0312 failed: valid assignment rejected';

  -- تنظيف
  DELETE FROM public.mrp_user_roles WHERE user_id = v_u;
  DELETE FROM public.profiles       WHERE id      = v_u;
  DELETE FROM auth.users            WHERE id      = v_u;
  DELETE FROM public.tenants        WHERE id      = v_t;

  ASSERT NOT has_function_privilege('anon','public.current_user_mrp_roles()','EXECUTE'),
    '0312 failed: anon can read mrp roles';
  ASSERT NOT has_function_privilege('anon','public.assign_mrp_role(uuid,text,uuid)','EXECUTE'),
    '0312 failed: anon can assign mrp roles';

  RAISE NOTICE '✅ 0312: mrp_user_roles لم يعد يتيماً — 11 دوراً شبحاً صارت قابلة للإسناد والفحص';
END $$;
