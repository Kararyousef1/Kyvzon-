-- ============================================================================
-- FILE: 0301_movement_driver_guard_and_fks.sql
-- PURPOSE: الجولة ١ — الأمان والوصول
--   (أ) حارس السائق على مستوى الواجهة: دالة is_current_user_driver()
--   (ب) دعم السائق المتعاقد الخارجي (driver_type)
--   (ج) مفاتيح أجنبية مفقودة على employee_id في جداول بوابة الحركة
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (أ): السائق محبوس خلف دور مدير الأسطول
--
--   AppRouter.tsx:1284-1298 يضع صفحات السائق الثلاث داخل:
--     <Route element={<RequireMovementRole role="logistics" />}>
--
--   أي أن السائق يحتاج دور logistics — وهو دور مدير الأسطول الذي يفتح
--   التكاليف والناقلين والربحية. تصعيد امتياز.
--
--   طبقة القاعدة كانت صحيحة أصلاً: movement_require_driver() في 0291
--   تعتمد logistics_drivers.user_id لا دور البوابة. الواجهة وحدها أخطأت.
--
--   لكن الواجهة لا تستطيع استدعاء movement_require_driver() لأنها ترفع
--   استثناء NOT_A_DRIVER. تحتاج دالة تعيد BOOLEAN بهدوء ⇒ is_current_user_driver().
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (ب): السائق المتعاقد الخارجي
--
--   قرار المستخدم: السائقون نوعان — موظفون ومتعاقدون خارجيون.
--   logistics_drivers.employee_id موجود لكن بلا تمييز صريح للنوع،
--   ولا قيد يمنع التناقض (متعاقد خارجي بـ employee_id مملوء).
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (ج): employee_id بلا مفتاح أجنبي
--
--   ⚠️ تصحيح تشخيصي مهم:
--   القاعدة تستعمل employee_id بمعنيين مختلفين:
--     • attendance_logs · leaves · employee_breaks  → REFERENCES employees(id)
--     • movements_log (القديم) · بوابة الحركة       → profiles(id)
--
--   بوابة الحركة تكتب user.id (= profiles.id) في أربع صفحات، وهذا
--   **متسق** مع movements_log القديم الذي يقيّده صراحةً بـ profiles.
--   لذا نُقيّد جداول البوابة بـ profiles — لا employees — حفاظاً على
--   الاتفاق القائم وعلى صحة محفّزات المزامنة في 0293.
--
--   الجداول المشمولة (نطاق بوابة الحركة وحده — 5 جداول):
--     employee_movement_permits · employee_movements_log
--     employee_field_visits · employee_missions · employee_movement_violations
--
--   ⚠️ خارج النطاق عمداً: employee_certifications · employee_contracts
--   · employee_documents · employee_goals · employee_letter_requests
--   · employee_loans · employee_onboarding · employee_skills.
--   هذه سابقة لبوابة الحركة، ومعناها employees(id) على الأرجح.
--   إصلاحها يحتاج تحقيقاً منفصلاً ولا يُقحَم هنا.
-- ============================================================================

-- ═══ (أ) حارس السائق للواجهة ════════════════════════════════════════════
-- نظير هادئ لـ movement_require_driver(): يعيد BOOLEAN بدل رفع استثناء،
-- ليستدعيه حارس المسار في React دون معالجة أخطاء.
CREATE OR REPLACE FUNCTION public.is_current_user_driver()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_driver_id() IS NOT NULL;
$$;

COMMENT ON FUNCTION public.is_current_user_driver() IS
  'هل المستخدم الحالي سائق نشط؟ نظير هادئ لـ movement_require_driver للواجهة. السائق الموقوف يعيد FALSE.';

REVOKE ALL ON FUNCTION public.is_current_user_driver() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_user_driver() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_driver() TO authenticated, service_role;

-- ═══ (ب) نوع السائق: موظف أو متعاقد خارجي ═══════════════════════════════
ALTER TABLE public.logistics_drivers
  ADD COLUMN IF NOT EXISTS driver_type VARCHAR(20) NOT NULL DEFAULT 'employee';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'logistics_drivers_driver_type_check'
       AND conrelid = 'public.logistics_drivers'::regclass
  ) THEN
    ALTER TABLE public.logistics_drivers
      ADD CONSTRAINT logistics_drivers_driver_type_check
      CHECK (driver_type IN ('employee', 'contractor'));
  END IF;
END $$;

COMMENT ON COLUMN public.logistics_drivers.driver_type IS
  'employee = موظف في الشركة (employee_id مطلوب) · contractor = متعاقد خارجي (employee_id يبقى فارغاً)';

