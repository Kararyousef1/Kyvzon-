-- ════════════════════════════════════════════════════════════════════════
--  0372 — سياسة الإجازات وحارس النطاق
--  إصلاحُ أعطالٍ بلّغ عنها المستخدم بعد تطبيق المايجريشنات (2026-08-08)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطرٍ واحد    │
--  │  (المسبار: tools/dev/_probe_0372.sql — قاعدة نظيفة، 300 م.)      │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ═══════════════════════════════════════════════════════════════════
--  ① ★★★★ **كلُّ طلب إجازةٍ سنويّةٍ يُرفض حتماً — لكلّ موظفٍ دائماً**
--  ═══════════════════════════════════════════════════════════════════
--
--     بلاغ المستخدم: «هناك أمورٌ لا تُحفظ في بوابة الموظف».
--
--     PROBE_4أ — استدعاءٌ حقيقيٌّ بدور `authenticated`:
--        submit_leave_request('سنوية', اليوم+10, اليوم+12, …)
--        ⇒ LEAVE_INSUFFICIENT_BALANCE: الرصيد المتبقّي -3.000 يوم
--
--     السبب: `leave_balance.annual_total NUMERIC NOT NULL DEFAULT 0`
--     (0002_employee_features.sql:97). و`submit_leave_request` تُنشئ
--     الصفَّ بـ`INSERT … (tenant_id, employee_id, year)` فقط، فيأخذ
--     الافتراضيّ **صفراً**، ثمّ يقارن `v_taken + v_days > v_total`.
--
--     ★★★ وفحصتُ المشروع كلَّه: **لا شيء يملأ `annual_total`.**
--        الدوال التي تذكره: `submit_leave_request` (تقرؤه)
--                          · `my_leave_balance` (تقرؤه)
--        المحفّزات على `leave_balance`: `updated_at` وحده.
--        ⇒ العمود يبقى صفراً إلى الأبد، وحارسُ الرصيد يرفض كلَّ شيء.
--
--     ★ العلاج (قرار المستخدم): **سياسةٌ لكلّ منشأة** —
--       `leave_policies` بالرصيد الافتراضيّ وترقيةٍ بالأقدمية،
--       ومحفّزٌ يفتح رصيد كلّ موظفٍ جديدٍ تلقائياً.
--
--  ═══════════════════════════════════════════════════════════════════
--  ② ★★★★ **الموظف يرى «سجلّ الشركة» و«بانتظار قراري»**
--  ═══════════════════════════════════════════════════════════════════
--
--     بلاغ المستخدم: «يظهر للموظف كما يظهر للموارد البشرية طلباتي
--     والتي بانتظار قراره وسجلات الشركة».
--
--     `LeaveRequestPage.tsx:314-316` و`PermissionsPage.tsx:286-288`
--     تعرضان ثلاثة تبويباتٍ **لكلّ مستخدمٍ بلا شرط دور**:
--        طلباتي · بانتظار قراري · سجلّ الشركة
--
--     PROBE_1 — موظفٌ عاديّ (`employee`) بدور `authenticated`:
--        نطاق mine  ⇒ 1 صفّ
--        نطاق inbox ⇒ 0 صفّ
--        نطاق all   ⇒ **1 صفّ**   ← ضغط «سجلّ الشركة» فرأى شيئاً
--     والموارد البشرية على النطاق نفسه ⇒ 2 صفّ.
--
--     ★ إنصافاً: **RLS تحرس** — الموظف رأى صفَّه هو لا صفَّ زميله.
--       لكنّ التبويب ظهر فأوهمه أنّه يطالع سجلّ الشركة، و«بانتظار
--       قراري» ظهر لمن لا قرارَ له. **الإيهامُ عطلٌ وإن لم يُسرّب.**
--
--     PROBE_5: حارس الدور داخل الدالتين = **★ لا حارس**
--        (`current_user_is_staff` غير مذكورةٍ في أيٍّ منهما)
--
--     ★ القرار (نصُّ المستخدم حرفياً):
--       «الموظف فقط يطلب اجازه او زمنيه ويرى طلباته فقط»
--       ⇒ النطاقان `all`/`inbox` **مرفوضان في القاعدة** لغير المخوَّل،
--         والتبويبات تُزال من صفحتي الموظف.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  ملاحظة: العطلان ③ و④ في الواجهة لا القاعدة — يُصلحان بلا SQL    │
--  │    ③ HRDashboard: `incList.forEach is not a function`            │
--  │      `hrInbox()` تُعيد `{rows,total}` والصفحة تعاملها كمصفوفة.    │
--  │    ④ `_archived/ProblemsList.tsx` موضعان بالعطل نفسه.            │
--  └──────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
--  ① سياسة الإجازات لكلّ منشأة (العطل ①)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.leave_policies (
  tenant_id            UUID PRIMARY KEY,
  annual_days          NUMERIC(6,3) NOT NULL DEFAULT 21,
  sick_days            NUMERIC(6,3) NOT NULL DEFAULT 30,
  /** ★ ترقيةٌ بالأقدمية: يومٌ إضافيٌّ لكلّ N سنةً حتى حدٍّ أقصى */
  seniority_bonus_days NUMERIC(6,3) NOT NULL DEFAULT 1,
  seniority_step_years INTEGER      NOT NULL DEFAULT 5,
  annual_days_max      NUMERIC(6,3) NOT NULL DEFAULT 30,
  /** ★ التناسبُ بسنة الالتحاق: من التحق في تموز لا يستحقّ سنةً كاملة */
  prorate_first_year   BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by           UUID
);

