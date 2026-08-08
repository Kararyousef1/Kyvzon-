-- ============================================================================
-- FILE: 0292_movement_legacy_data_migration.sql
-- PURPOSE: ترحيل بيانات نظام الحركة القديم إلى بوابة الحركة الجديدة.
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة القائمة **الآن** في الإنتاج:
--
--   نظامان يعملان بالتوازي على البيانات نفسها:
--     القديم: movements_log (0012)      · movement_permits (0021)
--     الجديد: employee_movements_log     · employee_movement_permits (0273)
--
--   حارس البوابة (GatekeeperPage) يكتب في القديم.
--   بوابة الحركة الجديدة تكتب في الجديد.
--   HRMovementAnalyticsPage تقرأ القديم.
--
--   ⇒ البيانات **منقسمة**: تقرير الحركة لا يرى تصاريح البوابة الجديدة،
--     وشاشات البوابة الجديدة لا ترى ما سجّله حارس البوابة.
--
-- ما يفعله هذا المايجريشن:
--   1. يستخرج الوجهات النصية الفريدة → movement_locations
--   2. يرحّل movement_permits   → employee_movement_permits
--   3. يرحّل movements_log      → employee_movements_log
--   4. يربط الحركات بتصاريحها عبر movement_id
--   5. يتحقق من **مطابقة العدد قبل/بعد** ويفشل عند أي اختلاف
--   6. يسجّل أثر الترحيل في movement_audit_events
--
-- ما لا يفعله — عمداً:
--   ❌ لا حذف ولا DROP لأي جدول قديم
--   ❌ لا إعادة تسمية إلى _deprecated في هذه المرحلة
--   السبب: الكود ما زال يقرأ القديم (GatekeeperService · MovementPermitService
--   · HRMovementAnalyticsPage). إسقاطه الآن يكسر الإنتاج فوراً.
--   الإيقاف يجري على مراحل: ترحيل → تحويل القراءة → تجميد الكتابة →
--   إعادة تسمية. هذا المايجريشن هو المرحلة الأولى وحدها.
--
-- قابلية إعادة التشغيل:
--   كل إدراج يستعمل NOT EXISTS على مفتاح مستقر (id للسجلات، code
--   للمواقع). تشغيله مرتين لا يُنتج تكراراً — مُثبَت في الحارس.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) عمود التتبّع: يربط الصف الجديد بأصله القديم
--
--    بدونه لا سبيل للتحقق من اكتمال الترحيل، ولا لإعادة تشغيله بأمان،
--    ولا لتتبّع سجل مشبوه إلى مصدره.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employee_movement_permits
  ADD COLUMN IF NOT EXISTS legacy_permit_id UUID;
ALTER TABLE public.employee_movements_log
  ADD COLUMN IF NOT EXISTS legacy_movement_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_permits_legacy_id
  ON public.employee_movement_permits (legacy_permit_id)
  WHERE legacy_permit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_movements_legacy_id
  ON public.employee_movements_log (legacy_movement_id)
  WHERE legacy_movement_id IS NOT NULL;

COMMENT ON COLUMN public.employee_movement_permits.legacy_permit_id IS
  'معرّف الصف الأصلي في movement_permits (0021). NULL = أُنشئ في البوابة الجديدة.';
COMMENT ON COLUMN public.employee_movements_log.legacy_movement_id IS
  'معرّف الصف الأصلي في movements_log (0012). NULL = أُنشئ في البوابة الجديدة.';

-- ---------------------------------------------------------------------------
-- 1) دالة الترحيل — المصدر الوحيد للمنطق
--
--    ما دام الكود القديم يكتب، ستظهر صفوف جديدة. هذه الدالة تلتقطها
--    دون إعادة ترحيل ما رُحِّل. تُستدعى يدوياً أو من cron حتى يكتمل
--    تحويل الكود.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.migrate_pending_legacy_movements();

