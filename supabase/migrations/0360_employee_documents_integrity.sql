-- ════════════════════════════════════════════════════════════════════════
--  0360 — سلامة مستندات الموظفين
--  المرحلة 4 — بوابة الموارد البشرية · صفحة hr/DocumentsPage.tsx (257 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0360.sql — على قاعدة نظيفة، 288 م.)  │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★ **`is_confidential` عمودٌ ميت — والموظف يقرأ ملفّه السرّي.**
--     العمود موجود منذ `0006_hr_expansion.sql:459` بـ`DEFAULT false`،
--     وسياسة القراءة القائمة:
--        ((tenant_id = current_user_tenant_id())
--          AND (current_user_is_staff()
--               OR (employee_id = current_user_employee_id())))
--     **لا تذكره إطلاقاً**.
--
--     PROBE_6: سياسات تذكر `is_confidential` = **0**
--              دوال  تذكر `is_confidential` = **0**
--
--     ⇒ التقرير الطبيّ الذي رفعته الموارد البشرية عن الموظف، وخطاب
--       التوصية السرّي، ومرفق الإجراء التأديبيّ — كلها يقرؤها الموظف
--       نفسه من بوابته. العمود موجودٌ ليطمئن مَن يقرأ المخطط، ولا
--       يفعل شيئاً على الإطلاق. **والصفحة لا تعرضه ولا تسمح بضبطه.**
--
--  ② ★★★ **`document_type` بلا أي قيد** — النصّ الحرّ يدخل.
--     PROBE_1: أُدرج `document_type = 'ThIsIsGaRbAgE'` ⇒ **قُبِل**.
--     وأثره في الواجهة مباشر: `DOCUMENT_TYPE_LABELS[doc.document_type]`
--     يعطي `undefined` فتظهر شارةٌ **فارغة**، و`typeColors[...] ||`
--     يسقط إلى الرماديّ. الصفّ يصير غير قابل للتصنيف إلى الأبد.
--     ★ ولاحظ التفاوت القائم: النوع في TS ثمانية، وشريط الترشيح في
--       الصفحة يعرض **سبعة** (`recommendation` مفقود من الشريط)
--       ⇒ خطاب التوصية لا يمكن ترشيحه أصلاً.
--
--  ③ ★★★ **`employee_id` بلا مفتاح أجنبيّ** — لا في `0006` ولا بعده.
--     PROBE_3: وثيقةٌ لموظف `ffffffff-…` غير موجود ⇒ **قُبِلت**.
--     `pg_constraint` على الجدول = مفتاحان فقط:
--        employee_documents_pkey · employee_documents_tenant_id_fkey
--
--  ④ ★★★ **وثيقةٌ لموظف مستأجرٍ آخر داخل مستأجرك.**
--     PROBE_4: `tenant_id = ألف` مع `employee_id` = موظفٍ في **باء**
--     ⇒ **قُبِلت**. عزل المستأجر يحرس عمود `tenant_id` وحده، ولا شيء
--       يربط الوثيقة بموظفٍ من المستأجر نفسه.
--
--  ⑤ ★★ **`tenant_id` يقبل NULL** ⇒ صفٌّ يتيم لا يراه أحد أبداً.
--     PROBE_2: أُدرجت وثيقة بـ`tenant_id = NULL` ⇒ **قُبِلت**، ثم
--     اختفت عن كل الاستعلامات (`tenant_id = …` لا يطابق NULL).
--     وهذا ليس نظرياً: `BaseService.injectTenantId` يرمي إن غاب
--     المستأجر، لكن `injectTenantIdOptional` تكتب `null` صراحةً،
--     و`archive_employee_document` لن تجد الصفّ فلا سبيل لأرشفته.
--
--  ⑥ ★★ **الأرشفة لا تُخفي شيئاً.** `0006` لا يعرف `is_archived`؛
--     العمود أُضيف لاحقاً و`archive_employee_document` تضبطه، لكن
--     استعلام الصفحة `employeeDocumentService.findAll({...})` =
--     `select * … eq('tenant_id', …)` **بلا أيّ فلتر**.
--     PROBE_7: بعد الأرشفة، الصفحة ما زالت ترى الوثيقة = **1**.
--     ⇒ زرّ «أرشفة» يعرض «تمت الأرشفة» ثم `fetchDocs()` تُعيدها
--       كما هي. المستخدم يضغط فيتغيّر **لا شيء**.
--
--  ⑦ ★★ **الحذف النهائيّ ما زال ممكناً** رغم أنّ الصفحة تخلّت عنه.
--     PROBE_8: بدور `authenticated` حقيقيّ (هدى · hr) نفّذتُ
--       DELETE FROM employee_documents WHERE id = …
--     ⇒ الصفّ **اختفى**. سياسة `kyvzon_employee_documents_delete`
--       تسمح لكل staff، ولا محفّز يمنع (PROBE_9: المحفّز الوحيد
--       غير الداخليّ هو `update_employee_documents_updated_at`).
--     عقدُ عملٍ أو إخلاء طرفٍ دليلٌ يُطلب بعد سنوات — والصفحة
--     أحسنت بالأرشفة، لكن الباب الخلفيّ مفتوح على مصراعيه.
--
--  ⑧ ★★ **`uploaded_by` لا يُكتب أبداً.** الصفحة لا ترسله، ولا محفّز
--     يملؤه. PROBE_5: أربع وثائق ⇒ **أربع** بلا رافع.
--     ⇒ لا يُعرف مَن رفع العقد. وهذه وثائق قانونية.
--
--  ⑨ ★★ **`file_size` و`mime_type` عمودان ميتان.** الصفحة تملك
--     `File` كاملاً في `handleFile` (فيه `.size` و`.type`) وترمي
--     كليهما. PROBE_11: ثلاث وثائق ⇒ **ثلاث** بلا حجم.
--     ⇒ لا حدّ لحجم الرفع ولا تحقّق من نوع المحتوى: ملفٌّ تنفيذيّ
--       باسم `.pdf` يُرفع ويُقدَّم للتحميل من رابط **عام**.
--
--  ⑩ ★★ **`expires_at` بلا أثر في المنظومة.**
--     PROBE_10: دوال تذكر `employee_documents` و`expires_at` معاً = **0**
--     ⇒ الصفحة تطبع «ينتهي: …» بلون كهرمانيّ **حتى لو انتهى أمس**
--       (`{doc.expires_at && …}` لا يقارن بشيء). إقامةٌ منتهية أو
--       شهادة سلامة منتهية تبدوان كأنّهما سليمتان.
--
--  ⑪ ★ **`storage`: bucket `'employee-documents'` غير موجود.**
--     مسحُ المستودع كلّه: النصّ `employee-documents` يظهر في **ملف
--     واحد** هو `DocumentsPage.tsx` — لا في أيّ مايجريشن ولا في أيّ
--     سكربت. و`0005` ينشئ bucket واحداً اسمه `tawathul`.
--     ⇒ أوّل رفعٍ يرمي `Bucket not found`. و`uploadPublic` تعني
--       رابطاً **عاماً بلا مصادقة** لتقارير طبّية — وهو الخيار الخطأ
--       بنيوياً حتى لو وُجد الـbucket.
--     ★ هذا العطل **خارج قدرة المايجريشن** (`storage.buckets` ليس
--       في مخطط pgtest) — يُعالَج في طبقة SDK وبتوثيقٍ صريح.
--
--  ⑫ ★ **`WithEmployee` وحلقة O(n)**: الصفحة تجلب كل الموظفين ثم
--     تبني `Map` يدوياً في المتصفّح لكل عرض، و`orderBy:'full_name_ar'`
--     على عمودٍ **NULL لكل موظف** (محفّز `tg_ensure_employee_row`
--     يكتب `first_name`/`last_name` فقط) ⇒ ترتيبٌ عشوائيّ فعلياً.
--
--  ────────────────────────────────────────────────────────────────────
--  العلاج في هذا المايجريشن:
--    · قيد CHECK على `document_type` بالمفردات الثماني
--    · `tenant_id` ⇒ NOT NULL + FK مركَّب يضمن أنّ الموظف من المستأجر
--    · سياسة SELECT جديدة تحترم `is_confidential`
--    · محفّز يمنع الحذف النهائيّ ويملأ `uploaded_by` و`tenant_id`
--    · `employee_documents_board()` — استعلامٌ واحد مع حالة الانتهاء
--    · `employee_documents_summary()` · `document_upload()` · `document_set_confidential()`
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف البيانات القائمة قبل فرض القيود
-- ═══════════════════════════════════════════════════════════════════

