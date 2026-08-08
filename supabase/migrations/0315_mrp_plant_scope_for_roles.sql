-- ============================================================================
-- FILE: 0315_mrp_plant_scope_for_roles.sql
-- PURPOSE: إتاحة نطاق المصنع لشاشة أدوار التصنيع + إصلاح عدم اتساق امتيازي
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ عدم الاتساق المُثبَت تشغيلياً (2026-08-05، Postgres 17 محلي):
--
--   0314 عرّف can_manage_mrp_roles() فمنح الامتياز لمن يملك وحدة 'mrp'
--   في portal_unit_assignments — حتى لو كان profiles.role = 'employee'.
--
--   لكن RLS على manufacturing_plants (من 0218) تشترط:
--     current_user_role() = ANY (ARRAY['manufacturing','manager','admin',
--                                      'developer','it_admin'])
--
--   النتيجة المُثبَتة بمسبار:
--     can_manage_mrp_roles() = TRUE   ⇒ الشاشة تُفتح
--     SELECT من manufacturing_plants  ⇒ صفر صفوف
--   أي أن المستخدم يرى شاشة إسناد الأدوار لكن قائمة المصانع فارغة
--   بلا أي تفسير — أسوأ من المنع الصريح.
--
--   وهذا هو **نفس مرض المشروع** الذي نعالجه منذ 0302: مصدران للحقيقة
--   لا يعرف أحدهما الآخر (profiles.role مقابل المعمارية الجديدة).
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل: دالة RPC واحدة تحمل الامتياز نفسه.
--
--   ❌ توسيع RLS على manufacturing_plants — يفتح الجدول كاملاً (إنشاء
--      وتعديل وأرشفة) لمن نريد له قراءة أسماء المصانع فقط
--   ✅ mrp_plants_for_role_scope() بـ SECURITY DEFINER — تتجاوز RLS
--      لكن بحارس can_manage_mrp_roles() الصريح، وتعيد ثلاثة أعمدة فقط
--      (المعرّف والرمز والاسم) — لا تسريب بيانات إدارية
--
--   مبدأ أقل امتياز: منح ما يلزم للمهمة لا الجدول كاملاً.
-- ============================================================================

-- ═══ 1) مصانع المستأجر — لواجهة إسناد الأدوار ═══════════════════════════
DROP FUNCTION IF EXISTS public.mrp_plants_for_role_scope();

CREATE FUNCTION public.mrp_plants_for_role_scope()
RETURNS TABLE (
  out_plant_id   UUID,
  out_plant_code TEXT,
  out_name_ar    TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mp.id, mp.plant_code::TEXT, mp.name_ar::TEXT
    FROM public.manufacturing_plants mp
   WHERE mp.tenant_id = public.current_user_tenant_id()
     AND mp.status = 'active'
     -- الحارس داخل الاستعلام: بلا امتياز صفر صفوف (لا خطأ يكشف الوجود)
     AND public.can_manage_mrp_roles()
   ORDER BY mp.name_ar;
$$;

COMMENT ON FUNCTION public.mrp_plants_for_role_scope() IS
  'مصانع المستأجر النشطة لواجهة إسناد أدوار التصنيع. ثلاثة أعمدة فقط — لا تُغني عن RLS لبقية العمليات.';

REVOKE ALL ON FUNCTION public.mrp_plants_for_role_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mrp_plants_for_role_scope() FROM anon;
GRANT EXECUTE ON FUNCTION public.mrp_plants_for_role_scope() TO authenticated, service_role;

-- ═══ 2) توسيع الكتالوج: هل الدور منطقيّ على مستوى المصنع؟ ═══════════════
--
-- ليست كل الأدوار التسعة قابلة للتنطيق بمصنع. محاسب التكاليف ومخطّط
-- الإنتاج يعملان على مستوى الشركة عادةً، بينما مشرف الإنتاج ومشغّل
-- أرضية المصنع مرتبطان بموقع فيزيائي بعينه.
--
-- نُعرّض هذا للواجهة كإرشاد (لا كقيد صارم): القاعدة تقبل أي تركيبة،
-- لكن الشاشة تُرشد المستخدم للخيار الأنسب. فرض القيد في القاعدة
-- سيكسر حالات مشروعة (شركة بمصنع واحد تريد تنطيق كل شيء).
DROP FUNCTION IF EXISTS public.mrp_role_catalog();

