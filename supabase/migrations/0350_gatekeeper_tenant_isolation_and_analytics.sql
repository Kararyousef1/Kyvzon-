-- ============================================================================
-- 0350_gatekeeper_tenant_isolation_and_analytics.sql
--
-- بوابة الموارد البشرية — المرحلة 4: `hr/HRMovementAnalyticsPage` (715 سطراً).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً على Postgres محلي (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطل ① — ★★★ تسريب بيانات بين المستأجرين (الأخطر) ═══════════════════
--
--   `GatekeeperService.ts:33` يُعرّف `NoTenantBaseService` بتعليق:
--       /** تجاوز addTenantFilter — هذا الجدول بدون tenant_id */
--     protected override addTenantFilter(query) { return query; }
--     protected override injectTenantId(data)   { حذف tenant_id }
--
--   **التعليق خاطئ.** الجدولان يحويان `tenant_id` فعلاً:
--       gatekeeper_sessions.tenant_id     uuid  NULL
--       gatekeeper_visitor_logs.tenant_id uuid  NULL
--     مع مفتاح أجنبي `… REFERENCES tenants(id) ON DELETE CASCADE`.
--
--   والسياسة القائمة تسمح بالمرور حين يكون العمود فارغاً:
--       kyvzon_gk_vlogs_select :
--         ((tenant_id IS NULL) OR (tenant_id = current_user_tenant_id()))
--
--   فالخدمة **تحذف** `tenant_id` عند الإدراج ⇒ كل صفّ يُكتب بـNULL
--   ⇒ الشرط الأول يجعله **مرئياً لكل مستأجري المنصّة**.
--
--   مُثبَت بدور `authenticated` حقيقي (لا postgres):
--     INSERT INTO gatekeeper_visitor_logs(visitor_name,check_in_time)
--       VALUES ('زائر بلا مستأجر', now());   -- كما تفعل الخدمة
--     SET request.jwt.claim.sub = '<مدير المستأجر ب>';
--     SET ROLE authenticated;
--     SELECT count(*) … WHERE visitor_name='زائر بلا مستأجر';
--       ⇒ **1**
--
--   ⇒ مدير موارد الشركة (ب) يقرأ **سجلّ زوّار الشركة (أ)**: الاسم
--     والهاتف ورقم الهوية والغرض ومن استضافه. وكذلك ورديات الحرّاس.
--     هذا خرق عزل صريح في منصّة متعددة المستأجرين.
--
--   ★ الجدولان فارغان اليوم (0 صفّ) — فالإصلاح وقائيّ لا علاجيّ،
--     ولا حاجة لترحيل بيانات.
--
-- ═══ العطل ② — `fromDate` يُمرَّر ويُهمَل ═════════════════════════════════
--
--   `GatekeeperService.ts:104`
--     async findVisitorLogs(options?: { sessionId?: string; fromDate?: string })
--       const filters = {};
--       if (options?.sessionId) filters.session_id = options.sessionId;
--       // ★ fromDate لا يُستعمل إطلاقاً
--       return this.findAll({ filters … });
--
--   والصفحة تستدعيها بـ`{ fromDate: dateStr }` لكل نطاق زمني.
--
--   مُثبَت (3 سجلات: اثنان قبل أكثر من سنة وواحد اليوم):
--     SERVICE-LOGIC (بلا مرشّح تاريخ) => 3 صفوف
--     CORRECT (فلتر اليوم)            => 1 صفّ
--
--   ⇒ مُرشِّح «اليوم / 7 أيام / هذا الشهر» **لا أثر له على تبويب الزوار**.
--     الرسم البياني والتصدير يعرضان كل تاريخ المنصّة دائماً.
--
-- ═══ العطل ③ — تصدير الزوّار يُنتج أعمدة فارغة بالكامل ════════════════════
--
--   `HRMovementAnalyticsPage.tsx:391`
--     v.visitor?.name || '' , v.visitor?.company || '' ,
--     v.visitor?.purpose || '' , v.visitor?.location || ''
--
--   ولا استعلام في المشروع يجلب كائناً مُضمَّناً باسم `visitor`
--   (لا `select('*, visitor:gatekeeper_visitors(*)')` في أي موضع).
--   والجدول **مسطّح**: `visitor_name` · `purpose` · `host_name`.
--
--   مُثبَت: العمودان `company` و`location` **غير موجودين** في المخطط كلّه
--   (`information_schema.columns` ⇒ 0).
--
--   ⇒ `v.visitor` دائماً `undefined` ⇒ أربعة أعمدة من سبعة في ملف
--     Excel المُصدَّر **فارغة أبداً**، ومنها **اسم الزائر نفسه**.
--     والجدول المعروض في الشاشة (`:691`) يعرض `r.visitor?.name` ⇒ فراغ.
--
-- ═══ العطل ④ — أرشيف الوردية يتجاوز نهايتها ══════════════════════════════
--
--   `:441`  movementLogService.findMovements({ fromDate: session.started_at })
--
--   حدّ أدنى بلا حدّ أعلى — و`session.ended_at` موجود ومُهمَل.
--
--   مُثبَت (ورديتان متتاليتان وحركة في كلٍّ منهما):
--     PAGE-LOGIC (fromDate فقط)      => 2 حركة
--     CORRECT (بين البداية والنهاية) => 1 حركة
--
--   ⇒ «تصدير أرشيف حركة الوردية» يُدرج حركات الورديات **اللاحقة كلّها**
--     حتى اللحظة. وتقرير تسليم المناوبة يُحمّل الحارس ما لم يحدث في نوبته.
--
-- ═══ العطل ⑤ — عمود `route_violation` مُهمَل لصالح تفتيش نصّ ══════════════
--
--   `:123`  const VIOLATION_FLAG = '[مخالفة مسار 🚨]';
--   `:379`  const hasViolation = m.notes?.includes(VIOLATION_FLAG);
--
--   والجدول يحوي عموداً منطقياً مخصّصاً: `route_violation BOOLEAN NOT NULL`
--   يكتبه `MovementLogService.recordReturn` صراحةً.
--
--   ⇒ الكشف يعتمد تطابق **نصّ حرفي** يشمل رمز إيموجي. أي تعديل على
--     الملاحظة أو اختلاف في الرمز يُخفي المخالفة. والعمود الموثوق مُهمَل.
--
-- ═══ العطل ⑥ — `customer_email` عمود غير موجود ═══════════════════════════
--
--   `:407` رأس العمود «البريد الإلكتروني» ثم `r.customer_email || ''`.
--   مُثبَت: `customer_reviews` لا يحوي أي عمود فيه `email` (⇒ 0).
--   ⇒ عمود فارغ أبداً في تصدير مراجعات العملاء.
--
-- ═══ العطل ⑦ — الصفحة تفتح قناة Realtime مباشرة على Supabase ═════════════
--
--   `:18`  import { supabase } from '../../services/supabase/supabase';
--   `:227` supabase.channel('gatekeeper_alerts').on('postgres_changes', …)
--
--   خرق لقاعدة «الصفحات لا تلمس Supabase مباشرة». والقناة مُسمّاة باسم
--   ثابت عالميّ بلا أي تمييز للمستأجر، وتشترك في `gatekeeper_sessions`
--   بلا مُرشِّح `tenant_id` ⇒ إشعارات مستأجر تصل غيره.
--
-- ═══ العطل ⑧ — البحث في الأرشيف لا يُنفَّذ ═══════════════════════════════
--
--   `archiveSearch` يُقرأ من الحقل ويُخزَّن في الحالة، ولا يُستعمل في أي
--   ترشيح — القائمة تُعرض كاملة مهما كُتب.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ما يفعله هذا المايجريشن
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ① سدّ ثغرة العزل: `tenant_id` يصير **إلزامياً** على الجدولين
--      بقيمة افتراضية من `current_user_tenant_id()`، والسياسات تُشدَّد
--      بحذف الفرع `tenant_id IS NULL`.
--   ② أربع دوال تحليلية تُنجز الترشيح الزمني والنطاقات في القاعدة:
--        gatekeeper_movement_analytics(from,to)
--        gatekeeper_visitor_analytics(from,to)
--        gatekeeper_session_archive(search)
--        gatekeeper_shift_movements(session_id)   ← محصور بنهاية الوردية
--
--   كلها `SECURITY DEFINER` · `search_path=public` · تُرشّح بالمستأجر.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① سدّ ثغرة العزل
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ الجدولان فارغان (0 صفّ مُحقَّق) — فلا ترحيل. ومع ذلك نُسند أي صفّ
--   يتيم إلى مستأجره عبر الوردية المرتبطة إن وُجد، ثم نمنع التكرار.

-- (أ) أي سجلّ زائر يتيم يرث مستأجر ورديته
UPDATE public.gatekeeper_visitor_logs vl
   SET tenant_id = s.tenant_id
  FROM public.gatekeeper_sessions s
 WHERE vl.session_id = s.id
   AND vl.tenant_id IS NULL
   AND s.tenant_id IS NOT NULL;

-- (ب) أي وردية يتيمة ترث مستأجر حارسها
UPDATE public.gatekeeper_sessions s
   SET tenant_id = p.tenant_id
  FROM public.profiles p
 WHERE s.gatekeeper_id = p.id
   AND s.tenant_id IS NULL
   AND p.tenant_id IS NOT NULL;

-- (ج) الافتراضي: مستأجر المستخدم الحالي — فلا يعود صفٌّ بلا مالك
ALTER TABLE public.gatekeeper_sessions
  ALTER COLUMN tenant_id SET DEFAULT public.current_user_tenant_id();
ALTER TABLE public.gatekeeper_visitor_logs
  ALTER COLUMN tenant_id SET DEFAULT public.current_user_tenant_id();

-- (د) ★★★ الحارس الحقيقي: NOT NULL.
--     يُطبَّق فقط متى خلا الجدول من الأيتام — وإلا يُرفع خطأ صريح بدل
--     ترك القاعدة في حالة نصف مُؤمَّنة صامتة.
DO $$
DECLARE
  v_s INTEGER;
  v_v INTEGER;
BEGIN
  SELECT count(*) INTO v_s FROM public.gatekeeper_sessions     WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_v FROM public.gatekeeper_visitor_logs WHERE tenant_id IS NULL;

  IF v_s > 0 OR v_v > 0 THEN
    RAISE EXCEPTION
      'تعذّر فرض NOT NULL: % وردية و% سجلّ زائر بلا مستأجر ولا مصدر لاستنتاجه. '
      'أسنِدها يدوياً ثم أعد تشغيل المايجريشن.', v_s, v_v;
  END IF;

  ALTER TABLE public.gatekeeper_sessions     ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE public.gatekeeper_visitor_logs ALTER COLUMN tenant_id SET NOT NULL;
END $$;

-- (هـ) تشديد السياسات: حذف الفرع `tenant_id IS NULL` الذي كان يُسرّب
DROP POLICY IF EXISTS kyvzon_gk_sessions_select ON public.gatekeeper_sessions;
CREATE POLICY kyvzon_gk_sessions_select ON public.gatekeeper_sessions
  FOR SELECT USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_gk_sessions_write ON public.gatekeeper_sessions;
CREATE POLICY kyvzon_gk_sessions_write ON public.gatekeeper_sessions
  FOR ALL USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
      OR gatekeeper_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR public.current_user_role() = 'gatekeeper'
      OR gatekeeper_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs;
CREATE POLICY kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs
  FOR SELECT USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_gk_vlogs_write ON public.gatekeeper_visitor_logs;
CREATE POLICY kyvzon_gk_vlogs_write ON public.gatekeeper_visitor_logs
  FOR ALL USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR public.current_user_role() = 'gatekeeper')
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR public.current_user_role() = 'gatekeeper')
  );

