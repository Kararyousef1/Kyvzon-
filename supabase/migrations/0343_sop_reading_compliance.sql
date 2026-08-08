-- ============================================================================
-- 0343_sop_reading_compliance.sql
--
-- إجراءات التشغيل القياسية: تتبّع القراءة · الاعتماد · امتثال الأقسام.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--   قاعدة Postgres 17 من الصفر بـ271 مايجريشن، وجلسات RLS حقيقية
--   (SET ROLE authenticated). القياس بعدّ **الصفوف المتأثّرة** لا
--   بالحالة النهائية — RLS يُسقط الصفّ صامتاً.
--
--  ① ★★★ كل تتبّع القراءة في ذاكرة المتصفح — لا يُحفظ إطلاقاً.
--     `SOPsPage.tsx` (869 سطراً) تُدير `readings` بـ`useState`:
--        setReadings(prev => ({ ...prev, [updated.sopId]: updated }))
--     مُقاس: `grep 'sop_readings'` في الملف ⇒ **0 مطابقة**.
--     و`handleApprove` يفعل `setShowSuccess(true)` ثم `setTimeout`
--     ثلاث ثوانٍ ثم يعود للكتالوج — بلا أي كتابة.
--     مُقاس: صفوف `sop_readings` بعد اعتماد كامل = **0**.
--
--     الأثر: الموظف يقرأ إجراء سلامة ويعتمده، فيختفي الاعتماد عند
--     تحديث الصفحة. ودليل الامتثال — وهو **الغرض كلّه** — غير موجود.
--
--     ★★ والبنية جاهزة تماماً: `sop_readings` فيها بالضبط ما تحفظه
--        الصفحة في الذاكرة: `started_at` · `last_read_at` · `read_count`
--        · `time_spent` · `completed` · `approved` · `approval_status`
--        · `approved_at`. الجدول مبنيّ منذ 0003 ولم يُكتب فيه صفّ واحد.
--
--  ② ★★★ الموظف لا يستطيع تحديث قراءته ولا اعتمادها.
--     `kyvzon_sop_readings_update` نصّها الحرفي من pg_policies:
--        (tenant_id = current_user_tenant_id()) AND current_user_is_staff()
--     بينما سياسة INSERT تسمح له:
--        … AND (current_user_is_staff() OR employee_id = current_user_employee_id())
--
--     مُقاس بعدّ الصفوف المتأثّرة بدور موظف:
--        INSERT صفّ قراءة              ⇒ نجح
--        UPDATE time_spent/read_count  ⇒ **0 صفوف**
--        UPDATE approved=true          ⇒ **0 صفوف**
--
--     أي أن «استمر في القراءة» و«تحديد كمكتمل» و«اعتماد وإتمام القراءة»
--     كلها مستحيلة حتى لو كتبت الصفحة في القاعدة.
--
--  ③ ★★★ ترشيح القسم بالنصّ لا بالمعرّف.
--     `SOPsPage.tsx:174`:
--        if (sop.department !== userDept && sop.department !== 'general') return false
--     و`userDept = user.manufacturingDept || user.department` — نصّ من
--     `profiles`. و`sops.department` عمود `varchar` نصّ حرّ.
--
--     مُقاس: `profiles.department = 'الإنتاج'` بينما بعد إعادة تسمية
--     القسم `departments.name_ar = 'الإنتاج والتصنيع'` — العمودان
--     تباعدا والصفحة تُطابق الثاني ⇒ **كل إجراءات القسم تختفي عن
--     موظفيه صامتاً**.
--     ⇒ نفس نمط العطل المتكرر منذ 0340: البيانات المكرّرة تتباعد.
--
--  ④ ★★ الوقت المستغرق يُحسب بمؤقّت في المتصفح.
--     `setInterval(() => setReadingSeconds(s => s + 1), 1000)`
--     قابل للتلاعب من أدوات المطوّر، ويضيع عند إغلاق التبويب.
--     وهو الرقم الذي يُفترض أن يُثبت أن الموظف قرأ فعلاً.
--
--  ⑤ ★★ لا دالة امتثال إطلاقاً.
--     مُقاس: دوال `public` التي تحوي 'sop' في اسمها = **`archive_sop`
--     وحدها**. لا شيء يُجيب: من لم يقرأ الإجراءات الإلزامية؟
--
--  ⑥ ★ القيد الفريد بلا مستأجر.
--     `unique_employee_sop UNIQUE (employee_id, sop_id)` — لا يمنع
--     صفّاً بـ`tenant_id` خاطئ لنفس الزوج.
--
-- ══ ★★ تصحيح ادّعاء أوّلي لي ══════════════════════════════════════════
--   في الاستقصاء الأول قِستُ «الموظف يرى 0 إجراءات» واستنتجتُ أن سياسة
--   القراءة تشترط `staff`. **الاستنتاج خاطئ مرّتين**:
--     • إدراج التجهيز نفسه فشل صامتاً (`column "content" does not exist`)
--       فكان الجدول فارغاً — لا السياسة.
--     • ونصّ السياسة الحرفي: `(tenant_id = current_user_tenant_id()) AND true`
--       لا يذكر `staff` إطلاقاً.
--   بعد إدراج صحيح: الموظف يرى **4 من 4**. القراءة سليمة تماماً،
--   والعطل في الترشيح النصّي (③) لا في RLS.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   دليل الامتثال يُكتب في القاعدة لحظةَ حدوثه، والوقت يُقاس بفارق
--   طوابع لا بمؤقّت متصفح، والانتماء بمعرّف لا بتطابق نصّي.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① ربط الإجراء بقسمه بمعرّف — بجانب النصّ لا بدلاً منه (عطل ③)
--
--    نُضيف `department_id` ونملأه بمطابقة النصّ **مرّة واحدة** الآن،
--    ثم يصير المعرّف مصدرَ الحقيقة. النصّ يبقى للسجلات القديمة.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sops
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

