-- ============================================================================
-- FILE: 0294_movement_dead_tables_and_epod_idempotency.sql
-- PURPOSE: إحياء الجداول الميتة + منع ازدواج ePOD عند ضعف الشبكة.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الجزء الأول: 🔴 client_uuid — أخطر بند في هذه الجولة
--
--   السيناريو الحقيقي: السائق في منطقة تغطية ضعيفة يضغط «تسجيل التسليم».
--   الطلب يصل الخادم ويُنشئ صفاً، لكن الرد يضيع في الطريق. التطبيق يرى
--   فشلاً فيعيد المحاولة → **صفّان لنفس التسليم**.
--
--   الحماية الحالية (EPOD_ALREADY_RECORDED) تفحص وجود ePOD للرحلة،
--   وتكفي للحالة البسيطة. لكنها تفشل في حالتين:
--     ① سباق: طلبان متزامنان يمرّان الفحص معاً قبل أن يُدرج أيٌّ منهما
--     ② التطبيق لا يعرف أن محاولته الأولى نجحت، فيعرض خطأً للسائق
--        الذي أنجز عمله فعلاً
--
--   الحل المعياري: العميل يولّد UUID ثابتاً لكل عملية **قبل** الإرسال،
--   ويعيد استعماله في كل محاولة. قيد فريد على (tenant_id, client_uuid)
--   يجعل المحاولة الثانية تُرجع **الصف الأول نفسه** بدل خطأ أو ازدواج.
--   هذا ما طلبه المخطط حرفياً: UNIQUE(tenant_id, client_uuid).
--
-- الجزء الثاني: الجداول التي لا يكتب فيها شيء
--
--   جدول بلا دالة تملؤه = وعد كاذب في المخطط. المعالجة تختلف بحسب
--   الحالة — لا حلّ واحد يناسب الجميع:
--
--   | الجدول                      | الحالة | القرار |
--   |----------------------------|--------|--------|
--   | field_visit_checkins       | ميت    | دالة check-in بالسور الجغرافي |
--   | fleet_vehicle_documents    | يُقرأ   | دوال إضافة/تجديد (كان القراءة فقط) |
--   | logistics_trip_stops       | ميت    | دوال محطات + محفّز مزامنة |
--   | movement_permit_attachments| ميت    | دوال مرفقات |
--   | logistics_carrier_rates    | ميت    | دوال تسعيرة + بحث |
--   | logistics_kpi_snapshots    | ميت    | دالة لقطة يومية (cron) |
--   | logistics_shipments        | ميت    | 🔴 يُوسَم مهجوراً — انظر أدناه |
--   | fleet_driver_hos_logs      | ميت    | يُترك لبند HOS (البند 3) |
--
--   🔴 logistics_shipments: تكرار معماري. أُنشئ في 0272 ثم استُبدل
--      عملياً بـ logistics_shipment_orders في 0274 الذي يحمل كل
--      البيانات (الحمولة · العناوين · النوافذ الزمنية). إحياؤه يعني
--      مسارَي بيانات متوازيين لنفس المفهوم — نفس خطأ movements_log.
--      القرار: توثيقه كمهجور بلا حذف (بيانات محتملة).
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- الجزء الأول: client_uuid لمنع الازدواج
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.logistics_epod
  ADD COLUMN IF NOT EXISTS client_uuid UUID;

