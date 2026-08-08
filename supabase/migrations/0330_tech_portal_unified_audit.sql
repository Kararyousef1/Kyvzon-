-- ============================================================================
-- 0330_tech_portal_unified_audit.sql
--
-- تطوير بوابة التقنية: سجلّ تدقيق موحّد · سجلّ الأخطاء · المهام المجدولة.
--
-- ══ السياق ══════════════════════════════════════════════════════════════
--   بوابة التقنية مسؤولة عن الجانب التقني **لكل** البوابات. لكنها اليوم
--   تعرض سبع صفحات تخصّ الحضور والأجهزة فقط، بينما البيانات التقنية
--   الحقيقية بلا واجهة إطلاقاً.
--
-- ══ الفجوات المُثبَتة بالفحص ═══════════════════════════════════════════
--
--  ① ★ سجلّ التدقيق مُبعثَر على **16 جدولاً** بلا أي عرض موحّد:
--     audit_logs · audit_vault · contract_audit_log · crm_audit_log ·
--     finance_audit_events · inventory_audit_log · invoice_audit_log ·
--     movement_audit_events · mrp_audit_log · permission_audit_logs ·
--     po_audit_log · pr_audit_log · procurement_audit_events ·
--     rfx_event_audit_log · supplier_audit_log · platform_audit_log
--
--     مقيس: **صفر** دالة تجميع موحّدة (الموجود كلّه `log_*_audit`
--     للكتابة في جدول واحد بعينه). فمسؤول التقنية الذي يريد الإجابة عن
--     «من غيّر هذا السجلّ؟» عليه أن يعرف أي وحدة أولاً ثم يفتح جدولها.
--
--     ★ الجداول متجانسة بنيوياً (فُحص عمود عمود): كلها فيها
--       `tenant_id` + فاعل + فعل + وقت. أسماء الأعمدة تختلف:
--         الفاعل : actor_id · user_id · changed_by
--         الفعل  : action · event_type
--         الوقت  : created_at · timestamp
--
--  ② ★ `error_logs` بلا واجهة إطلاقاً.
--     جدول فيه `severity` (low·medium·high·critical) و`stack_trace`
--     و`route` و`file_name` — أي كل ما يلزم لتشخيص عطل — ولا صفحة تعرضه.
--
--  ③ ★ `scheduled_job_runs` بلا واجهة، وبلا `tenant_id` أصلاً.
--     سياستها: `current_user_role() IN ('admin','developer','it_admin')`
--     بلا فلتر مستأجر — لأنها **بيانات منصة** (مهام تعمل عبر كل
--     المستأجرين). عرضها كاملةً لتقني الشركة يكشف نشاط بقية العملاء.
--
-- ══ قرار صريح بشأن العزل (امتداد لـ0328) ══════════════════════════════
--   · `platform_audit_log` **يُستثنى** من السجلّ الموحّد: بيانات منصة.
--   · `scheduled_job_runs` يُعرض **مُجمَّعاً بلا تفاصيل المستأجرين**:
--     اسم المهمة · آخر تشغيل · نجاح/فشل. لا `tenants_processed`
--     ولا `details` لتقني الشركة — تلك تكشف حجم العملاء الآخرين.
--   · بقية الجداول تُفلتر بـ`tenant_id` كالمعتاد.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ⓪ إسقاط أولاً — قابلية إعادة التشغيل (درس 0328)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.tech_audit_trail(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.tech_audit_modules();
DROP FUNCTION IF EXISTS public.tech_error_log(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.tech_error_summary(INTEGER);
DROP FUNCTION IF EXISTS public.tech_scheduled_jobs();

-- ─────────────────────────────────────────────────────────────────────────
-- ① السجلّ الموحّد — عرض واحد فوق 15 جدولاً — العطل ①
--
--    `platform_audit_log` مُستثنى عمداً: بيانات منصة لا تخصّ المستأجر.
--    كل فرع يُطبّع أسماء الأعمدة المختلفة إلى شكل واحد.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.tech_audit_unified AS
  SELECT 'عام'::TEXT          AS module, a.tenant_id,
         COALESCE(a.actor_id, a.user_id) AS actor_id,
         a.action::TEXT       AS action,
         a.table_name::TEXT   AS entity,
         a.record_id          AS entity_id,
         COALESCE(a.created_at, a."timestamp") AS occurred_at
    FROM public.audit_logs a
  UNION ALL
  SELECT 'خزانة التدقيق', v.tenant_id, v.user_id, v.action::TEXT,
         v.table_name::TEXT, v.record_id, v."timestamp"
    FROM public.audit_vault v
  UNION ALL
  SELECT 'الصلاحيات', p.tenant_id, p.changed_by, p.action::TEXT,
         'employee'::TEXT, p.emp_id, p."timestamp"
    FROM public.permission_audit_logs p
  UNION ALL
  SELECT 'العقود', c.tenant_id, c.actor_id, c.action::TEXT,
         'contract'::TEXT, NULL::UUID, c.created_at
    FROM public.contract_audit_log c
  UNION ALL
  SELECT 'إدارة العملاء', c.tenant_id, c.actor_id, c.action::TEXT,
         'crm'::TEXT, NULL::UUID, c.created_at
    FROM public.crm_audit_log c
  UNION ALL
  SELECT 'المالية', f.tenant_id, f.actor_id, f.event_type::TEXT,
         'finance'::TEXT, NULL::UUID, f.created_at
    FROM public.finance_audit_events f
  UNION ALL
  SELECT 'المخزون', i.tenant_id, i.actor_id, i.action::TEXT,
         'inventory'::TEXT, NULL::UUID, i.created_at
    FROM public.inventory_audit_log i
  UNION ALL
  SELECT 'الفواتير', i.tenant_id, i.actor_id, i.action::TEXT,
         'invoice'::TEXT, NULL::UUID, i.created_at
    FROM public.invoice_audit_log i
  UNION ALL
  SELECT 'الحركة', m.tenant_id, m.actor_id, m.event_type::TEXT,
         'movement'::TEXT, NULL::UUID, m.created_at
    FROM public.movement_audit_events m
  UNION ALL
  SELECT 'التصنيع', m.tenant_id, m.actor_id, m.action::TEXT,
         'mrp'::TEXT, NULL::UUID, m.created_at
    FROM public.mrp_audit_log m
  UNION ALL
  SELECT 'أوامر الشراء', p.tenant_id, p.actor_id, p.action::TEXT,
         'purchase_order'::TEXT, NULL::UUID, p.created_at
    FROM public.po_audit_log p
  UNION ALL
  SELECT 'طلبات الشراء', p.tenant_id, p.actor_id, p.action::TEXT,
         'purchase_request'::TEXT, NULL::UUID, p.created_at
    FROM public.pr_audit_log p
  UNION ALL
  SELECT 'المشتريات', p.tenant_id, p.actor_id, p.event_type::TEXT,
         'procurement'::TEXT, NULL::UUID, p.created_at
    FROM public.procurement_audit_events p
  UNION ALL
  SELECT 'المناقصات', r.tenant_id, r.actor_id, r.action::TEXT,
         'rfx'::TEXT, NULL::UUID, r.created_at
    FROM public.rfx_event_audit_log r
  UNION ALL
  SELECT 'الموردون', s.tenant_id, s.actor_id, s.action::TEXT,
         'supplier'::TEXT, NULL::UUID, s.created_at
    FROM public.supplier_audit_log s;

COMMENT ON VIEW public.tech_audit_unified IS
  'سجلّ تدقيق موحّد فوق 15 جدولاً. platform_audit_log مُستثنى عمداً '
  '(بيانات منصة لا تخصّ المستأجر — قرار 0328).';

REVOKE ALL ON public.tech_audit_unified FROM PUBLIC;
REVOKE ALL ON public.tech_audit_unified FROM anon;
GRANT SELECT ON public.tech_audit_unified TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② قراءة السجلّ الموحّد بترشيح وترقيم
--
--    SECURITY INVOKER: العرض يقرأ 15 جدولاً لكلٍّ سياساته. تركها
--    INVOKER يجعل RLS يعمل على كل جدول على حدة — لا نتجاوزه بـDEFINER.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_audit_trail(
  p_module TEXT    DEFAULT NULL,
  p_search TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  out_module      TEXT,
  out_actor_id    UUID,
  out_actor_name  TEXT,
  out_action      TEXT,
  out_entity      TEXT,
  out_entity_id   UUID,
  out_occurred_at TIMESTAMPTZ
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
  SELECT u.module,
         u.actor_id,
         COALESCE(pr.full_name, pr.email, '—')::TEXT,
         u.action,
         u.entity,
         u.entity_id,
         u.occurred_at
    FROM public.tech_audit_unified u
    LEFT JOIN public.profiles pr ON pr.id = u.actor_id
   WHERE u.tenant_id = v_tenant
     AND (p_module IS NULL OR u.module = p_module)
     AND (
       p_search IS NULL OR btrim(p_search) = ''
       OR u.action ILIKE '%' || btrim(p_search) || '%'
       OR u.entity ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(pr.full_name, '') ILIKE '%' || btrim(p_search) || '%'
     )
   ORDER BY u.occurred_at DESC NULLS LAST
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.tech_audit_trail(TEXT,TEXT,INTEGER,INTEGER) IS
  'السجلّ الموحّد بترشيح وترقيم. SECURITY INVOKER — يحترم RLS كل جدول.';

REVOKE ALL ON FUNCTION public.tech_audit_trail(TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_audit_trail(TEXT,TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_audit_trail(TEXT,TEXT,INTEGER,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ الوحدات المتاحة + عدّادها — لبناء المرشّحات بلا تخمين
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_audit_modules()
RETURNS TABLE(out_module TEXT, out_events BIGINT, out_last TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT u.module, count(*)::BIGINT, max(u.occurred_at)
    FROM public.tech_audit_unified u
   WHERE u.tenant_id = v_tenant
   GROUP BY u.module
   ORDER BY count(*) DESC;
END $$;

COMMENT ON FUNCTION public.tech_audit_modules() IS
  'الوحدات التي لها أحداث تدقيق في هذا المستأجر مع عدّادها.';

REVOKE ALL ON FUNCTION public.tech_audit_modules() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_audit_modules() FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_audit_modules() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ سجلّ الأخطاء — العطل ②
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_error_log(
  p_severity TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 100,
  p_offset   INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id         UUID,
  out_message    TEXT,
  out_severity   TEXT,
  out_category   TEXT,
  out_source     TEXT,
  out_route      TEXT,
  out_file       TEXT,
  out_line       INTEGER,
  out_stack      TEXT,
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
  SELECT e.id, e.message, e.severity, e.category, e.source,
         e.route, e.file_name, e.line_number, e.stack_trace, e.created_at
    FROM public.error_logs e
   WHERE e.tenant_id = v_tenant
     AND (p_severity IS NULL OR e.severity = p_severity)
   ORDER BY e.created_at DESC NULLS LAST
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.tech_error_log(TEXT,INTEGER,INTEGER) IS
  'سجلّ أخطاء الشركة. الجدول كان بلا واجهة رغم احتوائه stack_trace '
  'و route و severity — أي كل ما يلزم للتشخيص (عطل 0330/②).';

REVOKE ALL ON FUNCTION public.tech_error_log(TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_error_log(TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_error_log(TEXT,INTEGER,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ ملخّص الأخطاء حسب الخطورة — لبطاقات اللوحة
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_error_summary(p_hours INTEGER DEFAULT 24)
RETURNS TABLE(
  out_severity TEXT,
  out_count    INTEGER,
  out_last     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_h      INTEGER := GREATEST(1, LEAST(COALESCE(p_hours, 24), 8760));
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  -- كل مستوى يظهر ولو بصفر: بطاقة مفقودة تُقرأ «لا مشكلة» خطأً
  SELECT s.sev,
         COALESCE(c.n, 0)::INTEGER,
         c.last_at
    FROM (VALUES ('critical'),('high'),('medium'),('low')) AS s(sev)
    LEFT JOIN (
      SELECT e.severity AS sev, count(*)::INTEGER AS n, max(e.created_at) AS last_at
        FROM public.error_logs e
       WHERE e.tenant_id = v_tenant
         AND e.created_at >= NOW() - (v_h || ' hours')::INTERVAL
       GROUP BY e.severity
    ) c ON c.sev = s.sev
   ORDER BY CASE s.sev WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                       WHEN 'medium'   THEN 3 ELSE 4 END;
END $$;

COMMENT ON FUNCTION public.tech_error_summary(INTEGER) IS
  'ملخّص الأخطاء حسب الخطورة. كل مستوى يظهر ولو بصفر — البطاقة '
  'المفقودة تُقرأ «لا مشكلة» خطأً.';

REVOKE ALL ON FUNCTION public.tech_error_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_error_summary(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_error_summary(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ المهام المجدولة — مُجمَّعة بلا كشف بقية المستأجرين — العطل ③
--
--    ★ `scheduled_job_runs` بلا `tenant_id`: مهام تعمل عبر كل العملاء.
--      نعرض لتقني الشركة **حالة المهمة** فقط: اسمها · آخر تشغيل ·
--      نجحت أم لا · مدّتها. ولا نعرض `tenants_processed` ولا `details`
--      لأنهما يكشفان حجم العملاء الآخرين ونشاطهم (قرار عزل 0328).
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.tech_scheduled_jobs()
RETURNS TABLE(
  out_job_name    TEXT,
  out_last_run    TIMESTAMPTZ,
  out_last_status TEXT,
  out_duration_ms INTEGER,
  out_runs_24h    INTEGER,
  out_failures_24h INTEGER,
  out_is_healthy  BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER          -- الجدول بلا tenant_id؛ نُقيّد الدور يدوياً أدناه
SET search_path = public
AS $$
BEGIN
  -- تقنية الشركة فقط — لا تسريب لغير المخوّلين
  IF NOT public.current_user_is_tenant_tech() THEN RETURN; END IF;

  RETURN QUERY
  SELECT j.job_name,
         max(j.started_at),
         (ARRAY_AGG(j.status ORDER BY j.started_at DESC))[1]::TEXT,
         (ARRAY_AGG(j.duration_ms ORDER BY j.started_at DESC))[1],
         count(*) FILTER (
           WHERE j.started_at >= NOW() - INTERVAL '24 hours')::INTEGER,
         count(*) FILTER (
           WHERE j.started_at >= NOW() - INTERVAL '24 hours'
             AND j.status <> 'success')::INTEGER,
         -- سليمة: آخر تشغيل نجح ولا فشل خلال 24 ساعة
         ((ARRAY_AGG(j.status ORDER BY j.started_at DESC))[1] = 'success'
          AND count(*) FILTER (
            WHERE j.started_at >= NOW() - INTERVAL '24 hours'
              AND j.status <> 'success') = 0)
    FROM public.scheduled_job_runs j
   GROUP BY j.job_name
   ORDER BY max(j.started_at) DESC NULLS LAST;
END $$;

COMMENT ON FUNCTION public.tech_scheduled_jobs() IS
  'حالة المهام المجدولة **مُجمَّعة**: اسم · آخر تشغيل · نجاح · مدّة. '
  'لا تُعيد tenants_processed ولا details لأنهما يكشفان نشاط بقية '
  'العملاء (قرار عزل 0328).';

REVOKE ALL ON FUNCTION public.tech_scheduled_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tech_scheduled_jobs() FROM anon;
GRANT EXECUTE ON FUNCTION public.tech_scheduled_jobs() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0330: بوابة التقنية — سجلّ موحّد وأخطاء ومهام مجدولة';
END $$;