COMMENT ON COLUMN public.gatekeeper_visitor_logs.tenant_id IS
  'إلزامي منذ 0350. كان NULL-able والسياسة تسمح بمرور NULL ⇒ سجلّ زوّار '
  'مستأجرٍ مرئيّ لكل المستأجرين (مُثبَت بدور authenticated).';

COMMENT ON COLUMN public.gatekeeper_sessions.tenant_id IS
  'إلزامي منذ 0350 — انظر gatekeeper_visitor_logs.tenant_id.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② تحليلات حركة الموظفين — الترشيح الزمني في القاعدة
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.gatekeeper_movement_analytics(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION public.gatekeeper_movement_analytics(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  out_id             UUID,
  out_employee_id    UUID,
  out_employee_name  TEXT,
  out_department     TEXT,
  out_destination    TEXT,
  out_departure_at   TIMESTAMPTZ,
  out_returned_at    TIMESTAMPTZ,
  out_duration_secs  BIGINT,
  out_route_violation BOOLEAN,
  out_notes          TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الحركة';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.employee_id,
    -- الاسم من profiles (المفتاح الأجنبي الفعليّ) مع احتياطي اللقطة
    COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(m.employee_name), ''), 'غير معروف')::TEXT,
    COALESCE(NULLIF(btrim(m.department), ''), NULLIF(btrim(p.department), ''), '—')::TEXT,
    COALESCE(m.destination, '—')::TEXT,
    m.departure_at,
    m.returned_at,
    CASE WHEN m.returned_at IS NULL THEN NULL::BIGINT
         ELSE EXTRACT(EPOCH FROM (m.returned_at - m.departure_at))::BIGINT END,
    -- ★ العطل ⑤: العمود المنطقي هو المصدر، لا تفتيش نصّ الملاحظة
    m.route_violation,
    m.notes::TEXT
    FROM public.movements_log m
    LEFT JOIN public.profiles p ON p.id = m.employee_id
   WHERE m.tenant_id    = v_tenant
     AND m.departure_at >= p_from
     AND m.departure_at <= p_to
   ORDER BY m.departure_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gatekeeper_movement_analytics(TIMESTAMPTZ,TIMESTAMPTZ)
  TO authenticated;

