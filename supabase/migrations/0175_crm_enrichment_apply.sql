-- ============================================================================
-- Kyvzon — 0175_crm_enrichment_apply.sql
-- توصيل إثراء البيانات الحقيقي (Clearbit / Apollo) — دالة تطبيق النتائج.
--
-- السياق: crm_enrich_account (0165) تعلّم الحساب 'simulated'. هذا migration
--   يضيف دالة crm_apply_enrichment التي تكتب البيانات المُثراة الفعلية القادمة
--   من المزوّد (عبر Edge Function crm-enrich-account) على الحساب، وتضع
--   enrichment_status='enriched'. لا تكتب فوق قيمة موجودة إلا إن كانت فارغة
--   (لا نطمس بيانات أدخلها المستخدم يدوياً — الإثراء يملأ الفراغات فقط).
--
-- تُستدعى من service role (الوسيط) بعد جلب البيانات من المزوّد.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crm_apply_enrichment(
  p_account_id     UUID,
  p_provider       TEXT,
  p_industry       TEXT DEFAULT NULL,
  p_employee_count INTEGER DEFAULT NULL,
  p_annual_revenue NUMERIC DEFAULT NULL,
  p_website        TEXT DEFAULT NULL,
  p_linkedin_url   TEXT DEFAULT NULL,
  p_country        TEXT DEFAULT NULL,
  p_city           TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_accounts WHERE id = p_account_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: account'; END IF;

  -- الإثراء يملأ الفراغات فقط (COALESCE يحفظ قيمة المستخدم إن وُجدت)
  UPDATE public.crm_accounts SET
    industry       = COALESCE(NULLIF(industry, ''), p_industry),
    employee_count = COALESCE(employee_count, p_employee_count),
    annual_revenue = COALESCE(annual_revenue, p_annual_revenue),
    website        = COALESCE(NULLIF(website, ''), p_website),
    linkedin_url   = COALESCE(NULLIF(linkedin_url, ''), p_linkedin_url),
    country        = COALESCE(NULLIF(country, ''), p_country),
    city           = COALESCE(NULLIF(city, ''), p_city),
    enrichment_status = 'enriched',
    enrichment_provider = p_provider,
    enriched_at = NOW(),
    updated_at = NOW()
  WHERE id = p_account_id;

  INSERT INTO public.crm_audit_log (tenant_id, entity_type, entity_id, action, actor_id, details)
  VALUES (v_tenant, 'account', p_account_id, 'enrich', auth.uid(),
          jsonb_build_object('provider', p_provider, 'mode', 'live'));
END $$;

-- confirm/apply تُستدعى من service role فقط (الوسيط) — لا نمنحها لـ authenticated
-- (الواجهة تستدعي الوسيط، والوسيط يستدعي هذه الدالة بمفتاح الخدمة)

DO $$
BEGIN
  IF to_regprocedure('public.crm_apply_enrichment(uuid,text,text,integer,numeric,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAILED: crm_apply_enrichment missing';
  END IF;
  RAISE NOTICE '✅ 0175: تطبيق إثراء البيانات (Clearbit/Apollo) جاهز';
END $$;

-- ============================================================================
-- نهاية 0175 — توصيل إثراء البيانات على مستوى المخطط.
-- ============================================================================
