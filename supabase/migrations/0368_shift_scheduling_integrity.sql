-- ════════════════════════════════════════════════════════════════════════
--  0368 — سلامة جدولة الورديات
--  المرحلة 4 — بوابة الموارد البشرية · hr/ShiftSchedulingPage.tsx (193 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسباران _probe_0368.sql و _probe_0368b.sql — قاعدة نظيفة،    │
--  │   296 مايجريشناً، صفر فشل)                                       │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★★ **زرُّ «تعيين وردية» لم يعمل يوماً.**
--
--     `shift_assignments.schedule_id` هو **NOT NULL بلا افتراضيّ**،
--     والصفحة لا ترسله إطلاقاً. نصُّ ما ترسله حرفياً (السطر 60):
--        upsertAssignment({ employee_id, shift_type, shift_date, notes })
--
--     PROBE_1 بمحاكاةٍ حرفية لهذا النداء:
--        ★★★★ رُفض: null value in column "schedule_id" of relation
--             "shift_assignments" violates not-null constraint
--
--     ⇒ **كلُّ ضغطةٍ على «تعيين» كانت تُخرج رسالة خطأ**. الصفحة
--       لوحةُ عرضٍ لجدولٍ لا سبيل إلى ملئه.
--
--     ★★ وأسوأ: العمود يشير إلى **جدولٍ غير موجود**:
--        `information_schema.tables` حيث الاسم في
--        (shift_schedules · schedules · work_schedules) = **صفر**.
--        فهو ليس مفتاحاً أجنبياً معطوباً — بل عمودٌ يتيمٌ تماماً.
--
--  ② ★★★★ **مفردات الصفحة الثلاث غير موجودة في المنظومة.**
--
--     الصفحة تُبرمج ثلاث ورديات بالنصّ: 'صباحي' · 'مسائي' · 'ليلي'
--     (السطر 13 وSelect في السطر 170). والنظام يعرف أربع ورديات
--     مُعرَّفة في `structure_shifts` بأسماء **مختلفة**:
--
--        code      | name_ar            | start  | end
--        ----------|--------------------|--------|-------
--        morning   | الوردية الصباحية    | 08:00  | 16:00
--        evening   | الوردية المسائية    | 16:00  | 00:00
--        night     | الوردية الليلية     | 00:00  | 08:00
--        flexible  | وردية مرنة          | (null) | (null)
--
--     PROBE_8: صفوف `structure_shifts` حيث `name_ar = 'صباحي'`
--              أو 'مسائي' أو 'ليلي' = **صفر · صفر · صفر**.
--
--     ⇒ الجدولة **معزولةٌ عن تعريف الورديات**: أوقاتُ الدوام
--       مكتوبةٌ في نصّ الواجهة (`08:00 - 16:00`) لا مقروءةٌ من
--       القاعدة، و«وردية مرنة» لا سبيل إلى إسنادها إطلاقاً.
--       ودالة `shift_catalog()` موجودةٌ منذ 0318 ولا تستعملها الصفحة.
--
--  ③ ★★★ **`employee_id` بلا مفتاح أجنبيّ.**
--     PROBE_2: وردية لموظف `ffffffff-…` معدوم ⇒ **قُبِلت**.
--
--  ④ ★★★ **العبور بين المستأجرين.**
--     PROBE_3: `tenant_id = ألف` مع موظفٍ من **باء** ⇒ قُبِل.
--
--  ⑤ ★★★ **`tenant_id` قابلٌ للعدم.**
--     PROBE_4: وردية يتيمة ⇒ قُبِلت. وكلُّ سياسات RLS تبدأ بـ
--     `tenant_id = current_user_tenant_id()` و`NULL = x` يُعطي NULL
--     ⇒ الصفّ يختفي عن الجميع.
--
--  ⑥ ★★★ **`shift_type` بلا CHECK.**
--     PROBE_5: `shift_type = 'وردية_مخترعة'` ⇒ قُبِل.
--     والصفحة (السطر 82) `shiftConfig[shift]` تُعطي `undefined`
--     ⇒ الخلية تعرض شارةً فارغة بلا أيقونةٍ ولا لون.
--
--  ⑦ ★★ **`assigned_by` بلا FK ولا ملء.**
--     PROBE_9: مُسنِدٌ معدوم قُبِل · وصفوفٌ بلا مُسنِد = **4 من 4**.
--     ⇒ لا يُعرف من جدول الموظف على الوردية الليلية.
--
--  ⑧ ★★★ **وردياتٌ في ماضٍ سحيقٍ ومستقبلٍ سحيق.**
--     PROBE_10: وردية `CURRENT_DATE - 3000` (2018) وأخرى
--     `+ 3000` (2034) ⇒ **قُبِلتا**.
--
--  ⑨ ★★★★ **الجدولة تتجاهل الإجازات المعتمدة.**
--     PROBE_B: إجازةٌ بحالة «موافق» من 2026-08-08 إلى 2026-08-13،
--     ثم وردية يوم **2026-08-10** ⇒ **قُبِلت**.
--     ⇒ موظفٌ في إجازةٍ معتمدة مجدولٌ على وردية. والحضور سيسجّله
--       غائباً، والراتب سيُخصم.
--
--  ⑩ ★★★ **لا حدَّ أدنى للراحة بين الورديات.**
--     PROBE_D: «ليلي» (00:00–08:00) يوم س، ثم «صباحي» (08:00) يوم
--     س+1 ⇒ قُبِلتا. الموظف يخرج الثامنة صباحاً ويدخل الثامنة صباحاً:
--     **صفر ساعة راحة**. وقيود الجدول = **صفر** (PROBE_12).
--
--  ⑪ ★★ **الحذف النهائيّ مسموح.**
--     RLS_2 بدور `authenticated` حقيقيّ: «HR حذفت 1 وردية نهائياً».
--
--  ⑫ ★★ **`employees.shift_code` عمودٌ ميّتٌ عملياً.**
--     PROBE_13: موظفون بكود وردية = **0 من 4** · ودوالٌ تستعمله = 6.
--     ⇒ ستُّ دوالٍ تقرأ عموداً لا يُملأ من أيّ واجهة.
--
--  ★ ملاحظةٌ منهجية: الفهرس `idx_unique_employee_shift_date` على
--    `(employee_id, shift_date)` **يعمل بحقّ** (PROBE_C: منع وردِيَّتين
--    في اليوم نفسه). لا يحتاج `tenant_id` لأن `employees.id` فريدٌ
--    عالمياً ولا يقع في مستأجرَين. تُرك كما هو.
--
--  ★ وأعطال الصفحة نفسها (تُعالَج في إعادة الكتابة):
--    ⑬ `useState<any[]>([])` مرّتين · `(a: any)` في المُرشِّح.
--    ⑭ جلبُ **كل** الورديات ثم ترشيحها **في المتصفّح** بـ`.filter()`.
--    ⑮ `orderBy: 'full_name_ar'` على عمودٍ معدومٍ لكل موظف.
--    ⑯ `getShiftForDay` بحثٌ خطّيّ داخل حلقتين ⇒ O(موظفين × 7 × ورديات).
--    ⑰ لا زرَّ حذفٍ ولا تعديلٍ للوردية المُسندة — إسنادٌ بلا تراجع.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف البيانات القائمة
-- ═══════════════════════════════════════════════════════════════════

