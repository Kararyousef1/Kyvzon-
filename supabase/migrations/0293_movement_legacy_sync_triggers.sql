-- ============================================================================
-- FILE: 0293_movement_legacy_sync_triggers.sql
-- PURPOSE: إنهاء انقسام البيانات فوراً — مزامنة حيّة من القديم إلى الجديد.
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة التي يحلّها:
--   0292 رحّل البيانات **الموجودة**. لكن الكود القديم ما زال يكتب:
--     GatekeeperPage · MovementControlPage  → movements_log
--     MovementPermitService                 → movement_permits
--   فكل حركة جديدة يسجّلها حارس البوابة تُعيد فتح الانقسام من جديد.
--
-- البدائل التي دُرست ورُفضت:
--
--   ① إعادة كتابة الصفحات الأربع الآن (2,264 سطراً)
--      رُفض: تغيير واسع في جلسة واحدة على مسار حرج (حارس البوابة
--      يعمل 24/7). خطأ واحد = توقف تسجيل الحركات في الإنتاج.
--
--   ② تحويل الجدولين القديمين إلى VIEW فوق الجديد
--      رُفض: أعمدة القديم لا تُغطّى كلها (movement_type · department
--      · employee_name)، والكتابة عبر VIEW تحتاج INSTEAD OF triggers
--      على أي حال — تعقيد أكبر بلا مكسب.
--
--   ③ محفّزات مزامنة  ← **المختار**
--      الكود القديم لا يتغيّر حرفاً، وكل صف يظهر في الجديد لحظياً.
--      الانقسام ينتهي **اليوم**، وتحويل الصفحات يجري لاحقاً على مهل
--      وبلا ضغط زمني.
--
-- اتجاه المزامنة: **قديم ← جديد فقط**.
--   لا نزامن عكسياً عمداً: لو زامنّا الاتجاهين لأنشأنا حلقة لا نهائية
--   (محفّز يُشعل محفّزاً)، ولأصبح الجدول القديم يتضخّم ببيانات بوابة
--   لا يفهم مخططها. الجديد هو مصدر الحقيقة؛ القديم مصدر إدخال مؤقت.
--
-- الأمان: كل الدوال SECURITY DEFINER وتحترم tenant_id الصف نفسه.
--         لا تُمنح لأحد — تعمل من المحفّز فقط.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) مساعد: موقع من نص الوجهة (يُنشئه إن لم يوجد)
--
--    نفس منطق التطبيع في 0292: trim + توحيد المسافات + مطابقة
--    غير حسّاسة لحالة الأحرف. مستخرَج في دالة لأن ثلاثة مواضع
--    تحتاجه، وتكراره يعني ثلاث فرص للتباعد.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.movement_resolve_legacy_location(
  p_tenant UUID,
  p_text   TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_norm TEXT;
  v_id   UUID;
  v_seq  INT;
  v_code TEXT;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  v_norm := regexp_replace(trim(COALESCE(p_text, '')), '\s+', ' ', 'g');
  IF v_norm = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_id
    FROM public.movement_locations
   WHERE tenant_id = p_tenant AND lower(name_ar) = lower(v_norm)
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '^LEG-', ''), '')::INT), 0) + 1
    INTO v_seq
    FROM public.movement_locations
   WHERE tenant_id = p_tenant AND code ~ '^LEG-[0-9]+$';
  v_code := 'LEG-' || lpad(v_seq::TEXT, 4, '0');

  INSERT INTO public.movement_locations(
    tenant_id, code, name_ar, location_type, is_active, description)
  VALUES (p_tenant, v_code, left(v_norm, 200), 'client_site', TRUE,
          'أُنشئ تلقائياً من وجهة نصية في النظام القديم (0293) — بلا إحداثيات')
  ON CONFLICT (tenant_id, code) DO NOTHING
  RETURNING id INTO v_id;

  -- سباق نادر: صفّان بنفس الوجهة في اللحظة نفسها
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.movement_locations
     WHERE tenant_id = p_tenant AND lower(name_ar) = lower(v_norm) LIMIT 1;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.movement_resolve_legacy_location(UUID, TEXT) IS
  'يُرجع موقعاً مطابقاً لنص الوجهة أو يُنشئه. منطق تطبيع موحَّد مع 0292.';

