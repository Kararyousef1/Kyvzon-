-- ============================================================================
-- 0333_profiles_cv_data_and_attendance_scope.sql
--
-- إصلاح عطلين ظهرا في المتصفح (أول أخطاء متصفح تُبلَّغ في هذا المشروع).
--
-- ─── العطل ① — profiles.cv_data غير موجود ────────────────────────────────
--
--   نصّ الخطأ الحرفي من متصفح المستخدم:
--     [42703] column profiles.cv_data does not exist
--     GET /rest/v1/profiles?select=id,full_name,…,cv_data → 400
--
--   مُثبَت على Postgres محلي مبنيّ من 262 مايجريشن:
--     SELECT count(*) FROM information_schema.columns
--      WHERE table_name='profiles' AND column_name='cv_data';  →  0
--
--   الكود يفترض وجوده في خمسة مواضع:
--     src/pages/employee/ProfilePage.tsx:176   يقرأ  cv_data
--     src/pages/employee/ProfilePage.tsx:248   يكتب  cv_data (حفظ السيرة)
--     src/pages/employee/ProfilePage.tsx:264   يمسح  cv_data (حذف السيرة)
--     src/pages/hr/TalentMarketPage.tsx:115    يقرأ  cv_data (سجل المؤهلات)
--     src/services/sdk/UserService.ts:54       يُصرّح به في نوع التحديث
--
--   ⇒ الموظف يبني سيرته الذاتية فيفشل الحفظ، ومسؤول الموارد البشرية
--     يفتح «سجل المؤهلات» فيرى شاشة خطأ. العمود هو الناقص لا الكود.
--
--   ★ الحل مايجريشن لا حذف الميزة: الميزة مبنيّة كاملة في الواجهة
--     (منشئ سيرة ذاتية + معاينة + بحث بالمهارات) وينقصها العمود وحده.
--
-- ─── العطل ② — نطاق قراءة سجلّات الحضور ──────────────────────────────────
--
--   نصّ الخطأ الحرفي:
--     BaseService.findAll failed: attendance_logs
--     error: invalid input syntax for type uuid: ""
--     GET /rest/v1/attendance_logs?…&employee_id=eq.&… → 400
--
--   مُثبَت محلياً بنصّه ذاته:
--     SELECT count(*) FROM attendance_logs WHERE employee_id = '';
--     ERROR:  invalid input syntax for type uuid: ""
--
--   السبب في الواجهة: `AttendanceAnalytics.tsx:157` استدعى
--     attendanceService.findLogsByEmployee('', { limit: 1000 })
--   أي مرّر معرّف موظف **فارغاً** ليعني «كل الموظفين». الدالة تبني
--   `employee_id=eq.` فيرفضه Postgres. ولو نجح لكان أسوأ: جلب ألف صفّ
--   كامل إلى المتصفح لعدّها هناك.
--
--   الإصلاح هنا: دالة قاعدة تُرجع بصمات اليوم **بنطاق المستأجر** بلا
--   الحاجة لمعرّف موظف، مع تجميع في القاعدة لا في المتصفح.
--   والإصلاح المقابل في الواجهة يستبدل الاستدعاء المعطوب بها.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① profiles.cv_data
--
--    JSONB لأن الشكل مرن: education[] · experience[] · skills[] ·
--    certifications[] · languages[] + حقول إضافية (CvData في
--    src/shared/types/index.ts يسمح بـ [key: string]: unknown).
--
--    DEFAULT '{}' لا NULL: الواجهة تستدعي Object.keys(cv_data) مباشرة
--    في TalentMarketPage.tsx:268، وNULL يُسقطها.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cv_data JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.cv_data IS
  'السيرة الذاتية للموظف: education · experience · skills · certifications '
  '· languages. يكتبها الموظف من ProfilePage ويقرأها سجل المؤهلات في '
  'بوابة الموارد البشرية. كان مفقوداً فأسقط الصفحتين بـ42703.';

-- ★ فهرس GIN: TalentMarketPage يبحث داخل skills و certifications.
--   بلا فهرس يصير البحث مسحاً كاملاً لكل ملفات الشركة.
CREATE INDEX IF NOT EXISTS idx_profiles_cv_data_gin
  ON public.profiles USING GIN (cv_data jsonb_path_ops);

-- ★ فهرس جزئي: «من لديه سيرة ذاتية» أكثر استعلام في سجل المؤهلات
CREATE INDEX IF NOT EXISTS idx_profiles_has_cv
  ON public.profiles (tenant_id)
  WHERE cv_data <> '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────
