-- ============================================================================
-- 0329_legacy_view_deprecation.sql
--
-- الإيقاف التدريجي للبوابة القديمة (`?view=`) — القرار «ب».
--
-- ══ ما هي «البوابة القديمة» بالضبط (فُحص لا خُمّن) ═════════════════════
--
--   لم يعد هناك ملف بوابة قديمة قائم. الهجرة إلى `react-router-dom`
--   **اكتملت** فعلاً — يحرسها `src/test/router/no-legacy-view.test.ts`:
--     · لا `useLegacyView` · لا `setActiveView()` · لا `activeView` في المتجر
--
--   الباقي هو **طبقة التوجيه القديمة**:
--     · `src/router/legacyRedirect.ts` — 435 تعييناً `?view=xxx → /app/...`
--     · `LegacyViewHandler` في `AppRouter.tsx` — يُحوّل صامتاً
--     · ثلاثة مستهلكين: `AppRouter` · `NotificationBell` · `MyNotificationsPage`
--
-- ══ ما فُحص فوجد سليماً ════════════════════════════════════════════════
--   · **صفر** موضع في الكود الداخلي يولّد `?view=` (grep على src كامل)
--   · **صفر** دالة في القاعدة تكتب `?view=` في `action_url`
--     (الكاتبتان الوحيدتان: `notify_user` · `create_notification_safe`
--      وكلتاهما تكتبان مسارات `/app/...`)
--   · 435 تعييناً كلها لمسارات قائمة · 14 مساراً له aliases (≤4)
--
--   فالطبقة تخدم **الروابط الخارجية القديمة وحدها**: إشارات مرجعية
--   محفوظة، روابط في رسائل بريد قديمة، وإشعارات مُخزَّنة قبل الهجرة.
--
-- ══ العطل ══════════════════════════════════════════════════════════════
--
--  ★ إيقاف تدريجي بلا قياس = إيقاف لا يحدث أبداً.
--    الطبقة تُحوّل **صامتةً** منذ الهجرة: لا أحد يعرف
--      · هل ما زال أحد يستعملها؟
--      · أي view ids تحديداً؟
--      · متى يُؤمَن حذفها؟
--
--    فتبقى 435 سطراً + مكوّن توجيه إلى الأبد «تحسّباً»، وهذا بالضبط
--    ما يجعل القرار «ب» قراراً على الورق.
--
--    ولا يوجد أي جدول قياس استعمال في المشروع (فُحص: لا `%usage%`
--    ولا `%telemetry%` ولا `%deprecat%` يخصّ التوجيه).
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   القياس قبل الحذف. نُسجّل كل استعمال فعلي، ونعرض لوحة تُخبر متى
--   يُؤمَن الحذف. الحذف نفسه قرار المستخدم بعد رؤية صفر استعمال لمدة
--   كافية — لا قرارنا الآن.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① سجلّ استعمال المسارات المهجورة
--
--    صفّ واحد لكل (مستأجر · view · يوم) — تجميع لا سطر لكل نقرة،
--    فلا ينتفخ الجدول ولا يبطئ التوجيه.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legacy_route_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  view_id      TEXT        NOT NULL,
  resolved_to  TEXT,
  user_id      UUID,
  hit_count    INTEGER     NOT NULL DEFAULT 1,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usage_date   DATE        NOT NULL DEFAULT CURRENT_DATE
);

COMMENT ON TABLE public.legacy_route_usage IS
  'استعمال طبقة التوجيه القديمة (?view=). الغرض: قياس قبل الحذف — '
  'إيقاف تدريجي بلا قياس لا يحدث أبداً (0329).';

-- ★ فهرسان جزئيان لا فهرس فريد واحد:
--   UNIQUE يعامل NULL كقيمة مميّزة، و`tenant_id` قد يكون NULL
--   (زائر غير مسجَّل) فيتكرّر الصفّ بلا حدّ. (مزلق موثَّق منذ 0305)
CREATE UNIQUE INDEX IF NOT EXISTS legacy_route_usage_uniq_tenant
  ON public.legacy_route_usage (tenant_id, view_id, usage_date)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS legacy_route_usage_uniq_anon
  ON public.legacy_route_usage (view_id, usage_date)
  WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS legacy_route_usage_last_seen
  ON public.legacy_route_usage (last_seen DESC);

