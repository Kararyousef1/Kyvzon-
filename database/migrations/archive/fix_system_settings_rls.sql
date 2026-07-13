-- =====================================================================
-- إصلاح تحذير Supabase Security Advisor:
-- "policy_exists_rls_disabled" على الجدول public.system_settings
--
-- السبب: الجدول يحتوي على سياسات (Policies) لكن خاصية RLS غير مفعّلة،
-- مما يجعل السياسات تُتجاهل ويصبح الجدول مكشوفاً للقراءة/الكتابة العامة.
--
-- طريقة الاستخدام:
-- انسخ هذا الملف وشغّله في:
-- Supabase Dashboard > SQL Editor > New Query > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. (اختياري - للأمان) التأكد من وجود الجدول بالبنية الصحيحة.
--    إذا كان الجدول موجوداً بالفعل، هذا الأمر لن يغيّره.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  landing_config   JSONB DEFAULT '{}'::jsonb,
  general_settings JSONB DEFAULT '{}'::jsonb,
  ai_settings      JSONB DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 1. الحل الأساسي: تفعيل Row Level Security على الجدول.
--    هذا السطر وحده هو الذي يزيل التحذير.
-- ---------------------------------------------------------------------
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. حذف السياسات القديمة (إن وُجدت) لتجنّب التعارض عند إعادة التشغيل.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Everyone can read system settings"      ON public.system_settings;
DROP POLICY IF EXISTS "Admins can manage system settings"      ON public.system_settings;

-- ---------------------------------------------------------------------
-- 3. سياسات الأمان الصحيحة:
--    - القراءة (SELECT): متاحة للجميع لأن landing_config مطلوب
--      لعرض الصفحة الرئيسية العامة قبل تسجيل الدخول.
--    - الكتابة/التعديل (ALL): محصورة على المدير (admin) فقط.
-- ---------------------------------------------------------------------

-- السماح للجميع بقراءة الإعدادات (مطلوب لصفحة الهبوط العامة)
CREATE POLICY "Everyone can read system settings"
  ON public.system_settings
  FOR SELECT
  USING (true);

-- السماح للمدير فقط بالإضافة/التعديل/الحذف
CREATE POLICY "Admins can manage system settings"
  ON public.system_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- =====================================================================
-- ملاحظة أمنية مهمة:
-- إذا كانت بياناتك تحتوي على معلومات حساسة جداً في ai_settings
-- (مثل مفاتيح API)، يُفضّل عدم السماح بـ SELECT للجميع، وبدلاً من ذلك
-- فصل الإعدادات الحساسة في جدول منفصل لا يُقرأ إلا من قبل admin.
-- =====================================================================
