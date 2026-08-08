-- ============================================================================
-- 0286 — الإشعارات المجدولة والتتبع الحي — الجولة الخامسة
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقص المعالَج:
--
-- ① لا إشعارات إطلاقاً. البوابة ترصد أشياء حرجة ولا تُبلّغ أحداً:
--      • رخص سائقين تنتهي        → سائق يُمنع من العمل فجأة
--      • وثائق مركبات تنتهي      → مخالفة قانونية على الطريق
--      • تصاريح موظفين متأخرة    → لا أحد يعلم أن موظفاً لم يعد
--      • رحلات تجاوزت موعدها     → العميل يتصل قبل أن نعلم
--      • عقود ناقلين تنتهي
--    من لا يفتح الصفحة لا يعلم. هذا يُفرغ كل الرصد من قيمته.
--
-- ② logistics_telemetry جدول ميت — لا دالة تكتب إليه ولا view يقرأه.
--    صفحة التتبع الحي تعرض جدولاً فارغاً بلا مصدر بيانات.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ الدرس المستفاد من 0268 (مطبَّق هنا حرفياً):
--   دوال cron **لا يمكن** أن تعتمد على current_user_tenant_id() لأن
--   المُشغِّل يعمل بـ service_role بلا جلسة ⇒ NO_TENANT.
--   لذا: نسخ *_for_tenant تستقبل p_tenant_id صراحةً + مُشغِّل يمرّ على
--   كل المستأجرين المفعِّلين لوحدة movement.
--
--   وكذلك: REVOKE FROM PUBLIC لا يكفي — منحة Supabase التلقائية
--   لـ anon صريحة ويجب سحبها صراحةً.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) سجل منع التكرار — لا يُرسَل نفس الإشعار مرتين في اليوم
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movement_notification_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notification_kind TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         UUID NOT NULL,
  severity          TEXT,
  sent_on           DATE NOT NULL DEFAULT CURRENT_DATE,
  recipients_count  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, notification_kind, entity_id, severity, sent_on)
);
CREATE INDEX IF NOT EXISTS idx_movement_notif_log_tenant
  ON public.movement_notification_log(tenant_id, sent_on DESC);

ALTER TABLE public.movement_notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kyvzon_movement_notification_log_select ON public.movement_notification_log;
CREATE POLICY kyvzon_movement_notification_log_select ON public.movement_notification_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());
-- الكتابة لـ service_role فقط (cron) — لا سياسة INSERT لـ authenticated

