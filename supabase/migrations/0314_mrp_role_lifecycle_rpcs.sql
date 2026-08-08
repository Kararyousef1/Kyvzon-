-- ============================================================================
-- FILE: 0314_mrp_role_lifecycle_rpcs.sql
-- PURPOSE: إكمال دورة حياة أدوار التصنيع — سحب · قراءة · كتالوج
--
-- ─────────────────────────────────────────────────────────────────────────
-- الفجوات المُثبَتة تشغيلياً (2026-08-05، Postgres 17 محلي):
--
--   بعد 0312 صار الإسناد ممكناً عبر assign_mrp_role، لكن:
--
--   ① لا دالة سحب. أُثبت بمسبار: بعد الإسناد لا سبيل لإلغائه إلا
--      UPDATE مباشر على mrp_user_roles — وهذا يخالف قاعدة المشروع
--      «الصفحات لا تلمس Supabase مباشرة، كل شيء عبر طبقة SDK».
--
--   ② لا دالة قراءة لأدوار مستخدم آخر. current_user_mrp_roles() تخدم
--      المستخدم نفسه فقط (auth.uid())، فشاشة الإدارة لا تستطيع عرض
--      «من يملك ماذا» دون SELECT مباشر.
--
--   ③ كتالوج الأدوار التسعة محبوس داخل قيد CHECK في 0218. أي واجهة
--      تحتاج نسخه يدوياً ⇒ مصدر حقيقة ثانٍ ينحرف (الدرس المتكرر:
--      TARGET_ROLES انحرف عبر أربع نسخ يدوية).
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ ثغرة نطاق مكتشَفة أثناء الفحص (RLS من 0218):
--
--   mrp_user_roles_write تسمح لدور 'manager' بالكتابة على **كل** صفوف
--   المستأجر. أي أن أي مدير قسم — ولو كان مدير الموارد البشرية — يستطيع
--   منح نفسه 'production_manager'. تصعيد امتياز أفقي.
--
--   assign_mrp_role في 0312 ورث القائمة نفسها. هذا المايجريشن يضيّقها:
--   المدير يجب أن يملك وحدة التصنيع (mrp) عبر portal_unit_assignments
--   — أي ربط الامتياز بالمعمارية الجديدة (0302) لا بالدور الخام.
--
--   التضييق مقصود وموثَّق. من كان يعتمد على السلوك القديم (مدير بلا
--   وحدة mrp) يحتاج إسناد الوحدة — وهي خطوة واحدة في شاشة الإدارة.
-- ============================================================================

-- ═══ 1) كتالوج أدوار التصنيع — مصدر حقيقة واحد ══════════════════════════
-- يُشتقّ من قيد CHECK نفسه لا من قائمة منسوخة، فيستحيل الانحراف.
DROP FUNCTION IF EXISTS public.mrp_role_catalog();

CREATE FUNCTION public.mrp_role_catalog()
RETURNS TABLE (out_role_key TEXT, out_label_ar TEXT)
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
         END
    FROM (
      -- الاشتقاق من القيد: أي تعديل عليه ينعكس هنا تلقائياً.
      --
      -- ملاحظة: شكل pg_get_constraintdef يختلف بحسب نوع العمود —
      --   TEXT    ⇒  manufacturing_role = ANY (ARRAY['a'::text, ...])
      --   VARCHAR ⇒  (manufacturing_role)::text = ANY ((ARRAY['a'::character varying, ...])::text[])
      -- فلا نطابق البنية كاملةً (هشّ)، بل نلتقط كل نص بين علامتَي اقتباس
      -- مفردتين داخل تعريف القيد. هذا صامد أمام الشكلين.
      -- (اكتُشف بالتشغيل: النمط الأول أعاد صفر دور والحارس أسقط المايجريشن.)
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
  'كتالوج أدوار التصنيع مُشتقّاً من قيد CHECK — مصدر حقيقة واحد لا قائمة منسوخة.';

REVOKE ALL ON FUNCTION public.mrp_role_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mrp_role_catalog() FROM anon;
GRANT EXECUTE ON FUNCTION public.mrp_role_catalog() TO authenticated, service_role;

-- ═══ 2) هل للمستخدم الحالي حق إدارة أدوار التصنيع؟ ══════════════════════
-- امتياز مركزي واحد تستعمله كل دوال هذا الملف — فلا تنحرف الشروط.
DROP FUNCTION IF EXISTS public.can_manage_mrp_roles();

