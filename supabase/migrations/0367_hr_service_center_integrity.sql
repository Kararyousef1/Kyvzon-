-- ════════════════════════════════════════════════════════════════════════
--  0367 — سلامة مركز خدمات الموارد البشرية
--  المرحلة 4 — بوابة الموارد البشرية · hr/HRServiceCenterPage.tsx (198 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسباران _probe_0367.sql و _probe_0367b.sql — قاعدة نظيفة،    │
--  │   295 مايجريشناً، صفر فشل)                                       │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ★ إنصافاً للجدولين: `hr_cases` و`employee_letter_requests` فيهما
--    CHECK جيّدةٌ على المفردات (`status`/`priority`/`channel` و
--    `letter_type`/`language`/`delivery_method`)، و`tenant_id` و
--    `employee_id` كلاهما NOT NULL. الأعطال في مكانٍ آخر —
--    **في الجدار الأمنيّ وفي الترابط**.
--
--  ═══════════════════════════════════════════════════════════════════
--  أوّلاً: أعطال الجدار الأمنيّ — وهي الأخطر
--  ═══════════════════════════════════════════════════════════════════
--
--  ① ★★★★ **الموظف يُصدر شهادة راتبه ويعتمدها ويُسلّمها بنفسه.**
--
--     نصّ السياسة الحرفيّ من `pg_policy`:
--        kyvzon_letter_requests_write | polcmd = **'*'** (ALL)
--        USING/CHECK ((tenant_id = current_user_tenant_id())
--                     AND (current_user_is_staff()
--                          OR employee_id = auth.uid()
--                          OR employee_id = current_user_employee_id()))
--
--     `polcmd = '*'` تعني **ALL**: SELECT و INSERT و UPDATE و DELETE
--     في سياسةٍ واحدة. والموظف يمرّ منها بالشرط الثالث.
--
--     RLS_4 بدور `authenticated` حقيقيّ (سالم · employee):
--        UPDATE employee_letter_requests
--           SET status='delivered',
--               document_url='http://fake/شهادة-راتب-مزوّرة.pdf',
--               reviewed_by = <سالم نفسه>, reviewed_at = now()
--        ⇒ **حدّث 1 صفّاً · الحالة=delivered · الملفّ=الرابط المزوّر**
--
--     ⇒ شهادة الراتب وثيقةٌ تُقدَّم للمصارف والسفارات. والموظف يُنشئ
--       طلبها، ويرفع ملفّها، ويكتب أنه هو من راجعها، ويعلن تسليمها —
--       **بلا مرور HR إطلاقاً**. أخطر عطلٍ في هذه الجولة.
--
--  ② ★★★ **الموظف يُغلق شكواه بنفسه ويكتب «تم الحل».**
--     RLS_2: سالم `UPDATE hr_cases SET status='resolved',
--            resolution_summary='حللتُه بنفسي'` ⇒ **حدّث 1 صفّاً**،
--            والحالة صارت `resolved`.
--     ⇒ مؤشّر «طلبات محلولة» في الصفحة يصير بلا معنى: الموظف الغاضب
--       من خصمٍ في راتبه يستطيع أن يُغلق شكواه ويكتب أنها حُلّت.
--       والأسوأ: يستطيع أن يُغلقها **من دون أن تراها HR أصلاً**.
--
--  ③ ★★★ **الموظف يُسنِد الطلب لنفسه.**
--     RLS_3: نور `UPDATE hr_cases SET assigned_to = <نفسها>`
--            ⇒ حدّث 1 صفّاً · `assigned_to` صار معرّفها.
--     ⇒ «المسؤول عن الطلب» حقلٌ لا يعني شيئاً.
--
--  ④ ★★★ **الموظف يحذف طلب خطابه نهائياً.**
--     RLS_5: `DELETE FROM employee_letter_requests` ⇒ **حذف 1 صفّاً**.
--     (السياسة `ALL` تشمل DELETE.) يخالف قاعدة المشروع: لا حذف نهائيّ.
--
--  ⑤ ★★ **شرطٌ ميّتٌ في ثلاث سياساتٍ: `employee_id = auth.uid()`.**
--     PROBE_1: صفوف `employees` حيث `id = user_id` = **0** من **5**.
--     `employee_id` يشير إلى `employees.id` و`auth.uid()` هو
--     `auth.users.id` — درسٌ متكرّر منذ 0357 وأُصلح نظيرُه في 0364.
--     لا ضرر أمنيّ (الشرط الثالث يعمل)، لكنها **شيفرةٌ ميتة في جدارٍ
--     أمنيّ** تُوحي بأمانٍ مزدوجٍ غير موجود.
--
--  ⑥ ★★ **`hr_cases` بلا سياسة DELETE إطلاقاً.**
--     RLS_6: HR حاولت الحذف ⇒ **0 صفّ**. وهذا سليمٌ بالمصادفة لا
--     بالتصميم: لا سياسةَ تمنع، بل لا سياسةَ تسمح. نُثبّته صراحةً
--     بمحفّز منعٍ كي لا تفتحه مايجريشنٌ لاحقة سهواً.
--
--  ═══════════════════════════════════════════════════════════════════
--  ثانياً: أعطال الترابط والسلامة
--  ═══════════════════════════════════════════════════════════════════
--
--  ⑦ ★★★ **`hr_cases.employee_id` بلا مفتاح أجنبيّ.**
--     PROBE_2: طلبُ خدمةٍ لموظف `ffffffff-…` معدوم ⇒ **قُبِل**.
--
--  ⑧ ★★★ **العبور بين المستأجرين.**
--     PROBE_3: `tenant_id = ألف` مع موظفٍ من **باء**
--     (7c92ea70-af58-4e4a-9a3b-4cfe9feebaad) ⇒ **قُبِل**.
--     ⇒ الحلّ FK **مركَّب** لا مفرد.
--
--  ⑨ ★★★ **`employee_letter_requests.employee_id` بلا FK.**
--     PROBE_8: **شهادةُ راتبٍ لموظفٍ معدوم** ⇒ قُبِلت.
--
--  ⑩ ★★ **`assigned_to` و`reviewed_by` بلا FK.**
--     PROBE_4 و PROBE_11: طلبٌ مُسنَدٌ إلى مستخدمٍ معدوم، وخطابٌ
--     اعتمده مستخدمٌ معدوم ⇒ قُبِلا.
--     ★ عنوانهما `profiles` لا `employees`: الصفحة تُسند
--       `assigned_to: user?.id` و`reviewed_by: user?.id` وهو
--       `auth.users.id` = `profiles.id`.
--
--  ⑪ ★★ **`subject` و`description` من مسافات.**
--     PROBE_5: طلبٌ بموضوعٍ ووصفٍ نصُّهما `'   '` ⇒ قُبِل.
--     `NOT NULL` لا يمنع المسافات.
--
--  ⑫ ★★★ **«تم الحل» بلا ملخّص حلٍّ ولا لحظة.**
--     PROBE_6: `status='resolved'` مع `resolution_summary = NULL`
--     و`resolved_at = NULL` ⇒ **قُبِل**.
--     ⇒ سجلٌّ يقول «حُلّ» ولا يقول كيف ولا متى.
--
--  ⑬ ★★★ **«جاهز»/«تم التسليم» بلا ملفّ خطاب.**
--     PROBE_9: `status='delivered'` و`document_url = NULL` ⇒ قُبِل.
--     ⇒ الموظف يرى «تم التسليم» ولا شيء ليُنزّله.
--
--  ⑭ ★★★ **«مرفوض» بلا سبب — ولا عمود أصلاً.**
--     PROBE_10: أعمدةٌ فيها `reject` في `employee_letter_requests`
--     = **0**. والحالة `rejected` من مفردات CHECK.
--     ⇒ مفردةٌ موجودةٌ في القيد، بلا مكانٍ لتعليلها، **وبلا زرٍّ في
--       الصفحة** (الصفحة تعرض «تجهيز» و«قيد المراجعة» و«تم التسليم»
--       فقط — فالرفض حالةٌ لا سبيل إلى بلوغها من الواجهة).
--
--  ⑮ ★★★ **`sla_due_at` عمودٌ ميّت.**
--     PROBE_7: دوالٌ تذكره = **0** · محفّزاتٌ تملؤه = **0** ·
--     صفوفٌ ممتلئة = **0**.
--     ⇒ عمودُ «موعد الاستحقاق» في نظام خدماتٍ لا يُملأ أبداً، فلا
--       تأخّرَ يُرصد ولا تصعيدَ يقع. والصفحة لا تعرضه.
--
--  ⑯ ★★★ **صفر دالة في المنظومة.**
--     PROBE_12: دوالٌ اسمها `%hr_case%` أو `%letter%` = **0**.
--     ⇒ الصفحة تكتب مباشرةً عبر `BaseService.update()`، فكل حارسٍ
--       منطقيٍّ غائبٌ بالضرورة.
--
--  ═══════════════════════════════════════════════════════════════════
--  ثالثاً: أعطال الصفحة نفسها (فحصٌ ثابت — تُعالَج في إعادة الكتابة)
--  ═══════════════════════════════════════════════════════════════════
--  ⑰ `useState<any[]>([])` للموظفين — انتهاكٌ صريح لقاعدة المشروع.
--  ⑱ جلبُ **كل** الموظفين و`Map` يدويّ و`orderBy: 'full_name_ar'`
--     على عمودٍ معدومٍ لكل موظف.
--  ⑲ `findAll` بلا حدٍّ للجدولين — ثلاثة استعلاماتٍ بلا `limit`.
--  ⑳ `item.priority` تُعرض **نصّاً إنجليزياً خامّاً** (`urgent`).
--  ㉑ `letter_type` و`language` و`delivery_method` كذلك خامّة.
--  ㉒ الترشيح كلُّه في المتصفّح بعد جلب كل شيء.
--
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف البيانات القائمة قبل فرض القيود
-- ═══════════════════════════════════════════════════════════════════

