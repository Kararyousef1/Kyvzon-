-- ════════════════════════════════════════════════════════════════════════
--  0369 — سلامة الصحة والسلامة المهنية (CAPA)
--  المرحلة 4 — بوابة الموارد البشرية · hr/HealthSafetyPage.tsx (153 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0369.sql — قاعدة نظيفة، 297 م.)      │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ★ إنصافاً: جدول `incidents` **محميٌّ جيداً** منذ 0338 — سبعة مفاتيح
--    أجنبية وثلاثة CHECK ومحفّز `trg_block_incident_delete`. الأعطال
--    في `corrective_actions` **وفي التصنيفات**.
--
--  ═══════════════════════════════════════════════════════════════════
--  ① ★★★★ **أربعةٌ من خمسة تصنيفاتٍ في نموذج الصفحة مرفوضةٌ من القاعدة**
--  ═══════════════════════════════════════════════════════════════════
--
--     `incidents_category_check` يقبل سبعاً:
--        technical · hr · management · workplace · salary · safety · other
--
--     والصفحة تعرض في `<select>` أربعةً (السطر 138):
--        safety · work_injury · near_miss · security_incident
--     وتُرشّح بخمسةٍ في `safetyCategories` (السطر 10):
--        safety · health_safety · work_injury · near_miss · security_incident
--
--     PROBE_2 — إدراجٌ فعليٌّ بكلٍّ منها:
--        safety            ⇒ مقبول
--        health_safety     ⇒ ★ مرفوض (غير موجودٍ في CHECK)
--        work_injury       ⇒ ★ مرفوض
--        near_miss         ⇒ ★ مرفوض
--        security_incident ⇒ ★ مرفوض
--
--     ⇒ **ثلاثةٌ من أربعة خياراتٍ في قائمة «النوع» تُخرج خطأ عند الحفظ.**
--       المستخدم يختار «إصابة عمل» فيفشل التسجيل. و`health_safety`
--       الخامس في المُرشِّح لا وجود له في القائمة ولا في القاعدة —
--       شيفرةٌ ميتةٌ من الطرفين.
--
--     ★ العلاج: توسيع المفردات في القاعدة لتشمل الأربعة الحقيقية
--       (`work_injury` · `near_miss` · `security_incident`)، وإسقاط
--       `health_safety` من الصفحة لأنه لا يعني شيئاً مستقلاًّ عن
--       `safety`. التصنيفات القديمة السبعة تبقى كما هي.
--
--  ═══════════════════════════════════════════════════════════════════
--  أعطال `corrective_actions` — الجدول عارٍ إلّا من CHECK اثنين
--  ═══════════════════════════════════════════════════════════════════
--
--  ② ★★★ **`owner_id` بلا مفتاح أجنبيّ.**
--     PROBE_3: إجراءٌ تصحيحيٌّ مُسنَدٌ إلى `ffffffff-…` ⇒ **قُبِل**.
--     ⇒ «المسؤول عن الإجراء» حقلٌ لا يعني شيئاً. والصفحة تعرض
--       `employeeMap.get(action.owner_id)?.full_name_ar || 'غير محدد'`
--       فتُظهر «غير محدد» لمسؤولٍ معدوم — وهما حالتان مختلفتان.
--
--  ③ ★★★★ **إجراءٌ مربوطٌ بحادثٍ في مستأجرٍ آخر.**
--     PROBE_4: `tenant_id = ألف` مع `incident_id` من **باء** ⇒ قُبِل.
--     ⇒ الحلّ FK **مركَّب** لا مفرد.
--
--  ④ ★★ **`created_by` و`completed_by` بلا FK.**
--
--  ⑤ ★★ **`title` من مسافات.** PROBE_5 ⇒ قُبِل. `NOT NULL` لا يمنعها.
--
--  ⑥ ★★★ **«مكتمل» بلا مُنجِزٍ ولا لحظة.**
--     PROBE_6: `status='completed'` و`completed_by IS NULL` و
--     `completed_at IS NULL` ⇒ **قُبِل**.
--     ⇒ سجلُّ CAPA يقول «أُنجز» ولا يقول من ولا متى — وهو **وثيقةٌ
--       تدقيقية** في نظم السلامة.
--
--  ⑦ ★★★ **«ملغى» بلا سبب — ولا عمود أصلاً.**
--     PROBE_7: أعمدةٌ فيها `cancel` = **صفر**. والحالة `cancelled`
--     من مفردات CHECK. مفردةٌ موجودةٌ بلا مكانٍ لتعليلها **وبلا زرٍّ
--     في الصفحة** (الصفحة تعرض زرَّ «إكمال» وحده).
--
--  ⑧ ★★ **تاريخُ استحقاقٍ في 2018.** PROBE_8: `CURRENT_DATE - 3000` ⇒ قُبِل.
--
--  ⑨ ★★★★ **حادثٌ حرجٌ بلا أيّ إجراءٍ تصحيحيّ — ولا شيء يكشفه.**
--     PROBE_9: حوادثُ `safety` بخطورة high/critical بلا إجراء = **1**
--     ودوالُ المنظومة التي تلمس `corrective_actions` = **صفر**.
--     ⇒ جوهرُ CAPA أن كل حادثٍ جسيمٍ يُقابله إجراءٌ تصحيحيّ. لا شيء
--       في المنظومة يقيس هذه الفجوة ولا يعرضها.
--
--  ⑩ ★★★ **الإجراء المتأخّر لا يُرصد.**
--     PROBE_10: دوالُ التأخّر = **0** · ومتأخّرٌ فعلاً = **1**.
--     والصفحة تعرض `action.due_date || 'بدون موعد'` نصّاً خامّاً بلا
--     أيّ إبرازٍ للمتأخّر.
--
--  ⑪ ★★ **الحذف النهائيّ مسموح.** PROBE_11: حُذف صفٌّ نهائياً.
--     و`incidents` محميٌّ بمحفّزٍ منذ 0338 — بينما إجراءاته التصحيحية
--     تُمحى بحرّية. تناقضٌ في مستوى الحماية.
--
--  ⑫ ★★★ **حذفُ الحادث يُيتّم إجراءاته صامتاً.**
--     `corrective_actions_incident_id_fkey … ON DELETE SET NULL`
--     ⇒ الإجراء يبقى بلا حادث. (والحذف ممنوعٌ أصلاً بمحفّز 0338،
--       لكن القيد يقول غير ذلك — نُشدّده إلى RESTRICT اتّساقاً.)
--
--  ⑬ ★★★ **`hybrid_gate_corrective_actions` على وحدة `admin` لا `hr`.**
--     PROBE_13. بينما `hybrid_gate_incidents` على `hr`.
--     ⇒ مستأجرٌ مشتركٌ في «الموارد البشرية» دون «الإدارة» يرى
--       الحوادث ولا يرى إجراءاتها التصحيحية. الصفحة **تنكسر نصفين**.
--
--  ⑭ ★★★ **الموظف لا يرى الإجراء المُسنَد إليه.**
--     PROBE_14: `kyvzon_corrective_actions_select` تشترط
--     `current_user_is_staff()` وحدها.
--     ⇒ إجراءٌ تصحيحيٌّ مسؤولُه موظفٌ عاديّ — ولا سبيل له إلى رؤيته.
--
--  ★ وأعطال الصفحة (تُعالَج في إعادة الكتابة):
--    ⑮ `useState<any[]>([])` و`(i: any)` في المُرشِّح.
--    ⑯ ثلاثة استعلاماتٍ بلا حدّ + `Map` يدويّ + `orderBy 'full_name_ar'`.
--    ⑰ الترشيح كلُّه في المتصفّح بعد جلب **كل** الحوادث.
--    ⑱ `severity` و`category` و`status` تُعرض **نصّاً إنجليزياً خامّاً**.
--    ⑲ `.slice(0, 12)` على الإجراءات — البقيّة تختفي بلا ترقيم.
--    ⑳ `completeAction(...).then(loadData)` بلا `catch` — الخطأ يُبتلع.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ① ★★★★ توسيع تصنيفات الحوادث (العطل ①)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_category_check;
ALTER TABLE public.incidents ADD CONSTRAINT incidents_category_check
  CHECK (category IN (
    -- السبعة الأصلية — تبقى كما هي
    'technical','hr','management','workplace','salary','safety','other',
    -- ★★★★ الثلاثة التي كانت الصفحة تعرضها والقاعدة ترفضها
    'work_injury','near_miss','security_incident'
  ));

