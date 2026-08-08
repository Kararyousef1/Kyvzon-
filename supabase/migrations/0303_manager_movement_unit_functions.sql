-- ============================================================================
-- FILE: 0303_manager_movement_unit_functions.sql
-- PURPOSE: وحدة «الحركة» داخل بوابة المدير — دوال منظور الفريق
--
-- ─────────────────────────────────────────────────────────────────────────
-- المبدأ الحاكم: الوحدة **منظور** لا نسخة.
--
--   لا ننسخ صفحات بوابة الحركة الـ22 داخل بوابة المدير. نبني منظوراً
--   واحداً يجيب سؤال المدير: «ما الذي يخصّ فريقي في الحركة؟»
--
--   مصدر البيانات نفسه (employee_movement_permits · employee_movements_log
--   · employee_movement_violations)، والفلترة وحدها تختلف: is_in_my_team.
--
-- الحماية بطبقتين:
--   ① has_portal_unit('manager','movement') — هل له الوحدة أصلاً؟
--   ② is_in_my_team(employee_id)            — هل هذا الشخص من فريقه؟
--   بلا الثانية يصير «مدير الوحدة» مديراً على كل الشركة.
-- ============================================================================

-- ═══ 1) حارس الوحدة ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.require_portal_unit(
  p_base_role TEXT,
  p_unit_key  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH';
  END IF;
  IF public.current_user_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'NO_TENANT';
  END IF;

  -- أدوار المنصة تمر للتشخيص والدعم (نفس منطق movement_require_role)
  IF public.current_user_role() IN ('admin', 'developer', 'it_admin') THEN
    RETURN;
  END IF;

  IF NOT public.has_portal_unit(p_base_role, p_unit_key) THEN
    RAISE EXCEPTION 'NOT_ASSIGNED_TO_UNIT (%/%)', p_base_role, p_unit_key;
  END IF;
END $$;

COMMENT ON FUNCTION public.require_portal_unit(TEXT, TEXT) IS
  'حارس وحدة المدير/المشرف. يرفع NOT_ASSIGNED_TO_UNIT لغير المُسنَدين.';

-- ═══ 2) تصاريح الفريق المعلَّقة ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.manager_movement_pending_permits()
RETURNS TABLE (
  out_permit_id        UUID,
  out_employee_id      UUID,
  out_employee_name    TEXT,
  out_destination_name TEXT,
  out_purpose          TEXT,
  out_valid_from       TIMESTAMPTZ,
  out_valid_until      TIMESTAMPTZ,
  out_max_minutes      INTEGER,
  out_status           TEXT,
  out_created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_portal_unit('manager', 'movement');

  RETURN QUERY
  SELECT p.id,
         p.employee_id,
         COALESCE(pr.full_name, pr.email, 'موظف')::TEXT,
         p.destination_name::TEXT,
         p.purpose::TEXT,
         p.valid_from,
         p.valid_until,
         p.max_duration_minutes,
         p.status::TEXT,
         p.created_at
    FROM public.employee_movement_permits p
    LEFT JOIN public.profiles pr ON pr.id = p.employee_id
   WHERE p.tenant_id = public.current_user_tenant_id()
     AND p.status = 'pending'
     AND public.is_in_my_team(p.employee_id)
   ORDER BY p.created_at ASC;
END $$;

COMMENT ON FUNCTION public.manager_movement_pending_permits() IS
  'تصاريح الخروج المعلَّقة لفريق المدير وحده. طبقتا حماية: وحدة + فريق.';

-- ═══ 3) قرار المدير على تصريح ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.manager_movement_decide_permit(
  p_permit_id UUID,
  p_decision  TEXT,
  p_comments  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee UUID;
  v_status   TEXT;
  v_tenant   UUID := public.current_user_tenant_id();
BEGIN
  PERFORM public.require_portal_unit('manager', 'movement');

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION (%)', p_decision;
  END IF;

  SELECT p.employee_id, p.status INTO v_employee, v_status
    FROM public.employee_movement_permits p
   WHERE p.id = p_permit_id AND p.tenant_id = v_tenant;

  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'PERMIT_NOT_FOUND';
  END IF;

  -- الحارس الحاسم: لا يقرّر إلا على فريقه
  IF NOT public.is_in_my_team(v_employee) THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_IN_MY_TEAM';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'PERMIT_NOT_PENDING (%)', v_status;
  END IF;

  UPDATE public.employee_movement_permits
     SET status      = p_decision,
         approved_by = auth.uid(),
         notes       = COALESCE(NULLIF(btrim(p_comments), ''), notes),
         updated_at  = NOW()
   WHERE id = p_permit_id;

  -- أثر القرار في سجل موافقات الحركة القائم
  INSERT INTO public.employee_movement_approvals
    (tenant_id, permit_id, step_order, approver_id, decision, decided_at, comments)
  VALUES
    (v_tenant, p_permit_id, 1, auth.uid(), p_decision, NOW(), p_comments);
END $$;

COMMENT ON FUNCTION public.manager_movement_decide_permit(UUID, TEXT, TEXT) IS
  'اعتماد/رفض تصريح خروج لموظف من فريق المدير. يسجّل الأثر في employee_movement_approvals.';

-- ═══ 4) حركة الفريق ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.manager_movement_team_log(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  out_log_id          UUID,
  out_employee_id     UUID,
  out_employee_name   TEXT,
  out_destination     TEXT,
  out_departure_at    TIMESTAMPTZ,
  out_expected_return TIMESTAMPTZ,
  out_actual_return   TIMESTAMPTZ,
  out_status          TEXT,
  out_overdue_minutes INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_portal_unit('manager', 'movement');

  RETURN QUERY
  SELECT m.id,
         m.employee_id,
         COALESCE(pr.full_name, pr.email, 'موظف')::TEXT,
         m.destination_name::TEXT,
         m.departure_at,
         m.expected_return_at,
         m.returned_at,
         m.status::TEXT,
         CASE
           WHEN m.returned_at IS NOT NULL AND m.returned_at > m.expected_return_at
             THEN CEIL(EXTRACT(EPOCH FROM (m.returned_at - m.expected_return_at)) / 60)::INTEGER
           WHEN m.returned_at IS NULL AND NOW() > m.expected_return_at
             THEN CEIL(EXTRACT(EPOCH FROM (NOW() - m.expected_return_at)) / 60)::INTEGER
           ELSE 0
         END
    FROM public.employee_movements_log m
    LEFT JOIN public.profiles pr ON pr.id = m.employee_id
   WHERE m.tenant_id = public.current_user_tenant_id()
     AND m.departure_at >= NOW() - make_interval(days => GREATEST(p_days, 1))
     AND public.is_in_my_team(m.employee_id)
   ORDER BY m.departure_at DESC;
END $$;

COMMENT ON FUNCTION public.manager_movement_team_log(INTEGER) IS
  'حركة فريق المدير خلال مدة. يحسب دقائق التأخير للعائد والمتأخر معاً.';

-- ═══ 5) مؤشرات الفريق ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.manager_movement_team_kpis(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  out_team_size        INTEGER,
  out_pending_permits  INTEGER,
  out_currently_out    INTEGER,
  out_overdue_now      INTEGER,
  out_movements_period INTEGER,
  out_violations_period INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_since  TIMESTAMPTZ := NOW() - make_interval(days => GREATEST(p_days, 1));
BEGIN
  PERFORM public.require_portal_unit('manager', 'movement');

  RETURN QUERY
  SELECT
    (SELECT count(*)::INTEGER FROM public.profiles pr
      WHERE pr.tenant_id = v_tenant AND public.is_in_my_team(pr.id) AND pr.id <> auth.uid()),
    (SELECT count(*)::INTEGER FROM public.employee_movement_permits p
      WHERE p.tenant_id = v_tenant AND p.status = 'pending' AND public.is_in_my_team(p.employee_id)),
    (SELECT count(*)::INTEGER FROM public.employee_movements_log m
      WHERE m.tenant_id = v_tenant AND m.status = 'out' AND public.is_in_my_team(m.employee_id)),
    (SELECT count(*)::INTEGER FROM public.employee_movements_log m
      WHERE m.tenant_id = v_tenant AND m.returned_at IS NULL
        AND m.expected_return_at < NOW() AND public.is_in_my_team(m.employee_id)),
    (SELECT count(*)::INTEGER FROM public.employee_movements_log m
      WHERE m.tenant_id = v_tenant AND m.departure_at >= v_since AND public.is_in_my_team(m.employee_id)),
    (SELECT count(*)::INTEGER FROM public.employee_movement_violations v
      WHERE v.tenant_id = v_tenant AND v.created_at >= v_since AND public.is_in_my_team(v.employee_id));
END $$;

COMMENT ON FUNCTION public.manager_movement_team_kpis(INTEGER) IS
  'مؤشرات حركة فريق المدير: الحجم · المعلَّق · بالخارج · المتأخر · الحركات · المخالفات.';

-- ═══ 6) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.require_portal_unit(text,text)',
    'public.manager_movement_pending_permits()',
    'public.manager_movement_decide_permit(uuid,text,text)',
    'public.manager_movement_team_log(integer)',
    'public.manager_movement_team_kpis(integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ═══ 7) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn  TEXT;
  v_cnt INT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'require_portal_unit','manager_movement_pending_permits',
    'manager_movement_decide_permit','manager_movement_team_log',
    'manager_movement_team_kpis'
  ] LOOP
    SELECT count(*) INTO v_cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    ASSERT v_cnt = 1, format('0303 failed: %s overloads = %s (must be 1)', v_fn, v_cnt);
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.require_portal_unit(text,text)',
    'public.manager_movement_pending_permits()',
    'public.manager_movement_decide_permit(uuid,text,text)',
    'public.manager_movement_team_log(integer)',
    'public.manager_movement_team_kpis(integer)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0303 failed: anon can execute %s', v_fn);
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'),
      format('0303 failed: authenticated cannot execute %s', v_fn);
  END LOOP;

  RAISE NOTICE '✅ 0303: وحدة الحركة للمدير — منظور الفريق جاهز';
END $$;

NOTIFY pgrst, 'reload schema';
