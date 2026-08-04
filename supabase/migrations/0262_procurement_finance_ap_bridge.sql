-- ============================================================================
-- 0262 — جسر الفواتير: المشتريات ← بوابة المالية (الذمم الدائنة AP)
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (الفجوة الثانية في تدقيق بوابة المشتريات):
--   فاتورة المورد تُطابَق ثلاثياً وتُعتمد للدفع داخل المشتريات، لكن
--   لا شيء يصل إلى المالية إطلاقاً. فحص كل مايجريشنات المشتريات
--   (0182–0203) بحثاً عن accounts_payable / journal_entries أعطى صفراً.
--
--   النتيجة العملية:
--     ✅ الفاتورة معتمدة في المشتريات
--     ❌ لا تظهر في الذمم الدائنة (AP)
--     ❌ المحاسب يُعيد إدخالها يدوياً → ازدواج عمل وخطر تضارب أرقام
--
--   الجانب المالي جاهز أصلاً: بنينا في 0244 جدول ap_invoice_lines
--   والدالة create_ap_invoice_with_lines. ينقص الربط من طرف المشتريات.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل:
--   1) ربط المورد بحساب المورد المالي (suppliers.finance_vendor_id)
--      وربط الفاتورة بفاتورة AP (supplier_invoices.ap_invoice_id).
--   2) دالة جسر post_supplier_invoice_to_ap تُنشئ فاتورة AP بسطورها.
--   3) استدعاء الجسر تلقائياً عند اعتماد الفاتورة للدفع.
--
-- مبادئ ملتزم بها:
--   • idempotent: لا ترحيل مزدوج لنفس الفاتورة.
--   • لا يُسقط الاعتماد: إن تعذّر الترحيل (لا كيان قانوني أو لا حساب مصروف)
--     يُسجَّل تحذير ويبقى الاعتماد صالحاً، بدل تعطيل عمل المشتريات.
--   • كل شيء مُدقَّق في procurement_audit_events.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) أعمدة الربط
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS finance_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS ap_invoice_id UUID REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ap_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ap_post_error TEXT;

ALTER TABLE public.po_line_items
  ADD COLUMN IF NOT EXISTS expense_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_finance_vendor
  ON public.suppliers(finance_vendor_id) WHERE finance_vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_ap
  ON public.supplier_invoices(ap_invoice_id) WHERE ap_invoice_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) حل الكيان القانوني الافتراضي للمستأجر
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_default_legal_entity()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_entity UUID;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_entity FROM public.legal_entities
   WHERE tenant_id = v_tenant AND COALESCE(status, 'active') = 'active'
   ORDER BY (code = 'DEFAULT') DESC, created_at
   LIMIT 1;
  RETURN v_entity;
