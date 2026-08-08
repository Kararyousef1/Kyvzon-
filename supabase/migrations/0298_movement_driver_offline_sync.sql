-- ============================================================================
-- FILE: 0298_movement_driver_offline_sync.sql
-- PURPOSE: العمل دون اتصال لكل عمليات السائق — لا المواقع وحدها.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الفجوة (فحص فعلي لاستدعاءات تطبيق السائق):
--
--   العمليات التي يكتبها السائق: 4
--     ① record_driver_position        → له طابور محلي ✅ (0291)
--     ② record_my_vehicle_inspection  → **يتطلب شبكة** ❌
--     ③ update_my_trip_status         → **يتطلب شبكة** ❌
--     ④ record_my_delivery_proof      → له client_uuid لكن بلا طابور ⚠️
--
--   السيناريو الواقعي: السائق يفحص المركبة في مرآب أو ساحة تحميل
--   مغلقة — أماكن التغطية فيها ضعيفة بطبيعتها. الفحص يفشل، فيُكمل
--   رحلته بلا DVIR. النتيجة: النظام الذي بُني للامتثال يُنتج فجوة
--   امتثال بنفسه.
--
--   الأسوأ: تغيير الحالة (انطلاق/وصول) يفشل أيضاً، فتبقى الرحلة
--   «dispatched» في لوحة المُرسِل بينما السائق وصل فعلاً.
--
-- الحل: idempotency شامل + رفع دفعي موحَّد.
--   كل عملية تحمل client_uuid يولّده التطبيق قبل الإرسال. إعادة
--   المحاولة تُرجع النتيجة الأصلية بدل تكرار أو خطأ — نفس مبدأ 0294
--   لكن مطبَّقاً على العمليات الأربع لا واحدة.
--
-- ⚠️ ما لا يُؤجَّل عمداً:
--   تغيير الحالة إلى 'completed' يتطلب ePOD موجوداً. لو رُفعا معاً
--   دفعةً واحدة فالترتيب حرج — لذا الرفع الدفعي **مرتَّب زمنياً**
--   لا متوازياً.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) client_uuid للفحوصات
-- ---------------------------------------------------------------------------
ALTER TABLE public.fleet_vehicle_inspections
  ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_inspections_client_uuid
  ON public.fleet_vehicle_inspections (tenant_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

COMMENT ON COLUMN public.fleet_vehicle_inspections.client_uuid IS
  'معرّف العملية من التطبيق — يمنع تكرار الفحص عند إعادة الرفع بعد انقطاع.';

-- ---------------------------------------------------------------------------
-- 2) سجل عمليات السائق المؤجَّلة
--
--    لماذا جدول لا مجرد idempotency على كل دالة:
--      • يُظهر للمُرسِل أن السائق عمل دون اتصال ومتى رُفع العمل
--      • يكشف عمليات فشل رفعها نهائياً (بيانات ضائعة يجب معالجتها)
--      • يمنع الرفع المزدوج على مستوى الدفعة لا العملية وحدها
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_offline_operations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id      UUID NOT NULL REFERENCES public.logistics_drivers(id) ON DELETE CASCADE,
  client_uuid    UUID NOT NULL,
  operation_type TEXT NOT NULL
    CHECK (operation_type IN ('inspection','trip_status','delivery_proof')),
  dispatch_id    UUID REFERENCES public.logistics_dispatches(id) ON DELETE SET NULL,
  /** لحظة تنفيذ العملية على الجهاز — لا لحظة الرفع */
  performed_at   TIMESTAMPTZ NOT NULL,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied','duplicate','failed')),
  result_id      UUID,
  error_message  TEXT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_offline_ops_client
  ON public.driver_offline_operations (tenant_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_driver_offline_ops_driver
  ON public.driver_offline_operations (tenant_id, driver_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_offline_ops_failed
  ON public.driver_offline_operations (tenant_id, status, synced_at DESC)
  WHERE status = 'failed';

COMMENT ON TABLE public.driver_offline_operations IS
  'سجل عمليات السائق المرفوعة بعد انقطاع الشبكة. الفشل مرئي لا صامت.';

ALTER TABLE public.driver_offline_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_driver_offline_ops_all ON public.driver_offline_operations;
CREATE POLICY kyvzon_driver_offline_ops_all
  ON public.driver_offline_operations FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

REVOKE ALL ON public.driver_offline_operations FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.driver_offline_operations TO authenticated;
GRANT ALL ON public.driver_offline_operations TO service_role;

-- ---------------------------------------------------------------------------
-- 3) الفحص idempotent
--
--    يقبل client_uuid و performed_at: الفحص جرى في المرآب قبل ساعة،
--    وتسجيله بوقت الرفع يُفسد التسلسل الزمني ويُبطل قيمته كدليل.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT,UUID,TIMESTAMPTZ);

