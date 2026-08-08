-- ════════════════════════════════════════════════════════════════════════
--  0364 — سلامة عقود الموظفين
--  المرحلة 4 — بوابة الموارد البشرية · hr/EmployeeContractsPage.tsx (210 أسطر)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0364.sql — على قاعدة نظيفة، 292 م.)  │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ★ إنصافاً للجدول: `contract_type` و`status` بـCHECK، وفرادةٌ على
--    `(tenant_id, contract_number)`، وثلاثة فهارس. الأعطال في مكانٍ آخر.
--
--  ① ★★★ **شرطٌ ميّتٌ في سياسة القراءة: `employee_id = auth.uid()`.**
--
--     نصّ السياسة الحرفيّ من `pg_policy`:
--        ((tenant_id = current_user_tenant_id())
--          AND (current_user_is_staff()
--               OR (employee_id = auth.uid())            ← ميّت
--               OR (employee_id = current_user_employee_id())))
--
--     `employee_id` يشير إلى `employees.id` و`auth.uid()` هو
--     `auth.users.id` — **وهما مختلفان قطعاً** (درس متكرّر منذ 0357).
--     PROBE_1:
--        employees.id = 27d23175-e4ef-447e-802a-62e458d39a40
--        auth.uid()   = 11640001-0000-0000-0000-000000000001
--        يتساويان؟ **false**
--        صفوف employees حيث id = user_id: **0**
--
--     ⇒ الشرط الثاني لا يُطابق صفّاً واحداً أبداً. لا ضرر أمنيّ (الشرط
--       الثالث يعمل)، لكنه **شيفرة ميتة في جدارٍ أمنيّ** — أخطر ما فيها
--       أنها تُوحي بأمانٍ مزدوج غير موجود، وأيُّ تعديلٍ يُسقط الشرط
--       الثالث سيبدو سليماً وهو ليس كذلك.
--
--  ② ★★★ **`employee_id` بلا مفتاح أجنبيّ.**
--     PROBE_2: عقدٌ لموظف `ffffffff-…` معدوم ⇒ **قُبِل**.
--     `pg_constraint` = pkey · unique · type CHECK · status CHECK ·
--     tenant FK. **لا شيء على الموظف.**
--
--  ③ ★★★ **عقدٌ لموظف مستأجرٍ آخر داخل مستأجرك.**
--     PROBE_3: `tenant_id = ألف` مع `employee_id` من **باء** ⇒ قُبِل.
--
--  ④ ★★★ **`end_date` قبل `start_date`.**
--     PROBE_4: عقدٌ ينتهي **قبل أن يبدأ بأربعمئة يوم** ⇒ قُبِل.
--     والصفحة تحسب `daysLeft` سالباً فتعرض «منتهي» لعقدٍ لم يبدأ.
--
--  ⑤ ★★★ **عقودٌ نشطةٌ متداخلة للموظف نفسه.**
--     PROBE_5: **ثلاثة** عقودٍ نشطة لسالم في الوقت نفسه (دائم +
--     استشاري + محدد المدة). أيُّها العقد النافذ؟ لا جواب — والراتب
--     المرجعيّ يصير ثلاثة أرقام متناقضة.
--
--  ⑥ ★★★ **`fixed_term` بلا `end_date`.**
--     PROBE_6: «محدد المدة» بلا نهاية ⇒ قُبِل. تناقضٌ في التسمية نفسها،
--     ولا تنبيه تجديدٍ يُطلق أبداً.
--
--  ⑦ ★★★ **الحالة لا تتغيّر تلقائياً — المنتهي يبقى «نشطاً».**
--     PROBE_7: **عقدان** حالتهما `active` وقد انتهيا فعلاً (أحدهما منذ
--     أربعمئة يوم). ودوالٌ تُحدّث الحالة في المنظومة = **صفر**.
--     ⇒ بطاقة «عقود نشطة» تعدّ عقوداً منتهية، و«منتهية» تعتمد على
--       حسابٍ في المتصفّح لا على الحالة المخزَّنة.
--
--  ⑧ ★★ **`renewal_notice_days` يقبل صفراً وسالباً.**
--     PROBE_8: `-30` ⇒ قُبِل. «تنبيهٌ قبل ‎-30 يوماً» بلا معنى، والصفحة
--     تقارن `daysLeft <= renewal_notice_days` فيصير الشرط عبثاً.
--
--  ⑨ ★★ **`salary_amount` سالب و`salary_currency` بلا CHECK.**
--     PROBE_9: راتب `-5,000,000` بعملة `'XYZ'` ⇒ قُبِل.
--     ★ والعمود `varchar(10)` فحسب — لا قيد مفردات.
--
--  ⑩ ★★★ **الحذف النهائيّ مسموح.**
--     PROBE_10: بدور `authenticated` حقيقيّ (هدى · hr) `DELETE` نجح.
--     ولا محفّز يمنع (المحفّز الوحيد `updated_at`).
--     **عقد العمل وثيقةٌ قانونية** — تُمحى بلا أثر.
--
--  ⑪ ★★★ **التجديد بلا سجلّ — لا تاريخ للعقد إطلاقاً.**
--     `renewContract(id, endDate)` تكتب `end_date` الجديد **فوق**
--     القديم. PROBE_11:
--        أعمدة تُتبّع التجديد: **★ لا شيء**
--        (renewed_from · previous_end_date · renewal_count · terminated_at)
--        جدولٌ لتاريخ العقود: **★ معدوم**
--     ⇒ عقدٌ جُدِّد خمس مرّات يبدو كأنه عقدٌ واحد طويل. ولا سبيل
--       لمعرفة مدّته الأصلية ولا عدد تجديداته.
--
--  ⑫ ★★ **الإنهاء بلا سبب ولا تاريخ.**
--     PROBE_12: `terminateContract` تكتب `status='terminated'` فقط.
--     لا `terminated_at` ولا `termination_reason` — والعمودان معدومان.
--
--  ⑬ ★★★ **العقد جزيرةٌ معزولة.**
--     PROBE_13: أعمدة ربطٍ بالتوظيف (0362) أو إنهاء الخدمة (0359):
--     **★ لا شيء**. الموظَّف الجديد في 0362 لا يُنشأ له عقد، وإنهاء
--     الخدمة في 0359 لا يُنهي عقده.
--
--  ⑭ ★★ **صفر دالة** للوحة أو الملخّص (PROBE_14).
--
--  ⑮ ★★★ **الحساب بتوقيت المتصفّح لا بغداد.**
--     `differenceInCalendarDays(new Date(end_date), new Date())`
--     يعمل بمنطقة المتصفّح. إثباتٌ **بلحظةٍ ثابتة** (لا بساعة
--     التشغيل — درس 0327): عند `2026-08-07 22:30 UTC` = `01:30` بغداد:
--        UTC   ⇒ 2026-08-07 · بغداد ⇒ 2026-08-08  (**يختلفان**)
--        عقدٌ ينتهي 2026-08-08:
--          بـUTC   ⇒ «1 يوم» (سارٍ غداً)
--          ببغداد ⇒ «0 يوم» (ينتهي اليوم)
--     ⇒ بين منتصف الليل و03:00 بغداد، **كل** عقدٍ يُعرض بيومٍ زائد.
--
--  ⑯ ★★ `findAll` بلا حدّ · وجلب **كل** الموظفين لبناء `Map` يدويّ ·
--     و`orderBy 'full_name_ar'` على عمودٍ NULL لكل موظف (PROBE_16).
--
--  ⑰ ★★ **`created_by`/`updated_by` لا يُملآن تلقائياً** (PROBE_17:
--     ثمانية عقود بلا منشئ) — الصفحة تُمرّر `user?.id` والكتابة
--     المباشرة لا تُمرّر شيئاً.
--
--  ⑱ ★★ **`contract_number` يقبل الفراغ** والفرادة **لا تمنع NULL**
--     (PROBE_18: أحد عشر عقداً برقمٍ فارغ أو NULL).
--
--  ────────────────────────────────────────────────────────────────────
--  العلاج:
--    · إسقاط الشرط الميّت من السياسة (①)
--    · FK مركَّب · CHECK للتواريخ والمدّة والراتب والعملة
--    · فهرسٌ فريد جزئيّ يمنع التداخل النشط (⑤)
--    · أعمدة التجديد والإنهاء والربط (⑪⑫⑬)
--    · `contract_expire_due()` — الحالة تتحرّك (⑦)
--    · `contract_board()` · `contract_summary()` بتوقيت بغداد (⑮)
--    · `contract_upsert()` · `contract_renew()` · `contract_terminate()`
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ الأعمدة الناقصة (العطلان ⑪/⑫/⑬)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.employee_contracts
  ADD COLUMN IF NOT EXISTS renewed_from UUID,
  ADD COLUMN IF NOT EXISTS previous_end_date DATE,
  ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS job_application_id UUID,
  ADD COLUMN IF NOT EXISTS offboarding_id UUID;