-- ★ توحيد المفردات: أسماء الصفحة القديمة ← أكواد structure_shifts
UPDATE public.shift_assignments SET shift_type = 'morning'
 WHERE shift_type IN ('صباحي','الوردية الصباحية');
UPDATE public.shift_assignments SET shift_type = 'evening'
 WHERE shift_type IN ('مسائي','الوردية المسائية');
UPDATE public.shift_assignments SET shift_type = 'night'
 WHERE shift_type IN ('ليلي','الوردية الليلية');
UPDATE public.shift_assignments SET shift_type = 'flexible'
 WHERE shift_type IN ('مرن','وردية مرنة');
-- ما بقي خارج المفردات الأربع يُردّ إلى المرنة (لا نحذف صفّاً)
UPDATE public.shift_assignments SET shift_type = 'flexible'
 WHERE shift_type NOT IN ('morning','evening','night','flexible');

-- صفوفٌ يتيمة: تُنسب إلى مستأجر موظفها
UPDATE public.shift_assignments a
   SET tenant_id = e.tenant_id
  FROM public.employees e
 WHERE a.tenant_id IS NULL AND e.id = a.employee_id AND e.tenant_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
--  ① ★★★★ العطل ①: schedule_id — عمودٌ يتيمٌ يشير إلى جدولٍ معدوم
--
--  ★ لا نحذفه (قد تعتمده شيفرةٌ قديمة) بل نُعطيه افتراضيّاً فيكفّ
--    عن كسر كل إدراج. وهو من الآن **معرّفُ دفعة الجدولة**: كلُّ
--    ورديات أسبوعٍ تُسنَد معاً تحمل المعرّف نفسه.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.shift_assignments
  ALTER COLUMN schedule_id SET DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.shift_assignments.schedule_id IS
  'معرّف دفعة الجدولة. كان NOT NULL بلا افتراضيّ ويشير إلى جدولٍ '
  'غير موجود ⇒ كلُّ إدراجٍ من الواجهة يفشل. أُعطي افتراضيّاً في 0368.';

