-- ============================================================================
-- 0325_financial_request_approvals.sql
--
-- سلسلة اعتماد حقيقية للطلبات المالية للموظف: المصروفات والسلف.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--
--  ① ★ رفض المصروف **يفشل دائماً**.
--     `hr/ExpensesPage.tsx:52` يستدعي:
--        expenseRequestService.rejectRequest(expense.id, reason)
--     والتوقيع الحقيقي:
--        rejectExpense(id: string, approvedBy: string)
--        → update(id, { approved_by: approvedBy, ... })
--     أي أن **سبب الرفض النصّي يُكتب في عمود UUID**.
--
--     مقيس على Postgres:
--        invalid input syntax for type uuid: "المبلغ مرتفع"
--     الرفض لم ينجح ولا مرة واحدة منذ كُتب.
--
--  ② ★ اعتماد السلفة **يفشل دائماً**.
--     `hr/LoansPage.tsx:77` يستدعي `approveLoan(loan.id, '')` — سلسلة
--     فارغة في عمود `approved_by UUID`.
--
--     مقيس:  invalid input syntax for type uuid: ""
--            حالة السلفة = pending   (بعد «تمت الموافقة» في الواجهة)
--
--     الواجهة تُظهر «تمت الموافقة على السلفة» ثم تُعيد التحميل فتجد
--     الحالة كما هي. رسالة نجاح كاذبة.
--
--  ③ ★ عمود غير موجود: `reviewed_at`.
--     `FinanceService.approveExpense/rejectExpense` يكتبان `reviewed_at`
--     والعمود الحقيقي `approved_at`.
--     مقيس: column "reviewed_at" of relation "expense_requests" does not exist
--
--  ④ ★ تعارض مفردات الحالة.
--     الخدمة تكتب `'موافق'`/`'مرفوض'` (عربي) بينما
--     `MyExpensesPage.normalizeStatus` تُطبّع لـ`approved`/`rejected`
--     و`employee_loans` يكتب `'approved'` (إنجليزي).
--     جدولان متجاوران بمفردتين مختلفتين.
--     مقيس: status المخزَّن = «موافق» · يطابق فلتر approved؟ f
--
--  ⑤ ★ لا سلسلة اعتماد إطلاقاً.
--     مقيس: unified_approvals يشمل expense؟ 0
--            دوال تخصّ المصروفات = 0
--     موظف الموارد البشرية يعتمد أي مبلغ منفرداً — لا مشرف ولا مدير
--     ولا حدّ مالي. `approval_rules` فيه `min_amount`/`max_amount`
--     ولم يُستعملا لهذين الجدولين.
--
--  ⑥ `LoansPage.handleApprove` يحسب `end` ثم **يُهمله**:
--        const end = new Date(loan.start_date);
--        end.setMonth(end.getMonth() + loan.months_count);
--        await employeeLoanService.approveLoan(loan.id, '');   ← لا تُمرَّر
--     مقيس: end_date = NULL بعد الاعتماد · remaining_amount = 0 رغم amount=3000
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   لا محرّك موازٍ. نوسّع `unified_approvals` بفرعين جديدين ونعيد استعمال
--   `build_approval_steps` + `unified_approval_steps` + محفّز الإشعارات
--   (0323) + حارس التجاوز (0324). المبلغ يُمرَّر فتعمل قواعد
--   `min_amount`/`max_amount` تلقائياً.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① توحيد مفردات الحالة — عطل ④
--
--    نعتمد الإنجليزية: هي ما يستعمله `employee_loans` أصلاً وما تتوقّعه
--    `normalizeStatus` في الواجهة وما يفهمه محرّك الموافقات.
--    القيم العربية القديمة تُرحَّل ثم يمنعها قيد CHECK.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.expense_requests
   SET status = CASE
         WHEN status IN ('موافق','موافق عليه') THEN 'approved'
         WHEN status = 'مرفوض'                 THEN 'rejected'
         WHEN status = 'انتظار'                THEN 'pending'
         WHEN status = 'مدفوع'                 THEN 'paid'
         WHEN status = 'ملغي'                  THEN 'cancelled'
         ELSE status END
 WHERE status IN ('موافق','موافق عليه','مرفوض','انتظار','مدفوع','ملغي');

