-- ════════════════════════════════════════════════════════════════════════
--  0356 — سلامة تقييم الأداء
--  المرحلة 4 — بوابة الموارد البشرية · صفحة hr/PerformancePage.tsx (339 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0356.sql — على قاعدة نظيفة)          │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★ **إنشاء أيّ تقييم يفشل دائماً.** الصفحة ترسل ستّة أعمدة
--     لا وجود لها في `performance_reviews`:
--        overall_score · strengths · improvements
--        completed_at  · updated_at · goals_summary
--
--     المسبار PROBE_1 (مسح `information_schema.columns`):
--        العمود «overall_score» ★ غير موجود
--        العمود «strengths»     ★ غير موجود
--        العمود «improvements»  ★ غير موجود
--        العمود «completed_at»  ★ غير موجود
--        العمود «updated_at»    ★ غير موجود
--        العمود «goals_summary» ★ غير موجود
--
--     PROBE_1B — الإدراج بالحقول التي ترسلها `handleCreateReview` حرفياً:
--        ERROR: column "overall_score" of relation
--               "performance_reviews" does not exist
--
--     أعمدة الجدول الحقيقية عشرة (PROBE_10):
--        id · tenant_id · employee_id · reviewer_id · cycle_id
--        rating · comments · status · submitted_at · created_at
--
--     ⇒ زرّ «تقييم جديد» **معطَّل تماماً**، ويظهر خطأ خام للمستخدم.
--
--  ② ★★★ **وأيُّ تعديل يفشل أيضاً — حتى بلا أعمدة وهمية.**
--     محفّز `update_performance_reviews_updated_at` يُنفّذ
--     `update_updated_at_column()` التي تكتب `NEW.updated_at`،
--     والعمود غير موجود في الجدول.
--
--     PROBE_2A — تعديل حقلٍ موجود فعلاً (`comments`):
--        ERROR: record "new" has no field "updated_at"
--        CONTEXT: PL/pgSQL assignment "NEW.updated_at = NOW()"
--
--     ⇒ عطلٌ أشدّ من ①: زرّ «إكمال» يفشل (PROBE_1C)، وكذلك كل
--       `UPDATE` مهما كان مصدره أو محتواه. الجدول **للكتابة مرّة
--       واحدة فقط** بلا أن يعلم أحد. (المحفّز من 0003 والعمود لم
--       يُضَف قط — عطلٌ نائمٌ منذ بداية المشروع.)
--
--  ③ ★★★ سُلَّمان متناقضان: `rating` مقابل `overall_score`
--     القاعدة: `rating INTEGER CHECK (rating >= 1 AND rating <= 5)`
--     الصفحة: `overall_score` من 0 إلى 100 بحقل `min="0" max="100"`،
--             والعتبات `>= 85` أخضر · `>= 70` أصفر · دون ذلك أحمر.
--
--     PROBE_2B: الصفّ يحمل `rating = 4` والصفحة تعرض
--        {review.overall_score}%  ⇒  «undefined%»
--     وتحسب `scoreColor` من `undefined >= 85` = false ⇒ **أحمر دائماً**
--     لكل تقييم مهما كانت درجته. موظفٌ بأعلى تقدير (5/5) يظهر أحمر.
--
--  ④ ★★ `performance_reviews.status` نصٌّ حرّ بلا CHECK
--     PROBE_3: أُدرج صفٌّ بحالة «حالة مخترعة تماماً» ونجح.
--     والواجهة `REVIEW_STATUS_LABELS[review.status]` ⇒ `undefined`
--     فتظهر شارة فارغة. المفردات المتوقَّعة خمس:
--        draft · submitted · under_review · completed · cancelled
--
--  ⑤ ★★ `performance_cycles` بلا أيّ قيد سلامة
--     PROBE_4 — أُدرجت دورة واحدة تجمع ثلاث مخالفات ونجحت كلها:
--        start_date    = 2026-06-01
--        end_date      = 2026-01-01   ← النهاية **قبل** البداية
--        review_period = 'كل ثانية'   ← فترة مخترعة
--        status        = 'حالة وهمية'
--     الجدول لا يملك سوى PK و FK للمستأجر (PROBE: pg_constraint).
--
--  ⑥ ★★ لا قيد فرادة: تقييمان لنفس الموظف في نفس الدورة
--     PROBE_5: `reviews_same_emp_same_cycle = 2` (بدرجتين 3 و 5).
--     أيّهما المعتمَد؟ لا جواب. والصفحة تعرضهما صفَّين متطابقَي الاسم.
--
--  ⑦ ★★ الموظف يُقيّم نفسه
--     PROBE_6: أُدرج تقييم `employee_id = reviewer_id` بدرجة 5/5 ونجح.
--     ولا شيء في الواجهة يمنعه: نافذة الإنشاء فيها `EmployeePicker`
--     مرّتين متتاليتين بلا أيّ تمييز بصريّ ولا حارس.
--
--  ⑧ ★★ `cycle_id` بلا مفتاح أجنبيّ
--     PROBE_7: أُدرج تقييم بـ`cycle_id = 'ffffffff-…'` ونجح.
--     ⇒ تقييمٌ يتيمٌ لا تعرف الصفحة دورته: `cycle?.name || 'دورة تقييم'`
--       يبتلع الخطأ ويعرض نصّاً عامّاً.
--
--  ⑨ ★ الحذف النهائي متاح لأي staff
--     PROBE_9: `kyvzon_performance_reviews_delete` بشرط
--     `current_user_is_staff()` وحده، ولا محفّز يحرس (PROBE_9B: المحفّز
--     الوحيد هو محفّز `updated_at` المعطوب). تقييمٌ سنويّ يُمحى بضغطة.
--
--  ⑩ ★ الصفحة تجلب كل الموظفين وكل الدورات وكل التقييمات وتربطها
--     بـ`Map` في المتصفّح — ثلاثة استعلامات بلا حدّ أعلى.
--
--  ⑪ ★ `EmptyState({ icon }: { icon: any })` — `any` صريح في الصفحة.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  ما يفعله هذا المايجريشن                                          │
--  └──────────────────────────────────────────────────────────────────┘
--   (أ) الأعمدة الناقصة + إصلاح محفّز `updated_at` المعطوب.
--   (ب) توحيد السُّلَّم: `score` من 0 إلى 100 هو المرجع، و`rating`
--       يبقى ويُشتقّ منه آلياً بمحفّز (توافق عكسيّ مع أيّ قارئ قديم).
--   (جـ) قيود المفردات والتواريخ والفرادة و FK و«لا تقييم ذاتيّ».
--   (د) الأرشفة بدل الحذف.
--   (هـ) دوال القاعدة: الدورات · التقييمات · الملخّص · الإنشاء ·
--       تغيير الحالة · الأرشفة.
--
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- (أ) الأعمدة الناقصة — العطلان ① و ②
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.performance_reviews
  ADD COLUMN IF NOT EXISTS score        NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS strengths    TEXT,
  ADD COLUMN IF NOT EXISTS improvements TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  -- ★★★ العطل ②: المحفّز `update_performance_reviews_updated_at` قائم
  --   منذ 0003 ويكتب `NEW.updated_at`، والعمود لم يُضَف قط. النتيجة أن
  --   **أيّ UPDATE على الجدول يرمي**:
  --      ERROR: record "new" has no field "updated_at"
  --   إضافة العمود تُصلح المحفّز نفسه — لا حاجة لإسقاطه.
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.performance_reviews.score IS
  'الدرجة من 0 إلى 100 — المرجع. الصفحة كانت تكتب overall_score '
  'وهو عمود غير موجود فيفشل الإنشاء دائماً (0356/①).';