-- ═══════════════════════════════════════════════════════════════════
--  ② أعمدة دورة الحياة
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS status         VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by   UUID,
  ADD COLUMN IF NOT EXISTS cancel_reason  TEXT;

COMMENT ON COLUMN public.shift_assignments.status IS
  'scheduled (مجدولة) · cancelled (ملغاة). الحذف النهائيّ ممنوع — 0368';

-- ═══════════════════════════════════════════════════════════════════
--  ③ tenant_id NOT NULL (العطل ⑤)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE v_orphans INTEGER;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.shift_assignments WHERE tenant_id IS NULL;
  IF v_orphans = 0 THEN
    ALTER TABLE public.shift_assignments ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE '0368: % وردية يتيمة — تُرك tenant_id قابلاً للعدم', v_orphans;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ④ المفاتيح الأجنبية المركَّبة (الأعطال ③/④/⑦)
--     ★★★ FK مركَّب (id, tenant_id) — هو الذي يمنع العبور.
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.shift_assignments'::regclass
      AND conname='fk_shift_employee_tenant') THEN
    ALTER TABLE public.shift_assignments ADD CONSTRAINT fk_shift_employee_tenant
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.shift_assignments'::regclass
      AND conname='fk_shift_assigner_tenant') THEN
    ALTER TABLE public.shift_assignments ADD CONSTRAINT fk_shift_assigner_tenant
      FOREIGN KEY (assigned_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ القيود (الأعطال ⑥/⑪)
-- ═══════════════════════════════════════════════════════════════════

-- ★★★★ العطل ②: المفردات الأربع من `structure_shifts` لا نصُّ الواجهة
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.shift_assignments'::regclass
      AND conname='chk_shift_type_vocab') THEN
    ALTER TABLE public.shift_assignments ADD CONSTRAINT chk_shift_type_vocab
      CHECK (shift_type IN ('morning','evening','night','flexible'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.shift_assignments'::regclass
      AND conname='chk_shift_status') THEN
    ALTER TABLE public.shift_assignments ADD CONSTRAINT chk_shift_status
      CHECK (status IN ('scheduled','cancelled'));
  END IF;
END $$;

-- الإلغاء يستلزم سبباً وفاعلاً ولحظة
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.shift_assignments'::regclass
      AND conname='chk_shift_cancelled_complete') THEN
    ALTER TABLE public.shift_assignments ADD CONSTRAINT chk_shift_cancelled_complete
      CHECK (
        (status <> 'cancelled' AND cancelled_at IS NULL
           AND cancelled_by IS NULL AND cancel_reason IS NULL)
        OR (status = 'cancelled' AND cancelled_at IS NOT NULL
           AND cancelled_by IS NOT NULL
           AND btrim(COALESCE(cancel_reason,'')) <> '')
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ فهارس
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_shift_tenant_date
  ON public.shift_assignments (tenant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_batch
  ON public.shift_assignments (schedule_id);

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ ★★★★ محفّز الحراسة (الأعطال ⑧/⑨/⑩)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_shift_assignment_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- ★★★ توقيت بغداد صراحةً — الخادم Etc/UTC وبغداد UTC+3
  v_today   DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_leave   RECORD;
  v_prev    TEXT;
  v_next    TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    NEW.created_at  := OLD.created_at;
  END IF;

  -- ★ الملغاة لا تُحرَس: لا معنى لفحص إجازةٍ أو راحةٍ لوردية أُلغيت
  IF NEW.status = 'cancelled' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- ── العطل ⑧: نافذةٌ زمنية معقولة ──────────────────────────────
  --   ★ CHECK لا يصلح: CURRENT_DATE غير IMMUTABLE.
  IF NEW.shift_date < v_today - 90 THEN
    RAISE EXCEPTION 'SHIFT_DATE_TOO_OLD: لا تُجدول وردية قبل تسعين يوماً من اليوم (% مقابل %)',
      NEW.shift_date, v_today;
  END IF;
  IF NEW.shift_date > v_today + 365 THEN
    RAISE EXCEPTION 'SHIFT_DATE_TOO_FAR: لا تُجدول وردية بعد سنةٍ من اليوم (% مقابل %)',
      NEW.shift_date, v_today;
  END IF;

  -- ── ★★★★ العطل ⑨: إجازةٌ معتمدة تُغطّي اليوم ─────────────────
  SELECT l.date_from, l.date_to INTO v_leave
    FROM public.leaves l
   WHERE l.employee_id = NEW.employee_id
     AND l.tenant_id   = NEW.tenant_id
     AND l.status      = 'موافق'
     AND NEW.shift_date BETWEEN l.date_from AND l.date_to
   ORDER BY l.date_from, l.id
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SHIFT_ON_APPROVED_LEAVE: الموظف في إجازةٍ معتمدة من % إلى % — لا تُجدول وردية يوم %',
      v_leave.date_from, v_leave.date_to, NEW.shift_date;
  END IF;

  -- ── ★★★ العطل ⑩: حدُّ الراحة بين الورديات ────────────────────
  --   «ليلي» ينتهي 08:00 من اليوم التالي. فـ«صباحي» في اليوم التالي
  --   (يبدأ 08:00) = صفر ساعة راحة. وكذلك «مسائي» ينتهي 00:00 ثم
  --   «ليلي» في اليوم نفسه — يمنعه الفهرس الفريد أصلاً.
  --   ★ الحدّ المفروض هنا: لا صباحية بعد ليلية مباشرةً.
  SELECT s.shift_type INTO v_prev
    FROM public.shift_assignments s
   WHERE s.employee_id = NEW.employee_id
     AND s.tenant_id   = NEW.tenant_id
     AND s.shift_date  = NEW.shift_date - 1
     AND s.status      = 'scheduled'
     AND s.id IS DISTINCT FROM NEW.id
   LIMIT 1;

  IF v_prev = 'night' AND NEW.shift_type = 'morning' THEN
    RAISE EXCEPTION 'SHIFT_NO_REST: وردية ليلية يوم % تنتهي الثامنة صباحاً — لا تُسند صباحية يوم %',
      NEW.shift_date - 1, NEW.shift_date;
  END IF;

  -- ★ والاتّجاه المعاكس: إسنادُ ليليةٍ اليوم وغداً صباحية موجودة
  SELECT s.shift_type INTO v_next
    FROM public.shift_assignments s
   WHERE s.employee_id = NEW.employee_id
     AND s.tenant_id   = NEW.tenant_id
     AND s.shift_date  = NEW.shift_date + 1
     AND s.status      = 'scheduled'
     AND s.id IS DISTINCT FROM NEW.id
   LIMIT 1;

  IF NEW.shift_type = 'night' AND v_next = 'morning' THEN
    RAISE EXCEPTION 'SHIFT_NO_REST: وردية صباحية مُسندةٌ يوم % — لا تُسند ليلية يوم %',
      NEW.shift_date + 1, NEW.shift_date;
  END IF;

  -- ★ العطل ⑦: المُسنِد يُملأ آلياً
  IF NEW.assigned_by IS NULL THEN
    NEW.assigned_by := auth.uid();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_shift_assignment_guard ON public.shift_assignments;
CREATE TRIGGER trg_shift_assignment_guard
  BEFORE INSERT OR UPDATE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_shift_assignment_guard();

-- ★★ العطل ⑪: منع الحذف النهائيّ
CREATE OR REPLACE FUNCTION public.tg_block_shift_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SHIFT_DELETE_BLOCKED: الوردية المُسندة لا تُحذف — استعمل shift_cancel() (id=%)',
    OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_block_shift_delete ON public.shift_assignments;
CREATE TRIGGER trg_block_shift_delete
  BEFORE DELETE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_shift_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ اللوح الأسبوعيّ (العطلان ⑭/⑯)
--     ★ استعلامٌ واحد بحدود التاريخ بدل جلب كل شيء وترشيحه بالمتصفّح.
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.shift_week_board(DATE, INTEGER);
CREATE FUNCTION public.shift_week_board(
  p_week_start DATE    DEFAULT NULL,
  p_days       INTEGER DEFAULT 7
)
RETURNS TABLE (
  id             UUID,
  employee_id    UUID,
  employee_name  TEXT,
  employee_code  TEXT,
  shift_date     DATE,
  shift_type     TEXT,
  shift_name_ar  TEXT,
  start_time     TEXT,
  end_time       TEXT,
  status         TEXT,
  notes          TEXT,
  assigned_by    UUID,
  assigner_name  TEXT,
  is_past        BOOLEAN,
  on_leave       BOOLEAN,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_from  DATE := COALESCE(p_week_start, v_today);
  v_days  INTEGER := LEAST(GREATEST(COALESCE(p_days, 7), 1), 62);
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.employee_id,
    -- ★ العطل ⑮: full_name_ar معدومٌ بنيوياً ⇒ نُركّب الاسم
    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,
    e.employee_code::TEXT,
    a.shift_date,
    a.shift_type::TEXT,
    -- ★★★★ العطل ②: الاسم والأوقات من `structure_shifts` لا من نصّ الواجهة
    COALESCE(NULLIF(btrim(s.name_ar), ''), a.shift_type)::TEXT,
    to_char(s.start_time, 'HH24:MI')::TEXT,
    to_char(s.end_time,   'HH24:MI')::TEXT,
    a.status::TEXT,
    a.notes::TEXT,
    a.assigned_by,
    COALESCE(NULLIF(btrim(pa.full_name), ''), NULL)::TEXT,
    (a.shift_date < v_today),
    -- ★★★★ العطل ⑨ مرئيّاً: تعارضٌ مع إجازةٍ معتمدة (لصفوفٍ سابقة للقيد)
    EXISTS (SELECT 1 FROM public.leaves l
             WHERE l.employee_id = a.employee_id
               AND l.tenant_id   = a.tenant_id
               AND l.status      = 'موافق'
               AND a.shift_date BETWEEN l.date_from AND l.date_to),
    a.created_at
  FROM public.shift_assignments a
  LEFT JOIN public.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
  LEFT JOIN public.profiles pa ON pa.id = a.assigned_by
  -- ★ قوالب الورديات عامّةٌ (tenant_id IS NULL) أو خاصّةٌ بالمستأجر
  LEFT JOIN public.structure_shifts s
         ON s.code = a.shift_type
        AND (s.tenant_id IS NULL OR s.tenant_id = a.tenant_id)
  WHERE a.shift_date >= v_from
    AND a.shift_date <  v_from + v_days
  -- ★★★ ترتيبٌ حتميّ: التاريخ ثم الاسم ثم id (created_at قد يتساوى)
  ORDER BY a.shift_date, e.employee_code NULLS LAST, a.id;
END $$;

DROP FUNCTION IF EXISTS public.shift_week_summary(DATE, INTEGER);
CREATE FUNCTION public.shift_week_summary(
  p_week_start DATE    DEFAULT NULL,
  p_days       INTEGER DEFAULT 7
)
RETURNS TABLE (
  total          INTEGER,
  scheduled      INTEGER,
  cancelled      INTEGER,
  morning        INTEGER,
  evening        INTEGER,
  night          INTEGER,
  flexible       INTEGER,
  covered_days   INTEGER,
  staffed        INTEGER,
  unstaffed      INTEGER,
  leave_conflict INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_from  DATE := COALESCE(p_week_start, v_today);
  v_days  INTEGER := LEAST(GREATEST(COALESCE(p_days, 7), 1), 62);
BEGIN
  RETURN QUERY
  WITH win AS (
    SELECT a.* FROM public.shift_assignments a
     WHERE a.shift_date >= v_from AND a.shift_date < v_from + v_days
  )
  SELECT
    (SELECT count(*) FROM win)::INTEGER,
    (SELECT count(*) FROM win WHERE status = 'scheduled')::INTEGER,
    (SELECT count(*) FROM win WHERE status = 'cancelled')::INTEGER,
    (SELECT count(*) FROM win WHERE shift_type='morning'  AND status='scheduled')::INTEGER,
    (SELECT count(*) FROM win WHERE shift_type='evening'  AND status='scheduled')::INTEGER,
    (SELECT count(*) FROM win WHERE shift_type='night'    AND status='scheduled')::INTEGER,
    (SELECT count(*) FROM win WHERE shift_type='flexible' AND status='scheduled')::INTEGER,
    (SELECT count(DISTINCT shift_date) FROM win WHERE status='scheduled')::INTEGER,
    -- موظفون لهم وردية في النافذة
    (SELECT count(DISTINCT employee_id) FROM win WHERE status='scheduled')::INTEGER,
    -- ★ وموظفون نشطون بلا أيّ وردية — الفجوة الحقيقية في التغطية
    (SELECT count(*) FROM public.employees e
      WHERE COALESCE(e.is_active, TRUE)
        AND NOT EXISTS (SELECT 1 FROM win w
                         WHERE w.employee_id = e.id AND w.status='scheduled'))::INTEGER,
    -- ★★★★ العطل ⑨ مقروءاً
    (SELECT count(*) FROM win w
      WHERE w.status='scheduled'
        AND EXISTS (SELECT 1 FROM public.leaves l
                     WHERE l.employee_id = w.employee_id
                       AND l.tenant_id   = w.tenant_id
                       AND l.status      = 'موافق'
                       AND w.shift_date BETWEEN l.date_from AND l.date_to))::INTEGER;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑨ ★★★★ الإسناد — العطل ① بعينه
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.shift_assign(UUID, TEXT, DATE, TEXT, UUID);
CREATE FUNCTION public.shift_assign(
  p_employee_id UUID,
  p_shift_type  TEXT,
  p_shift_date  DATE,
  p_notes       TEXT DEFAULT NULL,
  p_batch       UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'SHIFT_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SHIFT_NOT_STAFF: جدولة الورديات للموارد البشرية والإدارة فقط';
  END IF;
  IF p_shift_type NOT IN ('morning','evening','night','flexible') THEN
    RAISE EXCEPTION 'SHIFT_BAD_TYPE: نوع وردية غير معروف %', p_shift_type;
  END IF;
  IF p_shift_date IS NULL THEN
    RAISE EXCEPTION 'SHIFT_DATE_REQUIRED: تاريخ الوردية مطلوب';
  END IF;

  -- ★★★★ العطل ①: `schedule_id` يُملأ هنا صراحةً — كان يكسر كل إدراج
  INSERT INTO public.shift_assignments
    (tenant_id, schedule_id, employee_id, shift_type, shift_date, notes, assigned_by)
  VALUES (v_tenant, COALESCE(p_batch, gen_random_uuid()), p_employee_id,
          p_shift_type, p_shift_date,
          NULLIF(btrim(COALESCE(p_notes,'')),''), auth.uid())
  -- ★ إعادة الإسناد لليوم نفسه تُحدّث بدل أن ترمي (الفهرس الفريد)
  ON CONFLICT (employee_id, shift_date) DO UPDATE
     SET shift_type = EXCLUDED.shift_type,
         notes      = EXCLUDED.notes,
         status     = 'scheduled',
         cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑩ الإلغاء — بديل الحذف (العطل ⑪)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.shift_cancel(UUID, TEXT);
CREATE FUNCTION public.shift_cancel(p_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_status TEXT;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'SHIFT_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SHIFT_NOT_STAFF: الإلغاء للموارد البشرية والإدارة فقط';
  END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'SHIFT_CANCEL_REASON_REQUIRED: سبب الإلغاء مطلوب';
  END IF;

  SELECT status INTO v_status FROM public.shift_assignments
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND: الوردية غير موجودة';
  END IF;
  IF v_status = 'cancelled' THEN RETURN FALSE; END IF;

  UPDATE public.shift_assignments
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = btrim(p_reason),
         updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑪ ★★ كشفُ التعارضات القائمة (صفوفٌ سابقةٌ للقيد)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.shift_leave_conflicts(DATE, INTEGER);
CREATE FUNCTION public.shift_leave_conflicts(
  p_from DATE    DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  assignment_id UUID,
  employee_id   UUID,
  employee_name TEXT,
  shift_date    DATE,
  shift_type    TEXT,
  leave_from    DATE,
  leave_to      DATE
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_from  DATE := COALESCE(p_from, v_today);
  v_days  INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 366);
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.employee_id,
    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,
    a.shift_date, a.shift_type::TEXT, l.date_from, l.date_to
  FROM public.shift_assignments a
  JOIN public.leaves l
    ON l.employee_id = a.employee_id
   AND l.tenant_id   = a.tenant_id
   AND l.status      = 'موافق'
   AND a.shift_date BETWEEN l.date_from AND l.date_to
  LEFT JOIN public.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
  WHERE a.status = 'scheduled'
    AND a.shift_date >= v_from
    AND a.shift_date <  v_from + v_days
  ORDER BY a.shift_date, a.id;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑫ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE تلقائياً (pg_default_acl)
--    ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.shift_week_board(DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_week_board(DATE, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_week_board(DATE, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.shift_week_summary(DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_week_summary(DATE, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_week_summary(DATE, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.shift_assign(UUID, TEXT, DATE, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_assign(UUID, TEXT, DATE, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_assign(UUID, TEXT, DATE, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.shift_cancel(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_cancel(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_cancel(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.shift_leave_conflicts(DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_leave_conflicts(DATE, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_leave_conflicts(DATE, INTEGER) TO authenticated;

COMMIT;
