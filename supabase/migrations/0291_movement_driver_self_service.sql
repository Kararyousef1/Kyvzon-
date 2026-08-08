-- ============================================================================
-- FILE: 0291_movement_driver_self_service.sql
-- PURPOSE: طبقة الخدمة الذاتية للسائق — أساس تطبيق السائق PWA.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الفجوة المعمارية (مُثبَتة بفحص المخطط لا مفترَضة):
--
--   1) لا ربط بين السائق والمستخدم:
--      logistics_drivers فيه employee_id UUID **بلا مفتاح خارجي**
--      (فحص pg_constraint: القيد الوحيد هو tenant_id_fkey). أي أن السائق
--      كيان بيانات محض لا حساب دخول.
--
--   2) كل دوال الحركة تتطلب movement_require_role('logistics') —
--      وهو دور **مكتبي** يمنح رؤية الأسطول كاملاً وتعديل المركبات
--      والتكاليف. منحه لسائق يعني أن أي سائق يرى كل شيء ويعدّل كل شيء.
--
--   3) سياسة RLS على logistics_dispatches هي
--        (tenant_id = current_user_tenant_id())
--      بلا أي تضييق على السائق: سائق بدور logistics يقرأ رحلات
--      كل زملائه.
--
--   ⇒ النتيجة: تطبيق السائق كان **مستحيلاً أمنياً** لا ناقصاً واجهةً.
--     بناء واجهة سائق فوق هذا الأساس كان سيتطلب منحه دور logistics
--     الكامل — ثغرة تصعيد صلاحيات لكل سائق في الأسطول.
--
-- الحل هنا:
--   • ربط موثَّق بمفتاح خارجي: logistics_drivers.user_id → profiles.id
--   • دوال self-service تتحقق أن المستدعي **هو السائق المُسنَد للرحلة**
--     — لا تتطلب دور logistics إطلاقاً
--   • كل دالة تعمل على رحلات هذا السائق وحده
--
-- المبدأ: السائق لا يحتاج دوراً جديداً في UserRole. هويته تُشتق من
--   ارتباط صفّه في logistics_drivers بحسابه — أضيق صلاحية ممكنة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) ربط السائق بحساب المستخدم
-- ---------------------------------------------------------------------------
ALTER TABLE public.logistics_drivers
  ADD COLUMN IF NOT EXISTS user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'logistics_drivers_user_id_fkey'
       AND conrelid = 'public.logistics_drivers'::regclass
  ) THEN
    ALTER TABLE public.logistics_drivers
      ADD CONSTRAINT logistics_drivers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- حساب واحد لا يكون سائقَين في المستأجر نفسه
CREATE UNIQUE INDEX IF NOT EXISTS uq_logistics_driver_user
  ON public.logistics_drivers (tenant_id, user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.logistics_drivers.user_id IS
  'حساب دخول السائق — أساس الخدمة الذاتية. NULL يعني سائق بلا تطبيق.';

-- ---------------------------------------------------------------------------
-- 2) هوية السائق الحالي
--
--    STABLE لأنها تُستدعى مراراً داخل الاستعلام الواحد وسياقها ثابت
--    خلاله. تُرجع NULL لغير السائقين بدل رفع استثناء — المستدعي يقرّر.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id
    FROM public.logistics_drivers d
   WHERE d.user_id   = auth.uid()
     AND d.tenant_id = public.current_user_tenant_id()
     AND d.status <> 'suspended'
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_driver_id() IS
  'معرّف السائق المرتبط بالمستخدم الحالي، أو NULL. السائق الموقوف يُعامَل كغير سائق.';

CREATE OR REPLACE FUNCTION public.movement_require_driver()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_driver UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF public.current_user_tenant_id() IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  v_driver := public.current_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'NOT_A_DRIVER';
  END IF;
  RETURN v_driver;
END $$;

COMMENT ON FUNCTION public.movement_require_driver() IS
  'حارس السائق: يرفع NOT_A_DRIVER لغير المرتبطين. نظير movement_require_role للسائقين.';

