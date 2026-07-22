-- ============================================================================
-- Kyvzon — 0173_crm_finance_link.sql
-- بوابة CRM — الربط المالي: صفقة فائزة → عميل مالي (customers) تلقائياً.
--
-- السياق: عند فوز صفقة، تُحوَّل جهة الحساب في CRM إلى عميل، وترتفع LTV (منجز
--   في 0166). هذا migration يضيف الربط بالنظام المالي: إنشاء/ربط سجل في جدول
--   customers المالي (AR) واستخدام الكيان القانوني الافتراضي (code='DEFAULT').
--
-- التصميم الآمن:
--   - إن لم يوجد كيان قانوني افتراضي → لا يفشل، يترك finance_customer_id = NULL
--     (توافق عكسي — الصفقة تُغلق بنجاح على أي حال).
--   - idempotent: إن كان الحساب مربوطاً مسبقاً بعميل مالي، لا يُكرِّر.
--   - customer_code فريد يُشتق من اسم الحساب + جزء من المعرّف.
--
-- الدالة: crm_link_deal_to_finance(deal_id) — تُستدعى تلقائياً من crm_close_deal
--   عند الفوز، أو يدوياً من الواجهة.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crm_link_deal_to_finance(p_deal_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_account UUID; v_existing UUID; v_entity UUID;
  v_acc_name TEXT; v_email TEXT; v_phone TEXT; v_customer UUID; v_code TEXT;
BEGIN
  SELECT tenant_id, account_id, finance_customer_id
    INTO v_tenant, v_account, v_existing
  FROM public.crm_deals WHERE id = p_deal_id;

  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  -- إن كان مربوطاً مسبقاً → أعده (idempotent)
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  -- لا حساب مرتبط → لا شيء نربطه
  IF v_account IS NULL THEN RETURN NULL; END IF;

  -- الكيان القانوني الافتراضي للمستأجر (إن غاب، لا نفشل)
  SELECT id INTO v_entity FROM public.legal_entities
    WHERE tenant_id = v_tenant AND code = 'DEFAULT' LIMIT 1;
  IF v_entity IS NULL THEN
    SELECT id INTO v_entity FROM public.legal_entities WHERE tenant_id = v_tenant ORDER BY created_at LIMIT 1;
  END IF;
  IF v_entity IS NULL THEN
    -- لا كيان قانوني بعد → نترك الربط لاحقاً بلا فشل
    RETURN NULL;
  END IF;

  SELECT name, phone INTO v_acc_name, v_phone FROM public.crm_accounts WHERE id = v_account;
  -- بريد جهة الاتصال الأساسية للصفقة (إن وُجدت)
  SELECT c.email INTO v_email
  FROM public.crm_deals d
  LEFT JOIN public.crm_contacts c ON c.id = d.primary_contact_id
  WHERE d.id = p_deal_id;

  -- عميل مالي قائم بنفس الاسم على هذا الكيان؟ (تجنّب التكرار)
  SELECT id INTO v_customer FROM public.customers
    WHERE legal_entity_id = v_entity AND name_ar = COALESCE(v_acc_name, 'عميل CRM') LIMIT 1;

  IF v_customer IS NULL THEN
    -- كود فريد: CRM- + أول 6 من معرّف الحساب
    v_code := 'CRM-' || upper(substr(replace(v_account::text, '-', ''), 1, 8));
    INSERT INTO public.customers (
      tenant_id, legal_entity_id, customer_code, name_ar, email, phone, currency_code, is_active
    ) VALUES (
      v_tenant, v_entity, v_code, COALESCE(v_acc_name, 'عميل CRM'), v_email, v_phone, 'IQD', true
    )
    ON CONFLICT (legal_entity_id, customer_code) DO NOTHING
    RETURNING id INTO v_customer;

    -- إن حدث تعارض على الكود، اجلب الموجود
    IF v_customer IS NULL THEN
      SELECT id INTO v_customer FROM public.customers
        WHERE legal_entity_id = v_entity AND customer_code = v_code LIMIT 1;
    END IF;
  END IF;

  -- اربط الصفقة بالعميل المالي
  UPDATE public.crm_deals SET finance_customer_id = v_customer, updated_at = NOW()
    WHERE id = p_deal_id;

  -- سجّل في الجدول الزمني للحساب
  INSERT INTO public.crm_activities_timeline
    (tenant_id, account_id, activity_type, direction, title, body, logged_via, created_by)
  VALUES (v_tenant, v_account, 'system', 'internal',
          'ربط بالنظام المالي',
          format('أُنشئ/رُبط عميل مالي (customer_code من الحساب) للصفقة الفائزة.'), 'auto', auth.uid());

  RETURN v_customer;
END $$;

-- تحديث crm_close_deal ليستدعي الربط المالي تلقائياً عند الفوز.
-- (نعيد تعريف الدالة كاملةً — نسخة 0166 + سطر الربط المالي عند الفوز.)
CREATE OR REPLACE FUNCTION public.crm_close_deal(
  p_deal_id         UUID,
  p_outcome         TEXT,
  p_loss_reason_id  UUID    DEFAULT NULL,
  p_loss_competitor TEXT    DEFAULT NULL,
  p_loss_learning   TEXT    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_from UUID; v_amount NUMERIC; v_account UUID; v_close_stage UUID; v_pipeline UUID;
BEGIN
  IF p_outcome NOT IN ('won','lost') THEN
    RAISE EXCEPTION 'INVALID: outcome must be won or lost';
  END IF;

  SELECT tenant_id, stage_id, amount, account_id, pipeline_id
    INTO v_tenant, v_from, v_amount, v_account, v_pipeline
  FROM public.crm_deals WHERE id = p_deal_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  IF p_outcome = 'lost' AND p_loss_reason_id IS NULL THEN
    RAISE EXCEPTION 'LOSS_REASON_REQUIRED: توثيق سبب الخسارة إلزامي';
  END IF;

  SELECT id INTO v_close_stage FROM public.crm_stages
    WHERE pipeline_id = v_pipeline AND stage_type = p_outcome
    ORDER BY sort_order LIMIT 1;

  IF p_outcome = 'won' THEN
    UPDATE public.crm_deals
      SET status = 'won', probability = 100, won_at = NOW(),
          stage_id = COALESCE(v_close_stage, stage_id),
          last_stage_change_at = NOW(), updated_at = NOW()
      WHERE id = p_deal_id;

    IF v_account IS NOT NULL THEN
      UPDATE public.crm_accounts
        SET lifetime_value = lifetime_value + COALESCE(v_amount, 0),
            account_type = 'customer',
            last_deal_at = NOW(),
            first_deal_at = COALESCE(first_deal_at, NOW()),
            updated_at = NOW()
        WHERE id = v_account;

      INSERT INTO public.crm_activities_timeline
        (tenant_id, account_id, activity_type, direction, title, body, logged_via, created_by)
      VALUES (v_tenant, v_account, 'deal', 'internal',
              'فوز بصفقة',
              format('تم كسب صفقة بقيمة %s', COALESCE(v_amount, 0)), 'auto', auth.uid());
    END IF;

    -- 🆕 الربط المالي التلقائي (آمن — لا يفشل إن غاب الكيان القانوني)
    BEGIN
      PERFORM public.crm_link_deal_to_finance(p_deal_id);
    EXCEPTION WHEN OTHERS THEN
      -- لا نُفشل إغلاق الصفقة بسبب الربط المالي (fire-and-forget)
      RAISE NOTICE 'finance link skipped: %', SQLERRM;
    END;
  ELSE
    UPDATE public.crm_deals
      SET status = 'lost', probability = 0, lost_at = NOW(),
          loss_reason_id = p_loss_reason_id, loss_competitor = p_loss_competitor,
          loss_learning = p_loss_learning,
          stage_id = COALESCE(v_close_stage, stage_id),
          last_stage_change_at = NOW(), updated_at = NOW()
      WHERE id = p_deal_id;

    IF v_account IS NOT NULL THEN
      INSERT INTO public.crm_activities_timeline
        (tenant_id, account_id, activity_type, direction, title, logged_via, created_by)
      VALUES (v_tenant, v_account, 'deal', 'internal', 'خسارة صفقة', 'auto', auth.uid());
    END IF;
  END IF;

  IF v_close_stage IS NOT NULL AND v_close_stage <> v_from THEN
    INSERT INTO public.crm_deal_stage_history (tenant_id, deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (v_tenant, p_deal_id, v_from, v_close_stage, auth.uid());
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.crm_link_deal_to_finance(UUID) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.crm_link_deal_to_finance(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: crm_link_deal_to_finance missing';
  END IF;
  RAISE NOTICE '✅ 0173: الربط المالي للصفقة الفائزة جاهز (crm_link_deal_to_finance + crm_close_deal محدّثة)';
END $$;

-- ============================================================================
-- نهاية 0173 — الربط المالي الداخلي للصفقة الفائزة مكتمل.
-- ============================================================================
