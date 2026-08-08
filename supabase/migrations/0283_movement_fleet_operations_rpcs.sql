-- ============================================================================
-- 0283 — منطق تشغيل الأسطول (RPCs) — الجولة الثانية من المراجعة
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقص المكتشف:
--   المايجريشنات 0270–0282 أنشأت 32 جدولاً و6 دوال، لكن **صفر RPC**
--   لمنطق الأعمال. النتيجة: كل صفحات اللوجستيات الثلاث عشرة قراءة
--   فقط — لا إنشاء مركبة ولا سائق ولا صيانة. 12 زراً يعرض «قيد التطوير».
--
--   البيانات لا تُدخَل عبر الجداول مباشرة لأن ذلك يتجاوز قواعد الأعمال:
--     • مركبة بلوحة مكرَّرة
--     • عداد كيلومترات يتراجع (مؤشر تلاعب أو خطأ إدخال)
--     • إسناد سائق برخصة منتهية
--     • إسناد مركبة تحت الصيانة أو بوثيقة منتهية
--     • بدء صيانة لمركبة في رحلة
--
--   هذه القواعد **يجب** أن تكون في قاعدة البيانات لا في الواجهة، وإلا
--   التفّ عليها أي استدعاء مباشر من SDK.
--
-- الأمان: كل دالة تبدأ بـ movement_require_role('logistics') وتُسحب
--   صلاحيتها من anon صراحةً (منحة Supabase التلقائية لا يسحبها
--   REVOKE FROM PUBLIC — الدرس المستفاد من 0268).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) توليد أرقام تسلسلية موحَّدة (لا إدخال يدوي)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.movement_next_code(
  p_prefix TEXT,
  p_table   TEXT,
  p_column  TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_next   INT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  EXECUTE format(
    'SELECT COALESCE(MAX(NULLIF(regexp_replace(%I, ''^%s-'', ''''), '''')::INT), 0) + 1
       FROM public.%I WHERE tenant_id = $1 AND %I LIKE $2',
    p_column, p_prefix, p_table, p_column
  ) INTO v_next USING v_tenant, p_prefix || '-%';

  RETURN p_prefix || '-' || lpad(v_next::TEXT, 5, '0');
END $$;

REVOKE ALL ON FUNCTION public.movement_next_code(TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_next_code(TEXT,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.movement_next_code(TEXT,TEXT,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) إنشاء مركبة — مع كل قواعد التحقق
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_fleet_vehicle(
  p_plate_number  TEXT,
  p_make          TEXT,
  p_model         TEXT,
  p_year          INT,
  p_vehicle_type  TEXT DEFAULT 'truck',
  p_fuel_type     TEXT DEFAULT 'diesel',
  p_max_weight_kg NUMERIC DEFAULT 0,
  p_max_volume_cbm NUMERIC DEFAULT 0,
  p_current_mileage_km NUMERIC DEFAULT 0
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
  v_code   TEXT;
  v_plate  TEXT := upper(trim(p_plate_number));
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF v_plate IS NULL OR length(v_plate) < 3 THEN
    RAISE EXCEPTION 'PLATE_NUMBER_REQUIRED';
  END IF;
  IF p_make IS NULL OR trim(p_make) = '' OR p_model IS NULL OR trim(p_model) = '' THEN
    RAISE EXCEPTION 'MAKE_AND_MODEL_REQUIRED';
  END IF;
  -- سنة منطقية: لا مركبة قبل 1950 ولا بعد السنة القادمة
  IF p_year IS NULL OR p_year < 1950
     OR p_year > EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1 THEN
    RAISE EXCEPTION 'INVALID_VEHICLE_YEAR (%)', p_year;
  END IF;
  IF p_max_weight_kg < 0 OR p_max_volume_cbm < 0 OR p_current_mileage_km < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_VALUE_NOT_ALLOWED';
  END IF;

  -- لوحة فريدة داخل المستأجر
  IF EXISTS (
    SELECT 1 FROM public.logistics_vehicles
     WHERE tenant_id = v_tenant AND upper(plate_number) = v_plate
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PLATE_NUMBER (%)', v_plate;
  END IF;

  v_code := public.movement_next_code('VH', 'logistics_vehicles', 'vehicle_code');

  INSERT INTO public.logistics_vehicles(
    tenant_id, plate_number, vehicle_code, make, model, year,
    vehicle_type, fuel_type, max_weight_kg, max_volume_cbm,
    current_mileage_km, status)
  VALUES (
    v_tenant, v_plate, v_code, trim(p_make), trim(p_model), p_year,
    p_vehicle_type, p_fuel_type, p_max_weight_kg, p_max_volume_cbm,
    p_current_mileage_km, 'available')
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'vehicle_created', 'logistics_vehicle', v_id,
          jsonb_build_object('vehicle_code', v_code, 'plate_number', v_plate));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_fleet_vehicle(TEXT,TEXT,TEXT,INT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_fleet_vehicle(TEXT,TEXT,TEXT,INT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_fleet_vehicle(TEXT,TEXT,TEXT,INT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) تحديث حالة المركبة — بسبب إلزامي ومنع الانتقالات غير المنطقية
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_vehicle_status(
  p_vehicle_id UUID,
  p_status     TEXT,
  p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old    TEXT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_status NOT IN ('available','on_trip','maintenance','out_of_service') THEN
    RAISE EXCEPTION 'INVALID_VEHICLE_STATUS (%)', p_status;
  END IF;
  -- كل تغيير حالة يتطلب سبباً مُدقَّقاً (سياسة المنصة)
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'STATUS_CHANGE_REASON_REQUIRED';
  END IF;

  SELECT status INTO v_old
    FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  IF v_old = p_status THEN
    RAISE EXCEPTION 'VEHICLE_ALREADY_IN_STATUS (%)', p_status;
  END IF;

  -- مركبة في رحلة لا تُسحب للصيانة مباشرة — تُنهى رحلتها أولاً
  IF v_old = 'on_trip' AND p_status IN ('maintenance','out_of_service') THEN
    RAISE EXCEPTION 'VEHICLE_ON_TRIP_CANNOT_CHANGE_STATUS';
  END IF;

  UPDATE public.logistics_vehicles
     SET status = p_status, updated_at = NOW()
   WHERE id = p_vehicle_id AND tenant_id = v_tenant;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'vehicle_status_changed', 'logistics_vehicle',
          p_vehicle_id, jsonb_build_object(
            'old_status', v_old, 'new_status', p_status, 'reason', trim(p_reason)));
END $$;

REVOKE ALL ON FUNCTION public.set_vehicle_status(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_vehicle_status(UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_vehicle_status(UUID,TEXT,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) تحديث العداد — يمنع التراجع (كشف تلاعب/خطأ إدخال)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_vehicle_mileage(
  p_vehicle_id UUID,
  p_mileage_km NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old    NUMERIC;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT current_mileage_km INTO v_old
    FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  IF p_mileage_km IS NULL OR p_mileage_km < 0 THEN
    RAISE EXCEPTION 'INVALID_MILEAGE';
  END IF;
  -- العداد لا يتراجع أبداً
  IF p_mileage_km < v_old THEN
    RAISE EXCEPTION 'MILEAGE_CANNOT_DECREASE (current=%, given=%)', v_old, p_mileage_km;
  END IF;

  UPDATE public.logistics_vehicles
     SET current_mileage_km = p_mileage_km, updated_at = NOW()
   WHERE id = p_vehicle_id AND tenant_id = v_tenant;

  RETURN p_mileage_km - v_old;   -- المسافة المقطوعة
END $$;

REVOKE ALL ON FUNCTION public.update_vehicle_mileage(UUID,NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_vehicle_mileage(UUID,NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_vehicle_mileage(UUID,NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) إنشاء سائق — رخصة سارية إلزامية
-- ─────────────────────────────────────────────────────────────────────────
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
  -- لا يُسجَّل سائق برخصة منتهية أصلاً
  IF p_license_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'LICENSE_ALREADY_EXPIRED (%)', p_license_expiry_date;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.logistics_drivers
     WHERE tenant_id = v_tenant AND upper(license_number) = v_lic
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_LICENSE_NUMBER (%)', v_lic;
  END IF;

  INSERT INTO public.logistics_drivers(
    tenant_id, employee_id, driver_name_ar, license_number,
    license_class, license_expiry_date, phone, status)
  VALUES (
    v_tenant, p_employee_id, trim(p_driver_name_ar), v_lic,
    trim(p_license_class), p_license_expiry_date, p_phone, 'active')
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'driver_created', 'logistics_driver', v_id,
          jsonb_build_object('name', trim(p_driver_name_ar), 'license', v_lic));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_fleet_driver(TEXT,TEXT,TEXT,DATE,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_fleet_driver(TEXT,TEXT,TEXT,DATE,TEXT,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_fleet_driver(TEXT,TEXT,TEXT,DATE,TEXT,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) ★ فحص أهلية الإسناد — القاعدة الأهم في البوابة
--    يُستدعى قبل أي إسناد رحلة. يُرجع أسباب الرفض كلها لا أولها فقط.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_assignment_eligibility(
  p_vehicle_id UUID,
  p_driver_id  UUID
)
RETURNS TABLE (
  is_eligible   BOOLEAN,
  blocker_code  TEXT,
  blocker_msg   TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_vehicle RECORD;
  v_driver  RECORD;
  v_doc     RECORD;
  v_found   BOOLEAN := false;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_vehicle FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'VEHICLE_NOT_FOUND'::TEXT, 'المركبة غير موجودة'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_driver FROM public.logistics_drivers
   WHERE id = p_driver_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'DRIVER_NOT_FOUND'::TEXT, 'السائق غير موجود'::TEXT;
    RETURN;
  END IF;

  -- (أ) حالة المركبة
  IF v_vehicle.status <> 'available' THEN
    v_found := true;
    RETURN QUERY SELECT false, 'VEHICLE_NOT_AVAILABLE'::TEXT,
      ('المركبة ' || v_vehicle.vehicle_code || ' حالتها: ' || v_vehicle.status)::TEXT;
  END IF;

  -- (ب) حالة السائق
  IF v_driver.status <> 'active' THEN
    v_found := true;
    RETURN QUERY SELECT false, 'DRIVER_NOT_ACTIVE'::TEXT,
      ('السائق ' || v_driver.driver_name_ar || ' حالته: ' || v_driver.status)::TEXT;
  END IF;

  -- (ج) رخصة القيادة
  IF v_driver.license_expiry_date < CURRENT_DATE THEN
    v_found := true;
    RETURN QUERY SELECT false, 'DRIVER_LICENSE_EXPIRED'::TEXT,
      ('رخصة السائق منتهية بتاريخ ' || v_driver.license_expiry_date::TEXT)::TEXT;
  ELSIF v_driver.license_expiry_date <= CURRENT_DATE + 30 THEN
    -- تحذير لا مانع
    RETURN QUERY SELECT true, 'DRIVER_LICENSE_EXPIRING_SOON'::TEXT,
      ('رخصة السائق تنتهي خلال '
        || (v_driver.license_expiry_date - CURRENT_DATE)::TEXT || ' يوماً')::TEXT;
  END IF;

  -- (د) وثائق المركبة المنتهية
  FOR v_doc IN
    SELECT doc_type, expiry_date
      FROM public.fleet_vehicle_documents
     WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
       AND expiry_date < CURRENT_DATE
  LOOP
    v_found := true;
    RETURN QUERY SELECT false, 'VEHICLE_DOCUMENT_EXPIRED'::TEXT,
      ('وثيقة ' || v_doc.doc_type || ' منتهية بتاريخ ' || v_doc.expiry_date::TEXT)::TEXT;
  END LOOP;

  -- (هـ) صيانة مفتوحة
  IF EXISTS (
    SELECT 1 FROM public.logistics_maintenance
     WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
       AND status IN ('scheduled','in_progress')
  ) THEN
    v_found := true;
    RETURN QUERY SELECT false, 'VEHICLE_HAS_OPEN_MAINTENANCE'::TEXT,
      'للمركبة أمر صيانة مفتوح'::TEXT;
  END IF;

  IF NOT v_found THEN
    RETURN QUERY SELECT true, 'ELIGIBLE'::TEXT, 'مؤهَّل للإسناد'::TEXT;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.check_assignment_eligibility(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_assignment_eligibility(UUID,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_assignment_eligibility(UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) جدولة صيانة — تحوّل المركبة إلى maintenance تلقائياً
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.schedule_vehicle_maintenance(
  p_vehicle_id     UUID,
  p_maintenance_type TEXT,
  p_scheduled_date DATE,
  p_description    TEXT,
  p_estimated_cost NUMERIC DEFAULT 0
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
  v_status TEXT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_scheduled_date IS NULL THEN RAISE EXCEPTION 'SCHEDULED_DATE_REQUIRED'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) < 5 THEN
    RAISE EXCEPTION 'MAINTENANCE_DESCRIPTION_REQUIRED';
  END IF;
  IF p_maintenance_type NOT IN ('routine','repair','emergency','inspection') THEN
    RAISE EXCEPTION 'INVALID_MAINTENANCE_TYPE (%)', p_maintenance_type;
  END IF;
  IF p_estimated_cost < 0 THEN RAISE EXCEPTION 'NEGATIVE_COST_NOT_ALLOWED'; END IF;

  SELECT status INTO v_status FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.logistics_maintenance
     WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
       AND status IN ('scheduled','in_progress')
  ) THEN
    RAISE EXCEPTION 'VEHICLE_ALREADY_HAS_OPEN_MAINTENANCE';
  END IF;

  INSERT INTO public.logistics_maintenance(
    tenant_id, vehicle_id, maintenance_type, scheduled_date,
    description, cost, status)
  VALUES (v_tenant, p_vehicle_id, p_maintenance_type, p_scheduled_date,
          trim(p_description), p_estimated_cost, 'scheduled')
  RETURNING id INTO v_id;

  -- صيانة اليوم أو قبله ⇒ المركبة تخرج من الخدمة فوراً
  IF p_scheduled_date <= CURRENT_DATE AND v_status = 'available' THEN
    UPDATE public.logistics_vehicles
       SET status = 'maintenance', updated_at = NOW()
     WHERE id = p_vehicle_id AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'maintenance_scheduled', 'logistics_maintenance',
          v_id, jsonb_build_object('vehicle_id', p_vehicle_id,
                                   'scheduled_date', p_scheduled_date));
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.schedule_vehicle_maintenance(UUID,TEXT,DATE,TEXT,NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schedule_vehicle_maintenance(UUID,TEXT,DATE,TEXT,NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.schedule_vehicle_maintenance(UUID,TEXT,DATE,TEXT,NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) إكمال الصيانة — يعيد المركبة للخدمة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_vehicle_maintenance(
  p_maintenance_id UUID,
  p_actual_cost    NUMERIC,
  p_notes          TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_rec    RECORD;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF p_actual_cost IS NULL OR p_actual_cost < 0 THEN
    RAISE EXCEPTION 'INVALID_COST';
  END IF;

  SELECT * INTO v_rec FROM public.logistics_maintenance
   WHERE id = p_maintenance_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_NOT_FOUND'; END IF;
  IF v_rec.status = 'completed' THEN
    RAISE EXCEPTION 'MAINTENANCE_ALREADY_COMPLETED';
  END IF;

  UPDATE public.logistics_maintenance
     SET status = 'completed', cost = p_actual_cost,
         completed_date = CURRENT_DATE,
         technician_notes = p_notes,
         updated_at = NOW()
   WHERE id = p_maintenance_id AND tenant_id = v_tenant;

  -- تعود للخدمة فقط إن لم يبقَ أمر صيانة مفتوح آخر
  UPDATE public.logistics_vehicles v
     SET status = 'available', updated_at = NOW()
   WHERE v.id = v_rec.vehicle_id AND v.tenant_id = v_tenant
     AND v.status = 'maintenance'
     AND NOT EXISTS (
       SELECT 1 FROM public.logistics_maintenance m
        WHERE m.vehicle_id = v_rec.vehicle_id AND m.tenant_id = v_tenant
          AND m.id <> p_maintenance_id
          AND m.status IN ('scheduled','in_progress'));

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'maintenance_completed', 'logistics_maintenance',
          p_maintenance_id, jsonb_build_object('actual_cost', p_actual_cost));
END $$;

REVOKE ALL ON FUNCTION public.complete_vehicle_maintenance(UUID,NUMERIC,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_vehicle_maintenance(UUID,NUMERIC,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_vehicle_maintenance(UUID,NUMERIC,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) View: مؤشرات لوحة القيادة — تستبدل الأرقام الثابتة في الواجهة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.logistics_dashboard_kpis
WITH (security_invoker = true) AS
SELECT
  (SELECT COUNT(*) FROM public.logistics_vehicles v
    WHERE v.tenant_id = public.current_user_tenant_id())                AS total_vehicles,
  (SELECT COUNT(*) FROM public.logistics_vehicles v
    WHERE v.tenant_id = public.current_user_tenant_id()
      AND v.status = 'available')                                       AS available_vehicles,
  (SELECT COUNT(*) FROM public.logistics_vehicles v
    WHERE v.tenant_id = public.current_user_tenant_id()
      AND v.status = 'on_trip')                                         AS vehicles_on_trip,
  (SELECT COUNT(*) FROM public.logistics_vehicles v
    WHERE v.tenant_id = public.current_user_tenant_id()
      AND v.status = 'maintenance')                                     AS vehicles_in_maintenance,
  (SELECT COUNT(*) FROM public.logistics_drivers d
    WHERE d.tenant_id = public.current_user_tenant_id()
      AND d.status = 'active')                                          AS active_drivers,
  (SELECT COUNT(*) FROM public.logistics_drivers d
    WHERE d.tenant_id = public.current_user_tenant_id()
      AND d.license_expiry_date <= CURRENT_DATE + 30)                   AS drivers_license_expiring,
  (SELECT COUNT(*) FROM public.fleet_vehicle_documents fd
    WHERE fd.tenant_id = public.current_user_tenant_id()
      AND fd.expiry_date < CURRENT_DATE)                                AS expired_vehicle_documents,
  (SELECT COUNT(*) FROM public.logistics_maintenance m
    WHERE m.tenant_id = public.current_user_tenant_id()
      AND m.status IN ('scheduled','in_progress'))                      AS open_maintenance_orders,
  -- جاهزية الأسطول: نسبة المتاحة من الإجمالي (لا 100% ثابتة)
  CASE WHEN (SELECT COUNT(*) FROM public.logistics_vehicles v
              WHERE v.tenant_id = public.current_user_tenant_id()) = 0
       THEN 0
       ELSE ROUND(
         (SELECT COUNT(*) FROM public.logistics_vehicles v
           WHERE v.tenant_id = public.current_user_tenant_id()
             AND v.status = 'available')::NUMERIC * 100
         / (SELECT COUNT(*) FROM public.logistics_vehicles v
             WHERE v.tenant_id = public.current_user_tenant_id()), 1)
  END                                                                   AS fleet_readiness_percent;

GRANT SELECT ON public.logistics_dashboard_kpis TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 10) View: تنبيهات الأسطول (وثائق ورخص تنتهي)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.logistics_fleet_alerts
WITH (security_invoker = true) AS
SELECT
  'vehicle_document'::TEXT              AS alert_kind,
  fd.vehicle_id                         AS entity_id,
  v.vehicle_code                        AS entity_code,
  fd.doc_type                           AS detail,
  fd.expiry_date                        AS expiry_date,
  (fd.expiry_date - CURRENT_DATE)::INT  AS days_remaining,
  CASE WHEN fd.expiry_date <  CURRENT_DATE      THEN 'expired'
       WHEN fd.expiry_date <= CURRENT_DATE + 7  THEN 'critical'
       WHEN fd.expiry_date <= CURRENT_DATE + 30 THEN 'urgent'
       ELSE 'upcoming' END::TEXT        AS severity
FROM public.fleet_vehicle_documents fd
JOIN public.logistics_vehicles v ON v.id = fd.vehicle_id
WHERE fd.tenant_id = public.current_user_tenant_id()
  AND fd.expiry_date <= CURRENT_DATE + 90

UNION ALL

SELECT
  'driver_license'::TEXT,
  d.id,
  d.driver_name_ar,
  d.license_class,
  d.license_expiry_date,
  (d.license_expiry_date - CURRENT_DATE)::INT,
  CASE WHEN d.license_expiry_date <  CURRENT_DATE      THEN 'expired'
       WHEN d.license_expiry_date <= CURRENT_DATE + 7  THEN 'critical'
       WHEN d.license_expiry_date <= CURRENT_DATE + 30 THEN 'urgent'
       ELSE 'upcoming' END::TEXT
FROM public.logistics_drivers d
WHERE d.tenant_id = public.current_user_tenant_id()
  AND d.license_expiry_date <= CURRENT_DATE + 90;

GRANT SELECT ON public.logistics_fleet_alerts TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 11) تأكيدات
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn      TEXT;
  v_missing TEXT := '';
  v_anon    TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.movement_next_code(text,text,text)',
    'public.create_fleet_vehicle(text,text,text,integer,text,text,numeric,numeric,numeric)',
    'public.set_vehicle_status(uuid,text,text)',
    'public.update_vehicle_mileage(uuid,numeric)',
    'public.create_fleet_driver(text,text,text,date,text,uuid)',
    'public.check_assignment_eligibility(uuid,uuid)',
    'public.schedule_vehicle_maintenance(uuid,text,date,text,numeric)',
    'public.complete_vehicle_maintenance(uuid,numeric,text)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      v_missing := v_missing || ' ' || v_fn;
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0283 failed: missing functions:%', v_missing;
  END IF;

  IF to_regclass('public.logistics_dashboard_kpis') IS NULL
     OR to_regclass('public.logistics_fleet_alerts') IS NULL THEN
    RAISE EXCEPTION '0283 failed: dashboard views missing';
  END IF;

  -- لا دالة جديدة ينفّذها anon
  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_fleet_vehicle','set_vehicle_status',
                       'update_vehicle_mileage','create_fleet_driver',
                       'check_assignment_eligibility','schedule_vehicle_maintenance',
                       'complete_vehicle_maintenance','movement_next_code')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0283 failed: anon can execute: %', v_anon;
  END IF;

  RAISE NOTICE '✅ 0283: fleet operations RPCs applied';
END $$;