-- ★ العطل ⑤: الصفوف اليتيمة (tenant_id NULL) لا يراها أحد. نستنتج
--   مستأجرها من الموظف حين نستطيع، وإلا نؤرشفها بدل الحذف.
UPDATE public.employee_documents d
   SET tenant_id = e.tenant_id
  FROM public.employees e
 WHERE d.tenant_id IS NULL
   AND e.id = d.employee_id
   AND e.tenant_id IS NOT NULL;

-- ما بقي بلا مستأجر: لا يمكن إسناده ⇒ يُحذف (صفوفٌ لا يراها أحد أصلاً
-- ولا يمكن أن تُقرأ أو تُؤرشف تحت أي دور — لا قيمة إثباتية لها).
DELETE FROM public.employee_documents WHERE tenant_id IS NULL;

-- ★ العطل ②: أنواع خارج المفردات الثماني ⇒ 'other'
UPDATE public.employee_documents
   SET document_type = 'other'
 WHERE document_type NOT IN ('contract','certificate','id_copy','cv',
                             'medical','degree','recommendation','other');

-- ★ العطل ③/④: وثائق لموظف معدوم أو من مستأجر آخر
DELETE FROM public.employee_documents d
 WHERE NOT EXISTS (
   SELECT 1 FROM public.employees e
    WHERE e.id = d.employee_id AND e.tenant_id = d.tenant_id);

