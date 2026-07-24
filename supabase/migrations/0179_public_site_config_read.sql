-- ════════════════════════════════════════════════════════════════════════════
--  0179 — قراءة إعدادات الموقع العام للزوّار (public_site_config)
--
--  المشكلة: system_settings محميّ بالكامل عن anon (صحيح أمنياً)، لكن صفحة
--  الهبوط تحتاج قراءة public_site_config (ألوان/خطوط/نصوص عامة، بلا أسرار).
--
--  الحل: دالة SECURITY DEFINER تُرجع فقط حقل public_site_config من الصف
--  المفرد لـ system_settings — بلا أي بيانات حسّاسة أخرى. متاحة للجميع (anon
--  + authenticated). هذا لا يفتح الجدول، بل يكشف الحقل العام فقط.
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

-- متاحة للزوّار والمستخدمين المصادَقين (تكشف الإعدادات العامة فقط)
GRANT EXECUTE ON FUNCTION public.get_public_site_config() TO anon, authenticated;

-- ─── تأكيد ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.get_public_site_config()') IS NULL THEN
    RAISE EXCEPTION 'FAILED: get_public_site_config function missing';
  END IF;
  RAISE NOTICE '✅ 0179: قراءة إعدادات الموقع العام للزوّار جاهزة (get_public_site_config)';
END $$;