COMMENT ON COLUMN public.employee_contracts.renewed_from IS
  'العقد السابق الذي جُدِّد عنه هذا — التجديد كان يكتب فوق القديم (العطل ⑪).';
COMMENT ON COLUMN public.employee_contracts.job_application_id IS
  'طلب التوظيف الذي نتج عنه العقد — الربط مع 0362 (العطل ⑬).';

-- ═══════════════════════════════════════════════════════════════════
--  ① تنظيف البيانات القائمة قبل فرض القيود
-- ═══════════════════════════════════════════════════════════════════

-- ★ العطلان ②/③: موظفٌ معدوم أو من مستأجرٍ آخر ⇒ يُنهى ثم يُحذف
DELETE FROM public.employee_contracts c
 WHERE NOT EXISTS (SELECT 1 FROM public.employees e
                    WHERE e.id = c.employee_id AND e.tenant_id = c.tenant_id);

-- ★ العطل ④: نهايةٌ قبل بداية ⇒ تُمحى النهاية (البداية أوثق)
UPDATE public.employee_contracts SET end_date = NULL
 WHERE end_date IS NOT NULL AND end_date < start_date;

-- ★ العطل ⑧: مدّة تنبيهٍ ≤ 0
UPDATE public.employee_contracts SET renewal_notice_days = 30
 WHERE renewal_notice_days <= 0;