-- ---------------------------------------------------------------------------
-- 3) ربط سائق بحساب — عملية إدارية بدور logistics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_driver_account(
  p_driver_id UUID,
  p_user_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.logistics_drivers
                  WHERE id = p_driver_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'DRIVER_NOT_FOUND';
  END IF;

  -- الحساب يجب أن يكون في المستأجر نفسه — لا ربط عابر للمستأجرين
  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'USER_NOT_IN_TENANT';
  END IF;

  IF p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.logistics_drivers
     WHERE tenant_id = v_tenant AND user_id = p_user_id AND id <> p_driver_id
  ) THEN
    RAISE EXCEPTION 'USER_ALREADY_LINKED_TO_ANOTHER_DRIVER';
  END IF;

  UPDATE public.logistics_drivers
     SET user_id = p_user_id, updated_at = NOW()
   WHERE id = p_driver_id AND tenant_id = v_tenant;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'driver_account_linked', 'logistics_driver',
          p_driver_id, jsonb_build_object('user_id', p_user_id,
                                          'unlinked', (p_user_id IS NULL)));
END $$;

COMMENT ON FUNCTION public.link_driver_account(UUID, UUID) IS
  'ربط/فك ربط سائق بحساب دخول. NULL يفك الربط ويُعطّل تطبيق السائق له.';

