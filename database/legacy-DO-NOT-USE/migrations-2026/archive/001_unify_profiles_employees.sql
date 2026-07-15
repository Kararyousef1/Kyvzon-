-- ============================================================================
-- Migration 001: توحيد حسابات المستخدمين
-- إصلاح مشكلة تضارب profiles و employees و trigger handle_new_user
-- ============================================================================

-- 1. إصلاح دالة handle_new_user لتعمل بشكل صحيح مع البيانات الوصفية الكاملة
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_full_name TEXT;
  v_role TEXT;
  v_employee_code TEXT;
  v_attempt INT := 0;
BEGIN
  -- قراءة البيانات الوصفية مع قيم افتراضية
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email,
    'مستخدم جديد'
  );
  
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    SPLIT_PART(v_full_name, ' ', 1),
    v_full_name
  );
  
  v_last_name := COALESCE(
    NEW.raw_user_meta_data->>'last_name',
    SUBSTRING(v_full_name FROM LENGTH(SPLIT_PART(v_full_name, ' ', 1)) + 2),
    ''
  );
  
  v_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    'employee'
  );

  -- إنشاء سجل في profiles
  INSERT INTO public.profiles (id, full_name, email, role, status, created_at, updated_at)
  VALUES (NEW.id, v_full_name, NEW.email, v_role, 'active', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET 
    full_name = EXCLUDED.full_name, 
    email = EXCLUDED.email, 
    role = EXCLUDED.role, 
    updated_at = NOW();

  -- توليد employee_code فريد باستخدام تسلسل رقمي
  LOOP
    v_employee_code := 'EMP-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(CAST(floor(random() * 99999 + 1) AS TEXT), 5, '0');
    
    BEGIN
      INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role, is_active)
      VALUES (NEW.id, v_employee_code, v_first_name, v_last_name, NEW.email, v_role, true)
      ON CONFLICT (user_id) DO UPDATE SET 
        first_name = EXCLUDED.first_name, 
        last_name = EXCLUDED.last_name, 
        email = EXCLUDED.email, 
        is_active = true;
      EXIT; -- نجاح، نخرج من الحلقة
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 10 THEN
        -- بعد 10 محاولات، نستخدم timestamp لضمان الفريدية
        v_employee_code := 'EMP-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS');
        INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role, is_active)
        VALUES (NEW.id, v_employee_code, v_first_name, v_last_name, NEW.email, v_role, true)
        ON CONFLICT (user_id) DO UPDATE SET 
          first_name = EXCLUDED.first_name, 
          last_name = EXCLUDED.last_name, 
          email = EXCLUDED.email, 
          is_active = true;
        EXIT;
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. إعادة إنشاء المشغل ليعمل بشكل موثوق
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. إنشاء دالة لترقية المستخدمين الحاليين (لمن ليس لديهم سجل)
CREATE OR REPLACE FUNCTION public.fix_missing_users()
RETURNS TABLE(user_id UUID, status TEXT) AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    BEGIN
      -- محاكاة trigger
      PERFORM public.handle_new_user();
      
      user_id := r.id;
      status := 'تم الإصلاح';
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      user_id := r.id;
      status := 'فشل: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. إضافة عمود user_id إلى جدول profiles (لضمان الربط مع auth.users)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- تحديث حقل auth_user_id من id (لأن id هو نفسه user_id في النظام الحالي)
UPDATE public.profiles SET auth_user_id = id WHERE auth_user_id IS NULL;