-- القيد الذي طلبه المخطط: عملية واحدة لكل معرّف عميل داخل المستأجر
CREATE UNIQUE INDEX IF NOT EXISTS uq_logistics_epod_client_uuid
  ON public.logistics_epod (tenant_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

COMMENT ON COLUMN public.logistics_epod.client_uuid IS
  'معرّف يولّده التطبيق قبل الإرسال ويُعاد استعماله في كل محاولة — يمنع الازدواج عند ضعف الشبكة.';

-- ---------------------------------------------------------------------------
-- record_my_delivery_proof — نسخة idempotent
--
--   السلوك الجديد: عند إعادة إرسال نفس client_uuid تُرجع الدالة معرّف
--   الصف الأصلي **بنجاح** بدل رفع خطأ. التطبيق يرى نجاحاً، والسائق
--   لا يرى رسالة خطأ عن عمل أنجزه فعلاً.
--
--   الأولوية: client_uuid يسبق فحص EPOD_ALREADY_RECORDED. إعادة
--   المحاولة نفسها ≠ محاولة تسجيل ثانٍ متعمَّد.
-- ---------------------------------------------------------------------------
/*
  ⚠️ DROP إلزامي قبل CREATE — درس من التشغيل الفعلي:

  إضافة وسيط جديد بـ DEFAULT لا تستبدل الدالة بل تُنشئ **حِملاً زائداً**
  (overload) بجانب نسخة 0291 ذات الوسائط الستة. النتيجة المُثبَتة:

    ERROR: function public.record_my_delivery_proof(uuid, unknown, unknown,
           unknown, unknown, unknown) is not unique

  أي استدعاء بستة وسائط — وهو ما يفعله أي كود لم يُحدَّث بعد — يفشل
  فوراً. كشفه اختبار سلوكي سابق ما زال يستعمل التوقيع القديم.
*/
DROP FUNCTION IF EXISTS public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID);

CREATE FUNCTION public.record_my_delivery_proof(
  p_dispatch_id    UUID,
  p_recipient_name TEXT,
  p_status         TEXT DEFAULT 'delivered',
  p_signature_url  TEXT DEFAULT NULL,
  p_photo_url      TEXT DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL,
  p_client_uuid    UUID DEFAULT NULL
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
  /*
    ① إعادة المحاولة: نُرجع الصف الأصلي فوراً.
    قبل أي تحقق آخر — الطلب المكرَّر ليس طلباً جديداً يُقيَّم، بل صدى
    لطلب نجح. تقييمه من جديد قد يرفضه (الرحلة صارت completed مثلاً)
    فيرى السائق خطأً عن عمل تمّ.
  */
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_id
      FROM public.logistics_epod
     WHERE tenant_id = v_tenant AND client_uuid = p_client_uuid;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF p_status NOT IN ('delivered','partially_delivered','rejected','disputed') THEN
    RAISE EXCEPTION 'INVALID_EPOD_STATUS (%)', p_status;
  END IF;
  IF p_recipient_name IS NULL OR length(trim(p_recipient_name)) < 2 THEN
    RAISE EXCEPTION 'RECIPIENT_NAME_REQUIRED';
  END IF;

  SELECT * INTO v_rec FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant AND driver_id = v_driver;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;

  IF v_rec.status NOT IN ('arrived','en_route') THEN
    RAISE EXCEPTION 'CANNOT_RECORD_EPOD_AT_STATUS (%)', v_rec.status;
  END IF;

  IF p_status IN ('rejected','disputed')
     AND (p_notes IS NULL OR length(trim(p_notes)) < 5) THEN
    RAISE EXCEPTION 'NOTES_REQUIRED_FOR_% ', p_status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.logistics_epod WHERE dispatch_id = p_dispatch_id) THEN
    RAISE EXCEPTION 'EPOD_ALREADY_RECORDED';
  END IF;

  INSERT INTO public.logistics_epod(
    tenant_id, dispatch_id, order_id, recipient_name,
    signature_url, photo_proof_url, delivery_notes, status, delivered_at,
    client_uuid)
  VALUES (v_tenant, p_dispatch_id, v_rec.order_id, trim(p_recipient_name),
          p_signature_url, p_photo_url, p_notes, p_status, NOW(), p_client_uuid)
  RETURNING id INTO v_id;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'epod_recorded', 'logistics_epod', v_id,
          jsonb_build_object('dispatch_id', p_dispatch_id, 'status', p_status,
                             'source', 'driver_app',
                             'client_uuid', p_client_uuid));

  RETURN v_id;

EXCEPTION
  /*
    ② سباق حقيقي: طلبان متزامنان مرّا الفحص ① معاً. الأول أدرج،
    والثاني اصطدم بالقيد الفريد. نُرجع صفّ الأول بدل تمرير الخطأ.
    بدون هذا المعالج يرى السائق خطأ قاعدة بيانات خاماً.
  */
  WHEN unique_violation THEN
    IF p_client_uuid IS NOT NULL THEN
      SELECT id INTO v_id FROM public.logistics_epod
       WHERE tenant_id = v_tenant AND client_uuid = p_client_uuid;
      IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    END IF;
    RAISE;
