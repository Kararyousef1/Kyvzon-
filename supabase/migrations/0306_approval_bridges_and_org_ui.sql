-- ============================================================================
-- FILE: 0306_approval_bridges_and_org_ui.sql
-- PURPOSE: (أ) إحياء الأنظمة الميتة بجسور إنشاء الطلبات
--          (ب) دوال إدارة الهيكل التنظيمي البشري
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (أ): ثلاثة أنظمة موافقات مبنية ولا تُستخدم
--
--   0305 جعلها **مقروءة** في مركز المدير، لكن فحص INSERT أثبت أن
--   لا أحد يُنشئ فيها طلبات:
--     financial_approval_requests → صفر مصادر إنشاء
--     mrp_bom_approvals           → صفر مصادر إنشاء
--     approval_requests           → صفر مصادر إنشاء
--
--   والسبب البنيوي: الدوال القائمة تعمل بلا موافقة أصلاً.
--     submit_journal_entry     يضع status='submitted' وينتهي
--     approve_mrp_bom_version  يعتمد مباشرة بلا سلسلة
--
--   فالنتيجة: مركز المدير لن يرى منها شيئاً أبداً مهما استُخدمت
--   البوابتان. الجداول ديكور.
--
-- الحل: جسور تُنشئ الطلب عند التقديم — بلا تعديل الدوال القائمة.
--   نضيف دوال create_*_approval يستدعيها الـSDK بعد التقديم، وتُحقن
--   لاحقاً داخل الدوال الأصلية عند تحويل البوابات.
--
--   لماذا لا نعدّل submit_journal_entry مباشرة؟ لأنها في مسار حرج
--   بالإنتاج (قيود محاسبية)، وتغييرها يحتاج اختباراً منفصلاً لبوابة
--   المالية كاملة. الجسر يسمح بالتبنّي التدريجي بلا كسر.
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (ب): org_structure_overview جاهزة بلا واجهة
--
--   0304 بنى الدالة، لكن OrgStructurePage ما زالت تكتب في الأعمدة
--   الأربعة مباشرة عبر departmentService.assignRoles. نحتاج دوال
--   إسناد تكتب في الجدول الجديد ليصير هو مصدر الحقيقة.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
--  الجزء (أ): جسور إنشاء الطلبات
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1) جسر المالية ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_financial_approval(
  p_request_type TEXT,
  p_reference_id UUID
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
  v_exists UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_request_type NOT IN ('journal_entry','invoice','expense','budget','tax_filing') THEN
    RAISE EXCEPTION 'INVALID_REQUEST_TYPE (%)', p_request_type;
  END IF;

  -- منع الازدواج: طلب معلَّق واحد لكل مرجع
  SELECT id INTO v_exists
    FROM public.financial_approval_requests
   WHERE tenant_id = v_tenant
     AND reference_id = p_reference_id
     AND status = 'pending'
   LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN v_exists;
  END IF;

  INSERT INTO public.financial_approval_requests
    (tenant_id, request_type, reference_id, requested_by, status, current_step, total_steps)
  VALUES (v_tenant, p_request_type, p_reference_id, auth.uid(), 'pending', 1, 1)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_financial_approval(TEXT, UUID) IS
  'ينشئ طلب موافقة مالية فيظهر في مركز المدير. آمن للتكرار — يعيد الطلب المعلَّق إن وُجد.';

-- ─── 2) جسر التصنيع (BOM) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_mrp_bom_approval(
  p_bom_version_id UUID,
  p_approver_role  TEXT DEFAULT 'production_manager'
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
  v_exists UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_approver_role NOT IN
     ('bom_engineer','production_manager','quality_inspector','cost_accountant','admin') THEN
    RAISE EXCEPTION 'INVALID_APPROVER_ROLE (%)', p_approver_role;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mrp_bom_versions
     WHERE id = p_bom_version_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'BOM_VERSION_NOT_FOUND';
  END IF;

  SELECT id INTO v_exists
    FROM public.mrp_bom_approvals
   WHERE tenant_id = v_tenant
     AND bom_version_id = p_bom_version_id
     AND decision = 'pending'
   LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN v_exists;
  END IF;

  INSERT INTO public.mrp_bom_approvals
    (tenant_id, bom_version_id, approver_role, decision)
  VALUES (v_tenant, p_bom_version_id, p_approver_role, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_mrp_bom_approval(UUID, TEXT) IS
  'ينشئ طلب اعتماد قائمة مواد فيظهر في مركز المدير. آمن للتكرار.';

-- ─── 3) جسر عام — لأي بوابة بلا نظام موافقات خاص ───────────────────────
CREATE OR REPLACE FUNCTION public.create_general_approval(
  p_request_type TEXT,
  p_title        TEXT,
  p_related_table TEXT DEFAULT NULL,
  p_related_id    UUID DEFAULT NULL,
  p_description   TEXT DEFAULT NULL,
  p_priority      TEXT DEFAULT 'normal'
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
  v_name   TEXT;
  v_dept   UUID;
  v_appr   UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_request_type NOT IN
     ('leave','expense','loan','attendance_correction','movement_permit','goal','other') THEN
    RAISE EXCEPTION 'INVALID_REQUEST_TYPE (%)', p_request_type;
  END IF;

  IF p_priority NOT IN ('low','normal','urgent') THEN
    RAISE EXCEPTION 'INVALID_PRIORITY (%)', p_priority;
  END IF;

  IF COALESCE(btrim(p_title),'') = '' THEN
    RAISE EXCEPTION 'TITLE_REQUIRED';
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'موظف') INTO v_name
    FROM public.profiles p WHERE p.id = auth.uid();

  -- قسم مقدّم الطلب — لحلّ المعتمِد من السلسلة التنظيمية
  SELECT e.department_id INTO v_dept
    FROM public.employees e
   WHERE e.user_id = auth.uid() AND e.tenant_id = v_tenant
   LIMIT 1;

  IF v_dept IS NULL THEN
    SELECT d.id INTO v_dept
      FROM public.profiles p
      JOIN public.departments d
        ON d.tenant_id = v_tenant
       AND lower(btrim(d.name_ar)) = lower(btrim(p.department))
     WHERE p.id = auth.uid()
     LIMIT 1;
  END IF;

  -- المعتمِد: أول مدير في سلسلة القسم
  IF v_dept IS NOT NULL THEN
    SELECT oc.out_user_id INTO v_appr
      FROM public.resolve_org_chain(v_dept) oc
     WHERE oc.out_org_role = 'manager'
     LIMIT 1;
  END IF;

  INSERT INTO public.approval_requests
    (tenant_id, requester_id, requester_name, current_approver_id,
     request_type, title, description, related_table, related_id, priority, status)
  VALUES
    (v_tenant, auth.uid(), v_name, v_appr,
     p_request_type, btrim(p_title), p_description, p_related_table, p_related_id,
     p_priority, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_general_approval(TEXT,TEXT,TEXT,UUID,TEXT,TEXT) IS
  'طلب موافقة عام لأي بوابة بلا نظام خاص. يحلّ المعتمِد من السلسلة التنظيمية.';

-- ═══════════════════════════════════════════════════════════════════════
--  الجزء (ب): إدارة الهيكل التنظيمي
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 4) إسناد دور تنظيمي ───────────────────────────────────────────────
-- يكتب في org_role_assignments (مصدر الحقيقة الجديد) ويُزامن العمود
-- القديم للتوافق الخلفي — عكس اتجاه محفّز 0304، لكن بلا حلقة لأن
-- المحفّز يعمل على UPDATE OF الأعمدة وهذه الدالة تكتبها مرة واحدة.
CREATE OR REPLACE FUNCTION public.assign_org_role(
  p_department_id UUID,
  p_org_role      TEXT,
  p_user_id       UUID,
  p_unit_key      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- إدارة الهيكل عملية إدارية
  IF public.current_user_role() NOT IN ('admin','developer','it_admin','hr') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_MANAGE_ORG';
  END IF;

  IF p_org_role NOT IN ('supervisor','manager','direct_manager','unit_manager') THEN
    RAISE EXCEPTION 'INVALID_ORG_ROLE (%)', p_org_role;
  END IF;

  IF (p_org_role = 'unit_manager') <> (p_unit_key IS NOT NULL) THEN
    RAISE EXCEPTION 'UNIT_KEY_COHERENCE (unit_manager يلزمه unit_key والعكس)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.departments
     WHERE id = p_department_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND';
  END IF;

  -- p_user_id = NULL يعني نزع الدور (تعطيل لا حذف)
  IF p_user_id IS NULL THEN
    UPDATE public.org_role_assignments
       SET is_active = FALSE, updated_at = NOW()
     WHERE tenant_id = v_tenant
       AND department_id = p_department_id
       AND org_role = p_org_role
       AND unit_key IS NOT DISTINCT FROM p_unit_key;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = p_user_id AND tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'USER_NOT_IN_TENANT';
    END IF;

    INSERT INTO public.org_role_assignments
      (tenant_id, department_id, user_id, org_role, unit_key, is_active, origin, assigned_by)
    VALUES
      (v_tenant, p_department_id, p_user_id, p_org_role, p_unit_key, TRUE, 'manual', auth.uid())
    ON CONFLICT DO NOTHING;

    UPDATE public.org_role_assignments
       SET user_id = p_user_id, is_active = TRUE, assigned_by = auth.uid(), updated_at = NOW()
     WHERE tenant_id = v_tenant
       AND department_id = p_department_id
       AND org_role = p_org_role
       AND unit_key IS NOT DISTINCT FROM p_unit_key;
  END IF;

  -- مزامنة العمود القديم للتوافق (0153 و 0182 يقرآنه)
  IF p_org_role = 'manager' THEN
    UPDATE public.departments SET manager_id = p_user_id
     WHERE id = p_department_id AND tenant_id = v_tenant;
  ELSIF p_org_role = 'supervisor' THEN
    UPDATE public.departments SET supervisor_id = p_user_id
     WHERE id = p_department_id AND tenant_id = v_tenant;
  ELSIF p_org_role = 'direct_manager' THEN
    UPDATE public.departments SET direct_manager_id = p_user_id
     WHERE id = p_department_id AND tenant_id = v_tenant;
  ELSIF p_org_role = 'unit_manager' AND p_unit_key = 'procurement' THEN
    UPDATE public.departments SET procurement_manager_id = p_user_id
     WHERE id = p_department_id AND tenant_id = v_tenant;
  END IF;
END $$;

COMMENT ON FUNCTION public.assign_org_role(UUID,TEXT,UUID,TEXT) IS
  'إسناد/نزع دور تنظيمي. يكتب في org_role_assignments ويُزامن العمود القديم للتوافق.';

-- ─── 5) الصلاحيات ──────────────────────────────────────────────────────
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_financial_approval(text,uuid)',
    'public.create_mrp_bom_approval(uuid,text)',
    'public.create_general_approval(text,text,text,uuid,text,text)',
    'public.assign_org_role(uuid,text,uuid,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ─── 6) حرّاس التحقق ───────────────────────────────────────────────────
DO $$
DECLARE
  v_fn  TEXT;
  v_cnt INT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'create_financial_approval','create_mrp_bom_approval',
    'create_general_approval','assign_org_role'
  ] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_cnt = 1, format('0306 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_financial_approval(text,uuid)',
    'public.create_mrp_bom_approval(uuid,text)',
    'public.create_general_approval(text,text,text,uuid,text,text)',
    'public.assign_org_role(uuid,text,uuid,text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0306 failed: anon can execute %s', v_fn);
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'),
      format('0306 failed: authenticated cannot execute %s', v_fn);
  END LOOP;

  -- الدوال القائمة لم تُمسّ
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='submit_journal_entry'
  ), '0306 failed: submit_journal_entry must remain intact';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='approve_mrp_bom_version'
  ), '0306 failed: approve_mrp_bom_version must remain intact';

  RAISE NOTICE '✅ 0306: جسور الموافقات الثلاثة + إدارة الهيكل التنظيمي';
END $$;

NOTIFY pgrst, 'reload schema';
