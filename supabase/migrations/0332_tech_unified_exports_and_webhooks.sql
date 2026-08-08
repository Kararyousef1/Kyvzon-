-- ============================================================================
-- 0332_tech_unified_exports_and_webhooks.sql
--
-- بوابة التقنية — الصادرات الموحّدة وأحداث الناقلين.
--
-- ─── الأعطال المُثبَتة تشغيلياً قبل هذا المايجريشن ─────────────────────────
--
--  ① tech_export_log(500,0) أعاد **0 صفاً** بينما في القاعدة خمس صادرات
--    حقيقية للمستأجر نفسه:
--       finance_report_exports            = 2
--       inventory_report_exports          = 1
--       mrp_bom_export_requests           = 1
--       mrp_manufacturing_export_requests = 1
--    السبب: الدالة تقرأ جدول `export_logs` وحده، وهو جدول تسجيل يدوي
--    قديم لا تكتب فيه أي من مسارات التصدير الأربعة الفعلية.
--    ⇒ تصدير البيانات حدث أمني، وكان **خفيّاً بالكامل** عن بوابة التقنية.
--
--  ② tech_export_summary(30) أعاد **0 نوعاً** للسبب نفسه.
--
--  ③ صادرة واحدة بحالة `failed` كانت موجودة، وبلا أي سطح عرض أو تنبيه:
--    لا التقني يراها ولا طالبها يعلم أن تصديره سقط.
--
--  ④ inventory_carrier_webhook_events: حدثان `processed=false` (أحدهما
--    عمره 30 ساعة) — رسائل ناقلين عالقة بلا معالجة وبلا أي عرض. الجدول
--    يستعمل `received_at` لا `created_at` و`processed BOOLEAN` لا `status`،
--    فبنيته تختلف عن موصّلات المالية ويحتاج سطحاً منفصلاً.
--
-- ─── ما يفعله هذا المايجريشن ──────────────────────────────────────────────
--   ① tech_export_log        — يُعاد بناؤها فوق UNION ALL لخمسة مصادر
--   ② tech_export_summary    — تُعاد فوق المصادر الخمسة مع تفصيل الحالات
--   ③ tech_export_failures   — الصادرات الفاشلة/العالقة وحدها (سطح إصلاح)
--   ④ tech_carrier_webhooks  — أحداث الناقلين مع عمر التعليق
--   ⑤ tech_webhook_summary   — ملخّص لكل ناقل
--   ⑥ فهارس أداء على أعمدة الترشيح الفعلية
--
-- ─── ملاحظات بنيوية مُحقَّقة (information_schema/pg_constraint) ────────────
--   finance_report_exports:  requested_at NOT NULL · completed_at ·
--     error_message · legal_entity_id NOT NULL · report_run_id NOT NULL FK
--     status ∈ requested·processing·ready·failed·cancelled
--     export_format ∈ xlsx·pdf·csv·json
--   inventory_report_exports: بلا error_message · report_run_id يشير إلى
--     **inventory_periodic_report_runs** (لا `inventory_report_runs` —
--     هذا الجدول غير موجود أصلاً) · export_type ∈ excel·pdf·csv·json
--     status ∈ requested·generating·ready·failed·expired
--   mrp_bom_export_requests: request_number NOT NULL · بلا error_message
--     · بلا completed_at · export_type ∈ excel·csv·json
--   mrp_manufacturing_export_requests: export_number NOT NULL · بلا
--     completed_at · بلا error_message · created_at **و** requested_at
--     status ∈ queued·processing·ready·failed·cancelled
--   export_logs: tenant_id·user_id·export_type·record_count·created_at فقط
--   inventory_carrier_webhook_events: received_at · processed BOOLEAN ·
--     carrier_id FK→inventory_carriers ON DELETE SET NULL · event_status
--
-- ─── قرار أمني ────────────────────────────────────────────────────────────
--   كل الدوال **SECURITY INVOKER** عدا لا شيء: الجداول الخمسة كلها
--   RLS=true، و`finance_report_exports` محميّة بـ
--   `current_user_can_access_legal_entity` (عضوية كيان) بينما الأربعة
--   الأخرى بـ `tenant_id = current_user_tenant_id() AND role IN (…)`.
--   نحترم هاتين الطبقتين ولا نتجاوزهما — التقني يرى ما تسمح به سياساته.
--   هذا مقصود: بوابة التقنية **خاصة بالشركة المستأجِرة** ولا يجوز أن
--   تُسرّب صفاً واحداً من مستأجر آخر.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- إسقاط صريح — CREATE OR REPLACE لا يغيّر نوع الإرجاع (درس 0320)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.tech_export_log(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.tech_export_log(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.tech_export_summary(INTEGER);
DROP FUNCTION IF EXISTS public.tech_export_failures(INTEGER);
DROP FUNCTION IF EXISTS public.tech_carrier_webhooks(BOOLEAN, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.tech_webhook_summary(INTEGER);

-- ─────────────────────────────────────────────────────────────────────────
-- ① سجلّ الصادرات الموحّد — العطل ①
--
--    UNION ALL فوق خمسة مصادر. الأعمدة الغائبة تُملأ بـ NULL صريح مع
--    تحديد النوع، لأن UNION يرفض النوع المجهول.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_export_log(
  p_source TEXT    DEFAULT NULL,   -- finance·inventory·mrp_bom·mrp_mfg·legacy
  p_status TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id           UUID,
  out_source       TEXT,
  out_source_ar    TEXT,
  out_reference    TEXT,
  out_format       TEXT,
  out_status       TEXT,
  out_status_ar    TEXT,
  out_records      INTEGER,
  out_file_url     TEXT,
  out_error        TEXT,
  out_user_id      UUID,
  out_user_name    TEXT,
  out_requested_at TIMESTAMPTZ,
  out_completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_off    INTEGER := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH unified AS (
    -- المالية ─ الوحيدة التي تحمل error_message و completed_at
    SELECT f.id,
           'finance'::TEXT              AS src,
           'تقارير المالية'::TEXT       AS src_ar,
           COALESCE(rr.report_name, rr.report_type, '—')::TEXT AS reference,
           COALESCE(f.export_format, '—')::TEXT                AS fmt,
           COALESCE(f.status, 'requested')::TEXT               AS st,
           NULL::INTEGER                AS records,
           f.file_url::TEXT             AS url,
           f.error_message::TEXT        AS err,
           f.requested_by               AS uid,
           f.requested_at               AS req_at,
           f.completed_at               AS done_at
      FROM public.finance_report_exports f
      LEFT JOIN public.finance_report_runs rr ON rr.id = f.report_run_id
     WHERE f.tenant_id = v_tenant

    UNION ALL

    -- المخزون ─ بلا error_message
    SELECT i.id,
           'inventory'::TEXT,
           'تقارير المخزون'::TEXT,
           COALESCE(ir.report_number, '—')::TEXT,
           COALESCE(i.export_type, '—')::TEXT,
           COALESCE(i.status, 'requested')::TEXT,
           NULL::INTEGER,
           i.file_url::TEXT,
           NULL::TEXT,
           i.requested_by,
           i.requested_at,
           i.completed_at
      FROM public.inventory_report_exports i
      LEFT JOIN public.inventory_periodic_report_runs ir ON ir.id = i.report_run_id
     WHERE i.tenant_id = v_tenant

    UNION ALL

    -- شجرة المواد ─ بلا completed_at وبلا error_message
    SELECT b.id,
           'mrp_bom'::TEXT,
           'شجرة المواد'::TEXT,
           COALESCE(b.request_number, '—')::TEXT,
           COALESCE(b.export_type, '—')::TEXT,
           COALESCE(b.status, 'requested')::TEXT,
           NULL::INTEGER,
           b.file_url::TEXT,
           NULL::TEXT,
           b.requested_by,
           b.requested_at,
           NULL::TIMESTAMPTZ
      FROM public.mrp_bom_export_requests b
     WHERE b.tenant_id = v_tenant

    UNION ALL

    -- تقارير التصنيع ─ بلا completed_at وبلا error_message
    SELECT m.id,
           'mrp_mfg'::TEXT,
           'تقارير التصنيع'::TEXT,
           COALESCE(m.export_number, '—')::TEXT,
           COALESCE(m.export_format, '—')::TEXT,
           COALESCE(m.status, 'queued')::TEXT,
           NULL::INTEGER,
           m.file_url::TEXT,
           NULL::TEXT,
           m.requested_by,
           m.requested_at,
           NULL::TIMESTAMPTZ
      FROM public.mrp_manufacturing_export_requests m
     WHERE m.tenant_id = v_tenant

    UNION ALL

    -- السجلّ اليدوي القديم ─ الوحيد الذي يحمل record_count
    SELECT x.id,
           'legacy'::TEXT,
           'تصدير مباشر'::TEXT,
           COALESCE(x.export_type, '—')::TEXT,
           '—'::TEXT,
           'ready'::TEXT,
           COALESCE(x.record_count, 0),
           NULL::TEXT,
           NULL::TEXT,
           x.user_id,
           x.created_at,
           x.created_at
      FROM public.export_logs x
     WHERE x.tenant_id = v_tenant
  )
  SELECT u.id,
         u.src,
         u.src_ar,
         u.reference,
         u.fmt,
         u.st,
         CASE u.st
           WHEN 'requested'  THEN 'مطلوب'
           WHEN 'queued'     THEN 'في الطابور'
           WHEN 'processing' THEN 'قيد المعالجة'
           WHEN 'generating' THEN 'قيد التوليد'
           WHEN 'ready'      THEN 'جاهز'
           WHEN 'failed'     THEN 'فشل'
           WHEN 'cancelled'  THEN 'ملغى'
           WHEN 'expired'    THEN 'منتهٍ'
           ELSE u.st
         END::TEXT,
         u.records,
         u.url,
         u.err,
         u.uid,
         COALESCE(pr.full_name, pr.email, '—')::TEXT,
         u.req_at,
         u.done_at
    FROM unified u
    LEFT JOIN public.profiles pr ON pr.id = u.uid
   WHERE (p_source IS NULL OR u.src = p_source)
     AND (p_status IS NULL OR u.st  = p_status)
   ORDER BY u.req_at DESC NULLS LAST
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.tech_export_log(TEXT,TEXT,INTEGER,INTEGER) IS
  'سجلّ الصادرات الموحّد فوق 5 مصادر. النسخة السابقة قرأت export_logs وحده '
  'فأعادت 0 صفاً بينما 5 صادرات حقيقية موجودة (العطل ① في 0332).';

REVOKE ALL ON FUNCTION public.tech_export_log(TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_export_log(TEXT,TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_export_log(TEXT,TEXT,INTEGER,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② ملخّص الصادرات — العطل ②
--
--    صف لكل مصدر مع تفصيل الحالات، لا لكل نوع ملف. التقني يسأل
--    «أي وحدة تصدير تفشل؟» لا «كم ملف xlsx صدر؟».
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_export_summary(p_days INTEGER DEFAULT 30)
RETURNS TABLE(
  out_source     TEXT,
  out_source_ar  TEXT,
  out_total      INTEGER,
  out_ready      INTEGER,
  out_pending    INTEGER,
  out_failed     INTEGER,
  out_last_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_d      INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_since  TIMESTAMPTZ;
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;
  v_since := NOW() - (v_d || ' days')::INTERVAL;

  RETURN QUERY
  WITH rows AS (
    SELECT e.out_source AS src, e.out_source_ar AS src_ar,
           e.out_status AS st,  e.out_requested_at AS at
      FROM public.tech_export_log(NULL, NULL, 500, 0) e
     WHERE e.out_requested_at >= v_since
  )
  SELECT r.src,
         min(r.src_ar)::TEXT,
         count(*)::INTEGER,
         count(*) FILTER (WHERE r.st = 'ready')::INTEGER,
         count(*) FILTER (WHERE r.st IN ('requested','queued','processing','generating'))::INTEGER,
         count(*) FILTER (WHERE r.st = 'failed')::INTEGER,
         max(r.at)
    FROM rows r
   GROUP BY r.src
   ORDER BY count(*) FILTER (WHERE r.st = 'failed') DESC, count(*) DESC;
END $$;

COMMENT ON FUNCTION public.tech_export_summary(INTEGER) IS
  'ملخّص الصادرات لكل مصدر مع تفصيل الحالات. مرتّب بالفشل أولاً.';

REVOKE ALL ON FUNCTION public.tech_export_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_export_summary(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_export_summary(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ الصادرات المتعثّرة — العطل ③
--
--    فاشلة، أو عالقة في حالة انتقالية أطول من عتبة. العالق أخطر من
--    الفاشل: الفاشل معروف، والعالق يبدو «قيد المعالجة» إلى الأبد.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_export_failures(p_stuck_hours INTEGER DEFAULT 6)
RETURNS TABLE(
  out_id        UUID,
  out_source    TEXT,
  out_source_ar TEXT,
  out_reference TEXT,
  out_status    TEXT,
  out_kind      TEXT,      -- 'failed' | 'stuck'
  out_kind_ar   TEXT,
  out_age_hours NUMERIC,
  out_error     TEXT,
  out_user_name TEXT,
  out_requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_h      INTEGER := GREATEST(1, LEAST(COALESCE(p_stuck_hours, 6), 720));
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.out_id,
         e.out_source,
         e.out_source_ar,
         e.out_reference,
         e.out_status,
         CASE WHEN e.out_status = 'failed' THEN 'failed' ELSE 'stuck' END::TEXT,
         CASE WHEN e.out_status = 'failed' THEN 'فشل' ELSE 'عالق' END::TEXT,
         round(EXTRACT(EPOCH FROM (NOW() - e.out_requested_at)) / 3600.0, 1),
         e.out_error,
         e.out_user_name,
         e.out_requested_at
    FROM public.tech_export_log(NULL, NULL, 500, 0) e
   WHERE e.out_status = 'failed'
      OR ( e.out_status IN ('requested','queued','processing','generating')
           AND e.out_requested_at < NOW() - (v_h || ' hours')::INTERVAL )
   ORDER BY e.out_requested_at ASC NULLS LAST;
END $$;

COMMENT ON FUNCTION public.tech_export_failures(INTEGER) IS
  'الصادرات الفاشلة والعالقة. العالق يبدو «قيد المعالجة» إلى الأبد فلا '
  'ينتبه له أحد — لذلك يظهر هنا بعمره بالساعات.';

REVOKE ALL ON FUNCTION public.tech_export_failures(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_export_failures(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_export_failures(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ أحداث ناقلي الشحن — العطل ④
--
--    البنية تختلف عن موصّلات المالية: received_at لا created_at،
--    processed BOOLEAN لا status. لذلك سطح منفصل لا دمج قسري.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_carrier_webhooks(
  p_processed BOOLEAN DEFAULT NULL,
  p_limit     INTEGER DEFAULT 100,
  p_offset    INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id          UUID,
  out_carrier_id  UUID,
  out_carrier     TEXT,
  out_provider    TEXT,
  out_tracking    TEXT,
  out_event       TEXT,
  out_processed   BOOLEAN,
  out_age_hours   NUMERIC,
  out_payload_keys INTEGER,
  out_received_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_off    INTEGER := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT w.id,
         w.carrier_id,
         COALESCE(c.name_ar, c.carrier_code, '— ناقل محذوف —')::TEXT,
         COALESCE(c.provider, '—')::TEXT,
         COALESCE(w.tracking_number, '—')::TEXT,
         COALESCE(w.event_status, '—')::TEXT,
         w.processed,
         round(EXTRACT(EPOCH FROM (NOW() - w.received_at)) / 3600.0, 1),
         (SELECT count(*)::INTEGER FROM jsonb_object_keys(COALESCE(w.payload, '{}'::jsonb))),
         w.received_at
    FROM public.inventory_carrier_webhook_events w
    LEFT JOIN public.inventory_carriers c ON c.id = w.carrier_id
   WHERE w.tenant_id = v_tenant
     AND (p_processed IS NULL OR w.processed = p_processed)
   ORDER BY w.processed ASC, w.received_at DESC NULLS LAST
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.tech_carrier_webhooks(BOOLEAN,INTEGER,INTEGER) IS
  'أحداث ناقلي الشحن الواردة. غير المعالَجة أولاً — كانت بلا أي سطح عرض. '
  'carrier_id له ON DELETE SET NULL فيظهر «ناقل محذوف» بدل صف مفقود.';

REVOKE ALL ON FUNCTION public.tech_carrier_webhooks(BOOLEAN,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_carrier_webhooks(BOOLEAN,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_carrier_webhooks(BOOLEAN,INTEGER,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ ملخّص الناقلين — أي ناقل يتراكم عنده العالق
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_webhook_summary(p_days INTEGER DEFAULT 7)
RETURNS TABLE(
  out_carrier_id    UUID,
  out_carrier       TEXT,
  out_provider      TEXT,
  out_is_active     BOOLEAN,
  out_total         INTEGER,
  out_processed     INTEGER,
  out_pending       INTEGER,
  out_oldest_hours  NUMERIC,
  out_last_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_d      INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 7), 365));
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT w.carrier_id,
         COALESCE(c.name_ar, c.carrier_code, '— ناقل محذوف —')::TEXT,
         COALESCE(c.provider, '—')::TEXT,
         c.is_active,
         count(*)::INTEGER,
         count(*) FILTER (WHERE w.processed)::INTEGER,
         count(*) FILTER (WHERE NOT w.processed)::INTEGER,
         COALESCE(
           round(EXTRACT(EPOCH FROM (
             NOW() - min(w.received_at) FILTER (WHERE NOT w.processed)
           )) / 3600.0, 1), 0),
         max(w.received_at)
    FROM public.inventory_carrier_webhook_events w
    LEFT JOIN public.inventory_carriers c ON c.id = w.carrier_id
   WHERE w.tenant_id = v_tenant
     AND w.received_at >= NOW() - (v_d || ' days')::INTERVAL
   GROUP BY w.carrier_id, c.name_ar, c.carrier_code, c.provider, c.is_active
   ORDER BY count(*) FILTER (WHERE NOT w.processed) DESC, count(*) DESC;
END $$;

COMMENT ON FUNCTION public.tech_webhook_summary(INTEGER) IS
  'ملخّص أحداث الناقلين لكل ناقل مع عمر أقدم حدث عالق. مرتّب بالعالق أولاً.';

REVOKE ALL ON FUNCTION public.tech_webhook_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_webhook_summary(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_webhook_summary(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ فهارس الأداء
--
--    كل استعلام أعلاه يُرشّح بـ tenant_id ويرتّب بعمود الزمن. بلا هذه
--    الفهارس يصير UNION ALL فوق خمسة جداول خمس عمليات مسح كاملة.
--    finance_report_exports يُرشّح بـ tenant_id رغم أن سياسته تستعمل
--    legal_entity_id — الفهرس المركّب يخدم الاثنين.
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fin_report_exports_tenant_req
  ON public.finance_report_exports (tenant_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_report_exports_tenant_req
  ON public.inventory_report_exports (tenant_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrp_bom_exports_tenant_req
  ON public.mrp_bom_export_requests (tenant_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrp_mfg_exports_tenant_req
  ON public.mrp_manufacturing_export_requests (tenant_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_logs_tenant_created
  ON public.export_logs (tenant_id, created_at DESC);

-- فهرس جزئي: العالق وحده هو ما يُستعلم عنه بإلحاح، وهو الأقلية
CREATE INDEX IF NOT EXISTS idx_carrier_webhooks_tenant_pending
  ON public.inventory_carrier_webhook_events (tenant_id, received_at DESC)
  WHERE NOT processed;

CREATE INDEX IF NOT EXISTS idx_carrier_webhooks_tenant_received
  ON public.inventory_carrier_webhook_events (tenant_id, received_at DESC);