-- ═══════════════════════════════════════════════════════════════════
--  ① القيود البنيوية
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.employee_documents ALTER COLUMN tenant_id SET NOT NULL;

-- ★★ FK مركَّب: يمنع العطلين ③ و④ معاً. يحتاج فهرساً فريداً على
--   (id, tenant_id) في employees — المفتاح الأساسي وحده لا يكفي.
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_id_tenant
  ON public.employees (id, tenant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_documents_employee_tenant_fkey') THEN
    ALTER TABLE public.employee_documents
      ADD CONSTRAINT employee_documents_employee_tenant_fkey
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_documents_type_chk') THEN
    ALTER TABLE public.employee_documents
      ADD CONSTRAINT employee_documents_type_chk
      CHECK (document_type IN ('contract','certificate','id_copy','cv',
                               'medical','degree','recommendation','other'));
  END IF;
END $$;

-- ★ العطل ⑨: حجمٌ موجب ومعقول (25MB) حين يُذكر
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_documents_size_chk') THEN
    ALTER TABLE public.employee_documents
      ADD CONSTRAINT employee_documents_size_chk
      CHECK (file_size IS NULL OR (file_size > 0 AND file_size <= 26214400));
  END IF;
END $$;

-- ★ عنوانٌ غير فارغ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_documents_title_chk') THEN
    ALTER TABLE public.employee_documents
      ADD CONSTRAINT employee_documents_title_chk
      CHECK (btrim(title) <> '' AND btrim(file_url) <> '');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_documents_active
  ON public.employee_documents (tenant_id, employee_id)
  WHERE NOT is_archived;

CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry
  ON public.employee_documents (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL AND NOT is_archived;

-- ═══════════════════════════════════════════════════════════════════
--  ② محفّز: يملأ uploaded_by/tenant_id ويحرس السرّية
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_employee_document_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- ★ العطل ⑧: الرافع يُستنتج ولا يُؤخذ من العميل
  IF TG_OP = 'INSERT' THEN
    NEW.uploaded_by := COALESCE(auth.uid(), NEW.uploaded_by);
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := public.current_user_tenant_id();
    END IF;
    -- ★ التقرير الطبيّ والتأديبيّ سرّيان افتراضاً
    IF NEW.document_type IN ('medical','recommendation') THEN
      NEW.is_confidential := TRUE;
    END IF;
  ELSE
    -- ★ الرافع لا يتغيّر بعد الإنشاء
    NEW.uploaded_by := OLD.uploaded_by;
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_employee_document_stamp() IS
  'يملأ uploaded_by من auth.uid() ويجمّد الرافع/المستأجر/الموظف بعد '
  'الإنشاء. الطبّي وخطاب التوصية سرّيان افتراضاً (العطل ①).';

DROP TRIGGER IF EXISTS trg_employee_document_stamp ON public.employee_documents;
CREATE TRIGGER trg_employee_document_stamp
  BEFORE INSERT OR UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_employee_document_stamp();

-- ★ العطل ⑦: منع الحذف النهائيّ
CREATE OR REPLACE FUNCTION public.tg_block_employee_document_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'DOCUMENT_DELETE_BLOCKED: وثيقة الموظف لا تُحذف — استخدم الأرشفة';
END $$;

DROP TRIGGER IF EXISTS trg_block_employee_document_delete ON public.employee_documents;
CREATE TRIGGER trg_block_employee_document_delete
  BEFORE DELETE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_employee_document_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ③ سياسة القراءة تحترم السرّية (العطل ①)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS kyvzon_employee_documents_select ON public.employee_documents;
CREATE POLICY kyvzon_employee_documents_select
  ON public.employee_documents FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      -- ★★★ الموظف يرى وثائقه **غير السرّية** فقط
      OR (employee_id = public.current_user_employee_id()
          AND NOT is_confidential)
    )
  );