COMMENT ON CONSTRAINT incidents_category_check ON public.incidents IS
  'عشرة تصنيفات. الثلاثة الأخيرة أُضيفت في 0369: كانت الصفحة تعرضها '
  'في قائمة «النوع» والقاعدة ترفضها ⇒ الحفظ يفشل.';

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف corrective_actions قبل فرض القيود
-- ═══════════════════════════════════════════════════════════════════

UPDATE public.corrective_actions
   SET title = '(عنوانٌ غير مُدوَّن — سجلٌّ سابقٌ لسريان القيد)'
 WHERE btrim(COALESCE(title,'')) = '';

UPDATE public.corrective_actions
   SET completed_at = COALESCE(completed_at, updated_at, created_at)
 WHERE status = 'completed' AND completed_at IS NULL;

-- إجراءٌ مربوطٌ بحادثٍ في مستأجرٍ آخر ⇒ يُفكّ الربط (لا نحذف)
UPDATE public.corrective_actions a
   SET incident_id = NULL
 WHERE a.incident_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.incidents i
                    WHERE i.id = a.incident_id AND i.tenant_id = a.tenant_id);

-- ═══════════════════════════════════════════════════════════════════
--  ② أعمدة دورة الحياة (العطل ⑦)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.corrective_actions
  ADD COLUMN IF NOT EXISTS cancel_reason  TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by   UUID,
  ADD COLUMN IF NOT EXISTS started_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