COMMENT ON TABLE public.leave_policies IS
  'سياسة الإجازات لكلّ منشأة. `leave_balance.annual_total` كان افتراضيّه '
  'صفراً ولا شيء في المشروع يملؤه ⇒ كلُّ طلب إجازةٍ سنويّةٍ يُرفض حتماً '
  'بـLEAVE_INSUFFICIENT_BALANCE (مُثبَتٌ في PROBE_4أ) — 0372';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.leave_policies'::regclass
      AND conname='fk_leave_policy_tenant') THEN
    ALTER TABLE public.leave_policies ADD CONSTRAINT fk_leave_policy_tenant
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.leave_policies'::regclass
      AND conname='chk_leave_policy_sane') THEN
    ALTER TABLE public.leave_policies ADD CONSTRAINT chk_leave_policy_sane
      CHECK (
        annual_days          BETWEEN 0 AND 90
        AND sick_days        BETWEEN 0 AND 180
        AND seniority_bonus_days BETWEEN 0 AND 10
        AND seniority_step_years BETWEEN 1 AND 40
        AND annual_days_max  >= annual_days
        AND annual_days_max  <= 90
      );
  END IF;
END $$;

-- ★ بذرُ سياسةٍ افتراضيّةٍ لكلّ منشأةٍ قائمة
INSERT INTO public.leave_policies (tenant_id)
SELECT t.id FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;

