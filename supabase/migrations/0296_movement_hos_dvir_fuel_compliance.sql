-- ============================================================================
-- FILE: 0296_movement_hos_dvir_fuel_compliance.sql
-- PURPOSE: امتثال السلامة — ساعات القيادة (HOS) · فحص المركبة (DVIR)
--          · إكمال كشف احتيال الوقود.
--
-- ─────────────────────────────────────────────────────────────────────────
-- تصحيح لتقييمي في «هل انتهت البوابة؟»:
--
--   قلتُ إن كشف احتيال الوقود غائب. الفحص الأدق أظهر أن log_fuel_transaction
--   (0284) **ينفّذ أربعة أعلام فعلاً**: RAPID_REFUEL · ABNORMAL_CONSUMPTION
--   · EXCESSIVE_QUANTITY · FUEL_FOR_ELECTRIC_VEHICLE.
--
--   الناقص الحقيقي واحد: **تزوّد يتجاوز سعة الخزان** — وهو أوضح مؤشر
--   احتيال على الإطلاق (تعبئة صهريج شخصي على حساب الشركة). لم يكن
--   ممكناً لأن logistics_vehicles **لا يحمل عمود سعة خزان** أصلاً.
--
-- ما ينقص فعلاً ويُنفَّذ هنا:
--   ① HOS — الجدول موجود منذ 0280 وصفر منطق. مخاطرة سلامة وامتثال.
--   ② DVIR — غائب كلياً: لا جدول ولا دالة.
--   ③ سعة الخزان + علم TANK_CAPACITY_EXCEEDED.
--   ④ ربط الثلاثة بحارس الإسناد check_assignment_eligibility.
--
-- لماذا HOS مهم:
--   قيادة 11 ساعة متصلة تضاعف خطر الحادث. المعيار الأمريكي (FMCSA)
--   وأغلب اللوائح العربية تحدّها. بلا تتبّع لا يعرف المُرسِل أن سائقه
--   على وشك التجاوز — والمسؤولية القانونية تقع على الشركة.
--
-- الحدود المعتمَدة (قابلة للضبط لكل مستأجر عبر logistics_settings):
--   • 11 ساعة قيادة في اليوم
--   • 14 ساعة على رأس العمل (driving + on_duty)
--   • 10 ساعات راحة متصلة قبل دورة جديدة
--   • 70 ساعة قيادة في 8 أيام متتالية
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- ① سعة الخزان — يُكمل كشف الاحتيال
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.logistics_vehicles
  ADD COLUMN IF NOT EXISTS fuel_tank_capacity_l NUMERIC(8,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'logistics_vehicles_tank_capacity_check'
       AND conrelid = 'public.logistics_vehicles'::regclass
  ) THEN
    -- NULL مسموح (سعة غير مسجَّلة) لكن الصفر أو السالب خطأ إدخال
    ALTER TABLE public.logistics_vehicles
      ADD CONSTRAINT logistics_vehicles_tank_capacity_check
      CHECK (fuel_tank_capacity_l IS NULL OR fuel_tank_capacity_l > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.logistics_vehicles.fuel_tank_capacity_l IS
  'سعة خزان الوقود باللتر. NULL = غير مسجَّلة (لا يُفحص تجاوز السعة).';

-- ═══════════════════════════════════════════════════════════════════════
-- ② DVIR — فحص المركبة قبل/بعد الرحلة
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_inspections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id     UUID NOT NULL REFERENCES public.logistics_vehicles(id) ON DELETE CASCADE,
  driver_id      UUID REFERENCES public.logistics_drivers(id) ON DELETE SET NULL,
  dispatch_id    UUID REFERENCES public.logistics_dispatches(id) ON DELETE SET NULL,
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('pre_trip','post_trip','periodic')),
  odometer_km    NUMERIC(10,2),
  /*
    defects: مصفوفة JSON من {code, severity, note}.
    severity: 'minor' لا يمنع التشغيل · 'major' يستدعي صيانة ·
              'critical' يوقف المركبة فوراً.
  */
  defects        JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_critical   BOOLEAN NOT NULL DEFAULT FALSE,
  is_safe_to_operate BOOLEAN NOT NULL DEFAULT TRUE,
  signature_name TEXT,
  notes          TEXT,
  inspected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle
  ON public.fleet_vehicle_inspections (tenant_id, vehicle_id, inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_critical
  ON public.fleet_vehicle_inspections (tenant_id, has_critical, inspected_at DESC)
  WHERE has_critical;

COMMENT ON TABLE public.fleet_vehicle_inspections IS
  'DVIR — تقرير فحص المركبة. العيب الحرج يوقف المركبة تلقائياً.';

ALTER TABLE public.fleet_vehicle_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_vehicle_inspections_all ON public.fleet_vehicle_inspections;
CREATE POLICY kyvzon_vehicle_inspections_all
  ON public.fleet_vehicle_inspections FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

REVOKE ALL ON public.fleet_vehicle_inspections FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.fleet_vehicle_inspections TO authenticated;
GRANT ALL ON public.fleet_vehicle_inspections TO service_role;

-- ---------------------------------------------------------------------------
-- record_vehicle_inspection
--
--   العيب الحرج ⇒ المركبة out_of_service **تلقائياً**. هذا ما يطلبه
--   المخطط حرفياً، وهو جوهر DVIR: لا يُترك القرار لتقدير بشري تحت ضغط
--   جدول التسليم.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_vehicle_inspection(
  p_vehicle_id      UUID,
  p_inspection_type TEXT,
  p_defects         JSONB DEFAULT '[]'::jsonb,
  p_odometer_km     NUMERIC DEFAULT NULL,
  p_driver_id       UUID DEFAULT NULL,
  p_dispatch_id     UUID DEFAULT NULL,
  p_signature_name  TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS TABLE (inspection_id UUID, has_critical BOOLEAN, vehicle_grounded BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_vehicle  RECORD;
  v_crit     BOOLEAN := FALSE;
  v_ground   BOOLEAN := FALSE;
  v_id       UUID;
  v_bad      INT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_inspection_type NOT IN ('pre_trip','post_trip','periodic') THEN
    RAISE EXCEPTION 'INVALID_INSPECTION_TYPE (%)', p_inspection_type;
  END IF;
  IF p_defects IS NULL OR jsonb_typeof(p_defects) <> 'array' THEN
    RAISE EXCEPTION 'DEFECTS_MUST_BE_ARRAY';
  END IF;

  -- كل عيب لا بد أن يحمل code و severity صالحة
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements(p_defects) AS d
   WHERE d->>'code' IS NULL
      OR COALESCE(d->>'severity','') NOT IN ('minor','major','critical');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVALID_DEFECT_ENTRY (% entries missing code or valid severity)', v_bad;
  END IF;

  SELECT * INTO v_vehicle FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  IF p_odometer_km IS NOT NULL THEN
    IF p_odometer_km < 0 THEN RAISE EXCEPTION 'INVALID_ODOMETER'; END IF;
    IF p_odometer_km < v_vehicle.current_mileage_km THEN
      RAISE EXCEPTION 'ODOMETER_CANNOT_DECREASE (current=%, given=%)',
        v_vehicle.current_mileage_km, p_odometer_km;
    END IF;
  END IF;

  IF p_dispatch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.logistics_dispatches
     WHERE id = p_dispatch_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'DISPATCH_NOT_FOUND_IN_TENANT';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_defects) AS d
     WHERE d->>'severity' = 'critical') INTO v_crit;

  INSERT INTO public.fleet_vehicle_inspections(
    tenant_id, vehicle_id, driver_id, dispatch_id, inspection_type,
    odometer_km, defects, has_critical, is_safe_to_operate,
    signature_name, notes)
  VALUES (v_tenant, p_vehicle_id, p_driver_id, p_dispatch_id, p_inspection_type,
          p_odometer_km, p_defects, v_crit, NOT v_crit,
          p_signature_name, p_notes)
  RETURNING id INTO v_id;

  IF p_odometer_km IS NOT NULL AND p_odometer_km > v_vehicle.current_mileage_km THEN
    UPDATE public.logistics_vehicles
       SET current_mileage_km = p_odometer_km, updated_at = NOW()
     WHERE id = p_vehicle_id AND tenant_id = v_tenant;
  END IF;

  /*
    الإيقاف التلقائي: مركبة في رحلة لا تُوقَف فوراً (السائق على الطريق
    وإيقافها يترك الحمولة معلَّقة) — لكن العيب مسجَّل، وحارس الإسناد
    يمنع أي رحلة جديدة. المُرسِل يرى التنبيه ويتصرّف.
  */
  IF v_crit AND v_vehicle.status = 'available' THEN
    UPDATE public.logistics_vehicles
       SET status = 'out_of_service', updated_at = NOW()
     WHERE id = p_vehicle_id AND tenant_id = v_tenant;
    v_ground := TRUE;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'vehicle_inspection_recorded',
          'logistics_vehicle', p_vehicle_id,
          jsonb_build_object('inspection_id', v_id,
                             'type', p_inspection_type,
                             'defect_count', jsonb_array_length(p_defects),
                             'has_critical', v_crit,
                             'grounded', v_ground));

  RETURN QUERY SELECT v_id, v_crit, v_ground;
