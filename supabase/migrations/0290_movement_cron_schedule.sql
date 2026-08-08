-- ============================================================================
-- FILE: 0290_movement_cron_schedule.sql
-- PURPOSE: جدولة فعلية لمهام بوابة الحركة عبر pg_cron — لا توثيق فقط.
--
-- الحالة قبل هذا المايجريشن (تصحيح لما سبق):
--   0286 بنى run_movement_daily_notifications_cron() و purge_old_telemetry()
--   ومنحهما لـ service_role. 0268 فعل المثل للمشتريات. ولا مايجريشن واحد
--   في المشروع كله ينفّذ cron.schedule(). التقارير السابقة قالت
--   «الدالة جاهزة · تحتاج جدولة في Supabase» — أي أن الجدولة كانت
--   **خطوة يدوية غير موثَّقة في الكود** يسهل نسيانها، ولو نُسيت لظلّت
--   الإشعارات صامتة إلى الأبد بلا أي إنذار.
--
-- لماذا pg_cron لا Edge Function + جدولة لوحة التحكم:
--   Edge Function موجودة (movement-daily-notifications) وتبقى مفيدة
--   للاستدعاء اليدوي والاختبار. لكن جدولتها تعيش في لوحة تحكم Supabase
--   — خارج Git، غير مراجَعة، وتضيع عند إعادة إنشاء المشروع.
--   pg_cron يعيش في قاعدة البيانات: يُنشأ بالمايجريشن، ويُراجَع في PR،
--   ويُعاد بناؤه تلقائياً في أي بيئة جديدة.
--
-- التعامل مع غياب pg_cron:
--   الامتداد متاح على Supabase المُدار لكنه غير موجود في Postgres
--   المحلي المجرَّد. المايجريشن يكتشف غيابه ويتخطّى الجدولة بإشعار
--   واضح بدل الفشل — وإلا لتعذّر تشغيل المجموعة كاملةً محلياً.
--   ⚠️ هذا يعني أن الجدولة نفسها **لم تُختبر محلياً** — لا يمكن ادعاء
--   ذلك. المُختبَر محلياً: الدوال المُستدعاة، والصلاحيات، والحراس،
--   وسجل التشغيل. الجدولة تُتحقَّق على Supabase بعد db push عبر
--   movement_cron_health.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) سجل تشغيل المهام المجدولة
--
--    بدونه لا سبيل لمعرفة أن cron توقّف: الإشعارات تصمت ولا أحد يلاحظ
--    حتى تنتهي رخصة سائق. هذا الجدول يجعل الصمت **مرئياً**.
--    عام لكل الوحدات لا للحركة وحدها — نفس المشكلة قائمة في المشتريات.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name      TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INTEGER,
  status        TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running','success','failed')),
  tenants_processed INTEGER NOT NULL DEFAULT 0,
  rows_affected     INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_name_time
  ON public.scheduled_job_runs (job_name, started_at DESC);

COMMENT ON TABLE public.scheduled_job_runs IS
  'سجل تشغيل المهام المجدولة — يجعل توقّف cron الصامت قابلاً للاكتشاف.';

/*
  RLS: هذا الجدول تشغيليّ لا يخصّ مستأجراً بعينه (المهمة تمرّ على كل
  المستأجرين). يُفعَّل RLS ويُمنع الوصول من anon نهائياً، ويُسمح
  للمشرفين بالقراءة فقط — لا كتابة من الواجهة إطلاقاً.
*/
ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_scheduled_job_runs_read ON public.scheduled_job_runs;
CREATE POLICY kyvzon_scheduled_job_runs_read
  ON public.scheduled_job_runs FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','developer','it_admin'));

REVOKE ALL ON public.scheduled_job_runs FROM PUBLIC, anon;
GRANT SELECT ON public.scheduled_job_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scheduled_job_runs TO service_role;

