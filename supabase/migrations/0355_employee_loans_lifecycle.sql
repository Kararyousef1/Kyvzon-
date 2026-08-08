-- ════════════════════════════════════════════════════════════════════════
--  0355 — دورة حياة السلف: التسديد · مفردات الحالة · التقويم
--  المرحلة 4 — بوابة الموارد البشرية · صفحة hr/LoansPage.tsx (437 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسابر: tools/dev/_probe_0355*.sql — نُفّذت على قاعدة نظيفة)  │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★ مفردتان مختلَقتان: `active` و`completed`
--     `LoansPage.tsx:143` يُرشِّح بـ `l.status === 'active'` ويجمع منها
--     «المتبقي النشط»، و`:181` يعدّ `'completed'` في بطاقة «مكتملة».
--     و`payroll.ts:14` يُعرّف:
--        export type LoanStatus = 'pending'|'approved'|'active'|'completed'|'rejected'
--
--     القاعدة تقول غير ذلك — `employee_loans_status_chk` المُحقَّق:
--        pending · approved · rejected · paid · cancelled
--
--     المسبار PROBE_1A / PROBE_1B (‎_probe_0355.sql):
--        PROBE_1A: status=active     مرفوض ← violates check constraint
--        PROBE_1B: status=completed  مرفوض ← violates check constraint
--
--     الأثر المقيس: بطاقة «المتبقي النشط» تعرض **صفراً أبداً** لأنه لا
--     يمكن لصفٍّ أن يحمل `active`؛ وبطاقة «مكتملة» تعرض **صفراً أبداً**؛
--     وشريط التقدّم داخل البطاقة مشروط بـ `loan.status === 'active'`
--     فلا يظهر لأيّ سلفة على الإطلاق. وزرّا الفلترة `ساري` و`مكتمل`
--     يعرضان قائمة فارغة دائماً. بالمقابل `paid` و`cancelled` — وهما
--     مفردتان **حقيقيتان** في القاعدة — بلا زرّ فلترة ولا تسمية:
--        LOAN_STATUS_LABELS[loan.status]  ⇒  undefined
--     فيظهر شارة فارغة في الجدول.
--
--     ★ القرار: القاعدة هي المرجع. نُبقي المفردات الخمس الحقيقية
--       ونُصلح الواجهة — لا العكس. توسيع القيد ليقبل `active` سيعني
--       حالتين تعنيان الشيء ذاته (`approved` وهي فعلاً السارية).
--
--  ② ★★★ لا شيء في المنظومة كلّها يُسدّد قسطاً
--     مسحُ pg_proc لكل الدوال (prokind='f') في سكيما public:
--        دوال تكتب months_paid       →  صفر
--        دوال تكتب UPDATE employee_loans → record_financial_rejection_reason
--                                          · sync_hr_source_status
--        (وكلتاهما تكتبان status/rejection_reason — لا القسط)
--
--     المسبار PROBE_2: سلفة 1,200,000 على 12 شهراً بقسط 100,000.
--     شُغِّلت الرواتب لفترتين متتاليتين (فبراير · مارس 2026) بدور hr:
--        فبراير 2026 | total_deductions = 100000.00
--        مارس   2026 | total_deductions = 100000.00
--        PROBE_2_LOAN | remaining_amount = 1200000.00 | months_paid = 0
--
--     ★ الخصم يقع مرّتين والقرض لا يتحرّك. هذه سلفةٌ **أبدية**: تُخصم
--       من راتب الموظف كل شهر إلى ما لا نهاية ولا تُسدَّد أبداً، لأن
--       `payroll_run` يقرأ `remaining_amount` ولا يكتبه. وشرط
--       `AND COALESCE(l.remaining_amount,0) > 0` في 0348 لا يُنقذ:
--       المتبقّي لا ينقص فلا يبلغ الصفر.
--
--     وسطر LoansPage:216 يعرض «المدفوع: {months_paid}/{months_count} شهر»
--     ⇒ «المدفوع: 0/12 شهر» بعد سنتين من الخصم. وشريط التقدّم:
--        progress = (amount - remaining_amount)/amount * 100  ⇒  0%
--
--     المسبار PROBE_3: جدول `loan_repayments` أو `loan_installments`
--        loan_repayment_tables = 0
--     رغم أن `payroll.ts:104` يُعرّف `interface LoanRepayment` كاملاً.
--     النوع موجود في TypeScript والجدول غير موجود في القاعدة.
--
--  ③ ★★ `setMonth` يتخطّى الشهر عند نهايات الأشهر
--     `FinanceService.approveLoan` تحسب `end_date` بـ:
--        const end = new Date(opts.startDate);
--        end.setMonth(end.getMonth() + opts.monthsCount);
--
--     مقيس بـ node (PROBE_4 يقابله في القاعدة):
--        JS  31 يناير 2026 + 1  شهر  →  2026-03-03   ← ثلاثة أيام في مارس
--        PG  31 يناير 2026 + 1  شهر  →  2026-02-28   ← الصحيح
--        JS  31 أغسطس 2026 + 6 أشهر  →  2027-03-03
--
--     فبراير 2026 لا يملك يوماً 31، فـJS يفيض إلى مارس. الحساب يقع في
--     المتصفّح بينما `sync_hr_source_status` (0325) يحسبه في القاعدة
--     صحيحاً — فالمساران يعطيان تاريخين مختلفين لنفس السلفة.
--
--  ④ ★★★ زرّ «موافقة» يفشل لكل سلفة قادمة من بوابة الموظف
--     `MyLoansPage:143` تستدعي بعد الإنشاء:
--        financialRequestService.createApproval('loan', created.id, …)
--     فتُبنى سلسلة اعتماد. والمحفّز `trg_guard_status_bypass` يمنع
--     تغيير الحالة مباشرةً ما دامت خطوةٌ مفتوحة.
--
--     المسبار PROBE_7E (‎_probe_0355e.sql — بقسم ومدير وقاعدة مبلغ):
--        OPEN_STEPS = 1
--        PROBE_7E: مرفوض ← APPROVAL_CHAIN_BYPASS: للطلب سلسلة اعتماد
--                  مفتوحة (1 خطوة). استعمل صندوق الموافقات …
--
--     وزرّ «موافقة» في LoansPage يستدعي `approveLoan` وهو `UPDATE` مباشر.
--     ⇒ **يرمي دائماً** للسلف الآتية من الموظفين. أمّا سلف HR نفسها
--     فتمرّ (PROBE_7 بلا سلسلة: «التحديث المباشر نجح») — فالسلوك
--     يختلف باختلاف مصدر السلفة بلا أن يُنبّه المستخدم.
--
--  ⑤ ★★ `handleCreate` لا يبني سلسلة اعتماد أصلاً
--     grep على LoansPage.tsx: صفر مطابقة لـ`createApproval`.
--     ⇒ سلفة يُنشئها HR بمليار دينار تمرّ بلا اعتماد أحد، بينما سلفة
--       الموظف بـ100 ألف تمرّ بسلسلة كاملة. باب خلفيّ للمبالغ الكبيرة.
--
--  ⑥ ★ `start_date` يُجمع في النموذج ويُهمَل
--     `LoansPage:38` يُهيّئ `start_date` في `formData`، و`:82` يُعيد
--     تهيئته بعد النجاح — ولا يُمرَّر في `createLoan` (السطور 70‑76).
--     ⇒ `FinanceService.createLoan:94` يستعمل `new Date()` أي اليوم.
--       سلفة تبدأ الشهر القادم تُسجَّل بتاريخ اليوم فيُخصم قسطها فوراً.
--     ولا حقل إدخال لـ`start_date` في النافذة رغم وجوده في الحالة.
--
--  ⑦ ★ قسمة على صفر بلا حارس
--     `LoansPage:68`:  const installment = formData.amount / formData.months_count;
--     الحقل `min="1"` في HTML لكن `Number('')` = 0 والإدخال المسحوب
--     لصفر يمرّ. مقيس بـnode: `1200000 / 0` = **Infinity**.
--     ثم يُرسَل `installment_amount: Infinity` ⇒ JSON.stringify يحوّله
--     إلى `null` ⇒ `monthly_installment NOT NULL DEFAULT 0` تصبح 0.
--     (`createLoan` تحمي `months` بـ`|| 1` لكن ليس `installment`
--      لأنه يُمرَّر صراحةً فلا يقع على المسار الاحتياطي.)
--
--  ⑧ ★ `getTotalOutstanding` تعتمد `findAll` بلا حدّ
--     تجلب كل صفوف `status='approved'` إلى المتصفّح لتجمعها. مع آلاف
--     السلف هذا نقلٌ كامل للجدول لأجل رقم واحد.
--
--  ⑨ ★★ لا سجلّ تدقيق لأي تسديد
--     لا يمكن الإجابة عن «متى سُدِّد القسط الثالث ومن أي فترة رواتب».
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  ما يفعله هذا المايجريشن                                          │
--  └──────────────────────────────────────────────────────────────────┘
--   (أ) جدول `loan_repayments` — سجلّ التسديدات بمفتاح فريد
--       (loan_id, payroll_period_id) يمنع الخصم المزدوج بنيوياً.
--   (ب) `loan_apply_repayment()` — تُنقص المتبقّي وتزيد months_paid
--       وتُغلق القرض بـ`paid` عند بلوغ الصفر، بأثر تدقيق.
--   (جـ) ربط `payroll_approve` بها: التسديد يقع عند **اعتماد** الرواتب
--       لا عند تشغيلها (التشغيل قابل للإعادة، الاعتماد لا).
--   (د) `loan_create()` — إنشاء بحارس مبلغ/أشهر/قسط وتاريخ بداية
--       حقيقيّ، وبناء سلسلة الاعتماد في المعاملة نفسها.
--   (هـ) `loan_summary()` — البطاقات الأربع محسوبة في القاعدة.
--   (و) `loan_board()` — القائمة مع اسم الموظف ورمزه وحالة السلسلة.
--   (ز) `loan_decide()` — اعتماد/رفض يحترم سلسلة الاعتماد.
--
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- (أ) سجلّ التسديدات
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loan_repayments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
                      DEFAULT public.current_user_tenant_id(),
  loan_id           UUID NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  payroll_period_id UUID REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  amount            NUMERIC(14,2) NOT NULL,
  installment_no    INTEGER NOT NULL,
  remaining_after   NUMERIC(14,2) NOT NULL,
  source            TEXT NOT NULL DEFAULT 'payroll',
  note              TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loan_repayments_amount_pos    CHECK (amount > 0),
  CONSTRAINT loan_repayments_inst_pos      CHECK (installment_no >= 1),
  CONSTRAINT loan_repayments_remain_nonneg CHECK (remaining_after >= 0),
  CONSTRAINT loan_repayments_source_chk    CHECK (source IN ('payroll','manual','settlement'))
);