CREATE FUNCTION public.migrate_pending_legacy_movements()
RETURNS TABLE (permits_migrated INTEGER, movements_migrated INTEGER,
               locations_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p   INTEGER := 0;
  v_m   INTEGER := 0;
  v_l   INTEGER := 0;
  v_row RECORD;
  v_code TEXT;
  v_seq  INT;
BEGIN
  /*
    ① المواقع أولاً — وإلا وصلت التصاريح بلا destination_id.

    عيب اكتُشف بالاختبار السلوكي: النسخة الأولى من هذه الدالة رحّلت
    الصفوف دون إنشاء المواقع (المنطق كان في جسم المايجريشن وحده)،
    فكل صف يُكتب في الجدول القديم بعد 0292 كان سيصل بوجهة نصية
    غير مرتبطة. المنطق الآن هنا، والمايجريشن يستدعي هذه الدالة.
  */
  FOR v_row IN
    WITH raw AS (
      SELECT tenant_id, regexp_replace(trim(destination), '\s+', ' ', 'g') AS dest
        FROM public.movement_permits
       WHERE destination IS NOT NULL AND trim(destination) <> ''
      UNION
      SELECT tenant_id, regexp_replace(trim(destination), '\s+', ' ', 'g') AS dest
        FROM public.movements_log
       WHERE destination IS NOT NULL AND trim(destination) <> ''
    )
    SELECT DISTINCT r.tenant_id, r.dest
      FROM raw r
     WHERE NOT EXISTS (
       SELECT 1 FROM public.movement_locations l
        WHERE l.tenant_id = r.tenant_id AND lower(l.name_ar) = lower(r.dest))
     ORDER BY r.tenant_id, r.dest
  LOOP
    SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '^LEG-', ''), '')::INT), 0) + 1
      INTO v_seq
      FROM public.movement_locations
     WHERE tenant_id = v_row.tenant_id AND code ~ '^LEG-[0-9]+$';

    v_code := 'LEG-' || lpad(v_seq::TEXT, 4, '0');

    INSERT INTO public.movement_locations(
      tenant_id, code, name_ar, location_type, is_active, description)
    VALUES (v_row.tenant_id, v_code, left(v_row.dest, 200), 'client_site', TRUE,
            'مُرحَّل تلقائياً من وجهة نصية في النظام القديم (0292) — بلا إحداثيات')
    ON CONFLICT (tenant_id, code) DO NOTHING;

    v_l := v_l + 1;
  END LOOP;

  INSERT INTO public.employee_movement_permits(
    tenant_id, employee_id, destination_id, destination_name, purpose,
    valid_from, valid_until, max_duration_minutes, status,
    approved_by, created_by, movement_id, used_at, notes,
    created_at, updated_at, legacy_permit_id)
  SELECT p.tenant_id, p.employee_id, l.id,
         left(COALESCE(NULLIF(trim(p.destination), ''), 'وجهة غير محددة'), 200),
         COALESCE(NULLIF(trim(p.purpose), ''), 'مُرحَّل من النظام القديم — الغرض غير مسجَّل'),
         p.valid_from, p.valid_until,
         GREATEST(COALESCE(p.max_duration_minutes, 30), 1),
         p.status, p.approved_by, p.created_by, p.movement_id, p.used_at,
         CASE WHEN NULLIF(trim(COALESCE(p.notes, '')), '') IS NULL
              THEN '[مُرحَّل من movement_permits]'
              ELSE p.notes || E'\n[مُرحَّل من movement_permits]' END,
         p.created_at, p.updated_at, p.id
    FROM public.movement_permits p
    LEFT JOIN public.movement_locations l
           ON l.tenant_id = p.tenant_id
          AND lower(l.name_ar) = lower(regexp_replace(trim(p.destination), '\s+', ' ', 'g'))
   WHERE NOT EXISTS (SELECT 1 FROM public.employee_movement_permits e
                      WHERE e.legacy_permit_id = p.id);
  GET DIAGNOSTICS v_p = ROW_COUNT;

  INSERT INTO public.employee_movements_log(
    tenant_id, employee_id, permit_id, destination_name, purpose,
    departure_at, expected_return_at, returned_at,
    actual_return_location, route_violation, status,
    logged_by_id, notes, created_at, updated_at, legacy_movement_id)
  SELECT m.tenant_id, m.employee_id, ep.id,
         left(COALESCE(NULLIF(trim(m.destination), ''), 'وجهة غير محددة'), 200),
         NULLIF(trim(m.purpose), ''),
         m.departure_at,
         COALESCE(m.expected_return_at, m.returned_at, m.departure_at + interval '30 minutes'),
         m.returned_at,
         left(m.actual_location, 200),
         COALESCE(m.route_violation, FALSE),
         CASE
           WHEN m.returned_at IS NOT NULL AND COALESCE(m.route_violation, FALSE) THEN 'violated'
           WHEN m.returned_at IS NOT NULL THEN 'returned'
           WHEN COALESCE(m.expected_return_at, m.departure_at + interval '30 minutes') < now()
             THEN 'overdue'
           ELSE 'out'
         END,
         m.logged_by_id,
         NULLIF(concat_ws(E'\n',
           NULLIF(trim(COALESCE(m.notes, '')), ''),
           CASE WHEN NULLIF(trim(COALESCE(m.return_notes, '')), '') IS NOT NULL
                THEN 'ملاحظة العودة: ' || trim(m.return_notes) END,
           CASE WHEN NULLIF(trim(COALESCE(m.movement_type, '')), '') IS NOT NULL
                THEN 'نوع الحركة (قديم): ' || trim(m.movement_type) END,
           '[مُرحَّل من movements_log]'), ''),
         m.created_at, m.updated_at, m.id
    FROM public.movements_log m
    LEFT JOIN public.employee_movement_permits ep
           ON ep.tenant_id = m.tenant_id AND ep.movement_id = m.id
   WHERE NOT EXISTS (SELECT 1 FROM public.employee_movements_log e
                      WHERE e.legacy_movement_id = m.id);
  GET DIAGNOSTICS v_m = ROW_COUNT;

  RETURN QUERY SELECT v_p, v_m, v_l;
