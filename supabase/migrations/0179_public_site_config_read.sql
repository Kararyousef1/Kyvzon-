-- ════════════════════════════════════════════════════════════════════════════
--  0179 — قراءة إعدادات الموقع العام للزوّار (public_site_config + landing_config)
--
--  المشكلة: system_settings محميّ بالكامل عن anon (صحيح أمنياً)، لكن صفحة
--  الهبوط تحتاج قراءة إعدادات العرض العامة (ألوان/خطوط/نصوص/landing) بلا أسرار.
--
--  الحل: دالة SECURITY DEFINER تُرجع فقط الحقول العامة (public_site_config +
--  landing_config) من الصف المفرد لـ system_settings — بلا أي بيانات حسّاسة.
--  متاحة للجميع (anon + authenticated). لا تفتح الجدول، بل تكشف الحقول العامة.
-- ════════════════════════════════════════════════════════════════════════════

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

GRANT EXECUTE ON FUNCTION public.get_public_site_config() TO anon, authenticated;

-- دالة إعدادات صفحة الهبوط (landing_config) — للزوّار أيضاً
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

GRANT EXECUTE ON FUNCTION public.get_public_landing_config() TO anon, authenticated;

-- ─── تأكيد ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.get_public_site_config()') IS NULL
     OR to_regprocedure('public.get_public_landing_config()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: public site config functions missing';
  END IF;
  RAISE NOTICE '✅ 0179: قراءة إعدادات الموقع العام للزوّار جاهزة (get_public_site_config + get_public_landing_config)';
END $$;