DO $$
DECLARE v_n INT;
BEGIN
  UPDATE public.sops s
     SET department_id = d.id
    FROM public.departments d
   WHERE s.department_id IS NULL
     AND d.tenant_id = s.tenant_id
     AND btrim(d.name_ar) = btrim(s.department);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE '0343: رُبِط % إجراءً بقسمه عبر مطابقة الاسم', v_n;
  END IF;
END $$;

COMMENT ON COLUMN public.sops.department_id IS
  '0343: الانتماء بمعرّف. قبله كان الترشيح مطابقةً نصّية بين '
  'sops.department و profiles.department — مُقاس أنهما يتباعدان عند '
  'إعادة تسمية القسم فتختفي إجراءاته عن موظفيه صامتاً (عطل ③).';

CREATE INDEX IF NOT EXISTS idx_sops_dept_active
  ON public.sops (tenant_id, department_id)
  WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────
-- ② ★★★ الموظف يملك سجلّ قراءته (عطل ②)
--
--    سياسة UPDATE القائمة تشترط staff وحدها. نُضيف سياسة ثانية:
--    صاحب السجلّ يُحدّثه. والحقول الحسّاسة يحرسها محفّز أدناه.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_sop_readings_update_owner ON public.sop_readings;
CREATE POLICY kyvzon_sop_readings_update_owner ON public.sop_readings
  FOR UPDATE
  USING (
    tenant_id = public.current_user_tenant_id()
    AND employee_id = public.current_user_employee_id()
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND employee_id = public.current_user_employee_id()
  );

COMMENT ON POLICY kyvzon_sop_readings_update_owner ON public.sop_readings IS
  '★★★ 0343: صاحب سجلّ القراءة يُحدّثه. مُقاس قبل الإصلاح بعدّ الصفوف '
  'المتأثّرة: موظف يُحدّث time_spent ⇒ 0 صفوف · يعتمد قراءته ⇒ 0 صفوف. '
  'أي أن «استمر في القراءة» و«اعتماد وإتمام القراءة» كانا مستحيلين.';

