-- ============================================================================
-- FILE: 0302_portal_unit_assignments.sql
-- PURPOSE: معمارية الوحدات — أساس «دور واحد + وحدات» بدل دور لكل بوابة
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة المعمارية التي يحلّها:
--
--   النظام يسير نحو «انفجار الأدوار» (role explosion):
--     18 دوراً حالياً، منها 12 دوراً تشغيلياً ليست إلا بوابة في زي دور.
--     ومع 19 وحدة في كتالوج المستأجر، النهج الحالي يقود إلى ~38 دوراً
--     (دور تشغيلي + دور «مدير هذه البوابة» لكل وحدة).
--
--   والدليل القائم على أن النهج انكسر فعلاً:
--     departments تحوي بالفعل: manager_id · supervisor_id
--                              · direct_manager_id · procurement_manager_id
--     أي أن النظام اضطُر لإضافة عمود خاص بـ«مدير المشتريات».
--     ولو تابعنا لصار: movement_manager_id · inventory_manager_id
--                      · mrp_manager_id · finance_manager_id …
--
--   والنتيجة العملية اليوم:
--     • بوابة المدير = 5 صفحات عامة (مقابل 109 للمخزون و77 للتصنيع)
--     • مركز موافقات المدير يقرأ approval_requests ولا أحد يكتب فيه
--       ⇒ الصفحة فارغة دائماً
--     • 16 جدول موافقات منفصل، كل بوابة بنت نظامها
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل: Scoped Roles — دور خشن + نطاق صريح
--
--   manager/supervisor = الدور (مرتبط بوظيفة، لا يتكاثر)
--   unit_key           = الوحدة (المجال الذي يشرف عليه)
--   scope_type/scope_id = النطاق (قسم · فرع · الشركة)
--
--   سوابق قائمة في المشروع نبني عليها ولا نخترع:
--     entity_memberships (0126): user_id + legal_entity_id + finance_role
--     movement_role_assignments (0270): user_id + portal_role
--   هذا الجدول يُعمّم النمط على كل البوابات.
--
-- ما لا يفعله هذا المايجريشن — عمداً:
--   ❌ لا يلمس أي دور قائم (movement_manager يبقى يعمل)
--   ❌ لا يوحّد جداول الموافقات الـ16 (خطوة لاحقة)
--   ❌ لا يحذف أعمدة X_manager_id من departments (تُهجَر تدريجياً)
-- ============================================================================

-- ═══ 1) جدول إسناد الوحدات ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.portal_unit_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- الدور الأساس: خشن ومرتبط بوظيفة — لا يتكاثر مع البوابات
  base_role     VARCHAR(20) NOT NULL
    CHECK (base_role IN ('manager', 'supervisor')),

  -- الوحدة: المجال الذي يشرف عليه. مفاتيحها تطابق ModuleKey في
  -- TenantModuleCatalog.ts ليبقى مصدر الحقيقة واحداً.
  unit_key      VARCHAR(30) NOT NULL
    CHECK (unit_key IN (
      'movement', 'hr', 'finance', 'procurement', 'inventory',
      'mrp', 'contracts', 'crm', 'health_safety'
    )),

  -- النطاق: بلا هذا يعود المدير ليرى كل شيء — وهو ما نتجنّبه.
  scope_type    VARCHAR(20) NOT NULL DEFAULT 'department'
    CHECK (scope_type IN ('department', 'branch', 'tenant')),
  scope_id      UUID,

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  origin        VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'org_sync')),
  assigned_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- نطاق 'tenant' لا يحمل scope_id؛ الآخران يحملانه إلزاماً.
  CONSTRAINT portal_unit_scope_coherence CHECK (
    (scope_type = 'tenant'     AND scope_id IS NULL) OR
    (scope_type <> 'tenant'    AND scope_id IS NOT NULL)
  )
);

-- التفرّد: نستعمل فهرسين جزئيين لأن UNIQUE العادي يعامل NULL كقيمة
-- مميزة، فيسمح بتكرار صفوف scope_type='tenant' للمستخدم نفسه.
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_unit_scoped
  ON public.portal_unit_assignments (tenant_id, user_id, base_role, unit_key, scope_type, scope_id)
  WHERE scope_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_unit_tenant_wide
  ON public.portal_unit_assignments (tenant_id, user_id, base_role, unit_key)
  WHERE scope_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_unit_user
  ON public.portal_unit_assignments (tenant_id, user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_portal_unit_lookup
  ON public.portal_unit_assignments (tenant_id, unit_key, base_role, is_active);

COMMENT ON TABLE public.portal_unit_assignments IS
  'إسناد وحدات لبوابتَي المدير والمشرف. Scoped Roles: دور خشن + وحدة + نطاق، بدل دور جديد لكل بوابة.';

COMMENT ON COLUMN public.portal_unit_assignments.unit_key IS
  'يطابق ModuleKey في TenantModuleCatalog.ts — مصدر حقيقة واحد للوحدات.';

DROP TRIGGER IF EXISTS trg_portal_unit_assignments_updated ON public.portal_unit_assignments;
CREATE TRIGGER trg_portal_unit_assignments_updated
  BEFORE UPDATE ON public.portal_unit_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ═══ 2) RLS ═════════════════════════════════════════════════════════════