ALTER TABLE public.legacy_route_usage ENABLE ROW LEVEL SECURITY;

-- ★ إسقاط أولاً: المايجريشن يجب أن يكون قابلاً لإعادة التشغيل
--   (درس 0328: CREATE POLICY يفشل على اسم موجود)
DROP POLICY IF EXISTS legacy_route_usage_select ON public.legacy_route_usage;
DROP POLICY IF EXISTS legacy_route_usage_guard  ON public.legacy_route_usage;

-- القراءة: تقنية الشركة داخل مستأجرها · مالك المنصة يرى الكل
CREATE POLICY legacy_route_usage_select ON public.legacy_route_usage
  FOR SELECT
  USING (
    public.current_user_is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id()
        AND public.current_user_is_tenant_tech())
  );

-- ★ حارس تقييدي: يُجمع بـAND فلا توسّعه سياسة لاحقة (درس 0320)
CREATE POLICY legacy_route_usage_guard ON public.legacy_route_usage
  AS RESTRICTIVE
  FOR ALL
  USING (
    public.current_user_is_platform_owner()
    OR tenant_id = public.current_user_tenant_id()
  );

REVOKE ALL ON public.legacy_route_usage FROM PUBLIC;
REVOKE ALL ON public.legacy_route_usage FROM anon;
GRANT SELECT ON public.legacy_route_usage TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② تسجيل استعمال — VOLATILE (الكتابة مستحيلة في STABLE، درس 0320)
--
--    لا تُسقط التوجيه أبداً: فشل التسجيل لا يمنع المستخدم من الوصول.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.record_legacy_route_hit(TEXT, TEXT);