END $$;
REVOKE ALL ON FUNCTION public.resolve_default_legal_entity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_default_legal_entity() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) حل/إنشاء حساب المورد المالي المقابل لمورد المشتريات
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_finance_vendor_for_supplier(
  p_supplier_id UUID,
  p_legal_entity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_supplier RECORD;
  v_entity UUID;
  v_vendor_id UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_supplier FROM public.suppliers
   WHERE id = p_supplier_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_NOT_FOUND'; END IF;

  IF v_supplier.finance_vendor_id IS NOT NULL THEN
    RETURN v_supplier.finance_vendor_id;
  END IF;

  v_entity := COALESCE(p_legal_entity_id, public.resolve_default_legal_entity());
  IF v_entity IS NULL THEN RAISE EXCEPTION 'NO_LEGAL_ENTITY'; END IF;

  -- مطابقة بالكود داخل نفس الكيان
  SELECT id INTO v_vendor_id FROM public.vendors
   WHERE legal_entity_id = v_entity
     AND upper(btrim(vendor_code)) = upper(btrim(v_supplier.supplier_code))
   LIMIT 1;

  -- إنشاء حساب مورد مالي مطابق إن لم يوجد
  IF v_vendor_id IS NULL THEN
    INSERT INTO public.vendors(
      tenant_id, legal_entity_id, vendor_code, name_ar, tax_number, is_active
    ) VALUES (
      v_tenant, v_entity,
      upper(btrim(v_supplier.supplier_code)),
      COALESCE(v_supplier.legal_name, v_supplier.supplier_code),
      v_supplier.tax_number, true
    )
    ON CONFLICT (legal_entity_id, vendor_code) DO UPDATE SET is_active = true
    RETURNING id INTO v_vendor_id;
  END IF;

  UPDATE public.suppliers SET finance_vendor_id = v_vendor_id
   WHERE id = p_supplier_id AND tenant_id = v_tenant;

  RETURN v_vendor_id;
END $$;
REVOKE ALL ON FUNCTION public.resolve_finance_vendor_for_supplier(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_finance_vendor_for_supplier(UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) الجسر: ترحيل فاتورة المورد إلى الذمم الدائنة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_supplier_invoice_to_ap(
  p_invoice_id UUID,
  p_legal_entity_id UUID DEFAULT NULL,
  p_expense_account_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_inv RECORD;
  v_entity UUID;
  v_vendor UUID;
  v_account UUID;
  v_lines JSONB;
  v_ap public.accounts_payable%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO v_inv FROM public.supplier_invoices
   WHERE id = p_invoice_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;

  IF v_inv.ap_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVOICE_ALREADY_POSTED_TO_AP';
  END IF;
  IF v_inv.supplier_id IS NULL THEN
    RAISE EXCEPTION 'INVOICE_HAS_NO_SUPPLIER';
  END IF;

  v_entity := COALESCE(p_legal_entity_id, public.resolve_default_legal_entity());
  IF v_entity IS NULL THEN RAISE EXCEPTION 'NO_LEGAL_ENTITY'; END IF;

  v_vendor := public.resolve_finance_vendor_for_supplier(v_inv.supplier_id, v_entity);
  IF v_vendor IS NULL THEN RAISE EXCEPTION 'FINANCE_VENDOR_UNRESOLVED'; END IF;

  -- حساب المصروف: الوسيط ← حساب سطر الأمر ← أول حساب مصروف يسمح بالترحيل
  v_account := p_expense_account_id;
  IF v_account IS NULL THEN
    SELECT pli.expense_account_id INTO v_account
    FROM public.invoice_line_items ili
    JOIN public.po_line_items pli ON pli.id = ili.po_line_item_id
    WHERE ili.invoice_id = p_invoice_id AND ili.tenant_id = v_tenant
      AND pli.expense_account_id IS NOT NULL
    LIMIT 1;
  END IF;
  IF v_account IS NULL THEN
    SELECT id INTO v_account FROM public.chart_of_accounts
     WHERE legal_entity_id = v_entity
       AND account_type = 'Expense'
       AND COALESCE(is_active, true)
       AND COALESCE(allow_posting, true)
       AND NOT COALESCE(is_control_account, false)
     ORDER BY code
     LIMIT 1;
  END IF;
  IF v_account IS NULL THEN RAISE EXCEPTION 'NO_EXPENSE_ACCOUNT_AVAILABLE'; END IF;

  -- بناء سطور فاتورة AP من سطور فاتورة المورد
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'account_id', v_account,
           'description', COALESCE(ili.description, ili.item_code, 'بند فاتورة'),
           'quantity', COALESCE(ili.quantity, 1),
           'unit_price', COALESCE(ili.unit_price, 0),
           'line_amount', COALESCE(ili.total_price, COALESCE(ili.quantity,1) * COALESCE(ili.unit_price,0)),
           'tax_amount', 0,
           'total_amount', COALESCE(ili.total_price, COALESCE(ili.quantity,1) * COALESCE(ili.unit_price,0))
         )), '[]'::jsonb)
  INTO v_lines
  FROM public.invoice_line_items ili
  WHERE ili.invoice_id = p_invoice_id AND ili.tenant_id = v_tenant;

  -- فاتورة بلا سطور: سطر واحد بإجمالي المبلغ قبل الضريبة
  IF v_lines = '[]'::jsonb THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'account_id', v_account,
      'description', 'فاتورة مورد ' || COALESCE(v_inv.invoice_number, ''),
      'quantity', 1,
      'unit_price', COALESCE(v_inv.amount_before_tax, v_inv.total_amount, 0),
      'line_amount', COALESCE(v_inv.amount_before_tax, v_inv.total_amount, 0),
      'tax_amount', COALESCE(v_inv.tax_amount, 0),
      'total_amount', COALESCE(v_inv.total_amount, 0)
    ));
  END IF;

  v_ap := public.create_ap_invoice_with_lines(
    v_entity,
    v_vendor,
    v_inv.invoice_number,
    v_inv.invoice_date,
    v_inv.payment_due_date,
    COALESCE(v_inv.currency_code, 'IQD')::CHAR(3),
    1,
    'مُرحَّلة تلقائياً من بوابة المشتريات',
    v_lines
  );

  UPDATE public.supplier_invoices
     SET ap_invoice_id = v_ap.id, ap_posted_at = NOW(), ap_post_error = NULL
   WHERE id = p_invoice_id AND tenant_id = v_tenant;

  BEGIN
    PERFORM public.log_procurement_audit_event(
      'invoice_posted_to_ap', 'supplier_invoice', p_invoice_id, NULL, NULL,
      jsonb_build_object('ap_invoice_id', v_ap.id, 'legal_entity_id', v_entity, 'vendor_id', v_vendor)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_ap.id;
END $$;
REVOKE ALL ON FUNCTION public.post_supplier_invoice_to_ap(UUID,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_supplier_invoice_to_ap(UUID,UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) اعتماد الفاتورة يُرحّلها تلقائياً إلى AP
--    (نفس التوقيع — لا كسر لأي عقد قائم)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_invoice_for_payment(
  p_invoice_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_inv RECORD;
  v_err TEXT;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['finance','admin']::TEXT[]);

  SELECT * INTO v_inv FROM public.supplier_invoices
   WHERE id = p_invoice_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  IF v_inv.duplicate_status = 'suspected_duplicate' THEN RAISE EXCEPTION 'DUPLICATE_INVOICE_REVIEW_REQUIRED'; END IF;
  IF v_inv.status NOT IN ('matched','tolerance') THEN RAISE EXCEPTION 'INVOICE_NOT_READY_FOR_APPROVAL'; END IF;

  UPDATE public.supplier_invoices
     SET status = 'approved', approved_by = auth.uid(), approved_at = NOW(), updated_at = NOW()
   WHERE id = p_invoice_id AND tenant_id = v_tenant;

  PERFORM public.log_invoice_audit(
    p_invoice_id, 'invoice_approved', v_inv.status, 'approved',
    to_jsonb(v_inv), jsonb_build_object('notes', p_notes), p_notes
  );

  -- ✅ الجديد: ترحيل تلقائي إلى الذمم الدائنة.
  -- لا نُسقط الاعتماد إن فشل الترحيل — نسجّل السبب ليعالجه المحاسب.
  BEGIN
    PERFORM public.post_supplier_invoice_to_ap(p_invoice_id, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    UPDATE public.supplier_invoices SET ap_post_error = v_err
     WHERE id = p_invoice_id AND tenant_id = v_tenant;
  END;
END $$;
REVOKE ALL ON FUNCTION public.approve_invoice_for_payment(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_invoice_for_payment(UUID,TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) View: حالة ترحيل الفواتير إلى المالية
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.procurement_invoice_ap_status
WITH (security_invoker = true) AS
SELECT
  si.id AS invoice_id,
  si.tenant_id,
  si.invoice_number,
  si.supplier_id,
  s.legal_name AS supplier_name,
  si.status AS invoice_status,
  si.total_amount,
  si.currency_code,
  si.ap_invoice_id,
  ap.invoice_number AS ap_invoice_number,
  ap.status AS ap_status,
  si.ap_posted_at,
  (si.ap_invoice_id IS NOT NULL) AS is_posted_to_ap,
  si.ap_post_error,
  si.invoice_date,
  si.payment_due_date
FROM public.supplier_invoices si
LEFT JOIN public.suppliers s ON s.id = si.supplier_id
LEFT JOIN public.accounts_payable ap ON ap.id = si.ap_invoice_id
WHERE si.tenant_id = public.current_user_tenant_id()
ORDER BY si.invoice_date DESC, si.created_at DESC;
GRANT SELECT ON public.procurement_invoice_ap_status TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.post_supplier_invoice_to_ap(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.resolve_finance_vendor_for_supplier(uuid,uuid)') IS NULL
     OR to_regclass('public.procurement_invoice_ap_status') IS NULL
  THEN
    RAISE EXCEPTION '0262 failed: procurement→finance AP bridge objects missing';
  END IF;
  RAISE NOTICE '✅ 0262: procurement → finance AP bridge applied';
END $$;