ALTER TABLE public.portal_unit_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_portal_unit_assignments_all ON public.portal_unit_assignments;
CREATE POLICY kyvzon_portal_unit_assignments_all ON public.portal_unit_assignments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- ═══ 3) وحدات المستخدم الحالي ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.my_portal_units()
RETURNS TABLE (
  out_base_role  TEXT,
  out_unit_key   TEXT,
  out_scope_type TEXT,
  out_scope_id   UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.base_role::TEXT, a.unit_key::TEXT, a.scope_type::TEXT, a.scope_id
    FROM public.portal_unit_assignments a
   WHERE a.tenant_id = public.current_user_tenant_id()
     AND a.user_id   = auth.uid()
     AND a.is_active = TRUE
   ORDER BY a.base_role, a.unit_key;
$$;

COMMENT ON FUNCTION public.my_portal_units() IS
  'وحدات المستخدم الحالي. أسماء الإخراج ببادئة out_ لتفادي التباس أعمدة الجدول.';

-- ═══ 4) حارس الوحدة ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.has_portal_unit(
  p_base_role TEXT,
  p_unit_key  TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.portal_unit_assignments a
     WHERE a.tenant_id = public.current_user_tenant_id()
       AND a.user_id   = auth.uid()
       AND a.is_active = TRUE
       AND a.unit_key  = p_unit_key
       -- المدير يشمل صلاحية المشرف في الوحدة نفسها (تسلسل هرمي).
       AND (a.base_role = p_base_role OR a.base_role = 'manager')
  );
$$;

COMMENT ON FUNCTION public.has_portal_unit(TEXT, TEXT) IS
  'هل للمستخدم الوحدة المطلوبة؟ المدير يشمل صلاحية المشرف في الوحدة نفسها.';

-- ═══ 5) هل هذا الشخص ضمن فريقي؟ ═════════════════════════════════════════
-- ثلاث طبطات للانتماء، أي واحدة تكفي:
--   (أ) رئاسة مباشرة  : profiles.manager_id / supervisor_id
--   (ب) نطاق الوحدة   : قسم أو فرع مُسنَد لي، مع وراثة عبر شجرة الأقسام
--   (ج) نطاق المستأجر : مدير على مستوى الشركة
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
  v_dept   UUID;
  v_depth  INT := 0;
BEGIN
  IF v_me IS NULL OR v_tenant IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- المدير يرى سجلاته الخاصة ضمن منظور وحدته (تصريحه هو أيضاً يمرّ
  -- بمسار الاعتماد). لكن «حجم الفريق» يستثنيه صراحةً في team_kpis
  -- لأن المدير ليس مرؤوس نفسه.
  IF p_user_id = v_me THEN
    RETURN TRUE;
  END IF;

  -- (ج) نطاق المستأجر: أي إسناد وحدة بنطاق tenant يغطي كل موظفي الشركة
  IF EXISTS (
    SELECT 1 FROM public.portal_unit_assignments a
     WHERE a.tenant_id = v_tenant AND a.user_id = v_me
       AND a.is_active AND a.scope_type = 'tenant'
  ) AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user_id AND p.tenant_id = v_tenant
  ) THEN
    RETURN TRUE;
  END IF;

  -- (أ) رئاسة مباشرة
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user_id
       AND p.tenant_id = v_tenant
       AND (p.manager_id = v_me OR p.supervisor_id = v_me)
  ) THEN
    RETURN TRUE;
  END IF;

  -- (ب) نطاق قسم مُسنَد لي — مع الصعود في شجرة الأقسام.
  --
  --   ⚠️ ملاحظة بنيوية مُحقَّقة (لا تُغيَّر بلا فحص):
  --   profiles.department نصّ حر (TEXT) لا مفتاح أجنبي، بينما
  --   employees.department_id هو المفتاح الحقيقي إلى departments.
  --   لذا نحلّ القسم بترتيب موثوقية تنازلي:
  --     ١) employees.department_id عبر employees.user_id  ← الأوثق
  --     ٢) مطابقة profiles.department بالاسم              ← احتياطي
  --   المطابقة بالاسم غير حسّاسة لحالة الأحرف ومع تشذيب المسافات.
  SELECT e.department_id INTO v_dept
    FROM public.employees e
   WHERE e.user_id = p_user_id
     AND e.tenant_id = v_tenant
   LIMIT 1;

  IF v_dept IS NULL THEN
    SELECT d.id INTO v_dept
      FROM public.profiles p
      JOIN public.departments d
        ON d.tenant_id = v_tenant
       AND lower(btrim(d.name_ar)) = lower(btrim(p.department))
     WHERE p.id = p_user_id
       AND p.tenant_id = v_tenant
       AND p.department IS NOT NULL
     LIMIT 1;
  END IF;

  WHILE v_dept IS NOT NULL AND v_depth < 20 LOOP
    IF EXISTS (
      SELECT 1 FROM public.portal_unit_assignments a
       WHERE a.tenant_id  = v_tenant
         AND a.user_id    = v_me
         AND a.is_active
         AND a.scope_type = 'department'
         AND a.scope_id   = v_dept
    ) THEN
      RETURN TRUE;
    END IF;

    SELECT d.parent_department_id INTO v_dept
      FROM public.departments d
     WHERE d.id = v_dept AND d.tenant_id = v_tenant;

    v_depth := v_depth + 1;
  END LOOP;

  RETURN FALSE;
