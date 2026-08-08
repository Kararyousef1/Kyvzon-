-- ════════════════════════════════════════════════════════════════════════
--  0371 — سلامة صندوق بريد الموارد البشرية
--  المرحلة 4 — بوابة الموارد البشرية · hr/HRCommunicationPage.tsx (121 سطراً)
--  ★ الصفحة الأخيرة في المرحلة الرابعة
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطرٍ واحد    │
--  │  (المسبار: tools/dev/_probe_0371.sql — قاعدة نظيفة، 299 م.)      │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ═══════════════════════════════════════════════════════════════════
--  ① ★★★★ **الصفحة تعرض اسماً فارغاً لكلّ رسالة — دائماً**
--  ═══════════════════════════════════════════════════════════════════
--
--     `MessageService.findAllWithProfiles()` (السطر 43):
--        .select('*, profiles(full_name, department)')
--
--     PROBE_1 — المفاتيح الأجنبية الفعلية على `hr_messages`:
--        hr_messages_employee_id_fkey → **employees**(id) ON DELETE CASCADE
--        hr_messages_replied_by_fkey  → **employees**(id)
--        hr_messages_tenant_id_fkey   → tenants(id)
--
--        عدد المفاتيح إلى `profiles` = **صفر**
--
--     ⇒ PostgREST لا يجد علاقةً باسم `profiles` فيردّ الاستعلام بخطأ،
--       والخدمة تبتلعه في `catch` وتُعيد `[]` (السطر 55–58):
--            console.error(…); return [];
--       ⇒ **صندوق البريد فارغٌ دائماً** — أو في أحسن الأحوال
--         `msg.profiles?.full_name ?? ""` فيظهر سطرٌ بلا مُرسِل.
--
--     ★ والصفحة تعرض ذلك حرفياً في السطر 78 و97:
--          {(msg.profiles?.full_name ?? "")}
--          ({(selected.profiles?.department ?? "")})
--       سلسلةٌ فارغةٌ بين قوسين — لا «غير محدَّد» ولا شيء.
--
--  ═══════════════════════════════════════════════════════════════════
--  ② ★★★★ **الأزرار الثلاثة بلا `onClick` — زينةٌ خالصة**
--  ═══════════════════════════════════════════════════════════════════
--
--     السطر 107–109:
--        <Button variant="success" icon={<Check/>}>وضع علامة كمكتمل</Button>
--        <Button variant="outline" icon={<Archive/>}>أرشفة</Button>
--        <Button className="mr-auto" icon={<Send/>}>رد</Button>
--
--     ثلاثةُ أزرارٍ **بلا معالجِ نقرٍ واحد**. المستخدم يضغط «رد» فلا
--     يحدث شيء — لا خطأ ولا رسالة. والزرّ الصامت أسوأ من الغائب:
--     الغائب يُعلن عجزه.
--
--  ═══════════════════════════════════════════════════════════════════
--  ③ ★★★ **أعمدة الردّ الثلاثة ميتة**
--  ═══════════════════════════════════════════════════════════════════
--
--     `reply` · `replied_by` · `replied_at` موجودةٌ في الجدول منذ
--     إنشائه، و**صفر سطرٍ في الشيفرة كلّها يكتبها**.
--
--     PROBE_3:  status='replied' بلا reply ⇒ **قُبِل**
--               reply=<NULL> · replied_by=<NULL> · replied_at=<NULL>
--     PROBE_3ب: status='new' مع reply='ردٌّ شبح' ⇒ **قُبِل**
--
--     ⇒ «مردودٌ عليها» لا يعني شيئاً، و«ردٌّ» بلا حالةِ ردٍّ يختفي.
--
--  ═══════════════════════════════════════════════════════════════════
--  ④ ★★★ **رادٌّ من مستأجرٍ آخر**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_4: رسالةٌ في `tenant=ألف` بـ`replied_by` من **باء** ⇒ قُبِل.
--     `hr_messages_replied_by_fkey` مفردٌ لا مركَّب.
--
--     ★ وأسوأ: `replied_by` يشير إلى **`employees`**، والرادُّ موظفُ
--       موارد بشرية. المحفّز `tg_ensure_employee_row` يستثني
--       `developer`/`it_admin` ⇒ **مدير النظام لا يستطيع أن يردّ**
--       أصلاً لأنّ لا صفَّ له في `employees`.
--       ⇒ الصواب أن يشير إلى `profiles` — وهو الدور الحقيقيّ.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑤ ★★★ **زرُّ «أرشفة» بلا عمود، والحذف النهائيّ مسموح**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_5: أعمدة الأرشفة (`archived_at`/`archived_by`/…) = **0**
--              محفّزات منع الحذف = **0**
--              `DELETE FROM hr_messages` ⇒ **قُبِل**
--
--     وسياسة `kyvzon_hr_messages_delete` تمنح الموارد البشرية حقَّ
--     الحذف النهائيّ. ⇒ شكوى موظفٍ تختفي بلا أثر.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑥ ★★ **موضوعٌ ونصٌّ من مسافات**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_6: `subject='   '` و`message='   '` ⇒ قُبِل.
--     `NOT NULL` لا يمنع المسافات.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑦ ★★★ **رسالةٌ لموظفٍ من مستأجرٍ آخر**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_7: `tenant_id=ألف` مع `employee_id` من **باء** ⇒ قُبِل.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑧ ★★ **صفر دالةٍ على الجدول**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_8: الدوال التي تلمس `hr_messages` = **0**.
--     لا لوحَ ولا ملخّصَ ولا رصدَ تأخّر. والصفحة تجلب الجدول كاملاً
--     بلا حدٍّ ولا ترشيح، وترشّح في المتصفّح (لا ترشيحَ أصلاً).
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑨ ★★ **`tenant_id` يقبل NULL**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_9: `is_nullable = YES`.
--     وسياسة SELECT تُقارنه بـ`tenant_id = current_user_tenant_id()`
--     ⇒ صفٌّ بـNULL **لا يراه أحد** — لا صاحبه ولا الموارد البشرية.
--     رسالةٌ يتيمةٌ إلى الأبد.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑩ ★★★★ **الاشتراك اللحظيّ يُعيد التحميل بلا حدٍّ ولا كبح**
--  ═══════════════════════════════════════════════════════════════════
--
--     السطر 35–37: قناةٌ على `event: '*'` تستدعي `fetchMessages` عند
--     **كلّ** تغيير — بما في ذلك التغييرُ الذي أحدثه المستخدم نفسه
--     بفتح رسالة (`updateMessageStatus`). ⇒ كلّ نقرةٍ تُعيد جلب
--     الجدول كاملاً. والصفحة تلمس `supabase` مباشرةً خلافاً للقاعدة.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑪ ★★★★ **الردُّ لا يصل أحداً — كتابةٌ مزدوجةٌ بلا رابط**
--  ═══════════════════════════════════════════════════════════════════
--
--     `ContactPage.tsx:122` تُنشئ حالةً في `hr_cases` (مركز الخدمات
--     0367)، ثمّ `:131` تُنشئ **رسالةً** في `hr_messages` بتعليل
--     صريحٍ في الشيفرة: «توافق تشغيلي مع صندوق رسائل HR الحالي».
--
--     PROBE_11: طلبٌ واحد ⇒ `hr_cases` = 1 صفّ · `hr_messages` = صفّ آخر
--               أعمدة الربط بينهما = **0**
--
--     والموظف في `ContactPage` يقرأ `hrCaseService.findByEmployee`
--     و`employeeLetterRequestService` **فقط** — لا يقرأ `hr_messages`
--     في أيّ موضع.
--
--     ⇒ **إن ردّت الموارد البشرية من صندوق البريد، الردُّ لا يصل أحداً.**
--       نسختان من الطلب الواحد تتباعدان: تُحَلُّ الحالة ويبقى البريد
--       «جديداً»، أو يُردُّ البريد وتبقى الحالة مفتوحة.
--
--     ★ القرار: **عمود `case_id` يربط الرسالة بحالتها**، ودالّة الردّ
--       تُسجّل الردَّ في **الحالة** أيضاً (`first_response_at`) فيصل
--       الموظفَ عبر الشاشة التي يقرؤها فعلاً.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  العلاج                                                          │
--  └──────────────────────────────────────────────────────────────────┘
--    · `sender_id` → `profiles` مركَّبٌ بالمستأجر (العطل ①)
--    · `replied_by` يُحوَّل إلى `profiles` مركَّباً (العطل ④)
--    · أعمدة الأرشفة + محفّز منع الحذف (العطل ⑤)
--    · قيود الاتساق للردّ والأرشفة (③/⑥)
--    · `tenant_id NOT NULL` (⑨)
--    · `case_id` رابطٌ إلى `hr_cases` (⑪)
--    · `hr_message_board()` / `_summary()` / `_reply()` / `_close()`
--      / `_archive()` — خمسُ دوالٍ حيث كان صفر (⑧)
-- ════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
--  ① الأعمدة الجديدة
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.hr_messages
  ADD COLUMN IF NOT EXISTS sender_id       UUID,
  ADD COLUMN IF NOT EXISTS case_id         UUID,
  ADD COLUMN IF NOT EXISTS archived_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by     UUID,
  ADD COLUMN IF NOT EXISTS archive_reason  TEXT,
  ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by       UUID,
  ADD COLUMN IF NOT EXISTS read_at         TIMESTAMPTZ;

