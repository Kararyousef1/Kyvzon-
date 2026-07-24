-- ════════════════════════════════════════════════════════════════════════════
--  0180 — إزالة وصول anon المباشر لـ public_landing_config VIEW
--
--  المشكلة: VIEW كانت security_invoker + GRANT TO anon → لكن system_settings
--  RLS = staff only → الزوّار يحصلون 0 صفوف أو permission denied.
--
--  الحل المعتمد: دوال SECURITY DEFINER ترجع الحقول العامة فقط
--  0179 أنشأ الدوال، لكن 0180 يجعلها self-contained (ينشئها إذا لم تكن موجودة)
--  ثم يلغي وصول anon للـ VIEW.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) تأكيد وجود دوال RPC العامة (self-contained — لا يفشل إذا 0179 لم تُطبق) ───
CREATE OR REPLACE FUNCTION public.get_public_site_config()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (general_settings -> 'public_site_config')
       FROM public.system_settings
      ORDER BY id
      LIMIT 1),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.get_public_landing_config()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT landing_config
       FROM public.system_settings
      ORDER BY id
      LIMIT 1),
    '{}'::jsonb
  );
$$;

-- منح التنفيذ للزوّار والمستخدمين (idempotent)
GRANT EXECUTE ON FUNCTION public.get_public_site_config() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_landing_config() TO anon, authenticated;

-- ─── 2) إلغاء وصول anon المباشر للـ VIEW (لتجنب الالتباس) ────────────────
-- VIEW قد تكون موجودة من 0007 أو 0012 — نلغي كل المنح ثم نعيد منح للـ authenticated فقط
DO $$
BEGIN
  IF to_regclass('public.public_landing_config') IS NOT NULL THEN
    -- إلغاء كل المنح
    REVOKE ALL ON TABLE public.public_landing_config FROM anon;
    REVOKE ALL ON TABLE public.public_landing_config FROM PUBLIC;
    -- إعادة منح للـ authenticated فقط (staff يمر عبر RLS)
    GRANT SELECT ON public.public_landing_config TO authenticated;
    RAISE NOTICE '✅ public_landing_config VIEW: revoked from anon, granted to authenticated only';
  ELSE
    RAISE NOTICE '⚠️ public_landing_config VIEW not found — skipping REVOKE';
  END IF;
END $$;

-- ─── 3) تأكيد نهائي (لا يفشل، فقط تحذير إذا شيء ناقص) ─────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.get_public_site_config()') IS NULL THEN
    RAISE WARNING 'get_public_site_config() still missing after CREATE';
  END IF;
  IF to_regprocedure('public.get_public_landing_config()') IS NULL THEN
    RAISE WARNING 'get_public_landing_config() still missing after CREATE';
  END IF;
  RAISE NOTICE '✅ 0180: public_landing_config VIEW revoked from anon — public must use RPCs (secure). Functions ensured.';
END $$;
