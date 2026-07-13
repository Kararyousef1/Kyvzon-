-- =============================================================
-- سكريبت الإعداد الكامل لقاعدة بيانات النظام
-- شغّل هذا الملف في Supabase Dashboard > SQL Editor
-- =============================================================

-- 1. إنشاء جدول users (مدمج مع auth.users)
-- (auth.users يتم إنشاؤه تلقائياً بواسطة Supabase)

-- 2. إنشاء جدول البروفايلات (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  department TEXT,
  position TEXT,
  phone TEXT,
  location TEXT,
  profile_image TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  rank TEXT NOT NULL DEFAULT 'employee',
  manufacturing_dept TEXT NOT NULL DEFAULT 'syrups',
  manager_id UUID REFERENCES public.profiles(id),
  supervisor_id UUID REFERENCES public.profiles(id),
  department_manager_id UUID REFERENCES public.profiles(id),
  shift TEXT NOT NULL DEFAULT 'all',
  passcode TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  is_verified BOOLEAN DEFAULT true,
  gatekeeper_type TEXT DEFAULT 'both',
  can_manage_breaks BOOLEAN DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. إنشاء جدول إعدادات النظام
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  landing_config JSONB DEFAULT '{}'::jsonb,
  general_settings JSONB DEFAULT '{}'::jsonb,
  ai_settings JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. تفعيل Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 5. سياسات الأمان
-- المستخدم يقرأ ملفه فقط
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- المديرين و HR يقرأون الكل
DROP POLICY IF EXISTS "HR and Admin can view all" ON public.profiles;
CREATE POLICY "HR and Admin can view all"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'developer'))
  );

-- everyone can read system_settings
DROP POLICY IF EXISTS "Everyone can read system settings" ON public.system_settings;
CREATE POLICY "Everyone can read system settings"
  ON public.system_settings FOR SELECT
  USING (true);

-- admins can manage system_settings
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings"
  ON public.system_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 6. إنشاء المستخدمين التجريبيين في auth.users
-- استخدم هذا الكود إذا أردت إنشاء المستخدمين عبر API (نوصي به)
-- إذا لم تنجح API، استخدم Supabase Dashboard > Authentication > Add User يدوياً

-- 7. إدراج إعدادات الصفحة الرئيسية
INSERT INTO public.system_settings (id, landing_config, general_settings, ai_settings, updated_at)
VALUES ('singleton', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- 8. إنشاء باقي الجداول المطلوبة
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  severity TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  reported_by UUID REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. إنشاء دالة لإنشاء المستخدمين (يتم استدعاؤها من التطبيق)
CREATE OR REPLACE FUNCTION public.create_user_with_profile(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_department TEXT,
  p_position TEXT
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- إنشاء المستخدم في auth.users عبر API (يتم من التطبيق)
  -- هذه الدالة تحتاج خدمة Edge Function مع service_role key
  
  -- إدراج البروفايل
  INSERT INTO public.profiles (id, full_name, email, role, department, position, status, rank)
  VALUES (gen_random_uuid(), p_full_name, p_email, p_role, p_department, p_position, 'active', 'employee')
  RETURNING id INTO v_user_id;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- هام: بعد تشغيل هذا السكريبت
-- اذهب إلى Supabase Dashboard > Authentication > Users
-- وأضف المستخدمين التاليين يدوياً (أو استخدم Add User):
--   1. admin@kayan.hr / admin123
--   2. hr@kayan.hr / hr123
--   3. employee@kayan.hr / emp123
--   4. gatekeeper@kayan.hr / gate123
--   5. dev@kayan.hr / dev123
-- ثم ارجع إلى التطبيق وسجل الدخول
-- =============================================================