-- ════════════════════════════════════════════════════════════════════════
--  0361 — سلامة تخطيط التعاقب
--  المرحلة 4 — بوابة الموارد البشرية · hr/SuccessionPlanningPage.tsx (231 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0361.sql — على قاعدة نظيفة، 289 م.)  │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ★ إنصافاً للجدولين: قيودهما **أفضل** من معظم ما مرّ في هذه السلسلة —
--    `risk_level` و`readiness_level` و`status` كلها بـCHECK، و
--    `readiness_score` محصورٌ 0..100، وفرادةٌ على
--    `(tenant_id, critical_position_id, employee_id)`، وفهرسان على
--    `critical_position_id` و`employee_id`. الأعطال في مكانٍ آخر.
--
--  ① ★★★ **«جاهز الآن» يُقصى من العرض دائماً.**
--     `findByPosition` تُرتّب `orderBy:'readiness_level', ascending:true`
--     والصفحة تعرض `positionCandidates.slice(0, 3)`.
--     الترتيب **أبجديّ** لا منطقيّ:
--
--     PROBE_15:  future_potential < ready_12_months < ready_6_months < ready_now
--
--     ⇒ المعروضون الثلاثة دائماً:
--        `future_potential · ready_12_months · ready_6_months`
--       و**`ready_now` رابعاً فلا يظهر أبداً**.
--
--     صفحةٌ اسمها «تخطيط التعاقب» تُخفي الخليفة الجاهز وتعرض «موهبة
--     مستقبلية» مكانه. وبطاقة «جاهزون الآن» تعدّهم بشكلٍ صحيح فيرى
--     المستخدم رقماً لا يجد مقابله في القائمة.
--
--  ② ★★★ **`incumbent_employee_id` بلا مفتاح أجنبيّ.**
--     PROBE_1: شاغلٌ `ffffffff-…` غير موجود ⇒ **قُبِل**.
--     `pg_constraint` على `critical_positions` = أربعة: pkey · risk CHECK
--     · status CHECK · tenant FK. **لا شيء على الشاغل.**
--
--  ③ ★★★ **شاغلٌ من مستأجرٍ آخر داخل مستأجرك.**
--     PROBE_3: `tenant_id = ألف` مع `incumbent_employee_id` من **باء**
--     ⇒ **قُبِل**. ويُعرض في الصفحة «غير محدد» لأن `employeeMap` لا
--     تحويه — فالتسريب صامت.
--
--  ④/⑤ ★★★ **`succession_candidates.employee_id` بلا FK كذلك.**
--     PROBE_4: مرشّحٌ معدوم ⇒ قُبِل · PROBE_5: مرشّحٌ من باء ⇒ قُبِل.
--
--  ⑥ ★★★ **الفرادة تحرس الثلاثيّ ولا تحرس الاتّساق.**
--     `succession_candidates_unique (tenant_id, critical_position_id,
--     employee_id)` تمنع التكرار، لكن لا شيء يمنع أن يكون
--     `critical_position_id` منصباً في **مستأجرٍ آخر**.
--     PROBE_6: مرشّحٌ بـ`tenant_id = ألف` على منصبٍ في **باء** ⇒ **قُبِل**.
--     ⇒ صفٌّ يراه مستأجر ألف ويشير إلى منصبٍ لا يراه — والحذف من باء
--       يُبيده (CASCADE) بلا علم ألف.
--
--  ⑦ ★★★ **الموظف مرشَّحٌ لخلافة نفسه.**
--     PROBE_7: `incumbent_employee_id = سالم` و`employee_id = سالم`
--     على المنصب نفسه ⇒ **قُبِل** بدرجة جاهزية 100.
--     خطة تعاقبٍ خليفتها هو الشاغل نفسه = لا خطة إطلاقاً. وهذا بالضبط
--     الخطر الذي وُجدت الصفحة لقياسه.
--
--  ⑧ ★★ **`readiness_score` يناقض `readiness_level` بلا رادع.**
--     PROBE_8: `readiness_level = 'ready_now'` مع `readiness_score = 3`
--     ⇒ **قُبِل**. الشريط يعرض 3% والنصّ يقول «جاهز الآن».
--     القيد القائم يحرس المدى `0..100` ولا يحرس الاتّساق.
--
--  ⑨ ★★ **`readiness_score` يقبل NULL ⇒ شريطٌ صفريّ كاذب.**
--     PROBE_9: مرشّحٌ بلا درجة ⇒ قُبِل. والصفحة تكتب
--     `width: ${candidate.readiness_score || 0}%` ⇒ **`?? 0` يخفي
--     غياب القياس** (درس 0353: NULL ≠ صفر) فيبدو المرشّح غير المُقيَّم
--     كأنه صفرُ جاهزية.
--
--  ⑩ ★★★ **الحذف النهائيّ مسموح — ولا محفّز يمنع.**
--     PROBE_10: بدور `authenticated` حقيقيّ (هدى · hr)
--     `DELETE FROM succession_candidates` ⇒ الصفّ **اختفى**.
--     ترشيحٌ وتقييمُ جاهزيةٍ وملاحظاتُ مديرٍ — تُمحى بلا أثر.
--
--  ⑪ ★★★ **حذف المنصب يُبيد كل مرشّحيه صامتاً.**
--     `succession_candidates_critical_position_id_fkey … ON DELETE CASCADE`
--     PROBE_11: منصبٌ بمرشّحَين ⇒ حُذف ⇒ **صفر مرشّح** بلا تحذير.
--     سنواتٌ من تقييم الجاهزية تذهب بضغطة.
--
--  ⑫ ★★ **`status = 'closed'` بلا أثر.**
--     العمود موجود بـCHECK، والصفحة تستدعي
--     `findAll({orderBy:'created_at'})` **بلا فلتر** ثم
--     `summary.positions = positions.length`.
--     PROBE_12: منصبٌ مغلق ⇒ ما زال في العدّ = 3.
--     ★ ولاحظ: `criticalPositionService.findActive()` **موجودة** في
--       الخدمة وتفلتر `status='active'` — **والصفحة لا تستدعيها**.
--
--  ⑬ ★★ **`candidate.status = 'inactive'` بلا أثر كذلك.**
--     PROBE_13: مرشّحٌ معطَّل بـ`ready_now` ⇒ ما زال في بطاقة
--     «جاهزون الآن» = 2.
--
--  ⑭ ★★★ **N+1 نداءً شبكياً.**
--     `const candidateSets = await Promise.all(positionRows.map(
--        p => successionCandidateService.findByPosition(p.id)))`
--     PROBE_14: ثلاثة مناصب ⇒ **1 + 3** نداءً. بمئة منصبٍ حرج ⇒ 101.
--     ★ ويجلب **كل** الموظفين و**كل** الأقسام ليبني `Map` في المتصفّح.
--
--  ⑮ ★★ **`succession_development_plans` جدولٌ حيٌّ بلا مستعمل.**
--     PROBE_17: صفر صفّ. و`successionDevelopmentPlanService` مُصدَّرة
--     من `index.ts` ولا يستوردها **أيّ ملف** (مسحُ المستودع).
--     ⇒ «الفجوات» تُكتب في `gaps` نصّاً حراً ولا تتحوّل إلى خطة عمل.
--
--  ⑯ ★★ **صفر دالة في المنظومة لتخطيط التعاقب.**
--     PROBE_18 = 0. كل المنطق في المتصفّح.
--
--  ★ عطلٌ ظننتُه ثم أسقطتُه: توقّعتُ غياب فهرسٍ على
--    `critical_position_id`. PROBE_16 أثبت العكس — `idx_succession_
--    candidates_position` و`_employee` **موجودان**. لا أوثّق ما لم يثبت.
--
--  ────────────────────────────────────────────────────────────────────
--  العلاج:
--    · FK مركَّب للشاغل والمرشّح والمنصب — يمنع ③④⑤⑥ معاً
--    · CHECK يمنع الشاغل من خلافة نفسه (⑦)
--    · CHECK يُلزم اتّساق الدرجة مع المستوى (⑧) · والدرجة NOT NULL (⑨)
--    · محفّز يمنع الحذف النهائيّ (⑩) · و`ON DELETE RESTRICT` (⑪)
--    · `succession_board()` — استعلامٌ واحد بترتيبٍ **منطقيّ** (①⑭)
--    · `succession_summary()` يحترم `status` (⑫⑬)
--    · `succession_position_upsert` · `succession_candidate_nominate`
--      `succession_candidate_set_status` · `succession_position_close`
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف البيانات القائمة قبل فرض القيود
-- ═══════════════════════════════════════════════════════════════════