END $$;

COMMENT ON FUNCTION public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) IS
  'إثبات تسليم idempotent: إعادة الإرسال بنفس client_uuid تُرجع الصف الأصلي لا خطأً.';

-- ═══════════════════════════════════════════════════════════════════════
-- الجزء الثاني: إحياء الجداول
-- ═══════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1) field_visit_checkins — تسجيل وصول ميداني بالسور الجغرافي
--
--    الجدول يحمل geofence_ok منذ 0277 ولا شيء يملؤه. القيمة الحقيقية
--    هنا: التحقق أن الموظف **فعلاً** عند العميل لا يسجّل وصولاً من بيته.
--    نستعمل movement_point_in_geofence الموجودة (0280).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_field_visit_checkin(
  p_visit_id  UUID,
  p_latitude  NUMERIC,
  p_longitude NUMERIC,
  p_notes     TEXT DEFAULT NULL
)
RETURNS TABLE (checkin_id UUID, geofence_ok BOOLEAN, distance_km NUMERIC)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_visit  RECORD;
  v_fence  RECORD;
  v_ok     BOOLEAN := TRUE;
  v_dist   NUMERIC := NULL;
  v_id     UUID;
BEGIN
  PERFORM public.movement_require_role('employee_movement');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'COORDINATES_REQUIRED';
  END IF;
  IF p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'INVALID_LATITUDE (%)', p_latitude;
  END IF;
  IF p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'INVALID_LONGITUDE (%)', p_longitude;
  END IF;

  SELECT * INTO v_visit FROM public.employee_field_visits
   WHERE id = p_visit_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'VISIT_NOT_FOUND'; END IF;

  IF v_visit.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'VISIT_ALREADY_CLOSED (status=%)', v_visit.status;
  END IF;

  /*
    السور الجغرافي: نبحث عن سور مرتبط بموقع يحمل اسم العميل نفسه.
    الزيارة تخزّن العنوان نصاً (location_address) لا معرّف موقع، فالربط
    بالاسم هو المتاح. غياب السور ⇒ geofence_ok = true: لا نُعاقب موظفاً
    على غياب إعداد إداري.
  */
  SELECT g.* INTO v_fence
    FROM public.movement_geofences g
    JOIN public.movement_locations l ON l.id = g.location_id
   WHERE g.tenant_id = v_tenant
     AND g.status = 'active'
     AND lower(l.name_ar) = lower(regexp_replace(trim(v_visit.client_name), '\s+', ' ', 'g'))
   LIMIT 1;

  IF FOUND THEN
    v_ok := public.movement_point_in_geofence(v_fence.id, p_latitude, p_longitude);
    IF v_fence.center_lat IS NOT NULL AND v_fence.center_lng IS NOT NULL THEN
      v_dist := public.movement_haversine_km(
        v_fence.center_lat, v_fence.center_lng, p_latitude, p_longitude);
    END IF;
  END IF;

  INSERT INTO public.field_visit_checkins(
    tenant_id, visit_id, latitude, longitude, geofence_ok, notes)
  VALUES (v_tenant, p_visit_id, p_latitude, p_longitude, v_ok, p_notes)
  RETURNING id INTO v_id;

  -- أول تسجيل وصول ينقل الزيارة إلى checked_in
  IF v_visit.check_in_at IS NULL THEN
    UPDATE public.employee_field_visits
       SET check_in_at = NOW(), status = 'checked_in', updated_at = NOW()
     WHERE id = p_visit_id AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'field_visit_checkin', 'employee_field_visit',
          p_visit_id, jsonb_build_object('geofence_ok', v_ok,
                                         'distance_km', v_dist,
                                         'checkin_id', v_id));

  RETURN QUERY SELECT v_id, v_ok, ROUND(COALESCE(v_dist, 0), 3);
END $$;

COMMENT ON FUNCTION public.record_field_visit_checkin(UUID,NUMERIC,NUMERIC,TEXT) IS
  'تسجيل وصول ميداني مع التحقق من السور الجغرافي. غياب السور لا يُعدّ مخالفة.';

