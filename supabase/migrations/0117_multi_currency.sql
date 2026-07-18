-- =============================================================================
-- 0117_multi_currency.sql — DEPRECATED / SUPERSEDED
-- =============================================================================
-- التاريخ الأصلي: كان ينشئ currencies(id UUID, code, exchange_rate...)
-- القرار العلاجي (18 يوليو 2026): هذا التعريف القديم متعارض مع التصميم IFRS
-- الصحيح في 0126_finance_multi_entity_foundation.sql الذي ينشئ:
--   currencies(code CHAR(3) PK, name, symbol, decimal_places, is_active)
-- 
-- لتجنب تعارض المخطط وتسهيل فحص العقود order-aware، تم تحويل هذا الملف
-- إلى NO-OP مع توثيق واضح. الإنشاء الحقيقي يتم في 0126.
-- 
-- ملاحظة: لو كان هناك بيئة بها بيانات قديمة من هذا الجدول، فإن 0126
-- يقوم بـ DROP TABLE IF EXISTS public.currencies CASCADE ثم إعادة الإنشاء
-- بالشكل الصحيح، مع إعادة زرع العملات الأساسية (IQD, USD, SAR, EUR).
-- =============================================================================

-- No operation — superseded by 0126. Kept for migration history continuity.
DO $$
BEGIN
  RAISE NOTICE '0117_multi_currency.sql is deprecated, currencies will be created in 0126';
END
$$;