-- ★ العطل ③: شاغلٌ لا ينتمي للمستأجر (أو معدوم) ⇒ يُفرَّغ لا يُحذف المنصب
UPDATE public.critical_positions p
   SET incumbent_employee_id = NULL
 WHERE p.incumbent_employee_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.employees e
                    WHERE e.id = p.incumbent_employee_id
                      AND e.tenant_id = p.tenant_id);

-- ★ العطل ②: قسمٌ لا ينتمي للمستأجر (أو معدوم)
UPDATE public.critical_positions p
   SET department_id = NULL
 WHERE p.department_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.departments d
                    WHERE d.id = p.department_id
                      AND d.tenant_id = p.tenant_id);

-- ★ العطلان ④/⑤: مرشّحٌ معدوم أو من مستأجرٍ آخر ⇒ يُعطَّل لا يُحذف
UPDATE public.succession_candidates c
   SET status = 'inactive'
 WHERE NOT EXISTS (SELECT 1 FROM public.employees e
                    WHERE e.id = c.employee_id AND e.tenant_id = c.tenant_id);

-- ★ العطل ⑥: مرشّحٌ على منصبٍ في مستأجرٍ آخر ⇒ يُعطَّل
UPDATE public.succession_candidates c
   SET status = 'inactive'
 WHERE NOT EXISTS (SELECT 1 FROM public.critical_positions p
                    WHERE p.id = c.critical_position_id
                      AND p.tenant_id = c.tenant_id);

