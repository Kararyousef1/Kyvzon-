-- ════════════════════════════════════════════════════════════════════════
--  0365 — سلامة الإجراءات التأديبية
--  المرحلة 4 — بوابة الموارد البشرية · hr/DisciplinaryPage.tsx (210 أسطر)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسباران: tools/dev/_probe_0365.sql و _probe_0365b.sql        │
--  │   على قاعدة نظيفة، 293 مايجريشناً، صفر فشل)                      │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ★★★ هذا الجدول **عارٍ تماماً**. `pg_constraint` كاملاً قبل هذه
--    المايجريشن سطران اثنان فقط:
--        disciplinary_actions_pkey            | p | PRIMARY KEY (id)
--        disciplinary_actions_tenant_id_fkey  | f | FK → tenants
--    صفر CHECK · صفر FK على الموظف أو المُصدِر · صفر محفّز عدا
--    `update_updated_at_column` · صفر دالة (`pg_proc` حيث prosrc
--    ILIKE '%disciplinary%' = **دالةٌ واحدة** هي `auto_create_triggers`
--    وهي عامّةٌ لا تخصّ التأديب).
--
--    ثلاثة عشر صفّاً فاسداً أُدرجت في المسبار الأول، **وقُبل كلُّ واحدٍ
--    منها**. لا صفَّ واحداً رفضته القاعدة.
--
--  ① ★★★ **`employee_id` بلا مفتاح أجنبيّ.**
--     PROBE_1: إجراءٌ تأديبيٌّ بحقّ الموظف `ffffffff-ffff-…-ffffffff`
--     المعدوم ⇒ **قُبِل**. id=542dfaf7-e0b6-4519-b89e-097e773a6435
--     ⇒ الصفحة تعرض «موظف» (القيمة الاحتياطية في السطر 130) لسجلٍّ
--       عقابيٍّ لا صاحب له.
--
--  ② ★★★ **`issued_by` بلا مفتاح أجنبيّ.**
--     PROBE_2: `issued_by = eeeeeeee-…` معدوم ⇒ **قُبِل**.
--     ⇒ إجراءٌ تأديبيٌّ لا يُعرف من أصدره. وهذا أخطر ما في السجلّ
--       العقابيّ: المساءلة تتطلّب مُصدِراً معلوماً.
--
--     ★ وعنوان `issued_by` هو **`profiles`** لا `employees` — أثبته
--       PROBE_17 على العيّنة نفسها:
--          يطابق_profiles = 12 · يطابق_employees = 0 · الإجمالي = 13
--       (الصفّ الثالث عشر هو المُصدِر المعدوم في PROBE_2).
--       والصفحة تُسند `issued_by: user?.id` وهو `auth.users.id`
--       = `profiles.id`. ⇒ FK إلى `profiles` هو الصحيح.
--
--  ③ ★★★ **عبورٌ بين المستأجرين داخل الصفّ الواحد.**
--     PROBE_3: `tenant_id = ألف` مع `employee_id` لموظف **باء**
--     (d5a6d508-5534-412d-8b7e-f06c9495099f) ⇒ **قُبِل**.
--     ⇒ هدى (HR ألف) تُصدر إجراءً تأديبياً بحقّ موظفٍ في شركةٍ أخرى،
--       والصفّ يقع داخل مستأجرها فتراه سياسة RLS سليماً.
--
--  ④ ★★★ **`tenant_id` قابلٌ للعدم.**
--     `information_schema.columns`: tenant_id | uuid | **YES** | (بلا افتراضيّ)
--     PROBE_4: صفٌّ بـ`tenant_id = NULL` ⇒ **قُبِل**.
--     ⇒ كلُّ سياسات RLS تبدأ بـ`tenant_id = current_user_tenant_id()`
--       و`NULL = <أيّ شيء>` يُعطي NULL لا TRUE ⇒ **الصفّ يختفي عن
--       الجميع إلى الأبد**: لا HR تراه ولا الموظف، ولا سبيل إلى حذفه
--       أو تصحيحه من التطبيق. سجلٌّ عقابيٌّ مدفونٌ حيّاً.
--
--  ⑤ ★★★ **`type` بلا CHECK.**
--     PROBE_5: `type = 'execution'` ⇒ **قُبِل**.
--     و`DISCIPLINARY_TYPE_LABELS` (hrModules.ts:288) خمس مفردات فقط.
--     ⇒ السطر 134 في الصفحة: `{DISCIPLINARY_TYPE_LABELS[action.type]}`
--       يُخرج `undefined` — **شارةٌ فارغة** في الواجهة.
--
--  ⑥ ★★★ **`severity` بلا CHECK.**
--     PROBE_6: `severity = 'apocalyptic'` ⇒ **قُبِل**.
--     والصفحة تعرض أربع خيارات فقط (low/medium/high/critical) في
--     السطور 163–166، وتطبع القيمة **خامّةً** في السطر 191:
--       `<DetailRow label="الخطورة" value={selected.severity} />`
--     ⇒ المستخدم العربيّ يرى `apocalyptic` نصّاً إنجليزياً.
--
--  ⑦ ★★★ **`status` بلا CHECK.**
--     PROBE_7: `status = 'banana'` ⇒ **قُبِل**.
--     والسطر 103 يعدّ `a.status === 'active'` فقط ⇒ بطاقة «نشطة»
--     تُسقط أيَّ حالةٍ أخرى صامتةً.
--
--  ⑧ ★★★ **`incident_date` في المستقبل.**
--     PROBE_8: واقعةٌ بتاريخ `CURRENT_DATE + 730` (2028-08-07) ⇒ **قُبِل**.
--     ⇒ عقابٌ على واقعةٍ لم تقع بعد بسنتين.
--
--  ⑨ ★★★ **`valid_until` قبل `incident_date`.**
--     PROBE_9: واقعةٌ في 2026-08-08 وصلاحيةٌ تنتهي 2025-07-04 ⇒ **قُبِل**.
--     ⇒ إنذارٌ انتهى قبل أن يُكتب بأربعمئة يوم.
--
--  ⑩ ★★★ **`reason` ثلاث مسافات.**
--     PROBE_10: **فصلٌ من العمل** (`termination`/`critical`) بسببٍ
--     نصُّه `'   '` ⇒ **قُبِل**. `NOT NULL` لا يمنع المسافات.
--     ⇒ الصفحة تعرضه في السطر 131 سطراً فارغاً تحت اسم الموظف.
--
--  ⑪ ★★★ **الموظف يُصدر إجراءً تأديبياً بحقّ نفسه.**
--     PROBE_11: `employee_id` = سالم و`issued_by` = سالم ⇒ **قُبِل**.
--     (نظير محفّزَي خلافة النفس في 0361.)
--
--  ⑫ ★★★ **`appeal_response` موجودٌ و`is_appealed = false`.**
--     PROBE_12: «رُفض التظلّم» مكتوبٌ على إجراءٍ **لم يُتظلَّم عليه** ⇒ قُبِل.
--
--  ⑬ ★★★ **لا آليةَ تظلّمٍ إطلاقاً — صفر دالة وصفر عمود دورة حياة.**
--     PROBE_13:
--        دوال_تأديب (proname ILIKE '%disciplin%' أو '%appeal%') = **0**
--        أعمدة_دورة_الحياة (appealed_at · appeal_reason ·
--          appeal_decided_by/at · acknowledged_at/by ·
--          revoked_at/by · revoke_reason)                    = **0**
--     ⇒ العمودان `is_appealed` و`appeal_response` **يتيمان**: لا متى
--       قُدِّم التظلّم، ولا ما نصُّه، ولا من بتَّ فيه، ولا متى.
--
--  ⑭ ★★★ **لا انتهاءَ تلقائيّاً — `valid_until` يمرّ والحالة `active`.**
--     PROBE_14: **صفّان** حالتهما `active` و`valid_until < CURRENT_DATE`
--     (أحدهما انتهى منذ مئتَي يوم). ودوالُ التحديث = **0**.
--     ⇒ إنذارٌ انقضت مدّته يظلّ محسوباً «نشطاً» في بطاقة الصفحة إلى
--       الأبد، ويظلّ في سجلّ الموظف عند أيّ ترقيةٍ أو تقييم.
--
--  ⑮ ★★★ **الحذف النهائيّ مسموحٌ — و HR تمارسه فعلاً.**
--     PROBE_15 (بدور postgres):  حُذف **1** صفّ نهائياً.
--     RLS_4  (بدور `authenticated` حقيقيّ · هدى/HR):
--        «HR محا **1** سجلَّ إيقافٍ نهائياً بلا أثر.»
--     سياسة `kyvzon_disciplinary_actions_delete` مفتوحةٌ لكلّ staff،
--     ولا محفّز منعٍ كـ`DOCUMENT_DELETE_BLOCKED` (0360) أو
--     `EXPENSE_DELETE_BLOCKED` (0363).
--     ⇒ يخالف قاعدة المشروع: **لا حذف نهائيّ**.
--
--  ⑯ ★★★★ **حقُّ التظلّم مكتوبٌ في الجدول وغيرُ قابلٍ للممارسة.**
--     هذا أخطر ما في الجولة، وكشفه المسبار الثاني بدورٍ حقيقيّ:
--
--        RLS_1: سالم (موظف) يرى إجراءه.                 = **1 صفّ** ✔
--        RLS_2: سالم يُحدّث `is_appealed = TRUE`.       = **0 صفّ** ✘
--
--     السببُ نصُّ سياسة UPDATE حرفياً من `pg_policy`:
--        USING       ((tenant_id = current_user_tenant_id())
--                     AND current_user_is_staff())
--        WITH CHECK  (tenant_id = current_user_tenant_id())
--
--     و`current_user_is_staff()` = admin·hr·developer·it_admin **فقط**.
--     ⇒ الموظف **يقرأ** عقوبته ولا يستطيع الاعتراض عليها بحرف. العمود
--       `is_appealed` موجودٌ منذ إنشاء الجدول ولم يكن قابلاً للضبط من
--       صاحب الشأن يوماً. الصفحة نفسها لا تعرض زرَّ تظلّمٍ أصلاً —
--       فالعطل مكتملُ الطبقات: لا واجهة ولا خدمة ولا سياسة.
--
--     ★ ولا يجوز فتح سياسة UPDATE للموظف: سيُحرّر حينها `type` و
--       `severity` و`status` أيضاً. الحلُّ الوحيد السليم دالةُ
--       `SECURITY DEFINER` تسمح بحقلَي التظلّم **وحدهما** — وهو ما
--       تفعله `disciplinary_appeal()` أدناه.
--
--  ═══════════════════════════════════════════════════════════════════
--  ملاحظاتٌ منهجية
--  ═══════════════════════════════════════════════════════════════════
--  ★ `RLS_1 = 0` في أوّل تشغيلٍ للمسبار الثاني كان **خطأً منّي**، لا
--    عطلاً: ضبطتُ `request.jwt.claims` بينما شيم الاختبار
--    (tools/dev/pgtest-supabase-shim.sql:19) يقرأ
--    `request.jwt.claim.sub`. بعد التصحيح صار `RLS_1 = 1` صحيحاً.
--    أُوثّقه لئلّا يُعاد الخطأ.
--
--  ★ `AT TIME ZONE 'Asia/Baghdad'` صريحاً في كلّ حسابٍ للتاريخ —
--    الخادم `Etc/UTC` وبغداد UTC+3.
--
--  ★ 0268 يمنح `authenticated` صلاحية EXECUTE تلقائياً عبر
--    `pg_default_acl` ⇒ `REVOKE … FROM anon` هو الحارس الحقيقيّ.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف البيانات القائمة قبل فرض القيود
--     الجدول فارغٌ على قاعدة الاختبار (0 صفّ)، لكنّ قاعدة المستخدم
--     قد تحوي صفوفاً. نُصلح ما يُصلَح ولا نحذف شيئاً.
-- ═══════════════════════════════════════════════════════════════════

