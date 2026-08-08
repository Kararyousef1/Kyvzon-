-- ============================================================================
-- 0336_cv_skill_search_and_soft_delete.sql
--
-- الملف الشخصي للموظف: بحث المهارات · حذف السيرة القابل للتراجع.
--
-- ═══ العطل ① — البحث يُطابق مفاتيح JSON لا المهارات ══════════════════════
--
--   `hr_talent_profiles` (0333) تبحث هكذا:
--
--     FROM jsonb_array_elements_text(p.cv_data -> 'skills') AS s(v)
--     WHERE s.v ILIKE '%' || p_skill || '%'
--
--   وهذا يفترض أن `skills` **مصفوفة نصوص** — كما يُعرّفها النوع الرسمي
--   `CvData` في `src/shared/types/index.ts:36`:
--       skills?: string[];
--
--   لكن `ProfilePage.tsx` تكتب **مصفوفة كائنات**:
--       skills: CvSkill[]   حيث CvSkill = { name, level }
--
--   الأثر المُثبَت تشغيلياً:
--
--     SELECT string_agg(v,' | ') FROM jsonb_array_elements_text(
--       '[{"name":"React","level":"متقدم"}]'::jsonb) AS s(v);
--     →  {"name": "React", "level": "متقدم"}      ← الكائن كامل كنصّ
--
--     البحث عن «متقدم» = 1 شخص   ⇒ **المستوى يُعامَل كمهارة**
--
--   فمسؤول الموارد البشرية يبحث عن مهارة «متقدم» فيجد نتائج، ويبحث عن
--   موظف بمهارة معيّنة فيحصل على من كتب اسم المهارة في أي حقل.
--
--   ★ الحل هنا **يقبل الشكلين**: النصّ المجرّد والكائن `{name,level}`.
--     لا نفرض ترحيل بيانات على سير ذاتية مكتوبة بالفعل، ولا نكسر
--     السجلات التي تتبع النوع الرسمي.
--
-- ═══ العطل ② — حذف السيرة الذاتية بلا رجعة ════════════════════════════════
--
--   `ProfilePage.tsx:266` — `handleDeleteCv`:
--
--     const handleDeleteCv = async () => {
--       if (!user) return;
--       setCvData({ ...EMPTY_CV });
--       await userService.updateUser(user.id, { cv_data: {} });
--     };
--
--   يُطلق من زرّ سلّة مهملات مباشرةً (السطر 472) — **بلا أي تأكيد**،
--   وبلا نسخة يمكن استرجاعها. نقرة واحدة تمسح سيرة ذاتية كاملة كتبها
--   الموظف على مدى ساعات.
--
--   ★ قاعدة المشروع: archive/cancel/void/deactivate لا الحذف النهائي.
--     الحل: `archive_my_cv()` تنقل السيرة إلى `cv_data.__archived`
--     قبل تفريغها، و`restore_my_cv()` تُعيدها.
--
-- ─── حقائق بنيوية مُحقَّقة ────────────────────────────────────────────────
--   profiles.cv_data :: JSONB NOT NULL DEFAULT '{}' (أُضيف في 0333)
--   سياسات profiles: kyvzon_profiles_update_self (id = auth.uid())
--     و kyvzon_profiles_update_admin (admin·hr·developer·it_admin)
--   ProfilePage تكتب: template·summary·age·experience[]·education[]
--     ·skills[{name,level}]·languages[{name,level}]·hobbies[]
--   النوع الرسمي CvData يتوقّع skills: string[] — التعارض هو العطل ①
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① دالة مساعدة: استخراج أسماء المهارات من الشكلين
--
--    IMMUTABLE: مخرَجها دالةٌ في مدخلها وحده — يسمح باستعمالها في
--    فهرس تعبيري لاحقاً إن لزم.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cv_skill_names(JSONB);

CREATE FUNCTION public.cv_skill_names(p_cv JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(name) FILTER (WHERE name IS NOT NULL AND btrim(name) <> ''),
    ARRAY[]::TEXT[]
  )
  FROM (
    SELECT CASE
             -- الشكل الرسمي: "React"
             WHEN jsonb_typeof(el) = 'string' THEN el #>> '{}'
             -- شكل ProfilePage: {"name":"React","level":"متقدم"}
             WHEN jsonb_typeof(el) = 'object' THEN el ->> 'name'
             ELSE NULL
           END AS name
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_cv -> 'skills') = 'array'
                  THEN p_cv -> 'skills'
                  ELSE '[]'::jsonb
             END
           ) AS el
  ) s;
$$;

COMMENT ON FUNCTION public.cv_skill_names(JSONB) IS
  'أسماء المهارات من cv_data — يقبل الشكلين: نصّ مجرّد (النوع الرسمي) '
  'وكائن {name,level} (ما تكتبه ProfilePage). البحث السابق استعمل '
  'jsonb_array_elements_text فأخرج الكائن كاملاً، فطابق «متقدم» كمهارة.';