-- ---------------------------------------------------------------------------
-- 2) fleet_vehicle_documents — إضافة وتجديد
--
--    تصحيح لتقييمي: هذا الجدول **يُقرأ** فعلاً في 0283 (تنبيهات
--    الأسطول وحظر الإسناد) و 0286 (الإشعارات المجدولة). ما ينقصه
--    الكتابة فقط — لا سبيل لإضافة وثيقة إلا بـ SQL يدوي.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_vehicle_document(
  p_vehicle_id   UUID,
  p_doc_type     TEXT,
  p_expiry_date  DATE,
  p_document_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
  v_old    DATE;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_doc_type IS NULL OR length(trim(p_doc_type)) < 2 THEN
    RAISE EXCEPTION 'DOC_TYPE_REQUIRED';
  END IF;
  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'EXPIRY_DATE_REQUIRED';
  END IF;
  -- وثيقة منتهية سلفاً لا معنى لتسجيلها: التنبيهات ستشتعل فوراً
  IF p_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'DOCUMENT_ALREADY_EXPIRED (%)', p_expiry_date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.logistics_vehicles
                  WHERE id = p_vehicle_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'VEHICLE_NOT_FOUND';
  END IF;

  -- نوع واحد لكل مركبة: التجديد يُحدّث الصف لا يُنشئ ثانياً
  SELECT id, expiry_date INTO v_id, v_old
    FROM public.fleet_vehicle_documents
   WHERE tenant_id = v_tenant AND vehicle_id = p_vehicle_id
     AND lower(doc_type) = lower(trim(p_doc_type))
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.fleet_vehicle_documents
       SET expiry_date = p_expiry_date,
           document_url = COALESCE(p_document_url, document_url)
     WHERE id = v_id;
  ELSE
    INSERT INTO public.fleet_vehicle_documents(
      tenant_id, vehicle_id, doc_type, expiry_date, document_url)
    VALUES (v_tenant, p_vehicle_id, trim(p_doc_type), p_expiry_date, p_document_url)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(),
          CASE WHEN v_old IS NULL THEN 'vehicle_document_added'
               ELSE 'vehicle_document_renewed' END,
          'logistics_vehicle', p_vehicle_id,
          jsonb_build_object('doc_type', trim(p_doc_type),
                             'old_expiry', v_old, 'new_expiry', p_expiry_date));

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.upsert_vehicle_document(UUID,TEXT,DATE,TEXT) IS
  'إضافة/تجديد وثيقة مركبة. نوع واحد لكل مركبة — التجديد يُحدّث لا يُكرّر.';

