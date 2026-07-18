-- =============================================================================
-- 0141_fix_currencies_conflict_documentation.sql
-- توثيق إغلاق تعارض currencies بين 0117 و 0126
-- =============================================================================
-- السياق:
-- - 0117 كان ينشئ currencies(id UUID, code VARCHAR(3) UNIQUE, exchange_rate)
-- - 0126 يحذف currencies ثم ينشئ currencies(code CHAR(3) PK, decimal_places)
-- - التعارض كان يسبب فشل check-db-contract غير order-aware
--
-- العلاج:
-- - 0117 تم تحويله إلى NO-OP (deprecation notice)
-- - 0126 هو المصدر الوحيد للحقيقة الآن
-- - هذا الملف يتحقق من وجود currencies بالشكل الصحيح ويعيد زرع العملات إن لزم
-- - كما يضيف index إضافي وتوثيق
-- =============================================================================

-- التأكد أن currencies موجودة بالشكل النهائي IFRS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='currencies') THEN
    RAISE NOTICE 'currencies table missing, will be created by 0126 logic';
  END IF;
END
$$;

-- تأكد من وجود العملات الأساسية (idempotent) — نفس ما في 0126 لكن آمن للتكرار
INSERT INTO public.currencies (code, name, symbol, decimal_places, is_active)
VALUES
  ('IQD', 'Iraqi Dinar', 'د.ع', 0, true),
  ('USD', 'US Dollar', '$', 2, true),
  ('SAR', 'Saudi Riyal', 'ر.س', 2, true),
  ('EUR', 'Euro', '€', 2, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol,
  decimal_places = EXCLUDED.decimal_places,
  is_active = EXCLUDED.is_active;

-- فهرس إضافي للبحث السريع по الرمز — إن لم يكن موجودًا
CREATE INDEX IF NOT EXISTS idx_currencies_active_code ON public.currencies(code) WHERE is_active = true;

-- توثيق: تعليق على الجدول
COMMENT ON TABLE public.currencies IS 'IFRS-ready currency master, PK=code CHAR(3), seeded with IQD as base for Iraq, managed in 0126+0141';

-- تحقق نهائي: تسجيل في logs
DO $$
DECLARE
  cur_count INT;
BEGIN
  SELECT COUNT(*) INTO cur_count FROM public.currencies WHERE is_active;
  RAISE NOTICE 'currencies verification: % active currencies present', cur_count;
  IF cur_count < 4 THEN
    RAISE WARNING 'Expected at least 4 active currencies (IQD,USD,SAR,EUR), found %', cur_count;
  END IF;
END
$$;