UPDATE public.hr_cases
   SET subject = '(موضوعٌ غير مُدوَّن — سجلٌّ سابقٌ لسريان القيد)'
 WHERE btrim(COALESCE(subject,'')) = '';

UPDATE public.hr_cases
   SET description = '(وصفٌ غير مُدوَّن — سجلٌّ سابقٌ لسريان القيد)'
 WHERE btrim(COALESCE(description,'')) = '';

-- «حُلَّ» بلا لحظة ⇒ نُثبّت اللحظة من آخر تحديث
UPDATE public.hr_cases
   SET resolved_at = COALESCE(resolved_at, updated_at, created_at)
 WHERE status IN ('resolved','closed') AND resolved_at IS NULL;

UPDATE public.hr_cases
   SET resolution_summary = '(حُلَّ قبل سريان القيد — الملخّص غير مُدوَّن)'
 WHERE status IN ('resolved','closed')
   AND btrim(COALESCE(resolution_summary,'')) = '';

-- خطابٌ «جاهز»/«مُسلَّم» بلا ملفّ ⇒ يعود إلى المراجعة (لا نُتلف شيئاً)
UPDATE public.employee_letter_requests
   SET status = 'in_review'
 WHERE status IN ('ready','delivered')
   AND btrim(COALESCE(document_url,'')) = '';