COMMENT ON COLUMN public.hr_messages.sender_id IS
  'المُرسِل في `profiles` — الصفحة كانت تطلب profiles(full_name,department) '
  'وصفرُ مفتاحٍ أجنبيٍّ يربطهما، فكان الاسم فارغاً دائماً (العطل ①) — 0371';
COMMENT ON COLUMN public.hr_messages.case_id IS
  'الحالة المقابلة في hr_cases. ContactPage تكتب في الجدولين بلا رابط '
  'فالردُّ من صندوق البريد لا يصل الموظف (العطل ⑪) — 0371';
COMMENT ON COLUMN public.hr_messages.read_at IS
  'لحظة أول فتح — الصفحة كانت تُحدّث status=read بلا طابعٍ زمنيّ';

-- ★ ملء `sender_id` من `employees.user_id` للصفوف القائمة
UPDATE public.hr_messages m
   SET sender_id = e.user_id
  FROM public.employees e
 WHERE e.id = m.employee_id
   AND m.sender_id IS NULL
   AND e.user_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
--  ② ★★★ العطل ⑨: tenant_id NOT NULL
--     صفٌّ بـNULL لا يراه أحد — لا صاحبه ولا الموارد البشرية
-- ═══════════════════════════════════════════════════════════════════

UPDATE public.hr_messages m
   SET tenant_id = e.tenant_id
  FROM public.employees e
 WHERE e.id = m.employee_id AND m.tenant_id IS NULL;

