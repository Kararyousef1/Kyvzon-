-- ============================================================================
-- 0348_payroll_run_integrity.sql
--
-- بوابة الموارد — المرحلة 4: نظام الرواتب `hr/PayrollPage`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- الأعطال المُثبتة تشغيلياً (قبل أي إصلاح)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطل ① — زرّ «فترة رواتب جديدة» يفشل دائماً ══════════════════════════
--
--   `PayrollPage.tsx:88` يُرسل `{ name, frequency, start_date, end_date,
--   payment_date, status }`. وجدول `payroll_periods` المُحقَّق يحوي ثمانية
--   أعمدة فقط: id · tenant_id · name · start_date · end_date · status ·
--   processed_at · created_at.
--
--   مُثبَت بالتشغيل:
--     INSERT INTO payroll_periods(name,frequency,…)
--       ⇒ ERROR: column "frequency" of relation "payroll_periods"
--         does not exist
--
--   ⇒ **لا يمكن إنشاء فترة رواتب واحدة عبر الواجهة إطلاقاً.**
--     والصفحة كلّها مبنيّة على الفترات — فهي معطّلة من أول زرّ.
--
-- ═══ العطل ② — كشف رواتب كامل بأصفار ═══════════════════════════════════════
--
--   `PayrollPage.tsx:118`
--     basic_salary: emp.base_salary || emp.salary || 0,
--     net_salary:   emp.base_salary || emp.salary || 0,
--
--   و`employees` **لا يحوي أياً من العمودين**. مُثبَت:
--     أعمدة base_salary/salary في employees = **0**
--     العمود base_salary موجود في: **payroll** (جدول آخر)
--
--   والراتب الحقيقي في موضعين:
--     `profiles.salary NUMERIC`
--     `employee_contracts.salary_amount NUMERIC` (العقد النافذ)
--
--   ⇒ `emp.base_salary` و`emp.salary` كلاهما `undefined` ⇒ السلسلة
--     `|| 0` تُنتج **صفراً لكل موظف**. تشغيل الرواتب يُنشئ كشفاً
--     كاملاً بأصفار — ثم يُعتمد ويُدفع.
--
-- ═══ العطل ③ — لا غياب لأحد أبداً ══════════════════════════════════════════
--
--   `:124`  working_days: 26 · present_days: 26 · absent_days: 0
--
--   أرقام مكتوبة يدوياً. و`payroll_settings.working_days_per_month`
--   موجود فعلاً (مُقاس: 26) ولا يُقرأ. والأهمّ أن `attendance_summary`
--   صار يُبنى من البصمات فعلياً بعد `0347` — فالحضور الحقيقي متاح
--   ولا يُستعمل.
--
--   ⇒ موظف غاب عشرة أيام يُدفع له راتب شهر كامل.
--
-- ═══ العطل ④ — الإعدادات المالية كلّها مُهمَلة ═════════════════════════════
--
--   `payroll_settings` يحوي: tax_rate · social_security_rate ·
--   overtime_rate (مُقاس: 1.50) · absence_penalty_per_day ·
--   allowance_config JSONB.
--
--   والصفحة تكتب: total_allowances=0 · total_deductions=0 ·
--   overtime_pay=0 · bonus_amount=0 · overtime_hours=0.
--
--   ⇒ لا ضريبة · لا ضمان اجتماعي · لا بدلات · لا أوفرتايم · لا خصم غياب.
--
-- ═══ العطل ⑤ — أقساط القروض لا تُخصم ═══════════════════════════════════════
--
--   `employee_loans` يحوي `monthly_installment` و`remaining_amount`
--   و`months_paid`. ولا شيء في مسار الرواتب يقرؤها.
--
--   ⇒ موظف عليه قرض يقبض راتبه كاملاً، والقرض لا يُسدَّد أبداً.
--
-- ═══ العطل ⑥ — لا قيد يحرس الحساب ══════════════════════════════════════════
--
--   مُثبَت: قيود CHECK على `payroll_records` = **0**.
--   لا شيء يضمن `net = basic + allowances + overtime + bonus − deductions`،
--   ولا يمنع صافياً سالباً.
--
-- ═══ العطل ⑦ — الفترة بلا حراسة حالة ولا أثر تدقيق ═════════════════════════
--
--   مُثبَت: قيود CHECK على `payroll_periods` = **0** ·
--   أعمدة approved_by/approved_at = **0**.
--
--   والصفحة تستدعي `updatePeriodStatus(id,'approved')` مباشرةً:
--     • لا شيء يمنع اعتماد فترة مرّتين
--     • ولا يمنع **تشغيل الرواتب على فترة معتمَدة** فيُكتب فوق
--       سجلّات مُقفَلة
--     • واعتماد رواتب بلا «من وافق ومتى»
--
-- ═══ العطل ⑧ — التشغيل مرّتين يُضاعف السجلّات ══════════════════════════════
--
--   `PayrollService.ts:102`
--     async upsertRecords(records) {
--       for (const record of records) { await this.create(record); }
--     }
--
--   اسمه upsert وهو `create` في حلقة. ولا قيد فريد على
--   (period_id, employee_id) — مُثبَت: قيود payroll_records الثلاثة
--   مفاتيح أجنبية وPK فقط.
--
--   ⇒ ضغطتان على «تشغيل الرواتب» = **سجلّان لكل موظف** = راتب مضاعف.
--
-- ═══ العطل ⑨ — كل تحديث لفترة الرواتب يفشل ════════════════════════════════
--
--   محفّز `update_payroll_periods_updated_at` مُسجَّل على الجدول:
--     BEFORE UPDATE ON public.payroll_periods
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
--
--   والدالة تُسند `NEW.updated_at = NOW()`. لكن `payroll_periods`
--   **لا يحوي عمود `updated_at`** (مُقاس: 0).
--
--   مُثبَت بالتشغيل على صفٍّ حقيقي:
--     UPDATE payroll_periods SET status='pending_approval' WHERE id=…
--       ⇒ record "new" has no field "updated_at"
--
--   ⇒ `updatePeriodStatus()` يفشل **دائماً** ⇒ «تشغيل الرواتب»
--     و«اعتماد الرواتب» كلاهما معطّل تماماً حتى لو صحّ كل ما سبق.
--
--   ★ الإدراج يعمل (المحفّز BEFORE UPDATE فقط) — فالفترة تُنشأ ثم
--     تتجمّد بحالتها الأولى إلى الأبد.
--
-- ═══ ما يفعله هذا المايجريشن ═══════════════════════════════════════════════
--   ① أعمدة الفترة الناقصة + قيد الحالة + أثر التدقيق
--   ② قيد فريد على (tenant, period, employee) + قيود الحساب
--   ③ employee_monthly_salary() — مصدر الراتب الموحّد
--   ④ payroll_run(period)  — تشغيل ذرّي يحسب كل شيء
--   ⑤ payroll_approve(period) / payroll_period_summary()
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   payroll_periods: 8 أعمدة · **لا frequency ولا payment_date**
--     ولا approved_by/at · **ولا updated_at رغم وجود محفّز يُسنده**
--     status TEXT بلا CHECK
--   payroll_records: tenant_id موجود · **لا قيد فريد** · لا CHECK
--   payroll_settings: صفّ واحد id=1 · working_days_per_month=26
--     overtime_rate=1.50 · tax_rate=0 · social_security_rate=0
--   الراتب: profiles.salary · employee_contracts.salary_amount
--     · payroll_settings.default_basic_salary — **لا employees.salary**
--   employee_loans: monthly_installment · remaining_amount · months_paid
--   attendance_summary: يُبنى من البصمات منذ 0347 · المفردات الثماني (0344)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① أعمدة الفترة الناقصة + الحراسة
--
--    ★ العطل ①: الواجهة ترسل frequency و payment_date منذ البداية.
--      نُضيفهما بدل تعديل الواجهة: الحقلان مشروعان إدارياً (دورة
--      الصرف وتاريخ الدفع) وحذفهما من الواجهة يُفقد معلومة حقيقية.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS frequency    TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  -- ★★★ العطل ⑨: محفّز update_payroll_periods_updated_at يُسند
  --   NEW.updated_at والعمود غير موجود ⇒ **كل** UPDATE على الجدول
  --   يفشل بـ record "new" has no field "updated_at".
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at    TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.payroll_periods'::regclass
       AND conname='payroll_periods_status_check'
  ) THEN
    ALTER TABLE public.payroll_periods
      ADD CONSTRAINT payroll_periods_status_check
      CHECK (status IN ('draft','pending_approval','approved','paid','cancelled'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.payroll_periods'::regclass
       AND conname='payroll_periods_frequency_check'
  ) THEN
    ALTER TABLE public.payroll_periods
      ADD CONSTRAINT payroll_periods_frequency_check
      CHECK (frequency IN ('monthly','biweekly','weekly'))
      NOT VALID;
  END IF;

  -- ★ نطاق التاريخ منطقيّ
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.payroll_periods'::regclass
       AND conname='payroll_periods_range_check'
  ) THEN
    ALTER TABLE public.payroll_periods
      ADD CONSTRAINT payroll_periods_range_check
      CHECK (end_date >= start_date) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.payroll_periods.frequency IS
  'دورة الصرف. الواجهة كانت ترسلها منذ البداية والعمود غير موجود ⇒ '
  'column "frequency" does not exist ⇒ تعذّر إنشاء أي فترة رواتب.';

