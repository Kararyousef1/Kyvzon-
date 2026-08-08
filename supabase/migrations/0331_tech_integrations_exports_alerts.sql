-- ============================================================================
-- 0331_tech_integrations_exports_alerts.sql
--
-- بوابة التقنية: صحّة التكاملات · سجلّ الصادرات · تنبيه الأخطاء الحرجة.
--
-- ══ الفجوات المُثبَتة بالفحص ═══════════════════════════════════════════
--
--  ① ★ التكاملات بلا واجهة إطلاقاً.
--     `finance_integration_connectors` (موصّلات الأنظمة الخارجية) و
--     `finance_integration_events` (الأحداث الواردة) و
--     `inventory_carrier_webhook_events` (webhooks شركات الشحن).
--
--     مقيس: صفر صفحة تعرضها. فحين يتوقّف تكامل — لا يعلم أحد إلا حين
--     تختفي البيانات. و`finance_integration_events.status` فيه
--     `failed` و`error_message` جاهزان ولا شيء يقرؤهما.
--
--  ② ★ الصادرات بلا واجهة.
--     خمسة جداول: `export_logs` · `finance_report_exports` ·
--     `inventory_report_exports` · `mrp_bom_export_requests` ·
--     `mrp_manufacturing_export_requests`.
--     تصدير البيانات حدث أمني (من صدّر ماذا ومتى) وبلا عرض لا يُدقَّق.
--
--  ③ ★ الأخطاء الحرجة صامتة.
--     `error_logs.severity='critical'` يُكتب ولا يُشعِر أحداً.
--     0330 أعطاها صفحة، لكن الصفحة تتطلّب أن يفتحها المسؤول. الخطأ
--     الحرج يجب أن يصل الجرس (`notify_user` من 0323).
--
-- ══ ملاحظات أعمدة مُحقَّقة (لا تُخمَّن) ════════════════════════════════
--     finance_integration_connectors: tenant_id · legal_entity_id ·
--       connector_code · connector_name · source_system  كلها NOT NULL
--       status ∈ active·paused·archived
--     finance_integration_events.status ∈ received·reviewed·converted·
--       rejected·ignored·failed
--     inventory_carrier_webhook_events: `received_at` لا `created_at`
--       و`processed` BOOLEAN لا `status`
--     export_logs: export_type · record_count · user_id · created_at فقط
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ⓪ إسقاط في المقدّمة — قابلية إعادة التشغيل (درس 0328)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.tech_integrations_health();
DROP FUNCTION IF EXISTS public.tech_integration_events(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.tech_export_log(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.tech_export_summary(INTEGER);
DROP FUNCTION IF EXISTS public.notify_critical_error(UUID);

-- ─────────────────────────────────────────────────────────────────────────
-- ① صحّة التكاملات — العطل ①
--
--    صفّ لكل موصّل: حالته · أحداث 24 ساعة · الفاشلة · آخر نشاط.
--    SECURITY INVOKER: الجداول لها سياساتها (finance_* محميّة بـ
--    current_user_can_access_legal_entity) فنحترمها لا نتجاوزها.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_integrations_health()
RETURNS TABLE(
  out_connector_id   UUID,
  out_code           TEXT,
  out_name           TEXT,
  out_source_system  TEXT,
  out_direction      TEXT,
  out_status         TEXT,
  out_events_24h     INTEGER,
  out_failed_24h     INTEGER,
  out_pending_review INTEGER,
  out_last_event_at  TIMESTAMPTZ,
  out_is_healthy     BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id,
         c.connector_code,
         c.connector_name,
         c.source_system,
         COALESCE(c.direction, '—'),
         COALESCE(c.status, 'active'),
         COALESCE(e.n24, 0)::INTEGER,
         COALESCE(e.f24, 0)::INTEGER,
         COALESCE(e.pend, 0)::INTEGER,
         e.last_at,
         -- سليم: نشط وبلا فشل خلال 24 ساعة.
         -- ★ الموصّل الموقوف/المؤرشف لا يُعدّ معطوباً — وإلا صار
         --   تنبيهاً دائماً يُدرَّب المستخدم على تجاهله (درس 0327).
         (COALESCE(c.status,'active') <> 'active'
          OR COALESCE(e.f24, 0) = 0)
    FROM public.finance_integration_connectors c
    LEFT JOIN (
      SELECT ev.connector_id,
             count(*) FILTER (WHERE ev.created_at >= NOW() - INTERVAL '24 hours') AS n24,
             count(*) FILTER (WHERE ev.created_at >= NOW() - INTERVAL '24 hours'
                                AND ev.status = 'failed')                          AS f24,
             count(*) FILTER (WHERE ev.status = 'received')                        AS pend,
             max(ev.created_at)                                                    AS last_at
        FROM public.finance_integration_events ev
       WHERE ev.tenant_id = v_tenant
       GROUP BY ev.connector_id
    ) e ON e.connector_id = c.id
   WHERE c.tenant_id = v_tenant
   ORDER BY (COALESCE(c.status,'active') = 'active') DESC,
            COALESCE(e.f24, 0) DESC,
            c.connector_name;
END $$;

COMMENT ON FUNCTION public.tech_integrations_health() IS
  'صحّة موصّلات التكامل: أحداث 24 ساعة والفاشلة والمعلَّقة. الموصّل '
  'الموقوف لا يُعدّ معطوباً (عطل 0331/①).';

REVOKE ALL ON FUNCTION public.tech_integrations_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_integrations_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_integrations_health() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② أحداث التكامل بترشيح — لتشخيص الفشل
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_integration_events(
  p_status TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id         UUID,
  out_connector  TEXT,
  out_source     TEXT,
  out_event_type TEXT,
  out_status     TEXT,
  out_amount     NUMERIC,
  out_error      TEXT,
  out_created_at TIMESTAMPTZ
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
  SELECT ev.id,
         COALESCE(c.connector_name, ev.source_system, '—'),
         COALESCE(ev.source_system, '—'),
         COALESCE(ev.event_type, '—'),
         COALESCE(ev.status, 'received'),
         ev.amount,
         ev.error_message,
         ev.created_at
    FROM public.finance_integration_events ev
    LEFT JOIN public.finance_integration_connectors c ON c.id = ev.connector_id
   WHERE ev.tenant_id = v_tenant
     AND (p_status IS NULL OR ev.status = p_status)
   ORDER BY ev.created_at DESC NULLS LAST
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.tech_integration_events(TEXT,INTEGER,INTEGER) IS
  'أحداث التكامل بترشيح الحالة. error_message كان يُكتب ولا يُقرأ.';

REVOKE ALL ON FUNCTION public.tech_integration_events(TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_integration_events(TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_integration_events(TEXT,INTEGER,INTEGER)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ سجلّ الصادرات — العطل ②
--
--    تصدير البيانات حدث أمني: من صدّر ماذا ومتى. وبلا عرض لا يُدقَّق.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_export_log(
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id         UUID,
  out_type       TEXT,
  out_records    INTEGER,
  out_user_id    UUID,
  out_user_name  TEXT,
  out_created_at TIMESTAMPTZ
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
  SELECT x.id,
         COALESCE(x.export_type, '—'),
         COALESCE(x.record_count, 0),
         x.user_id,
         COALESCE(pr.full_name, pr.email, '—')::TEXT,
         x.created_at
    FROM public.export_logs x
    LEFT JOIN public.profiles pr ON pr.id = x.user_id
   WHERE x.tenant_id = v_tenant
   ORDER BY x.created_at DESC NULLS LAST
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.tech_export_log(INTEGER,INTEGER) IS
  'سجلّ صادرات الشركة: من صدّر ماذا ومتى. حدث أمني كان بلا عرض.';

REVOKE ALL ON FUNCTION public.tech_export_log(INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_export_log(INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_export_log(INTEGER,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ ملخّص الصادرات — أكثر المصدّرين ونوعاً
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_export_summary(p_days INTEGER DEFAULT 30)
RETURNS TABLE(
  out_export_type TEXT,
  out_exports     INTEGER,
  out_records     BIGINT,
  out_last_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_d      INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT COALESCE(x.export_type, '—'),
         count(*)::INTEGER,
         COALESCE(sum(x.record_count), 0)::BIGINT,
         max(x.created_at)
    FROM public.export_logs x
   WHERE x.tenant_id = v_tenant
     AND x.created_at >= NOW() - (v_d || ' days')::INTERVAL
   GROUP BY COALESCE(x.export_type, '—')
   ORDER BY count(*) DESC;
END $$;

COMMENT ON FUNCTION public.tech_export_summary(INTEGER) IS
  'ملخّص الصادرات حسب النوع خلال نافذة زمنية.';

REVOKE ALL ON FUNCTION public.tech_export_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_export_summary(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_export_summary(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ تنبيه الأخطاء الحرجة — العطل ③
--
--    الخطأ الحرج يصل جرس تقنيي الشركة فوراً بدل انتظار فتح الصفحة.
--    VOLATILE: يكتب (درس 0320).
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.notify_critical_error(p_error_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_who RECORD;
  v_n   INT := 0;
BEGIN
  IF p_error_id IS NULL THEN RETURN 0; END IF;

  SELECT e.tenant_id, e.message, e.severity, e.route
    INTO v_row
    FROM public.error_logs e
   WHERE e.id = p_error_id;

  IF v_row.tenant_id IS NULL THEN RETURN 0; END IF;
  -- الحرجة وحدها تُشعِر: إشعار كل خطأ يُدرِّب على التجاهل
  IF COALESCE(v_row.severity, '') <> 'critical' THEN RETURN 0; END IF;

  FOR v_who IN
    SELECT p.id FROM public.profiles p
     WHERE p.tenant_id = v_row.tenant_id
       AND p.role IN ('it_admin', 'tech', 'admin')
  LOOP
    IF public.notify_user(
         v_row.tenant_id, v_who.id, 'tech_critical_error',
         'خطأ حرج في النظام',
         LEFT(COALESCE(v_row.message, 'خطأ غير موصوف'), 180)
           || COALESCE(' — ' || v_row.route, ''),
         '/app/tech-portal/error-logs',
         'error_logs', p_error_id) IS NOT NULL
    THEN v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.notify_critical_error(UUID) IS
  'يُشعر تقنيي الشركة بخطأ حرج. الحرجة وحدها — إشعار كل خطأ يُدرِّب '
  'المستخدم على التجاهل (عطل 0331/③).';

REVOKE ALL ON FUNCTION public.notify_critical_error(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_critical_error(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_critical_error(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ محفّز: كل خطأ حرج يُشعِر تلقائياً
--
--    ★ AFTER INSERT: التسجيل أولاً ثم الإشعار. ولا يُسقط الكتابة
--      عند فشل الإشعار (notify_user تبتلع أخطاءها أصلاً — 0322).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_notify_critical_error()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.severity, '') = 'critical' THEN
    PERFORM public.notify_critical_error(NEW.id);
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_notify_critical_error() IS
  'محفّز إشعار الأخطاء الحرجة فور تسجيلها.';

DROP TRIGGER IF EXISTS trg_notify_critical_error ON public.error_logs;
CREATE TRIGGER trg_notify_critical_error
  AFTER INSERT ON public.error_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_critical_error();

DO $$
BEGIN
  RAISE NOTICE '✅ 0331: التكاملات والصادرات وتنبيه الأخطاء الحرجة';
END $$;