COMMENT ON COLUMN public.corrective_actions.cancel_reason IS
  'سبب إلغاء الإجراء. الحالة cancelled كانت في CHECK بلا مكانٍ لتعليلها — 0369';
COMMENT ON COLUMN public.corrective_actions.verification_note IS
  'ملاحظة التحقّق من فاعلية الإجراء عند الإنجاز (CAPA) — 0369';

-- ═══════════════════════════════════════════════════════════════════
--  ③ المفاتيح الأجنبية المركَّبة (الأعطال ②/③/④/⑫)
--     ★★★ FK مركَّب (id, tenant_id) — هو الذي يمنع العبور.
--     `uq_profiles_id_tenant` من 0365 موجود.
-- ═══════════════════════════════════════════════════════════════════

-- ★ نظير `uq_employees_id_tenant` على الحوادث
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_id_tenant
  ON public.incidents (id, tenant_id);

-- ★★★★ العطل ③/⑫: الربط بالحادث مركَّبٌ و RESTRICT
ALTER TABLE public.corrective_actions
  DROP CONSTRAINT IF EXISTS corrective_actions_incident_id_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.corrective_actions'::regclass
      AND conname='fk_capa_incident_tenant') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_incident_tenant
      FOREIGN KEY (incident_id, tenant_id)
      REFERENCES public.incidents (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.corrective_actions'::regclass
      AND conname='fk_capa_owner_tenant') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_owner_tenant
      FOREIGN KEY (owner_id, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.corrective_actions'::regclass
      AND conname='fk_capa_creator_tenant') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_creator_tenant
      FOREIGN KEY (created_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.corrective_actions'::regclass
      AND conname='fk_capa_completer_tenant') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_completer_tenant
      FOREIGN KEY (completed_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ④ القيود (الأعطال ⑤/⑥/⑦)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.corrective_actions'::regclass
      AND conname='chk_capa_title_present') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT chk_capa_title_present
      CHECK (btrim(title) <> '');
  END IF;
END $$;

-- «مكتمل» يستلزم مُنجِزاً ولحظة
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.corrective_actions'::regclass
      AND conname='chk_capa_completed_complete') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT chk_capa_completed_complete
      CHECK (
        (status <> 'completed' AND completed_at IS NULL AND completed_by IS NULL)
        OR (status = 'completed' AND completed_at IS NOT NULL
            AND completed_by IS NOT NULL)
      );
  END IF;
END $$;

-- «ملغى» يستلزم سبباً وفاعلاً ولحظة — والعكس ممنوع
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.corrective_actions'::regclass
      AND conname='chk_capa_cancelled_complete') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT chk_capa_cancelled_complete
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
--  ⑤ فهارس
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_capa_owner
  ON public.corrective_actions (owner_id);