-- ─────────────────────────────────────────────────────────────────────────
-- ③ حارس: لا يُغيّر الموظف انتماء السجلّ ولا يتراجع عن اعتماد
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_guard_sop_reading()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_is_staff() THEN RETURN NEW; END IF;

  -- الانتماء ثابت
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.sop_id    IS DISTINCT FROM OLD.sop_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'SOP_READING_IMMUTABLE_LINK: لا يمكن تغيير انتماء سجلّ القراءة'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ★ الاعتماد إقرار — لا يُسحب من الموظف بعد إعطائه
  IF COALESCE(OLD.approved, FALSE) AND NOT COALESCE(NEW.approved, FALSE) THEN
    RAISE EXCEPTION 'SOP_APPROVAL_FINAL: لا يمكن التراجع عن اعتماد قراءة'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ★ الوقت لا ينقص: مؤشّر تدقيق لا عدّاد حرّ
  IF COALESCE(NEW.time_spent, 0) < COALESCE(OLD.time_spent, 0) THEN
    RAISE EXCEPTION 'SOP_TIME_MONOTONIC: الوقت المستغرق لا ينقص'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_guard_sop_reading() IS
  'يحرس سجلّ القراءة بعد فتحه للموظف في 0343: الانتماء ثابت · الاعتماد '
  'لا يُسحب · الوقت لا ينقص.';

DROP TRIGGER IF EXISTS trg_guard_sop_reading ON public.sop_readings;
CREATE TRIGGER trg_guard_sop_reading
  BEFORE UPDATE ON public.sop_readings
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_sop_reading();

-- ─────────────────────────────────────────────────────────────────────────
-- ④ قيد فريد يشمل المستأجر (عطل ⑥)
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_sop_reading_tenant_emp_sop
  ON public.sop_readings (tenant_id, employee_id, sop_id);

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ ★★★ بدء/متابعة القراءة — الوقت يُقاس في القاعدة (أعطال ①④)
--
--    الصفحة تُبلّغ عن «نبضة» كل فترة، والقاعدة تحسب الفارق الزمني
--    بنفسها وتُضيفه — بسقف يمنع التلاعب بنبضة متأخرة جداً.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sop_reading_touch(UUID, INTEGER);