-- سياسة الحذف تبقى قائمة شكلاً، والمحفّز يمنع فعلاً (دفاعٌ مزدوج).

-- ═══════════════════════════════════════════════════════════════════
--  ④ الدوال — استعلامٌ واحد بدل حلقة المتصفّح
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.employee_documents_board(TEXT, BOOLEAN);
CREATE FUNCTION public.employee_documents_board(
  p_type     TEXT    DEFAULT NULL,
  p_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_document_type TEXT,
  out_title         TEXT,
  out_description   TEXT,
  out_file_url      TEXT,
  out_file_name     TEXT,
  out_file_size     BIGINT,
  out_mime_type     TEXT,
  out_confidential  BOOLEAN,
  out_expires_at    DATE,
  out_expiry_state  TEXT,
  out_days_left     INTEGER,
  out_uploaded_by   UUID,
  out_uploader_name TEXT,
  out_is_archived   BOOLEAN,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_staff  BOOLEAN := public.current_user_is_staff();
  v_me     UUID := public.current_user_employee_id();
  -- ★★★ بغداد UTC+3 والخادم Etc/UTC — بلا هذا يتقدّم اليوم ثلاث ساعات
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY
  SELECT
    d.id, d.employee_id,
    -- ★ العطل ⑫: full_name_ar فارغ لكل موظف ⇒ احتياطيّ من الاسمين
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
             'موظف ' || e.employee_code)::TEXT,
    e.employee_code::TEXT,
    d.document_type::TEXT, d.title::TEXT, d.description,
    d.file_url, d.file_name::TEXT, d.file_size, d.mime_type::TEXT,
    d.is_confidential, d.expires_at,
    -- ★ العطل ⑩: حالة الانتهاء تُحسب في القاعدة لا في العين المجرّدة
    CASE
      WHEN d.expires_at IS NULL                       THEN 'none'
      WHEN d.expires_at <  v_today                    THEN 'expired'
      WHEN d.expires_at <= v_today + 30               THEN 'expiring'
      ELSE 'valid'
    END::TEXT,
    CASE WHEN d.expires_at IS NULL THEN NULL
         ELSE (d.expires_at - v_today)::INTEGER END,
    d.uploaded_by,
    COALESCE(NULLIF(btrim(p.full_name), ''), '—')::TEXT,
    d.is_archived, d.created_at
  FROM public.employee_documents d
  JOIN public.employees e
    ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
  LEFT JOIN public.profiles p ON p.id = d.uploaded_by
 WHERE d.tenant_id = v_tenant
   -- ★ العطل ①: غير الموظّف لا يرى السرّي
   AND (v_staff OR (d.employee_id = v_me AND NOT d.is_confidential))
   -- ★ العطل ⑥: الأرشفة تُخفي فعلاً
   AND d.is_archived = COALESCE(p_archived, FALSE)
   AND (p_type IS NULL OR d.document_type = p_type)
 -- ★★★ ترتيبٌ حتميّ: created_at قد يتساوى ⇒ id فاصلاً
 ORDER BY d.created_at DESC, d.id DESC;
