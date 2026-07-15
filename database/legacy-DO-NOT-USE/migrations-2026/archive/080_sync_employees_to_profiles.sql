-- ============================================================================
-- مزامنة بيانات جدول employees مع جدول profiles
-- هذه الملف يحل مشكلة عدم ظهور الحسابات المضافة في جدول employees
-- ============================================================================

-- 1. إنشاء جدول profiles إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'employee',
  department TEXT,
  position TEXT,
  phone TEXT,
  location TEXT DEFAULT '',
  profile_image TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  rank TEXT NOT NULL DEFAULT 'employee',
  manufacturing_dept TEXT DEFAULT 'syrups',
  manager_id UUID REFERENCES public.profiles(id),
  supervisor_id UUID REFERENCES public.profiles(id),
  department_manager_id UUID REFERENCES public.profiles(id),
  shift TEXT NOT NULL DEFAULT 'all',
  passcode TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  is_verified BOOLEAN DEFAULT true,
  gatekeeper_type TEXT DEFAULT 'both',
  gatekeeper_pin TEXT DEFAULT '',
  can_manage_breaks BOOLEAN DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. تفعيل RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. حذف السياسات القديمة وإعادة إنشائها
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "HR and Admin can view all" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "HR and Admin can view all"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'developer'))
  );

-- 4. مزامنة البيانات من employees إلى profiles
INSERT INTO public.profiles (id, full_name, email, role, position, phone, profile_image, status, created_at, updated_at)
SELECT 
  COALESCE(e.user_id, e.id) AS id,
  e.full_name_ar AS full_name,
  COALESCE(e.email, '') AS email,
  CASE 
    WHEN e.role = 'system_admin' THEN 'admin'
    WHEN e.role = 'developer' THEN 'developer'
    ELSE e.role
  END AS role,
  COALESCE(e.position, '') AS position,
  COALESCE(e.phone, '') AS phone,
  COALESCE(e.avatar_url, '') AS profile_image,
  CASE WHEN e.is_active THEN 'active' ELSE 'inactive' END AS status,
  e.created_at,
  e.updated_at
FROM public.employees e
LEFT JOIN public.profiles p ON p.id = COALESCE(e.user_id, e.id)
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 5. إنشاء دالة للمزامنة التلقائية
CREATE OR REPLACE FUNCTION public.sync_employee_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, position, phone, profile_image, status, created_at, updated_at)
  VALUES (
    COALESCE(NEW.user_id, NEW.id),
    NEW.full_name_ar,
    COALESCE(NEW.email, ''),
    CASE 
      WHEN NEW.role = 'system_admin' THEN 'admin'
      WHEN NEW.role = 'developer' THEN 'developer'
      ELSE NEW.role
    END,
    COALESCE(NEW.position, ''),
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.avatar_url, ''),
    CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END,
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    position = EXCLUDED.position,
    phone = EXCLUDED.phone,
    profile_image = EXCLUDED.profile_image,
    status = EXCLUDED.status,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. إنشاء trigger للمزامنة التلقائية عند إدراج أو تحديث في employees
DROP TRIGGER IF EXISTS trg_sync_employee_to_profile ON public.employees;
CREATE TRIGGER trg_sync_employee_to_profile
  AFTER INSERT OR UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_to_profile();

-- 7. التحديث اليدوي لكل الموظفين الموجودين
UPDATE public.profiles p
SET 
  full_name = e.full_name_ar,
  email = COALESCE(e.email, p.email),
  role = CASE 
    WHEN e.role = 'system_admin' THEN 'admin'
    WHEN e.role = 'developer' THEN 'developer'
    ELSE e.role
  END,
  position = COALESCE(e.position, p.position),
  phone = COALESCE(e.phone, p.phone),
  profile_image = COALESCE(e.avatar_url, p.profile_image),
  status = CASE WHEN e.is_active THEN 'active' ELSE 'inactive' END,
  updated_at = NOW()
FROM public.employees e
WHERE p.id = COALESCE(e.user_id, e.id);

RAISE NOTICE '✅ تمت مزامنة بيانات الموظفين مع جدول profiles';