CREATE FUNCTION public.can_manage_mrp_roles()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- أدوار المنصة وإدارة النظام
    public.current_user_role() IN ('admin','developer','it_admin')
    -- أو موظف التصنيع (الدور الخشن للبوابة)
    OR public.current_user_role() = 'manufacturing'
    -- أو مدير يملك وحدة التصنيع بالمعمارية الجديدة (0302)
    -- ★ تضييق مقصود: 'manager' وحده لم يعد كافياً — انظر رأس الملف
    OR EXISTS (
      SELECT 1 FROM public.portal_unit_assignments a
       WHERE a.tenant_id = public.current_user_tenant_id()
         AND a.user_id   = auth.uid()
         AND a.is_active = TRUE
         AND a.unit_key  = 'mrp'
         AND a.base_role = 'manager'
    );
$$;

COMMENT ON FUNCTION public.can_manage_mrp_roles() IS
  'هل للمستخدم الحالي حق إسناد/سحب أدوار التصنيع؟ المدير يحتاج وحدة mrp مُسنَدة (0302) — لا يكفي دور manager الخام.';

REVOKE ALL ON FUNCTION public.can_manage_mrp_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_mrp_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_mrp_roles() TO authenticated, service_role;

-- ═══ 3) إعادة تعريف assign_mrp_role بالامتياز المركزي ═══════════════════
-- التوقيع نفسه (UUID,TEXT,UUID) فلا حِمل زائد ولا تعديل على المستدعين.
CREATE OR REPLACE FUNCTION public.assign_mrp_role(
  p_user_id  UUID,
  p_role     TEXT,
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

  IF NOT public.can_manage_mrp_roles() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user_id AND p.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'TARGET_USER_NOT_IN_TENANT';
  END IF;

  -- المصنع — إن ذُكر — من المستأجر نفسه
  IF p_plant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.manufacturing_plants mp
     WHERE mp.id = p_plant_id AND mp.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'PLANT_NOT_IN_TENANT';
  END IF;

  -- فرعان: التفرّد مفروض بآليتين (فهرس جزئي للـNULL · قيد 0218 لغيره)
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
  'يُسند دور تصنيع دقيقاً. الامتياز عبر can_manage_mrp_roles(). قيد CHECK يرفض الدور المجهول.';

REVOKE ALL ON FUNCTION public.assign_mrp_role(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_mrp_role(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_mrp_role(UUID, TEXT, UUID) TO authenticated, service_role;

-- ═══ 4) سحب الدور — أرشفة لا حذف ════════════════════════════════════════
DROP FUNCTION IF EXISTS public.revoke_mrp_role(UUID, TEXT, UUID);

CREATE FUNCTION public.revoke_mrp_role(
  p_user_id  UUID,
  p_role     TEXT,
  p_plant_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_n      INT  := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF NOT public.can_manage_mrp_roles() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE';
  END IF;

  -- سياسة المشروع: archive/cancel/void — لا DELETE
  UPDATE public.mrp_user_roles m
     SET is_active = FALSE
   WHERE m.tenant_id          = v_tenant
     AND m.user_id            = p_user_id
     AND m.manufacturing_role = p_role
     AND m.plant_id IS NOT DISTINCT FROM p_plant_id
     AND m.is_active          = TRUE;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.revoke_mrp_role(UUID, TEXT, UUID) IS
  'يسحب دور تصنيع (is_active=FALSE). لا حذف نهائي. يعيد عدد الصفوف المتأثرة. IS NOT DISTINCT FROM يطابق plant_id=NULL بأمان.';

REVOKE ALL ON FUNCTION public.revoke_mrp_role(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_mrp_role(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_mrp_role(UUID, TEXT, UUID) TO authenticated, service_role;

-- ═══ 5) قراءة أدوار الفريق — لشاشة الإدارة ══════════════════════════════
DROP FUNCTION IF EXISTS public.mrp_role_assignments_overview();

CREATE FUNCTION public.mrp_role_assignments_overview()
RETURNS TABLE (
  out_user_id    UUID,
  out_full_name  TEXT,
  out_base_role  TEXT,
  out_mrp_role   TEXT,
  out_plant_id   UUID,
  out_plant_name TEXT,
  out_is_active  BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, p.full_name, p.role::TEXT, m.manufacturing_role::TEXT,
         m.plant_id, mp.name_ar, m.is_active
    FROM public.mrp_user_roles m
    JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN public.manufacturing_plants mp ON mp.id = m.plant_id
   WHERE m.tenant_id = public.current_user_tenant_id()
     -- الحارس داخل الاستعلام: بلا امتياز لا صفوف (لا خطأ يكشف الوجود)
     AND public.can_manage_mrp_roles()
   ORDER BY p.full_name, m.manufacturing_role;
$$;

COMMENT ON FUNCTION public.mrp_role_assignments_overview() IS
  'كل إسنادات أدوار التصنيع في المستأجر — لشاشة الإدارة. يعيد صفراً من الصفوف لغير المخوَّل.';

REVOKE ALL ON FUNCTION public.mrp_role_assignments_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mrp_role_assignments_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.mrp_role_assignments_overview() TO authenticated, service_role;

-- ═══ 6) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt  INT;
  v_fn   TEXT;
  v_t    UUID := gen_random_uuid();
  v_adm  UUID := gen_random_uuid();
  v_mgr  UUID := gen_random_uuid();
  v_emp  UUID := gen_random_uuid();
  v_d    UUID := gen_random_uuid();
BEGIN
  -- لا حِمل زائد على أي دالة
  FOREACH v_fn IN ARRAY ARRAY[
    'mrp_role_catalog','can_manage_mrp_roles','assign_mrp_role',
    'revoke_mrp_role','mrp_role_assignments_overview'
  ] LOOP
    SELECT count(*) INTO v_cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    ASSERT v_cnt = 1, format('0314 failed: %s overloads = %s', v_fn, v_cnt);

  END LOOP;

  -- ★ تصحيح: النسخة الأولى من هذا الحارس انتهت بـ "OR TRUE" فكان
  -- تأكيداً ميتاً يمرّ دائماً مهما كانت الصلاحيات. نفحص الآن بالتوقيع
  -- الصريح لكل دالة — لا بتركيب اسم ديناميكي.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.mrp_role_catalog()',
    'public.can_manage_mrp_roles()',
    'public.assign_mrp_role(uuid,text,uuid)',
    'public.revoke_mrp_role(uuid,text,uuid)',
    'public.mrp_role_assignments_overview()'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0314 failed: anon can execute %s', v_fn);
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'),
      format('0314 failed: authenticated cannot execute %s', v_fn);
  END LOOP;

  -- الكتالوج يشتقّ الأدوار التسعة من القيد
  SELECT count(*) INTO v_cnt FROM public.mrp_role_catalog();
  ASSERT v_cnt = 9, format('0314 failed: catalog returned %s roles (expected 9)', v_cnt);

  ASSERT EXISTS (SELECT 1 FROM public.mrp_role_catalog() WHERE out_role_key='production_manager'),
    '0314 failed: production_manager missing from catalog';
  ASSERT EXISTS (SELECT 1 FROM public.mrp_role_catalog() WHERE out_label_ar='مدير الإنتاج'),
    '0314 failed: Arabic label missing';
  ASSERT NOT EXISTS (SELECT 1 FROM public.mrp_role_catalog() WHERE out_role_key LIKE '%''%'),
    '0314 failed: catalog leaks quote characters';

  -- اختبار سلوكي: التضييق يعمل
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'G314','حارس','g314-'||substr(v_t::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'الإنتاج');
  INSERT INTO auth.users(id,email) VALUES
    (v_adm,'a314-'||substr(v_adm::text,1,8)||'@t.io'),
    (v_mgr,'m314-'||substr(v_mgr::text,1,8)||'@t.io'),
    (v_emp,'e314-'||substr(v_emp::text,1,8)||'@t.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_adm,v_t,'مدير نظام','admin'),
    (v_mgr,v_t,'مدير قسم','manager'),
    (v_emp,v_t,'عامل','employee');

  -- ★ مدير بلا وحدة mrp لا يملك الامتياز (التضييق)
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);
  ASSERT NOT public.can_manage_mrp_roles(),
    '0314 failed: bare manager can manage mrp roles (horizontal escalation)';

  -- بعد إسناد وحدة mrp يملكه
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t,v_mgr,'manager','mrp','department',v_d);
  ASSERT public.can_manage_mrp_roles(),
    '0314 failed: manager with mrp unit still denied';

  -- الإسناد ثم السحب
  PERFORM public.assign_mrp_role(v_emp,'bom_engineer',NULL);
  SELECT count(*) INTO v_cnt FROM public.mrp_user_roles
   WHERE user_id=v_emp AND is_active;
  ASSERT v_cnt = 1, format('0314 failed: assign did not work (%s)', v_cnt);

  SELECT public.revoke_mrp_role(v_emp,'bom_engineer',NULL) INTO v_cnt;
  ASSERT v_cnt = 1, format('0314 failed: revoke returned %s', v_cnt);

  SELECT count(*) INTO v_cnt FROM public.mrp_user_roles WHERE user_id=v_emp AND is_active;
  ASSERT v_cnt = 0, '0314 failed: revoke did not deactivate';

  SELECT count(*) INTO v_cnt FROM public.mrp_user_roles WHERE user_id=v_emp AND NOT is_active;
  ASSERT v_cnt = 1, '0314 failed: row deleted instead of archived';

  -- العامل لا يملك الامتياز
  PERFORM set_config('request.jwt.claim.sub', v_emp::text, TRUE);
  ASSERT NOT public.can_manage_mrp_roles(), '0314 failed: plain employee can manage';

  SELECT count(*) INTO v_cnt FROM public.mrp_role_assignments_overview();
  ASSERT v_cnt = 0, '0314 failed: overview leaks rows to unprivileged user';

  -- المخوَّل يرى
  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  SELECT count(*) INTO v_cnt FROM public.mrp_role_assignments_overview();
  ASSERT v_cnt >= 1, '0314 failed: overview empty for admin';

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.mrp_user_roles          WHERE user_id IN (v_adm,v_mgr,v_emp);
  DELETE FROM public.portal_unit_assignments WHERE user_id IN (v_adm,v_mgr,v_emp);
  DELETE FROM public.movement_role_assignments WHERE user_id IN (v_adm,v_mgr,v_emp);
  DELETE FROM public.profiles                WHERE id      IN (v_adm,v_mgr,v_emp);
  DELETE FROM auth.users                     WHERE id      IN (v_adm,v_mgr,v_emp);
  DELETE FROM public.departments             WHERE id      =  v_d;
  DELETE FROM public.tenants                 WHERE id      =  v_t;

  RAISE NOTICE '✅ 0314: دورة حياة أدوار التصنيع كاملة — إسناد · سحب · قراءة · كتالوج';
END $$;