-- ★★★ الحاجز البنيويّ ضدّ الخصم المزدوج (العطل ②): فترة رواتب واحدة
--   لا تُسدّد القرض نفسه مرّتين مهما أُعيد الاعتماد. جزئيّ لأن التسديد
--   اليدويّ (payroll_period_id IS NULL) قد يتكرّر بمشروعية.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_repay_per_period
  ON public.loan_repayments (loan_id, payroll_period_id)
  WHERE payroll_period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_repay_loan
  ON public.loan_repayments (tenant_id, loan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_repay_emp
  ON public.loan_repayments (tenant_id, employee_id);

COMMENT ON TABLE public.loan_repayments IS
  'سجلّ تسديد أقساط السلف. أُنشئ في 0355: لا شيء في المنظومة كان '
  'يُنقص remaining_amount أو يزيد months_paid — فكان القسط يُخصم من '
  'الراتب كل شهر أبداً والقرض لا يُسدَّد (مقيس: خصمان متتاليان '
  'و remaining_amount=1200000 دون تغيير).';

ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_loan_repayments_select ON public.loan_repayments;
CREATE POLICY kyvzon_loan_repayments_select ON public.loan_repayments
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND (public.current_user_is_staff()
         OR employee_id = public.current_user_employee_id())
  );

-- ★ لا سياسة INSERT/UPDATE/DELETE: الكتابة عبر SECURITY DEFINER وحدها.
--   التسديد حدثٌ محاسبيّ — لا يُكتب من المتصفّح.