END $$;

COMMENT ON FUNCTION public.record_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,UUID,UUID,TEXT,TEXT) IS
  'DVIR: العيب الحرج يوقف المركبة المتاحة تلقائياً ويمنع أي إسناد جديد.';

-- ---------------------------------------------------------------------------
-- clear_vehicle_inspection_defect — رفع الإيقاف بعد الإصلاح
--
--   لا نسمح بتغيير سجل الفحص نفسه (دليل تدقيقي). بل نُسجّل فحصاً
--   جديداً نظيفاً يرفع الإيقاف — نفس منطق «لا حذف للسجلات الحرجة».
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_vehicle_defects(
  p_vehicle_id UUID,
  p_notes      TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_status TEXT;
  v_id     UUID;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_notes IS NULL OR length(trim(p_notes)) < 5 THEN
    RAISE EXCEPTION 'REPAIR_NOTES_REQUIRED';
  END IF;

  SELECT status INTO v_status FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fleet_vehicle_inspections
     WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id AND has_critical
  ) THEN
    RAISE EXCEPTION 'NO_CRITICAL_DEFECT_TO_CLEAR';
  END IF;

  INSERT INTO public.fleet_vehicle_inspections(
    tenant_id, vehicle_id, inspection_type, defects,
    has_critical, is_safe_to_operate, notes)
  VALUES (v_tenant, p_vehicle_id, 'periodic', '[]'::jsonb,
          FALSE, TRUE, 'إصلاح واعتماد: ' || trim(p_notes))
  RETURNING id INTO v_id;

  -- الإيقاف يُرفع فقط إن كان سببه الفحص لا الصيانة أو رحلة جارية
  IF v_status = 'out_of_service' THEN
    UPDATE public.logistics_vehicles
       SET status = 'available', updated_at = NOW()
     WHERE id = p_vehicle_id AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'vehicle_defects_cleared',
          'logistics_vehicle', p_vehicle_id,
          jsonb_build_object('inspection_id', v_id, 'notes', trim(p_notes)));

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.clear_vehicle_defects(UUID,TEXT) IS
  'رفع إيقاف DVIR بفحص نظيف جديد — لا تعديل للسجل الأصلي (دليل تدقيقي).';

