-- ============================================================================
-- FILE: 0304_org_role_assignments.sql
-- PURPOSE: الهيكل التنظيمي الموحّد — إنهاء تكاثر أعمدة X_manager_id
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة المعمارية:
--
--   جدول departments يحمل اليوم أربعة أعمدة للأدوار:
--     manager_id (0001) · supervisor_id (0025/0152)
--     · direct_manager_id (0152) · procurement_manager_id (0182)
--
--   العمود الرابع هو الدليل الحاسم على انكسار النهج: بوابة المشتريات
--   احتاجت «مدير مشتريات لهذا القسم» فأُضيف لها عمود خاص. ولو تابعنا
--   لصار في الجدول: movement_manager_id · inventory_manager_id
--   · mrp_manager_id · finance_manager_id · hr_manager_id …
--   أي عمود جديد مع كل بوابة، ومايجريشن مع كل عمود.
--
-- الحل: صفوف بدل أعمدة.
--   org_role_assignments (department_id, org_role, unit_key, user_id)
--   إضافة دور جديد = صف، لا ALTER TABLE.
--
-- ─────────────────────────────────────────────────────────────────────────
-- التوافق الخلفي مطلق:
--   ❌ لا نحذف أي عمود من departments
--   ❌ لا نلمس resolve_department_chain (0153) — بوابة HR تعتمدها
--   ✅ نرحّل الأعمدة الأربعة نسخاً لا نقلاً
--   ✅ محفّز ثنائي الاتجاه يبقيهما متطابقين حتى يُهجَر القديم
--
--   السبب: 0153 و 0182 يقرآن الأعمدة مباشرة، وإسقاطها الآن يكسر
--   سلاسل اعتماد HR والمشتريات في الإنتاج فوراً.
-- ============================================================================

-- ═══ 1) الجدول ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.org_role_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- الدور التنظيمي داخل القسم
  org_role      VARCHAR(30) NOT NULL
    CHECK (org_role IN ('supervisor', 'manager', 'direct_manager', 'unit_manager')),

  -- unit_key إلزامي مع unit_manager فقط (مدير المشتريات · مدير الحركة …)
  -- يطابق ModuleKey و قيد portal_unit_assignments في 0302
  unit_key      VARCHAR(30)
    CHECK (unit_key IS NULL OR unit_key IN (
      'movement', 'hr', 'finance', 'procurement', 'inventory',
      'mrp', 'contracts', 'crm', 'health_safety'
    )),

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  origin        VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'column_sync')),
  assigned_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT org_role_unit_coherence CHECK (
    (org_role =  'unit_manager' AND unit_key IS NOT NULL) OR
    (org_role <> 'unit_manager' AND unit_key IS NULL)
  )
);

-- فهرسان جزئيان: UNIQUE العادي يعامل NULL كقيمة مميزة فيسمح بتكرار
-- صفوف الأدوار الهرمية (unit_key = NULL) لنفس القسم.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_role_hierarchical
  ON public.org_role_assignments (tenant_id, department_id, org_role)
  WHERE unit_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_role_unit
  ON public.org_role_assignments (tenant_id, department_id, org_role, unit_key)
  WHERE unit_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_role_dept
  ON public.org_role_assignments (tenant_id, department_id, is_active);

CREATE INDEX IF NOT EXISTS idx_org_role_user
  ON public.org_role_assignments (tenant_id, user_id, is_active);

COMMENT ON TABLE public.org_role_assignments IS
  'الأدوار التنظيمية للأقسام كصفوف بدل أعمدة. يُنهي تكاثر X_manager_id في departments.';

COMMENT ON COLUMN public.org_role_assignments.unit_key IS
  'إلزامي مع unit_manager فقط — مدير وحدة بعينها في هذا القسم (بديل procurement_manager_id).';

DROP TRIGGER IF EXISTS trg_org_role_assignments_updated ON public.org_role_assignments;
CREATE TRIGGER trg_org_role_assignments_updated
  BEFORE UPDATE ON public.org_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ═══ 2) RLS ═════════════════════════════════════════════════════════════
ALTER TABLE public.org_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_org_role_assignments_all ON public.org_role_assignments;
CREATE POLICY kyvzon_org_role_assignments_all ON public.org_role_assignments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- ═══ 3) الترحيل الأثري: الأعمدة الأربعة → صفوف ══════════════════════════
DO $$
DECLARE
  v_total INT := 0;
  v_n     INT;