COMMENT ON COLUMN public.performance_reviews.updated_at IS
  'أُضيف في 0356: محفّز update_performance_reviews_updated_at من 0003 '
  'كان يكتب NEW.updated_at على جدول بلا العمود ⇒ كل UPDATE يرمي.';

-- ★ الدورات تحتاج created_by/updated_at أيضاً للاتساق
ALTER TABLE public.performance_cycles
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────
-- (ب) القيود — الأعطال ③ ④ ⑤ ⑥ ⑦ ⑧
-- ─────────────────────────────────────────────────────────────────────────

-- ★ مفردات حالة التقييم الخمس — مطابِقة لـREVIEW_STATUS_LABELS
DO $$
BEGIN
  -- تطبيع أي قيمة خارج المفردات قبل فرض القيد
  UPDATE public.performance_reviews
     SET status = 'draft'
   WHERE status IS NULL
      OR status NOT IN ('draft','submitted','under_review','completed','cancelled');

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'performance_reviews_status_chk') THEN
    ALTER TABLE public.performance_reviews
      ADD CONSTRAINT performance_reviews_status_chk
      CHECK (status IN ('draft','submitted','under_review','completed','cancelled'));
  END IF;
END $$;

-- ★ الدرجة 0..100
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'performance_reviews_score_chk') THEN
    ALTER TABLE public.performance_reviews
      ADD CONSTRAINT performance_reviews_score_chk
      CHECK (score IS NULL OR (score >= 0 AND score <= 100));
  END IF;