-- ═══════════════════════════════════════════════════════════════════════
-- ③ HOS — ساعات القيادة والخدمة
-- ═══════════════════════════════════════════════════════════════════════

-- الجدول موجود منذ 0280 لكنه يفتقر لما يجعله قابلاً للاستعمال
ALTER TABLE public.fleet_driver_hos_logs
  ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_id  UUID,
  ADD COLUMN IF NOT EXISTS notes        TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fleet_driver_hos_logs_dispatch_fk'
       AND conrelid = 'public.fleet_driver_hos_logs'::regclass
  ) THEN
    ALTER TABLE public.fleet_driver_hos_logs
      ADD CONSTRAINT fleet_driver_hos_logs_dispatch_fk
      FOREIGN KEY (dispatch_id) REFERENCES public.logistics_dispatches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hos_driver_date
  ON public.fleet_driver_hos_logs (tenant_id, driver_id, logged_date DESC);
CREATE INDEX IF NOT EXISTS idx_hos_driver_open
  ON public.fleet_driver_hos_logs (tenant_id, driver_id)
  WHERE ended_at IS NULL;

COMMENT ON COLUMN public.fleet_driver_hos_logs.started_at IS
  'بداية الفترة. NULL في السجلات القديمة المُدخَلة يدوياً بالمدة فقط.';

