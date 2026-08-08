-- ============================================================================
-- 0354_talent_market_privacy.sql
--
-- بوابة الموارد البشرية — المرحلة 4: `hr/TalentMarketPage` (467 سطراً).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً على Postgres محلي (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطل ① — ★★★ كل موظف يقرأ سِيَر زملائه كاملةً ═══════════════════════
--
--   `hr_talent_profiles` (من 0333) تُرجع لكل مُستدعٍ:
--     full_name · email · phone · department · position · **cv_data كاملاً**
--
--   وهي **ليست** `SECURITY DEFINER` — فتخضع لـRLS. لكن سياسة القراءة
--   على `profiles` هي:
--     kyvzon_profiles_select : (tenant_id = current_user_tenant_id())
--   أي **كل عضو في المستأجر** بلا تمييز دور.
--
--   ولا حارس دور داخل الدالة إطلاقاً — لا `current_user_is_staff()`
--   ولا شيء. و`GRANT EXECUTE … TO authenticated`.
--
--   مُثبَت بدور `authenticated` حقيقي (موظف عادي `role='employee'`):
--
--     SET request.jwt.claim.sub = '<موظف عادي>';
--     SET ROLE authenticated;
--     SELECT … FROM public.hr_talent_profiles();
--
--     ⇒ المدير التنفيذي | هاتف=0779999999 |
--       سيرة={"summary":"سيرة سرّية","skills":[…],
--             "salary_expectation":"سرّي"}
--
--   ⇒ **أيّ موظف يقرأ السيرة الذاتية الكاملة للمدير التنفيذي**: الملخّص
--     والمهارات و«توقّعات الراتب» ورقم الهاتف الشخصي.
--
--   هذه الصفحة اسمها «سجل مؤهلات وكفاءات الموظفين» وهي أداة **إدارة
--   مواهب** — لا دليل هاتف عام. وسيرة الموظف الذاتية من أخصّ بياناته:
--   تحوي تاريخه الوظيفي وتطلّعاته وأحياناً سبب تركه وظيفةً سابقة.
--
--   ★ ولا يكفي إخفاء الصفحة من القائمة: الدالة مكشوفة لكل
--     `authenticated` عبر الـAPI مباشرةً.
--
-- ═══ العطل ② — البحث يُنفَّذ في المتصفح على 500 صفّ ═══════════════════════
--
--   `TalentMarketPage.tsx:119` يجلب 500 صفّاً **بكامل `cv_data`** ثم
--   يُرشّح في الذاكرة (`:129`). والدالة تقبل `p_skill` ولا يُمرَّر أبداً.
--
--   ⇒ كل سِيَر المؤسسة تُنقل إلى المتصفح لعرض نتيجة بحث واحدة.
--     وهذا تضخيم لأثر العطل ①: التسريب يشمل الجميع دفعةً واحدة.
--
-- ═══ العطل ③ — `t.cv_data` يُقرأ بلا تحقّق من الشكل ════════════════════════
--
--   `extractCvData` يفكّ الكائن، لكن الصفحة تعرض `skills[].name` مباشرةً.
--   ولا قيد شكل على `profiles.cv_data` في المخطط ⇒ صفّ بشكل مختلف
--   (مصفوفة مثلاً) يكسر العرض.
--
-- ═══ العطل ④ — «طباعة السيرة» تطبع الصفحة كلها ════════════════════════════
--
--   `:172`  setTimeout(() => window.print(), 500)
--   لا يُمرَّر أي سياق للطباعة ⇒ `window.print()` تطبع المستند بأكمله
--   (بما فيه سِيَر الآخرين المعروضة) لا سيرة الشخص المقصود.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ما يفعله هذا المايجريشن
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ① `hr_talent_profiles` تُعاد كتابتها بحارس دور صريح + بحث في
--      القاعدة + ترقيم صفحات يُعيد العدد الكلّي.
--   ② `hr_talent_profile_detail(id)` — السيرة الكاملة لشخص واحد،
--      بحارس منفصل. الفصل مقصود: القائمة لا تحمل السِيَر الكاملة.
--   ③ `hr_talent_skill_stats()` — إحصاءات المهارات محسوبة في القاعدة
--      بدل تحميل 500 سيرة إلى المتصفح لعدّها.
--
--   ★ من يملك الصلاحية: `current_user_is_staff()` (admin·hr·developer·
--     it_admin) — والموظف يرى **سيرته هو** فقط.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① قائمة المواهب — بحارس دور وبحث في القاعدة
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_talent_profiles(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.hr_talent_profiles(TEXT, INTEGER, INTEGER, TEXT);

CREATE FUNCTION public.hr_talent_profiles(
  p_skill  TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0,
  -- ★ بحث نصّي عام بالاسم/المنصب — مستقلّ عن `p_skill` عمداً
  p_text   TEXT    DEFAULT NULL
)
RETURNS TABLE(
  out_id            UUID,
  out_full_name     TEXT,
  out_email         TEXT,
  out_phone         TEXT,
  out_department    TEXT,
  out_position      TEXT,
  out_profile_image TEXT,
  out_has_cv        BOOLEAN,
  out_skill_count   INTEGER,
  out_skills        TEXT[],
  out_total_count   BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID    := public.current_user_tenant_id();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  v_off    INTEGER := GREATEST(0, COALESCE(p_offset, 0));
  v_q      TEXT    := NULLIF(btrim(COALESCE(p_skill, '')), '');
  v_txt    TEXT    := NULLIF(btrim(COALESCE(p_text, '')), '');
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;

  -- ★★★ العطل ①: الحارس الذي لم يكن موجوداً.
  --   سجل المؤهلات أداة إدارة مواهب — لا دليل هاتف عام.
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض سجل مؤهلات الموظفين';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.full_name, p.email, p.phone, p.department,
           p.position, p.profile_image,
           -- الأرشيف لا يُعاد: سيرة محذوفة يجب ألّا تظهر ولو بقيت محفوظة
           (COALESCE(p.cv_data, '{}'::jsonb) - '__archived') AS cv,
           public.cv_skill_names(p.cv_data) AS skills
      FROM public.profiles p
     WHERE p.tenant_id = v_tenant
  ),
  filtered AS (
    -- ★★★ `p_skill` يبقى **بحثاً بالمهارة وحدها** — كما كان عقده منذ 0336.
    --
    --   خطأ ارتكبتُه أولاً: وسّعتُه ليشمل الاسم والمنصب بـOR، فصار من
    --   اسمه «خبير React» يُطابق البحث عن «React» رغم أرشفة سيرته.
    --   كشفه التأكيد 4.8 في verify-cv-profile-0336 («البحث وجد 1 في
    --   سيرة مؤرشفة»).
    --
    --   ★ الدرس: توسيع معنى مُعامل قائم يكسر عقده الصامت. البحث النصّي
    --     العام له مُعامل مستقلّ (`p_text`) — والفصل يجعل كل عقد صريحاً.
    SELECT * FROM base b
     WHERE (
       v_q IS NULL
       OR EXISTS (SELECT 1 FROM unnest(b.skills) AS s(nm)
                   WHERE s.nm ILIKE '%' || v_q || '%')
     )
     AND (
       v_txt IS NULL
       OR COALESCE(b.full_name, '') ILIKE '%' || v_txt || '%'
       OR COALESCE(b.position, '')  ILIKE '%' || v_txt || '%'
     )
  ),
  counted AS (SELECT count(*) AS n FROM filtered)
  SELECT
    f.id,
    COALESCE(f.full_name, '—')::TEXT,
    COALESCE(f.email, '')::TEXT,
    COALESCE(f.phone, '')::TEXT,
    COALESCE(f.department, '')::TEXT,
    COALESCE(f.position, '')::TEXT,
    COALESCE(f.profile_image, '')::TEXT,
    f.cv <> '{}'::jsonb,
    COALESCE(array_length(f.skills, 1), 0),
    -- ★★★ أسماء المهارات فقط — لا `cv_data` الكامل.
    --   القائمة لا تحتاج الملخّص ولا التاريخ الوظيفي ولا توقّعات
    --   الراتب. من أراد التفاصيل يطلبها بـ`hr_talent_profile_detail`.
    COALESCE(f.skills, ARRAY[]::TEXT[]),
    (SELECT n FROM counted)
    FROM filtered f
   ORDER BY (f.cv <> '{}'::jsonb) DESC, f.full_name ASC
   LIMIT v_lim OFFSET v_off;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER,TEXT)
  TO authenticated;
-- ★ درس 0353: DROP يُسقط الصلاحيات و CREATE يمنح PUBLIC افتراضياً
REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER,TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER,TEXT) IS
  'قائمة المواهب. منذ 0354: حارس current_user_is_staff() صريح — كان أيّ '
  'موظف يقرأ سِيَر زملائه كاملةً (مُثبَت بدور authenticated). ولا تُعيد '
  'cv_data بل أسماء المهارات فقط؛ التفاصيل عبر hr_talent_profile_detail.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② تفاصيل سيرة واحدة — فصلٌ مقصود
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ لماذا دالة منفصلة؟ لأن القائمة تُحمَّل تلقائياً عند فتح الصفحة،
--   بينما التفاصيل تُطلَب بفعل صريح. تحميل 500 سيرة كاملة لعرض بطاقات
--   مختصرة هو ما جعل العطل ① يُسرّب كل شيء دفعةً واحدة.