-- ★★★★ ومحفّزٌ لكلّ منشأةٍ **جديدة**.
--   كشفه التأكيد 1.0: عبارةُ الـINSERT أعلاه تعمل مرّةً واحدةً وقتَ
--   تطبيق المايجريشن. المنشأةُ التي تُنشأ بعده تُولد بلا سياسة،
--   فيعود العطل ① كاملاً لكلّ عميلٍ جديد. الحلُّ محفّزٌ لا عبارة.
CREATE OR REPLACE FUNCTION public.tg_seed_leave_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.leave_policies (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_leave_policy ON public.tenants;
CREATE TRIGGER trg_seed_leave_policy
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_leave_policy();

ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_leave_policies_select ON public.leave_policies;
CREATE POLICY kyvzon_leave_policies_select ON public.leave_policies
  FOR SELECT USING (tenant_id = public.current_user_tenant_id());

-- ★ التعديل للموارد البشرية والإدارة وحدهم
DROP POLICY IF EXISTS kyvzon_leave_policies_update ON public.leave_policies;
CREATE POLICY kyvzon_leave_policies_update ON public.leave_policies
  FOR UPDATE
  USING (tenant_id = public.current_user_tenant_id()
         AND public.current_user_is_staff())
  WITH CHECK (tenant_id = public.current_user_tenant_id()
              AND public.current_user_is_staff());

DROP POLICY IF EXISTS kyvzon_leave_policies_insert ON public.leave_policies;
CREATE POLICY kyvzon_leave_policies_insert ON public.leave_policies
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

-- ★★★ البوّابة الهجينة RESTRICTIVE على وحدة hr (درسٌ متكرّر)
DROP POLICY IF EXISTS hybrid_gate_leave_policies ON public.leave_policies;
CREATE POLICY hybrid_gate_leave_policies ON public.leave_policies
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

REVOKE ALL ON public.leave_policies FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.leave_policies TO authenticated;
REVOKE DELETE ON public.leave_policies FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ② حاسبةُ الاستحقاق — الأقدميّة والتناسب
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.leave_entitlement(UUID, INTEGER);
CREATE FUNCTION public.leave_entitlement(p_employee_id UUID, p_year INTEGER)
RETURNS TABLE (annual NUMERIC, sick NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER               -- ★ يقرأ leave_policies لموظفٍ قد لا يملك
SET search_path TO 'public'    --   حقَّ قراءتها في سياقٍ آخر
AS $$
DECLARE
  v_tenant  UUID;
  v_hire    DATE;
  v_pol     public.leave_policies%ROWTYPE;
  v_years   INTEGER;
  v_annual  NUMERIC;
  v_months  NUMERIC;
BEGIN
  SELECT e.tenant_id, e.hire_date INTO v_tenant, v_hire
    FROM public.employees e WHERE e.id = p_employee_id;
  IF v_tenant IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  SELECT * INTO v_pol FROM public.leave_policies WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    -- ★ منشأةٌ بلا سياسة: نُعيد الافتراضيّ لا صفراً — الصفرُ هو العطل
    v_pol.annual_days          := 21;
    v_pol.sick_days            := 30;
    v_pol.seniority_bonus_days := 1;
    v_pol.seniority_step_years := 5;
    v_pol.annual_days_max      := 30;
    v_pol.prorate_first_year   := TRUE;
  END IF;

  -- ★★★ الأقدميّة بتوقيت بغداد صريحاً — الخادم Etc/UTC
  v_years := GREATEST(
    p_year - EXTRACT(YEAR FROM COALESCE(v_hire,
      (now() AT TIME ZONE 'Asia/Baghdad')::DATE))::INTEGER, 0);

  v_annual := LEAST(
    v_pol.annual_days
      + (v_years / v_pol.seniority_step_years) * v_pol.seniority_bonus_days,
    v_pol.annual_days_max);

  -- ★ التناسب في سنة الالتحاق وحدها
  IF v_pol.prorate_first_year
     AND v_hire IS NOT NULL
     AND EXTRACT(YEAR FROM v_hire)::INTEGER = p_year THEN
    v_months := 12 - EXTRACT(MONTH FROM v_hire)::NUMERIC + 1;
    v_annual := round(v_annual * v_months / 12, 3);
  END IF;

  RETURN QUERY SELECT
    GREATEST(v_annual, 0)::NUMERIC,
    GREATEST(v_pol.sick_days, 0)::NUMERIC;
END $$;

REVOKE ALL ON FUNCTION public.leave_entitlement(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_entitlement(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_entitlement(UUID, INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ③ ★★★★ فتحُ الرصيد تلقائياً — قلبُ إصلاح العطل ①
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.ensure_leave_balance(UUID, INTEGER);
CREATE FUNCTION public.ensure_leave_balance(p_employee_id UUID, p_year INTEGER)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID;
  v_ann    NUMERIC;
  v_sick   NUMERIC;
BEGIN
  SELECT e.tenant_id INTO v_tenant
    FROM public.employees e WHERE e.id = p_employee_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT annual, sick INTO v_ann, v_sick
    FROM public.leave_entitlement(p_employee_id, p_year);

  INSERT INTO public.leave_balance (tenant_id, employee_id, year,
                                    annual_total, sick_total)
  VALUES (v_tenant, p_employee_id, p_year, v_ann, v_sick)
  ON CONFLICT (tenant_id, employee_id, year) DO UPDATE
    -- ★★★ لا نُنقص رصيداً مُنِح يدوياً: نرفع إلى الاستحقاق ولا نهبط.
    --   الموارد البشرية قد تمنح استثناءً، وإعادةُ الحساب يجب ألّا تمحوَه.
    SET annual_total = GREATEST(public.leave_balance.annual_total, EXCLUDED.annual_total),
        sick_total   = GREATEST(public.leave_balance.sick_total,   EXCLUDED.sick_total);
END $$;

REVOKE ALL ON FUNCTION public.ensure_leave_balance(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_leave_balance(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_leave_balance(UUID, INTEGER) TO authenticated;

-- ★★★ محفّزٌ يفتح رصيد كلّ موظفٍ جديد — فلا يُولد أحدٌ برصيدٍ صفر
CREATE OR REPLACE FUNCTION public.tg_seed_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_leave_balance(
    NEW.id, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Baghdad'))::INTEGER);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_leave_balance ON public.employees;
CREATE TRIGGER trg_seed_leave_balance
  AFTER INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_leave_balance();

-- ★★★★ `ON UPDATE CASCADE` على مفتاح الرصيد.
--   كشفه الفحصُ الشامل: محفّزُ `trg_seed_leave_balance` صار يُنشئ صفَّ
--   رصيدٍ لكلّ موظف، وسكربتاتُ التحقق (0344/0345/0346) تُبدّل
--   `employees.id` بـ`UPDATE` لتثبيت معرّفاتٍ معلومة. والمفتاح كان
--   `ON DELETE CASCADE` **بلا** `ON UPDATE` ⇒
--     ERROR: update on table "employees" violates foreign key constraint
--            "leave_balance_employee_id_fkey"
--   فسقطت تهيئةُ ثلاثة سكربتاتٍ كاملةً (14 فحصاً).
--   ★ الدرس: محفّزٌ جديدٌ يُنشئ صفوفاً تابعةً يفرض مراجعةَ كلّ مفتاحٍ
--     يشير إلى الجدول الأصل — لا مفاتيحِ الجدول الجديد وحدها.
ALTER TABLE public.leave_balance
  DROP CONSTRAINT IF EXISTS leave_balance_employee_id_fkey;
ALTER TABLE public.leave_balance
  ADD CONSTRAINT leave_balance_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ★★★★ وملءُ أرصدة الموظفين القائمين — العطل يمسّهم جميعاً الآن
DO $$
DECLARE
  r RECORD;
  v_year INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Baghdad'))::INTEGER;
BEGIN
  FOR r IN SELECT id FROM public.employees LOOP
    PERFORM public.ensure_leave_balance(r.id, v_year);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ④ ★★★★ حارس النطاق (العطل ②)
--     «الموظف فقط يطلب اجازه او زمنيه ويرى طلباته فقط» — نصُّ المستخدم
-- ═══════════════════════════════════════════════════════════════════

/**
 * هل يحقّ للمستخدم الحاليّ النطاقُ المطلوب؟
 *   mine  — للجميع
 *   inbox — لمن له خطوةُ اعتمادٍ **فعليّة** في هذا النوع
 *   all   — للموارد البشرية والإدارة وحدهم
 *
 * ★★★ الحارس في القاعدة لا في الواجهة: إخفاءُ زرٍّ ليس منعاً.
 */
DROP FUNCTION IF EXISTS public.can_use_request_scope(TEXT, TEXT);
CREATE FUNCTION public.can_use_request_scope(p_scope TEXT, p_request_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER               -- ★ يقرأ hr_approval_steps التي قد لا يراها
SET search_path TO 'public'
AS $$
BEGIN
  IF p_scope IS NULL OR p_scope = 'mine' THEN
    RETURN TRUE;
  END IF;

  IF p_scope = 'all' THEN
    RETURN public.current_user_is_staff();
  END IF;

  IF p_scope = 'inbox' THEN
    -- ★ الموارد البشرية لها صندوقٌ دائماً؛ وغيرُها يحتاج خطوةً فعليّة
    IF public.current_user_is_staff() THEN RETURN TRUE; END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.hr_approval_steps s
        JOIN public.hr_approval_requests r ON r.id = s.request_id
       WHERE s.approver_id = auth.uid()
         AND (p_request_type IS NULL OR r.request_type = p_request_type));
  END IF;

  RETURN FALSE;
END $$;

REVOKE ALL ON FUNCTION public.can_use_request_scope(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_request_scope(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_use_request_scope(TEXT, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ حقنُ الحارس في الدالتين — بلا إعادة كتابتهما
--     ★★ `CREATE OR REPLACE` لا يغيّر نوع الإرجاع، والتوقيع ثابت،
--        فنحقن الحارسَ نصّياً في مطلع الجسم عبر pg_get_functiondef.
--        هذا أسلم من نسخ 90 سطراً قد تتخلّف عن الأصل.
-- ═══════════════════════════════════════════════════════════════════

DO $inject$
DECLARE
  d TEXT;
  guard_leave TEXT :=
    'BEGIN' || E'\n' ||
    '  IF NOT public.can_use_request_scope(p_scope, ''leave'') THEN' || E'\n' ||
    '    RAISE EXCEPTION ''LEAVE_SCOPE_FORBIDDEN: هذا النطاق غير متاحٍ لدورك'';' || E'\n' ||
    '  END IF;' || E'\n';
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='leave_requests_view';

  IF d IS NULL THEN
    RAISE EXCEPTION 'leave_requests_view غير موجودة';
  END IF;

  IF position('LEAVE_SCOPE_FORBIDDEN' IN d) > 0 THEN
    RAISE NOTICE 'حارس النطاق محقونٌ سلفاً في leave_requests_view';
  ELSE
    -- ★ أوّل `BEGIN` بعد `AS $function$` هو مطلع الجسم
    d := regexp_replace(d, 'BEGIN' || E'\n', guard_leave, '');
    IF position('LEAVE_SCOPE_FORBIDDEN' IN d) = 0 THEN
      RAISE EXCEPTION 'فشل حقنُ الحارس في leave_requests_view — لم يطابق النمط';
    END IF;
    EXECUTE d;
  END IF;
END $inject$;

DO $inject$
DECLARE
  d TEXT;
  guard_perm TEXT :=
    'BEGIN' || E'\n' ||
    '  IF NOT public.can_use_request_scope(p_scope, ''permission'') THEN' || E'\n' ||
    '    RAISE EXCEPTION ''PERM_SCOPE_FORBIDDEN: هذا النطاق غير متاحٍ لدورك'';' || E'\n' ||
    '  END IF;' || E'\n';
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='permission_requests_view';

  IF d IS NULL THEN
    RAISE EXCEPTION 'permission_requests_view غير موجودة';
  END IF;

  IF position('PERM_SCOPE_FORBIDDEN' IN d) > 0 THEN
    RAISE NOTICE 'حارس النطاق محقونٌ سلفاً في permission_requests_view';
  ELSE
    d := regexp_replace(d, 'BEGIN' || E'\n', guard_perm, '');
    IF position('PERM_SCOPE_FORBIDDEN' IN d) = 0 THEN
      RAISE EXCEPTION 'فشل حقنُ الحارس في permission_requests_view — لم يطابق النمط';
    END IF;
    EXECUTE d;
  END IF;
END $inject$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ لوحُ السياسة للموارد البشرية
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.leave_policy_board();
CREATE FUNCTION public.leave_policy_board()
RETURNS TABLE (
  annual_days          NUMERIC,
  sick_days            NUMERIC,
  seniority_bonus_days NUMERIC,
  seniority_step_years INTEGER,
  annual_days_max      NUMERIC,
  prorate_first_year   BOOLEAN,
  employees_covered    INTEGER,
  employees_zero       INTEGER,
  updated_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Baghdad'))::INTEGER;
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LEAVE_POLICY_FORBIDDEN: سياسة الإجازات للموارد البشرية والإدارة فقط';
  END IF;

  RETURN QUERY
  SELECT p.annual_days, p.sick_days, p.seniority_bonus_days,
         p.seniority_step_years, p.annual_days_max, p.prorate_first_year,
         (SELECT count(*) FROM public.leave_balance b
           WHERE b.year = v_year AND b.annual_total > 0)::INTEGER,
         -- ★★★ العطل ① مقاساً: كم موظفاً ما زال برصيدٍ صفر؟
         (SELECT count(*) FROM public.leave_balance b
           WHERE b.year = v_year AND b.annual_total = 0)::INTEGER,
         p.updated_at
  FROM public.leave_policies p
  WHERE p.tenant_id = public.current_user_tenant_id();
END $$;

REVOKE ALL ON FUNCTION public.leave_policy_board() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_policy_board() FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_policy_board() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ تحديث السياسة + إعادة الحساب
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.leave_policy_update(NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, BOOLEAN);
CREATE FUNCTION public.leave_policy_update(
  p_annual   NUMERIC,
  p_sick     NUMERIC,
  p_bonus    NUMERIC,
  p_step     INTEGER,
  p_max      NUMERIC,
  p_prorate  BOOLEAN
)
RETURNS INTEGER                -- عدد الأرصدة المُحدَّثة
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_year   INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Baghdad'))::INTEGER;
  v_count  INTEGER := 0;
  r        RECORD;
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LEAVE_POLICY_FORBIDDEN: التعديل للموارد البشرية والإدارة فقط';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'LEAVE_POLICY_NO_TENANT: لا مستأجرَ للمستخدم الحاليّ';
  END IF;

  INSERT INTO public.leave_policies (tenant_id, annual_days, sick_days,
      seniority_bonus_days, seniority_step_years, annual_days_max,
      prorate_first_year, updated_at, updated_by)
  VALUES (v_tenant, p_annual, p_sick, p_bonus, p_step, p_max, p_prorate,
          now(), auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE SET
    annual_days          = EXCLUDED.annual_days,
    sick_days            = EXCLUDED.sick_days,
    seniority_bonus_days = EXCLUDED.seniority_bonus_days,
    seniority_step_years = EXCLUDED.seniority_step_years,
    annual_days_max      = EXCLUDED.annual_days_max,
    prorate_first_year   = EXCLUDED.prorate_first_year,
    updated_at           = now(),
    updated_by           = auth.uid();

  -- ★ إعادةُ حساب أرصدة السنة الجارية لمستأجر المستخدم وحده
  FOR r IN SELECT e.id FROM public.employees e WHERE e.tenant_id = v_tenant LOOP
    PERFORM public.ensure_leave_balance(r.id, v_year);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.leave_policy_update(NUMERIC,NUMERIC,NUMERIC,INTEGER,NUMERIC,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_policy_update(NUMERIC,NUMERIC,NUMERIC,INTEGER,NUMERIC,BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_policy_update(NUMERIC,NUMERIC,NUMERIC,INTEGER,NUMERIC,BOOLEAN) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ ★★ ضمانُ الرصيد عند الطلب — حزامٌ ثانٍ
--     لو أُنشئ موظفٌ قبل هذا المايجريشن بمسارٍ يتجاوز المحفّز،
--     فأوّلُ طلبٍ يفتح رصيدَه بدل أن يُرفض.
-- ═══════════════════════════════════════════════════════════════════

DO $inject$
DECLARE
  d TEXT;
  old_ins TEXT :=
    'INSERT INTO public.leave_balance (tenant_id, employee_id, year)' || E'\n' ||
    '    VALUES (v_tenant, v_emp, v_year)' || E'\n' ||
    '    ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;';
  new_ins TEXT :=
    'PERFORM public.ensure_leave_balance(v_emp, v_year);';
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='submit_leave_request';

  IF d IS NULL THEN
    RAISE EXCEPTION 'submit_leave_request غير موجودة';
  END IF;

  IF position('ensure_leave_balance' IN d) > 0 THEN
    RAISE NOTICE 'ضمانُ الرصيد محقونٌ سلفاً';
  ELSE
    IF position(old_ins IN d) = 0 THEN
      RAISE EXCEPTION 'فشل حقنُ ضمان الرصيد — لم يطابق نصُّ الإدراج';
    END IF;
    d := replace(d, old_ins, new_ins);
    EXECUTE d;
  END IF;
END $inject$;