BEGIN
  -- (أ) الأدوار الهرمية الثلاثة
  INSERT INTO public.org_role_assignments
    (tenant_id, department_id, user_id, org_role, unit_key, is_active, origin, notes)
  SELECT d.tenant_id, d.id, d.manager_id, 'manager', NULL, TRUE, 'column_sync',
         'ترحيل 0304 من departments.manager_id'
    FROM public.departments d
    JOIN public.profiles p ON p.id = d.manager_id AND p.tenant_id = d.tenant_id
   WHERE d.manager_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  INSERT INTO public.org_role_assignments
    (tenant_id, department_id, user_id, org_role, unit_key, is_active, origin, notes)
  SELECT d.tenant_id, d.id, d.supervisor_id, 'supervisor', NULL, TRUE, 'column_sync',
         'ترحيل 0304 من departments.supervisor_id'
    FROM public.departments d
    JOIN public.profiles p ON p.id = d.supervisor_id AND p.tenant_id = d.tenant_id
   WHERE d.supervisor_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  INSERT INTO public.org_role_assignments
    (tenant_id, department_id, user_id, org_role, unit_key, is_active, origin, notes)
  SELECT d.tenant_id, d.id, d.direct_manager_id, 'direct_manager', NULL, TRUE, 'column_sync',
         'ترحيل 0304 من departments.direct_manager_id'
    FROM public.departments d
    JOIN public.profiles p ON p.id = d.direct_manager_id AND p.tenant_id = d.tenant_id
   WHERE d.direct_manager_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- (ب) العمود الخاص بالمشتريات → unit_manager مع unit_key
  INSERT INTO public.org_role_assignments
    (tenant_id, department_id, user_id, org_role, unit_key, is_active, origin, notes)
  SELECT d.tenant_id, d.id, d.procurement_manager_id, 'unit_manager', 'procurement', TRUE, 'column_sync',
         'ترحيل 0304 من departments.procurement_manager_id'
    FROM public.departments d
    JOIN public.profiles p ON p.id = d.procurement_manager_id AND p.tenant_id = d.tenant_id
   WHERE d.procurement_manager_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RAISE NOTICE '0304: رُحِّل % إسناداً تنظيمياً من الأعمدة الأربعة', v_total;
END $$;

-- ═══ 4) مزامنة حيّة: عمود ← صف ══════════════════════════════════════════
-- بوابتا HR والمشتريات تكتبان في الأعمدة مباشرة (0153/0182 وشاشة
-- الهيكل). المحفّز يبقي الجدول الجديد متطابقاً حتى تُحوَّل القراءة كلها.
-- اتجاه واحد فقط (عمود ← صف): المزامنة العكسية تُنشئ حلقة محفّزات.
CREATE OR REPLACE FUNCTION public.tg_sync_department_org_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairs  TEXT[][] := ARRAY[
    ARRAY['manager',        'manager_id',              NULL],
    ARRAY['supervisor',     'supervisor_id',           NULL],
    ARRAY['direct_manager', 'direct_manager_id',       NULL],
    ARRAY['unit_manager',   'procurement_manager_id',  'procurement']
  ];
  v_role   TEXT;
  v_unit   TEXT;
  v_new_id UUID;
  i        INT;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR i IN 1..array_length(v_pairs, 1) LOOP
    v_role := v_pairs[i][1];
    v_unit := v_pairs[i][3];

    v_new_id := CASE v_pairs[i][2]
      WHEN 'manager_id'             THEN NEW.manager_id
      WHEN 'supervisor_id'          THEN NEW.supervisor_id
      WHEN 'direct_manager_id'      THEN NEW.direct_manager_id
      WHEN 'procurement_manager_id' THEN NEW.procurement_manager_id
    END;

    -- تعطيل ما اشتُقّ سابقاً ولم يعد مطابقاً — لا حذف
    UPDATE public.org_role_assignments a
       SET is_active = FALSE, updated_at = NOW()
     WHERE a.tenant_id     = NEW.tenant_id
       AND a.department_id = NEW.id
       AND a.org_role      = v_role
       AND a.origin        = 'column_sync'
       AND a.is_active
       AND (v_unit IS NULL AND a.unit_key IS NULL OR a.unit_key IS NOT DISTINCT FROM v_unit)
       AND (v_new_id IS NULL OR a.user_id <> v_new_id);

    IF v_new_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = v_new_id AND p.tenant_id = NEW.tenant_id) THEN
      INSERT INTO public.org_role_assignments
        (tenant_id, department_id, user_id, org_role, unit_key, is_active, origin, notes)
      VALUES
        (NEW.tenant_id, NEW.id, v_new_id, v_role, v_unit, TRUE, 'column_sync',
         'مزامنة تلقائية من departments')
      ON CONFLICT DO NOTHING;

      -- إن وُجد الصف معطَّلاً أو بمستخدم مختلف، نُحدّثه
      UPDATE public.org_role_assignments a
         SET user_id = v_new_id, is_active = TRUE, updated_at = NOW()
       WHERE a.tenant_id     = NEW.tenant_id
         AND a.department_id = NEW.id
         AND a.org_role      = v_role
         AND a.unit_key IS NOT DISTINCT FROM v_unit
         AND a.origin        = 'column_sync';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_sync_department_org_roles() IS
  'يزامن أعمدة departments الأربعة إلى org_role_assignments. اتجاه واحد لتفادي حلقة المحفّزات.';