-- ② بصمات اليوم بنطاق المستأجر — بديل findLogsByEmployee('')
--
--    SECURITY INVOKER: attendance_logs محميّ بسياساته ونحترمها.
--    يُرجع صفّاً لكل ساعة (0–23) مع الأصفار — حذف الساعات الفارغة
--    يُزيح الرسم البياني (درس 0327).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.attendance_today_by_hour();

CREATE FUNCTION public.attendance_today_by_hour()
RETURNS TABLE(
  out_hour       INTEGER,
  out_total      INTEGER,
  out_punch_in   INTEGER,
  out_punch_out  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH hours AS (SELECT generate_series(0, 23) AS h),
  punches AS (
    SELECT EXTRACT(HOUR FROM a.punch_time)::INTEGER AS h,
           a.punch_type
      FROM public.attendance_logs a
     WHERE a.tenant_id = v_tenant
       AND a.punch_time >= date_trunc('day', NOW())
       AND a.punch_time <  date_trunc('day', NOW()) + INTERVAL '1 day'
  )
  SELECT hours.h,
         count(punches.h)::INTEGER,
         count(*) FILTER (WHERE punches.punch_type = 'in')::INTEGER,
         count(*) FILTER (WHERE punches.punch_type = 'out')::INTEGER
    FROM hours
    LEFT JOIN punches ON punches.h = hours.h
   GROUP BY hours.h
   ORDER BY hours.h;
END $$;

COMMENT ON FUNCTION public.attendance_today_by_hour() IS
  'توزيع بصمات اليوم على 24 ساعة بنطاق المستأجر. يستبدل '
  'findLogsByEmployee('''') الذي بنى employee_id=eq. فأسقط الصفحة بـ '
  '«invalid input syntax for type uuid». يُجمّع في القاعدة لا المتصفح.';

REVOKE ALL ON FUNCTION public.attendance_today_by_hour() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_today_by_hour() FROM anon;
GRANT EXECUTE ON FUNCTION public.attendance_today_by_hour() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ توزيع الورديات — الصباح · الظهيرة · المساء
--
--    الصفحة كانت تحسبه بـ filter ثلاث مرات على ألف صفّ في المتصفح.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.attendance_today_shift_split();

CREATE FUNCTION public.attendance_today_shift_split()
RETURNS TABLE(
  out_shift TEXT,
  out_label TEXT,
  out_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH shifts(code, label) AS (
    VALUES ('morning',   'الصباح (6–12)'),
           ('afternoon', 'الظهيرة (12–18)'),
           ('evening',   'المساء (18–6)')
  ),
  classified AS (
    SELECT CASE
             WHEN EXTRACT(HOUR FROM a.punch_time) >= 6
              AND EXTRACT(HOUR FROM a.punch_time) < 12 THEN 'morning'
             WHEN EXTRACT(HOUR FROM a.punch_time) >= 12
              AND EXTRACT(HOUR FROM a.punch_time) < 18 THEN 'afternoon'
             ELSE 'evening'
           END AS code
      FROM public.attendance_logs a
     WHERE a.tenant_id = v_tenant
       AND a.punch_time >= date_trunc('day', NOW())
       AND a.punch_time <  date_trunc('day', NOW()) + INTERVAL '1 day'
  )
  SELECT s.code::TEXT,
         s.label::TEXT,
         count(c.code)::INTEGER
    FROM shifts s
    LEFT JOIN classified c ON c.code = s.code
   GROUP BY s.code, s.label
   ORDER BY CASE s.code WHEN 'morning' THEN 1 WHEN 'afternoon' THEN 2 ELSE 3 END;
END $$;

COMMENT ON FUNCTION public.attendance_today_shift_split() IS
  'توزيع بصمات اليوم على ثلاث ورديات. الورديات الفارغة مُضمَّنة بصفر.';

REVOKE ALL ON FUNCTION public.attendance_today_shift_split() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_today_shift_split() FROM anon;
GRANT EXECUTE ON FUNCTION public.attendance_today_shift_split() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ سجل المؤهلات — بحث السير الذاتية بنطاق المستأجر
--
--    TalentMarketPage كان يستعلم عن profiles مباشرة بـ.select(). الآن
--    دالة تُرجع ما يلزم فقط وتحترم RLS.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_talent_profiles(TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.hr_talent_profiles(
  p_skill  TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id            UUID,
  out_full_name     TEXT,
  out_email         TEXT,
  out_phone         TEXT,
  out_department    TEXT,
  out_position      TEXT,
  out_profile_image TEXT,
  out_cv_data       JSONB,
  out_has_cv        BOOLEAN,
  out_skill_count   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  v_off    INTEGER := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id,
         COALESCE(p.full_name, '—')::TEXT,
         COALESCE(p.email, '')::TEXT,
         COALESCE(p.phone, '')::TEXT,
         COALESCE(p.department, '')::TEXT,
         COALESCE(p.position, '')::TEXT,
         COALESCE(p.profile_image, '')::TEXT,
         COALESCE(p.cv_data, '{}'::jsonb),
         (COALESCE(p.cv_data, '{}'::jsonb) <> '{}'::jsonb),
         COALESCE(
           jsonb_array_length(
             CASE WHEN jsonb_typeof(p.cv_data -> 'skills') = 'array'
                  THEN p.cv_data -> 'skills' ELSE '[]'::jsonb END
           ), 0)::INTEGER
    FROM public.profiles p
   WHERE p.tenant_id = v_tenant
     AND (
       p_skill IS NULL
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements_text(
                  CASE WHEN jsonb_typeof(p.cv_data -> 'skills') = 'array'
                       THEN p.cv_data -> 'skills' ELSE '[]'::jsonb END
                ) AS s(v)
          WHERE s.v ILIKE '%' || p_skill || '%'
       )
     )
   ORDER BY (COALESCE(p.cv_data, '{}'::jsonb) <> '{}'::jsonb) DESC,
            p.full_name ASC
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER) IS
  'سجل المؤهلات: ملفات الشركة مع سيرها الذاتية وبحث بالمهارة. '
  'من لديه سيرة أولاً. SECURITY INVOKER — يحترم RLS جدول profiles.';

REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ بصمات آخر سبعة أيام — لرسم الأسبوع
--
--    الصفحة كانت تحسبه من نفس المصفوفة المعطوبة (`logs`) التي جاءت من
--    `findLogsByEmployee('')`. ولمّا كان الاستدعاء يسقط، كان الرسم
--    الأسبوعي يبقى أصفاراً دائماً.
--
--    ★ `late` و`absent` غير محسوبَين هنا عمداً: يحتاجان مقارنة بجدول
--      الورديات (`shift_timings`)، وأي اشتقاق بنسبة ثابتة يكون رقماً
--      مُختلَقاً — وهذا ما أُزيل أصلاً في 0327.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.attendance_last_7_days();

CREATE FUNCTION public.attendance_last_7_days()
RETURNS TABLE(
  out_day     DATE,
  out_total   INTEGER,
  out_present INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH days AS (
    SELECT (current_date - offs)::DATE AS d
      FROM generate_series(6, 0, -1) AS offs
  ),
  punches AS (
    -- ★ ملاحظة صدق: شرطا النافذة الزمنية أدناه **لا يغيّران النتيجة**
    --   — الـLEFT JOIN على `days` (المبنيّة من generate_series) يُقصي
    --   أي يوم خارج السبعة بنيوياً. أُثبت ذلك بتوسيع النافذة إلى
    --   9999 يوماً: المخرَج مطابق حرفياً (1 مقابل 1).
    --   يبقيان لأنهما يُقلّصان الصفوف الممسوحة قبل الضمّ (أداء)، لا
    --   لأنهما يحرسان الصحّة. لذلك لا يوجد تأكيد يسقط عند عكسهما —
    --   وادّعاء وجوده كان سيكون تأكيداً ميتاً.
    SELECT a.punch_time::DATE AS d, a.employee_id
      FROM public.attendance_logs a
     WHERE a.tenant_id = v_tenant
       AND a.punch_time >= current_date - INTERVAL '6 days'
       AND a.punch_time <  current_date + INTERVAL '1 day'
  )
  SELECT days.d,
         count(punches.d)::INTEGER,
         count(DISTINCT punches.employee_id)::INTEGER
    FROM days
    LEFT JOIN punches ON punches.d = days.d
   GROUP BY days.d
   ORDER BY days.d;
END $$;

COMMENT ON FUNCTION public.attendance_last_7_days() IS
  'بصمات آخر سبعة أيام: الإجمالي وعدد الموظفين المتمايزين. الأيام '
  'الفارغة مُضمَّنة بصفر. late/absent غير محسوبَين — يحتاجان الورديات.';

REVOKE ALL ON FUNCTION public.attendance_last_7_days() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_last_7_days() FROM anon;
GRANT EXECUTE ON FUNCTION public.attendance_last_7_days() TO authenticated;