-- ---------------------------------------------------------------------------
-- get_driver_hos_summary — الحساب المركزي
--
--   دالة واحدة تحسب كل الحدود، تستعملها الأخريات. لو تكرر الحساب في
--   عدة مواضع لتباعدت الأرقام — نفس درس 0292.
--
--   الفترة المفتوحة (ended_at IS NULL) تُحسب حتى اللحظة: السائق الذي
--   يقود الآن يقترب من حدّه ولا ينتظر إغلاق السجل ليُحتسب.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_hos_summary(
  p_driver_id UUID,
  p_date      DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  driving_minutes_today   INTEGER,
  on_duty_minutes_today   INTEGER,
  driving_minutes_8days   INTEGER,
  last_rest_minutes       INTEGER,
  open_period_status      TEXT,
  open_period_minutes     INTEGER,
  driving_limit_exceeded  BOOLEAN,
  duty_limit_exceeded     BOOLEAN,
  cycle_limit_exceeded    BOOLEAN,
  rest_insufficient       BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_drive  INT := 0;
  v_duty   INT := 0;
  v_cycle  INT := 0;
  v_rest   INT := 0;
  v_ostat  TEXT := NULL;
  v_omin   INT := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  /*
    المدة الفعلية لكل سجل:
      المغلق  → duration_mins المخزَّنة (أو الفارق إن كانت صفراً)
      المفتوح → من started_at حتى الآن
  */
  WITH eff AS (
    SELECT h.duty_status,
           h.logged_date,
           CASE
             WHEN h.ended_at IS NULL AND h.started_at IS NOT NULL
               THEN GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - h.started_at)) / 60)::INT, 0)
             WHEN h.duration_mins > 0 THEN h.duration_mins
             WHEN h.started_at IS NOT NULL AND h.ended_at IS NOT NULL
               THEN GREATEST(FLOOR(EXTRACT(EPOCH FROM (h.ended_at - h.started_at)) / 60)::INT, 0)
             ELSE 0
           END AS mins
      FROM public.fleet_driver_hos_logs h
     WHERE h.tenant_id = v_tenant AND h.driver_id = p_driver_id
  )
  SELECT
    COALESCE(SUM(mins) FILTER (WHERE duty_status = 'driving'
                                 AND logged_date = p_date), 0),
    COALESCE(SUM(mins) FILTER (WHERE duty_status IN ('driving','on_duty')
                                 AND logged_date = p_date), 0),
    COALESCE(SUM(mins) FILTER (WHERE duty_status = 'driving'
                                 AND logged_date > p_date - 8
                                 AND logged_date <= p_date), 0)
    INTO v_drive, v_duty, v_cycle
    FROM eff;

  -- آخر راحة متصلة مكتملة (off_duty أو sleeper)
  SELECT COALESCE(MAX(
           CASE WHEN h.duration_mins > 0 THEN h.duration_mins
                WHEN h.started_at IS NOT NULL AND h.ended_at IS NOT NULL
                  THEN GREATEST(FLOOR(EXTRACT(EPOCH FROM (h.ended_at - h.started_at)) / 60)::INT, 0)
                ELSE 0 END), 0)
    INTO v_rest
    FROM public.fleet_driver_hos_logs h
   WHERE h.tenant_id = v_tenant AND h.driver_id = p_driver_id
     AND h.duty_status IN ('off_duty','sleeper')
     AND h.ended_at IS NOT NULL
     AND h.ended_at > now() - interval '36 hours';

  SELECT h.duty_status,
         GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - h.started_at)) / 60)::INT, 0)
    INTO v_ostat, v_omin
    FROM public.fleet_driver_hos_logs h
   WHERE h.tenant_id = v_tenant AND h.driver_id = p_driver_id
     AND h.ended_at IS NULL AND h.started_at IS NOT NULL
   ORDER BY h.started_at DESC LIMIT 1;

  RETURN QUERY SELECT
    v_drive, v_duty, v_cycle, v_rest,
    v_ostat, COALESCE(v_omin, 0),
    (v_drive >= 660),                       -- 11 ساعة
    (v_duty  >= 840),                       -- 14 ساعة
    (v_cycle >= 4200),                      -- 70 ساعة / 8 أيام
    /*
      نقص الراحة يُحتسب فقط بعد يوم عمل فعلي: سائق لم يعمل اليوم
      إطلاقاً لا يُعدّ "غير مرتاح" لمجرد غياب سجل راحة.
    */
    (v_duty > 0 AND v_rest > 0 AND v_rest < 600);
END $$;

COMMENT ON FUNCTION public.get_driver_hos_summary(UUID,DATE) IS
  'ملخّص ساعات السائق: 11ق/14خ/70×8أيام/10 راحة. الفترة المفتوحة تُحتسب حتى الآن.';