CREATE INDEX IF NOT EXISTS idx_capa_overdue
  ON public.corrective_actions (due_date)
  WHERE status IN ('open','in_progress');

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ ★★★ إصلاح الجدار (العطلان ⑬/⑭)
-- ═══════════════════════════════════════════════════════════════════

-- ★★★ العطل ⑬: البوّابة على وحدة `hr` كنظيرتها في `incidents`.
--   كانت على `admin` ⇒ مستأجرٌ مشتركٌ في الموارد البشرية دون الإدارة
--   يرى الحوادث ولا يرى إجراءاتها. ★ RESTRICTIVE إلزاماً (درسٌ متكرّر).
DROP POLICY IF EXISTS hybrid_gate_corrective_actions ON public.corrective_actions;
CREATE POLICY hybrid_gate_corrective_actions ON public.corrective_actions
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

-- ★★★ العطل ⑭: الموظف يرى الإجراء المُسنَد إليه (قراءةً فقط)
DROP POLICY IF EXISTS kyvzon_corrective_actions_select ON public.corrective_actions;
CREATE POLICY kyvzon_corrective_actions_select ON public.corrective_actions
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff() OR owner_id = auth.uid())
  );

-- ★ والكتابة تبقى للموارد البشرية وحدها — نفصل ALL إلى ثلاث سياسات
DROP POLICY IF EXISTS kyvzon_corrective_actions_write ON public.corrective_actions;

DROP POLICY IF EXISTS kyvzon_corrective_actions_insert ON public.corrective_actions;
CREATE POLICY kyvzon_corrective_actions_insert ON public.corrective_actions
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()
  );

DROP POLICY IF EXISTS kyvzon_corrective_actions_update ON public.corrective_actions;
CREATE POLICY kyvzon_corrective_actions_update ON public.corrective_actions
  FOR UPDATE
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id()
              AND public.current_user_is_staff());

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ محفّزات الحراسة (الأعطال ⑧/⑪)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_capa_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- ★★★ توقيت بغداد صريحاً — الخادم Etc/UTC
  v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id  := OLD.tenant_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := COALESCE(OLD.created_by, NEW.created_by);
  ELSE
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  -- ★ العطل ⑧: استحقاقٌ في ماضٍ سحيق
  IF NEW.due_date IS NOT NULL AND NEW.due_date < v_today - 365 THEN
    RAISE EXCEPTION 'CAPA_DUE_TOO_OLD: تاريخ استحقاقٍ قبل سنةٍ من اليوم (% مقابل %)',
      NEW.due_date, v_today;
  END IF;

  -- ★ لحظة البدء تُملأ عند أول انتقالٍ إلى in_progress
  IF NEW.status = 'in_progress' AND COALESCE(OLD.status,'') <> 'in_progress'
     AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  -- ★ لحظة الإنجاز والمُنجِز آليّان فلا يعتمد القيد على المتصفّح
  IF NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;

  -- ★★★ الخروج من «مكتمل»/«ملغى» يُفرغ حقولهما — لكن **عند التحديث
  --   وحده**. أوّل صياغةٍ كتبتُها أفرغتهما في INSERT أيضاً، فابتلعت
  --   التناقضَ صامتاً بدل أن ترفضه: إدراجُ صفٍّ بـ`cancel_reason`
  --   وحالةٍ `open` كان يُقبل والسبب يختفي.
  --   أسقط ذلك تأكيدي 2.5b («سببُ إلغاءٍ بلا إلغاءٍ قُبِل»).
  --   ⇒ في INSERT يُترك الحقل كما هو ليرفضه القيد بصوتٍ مسموع.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'completed' THEN
      NEW.completed_at := NULL;
      NEW.completed_by := NULL;
    END IF;
    IF NEW.status <> 'cancelled' THEN
      NEW.cancelled_at  := NULL;
      NEW.cancelled_by  := NULL;
      NEW.cancel_reason := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_capa_guard ON public.corrective_actions;
CREATE TRIGGER trg_capa_guard
  BEFORE INSERT OR UPDATE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_capa_guard();

-- ★★ العطل ⑪: منع الحذف — نظير `trg_block_incident_delete` (0338)
CREATE OR REPLACE FUNCTION public.tg_block_capa_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'CAPA_DELETE_BLOCKED: سجلّ الإجراء التصحيحيّ وثيقةٌ تدقيقية — استعمل capa_cancel() (id=%)',
    OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_block_capa_delete ON public.corrective_actions;