-- ---------------------------------------------------------------------------
-- 2) محفّز مزامنة التصاريح
--
--    AFTER INSERT OR UPDATE: نلتقط الإنشاء والتعديل معاً. حارس البوابة
--    يُحدّث status و used_at عند استعمال التصريح، ولو زامنّا الإدراج
--    وحده لتجمّد الصف الجديد على الحالة الأولى.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_sync_legacy_movement_permit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_loc UUID;
BEGIN
  v_loc := public.movement_resolve_legacy_location(NEW.tenant_id, NEW.destination);

  INSERT INTO public.employee_movement_permits(
    tenant_id, employee_id, destination_id, destination_name, purpose,
    valid_from, valid_until, max_duration_minutes, status,
    approved_by, created_by, movement_id, used_at, notes,
    created_at, updated_at, legacy_permit_id)
  VALUES (
    NEW.tenant_id, NEW.employee_id, v_loc,
    left(COALESCE(NULLIF(trim(NEW.destination), ''), 'وجهة غير محددة'), 200),
    COALESCE(NULLIF(trim(NEW.purpose), ''), 'مُرحَّل من النظام القديم — الغرض غير مسجَّل'),
    NEW.valid_from, NEW.valid_until,
    GREATEST(COALESCE(NEW.max_duration_minutes, 30), 1),
    NEW.status, NEW.approved_by, NEW.created_by, NEW.movement_id, NEW.used_at,
    CASE WHEN NULLIF(trim(COALESCE(NEW.notes, '')), '') IS NULL
         THEN '[مُزامَن من movement_permits]'
         ELSE NEW.notes || E'\n[مُزامَن من movement_permits]' END,
    NEW.created_at, NEW.updated_at, NEW.id)
  -- شرط الفهرس الجزئي إلزامي: uq_emp_permits_legacy_id مُعرَّف
  -- بـ WHERE legacy_permit_id IS NOT NULL، و ON CONFLICT لا
  -- يطابق فهرساً جزئياً ما لم يُذكر الشرط نفسه.
  ON CONFLICT (legacy_permit_id) WHERE legacy_permit_id IS NOT NULL
  DO UPDATE SET
    destination_id       = EXCLUDED.destination_id,
    destination_name     = EXCLUDED.destination_name,
    purpose              = EXCLUDED.purpose,
    valid_from           = EXCLUDED.valid_from,
    valid_until          = EXCLUDED.valid_until,
    max_duration_minutes = EXCLUDED.max_duration_minutes,
    status               = EXCLUDED.status,
    approved_by          = EXCLUDED.approved_by,
    used_at              = EXCLUDED.used_at,
    notes                = EXCLUDED.notes,
    updated_at           = EXCLUDED.updated_at;

  RETURN NULL;   -- AFTER trigger
END $$;

DROP TRIGGER IF EXISTS trg_sync_legacy_movement_permit ON public.movement_permits;
CREATE TRIGGER trg_sync_legacy_movement_permit
  AFTER INSERT OR UPDATE ON public.movement_permits
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_legacy_movement_permit();

-- ---------------------------------------------------------------------------
-- 3) محفّز مزامنة الحركات
--
--    نفس اشتقاق الحالة في 0292 — مطابق حرفياً كي لا يختلف صفٌّ
--    مُزامَن عن صفٍّ مُرحَّل.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_sync_legacy_movement_log()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_permit UUID;
  v_status TEXT;
  v_notes  TEXT;