-- ═══════════════════════════════════════════════════════════════════
--  ① عمود سبب الرفض (العطل ⑭) وأعمدة دورة الحياة
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.employee_letter_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS issued_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.employee_letter_requests.rejection_reason IS
  'سبب رفض طلب الخطاب. الحالة rejected كانت في CHECK بلا مكانٍ لتعليلها — 0367';

ALTER TABLE public.hr_cases
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_count    INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hr_cases.first_response_at IS
  'لحظة أول ردٍّ من الموارد البشرية — أساس قياس الاستجابة — 0367';
COMMENT ON COLUMN public.hr_cases.sla_due_at IS
  'موعد الاستحقاق. كان عموداً ميتاً (صفر دالة وصفر محفّز) حتى 0367 — '
  'يملؤه tg_hr_case_guard حسب الأولوية.';

-- ═══════════════════════════════════════════════════════════════════
--  ② المفاتيح الأجنبية المركَّبة (الأعطال ⑦/⑧/⑨/⑩)
--     ★★★ FK مركَّب (id, tenant_id) لا مفرد — هو الذي يمنع العبور.
--     الفهرسان `uq_employees_id_tenant` (0360) و`uq_profiles_id_tenant`
--     (0365) موجودان — مُحقَّقان من pg_indexes.
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_cases'::regclass
      AND conname='fk_hr_cases_employee_tenant') THEN
    ALTER TABLE public.hr_cases ADD CONSTRAINT fk_hr_cases_employee_tenant
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_cases'::regclass
      AND conname='fk_hr_cases_assignee_tenant') THEN
    ALTER TABLE public.hr_cases ADD CONSTRAINT fk_hr_cases_assignee_tenant
      FOREIGN KEY (assigned_to, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.employee_letter_requests'::regclass
      AND conname='fk_letter_employee_tenant') THEN
    ALTER TABLE public.employee_letter_requests
      ADD CONSTRAINT fk_letter_employee_tenant
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.employee_letter_requests'::regclass
      AND conname='fk_letter_reviewer_tenant') THEN
    ALTER TABLE public.employee_letter_requests
      ADD CONSTRAINT fk_letter_reviewer_tenant
      FOREIGN KEY (reviewed_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ③ القيود (الأعطال ⑪/⑫/⑬/⑭)
--  ★★★ حذارِ الثغرة الثلاثية (درس 0365): `x = 'v'` تُعطي NULL حين
--    يكون x معدوماً، و CHECK يقبل NULL. نستعمل IS NULL / btrim صراحةً.
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_cases'::regclass
      AND conname='chk_hr_cases_subject_present') THEN
    ALTER TABLE public.hr_cases ADD CONSTRAINT chk_hr_cases_subject_present
      CHECK (btrim(subject) <> '' AND btrim(description) <> '');
  END IF;
END $$;

-- «تم الحل»/«مغلق» يستلزم ملخّصاً ولحظة
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_cases'::regclass
      AND conname='chk_hr_cases_resolved_complete') THEN
    ALTER TABLE public.hr_cases ADD CONSTRAINT chk_hr_cases_resolved_complete
      CHECK (
        status NOT IN ('resolved','closed')
        OR (resolved_at IS NOT NULL
            AND btrim(COALESCE(resolution_summary,'')) <> '')
      );
  END IF;
END $$;

-- «جاهز»/«مُسلَّم» يستلزم ملفّاً
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.employee_letter_requests'::regclass
      AND conname='chk_letter_ready_needs_document') THEN
    ALTER TABLE public.employee_letter_requests
      ADD CONSTRAINT chk_letter_ready_needs_document
      CHECK (status NOT IN ('ready','delivered')
             OR btrim(COALESCE(document_url,'')) <> '');
  END IF;
END $$;