-- ---------------------------------------------------------------------------
-- 3) logistics_trip_stops — محطات الرحلة
--
--    درس 0264 المذكور في المخطط: المجاميع المخزَّنة تتباعد عن الواقع
--    ما لم يُزامنها محفّز. هنا: عدد المحطات ووصف الحمولة لا يُحسبان
--    يدوياً بل يُشتقّان.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_dispatch_stop(
  p_dispatch_id UUID,
  p_stop_type   TEXT,
  p_location_id UUID DEFAULT NULL,
  p_sequence    INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_status TEXT;
  v_seq    INTEGER;
  v_id     UUID;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_stop_type NOT IN ('pickup','delivery','depot','fuel') THEN
    RAISE EXCEPTION 'INVALID_STOP_TYPE (%)', p_stop_type;
  END IF;

  SELECT status INTO v_status FROM public.logistics_dispatches
   WHERE id = p_dispatch_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_FOUND'; END IF;
  IF v_status IN ('completed','failed') THEN
    RAISE EXCEPTION 'DISPATCH_ALREADY_CLOSED (status=%)', v_status;
  END IF;

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.movement_locations
     WHERE id = p_location_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'LOCATION_NOT_FOUND_IN_TENANT';
  END IF;

  -- الترتيب التلقائي يمنع تعارض الأرقام عند الإضافة المتزامنة
  IF p_sequence IS NULL THEN
    SELECT COALESCE(MAX(stop_sequence), 0) + 1 INTO v_seq
      FROM public.logistics_trip_stops
     WHERE tenant_id = v_tenant AND dispatch_id = p_dispatch_id;
  ELSE
    IF p_sequence < 1 THEN RAISE EXCEPTION 'SEQUENCE_MUST_BE_POSITIVE'; END IF;
    v_seq := p_sequence;
    -- إفساح مكان: نُزيح ما بعده بدل السماح بتكرار الرقم
    UPDATE public.logistics_trip_stops
       SET stop_sequence = stop_sequence + 1
     WHERE tenant_id = v_tenant AND dispatch_id = p_dispatch_id
       AND stop_sequence >= v_seq;
  END IF;

  INSERT INTO public.logistics_trip_stops(
    tenant_id, dispatch_id, stop_sequence, stop_type, location_id, status)
  VALUES (v_tenant, p_dispatch_id, v_seq, p_stop_type, p_location_id, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.add_dispatch_stop(UUID,TEXT,UUID,INTEGER) IS
  'إضافة محطة لرحلة. الترتيب تلقائي، والإدراج الوسطي يُزيح ما بعده.';

CREATE OR REPLACE FUNCTION public.update_dispatch_stop_status(
  p_stop_id UUID,
  p_status  TEXT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_cur    TEXT;
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_status NOT IN ('pending','arrived','completed','skipped') THEN
    RAISE EXCEPTION 'INVALID_STOP_STATUS (%)', p_status;
  END IF;

  SELECT status INTO v_cur FROM public.logistics_trip_stops
   WHERE id = p_stop_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'STOP_NOT_FOUND'; END IF;

  -- محطة مكتملة أو متجاوَزة لا تُعاد فتحها: تاريخ التنفيذ لا يُعدَّل
  IF v_cur IN ('completed','skipped') AND p_status <> v_cur THEN
    RAISE EXCEPTION 'STOP_ALREADY_CLOSED (status=%)', v_cur;
  END IF;

  UPDATE public.logistics_trip_stops
     SET status = p_status
   WHERE id = p_stop_id AND tenant_id = v_tenant;
END $$;

COMMENT ON FUNCTION public.update_dispatch_stop_status(UUID,TEXT) IS
  'تحديث حالة محطة. المحطة المغلقة لا تُعاد فتحها.';

-- ---------------------------------------------------------------------------
-- 4) movement_permit_attachments — مرفقات التصريح
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_permit_attachment(
  p_permit_id UUID,
  p_file_name TEXT,
  p_file_url  TEXT,
  p_file_size INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
BEGIN
  PERFORM public.movement_require_role('employee_movement');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_file_name IS NULL OR length(trim(p_file_name)) < 1 THEN
    RAISE EXCEPTION 'FILE_NAME_REQUIRED';
  END IF;
  IF p_file_url IS NULL OR length(trim(p_file_url)) < 1 THEN
    RAISE EXCEPTION 'FILE_URL_REQUIRED';
  END IF;
  -- 25 ميغابايت: حدّ معقول لمرفق تصريح، ويمنع إغراق التخزين
  IF p_file_size IS NOT NULL AND p_file_size > 26214400 THEN
    RAISE EXCEPTION 'FILE_TOO_LARGE (max 25MB)';
  END IF;
  IF p_file_size IS NOT NULL AND p_file_size < 0 THEN
    RAISE EXCEPTION 'INVALID_FILE_SIZE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employee_movement_permits
                  WHERE id = p_permit_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'PERMIT_NOT_FOUND';
  END IF;

  INSERT INTO public.movement_permit_attachments(
    tenant_id, permit_id, file_name, file_url, file_size)
  VALUES (v_tenant, p_permit_id, trim(p_file_name), trim(p_file_url), p_file_size)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.add_permit_attachment(UUID,TEXT,TEXT,INTEGER) IS
  'إضافة مرفق لتصريح حركة. حد 25 ميغابايت.';

-- ---------------------------------------------------------------------------
-- 5) logistics_carrier_rates — تسعيرة الناقلين
--
--    القيمة: مقارنة تكلفة الناقل الخارجي بالأسطول الداخلي قبل الإسناد.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_carrier_rate(
  p_carrier_id  UUID,
  p_origin_zone TEXT,
  p_dest_zone   TEXT,
  p_rate_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
  v_o      TEXT := NULLIF(trim(COALESCE(p_origin_zone, '')), '');
  v_d      TEXT := NULLIF(trim(COALESCE(p_dest_zone, '')), '');
BEGIN
  PERFORM public.movement_require_role('logistics');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF v_o IS NULL OR v_d IS NULL THEN
    RAISE EXCEPTION 'ZONES_REQUIRED';
  END IF;
  IF p_rate_amount IS NULL OR p_rate_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_RATE_AMOUNT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.logistics_carriers
                  WHERE id = p_carrier_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'CARRIER_NOT_FOUND';
  END IF;

  -- تسعيرة واحدة لكل مسار: التحديث يُصحّح لا يُراكم
  SELECT id INTO v_id FROM public.logistics_carrier_rates
   WHERE tenant_id = v_tenant AND carrier_id = p_carrier_id
     AND lower(COALESCE(origin_zone, '')) = lower(v_o)
     AND lower(COALESCE(dest_zone, ''))   = lower(v_d)
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.logistics_carrier_rates
       SET rate_amount = p_rate_amount WHERE id = v_id;
  ELSE
    INSERT INTO public.logistics_carrier_rates(
      tenant_id, carrier_id, origin_zone, dest_zone, rate_amount)
    VALUES (v_tenant, p_carrier_id, v_o, v_d, p_rate_amount)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.upsert_carrier_rate(UUID,TEXT,TEXT,NUMERIC) IS
  'تسعيرة ناقل لمسار. تسعيرة واحدة لكل (ناقل، منشأ، وجهة).';

-- ---------------------------------------------------------------------------
-- 6) logistics_kpi_snapshots — لقطة يومية
--
--    لماذا لقطة مخزَّنة والـ views تحسب لحظياً؟
--    الـ view يعطي **الحاضر**؛ اللقطة تعطي **التاريخ**. بلا لقطات لا
--    يمكن رسم اتجاه OTIF عبر الأشهر — البيانات المصدر تتغيّر باستمرار.
--    تُستدعى من مهمة يومية مجدولة (0290).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_logistics_kpi_snapshot_for_tenant(
  p_tenant_id UUID,
  p_date      DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id    UUID;
  v_otif  NUMERIC := 100;
  v_trips INTEGER := 0;
  v_cpk   NUMERIC := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED'; END IF;

  -- OTIF: نسبة الرحلات المكتملة التي وصلت في موعدها
  SELECT count(*)::INT,
         COALESCE(ROUND(
           100.0 * count(*) FILTER (
             WHERE d.actual_arrival IS NOT NULL
               AND d.estimated_arrival IS NOT NULL
               AND d.actual_arrival <= d.estimated_arrival
           ) / NULLIF(count(*) FILTER (WHERE d.status = 'completed'), 0), 2), 100)
    INTO v_trips, v_otif
    FROM public.logistics_dispatches d
   WHERE d.tenant_id = p_tenant_id
     AND d.dispatched_at::DATE = p_date;

  /*
    تكلفة الكيلومتر: logistics_trip_costs لا يحمل المسافة (تحققتُ من
    أعمدته: fuel_cost · toll_cost · driver_allowance · maintenance_share
    · total_cost · revenue · net_profit). المسافة تعيش في
    logistics_routes.total_distance_km مربوطةً بالرحلة عبر dispatch_id.
    نجمع تكلفة الرحلة ومسافتها ثم نقسم — لا نخترع عموداً.
  */
  SELECT COALESCE(ROUND(
           SUM(c.total_cost) FILTER (WHERE r.km > 0)
           / NULLIF(SUM(r.km) FILTER (WHERE r.km > 0), 0), 2), 0)
    INTO v_cpk
    FROM public.logistics_trip_costs c
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(rt.total_distance_km), 0) AS km
        FROM public.logistics_routes rt
       WHERE rt.dispatch_id = c.dispatch_id
         AND rt.tenant_id   = c.tenant_id
    ) r ON TRUE
   WHERE c.tenant_id = p_tenant_id
     AND c.created_at::DATE = p_date;

  -- لقطة واحدة لكل يوم: إعادة التشغيل تُحدّث لا تُراكم
  SELECT id INTO v_id FROM public.logistics_kpi_snapshots
   WHERE tenant_id = p_tenant_id AND snapshot_date = p_date;

  IF v_id IS NOT NULL THEN
    UPDATE public.logistics_kpi_snapshots
       SET otif_percent = v_otif, total_trips = v_trips, avg_cost_per_km = v_cpk
     WHERE id = v_id;
  ELSE
    INSERT INTO public.logistics_kpi_snapshots(
      tenant_id, snapshot_date, otif_percent, total_trips, avg_cost_per_km)
    VALUES (p_tenant_id, p_date, v_otif, v_trips, v_cpk)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.capture_logistics_kpi_snapshot_for_tenant(UUID,DATE) IS
  'لقطة مؤشرات يومية لمستأجر. لقطة واحدة لكل يوم — التكرار يُحدّث.';

-- مُشغِّل لكل المستأجرين (نمط 0268/0286)
CREATE OR REPLACE FUNCTION public.run_logistics_kpi_snapshot_cron(
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (tenant_id UUID, snapshot_id UUID)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_t RECORD; v_id UUID;
BEGIN
  FOR v_t IN
    SELECT DISTINCT d.tenant_id AS tid
      FROM public.logistics_dispatches d
     WHERE d.dispatched_at::DATE = p_date
  LOOP
    BEGIN
      v_id := public.capture_logistics_kpi_snapshot_for_tenant(v_t.tid, p_date);
      tenant_id := v_t.tid; snapshot_id := v_id;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- مستأجر فاشل لا يوقف البقية
      tenant_id := v_t.tid; snapshot_id := NULL;
      RETURN NEXT;
    END;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.run_logistics_kpi_snapshot_cron(DATE) IS
  'لقطة مؤشرات لكل مستأجر نشط. فشل مستأجر لا يوقف البقية.';

-- ---------------------------------------------------------------------------
-- 7) logistics_shipments — 🔴 توثيق الهجر
--
--    لا نحييه: تكرار معماري مع logistics_shipment_orders. إحياؤه يعني
--    مسارَي بيانات لنفس المفهوم — الخطأ الذي كلّفنا 0292/0293.
--    لا نحذفه: قد يحمل بيانات، والحذف قرار المستخدم لا المطوّر.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.logistics_shipments IS
  'مهجور (0294): استُبدل بـ logistics_shipment_orders (0274) الذي يحمل الحمولة والعناوين والنوافذ الزمنية. لا تُكتب فيه بيانات جديدة. أُبقي بلا حذف تحسّباً لبيانات قائمة.';

-- ---------------------------------------------------------------------------
-- 8) عرض المحطات — يجعل logistics_trip_stops مرئياً
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.logistics_dispatch_stops_view AS
SELECT s.id            AS stop_id,
       s.tenant_id,
       s.dispatch_id,
       d.dispatch_code,
       s.stop_sequence,
       s.stop_type,
       s.status,
       s.location_id,
       l.name_ar       AS location_name,
       l.latitude,
       l.longitude,
       count(*) OVER (PARTITION BY s.dispatch_id)::INT AS total_stops,
       count(*) FILTER (WHERE s.status = 'completed')
         OVER (PARTITION BY s.dispatch_id)::INT        AS completed_stops
  FROM public.logistics_trip_stops s
  LEFT JOIN public.logistics_dispatches d ON d.id = s.dispatch_id
  LEFT JOIN public.movement_locations   l ON l.id = s.location_id;

