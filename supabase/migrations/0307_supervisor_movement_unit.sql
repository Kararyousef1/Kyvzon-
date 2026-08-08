-- ============================================================================
-- FILE: 0307_supervisor_movement_unit.sql
-- PURPOSE: وحدة «الحركة» في بوابة المشرف — منظور الوردية
--
-- ─────────────────────────────────────────────────────────────────────────
-- الفرق الجوهري عن وحدة المدير (0303):
--
--   المدير  → يعتمد التصاريح ويرى تقارير الفريق كاملة
--   المشرف  → يتابع التنفيذ اليومي **ولا يعتمد نهائياً**
--
--   هذا ليس تقييداً تقنياً بل انعكاس للواقع التنظيمي: المشرف مسؤول عن
--   من هو خارج الموقع الآن ومن تأخّر، لا عن الإذن بالخروج. الإذن قرار
--   إداري يخصّ المدير.
--
--   ولذلك: لا دالة قرار هنا إطلاقاً. المشرف يرى ويُبلّغ فقط.
--
-- الحماية: require_portal_unit('supervisor','movement') + is_in_my_team.
--   لاحظ أن has_portal_unit يمرّر المدير أيضاً (المدير يشمل المشرف)،
--   فمدير الحركة يستطيع معاينة شاشة المشرف — سلوك مقصود للإشراف.
-- ============================================================================

-- ═══ 1) حركة الوردية الجارية ════════════════════════════════════════════
-- «الوردية» هنا = نافذة زمنية متحركة (آخر N ساعة) لا جدول ورديات، لأن
-- shift_code في custom_permissions نصّ حر بلا أوقات محدَّدة. النافذة
-- الافتراضية 12 ساعة تغطي أطول وردية معتادة.
CREATE OR REPLACE FUNCTION public.supervisor_movement_shift(
  p_hours INTEGER DEFAULT 12
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
  out_overdue_minutes INTEGER,
  out_is_out_now      BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_portal_unit('supervisor', 'movement');

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
         END,
         (m.returned_at IS NULL)
    FROM public.employee_movements_log m
    LEFT JOIN public.profiles pr ON pr.id = m.employee_id
   WHERE m.tenant_id = public.current_user_tenant_id()
     AND m.departure_at >= NOW() - make_interval(hours => GREATEST(p_hours, 1))
     AND public.is_in_my_team(m.employee_id)
   ORDER BY (m.returned_at IS NULL) DESC, m.departure_at DESC;
END $$;

COMMENT ON FUNCTION public.supervisor_movement_shift(INTEGER) IS
  'حركة وردية المشرف: من خرج ومن لم يعد. المتأخرون أولاً. بلا صلاحية اعتماد.';

-- ═══ 2) مؤشرات الوردية ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.supervisor_movement_shift_kpis(
  p_hours INTEGER DEFAULT 12
)
RETURNS TABLE (
  out_team_size      INTEGER,
  out_out_now        INTEGER,
  out_overdue_now    INTEGER,
  out_returned_shift INTEGER,
  out_total_shift    INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_since  TIMESTAMPTZ := NOW() - make_interval(hours => GREATEST(p_hours, 1));
BEGIN
  PERFORM public.require_portal_unit('supervisor', 'movement');

  RETURN QUERY
  SELECT
    (SELECT count(*)::INTEGER FROM public.profiles pr
      WHERE pr.tenant_id = v_tenant AND public.is_in_my_team(pr.id) AND pr.id <> auth.uid()),
    (SELECT count(*)::INTEGER FROM public.employee_movements_log m
      WHERE m.tenant_id = v_tenant AND m.returned_at IS NULL
        AND public.is_in_my_team(m.employee_id)),
    (SELECT count(*)::INTEGER FROM public.employee_movements_log m
      WHERE m.tenant_id = v_tenant AND m.returned_at IS NULL
        AND m.expected_return_at < NOW() AND public.is_in_my_team(m.employee_id)),
    (SELECT count(*)::INTEGER FROM public.employee_movements_log m
      WHERE m.tenant_id = v_tenant AND m.returned_at >= v_since
        AND public.is_in_my_team(m.employee_id)),
    (SELECT count(*)::INTEGER FROM public.employee_movements_log m
      WHERE m.tenant_id = v_tenant AND m.departure_at >= v_since
        AND public.is_in_my_team(m.employee_id));
END $$;

COMMENT ON FUNCTION public.supervisor_movement_shift_kpis(INTEGER) IS
  'مؤشرات وردية المشرف: الفريق · بالخارج الآن · المتأخر · العائد · إجمالي الوردية.';

-- ═══ 3) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.supervisor_movement_shift(integer)',
    'public.supervisor_movement_shift_kpis(integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ═══ 4) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn  TEXT;
  v_cnt INT;
  v_def TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['supervisor_movement_shift','supervisor_movement_shift_kpis'] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_cnt = 1, format('0307 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.supervisor_movement_shift(integer)',
    'public.supervisor_movement_shift_kpis(integer)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0307 failed: anon can execute %s', v_fn);
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'),
      format('0307 failed: authenticated cannot execute %s', v_fn);
  END LOOP;

  -- 🔴 الحارس الجوهري: لا دالة مشرف تكتب في التصاريح أو الموافقات.
  -- المشرف يتابع ولا يعتمد — أي UPDATE هنا خرق للنموذج التنظيمي.
  FOREACH v_fn IN ARRAY ARRAY['supervisor_movement_shift','supervisor_movement_shift_kpis'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;

    ASSERT v_def !~* 'UPDATE\s+public\.employee_movement_permits',
      format('0307 failed: %s must not modify permits (supervisor cannot approve)', v_fn);
    ASSERT v_def !~* 'INSERT\s+INTO\s+public\.employee_movement_approvals',
      format('0307 failed: %s must not create approvals', v_fn);
  END LOOP;

  RAISE NOTICE '✅ 0307: وحدة الحركة للمشرف — متابعة بلا اعتماد';
END $$;

NOTIFY pgrst, 'reload schema';