-- ★ العطل ⑨: الدرجة الغائبة تُستنتج من المستوى (لا تُصفَّر)
UPDATE public.succession_candidates
   SET readiness_score = CASE readiness_level
         WHEN 'ready_now'        THEN 90
         WHEN 'ready_6_months'   THEN 70
         WHEN 'ready_12_months'  THEN 50
         ELSE 25 END
 WHERE readiness_score IS NULL;

-- ★ العطل ⑧: درجةٌ تناقض المستوى ⇒ تُرفَع إلى الحدّ الأدنى للمستوى
UPDATE public.succession_candidates
   SET readiness_score = CASE readiness_level
         WHEN 'ready_now'       THEN 80
         WHEN 'ready_6_months'  THEN 60
         WHEN 'ready_12_months' THEN 40
         ELSE readiness_score END
 WHERE (readiness_level = 'ready_now'       AND readiness_score < 80)
    OR (readiness_level = 'ready_6_months'  AND readiness_score < 60)
    OR (readiness_level = 'ready_12_months' AND readiness_score < 40);

-- ★ العطل ⑦: الشاغل خليفةُ نفسه ⇒ يُعطَّل
UPDATE public.succession_candidates c
   SET status = 'inactive'
  FROM public.critical_positions p
 WHERE p.id = c.critical_position_id
   AND p.incumbent_employee_id = c.employee_id;

-- الصفوف المعطَّلة أعلاه ما زالت تخالف FK المُزمَع ⇒ تُحذف هي وحدها
-- (لا يمكن أن تُقرأ أو تُصلَح تحت أي دور — تشير إلى كياناتٍ غير مرئية)
DELETE FROM public.succession_candidates c
 WHERE NOT EXISTS (SELECT 1 FROM public.employees e
                    WHERE e.id = c.employee_id AND e.tenant_id = c.tenant_id)
    OR NOT EXISTS (SELECT 1 FROM public.critical_positions p
                    WHERE p.id = c.critical_position_id
                      AND p.tenant_id = c.tenant_id);

-- ═══════════════════════════════════════════════════════════════════
--  ① القيود البنيوية
-- ═══════════════════════════════════════════════════════════════════

-- ★★ الفهرس الفريد المركَّب على المناصب — شرطُ وجودٍ لـFK المرشّح
CREATE UNIQUE INDEX IF NOT EXISTS uq_critical_positions_id_tenant
  ON public.critical_positions (id, tenant_id);

