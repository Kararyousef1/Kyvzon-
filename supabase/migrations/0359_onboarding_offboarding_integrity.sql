-- ════════════════════════════════════════════════════════════════════════
--  0359 — سلامة التعريف وإنهاء الخدمة
--  المرحلة 4 — بوابة الموارد البشرية · صفحة hr/OnboardingPage.tsx (263 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0359.sql — على قاعدة نظيفة)          │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★ **إنهاء الخدمة يفشل دائماً — ويترك سجلاً يتيماً.**
--     `handleOffboard` ينفّذ نداءين متتابعين:
--        1) offboardingRecordService.createRecord({...})     ← ينجح
--        2) employeeService.update(id, {
--             is_active: false, employment_status: 'terminated' })
--
--     و`employment_status` **لا وجود له** في `employees` (مُحقَّق:
--     `information_schema.columns` ⇒ 0 صفّ).
--
--     PROBE_1:
--        ERROR: column "employment_status" of relation "employees"
--               does not exist
--
--     ⇒ النداء الأول ينجح والثاني يرمي، **بلا معاملة تجمعهما**:
--       سجلُّ إنهاء خدمة مكتوب والموظف **ما زال نشطاً**. يظهر في
--       «إنهاء الخدمة» وفي دليل الفريق «نشط» في آنٍ واحد.
--
--  ② ★★★ **بدء التعريف مرّتين يُضاعف المهام.**
--     لا قيد فرادة على `(employee_id, task_id)`، والزرّ يُنشئ صفّاً
--     لكل مهمة في كل ضغطة.
--
--     PROBE_2: مهمّتان × ضغطتان ⇒ **4 صفوف**
--     ⇒ التقدّم يصير 2/4 بدل 1/2 — والنسبة تبقى صحيحة رياضياً لكن
--       القائمة تعرض كل مهمة مرّتين، وإتمام إحدى النسختين يترك
--       الأخرى معلَّقة إلى الأبد.
--
--  ③ ★★ **`upsert()` اسمٌ كاذب**: تنفيذها حلقة `create` متتابعة:
--        async upsert(records) { for (…) await this.create(record) }
--     N نداءً شبكياً بلا معاملة — الفشل في المنتصف يترك **نصف تعريف**.
--
--  ④ ★★ **لا مفتاح أجنبيّ على `employee_id`** في الجدولين.
--     PROBE_4A: سجلّ تعريف لموظف غير موجود — قُبِل.
--     PROBE_4B: إنهاء خدمة لموظف غير موجود — قُبِل.
--
--  ⑤ ★★ **`status` و`exit_type` بلا CHECK.**
--     PROBE_5A: «حالة مخترعة» في `employee_onboarding` قُبِلت.
--     PROBE_5B: «نوع مخترع» في `offboarding_records` قُبِل.
--
--     ★ وعطلٌ صريح في العرض (PROBE_5C): النموذج يعرض **أربعة** أنواع
--       والعرض يفكّ **ثلاثة**:
--          voluntary → استقالة · involuntary → فصل · **وإلا تقاعد**
--       فـ`end_contract` (انتهاء عقد) يظهر **«تقاعد»**.
--
--  ⑥ ★★ **لا فرادة في إنهاء الخدمة**: PROBE_6 ⇒ ثلاثة سجلّات لموظف
--     واحد. أيّها الفعليّ؟ لا جواب.
--
--  ⑦ ★ **`completed_by` لا يُكتب أبداً**: العمود موجود و`updateStatus`
--     تكتب `status` و`completed_at` فقط ⇒ لا نعرف مَن أتمّ المهمة.
--
--  ⑧ ★ **أربعة أعمدة معدومة في الواجهة**:
--        is_final_settlement_done · assets_returned
--        · access_revoked · conducted_by
--     إجراءات إنهاء الخدمة الحقيقية (إعادة العهدة وسحب الصلاحيات
--     والتصفية النهائية) موجودة في القاعدة ولا زرّ لها.
--
--  ⑨ ★ **لا محفّز يمنع الحذف** على الجدولين (PROBE_10).
--  ⑩ ★★ **أربعة استعلامات بلا حدّ** + `grouped[]` و`empMap` و
--        `tasks.find()` **داخل** `map` ⇒ O(n×m).
--  ⑪ ★ **`any` في أربعة مواضع**: `useState<any[]>` ×2 ·
--        `Record<string, any[]>` · معاملات `(e: any)`.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  ما يفعله هذا المايجريشن                                          │
--  └──────────────────────────────────────────────────────────────────┘
--   (أ) القيود: الفرادة · CHECK · FK · منع الحذف.
--   (ب) `onboarding_start()` — إنشاء كل المهام في **معاملة واحدة**.
--   (جـ) `onboarding_toggle()` — بأثر `completed_by`.
--   (د) `offboarding_execute()` — السجلّ والتعطيل **معاً أو لا شيء**.
--   (هـ) لوحات: التعريف · إنهاء الخدمة · الملخّص.
--
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- (أ) القيود — الأعطال ② ④ ⑤ ⑥
-- ─────────────────────────────────────────────────────────────────────────