CREATE FUNCTION public.record_my_vehicle_inspection(
  p_dispatch_id     UUID,
  p_inspection_type TEXT,
  p_defects         JSONB DEFAULT '[]'::jsonb,
  p_odometer_km     NUMERIC DEFAULT NULL,
  p_signature_name  TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_client_uuid     UUID DEFAULT NULL,
  p_performed_at    TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (inspection_id UUID, has_critical BOOLEAN, vehicle_grounded BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver  UUID := public.movement_require_driver();
  v_tenant  UUID := public.current_user_tenant_id();
  v_vehicle UUID;
  v_cur_km  NUMERIC;
  v_crit    BOOLEAN := FALSE;
  v_ground  BOOLEAN := FALSE;
  v_id      UUID;
  v_bad     INT;
  v_at      TIMESTAMPTZ;
BEGIN
  -- ① الصدى: عملية سبق رفعها تُرجع نتيجتها الأصلية
  IF p_client_uuid IS NOT NULL THEN
    SELECT i.id, i.has_critical INTO v_id, v_crit
      FROM public.fleet_vehicle_inspections i
     WHERE i.tenant_id = v_tenant AND i.client_uuid = p_client_uuid;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_crit, FALSE;
      RETURN;
    END IF;
  END IF;

  IF p_inspection_type NOT IN ('pre_trip','post_trip','periodic') THEN
    RAISE EXCEPTION 'INVALID_INSPECTION_TYPE (%)', p_inspection_type;
  END IF;
  IF p_defects IS NULL OR jsonb_typeof(p_defects) <> 'array' THEN
    RAISE EXCEPTION 'DEFECTS_MUST_BE_ARRAY';
  END IF;

  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements(p_defects) AS d
   WHERE d->>'code' IS NULL
      OR COALESCE(d->>'severity','') NOT IN ('minor','major','critical');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVALID_DEFECT_ENTRY (% entries)', v_bad;
  END IF;

  /*
    الزمن: نقبل وقت التنفيذ على الجهاز ضمن حدود معقولة.
    مستقبلي (ساعة تسامح لانحراف ساعة الجهاز) أو أقدم من 7 أيام
    = بيانات مشبوهة تُرفض. نفس حدود record_driver_position.
  */
  v_at := COALESCE(p_performed_at, now());
  IF v_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'PERFORMED_AT_IN_FUTURE';
  END IF;
  IF v_at < now() - interval '7 days' THEN
    RAISE EXCEPTION 'PERFORMED_AT_TOO_OLD';
  END IF;

  SELECT d.vehicle_id INTO v_vehicle
    FROM public.logistics_dispatches d
   WHERE d.id = p_dispatch_id AND d.tenant_id = v_tenant AND d.driver_id = v_driver;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_ASSIGNED_TO_YOU'; END IF;
  IF v_vehicle IS NULL THEN RAISE EXCEPTION 'DISPATCH_HAS_NO_VEHICLE'; END IF;

  SELECT current_mileage_km INTO v_cur_km FROM public.logistics_vehicles
   WHERE id = v_vehicle AND tenant_id = v_tenant FOR UPDATE;

  IF p_odometer_km IS NOT NULL THEN
    IF p_odometer_km < 0 THEN RAISE EXCEPTION 'INVALID_ODOMETER'; END IF;
    IF p_odometer_km < v_cur_km THEN
      RAISE EXCEPTION 'ODOMETER_CANNOT_DECREASE (current=%, given=%)',
        v_cur_km, p_odometer_km;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_defects) AS d
     WHERE d->>'severity' = 'critical') INTO v_crit;

  INSERT INTO public.fleet_vehicle_inspections(
    tenant_id, vehicle_id, driver_id, dispatch_id, inspection_type,
    odometer_km, defects, has_critical, is_safe_to_operate,
    signature_name, notes, inspected_at, client_uuid)
  VALUES (v_tenant, v_vehicle, v_driver, p_dispatch_id, p_inspection_type,
          p_odometer_km, p_defects, v_crit, NOT v_crit,
          p_signature_name,
          CASE WHEN p_notes IS NULL THEN '[من تطبيق السائق]'
               ELSE p_notes || ' [من تطبيق السائق]' END,
          v_at, p_client_uuid)
  RETURNING id INTO v_id;

  IF p_odometer_km IS NOT NULL AND p_odometer_km > v_cur_km THEN
    UPDATE public.logistics_vehicles
       SET current_mileage_km = p_odometer_km, updated_at = NOW()
     WHERE id = v_vehicle AND tenant_id = v_tenant;
  END IF;

  IF v_crit THEN
    UPDATE public.logistics_vehicles
       SET status = 'out_of_service', updated_at = NOW()
     WHERE id = v_vehicle AND tenant_id = v_tenant AND status = 'available';
    GET DIAGNOSTICS v_bad = ROW_COUNT;
    v_ground := (v_bad > 0);
  END IF;

  INSERT INTO public.movement_audit_events(
    tenant_id, actor_id, event_type, entity_type, entity_id, payload)
  VALUES (v_tenant, auth.uid(), 'vehicle_inspection_recorded',
          'logistics_vehicle', v_vehicle,
          jsonb_build_object('inspection_id', v_id,
                             'type', p_inspection_type,
                             'defect_count', jsonb_array_length(p_defects),
                             'has_critical', v_crit,
                             'grounded', v_ground,
                             'source', 'driver_app',
                             'driver_id', v_driver,
                             'offline', (p_performed_at IS NOT NULL)));

  RETURN QUERY SELECT v_id, v_crit, v_ground;