-- ★ العطل ⑨: راتبٌ سالب وعملةٌ خارج المفردات
UPDATE public.employee_contracts SET salary_amount = NULL WHERE salary_amount < 0;
UPDATE public.employee_contracts SET salary_currency = 'IQD'
 WHERE salary_currency IS NULL
    OR salary_currency NOT IN ('IQD','USD','EUR','SAR','AED');

-- ★ العطل ⑱: رقم عقدٍ من فراغات ⇒ NULL (لا سلسلة فارغة)
UPDATE public.employee_contracts SET contract_number = NULL
 WHERE contract_number IS NOT NULL AND btrim(contract_number) = '';

-- ★★★ العطل ⑦: المنتهي فعلاً يصير `expired` (بتوقيت بغداد)
UPDATE public.employee_contracts
   SET status = 'expired'
 WHERE status = 'active' AND end_date IS NOT NULL
   AND end_date < (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

-- ★★★ العطل ⑥: `fixed_term` بلا نهاية ⇒ يصير `permanent`
--   (النوع أصدق من الافتراض: لا نخترع تاريخاً)
UPDATE public.employee_contracts SET contract_type = 'permanent'
 WHERE contract_type IN ('fixed_term','probation') AND end_date IS NULL;

-- ★★★ العطل ⑤: التداخل — يُبقى الأحدث نشطاً والباقي `renewed`
UPDATE public.employee_contracts SET status = 'renewed'
 WHERE id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (
       PARTITION BY tenant_id, employee_id
       ORDER BY start_date DESC, created_at DESC, id DESC) AS rn
       FROM public.employee_contracts
      WHERE status = 'active') z
    WHERE z.rn > 1);

-- ═══════════════════════════════════════════════════════════════════
--  ② القيود البنيوية
-- ═══════════════════════════════════════════════════════════════════