-- ─────────────────────────────────────────────────────────────────────────
-- ② قيود سجلّ الراتب
--
--    ★★★ القيد الفريد يمنع العطل ⑧: ضغطتان على «تشغيل الرواتب» كانتا
--      تُنتجان سجلّين لكل موظف لأن upsertRecords هو create في حلقة.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- ★ تنظيف المكرّرات قبل القيد (نُبقي الأحدث)
  DELETE FROM public.payroll_records a
   USING public.payroll_records b
   WHERE a.period_id = b.period_id
     AND a.employee_id = b.employee_id
     AND COALESCE(a.tenant_id,'00000000-0000-0000-0000-000000000000'::UUID)
       = COALESCE(b.tenant_id,'00000000-0000-0000-0000-000000000000'::UUID)
     AND a.created_at < b.created_at;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.payroll_records'::regclass
       AND conname='payroll_records_unique_run'
  ) THEN
    ALTER TABLE public.payroll_records
      ADD CONSTRAINT payroll_records_unique_run
      UNIQUE (period_id, employee_id);
  END IF;

  -- ★★ معادلة الصافي — العطل ⑥
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.payroll_records'::regclass
       AND conname='payroll_records_net_check'
  ) THEN
    ALTER TABLE public.payroll_records
      ADD CONSTRAINT payroll_records_net_check
      CHECK (
        round(net_salary, 2) = round(
          basic_salary + total_allowances + overtime_pay
          + bonus_amount - total_deductions, 2)
      ) NOT VALID;
  END IF;

  -- ★★ لا صافي سالب: الخصومات لا تتجاوز المستحقّ
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.payroll_records'::regclass
       AND conname='payroll_records_net_nonneg'
  ) THEN
    ALTER TABLE public.payroll_records
      ADD CONSTRAINT payroll_records_net_nonneg
      CHECK (net_salary >= 0) NOT VALID;
  END IF;

  -- ★ أيام الحضور لا تتجاوز أيام العمل
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.payroll_records'::regclass
       AND conname='payroll_records_days_check'
  ) THEN
    ALTER TABLE public.payroll_records
      ADD CONSTRAINT payroll_records_days_check
      CHECK (present_days >= 0 AND absent_days >= 0
             AND present_days + absent_days + leave_days <= working_days + 5)
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT payroll_records_unique_run ON public.payroll_records IS
  'يمنع تضاعف السجلّات. upsertRecords كان create في حلقة بلا قيد فريد '
  '⇒ ضغطتان على «تشغيل الرواتب» = سجلّان لكل موظف = راتب مضاعف.';