EXCEPTION
  -- ② سباق: طلبان متزامنان بنفس المعرّف
  WHEN unique_violation THEN
    IF p_client_uuid IS NOT NULL THEN
      SELECT i.id, i.has_critical INTO v_id, v_crit
        FROM public.fleet_vehicle_inspections i
       WHERE i.tenant_id = v_tenant AND i.client_uuid = p_client_uuid;
      IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, v_crit, FALSE;
        RETURN;
      END IF;
    END IF;
    RAISE;
END $$;

COMMENT ON FUNCTION public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT,UUID,TIMESTAMPTZ) IS
  'DVIR من تطبيق السائق — idempotent ويقبل وقت التنفيذ على الجهاز.';

-- ---------------------------------------------------------------------------
-- 4) الرفع الدفعي المرتَّب
--
--    🔴 الترتيب حرج: 'completed' يتطلب ePOD موجوداً. لو رُفعت العمليات
--    بترتيب عشوائي لفشل الإكمال ثم نجح ePOD — فتبقى الرحلة مفتوحة
--    والسائق يظن أنه أنهاها.
--
--    الحل: ترتيب حسب performed_at (زمن الجهاز) لا حسب ترتيب المصفوفة.
--    السائق فحص ← انطلق ← وصل ← سلّم ← أنهى، وهذا الترتيب يُحترم.
--
--    عملية فاشلة لا تُسقط الدفعة: تُسجَّل 'failed' وتُكمل البقية.
--    استثناء واحد: فشل ePOD يجعل الإكمال بعده يفشل حتماً — وهذا
--    سلوك صحيح لا خلل.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_driver_offline_batch(
  p_operations JSONB
)
/*
  ⚠️ أسماء المخرجات مسبوقة بـ out_ عمداً.

  الأسماء المطابقة لأعمدة driver_offline_operations (client_uuid ·
  status · result_id …) تجعل PL/pgSQL يخلط بينها وبين أعمدة الجدول
  داخل INSERT ... ON CONFLICT:
    ERROR: column reference "client_uuid" is ambiguous
  كشفه التشغيل الفعلي.
*/
RETURNS TABLE (
  out_client_uuid    UUID,
  out_operation_type TEXT,
  out_status         TEXT,
  out_result_id      UUID,
  out_error_message  TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver UUID := public.movement_require_driver();
  v_tenant UUID := public.current_user_tenant_id();
  v_op     JSONB;
  v_cu     UUID;
  v_type   TEXT;
  v_disp   UUID;
  v_at     TIMESTAMPTZ;
  v_res    UUID;
  v_st     TEXT;
  v_err    TEXT;
  v_row    RECORD;
BEGIN
  IF p_operations IS NULL OR jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'OPERATIONS_MUST_BE_ARRAY';
  END IF;
  IF jsonb_array_length(p_operations) > 100 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE (max 100)';
  END IF;

  FOR v_op IN
    SELECT e FROM jsonb_array_elements(p_operations) AS e
     -- ★ الترتيب الزمني: أساس صحة التسلسل
     ORDER BY COALESCE((e->>'performed_at')::TIMESTAMPTZ, now())
  LOOP
    v_res := NULL; v_err := NULL; v_st := 'applied';

    BEGIN
      v_cu   := (v_op->>'client_uuid')::UUID;
      v_type := v_op->>'operation_type';
      v_disp := NULLIF(v_op->>'dispatch_id','')::UUID;
      v_at   := COALESCE((v_op->>'performed_at')::TIMESTAMPTZ, now());

      IF v_cu IS NULL THEN
        RAISE EXCEPTION 'CLIENT_UUID_REQUIRED';
      END IF;

      -- عملية سبق تسجيلها في هذا السجل: لا نُعيد تنفيذها
      IF EXISTS (SELECT 1 FROM public.driver_offline_operations o
                  WHERE o.tenant_id = v_tenant AND o.client_uuid = v_cu
                    AND o.status <> 'failed') THEN
        SELECT o.result_id INTO v_res FROM public.driver_offline_operations o
         WHERE o.tenant_id = v_tenant AND o.client_uuid = v_cu;
        v_st := 'duplicate';
      ELSE
        CASE v_type
          WHEN 'inspection' THEN
            SELECT i.inspection_id INTO v_res
              FROM public.record_my_vehicle_inspection(
                v_disp,
                COALESCE(v_op->>'inspection_type','pre_trip'),
                COALESCE(v_op->'defects','[]'::jsonb),
                NULLIF(v_op->>'odometer_km','')::NUMERIC,
                v_op->>'signature_name',
                v_op->>'notes',
                v_cu,
                v_at) i;

          WHEN 'delivery_proof' THEN
            v_res := public.record_my_delivery_proof(
              v_disp,
              COALESCE(v_op->>'recipient_name','—'),
              COALESCE(v_op->>'epod_status','delivered'),
              v_op->>'signature_url',
              v_op->>'photo_url',
              v_op->>'notes',
              v_cu);

          WHEN 'trip_status' THEN
            PERFORM public.update_my_trip_status(
              v_disp, COALESCE(v_op->>'trip_status',''));
            v_res := v_disp;

          ELSE
            RAISE EXCEPTION 'UNKNOWN_OPERATION_TYPE (%)', COALESCE(v_type,'null');
        END CASE;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_st  := 'failed';
      v_err := left(SQLERRM, 500);
      v_res := NULL;
    END;

    /*
      عملية بلا client_uuid لا يمكن تسجيلها (العمود NOT NULL وهو مفتاح
      منع التكرار). نُعيد فشلها للمتصل ونُكمل الدفعة بدل الانهيار.
      كشفه التشغيل: null value in column "client_uuid" violates not-null.
    */
    IF v_cu IS NULL THEN
      out_client_uuid    := NULL;
      out_operation_type := v_type;
      out_status         := 'failed';
      out_result_id      := NULL;
      out_error_message  := 'CLIENT_UUID_REQUIRED';
      RETURN NEXT;
      CONTINUE;
    END IF;

    /*
      نوع عملية خارج القائمة يكسر CHECK على operation_type عند التسجيل.
      نُعيد الفشل مباشرةً — نفس السبب: الدفعة تُكمل ولا تنهار.
      كشفه التشغيل: violates check constraint "..._operation_type_check".
    */
    IF v_type IS NULL OR v_type NOT IN ('inspection','trip_status','delivery_proof') THEN
      out_client_uuid    := v_cu;
      out_operation_type := v_type;
      out_status         := 'failed';
      out_result_id      := NULL;
      out_error_message  := 'UNKNOWN_OPERATION_TYPE (' || COALESCE(v_type,'null') || ')';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- التسجيل يحدث دائماً — النجاح والفشل كلاهما مرئي
    INSERT INTO public.driver_offline_operations(
      tenant_id, driver_id, client_uuid, operation_type, dispatch_id,
      performed_at, status, result_id, error_message, payload)
    VALUES (v_tenant, v_driver, v_cu, v_type, v_disp,
            v_at, v_st, v_res, v_err, v_op)
    ON CONFLICT (tenant_id, client_uuid) DO UPDATE SET
      status        = EXCLUDED.status,
      result_id     = COALESCE(EXCLUDED.result_id, driver_offline_operations.result_id),
      error_message = EXCLUDED.error_message,
      synced_at     = now();

    out_client_uuid    := v_cu;
    out_operation_type := v_type;
    out_status         := v_st;
    out_result_id      := v_res;
    out_error_message  := v_err;
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.sync_driver_offline_batch(JSONB) IS
  'رفع دفعي مرتَّب زمنياً لعمليات السائق المؤجَّلة. الفشل يُسجَّل ولا يُسقط الدفعة.';

-- ---------------------------------------------------------------------------
-- 5) عرض العمليات الفاشلة — بيانات ضائعة يجب معالجتها
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.driver_offline_sync_issues AS
SELECT o.id,
       o.tenant_id,
       o.driver_id,
       d.driver_name_ar,
       o.operation_type,
       o.dispatch_id,
       disp.dispatch_code,
       o.performed_at,
       o.synced_at,
       o.error_message,
       EXTRACT(EPOCH FROM (o.synced_at - o.performed_at)) / 3600 AS delay_hours
  FROM public.driver_offline_operations o
  LEFT JOIN public.logistics_drivers    d    ON d.id = o.driver_id
  LEFT JOIN public.logistics_dispatches disp ON disp.id = o.dispatch_id
 WHERE o.status = 'failed';