END $$;

-- ★★ العطل ⑦: لا تقييم ذاتيّ.
--   `reviewer_id` يشير إلى `profiles` و`employee_id` إلى `employees`
--   (مفتاحان مختلفان — مُحقَّق)، فالمقارنة المباشرة لا تكفي.
--   القيد يُنفَّذ في المحفّز أدناه حيث يمكن الوصول إلى `employees.user_id`.

-- ★★ العطل ⑧: FK على cycle_id
DO $$
BEGIN
  -- تنظيف أي صفّ يتيم قبل فرض المفتاح
  UPDATE public.performance_reviews r
     SET cycle_id = NULL
   WHERE r.cycle_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.performance_cycles c
                      WHERE c.id = r.cycle_id);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'performance_reviews_cycle_id_fkey') THEN
    ALTER TABLE public.performance_reviews
      ADD CONSTRAINT performance_reviews_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.performance_cycles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ★★ العطل ⑥: فرادة التقييم لكل (موظف، دورة).
--   جزئيّ: الملغاة والمؤرشفة خارج القيد — إعادة تقييم بعد الإلغاء
--   سلوكٌ مشروع.
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_per_employee_cycle
  ON public.performance_reviews (tenant_id, cycle_id, employee_id)
  WHERE cycle_id IS NOT NULL
    AND archived_at IS NULL
    AND status <> 'cancelled';