REVOKE ALL ON FUNCTION public.cv_skill_names(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cv_skill_names(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.cv_skill_names(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② hr_talent_profiles — إعادة بناء بالبحث الصحيح
--
--    ★ التوقيع محفوظ حرفياً: UserService.talentProfiles تقرأ عشرة
--      أعمدة، وحذف أيّها يكسر سجل المؤهلات صامتاً.
--
--    ★ SECURITY INVOKER كما في 0333 — تحترم RLS جدول profiles.
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
         -- ★ الأرشيف لا يُعاد للواجهة: سيرة محذوفة يجب ألّا تظهر في
         --   سجل المؤهلات ولو بقيت محفوظة للاسترجاع.
         (COALESCE(p.cv_data, '{}'::jsonb) - '__archived'),
         (COALESCE(p.cv_data, '{}'::jsonb) - '__archived') <> '{}'::jsonb,
         COALESCE(array_length(public.cv_skill_names(p.cv_data), 1), 0)
    FROM public.profiles p
   WHERE p.tenant_id = v_tenant
     AND (
       p_skill IS NULL
       OR EXISTS (
         SELECT 1
           FROM unnest(public.cv_skill_names(p.cv_data)) AS s(nm)
          WHERE s.nm ILIKE '%' || p_skill || '%'
       )
     )
   ORDER BY ((COALESCE(p.cv_data, '{}'::jsonb) - '__archived') <> '{}'::jsonb) DESC,
            p.full_name ASC
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER) IS
  'سجل المؤهلات مع بحث بالمهارة. أُصلح في 0336: البحث كان يستعمل '
  'jsonb_array_elements_text فيُخرج الكائن {name,level} كاملاً كنصّ، '
  'فيُطابق المستوى «متقدم» كأنه مهارة. الآن عبر cv_skill_names.';

REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ أرشفة السيرة الذاتية — العطل ②
--
--    VOLATILE: تكتب. (درس 0320 — STABLE يمنع الكتابة صامتاً)
--    SECURITY INVOKER: سياسة kyvzon_profiles_update_self تحرس أن
--    المستخدم لا يُعدّل إلا ملفه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.archive_my_cv();

CREATE FUNCTION public.archive_my_cv()
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_current JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  SELECT COALESCE(cv_data, '{}'::jsonb) INTO v_current
    FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- ★ سيرة فارغة أصلاً: لا شيء يُؤرشف، ولا نُتلف أرشيفاً سابقاً
  IF (v_current - '__archived') = '{}'::jsonb THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
     SET cv_data = jsonb_build_object(
           '__archived', jsonb_build_object(
             'cv',          v_current - '__archived',
             'archived_at', to_jsonb(NOW())
           )
         )
   WHERE id = v_uid;

  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.archive_my_cv() IS
  'أرشفة السيرة الذاتية بدل حذفها. handleDeleteCv كانت تكتب '
  'cv_data = {} من زرّ سلّة بلا تأكيد — نقرة واحدة تمسح ساعات عمل. '
  'قاعدة المشروع: archive لا delete.';

REVOKE ALL ON FUNCTION public.archive_my_cv() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_my_cv() FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_my_cv() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ استرجاع السيرة المؤرشفة
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.restore_my_cv();

CREATE FUNCTION public.restore_my_cv()
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_arch JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  SELECT cv_data -> '__archived' -> 'cv' INTO v_arch
    FROM public.profiles WHERE id = v_uid;

  IF v_arch IS NULL OR v_arch = '{}'::jsonb THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles SET cv_data = v_arch WHERE id = v_uid;
  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.restore_my_cv() IS
  'استرجاع السيرة المؤرشفة. يُعيد FALSE إن لا أرشيف — لا خطأ.';

REVOKE ALL ON FUNCTION public.restore_my_cv() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_my_cv() FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_my_cv() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ هل لديّ أرشيف؟ — لعرض زرّ الاسترجاع
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_cv_archive_info();

CREATE FUNCTION public.my_cv_archive_info()
RETURNS TABLE(
  out_has_archive  BOOLEAN,
  out_archived_at  TIMESTAMPTZ,
  out_skill_count  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_arch JSONB;
  v_at   TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT p.cv_data -> '__archived' -> 'cv',
         p.cv_data -> '__archived' ->> 'archived_at'
    INTO v_arch, v_at
    FROM public.profiles p WHERE p.id = v_uid;

  RETURN QUERY SELECT
    (v_arch IS NOT NULL AND v_arch <> '{}'::jsonb),
    CASE WHEN v_at IS NULL THEN NULL ELSE v_at::TIMESTAMPTZ END,
    COALESCE(array_length(public.cv_skill_names(COALESCE(v_arch, '{}'::jsonb)), 1), 0);
END $$;

COMMENT ON FUNCTION public.my_cv_archive_info() IS
  'معلومات أرشيف السيرة — لعرض زرّ الاسترجاع ووقت الأرشفة.';

REVOKE ALL ON FUNCTION public.my_cv_archive_info() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_cv_archive_info() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_cv_archive_info() TO authenticated;