-- ---------------------------------------------------------------------------
-- 2) مُغلِّف مُسجِّل: يُشغّل المهمة ويكتب أثرها نجحت أم فشلت
--
--    EXCEPTION تلتقط الفشل وتسجّله ثم **تبتلعه**: مهمة فاشلة يجب ألا
--    تُسقط دورة cron ولا تمنع المهام التالية. الفشل يُرى في السجل
--    وفي movement_cron_health لا في صمت.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_movement_notifications_job(
  p_grace_minutes INTEGER DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run     UUID;
  v_start   TIMESTAMPTZ := clock_timestamp();
  v_tenants INTEGER := 0;
  v_rows    INTEGER := 0;
BEGIN
  INSERT INTO public.scheduled_job_runs(job_name, status)
  VALUES ('movement_daily_notifications', 'running')
  RETURNING id INTO v_run;

  BEGIN
    SELECT count(DISTINCT r.tenant_id), COALESCE(SUM(r.notifications), 0)
      INTO v_tenants, v_rows
      FROM public.run_movement_daily_notifications_cron(p_grace_minutes) AS r;

    UPDATE public.scheduled_job_runs
       SET status = 'success',
           finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::INT,
           tenants_processed = COALESCE(v_tenants, 0),
           rows_affected = COALESCE(v_rows, 0)
     WHERE id = v_run;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.scheduled_job_runs
       SET status = 'failed',
           finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::INT,
           error_message = left(SQLERRM, 2000),
           details = jsonb_build_object('sqlstate', SQLSTATE)
     WHERE id = v_run;
    -- لا RAISE: الفشل مُسجَّل، ودورة cron تكمل
  END;

  RETURN v_run;
END $$;

COMMENT ON FUNCTION public.run_movement_notifications_job(INTEGER) IS
  'مُغلِّف مُسجِّل لإشعارات الحركة اليومية — يكتب أثر كل تشغيل في scheduled_job_runs.';

-- ---------------------------------------------------------------------------
-- 3) مُغلِّف تنظيف التتبع
--
--    logistics_telemetry ينمو بلا حد: مركبة واحدة بإشارة كل 30 ثانية
--    تُنتج ~2,880 صفاً يومياً. أسطول من 50 مركبة ⇒ 52 مليون صف سنوياً.
--    بلا تنظيف دوري يصير التتبع الحي بطيئاً ثم مستحيلاً.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_telemetry_purge_job(
  p_days INTEGER DEFAULT 90
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run   UUID;
  v_start TIMESTAMPTZ := clock_timestamp();
  v_rows  INTEGER := 0;
BEGIN
  INSERT INTO public.scheduled_job_runs(job_name, status, details)
  VALUES ('telemetry_purge', 'running', jsonb_build_object('retention_days', p_days))
  RETURNING id INTO v_run;

  BEGIN
    SELECT public.purge_old_telemetry(p_days) INTO v_rows;

    UPDATE public.scheduled_job_runs
       SET status = 'success',
           finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::INT,
           rows_affected = COALESCE(v_rows, 0)
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

COMMENT ON FUNCTION public.run_telemetry_purge_job(INTEGER) IS
  'مُغلِّف مُسجِّل لتنظيف بيانات التتبع القديمة.';

-- ---------------------------------------------------------------------------
-- 4) عرض صحة الجدولة — يكشف التوقّف الصامت
--
--    المنطق: مهمة يومية لم تُشغَّل منذ أكثر من 36 ساعة = متوقفة.
--    36 لا 24: تسامح مع فروق التوقيت وتأخر الطابور دون إخفاء عطل حقيقي.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.movement_cron_health AS
WITH expected(job_name, label_ar, max_age_hours) AS (
  VALUES ('movement_daily_notifications', 'إشعارات الحركة اليومية', 36),
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
  'صحة المهام المجدولة: never_ran / failing / stale / stuck / healthy.';

REVOKE ALL ON public.movement_cron_health FROM PUBLIC, anon;
GRANT SELECT ON public.movement_cron_health TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) الصلاحيات على المُغلِّفَين
--    service_role فقط: لا anon ولا authenticated. مستخدم مسجَّل يجب ألا
--    يستطيع إطلاق دورة إشعارات لكل المستأجرين.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.run_movement_notifications_job(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_telemetry_purge_job(INTEGER)        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.run_movement_notifications_job(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_telemetry_purge_job(INTEGER)        TO service_role;

-- ---------------------------------------------------------------------------
-- 6) الجدولة الفعلية عبر pg_cron
--
--    unschedule قبل schedule: المايجريشن يجب أن يكون قابلاً لإعادة
--    التشغيل بلا ازدواج مهام.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_has_cron BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    INTO v_has_cron;

  IF NOT v_has_cron THEN
    -- محاولة التفعيل: ينجح على Supabase، ويفشل على Postgres مجرَّد
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      v_has_cron := TRUE;
    EXCEPTION WHEN OTHERS THEN
      v_has_cron := FALSE;
    END;
  END IF;

  IF NOT v_has_cron THEN
    RAISE NOTICE '⚠️  0290: pg_cron غير متاح — الجدولة متخطّاة.';
    RAISE NOTICE '    الدوال والسجل والعرض أُنشئت وتعمل.';
    RAISE NOTICE '    على Supabase: فعّل pg_cron من Database → Extensions ثم أعد تشغيل هذا المايجريشن،';
    RAISE NOTICE '    أو استعمل Edge Function movement-daily-notifications بجدولة لوحة التحكم.';
    RETURN;
  END IF;

  -- إزالة أي جدولة سابقة بنفس الاسم (إعادة تشغيل آمنة)
  PERFORM cron.unschedule(jobid)
     FROM cron.job
    WHERE jobname IN ('kyvzon_movement_daily_notifications',
                      'kyvzon_telemetry_purge');

  -- الإشعارات: يومياً 06:00 UTC (09:00 بتوقيت بغداد UTC+3)
  PERFORM cron.schedule(
    'kyvzon_movement_daily_notifications',
    '0 6 * * *',
    $cron$SELECT public.run_movement_notifications_job(30);$cron$
  );

  -- التنظيف: أسبوعياً الأحد 03:00 UTC — خارج ساعات الذروة
  PERFORM cron.schedule(
    'kyvzon_telemetry_purge',
    '0 3 * * 0',
    $cron$SELECT public.run_telemetry_purge_job(90);$cron$
  );

  RAISE NOTICE '✅ 0290: pg_cron مُجدوَل — الإشعارات يومياً 06:00 UTC · التنظيف الأحد 03:00 UTC';
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 7) حارس التحقق
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn      TEXT;
  v_bad     TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.run_movement_notifications_job(integer)',
    'public.run_telemetry_purge_job(integer)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN v_missing := v_missing || ' ' || v_fn; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION '0290 failed: missing functions:%', v_missing;
  END IF;

  IF to_regclass('public.scheduled_job_runs') IS NULL THEN
    RAISE EXCEPTION '0290 failed: scheduled_job_runs table missing';
  END IF;
  IF to_regclass('public.movement_cron_health') IS NULL THEN
    RAISE EXCEPTION '0290 failed: movement_cron_health view missing';
  END IF;

  -- service_role لا بد أن ينفّذ، وإلا فالجدولة عديمة الجدوى
  FOREACH v_fn IN ARRAY ARRAY[
    'public.run_movement_notifications_job(integer)',
    'public.run_telemetry_purge_job(integer)'
  ] LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0290 failed: service_role cannot execute %', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0290 failed: anon must not execute %', v_fn;
    END IF;
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0290 failed: authenticated must not execute %', v_fn;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.scheduled_job_runs', 'SELECT') THEN
    RAISE EXCEPTION '0290 failed: anon can read scheduled_job_runs';
  END IF;
  IF has_table_privilege('anon', 'public.movement_cron_health', 'SELECT') THEN
    RAISE EXCEPTION '0290 failed: anon can read movement_cron_health';
  END IF;

  -- سجل التشغيل يجب أن يبقى بـ RLS مفعَّل وسياسة واحدة على الأقل
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'scheduled_job_runs' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '0290 failed: RLS not enabled on scheduled_job_runs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'scheduled_job_runs'
  ) THEN
    RAISE EXCEPTION '0290 failed: scheduled_job_runs has RLS but no policy (total lockout)';
  END IF;

  SELECT string_agg(health, ', ') INTO v_bad
    FROM public.movement_cron_health WHERE health IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0290 failed: health view returns NULL status';
  END IF;

  RAISE NOTICE '✅ 0290: scheduled job logging + health view applied';
END $$;