-- ★★★ العطل ③: الشاغل من المستأجر نفسه حتماً
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'critical_positions_incumbent_tenant_fkey') THEN
    ALTER TABLE public.critical_positions
      ADD CONSTRAINT critical_positions_incumbent_tenant_fkey
      FOREIGN KEY (incumbent_employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ★★ العطل ②: القسم من المستأجر نفسه
CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_id_tenant
  ON public.departments (id, tenant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'critical_positions_department_tenant_fkey') THEN
    ALTER TABLE public.critical_positions
      ADD CONSTRAINT critical_positions_department_tenant_fkey
      FOREIGN KEY (department_id, tenant_id)
      REFERENCES public.departments (id, tenant_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ★★★ العطلان ④/⑤: المرشّح من المستأجر نفسه
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'succession_candidates_employee_tenant_fkey') THEN
    ALTER TABLE public.succession_candidates
      ADD CONSTRAINT succession_candidates_employee_tenant_fkey
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ★★★ العطلان ⑥/⑪: المنصب من المستأجر نفسه — و RESTRICT لا CASCADE
ALTER TABLE public.succession_candidates
  DROP CONSTRAINT IF EXISTS succession_candidates_critical_position_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'succession_candidates_position_tenant_fkey') THEN
    ALTER TABLE public.succession_candidates
      ADD CONSTRAINT succession_candidates_position_tenant_fkey
      FOREIGN KEY (critical_position_id, tenant_id)
      REFERENCES public.critical_positions (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ★★ العطل ⑨: الدرجة إلزامية — «غير مُقاس» ليس «صفراً»
UPDATE public.succession_candidates SET readiness_score = 25
 WHERE readiness_score IS NULL;
ALTER TABLE public.succession_candidates
  ALTER COLUMN readiness_score SET NOT NULL;
ALTER TABLE public.succession_candidates
  ALTER COLUMN readiness_score SET DEFAULT 25;

-- ★★ العطل ⑧: الدرجة تتّسق مع المستوى
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'succession_candidates_score_level_chk') THEN
    ALTER TABLE public.succession_candidates
      ADD CONSTRAINT succession_candidates_score_level_chk
      CHECK (
        (readiness_level = 'ready_now'        AND readiness_score >= 80) OR
        (readiness_level = 'ready_6_months'   AND readiness_score >= 60) OR
        (readiness_level = 'ready_12_months'  AND readiness_score >= 40) OR
        (readiness_level = 'future_potential')
      );
  END IF;
END $$;

-- ★ عنوانٌ غير فارغ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'critical_positions_title_chk') THEN
    ALTER TABLE public.critical_positions
      ADD CONSTRAINT critical_positions_title_chk CHECK (btrim(title) <> '');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_critical_positions_active
  ON public.critical_positions (tenant_id, risk_level)
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════
--  ② محفّز: يمنع الشاغل من خلافة نفسه (العطل ⑦)
--  ★ CHECK لا يكفي — الشرط يمسّ جدولين
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_succession_guard_self()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_incumbent UUID;
BEGIN
  SELECT p.incumbent_employee_id INTO v_incumbent
    FROM public.critical_positions p
   WHERE p.id = NEW.critical_position_id;

  IF v_incumbent IS NOT NULL AND v_incumbent = NEW.employee_id THEN
    RAISE EXCEPTION
      'SUCCESSION_SELF_NOMINATION: الشاغل الحالي لا يكون خليفة نفسه';
  END IF;

  NEW.nominated_by := COALESCE(NEW.nominated_by, auth.uid());
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_succession_guard_self() IS
  'يمنع ترشيح شاغل المنصب لخلافة نفسه (العطل ⑦) ويملأ nominated_by.';

DROP TRIGGER IF EXISTS trg_succession_guard_self ON public.succession_candidates;
CREATE TRIGGER trg_succession_guard_self
  BEFORE INSERT OR UPDATE ON public.succession_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_succession_guard_self();

-- ★ والاتجاه المعاكس: تعيين شاغلٍ هو مرشَّحٌ نشطٌ للمنصب نفسه
CREATE OR REPLACE FUNCTION public.tg_position_guard_incumbent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.incumbent_employee_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.succession_candidates c
                  WHERE c.critical_position_id = NEW.id
                    AND c.employee_id = NEW.incumbent_employee_id
                    AND c.status = 'active') THEN
    RAISE EXCEPTION
      'SUCCESSION_INCUMBENT_IS_CANDIDATE: المرشّح النشط لا يصير شاغلاً بلا إلغاء ترشيحه';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_position_guard_incumbent ON public.critical_positions;