-- «مرفوض» يستلزم سبباً — والعكس: سببٌ بلا رفضٍ ممنوع
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.employee_letter_requests'::regclass
      AND conname='chk_letter_rejected_needs_reason') THEN
    ALTER TABLE public.employee_letter_requests
      ADD CONSTRAINT chk_letter_rejected_needs_reason
      CHECK (
        (status = 'rejected' AND btrim(COALESCE(rejection_reason,'')) <> '')
        OR (status <> 'rejected' AND rejection_reason IS NULL)
      );
  END IF;
END $$;

-- «مُسلَّم» يستلزم لحظة تسليم
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.employee_letter_requests'::regclass
      AND conname='chk_letter_delivered_complete') THEN
    ALTER TABLE public.employee_letter_requests
      ADD CONSTRAINT chk_letter_delivered_complete
      CHECK ((status = 'delivered' AND delivered_at IS NOT NULL)
             OR (status <> 'delivered' AND delivered_at IS NULL));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ④ فهارس
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_hr_cases_tenant_status
  ON public.hr_cases (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_cases_employee
  ON public.hr_cases (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_cases_sla_open
  ON public.hr_cases (sla_due_at)
  WHERE status IN ('open','in_review','waiting_employee');
CREATE INDEX IF NOT EXISTS idx_letter_tenant_status
  ON public.employee_letter_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_letter_employee
  ON public.employee_letter_requests (employee_id);

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ ★★★★ إصلاح الجدار الأمنيّ (الأعطال ①/②/③/④/⑤/⑥)
--
--  ★ المبدأ: الموظف **يُنشئ ويقرأ**، والموارد البشرية **تُقرّر**.
--    فصلُ سياسة UPDATE عن INSERT هو جوهر الإصلاح — السياسة القديمة
--    كانت `ALL` واحدة تخلطهما.
-- ═══════════════════════════════════════════════════════════════════

-- ── hr_cases ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_hr_cases_select ON public.hr_cases;
CREATE POLICY kyvzon_hr_cases_select ON public.hr_cases
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         -- ★ العطل ⑤: أُسقط الشرط الميّت `employee_id = auth.uid()`
         OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_hr_cases_insert ON public.hr_cases;
CREATE POLICY kyvzon_hr_cases_insert ON public.hr_cases
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

-- ★★★ العطلان ②/③: التحديث للموارد البشرية وحدها.
--   الموظف يُنشئ الطلب ويقرأه، ولا يُغيّر حالته ولا يُسنِده.
DROP POLICY IF EXISTS kyvzon_hr_cases_update ON public.hr_cases;
CREATE POLICY kyvzon_hr_cases_update ON public.hr_cases
  FOR UPDATE
  USING (tenant_id = public.current_user_tenant_id()
         AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id()
              AND public.current_user_is_staff());

-- ── employee_letter_requests ──────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_letter_requests_select ON public.employee_letter_requests;
CREATE POLICY kyvzon_letter_requests_select ON public.employee_letter_requests
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

-- ★★★★ العطلان ①/④: السياسة القديمة `kyvzon_letter_requests_write`
--   كانت `polcmd='*'` أي ALL — فالموظف يُحدّث ويحذف. تُستبدل
--   بسياستَين: إنشاءٌ للموظف، وتحديثٌ للموارد البشرية وحدها.
DROP POLICY IF EXISTS kyvzon_letter_requests_write ON public.employee_letter_requests;

DROP POLICY IF EXISTS kyvzon_letter_requests_insert ON public.employee_letter_requests;
CREATE POLICY kyvzon_letter_requests_insert ON public.employee_letter_requests
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_letter_requests_update ON public.employee_letter_requests;
CREATE POLICY kyvzon_letter_requests_update ON public.employee_letter_requests
  FOR UPDATE
  USING (tenant_id = public.current_user_tenant_id()
         AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id()
              AND public.current_user_is_staff());

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ محفّزات الحراسة
-- ═══════════════════════════════════════════════════════════════════

-- ★★★ العطل ⑮: `sla_due_at` يُملأ حسب الأولوية — لم يكن يُملأ أبداً.
--   المهل: عاجل 4 ساعات · عادي يومان · منخفض خمسة أيام.
CREATE OR REPLACE FUNCTION public.tg_hr_case_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sla_due_at IS NULL THEN
      NEW.sla_due_at := NEW.created_at + CASE NEW.priority
        WHEN 'urgent' THEN INTERVAL '4 hours'
        WHEN 'normal' THEN INTERVAL '2 days'
        ELSE               INTERVAL '5 days'
      END;
    END IF;
  ELSE
    -- ★ تجميد ما لا يجوز تغييره
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    NEW.created_at  := OLD.created_at;

    -- ★ أول ردٍّ فعليّ: مغادرة `open` أو أول إسنادٍ أو أول ملخّص
    IF NEW.first_response_at IS NULL
       AND (NEW.status <> 'open'
            OR (NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL)
            OR btrim(COALESCE(NEW.resolution_summary,'')) <> '') THEN
      NEW.first_response_at := now();
    END IF;

    -- ★ لحظة الحلّ تُملأ آلياً فلا يعتمد القيد على المتصفّح
    IF NEW.status IN ('resolved','closed') AND OLD.status NOT IN ('resolved','closed') THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      NEW.closed_at := COALESCE(NEW.closed_at, now());
    END IF;

    -- ★ إعادة الفتح تُعدّ — مؤشّرٌ على حلٍّ لم يكن حلاًّ
    IF OLD.status IN ('resolved','closed')
       AND NEW.status NOT IN ('resolved','closed') THEN
      NEW.reopened_count := OLD.reopened_count + 1;
      NEW.resolved_at    := NULL;
      NEW.closed_at      := NULL;
      -- ★★★ القيد يشترط الملخّص مع الحالة المُغلقة فقط، وإفراغُه هنا
      --   مقصود: الحلُّ السابق لم يَعُد قائماً.
      NEW.resolution_summary := NULL;
    END IF;

    -- ★ تغيّر الأولوية يُعيد حساب الاستحقاق
    IF NEW.priority <> OLD.priority THEN
      NEW.sla_due_at := NEW.created_at + CASE NEW.priority
        WHEN 'urgent' THEN INTERVAL '4 hours'
        WHEN 'normal' THEN INTERVAL '2 days'
        ELSE               INTERVAL '5 days'
      END;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_case_guard ON public.hr_cases;
CREATE TRIGGER trg_hr_case_guard
  BEFORE INSERT OR UPDATE ON public.hr_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_case_guard();

CREATE OR REPLACE FUNCTION public.tg_letter_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    NEW.created_at  := OLD.created_at;

    IF NEW.status = 'ready' AND OLD.status <> 'ready' THEN
      NEW.issued_at := COALESCE(NEW.issued_at, now());
    END IF;
    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
      NEW.delivered_at := COALESCE(NEW.delivered_at, now());
    END IF;
    -- ★ الخروج من «مُسلَّم» يُفرغ اللحظة كي يبقى القيد متّسقاً
    IF NEW.status <> 'delivered' AND OLD.status = 'delivered' THEN
      NEW.delivered_at := NULL;
    END IF;
    -- ★ الخروج من «مرفوض» يُفرغ السبب (القيد يمنع سبباً بلا رفض)
    IF NEW.status <> 'rejected' THEN
      NEW.rejection_reason := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_letter_guard ON public.employee_letter_requests;
CREATE TRIGGER trg_letter_guard
  BEFORE INSERT OR UPDATE ON public.employee_letter_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_letter_guard();

-- ★★★ العطلان ④/⑥: منع الحذف النهائيّ صراحةً على الجدولين
CREATE OR REPLACE FUNCTION public.tg_block_service_center_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SERVICE_CENTER_DELETE_BLOCKED: سجلّات مركز الخدمات لا تُحذف — استعمل الإغلاق أو الرفض (%s id=%)',
    TG_TABLE_NAME, OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_block_hr_case_delete ON public.hr_cases;
CREATE TRIGGER trg_block_hr_case_delete
  BEFORE DELETE ON public.hr_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_service_center_delete();

DROP TRIGGER IF EXISTS trg_block_letter_delete ON public.employee_letter_requests;
CREATE TRIGGER trg_block_letter_delete
  BEFORE DELETE ON public.employee_letter_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_service_center_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ اللوح والملخّص (العطل ⑯ — كانت صفر دالة)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_case_board(TEXT, TEXT, TEXT, INTEGER);
CREATE FUNCTION public.hr_case_board(
  p_search   TEXT    DEFAULT NULL,
  p_status   TEXT    DEFAULT NULL,
  p_priority TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 200
)
RETURNS TABLE (
  id                 UUID,
  employee_id        UUID,
  employee_name      TEXT,
  employee_code      TEXT,
  case_type          TEXT,
  subject            TEXT,
  description        TEXT,
  priority           TEXT,
  status             TEXT,
  channel            TEXT,
  assigned_to        UUID,
  assignee_name      TEXT,
  resolution_summary TEXT,
  sla_due_at         TIMESTAMPTZ,
  hours_to_sla       NUMERIC,
  is_overdue         BOOLEAN,
  first_response_at  TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  reopened_count     INTEGER,
  created_at         TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.employee_id,
    -- ★ العطل ⑱: full_name_ar معدومٌ بنيوياً ⇒ نُركّب الاسم
    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,
    e.employee_code::TEXT,
    c.case_type::TEXT,
    c.subject::TEXT,
    c.description::TEXT,
    c.priority::TEXT,
    c.status::TEXT,
    c.channel::TEXT,
    c.assigned_to,
    COALESCE(NULLIF(btrim(pa.full_name), ''), NULL)::TEXT,
    c.resolution_summary::TEXT,
    c.sla_due_at,
    -- ★★★ الساعات المتبقّية — محسوبةٌ في القاعدة لا بساعة المتصفّح
    CASE WHEN c.sla_due_at IS NULL THEN NULL
         ELSE round(EXTRACT(EPOCH FROM (c.sla_due_at - now())) / 3600.0, 1)
    END,
    -- ★★★ العطل ⑮ مرئيّاً: متأخّرٌ ولمّا يُغلق
    (c.sla_due_at IS NOT NULL
       AND c.sla_due_at < now()
       AND c.status NOT IN ('resolved','closed')),
    c.first_response_at,
    c.resolved_at,
    c.closed_at,
    c.reopened_count,
    c.created_at
  FROM public.hr_cases c
  LEFT JOIN public.employees e ON e.id = c.employee_id AND e.tenant_id = c.tenant_id
  LEFT JOIN public.profiles pa ON pa.id = c.assigned_to
  WHERE (p_status   IS NULL OR c.status   = p_status)
    AND (p_priority IS NULL OR c.priority = p_priority)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR c.subject     ILIKE '%' || btrim(p_search) || '%'
      OR c.description ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.full_name_ar,'') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')
           ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.employee_code,'') ILIKE '%' || btrim(p_search) || '%'
    )
  -- ★★★ ترتيبٌ حتميّ: العاجل أولاً ثم الأقرب استحقاقاً.
  --   `created_at` قد يتساوى (طابع المعاملة — درس 0362) ⇒ نُذيّله بـid.
  ORDER BY
    CASE WHEN c.status IN ('resolved','closed') THEN 1 ELSE 0 END,
    CASE c.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
    c.sla_due_at ASC NULLS LAST,
    c.created_at DESC,
    c.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