END $$;

COMMENT ON FUNCTION public.migrate_pending_legacy_movements() IS
  'يلتقط الصفوف المكتوبة في الجداول القديمة بعد 0292 (مع مواقعها). آمن للتكرار.';

REVOKE ALL ON FUNCTION public.migrate_pending_legacy_movements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_pending_legacy_movements() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 2) تنفيذ الترحيل الآن
--
--    استدعاء واحد للدالة أعلاه. لا منطق مكرَّر هنا: النسخة الأولى
--    كرّرت الإدراجات في جسم المايجريشن ونصّ الدالة معاً، فتباعدا فوراً
--    — الدالة كانت ترحّل الصفوف دون إنشاء المواقع. كشفه الاختبار
--    السلوكي (E19). منطق واحد في مكان واحد = لا تباعد ممكن.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_r RECORD;
BEGIN
  SELECT * INTO v_r FROM public.migrate_pending_legacy_movements();
  RAISE NOTICE '0292: رُحِّل % تصريحاً · % حركة · % موقعاً',
    v_r.permits_migrated, v_r.movements_migrated, v_r.locations_created;
END $$;

-- ---------------------------------------------------------------------------
-- 3) ربط عكسي: التصريح يشير إلى الحركة الجديدة لا القديمة
--
--    movement_id في التصاريح المُرحَّلة يحمل معرّف movements_log القديم.
--    نحدّثه إلى معرّف الصف الجديد المقابل، وإلا أشار إلى جدول مهجور.
-- ---------------------------------------------------------------------------
UPDATE public.employee_movement_permits ep
   SET movement_id = nm.id,
       updated_at  = now()
  FROM public.employee_movements_log nm
 WHERE ep.legacy_permit_id IS NOT NULL
   AND ep.movement_id IS NOT NULL
   AND nm.legacy_movement_id = ep.movement_id
   AND nm.tenant_id = ep.tenant_id
   AND ep.movement_id <> nm.id;

-- ---------------------------------------------------------------------------
-- 4) أثر الترحيل في سجل التدقيق — سجل واحد لكل مستأجر
-- ---------------------------------------------------------------------------
INSERT INTO public.movement_audit_events(
  tenant_id, actor_id, event_type, entity_type, entity_id, payload)
SELECT t.tenant_id, NULL, 'legacy_data_migrated', 'movement_portal', NULL,
       jsonb_build_object(
         'migration', '0292',
         'permits_migrated',   t.permits,
         'movements_migrated', t.movements,
         'locations_created',  t.locations,
         'migrated_at', now())
