-- ============================================================================
-- اختبار سلوكي: 0299 — عزل المستأجرين في فحص السور الجغرافي
--
-- الثغرة: movement_point_in_geofence كانت تقرأ movement_geofences بلا
-- فلترة مستأجر. مستخدم من «أ» يستطيع استكشاف موقع سور «ب» بالاستدعاء
-- المتكرر بإحداثيات مختلفة (oracle attack).
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  tA UUID; tB UUID; uA UUID; uB UUID; locB UUID; fenceB UUID; r BOOLEAN;
BEGIN
  INSERT INTO public.tenants(name_ar,slug) VALUES ('GA','ga299') RETURNING id INTO tA;
  INSERT INTO public.tenants(name_ar,slug) VALUES ('GB','gb299') RETURNING id INTO tB;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'ga@l') RETURNING id INTO uA;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'gb@l') RETURNING id INTO uB;
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (uA,tA,'مستخدم أ','logistics'),(uB,tB,'مستخدم ب','logistics');
-- ─── إصلاح 2026-08-05: محفّز 0300 يسبق هذه الإدراجات ───────────────────
-- منذ 0300 صار INSERT على profiles بدور حركة يُنشئ صف الإسناد تلقائياً،
-- فالإدراج اليدوي هنا يصطدم بـ uq_movement_role_user. الاختبار سليم؛
-- المتغيّر هو أن الإسناد صار مضموناً بالمحفّز. نُبقي الإدراج (توثيقاً
-- للنيّة وعملاً في حال غياب المحفّز) ونجعله متسامحاً.
  INSERT INTO public.movement_role_assignments(tenant_id,user_id,portal_role,is_active)
    VALUES (tA,uA,'logistics',true),(tB,uB,'logistics',true)
    ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = EXCLUDED.is_active;

  -- سور سرّي في المستأجر ب
  PERFORM set_config('request.jwt.claim.sub', uB::text, false);
  locB := public.create_movement_location('مستودع سرّي','warehouse',NULL,33.5,44.5,500,NULL);
  INSERT INTO public.movement_geofences(tenant_id,name_ar,fence_type,center_lat,center_lng,radius_m,location_id,status)
  VALUES (tB,'سور سرّي','circle',33.5,44.5,500,locB,'active') RETURNING id INTO fenceB;

  -- المالك يرى النتيجة الصحيحة
  r := public.movement_point_in_geofence(fenceB, 33.5, 44.5);
  IF NOT r THEN RAISE EXCEPTION 'FAILED: owner got false inside own fence'; END IF;
  RAISE NOTICE '  المالك (ب) داخل سوره: % ✅', r;

  -- ★ المستأجر أ يحاول استكشاف موقع سور ب
  PERFORM set_config('request.jwt.claim.sub', uA::text, false);
  r := public.movement_point_in_geofence(fenceB, 33.5, 44.5);
  IF r THEN
    RAISE EXCEPTION 'SECURITY BREACH: tenant A probed tenant B geofence and got TRUE';
  END IF;
  RAISE NOTICE '  المتطفّل (أ) على سور ب: % ✅ (لا تسريب)', r;

  -- ولا يميّز بين "غير موجود" و"ليس لك"
  IF public.movement_point_in_geofence(gen_random_uuid(), 33.5, 44.5) <> r THEN
    RAISE EXCEPTION 'FAILED: response differs between missing and foreign fence';
  END IF;
  RAISE NOTICE '  سور مجهول = سور أجنبي: لا تمييز ✅';
  RAISE NOTICE '';
  RAISE NOTICE '  ✅ 0299: عزل السور مُثبَت — 4/4';
END $$;
