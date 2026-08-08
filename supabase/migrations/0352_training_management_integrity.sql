-- ============================================================================
-- 0352_training_management_integrity.sql
--
-- بوابة الموارد البشرية — المرحلة 4: `hr/TrainingManagementPage` (623 سطراً).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً على Postgres محلي (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطل ① — ★★★ إنشاء أو تعديل أيّ دورة يفشل دائماً ════════════════════
--
--   `TrainingManagementPage.tsx:388` يبني `courseData` ويُرسله في
--   `createCourse` و`updateCourse`، وفيه حقلان لا وجود لهما:
--
--     active:       data.active ?? true,
--     rich_content: data.richContent || EMPTY_RICH_CONTENT,
--
--   مُثبَت بالتشغيل:
--     INSERT INTO courses(…,active)       ⇒ ERROR: column "active" of
--       relation "courses" does not exist
--     INSERT INTO courses(…,rich_content) ⇒ ERROR: column "rich_content" of
--       relation "courses" does not exist
--
--   ⇒ **زرّ «إضافة دورة» وزرّ «حفظ التغييرات» معطّلان تماماً.**
--     الصفحة كلّها إدارةُ دورات… ولا يمكن إنشاء دورة واحدة ولا تعديلها.
--
--   ★ و`convertRowToCourse` يقرأ `c.active ?? true` و`c.rich_content`
--     ⇒ كل دورة تُقرأ «فعّالة» مهما كانت حالتها الحقيقية، وتبويب
--     «الصور والملفات» يفتح فارغاً أبداً.
--
-- ═══ العطل ② — أعمدة الشهادات كلها خاطئة ══════════════════════════════════
--
--   `CertRow` يُعرّف `title` و`issuer`. والجدول المُحقَّق:
--     employee_certifications:
--       certification_name VARCHAR NOT NULL   ← لا `title`
--       issued_by          VARCHAR            ← لا `issuer`
--       expiry_date        DATE               ← غير مقروء إطلاقاً
--       certification_url  TEXT               ← غير مقروء
--       notes              TEXT               ← غير مقروء
--     ولا عمود `approved` ولا `approval_date` في الجدول كلّه.
--
--   مُثبَت:
--     INSERT INTO employee_certifications(…,title,issuer,…)
--       ⇒ ERROR: column "title" of relation … does not exist
--
--   ⇒ عمود «الشهادة» في الجدول **فارغ أبداً** (`c.title` = undefined)،
--     وكذلك «الجهة المانحة».
--
-- ═══ العطل ③ — «معتمدة» قيمة مكتوبة يدوياً ════════════════════════════════
--
--   `:208`  approved: true,
--   `:478`  completed: certifications.filter((c) => c.approved).length,
--
--   القيمة ثابتة `true` لكل شهادة ⇒ بطاقة «معتمدة» تساوي **عدد الشهادات
--   كلها** أبداً. ولا عمود اعتماد في الجدول أصلاً — فالمؤشّر بلا مصدر.
--
-- ═══ العطل ④ — ★ انتهاء صلاحية الشهادات مُهمَل تماماً ═════════════════════
--
--   `expiry_date` موجود في الجدول ولا يُقرأ في أي موضع من الصفحة.
--
--   مُثبَت (شهادة انتهت قبل 30 يوماً):
--     شهادات منتهية الصلاحية = 1
--     والصفحة تعرضها كسائر الشهادات بلا أي تمييز.
--
--   ⇒ شهادة سلامة منتهية تظهر سارية. وهذا في سياق الجودة والسلامة
--     المهنية خطرٌ تنظيميّ لا مجرّد عيب عرض.
--
-- ═══ العطل ⑤ — اسم الموظف وبريده فارغان ═══════════════════════════════════
--
--   `:353` يبني `empMap` من `employeeService.findAll` ثم يقرأ
--     `emp.full_name_ar` و`emp.email`.
--
--   مُثبَت على موظف حقيقي أُنشئ بمحفّز 0317:
--     employees.email          = <NULL>
--     employees.full_name_ar   = <NULL>
--
--   ⇒ عمود الموظف في جدول الشهادات يعرض حرفاً أول فارغاً واسماً فارغاً.
--     (`full_name_ar` فارغ لكل موظف — المحفّز يملأ first_name/last_name.)
--
-- ═══ العطل ⑥ — الترتيب بعمود غير موجود ════════════════════════════════════
--
--   `:346` `employeeService.findAll({ orderBy: 'full_name_ar' })`
--   العمود موجود لكنه NULL للجميع ⇒ الترتيب بلا معنى.
--
-- ═══ العطل ⑦ — البحث يُخفق في العربية ═════════════════════════════════════
--
--   `:377`
--     const q = searchQuery.toLowerCase();
--     courses.filter((c) => c.title.includes(q) || …)
--
--   `toLowerCase()` لا أثر له على العربية، ثم يُقارَن النصّ العربي
--   بالاستعلام المُصغَّر — فالبحث حسّاس لحالة الأحرف في الإنجليزية
--   ويفشل عند اختلافها. و`c.instructor` قد يكون `''` فيُطابق كل شيء.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ما يفعله هذا المايجريشن
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ① `training_course_upsert(…)`      — إنشاء/تعديل بأعمدة موجودة فقط
--   ② `training_certifications(q)`     — الشهادات بأسمائها الحقيقية
--                                         + حالة الصلاحية المحسوبة
--   ③ `training_certification_upsert()` — إضافة/تعديل شهادة
--   ④ `training_management_summary()`  — مؤشّرات محسوبة لا ثوابت
--
--   كلها `SECURITY DEFINER` · `search_path=public` · تُرشّح بالمستأجر.
--   ولا حذف نهائي في أيٍّ منها.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① إنشاء/تعديل دورة — بأعمدة موجودة فقط
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_course_upsert(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT,
  TEXT[], TEXT[], TEXT);

CREATE FUNCTION public.training_course_upsert(
  p_id          UUID    DEFAULT NULL,
  p_title       TEXT    DEFAULT NULL,
  p_title_en    TEXT    DEFAULT NULL,
  p_description TEXT    DEFAULT NULL,
  p_description_en TEXT DEFAULT NULL,
  p_category    TEXT    DEFAULT NULL,
  p_level       TEXT    DEFAULT NULL,
  p_duration    TEXT    DEFAULT NULL,
  p_points      INTEGER DEFAULT 0,
  p_mandatory   BOOLEAN DEFAULT FALSE,
  p_instructor  TEXT    DEFAULT NULL,
  p_tags        TEXT[]  DEFAULT '{}',
  p_objectives  TEXT[]  DEFAULT '{}',
  p_status      TEXT    DEFAULT 'active'
)
RETURNS TABLE(
  out_id      UUID,
  out_title   TEXT,
  out_status  TEXT,
  out_created BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
  v_new    BOOLEAN := FALSE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية إدارة الدورات';
  END IF;
  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'عنوان الدورة مطلوب';
  END IF;
  IF p_status NOT IN ('active','inactive','archived') THEN
    RAISE EXCEPTION 'حالة غير مسموحة: % — المسموح active·inactive·archived', p_status;
  END IF;
  -- ★ المستوى محكوم بـCHECK في المخطط — نُعطي رسالة مفهومة قبله
  IF p_level IS NOT NULL AND p_level NOT IN ('مبتدئ','متوسط','متقدم','خبير') THEN
    RAISE EXCEPTION 'مستوى غير مسموح: % — المسموح مبتدئ·متوسط·متقدم·خبير', p_level;
  END IF;
  IF COALESCE(p_points, 0) < 0 THEN
    RAISE EXCEPTION 'النقاط لا تكون سالبة: %', p_points;
  END IF;

  IF p_id IS NULL THEN
    -- ★ العطل ①: لا `active` ولا `rich_content` — أعمدة موجودة فقط
    INSERT INTO public.courses(
      tenant_id, title, title_en, description, description_en,
      category, level, duration, points, mandatory, instructor,
      tags, objectives, status, created_at, updated_at)
    VALUES (
      v_tenant, btrim(p_title), NULLIF(btrim(COALESCE(p_title_en,'')),''),
      COALESCE(NULLIF(btrim(COALESCE(p_description,'')),''), '—'),
      NULLIF(btrim(COALESCE(p_description_en,'')),''),
      COALESCE(NULLIF(btrim(COALESCE(p_category,'')),''), 'عام'),
      COALESCE(p_level, 'مبتدئ'),
      COALESCE(NULLIF(btrim(COALESCE(p_duration,'')),''), 'ساعة'),
      COALESCE(p_points, 0), COALESCE(p_mandatory, FALSE),
      NULLIF(btrim(COALESCE(p_instructor,'')),''),
      COALESCE(p_tags,'{}'), COALESCE(p_objectives,'{}'),
      p_status, NOW(), NOW())
    RETURNING id INTO v_id;
    v_new := TRUE;
  ELSE
    -- ★ التعديل محصور بمستأجر المستدعي
    UPDATE public.courses c
       SET title          = btrim(p_title),
           title_en       = NULLIF(btrim(COALESCE(p_title_en,'')),''),
           description    = COALESCE(NULLIF(btrim(COALESCE(p_description,'')),''), c.description),
           description_en = NULLIF(btrim(COALESCE(p_description_en,'')),''),
           category       = COALESCE(NULLIF(btrim(COALESCE(p_category,'')),''), c.category),
           level          = COALESCE(p_level, c.level),
           duration       = COALESCE(NULLIF(btrim(COALESCE(p_duration,'')),''), c.duration),
           points         = COALESCE(p_points, c.points),
           mandatory      = COALESCE(p_mandatory, c.mandatory),
           instructor     = NULLIF(btrim(COALESCE(p_instructor,'')),''),
           tags           = COALESCE(p_tags, c.tags),
           objectives     = COALESCE(p_objectives, c.objectives),
           status         = p_status,
           updated_at     = NOW()
     WHERE c.id = p_id AND c.tenant_id = v_tenant
    RETURNING c.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'الدورة غير موجودة أو لا تخصّ مستأجرك';
    END IF;
  END IF;

  RETURN QUERY
  SELECT c.id, c.title::TEXT, c.status::TEXT, v_new
    FROM public.courses c WHERE c.id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_course_upsert(
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT[],TEXT[],TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.training_course_upsert(
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT[],TEXT[],TEXT) IS
  'إنشاء/تعديل دورة بأعمدة موجودة فقط. الصفحة كانت ترسل active و '
  'rich_content وكلاهما معدوم ⇒ كل إنشاء وكل تعديل يفشل (العطل ①).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② الشهادات — بأسمائها الحقيقية وحالة صلاحية محسوبة
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_certifications(TEXT);

CREATE FUNCTION public.training_certifications(p_search TEXT DEFAULT NULL)
RETURNS TABLE(
  out_id                 UUID,
  out_employee_id        UUID,
  out_employee_name      TEXT,
  out_department         TEXT,
  out_certification_name TEXT,
  out_issued_by          TEXT,
  out_issue_date         DATE,
  out_expiry_date        DATE,
  out_days_to_expiry     INTEGER,
  out_validity           TEXT,
  out_certification_url  TEXT
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض الشهادات';
  END IF;

  RETURN QUERY
  WITH emp AS (
    -- ★ العطل ⑤: `full_name_ar` فارغ لكل موظف و`employees.email` NULL
    --   ⇒ سلسلة احتياطية إلزامية عبر profiles.
    SELECT e.id, e.department_id,
           COALESCE(
             NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
             NULLIF(btrim(p.full_name), ''),
             'موظف بلا اسم'
           ) AS display_name
      FROM public.employees e
      LEFT JOIN public.profiles p ON p.id = e.user_id
     WHERE e.tenant_id = v_tenant
  )
  SELECT
    ec.id,
    ec.employee_id,
    COALESCE(emp.display_name, 'موظف غير معروف')::TEXT,
    COALESCE(d.name_ar, '—')::TEXT,
    -- ★ العطل ②: `certification_name` لا `title`
    ec.certification_name::TEXT,
    COALESCE(ec.issued_by, '—')::TEXT,
    ec.issue_date,
    ec.expiry_date,
    -- ★ العطل ④: انتهاء الصلاحية كان مُهمَلاً تماماً
    CASE WHEN ec.expiry_date IS NULL THEN NULL
         ELSE (ec.expiry_date - CURRENT_DATE)::INTEGER END,
    CASE
      WHEN ec.expiry_date IS NULL                          THEN 'بلا انتهاء'
      WHEN ec.expiry_date <  CURRENT_DATE                  THEN 'منتهية'
      WHEN ec.expiry_date <= CURRENT_DATE + 30             THEN 'تنتهي قريباً'
      ELSE                                                      'سارية'
    END::TEXT,
    ec.certification_url::TEXT
    FROM public.employee_certifications ec
    LEFT JOIN emp ON emp.id = ec.employee_id
    LEFT JOIN public.departments d ON d.id = emp.department_id
   WHERE ec.tenant_id = v_tenant
     AND (
       v_q IS NULL
       OR ec.certification_name ILIKE '%' || v_q || '%'
       OR COALESCE(ec.issued_by,'')      ILIKE '%' || v_q || '%'
       OR COALESCE(emp.display_name,'')  ILIKE '%' || v_q || '%'
     )
   -- المنتهية أولاً ثم الأقرب انتهاءً — الأهمّ في الأعلى
   ORDER BY
     CASE WHEN ec.expiry_date IS NULL THEN 2
          WHEN ec.expiry_date < CURRENT_DATE THEN 0
          ELSE 1 END,
     ec.expiry_date NULLS LAST,
     ec.issue_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_certifications(TEXT) TO authenticated;

COMMENT ON FUNCTION public.training_certifications(TEXT) IS
  'الشهادات بأعمدتها الحقيقية (certification_name/issued_by لا title/issuer) '
  'مع حالة صلاحية محسوبة من expiry_date الذي كان مُهمَلاً (العطل ②+④).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ إضافة/تعديل شهادة
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_certification_upsert(
  UUID, UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT);

CREATE FUNCTION public.training_certification_upsert(
  p_id          UUID DEFAULT NULL,
  p_employee_id UUID DEFAULT NULL,
  p_name        TEXT DEFAULT NULL,
  p_issued_by   TEXT DEFAULT NULL,
  p_issue_date  DATE DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL,
  p_url         TEXT DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
)
RETURNS TABLE(
  out_id      UUID,
  out_name    TEXT,
  out_created BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
  v_new    BOOLEAN := FALSE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية إدارة الشهادات';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'اسم الشهادة مطلوب';
  END IF;
  -- ★ نطاق معكوس: انتهاء قبل الإصدار
  IF p_issue_date IS NOT NULL AND p_expiry_date IS NOT NULL
     AND p_expiry_date < p_issue_date THEN
    RAISE EXCEPTION 'تاريخ الانتهاء (%) قبل تاريخ الإصدار (%)',
      p_expiry_date, p_issue_date;
  END IF;

  IF p_id IS NULL THEN
    -- ★ الموظف يجب أن يخصّ المستأجر — وإلا نُسبت الشهادة لموظف أجنبي
    IF NOT EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = p_employee_id AND e.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'الموظف غير موجود أو لا يخصّ مستأجرك';
    END IF;

    INSERT INTO public.employee_certifications(
      tenant_id, employee_id, certification_name, issued_by,
      issue_date, expiry_date, certification_url, notes)
    VALUES (
      v_tenant, p_employee_id, btrim(p_name),
      NULLIF(btrim(COALESCE(p_issued_by,'')),''),
      p_issue_date, p_expiry_date,
      NULLIF(btrim(COALESCE(p_url,'')),''),
      NULLIF(btrim(COALESCE(p_notes,'')),''))
    RETURNING id INTO v_id;
    v_new := TRUE;
  ELSE
    UPDATE public.employee_certifications ec
       SET certification_name = btrim(p_name),
           issued_by          = NULLIF(btrim(COALESCE(p_issued_by,'')),''),
           issue_date         = COALESCE(p_issue_date, ec.issue_date),
           expiry_date        = p_expiry_date,
           certification_url  = NULLIF(btrim(COALESCE(p_url,'')),''),
           notes              = NULLIF(btrim(COALESCE(p_notes,'')),''),
           updated_at         = NOW()
     WHERE ec.id = p_id AND ec.tenant_id = v_tenant
    RETURNING ec.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'الشهادة غير موجودة أو لا تخصّ مستأجرك';
    END IF;
  END IF;

  RETURN QUERY
  SELECT ec.id, ec.certification_name::TEXT, v_new
    FROM public.employee_certifications ec WHERE ec.id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_certification_upsert(
  UUID,UUID,TEXT,TEXT,DATE,DATE,TEXT,TEXT) TO authenticated;

COMMENT ON FUNCTION public.training_certification_upsert(
  UUID,UUID,TEXT,TEXT,DATE,DATE,TEXT,TEXT) IS
  'إضافة/تعديل شهادة بالأعمدة الحقيقية مع حراسة النطاق المعكوس '
  'وانتماء الموظف للمستأجر.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ مؤشّرات الإدارة — محسوبة لا ثوابت
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.training_management_summary();

CREATE FUNCTION public.training_management_summary()
RETURNS TABLE(
  out_total_courses    INTEGER,
  out_active_courses   INTEGER,
  out_archived_courses INTEGER,
  out_mandatory        INTEGER,
  out_total_certs      INTEGER,
  out_valid_certs      INTEGER,
  out_expiring_certs   INTEGER,
  out_expired_certs    INTEGER
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض مؤشّرات التدريب';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::INTEGER FROM public.courses c WHERE c.tenant_id = v_tenant),
    -- ★ العطل ①: `status` هو المصدر — لا `active` المعدوم
    (SELECT count(*)::INTEGER FROM public.courses c
      WHERE c.tenant_id = v_tenant AND c.status = 'active'),
    (SELECT count(*)::INTEGER FROM public.courses c
      WHERE c.tenant_id = v_tenant AND c.status = 'archived'),
    (SELECT count(*)::INTEGER FROM public.courses c
      WHERE c.tenant_id = v_tenant AND c.mandatory),
    (SELECT count(*)::INTEGER FROM public.employee_certifications ec
      WHERE ec.tenant_id = v_tenant),
    -- ★ العطل ③: «معتمدة» كانت approved:true ثابتاً ⇒ العدد الكلّي أبداً.
    --   البديل الصادق: صلاحية محسوبة من expiry_date.
    (SELECT count(*)::INTEGER FROM public.employee_certifications ec
      WHERE ec.tenant_id = v_tenant
        AND (ec.expiry_date IS NULL OR ec.expiry_date > CURRENT_DATE + 30)),
    (SELECT count(*)::INTEGER FROM public.employee_certifications ec
      WHERE ec.tenant_id = v_tenant
        AND ec.expiry_date IS NOT NULL
        AND ec.expiry_date >= CURRENT_DATE
        AND ec.expiry_date <= CURRENT_DATE + 30),
    (SELECT count(*)::INTEGER FROM public.employee_certifications ec
      WHERE ec.tenant_id = v_tenant
        AND ec.expiry_date IS NOT NULL
        AND ec.expiry_date < CURRENT_DATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_management_summary() TO authenticated;

COMMENT ON FUNCTION public.training_management_summary() IS
  'مؤشّرات إدارة التدريب محسوبة من status و expiry_date. البطاقة القديمة '
  '«معتمدة» كانت approved:true ثابتاً ⇒ تساوي عدد الشهادات كلها (العطل ③).';

COMMIT;