DROP TRIGGER IF EXISTS trg_sync_department_org_roles ON public.departments;
CREATE TRIGGER trg_sync_department_org_roles
  AFTER INSERT OR UPDATE OF manager_id, supervisor_id, direct_manager_id, procurement_manager_id
  ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_department_org_roles();

-- ═══ 5) حلّ السلسلة التنظيمية — تعميم resolve_department_chain ══════════
-- الفروق عن 0153:
--   • يقرأ org_role_assignments لا الأعمدة
--   • يدعم unit_manager (مدير وحدة بعينها)
--   • يُرجع مصدر كل دور (مباشر أم موروث) للتشخيص
CREATE OR REPLACE FUNCTION public.resolve_org_chain(
  p_department_id UUID,
  p_unit_key      TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_org_role     TEXT,
  out_user_id      UUID,
  out_source_dept  UUID,
  out_inherited    BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_node   UUID := p_department_id;
  v_depth  INT  := 0;
  v_found  TEXT[] := ARRAY[]::TEXT[];
  r        RECORD;
BEGIN
  IF v_tenant IS NULL OR p_department_id IS NULL THEN
    RETURN;
  END IF;

  WHILE v_node IS NOT NULL AND v_depth < 20 LOOP
    FOR r IN
      SELECT a.org_role, a.user_id, a.unit_key
        FROM public.org_role_assignments a
       WHERE a.tenant_id     = v_tenant
         AND a.department_id = v_node
         AND a.is_active
         AND (
           -- الأدوار الهرمية دائماً
           a.unit_key IS NULL
           -- ومدير الوحدة إن طُلبت وحدة بعينها
           OR (p_unit_key IS NOT NULL AND a.unit_key = p_unit_key)
         )
    LOOP
      -- المشرف خاص بالقسم نفسه ولا يُورَث (مطابقةً لمنطق 0153)
      IF r.org_role = 'supervisor' AND v_depth > 0 THEN
        CONTINUE;
      END IF;

      -- أول قيمة تفوز؛ لا نستبدلها بالموروث من الأعلى
      IF r.org_role = ANY (v_found) THEN
        CONTINUE;
      END IF;

      v_found         := array_append(v_found, r.org_role);
      out_org_role    := r.org_role;
      out_user_id     := r.user_id;
      out_source_dept := v_node;
      out_inherited   := (v_depth > 0);
      RETURN NEXT;
    END LOOP;

    SELECT d.parent_department_id INTO v_node
      FROM public.departments d
     WHERE d.id = v_node AND d.tenant_id = v_tenant;

    v_depth := v_depth + 1;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.resolve_org_chain(UUID, TEXT) IS
  'سلسلة الاعتماد لقسم: المشرف من القسم نفسه، والمدراء موروثون من الأب. يدعم مدير الوحدة.';

-- ═══ 6) الهيكل البشري — من يرأس من ══════════════════════════════════════
-- OrgStructurePage تعرض الأقسام بلا أشخاص. هذه الدالة تعطي الصورة
-- الكاملة: القسم · أدواره · شاغلوها · عدد موظفيه.
CREATE OR REPLACE FUNCTION public.org_structure_overview()
RETURNS TABLE (
  out_department_id   UUID,
  out_department_name TEXT,
  out_parent_id       UUID,
  out_org_role        TEXT,
  out_unit_key        TEXT,
  out_user_id         UUID,
  out_user_name       TEXT,
  out_employee_count  INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id,
         d.name_ar::TEXT,
         d.parent_department_id,
         a.org_role::TEXT,
         a.unit_key::TEXT,
         a.user_id,
         COALESCE(p.full_name, p.email, '—')::TEXT,
         (SELECT count(*)::INTEGER FROM public.employees e
           WHERE e.department_id = d.id AND e.tenant_id = d.tenant_id)
    FROM public.departments d
    LEFT JOIN public.org_role_assignments a
      ON a.department_id = d.id AND a.tenant_id = d.tenant_id AND a.is_active
    LEFT JOIN public.profiles p ON p.id = a.user_id
   WHERE d.tenant_id = public.current_user_tenant_id()
     AND COALESCE(d.is_active, TRUE)
   ORDER BY d.name_ar, a.org_role NULLS FIRST;
$$;

COMMENT ON FUNCTION public.org_structure_overview() IS
  'الهيكل التنظيمي كاملاً: الأقسام وأدوارها وشاغليها وعدد موظفيها.';

-- ═══ 7) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.resolve_org_chain(uuid,text)',
    'public.org_structure_overview()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ═══ 8) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_cols  INT;
  v_rows  INT;
  v_fn    TEXT;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='org_role_assignments'
  ), '0304 failed: table missing';

  ASSERT (SELECT rowsecurity FROM pg_tables
           WHERE schemaname='public' AND tablename='org_role_assignments'),
    '0304 failed: RLS not enabled';

  -- الأعمدة الأربعة لم تُحذف (توافق خلفي)
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='departments'
     AND column_name IN ('manager_id','supervisor_id','direct_manager_id','procurement_manager_id');
  ASSERT v_cols = 4, format('0304 failed: departments columns = %s (must stay 4)', v_cols);

  -- resolve_department_chain لم تُمسّ (0153 تعتمدها)
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='resolve_department_chain'
  ), '0304 failed: resolve_department_chain must remain intact';

  -- مطابقة الترحيل: كل عمود غير فارغ له صف
  SELECT count(*) INTO v_cnt
    FROM public.departments d
    JOIN public.profiles p ON p.id = d.manager_id AND p.tenant_id = d.tenant_id
   WHERE d.manager_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.org_role_assignments a
        WHERE a.department_id = d.id AND a.org_role='manager' AND a.is_active
     );
  ASSERT v_cnt = 0, format('0304 failed: %s manager_id not migrated', v_cnt);

  SELECT count(*) INTO v_cnt
    FROM public.departments d
    JOIN public.profiles p ON p.id = d.procurement_manager_id AND p.tenant_id = d.tenant_id
   WHERE d.procurement_manager_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.org_role_assignments a
        WHERE a.department_id = d.id AND a.org_role='unit_manager'
          AND a.unit_key='procurement' AND a.is_active
     );
  ASSERT v_cnt = 0, format('0304 failed: %s procurement_manager_id not migrated', v_cnt);

  -- المحفّز مُثبَّت
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname='trg_sync_department_org_roles'
       AND tgrelid='public.departments'::regclass
  ), '0304 failed: sync trigger missing';

  -- لا حِمل زائد
  FOREACH v_fn IN ARRAY ARRAY['resolve_org_chain','org_structure_overview','tg_sync_department_org_roles'] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_cnt = 1, format('0304 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  -- anon محروم
  FOREACH v_fn IN ARRAY ARRAY[
    'public.resolve_org_chain(uuid,text)',
    'public.org_structure_overview()'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0304 failed: anon can execute %s', v_fn);
  END LOOP;

  SELECT count(*) INTO v_rows FROM public.org_role_assignments;
  RAISE NOTICE '✅ 0304: الهيكل التنظيمي الموحّد — % صفاً · الأعمدة الأربعة سليمة', v_rows;
END $$;

NOTIFY pgrst, 'reload schema';