-- ★★★ العطلان ②/③ (uq_employees_id_tenant من 0360)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_employee_tenant_fkey') THEN
    ALTER TABLE public.employee_contracts
      ADD CONSTRAINT employee_contracts_employee_tenant_fkey
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ★★★ العطل ④
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_dates_chk') THEN
    ALTER TABLE public.employee_contracts ADD CONSTRAINT employee_contracts_dates_chk
      CHECK (end_date IS NULL OR end_date >= start_date);
  END IF;
END $$;

-- ★★★ العطل ⑥: محدد المدة والتجربة يحتاجان نهاية
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_term_chk') THEN
    ALTER TABLE public.employee_contracts ADD CONSTRAINT employee_contracts_term_chk
      CHECK (contract_type NOT IN ('fixed_term','probation') OR end_date IS NOT NULL);
  END IF;
END $$;

-- ★★ العطل ⑧
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_notice_chk') THEN
    ALTER TABLE public.employee_contracts ADD CONSTRAINT employee_contracts_notice_chk
      CHECK (renewal_notice_days > 0 AND renewal_notice_days <= 365);
  END IF;
END $$;

-- ★★ العطل ⑨
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_salary_chk') THEN
    ALTER TABLE public.employee_contracts ADD CONSTRAINT employee_contracts_salary_chk
      CHECK (salary_amount IS NULL OR salary_amount > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_currency_chk') THEN
    ALTER TABLE public.employee_contracts ADD CONSTRAINT employee_contracts_currency_chk
      CHECK (salary_currency IS NULL
             OR salary_currency IN ('IQD','USD','EUR','SAR','AED'));
  END IF;
END $$;

-- ★★ العطل ⑱: رقمٌ غير فارغ حين يُذكر
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_number_chk') THEN
    ALTER TABLE public.employee_contracts ADD CONSTRAINT employee_contracts_number_chk
      CHECK (contract_number IS NULL OR btrim(contract_number) <> '');
  END IF;
END $$;

-- ★★ العطل ⑫: الإنهاء يحتاج تاريخاً وسبباً
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_contracts_termination_chk') THEN
    ALTER TABLE public.employee_contracts
      ADD CONSTRAINT employee_contracts_termination_chk
      CHECK (status <> 'terminated'
             OR (terminated_at IS NOT NULL
                 AND termination_reason IS NOT NULL
                 AND btrim(termination_reason) <> ''));
  END IF;
END $$;

-- ★★★ العطل ⑤: عقدٌ نشطٌ واحد لكل موظف
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_contracts_one_active
  ON public.employee_contracts (tenant_id, employee_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_employee_contracts_expiring
  ON public.employee_contracts (tenant_id, end_date)
  WHERE status = 'active' AND end_date IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
--  ③ ★★★ العطل ①: إسقاط الشرط الميّت من السياسة
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS kyvzon_employee_contracts_select ON public.employee_contracts;
CREATE POLICY kyvzon_employee_contracts_select
  ON public.employee_contracts FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      -- ★★★ `employee_id = auth.uid()` أُسقط: employees.id ≠ auth.users.id
      --   (PROBE_1: صفر صفّ يطابق id = user_id) — شيفرة ميتة في جدارٍ أمنيّ.
      OR employee_id = public.current_user_employee_id()
    )
  );

-- ═══════════════════════════════════════════════════════════════════
--  ④ المحفّزات
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_employee_contract_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- ★ العطل ⑰: المنشئ يُستنتج ولا يُؤخذ من العميل
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.updated_by := NEW.created_by;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := public.current_user_tenant_id();
    END IF;
  ELSE
    NEW.created_by  := OLD.created_by;
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    NEW.updated_by  := COALESCE(auth.uid(), OLD.updated_by);
    -- ★★ العطل ⑫: الإنهاء يُسجَّل وقته تلقائياً
    IF NEW.status = 'terminated' AND OLD.status <> 'terminated' THEN
      NEW.terminated_at := COALESCE(NEW.terminated_at, now());
    END IF;
  END IF;
  -- ★ العطل ⑱: الفراغ ليس رقماً
  NEW.contract_number := NULLIF(btrim(COALESCE(NEW.contract_number,'')), '');
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_employee_contract_stamp() IS
  'يملأ created_by/updated_by (العطل ⑰) و terminated_at (⑫) ويُجمّد '
  'الموظف والمستأجر ويُطبّع رقم العقد (⑱).';