-- المفردات الشاذّة تُردّ إلى أقرب مفردةٍ سليمة
UPDATE public.disciplinary_actions
   SET type = 'written_warning'
 WHERE type NOT IN ('verbal_warning','written_warning','suspension','demotion','termination');

UPDATE public.disciplinary_actions
   SET severity = 'medium'
 WHERE severity NOT IN ('low','medium','high','critical');

UPDATE public.disciplinary_actions
   SET status = 'active'
 WHERE status NOT IN ('active','appealed','overturned','expired','revoked');

-- سببٌ فارغٌ يُملأ بنصٍّ صريحٍ يكشف نفسه
UPDATE public.disciplinary_actions
   SET reason = '(سببٌ غير مُدوَّن — سجلٌّ سابقٌ لسريان القيد)'
 WHERE btrim(COALESCE(reason,'')) = '';

-- تاريخُ واقعةٍ مستقبليٌّ يُردّ إلى اليوم
UPDATE public.disciplinary_actions
   SET incident_date = (now() AT TIME ZONE 'Asia/Baghdad')::DATE
 WHERE incident_date > (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

-- صلاحيةٌ تسبق الواقعة تُلغى (NULL = بلا أجل)
UPDATE public.disciplinary_actions
   SET valid_until = NULL
 WHERE valid_until IS NOT NULL AND valid_until < incident_date;

-- ردُّ تظلّمٍ بلا تظلّم ⇒ يُعلَن التظلّم قائماً (لا نُتلف النصّ)
UPDATE public.disciplinary_actions
   SET is_appealed = TRUE
 WHERE is_appealed = FALSE AND btrim(COALESCE(appeal_response,'')) <> '';

-- صفوفٌ يتيمةٌ بلا مستأجر: تُنسب إلى مستأجر مُصدِرها إن أمكن
UPDATE public.disciplinary_actions d
   SET tenant_id = p.tenant_id
  FROM public.profiles p
 WHERE d.tenant_id IS NULL AND p.id = d.issued_by AND p.tenant_id IS NOT NULL;

-- وإلّا إلى مستأجر الموظف
UPDATE public.disciplinary_actions d
   SET tenant_id = e.tenant_id
  FROM public.employees e
 WHERE d.tenant_id IS NULL AND e.id = d.employee_id AND e.tenant_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
--  ① أعمدة دورة الحياة (العطل ⑬)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.disciplinary_actions
  ADD COLUMN IF NOT EXISTS acknowledged_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appealed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_reason      TEXT,
  ADD COLUMN IF NOT EXISTS appeal_decision    TEXT,
  ADD COLUMN IF NOT EXISTS appeal_decided_by  UUID,
  ADD COLUMN IF NOT EXISTS appeal_decided_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by         UUID,
  ADD COLUMN IF NOT EXISTS revocation_reason  TEXT,
  ADD COLUMN IF NOT EXISTS expired_at         TIMESTAMPTZ;

COMMENT ON COLUMN public.disciplinary_actions.acknowledged_at IS
  'لحظة إقرار الموظف باطّلاعه على الإجراء — 0365';
COMMENT ON COLUMN public.disciplinary_actions.appeal_reason IS
  'نصُّ تظلّم الموظف. يُكتب حصراً عبر disciplinary_appeal() — 0365';
COMMENT ON COLUMN public.disciplinary_actions.appeal_decision IS
  'قرار التظلّم: upheld (مُثبَت) · reduced (مُخفَّف) · overturned (مُلغى) — 0365';
COMMENT ON COLUMN public.disciplinary_actions.revocation_reason IS
  'سبب الإلغاء الإداريّ. الحذف النهائيّ ممنوع — 0365';

-- ═══════════════════════════════════════════════════════════════════
--  ② tenant_id NOT NULL (العطل ④)
-- ═══════════════════════════════════════════════════════════════════

-- ما بقي يتيماً بعد ⓪ لا يُمكن إسناده ⇒ نمنع الجديد فقط عبر CHECK
-- NOT VALID، ثم نُصادق إن كانت القاعدة نظيفة.
DO $$
DECLARE v_orphans INTEGER;
BEGIN
  SELECT count(*) INTO v_orphans
    FROM public.disciplinary_actions WHERE tenant_id IS NULL;
  IF v_orphans = 0 THEN
    ALTER TABLE public.disciplinary_actions
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE '0365: % صفّاً يتيماً بلا مستأجر — تُرك tenant_id قابلاً للعدم', v_orphans;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ③ المفاتيح الأجنبية المركَّبة (الأعطال ①/②/③)
--     ★★★ FK مركَّب (id, tenant_id) لا مفرد — هو الذي يمنع العبور
--       بين المستأجرين. FK مفرد يمرّر PROBE_3 كاملاً.
-- ═══════════════════════════════════════════════════════════════════

-- `uq_employees_id_tenant` موجودٌ منذ 0360 (مُحقَّق من pg_indexes).
-- ونظيرُه على profiles غيرُ موجود (0 صفّ) ⇒ نُنشئه.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_id_tenant
  ON public.profiles (id, tenant_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.disciplinary_actions'::regclass
       AND conname  = 'fk_disciplinary_employee_tenant'
  ) THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT fk_disciplinary_employee_tenant
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.disciplinary_actions'::regclass
       AND conname  = 'fk_disciplinary_issuer_tenant'
  ) THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT fk_disciplinary_issuer_tenant
      FOREIGN KEY (issued_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ④ القيود (الأعطال ⑤/⑥/⑦/⑧/⑨/⑩/⑫)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_type') THEN
    ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_type
      CHECK (type IN ('verbal_warning','written_warning','suspension','demotion','termination'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_severity') THEN
    ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_severity
      CHECK (severity IN ('low','medium','high','critical'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_status') THEN
    ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_status
      CHECK (status IN ('active','appealed','overturned','expired','revoked'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_reason_present') THEN
    ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_reason_present
      CHECK (btrim(reason) <> '');
  END IF;
END $$;

-- ★ لا نستعمل CURRENT_DATE في CHECK — غير IMMUTABLE. الحارس محفّزٌ (⑥).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_valid_until_after_incident') THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT chk_disciplinary_valid_until_after_incident
      CHECK (valid_until IS NULL OR valid_until >= incident_date);
  END IF;
END $$;

-- الموظف لا يعاقب نفسه: employee_id يُقارَن بـ employees.user_id للمُصدِر.
-- ★ المقارنة المباشرة employee_id <> issued_by **لا تكفي** — العنوانان
--   مختلفان (employees.id مقابل profiles.id) فتنجح دائماً. الحارس محفّزٌ (⑥).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_appeal_coherent') THEN
    ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_appeal_coherent
      CHECK (
        -- ردُّ تظلّمٍ أو سببُ تظلّمٍ أو بتٌّ فيه ⇒ يجب أن يكون التظلّم قائماً
        (btrim(COALESCE(appeal_response,'')) = ''
         AND btrim(COALESCE(appeal_reason,'')) = ''
         AND appeal_decision IS NULL
         AND appeal_decided_by IS NULL
         AND appeal_decided_at IS NULL
         AND appealed_at IS NULL)
        OR is_appealed = TRUE
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_appeal_decision') THEN
    ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_appeal_decision
      CHECK (appeal_decision IS NULL
             OR appeal_decision IN ('upheld','reduced','overturned'));
  END IF;
END $$;

-- بتُّ التظلّم يستلزم مُقرِّراً ولحظة
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_appeal_decided_complete') THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT chk_disciplinary_appeal_decided_complete
      CHECK (appeal_decision IS NULL
             OR (appeal_decided_by IS NOT NULL AND appeal_decided_at IS NOT NULL));
  END IF;
END $$;

-- الإلغاء يستلزم سبباً ولحظةً وفاعلاً — ولا يكون إلّا بحالة revoked
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_revoked_complete') THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT chk_disciplinary_revoked_complete
      CHECK (
        (status <> 'revoked' AND revoked_at IS NULL
           AND revoked_by IS NULL AND revocation_reason IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL
           AND revoked_by IS NOT NULL AND btrim(COALESCE(revocation_reason,'')) <> '')
      );
  END IF;
END $$;

-- حالة `expired` تستلزم أجلاً منقضياً مُسجَّلاً
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_expired_complete') THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT chk_disciplinary_expired_complete
      CHECK ((status <> 'expired' AND expired_at IS NULL)
             OR (status = 'expired' AND expired_at IS NOT NULL AND valid_until IS NOT NULL));
  END IF;
END $$;

-- حالة `overturned` لا تكون إلّا بقرار تظلّمٍ بالإلغاء
-- ★★★ الثغرة الثلاثية: `appeal_decision = 'overturned'` تُعطي **NULL** حين
--   يكون العمود معدوماً، و`FALSE OR NULL = NULL`، و**CHECK يقبل NULL**.
--   أثبته التأكيد 5.6 بإسقاط أول صياغةٍ كتبتُها:
--     SELECT (FALSE OR (NULL::text = 'overturned')) IS NULL  ⇒  t
--   ⇒ نستعمل IS NOT DISTINCT FROM ليكون الناتج boolean لا NULL أبداً.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_overturned_needs_appeal') THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT chk_disciplinary_overturned_needs_appeal
      CHECK (status <> 'overturned'
             OR appeal_decision IS NOT DISTINCT FROM 'overturned');
  END IF;
END $$;

-- حالة `appealed` تستلزم تظلّماً قائماً لم يُبَتَّ فيه
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.disciplinary_actions'::regclass
      AND conname='chk_disciplinary_appealed_state') THEN
    ALTER TABLE public.disciplinary_actions
      ADD CONSTRAINT chk_disciplinary_appealed_state
      -- ★ آمنٌ من الثغرة الثلاثية: is_appealed هو NOT NULL،
      --   و IS NOT NULL / IS NULL تُعيدان boolean دائماً.
      CHECK (status <> 'appealed'
             OR (is_appealed = TRUE AND appealed_at IS NOT NULL AND appeal_decision IS NULL));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ فهارس
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_disciplinary_tenant_status
  ON public.disciplinary_actions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_disciplinary_expiry_due
  ON public.disciplinary_actions (valid_until)
  WHERE status = 'active' AND valid_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disciplinary_issued_by
  ON public.disciplinary_actions (issued_by);

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ محفّز الحراسة (الأعطال ⑧/⑪) + منع الحذف (العطل ⑮)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_disciplinary_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today      DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_issuer_emp UUID;
BEGIN
  -- العطل ⑧: واقعةٌ في المستقبل
  -- ★ CHECK لا يصلح هنا: CURRENT_DATE غير IMMUTABLE.
  IF NEW.incident_date > v_today THEN
    RAISE EXCEPTION 'DISCIPLINARY_FUTURE_INCIDENT: تاريخ الواقعة % في المستقبل (اليوم في بغداد %)',
      NEW.incident_date, v_today;
  END IF;

  -- العطل ⑪: الموظف يعاقب نفسه.
  -- ★★★ المقارنة employee_id <> issued_by تنجح دائماً لاختلاف العنوانين
  --   (employees.id مقابل profiles.id) ⇒ نترجم المُصدِر إلى صفّ موظفه.
  SELECT e.id INTO v_issuer_emp
    FROM public.employees e
   WHERE e.user_id = NEW.issued_by
     AND e.tenant_id = NEW.tenant_id
   LIMIT 1;

  IF v_issuer_emp IS NOT NULL AND v_issuer_emp = NEW.employee_id THEN
    RAISE EXCEPTION 'DISCIPLINARY_SELF_ISSUE: لا يجوز أن يُصدر الموظف إجراءً تأديبياً بحقّ نفسه (employee_id=%)',
      NEW.employee_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_disciplinary_guard ON public.disciplinary_actions;
CREATE TRIGGER trg_disciplinary_guard
  BEFORE INSERT OR UPDATE ON public.disciplinary_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_disciplinary_guard();

CREATE OR REPLACE FUNCTION public.tg_block_disciplinary_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'DISCIPLINARY_DELETE_BLOCKED: السجلّ التأديبيّ لا يُحذف. استعمل disciplinary_revoke() للإلغاء الإداريّ (id=%)',
    OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_block_disciplinary_delete ON public.disciplinary_actions;
CREATE TRIGGER trg_block_disciplinary_delete
  BEFORE DELETE ON public.disciplinary_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_disciplinary_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ الانتهاء التلقائيّ (العطل ⑭)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.disciplinary_expire_due();
CREATE FUNCTION public.disciplinary_expire_due()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RETURN 0; END IF;

  UPDATE public.disciplinary_actions
     SET status = 'expired',
         expired_at = now(),
         updated_at = now()
   WHERE tenant_id = v_tenant
     AND status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < v_today;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ اللوح والملخّص
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.disciplinary_board(TEXT, TEXT, TEXT, INTEGER);
CREATE FUNCTION public.disciplinary_board(
  p_search TEXT    DEFAULT NULL,
  p_status TEXT    DEFAULT NULL,
  p_type   TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  id                 UUID,
  employee_id        UUID,
  employee_name      TEXT,
  employee_code      TEXT,
  type               TEXT,
  severity           TEXT,
  status             TEXT,
  reason             TEXT,
  description        TEXT,
  incident_date      DATE,
  valid_until        DATE,
  days_remaining     INTEGER,
  is_expiring_soon   BOOLEAN,
  issued_by          UUID,
  issuer_name        TEXT,
  acknowledged_at    TIMESTAMPTZ,
  is_appealed        BOOLEAN,
  appealed_at        TIMESTAMPTZ,
  appeal_reason      TEXT,
  appeal_decision    TEXT,
  appeal_response    TEXT,
  appeal_decided_at  TIMESTAMPTZ,
  appeal_decider     TEXT,
  revoked_at         TIMESTAMPTZ,
  revocation_reason  TEXT,
  can_appeal         BOOLEAN,
  created_at         TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_me    UUID := public.current_user_employee_id();
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.employee_id,
    -- ★ full_name_ar فارغٌ بنيوياً (0 صفّ غير معدوم — PROBE_16)
    --   ⇒ نركّب الاسم من first_name/last_name كما في الجولات السابقة.
    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,
    e.employee_code::TEXT,
    d.type::TEXT,
    d.severity::TEXT,
    d.status::TEXT,
    d.reason::TEXT,
    d.description::TEXT,
    d.incident_date,
    d.valid_until,
    CASE WHEN d.valid_until IS NULL THEN NULL
         ELSE (d.valid_until - v_today) END::INTEGER,
    (d.status = 'active' AND d.valid_until IS NOT NULL
       AND d.valid_until >= v_today AND d.valid_until <= v_today + 30),
    d.issued_by,
    COALESCE(NULLIF(btrim(pi.full_name), ''), 'مُصدِر غير معروف')::TEXT,
    d.acknowledged_at,
    d.is_appealed,
    d.appealed_at,
    d.appeal_reason::TEXT,
    d.appeal_decision::TEXT,
    d.appeal_response::TEXT,
    d.appeal_decided_at,
    COALESCE(NULLIF(btrim(pd.full_name), ''), NULL)::TEXT,
    d.revoked_at,
    d.revocation_reason::TEXT,
    -- التظلّم متاحٌ لصاحب الشأن وحده، على إجراءٍ نافذٍ لم يُتظلَّم عليه
    (v_me IS NOT NULL AND v_me = d.employee_id
       AND d.status = 'active' AND d.is_appealed = FALSE),
    d.created_at
  FROM public.disciplinary_actions d
  LEFT JOIN public.employees e ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
  LEFT JOIN public.profiles  pi ON pi.id = d.issued_by
  LEFT JOIN public.profiles  pd ON pd.id = d.appeal_decided_by
  WHERE (p_status IS NULL OR d.status = p_status)
    AND (p_type   IS NULL OR d.type   = p_type)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR d.reason ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.full_name_ar,'') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')
           ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.employee_code,'') ILIKE '%' || btrim(p_search) || '%'
    )
  -- ★★★ ترتيبٌ حتميّ: created_at قد يتساوى (طابع المعاملة — درس 0362)
  --   ⇒ نُذيّله بـ id ليكون الترتيب مستقرّاً في كل تشغيل.
  ORDER BY d.incident_date DESC, d.created_at DESC, d.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

DROP FUNCTION IF EXISTS public.disciplinary_summary();
CREATE FUNCTION public.disciplinary_summary()
RETURNS TABLE (
  total            INTEGER,
  active           INTEGER,
  appealed         INTEGER,
  overturned       INTEGER,
  expired          INTEGER,
  revoked          INTEGER,
  verbal           INTEGER,
  written          INTEGER,
  severe           INTEGER,
  critical_active  INTEGER,
  unacknowledged   INTEGER,
  expiring_soon    INTEGER,
  overdue_expiry   INTEGER
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
    count(*)::INTEGER,
    count(*) FILTER (WHERE d.status = 'active')::INTEGER,
    count(*) FILTER (WHERE d.status = 'appealed')::INTEGER,
    count(*) FILTER (WHERE d.status = 'overturned')::INTEGER,
    count(*) FILTER (WHERE d.status = 'expired')::INTEGER,
    count(*) FILTER (WHERE d.status = 'revoked')::INTEGER,
    count(*) FILTER (WHERE d.type = 'verbal_warning')::INTEGER,
    count(*) FILTER (WHERE d.type = 'written_warning')::INTEGER,
    -- «شديدة» = إيقاف أو خفض درجة أو فصل
    count(*) FILTER (WHERE d.type IN ('suspension','demotion','termination'))::INTEGER,
    count(*) FILTER (WHERE d.severity = 'critical' AND d.status = 'active')::INTEGER,
    count(*) FILTER (WHERE d.acknowledged_at IS NULL AND d.status = 'active')::INTEGER,
    count(*) FILTER (WHERE d.status = 'active' AND d.valid_until IS NOT NULL
                       AND d.valid_until >= v_today AND d.valid_until <= v_today + 30)::INTEGER,
    -- ★ العطل ⑭ مقروءاً: نشطٌ وقد انقضى أجله ⇒ يحتاج disciplinary_expire_due()
    count(*) FILTER (WHERE d.status = 'active' AND d.valid_until IS NOT NULL
                       AND d.valid_until < v_today)::INTEGER
  FROM public.disciplinary_actions d;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑨ الإصدار
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.disciplinary_issue(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE);
CREATE FUNCTION public.disciplinary_issue(
  p_employee_id  UUID,
  p_type         TEXT,
  p_reason       TEXT,
  p_severity     TEXT DEFAULT 'low',
  p_description  TEXT DEFAULT NULL,
  p_incident_date DATE DEFAULT NULL,
  p_valid_until  DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_date   DATE := COALESCE(p_incident_date, v_today);
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_STAFF: إصدار الإجراءات التأديبية للموارد البشرية والإدارة فقط';
  END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_REASON_REQUIRED: السبب مطلوب';
  END IF;
  IF p_type NOT IN ('verbal_warning','written_warning','suspension','demotion','termination') THEN
    RAISE EXCEPTION 'DISCIPLINARY_BAD_TYPE: نوع غير معروف %', p_type;
  END IF;
  IF COALESCE(p_severity,'low') NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'DISCIPLINARY_BAD_SEVERITY: درجة خطورة غير معروفة %', p_severity;
  END IF;

  INSERT INTO public.disciplinary_actions
    (tenant_id, employee_id, type, reason, description, severity,
     incident_date, valid_until, issued_by, status)
  VALUES
    (v_tenant, p_employee_id, p_type, btrim(p_reason), NULLIF(btrim(COALESCE(p_description,'')),''),
     COALESCE(p_severity,'low'), v_date, p_valid_until, auth.uid(), 'active')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑩ إقرار الاطّلاع — للموظف صاحب الشأن
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.disciplinary_acknowledge(UUID);
CREATE FUNCTION public.disciplinary_acknowledge(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_me     UUID := public.current_user_employee_id();
  v_owner  UUID;
  v_ack    TIMESTAMPTZ;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NO_TENANT: لا مستأجر في السياق';
  END IF;

  SELECT d.employee_id, d.acknowledged_at INTO v_owner, v_ack
    FROM public.disciplinary_actions d
   WHERE d.id = p_id AND d.tenant_id = v_tenant;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_FOUND: الإجراء غير موجود';
  END IF;
  IF v_me IS NULL OR v_me <> v_owner THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_OWNER: الإقرار بالاطّلاع لصاحب الشأن وحده';
  END IF;
  IF v_ack IS NOT NULL THEN
    RETURN FALSE;  -- أقرَّ سابقاً — لا نُغيّر الطابع الأول
  END IF;

  UPDATE public.disciplinary_actions
     SET acknowledged_at = now(), updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑪ ★★★ التظلّم — العطل ⑯
--     الموظف لا يملك UPDATE على الجدول (سياسة UPDATE تشترط staff)،
--     ولا يجوز فتحها له وإلّا حرّر type و severity و status.
--     ⇒ SECURITY DEFINER تسمح بحقلَي التظلّم **وحدهما**.
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.disciplinary_appeal(UUID, TEXT);
CREATE FUNCTION public.disciplinary_appeal(p_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_me     UUID := public.current_user_employee_id();
  v_owner  UUID;
  v_status TEXT;
  v_app    BOOLEAN;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_APPEAL_REASON_REQUIRED: سبب التظلّم مطلوب';
  END IF;

  SELECT d.employee_id, d.status, d.is_appealed
    INTO v_owner, v_status, v_app
    FROM public.disciplinary_actions d
   WHERE d.id = p_id AND d.tenant_id = v_tenant;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_FOUND: الإجراء غير موجود';
  END IF;
  IF v_me IS NULL OR v_me <> v_owner THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_OWNER: التظلّم لصاحب الشأن وحده';
  END IF;
  IF v_app THEN
    RAISE EXCEPTION 'DISCIPLINARY_ALREADY_APPEALED: سبق تقديم تظلّم على هذا الإجراء';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_ACTIVE: لا تظلّم على إجراءٍ غير نافذ (الحالة %)', v_status;
  END IF;

  UPDATE public.disciplinary_actions
     SET is_appealed  = TRUE,
         appealed_at  = now(),
         appeal_reason = btrim(p_reason),
         status       = 'appealed',
         updated_at   = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑫ البتّ في التظلّم — للموارد البشرية
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.disciplinary_appeal_decide(UUID, TEXT, TEXT);
CREATE FUNCTION public.disciplinary_appeal_decide(
  p_id       UUID,
  p_decision TEXT,
  p_response TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_status   TEXT;
  v_app      BOOLEAN;
  v_decided  TEXT;
  v_new      TEXT;
  v_severity TEXT;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_STAFF: البتّ في التظلّم للموارد البشرية والإدارة فقط';
  END IF;
  IF p_decision NOT IN ('upheld','reduced','overturned') THEN
    RAISE EXCEPTION 'DISCIPLINARY_BAD_DECISION: قرار غير معروف %', p_decision;
  END IF;
  -- ★★★ العطل ⑲ في 0363 مُعمَّماً: قرارٌ بلا تعليل يضيع سببه إلى الأبد.
  IF btrim(COALESCE(p_response,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_RESPONSE_REQUIRED: تعليل القرار مطلوب';
  END IF;

  SELECT d.status, d.is_appealed, d.appeal_decision, d.severity
    INTO v_status, v_app, v_decided, v_severity
    FROM public.disciplinary_actions d
   WHERE d.id = p_id AND d.tenant_id = v_tenant;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_FOUND: الإجراء غير موجود';
  END IF;
  IF NOT v_app OR v_status <> 'appealed' THEN
    RAISE EXCEPTION 'DISCIPLINARY_NO_PENDING_APPEAL: لا تظلّم قائماً على هذا الإجراء (الحالة %)', v_status;
  END IF;
  IF v_decided IS NOT NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_APPEAL_ALREADY_DECIDED: سبق البتّ في هذا التظلّم (%)', v_decided;
  END IF;

  v_new := CASE WHEN p_decision = 'overturned' THEN 'overturned' ELSE 'active' END;

  UPDATE public.disciplinary_actions
     SET appeal_decision   = p_decision,
         appeal_response   = btrim(p_response),
         appeal_decided_by = auth.uid(),
         appeal_decided_at = now(),
         status            = v_new,
         -- «مُخفَّف» يُنزل درجة الخطورة فعلياً لا لفظاً
         severity = CASE
           WHEN p_decision = 'reduced' THEN
             CASE v_severity WHEN 'critical' THEN 'high'
                             WHEN 'high'     THEN 'medium'
                             ELSE 'low' END
           ELSE v_severity END,
         updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN v_new;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑬ الإلغاء الإداريّ — بديل الحذف (العطل ⑮)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.disciplinary_revoke(UUID, TEXT);
CREATE FUNCTION public.disciplinary_revoke(p_id UUID, p_reason TEXT)
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
    RAISE EXCEPTION 'DISCIPLINARY_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_STAFF: الإلغاء للموارد البشرية والإدارة فقط';
  END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_REVOKE_REASON_REQUIRED: سبب الإلغاء مطلوب';
  END IF;

  SELECT d.status INTO v_status
    FROM public.disciplinary_actions d
   WHERE d.id = p_id AND d.tenant_id = v_tenant;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_FOUND: الإجراء غير موجود';
  END IF;
  IF v_status = 'revoked' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.disciplinary_actions
     SET status = 'revoked',
         revoked_at = now(),
         revoked_by = auth.uid(),
         revocation_reason = btrim(p_reason),
         updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑭ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE تلقائياً (pg_default_acl)
--    ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.disciplinary_expire_due() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_expire_due() FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_expire_due() TO authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_board(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_board(TEXT, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_board(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_issue(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_issue(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_issue(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_acknowledge(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_acknowledge(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_acknowledge(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_appeal(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_appeal(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_appeal(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_appeal_decide(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_appeal_decide(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_appeal_decide(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_revoke(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_revoke(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.disciplinary_revoke(UUID, TEXT) TO authenticated;

COMMIT;