-- ★★★ ثغرة أمنية كشفها سكربت RLS: كتبتُ بوابة الوحدة PERMISSIVE أوّلاً.
--   سياستان PERMISSIVE تُدمجان بـ **OR** — فبوابة الوحدة (التي تعود
--   TRUE لكل مشترك في `hr`) كانت تُلغي أثر سياسة المستأجر تماماً.
--
--   المقيس قبل الإصلاح (بدور authenticated حقيقيّ، لا postgres):
--      HR/شركة ب  →  SELECT count(*) FROM loan_repayments  =  3
--      وهي كل الصفوف، منها صفّان يخصّان **شركة أ**.
--      وسالم رأى تسديد زميله ناصر، والمدير رأى الجميع.
--
--   نظيرتها في `employee_loans` من 0151 هي RESTRICTIVE (polpermissive=f)
--   وهو الصواب: RESTRICTIVE تُدمَج بـ AND. نُطابقها نصّاً، بما في ذلك
--   `TO authenticated` — لأن السياسة على PUBLIC تشمل أدوار الخدمة.
DROP POLICY IF EXISTS hybrid_gate_loan_repayments ON public.loan_repayments;
CREATE POLICY hybrid_gate_loan_repayments ON public.loan_repayments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

-- ★★★ ثغرة كشفها التأكيد 10: `ALTER DEFAULT PRIVILEGES IN SCHEMA public`
--   (في 0268) يمنح `authenticated` كل الصلاحيات على **كل جدول جديد**
--   تلقائياً. مقيس على loan_repayments قبل الإصلاح:
--      authenticated | INSERT · SELECT · UPDATE · DELETE
--   فمنحُ SELECT وحده لا يكفي — المنحة الضمنية سبقتنا. لولا REVOKE
--   الصريح لأمكن للمتصفّح كتابة صفّ تسديد مباشرةً وتزوير سداد سلفة.
--   (RLS كانت ستحجبه لغياب سياسة INSERT، لكن الاعتماد على طبقة واحدة
--    خطأ: سياسة PERMISSIVE واحدة تُضاف لاحقاً تفتح الباب.)
REVOKE ALL ON public.loan_repayments FROM authenticated;
REVOKE ALL ON public.loan_repayments FROM anon;
GRANT SELECT ON public.loan_repayments TO authenticated;

