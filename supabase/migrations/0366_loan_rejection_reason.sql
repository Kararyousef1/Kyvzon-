-- ════════════════════════════════════════════════════════════════════════
--  0366 — سبب رفض القرض عبر صندوق الموافقات
--  إغلاق بندٍ معلَّقٍ منذ 0363
-- ════════════════════════════════════════════════════════════════════════
--
--  البند كما دُوِّن في جرد ما تبقّى بعد 0363:
--
--     ★★★ «`sync_hr_source_status` بلا سبب — فرع `loan`»
--     «عالجتُ `expense` في 0363. **`employee_loans` قد يكون فيه العطل
--       نفسه** (رفضٌ بلا تعليل) — **لم يُفحص لأن لا قيد يكشفه**.»
--
--  ★ «قد يكون» صارت **مُثبتة**. المسبار `tools/dev/_probe_0366.sql`
--    على قاعدةٍ نظيفة بـ294 مايجريشناً:
--
--     PROBE_A: employee_loans.rejection_reason | text | YES   ← العمود موجود
--     PROBE_B: يذكر_السبب = **f** · يكتب_الجدول = t
--              (فرع `loan` في `sync_hr_source_status` يكتب
--               `employee_loans` ولا يذكر `rejection_reason` بحرف)
--     PROBE_C: قيود رفضٍ في القروض = **0**  ← ولهذا لم يُكتشف العطل
--     PROBE_D: محفّزات مزامنة السبب = **0**
--
--     PROBE_E (المسار الكامل بدور المدير):
--        قرضٌ مُنشأ ⇒ create_hr_approval('loan', …) ⇒ خطوةٌ واحدة
--        حالتها `1:active/manager/13660001-…`
--        ثم `decide_hr_approval_step(v_req,'rejected',
--                                    'الراتب لا يحتمل هذا القسط')`
--
--        النتيجة: **status = rejected · rejection_reason = <NULL>**
--        والتعليل موجودٌ سليماً في `hr_approval_steps.comments`:
--            [الراتب لا يحتمل هذا القسط]
--
--     ⇒ **رُفض القرض والتعليل ضاع.** الموظف يرى «مرفوض» بلا سبب،
--       والمراجعة لا تجد لماذا. عطلٌ مطابقٌ للعطل ⑲ في 0363 حرفياً.
--
--  ★★ ولماذا بقي مستوراً؟ لأن `expense_requests` اكتسب في 0363 قيد
--    `expense_requests_rejection_chk` فانفجر فوراً وكشف نفسه، بينما
--    `employee_loans` **بلا قيد** فظلّ يبتلع الرفض الصامت. وهذا وجهٌ
--    آخر لدرس التغطية: **القيد لا يحرس فحسب، بل يكشف.**
--
--  ═══════════════════════════════════════════════════════════════════
--  العلاج — نفس نمط 0363 حرفياً
--  ═══════════════════════════════════════════════════════════════════
--
--  ★ لا نُغيّر توقيع `sync_hr_source_status(p_request_id, p_final)`:
--    توقيعٌ جديدٌ يكسر نداءاتها في 0323/0325/0340 و
--    `unified_approval_decide` و`tg_notify_approval_step` و
--    `tg_guard_request_status_bypass` و`create_hr_approval`
--    (خمسة مواضع مُحقَّقة من `pg_proc`).
--
--  ⇒ محفّزٌ يملأ السبب من آخر خطوةٍ رافضة حين تأتي الكتابة بلا سبب.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ① استخراج سبب الرفض من سلسلة الاعتماد
--     نظير `expense_apply_rejection_reason` في 0363
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.loan_apply_rejection_reason(UUID);
CREATE FUNCTION public.loan_apply_rejection_reason(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_reason TEXT;
BEGIN
  -- ★ آخر خطوة رافضة بتعليقٍ غير فارغ — بترتيبٍ حتميّ (درس 0357):
  --   `decided_at` قد يتساوى (طابع المعاملة) فنُذيّله بـstep_order ثم id.
  SELECT NULLIF(btrim(s.comments), '') INTO v_reason
    FROM public.hr_approval_steps s
   WHERE s.request_id = p_request_id
     AND s.status = 'rejected'
     AND NULLIF(btrim(s.comments), '') IS NOT NULL
   ORDER BY s.decided_at DESC NULLS LAST, s.step_order DESC, s.id DESC
   LIMIT 1;

  RETURN COALESCE(v_reason, 'رُفض عبر صندوق الموافقات بلا تعليق');
END $$;

COMMENT ON FUNCTION public.loan_apply_rejection_reason(UUID) IS
  'يستخرج سبب رفض القرض من آخر خطوة رافضة. sync_hr_source_status '
  'توقيعها بلا سبب فكان الرفض عبر الصندوق يضيع تعليله (بند 0363).';

REVOKE ALL ON FUNCTION public.loan_apply_rejection_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loan_apply_rejection_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.loan_apply_rejection_reason(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ② المحفّز — يملأ السبب حين تأتي الكتابة من المزامنة
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_loan_sync_reason()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_req UUID;
BEGIN
  IF NEW.status = 'rejected'
     AND (NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '') THEN
    -- ★ آخر طلب اعتمادٍ لهذا القرض — الترتيب حتميّ
    SELECT r.id INTO v_req
      FROM public.hr_approval_requests r
     WHERE r.related_id = NEW.id
       AND r.tenant_id = NEW.tenant_id
       AND r.request_type = 'loan'
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT 1;
    IF v_req IS NOT NULL THEN
      NEW.rejection_reason := public.loan_apply_rejection_reason(v_req);
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_loan_sync_reason() IS
  'يملأ employee_loans.rejection_reason من تعليق خطوة الرفض حين تأتي '
  'الكتابة من sync_hr_source_status. نظير tg_expense_sync_reason (0363).';

DROP TRIGGER IF EXISTS trg_loan_sync_reason ON public.employee_loans;
CREATE TRIGGER trg_loan_sync_reason
  BEFORE INSERT OR UPDATE OF status ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.tg_loan_sync_reason();

-- ═══════════════════════════════════════════════════════════════════
--  ③ القيد — الذي كان غيابُه سببَ استتار العطل (PROBE_C = 0)
--
--  ★ يُضاف **بعد** المحفّز عمداً: المحفّز يُرضيه في كل مسارٍ آليّ،
--    والقيد يحرس الكتابة المباشرة ويكشف أيّ مسارٍ جديدٍ يُغفل السبب.
--  ★ ونُنظّف الصفوف القائمة أولاً — قد تكون في قاعدة المستخدم.
-- ═══════════════════════════════════════════════════════════════════

UPDATE public.employee_loans l
   SET rejection_reason = COALESCE(
         (SELECT NULLIF(btrim(s.comments), '')
            FROM public.hr_approval_steps s
            JOIN public.hr_approval_requests r ON r.id = s.request_id
           WHERE r.related_id = l.id
             AND r.tenant_id = l.tenant_id
             AND r.request_type = 'loan'
             AND s.status = 'rejected'
             AND NULLIF(btrim(s.comments), '') IS NOT NULL
           ORDER BY s.decided_at DESC NULLS LAST, s.step_order DESC, s.id DESC
           LIMIT 1),
         'رُفض قبل سريان القيد — التعليل غير مُدوَّن')
 WHERE l.status = 'rejected'
   AND (l.rejection_reason IS NULL OR btrim(l.rejection_reason) = '');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.employee_loans'::regclass
       AND conname  = 'chk_employee_loans_rejection_reason'
  ) THEN
    ALTER TABLE public.employee_loans
      ADD CONSTRAINT chk_employee_loans_rejection_reason
      CHECK (status <> 'rejected'
             OR btrim(COALESCE(rejection_reason, '')) <> '');
  END IF;
END $$;

COMMIT;