UPDATE public.employee_loans
   SET status = CASE
         WHEN status IN ('موافق','موافق عليه') THEN 'approved'
         WHEN status = 'مرفوض'                 THEN 'rejected'
         WHEN status = 'انتظار'                THEN 'pending'
         WHEN status = 'مسدد'                  THEN 'paid'
         WHEN status = 'ملغي'                  THEN 'cancelled'
         ELSE status END
 WHERE status IN ('موافق','موافق عليه','مرفوض','انتظار','مسدد','ملغي');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_requests_status_chk') THEN
    ALTER TABLE public.expense_requests
      ADD CONSTRAINT expense_requests_status_chk
      CHECK (status IN ('pending','approved','rejected','paid','cancelled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_loans_status_chk') THEN
    ALTER TABLE public.employee_loans
      ADD CONSTRAINT employee_loans_status_chk
      CHECK (status IN ('pending','approved','rejected','paid','cancelled'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ② توسيع hr_approval_requests لأنواع الطلبات المالية
--
--    القيد كان: request_type IN ('leave','permission') فقط.
--    نُعيد استعمال نفس الجدول بدل إنشاء جدول موازٍ: محفّز الإشعارات
--    (0323) وصندوق الوارد (my_approval_inbox) يقرآنه أصلاً.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_approval_requests
  DROP CONSTRAINT IF EXISTS hr_approval_requests_request_type_check;

ALTER TABLE public.hr_approval_requests
  ADD CONSTRAINT hr_approval_requests_request_type_check
  CHECK (request_type IN ('leave','permission','expense','loan'));

-- المبلغ يُخزَّن على الطلب: تحتاجه قواعد min_amount/max_amount والعرض
ALTER TABLE public.hr_approval_requests
  ADD COLUMN IF NOT EXISTS amount NUMERIC;

COMMENT ON COLUMN public.hr_approval_requests.amount IS
  'مبلغ الطلب المالي — تستعمله قواعد approval_rules ذات الحدّين '
  'min_amount/max_amount. NULL لطلبات الإجازة والإذن.';

-- ─────────────────────────────────────────────────────────────────────────
-- ③ إنشاء سلسلة اعتماد لطلب مالي — عطل ⑤
--
--    يعكس create_hr_approval لكن بمسارين:
--      · قواعد approval_rules إن وُجدت لوحدة 'finance' ⇒ سلسلة بالمبلغ
--      · وإلا سلسلة القسم (مشرف → مدير → مدير مباشر) كاحتياطي
--
--    VOLATILE: تكتب. (درس 0320 — الكتابة مستحيلة في STABLE)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_financial_request_approval(TEXT, UUID, UUID, NUMERIC);

CREATE FUNCTION public.create_financial_request_approval(
  p_request_type TEXT,      -- 'expense' | 'loan'
  p_related_id   UUID,
  p_employee_id  UUID,
  p_amount       NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_dept     UUID;
  v_req_id   UUID;
  v_order    INT := 0;
  v_chain    RECORD;
  v_rule     RECORD;
  v_approver UUID;
  v_roles    TEXT[];
  v_people   UUID[];
  i          INT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_request_type NOT IN ('expense','loan') THEN
    RAISE EXCEPTION 'INVALID_REQUEST_TYPE (%)', p_request_type;
  END IF;
  IF p_related_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REFERENCE';
  END IF;

  SELECT e.department_id INTO v_dept
    FROM public.employees e WHERE e.id = p_employee_id;

  INSERT INTO public.hr_approval_requests
    (tenant_id, request_type, related_id, employee_id, department_id, amount)
  VALUES (v_tenant, p_request_type, p_related_id, p_employee_id, v_dept, p_amount)
  RETURNING id INTO v_req_id;

  -- ══ المسار (أ): قواعد المبلغ لوحدة المالية ═══════════════════════════
  --    هنا تعمل min_amount/max_amount: سلفة 500 قد تحتاج مديراً واحداً
  --    و50,000 تحتاج ثلاثة مستويات.
  FOR v_rule IN
    SELECT c.out_level, c.out_required_role, c.out_approver_id, c.out_rule_name
      FROM public.resolve_approval_chain('finance', v_dept, COALESCE(p_amount,0)) c
     ORDER BY c.out_level
  LOOP
    -- مستوى بلا شاغل يُتخطّى: خطوة معلَّقة بلا معتمِد تُجمّد الطلب أبداً
    IF v_rule.out_approver_id IS NULL THEN CONTINUE; END IF;

    v_order := v_order + 1;
    INSERT INTO public.hr_approval_steps
      (request_id, tenant_id, step_order, approver_role, approver_id, status)
    VALUES (v_req_id, v_tenant, v_order,
            v_rule.out_required_role, v_rule.out_approver_id,
            CASE WHEN v_order = 1 THEN 'active' ELSE 'pending' END);
  END LOOP;

  -- ══ المسار (ب): سلسلة القسم كاحتياطي ═════════════════════════════════
  --    بلا قواعد مُعرَّفة لا يجوز أن يُعتمد الطلب تلقائياً: هذا مالٌ.
  IF v_order = 0 THEN
    SELECT * INTO v_chain FROM public.resolve_department_chain(v_dept);
    v_people := ARRAY[v_chain.supervisor_id, v_chain.manager_id, v_chain.direct_manager_id];
    v_roles  := ARRAY['supervisor','manager','direct_manager'];

    FOR i IN 1..3 LOOP
      v_approver := v_people[i];
      IF v_approver IS NOT NULL THEN
        v_order := v_order + 1;
        INSERT INTO public.hr_approval_steps
          (request_id, tenant_id, step_order, approver_role, approver_id, status)
        VALUES (v_req_id, v_tenant, v_order, v_roles[i], v_approver,
                CASE WHEN v_order = 1 THEN 'active' ELSE 'pending' END);
      END IF;
    END LOOP;
  END IF;

  -- ★ لا معتمِد إطلاقاً ⇒ الطلب يبقى pending ولا يُعتمد تلقائياً.
  --   في HR الاعتماد التلقائي مقبول لإجازة بلا مدير؛ هنا مالٌ يُصرَف.
  --   detect_approval_rule_gaps تُنبّه المسؤول على هذه الحالة.
  IF v_order > 0 THEN
    UPDATE public.hr_approval_requests SET current_step = 1 WHERE id = v_req_id;
  END IF;

  RETURN v_req_id;
END $$;

COMMENT ON FUNCTION public.create_financial_request_approval(TEXT,UUID,UUID,NUMERIC) IS
  'سلسلة اعتماد للمصروفات والسلف بقواعد المبلغ (approval_rules) أو سلسلة '
  'القسم. قبل 0325 لم تكن هناك سلسلة إطلاقاً: HR يعتمد أي مبلغ منفرداً.';

REVOKE ALL ON FUNCTION public.create_financial_request_approval(TEXT,UUID,UUID,NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_request_approval(TEXT,UUID,UUID,NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_financial_request_approval(TEXT,UUID,UUID,NUMERIC)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ مزامنة الجدول المالي بعد اكتمال السلسلة — يوسّع 0323
--
--    يعالج ⑥ أيضاً: end_date و remaining_amount تُحسبان في القاعدة
--    لا في المتصفح (الصفحة كانت تحسب end ثم تُهمله).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sync_hr_source_status(UUID, TEXT);

CREATE FUNCTION public.sync_hr_source_status(
  p_request_id UUID,
  p_final      TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type    TEXT;
  v_related UUID;
  v_tenant  UUID;
  v_label   TEXT;
  v_n       INTEGER := 0;
BEGIN
  IF p_request_id IS NULL OR p_final NOT IN ('approved','rejected') THEN
    RETURN 0;
  END IF;

  SELECT r.request_type, r.related_id, r.tenant_id
    INTO v_type, v_related, v_tenant
    FROM public.hr_approval_requests r
   WHERE r.id = p_request_id;

  IF v_related IS NULL THEN RETURN 0; END IF;

  -- ★ علَم المزامنة: يُخبر حارس 0324 أن الكتابة من المحرّك.
  --   محلّي للمعاملة (is_local = TRUE) فلا يتسرّب.
  PERFORM set_config('kyvzon.approval_sync', 'true', TRUE);

  IF v_type = 'leave' THEN
    -- الإجازات والأذونات تحتفظان بمفرداتهما العربية: هي ما تقرؤه شاشاتهما
    v_label := CASE WHEN p_final = 'approved' THEN 'موافق' ELSE 'مرفوض' END;
    UPDATE public.leaves SET status = v_label
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_type = 'permission' THEN
    v_label := CASE WHEN p_final = 'approved' THEN 'موافق' ELSE 'مرفوض' END;
    UPDATE public.permissions_request SET status = v_label
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_type = 'expense' THEN
    -- ★ المفردات الإنجليزية بعد توحيد 0325/①
    UPDATE public.expense_requests
       SET status      = p_final,
           approved_at = CASE WHEN p_final = 'approved' THEN NOW() ELSE approved_at END,
           updated_at  = NOW()
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_type = 'loan' THEN
    -- ★ end_date و remaining_amount تُحسبان هنا (عطل ⑥):
    --   الصفحة كانت تحسب end ثم تُهمله، وremaining يبقى 0 رغم المبلغ.
    UPDATE public.employee_loans
       SET status           = p_final,
           end_date         = CASE
                                WHEN p_final = 'approved'
                                THEN (start_date + (COALESCE(months_count,1) || ' months')::INTERVAL)::DATE
                                ELSE end_date END,
           remaining_amount = CASE
                                WHEN p_final = 'approved' THEN amount
                                ELSE remaining_amount END,
           updated_at       = NOW()
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  PERFORM set_config('kyvzon.approval_sync', 'false', TRUE);

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.sync_hr_source_status(UUID, TEXT) IS
  'يكتب نتيجة السلسلة في الجدول الأصلي: leaves · permissions_request '
  '(عربي) · expense_requests · employee_loans (إنجليزي). يحسب end_date '
  'و remaining_amount للسلفة — كانت الصفحة تحسبهما وتُهملهما (0325/⑥).';

REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_hr_source_status(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ توسيع حارس التجاوز ليشمل الجدولين الماليين — يوسّع 0324
--
--    نفس منطق الحارس: سلسلة مفتوحة ⇒ لا كتابة مباشرة للحالة.
--    الحارس عامّ أصلاً (يقرأ hr_approval_steps عبر related_id) فيكفي
--    تعليقه على الجدولين.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_guard_status_bypass ON public.expense_requests;
CREATE TRIGGER trg_guard_status_bypass
  BEFORE UPDATE OF status ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_request_status_bypass();

DROP TRIGGER IF EXISTS trg_guard_status_bypass ON public.employee_loans;
CREATE TRIGGER trg_guard_status_bypass
  BEFORE UPDATE OF status ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_request_status_bypass();

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ توسيع unified_approvals بفرعي المصروفات والسلف
--
--    السياسات لا تعتمد على العرض، لكن نُسقطه صراحةً: CREATE OR REPLACE
--    VIEW يرفض تغيير ترتيب/أنواع الأعمدة.
-- ─────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.unified_approvals CASCADE;

CREATE VIEW public.unified_approvals AS
  SELECT 'hr'::TEXT AS source_module, r.id AS source_id, r.tenant_id,
         r.request_type,
         CASE r.request_type WHEN 'leave' THEN 'طلب إجازة' ELSE 'طلب إذن' END AS title,
         public.resolve_person_user_id(r.employee_id) AS requester_id,
         r.department_id, NULL::NUMERIC AS amount, r.status, r.related_id,
         r.created_at, 'hr'::TEXT AS unit_key
    FROM public.hr_approval_requests r
   WHERE r.status = 'pending' AND r.request_type IN ('leave','permission')

  UNION ALL
  -- ★ فرع جديد: الطلبات المالية للموظف (0325)
  SELECT 'employee_finance'::TEXT, r.id, r.tenant_id,
         r.request_type,
         CASE r.request_type WHEN 'expense' THEN 'طلب صرف مصروف'
                             ELSE 'طلب سلفة' END,
         public.resolve_person_user_id(r.employee_id),
         r.department_id, r.amount, r.status, r.related_id,
         r.created_at, 'finance'::TEXT
    FROM public.hr_approval_requests r
   WHERE r.status = 'pending' AND r.request_type IN ('expense','loan')

  UNION ALL
  SELECT 'procurement'::TEXT, r.id, r.tenant_id, r.request_type,
         'طلب شراء'::TEXT, r.requester_id, r.department_id,
         r.total_amount, r.status, r.related_id, r.created_at,
         'procurement'::TEXT
    FROM public.procurement_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  SELECT 'finance'::TEXT, r.id, r.tenant_id, r.request_type::TEXT,
         CASE r.request_type
           WHEN 'journal_entry' THEN 'قيد محاسبي'
           WHEN 'invoice'       THEN 'فاتورة'
           WHEN 'expense'       THEN 'مصروف'
           WHEN 'budget'        THEN 'موازنة'
           ELSE 'إقرار ضريبي' END,
         r.requested_by, NULL::UUID, NULL::NUMERIC, r.status::TEXT,
         r.reference_id, r.created_at, 'finance'::TEXT
    FROM public.financial_approval_requests r
   WHERE r.status::TEXT = 'pending'

  UNION ALL
  SELECT 'contracts'::TEXT, r.id, r.tenant_id, 'contract'::TEXT,
         'اعتماد عقد'::TEXT, r.requested_by, NULL::UUID, NULL::NUMERIC,
         r.status, r.contract_id, r.created_at, 'contracts'::TEXT
    FROM public.contract_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  SELECT 'movement'::TEXT, a.id, a.tenant_id, 'movement_permit'::TEXT,
         'تصريح خروج'::TEXT,
         public.resolve_person_user_id(
           (SELECT p.employee_id FROM public.employee_movement_permits p
             WHERE p.id = a.permit_id)),
         NULL::UUID, NULL::NUMERIC, a.decision, a.permit_id, a.created_at,
         'movement'::TEXT
    FROM public.employee_movement_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  SELECT 'inventory'::TEXT, a.id, a.tenant_id, 'stock_adjustment'::TEXT,
         'اعتماد تسوية مخزون'::TEXT, a.approver_id, NULL::UUID, NULL::NUMERIC,
         a.decision, a.variance_id, a.created_at, 'inventory'::TEXT
    FROM public.inventory_adjustment_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  SELECT 'mrp'::TEXT, a.id, a.tenant_id, 'bom_version'::TEXT,
         'اعتماد قائمة مواد'::TEXT, a.approver_id, NULL::UUID, NULL::NUMERIC,
         a.decision, a.bom_version_id, a.created_at, 'mrp'::TEXT
    FROM public.mrp_bom_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  SELECT 'crm'::TEXT, a.id, a.tenant_id, 'discount'::TEXT,
         'اعتماد خصم'::TEXT, a.requested_by, NULL::UUID, a.deal_value,
         a.status, a.quote_id, a.created_at, 'crm'::TEXT
    FROM public.crm_discount_approvals a
   WHERE a.status = 'pending'

  UNION ALL
  SELECT 'general'::TEXT, r.id, r.tenant_id, r.request_type::TEXT,
         r.title::TEXT, public.resolve_person_user_id(r.requester_id),
         NULL::UUID, NULL::NUMERIC, r.status::TEXT, r.related_id,
         r.created_at, 'hr'::TEXT
    FROM public.approval_requests r
   WHERE r.status::TEXT = 'pending';

COMMENT ON VIEW public.unified_approvals IS
  'كل الطلبات المعلَّقة عبر البوابات. 0325 أضاف فرع employee_finance '
  '(المصروفات والسلف) بالمبلغ ليعمل تدرّج approval_rules.';

REVOKE ALL ON public.unified_approvals FROM PUBLIC;
REVOKE ALL ON public.unified_approvals FROM anon;
GRANT SELECT ON public.unified_approvals TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ approval_source_info: فرع الطلبات المالية — يوسّع 0323
--
--    العرض يُصفّي pending فلا يصلح بعد القرار؛ نقرأ الجدول الأساسي.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approval_source_info(TEXT, UUID);

CREATE FUNCTION public.approval_source_info(
  p_source_module TEXT,
  p_source_id     UUID
) RETURNS TABLE(
  out_tenant_id    UUID,
  out_requester_id UUID,
  out_title        TEXT,
  out_unit_key     TEXT,
  out_status       TEXT,
  out_related_id   UUID
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source_id IS NULL THEN RETURN; END IF;

  IF p_source_module = 'hr' THEN
    RETURN QUERY
      SELECT r.tenant_id, public.resolve_person_user_id(r.employee_id),
             CASE r.request_type WHEN 'leave' THEN 'طلب إجازة' ELSE 'طلب إذن' END,
             'hr'::TEXT, r.status, r.related_id
        FROM public.hr_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'employee_finance' THEN
    RETURN QUERY
      SELECT r.tenant_id, public.resolve_person_user_id(r.employee_id),
             (CASE r.request_type WHEN 'expense' THEN 'طلب صرف مصروف'
                                  ELSE 'طلب سلفة' END
              || COALESCE(' بمبلغ ' || r.amount::TEXT, ''))::TEXT,
             'finance'::TEXT, r.status, r.related_id
        FROM public.hr_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'procurement' THEN
    RETURN QUERY
      SELECT r.tenant_id, r.requester_id, 'طلب شراء'::TEXT,
             'procurement'::TEXT, r.status, r.related_id
        FROM public.procurement_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'finance' THEN
    RETURN QUERY
      SELECT r.tenant_id, r.requested_by,
             CASE r.request_type
               WHEN 'journal_entry' THEN 'قيد محاسبي'
               WHEN 'invoice'       THEN 'فاتورة'
               WHEN 'expense'       THEN 'مصروف'
               WHEN 'budget'        THEN 'موازنة'
               ELSE 'إقرار ضريبي' END::TEXT,
             'finance'::TEXT, r.status::TEXT, r.reference_id
        FROM public.financial_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'contracts' THEN
    RETURN QUERY
      SELECT r.tenant_id, r.requested_by, 'اعتماد عقد'::TEXT,
             'contracts'::TEXT, r.status, r.contract_id
        FROM public.contract_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'movement' THEN
    RETURN QUERY
      SELECT a.tenant_id,
             public.resolve_person_user_id(
               (SELECT p.employee_id FROM public.employee_movement_permits p
                 WHERE p.id = a.permit_id)),
             'تصريح خروج'::TEXT, 'movement'::TEXT, a.decision, a.permit_id
        FROM public.employee_movement_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'inventory' THEN
    RETURN QUERY
      SELECT a.tenant_id, a.approver_id, 'اعتماد تسوية مخزون'::TEXT,
             'inventory'::TEXT, a.decision, a.variance_id
        FROM public.inventory_adjustment_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'mrp' THEN
    RETURN QUERY
      SELECT a.tenant_id, a.approver_id, 'اعتماد قائمة مواد'::TEXT,
             'mrp'::TEXT, a.decision, a.bom_version_id
        FROM public.mrp_bom_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'crm' THEN
    RETURN QUERY
      SELECT a.tenant_id, a.requested_by, 'اعتماد خصم'::TEXT,
             'crm'::TEXT, a.status, a.quote_id
        FROM public.crm_discount_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'general' THEN
    RETURN QUERY
      SELECT r.tenant_id, public.resolve_person_user_id(r.requester_id),
             r.title::TEXT, 'hr'::TEXT, r.status::TEXT, r.related_id
        FROM public.approval_requests r WHERE r.id = p_source_id;
  END IF;
END $$;

COMMENT ON FUNCTION public.approval_source_info(TEXT, UUID) IS
  'بيانات الطلب من جدوله الأصلي بصرف النظر عن حالته. 0325 أضاف '
  'employee_finance مع المبلغ في العنوان.';

REVOKE ALL ON FUNCTION public.approval_source_info(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approval_source_info(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approval_source_info(TEXT, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑧ المحفّز الموحّد: تعيين وحدة الطلبات المالية
--
--    hr_approval_steps يخدم الآن نوعين من الطلبات، فلا يصحّ افتراض 'hr'.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_notify_approval_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module  TEXT;
  v_request UUID;
  v_tenant  UUID;
  v_src     RECORD;
  v_open    INT;
  v_reject  INT;
  v_final   TEXT;
  v_rtype   TEXT;
BEGIN
  IF TG_TABLE_NAME = 'unified_approval_steps' THEN
    v_module := NEW.source_module::TEXT; v_request := NEW.source_id;
    v_tenant := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'hr_approval_steps' THEN
    -- ★ الوحدة تعتمد نوع الطلب: hr للإجازات · employee_finance للمالية
    SELECT r.request_type INTO v_rtype
      FROM public.hr_approval_requests r WHERE r.id = NEW.request_id;
    v_module := CASE WHEN v_rtype IN ('expense','loan')
                     THEN 'employee_finance' ELSE 'hr' END;
    v_request := NEW.request_id; v_tenant := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'procurement_approval_steps' THEN
    v_module := 'procurement'; v_request := NEW.request_id; v_tenant := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'contract_approval_steps' THEN
    v_module := 'contracts';   v_request := NEW.request_id; v_tenant := NEW.tenant_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT * INTO v_src FROM public.approval_source_info(v_module, v_request);
  IF v_tenant IS NULL THEN v_tenant := v_src.out_tenant_id; END IF;

  -- ══ (أ) الخطوة صارت نشطة ⇒ أَشعِر صاحبها وحده ═══════════════════════
  IF NEW.approver_id IS NOT NULL
     AND COALESCE(NEW.status::TEXT,'') = 'active'
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.status::TEXT,'') IS DISTINCT FROM 'active')
  THEN
    PERFORM public.notify_user(
      v_tenant, NEW.approver_id, 'approval_pending',
      'طلب بانتظار اعتمادك',
      COALESCE(v_src.out_title, 'طلب جديد') || ' — يحتاج قرارك',
      '/app/manager/approvals',
      TG_TABLE_NAME, v_request);
  END IF;

  -- ══ (ب) هل اكتملت السلسلة؟ (UPDATE فقط — درس السباق الزمني 0322) ═══
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.status::TEXT,'') IN ('approved','rejected')
     AND COALESCE(OLD.status::TEXT,'') IS DISTINCT FROM COALESCE(NEW.status::TEXT,'')
  THEN
    IF TG_TABLE_NAME = 'unified_approval_steps' THEN
      SELECT count(*) FILTER (WHERE s.status::TEXT IN ('pending','active')),
             count(*) FILTER (WHERE s.status::TEXT = 'rejected')
        INTO v_open, v_reject
        FROM public.unified_approval_steps s
       WHERE s.source_module = NEW.source_module AND s.source_id = NEW.source_id;
    ELSIF TG_TABLE_NAME = 'hr_approval_steps' THEN
      SELECT count(*) FILTER (WHERE s.status IN ('pending','active')),
             count(*) FILTER (WHERE s.status = 'rejected')
        INTO v_open, v_reject
        FROM public.hr_approval_steps s WHERE s.request_id = NEW.request_id;
    ELSIF TG_TABLE_NAME = 'procurement_approval_steps' THEN
      SELECT count(*) FILTER (WHERE s.status IN ('pending','active')),
             count(*) FILTER (WHERE s.status = 'rejected')
        INTO v_open, v_reject
        FROM public.procurement_approval_steps s WHERE s.request_id = NEW.request_id;
    ELSE
      SELECT count(*) FILTER (WHERE s.status IN ('pending','active')),
             count(*) FILTER (WHERE s.status = 'rejected')
        INTO v_open, v_reject
        FROM public.contract_approval_steps s WHERE s.request_id = NEW.request_id;
    END IF;

    IF v_reject > 0 OR v_open = 0 THEN
      v_final := CASE WHEN v_reject > 0 THEN 'rejected' ELSE 'approved' END;

      PERFORM public.notify_approval_decided(
        v_module, v_request, v_final, NEW.comments);

      -- ★ المزامنة تشمل الآن الطلبات المالية
      IF v_module IN ('hr','employee_finance') THEN
        PERFORM public.sync_hr_source_status(v_request, v_final);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_notify_approval_step() IS
  'محفّز موحّد على جداول الخطوات الأربعة. 0325: hr_approval_steps يخدم '
  'الإجازات والطلبات المالية معاً، فالوحدة تُشتقّ من request_type.';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑨ unified_approval_decide: تفويض الطلبات المالية لسلسلة HR
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unified_approval_decide(
  p_source_module TEXT,
  p_source_id     UUID,
  p_decision      TEXT,
  p_comments      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant    UUID := public.current_user_tenant_id();
  v_unit      TEXT;
  v_requester UUID;
  v_platform  BOOLEAN;
  v_active    RECORD;
  v_next      RECORD;
  v_steps     INT;
  v_final     TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION (%)', p_decision;
  END IF;

  SELECT u.unit_key, u.requester_id INTO v_unit, v_requester
    FROM public.unified_approvals u
   WHERE u.source_module = p_source_module
     AND u.source_id     = p_source_id
     AND u.tenant_id     = v_tenant;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND_OR_DECIDED';
  END IF;

  v_platform := public.current_user_role() IN ('admin','developer','it_admin');

  -- ══ سلاسل البوابات الخاصة لها الأولوية ══════════════════════════════
  --    ★ employee_finance يبني في hr_approval_steps كذلك (0325)
  IF p_source_module IN ('hr','employee_finance') THEN
    SELECT count(*) INTO v_steps FROM public.hr_approval_steps
     WHERE request_id = p_source_id AND tenant_id = v_tenant;
    IF v_steps > 0 THEN
      RETURN public.decide_hr_approval_step(p_source_id, p_decision, p_comments);
    END IF;
  ELSIF p_source_module = 'procurement' THEN
    SELECT count(*) INTO v_steps FROM public.procurement_approval_steps
     WHERE request_id = p_source_id AND tenant_id = v_tenant;
    IF v_steps > 0 THEN
      RETURN public.approve_procurement_step(p_source_id, p_decision, p_comments);
    END IF;
  END IF;

  -- ══ المحرّك الموحّد ═══════════════════════════════════════════════════
  SELECT count(*) INTO v_steps
    FROM public.unified_approval_steps s
   WHERE s.tenant_id = v_tenant
     AND s.source_module = p_source_module
     AND s.source_id = p_source_id;

  IF v_steps > 0 THEN
    SELECT * INTO v_active
      FROM public.unified_approval_steps s
     WHERE s.tenant_id = v_tenant
       AND s.source_module = p_source_module
       AND s.source_id = p_source_id
       AND s.status = 'active'
     ORDER BY s.step_order LIMIT 1;

    IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_STEP'; END IF;

    IF NOT v_platform AND v_active.approver_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'NOT_YOUR_STEP (step %, assigned to another approver)',
        v_active.step_order;
    END IF;

    UPDATE public.unified_approval_steps
       SET status = p_decision,
           comments = COALESCE(NULLIF(btrim(p_comments),''), comments),
           decided_by = auth.uid(), decided_at = NOW()
     WHERE id = v_active.id;

    IF p_decision = 'rejected' THEN
      UPDATE public.unified_approval_steps SET status = 'skipped'
       WHERE tenant_id = v_tenant AND source_module = p_source_module
         AND source_id = p_source_id AND status = 'pending';
      v_final := 'rejected';
    ELSE
      SELECT * INTO v_next
        FROM public.unified_approval_steps s
       WHERE s.tenant_id = v_tenant AND s.source_module = p_source_module
         AND s.source_id = p_source_id AND s.step_order > v_active.step_order
         AND s.status = 'pending'
       ORDER BY s.step_order LIMIT 1;

      IF FOUND THEN
        UPDATE public.unified_approval_steps SET status = 'active' WHERE id = v_next.id;
        RETURN 'pending';
      END IF;

      v_final := 'approved';
    END IF;
  ELSE
    IF NOT v_platform THEN
      IF NOT public.has_portal_unit('manager', v_unit) THEN
        RAISE EXCEPTION 'NOT_ASSIGNED_TO_UNIT (manager/%)', v_unit;
      END IF;
      IF v_requester IS NOT NULL AND NOT public.is_in_my_team(v_requester) THEN
        RAISE EXCEPTION 'REQUESTER_NOT_IN_MY_TEAM';
      END IF;
    END IF;
    v_final := p_decision;
  END IF;

  -- ── كتابة الحالة النهائية في جدول البوابة ───────────────────────────
  CASE p_source_module
    WHEN 'hr' THEN
      UPDATE public.hr_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;
      PERFORM public.sync_hr_source_status(p_source_id, v_final);

    WHEN 'employee_finance' THEN
      UPDATE public.hr_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;
      PERFORM public.sync_hr_source_status(p_source_id, v_final);

    WHEN 'procurement' THEN
      UPDATE public.procurement_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'finance' THEN
      UPDATE public.financial_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'contracts' THEN
      UPDATE public.contract_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'movement' THEN
      UPDATE public.employee_movement_approvals
         SET decision = v_final, decided_at = NOW(), approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;
      UPDATE public.employee_movement_permits p
         SET status = v_final, approved_by = auth.uid(), updated_at = NOW()
        FROM public.employee_movement_approvals a
       WHERE a.id = p_source_id AND p.id = a.permit_id AND p.tenant_id = v_tenant;

    WHEN 'inventory' THEN
      UPDATE public.inventory_adjustment_approvals
         SET decision = v_final, decided_at = NOW(), approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'mrp' THEN
      UPDATE public.mrp_bom_approvals
         SET decision = v_final, decided_at = NOW(), approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'crm' THEN
      UPDATE public.crm_discount_approvals
         SET status = v_final, decided_at = NOW(), decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'general' THEN
      UPDATE public.approval_requests
         SET status = v_final, decided_at = NOW(), decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note),
             updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    ELSE
      RAISE EXCEPTION 'UNKNOWN_SOURCE_MODULE (%)', p_source_module;
  END CASE;

  PERFORM public.notify_approval_decided(
    p_source_module, p_source_id, v_final, p_comments);

  RETURN v_final;
END $$;

COMMENT ON FUNCTION public.unified_approval_decide(TEXT,UUID,TEXT,TEXT) IS
  'قرار موحّد عبر عشر وحدات. 0325 أضاف employee_finance الذي يبني '
  'خطواته في hr_approval_steps.';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑩ رفض الطلب المالي مع سبب — عطل ①
--
--    الواجهة كانت تكتب السبب في approved_by (UUID) فيفشل الرفض دائماً.
--    هنا السبب يذهب لعمود rejection_reason الصحيح.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.record_financial_rejection_reason(UUID, TEXT);

CREATE FUNCTION public.record_financial_rejection_reason(
  p_request_id UUID,
  p_reason     TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_type    TEXT;
  v_related UUID;
  v_n       INT := 0;
BEGIN
  IF v_tenant IS NULL OR p_request_id IS NULL THEN RETURN 0; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RETURN 0; END IF;

  SELECT r.request_type, r.related_id INTO v_type, v_related
    FROM public.hr_approval_requests r
   WHERE r.id = p_request_id AND r.tenant_id = v_tenant;

  IF v_related IS NULL THEN RETURN 0; END IF;

  IF v_type = 'expense' THEN
    UPDATE public.expense_requests
       SET rejection_reason = btrim(p_reason), updated_at = NOW()
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_type = 'loan' THEN
    UPDATE public.employee_loans
       SET rejection_reason = btrim(p_reason), updated_at = NOW()
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.record_financial_rejection_reason(UUID, TEXT) IS
  'يكتب سبب الرفض في rejection_reason. الواجهة كانت تمرّره كوسيط '
  'approvedBy فيُكتب في عمود UUID ويفشل الرفض دائماً (عطل 0325/①).';

REVOKE ALL ON FUNCTION public.record_financial_rejection_reason(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_financial_rejection_reason(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_financial_rejection_reason(UUID, TEXT)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑪ ★ my_approval_inbox: وحدة الخطوة تُشتقّ من نوع الطلب — عطل ⑦
--
--    اكتُشف بالتشغيل بعد تطبيق بقية 0325: المشرف صاحب الخطوة النشطة
--    لطلب مالي رأى **صندوقاً فارغاً**.
--        صندوق المشرف = 0   (وهو صاحب الخطوة active)
--
--    السبب: الدالة تُثبّت `'hr'` لكل صفوف hr_approval_steps:
--        SELECT 'hr', s.request_id, ... FROM hr_approval_steps
--    بينما العرض يُصنّف الطلب المالي `employee_finance` ⇒ الوصل
--    (source_module, source_id) لا يتطابق أبداً ⇒ si.source_id IS NULL
--    ⇒ يسقط للمسار القديم الذي يشترط has_portal_unit.
--
--    نفس عائلة العطل ⑦ في 0323 — الفرق أن الوحدة صارت مشتقّة لا ثابتة.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_approval_inbox(TEXT);

CREATE FUNCTION public.my_approval_inbox(p_unit_key TEXT DEFAULT NULL)
RETURNS TABLE(
  out_source_module  TEXT,
  out_source_id      UUID,
  out_request_type   TEXT,
  out_title          TEXT,
  out_requester_id   UUID,
  out_requester_name TEXT,
  out_amount         NUMERIC,
  out_unit_key       TEXT,
  out_created_at     TIMESTAMPTZ,
  out_step_order     INTEGER,
  out_total_steps    INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_platform BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN RETURN; END IF;

  v_platform := public.current_user_role() IN ('admin','developer','it_admin');

  RETURN QUERY
  WITH all_steps AS (
    SELECT s.source_module::TEXT AS source_module, s.source_id,
           s.status::TEXT AS status, s.step_order, s.approver_id
      FROM public.unified_approval_steps s WHERE s.tenant_id = v_tenant
    UNION ALL
    -- ★ hr_approval_steps يخدم الإجازات والطلبات المالية معاً:
    --   الوحدة تُشتقّ من request_type لا تُثبَّت على 'hr'.
    SELECT CASE WHEN r.request_type IN ('expense','loan')
                THEN 'employee_finance' ELSE 'hr' END,
           s.request_id, s.status, s.step_order, s.approver_id
      FROM public.hr_approval_steps s
      JOIN public.hr_approval_requests r ON r.id = s.request_id
     WHERE s.tenant_id = v_tenant
    UNION ALL
    SELECT 'procurement', s.request_id, s.status, s.step_order, s.approver_id
      FROM public.procurement_approval_steps s WHERE s.tenant_id = v_tenant
    UNION ALL
    SELECT 'contracts', s.request_id, s.status, s.step_order, s.approver_id
      FROM public.contract_approval_steps s WHERE s.tenant_id = v_tenant
  ),
  step_info AS (
    SELECT a.source_module, a.source_id,
           count(*)::INTEGER AS total_steps,
           max(CASE WHEN a.status = 'active' THEN a.step_order END)::INTEGER AS active_order,
           max(CASE WHEN a.status = 'active' THEN a.approver_id::TEXT END) AS active_approver
      FROM all_steps a
     GROUP BY a.source_module, a.source_id
  )
  SELECT u.source_module, u.source_id, u.request_type, u.title,
         u.requester_id,
         COALESCE(pr.full_name, pr.email, '—')::TEXT,
         u.amount, u.unit_key, u.created_at,
         COALESCE(si.active_order, 1), COALESCE(si.total_steps, 1)
    FROM public.unified_approvals u
    LEFT JOIN public.profiles pr ON pr.id = u.requester_id
    LEFT JOIN step_info si
      ON si.source_module = u.source_module AND si.source_id = u.source_id
   WHERE u.tenant_id = v_tenant
     AND (p_unit_key IS NULL OR u.unit_key = p_unit_key)
     AND (
       v_platform
       OR (si.source_id IS NOT NULL AND si.active_approver = auth.uid()::TEXT)
       OR (
         si.source_id IS NULL
         AND public.has_portal_unit('manager', u.unit_key)
         AND (u.requester_id IS NULL OR public.is_in_my_team(u.requester_id))
       )
     )
   ORDER BY u.created_at ASC;
END $$;

COMMENT ON FUNCTION public.my_approval_inbox(TEXT) IS
  'صندوق المعتمِد عبر جداول الخطوات الأربعة. 0325: وحدة صفوف '
  'hr_approval_steps تُشتقّ من request_type — كان تثبيتها على hr '
  'يُخفي كل طلب مالي عن صاحب خطوته النشطة (عطل ⑦).';

REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_approval_inbox(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑫ ★ الرفض يُنهي السلسلة — عطل ⑧ (سابق لهذه الجولة، يمسّ الإجازات أيضاً)
--
--    `decide_hr_approval_step` عند الرفض تكتب حالة الطلب فقط:
--        IF p_decision = 'rejected' THEN
--          UPDATE hr_approval_requests SET status='rejected' ...
--    ولا تتخطّى الخطوات المتبقية. النظير الموحّد
--    `unified_approval_decide` يفعلها (SET status='skipped').
--
--    مقيس على إجازة بسلسلة من خطوتين:
--        خطوة 1 (supervisor): rejected
--        خطوة 2 (manager):    pending      ← بقيت مفتوحة
--        خطوات مفتوحة بعد الرفض = 1
--
--    الأثر مضاعف بعد حارس 0324: الحارس يعدّ الخطوات المفتوحة، فيرى
--    واحدة، فيمنع أي تصحيح لاحق للحالة **إلى الأبد** — حتى من HR.
--    الطلب مرفوض وسلسلته معلّقة وحالته محبوسة.
--
--    ★ إفصاح: هذا عطل سابق لجولتي، لكن حارس 0324 الذي كتبتُه ضاعف
--      أثره من «صفّ يتيم في جدول» إلى «حالة محبوسة لا تُصحَّح».
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_hr_approval_step(
  p_request_id UUID,
  p_decision   TEXT,
  p_comments   TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_active RECORD;
  v_next   RECORD;
  v_final  TEXT;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  SELECT * INTO v_active
    FROM public.hr_approval_steps
   WHERE request_id = p_request_id AND status = 'active'
   ORDER BY step_order LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'no active step'; END IF;

  IF v_active.approver_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not authorized for this step';
  END IF;

  UPDATE public.hr_approval_steps
     SET status = p_decision, comments = p_comments, decided_at = NOW()
   WHERE id = v_active.id;

  IF p_decision = 'rejected' THEN
    -- ★ الرفض يُنهي المسار: تخطّي كل خطوة لم تُبتّ.
    --   بدون هذا تبقى خطوات pending فيحسبها حارس 0324 سلسلةً مفتوحة.
    UPDATE public.hr_approval_steps
       SET status = 'skipped'
     WHERE request_id = p_request_id
       AND status IN ('pending','active');

    UPDATE public.hr_approval_requests
       SET status = 'rejected', updated_at = NOW()
     WHERE id = p_request_id;
    v_final := 'rejected';
  ELSE
    SELECT * INTO v_next
      FROM public.hr_approval_steps
     WHERE request_id = p_request_id
       AND step_order > v_active.step_order
       AND status = 'pending'
     ORDER BY step_order LIMIT 1;

    IF FOUND THEN
      UPDATE public.hr_approval_steps SET status = 'active' WHERE id = v_next.id;
      UPDATE public.hr_approval_requests
         SET current_step = v_next.step_order, updated_at = NOW()
       WHERE id = p_request_id;
      v_final := 'pending';
    ELSE
      UPDATE public.hr_approval_requests
         SET status = 'approved', updated_at = NOW()
       WHERE id = p_request_id;
      v_final := 'approved';
    END IF;
  END IF;

  RETURN v_final;
END $$;

COMMENT ON FUNCTION public.decide_hr_approval_step(UUID,TEXT,TEXT) IS
  'قرار خطوة في سلسلة HR (إجازة · إذن · مصروف · سلفة). 0325: الرفض '
  'يتخطّى الخطوات المتبقية — كانت تبقى pending فيحسبها حارس 0324 '
  'سلسلةً مفتوحة ويمنع تصحيح الحالة أبداً (عطل ⑧).';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑬ أرشفة وثيقة الموظف بدل حذفها — عطل ⑨
--
--    `hr/DocumentsPage.tsx:88` كان:
--        if (!confirm(`حذف "${doc.title}"؟`)) return;
--        await employeeDocumentService.deleteDocument(doc.id);   → this.delete(id)
--
--    ثلاث مخالفات: `confirm()` محظور · حذف نهائي · ووثيقة الموظف
--    (عقد · شهادة · إخلاء طرف) دليلٌ قد يُطلب بعد سنوات.
--    الجدول بلا أي عمود حالة، فنضيف أرشفة صريحة.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID;

COMMENT ON COLUMN public.employee_documents.is_archived IS
  'أرشفة الوثيقة بدل حذفها — الوثيقة دليل قد يُطلب بعد سنوات (0325/⑨).';

DROP FUNCTION IF EXISTS public.archive_employee_document(UUID);

CREATE FUNCTION public.archive_employee_document(p_document_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_title  TEXT;
  v_arch   BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF v_role NOT IN ('admin','hr','developer','it_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED (role %)', v_role;
  END IF;

  SELECT d.title, d.is_archived INTO v_title, v_arch
    FROM public.employee_documents d
   WHERE d.id = p_document_id AND d.tenant_id = v_tenant;

  IF v_title IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
  IF v_arch THEN RETURN 'already_archived'; END IF;

  UPDATE public.employee_documents
     SET is_archived = TRUE, archived_at = NOW(),
         archived_by = auth.uid(), updated_at = NOW()
   WHERE id = p_document_id AND tenant_id = v_tenant;

  RETURN 'archived';
END $$;

COMMENT ON FUNCTION public.archive_employee_document(UUID) IS
  'أرشفة وثيقة موظف. كانت الصفحة تحذفها نهائياً بعد confirm() (0325/⑨).';

REVOKE ALL ON FUNCTION public.archive_employee_document(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_employee_document(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_employee_document(UUID) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0325: سلسلة اعتماد الطلبات المالية — 9 أعطال مُصلَحة';
END $$;