CREATE FUNCTION public.record_legacy_route_hit(
  p_view_id     TEXT,
  p_resolved_to TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF p_view_id IS NULL OR btrim(p_view_id) = '' THEN RETURN FALSE; END IF;

  -- حدّ الطول: `view` يأتي من عنوان URL أي من المستخدم
  IF length(p_view_id) > 120 THEN RETURN FALSE; END IF;

  IF v_tenant IS NOT NULL THEN
    INSERT INTO public.legacy_route_usage
      (tenant_id, view_id, resolved_to, user_id, usage_date)
    VALUES (v_tenant, btrim(p_view_id), p_resolved_to, auth.uid(), CURRENT_DATE)
    ON CONFLICT (tenant_id, view_id, usage_date) WHERE tenant_id IS NOT NULL
    DO UPDATE SET hit_count = public.legacy_route_usage.hit_count + 1,
                  last_seen = NOW();
  ELSE
    INSERT INTO public.legacy_route_usage
      (tenant_id, view_id, resolved_to, user_id, usage_date)
    VALUES (NULL, btrim(p_view_id), p_resolved_to, auth.uid(), CURRENT_DATE)
    ON CONFLICT (view_id, usage_date) WHERE tenant_id IS NULL
    DO UPDATE SET hit_count = public.legacy_route_usage.hit_count + 1,
                  last_seen = NOW();
  END IF;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  -- ★ القياس لا يجوز أن يكسر التوجيه: مستخدم عنده إشارة مرجعية قديمة
  --   يجب أن يصل وجهته حتى لو فشل التسجيل.
  RETURN FALSE;
END $$;

COMMENT ON FUNCTION public.record_legacy_route_hit(TEXT, TEXT) IS
  'يُسجّل استعمال مسار قديم (تجميع يومي). لا يُسقط التوجيه عند الفشل.';

REVOKE ALL ON FUNCTION public.record_legacy_route_hit(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_legacy_route_hit(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_legacy_route_hit(TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ لوحة جاهزية الحذف — تُجيب: هل يُؤمَن حذف الطبقة؟
--
--    القرار يُبنى على قياس لا على تقدير.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.legacy_route_readiness(INTEGER);

CREATE FUNCTION public.legacy_route_readiness(p_window_days INTEGER DEFAULT 90)
RETURNS TABLE(
  out_view_id       TEXT,
  out_resolved_to   TEXT,
  out_total_hits    BIGINT,
  out_last_seen     TIMESTAMPTZ,
  out_days_since    INTEGER,
  out_safe_to_drop  BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ عمداً: يقيس ما يراه المستدعي تحت RLS
SET search_path = public
AS $$
DECLARE
  v_win INTEGER := GREATEST(1, LEAST(COALESCE(p_window_days, 90), 730));
BEGIN
  RETURN QUERY
  SELECT u.view_id,
         max(u.resolved_to),
         sum(u.hit_count)::BIGINT,
         max(u.last_seen),
         (EXTRACT(EPOCH FROM (NOW() - max(u.last_seen))) / 86400)::INTEGER,
         -- آمن للحذف: لم يُستعمل داخل النافذة
         (max(u.last_seen) < NOW() - (v_win || ' days')::INTERVAL)
    FROM public.legacy_route_usage u
   GROUP BY u.view_id
   ORDER BY sum(u.hit_count) DESC;
END $$;

COMMENT ON FUNCTION public.legacy_route_readiness(INTEGER) IS
  'جاهزية حذف كل مسار قديم: إجمالي الاستعمال وآخر مرة. '
  'SECURITY INVOKER — يقيس تحت RLS لا يتجاوزه.';

REVOKE ALL ON FUNCTION public.legacy_route_readiness(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.legacy_route_readiness(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.legacy_route_readiness(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ ملخّص القرار — سطر واحد يُجيب: هل نحذف؟
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.legacy_route_summary(INTEGER);

CREATE FUNCTION public.legacy_route_summary(p_window_days INTEGER DEFAULT 90)
RETURNS TABLE(
  out_distinct_views  INTEGER,
  out_total_hits      BIGINT,
  out_active_views    INTEGER,
  out_last_seen       TIMESTAMPTZ,
  out_recommendation  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_win  INTEGER := GREATEST(1, LEAST(COALESCE(p_window_days, 90), 730));
  v_n    INTEGER;
  v_hits BIGINT;
  v_act  INTEGER;
  v_last TIMESTAMPTZ;
BEGIN
  SELECT count(DISTINCT u.view_id)::INTEGER,
         COALESCE(sum(u.hit_count), 0)::BIGINT,
         count(DISTINCT u.view_id) FILTER (
           WHERE u.last_seen >= NOW() - (v_win || ' days')::INTERVAL
         )::INTEGER,
         max(u.last_seen)
    INTO v_n, v_hits, v_act, v_last
    FROM public.legacy_route_usage u;

  out_distinct_views := COALESCE(v_n, 0);
  out_total_hits     := COALESCE(v_hits, 0);
  out_active_views   := COALESCE(v_act, 0);
  out_last_seen      := v_last;
  out_recommendation :=
    CASE
      WHEN COALESCE(v_n, 0) = 0 THEN
        'لا استعمال مُسجَّل بعد — أبقِ القياس فترة قبل الحكم'
      WHEN COALESCE(v_act, 0) = 0 THEN
        format('يُؤمَن الحذف: صفر استعمال خلال %s يوماً', v_win)
      ELSE
        format('لا تحذف بعد: %s مساراً نشطاً خلال %s يوماً', v_act, v_win)
    END;
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.legacy_route_summary(INTEGER) IS
  'ملخّص جاهزية حذف طبقة التوجيه القديمة بتوصية صريحة.';

REVOKE ALL ON FUNCTION public.legacy_route_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.legacy_route_summary(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.legacy_route_summary(INTEGER) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0329: قياس البوابة القديمة — القياس قبل الحذف';
END $$;