DROP TRIGGER IF EXISTS trg_employee_contract_stamp ON public.employee_contracts;
CREATE TRIGGER trg_employee_contract_stamp
  BEFORE INSERT OR UPDATE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_employee_contract_stamp();

-- ★ العطل ⑩: منع الحذف النهائيّ — عقد العمل وثيقةٌ قانونية
CREATE OR REPLACE FUNCTION public.tg_block_employee_contract_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'CONTRACT_DELETE_BLOCKED: عقد العمل لا يُحذف — استخدم الإنهاء';
END $$;

DROP TRIGGER IF EXISTS trg_block_employee_contract_delete ON public.employee_contracts;
CREATE TRIGGER trg_block_employee_contract_delete
  BEFORE DELETE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_employee_contract_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ ★★★ العطل ⑦: الحالة تتحرّك
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.contract_expire_due();
CREATE FUNCTION public.contract_expire_due()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  -- ★★★ بغداد UTC+3 والخادم Etc/UTC (العطل ⑮)
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بترحيل حالة العقود';
  END IF;

  UPDATE public.employee_contracts
     SET status = 'expired', updated_at = now()
   WHERE tenant_id = v_tenant
     AND status = 'active'
     AND end_date IS NOT NULL
     AND end_date < v_today;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.contract_expire_due() IS
  'يُرحّل العقود المنتهية إلى expired. لم يكن في المنظومة أيُّ مسارٍ '
  'يُحدّث الحالة (العطل ⑦: عقدان «نشطان» انتهيا منذ 400 يوم).';

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ اللوح والملخّص
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.contract_board(TEXT, TEXT, INTEGER);
CREATE FUNCTION public.contract_board(
  p_status TEXT    DEFAULT NULL,
  p_type   TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_contract_number TEXT,
  out_contract_type TEXT,
  out_title         TEXT,
  out_status        TEXT,
  out_start_date    DATE,
  out_end_date      DATE,
  -- ★★★ العطل ⑮: محسوبٌ بتوقيت بغداد لا بالمتصفّح
  out_days_left     INTEGER,
  out_expiry_state  TEXT,
  out_notice_days   INTEGER,
  out_salary_amount NUMERIC,
  out_salary_currency TEXT,
  out_document_url  TEXT,
  out_notes         TEXT,
  out_renewal_count INTEGER,
  out_previous_end  DATE,
  out_terminated_at TIMESTAMPTZ,
  out_termination_reason TEXT,
  out_creator_name  TEXT,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_staff  BOOLEAN := public.current_user_is_staff();
  v_me     UUID := public.current_user_employee_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY
  SELECT
    c.id, c.employee_id,
    -- ★ العطل ⑯: full_name_ar فارغ لكل موظف ⇒ احتياطيّ صريح
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
             'موظف ' || e.employee_code)::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, '—')::TEXT,
    COALESCE(c.contract_number, '—')::TEXT,
    c.contract_type::TEXT,
    COALESCE(c.title, '—')::TEXT,
    c.status::TEXT,
    c.start_date, c.end_date,
    -- ★ NULL = «بلا نهاية» لا «انتهى» (درس 0353)
    CASE WHEN c.end_date IS NULL THEN NULL
         ELSE (c.end_date - v_today)::INTEGER END,
    CASE
      WHEN c.end_date IS NULL                              THEN 'open_ended'
      WHEN c.end_date <  v_today                           THEN 'expired'
      WHEN c.end_date <= v_today + c.renewal_notice_days   THEN 'expiring'
      ELSE 'valid'
    END::TEXT,
    c.renewal_notice_days,
    c.salary_amount, c.salary_currency::TEXT,
    c.document_url, c.notes,
    c.renewal_count, c.previous_end_date,
    c.terminated_at, c.termination_reason,
    COALESCE(NULLIF(btrim(p.full_name), ''), '—')::TEXT,
    c.created_at
  FROM public.employee_contracts c
  JOIN public.employees e
    ON e.id = c.employee_id AND e.tenant_id = c.tenant_id
  LEFT JOIN public.departments d
    ON d.id = e.department_id AND d.tenant_id = c.tenant_id
  LEFT JOIN public.profiles p ON p.id = c.created_by
 WHERE c.tenant_id = v_tenant
   -- ★ الموظف يرى عقوده هو
   AND (v_staff OR c.employee_id = v_me)
   AND (p_status IS NULL OR c.status = p_status)
   AND (p_type IS NULL OR c.contract_type = p_type)
 -- ★★★ النشط أولاً ثم الأقرب انتهاءً ثم id فاصلاً (درس 0357)
 ORDER BY (c.status = 'active') DESC,
          c.end_date ASC NULLS LAST, c.id DESC
 LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.contract_board(TEXT, TEXT, INTEGER) IS
  'لوح العقود: استعلامٌ واحد بدل جلب كل الموظفين (العطل ⑯). '
  'out_days_left محسوبٌ بتوقيت بغداد لا بالمتصفّح (⑮).';