-- ★ عمود لسبب الإلغاء وأثر التدقيق
ALTER TABLE public.employee_onboarding
  ADD COLUMN IF NOT EXISTS skipped_reason TEXT;

-- ★★ مفردات حالة المهمة الأربع
DO $$
BEGIN
  UPDATE public.employee_onboarding SET status = 'pending'
   WHERE status IS NULL
      OR status NOT IN ('pending','in_progress','completed','skipped');

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_onboarding_status_chk') THEN
    ALTER TABLE public.employee_onboarding
      ADD CONSTRAINT employee_onboarding_status_chk
      CHECK (status IN ('pending','in_progress','completed','skipped'));
  END IF;
END $$;

-- ★★★ العطل ②: فرادة (مستأجر، موظف، مهمة)
--   نُنظّف المكرَّر أولاً — نُبقي الأقدم ونُفضّل المكتمل إن وُجد.
DO $$
BEGIN
  DELETE FROM public.employee_onboarding e
   WHERE e.id NOT IN (
     SELECT DISTINCT ON (tenant_id, employee_id, task_id) id
       FROM public.employee_onboarding
      ORDER BY tenant_id, employee_id, task_id,
               (status = 'completed') DESC, created_at
   );
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_emp_task
  ON public.employee_onboarding (tenant_id, employee_id, task_id);

-- ★★ مفردات نوع الإنهاء الأربع
DO $$
BEGIN
  UPDATE public.offboarding_records SET exit_type = 'voluntary'
   WHERE exit_type IS NULL
      OR exit_type NOT IN ('voluntary','involuntary','retirement','end_contract');

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'offboarding_records_type_chk') THEN
    ALTER TABLE public.offboarding_records
      ADD CONSTRAINT offboarding_records_type_chk
      CHECK (exit_type IN ('voluntary','involuntary','retirement','end_contract'));
  END IF;
END $$;

-- ★★ العطل ⑥: سجلّ إنهاء واحد لكل موظف
DO $$
BEGIN
  DELETE FROM public.offboarding_records o
   WHERE o.id NOT IN (
     SELECT DISTINCT ON (tenant_id, employee_id) id
       FROM public.offboarding_records
      ORDER BY tenant_id, employee_id, created_at DESC
   );
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_offboarding_per_employee
  ON public.offboarding_records (tenant_id, employee_id);