CREATE TRIGGER trg_position_guard_incumbent
  BEFORE UPDATE OF incumbent_employee_id ON public.critical_positions
  FOR EACH ROW EXECUTE FUNCTION public.tg_position_guard_incumbent();

-- ★ العطل ⑩: منع الحذف النهائيّ في الجدولين
CREATE OR REPLACE FUNCTION public.tg_block_succession_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'SUCCESSION_DELETE_BLOCKED: خطة التعاقب لا تُحذف — استخدم الإلغاء أو الإغلاق';
END $$;

DROP TRIGGER IF EXISTS trg_block_succession_candidate_delete
  ON public.succession_candidates;
CREATE TRIGGER trg_block_succession_candidate_delete
  BEFORE DELETE ON public.succession_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_succession_delete();

DROP TRIGGER IF EXISTS trg_block_critical_position_delete
  ON public.critical_positions;
CREATE TRIGGER trg_block_critical_position_delete
  BEFORE DELETE ON public.critical_positions
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_succession_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ③ الدوال — استعلامٌ واحد بترتيبٍ منطقيّ
-- ═══════════════════════════════════════════════════════════════════

-- ★★★ العطل ①: رتبةُ الجاهزية — 1 = الأجهز. الترتيب الأبجديّ كان
--   يضع `ready_now` **آخراً** فيُقصيه `slice(0,3)` دائماً.
DROP FUNCTION IF EXISTS public.succession_readiness_rank(TEXT);
CREATE FUNCTION public.succession_readiness_rank(p_level TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_level
    WHEN 'ready_now'       THEN 1
    WHEN 'ready_6_months'  THEN 2
    WHEN 'ready_12_months' THEN 3
    WHEN 'future_potential' THEN 4
    ELSE 9 END;
$$;

COMMENT ON FUNCTION public.succession_readiness_rank(TEXT) IS
  'رتبة الجاهزية المنطقية. الترتيب الأبجديّ كان يضع ready_now آخراً '
  'فيُقصيه slice(0,3) في الواجهة — العطل ①.';

DROP FUNCTION IF EXISTS public.succession_board(TEXT, TEXT, TEXT, INTEGER);
CREATE FUNCTION public.succession_board(
  p_search TEXT    DEFAULT NULL,
  p_risk   TEXT    DEFAULT NULL,
  p_status TEXT    DEFAULT 'active',
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id             UUID,
  out_title          TEXT,
  out_risk_level     TEXT,
  out_status         TEXT,
  out_department     TEXT,
  out_incumbent_id   UUID,
  out_incumbent_name TEXT,
  out_business_impact TEXT,
  out_required_skills TEXT[],
  out_candidates_total INTEGER,
  out_ready_now      INTEGER,
  out_best_rank      INTEGER,
  out_avg_score      NUMERIC,
  out_candidates     JSONB,
  out_created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بلوح التعاقب';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.*
      FROM public.critical_positions p
     WHERE p.tenant_id = v_tenant
       AND (p_risk IS NULL OR p.risk_level = p_risk)
       -- ★★★ العطل ⑫: المغلق خارج اللوح كما هو خارج الملخّص.
       --   أمسك هذا النقصَ تأكيدي 12.9 نفسه: كان الملخّص يحترم
       --   `status` واللوح لا يحترمه ⇒ رقمان متناقضان في شاشة واحدة.
       AND (p_status IS NULL OR p.status = p_status)
  ),
  cand AS (
    -- ★ العطل ⑬: المعطَّل خارج كل حساب
    SELECT c.critical_position_id AS pid,
           count(*)::INTEGER AS total,
           count(*) FILTER (WHERE c.readiness_level = 'ready_now')::INTEGER AS ready,
           min(public.succession_readiness_rank(c.readiness_level))::INTEGER AS best,
           round(avg(c.readiness_score), 1) AS avg_score,
           jsonb_agg(
             jsonb_build_object(
               'id', c.id,
               'employeeId', c.employee_id,
               'employeeName', COALESCE(
                 NULLIF(btrim(e.full_name_ar), ''),
                 NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
                 'موظف ' || e.employee_code),
               'employeeCode', e.employee_code,
               'level', c.readiness_level,
               'rank', public.succession_readiness_rank(c.readiness_level),
               'score', c.readiness_score,
               'strengths', c.strengths,
               'gaps', c.gaps,
               'notes', c.manager_notes)
             -- ★★★ العطل ①: الأجهز أوّلاً — لا أبجدياً
             ORDER BY public.succession_readiness_rank(c.readiness_level),
                      c.readiness_score DESC, c.id
           ) AS rows
      FROM public.succession_candidates c
      JOIN base b ON b.id = c.critical_position_id
      JOIN public.employees e
        ON e.id = c.employee_id AND e.tenant_id = c.tenant_id
     WHERE c.tenant_id = v_tenant AND c.status = 'active'
     GROUP BY c.critical_position_id
  )
  SELECT
    b.id, b.title::TEXT, b.risk_level::TEXT, b.status::TEXT,
    COALESCE(d.name_ar, '—')::TEXT,
    b.incumbent_employee_id,
    COALESCE(
      NULLIF(btrim(ie.full_name_ar), ''),
      NULLIF(btrim(ie.first_name || ' ' || ie.last_name), ''),
      NULLIF('موظف ' || ie.employee_code, 'موظف '),
      '—')::TEXT,
    b.business_impact,
    b.required_skills,
    COALESCE(c.total, 0),
    COALESCE(c.ready, 0),
    -- ★ NULL = «لا مرشّح» لا «الأسوأ» (درس 0353)
    c.best,
    c.avg_score,
    COALESCE(c.rows, '[]'::JSONB),
    b.created_at
  FROM base b
  LEFT JOIN cand c ON c.pid = b.id
  LEFT JOIN public.departments d
    ON d.id = b.department_id AND d.tenant_id = b.tenant_id
  LEFT JOIN public.employees ie
    ON ie.id = b.incumbent_employee_id AND ie.tenant_id = b.tenant_id
 WHERE p_search IS NULL OR btrim(p_search) = ''
    OR b.title ILIKE '%' || btrim(p_search) || '%'
    OR COALESCE(b.business_impact,'') ILIKE '%' || btrim(p_search) || '%'
    OR COALESCE(d.name_ar,'') ILIKE '%' || btrim(p_search) || '%'
    OR COALESCE(ie.first_name || ' ' || ie.last_name,'')
         ILIKE '%' || btrim(p_search) || '%'
 -- ★★★ ترتيبٌ حتميّ: المكشوف أولاً ثم الأخطر ثم id فاصلاً (درس 0357)
 ORDER BY (COALESCE(c.total,0) = 0) DESC,
          CASE b.risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                            WHEN 'medium' THEN 3 ELSE 4 END,
          b.created_at DESC, b.id DESC
 LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.succession_board(TEXT, TEXT, TEXT, INTEGER) IS
  'لوح التعاقب: استعلامٌ واحد بدل 1+N (العطل ⑭). المرشّحون مرتَّبون '
  'بالجاهزية المنطقية لا الأبجدية (العطل ①)، والمعطَّل خارج الحساب (⑬)، والمنصب المغلق خارج اللوح كما هو خارج الملخّص (⑫). p_status = NULL يعرض الجميع.';

DROP FUNCTION IF EXISTS public.succession_summary();
CREATE FUNCTION public.succession_summary()
RETURNS TABLE (
  out_positions   INTEGER,
  out_closed      INTEGER,
  out_high_risk   INTEGER,
  out_ready_now   INTEGER,
  out_uncovered   INTEGER,
  out_critical_uncovered INTEGER,
  out_candidates  INTEGER,
  out_avg_score   NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص التعاقب';
  END IF;

  RETURN QUERY
  WITH pos AS (
    SELECT p.id, p.risk_level, p.status
      FROM public.critical_positions p
     WHERE p.tenant_id = v_tenant
  ),
  act AS (SELECT * FROM pos WHERE status = 'active'),
  cnd AS (
    SELECT c.critical_position_id AS pid, c.readiness_level, c.readiness_score
      FROM public.succession_candidates c
      JOIN act a ON a.id = c.critical_position_id
     WHERE c.tenant_id = v_tenant AND c.status = 'active'
  )
  SELECT
    -- ★ العطل ⑫: المغلق خارج العدّ
    (SELECT count(*)::INTEGER FROM act),
    (SELECT count(*)::INTEGER FROM pos WHERE status = 'closed'),
    (SELECT count(*)::INTEGER FROM act WHERE risk_level IN ('critical','high')),
    (SELECT count(*)::INTEGER FROM cnd WHERE readiness_level = 'ready_now'),
    (SELECT count(*)::INTEGER FROM act a
      WHERE NOT EXISTS (SELECT 1 FROM cnd WHERE cnd.pid = a.id)),
    -- ★★ المكشوف **والحرج** — الرقم الذي يهمّ فعلاً
    (SELECT count(*)::INTEGER FROM act a
      WHERE a.risk_level IN ('critical','high')
        AND NOT EXISTS (SELECT 1 FROM cnd WHERE cnd.pid = a.id)),
    (SELECT count(*)::INTEGER FROM cnd),
    -- ★★ NULL = «لا مرشّح» لا «صفر جاهزية»
    (SELECT round(avg(readiness_score), 1) FROM cnd);
END $$;

COMMENT ON FUNCTION public.succession_summary() IS
  'ملخّص التعاقب. يحترم status في الجدولين (العطلان ⑫ و⑬). '
  'out_avg_score = NULL تعني «لا مرشّح» لا «صفر جاهزية».';

-- ─────────────────────────────────────────────────────────────────
--  الكتابة — نداءات واحدة بحرّاس صريحة
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.succession_position_upsert(UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT[]);
CREATE FUNCTION public.succession_position_upsert(
  p_id        UUID,
  p_title     TEXT,
  p_department UUID    DEFAULT NULL,
  p_incumbent UUID     DEFAULT NULL,
  p_risk      TEXT     DEFAULT 'medium',
  p_impact    TEXT     DEFAULT NULL,
  p_skills    TEXT[]   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_NOT_AUTHORIZED';
  END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'SUCCESSION_TITLE_REQUIRED';
  END IF;
  IF p_risk NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'SUCCESSION_RISK_INVALID: %', p_risk;
  END IF;
  -- ★★★ العطل ③: الشاغل من المستأجر نفسه
  IF p_incumbent IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e
                      WHERE e.id = p_incumbent AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_INCUMBENT_NOT_FOUND';
  END IF;
  IF p_department IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.departments d
                      WHERE d.id = p_department AND d.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_DEPARTMENT_NOT_FOUND';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.critical_positions
      (tenant_id, title, department_id, incumbent_employee_id,
       risk_level, business_impact, required_skills, created_by)
    VALUES
      (v_tenant, btrim(p_title), p_department, p_incumbent, p_risk,
       NULLIF(btrim(COALESCE(p_impact,'')),''),
       COALESCE(p_skills, ARRAY[]::TEXT[]), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.critical_positions
       SET title = btrim(p_title), department_id = p_department,
           incumbent_employee_id = p_incumbent, risk_level = p_risk,
           business_impact = NULLIF(btrim(COALESCE(p_impact,'')),''),
           required_skills = COALESCE(p_skills, required_skills),
           updated_at = now()
     WHERE id = p_id AND tenant_id = v_tenant
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'SUCCESSION_POSITION_NOT_FOUND'; END IF;
  END IF;

  RETURN v_id;
END $$;

DROP FUNCTION IF EXISTS public.succession_candidate_nominate(UUID, UUID, TEXT, INTEGER, TEXT, TEXT, TEXT);
CREATE FUNCTION public.succession_candidate_nominate(
  p_position UUID,
  p_employee UUID,
  p_level    TEXT,
  p_score    INTEGER,
  p_strengths TEXT DEFAULT NULL,
  p_gaps     TEXT DEFAULT NULL,
  p_notes    TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_min    INTEGER;
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_NOT_AUTHORIZED';
  END IF;

  -- ★★★ العطل ⑥: المنصب من المستأجر نفسه
  IF NOT EXISTS (SELECT 1 FROM public.critical_positions p
                  WHERE p.id = p_position AND p.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_POSITION_NOT_FOUND';
  END IF;
  -- ★★★ العطلان ④/⑤: المرشّح من المستأجر نفسه
  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_EMPLOYEE_NOT_FOUND';
  END IF;
  IF p_level NOT IN ('ready_now','ready_6_months','ready_12_months','future_potential') THEN
    RAISE EXCEPTION 'SUCCESSION_LEVEL_INVALID: %', p_level;
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'SUCCESSION_SCORE_RANGE';
  END IF;
  -- ★★ العطل ⑧: الاتّساق يُرفَض برمزٍ مفهوم قبل أن يرميه القيد
  v_min := CASE p_level WHEN 'ready_now' THEN 80 WHEN 'ready_6_months' THEN 60
                        WHEN 'ready_12_months' THEN 40 ELSE 0 END;
  IF p_score < v_min THEN
    RAISE EXCEPTION 'SUCCESSION_SCORE_LEVEL_MISMATCH: % يحتاج % فأعلى',
      p_level, v_min;
  END IF;

  -- ★ إعادة الترشيح تُحدِّث ولا تُكرِّر (الفرادة قائمة)
  INSERT INTO public.succession_candidates
    (tenant_id, critical_position_id, employee_id, readiness_level,
     readiness_score, strengths, gaps, manager_notes, status, nominated_by)
  VALUES
    (v_tenant, p_position, p_employee, p_level, p_score,
     NULLIF(btrim(COALESCE(p_strengths,'')),''),
     NULLIF(btrim(COALESCE(p_gaps,'')),''),
     NULLIF(btrim(COALESCE(p_notes,'')),''), 'active', auth.uid())
  ON CONFLICT (tenant_id, critical_position_id, employee_id) DO UPDATE
     SET readiness_level = EXCLUDED.readiness_level,
         readiness_score = EXCLUDED.readiness_score,
         strengths = COALESCE(EXCLUDED.strengths, succession_candidates.strengths),
         gaps      = COALESCE(EXCLUDED.gaps, succession_candidates.gaps),
         manager_notes = COALESCE(EXCLUDED.manager_notes,
                                  succession_candidates.manager_notes),
         status = 'active', updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.succession_candidate_nominate(UUID, UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) IS
  'ترشيح خليفة. يحرس المستأجر في الطرفين والاتّساق بين الدرجة والمستوى. '
  'إعادة الترشيح تُحدِّث ولا تُكرِّر، والمحفّز يمنع خلافة النفس.';

-- ★ العطل ⑬: الإلغاء بدل الحذف
DROP FUNCTION IF EXISTS public.succession_candidate_set_status(UUID, TEXT);
CREATE FUNCTION public.succession_candidate_set_status(
  p_id UUID, p_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_NOT_AUTHORIZED';
  END IF;
  IF p_status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'SUCCESSION_STATUS_INVALID: %', p_status;
  END IF;

  UPDATE public.succession_candidates
     SET status = p_status, updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'SUCCESSION_CANDIDATE_NOT_FOUND'; END IF;

  RETURN p_status;
END $$;

-- ★ العطل ⑫: الإغلاق بدل الحذف
DROP FUNCTION IF EXISTS public.succession_position_close(UUID, TEXT);
CREATE FUNCTION public.succession_position_close(
  p_id UUID, p_status TEXT DEFAULT 'closed'
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'SUCCESSION_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_NOT_AUTHORIZED';
  END IF;
  IF p_status NOT IN ('active','closed') THEN
    RAISE EXCEPTION 'SUCCESSION_STATUS_INVALID: %', p_status;
  END IF;

  UPDATE public.critical_positions
     SET status = p_status, updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'SUCCESSION_POSITION_NOT_FOUND'; END IF;

  RETURN p_status;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ④ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE على كل دالة جديدة تلقائياً
--    (pg_default_acl) ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.succession_readiness_rank(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_readiness_rank(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_readiness_rank(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.succession_board(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_board(TEXT, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_board(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.succession_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.succession_position_upsert(UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_position_upsert(UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_position_upsert(UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.succession_candidate_nominate(UUID, UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_candidate_nominate(UUID, UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_candidate_nominate(UUID, UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.succession_candidate_set_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_candidate_set_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_candidate_set_status(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.succession_position_close(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.succession_position_close(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.succession_position_close(UUID, TEXT) TO authenticated;

COMMIT;
