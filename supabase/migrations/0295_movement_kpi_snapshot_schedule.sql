-- ============================================================================
-- FILE: 0295_movement_kpi_snapshot_schedule.sql
-- PURPOSE: جدولة لقطة المؤشرات اليومية — إكمال إحياء logistics_kpi_snapshots.
--
-- لماذا مايجريشن منفصل عن 0294:
--   0294 أنشأ الدالة، وهذا يجدولها. الفصل مقصود: الجدولة تعتمد على
--   بنية 0290 (scheduled_job_runs + movement_cron_health)، وخلطهما
--   كان سيجعل 0294 يفشل على قاعدة طُبِّق عليها 0294 دون 0290.
--
-- لماذا اللقطة أصلاً:
--   الـ views تحسب **الحاضر** من بيانات حيّة. اللقطة تحفظ **التاريخ**.
--   بلا لقطات لا يمكن رسم اتجاه OTIF عبر الأشهر — لأن الرحلات القديمة
--   تُؤرشف وتكاليفها تُعدَّل، فالحساب بأثر رجعي يعطي رقماً مختلفاً كل مرة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) مُغلِّف مُسجِّل — نفس نمط 0290
--
--    الفشل يُلتقط ويُسجَّل ثم يُبتلَع: مهمة فاشلة لا تُسقط دورة cron.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_kpi_snapshot_job(
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run     UUID;
  v_start   TIMESTAMPTZ := clock_timestamp();
  v_tenants INTEGER := 0;
  v_ok      INTEGER := 0;
BEGIN
  INSERT INTO public.scheduled_job_runs(job_name, status, details)
  VALUES ('logistics_kpi_snapshot', 'running',
          jsonb_build_object('snapshot_date', p_date))
  RETURNING id INTO v_run;

  BEGIN
    SELECT count(*), count(*) FILTER (WHERE r.snapshot_id IS NOT NULL)
      INTO v_tenants, v_ok
      FROM public.run_logistics_kpi_snapshot_cron(p_date) AS r;

    UPDATE public.scheduled_job_runs
       SET status = 'success',
           finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::INT,
           tenants_processed = COALESCE(v_tenants, 0),
           rows_affected = COALESCE(v_ok, 0)
     WHERE id = v_run;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.scheduled_job_runs
       SET status = 'failed',
           finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::INT,
           error_message = left(SQLERRM, 2000),
           details = details || jsonb_build_object('sqlstate', SQLSTATE)
     WHERE id = v_run;
  END;

  RETURN v_run;
END $$;

COMMENT ON FUNCTION public.run_kpi_snapshot_job(DATE) IS
  'مُغلِّف مُسجِّل للقطة المؤشرات اليومية — يكتب أثره في scheduled_job_runs.';

REVOKE ALL ON FUNCTION public.run_kpi_snapshot_job(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_kpi_snapshot_job(DATE) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) توسيع عرض الصحة ليشمل المهمة الثالثة
--
--    max_age_hours = 36 للمهام اليومية: تسامح مع فروق التوقيت وتأخر
--    الطابور دون إخفاء عطل حقيقي.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.movement_cron_health AS
WITH expected(job_name, label_ar, max_age_hours) AS (
  VALUES ('movement_daily_notifications', 'إشعارات الحركة اليومية', 36),
         ('logistics_kpi_snapshot',       'لقطة مؤشرات اللوجستيات', 36),
         ('telemetry_purge',              'تنظيف بيانات التتبع',     192)
), last_run AS (
  SELECT DISTINCT ON (r.job_name)
         r.job_name, r.started_at, r.finished_at, r.status,
         r.duration_ms, r.tenants_processed, r.rows_affected, r.error_message
    FROM public.scheduled_job_runs r
   ORDER BY r.job_name, r.started_at DESC
)
SELECT e.job_name,
       e.label_ar,
       l.started_at   AS last_run_at,
       l.status       AS last_status,
       l.duration_ms  AS last_duration_ms,
       l.tenants_processed,
       l.rows_affected,
       l.error_message,
       CASE
         WHEN l.job_name IS NULL THEN 'never_ran'
         WHEN l.status = 'failed' THEN 'failing'
         WHEN l.started_at < now() - make_interval(hours => e.max_age_hours) THEN 'stale'
         WHEN l.status = 'running'
              AND l.started_at < now() - interval '1 hour' THEN 'stuck'
         ELSE 'healthy'
       END AS health,
       EXTRACT(EPOCH FROM (now() - l.started_at))/3600 AS hours_since_last
  FROM expected e
  LEFT JOIN last_run l ON l.job_name = e.job_name;

COMMENT ON VIEW public.movement_cron_health IS
  'صحة المهام المجدولة الثلاث: never_ran / failing / stale / stuck / healthy.';

REVOKE ALL ON public.movement_cron_health FROM PUBLIC, anon;
GRANT SELECT ON public.movement_cron_health TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) الجدولة عبر pg_cron
--
--    23:30 UTC: بعد انتهاء يوم العمل بتوقيت بغداد (UTC+3 ⇒ 02:30 صباحاً)
--    كي تلتقط اللقطة رحلات اليوم كاملةً.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_has_cron BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;

  IF NOT v_has_cron THEN
    RAISE NOTICE '⚠️  0295: pg_cron غير متاح — الجدولة متخطّاة (الدالة والعرض جاهزان).';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname = 'kyvzon_logistics_kpi_snapshot';

  PERFORM cron.schedule(
    'kyvzon_logistics_kpi_snapshot',
    '30 23 * * *',
    $cron$SELECT public.run_kpi_snapshot_job(CURRENT_DATE);$cron$
  );

  RAISE NOTICE '✅ 0295: لقطة المؤشرات مُجدوَلة يومياً 23:30 UTC';
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 4) حارس التحقق
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n INT;
BEGIN
  IF to_regprocedure('public.run_kpi_snapshot_job(date)') IS NULL THEN
    RAISE EXCEPTION '0295 failed: job wrapper missing';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.run_kpi_snapshot_job(date)', 'EXECUTE') THEN
    RAISE EXCEPTION '0295 failed: service_role cannot run kpi job';
  END IF;
  IF has_function_privilege('anon', 'public.run_kpi_snapshot_job(date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.run_kpi_snapshot_job(date)', 'EXECUTE') THEN
    RAISE EXCEPTION '0295 failed: kpi job must be service_role only';
  END IF;

  -- العرض يغطي المهام الثلاث
  SELECT count(*) INTO v_n FROM public.movement_cron_health;
  IF v_n <> 3 THEN
    RAISE EXCEPTION '0295 failed: health view has % rows (expected 3)', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.movement_cron_health
                  WHERE job_name = 'logistics_kpi_snapshot') THEN
    RAISE EXCEPTION '0295 failed: kpi job missing from health view';
  END IF;

  -- تشغيل حقيقي: يجب أن يُسجَّل نجاحاً
  PERFORM public.run_kpi_snapshot_job(CURRENT_DATE);
  IF (SELECT last_status FROM public.movement_cron_health
       WHERE job_name = 'logistics_kpi_snapshot') <> 'success' THEN
    RAISE EXCEPTION '0295 failed: kpi job did not report success';
  END IF;

  RAISE NOTICE '✅ 0295: لقطة المؤشرات مُسجَّلة في صحة الجدولة';
END $$;