-- تماسك النوع مع employee_id: المتعاقد الخارجي لا يحمل ملف موظف.
-- نُطبّق القيد NOT VALID أولاً ثم نُصحّح البيانات ثم نُثبّته، حتى لا
-- يفشل المايجريشن على قاعدة فيها صفوف قديمة.
UPDATE public.logistics_drivers
   SET driver_type = 'contractor'
 WHERE employee_id IS NULL
   AND driver_type = 'employee';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'logistics_drivers_type_employee_coherence'
       AND conrelid = 'public.logistics_drivers'::regclass
  ) THEN
    ALTER TABLE public.logistics_drivers
      ADD CONSTRAINT logistics_drivers_type_employee_coherence
      CHECK (
        (driver_type = 'employee'   AND employee_id IS NOT NULL) OR
        (driver_type = 'contractor' AND employee_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_logistics_drivers_type
  ON public.logistics_drivers(tenant_id, driver_type, status);

-- ═══ (ج) مفاتيح أجنبية على employee_id ══════════════════════════════════
-- خطوة ١: تنظيف اليتامى قبل إضافة القيد — وإلا فشل المايجريشن.
--          لا حذف: نُبلّغ بالعدد فقط، فالحذف قرار بيانات لا قرار مخطط.
DO $$
DECLARE
  v_tbl     TEXT;
  v_orphans INT;
  v_total   INT := 0;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'employee_movement_permits',
    'employee_movements_log',
    'employee_field_visits',
    'employee_missions',
    'employee_movement_violations'
  ] LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I t WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.employee_id)',
      v_tbl
    ) INTO v_orphans;

    IF v_orphans > 0 THEN
      RAISE WARNING '0301: % يحوي % صفاً يتيماً (employee_id لا يطابق أي profile)', v_tbl, v_orphans;
      v_total := v_total + v_orphans;
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    RAISE EXCEPTION
      '0301 متوقف: % صفاً يتيماً في جداول بوابة الحركة. نظّفها يدوياً ثم أعد التشغيل — لا نحذف بيانات تلقائياً.',
      v_total;
  END IF;

  RAISE NOTICE '0301: صفر صف يتيم — آمن لإضافة المفاتيح الأجنبية';
END $$;

-- خطوة ٢: إضافة المفاتيح الأجنبية.
--   ON DELETE CASCADE مطابقةً لـ movements_log.employee_id القديم،
--   فحذف الملف الشخصي ينظّف سجلات حركته بدل تركها يتيمة.
DO $$
DECLARE
  v_tbl  TEXT;
  v_name TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'employee_movement_permits',
    'employee_movements_log',
    'employee_field_visits',
    'employee_missions',
    'employee_movement_violations'
  ] LOOP
    v_name := v_tbl || '_employee_id_fkey';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = v_name
         AND conrelid = format('public.%I', v_tbl)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE',
        v_tbl, v_name
      );
      RAISE NOTICE '0301: أُضيف %', v_name;
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.employee_movement_permits.employee_id IS
  'يشير إلى profiles(id) — لا employees(id). متسق مع movements_log القديم ومحفّزات المزامنة في 0293.';

-- ═══ حرّاس التحقق ═══════════════════════════════════════════════════════
DO $$
DECLARE
  v_missing TEXT := '';
  v_tbl     TEXT;
  v_cnt     INT;
BEGIN
  -- الدالة موجودة ووحيدة
  SELECT count(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_current_user_driver';
  ASSERT v_cnt = 1, format('0301 failed: is_current_user_driver overloads = %s (must be 1)', v_cnt);

  -- anon لا ينفّذ
  ASSERT NOT has_function_privilege('anon', 'public.is_current_user_driver()', 'EXECUTE'),
    '0301 failed: anon can execute is_current_user_driver';

  -- authenticated ينفّذ
  ASSERT has_function_privilege('authenticated', 'public.is_current_user_driver()', 'EXECUTE'),
    '0301 failed: authenticated cannot execute is_current_user_driver';

  -- driver_type موجود بقيده
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='logistics_drivers' AND column_name='driver_type'
  ), '0301 failed: driver_type column missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='logistics_drivers_type_employee_coherence'
  ), '0301 failed: type/employee coherence constraint missing';

  -- المفاتيح الأجنبية الخمسة
  FOREACH v_tbl IN ARRAY ARRAY[
    'employee_movement_permits','employee_movements_log',
    'employee_field_visits','employee_missions','employee_movement_violations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = v_tbl || '_employee_id_fkey'
         AND contype = 'f'
    ) THEN
      v_missing := v_missing || v_tbl || ' ';
    END IF;
  END LOOP;

  ASSERT v_missing = '', format('0301 failed: missing FKs on: %s', v_missing);

  RAISE NOTICE '✅ 0301: حارس السائق + نوع السائق + 5 مفاتيح أجنبية — الجولة ١ مطبَّقة';
END $$;

NOTIFY pgrst, 'reload schema';