COMMENT ON VIEW public.driver_offline_sync_issues IS
  'عمليات سائق فشل رفعها — تحتاج تدخّلاً يدوياً وإلا ضاع العمل الميداني.';

REVOKE ALL ON public.driver_offline_sync_issues FROM PUBLIC, anon;
GRANT SELECT ON public.driver_offline_sync_issues TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) الصلاحيات
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT,UUID,TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_driver_offline_batch(JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT,UUID,TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_driver_offline_batch(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 7) 🔴 حارس التحقق
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cnt  INT;
  v_anon TEXT;
BEGIN
  IF to_regprocedure('public.sync_driver_offline_batch(jsonb)') IS NULL THEN
    RAISE EXCEPTION '0298 failed: batch sync function missing';
  END IF;
  IF to_regclass('public.driver_offline_operations') IS NULL THEN
    RAISE EXCEPTION '0298 failed: offline operations table missing';
  END IF;
  IF to_regclass('public.driver_offline_sync_issues') IS NULL THEN
    RAISE EXCEPTION '0298 failed: sync issues view missing';
  END IF;

  -- درس 0294: نسخة واحدة من الدالة المُعاد بناؤها
  SELECT count(*) INTO v_cnt FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_my_vehicle_inspection';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION '0298 failed: record_my_vehicle_inspection has % overloads', v_cnt;
  END IF;

  -- الفهارس الفريدة للـ idempotency
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public'
                    AND indexname='uq_vehicle_inspections_client_uuid') THEN
    RAISE EXCEPTION '0298 failed: inspection client_uuid index missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public'
                    AND indexname='uq_driver_offline_ops_client') THEN
    RAISE EXCEPTION '0298 failed: offline ops client_uuid index missing';
  END IF;

  -- RLS مفعَّل وله سياسة — درس 0282
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relname='driver_offline_operations'
                    AND c.relrowsecurity) THEN
    RAISE EXCEPTION '0298 failed: RLS not enabled on offline operations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='driver_offline_operations') THEN
    RAISE EXCEPTION '0298 failed: offline ops has RLS but no policy (total lockout)';
  END IF;

  -- الترتيب الزمني موجود في الكود — أساس صحة التسلسل
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='sync_driver_offline_batch'
       AND p.prosrc ILIKE '%ORDER BY COALESCE((e->>''performed_at'')%'
  ) THEN
    RAISE EXCEPTION '0298 failed: batch must be ordered by performed_at';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('record_my_vehicle_inspection','sync_driver_offline_batch')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '0298 failed: anon can execute: %', v_anon;
  END IF;

  IF has_table_privilege('anon','public.driver_offline_operations','SELECT')
     OR has_table_privilege('anon','public.driver_offline_sync_issues','SELECT') THEN
    RAISE EXCEPTION '0298 failed: anon can read offline operations';
  END IF;

  RAISE NOTICE '✅ 0298: العمل دون اتصال يشمل الفحص والحالة والتسليم';
END $$;