DROP FUNCTION IF EXISTS public.letter_request_board(TEXT, TEXT, TEXT, INTEGER);
CREATE FUNCTION public.letter_request_board(
  p_search TEXT    DEFAULT NULL,
  p_status TEXT    DEFAULT NULL,
  p_type   TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  id               UUID,
  employee_id      UUID,
  employee_name    TEXT,
  employee_code    TEXT,
  letter_type      TEXT,
  purpose          TEXT,
  language         TEXT,
  delivery_method  TEXT,
  status           TEXT,
  document_url     TEXT,
  rejection_reason TEXT,
  reviewed_by      UUID,
  reviewer_name    TEXT,
  reviewed_at      TIMESTAMPTZ,
  issued_at        TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  waiting_days     INTEGER,
  created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.employee_id,
    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,
    e.employee_code::TEXT,
    l.letter_type::TEXT,
    l.purpose::TEXT,
    l.language::TEXT,
    l.delivery_method::TEXT,
    l.status::TEXT,
    l.document_url::TEXT,
    l.rejection_reason::TEXT,
    l.reviewed_by,
    COALESCE(NULLIF(btrim(pr.full_name), ''), NULL)::TEXT,
    l.reviewed_at,
    l.issued_at,
    l.delivered_at,
    -- ★★★ أيام الانتظار بتوقيت بغداد صراحةً — الخادم Etc/UTC
    CASE WHEN l.status IN ('delivered','rejected') THEN NULL
         ELSE (v_today - (l.created_at AT TIME ZONE 'Asia/Baghdad')::DATE)
    END::INTEGER,
    l.created_at
  FROM public.employee_letter_requests l
  LEFT JOIN public.employees e ON e.id = l.employee_id AND e.tenant_id = l.tenant_id
  LEFT JOIN public.profiles pr ON pr.id = l.reviewed_by
  WHERE (p_status IS NULL OR l.status = p_status)
    AND (p_type   IS NULL OR l.letter_type = p_type)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR COALESCE(l.purpose,'') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.full_name_ar,'') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')
           ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.employee_code,'') ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY
    CASE WHEN l.status IN ('delivered','rejected') THEN 1 ELSE 0 END,
    l.created_at DESC,
    l.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