-- ★ الحذف النهائي ممنوع بسياسة المنصة — ومحفّز يحرسه
CREATE OR REPLACE FUNCTION public.tg_block_loan_repayment_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION
    'LOAN_REPAYMENT_IMMUTABLE: سجلّ التسديد لا يُحذف — استعمل تسوية معاكسة'
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_block_loan_repayment_delete ON public.loan_repayments;
CREATE TRIGGER trg_block_loan_repayment_delete
  BEFORE DELETE ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_loan_repayment_delete();

-- ─────────────────────────────────────────────────────────────────────────
-- (ب) تطبيق تسديد — النواة
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.loan_apply_repayment(UUID, UUID, NUMERIC, TEXT);

CREATE FUNCTION public.loan_apply_repayment(
  p_loan_id   UUID,
  p_period_id UUID    DEFAULT NULL,
  p_amount    NUMERIC DEFAULT NULL,
  p_source    TEXT    DEFAULT 'payroll'
) RETURNS NUMERIC
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_loan   RECORD;
  v_pay    NUMERIC;
  v_rem    NUMERIC;
  v_no     INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF p_source NOT IN ('payroll','manual','settlement') THEN
    RAISE EXCEPTION 'مصدر تسديد غير معروف: %', p_source;
  END IF;

  SELECT * INTO v_loan FROM public.employee_loans
   WHERE id = p_loan_id AND tenant_id = v_tenant
   FOR UPDATE;

  IF v_loan.id IS NULL THEN
    RAISE EXCEPTION 'السلفة غير موجودة في هذا المستأجر';
  END IF;

  -- ★ التسديد لا يقع إلا على سلفة معتمَدة. `paid` مغلقة و`pending`
  --   لم تُصرف بعد و`rejected`/`cancelled` لا وجود لها ماليّاً.
  IF v_loan.status <> 'approved' THEN
    RAISE EXCEPTION 'LOAN_NOT_ACTIVE: السلفة بحالة «%» — التسديد يتطلّب approved',
      v_loan.status USING ERRCODE = 'check_violation';
  END IF;

  v_rem := COALESCE(v_loan.remaining_amount, 0);
  IF v_rem <= 0 THEN
    RETURN 0;                                   -- مسدَّدة أصلاً: لا خصم
  END IF;

  -- ★★ القصّ عند المتبقّي: آخر قسط لا يتجاوز الباقي (درس 0348)
  v_pay := LEAST(
    COALESCE(NULLIF(p_amount, 0), v_loan.monthly_installment, 0),
    v_rem);

  IF v_pay <= 0 THEN
    RETURN 0;
  END IF;

  v_no := COALESCE(v_loan.months_paid, 0) + 1;

  INSERT INTO public.loan_repayments
    (tenant_id, loan_id, employee_id, payroll_period_id, amount,
     installment_no, remaining_after, source, created_by)
  VALUES (v_tenant, p_loan_id, v_loan.employee_id, p_period_id, v_pay,
          v_no, v_rem - v_pay, p_source, auth.uid());
  -- ★ لا ON CONFLICT: تكرار الفترة يجب أن **يرمي** لا أن يُبتلع صامتاً.

  -- ★ الكتابة على القرض تمرّ بحارس السلسلة — نُعلمه أنها كتابة نظام
  PERFORM set_config('kyvzon.approval_sync', 'true', TRUE);

  UPDATE public.employee_loans
     SET remaining_amount = v_rem - v_pay,
         months_paid      = v_no,
         status           = CASE WHEN v_rem - v_pay <= 0 THEN 'paid'
                                 ELSE status END,
         updated_at       = NOW()
   WHERE id = p_loan_id AND tenant_id = v_tenant;

  PERFORM set_config('kyvzon.approval_sync', 'false', TRUE);

  RETURN v_pay;
END $$;

COMMENT ON FUNCTION public.loan_apply_repayment(UUID, UUID, NUMERIC, TEXT) IS
  'يُسدّد قسطاً: يُنقص remaining_amount ويزيد months_paid ويُغلق '
  'بـ paid عند الصفر. الفهرس uq_loan_repay_per_period يمنع خصم '
  'الفترة الواحدة مرّتين.';