BEGIN
  -- الوجهة تُطبَّع وتُسجَّل موقعاً حتى لو لم يُستعمل هنا مباشرةً:
  -- الجدول الجديد يخزّن الاسم، لكن وجود الموقع يُفيد تخطيط المسار لاحقاً.
  PERFORM public.movement_resolve_legacy_location(NEW.tenant_id, NEW.destination);

  SELECT id INTO v_permit
    FROM public.employee_movement_permits
   WHERE tenant_id = NEW.tenant_id AND movement_id = NEW.id
   LIMIT 1;

  v_status := CASE
    WHEN NEW.returned_at IS NOT NULL AND COALESCE(NEW.route_violation, FALSE) THEN 'violated'
    WHEN NEW.returned_at IS NOT NULL THEN 'returned'
    WHEN COALESCE(NEW.expected_return_at, NEW.departure_at + interval '30 minutes') < now()
      THEN 'overdue'
    ELSE 'out'
  END;

  v_notes := NULLIF(concat_ws(E'\n',
    NULLIF(trim(COALESCE(NEW.notes, '')), ''),
    CASE WHEN NULLIF(trim(COALESCE(NEW.return_notes, '')), '') IS NOT NULL
         THEN 'ملاحظة العودة: ' || trim(NEW.return_notes) END,
    CASE WHEN NULLIF(trim(COALESCE(NEW.movement_type, '')), '') IS NOT NULL
         THEN 'نوع الحركة (قديم): ' || trim(NEW.movement_type) END,
    '[مُزامَن من movements_log]'), '');

  INSERT INTO public.employee_movements_log(
    tenant_id, employee_id, permit_id, destination_name, purpose,
    departure_at, expected_return_at, returned_at,
    actual_return_location, route_violation, status,
    logged_by_id, notes, created_at, updated_at, legacy_movement_id)
  VALUES (
    NEW.tenant_id, NEW.employee_id, v_permit,
    left(COALESCE(NULLIF(trim(NEW.destination), ''), 'وجهة غير محددة'), 200),
    NULLIF(trim(NEW.purpose), ''),
    NEW.departure_at,
    COALESCE(NEW.expected_return_at, NEW.returned_at,
             NEW.departure_at + interval '30 minutes'),
    NEW.returned_at,
    left(NEW.actual_location, 200),
    COALESCE(NEW.route_violation, FALSE),
    v_status, NEW.logged_by_id, v_notes,
    NEW.created_at, NEW.updated_at, NEW.id)
  ON CONFLICT (legacy_movement_id) WHERE legacy_movement_id IS NOT NULL
  DO UPDATE SET
    permit_id              = COALESCE(EXCLUDED.permit_id, employee_movements_log.permit_id),
    destination_name       = EXCLUDED.destination_name,
    purpose                = EXCLUDED.purpose,
    departure_at           = EXCLUDED.departure_at,
    expected_return_at     = EXCLUDED.expected_return_at,
    returned_at            = EXCLUDED.returned_at,
    actual_return_location = EXCLUDED.actual_return_location,
    route_violation        = EXCLUDED.route_violation,
    status                 = EXCLUDED.status,
    notes                  = EXCLUDED.notes,
    updated_at             = EXCLUDED.updated_at;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_legacy_movement_log ON public.movements_log;
CREATE TRIGGER trg_sync_legacy_movement_log
  AFTER INSERT OR UPDATE ON public.movements_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_legacy_movement_log();