FROM (
  SELECT tn.id AS tenant_id,
         (SELECT count(*) FROM public.employee_movement_permits e
           WHERE e.tenant_id = tn.id AND e.legacy_permit_id IS NOT NULL)   AS permits,
         (SELECT count(*) FROM public.employee_movements_log e
           WHERE e.tenant_id = tn.id AND e.legacy_movement_id IS NOT NULL) AS movements,
         (SELECT count(*) FROM public.movement_locations l
           WHERE l.tenant_id = tn.id AND l.code ~ '^LEG-[0-9]+$')          AS locations
    FROM public.tenants tn
) t
WHERE (t.permits + t.movements + t.locations) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movement_audit_events a
     WHERE a.tenant_id = t.tenant_id
       AND a.event_type = 'legacy_data_migrated'
       AND a.payload->>'migration' = '0292'
  );

-- ---------------------------------------------------------------------------
-- 5) عرض حالة الترحيل — يبقى مرئياً بعد انتهاء المايجريشن
--
--    ضروري لأن الجدولين القديمين ما زالا يستقبلان كتابات من الكود
--    غير المحوَّل بعد. هذا العرض يُظهر الفجوة المتبقّية لحظياً.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.movement_legacy_migration_status AS
SELECT 'movement_permits'::TEXT AS legacy_table,
       'employee_movement_permits'::TEXT AS target_table,
       (SELECT count(*) FROM public.movement_permits)          AS legacy_rows,
       (SELECT count(*) FROM public.employee_movement_permits
         WHERE legacy_permit_id IS NOT NULL)                   AS migrated_rows,
       (SELECT count(*) FROM public.movement_permits p
         WHERE NOT EXISTS (SELECT 1 FROM public.employee_movement_permits e
                            WHERE e.legacy_permit_id = p.id))  AS pending_rows
UNION ALL
SELECT 'movements_log',
       'employee_movements_log',
       (SELECT count(*) FROM public.movements_log),
       (SELECT count(*) FROM public.employee_movements_log
         WHERE legacy_movement_id IS NOT NULL),
       (SELECT count(*) FROM public.movements_log m
         WHERE NOT EXISTS (SELECT 1 FROM public.employee_movements_log e
                            WHERE e.legacy_movement_id = m.id));

COMMENT ON VIEW public.movement_legacy_migration_status IS
  'حالة ترحيل بيانات الحركة القديمة. pending_rows > 0 يعني كتابة جديدة في الجدول القديم.';

REVOKE ALL ON public.movement_legacy_migration_status FROM PUBLIC, anon;
GRANT SELECT ON public.movement_legacy_migration_status TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) 🔴 حارس مطابقة العدد — يُفشل المايجريشن عند أي فقد
--
--    هذا جوهر أمان الترحيل: لو رُحِّل صف واحد أقل، تفشل العملية كاملةً
--    وتُلغى (المايجريشن داخل معاملة). لا ترحيل جزئي صامت.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_legacy_p   BIGINT;
  v_migrated_p BIGINT;
  v_legacy_m   BIGINT;
  v_migrated_m BIGINT;
  v_orphan     BIGINT;
  v_badstatus  BIGINT;
  v_nulldest   BIGINT;