CREATE FUNCTION public.mrp_role_catalog()
RETURNS TABLE (
  out_role_key      TEXT,
  out_label_ar      TEXT,
  out_plant_scoped  BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT r.role_key,
         CASE r.role_key
           WHEN 'mrp_planner'            THEN 'مخطّط الإنتاج'
           WHEN 'production_manager'     THEN 'مدير الإنتاج'
           WHEN 'production_supervisor'  THEN 'مشرف الإنتاج'
           WHEN 'shop_floor_operator'    THEN 'مشغّل أرضية المصنع'
           WHEN 'bom_engineer'           THEN 'مهندس قوائم المواد'
           WHEN 'quality_inspector'      THEN 'مفتّش الجودة'
           WHEN 'maintenance_technician' THEN 'فني الصيانة'
           WHEN 'maintenance_manager'    THEN 'مدير الصيانة'
           WHEN 'cost_accountant'        THEN 'محاسب التكاليف'
           ELSE r.role_key
         END,
         -- إرشاد الواجهة: الأدوار الميدانية يُنصح بتنطيقها بمصنع
         r.role_key IN (
           'production_manager', 'production_supervisor',
           'shop_floor_operator', 'quality_inspector',
           'maintenance_technician', 'maintenance_manager'
         )
    FROM (
      -- الاشتقاق من القيد: أي تعديل عليه ينعكس هنا تلقائياً.
      --
      -- ملاحظة: شكل pg_get_constraintdef يختلف بحسب نوع العمود —
      --   TEXT    ⇒  manufacturing_role = ANY (ARRAY['a'::text, ...])
      --   VARCHAR ⇒  (manufacturing_role)::text = ANY ((ARRAY[...])::text[])
      -- فلا نطابق البنية كاملةً (هشّ)، بل نلتقط كل نص بين علامتَي اقتباس
      -- مفردتين. هذا صامد أمام الشكلين.
      -- (اكتُشف بالتشغيل في 0314: النمط البنيوي أعاد صفر دور.)
      SELECT (regexp_matches(
                pg_get_constraintdef(c.oid),
                '''([a-z_]+)''',
                'g'
              ))[1] AS role_key
        FROM pg_constraint c
       WHERE c.conrelid = 'public.mrp_user_roles'::regclass
         AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%manufacturing_role%'
    ) r
   WHERE r.role_key IS NOT NULL AND r.role_key <> ''
   ORDER BY 1;
$$;

COMMENT ON FUNCTION public.mrp_role_catalog() IS
  'كتالوج أدوار التصنيع مُشتقّاً من قيد CHECK. out_plant_scoped إرشاد للواجهة لا قيد على القاعدة.';

REVOKE ALL ON FUNCTION public.mrp_role_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mrp_role_catalog() FROM anon;
GRANT EXECUTE ON FUNCTION public.mrp_role_catalog() TO authenticated, service_role;

-- ═══ 3) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_fn    TEXT;
  v_t     UUID := gen_random_uuid();
  v_d     UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_p1    UUID := gen_random_uuid();
  v_p2    UUID := gen_random_uuid();
BEGIN
  -- لا حِمل زائد
  FOREACH v_fn IN ARRAY ARRAY['mrp_plants_for_role_scope','mrp_role_catalog'] LOOP
    SELECT count(*) INTO v_cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    ASSERT v_cnt = 1, format('0315 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  -- الكتالوج ما زال تسعة وبعمود ثالث
  SELECT count(*) INTO v_cnt FROM public.mrp_role_catalog();
  ASSERT v_cnt = 9, format('0315 failed: catalog = %s (expected 9)', v_cnt);

  SELECT count(*) INTO v_cnt FROM public.mrp_role_catalog() WHERE out_plant_scoped;
  ASSERT v_cnt = 6, format('0315 failed: plant-scoped roles = %s (expected 6)', v_cnt);

  ASSERT (SELECT out_plant_scoped FROM public.mrp_role_catalog()
           WHERE out_role_key='shop_floor_operator'),
    '0315 failed: shop_floor_operator must be plant-scoped';
  ASSERT NOT (SELECT out_plant_scoped FROM public.mrp_role_catalog()
               WHERE out_role_key='cost_accountant'),
    '0315 failed: cost_accountant must not be plant-scoped';

  -- ★ اختبار سلوكي: العطل الذي يعالجه هذا المايجريشن
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'G315','حارس','g315-'||substr(v_t::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'الإنتاج');
  INSERT INTO auth.users(id,email) VALUES
    (v_u,  'u315-'||substr(v_u::text,1,8)  ||'@t.io'),
    (v_emp,'e315-'||substr(v_emp::text,1,8)||'@t.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    -- ★ دوره employee عمداً: هذا بالضبط من كانت RLS تحجب عنه المصانع
    (v_u,  v_t,'منسّق تصنيع','employee'),
    (v_emp,v_t,'عامل','employee');
  INSERT INTO public.manufacturing_plants(id,tenant_id,plant_code,name_ar) VALUES
    (v_p1,v_t,'PL-A','مصنع بغداد'),
    (v_p2,v_t,'PL-B','مصنع البصرة');
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t,v_u,'manager','mrp','department',v_d);

  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);

  ASSERT public.can_manage_mrp_roles(), '0315 failed: unit holder denied';

  -- قبل 0315 كانت RLS تعيد صفراً لهذا المستخدم
  SELECT count(*) INTO v_cnt FROM public.mrp_plants_for_role_scope();
  ASSERT v_cnt = 2, format('0315 failed: plants visible = %s (expected 2)', v_cnt);

  -- الإسناد بنطاق مصنع يعمل
  PERFORM public.assign_mrp_role(v_emp,'production_supervisor',v_p1);
  SELECT count(*) INTO v_cnt FROM public.mrp_user_roles
   WHERE user_id=v_emp AND plant_id=v_p1 AND is_active;
  ASSERT v_cnt = 1, '0315 failed: plant-scoped assignment failed';

  -- غير المخوَّل لا يرى مصانع
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.mrp_plants_for_role_scope();
  ASSERT v_cnt = 0, format('0315 failed: leaked %s plants to unprivileged', v_cnt);

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.mrp_user_roles          WHERE user_id IN (v_u,v_emp);
  DELETE FROM public.portal_unit_assignments WHERE user_id IN (v_u,v_emp);
  DELETE FROM public.profiles                WHERE id      IN (v_u,v_emp);
  DELETE FROM auth.users                     WHERE id      IN (v_u,v_emp);
  DELETE FROM public.manufacturing_plants    WHERE id      IN (v_p1,v_p2);
  DELETE FROM public.departments             WHERE id      =  v_d;
  DELETE FROM public.tenants                 WHERE id      =  v_t;

  ASSERT NOT has_function_privilege('anon','public.mrp_plants_for_role_scope()','EXECUTE'),
    '0315 failed: anon can list plants';
  ASSERT NOT has_function_privilege('anon','public.mrp_role_catalog()','EXECUTE'),
    '0315 failed: anon can read catalog';

  RAISE NOTICE '✅ 0315: نطاق المصنع متاح — وعدم الاتساق بين can_manage و RLS زال';
END $$;
