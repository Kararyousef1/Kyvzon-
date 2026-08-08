-- ============================================================================
-- 0282 — إصلاحات حرجة لبوابة الحركة (مراجعة 0270–0281)
--
-- ─────────────────────────────────────────────────────────────────────────
-- العطل ①: أحد عشر جدولاً مُفعَّل عليها RLS بلا أي سياسة.
--
--   في PostgreSQL، تفعيل RLS بلا سياسة = حجب كامل لدور authenticated.
--   ليس تشديداً أمنياً بل تعطيل وظيفي: الجدول لا يُقرأ ولا يُكتب إطلاقاً.
--
--   مُثبَت بالتشغيل الفعلي (Postgres 17 محلي، موظف admin مُصرَّح):
--     SET ROLE authenticated;
--     SELECT count(*) FROM public.movement_geofences;   →  0
--     INSERT INTO public.movement_geofences(...) VALUES (...);
--     ERROR: new row violates row-level security policy
--            for table "movement_geofences"
--
--   الجداول المتأثرة (11):
--     employee_movement_approvals · field_visit_checkins
--     fleet_driver_hos_logs · fleet_vehicle_documents
--     logistics_carrier_rates · logistics_kpi_snapshots
--     logistics_shipments · logistics_trip_stops
--     movement_audit_events · movement_geofences
--     movement_permit_attachments
--
--   الأثر العملي: سلسلة الموافقات · وثائق المركبات · ساعات القيادة ·
--   الشحنات · توقفات الرحلة · التدقيق — كلها معطّلة تماماً.
--
-- العطل ②: الدالة movement_require_role() غير موجودة.
--   0271 أنشأ movement_has_role() (تُرجع BOOLEAN) فقط. الحارس الذي
--   يرفع استثناءً — وهو ما تستدعيه الـ RPCs — مفقود. أي RPC مستقبلي
--   سيفشل بـ "function does not exist".
--
-- العطل ③: movement_audit_events قابل للتعديل والحذف.
--   سجل التدقيق يجب أن يكون append-only وإلا فقد قيمته القانونية.
--
-- ملاحظة أمنية عامة: كل دالة هنا يُسحب منها EXECUTE من anon صراحةً.
-- منحة Supabase التلقائية (ALTER DEFAULT PRIVILEGES) لا يسحبها
-- REVOKE ... FROM PUBLIC — هذا ما أسقط المايجريشن 0268 سابقاً.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① سياسات RLS للجداول الأحد عشر المحجوبة
--    النمط مطابق لـ 0270: عزل بالمستأجر عبر current_user_tenant_id()
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  v_tables TEXT[] := ARRAY[
    'employee_movement_approvals',
    'field_visit_checkins',
    'fleet_driver_hos_logs',
    'fleet_vehicle_documents',
    'logistics_carrier_rates',
    'logistics_kpi_snapshots',
    'logistics_shipments',
    'logistics_trip_stops',
    'movement_geofences',
    'movement_permit_attachments'
    -- movement_audit_events مستثنى: يُعالَج في ③ بسياسة append-only
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0282 failed: table public.% not found', t;
    END IF;

    -- تحقق أن العمود موجود قبل بناء السياسة عليه
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      RAISE EXCEPTION '0282 failed: table public.% has no tenant_id column', t;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS kyvzon_%s_all ON public.%I;', t, t);
    EXECUTE format($f$
      CREATE POLICY kyvzon_%s_all ON public.%I
        FOR ALL TO authenticated
        USING (tenant_id = public.current_user_tenant_id())
        WITH CHECK (tenant_id = public.current_user_tenant_id());
    $f$, t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ② الحارس المفقود: movement_require_role()
--    يرفع استثناءً بدل إرجاع BOOLEAN — ليُستدعى في بداية كل RPC.
--
--    ملاحظة: يتبع مخطط 0270 الفعلي (is_active) لا مخطط التوثيق
--    (access_level/revoked_at). الدور movement_manager يمنح كلا
--    الدورين — وهو تصميم سليم لمشرف يشرف على الاثنين.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.movement_require_role(p_role TEXT)
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
  IF p_role NOT IN ('employee_movement', 'logistics') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_ROLE (%)', p_role;
  END IF;

  -- أدوار المنصة تمر للتشخيص والدعم (نفس منطق procurement_require_roles)
  IF public.current_user_role() IN ('admin', 'developer', 'it_admin') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.movement_role_assignments a
     WHERE a.tenant_id = public.current_user_tenant_id()
       AND a.user_id   = auth.uid()
       AND a.is_active = TRUE
       -- movement_manager يشرف على الدورين معاً
       AND a.portal_role IN (p_role, 'movement_manager')
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MOVEMENT_ROLE (%)', p_role;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.movement_require_role(TEXT) FROM PUBLIC;
-- ★ سحب صريح: منحة Supabase التلقائية لا يسحبها REVOKE FROM PUBLIC
REVOKE ALL ON FUNCTION public.movement_require_role(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.movement_require_role(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ سجل التدقيق: قراءة وإدراج فقط — لا تعديل ولا حذف
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.movement_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_movement_audit_events_all    ON public.movement_audit_events;
DROP POLICY IF EXISTS kyvzon_movement_audit_events_select ON public.movement_audit_events;
DROP POLICY IF EXISTS kyvzon_movement_audit_events_insert ON public.movement_audit_events;

CREATE POLICY kyvzon_movement_audit_events_select ON public.movement_audit_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY kyvzon_movement_audit_events_insert ON public.movement_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- لا سياسة UPDATE ولا DELETE ⇒ append-only حتى لمن يملك الدور

-- ─────────────────────────────────────────────────────────────────────────
-- ④ سحب صلاحيات anon عن دوال الحركة القائمة (دفاع بالعمق)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'movement_has_role',
        'current_user_movement_roles',
        'movement_haversine_km',
        'movement_point_in_geofence',
        'movement_point_in_polygon',
        'movement_require_role'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon;',   r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ تأكيدات — تفشل المايجريشن إن بقي أي خلل
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_no_policy TEXT;
  v_anon_can  TEXT;
BEGIN
  -- (أ) لا جدول حركة بـ RLS مفعَّل وبلا سياسات
  SELECT string_agg(c.relname, ', ')
    INTO v_no_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relrowsecurity
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
     AND (c.relname LIKE 'movement\_%'  OR c.relname LIKE 'logistics\_%'
       OR c.relname LIKE 'employee\_m%' OR c.relname LIKE 'employee\_f%'
       OR c.relname LIKE 'fleet\_%'     OR c.relname LIKE 'field\_visit%');

  IF v_no_policy IS NOT NULL THEN
    RAISE EXCEPTION '0282 failed: RLS enabled without policies on: %', v_no_policy;
  END IF;

  -- (ب) الحارس موجود
  IF to_regprocedure('public.movement_require_role(text)') IS NULL THEN
    RAISE EXCEPTION '0282 failed: movement_require_role missing';
  END IF;

  -- (ج) anon لا ينفّذ أي دالة حركة
  SELECT string_agg(p.proname, ', ')
    INTO v_anon_can
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname LIKE 'movement\_%'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_can IS NOT NULL THEN
    RAISE EXCEPTION '0282 failed: anon can execute: %', v_anon_can;
  END IF;

  -- (د) سجل التدقيق بلا UPDATE/DELETE
  IF EXISTS (
    SELECT 1 FROM pg_policy p
     WHERE p.polrelid = 'public.movement_audit_events'::regclass
       AND p.polcmd IN ('w', 'd')          -- w=UPDATE, d=DELETE
  ) THEN
    RAISE EXCEPTION '0282 failed: audit log must be append-only';
  END IF;

  RAISE NOTICE '✅ 0282: movement RLS + role guard fixes applied';
END $$;