END $$;

COMMENT ON FUNCTION public.is_in_my_team(UUID) IS
  'هل المستخدم ضمن فريق المستخدم الحالي؟ رئاسة مباشرة أو نطاق قسم (مع وراثة) أو نطاق مستأجر.';

-- ═══ 6) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.my_portal_units()',
    'public.has_portal_unit(text,text)',
    'public.is_in_my_team(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ═══ 7) ترحيل أثري: مديرو الأقسام الحاليون ══════════════════════════════
-- departments.manager_id يحمل مديري الأقسام فعلاً. نمنحهم وحدة الحركة
-- على نطاق قسمهم حتى لا يبدأ النظام فارغاً. origin='org_sync' يميّزها
-- عن الإسناد اليدوي فيمكن تتبّعها ومراجعتها.
DO $$
DECLARE v_count INT := 0;
BEGIN
  INSERT INTO public.portal_unit_assignments
    (tenant_id, user_id, base_role, unit_key, scope_type, scope_id, is_active, origin, notes)
  SELECT DISTINCT d.tenant_id, d.manager_id, 'manager', 'movement', 'department', d.id, TRUE, 'org_sync',
         'ترحيل أثري 0302 من departments.manager_id'
    FROM public.departments d
    JOIN public.profiles p ON p.id = d.manager_id AND p.tenant_id = d.tenant_id
   WHERE d.manager_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '0302: رُحِّل % مدير قسم إلى وحدة الحركة', v_count;
END $$;

-- ═══ 8) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt  INT;
  v_fn   TEXT;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='portal_unit_assignments'
  ), '0302 failed: table missing';

  ASSERT (
    SELECT rowsecurity FROM pg_tables
     WHERE schemaname='public' AND tablename='portal_unit_assignments'
  ), '0302 failed: RLS not enabled';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='portal_unit_assignments'
  ), '0302 failed: no RLS policy';

  -- لا حِمل زائد على الدوال الثلاث
  FOREACH v_fn IN ARRAY ARRAY['my_portal_units','has_portal_unit','is_in_my_team'] LOOP
    SELECT count(*) INTO v_cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname = v_fn;
    ASSERT v_cnt = 1, format('0302 failed: %s overloads = %s (must be 1)', v_fn, v_cnt);
  END LOOP;

  -- anon لا ينفّذ أياً منها
  FOREACH v_fn IN ARRAY ARRAY[
    'public.my_portal_units()',
    'public.has_portal_unit(text,text)',
    'public.is_in_my_team(uuid)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0302 failed: anon can execute %s', v_fn);
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'),
      format('0302 failed: authenticated cannot execute %s', v_fn);
  END LOOP;

  -- الفهرسان الجزئيان موجودان
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_portal_unit_scoped'),
    '0302 failed: uq_portal_unit_scoped missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_portal_unit_tenant_wide'),
    '0302 failed: uq_portal_unit_tenant_wide missing';

  RAISE NOTICE '✅ 0302: معمارية الوحدات — الأساس مُطبَّق (Scoped Roles)';
END $$;

NOTIFY pgrst, 'reload schema';
