-- ============================================================================
-- FILE: 0299_movement_geofence_tenant_isolation.sql
-- PURPOSE: سدّ تسريب عبر المستأجرين في movement_point_in_geofence.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 🔴 الثغرة (اكتُشفت بمراجعة بوابات الجودة، لا بفشل اختبار):
--
--   movement_point_in_geofence (0280) دالة SECURITY DEFINER تقرأ:
--     SELECT * INTO g FROM public.movement_geofences WHERE id = p_geofence_id;
--
--   **بلا أي فلترة على tenant_id.** وهي ممنوحة لـ authenticated.
--
--   الاستغلال العملي: مستخدم مسجَّل في المستأجر «أ» يملك معرّف سور
--   من المستأجر «ب» (أو يُخمّنه/يحصل عليه من تسريب سابق). يستدعي
--   الدالة بإحداثيات مختلفة مراراً — كل استدعاء يُرجع true/false،
--   فيرسم حدود السور بالثنائي ويستنتج **الموقع الجغرافي السري**
--   لمنشأة مستأجر آخر (مستودع · مقر عميل · نقطة تسليم حسّاسة).
--
--   هذا تسريب معلومات عبر قناة جانبية (oracle attack) لا اختراق
--   مباشر — ولذلك لم تكشفه اختبارات RLS: الدالة تتجاوز RLS بحكم
--   SECURITY DEFINER، والجدول نفسه محميّ.
--
-- لماذا لم تُكتشف قبلاً:
--   اختباراتي فحصت أن anon محروم، وأن الجداول عليها RLS. لم تفحص
--   أن **دالة SECURITY DEFINER تفلتر بالمستأجر داخلياً** — وهي فجوة
--   في منهج الاختبار نفسه أُضيف لها حارس دائم في نهاية هذا الملف.
--
-- الإصلاح: فلترة المستأجر داخل الدالة. النتيجة لغير المالك = false
--   (لا استثناء) — الاستثناء نفسه يُسرّب وجود السور من عدمه.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.movement_point_in_geofence(
  p_geofence_id UUID,
  p_lat         NUMERIC,
  p_lng         NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  g       RECORD;
  v_dist  NUMERIC;
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  /*
    ★ الفلترة الحاسمة: السور يجب أن يخصّ مستأجر المستدعي.

    نُرجع false لا استثناءً عند عدم المطابقة: رسالة خطأ مثل
    'GEOFENCE_NOT_FOUND' مقابل نتيجة منطقية تُميّز بين «سور غير موجود»
    و«سور موجود لكن ليس لك» — وهذا بحدّ ذاته تسريب.

    service_role (tenant NULL) يمرّ: دوال cron تحتاج فحص الأسوار
    لكل المستأجرين، وهي لا تُمنح لمستخدم نهائي.
  */
  SELECT * INTO g
    FROM public.movement_geofences
   WHERE id = p_geofence_id
     AND (v_tenant IS NULL OR tenant_id = v_tenant);

  IF NOT FOUND THEN RETURN false; END IF;

  IF g.fence_type = 'circle' THEN
    v_dist := public.movement_haversine_km(g.center_lat, g.center_lng, p_lat, p_lng);
    RETURN (v_dist * 1000) <= g.radius_m;
  END IF;

  RETURN public.movement_point_in_polygon(g.polygon_points, p_lat, p_lng);
END $$;

COMMENT ON FUNCTION public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC) IS
  'هل النقطة داخل السور؟ يفلتر بالمستأجر — سور مستأجر آخر يُرجع false لا استثناءً.';

REVOKE ALL ON FUNCTION public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movement_point_in_geofence(UUID, NUMERIC, NUMERIC)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 🔴 حارس دائم: كل دالة SECURITY DEFINER تقرأ جدول حركة يجب أن تفلتر
--
--    هذا الحارس يمنع تكرار الثغرة نفسها في أي مايجريشن قادم. النمط
--    المقبول: إما فلترة صريحة بالمستأجر، أو حارس دور/سائق يفلتر ضمناً،
--    أو دالة cron لـ service_role وحده.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_leaky TEXT := '';
  v_rec   RECORD;
BEGIN
  -- ① الإصلاح نفسه سارٍ
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'movement_point_in_geofence')
     NOT ILIKE '%current_user_tenant_id%' THEN
    RAISE EXCEPTION '0299 failed: geofence function still lacks tenant filtering';
  END IF;

  /*
    ② مسح شامل: دوال SECURITY DEFINER ممنوحة لـ authenticated،
    تقرأ جداول الحركة، وبلا أي آلية عزل.
  */
  FOR v_rec IN
    SELECT p.proname, p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND p.prosrc ~* '\m(movement_geofences|movement_locations|logistics_vehicles|logistics_drivers|logistics_dispatches|employee_movement_permits|employee_movements_log|fleet_vehicle_inspections)\M'
       AND p.prosrc NOT ILIKE '%current_user_tenant_id%'
       AND p.prosrc NOT ILIKE '%movement_require_role%'
       AND p.prosrc NOT ILIKE '%movement_require_driver%'
  LOOP
    v_leaky := v_leaky || ' ' || v_rec.proname;
  END LOOP;

  IF v_leaky <> '' THEN
    RAISE EXCEPTION
      '0299 failed: SECURITY DEFINER functions read movement tables without tenant isolation:%',
      v_leaky;
  END IF;

  IF has_function_privilege('anon',
       'public.movement_point_in_geofence(uuid,numeric,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION '0299 failed: anon can execute geofence check';
  END IF;

  RAISE NOTICE '✅ 0299: عزل المستأجرين في فحص السور + حارس دائم ضد التسريب';
END $$;