END $$;

COMMENT ON FUNCTION public.employee_documents_board(TEXT, BOOLEAN) IS
  'لوح مستندات الموظفين: استعلامٌ واحد بدل حلقة O(n) في المتصفّح. '
  'يحترم السرّية (العطل ①) ويُخفي المؤرشف (⑥) ويحسب حالة الانتهاء '
  'بتوقيت بغداد (⑩).';

DROP FUNCTION IF EXISTS public.employee_documents_summary();
CREATE FUNCTION public.employee_documents_summary()
RETURNS TABLE (
  out_total        INTEGER,
  out_confidential INTEGER,
  out_expired      INTEGER,
  out_expiring     INTEGER,
  out_archived     INTEGER,
  out_no_uploader  INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص المستندات';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE NOT d.is_archived)::INTEGER,
    count(*) FILTER (WHERE NOT d.is_archived AND d.is_confidential)::INTEGER,
    count(*) FILTER (WHERE NOT d.is_archived
                       AND d.expires_at IS NOT NULL
                       AND d.expires_at < v_today)::INTEGER,
    count(*) FILTER (WHERE NOT d.is_archived
                       AND d.expires_at IS NOT NULL
                       AND d.expires_at >= v_today
                       AND d.expires_at <= v_today + 30)::INTEGER,
    count(*) FILTER (WHERE d.is_archived)::INTEGER,
    -- ★ العطل ⑧: كم وثيقة لا يُعرف رافعها (أثرٌ قائم في البيانات)
    count(*) FILTER (WHERE NOT d.is_archived AND d.uploaded_by IS NULL)::INTEGER
  FROM public.employee_documents d
 WHERE d.tenant_id = v_tenant;
END $$;

COMMENT ON FUNCTION public.employee_documents_summary() IS
  'ملخّص المستندات. out_no_uploader يعدّ أثر العطل ⑧ القائم في البيانات.';

-- ─────────────────────────────────────────────────────────────────
--  رفع وثيقة — نداءٌ واحد بحرّاس صريحة
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.document_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, DATE, BOOLEAN);
CREATE FUNCTION public.document_upload(
  p_employee_id  UUID,
  p_type         TEXT,
  p_title        TEXT,
  p_file_url     TEXT,
  p_file_name    TEXT    DEFAULT NULL,
  p_description  TEXT    DEFAULT NULL,
  p_file_size    BIGINT  DEFAULT NULL,
  p_mime_type    TEXT    DEFAULT NULL,
  p_expires_at   DATE    DEFAULT NULL,
  p_confidential BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED: رفع مستندات الموظفين للموارد البشرية';
  END IF;

  -- ★★★ العطل ③/④: الموظف موجود **وفي المستأجر نفسه**
  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'DOCUMENT_EMPLOYEE_NOT_FOUND';
  END IF;

  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'DOCUMENT_TITLE_REQUIRED';
  END IF;
  IF btrim(COALESCE(p_file_url,'')) = '' THEN
    RAISE EXCEPTION 'DOCUMENT_FILE_REQUIRED';
  END IF;
  -- ★ العطل ②: النوع من المفردات الثماني حصراً
  IF p_type NOT IN ('contract','certificate','id_copy','cv',
                    'medical','degree','recommendation','other') THEN
    RAISE EXCEPTION 'DOCUMENT_TYPE_INVALID: %', p_type;
  END IF;
  -- ★ العطل ⑩: تاريخ انتهاء في الماضي عبثٌ عند الرفع
  IF p_expires_at IS NOT NULL AND p_expires_at < v_today THEN
    RAISE EXCEPTION 'DOCUMENT_EXPIRY_IN_PAST';
  END IF;
  -- ★ العطل ⑨: الحجم موجب وضمن الحدّ
  IF p_file_size IS NOT NULL AND (p_file_size <= 0 OR p_file_size > 26214400) THEN
    RAISE EXCEPTION 'DOCUMENT_SIZE_INVALID';
  END IF;

  INSERT INTO public.employee_documents
    (tenant_id, employee_id, document_type, title, description,
     file_url, file_name, file_size, mime_type, expires_at, is_confidential)
  VALUES
    (v_tenant, p_employee_id, p_type, btrim(p_title), NULLIF(btrim(COALESCE(p_description,'')),''),
     btrim(p_file_url), p_file_name, p_file_size, p_mime_type, p_expires_at,
     COALESCE(p_confidential, FALSE))
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.document_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, DATE, BOOLEAN) IS
  'رفع وثيقة موظف بنداءٍ واحد. يحرس المستأجر والنوع والحجم وتاريخ '
  'الانتهاء. المحفّز يملأ uploaded_by ويرفع السرّية للطبّي والتوصية.';