DROP FUNCTION IF EXISTS public.hr_talent_profile_detail(UUID);

CREATE FUNCTION public.hr_talent_profile_detail(p_profile_id UUID)
RETURNS TABLE(
  out_id         UUID,
  out_full_name  TEXT,
  out_email      TEXT,
  out_phone      TEXT,
  out_department TEXT,
  out_position   TEXT,
  out_cv_data    JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID    := public.current_user_tenant_id();
  v_self   UUID    := auth.uid();
  v_staff  BOOLEAN := public.current_user_is_staff();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;

  -- ★★★ الموظف يرى **سيرته هو** فقط — وغيرها يحتاج صلاحية.
  IF NOT v_staff AND p_profile_id IS DISTINCT FROM v_self THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض السيرة الذاتية لموظف آخر';
  END IF;

  RETURN QUERY
  SELECT p.id,
         COALESCE(p.full_name, '—')::TEXT,
         COALESCE(p.email, '')::TEXT,
         COALESCE(p.phone, '')::TEXT,
         COALESCE(p.department, '')::TEXT,
         COALESCE(p.position, '')::TEXT,
         (COALESCE(p.cv_data, '{}'::jsonb) - '__archived')
    FROM public.profiles p
   WHERE p.id = p_profile_id
     AND p.tenant_id = v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_talent_profile_detail(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_profile_detail(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_talent_profile_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.hr_talent_profile_detail(UUID) IS
  'السيرة الكاملة لشخص واحد. الموظف يرى سيرته هو فقط؛ غيرها يحتاج '
  'current_user_is_staff(). الفصل عن القائمة مقصود.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ إحصاءات المهارات — تُحسب في القاعدة
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ العطل ②: الصفحة كانت تجلب 500 سيرة كاملة لتعدّ المهارات في
--   المتصفح. العدّ في القاعدة يُغني عن نقل البيانات أصلاً.

DROP FUNCTION IF EXISTS public.hr_talent_skill_stats(INTEGER);

CREATE FUNCTION public.hr_talent_skill_stats(p_top INTEGER DEFAULT 5)
RETURNS TABLE(
  out_kind  TEXT,
  out_label TEXT,
  out_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID    := public.current_user_tenant_id();
  v_top    INTEGER := GREATEST(1, LEAST(COALESCE(p_top, 5), 50));
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض إحصاءات المؤهلات';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.position,
           (COALESCE(p.cv_data, '{}'::jsonb) - '__archived') AS cv,
           public.cv_skill_names(p.cv_data) AS skills
      FROM public.profiles p
     WHERE p.tenant_id = v_tenant
  ),
  sk AS (
    SELECT 'skill'::TEXT AS kind, btrim(s.nm) AS label, count(*)::BIGINT AS n
      FROM base b, unnest(b.skills) AS s(nm)
     WHERE NULLIF(btrim(s.nm), '') IS NOT NULL
     GROUP BY 2
     ORDER BY 3 DESC, 2 LIMIT v_top
  ),
  pos AS (
    SELECT 'position'::TEXT, COALESCE(NULLIF(btrim(b.position), ''), 'غير محدد'),
           count(*)::BIGINT
      FROM base b GROUP BY 2 ORDER BY 3 DESC, 2 LIMIT v_top
  ),
  -- ★ اللغات: مصفوفة كائنات داخل cv_data. الشكل غير محروس بقيد،
  --   لذا نتحقّق من النوع قبل الفكّ وإلا سقطت الدالة على صفّ شاذّ.
  lang AS (
    SELECT 'language'::TEXT,
           btrim(COALESCE(l.value ->> 'name', '')),
           count(*)::BIGINT
      FROM base b,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(b.cv -> 'languages') = 'array'
                  THEN b.cv -> 'languages' ELSE '[]'::jsonb END) AS l(value)
     WHERE NULLIF(btrim(COALESCE(l.value ->> 'name', '')), '') IS NOT NULL
     GROUP BY 2 ORDER BY 3 DESC, 2 LIMIT v_top
  ),
  cvs AS (
    SELECT 'cv_count'::TEXT, 'سِيَر مكتملة'::TEXT,
           count(*) FILTER (WHERE cv <> '{}'::jsonb)::BIGINT
      FROM base
  )
  SELECT * FROM sk
  UNION ALL SELECT * FROM pos
  UNION ALL SELECT * FROM lang
  UNION ALL SELECT * FROM cvs;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_talent_skill_stats(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_skill_stats(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_talent_skill_stats(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.hr_talent_skill_stats(INTEGER) IS
  'إحصاءات المهارات والمناصب واللغات في القاعدة. كانت الصفحة تجلب 500 '
  'سيرة كاملة لتعدّها في المتصفح (العطل ②). ويتحقّق من نوع languages '
  'قبل الفكّ لأن شكل cv_data غير محروس بقيد.';

COMMIT;