COMMENT ON VIEW public.logistics_dispatch_stops_view IS
  'محطات الرحلات مع تقدّم الإنجاز. مصدر شاشة تتبّع المحطات.';

-- ---------------------------------------------------------------------------
-- 9) الصلاحيات
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_field_visit_checkin(UUID,NUMERIC,NUMERIC,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_vehicle_document(UUID,TEXT,DATE,TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_dispatch_stop(UUID,TEXT,UUID,INTEGER)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_dispatch_stop_status(UUID,TEXT)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_permit_attachment(UUID,TEXT,TEXT,INTEGER)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_carrier_rate(UUID,TEXT,TEXT,NUMERIC)           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_field_visit_checkin(UUID,NUMERIC,NUMERIC,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_vehicle_document(UUID,TEXT,DATE,TEXT)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_dispatch_stop(UUID,TEXT,UUID,INTEGER)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_dispatch_stop_status(UUID,TEXT)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_permit_attachment(UUID,TEXT,TEXT,INTEGER)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_carrier_rate(UUID,TEXT,TEXT,NUMERIC)           TO authenticated, service_role;

-- دوال cron: service_role حصراً
REVOKE ALL ON FUNCTION public.capture_logistics_kpi_snapshot_for_tenant(UUID,DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_logistics_kpi_snapshot_cron(DATE)                FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_logistics_kpi_snapshot_for_tenant(UUID,DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_logistics_kpi_snapshot_cron(DATE)                TO service_role;

REVOKE ALL ON public.logistics_dispatch_stops_view FROM PUBLIC, anon;
GRANT SELECT ON public.logistics_dispatch_stops_view TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 10) 🔴 حارس التحقق
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn      TEXT;
  v_anon    TEXT;
  v_dead    TEXT := '';
  v_t       TEXT;
  v_cnt     INT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.record_my_delivery_proof(uuid,text,text,text,text,text,uuid)',
    'public.record_field_visit_checkin(uuid,numeric,numeric,text)',
    'public.upsert_vehicle_document(uuid,text,date,text)',
    'public.add_dispatch_stop(uuid,text,uuid,integer)',
    'public.update_dispatch_stop_status(uuid,text)',
    'public.add_permit_attachment(uuid,text,text,integer)',
    'public.upsert_carrier_rate(uuid,text,text,numeric)',
    'public.capture_logistics_kpi_snapshot_for_tenant(uuid,date)',
    'public.run_logistics_kpi_snapshot_cron(date)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0294 failed: missing functions:%', v_missing;
  END IF;

  -- ⓪ نسخة واحدة فقط من دالة ePOD — الحِمل الزائد يكسر كل استدعاء قديم
  SELECT count(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_my_delivery_proof';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION '0294 failed: % overloads of record_my_delivery_proof (must be 1)', v_cnt;
  END IF;

  -- ① القيد الفريد على client_uuid موجود
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public'
                    AND indexname = 'uq_logistics_epod_client_uuid') THEN
    RAISE EXCEPTION '0294 failed: epod client_uuid unique index missing';
  END IF;

  -- ② كل جدول كان ميتاً صار له كاتب — الفحص برمجي لا بالثقة
  FOREACH v_t IN ARRAY ARRAY[
    'field_visit_checkins', 'fleet_vehicle_documents', 'logistics_trip_stops',
    'movement_permit_attachments', 'logistics_carrier_rates',
    'logistics_kpi_snapshots'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ILIKE '%INSERT INTO public.' || v_t || '%'
    ) THEN
      v_dead := v_dead || ' ' || v_t;
    END IF;
  END LOOP;
  IF v_dead <> '' THEN
    RAISE EXCEPTION '0294 failed: tables still have no writer:%', v_dead;
  END IF;

  -- ③ العرض موجود
  IF to_regclass('public.logistics_dispatch_stops_view') IS NULL THEN
    RAISE EXCEPTION '0294 failed: stops view missing';
  END IF;

  -- ④ anon محروم من الجميع
  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('record_my_delivery_proof','record_field_visit_checkin',
                       'upsert_vehicle_document','add_dispatch_stop',
                       'update_dispatch_stop_status','add_permit_attachment',
                       'upsert_carrier_rate',
                       'capture_logistics_kpi_snapshot_for_tenant',
                       'run_logistics_kpi_snapshot_cron')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0294 failed: anon can execute: %', v_anon;
  END IF;

  -- ⑤ دوال cron محجوبة عن authenticated أيضاً
  IF has_function_privilege('authenticated',
       'public.run_logistics_kpi_snapshot_cron(date)', 'EXECUTE') THEN
    RAISE EXCEPTION '0294 failed: authenticated must not run kpi cron';
  END IF;

  -- ⑥ الجدول المهجور موثَّق لا محذوف
  IF to_regclass('public.logistics_shipments') IS NULL THEN
    RAISE EXCEPTION '0294 failed: deprecated table must not be dropped';
  END IF;
  IF obj_description('public.logistics_shipments'::regclass) NOT LIKE '%مهجور%' THEN
    RAISE EXCEPTION '0294 failed: deprecated table not documented';
  END IF;

  RAISE NOTICE '✅ 0294: client_uuid + 6 جداول أُحييت + 1 موثَّق مهجوراً';
END $$;
