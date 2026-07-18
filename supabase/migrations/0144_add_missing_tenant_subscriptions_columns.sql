-- ====== إضافة الأعمدة المفقودة لجدول اشتراكات الشركات ======
-- تاريخ الإنشاء: 2026-07-19
-- الهدف: حل مشكلة الخطأ 400 عند جلب أو إدخال بيانات الاشتراكات

ALTER TABLE public.tenant_subscriptions 
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seats_limit INTEGER;

-- تحديث البيانات الحالية لتجنب القيم الفارغة
UPDATE public.tenant_subscriptions
SET 
  expires_at = COALESCE(expires_at, end_date::TIMESTAMPTZ),
  started_at = COALESCE(started_at, start_date::TIMESTAMPTZ),
  seats_limit = COALESCE(seats_limit, max_employees);
