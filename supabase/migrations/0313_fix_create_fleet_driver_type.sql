-- ============================================================================
-- FILE: 0313_fix_create_fleet_driver_type.sql
-- PURPOSE: إصلاح انحدار أدخلَه 0301 — create_fleet_driver لا تضبط driver_type
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ تصحيح علني لعملي أنا (الصدق قبل الاتساق)
--
-- مايجريشن 0301 (جولتي السابقة) أضاف:
--     driver_type VARCHAR NOT NULL DEFAULT 'employee'
--     CONSTRAINT logistics_drivers_type_employee_coherence CHECK (
--       (driver_type='employee'   AND employee_id IS NOT NULL) OR
--       (driver_type='contractor' AND employee_id IS NULL))
--
-- لكنه **لم يُحدِّث** public.create_fleet_driver (من 0283)، وهي المسار
-- الوحيد لإنشاء سائق (RLS تمنع الإدراج المباشر). الدالة تُدرج بلا ذكر
-- driver_type فيأخذ الافتراضي 'employee'، بينما p_employee_id افتراضيه
-- NULL — فيتناقض الصف مع القيد نفسه الذي أضافه 0301.
--
-- الأثر: **كل** إنشاء سائق متعاقد يفشل بـ
--     ERROR: new row for relation "logistics_drivers" violates check
--            constraint "logistics_drivers_type_employee_coherence"
-- أي أن قرار المستخدم الصريح «السائق موظف ومتعاقد خارجي معاً» كان
-- مكسوراً في نصفه الثاني منذ 0301.
--
-- كيف انكشف: تشغيل ستة اختبارات سلوكية قديمة (0287·0289-0291·0294·
-- 0296·0297·0298) على قاعدة نظيفة. لم تكشفه المراجعة النصية ولا
-- حرّاس 0301 — لأن الحارس فحص **وجود** القيد لا **توافق الدوال معه**.
-- الدرس نفسه المتكرر: plpgsql يؤجّل التحقق للتشغيل.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الإصلاح: اشتقاق driver_type من p_employee_id بدل الاعتماد على الافتراضي.
--   employee_id IS NOT NULL  ⇒ 'employee'
--   employee_id IS NULL      ⇒ 'contractor'
-- فيستحيل بناءً إنتاج صف يخالف القيد.
--
-- التوقيع لم يتغيّر (TEXT,TEXT,TEXT,DATE,TEXT,UUID) فلا حِمل زائد ولا
-- تعديل على أي مستدعٍ في الواجهة.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_fleet_driver(
  p_driver_name_ar     TEXT,
  p_license_number     TEXT,
  p_license_class      TEXT,
  p_license_expiry_date DATE,
  p_phone              TEXT DEFAULT NULL,
  p_employee_id        UUID DEFAULT NULL
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
  v_lic    TEXT := upper(trim(p_license_number));
  v_type   TEXT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_driver_name_ar IS NULL OR length(trim(p_driver_name_ar)) < 3 THEN
    RAISE EXCEPTION 'DRIVER_NAME_REQUIRED';
  END IF;
  IF v_lic IS NULL OR length(v_lic) < 3 THEN
    RAISE EXCEPTION 'LICENSE_NUMBER_REQUIRED';
  END IF;
  IF p_license_expiry_date IS NULL THEN
    RAISE EXCEPTION 'LICENSE_EXPIRY_REQUIRED';
  END IF;
  IF p_license_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'LICENSE_ALREADY_EXPIRED (%)', p_license_expiry_date;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.logistics_drivers
     WHERE tenant_id = v_tenant AND upper(license_number) = v_lic
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_LICENSE_NUMBER (%)', v_lic;
  END IF;

  -- ★ الإصلاح: النوع مُشتقّ لا افتراضي — يستحيل مخالفة القيد بناءً
  v_type := CASE WHEN p_employee_id IS NOT NULL THEN 'employee' ELSE 'contractor' END;

  -- الموظف المرتبط يجب أن يكون من المستأجر نفسه (منع ربط عابر للشركات)
  IF p_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_IN_TENANT';
  END IF;

  INSERT INTO public.logistics_drivers(
    tenant_id, employee_id, driver_name_ar, license_number,
    license_class, license_expiry_date, phone, status, driver_type)
  VALUES (
    v_tenant, p_employee_id, trim(p_driver_name_ar), v_lic,
    trim(p_license_class), p_license_expiry_date, p_phone, 'active', v_type)
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'driver_created', 'logistics_driver', v_id,
          jsonb_build_object('name', trim(p_driver_name_ar), 'license', v_lic,
                             'driver_type', v_type));

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_fleet_driver(TEXT,TEXT,TEXT,DATE,TEXT,UUID) IS
  'ينشئ سائق أسطول. driver_type مُشتقّ من employee_id (0313) فلا يخالف قيد التماسك الذي أضافه 0301.';

REVOKE ALL ON FUNCTION public.create_fleet_driver(TEXT,TEXT,TEXT,DATE,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_fleet_driver(TEXT,TEXT,TEXT,DATE,TEXT,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_fleet_driver(TEXT,TEXT,TEXT,DATE,TEXT,UUID)
  TO authenticated, service_role;

-- ─── حارس التحقق ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cnt  INT;
  v_src  TEXT;
BEGIN
  -- لا حِمل زائد
  SELECT count(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_fleet_driver';
  ASSERT v_cnt = 1, format('0313 failed: overloads = %s', v_cnt);

  -- الدالة تضبط driver_type فعلاً
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_fleet_driver';
  ASSERT v_src LIKE '%driver_type)%',
    '0313 failed: INSERT still omits driver_type';
  ASSERT v_src LIKE '%v_type%',
    '0313 failed: driver_type not derived from employee_id';

  ASSERT NOT has_function_privilege('anon',
    'public.create_fleet_driver(text,text,text,date,text,uuid)', 'EXECUTE'),
    '0313 failed: anon can create drivers';

  RAISE NOTICE '✅ 0313: create_fleet_driver تشتقّ driver_type — إنشاء السائق المتعاقد يعمل';
END $$;