DROP FUNCTION IF EXISTS public.service_center_summary();
CREATE FUNCTION public.service_center_summary()
RETURNS TABLE (
  cases_total        INTEGER,
  cases_open         INTEGER,
  cases_urgent       INTEGER,
  cases_resolved     INTEGER,
  cases_overdue      INTEGER,
  cases_unassigned   INTEGER,
  cases_no_response  INTEGER,
  cases_reopened     INTEGER,
  letters_total      INTEGER,
  letters_pending    INTEGER,
  letters_ready      INTEGER,
  letters_delivered  INTEGER,
  letters_rejected   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.hr_cases)::INTEGER,
    (SELECT count(*) FROM public.hr_cases
      WHERE status IN ('open','in_review','waiting_employee'))::INTEGER,
    (SELECT count(*) FROM public.hr_cases
      WHERE priority = 'urgent' AND status NOT IN ('resolved','closed'))::INTEGER,
    (SELECT count(*) FROM public.hr_cases
      WHERE status IN ('resolved','closed'))::INTEGER,
    -- ★★★ العطل ⑮ مقروءاً: متأخّرٌ عن الاستحقاق ولمّا يُغلق
    (SELECT count(*) FROM public.hr_cases
      WHERE sla_due_at IS NOT NULL AND sla_due_at < now()
        AND status NOT IN ('resolved','closed'))::INTEGER,
    (SELECT count(*) FROM public.hr_cases
      WHERE assigned_to IS NULL AND status NOT IN ('resolved','closed'))::INTEGER,
    (SELECT count(*) FROM public.hr_cases
      WHERE first_response_at IS NULL AND status NOT IN ('resolved','closed'))::INTEGER,
    (SELECT count(*) FROM public.hr_cases WHERE reopened_count > 0)::INTEGER,
    (SELECT count(*) FROM public.employee_letter_requests)::INTEGER,
    (SELECT count(*) FROM public.employee_letter_requests
      WHERE status IN ('submitted','in_review'))::INTEGER,
    (SELECT count(*) FROM public.employee_letter_requests WHERE status = 'ready')::INTEGER,
    (SELECT count(*) FROM public.employee_letter_requests WHERE status = 'delivered')::INTEGER,
    (SELECT count(*) FROM public.employee_letter_requests WHERE status = 'rejected')::INTEGER;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ دوال القرار — بحرّاس الدور (العطلان ②/③)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_case_open(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.hr_case_open(
  p_employee_id UUID,
  p_case_type   TEXT,
  p_subject     TEXT,
  p_description TEXT,
  p_priority    TEXT DEFAULT 'normal',
  p_channel     TEXT DEFAULT 'employee_portal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_me     UUID := public.current_user_employee_id();
  v_target UUID := COALESCE(p_employee_id, v_me);
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'CASE_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF btrim(COALESCE(p_subject,'')) = '' OR btrim(COALESCE(p_description,'')) = '' THEN
    RAISE EXCEPTION 'CASE_SUBJECT_REQUIRED: الموضوع والوصف مطلوبان';
  END IF;
  IF COALESCE(p_priority,'normal') NOT IN ('low','normal','urgent') THEN
    RAISE EXCEPTION 'CASE_BAD_PRIORITY: أولوية غير معروفة %', p_priority;
  END IF;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'CASE_NO_EMPLOYEE: لا صفّ موظفٍ في السياق';
  END IF;
  -- ★★★ الموظف يفتح طلباً لنفسه فقط؛ الموارد البشرية تفتح لأيّ أحد
  IF NOT public.current_user_is_staff() AND v_target IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'CASE_NOT_OWNER: لا تفتح طلباً باسم موظفٍ آخر';
  END IF;

  INSERT INTO public.hr_cases
    (tenant_id, employee_id, case_type, subject, description, priority, channel)
  VALUES (v_tenant, v_target, COALESCE(p_case_type,'general_inquiry'),
          btrim(p_subject), btrim(p_description),
          COALESCE(p_priority,'normal'), COALESCE(p_channel,'employee_portal'))
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

DROP FUNCTION IF EXISTS public.hr_case_assign(UUID, UUID);
CREATE FUNCTION public.hr_case_assign(p_id UUID, p_assignee UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_n INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CASE_NO_TENANT: لا مستأجر في السياق'; END IF;
  -- ★★★ العطل ③
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CASE_NOT_STAFF: الإسناد للموارد البشرية والإدارة فقط';
  END IF;

  UPDATE public.hr_cases
     SET assigned_to = COALESCE(p_assignee, auth.uid()),
         status = CASE WHEN status = 'open' THEN 'in_review' ELSE status END
   WHERE id = p_id AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN RAISE EXCEPTION 'CASE_NOT_FOUND: الطلب غير موجود'; END IF;
  RETURN TRUE;
END $$;

DROP FUNCTION IF EXISTS public.hr_case_set_status(UUID, TEXT, TEXT);
CREATE FUNCTION public.hr_case_set_status(
  p_id      UUID,
  p_status  TEXT,
  p_summary TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old    TEXT;
  v_sum    TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CASE_NO_TENANT: لا مستأجر في السياق'; END IF;
  -- ★★★ العطل ②: الموظف كان يُغلق شكواه بنفسه
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CASE_NOT_STAFF: تغيير حالة الطلب للموارد البشرية والإدارة فقط';
  END IF;
  IF p_status NOT IN ('open','in_review','waiting_employee','resolved','closed') THEN
    RAISE EXCEPTION 'CASE_BAD_STATUS: حالة غير معروفة %', p_status;
  END IF;

  SELECT status, resolution_summary INTO v_old, v_sum
    FROM public.hr_cases WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'CASE_NOT_FOUND: الطلب غير موجود'; END IF;

  -- ★★★ العطل ⑫: لا إغلاق بلا ملخّص. نقبل ملخّصاً سابقاً إن وُجد.
  IF p_status IN ('resolved','closed')
     AND btrim(COALESCE(p_summary, v_sum, '')) = '' THEN
    RAISE EXCEPTION 'CASE_SUMMARY_REQUIRED: ملخّص الحلّ مطلوب عند الإغلاق';
  END IF;

  UPDATE public.hr_cases
     SET status = p_status,
         resolution_summary = CASE
           WHEN btrim(COALESCE(p_summary,'')) <> '' THEN btrim(p_summary)
           ELSE resolution_summary END,
         assigned_to = COALESCE(assigned_to, auth.uid())
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN p_status;
END $$;

DROP FUNCTION IF EXISTS public.letter_request_open(UUID, TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.letter_request_open(
  p_employee_id UUID,
  p_letter_type TEXT,
  p_purpose     TEXT DEFAULT NULL,
  p_language    TEXT DEFAULT 'ar',
  p_delivery    TEXT DEFAULT 'portal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_me     UUID := public.current_user_employee_id();
  v_target UUID := COALESCE(p_employee_id, v_me);
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'LETTER_NO_TENANT: لا مستأجر في السياق'; END IF;
  IF p_letter_type NOT IN ('employment_verification','salary_certificate',
                           'experience_letter','other') THEN
    RAISE EXCEPTION 'LETTER_BAD_TYPE: نوع خطاب غير معروف %', p_letter_type;
  END IF;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'LETTER_NO_EMPLOYEE: لا صفّ موظفٍ في السياق';
  END IF;
  IF NOT public.current_user_is_staff() AND v_target IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'LETTER_NOT_OWNER: لا تطلب خطاباً باسم موظفٍ آخر';
  END IF;

  INSERT INTO public.employee_letter_requests
    (tenant_id, employee_id, letter_type, purpose, language, delivery_method)
  VALUES (v_tenant, v_target, p_letter_type,
          NULLIF(btrim(COALESCE(p_purpose,'')),''),
          COALESCE(p_language,'ar'), COALESCE(p_delivery,'portal'))
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ★★★★ العطل ①: إصدار الخطاب — للموارد البشرية وحدها
DROP FUNCTION IF EXISTS public.letter_request_issue(UUID, TEXT);
CREATE FUNCTION public.letter_request_issue(p_id UUID, p_document_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_status TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'LETTER_NO_TENANT: لا مستأجر في السياق'; END IF;
  -- ★★★★ هذا هو جوهر العطل: الموظف كان يُصدر شهادة راتبه بنفسه
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LETTER_NOT_STAFF: إصدار الخطابات للموارد البشرية والإدارة فقط';
  END IF;
  IF btrim(COALESCE(p_document_url,'')) = '' THEN
    RAISE EXCEPTION 'LETTER_DOCUMENT_REQUIRED: ملفّ الخطاب مطلوب';
  END IF;

  SELECT status INTO v_status FROM public.employee_letter_requests
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'LETTER_NOT_FOUND: الطلب غير موجود'; END IF;
  IF v_status IN ('delivered','rejected') THEN
    RAISE EXCEPTION 'LETTER_ALREADY_CLOSED: الطلب مُنجزٌ سلفاً (%)', v_status;
  END IF;

  UPDATE public.employee_letter_requests
     SET status = 'ready',
         document_url = btrim(p_document_url),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

DROP FUNCTION IF EXISTS public.letter_request_deliver(UUID);
CREATE FUNCTION public.letter_request_deliver(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_status TEXT; v_url TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'LETTER_NO_TENANT: لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LETTER_NOT_STAFF: التسليم للموارد البشرية والإدارة فقط';
  END IF;

  SELECT status, document_url INTO v_status, v_url
    FROM public.employee_letter_requests WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'LETTER_NOT_FOUND: الطلب غير موجود'; END IF;
  -- ★★★ العطل ⑬: لا تسليمَ لخطابٍ لم يُصدَر
  IF btrim(COALESCE(v_url,'')) = '' THEN
    RAISE EXCEPTION 'LETTER_NOT_ISSUED: لا يُسلَّم خطابٌ بلا ملفّ — أصدره أولاً';
  END IF;
  IF v_status = 'delivered' THEN RETURN FALSE; END IF;

  UPDATE public.employee_letter_requests
     SET status = 'delivered', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

-- ★★★ العطل ⑭: الرفض — حالةٌ كانت في CHECK بلا سببٍ ولا زرّ
DROP FUNCTION IF EXISTS public.letter_request_reject(UUID, TEXT);
CREATE FUNCTION public.letter_request_reject(p_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_status TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'LETTER_NO_TENANT: لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LETTER_NOT_STAFF: الرفض للموارد البشرية والإدارة فقط';
  END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'LETTER_REJECT_REASON_REQUIRED: سبب الرفض مطلوب';
  END IF;

  SELECT status INTO v_status FROM public.employee_letter_requests
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'LETTER_NOT_FOUND: الطلب غير موجود'; END IF;
  IF v_status = 'delivered' THEN
    RAISE EXCEPTION 'LETTER_ALREADY_DELIVERED: لا يُرفض خطابٌ سُلِّم';
  END IF;

  UPDATE public.employee_letter_requests
     SET status = 'rejected',
         rejection_reason = btrim(p_reason),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑨ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE تلقائياً (pg_default_acl)
--    ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.hr_case_board(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_case_board(TEXT, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_case_board(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.letter_request_board(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.letter_request_board(TEXT, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.letter_request_board(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.service_center_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_center_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.service_center_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.hr_case_open(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_case_open(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_case_open(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.hr_case_assign(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_case_assign(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_case_assign(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.hr_case_set_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_case_set_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_case_set_status(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.letter_request_open(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.letter_request_open(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.letter_request_open(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.letter_request_issue(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.letter_request_issue(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.letter_request_issue(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.letter_request_deliver(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.letter_request_deliver(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.letter_request_deliver(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.letter_request_reject(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.letter_request_reject(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.letter_request_reject(UUID, TEXT) TO authenticated;

COMMIT;