BEGIN
  -- ① التصاريح: كل صف قديم له مقابل
  SELECT count(*) INTO v_legacy_p   FROM public.movement_permits;
  SELECT count(*) INTO v_migrated_p FROM public.employee_movement_permits
   WHERE legacy_permit_id IS NOT NULL;
  IF v_migrated_p <> v_legacy_p THEN
    RAISE EXCEPTION '0292 failed: permits count mismatch — legacy=% migrated=%',
      v_legacy_p, v_migrated_p;
  END IF;

  -- ② الحركات: كل صف قديم له مقابل
  SELECT count(*) INTO v_legacy_m   FROM public.movements_log;
  SELECT count(*) INTO v_migrated_m FROM public.employee_movements_log
   WHERE legacy_movement_id IS NOT NULL;
  IF v_migrated_m <> v_legacy_m THEN
    RAISE EXCEPTION '0292 failed: movements count mismatch — legacy=% migrated=%',
      v_legacy_m, v_migrated_m;
  END IF;

  -- ③ لا ازدواج: كل معرّف قديم مرة واحدة (يثبت أمان إعادة التشغيل)
  SELECT count(*) INTO v_orphan FROM (
    SELECT legacy_permit_id FROM public.employee_movement_permits
     WHERE legacy_permit_id IS NOT NULL
     GROUP BY legacy_permit_id HAVING count(*) > 1) x;
  IF v_orphan > 0 THEN
    RAISE EXCEPTION '0292 failed: % duplicated legacy permit ids', v_orphan;
  END IF;

  SELECT count(*) INTO v_orphan FROM (
    SELECT legacy_movement_id FROM public.employee_movements_log
     WHERE legacy_movement_id IS NOT NULL
     GROUP BY legacy_movement_id HAVING count(*) > 1) x;
  IF v_orphan > 0 THEN
    RAISE EXCEPTION '0292 failed: % duplicated legacy movement ids', v_orphan;
  END IF;

  -- ④ كل الحالات المُرحَّلة ضمن قيم CHECK الجديدة
  SELECT count(*) INTO v_badstatus FROM public.employee_movements_log
   WHERE legacy_movement_id IS NOT NULL
     AND status NOT IN ('out','returned','overdue','violated');
  IF v_badstatus > 0 THEN
    RAISE EXCEPTION '0292 failed: % migrated movements have invalid status', v_badstatus;
  END IF;

  -- ⑤ NOT NULL محترمة: لا وجهة فارغة ولا عودة متوقَّعة مفقودة
  SELECT count(*) INTO v_nulldest FROM public.employee_movements_log
   WHERE legacy_movement_id IS NOT NULL
     AND (destination_name IS NULL OR expected_return_at IS NULL);
  IF v_nulldest > 0 THEN
    RAISE EXCEPTION '0292 failed: % migrated movements missing required fields', v_nulldest;
  END IF;

  SELECT count(*) INTO v_nulldest FROM public.employee_movement_permits
   WHERE legacy_permit_id IS NOT NULL
     AND (destination_name IS NULL OR purpose IS NULL OR trim(purpose) = '');
  IF v_nulldest > 0 THEN
    RAISE EXCEPTION '0292 failed: % migrated permits missing required fields', v_nulldest;
  END IF;

  -- ⑥ عزل المستأجرين محفوظ: لا صف عبر مستأجرين
  SELECT count(*) INTO v_orphan
    FROM public.employee_movements_log e
    JOIN public.movements_log m ON m.id = e.legacy_movement_id
   WHERE m.tenant_id <> e.tenant_id;
  IF v_orphan > 0 THEN
    RAISE EXCEPTION '0292 failed: % rows crossed tenant boundary', v_orphan;
  END IF;

  -- ⑦ الأدوات الباقية موجودة
  IF to_regclass('public.movement_legacy_migration_status') IS NULL THEN
    RAISE EXCEPTION '0292 failed: status view missing';
  END IF;
  IF to_regprocedure('public.migrate_pending_legacy_movements()') IS NULL THEN
    RAISE EXCEPTION '0292 failed: catch-up function missing';
  END IF;
  IF has_function_privilege('anon', 'public.migrate_pending_legacy_movements()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.migrate_pending_legacy_movements()', 'EXECUTE') THEN
    RAISE EXCEPTION '0292 failed: catch-up function must be service_role only';
  END IF;
  IF has_table_privilege('anon', 'public.movement_legacy_migration_status', 'SELECT') THEN
    RAISE EXCEPTION '0292 failed: anon can read migration status';
  END IF;

  -- ⑧ الجداول القديمة **لم تُمَس** — لا حذف في هذه المرحلة
  IF to_regclass('public.movement_permits') IS NULL
     OR to_regclass('public.movements_log') IS NULL THEN
    RAISE EXCEPTION '0292 failed: legacy tables must NOT be dropped at this stage';
  END IF;

  RAISE NOTICE '✅ 0292: رُحِّل % تصريحاً و % حركة — مطابقة العدد مؤكَّدة',
    v_migrated_p, v_migrated_m;
END $$;