COMMENT ON FUNCTION public.gatekeeper_movement_analytics(TIMESTAMPTZ,TIMESTAMPTZ) IS
  'حركة الموظفين ضمن نطاق زمني. يقرأ route_violation المنطقي بدل تفتيش '
  'نصّ الملاحظة عن «[مخالفة مسار]» (العطل ⑤).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ تحليلات الزوّار — الأعمدة المسطّحة الحقيقية
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.gatekeeper_visitor_analytics(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION public.gatekeeper_visitor_analytics(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  out_id             UUID,
  out_session_id     UUID,
  out_visitor_name   TEXT,
  out_visitor_phone  TEXT,
  out_id_number      TEXT,
  out_purpose        TEXT,
  out_host_name      TEXT,
  out_check_in_time  TIMESTAMPTZ,
  out_check_out_time TIMESTAMPTZ,
  out_duration_secs  BIGINT,
  out_status         TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض سجلّ الزوّار';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  -- ★ العطل ③: أعمدة مسطّحة حقيقية — لا كائن `visitor` مُضمَّن.
  --   وأعمدة company/location غير موجودة في المخطط أصلاً.
  SELECT
    v.id,
    v.session_id,
    COALESCE(NULLIF(btrim(v.visitor_name), ''), 'زائر بلا اسم')::TEXT,
    COALESCE(v.visitor_phone, '—')::TEXT,
    COALESCE(v.id_number, '—')::TEXT,
    COALESCE(v.purpose, '—')::TEXT,
    COALESCE(v.host_name, '—')::TEXT,
    v.check_in_time,
    v.check_out_time,
    CASE WHEN v.check_out_time IS NULL THEN NULL::BIGINT
         ELSE EXTRACT(EPOCH FROM (v.check_out_time - v.check_in_time))::BIGINT END,
    COALESCE(v.status, '—')::TEXT
    FROM public.gatekeeper_visitor_logs v
   WHERE v.tenant_id     = v_tenant
     -- ★ العطل ②: الترشيح الزمني يُنفَّذ فعلاً هنا
     AND v.check_in_time >= p_from
     AND v.check_in_time <= p_to
   ORDER BY v.check_in_time DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gatekeeper_visitor_analytics(TIMESTAMPTZ,TIMESTAMPTZ)
  TO authenticated;

COMMENT ON FUNCTION public.gatekeeper_visitor_analytics(TIMESTAMPTZ,TIMESTAMPTZ) IS
  'سجلّ الزوّار ضمن نطاق زمني يُطبَّق فعلاً (العطل ②) بأعمدة مسطّحة '
  'حقيقية بدل v.visitor?.name المعدوم (العطل ③).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ أرشيف الورديات — مع بحث يُنفَّذ فعلاً
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.gatekeeper_session_archive(TEXT);

CREATE FUNCTION public.gatekeeper_session_archive(p_search TEXT DEFAULT NULL)
RETURNS TABLE(
  out_id              UUID,
  out_gatekeeper_name TEXT,
  out_started_at      TIMESTAMPTZ,
  out_ended_at        TIMESTAMPTZ,
  out_duration_secs   BIGINT,
  out_visitor_count   INTEGER,
  out_movement_count  INTEGER,
  out_handover_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض أرشيف الورديات';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    COALESCE(NULLIF(btrim(p.full_name), ''), 'حارس غير معروف')::TEXT,
    s.started_at,
    s.ended_at,
    CASE WHEN s.ended_at IS NULL THEN NULL::BIGINT
         ELSE EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::BIGINT END,
    (SELECT count(*)::INTEGER FROM public.gatekeeper_visitor_logs v
      WHERE v.session_id = s.id AND v.tenant_id = v_tenant),
    -- ★ العطل ④: الحركات محصورة بين بداية الوردية ونهايتها
    (SELECT count(*)::INTEGER FROM public.movements_log m
      WHERE m.tenant_id = v_tenant
        AND m.departure_at >= s.started_at
        AND m.departure_at <  COALESCE(s.ended_at, NOW())),
    COALESCE(s.handover_status, '—')::TEXT
    FROM public.gatekeeper_sessions s
    LEFT JOIN public.profiles p ON p.id = s.gatekeeper_id
   WHERE s.tenant_id = v_tenant
     AND s.is_active = false
     -- ★ العطل ⑧: البحث يُنفَّذ فعلاً — بالاسم أو بالتاريخ
     AND (
       v_q IS NULL
       OR p.full_name ILIKE '%' || v_q || '%'
       OR to_char(s.started_at AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD') ILIKE '%' || v_q || '%'
     )
   ORDER BY s.ended_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gatekeeper_session_archive(TEXT) TO authenticated;

COMMENT ON FUNCTION public.gatekeeper_session_archive(TEXT) IS
  'أرشيف الورديات ببحث يُنفَّذ فعلاً (العطل ⑧: archiveSearch كان يُقرأ '
  'ولا يُرشِّح) وبعدّ حركات محصور بنهاية الوردية (العطل ④). '
  'التاريخ بتوقيت Asia/Baghdad لا بتوقيت الخادم.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ حركات وردية بعينها — محصورة بنهايتها
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.gatekeeper_shift_movements(UUID);

CREATE FUNCTION public.gatekeeper_shift_movements(p_session_id UUID)
RETURNS TABLE(
  out_id              UUID,
  out_employee_name   TEXT,
  out_department      TEXT,
  out_destination     TEXT,
  out_departure_at    TIMESTAMPTZ,
  out_returned_at     TIMESTAMPTZ,
  out_duration_secs   BIGINT,
  out_route_violation BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_start  TIMESTAMPTZ;
  v_end    TIMESTAMPTZ;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض حركة الوردية';
  END IF;

  -- ★ الوردية تُقرأ بمستأجر المستدعي — فلا يُصدَّر أرشيف وردية أجنبية
  SELECT s.started_at, COALESCE(s.ended_at, NOW())
    INTO v_start, v_end
    FROM public.gatekeeper_sessions s
   WHERE s.id = p_session_id AND s.tenant_id = v_tenant;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'الوردية غير موجودة أو لا تخصّ مستأجرك';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(m.employee_name), ''), 'غير معروف')::TEXT,
    COALESCE(NULLIF(btrim(m.department), ''), NULLIF(btrim(p.department), ''), '—')::TEXT,
    COALESCE(m.destination, '—')::TEXT,
    m.departure_at,
    m.returned_at,
    CASE WHEN m.returned_at IS NULL THEN NULL::BIGINT
         ELSE EXTRACT(EPOCH FROM (m.returned_at - m.departure_at))::BIGINT END,
    m.route_violation
    FROM public.movements_log m
    LEFT JOIN public.profiles p ON p.id = m.employee_id
   WHERE m.tenant_id    = v_tenant
     AND m.departure_at >= v_start
     AND m.departure_at <  v_end      -- ★ العطل ④: الحدّ الأعلى
   ORDER BY m.departure_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gatekeeper_shift_movements(UUID) TO authenticated;

COMMENT ON FUNCTION public.gatekeeper_shift_movements(UUID) IS
  'حركات وردية بعينها محصورة بين started_at و ended_at. المنطق القديم '
  'مرّر fromDate بلا حدّ أعلى فأدرج حركات الورديات اللاحقة (العطل ④).';

COMMIT;