REVOKE ALL ON FUNCTION public.loan_apply_repayment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loan_apply_repayment(UUID, UUID, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.loan_apply_repayment(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (جـ) ربط الاعتماد بالتسديد — العطل ② يُغلق هنا
-- ─────────────────────────────────────────────────────────────────────────
--  التسديد عند **الاعتماد** لا عند التشغيل: `payroll_run` قابل للإعادة
--  ما دامت الفترة draft/pending_approval، فربطُه بالتسديد يعني خصماً
--  عند كل إعادة تشغيل. `payroll_approve` يقع مرّة واحدة (يحرس
--  `v_status <> 'pending_approval'`).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.payroll_approve(UUID);

CREATE FUNCTION public.payroll_approve(p_period_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_uid    UUID := auth.uid();
  v_status TEXT;
  v_n      INTEGER;
  v_loan   RECORD;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا مستأجر في السياق';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح باعتماد الرواتب (الدور: %)', COALESCE(v_role,'—');
  END IF;

  SELECT COALESCE(p.status,'draft') INTO v_status
    FROM public.payroll_periods p
   WHERE p.id = p_period_id AND p.tenant_id = v_tenant;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'فترة الرواتب غير موجودة في هذا المستأجر';
  END IF;

  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'الفترة بحالة «%» — الاعتماد يتطلّب pending_approval', v_status;
  END IF;

  SELECT count(*)::INTEGER INTO v_n FROM public.payroll_records r
   WHERE r.tenant_id = v_tenant AND r.period_id = p_period_id;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'لا سجلّات رواتب في هذه الفترة — شغّل الرواتب أولاً';
  END IF;

  -- ★★★ 0355/②: تسديد أقساط السلف للموظفين الذين شملهم هذا الكشف.
  --   الشرط `EXISTS payroll_records` جوهريّ: القسط لا يُسدَّد إلا إن
  --   خُصم فعلاً من راتب هذا الموظف في هذه الفترة. موظفٌ غير مشمول
  --   في الكشف (غير نشط مثلاً) لا يُسدَّد قرضه.
  FOR v_loan IN
    SELECT l.id
      FROM public.employee_loans l
     WHERE l.tenant_id = v_tenant
       AND l.status = 'approved'
       AND COALESCE(l.remaining_amount, 0) > 0
       AND EXISTS (SELECT 1 FROM public.payroll_records r
                    WHERE r.tenant_id = v_tenant
                      AND r.period_id = p_period_id
                      AND r.employee_id = l.employee_id)
     ORDER BY l.created_at
  LOOP
    PERFORM public.loan_apply_repayment(v_loan.id, p_period_id, NULL, 'payroll');
  END LOOP;

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
  'اعتماد كشف الرواتب — و 0355: يُسدّد أقساط السلف المخصومة فيه. '
  'التسديد عند الاعتماد لا عند التشغيل: التشغيل قابل للإعادة.';

REVOKE ALL ON FUNCTION public.payroll_approve(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_approve(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.payroll_approve(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (د) إنشاء سلفة — حارس كامل + سلسلة اعتماد (الأعطال ③ ⑤ ⑥ ⑦)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.loan_create(UUID, NUMERIC, INTEGER, TEXT, DATE, NUMERIC);

CREATE FUNCTION public.loan_create(
  p_employee_id UUID,
  p_amount      NUMERIC,
  p_months      INTEGER,
  p_purpose     TEXT,
  p_start_date  DATE    DEFAULT NULL,
  p_installment NUMERIC DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_start  DATE;
  v_inst   NUMERIC;
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء سلفة (الدور: %)', COALESCE(v_role,'—');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;

  -- ★ العطل ⑦: القسمة على صفر تُنتج Infinity في JS ثم صفراً في القاعدة
  IF p_months IS NULL OR p_months < 1 OR p_months > 60 THEN
    RAISE EXCEPTION 'LOAN_BAD_MONTHS: عدد الأشهر يجب أن يكون بين 1 و 60 (المُمرَّر: %)',
      COALESCE(p_months::TEXT,'NULL') USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'LOAN_BAD_AMOUNT: المبلغ يجب أن يكون موجباً (المُمرَّر: %)',
      COALESCE(p_amount::TEXT,'NULL') USING ERRCODE = 'check_violation';
  END IF;
  IF p_purpose IS NULL OR btrim(p_purpose) = '' THEN
    RAISE EXCEPTION 'LOAN_NO_PURPOSE: الغرض إلزاميّ' USING ERRCODE = 'check_violation';
  END IF;

  -- ★ العطل ⑥: تاريخ البداية يُمرَّر فعلاً — واليوم احتياطيّ صريح
  v_start := COALESCE(p_start_date, (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE);

  v_inst := COALESCE(NULLIF(p_installment, 0), round(p_amount / p_months, 2));
  IF v_inst <= 0 OR v_inst > p_amount THEN
    RAISE EXCEPTION 'LOAN_BAD_INSTALLMENT: القسط % خارج المجال (0، %]',
      v_inst, p_amount USING ERRCODE = 'check_violation';
  END IF;

  -- ★★ العطل ③: end_date تُحسب في القاعدة — لا setMonth في المتصفّح.
  --   31 يناير + 1 شهر = 28 فبراير في PG · 3 مارس في JS.
  INSERT INTO public.employee_loans
    (tenant_id, employee_id, amount, remaining_amount, monthly_installment,
     months_count, months_paid, start_date, end_date, purpose, status)
  VALUES (v_tenant, p_employee_id, p_amount, 0, v_inst,
          p_months, 0, v_start,
          (v_start + (p_months || ' months')::INTERVAL)::DATE,
          btrim(p_purpose), 'pending')
  RETURNING id INTO v_id;

  -- ★★★ العطل ⑤: سلسلة الاعتماد تُبنى هنا — لا باب خلفيّ لسلف HR.
  PERFORM public.create_financial_request_approval(
    'loan', v_id, p_employee_id, p_amount);

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.loan_create(UUID, NUMERIC, INTEGER, TEXT, DATE, NUMERIC) IS
  'إنشاء سلفة بحارس مبلغ/أشهر/قسط، وتاريخ بداية حقيقيّ (كان يُهمَل)، '
  'و end_date محسوبة في القاعدة (setMonth في JS يقفز 31 يناير إلى '
  '3 مارس)، وسلسلة اعتماد إلزامية (كانت الصفحة تتجاوزها).';

REVOKE ALL ON FUNCTION public.loan_create(UUID, NUMERIC, INTEGER, TEXT, DATE, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loan_create(UUID, NUMERIC, INTEGER, TEXT, DATE, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.loan_create(UUID, NUMERIC, INTEGER, TEXT, DATE, NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (هـ) البطاقات الأربع — محسوبة في القاعدة (الأعطال ① ⑧)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.loan_summary();

CREATE FUNCTION public.loan_summary()
RETURNS TABLE (
  out_total       INTEGER,
  out_pending     INTEGER,
  out_active      INTEGER,
  out_paid        INTEGER,
  out_rejected    INTEGER,
  out_cancelled   INTEGER,
  out_outstanding NUMERIC,
  out_monthly     NUMERIC,
  out_disbursed   NUMERIC,
  out_repaid      NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص السلف';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE l.status = 'pending')::INTEGER,
    -- ★ «الساري» = approved بمتبقٍّ موجب — لا مفردة `active` مختلَقة
    count(*) FILTER (WHERE l.status = 'approved'
                       AND COALESCE(l.remaining_amount,0) > 0)::INTEGER,
    count(*) FILTER (WHERE l.status = 'paid')::INTEGER,
    count(*) FILTER (WHERE l.status = 'rejected')::INTEGER,
    count(*) FILTER (WHERE l.status = 'cancelled')::INTEGER,
    -- ★ round(…, 2) على 0 الحرفيّ يعطي «0» لا «0.00»: NUMERIC بلا
    --   مقياس. نضع الاحتياطيّ داخل round ليتّسق المقياس في الحالتين.
    round(COALESCE(sum(l.remaining_amount)
      FILTER (WHERE l.status = 'approved'), 0), 2),
    round(COALESCE(sum(l.monthly_installment)
      FILTER (WHERE l.status = 'approved'
                AND COALESCE(l.remaining_amount,0) > 0), 0), 2),
    round(COALESCE(sum(l.amount)
      FILTER (WHERE l.status IN ('approved','paid')), 0), 2),
    round(COALESCE(sum(l.amount - COALESCE(l.remaining_amount,0))
      FILTER (WHERE l.status IN ('approved','paid')), 0), 2)
  FROM public.employee_loans l
  WHERE l.tenant_id = v_tenant;
END $$;

COMMENT ON FUNCTION public.loan_summary() IS
  'بطاقات صفحة السلف. الصفحة كانت تُرشّح بـ status=active و completed '
  'وهما مرفوضتان بـ employee_loans_status_chk ⇒ صفر أبداً.';

REVOKE ALL ON FUNCTION public.loan_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loan_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.loan_summary() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (و) لوحة السلف — الاسم والرمز وحالة السلسلة في استعلام واحد
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.loan_board(TEXT, INTEGER);

CREATE FUNCTION public.loan_board(
  p_status TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_amount        NUMERIC,
  out_remaining     NUMERIC,
  out_installment   NUMERIC,
  out_months_count  INTEGER,
  out_months_paid   INTEGER,
  out_start_date    DATE,
  out_end_date      DATE,
  out_purpose       TEXT,
  out_status        TEXT,
  out_rejection     TEXT,
  out_progress      NUMERIC,
  out_chain_open    INTEGER,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بلوحة السلف';
  END IF;

  -- ★ الحارس يعكس CHECK القاعدة نصّاً: لا 'active' ولا 'completed'
  IF p_status IS NOT NULL
     AND p_status NOT IN ('pending','approved','rejected','paid','cancelled') THEN
    RAISE EXCEPTION 'LOAN_BAD_STATUS: حالة غير معروفة «%» — المسموح: '
      'pending·approved·rejected·paid·cancelled', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.employee_id,
    -- ★ full_name_ar فارغ لكل موظف (مُحقَّق) — سلسلة احتياطية ثلاثية
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             NULLIF(btrim(p.full_name), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, p.department, '—')::TEXT,
    round(l.amount, 2),
    round(COALESCE(l.remaining_amount, 0), 2),
    round(COALESCE(l.monthly_installment, 0), 2),
    COALESCE(l.months_count, 0),
    COALESCE(l.months_paid, 0),
    l.start_date,
    l.end_date,
    l.purpose,
    l.status::TEXT,
    l.rejection_reason,
    -- ★★ التقدّم من المبلغ المسدَّد فعلاً — لا من months_paid وحده.
    --
    --   ★ عطلٌ كشفه التأكيد 7.9: سلفة مرفوضة/معلَّقة متبقّيها 0 لأنها
    --     لم تُصرف أصلاً، فالصيغة (amount − 0) / amount تعطيها **100%**
    --     وشريط تقدّم ممتلئاً على سلفة لم يُدفع منها فلس. التقدّم لا
    --     معنى له إلا لسلفة صُرفت: approved أو paid.
    CASE WHEN l.status IN ('approved','paid') AND COALESCE(l.amount,0) > 0
         THEN round((l.amount - COALESCE(l.remaining_amount,0))
                    / l.amount * 100, 1)
         ELSE 0.0 END,
    (SELECT count(*)::INTEGER
       FROM public.hr_approval_steps s
       JOIN public.hr_approval_requests r ON r.id = s.request_id
      WHERE r.related_id = l.id
        AND r.tenant_id  = v_tenant
        AND s.status IN ('pending','active')),
    l.created_at
  FROM public.employee_loans l
  JOIN public.employees e ON e.id = l.employee_id
  LEFT JOIN public.profiles    p ON p.id = e.user_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  WHERE l.tenant_id = v_tenant
    AND (p_status IS NULL OR l.status = p_status)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

COMMENT ON FUNCTION public.loan_board(TEXT, INTEGER) IS
  'قائمة السلف مع الاسم والقسم وحالة سلسلة الاعتماد. الصفحة كانت '
  'تجلب كل الموظفين وكل السلف وتربطهما في المتصفّح بلا حدّ.';

REVOKE ALL ON FUNCTION public.loan_board(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loan_board(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.loan_board(TEXT, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (ز) قرار على السلفة — يحترم سلسلة الاعتماد (العطل ④)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.loan_decide(UUID, TEXT, TEXT);

CREATE FUNCTION public.loan_decide(
  p_loan_id  UUID,
  p_decision TEXT,
  p_reason   TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_loan   RECORD;
  v_open   INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF p_decision NOT IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'LOAN_BAD_DECISION: القرار «%» غير معروف — '
      'المسموح: approved·rejected·cancelled', p_decision
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بالبتّ في السلف (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_decision IN ('rejected','cancelled')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'LOAN_NO_REASON: سبب الرفض/الإلغاء إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_loan FROM public.employee_loans
   WHERE id = p_loan_id AND tenant_id = v_tenant FOR UPDATE;
  IF v_loan.id IS NULL THEN
    RAISE EXCEPTION 'السلفة غير موجودة في هذا المستأجر';
  END IF;

  -- ★★ لا بتّ على سلفة بُتَّ فيها: pending وحدها قابلة للقرار
  IF v_loan.status <> 'pending' THEN
    RAISE EXCEPTION 'LOAN_ALREADY_DECIDED: السلفة بحالة «%» — '
      'القرار يتطلّب pending', v_loan.status USING ERRCODE = 'check_violation';
  END IF;

  -- ★★★ العطل ④: سلسلة مفتوحة ⇒ القرار عبر صندوق الموافقات وحده.
  --   الصفحة كانت تُصدر UPDATE مباشراً فيرمي المحفّز
  --   APPROVAL_CHAIN_BYPASS وتظهر رسالة خطأ غامضة. الآن رسالة صريحة.
  SELECT count(*)::INTEGER INTO v_open
    FROM public.hr_approval_steps s
    JOIN public.hr_approval_requests r ON r.id = s.request_id
   WHERE r.related_id = p_loan_id
     AND r.tenant_id  = v_tenant
     AND s.status IN ('pending','active');

  IF v_open > 0 AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'LOAN_CHAIN_OPEN: للسلفة سلسلة اعتماد مفتوحة '
      '(% خطوة) — استعمل صندوق الموافقات', v_open
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★★ عطلٌ كشفه التأكيد 7.7: تجاوز admin كان يترك خطوات السلسلة
  --   `active`/`pending` أبداً. الأثر: `out_chain_open` يبقى 1 على
  --   سلفة مبتوتٍ فيها، فتظهر «بانتظار الاعتماد» في صندوق الموافقات
  --   لأحدٍ لا قرار له، وأيّ استعلام عن الطلبات المعلَّقة يعدّها.
  --   نُغلقها بـ`skipped` (مفردة موجودة في hr_approval_steps_status_check)
  --   ونضبط حالة الطلب الأمّ. هذا **أثر تدقيق** لا محو: الخطوة تبقى
  --   بسجلّها وتُعلَّم متخطّاة بقرار إداريّ.
  UPDATE public.hr_approval_steps s
     SET status     = 'skipped',
         comments   = COALESCE(s.comments, '') ||
                      ' [تجاوز إداريّ 0355: بُتَّ في السلفة مباشرةً]',
         decided_at = NOW()
    FROM public.hr_approval_requests r
   WHERE r.id = s.request_id
     AND r.related_id = p_loan_id
     AND r.tenant_id  = v_tenant
     AND s.status IN ('pending','active');

  UPDATE public.hr_approval_requests r
     SET status = CASE WHEN p_decision = 'approved' THEN 'approved'
                       ELSE 'rejected' END
   WHERE r.related_id = p_loan_id
     AND r.tenant_id  = v_tenant
     AND r.status = 'pending';

  PERFORM set_config('kyvzon.approval_sync', 'true', TRUE);

  UPDATE public.employee_loans
     SET status           = p_decision,
         approved_by      = CASE WHEN p_decision = 'approved'
                                 THEN auth.uid() ELSE approved_by END,
         -- ★ المتبقّي يُملأ عند الاعتماد وحده (كان يبقى صفراً)
         remaining_amount = CASE WHEN p_decision = 'approved'
                                 THEN amount ELSE remaining_amount END,
         -- ★ end_date تُحسب في القاعدة لا بـ setMonth
         end_date         = CASE WHEN p_decision = 'approved'
                                 THEN (start_date +
                                       (COALESCE(months_count,1) || ' months')::INTERVAL)::DATE
                                 ELSE end_date END,
         rejection_reason = CASE WHEN p_decision IN ('rejected','cancelled')
                                 THEN btrim(p_reason) ELSE rejection_reason END,
         updated_at       = NOW()
   WHERE id = p_loan_id AND tenant_id = v_tenant;

  PERFORM set_config('kyvzon.approval_sync', 'false', TRUE);

  RETURN p_decision;
END $$;

COMMENT ON FUNCTION public.loan_decide(UUID, TEXT, TEXT) IS
  'بتّ في السلفة. الصفحة كانت تُصدر UPDATE مباشراً فيرمي محفّز '
  'trg_guard_status_bypass لكل سلفة أنشأها موظف (مقيس: '
  'APPROVAL_CHAIN_BYPASS بخطوة واحدة مفتوحة).';

REVOKE ALL ON FUNCTION public.loan_decide(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loan_decide(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.loan_decide(UUID, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (ح) سجلّ تسديدات سلفة واحدة — لنافذة التفاصيل
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.loan_repayment_history(UUID);

CREATE FUNCTION public.loan_repayment_history(p_loan_id UUID)
RETURNS TABLE (
  out_id          UUID,
  out_no          INTEGER,
  out_amount      NUMERIC,
  out_remaining   NUMERIC,
  out_period_name TEXT,
  out_source      TEXT,
  out_created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_owner  UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  SELECT l.employee_id INTO v_owner FROM public.employee_loans l
   WHERE l.id = p_loan_id AND l.tenant_id = v_tenant;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'السلفة غير موجودة في هذا المستأجر';
  END IF;

  -- ★ الموظف يرى سجلّ سلفته هو، والطاقم يرى الجميع
  IF NOT public.current_user_is_staff()
     AND (v_emp IS NULL OR v_emp <> v_owner) THEN
    RAISE EXCEPTION 'غير مصرَّح بسجلّ هذه السلفة';
  END IF;

  RETURN QUERY
  SELECT rp.id, rp.installment_no, round(rp.amount,2),
         round(rp.remaining_after,2),
         COALESCE(pp.name, '—')::TEXT, rp.source, rp.created_at
    FROM public.loan_repayments rp
    LEFT JOIN public.payroll_periods pp ON pp.id = rp.payroll_period_id
   WHERE rp.loan_id = p_loan_id AND rp.tenant_id = v_tenant
   ORDER BY rp.installment_no;
END $$;

COMMENT ON FUNCTION public.loan_repayment_history(UUID) IS
  'سجلّ تسديد سلفة واحدة. لم يكن ممكناً معرفة متى سُدِّد قسط ومن أي '
  'فترة رواتب — لا سجلّ ولا جدول (0355/⑨).';

REVOKE ALL ON FUNCTION public.loan_repayment_history(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loan_repayment_history(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.loan_repayment_history(UUID) TO authenticated;