DELETE FROM public.hr_messages WHERE tenant_id IS NULL;

ALTER TABLE public.hr_messages ALTER COLUMN tenant_id SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
--  ③ المفاتيح الأجنبية المركَّبة (الأعطال ①/④/⑦/⑪)
--     ★★★ FK مركَّب (id, tenant_id) — هو الذي يمنع العبور.
--     `uq_profiles_id_tenant` من 0365 · `uq_employees_id_tenant` موجود.
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_cases_id_tenant
  ON public.hr_cases (id, tenant_id);

-- ★★★★ العطل ⑦: صاحبُ الرسالة مركَّبٌ بمستأجره
ALTER TABLE public.hr_messages
  DROP CONSTRAINT IF EXISTS hr_messages_employee_id_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='fk_hr_message_employee_tenant') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_employee_tenant
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ★★★★ العطل ①: المُرسِل في `profiles` — مصدرُ الاسم والقسم
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='fk_hr_message_sender_tenant') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_sender_tenant
      FOREIGN KEY (sender_id, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ★★★★ العطل ④: الرادُّ في `profiles` لا `employees`
--   مديرُ النظام (developer/it_admin) لا صفَّ له في `employees`
--   بحكم المحفّز `tg_ensure_employee_row` ⇒ كان لا يستطيع الردَّ أصلاً.
ALTER TABLE public.hr_messages
  DROP CONSTRAINT IF EXISTS hr_messages_replied_by_fkey;

UPDATE public.hr_messages m
   SET replied_by = e.user_id
  FROM public.employees e
 WHERE e.id = m.replied_by AND e.user_id IS NOT NULL;

UPDATE public.hr_messages m SET replied_by = NULL
 WHERE m.replied_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = m.replied_by AND p.tenant_id = m.tenant_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='fk_hr_message_replier_tenant') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_replier_tenant
      FOREIGN KEY (replied_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='fk_hr_message_archiver_tenant') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_archiver_tenant
      FOREIGN KEY (archived_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='fk_hr_message_closer_tenant') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_closer_tenant
      FOREIGN KEY (closed_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ★★★★ العطل ⑪: الرابط بالحالة
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='fk_hr_message_case_tenant') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_case_tenant
      FOREIGN KEY (case_id, tenant_id)
      REFERENCES public.hr_cases (id, tenant_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ④ القيود (الأعطال ③/⑥)
-- ═══════════════════════════════════════════════════════════════════

-- ★ العطل ⑥: نصوصٌ من مسافات
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='chk_hr_message_text_present') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT chk_hr_message_text_present
      CHECK (btrim(subject) <> '' AND btrim(message) <> '');
  END IF;