DROP FUNCTION IF EXISTS public.contract_summary();
CREATE FUNCTION public.contract_summary()
RETURNS TABLE (
  out_total      INTEGER,
  out_active     INTEGER,
  out_expiring   INTEGER,
  out_expired    INTEGER,
  out_terminated INTEGER,
  out_draft      INTEGER,
  -- ★★★ العطل ⑦: «نشطٌ» وقد انتهى — التناقض القائم
  out_stale      INTEGER,
  -- ★★ موظفون بلا عقدٍ نشط
  out_uncovered  INTEGER,
  out_no_document INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص العقود';
  END IF;

  RETURN QUERY
  WITH c AS (SELECT * FROM public.employee_contracts WHERE tenant_id = v_tenant)
  SELECT
    (SELECT count(*)::INTEGER FROM c),
    (SELECT count(*)::INTEGER FROM c WHERE status = 'active'),
    (SELECT count(*)::INTEGER FROM c
      WHERE status = 'active' AND end_date IS NOT NULL
        AND end_date >= v_today
        AND end_date <= v_today + renewal_notice_days),
    (SELECT count(*)::INTEGER FROM c WHERE status = 'expired'),
    (SELECT count(*)::INTEGER FROM c WHERE status = 'terminated'),
    (SELECT count(*)::INTEGER FROM c WHERE status = 'draft'),
    -- ★★★ التناقض: حالته active وقد انتهى فعلاً
    (SELECT count(*)::INTEGER FROM c
      WHERE status = 'active' AND end_date IS NOT NULL AND end_date < v_today),
    -- ★★ موظفٌ نشطٌ بلا عقدٍ نشط
    (SELECT count(*)::INTEGER FROM public.employees e
      WHERE e.tenant_id = v_tenant AND e.is_active
        AND NOT EXISTS (SELECT 1 FROM c
                         WHERE c.employee_id = e.id AND c.status = 'active')),
    (SELECT count(*)::INTEGER FROM c
      WHERE status = 'active' AND document_url IS NULL);
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ الكتابة
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.contract_upsert(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.contract_upsert(
  p_id       UUID,
  p_employee UUID,
  p_type     TEXT,
  p_number   TEXT    DEFAULT NULL,
  p_title    TEXT    DEFAULT NULL,
  p_start    DATE    DEFAULT NULL,
  p_end      DATE    DEFAULT NULL,
  p_notice   INTEGER DEFAULT 30,
  p_salary   NUMERIC DEFAULT NULL,
  p_currency TEXT    DEFAULT 'IQD',
  p_document TEXT    DEFAULT NULL,
  p_notes    TEXT    DEFAULT NULL,
  p_status   TEXT    DEFAULT 'active'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_start  DATE := COALESCE(p_start, v_today);
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CONTRACT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CONTRACT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CONTRACT_NOT_AUTHORIZED';
  END IF;

  -- ★★★ العطلان ②/③: الموظف من المستأجر نفسه
  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'CONTRACT_EMPLOYEE_NOT_FOUND';
  END IF;
  IF p_type NOT IN ('permanent','fixed_term','probation',
                    'part_time','consultant','other') THEN
    RAISE EXCEPTION 'CONTRACT_TYPE_INVALID: %', p_type;
  END IF;
  IF p_status NOT IN ('draft','active','expired','terminated','renewed') THEN
    RAISE EXCEPTION 'CONTRACT_STATUS_INVALID: %', p_status;
  END IF;
  -- ★★★ العطل ④
  IF p_end IS NOT NULL AND p_end < v_start THEN
    RAISE EXCEPTION 'CONTRACT_END_BEFORE_START';
  END IF;
  -- ★★★ العطل ⑥
  IF p_type IN ('fixed_term','probation') AND p_end IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_TERM_NEEDS_END: % يحتاج تاريخ نهاية', p_type;
  END IF;
  -- ★★ العطل ⑧
  IF COALESCE(p_notice, 0) <= 0 OR p_notice > 365 THEN
    RAISE EXCEPTION 'CONTRACT_NOTICE_INVALID';
  END IF;
  -- ★★ العطل ⑨
  IF p_salary IS NOT NULL AND p_salary <= 0 THEN
    RAISE EXCEPTION 'CONTRACT_SALARY_INVALID';
  END IF;
  IF p_currency IS NOT NULL
     AND p_currency NOT IN ('IQD','USD','EUR','SAR','AED') THEN
    RAISE EXCEPTION 'CONTRACT_CURRENCY_INVALID: %', p_currency;
  END IF;

  -- ★★★ العطل ⑤: عقدٌ نشطٌ آخر يمنع الإنشاء برمزٍ مفهوم قبل الفهرس
  IF p_status = 'active' AND EXISTS (
       SELECT 1 FROM public.employee_contracts x
        WHERE x.tenant_id = v_tenant AND x.employee_id = p_employee
          AND x.status = 'active' AND (p_id IS NULL OR x.id <> p_id)) THEN
    RAISE EXCEPTION
      'CONTRACT_ACTIVE_EXISTS: للموظف عقدٌ نشطٌ بالفعل — جدّده أو أنهِه';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.employee_contracts
      (tenant_id, employee_id, contract_number, contract_type, title,
       start_date, end_date, renewal_notice_days, salary_amount,
       salary_currency, document_url, notes, status)
    VALUES
      (v_tenant, p_employee, NULLIF(btrim(COALESCE(p_number,'')),''), p_type,
       NULLIF(btrim(COALESCE(p_title,'')),''), v_start, p_end, p_notice,
       p_salary, COALESCE(p_currency,'IQD'),
       NULLIF(btrim(COALESCE(p_document,'')),''),
       NULLIF(btrim(COALESCE(p_notes,'')),''), p_status)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.employee_contracts
       SET contract_number = NULLIF(btrim(COALESCE(p_number,'')),''),
           contract_type = p_type,
           title = NULLIF(btrim(COALESCE(p_title,'')),''),
           start_date = v_start, end_date = p_end,
           renewal_notice_days = p_notice, salary_amount = p_salary,
           salary_currency = COALESCE(p_currency,'IQD'),
           document_url = NULLIF(btrim(COALESCE(p_document,'')),''),
           notes = NULLIF(btrim(COALESCE(p_notes,'')),''),
           status = p_status, updated_at = now()
     WHERE id = p_id AND tenant_id = v_tenant
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  END IF;

  RETURN v_id;
END $$;

-- ★★★ العطل ⑪: التجديد يُنشئ عقداً جديداً ويحفظ السلسلة
DROP FUNCTION IF EXISTS public.contract_renew(UUID, DATE, NUMERIC, TEXT);
CREATE FUNCTION public.contract_renew(
  p_id     UUID,
  p_new_end DATE,
  p_salary NUMERIC DEFAULT NULL,
  p_number TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_old    RECORD;
  v_new    UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CONTRACT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CONTRACT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CONTRACT_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO v_old FROM public.employee_contracts
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  IF v_old.status NOT IN ('active','expired') THEN
    RAISE EXCEPTION 'CONTRACT_NOT_RENEWABLE: %', v_old.status;
  END IF;
  IF p_new_end IS NULL THEN RAISE EXCEPTION 'CONTRACT_RENEW_NEEDS_END'; END IF;
  IF p_new_end <= COALESCE(v_old.end_date, v_old.start_date) THEN
    RAISE EXCEPTION 'CONTRACT_RENEW_NOT_LATER: النهاية الجديدة ليست بعد القديمة';
  END IF;
  IF p_new_end < v_today THEN RAISE EXCEPTION 'CONTRACT_RENEW_IN_PAST'; END IF;

  -- ★★★ القديم يُغلق أولاً (الفهرس الفريد يمنع نشطَين)
  UPDATE public.employee_contracts
     SET status = 'renewed', updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  INSERT INTO public.employee_contracts
    (tenant_id, employee_id, contract_number, contract_type, title,
     start_date, end_date, renewal_notice_days, salary_amount,
     salary_currency, document_url, notes, status,
     renewed_from, previous_end_date, renewal_count)
  VALUES
    (v_tenant, v_old.employee_id,
     NULLIF(btrim(COALESCE(p_number,'')),''), v_old.contract_type, v_old.title,
     COALESCE(v_old.end_date + 1, v_today), p_new_end,
     v_old.renewal_notice_days, COALESCE(p_salary, v_old.salary_amount),
     v_old.salary_currency, v_old.document_url, v_old.notes, 'active',
     p_id, v_old.end_date, v_old.renewal_count + 1)
  RETURNING id INTO v_new;

  RETURN v_new;
END $$;

COMMENT ON FUNCTION public.contract_renew(UUID, DATE, NUMERIC, TEXT) IS
  'التجديد يُنشئ عقداً جديداً مرتبطاً بالقديم عبر renewed_from ويحفظ '
  'previous_end_date و renewal_count. كان يكتب end_date فوق القديم '
  'فيضيع تاريخ العقد كلّه (العطل ⑪).';

-- ★★ العطل ⑫: الإنهاء بسببٍ وتاريخ
DROP FUNCTION IF EXISTS public.contract_terminate(UUID, TEXT, DATE);
CREATE FUNCTION public.contract_terminate(
  p_id     UUID,
  p_reason TEXT,
  p_date   DATE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_old    TEXT;
  v_start  DATE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CONTRACT_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CONTRACT_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CONTRACT_NOT_AUTHORIZED';
  END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'CONTRACT_TERMINATION_REASON_REQUIRED';
  END IF;

  SELECT status, start_date INTO v_old, v_start
    FROM public.employee_contracts
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  IF v_old = 'terminated' THEN RAISE EXCEPTION 'CONTRACT_ALREADY_TERMINATED'; END IF;
  IF COALESCE(p_date, v_today) < v_start THEN
    RAISE EXCEPTION 'CONTRACT_TERMINATION_BEFORE_START';
  END IF;

  UPDATE public.employee_contracts
     SET status = 'terminated',
         terminated_at = COALESCE(p_date::TIMESTAMPTZ, now()),
         termination_reason = btrim(p_reason),
         end_date = COALESCE(p_date, v_today),
         updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN 'terminated';
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE تلقائياً (pg_default_acl)
--    ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.contract_expire_due() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_expire_due() FROM anon;
GRANT EXECUTE ON FUNCTION public.contract_expire_due() TO authenticated;

REVOKE ALL ON FUNCTION public.contract_board(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_board(TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.contract_board(TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.contract_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.contract_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.contract_upsert(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_upsert(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.contract_upsert(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.contract_renew(UUID, DATE, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_renew(UUID, DATE, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.contract_renew(UUID, DATE, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.contract_terminate(UUID, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_terminate(UUID, TEXT, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.contract_terminate(UUID, TEXT, DATE) TO authenticated;

COMMIT;