CREATE TRIGGER trg_block_capa_delete
  BEFORE DELETE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_capa_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ اللوح والملخّص (العطلان ⑨/⑩ — كانت صفر دالة)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.safety_incident_board(TEXT, TEXT, TEXT, INTEGER);
CREATE FUNCTION public.safety_incident_board(
  p_search   TEXT    DEFAULT NULL,
  p_status   TEXT    DEFAULT NULL,
  p_severity TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 200
)
RETURNS TABLE (
  id             UUID,
  title          TEXT,
  description    TEXT,
  category       TEXT,
  severity       TEXT,
  status         TEXT,
  employee_id    UUID,
  employee_name  TEXT,
  reported_at    TIMESTAMPTZ,
  is_anonymous   BOOLEAN,
  actions_total  INTEGER,
  actions_open   INTEGER,
  -- ★★★★ العطل ⑨: حادثٌ جسيمٌ بلا إجراءٍ تصحيحيّ
  needs_capa     BOOLEAN,
  age_days       INTEGER
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
    i.id,
    i.title::TEXT,
    i.description::TEXT,
    i.category::TEXT,
    i.severity::TEXT,
    i.status::TEXT,
    i.employee_id,
    -- ★★★ الإبلاغ المجهول يُحترم: لا اسمَ لحادثٍ مجهول (درس 0338)
    CASE WHEN i.is_anonymous THEN 'مُبلِّغ مجهول'
         ELSE COALESCE(
           NULLIF(btrim(e.full_name_ar), ''),
           NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
           NULLIF(btrim(i.employee_name), ''),
           'غير محدَّد')
    END::TEXT,
    i.created_at,
    i.is_anonymous,
    (SELECT count(*) FROM public.corrective_actions a
      WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id)::INTEGER,
    (SELECT count(*) FROM public.corrective_actions a
      WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id
        AND a.status IN ('open','in_progress'))::INTEGER,
    -- ★★★★ جوهر CAPA: حادثٌ جسيمٌ مفتوحٌ بلا إجراء
    (i.severity IN ('high','critical')
      AND i.status NOT IN ('resolved','closed')
      AND NOT EXISTS (SELECT 1 FROM public.corrective_actions a
                       WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id
                         AND a.status <> 'cancelled')),
    (v_today - (i.created_at AT TIME ZONE 'Asia/Baghdad')::DATE)::INTEGER
  FROM public.incidents i
  LEFT JOIN public.employees e ON e.id = i.employee_id AND e.tenant_id = i.tenant_id
  -- ★★★★ التصنيفات الأربعة الحقيقية للسلامة (بعد توسيع CHECK)
  WHERE i.category IN ('safety','work_injury','near_miss','security_incident')
    AND i.archived_at IS NULL
    AND (p_status   IS NULL OR i.status   = p_status)
    AND (p_severity IS NULL OR i.severity = p_severity)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR i.title ILIKE '%' || btrim(p_search) || '%'
      OR i.description ILIKE '%' || btrim(p_search) || '%'
    )
  -- ★★★ ترتيبٌ حتميّ: الجسيم المفتوح أولاً ثم الأحدث ثم id
  ORDER BY
    CASE WHEN i.status IN ('resolved','closed') THEN 1 ELSE 0 END,
    CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3 END,
    i.created_at DESC,
    i.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