-- ─────────────────────────────────────────────────────────────────
--  ضبط السرّية — العمود الميت يصير قابلاً للإدارة (العطل ①)
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.document_set_confidential(UUID, BOOLEAN);
CREATE FUNCTION public.document_set_confidential(
  p_document_id UUID,
  p_value       BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_type   TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED';
  END IF;

  SELECT d.document_type INTO v_type
    FROM public.employee_documents d
   WHERE d.id = p_document_id AND d.tenant_id = v_tenant;
  IF v_type IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;

  -- ★★ الطبّي والتوصية لا تُنزع سرّيتهما
  IF p_value IS FALSE AND v_type IN ('medical','recommendation') THEN
    RAISE EXCEPTION 'DOCUMENT_CONFIDENTIAL_LOCKED: % سرّيٌّ دائماً', v_type;
  END IF;

  UPDATE public.employee_documents
     SET is_confidential = p_value, updated_at = now()
   WHERE id = p_document_id AND tenant_id = v_tenant;

  RETURN p_value;
END $$;

COMMENT ON FUNCTION public.document_set_confidential(UUID, BOOLEAN) IS
  'ضبط سرّية الوثيقة. الطبّي وخطاب التوصية لا تُنزع سرّيتهما.';

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ الصلاحيات
--  ★★★ 0268 يمنح authenticated كل شيء على كل جدول جديد ⇒ REVOKE أولاً
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.employee_documents_board(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_documents_board(TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.employee_documents_board(TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.employee_documents_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_documents_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.employee_documents_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.document_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, DATE, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, DATE, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.document_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, DATE, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.document_set_confidential(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_set_confidential(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.document_set_confidential(UUID, BOOLEAN) TO authenticated;

COMMIT;