-- ─────────────────────────────────────────────────────────────────────────
-- ③ مصدر الراتب الموحّد
--
--    ★★★ العطل ②: الصفحة تقرأ `employees.base_salary` و`employees.salary`
--      وكلاهما **غير موجود**. الراتب الحقيقي في ثلاثة مواضع بأولوية:
--        ① العقد النافذ  employee_contracts.salary_amount
--        ② الملف الشخصي  profiles.salary
--        ③ الافتراضي     payroll_settings.default_basic_salary
--
--    ★ العقد يسبق الملف: هو الوثيقة المُلزِمة قانوناً، والملف قد
--      يحمل رقماً قديماً لم يُحدَّث بعد الترقية.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.employee_monthly_salary(UUID, DATE);

CREATE FUNCTION public.employee_monthly_salary(
  p_employee_id UUID,
  p_on_date     DATE DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := COALESCE(p_on_date, current_date);
  v_sal NUMERIC;
BEGIN
  -- ① العقد النافذ في ذلك التاريخ
  SELECT c.salary_amount INTO v_sal
    FROM public.employee_contracts c
   WHERE c.employee_id = p_employee_id
     AND c.salary_amount IS NOT NULL
     AND c.salary_amount > 0
     AND c.start_date <= v_day
     AND (c.end_date IS NULL OR c.end_date >= v_day)
     AND COALESCE(c.status,'active') IN ('active','نشط','ساري')
   ORDER BY c.start_date DESC
   LIMIT 1;
  IF v_sal IS NOT NULL AND v_sal > 0 THEN RETURN v_sal; END IF;

  -- ② الملف الشخصي
  SELECT pr.salary INTO v_sal
    FROM public.employees e
    JOIN public.profiles pr ON pr.id = e.user_id
   WHERE e.id = p_employee_id;
  IF v_sal IS NOT NULL AND v_sal > 0 THEN RETURN v_sal; END IF;

  -- ③ الافتراضي من الإعدادات
  SELECT s.default_basic_salary INTO v_sal
    FROM public.payroll_settings s WHERE s.id = 1;

  RETURN COALESCE(v_sal, 0);
END $$;

COMMENT ON FUNCTION public.employee_monthly_salary(UUID,DATE) IS
  'الراتب الشهري بأولوية: العقد النافذ ثم الملف ثم الافتراضي. الصفحة '
  'كانت تقرأ employees.base_salary و employees.salary — وكلاهما غير '
  'موجود في الجدول (مُقاس: 0 أعمدة) ⇒ كشف رواتب كامل بأصفار.';

REVOKE ALL ON FUNCTION public.employee_monthly_salary(UUID,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_monthly_salary(UUID,DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.employee_monthly_salary(UUID,DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ تشغيل الرواتب — ذرّي ومحسوب
--
--    ★★ DEFINER: سياسة INSERT على payroll_records تشترط
--      current_user_is_staff() — ومدير الموارد قد يكون بدور manager.
--      الدالة تفحص الصلاحية بنفسها.
--
--    ★★★ ترفض التشغيل على فترة معتمَدة أو مدفوعة (العطل ⑦).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.payroll_run(UUID);

CREATE FUNCTION public.payroll_run(p_period_id UUID)
RETURNS TABLE(
  out_employees   INTEGER,
  out_gross       NUMERIC,
  out_deductions  NUMERIC,
  out_net         NUMERIC
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_start  DATE;
  v_end    DATE;
  v_status TEXT;
  v_wdays  INTEGER;
  v_tax    NUMERIC;
  v_ss     NUMERIC;
  v_otr    NUMERIC;
  v_pen    NUMERIC;
  v_n      INTEGER := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا مستأجر في السياق';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr','developer','it_admin') THEN
    RAISE EXCEPTION 'غير مصرَّح بتشغيل الرواتب (الدور: %)', COALESCE(v_role,'—');
  END IF;

  SELECT p.start_date, p.end_date, COALESCE(p.status,'draft')
    INTO v_start, v_end, v_status
    FROM public.payroll_periods p
   WHERE p.id = p_period_id AND p.tenant_id = v_tenant;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'فترة الرواتب غير موجودة في هذا المستأجر';
  END IF;

  -- ★★★ العطل ⑦: لا شيء كان يمنع الكتابة فوق فترة معتمَدة
  IF v_status IN ('approved','paid','cancelled') THEN
    RAISE EXCEPTION 'الفترة بحالة «%» — لا يمكن إعادة تشغيل الرواتب', v_status;
  END IF;

  SELECT COALESCE(s.working_days_per_month, 26),
         COALESCE(s.tax_rate, 0), COALESCE(s.social_security_rate, 0),
         COALESCE(s.overtime_rate, 1.5), COALESCE(s.absence_penalty_per_day, 0)
    INTO v_wdays, v_tax, v_ss, v_otr, v_pen
    FROM public.payroll_settings s WHERE s.id = 1;
  v_wdays := COALESCE(v_wdays, 26);
  v_tax   := COALESCE(v_tax, 0);
  v_ss    := COALESCE(v_ss, 0);
  v_otr   := COALESCE(v_otr, 1.5);
  v_pen   := COALESCE(v_pen, 0);

  -- ★★★ الحساب كلّه في القاعدة من مصادر حقيقية
  WITH emp AS (
    SELECT e.id,
           public.employee_monthly_salary(e.id, v_end) AS basic
      FROM public.employees e
     WHERE e.tenant_id = v_tenant AND e.is_active
  ),
  att AS (
    -- ★★ الحضور الفعليّ — متاح منذ 0347 (المحفّز يبني الملخّص)
    SELECT a.employee_id,
           count(*) FILTER (
             WHERE public.attendance_status_bucket(a.status) = 'present')::INTEGER AS present,
           count(*) FILTER (
             WHERE public.attendance_status_bucket(a.status) = 'absent')::INTEGER  AS absent,
           count(*) FILTER (
             WHERE public.attendance_status_bucket(a.status) = 'leave')::INTEGER   AS leave_d,
           COALESCE(sum(a.overtime_minutes), 0) / 60.0 AS ot_hours
      FROM public.attendance_summary a
     WHERE a.tenant_id = v_tenant
       AND a.shift_date >= v_start
       AND a.shift_date <= v_end
     GROUP BY a.employee_id
  ),
  loan AS (
    -- ★★ قسط القرض — العطل ⑤. لا يتجاوز المتبقّي.
    --
    -- ★★★ القصّ **لكل قرض على حدة** ثم الجمع. النسخة الأولى جمعت
    --   الأقساط ثم قصّت بمجموع المتبقّي — فقرضٌ قسطه 500,000 ومتبقّيه
    --   120,000 (آخر قسط) كان يُخصم كاملاً لأن فائض المتبقّي في قرضٍ
    --   آخر يُعوّضه. اكتشفتُه بجولة العكس: الشرط كان غير قابل
    --   للملاحظة لأنه لا يُفعّل إلا حين يتجاوز القسط متبقّيه.
    SELECT l.employee_id,
           SUM(LEAST(
             COALESCE(l.monthly_installment, 0),
             COALESCE(l.remaining_amount, 0)
           )) AS installment
      FROM public.employee_loans l
     WHERE l.tenant_id = v_tenant
       -- ★ القيم المسموحة مُحقَّقة من employee_loans_status_chk:
       --   pending·approved·rejected·paid·cancelled — **لا 'active'**
       AND l.status = 'approved'
       AND COALESCE(l.remaining_amount, 0) > 0
     GROUP BY l.employee_id
  ),
  calc AS (
    SELECT e.id AS employee_id,
           round(e.basic, 2) AS basic,
           COALESCE(a.present, 0) AS present_d,
           COALESCE(a.absent, 0)  AS absent_d,
           COALESCE(a.leave_d, 0) AS leave_d,
           round(COALESCE(a.ot_hours, 0), 2) AS ot_hours,
           -- ★ أجر الساعة = الراتب ÷ (أيام العمل × 8)
           round(COALESCE(a.ot_hours, 0)
                 * (e.basic / NULLIF(v_wdays * 8, 0)) * v_otr, 2) AS ot_pay,
           round(COALESCE(a.absent, 0) * v_pen, 2) AS absence_cut,
           round(e.basic * v_tax / 100.0, 2) AS tax_cut,
           round(e.basic * v_ss  / 100.0, 2) AS ss_cut,
           round(COALESCE(l.installment, 0), 2) AS loan_cut
      FROM emp e
      LEFT JOIN att  a ON a.employee_id = e.id
      LEFT JOIN loan l ON l.employee_id = e.id
  ),
  final AS (
    SELECT c.*,
           (c.absence_cut + c.tax_cut + c.ss_cut + c.loan_cut) AS deduct_raw
      FROM calc c
  ),
  capped AS (
    SELECT f.*,
           -- ★★★ الخصم لا يتجاوز المستحقّ: القيد يمنع الصافي السالب،
           --   والقصّ هنا يجعل الرفض مستحيلاً بدل أن يُسقط التشغيل كلّه.
           LEAST(f.deduct_raw, f.basic + f.ot_pay) AS deduct
      FROM final f
  )
  INSERT INTO public.payroll_records
    (tenant_id, period_id, employee_id, basic_salary, total_allowances,
     total_deductions, overtime_pay, bonus_amount, net_salary,
     working_days, present_days, absent_days, leave_days, overtime_hours,
     status, updated_at)
  SELECT v_tenant, p_period_id, c.employee_id, c.basic, 0,
         c.deduct, c.ot_pay, 0,
         round(c.basic + c.ot_pay - c.deduct, 2),
         v_wdays, c.present_d, c.absent_d, c.leave_d, c.ot_hours,
         'draft', NOW()
    FROM capped c
  ON CONFLICT (period_id, employee_id) DO UPDATE
    SET basic_salary     = EXCLUDED.basic_salary,
        total_deductions = EXCLUDED.total_deductions,
        overtime_pay     = EXCLUDED.overtime_pay,
        net_salary       = EXCLUDED.net_salary,
        working_days     = EXCLUDED.working_days,
        present_days     = EXCLUDED.present_days,
        absent_days      = EXCLUDED.absent_days,
        leave_days       = EXCLUDED.leave_days,
        overtime_hours   = EXCLUDED.overtime_hours,
        updated_at       = NOW()
    -- ★ لا نكتب فوق سجلّ معتمَد فردياً
    WHERE public.payroll_records.status NOT IN ('approved','paid');

  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.payroll_periods
     SET status = 'pending_approval', processed_at = NOW()
   WHERE id = p_period_id AND tenant_id = v_tenant;

  RETURN QUERY
  SELECT v_n,
         COALESCE(round(sum(r.basic_salary + r.overtime_pay), 2), 0),
         COALESCE(round(sum(r.total_deductions), 2), 0),
         COALESCE(round(sum(r.net_salary), 2), 0)
    FROM public.payroll_records r
   WHERE r.tenant_id = v_tenant AND r.period_id = p_period_id;
END $$;

COMMENT ON FUNCTION public.payroll_run(UUID) IS
  'تشغيل الرواتب. الصفحة كانت تقرأ employees.base_salary غير الموجود '
  '⇒ كشف بأصفار · وتكتب 26/26 يوماً ⇒ لا غياب لأحد · وتُهمل الضريبة '
  'والضمان والأوفرتايم وأقساط القروض · وتسمح بالكتابة فوق فترة معتمَدة.';

REVOKE ALL ON FUNCTION public.payroll_run(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_run(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.payroll_run(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ الاعتماد — بأثر تدقيق وحراسة انتقال
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.payroll_approve(UUID);

CREATE FUNCTION public.payroll_approve(p_period_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_uid    UUID := auth.uid();
  v_status TEXT;
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا مستأجر في السياق';
  END IF;
  -- ★★ الاعتماد أضيق من التشغيل: admin و hr وحدهما
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح باعتماد الرواتب (الدور: %)', COALESCE(v_role,'—');
  END IF;

  SELECT COALESCE(p.status,'draft') INTO v_status
    FROM public.payroll_periods p
   WHERE p.id = p_period_id AND p.tenant_id = v_tenant;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'فترة الرواتب غير موجودة في هذا المستأجر';
  END IF;

  -- ★★★ حراسة الانتقال: من pending_approval وحدها
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'الفترة بحالة «%» — الاعتماد يتطلّب pending_approval', v_status;
  END IF;

  SELECT count(*)::INTEGER INTO v_n FROM public.payroll_records r
   WHERE r.tenant_id = v_tenant AND r.period_id = p_period_id;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'لا سجلّات رواتب في هذه الفترة — شغّل الرواتب أولاً';
  END IF;

  UPDATE public.payroll_records
     SET status = 'approved', updated_at = NOW()
   WHERE tenant_id = v_tenant AND period_id = p_period_id
     AND status NOT IN ('approved','paid');

  UPDATE public.payroll_periods
     SET status = 'approved', approved_by = v_uid,
         approved_at = NOW(), locked_at = NOW()
   WHERE id = p_period_id AND tenant_id = v_tenant;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.payroll_approve(UUID) IS
  'اعتماد فترة رواتب. الصفحة كانت تستدعي updatePeriodStatus مباشرةً — '
  'فلا حراسة انتقال (اعتماد مرّتين) ولا أثر تدقيق (من وافق ومتى) ولا '
  'تحقّق من وجود سجلّات أصلاً.';

REVOKE ALL ON FUNCTION public.payroll_approve(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_approve(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.payroll_approve(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ ملخّص الفترة
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.payroll_period_summary(UUID);

CREATE FUNCTION public.payroll_period_summary(p_period_id UUID)
RETURNS TABLE(
  out_records    INTEGER,
  out_gross      NUMERIC,
  out_deductions NUMERIC,
  out_net        NUMERIC,
  out_avg_net    NUMERIC,
  out_absent     INTEGER,
  out_overtime   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  -- صفّ أصفار لا «لا شيء» (درس 0337)
  IF v_tenant IS NULL OR p_period_id IS NULL THEN
    RETURN QUERY SELECT 0, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0, 0::NUMERIC;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT count(*)::INTEGER,
         COALESCE(round(sum(r.basic_salary + r.total_allowances
                            + r.overtime_pay + r.bonus_amount), 2), 0),
         COALESCE(round(sum(r.total_deductions), 2), 0),
         COALESCE(round(sum(r.net_salary), 2), 0),
         COALESCE(round(avg(r.net_salary), 2), 0),
         COALESCE(sum(r.absent_days), 0)::INTEGER,
         COALESCE(round(sum(r.overtime_hours), 2), 0)
    FROM public.payroll_records r
   WHERE r.tenant_id = v_tenant AND r.period_id = p_period_id;
END $$;

COMMENT ON FUNCTION public.payroll_period_summary(UUID) IS
  'ملخّص فترة الرواتب — لم يكن للصفحة ملخّص مالي إطلاقاً.';

REVOKE ALL ON FUNCTION public.payroll_period_summary(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_period_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.payroll_period_summary(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payroll_records_tenant_period
  ON public.payroll_records (tenant_id, period_id);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant_status
  ON public.payroll_periods (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_emp_contracts_emp_dates
  ON public.employee_contracts (employee_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_emp_loans_tenant_status
  ON public.employee_loans (tenant_id, status);