-- ---------------------------------------------------------------------------
-- 4) رحلات السائق الحالي — ما يراه في تطبيقه
--
--    ⚠️ هذا هو جوهر التضييق: السائق يرى رحلاته هو فقط، لا رحلات
--    زملائه. لا عمود تكلفة ولا ربحية ولا بيانات ناقلين.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_driver_trips(
  p_include_closed BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  dispatch_id       UUID,
  dispatch_code     TEXT,
  status            TEXT,
  dispatched_at     TIMESTAMPTZ,
  estimated_arrival TIMESTAMPTZ,
  actual_arrival    TIMESTAMPTZ,
  order_id          UUID,
  order_code        TEXT,
  origin_address    TEXT,
  destination_address TEXT,
  cargo_description TEXT,
  cargo_weight_kg   NUMERIC,
  priority          TEXT,
  vehicle_id        UUID,
  vehicle_code      TEXT,
  plate_number      TEXT,
  has_epod          BOOLEAN,
  last_ping_at      TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT d.id,
         d.dispatch_code::TEXT,
         d.status::TEXT,
         d.dispatched_at,
         d.estimated_arrival,
         d.actual_arrival,
         o.id,
         o.order_code::TEXT,
         o.origin_address::TEXT,
         o.destination_address::TEXT,
         o.cargo_description::TEXT,
         o.cargo_weight_kg,
         o.priority::TEXT,
         v.id,
         v.vehicle_code::TEXT,
         v.plate_number::TEXT,
         EXISTS (SELECT 1 FROM public.logistics_epod e WHERE e.dispatch_id = d.id),
         (SELECT MAX(t.recorded_at) FROM public.logistics_telemetry t
           WHERE t.dispatch_id = d.id)
    FROM public.logistics_dispatches d
    LEFT JOIN public.logistics_shipment_orders o ON o.id = d.order_id
    LEFT JOIN public.logistics_vehicles v        ON v.id = d.vehicle_id
   WHERE d.tenant_id = v_tenant
     AND d.driver_id = v_driver
     AND (p_include_closed OR d.status NOT IN ('completed','failed'))
   ORDER BY
     CASE d.status WHEN 'en_route' THEN 1 WHEN 'dispatched' THEN 2
                   WHEN 'arrived'  THEN 3 ELSE 4 END,
     d.dispatched_at DESC NULLS LAST;
END $$;

COMMENT ON FUNCTION public.get_my_driver_trips(BOOLEAN) IS
  'رحلات السائق الحالي فقط. لا تكاليف ولا بيانات زملاء — أضيق نطاق ممكن.';

-- ---------------------------------------------------------------------------
-- 5) تسجيل موقع من تطبيق السائق
--
--    نظير record_vehicle_telemetry لكن بحارس السائق لا حارس logistics،
--    ويستنتج المركبة من الرحلة بدل قبولها من العميل: السائق لا يجوز
--    أن يسجّل موقعاً لمركبة ليست في رحلته.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_driver_position(
  p_dispatch_id UUID,
  p_latitude    NUMERIC,
  p_longitude   NUMERIC,
  p_speed_kmh   NUMERIC DEFAULT 0,
  p_heading     NUMERIC DEFAULT 0,
  p_recorded_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver  UUID := public.movement_require_driver();
  v_tenant  UUID := public.current_user_tenant_id();
  v_vehicle UUID;
  v_status  TEXT;
  v_at      TIMESTAMPTZ;
  v_id      UUID;
BEGIN
  SELECT d.vehicle_id, d.status INTO v_vehicle, v_status
    FROM public.logistics_dispatches d
   WHERE d.id = p_dispatch_id
     AND d.tenant_id = v_tenant
     AND d.driver_id = v_driver;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU';
  END IF;
  IF v_status IN ('completed','failed') THEN
    RAISE EXCEPTION 'DISPATCH_ALREADY_CLOSED (status=%)', v_status;
  END IF;
  IF v_vehicle IS NULL THEN
    RAISE EXCEPTION 'DISPATCH_HAS_NO_VEHICLE';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'COORDINATES_REQUIRED';
  END IF;
  IF p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'INVALID_LATITUDE (%)', p_latitude;
  END IF;
  IF p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'INVALID_LONGITUDE (%)', p_longitude;
  END IF;
  IF COALESCE(p_speed_kmh, 0) < 0 OR COALESCE(p_speed_kmh, 0) > 300 THEN
    RAISE EXCEPTION 'INVALID_SPEED (%)', p_speed_kmh;
  END IF;

  /*
    p_recorded_at يدعم الرفع دفعةً واحدة بعد انقطاع الشبكة: التطبيق
    يخزّن النقاط محلياً ويرفعها لاحقاً بأزمنتها الأصلية.
    حراسة إلزامية: لا زمن مستقبلي (ساعة تسامح لانحراف ساعة الجهاز)،
    ولا أقدم من 7 أيام — وإلا لأمكن تلويث السجل بتاريخ مزوَّر.
  */
  v_at := COALESCE(p_recorded_at, NOW());
  IF v_at > NOW() + interval '1 hour' THEN
    RAISE EXCEPTION 'RECORDED_AT_IN_FUTURE';
  END IF;
  IF v_at < NOW() - interval '7 days' THEN
    RAISE EXCEPTION 'RECORDED_AT_TOO_OLD';
  END IF;

  INSERT INTO public.logistics_telemetry(
    tenant_id, vehicle_id, dispatch_id, latitude, longitude,
    speed_kmh, heading, recorded_at)
  VALUES (v_tenant, v_vehicle, p_dispatch_id, p_latitude, p_longitude,
          COALESCE(p_speed_kmh, 0), COALESCE(p_heading, 0), v_at)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.record_driver_position(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TIMESTAMPTZ) IS
  'تسجيل موقع من تطبيق السائق. المركبة تُستنتج من الرحلة. يدعم الرفع المؤجَّل بعد انقطاع الشبكة.';

-- ---------------------------------------------------------------------------
-- 6) رفع دفعة مواقع — الوضع دون اتصال
--
--    التطبيق يخزّن النقاط في IndexedDB أثناء الانقطاع ويرفعها دفعةً.
--    نقطة فاسدة واحدة يجب ألا تُسقط الدفعة كلها: تُتخطّى وتُحصى.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_driver_position_batch(
  p_dispatch_id UUID,
  p_points      JSONB
)
RETURNS TABLE (accepted INTEGER, rejected INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver   UUID := public.movement_require_driver();
  v_tenant   UUID := public.current_user_tenant_id();
  v_vehicle  UUID;
  v_status   TEXT;
  v_pt       JSONB;
  v_ok       INTEGER := 0;
  v_bad      INTEGER := 0;
  v_lat      NUMERIC;
  v_lng      NUMERIC;
  v_spd      NUMERIC;
  v_hdg      NUMERIC;
  v_at       TIMESTAMPTZ;
BEGIN
  IF p_points IS NULL OR jsonb_typeof(p_points) <> 'array' THEN
    RAISE EXCEPTION 'POINTS_MUST_BE_ARRAY';
  END IF;
  IF jsonb_array_length(p_points) > 500 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE (max 500)';
  END IF;

  SELECT d.vehicle_id, d.status INTO v_vehicle, v_status
    FROM public.logistics_dispatches d
   WHERE d.id = p_dispatch_id
     AND d.tenant_id = v_tenant
     AND d.driver_id = v_driver;

  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;
  IF v_vehicle IS NULL THEN RAISE EXCEPTION 'DISPATCH_HAS_NO_VEHICLE'; END IF;

  FOR v_pt IN SELECT * FROM jsonb_array_elements(p_points) LOOP
    BEGIN
      v_lat := (v_pt->>'lat')::NUMERIC;
      v_lng := (v_pt->>'lng')::NUMERIC;
      v_spd := COALESCE((v_pt->>'speed')::NUMERIC, 0);
      v_hdg := COALESCE((v_pt->>'heading')::NUMERIC, 0);
      v_at  := COALESCE((v_pt->>'at')::TIMESTAMPTZ, NOW());

      IF v_lat IS NULL OR v_lng IS NULL
         OR v_lat < -90 OR v_lat > 90 OR v_lng < -180 OR v_lng > 180
         OR v_spd < 0 OR v_spd > 300
         OR v_at > NOW() + interval '1 hour'
         OR v_at < NOW() - interval '7 days' THEN
        v_bad := v_bad + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.logistics_telemetry(
        tenant_id, vehicle_id, dispatch_id, latitude, longitude,
        speed_kmh, heading, recorded_at)
      VALUES (v_tenant, v_vehicle, p_dispatch_id, v_lat, v_lng, v_spd, v_hdg, v_at);
      v_ok := v_ok + 1;

    EXCEPTION WHEN OTHERS THEN
      -- نقطة مشوَّهة (نص بدل رقم مثلاً) تُتخطّى ولا تُسقط الدفعة
      v_bad := v_bad + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_ok, v_bad;
END $$;

COMMENT ON FUNCTION public.record_driver_position_batch(UUID, JSONB) IS
  'رفع دفعة مواقع بعد انقطاع الشبكة. النقاط الفاسدة تُتخطّى وتُحصى بدل إسقاط الدفعة.';

-- ---------------------------------------------------------------------------
-- 7) تحديث حالة الرحلة من تطبيق السائق
--
--    آلة الحالات نفسها في update_dispatch_status (0284) — لكن السائق
--    لا يملك 'failed': إعلان فشل رحلة قرار تشغيلي للمُرسِل لا للسائق.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_trip_status(
  p_dispatch_id UUID,
  p_status      TEXT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
  v_rec    RECORD;
  v_ok     BOOLEAN;
BEGIN
  IF p_status NOT IN ('en_route','arrived','completed') THEN
    RAISE EXCEPTION 'DRIVER_CANNOT_SET_STATUS (%) — الفشل يُعلنه المُرسِل', p_status;
  END IF;

  SELECT * INTO v_rec FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant AND driver_id = v_driver
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;

  IF v_rec.status IN ('completed','failed') THEN
    RAISE EXCEPTION 'DISPATCH_ALREADY_CLOSED (status=%)', v_rec.status;
  END IF;

  v_ok := (v_rec.status = 'dispatched' AND p_status = 'en_route')
       OR (v_rec.status = 'en_route'   AND p_status = 'arrived')
       OR (v_rec.status = 'arrived'    AND p_status = 'completed');
  IF NOT v_ok THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION (% → %)', v_rec.status, p_status;
  END IF;

  -- الإغلاق يتطلب إثبات تسليم: بلا ePOD لا اكتمال
  IF p_status = 'completed' AND NOT EXISTS (
    SELECT 1 FROM public.logistics_epod e WHERE e.dispatch_id = p_dispatch_id
  ) THEN
    RAISE EXCEPTION 'EPOD_REQUIRED_BEFORE_COMPLETION';
  END IF;

  UPDATE public.logistics_dispatches
     SET status = p_status,
         actual_arrival = CASE WHEN p_status = 'arrived' THEN NOW() ELSE actual_arrival END,
         updated_at = NOW()
   WHERE id = p_dispatch_id AND tenant_id = v_tenant;

  IF p_status = 'completed' THEN
    UPDATE public.logistics_vehicles
       SET status = 'available', updated_at = NOW()
     WHERE id = v_rec.vehicle_id AND tenant_id = v_tenant AND status = 'on_trip';

    UPDATE public.logistics_shipment_orders
       SET status = 'delivered', updated_at = NOW()
     WHERE id = v_rec.order_id AND tenant_id = v_tenant;

  ELSIF p_status = 'en_route' THEN
    UPDATE public.logistics_shipment_orders
       SET status = 'in_transit', updated_at = NOW()
     WHERE id = v_rec.order_id AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'dispatch_status_changed', 'logistics_dispatch',
          p_dispatch_id, jsonb_build_object('old_status', v_rec.status,
                                            'new_status', p_status,
                                            'source', 'driver_app',
                                            'driver_id', v_driver));