-- ---------------------------------------------------------------------------
-- start_driver_duty_period / end_driver_duty_period
--
--   فترة مفتوحة واحدة لكل سائق: بدء فترة جديدة يُغلق السابقة تلقائياً.
--   بدون ذلك تتراكم فترات مفتوحة وتُحتسب كلها معاً فتنفجر الأرقام.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_driver_duty_period(
  p_driver_id   UUID,
  p_duty_status TEXT,
  p_dispatch_id UUID DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
)
RETURNS TABLE (log_id UUID, hos_warning TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
  v_sum    RECORD;
  v_warn   TEXT := NULL;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_duty_status NOT IN ('off_duty','sleeper','driving','on_duty') THEN
    RAISE EXCEPTION 'INVALID_DUTY_STATUS (%)', p_duty_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.logistics_drivers
                  WHERE id = p_driver_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'DRIVER_NOT_FOUND';
  END IF;

  -- إغلاق أي فترة مفتوحة سابقة
  UPDATE public.fleet_driver_hos_logs
     SET ended_at = now(),
         duration_mins = GREATEST(
           FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::INT, 0)
   WHERE tenant_id = v_tenant AND driver_id = p_driver_id
     AND ended_at IS NULL AND started_at IS NOT NULL;

  INSERT INTO public.fleet_driver_hos_logs(
    tenant_id, driver_id, duty_status, duration_mins,
    logged_date, started_at, dispatch_id, notes)
  VALUES (v_tenant, p_driver_id, p_duty_status, 0,
          CURRENT_DATE, now(), p_dispatch_id, p_notes)
  RETURNING id INTO v_id;

  -- تحذير لا منع: البدء مسموح، لكن المُرسِل يجب أن يعرف
  IF p_duty_status = 'driving' THEN
    SELECT * INTO v_sum FROM public.get_driver_hos_summary(p_driver_id, CURRENT_DATE);
    IF v_sum.driving_limit_exceeded THEN
      v_warn := 'HOS_DRIVING_LIMIT_REACHED';
    ELSIF v_sum.duty_limit_exceeded THEN
      v_warn := 'HOS_DUTY_LIMIT_REACHED';
    ELSIF v_sum.cycle_limit_exceeded THEN
      v_warn := 'HOS_CYCLE_LIMIT_REACHED';
    ELSIF v_sum.driving_minutes_today >= 600 THEN
      v_warn := 'HOS_APPROACHING_LIMIT';
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, v_warn;
END $$;

COMMENT ON FUNCTION public.start_driver_duty_period(UUID,TEXT,UUID,TEXT) IS
  'بدء فترة خدمة. يُغلق الفترة المفتوحة تلقائياً ويُحذّر عند بلوغ الحدود.';

CREATE OR REPLACE FUNCTION public.end_driver_duty_period(
  p_driver_id UUID,
  p_notes     TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_mins   INTEGER;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  UPDATE public.fleet_driver_hos_logs
     SET ended_at = now(),
         duration_mins = GREATEST(
           FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::INT, 0),
         notes = COALESCE(notes || ' | ', '') || COALESCE(p_notes, '')
   WHERE tenant_id = v_tenant AND driver_id = p_driver_id
     AND ended_at IS NULL AND started_at IS NOT NULL
  RETURNING duration_mins INTO v_mins;

  IF v_mins IS NULL THEN RAISE EXCEPTION 'NO_OPEN_DUTY_PERIOD'; END IF;
  RETURN v_mins;
END $$;

COMMENT ON FUNCTION public.end_driver_duty_period(UUID,TEXT) IS
  'إنهاء الفترة المفتوحة وحساب مدتها.';

-- ═══════════════════════════════════════════════════════════════════════
-- ④ ربط الامتثال بحارس الإسناد — الجزء الأهم
-- ═══════════════════════════════════════════════════════════════════════

/*
  DROP إلزامي: نُعيد بناء الدالة بمنطق أوسع.
  درس 0294: CREATE OR REPLACE بتوقيع مطابق يعمل، لكن أي اختلاف في
  الوسائط يُنشئ حِملاً زائداً. التوقيع هنا لم يتغيّر — نستعمل REPLACE
  بأمان، ونتحقق في الحارس أن النسخة واحدة.
*/
CREATE OR REPLACE FUNCTION public.check_assignment_eligibility(
  p_vehicle_id UUID,
  p_driver_id  UUID
)
RETURNS TABLE (is_eligible BOOLEAN, blocker_code TEXT, blocker_msg TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_vehicle RECORD;
  v_driver  RECORD;
  v_doc     RECORD;
  v_hos     RECORD;
  v_insp    RECORD;
BEGIN
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

  IF v_vehicle.status <> 'available' THEN
    RETURN QUERY SELECT false, 'VEHICLE_NOT_AVAILABLE'::TEXT,
      ('المركبة ' || v_vehicle.vehicle_code || ' حالتها: ' || v_vehicle.status)::TEXT;
    RETURN;
  END IF;

  IF v_driver.status <> 'active' THEN
    RETURN QUERY SELECT false, 'DRIVER_NOT_ACTIVE'::TEXT,
      ('السائق حالته: ' || v_driver.status)::TEXT;
    RETURN;
  END IF;

  IF v_driver.license_expiry_date < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'DRIVER_LICENSE_EXPIRED'::TEXT,
      ('رخصة السائق منتهية بتاريخ ' || v_driver.license_expiry_date::TEXT)::TEXT;
    RETURN;
  END IF;

  SELECT doc_type, expiry_date INTO v_doc
    FROM public.fleet_vehicle_documents
   WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
     AND expiry_date < CURRENT_DATE
   ORDER BY expiry_date ASC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT false, 'VEHICLE_DOCUMENT_EXPIRED'::TEXT,
      ('وثيقة ' || v_doc.doc_type || ' منتهية بتاريخ ' || v_doc.expiry_date::TEXT)::TEXT;
    RETURN;
  END IF;

  -- ★ جديد: عيب DVIR حرج غير مُعالَج
  SELECT * INTO v_insp
    FROM public.fleet_vehicle_inspections
   WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
   ORDER BY inspected_at DESC LIMIT 1;
  IF FOUND AND v_insp.has_critical THEN
    RETURN QUERY SELECT false, 'VEHICLE_HAS_CRITICAL_DEFECT'::TEXT,
      ('آخر فحص سجّل عيباً حرجاً بتاريخ '
        || to_char(v_insp.inspected_at, 'YYYY-MM-DD'))::TEXT;
    RETURN;
  END IF;

  -- ★ جديد: حدود ساعات القيادة
  SELECT * INTO v_hos FROM public.get_driver_hos_summary(p_driver_id, CURRENT_DATE);
  IF v_hos.driving_limit_exceeded THEN
    RETURN QUERY SELECT false, 'HOS_LIMIT_EXCEEDED'::TEXT,
      ('تجاوز حد القيادة اليومي: '
        || ROUND(v_hos.driving_minutes_today / 60.0, 1)::TEXT || ' ساعة من 11')::TEXT;
    RETURN;
  END IF;
  IF v_hos.duty_limit_exceeded THEN
    RETURN QUERY SELECT false, 'HOS_DUTY_LIMIT_EXCEEDED'::TEXT,
      ('تجاوز حد ساعات العمل: '
        || ROUND(v_hos.on_duty_minutes_today / 60.0, 1)::TEXT || ' ساعة من 14')::TEXT;
    RETURN;
  END IF;
  IF v_hos.cycle_limit_exceeded THEN
    RETURN QUERY SELECT false, 'HOS_CYCLE_LIMIT_EXCEEDED'::TEXT,
      ('تجاوز حد الدورة: '
        || ROUND(v_hos.driving_minutes_8days / 60.0, 1)::TEXT || ' ساعة في 8 أيام من 70')::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.logistics_dispatches
     WHERE tenant_id = v_tenant AND driver_id = p_driver_id
       AND status NOT IN ('completed','failed')
  ) THEN
    RETURN QUERY SELECT false, 'DRIVER_ON_ACTIVE_DISPATCH'::TEXT,
      'السائق مرتبط برحلة نشطة'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT, NULL::TEXT;
END $$;

COMMENT ON FUNCTION public.check_assignment_eligibility(UUID,UUID) IS
  'أهلية الإسناد: الحالة · الرخصة · الوثائق · DVIR الحرج · حدود HOS · الارتباط.';

-- ═══════════════════════════════════════════════════════════════════════
-- ⑤ إكمال كشف احتيال الوقود — علم تجاوز سعة الخزان
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_fuel_transaction(
  p_vehicle_id       UUID,
  p_liters           NUMERIC,
  p_cost             NUMERIC,
  p_odometer_reading NUMERIC,
  p_driver_id        UUID DEFAULT NULL,
  p_station_name     TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL
)
RETURNS TABLE (fuel_log_id UUID, flags TEXT[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_vehicle  RECORD;
  v_prev     RECORD;
  v_id       UUID;
  v_flags    TEXT[] := ARRAY[]::TEXT[];
  v_distance NUMERIC;
  v_rate     NUMERIC;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_liters IS NULL OR p_liters <= 0 THEN RAISE EXCEPTION 'INVALID_LITERS'; END IF;
  IF p_cost IS NULL OR p_cost < 0 THEN RAISE EXCEPTION 'INVALID_COST'; END IF;
  IF p_odometer_reading IS NULL OR p_odometer_reading < 0 THEN
    RAISE EXCEPTION 'INVALID_ODOMETER';
  END IF;

  SELECT * INTO v_vehicle FROM public.logistics_vehicles
   WHERE id = p_vehicle_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  IF p_odometer_reading < v_vehicle.current_mileage_km THEN
    RAISE EXCEPTION 'ODOMETER_CANNOT_DECREASE (current=%, given=%)',
      v_vehicle.current_mileage_km, p_odometer_reading;
  END IF;

  SELECT * INTO v_prev FROM public.logistics_fuel_logs
   WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
   ORDER BY logged_at DESC LIMIT 1;

  IF FOUND AND v_prev.logged_at > NOW() - INTERVAL '1 hour' THEN
    v_flags := array_append(v_flags, 'RAPID_REFUEL');
  END IF;

  IF FOUND AND v_prev.odometer_reading > 0 THEN
    v_distance := p_odometer_reading - v_prev.odometer_reading;
    IF v_distance <= 0 THEN
      v_flags := array_append(v_flags, 'NO_DISTANCE_SINCE_LAST_REFUEL');
    ELSE
      v_rate := (p_liters / v_distance) * 100;
      IF v_rate > 60 THEN
        v_flags := array_append(v_flags, 'ABNORMAL_CONSUMPTION');
      END IF;
    END IF;
  END IF;

  IF p_liters > 500 THEN
    v_flags := array_append(v_flags, 'EXCESSIVE_QUANTITY');
  END IF;

  IF v_vehicle.fuel_type = 'electric' THEN
    v_flags := array_append(v_flags, 'FUEL_FOR_ELECTRIC_VEHICLE');
  END IF;

  /*
    ★ جديد (0296): تجاوز سعة الخزان — أوضح مؤشر احتيال على الإطلاق.
    خزان سعته 300 لتر لا يستقبل 400: الفائض ذهب إلى وعاء آخر.
    هامش 5%: خزانات كثيرة تقبل تعبئة زائدة قليلاً، والرفض القاطع
    يولّد إنذارات كاذبة تُفقد الثقة بالنظام كله.
  */
  IF v_vehicle.fuel_tank_capacity_l IS NOT NULL
     AND p_liters > v_vehicle.fuel_tank_capacity_l * 1.05 THEN
    v_flags := array_append(v_flags, 'TANK_CAPACITY_EXCEEDED');
  END IF;

  INSERT INTO public.logistics_fuel_logs(
    tenant_id, vehicle_id, driver_id, liters, cost,
    odometer_reading, station_name, logged_at, notes)
  VALUES (v_tenant, p_vehicle_id, p_driver_id, p_liters, p_cost,
          p_odometer_reading, p_station_name, NOW(),
          CASE WHEN array_length(v_flags,1) IS NULL THEN p_notes
               ELSE COALESCE(p_notes || ' | ', '') || 'FLAGS: ' || array_to_string(v_flags, ',')
          END)
  RETURNING id INTO v_id;

  UPDATE public.logistics_vehicles
     SET current_mileage_km = p_odometer_reading, updated_at = NOW()
   WHERE id = p_vehicle_id AND tenant_id = v_tenant;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'fuel_logged', 'logistics_fuel_log', v_id,
          jsonb_build_object('liters', p_liters, 'cost', p_cost, 'flags', v_flags));

  RETURN QUERY SELECT v_id, v_flags;
END $$;

COMMENT ON FUNCTION public.log_fuel_transaction(UUID,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT,TEXT) IS
  'تسجيل تزوّد مع 6 أعلام احتيال، منها تجاوز سعة الخزان (0296).';

-- ═══════════════════════════════════════════════════════════════════════
-- ⑥ عرض امتثال السلامة
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.logistics_safety_compliance AS
SELECT d.id                AS driver_id,
       d.tenant_id,
       d.driver_name_ar,
       d.status            AS driver_status,
       d.license_expiry_date,
       (d.license_expiry_date - CURRENT_DATE)::INT AS license_days_left,
       COALESCE(hos.driving_minutes_today, 0)      AS driving_minutes_today,
       COALESCE(hos.on_duty_minutes_today, 0)      AS on_duty_minutes_today,
       COALESCE(hos.driving_minutes_8days, 0)      AS driving_minutes_8days,
       hos.open_period_status,
       COALESCE(hos.open_period_minutes, 0)        AS open_period_minutes,
       COALESCE(hos.driving_limit_exceeded, FALSE) AS hos_driving_exceeded,
       COALESCE(hos.duty_limit_exceeded, FALSE)    AS hos_duty_exceeded,
       COALESCE(hos.cycle_limit_exceeded, FALSE)   AS hos_cycle_exceeded,
       CASE
         WHEN d.license_expiry_date < CURRENT_DATE THEN 'license_expired'
         WHEN COALESCE(hos.driving_limit_exceeded, FALSE)
           OR COALESCE(hos.duty_limit_exceeded, FALSE)
           OR COALESCE(hos.cycle_limit_exceeded, FALSE) THEN 'hos_violation'
         WHEN COALESCE(hos.driving_minutes_today, 0) >= 600 THEN 'hos_warning'
         WHEN d.license_expiry_date <= CURRENT_DATE + 30 THEN 'license_expiring'
         ELSE 'compliant'
       END AS compliance_status
  FROM public.logistics_drivers d
  LEFT JOIN LATERAL public.get_driver_hos_summary(d.id, CURRENT_DATE) hos ON TRUE
 WHERE d.tenant_id = public.current_user_tenant_id();

COMMENT ON VIEW public.logistics_safety_compliance IS
  'امتثال السلامة لكل سائق: الرخصة وحدود HOS. مصدر لوحة الامتثال.';

CREATE OR REPLACE VIEW public.logistics_vehicle_safety_status AS
SELECT v.id           AS vehicle_id,
       v.tenant_id,
       v.vehicle_code,
       v.plate_number,
       v.status       AS vehicle_status,
       v.fuel_tank_capacity_l,
       i.id           AS last_inspection_id,
       i.inspected_at AS last_inspected_at,
       i.inspection_type AS last_inspection_type,
       COALESCE(i.has_critical, FALSE) AS has_critical_defect,
       COALESCE(jsonb_array_length(i.defects), 0) AS defect_count,
       (SELECT count(*)::INT FROM public.fleet_vehicle_documents fd
         WHERE fd.tenant_id = v.tenant_id AND fd.vehicle_id = v.id
           AND fd.expiry_date < CURRENT_DATE) AS expired_documents,
       CASE
         WHEN COALESCE(i.has_critical, FALSE) THEN 'grounded_defect'
         WHEN EXISTS (SELECT 1 FROM public.fleet_vehicle_documents fd
                       WHERE fd.tenant_id = v.tenant_id AND fd.vehicle_id = v.id
                         AND fd.expiry_date < CURRENT_DATE) THEN 'document_expired'
         WHEN i.id IS NULL THEN 'never_inspected'
         WHEN i.inspected_at < now() - interval '30 days' THEN 'inspection_overdue'
         ELSE 'compliant'
       END AS safety_status
  FROM public.logistics_vehicles v
  LEFT JOIN LATERAL (
    SELECT * FROM public.fleet_vehicle_inspections fi
     WHERE fi.tenant_id = v.tenant_id AND fi.vehicle_id = v.id
     ORDER BY fi.inspected_at DESC LIMIT 1
  ) i ON TRUE
 WHERE v.tenant_id = public.current_user_tenant_id();

COMMENT ON VIEW public.logistics_vehicle_safety_status IS
  'سلامة المركبات: آخر فحص · العيوب الحرجة · الوثائق المنتهية.';

-- ═══════════════════════════════════════════════════════════════════════
-- ⑦ الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.record_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_vehicle_defects(UUID,TEXT)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_driver_hos_summary(UUID,DATE)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_driver_duty_period(UUID,TEXT,UUID,TEXT)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_driver_duty_period(UUID,TEXT)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_assignment_eligibility(UUID,UUID)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_fuel_transaction(UUID,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT,TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,UUID,UUID,TEXT,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_vehicle_defects(UUID,TEXT)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_driver_hos_summary(UUID,DATE)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_driver_duty_period(UUID,TEXT,UUID,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_driver_duty_period(UUID,TEXT)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_assignment_eligibility(UUID,UUID)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_fuel_transaction(UUID,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT,TEXT) TO authenticated, service_role;

REVOKE ALL ON public.logistics_safety_compliance      FROM PUBLIC, anon;
REVOKE ALL ON public.logistics_vehicle_safety_status  FROM PUBLIC, anon;
GRANT SELECT ON public.logistics_safety_compliance     TO authenticated, service_role;
GRANT SELECT ON public.logistics_vehicle_safety_status TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- ⑧ 🔴 حارس التحقق
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn      TEXT;
  v_anon    TEXT;
  v_cnt     INT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.record_vehicle_inspection(uuid,text,jsonb,numeric,uuid,uuid,text,text)',
    'public.clear_vehicle_defects(uuid,text)',
    'public.get_driver_hos_summary(uuid,date)',
    'public.start_driver_duty_period(uuid,text,uuid,text)',
    'public.end_driver_duty_period(uuid,text)',
    'public.check_assignment_eligibility(uuid,uuid)',
    'public.log_fuel_transaction(uuid,numeric,numeric,numeric,uuid,text,text)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0296 failed: missing functions:%', v_missing;
  END IF;

  -- درس 0294: نسخة واحدة من كل دالة أُعيد بناؤها
  FOREACH v_fn IN ARRAY ARRAY['check_assignment_eligibility','log_fuel_transaction'] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION '0296 failed: % has % overloads (must be 1)', v_fn, v_cnt;
    END IF;
  END LOOP;

  IF to_regclass('public.fleet_vehicle_inspections') IS NULL THEN
    RAISE EXCEPTION '0296 failed: DVIR table missing';
  END IF;
  IF to_regclass('public.logistics_safety_compliance') IS NULL
     OR to_regclass('public.logistics_vehicle_safety_status') IS NULL THEN
    RAISE EXCEPTION '0296 failed: safety views missing';
  END IF;

  -- RLS مفعَّل وله سياسة (لا حجب كامل — درس 0282)
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND c.relname='fleet_vehicle_inspections'
                    AND c.relrowsecurity) THEN
    RAISE EXCEPTION '0296 failed: RLS not enabled on inspections';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='fleet_vehicle_inspections') THEN
    RAISE EXCEPTION '0296 failed: inspections has RLS but no policy (total lockout)';
  END IF;

  -- سعة الخزان مُضافة
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='logistics_vehicles'
                    AND column_name='fuel_tank_capacity_l') THEN
    RAISE EXCEPTION '0296 failed: tank capacity column missing';
  END IF;

  -- أعمدة HOS مُضافة
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='fleet_driver_hos_logs' AND column_name='started_at') THEN
    RAISE EXCEPTION '0296 failed: HOS started_at missing';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('record_vehicle_inspection','clear_vehicle_defects',
                       'get_driver_hos_summary','start_driver_duty_period',
                       'end_driver_duty_period','check_assignment_eligibility',
                       'log_fuel_transaction')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0296 failed: anon can execute: %', v_anon;
  END IF;

  IF has_table_privilege('anon','public.fleet_vehicle_inspections','SELECT')
     OR has_table_privilege('anon','public.logistics_safety_compliance','SELECT') THEN
    RAISE EXCEPTION '0296 failed: anon can read safety data';
  END IF;

  RAISE NOTICE '✅ 0296: HOS + DVIR + سعة الخزان — مربوطة بحارس الإسناد';
END $$;