END $$;

-- ★★★★ العطل ③: «مردودٌ عليها» يستلزم نصّاً ورادّاً ولحظة — والعكس ممنوع
--   ★★★ `IS NOT DISTINCT FROM` غيرُ لازمٍ هنا لأنّ الطرفين صريحان،
--     لكنّ الفرعَين يغطّيان NULL كاملاً: الأول يشترط الثلاثة NULL
--     والثاني يشترطها غيرَ NULL. لا فجوةَ بينهما (درس 0365).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='chk_hr_message_reply_complete') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT chk_hr_message_reply_complete
      CHECK (
        (status <> 'replied' AND reply IS NULL
           AND replied_by IS NULL AND replied_at IS NULL)
        OR (status = 'replied' AND btrim(COALESCE(reply,'')) <> ''
           AND replied_by IS NOT NULL AND replied_at IS NOT NULL)
      );
  END IF;
END $$;

-- ★ «مغلقة» تستلزم مُغلِقاً ولحظة
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='chk_hr_message_closed_complete') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT chk_hr_message_closed_complete
      CHECK (
        (status <> 'closed' AND closed_at IS NULL AND closed_by IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
      );
  END IF;
END $$;

-- ★ الأرشفة: الحقول الثلاثة معاً أو لا شيء
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass
      AND conname='chk_hr_message_archive_complete') THEN
    ALTER TABLE public.hr_messages ADD CONSTRAINT chk_hr_message_archive_complete
      CHECK (
        (archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL)
        OR (archived_at IS NOT NULL AND archived_by IS NOT NULL
            AND btrim(COALESCE(archive_reason,'')) <> '')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hr_messages_case      ON public.hr_messages (case_id);
CREATE INDEX IF NOT EXISTS idx_hr_messages_sender    ON public.hr_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_hr_messages_open
  ON public.hr_messages (created_at DESC)
  WHERE archived_at IS NULL AND status IN ('new','read');

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ محفّزات الحراسة (الأعطال ③/⑤)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_hr_message_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- ★ الثوابت لا تُمسّ
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    NEW.created_at  := OLD.created_at;
    NEW.sender_id   := COALESCE(OLD.sender_id, NEW.sender_id);
  ELSE
    -- ★ العطل ①: المُرسِل يُشتقّ من الموظف حين لا يُمرَّر
    IF NEW.sender_id IS NULL THEN
      SELECT e.user_id INTO NEW.sender_id
        FROM public.employees e WHERE e.id = NEW.employee_id;
    END IF;
  END IF;

  -- ★ لحظة أول فتح
  IF NEW.status IN ('read','replied','closed') AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;

  -- ★★★ لحظةُ الردّ والرادُّ آليّان فلا يعتمد القيد على المتصفّح
  IF NEW.status = 'replied' AND COALESCE(OLD.status,'') <> 'replied' THEN
    NEW.replied_at := COALESCE(NEW.replied_at, now());
    NEW.replied_by := COALESCE(NEW.replied_by, auth.uid());
  END IF;

  IF NEW.status = 'closed' AND COALESCE(OLD.status,'') <> 'closed' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
  END IF;

  -- ★★★ الخروج من حالةٍ يُفرغ حقولها — **عند التحديث وحده**.
  --   في INSERT يُترك الحقل كما هو ليرفضه القيد بصوتٍ مسموع بدل أن
  --   يبتلع المحفّزُ التناقضَ صامتاً (درس 0369 · التأكيد 2.5b).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'replied' THEN
      NEW.reply       := NULL;
      NEW.replied_by  := NULL;
      NEW.replied_at  := NULL;
    END IF;
    IF NEW.status <> 'closed' THEN
      NEW.closed_at := NULL;
      NEW.closed_by := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_message_guard ON public.hr_messages;
CREATE TRIGGER trg_hr_message_guard
  BEFORE INSERT OR UPDATE ON public.hr_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_message_guard();

-- ★★ العطل ⑤: منع الحذف — نظير `trg_block_incident_delete` (0338)
CREATE OR REPLACE FUNCTION public.tg_block_hr_message_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'HR_MESSAGE_DELETE_BLOCKED: رسالةُ الموظف وثيقةٌ — استعمل hr_message_archive() (id=%)',
    OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_block_hr_message_delete ON public.hr_messages;
CREATE TRIGGER trg_block_hr_message_delete
  BEFORE DELETE ON public.hr_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_hr_message_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ الجدار
-- ═══════════════════════════════════════════════════════════════════

-- ★★★ العطل ⑤: لا سياسة DELETE — الأرشفة بديلُ الحذف
DROP POLICY IF EXISTS kyvzon_hr_messages_delete ON public.hr_messages;

-- ★ الموظف يقرأ رسائله (ومنها الردّ) — والموارد البشرية تقرأ الكلّ
DROP POLICY IF EXISTS kyvzon_hr_messages_select ON public.hr_messages;
CREATE POLICY kyvzon_hr_messages_select ON public.hr_messages
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_hr_messages_insert ON public.hr_messages;
CREATE POLICY kyvzon_hr_messages_insert ON public.hr_messages
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

DROP POLICY IF EXISTS kyvzon_hr_messages_update ON public.hr_messages;
CREATE POLICY kyvzon_hr_messages_update ON public.hr_messages
  FOR UPDATE
  USING (tenant_id = public.current_user_tenant_id()
         AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id()
              AND public.current_user_is_staff());

-- ★★★ البوّابة الهجينة RESTRICTIVE على وحدة hr — كانت كذلك، نُثبّتها
DROP POLICY IF EXISTS hybrid_gate_hr_messages ON public.hr_messages;
CREATE POLICY hybrid_gate_hr_messages ON public.hr_messages
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

REVOKE ALL ON public.hr_messages FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_messages TO authenticated;
REVOKE DELETE ON public.hr_messages FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ ★★★★ اللوح (العطل ⑧ — كان صفر دالة · والعطل ① مُصلَحٌ هنا)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_message_board(TEXT, TEXT, TEXT, BOOLEAN, INTEGER);
CREATE FUNCTION public.hr_message_board(
  p_search   TEXT    DEFAULT NULL,
  p_status   TEXT    DEFAULT NULL,
  p_priority TEXT    DEFAULT NULL,
  p_archived BOOLEAN DEFAULT FALSE,
  p_limit    INTEGER DEFAULT 200
)
RETURNS TABLE (
  id             UUID,
  subject        TEXT,
  message        TEXT,
  priority       TEXT,
  status         TEXT,
  employee_id    UUID,
  -- ★★★★ العطل ①: الاسم والقسم من `profiles` عبر مفتاحٍ حقيقيّ
  sender_name    TEXT,
  sender_dept    TEXT,
  created_at     TIMESTAMPTZ,
  read_at        TIMESTAMPTZ,
  reply          TEXT,
  replier_name   TEXT,
  replied_at     TIMESTAMPTZ,
  case_id        UUID,
  case_subject   TEXT,
  archived_at    TIMESTAMPTZ,
  age_hours      INTEGER,
  -- ★★★ رسالةٌ عاجلةٌ بلا ردٍّ بعد يومٍ = متأخّرة
  is_overdue     BOOLEAN,
  awaiting_reply BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_q TEXT := NULLIF(btrim(COALESCE(p_search,'')), '');
BEGIN
  -- ★★★ لوح الوارد صندوقُ الموارد البشرية. الموظف يقرأ ردَّه من
  --   `hr_messages` مباشرةً (سياسة SELECT تسمح له) ومن `hr_cases` —
  --   لا من هنا. RLS وحدها كانت تكفي لمنع التسرّب، لكنّ الحارس
  --   الصريح يُغلق الباب مرّتين ويتّسق مع 0370.
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_MESSAGE_FORBIDDEN: صندوق بريد الموارد البشرية للموارد البشرية والإدارة فقط';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.subject::TEXT,
    m.message::TEXT,
    m.priority::TEXT,
    m.status::TEXT,
    m.employee_id,
    -- ★★★★ التسلسل: profiles ← employees ← الرمز — لا سلسلةً فارغة
    COALESCE(
      NULLIF(btrim(sp.full_name), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      e.employee_code,
      'غير محدَّد')::TEXT,
    COALESCE(NULLIF(btrim(sp.department), ''),
             NULLIF(btrim(d.name_ar), ''),
             'غير محدَّد')::TEXT,
    m.created_at,
    m.read_at,
    m.reply::TEXT,
    COALESCE(NULLIF(btrim(rp.full_name), ''), NULL)::TEXT,
    m.replied_at,
    m.case_id,
    c.subject::TEXT,
    m.archived_at,
    (EXTRACT(EPOCH FROM (now() - m.created_at)) / 3600)::INTEGER,
    -- ★★★ المتأخّرة: عاجلةٌ بلا ردٍّ بعد 24 ساعة · وغيرها بعد 72
    (m.status IN ('new','read')
      AND m.archived_at IS NULL
      AND now() - m.created_at >
          (CASE WHEN m.priority = 'urgent' THEN INTERVAL '24 hours'
                ELSE INTERVAL '72 hours' END)),
    (m.status IN ('new','read') AND m.archived_at IS NULL)
  FROM public.hr_messages m
  LEFT JOIN public.profiles    sp ON sp.id = m.sender_id
  LEFT JOIN public.profiles    rp ON rp.id = m.replied_by
  LEFT JOIN public.employees   e  ON e.id  = m.employee_id
  LEFT JOIN public.departments d  ON d.id  = e.department_id
  LEFT JOIN public.hr_cases    c  ON c.id  = m.case_id
  WHERE (p_archived IS TRUE) = (m.archived_at IS NOT NULL)
    AND (p_status   IS NULL OR m.status   = p_status)
    AND (p_priority IS NULL OR m.priority = p_priority)
    AND (v_q IS NULL
         OR m.subject ILIKE '%' || v_q || '%'
         OR m.message ILIKE '%' || v_q || '%'
         OR sp.full_name ILIKE '%' || v_q || '%')
  -- ★★★ التذييل بـ`id`: `created_at DEFAULT now()` طابعُ المعاملة
  ORDER BY m.created_at DESC, m.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
END $$;

REVOKE ALL ON FUNCTION public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ الملخّص
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_message_summary();
CREATE FUNCTION public.hr_message_summary()
RETURNS TABLE (
  total_open    INTEGER,
  unread        INTEGER,
  urgent_open   INTEGER,
  overdue       INTEGER,
  replied_30d   INTEGER,
  archived      INTEGER,
  unlinked      INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_MESSAGE_FORBIDDEN: ملخّص البريد للموارد البشرية والإدارة فقط';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE m.archived_at IS NULL
                       AND m.status IN ('new','read'))::INTEGER,
    count(*) FILTER (WHERE m.archived_at IS NULL AND m.status = 'new')::INTEGER,
    count(*) FILTER (WHERE m.archived_at IS NULL
                       AND m.status IN ('new','read')
                       AND m.priority = 'urgent')::INTEGER,
    count(*) FILTER (WHERE m.archived_at IS NULL
                       AND m.status IN ('new','read')
                       AND now() - m.created_at >
                           (CASE WHEN m.priority = 'urgent' THEN INTERVAL '24 hours'
                                 ELSE INTERVAL '72 hours' END))::INTEGER,
    count(*) FILTER (WHERE m.replied_at >= now() - INTERVAL '30 days')::INTEGER,
    count(*) FILTER (WHERE m.archived_at IS NOT NULL)::INTEGER,
    -- ★★★★ العطل ⑪ مُقاساً: رسائلُ بلا حالةٍ مرتبطة
    count(*) FILTER (WHERE m.archived_at IS NULL AND m.case_id IS NULL)::INTEGER
  FROM public.hr_messages m;
END $$;

REVOKE ALL ON FUNCTION public.hr_message_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_message_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_message_summary() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑨ ★★★★ الردّ — العطلان ②/⑪
--     الزرّ كان بلا `onClick`، والردُّ لو كُتب لما وصل أحداً.
--     هنا: يُكتب في الرسالة **وفي الحالة المرتبطة** فيصل الموظفَ عبر
--     الشاشة التي يقرؤها فعلاً (`ContactPage` تقرأ `hr_cases`).
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_message_reply(UUID, TEXT);
CREATE FUNCTION public.hr_message_reply(p_id UUID, p_reply TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_case UUID;
  v_txt  TEXT := btrim(COALESCE(p_reply, ''));
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_MESSAGE_FORBIDDEN: الردّ للموارد البشرية والإدارة فقط';
  END IF;
  IF v_txt = '' THEN
    RAISE EXCEPTION 'HR_MESSAGE_EMPTY_REPLY: نصُّ الردّ فارغ';
  END IF;

  UPDATE public.hr_messages
     SET status = 'replied', reply = v_txt,
         replied_by = auth.uid(), replied_at = now()
   WHERE id = p_id AND archived_at IS NULL
  RETURNING case_id INTO v_case;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_MESSAGE_NOT_FOUND: لا رسالةَ مفتوحةً بهذا المعرّف';
  END IF;

  -- ★★★★ العطل ⑪: الردُّ يصل الحالةَ التي يقرؤها الموظف
  IF v_case IS NOT NULL THEN
    UPDATE public.hr_cases
       SET first_response_at = COALESCE(first_response_at, now()),
           -- ★ المفردة `in_review` من `hr_cases_status_check` (0367)
           --   لا `in_progress` — كتبتُها خطأً أوّلاً فرفضها القيد.
           status = CASE WHEN status = 'open' THEN 'in_review' ELSE status END
     WHERE id = v_case;
  END IF;

  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.hr_message_reply(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_message_reply(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_message_reply(UUID,TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑩ الإغلاق والأرشفة (العطلان ②/⑤)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_message_close(UUID);
CREATE FUNCTION public.hr_message_close(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_MESSAGE_FORBIDDEN: الإغلاق للموارد البشرية والإدارة فقط';
  END IF;

  -- ★★★ لا تُغلَق رسالةٌ لم يُردَّ عليها — «مكتمل» بلا ردٍّ كذبة
  UPDATE public.hr_messages
     SET status = 'closed', closed_at = now(), closed_by = auth.uid()
   WHERE id = p_id AND archived_at IS NULL AND status = 'replied';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_MESSAGE_NOT_REPLIED: لا تُغلَق رسالةٌ قبل الردّ عليها';
  END IF;
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.hr_message_close(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_message_close(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_message_close(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.hr_message_archive(UUID, TEXT);
CREATE FUNCTION public.hr_message_archive(p_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE v_txt TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_MESSAGE_FORBIDDEN: الأرشفة للموارد البشرية والإدارة فقط';
  END IF;
  IF v_txt = '' THEN
    RAISE EXCEPTION 'HR_MESSAGE_NO_REASON: سببُ الأرشفة مطلوب';
  END IF;

  UPDATE public.hr_messages
     SET archived_at = now(), archived_by = auth.uid(), archive_reason = v_txt
   WHERE id = p_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_MESSAGE_NOT_FOUND: لا رسالةَ نشطةً بهذا المعرّف';
  END IF;
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.hr_message_archive(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_message_archive(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_message_archive(UUID,TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑪ فتح الرسالة — يستبدل `updateMessageStatus(id,'read')` العاري
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_message_mark_read(UUID);
CREATE FUNCTION public.hr_message_mark_read(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_MESSAGE_FORBIDDEN: صندوق البريد للموارد البشرية والإدارة فقط';
  END IF;

  -- ★ لا يُنزَل بحالةٍ متقدّمةٍ إلى `read` — الفتحُ لا يُلغي الردَّ
  UPDATE public.hr_messages
     SET status = 'read'
   WHERE id = p_id AND status = 'new' AND archived_at IS NULL;

  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.hr_message_mark_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_message_mark_read(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_message_mark_read(UUID) TO authenticated;