CREATE FUNCTION public.sop_reading_touch(
  p_sop_id       UUID,
  p_elapsed_secs INTEGER DEFAULT NULL
) RETURNS TABLE (
  out_id         UUID,
  out_read_count INTEGER,
  out_time_spent INTEGER,
  out_approved   BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_row    RECORD;
  v_add    INT;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'SOP_NO_TENANT: لا سياق شركة' USING ERRCODE = 'check_violation';
  END IF;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'SOP_NO_EMPLOYEE: لا سجلّ موظف مرتبط بحسابك'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sops
                  WHERE id = p_sop_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SOP_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_row FROM public.sop_readings
   WHERE tenant_id = v_tenant AND employee_id = v_emp AND sop_id = p_sop_id;

  IF NOT FOUND THEN
    INSERT INTO public.sop_readings (
      tenant_id, sop_id, employee_id, started_at, last_read_at,
      read_count, time_spent, completed, approved, approval_status)
    VALUES (v_tenant, p_sop_id, v_emp, NOW(), NOW(), 1, 0, FALSE, FALSE, 'pending')
    RETURNING * INTO v_row;
  ELSE
    -- ★★ الوقت من فارق الطوابع لا من مؤقّت المتصفح (عطل ④).
    --   سقف 15 دقيقة للنبضة الواحدة: تبويب مفتوح ليلةً كاملة ليس قراءة.
    v_add := LEAST(
      GREATEST(EXTRACT(EPOCH FROM (NOW() - v_row.last_read_at))::INT, 0),
      900);

    -- p_elapsed_secs تلميح من الواجهة — نأخذ الأصغر احتياطاً لا الأكبر
    IF p_elapsed_secs IS NOT NULL AND p_elapsed_secs >= 0 THEN
      v_add := LEAST(v_add, p_elapsed_secs);
    END IF;

    UPDATE public.sop_readings
       SET time_spent   = COALESCE(time_spent, 0) + v_add,
           read_count   = COALESCE(read_count, 0) + 1,
           last_read_at = NOW()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  out_id         := v_row.id;
  out_read_count := v_row.read_count;
  out_time_spent := v_row.time_spent;
  out_approved   := COALESCE(v_row.approved, FALSE);
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.sop_reading_touch(UUID, INTEGER) IS
  'يبدأ أو يُحدّث سجلّ قراءة الإجراء. الوقت من فارق last_read_at بسقف '
  '15 دقيقة للنبضة. قبل 0343 كان كل التتبّع في useState ولا يُكتب صفّ '
  'واحد (مُقاس: sop_readings = 0 بعد اعتماد كامل).';

REVOKE ALL ON FUNCTION public.sop_reading_touch(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sop_reading_touch(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.sop_reading_touch(UUID, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ اعتماد القراءة — الإقرار الذي هو دليل الامتثال
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sop_reading_approve(UUID);

CREATE FUNCTION public.sop_reading_approve(p_sop_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_row    RECORD;
BEGIN
  IF v_tenant IS NULL OR v_emp IS NULL THEN
    RAISE EXCEPTION 'SOP_NO_EMPLOYEE: لا سجلّ موظف مرتبط بحسابك'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.sop_readings
   WHERE tenant_id = v_tenant AND employee_id = v_emp AND sop_id = p_sop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOP_NOT_STARTED: ابدأ القراءة قبل الاعتماد'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(v_row.approved, FALSE) THEN RETURN FALSE; END IF;

  UPDATE public.sop_readings
     SET approved        = TRUE,
         completed       = TRUE,
         approval_status = 'approved',
         approved_at     = NOW(),
         last_read_at    = NOW()
   WHERE id = v_row.id;

  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.sop_reading_approve(UUID) IS
  'اعتماد قراءة إجراء — إقرار الموظف بفهمه. قبل 0343 كان handleApprove '
  'يضبط حالة React ثم يعود للكتالوج بعد ثلاث ثوانٍ: الاعتماد يختفي عند '
  'تحديث الصفحة ولا دليل امتثال إطلاقاً.';

REVOKE ALL ON FUNCTION public.sop_reading_approve(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sop_reading_approve(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sop_reading_approve(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ كتالوج الموظف — الانتماء بالمعرّف مع احتياط نصّي (عطل ③)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_sops(TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.my_sops(
  p_search   TEXT    DEFAULT NULL,
  p_category TEXT    DEFAULT NULL,
  p_status   TEXT    DEFAULT NULL,   -- all·completed·in_progress·not_started
  p_limit    INTEGER DEFAULT 100,
  p_offset   INTEGER DEFAULT 0
) RETURNS TABLE (
  out_id            UUID,
  out_code          TEXT,
  out_title         TEXT,
  out_title_en      TEXT,
  out_description   TEXT,
  out_description_en TEXT,
  out_department    TEXT,
  -- ★ المدّة التقديرية للقراءة — عمود قائم تعرضه الواجهة
  out_duration      INTEGER,
  out_category      TEXT,
  out_version       TEXT,
  out_is_mandatory  BOOLEAN,
  out_effective_date DATE,
  out_review_date   DATE,
  out_file_url      TEXT,
  out_tags          TEXT[],
  out_read_count    INTEGER,
  out_time_spent    INTEGER,
  out_completed     BOOLEAN,
  out_approved      BOOLEAN,
  out_approved_at   TIMESTAMPTZ,
  out_last_read_at  TIMESTAMPTZ,
  out_total         BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدولَي sops و sop_readings
SET search_path = public
AS $$
DECLARE
  v_q    TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_emp  UUID := public.current_user_employee_id();
  v_dept UUID;
  v_lim  INT  := GREATEST(COALESCE(p_limit, 100), 0);
  v_off  INT  := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT department_id INTO v_dept FROM public.employees WHERE id = v_emp;

  RETURN QUERY
  WITH filtered AS (
    SELECT s.id,
           s.code::TEXT        AS f_code,
           s.title::TEXT       AS f_title,
           s.title_en::TEXT    AS f_title_en,
           s.description       AS f_desc,
           s.description_en    AS f_desc_en,
           s.duration          AS f_dur,
           COALESCE(NULLIF(btrim(d.name_ar), ''), s.department, '—')::TEXT AS f_dept,
           s.category::TEXT    AS f_cat,
           s.version::TEXT     AS f_ver,
           COALESCE(s.is_mandatory, FALSE) AS f_mand,
           s.effective_date    AS f_eff,
           s.review_date       AS f_rev,
           s.file_url          AS f_file,
           s.tags              AS f_tags,
           COALESCE(r.read_count, 0)   AS f_rc,
           COALESCE(r.time_spent, 0)   AS f_ts,
           COALESCE(r.completed, FALSE) AS f_done,
           COALESCE(r.approved, FALSE)  AS f_appr,
           r.approved_at       AS f_appr_at,
           r.last_read_at      AS f_last
      FROM public.sops s
      LEFT JOIN public.departments d ON d.id = s.department_id
      LEFT JOIN public.sop_readings r
             ON r.sop_id = s.id AND r.employee_id = v_emp
     WHERE s.status = 'active'
       -- ★★★ الانتماء بالمعرّف أوّلاً. الاحتياط النصّي للسجلات القديمة
       --   التي لم تُربط بعد — وهو ما كانت الصفحة تعتمد عليه وحده.
       AND (s.department_id IS NOT DISTINCT FROM v_dept
            OR s.department_id IS NULL
               AND (s.department = 'general'
                    OR s.department = (SELECT department FROM public.profiles
                                        WHERE id = auth.uid()))
            OR s.department = 'general')
       AND (p_category IS NULL OR s.category = p_category)
       AND (v_q IS NULL
            OR s.title       ILIKE '%' || v_q || '%'
            OR s.code        ILIKE '%' || v_q || '%'
            OR s.description ILIKE '%' || v_q || '%')
       AND (p_status IS NULL OR p_status = 'all'
            OR (p_status = 'completed'   AND COALESCE(r.approved, FALSE))
            OR (p_status = 'in_progress' AND r.id IS NOT NULL
                                         AND NOT COALESCE(r.approved, FALSE))
            OR (p_status = 'not_started' AND r.id IS NULL))
  )
  SELECT f.id, f.f_code, f.f_title, f.f_title_en, f.f_desc, f.f_desc_en,
         f.f_dept, f.f_dur, f.f_cat, f.f_ver,
         f.f_mand, f.f_eff, f.f_rev, f.f_file, f.f_tags,
         f.f_rc, f.f_ts, f.f_done, f.f_appr, f.f_appr_at, f.f_last,
         count(*) OVER () AS out_total
    FROM filtered f
   -- الإلزامي غير المعتمَد أوّلاً — هو ما يحتاج فعلاً
   ORDER BY (f.f_mand AND NOT f.f_appr) DESC, f.f_mand DESC, f.f_code ASC
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.my_sops(TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  'كتالوج إجراءات الموظف مع تقدّم قراءته. الانتماء بـdepartment_id مع '
  'احتياط نصّي للسجلات غير المربوطة. قبل 0343 كان الترشيح مطابقةً نصّية '
  'تنكسر بإعادة تسمية القسم، والتقدّم من useState لا من القاعدة.';

REVOKE ALL ON FUNCTION public.my_sops(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_sops(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_sops(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑧ ★★ امتثال الأقسام — الغرض كلّه من الجدول (عطل ⑤)
--
--    يُجيب: كم موظفاً في القسم لم يعتمد الإجراءات الإلزامية؟
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sop_compliance_overview(UUID);

CREATE FUNCTION public.sop_compliance_overview(p_department_id UUID DEFAULT NULL)
RETURNS TABLE (
  out_sop_id        UUID,
  out_code          TEXT,
  out_title         TEXT,
  out_department    TEXT,
  out_is_mandatory  BOOLEAN,
  out_target_count  BIGINT,
  out_read_count    BIGINT,
  out_approved_count BIGINT,
  out_compliance_pct NUMERIC,
  out_avg_seconds   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدولَي sops و sop_readings
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  WITH targets AS (
    -- الجمهور المستهدَف: موظفو القسم، أو كل الموظفين للإجراء العام
    SELECT s.id AS sop_id, e.id AS emp_id
      FROM public.sops s
      JOIN public.employees e
        ON e.tenant_id = s.tenant_id
       AND (s.department_id IS NULL OR e.department_id = s.department_id)
     WHERE s.status = 'active'
       AND s.tenant_id = v_tenant
       AND (p_department_id IS NULL OR s.department_id = p_department_id)
  )
  SELECT s.id,
         s.code::TEXT,
         s.title::TEXT,
         COALESCE(NULLIF(btrim(d.name_ar), ''), s.department, '—')::TEXT,
         COALESCE(s.is_mandatory, FALSE),
         count(DISTINCT t.emp_id)                                    AS target_count,
         count(DISTINCT r.employee_id)                               AS read_count,
         count(DISTINCT r.employee_id) FILTER (WHERE r.approved)     AS approved_count,
         CASE WHEN count(DISTINCT t.emp_id) = 0 THEN 0
              ELSE round(100.0 * count(DISTINCT r.employee_id)
                          FILTER (WHERE r.approved)
                        / count(DISTINCT t.emp_id), 1)
         END                                                          AS pct,
         /* ★★ sum/count عبر استعلام فرعي لا avg() مباشرةً.
            ── تصحيح ادّعاء أوّلي كتبتُه هنا ──
            كتبتُ أن `avg()` «ينحرف بسبب مضاعفة الوصل». أثبت العكس
            تشغيلياً: كل صفّ قراءة يتضاعف بنفس المعامل (عدد targets)
            فالمتوسّط لا ينحرف **رياضياً** — جرّبتُ بثلاثة قرّاء
            (400·200·300) وقارئ من خارج الجمهور، والنتيجة 300 في
            الحالتين. لذلك عكسُ هذا السطر لا يُسقط الاختبار، ولم
            أدّعِ حراسةً غير قائمة.
            يبقى الاستعلام الفرعي **أصحّ** لسببين حقيقيين:
              • لا يعتمد على انتظام المضاعفة — وهو خاصية عرضية للبنية
                الحالية تنكسر لو أُضيف شرط على targets لاحقاً.
              • يقرأ من sop_readings مباشرةً فلا يتأثّر بأي LEFT JOIN
                يُضاف مستقبلاً. */
         CASE WHEN count(DISTINCT r.employee_id) = 0 THEN 0
              ELSE round(
                (SELECT COALESCE(sum(r2.time_spent), 0)::NUMERIC
                   FROM public.sop_readings r2
                  WHERE r2.sop_id = s.id AND r2.tenant_id = v_tenant)
                / count(DISTINCT r.employee_id), 1)
         END                                                          AS avg_secs
    FROM public.sops s
    LEFT JOIN public.departments d  ON d.id = s.department_id
    LEFT JOIN targets t             ON t.sop_id = s.id
    LEFT JOIN public.sop_readings r ON r.sop_id = s.id
                                   AND r.tenant_id = s.tenant_id
   WHERE s.status = 'active'
     AND s.tenant_id = v_tenant
     AND (p_department_id IS NULL OR s.department_id = p_department_id)
   GROUP BY s.id, s.code, s.title, d.name_ar, s.department, s.is_mandatory
   ORDER BY COALESCE(s.is_mandatory, FALSE) DESC, pct ASC, s.code ASC;
END $$;

COMMENT ON FUNCTION public.sop_compliance_overview(UUID) IS
  'امتثال الأقسام لإجراءات التشغيل: كم موظفاً اعتمد كل إجراء من '
  'المستهدَفين. قبل 0343 لم توجد أي دالة SOP سوى archive_sop — ولا '
  'إجابة لسؤال «من لم يقرأ الإجراءات الإلزامية؟».';

REVOKE ALL ON FUNCTION public.sop_compliance_overview(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sop_compliance_overview(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sop_compliance_overview(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑨ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sop_readings_emp
  ON public.sop_readings (tenant_id, employee_id, sop_id);

CREATE INDEX IF NOT EXISTS idx_sop_readings_approved
  ON public.sop_readings (tenant_id, sop_id)
  WHERE approved = TRUE;