END $$;

COMMENT ON FUNCTION public.update_my_trip_status(UUID, TEXT) IS
  'تحديث حالة رحلة السائق. لا يملك failed، والإكمال يتطلب ePOD.';

-- ---------------------------------------------------------------------------
-- 8) إثبات التسليم من تطبيق السائق
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_my_delivery_proof(
  p_dispatch_id    UUID,
  p_recipient_name TEXT,
  p_status         TEXT DEFAULT 'delivered',
  p_signature_url  TEXT DEFAULT NULL,
  p_photo_url      TEXT DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
  v_rec    RECORD;
  v_id     UUID;
BEGIN
  IF p_status NOT IN ('delivered','partially_delivered','rejected','disputed') THEN
    RAISE EXCEPTION 'INVALID_EPOD_STATUS (%)', p_status;
  END IF;
  IF p_recipient_name IS NULL OR length(trim(p_recipient_name)) < 2 THEN
    RAISE EXCEPTION 'RECIPIENT_NAME_REQUIRED';
  END IF;

  SELECT * INTO v_rec FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant AND driver_id = v_driver;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;

  -- لا إثبات تسليم قبل الوصول
  IF v_rec.status NOT IN ('arrived','en_route') THEN
    RAISE EXCEPTION 'CANNOT_RECORD_EPOD_AT_STATUS (%)', v_rec.status;
  END IF;

  -- الرفض والنزاع يتطلبان سبباً مكتوباً — وإلا لا قيمة للسجل
  IF p_status IN ('rejected','disputed')
     AND (p_notes IS NULL OR length(trim(p_notes)) < 5) THEN
    RAISE EXCEPTION 'NOTES_REQUIRED_FOR_% ', p_status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.logistics_epod WHERE dispatch_id = p_dispatch_id) THEN
    RAISE EXCEPTION 'EPOD_ALREADY_RECORDED';
  END IF;

  INSERT INTO public.logistics_epod(
    tenant_id, dispatch_id, order_id, recipient_name,
    signature_url, photo_proof_url, delivery_notes, status, delivered_at)
  VALUES (v_tenant, p_dispatch_id, v_rec.order_id, trim(p_recipient_name),
          p_signature_url, p_photo_url, p_notes, p_status, NOW())
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'epod_recorded', 'logistics_epod', v_id,
          jsonb_build_object('dispatch_id', p_dispatch_id, 'status', p_status,
                             'source', 'driver_app'));

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) IS
  'إثبات تسليم من تطبيق السائق. الرفض والنزاع يتطلبان ملاحظات.';