DROP FUNCTION IF EXISTS public.capa_board(TEXT, TEXT, UUID, INTEGER);
CREATE FUNCTION public.capa_board(
  p_search   TEXT    DEFAULT NULL,
  p_status   TEXT    DEFAULT NULL,
  p_incident UUID    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 200
)
RETURNS TABLE (
  id                UUID,
  incident_id       UUID,
  incident_title    TEXT,
  title             TEXT,
  description       TEXT,
  priority          TEXT,
  status            TEXT,
  owner_id          UUID,
  owner_name        TEXT,
  due_date          DATE,
  days_to_due       INTEGER,
  -- ★★★ العطل ⑩: متأخّرٌ ولمّا يُنجَز
  is_overdue        BOOLEAN,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  completer_name    TEXT,
  verification_note TEXT,
  cancel_reason     TEXT,
  creator_name      TEXT,
  created_at        TIMESTAMPTZ
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
    a.id,
    a.incident_id,
    i.title::TEXT,
    a.title::TEXT,
    a.description::TEXT,
    a.priority::TEXT,
    a.status::TEXT,
    a.owner_id,
    COALESCE(NULLIF(btrim(po.full_name), ''), NULL)::TEXT,
    a.due_date,
    CASE WHEN a.due_date IS NULL THEN NULL
         ELSE (a.due_date - v_today) END::INTEGER,
    (a.due_date IS NOT NULL AND a.due_date < v_today
       AND a.status IN ('open','in_progress')),
    a.started_at,
    a.completed_at,
    COALESCE(NULLIF(btrim(pc.full_name), ''), NULL)::TEXT,
    a.verification_note::TEXT,
    a.cancel_reason::TEXT,
    COALESCE(NULLIF(btrim(pk.full_name), ''), NULL)::TEXT,
    a.created_at
  FROM public.corrective_actions a
  LEFT JOIN public.incidents i ON i.id = a.incident_id AND i.tenant_id = a.tenant_id
  LEFT JOIN public.profiles po ON po.id = a.owner_id
  LEFT JOIN public.profiles pc ON pc.id = a.completed_by
  LEFT JOIN public.profiles pk ON pk.id = a.created_by
  WHERE (p_status   IS NULL OR a.status = p_status)
    AND (p_incident IS NULL OR a.incident_id = p_incident)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR a.title ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.description,'') ILIKE '%' || btrim(p_search) || '%'
    )
  -- ★★★ المتأخّر أولاً ثم الأقرب استحقاقاً
  ORDER BY
    CASE WHEN a.status IN ('completed','cancelled') THEN 1 ELSE 0 END,
    CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3 END,
    a.due_date ASC NULLS LAST,
    a.created_at DESC,
    a.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

