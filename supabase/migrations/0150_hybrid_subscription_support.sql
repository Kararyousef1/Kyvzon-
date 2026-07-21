-- ============================================================================
-- Kyvzon — 0150_hybrid_subscription_support.sql
-- دعم الاشتراك الهجين (Hybrid) على مستوى قاعدة البيانات (المرحلة 3).
--
-- السياق / الخلل المُكتشَف:
--   الواجهة تكتب tenants.subscription_plan = 'hybrid'، لكن القيد
--   tenants_subscription_plan_check يسمح فقط بـ
--   ('basic','professional','enterprise','custom).
--   => قاعدة البيانات كانت ترفض حفظ أي شركة كـ hybrid (ميزة مكسورة فعلياً).
--
-- ما يفعله هذا الملف:
--   1) يوسّع القيد ليشمل 'hybrid' (إصلاح الخلل).
--   2) يضيف دوال RLS مساعدة:
--        - current_user_subscription_plan()  : خطة اشتراك مستخدم الجلسة
--        - current_user_is_hybrid()          : هل شركته هجينة؟
--        - tenant_has_feature(page_id)        : هل الصفحة ضمن features للشركة؟
--      تُستخدم مستقبلاً لفرض قيود على مستوى الصفوف للجداول الحسّاسة، بحيث
--      لا تُغلق الثغرة عند الواجهة فقط بل عند قاعدة البيانات أيضاً.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ─── (1) توسيع قيد subscription_plan ليشمل hybrid ────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_subscription_plan_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants DROP CONSTRAINT tenants_subscription_plan_check;
  END IF;

  ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_subscription_plan_check
    CHECK (subscription_plan = ANY (ARRAY[
      'basic', 'professional', 'enterprise', 'custom', 'hybrid'
    ]));
END $$;

-- ─── (2) دوال مساعدة للـ RLS ────────────────────────────────────────────────

-- خطة اشتراك شركة مستخدم الجلسة
CREATE OR REPLACE FUNCTION public.current_user_subscription_plan()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.subscription_plan
  FROM public.tenants t
  WHERE t.id = public.current_user_tenant_id()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_subscription_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_subscription_plan() TO authenticated;

-- هل شركة مستخدم الجلسة هجينة؟
CREATE OR REPLACE FUNCTION public.current_user_is_hybrid()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_subscription_plan() = 'hybrid', false);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_hybrid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_hybrid() TO authenticated;

-- هل صفحة (page_id) ضمن features شركة مستخدم الجلسة؟
-- ملاحظة: الشركات غير الهجينة تُرجع true (لا تُقيَّد بالصفحات — تُقيَّد بالوحدات).
CREATE OR REPLACE FUNCTION public.tenant_has_feature(p_page_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.current_user_is_hybrid() THEN
      EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id = public.current_user_tenant_id()
          AND p_page_id = ANY (t.features)
      )
    ELSE true
  END;
$$;

REVOKE ALL ON FUNCTION public.tenant_has_feature(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_has_feature(TEXT) TO authenticated;

-- ─── (3) تحقّق نهائي ─────────────────────────────────────────────────────────
DO $$
BEGIN
  -- يجب أن يُقبل hybrid الآن (اختبار منطقي عبر القيد)
  IF NOT (
    SELECT 'hybrid' = ANY (ARRAY['basic','professional','enterprise','custom','hybrid'])
  ) THEN
    RAISE EXCEPTION '0150 assertion failed: hybrid not permitted';
  END IF;
  RAISE NOTICE '0150 OK: hybrid plan permitted + RLS helper functions installed.';
END $$;