-- ---------------------------------------------------------------------------
-- 9) ملخّص يوم السائق — رأس شاشة التطبيق
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_driver_summary()
RETURNS TABLE (
  driver_id        UUID,
  driver_name_ar   TEXT,
  license_expiry_date DATE,
  license_days_left   INTEGER,
  safety_score     NUMERIC,
  active_trips     INTEGER,
  completed_today  INTEGER,
  km_today         NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT d.id,
         d.driver_name_ar::TEXT,
         d.license_expiry_date,
         (d.license_expiry_date - CURRENT_DATE)::INT,
         d.safety_score,
         (SELECT count(*)::INT FROM public.logistics_dispatches x
           WHERE x.driver_id = d.id AND x.tenant_id = v_tenant
             AND x.status NOT IN ('completed','failed')),
         (SELECT count(*)::INT FROM public.logistics_dispatches x
           WHERE x.driver_id = d.id AND x.tenant_id = v_tenant
             AND x.status = 'completed' AND x.updated_at::DATE = CURRENT_DATE),
         COALESCE((
           SELECT ROUND(SUM(public.movement_haversine_km(
                    p.plat, p.plng, p.latitude, p.longitude)), 2)
             FROM (SELECT t.latitude, t.longitude,
                          LAG(t.latitude)  OVER w AS plat,
                          LAG(t.longitude) OVER w AS plng
                     FROM public.logistics_telemetry t
                     JOIN public.logistics_dispatches dd ON dd.id = t.dispatch_id
                    WHERE dd.driver_id = d.id
                      AND t.tenant_id = v_tenant
                      AND t.recorded_at >= CURRENT_DATE
                   WINDOW w AS (PARTITION BY t.dispatch_id ORDER BY t.recorded_at)
                  ) p
            WHERE p.plat IS NOT NULL), 0)
    FROM public.logistics_drivers d
   WHERE d.id = v_driver AND d.tenant_id = v_tenant;
END $$;

COMMENT ON FUNCTION public.get_my_driver_summary() IS
  'ملخّص يوم السائق: رحلات نشطة، مكتملة اليوم، مسافة مقطوعة، وصلاحية الرخصة.';

-- ---------------------------------------------------------------------------
-- 10) الصلاحيات
--
--     دوال السائق تُمنح لـ authenticated لأن السائق مستخدم عادي بلا
--     دور خاص — الحماية داخل الدالة عبر movement_require_driver().
--     anon محروم من الجميع.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.current_driver_id()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movement_require_driver()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_driver_account(UUID,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_driver_trips(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_driver_position(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_driver_position_batch(UUID,JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_trip_status(UUID,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_driver_summary()      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_driver_id()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.movement_require_driver()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_driver_account(UUID,UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_driver_trips(BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_driver_position(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_driver_position_batch(UUID,JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_trip_status(UUID,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_driver_summary()      TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 11) حارس التحقق
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn      TEXT;
  v_anon    TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.current_driver_id()',
    'public.movement_require_driver()',
    'public.link_driver_account(uuid,uuid)',
    'public.get_my_driver_trips(boolean)',
    'public.record_driver_position(uuid,numeric,numeric,numeric,numeric,timestamp with time zone)',
    'public.record_driver_position_batch(uuid,jsonb)',
    'public.update_my_trip_status(uuid,text)',
    'public.record_my_delivery_proof(uuid,text,text,text,text,text)',
    'public.get_my_driver_summary()'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0291 failed: missing functions:%', v_missing;
  END IF;

  -- الربط لا بد أن يكون موثَّقاً بمفتاح خارجي لا عموداً حراً
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'logistics_drivers_user_id_fkey'
       AND conrelid = 'public.logistics_drivers'::regclass
  ) THEN
    RAISE EXCEPTION '0291 failed: driver user_id FK missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_logistics_driver_user'
  ) THEN
    RAISE EXCEPTION '0291 failed: unique driver-user index missing';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('current_driver_id','movement_require_driver',
                       'link_driver_account','get_my_driver_trips',
                       'record_driver_position','record_driver_position_batch',
                       'update_my_trip_status','record_my_delivery_proof',
                       'get_my_driver_summary')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0291 failed: anon can execute: %', v_anon;
  END IF;

  -- دوال القراءة يجب أن تبقى STABLE
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('current_driver_id','get_my_driver_trips','get_my_driver_summary')
       AND p.provolatile <> 's'
  ) THEN
    RAISE EXCEPTION '0291 failed: driver read functions must be STABLE';
  END IF;

  RAISE NOTICE '✅ 0291: driver self-service layer applied (9 functions)';
END $$;