-- ─────────────────────────────────────────────────────────────────────────
-- 2) مساعد الإشعار — بلا اعتماد على الجلسة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_movement_roles_for_tenant(
  p_tenant_id     UUID,
  p_portal_roles  TEXT[],
  p_type          TEXT,
  p_title         TEXT,
  p_message       TEXT,
  p_related_table TEXT DEFAULT NULL,
  p_related_id    UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN 0; END IF;

  -- المستقبلون: أصحاب أدوار الحركة النشطة + مديرو النظام
  INSERT INTO public.notifications(
    tenant_id, user_id, type, title, message, related_table, related_id)
  SELECT DISTINCT p_tenant_id, pr.id, p_type, p_title, p_message,
         p_related_table, p_related_id
  FROM public.profiles pr
  WHERE pr.tenant_id = p_tenant_id
    AND (
      EXISTS (
        SELECT 1 FROM public.movement_role_assignments a
         WHERE a.tenant_id = p_tenant_id AND a.user_id = pr.id
           AND a.is_active = TRUE
           AND (a.portal_role = ANY(p_portal_roles)
                OR a.portal_role = 'movement_manager')
      )
      OR pr.role IN ('admin', 'hr')
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.notify_movement_roles_for_tenant(UUID,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_movement_roles_for_tenant(UUID,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_movement_roles_for_tenant(UUID,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) رخص السائقين المنتهية أو المقاربة (90/30/7)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_driver_license_alerts_for_tenant(
  p_tenant_id UUID
)
RETURNS TABLE(entities INTEGER, notifications INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD; v_ent INTEGER := 0; v_notif INTEGER := 0;
  v_sent INTEGER; v_sev TEXT;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN QUERY SELECT 0, 0; RETURN; END IF;

  FOR v_row IN
    SELECT d.id, d.driver_name_ar, d.license_expiry_date,
           (d.license_expiry_date - CURRENT_DATE)::INT AS days_left
      FROM public.logistics_drivers d
     WHERE d.tenant_id = p_tenant_id
       AND d.status <> 'off_duty'
       AND d.license_expiry_date <= CURRENT_DATE + 90
  LOOP
    v_sev := CASE
      WHEN v_row.days_left < 0  THEN 'expired'
      WHEN v_row.days_left <= 7 THEN 'critical'
      WHEN v_row.days_left <= 30 THEN 'urgent'
      ELSE 'upcoming' END;

    IF EXISTS (
      SELECT 1 FROM public.movement_notification_log
       WHERE tenant_id = p_tenant_id AND notification_kind = 'driver_license'
         AND entity_id = v_row.id AND severity = v_sev AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_movement_roles_for_tenant(
      p_tenant_id, ARRAY['logistics'], 'driver_license_expiry',
      CASE v_sev
        WHEN 'expired'  THEN 'عاجل: رخصة سائق منتهية'
        WHEN 'critical' THEN 'رخصة سائق تنتهي خلال أيام'
        WHEN 'urgent'   THEN 'رخصة سائق تنتهي خلال شهر'
        ELSE 'تذكير: رخصة سائق تنتهي قريباً' END,
      'رخصة السائق ' || v_row.driver_name_ar ||
      CASE WHEN v_row.days_left < 0
           THEN ' منتهية منذ ' || ABS(v_row.days_left)::TEXT || ' يوماً — يُمنع إسناده لأي رحلة.'
           ELSE ' تنتهي بعد ' || v_row.days_left::TEXT || ' يوماً.' END,
      'logistics_drivers', v_row.id);

    INSERT INTO public.movement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, severity, recipients_count)
    VALUES (p_tenant_id, 'driver_license', 'logistics_driver', v_row.id, v_sev, v_sent);

    v_ent := v_ent + 1; v_notif := v_notif + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_ent, v_notif;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_driver_license_alerts_for_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_driver_license_alerts_for_tenant(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_driver_license_alerts_for_tenant(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) وثائق المركبات المنتهية
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_vehicle_document_alerts_for_tenant(
  p_tenant_id UUID
)
RETURNS TABLE(entities INTEGER, notifications INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD; v_ent INTEGER := 0; v_notif INTEGER := 0;
  v_sent INTEGER; v_sev TEXT;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN QUERY SELECT 0, 0; RETURN; END IF;

  FOR v_row IN
    SELECT fd.id, fd.doc_type, fd.expiry_date, v.vehicle_code,
           (fd.expiry_date - CURRENT_DATE)::INT AS days_left
      FROM public.fleet_vehicle_documents fd
      JOIN public.logistics_vehicles v ON v.id = fd.vehicle_id
     WHERE fd.tenant_id = p_tenant_id
       AND v.status <> 'out_of_service'
       AND fd.expiry_date <= CURRENT_DATE + 90
  LOOP
    v_sev := CASE
      WHEN v_row.days_left < 0  THEN 'expired'
      WHEN v_row.days_left <= 7 THEN 'critical'
      WHEN v_row.days_left <= 30 THEN 'urgent'
      ELSE 'upcoming' END;

    IF EXISTS (
      SELECT 1 FROM public.movement_notification_log
       WHERE tenant_id = p_tenant_id AND notification_kind = 'vehicle_document'
         AND entity_id = v_row.id AND severity = v_sev AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_movement_roles_for_tenant(
      p_tenant_id, ARRAY['logistics'], 'vehicle_document_expiry',
      CASE WHEN v_row.days_left < 0
           THEN 'عاجل: وثيقة مركبة منتهية'
           ELSE 'وثيقة مركبة على وشك الانتهاء' END,
      'وثيقة ' || v_row.doc_type || ' للمركبة ' || v_row.vehicle_code ||
      CASE WHEN v_row.days_left < 0
           THEN ' منتهية منذ ' || ABS(v_row.days_left)::TEXT || ' يوماً — تُمنع المركبة من الإسناد.'
           ELSE ' تنتهي بعد ' || v_row.days_left::TEXT || ' يوماً.' END,
      'fleet_vehicle_documents', v_row.id);

    INSERT INTO public.movement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, severity, recipients_count)
    VALUES (p_tenant_id, 'vehicle_document', 'fleet_vehicle_document', v_row.id, v_sev, v_sent);

    v_ent := v_ent + 1; v_notif := v_notif + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_ent, v_notif;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_vehicle_document_alerts_for_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_vehicle_document_alerts_for_tenant(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_vehicle_document_alerts_for_tenant(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) تصاريح الموظفين المتأخرة (الدور «أ»)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_overdue_permit_alerts_for_tenant(
  p_tenant_id       UUID,
  p_grace_minutes   INTEGER DEFAULT 15
)
RETURNS TABLE(entities INTEGER, notifications INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD; v_ent INTEGER := 0; v_notif INTEGER := 0; v_sent INTEGER;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN QUERY SELECT 0, 0; RETURN; END IF;

  FOR v_row IN
    -- الاسم من profiles: الجدول يخزّن employee_id فقط
    SELECT l.id,
           COALESCE(pr.full_name, pr.email, 'موظف') AS employee_name,
           l.destination_name, l.departure_at,
           EXTRACT(EPOCH FROM (NOW() - l.expected_return_at))::INT / 60 AS minutes_late
      FROM public.employee_movements_log l
      LEFT JOIN public.profiles pr ON pr.id = l.employee_id
     WHERE l.tenant_id = p_tenant_id
       AND l.status = 'out'
       AND NOW() > l.expected_return_at
            + (GREATEST(COALESCE(p_grace_minutes, 15), 0) || ' minutes')::INTERVAL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.movement_notification_log
       WHERE tenant_id = p_tenant_id AND notification_kind = 'permit_overdue'
         AND entity_id = v_row.id AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_movement_roles_for_tenant(
      p_tenant_id, ARRAY['employee_movement'], 'permit_overdue',
      'تأخر عودة موظف',
      'الموظف ' || COALESCE(v_row.employee_name, 'غير معروف') ||
      ' خرج إلى ' || COALESCE(v_row.destination_name, 'وجهة غير محددة') ||
      ' ولم يعد — متأخر ' || GREATEST(v_row.minutes_late, 0)::TEXT || ' دقيقة.',
      'employee_movements_log', v_row.id);

    INSERT INTO public.movement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, severity, recipients_count)
    VALUES (p_tenant_id, 'permit_overdue', 'employee_movement_log', v_row.id, 'overdue', v_sent);

    v_ent := v_ent + 1; v_notif := v_notif + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_ent, v_notif;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_overdue_permit_alerts_for_tenant(UUID,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_overdue_permit_alerts_for_tenant(UUID,INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_overdue_permit_alerts_for_tenant(UUID,INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) الرحلات المتأخرة عن الوصول المتوقع
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_late_trip_alerts_for_tenant(
  p_tenant_id UUID
)
RETURNS TABLE(entities INTEGER, notifications INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD; v_ent INTEGER := 0; v_notif INTEGER := 0; v_sent INTEGER;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN QUERY SELECT 0, 0; RETURN; END IF;

  FOR v_row IN
    SELECT d.id, d.dispatch_code, dr.driver_name_ar, o.destination_address,
           EXTRACT(EPOCH FROM (NOW() - d.estimated_arrival))::INT / 60 AS minutes_late
      FROM public.logistics_dispatches d
      JOIN public.logistics_drivers dr        ON dr.id = d.driver_id
      JOIN public.logistics_shipment_orders o ON o.id = d.order_id
     WHERE d.tenant_id = p_tenant_id
       AND d.status IN ('dispatched', 'en_route')
       AND d.estimated_arrival IS NOT NULL
       AND NOW() > d.estimated_arrival + INTERVAL '30 minutes'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.movement_notification_log
       WHERE tenant_id = p_tenant_id AND notification_kind = 'trip_late'
         AND entity_id = v_row.id AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_movement_roles_for_tenant(
      p_tenant_id, ARRAY['logistics'], 'trip_late',
      'رحلة متأخرة عن موعد الوصول',
      'الرحلة ' || v_row.dispatch_code || ' مع السائق ' || v_row.driver_name_ar ||
      ' إلى ' || v_row.destination_address ||
      ' متأخرة ' || GREATEST(v_row.minutes_late, 0)::TEXT || ' دقيقة.',
      'logistics_dispatches', v_row.id);

    INSERT INTO public.movement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, severity, recipients_count)
    VALUES (p_tenant_id, 'trip_late', 'logistics_dispatch', v_row.id, 'late', v_sent);

    v_ent := v_ent + 1; v_notif := v_notif + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_ent, v_notif;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_late_trip_alerts_for_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_late_trip_alerts_for_tenant(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_late_trip_alerts_for_tenant(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) عقود الناقلين المنتهية
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_carrier_contract_alerts_for_tenant(
  p_tenant_id UUID
)
RETURNS TABLE(entities INTEGER, notifications INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD; v_ent INTEGER := 0; v_notif INTEGER := 0;
  v_sent INTEGER; v_sev TEXT;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN QUERY SELECT 0, 0; RETURN; END IF;

  FOR v_row IN
    SELECT c.id, c.carrier_name_ar, c.contract_expiry,
           (c.contract_expiry - CURRENT_DATE)::INT AS days_left
      FROM public.logistics_carriers c
     WHERE c.tenant_id = p_tenant_id
       AND c.status = 'active'
       AND c.contract_expiry IS NOT NULL
       AND c.contract_expiry <= CURRENT_DATE + 60
  LOOP
    v_sev := CASE WHEN v_row.days_left < 0 THEN 'expired'
                  WHEN v_row.days_left <= 14 THEN 'critical'
                  ELSE 'urgent' END;

    IF EXISTS (
      SELECT 1 FROM public.movement_notification_log
       WHERE tenant_id = p_tenant_id AND notification_kind = 'carrier_contract'
         AND entity_id = v_row.id AND severity = v_sev AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_movement_roles_for_tenant(
      p_tenant_id, ARRAY['logistics'], 'carrier_contract_expiry',
      CASE WHEN v_row.days_left < 0 THEN 'عقد ناقل منتهٍ' ELSE 'عقد ناقل ينتهي قريباً' END,
      'عقد الناقل ' || v_row.carrier_name_ar ||
      CASE WHEN v_row.days_left < 0
           THEN ' منتهٍ منذ ' || ABS(v_row.days_left)::TEXT || ' يوماً.'
           ELSE ' ينتهي بعد ' || v_row.days_left::TEXT || ' يوماً.' END,
      'logistics_carriers', v_row.id);

    INSERT INTO public.movement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, severity, recipients_count)
    VALUES (p_tenant_id, 'carrier_contract', 'logistics_carrier', v_row.id, v_sev, v_sent);

    v_ent := v_ent + 1; v_notif := v_notif + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_ent, v_notif;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_carrier_contract_alerts_for_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_carrier_contract_alerts_for_tenant(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_carrier_contract_alerts_for_tenant(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) ★ المُشغِّل الرئيسي — service_role فقط · عزل أخطاء لكل مستأجر
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_movement_daily_notifications_cron(
  p_grace_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(
  tenant_id     UUID,
  job           TEXT,
  entities      INTEGER,
  notifications INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_t RECORD; v_r RECORD;
BEGIN
  FOR v_t IN
    SELECT t.id FROM public.tenants t
     WHERE EXISTS (
       SELECT 1 FROM public.tenant_modules tm
        WHERE tm.tenant_id = t.id AND tm.module_key = 'movement' AND tm.is_enabled = true)
  LOOP
    BEGIN
      SELECT * INTO v_r FROM public.dispatch_driver_license_alerts_for_tenant(v_t.id);
      RETURN QUERY SELECT v_t.id, 'driver_license'::TEXT, v_r.entities, v_r.notifications, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_t.id, 'driver_license'::TEXT, 0, 0, SQLERRM::TEXT;
    END;

    BEGIN
      SELECT * INTO v_r FROM public.dispatch_vehicle_document_alerts_for_tenant(v_t.id);
      RETURN QUERY SELECT v_t.id, 'vehicle_document'::TEXT, v_r.entities, v_r.notifications, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_t.id, 'vehicle_document'::TEXT, 0, 0, SQLERRM::TEXT;
    END;

    BEGIN
      SELECT * INTO v_r FROM public.dispatch_overdue_permit_alerts_for_tenant(v_t.id, p_grace_minutes);
      RETURN QUERY SELECT v_t.id, 'permit_overdue'::TEXT, v_r.entities, v_r.notifications, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_t.id, 'permit_overdue'::TEXT, 0, 0, SQLERRM::TEXT;
    END;

    BEGIN
      SELECT * INTO v_r FROM public.dispatch_late_trip_alerts_for_tenant(v_t.id);
      RETURN QUERY SELECT v_t.id, 'trip_late'::TEXT, v_r.entities, v_r.notifications, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_t.id, 'trip_late'::TEXT, 0, 0, SQLERRM::TEXT;
    END;

    BEGIN
      SELECT * INTO v_r FROM public.dispatch_carrier_contract_alerts_for_tenant(v_t.id);
      RETURN QUERY SELECT v_t.id, 'carrier_contract'::TEXT, v_r.entities, v_r.notifications, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_t.id, 'carrier_contract'::TEXT, 0, 0, SQLERRM::TEXT;
    END;
  END LOOP;

  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.run_movement_daily_notifications_cron(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_movement_daily_notifications_cron(INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_movement_daily_notifications_cron(INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) التتبع الحي — تسجيل موقع المركبة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_vehicle_telemetry(
  p_vehicle_id UUID,
  p_latitude   NUMERIC,
  p_longitude  NUMERIC,
  p_speed_kmh  NUMERIC DEFAULT 0,
  p_heading    NUMERIC DEFAULT 0,
  p_dispatch_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id UUID;
BEGIN
  PERFORM public.movement_require_role('logistics');
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
  -- سرعة سالبة أو خيالية = عطل جهاز
  IF p_speed_kmh < 0 OR p_speed_kmh > 300 THEN
    RAISE EXCEPTION 'INVALID_SPEED (%)', p_speed_kmh;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.logistics_vehicles
     WHERE id = p_vehicle_id AND tenant_id = v_tenant
  ) THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  INSERT INTO public.logistics_telemetry(
    tenant_id, vehicle_id, dispatch_id, latitude, longitude,
    speed_kmh, heading, recorded_at)
  VALUES (v_tenant, p_vehicle_id, p_dispatch_id, p_latitude, p_longitude,
          COALESCE(p_speed_kmh, 0), COALESCE(p_heading, 0), NOW())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.record_vehicle_telemetry(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_vehicle_telemetry(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_vehicle_telemetry(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 10) View: آخر موقع لكل مركبة + حالة الاتصال
--     ⚠️ «خارج الاتصال» حالة منفصلة عن «متأخر» — انقطاع الشبكة ليس تأخراً
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.logistics_live_vehicle_positions
WITH (security_invoker = true) AS
SELECT DISTINCT ON (v.id)
  v.id                AS vehicle_id,
  v.tenant_id,
  v.vehicle_code,
  v.plate_number,
  v.status            AS vehicle_status,
  t.latitude,
  t.longitude,
  t.speed_kmh,
  t.heading,
  t.recorded_at,
  t.dispatch_id,
  d.dispatch_code,
  dr.driver_name_ar,
  CASE
    WHEN t.recorded_at IS NULL                          THEN 'no_data'
    WHEN t.recorded_at < NOW() - INTERVAL '15 minutes'  THEN 'offline'
    WHEN COALESCE(t.speed_kmh, 0) = 0                   THEN 'stopped'
    ELSE 'moving'
  END::TEXT           AS connection_status,
  CASE
    WHEN t.recorded_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - t.recorded_at))::INT / 60
  END                 AS minutes_since_update
FROM public.logistics_vehicles v
LEFT JOIN public.logistics_telemetry t
       ON t.vehicle_id = v.id AND t.tenant_id = v.tenant_id
LEFT JOIN public.logistics_dispatches d ON d.id = t.dispatch_id
LEFT JOIN public.logistics_drivers dr   ON dr.id = d.driver_id
WHERE v.tenant_id = public.current_user_tenant_id()
ORDER BY v.id, t.recorded_at DESC NULLS LAST;

GRANT SELECT ON public.logistics_live_vehicle_positions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 11) View: حالة الجدولة — يكشف توقّف cron بصمت
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.movement_notification_dispatch_status
WITH (security_invoker = true) AS
SELECT
  l.notification_kind,
  MAX(l.sent_on)                                   AS last_dispatch_date,
  (CURRENT_DATE - MAX(l.sent_on))::INT             AS days_since_last,
  COUNT(*) FILTER (WHERE l.sent_on = CURRENT_DATE) AS dispatched_today,
  SUM(l.recipients_count) FILTER (WHERE l.sent_on = CURRENT_DATE) AS recipients_today,
  COUNT(*)                                         AS total_dispatched,
  CASE
    WHEN MAX(l.sent_on) = CURRENT_DATE      THEN 'healthy'
    WHEN MAX(l.sent_on) >= CURRENT_DATE - 2 THEN 'stale'
    ELSE 'not_running'
  END::TEXT                                        AS dispatch_health
FROM public.movement_notification_log l
WHERE l.tenant_id = public.current_user_tenant_id()
GROUP BY l.notification_kind;

GRANT SELECT ON public.movement_notification_dispatch_status TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 12) تنظيف بيانات التتبع القديمة (الجدول ينمو بالملايين)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_old_telemetry(p_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM public.logistics_telemetry
   WHERE recorded_at < NOW() - (GREATEST(COALESCE(p_days, 90), 7) || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION public.purge_old_telemetry(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_old_telemetry(INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_telemetry(INTEGER) TO service_role;

CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_time
  ON public.logistics_telemetry(tenant_id, vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_dispatch_time
  ON public.logistics_telemetry(dispatch_id, recorded_at DESC);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 13) تأكيدات
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_fn TEXT; v_missing TEXT := ''; v_bad TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.notify_movement_roles_for_tenant(uuid,text[],text,text,text,text,uuid)',
    'public.dispatch_driver_license_alerts_for_tenant(uuid)',
    'public.dispatch_vehicle_document_alerts_for_tenant(uuid)',
    'public.dispatch_overdue_permit_alerts_for_tenant(uuid,integer)',
    'public.dispatch_late_trip_alerts_for_tenant(uuid)',
    'public.dispatch_carrier_contract_alerts_for_tenant(uuid)',
    'public.run_movement_daily_notifications_cron(integer)',
    'public.record_vehicle_telemetry(uuid,numeric,numeric,numeric,numeric,uuid)',
    'public.purge_old_telemetry(integer)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0286 failed: missing functions:%', v_missing;
  END IF;

  -- service_role يجب أن ينفّذ المُشغِّل وإلا فالجدولة مستحيلة
  IF NOT has_function_privilege('service_role',
        'public.run_movement_daily_notifications_cron(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '0286 failed: service_role cannot execute the cron dispatcher';
  END IF;

  -- ★ لا anon ولا authenticated على دوال cron
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE 'dispatch\_%\_alerts\_for\_tenant'
          OR p.proname IN ('notify_movement_roles_for_tenant',
                           'run_movement_daily_notifications_cron',
                           'purge_old_telemetry'))
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0286 failed: cron functions exposed to anon/authenticated: %', v_bad;
  END IF;

  IF has_function_privilege('anon',
       'public.record_vehicle_telemetry(uuid,numeric,numeric,numeric,numeric,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '0286 failed: anon must not record telemetry';
  END IF;

  IF to_regclass('public.logistics_live_vehicle_positions') IS NULL
     OR to_regclass('public.movement_notification_dispatch_status') IS NULL
     OR to_regclass('public.movement_notification_log') IS NULL THEN
    RAISE EXCEPTION '0286 failed: views or log table missing';
  END IF;

  RAISE NOTICE '✅ 0286: movement scheduled notifications & telemetry applied';
END $$;