-- ★★ العطل ⑤: قيود الدورة
DO $$
BEGIN
  UPDATE public.performance_cycles
     SET status = 'draft'
   WHERE status IS NULL
      OR status NOT IN ('draft','active','closed','cancelled');

  UPDATE public.performance_cycles
     SET review_period = 'quarterly'
   WHERE review_period IS NULL
      OR review_period NOT IN ('monthly','quarterly','semi_annual','annual');

  -- النهاية قبل البداية: نُصلح الصفوف القائمة بمدّ النهاية
  UPDATE public.performance_cycles
     SET end_date = start_date
   WHERE end_date < start_date;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'performance_cycles_status_chk') THEN
    ALTER TABLE public.performance_cycles
      ADD CONSTRAINT performance_cycles_status_chk
      CHECK (status IN ('draft','active','closed','cancelled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'performance_cycles_period_chk') THEN
    ALTER TABLE public.performance_cycles
      ADD CONSTRAINT performance_cycles_period_chk
      CHECK (review_period IN ('monthly','quarterly','semi_annual','annual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'performance_cycles_range_chk') THEN
    ALTER TABLE public.performance_cycles
      ADD CONSTRAINT performance_cycles_range_chk
      CHECK (end_date >= start_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_perf_reviews_tenant_cycle
  ON public.performance_reviews (tenant_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_tenant_emp
  ON public.performance_reviews (tenant_id, employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- (جـ) اشتقاق rating من score — العطل ③
-- ─────────────────────────────────────────────────────────────────────────
--  `rating INTEGER CHECK (1..5)` قائم ولا نُسقطه: قد يقرؤه شيء آخر.
--  بدل سُلَّمين متناقضين نجعل أحدهما مشتقّاً من الآخر آلياً.
--
--    0–20 → 1 · 21–40 → 2 · 41–60 → 3 · 61–80 → 4 · 81–100 → 5
--
--  ★ `GREATEST(1, …)` ضروريّ: `score = 0` يعطي `ceil(0/20) = 0`
--    ويخالف `rating >= 1`.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.tg_perf_review_derive() CASCADE;

CREATE FUNCTION public.tg_perf_review_derive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reviewer_emp UUID;
BEGIN
  -- ★★ العطل ③: السُّلَّم الواحد
  IF NEW.score IS NOT NULL THEN
    NEW.rating := GREATEST(1, LEAST(5, CEIL(NEW.score / 20.0)::INTEGER));
  ELSIF NEW.rating IS NOT NULL THEN
    -- الاتجاه العكسيّ لصفوفٍ كُتبت بـrating وحده: منتصف الشريحة
    NEW.score := (NEW.rating * 20) - 10;
  END IF;

  -- ★★ العطل ⑦: لا تقييم ذاتيّ.
  --   employees.id ≠ profiles.id — نعبر عبر employees.user_id.
  IF NEW.reviewer_id IS NOT NULL AND NEW.employee_id IS NOT NULL THEN
    SELECT e.user_id INTO v_reviewer_emp
      FROM public.employees e WHERE e.id = NEW.employee_id;
    IF v_reviewer_emp IS NOT NULL AND v_reviewer_emp = NEW.reviewer_id THEN
      RAISE EXCEPTION
        'REVIEW_SELF_NOT_ALLOWED: لا يجوز أن يُقيّم الموظف نفسه'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ★ ختم الإكمال
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;
  IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := NOW();
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_perf_review_derive() IS
  'يشتقّ rating (1..5) من score (0..100) فلا يتناقض السُّلَّمان، ويمنع '
  'التقييم الذاتيّ (employees.id ≠ profiles.id فالعبور عبر user_id).';

DROP TRIGGER IF EXISTS trg_perf_review_derive ON public.performance_reviews;
CREATE TRIGGER trg_perf_review_derive
  BEFORE INSERT OR UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_perf_review_derive();

-- ─────────────────────────────────────────────────────────────────────────
-- (د) الأرشفة بدل الحذف — العطل ⑨
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_block_perf_review_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION
    'REVIEW_IMMUTABLE: تقييم الأداء لا يُحذف — استعمل الأرشفة'
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_block_perf_review_delete ON public.performance_reviews;
CREATE TRIGGER trg_block_perf_review_delete
  BEFORE DELETE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_perf_review_delete();

CREATE OR REPLACE FUNCTION public.tg_block_perf_cycle_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION
    'CYCLE_IMMUTABLE: دورة التقييم لا تُحذف — استعمل الإلغاء أو الأرشفة'
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_block_perf_cycle_delete ON public.performance_cycles;
CREATE TRIGGER trg_block_perf_cycle_delete
  BEFORE DELETE ON public.performance_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_perf_cycle_delete();

-- ─────────────────────────────────────────────────────────────────────────
-- (هـ) دوال القاعدة — العطل ⑩
-- ─────────────────────────────────────────────────────────────────────────

-- ══ الملخّص ══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_summary(UUID);

CREATE FUNCTION public.performance_summary(p_cycle_id UUID DEFAULT NULL)
RETURNS TABLE (
  out_cycles      INTEGER,
  out_active      INTEGER,
  out_reviews     INTEGER,
  out_draft       INTEGER,
  out_submitted   INTEGER,
  out_completed   INTEGER,
  out_cancelled   INTEGER,
  out_avg_score   NUMERIC,
  out_top_score   NUMERIC,
  out_low_score   NUMERIC,
  out_coverage    NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_staff  INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص الأداء';
  END IF;

  SELECT count(*)::INTEGER INTO v_staff
    FROM public.employees e
   WHERE e.tenant_id = v_tenant AND e.is_active;

  RETURN QUERY
  WITH cyc AS (
    SELECT count(*)::INTEGER AS total,
           count(*) FILTER (WHERE c.status = 'active')::INTEGER AS act
      FROM public.performance_cycles c
     WHERE c.tenant_id = v_tenant AND c.archived_at IS NULL
  ),
  rev AS (
    -- ★ المؤرشفة والملغاة خارج المتوسّط: درجةٌ أُلغيت ليست أداءً
    SELECT count(*)::INTEGER AS total,
           count(*) FILTER (WHERE r.status = 'draft')::INTEGER      AS d,
           count(*) FILTER (WHERE r.status IN ('submitted','under_review'))::INTEGER AS s,
           count(*) FILTER (WHERE r.status = 'completed')::INTEGER  AS c,
           count(*) FILTER (WHERE r.status = 'cancelled')::INTEGER  AS x,
           round(avg(r.score) FILTER (
             WHERE r.status <> 'cancelled' AND r.score IS NOT NULL), 1) AS avg_s,
           max(r.score) FILTER (WHERE r.status <> 'cancelled')       AS max_s,
           min(r.score) FILTER (WHERE r.status <> 'cancelled')       AS min_s,
           count(DISTINCT r.employee_id) FILTER (
             WHERE r.status <> 'cancelled')::INTEGER                 AS covered
      FROM public.performance_reviews r
     WHERE r.tenant_id = v_tenant
       AND r.archived_at IS NULL
       AND (p_cycle_id IS NULL OR r.cycle_id = p_cycle_id)
  )
  SELECT cyc.total, cyc.act,
         rev.total, rev.d, rev.s, rev.c, rev.x,
         -- ★ NULL ≠ صفر: «لم يُقيَّم أحد» ليست «متوسّط صفر» (درس 0353)
         rev.avg_s, rev.max_s, rev.min_s,
         CASE WHEN v_staff > 0
              THEN round(rev.covered * 100.0 / v_staff, 1)
              ELSE NULL END
    FROM cyc, rev;
END $$;

COMMENT ON FUNCTION public.performance_summary(UUID) IS
  'ملخّص الأداء. المتوسّط NULL حين لا تقييم — لا صفر. الملغاة خارج '
  'الحساب.';

REVOKE ALL ON FUNCTION public.performance_summary(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_summary(UUID) TO authenticated;

-- ══ الدورات ══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_cycles_board(BOOLEAN, INTEGER);

CREATE FUNCTION public.performance_cycles_board(
  p_include_archived BOOLEAN DEFAULT FALSE,
  p_limit            INTEGER DEFAULT 100
)
RETURNS TABLE (
  out_id            UUID,
  out_name          TEXT,
  out_description   TEXT,
  out_start_date    DATE,
  out_end_date      DATE,
  out_review_period TEXT,
  out_status        TEXT,
  out_reviews       INTEGER,
  out_completed     INTEGER,
  out_avg_score     NUMERIC,
  out_archived      BOOLEAN,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض دورات التقييم';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name::TEXT, c.description,
         c.start_date, c.end_date,
         c.review_period::TEXT, c.status::TEXT,
         (SELECT count(*)::INTEGER FROM public.performance_reviews r
           WHERE r.cycle_id = c.id AND r.tenant_id = v_tenant
             AND r.archived_at IS NULL),
         (SELECT count(*)::INTEGER FROM public.performance_reviews r
           WHERE r.cycle_id = c.id AND r.tenant_id = v_tenant
             AND r.archived_at IS NULL AND r.status = 'completed'),
         (SELECT round(avg(r.score), 1) FROM public.performance_reviews r
           WHERE r.cycle_id = c.id AND r.tenant_id = v_tenant
             AND r.archived_at IS NULL AND r.status <> 'cancelled'
             AND r.score IS NOT NULL),
         (c.archived_at IS NOT NULL),
         c.created_at
    FROM public.performance_cycles c
   WHERE c.tenant_id = v_tenant
     AND (p_include_archived OR c.archived_at IS NULL)
   ORDER BY c.start_date DESC, c.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END $$;

COMMENT ON FUNCTION public.performance_cycles_board(BOOLEAN, INTEGER) IS
  'دورات التقييم مع عدّ تقييماتها ومتوسّطها — كانت الصفحة تجلبها '
  'بلا حدّ وتعدّ في المتصفّح.';

REVOKE ALL ON FUNCTION public.performance_cycles_board(BOOLEAN, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_cycles_board(BOOLEAN, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_cycles_board(BOOLEAN, INTEGER) TO authenticated;

-- ══ التقييمات ════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_reviews_board(UUID, TEXT, TEXT, BOOLEAN, INTEGER);

CREATE FUNCTION public.performance_reviews_board(
  p_cycle_id         UUID    DEFAULT NULL,
  p_status           TEXT    DEFAULT NULL,
  p_search           TEXT    DEFAULT NULL,
  p_include_archived BOOLEAN DEFAULT FALSE,
  p_limit            INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_reviewer_id   UUID,
  out_reviewer_name TEXT,
  out_cycle_id      UUID,
  out_cycle_name    TEXT,
  out_score         NUMERIC,
  out_rating        INTEGER,
  out_status        TEXT,
  out_strengths     TEXT,
  out_improvements  TEXT,
  out_comments      TEXT,
  out_submitted_at  TIMESTAMPTZ,
  out_completed_at  TIMESTAMPTZ,
  out_archived      BOOLEAN,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض تقييمات الأداء';
  END IF;

  -- ★ الحارس يعكس CHECK القاعدة نصّاً
  IF p_status IS NOT NULL
     AND p_status NOT IN ('draft','submitted','under_review','completed','cancelled') THEN
    RAISE EXCEPTION 'REVIEW_BAD_STATUS: حالة غير معروفة «%» — المسموح: '
      'draft·submitted·under_review·completed·cancelled', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.employee_id,
    -- ★ full_name_ar = NULL لكل موظف (مُحقَّق) — سلسلة احتياطية
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             NULLIF(btrim(pe.full_name), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, pe.department, '—')::TEXT,
    r.reviewer_id,
    COALESCE(NULLIF(btrim(pr.full_name), ''), '—')::TEXT,
    r.cycle_id,
    COALESCE(c.name, '— بلا دورة —')::TEXT,
    r.score,
    r.rating,
    r.status::TEXT,
    r.strengths,
    r.improvements,
    r.comments,
    r.submitted_at,
    r.completed_at,
    (r.archived_at IS NOT NULL),
    r.created_at
  FROM public.performance_reviews r
  JOIN public.employees e  ON e.id = r.employee_id
  LEFT JOIN public.profiles    pe ON pe.id = e.user_id
  LEFT JOIN public.profiles    pr ON pr.id = r.reviewer_id
  LEFT JOIN public.departments d  ON d.id = e.department_id
  LEFT JOIN public.performance_cycles c ON c.id = r.cycle_id
  WHERE r.tenant_id = v_tenant
    AND (p_include_archived OR r.archived_at IS NULL)
    AND (p_cycle_id IS NULL OR r.cycle_id = p_cycle_id)
    AND (p_status   IS NULL OR r.status   = p_status)
    AND (v_q IS NULL
         OR e.full_name_ar ILIKE '%' || v_q || '%'
         OR e.employee_code ILIKE '%' || v_q || '%'
         OR pe.full_name ILIKE '%' || v_q || '%'
         OR c.name ILIKE '%' || v_q || '%')
  ORDER BY r.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

COMMENT ON FUNCTION public.performance_reviews_board(UUID, TEXT, TEXT, BOOLEAN, INTEGER) IS
  'التقييمات مع الاسم والقسم واسم المقيّم والدورة في استعلام واحد — '
  'كانت الصفحة تجلب ثلاثة جداول بلا حدّ وتربطها في المتصفّح.';

REVOKE ALL ON FUNCTION public.performance_reviews_board(UUID, TEXT, TEXT, BOOLEAN, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_reviews_board(UUID, TEXT, TEXT, BOOLEAN, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_reviews_board(UUID, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;

-- ══ إنشاء دورة ═══════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_cycle_create(TEXT, TEXT, DATE, DATE, TEXT);

CREATE FUNCTION public.performance_cycle_create(
  p_name        TEXT,
  p_description TEXT DEFAULT NULL,
  p_start_date  DATE DEFAULT NULL,
  p_end_date    DATE DEFAULT NULL,
  p_period      TEXT DEFAULT 'quarterly'
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء دورة تقييم (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'CYCLE_NO_NAME: اسم الدورة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'CYCLE_NO_DATES: تاريخا البداية والنهاية إلزاميّان'
      USING ERRCODE = 'check_violation';
  END IF;
  -- ★★ العطل ⑤: النهاية قبل البداية كانت تمرّ
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'CYCLE_BAD_RANGE: النهاية (%) قبل البداية (%)',
      p_end_date, p_start_date USING ERRCODE = 'check_violation';
  END IF;
  IF p_period NOT IN ('monthly','quarterly','semi_annual','annual') THEN
    RAISE EXCEPTION 'CYCLE_BAD_PERIOD: فترة غير معروفة «%» — المسموح: '
      'monthly·quarterly·semi_annual·annual', p_period
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.performance_cycles
    (tenant_id, name, description, start_date, end_date,
     review_period, status, created_by)
  VALUES (v_tenant, btrim(p_name), NULLIF(btrim(COALESCE(p_description,'')), ''),
          p_start_date, p_end_date, p_period, 'draft', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.performance_cycle_create(TEXT, TEXT, DATE, DATE, TEXT) IS
  'إنشاء دورة بحارس التاريخ والفترة. مقيس قبل 0356: دورة نهايتها قبل '
  'بدايتها بفترة «كل ثانية» وحالة «حالة وهمية» — كلّها قُبلت.';

REVOKE ALL ON FUNCTION public.performance_cycle_create(TEXT, TEXT, DATE, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_cycle_create(TEXT, TEXT, DATE, DATE, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_cycle_create(TEXT, TEXT, DATE, DATE, TEXT) TO authenticated;

-- ══ حالة الدورة ══════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_cycle_set_status(UUID, TEXT);

CREATE FUNCTION public.performance_cycle_set_status(
  p_cycle_id UUID,
  p_status   TEXT
) RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_cur    TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بتغيير حالة الدورة (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_status NOT IN ('draft','active','closed','cancelled') THEN
    RAISE EXCEPTION 'CYCLE_BAD_STATUS: حالة غير معروفة «%»', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.status INTO v_cur FROM public.performance_cycles c
   WHERE c.id = p_cycle_id AND c.tenant_id = v_tenant;
  IF v_cur IS NULL THEN
    RAISE EXCEPTION 'الدورة غير موجودة في هذا المستأجر';
  END IF;

  -- ★★ انتقالات محدَّدة: المغلقة والملغاة نهائيتان
  IF v_cur IN ('closed','cancelled') THEN
    RAISE EXCEPTION 'CYCLE_FINAL: الدورة بحالة «%» — لا انتقال بعدها', v_cur
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_cur = 'draft' AND p_status NOT IN ('active','cancelled') THEN
    RAISE EXCEPTION 'CYCLE_BAD_TRANSITION: من draft إلى active أو cancelled فقط'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_cur = 'active' AND p_status NOT IN ('closed','cancelled') THEN
    RAISE EXCEPTION 'CYCLE_BAD_TRANSITION: من active إلى closed أو cancelled فقط'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★ إغلاق الدورة يُغلق تقييماتها المعلَّقة: لا مسوَّدة معلَّقة أبداً
  IF p_status = 'closed' THEN
    UPDATE public.performance_reviews
       SET status = 'cancelled', updated_at = NOW()
     WHERE tenant_id = v_tenant AND cycle_id = p_cycle_id
       AND archived_at IS NULL
       AND status IN ('draft','submitted','under_review');
  END IF;

  UPDATE public.performance_cycles
     SET status = p_status, updated_at = NOW()
   WHERE id = p_cycle_id AND tenant_id = v_tenant;

  RETURN p_status;
END $$;

COMMENT ON FUNCTION public.performance_cycle_set_status(UUID, TEXT) IS
  'انتقال حالة الدورة. إغلاقها يُلغي تقييماتها المعلَّقة فلا تبقى '
  'مسوَّدة معلَّقة إلى الأبد.';

REVOKE ALL ON FUNCTION public.performance_cycle_set_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_cycle_set_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_cycle_set_status(UUID, TEXT) TO authenticated;

-- ══ إنشاء تقييم ══════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_review_create(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT);

CREATE FUNCTION public.performance_review_create(
  p_employee_id   UUID,
  p_cycle_id      UUID    DEFAULT NULL,
  p_reviewer_id   UUID    DEFAULT NULL,
  p_score         NUMERIC DEFAULT NULL,
  p_strengths     TEXT    DEFAULT NULL,
  p_improvements  TEXT    DEFAULT NULL,
  p_comments      TEXT    DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_cyc    TEXT;
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء تقييم (الدور: %)', COALESCE(v_role,'—');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;

  -- ★★ العطل ③: الدرجة على سُلَّم واحد صريح
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'REVIEW_BAD_SCORE: الدرجة يجب أن تكون بين 0 و 100 '
      '(المُمرَّرة: %)', COALESCE(p_score::TEXT,'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_cycle_id IS NOT NULL THEN
    SELECT c.status INTO v_cyc FROM public.performance_cycles c
     WHERE c.id = p_cycle_id AND c.tenant_id = v_tenant;
    IF v_cyc IS NULL THEN
      RAISE EXCEPTION 'الدورة غير موجودة في هذا المستأجر';
    END IF;
    -- ★ لا تقييم في دورة مغلقة أو ملغاة
    IF v_cyc IN ('closed','cancelled') THEN
      RAISE EXCEPTION 'CYCLE_NOT_OPEN: الدورة بحالة «%» — لا تقييم فيها', v_cyc
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_reviewer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr
                      WHERE pr.id = p_reviewer_id AND pr.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'المقيّم غير موجود في هذا المستأجر';
  END IF;

  -- ★★ العطل ⑥: الفرادة محروسة بالفهرس — نُعطي رسالةً مفهومة قبله
  IF p_cycle_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.performance_reviews r
                  WHERE r.tenant_id = v_tenant
                    AND r.cycle_id = p_cycle_id
                    AND r.employee_id = p_employee_id
                    AND r.archived_at IS NULL
                    AND r.status <> 'cancelled') THEN
    RAISE EXCEPTION 'REVIEW_DUPLICATE: للموظف تقييمٌ قائم في هذه الدورة'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.performance_reviews
    (tenant_id, employee_id, cycle_id, reviewer_id, score,
     strengths, improvements, comments, status)
  VALUES (v_tenant, p_employee_id, p_cycle_id,
          COALESCE(p_reviewer_id, auth.uid()), p_score,
          NULLIF(btrim(COALESCE(p_strengths,'')), ''),
          NULLIF(btrim(COALESCE(p_improvements,'')), ''),
          NULLIF(btrim(COALESCE(p_comments,'')), ''),
          'draft')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.performance_review_create(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) IS
  'إنشاء تقييم. الصفحة كانت ترسل overall_score/strengths/improvements '
  'وهي أعمدة غير موجودة ⇒ الإنشاء يفشل دائماً (0356/①).';

REVOKE ALL ON FUNCTION public.performance_review_create(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_review_create(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_review_create(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- ══ حالة التقييم ═════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_review_set_status(UUID, TEXT);

CREATE FUNCTION public.performance_review_set_status(
  p_review_id UUID,
  p_status    TEXT
) RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_cur    TEXT;
  v_arch   TIMESTAMPTZ;
  v_ok     BOOLEAN;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بتغيير حالة التقييم (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_status NOT IN ('draft','submitted','under_review','completed','cancelled') THEN
    RAISE EXCEPTION 'REVIEW_BAD_STATUS: حالة غير معروفة «%»', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.status, r.archived_at INTO v_cur, v_arch
    FROM public.performance_reviews r
   WHERE r.id = p_review_id AND r.tenant_id = v_tenant;
  IF v_cur IS NULL THEN
    RAISE EXCEPTION 'التقييم غير موجود في هذا المستأجر';
  END IF;
  IF v_arch IS NOT NULL THEN
    RAISE EXCEPTION 'REVIEW_ARCHIVED: التقييم مؤرشف — لا تعديل عليه'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★ انتقالات محدَّدة — المكتملة والملغاة نهائيتان
  v_ok := CASE v_cur
    WHEN 'draft'        THEN p_status IN ('submitted','cancelled')
    WHEN 'submitted'    THEN p_status IN ('under_review','completed','cancelled')
    WHEN 'under_review' THEN p_status IN ('completed','cancelled')
    ELSE FALSE
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'REVIEW_BAD_TRANSITION: لا انتقال من «%» إلى «%»',
      v_cur, p_status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.performance_reviews
     SET status = p_status, updated_at = NOW()
   WHERE id = p_review_id AND tenant_id = v_tenant;

  RETURN p_status;
END $$;

COMMENT ON FUNCTION public.performance_review_set_status(UUID, TEXT) IS
  'انتقال حالة التقييم. زرّ «إكمال» كان يكتب completed_at وهو عمود '
  'غير موجود، ومحفّز updated_at كان يُسقط أيّ UPDATE أصلاً (0356/②).';

REVOKE ALL ON FUNCTION public.performance_review_set_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_review_set_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_review_set_status(UUID, TEXT) TO authenticated;

-- ══ الأرشفة ══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.performance_review_archive(UUID, TEXT);

CREATE FUNCTION public.performance_review_archive(
  p_review_id UUID,
  p_reason    TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بأرشفة التقييم (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REVIEW_NO_REASON: سبب الأرشفة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.performance_reviews
     SET archived_at = NOW(), archive_reason = btrim(p_reason), updated_at = NOW()
   WHERE id = p_review_id AND tenant_id = v_tenant AND archived_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'التقييم غير موجود في هذا المستأجر أو مؤرشف أصلاً';
  END IF;
  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.performance_review_archive(UUID, TEXT) IS
  'أرشفة بدل حذف. الحذف كان متاحاً لأي staff بلا حارس (0356/⑨).';

REVOKE ALL ON FUNCTION public.performance_review_archive(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.performance_review_archive(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.performance_review_archive(UUID, TEXT) TO authenticated;