-- ---------------------------------------------------------------------------
-- 4) الصلاحيات
--
--    دوال المحفّزات لا تُمنح لأحد: تعمل بصلاحية مالك المحفّز.
--    movement_resolve_legacy_location كذلك — تُستدعى من الدوال فقط.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.movement_resolve_legacy_location(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_sync_legacy_movement_permit()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_sync_legacy_movement_log()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movement_resolve_legacy_location(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5) 🔴 حارس: يثبت أن المزامنة تعمل فعلاً — لا مجرد وجود المحفّزات
--
--    يزرع صفاً في القديم داخل معاملة، يتحقق من ظهوره في الجديد،
--    ثم يتراجع. اختبار حيّ داخل المايجريشن نفسه.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_t   UUID;
  v_u   UUID;
  v_m   UUID;
  v_p   UUID;
  v_ok  BOOLEAN;
  v_st  TEXT;
BEGIN
  -- وجود المحفّزات
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'trg_sync_legacy_movement_permit'
                    AND tgrelid = 'public.movement_permits'::regclass) THEN
    RAISE EXCEPTION '0293 failed: permit sync trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'trg_sync_legacy_movement_log'
                    AND tgrelid = 'public.movements_log'::regclass) THEN
    RAISE EXCEPTION '0293 failed: movement sync trigger missing';
  END IF;

  -- اختبار حيّ داخل نقطة حفظ يُتراجَع عنها
  BEGIN
    INSERT INTO public.tenants(name_ar, slug)
    VALUES ('probe-0293', 'probe-0293-' || substr(gen_random_uuid()::text, 1, 8))
    RETURNING id INTO v_t;

    INSERT INTO auth.users(id, email)
    VALUES (gen_random_uuid(), 'probe0293@local') RETURNING id INTO v_u;
    INSERT INTO public.profiles(id, tenant_id, full_name, role)
    VALUES (v_u, v_t, 'probe', 'employee');

    -- ① إدراج حركة في القديم
    INSERT INTO public.movements_log(
      tenant_id, employee_id, departure_at, destination, expected_return_at)
    VALUES (v_t, v_u, now(), '  وجهة   الاختبار  ', now() + interval '1 hour')
    RETURNING id INTO v_m;

    SELECT EXISTS (SELECT 1 FROM public.employee_movements_log
                    WHERE legacy_movement_id = v_m) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION '0293 failed: INSERT not synced to new table';
    END IF;

    -- ② الوجهة طُبِّعت وأُنشئ لها موقع
    IF NOT EXISTS (SELECT 1 FROM public.movement_locations
                    WHERE tenant_id = v_t AND name_ar = 'وجهة الاختبار') THEN
      RAISE EXCEPTION '0293 failed: destination not normalised into a location';
    END IF;

    -- ③ الحالة المشتقّة صحيحة
    SELECT status INTO v_st FROM public.employee_movements_log
     WHERE legacy_movement_id = v_m;
    IF v_st <> 'out' THEN
      RAISE EXCEPTION '0293 failed: expected status out, got %', v_st;
    END IF;

    -- ④ التحديث يُزامَن أيضاً (العودة)
    UPDATE public.movements_log
       SET returned_at = now(), return_notes = 'عاد'
     WHERE id = v_m;

    SELECT status INTO v_st FROM public.employee_movements_log
     WHERE legacy_movement_id = v_m;
    IF v_st <> 'returned' THEN
      RAISE EXCEPTION '0293 failed: UPDATE not synced (status=%)', v_st;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.employee_movements_log
                    WHERE legacy_movement_id = v_m AND notes LIKE '%عاد%') THEN
      RAISE EXCEPTION '0293 failed: return_notes lost on sync';
    END IF;

    -- ⑤ لا ازدواج بعد التحديث
    IF (SELECT count(*) FROM public.employee_movements_log
         WHERE legacy_movement_id = v_m) <> 1 THEN
      RAISE EXCEPTION '0293 failed: UPDATE created a duplicate row';
    END IF;

    -- ⑥ التصاريح تُزامَن كذلك
    INSERT INTO public.movement_permits(
      tenant_id, employee_id, destination, purpose, valid_until, status)
    VALUES (v_t, v_u, 'وجهة الاختبار', NULL, now() + interval '2 hours', 'approved')
    RETURNING id INTO v_p;

    IF NOT EXISTS (SELECT 1 FROM public.employee_movement_permits
                    WHERE legacy_permit_id = v_p) THEN
      RAISE EXCEPTION '0293 failed: permit INSERT not synced';
    END IF;

    -- ⑦ purpose الفارغ حصل على بديل (NOT NULL محترمة)
    IF EXISTS (SELECT 1 FROM public.employee_movement_permits
                WHERE legacy_permit_id = v_p AND (purpose IS NULL OR trim(purpose) = '')) THEN
      RAISE EXCEPTION '0293 failed: NULL purpose survived sync';
    END IF;

    -- ⑧ الوجهة رُبطت بالموقع نفسه (لا تكرار مواقع)
    IF (SELECT count(*) FROM public.movement_locations
         WHERE tenant_id = v_t AND lower(name_ar) = 'وجهة الاختبار') <> 1 THEN
      RAISE EXCEPTION '0293 failed: duplicate locations created';
    END IF;

    RAISE EXCEPTION 'PROBE_ROLLBACK_0293';   -- تراجع مقصود
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'PROBE_ROLLBACK_0293' THEN RAISE; END IF;
  END;

  RAISE NOTICE '✅ 0293: مزامنة حيّة قديم←جديد مفعَّلة ومُختبَرة — انقسام البيانات انتهى';
END $$;