DROP FUNCTION IF EXISTS public.health_safety_summary();
CREATE FUNCTION public.health_safety_summary()
RETURNS TABLE (
  incidents_total    INTEGER,
  incidents_open     INTEGER,
  incidents_severe   INTEGER,
  incidents_no_capa  INTEGER,
  capa_total         INTEGER,
  capa_open          INTEGER,
  capa_overdue       INTEGER,
  capa_completed     INTEGER,
  capa_cancelled     INTEGER,
  capa_unassigned    INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  RETURN QUERY
  WITH si AS (
    SELECT * FROM public.incidents
     WHERE category IN ('safety','work_injury','near_miss','security_incident')
       AND archived_at IS NULL
  )
  SELECT
    (SELECT count(*) FROM si)::INTEGER,
    (SELECT count(*) FROM si WHERE status NOT IN ('resolved','closed'))::INTEGER,
    (SELECT count(*) FROM si WHERE severity IN ('high','critical'))::INTEGER,
    -- ★★★★ العطل ⑨ مقروءاً
    (SELECT count(*) FROM si
      WHERE severity IN ('high','critical')
        AND status NOT IN ('resolved','closed')
        AND NOT EXISTS (SELECT 1 FROM public.corrective_actions a
                         WHERE a.incident_id = si.id AND a.tenant_id = si.tenant_id
                           AND a.status <> 'cancelled'))::INTEGER,
    (SELECT count(*) FROM public.corrective_actions)::INTEGER,
    (SELECT count(*) FROM public.corrective_actions
      WHERE status IN ('open','in_progress'))::INTEGER,
    -- ★★★ العطل ⑩ مقروءاً
    (SELECT count(*) FROM public.corrective_actions
      WHERE due_date IS NOT NULL AND due_date < v_today
        AND status IN ('open','in_progress'))::INTEGER,
    (SELECT count(*) FROM public.corrective_actions WHERE status='completed')::INTEGER,
    (SELECT count(*) FROM public.corrective_actions WHERE status='cancelled')::INTEGER,
    (SELECT count(*) FROM public.corrective_actions
      WHERE owner_id IS NULL AND status IN ('open','in_progress'))::INTEGER;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑨ دوال القرار
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.capa_open(UUID, TEXT, TEXT, TEXT, UUID, DATE);
CREATE FUNCTION public.capa_open(
  p_incident_id UUID,
  p_title       TEXT,
  p_description TEXT DEFAULT NULL,
  p_priority    TEXT DEFAULT 'medium',
  p_owner_id    UUID DEFAULT NULL,
  p_due_date    DATE DEFAULT NULL
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
    RAISE EXCEPTION 'CAPA_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CAPA_NOT_STAFF: الإجراءات التصحيحية للموارد البشرية والإدارة فقط';
  END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'CAPA_TITLE_REQUIRED: عنوان الإجراء مطلوب';
  END IF;
  IF COALESCE(p_priority,'medium') NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'CAPA_BAD_PRIORITY: أولوية غير معروفة %', p_priority;
  END IF;

  INSERT INTO public.corrective_actions
    (tenant_id, incident_id, title, description, priority, owner_id, due_date, created_by)
  VALUES (v_tenant, p_incident_id, btrim(p_title),
          NULLIF(btrim(COALESCE(p_description,'')),''),
          COALESCE(p_priority,'medium'), p_owner_id, p_due_date, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

DROP FUNCTION IF EXISTS public.capa_start(UUID);
CREATE FUNCTION public.capa_start(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_status TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CAPA_NO_TENANT: لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CAPA_NOT_STAFF: البدء للموارد البشرية والإدارة فقط';
  END IF;

  SELECT status INTO v_status FROM public.corrective_actions
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'CAPA_NOT_FOUND: الإجراء غير موجود'; END IF;
  IF v_status <> 'open' THEN RETURN FALSE; END IF;

  UPDATE public.corrective_actions SET status = 'in_progress'
   WHERE id = p_id AND tenant_id = v_tenant;
  RETURN TRUE;
END $$;

DROP FUNCTION IF EXISTS public.capa_complete(UUID, TEXT);
CREATE FUNCTION public.capa_complete(p_id UUID, p_verification TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_status TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CAPA_NO_TENANT: لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CAPA_NOT_STAFF: الإنجاز للموارد البشرية والإدارة فقط';
  END IF;

  SELECT status INTO v_status FROM public.corrective_actions
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'CAPA_NOT_FOUND: الإجراء غير موجود'; END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'CAPA_CANCELLED: لا يُنجَز إجراءٌ مُلغى';
  END IF;
  IF v_status = 'completed' THEN RETURN FALSE; END IF;

  UPDATE public.corrective_actions
     SET status = 'completed',
         verification_note = NULLIF(btrim(COALESCE(p_verification,'')),'')
   WHERE id = p_id AND tenant_id = v_tenant;
  RETURN TRUE;
END $$;

-- ★★★ العطل ⑦: الإلغاء — حالةٌ كانت في CHECK بلا سببٍ ولا زرّ
DROP FUNCTION IF EXISTS public.capa_cancel(UUID, TEXT);
CREATE FUNCTION public.capa_cancel(p_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_status TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CAPA_NO_TENANT: لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CAPA_NOT_STAFF: الإلغاء للموارد البشرية والإدارة فقط';
  END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'CAPA_CANCEL_REASON_REQUIRED: سبب الإلغاء مطلوب';
  END IF;

  SELECT status INTO v_status FROM public.corrective_actions
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'CAPA_NOT_FOUND: الإجراء غير موجود'; END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'CAPA_ALREADY_COMPLETED: لا يُلغى إجراءٌ أُنجز';
  END IF;
  IF v_status = 'cancelled' THEN RETURN FALSE; END IF;

  UPDATE public.corrective_actions
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = btrim(p_reason)
   WHERE id = p_id AND tenant_id = v_tenant;
  RETURN TRUE;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑩ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE تلقائياً (pg_default_acl)
--    ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.safety_incident_board(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safety_incident_board(TEXT, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.safety_incident_board(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.capa_board(TEXT, TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capa_board(TEXT, TEXT, UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.capa_board(TEXT, TEXT, UUID, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.health_safety_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.health_safety_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.health_safety_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.capa_open(UUID, TEXT, TEXT, TEXT, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capa_open(UUID, TEXT, TEXT, TEXT, UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.capa_open(UUID, TEXT, TEXT, TEXT, UUID, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.capa_start(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capa_start(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.capa_start(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.capa_complete(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capa_complete(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.capa_complete(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.capa_cancel(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capa_cancel(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.capa_cancel(UUID, TEXT) TO authenticated;

COMMIT;