-- ★★ العطل ④: المفاتيح الأجنبية
DO $$
BEGIN
  DELETE FROM public.employee_onboarding e
   WHERE NOT EXISTS (SELECT 1 FROM public.employees x WHERE x.id = e.employee_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'employee_onboarding_employee_id_fkey') THEN
    ALTER TABLE public.employee_onboarding
      ADD CONSTRAINT employee_onboarding_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;

  DELETE FROM public.offboarding_records o
   WHERE NOT EXISTS (SELECT 1 FROM public.employees x WHERE x.id = o.employee_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'offboarding_records_employee_id_fkey') THEN
    ALTER TABLE public.offboarding_records
      ADD CONSTRAINT offboarding_records_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_onboarding_tenant_emp
  ON public.employee_onboarding (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_tenant
  ON public.offboarding_records (tenant_id, last_working_day DESC);

-- ★ العطل ⑨: الحذف النهائي ممنوع
CREATE OR REPLACE FUNCTION public.tg_block_offboarding_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION
    'OFFBOARDING_IMMUTABLE: سجلّ إنهاء الخدمة لا يُحذف — سجلٌّ قانونيّ'
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_block_offboarding_delete ON public.offboarding_records;
CREATE TRIGGER trg_block_offboarding_delete
  BEFORE DELETE ON public.offboarding_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_offboarding_delete();

-- ─────────────────────────────────────────────────────────────────────────
-- (ب) بدء التعريف — في معاملة واحدة (العطلان ② و ③)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.onboarding_start(UUID);

CREATE FUNCTION public.onboarding_start(p_employee_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_n      INTEGER;
  v_tasks  INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح ببدء التعريف (الدور: %)', COALESCE(v_role,'—');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;

  SELECT count(*)::INTEGER INTO v_tasks
    FROM public.onboarding_tasks t
   WHERE t.tenant_id = v_tenant AND t.is_active;

  IF v_tasks = 0 THEN
    RAISE EXCEPTION 'ONBOARDING_NO_TASKS: لا مهامّ تعريف مفعّلة — عرّفها أولاً'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★★ العطل ②: `ON CONFLICT DO NOTHING` على الفهرس الفريد.
  --   إعادة الضغط لا تُضاعف المهام — تُضيف الجديد منها فقط.
  -- ★★★ والعطل ③: صفّ واحد لكل المهام بدل N نداءً متتابعاً.
  INSERT INTO public.employee_onboarding
    (tenant_id, employee_id, task_id, status)
  SELECT v_tenant, p_employee_id, t.id, 'pending'
    FROM public.onboarding_tasks t
   WHERE t.tenant_id = v_tenant AND t.is_active
  ON CONFLICT (tenant_id, employee_id, task_id) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.onboarding_start(UUID) IS
  'بدء التعريف في معاملة واحدة. الصفحة كانت تُنشئ صفّاً لكل مهمة في '
  'حلقة create بلا فرادة ⇒ الضغط مرّتين يُضاعف المهام (مقيس: 2×2=4).';

REVOKE ALL ON FUNCTION public.onboarding_start(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboarding_start(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.onboarding_start(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (جـ) تبديل حالة المهمة — بأثر completed_by (العطل ⑦)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.onboarding_set_task(UUID, TEXT, TEXT);

CREATE FUNCTION public.onboarding_set_task(
  p_record_id UUID,
  p_status    TEXT,
  p_note      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_cur    TEXT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بتعديل مهامّ التعريف (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_status NOT IN ('pending','in_progress','completed','skipped') THEN
    RAISE EXCEPTION 'ONBOARDING_BAD_STATUS: حالة غير معروفة «%» — المسموح: '
      'pending·in_progress·completed·skipped', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  -- ★ التخطّي قرارٌ إداريّ يحتاج تبريراً
  IF p_status = 'skipped' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'ONBOARDING_NO_REASON: سبب تخطّي المهمة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT o.status INTO v_cur FROM public.employee_onboarding o
   WHERE o.id = p_record_id AND o.tenant_id = v_tenant;
  IF v_cur IS NULL THEN
    RAISE EXCEPTION 'سجلّ المهمة غير موجود في هذا المستأجر';
  END IF;

  UPDATE public.employee_onboarding
     SET status       = p_status,
         -- ★★ العطل ⑦: مَن أتمّ المهمة يُسجَّل
         completed_by = CASE WHEN p_status = 'completed' THEN auth.uid()
                             ELSE NULL END,
         completed_at = CASE WHEN p_status = 'completed' THEN NOW()
                             ELSE NULL END,
         skipped_reason = CASE WHEN p_status = 'skipped'
                               THEN btrim(p_note) ELSE NULL END,
         notes        = COALESCE(NULLIF(btrim(COALESCE(p_note,'')), ''), notes),
         updated_at   = NOW()
   WHERE id = p_record_id AND tenant_id = v_tenant;

  RETURN p_status;
END $$;

COMMENT ON FUNCTION public.onboarding_set_task(UUID, TEXT, TEXT) IS
  'تبديل حالة مهمة التعريف مع تسجيل مَن أتمّها. updateStatus كانت '
  'تكتب status و completed_at فقط ⇒ completed_by فارغ أبداً (0359/⑦).';

REVOKE ALL ON FUNCTION public.onboarding_set_task(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboarding_set_task(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.onboarding_set_task(UUID, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (د) إنهاء الخدمة — السجلّ والتعطيل معاً (العطل ①)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.offboarding_execute(
  UUID, DATE, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT[]);

CREATE FUNCTION public.offboarding_execute(
  p_employee_id     UUID,
  p_last_day        DATE,
  p_reason          TEXT,
  p_exit_type       TEXT    DEFAULT 'voluntary',
  p_notes           TEXT    DEFAULT NULL,
  p_access_revoked  BOOLEAN DEFAULT FALSE,
  p_settlement_done BOOLEAN DEFAULT FALSE,
  p_assets          TEXT[]  DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_self   UUID := public.current_user_employee_id();
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنهاء الخدمة (الدور: %)', COALESCE(v_role,'—');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;

  -- ★★ لا يُنهي المرء خدمة نفسه
  IF v_self IS NOT NULL AND v_self = p_employee_id THEN
    RAISE EXCEPTION 'OFFBOARDING_SELF: لا يجوز إنهاء خدمتك بنفسك'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_exit_type NOT IN ('voluntary','involuntary','retirement','end_contract') THEN
    RAISE EXCEPTION 'OFFBOARDING_BAD_TYPE: نوع غير معروف «%» — المسموح: '
      'voluntary·involuntary·retirement·end_contract', p_exit_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'OFFBOARDING_NO_REASON: السبب إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_last_day IS NULL THEN
    RAISE EXCEPTION 'OFFBOARDING_NO_DATE: آخر يوم عمل إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★ العطل ⑥: سجلّ واحد لكل موظف
  IF EXISTS (SELECT 1 FROM public.offboarding_records o
              WHERE o.tenant_id = v_tenant AND o.employee_id = p_employee_id) THEN
    RAISE EXCEPTION 'OFFBOARDING_DUPLICATE: للموظف سجلّ إنهاء خدمة قائم'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- ★★★ العطل ①: السجلّ والتعطيل في **معاملة واحدة**. كانت الصفحة
  --   تنفّذ نداءين، والثاني يرمي لأن `employment_status` عمود معدوم
  --   ⇒ سجلُّ إنهاء مكتوب والموظف ما زال نشطاً.
  INSERT INTO public.offboarding_records
    (tenant_id, employee_id, last_working_day, reason, exit_type,
     exit_interview_notes, access_revoked, is_final_settlement_done,
     assets_returned, conducted_by)
  VALUES (v_tenant, p_employee_id, p_last_day, btrim(p_reason), p_exit_type,
          NULLIF(btrim(COALESCE(p_notes,'')), ''),
          COALESCE(p_access_revoked, FALSE),
          COALESCE(p_settlement_done, FALSE),
          p_assets, auth.uid())
  RETURNING id INTO v_id;

  -- ★ `employment_status` غير موجود — `is_active` هو المصدر الوحيد
  UPDATE public.employees
     SET is_active = FALSE, updated_at = NOW()
   WHERE id = p_employee_id AND tenant_id = v_tenant;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.offboarding_execute(
  UUID, DATE, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT[]) IS
  'إنهاء الخدمة: السجلّ والتعطيل معاً أو لا شيء. الصفحة كانت تنفّذ '
  'نداءين والثاني يرمي (employment_status عمود معدوم) فيبقى سجلٌّ '
  'يتيم وموظفٌ نشط (0359/①).';

REVOKE ALL ON FUNCTION public.offboarding_execute(
  UUID, DATE, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offboarding_execute(
  UUID, DATE, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.offboarding_execute(
  UUID, DATE, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT[]) TO authenticated;

-- ★ تحديث إجراءات ما بعد الإنهاء (العطل ⑧)
DROP FUNCTION IF EXISTS public.offboarding_update_checklist(
  UUID, BOOLEAN, BOOLEAN, TEXT[]);

CREATE FUNCTION public.offboarding_update_checklist(
  p_record_id       UUID,
  p_access_revoked  BOOLEAN DEFAULT NULL,
  p_settlement_done BOOLEAN DEFAULT NULL,
  p_assets          TEXT[]  DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بتحديث إجراءات الإنهاء (الدور: %)',
      COALESCE(v_role,'—');
  END IF;

  UPDATE public.offboarding_records
     SET access_revoked          = COALESCE(p_access_revoked, access_revoked),
         is_final_settlement_done = COALESCE(p_settlement_done, is_final_settlement_done),
         assets_returned         = COALESCE(p_assets, assets_returned),
         updated_at              = NOW()
   WHERE id = p_record_id AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'سجلّ إنهاء الخدمة غير موجود في هذا المستأجر';
  END IF;
  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.offboarding_update_checklist(
  UUID, BOOLEAN, BOOLEAN, TEXT[]) IS
  'إجراءات ما بعد الإنهاء: سحب الصلاحيات · التصفية · العهدة. أربعة '
  'أعمدة كانت موجودة في القاعدة بلا أيّ زرّ (0359/⑧).';

REVOKE ALL ON FUNCTION public.offboarding_update_checklist(
  UUID, BOOLEAN, BOOLEAN, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offboarding_update_checklist(
  UUID, BOOLEAN, BOOLEAN, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.offboarding_update_checklist(
  UUID, BOOLEAN, BOOLEAN, TEXT[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (هـ) اللوحات — العطل ⑩
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.onboarding_board(TEXT, INTEGER);

CREATE FUNCTION public.onboarding_board(
  p_search TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_is_active     BOOLEAN,
  out_total         INTEGER,
  out_completed     INTEGER,
  out_skipped       INTEGER,
  out_mandatory_left INTEGER,
  out_progress      NUMERIC,
  out_started_at    TIMESTAMPTZ,
  out_tasks         JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض لوحة التعريف';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT o.employee_id, o.id AS rec_id, o.status, o.created_at,
           o.completed_at, o.skipped_reason,
           t.id AS task_id, t.title, t.task_type, t.is_mandatory, t.sort_order,
           COALESCE(NULLIF(btrim(pc.full_name), ''), '—') AS completer
      FROM public.employee_onboarding o
      JOIN public.onboarding_tasks t ON t.id = o.task_id
      LEFT JOIN public.profiles pc ON pc.id = o.completed_by
     WHERE o.tenant_id = v_tenant
  ),
  agg AS (
    SELECT b.employee_id,
           count(*)::INTEGER AS total,
           count(*) FILTER (WHERE b.status = 'completed')::INTEGER AS completed,
           count(*) FILTER (WHERE b.status = 'skipped')::INTEGER   AS skipped,
           -- ★ الإلزاميّ المتبقّي: مؤشّر الجاهزية الحقيقيّ
           count(*) FILTER (WHERE b.is_mandatory
                              AND b.status NOT IN ('completed','skipped'))::INTEGER
             AS mandatory_left,
           min(b.created_at) AS started_at,
           jsonb_agg(
             jsonb_build_object(
               'id', b.rec_id, 'taskId', b.task_id, 'title', b.title,
               'type', b.task_type, 'mandatory', b.is_mandatory,
               'status', b.status, 'completedAt', b.completed_at,
               'completer', b.completer, 'skippedReason', b.skipped_reason
             ) ORDER BY b.sort_order, b.title
           ) AS tasks
      FROM base b
     GROUP BY b.employee_id
  )
  SELECT
    a.employee_id,
    -- ★ full_name_ar = NULL لكل موظف (مُحقَّق) — سلسلة احتياطية
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(p.full_name), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, p.department, '—')::TEXT,
    e.is_active,
    a.total, a.completed, a.skipped, a.mandatory_left,
    -- ★★ التقدّم يحتسب المتخطّى مُنجَزاً: مهمةٌ أُلغيت بقرار ليست عالقة
    CASE WHEN a.total > 0
         THEN round((a.completed + a.skipped) * 100.0 / a.total, 1)
         ELSE 0 END,
    a.started_at,
    a.tasks
  FROM agg a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.profiles    p ON p.id = e.user_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  WHERE (v_q IS NULL
         OR e.full_name_ar  ILIKE '%' || v_q || '%'
         OR e.employee_code ILIKE '%' || v_q || '%'
         OR p.full_name     ILIKE '%' || v_q || '%')
  ORDER BY a.started_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

COMMENT ON FUNCTION public.onboarding_board(TEXT, INTEGER) IS
  'لوحة التعريف بمهامّها في استعلام واحد. الصفحة كانت تجلب أربعة '
  'جداول بلا حدّ وتُجمّع في المتصفّح مع tasks.find() داخل map.';

REVOKE ALL ON FUNCTION public.onboarding_board(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboarding_board(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.onboarding_board(TEXT, INTEGER) TO authenticated;

-- ══ لوحة إنهاء الخدمة ════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.offboarding_board(TEXT, TEXT, INTEGER);

CREATE FUNCTION public.offboarding_board(
  p_exit_type TEXT    DEFAULT NULL,
  p_search    TEXT    DEFAULT NULL,
  p_limit     INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_last_day      DATE,
  out_reason        TEXT,
  out_exit_type     TEXT,
  out_notes         TEXT,
  out_access_revoked BOOLEAN,
  out_settlement    BOOLEAN,
  out_assets        TEXT[],
  out_conducted_by  UUID,
  out_conductor     TEXT,
  out_still_active  BOOLEAN,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض سجلّات إنهاء الخدمة';
  END IF;

  IF p_exit_type IS NOT NULL
     AND p_exit_type NOT IN ('voluntary','involuntary','retirement','end_contract') THEN
    RAISE EXCEPTION 'OFFBOARDING_BAD_TYPE: نوع غير معروف «%»', p_exit_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.employee_id,
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(p.full_name), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, p.department, '—')::TEXT,
    o.last_working_day, o.reason, o.exit_type::TEXT, o.exit_interview_notes,
    o.access_revoked, o.is_final_settlement_done, o.assets_returned,
    o.conducted_by,
    COALESCE(NULLIF(btrim(pc.full_name), ''), '—')::TEXT,
    -- ★★★ العطل ①: كشفُ الحالة الشاذّة — سجلُّ إنهاء وموظفٌ نشط
    e.is_active,
    o.created_at
  FROM public.offboarding_records o
  JOIN public.employees e ON e.id = o.employee_id
  LEFT JOIN public.profiles    p  ON p.id  = e.user_id
  LEFT JOIN public.profiles    pc ON pc.id = o.conducted_by
  LEFT JOIN public.departments d  ON d.id  = e.department_id
  WHERE o.tenant_id = v_tenant
    AND (p_exit_type IS NULL OR o.exit_type = p_exit_type)
    AND (v_q IS NULL
         OR e.full_name_ar  ILIKE '%' || v_q || '%'
         OR e.employee_code ILIKE '%' || v_q || '%'
         OR p.full_name     ILIKE '%' || v_q || '%'
         OR o.reason        ILIKE '%' || v_q || '%')
  ORDER BY o.last_working_day DESC, o.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

COMMENT ON FUNCTION public.offboarding_board(TEXT, TEXT, INTEGER) IS
  'سجلّات إنهاء الخدمة. `out_still_active` يكشف الحالة الشاذّة التي '
  'خلّفها العطل ①: سجلُّ إنهاء وموظفٌ ما زال نشطاً.';

REVOKE ALL ON FUNCTION public.offboarding_board(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offboarding_board(TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.offboarding_board(TEXT, TEXT, INTEGER) TO authenticated;

-- ══ الملخّص ══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.onboarding_summary();

CREATE FUNCTION public.onboarding_summary()
RETURNS TABLE (
  out_tasks_active   INTEGER,
  out_tasks_mandatory INTEGER,
  out_in_progress    INTEGER,
  out_finished       INTEGER,
  out_avg_progress   NUMERIC,
  out_offboarded     INTEGER,
  out_orphan_active  INTEGER,
  out_pending_access INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص التعريف';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT o.employee_id,
           count(*)                                          AS total,
           count(*) FILTER (WHERE o.status IN ('completed','skipped')) AS done
      FROM public.employee_onboarding o
     WHERE o.tenant_id = v_tenant
     GROUP BY o.employee_id
  )
  SELECT
    (SELECT count(*)::INTEGER FROM public.onboarding_tasks t
      WHERE t.tenant_id = v_tenant AND t.is_active),
    (SELECT count(*)::INTEGER FROM public.onboarding_tasks t
      WHERE t.tenant_id = v_tenant AND t.is_active AND t.is_mandatory),
    (SELECT count(*)::INTEGER FROM agg WHERE done < total),
    (SELECT count(*)::INTEGER FROM agg WHERE done = total),
    -- ★★ NULL ≠ صفر: «لا تعريف جارٍ» ليست «تقدّم صفر» (درس 0353)
    (SELECT round(avg(done * 100.0 / NULLIF(total,0)), 1) FROM agg),
    (SELECT count(*)::INTEGER FROM public.offboarding_records o
      WHERE o.tenant_id = v_tenant),
    -- ★★★ العطل ①: عدد الحالات الشاذّة القائمة
    (SELECT count(*)::INTEGER FROM public.offboarding_records o
      JOIN public.employees e ON e.id = o.employee_id
     WHERE o.tenant_id = v_tenant AND e.is_active),
    (SELECT count(*)::INTEGER FROM public.offboarding_records o
      WHERE o.tenant_id = v_tenant AND NOT o.access_revoked);
END $$;

COMMENT ON FUNCTION public.onboarding_summary() IS
  'ملخّص التعريف وإنهاء الخدمة. `out_orphan_active` يعدّ الحالات '
  'الشاذّة: سجلُّ إنهاء وموظفٌ نشط — أثر العطل ① القائم في البيانات.';

REVOKE ALL ON FUNCTION public.onboarding_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboarding_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.onboarding_summary() TO authenticated;
